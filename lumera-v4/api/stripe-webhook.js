// Webhook Stripe — source de verite pour la creation des reservations.
// Stripe POST ici apres chaque event (checkout.session.completed, expired, etc).
//
// Configuration cote Stripe Dashboard > Developers > Webhooks :
//   - Endpoint : https://<domain>/api/stripe-webhook
//   - Events : checkout.session.completed, checkout.session.expired
//
// Env vars requises :
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET    -> whsec_... (fourni par Stripe a la creation du webhook)
//   FIREBASE_ADMIN_SA
//   RESEND_API_KEY
//   RESEND_FROM              -> ex "Lumera <reservations@lumera-studio.fr>"
//   ADMIN_NOTIFY_EMAIL       -> email admin pour notifs + alertes orphelins

import Stripe from 'stripe';
import { getAdminDb, FieldValue } from '../lib/firebaseAdmin.js';
import { DUREE_LABEL } from '../lib/pricing.js';
import { sendClientConfirmation, sendAdminNotification, sendOrphanAlert } from '../lib/email.js';

// IMPORTANT : desactiver le bodyParser de Vercel pour verifier la signature.
export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !whSecret) {
    // Skip silencieux pour eviter les retry Stripe agressifs et le spam logs.
    // Tant que la config n'est pas complete, on accuse reception sans traiter.
    // Stripe permet de "Resend" l'event depuis le dashboard une fois config OK.
    console.warn('[webhook] Config incomplete (STRIPE_SECRET_KEY ou STRIPE_WEBHOOK_SECRET manquant) — event ignore');
    return res.status(200).json({ ok: true, skipped: 'Config incomplete' });
  }

  const stripe = new Stripe(secret, { apiVersion: '2024-12-18.acacia' });
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    const buf = await rawBody(req);
    event = stripe.webhooks.constructEvent(buf, sig, whSecret);
  } catch (err) {
    console.error('[webhook] signature verification failed', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const db = getAdminDb();

  // Log audit du event (utile pour debug + conformite compta)
  try {
    await db.doc(`stripe_events/${event.id}`).set({
      type: event.type,
      created: event.created,
      receivedAt: FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error('[webhook] log event failed', e);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object, db);
        break;
      case 'checkout.session.expired':
        await handleCheckoutExpired(event.data.object, db);
        break;
      default:
        // ignore silencieusement les autres events
        break;
    }
  } catch (err) {
    console.error(`[webhook] handler ${event.type} failed`, err);
    // On retourne quand meme 200 pour les erreurs internes non-retryables
    // (sinon Stripe va retry indefiniment). Pour les vraies erreurs transientes,
    // retourner 500 ici ferait retry.
    return res.status(200).json({ received: true, warning: err.message });
  }

  return res.status(200).json({ received: true });
}

async function handleCheckoutCompleted(session, db) {
  const sessionId = session.id;

  // ── Idempotence serveur ─────────────────────────────────────────────
  const processedRef = db.doc(`stripe_processed_sessions/${sessionId}`);
  const processedSnap = await processedRef.get();
  if (processedSnap.exists) {
    console.log(`[webhook] session ${sessionId} deja traitee, skip`);
    return;
  }

  // ── Recupere le payload pending ─────────────────────────────────────
  const pendingRef = db.doc(`pending_reservations/${sessionId}`);
  const pendingSnap = await pendingRef.get();
  if (!pendingSnap.exists) {
    console.error(`[webhook] pending_reservations/${sessionId} introuvable — paiement orphelin`);
    await sendOrphanAlert({
      sessionId,
      amount: session.amount_total || 0,
      email: session.customer_details?.email || session.customer_email || null
    }).catch(e => console.error('[webhook] orphan alert failed', e));
    // On marque quand meme traite pour eviter retry Stripe
    await processedRef.set({
      processedAt: FieldValue.serverTimestamp(),
      status: 'orphan',
      amount: session.amount_total || 0
    });
    return;
  }

  const pending = pendingSnap.data();
  const resa = pending.resa || {};
  const slotIds = Array.isArray(pending.slotIds) ? pending.slotIds : [];

  // ── Transaction atomique : marquer processed + creer reservation ────
  const resaRef = db.doc(`reservations/${sessionId}`);

  await db.runTransaction(async (tx) => {
    const proc = await tx.get(processedRef);
    if (proc.exists) return; // double-check in transaction
    const resaExisting = await tx.get(resaRef);
    if (!resaExisting.exists) {
      tx.set(resaRef, {
        ...resa,
        slot: slotIds[0] || null,
        slotIds,
        status: 'confirmed',
        stripeSessionId: sessionId,
        stripePaymentIntent: session.payment_intent || null,
        amountPaid: session.amount_total || null,
        createdAt: FieldValue.serverTimestamp()
      });
    }
    tx.set(processedRef, {
      processedAt: FieldValue.serverTimestamp(),
      reservationId: sessionId,
      amount: session.amount_total || 0,
      status: 'ok'
    });
  });

  // ── Cleanup pending_reservation (on n'en a plus besoin) ─────────────
  try { await pendingRef.delete(); } catch (_) {}

  // ── Emails (hors transaction — si fail, la resa est deja en base) ──
  const dureeLabel = DUREE_LABEL[resa.duree] || resa.duree;
  const emailPayload = {
    ...resa,
    dureeLabel,
    stripeSessionId: sessionId
  };

  const results = await Promise.allSettled([
    sendClientConfirmation(emailPayload),
    sendAdminNotification(emailPayload)
  ]);
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const who = i === 0 ? 'client' : 'admin';
      console.error(`[webhook] email ${who} failed:`, r.reason);
    }
  });

  // Flag dans la resa si un email a rate (pour que l'admin voie un badge)
  const emailsFailed = results.filter(r => r.status === 'rejected').length;
  if (emailsFailed > 0) {
    try {
      await resaRef.update({ emailsFailed, emailsFailedAt: FieldValue.serverTimestamp() });
    } catch (_) {}
  }
}

async function handleCheckoutExpired(session, db) {
  const sessionId = session.id;
  // Libere les slots qui avaient ete lockes pour cette session
  const pendingRef = db.doc(`pending_reservations/${sessionId}`);
  const pendingSnap = await pendingRef.get();
  if (!pendingSnap.exists) return;

  const slotIds = pendingSnap.data().slotIds || [];
  await Promise.allSettled(
    slotIds.map(id => db.doc(`slots/${id}`).delete())
  );
  await pendingRef.delete().catch(() => {});
  console.log(`[webhook] session ${sessionId} expiree, ${slotIds.length} slots liberes`);
}
