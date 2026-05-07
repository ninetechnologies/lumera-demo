// Cron endpoint — nettoie les slots expires (lockedUntil < now) et les
// pending_reservations orphelines (legacy — plus cree depuis le refactor
// 2026-05-07 mais on les efface si on en trouve).
//
// Refactor 2026-05-07 : retire firebase-admin. Auth via bot Firebase.
//
// Declenche par Vercel Cron (voir vercel.json). Protege par le header
// "Authorization: Bearer <CRON_SECRET>" que Vercel envoie automatiquement
// si la variable d'env CRON_SECRET est definie.
//
// Env vars :
//   FIREBASE_BOT_EMAIL    -> webhook-bot@lumera-studio.fr
//   FIREBASE_BOT_PASSWORD -> mot de passe robuste 36 chars
//   CRON_SECRET           -> optionnel, recommande pour proteger l'endpoint

import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { getBotDb } from '../lib/firebaseWebhookAuth.js';

export default async function handler(req, res) {
  // Vercel Cron envoie GET + header Authorization: Bearer CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // Skip silencieux si l'auth bot n'est pas configuree (env vars manquantes).
  // Evite le spam des logs Vercel toutes les 15 min.
  if (!process.env.FIREBASE_BOT_EMAIL || !process.env.FIREBASE_BOT_PASSWORD) {
    return res.status(200).json({ ok: true, skipped: 'FIREBASE_BOT_EMAIL/PASSWORD non configure' });
  }

  let db;
  try {
    db = await getBotDb();
  } catch (err) {
    console.warn('[cleanup-locks] auth bot failed —', err.message);
    return res.status(200).json({ ok: true, skipped: 'Auth bot impossible' });
  }

  const nowMs = Date.now();
  const report = { slotsDeleted: 0, pendingDeleted: 0, errors: [] };

  // ── 1) Nettoyage slots expires ─────────────────────────────────────
  try {
    const snap = await getDocs(collection(db, 'slots'));
    // SDK client n'a pas de batch.delete simple — on fait des deleteDoc en
    // parallele avec Promise.allSettled. Pour quelques dizaines de slots c'est OK,
    // pour 400+ docs il faudrait paginer / chunker.
    const toDelete = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      // Si pas de lockedUntil (ancien format) ou si lockedUntil depasse, on skip
      if (!data.lockedUntil || typeof data.lockedUntil.toMillis !== 'function') return;
      if (data.lockedUntil.toMillis() >= nowMs) return;
      toDelete.push(docSnap.id);
    });
    const results = await Promise.allSettled(
      toDelete.map(id => deleteDoc(doc(db, 'slots', id)))
    );
    report.slotsDeleted = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      console.warn(`[cleanup-locks] ${failed.length} slots delete failed`);
    }
  } catch (e) {
    console.error('[cleanup-locks] slots error', e);
    report.errors.push(`slots: ${e.message}`);
  }

  // ── 2) Nettoyage pending_reservations residuelles (legacy) ─────────
  // Plus cree depuis le refactor 2026-05-07 (tout est dans Stripe metadata
  // maintenant). On les efface si on en trouve, peu importe leur date.
  try {
    const snap = await getDocs(collection(db, 'pending_reservations'));
    const ids = [];
    snap.forEach(docSnap => ids.push(docSnap.id));
    const results = await Promise.allSettled(
      ids.map(id => deleteDoc(doc(db, 'pending_reservations', id)))
    );
    report.pendingDeleted = results.filter(r => r.status === 'fulfilled').length;
  } catch (e) {
    console.error('[cleanup-locks] pending error', e);
    report.errors.push(`pending: ${e.message}`);
  }

  return res.status(200).json({ ok: true, at: new Date().toISOString(), ...report });
}
