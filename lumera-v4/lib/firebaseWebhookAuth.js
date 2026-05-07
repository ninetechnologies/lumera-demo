// Authentifie le serveur Vercel comme un user Firebase dedie ("bot webhook")
// pour ecrire dans Firestore via le SDK client. Remplace firebase-admin SDK
// (bloque par l'org policy iam.disableServiceAccountKeyCreation sur le projet
// Firebase lumera-studio).
//
// Env vars requises (Vercel) :
//   FIREBASE_BOT_EMAIL    -> webhook-bot@lumera-studio.fr
//   FIREBASE_BOT_PASSWORD -> mot de passe robuste 36 chars
//
// Le user Firebase Auth correspondant doit exister dans le projet lumera-studio
// avec l'UID iz8umKlReBeFt0skylYoSTHLK5t1 (verifiable dans Firebase Console).
// Les rules Firestore autorisent ce UID a ecrire reservations/, stripe_*/, slots/.

import { initializeApp, getApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, setPersistence, inMemoryPersistence } from 'firebase/auth';
// IMPORTANT : on utilise firebase/firestore/lite (REST-only) au lieu de
// firebase/firestore (gRPC) — le SDK gRPC ne propage pas correctement le
// token Firebase Auth aux requetes en environnement Node.js Vercel
// serverless, causant PERMISSION_DENIED systematique sur les writes.
// Le SDK lite est concu pour les environnements serverless / SSR.
import { getFirestore, Timestamp } from 'firebase/firestore/lite';

// Config Firebase (publique, identique a firebase-config.js cote client)
const firebaseConfig = {
  apiKey: 'AIzaSyB-CGZSWCYsztuBtkeH9gHWFkq3kZxPwgY',
  authDomain: 'lumera-studio.firebaseapp.com',
  projectId: 'lumera-studio',
  storageBucket: 'lumera-studio.firebasestorage.app',
  messagingSenderId: '578287637773',
  appId: '1:578287637773:web:cb3d0cc456c452a0880c44',
  measurementId: 'G-TZ0BG9P1K3'
};

// App nommee pour isoler du SDK client cote browser (au cas ou).
const APP_NAME = 'lumera-bot';

// Cache au niveau module : Vercel reutilise parfois les conteneurs warm,
// dans ce cas on evite de re-authentifier a chaque invocation (gain ~500ms).
let _appPromise = null;

async function getAuthenticatedApp() {
  if (_appPromise) return _appPromise;

  _appPromise = (async () => {
    const email = process.env.FIREBASE_BOT_EMAIL;
    const password = process.env.FIREBASE_BOT_PASSWORD;
    if (!email || !password) {
      throw new Error('FIREBASE_BOT_EMAIL ou FIREBASE_BOT_PASSWORD env var manquante');
    }
    let app;
    try {
      app = getApp(APP_NAME);
    } catch (_) {
      app = initializeApp(firebaseConfig, APP_NAME);
    }
    const auth = getAuth(app);
    // Persistence en memoire — sur Node.js (serverless), pas de localStorage
    // donc le SDK doit explicitement utiliser inMemoryPersistence pour eviter
    // tout fallback bizarre.
    try { await setPersistence(auth, inMemoryPersistence); } catch (_) {}
    if (!auth.currentUser) {
      await signInWithEmailAndPassword(auth, email, password);
    }
    return app;
  })();

  // Si le sign-in echoue, on reset le cache pour permettre un retry au prochain appel.
  _appPromise.catch(() => { _appPromise = null; });

  return _appPromise;
}

export async function getBotDb() {
  const app = await getAuthenticatedApp();
  return getFirestore(app);
}

export async function getBotAuth() {
  const app = await getAuthenticatedApp();
  return getAuth(app);
}

// Reset complet du cache + termine la Firestore connection + supprime l'app.
// A appeler au debut d'un handler critique (ex: webhook Stripe) si on suspecte
// que la connection Firestore cache utilise un token Auth obsolete (warm
// invocation). Le prochain getBotDb() refera un sign-in + creera une nouvelle
// connection Firestore avec le token frais.
// Reset complet du cache + supprime l'app. A appeler au debut d'un handler
// critique (ex: webhook Stripe) sur warm invocation pour forcer un sign-in
// fresh. Le SDK lite n'a pas besoin de terminate() (pas de gRPC stream
// persistant), juste deleteApp.
export async function resetBotAuth() {
  if (_appPromise) {
    try {
      const app = await _appPromise;
      try { await deleteApp(app); } catch (_) {}
    } catch (_) {}
  }
  _appPromise = null;
}

// UID hardcode pour verification / debug (ne bouge pas tant que le user
// Firebase Auth n'est pas recree dans la console).
export const WEBHOOK_BOT_UID = 'iz8umKlReBeFt0skylYoSTHLK5t1';

// Re-export Firestore primitives pour eviter les imports cote endpoints.
// Note : firebase/firestore/lite N'EXPOSE PAS serverTimestamp() ni FieldValue.
// On expose un helper serverTimestamp() qui retourne Timestamp.now() (precis
// a la milliseconde pres, suffisant pour notre usage et compatible rules
// "is timestamp").
export { Timestamp };
export function serverTimestamp() {
  return Timestamp.now();
}
