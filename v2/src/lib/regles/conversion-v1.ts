import { classeParId, voieParId } from './donnees';
import type { FicheCalcul, ObjetPorte } from './fiche-calcul';

/*
 * Fiche v1 (Firestore sessions/table-arbre-monde/cof_persos/{id}) → fiche
 * de calcul 2.0. Sert aux tests d'équivalence (L1.3, L1.4) et servira à la
 * migration des fiches (L7).
 *
 * Seule transformation de fond : les voies passent du nom à l'identifiant.
 * Une capacité v1 `{ voie: "Voie de l'élite", rang: 2 }` devient
 * `{ id: "guerrier.elite.2" }`. La voie est cherchée d'abord dans la classe
 * du personnage, puis dans ses voies hors profil (qui, elles, portent leur
 * classe en v1). Une voie introuvable est une erreur : on ne devine pas.
 */

export class ErreurConversionV1 extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- forme v1 non typée
type FicheV1 = Record<string, any>;

function idVoie(classe: string, nom: string): string | undefined {
  return classeParId.get(classe)?.voies.find((v) => v.nom === nom)?.id;
}

/** Reprend la migration « botte » → « jambe » du constructeur Personnage v1. */
export function migrerEquipement(v1: FicheV1): { equipement: Record<string, ObjetPorte | null> | undefined; inventaire: ObjetPorte[] | undefined } {
  const equipement = v1.equipement ? { ...v1.equipement } : undefined;
  let inventaire: ObjetPorte[] | undefined = v1.inventaireListe;
  if (equipement && 'botte' in equipement) {
    const orphelin = equipement.botte;
    if (orphelin) {
      if (!equipement.jambe) equipement.jambe = orphelin;
      else inventaire = [...(inventaire ?? []), orphelin];
    }
    delete equipement.botte;
  }
  return { equipement, inventaire };
}

export function ficheV1VersCalcul(v1: FicheV1): FicheCalcul {
  const classe: string | null = v1.classe ?? null;
  const horsProfil: { classe: string; voie: string; cout?: number }[] = v1.voiesHorsProfil ?? [];

  const resoudre = (nom: string, ou: string): string => {
    const id =
      (classe ? idVoie(classe, nom) : undefined) ??
      horsProfil.map((h) => (h.voie === nom ? idVoie(h.classe, nom) : undefined)).find(Boolean);
    if (!id || !voieParId.has(id)) {
      throw new ErreurConversionV1(`${v1.nom ?? v1.id ?? 'Fiche'} : ${ou} « ${nom} » introuvable pour la classe ${classe}.`);
    }
    return id;
  };

  const { equipement, inventaire } = migrerEquipement(v1);
  return {
    id: v1.id ?? null,
    niveau: v1.niveau,
    classe,
    race: v1.race ?? null,
    raceVariante: v1.raceVariante ?? null,
    caracs: v1.caracs,
    capacites: (v1.capacites ?? []).map((c: { voie: string; rang: number; choix?: string }) => ({
      id: `${resoudre(c.voie, 'voie')}.${c.rang}`,
      ...(c.choix !== undefined ? { choix: c.choix } : {}),
    })),
    capacitesRace: v1.capacitesRace,
    capacitesRaceChoix: v1.capacitesRaceChoix,
    voiesHorsProfil: horsProfil.map((h) => {
      const id = idVoie(h.classe, h.voie);
      if (!id) throw new ErreurConversionV1(`${v1.nom ?? v1.id ?? 'Fiche'} : voie hors profil « ${h.voie} » (${h.classe}) introuvable.`);
      return { voie: id, cout: h.cout };
    }),
    dons: v1.dons,
    donsChoix: v1.donsChoix,
    bonusCompetences: v1.bonusCompetences,
    pvMax: v1.pvMax,
    pvActuel: v1.pvActuel,
    pvHistorique: v1.pvHistorique,
    equipement,
    inventaireListe: inventaire,
    etatsActifs: v1.etatsActifs,
    mutations: v1.mutations,
    corruptionCombat: v1.corruptionCombat,
    corruptionMajeure: v1.corruptionMajeure,
    contratDemoniaquePenalite: v1.contratDemoniaquePenalite,
    amesStockees: v1.amesStockees,
    piecesOr: v1.piecesOr,
    piecesArgent: v1.piecesArgent,
    piecesBronze: v1.piecesBronze,
    grimoireSortsConnus: v1.grimoireSortsConnus,
    grimoireSortsPrepares: v1.grimoireSortsPrepares,
    cercleSpecialisation: v1.cercleSpecialisation ?? null,
  };
}
