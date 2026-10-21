import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import objets from '../../src/donnees/objets.json';
import { profilMagique, verifierChoix, type ChoixDePersonnage } from '../../src/lib/effets/profil';
import { resoudreLancer, type ArmeEnJeu, type CibleEnJeu, type Lancer, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import { actionParId, actionsCommunes, classeParId, elementParId, etatParId, invocationParId, referencesManquantes, voieParId } from '../../src/regles';
import { FAMILLE_DES_ARMES } from '../../src/regles/armes';
import { schemaAction } from '../../src/lib/schemas/effets';

/*
 * Le Chasseur de la refonte (lot L4.14) : Instinct, Marque, armes à feu,
 * voies de l'embuscade, de la gâchette, de la grande chasse, du limier et du
 * chaos. Doc « Refonte classes et magie — cadre » et décisions de Thomas du
 * 21/10/2026 (1a, 2b, 3a à 10a).
 */

const chasseur = classeParId.get('chasseur')!;
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
const lanceur: LanceurEnJeu = { id: 'ysolde', camp: 'pj', def: 15, sauvegardes: sauv, etats: [], modMagie: 3, attaqueMagique: 0, niveau: 6, mods: { FOR: 1, DEX: 3, CON: 1 }, pv: 40, pvMax: 40 };
const fusil: ArmeEnJeu = { id: 'fusil', famille: 'armeAFeu', des: '1d10', attaque: 6, degats: 0 };
const tromblon: ArmeEnJeu = { id: 'tromblon', famille: 'tromblon', des: '3d4', attaque: 5, degats: 0 };
const ennemi = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ id, camp: 'ennemi', def: 12, sauvegardes: sauv, etats: [], distance: 3, ...patch });
const a = (id: string) => actionParId.get(id)!;
const instinct = { familles: chasseur.attaquesSpeciales!.familles, cout: { ressource: 'instinct', montant: 2 } } as const;
const essai = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => resoudreLancer({ palier: 'I', lanceur, cibles: [ennemi('a')], arme: fusil, attaquesSpeciales: instinct, alea: des(), ...l }, cat);
const lancer = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => {
  const r = essai(l);
  if (!r.ok) throw new Error(r.raison);
  return r;
};
const choix = (c: Partial<ChoixDePersonnage>): ChoixDePersonnage => ({ niveau: 6, modMagie: 3, rangs: {}, mineurs: [], ...c });

describe('la classe (1a, 3a, 10a)', () => {
  it('physique, d8, DEX de classe, sans PP ; Instinct 3 + niveau / 3, repos court ; Marque de classe', () => {
    expect(chasseur).toMatchObject({
      famille: 'physique',
      deVie: 8,
      caracMagie: 'DEX',
      ressourceDeClasse: { ressource: 'instinct', base: 3, diviseurNiveau: 3, recharge: 'reposCourt' },
      actionsDeClasse: ['chasseur.marque', 'chasseur.changer-de-marque'],
    });
    expect(chasseur.reservePP).toBeUndefined();
    expect(chasseur.voies).toEqual(['chasseur.embuscade', 'chasseur.gachette', 'chasseur.grande-chasse', 'chasseur.limier', 'chasseur.chaos']);
    expect(referencesManquantes()).toEqual([]);
  });

  it('Marque : action gratuite, Marqué jusqu’à la fin du combat ; changer de proie coûte 1 Instinct', () => {
    expect(a('chasseur.marque')).toMatchObject({ action: 'gratuite' });
    expect(lancer({ action: a('chasseur.marque') }).changements[0]).toEqual({ type: 'etat', cible: 'a', etat: 'marque', duree: 'finCombat' });
    expect(lancer({ action: a('chasseur.changer-de-marque') }).cout).toEqual({ pp: 0, pv: 0, ressources: { instinct: 1 } });
  });
});

describe('armes à feu (2b)', () => {
  it('pistolet, fusil et tromblon au catalogue, avec leur famille', () => {
    const armes = (objets as { objets: { id: string; degats: string; portee: string; rechargement?: number }[] }).objets;
    const par = (id: string) => armes.find((o) => o.id === id)!;
    expect([par('pistolet'), par('fusil'), par('tromblon')].map((o) => [o.degats, o.portee, o.rechargement])).toEqual([
      ['1d8', '1-4 cases', 1],
      ['1d10', '1-8 cases', 1],
      ['3d4', '1-3 cases', 1],
    ]);
    expect([FAMILLE_DES_ARMES.pistolet, FAMILLE_DES_ARMES.fusil, FAMILLE_DES_ARMES.tromblon]).toEqual(['armeAFeu', 'armeAFeu', 'tromblon']);
    // Ajoutés au catalogue v1 (exception de Thomas, 21/10/2026), puis importés.
    expect(readFileSync('../data/loot.js', 'utf8')).toContain('"id": "tromblon"');
  });

  it('Précision : 2 Instinct, aucun tir ce tour ; la prochaine frappe gagne +1d6', () => {
    const r = lancer({ action: a('arme.precision') });
    expect(r.cout).toEqual({ pp: 0, pv: 0, ressources: { instinct: 2 } });
    expect(r.jets).toEqual([]);
    expect(r.changements[0]).toEqual({ type: 'bonus', cible: 'ysolde', sur: 'degats', valeur: '1d6', duree: 'finCombat', typeDegats: 'physique', consomme: 'prochaineFrappe' });
    expect(essai({ action: a('arme.precision'), arme: tromblon }).ok).toBe(false);
  });

  it('Décharge : trois balles de 1d4, un jet d’attaque par cible, trois cibles au plus', () => {
    const r = lancer({ action: a('arme.decharge'), arme: tromblon, cibles: [ennemi('a'), ennemi('b'), ennemi('c')], alea: des([20, 10], [4, 3], [20, 2], [20, 15], [4, 4]) });
    expect(r.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 3, typeDegats: 'physique', calcul: '3 (3)' },
      { type: 'degats', cible: 'c', montant: 4, typeDegats: 'physique', calcul: '4 (4)' },
    ]);
    expect(a('arme.decharge').ciblage.nbCibles).toBe(3);
  });

  it('les attaques spéciales du Chasseur : arc, arbalète, dague, armes à feu ; pas de contact lourd', () => {
    const p = profilMagique(chasseur, choix({}), regles);
    expect(p.attaques).toEqual(['arme.attaque', 'arme.opportunite', 'arme.coup-bas', 'arme.tir-epinglant', 'arme.carreau-lourd', 'arme.precision', 'arme.decharge']);
    expect(p.ressourceDeClasse).toEqual({ ressource: 'instinct', max: 5 });
  });
});

describe('Voie de l’embuscade (4a)', () => {
  it('Camouflage : Dissimulé seulement immobile', () => {
    expect(lancer({ action: a('chasseur.camouflage'), cibles: [], immobile: true }).changements).toEqual([{ type: 'etat', cible: 'ysolde', etat: 'dissimule', duree: 'finCombat' }]);
    expect(lancer({ action: a('chasseur.camouflage'), cibles: [] }).changements).toEqual([]);
  });

  it('Premier coup : +1d6 contre une cible qui n’a pas encore agi (condition lue par le combat contre la cible frappée)', () => {
    expect(a('chasseur.premier-coup').effets[0]).toMatchObject({ type: 'bonus', cible: 'degats', valeur: '1d6', condition: 'cibleNAPasAgi' });
    // La condition elle-même : une attaque qui porte ce bonus ne vaut que contre une cible qui n'a pas agi.
    const attaque = schemaAction.parse({ ...a('arme.attaque'), effets: [{ type: 'degats', des: '1d6', typeDegats: 'physique', condition: 'cibleNAPasAgi' }] });
    const sur = (patch: Partial<CibleEnJeu>) => lancer({ action: attaque, cibles: [ennemi('a', patch)], alea: des([20, 15], [6, 3]) }).changements;
    expect(sur({})).toHaveLength(1);
    expect(sur({ aAgi: true })).toEqual([]);
  });

  it('Sens du danger : +2 initiative ; Repli : réaction, 2 cases quand un ennemi arrive au contact', () => {
    expect(lancer({ action: a('chasseur.sens-du-danger'), cibles: [] }).changements[0]).toEqual({ type: 'bonus', cible: 'ysolde', sur: 'initiative', valeur: 2, duree: 'permanente' });
    expect(a('chasseur.repli')).toMatchObject({ action: 'reaction', declencheur: 'ennemiArriveAuContact', effets: [{ type: 'deplacement', sens: 'libre', cases: 2 }] });
  });

  it('Collet (mineure, Immobilisé 1 round), Fosse (2d6), Déclencheur en réaction ; pièges à la DEX', () => {
    expect(a('chasseur.collet')).toMatchObject({ action: 'mineure', attaquePar: 'DEX', persistance: { quand: 'finDeplacement' } });
    const r = lancer({ action: a('chasseur.collet'), cibles: [], zone: [ennemi('a')], alea: des([20, 12]) });
    expect(r.changements[0]).toEqual({ type: 'etat', cible: 'a', etat: 'immobilise', duree: { rounds: 1 } });
    expect(a('chasseur.fosse').effets[0]).toMatchObject({ des: '2d6' });
    expect(a('chasseur.declencheur')).toMatchObject({ action: 'reaction' });
    expect(a('chasseur.piege-du-grand-gibier')).toMatchObject({ limite: '1x/scenario', zone: { forme: 'carre', taille: 2 } });
  });
});

describe('Voie de la gâchette (5a)', () => {
  it('Tir ajusté : +1 à distance, tir spécial à 1 Instinct ; Tir fatal = Coup de maître 1x/combat', () => {
    const p = profilMagique(chasseur, choix({ rangs: { 'chasseur.gachette': 5 } }), regles);
    expect(p.attaquesSpeciales?.cout).toEqual({ ressource: 'instinct', montant: 1 });
    expect(p.capacites).toContainEqual({ nom: 'coupDeMaitre', limite: '1x/combat' });
    expect(lancer({ action: a('chasseur.tir-ajuste'), cibles: [] }).changements).toEqual([{ type: 'bonus', cible: 'ysolde', sur: 'attaqueDistance', valeur: 1, duree: 'permanente' }]);
  });

  it('correctif L4.15 : le Maniement expert de la Gâchette baisse le coût, sans Précision létale ni Coup double ; Tir fatal ouvre le seul Coup de maître', () => {
    const p4 = profilMagique(chasseur, choix({ rangs: { 'chasseur.gachette': 4 } }), regles);
    expect(p4.voie).toEqual({});
    const p5 = profilMagique(chasseur, choix({ rangs: { 'chasseur.gachette': 5 } }), regles);
    expect(p5.voie).toEqual({ coupDeMaitre: true });
    const arc: ArmeEnJeu = { id: 'arc', famille: 'arc', des: '1d6', attaque: 6, degats: 0 };
    const coup = { maitreDArmes: { rang: 0, coupDeMaitre: { etat: 'renverse' } } };
    const r = lancer({ action: a('arme.tir-epinglant'), arme: arc, voie: { ...p5.voie, ...coup }, alea: des([20, 10], [6, 2]) });
    expect(r.changements.filter((c) => c.type === 'etat').map((c) => c.type === 'etat' && [c.etat, c.duree])).toEqual([
      ['immobilise', { rounds: 1 }],
      ['renverse', { rounds: 1 }],
    ]);
    expect(essai({ action: a('arme.tir-epinglant'), arme: arc, voie: { ...p4.voie, ...coup } })).toEqual({ ok: false, raison: 'le Coup de maître vient au rang 5 de la Voie du maître d’armes' });
    // Sans le rang 3 du Maître d'armes, un 19 n'est pas un critique.
    const dix9 = lancer({ action: a('arme.tir-epinglant'), arme: arc, voie: p4.voie, alea: des([20, 19], [6, 2]) });
    expect(dix9.jets[0]!.critique).toBeUndefined();
  });

  it('Tir de couverture : réaction, −2 à l’attaque de l’ennemi qui vise un allié', () => {
    expect(a('chasseur.tir-de-couverture')).toMatchObject({ action: 'reaction', declencheur: 'allieCible' });
    expect(lancer({ action: a('chasseur.tir-de-couverture') }).changements).toEqual([{ type: 'bonus', cible: 'a', sur: 'attaque', valeur: -2, duree: 'prochainTour' }]);
  });
});

describe('Voie de la grande chasse (6a)', () => {
  it('Marque affûtée et Coup de grâce : seulement contre la cible marquée (passifs à condition, lus par le combat)', () => {
    expect(a('chasseur.marque-affutee').effets[0]).toMatchObject({ cible: 'degats', valeur: '1d4', condition: 'cibleMarquee' });
    expect(a('chasseur.coup-de-grace').effets[0]).toMatchObject({ cible: 'degats', valeur: '1d8', condition: 'cibleMarquee' });
  });

  it('Trophée ultime : 1x/scénario, +3d6 contre la cible marquée seulement', () => {
    expect(a('chasseur.trophee-ultime').limite).toBe('1x/scenario');
    const marquee = lancer({ action: a('chasseur.trophee-ultime'), cibles: [ennemi('a', { etats: ['marque'] })], alea: des([20, 15], [10, 5], [6, 1], [6, 1], [6, 1]) });
    expect(marquee.changements.filter((c) => c.type === 'degats').map((c) => c.type === 'degats' && c.montant)).toEqual([5, 3]);
    expect(lancer({ action: a('chasseur.trophee-ultime'), alea: des([20, 15], [10, 5]) }).changements.filter((c) => c.type === 'degats')).toHaveLength(1);
    expect(a('chasseur.connaitre-sa-proie').manuel).toBeTruthy();
  });
});

describe('Voie du limier (7a)', () => {
  it('le chien : 5 + 2 × niveau PV, DEF 13, morsure 1d6 + 2, 6 cases ; Flair, Saisie, Meute', () => {
    expect(invocationParId.get('limier')).toMatchObject({ pv: { base: 5, parNiveau: 2 }, def: { base: 13 }, deplacement: 6, attaque: { des: '1d6+2' } });
    expect(invocationParId.get('limier')!.capacites.map((c) => c.nom)).toEqual(['Flair', 'Saisie', 'Meute']);
    expect(lancer({ action: a('chasseur.limier'), cibles: [] }).changements[0]).toMatchObject({ type: 'invocation', creature: 'limier' });
    expect(a('chasseur.curee')).toMatchObject({ limite: '1x/combat' });
  });
});

describe('Voie du chaos (8a)', () => {
  it('sur accord du MJ ; contrepartie : les bêtes le fuient ; Chasse ultime : +4 à distance, 3 + DEX rounds, +3 Plongée et +1 Corruption d’Âme', () => {
    const v = voieParId.get('chasseur.chaos')!;
    expect(v.surAccordDuMJ).toBe(true);
    expect(v.rangs[3]!.regles).toContainEqual({ type: 'texte', texte: 'Sens du sang : les bêtes sauvages le fuient d’instinct.' });
    expect(verifierChoix(chasseur, choix({ rangs: { 'chasseur.chaos': 1 } }), regles)).toEqual(['Voie du chaos : elle s’ouvre avec l’accord du MJ.']);
    const av = a('chaos.chasseur.chasse-ultime');
    expect(av.effets[0]).toMatchObject({ cible: 'attaqueDistance', valeur: 4, duree: { base: 3, plusModCible: 'DEX' } });
    expect(av.effets).toContainEqual({ type: 'ressource', ressource: 'corruptionAme', montant: 1, vise: 'lanceur' });
  });

  it('Hurlement du prédateur : Volonté contre 10 + DEX ; raté, Effroi 1 round ; réussi, −2 DEF 2 rounds ; +2 Plongée', () => {
    const rate = lancer({ action: a('chaos.chasseur.hurlement-du-predateur'), alea: des([20, 2], [20, 1]) });
    expect(rate.jets.find((j) => j.quoi === 'sauvegarde de Volonte')).toMatchObject({ contre: 13, reussi: false });
    expect(rate.changements.slice(0, 2)).toEqual([
      { type: 'etat', cible: 'a', etat: 'effroi', duree: { rounds: 1 } },
      { type: 'ressource', cible: 'ysolde', ressource: 'plongee', montant: 2 },
    ]);
    const reussi = lancer({ action: a('chaos.chasseur.hurlement-du-predateur'), alea: des([20, 1], [20, 18]) }); // d20 de chaos, puis la sauvegarde
    expect(reussi.changements[0]).toEqual({ type: 'bonus', cible: 'a', sur: 'DEF', valeur: -2, duree: { rounds: 2 } });
  });
});

describe('profil et fiche', () => {
  it('niveau 6 : Embuscade 3, Gâchette 2, Grande chasse 1 ; Sens du danger compte dans l’initiative', () => {
    const c = choix({ rangs: { 'chasseur.embuscade': 3, 'chasseur.gachette': 2, 'chasseur.grande-chasse': 1 } });
    expect(verifierChoix(chasseur, c, regles)).toEqual([]);
    expect(profilMagique(chasseur, c, regles).actions).toEqual([
      'chasseur.marque', 'chasseur.changer-de-marque',
      'chasseur.camouflage', 'chasseur.premier-coup', 'chasseur.sens-du-danger', 'chasseur.repli',
      'chasseur.tir-ajuste', 'chasseur.cadence',
      'chasseur.marque-affutee',
    ]);
  });
});
