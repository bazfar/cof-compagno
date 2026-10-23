import { actionParId } from '../../regles/index.ts';
import { FAMILLE_DES_ARMES } from '../../regles/armes.ts';
import { CalculsPersonnage } from '../regles/calculs.ts';
import { ficheCalculDepuisFiche } from '../regles/fiche-document.ts';
import { classeDeLaRefonte, contexteDe, profilDe } from '../fiche/refonte.ts';
import type { FamilleArme } from '../schemas/effets.ts';
import type { Fiche } from '../schemas/fiche.ts';
import { PORTEE_CONTACT, SEUIL_CRITIQUE } from './attaque.ts';
import { attaquesDuPj, type AttaquePj } from './attaques-pj.ts';

/*
 * Les attaques spéciales d'arme en combat (lot L6.3, décisions de Thomas du
 * 23/10/2026 ; règles du lot L4.7, src/regles/armes.ts) :
 *   - 11a : un bouton par attaque spéciale que la famille d'une arme maniée
 *     permet et que la classe autorise, avec son coût (2 Endurance au
 *     Guerrier, 1 avec Maniement expert ; une fois par combat, sans coût,
 *     pour les hybrides) ; même jet que l'attaque (L6.2), qui prend
 *     l'action principale ; touché : les dégâts, puis l'état 1 round (2
 *     avec Précision létale) ;
 *   - 12a : « repoussé d'une case » pousse le jeton (lib/combat/poussee.ts) ;
 *     Coup d'estoc laisse le choix entre Déséquilibré et repousser ;
 *   - 13a : armes à feu : Précision (il vise ; sa prochaine attaque gagne
 *     +1d6 aux dégâts, +1d10 sur un critique) et Décharge (trois balles de
 *     1d4, trois cibles au plus, un jet par balle).
 * Une fiche de la refonte seulement (3).
 */

export type EffetSpecial =
  | { type: 'etat'; etat: string; rounds: number }
  | { type: 'repousse' }
  | { type: 'estoc'; etat: string; rounds: number }
  | { type: 'precision' }
  | { type: 'decharge' };

export interface AttaqueSpeciale {
  id: string;
  nom: string;
  description: string;
  famille: FamilleArme;
  /** L'attaque d'arme qui porte la spéciale : bonus, dégâts, portée. */
  arme: AttaquePj;
  effet: EffetSpecial;
  cout: { ressource: string; montant: number } | 'unParCombat';
}

/** Les familles maniées : celles des armes en main, le bouclier, les mains nues sans arme de contact. */
export function famillesManiees(f: Fiche): Map<FamilleArme, AttaquePj> {
  const c = new CalculsPersonnage(ficheCalculDepuisFiche(f));
  const attaques = attaquesDuPj(f);
  const r = new Map<FamilleArme, AttaquePj>();
  const contact = attaques.find((a) => a.mode === 'contact');
  const distance = attaques.find((a) => a.mode === 'distance');
  for (const main of ['main_droite', 'main_gauche'] as const) {
    const o = f.equipement[main];
    if (!o) continue;
    const id = typeof o.id === 'string' ? o.id : '';
    if (o.type === 'bouclier') {
      // Le bouclier n'a pas de dés au catalogue : le coup ne fait que poser son état.
      r.set('bouclier', { mode: 'contact', nom: String(o.nom ?? 'Bouclier'), bonus: c.bonusAttaque('contact') ?? 0, formule: '', typeDegats: 'physique', portee: PORTEE_CONTACT, seuilCritique: contact?.seuilCritique ?? SEUIL_CRITIQUE });
      continue;
    }
    const famille = FAMILLE_DES_ARMES[id];
    const a = contact && contact.nom === o.nom ? contact : distance && distance.nom === o.nom ? distance : null;
    if (famille && a && !r.has(famille)) r.set(famille, a);
  }
  if (contact && (contact.nom === 'Poings' || contact.nom === 'Mains nues')) r.set('mainsNues', contact);
  return r;
}

export function attaquesSpecialesDuPj(f: Fiche): AttaqueSpeciale[] {
  if (f.schemaVersion !== 2) return [];
  const classe = classeDeLaRefonte(f.refonte.classe);
  if (!classe) return [];
  const p = profilDe(classe, f.refonte, contexteDe(f, classe));
  const as = p.attaquesSpeciales;
  if (!as) return [];
  const rounds = (p.voie.maitreDArmes?.rang ?? 0) >= 3 ? 2 : 1;
  const r: AttaqueSpeciale[] = [];
  for (const [famille, arme] of famillesManiees(f)) {
    if (as.familles !== 'toutes' && !as.familles.includes(famille)) continue;
    for (const a of actionParId.values()) {
      if (a.famille !== famille || !a.id.startsWith('arme.')) continue;
      const etat = a.effets.find((e) => e.type === 'etat');
      const pousse = a.effets.some((e) => e.type === 'deplacement' && e.sens === 'repousse');
      let effet: EffetSpecial | null = null;
      if (a.id === 'arme.precision') effet = { type: 'precision' };
      else if (a.id === 'arme.decharge') effet = { type: 'decharge' };
      else if (etat && etat.type === 'etat' && a.variantes.some((v) => v.id === 'repousser')) effet = { type: 'estoc', etat: etat.etat, rounds };
      else if (etat && etat.type === 'etat') effet = { type: 'etat', etat: etat.etat, rounds };
      else if (pousse) effet = { type: 'repousse' };
      if (effet) r.push({ id: a.id, nom: a.nom, description: a.description, famille, arme, effet, cout: as.cout });
    }
  }
  return r;
}
