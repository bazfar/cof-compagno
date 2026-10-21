import { describe, expect, it } from 'vitest';
import { coutSort } from '../../src/lib/effets/cout';
import { actionAuPalier, paliersDefinis } from '../../src/lib/effets/paliers';
import { resoudreLancer, type CibleEnJeu, type Lancer, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import { actionParId, elementParId, etatParId, invocationParId, verbesDeLEcole } from '../../src/regles';

/*
 * Illusion et Enchantement (lot L4.5). Doc « Refonte classes et magie —
 * cadre » et décisions de Thomas du 21/10/2026.
 */

const v = (id: string) => actionParId.get(id)!;
const cat = { etats: etatParId, elements: elementParId };
const des =
  (...suite: [number, number][]) =>
  () => {
    const s = suite.shift();
    if (!s) throw new Error('plus de dés prévus');
    return (s[1] - 0.5) / s[0];
  };
const sauv = { FOR: 0, DEX: 0, CON: 0, Volonte: 0 };
const envouteur: LanceurEnJeu = { id: 'env', camp: 'pj', def: 13, sauvegardes: sauv, etats: [], modMagie: 3, attaqueMagique: 4, niveau: 4 };
const ennemi = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ id, camp: 'ennemi', def: 12, sauvegardes: sauv, etats: [], distance: 3, ...patch });
const lancer = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => {
  const r = resoudreLancer({ palier: 'I', lanceur: envouteur, cibles: [ennemi('a')], alea: des(), ...l }, cat);
  if (!r.ok) throw new Error(r.raison);
  return r;
};

describe('Illusion', () => {
  it('cinq verbes, coûts 2/3/4, 3/4, 4/5, 5 et 6 (validé)', () => {
    const verbes = verbesDeLEcole('illusion');
    expect(verbes.map((a) => a.nom)).toEqual(['Leurre', 'Voile', 'Double', 'Mirage', 'Illusion vivante']);
    expect(verbes.map((a) => paliersDefinis(a).map((p) => (coutSort(a, { palier: p }) as { pp: number }).pp))).toEqual([[2, 3, 4], [3, 4], [4, 5], [5], [6]]);
  });

  it('concentration : une seule illusion, rompue si l’Envoûteur est surpris (validé)', () => {
    for (const a of verbesDeLEcole('illusion')) expect(a.persistance).toMatchObject({ type: 'concentration', rupture: ['lanceurSurpris', 'autreConcentration'] });
  });

  it('Leurre : 1 round, Volonté ; II 2 rounds et il se déplace ; III il éclate et aveugle tout ce qui l’entoure (3b)', () => {
    const l = v('illusion.leurre');
    expect(l.effets[0]).toMatchObject({ etat: 'leurre', duree: { rounds: 1 } });
    expect(actionAuPalier(l, 'II').effets[0]).toMatchObject({ duree: { rounds: 2 } });
    expect(actionAuPalier(l, 'III').effets[0]).toMatchObject({ etat: 'leurre_eclatant', duree: { rounds: 2 } });
    expect(etatParId.get('leurre_eclatant')!.regle).toMatch(/rayon 1/);
    expect(l.horsCombat?.reussites).toBe(1);
  });

  it('Voile : Dissimulé tant que la concentration tient ; II Invisible 1 round', () => {
    expect(v('illusion.voile').effets[0]).toMatchObject({ etat: 'dissimule', duree: 'finCombat' });
    expect(actionAuPalier(v('illusion.voile'), 'II').effets[0]).toMatchObject({ etat: 'invisible', duree: { rounds: 1 } });
  });

  it('Double : une attaque contre l’allié rate, deux au palier II ; l’attaque ratée consomme une charge', () => {
    expect(v('illusion.double').effets[0]).toMatchObject({ etat: 'double', charges: 1, duree: 'prochainTour' });
    expect(actionAuPalier(v('illusion.double'), 'II').effets[0]).toMatchObject({ charges: 2 });
    const trait = actionParId.get('mineur.trait-arcanique')!;
    const r = lancer({ action: trait, cibles: [ennemi('a', { etats: ['double'] })] });
    expect(r.changements).toEqual([{ type: 'chargeConsommee', cible: 'a', etat: 'double' }]);
  });

  it('Mirage : une case d’illusion 3 rounds (4a) ; Illusion vivante : le double, moitié des PV et DEF de l’Envoûteur, ne frappe pas (5a)', () => {
    expect(lancer({ action: v('illusion.mirage') }).changements).toEqual([{ type: 'terrain', nature: 'illusion', duree: { rounds: 3 } }]);
    expect(v('illusion.illusion-vivante')).toMatchObject({ limite: '1x/combat', effets: [{ creature: 'double_illusoire' }] });
    expect(invocationParId.get('double_illusoire')).toMatchObject({ pv: { moitiePvLanceur: true }, def: { commeLanceur: true }, attaque: null });
  });
});

describe('Enchantement', () => {
  it('cinq verbes, sauvegarde de Volonté partout', () => {
    const verbes = verbesDeLEcole('enchantement');
    expect(verbes.map((a) => a.nom)).toEqual(['Charme', 'Fascination', 'Terreur', 'Sommeil', 'Domination']);
    expect(verbes.every((a) => a.resolution.sauvegarde === 'Volonte')).toBe(true);
  });

  it('Charme : 1 puis 2 rounds ; II protège un allié désigné (7a) ; III Ordre, sauf les boss', () => {
    const c = v('enchantement.charme');
    const iii = actionAuPalier(c, 'III');
    expect(iii.effets[0]).toMatchObject({ etat: 'charme', duree: { rounds: 2 } });
    expect(iii.effets.at(-1)).toMatchObject({ type: 'narratif', saufBoss: true });
    const boss = lancer({ action: c, palier: 'III', cibles: [ennemi('roi', { boss: true })], alea: des([20, 1]) });
    expect(boss.changements.filter((x) => x.type === 'narratif').map((x) => x.type === 'narratif' && x.texte)).toContainEqual(expect.stringMatching(/boss/));
  });

  it('Fascination : concentration à 1 PP par round, brisée si la cible est attaquée ; II deux cibles', () => {
    expect(v('enchantement.fascination').persistance).toMatchObject({ type: 'concentration', maintien: 1, rupture: expect.arrayContaining(['cibleAttaquee']) });
    expect(actionAuPalier(v('enchantement.fascination'), 'II').ciblage.nbCibles).toBe(2);
  });

  it('Terreur : Effroi 1 round et recul de 2 cases sur un échec ; II cercle de rayon 2, ennemis seulement (6a)', () => {
    const r = lancer({ action: v('enchantement.terreur'), alea: des([20, 3]) });
    expect(r.changements).toEqual([
      { type: 'etat', cible: 'a', etat: 'effroi', duree: { rounds: 1 } },
      { type: 'deplacement', cible: 'a', sens: 'repousse', cases: 2 },
    ]);
    const ii = actionAuPalier(v('enchantement.terreur'), 'II');
    expect(ii.zone).toMatchObject({ forme: 'cercle', taille: 2, filtre: 'ennemis' });
    const zone = lancer({ action: v('enchantement.terreur'), palier: 'II', zone: [ennemi('a'), { ...ennemi('ami'), camp: 'pj' }], alea: des([20, 2]) });
    expect(zone.changements.map((c) => c.type === 'etat' && c.cible).filter(Boolean)).toEqual(['a']);
  });

  it('Sommeil : sous 4 × niveau en PV actuels, pas sur un boss (validé)', () => {
    const s = v('enchantement.sommeil');
    expect(lancer({ action: s, cibles: [ennemi('a', { pv: 16 })], alea: des([20, 2]) }).changements).toEqual([{ type: 'etat', cible: 'a', etat: 'endormi', duree: 'finCombat' }]);
    expect(lancer({ action: s, cibles: [ennemi('a', { pv: 17 })], alea: des([20, 2]) }).changements).toEqual([]);
    expect(lancer({ action: s, cibles: [ennemi('a', { pv: 5, boss: true })], alea: des([20, 2]) }).changements.map((c) => c.type)).toEqual(['narratif']);
  });

  it('Domination : 1x/combat, l’Envoûteur joue le prochain tour de la cible, pas d’un boss', () => {
    expect(v('enchantement.domination')).toMatchObject({ limite: '1x/combat', effets: [{ etat: 'domine', saufBoss: true }] });
  });
});
