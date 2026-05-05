import { db } from './firebase-config.js';
import {
  doc, collection, onSnapshot, runTransaction,
  serverTimestamp, deleteDoc, getDoc, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

// Duree de vie d'un lock slot (doit etre >= expiration Checkout Stripe).
// Stripe Checkout session = 30 min par defaut, on prend 35 min de marge.
const LOCK_TTL_MS = 35 * 60 * 1000;

// Listen to taken slots in real time. Returns an unsubscribe function.
// Les slots dont lockedUntil est expire sont ignores (considerés libres),
// meme si le doc n'a pas encore ete nettoye par le cron.
export function subscribeTakenSlots(callback) {
  return onSnapshot(collection(db, 'slots'), (snap) => {
    const set = new Set();
    const nowMs = Date.now();
    snap.forEach(d => {
      const data = d.data();
      if (!data.taken) return;
      if (data.lockedUntil && typeof data.lockedUntil.toMillis === 'function') {
        if (data.lockedUntil.toMillis() < nowMs) return; // lock expire
      }
      set.add(d.id);
    });
    callback(set);
  });
}

// Atomically lock N slots. No reservation is created here — la resa finale
// est creee cote serveur par le webhook Stripe apres paiement.
// Returns { ok: true, locked } or { ok: false, reason, conflict? }.
export async function tryLockSlots({ slotIds }) {
  try {
    const refs = slotIds.map(id => doc(db, 'slots', id));

    // Pre-clean : supprime les slots dont le lock est deja expire.
    // Necessaire car les rules Firestore interdisent l'update non-admin sur
    // /slots — sans cette etape, un lock orphelin (test abandonne, onglet
    // ferme, etc.) bloque toute nouvelle tentative jusqu'au passage du cron.
    // Le delete est autorise publiquement par les rules.
    const nowMs = Date.now();
    await Promise.all(refs.map(async (ref) => {
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        const lu = snap.data().lockedUntil;
        if (lu && typeof lu.toMillis === 'function' && lu.toMillis() < nowMs) {
          await deleteDoc(ref);
        }
      } catch (_) { /* on retombera sur CONFLICT plus bas si vraiment pris */ }
    }));

    await runTransaction(db, async (tx) => {
      const snaps = await Promise.all(refs.map(r => tx.get(r)));
      for (let i = 0; i < snaps.length; i++) {
        if (snaps[i].exists() && snaps[i].data().taken) {
          throw new Error(`CONFLICT:${slotIds[i]}`);
        }
      }
      const lockedUntil = Timestamp.fromMillis(Date.now() + LOCK_TTL_MS);
      refs.forEach(ref => {
        tx.set(ref, {
          taken: true,
          lockedAt: serverTimestamp(),
          lockedUntil
        });
      });
    });
    return { ok: true, locked: slotIds };
  } catch (err) {
    const msg = String(err.message || err);
    if (msg.startsWith('CONFLICT:')) {
      return { ok: false, reason: 'TAKEN', conflict: msg.split(':')[1] };
    }
    console.error('tryLockSlots error', err);
    return { ok: false, reason: 'ERROR', error: msg };
  }
}

// Release slot locks (e.g. user went back before payment).
// Logs any failure explicitly so it's visible in the browser console.
export async function releaseLockedSlots(slotIds) {
  const results = await Promise.allSettled(
    slotIds.map(id => deleteDoc(doc(db, 'slots', id)))
  );
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[releaseLockedSlots] delete failed for ${slotIds[i]}:`, r.reason);
    }
  });
  return results;
}
