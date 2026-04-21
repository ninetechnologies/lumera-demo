// Cree une session Stripe Checkout pour l'acompte 30%.
// - Valide le prix COTE SERVEUR via lib/pricing.js (anti-fraude)
// - Stocke le payload resa complet dans pending_reservations/{sessionId} pour
//   que le webhook le relise apres paiement (bypass la limite metadata 500char)
//
// Env vars requises :
//   STRIPE_SECRET_KEY      -> sk_test_... ou sk_live_...
//   FIREBASE_ADMIN_SA      -> JSON du service account Firebase
import Stripe from 'stripe';
import { computePrice, DUREE_LABEL, isSlotsConsistent, sanitizeText, isValidEmail } from '../lib/pricing.js';
import { getAdminDb, FieldValue, Timestamp } from '../lib/firebaseAdmin.js';

const PENDING_TTL_MINUTES = 35; // > 30min (duree de vie d'une session Stripe)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY non configuree' });
  }

  const stripe = new Stripe(secret, { apiVersion: '2024-12-18.acacia' });

  try {
    const { resa } = req.body || {};
    if (!resa || typeof resa !== 'object') {
      return res.status(400).json({ error: 'Payload resa manquant' });
    }

    // ── Validation stricte cote serveur ───────────────────────────────
    const service = String(resa.service || '');
    const duree = String(resa.duree || '');
    const slotIds = Array.isArray(resa.slotIds) ? resa.slotIds : [];

    const pricing = computePrice(service, duree);
    if (!pricing) {
      return res.status(400).json({ error: 'Service ou duree invalide' });
    }

    if (!isSlotsConsistent(slotIds, duree)) {
      return res.status(400).json({ error: 'Slots incoherents avec la duree' });
    }

    const email = String(resa.email || '').trim();
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }

    const prenom = sanitizeText(resa.prenom, 60);
    const nom = sanitizeText(resa.nom, 60);
    const telephone = sanitizeText(resa.telephone, 30);
    const projet = sanitizeText(resa.projet, 1000);
    const creneau = sanitizeText(resa.creneau, 40);
    const dateFR = sanitizeText(resa.dateFR, 80);
    const dateISO = sanitizeText(resa.dateISO, 20);
    const startHour = Number(resa.startHour);
    const dureeHours = Number(resa.dureeHours);

    if (!prenom || !nom || !telephone) {
      return res.status(400).json({ error: 'Coordonnees client incompletes' });
    }

    // ── Prepare payload cannonique (recalcule depuis grille serveur) ──
    const canonical = {
      prenom, nom, email, telephone, projet,
      service, duree,
      dureeHours: Number.isFinite(dureeHours) ? dureeHours : 0,
      dateISO, dateFR,
      startHour: Number.isFinite(startHour) ? startHour : 0,
      creneau,
      prix: pricing.total,
      acompte: pricing.acompte,
      solde: pricing.solde,
      slotIds
    };

    const serviceLabel = `${service} · ${DUREE_LABEL[duree] || duree}`;
    const origin = req.headers.origin || `https://${req.headers.host}`;

    // ── Cree la session Stripe ────────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      locale: 'fr',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Acompte 30% · ${serviceLabel}`,
            description: `${dateFR} · ${creneau} — Total ${pricing.total}€, solde de ${pricing.solde}€ a regler sur place.`
          },
          unit_amount: pricing.acompte * 100
        },
        quantity: 1
      }],
      customer_email: email,
      metadata: {
        // Metadata minimaliste — le vrai payload est dans pending_reservations.
        // Stripe limite chaque valeur a 500 chars.
        slotIds: slotIds.join(','),
        service,
        duree,
        prix: String(pricing.total),
        acompte: String(pricing.acompte)
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30min
      success_url: `${origin}/reservation-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?cancelled=1#reservation`
    });

    // ── Pose le payload dans Firestore pour le webhook ────────────────
    try {
      const db = getAdminDb();
      const expiresAt = Timestamp.fromMillis(Date.now() + PENDING_TTL_MINUTES * 60 * 1000);
      await db.doc(`pending_reservations/${session.id}`).set({
        resa: canonical,
        slotIds,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt
      });
    } catch (fireErr) {
      // Si Firestore fail, on annule la session Stripe pour ne pas laisser un
      // paiement possible sans payload cote serveur.
      console.error('[create-checkout-session] pending_reservations write failed', fireErr);
      try { await stripe.checkout.sessions.expire(session.id); } catch(_) {}
      return res.status(500).json({ error: 'Impossible de preparer la reservation. Merci de reessayer.' });
    }

    return res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    console.error('[create-checkout-session]', err);
    return res.status(500).json({ error: err.message || 'Erreur Stripe' });
  }
}
