import { actionParId } from '../../regles/index.ts';
import { paliersDefinis } from '../effets/paliers.ts';
import { resoudreLancer, type Changement, type CibleEnJeu, type JetNote, type LanceurEnJeu } from '../effets/resolution.ts';
import type { Case } from '../battlemap/geometrie.ts';
import type { Duree, Element, Maitrise } from '../schemas/effets.ts';
import { NATURES_SOL, type LanceurFige, type NatureSol, type ZoneSol } from '../schemas/zones.ts';
import { lancerDegats } from './attaque.ts';
import { CATALOGUE } from './sorts.ts';

/*
 * Ce qu'une zone au sol fait à qui la déclenche (lot L6.4b1, décisions de
 * Thomas du 24/10/2026), en fonction pure : des jets et des changements,
 * que lib/combat/changements.ts applique comme ceux d'un sort.
 *   - 6a : une zone de sort rejoue son sort avec le lanceur figé au
 *     lancer (son DD, ses mods), et relance les dés à chaque déclenchement ;
 *     ni échec d'école, ni dérapage : ils ont été joués au lancer ;
 *   - 3a : une case dangereuse du MJ : ses dégâts, une sauvegarde qui les
 *     réduit de moitié et évite l'état ;
 *   - 11a : glissant, sauvegarde de DEX ou Renversé ; enflammé et
 *     électrifié, 1d6 de l'élément ; les autres terrains n'agissent pas au
 *     déclenchement (ils changent le sol, ou se lisent) ;
 *   - une case spéciale dit son texte.
 */

/** Dégâts d'un terrain qui brûle ou qui crépite (11a), sans sauvegarde. */
export const DEGATS_TERRAIN: Readonly<Partial<Record<string, { des: string; type: string }>>> = {
  enflamme: { des: '1d6', type: 'feu' },
  electrifie: { des: '1d6', type: 'electricite' },
};

/** Le lanceur figé, tel que le moteur le lit (sans ses états du moment). */
export function lanceurDuFige(l: LanceurFige): LanceurEnJeu {
  return { id: l.id, camp: l.camp, def: l.def, sauvegardes: l.sauvegardes, etats: [], modMagie: l.modMagie, attaqueMagique: l.attaqueMagique, niveau: l.niveau, mods: l.mods };
}

const d20 = (alea: () => number) => 1 + Math.floor(alea() * 20);

/** Une sauvegarde de la cible contre un DD : d20 + son bonus. */
function sauvegarde(c: CibleEnJeu, type: 'FOR' | 'DEX' | 'CON' | 'Volonte', dd: number, alea: () => number): JetNote {
  const de = d20(alea);
  const total = de + c.sauvegardes[type];
  return { quoi: `sauvegarde de ${type}`, cible: c.id, des: [de], total, contre: dd, reussi: total >= dd };
}

export interface EffetDeZone {
  jets: JetNote[];
  changements: Changement[];
}

/** Ce que la zone fait à cette créature ; null si elle n'agit pas. */
export function effetDeZone(z: Pick<ZoneSol, 'sort' | 'danger' | 'nature' | 'dd' | 'texte' | 'nom'>, cible: CibleEnJeu, alea: () => number = Math.random): EffetDeZone | null {
  if (z.sort) {
    const brute = actionParId.get(z.sort.action);
    if (!brute) return null;
    const palier = paliersDefinis(brute).includes(z.sort.palier) ? z.sort.palier : 'I';
    const r = resoudreLancer(
      { action: brute, palier, element: z.sort.element, lanceur: lanceurDuFige(z.sort.lanceur), cibles: [cible], zone: [cible], rejoue: true, alea },
      CATALOGUE,
    );
    if (!r.ok) return { jets: [], changements: [{ type: 'narratif', cible: cible.id, texte: `${z.nom} : ${r.raison}` }] };
    // La zone et son terrain sont déjà sur la carte : ne garder que ce qui arrive à la créature.
    return { jets: r.jets.filter((j) => j.cible === cible.id || j.cible === undefined), changements: r.changements.filter((c) => c.type !== 'terrain' && c.type !== 'invocation') };
  }
  if (z.danger) {
    const d = z.danger;
    const jets: JetNote[] = [];
    const jet = lancerDegats(d.formule, alea);
    let reussie = false;
    if (d.sauvegarde && d.dd !== null) {
      const s = sauvegarde(cible, d.sauvegarde, d.dd, alea);
      jets.push(s);
      reussie = !!s.reussi;
    }
    const changements: Changement[] = [];
    if (jet) {
      jets.push({ quoi: 'dégâts', cible: cible.id, des: jet.des, total: jet.total });
      const montant = reussie ? Math.floor(jet.total / 2) : jet.total;
      changements.push({ type: 'degats', cible: cible.id, montant, typeDegats: d.typeDegats, calcul: d.formule });
    }
    if (d.etat && !reussie) changements.push({ type: 'etat', cible: cible.id, etat: d.etat, duree: (d.rounds ? { rounds: d.rounds } : 'finCombat') as Duree });
    return { jets, changements };
  }
  if (z.nature === 'glissant') {
    const s = sauvegarde(cible, 'DEX', z.dd ?? 12, alea);
    return { jets: [s], changements: s.reussi ? [] : [{ type: 'tombe', cible: cible.id }] };
  }
  const t = z.nature ? DEGATS_TERRAIN[z.nature] : undefined;
  if (t) {
    const jet = lancerDegats(t.des, alea);
    if (!jet) return null;
    return { jets: [{ quoi: 'dégâts', cible: cible.id, des: jet.des, total: jet.total }], changements: [{ type: 'degats', cible: cible.id, montant: jet.total, typeDegats: t.type, calcul: t.des }] };
  }
  if (z.texte) return { jets: [], changements: [{ type: 'narratif', cible: cible.id, texte: z.texte }] };
  return null;
}

// ---------------------------------------------------------------- Poser la zone d'un sort (5a, 8a, 9a, 10a)

/** Ce que disent les terrains qui ne font que se lire (11a). */
export const TEXTES_TERRAIN: Readonly<Partial<Record<string, string>>> = {
  sanctuaire: 'Sanctuaire : rien d’extérieur ne cible ceux qui sont dedans.',
  sanctifie: 'Sol sanctifié.',
  illusion: 'Illusion : ce qu’on y voit n’est pas là.',
  couverture: 'Couverture : +2 en DEF contre les attaques à distance.',
};

/** Terrains qui agissent quand on y entre, même si le sort ne le dit pas (11a). */
const A_L_ENTREE: readonly string[] = ['glissant', 'enflamme', 'electrifie'];

/** Les rounds d'une zone (9a) : sa durée, ou base + un mod du lanceur ; null jusqu'à la fin du combat. */
export function roundsDeZone(d: Duree | undefined, l: Pick<LanceurFige, 'modMagie' | 'mods'>): number | null {
  if (d === undefined || typeof d === 'string') return d === 'prochainTour' ? 1 : null;
  if ('rounds' in d) return d.rounds;
  if ('base' in d) return Math.max(1, Math.min(99, d.base + ('plusModMagie' in d ? l.modMagie : (l.mods[d.plusModCible] ?? 0))));
  return null;
}

/**
 * La zone qu'un sort laisse au sol (5a) : une zone qui dure (les données le
 * disent), ou un terrain posé par le sort. `cases` : celles de la visée ;
 * `suit` : une aura autour du lanceur (8a), en décalage de son jeton ;
 * sinon ancrée sur `ancre`. Le sort ne se rejoue que si les données disent
 * quand (6a) ; un piège sert une fois (10a). null : rien ne reste.
 */
export function zoneDuSort(p: {
  action: string;
  palier: 'I' | 'II' | 'III';
  element: { id: Element; maitrise: Maitrise } | null;
  lanceur: LanceurFige;
  dd: number;
  cases: readonly Case[];
  ancre: Case;
  suit: boolean;
  changements: readonly Changement[];
  maintenant: number;
}): ZoneSol | null {
  const a = actionParId.get(p.action);
  if (!a || !p.cases.length) return null;
  const terrain = p.changements.find((c) => c.type === 'terrain');
  const brut = terrain && terrain.type === 'terrain' ? terrain.nature : null;
  const nature = brut && (NATURES_SOL as readonly string[]).includes(brut) ? (brut as NatureSol) : null;
  if (a.persistance.type !== 'zone' && !nature) return null;
  const quand = a.persistance.quand ?? (nature && A_L_ENTREE.includes(nature) ? 'entree' : null);
  return {
    nom: a.nom.slice(0, 60),
    nature,
    cases: p.cases.slice(0, 200).map((c) => ({ dx: c.cx - p.ancre.cx, dy: c.cy - p.ancre.cy })),
    ancre: p.suit ? null : { cx: p.ancre.cx, cy: p.ancre.cy },
    lanceur: p.lanceur.id,
    camp: p.lanceur.camp,
    filtre: a.zone?.filtre ?? 'tous',
    quand,
    sort: a.persistance.quand ? { action: a.id, palier: p.palier, element: p.element, lanceur: p.lanceur } : null,
    danger: null,
    dd: nature === 'glissant' ? Math.max(5, Math.min(30, p.dd)) : null,
    texte: nature ? (TEXTES_TERRAIN[nature] ?? null) : null,
    usageUnique: a.persistance.quand === 'finDeplacement',
    cachee: false,
    rounds: roundsDeZone(a.persistance.duree ?? (terrain && terrain.type === 'terrain' ? terrain.duree : undefined), p.lanceur),
    declenchements: {},
    creeLe: p.maintenant,
  };
}
