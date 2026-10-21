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
| `index.ts` | Charge et valide toutes les actions, les indexe par identifiant |
| `ecoles/evocation.ts` | Les cinq verbes d'Évocation (lot L4.1), gabarit des autres écoles |

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

`<école>.<verbe>` (`evocation.missile`) : ce sont eux que les fiches
stockeront. **Ils ne changent jamais**, même si le nom affiché change.
