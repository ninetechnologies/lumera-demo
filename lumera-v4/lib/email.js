// Envoi d'emails transactionnels via Resend.
// Env vars requises :
//   RESEND_API_KEY    -> re_...
//   RESEND_FROM       -> ex: "Lumera Studio <reservations@lumera-studio.fr>"
//                        (le domaine doit etre verifie dans Resend)
//   ADMIN_NOTIFY_EMAIL -> email qui recoit les notifs admin (Loulou)

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

async function sendViaResend(payload) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY manquant');
  const r = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Resend ${r.status}: ${txt}`);
  }
  return r.json();
}

function esc(s) {
  return String(s || '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
}

function buildClientHtml(r) {
  return `<!doctype html>
<html lang="fr"><body style="font-family:Arial,sans-serif;background:#070707;color:#F4F2EE;padding:32px;">
<div style="max-width:560px;margin:0 auto;background:#0d0d0d;padding:32px;border:1px solid rgba(244,242,238,.1);">
  <h1 style="font-family:'Bebas Neue',sans-serif;color:#E8500A;letter-spacing:.08em;">RESERVATION CONFIRMEE</h1>
  <p>Bonjour ${esc(r.prenom)},</p>
  <p>Ta reservation chez <strong>Lumera Studio</strong> est confirmee. Voici le recap :</p>
  <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:14px;">
    <tr><td style="padding:10px 0;border-bottom:1px solid rgba(244,242,238,.08);color:rgba(244,242,238,.5);">Plateau</td><td style="text-align:right;padding:10px 0;border-bottom:1px solid rgba(244,242,238,.08);">${esc(r.service)} &middot; ${esc(r.dureeLabel || r.duree)}</td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid rgba(244,242,238,.08);color:rgba(244,242,238,.5);">Date</td><td style="text-align:right;padding:10px 0;border-bottom:1px solid rgba(244,242,238,.08);">${esc(r.dateFR)}</td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid rgba(244,242,238,.08);color:rgba(244,242,238,.5);">Creneau</td><td style="text-align:right;padding:10px 0;border-bottom:1px solid rgba(244,242,238,.08);">${esc(r.creneau)}</td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid rgba(244,242,238,.08);color:rgba(244,242,238,.5);">Total</td><td style="text-align:right;padding:10px 0;border-bottom:1px solid rgba(244,242,238,.08);">${r.prix}€</td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid rgba(244,242,238,.08);color:#E8500A;">Acompte paye</td><td style="text-align:right;padding:10px 0;border-bottom:1px solid rgba(244,242,238,.08);color:#E8500A;font-weight:600;">${r.acompte}€</td></tr>
    <tr><td style="padding:10px 0;color:rgba(244,242,238,.5);">Solde sur place</td><td style="text-align:right;padding:10px 0;">${r.solde || (r.prix - r.acompte)}€</td></tr>
  </table>
  <p style="font-size:13px;color:rgba(244,242,238,.5);">Adresse : 7 rue Louis Courtois de Vicose, 31100 Toulouse</p>
  <p style="font-size:13px;color:rgba(244,242,238,.5);">Une question ? Reponds simplement a cet email ou appelle le 06 32 17 68 58.</p>
  <p style="font-size:12px;color:rgba(244,242,238,.3);margin-top:32px;">Lumera Studio &mdash; KLF RECORDS SAS</p>
</div></body></html>`;
}

function buildAdminHtml(r) {
  return `<!doctype html>
<html lang="fr"><body style="font-family:Arial,sans-serif;padding:20px;">
<h2 style="color:#E8500A;">Nouvelle reservation Lumera</h2>
<table style="border-collapse:collapse;font-size:14px;">
  <tr><td style="padding:6px 12px;color:#666;">Client</td><td style="padding:6px 12px;"><strong>${esc(r.prenom)} ${esc(r.nom)}</strong></td></tr>
  <tr><td style="padding:6px 12px;color:#666;">Email</td><td style="padding:6px 12px;"><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></td></tr>
  <tr><td style="padding:6px 12px;color:#666;">Tel</td><td style="padding:6px 12px;"><a href="tel:${esc(r.telephone)}">${esc(r.telephone)}</a></td></tr>
  <tr><td style="padding:6px 12px;color:#666;">Plateau</td><td style="padding:6px 12px;">${esc(r.service)} &middot; ${esc(r.dureeLabel || r.duree)}</td></tr>
  <tr><td style="padding:6px 12px;color:#666;">Date</td><td style="padding:6px 12px;">${esc(r.dateFR)} &middot; ${esc(r.creneau)}</td></tr>
  <tr><td style="padding:6px 12px;color:#666;">Montant</td><td style="padding:6px 12px;"><strong>${r.prix}€</strong> (acompte ${r.acompte}€ paye &middot; solde ${r.solde || (r.prix - r.acompte)}€ sur place)</td></tr>
  <tr><td style="padding:6px 12px;color:#666;vertical-align:top;">Projet</td><td style="padding:6px 12px;">${esc(r.projet) || '<em>(non precise)</em>'}</td></tr>
  <tr><td style="padding:6px 12px;color:#666;">Stripe</td><td style="padding:6px 12px;font-family:monospace;font-size:12px;">${esc(r.stripeSessionId || '')}</td></tr>
</table>
<p><a href="https://lumera-studio.fr/admin">Ouvrir le dashboard admin</a></p>
</body></html>`;
}

export async function sendClientConfirmation(resa) {
  const from = process.env.RESEND_FROM || 'Lumera Studio <reservations@lumera-studio.fr>';
  return sendViaResend({
    from,
    to: [resa.email],
    subject: `Reservation confirmee — ${resa.dateFR || ''} ${resa.creneau || ''}`.trim(),
    html: buildClientHtml(resa),
    reply_to: process.env.ADMIN_NOTIFY_EMAIL || undefined
  });
}

export async function sendAdminNotification(resa) {
  const from = process.env.RESEND_FROM || 'Lumera Studio <reservations@lumera-studio.fr>';
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) throw new Error('ADMIN_NOTIFY_EMAIL manquant');
  return sendViaResend({
    from,
    to: [to],
    subject: `Nouvelle resa — ${resa.prenom} ${resa.nom} — ${resa.dateFR || ''}`.trim(),
    html: buildAdminHtml(resa),
    reply_to: resa.email || undefined
  });
}

export async function sendOrphanAlert({ sessionId, amount, email }) {
  const from = process.env.RESEND_FROM || 'Lumera Studio <reservations@lumera-studio.fr>';
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return;
  return sendViaResend({
    from,
    to: [to],
    subject: `⚠️ Paiement Stripe orphelin — ${sessionId}`,
    html: `<p>Un paiement Stripe a ete recu mais AUCUN payload pending_reservation n'a ete trouve.</p>
<ul>
  <li>Session : <code>${esc(sessionId)}</code></li>
  <li>Montant : ${amount/100}€</li>
  <li>Email client : ${esc(email || '(inconnu)')}</li>
</ul>
<p>Action : contacter le client pour recuperer les details de sa resa, puis creer la resa manuellement via la console Firebase.</p>`
  });
}
