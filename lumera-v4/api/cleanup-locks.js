// Cron endpoint — nettoie les slots expires (lockedUntil < now) et les
// pending_reservations orphelines (legacy — plus cree depuis le refactor
// 2026-05-07 mais on les efface si on en trouve).
//
// Refactor 2026-05-07 : retire firebase-admin. Auth via bot Firebase.
// Refactor 2026-05-08 : migration vers REST direct (lib/firestoreRest)
// pour coherence avec stripe-webhook + verify-session (le SDK lite gRPC
// avait des soucis de propagation token en serverless Vercel).
//
// Declenche par Vercel Cron (voir vercel.json). Protege par le header
// "Authorization: Bearer <CRON_SECRET>" que Vercel envoie automatiquement.
// CRON_SECRET est OBLIGATOIRE en prod : sans, l'endpoint serait public et
// exposerait a des appels en boucle (DoS Firestore, suppression slots).
//
// Env vars :
//   FIREBASE_BOT_EMAIL    -> webhook-bot@lumera-studio.fr
//   FIREBASE_BOT_PASSWORD -> mot de passe robuste 36 chars
//   CRON_SECRET           -> 32+ chars, OBLIGATOIRE

import { restList, restDelete } from '../lib/firestoreRest.js';

export default async function handler(req, res) {
  // FIX P0 #2 (audit 08/05) : CRON_SECRET maintenant OBLIGATOIRE.
  // Sans, on retourne 503 (= service indisponible, signale a l'admin).
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cleanup-locks] CRON_SECRET manquant — endpoint desactive');
    return res.status(503).json({ error: 'CRON_SECRET non configure' });
  }
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.FIREBASE_BOT_EMAIL || !process.env.FIREBASE_BOT_PASSWORD) {
    return res.status(503).json({ error: 'FIREBASE_BOT_EMAIL/PASSWORD non configure' });
  }

  const nowMs = Date.now();
  const report = { slotsDeleted: 0, pendingDeleted: 0, errors: [] };

  // ── 1) Nettoyage slots expires ─────────────────────────────────────
  // Lit tous les slots, filtre ceux dont lockedUntil < now, supprime.
  // Slots sans lockedUntil = resa confirmee (le webhook a retire le field
  // au moment du paiement) -> on skip (ne JAMAIS supprimer une resa valide).
  try {
    const slots = await restList('slots');
    const toDelete = [];
    for (const s of slots) {
      if (!s.lockedUntil) continue; // resa confirmee, skip
      const lockedUntilMs = s.lockedUntil instanceof Date
        ? s.lockedUntil.getTime()
        : new Date(s.lockedUntil).getTime();
      if (Number.isNaN(lockedUntilMs)) continue;
      if (lockedUntilMs >= nowMs) continue; // pas encore expire
      toDelete.push(s.id);
    }
    const results = await Promise.allSettled(
      toDelete.map(id => restDelete('slots', id))
    );
    report.slotsDeleted = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      console.warn(`[cleanup-locks] ${failed.length} slots delete failed`);
      failed.slice(0, 3).forEach(f => console.warn('  reason:', f.reason?.message));
    }
  } catch (e) {
    console.error('[cleanup-locks] slots error', e);
    report.errors.push(`slots: ${e.message}`);
  }

  // ── 2) Nettoyage pending_reservations residuelles (legacy) ─────────
  // Plus cree depuis le refactor 2026-05-07 (tout est dans Stripe metadata
  // maintenant). On les efface si on en trouve, peu importe leur date.
  try {
    const pendings = await restList('pending_reservations');
    const results = await Promise.allSettled(
      pendings.map(p => restDelete('pending_reservations', p.id))
    );
    report.pendingDeleted = results.filter(r => r.status === 'fulfilled').length;
  } catch (e) {
    console.error('[cleanup-locks] pending error', e);
    report.errors.push(`pending: ${e.message}`);
  }

  return res.status(200).json({ ok: true, at: new Date().toISOString(), ...report });
}
