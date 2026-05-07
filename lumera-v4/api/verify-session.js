// Verifie qu'une session Checkout est payee, retourne la resa depuis
// session.metadata Stripe + un flag webhookProcessed indiquant si la resa
// est aussi en base Firestore (cree par le webhook).
//
// Refactor 2026-05-07 : retire firebase-admin. Le payload resa vient maintenant
// de session.metadata Stripe (plus de pending_reservations Firestore).
//
// Env vars :
//   STRIPE_SECRET_KEY
//   FIREBASE_BOT_EMAIL    -> webhook-bot@lumera-studio.fr
//   FIREBASE_BOT_PASSWORD -> mot de passe robuste 36 chars

import Stripe from 'stripe';
import { doc, getDoc } from 'firebase/firestore';
import { getBotDb } from '../lib/firebaseWebhookAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY non configuree' });
  }

  const sessionId = req.query.session_id || req.body?.session_id;
  if (!sessionId || typeof sessionId !== 'string' || !/^cs_(test|live)_/.test(sessionId)) {
    return res.status(400).json({ error: 'session_id invalide' });
  }

  const stripe = new Stripe(secret, { apiVersion: '2024-12-18.acacia' });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid = session.payment_status === 'paid';

    // ── Reconstitue resa depuis session.metadata Stripe ──────────────────
    // Stripe stocke les metadata stringifies, on parse-les selon leur type.
    let resa = null;
    if (paid && session.metadata && session.metadata.prenom) {
      const m = session.metadata;
      const prix = m.prix ? parseInt(m.prix, 10) : null;
      const acompte = m.acompte ? parseInt(m.acompte, 10) : null;
      resa = {
        prenom: m.prenom,
        nom: m.nom,
        email: m.email,
        telephone: m.telephone || '',
        projet: m.projet || '',
        service: m.service,
        duree: m.duree,
        dureeHours: m.dureeHours ? parseInt(m.dureeHours, 10) : null,
        dateISO: m.dateISO,
        dateFR: m.dateFR || '',
        startHour: m.startHour ? parseInt(m.startHour, 10) : null,
        creneau: m.creneau || '',
        prix,
        acompte,
        solde: m.solde ? parseInt(m.solde, 10) : (prix && acompte ? prix - acompte : null)
      };
    }

    // ── Flag webhookProcessed : true si la resa est aussi dans Firestore ─
    // Permet au frontend de savoir si le serveur a fini de traiter (utile
    // pour distinguer "paye mais webhook en retard" de "paye et tout OK").
    let webhookProcessed = false;
    if (paid) {
      try {
        const db = await getBotDb();
        const procSnap = await getDoc(doc(db, 'stripe_processed_sessions', sessionId));
        webhookProcessed = procSnap.exists();
      } catch (e) {
        // Si l'auth bot rate, on continue : webhookProcessed reste false.
        console.warn('[verify-session] firestore check failed —', e?.message);
      }
    }

    return res.status(200).json({
      paid,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      customer_email: session.customer_details?.email || session.customer_email || null,
      resa,
      webhookProcessed
    });
  } catch (err) {
    console.error('[verify-session]', err);
    return res.status(500).json({ error: err.message || 'Erreur Stripe' });
  }
}

