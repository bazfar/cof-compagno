import { elementParId, etatParId, invocationParId } from '../../regles';
import type { Action, Duree, Effet, RESSOURCES } from '../schemas/effets';

type Ressource = (typeof RESSOURCES)[number];

/*
 * L'effet en combat d'un sort, en clair (lot G1, décision 3a de Thomas du
 * 22/10/2026) : un résumé généré depuis les données, palier par palier,
 * pour la colonne de gauche du grimoire. Généré plutôt qu'écrit à la main :
 * il reste juste quand un chiffre change dans src/regles.
 *
 * Il dit ce que le sort fait, pas comment le moteur le calcule : portée,
 * cibles ou zone, jet, durée, puis chaque effet. Un effet narratif est
 * repris tel quel ; le MJ l'applique.
 */

const NOMS_SAUVEGARDES = { FOR: 'FOR', DEX: 'DEX', CON: 'CON', Volonte: 'Volonté' } as const;
const NOMS_DEGATS: Record<string, string> = {
  physique: 'physiques',
  magique: 'magiques',
  sacre: 'sacrés',
  psychique: 'psychiques',
  necrotique: 'nécrotiques',
  chaotique: 'chaotiques',
  feu: 'de feu',
  glace: 'de glace',
  terre: 'de terre',
  eau: 'd’eau',
  electricite: 'd’électricité',
  sang: 'de sang',
  psionique: 'psioniques',
};
const NOMS_BONUS: Record<string, string> = {
  attaque: 'attaque',
  attaqueContact: 'attaque au contact',
  attaqueDistance: 'attaque à distance',
  attaqueMagique: 'attaque magique',
  DEF: 'DEF',
  degats: 'dégâts',
  sauvegardes: 'sauvegardes',
  sauvegardeFOR: 'sauvegarde de FOR',
  sauvegardeDEX: 'sauvegarde de DEX',
  sauvegardeCON: 'sauvegarde de CON',
  sauvegardeVolonte: 'sauvegarde de Volonté',
  initiative: 'initiative',
  deplacement: 'déplacement',
  DD: 'DD',
  reductionDegats: 'réduction des dégâts',
  prochainJet: 'prochain jet',
  tests: 'tous les jets',
  DEFContact: 'DEF au contact',
  DEFDistance: 'DEF à distance',
  caracAuChoix: 'caractéristique au choix',
};
const NOMS_CONDITIONS: Record<string, string> = {
  touche: 'si l’attaque touche',
  sauvegardeRatee: 'si la sauvegarde est ratée',
  sauvegardeReussie: 'si la sauvegarde est réussie',
  contreMetal: 'contre une cible en métal',
  contreDemonsMortsVivants: 'contre les démons et morts-vivants',
  cibleMarquee: 'contre une cible marquée',
  immobile: 'si le lanceur n’a pas bougé',
  protegeUnAllie: 'en protégeant un allié',
  armeLegere: 'avec une arme légère',
  cibleAffaiblie: 'contre une cible affaiblie',
  premierRound: 'au premier round',
  cibleAccusee: 'contre une cible accusée',
  cibleNAPasAgi: 'contre une cible qui n’a pas encore agi',
  enFormeAnimale: 'en forme animale',
  milieuNaturel: 'en milieu naturel',
};
/** Typée sur le schéma : une ressource ajoutée sans nom ne compile pas. */
const NOMS_RESSOURCES: Record<Ressource, [string, string]> = {
  pp: ['PP', 'PP'],
  endurance: ['Endurance', 'Endurance'],
  honneur: ['Honneur', 'Honneur'],
  instinct: ['Instinct', 'Instinct'],
  sacre: ['Sacré', 'Sacré'],
  inspiration: ['Inspiration', 'Inspiration'],
  forceNature: ['Force de la nature', 'Force de la nature'],
  ki: ['Ki', 'Ki'],
  pv: ['PV', 'PV'],
  ame: ['âme', 'âmes'],
  plongee: ['Plongée', 'Plongée'],
  corruptionAme: ['Corruption d’Âme', 'Corruption d’Âme'],
};
const NOMS_VISES: Record<string, string> = { lanceur: 'le lanceur', allie: 'un allié', zone: 'la zone', voisins: 'les voisins de la cible' };
const NOMS_TERRAINS: Record<string, string> = {
  difficile: 'terrain difficile',
  glissant: 'sol glissant',
  bloquant: 'mur qui bloque passage et vue',
  couverture: 'couverture',
  enflamme: 'sol enflammé',
  sanctuaire: 'sanctuaire',
  illusion: 'décor illusoire',
  sanctifie: 'sol sanctifié',
  electrifie: 'sol électrifié',
};

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const signe = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);

export function texteDuree(d: Duree): string {
  if (typeof d === 'string') return { prochainTour: 'jusqu’à son prochain tour', finCombat: 'jusqu’à la fin du combat', scene: 'pour la scène', permanente: 'permanent' }[d];
  if ('rounds' in d) return pluriel(d.rounds, 'round');
  if ('des' in d) return `${d.des}${d.plusModMagie ? ' + mod' : ''} rounds`;
  if ('plusModCible' in d) return `${d.base} + mod de ${d.plusModCible} de la cible, en rounds`;
  return `${d.base} + mod rounds`;
}

const mod = (e: { plusMod?: boolean; mod?: string | undefined }) => (e.plusMod ? ` + mod${e.mod ? ` de ${e.mod}` : ''}` : '');

function texteEffet(e: Effet): string {
  let t: string;
  switch (e.type) {
    case 'degats':
      t = `${e.des === 'arme' ? 'Dégâts de l’arme' : e.des}${mod(e)} dégâts ${NOMS_DEGATS[e.typeDegats] ?? e.typeDegats}`;
      if (e.progression) t += ' (le dé suit le niveau)';
      if (e.crans) t += `, dé +${e.crans} cran${e.crans > 1 ? 's' : ''}`;
      if (e.attenuation) t += `, pleins jusqu’à ${e.attenuation.pleinsJusqua} cases, moitié au-delà`;
      if (e.draine) t += `, ${e.draine === 'tout' ? 'tout' : 'la moitié'} rendu au lanceur`;
      if (e.doubleContre) t += ', doublés contre démons et morts-vivants';
      break;
    case 'soin':
      t = `Soigne ${e.des}${mod(e)}${e.enChaine ? ', la moitié aux cibles suivantes' : ''}`;
      break;
    case 'pvTemp':
      t = `${e.des}${e.parNiveau ? ` + ${e.parNiveau} × niveau` : ''}${mod(e)} PV temporaires`;
      break;
    case 'transfusion':
      t = `Transfère jusqu’à ${e.parNiveau} × niveau PV ${e.depuis === 'lanceur' ? 'du lanceur à la cible' : 'de la cible à un allié'}`;
      break;
    case 'etat':
      t = `${etatParId.get(e.etat)?.nom ?? e.etat}, ${texteDuree(e.duree)}`;
      if (e.charges) t += `, ${pluriel(e.charges, 'usage')}`;
      if (e.siPvAuPlus) t += `, si la cible a au plus ${e.siPvAuPlus.parNiveau} × niveau PV`;
      break;
    case 'retraitEtat':
      t = `Retire ${pluriel(e.nombre, 'état')}${e.etats.length ? ` (${e.etats.map((x) => etatParId.get(x)?.nom ?? x).join(', ')})` : ''}`;
      break;
    case 'deplacement':
      t = `${{ repousse: 'Repousse', attire: 'Attire', teleporte: 'Téléporte', libre: 'Déplacement libre' }[e.sens]} de ${pluriel(e.cases, 'case')}`;
      break;
    case 'bonus': {
      const v = typeof e.valeur === 'number' ? signe(e.valeur) : e.valeur === 'modMagie' ? '+ mod' : e.valeur === 'pointsDeChaos' ? '+ points de chaos' : typeof e.valeur === 'object' ? `+ mod de ${e.valeur.mod}` : e.valeur.startsWith('-') ? `−${e.valeur.slice(1)}` : `+${e.valeur}`;
      t = `${v} ${NOMS_BONUS[e.cible] ?? e.cible}${e.typeDegats ? ` ${NOMS_DEGATS[e.typeDegats] ?? ''}` : ''}, ${texteDuree(e.duree)}${e.consomme ? ', à la prochaine frappe' : ''}${e.parAllieAuContact ? ', par allié au contact' : ''}`;
      break;
    }
    case 'posture':
      t = `Posture : malus et bonus entre ${e.axes.join(', ')}`;
      break;
    case 'plancherPv':
      t = `Les PV ne descendent pas sous ${e.valeur}${e.duree ? `, ${texteDuree(e.duree)}` : ''}`;
      break;
    case 'ressource':
      t = e.montant === 'vider' ? `Vide la réserve (${NOMS_RESSOURCES[e.ressource][0]})` : `${signe(e.montant)} ${NOMS_RESSOURCES[e.ressource][Math.abs(e.montant) > 1 ? 1 : 0]}`;
      break;
    case 'tombe':
      t = 'La cible tombe à 0 PV';
      break;
    case 'invocation':
      t = `Invoque ${e.nombre > 1 ? `${e.nombre} × ` : ''}${e.parElement ? 'la créature de l’élément choisi' : (invocationParId.get(e.creature)?.nom ?? e.creature)}, ${texteDuree(e.duree)}`;
      break;
    case 'terrain':
      t = `${NOMS_TERRAINS[e.nature] ?? e.nature}, ${texteDuree(e.duree)}`;
      break;
    case 'dissipation':
      t = `Dissipe ${pluriel(e.nombre, 'effet')} magique${e.nombre > 1 ? 's' : ''}`;
      break;
    case 'soinComplet':
      t = 'Rend tous ses PV';
      break;
    case 'reductionDegats':
      t = `Dégâts réduits de moitié${e.renvoi ? ', la part retenue renvoyée à l’attaquant' : ''}`;
      break;
    case 'jetsReserves':
      t = `Dés lancés d’avance (${e.des}), ${e.ppParDe} PP chacun`;
      break;
    case 'relance':
      t = 'Le d20 est relancé, le second jet compte';
      break;
    case 'narratif':
      t = e.texte;
      break;
    case 'tableD20':
      t = `Table au d20 : ${e.lignes.map((l) => `${l.min}+ : ${l.effets.map(texteEffet).join(' ; ')}`).join(' · ')}`;
      break;
  }
  const vise = e.vise !== 'cible' && e.vise !== 'zone' && e.type !== 'narratif' ? ` (${NOMS_VISES[e.vise]})` : '';
  const cond = e.condition ? `, ${NOMS_CONDITIONS[e.condition] ?? e.condition}` : '';
  const boss = e.saufBoss ? ', pas sur un boss ni un démon D5' : '';
  return `${t}${vise}${cond}${boss}`;
}

/** Les lignes du résumé : la cible, le jet, la durée, puis un effet par ligne. */
export function texteDuSort(a: Action): string[] {
  const l: string[] = [];
  const c = a.ciblage;
  const portee = c.portee === 'soi' ? 'sur soi' : c.portee === 'contact' ? 'au contact' : c.portee === 'arme' ? 'à la portée de l’arme' : `portée ${pluriel(c.portee, 'case')}`;
  if (c.type === 'soi') l.push('Sur soi');
  else if (c.type === 'aucun') l.push(portee[0]!.toUpperCase() + portee.slice(1));
  else {
    const camp = c.camp === 'ennemi' ? (c.nbCibles > 1 ? 'ennemies' : 'ennemie') : c.camp === 'allie' ? (c.nbCibles > 1 ? 'alliées' : 'alliée') : '';
    const qui = c.type === 'point' ? 'un point' : `${pluriel(c.nbCibles, 'cible')}${camp ? ` ${camp}` : ''}`;
    l.push(`${qui[0]!.toUpperCase()}${qui.slice(1)}, ${portee}`);
  }
  if (a.zone) {
    const z = a.zone;
    const forme = { carre: `carré de ${z.taille}×${z.taille}`, cercle: `cercle de rayon ${z.taille}`, ligne: `ligne de ${pluriel(z.taille, 'case')}`, cone: `cône de ${pluriel(z.taille, 'case')}` }[z.forme];
    const enLigne = z.forme === 'ligne' || z.forme === 'cone';
    const ou = { lanceur: enLigne ? 'depuis le lanceur' : 'autour du lanceur', cible: 'autour de la cible', point: 'sur le point visé' }[z.origine];
    const filtre = z.filtre === 'tous' ? ', alliés compris' : z.filtre === 'ennemis' ? ', ennemis seulement' : ', alliés seulement';
    l.push(`Zone : ${forme} ${ou}${filtre}${z.degressif ? ', dégressive' : ''}`);
  }
  const r = a.resolution;
  if (r.jet === 'sauvegarde')
    l.push(`Sauvegarde de ${NOMS_SAUVEGARDES[r.sauvegarde!]}${r.siSauvegarde === 'rien' ? '' : ` : ${r.siSauvegarde === 'annule' ? 'annule' : 'moitié'}`}${r.consentant ? ' (un allié accepte)' : ''}${r.ddFixe ? `, DD ${r.ddFixe}` : ''}`);
  else if (r.jet === 'attaqueMagique') l.push('Attaque magique');
  else if (r.jet === 'attaque') l.push('Attaque');
  if (r.sauvegardeSurTouche) l.push(`Puis sauvegarde de ${NOMS_SAUVEGARDES[r.sauvegardeSurTouche]}`);
  const p = a.persistance;
  if (p.type === 'concentration') l.push(`Concentration${p.duree ? `, ${texteDuree(p.duree)}` : ''}${p.maintien ? `, ${p.maintien} PP par round` : ''}`);
  else if (p.type === 'duree' && p.duree) l.push(`Dure ${texteDuree(p.duree)}`);
  else if (p.type === 'zone') l.push(`Zone persistante${p.duree ? `, ${texteDuree(p.duree)}` : ''}`);
  for (const e of a.effets) l.push(texteEffet(e));
  return l;
}

/** L'effet générique d'un élément sur le sort, et son dérapage (onglet éléments, aperçu). */
export function texteElement(id: string): { nom: string; role: string; sort: string; derapage: string } | null {
  const e = elementParId.get(id as never);
  return e ? { nom: e.nom, role: e.role, sort: e.sort.texte, derapage: e.derapage.texte } : null;
}
