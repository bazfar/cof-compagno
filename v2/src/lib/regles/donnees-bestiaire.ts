import armesMonstresJson from '../../donnees/armes-monstres.json';
import armuresMonstresJson from '../../donnees/armures-monstres.json';
import bestiaireJson from '../../donnees/bestiaire.json';
import equilibrageJson from '../../donnees/equilibrage.json';
import type { ArmeMonstre, ArmureMonstre, Equilibrage, Monstre } from '../schemas/bestiaire';

/*
 * Bestiaire, armes et armures de monstres, équilibrage (données du MJ,
 * importées de la v1 par outils/importer-v1.ts, lot L1.2).
 *
 * Séparé de donnees.ts (correctif du 18/10/2026) : donnees.ts est chargé
 * par l'écran joueur (création, fiche), et tout ce qu'il importe est
 * livré aux joueurs. Le bestiaire y était, fiches secrètes comprises (le
 * Roi des Mendiants). Ce module n'est importé par AUCUN écran ni
 * composant : .dependency-cruiser.cjs le refuse, et
 * `npm run secrets:verifier` cherche les noms secrets dans le build.
 * Le bestiaire du MJ (L3) passera par Firestore, lisible du MJ seul,
 * comme le lore (L2.7a), et non par ce module.
 */
export const monstres = bestiaireJson.monstres as Monstre[];
export const armesMonstres = armesMonstresJson as ArmeMonstre[];
export const armuresMonstres = armuresMonstresJson as ArmureMonstre[];
export const equilibrage = equilibrageJson as Equilibrage;

function indexer<T extends { id: string }>(elements: T[], quoi: string): Map<string, T> {
  const index = new Map<string, T>();
  for (const e of elements) {
    if (index.has(e.id)) throw new Error(`${quoi} en double : ${e.id}`);
    index.set(e.id, e);
  }
  return index;
}

export const monstreParId = indexer(monstres, 'Monstre');
export const armeMonstreParId = indexer(armesMonstres, 'Arme de monstre');
export const armureMonstreParId = indexer(armuresMonstres, 'Armure de monstre');
