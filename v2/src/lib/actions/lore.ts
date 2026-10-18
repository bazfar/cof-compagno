import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/client';
import { aEcrire, versionJoueurs } from '../lore/fiche';
import { schemaFicheLoreJoueurs, schemaFicheLoreMj, type ExportLore, type FicheLoreMj } from '../schemas/lore';
import { session } from '../session.svelte';

/*
 * Écritures du lore partagé (lot L2.7a). Seul endroit qui écrit dans
 * tables/{table}/loreMj et tables/{table}/lore. Chaque fiche s'écrit en
 * une seule écriture groupée (batch) : la fiche complète et sa version
 * joueurs ensemble, pour qu'elles ne divergent jamais. La version joueurs
 * est toujours recalculée par versionJoueurs, jamais écrite à la main.
 */

const cheminMj = (id: string) => `tables/${session.table}/loreMj/${id}`;
const cheminJoueurs = (id: string) => `tables/${session.table}/lore/${id}`;

/** Une écriture groupée Firestore accepte 500 opérations ; une fiche en coûte 2. */
const FICHES_PAR_LOT = 200;

function ajouterAuLot(lot: ReturnType<typeof writeBatch>, id: string, fiche: FicheLoreMj) {
  lot.set(doc(db, cheminMj(id)), schemaFicheLoreMj.parse(fiche));
  const joueurs = versionJoueurs(fiche);
  if (joueurs) lot.set(doc(db, cheminJoueurs(id)), schemaFicheLoreJoueurs.parse(joueurs));
  else lot.delete(doc(db, cheminJoueurs(id)));
}

/**
 * MJ : crée ou modifie une fiche. `avant` est la fiche telle qu'elle était
 * (null pour une création) : elle sert à dater une révélation (marque
 * « nouveau » côté joueurs). Rend la fiche écrite.
 */
export async function enregistrerFicheLore(id: string, avant: FicheLoreMj | null, apres: FicheLoreMj): Promise<FicheLoreMj> {
  const fiche = aEcrire(avant, apres, Date.now());
  const lot = writeBatch(db);
  ajouterAuLot(lot, id, fiche);
  await lot.commit();
  return fiche;
}

/** MJ : supprime une fiche et sa version joueurs. */
export async function supprimerFicheLore(id: string): Promise<void> {
  const lot = writeBatch(db);
  lot.delete(doc(db, cheminMj(id)));
  lot.delete(doc(db, cheminJoueurs(id)));
  await lot.commit();
}

/**
 * MJ : importe l'export du lore v1. Une fiche déjà présente (même
 * identifiant ou même source) est gardée telle quelle : réimporter ne
 * défait jamais une modification faite dans l'app.
 */
export async function importerLore(
  exportLore: ExportLore,
  presentes: { ids: ReadonlySet<string>; sources: ReadonlySet<string> },
): Promise<{ importees: number; gardees: number }> {
  const aImporter = exportLore.fiches.filter(({ id, fiche }) => !presentes.ids.has(id) && !(fiche.source && presentes.sources.has(fiche.source)));
  const maintenant = Date.now();
  for (let i = 0; i < aImporter.length; i += FICHES_PAR_LOT) {
    const lot = writeBatch(db);
    for (const { id, fiche } of aImporter.slice(i, i + FICHES_PAR_LOT)) ajouterAuLot(lot, id, { ...fiche, majLe: maintenant, reveleLe: maintenant });
    await lot.commit();
  }
  return { importees: aImporter.length, gardees: exportLore.fiches.length - aImporter.length };
}
