# Données de règles — fichiers générés

Ces JSON sont **générés depuis la v1** par `outils/importer-v1.ts`.
Ne les modifie pas à la main : la vérification (`npm run verifier`)
échouerait, et le prochain import écraserait la modification.

## Changer une règle (jusqu'à la bascule)

1. Modifie la règle dans la v1 (`data/donnees.js`, `data/dons.js`…), sur `thomas/contributions`.
2. Sur la branche `v2` : `git merge thomas/contributions`.
3. Depuis `v2/` : `npm run importer-v1`, puis commite les JSON modifiés.

## Identifiants des voies (`identifiants.json`)

Chaque voie de classe a un identifiant figé, dérivé de son nom au premier
import : `guerrier.soldat`, `magicien.magie-elementaire`… Une capacité
s'identifie par `<voie>.<rang>` (`guerrier.soldat.3`). Les voies raciales
sont `race.<race>`, leurs variantes `race.<race>.variante.<code>`.

Ces identifiants sont ce que les fiches stockent : **ils ne changent jamais**.

- **Renommer une voie dans la v1** : l'import s'arrête et le signale. Dans
  `identifiants.json`, remplace l'ancienne clé `"classe|Ancien nom"` par
  `"classe|Nouveau nom"` en gardant la même valeur, puis relance l'import.
- **Supprimer une voie** : retire son entrée à la main, après avoir vérifié
  qu'aucune fiche ne l'utilise.
- **Ajouter une voie** : rien à faire, l'import lui crée un identifiant.
