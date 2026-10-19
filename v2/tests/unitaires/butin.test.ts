import { describe, expect, it } from 'vitest';
import { gesteJoueur, issueDuVote, lancerD100, texteDes, votesTries } from '../../src/lib/butin/butin';
import { objetsPourButin } from '../../src/lib/regles/equipement';
import { schemaButin, type Butin, type VoteButin } from '../../src/lib/schemas/butin';

/*
 * Butin (lot L3.4) : Besoin avant Envie, puis le plus haut d100 ; à
 * égalité, les joueurs concernés relancent jusqu'à ce qu'un seul reste.
 */

const v = (choix: VoteButin['choix'], d100: number, relances: number[] = [], nom = 'X'): VoteButin => ({ choix, perso: `p-${nom}`, nom, d100, relances, le: 1 });

describe('qui l’emporte', () => {
  it('Besoin avant Envie, quel que soit le d100', () => {
    const issue = issueDuVote({ alice: v('envie', 99), carol: v('besoin', 3), dan: v('passe', 100) });
    expect(issue).toMatchObject({ etat: 'gagnant', uid: 'carol', rang: 'besoin' });
  });

  it('sans Besoin, le plus haut d100 parmi les Envie ; tout le monde passe : personne', () => {
    expect(issueDuVote({ alice: v('envie', 40), carol: v('envie', 75), dan: v('passe', 100) })).toMatchObject({ etat: 'gagnant', uid: 'carol', rang: 'envie' });
    expect(issueDuVote({ alice: v('passe', 40) })).toEqual({ etat: 'personne' });
    expect(issueDuVote({})).toEqual({ etat: 'personne' });
  });

  it('égalité au d100 : les ex aequo seulement doivent relancer (tour 1)', () => {
    const issue = issueDuVote({ alice: v('besoin', 80), carol: v('besoin', 80), dan: v('besoin', 12) });
    expect(issue).toEqual({ etat: 'egalite', enLice: ['alice', 'carol'], tour: 1, manquants: ['alice', 'carol'], rang: 'besoin' });
  });

  it('relance : on attend ceux qui n’ont pas relancé, puis le plus haut l’emporte', () => {
    expect(issueDuVote({ alice: v('besoin', 80, [55]), carol: v('besoin', 80) })).toMatchObject({ etat: 'egalite', tour: 1, manquants: ['carol'] });
    expect(issueDuVote({ alice: v('besoin', 80, [55]), carol: v('besoin', 80, [61]) })).toMatchObject({ etat: 'gagnant', uid: 'carol' });
  });

  it('nouvelle égalité à la relance : seconde relance, toujours entre ex aequo', () => {
    const votes = { alice: v('besoin', 80, [55]), carol: v('besoin', 80, [55]), dan: v('besoin', 80, [20]) };
    expect(issueDuVote(votes)).toEqual({ etat: 'egalite', enLice: ['alice', 'carol'], tour: 2, manquants: ['alice', 'carol'], rang: 'besoin' });
    expect(issueDuVote({ ...votes, alice: v('besoin', 80, [55, 9]), carol: v('besoin', 80, [55, 10]) })).toMatchObject({ etat: 'gagnant', uid: 'carol' });
  });
});

describe('ce que voit le joueur', () => {
  const butin = (extra: Partial<Butin>): Butin =>
    schemaButin.parse({ objet: { nom: 'Dague' }, statut: 'vote', creeLe: 1, tour: 0, enLice: [], votes: {}, gagnant: null, resoluLe: null, ...extra });

  it('voter pendant le vote ; relancer s’il est à égalité ; sinon attendre ou rien', () => {
    expect(gesteJoueur(butin({}), 'alice')).toBe('voter');
    const relance = butin({ statut: 'relance', tour: 1, enLice: ['alice', 'carol'], votes: { alice: v('besoin', 80, [55]), carol: v('besoin', 80) } });
    expect(gesteJoueur(relance, 'carol')).toBe('relancer');
    expect(gesteJoueur(relance, 'alice')).toBe('attendre');
    expect(gesteJoueur(relance, 'dan')).toBe('rien');
    expect(gesteJoueur(butin({ statut: 'attribue' }), 'alice')).toBe('rien');
  });

  it('votes triés comme le classement ; dés lisibles', () => {
    const tries = votesTries({ a: v('envie', 99, [], 'A'), b: v('besoin', 10, [], 'B'), c: v('besoin', 10, [70], 'C'), d: v('passe', 100, [], 'D') });
    expect(tries.map(([uid]) => uid)).toEqual(['c', 'b', 'a', 'd']);
    expect(texteDes(v('besoin', 42, [77, 12]))).toBe('42 → 77 → 12');
  });

  it('d100 : de 1 à 100', () => {
    expect(lancerD100(() => 0)).toBe(1);
    expect(lancerD100(() => 0.999999)).toBe(100);
  });
});

describe('mettre au vote', () => {
  it('un consommable forme une seule pile ; une arme est votée exemplaire par exemplaire', () => {
    expect(objetsPourButin('potion_soin', 3)).toEqual([expect.objectContaining({ id: 'potion_soin', quantite: 3 })]);
    const dagues = objetsPourButin('dague', 2);
    expect(dagues).toHaveLength(2);
    expect(dagues[0]).not.toBe(dagues[1]);
    expect(() => objetsPourButin('epee_de_lumiere')).toThrow('Objet inconnu');
  });

  it('schéma : un statut inventé ou un d100 de 0 est refusé', () => {
    const base = { objet: { nom: 'Dague' }, statut: 'vote', creeLe: 1, tour: 0, enLice: [], votes: {}, gagnant: null, resoluLe: null };
    expect(schemaButin.safeParse(base).success).toBe(true);
    expect(schemaButin.safeParse({ ...base, statut: 'gagne' }).success).toBe(false);
    expect(schemaButin.safeParse({ ...base, votes: { a: v('besoin', 0) } }).success).toBe(false);
  });
});
