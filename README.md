# Compagnon de jeu — Chroniques Oubliées Fantasy (homebrew)

Une web-app **sans serveur** pour jouer à votre version maison de COF en ligne :
création de personnage qui connaît **vos voies homebrew** (Voie du chaos, etc.),
fiches vivantes, lanceur de dés. À utiliser à côté de Discord (voix).

## Fonctionnalités

- **Création** : 7 classes (Guerrier, Barde, Chasseur, Druide, Prêtre, Enchanteur, Nécromancien) avec toutes les voies et capacités issues de vos PDF. Règles appliquées (2 capacités de rang 1 au départ, rangs débloqués dans l'ordre).
- **Caractéristiques** : modificateurs, PV et DEF calculés automatiquement (modifiables).
- **Fiche vivante** : PV avec compteur +/−, modificateurs, capacités détaillées, boutons d'attaque et de test reliés au lanceur de dés.
- **Dés** : dés simples, jet personnalisé (`2d6+3`), avantage/désavantage, critiques, historique.
- **Règles** : référence complète et navigable de chaque classe.
- **Lore** : l'univers de la campagne.
- **Sauvegarde** : locale (dans le navigateur) + **export/import `.json`** pour partager une fiche sur Discord.

## Tester en local

Ouvre simplement `index.html` dans ton navigateur — ça suffit pour jouer en solo.
Pour un comportement identique au déploiement, sers le dossier :

```bash
# depuis le dossier jdr-cof
python -m http.server 8765
# puis ouvre http://localhost:8765
```

## Déployer gratuitement sur GitHub Pages (recommandé)

Permet à chaque joueur d'ouvrir l'app via un simple lien, **sans que tu héberges quoi que ce soit**.

1. Crée un dépôt GitHub (ex. `cof-compagnon`) et pousse le contenu de ce dossier :
   ```bash
   cd "jdr-cof"
   git init
   git add .
   git commit -m "Compagnon de jeu COF"
   git branch -M main
   git remote add origin https://github.com/<ton-pseudo>/cof-compagnon.git
   git push -u origin main
   ```
2. Sur GitHub : **Settings → Pages → Source : Deploy from a branch → Branch : `main` / `root` → Save**.
3. Au bout d'une minute, ton app est en ligne sur :
   `https://<ton-pseudo>.github.io/cof-compagnon/`
4. Colle ce lien dans votre Discord. Chacun crée sa fiche de son côté.

> Alternatives tout aussi gratuites et sans config : **Netlify Drop** (glisse le dossier sur app.netlify.com/drop) ou **Cloudflare Pages**.

## Jouer avec les potes

- **Discord** : salon vocal pour parler ; le MJ peut partager son écran pour la carte/les combats.
- **App** : chacun gère sa fiche et lance ses dés. Pour montrer un résultat, capture d'écran ou annonce vocale.
- **Partager une fiche** : bouton *Exporter* → envoie le `.json` sur Discord → l'autre fait *Importer*.

## Structure du projet

```
jdr-cof/
├── index.html          # page unique (onglets)
├── css/style.css       # thème parchemin/violet
├── js/app.js           # logique (création, fiche, dés, sauvegarde)
└── data/donnees.js     # TES données : 7 classes + lore (source de vérité)
```

Pour corriger une capacité ou ajuster une voie, édite `data/donnees.js`.

## Idées pour la suite (phase 2)

- **Multijoueur temps réel** (voir les fiches/PV des autres en direct) via Firebase ou un petit service gratuit — sans serveur à gérer.
- **Carte + jetons** partagés dans l'app.
- **Gestion de la jauge de Chaos** (Corruption de Sort / Corruption de Fureur) avec suivi automatique.
- **Compteurs d'usage** (capacités L, x/combat, x/scénario, doses d'alcool, âmes...).

---
*Données extraites des fiches de création maison + lore. COF est édité par Black Book Éditions ; ce compagnon non officiel est à usage privé pour votre table.*
