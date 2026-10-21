import { describe, expect, it } from 'vitest';
import { coutSort } from '../../src/lib/effets/cout';
import { actionAuPalier } from '../../src/lib/effets/paliers';
import { profilMagique, verifierChoix, type ChoixDePersonnage } from '../../src/lib/effets/profil';
import { doublerDes, resoudreLancer, type CibleEnJeu, type Lancer, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import { actionParId, classeParId, elementParId, etatParId, voieParId } from '../../src/regles';

/*
 * Voie sauvage, Hémomancie, Virtuose et paliers des sorts mineurs (lot
 * L4.4b2). Doc « Refonte classes et magie — cadre » et décisions du
 * 21/10/2026 (verrouillées en tête de src/regles/classes/magicien.ts).
 */

const magicien = classeParId.get('magicien')!;
const regles = { voies: voieParId, actions: actionParId };
const cat = { etats: etatParId, elements: elementParId };
const des =
  (...suite: [number, number][]) =>
  () => {
    const s = suite.shift();
    if (!s) throw new Error('plus de dés prévus');
    return (s[1] - 0.5) / s[0];
  };
const sauv = { FOR: 0, DEX: 0, CON: 0, Volonte: 0 };
const mage: LanceurEnJeu = { id: 'mage', camp: 'pj', def: 12, sauvegardes: sauv, etats: [], modMagie: 3, attaqueMagique: 4, niveau: 5, pv: 20, pvMax: 40 };
const ennemi = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ id, camp: 'ennemi', def: 10, sauvegardes: sauv, etats: [], distance: 3, ...patch });
const a = (id: string) => actionParId.get(id)!;
const lancer = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => {
  const r = resoudreLancer({ palier: 'I', lanceur: mage, cibles: [ennemi('a')], ...l }, cat);
  if (!r.ok) throw new Error(r.raison);
  return r;
};
const degats = (r: ReturnType<typeof lancer>) => r.changements.filter((c) => c.type === 'degats').map((c) => (c.type === 'degats' ? [c.cible, c.montant, c.typeDegats] : []));
const choix = (c: Partial<ChoixDePersonnage>): ChoixDePersonnage => ({
  niveau: 5,
  modMagie: 3,
  ecole: 'evocation',
  elementDepart: 'feu',
  rangs: { 'magicien.ecole': 3 },
  mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'],
  ...c,
});

describe('la classe et ses voies', () => {
  it('cinq voies, l’Hémomancie et le Virtuose exclusifs (validé)', () => {
    expect(magicien.voies).toEqual(['magicien.ecole', 'magicien.elementaire', 'magicien.sauvage', 'magicien.hemomancie', 'magicien.virtuose']);
    expect(magicien.voiesExclusives).toEqual([['magicien.hemomancie', 'magicien.virtuose']]);
    expect(verifierChoix(magicien, choix({ rangs: { 'magicien.hemomancie': 1, 'magicien.virtuose': 1 } }), regles)).toContainEqual(expect.stringMatching(/Une seule voie/));
  });

  it('les capacités « 1x/jour » de la v1 passent en 1x/combat (8b) ; Saignée 1x/scénario', () => {
    const limites = (voie: string) => voieParId.get(voie)!.rangs.flatMap((r) => r.regles.map((x) => (x.type === 'capacite' ? [x.nom, x.limite] : null))).filter(Boolean);
    expect(limites('magicien.sauvage')).toEqual([
      ['mutationSauvage', 'volonte'],
      ['instinctChaotique', '1x/combat'],
      ['canalisation', 'volonte'],
      ['maitriseDuChaos', '1x/combat'],
      ['submersion', '1x/combat'],
    ]);
    expect(limites('magicien.hemomancie').at(-1)).toEqual(['saignee', '1x/scenario']);
  });
});

describe('Voie sauvage (2a, 7b, 8b)', () => {
  const sauvage = (rang: number, autre: Partial<NonNullable<NonNullable<Lancer['voie']>['sauvage']>> = {}) => ({ sauvage: { rang, ...autre } });

  it('Mutation sauvage : 2d4 − 4 aux dégâts de chaque sort offensif (règle v1 gardée)', () => {
    const r = lancer({ action: a('evocation.missile'), voie: sauvage(1), alea: des([4, 4], [4, 3], [6, 2]) });
    expect(r.jets[0]).toMatchObject({ quoi: 'Mutation sauvage', total: 3 });
    expect(degats(r)).toEqual([['a', 5, 'magique']]);
    const negatif = lancer({ action: a('evocation.missile'), voie: sauvage(1), alea: des([4, 1], [4, 1], [6, 1]) });
    expect(degats(negatif)).toEqual([['a', 0, 'magique']]);
  });

  it('un dérapage ne fait plus rater le sort : il part sans élément, avec sa mutation', () => {
    const r = lancer({ action: a('evocation.missile'), voie: sauvage(1), element: { id: 'feu', maitrise: 'nonMaitrise' }, alea: des([20, 3], [4, 2], [4, 2], [6, 5]) });
    expect(r.issue).toBe('reussi');
    expect(degats(r)).toEqual([['a', 5, 'magique']]);
    expect(r.changements.some((c) => c.type === 'etat')).toBe(false);
  });

  it('Instinct chaotique : le meilleur de deux jets ; Maîtrise du chaos : +4 sans jet', () => {
    const i = lancer({ action: a('evocation.missile'), voie: sauvage(2, { instinct: true }), alea: des([4, 1], [4, 1], [4, 3], [4, 4], [6, 1]) });
    expect(i.jets[0]).toMatchObject({ quoi: 'Instinct chaotique', total: 3 });
    expect(degats(i)).toEqual([['a', 4, 'magique']]);
    const m = lancer({ action: a('evocation.missile'), voie: sauvage(4, { maitriseDuChaos: true }), alea: des([6, 1]) });
    expect(degats(m)).toEqual([['a', 5, 'magique']]);
    // Sans le rang, le choix est ignoré.
    const sansRang = lancer({ action: a('evocation.missile'), voie: sauvage(1, { maitriseDuChaos: true }), alea: des([4, 2], [4, 2], [6, 1]) });
    expect(degats(sansRang)).toEqual([['a', 1, 'magique']]);
  });

  it('Canalisation profonde : sur +3 ou plus, l’effet choisi frappe la cible (embraser = Brûlure 1 round)', () => {
    const r = lancer({ action: a('evocation.missile'), voie: sauvage(3, { canalisation: 'brulure' }), alea: des([4, 4], [4, 3], [6, 1]) });
    expect(r.changements).toContainEqual({ type: 'etat', cible: 'a', etat: 'brulure', duree: { rounds: 1 } });
    const faible = lancer({ action: a('evocation.missile'), voie: sauvage(3, { canalisation: 'repousse' }), alea: des([4, 3], [4, 3], [6, 1]) });
    expect(faible.changements.some((c) => c.type === 'deplacement')).toBe(false);
  });

  it('Submersion : la mutation compte double ; négative, le mage prend 1d4 et est étourdi', () => {
    const r = lancer({ action: a('evocation.missile'), voie: sauvage(5, { submersion: true }), alea: des([4, 1], [4, 2], [6, 6], [4, 3]) });
    expect(degats(r)).toEqual([
      ['a', 4, 'magique'],
      ['mage', 3, 'magique'],
    ]);
    expect(r.changements).toContainEqual({ type: 'etat', cible: 'mage', etat: 'etourdi', duree: { rounds: 1 } });
  });

  it('un sort sans dégâts ne mute pas', () => {
    expect(lancer({ action: a('abjuration.bouclier'), voie: sauvage(1), cibles: [{ ...mage, distance: 0 }] }).jets).toEqual([]);
  });
});

describe('Hémomancie (9a, 10c, 1a, 11b, 12a)', () => {
  const hemo = (rang: number, autre: object = {}) => ({ hemomancie: { rang, ...autre } });

  it('Pacte de sang : le sort coûte ses PP en PV, jamais sous 1 PV', () => {
    expect(lancer({ action: a('evocation.choc'), voie: hemo(1), alea: des([20, 2], [6, 1], [6, 1]) }).cout).toEqual({ pp: 0, pv: 3 });
    expect(resoudreLancer({ action: a('evocation.choc'), palier: 'I', lanceur: { ...mage, pv: 3 }, cibles: [ennemi('a')], voie: hemo(1) }, cat)).toMatchObject({
      ok: false,
      raison: expect.stringMatching(/sous 1 PV/),
    });
  });

  it('Sang appelle sang : un quart des dégâts, au plus la moitié du coût arrondie au supérieur', () => {
    const r = lancer({ action: a('evocation.choc'), voie: hemo(2), alea: des([20, 2], [6, 6], [6, 6]) });
    expect(r.changements.at(-1)).toEqual({ type: 'soin', cible: 'mage', montant: 2 });
    const peu = lancer({ action: a('evocation.missile'), voie: hemo(2), alea: des([6, 3]) });
    expect(peu.changements.some((c) => c.type === 'soin')).toBe(false);
  });

  it('Seuil critique : sous la moitié des PV, la surcharge perd ses +2, le +1 du palier reste', () => {
    expect(lancer({ action: a('evocation.missile'), surcharge: true, voie: hemo(3), lanceur: { ...mage, pv: 19 }, alea: des([6, 1], [6, 1]) }).cout).toEqual({ pp: 0, pv: 3 });
    expect(lancer({ action: a('evocation.missile'), surcharge: true, voie: hemo(3), lanceur: { ...mage, pv: 20 }, alea: des([6, 1], [6, 1]) }).cout).toEqual({ pp: 0, pv: 5 });
    expect(coutSort(a('evocation.missile'), { palier: 'I', surcharge: true, surchargeSansSurcout: true })).toMatchObject({ pp: 3, palierLance: 'II' });
  });

  it('Sang versé : un dé de plus au prochain sort', () => {
    const r = lancer({ action: a('evocation.missile'), voie: hemo(4, { sangVerse: true }), alea: des([6, 2], [6, 5]) });
    expect(degats(r)).toEqual([['a', 7, 'magique']]);
  });

  it('Saignée : la moitié des PV actuels, le verbe à son palier le plus haut sans coût, +2d6', () => {
    const r = lancer({ action: a('evocation.missile'), voie: hemo(5, { saignee: true }), cibles: [ennemi('a'), ennemi('b'), ennemi('c')], alea: des([6, 1], [6, 3], [6, 4], [6, 2], [6, 2]) });
    expect(r).toMatchObject({ palierLance: 'III', cout: { pp: 0, pv: 10 } });
    expect(degats(r)).toEqual([
      ['a', 8, 'magique'],
      ['b', 2, 'magique'],
      ['c', 2, 'magique'],
    ]);
  });

  it('Saignée (soin) : la moitié des PV actuels pour rendre tous ses PV à un allié', () => {
    const r = lancer({ action: a('magicien.saignee-soin'), cibles: [{ ...ennemi('pretre'), camp: 'pj' }] });
    expect(r).toMatchObject({ cout: { pp: 0, pv: 10 }, changements: [{ type: 'soinComplet', cible: 'pretre' }] });
  });

  it('profil : le Pacte verse la réserve de PP dans les PV max', () => {
    const p = profilMagique(magicien, choix({ rangs: { 'magicien.ecole': 3, 'magicien.hemomancie': 2 } }), regles);
    expect(p).toMatchObject({ reservePP: 0, pvEnPlus: 20, voie: { hemomancie: { rang: 2 } } });
  });
});

describe('Virtuose et paliers des sorts mineurs (13a, 14a, 15b)', () => {
  it('Répertoire : un sort mineur de plus, et celui choisi passe au palier II', () => {
    const c = choix({ rangs: { 'magicien.ecole': 3, 'magicien.virtuose': 1 }, mineurs: ['mineur.trait-arcanique', 'mineur.lumiere', 'mineur.prestidigitation', 'mineur.main-du-mage'], mineurPalierII: 'mineur.lumiere' });
    expect(verifierChoix(magicien, c, regles)).toEqual([]);
    const p = profilMagique(magicien, c, regles);
    expect(p.mineursMax).toBe(4);
    expect(p.mineurs.find((m) => m.id === 'mineur.lumiere')).toEqual({ id: 'mineur.lumiere', palier: 'II' });
    expect(verifierChoix(magicien, { ...c, mineurPalierII: undefined }, regles)).toEqual([expect.stringMatching(/Répertoire/)]);
    expect(verifierChoix(magicien, choix({ mineurPalierII: 'mineur.lumiere' }), regles)).toEqual([expect.stringMatching(/avec Répertoire/)]);
  });

  it('Perfection : tous au palier III, dés d’un cran au-dessus ; Trait arcanique III frappe deux cibles en d10 au niveau 5', () => {
    const p = profilMagique(magicien, choix({ niveau: 6, rangs: { 'magicien.ecole': 4, 'magicien.virtuose': 4 }, mineurPalierII: 'mineur.lumiere' }), regles);
    expect(p.mineurs.every((m) => m.palier === 'III')).toBe(true);
    expect(p.voie.virtuose).toEqual({ crans: 1, affinite: true });
    const r = lancer({ action: a('mineur.trait-arcanique'), palier: 'III', voie: p.voie, cibles: [ennemi('a'), ennemi('b')], alea: des([20, 15], [10, 9], [20, 15], [10, 2]) });
    expect(degats(r)).toEqual([
      ['a', 9, 'magique'],
      ['b', 2, 'magique'],
    ]);
  });

  it('Affinité : un élément au moins Adepte porte son effet complet sur un sort mineur', () => {
    const avec = lancer({ action: a('mineur.trait-arcanique'), element: { id: 'glace', maitrise: 'adepte' }, voie: { virtuose: { affinite: true } }, alea: des([20, 15], [8, 3]) });
    expect(avec.changements).toContainEqual({ type: 'etat', cible: 'a', etat: 'ralenti', duree: { rounds: 1 } });
    const initie = lancer({ action: a('mineur.trait-arcanique'), element: { id: 'glace', maitrise: 'initie' }, voie: { virtuose: { affinite: true } }, alea: des([20, 15], [8, 3]) });
    expect(initie.changements.some((c) => c.type === 'etat')).toBe(false);
    expect(degats(initie)).toEqual([['a', 3, 'glace']]);
  });

  it('Le geste unique : dés doublés (15b)', () => {
    expect([doublerDes('1d8'), doublerDes('2d6'), doublerDes('d4+1')]).toEqual(['2d8', '4d6', '2d4+1']);
    const r = lancer({ action: a('mineur.trait-arcanique'), voie: { virtuose: { gesteUnique: true } }, alea: des([20, 15], [8, 3], [8, 4]) });
    expect(degats(r)).toEqual([['a', 7, 'magique']]);
  });

  it('paliers des sorts mineurs (tableau du 21/10) : Trait 15 cases puis deux cibles ; Main du mage III désarme (FOR), Lumière III aveugle (CON)', () => {
    expect(actionAuPalier(a('mineur.trait-arcanique'), 'II').ciblage.portee).toBe(15);
    const main = actionAuPalier(a('mineur.main-du-mage'), 'III');
    expect(main).toMatchObject({ etiquettes: ['combat', 'exploration'], resolution: { jet: 'sauvegarde', sauvegarde: 'FOR' } });
    expect(main.effets.at(-1)).toMatchObject({ type: 'etat', etat: 'desarme', duree: { rounds: 1 } });
    const lumiere = actionAuPalier(a('mineur.lumiere'), 'III');
    expect(lumiere.effets.at(-1)).toMatchObject({ etat: 'aveugle', duree: { rounds: 1 } });
    expect(lancer({ action: a('mineur.lumiere'), palier: 'III', alea: des([20, 3]) }).changements).toContainEqual({ type: 'etat', cible: 'a', etat: 'aveugle', duree: { rounds: 1 } });
  });

  it('Geste réflexe : sans limite propre, la règle d’une réaction par round suffit', () => {
    const r = voieParId.get('magicien.virtuose')!.rangs[2]!.regles[0];
    expect(r).toEqual({ type: 'capacite', nom: 'gesteReflexe', limite: 'volonte' });
  });
});

describe('une fois par sort', () => {
  it('la Mutation sauvage et le dé de sang ne portent que sur le premier projectile', () => {
    const r = lancer({
      action: a('evocation.missile'),
      palier: 'II',
      element: { id: 'sang', maitrise: 'adepte' },
      voie: { sauvage: { rang: 1 } },
      cibles: [ennemi('a'), ennemi('b')],
      alea: des([4, 4], [4, 4], [6, 1], [6, 6], [6, 2]),
    });
    expect(degats(r)).toEqual([
      ['a', 11, 'sang'],
      ['b', 2, 'sang'],
    ]);
  });
});
