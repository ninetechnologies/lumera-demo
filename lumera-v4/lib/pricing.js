// Grille tarifaire Lumera — source de verite SERVEUR.
// Doit rester synchrone avec FORFAITS dans index.html (ligne ~2187).
// Toute modif de prix doit etre faite ici ET dans index.html simultanement.

export const FORFAITS = {
  'Plateau complet': { '1': 90, '4': 320, '8': 560, '10': 650, 'soiree': 300 },
  'Cyclorama':       { '1': 80, '4': 280, '8': 480, '10': 580, 'soiree': 260 },
  'Studio Podcast':  { '1': 60, '4': 220, '8': 380, '10': 460, 'soiree': 200 }
};

export const DUREE_LABEL = {
  '1': '1h',
  '4': '4h',
  '8': '8h',
  '10': '10h',
  'soiree': 'Soiree 3h'
};

export const DUREE_HOURS = {
  '1': 1, '4': 4, '8': 8, '10': 10, 'soiree': 3
};

export const ACOMPTE_RATIO = 0.30;

// Calcule le prix total + acompte pour un service + duree. Retourne null si
// le couple est invalide.
export function computePrice(service, duree) {
  const grid = FORFAITS[service];
  if (!grid) return null;
  const total = grid[duree];
  if (typeof total !== 'number' || total <= 0) return null;
  const acompte = Math.round(total * ACOMPTE_RATIO);
  return { total, acompte, solde: total - acompte };
}

const SLOT_RE = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/;
export function isValidSlotId(id) {
  return typeof id === 'string' && SLOT_RE.test(id);
}

// Verifie que la liste de slotIds est compatible avec la duree declaree.
// Note : slotIds.length peut etre < hours legitimement quand la duree traverse
// des heures hors creneaux offerts (pause 13h, nuit). On accepte donc tout
// nombre de slots entre 1 et hours, tous au format valide. Le prix est
// recalcule cote serveur depuis la grille — pas de risque de fraude.
export function isSlotsConsistent(slotIds, duree) {
  const hours = DUREE_HOURS[duree];
  if (!hours) return false;
  if (!Array.isArray(slotIds) || slotIds.length === 0) return false;
  if (slotIds.length > hours) return false;
  return slotIds.every(isValidSlotId);
}

// Sanitise un champ texte libre : enleve les controls chars, trim, limite length.
export function sanitizeText(val, maxLen = 500) {
  if (typeof val !== 'string') return '';
  return val.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maxLen);
}

// Valide email basique (la vraie validation se fait a l'envoi mail / par Stripe).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(v) {
  return typeof v === 'string' && EMAIL_RE.test(v) && v.length <= 200;
}
