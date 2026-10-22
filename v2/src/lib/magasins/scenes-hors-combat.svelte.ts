import { db } from '../firebase/client';
import { suivreCollection, suivreDocument, type CollectionSuivie, type DocumentSuivi } from '../firebase/suivre.svelte';
import {
  schemaActionScene,
  schemaQuestionMj,
  schemaSceneHorsCombat,
  schemaSceneHorsCombatMj,
  schemaUtilisationVecu,
  type ActionScene,
  type QuestionMj,
  type SceneHorsCombat,
  type SceneHorsCombatMj,
  type UtilisationVecu,
} from '../schemas/scene-hors-combat';

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

/** Toute la table : les capacités du Vécu utilisées pendant la scène (S3, 10a). */
export function suivreUtilisationsScene(table: string, id: string): CollectionSuivie<UtilisationVecu> {
  return suivreCollection(db, `tables/${table}/scenesHorsCombat/${id}/utilisations`, schemaUtilisationVecu);
}

/** MJ : toutes les questions des joueurs et les révélations de Lire les gens (S3, 9a). */
export function suivreQuestionsMj(table: string): CollectionSuivie<QuestionMj> {
  return suivreCollection(db, `tables/${table}/questions`, schemaQuestionMj);
}

/** Joueur : ses questions et ses révélations, la seule requête que les règles laissent passer. */
export function suivreMesQuestions(table: string, uid: string): CollectionSuivie<QuestionMj> {
  return suivreCollection(db, `tables/${table}/questions`, schemaQuestionMj, { champ: 'uid', egal: uid });
}
