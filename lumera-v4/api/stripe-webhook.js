// Webhook Stripe — source de verite pour la creation des reservations.
// Stripe POST ici apres chaque event (checkout.session.completed, expired, etc).
//
// Refactor 2026-05-07 : retire firebase-admin. Le payload resa vient maintenant
// de session.metadata Stripe (plus de pending_reservations Firestore).
// Refactor 2 (idem journee) : le SDK firebase/firestore (gRPC ET lite REST) ne
// propage pas correctement le token Firebase Auth en environnement Node.js
// Vercel serverless. On utilise donc un wrapper REST direct (lib/firestoreRest.js)
// qui sign-in via REST + appelle l'API Firestore avec Authorization: Bearer.
//
// Configuration Stripe Dashboard > Developers > Webhooks :
//   - Endpoint : https://<domain>/api/stripe-webhook
//   - Events : checkout.session.completed, checkout.session.expired
//
// Env vars requises :
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET    -> whsec_... (fourni par Stripe a la creation du webhook)
//   FIREBASE_BOT_EMAIL       -> webhook-bot@lumera-studio.fr
//   FIREBASE_BOT_PASSWORD    -> mot de passe robuste 36 chars
//   RESEND_API_KEY
//   RESEND_FROM              -> ex "Lumera <reservations@lumera-studio.fr>"
//   ADMIN_NOTIFY_EMAIL       -> email admin pour notifs + alertes orphelins

import Stripe from 'stripe';
import { restSet, restExists, restDelete, nowTimestamp } from '../lib/firestoreRest.js';
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

  // ── Log audit du event (utile pour debug + conformite compta) ────────
  // Conforme aux rules : hasOnly(['type', 'receivedAt', 'sessionId']).
  try {
    await restSet('stripe_events', event.id, {
      type: event.type,
      sessionId: event.data?.object?.id || 'unknown',
      receivedAt: nowTimestamp()
    });
  } catch (e) {
    console.error('[webhook] log event failed', e?.message || e);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        await handleCheckoutExpired(event.data.object);
        break;
      default:
        // Ignore les autres events (refund, dispute, etc.)
        break;
    }
  } catch (err) {
    console.error(`[webhook] handler ${event.type} failed`, err);
    return res.status(200).json({ received: true, warning: err.message });
  }

  return res.status(200).json({ received: true });
}

async function handleCheckoutCompleted(session) {
  const sessionId = session.id;
  console.log(`[webhook][handleCheckoutCompleted] start sessionId=${sessionId} payment_status=${session.payment_status}`);
  if (session.payment_status !== 'paid') return; // safety

  // ── Idempotence pre-check ────────────────────────────────────────────
  console.log(`[webhook] step:1 restExists stripe_processed_sessions/${sessionId}`);
  const alreadyProcessed = await restExists('stripe_processed_sessions', sessionId);
  console.log(`[webhook] step:1 result=${alreadyProcessed}`);
  if (alreadyProcessed) {
    console.log(`[webhook] session ${sessionId} deja traitee, skip`);
    return;
  }

  // ── Reconstitue le payload resa depuis session.metadata ──────────────
  const m = session.metadata || {};
  const slotIds = (m.slotIds || '').split(',').filter(Boolean);
  console.log(`[webhook] step:2 metadata keys=${Object.keys(m).join(',')} slotIds.length=${slotIds.length}`);

  // Verification metadata minimaliste.
  if (!m.prenom || !m.nom || !m.email || !m.prix || !m.acompte || !m.service || !m.duree) {
    console.error(`[webhook] metadata incomplete pour ${sessionId}`, Object.keys(m));
    await sendOrphanAlert({
      sessionId,
      amount: session.amount_total || 0,
      email: session.customer_details?.email || session.customer_email || null
    }).catch(e => console.error('[webhook] orphan alert failed', e));
    await restSet('stripe_processed_sessions', sessionId, {
      processedAt: nowTimestamp(),
      eventType: 'orphan_metadata_incomplete'
    });
    return;
  }

  const resaPayload = {
    stripeSessionId: sessionId,
    prenom: m.prenom,
    nom: m.nom,
    email: m.email,
    telephone: m.telephone || '',
    service: m.service,
    duree: m.duree,
    dateISO: m.dateISO,
    startHour: parseInt(m.startHour, 10),
    dureeHours: parseInt(m.dureeHours, 10),
    creneau: m.creneau || '',
    slotIds,
    prix: parseInt(m.prix, 10),
    acompte: parseInt(m.acompte, 10),
    paid: true,
    projet: m.projet || '',
    createdAt: nowTimestamp()
  };

  // ── Cree la resa directement (pas de pre-check : bot n'a pas read access  ──
  // sur /reservations, seul isAdmin lit). Idempotence garantie par 409
  // ALREADY_EXISTS si Stripe envoie un duplicate event en parallele.
  console.log(`[webhook] step:3 restCreate reservations/${sessionId}`);
  try {
    await restSet('reservations', sessionId, resaPayload);
    console.log(`[webhook] step:3 OK`);
  } catch (e) {
    // Si 409 (deja cree par un retry parallele), on continue. Sinon, throw.
    if (String(e?.message || '').includes('409')) {
      console.log(`[webhook] step:3 reservations existe deja (409), skip`);
    } else {
      throw e;
    }
  }
  console.log(`[webhook] step:4 restCreate stripe_processed_sessions/${sessionId}`);
  await restSet('stripe_processed_sessions', sessionId, {
    processedAt: nowTimestamp(),
    eventType: 'checkout.session.completed'
  });
  console.log(`[webhook] step:4 OK — flow complete`);

  // ── Emails ───────────────────────────────────────────────────────────
  const dureeLabel = DUREE_LABEL[m.duree] || m.duree;
  const emailPayload = {
    prenom: m.prenom,
    nom: m.nom,
    email: m.email,
    telephone: m.telephone || '',
    projet: m.projet || '',
    service: m.service,
    duree: m.duree,
    dureeLabel,
    dureeHours: parseInt(m.dureeHours, 10),
    dateISO: m.dateISO,
    dateFR: m.dateFR || '',
    startHour: parseInt(m.startHour, 10),
    creneau: m.creneau || '',
    prix: parseInt(m.prix, 10),
    acompte: parseInt(m.acompte, 10),
    solde: parseInt(m.solde || (parseInt(m.prix, 10) - parseInt(m.acompte, 10)), 10),
    slotIds,
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
}

async function handleCheckoutExpired(session) {
  const sessionId = session.id;
  // Libere les slots qui avaient ete lockes pour cette session.
  const slotIdsCsv = session.metadata?.slotIds || '';
  const slotIds = slotIdsCsv.split(',').filter(Boolean);
  if (!slotIds.length) return;

  await Promise.allSettled(
    slotIds.map(id => restDelete('slots', id))
  );
  console.log(`[webhook] session ${sessionId} expiree, ${slotIds.length} slots liberes`);
}
