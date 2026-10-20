import { decouperCapacite } from '../regles/calculs.ts';
import { classeParId, donParId, raceParId, voieParId } from '../regles/donnees.ts';
import { CARACS } from '../schemas/commun.ts';
import { schemaFiche, type Fiche } from '../schemas/fiche.ts';

/*
 * Correction d'une fiche par le MJ (lot L3.6, cadrage L3 « édition des
 * fiches »). Pur et testé ; l'écriture est corrigerFiche (actions/persos).
 *
 * Le brouillon part de la fiche au moment où le MJ ouvre la correction
 * (la « base »). À l'enregistrement, seuls les champs que le MJ a changés
 * par rapport à cette base sont écrits : une modification faite entre-temps
 * par le joueur (PV, sac…) sur un autre champ n'est jamais écrasée.
 */

export interface Correction {
  nom: string;
  genre: string | null;
  niveau: number;
  classe: string | null;
  race: string | null;
  caracs: Fiche['caracs'];
  pvMax: number;
  pvActuel: number | null;
  capacites: Fiche['capacites'];
  capacitesRace: number[];
  dons: string[];
}

export const CHAMPS_CORRECTION = ['nom', 'genre', 'niveau', 'classe', 'race', 'caracs', 'pvMax', 'pvActuel', 'capacites', 'capacitesRace', 'dons'] as const;

export const LIBELLES_CHAMPS: Record<(typeof CHAMPS_CORRECTION)[number], string> = {
  nom: 'nom',
  genre: 'genre',
  niveau: 'niveau',
  classe: 'classe',
  race: 'race',
  caracs: 'caractéristiques',
  pvMax: 'PV max',
  pvActuel: 'PV actuels',
  capacites: 'voies et rangs',
  capacitesRace: 'voie raciale',
  dons: 'dons',
};

/** Copie ordinaire (JSON) : les fiches des magasins sont des proxys Svelte, que structuredClone refuse. */
const copier = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export function correctionDepuis(f: Fiche): Correction {
  return copier({
    nom: f.nom,
    genre: f.genre ?? null,
    niveau: f.niveau,
    classe: f.classe,
    race: f.race,
    caracs: f.caracs,
    pvMax: f.pvMax,
    pvActuel: f.pvActuel,
    capacites: f.capacites,
    capacitesRace: f.capacitesRace,
    dons: f.dons,
  });
}

/** Rang atteint dans une voie (le plus haut rang pris). */
export function rangDeVoie(capacites: Fiche['capacites'], voie: string): number {
  return Math.max(0, ...capacites.map((c) => decouperCapacite(c.id)).filter((c) => c.voie === voie).map((c) => c.rang));
}

/** Les voies que le MJ peut régler : celles de la classe, les hors profil, et toute voie déjà présente dans la fiche. */
export function voiesCorrigeables(c: Pick<Correction, 'classe' | 'capacites'>, voiesHorsProfil: Fiche['voiesHorsProfil']): { id: string; nom: string; max: number; horsProfil: boolean }[] {
  const classe = c.classe ? classeParId.get(c.classe) : undefined;
  const ids = [...(classe?.voies.map((v) => v.id) ?? []), ...voiesHorsProfil.map((h) => h.voie), ...c.capacites.map((cap) => decouperCapacite(cap.id).voie)];
  return [...new Set(ids)].map((id) => {
    const v = voieParId.get(id);
    return { id, nom: v?.nom ?? id, max: v?.rangs.length ?? rangDeVoie(c.capacites, id), horsProfil: !classe?.voies.some((x) => x.id === id) };
  });
}

/**
 * Règle le rang d'une voie : les rangs gardés le restent tels quels (choix
 * et rang offert compris), les rangs manquants jusqu'au rang voulu sont
 * ajoutés, ceux au-delà sont retirés.
 */
export function avecRang(capacites: Fiche['capacites'], voie: string, rang: number): Fiche['capacites'] {
  const autres = capacites.filter((c) => decouperCapacite(c.id).voie !== voie);
  const gardes = capacites.filter((c) => {
    const d = decouperCapacite(c.id);
    return d.voie === voie && d.rang <= rang;
  });
  const presents = new Set(gardes.map((c) => decouperCapacite(c.id).rang));
  const ajoutes = Array.from({ length: rang }, (_, i) => i + 1)
    .filter((r) => !presents.has(r))
    .map((r) => ({ id: `${voie}.${r}` }));
  return [...autres, ...[...gardes, ...ajoutes].sort((a, b) => decouperCapacite(a.id).rang - decouperCapacite(b.id).rang)];
}

/** Rangs de la voie raciale (cases à cocher : un rang racial se choisit seul). */
export function rangsRace(race: string | null): { rang: number; nom: string }[] {
  const r = race ? raceParId.get(race) : undefined;
  return r ? r.voie.rangs.map((x) => ({ rang: x.rang, nom: x.nom ?? `Rang ${x.rang}` })) : [];
}

const egal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Les champs changés par rapport à la base, seuls à écrire. */
export function champsCorriges(base: Correction, brouillon: Correction): Partial<Correction> {
  const champs: Partial<Correction> = {};
  for (const k of CHAMPS_CORRECTION) {
    if (!egal(base[k], brouillon[k])) (champs as Record<string, unknown>)[k] = copier(brouillon[k]);
  }
  return champs;
}

/** Vérifie la fiche corrigée : un refus en phrase, ou null. */
export function refusCorrection(fiche: Fiche, champs: Partial<Correction>): string | null {
  if (champs.nom !== undefined && !champs.nom.trim()) return 'Le nom est obligatoire.';
  for (const k of CARACS) {
    const v = champs.caracs?.[k];
    if (v !== undefined && (!Number.isInteger(v) || v < 1 || v > 30)) return `${k} doit être un entier entre 1 et 30.`;
  }
  const { id: _id, ...sansId } = fiche as Fiche & { id?: string }; // l'id du magasin n'est pas un champ
  const r = schemaFiche.safeParse({ ...sansId, ...champs, ...(champs.nom !== undefined ? { nom: champs.nom.trim() } : {}) });
  if (!r.success) {
    const i = r.error.issues[0];
    return `Correction refusée (${i?.path.join('.') ?? '?'}) : ${i?.message ?? 'valeur invalide'}.`;
  }
  return null;
}

/** Avertissements (n'empêchent pas d'enregistrer). */
export function avertissements(fiche: Pick<Fiche, 'voiesHorsProfil'>, c: Correction): string[] {
  const a: string[] = [];
  if (c.pvActuel !== null && c.pvActuel > c.pvMax) a.push('Les PV actuels dépassent les PV max.');
  const classe = c.classe ? classeParId.get(c.classe) : undefined;
  const horsClasse = new Set(fiche.voiesHorsProfil.map((h) => h.voie));
  const etrangeres = [...new Set(c.capacites.map((cap) => decouperCapacite(cap.id).voie))].filter((v) => !classe?.voies.some((x) => x.id === v) && !horsClasse.has(v));
  if (etrangeres.length) a.push(`Rangs dans des voies hors de la classe : ${etrangeres.map((v) => voieParId.get(v)?.nom ?? v).join(', ')}.`);
  const race = c.race ? raceParId.get(c.race) : undefined;
  if (c.capacitesRace.some((r) => !race?.voie.rangs.some((x) => x.rang === r))) a.push('Des rangs raciaux n’existent pas pour cette race.');
  if (c.dons.some((d) => !donParId.has(d))) a.push('Des dons inconnus sont dans la fiche.');
  return a;
}
