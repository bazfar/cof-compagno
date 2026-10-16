import type { Fiche, ObjetFiche } from '../schemas/fiche.ts';
import { CalculsPersonnage } from './calculs.ts';
import { catalogueObjets, objetParId } from './donnees.ts';
import { ficheCalculDepuisFiche } from './fiche-document.ts';
import { SLOTS_EQUIPEMENT, type Slot } from './fiche-calcul.ts';

/*
 * Équipement et sac (lot L2.4), en fonctions pures sur la fiche.
 *
 * Règles reprises de la v1 telles quelles (js/personnage.js : slotsPourType,
 * equiper, deséquiper, _armesCompatiblesMainsCroisees ; js/app.js :
 * equiperItem, ajouterAInventaire, utiliserConsommable) :
 *   - 9 emplacements, un objet chacun, une seule bague ;
 *   - arme à deux mains : les deux mains, qui doivent être libres ; c'est
 *     le même objet dans les deux (convention v1, cf. itemsEquipesUniques) ;
 *   - bouclier en main gauche seulement ; ni deux armes à distance, ni arme
 *     à distance et bouclier ;
 *   - maîtrise manquante : un avertissement, jamais un refus ;
 *   - seuls consommables, ingrédients et recettes s'empilent ;
 *   - équiper un objet à « PV max +1dX » lance le dé une fois et le fige,
 *     et les PV max et actuels de la fiche suivent (v1 _ajusterPvMaxEquipement).
 *
 * Décisions du 16/10 : chaque refus dit pourquoi (v1 : un seul message) ;
 * le MJ seul ajoute des objets (1a) ; « Utiliser » une potion de soin lance
 * son dé et rend les PV (2a) ; on jette une unité ou toute la pile (3a) ;
 * le don entre joueurs vient en L3 (4a).
 *
 * Chaque geste rend un Changement : les seuls champs à écrire (emplacements,
 * clés du sac, PV). L'action Firestore les écrit en une fois, champ par
 * champ (bug v1 : le sac entier était réécrit, et les objets étaient visés
 * par leur position, qui pouvait avoir changé entre-temps).
 */

export class RefusEquipement extends Error {}

export interface Changement {
  equipement: Partial<Record<Slot, ObjetFiche | null>>;
  /** Clés du sac : un objet à (re)poser, ou null pour retirer la clé. */
  inventaire: Record<string, ObjetFiche | null>;
  pvMax?: number;
  pvActuel?: number;
}

export const LIBELLES_SLOT: Record<Slot, string> = {
  tete: 'Tête',
  torse: 'Torse',
  jambe: 'Jambes',
  avant_bras: 'Avant-bras',
  main_droite: 'Main droite',
  main_gauche: 'Main gauche',
  collier: 'Collier',
  bague: 'Bague',
  mains: 'Mains',
};

const TYPES_EMPILABLES: readonly string[] = catalogueObjets.typesEmpilables;

const quantite = (o: ObjetFiche) => (typeof o.quantite === 'number' && o.quantite > 0 ? o.quantite : 1);
const estDeuxMains = (o: ObjetFiche | null | undefined) => !!o && o.type === 'arme' && !!o.deuxMains;
const estDistance = (o: ObjetFiche) => o.type === 'arme' && !CalculsPersonnage.estArmeContact(o);

/** v1 slotsPourType : où un objet peut aller ([] = jamais équipable). */
export function slotsPourObjet(o: ObjetFiche): Slot[] {
  if (o.slot === null) return [];
  if (estDeuxMains(o)) return ['main_droite', 'main_gauche'];
  if (typeof o.slot === 'string') return [(o.slot === 'botte' ? 'jambe' : o.slot) as Slot].filter((s) => SLOTS_EQUIPEMENT.includes(s));
  switch (o.type) {
    case 'arme':
      return ['main_droite', 'main_gauche'];
    case 'bouclier':
      return ['main_gauche'];
    case 'armure':
      return ['torse'];
    case 'accessoire':
      return ['collier', 'bague', 'avant_bras'];
    default:
      return [];
  }
}

/** v1 _armesCompatiblesMainsCroisees, avec la raison du refus. */
function refusMains(a: ObjetFiche, b: ObjetFiche | null | undefined): string | null {
  if (!b) return null;
  if (estDeuxMains(a) || estDeuxMains(b)) return 'Une arme à deux mains occupe déjà tes mains : retire-la d’abord.';
  if (estDistance(a) && estDistance(b)) return 'Pas deux armes à distance en même temps.';
  if ((estDistance(a) && b.type === 'bouclier') || (estDistance(b) && a.type === 'bouclier')) return 'Pas d’arme à distance avec un bouclier.';
  return null;
}

/** Clé libre dans le sac pour un objet : son identifiant, puis « ~2 », « ~3 »… (comme à l'import, L2.1). */
export function nouvelleCle(inventaire: Readonly<Record<string, unknown>>, o: ObjetFiche, prises: ReadonlySet<string> = new Set()): string {
  const base = (typeof o.id === 'string' && o.id ? o.id : 'objet').replace(/[.~/]/g, '_');
  let cle = base;
  for (let n = 2; cle in inventaire || prises.has(cle); n++) cle = `${base}~${n}`;
  return cle;
}

/**
 * Range des objets dans le sac : un objet empilable rejoint une pile de
 * même identifiant (v1 ajouterAInventaire), sinon il prend une clé neuve.
 */
function ranger(f: Fiche, objets: readonly ObjetFiche[], ch: Changement): void {
  const prises = new Set<string>();
  for (const o of objets) {
    const empilable = typeof o.type === 'string' && TYPES_EMPILABLES.includes(o.type);
    const vue = { ...f.inventaire, ...ch.inventaire };
    const pile = empilable ? Object.entries(vue).find(([, x]) => x && x.id === o.id && x.type === o.type) : undefined;
    if (pile && pile[1]) {
      ch.inventaire[pile[0]] = { ...pile[1], quantite: quantite(pile[1]) + quantite(o) };
    } else {
      const cle = nouvelleCle(vue, o, prises);
      prises.add(cle);
      ch.inventaire[cle] = o;
    }
  }
}

/** PV max et actuels suivent les bonus de PV max des objets (v1 _ajusterPvMaxEquipement). */
function ajusterPV(f: Fiche, ch: Changement, delta: number): void {
  if (!delta) return;
  const pvMax = Math.max(1, f.pvMax + delta);
  const actuel = f.pvActuel ?? f.pvMax;
  ch.pvMax = pvMax;
  ch.pvActuel = Math.max(0, Math.min(pvMax, actuel + delta));
}
const bonusPvMax = (o: ObjetFiche | null | undefined) => (o && typeof o.bonusPvMax === 'number' ? o.bonusPvMax : 0);

/** Lance un dé « XdY(+Z) » ; `alea` rend un nombre dans [0, 1[. */
export function lancerFormule(formule: string, alea: () => number = Math.random): { des: number[]; bonus: number; total: number } | null {
  const m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(formule.replace(/\s/g, ''));
  if (!m) return null;
  const nb = Number(m[1] || 1), faces = Number(m[2]), bonus = Number(m[3] || 0);
  const des = Array.from({ length: nb }, () => 1 + Math.floor(alea() * faces));
  return { des, bonus, total: des.reduce((t, d) => t + d, bonus) };
}

/**
 * Équiper l'objet rangé sous `cle`. Emplacement choisi : celui demandé s'il
 * convient, sinon le premier libre, sinon le premier possible (son occupant
 * retourne au sac) — comme en v1.
 */
export function equiper(f: Fiche, cle: string, slotDemande?: Slot, alea: () => number = Math.random): Changement {
  const objet = f.inventaire[cle];
  if (!objet) throw new RefusEquipement('Cet objet n’est plus dans le sac.');
  const slots = slotsPourObjet(objet);
  if (!slots.length) throw new RefusEquipement(`« ${objet.nom ?? 'Cet objet'} » ne s’équipe pas.`);
  if (slotDemande && !slots.includes(slotDemande)) throw new RefusEquipement(`« ${objet.nom} » ne va pas en ${LIBELLES_SLOT[slotDemande].toLowerCase()}.`);

  // Un objet à « PV max +1dX » fige son dé à l'équipement, une seule fois.
  let porte: ObjetFiche = objet;
  if (typeof objet.bonusPvMaxDe === 'string' && typeof objet.bonusPvMax !== 'number') {
    const jet = lancerFormule(objet.bonusPvMaxDe, alea);
    if (jet) porte = { ...objet, bonusPvMax: jet.total };
  }

  const ch: Changement = { equipement: {}, inventaire: { [cle]: null } };
  const eq = f.equipement;
  const retires: ObjetFiche[] = [];

  if (estDeuxMains(porte)) {
    if (eq.main_droite || eq.main_gauche) throw new RefusEquipement('Libère tes deux mains d’abord : une arme à deux mains les occupe toutes les deux.');
    ch.equipement.main_droite = porte;
    ch.equipement.main_gauche = porte;
  } else {
    const slot = slotDemande ?? slots.find((s) => !eq[s]) ?? (slots[0] as Slot);
    if (slot === 'main_droite' || slot === 'main_gauche') {
      const autre = eq[slot === 'main_droite' ? 'main_gauche' : 'main_droite'];
      const refus = refusMains(porte, autre);
      if (refus) throw new RefusEquipement(refus);
    }
    const ancien = eq[slot];
    if (ancien) retires.push(ancien);
    ch.equipement[slot] = porte;
  }
  ranger(f, retires, ch);
  ajusterPV(f, ch, bonusPvMax(porte) - retires.reduce((t, o) => t + bonusPvMax(o), 0));
  return ch;
}

/** Retirer l'objet d'un emplacement ; il retourne au sac (une arme à deux mains libère les deux). */
export function desequiper(f: Fiche, slot: Slot): Changement {
  const objet = f.equipement[slot];
  if (!objet) throw new RefusEquipement('Cet emplacement est déjà vide.');
  const ch: Changement = { equipement: estDeuxMains(objet) ? { main_droite: null, main_gauche: null } : { [slot]: null }, inventaire: {} };
  ranger(f, [objet], ch);
  ajusterPV(f, ch, -bonusPvMax(objet));
  return ch;
}

/** Jeter une unité, ou toute la pile (décision 3a). */
export function jeter(f: Fiche, cle: string, combien: 'un' | 'tout'): Changement {
  const objet = f.inventaire[cle];
  if (!objet) throw new RefusEquipement('Cet objet n’est plus dans le sac.');
  const reste = combien === 'tout' ? 0 : quantite(objet) - 1;
  return { equipement: {}, inventaire: { [cle]: reste > 0 ? { ...objet, quantite: reste } : null } };
}

/**
 * Soin d'un consommable (v1 formuleSoinItem : un consommable dont le texte
 * parle de PV et porte un dé). Le dé est lu dans la description du
 * CATALOGUE, plus le bonus de rareté de l'exemplaire (soinBonusRarete) : la
 * reprise v1 rafraîchit la description depuis le catalogue (L2.2c).
 */
export function formuleSoin(o: ObjetFiche): string | null {
  if (o.type !== 'consommable') return null;
  const modele = typeof o.id === 'string' ? objetParId.get(o.id) : undefined;
  const texte = modele?.description ?? (typeof o.description === 'string' ? o.description : '');
  if (!/PV/i.test(texte)) return null;
  const m = /(\d*)d(\d+)([+-]\d+)?/i.exec(texte);
  if (!m) return null;
  const bonus = Number(m[3] || 0) + (modele && typeof o.soinBonusRarete === 'number' ? o.soinBonusRarete : 0);
  return `${m[1] || '1'}d${m[2]}${bonus > 0 ? `+${bonus}` : bonus < 0 ? bonus : ''}`;
}

export interface Utilisation {
  changement: Changement;
  formule: string;
  jet: { des: number[]; bonus: number; total: number };
  /** PV réellement rendus (bornés au maximum). */
  soin: number;
}

/**
 * « Utiliser » une potion de soin (décision 2a) : une unité en moins, le dé
 * lancé, les PV rendus dans la limite du maximum. Le coût en action viendra
 * avec le combat (L6) ; les effets d'état sur le soin (Dette du Soigneur,
 * Corruption persistante) aussi.
 */
export function utiliser(f: Fiche, cle: string, alea: () => number = Math.random): Utilisation {
  const objet = f.inventaire[cle];
  if (!objet) throw new RefusEquipement('Cet objet n’est plus dans le sac.');
  const formule = formuleSoin(objet);
  const jet = formule ? lancerFormule(formule, alea) : null;
  if (!formule || !jet) throw new RefusEquipement(`« ${objet.nom} » ne s’utilise pas encore depuis la fiche.`);
  const changement = jeter(f, cle, 'un');
  const actuel = f.pvActuel ?? f.pvMax;
  const pv = Math.min(f.pvMax, actuel + jet.total);
  changement.pvActuel = pv;
  return { changement, formule, jet, soin: pv - actuel };
}

/** MJ : ajouter un objet du catalogue au sac (décision 1a), en une ou plusieurs unités. */
export function ajouterDuCatalogue(f: Fiche, idObjet: string, combien = 1): Changement {
  const modele = objetParId.get(idObjet);
  if (!modele) throw new RefusEquipement(`Objet inconnu : ${idObjet}`);
  const n = Math.max(1, Math.round(combien));
  const ch: Changement = { equipement: {}, inventaire: {} };
  const copie = structuredClone(modele) as ObjetFiche;
  if (TYPES_EMPILABLES.includes(modele.type)) ranger(f, [{ ...copie, quantite: n }], ch);
  else ranger(f, Array.from({ length: n }, () => structuredClone(copie)), ch);
  return ch;
}

/** Applique un Changement à une fiche (pour l'affichage et les tests ; Firestore fait de même champ par champ). */
export function appliquer(f: Fiche, ch: Changement): Fiche {
  const inventaire = { ...f.inventaire };
  for (const [k, v] of Object.entries(ch.inventaire)) {
    if (v) inventaire[k] = v;
    else delete inventaire[k];
  }
  return {
    ...f,
    equipement: { ...f.equipement, ...ch.equipement },
    inventaire,
    ...(ch.pvMax !== undefined ? { pvMax: ch.pvMax } : {}),
    ...(ch.pvActuel !== undefined ? { pvActuel: ch.pvActuel } : {}),
  };
}

/** Avertissements de maîtrise (jamais bloquants, v1 _malusMaitriseSiEquipe). */
export function alertesMaitrise(f: Fiche): string[] {
  const c = new CalculsPersonnage(ficheCalculDepuisFiche(f));
  const a: string[] = [];
  if (c.estArmureNonMaitrisee()) {
    a.push('Armure non maîtrisée : DEX ignorée en CA, −3 attaque contact et magique, −2 à distance, −2 aux tests de DEX et aux Réflexes, −2 déplacement.');
  }
  for (const main of ['main_droite', 'main_gauche'] as const) {
    const arme = f.equipement[main];
    if (arme && arme.type === 'arme' && c.estArmeNonMaitrisee(arme) && !(main === 'main_gauche' && estDeuxMains(arme))) {
      a.push(`${arme.nom ?? 'Arme'} : arme ${arme.maitrise ?? ''} non maîtrisée, −3 au jet d’attaque.`.replace('  ', ' '));
    }
  }
  return a;
}

/** Ce qu'une ligne d'objet affiche en plus de son nom (v1 badgeEffetItem, effets de rareté, matériau, affixe). */
export function effetsObjet(o: ObjetFiche): string[] {
  const e: string[] = [];
  if (o.type === 'arme' && typeof o.degats === 'string') {
    const bonus = typeof o.bonusDegatsTotal === 'number' ? o.bonusDegatsTotal : typeof o.enchantement === 'number' ? o.enchantement : 0;
    e.push(`${o.degats}${bonus ? ` +${bonus}` : ''} ${typeof o.typedegats === 'string' ? o.typedegats : ''}`.trim());
  }
  if (o.type === 'armure' && typeof o.valeurCA === 'number') e.push(`CA ${o.valeurCA}`);
  if (o.type === 'bouclier' && typeof o.bonusDEF === 'number') e.push(`+${o.bonusDEF} DEF`);
  if (o.type === 'accessoire' && typeof o.effet === 'string') e.push(o.effet);
  for (const champ of ['effetRarete', 'materiauEffet', 'effetMateriau', 'effetAffixe'] as const) {
    if (typeof o[champ] === 'string' && o[champ]) e.push(o[champ] as string);
  }
  const soin = formuleSoin(o);
  if (soin) e.push(`soigne ${soin} PV`);
  return e;
}

/**
 * Couleur du nom selon la rareté (v1 rareteCouleur). Un objet commun garde
 * la couleur du texte : le gris de la v1 le faisait passer pour désactivé.
 */
export function couleurRarete(o: ObjetFiche): string | undefined {
  return typeof o.rareteCouleur === 'string' && o.rarete !== 'commun' ? o.rareteCouleur : undefined;
}

/** Objets du catalogue proposés au MJ, par type puis par nom. */
export function catalogueTrie(): { id: string; nom: string; type: string }[] {
  return catalogueObjets.objets
    .map((o) => ({ id: o.id, nom: o.nom, type: o.type }))
    .sort((a, b) => a.type.localeCompare(b.type, 'fr') || a.nom.localeCompare(b.nom, 'fr'));
}
