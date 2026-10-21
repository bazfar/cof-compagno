import { describe, expect, it } from 'vitest';
import { profilMagique, verifierChoix, type ChoixDePersonnage } from '../../src/lib/effets/profil';
import { resoudreLancer, type ArmeEnJeu, type CibleEnJeu, type Lancer, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import { actionParId, actionsCommunes, classeParId, elementParId, etatParId, referencesManquantes, voieParId } from '../../src/regles';

/*
 * Le Chevalier de la refonte (lot L4.13) : Honneur, attaques spéciales,
 * Interposition, voies du noble, du commandant, du bouclier, du paladin et
 * du chaos. Doc « Refonte classes et magie — cadre » et décisions de
 * Thomas du 21/10/2026 (1a à 12a).
 */

const chevalier = classeParId.get('chevalier')!;
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
const lanceur: LanceurEnJeu = { id: 'aldric', camp: 'pj', def: 18, sauvegardes: sauv, etats: [], modMagie: 2, attaqueMagique: 0, niveau: 6, mods: { FOR: 3, DEX: 0, CON: 2, CHA: 2 }, pv: 50, pvMax: 50 };
const epee: ArmeEnJeu = { id: 'epee_longue', famille: 'tranchantLourd', des: '1d8', attaque: 5, degats: 3, modCarac: 3 };
const ennemi = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ id, camp: 'ennemi', def: 12, sauvegardes: sauv, etats: [], distance: 1, ...patch });
const allie = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ ...ennemi(id), camp: 'pj', ...patch });
const a = (id: string) => actionParId.get(id)!;
const honneur = { familles: chevalier.attaquesSpeciales!.familles, cout: { ressource: 'honneur', montant: 2 } } as const;
const essai = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => resoudreLancer({ palier: 'I', lanceur, cibles: [ennemi('a')], arme: epee, attaquesSpeciales: honneur, alea: des(), ...l }, cat);
const lancer = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => {
  const r = essai(l);
  if (!r.ok) throw new Error(r.raison);
  return r;
};
const choix = (c: Partial<ChoixDePersonnage>): ChoixDePersonnage => ({ niveau: 6, modMagie: 2, rangs: {}, mineurs: [], ...c });

describe('la classe (1a, 2a, 3a, 10a)', () => {
  it('physique, d10, CHA de classe, sans PP ; Honneur 3 + niveau / 3, repos long ; Interposition de classe', () => {
    expect(chevalier).toMatchObject({
      famille: 'physique',
      deVie: 10,
      caracMagie: 'CHA',
      ressourceDeClasse: { ressource: 'honneur', base: 3, diviseurNiveau: 3, recharge: 'reposLong', parDegatsSubis: 0 },
      actionsDeClasse: ['chevalier.interposition'],
    });
    expect(chevalier.reservePP).toBeUndefined();
    expect(chevalier.voies).toEqual(['chevalier.noble', 'chevalier.commandant', 'chevalier.bouclier', 'chevalier.paladin', 'chevalier.chaos']);
    expect(referencesManquantes()).toEqual([]);
  });

  it('attaques spéciales : familles de contact et bouclier, pas l’arc ni l’arbalète ; 2 Honneur', () => {
    const p = profilMagique(chevalier, choix({}), regles);
    expect(p.ressourceDeClasse).toEqual({ ressource: 'honneur', max: 5 });
    expect(p.attaquesSpeciales?.cout).toEqual({ ressource: 'honneur', montant: 2 });
    expect(p.attaques).toContain('arme.coup-de-bouclier');
    expect(p.attaques.some((id) => ['arme.tir-epinglant', 'arme.carreau-lourd'].includes(id))).toBe(false);
    const r = lancer({ action: a('arme.fendre'), alea: des([20, 10], [8, 4]) });
    expect(r.cout).toEqual({ pp: 0, pv: 0, ressources: { honneur: 2 } });
  });

  it('Interposition (3a) : réaction gratuite quand un allié au contact est ciblé', () => {
    expect(a('chevalier.interposition')).toMatchObject({ nature: 'reaction', action: 'reaction', declencheur: 'allieCible', ciblage: { camp: 'allie', portee: 'contact' } });
    expect(lancer({ action: a('chevalier.interposition'), cibles: [allie('b')] }).cout).toEqual({ pp: 0, pv: 0 });
  });
});

describe('Voie du noble (5a)', () => {
  it('Prestance martiale : + mod de CHA à l’initiative, permanent', () => {
    expect(lancer({ action: a('chevalier.prestance-martiale'), cibles: [] }).changements).toEqual([{ type: 'bonus', cible: 'aldric', sur: 'initiative', valeur: 2, duree: 'permanente' }]);
  });

  it('Défi loyal : 1 Honneur, Volonté contre DD 10 + CHA ; raté, Défié jusqu’au prochain tour', () => {
    const r = lancer({ action: a('chevalier.defi-loyal'), alea: des([20, 5]) });
    expect(r.cout).toEqual({ pp: 0, pv: 0, ressources: { honneur: 1 } });
    expect(r.jets[0]).toMatchObject({ quoi: 'sauvegarde de Volonte', contre: 12, reussi: false });
    expect(r.changements).toEqual([{ type: 'etat', cible: 'a', etat: 'defie', duree: 'prochainTour' }]);
    expect(lancer({ action: a('chevalier.defi-loyal'), alea: des([20, 15]) }).changements).toEqual([]);
    expect(a('chevalier.defi-loyal').horsCombat).toBeTruthy();
  });

  it('Autorité de sang, Duel d’honneur (1x/combat), Souverain (1x/scénario, 3 + CHA rounds, alliés à 5 cases)', () => {
    expect(lancer({ action: a('chevalier.autorite-de-sang'), cibles: [], zone: [allie('b')] }).changements).toEqual([{ type: 'bonus', cible: 'b', sur: 'sauvegardeVolonte', valeur: 1, duree: 'permanente' }]);
    expect(a('chevalier.duel-d-honneur')).toMatchObject({ limite: '1x/combat' });
    expect(lancer({ action: a('chevalier.duel-d-honneur') }).changements[0]).toEqual({ type: 'etat', cible: 'a', etat: 'duel', duree: 'finCombat' });
    expect(a('chevalier.souverain-du-champ-de-bataille')).toMatchObject({ limite: '1x/scenario', zone: { taille: 5, filtre: 'allies' }, persistance: { type: 'zone', duree: { base: 3, plusModCible: 'CHA' } } });
  });
});

describe('Voie du commandant (6a)', () => {
  it('Ordre bref en action mineure : +2 en attaque à un allié ; Coordination seulement immobile', () => {
    expect(a('chevalier.ordre-bref').action).toBe('mineure');
    expect(lancer({ action: a('chevalier.ordre-bref'), cibles: [allie('b')] }).changements).toEqual([{ type: 'bonus', cible: 'b', sur: 'attaque', valeur: 2, duree: 'prochainTour' }]);
    const zone = [allie('b', { distance: 2 })];
    expect(lancer({ action: a('chevalier.coordination'), cibles: [], zone, immobile: true }).changements).toHaveLength(1);
    expect(lancer({ action: a('chevalier.coordination'), cibles: [], zone }).changements).toEqual([]);
  });

  it('Élan tactique et Charge collective : 1x/combat ; la charge marque la cible', () => {
    expect([a('chevalier.elan-tactique').limite, a('chevalier.charge-collective').limite]).toEqual(['1x/combat', '1x/combat']);
    expect(lancer({ action: a('chevalier.charge-collective') }).changements[0]).toEqual({ type: 'etat', cible: 'a', etat: 'marque', duree: 'finCombat' });
  });
});

describe('Voie du bouclier (4b, 7a)', () => {
  it('Garde rapprochée : 1 Honneur, Protégé jusqu’à la fin du combat ; Maniement expert : attaque spéciale à 1 Honneur', () => {
    const r = lancer({ action: a('chevalier.garde-rapprochee'), cibles: [allie('b')] });
    expect(r.cout).toEqual({ pp: 0, pv: 0, ressources: { honneur: 1 } });
    expect(r.changements).toEqual([{ type: 'etat', cible: 'b', etat: 'protege', duree: 'finCombat' }]);
    const p = profilMagique(chevalier, choix({ rangs: { 'chevalier.bouclier': 1 } }), regles);
    expect(p.attaquesSpeciales?.cout).toEqual({ ressource: 'honneur', montant: 1 });
  });

  it('Garde à distance : l’Interposition à 2 cases ; Bouclier vivant en réaction ; Mur de boucliers : −2 aux dégâts des alliés au contact ; Sacrifice 1x/scénario', () => {
    expect(a('chevalier.garde-a-distance')).toMatchObject({ declencheur: 'allieCible', ciblage: { portee: 2 } });
    expect(a('chevalier.bouclier-vivant')).toMatchObject({ action: 'reaction' });
    expect(lancer({ action: a('chevalier.mur-de-boucliers'), cibles: [], zone: [allie('b')] }).changements).toEqual([{ type: 'bonus', cible: 'b', sur: 'reductionDegats', valeur: 2, duree: 'permanente' }]);
    expect(a('chevalier.sacrifice-ultime').limite).toBe('1x/scenario');
  });
});

describe('Voie du paladin (8a)', () => {
  it('Mise en accusation : 1x/combat, état Accusé (−4 en attaque et en DEF), le MJ juge la culpabilité', () => {
    expect(a('chevalier.mise-en-accusation')).toMatchObject({ limite: '1x/combat', manuel: expect.stringContaining('MJ') });
    expect(lancer({ action: a('chevalier.mise-en-accusation') }).changements).toEqual([{ type: 'etat', cible: 'a', etat: 'accuse', duree: 'finCombat' }]);
    expect(etatParId.get('accuse')!.modificateurs).toEqual([{ cible: 'attaque', valeur: -4 }, { cible: 'DEF', valeur: -4 }]);
  });

  it('Châtiment du juste : +1d6 sacrés seulement contre une cible accusée', () => {
    const accusee = lancer({ action: a('chevalier.chatiment-du-juste'), cibles: [ennemi('a', { etats: ['accuse'] })], alea: des([20, 10], [8, 4], [6, 5]) });
    expect(accusee.changements.map((c) => c.type === 'degats' && [c.montant, c.typeDegats])).toEqual([[7, 'physique'], [5, 'sacre']]);
    const autre = lancer({ action: a('chevalier.chatiment-du-juste'), alea: des([20, 10], [8, 4]) });
    expect(autre.changements).toHaveLength(1);
    // Une cible seulement marquée (Charge collective, Marque du chasseur) n'est pas accusée.
    expect(lancer({ action: a('chevalier.chatiment-du-juste'), cibles: [ennemi('a', { etats: ['marque'] })], alea: des([20, 10], [8, 4]) }).changements).toHaveLength(1);
  });

  it('Sentence finale : 1x/scénario, +6d6 sacrés contre une cible accusée, doublés contre démons et morts-vivants', () => {
    expect(a('chevalier.sentence-finale').limite).toBe('1x/scenario');
    const r = lancer({ action: a('chevalier.sentence-finale'), cibles: [ennemi('a', { etats: ['accuse'], demonOuMortVivant: true })], alea: des([20, 10], [8, 4], [6, 1], [6, 1], [6, 1], [6, 1], [6, 1], [6, 1]) });
    expect(r.changements.at(-1)).toMatchObject({ typeDegats: 'sacre', montant: 12 });
  });

  it('Regard du juste : 1x/scène, social, avec un usage hors combat', () => {
    expect(a('chevalier.regard-du-juste')).toMatchObject({ limite: '1x/scene', etiquettes: ['social'] });
    expect(a('chevalier.regard-du-juste').horsCombat?.paliers).toHaveLength(1);
  });
});

describe('Voie du chaos (9a)', () => {
  it('sur accord du MJ ; R2 Don corrompu commun ; contrepartie du R4 : les ordres de chevalerie', () => {
    const v = voieParId.get('chevalier.chaos')!;
    expect(v.surAccordDuMJ).toBe(true);
    expect(v.rangs[1]!.nom).toBe('Don corrompu');
    expect(v.rangs[3]!.regles).toContainEqual({ type: 'texte', texte: 'Marque du serment brisé : les ordres de chevalerie le rejettent.' });
    expect(verifierChoix(chevalier, choix({ rangs: { 'chevalier.chaos': 1 } }), regles)).toEqual(['Voie du chaos : elle s’ouvre avec l’accord du MJ.']);
  });

  it('Lame liée : +1d6 chaotiques à la prochaine frappe, +1 Plongée ; Frappe du pacte : +2d6, +2 Plongée, jet de chaos', () => {
    expect(lancer({ action: a('chaos.chevalier.lame-liee'), cibles: [] }).changements).toEqual([
      { type: 'bonus', cible: 'aldric', sur: 'degats', valeur: '1d6', duree: 'prochainTour', typeDegats: 'chaotique', consomme: 'prochaineFrappe' },
      { type: 'ressource', cible: 'aldric', ressource: 'plongee', montant: 1 },
    ]);
    expect(a('chaos.chevalier.frappe-du-pacte')).toMatchObject({ jetDeChaos: true, resolution: { jet: 'attaque' } });
  });

  it('Marque du serment brisé : dès 5 de Corruption d’Âme, +2 DEF ou +1d8 sur l’arme ; Avatar du pacte : +4 DEF, +2d6, 3 + CON rounds, +3 Plongée et +1 Corruption d’Âme', () => {
    expect(a('chaos.chevalier.marque-du-serment-brise')).toMatchObject({ corruptionAmeMin: 5, variantes: [{ id: 'arme', palier: 'I' }] });
    const av = a('chaos.chevalier.avatar-du-pacte');
    expect(av.limite).toBe('1x/scenario');
    expect(av.effets).toContainEqual({ type: 'ressource', ressource: 'plongee', montant: 3, vise: 'lanceur' });
    expect(av.effets).toContainEqual({ type: 'ressource', ressource: 'corruptionAme', montant: 1, vise: 'lanceur' });
    expect(av.effets[0]).toMatchObject({ cible: 'DEF', valeur: 4, duree: { base: 3, plusModCible: 'CON' } });
  });
});

describe('profil complet', () => {
  it('niveau 6, Noble 2, Bouclier 2, Paladin 3 : actions dans l’ordre des voies, budget de 8 points sur 12', () => {
    const c = choix({ rangs: { 'chevalier.noble': 2, 'chevalier.bouclier': 2, 'chevalier.paladin': 3 } });
    expect(verifierChoix(chevalier, c, regles)).toEqual([]);
    const p = profilMagique(chevalier, c, regles);
    expect(p.actions).toEqual([
      'chevalier.interposition',
      'chevalier.prestance-martiale', 'chevalier.defi-loyal',
      'chevalier.garde-rapprochee', 'chevalier.garde-a-distance',
      'chevalier.regard-du-juste', 'chevalier.chatiment-du-juste', 'chevalier.mise-en-accusation',
    ]);
  });
});

describe('Hyrma passe à la refonte (12a)', () => {
  it('sa fiche v1 se convertit : Honneur plein (3 + 3 / 3), jauge de la fiche, Interposition et attaques spéciales parmi ses actions', async () => {
    const { readFileSync } = await import('node:fs');
    const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
    const R = await import('../../src/lib/fiche/refonte');
    const A = await import('../../src/lib/fiche/actions-fiche');
    const v1 = ficheDepuisV1(JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches.find((f: { nom: string }) => f.nom.startsWith('Hyrma')), 'u', 1).fiche;
    expect(R.etatRefonte(v1)).toBe('aConvertir');
    const v2 = R.convertirFiche(v1, { ...R.refonteVierge(chevalier, v1.niveau), rangs: { 'chevalier.bouclier': 2, 'chevalier.noble': 2 } });
    expect(v2.refonte.jauges).toMatchObject({ endurance: null, inspiration: null, honneur: 4, sacre: null, plongee: 0 });
    expect(A.jaugesDeLaFiche(v2)[0]).toEqual({ cle: 'honneur', nom: 'Honneur', actuel: 4, max: 4 });
    expect(A.changerJauge(v2, 'honneur', 9).jauges.honneur).toBe(4);
    const l = A.actionsDeLaFiche(v2, { attaqueContact: 4, attaqueDistance: 0, attaqueMagique: 0, mod: () => 1, armure: true });
    expect(l.find((x) => x.id === 'chevalier.interposition')).toMatchObject({ groupe: 'reaction', voie: null });
    // Elle porte une lance (perforante) : seule l'attaque spéciale de cette
    // famille paraît, celle du tranchant lourd est masquée (décision du 21/10).
    expect(l.find((x) => x.id === 'arme.coup-d-estoc')?.cout).toBe('1 Honneur');
    expect(l.find((x) => x.id === 'arme.fendre')).toBeUndefined();
  });
});

describe('montée', () => {
  it('l’Honneur gagne l’écart de son maximum, sans rendre ce qui a été dépensé ; les autres jauges restent absentes', async () => {
    const M = await import('../../src/lib/fiche/montee-refonte');
    const j = { endurance: null, inspiration: null, honneur: 1, sacre: null, plongee: 0, corruptionAme: 0 };
    expect(M.jaugesMontees(chevalier, 2, j)).toEqual({ ...j, honneur: 2 });
    expect(M.jaugesMontees(chevalier, 3, j)).toEqual(j);
    const { honneur: _h, ...sansHonneur } = j;
    expect('honneur' in M.jaugesMontees(classeParId.get('guerrier')!, 2, { ...sansHonneur, endurance: 3 })).toBe(false);
  });
});
