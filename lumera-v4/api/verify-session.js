// Verifie qu'une session Checkout est payee, et retourne la reservation
// si elle existe deja dans Firestore (cree par le webhook).
//
// Env vars : STRIPE_SECRET_KEY, FIREBASE_ADMIN_SA
import Stripe from 'stripe';
import { getAdminDb } from '../lib/firebaseAdmin.js';

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

    // Si paye, on tente de lire la resa creee par le webhook.
    let resa = null;
    if (paid) {
      try {
        const db = getAdminDb();
        const snap = await db.doc(`reservations/${sessionId}`).get();
        if (snap.exists) {
          const data = snap.data();
          // On renvoie un subset safe (pas de donnees internes sensibles)
          resa = {
            prenom: data.prenom,
            nom: data.nom,
            email: data.email,
            telephone: data.telephone,
            projet: data.projet,
            service: data.service,
            duree: data.duree,
            dureeHours: data.dureeHours,
            dateISO: data.dateISO,
            dateFR: data.dateFR,
            startHour: data.startHour,
            creneau: data.creneau,
            prix: data.prix,
            acompte: data.acompte,
            solde: data.solde
          };
        }
      } catch (e) {
        console.error('[verify-session] firestore read failed', e);
      }
    }

    return res.status(200).json({
      paid,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      customer_email: session.customer_details?.email || session.customer_email || null,
      resa
    });
  } catch (err) {
    console.error('[verify-session]', err);
    return res.status(500).json({ error: err.message || 'Erreur Stripe' });
  }
}
