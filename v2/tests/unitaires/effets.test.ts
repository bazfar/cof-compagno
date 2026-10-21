import { describe, expect, it } from 'vitest';
import { coutHorsCombat, coutSort, ddSort, regleCombinaison, seuilEchec, type ParametresLancer } from '../../src/lib/effets/cout';
import { actionAuPalier, horsCombatAuPalier, palierAtteint, paliersDefinis, rangDeblocage } from '../../src/lib/effets/paliers';
import { schemaAction, type ActionSaisie } from '../../src/lib/schemas/effets';

/*
 * Moteur d'effets, lot L4.1 : schéma des actions, paliers en deltas, coût
 * et DD (doc « Refonte classes et magie — cadre », sections validées).
 */

const base: ActionSaisie = {
  id: 'essai.trait',
  nom: 'Trait',
  description: 'Un verbe d’essai.',
  nature: 'verbe',
  ecole: 'evocation',
  rang: 1,
  etiquettes: ['combat'],
  action: 'action',
  ciblage: { type: 'creature', camp: 'ennemi', portee: 10 },
  resolution: { jet: 'auto' },
  effets: [{ type: 'degats', des: '1d6', typeDegats: 'magique' }],
  element: { application: 'ciblePrincipale' },
  paliers: { II: { ciblage: { nbCibles: 2 } }, III: { ciblage: { nbCibles: 3 } } },
};
const action = (patch: Partial<ActionSaisie> = {}) => schemaAction.parse({ ...base, ...patch });
const refuse = (patch: Record<string, unknown>) => schemaAction.safeParse({ ...base, ...patch }).success;

describe('schéma des actions : les pièges de la v1 sont fermés', () => {
  it('le verbe d’essai est valide, valeurs par défaut posées', () => {
    const a = action();
    expect(a.limite).toBe('volonte');
    expect(a.zone).toBeNull();
    expect(a.persistance).toEqual({ type: 'instantane', rupture: [] });
    expect(a.effets[0]).toMatchObject({ vise: 'cible', plusMod: false });
  });

  it('une durée est { rounds } ou un mot-clé, jamais un objet libre (v1 : { motCle } → NaN)', () => {
    const etat = (duree: unknown) => ({ effets: [{ type: 'etat', etat: 'ralentie', duree }] });
    expect(refuse(etat({ rounds: 2 }))).toBe(true);
    expect(refuse(etat('finCombat'))).toBe(true);
    expect(refuse(etat({ motCle: 'finCombat' }))).toBe(false);
    expect(refuse(etat({ tours: 2 }))).toBe(false);
    expect(refuse(etat('3'))).toBe(false);
  });

  it('la cible d’un bonus est dans une liste fermée (v1 : cible inconnue stockée, jamais lue)', () => {
    const bonus = (cible: string) => ({ effets: [{ type: 'bonus', cible, valeur: 2, duree: { rounds: 1 } }] });
    expect(refuse(bonus('DEF'))).toBe(true);
    expect(refuse(bonus('Defense'))).toBe(false);
  });

  it('un type d’effet inconnu est refusé : plus de « special » libre', () => {
    expect(refuse({ effets: [{ type: 'special', note: 'voir le manuel' }] })).toBe(false);
    expect(refuse({ effets: [{ type: 'narratif', texte: 'La cible révèle un secret.' }] })).toBe(true);
  });

  it('une action sans effet est manuelle, avec sa raison', () => {
    expect(refuse({ effets: [] })).toBe(false);
    expect(refuse({ effets: [], manuel: 'Arbitrage du MJ.' })).toBe(true);
  });

  it('un champ inconnu est refusé', () => {
    expect(refuse({ coutPointsConviction: 1 })).toBe(false);
  });

  it('un verbe a une école, un rang de 1 à 5 et son coût par formule', () => {
    expect(refuse({ ecole: undefined })).toBe(false);
    expect(refuse({ rang: 0 })).toBe(false);
    expect(refuse({ cout: [{ ressource: 'pp', montant: 2 }] })).toBe(false);
  });

  it('un sort mineur est de rang 0, sans coût ; ses paliers viennent de la Voie du virtuose (L4.4b2)', () => {
    const mineur = { nature: 'mineur', rang: 0, paliers: {} };
    expect(refuse(mineur)).toBe(true);
    expect(refuse({ ...mineur, rang: 1 })).toBe(false);
    expect(refuse({ ...mineur, cout: [{ ressource: 'pp', montant: 1 }] })).toBe(false);
    expect(refuse({ ...mineur, paliers: { II: { ciblage: { nbCibles: 2 } } } })).toBe(true);
  });

  it('une réaction a un déclencheur, et seule une réaction en a un', () => {
    const reaction = { nature: 'reaction', action: 'reaction', cout: [{ ressource: 'endurance', montant: 1 }] };
    expect(refuse(reaction)).toBe(false);
    expect(refuse({ ...reaction, declencheur: 'allieCible' })).toBe(true);
    expect(refuse({ declencheur: 'allieCible' })).toBe(false);
  });

  it('un passif ne coûte aucune action', () => {
    expect(refuse({ nature: 'passif', action: 'action', ecole: undefined, paliers: {} })).toBe(false);
    expect(refuse({ nature: 'passif', action: 'aucune', ecole: undefined, paliers: {} })).toBe(true);
  });

  it('sauvegarde : nommée si et seulement si le jet en est une, avec ce que fait une réussite', () => {
    expect(refuse({ resolution: { jet: 'sauvegarde', sauvegarde: 'DEX', siSauvegarde: 'moitie' } })).toBe(true);
    expect(refuse({ resolution: { jet: 'sauvegarde', sauvegarde: 'DEX' } })).toBe(false);
    expect(refuse({ resolution: { jet: 'sauvegarde', siSauvegarde: 'moitie' } })).toBe(false);
    expect(refuse({ resolution: { jet: 'auto', sauvegarde: 'DEX' } })).toBe(false);
    expect(refuse({ resolution: { jet: 'sauvegarde', sauvegarde: 'Reflexes', siSauvegarde: 'moitie' } })).toBe(false);
  });

  it('une condition de sauvegarde demande un jet de sauvegarde ; un effet de zone demande une zone', () => {
    expect(refuse({ effets: [{ type: 'deplacement', sens: 'repousse', cases: 1, condition: 'sauvegardeRatee' }] })).toBe(false);
    expect(refuse({ effets: [{ type: 'degats', des: '1d6', typeDegats: 'magique', vise: 'zone' }] })).toBe(false);
  });

  it('un usage hors combat demande une étiquette exploration ou social', () => {
    expect(refuse({ horsCombat: { paliers: ['Briser un objet.'] } })).toBe(false);
    expect(refuse({ etiquettes: ['combat', 'exploration'], horsCombat: { paliers: ['Briser un objet.'] } })).toBe(true);
  });

  it('un palier III suppose un palier II', () => {
    expect(refuse({ paliers: { III: { ciblage: { nbCibles: 3 } } } })).toBe(false);
  });

  it('une atténuation demande une portée en cases au-delà des dégâts pleins', () => {
    const att = (portee: unknown, pleinsJusqua: number) => ({
      ciblage: { type: 'creature', portee },
      effets: [{ type: 'degats', des: '2d6', typeDegats: 'magique', attenuation: { pleinsJusqua, auDela: 'moitie' } }],
    });
    expect(refuse(att(6, 3))).toBe(true);
    expect(refuse(att(3, 3))).toBe(false);
    expect(refuse(att('contact', 1))).toBe(false);
  });

  it('une formule de dés invalide est refusée', () => {
    expect(refuse({ effets: [{ type: 'degats', des: '2d6 + mod', typeDegats: 'magique' }] })).toBe(false);
  });
});

describe('paliers (validé : II deux rangs après le verbe, III encore deux rangs après ; dans la voie seulement)', () => {
  const a = action();
  it('rang de déblocage', () => {
    expect([rangDeblocage(a, 'I'), rangDeblocage(a, 'II'), rangDeblocage(a, 'III')]).toEqual([1, 3, 5]);
    expect(rangDeblocage({ rang: 2 }, 'II')).toBe(4);
  });

  it('palier atteint selon le rang de la voie ; hors voie (grimoire), palier I', () => {
    expect(palierAtteint(a, 1, true)).toBe('I');
    expect(palierAtteint(a, 2, true)).toBe('I');
    expect(palierAtteint(a, 3, true)).toBe('II');
    expect(palierAtteint(a, 5, true)).toBe('III');
    expect(palierAtteint(a, 5, false)).toBe('I');
    const sansIII = action({ paliers: { II: { ciblage: { nbCibles: 2 } } } });
    expect(palierAtteint(sansIII, 5, true)).toBe('II');
    expect(paliersDefinis(sansIII)).toEqual(['I', 'II']);
  });

  it('les deltas s’appliquent dans l’ordre et l’action résolue n’a plus de paliers', () => {
    const iii = actionAuPalier(a, 'III');
    expect(iii.ciblage.nbCibles).toBe(3);
    expect(iii.paliers).toEqual({});
    expect(actionAuPalier(a, 'II').ciblage).toMatchObject({ nbCibles: 2, portee: 10, camp: 'ennemi' });
    expect(actionAuPalier(a, 'I')).toEqual({ ...a, paliers: {} });
  });

  it('un effet se patche par index ; un delta qui vise un effet absent ou change son type lève une erreur', () => {
    const patch = action({ paliers: { II: { effets: { '0': { des: '2d6' } }, ajoute: [{ type: 'deplacement', sens: 'repousse', cases: 1 }] } } });
    const ii = actionAuPalier(patch, 'II');
    expect(ii.effets).toHaveLength(2);
    expect(ii.effets[0]).toMatchObject({ type: 'degats', des: '2d6', typeDegats: 'magique' });
    expect(() => actionAuPalier(action({ paliers: { II: { effets: { '3': { des: '2d6' } } } } }), 'II')).toThrow(/n'existe pas/);
    expect(() => actionAuPalier(action({ paliers: { II: { effets: { '0': { type: 'soin' } } } } }), 'II')).toThrow(/type/);
    expect(() => actionAuPalier(action({ paliers: { II: { effets: { '0': { des: 'beaucoup' } } } } }), 'II')).toThrow();
    expect(() => actionAuPalier(action({ paliers: {} }), 'II')).toThrow(/pas de palier II/);
  });

  it('hors combat : le texte du palier, ou le dernier défini', () => {
    const h = { horsCombat: { paliers: ['un', 'deux'] } };
    expect(horsCombatAuPalier(h, 'I')).toBe('un');
    expect(horsCombatAuPalier(h, 'III')).toBe('deux');
    expect(horsCombatAuPalier({ horsCombat: null }, 'I')).toBeNull();
  });
});

describe('coût d’un sort (validé : base + palier + élément + combinaison + surcharge − école Maître, plancher 1)', () => {
  const a = action();
  const pp = (p: ParametresLancer, x = a) => {
    const c = coutSort(x, p);
    return c.ok ? c.pp : c.raison;
  };

  it('base selon le rang (R1 2 … R5 6), +1 par palier au-dessus de I', () => {
    expect([1, 2, 3, 4, 5].map((rang) => pp({ palier: 'I' }, action({ rang })))).toEqual([2, 3, 4, 5, 6]);
    expect([pp({ palier: 'I' }), pp({ palier: 'II' }), pp({ palier: 'III' })]).toEqual([2, 3, 4]);
  });

  it('élément : Initié +1, Maître −1, Non maîtrisé et Adepte 0', () => {
    expect(pp({ palier: 'I', element: 'nonMaitrise' })).toBe(2);
    expect(pp({ palier: 'I', element: 'initie' })).toBe(3);
    expect(pp({ palier: 'I', element: 'adepte' })).toBe(2);
    expect(pp({ palier: 'II', element: 'maitre' })).toBe(2);
  });

  it('combinaison : le 1er élément est Maître ; +2 si le 2e ne l’est pas', () => {
    expect(pp({ palier: 'III', element: 'maitre', secondElement: 'maitre' })).toBe(3);
    expect(pp({ palier: 'III', element: 'maitre', secondElement: 'adepte' })).toBe(5);
    expect(pp({ palier: 'III', element: 'adepte', secondElement: 'maitre' })).toMatch(/premier élément Maître/);
    expect(pp({ palier: 'I', secondElement: 'maitre' })).toMatch(/premier élément/);
    expect(pp({ palier: 'I', element: 'adepte' }, action({ element: null }))).toMatch(/ne prend pas d'élément/);
  });

  it('surcharge : palier immédiatement supérieur et +2 ; jamais au-delà du III ni sur un 1x/combat', () => {
    const c = coutSort(a, { palier: 'I', surcharge: true });
    expect(c).toMatchObject({ ok: true, pp: 5, palierLance: 'II' });
    expect(pp({ palier: 'II', surcharge: true })).toBe(6);
    expect(pp({ palier: 'III', surcharge: true })).toMatch(/pas de palier au-dessus/);
    expect(pp({ palier: 'I', surcharge: true }, action({ limite: '1x/combat' }))).toMatch(/1x\/combat/);
    expect(pp({ palier: 'I', surcharge: true }, action({ paliers: {} }))).toMatch(/pas de palier au-dessus/);
  });

  it('école (décision 6a) : Adepte 0, Maître −1 ; apprise par grimoire, Non maîtrisée 0 puis Initiée +1', () => {
    expect(pp({ palier: 'I', ecole: 'adepte' })).toBe(2);
    expect(pp({ palier: 'I' })).toBe(2);
    expect(pp({ palier: 'I', ecole: 'nonMaitrise' })).toBe(2);
    expect(pp({ palier: 'I', ecole: 'initie' })).toBe(3);
    expect(pp({ palier: 'II', ecole: 'maitre' })).toBe(2);
    expect(pp({ palier: 'I', ecole: 'initie', element: 'initie' })).toBe(4);
  });

  it('plancher 1 PP ; le détail montre chaque terme', () => {
    expect(pp({ palier: 'I', ecole: 'maitre' })).toBe(1);
    const c = coutSort(a, { palier: 'I', element: 'maitre', ecole: 'maitre' });
    expect(c).toEqual({
      ok: true,
      pp: 1,
      palierLance: 'I',
      detail: [
        { terme: 'base', valeur: 2 },
        { terme: 'element', valeur: -1 },
        { terme: 'ecole', valeur: -1 },
        { terme: 'plancher', valeur: 1 },
      ],
    });
  });

  it('un palier non défini, ou une action qui n’est pas un sort, est refusé', () => {
    expect(pp({ palier: 'III' }, action({ paliers: {} }))).toMatch(/pas de palier III/);
    expect(pp({ palier: 'I' }, action({ nature: 'technique', ecole: undefined, cout: [{ ressource: 'ki', montant: 1 }], paliers: {} }))).toMatch(/pas un sort/);
  });

  it('sort mineur : 0 PP, ni surcharge ni combinaison', () => {
    const mineur = action({ nature: 'mineur', rang: 0, paliers: {} });
    expect(pp({ palier: 'I', element: 'adepte' }, mineur)).toBe(0);
    expect(pp({ palier: 'I', surcharge: true }, mineur)).toMatch(/ne se surcharge pas/);
    expect(pp({ palier: 'I', element: 'maitre', secondElement: 'maitre' }, mineur)).toMatch(/ne combine pas/);
  });

  it('hors combat : moitié, arrondie au supérieur, minimum 1 ; 0 pour un mineur', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(coutHorsCombat)).toEqual([1, 1, 2, 2, 3, 3, 4]);
    expect(coutHorsCombat(0)).toBe(0);
  });
});

describe('DD et dérapage (validé)', () => {
  it('DD = 10 + mod, +2 quand l’école est Maître', () => {
    expect(ddSort(3)).toBe(13);
    expect(ddSort(3, 'initie')).toBe(13);
    expect(ddSort(3, 'maitre')).toBe(15);
    expect(ddSort(-1)).toBe(9);
  });

  it('échec (élément ou école, décision 6a) : Non maîtrisé 1 à 10 au d20, Initié 1 à 4, sinon jamais', () => {
    expect([seuilEchec('nonMaitrise'), seuilEchec('initie'), seuilEchec('adepte'), seuilEchec('maitre')]).toEqual([10, 4, 0, 0]);
  });

  it('combinaison : 2e élément Maître sans limite ; sinon effet réduit de moitié, 1 par combat, dérapage de son rang', () => {
    expect(regleCombinaison('maitre')).toEqual({ derapage: 0, effetReduit: false, unParCombat: false });
    expect(regleCombinaison('adepte')).toEqual({ derapage: 0, effetReduit: true, unParCombat: true });
    expect(regleCombinaison('initie')).toEqual({ derapage: 4, effetReduit: true, unParCombat: true });
    expect(regleCombinaison('nonMaitrise')).toEqual({ derapage: 10, effetReduit: true, unParCombat: true });
  });
});
