// Wrapper REST minimaliste pour Firestore (pas de SDK Firebase JS).
// Utilise pour le webhook Stripe car le SDK firebase/firestore (gRPC) et
// firebase/firestore/lite (REST) ne propagent pas correctement le token
// Firebase Auth en environnement Node.js Vercel serverless.
//
// Plan :
// 1. signInBot() -> POST identitytoolkit.googleapis.com/...:signInWithPassword
//    avec l'API Key publique Firebase, retourne idToken (TTL 1h).
// 2. setDoc / getDoc / deleteDoc via fetch direct vers
//    firestore.googleapis.com/v1/projects/.../documents/...
//    avec header "Authorization: Bearer <idToken>".
//
// Le idToken est cache au niveau module (TTL 50min pour marge securite).

const PROJECT_ID = 'lumera-studio';
const API_KEY = 'AIzaSyB-CGZSWCYsztuBtkeH9gHWFkq3kZxPwgY'; // public, identique a firebase-config

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Cache du token au niveau module. Vercel reutilise les warm containers.
let _tokenCache = null; // { idToken, expiresAt }

async function signInBot() {
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 60_000) {
    return _tokenCache.idToken;
  }
  const email = process.env.FIREBASE_BOT_EMAIL;
  const password = process.env.FIREBASE_BOT_PASSWORD;
  if (!email || !password) {
    throw new Error('FIREBASE_BOT_EMAIL ou FIREBASE_BOT_PASSWORD env var manquante');
  }
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    _tokenCache = null;
    throw new Error(`signInBot ${r.status}: ${txt}`);
  }
  const j = await r.json();
  // expiresIn est en secondes, on cache 50min pour marge.
  _tokenCache = {
    idToken: j.idToken,
    expiresAt: Date.now() + Math.min(parseInt(j.expiresIn, 10) * 1000, 50 * 60_000)
  };
  return j.idToken;
}

// Reset cache (utile pour debug ou si on suspecte un token corrompu).
export function resetBotTokenCache() {
  _tokenCache = null;
}

// Convertit un object JS en format Firestore REST {fields: {...}}.
// Supporte : string, number (int ou double), boolean, null, Date, Timestamp,
// array, object imbrique. Detecte automatiquement integerValue vs doubleValue.
export function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return fields;
}

function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  }
  if (v instanceof Date) {
    return { timestampValue: v.toISOString() };
  }
  // Timestamp object Firebase ({ seconds, nanoseconds }) ou notre helper
  if (v && typeof v === 'object' && typeof v.toMillis === 'function') {
    return { timestampValue: new Date(v.toMillis()).toISOString() };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFirestoreValue) } };
  }
  if (typeof v === 'object') {
    return { mapValue: { fields: toFirestoreFields(v) } };
  }
  throw new Error(`Type non supporte: ${typeof v}`);
}

// Convertit un doc Firestore REST {fields: {...}} en object JS plat.
export function fromFirestoreFields(fields) {
  if (!fields) return {};
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = fromFirestoreValue(v);
  }
  return out;
}

function fromFirestoreValue(v) {
  if (v.nullValue !== undefined) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.timestampValue !== undefined) return new Date(v.timestampValue);
  if (v.arrayValue !== undefined) {
    return (v.arrayValue.values || []).map(fromFirestoreValue);
  }
  if (v.mapValue !== undefined) {
    return fromFirestoreFields(v.mapValue.fields || {});
  }
  return null;
}

// Cree un document a un docId explicite via POST createDocument.
// IMPORTANT : utilise POST + ?documentId={id} pour matcher "allow create" cote
// rules (PATCH = "update" = autre rule, souvent restrictive).
// Si le doc existe deja -> 409 ALREADY_EXISTS (le caller doit gerer
// l'idempotence en amont via restExists).
export async function restCreate(collection, docId, data) {
  const idToken = await signInBot();
  const url = `${FIRESTORE_BASE}/${encodeURIComponent(collection)}?documentId=${encodeURIComponent(docId)}`;
  const body = { fields: toFirestoreFields(data) };
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`restCreate ${collection}/${docId} ${r.status}: ${txt}`);
  }
  return r.json();
}

// Backward-compat alias : restSet -> restCreate (cas d'usage actuel = creation).
export const restSet = restCreate;

// PATCH update (= "allow update" rule). A utiliser uniquement quand on veut
// modifier un doc existant (pas pour les writes initiaux).
// fieldMask : si fourni, ne touche que ces fields (les autres fields du doc
// restent intacts). Si un field est dans le mask MAIS pas dans data, il est
// SUPPRIME du document Firestore (utile pour retirer un field expire).
export async function restUpdate(collection, docId, data, fieldMask = null) {
  const idToken = await signInBot();
  let url = `${FIRESTORE_BASE}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
  if (Array.isArray(fieldMask) && fieldMask.length > 0) {
    const params = fieldMask.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
    url += `?${params}`;
  }
  const body = { fields: toFirestoreFields(data) };
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`restUpdate ${collection}/${docId} ${r.status}: ${txt}`);
  }
  return r.json();
}

// Supprime un field d'un document existant (PATCH avec updateMask = field
// + body sans ce field). Le reste du doc est preserve.
export async function restRemoveField(collection, docId, fieldName) {
  return restUpdate(collection, docId, {}, [fieldName]);
}

// Lit un document. Retourne null si 404.
export async function restGet(collection, docId) {
  const idToken = await signInBot();
  const url = `${FIRESTORE_BASE}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
  const r = await fetch(url, {
    headers: { 'Authorization': `Bearer ${idToken}` }
  });
  if (r.status === 404) return null;
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`restGet ${collection}/${docId} ${r.status}: ${txt}`);
  }
  const j = await r.json();
  return fromFirestoreFields(j.fields);
}

// Existence check sans recuperer le payload (HEAD-like via fields mask vide).
export async function restExists(collection, docId) {
  const idToken = await signInBot();
  const url = `${FIRESTORE_BASE}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}?mask.fieldPaths=__name__`;
  const r = await fetch(url, {
    headers: { 'Authorization': `Bearer ${idToken}` }
  });
  if (r.status === 404) return false;
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`restExists ${collection}/${docId} ${r.status}: ${txt}`);
  }
  return true;
}

export async function restDelete(collection, docId) {
  const idToken = await signInBot();
  const url = `${FIRESTORE_BASE}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
  const r = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${idToken}` }
  });
  if (r.status === 404) return; // deja supprime, OK
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`restDelete ${collection}/${docId} ${r.status}: ${txt}`);
  }
}

// Helper : timestamp courant pour serverTimestamp equivalent.
export function nowTimestamp() {
  return new Date();
}

// Pour debug : retourne l'UID du bot via Firebase Auth REST.
export async function getBotUid() {
  const idToken = await signInBot();
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!r.ok) throw new Error(`getBotUid ${r.status}`);
  const j = await r.json();
  return j.users?.[0]?.localId || null;
}
