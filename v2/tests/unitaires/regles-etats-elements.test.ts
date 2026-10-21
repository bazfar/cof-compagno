import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '../../src/lib/schemas/effets';
import { schemaFicheElement } from '../../src/lib/schemas/elements';
import { schemaEtatRefonte } from '../../src/lib/schemas/etats';
import { citationsDEtats, elementParId, etatParId, etatsCites, etatsInconnus, etatsRefonte } from '../../src/regles';
import { ETATS } from '../../src/regles/etats';

/*
 * États et éléments de la refonte (lot L4.2). Les chiffres viennent des
 * décisions de Thomas du 21/10/2026 et du tableau « Effet générique des
 * éléments » du doc de cadre (validé) ; ceux repris de la v1 sont gardés.
 */

const etat = (id: string) => etatParId.get(id)!;

describe('schéma des états', () => {
  const base = { id: 'essai', nom: 'Essai', categorie: 'malus', regle: 'Un état d’essai.' };
  const valide = (patch: Record<string, unknown>) => schemaEtatRefonte.safeParse({ ...base, ...patch }).success;

  it('valeurs par défaut : aucun effet, agit et se déplace normalement, ciblable', () => {
    expect(schemaEtatRefonte.parse(base)).toMatchObject({
      modificateurs: [],
      deplacement: 'normal',
      agit: 'oui',
      ciblable: true,
      contactSeulement: false,
      desavantage: [],
      avantage: [],
      rompuPar: [],
      parSource: false,
    });
  });

  it('refuse un champ inconnu, une cible de modificateur inconnue, un état de dégâts muet', () => {
    expect(valide({ reserve: true })).toBe(false);
    expect(valide({ modificateurs: [{ cible: 'Defense', valeur: -2 }] })).toBe(false);
    expect(valide({ categorie: 'degats' })).toBe(false);
    expect(valide({ categorie: 'degats', parSource: true })).toBe(true);
  });

  it('qui n’agit pas ne se déplace pas ; pas d’avantage et de désavantage sur le même jet', () => {
    expect(valide({ agit: 'non' })).toBe(false);
    expect(valide({ agit: 'non', deplacement: 'nul' })).toBe(true);
    expect(valide({ avantage: ['attaques'], desavantage: ['attaques'] })).toBe(false);
  });
});

describe('catalogue des états (décisions du 21/10/2026)', () => {
  it('se charge, identifiants uniques', () => {
    expect(etatsRefonte).toHaveLength(ETATS.length);
    expect(new Set(ETATS.map((e) => e.id)).size).toBe(ETATS.length);
  });

  it('Exposé : −2 DEF (2a)', () => {
    expect(etat('expose').modificateurs).toEqual([{ cible: 'DEF', valeur: -2 }]);
  });

  it('Saignement : 1d6 par tour (3b)', () => {
    expect(etat('saignement').degatsParTour).toEqual({ des: '1d6', typeDegats: 'physique' });
  });

  it('Affaibli : dégâts infligés −25 %, d’au moins 1 (4)', () => {
    expect(etat('affaibli').degatsInfliges).toEqual({ pourcent: 25, minimum: 1 });
  });

  it('Déséquilibré : désavantage au prochain jet d’attaque seulement (5b)', () => {
    expect(etat('desequilibre').desavantage).toEqual(['prochaineAttaque']);
  });

  it('Dissimulé : désavantage aux attaques contre lui, rompu quand il attaque (7b)', () => {
    expect(etat('dissimule')).toMatchObject({ desavantage: ['attaquesContre'], rompuPar: ['sesAttaques'], ciblable: true });
  });

  it('Ralenti : déplacement divisé par deux (8a, arrondi au supérieur)', () => {
    expect(etat('ralenti').deplacement).toBe('moitie');
  });

  it('repris de la v1 : Renversé −4 DEF, Brûlure 1d4 de feu, Étourdi garde son déplacement, Endormi réveillé par les dégâts', () => {
    expect(etat('renverse')).toMatchObject({ modificateurs: [{ cible: 'DEF', valeur: -4 }], rompuPar: ['actionMouvement'] });
    expect(etat('brulure').degatsParTour).toEqual({ des: '1d4', typeDegats: 'feu' });
    expect(etat('etourdi').agit).toBe('deplacementSeul');
    expect(etat('endormi')).toMatchObject({ agit: 'non', deplacement: 'nul', rompuPar: ['degatsSubis'] });
  });

  it('les états des attaques spéciales d’arme existent (doc de cadre, tableau des armes)', () => {
    for (const id of ['etourdi', 'expose', 'saignement', 'desequilibre', 'affaibli', 'renverse', 'immobilise', 'ralenti'])
      expect(etatParId.has(id), id).toBe(true);
  });
});

describe('les sept éléments (doc de cadre, « Effet générique des éléments »)', () => {
  const el = (id: string) => elementParId.get(id)!;

  it('sept fiches, dans l’ordre du cadre', () => {
    expect([...elementParId.keys()]).toEqual([...ELEMENTS]);
  });

  it('feu et glace : Brûlure 2 tours, Ralenti 1 tour ; le dérapage les retourne contre le lanceur', () => {
    expect(el('feu').sort.effets).toEqual([{ type: 'etat', etat: 'brulure', duree: { rounds: 2 }, vise: 'cible' }]);
    expect(el('feu').derapage.effets[0]).toMatchObject({ etat: 'brulure', vise: 'lanceur' });
    expect(el('glace').sort.effets[0]).toMatchObject({ etat: 'ralenti', duree: { rounds: 1 } });
    expect(el('glace').derapage.effets[0]).toMatchObject({ etat: 'ralenti', vise: 'lanceur' });
  });

  it('terre : Renversé si la sauvegarde est ratée', () => {
    expect(el('terre').sort.effets[0]).toMatchObject({ etat: 'renverse', condition: 'sauvegardeRatee' });
  });

  it('eau : 2 cases de poussée en plus, ou un allié perd un état', () => {
    expect(el('eau').sort.modifie).toEqual({ pousseeEnPlus: 2 });
    expect(el('eau').sort.auChoix[0]).toMatchObject({ type: 'retraitEtat', vise: 'allie', nombre: 1 });
  });

  it('électricité : rebond à 2 cases pour moitié, double contre le métal', () => {
    expect(el('electricite').sort.modifie).toEqual({ rebond: { cases: 2, part: 'moitie' }, contreMetal: 2 });
  });

  it('sang : +1 dé payé en PV, la moitié récupérée ; dérapage = coût en PV doublé', () => {
    expect(el('sang').sort.modifie).toEqual({ deSupplementaire: { payeEnPv: 'coutDuSort', recupere: 'moitie' } });
    expect(el('sang').derapage.modifie).toEqual({ coutPvMultiplie: 2 });
  });

  it('psionique : Volonté, armure ignorée, Affaibli 1 tour si ratée ; dérapage = lanceur étourdi', () => {
    expect(el('psionique').sort.modifie).toEqual({ sauvegarde: 'Volonte', ignoreArmure: true });
    expect(el('psionique').sort.effets[0]).toMatchObject({ etat: 'affaibli', duree: { rounds: 1 }, condition: 'sauvegardeRatee' });
    expect(el('psionique').derapage.effets[0]).toMatchObject({ etat: 'etourdi', vise: 'lanceur' });
  });

  it('une fiche d’élément refuse une modification inconnue', () => {
    const f = { id: 'feu', nom: 'Feu', role: 'r', sort: { texte: 't', modifie: { degatsDoubles: true } }, derapage: { texte: 't' } };
    expect(schemaFicheElement.safeParse(f).success).toBe(false);
  });
});

describe('vérification croisée : un état cité existe au catalogue', () => {
  it('toutes les citations des règles sont connues, et les éléments en citent', () => {
    const c = citationsDEtats();
    expect(c.length).toBeGreaterThan(0);
    expect(etatsInconnus(c, etatParId)).toEqual([]);
  });

  it('une citation inconnue est signalée avec son origine', () => {
    expect(etatsInconnus([{ ou: 'evocation.choc', etat: 'ralentie' }], etatParId)).toEqual([{ ou: 'evocation.choc', etat: 'ralentie' }]);
  });

  it('états cités par des effets : pose et retrait', () => {
    expect(
      etatsCites([
        { type: 'etat', etat: 'expose', duree: { rounds: 1 }, vise: 'cible' },
        { type: 'retraitEtat', etats: ['saignement', 'brulure'], nombre: 1, vise: 'allie' },
        { type: 'degats', des: '1d6', plusMod: false, typeDegats: 'magique', vise: 'cible' },
      ]),
    ).toEqual(['expose', 'saignement', 'brulure']);
  });
});
