import { describe, expect, it } from 'vitest';
import { enrichirJetons, idJetonPerso, persoDuJeton, pjAPoser } from '../../src/lib/battlemap/jetons-pj';
import { partPV, type JetonAffiche } from '../../src/lib/battlemap/rendu';

/*
 * Jetons de PJ reliés aux personnages (lot L2.3) : pj-<id du personnage>,
 * nom et PV pris dans la fiche (v1 : nom copié à la pose, figé).
 */

const jeton = (id: string, genre: JetonAffiche['genre'], nom: string): JetonAffiche => ({ id, genre, nom, couleur: '#2980b9', cx: 1, cy: 1 });

describe('jetons de PJ', () => {
  it('identifiant : pj-<id du personnage>', () => {
    expect(idJetonPerso('p-abc')).toBe('pj-p-abc');
    expect(persoDuJeton('pj-p-abc')).toBe('p-abc');
    expect(persoDuJeton('m-123')).toBeNull();
  });

  it('nom et PV pris dans la fiche ; ancien jeton pj-<uid> et monstres inchangés', () => {
    const fiches = new Map([['p1', { nom: 'Kargash', pv: { actuel: 12, max: 20 } }]]);
    const sortie = enrichirJetons([jeton('pj-p1', 'pj', 'Ancien'), jeton('pj-alice', 'pj', 'Alice'), jeton('m-1', 'monstre', 'Gobelin')], fiches);
    expect(sortie[0]).toMatchObject({ nom: 'Kargash', pv: { actuel: 12, max: 20 } });
    expect(sortie[1]).toEqual(jeton('pj-alice', 'pj', 'Alice'));
    expect(sortie[2]).toEqual(jeton('m-1', 'monstre', 'Gobelin'));
  });

  it('« + PJ des joueurs » : le personnage joué de chacun, s’il est à lui et pas déjà posé', () => {
    const persos = new Map([
      ['p1', { nom: 'Kargash', proprietaireUid: 'alice' }],
      ['p2', { nom: 'Hyrma', proprietaireUid: 'carol' }],
      ['p3', { nom: 'Volé', proprietaireUid: 'carol' }],
    ]);
    const joueurs = [
      { id: 'alice', nom: 'Alice', persoActif: 'p1' },
      { id: 'carol', nom: 'Carol', persoActif: 'p2' },
      { id: 'dan', nom: 'Dan', persoActif: 'p3' }, // pas à lui
      { id: 'eve', nom: 'Eve' }, // aucun personnage joué
    ];
    expect(pjAPoser(joueurs, persos, [{ id: 'pj-p2' }]).map((p) => [p.joueur.id, p.idPerso, p.nom])).toEqual([['alice', 'p1', 'Kargash']]);
  });

  it('barre de PV : part bornée entre 0 et 1', () => {
    expect(partPV({ actuel: 5, max: 20 })).toBe(0.25);
    expect(partPV({ actuel: -3, max: 20 })).toBe(0);
    expect(partPV({ actuel: 30, max: 20 })).toBe(1);
    expect(partPV({ actuel: 3, max: 0 })).toBe(0);
  });
});
