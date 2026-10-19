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
  /** Le joueur a un code perso : il se retrouve sur un autre appareil (correctif du 19/10). */
  protege: false,
});
