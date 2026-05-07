// Cree une session Stripe Checkout pour l'acompte 30%.
//
// Refactor 2026-05-07 : retire firebase-admin et pending_reservations.
// Tout le payload resa est maintenant stocke dans session.metadata Stripe
// (limite Stripe : 50 keys, 500 chars/valeur). Le webhook lira ces metadata
// pour reconstituer la resa, plus besoin de Firestore avant paiement.
//
// Env vars requises :
//   STRIPE_SECRET_KEY -> sk_test_... ou sk_live_...

import Stripe from 'stripe';
import { computePrice, DUREE_LABEL, isSlotsConsistent, sanitizeText, isValidEmail } from '../lib/pricing.js';

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

    // Limites compatibles Stripe metadata (max 500 chars/valeur, on prend des
    // marges plus strictes pour le confort UX cote dashboard admin).
    const prenom = sanitizeText(resa.prenom, 60);
    const nom = sanitizeText(resa.nom, 60);
    const telephone = sanitizeText(resa.telephone, 30);
    const projet = sanitizeText(resa.projet, 480); // < 500 pour metadata Stripe
    const creneau = sanitizeText(resa.creneau, 40);
    const dateFR = sanitizeText(resa.dateFR, 80);
    const dateISO = sanitizeText(resa.dateISO, 20);
    const startHour = Number(resa.startHour);
    const dureeHours = Number(resa.dureeHours);

    if (!prenom || !nom || !telephone) {
      return res.status(400).json({ error: 'Coordonnees client incompletes' });
    }

    // Validation supplementaire : startHour 0-23, dureeHours 1-12.
    const startHourValid = Number.isInteger(startHour) && startHour >= 0 && startHour <= 23;
    const dureeHoursValid = Number.isInteger(dureeHours) && dureeHours >= 1 && dureeHours <= 12;
    if (!startHourValid || !dureeHoursValid) {
      return res.status(400).json({ error: 'Creneau ou duree hors bornes' });
    }

    // Validation slotIds : chaque entree doit matcher le format YYYY-MM-DD_HH-mm.
    const SLOT_RE = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/;
    if (!slotIds.every(id => typeof id === 'string' && SLOT_RE.test(id))) {
      return res.status(400).json({ error: 'Format slotIds invalide' });
    }

    // dateISO doit etre au format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
      return res.status(400).json({ error: 'Format dateISO invalide' });
    }

    const serviceLabel = `${service} · ${DUREE_LABEL[duree] || duree}`;
    const origin = req.headers.origin || `https://${req.headers.host}`;

    // ── Metadata Stripe : payload complet pour reconstitution par le webhook ──
    // Toutes les valeurs en string (Stripe metadata = string only).
    // Limites : 50 keys, 500 chars/valeur, ~8KB total.
    const metadata = {
      prenom,
      nom,
      email,
      telephone,
      projet,
      service,
      duree,
      dureeHours: String(dureeHours),
      dateISO,
      dateFR,
      startHour: String(startHour),
      creneau,
      prix: String(pricing.total),
      acompte: String(pricing.acompte),
      solde: String(pricing.solde),
      slotIds: slotIds.join(',') // CSV : ~16 chars/slot * 12 max = 192 chars max
    };

    // Verification defensive : aucune valeur > 500 chars (limite Stripe stricte).
    for (const [k, v] of Object.entries(metadata)) {
      if (typeof v === 'string' && v.length > 500) {
        console.error(`[create-checkout-session] metadata.${k} dépasse 500 chars`, v.length);
        return res.status(500).json({ error: 'Payload trop gros pour Stripe metadata' });
      }
    }

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
      metadata,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30min
      success_url: `${origin}/reservation-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?cancelled=1#reservation`
    });

    return res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    console.error('[create-checkout-session]', err);
    return res.status(500).json({ error: err.message || 'Erreur Stripe' });
  }
}
