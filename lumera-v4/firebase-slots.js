import { db } from './firebase-config.js';
import {
  doc, collection, addDoc, onSnapshot, runTransaction,
  serverTimestamp, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

// Listen to taken slots in real time. Returns an unsubscribe function.
export function subscribeTakenSlots(callback) {
  return onSnapshot(collection(db, 'slots'), (snap) => {
    const set = new Set();
    snap.forEach(d => { if (d.data().taken) set.add(d.id); });
    callback(set);
  });
}

// Atomically lock N slots. No reservation is created here — the reservation
// document is only created on payment success (createReservation).
// Returns { ok: true, locked } or { ok: false, reason, conflict? }.
export async function tryLockSlots({ slotIds }) {
  try {
    await runTransaction(db, async (tx) => {
      const refs = slotIds.map(id => doc(db, 'slots', id));
      const snaps = await Promise.all(refs.map(r => tx.get(r)));
      for (let i = 0; i < snaps.length; i++) {
        if (snaps[i].exists() && snaps[i].data().taken) {
          throw new Error(`CONFLICT:${slotIds[i]}`);
        }
      }
      refs.forEach(ref => {
        tx.set(ref, { taken: true, lockedAt: serverTimestamp() });
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

// Create the reservation document (called after mock Stripe payment succeeds).
// Returns the generated reservation ID.
export async function createReservation(data) {
  const ref = await addDoc(collection(db, 'reservations'), {
    ...data,
    slot: data.slotIds?.[0] || null,
    status: 'confirmed',
    createdAt: serverTimestamp()
  });
  return ref.id;
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
