import { describe, expect, it } from 'vitest';
import { actionAuPalier, variantesAuPalier } from '../../src/lib/effets/paliers';
import { profilMagique, verifierChoix, type ChoixDePersonnage } from '../../src/lib/effets/profil';
import { resoudreLancer, type CibleEnJeu, type Lancer, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import { actionParId, classeParId, elementParId, etatParId, referencesManquantes, verbesDeLEcole, voieParId } from '../../src/regles';

/*
 * Le Prêtre de la refonte (lot L4.6) : quatre Cercles, réserve de Sacré et
 * boosts, sorts mineurs. Doc « Refonte classes et magie — cadre ».
 */

const pretre = classeParId.get('pretre')!;
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
const lanceur: LanceurEnJeu = { id: 'hermione', camp: 'pj', def: 14, sauvegardes: sauv, etats: [], modMagie: 3, attaqueMagique: 4, niveau: 4 };
const ennemi = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ id, camp: 'ennemi', def: 12, sauvegardes: sauv, etats: [], distance: 3, ...patch });
const allie = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ ...ennemi(id), camp: 'pj', ...patch });
const a = (id: string) => actionParId.get(id)!;
const lancer = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => {
  const r = resoudreLancer({ palier: 'I', lanceur, cibles: [ennemi('a')], alea: des(), ...l }, cat);
  if (!r.ok) throw new Error(r.raison);
  return r;
};

describe('la classe', () => {
  it('hybride, d8, SAG ; PP réduits (4 + 2 × niveau + mod) ; Sacré = 2 + niveau / 3 ; pas de choix à la création', () => {
    expect(pretre).toMatchObject({ famille: 'hybride', deVie: 8, caracMagie: 'SAG', reservePP: { base: 4, parNiveau: 2, parMod: 1 }, reserveSacre: { base: 2, diviseurNiveau: 3 } });
    expect(pretre.creation).toEqual({ ecoles: [], elements: null, elementsSecond: [], maitriseElementDepart: 'adepte' });
    expect(pretre.mineurs).toMatchObject({ creation: 1, plusUnAuNiveau: [7] });
    expect(referencesManquantes()).toEqual([]);
  });

  it('quatre Cercles de cinq verbes, chacun sa voie', () => {
    for (const c of ['guerison', 'foi', 'bannissement', 'jugement']) {
      expect(verbesDeLEcole(c).map((v) => v.rang)).toEqual([1, 2, 3, 4, 5]);
      expect(pretre.voies).toContain(`pretre.${c}`);
    }
  });

  it('Vêtements sacrés (9b) : + mod de SAG en DEF, sans armure', () => {
    expect(lancer({ action: a('pretre.vetements-sacres'), cibles: [] }).changements[0]).toEqual({ type: 'bonus', cible: 'hermione', sur: 'DEF', valeur: 3, duree: 'permanente' });
  });

  it('profil : la voie ouvre son Cercle avec ses paliers ; Sacré et Vêtements sacrés', () => {
    const c: ChoixDePersonnage = { niveau: 6, modMagie: 3, rangs: { 'pretre.guerison': 3, 'pretre.jugement': 2 }, mineurs: ['mineur.stabiliser'] };
    expect(verifierChoix(pretre, c, regles)).toEqual([]);
    const p = profilMagique(pretre, c, regles);
    expect(p).toMatchObject({ reservePP: 19, reserveSacre: 4, maitriseEcole: 'adepte', mineursMax: 1, actions: ['pretre.vetements-sacres', 'pretre.frappe-sacree'] });
    // Frappe sacrée (lot L4.7) : ses paliers suivent le Cercle le plus avancé.
    expect(p.paliersDActions).toEqual({ 'pretre.frappe-sacree': 'II' });
    expect(p.verbes).toEqual([
      { id: 'guerison.imposition', palier: 'II' },
      { id: 'guerison.chaine-de-vie', palier: 'I' },
      { id: 'guerison.purification', palier: 'I' },
      { id: 'jugement.oeil-de-l-inquisiteur', palier: 'I' },
      { id: 'jugement.chatiment', palier: 'I' },
    ]);
  });
});

describe('Guérison', () => {
  it('Imposition : 1d8 + mod au contact ; II à 6 cases ; III deux cibles', () => {
    expect(lancer({ action: a('guerison.imposition'), cibles: [allie('g')], alea: des([8, 5]) }).changements).toEqual([{ type: 'soin', cible: 'g', montant: 8 }]);
    expect(actionAuPalier(a('guerison.imposition'), 'III').ciblage).toMatchObject({ portee: 6, nbCibles: 2 });
  });

  it('Chaîne de vie : un jet, entier sur le premier, moitié sur le suivant ; II un troisième', () => {
    const r = lancer({ action: a('guerison.chaine-de-vie'), palier: 'II', cibles: [allie('a'), allie('b'), allie('c')], alea: des([6, 4]) });
    expect(r.changements).toEqual([
      { type: 'soin', cible: 'a', montant: 7 },
      { type: 'soin', cible: 'b', montant: 3 },
      { type: 'soin', cible: 'c', montant: 3 },
    ]);
  });

  it('Purification : retire poison, saignement ou brûlure et +1d6 ; Protection contre la mort : reste à 1 PV', () => {
    expect(lancer({ action: a('guerison.purification'), cibles: [allie('a')], alea: des([6, 2]) }).changements).toEqual([
      { type: 'retraitEtat', cible: 'a', etats: ['empoisonne', 'saignement', 'brulure'], nombre: 1 },
      { type: 'soin', cible: 'a', montant: 2 },
    ]);
    expect(a('guerison.protection-contre-la-mort')).toMatchObject({ action: 'reaction', declencheur: 'allieTombe', limite: '1x/combat', effets: [{ type: 'plancherPv', valeur: 1 }] });
  });

  it('Guérison de masse : alliés à 6 cases, 2d8 + mod, un seul jet', () => {
    const r = lancer({ action: a('guerison.guerison-de-masse'), zone: [allie('a'), allie('b'), ennemi('x')], alea: des([8, 3], [8, 4]) });
    expect(r.changements).toEqual([
      { type: 'soin', cible: 'a', montant: 10 },
      { type: 'soin', cible: 'b', montant: 10 },
    ]);
  });
});

describe('Foi', () => {
  it('Mot de commandement : 1 round, Volonté, pas les boss ; III 2 rounds', () => {
    expect(lancer({ action: a('foi.mot-de-commandement'), alea: des([20, 3]) }).changements).toEqual([{ type: 'etat', cible: 'a', etat: 'commande', duree: { rounds: 1 } }]);
    expect(actionAuPalier(a('foi.mot-de-commandement'), 'III').effets[0]).toMatchObject({ duree: { rounds: 2 }, saufBoss: true });
  });

  it('Calme les esprits : retire Effroi ou Charme, ou (variante) une cible n’attaque pas 1 round', () => {
    const c = a('foi.calme-les-esprits');
    expect(variantesAuPalier(c, 'I').map((v) => v.id)).toEqual(['apaiser']);
    expect(variantesAuPalier(c, 'II').map((v) => v.id)).toEqual(['apaiser']);
    const ii = actionAuPalier(c, 'II', 'apaiser');
    expect(ii).toMatchObject({ ciblage: { camp: 'ennemi' }, resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte' }, zone: { taille: 1 } });
    expect(ii.effets).toEqual([{ type: 'etat', etat: 'apaise', duree: { rounds: 1 }, vise: 'zone' }]);
    expect(lancer({ action: c, variante: 'apaiser', alea: des([20, 2]) }).changements).toEqual([{ type: 'etat', cible: 'a', etat: 'apaise', duree: { rounds: 1 } }]);
  });

  it('Aura divine : alliés à 2 cases, +2 DEF et sauvegardes 3 rounds, 1x/combat', () => {
    expect(a('foi.aura-divine')).toMatchObject({ limite: '1x/combat', zone: { filtre: 'allies', taille: 2 } });
  });
});

describe('Bannissement', () => {
  it('Flamme sacrée : double contre démons et morts-vivants', () => {
    const r = lancer({ action: a('bannissement.flamme-sacree'), cibles: [ennemi('goule', { demonOuMortVivant: true })], alea: des([20, 2], [8, 5]) });
    expect(r.changements).toEqual([{ type: 'degats', cible: 'goule', montant: 10, typeDegats: 'sacre', calcul: '5 (5), démon ou mort-vivant ×2' }]);
  });

  it('Rite de bannissement : ne prend que sur un démon ou un mort-vivant', () => {
    expect(lancer({ action: a('bannissement.rite-de-bannissement'), alea: des([20, 2]) }).changements).toEqual([]);
    expect(lancer({ action: a('bannissement.rite-de-bannissement'), cibles: [ennemi('d', { demonOuMortVivant: true })], alea: des([20, 2]) }).changements).toHaveLength(1);
  });

  it('Bannissement : un démon sous 5 × niveau PV est renvoyé à la Mer, sinon 6d6 ; un D5 prend toujours les 6d6', () => {
    const six = (): [number, number][] => Array.from({ length: 6 }, () => [6, 2] as [number, number]);
    expect(lancer({ action: a('bannissement.bannissement'), cibles: [ennemi('d', { demonOuMortVivant: true, pv: 20 })] }).changements).toEqual([
      { type: 'etat', cible: 'd', etat: 'banni', duree: 'finCombat' },
    ]);
    expect(lancer({ action: a('bannissement.bannissement'), cibles: [ennemi('d', { demonOuMortVivant: true, pv: 21 })], alea: des(...six()) }).changements.map((c) => c.type)).toEqual(['degats']);
    expect(lancer({ action: a('bannissement.bannissement'), cibles: [ennemi('d5', { demonOuMortVivant: true, pv: 5, boss: true })], alea: des(...six()) }).changements.map((c) => c.type)).toEqual([
      'narratif',
      'degats',
    ]);
  });
});

describe('Jugement', () => {
  it('Œil de l’inquisiteur : Marque 3 rounds, alliés +1 contre elle ; II +2', () => {
    expect(lancer({ action: a('jugement.oeil-de-l-inquisiteur') }).changements).toEqual([
      { type: 'etat', cible: 'a', etat: 'marque', duree: { rounds: 3 }, contre: [{ cible: 'attaque', valeur: 1 }] },
    ]);
    expect(actionAuPalier(a('jugement.oeil-de-l-inquisiteur'), 'II').effets[0]).toMatchObject({ contre: [{ valeur: 2 }] });
  });

  it('Châtiment : la prochaine frappe au contact prend +2d6 sacrés ; Confession forcée sur une cible marquée', () => {
    expect(lancer({ action: a('jugement.chatiment'), cibles: [] }).changements).toEqual([
      { type: 'bonus', cible: 'hermione', sur: 'degats', valeur: '2d6', duree: 'finCombat', typeDegats: 'sacre', consomme: 'prochaineFrappe' },
    ]);
    expect(lancer({ action: a('jugement.confession-forcee'), alea: des([20, 2]) }).changements).toEqual([]);
    expect(lancer({ action: a('jugement.confession-forcee'), cibles: [ennemi('a', { etats: ['marque'] })], alea: des([20, 2]) }).changements).toEqual([
      { type: 'etat', cible: 'a', etat: 'etourdi', duree: { rounds: 1 } },
    ]);
  });
});

describe('boosts de Sacré (1 point, un par sort, propre au Cercle)', () => {
  it('un boost hors de son Cercle est refusé ; il coûte 1 Sacré', () => {
    expect(resoudreLancer({ action: a('foi.bouclier-de-la-foi'), palier: 'I', lanceur, cibles: [], boost: 'retraitEtat' }, cat)).toMatchObject({ ok: false });
    expect(lancer({ action: a('foi.bouclier-de-la-foi'), cibles: [allie('g')], boost: 'plusUnRound' }).cout).toEqual({ pp: 3, pv: 0, sacre: 1 });
  });

  it('Foi : +1 round, ou pas de sauvegarde', () => {
    expect(lancer({ action: a('foi.bouclier-de-la-foi'), cibles: [allie('g')], boost: 'plusUnRound' }).changements[0]).toMatchObject({ duree: { rounds: 3 } });
    expect(lancer({ action: a('foi.mot-de-commandement'), boost: 'sansSauvegarde' })).toMatchObject({ jets: [], changements: [{ etat: 'commande' }] });
  });

  it('Guérison : retirer un état à la cible', () => {
    expect(lancer({ action: a('guerison.imposition'), cibles: [allie('g')], boost: 'retraitEtat', alea: des([8, 1]) }).changements).toContainEqual({ type: 'retraitEtat', cible: 'g', etats: [], nombre: 1 });
  });

  it('Bannissement : double effet contre démons et morts-vivants (dégâts ×2 de plus, durées doublées)', () => {
    const f = lancer({ action: a('bannissement.flamme-sacree'), cibles: [ennemi('g', { demonOuMortVivant: true })], boost: 'doubleContreDemons', alea: des([20, 2], [8, 3]) });
    expect(f.changements[0]).toMatchObject({ montant: 12 });
    const r = lancer({ action: a('bannissement.rite-de-bannissement'), cibles: [ennemi('d', { demonOuMortVivant: true })], boost: 'doubleContreDemons', alea: des([20, 2]) });
    expect(r.changements).toEqual([{ type: 'etat', cible: 'd', etat: 'immobilise', duree: { rounds: 2 } }]);
  });
});

describe('sorts mineurs', () => {
  it('cinq sorts : Flamme vacillante à l’attaque magique, Stabiliser, Bénédiction mineure une fois par round…', () => {
    expect(pretre.mineurs.liste.map((id) => a(id).nom)).toEqual(['Flamme vacillante', 'Stabiliser', 'Bénédiction mineure', 'Sentir le mal', 'Purifier']);
    expect(a('mineur.flamme-vacillante')).toMatchObject({ resolution: { jet: 'attaqueMagique' }, ciblage: { portee: 10 } });
    expect(a('mineur.benediction-mineure')).toMatchObject({ limite: '1x/round', effets: [{ cible: 'prochainJet', valeur: 1 }] });
  });
});
