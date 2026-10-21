import { describe, expect, it } from 'vitest';
import { appliquerAffaibli, degatsReduits, resoudreLancer, type CibleEnJeu, type Lancer, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import { schemaAction, type Action } from '../../src/lib/schemas/effets';
import { actionParId, elementParId, etatParId } from '../../src/regles';

/*
 * Moteur de résolution (lot L4.3). Les dés sont fixés : `des([6, 4], [20, 15])`
 * fait sortir 4 sur un d6 puis 15 sur un d20, dans l'ordre où le moteur les
 * lance (école, élément, puis pour chaque cible son jet et ses dégâts).
 */

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
const ennemi = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ id, camp: 'ennemi', def: 13, sauvegardes: sauv, etats: [], distance: 2, ...patch });
const allie = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ id, camp: 'pj', def: 14, sauvegardes: sauv, etats: [], distance: 1, ...patch });
const verbe = (id: string) => actionParId.get(`evocation.${id}`)!;
const lancer = (l: Partial<Lancer> & Pick<Lancer, 'action' | 'alea'>) => {
  const r = resoudreLancer({ palier: 'I', lanceur: mage, cibles: [], ...l }, cat);
  if (!r.ok) throw new Error(r.raison);
  return r;
};
const degats = (r: ReturnType<typeof lancer>) => r.changements.filter((c) => c.type === 'degats').map((c) => (c.type === 'degats' ? [c.cible, c.montant, c.typeDegats] : []));

describe('arithmétique des dégâts (décisions du 21/10/2026)', () => {
  it('réductions multipliées puis un seul arrondi à l’inférieur (3a) : moitié et moitié = un quart (9a)', () => {
    expect(degatsReduits(9, [0.5])).toBe(4);
    expect(degatsReduits(9, [0.5, 0.5])).toBe(2);
    expect(degatsReduits(10, [0.75])).toBe(7);
    expect(degatsReduits(5, [0.5, 2])).toBe(5);
  });

  it('Affaibli : −25 % arrondis au plus proche (2b), jamais sous 1 (1b)', () => {
    expect(appliquerAffaibli(7, 25, 1)).toBe(5);
    expect(appliquerAffaibli(8, 25, 1)).toBe(6);
    expect(appliquerAffaibli(6, 25, 1)).toBe(4);
    expect(appliquerAffaibli(2, 25, 1)).toBe(1);
    expect(appliquerAffaibli(1, 25, 1)).toBe(1);
    expect(appliquerAffaibli(0, 25, 1)).toBe(0);
  });
});

describe('Missile', () => {
  it('palier I : 1d6 qui touche d’office, 2 PP, dégâts magiques', () => {
    const r = lancer({ action: verbe('missile'), cibles: [ennemi('gob')], alea: des([6, 4]) });
    expect(r).toMatchObject({ issue: 'reussi', cout: { pp: 2, pv: 0 }, dd: 13 });
    expect(degats(r)).toEqual([['gob', 4, 'magique']]);
  });

  it('palier III, feu : un dé par projectile, dégâts de feu, Brûlure sur chaque projectile', () => {
    const r = lancer({
      action: verbe('missile'),
      palier: 'III',
      element: { id: 'feu', maitrise: 'adepte' },
      cibles: [ennemi('a'), ennemi('b'), ennemi('a')],
      alea: des([6, 1], [6, 2], [6, 3]),
    });
    expect(degats(r)).toEqual([
      ['a', 1, 'feu'],
      ['b', 2, 'feu'],
      ['a', 3, 'feu'],
    ]);
    expect(r.changements.filter((c) => c.type === 'etat')).toHaveLength(3);
    expect(r.cout.pp).toBe(4);
  });

  it('palier II, feu : l’élément ne touche que la cible principale', () => {
    const r = lancer({ action: verbe('missile'), palier: 'II', element: { id: 'feu', maitrise: 'adepte' }, cibles: [ennemi('a'), ennemi('b')], alea: des([6, 1], [6, 2]) });
    expect(r.changements.filter((c) => c.type === 'etat')).toEqual([{ type: 'etat', cible: 'a', etat: 'brulure', duree: { rounds: 2 } }]);
  });

  it('terre sur Missile (4a) : sauvegarde de FOR contre le DD pour le renversement seulement', () => {
    const rate = lancer({ action: verbe('missile'), element: { id: 'terre', maitrise: 'adepte' }, cibles: [ennemi('a')], alea: des([6, 5], [20, 12]) });
    expect(rate.jets.find((j) => j.quoi.includes('FOR'))).toMatchObject({ total: 12, contre: 13, reussi: false });
    expect(rate.changements).toContainEqual({ type: 'etat', cible: 'a', etat: 'renverse', duree: { rounds: 1 } });
    const reussie = lancer({ action: verbe('missile'), element: { id: 'terre', maitrise: 'adepte' }, cibles: [ennemi('a')], alea: des([6, 5], [20, 13]) });
    expect(reussie.changements.some((c) => c.type === 'etat')).toBe(false);
    expect(degats(reussie)).toEqual([['a', 5, 'terre']]);
  });

  it('psionique sur Missile (5a) : Missile reste automatique, seule l’Affaibli demande une Volonté', () => {
    const r = lancer({ action: verbe('missile'), element: { id: 'psionique', maitrise: 'adepte' }, cibles: [ennemi('a')], alea: des([6, 6], [20, 3]) });
    expect(degats(r)).toEqual([['a', 6, 'psionique']]);
    expect(r.changements).toContainEqual({ type: 'etat', cible: 'a', etat: 'affaibli', duree: { rounds: 1 } });
  });
});

describe('Choc (décisions 1a, 2b du 20/10 et 9a du 21/10)', () => {
  it('sauvegarde ratée à 2 cases : dégâts pleins et repoussé d’1 case', () => {
    const r = lancer({ action: verbe('choc'), cibles: [ennemi('a', { distance: 2 })], alea: des([20, 5], [6, 3], [6, 4]) });
    expect(degats(r)).toEqual([['a', 7, 'magique']]);
    expect(r.changements).toContainEqual({ type: 'deplacement', cible: 'a', sens: 'repousse', cases: 1 });
  });

  it('sauvegarde réussie à 5 cases : moitié et moitié, un quart arrondi à l’inférieur, pas de poussée', () => {
    const r = lancer({ action: verbe('choc'), cibles: [ennemi('a', { distance: 5 })], alea: des([20, 15], [6, 5], [6, 4]) });
    expect(degats(r)).toEqual([['a', 2, 'magique']]);
    expect(r.changements.some((c) => c.type === 'deplacement')).toBe(false);
  });

  it('eau : 2 cases de poussée en plus ; ou, au choix, un allié perd un état', () => {
    const eau = { id: 'eau', maitrise: 'adepte' } as const;
    const pousse = lancer({ action: verbe('choc'), element: eau, cibles: [ennemi('a')], alea: des([20, 2], [6, 1], [6, 1]) });
    expect(pousse.changements).toContainEqual({ type: 'deplacement', cible: 'a', sens: 'repousse', cases: 3 });
    const purge = lancer({ action: verbe('choc'), element: eau, choixEau: 'retraitEtat', allie: allie('pretre', { etats: ['saignement'] }), cibles: [ennemi('a')], alea: des([20, 2], [6, 1], [6, 1]) });
    expect(purge.changements).toContainEqual({ type: 'deplacement', cible: 'a', sens: 'repousse', cases: 1 });
    expect(purge.changements).toContainEqual({ type: 'retraitEtat', cible: 'pretre', etats: [], nombre: 1 });
  });

  it('psionique sur Choc : la sauvegarde devient une Volonté, et l’armure ne compte plus', () => {
    const r = lancer({ action: verbe('choc'), element: { id: 'psionique', maitrise: 'adepte' }, cibles: [ennemi('a', { sauvegardes: { ...sauv, FOR: 10, Volonte: 0 } })], alea: des([20, 4], [6, 2], [6, 2]) });
    expect(r.jets[0]).toMatchObject({ quoi: 'sauvegarde de Volonte', total: 4, reussi: false });
    expect(r.changements).toContainEqual({ type: 'etat', cible: 'a', etat: 'affaibli', duree: { rounds: 1 } });
  });

  it('électricité : rebond pour moitié, même sauvegarde (7a) ; double contre une armure de métal', () => {
    const r = lancer({
      action: verbe('choc'),
      element: { id: 'electricite', maitrise: 'adepte' },
      cibles: [ennemi('chevalier', { armureMetal: true })],
      rebond: ennemi('archer'),
      alea: des([20, 2], [6, 3], [6, 3], [20, 18]),
    });
    expect(degats(r)).toEqual([
      ['chevalier', 12, 'electricite'],
      ['archer', 1, 'electricite'],
    ]);
    expect(r.jets.at(-1)).toMatchObject({ quoi: 'sauvegarde de FOR (rebond)', cible: 'archer', reussi: true });
  });
});

describe('zones', () => {
  it('Rayon : un seul jet de dégâts pour toute la ligne ; chacun sa sauvegarde de DEX', () => {
    const r = lancer({ action: verbe('rayon'), zone: [ennemi('a'), ennemi('b')], alea: des([20, 3], [6, 4], [6, 4], [6, 1], [20, 19]) });
    expect(degats(r)).toEqual([
      ['a', 9, 'magique'],
      ['b', 4, 'magique'],
    ]);
  });

  it('Vortex (8b) : 100 % au centre, 75 % à une case, 50 % au-delà ; attiré sur une sauvegarde ratée', () => {
    const r = lancer({
      action: verbe('vortex'),
      zone: [ennemi('centre', { anneau: 0 }), ennemi('cote', { anneau: 1 }), ennemi('coin', { anneau: 2 })],
      alea: des([20, 1], [6, 3], [6, 3], [6, 2], [6, 2], [20, 1], [20, 1]),
    });
    expect(degats(r)).toEqual([
      ['centre', 10, 'magique'],
      ['cote', 7, 'magique'],
      ['coin', 5, 'magique'],
    ]);
    expect(r.changements.filter((c) => c.type === 'deplacement')).toHaveLength(3);
  });

  it('Nova : alliés compris dans la zone (validé), 6 PP', () => {
    const r = lancer({ action: verbe('nova'), zone: [ennemi('a'), allie('guerrier')], alea: des([20, 1], ...Array.from({ length: 6 }, () => [6, 1] as [number, number]), [20, 20]) });
    expect(degats(r)).toEqual([
      ['a', 6, 'magique'],
      ['guerrier', 3, 'magique'],
    ]);
    expect(r.cout.pp).toBe(6);
  });

  it('une zone filtrée sur les ennemis épargne les alliés', () => {
    const vortex = schemaAction.parse({ ...verbe('vortex'), zone: { ...verbe('vortex').zone, filtre: 'ennemis' } });
    const r = lancer({ action: vortex, zone: [ennemi('a'), allie('b')], alea: des([20, 1], [6, 1], [6, 1], [6, 1], [6, 1]) });
    expect(degats(r).map((d) => d[0])).toEqual(['a']);
  });
});

describe('maîtrise : échec d’école et dérapage d’élément', () => {
  it('école Initiée (6a) : +1 PP ; 1 à 4 au d20, les PP sont dépensés et rien ne se passe', () => {
    const rate = lancer({ action: verbe('missile'), ecole: 'initie', cibles: [ennemi('a')], alea: des([20, 4]) });
    expect(rate).toMatchObject({ issue: 'echecEcole', cout: { pp: 3 }, changements: [] });
    const passe = lancer({ action: verbe('missile'), ecole: 'initie', cibles: [ennemi('a')], alea: des([20, 5], [6, 2]) });
    expect(passe.issue).toBe('reussi');
    expect(degats(passe)).toEqual([['a', 2, 'magique']]);
  });

  it('élément Non maîtrisé (1b) : 1 à 10, le sort entier échoue, les PP sont dépensés et le dérapage frappe le lanceur', () => {
    const r = lancer({ action: verbe('missile'), element: { id: 'feu', maitrise: 'nonMaitrise' }, cibles: [ennemi('a')], alea: des([20, 10]) });
    expect(r).toMatchObject({ issue: 'derapage', cout: { pp: 2, pv: 0 } });
    expect(r.changements).toEqual([{ type: 'etat', cible: 'mage', etat: 'brulure', duree: { rounds: 2 } }]);
    const passe = lancer({ action: verbe('missile'), element: { id: 'feu', maitrise: 'nonMaitrise' }, cibles: [ennemi('a')], alea: des([20, 11], [6, 6]) });
    expect(passe.issue).toBe('reussi');
    expect(degats(passe)).toEqual([['a', 6, 'feu']]);
    expect(passe.changements).toContainEqual({ type: 'etat', cible: 'a', etat: 'brulure', duree: { rounds: 2 } });
  });

  it('une combinaison demande un premier élément Maître (lot L4.10 : tests dans regles-combinaisons.test.ts)', () => {
    const r = resoudreLancer({ action: verbe('missile'), palier: 'III', lanceur: mage, cibles: [ennemi('a')], element: { id: 'feu', maitrise: 'adepte' }, secondElement: { id: 'glace', maitrise: 'maitre' } }, cat);
    expect(r).toEqual({ ok: false, raison: 'une combinaison demande un premier élément Maître' });
  });
});

describe('sang (6a) : +1 dé payé en PV en plus des PP, la moitié du dé rendue', () => {
  it('Choc au sang : 3 PP et 3 PV, un d6 de plus, le lanceur récupère la moitié', () => {
    const r = lancer({ action: verbe('choc'), element: { id: 'sang', maitrise: 'adepte' }, cibles: [ennemi('a')], alea: des([20, 2], [6, 2], [6, 2], [6, 5]) });
    expect(r.cout).toEqual({ pp: 3, pv: 3 });
    expect(degats(r)).toEqual([['a', 9, 'sang']]);
    expect(r.changements).toContainEqual({ type: 'soin', cible: 'mage', montant: 2 });
  });

  it('dérapage du sang : coût en PV doublé, et le sort échoue', () => {
    const r = lancer({ action: verbe('choc'), element: { id: 'sang', maitrise: 'initie' }, cibles: [ennemi('a')], alea: des([20, 1]) });
    expect(r).toMatchObject({ issue: 'derapage', cout: { pp: 4, pv: 8 }, changements: [] });
  });
});

describe('états du lanceur et des cibles', () => {
  const trait: Action = schemaAction.parse({
    id: 'essai.trait',
    nom: 'Trait arcanique',
    description: 'Sort mineur d’essai.',
    nature: 'mineur',
    ecole: 'evocation',
    rang: 0,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 10 },
    resolution: { jet: 'attaqueMagique' },
    effets: [{ type: 'degats', des: '1d6', typeDegats: 'magique' }],
    element: { application: 'ciblePrincipale' },
  });

  it('sort mineur : attaque magique contre la DEF, 0 PP ; l’élément n’en donne que le type', () => {
    const r = lancer({ action: trait, element: { id: 'feu', maitrise: 'nonMaitrise' }, cibles: [ennemi('a')], alea: des([20, 9], [6, 3]) });
    expect(r.cout.pp).toBe(0);
    expect(r.jets[0]).toMatchObject({ quoi: 'attaque magique', total: 13, contre: 13, reussi: true });
    expect(degats(r)).toEqual([['a', 3, 'feu']]);
    expect(r.changements.some((c) => c.type === 'etat')).toBe(false);
  });

  it('raté : rien ; Exposé abaisse la DEF de la cible', () => {
    expect(degats(lancer({ action: trait, cibles: [ennemi('a')], alea: des([20, 8]) }))).toEqual([]);
    expect(degats(lancer({ action: trait, cibles: [ennemi('a', { etats: ['expose'] })], alea: des([20, 7], [6, 2]) }))).toEqual([['a', 2, 'magique']]);
  });

  it('désavantage (6a) : 2d20, le pire ; une cible Dissimulée l’impose, Aveuglé aussi ; les deux s’annulent avec un avantage', () => {
    const r = lancer({ action: trait, cibles: [ennemi('a', { etats: ['dissimule'] })], alea: des([20, 18], [20, 3]) });
    expect(r.jets[0]).toMatchObject({ des: [18, 3], total: 7, reussi: false });
  });

  it('lanceur Déséquilibré : désavantage, puis l’état tombe après son jet ; Dissimulé tombe quand il attaque', () => {
    const r = lancer({ action: trait, lanceur: { ...mage, etats: ['desequilibre', 'dissimule'] }, cibles: [ennemi('a')], alea: des([20, 15], [20, 12], [6, 1]) });
    expect(r.jets[0]).toMatchObject({ des: [15, 12], total: 16 });
    expect(r.changements).toContainEqual({ type: 'retraitEtat', cible: 'mage', etats: ['dissimule', 'desequilibre'], nombre: 2 });
  });

  it('lanceur Affaibli : ses dégâts perdent 25 %, jamais sous 1', () => {
    const r = lancer({ action: verbe('missile'), lanceur: { ...mage, etats: ['affaibli'] }, cibles: [ennemi('a'), ennemi('b')], palier: 'II', alea: des([6, 6], [6, 1]) });
    expect(degats(r)).toEqual([
      ['a', 4, 'magique'],
      ['b', 1, 'magique'],
    ]);
  });

  it('Halluciné : −2 aux sauvegardes de Volonté de la cible', () => {
    const r = lancer({ action: verbe('choc'), element: { id: 'psionique', maitrise: 'adepte' }, cibles: [ennemi('a', { etats: ['hallucine'], sauvegardes: { ...sauv, Volonte: 3 } })], alea: des([20, 11], [6, 1], [6, 1]) });
    expect(r.jets[0]).toMatchObject({ total: 12, reussi: false });
  });
});
