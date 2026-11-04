import { db } from '../firebase/client';
import { suivreCollection, suivreDocument, type CollectionSuivie, type DocumentSuivi } from '../firebase/suivre.svelte';
import { schemaEtatRepos, schemaReposEnAttente, type EtatRepos, type ReposEnAttente } from '../schemas/repos';

/** L7.1a (4b) : toute la table : les jets de PV de repos en attente, par personnage. */
export function suivreReposEnAttente(table: string): CollectionSuivie<ReposEnAttente> {
  return suivreCollection(db, `tables/${table}/reposEnAttente`, schemaReposEnAttente);
}

/** L7.1a (5b) : toute la table : les repos courts de chacun depuis son dernier repos long. */
export function suivreEtatRepos(table: string): DocumentSuivi<EtatRepos> {
  return suivreDocument(db, `tables/${table}/repos/etat`, schemaEtatRepos);
}
