// Cron endpoint — nettoie les slots expires (lockedUntil < now) et les
// pending_reservations orphelines (expiresAt < now).
//
// Declenche par Vercel Cron (voir vercel.json). Protege par le header
// "Authorization: Bearer <CRON_SECRET>" que Vercel envoie automatiquement
// si la variable d'env CRON_SECRET est definie.
//
// Env vars : FIREBASE_ADMIN_SA, CRON_SECRET (optionnel mais recommande)
import { getAdminDb } from '../lib/firebaseAdmin.js';

export default async function handler(req, res) {
  // Vercel Cron envoie GET + header Authorization: Bearer CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const db = getAdminDb();
  const nowMs = Date.now();
  const report = { slotsDeleted: 0, pendingDeleted: 0, errors: [] };

  // ── 1) Nettoyage slots expires ─────────────────────────────────────
  try {
    const snap = await db.collection('slots').get();
    const batch = db.batch();
    let batchCount = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      // Si pas de lockedUntil (ancien format) ou si lockedUntil depasse, on skip
      if (!data.lockedUntil || typeof data.lockedUntil.toMillis !== 'function') continue;
      if (data.lockedUntil.toMillis() >= nowMs) continue;
      batch.delete(doc.ref);
      batchCount++;
      report.slotsDeleted++;
      if (batchCount >= 400) {
        await batch.commit();
        batchCount = 0;
      }
    }
    if (batchCount > 0) await batch.commit();
  } catch (e) {
    console.error('[cleanup-locks] slots error', e);
    report.errors.push(`slots: ${e.message}`);
  }

  // ── 2) Nettoyage pending_reservations expirees ─────────────────────
  // On supprime aussi les slots associes au cas ou l'etape 1 les a rates
  // (pas de lockedUntil pour les anciens pending).
  try {
    const snap = await db.collection('pending_reservations').get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const expiresAt = data.expiresAt;
      if (!expiresAt || typeof expiresAt.toMillis !== 'function') continue;
      if (expiresAt.toMillis() >= nowMs) continue;
      const slotIds = Array.isArray(data.slotIds) ? data.slotIds : [];
      await Promise.allSettled(
        slotIds.map(id => db.doc(`slots/${id}`).delete())
      );
      await doc.ref.delete().catch(() => {});
      report.pendingDeleted++;
    }
  } catch (e) {
    console.error('[cleanup-locks] pending error', e);
    report.errors.push(`pending: ${e.message}`);
  }

  return res.status(200).json({ ok: true, at: new Date().toISOString(), ...report });
}
