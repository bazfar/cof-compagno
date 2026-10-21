import { describe, expect, it } from 'vitest';
import { profilMagique, verifierChoix, type ChoixDePersonnage } from '../../src/lib/effets/profil';
import { deMineur, resoudreLancer, type CibleEnJeu, type LanceurEnJeu } from '../../src/lib/effets/resolution';
import { schemaClasseRefonte, schemaVoieRefonte } from '../../src/lib/schemas/classes';
import { schemaAction } from '../../src/lib/schemas/effets';
import { actionParId, classeParId, elementParId, etatParId, referencesManquantes, voieParId } from '../../src/regles';

/*
 * Le Magicien de la refonte (lot L4.4b1) : classe, Voie de l'école, Voie
 * élémentaire, sorts mineurs, profil d'un personnage. Doc « Refonte
 * classes et magie — cadre » et décisions du 20 et du 21/10/2026.
 */

const magicien = classeParId.get('magicien')!;
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
const mage: LanceurEnJeu = { id: 'mage', camp: 'pj', def: 12, sauvegardes: sauv, etats: [], modMagie: 3, attaqueMagique: 4 };
const ennemi = (id: string): CibleEnJeu => ({ id, camp: 'ennemi', def: 10, sauvegardes: sauv, etats: [], distance: 3 });
const choix = (c: Partial<ChoixDePersonnage>): ChoixDePersonnage => ({
  niveau: 1,
  modMagie: 3,
  ecole: 'evocation',
  elementDepart: 'feu',
  rangs: { 'magicien.ecole': 1, 'magicien.elementaire': 1 },
  mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'],
  ...c,
});

describe('la classe', () => {
  it('d4, INT, réserve de PP 4 + 2 × niveau + 2 × mod (validé)', () => {
    expect(magicien).toMatchObject({ famille: 'magique', deVie: 4, caracMagie: 'INT', reservePP: { base: 4, parNiveau: 2, parMod: 2 } });
  });

  it('création : trois écoles, les cinq éléments ordinaires (ni sang ni psionique), élément de départ Initié (5a)', () => {
    expect(magicien.creation).toEqual({
      ecoles: ['evocation', 'abjuration', 'invocation'],
      elements: ['feu', 'glace', 'terre', 'eau', 'electricite'],
      elementsSecond: ['feu', 'glace', 'terre', 'eau', 'electricite'],
      maitriseElementDepart: 'initie',
    });
  });

  it('sorts mineurs : cinq dans la liste, 2 à la création, +1 aux niveaux 5 et 9 (validé)', () => {
    expect(magicien.mineurs).toMatchObject({ creation: 2, plusUnAuNiveau: [5, 9] });
    expect(magicien.mineurs.liste.map((id) => actionParId.get(id)!.nom)).toEqual(['Trait arcanique', 'Main du mage', 'Lumière', 'Détection de la magie', 'Prestidigitation']);
  });

  it('tout ce que la classe et ses voies citent existe', () => {
    expect(referencesManquantes()).toEqual([]);
  });
});

describe('voies', () => {
  it('Voie de l’école : un verbe par rang ; Adepte au rang 1, Maître au rang 4 (validé)', () => {
    const v = voieParId.get('magicien.ecole')!;
    expect(v.rangs.every((r) => r.regles.some((x) => x.type === 'verbeDeLEcole'))).toBe(true);
    expect(v.rangs[0]!.regles).toContainEqual({ type: 'maitriseEcole', quelle: 'choisie', niveau: 'adepte' });
    expect(v.rangs[3]!.regles).toContainEqual({ type: 'maitriseEcole', quelle: 'choisie', niveau: 'maitre' });
  });

  it('Voie élémentaire : départ Adepte, second Initié, un Maître, Résonance 1x/combat, Cataclysme', () => {
    const r = voieParId.get('magicien.elementaire')!.rangs;
    expect(r[0]!.regles).toEqual([{ type: 'maitriseElement', quel: 'depart', niveau: 'adepte' }]);
    expect(r[1]!.regles).toEqual([{ type: 'secondElement', niveau: 'initie' }]);
    expect(r[2]!.regles[0]).toEqual({ type: 'maitriseElement', quel: 'auChoix', niveau: 'maitre' });
    expect(r[3]!.regles).toEqual([{ type: 'annuleDerapage', limite: '1x/combat' }]);
    expect(r[4]!.actions).toEqual(['magicien.cataclysme']);
  });

  it('Cataclysme (6a) : 6 PP, 1x/scénario, rayon 2 à 13 cases, 6d6, DEX pour moitié, un élément Maître exigé', () => {
    const c = actionParId.get('magicien.cataclysme')!;
    expect(c).toMatchObject({ limite: '1x/scenario', elementMin: 'maitre', ciblage: { portee: 13 }, zone: { forme: 'cercle', taille: 2 }, cout: [{ ressource: 'pp', montant: 6 }] });
    expect(resoudreLancer({ action: c, palier: 'I', lanceur: mage, cibles: [], element: { id: 'feu', maitrise: 'adepte' } }, cat)).toMatchObject({ ok: false, raison: expect.stringMatching(/Maître/) });
    const r = resoudreLancer(
      { action: c, palier: 'I', lanceur: mage, cibles: [], zone: [ennemi('a')], element: { id: 'feu', maitrise: 'maitre' }, alea: des([20, 2], ...Array.from({ length: 6 }, () => [6, 2] as [number, number])) },
      cat,
    );
    expect(r).toMatchObject({ ok: true, cout: { pp: 6, pv: 0 } });
    expect(r.ok && r.changements).toEqual([
      { type: 'degats', cible: 'a', montant: 12, typeDegats: 'feu', calcul: '12 (2 + 2 + 2 + 2 + 2 + 2)' },
      { type: 'etat', cible: 'a', etat: 'brulure', duree: { rounds: 2 } },
    ]);
  });
});

describe('sorts mineurs', () => {
  it('le dé suit le niveau (validé) ; Perfection le monte d’un cran (1d8, 1d10, 1d12)', () => {
    expect([1, 4, 5, 8, 9, 12].map((n) => deMineur(n))).toEqual(['1d6', '1d6', '1d8', '1d8', '1d10', '1d10']);
    expect([1, 5, 9].map((n) => deMineur(n, 1))).toEqual(['1d8', '1d10', '1d12']);
    expect(deMineur(12, 3)).toBe('1d12');
  });

  it('Trait arcanique : attaque magique à 10 cases (16a), 0 PP, un d8 au niveau 5', () => {
    const t = actionParId.get('mineur.trait-arcanique')!;
    expect(t).toMatchObject({ nature: 'mineur', rang: 0, ciblage: { portee: 10 }, resolution: { jet: 'attaqueMagique' } });
    const r = resoudreLancer({ action: t, palier: 'I', lanceur: { ...mage, niveau: 5 }, cibles: [ennemi('a')], alea: des([20, 10], [8, 7]) }, cat);
    expect(r).toMatchObject({ ok: true, cout: { pp: 0 } });
    expect(r.ok && r.changements[0]).toMatchObject({ type: 'degats', montant: 7 });
  });

  it('les quatre autres servent hors combat, avec un texte par palier', () => {
    for (const id of ['mineur.main-du-mage', 'mineur.lumiere', 'mineur.detection-magie', 'mineur.prestidigitation'])
      expect(actionParId.get(id)).toMatchObject({ nature: 'mineur', etiquettes: ['exploration'], horsCombat: { paliers: [expect.any(String), expect.any(String), expect.any(String)] } });
  });
});

describe('profil magique', () => {
  it('niveau 1, école et élémentaire au rang 1 : Missile au palier I, Évocation Adepte, feu Adepte, 12 PP, 2 mineurs', () => {
    const c = choix({});
    expect(verifierChoix(magicien, c, regles)).toEqual([]);
    expect(profilMagique(magicien, c, regles)).toEqual({
      reservePP: 12,
      reserveSacre: 0,
      maitriseEcole: 'adepte',
      maitriseSecondeEcole: null,
      elements: { feu: 'adepte' },
      verbes: [{ id: 'evocation.missile', palier: 'I' }],
      actions: [],
      annuleDerapage: null,
      mineursMax: 2,
      mineurs: [
        { id: 'mineur.trait-arcanique', palier: 'I' },
        { id: 'mineur.lumiere', palier: 'I' },
      ],
      capacites: [],
      pvEnPlus: 0,
      voie: {},
      textes: [],
      verbesHorsVoie: [],
      ressourceDeClasse: null,
      attaquesSpeciales: null,
      attaques: [],
      caracs: {},
      paliersDActions: {},
    });
  });

  it('sans le rang 1 de la Voie élémentaire, l’élément de départ reste Initié (5a)', () => {
    const c = choix({ rangs: { 'magicien.ecole': 2 } });
    expect(verifierChoix(magicien, c, regles)).toEqual([]);
    expect(profilMagique(magicien, c, regles).elements).toEqual({ feu: 'initie' });
  });

  it('niveau 5 : école au rang 4 (Maître), Bouclier et Rempart au palier II ; élémentaire au rang 3, feu Maître, glace Initiée', () => {
    const c = choix({ niveau: 5, ecole: 'abjuration', secondElement: 'glace', elementMaitre: 'feu', rangs: { 'magicien.ecole': 4, 'magicien.elementaire': 3 } });
    expect(verifierChoix(magicien, c, regles)).toEqual([]);
    const p = profilMagique(magicien, c, regles);
    expect(p.verbes).toEqual([
      { id: 'abjuration.bouclier', palier: 'II' },
      { id: 'abjuration.rempart', palier: 'II' },
      { id: 'abjuration.dissipation', palier: 'I' },
      { id: 'abjuration.renvoi', palier: 'I' },
    ]);
    expect(p).toMatchObject({ reservePP: 20, maitriseEcole: 'maitre', elements: { feu: 'maitre', glace: 'initie' }, mineursMax: 3 });
    expect(p.textes).toHaveLength(1);
  });

  it('rang 5 partout : Missile au palier III, Choc et Rayon au II (deux rangs après eux), Cataclysme et Résonance débloqués', () => {
    // 16 points de voie : niveau 8 (budget v1, corrigé au lot L4.11a).
    const c = choix({ niveau: 8, secondElement: 'eau', elementMaitre: 'eau', rangs: { 'magicien.ecole': 5, 'magicien.elementaire': 5 } });
    expect(verifierChoix(magicien, c, regles)).toEqual([]);
    const p = profilMagique(magicien, c, regles);
    expect(p.verbes.map((v) => v.palier)).toEqual(['III', 'II', 'II', 'I', 'I']);
    expect(p).toMatchObject({ actions: ['magicien.cataclysme'], annuleDerapage: '1x/combat', elements: { feu: 'adepte', eau: 'maitre' } });
  });

  it('les choix impossibles sont refusés avec une phrase pour le joueur', () => {
    const erreurs = (c: Partial<ChoixDePersonnage>) => verifierChoix(magicien, choix(c), regles);
    expect(erreurs({ ecole: 'illusion' })).toEqual([expect.stringMatching(/Choisis une école/)]);
    expect(erreurs({ elementDepart: 'sang' })).toEqual([expect.stringMatching(/élément de départ/)]);
    expect(erreurs({ rangs: { 'magicien.ecole': 2, 'magicien.elementaire': 1 } })).toEqual(['3 points de voie pour 2 au niveau 1.']);
    // Budget v1 (lot L4.11a) : les rangs 3 à 5 coûtent 2 points ; 5 rangs dans une voie font 8 points.
    expect(erreurs({ niveau: 3, rangs: { 'magicien.ecole': 4 } })).toEqual([]);
    expect(erreurs({ niveau: 3, rangs: { 'magicien.ecole': 5 } })).toEqual(['8 points de voie pour 6 au niveau 3.']);
    expect(erreurs({ niveau: 2, rangs: { 'magicien.ecole': 2, 'magicien.elementaire': 2 } })).toEqual(['Choisis un second élément.']);
    expect(erreurs({ niveau: 2, secondElement: 'feu', rangs: { 'magicien.ecole': 2, 'magicien.elementaire': 2 } })).toEqual(['Le second élément doit différer du premier.']);
    expect(erreurs({ niveau: 3, secondElement: 'glace', rangs: { 'magicien.ecole': 1, 'magicien.elementaire': 3 } })).toEqual(['Choisis lequel de tes éléments devient Maître.']);
    expect(erreurs({ secondElement: 'glace' })).toEqual([expect.stringMatching(/second élément vient/)]);
    expect(erreurs({ mineurs: ['mineur.lumiere', 'mineur.lumiere'] })).toEqual(['Un sort mineur ne se prend qu’une fois.']);
    expect(erreurs({ mineurs: ['mineur.lumiere', 'mineur.trait-arcanique', 'mineur.prestidigitation'] })).toEqual(['2 sorts mineurs au plus au niveau 1.']);
    expect(erreurs({ rangs: { 'magicien.pyromancie': 1 } })).toEqual([expect.stringMatching(/pas une voie de Magicien/)]);
    expect(erreurs({ niveau: 13 })).toContainEqual('Le niveau va de 1 à 12.');
  });
});

describe('schémas des classes et des voies', () => {
  it('une voie a ses 5 rangs dans l’ordre, chacun avec une action ou une règle', () => {
    const v = { id: 'x', nom: 'X', description: 'x', rangs: [1, 2, 3, 4, 5].map((rang) => ({ rang, nom: 'r', description: 'd', regles: [{ type: 'texte', texte: 't' }] })) };
    expect(schemaVoieRefonte.safeParse(v).success).toBe(true);
    expect(schemaVoieRefonte.safeParse({ ...v, rangs: v.rangs.slice(0, 4) }).success).toBe(false);
    expect(schemaVoieRefonte.safeParse({ ...v, rangs: [v.rangs[1], v.rangs[0], ...v.rangs.slice(2)] }).success).toBe(false);
    expect(schemaVoieRefonte.safeParse({ ...v, rangs: [{ rang: 1, nom: 'r', description: 'd' }, ...v.rangs.slice(1)] }).success).toBe(false);
  });

  it('une classe refuse un champ inconnu ; une action qui exige un élément doit en accepter un', () => {
    expect(schemaClasseRefonte.safeParse({ ...magicien, armes: 'bâton' }).success).toBe(false);
    expect(schemaAction.safeParse({ ...actionParId.get('magicien.cataclysme')!, element: null }).success).toBe(false);
  });

  it('seul un sort mineur suit la progression des sorts mineurs', () => {
    const missile = actionParId.get('evocation.missile')!;
    expect(schemaAction.safeParse({ ...missile, effets: [{ ...missile.effets[0], progression: 'mineur' }] }).success).toBe(false);
  });
});
