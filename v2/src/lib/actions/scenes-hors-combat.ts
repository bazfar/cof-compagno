import { collection, doc, runTransaction, setDoc } from 'firebase/firestore';
import { db } from '../firebase/client';
import { formuleTest } from '../regles/des';
import { apresLeTour, contributeurs, idAction, manquePourOuvrir, OPTIONS, pnjApresScene, RefusScene, resoudre } from '../scenes/hors-combat';
import { schemaGesteAttitude, schemaPnj } from '../schemas/pnj';
import {
  schemaActionScene,
  schemaSceneHorsCombat,
  schemaSceneHorsCombatMj,
  type ActionScene,
  type Appele,
  type OptionScene,
  type SceneHorsCombat,
  type TypeScene,
} from '../schemas/scene-hors-combat';
import { session } from '../session.svelte';
import { lancerEtNoter } from './journal';
import { donnerCranVecu } from './vecu';

/*
 * Écritures des scènes hors combat (lot S2). Le MJ ouvre et clôt la scène,
 * et son client résout les jets (5a) : il est le seul à lire le DD. Le
 * joueur appelé écrit son action du tour (une par tour, identifiant
 * `<tour>-<uid>`), après avoir lancé son d20 au journal.
 */

export { RefusScene };

const chemin = (id: string) => `tables/${session.table}/scenesHorsCombat/${id}`;
const refScene = (id: string) => doc(db, chemin(id));
const refSceneMj = (id: string) => doc(db, `tables/${session.table}/scenesHorsCombatMj/${id}`);
const refTable = () => doc(db, 'tables', session.table);
const refPnj = (id: string) => doc(db, `tables/${session.table}/pnj/${id}`);

export interface BrouillonScene {
  type: TypeScene;
  pnj: string | null;
  cible: string;
  objectif: string;
  mode: 'individuel' | 'groupe';
  competence: string | null;
  dd: number;
  requis: number;
  toleres: number;
  echecsVisibles: boolean;
  marquante: boolean;
  appeles: Appele[];
}

export function nouvelIdScene(): string {
  return `sh${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Ouvre une scène (1a, 2a) : la scène, son DD à part, et la table qui la montre. Une seule à la fois. */
export async function ouvrirScene(b: BrouillonScene, seance?: string): Promise<string> {
  const manque = manquePourOuvrir(b);
  if (manque) throw new RefusScene(manque);
  const id = nouvelIdScene();
  await runTransaction(db, async (tx) => {
    const table = await tx.get(refTable());
    const enCours = table.get('sceneHorsCombat') as string | null | undefined;
    if (enCours) throw new RefusScene('Une scène est déjà en cours : clos-la d’abord.');
    let depart = null;
    if (b.type === 'social') {
      const lu = await tx.get(refPnj(b.pnj!));
      const p = lu.exists() ? schemaPnj.parse(lu.data()) : null;
      if (!p?.cran) throw new RefusScene('Ce PNJ n’est pas encore rencontré.');
      depart = p.cran;
    }
    const scene = schemaSceneHorsCombat.parse({
      type: b.type,
      pnj: b.type === 'social' ? b.pnj : null,
      cible: b.cible,
      objectif: b.objectif,
      mode: b.mode,
      competence: b.mode === 'groupe' ? b.competence : null,
      requis: b.requis,
      toleres: b.toleres,
      echecsVisibles: b.echecsVisibles,
      marquante: b.marquante,
      appeles: b.appeles,
      appelesUids: b.appeles.map((a) => a.uid),
      tour: 1,
      reussites: 0,
      echecs: 0,
      depart,
      hausses: 0,
      baisses: 0,
      menaces: 0,
      temp: 0,
      mensonges: 0,
      seduction: null,
      statut: 'ouverte',
      issue: null,
      ...(seance ? { seance } : {}),
      creeLe: Date.now(),
      closeLe: null,
    });
    tx.set(refScene(id), scene);
    tx.set(refSceneMj(id), schemaSceneHorsCombatMj.parse({ dd: b.dd }));
    tx.set(refTable(), { sceneHorsCombat: id }, { merge: true });
  });
  return id;
}

/**
 * Le joueur agit (4b, 7a) : il lance son d20 au journal, au nom de son
 * personnage, puis écrit son action du tour. Passer n'écrit qu'une action.
 */
export async function agirEnScene(idScene: string, s: SceneHorsCombat, option: OptionScene, competence: string | null, bonus: number): Promise<ActionScene> {
  const moi = s.appeles.find((a) => a.uid === session.uid);
  if (!moi) throw new RefusScene('Tu n’es pas appelé dans cette scène.');
  if (s.statut !== 'ouverte') throw new RefusScene('La scène n’attend plus de jet.');
  let de: number | null = null;
  if (option !== 'passer') {
    if (!competence) throw new RefusScene('Choisis une compétence.');
    const nom = option in OPTIONS ? `${OPTIONS[option as keyof typeof OPTIONS].nom} (${competence})` : competence;
    const jet = await lancerEtNoter(`Scène : ${nom}`.slice(0, 80), formuleTest(bonus), moi.nom);
    de = jet!.des[0]!;
  }
  const a = schemaActionScene.parse({
    uid: moi.uid,
    perso: moi.perso,
    nom: moi.nom,
    tour: s.tour,
    option,
    competence: option === 'passer' ? null : competence,
    de,
    bonus,
    resultat: option === 'passer' ? 'passe' : null,
    creeLe: Date.now(),
  });
  await setDoc(doc(db, `${chemin(idScene)}/actions/${idAction(s.tour, moi.uid)}`), a);
  return a;
}

/**
 * Client du MJ (5a) : résout une action en attente, avec le DD qu'il est
 * seul à lire, puis ouvre le tour suivant si chacun a agi ou passé (7a).
 * Une action passée (sans résultat à calculer) peut seulement faire tourner.
 */
export async function resoudreAction(idScene: string, idActe: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const refActe = doc(db, `${chemin(idScene)}/actions/${idActe}`);
    const [lu, luMj, luActe] = [await tx.get(refScene(idScene)), await tx.get(refSceneMj(idScene)), await tx.get(refActe)];
    if (!lu.exists() || !luMj.exists() || !luActe.exists()) return;
    const s = schemaSceneHorsCombat.parse(lu.data());
    const a = schemaActionScene.parse(luActe.data());
    if (s.statut !== 'ouverte' || a.tour !== s.tour) return;
    const autres = await Promise.all(
      s.appelesUids.filter((u) => u !== a.uid).map(async (u) => {
        const x = await tx.get(doc(db, `${chemin(idScene)}/actions/${idAction(s.tour, u)}`));
        return x.exists() ? schemaActionScene.parse(x.data()) : { uid: u, resultat: null };
      }),
    );
    let apres = s;
    let resultat = a.resultat;
    if (resultat === null) {
      const r = resoudre(s, schemaSceneHorsCombatMj.parse(luMj.data()).dd, a);
      apres = r.scene;
      resultat = r.resultat;
      tx.update(refActe, { resultat });
    }
    apres = apresLeTour(apres, [...autres, { uid: a.uid, resultat }]);
    if (apres !== s) tx.set(refScene(idScene), schemaSceneHorsCombat.parse(apres));
  });
}

/**
 * Le MJ clôt la scène (8a) : il confirme l'issue proposée, ou la clôt sans
 * issue. Le PNJ retient son attitude (9a, 10b) et ses mensonges (9a) ; la
 * clôture entre dans son historique. La table ne montre plus la scène.
 */
export async function cloreScene(idScene: string, issue: 'gagnee' | 'perdue' | 'abandonnee'): Promise<SceneHorsCombat> {
  return runTransaction(db, async (tx) => {
    const lu = await tx.get(refScene(idScene));
    if (!lu.exists()) throw new RefusScene('Cette scène n’existe plus.');
    const s = schemaSceneHorsCombat.parse(lu.data());
    if (s.statut === 'close') throw new RefusScene('Cette scène est déjà close.');
    if (issue !== 'abandonnee' && !(s.statut === 'terminee' && s.issue === issue)) throw new RefusScene('L’issue se confirme quand la scène est terminée.');
    const maintenant = Date.now();
    let pnjLu = null;
    if (s.pnj) {
      const x = await tx.get(refPnj(s.pnj));
      pnjLu = x.exists() ? schemaPnj.parse(x.data()) : null;
    }
    const close = schemaSceneHorsCombat.parse({ ...s, statut: 'close', issue, closeLe: maintenant });
    if (s.pnj && pnjLu) {
      const apres = schemaPnj.parse(pnjApresScene(pnjLu, s, issue, maintenant));
      const motif = `${issue === 'gagnee' ? 'Scène gagnée' : issue === 'perdue' ? 'Scène perdue' : 'Scène close sans issue'} : ${s.objectif}`;
      tx.set(refPnj(s.pnj), apres);
      tx.set(
        doc(collection(db, `tables/${session.table}/pnj/${s.pnj}/historique`)),
        schemaGesteAttitude.parse({ geste: 'scene', avant: pnjLu.cran, apres: apres.cran, motif: motif.slice(0, 120), parUid: session.uid, ...(s.seance ? { seance: s.seance } : {}), creeLe: maintenant }),
      );
    }
    tx.set(refScene(idScene), close);
    tx.set(refTable(), { sceneHorsCombat: null }, { merge: true });
    return close;
  });
}

/** 10a : un cran de Vécu à chacun des personnages choisis, l'objectif pour motif. Rend le nombre de crans donnés. */
export async function donnerVecuDeScene(s: SceneHorsCombat, actions: readonly ActionScene[], persos: readonly string[]): Promise<number> {
  if (!s.marquante || s.issue !== 'gagnee') throw new RefusScene('Seule une scène marquante gagnée donne du Vécu.');
  const possibles = new Set(contributeurs(s, actions).map((a) => a.perso));
  const choisis = persos.filter((p) => possibles.has(p));
  for (const p of choisis) await donnerCranVecu(p, 1, `Scène : ${s.objectif}`, s.seance);
  return choisis.length;
}
