import { db } from '../firebase/client';
import { suivreCollection, suivreDocument, type CollectionSuivie, type DocumentSuivi } from '../firebase/suivre.svelte';
import { schemaEquilibrage, schemaListeArmes, schemaListeArmures, schemaMonstreEnBase, type Equilibrage, type MonstreEnBase } from '../schemas/bestiaire';
import type { z } from 'zod';

/** MJ : le bestiaire en base (lot L3.2). Les règles le refusent aux joueurs. */
export function suivreBestiaire(table: string): CollectionSuivie<MonstreEnBase> {
  return suivreCollection(db, `tables/${table}/bestiaire`, schemaMonstreEnBase);
}

export function suivreArmesMonstres(table: string): DocumentSuivi<z.infer<typeof schemaListeArmes>> {
  return suivreDocument(db, `tables/${table}/bestiaireDonnees/armes`, schemaListeArmes);
}

export function suivreArmuresMonstres(table: string): DocumentSuivi<z.infer<typeof schemaListeArmures>> {
  return suivreDocument(db, `tables/${table}/bestiaireDonnees/armures`, schemaListeArmures);
}

export function suivreEquilibrage(table: string): DocumentSuivi<Equilibrage> {
  return suivreDocument(db, `tables/${table}/bestiaireDonnees/equilibrage`, schemaEquilibrage);
}
