import { describe, expect, it } from 'vitest';
import { corruptionParLaPlongee, seuilsFranchis } from '../../src/lib/effets/chaos';
import { profilMagique, type ChoixDePersonnage } from '../../src/lib/effets/profil';
import { resoudreLancer, type CibleEnJeu, type Lancer, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import { schemaAction } from '../../src/lib/schemas/effets';
import { actionParId, classeParId, elementParId, etatParId, referencesManquantes, voieParId } from '../../src/regles';

/*
 * Voies du chaos des cinq classes du groupe (lot L4.9) : gabarit commun,
 * Plongée et Corruption d'Âme, Don corrompu, d20 de chaos, Avatars.
 * Doc « Refonte classes et magie — cadre » et décisions du 21/10/2026.
 */

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
const lanceur: LanceurEnJeu = {
  id: 'ombre',
  camp: 'pj',
  def: 14,
  sauvegardes: sauv,
  etats: [],
  modMagie: 3,
  attaqueMagique: 5,
  niveau: 6,
  mods: { CON: 2, INT: 3, CHA: 3 },
  pv: 30,
  pvMax: 30,
  plongee: 0,
  corruptionAme: 5,
};
const ennemi = (id: string, patch: Partial<CibleEnJeu> = {}): CibleEnJeu => ({ id, camp: 'ennemi', def: 12, sauvegardes: sauv, etats: [], distance: 3, ...patch });
const soi = { ...lanceur, distance: 0 };
const a = (id: string) => actionParId.get(id)!;
const essai = (l: Partial<Lancer> & Pick<Lancer, 'action'>) => resoudreLancer({ palier: 'I', lanceur, cibles: [ennemi('a')], alea: des(), ...l }, cat);
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
const ressource = (r: { changements: readonly unknown[] }, quoi: string) =>
  (r.changements as { type: string; ressource?: string; montant?: number }[]).filter((c) => c.type === 'ressource' && c.ressource === quoi).map((c) => c.montant);

describe('jauges (lib/effets/chaos.ts)', () => {
  it('Corruption d’Âme : +1 par multiple de 6 de Plongée dépassé (1b), pas à 6 tout juste', () => {
    expect([corruptionParLaPlongee(0, 6), corruptionParLaPlongee(5, 7), corruptionParLaPlongee(6, 7), corruptionParLaPlongee(7, 12)]).toEqual([0, 1, 1, 0]);
    expect([corruptionParLaPlongee(7, 13), corruptionParLaPlongee(0, 13), corruptionParLaPlongee(13, 19), corruptionParLaPlongee(8, 8)]).toEqual([1, 2, 1, 0]);
  });

  it('mutations aux paliers 1, 4 et 7 de Corruption d’Âme ; Rupture à 10 (v1)', () => {
    expect(seuilsFranchis(0, 1)).toEqual({ mutations: [1], rupture: false });
    expect(seuilsFranchis(3, 7)).toEqual({ mutations: [2, 3], rupture: false });
    expect(seuilsFranchis(9, 10)).toEqual({ mutations: [], rupture: true });
  });
});

describe('gabarit commun', () => {
  const classes = ['guerrier', 'magicien', 'envouteur', 'pretre', 'barde'];

  it('chaque classe du groupe a sa Voie du chaos, sur accord du MJ ; R2 Don corrompu ; tout ce qu’elle cite existe', () => {
    for (const k of classes) {
      expect(classeParId.get(k)!.voies.at(-1)).toBe(`${k}.chaos`);
      const v = voieParId.get(`${k}.chaos`)!;
      expect(v.surAccordDuMJ).toBe(true);
      expect(v.rangs[1]!.regles).toEqual([{ type: 'capacite', nom: 'donCorrompu', limite: '1x/round' }]);
      expect(v.rangs[3]!.regles.some((r) => r.type === 'texte')).toBe(true);
    }
    expect(referencesManquantes()).toEqual([]);
  });

  it('R3 : +2 Plongée et d20 de chaos ; R4 : dès 5 de Corruption d’Âme ; R5 : 1x/scénario, +3 Plongée, +1 Corruption d’Âme (3b)', () => {
    for (const k of classes) {
      const v = voieParId.get(`${k}.chaos`)!;
      const r3 = a(v.rangs[2]!.actions[0]!);
      expect(r3.jetDeChaos).toBe(true);
      expect(r3.effets).toContainEqual({ type: 'ressource', ressource: 'plongee', montant: 2, vise: 'lanceur' });
      for (const id of v.rangs[3]!.actions) expect(a(id).corruptionAmeMin).toBe(5);
      const r5 = a(v.rangs[4]!.actions[0]!);
      expect(r5.limite).toBe('1x/scenario');
      expect(r5.effets.slice(-2)).toEqual([
        { type: 'ressource', ressource: 'plongee', montant: 3, vise: 'lanceur' },
        { type: 'ressource', ressource: 'corruptionAme', montant: 1, vise: 'lanceur' },
      ]);
    }
  });

  it('aucune action de chaos ne coûte de PP (1a)', () => {
    for (const x of [...actionParId.values()].filter((y) => y.id.startsWith('chaos.'))) expect((x.cout ?? []).filter((c) => c.ressource === 'pp')).toEqual([]);
  });
});

describe('Plongée et Corruption d’Âme dans le moteur', () => {
  it('Vision interdite : +2 Plongée ; de 5 à 7, +1 Corruption d’Âme ; de 7 à 9, rien', () => {
    const r = lancer({ action: a('chaos.magicien.vision-interdite'), cibles: [], zone: [], lanceur: { ...lanceur, plongee: 5 }, alea: des([20, 3]) });
    expect(r.cout).toEqual({ pp: 0, pv: 0 });
    expect(ressource(r, 'plongee')).toEqual([2]);
    expect(ressource(r, 'corruptionAme')).toEqual([1]);
    expect(ressource(lancer({ action: a('chaos.magicien.vision-interdite'), cibles: [], zone: [], lanceur: { ...lanceur, plongee: 7 }, alea: des([20, 3]) }), 'corruptionAme')).toEqual([]);
  });

  it('un Avatar à 11 de Plongée : +3 (14) passe 12, +1 ; et +1 directe (3b)', () => {
    const r = lancer({ action: a('chaos.guerrier.dechainement'), cibles: [], lanceur: { ...lanceur, plongee: 11 } });
    expect(ressource(r, 'corruptionAme')).toEqual([1, 1]);
  });

  it('d20 de chaos (5a) : 18 à 20, mutation du palier 1', () => {
    expect(lancer({ action: a('chaos.magicien.vision-interdite'), cibles: [], zone: [], alea: des([20, 18]) }).changements).toContainEqual({ type: 'mutation', cible: 'ombre', palier: 1 });
    expect(lancer({ action: a('chaos.magicien.vision-interdite'), cibles: [], zone: [], alea: des([20, 17]) }).changements.some((c) => c.type === 'mutation')).toBe(false);
  });

  it('un R4 attend 5 de Corruption d’Âme', () => {
    expect(refus({ action: a('chaos.envouteur.murmure-terrifiant'), lanceur: { ...lanceur, corruptionAme: 4 } })).toBe('Murmure terrifiant : actif dès 5 de Corruption d’Âme');
  });
});

describe('Don corrompu (4a)', () => {
  it('+1d6 chaotiques sur la cible touchée, une fois ; +1 Plongée', () => {
    const r = lancer({ action: a('chaos.magicien.glimpse-du-vide'), voie: { chaos: { rang: 2, donCorrompu: 'plus1d6' } }, alea: des([20, 10], [8, 3], [8, 4], [6, 5]) });
    expect(r.changements.filter((c) => c.type === 'degats')).toEqual([
      { type: 'degats', cible: 'a', montant: 7, typeDegats: 'chaotique', calcul: '7 (3 + 4)' },
      { type: 'degats', cible: 'a', montant: 5, typeDegats: 'chaotique', calcul: 'Don corrompu 1d6 (5)' },
    ]);
    expect(ressource(r, 'plongee')).toEqual([1, 1]);
  });

  it('relance du dé le plus bas : 1, 5, 3, 6 → le 1 devient 4', () => {
    const r = lancer({ action: a('chaos.magicien.vision-interdite'), cibles: [], zone: [ennemi('b')], voie: { chaos: { rang: 2, donCorrompu: 'relance' } }, alea: des([20, 2], [20, 3], [6, 1], [6, 5], [6, 3], [6, 6], [6, 4]) });
    expect(r.changements[0]).toMatchObject({ type: 'degats', cible: 'b', montant: 18 });
  });

  it('il vient au rang 2, et force une action qui fait des dégâts', () => {
    expect(refus({ action: a('chaos.magicien.glimpse-du-vide'), voie: { chaos: { rang: 1, donCorrompu: 'plus1d6' } } })).toBe('le Don corrompu vient au rang 2 de la Voie du chaos');
    expect(refus({ action: a('chaos.barde.chant-corrupteur'), voie: { chaos: { rang: 2, donCorrompu: 'plus1d6' } } })).toBe('le Don corrompu force un sort ou une attaque qui fait des dégâts');
  });
});

describe('par classe', () => {
  it('Guerrier : Premier sang +1 Plongée au coup encaissé ; Frappe vengeresse dépense 1 Plongée ; Rage, Volonté DD 12 contre lui-même', () => {
    expect(a('chaos.guerrier.premier-sang')).toMatchObject({ nature: 'passif', declencheur: 'attaqueSubie' });
    const fv = lancer({ action: a('chaos.guerrier.frappe-vengeresse'), cibles: [], lanceur: { ...lanceur, plongee: 2 } });
    expect(fv.cout).toEqual({ pp: 0, pv: 0, ressources: { plongee: 1 } });
    expect(fv.changements[0]).toMatchObject({ sur: 'degats', valeur: '1d6', typeDegats: 'chaotique', consomme: 'prochaineFrappe' });
    expect(refus({ action: a('chaos.guerrier.frappe-vengeresse'), cibles: [] })).toBe('pas assez de Plongée');
    const rage = lancer({ action: a('chaos.guerrier.rage-incontrolee'), cibles: [soi], alea: des([20, 5], [20, 8]) });
    expect(rage.dd).toBe(12);
    expect(rage.changements.filter((c) => c.type === 'narratif')).toHaveLength(2);
  });

  it('Avatars : 3 + mod de la caractéristique de classe rounds (3a)', () => {
    expect(lancer({ action: a('chaos.guerrier.dechainement'), cibles: [] }).changements[0]).toEqual({ type: 'bonus', cible: 'ombre', sur: 'attaque', valeur: 4, duree: { rounds: 5 } });
    expect(lancer({ action: a('chaos.magicien.avatar-du-vide'), cibles: [] }).changements[0]).toMatchObject({ sur: 'attaqueMagique', duree: { rounds: 6 } });
    const asc = lancer({ action: a('chaos.envouteur.ascension-chaotique'), cibles: [] });
    expect(asc.changements.slice(0, 2)).toEqual([
      { type: 'ressource', cible: 'ombre', ressource: 'pp', montant: 'vider' },
      { type: 'etat', cible: 'ombre', etat: 'ascension_chaotique', duree: { rounds: 6 } },
    ]);
    expect(refus({ action: a('chaos.guerrier.dechainement'), cibles: [], lanceur: { ...lanceur, mods: {} } })).toBe('il faut le mod de CON de ombre');
  });

  it('Envoûteur : Murmure terrifiant, 19–20 la cible tombe (boss : 3d10), 16–18 1d10, sinon Confus 3 rounds', () => {
    const rate = [20, 2] as [number, number];
    expect(lancer({ action: a('chaos.envouteur.murmure-terrifiant'), alea: des(rate, [20, 19]) }).changements).toEqual([{ type: 'tombe', cible: 'a' }]);
    const boss = lancer({ action: a('chaos.envouteur.murmure-terrifiant'), cibles: [ennemi('a', { boss: true })], alea: des(rate, [20, 20], [10, 4], [10, 5], [10, 6]) });
    expect(boss.changements.map((c) => c.type)).toEqual(['narratif', 'degats']);
    expect(boss.changements[1]).toMatchObject({ montant: 15, typeDegats: 'chaotique' });
    expect(lancer({ action: a('chaos.envouteur.murmure-terrifiant'), alea: des(rate, [20, 17], [10, 7]) }).changements).toEqual([
      { type: 'degats', cible: 'a', montant: 7, typeDegats: 'chaotique', calcul: '7 (7)' },
    ]);
    expect(lancer({ action: a('chaos.envouteur.murmure-terrifiant'), alea: des(rate, [20, 5]) }).changements).toEqual([{ type: 'etat', cible: 'a', etat: 'confus', duree: { rounds: 3 } }]);
    expect(lancer({ action: a('chaos.envouteur.murmure-terrifiant'), alea: des([20, 15]) }).changements).toEqual([]);
  });

  it('Envoûteur : Éclat chaotique, un sort d’Illusion inflige aussi 1d6 à l’ennemi qu’il affecte, +1 Plongée ; pas à un allié', () => {
    const r = lancer({ action: a('illusion.leurre'), voie: { chaos: { rang: 1, eclatChaotique: true } }, alea: des([20, 2], [6, 4]) });
    expect(r.changements).toContainEqual({ type: 'degats', cible: 'a', montant: 4, typeDegats: 'chaotique', calcul: 'Éclat chaotique 1d6 (4)' });
    expect(ressource(r, 'plongee')).toEqual([1]);
    const voile = lancer({ action: a('illusion.voile'), cibles: [ennemi('b', { camp: 'pj' })], voie: { chaos: { rang: 1, eclatChaotique: true } } });
    expect(voile.changements.some((c) => c.type === 'degats')).toBe(false);
  });

  it('Prêtre (2a) : Affaiblissement −2 sur deux axes, 2 rounds ; Corruption motivante X d4 pour +X à tous ses jets, X au plus 6', () => {
    expect(lancer({ action: a('chaos.pretre.affaiblissement'), variante: 'def-degats', alea: des([20, 3]) }).changements.slice(0, 2)).toEqual([
      { type: 'bonus', cible: 'a', sur: 'degats', valeur: -2, duree: { rounds: 2 } },
      { type: 'bonus', cible: 'a', sur: 'DEF', valeur: -2, duree: { rounds: 2 } },
    ]);
    const cm = lancer({ action: a('chaos.pretre.corruption-motivante'), cibles: [], lanceur: { ...lanceur, plongee: 2, corruptionAme: 1 }, alea: des([4, 1], [4, 2], [4, 3], [20, 5]) });
    expect(cm.cout).toEqual({ pp: 0, pv: 6 });
    expect(cm.changements[0]).toEqual({ type: 'bonus', cible: 'ombre', sur: 'tests', valeur: 3, duree: { rounds: 1 } });
    const plafond = lancer({ action: a('chaos.pretre.corruption-motivante'), cibles: [], lanceur: { ...lanceur, plongee: 5, corruptionAme: 4 }, alea: des(...Array.from({ length: 6 }, () => [4, 1] as [number, number]), [20, 5]) });
    expect(plafond.changements[0]).toMatchObject({ valeur: 6 });
    expect(refus({ action: a('chaos.pretre.corruption-motivante'), cibles: [], lanceur: { ...lanceur, plongee: undefined } })).toBe('il faut la Plongée et la Corruption d’Âme du lanceur');
  });

  it('Prêtre : Supplément corrompu, 1 Sacré pour 2 Plongée ; Le fléau, c’est moi, PV jamais sous 1 pendant 3 rounds', () => {
    expect(lancer({ action: a('chaos.pretre.supplement-corrompu'), cibles: [] }).changements.slice(0, 2).map((c) => c.type === 'ressource' && [c.ressource, c.montant])).toEqual([
      ['sacre', 1],
      ['plongee', 2],
    ]);
    expect(lancer({ action: a('chaos.pretre.le-fleau-c-est-moi'), cibles: [] }).changements[1]).toEqual({ type: 'plancherPv', cible: 'ombre', valeur: 1, duree: { rounds: 3 } });
  });

  it('Barde : Chant corrupteur à l’attaque magique, Influencé 2 rounds ; Symphonie rayon 3, alliés compris', () => {
    expect(lancer({ action: a('chaos.barde.chant-corrupteur'), alea: des([20, 10]) }).changements[0]).toEqual({ type: 'etat', cible: 'a', etat: 'influence', duree: { rounds: 2 } });
    expect(a('chaos.barde.symphonie-du-chaos').zone).toMatchObject({ forme: 'cercle', taille: 3, origine: 'lanceur', filtre: 'tous' });
  });
});

describe('profil', () => {
  it('le rang de la Voie du chaos passe au moteur ; l’Éclat chaotique de l’Envoûteur', () => {
    const c: ChoixDePersonnage = { niveau: 6, modMagie: 3, ecole: 'evocation', elementDepart: 'feu', rangs: { 'magicien.ecole': 2, 'magicien.chaos': 2 }, mineurs: [] };
    expect(profilMagique(classeParId.get('magicien')!, c, regles).voie.chaos).toEqual({ rang: 2 });
    const e: ChoixDePersonnage = { niveau: 6, modMagie: 3, ecole: 'illusion', elementDepart: 'psionique', rangs: { 'envouteur.chaos': 1 }, mineurs: [] };
    expect(profilMagique(classeParId.get('envouteur')!, e, regles).voie.chaos).toEqual({ rang: 1, eclatChaotique: true });
  });
});

describe('garde-fous du schéma', () => {
  it('une table au d20 finit à 1, par min décroissant ; un passif peut avoir un déclencheur, une capacité non', () => {
    const base = { id: 'x', nom: 'X', description: 'x', nature: 'capacite', rang: 1, etiquettes: ['combat'], action: 'action', ciblage: { type: 'soi', portee: 'soi' }, resolution: { jet: 'aucun' } } as const;
    const ligne = (min: number) => ({ min, effets: [{ type: 'narratif', texte: 't' }] });
    expect(schemaAction.safeParse({ ...base, effets: [{ type: 'tableD20', lignes: [ligne(10), ligne(1)] }] }).success).toBe(true);
    expect(schemaAction.safeParse({ ...base, effets: [{ type: 'tableD20', lignes: [ligne(10), ligne(2)] }] }).success).toBe(false);
    expect(schemaAction.safeParse({ ...base, effets: [{ type: 'tableD20', lignes: [ligne(1), ligne(10)] }] }).success).toBe(false);
    expect(schemaAction.safeParse({ ...base, action: 'aucune', nature: 'passif', declencheur: 'attaqueSubie', effets: [{ type: 'narratif', texte: 't' }] }).success).toBe(true);
    expect(schemaAction.safeParse({ ...base, declencheur: 'attaqueSubie', effets: [{ type: 'narratif', texte: 't' }] }).success).toBe(false);
  });
});
