import { describe, expect, it } from 'vitest';
import { reduire, resoudreLancer, type Catalogue, type CibleEnJeu, type Lancer, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import type { Element, Maitrise } from '../../src/lib/schemas/effets';
import { actionParId, combinaisonParId, combinaisons, elementParId, etatParId } from '../../src/regles';

/*
 * Combinaisons de Maître (lot L4.10) : premier élément Maître, second à son
 * rang (coût, dérapage, effet réduit de moitié et une fois par combat),
 * signatures des sept paires du cadre, effets génériques à la suite pour
 * les autres. Doc « Refonte classes et magie — cadre » et décisions du
 * 21/10/2026 (12a à 15a).
 */

const cat: Catalogue = { etats: etatParId, elements: elementParId, combinaisons };
const des =
  (...suite: [number, number][]) =>
  () => {
    const s = suite.shift();
    if (!s) throw new Error('plus de dés prévus');
    return (s[1] - 0.5) / s[0];
  };
const sauv = { FOR: 0, DEX: 0, CON: 0, Volonte: 0 };
const mage: LanceurEnJeu = { id: 'kylhian', camp: 'pj', def: 12, sauvegardes: sauv, etats: [], modMagie: 3, attaqueMagique: 5, niveau: 6, pv: 30, pvMax: 30 };
const ennemi = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ id, camp: 'ennemi', def: 12, sauvegardes: sauv, etats: [], distance: 3, ...patch });
const verbe = (id: string) => actionParId.get(`evocation.${id}`)!;
const el = (id: Element, maitrise: Maitrise = 'maitre') => ({ id, maitrise });
const essai = (l: Partial<Lancer> & Pick<Lancer, 'action'>, catalogue = cat) => resoudreLancer({ palier: 'I', lanceur: mage, cibles: [ennemi('a')], alea: des(), ...l }, catalogue);
const lancer = (l: Partial<Lancer> & Pick<Lancer, 'action'>, catalogue = cat) => {
  const r = essai(l, catalogue);
  if (!r.ok) throw new Error(r.raison);
  return r;
};

describe('les signatures du cadre (12a, 14a)', () => {
  it('sept paires, une signature chacune, l’ordre des éléments ne compte pas', () => {
    expect([...combinaisonParId.keys()]).toEqual(['vapeur', 'zone-electrifiee', 'lave', 'gel', 'onde-sismique', 'emprise', 'brulure-qui-draine']);
    const a = lancer({ action: verbe('missile'), element: el('feu'), secondElement: el('glace'), alea: des([6, 4], [20, 3]) });
    const b = lancer({ action: verbe('missile'), element: el('glace'), secondElement: el('feu'), alea: des([6, 4], [20, 3]) });
    expect(a.changements.slice(1)).toEqual(b.changements.slice(1));
  });

  it('Vapeur (feu + glace) : la signature remplace les deux effets génériques ; Aveuglé 1 round sur sa propre sauvegarde de CON', () => {
    const r = lancer({ action: verbe('missile'), element: el('feu'), secondElement: el('glace'), alea: des([6, 4], [20, 3]) });
    expect(r.cout).toEqual({ pp: 1, pv: 0 });
    expect(r.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 4, typeDegats: 'feu', calcul: '4 (4)' },
      { type: 'etat', cible: 'a', etat: 'aveugle', duree: { rounds: 1 } },
    ]);
    expect(r.jets.at(-1)).toMatchObject({ quoi: 'sauvegarde de CON (élément)', reussi: false });
  });

  it('Gel (glace + eau) : sa sauvegarde de FOR, même sur un sort à sauvegarde de DEX (Rayon)', () => {
    const r = lancer({ action: verbe('rayon'), palier: 'I', cibles: [], zone: [ennemi('a')], element: el('glace'), secondElement: el('eau'), alea: des([20, 15], [6, 2], [6, 2], [6, 2], [20, 3]) });
    expect(r.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 3, typeDegats: 'glace', calcul: '6 (2 + 2 + 2), sauvegarde réussie ×½' },
      { type: 'etat', cible: 'a', etat: 'immobilise', duree: { rounds: 1 } },
    ]);
  });

  it('Onde sismique (terre + électricité) : 1d6 et Renversé (FOR) aux voisins de la cible ; pas de rebond', () => {
    const r = lancer({ action: verbe('missile'), element: el('terre'), secondElement: el('electricite'), voisins: [ennemi('b')], rebond: ennemi('c'), alea: des([6, 3], [6, 4], [20, 2]) });
    expect(r.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 3, typeDegats: 'terre', calcul: '3 (3)' },
      { type: 'degats', cible: 'b', montant: 4, typeDegats: 'terre', calcul: '4 (4)' },
      { type: 'etat', cible: 'b', etat: 'renverse', duree: { rounds: 1 } },
    ]);
  });

  it('sur un sort de zone, le terrain de la signature n’est posé qu’une fois', () => {
    const r = lancer({ action: verbe('rayon'), cibles: [], zone: [ennemi('a'), ennemi('b')], element: el('eau'), secondElement: el('electricite'), alea: des([20, 2], [6, 1], [6, 1], [6, 1], [20, 2]) });
    expect(r.changements.filter((c) => c.type === 'terrain')).toHaveLength(1);
  });

  it('Zone électrifiée et Lave posent leur terrain une fois ; Emprise épargne les boss ; Brûlure qui draine soigne le lanceur', () => {
    expect(lancer({ action: verbe('missile'), element: el('eau'), secondElement: el('electricite'), alea: des([6, 1]) }).changements[1]).toEqual({ type: 'terrain', nature: 'electrifie', duree: { rounds: 2 } });
    expect(lancer({ action: verbe('missile'), element: el('feu'), secondElement: el('terre'), alea: des([6, 1]) }).changements.slice(1)).toEqual([
      { type: 'terrain', nature: 'enflamme', duree: { rounds: 2 } },
      { type: 'etat', cible: 'a', etat: 'brulure', duree: { rounds: 2 } },
    ]);
    expect(lancer({ action: verbe('missile'), cibles: [ennemi('a', { boss: true })], element: el('sang'), secondElement: el('psionique'), alea: des([6, 1], [20, 1]) }).changements[1]).toMatchObject({ type: 'narratif' });
    const draine = lancer({ action: verbe('missile'), element: el('feu'), secondElement: el('sang'), alea: des([6, 1]) });
    expect(draine.changements[1]).toEqual({ type: 'etat', cible: 'a', etat: 'brulure', duree: { rounds: 2 }, drainePour: 'kylhian' });
    expect(draine.cout).toEqual({ pp: 1, pv: 0 });
  });
});

describe('le second élément garde les règles de son rang', () => {
  it('Adepte : +2 PP, pas de dérapage, effet réduit de moitié (durées arrondies au supérieur), une fois par combat (13a)', () => {
    const r = lancer({ action: verbe('missile'), element: el('feu'), secondElement: el('terre', 'adepte'), alea: des([6, 1]) });
    expect(r.cout).toEqual({ pp: 3, pv: 0, combinaisonDuCombat: true });
    expect(r.changements.slice(1)).toEqual([
      { type: 'terrain', nature: 'enflamme', duree: { rounds: 1 } },
      { type: 'etat', cible: 'a', etat: 'brulure', duree: { rounds: 1 } },
    ]);
  });

  it('réduction : 3 rounds deviennent 2, 1 reste 1 (arrondi au supérieur)', () => {
    expect(reduire({ type: 'etat', etat: 'ralenti', duree: { rounds: 3 }, vise: 'cible' })).toMatchObject({ duree: { rounds: 2 } });
    expect(reduire({ type: 'etat', etat: 'ralenti', duree: { rounds: 1 }, vise: 'cible' })).toMatchObject({ duree: { rounds: 1 } });
  });

  it('Initié : il dérape sur 1 à 4 ; le sort entier échoue et le dérapage du second frappe le lanceur', () => {
    const r = lancer({ action: verbe('missile'), element: el('feu'), secondElement: el('glace', 'initie'), alea: des([20, 3]) });
    expect(r.issue).toBe('derapage');
    expect(r.changements).toEqual([{ type: 'etat', cible: 'kylhian', etat: 'ralenti', duree: { rounds: 1 } }]);
    expect(lancer({ action: verbe('missile'), element: el('feu'), secondElement: el('glace', 'initie'), alea: des([20, 5], [6, 2], [20, 1]) }).issue).toBe('reussi');
  });

  it('le premier doit être Maître ; deux éléments différents ; jamais sur un sort mineur', () => {
    expect(essai({ action: verbe('missile'), element: el('feu', 'adepte'), secondElement: el('glace') })).toEqual({ ok: false, raison: 'une combinaison demande un premier élément Maître' });
    expect(essai({ action: verbe('missile'), element: el('feu'), secondElement: el('feu') })).toEqual({ ok: false, raison: 'une combinaison prend deux éléments différents' });
    expect(essai({ action: actionParId.get('mineur.trait-arcanique')!, element: el('feu'), secondElement: el('glace') })).toEqual({ ok: false, raison: 'un sort mineur ne combine pas deux éléments' });
  });
});

describe('les autres paires : les deux effets génériques à la suite (12a)', () => {
  it('glace + psionique Adepte : Ralenti, puis Affaibli sur une Volonté ratée, réduit de moitié (1 round reste 1)', () => {
    const r = lancer({ action: verbe('missile'), element: el('glace'), secondElement: el('psionique', 'adepte'), alea: des([6, 5], [20, 2]) });
    expect(r.cout).toEqual({ pp: 3, pv: 0, combinaisonDuCombat: true });
    expect(r.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 5, typeDegats: 'glace', calcul: '5 (5)' },
      { type: 'etat', cible: 'a', etat: 'ralenti', duree: { rounds: 1 } },
      { type: 'etat', cible: 'a', etat: 'affaibli', duree: { rounds: 1 } },
    ]);
  });

  it('les modifications du second s’appliquent : psionique sur Choc, la sauvegarde devient la Volonté', () => {
    const r = lancer({ action: verbe('choc'), element: el('glace'), secondElement: el('psionique'), alea: des([20, 2], [6, 1], [6, 1]) });
    expect(r.jets[0]).toMatchObject({ quoi: 'sauvegarde de Volonte' });
  });

  it('sang en second élément Adepte : son dé compte pour moitié, payé en PV au coût du sort', () => {
    const r = lancer({ action: verbe('missile'), element: el('glace'), secondElement: el('sang', 'adepte'), alea: des([6, 4], [6, 5]) });
    expect(r.cout).toEqual({ pp: 3, pv: 3, combinaisonDuCombat: true });
    expect(r.changements[0]).toMatchObject({ type: 'degats', montant: 6 });
  });

  it('sans catalogue de signatures, feu + glace donne Brûlure puis Ralenti', () => {
    const r = lancer({ action: verbe('missile'), element: el('feu'), secondElement: el('glace'), alea: des([6, 1]) }, { etats: etatParId, elements: elementParId });
    expect(r.changements.slice(1).map((c) => c.type === 'etat' && c.etat)).toEqual(['brulure', 'ralenti']);
  });
});
