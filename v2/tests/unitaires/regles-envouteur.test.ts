import { describe, expect, it } from 'vitest';
import { profilMagique, secondeEcole, verifierChoix, type ChoixDePersonnage } from '../../src/lib/effets/profil';
import { resoudreLancer, type CibleEnJeu, type Lancer, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import { actionParId, classeParId, elementParId, etatParId, referencesManquantes, voieParId } from '../../src/regles';

/*
 * L'Envoûteur de la refonte (lot L4.5) : classe, voies, sorts mineurs,
 * profil. Décisions de Thomas du 21/10/2026, verrouillées en tête de
 * src/regles/classes/envouteur.ts.
 */

const env = classeParId.get('envouteur')!;
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
const lanceur: LanceurEnJeu = { id: 'env', camp: 'pj', def: 13, sauvegardes: sauv, etats: [], modMagie: 3, attaqueMagique: 4, niveau: 4 };
const ennemi = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ id, camp: 'ennemi', def: 12, sauvegardes: sauv, etats: [], distance: 3, ...patch });
const a = (id: string) => actionParId.get(id)!;
const lancer = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => {
  const r = resoudreLancer({ palier: 'I', lanceur, cibles: [ennemi('a')], alea: des(), ...l }, cat);
  if (!r.ok) throw new Error(r.raison);
  return r;
};
const choix = (c: Partial<ChoixDePersonnage>): ChoixDePersonnage => ({
  niveau: 1,
  modMagie: 3,
  ecole: 'illusion',
  elementDepart: 'psionique',
  rangs: { 'envouteur.ecole': 1, 'envouteur.esprit': 1 },
  mineurs: ['mineur.pique-mentale', 'mineur.murmure'],
  ...c,
});

describe('la classe', () => {
  it('d4, CHA, réserve de PP des lanceurs ; Illusion ou Enchantement ; psionique Initié à la création (1a)', () => {
    expect(env).toMatchObject({ famille: 'magique', deVie: 4, caracMagie: 'CHA', reservePP: { base: 4, parNiveau: 2, parMod: 2 } });
    expect(env.creation).toEqual({ ecoles: ['illusion', 'enchantement'], elements: ['psionique'], elementsSecond: [], maitriseElementDepart: 'initie' });
  });

  it('cinq voies ; Prescience et seconde école exclusives (validé) ; tout ce qu’elle cite existe', () => {
    expect(env.voies).toEqual(['envouteur.ecole', 'envouteur.esprit', 'envouteur.transmutation', 'envouteur.prescience', 'envouteur.seconde-ecole']);
    expect(env.voiesExclusives).toEqual([['envouteur.prescience', 'envouteur.seconde-ecole']]);
    expect(referencesManquantes()).toEqual([]);
  });

  it('sorts mineurs : Pique mentale, Murmure, Fantasme mineur, Amitié, Trouble, sans paliers (15a)', () => {
    const m = env.mineurs.liste.map((id) => a(id));
    expect(m.map((x) => x.nom)).toEqual(['Pique mentale', 'Murmure', 'Fantasme mineur', 'Amitié', 'Trouble']);
    expect(m.every((x) => x.nature === 'mineur' && !x.paliers.II)).toBe(true);
  });
});

describe('profil', () => {
  it('niveau 1 : Leurre au palier I, Illusion Adepte, psionique Adepte avec Esprit aiguisé, Initié sans', () => {
    expect(verifierChoix(env, choix({}), regles)).toEqual([]);
    expect(profilMagique(env, choix({}), regles)).toMatchObject({ reservePP: 12, maitriseEcole: 'adepte', elements: { psionique: 'adepte' }, verbes: [{ id: 'illusion.leurre', palier: 'I' }] });
    expect(profilMagique(env, choix({ rangs: { 'envouteur.ecole': 2 } }), regles).elements).toEqual({ psionique: 'initie' });
  });

  it('Réalité de l’esprit : psionique Maître et la capacité lue par le combat', () => {
    const p = profilMagique(env, choix({ niveau: 3, rangs: { 'envouteur.ecole': 3, 'envouteur.esprit': 3 } }), regles);
    expect(p.elements).toEqual({ psionique: 'maitre' });
    expect(p.capacites).toEqual([{ nom: 'realiteDeLEsprit', limite: 'volonte' }]);
  });

  it('seconde école : l’autre école, Adepte, paliers plafonnés à II, rang 5 au palier I (14a)', () => {
    const c = choix({ niveau: 5, ecole: 'illusion', rangs: { 'envouteur.ecole': 2, 'envouteur.seconde-ecole': 5 } });
    expect(verifierChoix(env, c, regles)).toEqual([]);
    expect(secondeEcole(env, c)).toBe('enchantement');
    const p = profilMagique(env, c, regles);
    expect(p).toMatchObject({ maitriseEcole: 'adepte', maitriseSecondeEcole: 'adepte' });
    expect(p.verbes).toEqual([
      { id: 'illusion.leurre', palier: 'I' },
      { id: 'illusion.voile', palier: 'I' },
      { id: 'enchantement.charme', palier: 'II' },
      { id: 'enchantement.fascination', palier: 'II' },
      { id: 'enchantement.terreur', palier: 'II' },
      { id: 'enchantement.sommeil', palier: 'I' },
      { id: 'enchantement.domination', palier: 'I' },
    ]);
    expect(verifierChoix(env, { ...c, rangs: { ...c.rangs, 'envouteur.prescience': 1 } }, regles)).toContainEqual(expect.stringMatching(/Une seule voie/));
  });
});

describe('voies', () => {
  it('Lien mental : sans coût, une fois par round, +1 au prochain jet d’un allié lié (8a)', () => {
    expect(a('envouteur.lien-mental')).toMatchObject({ action: 'gratuite', limite: '1x/round', effets: [{ cible: 'prochainJet', valeur: 1 }] });
    expect(lancer({ action: a('envouteur.lien-mental'), cibles: [{ ...ennemi('ami'), camp: 'pj' }] }).cout).toEqual({ pp: 0, pv: 0 });
  });

  it('Tempête psychique (10a) : 6 PP, 1x/scénario, 4d6 psychiques en zone, Volonté pour moitié, Étourdi sur un échec', () => {
    const r = lancer({ action: a('envouteur.tempete-psychique'), zone: [ennemi('a')], alea: des([20, 2], [6, 3], [6, 3], [6, 3], [6, 3]) });
    expect(r.cout.pp).toBe(6);
    expect(r.changements).toContainEqual({ type: 'degats', cible: 'a', montant: 12, typeDegats: 'psychique', calcul: '12 (3 + 3 + 3 + 3)' });
    expect(r.changements).toContainEqual({ type: 'etat', cible: 'a', etat: 'etourdi', duree: { rounds: 1 } });
  });

  it('Transmutation (11) : Arme enchantée et Vitesse 2 rounds ; Métamorphose 1 round, pas les boss', () => {
    expect(lancer({ action: a('envouteur.arme-enchantee'), cibles: [{ ...ennemi('g'), camp: 'pj' }] }).changements).toEqual([
      { type: 'bonus', cible: 'g', sur: 'attaque', valeur: 2, duree: { rounds: 2 } },
      { type: 'bonus', cible: 'g', sur: 'degats', valeur: '1d6', duree: { rounds: 2 } },
    ]);
    expect(a('envouteur.vitesse').effets[0]).toMatchObject({ cible: 'deplacement', valeur: 2, duree: { rounds: 2 } });
    expect(a('envouteur.metamorphose').effets[0]).toMatchObject({ etat: 'metamorphose', duree: { rounds: 1 }, saufBoss: true });
  });

  it('Pierre en chair : −4 DEF et Ralenti pendant 1d4 + CHA rounds, un seul jet de durée pour les deux', () => {
    const r = lancer({ action: a('envouteur.pierre-en-chair'), alea: des([4, 2], [20, 2]) });
    expect(r.jets.find((j) => j.quoi === 'durée')).toMatchObject({ total: 5 });
    expect(r.changements).toEqual([
      { type: 'bonus', cible: 'a', sur: 'DEF', valeur: -4, duree: { rounds: 5 } },
      { type: 'etat', cible: 'a', etat: 'ralenti', duree: { rounds: 5 } },
    ]);
  });

  it('Pressentiment : l’attaquant a le désavantage ; Jamais surpris : +2 en initiative', () => {
    expect(lancer({ action: a('envouteur.pressentiment') }).changements).toEqual([{ type: 'etat', cible: 'a', etat: 'presage', duree: 'prochainTour' }]);
    expect(etatParId.get('presage')!.desavantage).toEqual(['prochaineAttaque']);
    expect(a('envouteur.jamais-surpris').effets[0]).toMatchObject({ cible: 'initiative', valeur: 2, duree: 'permanente' });
  });

  it('Prophétie (13) : une fois par combat, X d20 tirés d’avance, 3 PP par dé', () => {
    const p = a('envouteur.prophetie');
    expect(p.limite).toBe('1x/combat');
    const r = lancer({ action: p, nombreDeDes: 3, alea: des([20, 17], [20, 2], [20, 11]) });
    expect(r.cout.pp).toBe(9);
    expect(r.changements).toEqual([{ type: 'jetsReserves', cible: 'env', valeurs: [17, 2, 11] }]);
    expect(resoudreLancer({ action: p, palier: 'I', lanceur, cibles: [] }, cat)).toMatchObject({ ok: false, raison: expect.stringMatching(/combien de dés/) });
  });
});

describe('sorts mineurs', () => {
  it('Pique mentale : attaque magique contre la DEF sans armure, dégâts psychiques', () => {
    const r = lancer({ action: a('mineur.pique-mentale'), cibles: [ennemi('chevalier', { def: 18, defSansArmure: 11 })], alea: des([20, 7], [6, 4]) });
    expect(r.jets[0]).toMatchObject({ total: 11, contre: 11, reussi: true });
    expect(r.changements).toEqual([{ type: 'degats', cible: 'chevalier', montant: 4, typeDegats: 'psychique', calcul: '4 (4)' }]);
  });

  it('Trouble : −1 au prochain jet d’attaque de la cible, sur une Volonté ratée', () => {
    expect(lancer({ action: a('mineur.trouble'), alea: des([20, 2]) }).changements).toEqual([{ type: 'bonus', cible: 'a', sur: 'attaque', valeur: -1, duree: 'prochainTour' }]);
    expect(lancer({ action: a('mineur.trouble'), alea: des([20, 19]) }).changements).toEqual([]);
  });
});
