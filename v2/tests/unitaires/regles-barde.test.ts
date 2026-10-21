import { describe, expect, it } from 'vitest';
import { actionAuPalier } from '../../src/lib/effets/paliers';
import { profilMagique, verifierChoix, type ChoixDePersonnage } from '../../src/lib/effets/profil';
import { resoudreLancer, type ArmeEnJeu, type CibleEnJeu, type Lancer, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import { actionParId, actionsCommunes, classeParId, elementParId, etatParId, referencesManquantes, verbesDeLEcole, voieParId } from '../../src/regles';
import { ARMES_LEGERES } from '../../src/regles/armes';

/*
 * Le Barde de la refonte (lot L4.8) : Voie du chant et boosts d'Inspiration,
 * Rapière, Spectacle, Alcoolisme collective. Doc « Refonte classes et
 * magie — cadre » et décisions de Thomas du 21/10/2026.
 */

const barde = classeParId.get('barde')!;
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
const lanceur: LanceurEnJeu = { id: 'kargash', camp: 'pj', def: 14, sauvegardes: sauv, etats: [], modMagie: 3, attaqueMagique: 5, niveau: 6, mods: { DEX: 2, CON: 1, INT: 2, CHA: 3 } };
const rapiere: ArmeEnJeu = { id: 'rapiere', famille: 'perforant', des: '1d6', attaque: 5, degats: 2, legere: true };
const dague: ArmeEnJeu = { id: 'dague', famille: 'dague', des: '1d4', attaque: 5, degats: 2, legere: true };
const ennemi = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ id, camp: 'ennemi', def: 12, sauvegardes: sauv, etats: [], distance: 3, ...patch });
const allie = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ ...ennemi(id), camp: 'pj', mods: { CON: 2 }, ...patch });
const a = (id: string) => actionParId.get(id)!;
const essai = (l: Partial<Lancer> & Pick<Lancer, 'action'>) =>
  resoudreLancer({ palier: 'I', lanceur, cibles: [ennemi('a')], arme: rapiere, attaquesSpeciales: { familles: ['perforant'], cout: 'unParCombat' }, alea: des(), ...l }, cat);
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
  it('hybride, d6, CHA ; PP réduits ; Inspiration 2 + niveau / 4, jamais rechargée d’office, +1 sur un 20 de tout allié qui l’entend (5b)', () => {
    expect(barde).toMatchObject({
      famille: 'hybride',
      deVie: 6,
      caracMagie: 'CHA',
      reservePP: { base: 4, parNiveau: 2, parMod: 1 },
      ressourceDeClasse: { ressource: 'inspiration', base: 2, diviseurNiveau: 4, recharge: 'jamais', parVingtNaturel: 'luiEtAlliesQuiLEntendent' },
      attaquesSpeciales: { familles: ['perforant'], cout: 'unParCombat' },
      voies: ['barde.chant', 'barde.rapiere', 'barde.spectacle', 'barde.alcoolisme'],
      mineurs: { creation: 1, plusUnAuNiveau: [7] },
    });
    expect(barde.creation).toEqual({ ecoles: [], elements: null, elementsSecond: [], maitriseElementDepart: 'adepte' });
    expect(referencesManquantes()).toEqual([]);
  });

  it('profil : la Voie du chant ouvre ses verbes et leurs paliers ; Inspiration 2 + 8 / 4 = 4 ; la seule attaque spéciale est perforante', () => {
    const c: ChoixDePersonnage = { niveau: 8, modMagie: 3, rangs: { 'barde.chant': 3, 'barde.rapiere': 2 }, mineurs: ['mineur.moquerie'] };
    expect(verifierChoix(barde, c, regles)).toEqual([]);
    const p = profilMagique(barde, c, regles);
    expect(p).toMatchObject({ reservePP: 23, ressourceDeClasse: { ressource: 'inspiration', max: 4 }, maitriseEcole: 'adepte', mineursMax: 2 });
    expect(p.verbes).toEqual([
      { id: 'chant.note-discordante', palier: 'II' },
      { id: 'chant.ballade', palier: 'I' },
      { id: 'chant.chant-brisant', palier: 'I' },
    ]);
    expect(p.actions).toEqual(['barde.relance', 'barde.precision', 'barde.intelligence-du-combat']);
    expect(p.attaques).toEqual(['arme.attaque', 'arme.opportunite', 'arme.coup-d-estoc']);
  });

  it('armes légères (7a) : dagues, épée courte, cimeterre, rapière', () => {
    expect(ARMES_LEGERES).toEqual(['dague', 'dague_p2', 'poignards_jumeaux', 'epee_courte', 'cimeterre', 'rapiere']);
  });
});

describe('Voie du chant', () => {
  it('cinq verbes ; coûts du tableau : 2/3/4, 3/4, 4/5, 5, 6', () => {
    expect(verbesDeLEcole('chant').map((v) => v.id)).toEqual(['chant.note-discordante', 'chant.ballade', 'chant.chant-brisant', 'chant.contre-chant', 'chant.requiem-du-silence']);
    const pp = (id: string, palier: 'I' | 'II' | 'III', patch: Partial<Lancer> = {}) => lancer({ action: a(id), palier, cibles: [], alea: des([20, 20], [20, 20]), ...patch }).cout.pp;
    expect([pp('chant.note-discordante', 'I'), pp('chant.note-discordante', 'II'), pp('chant.note-discordante', 'III')]).toEqual([2, 3, 4]);
    expect([pp('chant.ballade', 'I'), pp('chant.ballade', 'II'), pp('chant.chant-brisant', 'I'), pp('chant.chant-brisant', 'II')]).toEqual([3, 4, 4, 5]);
    expect([pp('chant.contre-chant', 'I'), pp('chant.requiem-du-silence', 'I')]).toEqual([5, 6]);
  });

  it('Note discordante (1b) : −2 en attaque ou en DEF 2 rounds, Volonté contre 10 + CHA ; II −3 ; III deux cibles', () => {
    const r = lancer({ action: a('chant.note-discordante'), alea: des([20, 5]) });
    expect(r.dd).toBe(13);
    expect(r.changements).toEqual([{ type: 'bonus', cible: 'a', sur: 'attaque', valeur: -2, duree: { rounds: 2 } }]);
    expect(lancer({ action: a('chant.note-discordante'), variante: 'def', palier: 'II', alea: des([20, 5]) }).changements[0]).toMatchObject({ sur: 'DEF', valeur: -3 });
    expect(lancer({ action: a('chant.note-discordante'), alea: des([20, 15]) }).changements).toEqual([]);
    expect(actionAuPalier(a('chant.note-discordante'), 'III').ciblage.nbCibles).toBe(2);
  });

  it('boost d’Inspiration : 1 point, +1 round ou +1 cible, payé en Inspiration ; un boost de Sacré est refusé', () => {
    const r = lancer({ action: a('chant.note-discordante'), boost: 'plusUnRound', alea: des([20, 5]) });
    expect(r.cout).toEqual({ pp: 2, pv: 0, ressources: { inspiration: 1 } });
    expect(r.changements[0]).toMatchObject({ duree: { rounds: 3 } });
    expect(lancer({ action: a('chant.ballade'), boost: 'plusUneCible', cibles: [ennemi('b', { camp: 'pj' }), ennemi('c', { camp: 'pj' })] }).changements).toHaveLength(2);
    expect(refus({ action: a('chant.ballade'), boost: 'sansSauvegarde' })).toBe('le boost sansSauvegarde ne s’applique pas à Ballade');
  });

  it('Ballade : un allié +1 en attaque 2 rounds ; II tous les alliés à 7 cases (2a)', () => {
    expect(lancer({ action: a('chant.ballade'), cibles: [allie('b')] }).changements).toEqual([{ type: 'bonus', cible: 'b', sur: 'attaque', valeur: 1, duree: { rounds: 2 } }]);
    const ii = actionAuPalier(a('chant.ballade'), 'II');
    expect(ii.zone).toMatchObject({ forme: 'cercle', taille: 7, origine: 'lanceur', filtre: 'allies' });
    expect(lancer({ action: a('chant.ballade'), palier: 'II', cibles: [], zone: [allie('b'), allie('c')] }).changements).toHaveLength(2);
  });

  it('Chant brisant : 3 × 3 ennemis, −2 en attaque et DEF 2 rounds, Volonté ; II rayon 2', () => {
    const r = lancer({ action: a('chant.chant-brisant'), cibles: [], zone: [ennemi('b')], alea: des([20, 3]) });
    expect(r.changements.map((c) => c.type === 'bonus' && [c.sur, c.valeur])).toEqual([
      ['attaque', -2],
      ['DEF', -2],
    ]);
    expect(a('chant.chant-brisant').zone).toMatchObject({ forme: 'carre', taille: 3, filtre: 'ennemis' });
    expect(actionAuPalier(a('chant.chant-brisant'), 'II').zone).toMatchObject({ forme: 'cercle', taille: 2 });
  });

  it('Contre-chant (4a) : réaction, retire Charmé, Fasciné, Dominé, Commandé, Effroi ou Silence', () => {
    expect(a('chant.contre-chant')).toMatchObject({ action: 'reaction', declencheur: 'effetSonOuCharme' });
    expect(lancer({ action: a('chant.contre-chant'), cibles: [allie('b')] }).changements).toEqual([
      { type: 'retraitEtat', cible: 'b', etats: ['charme', 'fascine', 'domine', 'commande', 'effroi', 'silence'], nombre: 1 },
    ]);
  });

  it('Requiem du silence (3a) : rayon 2, 2 rounds, alliés compris ; un lanceur réduit au Silence ne lance plus de sort, mais frappe encore', () => {
    expect(a('chant.requiem-du-silence')).toMatchObject({ limite: '1x/combat', zone: { forme: 'cercle', taille: 2, filtre: 'tous' }, persistance: { duree: { rounds: 2 } } });
    expect(lancer({ action: a('chant.requiem-du-silence'), cibles: [], zone: [ennemi('b'), allie('c')] }).changements).toEqual([
      { type: 'etat', cible: 'b', etat: 'silence', duree: { rounds: 2 } },
      { type: 'etat', cible: 'c', etat: 'silence', duree: { rounds: 2 } },
    ]);
    const muet = { ...lanceur, etats: ['silence'] };
    expect(refus({ action: a('chant.note-discordante'), lanceur: muet })).toBe('Silence : aucun sort');
    expect(refus({ action: a('mineur.moquerie'), lanceur: muet })).toBe('Silence : aucun sort');
    expect(lancer({ action: a('arme.attaque'), lanceur: muet, alea: des([20, 10], [6, 1]) }).changements).toHaveLength(1);
  });

  it('Inspiration : relance d’un d20, 1 point, en réaction (6a)', () => {
    const r = lancer({ action: a('barde.relance'), cibles: [allie('b')] });
    expect(r.cout).toEqual({ pp: 0, pv: 0, ressources: { inspiration: 1 } });
    expect(r.changements).toEqual([{ type: 'relance', cible: 'b' }]);
  });
});

describe('Voie de la rapière', () => {
  it('Précision : +1 en attaque avec une arme légère seulement', () => {
    expect(lancer({ action: a('barde.precision'), cibles: [] }).changements).toEqual([{ type: 'bonus', cible: 'kargash', sur: 'attaque', valeur: 1, duree: 'permanente' }]);
    expect(lancer({ action: a('barde.precision'), cibles: [], arme: { ...rapiere, legere: false } }).changements).toEqual([]);
  });

  it('Intelligence du combat : + mod d’INT en initiative et en DEF', () => {
    expect(lancer({ action: a('barde.intelligence-du-combat'), cibles: [] }).changements.map((c) => c.type === 'bonus' && [c.sur, c.valeur])).toEqual([
      ['initiative', 2],
      ['DEF', 2],
    ]);
  });

  it('Feinte (8b) : attaque normale ; touché, la prochaine attaque contre la cible a l’avantage', () => {
    expect(lancer({ action: a('barde.feinte'), alea: des([20, 10], [6, 3]) }).changements).toEqual([
      { type: 'degats', cible: 'a', montant: 5, typeDegats: 'physique', calcul: '5 (3)' },
      { type: 'etat', cible: 'a', etat: 'feinte', duree: 'prochainTour' },
    ]);
    expect(lancer({ action: a('barde.feinte'), alea: des([20, 2]) }).changements).toEqual([]);
    const r = lancer({ action: a('arme.attaque'), cibles: [ennemi('a', { etats: ['feinte'] })], alea: des([20, 3], [20, 15], [6, 1]) });
    expect(r.jets[0]).toMatchObject({ des: [3, 15], total: 20, reussi: true });
    expect(etatParId.get('feinte')).toMatchObject({ rompuPar: ['estAttaque'] });
  });

  it('Enchaînement (9a) : −2 aux deux attaques du tour', () => {
    expect(lancer({ action: a('barde.enchainement'), cibles: [] }).changements[0]).toEqual({ type: 'bonus', cible: 'kargash', sur: 'attaque', valeur: -2, duree: 'prochainTour' });
  });

  it('Botte mortelle (10a) : +2d6 contre une cible affaiblie (malus ou contrôle), rien de plus sinon ; ratée, rien', () => {
    const affaiblie = lancer({ action: a('barde.botte-mortelle'), cibles: [ennemi('a', { etats: ['expose'] })], alea: des([20, 15], [6, 2], [6, 3], [6, 4]) });
    expect(affaiblie.changements.map((c) => c.type === 'degats' && c.montant)).toEqual([4, 7, false]);
    const saine = lancer({ action: a('barde.botte-mortelle'), alea: des([20, 15], [6, 2]) });
    expect(saine.changements.filter((c) => c.type === 'degats')).toHaveLength(1);
    expect(lancer({ action: a('barde.botte-mortelle'), cibles: [ennemi('a', { etats: ['etourdi'] })], alea: des([20, 1]) }).changements).toEqual([]);
  });
});

describe('Voie du spectacle', () => {
  it('Entrée en scène (11b) : +2 en initiative ; +1 case au premier round', () => {
    expect(lancer({ action: a('barde.entree-en-scene'), cibles: [], premierRound: true }).changements).toHaveLength(2);
    expect(lancer({ action: a('barde.entree-en-scene'), cibles: [] }).changements).toEqual([{ type: 'bonus', cible: 'kargash', sur: 'initiative', valeur: 2, duree: 'permanente' }]);
  });

  it('Lanceur de couteau (14a) : une dague lancée à 5 cases ; refusé sans dague', () => {
    expect(a('barde.lancer-un-couteau').ciblage.portee).toBe(5);
    expect(lancer({ action: a('barde.lancer-un-couteau'), arme: dague, alea: des([20, 10], [4, 3]) }).changements[0]).toMatchObject({ montant: 5 });
    expect(refus({ action: a('barde.lancer-un-couteau') })).toBe('Lancer un couteau demande une arme : dague');
  });

  it('Esquive acrobatique (12a) : 2 cases quand une attaque le rate ; Échappée (13a) : 1x/combat, retire une entrave', () => {
    expect(a('barde.esquive-acrobatique')).toMatchObject({ action: 'reaction', declencheur: 'attaqueRatee' });
    expect(lancer({ action: a('barde.esquive-acrobatique'), cibles: [] }).changements).toEqual([{ type: 'deplacement', cible: 'kargash', sens: 'libre', cases: 2 }]);
    expect(a('barde.echappee')).toMatchObject({ limite: '1x/combat', declencheur: 'etatSubi' });
    expect(lancer({ action: a('barde.echappee'), cibles: [] }).changements).toEqual([{ type: 'retraitEtat', cible: 'kargash', etats: ['immobilise', 'ralenti', 'renverse'], nombre: 1 }]);
  });
});

describe('Voie de l’alcoolisme (15a, 16a)', () => {
  it('élixir de rang 3 : test de CON 16 du buveur ; réussi, +3 à la caractéristique choisie pendant 3 + mod de CON rounds', () => {
    const r = lancer({ action: a('barde.elixir-3'), cibles: [allie('b')], caracChoisie: 'FOR', alea: des([20, 16]) });
    expect(r.dd).toBe(16);
    expect(a('barde.elixir-3').action).toBe('mineure');
    expect(r.changements).toEqual([{ type: 'bonus', cible: 'b', sur: 'FOR', valeur: 3, duree: { rounds: 5 } }]);
  });

  it('raté : la moitié du bonus et 1 Ivresse jusqu’à la fin de la scène ; au rang 1, seulement l’Ivresse', () => {
    expect(lancer({ action: a('barde.elixir-3'), cibles: [allie('b')], caracChoisie: 'DEX', alea: des([20, 5]) }).changements).toEqual([
      { type: 'bonus', cible: 'b', sur: 'DEX', valeur: 1, duree: { rounds: 5 } },
      { type: 'etat', cible: 'b', etat: 'ivresse', duree: 'scene' },
    ]);
    expect(lancer({ action: a('barde.elixir-1'), cibles: [allie('b')], caracChoisie: 'DEX', alea: des([20, 5]) }).changements).toEqual([{ type: 'etat', cible: 'b', etat: 'ivresse', duree: 'scene' }]);
    expect(etatParId.get('ivresse')).toMatchObject({ cumulable: true, modificateurs: [{ cible: 'tests', valeur: -1 }] });
  });

  it('le Barde peut boire lui-même ; il faut choisir la caractéristique, et connaître le mod de CON du buveur', () => {
    expect(lancer({ action: a('barde.elixir-1'), cibles: [{ ...lanceur, distance: 0 }], caracChoisie: 'CHA', alea: des([20, 20]) }).changements[0]).toMatchObject({ cible: 'kargash', duree: { rounds: 4 } });
    expect(refus({ action: a('barde.elixir-2'), cibles: [allie('b')] })).toBe('choisis la caractéristique');
    expect(refus({ action: a('barde.elixir-2'), cibles: [allie('b', { mods: {} })], caracChoisie: 'FOR' })).toBe('il faut le mod de CON de b');
  });
});

describe('sorts mineurs', () => {
  it('Moquerie : attaque magique à 6 cases, dé des sorts mineurs psychique, −1 au prochain jet ; Rengaine : +1 case à un allié', () => {
    expect(lancer({ action: a('mineur.moquerie'), alea: des([20, 10], [8, 5]) }).changements).toEqual([
      { type: 'degats', cible: 'a', montant: 5, typeDegats: 'psychique', calcul: '5 (5)' },
      { type: 'bonus', cible: 'a', sur: 'prochainJet', valeur: -1, duree: 'prochainTour' },
    ]);
    expect(lancer({ action: a('mineur.rengaine'), cibles: [allie('b')] }).changements).toEqual([{ type: 'bonus', cible: 'b', sur: 'deplacement', valeur: 1, duree: 'prochainTour' }]);
    expect(barde.mineurs.liste).toEqual(['mineur.moquerie', 'mineur.melodie', 'mineur.ventriloquie', 'mineur.rengaine']);
  });
});
