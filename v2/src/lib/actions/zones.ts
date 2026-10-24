import { collection, deleteDoc, doc, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/client';
import type { Case, JetonCarte } from '../battlemap/geometrie';
import { degatsSurPj } from '../combat/attaques-pj';
import { appliquerChangements, texteJet, typeSubi } from '../combat/changements';
import { effetDeZone } from '../combat/effets-zone';
import { campDe } from '../combat/ordre';
import { cibleDe } from '../combat/sorts';
import { declenchements, debutDeTourZones, type ZoneActive } from '../combat/zones-sol';
import type { CibleEnJeu } from '../effets/resolution';
import { vueFiche } from '../fiche/vue-fiche';
import { schemaCombattant, type Combattant } from '../schemas/combat';
import type { Fiche } from '../schemas/fiche';
import { schemaZoneSol, type Danger, type ZoneSol } from '../schemas/zones';
import { session } from '../session.svelte';
import { noterJet } from './journal';

/*
 * Écritures des zones au sol (lot L6.4b1, décisions de Thomas du
 * 24/10/2026). Les règles sont dans lib/combat (zones-sol.ts,
 * effets-zone.ts, changements.ts) ; ce module pose, retire, déclenche et
 * note au journal.
 *   - 1a, 3a, 4a : le MJ peint une case (infranchissable, difficile,
 *     dangereuse, spéciale), cachée ou non, d'un clic ; un second clic
 *     l'efface ;
 *   - 5a : les zones de sort et les pièges vivent dans le combat ;
 *   - 7a : le déclenchement à l'entrée et en fin de déplacement est joué
 *     par le client de celui qui bouge ; celui du début de tour, par le
 *     client du MJ ;
 *   - 3a : une fois par tour du combat et par créature ; un piège s'en va
 *     au premier déclenchement (10a) ; une case cachée se montre (4a).
 */

type AvecId<T> = T & { id: string };
export type LieuZone = { scene: string } | { combat: string };

const cheminZones = (l: LieuZone) => ('scene' in l ? `tables/${session.table}/scenes/${l.scene}/zones` : `tables/${session.table}/combats/${l.combat}/zones`);
const refCombattant = (idCombat: string, c: string) => doc(db, `tables/${session.table}/combats/${idCombat}/combattants/${c}`);
const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);

/** Identifiant d'une case du MJ (une case par document). */
export const idCase = (c: Case) => `c-${c.cx}-${c.cy}`;

export interface ReglageCase {
  nature: 'infranchissable' | 'difficile' | 'dangereuse' | 'speciale';
  danger: Danger | null;
  texte: string | null;
  cachee: boolean;
}

const NOMS_CASES: Readonly<Record<ReglageCase['nature'], string>> = { infranchissable: 'Infranchissable', difficile: 'Terrain difficile', dangereuse: 'Case dangereuse', speciale: 'Case spéciale' };

/** La zone d'une case du MJ (1a, 3a) : posée pour toujours, sur tout le monde ; dangereuse et spéciale agissent à l'entrée. */
export function zoneDeCase(c: Case, r: ReglageCase, maintenant: number): ZoneSol {
  return schemaZoneSol.parse({
    nom: NOMS_CASES[r.nature],
    nature: r.nature,
    cases: [{ dx: 0, dy: 0 }],
    ancre: { cx: c.cx, cy: c.cy },
    lanceur: null,
    camp: null,
    filtre: 'tous',
    quand: r.nature === 'dangereuse' || r.nature === 'speciale' ? 'entree' : null,
    sort: null,
    danger: r.nature === 'dangereuse' ? r.danger : null,
    dd: null,
    texte: r.texte?.trim() ? r.texte.trim().slice(0, 200) : null,
    usageUnique: false,
    cachee: r.cachee,
    rounds: null,
    declenchements: {},
    creeLe: maintenant,
  });
}

/** MJ : peindre une case, ou l'effacer (reglage null). */
export async function peindreCase(scene: string, c: Case, r: ReglageCase | null): Promise<void> {
  const ref = doc(db, `${cheminZones({ scene })}/${idCase(c)}`);
  if (r === null) await deleteDoc(ref);
  else await setDoc(ref, zoneDeCase(c, r, Date.now()));
}

/** Poser la zone d'un sort ou d'un piège dans le combat (5a). */
export async function poserZone(idCombat: string, z: ZoneSol): Promise<string> {
  const ref = doc(collection(db, cheminZones({ combat: idCombat })));
  await setDoc(ref, schemaZoneSol.parse(z));
  return ref.id;
}

/** Retirer une zone (MJ, 16a ; ou fin de sa durée). */
export async function retirerZone(lieu: LieuZone, id: string): Promise<void> {
  await deleteDoc(doc(db, `${cheminZones(lieu)}/${id}`));
}

/** Une créature hors combat : un PJ avec sa fiche, sans états. */
function cibleHorsCombat(id: string, f: Fiche): CibleEnJeu {
  const c = { id, genre: 'pj', nom: f.nom.slice(0, 40), etats: [], bonus: [], pvTemp: 0 } as unknown as Combattant & { id: string };
  return cibleDe(c, f, 0);
}

/**
 * Déclencher une zone sur une créature (3a, 6a, 10a, 11a). En combat : le
 * combattant relu et écrit dans une transaction, avec la zone (son
 * déclenchement du tour, ou son retrait si c'est un piège). Hors combat :
 * les dégâts sur la fiche d'un PJ, le reste au journal. Rend vrai si la
 * zone a agi.
 */
export async function declencherZone(
  lieu: LieuZone,
  z: ZoneActive,
  qui: { id: string; nom: string; combattant: AvecId<Combattant> | null; fiche: AvecId<Fiche> | null },
  combat: { id: string; tour: number } | null,
  auteur: string,
  alea: () => number = Math.random,
): Promise<boolean> {
  const refZone = doc(db, `${cheminZones(lieu)}/${z.id}`);
  const tour = combat?.tour ?? 0;
  const majZone = z.usageUnique ? null : { declenchements: { ...z.declenchements, [qui.id]: tour }, cachee: false };
  const lanceur = { id: z.lanceur ?? 'mj', nom: z.sort?.lanceur.nom ?? 'MJ', fiche: null };
  let lignes: string[] = [];
  let auMj: string[] = [];
  let jets: ReturnType<typeof effetDeZone> = null;
  if (combat && qui.combattant) {
    const cible = qui.combattant;
    const r = await runTransaction(db, async (tx) => {
      const lu = await tx.get(refCombattant(combat.id, cible.id));
      if (!lu.exists()) return null;
      const c = { ...schemaCombattant.parse(lu.data()), id: cible.id };
      const e = effetDeZone(z, cibleDe(c, qui.fiche, 0), alea);
      if (!e) return null;
      const ecr = appliquerChangements(e.changements, new Map([[c.id, { c, fiche: qui.fiche }]]), lanceur);
      for (const [id, m] of ecr.combattants) tx.update(refCombattant(combat.id, id), m);
      for (const [id, m] of ecr.fiches) tx.update(refPerso(id), m);
      if (majZone) tx.update(refZone, majZone);
      else tx.delete(refZone);
      return { e, ecr };
    });
    if (!r) return false;
    jets = r.e;
    lignes = [...(r.ecr.lignes.get(cible.id) ?? []), ...(r.ecr.deplacements.length ? ['déplacement au MJ'] : [])];
    auMj = r.ecr.auMj;
  } else {
    // Hors combat (cases du MJ) : un PJ prend ses dégâts sur sa fiche ; le reste est dit.
    const e = qui.fiche ? effetDeZone(z, cibleHorsCombat(qui.id, qui.fiche), alea) : null;
    jets = e;
    if (e && qui.fiche) {
      const vue = vueFiche(qui.fiche);
      let pv = vue.pv.actuel;
      for (const ch of e.changements) {
        if (ch.type === 'degats') {
          const d = degatsSurPj(qui.fiche, ch.montant, typeSubi(ch.typeDegats));
          pv = Math.max(0, pv - d.net);
          lignes.push(`${d.net} dégâts ${ch.typeDegats} (${d.detail})`);
        } else if (ch.type === 'narratif') lignes.push(ch.texte);
        else auMj.push(`${ch.type} hors combat`);
      }
      if (pv !== vue.pv.actuel) await updateDoc(refPerso(qui.fiche.id), { pvActuel: pv });
    }
    if (majZone) await updateDoc(refZone, majZone);
    else await deleteDoc(refZone);
  }
  const j = jets?.jets.find((x) => x.des.length) ?? null;
  await noterJet(
    `${z.nom} : ${qui.nom}`,
    j ? '1d20' : '0',
    j ? { des: j.des, faces: 20, bonus: 0, total: j.total } : { des: [], faces: 0, bonus: 0, total: 0 },
    auteur,
    [...(jets?.jets.map(texteJet) ?? []), ...lignes, ...auMj.map((x) => `MJ : ${x}`)].join(' ; ') || `${qui.nom} entre dans ${z.nom}.`,
  );
  return true;
}

/** Ce que le combat sait pour déclencher : ses zones, la carte, ses combattants et les fiches. */
export interface ContexteZones {
  lieu: LieuZone;
  zones: readonly ZoneActive[];
  jetons: readonly JetonCarte[];
  combat: { id: string; tour: number } | null;
  combattants: readonly AvecId<Combattant>[];
  fiches: ReadonlyMap<string, AvecId<Fiche>>;
  auteur: string;
}

function quiEst(ctx: ContexteZones, id: string) {
  const combattant = ctx.combattants.find((c) => c.id === id) ?? null;
  const jeton = ctx.jetons.find((j) => j.id === id);
  const perso = combattant?.perso ?? (id.startsWith('pj-') ? id.slice(3) : null);
  const fiche = perso ? (ctx.fiches.get(perso) ?? null) : null;
  const camp: 'pj' | 'monstre' = combattant ? campDe(combattant) : jeton?.genre === 'pj' || jeton?.genre === 'invocation' ? 'pj' : 'monstre';
  return { combattant, fiche, camp, nom: combattant?.nom ?? fiche?.nom ?? (jeton && 'nom' in jeton ? String((jeton as { nom?: unknown }).nom) : id) };
}

/** Après un déplacement (7a) : les zones où le jeton entre, ou finit son pas, agissent sur lui. Rend leur nombre. */
export async function apresDeplacement(ctx: ContexteZones, bouge: { id: string; de: Case; vers: Case }, alea: () => number = Math.random): Promise<number> {
  const q = quiEst(ctx, bouge.id);
  let n = 0;
  for (const d of declenchements(ctx.zones, ctx.jetons, { ...bouge, camp: q.camp }, ctx.combat?.tour ?? 0)) {
    if (await declencherZone(ctx.lieu, d.zone, { id: bouge.id, nom: q.nom, combattant: q.combattant, fiche: q.fiche }, ctx.combat, ctx.auteur, alea)) n++;
  }
  return n;
}

/** Début du tour d'un combattant (7a, 11a) : les zones sur sa case agissent, joué par le client du MJ. */
export async function zonesDuDebutDeTour(ctx: ContexteZones, id: string, alea: () => number = Math.random): Promise<number> {
  const q = quiEst(ctx, id);
  let n = 0;
  for (const z of debutDeTourZones(ctx.zones, ctx.jetons, id, q.camp, ctx.combat?.tour ?? 0)) {
    if (await declencherZone(ctx.lieu, z, { id, nom: q.nom, combattant: q.combattant, fiche: q.fiche }, ctx.combat, ctx.auteur, alea)) n++;
  }
  return n;
}
