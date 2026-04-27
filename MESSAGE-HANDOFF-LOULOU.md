# Lumera Studio — Récap livraison & actions de ton côté

Salut Loulou,

Ton site **lumera-studio.fr** est techniquement finalisé. Avant la mise en ligne publique et pour que tout tourne proprement, voici la liste exhaustive de ce qui est **de mon côté** (déjà fait) et de **ton côté** (à faire). J'ai classé par ordre de priorité.

---

## ✅ Ce qui est déjà en place (Nine Technologies)

- Site complet (accueil, locations, prestations & tarifs, contact, mentions légales, CGS, confidentialité)
- Galerie photos + section FX + forfaits shooting
- Système de réservation en temps réel avec verrouillage des créneaux (plus de double-booking)
- Paiement en ligne de l'acompte 30 % via Stripe Checkout
- Webhook Stripe côté serveur : la réservation n'est créée en base **qu'après** confirmation réelle du paiement (zéro fausse résa)
- Idempotence serveur (impossible de créer deux fois la même résa, même si le client rafraîchit)
- Emails automatiques via Resend (confirmation client + notification admin + alerte en cas de paiement orphelin)
- Cron de nettoyage auto toutes les 15 min (libère les créneaux abandonnés)
- Dashboard admin pour gérer les réservations (`lumera-studio.fr/admin`)
- Règles de sécurité Firestore strictes (coordonnées clients illisibles sans être admin)
- Hébergement Vercel + base de données Firebase (fournis et gérés par Nine Tech)
- Tests paiement validés en environnement de test Stripe

---

## 🚨 BLOQUANTS — à faire AVANT mise en ligne publique

### 1. Créer ton compte Stripe KLF RECORDS SAS
Actuellement le site utilise **mon** compte Stripe Nine Technologies pour les tests. Pour la production, les paiements doivent arriver sur **ton** compte Stripe KLF RECORDS SAS.

- Va sur [stripe.com](https://stripe.com) → "Créer un compte"
- Raison sociale : **KLF RECORDS SAS**
- Fournis ton KBIS + pièce d'identité + RIB pro KLF
- Une fois validé (24-48h), tu me transmets (par message sécurisé) :
  - La **clé secrète LIVE** (commence par `sk_live_...`)
- Je configure la clé sur Vercel, puis je crée dans ton dashboard Stripe un **webhook** qui notifiera le site à chaque paiement (événements `checkout.session.completed` + `checkout.session.expired`). Je récupère le secret du webhook (`whsec_...`) et je le configure aussi sur Vercel. Plus rien ne passe par mon compte.

### 2. Configurer le DNS lumera-studio.fr
Le domaine doit pointer vers Vercel pour que le site soit accessible sur `lumera-studio.fr`.

- Dis-moi chez quel registrar tu as acheté le domaine (OVH, Gandi, IONOS, Google Domains…)
- Je t'envoie les enregistrements DNS exacts à ajouter (1 A record + 1 CNAME)
- Tu les ajoutes dans l'interface du registrar — ou tu me donnes un accès temporaire et je le fais
- Propagation DNS : 1 à 24h max
- SSL : automatique (Vercel s'en occupe)

### 3. Médiateur de la consommation (obligation légale BtoC)
Depuis 2016, tout pro vendant à des particuliers **doit** adhérer à un médiateur agréé CECMC et le mentionner dans ses CGS/CGV.

- Adhère à un médiateur agréé — ex : [CM2C](https://www.cm2c.net/) (~40-75€/an), [Medicys](https://www.medicys.fr/), [AME Conso](https://www.ameconso.org/)
- Une fois l'adhésion validée, transmets-moi :
  - Nom du médiateur
  - Son URL officielle
- J'intègre l'info dans les CGS en 5 min

### 4. Nom légal sur les mentions
Actuellement j'ai mis "Louka IANNUCCI" partout (nom INPI). Confirme-moi :
- C'est bien ton nom légal KLF RECORDS ? Ou tu préfères "Loulou" / autre nom commercial ?
- SIRET KLF RECORDS SAS à me communiquer pour les mentions légales
- Adresse du siège KLF (si différente du 7 rue Louis Courtois de Viçose)

### 5. Contenu photos & textes
- **Photos** : il faut finaliser la sélection parmi les ~250 photos du ZIP (DSC08117). Envoie-moi les noms des fichiers retenus ou un nouveau ZIP "final"
- **Textes** : relis les 3 pages principales et dis-moi si tu veux modifier quoi que ce soit
- **Logo** : si tu veux une version haute def ou un lifting, envoie-le

### 6. Email d'envoi `reservations@lumera-studio.fr`
Pour que les emails de confirmation partent depuis **ton** domaine (pas le mien), il faut que `lumera-studio.fr` soit vérifié chez **Resend** (notre prestataire d'envoi d'emails).

- Action de ton côté : **aucune**, je m'en charge entièrement une fois le DNS (point 2) propagé.
- Ce que je vais faire : ajouter 3 enregistrements DNS (SPF + DKIM + return-path) dans la zone `lumera-studio.fr`. Soit tu me donnes l'accès registrar, soit je t'envoie les valeurs exactes à coller.
- Résultat : les clients reçoivent les confirmations depuis `reservations@lumera-studio.fr` et toi les notifs depuis la même adresse — 100 % sous ta marque.

---

## 📈 IMPORTANT — à faire dans la semaine de la mise en ligne

### 6. Google Business Profile
Sans ça, "Lumera Studio Toulouse" n'apparaîtra pas dans Google Maps ni dans la carte locale Google.

- Va sur [business.google.com](https://business.google.com)
- Crée une fiche "Lumera Studio"
- Adresse : **7 rue Louis Courtois de Viçose, 31100 Toulouse**
- Catégorie principale : "Studio de photographie" (ou "Studio d'enregistrement" selon ton orientation)
- Horaires, téléphone, site `lumera-studio.fr`
- Ajoute 8-10 photos du studio
- Google va envoyer un code de vérification par courrier à l'adresse (5-10 jours)

### 7. Google Search Console
Pour que ton site soit indexé et que tu puisses suivre les recherches.

- Va sur [search.google.com/search-console](https://search.google.com/search-console)
- Ajoute une propriété → entre `lumera-studio.fr`
- Méthode de vérification : je te donnerai un fichier HTML ou un enregistrement DNS TXT à ajouter
- Une fois vérifié, on soumet le sitemap `lumera-studio.fr/sitemap.xml`

### 8. (Optionnel) Google Analytics
Si tu veux suivre le trafic, nombre de visiteurs, pages vues, conversions.

- Crée un compte sur [analytics.google.com](https://analytics.google.com)
- Donne-moi l'ID de mesure (format `G-XXXXXXXXXX`)
- Je l'intègre dans le site

---

## 💶 Contrat & facturation

- **Contrat C-2026-003** signé ✅
- **Acompte de démarrage (30%)** : à régler selon ce qui est prévu au contrat, si pas déjà fait
- **Mensualité 39€/mois** : activée à partir du jour de la mise en ligne sur `lumera-studio.fr`
  - Couvre : hébergement Vercel + base Firebase + maintenance + support + EmailJS
  - Prélèvement automatique via Stripe (je t'envoie le lien de configuration)
- **Solde final** : selon échéancier du contrat

---

## 🎛️ Ton accès admin

**URL** : `lumera-studio.fr/admin`
**Email** : celui que tu m'as donné pour le compte admin
**Mot de passe** : celui qu'on a défini ensemble (ou reset possible par email)

Je te fournis un guide d'utilisation détaillé séparément (document "GUIDE-ADMIN-LUMERA").

Accès alternatif : **double-clique sur le logo Lumera** en haut à gauche de n'importe quelle page du site pour arriver directement sur la page admin (astuce discrète pour toi).

---

## 📞 Récap — ce que j'attends de toi pour finaliser

| # | Action | Qui | Blocage ? |
|---|--------|-----|-----------|
| 1 | Compte Stripe KLF RECORDS + clé `sk_live_...` | Toi | 🚨 Oui |
| 2 | Registrar DNS + accès ou modifs à faire | Toi | 🚨 Oui |
| 3 | Adhésion médiateur + infos | Toi | 🚨 Oui |
| 4 | Confirmation nom légal + SIRET KLF | Toi | 🚨 Oui |
| 5 | Sélection finale photos + validation textes | Toi | 🚨 Oui |
| 6 | Vérification domaine Resend (DNS emails) | Moi (suite au point 2) | 🚨 Oui |
| 7 | Google Business Profile | Toi | Non (post-lancement) |
| 8 | Google Search Console (je t'assiste) | Toi + Moi | Non (post-lancement) |
| 9 | Google Analytics (optionnel) | Toi | Non |
| 10 | Règlement échéances contrat | Toi | Selon échéancier |

Une fois les points 1 à 5 validés, je bascule le site en production sur `lumera-studio.fr` le jour que tu choisis.

---

## 🔐 Côté Nine Technologies — check-list technique de mise en prod

*(Pour info — je gère tout, rien à faire de ton côté)*

- [ ] Remplacer `STRIPE_SECRET_KEY` par la clé live de KLF sur Vercel
- [ ] Créer le webhook Stripe sur le dashboard KLF (events `checkout.session.completed` + `checkout.session.expired` → `https://lumera-studio.fr/api/stripe-webhook`)
- [ ] Renseigner `STRIPE_WEBHOOK_SECRET` (whsec_...) sur Vercel
- [ ] Générer un service account Firebase Admin et poser le JSON dans `FIREBASE_ADMIN_SA` sur Vercel
- [ ] Créer compte Resend, vérifier le domaine `lumera-studio.fr`, renseigner `RESEND_API_KEY` + `RESEND_FROM` sur Vercel
- [ ] Renseigner `ADMIN_NOTIFY_EMAIL` (l'adresse qui reçoit les notifs) sur Vercel
- [ ] Déployer les `firestore.rules` strictes
- [ ] Confirmer que le cron `cleanup-locks` tourne toutes les 15 min
- [ ] Test end-to-end : faire un paiement test en live mode et vérifier l'apparition de la résa + les deux emails

---

Tu peux me répondre point par point au fur et à mesure que tu avances, ou me dire si tu veux qu'on fasse un call de 30 min pour débloquer tout ça ensemble.

**Marc-Antoine Pavadé — Entrepreneur Individuel (EI)**
Nine Technologies
📞 06 04 11 42 84
📧 marc-antoine@ninetechnologies.fr
