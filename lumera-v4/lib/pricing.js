// Grille tarifaire Lumera — source de verite SERVEUR.
// Doit rester synchrone avec la constante FORFAITS dans index.html (chercher
// "const FORFAITS = {" dans le bloc <script> principal). Toute modif de prix
// doit etre faite ici ET dans index.html simultanement.
//
// Refonte 08/05/2026 (msg Loulou WhatsApp) : retrait des "demi-journee + Xh"
// (5h, 6h, 7h, 10h) qui n'auraient jamais du exister.
// Ajout 08/05/2026 (selon msg Loulou "1h, 2h, 3h en heures separees") :
// les durees 2h et 3h en categorie "a l'heure", separees des forfaits.
// Grille active : 1h, 2h, 3h | 4h demi-journee, 8h journee | soiree 3h.
// TODO Loulou : tarifs 2h et 3h en placeholder lineaire pur (90E/h Plateau,
// 120E/h Podcast). A confirmer ou ajuster a reception du tarif officiel.
// TODO Loulou : forfait journee+soiree (11h consecutives) a ajouter
// quand le tarif sera communique.

export const FORFAITS = {
  'Plateau complet': {
    '1': 90,
    '2': 180,   // TODO Loulou : tarif placeholder lineaire (90 x 2)
    '3': 270,   // TODO Loulou : tarif placeholder lineaire (90 x 3)
    '4': 320,
    '8': 560,
    'soiree': 300
  },
  'Studio Podcast': {
    '1': 120,
    '2': 240,   // TODO Loulou : tarif placeholder lineaire (120 x 2)
    '3': 360,   // TODO Loulou : tarif placeholder lineaire (120 x 3)
    '4': 480,
    '8': 960,
    'soiree': 360
  }
};

export const DUREE_LABEL = {
  '1': '1h',
  '2': '2h',
  '3': '3h',
  '4': '4h',
  '8': '8h',
  'soiree': 'Soiree 3h'
};

export const DUREE_HOURS = {
  '1': 1, '2': 2, '3': 3, '4': 4, '8': 8, 'soiree': 3
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
