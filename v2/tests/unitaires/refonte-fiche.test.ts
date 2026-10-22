import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pointsDeVoies } from '../../src/lib/effets/profil';
import { vueFiche } from '../../src/lib/fiche/vue-fiche';
import {
  avertissementsRefonte,
  champsDeConversion,
  classeRefonteDe,
  contexteDe,
  convertirFiche,
  erreursRefonte,
  jaugesPleines,
  offrirRang,
  polyvalence,
  prendreRang,
  refaireVoies,
  refonteVierge,
  retirerRang,
} from '../../src/lib/fiche/refonte';
import { ficheCalculDepuisFiche, ficheDepuisV1 } from '../../src/lib/regles/fiche-document';
import { octroisVierges, schemaFiche, schemaFicheV2, type FicheV1, type RefonteFiche } from '../../src/lib/schemas/fiche';
import { classeParId } from '../../src/regles';

/*
 * La refonte sur la fiche (lot L4.11a) : fiche v2, budget de voies v1,
 * jauges, gestes et conversion des fiches réelles. Décisions de Thomas du
 * 21/10/2026 (1b à 14a).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- forme v1 non typée
const FICHES: any[] = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string, patch: Partial<FicheV1> = {}): FicheV1 => ({ ...ficheDepuisV1(FICHES.find((f) => f.nom.startsWith(nom)), 'u', 1).fiche, ...patch });
const classe = (id: string) => classeParId.get(id)!;
const choix = (id: string, patch: Partial<RefonteFiche>): RefonteFiche => ({ ...refonteVierge(classe(id), 1), ...patch });

describe('classes et jauges', () => {
  it('les dix classes passent à la refonte (L4.17), l’Enchanteur devient Envoûteur ; une classe inconnue, non', () => {
    const v1 = ['guerrier', 'chevalier', 'barde', 'chasseur', 'moine', 'druide', 'pretre', 'magicien', 'enchanteur', 'necromancien'];
    expect(v1.map((c) => classeRefonteDe(c)?.id)).toEqual(['guerrier', 'chevalier', 'barde', 'chasseur', 'moine', 'druide', 'pretre', 'magicien', 'envouteur', 'necromancien']);
    expect([classeRefonteDe('inconnue'), classeRefonteDe(null)]).toEqual([null, null]);
  });

  it('jauges pleines (9a) : Endurance 3 + niveau / 3, Inspiration 2 + niveau / 4, Sacré 2 + niveau / 3 ; Plongée 0', () => {
    expect(jaugesPleines(classe('guerrier'), 3, 1)).toEqual({ endurance: 4, inspiration: null, sacre: null, plongee: 0, corruptionAme: 1 });
    expect(jaugesPleines(classe('barde'), 8, 0)).toMatchObject({ endurance: null, inspiration: 4 });
    expect(jaugesPleines(classe('pretre'), 3, 0)).toMatchObject({ sacre: 3 });
    expect(jaugesPleines(classe('magicien'), 6, 2)).toEqual({ endurance: null, inspiration: null, sacre: null, plongee: 0, corruptionAme: 2 });
  });
});

describe('budget de voies (2a, règle v1)', () => {
  it('2 points par niveau ; 1 point aux rangs 1 et 2, 2 aux rangs 3 à 5 ; le rang offert ne coûte rien', () => {
    expect(pointsDeVoies({ niveau: 3, rangs: { a: 3, b: 2 } })).toEqual({ total: 6, depenses: 6, restants: 0 });
    expect(pointsDeVoies({ niveau: 3, rangs: { a: 5 } })).toEqual({ total: 6, depenses: 8, restants: -2 });
    expect(pointsDeVoies({ niveau: 5, rangs: { a: 3, b: 3 }, rangOffert: { voie: 'a', rang: 3 } })).toEqual({ total: 10, depenses: 6, restants: 4 });
  });
});

describe('gestes', () => {
  const k = reelle('Karlach');
  const g = classe('guerrier');
  const ctx = contexteDe(k, g);

  it('les rangs se prennent dans l’ordre, dans les voies de la classe, dans le budget', () => {
    let r = refonteVierge(g, 3);
    r = prendreRang(g, r, ctx, 'guerrier.soldat');
    r = prendreRang(g, r, ctx, 'guerrier.soldat');
    r = prendreRang(g, r, ctx, 'guerrier.soldat');
    r = prendreRang(g, r, ctx, 'guerrier.peuple');
    r = prendreRang(g, r, ctx, 'guerrier.peuple');
    expect(r.rangs).toEqual({ 'guerrier.soldat': 3, 'guerrier.peuple': 2 });
    expect(() => prendreRang(g, r, ctx, 'guerrier.ingenieur')).toThrow('Pas assez de points de voie.');
    expect(() => prendreRang(g, r, ctx, 'magicien.ecole')).toThrow('pas une voie de ta classe');
    expect(() => prendreRang(g, r, ctx, 'guerrier.chaos')).toThrow('accord du MJ');
    expect(retirerRang(r, 'guerrier.peuple').rangs).toEqual({ 'guerrier.soldat': 3, 'guerrier.peuple': 1 });
    expect(retirerRang(retirerRang(r, 'guerrier.peuple'), 'guerrier.peuple').rangs).toEqual({ 'guerrier.soldat': 3 });
  });

  it('voies exclusives : l’Hémomancie ou le Virtuose, pas les deux', () => {
    const m = classe('magicien');
    const r = prendreRang(m, refonteVierge(m, 4), contexteDe(reelle('Kylhian'), m), 'magicien.hemomancie');
    expect(() => prendreRang(m, r, contexteDe(reelle('Kylhian'), m), 'magicien.virtuose')).toThrow('Une seule voie parmi');
  });

  it('Polyvalence (Humain, niveau 5) : un rang offert, hors budget ; il part avec son rang', () => {
    const k5 = contexteDe(reelle('Karlach', { niveau: 5 }), g);
    expect(polyvalence(k5)).toBe(true);
    expect(polyvalence(ctx)).toBe(false);
    let r = refonteVierge(g, 5);
    r = offrirRang(g, r, k5, 'guerrier.soldat');
    expect(r).toMatchObject({ rangs: { 'guerrier.soldat': 1 }, rangOffert: { voie: 'guerrier.soldat', rang: 1 } });
    expect(() => offrirRang(g, r, k5, 'guerrier.peuple')).toThrow('déjà choisi');
    expect(() => offrirRang(g, refonteVierge(g, 3), ctx, 'guerrier.soldat')).toThrow('Polyvalence');
    expect(erreursRefonte(g, { ...refonteVierge(g, 3), rangs: { 'guerrier.soldat': 1 }, rangOffert: { voie: 'guerrier.soldat', rang: 1 } }, ctx)).toEqual([
      'Seul un Humain doté de Polyvalence reçoit un rang offert.',
    ]);
    expect(retirerRang(r, 'guerrier.soldat').rangOffert).toBeNull();
    expect(avertissementsRefonte(refonteVierge(g, 5), k5)).toEqual(['Polyvalence : le rang offert reste à choisir.', '10 points de voie à dépenser.']);
  });
});

describe('conversion (1b, 4a, 8a, 9a, 12a)', () => {
  it('Karlach : les champs v1 disparaissent, le reste est gardé ; Endurance pleine, Corruption d’Âme reprise', () => {
    const k = reelle('Karlach');
    const v2 = convertirFiche(k, choix('guerrier', { rangs: { 'guerrier.soldat': 3, 'guerrier.peuple': 2 } }));
    expect(v2.schemaVersion).toBe(2);
    for (const champ of ['capacites', 'voiesHorsProfil', 'corruptionMajeure', 'corruptionCombat', 'grimoireSortsConnus', 'cercleSpecialisation']) expect(champ in v2).toBe(false);
    expect({ nom: v2.nom, niveau: v2.niveau, pvMax: v2.pvMax, caracs: v2.caracs, equipement: v2.equipement, piecesOr: v2.piecesOr, capacitesRace: v2.capacitesRace, dons: v2.dons }).toEqual({
      nom: k.nom, niveau: k.niveau, pvMax: k.pvMax, caracs: k.caracs, equipement: k.equipement, piecesOr: k.piecesOr, capacitesRace: k.capacitesRace, dons: k.dons,
    });
    expect(v2.refonte.jauges).toEqual({ endurance: 4, inspiration: null, sacre: null, plongee: 0, corruptionAme: 1 });
    expect(v2.octrois).toEqual(octroisVierges());
    // Les calculs de la fiche lisent la Corruption d'Âme et la Plongée à la place des corruptions v1, sans voie v1.
    expect(ficheCalculDepuisFiche(v2)).toMatchObject({ corruptionMajeure: 1, corruptionCombat: 0, capacites: [], voiesHorsProfil: [], grimoireSortsConnus: [] });
    expect(vueFiche(v2).corruptionMajeure).toBe(1);
    expect(schemaFiche.parse(v2)).toEqual(v2);
    expect(schemaFicheV2.safeParse({ ...v2, capacites: [] }).success).toBe(false);
  });

  it('Magnus : l’Enchanteur devient Envoûteur ; il avait le chaos en v1, la voie lui est ouverte', () => {
    const r = choix('envouteur', { ecole: 'illusion', elementDepart: 'psionique', rangs: { 'envouteur.ecole': 3, 'envouteur.esprit': 2, 'envouteur.chaos': 2 } });
    const v2 = convertirFiche(reelle('Magnus'), r);
    expect(v2).toMatchObject({ classe: 'enchanteur', refonte: { classe: 'envouteur' }, octrois: { chaos: true } });
    const vue = vueFiche(v2);
    expect(vue.titre).toContain('Envoûteur');
    expect(vue.voies.map((v) => [v.id, v.rangs.length, v.chaos])).toEqual([
      ['envouteur.ecole', 3, false],
      ['envouteur.esprit', 2, false],
      ['envouteur.chaos', 2, true],
    ]);
  });

  it('Hermione : le Sacré part plein, les points de Cercle v1 disparaissent', () => {
    const v2 = convertirFiche(reelle('Hermione'), choix('pretre', { rangs: { 'pretre.guerison': 3, 'pretre.foi': 2 } }));
    expect(v2.refonte.jauges.sacre).toBe(3);
    expect('pointsCercle' in v2).toBe(false);
    expect(vueFiche(v2).pointsCercle).toEqual([]);
  });

  it('refusée : classe pas encore refondue, choix invalides (budget, chaos fermé, autre classe)', () => {
    expect(() => convertirFiche(reelle('Hyrma', { classe: 'inconnue' }), choix('guerrier', {}))).toThrow('pas encore passée à la refonte');
    expect(() => convertirFiche(reelle('Karlach'), choix('guerrier', { rangs: { 'guerrier.soldat': 5 } }))).toThrow('8 points de voie pour 6 au niveau 3.');
    expect(() => convertirFiche(reelle('Karlach'), choix('guerrier', { rangs: { 'guerrier.chaos': 1 } }))).toThrow('accord du MJ');
    expect(() => convertirFiche(reelle('Karlach'), choix('barde', {}))).toThrow('autre classe');
  });

  it('ce que la conversion écrit : version, refonte, octrois ; et les champs v1 à retirer', () => {
    const v2 = convertirFiche(reelle('Karlach'), choix('guerrier', {}));
    expect(champsDeConversion(v2)).toEqual({
      aEcrire: { schemaVersion: 2, refonte: v2.refonte, octrois: v2.octrois },
      aRetirer: ['capacites', 'voiesHorsProfil', 'pointsCercle', 'corruptionCombat', 'corruptionMajeure', 'grimoireSortsConnus', 'grimoireSortsPrepares', 'cercleSpecialisation'],
    });
  });
});

describe('reconversion (5a) et ce que le MJ accorde (6a, 7a)', () => {
  const v2 = convertirFiche(reelle('Karlach'), choix('guerrier', { rangs: { 'guerrier.soldat': 2 } }));

  it('refaire ses voies demande la reconversion rouverte par le MJ ; jauges gardées, reconversion refermée', () => {
    expect(() => refaireVoies(v2, choix('guerrier', { rangs: { 'guerrier.peuple': 2 } }))).toThrow('n’a pas rouvert');
    const ouverte = { ...v2, refonte: { ...v2.refonte, jauges: { ...v2.refonte.jauges, endurance: 1 } }, octrois: { ...v2.octrois, reconversion: true } };
    const refaite = refaireVoies(ouverte, choix('guerrier', { rangs: { 'guerrier.peuple': 2 } }));
    expect(refaite.refonte).toMatchObject({ rangs: { 'guerrier.peuple': 2 }, jauges: { endurance: 1 } });
    expect(refaite.octrois.reconversion).toBe(false);
  });

  it('un élément accordé par le MJ compte pour le profil ; le chaos ouvert permet ses rangs', () => {
    const m = classe('magicien');
    const ky = reelle('Kylhian');
    const r = choix('magicien', { ecole: 'evocation', elementDepart: 'feu', rangs: { 'magicien.ecole': 2, 'magicien.chaos': 1 } });
    expect(erreursRefonte(m, r, contexteDe(ky, m))).toEqual([expect.stringContaining('accord du MJ')]);
    expect(erreursRefonte(m, r, contexteDe(ky, m, { ...octroisVierges(), chaos: true, elements: { glace: 'nonMaitrise' } }))).toEqual([]);
  });
});
