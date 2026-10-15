import catalogueBrut from '../../donnees/scenes/catalogue.json';
import { schemaCatalogueScenes, schemaGeometrieScene, type GeometrieScene } from '../schemas/scene.ts';

/*
 * Accès aux scènes préparées (src/donnees/scenes/, généré par
 * outils/preparer-scenes.ts). Le catalogue est léger et chargé tout de
 * suite ; la géométrie d'une scène n'est chargée qu'à son ouverture (un
 * fichier JSON séparé par scène dans le build).
 */

export const catalogueScenes = schemaCatalogueScenes.parse(catalogueBrut);

const chargeurs = import.meta.glob<{ default: unknown }>(['../../donnees/scenes/*.json', '!../../donnees/scenes/catalogue.json']);

export async function chargerGeometrie(id: string): Promise<GeometrieScene> {
  const charger = chargeurs[`../../donnees/scenes/${id}.json`];
  if (!charger) throw new Error(`Scène « ${id} » absente du catalogue.`);
  return schemaGeometrieScene.parse((await charger()).default);
}
