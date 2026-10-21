import { describe, expect, it } from 'vitest';
import { profilMagique, verifierChoix, type ChoixDePersonnage } from '../../src/lib/effets/profil';
import { resoudreLancer, type ArmeEnJeu, type CibleEnJeu, type Lancer, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import { coutSort } from '../../src/lib/effets/cout';
import { actionParId, actionsCommunes, classeParId, elementParId, etatParId, referencesManquantes, verbesDeLEcole, voieParId } from '../../src/regles';
import { CLASSE_REFONTE } from '../../src/lib/fiche/refonte';
import { schemaAction } from '../../src/lib/schemas/effets';

/*
 * Le Druide de la refonte (lot L4.15) : Force de la nature, école de la
 * nature, voies des formes, du protecteur, du shaman et du chaos, sorts
 * mineurs. Doc « Refonte classes et magie — cadre » et décisions de Thomas
 * du 21/10/2026 (1a à 11a).
 */

const druide = classeParId.get('druide')!;
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
const lanceur: LanceurEnJeu = { id: 'brenn', camp: 'pj', def: 14, sauvegardes: sauv, etats: [], modMagie: 3, attaqueMagique: 5, niveau: 6, mods: { SAG: 3, CON: 1 }, pv: 40, pvMax: 40 };
const enForme = (etat: string): LanceurEnJeu => ({ ...lanceur, etats: [etat] });
const baton: ArmeEnJeu = { id: 'baton', famille: 'contondant', des: '1d6', attaque: 4, degats: 1 };
const ennemi = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ id, camp: 'ennemi', def: 12, sauvegardes: sauv, etats: [], distance: 1, ...patch });
const ami = (id: string): CibleEnJeu => ({ id, camp: 'pj', def: 12, sauvegardes: sauv, etats: [], distance: 3 });
const a = (id: string) => actionParId.get(id)!;
const force = { familles: druide.attaquesSpeciales!.familles, cout: { ressource: 'forceNature', montant: 2 } } as const;
const essai = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => resoudreLancer({ palier: 'I', lanceur, cibles: [ennemi('a')], arme: baton, attaquesSpeciales: force, alea: des(), ...l }, cat);
const lancer = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => {
  const r = essai(l);
  if (!r.ok) throw new Error(r.raison);
  return r;
};
const choix = (c: Partial<ChoixDePersonnage>): ChoixDePersonnage => ({ niveau: 6, modMagie: 3, elementDepart: 'terre', rangs: {}, mineurs: [], ...c });

describe('la classe (1a, 2a, 3a, 4a, 11a)', () => {
  it('hybride, d8, SAG ; PP réduits ; Force de la nature 3 + niveau / 3, repos court ; Communication animale de classe', () => {
    expect(druide).toMatchObject({
      famille: 'hybride',
      deVie: 8,
      caracMagie: 'SAG',
      reservePP: { base: 4, parNiveau: 2, parMod: 1 },
      ressourceDeClasse: { ressource: 'forceNature', base: 3, diviseurNiveau: 3, recharge: 'reposCourt' },
      actionsDeClasse: ['druide.communication-animale'],
      creation: { ecoles: [], elements: ['terre', 'eau', 'glace'], maitriseElementDepart: 'adepte' },
      mineurs: { creation: 1, plusUnAuNiveau: [7] },
    });
    expect(druide.voies).toEqual(['druide.elements', 'druide.formes', 'druide.protecteur', 'druide.shaman', 'druide.chaos']);
    expect(CLASSE_REFONTE.druide).toBe('druide');
    expect(referencesManquantes()).toEqual([]);
    const p = profilMagique(druide, choix({}), regles);
    expect(p.reservePP).toBe(4 + 12 + 3);
    expect(p.ressourceDeClasse).toEqual({ ressource: 'forceNature', max: 5 });
    expect(p.elements).toEqual({ terre: 'adepte' });
  });

  it('attaque spéciale contondante (Coup assommant, le bâton) à 2 Force de la nature', () => {
    const p = profilMagique(druide, choix({}), regles);
    expect(p.attaquesSpeciales).toEqual({ familles: ['contondant'], cout: { ressource: 'forceNature', montant: 2 } });
    expect(p.attaques).toEqual(['arme.attaque', 'arme.opportunite', 'arme.coup-assommant']);
    expect(lancer({ action: a('arme.coup-assommant'), alea: des([20, 15], [6, 2]) }).cout).toEqual({ pp: 0, pv: 0, ressources: { forceNature: 2 } });
  });

  it('Communication animale : passive, hors combat', () => {
    expect(a('druide.communication-animale')).toMatchObject({ nature: 'passif', etiquettes: ['exploration', 'social'] });
  });
});

describe('Voie des éléments naturels, son école (5a)', () => {
  it('les cinq verbes de la nature, aux coûts du tableau validé (2 / 3 / 4 au R1 … 6 au R5)', () => {
    expect(verbesDeLEcole('nature').map((v) => v.id)).toEqual(['nature.enchevetrement', 'nature.vague', 'nature.givre', 'nature.tremblement', 'nature.tempete']);
    const pp = (id: string, palier: 'I' | 'II' | 'III') => {
      const c = coutSort(a(id), { palier });
      if (!c.ok) throw new Error(c.raison);
      return c.pp;
    };
    expect([pp('nature.enchevetrement', 'I'), pp('nature.enchevetrement', 'II'), pp('nature.enchevetrement', 'III')]).toEqual([2, 3, 4]);
    expect([pp('nature.vague', 'I'), pp('nature.vague', 'II'), pp('nature.givre', 'I'), pp('nature.givre', 'II'), pp('nature.tremblement', 'I'), pp('nature.tempete', 'I')]).toEqual([3, 4, 4, 5, 5, 6]);
  });

  it('paliers par rang ; la Tempête monte l’élément de départ à Maître', () => {
    const p = profilMagique(druide, choix({ rangs: { 'druide.elements': 5 } }), regles);
    expect(p.maitriseEcole).toBe('adepte');
    expect(p.verbes).toEqual([
      { id: 'nature.enchevetrement', palier: 'III' },
      { id: 'nature.vague', palier: 'II' },
      { id: 'nature.givre', palier: 'II' },
      { id: 'nature.tremblement', palier: 'I' },
      { id: 'nature.tempete', palier: 'I' },
    ]);
    expect(p.elements).toEqual({ terre: 'maitre' });
    expect(profilMagique(druide, choix({ rangs: { 'druide.elements': 4 } }), regles).elements).toEqual({ terre: 'adepte' });
  });

  it('Enchevêtrement : FOR, Immobilisé 1 round ; II : zone 3 × 3 en terrain difficile ; III : 2 rounds', () => {
    const rate = lancer({ action: a('nature.enchevetrement'), alea: des([20, 1]) });
    expect(rate.changements).toEqual([{ type: 'etat', cible: 'a', etat: 'immobilise', duree: { rounds: 1 } }]);
    expect(rate.jets[0]).toMatchObject({ quoi: 'sauvegarde de FOR', contre: 13, reussi: false });
    expect(lancer({ action: a('nature.enchevetrement'), alea: des([20, 20]) }).changements).toEqual([]);
    const ii = lancer({ action: a('nature.enchevetrement'), palier: 'II', alea: des([20, 20]) });
    expect(ii.changements).toEqual([{ type: 'terrain', nature: 'difficile', duree: { rounds: 2 } }]);
    const iii = lancer({ action: a('nature.enchevetrement'), palier: 'III', alea: des([20, 1]) });
    expect(iii.changements[0]).toEqual({ type: 'etat', cible: 'a', etat: 'immobilise', duree: { rounds: 2 } });
  });

  it('Vague : ligne de 3, 2d6 et repoussé de 2, FOR pour moitié sans recul ; II : 3d6 et 3 cases', () => {
    expect(a('nature.vague').zone).toEqual({ forme: 'ligne', taille: 3, origine: 'lanceur', filtre: 'tous', degressif: false });
    const rate = lancer({ action: a('nature.vague'), cibles: [], zone: [ennemi('a')], alea: des([20, 1], [6, 3], [6, 4]) });
    expect(rate.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 7, typeDegats: 'eau', calcul: expect.any(String) },
      { type: 'deplacement', cible: 'a', sens: 'repousse', cases: 2 },
    ]);
    const sauve = lancer({ action: a('nature.vague'), cibles: [], zone: [ennemi('a')], alea: des([20, 20], [6, 3], [6, 4]) });
    expect(sauve.changements).toEqual([{ type: 'degats', cible: 'a', montant: 3, typeDegats: 'eau', calcul: expect.any(String) }]);
    const ii = lancer({ action: a('nature.vague'), palier: 'II', cibles: [], zone: [ennemi('a')], alea: des([20, 1], [6, 1], [6, 1], [6, 1]) });
    expect(ii.changements.map((c) => (c.type === 'degats' ? c.montant : c.type === 'deplacement' ? c.cases : null))).toEqual([3, 3]);
  });

  it('Givre : 2d6 glace, Ralenti sur un échec, sol glissant 2 rounds ; Tremblement : rayon 2, 2d6, Renversé, DEX', () => {
    const g = lancer({ action: a('nature.givre'), cibles: [], zone: [ennemi('a')], alea: des([20, 1], [6, 2], [6, 2]) });
    expect(g.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 4, typeDegats: 'glace', calcul: expect.any(String) },
      { type: 'etat', cible: 'a', etat: 'ralenti', duree: { rounds: 2 } },
      { type: 'terrain', nature: 'glissant', duree: { rounds: 2 } },
    ]);
    expect(a('nature.tremblement')).toMatchObject({ zone: { forme: 'cercle', taille: 2 }, resolution: { sauvegarde: 'DEX', siSauvegarde: 'moitie' } });
    const t = lancer({ action: a('nature.tremblement'), cibles: [], zone: [ennemi('a')], alea: des([20, 1], [6, 6], [6, 6]) });
    expect(t.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 12, typeDegats: 'terre', calcul: expect.any(String) },
      { type: 'etat', cible: 'a', etat: 'renverse', duree: { rounds: 1 } },
    ]);
  });

  it('Tempête : 1x/combat, rayon 2, 3 rounds, 2d6 par round avec l’effet de son élément', () => {
    expect(a('nature.tempete')).toMatchObject({
      limite: '1x/combat',
      zone: { forme: 'cercle', taille: 2 },
      persistance: { type: 'zone', duree: { rounds: 3 }, quand: 'debutTour' },
      element: { application: 'chaqueCible' },
    });
    const r = lancer({ action: a('nature.tempete'), element: { id: 'terre', maitrise: 'maitre' }, cibles: [], zone: [ennemi('a')], alea: des([20, 1], [6, 3], [6, 3]) });
    expect(r.changements[0]).toMatchObject({ type: 'degats', cible: 'a', montant: 6, typeDegats: 'terre' });
  });

  it('boost de Force de la nature : 1 point, zone +1 case ou +1 round ; jamais de Sacré ; sans zone, pas de case en plus', () => {
    const r = lancer({ action: a('nature.givre'), boost: 'plusUnRound', cibles: [], zone: [ennemi('a')], alea: des([20, 1], [6, 2], [6, 2]) });
    expect(r.cout).toEqual({ pp: 4, pv: 0, ressources: { forceNature: 1 } });
    expect(r.changements.slice(1)).toEqual([
      { type: 'etat', cible: 'a', etat: 'ralenti', duree: { rounds: 3 } },
      { type: 'terrain', nature: 'glissant', duree: { rounds: 3 } },
    ]);
    expect(lancer({ action: a('nature.tremblement'), boost: 'plusUneCase', cibles: [], zone: [ennemi('a')], alea: des([20, 20], [6, 1], [6, 1]) }).cout).toEqual({
      pp: 5,
      pv: 0,
      ressources: { forceNature: 1 },
    });
    expect(essai({ action: a('nature.enchevetrement'), boost: 'plusUneCase' })).toEqual({ ok: false, raison: 'Enchevêtrement n’a pas de zone à agrandir' });
    expect(essai({ action: a('nature.vague'), boost: 'sansSauvegarde' }).ok).toBe(false);
  });
});

describe('Voie des formes (6a)', () => {
  it('prendre une forme : 1 Force de la nature, jusqu’à la fin du combat, à la place de la précédente', () => {
    const r = lancer({ action: a('druide.forme-du-loup'), cibles: [] });
    expect(r.cout).toEqual({ pp: 0, pv: 0, ressources: { forceNature: 1 } });
    expect(r.changements).toEqual([
      { type: 'retraitEtat', cible: 'brenn', etats: ['forme_ours', 'forme_aigle', 'forme_primordiale', 'forme_du_chaos_sauvage'], nombre: 1 },
      { type: 'etat', cible: 'brenn', etat: 'forme_loup', duree: 'finCombat' },
    ]);
    expect(etatParId.get('forme_loup')).toMatchObject({ formeAnimale: true, modificateurs: [{ cible: 'deplacement', valeur: 2 }] });
  });

  it('Morsure du loup : seulement en loup ; attaque magique, 1d8 + SAG, Saignement', () => {
    expect(essai({ action: a('druide.morsure-du-loup') })).toEqual({ ok: false, raison: 'Morsure du loup : seulement en forme Forme du loup' });
    const r = lancer({ action: a('druide.morsure-du-loup'), lanceur: enForme('forme_loup'), alea: des([20, 10], [8, 5]) });
    expect(r.jets[0]).toMatchObject({ contre: 12, reussi: true });
    expect(r.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 8, typeDegats: 'physique', calcul: expect.any(String) },
      { type: 'etat', cible: 'a', etat: 'saignement', duree: { rounds: 2 } },
    ]);
  });

  it('Ours : 2 × niveau PV temporaires ; griffes 1d10 + SAG ; la charge renverse', () => {
    expect(lancer({ action: a('druide.forme-de-l-ours'), cibles: [] }).changements[2]).toEqual({ type: 'pvTemp', cible: 'brenn', montant: 12 });
    const ours = enForme('forme_ours');
    expect(lancer({ action: a('druide.griffes-de-l-ours'), lanceur: ours, alea: des([20, 10], [10, 4]) }).changements).toEqual([
      { type: 'degats', cible: 'a', montant: 7, typeDegats: 'physique', calcul: expect.any(String) },
    ]);
    const charge = lancer({ action: a('druide.griffes-de-l-ours'), variante: 'charge', lanceur: ours, alea: des([20, 10], [10, 4]) });
    expect(charge.changements[1]).toEqual({ type: 'etat', cible: 'a', etat: 'renverse', duree: { rounds: 1 } });
    expect(essai({ action: a('druide.griffes-de-l-ours'), lanceur: enForme('forme_loup') }).ok).toBe(false);
  });

  it('Masque du prédateur : +2 en attaque en forme animale seulement (passif à condition, lu par le combat)', () => {
    expect(a('druide.masque-du-predateur').effets[0]).toMatchObject({ cible: 'attaqueMagique', valeur: 2, condition: 'enFormeAnimale' });
    const attaque = { ...a('druide.morsure-du-loup'), enForme: undefined, effets: [{ type: 'degats', des: '1', plusMod: false, typeDegats: 'physique', condition: 'enFormeAnimale', vise: 'cible' }] } as const;
    const sous = (etats: string[]) => lancer({ action: attaque as never, lanceur: { ...lanceur, etats }, alea: des([20, 15]) }).changements;
    expect(sous(['forme_aigle'])).toHaveLength(1);
    expect(sous(['marque'])).toEqual([]);
  });

  it('Aigle : serres 1d6 + SAG ; Forme primordiale : 1x/scénario, 2 Force de la nature, 4 × niveau PV temporaires, 2d8 + SAG', () => {
    expect(a('druide.serres-de-l-aigle').effets[0]).toMatchObject({ des: '1d6', plusMod: true });
    const p = lancer({ action: a('druide.forme-primordiale'), cibles: [] });
    expect(a('druide.forme-primordiale').limite).toBe('1x/scenario');
    expect(p.cout).toEqual({ pp: 0, pv: 0, ressources: { forceNature: 2 } });
    expect(p.changements[2]).toEqual({ type: 'pvTemp', cible: 'brenn', montant: 24 });
    expect(a('druide.frappe-primordiale')).toMatchObject({ enForme: ['forme_primordiale'], effets: [{ des: '2d8', plusMod: true }] });
  });
});

describe('Voies du protecteur et du shaman (7a)', () => {
  it('capacités à PP fixes, sans jet, pendant 3 + mod de SAG rounds', () => {
    const egide = lancer({ action: a('druide.egide-naturelle'), cibles: [ami('b')] });
    expect(egide.cout).toEqual({ pp: 2, pv: 0 });
    expect(egide.jets).toEqual([]);
    expect(egide.changements).toEqual([{ type: 'bonus', cible: 'b', sur: 'DEF', valeur: 3, duree: { rounds: 6 } }]);
    expect(lancer({ action: a('druide.ecorce-partagee'), cibles: [ami('b')] }).changements[0]).toMatchObject({ sur: 'reductionDegats', valeur: 3, duree: { rounds: 6 } });
    expect(lancer({ action: a('druide.totem-du-courage'), cibles: [ami('b')] }).changements[0]).toMatchObject({ sur: 'attaque', valeur: 2 });
    expect(lancer({ action: a('druide.totem-de-la-force-sauvage'), cibles: [ami('b')] }).cout.pp).toBe(3);
    expect(lancer({ action: a('druide.totem-de-la-velocite'), cibles: [ami('b')] }).cout.pp).toBe(4);
    expect(lancer({ action: a('druide.egide-naturelle'), cibles: [ami('b')], lanceur: { ...lanceur, modMagie: -4 } }).changements[0]).toMatchObject({ duree: { rounds: 1 } });
  });

  it('Rempart vivant : 4 PP, alliés de la zone +2 DEF et 1d6 PV temporaires', () => {
    const r = lancer({ action: a('druide.rempart-vivant'), cibles: [], zone: [ami('b'), ennemi('a')], alea: des([6, 4]) });
    expect(r.cout.pp).toBe(4);
    expect(r.changements).toEqual([
      { type: 'bonus', cible: 'b', sur: 'DEF', valeur: 2, duree: { rounds: 6 } },
      { type: 'pvTemp', cible: 'b', montant: 4 },
    ]);
  });

  it('Sanctuaire et Convocation : 6 PP, 1x/scénario, 5 + mod de SAG rounds', () => {
    expect(a('druide.sanctuaire-du-gardien')).toMatchObject({ limite: '1x/scenario', cout: [{ ressource: 'pp', montant: 6 }] });
    const c = lancer({ action: a('druide.convocation-des-esprits'), cibles: [], zone: [ami('b')] });
    expect(c.cout.pp).toBe(6);
    expect(c.changements.map((x) => x.type === 'bonus' && [x.sur, x.valeur, x.duree])).toEqual(
      ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].map((k) => [k, 2, { rounds: 8 }]),
    );
  });

  it('Symbiose : +2 DEF en milieu naturel seulement ; Multitude des esprits en texte', () => {
    const s = a('druide.symbiose-protectrice');
    expect(s.effets[0]).toMatchObject({ cible: 'DEF', valeur: 2, condition: 'milieuNaturel' });
    expect(lancer({ action: s, cibles: [], milieuNaturel: true }).changements).toEqual([{ type: 'bonus', cible: 'brenn', sur: 'DEF', valeur: 2, duree: 'permanente' }]);
    expect(lancer({ action: s, cibles: [] }).changements).toEqual([]);
    expect(profilMagique(druide, choix({ rangs: { 'druide.shaman': 2 } }), regles).textes).toEqual([
      'Multitude des esprits : deux totems actifs à la fois, sur deux alliés différents (un seul sinon).',
    ]);
  });
});

describe('Voie du chaos (8a)', () => {
  it('sur accord du MJ ; Chair instable : 1d6, poussée +1d6 pour +1 Plongée', () => {
    expect(voieParId.get('druide.chaos')!.surAccordDuMJ).toBe(true);
    expect(verifierChoix(druide, choix({ rangs: { 'druide.chaos': 1 } }), regles)).toEqual(['Voie du chaos : elle s’ouvre avec l’accord du MJ.']);
    const r = lancer({ action: a('chaos.druide.chair-instable'), variante: 'poussee', alea: des([20, 10], [6, 2], [6, 3]) });
    expect(r.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 2, typeDegats: 'chaotique', calcul: expect.any(String) },
      { type: 'degats', cible: 'a', montant: 3, typeDegats: 'chaotique', calcul: expect.any(String) },
      { type: 'ressource', cible: 'brenn', ressource: 'plongee', montant: 1 },
    ]);
  });

  it('Fléau rampant : aura d’une case, alliés compris, 1d4 par tour ; Écorce corrompue dès 5 de Corruption d’Âme, les bêtes se méfient', () => {
    expect(a('chaos.druide.fleau-rampant')).toMatchObject({ jetDeChaos: true, zone: { forme: 'cercle', taille: 1, origine: 'lanceur', filtre: 'tous' }, persistance: { quand: 'debutTour' } });
    expect(a('chaos.druide.ecorce-corrompue')).toMatchObject({ corruptionAmeMin: 5, effets: [{ cible: 'DEF', valeur: 2 }] });
    expect(voieParId.get('druide.chaos')!.rangs[3]!.regles).toContainEqual({ type: 'texte', texte: 'Écorce corrompue : les bêtes se méfient de lui.' });
  });

  it('Forme du chaos sauvage : l’Avatar, une forme ; ses griffes 2d8 ; +3 Plongée, +1 Corruption d’Âme', () => {
    const r = lancer({ action: a('chaos.druide.forme-du-chaos-sauvage'), cibles: [] });
    expect(r.changements).toContainEqual({ type: 'etat', cible: 'brenn', etat: 'forme_du_chaos_sauvage', duree: { rounds: 6 } });
    expect(r.changements).toContainEqual({ type: 'ressource', cible: 'brenn', ressource: 'corruptionAme', montant: 1 });
    expect(etatParId.get('forme_du_chaos_sauvage')!.formeAnimale).toBe(true);
    expect(essai({ action: a('chaos.druide.griffes-du-chaos') }).ok).toBe(false);
    expect(lancer({ action: a('chaos.druide.griffes-du-chaos'), lanceur: enForme('forme_du_chaos_sauvage'), alea: des([20, 10], [8, 1], [8, 1]) }).changements[0]).toMatchObject({ montant: 2 });
  });
});

describe('sorts mineurs (9a)', () => {
  it('la liste : Fouet d’épines, Gourdin, Bouclier de terre, Pousse, Druidisme', () => {
    expect(druide.mineurs.liste).toEqual(['mineur.fouet-d-epines', 'mineur.gourdin', 'mineur.bouclier-de-terre', 'mineur.pousse', 'mineur.druidisme']);
  });

  it('Fouet d’épines : le dé des mineurs (1d8 au niveau 6) et la cible tirée d’une case ; Gourdin : un cran au-dessus', () => {
    expect(lancer({ action: a('mineur.fouet-d-epines'), alea: des([20, 10], [8, 4]) }).changements).toEqual([
      { type: 'degats', cible: 'a', montant: 4, typeDegats: 'physique', calcul: expect.any(String) },
      { type: 'deplacement', cible: 'a', sens: 'attire', cases: 1 },
    ]);
    // Niveau 6 : 1d8 pour les mineurs, 1d10 pour le Gourdin.
    const g = lancer({ action: a('mineur.gourdin'), alea: des([20, 10], [10, 9]) });
    expect(g.jets[1]).toMatchObject({ des: [9] });
    expect(lancer({ action: a('mineur.gourdin'), lanceur: { ...lanceur, niveau: 1 }, alea: des([20, 10], [8, 7]) }).jets[1]).toMatchObject({ des: [7] });
  });

  it('des crans ne montent que le dé d’un sort mineur', () => {
    const g = a('mineur.gourdin');
    const sansProgression = { ...g, effets: [{ ...g.effets[0]!, progression: undefined }] };
    expect(schemaAction.safeParse(sansProgression).error?.issues[0]?.message).toBe('des crans montent le dé d’un sort mineur');
  });

  it('Bouclier de terre : +1 DEF à un allié jusqu’à son prochain tour', () => {
    expect(lancer({ action: a('mineur.bouclier-de-terre'), cibles: [ami('b')] }).changements).toEqual([{ type: 'bonus', cible: 'b', sur: 'DEF', valeur: 1, duree: 'prochainTour' }]);
  });
});

describe('profil', () => {
  it('niveau 6 : Éléments 2, Formes 2, Protecteur 1 ; deux sorts mineurs au niveau 7', () => {
    const c = choix({ rangs: { 'druide.elements': 2, 'druide.formes': 2, 'druide.protecteur': 2 }, mineurs: ['mineur.gourdin'] });
    expect(verifierChoix(druide, c, regles)).toEqual([]);
    const p = profilMagique(druide, c, regles);
    expect(p.verbes.map((v) => v.id)).toEqual(['nature.enchevetrement', 'nature.vague']);
    expect(p.actions).toEqual([
      'druide.communication-animale',
      'druide.forme-du-loup', 'druide.morsure-du-loup', 'druide.masque-du-predateur',
      'druide.egide-naturelle', 'druide.symbiose-protectrice',
    ]);
    expect(p.mineursMax).toBe(1);
    expect(profilMagique(druide, { ...c, niveau: 7 }, regles).mineursMax).toBe(2);
  });
});
