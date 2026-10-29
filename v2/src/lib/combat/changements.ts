import { etatParId } from '../../regles/index.ts';
import type { Changement, JetNote } from '../effets/resolution.ts';
import { vueFiche } from '../fiche/vue-fiche.ts';
import type { BonusCombat, Combattant, EtatCombat } from '../schemas/combat.ts';
import type { Fiche } from '../schemas/fiche.ts';
import { degatsSurMonstre } from './attaque.ts';
import { degatsSurPj } from './attaques-pj.ts';
import { absorber, dissiper, dureeEnRounds, gagnerPvTemp, poserBonus, SUR_CONTRE_ATTAQUE, texteBonus } from './bonus.ts';
import { consommerCharge, immunise, poserEtat, retirerEtat, rompre } from './etats.ts';
import { champsJauges, gainParDegatsSubis, jauge, type Jauges } from './ressources.ts';

/*
 * Ce qu'un sort change, écrit dans le combat (lot L6.4a, décision 10a de
 * Thomas du 23/10/2026). Fonction pure : les changements rendus par le
 * moteur, appliqués à l'état lu des combattants et des fiches, donnent les
 * champs à écrire et les lignes du journal.
 *   - dégâts : sur un monstre, après son armure et ses résistances (un
 *     élément compte comme magique) ; sur un PJ, après sa réduction ; les
 *     PV temporaires d'abord (11a) ; les états que les dégâts rompent
 *     tombent ;
 *   - soins sur un PJ (au plus ses PV max) ; PV temporaires (11a) ; états ;
 *     bonus (12a) ; retraits d'état ; dissipation (les bonus les plus
 *     récents) ; « tombe » : Renversé ;
 *   - ressources du lanceur ;
 *   - déplacements : rendus à part, la carte les joue ;
 *   - le reste (invocation, terrain, mutation, jets réservés…) va au MJ
 *     par le journal (L6.4b, MJ).
 * Le soin d'un monstre par un joueur reste au MJ (les règles ne laissent
 * le joueur que faire baisser ses PV).
 */

export type Lu = { c: Combattant & { id: string }; fiche: (Fiche & { id: string }) | null };

export interface Ecritures {
  combattants: Map<string, Record<string, unknown>>;
  /** Par personnage. */
  fiches: Map<string, Record<string, unknown>>;
  deplacements: { cible: string; sens: 'repousse' | 'attire' | 'teleporte' | 'libre'; cases: number }[];
  /** Ce que chaque cible a pris, pour le journal. */
  lignes: Map<string, string[]>;
  /** Ce que l'app ne joue pas : au MJ. */
  auMj: string[];
}

interface Suivi {
  etats: EtatCombat[];
  bonus: BonusCombat[];
  pvTemp: number;
  /** Monstre : ses PV ; PJ : ceux de sa fiche. */
  pv: number;
  pvMax: number;
}

const memes = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Les dégâts du moteur contre un monstre ou un PJ : physique, ou magique (un élément compte comme magique, 10a). */
export const typeSubi = (t: string): 'physique' | 'magique' => (t === 'physique' ? 'physique' : 'magique');

/** Retirer `n` états « n'importe lesquels » : les plus récents parmi contrôle, malus et dégâts. */
function retirerN(etats: readonly EtatCombat[], n: number): EtatCombat[] {
  const genants = etats.filter((e) => ['controle', 'malus', 'degats'].includes(etatParId.get(e.id)?.categorie ?? '')).slice(-n);
  return etats.filter((e) => !genants.includes(e));
}

export function appliquerChangements(
  changements: readonly Changement[],
  lus: ReadonlyMap<string, Lu>,
  /** `fiche` : celle du lanceur, s'il peut l'écrire (ses ressources) ; null quand une zone rejoue le sort d'un autre (L6.4b1). */
  lanceur: { id: string; nom: string; fiche: (Fiche & { id: string }) | null },
  depart: {
    /** PV de fiche de départ, par personnage, quand le coût en a déjà ôté (sang). */
    pv?: ReadonlyMap<string, number>;
    /** Jauges du lanceur après le coût (Endurance, Sacré…). */
    jauges?: Jauges;
    /** L6.5b (8a) : une réaction ; ses bonus de DEF et d'attaque tombent avec la prochaine attaque. */
    reaction?: boolean;
    /** L6.6a (2a) : le MJ écrit : ses soins remontent aussi les PV d'un monstre (un joueur ne le peut pas). */
    parLeMj?: boolean;
  } = {},
): Ecritures {
  const pvDepart = depart.pv ?? new Map<string, number>();
  const suivis = new Map<string, Suivi>();
  const jauges: Jauges = { ...depart.jauges };
  const lignes = new Map<string, string[]>();
  const auMj: string[] = [];
  const deplacements: Ecritures['deplacements'] = [];
  const dire = (id: string, t: string) => lignes.set(id, [...(lignes.get(id) ?? []), t]);
  const suivi = (id: string): { lu: Lu; s: Suivi } | null => {
    const lu = lus.get(id);
    if (!lu) return null;
    let s = suivis.get(id);
    if (!s) {
      const pv = lu.c.genre !== 'pj' ? { pv: lu.c.pv ?? 0, pvMax: lu.c.pvMax ?? 1 } : lu.fiche ? { pv: pvDepart.get(lu.fiche.id) ?? vueFiche(lu.fiche).pv.actuel, pvMax: vueFiche(lu.fiche).pv.max } : { pv: 0, pvMax: 1 };
      s = { etats: [...lu.c.etats], bonus: [...lu.c.bonus], pvTemp: lu.c.pvTemp, ...pv };
      suivis.set(id, s);
    }
    return { lu, s };
  };
  const nomDe = (id: string) => lus.get(id)?.c.nom ?? id;

  for (const ch of changements) {
    if (ch.type === 'invocation') {
      auMj.push(`Invocation : ${ch.nombre} × ${ch.creature}${ch.element ? ` (${ch.element})` : ''}`);
      continue;
    }
    if (ch.type === 'terrain') {
      auMj.push(`Terrain : ${ch.nature}`);
      continue;
    }
    const x = suivi(ch.cible);
    if (!x) {
      auMj.push(`${ch.type} sur ${ch.cible}`);
      continue;
    }
    const { lu, s } = x;
    const pj = lu.c.genre === 'pj';
    switch (ch.type) {
      case 'degats': {
        const type = typeSubi(ch.typeDegats);
        let net: number;
        let detail: string;
        if (pj) {
          if (!lu.fiche) {
            auMj.push(`${ch.montant} dégâts sur ${lu.c.nom} : fiche absente`);
            continue;
          }
          const d = degatsSurPj(lu.fiche, ch.montant, type);
          net = d.net;
          detail = d.detail;
          if (lu.fiche.id === lanceur.fiche?.id) Object.assign(jauges, gainParDegatsSubis(lu.fiche, d.net));
        } else {
          const d = degatsSurMonstre(ch.montant, lu.c, type);
          net = d.net;
          detail = d.detail;
        }
        const t = absorber(s.pvTemp, net);
        s.pvTemp = t.pvTemp;
        s.pv = Math.max(0, s.pv - t.reste);
        if (net > 0) s.etats = rompre(s.etats, 'degatsSubis');
        // Les dés sont au journal avec le jet du moteur ; ici, ce qui reste après les défenses.
        dire(ch.cible, `${net} dégâts ${ch.typeDegats} (${detail}${t.reste !== net ? `, ${net - t.reste} sur les PV temporaires` : ''})`);
        break;
      }
      case 'soin':
      case 'soinComplet': {
        if (!pj && !depart.parLeMj) {
          auMj.push(`Soin de ${lu.c.nom}${ch.type === 'soin' ? ` (${ch.montant})` : ''} : au MJ`);
          continue;
        }
        const avant = s.pv;
        s.pv = ch.type === 'soin' ? Math.min(s.pvMax, s.pv + Math.max(0, ch.montant)) : s.pvMax;
        dire(ch.cible, `+${s.pv - avant} PV`);
        break;
      }
      case 'pvTemp':
        s.pvTemp = gagnerPvTemp(s.pvTemp, ch.montant);
        dire(ch.cible, `${s.pvTemp} PV temporaires`);
        break;
      case 'etat': {
        const d = etatParId.get(ch.etat);
        if (!d) {
          auMj.push(`État « ${ch.etat} » sur ${lu.c.nom}`);
          continue;
        }
        // L6.6a (8a) : un état dont il est immunisé ne se pose pas.
        if (immunise(lu.c, ch.etat)) {
          dire(ch.cible, `immunisé : ${d.nom}`);
          continue;
        }
        const rounds = dureeEnRounds(ch.duree);
        s.etats = poserEtat(s.etats, ch.etat, rounds, lanceur.nom, { charges: ch.charges ?? null, des: ch.des ?? null });
        dire(ch.cible, `${d.nom}${rounds ? ` ${rounds} round${rounds > 1 ? 's' : ''}` : ''}`);
        if (ch.contre || ch.drainePour) auMj.push(`${d.nom} sur ${lu.c.nom} : ${ch.drainePour ? 'drain' : 'contre'} au MJ`);
        break;
      }
      case 'chargeConsommee':
        s.etats = consommerCharge(s.etats, ch.etat);
        dire(ch.cible, `${etatParId.get(ch.etat)?.nom ?? ch.etat} : une charge`);
        break;
      case 'retraitEtat': {
        const avant = s.etats.length;
        s.etats = ch.etats.length ? ch.etats.reduce((e, id) => retirerEtat(e, id), s.etats) : retirerN(s.etats, ch.nombre);
        if (s.etats.length !== avant && ch.cible !== lanceur.id) dire(ch.cible, `${avant - s.etats.length} état(s) retiré(s)`);
        break;
      }
      case 'dissipation': {
        const avant = s.bonus.length;
        s.bonus = dissiper(s.bonus, ch.nombre);
        dire(ch.cible, avant === s.bonus.length ? 'rien à dissiper' : `${avant - s.bonus.length} effet(s) dissipé(s)`);
        break;
      }
      case 'bonus': {
        const b: BonusCombat = {
          sur: ch.sur.slice(0, 40),
          valeur: typeof ch.valeur === 'number' ? Math.max(-99, Math.min(99, ch.valeur)) : ch.valeur.slice(0, 20),
          rounds: dureeEnRounds(ch.duree),
          consomme: ch.consomme === 'prochaineFrappe',
          typeDegats: ch.typeDegats ?? null,
          source: lanceur.nom.slice(0, 40),
          ...(depart.reaction && SUR_CONTRE_ATTAQUE.includes(ch.sur) ? { contreAttaque: true as const } : {}),
        };
        s.bonus = poserBonus(s.bonus, b);
        dire(ch.cible, texteBonus(b));
        if (ch.parAllieAuContact) auMj.push(`${texteBonus(b)} sur ${lu.c.nom} : par allié au contact, au MJ`);
        break;
      }
      case 'deplacement':
        deplacements.push({ cible: ch.cible, sens: ch.sens, cases: ch.cases });
        break;
      case 'ressource': {
        if (ch.cible !== lanceur.id || !lanceur.fiche) {
          auMj.push(`${ch.ressource} de ${lu.c.nom} : au MJ`);
          continue;
        }
        const j = jauge(lanceur.fiche, ch.ressource);
        if (!j) {
          auMj.push(`${ch.ressource} : au MJ`);
          continue;
        }
        const actuel = jauges[ch.ressource] ?? j.actuel;
        const v = ch.montant === 'vider' ? 0 : actuel + ch.montant;
        jauges[ch.ressource] = Math.max(0, j.max !== null ? Math.min(j.max, v) : v);
        dire(ch.cible, `${j.nom} ${jauges[ch.ressource]}`);
        break;
      }
      case 'tombe':
        s.etats = poserEtat(s.etats, 'renverse', null, lanceur.nom);
        dire(ch.cible, 'Renversé');
        break;
      case 'narratif':
        dire(ch.cible, ch.texte);
        break;
      default:
        auMj.push(`${ch.type} sur ${nomDe(ch.cible)}`);
    }
  }

  const combattants = new Map<string, Record<string, unknown>>();
  const fiches = new Map<string, Record<string, unknown>>();
  for (const [id, s] of suivis) {
    const lu = lus.get(id)!;
    const m: Record<string, unknown> = {};
    if (!memes(s.etats, lu.c.etats)) m.etats = s.etats;
    if (!memes(s.bonus, lu.c.bonus)) m.bonus = s.bonus;
    if (s.pvTemp !== lu.c.pvTemp) m.pvTemp = s.pvTemp;
    if (lu.c.genre !== 'pj' && s.pv !== lu.c.pv) Object.assign(m, { pv: s.pv, aTerre: s.pv <= 0 });
    if (Object.keys(m).length) combattants.set(id, m);
    if (lu.c.genre === 'pj' && lu.fiche && s.pv !== (pvDepart.get(lu.fiche.id) ?? vueFiche(lu.fiche).pv.actuel)) fiches.set(lu.fiche.id, { pvActuel: s.pv });
  }
  if (lanceur.fiche && Object.keys(jauges).length) fiches.set(lanceur.fiche.id, { ...(fiches.get(lanceur.fiche.id) ?? {}), ...champsJauges(jauges) });
  return { combattants, fiches, deplacements, lignes, auMj };
}

/** « sauvegarde de DEX 14 contre DD 13 : réussie » ; « attaque magique 17 contre DEF 12 : touché ». */
export function texteJet(j: JetNote): string {
  const des = j.des.length > 1 ? ` (${j.des.join(', ')})` : '';
  const issue = j.reussi === undefined ? '' : j.quoi.startsWith('attaque') ? (j.reussi ? (j.critique ? ' : critique' : ' : touché') : ' : raté') : j.reussi ? ' : réussi' : ' : raté';
  return `${j.quoi} ${j.total}${des}${j.contre !== undefined ? ` contre ${j.quoi.startsWith('attaque') ? 'DEF' : j.quoi.startsWith('maîtrise') ? 'échec sur' : 'DD'} ${j.contre}` : ''}${issue}`;
}
