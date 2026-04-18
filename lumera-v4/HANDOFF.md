# Lumera Studio — Handoff session Claude Code

> Document de passation pour une nouvelle session Claude Code qui reprendrait le projet Lumera v4.
> Dernière mise à jour : **2026-04-18** — rédigé en fin de session après livraison des pages SEO.

---

## 1. Contexte projet

- **Client** : Lumera Studio (marque exploitée par **KLF RECORDS S.A.S**, Toulouse)
- **Contact dirigeant** : Loulou IANNUCCI
- **Contrat commercial** : `C-2026-003` — **990€** (site vitrine) + **39€/mois** (maintenance)
- **Tél** : 06 32 17 68 58 · **Email** : lumerastudio31@gmail.com
- **Adresse** : 7 rue Louis Courtois de Viçose, Bât. 10, 31100 Toulouse
- **Instagram** : [@lumerastudio31](https://www.instagram.com/lumerastudio31/)
- **Domaine prod visé** : `lumera-studio.fr` (à confirmer / non encore pointé)
- **Hébergement cible** : Vercel
- **SIRET** : *à compléter* (le client ne l'a pas encore fourni — placeholders dans les mentions légales)

Activité : location de plateaux photo/vidéo/podcast à Toulouse + prestations shooting + location matériel cinéma en partenariat avec **KLF Équipement**.

---

## 2. Localisation du code

```
C:\Users\ninet\Desktop\nine-tech\04-projets-en-cours\lumera\lumera-v4\
```

**Fichiers principaux :**
- `index.html` (~2667 lignes) — single-page avec hero, présentation, plateaux, galerie, location, prestations, tarifs, abonnement, accès, process, **formulaire de réservation temps réel**
- `locations.html` — page SEO dédiée location plateaux + matériel KLF (créée 2026-04-18)
- `prestations-tarifs.html` — page SEO dédiée services + grille tarifaire (créée 2026-04-18)
- `sitemap.xml` · `robots.txt` · `vercel.json` (cleanUrls + redirects)
- `images/` — logo.png, hero.jpg, cyclorama.jpg, podcast.jpg, grand-espace.jpg, gal1-4.jpg, presentation.jpg, fx.jpg

**Repo git** : `04-projets-en-cours/lumera/` est un repo `origin/main` (track `ninetechnologies/lumera`… à confirmer avec `git remote -v`).

**Dev server** : `npx serve 04-projets-en-cours/lumera/lumera-v4 -l 3005` (config dans le `.claude/launch.json` racine workspace, entry name `lumera-v4`).

---

## 3. Charte graphique (source de vérité)

```css
--noir:    #070707   /* fond principal */
--noir-2:  #0d0d0d   /* fond sections alternées */
--noir-3:  #121212   /* hover backgrounds */
--orange:  #E8500A   /* accent principal — CTAs, highlights */
--orange-h:#FF6220   /* hover sur orange */
--blanc:   #F4F2EE   /* texte principal (jamais blanc pur) */
--dim:     rgba(244,242,238,.5)   /* texte secondaire */
--faint:   rgba(244,242,238,.06)  /* backgrounds cards */
--line:    rgba(244,242,238,.07)  /* bordures */
```

**Typographies** :
- Titres : `'Bebas Neue', sans-serif` (400 uniquement)
- Corps : `'DM Sans', sans-serif` (300, 400, 500)

**Règles visuelles** :
- Grain overlay SVG noise (opacity .028) en fixed sur body::before
- Hover cards : `border-color` passe à orange + `translateY(-4px)`
- Animations subtiles (`.r` + `.v` via IntersectionObserver pour le reveal on scroll)
- Aucun blanc pur · aucun dégradé flashy · pas d'emojis

---

## 4. Architecture des pages livrées

### `index.html` — page principale
Sections dans l'ordre (IDs) : `#hero` → `#presentation` → `#plateaux` → `#galerie` → `#location` → `#prestations` → `#tarifs` → `#abonnement` → `#acces` → `#process` → `#reservation`.

**Navbar (mise à jour 2026-04-18)** :
```
Le studio (#presentation) · Locations (locations.html) · Prestations & tarifs (prestations-tarifs.html) · Accès (#acces) · Réserver [CTA] (#reservation)
```

### `locations.html` — SEO location
- **Target keywords** : "location studio photo toulouse", "location cyclorama toulouse", "location plateau vidéo toulouse", "location matériel photo toulouse", "location caméra cinéma toulouse", "studio podcast toulouse"
- **Structure** : Breadcrumb → Hero H1 → Plateaux (3 cards) → Specs plateau complet → Matériel KLF (4 cards) → Avantages (6 tuiles) → FAQ (6 Q/R) → CTA final → Footer
- **JSON-LD** : LocalBusiness, BreadcrumbList, 3 Products

### `prestations-tarifs.html` — SEO prestations + tarifs
- **Target keywords** : "tarif studio photo toulouse", "forfait shooting toulouse", "tournage clip toulouse", "shooting produit toulouse", "prestation vidéo toulouse", "book mannequin toulouse"
- **Structure** : Breadcrumb → Hero H1 → Price rows (4) → Forfaits plateau (1h/4h/8h/10h) → Heures sup + nocturne + soirée → Prestations cards (3 publics) → Abonnement créateurs → Modalités (acompte/paiement/annulation/caution) → FAQ (6 Q/R) → CTA final → Footer
- **JSON-LD** : LocalBusiness, BreadcrumbList, 3 Services, **FAQPage**

Les deux pages secondaires sont **autonomes** (CSS inline, même variables CSS que index) mais **n'incluent pas le formulaire de réservation** — tous les CTAs pointent vers `index.html#reservation`.

### `vercel.json`
```json
{
  "cleanUrls": true,
  "trailingSlash": false,
  "redirects": [
    { "source": "/location", "destination": "/locations", "permanent": true },
    { "source": "/tarifs", "destination": "/prestations-tarifs", "permanent": true },
    { "source": "/prestations", "destination": "/prestations-tarifs", "permanent": true }
  ]
}
```

---

## 5. Système de réservation temps réel (présent dans `index.html`)

**Architecture implémentée (mock, prêt pour Firestore)** :

- Format slot standardisé : `YYYY-MM-DD_HH-mm` (ex: `2026-05-12_14-00`)
- Constantes (ligne ~2215) : `SLOT_HOURS = [9,10,11,12, 14,15,16,17, 18,19,20,21]`
- Durées acceptées : `DUREE_HOURS = { '1':1, '4':4, '8':8, '10':10, 'soiree':3 }`
- Storage : `localStorage` clé `lumera_mock_slots_v1` (simule Firestore)
- Latence simulée : `setTimeout(520)` dans `tryLockSlots`
- Rollback atomique si un slot est pris pendant la tentative de lock

**Fonctions clés** :
- `slotsBlockedByBooking(startHour, dureeHours)` → gère wrap 24h
- `isStartValid(dateISO, startHour, dureeHours, takenSet)` → vérifie qu'un start candidat accueille toute la durée
- `tryLockSlots(slotIds)` → Promise résolue avec `{ ok:true, locked }` ou `{ ok:false, reason:'TAKEN', conflict }`

**Cohérence bidirectionnelle** (demandée par MA) :
- Changer la durée → re-render grid avec nouveaux starts invalides
- Changer la date → reset grid entier
- Sélectionner slot puis changer durée rendant le slot invalide → auto-désélection

**Tarifs réservation** (ligne ~2188) :
```js
FORFAITS = {
  'Plateau complet': { 1:90, 4:320, 8:560, 10:650, soiree:300 },
  'Cyclorama':       { 1:80, 4:280, 8:480, 10:580, soiree:260 },
  'Studio Podcast':  { 1:60, 4:220, 8:380, 10:460, soiree:200 }
};
```

**À faire côté prod backend (Sprint 3)** :
- Remplacer localStorage par Firestore `slots/{YYYY-MM-DD_HH-mm}` avec `{pris, resaId, lockedAt}`
- `runTransaction` atomique pour lecture + verrou en une opération
- Cloud Function TTL 15min qui relibère si paiement Stripe non reçu
- `onSnapshot` pour UI live (autres clients voient le verrou)
- Intégration Stripe (acompte 30%)
- EmailJS pour confirmation + rappel

---

## 6. Conformité légale française (intégrée dans les 3 pages)

**3 modales HTML réutilisées à l'identique dans index / locations / prestations-tarifs** :
- `#mentionsLegalesModal` — LCEN art. 6-III : éditeur KLF RECORDS SAS, Loulou IANNUCCI directeur publication, Vercel hébergeur, propriété intellectuelle (CPI L.335-2), droit applicable Toulouse. **SIRET à compléter**.
- `#cgsModal` — CGS : acompte 30% Stripe, annulation 48h, rétractation L.221-28 Code conso, médiation L.611-1 (médiateur à désigner), droit français / tribunaux Toulouse.
- `#rgpdModal` — RGPD : responsable traitement, données collectées, finalités, durée conservation 3 ans, droits RGPD, sous-traitants (Vercel UE / EmailJS US+CCT / Stripe PCI-DSS), réclamation CNIL.

**Cookie banner** (localStorage key `lumera_cookies_ack_v1`) : affiché une fois, message strict "données nécessaires uniquement, zéro cookie publicitaire, zéro tracker tiers".

**Checkbox RGPD** dans le formulaire de réservation : custom avec V orange au check (via `:checked::after` avec rotate + border).

---

## 7. Éléments UI partagés

- **WhatsApp flottant** : `.whatsapp-btn` bottom-right 24px, pulsation `waPulse 2.4s`, tooltip "Discutons sur WhatsApp", link `https://wa.me/33632176858`. Mobile : décalé à `bottom:78px` pour ne pas chevaucher `.sticky-cta`.
- **Sticky CTA mobile** : `.sticky-cta` affichée uniquement <768px, link vers `#reservation`.
- **Modales légales** : close au clic outside + touche Escape.
- **Burger menu** : 3 spans → X animé en croix, `.mobile-menu.open` en fixed full-screen.
- **Reveal scroll** : classe `.r` + `.v` ajoutée par IntersectionObserver (threshold .1), delays `.d1`-`.d5`.

---

## 8. Ce qui a été fait dans cette session (chronologique)

1. **Avant compaction** (pré-résumé) :
   - Système réservation temps réel avec verrou slot (mock localStorage → Firestore-ready)
   - Cohérence bidirectionnelle durée ↔ slots
   - Fix checkbox RGPD : V orange apparaît bien au check
   - Audit conformité française + création des 3 modales (mentions, CGS, RGPD enrichi)
   - Ajout WhatsApp flottant façon site vitrine Nine Tech
   - Cookie banner RGPD

2. **Après compaction — pages SEO (cette session)** :
   - Création `locations.html` (SEO location + plateaux + matériel KLF)
   - Création `prestations-tarifs.html` (SEO tarifs + prestations + abonnement)
   - Navbar & footer `index.html` mis à jour pour pointer vers les 2 nouvelles pages
   - `sitemap.xml`, `robots.txt`, `vercel.json` ajoutés
   - JSON-LD sur chaque page (LocalBusiness, BreadcrumbList, Products/Services, FAQPage sur prestations-tarifs)
   - Vérification DOM via preview port 3005 — tous les composants (cards, FAQ, modales, WhatsApp) présents sur les 2 pages

---

## 9. TODO / à faire ensuite

### Contenu à compléter (client-dépendant)
- [ ] **SIRET KLF RECORDS SAS** + capital social à intégrer dans `#mentionsLegalesModal` (3 pages)
- [ ] **Nom du médiateur consommation** à inscrire dans `#cgsModal` (3 pages)
- [ ] Sélection finale des images client depuis `../DSC08117.zip` (≈250 photos — **ne pas supprimer ce ZIP tant que site non livré**, cf. mémoire `project_lumera.md`)

### Technique / backend
- [ ] Remplacer mock localStorage par vrai Firestore + Cloud Functions (voir section 5)
- [ ] Intégration Stripe pour acompte 30%
- [ ] EmailJS pour confirmations et rappels
- [ ] Ajout Open Graph image optimisée (1200×630) spécifique à chaque page SEO
- [ ] Tests iOS Safari réel (bug sidebar compressée déjà vu sur L'Access / khmer-compta)
- [ ] Lighthouse audit perf + accessibilité

### SEO
- [ ] Vérifier que le domaine `lumera-studio.fr` pointe bien sur Vercel avant d'annoncer les URLs dans Google Search Console
- [ ] Soumettre `sitemap.xml` à GSC après déploiement
- [ ] Créer/vérifier fiche Google Business Profile (pour le rich snippet local)

### Déploiement
- [ ] Première deploy Vercel à faire : `git push origin main` → déclenche le build auto
- [ ] Vérifier que `cleanUrls` fonctionne en prod (`/locations` au lieu de `/locations.html`)
- [ ] Vérifier que les redirects 301 (`/location` → `/locations`, etc.) fonctionnent

---

## 10. Conventions à respecter (CLAUDE.md workspace)

- **Stack** : HTML/CSS/JS vanilla (pas de framework)
- **Zéro base64 dans le code** — images toujours fichiers externes
- **Tous les changements prod via Claude Code** — même 1 ligne. Pas de modif direct sur GitHub.
- **Processus** : montrer diff → validation Marc-Antoine → commit → test immédiat
- **Logo** : `images/logo.png` (fichier externe, transparent)
- **Pas de mentions "Nine Technologies" visibles** sur le site Lumera (on est le prestataire invisible, sauf mention crédits dans `#mentionsLegalesModal`)

---

## 11. Commandes utiles

```bash
# Dev
cd /c/Users/ninet/Desktop/nine-tech/04-projets-en-cours/lumera/lumera-v4
npx serve . -l 3005

# Git
cd /c/Users/ninet/Desktop/nine-tech/04-projets-en-cours/lumera
git status
git add lumera-v4/index.html lumera-v4/locations.html lumera-v4/prestations-tarifs.html lumera-v4/sitemap.xml lumera-v4/robots.txt lumera-v4/vercel.json
git commit -m "..."
git push origin main
```

Server config (`.claude/launch.json` racine) :
```json
{
  "name": "lumera-v4",
  "runtimeExecutable": "npx",
  "runtimeArgs": ["serve", "04-projets-en-cours/lumera/lumera-v4", "-l", "3005"],
  "port": 3005
}
```

---

*Session suivante : lire ce document en premier, puis `CLAUDE.md` racine, puis la mémoire `project_lumera.md`.*
