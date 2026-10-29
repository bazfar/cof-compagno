import { actionParId, combinaisons, elementParId, etatParId } from '../../regles/index.ts';
import { coutSort, MAITRISES } from '../effets/cout.ts';
import { actionAuPalier, paliersDefinis, palierSuivant } from '../effets/paliers.ts';
import { secondeEcole } from '../effets/profil.ts';
import type { ArmeEnJeu, Catalogue, CibleEnJeu, Lancer, LanceurEnJeu } from '../effets/resolution.ts';
import { vueFiche } from '../fiche/vue-fiche.ts';
import { classeDeLaRefonte, contexteDe, nomElement, profilDe } from '../fiche/refonte.ts';
import { distanceCases, type Case, type JetonCarte, type SceneCalcul } from '../battlemap/geometrie.ts';
import type { Combat, Combattant, SauvegardesCombat } from '../schemas/combat.ts';
import type { Action, Element, Maitrise, Palier, Sauvegarde } from '../schemas/effets.ts';
import type { Fiche, FicheV2 } from '../schemas/fiche.ts';
import { attaquesDuPj } from './attaques-pj.ts';
import { bonusFixe } from './bonus.ts';
import { campDe } from './ordre.ts';
import { famillesManiees } from './speciales.ts';
import { protegeParSanctuaire, type ZoneActive } from './zones-sol.ts';
import { legendairesRestantes } from './legendaire.ts';
import { rebondDe, type OptionsDuLancer } from './options-lancer.ts';
import { casesDeZone, jetonsDansZone, porteeEnCases, refusDePortee, type CaseTouchee, type ZoneSort } from './zone.ts';

/*
 * Sorts et capacités en combat (lot L6.4a, décisions de Thomas du
 * 23/10/2026). Fonctions pures : la liste de ce que le personnage lance,
 * son coût, et le lancer que reçoit le moteur (lib/effets/resolution.ts).
 *   - 2a : le client du lanceur résout avec le moteur ;
 *   - 3a : verbes (appris et par grimoire), sorts mineurs et capacités
 *     actives de la fiche ; ni réactions, ni passifs, ni attaques d'arme
 *     (L6.2, L6.3) ;
 *   - 4a : palier et surcharge comme sur la fiche ; le coût de combat
 *     entier ; l'élément selon sa maîtrise, dérapage du moteur compris ;
 *   - 5a : le type d'action vient des données : « action » prend l'action
 *     principale, « mineure » la secondaire, « gratuite » rien ;
 *   - 6a : ciblage sur la carte : un jeton (créature) ou une case (point),
 *     la portée et la vue vérifiées, sauf portées libérées par le MJ ;
 *   - 8a, 9a : la cible monstre sauvegarde avec ses sauvegardes recopiées ;
 *     un PJ, avec celles de sa fiche (Réflexes → DEX, Vigueur → CON et
 *     FOR, Volonté) ;
 *   - 12a : les bonus temporaires comptent (attaque magique, DEF,
 *     sauvegardes).
 */

const ORDRE: Palier[] = ['I', 'II', 'III'];

export type TypeAction = 'principale' | 'secondaire' | 'gratuite';

/** 5a : l'action du tour que prend une action des données. */
export function typeDAction(a: Pick<Action, 'action'>): TypeAction {
  return a.action === 'mineure' ? 'secondaire' : a.action === 'gratuite' ? 'gratuite' : 'principale';
}

export interface SortDeCombat {
  id: string;
  nom: string;
  description: string;
  groupe: 'verbe' | 'mineur' | 'capacite';
  /** Paliers lançables, du I au palier atteint. */
  paliers: Palier[];
  /** Maîtrise de l'école (verbe) ; Adepte sinon. */
  maitrise: Maitrise;
  /** Verbe appris par grimoire (palier I). */
  grimoire: boolean;
  typeAction: TypeAction;
  limite: Action['limite'];
  /** Éléments que le personnage peut y mettre, avec leur maîtrise (4a). */
  elements: { id: Element; nom: string; maitrise: Maitrise }[];
  /** L'élément est exigé (sort élémentaire). */
  elementRequis: boolean;
  /** Laissée au MJ par les données : sa raison. */
  manuel: string | null;
}

/** 3a : ce qu'une action devient en combat ; null pour une réaction, un passif ou une attaque d'arme. */
function lancableEnCombat(a: Action): boolean {
  return a.nature !== 'passif' && a.nature !== 'reaction' && a.action !== 'reaction' && a.action !== 'aucune' && !a.id.startsWith('arme.') && !a.famille;
}

/** L6.5b (10a) : l'attaque d'opportunité des données, que tout combattant a. */
export const OPPORTUNITE = 'arme.opportunite';

/** L6.5b : une réaction (dans les données, toute réaction, capacité ou verbe, se joue en `action: 'reaction'`) ; l'attaque d'opportunité, que le profil ne porte pas, est ajoutée à part. */
function estReaction(a: Action): boolean {
  return a.action === 'reaction';
}

/** Les sorts et capacités que ce personnage lance en combat : verbes, puis sorts mineurs, puis capacités (l'ordre du profil). */
export function sortsDeCombat(f: Fiche): SortDeCombat[] {
  return sortsDuProfil(f, lancableEnCombat);
}

/**
 * L6.5b (6a) : ses réactions, dans l'ordre du profil, et l'attaque
 * d'opportunité (src/regles/armes.ts), que tout combattant a.
 */
export function reactionsDeCombat(f: Fiche): SortDeCombat[] {
  const r = sortsDuProfil(f, estReaction);
  return f.schemaVersion === 2 ? [...r, versSort(actionParId.get(OPPORTUNITE)!, 'I', 'adepte', false, {})] : r;
}

function sortsDuProfil(f: Fiche, garder: (a: Action) => boolean): SortDeCombat[] {
  if (f.schemaVersion !== 2) return [];
  const classe = classeDeLaRefonte(f.refonte.classe);
  if (!classe) return [];
  const p = profilDe(classe, f.refonte, contexteDe(f, classe));
  const seconde = secondeEcole(classe, { ecole: f.refonte.ecole ?? undefined });
  const ecoleDe = (a: Action): Maitrise => (a.ecole === f.refonte.ecole ? (p.maitriseEcole ?? 'adepte') : a.ecole === seconde ? (p.maitriseSecondeEcole ?? 'adepte') : 'adepte');
  const entrees: { id: string; palier: Palier; grimoire?: Maitrise }[] = [
    ...p.verbes.map((v) => ({ id: v.id, palier: v.palier })),
    ...p.verbesHorsVoie.filter((v) => !p.verbes.some((x) => x.id === v.id)).map((v) => ({ id: v.id, palier: 'I' as Palier, grimoire: v.maitrise })),
    ...p.mineurs.map((m) => ({ id: m.id, palier: m.palier })),
    ...classe.actionsDeClasse.map((id) => ({ id, palier: p.paliersDActions[id] ?? ('I' as Palier) })),
    ...p.actions.map((id) => ({ id, palier: p.paliersDActions[id] ?? ('I' as Palier) })),
  ];
  const vus = new Set<string>();
  const r: SortDeCombat[] = [];
  for (const e of entrees) {
    const a = actionParId.get(e.id);
    if (!a || vus.has(e.id) || !garder(a)) continue;
    vus.add(e.id);
    r.push(versSort(a, e.palier, e.grimoire ?? ecoleDe(a), !!e.grimoire, p.elements));
  }
  return r;
}

function versSort(a: Action, palier: Palier, maitrise: Maitrise, grimoire: boolean, elements: Partial<Record<Element, Maitrise>>): SortDeCombat {
  const max = ORDRE.indexOf(palier);
  const min = a.elementMin ? MAITRISES.indexOf(a.elementMin) : 0;
  return {
    id: a.id,
    nom: a.nom,
    description: a.description,
    groupe: a.nature === 'verbe' ? 'verbe' : a.nature === 'mineur' ? 'mineur' : 'capacite',
    paliers: paliersDefinis(a).filter((x) => ORDRE.indexOf(x) <= max),
    maitrise,
    grimoire,
    typeAction: typeDAction(a),
    limite: a.limite,
    elements: a.element ? (Object.entries(elements) as [Element, Maitrise][]).filter(([, m]) => MAITRISES.indexOf(m) >= min).map(([id, m]) => ({ id, nom: nomElement(id), maitrise: m })) : [],
    elementRequis: !!a.elementMin,
    manuel: a.manuel ?? null,
  };
}

/** Le palier où le sort part : celui choisi, ou le suivant avec la surcharge (4a). */
export function palierLance(id: string, palier: Palier, surcharge: boolean): Palier {
  const a = actionParId.get(id);
  return a && surcharge ? (palierSuivant(a, palier) ?? palier) : palier;
}

/** Le verbe peut-il se surcharger à ce palier ? (un palier au-dessus ; un verbe « 1×/combat », que coutSort refuse, n'en a pas dans les données.) */
export function surchargeable(id: string, palier: Palier): boolean {
  const a = actionParId.get(id);
  return !!a && a.nature === 'verbe' && palierSuivant(a, palier) !== null;
}

const NOMS_RESSOURCES: Readonly<Record<string, string>> = {
  pp: 'PP', endurance: 'Endurance', honneur: 'Honneur', instinct: 'Instinct', sacre: 'Sacré', inspiration: 'Inspiration',
  forceNature: 'Force de la nature', ki: 'Ki', pv: 'PV', ame: 'âme', plongee: 'Plongée', corruptionAme: 'Corruption d’Âme',
};

/** Le coût affiché (4a) : les PP d'un verbe au tarif de combat, élément et surcharge compris ; le coût fixe d'une capacité. */
export function coutAffiche(
  s: Pick<SortDeCombat, 'id' | 'maitrise'>,
  palier: Palier,
  surcharge: boolean,
  element: Maitrise | null,
  second: Maitrise | null = null,
): { texte: string; pp: number } | { refus: string } {
  const a = actionParId.get(s.id);
  if (!a) return { refus: 'action inconnue' };
  if (a.nature === 'verbe' || a.nature === 'mineur') {
    // L6.5a (4a) : une combinaison coûte son second élément.
    const c = coutSort(a, { palier, ecole: s.maitrise, element, surcharge, ...(second ? { secondElement: second } : {}) });
    return c.ok ? { texte: `${c.pp} PP`, pp: c.pp } : { refus: c.raison };
  }
  const termes = (a.cout ?? []).map((c) => `${c.montant} ${NOMS_RESSOURCES[c.ressource] ?? c.ressource}`);
  return { texte: termes.length ? termes.join(' + ') : 'sans coût', pp: (a.cout ?? []).filter((c) => c.ressource === 'pp').reduce((t, c) => t + c.montant, 0) };
}

// ---------------------------------------------------------------- Ciblage (6a)

export interface CiblageSort {
  type: 'soi' | 'creature' | 'point' | 'aucun';
  camp: 'ennemi' | 'allie' | 'toute';
  /** En cases. */
  portee: number;
  nbCibles: number;
  ligneDeVue: boolean;
  zone: (ZoneSort & { filtre: 'tous' | 'ennemis' | 'allies'; degressif: boolean }) | null;
  /** Il faut cliquer une case de la carte : un point (les lignes et les cônes des données visent tous un point, leur direction). */
  clicCase: boolean;
}

/** Ce que le sort vise au palier lancé. */
export function ciblageDe(id: string, palier: Palier, porteeArme = 1, boost?: string, variante?: string): CiblageSort | null {
  const brute = actionParId.get(id);
  if (!brute) return null;
  // L6.5a : une variante peut changer le ciblage (Transfusion prise à un ennemi).
  const a = palier === 'I' && !variante ? brute : actionAuPalier(brute, palier, variante);
  const zone = a.zone ? { forme: a.zone.forme, taille: a.zone.taille, origine: a.zone.origine, filtre: a.zone.filtre, degressif: a.zone.degressif } : null;
  return {
    type: a.ciblage.type,
    camp: a.ciblage.camp,
    portee: porteeEnCases(a.ciblage.portee, porteeArme),
    // L6.5a : le boost « +1 cible » (Inspiration) ou « un second allié » (Sacré) vise une créature de plus.
    nbCibles: a.ciblage.nbCibles + (boost === 'plusUneCible' || boost === 'secondAllie' ? 1 : 0),
    ligneDeVue: a.ciblage.ligneDeVue,
    zone,
    clicCase: a.ciblage.type === 'point',
  };
}

/** Le jeton peut-il être pris pour cible par ce sort (camp, vivant) ? */
export function campPermis(c: Pick<Combattant, 'genre'>, camp: CiblageSort['camp']): boolean {
  return camp === 'toute' || (camp === 'ennemi' ? c.genre === 'monstre' : c.genre !== 'monstre');
}

export interface Visee {
  /** Jetons visés, un par projectile (une même créature peut revenir). */
  cibles: string[];
  /** Case visée : un point, la direction d'une ligne ou d'un cône. */
  point: Case | null;
}

export interface ApercuVisee {
  cases: CaseTouchee[];
  /** Jetons pris : cibles et zone. */
  touches: string[];
  refus: string | null;
}

/**
 * Ce que la visée touche (6a, 7a) : les cases de la zone et les jetons
 * dedans, ou les jetons visés ; un refus de portée ou de vue (sauf portées
 * libres).
 */
export function apercu(scene: SceneCalcul, jetons: readonly JetonCarte[], idLanceur: string, c: CiblageSort, v: Visee, porteesLibres: boolean, zones: readonly ZoneActive[] = []): ApercuVisee {
  const lanceur = jetons.find((j) => j.id === idLanceur);
  if (!lanceur) return { cases: [], touches: [], refus: 'ton jeton n’est pas sur la carte' };
  const viseCase = v.point ?? (v.cibles[0] ? (jetons.find((j) => j.id === v.cibles[0]) ?? null) : null);
  let refus: string | null = null;
  if (!porteesLibres) {
    const verifier = (cible: Case) => refusDePortee(scene, lanceur, cible, c.portee, c.ligneDeVue);
    if (c.type === 'creature') for (const id of v.cibles) refus ??= verifier(jetons.find((j) => j.id === id) ?? lanceur);
    else if (c.type === 'point' && v.point) refus = verifier(v.point);
  }
  // L6.4b1 (11a) : une créature dans un sanctuaire où le lanceur n'est pas ne se vise pas.
  if (c.type === 'creature' && v.cibles.some((id) => protegeParSanctuaire(zones, jetons, idLanceur, id))) refus = 'la cible est dans un sanctuaire';
  const cases = c.zone && (viseCase || c.zone.origine === 'lanceur') ? casesDeZone(scene, c.zone, lanceur, viseCase ?? lanceur) : [];
  const dansZone = jetonsDansZone(jetons, cases, idLanceur).map((x) => x.id);
  return { cases, touches: [...new Set([...v.cibles, ...dansZone])], refus };
}

/** La visée est-elle complète ? (les cibles, la case) */
export function viseeComplete(c: CiblageSort, v: Visee): boolean {
  if (c.type === 'creature' && v.cibles.length < 1) return false;
  if (c.clicCase && !v.point) return false;
  return true;
}

// ---------------------------------------------------------------- Lancer (2a)

const ZERO: SauvegardesCombat = { FOR: 0, DEX: 0, CON: 0, Volonte: 0 };
const SUR_SAUVEGARDE: Readonly<Record<Sauvegarde, string>> = { FOR: 'sauvegardeFOR', DEX: 'sauvegardeDEX', CON: 'sauvegardeCON', Volonte: 'sauvegardeVolonte' };

/** Les bonus temporaires sur les sauvegardes (12a). */
function avecBonus(s: SauvegardesCombat, c: Pick<Combattant, 'bonus'>): Record<Sauvegarde, number> {
  const k = (x: Sauvegarde) => s[x] + bonusFixe(c.bonus, ['sauvegardes', SUR_SAUVEGARDE[x], 'tests']);
  return { FOR: k('FOR'), DEX: k('DEX'), CON: k('CON'), Volonte: k('Volonte') };
}

/** Les sauvegardes d'un PJ (9a) : Réflexes → DEX, Vigueur → CON et FOR, Volonté. */
export function sauvegardesDuPj(f: Fiche): SauvegardesCombat {
  const s = vueFiche(f).stats.sauvegardes;
  const vigueur = s.Vigueur ?? 0;
  return { FOR: vigueur, DEX: s.Reflexes ?? 0, CON: vigueur, Volonte: s.Volonte ?? 0 };
}

const modsDe = (f: Fiche) => Object.fromEntries(vueFiche(f).caracs.map((c) => [c.code, c.mod]));

/** Une créature du combat telle que le moteur la lit ; la distance au lanceur, l'anneau de zone. */
export function cibleDe(c: Combattant & { id: string }, fiche: Fiche | null, distance: number, anneau?: number): CibleEnJeu {
  const etats = c.etats.map((e) => e.id);
  const commun = { id: c.id, etats, distance, ...(anneau !== undefined ? { anneau } : {}) };
  // L6.4b2 (10a) : une invocation se lit comme un monstre (ses chiffres), dans le camp des PJ.
  if (c.genre !== 'pj')
    return {
      ...commun,
      camp: campDe(c),
      def: (c.def ?? 10) + bonusFixe(c.bonus, ['DEF']),
      sauvegardes: avecBonus(c.sauvegardes ?? ZERO, c),
      boss: c.boss,
      demonOuMortVivant: c.demonOuMortVivant,
      pv: c.pv ?? 0,
      // L6.6a (7a) : les résistances légendaires qui lui restent.
      ...(legendairesRestantes(c) ? { legendaire: legendairesRestantes(c) } : {}),
    };
  if (!fiche) throw new Error(`La fiche de ${c.nom} manque.`);
  const vue = vueFiche(fiche);
  return { ...commun, camp: 'pj', mods: modsDe(fiche), def: vue.stats.ca + bonusFixe(c.bonus, ['DEF']), sauvegardes: avecBonus(sauvegardesDuPj(fiche), c), pv: vue.pv.actuel };
}

/** Le lanceur tel que le moteur le lit : sa fiche, ses états et ses bonus du combat. */
export function lanceurDe(f: FicheV2, moi: Combattant & { id: string }): LanceurEnJeu {
  const vue = vueFiche(f);
  const classe = classeDeLaRefonte(f.refonte.classe);
  const modMagie = classe ? contexteDe(f, classe).modMagie : 0;
  const j = (cle: string) => vue.refonte?.jauges.find((x) => x.cle === cle)?.actuel;
  const plongee = j('plongee');
  const corruptionAme = j('corruptionAme');
  return {
    id: moi.id,
    camp: 'pj',
    mods: modsDe(f),
    def: vue.stats.ca + bonusFixe(moi.bonus, ['DEF']),
    sauvegardes: avecBonus(sauvegardesDuPj(f), moi),
    etats: moi.etats.map((e) => e.id),
    modMagie,
    attaqueMagique: (vue.stats.attaque.magique ?? 0) + bonusFixe(moi.bonus, ['attaqueMagique', 'attaque', 'tests']),
    niveau: f.niveau,
    pv: vue.pv.actuel,
    pvMax: vue.pv.max,
    ...(plongee !== undefined ? { plongee } : {}),
    ...(corruptionAme !== undefined ? { corruptionAme } : {}),
  };
}

/** L'arme maniée pour une capacité qui frappe avec (famille demandée, sinon l'arme de contact). */
export function armeEnJeu(f: Fiche, a: Pick<Action, 'armes'>): ArmeEnJeu | undefined {
  const familles = famillesManiees(f);
  const choix = [...familles].find(([fam]) => !a.armes || a.armes.includes(fam)) ?? null;
  if (!choix) return undefined;
  const [famille, arme] = choix;
  const m = /^(\d+d\d+)([+-]\d+)?$/.exec(arme.formule.replace(/\s/g, ''));
  return { id: arme.nom, famille, des: m?.[1] ?? '1d4', attaque: arme.bonus, degats: m?.[2] ? Number(m[2]) : 0 };
}

export const CATALOGUE: Catalogue = { etats: etatParId, elements: elementParId, combinaisons };

export interface ChoixDuLancer {
  sort: string;
  palier: Palier;
  surcharge: boolean;
  element: Element | null;
  visee: Visee;
  /** L6.5a (2b) : les choix du panneau « Options ». */
  options?: OptionsDuLancer;
  /** L6.5b : une réaction, jouée hors de son tour (reactionsDeCombat). */
  reaction?: true;
}

/**
 * Le lancer pour le moteur (2a) : le lanceur, ses cibles et la zone,
 * d'après la carte ; un refus en une phrase si la visée ne tient pas.
 */
export function preparerLancer(
  f: FicheV2,
  moi: Combattant & { id: string },
  combat: Pick<Combat, 'round' | 'tour' | 'porteesLibres'>,
  choix: ChoixDuLancer,
  carte: { scene: SceneCalcul; jetons: readonly JetonCarte[]; zones?: readonly ZoneActive[] } | null,
  combattants: readonly (Combattant & { id: string })[],
  fiches: ReadonlyMap<string, Fiche>,
  alea: () => number,
): Lancer | string {
  const s = (choix.reaction ? reactionsDeCombat : sortsDeCombat)(f).find((x) => x.id === choix.sort);
  const action = actionParId.get(choix.sort);
  if (!s || !action) return 'Tu ne connais pas ce sort.';
  if (!s.paliers.includes(choix.palier)) return `Palier ${choix.palier} pas encore atteint.`;
  const elt = choix.element ? s.elements.find((e) => e.id === choix.element) : null;
  if (choix.element && !elt) return 'Tu ne maîtrises pas cet élément.';
  const o = choix.options ?? {};
  // L6.5a (4a) : le second élément d'une combinaison, parmi les siens.
  const elt2 = o.secondElement ? s.elements.find((e) => e.id === o.secondElement) : null;
  if (o.secondElement && (!elt2 || !elt)) return 'Une combinaison prend un premier élément, puis un second que tu maîtrises.';
  const arme = action.resolution.jet === 'attaque' && !action.attaquePar ? armeEnJeu(f, action) : undefined;
  const porteeArme = arme ? (attaquesDuPj(f).find((x) => x.nom === arme.id)?.portee?.max ?? 1) : 1;
  const c = ciblageDe(s.id, palierLance(s.id, choix.palier, choix.surcharge), porteeArme, o.boost, o.variante);
  if (!c) return 'Sort inconnu.';
  if (!viseeComplete(c, choix.visee)) return c.type === 'creature' ? 'Choisis ta cible sur la carte.' : 'Choisis une case sur la carte.';
  const parId = new Map(combattants.map((x) => [x.id, x]));
  for (const id of choix.visee.cibles) {
    const x = parId.get(id);
    if (!x) return 'Cette cible n’est pas dans le combat.';
    if (!campPermis(x, c.camp)) return `${x.nom} : ${c.camp === 'ennemi' ? 'un ennemi' : 'un allié'} seulement.`;
  }
  const lanceurCase = carte?.jetons.find((j) => j.id === moi.id) ?? null;
  const distance = (id: string): number => {
    const j = carte?.jetons.find((x) => x.id === id);
    return lanceurCase && j ? distanceCases(lanceurCase, j) : 0;
  };
  let zone: CibleEnJeu[] | undefined;
  if (carte) {
    const a = apercu(carte.scene, carte.jetons, moi.id, c, choix.visee, combat.porteesLibres, carte.zones ?? []);
    if (a.refus) return `Hors d’atteinte : ${a.refus}.`;
    if (c.zone) {
      const pris = jetonsDansZone(carte.jetons, a.cases, moi.id);
      zone = pris.flatMap((p) => {
        const x = parId.get(p.id);
        if (!x || x.aTerre || x.mort) return [];
        return [cibleDe(x, x.perso ? (fiches.get(x.perso) ?? null) : null, distance(p.id), p.anneau)];
      });
    }
  } else if (c.zone) return 'La carte du combat n’est pas chargée.';
  const ficheDe = (x: Combattant) => (x.perso ? (fiches.get(x.perso) ?? null) : null);
  const lanceur = lanceurDe(f, moi);
  const cibles: CibleEnJeu[] =
    c.type === 'soi' ? [{ ...lanceur, distance: 0 }] : choix.visee.cibles.map((id) => cibleDe(parId.get(id)!, ficheDe(parId.get(id)!), distance(id)));
  const classe = classeDeLaRefonte(f.refonte.classe);
  const p = classe ? profilDe(classe, f.refonte, contexteDe(f, classe)) : null;
  // L6.5a : l'allié et le rebond se choisissent dans les options ; les voisins se prennent autour de la cible principale.
  const autre = (id: string | undefined, quoi: 'allie' | 'rebond'): CibleEnJeu | string | undefined => {
    if (!id) return undefined;
    const x = parId.get(id);
    if (!x || x.aTerre || x.mort) return 'Cette créature n’est pas dans le combat.';
    if (quoi === 'allie' && x.genre === 'monstre') return `${x.nom} : un allié seulement.`;
    return cibleDe(x, ficheDe(x), distance(id));
  };
  const allie = autre(o.allie, 'allie');
  if (typeof allie === 'string') return allie;
  const rebond = autre(o.rebond, 'rebond');
  if (typeof rebond === 'string') return rebond;
  const premiere = choix.visee.cibles[0] ? carte?.jetons.find((j) => j.id === choix.visee.cibles[0]) : undefined;
  const sautRebond = rebondDe([elt?.id, elt2?.id]);
  if (rebond && sautRebond === null) return 'Seul un élément qui rebondit (électricité) a un rebond.';
  if (rebond && premiere && carte) {
    const j = carte.jetons.find((x) => x.id === o.rebond);
    if (j && distanceCases(premiere, j) > sautRebond!) return `Le rebond saute ${sautRebond} cases au plus.`;
  }
  const voisins =
    elt2 && premiere && carte
      ? carte.jetons
          .filter((j) => j.id !== premiere.id && j.id !== moi.id && distanceCases(premiere, j) <= 1)
          .flatMap((j) => {
            const x = parId.get(j.id);
            return x && !x.aTerre && !x.mort ? [cibleDe(x, ficheDe(x), distance(j.id))] : [];
          })
      : [];
  return {
    action,
    palier: choix.palier,
    ...(choix.surcharge ? { surcharge: true } : {}),
    ecole: s.maitrise,
    element: elt ? { id: elt.id, maitrise: elt.maitrise } : null,
    lanceur,
    cibles,
    ...(zone ? { zone } : {}),
    ...(p ? { voie: p.voie } : {}),
    ...(p?.attaquesSpeciales ? { attaquesSpeciales: p.attaquesSpeciales } : {}),
    ...(arme ? { arme } : {}),
    immobile: moi.tourActions !== combat.tour || moi.mvt === 0,
    premierRound: combat.round === 1,
    ...(o.variante ? { variante: o.variante } : {}),
    ...(o.nombreDeDes ? { nombreDeDes: o.nombreDeDes } : {}),
    ...(o.boost ? { boost: o.boost } : {}),
    ...(elt2 ? { secondElement: { id: elt2.id, maitrise: elt2.maitrise } } : {}),
    ...(o.choixEau ? { choixEau: o.choixEau } : {}),
    ...(o.posture ? { posture: o.posture } : {}),
    ...(o.montant ? { montant: o.montant } : {}),
    ...(o.caracChoisie ? { caracChoisie: o.caracChoisie } : {}),
    ...(allie ? { allie } : {}),
    ...(rebond ? { rebond } : {}),
    ...(voisins.length ? { voisins } : {}),
    alea,
  };
}
