// Grille tarifaire Lumera — source de verite SERVEUR.
// Doit rester synchrone avec la constante FORFAITS dans index.html (chercher
// "const FORFAITS = {" dans le bloc <script> principal). Toute modif de prix
// doit etre faite ici ET dans index.html simultanement.
//
// Refonte 08/05/2026 (msg Loulou WhatsApp) : retrait des "demi-journee + Xh"
// (5h, 6h, 7h, 10h) qui n'auraient jamais du exister.
// Ajout 08/05/2026 : durees 2h et 3h en categorie "a l'heure", separees
// des forfaits. Tarifs 2h/3h confirmes par Loulou (vocal 08/05).
// Correction 08/05 : tarifs Podcast 4h et 8h corriges (etait 480/960 en
// lineaire pur 120E/h, est passe a 440/800 en tarif degressif Loulou).
// Grille active : 1h, 2h, 3h | 4h demi-journee, 8h journee | soiree 3h.
//
// Nocturne (>= 20h) : majoration tarifaire en cours de specification
// (1h nocturne Plateau = 120E, 3h = 300E confirmes par Loulou. Manque
// tarifs 2h nocturne et tous tarifs Podcast nocturne — relance envoyee).

export const FORFAITS = {
  'Plateau complet': {
    '1': 90,
    '2': 180,
    '3': 270,
    '4': 320,
    '8': 560,
    'soiree': 300
  },
  'Studio Podcast': {
    '1': 120,
    '2': 240,
    '3': 360,
    '4': 440,   // Correction 08/05 : etait 480 (lineaire pur), Loulou confirme 440 (degressif)
    '8': 800,   // Correction 08/05 : etait 960 (lineaire pur), Loulou confirme 800 (degressif)
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

// ─── Tarifs nocturnes (Plateau complet uniquement, à partir de 20h) ─────
// Confirmes par Loulou (vocal 10/05/2026) :
// - 1h nocturne : 120E
// - 2h nocturne : 220E (110E/h)
// - 3h nocturne : 300E (= meme prix que le forfait soiree fixe 300E)
//
// Studio Podcast : pas de majoration nocturne. Loulou (10/05) : "moins de
// bruit la nuit, ça m'arrange". Tarifs Podcast identiques jour/nuit.
export const FORFAITS_NOCTURNE = {
  'Plateau complet': { '1': 120, '2': 220, '3': 300 }
};

// ─── Plage horaire et majoration nocturne ───────────────────────────────
export const STUDIO_OUVERTURE = 10;     // 10h (jour + nocturne)
export const PLATEAU_FERMETURE = 23;    // Plateau ferme a 23h (incluant nocturne)
export const PODCAST_FERMETURE = 22;    // Podcast ferme a 22h (pas de nocturne)
export const NIGHT_HOUR = 20;           // Plateau : >= 20h = zone nocturne
export const NIGHT_SURCHARGE_PER_HOUR = 20; // Plateau : +20E/h sur les heures
                                            // debordant >= 20h pour les forfaits
                                            // 4h et 8h (vocal Loulou 10/05).

// Calcule le prix total + acompte pour un service + duree + startHour.
// Retourne null si le couple est invalide.
//
// Logique nocturne :
// 1. Studio Podcast : tarif jour partout, peu importe l'heure.
// 2. Plateau soiree 3h : tarif fixe FORFAITS['Plateau complet']['soiree'] (300E).
// 3. Plateau 1h/2h/3h démarrant >= NIGHT_HOUR : tarif nocturne direct
//    depuis FORFAITS_NOCTURNE (120 / 220 / 300).
// 4. Plateau 4h/8h chevauchant la zone nocturne : tarif jour + 20E par
//    heure debordante (Loulou : majoration partielle).
// 5. Plateau 1h/2h/3h démarrant < NIGHT_HOUR (jour pur) : tarif jour fixe.
//
// startHour est optionnel. Sans, on retourne tarif jour (utile pour
// l'affichage initial du récap avant que le client ait choisi un créneau).
export function computePrice(service, duree, startHour) {
  const grid = FORFAITS[service];
  if (!grid) return null;
  const tarifJour = grid[duree];
  if (typeof tarifJour !== 'number' || tarifJour <= 0) return null;

  let total = tarifJour;

  // Cas 1 : Podcast → tarif jour partout
  // Cas 2 : Plateau soiree → tarif jour fixe (300E)
  // Cas 3-5 : Plateau, autre durée, avec startHour valide → calcul nocturne
  if (service === 'Plateau complet'
      && duree !== 'soiree'
      && startHour != null) {
    const startNum = Number(startHour);
    const hours = DUREE_HOURS[duree];
    if (Number.isInteger(startNum) && hours != null) {
      const nocturneTable = FORFAITS_NOCTURNE['Plateau complet'];
      // Cas 3 : 1h/2h/3h démarrant >= 20h → tarif nocturne direct
      if (startNum >= NIGHT_HOUR && nocturneTable[duree] != null) {
        total = nocturneTable[duree];
      } else {
        // Cas 4 (4h/8h) ou cas hybride : majoration partielle
        const heuresNocturnes = Math.max(0, (startNum + hours) - NIGHT_HOUR);
        total = tarifJour + heuresNocturnes * NIGHT_SURCHARGE_PER_HOUR;
      }
    }
  }

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
