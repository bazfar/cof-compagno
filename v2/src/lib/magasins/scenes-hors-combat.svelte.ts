import { db } from '../firebase/client';
import { suivreCollection, suivreDocument, type CollectionSuivie, type DocumentSuivi } from '../firebase/suivre.svelte';
import { schemaActionScene, schemaSceneHorsCombat, schemaSceneHorsCombatMj, type ActionScene, type SceneHorsCombat, type SceneHorsCombatMj } from '../schemas/scene-hors-combat';

/** Toute la table : une scène hors combat (lot S2). */
export function suivreSceneHorsCombat(table: string, id: string): DocumentSuivi<SceneHorsCombat> {
  return suivreDocument(db, `tables/${table}/scenesHorsCombat/${id}`, schemaSceneHorsCombat);
}

/** MJ : le DD de la scène, que les règles cachent aux joueurs. */
export function suivreSceneHorsCombatMj(table: string, id: string): DocumentSuivi<SceneHorsCombatMj> {
  return suivreDocument(db, `tables/${table}/scenesHorsCombatMj/${id}`, schemaSceneHorsCombatMj);
}

/** Toute la table : les actions de la scène, tous tours confondus. */
export function suivreActionsScene(table: string, id: string): CollectionSuivie<ActionScene> {
  return suivreCollection(db, `tables/${table}/scenesHorsCombat/${id}/actions`, schemaActionScene);
}
