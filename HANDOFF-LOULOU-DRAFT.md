# Brouillon message handoff Loulou — Lumera Studio

> À envoyer à Loulou par email/SMS/WhatsApp dès validation MA.
> Date prévue : 2026-05-07
> ⚠ Stripe encore en mode TEST — à basculer en LIVE avant envoi.

---

## Version courte (SMS / WhatsApp)

```
Salut Loulou, le site est en ligne sur lumerastudio.fr. Tes accès admin et la sync Google Calendar sont prêts — je t'envoie le détail par mail. Bonne journée. — Marc-Antoine
```

---

## Version mail

**Objet :** Lumera Studio — Tes accès admin + sync Google Calendar

---

Salut Loulou,

Le site est en ligne sur **lumerastudio.fr**. Voici tout ce qu'il te faut pour le piloter au quotidien.

### 1. Espace admin (suivi des réservations)

- **URL** : https://www.lumerastudio.fr/admin
- **Email** : lumerastudio31@gmail.com
- **Mot de passe initial** : `h9TbPd47gSghXZ0HIIzjBGxI3wd2`

Tu peux changer ton mot de passe à tout moment via le bouton "Mot de passe oublié" sur la page de connexion (tu recevras un mail de réinitialisation Firebase).

Le dashboard admin te donne :
- la liste de toutes les réservations confirmées (paiement Stripe OK)
- le détail client (nom, email, tel, créneau, prix, acompte payé, solde restant à percevoir sur place)
- le filtre par date, par service, par statut
- l'export CSV si besoin de la facturation à part

### 2. Synchro Google Calendar (toutes les résa s'ajoutent dans ton agenda)

Tu peux abonner ton Google Calendar (ou Apple Calendar / Outlook) au calendrier des réservations Lumera : chaque résa confirmée apparaît automatiquement comme événement dans ton agenda.

**Sur Google Calendar (ordinateur)** :
1. Va sur https://calendar.google.com
2. Dans la barre de gauche, à côté de "Autres agendas", clique sur le `+`
3. Choisis "À partir d'une URL"
4. Colle cette URL :

```
https://www.lumerastudio.fr/api/calendar.ics?token=c63cd50b2995f898846ae4ddb1e30c5a6a1ceeec2911e603
```

5. Clique "Ajouter un agenda"

Google met à jour automatiquement entre 1 et 24h. Sur Apple Calendar c'est plus rapide (5-15 min).

⚠ **Cette URL est secrète** : elle expose les noms et téléphones de tes clients. Ne la partage pas. Si tu penses qu'elle a fuité, dis-moi, je la régénère.

**Sur ton iPhone (Apple Calendar)** :
1. Réglages → Calendrier → Comptes → Ajouter un compte → Autre
2. "Ajouter un agenda CalDAV" — non, choisir "Ajouter un calendrier abonné"
3. Coller l'URL ci-dessus

### 3. Réservations — comment ça marche

Le client choisit un créneau, paie l'acompte (30% du total) en CB sur Stripe, reçoit un mail de confirmation. La résa apparaît dans ton dashboard et dans ton agenda. Le solde se règle sur place le jour J.

Si un client annule, contacte-moi pour gérer le remboursement Stripe (selon tes CGV).

### 4. À surveiller la 1ère semaine

- Les mails de confirmation client arrivent bien (il a déjà testé sur ton mail perso, ça marche)
- Les résa apparaissent dans le dashboard ET dans ton Google Calendar
- Le formulaire de réservation s'affiche bien sur mobile (tu m'as remonté quelques bugs visuels — fixés. Si tu en revois, fais Ctrl+Shift+R / glisser pour rafraîchir le cache du navigateur, sinon screenshot et je regarde)

### 5. Si tu as un souci

WhatsApp / SMS / mail : 06 04 11 42 84 / marc-antoine@ninetechnologies.fr

L'abonnement maintenance 39€/mois inclut : monitoring, corrections de bugs, mises à jour de sécurité, petits ajustements de contenu (textes, photos, prix).

Bon studio !

Marc-Antoine
Nine Technologies
