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
import { restSet, restExists, restDelete, restRemoveField, nowTimestamp } from '../lib/firestoreRest.js';
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
    // FIX P0 #3 : retourner 500 si le handler plante. Stripe retry l'event,
    // ce qui est le comportement souhaite (sinon resa perdue silencieusement
    // si Firestore plante). Stripe abandonne apres 3 jours de retries failed.
    // L'idempotence est garantie par stripe_processed_sessions/{sessionId}.
    console.error(`[webhook] handler ${event.type} failed`, err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }

  return res.status(200).json({ received: true });
}

async function handleCheckoutCompleted(session) {
  const sessionId = session.id;
  if (session.payment_status !== 'paid') return; // safety

  // ── Idempotence pre-check ────────────────────────────────────────────
  // Le bot a read access sur stripe_processed_sessions (rule), donc OK.
  const alreadyProcessed = await restExists('stripe_processed_sessions', sessionId);
  if (alreadyProcessed) {
    console.log(`[webhook] session ${sessionId} deja traitee, skip`);
    return;
  }

  // ── Reconstitue le payload resa depuis session.metadata ──────────────
  const m = session.metadata || {};
  const slotIds = (m.slotIds || '').split(',').filter(Boolean);

  // FIX P1 #2 (validation pre-parsing) : verification metadata stricte AVANT
  // parseInt. Si dateISO/startHour/dureeHours sont corrompus, parseInt les
  // transforme en NaN et la creation Firestore plante avec PERMISSION_DENIED
  // (rule "is int" rejette NaN).
  const startHour = parseInt(m.startHour, 10);
  const dureeHours = parseInt(m.dureeHours, 10);
  const prix = parseInt(m.prix, 10);
  const acompte = parseInt(m.acompte, 10);
  const metadataInvalid =
    !m.prenom || !m.nom || !m.email || !m.service || !m.duree ||
    !m.dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(m.dateISO) ||
    !Number.isInteger(startHour) || startHour < 0 || startHour > 23 ||
    !Number.isInteger(dureeHours) || dureeHours < 1 || dureeHours > 12 ||
    !Number.isInteger(prix) || prix <= 0 ||
    !Number.isInteger(acompte) || acompte <= 0 || acompte >= prix ||
    !slotIds.length;

  if (metadataInvalid) {
    console.error(`[webhook] metadata invalide pour ${sessionId}`, Object.keys(m));
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

  // Conforme aux rules /reservations : exactement les 17 fields hasAll/hasOnly,
  // avec types int + bornes attendues.
  const resaPayload = {
    stripeSessionId: sessionId,
    prenom: m.prenom,
    nom: m.nom,
    email: m.email,
    telephone: m.telephone || '',
    service: m.service,
    duree: m.duree,
    dateISO: m.dateISO,
    startHour,
    dureeHours,
    creneau: m.creneau || '',
    slotIds,
    prix,
    acompte,
    paid: true,
    projet: m.projet || '',
    createdAt: nowTimestamp()
  };

  // ── Cree la resa directement (pas de pre-check restExists : le bot n'a   ──
  // pas read access sur /reservations, seul isAdmin lit). Idempotence
  // garantie par 409 ALREADY_EXISTS si Stripe envoie un duplicate event en
  // parallele — on attrape gracefully.
  try {
    await restSet('reservations', sessionId, resaPayload);
  } catch (e) {
    if (String(e?.message || '').includes('409')) {
      console.log(`[webhook] reservation ${sessionId} existe deja (409), skip create`);
    } else {
      throw e;
    }
  }

  // FIX P0 #5 : marquer les slots comme PERMANENTS en supprimant lockedUntil.
  // cleanup-locks check `if (!data.lockedUntil) return` -> skip suppression.
  // Sans ce fix, les slots des resa confirmees etaient supprimes par le cron
  // apres 30min (lockedUntil expire) -> double booking possible.
  const slotLockResults = await Promise.allSettled(
    slotIds.map(id => restRemoveField('slots', id, 'lockedUntil'))
  );
  slotLockResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[webhook] failed to lock slot ${slotIds[i]} permanently:`, r.reason?.message);
    }
  });

  // FIX P0 #3 (suite) : marker write — si plante (autre que 409), on throw
  // pour que le handler global retourne 500 et que Stripe retry.
  // 409 sur ce marker = race condition Stripe duplicate event = OK (un autre
  // worker l'a deja traite, idempotence par construction).
  try {
    await restSet('stripe_processed_sessions', sessionId, {
      processedAt: nowTimestamp(),
      eventType: 'checkout.session.completed'
    });
  } catch (e) {
    if (String(e?.message || '').includes('409')) {
      console.log(`[webhook] processed marker ${sessionId} existe deja (409 race), skip`);
    } else {
      throw e;
    }
  }
  console.log(`[webhook] resa ${sessionId} creee + slots permanents + processed marque`);

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
    dureeHours,
    dateISO: m.dateISO,
    dateFR: m.dateFR || '',
    startHour,
    creneau: m.creneau || '',
    prix,
    acompte,
    solde: parseInt(m.solde || (prix - acompte), 10),
    slotIds,
    stripeSessionId: sessionId
  };

  const emailResults = await Promise.allSettled([
    sendClientConfirmation(emailPayload),
    sendAdminNotification(emailPayload)
  ]);
  emailResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      const who = i === 0 ? 'client' : 'admin';
      console.error(`[webhook] email ${who} failed:`, r.reason?.message || r.reason);
    }
  });

  // FIX P1 #2 : trace les echecs email dans une collection dediee
  // (admin peut voir lesquels ont rate). Pas dans /reservations car la rule
  // create ne permet pas un field "emailsFailed" supplementaire.
  const clientFailed = emailResults[0].status === 'rejected';
  const adminFailed = emailResults[1].status === 'rejected';
  if (clientFailed || adminFailed) {
    try {
      await restSet('email_failures', sessionId, {
        clientFailed,
        adminFailed,
        clientReason: clientFailed ? String(emailResults[0].reason?.message || emailResults[0].reason).slice(0, 500) : '',
        adminReason: adminFailed ? String(emailResults[1].reason?.message || emailResults[1].reason).slice(0, 500) : '',
        failedAt: nowTimestamp()
      });
    } catch (e) {
      console.error('[webhook] log email_failures failed:', e?.message || e);
    }
  }
}

async function handleCheckoutExpired(session) {
  const sessionId = session.id;

  // FIX P1 #4 : safety check. Si la session a deja ete confirmee (event
  // completed reçu en premier, puis expired arrive en retard), NE PAS
  // supprimer les slots — ce serait casser une resa valide.
  // stripe_processed_sessions/{sessionId} sert de marqueur.
  const alreadyProcessed = await restExists('stripe_processed_sessions', sessionId);
  if (alreadyProcessed) {
    console.warn(`[webhook] session ${sessionId} expired received APRES completed — skip slot cleanup`);
    return;
  }

  // Libere les slots qui avaient ete lockes pour cette session.
  const slotIdsCsv = session.metadata?.slotIds || '';
  const slotIds = slotIdsCsv.split(',').filter(Boolean);
  if (!slotIds.length) return;

  await Promise.allSettled(
    slotIds.map(id => restDelete('slots', id))
  );
  console.log(`[webhook] session ${sessionId} expiree, ${slotIds.length} slots liberes`);
}
