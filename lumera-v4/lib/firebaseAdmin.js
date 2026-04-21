// Helper Firebase Admin — singleton pour serverless Vercel.
// Env var requise : FIREBASE_ADMIN_SA
//   -> contenu JSON du service account (genere dans Console Firebase >
//      Parametres projet > Comptes de service > Generer une nouvelle cle privee)
//   Coller le JSON STRINGIFIE dans la variable Vercel.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

let _db = null;

export function getAdminDb() {
  if (_db) return _db;

  if (!getApps().length) {
    const raw = process.env.FIREBASE_ADMIN_SA;
    if (!raw) {
      throw new Error('FIREBASE_ADMIN_SA env var manquante');
    }
    let sa;
    try {
      sa = JSON.parse(raw);
    } catch (e) {
      throw new Error('FIREBASE_ADMIN_SA invalide (JSON parse failed)');
    }
    initializeApp({ credential: cert(sa) });
  }

  _db = getFirestore();
  return _db;
}

export { FieldValue, Timestamp };
