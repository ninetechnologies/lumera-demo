// Vercel serverless function — verifie qu'une session Checkout est bien payee
// avant que le client cree la reservation dans Firestore.
import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY non configuree' });
  }

  const sessionId = req.query.session_id || req.body?.session_id;
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'session_id manquant' });
  }

  const stripe = new Stripe(secret, { apiVersion: '2024-12-18.acacia' });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid = session.payment_status === 'paid';

    let resa = null;
    if (session.metadata?.resaPayload) {
      try { resa = JSON.parse(session.metadata.resaPayload); } catch(e) {}
    }
    const slotIds = (session.metadata?.slotIds || '').split(',').filter(Boolean);

    return res.status(200).json({
      paid,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      customer_email: session.customer_details?.email || session.customer_email || null,
      payment_intent: session.payment_intent,
      slotIds,
      resa
    });
  } catch (err) {
    console.error('[verify-session]', err);
    return res.status(500).json({ error: err.message || 'Erreur Stripe' });
  }
}
