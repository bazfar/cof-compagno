import { deleteDoc, doc, runTransaction, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/client';
import { lancerDegats } from '../combat/attaque';
import { apresRepos, COUCHAGES, formuleRepos, pvApresJet, REPOS_COURTS_MAX, type Couchage } from '../repos/repos';
import { schemaFiche, type Fiche } from '../schemas/fiche';
import { schemaReposEnAttente, type EtatRepos } from '../schemas/repos';
import type { Remous } from '../schemas/remous';
import { session } from '../session.svelte';
import { noterJet } from './journal';
import { viderRemous } from './remous';

/*
 * Le repos (lot L7.1a, décisions de Thomas du 29/10/2026). Voir
 * src/regles/repos.ts et lib/repos/repos.ts.
 *   - 3a (plan) : le MJ lance le repos pour les personnages joués des
 *     présents ; les PP et les ressources se rendent tout de suite ;
 *   - 4b : le jet de PV attend : chaque joueur lance le sien (un repos n'en
 *     ouvre pas un second tant que le premier n'est pas lancé) ;
 *   - 5b : 2 repos courts au plus entre deux repos longs ;
 *   - 3a : le repos long vide le Remous de la scène montrée.
 */

type AvecId<T> = T & { id: string };

export class RefusRepos extends Error {}

const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);
const refAttente = (id: string) => doc(db, `tables/${session.table}/reposEnAttente/${id}`);
const refEtat = () => doc(db, `tables/${session.table}/repos/etat`);
const sansDe = { des: [], faces: 0, bonus: 0, total: 0 };

/** Ce qu'un repos a fait : qui l'a pris, et qui en a été écarté (et pourquoi). */
export interface ReposPris {
  servis: string[];
  enAttente: string[];
  auPlafond: string[];
}

/**
 * Le MJ lance un repos pour ces personnages (les joués des présents). Ceux
 * dont un jet attend encore, et au court ceux qui ont déjà pris leurs deux
 * repos courts, sont écartés.
 */
export async function prendreRepos(
  quoi: 'court' | 'long',
  fiches: readonly AvecId<Fiche>[],
  etat: EtatRepos | null,
  attentes: ReadonlySet<string>,
  options: { couchage?: Couchage; combatEnCours: boolean; scene: string | null; remous: Remous | null },
): Promise<ReposPris> {
  if (options.combatEnCours) throw new RefusRepos('Un combat est en cours : le repos attend sa fin.');
  if (!fiches.length) throw new RefusRepos('Aucun personnage joué parmi les présents.');
  const courts = etat?.courts ?? {};
  const pris: ReposPris = { servis: [], enAttente: [], auPlafond: [] };
  const lot = writeBatch(db);
  const nouveaux: Record<string, number> = { ...courts };
  const maintenant = Date.now();
  for (const f of fiches) {
    if (attentes.has(f.id)) {
      pris.enAttente.push(f.nom);
      continue;
    }
    if (quoi === 'court' && (courts[f.id] ?? 0) >= REPOS_COURTS_MAX) {
      pris.auPlafond.push(f.nom);
      continue;
    }
    const champs = apresRepos(f, quoi);
    if (Object.keys(champs).length) lot.update(refPerso(f.id), champs);
    lot.set(refAttente(f.id), schemaReposEnAttente.parse({ nom: f.nom.slice(0, 40), quoi, formule: formuleRepos(f, quoi, options.couchage), creeLe: maintenant }));
    nouveaux[f.id] = quoi === 'court' ? (courts[f.id] ?? 0) + 1 : 0;
    pris.servis.push(f.nom);
  }
  if (!pris.servis.length) throw new RefusRepos(texteEcartes(pris) || 'Personne à servir.');
  lot.set(refEtat(), { courts: nouveaux, majLe: maintenant });
  await lot.commit();
  const couchage = quoi === 'long' ? (COUCHAGES.find((c) => c.id === (options.couchage ?? 'camp'))?.nom ?? '') : '';
  await noterJet(quoi === 'court' ? 'Repos court' : `Repos long${couchage ? ` — ${couchage}` : ''}`, '0', sansDe, 'MJ', [`${pris.servis.join(', ')} : PP et ressources rendus, jet de PV à lancer.`, texteEcartes(pris)].filter(Boolean).join(' '));
  if (quoi === 'long' && options.scene && (options.remous?.total ?? 0) > 0) await viderRemous(options.scene, options.remous, 'repos');
  return pris;
}

function texteEcartes(p: ReposPris): string {
  return [
    ...(p.enAttente.length ? [`Jet du repos précédent à lancer d’abord : ${p.enAttente.join(', ')}.`] : []),
    ...(p.auPlafond.length ? [`Déjà ${REPOS_COURTS_MAX} repos courts depuis le dernier repos long : ${p.auPlafond.join(', ')}.`] : []),
  ].join(' ');
}

/** 4b : le joueur (ou le MJ) lance le jet de PV qui attend : ses PV montent, plafonnés ; le jet va au journal. */
export async function lancerJetRepos(perso: string, alea: () => number = Math.random): Promise<{ total: number; pv: number }> {
  const r = await runTransaction(db, async (tx) => {
    const a = await tx.get(refAttente(perso));
    if (!a.exists()) throw new RefusRepos('Ce jet de repos a déjà été lancé.');
    const attente = schemaReposEnAttente.parse(a.data());
    const p = await tx.get(refPerso(perso));
    if (!p.exists()) throw new RefusRepos('Fiche introuvable.');
    const f = schemaFiche.parse(p.data());
    const jet = lancerDegats(attente.formule, alea)!;
    const pv = pvApresJet(f, jet.total);
    tx.update(refPerso(perso), { pvActuel: pv });
    tx.delete(refAttente(perso));
    return { attente, jet, pv };
  });
  await noterJet(`Repos ${r.attente.quoi} — PV`, r.attente.formule, r.jet, r.attente.nom, `${r.attente.nom} : ${r.pv} PV.`);
  return { total: r.jet.total, pv: r.pv };
}

/** Le MJ retire un jet qui attend (v1 : purgerAttente), sans rien rendre. */
export async function retirerJetRepos(perso: string): Promise<void> {
  await deleteDoc(refAttente(perso));
}
