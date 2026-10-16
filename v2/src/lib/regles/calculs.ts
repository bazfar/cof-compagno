import { capaciteParId, classeParId, constantes, mutations, sorts, voieParId } from './donnees';
import { evaluerFormule } from './formule';
import type {
  Carac,
  CapaciteChoisie,
  ContexteCalcul,
  EtatActif,
  FicheCalcul,
  MutationAcquise,
  ObjetPorte,
} from './fiche-calcul';

/*
 * Calculs de règles d'un personnage — PORT FIDÈLE de js/personnage.js (v1).
 *
 * Décision 3a du lot L1 (15/10/2026) : les règles sont reprises TELLES
 * QUELLES, avec les mêmes nombres, les mêmes valeurs par défaut et les mêmes
 * cas limites. Chaque méthode porte le nom de son original v1 pour que la
 * relecture se fasse côte à côte. Le moteur d'effets (lot L4, avec la refonte
 * de la magie et des classes) remplacera ces règles codées en dur ; d'ici
 * là, tests/unitaires/equivalence-v1.test.ts compare ce port au vrai code v1.
 *
 * Ne pas « corriger » une règle ici, même étrange : la corriger dans la v1
 * (source des règles jusqu'à la bascule), puis ici, test d'équivalence à
 * l'appui.
 *
 * Voies : la v1 teste une voie par son NOM, quelle que soit la classe qui
 * la porte (Personnage.estChoisie). Ici on écrit un identifiant
 * (`this.a('guerrier.elite', 2)`), étendu automatiquement à toutes les voies
 * de même nom (HOMONYMES) : même sens, sans nom de voie dans le code.
 *
 * Hors périmètre de L1.3 (repris avec le combat, lot L6) : seuils de
 * critique, bonus de dégâts conditionnels, réductions élémentaires, auras.
 */

// ---------- Constantes reprises de js/personnage.js (hors data/, donc hors import) ----------
type Tier = '12' | '13' | '14' | '15';
const TIERS: Tier[] = ['12', '13', '14', '15'];
/** Emplacements de Grimoire par rareté de l'objet porté (0 commun … 3 légendaire). */
export const GRIMOIRE_TIERS_PAR_RARETE: Record<Tier, number>[] = [
  { '12': 4, '13': 1, '14': 1, '15': 0 },
  { '12': 4, '13': 3, '14': 2, '15': 0 },
  { '12': 4, '13': 4, '14': 3, '15': 1 },
  { '12': 4, '13': 5, '14': 4, '15': 2 },
];
const GRIMOIRE_PLAFOND_TIER: Record<Tier, number> = { '12': 2, '13': 3, '14': 4, '15': 5 };
const TIERS_VIDES = (): Record<Tier, number> => ({ '12': 0, '13': 0, '14': 0, '15': 0 });

/** Liste de sorts de chaque classe lanceuse (vérifié par l'import contre SORTS_PAR_CLASSE de la v1). */
const LISTE_SORTS_DE_CLASSE: Record<string, 'arcanique' | 'pretre'> = {
  magicien: 'arcanique',
  enchanteur: 'arcanique',
  necromancien: 'arcanique',
  pretre: 'pretre',
};
function sortsDeClasse(classe: string | null | undefined) {
  const liste = classe ? LISTE_SORTS_DE_CLASSE[classe] : undefined;
  return liste ? sorts.filter((s) => s.listes.includes(liste)) : [];
}

// ---------- Voies homonymes ----------
const HOMONYMES = new Map<string, string[]>();
{
  const parNom = new Map<string, string[]>();
  for (const v of voieParId.values()) parNom.set(v.nom, [...(parNom.get(v.nom) ?? []), v.id]);
  for (const v of voieParId.values()) HOMONYMES.set(v.id, parNom.get(v.nom) ?? [v.id]);
}
/** Toutes les voies portant le même nom que `idVoie` (lui compris). Lève une erreur si l'identifiant est inconnu. */
export function voiesHomonymes(idVoie: string): string[] {
  const ids = HOMONYMES.get(idVoie);
  if (!ids) throw new Error(`Voie inconnue : ${idVoie}`);
  return ids;
}

/** `guerrier.elite.2` → { voie: 'guerrier.elite', rang: 2 } */
export function decouperCapacite(id: string): { voie: string; rang: number } {
  const i = id.lastIndexOf('.');
  return { voie: id.slice(0, i), rang: Number(id.slice(i + 1)) };
}

const modCarac = (valeur: unknown) => Math.floor((Number(valeur) - 10) / 2);
const nombre = (v: unknown): number => (typeof v === 'number' ? v : 0);

export class CalculsPersonnage {
  readonly f: FicheCalcul;
  private readonly ctx: ContexteCalcul;
  // Normalisations du constructeur Entite (js/entite.js), reprises telles quelles.
  readonly pvMax: number;
  readonly pvActuel: number;
  private readonly caracs: Partial<Record<Carac, number>>;
  private readonly equipement: Partial<Record<string, ObjetPorte | null>>;

  constructor(fiche: FicheCalcul, contexte: ContexteCalcul = {}) {
    this.f = fiche;
    this.ctx = contexte;
    this.pvMax = Math.max(1, (fiche.pvMax ?? 1) | 0);
    this.pvActuel = fiche.pvActuel == null ? this.pvMax : fiche.pvActuel | 0;
    this.caracs = fiche.caracs ?? { FOR: 10, DEX: 10, CON: 10, INT: 10, SAG: 10, CHA: 10 };
    this.equipement = fiche.equipement ?? {};
  }

  // ---------- Accès de base ----------
  get niveau() { return this.f.niveau ?? 1; }
  get classe() { return this.f.classe ?? null; }
  get race() { return this.f.race ?? null; }
  private get capacites(): CapaciteChoisie[] { return this.f.capacites ?? []; }
  private get dons(): string[] { return this.f.dons ?? []; }
  private get etats(): EtatActif[] { return this.f.etatsActifs ?? []; }
  private get mutationsAcquises(): MutationAcquise[] { return this.f.mutations ?? []; }
  private aEtatActif(idEtat: string) { return this.etats.some((e) => e.idEtat === idEtat); }

  // ---------- Voies et capacités (v1 : estChoisie, rangMaxVoie, capaciteEntree) ----------
  /** v1 estChoisie(nomVoie, rang). */
  a(idVoie: string, rang: number): boolean {
    const voies = voiesHomonymes(idVoie);
    return this.capacites.some((c) => {
      const { voie, rang: r } = decouperCapacite(c.id);
      return r === rang && voies.includes(voie);
    });
  }
  /** v1 rangMaxVoie(nomVoie). */
  rangMaxVoie(idVoie: string): number {
    const voies = voiesHomonymes(idVoie);
    const rangs = this.capacites.map((c) => decouperCapacite(c.id)).filter((c) => voies.includes(c.voie)).map((c) => c.rang);
    return rangs.length ? Math.max(...rangs) : 0;
  }
  /** v1 capaciteEntree(nomVoie, rang). */
  capaciteEntree(idVoie: string, rang: number): CapaciteChoisie | null {
    const voies = voiesHomonymes(idVoie);
    return this.capacites.find((c) => {
      const { voie, rang: r } = decouperCapacite(c.id);
      return r === rang && voies.includes(voie);
    }) ?? null;
  }
  estChoisieRace(rang: number) { return (this.f.capacitesRace ?? []).includes(rang); }
  choixCapaciteRace(rang: number) { return (this.f.capacitesRaceChoix && this.f.capacitesRaceChoix[rang]) || null; }
  /** v1 ecoleDebloquee : rang max dans une voie qui débloque l'école ≥ rang requis. */
  ecoleDebloquee(ecole: string): boolean {
    const capacitesRequises = constantes.ecoleDeblocage[ecole];
    if (!capacitesRequises) return false;
    // Les capacités listées sont toutes les voies du nom cité par la v1, au même rang :
    // le premier élément suffit (rangMaxVoie s'étend lui-même aux homonymes).
    const { voie, rang } = decouperCapacite(capacitesRequises[0] as string);
    return this.rangMaxVoie(voie) >= rang;
  }
  ecoleSortDebloquee(categorie: string | null | undefined): boolean {
    if (!categorie) return false;
    return categorie.split('_').some((e) => this.ecoleDebloquee(e));
  }

  // ---------- Équipement ----------
  /** v1 _itemsEquipesUniques : chaque objet une fois (une arme à deux mains occupe deux mains). */
  itemsEquipesUniques(): ObjetPorte[] {
    const equipement = this.equipement;
    const vus = new Set<ObjetPorte>();
    const items: ObjetPorte[] = [];
    for (const slot of Object.keys(equipement)) {
      const it = equipement[slot];
      if (!it || vus.has(it)) continue;
      const droite = equipement.main_droite;
      if (slot === 'main_gauche' && it.deuxMains && droite && droite.deuxMains && droite.id === it.id) continue;
      vus.add(it);
      items.push(it);
    }
    return items;
  }
  private somme(champ: string): number {
    return this.itemsEquipesUniques().reduce((t, it) => t + ((it[champ] as number) || 0), 0);
  }
  private armure() { return this.itemsEquipesUniques().find((it) => it.type === 'armure'); }

  static estArmeContact(it: ObjetPorte | null | undefined): boolean {
    if (!it || it.type !== 'arme') return false;
    if (!it.categoriePortee) return true;
    return it.categoriePortee === 'contact' || it.categoriePortee === 'allonge';
  }
  armeEquipee(main: 'main_droite' | 'main_gauche'): ObjetPorte | null {
    const it = this.equipement[main];
    return it && it.type === 'arme' ? it : null;
  }
  armeDistanceEquipee(): ObjetPorte | null {
    for (const main of ['main_droite', 'main_gauche'] as const) {
      const arme = this.armeEquipee(main);
      if (arme && arme.portee && !CalculsPersonnage.estArmeContact(arme)) return arme;
    }
    return null;
  }
  armeContactEquipee(): ObjetPorte | null {
    const contacts = [this.armeEquipee('main_droite'), this.armeEquipee('main_gauche')].filter((a) => CalculsPersonnage.estArmeContact(a));
    if (!contacts.length) return null;
    return contacts.find((a) => a?.categorieArme !== 'courte') ?? contacts[0] ?? null;
  }
  enCombatDeuxArmes(): boolean {
    const d = this.equipement.main_droite;
    const g = this.equipement.main_gauche;
    return !!(d && g && d !== g && CalculsPersonnage.estArmeContact(d) && CalculsPersonnage.estArmeContact(g) && !d.deuxMains && !g.deuxMains);
  }
  armeUniqueMainLibre(): boolean {
    const d = this.equipement.main_droite;
    const g = this.equipement.main_gauche;
    const armeD = !!(d && d.type === 'arme' && !d.deuxMains);
    const armeG = !!(g && g.type === 'arme' && !g.deuxMains);
    return (armeD && !g) || (armeG && !d);
  }

  /** v1 bonusFormuleEquipement : formules `@player-…` portées par les objets équipés. */
  bonusFormuleEquipement(cible: string, cle?: string | null): number {
    let t = 0;
    for (const it of this.itemsEquipesUniques()) {
      for (const f of it.formules ?? []) {
        if (!f || f.cible !== cible) continue;
        if (cle != null && (f.competence || f.carac) !== cle) continue;
        t += evaluerFormule(f.expr, this.persoPourFormule()) || 0;
      }
    }
    return Math.round(t);
  }
  private persoPourFormule() {
    return {
      piecesOr: this.f.piecesOr,
      piecesArgent: this.f.piecesArgent,
      piecesBronze: this.f.piecesBronze,
      niveau: this.f.niveau,
      pvActuel: this.pvActuel,
      pvMax: this.pvMax,
      corruptionCombat: this.f.corruptionCombat,
      caracs: this.caracs,
      mod: (code: string) => this.mod(code as Carac),
    };
  }

  // ---------- Caractéristiques ----------
  private multiplicateurAscension() { return this.aEtatActif('ascension_chaotique') ? 2 : 1; }

  mod(code: Carac): number {
    const base = modCarac(
      (this.caracs[code] as number) + this.bonusCaracCapacites(code) + this.bonusCaracDons(code)
        + this.bonusCaracEquipement(code) + this.bonusCaracMutations(code) + this.bonusTemporaire(code),
    ) - this.penaliteContratDemoniaque(code);
    const apogeeActif = this.etats.some((e) => e.idEtat === 'apogee_physique' && e.carac === code);
    return (apogeeActif ? base * 2 : base) * this.multiplicateurAscension();
  }

  bonusCaracCapacites(code: Carac): number {
    let bonus = 0;
    if (this.classe === 'guerrier') {
      const cap = this.capaciteEntree('guerrier.elite', 1);
      if (cap && cap.choix === code) bonus += 1;
    }
    if (this.race === 'humain' && this.estChoisieRace(4) && code === this.choixCapaciteRace(4)) bonus += 2;
    if (this.race === 'elfe' && code === 'DEX' && this.estChoisieRace(2)) bonus += 2;
    if (this.race === 'demi_elfe' && this.estChoisieRace(2) && code === this.choixCapaciteRace(2)) bonus += 1;
    if (this.race === 'demi_orc' && this.estChoisieRace(2) && code === this.choixCapaciteRace(2)) bonus += 1;
    if (this.race === 'demi_gobelin' && code === 'DEX' && this.estChoisieRace(2)) bonus += 1;
    if (this.classe === 'pretre' && this.a('pretre.guerison', 5) && (code === 'CON' || code === 'CHA')) bonus += 1;
    return bonus;
  }

  bonusCaracDons(code: Carac): number {
    let bonus = 0;
    const choix = this.f.donsChoix && this.f.donsChoix.amelioration_carac;
    if (Array.isArray(choix) && choix.includes(code)) bonus += 1;
    if (this.f.donsChoix && this.f.donsChoix.athlete === code) bonus += 1;
    return bonus;
  }

  bonusCaracEquipement(code: Carac): number {
    return this.itemsEquipesUniques().reduce((t, it) => t + ((it.bonusCarac && it.bonusCarac[code]) || 0), 0)
      + this.bonusFormuleEquipement('carac', code);
  }

  bonusTemporaire(cible: string): number {
    return this.etats.reduce((total, e) => {
      if (e.bonus && e.bonus.cible === cible && typeof e.bonus.valeur === 'number') return total + e.bonus.valeur;
      return total;
    }, 0);
  }

  penaliteContratDemoniaque(code: Carac): number {
    const p = this.f.contratDemoniaquePenalite;
    return p && p.carac === code && typeof p.valeur === 'number' ? p.valeur : 0;
  }

  // ---------- Mutations ----------
  private static entreeCanoniqueMutation(m: MutationAcquise) {
    const table = mutations.paliers.find((p) => p.palier === Number(m.palier));
    if (!table) return null;
    return (table.mutations.find((x) => x.d6 === m.d6) ?? null) as (Record<string, unknown> & {
      caracDelta?: Partial<Record<string, number>>;
      competenceDelta?: Record<string, number>;
    }) | null;
  }
  bonusCaracMutations(code: Carac): number {
    let bonus = this.mutationsAcquises.reduce((t, m) => {
      const e = CalculsPersonnage.entreeCanoniqueMutation(m);
      return t + ((e && e.caracDelta && e.caracDelta[code]) || 0);
    }, 0);
    if (code === 'CHA' && this.mutationsAcquises.some((m) => m.nom === 'Troisième œil (fermé)') && !this.equipement.tete) bonus -= 2;
    return bonus;
  }
  bonusCompetenceMutations(nom: string): number {
    return this.mutationsAcquises.reduce((t, m) => {
      const e = CalculsPersonnage.entreeCanoniqueMutation(m);
      return t + ((e && e.competenceDelta && e.competenceDelta[nom]) || 0);
    }, 0);
  }
  bonusDefMutations(): number {
    return this.mutationsAcquises.reduce((t, m) => t + nombre(CalculsPersonnage.entreeCanoniqueMutation(m)?.defDelta), 0);
  }
  bonusInitiativeMutations(): number {
    return this.mutationsAcquises.reduce((t, m) => t + nombre(CalculsPersonnage.entreeCanoniqueMutation(m)?.initiativeDelta), 0);
  }
  nombrePaliersMutationAtteints(): number {
    const ca = this.f.corruptionMajeure || 0;
    if (ca >= 7) return 3;
    if (ca >= 4) return 2;
    if (ca >= 1) return 1;
    return 0;
  }
  aAtteintRupture(): boolean { return (this.f.corruptionMajeure || 0) >= 10; }

  // ---------- Compétences ----------
  bonusCompetence(nom: string): number {
    let bonus = (this.f.bonusCompetences && this.f.bonusCompetences[nom]) || 0;
    bonus += this.bonusCompetenceEquipement(nom);
    bonus += this.bonusCompetenceMutations(nom);
    const competencesDoue = ['Bluff', 'Intimidation', 'Représentation', 'Persuasion'];
    if (this.dons.includes('doue') && competencesDoue.includes(nom)) bonus += 1;
    if (this.classe === 'barde' && nom === 'Acrobaties') bonus += 2 * this.rangMaxVoie('barde.spectacle');
    if (this.classe === 'pretre' && nom === 'Persuasion') bonus += 2 * this.rangMaxVoie('pretre.conversion');
    if (this.classe === 'enchanteur' && nom === 'Persuasion') bonus += 2 * this.rangMaxVoie('enchanteur.spectacle');
    if (this.classe === 'enchanteur' && (nom === 'Connaissances (histoire)' || nom === 'Connaissances (arcanes)')) {
      bonus += 2 * this.rangMaxVoie('enchanteur.historien');
    }
    if (this.classe === 'druide' && (nom === 'Survie' || nom === 'Discrétion' || nom === 'Perception')) {
      bonus += 2 * this.rangMaxVoie('druide.nature');
    }
    if (this.classe === 'chasseur' && (nom === 'Survie' || nom === 'Discrétion')) bonus += 2 * this.rangMaxVoie('chasseur.traque');
    if (this.classe === 'druide' && nom === 'Dressage') bonus += 2 * this.rangMaxVoie('druide.compagnons');
    if (this.race === 'elfe' && nom === 'Perception' && this.estChoisieRace(1)) bonus += 2;
    if (this.race === 'nain' && nom === 'Artisanat' && this.estChoisieRace(4)) bonus += 2;
    if (this.race === 'demi_elfe' && this.estChoisieRace(1)) {
      if (nom === 'Perception') bonus += 1;
      if (competencesDoue.includes(nom)) bonus += 1;
    }
    if (this.race === 'demi_orc' && nom === 'Intimidation' && this.estChoisieRace(1)) bonus += 2;
    if (this.race === 'demi_gobelin' && nom === 'Discrétion' && this.estChoisieRace(1)) bonus += 2;
    if (this.race === 'demi_gobelin' && nom === 'Artisanat' && this.estChoisieRace(3)) bonus += 2;
    if (this.classe === 'chasseur' && nom === 'Perception' && this.a('chasseur.piege', 4)) bonus += 4;
    if (this.classe === 'barde' && this.a('barde.chaos', 4) && (this.f.corruptionMajeure || 0) >= 5
        && ['Persuasion', 'Bluff', 'Intimidation'].includes(nom)) {
      bonus += 2;
    }
    return bonus;
  }
  bonusCompetenceEquipement(nom: string): number {
    return this.itemsEquipesUniques().reduce((t, it) => t + ((it.bonusCompetences && it.bonusCompetences[nom]) || 0), 0)
      + this.bonusFormuleEquipement('competence', nom);
  }
  modCompetence(nom: string, caracCode: Carac): number {
    const malusProficience = caracCode === 'DEX' && this.estArmureNonMaitrisee() ? -2 : 0;
    return this.mod(caracCode) + this.bonusCompetence(nom) + malusProficience;
  }

  // ---------- Sauvegardes ----------
  modSauvegarde(nom: string, contexte: string | null = null): number {
    const code = constantes.sauvegardes[nom] ?? null;
    if (!code) return 0;
    const malusProficience = nom === 'Reflexes' && this.estArmureNonMaitrisee() ? -2 : 0;
    const bonusResistanceMentale = nom === 'Volonte' ? this.somme('bonusResistanceMentale') : 0;
    const bonusEquipement = this.bonusSauvegardeEquipement(nom);
    const bonusRace = this.bonusSauvegardeRace(nom, contexte);
    const bonusVsEquipement = this.bonusSauvegardeVsEquipement(contexte);
    const bonusMusique = this.bonusSauvegardeMusique(nom);
    const bonusTempo = this.etats.reduce((total, e) => {
      const b = e.bonus;
      if (!b || b.vs || typeof b.valeur !== 'number') return total;
      if (b.cible !== 'sauvegardes' && b.cible !== nom) return total;
      return total + b.valeur;
    }, 0);
    const bonusTempoVs = this.bonusTemporaireVsSauvegarde(contexte, nom);
    return this.mod(code) + this.bonusTestCaracCapacites(code) + malusProficience + bonusResistanceMentale
      + bonusEquipement + bonusRace + bonusVsEquipement + bonusMusique + bonusTempo + bonusTempoVs;
  }
  bonusSauvegardeEquipement(nom: string): number {
    return this.itemsEquipesUniques().reduce((t, it) => {
      const b = it.bonusSauvegardes;
      if (!b) return t;
      return t + (b.toutes || 0) + (b[nom] || 0);
    }, 0);
  }
  bonusSauvegardeVsEquipement(contexte: string | null): number {
    if (!contexte) return 0;
    return this.itemsEquipesUniques().reduce((t, it) => t + ((it.bonusSauvegardesVs && it.bonusSauvegardesVs[contexte]) || 0), 0);
  }
  bonusTemporaireVsSauvegarde(contexte: string | null, nom: string): number {
    if (!contexte) return 0;
    return this.etats.reduce((total, e) => {
      const b = e.bonus;
      if (!b || b.vs !== contexte || typeof b.valeur !== 'number') return total;
      if (b.cible !== 'sauvegardes' && b.cible !== nom) return total;
      return total + b.valeur;
    }, 0);
  }
  bonusSauvegardeRace(_nom: string, contexte: string | null): number {
    if (!contexte) return 0;
    let b = 0;
    if (this.race === 'humain' && this.estChoisieRace(1) && (contexte === 'magie' || contexte === 'corruption')) b += 1;
    if (this.race === 'nain' && this.estChoisieRace(1) && contexte === 'poison') b += 4;
    if (this.race === 'demi_elfe' && this.estChoisieRace(2) && contexte === 'magie') b += 1;
    return b;
  }
  bonusSauvegardeMusique(nom: string): number {
    const buff = this.ctx.musique;
    if (!buff || !buff.portee.includes(this.f.id ?? '')) return 0;
    if (buff.cible !== 'toutes' && buff.cible !== nom) return 0;
    return buff.valeur;
  }
  bonusTestCaracCapacites(code: Carac): number {
    if (code === 'SAG' && this.classe === 'moine' && this.a('moine.ascetisme', 1)) return 2;
    return 0;
  }

  // ---------- Points de vie ----------
  facesDeVie(): number {
    const classe = this.classe ? classeParId.get(this.classe) : undefined;
    return classe ? classe.deVie : 6;
  }
  pvNiveau1(): number { return Math.max(1, this.facesDeVie() + this.mod('CON') + 2); }
  pvCalcule(): number {
    return (this.f.pvHistorique ?? []).reduce((t, j) => t + (j.total || 0), this.pvNiveau1())
      + this.bonusPvCapacites() + this.bonusPvDons() + this.bonusPvEquipement();
  }
  bonusPvCapacites(): number {
    let bonus = 0;
    if (this.classe === 'guerrier' && this.a('guerrier.elite', 2)) bonus += this.niveau || 1;
    if (this.race === 'nain' && this.estChoisieRace(1)) bonus += 2 * (this.niveau || 1);
    if (this.race === 'demi_orc' && this.estChoisieRace(2)) bonus += 2 * (this.niveau || 1);
    return bonus;
  }
  bonusPvDons(): number { return this.dons.includes('robuste') ? 2 * (this.niveau || 1) : 0; }
  bonusPvEquipement(): number { return this.somme('bonusPvMax'); }

  // ---------- Points de Pouvoir ----------
  calculerPPMax(): number | null {
    const carac = this.classe ? constantes.caracMagie[this.classe] : undefined;
    if (!carac) return null;
    const arch = (this.classe && constantes.archetypeClasse[this.classe]) || 'lanceur';
    const multMod = (arch !== 'martial' && constantes.multiplicateurModPP[arch]) || 2;
    return 4 + (this.niveau || 1) * 2 + this.mod(carac) * multMod + this.bonusPPCapacites();
  }
  bonusPPCapacites(): number {
    if (this.classe !== 'magicien') return 0;
    return Math.min(this.rangMaxVoie('magicien.magie-universitaire'), 2) * 4;
  }

  // ---------- Points de Cercle (Prêtre) ----------
  private pointsCercleMax(idVoie: string): number {
    if (this.classe !== 'pretre') return 0;
    if (this.a(idVoie, 5)) return 3;
    if (this.a(idVoie, 4)) return 2;
    return 0;
  }
  pointsBenedictionMax() { return this.pointsCercleMax('pretre.guerison'); }
  pointsConvictionMax() { return this.pointsCercleMax('pretre.conversion'); }
  pointsBannissementMax() { return this.pointsCercleMax('pretre.exorcisme'); }
  pointsJugementMax() { return this.pointsCercleMax('pretre.inquisition'); }
  soinsMineurs(): string | null {
    if (this.classe !== 'pretre') return null;
    const n = this.niveau || 1;
    if (n >= 10) return '1d10';
    if (n >= 7) return '1d8';
    if (n >= 4) return '1d6';
    return '1d4';
  }

  // ---------- Grimoire ----------
  private objetGrimoirePorte(): ObjetPorte | undefined {
    const candidats = this.itemsEquipesUniques().concat(this.f.inventaireListe ?? [])
      .filter((it) => it && Array.isArray(it.grimoireClasses) && it.grimoireClasses.includes(this.classe ?? ''));
    if (!candidats.length) return undefined;
    return candidats.reduce((meilleur, it) => ((it.bonusRarete || 0) > (meilleur.bonusRarete || 0) ? it : meilleur));
  }
  slotsGrimoireParTier(): Record<Tier, number> {
    const objet = this.objetGrimoirePorte();
    if (!objet) return TIERS_VIDES();
    return GRIMOIRE_TIERS_PAR_RARETE[objet.bonusRarete || 0] as Record<Tier, number>;
  }
  slotsGrimoire(): number {
    const t = this.slotsGrimoireParTier();
    return t['12'] + t['13'] + t['14'] + t['15'];
  }
  plafondInscriptionGrimoire(): number {
    return constantes.grimoireInscritsBase + Math.max(0, (this.niveau || 1) - constantes.grimoireNiveauPivot);
  }
  sortsGrimoireAccordes(): string[] {
    const ids = constantes.sortsAccordes
      .filter((e) => {
        const { voie, rang } = decouperCapacite(e.capacite);
        return voie.split('.')[0] === this.classe && this.rangMaxVoie(voie) >= rang;
      })
      .map((e) => e.sort);
    const spe = this.f.cercleSpecialisation;
    const sortCercle = spe ? constantes.cercleSortGratuit[spe] : undefined;
    if (sortCercle && !ids.includes(sortCercle)) ids.push(sortCercle);
    return ids;
  }
  private appris(): string[] {
    const accordes = this.sortsGrimoireAccordes();
    return (this.f.grimoireSortsConnus ?? []).filter((id) => !accordes.includes(id));
  }
  idsGrimoireInscrits(): string[] {
    return this.sortsGrimoireAccordes().concat(this.appris()).slice(0, this.plafondInscriptionGrimoire());
  }
  idsGrimoireHorsPlafond(): string[] {
    return this.sortsGrimoireAccordes().concat(this.appris()).slice(this.plafondInscriptionGrimoire());
  }
  placeInscriptionLibre(): boolean {
    return this.sortsGrimoireAccordes().length + this.appris().length < this.plafondInscriptionGrimoire();
  }
  private idsGrimoirePourOccupation(): string[] {
    const inscrits = this.idsGrimoireInscrits();
    const choisis = (this.f.grimoireSortsPrepares ?? []).filter((id) => inscrits.includes(id));
    return choisis.length ? choisis : inscrits;
  }
  static tierLibrePourRang(capacites: Record<Tier, number>, occupation: Record<Tier, number>, rang: number): Tier | null {
    for (const tier of TIERS) {
      if (GRIMOIRE_PLAFOND_TIER[tier] < rang) continue;
      if ((occupation[tier] || 0) < (capacites[tier] || 0)) return tier;
    }
    return null;
  }
  grimoireOccupationParTier(): Record<Tier, number> {
    const capacites = this.slotsGrimoireParTier();
    const catalogue = sortsDeClasse(this.classe);
    const occ = TIERS_VIDES();
    for (const sortId of this.idsGrimoirePourOccupation()) {
      const sort = catalogue.find((s) => s.id === sortId);
      if (!sort) continue;
      const tier = CalculsPersonnage.tierLibrePourRang(capacites, occ, sort.rang);
      if (tier) occ[tier]++;
    }
    return occ;
  }
  grimoireSlotsOccupes(): number {
    const occ = this.grimoireOccupationParTier();
    return occ['12'] + occ['13'] + occ['14'] + occ['15'];
  }
  sortGrimoireADesEmplacements(sortId: string): boolean {
    const capacites = this.slotsGrimoireParTier();
    const catalogue = sortsDeClasse(this.classe);
    const occ = TIERS_VIDES();
    let dispo = false;
    this.idsGrimoirePourOccupation().some((id) => {
      const sort = catalogue.find((s) => s.id === id);
      if (!sort) return false;
      const tier = CalculsPersonnage.tierLibrePourRang(capacites, occ, sort.rang);
      if (tier) occ[tier]++;
      if (id === sortId) {
        dispo = !!tier;
        return true;
      }
      return false;
    });
    return dispo;
  }

  // ---------- Défense ----------
  estArmureNonMaitrisee(): boolean {
    const armure = this.equipement.torse ?? null;
    if (!armure || armure.type !== 'armure' || !armure.categorie) return false;
    const categorieRequise = (this.classe && constantes.maitriseArmure[this.classe]) || 'legere';
    const rangs = constantes.rangCategorieArmure;
    const auDessus = (rangs[armure.categorie] as number) > (rangs[categorieRequise] as number);
    if (!auDessus) return false;
    const donRequis = armure.categorie === 'lourde' ? 'maitre_armures_lourdes' : 'maitre_armures_moyennes';
    return !this.dons.includes(donRequis);
  }
  estArmeNonMaitrisee(arme: ObjetPorte | null): boolean {
    if (!arme || arme.type !== 'arme' || !arme.maitrise) return false;
    const requise = (this.classe && constantes.maitriseArme[this.classe]) || 'simple';
    const rangs = constantes.rangMaitriseArme;
    if ((rangs[arme.maitrise] as number) <= (rangs[requise] as number)) return false;
    return !this.dons.includes('maitre_armes_martiales');
  }
  dexEffectifCA(): number {
    if (this.estArmureNonMaitrisee()) return 0;
    const armure = this.armure();
    const malusDEX = armure ? armure.malusDEX || 0 : 0;
    return this.mod('DEX') - malusDEX;
  }
  calculerCA(): number {
    const dex = this.dexEffectifCA();
    const armure = this.armure();
    const valeurCA = armure ? armure.valeurCA || 10 : 10;
    return valeurCA + dex + this.bonusDefEquipement() + this.bonusDefCapacites() + this.bonusDefMutations()
      + this.bonusTemporaire('DEF') + this.bonusDefImmobile() + this.bonusDefDuel() + this.bonusDefBouclierExpert()
      + this.bonusDefPhalange() + this.bonusDefSansArmureEquipement() + this.bonusDefArmureGroupeEquipement();
  }
  bonusDefEquipement(): number { return this.somme('bonusDEF') + this.bonusFormuleEquipement('DEF'); }
  bonusDefCapacites(): number {
    let bonus = 0;
    if (this.classe === 'druide' && this.a('druide.nature', 2)) bonus += 2;
    if (this.classe === 'druide' && this.a('druide.protecteur', 2)) bonus += 2;
    if (this.classe === 'pretre' && this.a('pretre.conversion', 1) && !this.equipement.torse) bonus += 5;
    if (this.classe === 'pretre' && this.a('pretre.exorcisme', 2)) bonus += 1;
    if (this.classe === 'barde' && this.a('barde.rapiere', 2)) bonus += this.mod('INT');
    if (this.classe === 'druide' && this.a('druide.chaos', 2)) bonus += 2;
    if (this.classe === 'moine' && this.a('moine.poings', 3)) bonus += 2;
    if (this.classe === 'chevalier' && (this.f.corruptionMajeure || 0) >= 5) {
      const cap = this.capaciteEntree('chevalier.chaos', 4);
      if (cap && cap.choix === 'def') bonus += 2;
    }
    if (this.classe === 'moine' && this.a('moine.elevation', 2)) {
      const armure = this.armure();
      const sansArmureReelle = !armure || !armure.categorie || armure.categorie === 'legere';
      if (sansArmureReelle) bonus += this.mod('SAG');
    }
    return bonus;
  }
  bonusDefImmobile(): number {
    return this.classe === 'chasseur' && this.a('chasseur.traque', 2) && this.ctx.combat?.immobile ? 4 : 0;
  }
  bonusDefDuel(): number {
    if (!this.dons.includes('combattant_duel') || !this.armeUniqueMainLibre()) return 0;
    return this.ctx.combat?.monstresAdjacents === 1 ? 2 : 0;
  }
  bonusDefPhalange(): number {
    if (!(this.classe === 'guerrier' && this.a('guerrier.soldat', 2))) return 0;
    return this.ctx.combat?.alliesAdjacents ?? 0;
  }
  bonusDefBouclierExpert(): number {
    if (!this.dons.includes('expert_bouclier')) return 0;
    return this.itemsEquipesUniques().some((it) => it.type === 'bouclier') ? 1 : 0;
  }
  bonusDefSansArmureEquipement(): number {
    const aArmureOuBouclier = this.itemsEquipesUniques().some((it) => it.type === 'armure' || it.type === 'bouclier');
    if (aArmureOuBouclier) return 0;
    return this.somme('bonusDefSansArmure');
  }
  bonusDefArmureGroupeEquipement(): number {
    const monItem = this.itemsEquipesUniques().find((it) => it.bonusDefArmureGroupe);
    if (!monItem) return 0;
    const porte = this.ctx.combat?.allieAdjacentPorte;
    return porte && monItem.id && porte(monItem.id) ? nombre(monItem.bonusDefArmureGroupe) : 0;
  }

  // ---------- Réduction de dégâts ----------
  reductionDegats(): number {
    return this.somme('reductionDegats') + this.bonusReductionCapacites() + this.bonusTemporaire('reduction_degats');
  }
  bonusReductionCapacites(): number {
    let bonus = 0;
    if ((this.classe === 'necromancien' || this.classe === 'magicien') && (this.f.corruptionMajeure || 0) >= 5) {
      const cap = this.capaciteEntree(`${this.classe}.chaos`, 4);
      if (cap && cap.choix === 'reduction') bonus += 2;
    }
    return bonus;
  }
  reductionDegatsNaturels(): number {
    const rangMax = this.rangMaxVoie('druide.nature');
    return this.classe === 'druide' && rangMax >= 4 ? 2 * rangMax : 0;
  }
  bonusReductionLourdeDons(): number {
    const armure = this.armure();
    return armure && armure.categorie === 'lourde' && this.dons.includes('maitre_armures_lourdes') ? 3 : 0;
  }

  // ---------- Initiative ----------
  calculerInitiative(): number {
    return this.mod('DEX') + this.bonusInitiativeCapacites() + this.bonusInitiativeDons() + this.bonusInitiativeEquipement()
      + this.bonusInitiativeMutations() + this.bonusTemporaire('initiative');
  }
  bonusInitiativeCapacites(): number {
    let bonus = 0;
    if (this.classe === 'barde' && this.a('barde.rapiere', 2)) bonus += this.mod('INT');
    if (this.classe === 'moine' && this.a('moine.elevation', 1)) bonus += this.mod('SAG');
    if (this.classe === 'chevalier' && this.a('chevalier.noble', 1)) bonus += this.mod('CHA');
    if (this.classe === 'chasseur' && this.a('chasseur.traque', 4)) bonus += 2;
    if (this.classe === 'enchanteur' && this.a('enchanteur.historien', 3)) bonus += 2;
    return bonus;
  }
  bonusInitiativeDons(): number { return this.dons.includes('alerte') ? 5 : 0; }
  bonusInitiativeEquipement(): number { return this.somme('bonusInitiative') + this.bonusFormuleEquipement('initiative'); }

  // ---------- Attaque ----------
  bonusProgression(): number {
    const arch = (this.classe && constantes.archetypeClasse[this.classe]) || 'martial';
    const div = constantes.diviseurAttaque[arch] || 1;
    return Math.floor((this.niveau || 1) / div);
  }
  bonusAttaqueCapacites(type: string): number {
    let bonus = 0;
    if (type === 'contact' && this.classe === 'barde' && this.a('barde.rapiere', 1)) bonus += 1;
    if (this.classe === 'druide' && this.a('druide.nature', 2)) bonus += 2;
    if (type === 'distance' && this.classe === 'chasseur' && this.a('chasseur.gachette', 1)) bonus += 1;
    if (this.aEtatActif('ascension_chaotique')) bonus += 4;
    return bonus;
  }
  malusCombatDeuxArmes(type: string): number {
    if (type !== 'contact' || !this.enCombatDeuxArmes()) return 0;
    const d = this.equipement.main_droite;
    const g = this.equipement.main_gauche;
    if (d && g && d.categorieArme === 'courte' && g.categorieArme === 'courte') return 0;
    if (this.dons.includes('maitre_armes_doubles')) return 0;
    if (this.dons.includes('ambidextre')) return -2;
    return -4;
  }
  /** v1 bonusAttaque(type) : null pour « magique » si la classe n'a pas de carac de magie. */
  bonusAttaque(type: 'contact' | 'distance' | 'lancer' | 'magique' | string): number | null {
    const b = this.bonusProgression() + this.bonusTemporaire('attaque') + this.malusCombatDeuxArmes(type) + this.bonusAttaqueCapacites(type);
    const malusProficienceAttaque = (type === 'contact' || type === 'magique') && this.estArmureNonMaitrisee() ? -3 : 0;
    if (type === 'contact') {
      const malusArme = this.estArmeNonMaitrisee(this.armeContactEquipee()) ? -3 : 0;
      return b + this.mod('FOR') + malusProficienceAttaque + malusArme;
    }
    if (type === 'distance') {
      const bonusGantsDistance = this.somme('bonusAttaqueDistance');
      const malusProficience = this.estArmureNonMaitrisee() ? -2 : 0;
      const armeDist = this.armeDistanceEquipee();
      const modCaracAttaque = armeDist && armeDist.categoriePortee === 'jet' ? this.mod('FOR') : this.mod('DEX');
      const malusArme = this.estArmeNonMaitrisee(armeDist) ? -3 : 0;
      return b + modCaracAttaque + bonusGantsDistance + malusProficience + malusArme;
    }
    if (type === 'lancer') return b + this.mod('FOR');
    if (type === 'magique') {
      const cm = this.classe ? constantes.caracMagie[this.classe] : undefined;
      if (!cm) return null;
      return b + this.mod(cm) + this.somme('bonusAttaqueMagique') + malusProficienceAttaque;
    }
    return b;
  }
  degatsMagiques(): string | null {
    const cm = this.classe ? constantes.caracMagie[this.classe] : undefined;
    if (!cm) return null;
    const niveau = this.niveau || 1;
    let base = niveau >= 8 ? '1d10' : niveau >= 4 ? '1d8' : '1d6';
    const bonusEquip = this.somme('bonusDegatsMagiques');
    if (bonusEquip) base += '+' + bonusEquip;
    return base;
  }
  degatsPoings(): string | null {
    if (this.classe !== 'moine') return null;
    const rangMax = this.rangMaxVoie('moine.poings');
    if (!rangMax) return null;
    const effet = capaciteParId.get(`moine.poings.${rangMax}`)?.mecanique?.effets.find((e) => e.type === 'degats');
    if (!effet || typeof effet.formule !== 'string') return null;
    let formule = effet.formule.replace(/([+-])Mod\.([A-Za-z]+)/gi, (_m, signe: string, code: string) => {
      const v = (signe === '-' ? -1 : 1) * this.mod(code.toUpperCase() as Carac);
      return v >= 0 ? '+' + v : String(v);
    });
    const bonusGants = this.somme('bonusDegatsMainsNues');
    if (bonusGants) formule += '+' + bonusGants;
    return formule;
  }

  // ---------- Dons et points de voie ----------
  static donsRequisPourNiveau(niveau: number): number {
    let n = 0;
    if (niveau >= 4) n++;
    if (niveau >= 8) n++;
    if (niveau >= 12) n++;
    return n;
  }
  donsRequis(): number { return CalculsPersonnage.donsRequisPourNiveau(this.niveau || 1); }
  donsManquants(): number { return Math.max(0, this.donsRequis() - this.dons.length); }
  static coutRangVoie(rang: number): number { return rang >= 3 ? 2 : 1; }
  pointsVoieTotal(): number { return 2 * (this.niveau || 1); }
  pointsVoieDepenses(): number {
    // Seul écart avec la v1, voulu : un rang offert (Polyvalence, règle 2.0
    // décidée le 16/10) ne coûte rien. Les fiches v1 n'en ont jamais, le
    // test d'équivalence n'est donc pas concerné.
    const coutRangs = this.capacites.reduce((t, c) => t + (c.offert ? 0 : CalculsPersonnage.coutRangVoie(decouperCapacite(c.id).rang)), 0);
    const coutDeblocages = (this.f.voiesHorsProfil ?? []).reduce((t, hp) => t + (hp.cout || 0), 0);
    return coutRangs + coutDeblocages;
  }
  pointsVoieRestants(): number { return Math.max(0, this.pointsVoieTotal() - this.pointsVoieDepenses()); }
}

/** Les statistiques affichées sur une fiche, en un seul objet. */
export function statistiquesFiche(fiche: FicheCalcul, contexte: ContexteCalcul = {}) {
  const c = new CalculsPersonnage(fiche, contexte);
  const caracs = constantes.caracs.map((k) => k.code);
  return {
    mods: Object.fromEntries(caracs.map((k) => [k, c.mod(k)])) as Record<Carac, number>,
    ca: c.calculerCA(),
    initiative: c.calculerInitiative(),
    pvCalcule: c.pvCalcule(),
    ppMax: c.calculerPPMax(),
    attaque: {
      contact: c.bonusAttaque('contact'),
      distance: c.bonusAttaque('distance'),
      lancer: c.bonusAttaque('lancer'),
      magique: c.bonusAttaque('magique'),
    },
    degatsMagiques: c.degatsMagiques(),
    degatsPoings: c.degatsPoings(),
    sauvegardes: Object.fromEntries(Object.keys(constantes.sauvegardes).map((n) => [n, c.modSauvegarde(n)])) as Record<string, number>,
    reductionDegats: c.reductionDegats(),
    pointsVoie: { total: c.pointsVoieTotal(), depenses: c.pointsVoieDepenses(), restants: c.pointsVoieRestants() },
    dons: { requis: c.donsRequis(), manquants: c.donsManquants() },
    pointsCercleMax: {
      benediction: c.pointsBenedictionMax(),
      conviction: c.pointsConvictionMax(),
      bannissement: c.pointsBannissementMax(),
      jugement: c.pointsJugementMax(),
    },
    grimoire: {
      emplacements: c.slotsGrimoire(),
      occupes: c.grimoireSlotsOccupes(),
      plafondInscription: c.plafondInscriptionGrimoire(),
      inscrits: c.idsGrimoireInscrits(),
      horsPlafond: c.idsGrimoireHorsPlafond(),
    },
  };
}
export type StatistiquesFiche = ReturnType<typeof statistiquesFiche>;
