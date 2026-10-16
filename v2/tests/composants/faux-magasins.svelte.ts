/*
 * Faux magasins Firestore pour les tests de composants : des états Svelte
 * que le test modifie à la main, comme le ferait un instantané Firestore.
 */

/** Document de la table : le test y change la scène montrée. */
export const table = $state({ donnees: { sceneActive: null as string | null }, pret: true, erreur: null as string | null });

function collectionVide() {
  const etat = $state({ elements: [] as never[], pret: true, erreur: null as string | null });
  return { etat, arreter: () => {} };
}
function documentVide() {
  const etat = $state({ donnees: null, pret: true, erreur: null as string | null });
  return { etat, arreter: () => {} };
}

export const magasinsCarte = {
  suivreTable: () => ({ etat: table, arreter: () => {} }),
  suivreEtatScene: documentVide,
  suivreJetons: collectionVide,
  suivreDessins: collectionVide,
  suivreScenesImportees: collectionVide,
  suivreImageScene: documentVide,
};

export const magasinsPresents = {
  suivreJoueurs: collectionVide,
};
