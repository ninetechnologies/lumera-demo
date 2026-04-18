import { db } from './firebase-config.js';
import {
  doc, collection, onSnapshot, runTransaction, serverTimestamp, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

// Listen to taken slots in real time. Returns an unsubscribe function.
export function subscribeTakenSlots(callback) {
  return onSnapshot(collection(db, 'slots'), (snap) => {
    const set = new Set();
    snap.forEach(d => { if (d.data().taken) set.add(d.id); });
    callback(set);
  });
}

// Atomically lock N slots and create the reservation document.
// Returns { ok: true, resaId } or { ok: false, reason, conflict? }.
export async function tryLockSlots({ slotIds, reservation }) {
  try {
    const resaId = await runTransaction(db, async (tx) => {
      const refs = slotIds.map(id => doc(db, 'slots', id));
      const snaps = await Promise.all(refs.map(r => tx.get(r)));
      for (let i = 0; i < snaps.length; i++) {
        if (snaps[i].exists() && snaps[i].data().taken) {
          throw new Error(`CONFLICT:${slotIds[i]}`);
        }
      }
      const resaRef = doc(collection(db, 'reservations'));
      tx.set(resaRef, {
        ...reservation,
        slotIds,
        slot: slotIds[0],
        status: 'confirmed',
        createdAt: serverTimestamp()
      });
      refs.forEach(ref => {
        tx.set(ref, { taken: true, resaId: resaRef.id, lockedAt: serverTimestamp() });
      });
      return resaRef.id;
    });
    return { ok: true, resaId, locked: slotIds };
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
export async function releaseLockedSlots(slotIds) {
  await Promise.allSettled(slotIds.map(id => deleteDoc(doc(db, 'slots', id))));
}
