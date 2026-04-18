// Vercel serverless function — cree une session Stripe Checkout pour l'acompte 30%.
// Env var requise : STRIPE_SECRET_KEY
import Stripe from 'stripe';

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
    const {
      acompte,        // montant en euros (entier) — ex: 96
      total,          // total complet (pour affichage) — ex: 320
      serviceLabel,   // "Cyclorama · 4h" pour la description
      dateFR,         // "samedi 15 juin 2026"
      creneau,        // "14h-18h"
      slotIds,        // array de slot ids (deja lockes)
      resa            // payload complet de la resa (pour metadata)
    } = req.body || {};

    if (!acompte || acompte < 1 || !Array.isArray(slotIds) || slotIds.length === 0) {
      return res.status(400).json({ error: 'Donnees de resa invalides' });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      locale: 'fr',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Acompte 30% · ${serviceLabel || 'Lumera Studio'}`,
            description: `${dateFR || ''} · ${creneau || ''} — Total ${total}€, solde de ${total - acompte}€ a regler sur place.`
          },
          unit_amount: Math.round(acompte * 100)
        },
        quantity: 1
      }],
      customer_email: resa?.email || undefined,
      metadata: {
        slotIds: slotIds.join(','),
        // on stringify la resa pour la recuperer cote verify-session
        resaPayload: JSON.stringify({
          prenom: resa?.prenom || '',
          nom: resa?.nom || '',
          email: resa?.email || '',
          telephone: resa?.telephone || '',
          projet: resa?.projet || '',
          service: resa?.service || '',
          duree: resa?.duree || '',
          dureeHours: resa?.dureeHours || 0,
          dateISO: resa?.dateISO || '',
          startHour: resa?.startHour || 0,
          creneau: resa?.creneau || '',
          prix: resa?.prix || 0,
          acompte: resa?.acompte || 0,
          slotIds
        }).slice(0, 450) // limite metadata Stripe = 500 chars par valeur
      },
      success_url: `${origin}/reservation-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?cancelled=1#reservation`
    });

    return res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    console.error('[create-checkout-session]', err);
    return res.status(500).json({ error: err.message || 'Erreur Stripe' });
  }
}
