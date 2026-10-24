import { invocationParId } from '../../regles/index.ts';
import type { Changement } from '../effets/resolution.ts';
import type { Combattant, InvocationEnJeu } from '../schemas/combat.ts';
import type { Duree } from '../schemas/effets.ts';
import type { Invocation } from '../schemas/invocations.ts';
import { PORTEE_CONTACT, type Portee } from './attaque.ts';
import { dureeEnRounds } from './bonus.ts';

/*
 * Les invocations en combat (lot L6.4b2, décisions de Thomas du
 * 24/10/2026), en fonctions pures. lib/actions/invocations.ts les écrit.
 *   - 13b : une invocation est un combattant à part, avec son initiative :
 *     d20 + le mod d'initiative de son maître, lancé à l'invocation (5a) ;
 *     les trois Embruns de Légion partagent un seul jet (6a) ;
 *   - 14a : son tour se joue depuis la barre du joueur de son maître : ses
 *     cases, son attaque (l'attaque magique du maître, ses dés), ses
 *     capacités qui ont des effets dans les données ; pas de sorts ;
 *   - 10a : ses PV et sa DEF en chiffres, comme un monstre ; la barricade
 *     est touchée par toute attaque ; l'Illusion vivante a la DEF du mage et
 *     la moitié de ses PV au lancer ;
 *   - 15a, 8a : au début du tour du maître, il paie le Remous de ses
 *     invocations en PP ; s'il ne peut pas tout payer, toutes retournent à
 *     la Mer ;
 *   - 9a : ses rounds se décomptent à la fin du tour du maître ; « fin du
 *     combat » et « scène » durent jusqu'à la fin du combat ; à 0 PV, elle
 *     s'en va.
 * Ce qui remplace la note de L4.4a (« elles agissent au tour du mage, sans
 * lui coûter d'action ») : la décision 13b du 24/10/2026.
 */

/** Ce que le moteur sait du maître au lancer. */
export interface MaitreAuLancer {
  niveau: number;
  modMagie: number;
  attaqueMagique: number;
  /** Sa CA (Illusion vivante : la DEF du lanceur). */
  def: number;
  pvActuel: number;
  modInit: number;
}

/** Les chiffres d'une invocation d'après son maître (10a). */
export function chiffresInvocation(inv: Invocation, m: MaitreAuLancer): { pv: number; def: number; objet: boolean; attaque: InvocationEnJeu['attaque'] } {
  const pv = 'moitiePvLanceur' in inv.pv ? Math.floor(m.pvActuel / 2) : (inv.pv.base ?? 0) + Math.floor(inv.pv.parNiveau * m.niveau);
  const def = 'commeLanceur' in inv.def ? m.def : 'objet' in inv.def ? 0 : inv.def.base + (inv.def.plusModMagie ? m.modMagie : 0);
  const attaque = inv.attaque
    ? { bonus: Math.max(-10, Math.min(40, m.attaqueMagique)), des: `${inv.attaque.des}${inv.attaque.plusModMagie && m.modMagie ? (m.modMagie > 0 ? `+${m.modMagie}` : `${m.modMagie}`) : ''}`, typeDegats: inv.attaque.typeDegats }
    : null;
  return { pv: Math.max(1, Math.min(9999, pv)), def: Math.max(-10, Math.min(99, def)), objet: 'objet' in inv.def, attaque };
}

/** Ce qu'un lancer appelle (13b) : la créature, combien, pour combien de rounds. */
export interface AInvoquer {
  creature: string;
  nom: string;
  element: string | null;
  /** Identifiants des combattants à créer, un par créature. */
  ids: string[];
  rounds: number | null;
  /** Cases au plus du lanceur où elle paraît (4a). */
  portee: number;
}

/** Portée où paraît une invocation (4a : 6 cases, comme Portail). */
export const PORTEE_INVOCATION = 6;

/** Les invocations qu'un lancer appelle, avec leurs identifiants (`i-<maître>-<lancer>-<n>`). */
export function invocationsDuLancer(changements: readonly Changement[], maitre: string, lancer: string): AInvoquer[] {
  const r: AInvoquer[] = [];
  let n = 0;
  for (const c of changements) {
    if (c.type !== 'invocation') continue;
    const inv = invocationParId.get(c.creature);
    if (!inv) continue;
    const ids = Array.from({ length: Math.max(1, Math.min(5, c.nombre)) }, () => `i-${maitre.replace(/^pj-/, '')}-${lancer}-${++n}`);
    r.push({ creature: c.creature, nom: inv.nom.slice(0, 40), element: c.element ?? inv.element ?? null, ids, rounds: roundsInvocation(c.duree), portee: PORTEE_INVOCATION });
  }
  return r;
}

/** 9a : des rounds ; « fin du combat » et « scène » : null, jusqu'à la fin du combat. */
export function roundsInvocation(d: Duree): number | null {
  return dureeEnRounds(d);
}

/** L'invocation en jeu, à écrire sur son combattant. */
export function invocationEnJeu(a: AInvoquer, m: MaitreAuLancer, lancer: string): { enJeu: InvocationEnJeu; pv: number; def: number; mvt: number } | null {
  const inv = invocationParId.get(a.creature);
  if (!inv) return null;
  const c = chiffresInvocation(inv, m);
  return {
    enJeu: { creature: inv.id, element: a.element, attaque: c.attaque, objet: c.objet, remous: Math.round(inv.remousParRound), rounds: a.rounds, lancer },
    pv: c.pv,
    def: c.def,
    mvt: inv.deplacement,
  };
}

type AvecId<T> = T & { id: string };

/** Les invocations d'un maître encore là. */
export function invocationsDe(combattants: readonly AvecId<Combattant>[], maitre: string): AvecId<Combattant>[] {
  // Seule une invocation a un maître (lib/schemas/combat.ts).
  return combattants.filter((c) => c.maitre === maitre);
}

/** 15a : le Remous que le maître paie au début de son tour. */
export function remousDu(combattants: readonly AvecId<Combattant>[], maitre: string): number {
  return invocationsDe(combattants, maitre).reduce((t, c) => t + (c.invocation?.remous ?? 0), 0);
}

/** 9a : à la fin du tour du maître, ses invocations perdent un round ; à 0, elles s'en vont. */
export function finDeTourInvocations(combattants: readonly AvecId<Combattant>[], maitre: string): { maj: { id: string; invocation: InvocationEnJeu }[]; retirer: string[] } {
  const maj: { id: string; invocation: InvocationEnJeu }[] = [];
  const retirer: string[] = [];
  for (const c of invocationsDe(combattants, maitre)) {
    const r = c.invocation!.rounds;
    if (r === null) continue;
    if (r > 1) maj.push({ id: c.id, invocation: { ...c.invocation!, rounds: r - 1 } });
    else retirer.push(c.id);
  }
  return { maj, retirer };
}

/** Une capacité de l'invocation que la barre joue (7a) : ce qu'elle change, sur l'allié choisi. */
export interface CapaciteJouable {
  nom: string;
  texte: string;
  /** null : elle se lit (au MJ) ; sinon, ses changements sur un allié. */
  effets: ((cible: string) => Changement[]) | null;
}

const JOUABLES: readonly string[] = ['bonus', 'etat', 'retraitEtat'];

/** 7a : les capacités qui ont des effets sur un allié (bonus, état, retrait d'état) se jouent ; les autres se lisent. */
export function capacitesDe(creature: string): CapaciteJouable[] {
  const inv = invocationParId.get(creature);
  if (!inv) return [];
  return inv.capacites.map((c) => {
    // Toute la capacité se joue, ou elle se lit : une capacité sans effet, ou avec un effet que la barre ne joue pas (terrain…), va au MJ.
    if (!c.effets.length || c.effets.some((e) => !JOUABLES.includes(e.type))) return { nom: c.nom, texte: c.texte, effets: null };
    return {
      nom: c.nom,
      texte: c.texte,
      effets: (cible: string) =>
        c.effets.flatMap((e): Changement[] => {
          if (e.type === 'retraitEtat') return [{ type: 'retraitEtat', cible, etats: e.etats, nombre: e.nombre }];
          if (e.type === 'etat') return [{ type: 'etat', cible, etat: e.etat, duree: e.duree }];
          // Les bonus des invocations sont chiffrés (Aide : +2).
          if (e.type === 'bonus') return [{ type: 'bonus', cible, sur: e.cible, valeur: e.valeur as number, duree: e.duree }];
          return [];
        }),
    };
  });
}

/** La portée de son attaque : au contact ; le squelette tire à l'arc, jusqu'à 10 cases (sa capacité « Arc »). */
export const PORTEE_ARC: Portee = { min: 0, max: 10, vue: true };
export function porteeInvocation(creature: string): Portee {
  return invocationParId.get(creature)?.capacites.some((c) => c.nom === 'Arc') ? PORTEE_ARC : PORTEE_CONTACT;
}

/** « Tison (2) » : le nom et les rounds qui restent. */
export function texteInvocation(c: Pick<Combattant, 'nom' | 'invocation'>): string {
  return `${c.nom}${c.invocation?.rounds ? ` (${c.invocation.rounds})` : ''}`;
}
