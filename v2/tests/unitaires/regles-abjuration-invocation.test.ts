import { describe, expect, it } from 'vitest';
import { actionAuPalier, paliersDefinis, variantesAuPalier } from '../../src/lib/effets/paliers';
import { resoudreLancer, type CibleEnJeu, type Lancer, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import { schemaAction } from '../../src/lib/schemas/effets';
import { actionParId, elementParId, etatParId, invocationParId, invocationsCitees, verbesDeLEcole } from '../../src/regles';

/*
 * Abjuration, Invocation et créatures invoquées (lot L4.4a). Doc « Refonte
 * classes et magie — cadre », « Verbes des autres écoles (validé) » et
 * « Serviteurs (validé) » ; décisions de Thomas du 21/10/2026.
 */

const v = (id: string) => actionParId.get(id)!;
const inv = (id: string) => invocationParId.get(id)!;
const cat = { etats: etatParId, elements: elementParId };
const des =
  (...suite: [number, number][]) =>
  () => {
    const s = suite.shift();
    if (!s) throw new Error('plus de dés prévus');
    return (s[1] - 0.5) / s[0];
  };
const sauv = { FOR: 0, DEX: 0, CON: 0, Volonte: 0 };
const mage: LanceurEnJeu = { id: 'mage', camp: 'pj', def: 12, sauvegardes: sauv, etats: [], modMagie: 3, attaqueMagique: 4 };
const creature = (id: string, camp: string): CibleEnJeu => ({ id, camp, def: 13, sauvegardes: sauv, etats: [], distance: 3 });
const lancer = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => resoudreLancer({ palier: 'I', lanceur: mage, cibles: [], alea: des(), ...l }, cat);

describe('Abjuration', () => {
  it('cinq verbes : Bouclier, Rempart, Dissipation, Renvoi, Sanctuaire', () => {
    expect(verbesDeLEcole('abjuration').map((a) => [a.rang, a.nom])).toEqual([
      [1, 'Bouclier'],
      [2, 'Rempart'],
      [3, 'Dissipation'],
      [4, 'Renvoi'],
      [5, 'Sanctuaire'],
    ]);
  });

  it('Bouclier : réaction à une attaque visée, +2 DEF jusqu’à son prochain tour ; II sur un allié à 6 cases ; III +3 DEF ou deux cibles', () => {
    const b = v('abjuration.bouclier');
    expect(b).toMatchObject({ action: 'reaction', declencheur: 'attaqueVisee', element: null });
    expect(b.effets).toEqual([{ type: 'bonus', cible: 'DEF', valeur: 2, duree: 'prochainTour', vise: 'cible' }]);
    expect(actionAuPalier(b, 'II').ciblage).toMatchObject({ type: 'creature', camp: 'allie', portee: 6, nbCibles: 1 });
    const iii = actionAuPalier(b, 'III');
    expect([iii.effets[0], iii.ciblage.nbCibles]).toEqual([expect.objectContaining({ valeur: 3 }), 1]);
    expect(variantesAuPalier(b, 'III')).toEqual([{ id: 'deux-cibles', nom: 'Deux cibles à +2 DEF' }]);
    const deux = actionAuPalier(b, 'III', 'deux-cibles');
    expect([deux.effets[0], deux.ciblage]).toEqual([expect.objectContaining({ valeur: 2 }), expect.objectContaining({ nbCibles: 2, camp: 'allie', portee: 6 })]);
    expect(() => actionAuPalier(b, 'II', 'deux-cibles')).toThrow(/pas de variante/);
  });

  it('Rempart : ligne de 3 cases qui bloque 2 rounds ; II 5 cases, 3 rounds ; il porte un élément (1b)', () => {
    const r = v('abjuration.rempart');
    expect(r.zone).toMatchObject({ forme: 'ligne', taille: 3 });
    expect(r.effets[0]).toMatchObject({ type: 'terrain', nature: 'bloquant', duree: { rounds: 2 } });
    expect(r.element).toEqual({ application: 'chaqueCible' });
    const ii = actionAuPalier(r, 'II');
    expect([ii.zone?.taille, ii.persistance.duree, ii.effets[0]]).toEqual([5, { rounds: 3 }, expect.objectContaining({ duree: { rounds: 3 } })]);
  });

  it('Dissipation : un état ou un effet de sort ; II en zone de rayon 1 ; Renvoi : moitié des dégâts, renvoyée', () => {
    const d = actionAuPalier(v('abjuration.dissipation'), 'II');
    expect([d.zone?.forme, d.zone?.taille, d.effets[0]?.vise]).toEqual(['cercle', 1, 'zone']);
    expect(v('abjuration.renvoi')).toMatchObject({ action: 'reaction', declencheur: 'sortCible', effets: [{ type: 'reductionDegats', part: 'moitie', renvoi: true }] });
  });

  it('Sanctuaire : 1x/combat, cercle de rayon 1, 2 rounds', () => {
    expect(v('abjuration.sanctuaire')).toMatchObject({ limite: '1x/combat', zone: { forme: 'cercle', taille: 1, origine: 'lanceur' }, effets: [{ nature: 'sanctuaire' }] });
  });
});

describe('Invocation', () => {
  it('cinq verbes : Familier, Arme spirituelle, Portail, Serviteur, Légion', () => {
    expect(verbesDeLEcole('invocation').map((a) => [a.rang, a.nom])).toEqual([
      [1, 'Familier'],
      [2, 'Arme spirituelle'],
      [3, 'Portail'],
      [4, 'Serviteur'],
      [5, 'Légion'],
    ]);
  });

  it('Familier : la scène ; III deux familiers ; Arme spirituelle : 3 rounds, la version II au palier II, un élément possible', () => {
    expect(actionAuPalier(v('invocation.familier'), 'III').effets[0]).toMatchObject({ creature: 'familier', nombre: 2, duree: 'scene' });
    const a = v('invocation.arme-spirituelle');
    expect(a.element).toEqual({ application: 'chaqueCible' });
    expect(paliersDefinis(a).map((p) => (actionAuPalier(a, p).effets[0] as { creature: string }).creature)).toEqual(['arme_spirituelle', 'arme_spirituelle_ii']);
  });

  it('Serviteur jusqu’à la fin du combat, selon l’élément ; Légion : trois Embruns 3 rounds, 1x/combat', () => {
    expect(v('invocation.serviteur').effets[0]).toMatchObject({ creature: 'serviteur', parElement: true, duree: 'finCombat' });
    expect(v('invocation.legion')).toMatchObject({ limite: '1x/combat', effets: [{ creature: 'embrun', nombre: 3, duree: { rounds: 3 } }] });
  });
});

describe('créatures invoquées', () => {
  it('les sept serviteurs (validé) : 3 × niveau en PV, DEF 12 + mod, 1d8 + mod de leur élément, 1 PP de Remous par round', () => {
    const noms = [...elementParId.keys()].map((e) => inv(`serviteur.${e}`).nom);
    expect(noms).toEqual(['Tison', 'Frimas', 'Bornier', 'Ondoyé', 'Fulgure', 'Sangsue', 'Rémanence']);
    for (const e of elementParId.keys())
      expect(inv(`serviteur.${e}`)).toMatchObject({ def: { base: 12, plusModMagie: true }, attaque: { des: '1d8', plusModMagie: true, typeDegats: e }, element: e, remousParRound: 1 });
  });

  it('rôles : Bornier PV × 1,5 et s’interpose, Fulgure déplacement doublé, Rémanence vole', () => {
    expect(inv('serviteur.terre').pv.parNiveau).toBe(4.5);
    expect(inv('serviteur.terre').capacites[0]?.nom).toBe('Interposition');
    expect([inv('serviteur.feu').deplacement, inv('serviteur.electricite').deplacement]).toEqual([6, 12]);
    expect(inv('serviteur.psionique').vol).toBe(true);
  });

  it('familier, arme spirituelle (4a) et Embruns : PV = niveau, DEF 12, 6 cases (3a)', () => {
    for (const id of ['familier', 'arme_spirituelle', 'arme_spirituelle_ii', 'embrun']) expect(inv(id)).toMatchObject({ pv: { parNiveau: 1 }, def: { base: 12, plusModMagie: false }, deplacement: 6 });
    expect([inv('arme_spirituelle').attaque?.des, inv('arme_spirituelle_ii').attaque?.des, inv('embrun').attaque?.des]).toEqual(['1d8', '2d6', '1d6']);
  });

  it('toute créature citée par une action existe, pour chaque élément d’un serviteur', () => {
    const c = invocationsCitees();
    expect(c.filter((x) => x.creature.startsWith('serviteur.'))).toHaveLength(7);
    expect(c.filter((x) => !invocationParId.has(x.creature))).toEqual([]);
  });
});

describe('résolution des nouveaux verbes', () => {
  it('Portail : un allié l’accepte sans sauvegarde, un ennemi sauvegarde en Volonté', () => {
    const allie = lancer({ action: v('invocation.portail'), cibles: [creature('guerrier', 'pj')] });
    expect(allie).toMatchObject({ ok: true, jets: [], changements: [{ type: 'deplacement', cible: 'guerrier', sens: 'teleporte', cases: 6 }] });
    const ennemi = lancer({ action: v('invocation.portail'), cibles: [creature('ogre', 'ennemi')], alea: des([20, 17]) });
    expect(ennemi).toMatchObject({ ok: true, changements: [] });
  });

  it('Serviteur : il faut un élément au moins Initié ; Tison au feu Initié (+1 PP), la Sangsue coûte des PV', () => {
    expect(lancer({ action: v('invocation.serviteur') })).toMatchObject({ ok: false, raison: expect.stringMatching(/élément/) });
    expect(lancer({ action: v('invocation.serviteur'), element: { id: 'feu', maitrise: 'nonMaitrise' } })).toMatchObject({ ok: false, raison: expect.stringMatching(/Initié/) });
    const tison = lancer({ action: v('invocation.serviteur'), element: { id: 'feu', maitrise: 'initie' }, alea: des([20, 15]) });
    expect(tison).toMatchObject({ ok: true, cout: { pp: 6, pv: 0 }, changements: [{ type: 'invocation', creature: 'serviteur.feu', nombre: 1, duree: 'finCombat', element: 'feu' }] });
    expect(lancer({ action: v('invocation.serviteur'), element: { id: 'sang', maitrise: 'adepte' } })).toMatchObject({ ok: true, cout: { pp: 5, pv: 5 } });
  });

  it('Rempart : le mur se pose une fois, sans cible ; Arme spirituelle emporte son élément', () => {
    expect(lancer({ action: v('abjuration.rempart') })).toMatchObject({ ok: true, changements: [{ type: 'terrain', nature: 'bloquant', duree: { rounds: 2 } }] });
    expect(lancer({ action: v('invocation.arme-spirituelle'), element: { id: 'glace', maitrise: 'adepte' } })).toMatchObject({
      ok: true,
      changements: [{ type: 'invocation', creature: 'arme_spirituelle', element: 'glace' }],
    });
  });

  it('Bouclier III : la variante choisie au lancement ; une variante d’un autre palier est refusée', () => {
    const r = lancer({ action: v('abjuration.bouclier'), palier: 'III', variante: 'deux-cibles', cibles: [creature('a', 'pj'), creature('b', 'pj')] });
    expect(r).toMatchObject({ ok: true, cout: { pp: 4 } });
    expect(r.ok && r.changements.map((c) => c.type === 'bonus' && [c.cible, c.valeur])).toEqual([
      ['a', 2],
      ['b', 2],
    ]);
    expect(lancer({ action: v('abjuration.bouclier'), palier: 'II', variante: 'deux-cibles' })).toMatchObject({ ok: false });
  });
});

describe('schéma : variantes', () => {
  it('une variante suppose son palier, et deux variantes n’ont pas le même identifiant', () => {
    const b = { ...v('abjuration.bouclier') };
    expect(schemaAction.safeParse({ ...b, variantes: [{ id: 'x', nom: 'X', palier: 'III', delta: {} }] }).success).toBe(true);
    expect(schemaAction.safeParse({ ...b, paliers: { II: b.paliers.II }, variantes: [{ id: 'x', nom: 'X', palier: 'III', delta: {} }] }).success).toBe(false);
    expect(
      schemaAction.safeParse({ ...b, variantes: [{ id: 'x', nom: 'X', palier: 'III', delta: {} }, { id: 'x', nom: 'Y', palier: 'III', delta: {} }] }).success,
    ).toBe(false);
  });
});
