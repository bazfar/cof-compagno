import { describe, expect, it } from 'vitest';
import { profilMagique, verifierChoix, type ChoixDePersonnage } from '../../src/lib/effets/profil';
import { coutSort } from '../../src/lib/effets/cout';
import { resoudreLancer, type CibleEnJeu, type Lancer, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import { actionParId, actionsCommunes, classeParId, elementParId, etatParId, invocationParId, referencesManquantes, verbesDeLEcole, voieParId } from '../../src/regles';
import { CLASSE_REFONTE } from '../../src/lib/fiche/refonte';

/*
 * Le Nécromancien de la refonte (lot L4.17) : Âmes, écoles Outre-tombe et
 * Malédiction, Voies du sang, des âmes, du seuil et du chaos. Doc
 * « Refonte classes et magie — cadre », « Nécromancien (validé) », et
 * décisions de Thomas du 22/10/2026 (1a à 8a).
 */

const necro = classeParId.get('necromancien')!;
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
const lanceur: LanceurEnJeu = { id: 'morvan', camp: 'pj', def: 11, sauvegardes: sauv, etats: [], modMagie: 3, attaqueMagique: 5, niveau: 6, mods: { INT: 3 }, pv: 20, pvMax: 20 };
const ennemi = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ id, camp: 'ennemi', def: 12, sauvegardes: sauv, etats: [], distance: 1, ...patch });
const allie = (id: string): CibleEnJeu => ({ id, camp: 'pj', def: 12, sauvegardes: sauv, etats: [], distance: 1 });
const a = (id: string) => actionParId.get(id)!;
const essai = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => resoudreLancer({ palier: 'I', lanceur, cibles: [ennemi('a')], alea: des(), ...l }, cat);
const lancer = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => {
  const r = essai(l);
  if (!r.ok) throw new Error(r.raison);
  return r;
};
const choix = (c: Partial<ChoixDePersonnage>): ChoixDePersonnage => ({ niveau: 6, modMagie: 3, ecole: 'outre-tombe', elementDepart: 'sang', rangs: {}, mineurs: [], ...c });
const pp = (id: string, palier: 'I' | 'II' | 'III' = 'I') => {
  const c = coutSort(a(id), { palier });
  if (!c.ok) throw new Error(c.raison);
  return c.pp;
};

describe('la classe (1a, 2a, 5a)', () => {
  it('lanceur, d4, INT ; PP 4 + 2 × niveau + 2 × INT ; Outre-tombe ou Malédiction ; sang Adepte ; 2 sorts mineurs, +1 aux niveaux 5 et 9', () => {
    expect(necro).toMatchObject({
      famille: 'magique',
      deVie: 4,
      caracMagie: 'INT',
      reservePP: { base: 4, parNiveau: 2, parMod: 2 },
      reserveAmes: { max: 3, moisson: { action: 'necromancien.moisson-d-ames', max: 5 } },
      creation: { ecoles: ['outre-tombe', 'malediction'], elements: ['sang'], maitriseElementDepart: 'adepte' },
      mineurs: { liste: ['mineur.trait-necrotique', 'mineur.frisson', 'mineur.sentir-la-mort', 'mineur.preserver', 'mineur.main-froide'], creation: 2, plusUnAuNiveau: [5, 9] },
    });
    expect(necro.voies).toEqual(['necromancien.ecole', 'necromancien.sang', 'necromancien.ames', 'necromancien.seuil', 'necromancien.chaos']);
    expect(CLASSE_REFONTE.necromancien).toBe('necromancien');
    expect(referencesManquantes()).toEqual([]);
    const p = profilMagique(necro, choix({}), regles);
    expect(p.reservePP).toBe(4 + 12 + 6);
    expect(p.elements).toEqual({ sang: 'adepte' });
  });

  it('les sorts mineurs : Trait nécrotique (dé des mineurs, 10 cases) et Frisson (−1, Volonté)', () => {
    const t = lancer({ action: a('mineur.trait-necrotique'), alea: des([20, 10], [8, 5]) });
    expect(t.changements[0]).toMatchObject({ type: 'degats', montant: 5, typeDegats: 'necrotique' });
    expect(lancer({ action: a('mineur.frisson'), alea: des([20, 1]) }).changements).toEqual([{ type: 'bonus', cible: 'a', sur: 'attaque', valeur: -1, duree: 'prochainTour' }]);
  });
});

describe('Outre-tombe (3a, 4a)', () => {
  it('cinq rangs, le passif Renfort macabre au rang 4 ; coûts du tableau', () => {
    expect(verbesDeLEcole('outre-tombe').map((v) => [v.id, v.nature])).toEqual([
      ['outre-tombe.relever', 'verbe'],
      ['outre-tombe.epouvante', 'verbe'],
      ['outre-tombe.pourriture', 'verbe'],
      ['outre-tombe.renfort-macabre', 'passif'],
      ['outre-tombe.ossuaire', 'verbe'],
    ]);
    expect([pp('outre-tombe.relever'), pp('outre-tombe.relever', 'II'), pp('outre-tombe.relever', 'III'), pp('outre-tombe.epouvante'), pp('outre-tombe.pourriture'), pp('outre-tombe.ossuaire')]).toEqual([2, 3, 4, 3, 4, 6]);
  });

  it('au rang 4, le passif rejoint les actions, pas les verbes ; l’école passe Maître', () => {
    const p = profilMagique(necro, choix({ rangs: { 'necromancien.ecole': 4 } }), regles);
    expect(p.verbes.map((v) => v.id)).toEqual(['outre-tombe.relever', 'outre-tombe.epouvante', 'outre-tombe.pourriture']);
    expect(p.actions).toContain('outre-tombe.renfort-macabre');
    expect(p.maitriseEcole).toBe('maitre');
  });

  it('Relever : un zombie, un squelette au palier II, deux zombies au III ; les jetons des morts-vivants', () => {
    expect(lancer({ action: a('outre-tombe.relever'), cibles: [] }).changements).toEqual([{ type: 'invocation', creature: 'zombie', nombre: 1, duree: 'finCombat' }]);
    expect(lancer({ action: a('outre-tombe.relever'), palier: 'II', cibles: [] }).changements[0]).toMatchObject({ creature: 'squelette' });
    expect(lancer({ action: a('outre-tombe.relever'), palier: 'III', cibles: [] }).changements[0]).toMatchObject({ creature: 'zombie', nombre: 2 });
    expect(invocationParId.get('zombie')).toMatchObject({ pv: { parNiveau: 2 }, def: { base: 10 }, deplacement: 3, attaque: { des: '1d6', plusModMagie: true }, remousParRound: 1 });
    expect(invocationParId.get('squelette')).toMatchObject({ def: { base: 13 }, attaque: { des: '1d6', plusModMagie: true } });
  });

  it('Pourriture : 2d6 nécrotiques, Affaibli 2 rounds sur un échec, CON pour moitié ; II en zone 3 × 3', () => {
    const r = lancer({ action: a('outre-tombe.pourriture'), alea: des([20, 1], [6, 3], [6, 3]) });
    expect(r.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 6, typeDegats: 'necrotique', calcul: expect.any(String) },
      { type: 'etat', cible: 'a', etat: 'affaibli', duree: { rounds: 2 } },
    ]);
    const ii = lancer({ action: a('outre-tombe.pourriture'), palier: 'II', cibles: [], zone: [ennemi('a'), ennemi('b')], alea: des([6, 3], [6, 3], [20, 1], [20, 20]) });
    expect(ii.changements.filter((c) => c.type === 'etat').map((c) => c.cible)).toEqual(['a']);
  });

  it('Ossuaire : 1x/combat, rayon 2, 3 rounds, ennemis seulement, DEX pour moitié', () => {
    expect(a('outre-tombe.ossuaire')).toMatchObject({ limite: '1x/combat', zone: { forme: 'cercle', taille: 2, filtre: 'ennemis' }, persistance: { duree: { rounds: 3 } }, resolution: { sauvegarde: 'DEX', siSauvegarde: 'moitie' } });
  });
});

describe('Malédiction', () => {
  it('Œil mauvais : −2 sur l’attaque, la DEF ou les sauvegardes, 3 rounds ; II −3 ; III deux cibles', () => {
    expect(lancer({ action: a('malediction.oeil-mauvais'), variante: 'sauvegardes', alea: des([20, 1]) }).changements).toEqual([{ type: 'bonus', cible: 'a', sur: 'sauvegardes', valeur: -2, duree: { rounds: 3 } }]);
    expect(lancer({ action: a('malediction.oeil-mauvais'), palier: 'III', cibles: [ennemi('a'), ennemi('b')], alea: des([20, 1], [20, 1]) }).changements.map((c) => c.type === 'bonus' && c.valeur)).toEqual([-3, -3]);
  });

  it('Malédiction profonde : Maudit jusqu’à la fin du combat (−2 aux sauvegardes) ; Emprise : Dominé 2 rounds, pas les boss', () => {
    expect(etatParId.get('maudit')).toMatchObject({ modificateurs: [{ cible: 'sauvegardes', valeur: -2 }] });
    expect(lancer({ action: a('malediction.malediction-profonde'), alea: des([20, 1]) }).changements).toEqual([{ type: 'etat', cible: 'a', etat: 'maudit', duree: 'finCombat' }]);
    const boss = lancer({ action: a('malediction.emprise-des-ombres'), cibles: [ennemi('a', { boss: true })], alea: des([20, 1]) });
    expect(boss.changements.every((c) => c.type === 'narratif')).toBe(true);
    expect([pp('malediction.malediction-profonde'), pp('malediction.emprise-des-ombres')]).toEqual([5, 6]);
  });
});

describe('Voie du sang', () => {
  it('Morsure du sang : 1d6 + mod, la moitié revient en PV ; Vol de vitalité : 2d6, la moitié', () => {
    const m = lancer({ action: a('sang.morsure-du-sang'), alea: des([20, 10], [6, 4]) });
    expect(m.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 7, typeDegats: 'sang', calcul: expect.any(String) },
      { type: 'soin', cible: 'morvan', montant: 3 },
    ]);
    const v = lancer({ action: a('sang.vol-de-vitalite'), alea: des([20, 10], [6, 3], [6, 2]) });
    expect(v.changements[1]).toEqual({ type: 'soin', cible: 'morvan', montant: 2 });
  });

  it('Étreinte exsangue : tout revient en PV, +2 à toutes ses caractéristiques s’il touche, rien s’il rate', () => {
    const r = lancer({ action: a('sang.etreinte-exsangue'), alea: des([20, 10], [6, 1], [6, 1], [6, 1], [6, 1]) });
    expect(r.changements[1]).toEqual({ type: 'soin', cible: 'morvan', montant: 4 });
    expect(r.changements.filter((c) => c.type === 'bonus').map((c) => c.type === 'bonus' && c.sur)).toEqual(['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA']);
    expect(lancer({ action: a('sang.etreinte-exsangue'), alea: des([20, 1]) }).changements).toEqual([]);
  });

  it('rang 3 : le sang passe Maître ; Sang impie rend 2d6 PV quand il abat', () => {
    expect(profilMagique(necro, choix({ rangs: { 'necromancien.sang': 3 } }), regles).elements).toEqual({ sang: 'maitre' });
    expect(a('necromancien.sang-impie')).toMatchObject({ declencheur: 'ennemiAbattu', effets: [{ type: 'soin', des: '2d6' }, {}] });
  });
});

describe('Voie des âmes (2a)', () => {
  it('Capture d’âme : +1 âme si l’attaque magique touche ; II à 10 cases ; III deux âmes', () => {
    expect(lancer({ action: a('ames.capture-d-ame'), alea: des([20, 10]) }).changements[0]).toEqual({ type: 'ressource', cible: 'morvan', ressource: 'ame', montant: 1 });
    expect(lancer({ action: a('ames.capture-d-ame'), alea: des([20, 1]) }).changements.filter((c) => c.type === 'ressource')).toEqual([]);
    const iii = lancer({ action: a('ames.capture-d-ame'), palier: 'III', cibles: [ennemi('a'), ennemi('b')], alea: des([20, 10], [20, 10]) });
    expect(iii.changements.filter((c) => c.type === 'ressource')).toHaveLength(2);
  });

  it('Libération vengeresse : 1 âme au lieu de PP, 2d6 + mod ; II 3d6', () => {
    const r = lancer({ action: a('ames.liberation-vengeresse'), alea: des([20, 10], [6, 2], [6, 2]) });
    expect(r.cout).toEqual({ pp: 0, pv: 0, ressources: { ame: 1 } });
    expect(r.changements[0]).toMatchObject({ montant: 7 });
    expect(a('ames.liberation-vengeresse').paliers.II).toEqual({ effets: { '0': { des: '3d6' } } });
  });

  it('Rempart d’âmes : réaction, 1 âme ; Moisson : 1x/scénario, 3 rounds ; la fiche porte le réceptacle à 5', () => {
    expect(a('necromancien.rempart-d-ames')).toMatchObject({ action: 'reaction', cout: [{ ressource: 'ame', montant: 1 }] });
    expect(lancer({ action: a('necromancien.moisson-d-ames'), cibles: [] }).changements).toEqual([{ type: 'etat', cible: 'morvan', etat: 'moisson_d_ames', duree: { rounds: 3 } }]);
  });
});

describe('Voie du seuil (6a)', () => {
  it('Suture : 1d6 + mod ; sans corps, 1d4 PV pour lui ; une âme dépensée, 2d6 + mod', () => {
    expect(lancer({ action: a('seuil.suture'), cibles: [allie('b')], alea: des([6, 2]) }).changements).toEqual([{ type: 'soin', cible: 'b', montant: 5 }]);
    const sans = lancer({ action: a('seuil.suture'), variante: 'sans-corps', cibles: [allie('b')], alea: des([6, 2], [4, 3]) });
    expect(sans.changements[1]).toMatchObject({ type: 'degats', cible: 'morvan', montant: 3 });
    const ame = lancer({ action: a('seuil.suture'), variante: 'ame', cibles: [allie('b')], alea: des([6, 2], [6, 2]) });
    expect(ame.changements).toEqual([
      { type: 'soin', cible: 'b', montant: 7 },
      { type: 'ressource', cible: 'morvan', ressource: 'ame', montant: -1 },
    ]);
  });

  it('Transfusion : X PV choisis, au plus 2 × niveau, payés par le Nécromancien', () => {
    expect(essai({ action: a('seuil.transfusion'), cibles: [allie('b')] })).toEqual({ ok: false, raison: 'Transfusion : combien de PV (1 à 12) ?' });
    expect(essai({ action: a('seuil.transfusion'), cibles: [allie('b')], montant: 13 }).ok).toBe(false);
    const r = lancer({ action: a('seuil.transfusion'), cibles: [allie('b')], montant: 8 });
    expect(r.cout).toEqual({ pp: 4, pv: 8 });
    expect(r.changements[0]).toEqual({ type: 'soin', cible: 'b', montant: 8 });
  });

  it('Transfusion II, sur un ennemi : CON pour résister ; ratée, il perd X PV et l’allié choisi les reçoit', () => {
    const r = lancer({ action: a('seuil.transfusion'), palier: 'II', variante: 'sur-un-ennemi', allie: allie('b'), montant: 6, alea: des([20, 1]) });
    expect(r.cout).toEqual({ pp: 5, pv: 0 });
    expect(r.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 6, typeDegats: 'necrotique', calcul: 'Transfusion (6)' },
      { type: 'soin', cible: 'b', montant: 6 },
    ]);
    expect(lancer({ action: a('seuil.transfusion'), palier: 'II', variante: 'sur-un-ennemi', allie: allie('b'), montant: 6, alea: des([20, 20]) }).changements).toEqual([]);
    expect(essai({ action: a('seuil.transfusion'), palier: 'II', variante: 'sur-un-ennemi', montant: 6 })).toEqual({ ok: false, raison: 'Transfusion : quel allié reçoit les PV ?' });
  });

  it('Sang figé : réaction 1x/combat, 5 PP ; Retour : 1x/scénario, 6 PP, à 1 PV', () => {
    expect([pp('seuil.sang-fige'), pp('seuil.retour')]).toEqual([5, 6]);
    expect(a('seuil.sang-fige')).toMatchObject({ action: 'reaction', limite: '1x/combat' });
    expect(lancer({ action: a('seuil.retour'), cibles: [allie('b')] }).changements[0]).toEqual({ type: 'soin', cible: 'b', montant: 1 });
  });
});

describe('Voie du chaos (7a)', () => {
  it('Étincelle 2d8 à 20 cases ; Symbiose : +1d6 ou +2 de réduction, lieux saints fermés ; Avatar 3 + INT rounds', () => {
    expect(verifierChoix(necro, choix({ rangs: { 'necromancien.chaos': 1 } }), regles)).toEqual(['Voie du chaos : elle s’ouvre avec l’accord du MJ.']);
    expect(a('chaos.necromancien.etincelle-chaotique')).toMatchObject({ ciblage: { portee: 20 }, effets: [{ des: '2d8', typeDegats: 'chaotique' }, {}] });
    expect(voieParId.get('necromancien.chaos')!.rangs[3]!.regles).toContainEqual({ type: 'texte', texte: 'Symbiose du chaos : les lieux saints lui sont fermés.' });
    const r = lancer({ action: a('chaos.necromancien.avatar-du-chaos'), cibles: [] , lanceur: { ...lanceur, mods: { INT: 3 } } });
    expect(r.changements[0]).toEqual({ type: 'bonus', cible: 'morvan', sur: 'attaqueMagique', valeur: 4, duree: { rounds: 6 } });
  });
});

describe('profil', () => {
  it('niveau 6 : École 2, Sang 2, Seuil 1, deux sorts mineurs', () => {
    const c = choix({ rangs: { 'necromancien.ecole': 2, 'necromancien.sang': 2, 'necromancien.seuil': 1 }, mineurs: ['mineur.trait-necrotique', 'mineur.frisson', 'mineur.preserver'] });
    expect(verifierChoix(necro, c, regles)).toEqual([]);
    const p = profilMagique(necro, c, regles);
    expect(p.verbes.map((v) => v.id)).toEqual(['outre-tombe.relever', 'outre-tombe.epouvante', 'sang.morsure-du-sang', 'seuil.suture']);
    expect(p.actions).toEqual(['necromancien.regeneration-sanguine']);
  });
});
