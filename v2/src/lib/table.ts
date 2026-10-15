/** Table utilisée quand l'URL n'en précise pas : la campagne en cours. */
export const TABLE_PAR_DEFAUT = 'arbre-monde';

/** Un identifiant de table sert de segment de chemin Firestore : on le borne. */
const MOTIF_TABLE = /^[a-z0-9-]{1,40}$/;

/**
 * Lit la table depuis `?table=` dans l'URL. Une valeur absente ou invalide
 * renvoie la table par défaut : on ne fabrique jamais un chemin Firestore
 * à partir d'une saisie non contrôlée.
 * Exemple : `?table=test` pour la table d'essai de la migration.
 */
export function tableDepuisUrl(url: string): string {
  const demandee = new URL(url).searchParams.get('table');
  return demandee !== null && MOTIF_TABLE.test(demandee) ? demandee : TABLE_PAR_DEFAUT;
}
