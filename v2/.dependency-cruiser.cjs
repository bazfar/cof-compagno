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
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.app.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.js', '.svelte'] },
  },
};
