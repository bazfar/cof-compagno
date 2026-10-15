import { describe, expect, it } from 'vitest';
import { CalculsPersonnage, voiesHomonymes } from '../../src/lib/regles/calculs';
import { ErreurConversionV1, ficheV1VersCalcul } from '../../src/lib/regles/conversion-v1';

describe('ficheV1VersCalcul', () => {
  it('convertit les voies de la classe en identifiants, choix compris', () => {
    const f = ficheV1VersCalcul({
      classe: 'guerrier',
      capacites: [{ voie: "Voie de l'élite", rang: 1, choix: 'FOR' }, { voie: 'Voie du chaos', rang: 2 }],
    });
    expect(f.capacites).toEqual([{ id: 'guerrier.elite.1', choix: 'FOR' }, { id: 'guerrier.chaos.2' }]);
  });

  it('retrouve une voie hors profil par la classe qui la porte', () => {
    const f = ficheV1VersCalcul({
      classe: 'druide',
      capacites: [{ voie: 'Voie du noble', rang: 1 }],
      voiesHorsProfil: [{ classe: 'chevalier', voie: 'Voie du noble', cout: 2 }],
    });
    expect(f.capacites).toEqual([{ id: 'chevalier.noble.1' }]);
    expect(f.voiesHorsProfil).toEqual([{ voie: 'chevalier.noble', cout: 2 }]);
  });

  it("préfère la voie de sa propre classe quand le nom existe ailleurs (Voie du protecteur)", () => {
    const f = ficheV1VersCalcul({ classe: 'druide', capacites: [{ voie: 'Voie du protecteur', rang: 2 }] });
    expect(f.capacites).toEqual([{ id: 'druide.protecteur.2' }]);
  });

  it('refuse une voie introuvable au lieu de deviner', () => {
    expect(() => ficheV1VersCalcul({ nom: 'Test', classe: 'guerrier', capacites: [{ voie: 'Voie inventée', rang: 1 }] })).toThrow(
      ErreurConversionV1,
    );
  });

  it("reprend la migration « botte » → « jambe » de la v1", () => {
    const botte = { id: 'bottes', type: 'accessoire' };
    expect(ficheV1VersCalcul({ classe: 'guerrier', equipement: { botte } }).equipement).toEqual({ jambe: botte });
    const autre = { id: 'jambieres', type: 'accessoire' };
    const f = ficheV1VersCalcul({ classe: 'guerrier', equipement: { botte, jambe: autre }, inventaireListe: [] });
    expect(f.equipement).toEqual({ jambe: autre });
    expect(f.inventaireListe).toEqual([botte]);
  });
});

describe('voies homonymes', () => {
  it('la v1 teste les voies par leur nom : un identifiant couvre toutes les voies du même nom', () => {
    expect(voiesHomonymes('druide.protecteur').sort()).toEqual(['chevalier.protecteur', 'druide.protecteur']);
    expect(voiesHomonymes('guerrier.chaos')).toHaveLength(10);
    expect(voiesHomonymes('guerrier.elite')).toEqual(['guerrier.elite']);
    expect(() => voiesHomonymes('guerrier.inconnue')).toThrow();
  });

  it("un druide qui a pris la Voie du protecteur du chevalier hors profil en a les bonus, comme en v1", () => {
    const c = new CalculsPersonnage({ classe: 'druide', capacites: [{ id: 'chevalier.protecteur.2' }] });
    expect(c.bonusDefCapacites()).toBe(2);
  });
});
