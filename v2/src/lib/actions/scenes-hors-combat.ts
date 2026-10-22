import { collection, doc, FieldPath, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/client';
import { formuleTest } from '../regles/des';
import { noeudsPossedes } from '../fiche/vecu';
import { aLeNoeud, apresLeTour, contributeurs, defaireJet, idAction, manquePourOuvrir, OPTIONS, pnjApresScene, RefusScene, relancable, resoudre } from '../scenes/hors-combat';
import { CLE_HORS_SEANCE, dejaUtiliseCetteSeance, NARRATIFS, noeudsEnScene, nomNoeud } from '../scenes/vecu-en-scene';
import { schemaVecu } from '../schemas/fiche';
import { schemaGesteAttitude, schemaPnj } from '../schemas/pnj';
import {
  schemaActionScene,
  schemaQuestionMj,
  schemaSceneHorsCombat,
  schemaSceneHorsCombatMj,
  schemaUtilisationVecu,
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
  /** S3 : face à une foule ou un groupe (Orateur, 3a), face à une autorité (Citer le précédent, 5a). */
  foule: boolean;
  autorite: boolean;
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
    let duPeuple = false;
    if (b.type === 'social') {
      const lu = await tx.get(refPnj(b.pnj!));
      const p = lu.exists() ? schemaPnj.parse(lu.data()) : null;
      if (!p?.cran) throw new RefusScene('Ce PNJ n’est pas encore rencontré.');
      depart = p.cran;
      duPeuple = p.peuple;
    }
    // S3 : les nœuds du Vécu utiles en scène de chaque appelé, relevés sur sa fiche.
    const vecus: Record<string, string[]> = {};
    for (const ap of b.appeles) {
      const f = await tx.get(doc(db, `tables/${session.table}/persos/${ap.perso}`));
      const v = f.exists() ? schemaVecu.safeParse(f.get('vecu')) : null;
      const n = v?.success ? noeudsEnScene(noeudsPossedes(v.data)) : [];
      if (n.length) vecus[ap.uid] = n;
    }
    // Homme du peuple (2a) : un cran de plus au départ, un seul, face à un PNJ du peuple.
    const peuple = duPeuple && Object.values(vecus).some((n) => n.includes('homme-du-peuple')) ? 1 : 0;
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
      peuple,
      foule: b.foule,
      autorite: b.autorite,
      vecus,
      usages: {},
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
 * S3 : le Vécu de l'appelé compte (Langue d'argent, Orateur, Crocheter…) ;
 * Lire les gens réussi laisse au joueur seul une révélation (le DD du
 * moment), que le MJ complète de l'intention du PNJ ; une relance (8a)
 * défait l'échec qu'elle remplace.
 */
export async function resoudreAction(idScene: string, idActe: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const refActe = doc(db, `${chemin(idScene)}/actions/${idActe}`);
    const [lu, luMj, luActe] = [await tx.get(refScene(idScene)), await tx.get(refSceneMj(idScene)), await tx.get(refActe)];
    if (!lu.exists() || !luMj.exists() || !luActe.exists()) return;
    let s = schemaSceneHorsCombat.parse(lu.data());
    const a = schemaActionScene.parse(luActe.data());
    const dd = schemaSceneHorsCombatMj.parse(luMj.data()).dd;
    if (a.relance) {
      if (a.resultat !== null || s.statut === 'close') return;
      const refOrigine = doc(db, `${chemin(idScene)}/actions/${idAction(a.tour, a.uid)}`);
      const luOrigine = await tx.get(refOrigine);
      const origine = luOrigine.exists() ? schemaActionScene.parse(luOrigine.data()) : null;
      if (!origine || !relancable(s, origine)) {
        tx.update(refActe, { resultat: 'passe', note: 'Relance refusée' });
        return;
      }
      s = defaireJet(s, origine.delta ?? {});
      const r = resoudre(s, dd, a);
      tx.update(refOrigine, { annule: true });
      tx.update(refActe, { resultat: r.resultat, note: r.note ? `Mémoire eidétique, ${r.note}` : 'Mémoire eidétique', delta: r.delta });
      tx.set(refScene(idScene), schemaSceneHorsCombat.parse(r.scene));
      return;
    }
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
      const r = resoudre(s, dd, a);
      apres = r.scene;
      resultat = r.resultat;
      tx.update(refActe, { resultat, note: r.note, delta: r.delta });
      if (r.revelation !== null)
        tx.set(
          doc(db, `tables/${session.table}/questions/${idScene}-${a.uid}-lire`),
          schemaQuestionMj.parse({ uid: a.uid, perso: a.perso, nom: a.nom, noeud: 'lire-les-gens', scene: idScene, question: null, dd: r.revelation, reponse: null, creeLe: Date.now(), reponduLe: null }),
        );
    }
    apres = apresLeTour(apres, [...autres, { uid: a.uid, resultat }]);
    if (apres !== s) tx.set(refScene(idScene), schemaSceneHorsCombat.parse(apres));
  });
}

/** Clé de `usages` de la fiche : la séance en cours, ou hors séance (11a). */
const cleSeance = (seance: string | undefined) => seance ?? CLE_HORS_SEANCE;
async function noterUsage(perso: string, noeud: string, seance: string | undefined): Promise<void> {
  await updateDoc(doc(db, `tables/${session.table}/persos/${perso}`), new FieldPath('usages', noeud), { seance: cleSeance(seance), le: Date.now() });
}

/**
 * Mémoire eidétique (8a) : le joueur relance un échec d'INT ou de CHA, une
 * fois par séance. Le nouveau d20 part au journal ; le client du MJ défait
 * l'échec et tranche le nouveau jet.
 */
export async function relancerEnScene(idScene: string, s: SceneHorsCombat, origine: ActionScene, usages: Record<string, unknown>, seance: string | undefined): Promise<ActionScene> {
  const moi = s.appeles.find((x) => x.uid === session.uid);
  if (!moi || origine.uid !== moi.uid) throw new RefusScene('Ce jet n’est pas le tien.');
  if (!relancable(s, origine)) throw new RefusScene('Ce jet ne peut pas être relancé.');
  if (dejaUtiliseCetteSeance(usages, 'memoire-eidetique', seance)) throw new RefusScene('Mémoire eidétique a déjà servi cette séance.');
  const jet = await lancerEtNoter(`Scène : relance (${origine.competence})`.slice(0, 80), formuleTest(origine.bonus), moi.nom);
  const a = schemaActionScene.parse({ ...origine, de: jet!.des[0]!, resultat: null, relance: true, note: null, delta: null, annule: false, creeLe: Date.now() });
  await setDoc(doc(db, `${chemin(idScene)}/actions/${idAction(origine.tour, moi.uid)}-r`), a);
  await noterUsage(moi.perso, 'memoire-eidetique', seance);
  return a;
}

/**
 * « Capacités du Vécu » (10a) : un nœud narratif utilisé pendant la scène,
 * noté pour le MJ qui le raconte. Un « 1x/scène » ne sert qu'une fois par
 * scène ; un « 1x/jour », une fois par séance (11a) ; les autres, le MJ juge.
 */
export async function utiliserCapacite(idScene: string, s: SceneHorsCombat, noeud: string, usages: Record<string, unknown>): Promise<void> {
  const moi = s.appeles.find((x) => x.uid === session.uid);
  const decompte = NARRATIFS[noeud];
  if (!moi || !decompte || !aLeNoeud(s, moi.uid, noeud)) throw new RefusScene('Tu n’as pas cette capacité dans cette scène.');
  if (s.statut === 'close') throw new RefusScene('La scène est close.');
  if (decompte === 'jour' && dejaUtiliseCetteSeance(usages, noeud, s.seance)) throw new RefusScene(`${nomNoeud(noeud)} a déjà servi cette séance.`);
  const u = schemaUtilisationVecu.parse({ uid: moi.uid, perso: moi.perso, nom: moi.nom, noeud, tour: s.tour, creeLe: Date.now() });
  const id = decompte === 'scene' ? `${moi.uid}-${noeud}` : `${moi.uid}-${noeud}-${Date.now().toString(36)}`;
  await setDoc(doc(db, `${chemin(idScene)}/utilisations/${id}`), u);
  if (decompte === 'jour') await noterUsage(moi.perso, noeud, s.seance);
}

/**
 * Une question au MJ (9a) : Savant, une fois par scène, pendant une scène ;
 * Réseau de rumeurs, une fois par séance, depuis la fiche. Le MJ répond dans
 * l'app, le joueur seul lit la réponse.
 */
export async function poserQuestion(
  noeud: 'savant' | 'reseau-de-rumeurs',
  question: string,
  qui: { perso: string; nom: string; usages: Record<string, unknown>; seance: string | undefined; scene: string | null },
): Promise<string> {
  if (!question.trim()) throw new RefusScene('Écris ta question.');
  if (noeud === 'savant' && !qui.scene) throw new RefusScene('Savant se pose pendant une scène.');
  if (noeud === 'reseau-de-rumeurs' && dejaUtiliseCetteSeance(qui.usages, noeud, qui.seance)) throw new RefusScene('Réseau de rumeurs a déjà servi cette séance.');
  const id = noeud === 'savant' ? `${qui.scene}-${session.uid}-savant` : `${cleSeance(qui.seance)}-${session.uid}-rumeurs`;
  const q = schemaQuestionMj.parse({ uid: session.uid, perso: qui.perso, nom: qui.nom, noeud, scene: noeud === 'savant' ? qui.scene : null, question, dd: null, reponse: null, creeLe: Date.now(), reponduLe: null });
  await setDoc(doc(db, `tables/${session.table}/questions/${id}`), q);
  if (noeud === 'reseau-de-rumeurs') await noterUsage(qui.perso, noeud, qui.seance);
  return id;
}

/** Le MJ répond à une question, ou donne l'intention lue par Lire les gens. */
export async function repondreQuestion(id: string, reponse: string): Promise<void> {
  if (!reponse.trim()) throw new RefusScene('Écris la réponse.');
  await updateDoc(doc(db, `tables/${session.table}/questions/${id}`), { reponse: reponse.trim().slice(0, 500), reponduLe: Date.now() });
}

/**
 * Levier (6a) : le MJ valide un secret connu d'un appelé ; la scène prend
 * ±2 crans, et le secret est noté sur le PNJ pour ne servir qu'une fois.
 */
export async function levierEnScene(idScene: string, sens: 1 | -1, secret: string): Promise<SceneHorsCombat> {
  const texte = secret.trim().slice(0, 120);
  if (!texte) throw new RefusScene('Note le secret utilisé.');
  return runTransaction(db, async (tx) => {
    const lu = await tx.get(refScene(idScene));
    if (!lu.exists()) throw new RefusScene('Cette scène n’existe plus.');
    const s = schemaSceneHorsCombat.parse(lu.data());
    if (s.statut !== 'ouverte' || s.type !== 'social' || !s.pnj) throw new RefusScene('Le levier se joue dans une scène sociale en cours.');
    if (!s.appelesUids.some((u) => aLeNoeud(s, u, 'levier'))) throw new RefusScene('Aucun appelé n’a Levier.');
    const luPnj = await tx.get(refPnj(s.pnj));
    if (!luPnj.exists()) throw new RefusScene('Ce PNJ n’existe plus.');
    const p = schemaPnj.parse(luPnj.data());
    if (p.secrets.some((x) => x.toLowerCase() === texte.toLowerCase())) throw new RefusScene('Ce secret a déjà servi.');
    const apres = schemaSceneHorsCombat.parse(sens > 0 ? { ...s, hausses: s.hausses + 2 } : { ...s, baisses: s.baisses + 2 });
    tx.set(refScene(idScene), apres);
    tx.set(refPnj(s.pnj), schemaPnj.parse({ ...p, secrets: [...p.secrets, texte], majLe: Date.now() }));
    return apres;
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
