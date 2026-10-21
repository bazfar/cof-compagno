import { coutHorsCombat, coutSort, ddSort } from '../effets/cout.ts';
import { corruptionParLaPlongee, RUPTURE, seuilsFranchis } from '../effets/chaos.ts';
import { actionAuPalier, horsCombatAuPalier, variantesAuPalier } from '../effets/paliers.ts';
import { secondeEcole, type ProfilMagique } from '../effets/profil.ts';
import { deMineur } from '../effets/resolution.ts';
import { lancerFormule } from '../regles/des.ts';
import type { ClasseRefonte } from '../schemas/classes.ts';
import type { Action, Element, Maitrise, Palier } from '../schemas/effets.ts';
import { JAUGES_DE_CLASSE, type FicheV2, type JaugeDeClasse, type RefonteFiche } from '../schemas/fiche.ts';
import { actionParId, combinaisons } from '../../regles/index.ts';
import { classeDeLaRefonte, contexteDe, jaugesPleines, NOMS_MAITRISES, nomEcole, nomElement, profilDe, voieDeLaRefonte, type ContexteRefonte } from './refonte.ts';

/*
 * Les actions, la magie et les jauges d'un personnage de la refonte, telles
 * que la fiche les montre (lot L4.12). Fonctions pures : l'écran (onglet
 * Actions de FicheVivante) ne fait que dessiner ce résultat.
 *
 * Décisions de Thomas du 21/10/2026 (verrouillées) :
 *   - 1b : un onglet Actions à part, pour les fiches de la refonte ;
 *   - 2a : rangées par type de geste (attaques d'arme, verbes par école,
 *     sorts mineurs, techniques, réactions, passifs), avec un tri par voie
 *     au choix (`trierActions`) ;
 *   - 3a : nom, palier, coût, type d'action, limite, description,
 *     variantes ; badge pour une action laissée au MJ ;
 *   - 4a : bascule combat / hors combat (les actions qui ont un usage hors
 *     combat, avec cet usage) ;
 *   - 5a : verbes accordés par grimoire dans leur école, badge et maîtrise ;
 *   - 6a : bloc Magie (école, éléments, sorts mineurs, combinaisons) ;
 *   - 7a, 8b, 9a, 10a : jauges dans l'en-tête, le joueur les gère toutes ;
 *     la Plongée qui dépasse un multiple de 6 ajoute 1 à la Corruption
 *     d'Âme ; un palier de mutation franchi est annoncé, le tirage reste
 *     manuel ;
 *   - 12a, 13a : passifs permanents et sans condition comptés dans la DEF
 *     et l'initiative (Vêtements sacrés seulement sans armure) ; ceux à
 *     condition listés avec elle ;
 *   - 15b : un clic lance l'attaque (magique ou d'arme) et les dégâts au
 *     journal ; une sauvegarde affiche le DD.
 */

export type GroupeAction = 'arme' | 'verbe' | 'mineur' | 'technique' | 'reaction' | 'passif';

export const GROUPES: readonly { id: GroupeAction; nom: string }[] = [
  { id: 'arme', nom: 'Attaques d’arme' },
  { id: 'verbe', nom: 'Verbes' },
  { id: 'mineur', nom: 'Sorts mineurs' },
  { id: 'technique', nom: 'Techniques et capacités' },
  { id: 'reaction', nom: 'Réactions' },
  { id: 'passif', nom: 'Passifs' },
];

export interface JetAction {
  libelle: string;
  formule: string;
}

export interface ActionAffichee {
  id: string;
  nom: string;
  description: string;
  groupe: GroupeAction;
  /** Voie et rang qui l'apportent ; null : action de classe, commune ou accordée. */
  voie: string | null;
  nomVoie: string | null;
  rang: number | null;
  /** École (nom) d'un verbe ou d'un sort mineur. */
  ecole: string | null;
  palier: Palier | null;
  cout: string | null;
  /** Coût hors combat d'un verbe : moitié, arrondie au supérieur, au moins 1 PP (validé). */
  coutHorsCombat: string | null;
  typeAction: string;
  limite: string | null;
  variantes: string[];
  /** Raison d'une action laissée au MJ. */
  manuel: string | null;
  /** Verbe appris par grimoire (5a) : sa maîtrise. */
  grimoire: string | null;
  /** Usage hors combat au palier atteint (4a). */
  horsCombat: string | null;
  /** Passif : sa condition, ou « toujours actif » (13a). */
  condition: string | null;
  /** Sauvegarde : « DD 14, sauvegarde de DEX » (15b). */
  dd: string | null;
  attaque: JetAction | null;
  degats: JetAction | null;
}

/** Ce que la fiche sait du personnage pour les jets (lib/regles/calculs.ts). */
export interface ModsDuPerso {
  attaqueContact: number;
  attaqueDistance: number;
  attaqueMagique: number;
  mod: (carac: string) => number;
  /** Une armure est portée (Vêtements sacrés). */
  armure: boolean;
}

const TYPES: Record<Action['action'], string> = { action: 'Action', mineure: 'Action mineure', reaction: 'Réaction', gratuite: 'Gratuite', aucune: 'Passif' };
const LIMITES: Record<Action['limite'], string | null> = { volonte: null, '1x/round': '1×/round', '1x/combat': '1×/combat', '1x/scene': '1×/scène', '1x/scenario': '1×/scénario' };
const RESSOURCES: Record<string, string> = {
  pp: 'PP', endurance: 'Endurance', honneur: 'Honneur', instinct: 'Instinct', sacre: 'Sacré', inspiration: 'Inspiration',
  forceNature: 'Force de la nature', ki: 'Ki', pv: 'PV', ame: 'âme', plongee: 'Plongée', corruptionAme: 'Corruption d’Âme',
};
const CONDITIONS: Record<string, string> = {
  immobile: 's’il n’a pas bougé ce tour',
  protegeUnAllie: 'quand il protège un allié',
  armeLegere: 'avec une arme légère',
  premierRound: 'au premier round',
  cibleAffaiblie: 'contre une cible affaiblie',
};
const DECLENCHEURS: Record<NonNullable<Action['declencheur']>, string> = {
  attaqueVisee: 'quand une attaque le vise',
  allieCible: 'quand un allié est ciblé',
  allieAttaqueAuContact: 'quand un allié est attaqué au contact',
  attaqueSubie: 'quand il subit une attaque',
  attaqueRatee: 'quand une attaque le rate',
  ennemiQuitteContact: 'quand un ennemi quitte son contact',
  sortCible: 'quand un sort le cible',
  effetSonOuCharme: 'contre un effet de son ou de charme',
  controleMental: 'contre un contrôle mental',
  allieTombe: 'quand un allié tombe',
  jetAllie: 'sur le jet d’un allié',
  aToutMoment: 'à tout moment',
  etatSubi: 'quand il subit un état',
  ennemiAbattu: 'quand il abat un ennemi',
};
const DISTANCE = new Set(['arc', 'arbalete']);
/** Passifs qui ne valent que sans armure (Vêtements sacrés : narratif « Seulement sans armure »). */
const SANS_ARMURE = new Set(['pretre.vetements-sacres']);

const signe = (n: number) => (n > 0 ? `+${n}` : n < 0 ? String(n) : '');
/** Une formule que le journal sait lancer (« XdY », « XdY+Z »), sinon null. */
const lancable = (formule: string): string | null => (lancerFormule(formule, () => 0) ? formule : null);

/** Voie et rang qui apportent chaque action (verbes compris), d'après les rangs pris. */
function sources(classe: ClasseRefonte, r: RefonteFiche, actions: ReadonlyMap<string, Action>): Map<string, { voie: string; rang: number }> {
  const m = new Map<string, { voie: string; rang: number }>();
  for (const voie of classe.voies) {
    for (const rv of (voieDeLaRefonte(voie)?.rangs ?? []).slice(0, r.rangs[voie] ?? 0)) {
      for (const id of rv.actions) if (!m.has(id)) m.set(id, { voie, rang: rv.rang });
      for (const regle of rv.regles) {
        if (regle.type !== 'verbeDeLEcole') continue;
        const ecole = regle.ecole ?? (regle.quelle === 'seconde' ? secondeEcole(classe, { ecole: r.ecole ?? undefined }) : r.ecole);
        const verbe = [...actions.values()].find((a) => a.nature === 'verbe' && a.ecole === ecole && a.rang === rv.rang);
        if (verbe && !m.has(verbe.id)) m.set(verbe.id, { voie, rang: rv.rang });
      }
    }
  }
  return m;
}

function groupeDe(a: Action, attaque: boolean): GroupeAction {
  if (attaque) return 'arme';
  if (a.nature === 'verbe') return 'verbe';
  if (a.nature === 'mineur') return 'mineur';
  if (a.nature === 'passif') return 'passif';
  if (a.nature === 'reaction' || a.action === 'reaction') return 'reaction';
  return 'technique';
}

/** Coût affiché : PP d'un sort (formule du cadre), coût fixe, ou coût des attaques spéciales de la classe. */
function coutDe(a: Action, palier: Palier, maitriseEcole: Maitrise, profil: ProfilMagique): string | null {
  if (a.nature === 'mineur') return '0 PP';
  if (a.nature === 'verbe') {
    const c = coutSort(a, { palier, ecole: maitriseEcole });
    return c.ok ? `${c.pp} PP` : null;
  }
  if (a.famille && profil.attaquesSpeciales) {
    const c = profil.attaquesSpeciales.cout;
    return c === 'unParCombat' ? '1×/combat, sans coût' : `${c.montant} ${RESSOURCES[c.ressource] ?? c.ressource}`;
  }
  if (a.cout?.length) return a.cout.map((c) => `${c.montant} ${RESSOURCES[c.ressource] ?? c.ressource}`).join(' + ');
  return null;
}

function coutVerbeHorsCombat(a: Action, palier: Palier, maitrise: Maitrise): string | null {
  const c = coutSort(a, { palier, ecole: maitrise });
  return c.ok ? `${coutHorsCombat(c.pp)} PP` : null;
}

/** Jets du clic (15b) : l'attaque, puis les dégâts du premier effet de dégâts à dés fixes. */
function jetsDe(a: Action, nom: string, ctx: ContexteRefonte, mods: ModsDuPerso, crans: number): Pick<ActionAffichee, 'attaque' | 'degats'> {
  const j = a.resolution.jet;
  let attaque: JetAction | null = null;
  if (j === 'attaqueMagique') attaque = { libelle: `${nom} : attaque magique`, formule: `1d20${signe(mods.attaqueMagique)}` };
  else if (j === 'attaque') {
    const bonus = a.attaquePar ? mods.mod(a.attaquePar) : a.famille && DISTANCE.has(a.famille) ? mods.attaqueDistance : mods.attaqueContact;
    attaque = { libelle: `${nom} : attaque`, formule: `1d20${signe(bonus)}` };
  }
  const d = a.effets.find((e) => e.type === 'degats');
  let degats: JetAction | null = null;
  if (d && d.type === 'degats' && d.des !== 'arme') {
    const des = d.progression === 'mineur' ? deMineur(ctx.niveau, crans) : d.des;
    const bonus = d.mod ? mods.mod(d.mod) : d.plusMod ? ctx.modMagie : 0;
    const formule = lancable(`${des}${signe(bonus)}`);
    if (formule) degats = { libelle: `${nom} : dégâts`, formule };
  }
  return { attaque, degats };
}

function conditionDe(a: Action): string | null {
  if (a.nature !== 'passif') return null;
  if (a.declencheur) return DECLENCHEURS[a.declencheur];
  const conds = a.effets.flatMap((e) => ('condition' in e && e.condition ? [CONDITIONS[e.condition] ?? e.condition] : []));
  if (a.effets.some((e) => e.type === 'bonus' && 'parAllieAuContact' in e && e.parAllieAuContact)) conds.push('par allié au contact');
  if (SANS_ARMURE.has(a.id)) conds.push('sans armure');
  return conds.length ? conds.join(' ; ') : 'toujours actif';
}

/** Toutes les actions du personnage, rangées par groupe (2a), dans l'ordre des voies au sein d'un groupe. */
export function actionsDeLaFiche(f: FicheV2, mods: ModsDuPerso, actions: ReadonlyMap<string, Action> = actionParId): ActionAffichee[] {
  const classe = classeDeLaRefonte(f.refonte.classe);
  if (!classe) return [];
  const ctx = contexteDe(f, classe);
  const p = profilDe(classe, f.refonte, ctx);
  const src = sources(classe, f.refonte, actions);
  const crans = p.voie.virtuose?.crans ?? 0;
  const ecoleDe = (a: Action): Maitrise => (a.ecole === f.refonte.ecole ? (p.maitriseEcole ?? 'adepte') : a.ecole === secondeEcole(classe, { ecole: f.refonte.ecole ?? undefined }) ? (p.maitriseSecondeEcole ?? 'adepte') : 'adepte');

  const entrees: { id: string; palier: Palier | null; attaque?: boolean; grimoire?: 'nonMaitrise' | 'initie' }[] = [
    ...p.attaques.map((id) => ({ id, palier: null, attaque: true })),
    ...p.verbes.map((v) => ({ id: v.id, palier: v.palier })),
    ...p.verbesHorsVoie.filter((v) => !p.verbes.some((x) => x.id === v.id)).map((v) => ({ id: v.id, palier: 'I' as Palier, grimoire: v.maitrise })),
    ...p.mineurs.map((m) => ({ id: m.id, palier: m.palier })),
    ...classe.actionsDeClasse.map((id) => ({ id, palier: p.paliersDActions[id] ?? null })),
    ...p.actions.map((id) => ({ id, palier: p.paliersDActions[id] ?? null })),
  ];
  const vues = new Set<string>();
  const lignes: ActionAffichee[] = [];
  for (const e of entrees) {
    const brute = actions.get(e.id);
    if (!brute || vues.has(e.id)) continue;
    vues.add(e.id);
    const palier = e.palier ?? 'I';
    const a = palier === 'I' ? brute : actionAuPalier(brute, palier);
    const s = src.get(e.id);
    const maitrise = e.grimoire ?? ecoleDe(brute);
    const sauvegarde = a.resolution.jet === 'sauvegarde' ? `DD ${a.resolution.ddFixe ?? ddSort(ctx.modMagie, maitrise)}, sauvegarde de ${a.resolution.sauvegarde}` : null;
    lignes.push({
      id: a.id,
      nom: a.nom,
      description: a.description,
      groupe: groupeDe(a, !!e.attaque),
      voie: s?.voie ?? null,
      nomVoie: s ? (voieDeLaRefonte(s.voie)?.nom ?? s.voie) : null,
      rang: s?.rang ?? null,
      ecole: a.ecole ? nomEcole(a.ecole) : null,
      palier: e.palier,
      cout: coutDe(brute, palier, maitrise, p),
      coutHorsCombat: brute.nature === 'verbe' && horsCombatAuPalier(brute, palier) ? coutVerbeHorsCombat(brute, palier, maitrise) : null,
      typeAction: TYPES[a.action],
      limite: LIMITES[a.limite],
      variantes: variantesAuPalier(brute, palier).map((v) => (f.refonte.variantes[a.id] === v.id ? `${v.nom} (choisie)` : v.nom)),
      manuel: a.manuel ?? null,
      grimoire: e.grimoire ? NOMS_MAITRISES[e.grimoire] : null,
      horsCombat: horsCombatAuPalier(brute, palier),
      condition: conditionDe(a),
      dd: sauvegarde,
      ...jetsDe(a, a.nom, ctx, mods, crans),
    });
  }
  return trierActions(lignes, 'type', classe);
}

/** Tri 2a : par type de geste (puis voie et rang), ou par voie (ordre des voies de la classe, puis rang ; le reste à la fin). */
export function trierActions(lignes: readonly ActionAffichee[], ordre: 'type' | 'voie', classe: ClasseRefonte): ActionAffichee[] {
  const voie = (a: ActionAffichee) => (a.voie ? classe.voies.indexOf(a.voie) : classe.voies.length);
  const groupe = (a: ActionAffichee) => GROUPES.findIndex((g) => g.id === a.groupe);
  const parVoie = (x: ActionAffichee, y: ActionAffichee) => voie(x) - voie(y) || (x.rang ?? 9) - (y.rang ?? 9);
  return [...lignes].sort((x, y) => (ordre === 'type' ? groupe(x) - groupe(y) || parVoie(x, y) : parVoie(x, y) || groupe(x) - groupe(y)));
}

// ---------------------------------------------------------------- Magie (6a)

export interface MagieAffichee {
  ecole: { nom: string; maitrise: string } | null;
  secondeEcole: { nom: string; maitrise: string } | null;
  elements: { id: Element; nom: string; maitrise: string }[];
  /** Combinaisons ouvertes dès qu'un élément est Maître (L4.10) : signatures des paires possibles. */
  combinaisons: { nom: string; elements: string; texte: string }[];
}

export function magieDeLaFiche(f: FicheV2): MagieAffichee | null {
  const classe = classeDeLaRefonte(f.refonte.classe);
  if (!classe) return null;
  const p = profilDe(classe, f.refonte, contexteDe(f, classe));
  const elements = (Object.entries(p.elements) as [Element, Maitrise][]).map(([id, m]) => ({ id, nom: nomElement(id), maitrise: NOMS_MAITRISES[m] }));
  const maitres = elements.filter((e) => p.elements[e.id] === 'maitre').map((e) => e.id);
  const connus = elements.map((e) => e.id);
  const seconde = secondeEcole(classe, { ecole: f.refonte.ecole ?? undefined });
  const ecole = f.refonte.ecole && p.maitriseEcole ? { nom: nomEcole(f.refonte.ecole), maitrise: NOMS_MAITRISES[p.maitriseEcole] } : null;
  const autre = seconde && p.maitriseSecondeEcole ? { nom: nomEcole(seconde), maitrise: NOMS_MAITRISES[p.maitriseSecondeEcole] } : null;
  // Rien à montrer (Prêtre, Barde, Guerrier sans élément) : pas de bloc Magie.
  if (!ecole && !autre && !elements.length) return null;
  return {
    ecole,
    secondeEcole: autre,
    elements,
    combinaisons: maitres.length
      ? combinaisons
          .filter((c) => c.elements.some((e) => maitres.includes(e)) && c.elements.every((e) => connus.includes(e)))
          .map((c) => ({ nom: c.nom, elements: c.elements.map(nomElement).join(' + '), texte: c.texte }))
      : [],
  };
}

// --------------------------------------------- Passifs comptés (12a, 13a)

/** DEF et initiative en plus, des passifs permanents et sans condition ; Vêtements sacrés seulement sans armure. */
export function bonusDesPassifs(f: FicheV2, mods: ModsDuPerso, actions: ReadonlyMap<string, Action> = actionParId): { DEF: number; initiative: number; detail: string[] } {
  const classe = classeDeLaRefonte(f.refonte.classe);
  const total = { DEF: 0, initiative: 0, detail: [] as string[] };
  if (!classe) return total;
  const ctx = contexteDe(f, classe);
  const p = profilDe(classe, f.refonte, ctx);
  for (const id of new Set([...classe.actionsDeClasse, ...p.actions])) {
    const a = actions.get(id);
    if (!a || a.nature !== 'passif' || a.declencheur || (SANS_ARMURE.has(id) && mods.armure)) continue;
    for (const e of a.effets) {
      if (e.type !== 'bonus' || e.duree !== 'permanente' || e.vise !== 'lanceur' || e.condition || e.parAllieAuContact) continue;
      if (e.cible !== 'DEF' && e.cible !== 'initiative') continue;
      const v = typeof e.valeur === 'number' ? e.valeur : e.valeur === 'modMagie' ? ctx.modMagie : typeof e.valeur === 'object' && 'mod' in e.valeur ? mods.mod(e.valeur.mod) : 0;
      if (!v) continue;
      total[e.cible] += v;
      total.detail.push(`${a.nom} ${signe(v)} ${e.cible === 'DEF' ? 'DEF' : 'initiative'}`);
    }
  }
  return total;
}

// ------------------------------------------------------- Jauges (7a à 10a)

export type CleJauge = JaugeDeClasse | 'sacre' | 'plongee' | 'corruptionAme';

export interface JaugeAffichee {
  cle: CleJauge;
  nom: string;
  actuel: number;
  /** Maximum ; null pour la Plongée (sans plafond, remise à 0 en fin de combat). */
  max: number | null;
}

const NOMS_JAUGES: Record<CleJauge, string> = {
  endurance: 'Endurance', honneur: 'Honneur', instinct: 'Instinct', inspiration: 'Inspiration', forceNature: 'Force de la nature', ki: 'Ki',
  sacre: 'Sacré', plongee: 'Plongée', corruptionAme: 'Corruption d’Âme',
};

/** Jauges de la fiche : la ressource de classe et le Sacré, puis Plongée et Corruption d'Âme (7a). */
export function jaugesDeLaFiche(f: FicheV2): JaugeAffichee[] {
  const classe = classeDeLaRefonte(f.refonte.classe);
  const max = classe ? jaugesPleines(classe, f.niveau, 0) : null;
  const j = f.refonte.jauges;
  const l: JaugeAffichee[] = [];
  for (const cle of [...JAUGES_DE_CLASSE, 'sacre'] as const) {
    const m = max?.[cle];
    if (m !== null && m !== undefined) l.push({ cle, nom: NOMS_JAUGES[cle], actuel: Math.min(j[cle] ?? m, m), max: m });
  }
  l.push({ cle: 'plongee', nom: NOMS_JAUGES.plongee, actuel: j.plongee, max: null });
  l.push({ cle: 'corruptionAme', nom: NOMS_JAUGES.corruptionAme, actuel: j.corruptionAme, max: RUPTURE });
  return l;
}

/**
 * Change une jauge (8b : le joueur les gère toutes), bornée à 0 et à son
 * maximum. La Plongée qui dépasse un multiple de 6 ajoute 1 à la Corruption
 * d'Âme (9a, décision 1b du lot L4.9) ; un palier de mutation ou la Rupture
 * franchis sont annoncés (10a), le tirage reste au MJ.
 */
export function changerJauge(f: FicheV2, cle: CleJauge, valeur: number): { jauges: RefonteFiche['jauges']; annonces: string[] } {
  const j = { ...f.refonte.jauges };
  const borne = jaugesDeLaFiche(f).find((x) => x.cle === cle);
  const v = Math.max(0, Math.round(valeur));
  const annonces: string[] = [];
  if (cle === 'plongee') {
    const gain = corruptionParLaPlongee(j.plongee, v);
    j.plongee = v;
    if (gain) {
      annonces.push(`La Plongée dépasse ${Math.ceil(v / 6) * 6 - 6} : +${gain} Corruption d’Âme.`);
      j.corruptionAme = Math.min(RUPTURE, j.corruptionAme + gain);
    }
  } else if (borne) {
    j[cle] = borne.max === null ? v : Math.min(v, borne.max);
  }
  const s = seuilsFranchis(f.refonte.jauges.corruptionAme, j.corruptionAme);
  for (const palier of s.mutations) annonces.push(`Palier de mutation ${palier} franchi : mutation à tirer avec le MJ.`);
  if (s.rupture) annonces.push('Rupture : la Corruption d’Âme atteint 10, voir avec le MJ.');
  return { jauges: j, annonces };
}

/** Fin du combat (9a) : la Plongée revient à 0. */
export function finDuCombat(f: FicheV2): RefonteFiche['jauges'] {
  return { ...f.refonte.jauges, plongee: 0 };
}

/** Réserve de PP et PV en plus (Pacte de sang) de la refonte (11a). */
export function reservesDeLaFiche(f: FicheV2): { pp: number; pvEnPlus: number } {
  const classe = classeDeLaRefonte(f.refonte.classe);
  if (!classe) return { pp: 0, pvEnPlus: 0 };
  const p = profilDe(classe, f.refonte, contexteDe(f, classe));
  return { pp: p.reservePP, pvEnPlus: p.pvEnPlus };
}
