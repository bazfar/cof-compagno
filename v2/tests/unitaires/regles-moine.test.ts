import { describe, expect, it } from 'vitest';
import { profilMagique, verifierChoix, type ChoixDePersonnage } from '../../src/lib/effets/profil';
import { resoudreLancer, type ArmeEnJeu, type CibleEnJeu, type Lancer, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import { actionParId, actionsCommunes, classeParId, elementParId, etatParId, combinaisonParId, referencesManquantes, voieParId } from '../../src/regles';
import { CLASSE_REFONTE } from '../../src/lib/fiche/refonte';
import { schemaAction } from '../../src/lib/schemas/effets';
import { schemaClasseRefonte } from '../../src/lib/schemas/classes';

/*
 * Le Moine de la refonte (lot L4.16) : Ki, mains nues, techniques des
 * poings (sauvegarde après la touche), voies de l'élévation, de
 * l'ascétisme, des souffles et du chaos. Doc « Refonte classes et magie —
 * cadre » et décisions de Thomas du 22/10/2026 (1a à 11a).
 */

const moine = classeParId.get('moine')!;
const regles = { voies: voieParId, actions: actionParId, actionsCommunes };
const cat = { etats: etatParId, elements: elementParId, combinaisons: [...combinaisonParId.values()] };
const des =
  (...suite: [number, number][]) =>
  () => {
    const s = suite.shift();
    if (!s) throw new Error('plus de dés prévus');
    return (s[1] - 0.5) / s[0];
  };
const sauv = { FOR: 0, DEX: 0, CON: 0, Volonte: 0 };
const lanceur: LanceurEnJeu = { id: 'shen', camp: 'pj', def: 15, sauvegardes: sauv, etats: [], modMagie: 3, attaqueMagique: 0, niveau: 6, mods: { FOR: 2, SAG: 3 }, pv: 40, pvMax: 40 };
// Mains nues au niveau 6 : 1d8 + FOR ; modCarac : un effet de l'arme se sauverait contre 10 + FOR.
const poings: ArmeEnJeu = { id: 'mains-nues', famille: 'mainsNues', des: '1d8', attaque: 5, degats: 2, modCarac: 2 };
const soi: CibleEnJeu = { ...lanceur, distance: 0 };
const ennemi = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ id, camp: 'ennemi', def: 12, sauvegardes: sauv, etats: [], distance: 1, ...patch });
const a = (id: string) => actionParId.get(id)!;
const essai = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => resoudreLancer({ palier: 'I', lanceur, cibles: [ennemi('a')], arme: poings, alea: des(), ...l }, cat);
const lancer = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => {
  const r = essai(l);
  if (!r.ok) throw new Error(r.raison);
  return r;
};
const choix = (c: Partial<ChoixDePersonnage>): ChoixDePersonnage => ({ niveau: 6, modMagie: 3, elementDepart: 'psionique', rangs: {}, mineurs: [], ...c });

describe('la classe (1a, 2a, 3a)', () => {
  it('physique, d8, SAG ; Ki 2 + niveau / 3, qui repart à 1 à chaque combat, +1 par touche (2 par round) ; pas de PP ni de sort mineur', () => {
    expect(moine).toMatchObject({
      famille: 'physique',
      deVie: 8,
      caracMagie: 'SAG',
      ressourceDeClasse: { ressource: 'ki', base: 2, diviseurNiveau: 3, recharge: 'chaqueCombat', debutCombat: 1, parTouche: { montant: 1, parRound: 2 } },
      actionsDeClasse: ['moine.mains-nues'],
      creation: { elements: ['psionique'] },
      mineurs: { liste: [], creation: 0 },
    });
    expect(moine.reservePP).toBeUndefined();
    expect(moine.attaquesSpeciales).toBeUndefined();
    expect(moine.voies).toEqual(['moine.poings', 'moine.elevation', 'moine.ascetisme', 'moine.souffles', 'moine.chaos']);
    expect(CLASSE_REFONTE.moine).toBe('moine');
    expect(referencesManquantes()).toEqual([]);
    const p = profilMagique(moine, choix({}), regles);
    expect(p.reservePP).toBe(0);
    expect(p.ressourceDeClasse).toEqual({ ressource: 'ki', max: 4 });
    expect(p.elements).toEqual({ psionique: 'adepte' });
    expect(p.attaques).toEqual(['arme.attaque', 'arme.opportunite']);
  });

  it('mains nues : d6, d8 au niveau 5, 2d6 au niveau 9', () => {
    expect([1, 4, 5, 8, 9, 12].map((niveau) => profilMagique(moine, choix({ niveau }), regles).deMainsNues)).toEqual(['1d6', '1d6', '1d8', '1d8', '2d6', '2d6']);
    expect(profilMagique(classeParId.get('guerrier')!, choix({ elementDepart: undefined }), regles).deMainsNues).toBeNull();
  });

  it('schéma : une ressource « à chaque combat » dit sa valeur de départ ; paliers des mains nues croissants dès le niveau 1', () => {
    const k = { ...moine, ressourceDeClasse: { ...moine.ressourceDeClasse!, debutCombat: undefined } };
    expect(schemaClasseRefonte.safeParse(k).error?.issues[0]?.message).toBe('une ressource qui repart à chaque combat dit sa valeur de départ');
    expect(schemaClasseRefonte.safeParse({ ...moine, mainsNues: [{ niveau: 5, des: '1d8' }] }).success).toBe(false);
    expect(schemaClasseRefonte.safeParse({ ...moine, mainsNues: [{ niveau: 1, des: '1d6' }, { niveau: 1, des: '1d8' }] }).success).toBe(false);
  });
});

describe('Voie des poings : les techniques (4a, 5a)', () => {
  it('Frappe nerveuse : 1 Ki, un coup à mains nues ; touchée, la cible sauvegarde (CON contre 10 + SAG) ; ratée, Ralentie 1 round', () => {
    // Le d20 d'attaque, la sauvegarde de la cible touchée, puis les dés de dégâts.
    const r = lancer({ action: a('moine.frappe-nerveuse'), alea: des([20, 10], [20, 1], [8, 3]) });
    expect(r.cout).toEqual({ pp: 0, pv: 0, ressources: { ki: 1 } });
    // DD 10 + SAG (3), pas 10 + FOR de l'arme.
    expect(r.jets.slice(0, 2).map((j) => [j.quoi, j.contre, j.reussi])).toEqual([
      ['attaque', 12, true],
      ['sauvegarde de CON', 13, false],
    ]);
    expect(r.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 5, typeDegats: 'physique', calcul: expect.any(String) },
      { type: 'etat', cible: 'a', etat: 'ralenti', duree: { rounds: 1 } },
    ]);
  });

  it('sauvegarde réussie : le coup porte, pas l’état ; attaque ratée : ni l’un ni l’autre, et pas de sauvegarde', () => {
    const sauve = lancer({ action: a('moine.frappe-nerveuse'), alea: des([20, 10], [20, 15], [8, 3]) });
    expect(sauve.changements.map((c) => c.type)).toEqual(['degats']);
    const rate = lancer({ action: a('moine.frappe-nerveuse'), alea: des([20, 2]) });
    expect(rate.changements).toEqual([]);
    expect(rate.jets).toHaveLength(1);
  });

  it('Balayage (DEX, Renversé), Paume (FOR, repoussé de 2, 2 Ki), Point vital (CON, Étourdi 1 round, 2 Ki)', () => {
    expect(a('moine.balayage')).toMatchObject({ cout: [{ ressource: 'ki', montant: 1 }], resolution: { sauvegardeSurTouche: 'DEX' } });
    const paume = lancer({ action: a('moine.paume'), alea: des([20, 10], [20, 1], [8, 3]) });
    expect(paume.cout.ressources).toEqual({ ki: 2 });
    expect(paume.changements[1]).toEqual({ type: 'deplacement', cible: 'a', sens: 'repousse', cases: 2 });
    expect(a('moine.point-vital')).toMatchObject({ resolution: { sauvegardeSurTouche: 'CON' }, effets: [{}, { etat: 'etourdi', duree: { rounds: 1 } }] });
  });

  it('Cent mains : 1x/combat, 2 Ki, une attaque par ennemi adjacent', () => {
    const r = lancer({ action: a('moine.cent-mains'), cibles: [ennemi('a'), ennemi('b')], alea: des([20, 10], [8, 1], [20, 2]) });
    expect(a('moine.cent-mains')).toMatchObject({ limite: '1x/combat', ciblage: { nbCibles: 8 } });
    expect(r.jets.filter((j) => j.quoi === 'attaque').map((j) => [j.cible, j.reussi])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('schéma : la sauvegarde après la touche suit une attaque ; une condition de sauvegarde la demande', () => {
    const fn = a('moine.frappe-nerveuse');
    expect(schemaAction.safeParse({ ...fn, resolution: { jet: 'aucun', sauvegardeSurTouche: 'CON' } }).error?.issues.map((i) => i.message)).toContain('une sauvegarde après la touche suit une attaque');
    expect(schemaAction.safeParse({ ...fn, resolution: { jet: 'attaque' } }).error?.issues[0]?.message).toBe(
      'une condition de sauvegarde demande un jet de sauvegarde, ou une sauvegarde après la touche',
    );
  });
});

describe('Voies de l’élévation et de l’ascétisme (6a, 7a)', () => {
  it('Réflexes du sage et Défense du corps libre : + mod de SAG en initiative, et en DEF sans armure', () => {
    expect(a('moine.reflexes-du-sage').effets[0]).toMatchObject({ cible: 'initiative', valeur: { mod: 'SAG' } });
    expect(lancer({ action: a('moine.defense-du-corps-libre'), cibles: [] }).changements[0]).toEqual({ type: 'bonus', cible: 'shen', sur: 'DEF', valeur: 3, duree: 'permanente' });
  });

  it('Précision instinctive : SAG contre la DEF ; réussie, la cible est Observée (+2 à sa prochaine attaque contre elle)', () => {
    const r = lancer({ action: a('moine.precision-instinctive'), alea: des([20, 10]) });
    expect(r.jets[0]).toMatchObject({ total: 13, contre: 12, reussi: true });
    expect(r.changements).toEqual([{ type: 'etat', cible: 'a', etat: 'observe', duree: 'prochainTour' }]);
    expect(lancer({ action: a('moine.precision-instinctive'), alea: des([20, 2]) }).changements).toEqual([]);
  });

  it('Avalanche 1x/combat, Tempête parfaite 1x/scénario, sans Ki', () => {
    expect([a('moine.avalanche-de-coups').limite, a('moine.tempete-parfaite').limite]).toEqual(['1x/combat', '1x/scenario']);
    expect(a('moine.avalanche-de-coups').cout).toBeUndefined();
  });

  it('Poing béni : +1d6 sacrés à la prochaine frappe ; Jeûne purificateur 1x/scène ; Illumination du juste : 3d6 sacrés aux ennemis, doublés contre le mal', () => {
    expect(lancer({ action: a('moine.poing-beni'), cibles: [] }).changements[0]).toMatchObject({ sur: 'degats', valeur: '1d6', typeDegats: 'sacre', consomme: 'prochaineFrappe' });
    expect(a('moine.jeune-purificateur').limite).toBe('1x/scene');
    const r = lancer({ action: a('moine.illumination-du-juste'), cibles: [], zone: [ennemi('a', { demonOuMortVivant: true })], alea: des([6, 1], [6, 1], [6, 1], [6, 4]) });
    expect(r.changements.slice(0, 2)).toEqual([
      { type: 'degats', cible: 'a', montant: 6, typeDegats: 'sacre', calcul: expect.any(String) },
      { type: 'soin', cible: 'shen', montant: 7 },
    ]);
  });
});

describe('Voie des souffles (8a, 9a)', () => {
  it('Poing élémentaire : 1 Ki, l’effet générique de l’élément choisi, sans jet de maîtrise', () => {
    const r = lancer({ action: a('moine.poing-elementaire'), element: { id: 'glace', maitrise: 'nonMaitrise' }, alea: des([20, 10], [8, 3]) });
    expect(r.cout.ressources).toEqual({ ki: 1 });
    expect(r.jets.some((j) => j.quoi.includes('maîtrise'))).toBe(false);
    expect(r.changements.map((c) => c.type)).toContain('etat');
  });

  it('Maîtrise du souffle (R2) : +1d6 de l’élément sur un coup à mains nues qui en porte un', () => {
    const p = profilMagique(moine, choix({ rangs: { 'moine.souffles': 2 } }), regles);
    expect(p.voie).toEqual({ maitriseDuSouffle: true });
    const r = lancer({ action: a('moine.poing-elementaire'), voie: p.voie, element: { id: 'feu', maitrise: 'adepte' }, alea: des([20, 10], [8, 3], [6, 4]) });
    expect(r.changements.filter((c) => c.type === 'degats').map((c) => c.type === 'degats' && [c.montant, c.typeDegats]).slice(0, 2)).toEqual([
      [5, 'feu'],
      [4, 'feu'],
    ]);
    // Sans élément, rien de plus.
    expect(lancer({ action: a('moine.mains-nues'), voie: p.voie, alea: des([20, 10], [8, 3]) }).changements).toHaveLength(1);
  });

  it('Fusion : 2 Ki, deux éléments, leurs deux effets génériques pleins, sans la signature de la paire', () => {
    const r = lancer({ action: a('moine.fusion'), element: { id: 'feu', maitrise: 'adepte' }, secondElement: { id: 'glace', maitrise: 'adepte' }, alea: des([20, 10], [8, 3], [4, 2], [20, 1]) });
    expect(r.cout).toEqual({ pp: 0, pv: 0, ressources: { ki: 2 } });
    const etats = r.changements.flatMap((c) => (c.type === 'etat' ? [c.etat] : []));
    expect(etats).toContain('brulure');
    expect(etats.length).toBeGreaterThanOrEqual(2);
  });

  it('Avatar des éléments : 1x/scénario, +4 DEF et son état, 3 + mod de SAG rounds ; Changement de souffle en texte', () => {
    expect(lancer({ action: a('moine.avatar-des-elements'), cibles: [] }).changements).toEqual([
      { type: 'bonus', cible: 'shen', sur: 'DEF', valeur: 4, duree: { rounds: 6 } },
      { type: 'etat', cible: 'shen', etat: 'avatar_des_elements', duree: { rounds: 6 } },
    ]);
    expect(profilMagique(moine, choix({ rangs: { 'moine.souffles': 3 } }), regles).textes).toEqual([
      'Changement de souffle : en réaction, il change l’élément d’un Poing élémentaire annoncé, avant le jet.',
    ]);
  });
});

describe('Voie du chaos (10a)', () => {
  it('Méditation interdite : +1d6 ou +2 en attaque ; Volonté DD 10, sinon le coup s’égare ; +1 Plongée', () => {
    expect(verifierChoix(moine, choix({ rangs: { 'moine.chaos': 1 } }), regles)).toEqual(['Voie du chaos : elle s’ouvre avec l’accord du MJ.']);
    const rate = lancer({ action: a('chaos.moine.meditation-interdite'), cibles: [soi], alea: des([20, 2]) });
    expect(rate.jets[0]).toMatchObject({ contre: 10, reussi: false });
    expect(rate.changements.map((c) => c.type)).toEqual(['bonus', 'narratif', 'ressource']);
    const att = lancer({ action: a('chaos.moine.meditation-interdite'), variante: 'attaque', cibles: [soi], alea: des([20, 15]) });
    expect(att.changements).toEqual([
      { type: 'bonus', cible: 'shen', sur: 'attaque', valeur: 2, duree: 'prochainTour' },
      { type: 'ressource', cible: 'shen', ressource: 'plongee', montant: 1 },
    ]);
  });

  it('Vision fracturée DD 12 et +2d6 ; Esprit fendu dès 5 de Corruption d’Âme ; Illumination noire, l’Avatar', () => {
    expect(a('chaos.moine.vision-fracturee')).toMatchObject({ jetDeChaos: true, resolution: { ddFixe: 12 } });
    expect(voieParId.get('moine.chaos')!.rangs[3]!.regles).toContainEqual({ type: 'texte', texte: 'Esprit fendu : il a des hallucinations hors combat ; les ordres monastiques se méfient de lui.' });
    const r = lancer({ action: a('chaos.moine.illumination-noire'), cibles: [] });
    expect(r.changements).toContainEqual({ type: 'etat', cible: 'shen', etat: 'illumination_noire', duree: { rounds: 6 } });
    expect(r.changements).toContainEqual({ type: 'ressource', cible: 'shen', ressource: 'corruptionAme', montant: 1 });
  });
});

describe('profil', () => {
  it('niveau 6 : Poings 3, Élévation 2, Souffles 1 ; budget respecté', () => {
    const c = choix({ rangs: { 'moine.poings': 3, 'moine.elevation': 2, 'moine.souffles': 1 } });
    expect(verifierChoix(moine, c, regles)).toEqual([]);
    expect(profilMagique(moine, c, regles).actions).toEqual([
      'moine.mains-nues',
      'moine.frappe-nerveuse', 'moine.balayage', 'moine.paume',
      'moine.reflexes-du-sage', 'moine.defense-du-corps-libre',
      'moine.poing-elementaire',
    ]);
  });
});
