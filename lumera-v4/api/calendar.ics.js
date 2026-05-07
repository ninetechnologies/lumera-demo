// Endpoint ICS feed : genere un fichier iCalendar (RFC 5545) avec toutes les
// reservations Firestore. Loulou s'abonne via Google Calendar / Outlook /
// Apple Calendar > "Ajouter un agenda > A partir d'une URL".
//
// Le calendrier client pull le fichier toutes les ~heures (Google : 1-24h,
// Apple : 5-15min selon config). Sync unidirectionnelle : resas du site -> calendrier.
//
// Securite : l'URL contient un token secret (env var CALENDAR_TOKEN) car
// l'ICS expose le contenu (nom, telephone, email du client). Sans token = 401.
// Le token doit etre long (32+ chars) et stocke sur Vercel comme env var
// "Sensitive". Fournir l'URL complete uniquement aux admins (Loulou + MA).
//
// Env vars :
//   CALENDAR_TOKEN        -> token secret (32+ chars), genere via crypto.randomBytes
//   FIREBASE_BOT_EMAIL    -> bot pour lire Firestore
//   FIREBASE_BOT_PASSWORD -> idem

import { restList } from '../lib/firestoreRest.js';

// Echappe les chars speciaux ICS (RFC 5545 section 3.3.11).
// Backslash, virgule, point-virgule, retour ligne -> escape.
function icsEscape(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Format date YYYYMMDDTHHMMSSZ (UTC).
function icsDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// Convertit dateISO (YYYY-MM-DD) + startHour (int) + dureeHours (int)
// en {start, end} Date objects (UTC). Loulou est en France (UTC+1 hiver,
// UTC+2 ete). Les startHour sont en heure locale Europe/Paris.
// Approximation : on assume UTC+2 (DST ete) car la plupart des resas
// seront pour les mois ete. Pour etre 100% correct il faudrait calculer
// le DST exact selon la date — overkill pour MVP.
function buildDates(dateISO, startHour, dureeHours) {
  const [y, m, d] = dateISO.split('-').map(Number);
  // Si dateISO entre fin oct et fin mars : UTC+1 (CET)
  // Sinon : UTC+2 (CEST)
  const month = m;
  const isWinter = month <= 3 || month >= 11; // approximation
  const tzOffsetHours = isWinter ? 1 : 2;
  const start = new Date(Date.UTC(y, m - 1, d, startHour - tzOffsetHours, 0, 0));
  const end = new Date(start.getTime() + dureeHours * 60 * 60 * 1000);
  return { start, end };
}

function buildIcs(reservations) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lumera Studio//Reservations//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Lumera Studio — Réservations',
    'X-WR-TIMEZONE:Europe/Paris',
    'X-WR-CALDESC:Toutes les réservations confirmées du studio Lumera.'
  ];

  const now = icsDate(new Date());

  for (const r of reservations) {
    if (!r.dateISO || r.startHour == null || r.dureeHours == null) continue;
    const { start, end } = buildDates(r.dateISO, r.startHour, r.dureeHours);

    const summary = `${r.service || 'Reservation'} — ${r.prenom || ''} ${r.nom || ''}`.trim();
    const description = [
      `Client : ${r.prenom || ''} ${r.nom || ''}`,
      r.email ? `Email : ${r.email}` : null,
      r.telephone ? `Tel : ${r.telephone}` : null,
      r.creneau ? `Creneau : ${r.creneau}` : null,
      r.prix != null ? `Prix : ${r.prix}€ (acompte ${r.acompte || 0}€ paye, solde ${r.prix - (r.acompte || 0)}€ sur place)` : null,
      r.projet ? `Projet : ${r.projet}` : null,
      r.stripeSessionId ? `Stripe : ${r.stripeSessionId}` : null
    ].filter(Boolean).join('\\n');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${r.id}@lumerastudio.fr`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${icsDate(start)}`);
    lines.push(`DTEND:${icsDate(end)}`);
    lines.push(`SUMMARY:${icsEscape(summary)}`);
    lines.push(`DESCRIPTION:${icsEscape(description)}`);
    lines.push('LOCATION:7 rue Louis Courtois de Vicose Bât.10, 31100 Toulouse');
    lines.push('STATUS:CONFIRMED');
    lines.push('TRANSP:OPAQUE');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  // ICS attend des CRLF entre chaque ligne (RFC 5545 section 3.1).
  return lines.join('\r\n') + '\r\n';
}

export default async function handler(req, res) {
  // Authentification par token secret (en query string ou header).
  const expectedToken = process.env.CALENDAR_TOKEN;
  if (!expectedToken) {
    return res.status(500).json({ error: 'CALENDAR_TOKEN non configure' });
  }
  const providedToken = req.query.token || req.headers['x-calendar-token'];
  if (providedToken !== expectedToken) {
    return res.status(401).json({ error: 'Token invalide' });
  }

  try {
    const reservations = await restList('reservations');
    const ics = buildIcs(reservations);

    // Headers ICS standards.
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="lumera-reservations.ics"');
    // Cache court : Google Calendar refresh ~1h, on permet un cache de 30min
    // pour reduire la charge si plusieurs clients (Loulou + admin) s'abonnent.
    res.setHeader('Cache-Control', 'public, max-age=1800');
    return res.status(200).send(ics);
  } catch (err) {
    console.error('[calendar.ics]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
