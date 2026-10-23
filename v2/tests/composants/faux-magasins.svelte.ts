/*
 * Faux magasins Firestore pour les tests de composants : des états Svelte
 * que le test modifie à la main, comme le ferait un instantané Firestore.
 */

/** Document de la table : le test y change la scène montrée. */
export const table = $state({
  donnees: { sceneActive: null } as { sceneActive: string | null; seanceOuverte?: { id: string; numero: number } | null; sceneHorsCombat?: string | null; combat?: string | null },
  pret: true,
  erreur: null as string | null,
});

function collectionVide() {
  const etat = $state({ elements: [] as never[], pret: true, erreur: null as string | null });
  return { etat, arreter: () => {} };
}
function documentVide() {
  const etat = $state({ donnees: null, pret: true, erreur: null as string | null });
  return { etat, arreter: () => {} };
}

/** Jetons de la scène montrée (L2.3 : jetons de PJ reliés aux fiches). */
export const jetonsScene = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });

export const magasinsCarte = {
  suivreTable: () => ({ etat: table, arreter: () => {} }),
  suivreEtatScene: documentVide,
  suivreJetons: () => ({ etat: jetonsScene, arreter: () => {} }),
  suivreDessins: collectionVide,
  suivreScenesImportees: collectionVide,
  suivreImageScene: documentVide,
};

/** Joueurs et fiches de la table : le test y pose ce que Firestore enverrait (lot L2.2b). */
export const joueurs = $state({ elements: [] as { id: string; nom: string; rejointLe: number; persoActif?: string; protege?: boolean }[], pret: true, erreur: null as string | null });
export const persos = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });

export const magasinsPresents = {
  suivreJoueurs: () => ({ etat: joueurs, arreter: () => {} }),
};

export const imports = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });

export const magasinsImports = {
  suivreImports: () => ({ etat: imports, arreter: () => {} }),
  suivreMesImports: () => ({ etat: imports, arreter: () => {} }),
};

/** Portraits par personnage (L2.3) : le test y pose une image. */
export const portraits = $state<Record<string, { image: string; majLe: number }>>({});

export const magasinsPersos = {
  suivrePersos: () => ({ etat: persos, arreter: () => {} }),
  suivrePortrait: (_table: string, id: string) => ({
    etat: {
      get donnees() {
        return portraits[id] ?? null;
      },
      pret: true,
      erreur: null,
    },
    arreter: () => {},
  }),
};

/** Journal de dés (L2.5) : le test y pose des jets. */
export const jets = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });

export const magasinsJournal = {
  JETS_MONTRES: 40,
  suivreJournal: () => ({ etat: jets, arreter: () => {} }),
};

/** Lore partagé (L2.7) : fiches complètes (MJ) et version joueurs. */
export const loreMj = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });
export const loreJoueur = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });

export const magasinsLore = {
  suivreLoreMj: () => ({ etat: loreMj, arreter: () => {} }),
  suivreLoreJoueur: () => ({ etat: loreJoueur, arreter: () => {} }),
};

/** Séances (L3.1) : le test y pose les séances ; la séance ouverte se règle dans `table`. */
export const seances = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });

export const magasinsSeances = {
  suivreSeances: () => ({ etat: seances, arreter: () => {} }),
};

/** Bestiaire du MJ (L3.2) : monstres en base et listes de référence. */
export const bestiaire = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });
export const armesBestiaire = $state({ donnees: null as { liste: Record<string, unknown>[] } | null, pret: true, erreur: null as string | null });
export const armuresBestiaire = $state({ donnees: null as { liste: Record<string, unknown>[] } | null, pret: true, erreur: null as string | null });
export const equilibrageBestiaire = $state({ donnees: null as Record<string, unknown> | null, pret: true, erreur: null as string | null });

export const magasinsBestiaire = {
  suivreBestiaire: () => ({ etat: bestiaire, arreter: () => {} }),
  suivreArmesMonstres: () => ({ etat: armesBestiaire, arreter: () => {} }),
  suivreArmuresMonstres: () => ({ etat: armuresBestiaire, arreter: () => {} }),
  suivreEquilibrage: () => ({ etat: equilibrageBestiaire, arreter: () => {} }),
};

/** Dons d'objets du joueur (L3.3). */
export const dons = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });

export const magasinsDons = {
  suivreMesDons: () => ({ etat: dons, arreter: () => {} }),
};

/** Butins de la table (L3.4). */
export const butins = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });

export const magasinsButins = {
  suivreButins: () => ({ etat: butins, arreter: () => {} }),
};

/** Rencontres préparées (L3.5). */
export const rencontres = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });

export const magasinsRencontres = {
  suivreRencontres: () => ({ etat: rencontres, arreter: () => {} }),
};

/** PNJ et réputation (S1) : le test y pose les PNJ, la réputation et l'historique du PNJ ouvert. */
export const pnjs = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });
export const reputation = $state({ donnees: null as { scores: Record<string, number>; majLe: number } | null, pret: true, erreur: null as string | null });
export const historiquePnj = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });

export const magasinsPnj = {
  suivrePnjMj: () => ({ etat: pnjs, arreter: () => {} }),
  // Comme la requête des joueurs : les PNJ rencontrés seulement.
  suivrePnjJoueur: () => ({
    etat: {
      get elements() {
        return pnjs.elements.filter((p) => p.rencontre === true);
      },
      pret: true,
      erreur: null,
    },
    arreter: () => {},
  }),
  suivreHistoriquePnj: () => ({ etat: historiquePnj, arreter: () => {} }),
  suivreReputation: () => ({ etat: reputation, arreter: () => {} }),
};

/** Scène hors combat (S2) : la scène montrée (table.donnees.sceneHorsCombat), son DD et ses actions. */
export const sceneHc = $state({ donnees: null as Record<string, unknown> | null, pret: true, erreur: null as string | null });
export const sceneHcMj = $state({ donnees: null as { dd: number } | null, pret: true, erreur: null as string | null });
export const actionsScene = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });
/** S3 : capacités du Vécu utilisées dans la scène, questions au MJ. */
export const utilisationsScene = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });
export const questionsMj = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });

export const magasinsScenes = {
  suivreSceneHorsCombat: () => ({ etat: sceneHc, arreter: () => {} }),
  suivreSceneHorsCombatMj: () => ({ etat: sceneHcMj, arreter: () => {} }),
  suivreActionsScene: () => ({ etat: actionsScene, arreter: () => {} }),
  suivreUtilisationsScene: () => ({ etat: utilisationsScene, arreter: () => {} }),
  suivreQuestionsMj: () => ({ etat: questionsMj, arreter: () => {} }),
  // Comme la requête du joueur : ses questions seulement.
  suivreMesQuestions: (_t: string, uid: string) => ({
    etat: {
      get elements() {
        return questionsMj.elements.filter((q) => q.uid === uid);
      },
      pret: true,
      erreur: null,
    },
    arreter: () => {},
  }),
};

// Sorts hors combat (lot G2a).
export const demandesSorts = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });

export const magasinsSorts = {
  suivreDemandesSortsMj: () => ({ etat: demandesSorts, arreter: () => {} }),
  // Comme la requête du joueur : ses demandes seulement.
  suivreMesDemandesSorts: (_t: string, uid: string) => ({
    etat: {
      get elements() {
        return demandesSorts.elements.filter((d) => d.uid === uid);
      },
      pret: true,
      erreur: null,
    },
    arreter: () => {},
  }),
};

// Combat (lot L6.1).
export const combatDoc = $state({ donnees: null as Record<string, unknown> | null, pret: true, erreur: null as string | null });
export const combattants = $state({ elements: [] as Record<string, unknown>[], pret: true, erreur: null as string | null });

export const magasinsCombat = {
  suivreCombat: () => ({ etat: combatDoc, arreter: () => {} }),
  suivreCombattants: () => ({ etat: combattants, arreter: () => {} }),
};

/** La carte que la fausse CarteTable rend à l'écran qui la monte (L6.2, portées). */
export const carteFaux: { valeur: unknown } = { valeur: null };
