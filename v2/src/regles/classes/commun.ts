import type { VoieSaisie } from '../../lib/schemas/classes';

/*
 * Voies communes à plusieurs classes de lanceurs (lot L4.5).
 *
 * Voie de l'école (validé) : chaque rang débloque le verbe de même rang de
 * l'école choisie à la création ; l'école est Adepte au rang 1, Maître au
 * rang 4 ; les paliers suivent le rang atteint dans la voie.
 *
 * Seconde école (Envoûteur, 4ᵉ voie au choix, validé) : les verbes de
 * l'autre école, plafonnée à Adepte et sans palier III ; son verbe de rang
 * 5 reste accessible au palier I (décision 14a du 21/10/2026).
 */
export function voieDeLEcole(classe: string): VoieSaisie {
  return {
    id: `${classe}.ecole`,
    nom: 'Voie de l’école',
    description: 'L’école choisie à la création, jusqu’à la maîtrise.',
    rangs: [
      { rang: 1, nom: 'Premier verbe', description: 'Le verbe de rang 1 de l’école ; l’école est Adepte.', regles: [{ type: 'verbeDeLEcole' }, { type: 'maitriseEcole', niveau: 'adepte' }] },
      { rang: 2, nom: 'Deuxième verbe', description: 'Le verbe de rang 2 de l’école.', regles: [{ type: 'verbeDeLEcole' }] },
      { rang: 3, nom: 'Troisième verbe', description: 'Le verbe de rang 3 de l’école ; le verbe de rang 1 passe au palier II.', regles: [{ type: 'verbeDeLEcole' }] },
      {
        rang: 4,
        nom: 'Maître de l’école',
        description: 'Le verbe de rang 4 ; l’école est Maître : −1 PP sur ses verbes, +2 au DD.',
        regles: [{ type: 'verbeDeLEcole' }, { type: 'maitriseEcole', niveau: 'maitre' }],
      },
      { rang: 5, nom: 'Cinquième verbe', description: 'Le verbe de rang 5 de l’école (1x/combat).', regles: [{ type: 'verbeDeLEcole' }] },
    ],
  };
}

export function voieDeLaSecondeEcole(classe: string): VoieSaisie {
  const rang = (n: number, description: string, maitrise = false) => ({
    rang: n,
    nom: `Verbe de rang ${n}`,
    description,
    regles: [{ type: 'verbeDeLEcole' as const, quelle: 'seconde' as const, palierMax: 'II' as const }, ...(maitrise ? [{ type: 'maitriseEcole' as const, quelle: 'seconde' as const, niveau: 'adepte' as const }] : [])],
  });
  return {
    id: `${classe}.seconde-ecole`,
    nom: 'Seconde école',
    description: 'L’autre école, jusqu’à Adepte, sans palier III.',
    rangs: [
      rang(1, 'Le verbe de rang 1 de l’autre école ; elle est Adepte.', true),
      rang(2, 'Le verbe de rang 2 de l’autre école.'),
      rang(3, 'Le verbe de rang 3 ; le verbe de rang 1 passe au palier II.'),
      rang(4, 'Le verbe de rang 4 ; l’école reste Adepte.'),
      rang(5, 'Le verbe de rang 5, au palier I (1x/combat).'),
    ],
  };
}
