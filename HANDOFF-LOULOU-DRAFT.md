# Brouillon message handoff Loulou — Lumera Studio

> À envoyer à Loulou par email/WhatsApp dès bascule Stripe live + test e2e validé.
> Dernière MAJ : 2026-05-10 (post-vocal Loulou tarifs nocturnes)
> ⚠ Ne PAS envoyer tant que Stripe n'est pas en mode LIVE.

---

## Version courte (SMS / WhatsApp)

```
Salut Loulou, le site est opérationnel sur lumerastudio.fr — paiements activés. Tarifs et horaires intégrés selon ton dernier vocal. Je t'envoie tout par mail (accès admin + agenda Google + récap fonctionnel). Bonne journée. — Marc-Antoine
```

---

## Version mail

**Objet :** Lumera Studio — Tes accès + sync Google Calendar + récap fonctionnel

---

Salut Loulou,

Le site est en ligne sur **lumerastudio.fr** avec paiements Stripe activés. Voici tout ce qu'il te faut pour piloter l'activité.

### 1. Espace admin (suivi des réservations)

- **URL** : https://www.lumerastudio.fr/admin
- **Email** : lumerastudio31@gmail.com
- **Mot de passe** : `h9TbPd47gSghXZ0HIIzjBGxI3wd2`

Tu peux changer le mot de passe à tout moment via le bouton "Mot de passe oublié" sur la page de connexion (un mail de réinitialisation arrive en 2 minutes).

Le dashboard admin te donne :
- la liste de toutes les réservations confirmées (paiement Stripe OK)
- le détail client : nom, email, tel, créneau, prix total, acompte 30% payé, **solde restant à percevoir sur place**
- filtre par date, par service (Plateau / Podcast)
- export CSV pour ta compta

### 2. Synchro Google Calendar — toutes les résa s'ajoutent dans ton agenda

Chaque réservation confirmée apparaît automatiquement dans ton agenda Google (ou Apple Calendar / Outlook) avec les infos client, prix, créneau.

**URL secrète à utiliser** :
```
https://www.lumerastudio.fr/api/calendar.ics?token=3a8e1f5c9b2d7e4a6c8b1f9d3e5a7c2b8d4f1e6a9c3b7d5e8f2a1c4b6d9e3f7a
```

⚠ Cette URL contient un **token secret** qui expose noms et téléphones de tes clients. À ne partager à personne. Si tu penses qu'elle a fuité (vol de tel, partage par erreur), dis-moi, je la régénère en 30 secondes.

**Sur Google Calendar (depuis ordinateur)** :
1. Va sur https://calendar.google.com
2. Sidebar gauche, à côté de "Autres agendas", clique sur le `+`
3. Choisis "À partir d'une URL"
4. Colle l'URL ci-dessus
5. Clique "Ajouter un agenda"

Google met à jour entre 1h et 24h (pas immédiat — comportement Google, pas réglable).

**Sur iPhone (Apple Calendar)** — sync plus rapide, 5-15 min :
1. Réglages iPhone → Calendrier → Comptes → Ajouter un compte → Autre
2. "Ajouter un calendrier abonné"
3. Coller l'URL ci-dessus → Suivant → Enregistrer

**Sur Outlook** :
1. Calendrier → Ajouter un calendrier → "S'abonner depuis le web"
2. Coller l'URL → Importer

### 3. Récap des tarifs intégrés sur le site

Selon ton dernier vocal (10/05), voici la grille tarifaire intégrée :

#### Plateau complet 90m²

| Durée | Tarif jour (10h-20h) | Tarif nocturne (20h-23h) |
|---|---|---|
| 1h | 90 € | 120 € |
| 2h | 180 € | 220 € |
| 3h | 270 € | 300 € |
| 4h (demi-journée) | 320 € | majoration |
| 8h (journée) | 560 € | majoration |
| Forfait soirée 3h | 300 € (départ 20h fixe) | — |

**Pour les forfaits 4h et 8h qui chevauchent la zone nocturne (20h-23h)** : majoration partielle de **20 €/h** pour chaque heure qui dépasse 20h.

Exemples concrets :
- Plateau 4h départ 19h → fin 23h, 3h en nocturne = 320 + 60 = **380 €**
- Plateau 8h départ 14h → fin 22h, 2h en nocturne = 560 + 40 = **600 €**
- Plateau 8h départ 15h → fin 23h, 3h en nocturne = 560 + 60 = **620 €**
- Plateau 8h départ 12h → fin 20h, jour pur = **560 €**

**Plateau ouvert 10h-23h** (jour 10h-20h, nocturne 20h-23h).

#### Studio Podcast

| Durée | Tarif (10h-22h, pas de majoration nocturne) |
|---|---|
| 1h | 120 € |
| 2h | 240 € |
| 3h | 360 € |
| 4h (demi-journée) | 440 € |
| 8h (journée) | 800 € |
| Forfait soirée 3h | 360 € (départ 20h fixe) |

**Studio Podcast ouvert 10h-22h**, sans majoration nocturne (comme tu l'as précisé : moins de bruit la nuit).

### 4. Réservation côté client — comment ça marche

1. Le client choisit Plateau ou Podcast, durée, date, créneau
2. Le récap prix s'affiche **juste au-dessus du bouton "Confirmer ma réservation"** (avec total / acompte 30% / solde sur place)
3. Il valide → redirection Stripe Checkout
4. Il paie l'**acompte 30%** par CB
5. Sa résa apparaît dans ton dashboard admin + dans ton agenda
6. Il reçoit un mail de confirmation avec tous les détails
7. Le solde (70%) est réglé sur place le jour J

### 5. Pour le hors-grille (ce que tu fais à la main)

Tout ce qui sort de la grille auto du site (plage exceptionnelle, devis sur mesure, créneaux après 23h, rabais commercial, location matériel KLF, prestations à la prod) reste sur **WhatsApp / Instagram / téléphone** — comme tu fais déjà. Le site est là pour automatiser le standard, pas pour remplacer le sur-mesure.

Si un client demande un créneau impossible sur le site (ex : 8h démarrant à 16h finissant minuit), il sera bloqué côté grille. Renvoie-le sur WhatsApp.

### 6. À surveiller la 1ère semaine

- Les mails de confirmation client arrivent bien (testé en mode test, à reconfirmer en live)
- Les résa apparaissent dans le dashboard ET dans ton Google Calendar
- Si un client te dit "j'ai payé mais je n'ai rien reçu", check le dashboard admin (toutes les résa Stripe paid sont là), puis dis-le-moi pour qu'on regarde ensemble

### 7. Si tu as un souci

WhatsApp / SMS / mail : 06 04 11 42 84 / marc-antoine@ninetechnologies.fr

L'abonnement maintenance 39 €/mois inclut : monitoring (je suis alerté si le site plante), corrections de bugs, mises à jour de sécurité, petits ajustements de contenu (textes, photos, prix, ajout d'un nouveau forfait quand tu en demandes un, etc.).

Bon studio.

Marc-Antoine
Nine Technologies
