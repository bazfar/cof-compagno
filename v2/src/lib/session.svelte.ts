export type EtapeSession = 'chargement' | 'accueil' | 'joueur' | 'mj' | 'erreur';

/**
 * Qui est connecté, à quelle table, avec quel rôle. État Svelte partagé :
 * il se modifie uniquement depuis src/lib/actions/acces.ts.
 */
export const session = $state({
  etape: 'chargement' as EtapeSession,
  table: '',
  uid: '',
  nom: '',
  erreur: '',
});
