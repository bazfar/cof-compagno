import { describe, expect, it } from 'vitest';
import objets from '../../src/donnees/objets.json';
import { actionAuPalier } from '../../src/lib/effets/paliers';
import { profilMagique, verifierChoix, type ChoixDePersonnage } from '../../src/lib/effets/profil';
import { resoudreLancer, type ArmeEnJeu, type CibleEnJeu, type Lancer, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import { schemaAction, FAMILLES_ARME, type ActionSaisie } from '../../src/lib/schemas/effets';
import { actionParId, actionsCommunes, classeParId, elementParId, etatParId, invocationParId, referencesManquantes, voieParId } from '../../src/regles';
import { FAMILLE_DES_ARMES } from '../../src/regles/armes';

/*
 * Le Guerrier de la refonte (lot L4.7) et les attaques d'arme : Endurance,
 * attaques spéciales, critique, réactions, postures, voies. Doc « Refonte
 * classes et magie — cadre » et décisions de Thomas du 21/10/2026.
 */

const guerrier = classeParId.get('guerrier')!;
const pretre = classeParId.get('pretre')!;
const regles = { voies: voieParId, actions: actionParId, actionsCommunes };
const cat = { etats: etatParId, elements: elementParId };
const des =
  (...suite: [number, number][]) =>
  () => {
    const s = suite.shift();
    if (!s) throw new Error('plus de dés prévus');
    return (s[1] - 0.5) / s[0];
  };
const sauv = { FOR: 0, DEX: 0, CON: 0, Volonte: 0 };
const lanceur: LanceurEnJeu = { id: 'brann', camp: 'pj', def: 16, sauvegardes: sauv, etats: [], modMagie: 0, attaqueMagique: 0, niveau: 6, mods: { FOR: 3, DEX: 1, CON: 2 }, pv: 40, pvMax: 50 };
const epee: ArmeEnJeu = { id: 'epee_longue', famille: 'tranchantLourd', des: '1d8', attaque: 5, degats: 3, modCarac: 3 };
const masse: ArmeEnJeu = { id: 'masse', famille: 'contondant', des: '1d6', attaque: 4, degats: 2 };
const ennemi = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ id, camp: 'ennemi', def: 12, sauvegardes: sauv, etats: [], distance: 1, ...patch });
const allie = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ ...ennemi(id), camp: 'pj', ...patch });
const a = (id: string) => actionParId.get(id)!;
const endurance = { familles: 'toutes', cout: { ressource: 'endurance', montant: 2 } } as const;
const essai = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => resoudreLancer({ palier: 'I', lanceur, cibles: [ennemi('a')], arme: epee, attaquesSpeciales: endurance, alea: des(), ...l }, cat);
const lancer = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => {
  const r = essai(l);
  if (!r.ok) throw new Error(r.raison);
  return r;
};
const refus = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => {
  const r = essai(l);
  if (r.ok) throw new Error('refus attendu');
  return r.raison;
};

describe('la classe', () => {
  it('physique, d10, sans PP ; Endurance 3 + niveau / 3, repos court, +1 sur dégâts subis ; attaques spéciales de toutes les familles à 2 Endurance', () => {
    expect(guerrier).toMatchObject({
      famille: 'physique',
      deVie: 10,
      ressourceDeClasse: { ressource: 'endurance', base: 3, diviseurNiveau: 3, recharge: 'reposCourt', parDegatsSubis: 1 },
      attaquesSpeciales: { familles: 'toutes', cout: { ressource: 'endurance', montant: 2 } },
    });
    expect(guerrier.reservePP).toBeUndefined();
    expect(guerrier.voies).toEqual(['guerrier.soldat', 'guerrier.peuple', 'guerrier.maitre-d-armes', 'guerrier.ingenieur']);
    expect(referencesManquantes()).toEqual([]);
  });

  it('chaque arme du catalogue a sa famille (1a), et rien d’autre', () => {
    const armes = (objets as { objets: { id: string; type: string }[] }).objets.filter((o) => o.type === 'arme').map((o) => o.id);
    expect(armes.filter((id) => !FAMILLE_DES_ARMES[id])).toEqual([]);
    expect(Object.keys(FAMILLE_DES_ARMES).sort()).toEqual([...armes].sort());
    expect([FAMILLE_DES_ARMES.hallebarde, FAMILLE_DES_ARMES.epee_longue, FAMILLE_DES_ARMES.rapiere, FAMILLE_DES_ARMES.fronde]).toEqual(['tranchantLourd', 'tranchantLourd', 'perforant', 'contondant']);
  });

  it('une attaque spéciale par famille, avec son état d’un round (doc de cadre) ; Carreau lourd repousse d’une case (9a)', () => {
    const speciales = [...actionParId.values()].filter((x) => x.famille);
    expect(speciales.map((x) => x.famille).sort()).toEqual([...FAMILLES_ARME].sort());
    const etat = (id: string) => a(id).effets.find((e) => e.type === 'etat');
    expect(
      Object.fromEntries(
        ['coup-assommant', 'fendre', 'entaille', 'coup-d-estoc', 'coup-bas', 'coup-de-bouclier', 'tir-epinglant', 'frappe-nerveuse'].map((id) => [id, etat(`arme.${id}`)]),
      ),
    ).toEqual({
      'coup-assommant': expect.objectContaining({ etat: 'etourdi', duree: { rounds: 1 } }),
      fendre: expect.objectContaining({ etat: 'expose', duree: { rounds: 1 } }),
      entaille: expect.objectContaining({ etat: 'saignement', duree: { rounds: 1 } }),
      'coup-d-estoc': expect.objectContaining({ etat: 'desequilibre', duree: { rounds: 1 } }),
      'coup-bas': expect.objectContaining({ etat: 'affaibli', duree: { rounds: 1 } }),
      'coup-de-bouclier': expect.objectContaining({ etat: 'renverse', duree: { rounds: 1 } }),
      'tir-epinglant': expect.objectContaining({ etat: 'immobilise', duree: { rounds: 1 } }),
      'frappe-nerveuse': expect.objectContaining({ etat: 'ralenti', duree: { rounds: 1 } }),
    });
    expect(a('arme.carreau-lourd').effets[1]).toMatchObject({ type: 'deplacement', sens: 'repousse', cases: 1 });
    for (const x of speciales) expect(x).toMatchObject({ nature: 'technique', action: 'action', resolution: { jet: 'attaque' } });
  });
});

describe('attaque d’arme et critique (4a)', () => {
  it('d20 + bonus d’attaque de l’arme contre la DEF ; dés de l’arme + son bonus de dégâts', () => {
    const r = lancer({ action: a('arme.attaque'), alea: des([20, 7], [8, 6]) });
    expect(r.jets[0]).toMatchObject({ quoi: 'attaque', total: 12, contre: 12, reussi: true });
    expect(r.changements).toEqual([{ type: 'degats', cible: 'a', montant: 9, typeDegats: 'physique', calcul: '9 (6)' }]);
    expect(r.cout).toEqual({ pp: 0, pv: 0 });
  });

  it('raté : rien', () => {
    expect(lancer({ action: a('arme.attaque'), alea: des([20, 6]) }).changements).toEqual([]);
  });

  it('20 naturel : touche toujours, dés de l’arme doublés, bonus une fois', () => {
    const r = lancer({ action: a('arme.attaque'), cibles: [ennemi('a', { def: 30 })], alea: des([20, 20], [8, 3], [8, 4]) });
    expect(r.jets[0]).toMatchObject({ reussi: true, critique: true });
    expect(r.changements[0]).toMatchObject({ montant: 10 });
  });

  it('19 naturel : critique seulement avec Précision létale (Maître d’armes 3)', () => {
    expect(lancer({ action: a('arme.attaque'), cibles: [ennemi('a', { def: 30 })], alea: des([20, 19]) }).changements).toEqual([]);
    const r = lancer({ action: a('arme.attaque'), voie: { maitreDArmes: { rang: 3 } }, cibles: [ennemi('a', { def: 30 })], alea: des([20, 19], [8, 1], [8, 2]) });
    expect(r.changements[0]).toMatchObject({ montant: 6 });
  });

  it('sans arme, refusé ; l’attaque d’opportunité arrête le déplacement si elle touche', () => {
    expect(refus({ action: a('arme.attaque'), arme: undefined })).toBe('Attaque demande une arme');
    expect(a('arme.opportunite')).toMatchObject({ nature: 'reaction', action: 'reaction', declencheur: 'ennemiQuitteContact' });
    expect(lancer({ action: a('arme.opportunite'), alea: des([20, 10], [8, 2]) }).changements).toEqual([
      { type: 'degats', cible: 'a', montant: 5, typeDegats: 'physique', calcul: '5 (2)' },
      { type: 'narratif', cible: 'a', texte: 'Son déplacement s’arrête là.' },
    ]);
  });
});

describe('attaques spéciales', () => {
  it('2 Endurance ; l’état est posé d’office si le coup touche (2a), pour 1 round', () => {
    const r = lancer({ action: a('arme.coup-assommant'), arme: masse, alea: des([20, 10], [6, 4]) });
    expect(r.cout).toEqual({ pp: 0, pv: 0, ressources: { endurance: 2 } });
    expect(r.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 6, typeDegats: 'physique', calcul: '6 (4)' },
      { type: 'etat', cible: 'a', etat: 'etourdi', duree: { rounds: 1 } },
    ]);
    expect(lancer({ action: a('arme.coup-assommant'), arme: masse, alea: des([20, 2]) }).changements).toEqual([]);
  });

  it('il faut une arme de la famille, et une classe qui y a droit', () => {
    expect(refus({ action: a('arme.coup-assommant') })).toBe('Coup assommant demande une arme de la famille contondant');
    expect(refus({ action: a('arme.fendre'), attaquesSpeciales: undefined })).toBe('ce personnage n’a pas d’attaque spéciale');
    expect(refus({ action: a('arme.fendre'), attaquesSpeciales: { familles: ['contondant'], cout: 'unParCombat' } })).toBe('Fendre n’est pas une attaque spéciale de sa classe');
  });

  it('hybride (3c) : sa famille, une fois par combat, sans coût', () => {
    const r = lancer({ action: a('arme.coup-assommant'), arme: masse, attaquesSpeciales: { familles: ['contondant'], cout: 'unParCombat' }, alea: des([20, 10], [6, 4]) });
    expect(r.cout).toEqual({ pp: 0, pv: 0, attaqueSpecialeDuCombat: true });
  });

  it('Coup d’estoc : Déséquilibré, ou repoussé d’une case (9a)', () => {
    const lance: ArmeEnJeu = { ...epee, id: 'lance', famille: 'perforant' };
    expect(lancer({ action: a('arme.coup-d-estoc'), arme: lance, variante: 'repousser', alea: des([20, 10], [8, 1]) }).changements[1]).toEqual({ type: 'deplacement', cible: 'a', sens: 'repousse', cases: 1 });
    expect(lancer({ action: a('arme.coup-d-estoc'), arme: lance, alea: des([20, 10], [8, 1]) }).changements[1]).toMatchObject({ etat: 'desequilibre' });
  });

  it('Précision létale (3) : l’état dure 2 rounds', () => {
    expect(lancer({ action: a('arme.fendre'), voie: { maitreDArmes: { rang: 3 } }, alea: des([20, 10], [8, 1]) }).changements[1]).toEqual({ type: 'etat', cible: 'a', etat: 'expose', duree: { rounds: 2 } });
  });

  it('Coup double (4, 10a) : touché, une seconde peut suivre ; pas une troisième ; raté, rien', () => {
    expect(lancer({ action: a('arme.fendre'), voie: { maitreDArmes: { rang: 4 } }, alea: des([20, 10], [8, 1]) }).coupDouble).toBe(true);
    expect(lancer({ action: a('arme.fendre'), voie: { maitreDArmes: { rang: 4, secondeDuCoupDouble: true } }, alea: des([20, 10], [8, 1]) }).coupDouble).toBeUndefined();
    expect(lancer({ action: a('arme.fendre'), voie: { maitreDArmes: { rang: 4 } }, alea: des([20, 2]) }).coupDouble).toBeUndefined();
    expect(lancer({ action: a('arme.attaque'), voie: { maitreDArmes: { rang: 4 } }, alea: des([20, 10], [8, 1]) }).coupDouble).toBeUndefined();
  });

  it('Coup de maître (5) : un second état, ou l’arme et un élément ; seulement sur une attaque spéciale, au rang 5', () => {
    const deuxEtats = lancer({ action: a('arme.fendre'), voie: { maitreDArmes: { rang: 5, coupDeMaitre: { etat: 'renverse' } } }, alea: des([20, 10], [8, 1]) });
    expect(deuxEtats.changements.slice(1)).toEqual([
      { type: 'etat', cible: 'a', etat: 'expose', duree: { rounds: 2 } },
      { type: 'etat', cible: 'a', etat: 'renverse', duree: { rounds: 2 } },
    ]);
    const feu = lancer({ action: a('arme.fendre'), voie: { maitreDArmes: { rang: 5, coupDeMaitre: { element: 'feu' } } }, alea: des([20, 10], [8, 1]) });
    expect(feu.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 4, typeDegats: 'feu', calcul: '4 (1)' },
      { type: 'etat', cible: 'a', etat: 'expose', duree: { rounds: 2 } },
      { type: 'etat', cible: 'a', etat: 'brulure', duree: { rounds: 2 } },
    ]);
    // Terre : la cible sauve en FOR contre 10 + le mod de la caractéristique de l'arme.
    const terre = lancer({ action: a('arme.fendre'), voie: { maitreDArmes: { rang: 5, coupDeMaitre: { element: 'terre' } } }, alea: des([20, 10], [8, 1], [20, 5]) });
    expect(terre.dd).toBe(13);
    expect(terre.changements.at(-1)).toEqual({ type: 'etat', cible: 'a', etat: 'renverse', duree: { rounds: 1 } });
    expect(refus({ action: a('arme.attaque'), voie: { maitreDArmes: { rang: 5, coupDeMaitre: { etat: 'renverse' } } } })).toBe('le Coup de maître porte une attaque spéciale');
    expect(refus({ action: a('arme.fendre'), voie: { maitreDArmes: { rang: 4, coupDeMaitre: { etat: 'renverse' } } } })).toBe('le Coup de maître vient au rang 5 de la Voie du maître d’armes');
  });
});

describe('profil', () => {
  const choix = (c: Partial<ChoixDePersonnage>): ChoixDePersonnage => ({ niveau: 6, modMagie: 0, rangs: {}, mineurs: [], ...c });

  it('Endurance 3 + 6 / 3 = 5 ; attaques communes et les neuf spéciales ; Maniement expert : 1 Endurance ; Spécimen d’élite', () => {
    const c = choix({ rangs: { 'guerrier.soldat': 3, 'guerrier.maitre-d-armes': 2 }, caracEnPlus: 'FOR' });
    expect(verifierChoix(guerrier, c, regles)).toEqual([]);
    const p = profilMagique(guerrier, c, regles);
    expect(p).toMatchObject({ reservePP: 0, ressourceDeClasse: { ressource: 'endurance', max: 5 }, caracs: { FOR: 1 }, voie: { soldat: { rang: 3 }, maitreDArmes: { rang: 2 } } });
    expect(p.attaquesSpeciales).toEqual({ familles: 'toutes', cout: { ressource: 'endurance', montant: 1 } });
    expect(p.attaques.slice(0, 2)).toEqual(['arme.attaque', 'arme.opportunite']);
    expect(p.attaques).toHaveLength(11);
    expect(p.actions).toEqual(['guerrier.posture-de-combat', 'guerrier.combat-en-phalange', 'guerrier.second-souffle']);
  });

  it('Spécimen d’élite : la caractéristique est à choisir parmi FOR, DEX, CON ; pas avant le rang 2', () => {
    expect(verifierChoix(guerrier, choix({ rangs: { 'guerrier.maitre-d-armes': 2 } }), regles)).toEqual(['Choisis la caractéristique qui gagne +1 : FOR, DEX, CON.']);
    expect(verifierChoix(guerrier, choix({ rangs: { 'guerrier.maitre-d-armes': 2 }, caracEnPlus: 'SAG' }), regles)).toHaveLength(1);
    expect(verifierChoix(guerrier, choix({ rangs: { 'guerrier.maitre-d-armes': 1 }, caracEnPlus: 'FOR' }), regles)).toEqual(['Une caractéristique gagne un point avec la voie qui le donne.']);
  });

  it('Prêtre : l’attaque spéciale contondante seulement, une fois par combat', () => {
    const p = profilMagique(pretre, choix({ modMagie: 3, rangs: { 'pretre.guerison': 1 } }), regles);
    expect(p.attaquesSpeciales).toEqual({ familles: ['contondant'], cout: 'unParCombat' });
    expect(p.attaques).toEqual(['arme.attaque', 'arme.opportunite', 'arme.coup-assommant']);
    expect(p.ressourceDeClasse).toBeNull();
  });
});

describe('Voie du soldat', () => {
  const posture = (valeur: number, patch: Partial<Lancer> = {}) => ({ action: a('guerrier.posture-de-combat'), cibles: [], voie: { soldat: { rang: 2 } }, posture: { plus: 'attaque' as const, moins: 'DEF' as const, valeur }, ...patch });

  it('Posture de combat : jusqu’au rang en malus, autant en bonus, jusqu’au prochain tour (v1)', () => {
    expect(lancer(posture(2)).changements).toEqual([
      { type: 'bonus', cible: 'brann', sur: 'attaque', valeur: 2, duree: 'prochainTour' },
      { type: 'bonus', cible: 'brann', sur: 'DEF', valeur: -2, duree: 'prochainTour' },
    ]);
    expect(refus(posture(3))).toBe('posture de 1 à 2');
    expect(refus(posture(1, { posture: { plus: 'DEF', moins: 'DEF', valeur: 1 } }))).toBe('une posture prend deux axes différents');
    expect(refus(posture(1, { posture: undefined }))).toBe('choisis la posture : un axe en bonus, un autre en malus, et la valeur');
    expect(refus(posture(1, { voie: {} }))).toBe('posture de 1 à 0');
  });

  it('Maîtrise tactique : 2 rounds, 1x/combat ; sous son effet la posture va jusqu’au double ; changement de posture en réaction, 1x/round', () => {
    expect(lancer({ action: a('guerrier.maitrise-tactique'), cibles: [] }).changements).toEqual([{ type: 'etat', cible: 'brann', etat: 'maitrise_tactique', duree: { rounds: 2 } }]);
    expect(a('guerrier.maitrise-tactique').limite).toBe('1x/combat');
    expect(lancer(posture(4, { lanceur: { ...lanceur, etats: ['maitrise_tactique'] } })).changements[0]).toMatchObject({ valeur: 4 });
    expect(a('guerrier.changement-de-posture')).toMatchObject({ action: 'reaction', limite: '1x/round', declencheur: 'aToutMoment' });
    expect(lancer(posture(1, { action: a('guerrier.changement-de-posture'), posture: { plus: 'degats', moins: 'attaque', valeur: 1 } })).changements[0]).toMatchObject({ sur: 'degats', valeur: 1 });
  });

  it('Combat en phalange : +1 DEF par allié au contact', () => {
    expect(lancer({ action: a('guerrier.combat-en-phalange'), cibles: [] }).changements).toEqual([{ type: 'bonus', cible: 'brann', sur: 'DEF', valeur: 1, duree: 'permanente', parAllieAuContact: true }]);
  });

  it('Second souffle (7a) : 1x/combat, action mineure, 2d6 + mod de CON en PV, +2 Endurance', () => {
    expect(a('guerrier.second-souffle')).toMatchObject({ action: 'mineure', limite: '1x/combat' });
    expect(lancer({ action: a('guerrier.second-souffle'), cibles: [], alea: des([6, 3], [6, 4]) }).changements).toEqual([
      { type: 'soin', cible: 'brann', montant: 9 },
      { type: 'ressource', cible: 'brann', ressource: 'endurance', montant: 2 },
    ]);
    expect(refus({ action: a('guerrier.second-souffle'), cibles: [], lanceur: { ...lanceur, mods: {} } })).toBe('il faut le mod de CON du lanceur');
  });

  it('Prouesse : 1d4 PV sacrifiés pour +5 au prochain test, 1x/round', () => {
    const r = lancer({ action: a('guerrier.prouesse'), cibles: [], alea: des([4, 3]) });
    expect(r.cout).toEqual({ pp: 0, pv: 3 });
    expect(r.changements).toEqual([{ type: 'bonus', cible: 'brann', sur: 'prochainJet', valeur: 5, duree: 'prochainTour' }]);
  });
});

describe('Voie du peuple', () => {
  it('Riposte (Fils du village) : réaction gratuite quand un ennemi attaque un allié au contact, à l’attaque normale (5a)', () => {
    expect(a('guerrier.riposte')).toMatchObject({ nature: 'reaction', declencheur: 'allieAttaqueAuContact' });
    const r = lancer({ action: a('guerrier.riposte'), alea: des([20, 10], [8, 5]) });
    expect(r.cout).toEqual({ pp: 0, pv: 0 });
    expect(r.changements).toEqual([{ type: 'degats', cible: 'a', montant: 8, typeDegats: 'physique', calcul: '8 (5)' }]);
  });

  it('L’exemple : immobile, +1 DEF aux alliés à 2 cases ; sinon rien', () => {
    const zone = [allie('b', { distance: 2 })];
    expect(lancer({ action: a('guerrier.l-exemple'), cibles: [], zone, immobile: true }).changements).toEqual([{ type: 'bonus', cible: 'b', sur: 'DEF', valeur: 1, duree: 'prochainTour' }]);
    expect(lancer({ action: a('guerrier.l-exemple'), cibles: [], zone }).changements).toEqual([]);
  });

  it('Pilier du village : −2 aux dégâts subis quand il protège un allié', () => {
    expect(lancer({ action: a('guerrier.pilier-du-village'), cibles: [], protegeUnAllie: true }).changements).toEqual([{ type: 'bonus', cible: 'brann', sur: 'reductionDegats', valeur: 2, duree: 'permanente' }]);
    expect(lancer({ action: a('guerrier.pilier-du-village'), cibles: [] }).changements).toEqual([]);
  });

  it('Cri du rassemblement : 7 cases, un jet de 1d6 + CON en PV temporaires, +2 en attaque 2 rounds', () => {
    const r = lancer({ action: a('guerrier.cri-du-rassemblement'), cibles: [], zone: [allie('b'), allie('c')], alea: des([6, 4]) });
    expect(r.changements).toEqual([
      { type: 'pvTemp', cible: 'b', montant: 6 },
      { type: 'pvTemp', cible: 'c', montant: 6 },
      { type: 'bonus', cible: 'b', sur: 'attaque', valeur: 2, duree: { rounds: 2 } },
      { type: 'bonus', cible: 'c', sur: 'attaque', valeur: 2, duree: { rounds: 2 } },
    ]);
    expect(a('guerrier.cri-du-rassemblement')).toMatchObject({ limite: '1x/combat', zone: { forme: 'cercle', taille: 7, filtre: 'allies' } });
  });

  it('Le héros qu’on n’oublie pas : 1x/scénario, il prend le coup ; −4 à tous ses tests jusqu’à la fin du combat', () => {
    expect(a('guerrier.heros-qu-on-n-oublie-pas')).toMatchObject({ limite: '1x/scenario', declencheur: 'allieTombe', ciblage: { portee: 2 } });
    expect(lancer({ action: a('guerrier.heros-qu-on-n-oublie-pas'), cibles: [allie('b')] }).changements[1]).toEqual({ type: 'bonus', cible: 'brann', sur: 'tests', valeur: -4, duree: 'finCombat' });
  });
});

describe('Voie de l’ingénieur (8a)', () => {
  it('Piège de fortune : action mineure ; qui y finit son déplacement, DEX contre sa DEF ; touché, 1d6 et Ralenti 3 rounds', () => {
    expect(a('guerrier.piege-de-fortune')).toMatchObject({ action: 'mineure', persistance: { quand: 'finDeplacement', duree: 'finCombat' } });
    const r = lancer({ action: a('guerrier.piege-de-fortune'), arme: undefined, cibles: [], zone: [ennemi('a')], alea: des([20, 11], [6, 5]) });
    expect(r.jets[0]).toMatchObject({ quoi: 'attaque', total: 12, contre: 12, reussi: true });
    expect(r.changements.slice(0, 2)).toEqual([
      { type: 'degats', cible: 'a', montant: 5, typeDegats: 'physique', calcul: '5 (5)' },
      { type: 'etat', cible: 'a', etat: 'ralenti', duree: { rounds: 3 } },
    ]);
    // Un 20 naturel n'est pas un critique sans arme.
    expect(lancer({ action: a('guerrier.piege-de-fortune'), cibles: [], zone: [ennemi('a', { def: 30 })], alea: des([20, 20]) }).changements.some((c) => c.type === 'degats')).toBe(false);
  });

  it('Terrain favorable, Fortification de fortune (barricade : 10 + niveau PV, objet, abri +4/+2), Champ de pièges (3 pièges de 2d6)', () => {
    expect(lancer({ action: a('guerrier.terrain-favorable'), cibles: [] }).changements[0]).toEqual({ type: 'terrain', nature: 'difficile', duree: { rounds: 3 } });
    expect(lancer({ action: a('guerrier.fortification-de-fortune'), cibles: [] }).changements).toEqual([{ type: 'invocation', creature: 'barricade', nombre: 1, duree: 'finCombat' }]);
    expect(invocationParId.get('barricade')).toMatchObject({ pv: { base: 10, parNiveau: 1 }, def: { objet: true }, deplacement: 0, attaque: null });
    expect(invocationParId.get('barricade')!.capacites[0]!.effets.map((e) => e.type === 'bonus' && [e.cible, e.valeur])).toEqual([
      ['DEFDistance', 4],
      ['DEFContact', 2],
    ]);
    expect(a('guerrier.champ-de-pieges')).toMatchObject({ ciblage: { nbCibles: 3 }, effets: [{ des: '2d6' }, { etat: 'ralenti' }, { type: 'narratif' }] });
  });

  it('Bastion improvisé : 1x/combat, 3 × 3 cases, +2 DEF aux alliés dedans', () => {
    expect(a('guerrier.bastion-improvise')).toMatchObject({ limite: '1x/combat', zone: { forme: 'carre', taille: 3, filtre: 'allies' }, persistance: { duree: 'finCombat' } });
    expect(lancer({ action: a('guerrier.bastion-improvise'), cibles: [], zone: [allie('b')] }).changements[0]).toEqual({ type: 'bonus', cible: 'b', sur: 'DEF', valeur: 2, duree: 'prochainTour' });
  });
});

describe('Prêtre : Frappe sacrée (11a)', () => {
  it('attaque d’arme + 1d6 sacrés, 2 PP ; 2d6 au palier III ; un critique ne double que les dés de l’arme', () => {
    const r = lancer({ action: a('pretre.frappe-sacree'), arme: masse, alea: des([20, 10], [6, 3], [6, 4]) });
    expect(r.cout).toEqual({ pp: 2, pv: 0 });
    expect(r.changements.map((c) => c.type === 'degats' && [c.montant, c.typeDegats])).toEqual([
      [5, 'physique'],
      [4, 'sacre'],
    ]);
    expect(actionAuPalier(a('pretre.frappe-sacree'), 'III').effets[1]).toMatchObject({ des: '2d6' });
    const crit = lancer({ action: a('pretre.frappe-sacree'), palier: 'III', arme: masse, alea: des([20, 20], [6, 1], [6, 1], [6, 2], [6, 2]) });
    expect(crit.changements.map((c) => c.type === 'degats' && c.montant)).toEqual([4, 4]);
  });
});

describe('garde-fous du schéma (lot L4.7)', () => {
  const base: ActionSaisie = { id: 'x', nom: 'X', description: 'x', nature: 'technique', rang: 1, etiquettes: ['combat'], action: 'action', ciblage: { type: 'creature', portee: 'arme' }, resolution: { jet: 'attaque' }, effets: [{ type: 'degats', des: 'arme', typeDegats: 'physique' }] };
  it('les dés de l’arme demandent une attaque à l’arme ; une attaque spéciale est une technique sans coût propre ; un seul mod', () => {
    expect(schemaAction.safeParse(base).success).toBe(true);
    expect(schemaAction.safeParse({ ...base, resolution: { jet: 'aucun' } }).success).toBe(false);
    expect(schemaAction.safeParse({ ...base, attaquePar: 'DEX' }).success).toBe(false);
    expect(schemaAction.safeParse({ ...base, famille: 'dague', cout: [{ ressource: 'endurance', montant: 2 }] }).success).toBe(false);
    expect(schemaAction.safeParse({ ...base, famille: 'dague', nature: 'capacite' }).success).toBe(false);
    expect(schemaAction.safeParse({ ...base, effets: [{ type: 'soin', des: '1d6', plusMod: true, mod: 'CON' }] }).success).toBe(false);
  });
});
