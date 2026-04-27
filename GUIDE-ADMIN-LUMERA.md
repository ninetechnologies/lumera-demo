# Guide d'utilisation — Dashboard Admin Lumera Studio

Ce guide explique comment gérer les réservations de ton studio via l'interface admin.

---

## 🔐 Accès

**Deux façons d'y accéder :**

1. **Directement** : tape `lumera-studio.fr/admin` dans la barre d'adresse
2. **Discrètement** : sur n'importe quelle page du site, **double-clique sur le logo Lumera** en haut à gauche → tu arrives sur la page de connexion admin

**Connexion** :
- Email : celui qu'on a défini ensemble lors de la création du compte
- Mot de passe : celui que tu as choisi

**Mot de passe oublié ?** Dis-le moi, je te regénère un accès en 2 min.

**Déconnexion** : bouton en haut à droite — pense à le faire si tu utilises un ordi partagé.

---

## 📊 Le tableau de bord

Quand tu te connectes, tu vois 4 chiffres en haut :

| Indicateur | Ce que ça veut dire |
|------------|---------------------|
| **Réservations** | Nombre total de réservations dans le système (toutes statuts confondus) |
| **À venir** | Réservations confirmées dont la date n'est pas encore passée |
| **CA confirmé** | Montant total (en €) des prestations confirmées (acompte + solde à venir) |
| **Ce mois-ci** | Nombre de réservations confirmées sur le mois en cours |

Ces chiffres se mettent à jour **en direct** : si un client paie son acompte pendant que tu es sur la page, tu le vois apparaître sans rafraîchir.

---

## 🗂️ Les filtres

Sous les chiffres, 5 onglets :

- **Toutes** : tout afficher
- **À venir** : prestations futures uniquement (utile pour préparer ta semaine)
- **Passées** : prestations déjà effectuées (historique)
- **Confirmées** : réservations payées et actives
- **Annulées** : réservations annulées (manuellement ou par le client)

À côté des onglets : une **barre de recherche** pour filtrer par nom, email ou téléphone — pratique si un client t'appelle et tu veux retrouver sa résa vite.

---

## 📋 La liste des réservations

Chaque ligne contient :

- **Date & créneau** : jour et horaires de la prestation
- **Client** : prénom + nom + email
- **Prestation** : type (Cyclorama, Grand Espace, Shooting forfait…)
- **Durée** : 2h, 4h, 6h, 8h…
- **Montant** : total de la presta en € (acompte + solde)
- **Statut** : Confirmée (vert) / Annulée (rouge)
- **Bouton Détails** : clique pour voir toutes les infos

---

## 🔍 Fiche détail d'une réservation

Quand tu cliques sur **Détails**, tu vois :

- Coordonnées complètes du client (téléphone, email)
- Description du projet qu'il a saisie au moment de la résa
- Détails de la prestation (plateau, durée, créneau précis)
- Montants : total, acompte payé (30%), solde à récupérer sur place
- ID Stripe du paiement (pour référence comptable)
- Horodatage : date/heure de la réservation

**Actions possibles** :
- **Annuler la réservation** : libère le créneau pour qu'un autre client puisse réserver. ⚠️ Ne rembourse PAS automatiquement l'acompte — il faudra faire le remboursement manuellement dans ton dashboard Stripe (voir ci-dessous).

---

## 💰 Gérer les remboursements (Stripe)

Si tu dois rembourser un acompte après annulation :

1. Connecte-toi sur [dashboard.stripe.com](https://dashboard.stripe.com)
2. Menu **Paiements** → cherche le paiement par montant, date ou email client
3. Clique dessus → bouton **Rembourser**
4. Choisis **Rembourser le montant total** ou un montant partiel
5. Le client est remboursé sous 5-10 jours ouvrés sur sa carte

**Conseil** : avant de rembourser, vérifie ta politique d'annulation dans les CGS du site (délai mini, conditions).

---

## 📧 Les emails automatiques

Tu n'as **rien à faire** pour les emails — ils partent tout seuls :

- **À chaque nouvelle réservation payée** :
  - Le client reçoit un mail récap avec date, créneau, acompte payé, solde
  - Tu reçois un mail de notification à `ninetechnologies@outlook.fr` (à remplacer par ton email pro quand tu me le donnes)

Si un client te dit ne pas avoir reçu le mail :
1. Vérifie ses **spams / indésirables** (1er réflexe)
2. Vérifie l'email dans la fiche détail de sa résa (faute de frappe possible)
3. Dis-le moi, je peux renvoyer manuellement

---

## 📅 Planning des créneaux

Le système gère le planning **automatiquement** :

- Quand un client choisit un créneau, il est **verrouillé 15 min** le temps de payer
- S'il ne paie pas, le créneau se libère et redevient réservable
- S'il paie, le créneau est **bloqué définitivement** et disparaît des choix possibles pour les autres clients
- Si tu annules une résa depuis l'admin, le créneau est **libéré** et redevient réservable

**Pas de double-booking possible** — même si deux clients tentent de réserver pile au même moment, un seul passera.

---

## 🆘 Que faire si…

### Un client m'appelle pour modifier sa résa
Actuellement, il n'y a pas de bouton "modifier" (à ajouter plus tard si besoin). Pour l'instant :
1. Annule sa résa depuis l'admin (créneau libéré)
2. Demande-lui de refaire une résa sur le site avec les bonnes infos
3. Rembourse l'ancien acompte si besoin, le nouveau sera débité sur la nouvelle résa

### Un client ne se présente pas (no-show)
- L'acompte de 30% est **gardé** (couvert par les CGS)
- Note-le dans tes propres outils si tu veux le blacklister
- Pas d'action technique à faire côté site

### Le site semble down ou un client ne peut pas réserver
- Appelle-moi directement : **06 04 11 42 84**
- Je suis sous contrat de maintenance mensuelle, donc c'est couvert

### Je veux modifier les tarifs ou les forfaits shooting
- Dis-moi les changements par message → je les intègre dans la journée
- Les nouveaux tarifs s'appliquent uniquement aux **nouvelles** réservations (les anciennes gardent leur prix d'origine)

### Je veux ajouter/retirer un plateau ou une formule
- Pareil : écris-moi → je l'intègre

---

## 🔒 Sécurité

- **Ne partage JAMAIS tes identifiants admin** — si quelqu'un d'autre doit accéder, dis-le moi pour créer un second compte admin
- Si tu perds ton téléphone ou ton ordi, préviens-moi tout de suite pour que je révoque l'accès
- Toutes les communications site ↔ serveur sont chiffrées (HTTPS + Firebase)
- Les paiements passent par Stripe — **aucune donnée bancaire n'est stockée** sur le site

---

## 📞 Support

**Marc-Antoine Pavadé — Nine Technologies**
📞 06 04 11 42 84
📧 marc-antoine@ninetechnologies.fr
🌐 ninetechnologies.fr

Dispo en semaine, réponse dans la journée ouvrée sur les demandes normales, urgences gérées ASAP.

---

*Guide v1 — avril 2026. Mis à jour à chaque évolution du dashboard.*
