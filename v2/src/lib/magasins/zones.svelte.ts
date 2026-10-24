import { db } from '../firebase/client';
import { suivreCollection, type CollectionSuivie } from '../firebase/suivre.svelte';
import { schemaZoneSol, type ZoneSol } from '../schemas/zones';

/*
 * Les zones au sol en temps réel (lot L6.4b1). Les cases du MJ d'une scène
 * (le joueur ne lit que celles qui ne sont pas cachées : 4a) ; les zones de
 * sort et les pièges du combat en cours.
 */

export function suivreZonesScene(table: string, scene: string, mj: boolean): CollectionSuivie<ZoneSol> {
  return suivreCollection(db, `tables/${table}/scenes/${scene}/zones`, schemaZoneSol, mj ? undefined : { champ: 'cachee', egal: false });
}

export function suivreZonesCombat(table: string, combat: string): CollectionSuivie<ZoneSol> {
  return suivreCollection(db, `tables/${table}/combats/${combat}/zones`, schemaZoneSol);
}
