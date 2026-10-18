/**
 * Garde-fou d'architecture (cadrage 2.0) : aucune dépendance circulaire,
 * et les écrans ne parlent jamais directement à Firestore.
 * Pourquoi : en v1, App <-> Capacites <-> Combat <-> Carte ne tenaient que
 * grâce à ~290 gardes `typeof X !== "undefined"`. Ici, un cycle fait
 * échouer `npm run verifier` avant le commit.
 */
module.exports = {
  forbidden: [
    {
      name: 'pas-de-cycle',
      severity: 'error',
      comment: 'Un module ne doit jamais dépendre de lui-même par un détour.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'ecrans-sans-firestore',
      severity: 'error',
      comment:
        "Les écrans et composants lisent les magasins et appellent des actions ; seuls src/lib/firebase et src/lib/actions parlent à Firebase.",
      from: { path: '^src/(ecrans|composants)/' },
      to: { path: '(^src/lib/firebase/client|node_modules/(firebase|@firebase)/)' },
    },
    {
      name: 'secrets-hors-de-l-app',
      severity: 'error',
      comment:
        "Correctif du 18/10/2026 : tout ce que l'app importe est livré aux joueurs. Le bestiaire (fiches secrètes), la conversion du lore v1 et la liste des noms secrets ne sont importés que par outils/ et tests/.",
      from: { path: '^src/', pathNot: '^src/lib/(regles/donnees-bestiaire|lore/import-v1|canon)\\.ts$' },
      to: {
        path: '(^src/lib/regles/donnees-bestiaire|^src/lib/lore/import-v1|^src/lib/canon|^src/donnees/(bestiaire|armes-monstres|armures-monstres|equilibrage)\\.json)',
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.app.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.js', '.svelte'] },
  },
};
