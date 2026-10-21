# Règles de la 2.0 — écrites à la main

Décidé le 20/10/2026 : la 2.0 bascule directement sur la refonte des
classes et de la magie (doc « Refonte classes et magie — cadre », projet
JDR). Ses règles vivent ici, en TypeScript, **écrites à la main**.

À ne pas confondre avec `src/donnees/` : ces JSON-là sont **générés depuis
la v1** et ne se modifient jamais à la main. Ils disparaîtront à mesure que
la refonte les remplace.

## Ce qu'il y a ici

| Fichier | Contenu |
| --- | --- |
| `index.ts` | Charge et valide tout, indexe par identifiant, vérifie que chaque état cité existe |
| `ecoles/evocation.ts` | Les cinq verbes d'Évocation (lot L4.1), gabarit des autres écoles |
| `ecoles/abjuration.ts`, `ecoles/invocation.ts` | Les verbes d'Abjuration et d'Invocation (lot L4.4a) |
| `invocations.ts` | Les créatures invoquées : familier, arme spirituelle, les sept serviteurs, les Embruns (lot L4.4a) |
| `ecoles/illusion.ts`, `ecoles/enchantement.ts` | Les verbes d'Illusion et d'Enchantement (lot L4.5) |
| `classes/commun.ts` | Voie de l'école et seconde école, communes aux lanceurs (lot L4.5) |
| `ecoles/cercles.ts` | Les quatre Cercles du Prêtre : Guérison, Foi, Bannissement, Jugement (lot L4.6) |
| `classes/pretre.ts` | La classe Prêtre : Cercles en voies, réserve de Sacré, Vêtements sacrés (lot L4.6) ; attaque spéciale contondante, Frappe sacrée (lot L4.7) |
| `armes.ts` | Les attaques d'arme : famille de chaque arme du catalogue, attaque, attaque d'opportunité, une attaque spéciale par famille (lot L4.7) |
| `classes/guerrier.ts` | La classe Guerrier : Endurance, Voies du soldat, du peuple, du maître d'armes, de l'ingénieur (lot L4.7) |
| `ecoles/chant.ts` | La Voie du chant du Barde, son école : Note discordante, Ballade, Chant brisant, Contre-chant, Requiem du silence (lot L4.8) |
| `classes/barde.ts` | La classe Barde : Inspiration, Voies de la rapière, du spectacle, de l'alcoolisme (lot L4.8) |
| `ecoles/nature.ts` | La Voie des éléments naturels du Druide, son école : Enchevêtrement, Vague, Givre, Tremblement, Tempête (lot L4.15) |
| `classes/druide.ts` | La classe Druide : Force de la nature, Voies des formes, du protecteur, du shaman (lot L4.15) |
| `classes/chaos.ts` | Les Voies du chaos du Guerrier, du Magicien, de l'Envoûteur, du Prêtre et du Barde, au gabarit commun (lot L4.9) |
| `combinaisons.ts` | Les sept combinaisons signature de deux éléments (lot L4.10) |
| `classes/envouteur.ts` | La classe Envoûteur : voies de l'esprit, de la transmutation, de la prescience, seconde école (lot L4.5) |
| `mineurs.ts` | Les sorts mineurs du Magicien (avec leurs paliers de Virtuose) et de l'Envoûteur (lots L4.4b1, L4.4b2, L4.5) |
| `classes/magicien.ts` | La classe Magicien : création, réserve de PP, Voie de l'école, Voie élémentaire, Cataclysme (L4.4b1) ; Voie sauvage, Hémomancie, Virtuose, Saignée (L4.4b2) |
| `etats.ts` | Le catalogue des états de la refonte (lot L4.2) |
| `elements.ts` | Les sept éléments : effet générique sur un sort et dérapage (lot L4.2) |

Chaque action suit le schéma `src/lib/schemas/effets.ts` : ciblage, zone,
résolution, persistance, effets typés, paliers en deltas, usage hors
combat. Une action est validée au chargement : une faute de frappe fait
échouer `npm test`, jamais une séance.

## Changer un chiffre

L'app sert de banc d'essai à la refonte (décision 5a du 20/10/2026) : les
retouches d'équilibrage se font ici.

1. Modifie la valeur dans le fichier de l'école ou de la classe.
2. Lance `npm test` : `tests/unitaires/regles-refonte.test.ts` vérifie que
   chaque palier se résout et que les coûts sortent du calcul.
3. Si le test qui fige ce chiffre échoue, c'est voulu : mets-le à jour dans
   le même commit, et dis pourquoi dans le message.

Le coût d'un verbe ne s'écrit jamais : il vient de la formule validée
(`src/lib/effets/cout.ts`). Les paliers non plus : II et III se débloquent
deux et quatre rangs après le verbe (`src/lib/effets/paliers.ts`).

## Identifiants

`<école>.<verbe>` (`evocation.missile`) pour les actions, le nom au
masculin pour les états (`ralenti`, `expose`), le nom de l'élément pour les
éléments (`electricite`), `serviteur.<élément>` pour les serviteurs : ce
sont eux que les fiches stockeront. **Ils ne changent jamais**, même si le nom affiché change.
