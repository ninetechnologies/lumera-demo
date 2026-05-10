// Tests unitaires pour lib/pricing.js — utilise node --test (built-in
// test runner, pas de dépendance externe). Lancer avec : npm test
//
// Couvre les regles tarifs Loulou (vocal 10/05/2026) :
// - Plateau jour (10h-20h) : tarif fixe
// - Plateau nocturne (20h-23h) : 1h=120, 2h=220, 3h=300 (table directe)
// - Plateau 4h/8h chevauchant 20h : tarif jour + 20E/h debordant
// - Plateau soiree 3h : tarif fixe 300E (depart 20h)
// - Podcast : tarif jour partout (pas de nocturne, ferme 22h)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePrice, ACOMPTE_RATIO,
  STUDIO_OUVERTURE, PLATEAU_FERMETURE, PODCAST_FERMETURE,
  NIGHT_HOUR, NIGHT_SURCHARGE_PER_HOUR,
  isValidSlotId, isSlotsConsistent, isValidEmail, sanitizeText
} from './pricing.js';

describe('Constantes', () => {
  test('Constantes horaires correspondent au vocal Loulou 10/05', () => {
    assert.equal(STUDIO_OUVERTURE, 10);
    assert.equal(PLATEAU_FERMETURE, 23);
    assert.equal(PODCAST_FERMETURE, 22);
    assert.equal(NIGHT_HOUR, 20);
    assert.equal(NIGHT_SURCHARGE_PER_HOUR, 20);
    assert.equal(ACOMPTE_RATIO, 0.30);
  });
});

describe('computePrice — Plateau complet, tarifs JOUR (start < 20h)', () => {
  test('1h depart 10h = 90E', () => {
    const r = computePrice('Plateau complet', '1', 10);
    assert.deepEqual(r, { total: 90, acompte: 27, solde: 63 });
  });
  test('1h depart 19h = 90E (jour pur, fin 20h pile)', () => {
    const r = computePrice('Plateau complet', '1', 19);
    assert.equal(r.total, 90);
  });
  test('2h depart 18h = 180E (jour pur, fin 20h)', () => {
    const r = computePrice('Plateau complet', '2', 18);
    assert.equal(r.total, 180);
  });
  test('3h depart 17h = 270E (jour pur, fin 20h)', () => {
    const r = computePrice('Plateau complet', '3', 17);
    assert.equal(r.total, 270);
  });
  test('4h depart 10h = 320E (jour pur)', () => {
    const r = computePrice('Plateau complet', '4', 10);
    assert.equal(r.total, 320);
  });
  test('4h depart 16h = 320E (fin 20h pile, jour pur)', () => {
    const r = computePrice('Plateau complet', '4', 16);
    assert.equal(r.total, 320);
  });
  test('8h depart 12h = 560E (fin 20h pile, jour pur)', () => {
    const r = computePrice('Plateau complet', '8', 12);
    assert.equal(r.total, 560);
  });
});

describe('computePrice — Plateau complet, tarifs NOCTURNE (start >= 20h)', () => {
  test('1h depart 20h = 120E (nocturne direct)', () => {
    const r = computePrice('Plateau complet', '1', 20);
    assert.deepEqual(r, { total: 120, acompte: 36, solde: 84 });
  });
  test('1h depart 22h = 120E (dernier creneau possible)', () => {
    const r = computePrice('Plateau complet', '1', 22);
    assert.equal(r.total, 120);
  });
  test('2h depart 20h = 220E (nocturne direct, 110E/h)', () => {
    const r = computePrice('Plateau complet', '2', 20);
    assert.deepEqual(r, { total: 220, acompte: 66, solde: 154 });
  });
  test('2h depart 21h = 220E (nocturne direct)', () => {
    const r = computePrice('Plateau complet', '2', 21);
    assert.equal(r.total, 220);
  });
  test('3h depart 20h = 300E (nocturne direct, = soiree)', () => {
    const r = computePrice('Plateau complet', '3', 20);
    assert.deepEqual(r, { total: 300, acompte: 90, solde: 210 });
  });
});

describe('computePrice — Plateau complet, MAJORATION partielle (4h/8h chevauchant 20h)', () => {
  test('4h depart 17h = 320E (fin 21h, 1h nocturne, +20E)', () => {
    const r = computePrice('Plateau complet', '4', 17);
    assert.equal(r.total, 340); // 320 + 1*20
  });
  test('4h depart 18h = 360E (fin 22h, 2h nocturne, +40E)', () => {
    const r = computePrice('Plateau complet', '4', 18);
    assert.equal(r.total, 360); // 320 + 2*20
  });
  test('4h depart 19h = 380E (fin 23h, 3h nocturne, +60E)', () => {
    const r = computePrice('Plateau complet', '4', 19);
    assert.equal(r.total, 380); // 320 + 3*20
  });
  test('8h depart 13h = 580E (fin 21h, 1h nocturne, +20E)', () => {
    // 13h n'est pas un slot offert (pause 13h-14h) mais le calcul reste valide
    const r = computePrice('Plateau complet', '8', 13);
    assert.equal(r.total, 580); // 560 + 1*20
  });
  test('8h depart 14h = 600E (fin 22h, 2h nocturne, +40E)', () => {
    const r = computePrice('Plateau complet', '8', 14);
    assert.deepEqual(r, { total: 600, acompte: 180, solde: 420 });
  });
  test('8h depart 15h = 620E (fin 23h, 3h nocturne, +60E)', () => {
    const r = computePrice('Plateau complet', '8', 15);
    assert.equal(r.total, 620);
  });
});

describe('computePrice — Plateau soiree (forfait fixe)', () => {
  test('soiree depart 20h = 300E (forfait fixe, pas de calcul)', () => {
    const r = computePrice('Plateau complet', 'soiree', 20);
    assert.deepEqual(r, { total: 300, acompte: 90, solde: 210 });
  });
});

describe('computePrice — Studio Podcast (pas de nocturne, ferme 22h)', () => {
  test('1h depart 10h = 120E', () => {
    const r = computePrice('Studio Podcast', '1', 10);
    assert.equal(r.total, 120);
  });
  test('1h depart 21h = 120E (PAS de majoration nocturne sur Podcast)', () => {
    const r = computePrice('Studio Podcast', '1', 21);
    assert.equal(r.total, 120);
  });
  test('2h depart 20h = 240E (pas de nocturne)', () => {
    const r = computePrice('Studio Podcast', '2', 20);
    assert.equal(r.total, 240);
  });
  test('4h depart 18h = 440E (degressif, fin 22h, pas de nocturne)', () => {
    const r = computePrice('Studio Podcast', '4', 18);
    assert.equal(r.total, 440);
  });
  test('8h depart 14h = 800E (degressif, fin 22h, pas de nocturne)', () => {
    const r = computePrice('Studio Podcast', '8', 14);
    assert.deepEqual(r, { total: 800, acompte: 240, solde: 560 });
  });
  test('soiree depart 20h = 360E (Podcast tarif fixe soiree)', () => {
    const r = computePrice('Studio Podcast', 'soiree', 20);
    assert.equal(r.total, 360);
  });
});

describe('computePrice — Backward compat sans startHour', () => {
  test('Plateau 1h sans startHour = 90E (tarif jour par defaut)', () => {
    const r = computePrice('Plateau complet', '1');
    assert.equal(r.total, 90);
  });
  test('Plateau 4h sans startHour = 320E (jour, pas de majo calculable)', () => {
    const r = computePrice('Plateau complet', '4');
    assert.equal(r.total, 320);
  });
  test('Podcast 8h sans startHour = 800E (jour, identique a avec startHour)', () => {
    const r = computePrice('Studio Podcast', '8');
    assert.equal(r.total, 800);
  });
});

describe('computePrice — Cas invalides retournent null', () => {
  test('Service inconnu = null', () => {
    assert.equal(computePrice('Plateau Inexistant', '1', 10), null);
  });
  test('Duree inconnue = null', () => {
    assert.equal(computePrice('Plateau complet', '99', 10), null);
  });
  test('Service vide = null', () => {
    assert.equal(computePrice('', '1', 10), null);
  });
  test('Duree vide = null', () => {
    assert.equal(computePrice('Plateau complet', '', 10), null);
  });
});

describe('computePrice — Acompte calcule correctement (30%)', () => {
  test('Acompte arrondi a l\'entier le plus proche', () => {
    const r = computePrice('Plateau complet', '1', 10);
    assert.equal(r.acompte, 27); // 90 * 0.30 = 27
  });
  test('Acompte sur 220E nocturne = 66E', () => {
    const r = computePrice('Plateau complet', '2', 20);
    assert.equal(r.acompte, 66); // 220 * 0.30 = 66
  });
  test('Solde = total - acompte', () => {
    const r = computePrice('Plateau complet', '8', 14);
    assert.equal(r.solde, r.total - r.acompte);
  });
});

describe('isValidSlotId', () => {
  test('Format YYYY-MM-DD_HH-MM valide', () => {
    assert.equal(isValidSlotId('2026-05-15_14-00'), true);
    assert.equal(isValidSlotId('2026-12-31_22-00'), true);
  });
  test('Formats invalides', () => {
    assert.equal(isValidSlotId('invalid'), false);
    assert.equal(isValidSlotId('2026-5-15_14-00'), false); // pas zero-padded
    assert.equal(isValidSlotId(''), false);
    assert.equal(isValidSlotId(null), false);
    assert.equal(isValidSlotId(123), false);
  });
});

describe('isSlotsConsistent', () => {
  test('Liste compatible avec duree', () => {
    assert.equal(
      isSlotsConsistent(['2026-05-15_14-00', '2026-05-15_15-00'], '2'),
      true
    );
  });
  test('Liste vide invalide', () => {
    assert.equal(isSlotsConsistent([], '1'), false);
  });
  test('Liste plus longue que duree invalide', () => {
    assert.equal(
      isSlotsConsistent(
        ['2026-05-15_14-00', '2026-05-15_15-00', '2026-05-15_16-00'],
        '1'
      ),
      false
    );
  });
  test('Slot avec format invalide rejette', () => {
    assert.equal(
      isSlotsConsistent(['invalid'], '1'),
      false
    );
  });
});

describe('isValidEmail', () => {
  test('Emails valides', () => {
    assert.equal(isValidEmail('test@example.com'), true);
    assert.equal(isValidEmail('a@b.c'), true);
  });
  test('Emails invalides', () => {
    assert.equal(isValidEmail('no-at-sign'), false);
    assert.equal(isValidEmail('@nodomain.com'), false);
    assert.equal(isValidEmail('no@dot'), false);
    assert.equal(isValidEmail(''), false);
    assert.equal(isValidEmail(null), false);
  });
});

describe('sanitizeText', () => {
  test('Trim + limite length', () => {
    assert.equal(sanitizeText('  hello  ', 10), 'hello');
    assert.equal(sanitizeText('aaaa', 2), 'aa');
  });
  test('Supprime control chars', () => {
    assert.equal(sanitizeText('hel\x00lo\x1Fworld'), 'helloworld');
  });
  test('Non-string retourne string vide', () => {
    assert.equal(sanitizeText(null), '');
    assert.equal(sanitizeText(123), '');
    assert.equal(sanitizeText(undefined), '');
  });
});
