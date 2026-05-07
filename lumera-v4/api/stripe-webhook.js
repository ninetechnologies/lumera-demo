// Webhook Stripe — source de verite pour la creation des reservations.
// Stripe POST ici apres chaque event (checkout.session.completed, expired, etc).
//
// Refactor 2026-05-07 : retire firebase-admin. Le payload resa vient maintenant
// de session.metadata Stripe (plus de pending_reservations Firestore).
// Le serveur s'authentifie comme bot Firebase via email/password (lib/firebaseWebhookAuth).
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
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { getBotDb, getBotAuth, serverTimestamp } from '../lib/firebaseWebhookAuth.js';
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

  // ── Auth bot Firebase (peut throw si env vars manquent) ──────────────
  let db;
  let auth;
  try {
    db = await getBotDb();
    auth = await getBotAuth();
    // Force refresh du token : sur warm Vercel invocations le token Firebase
    // peut etre stale. getIdToken(true) garantit qu'on envoie un token frais
    // avec les requetes Firestore suivantes.
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }
    console.log(`[webhook] auth.currentUser.uid=${auth.currentUser?.uid || 'NULL'} tokenRefreshed=true`);
  } catch (err) {
    console.warn('[webhook] auth bot failed —', err.message);
    // 200 silencieux pour eviter retry Stripe agressifs.
    return res.status(200).json({ ok: true, skipped: 'Auth bot incomplete' });
  }

  // Log audit du event (utile pour debug + conformite compta).
  // Conforme aux rules : hasOnly(['type', 'receivedAt', 'sessionId']).
  try {
    await setDoc(doc(db, 'stripe_events', event.id), {
      type: event.type,
      sessionId: event.data?.object?.id || 'unknown',
      receivedAt: serverTimestamp()
    });
  } catch (e) {
    console.error('[webhook] log event failed', e?.message || e);
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
        // Ignore les autres events (refund, dispute, etc.)
        break;
    }
  } catch (err) {
    console.error(`[webhook] handler ${event.type} failed`, err);
    // 200 quand meme pour eviter retry indefini Stripe (sauf erreur transitive).
    return res.status(200).json({ received: true, warning: err.message });
  }

  return res.status(200).json({ received: true });
}

async function handleCheckoutCompleted(session, db) {
  const sessionId = session.id;
  if (session.payment_status !== 'paid') return; // safety

  // ── Idempotence pre-check ────────────────────────────────────────────
  const processedRef = doc(db, 'stripe_processed_sessions', sessionId);
  const procSnap = await getDoc(processedRef);
  if (procSnap.exists()) {
    console.log(`[webhook] session ${sessionId} deja traitee, skip`);
    return;
  }

  // ── Reconstitue le payload resa depuis session.metadata ──────────────
  const m = session.metadata || {};
  const slotIds = (m.slotIds || '').split(',').filter(Boolean);

  // Verification metadata minimaliste (ne devrait jamais echouer si
  // create-checkout-session a fait son boulot).
  if (!m.prenom || !m.nom || !m.email || !m.prix || !m.acompte || !m.service || !m.duree) {
    console.error(`[webhook] metadata incomplete pour ${sessionId}`, Object.keys(m));
    await sendOrphanAlert({
      sessionId,
      amount: session.amount_total || 0,
      email: session.customer_details?.email || session.customer_email || null
    }).catch(e => console.error('[webhook] orphan alert failed', e));
    // On marque traite pour eviter retry Stripe.
    await setDoc(processedRef, {
      processedAt: serverTimestamp(),
      eventType: 'orphan_metadata_incomplete'
    });
    return;
  }

  // Conforme aux rules /reservations : exactement les 17 fields hasAll/hasOnly,
  // avec types int + bornes attendues. Toute incoherence sera refusee par les rules.
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
    createdAt: serverTimestamp()
  };

  // ── Sequentiel (sans runTransaction) : creer resa puis marquer processed ──
  // L'idempotence est garantie par le pre-check de processedRef ci-dessus +
  // le check d'existence de resaRef. runTransaction posait souci en SDK client
  // Node.js (token d'auth pas propage dans gRPC stream).
  const resaRef = doc(db, 'reservations', sessionId);
  const resaSnap = await getDoc(resaRef);
  if (!resaSnap.exists()) {
    await setDoc(resaRef, resaPayload);
  }
  await setDoc(processedRef, {
    processedAt: serverTimestamp(),
    eventType: 'checkout.session.completed'
  });

  // ── Emails (hors transaction — la resa est deja en base si on arrive ici) ──
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
  // Note : on ne flagge plus emailsFailed sur le doc reservations (pas dans
  // hasOnly autorise par les rules). En cas d'echec, voir Vercel logs.
}

async function handleCheckoutExpired(session, db) {
  const sessionId = session.id;
  // Libere les slots qui avaient ete lockes pour cette session.
  // Les slotIds sont dans session.metadata (CSV), plus dans pending_reservations.
  const slotIdsCsv = session.metadata?.slotIds || '';
  const slotIds = slotIdsCsv.split(',').filter(Boolean);
  if (!slotIds.length) return;

  await Promise.allSettled(
    slotIds.map(id => deleteDoc(doc(db, 'slots', id)))
  );
  console.log(`[webhook] session ${sessionId} expiree, ${slotIds.length} slots liberes`);
}
