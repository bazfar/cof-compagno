/*
 * Garde-fou de canon (correctif du 18/10/2026) : des noms que les
 * joueurs ne doivent jamais lire. Contrainte de campagne : le Roi des
 * Mendiants n'est jamais nommé ni soupçonné par les joueurs.
 *
 * Utilisé par :
 * - outils/exporter-lore-v1.ts (L2.7a) : l'export échoue si l'un de ces
 *   noms serait lisible par les joueurs ;
 * - outils/verifier-secrets.ts : `npm run verifier` échoue si l'un d'eux
 *   paraît dans le code livré (dist/).
 * Ce module n'est importé par AUCUN écran ni composant
 * (.dependency-cruiser.cjs) : il contient lui-même les noms.
 */
export const NOMS_JAMAIS_REVELES = ['Roi des Mendiants'] as const;
