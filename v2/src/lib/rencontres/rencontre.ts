import { borner, type Case } from '../battlemap/geometrie';
import type { Equilibrage } from '../schemas/bestiaire';
import type { BrouillonRencontre, MonstreRencontre } from '../schemas/rencontre';

/*
 * Préparation des rencontres (lot L3.5) : la partie pure, testée.
 * Les écritures sont dans lib/actions/rencontres.ts.
 */

// ---------- Jauge d'équilibrage (reprise de la v1, data/equilibrage.js) ----------

/** v1 budgetRencontre : une rencontre « sérieuse » coûte 5 Pm par PJ et par niveau. */
export const PM_PAR_PJ_ET_NIVEAU = 5;

export interface MonstrePese {
  dangerosite: number;
  role: string;
}

/**
 * v1 coutRencontre : la somme des Pm de chaque monstre (selon sa
 * dangerosité, pondérée par le coefficient de son rôle), multipliée par le
 * coefficient de boss quand la rencontre mêle la dangerosité la plus haute
 * à des monstres plus faibles (un boss concentre la menace).
 */
export function coutRencontre(monstres: readonly MonstrePese[], eq: Pick<Equilibrage, 'roles' | 'pmDangerosite' | 'coeffBoss'>): number {
  if (!monstres.length) return 0;
  const brut = monstres.reduce((t, m) => {
    const role = eq.roles[m.role] ?? eq.roles.soldat;
    return t + (eq.pmDangerosite[String(m.dangerosite)] ?? 0) * (role?.coeffPm ?? 1);
  }, 0);
  const maxD = Math.max(...monstres.map((m) => m.dangerosite));
  const aUnBoss = monstres.some((m) => m.dangerosite < maxD);
  return Math.round(brut * (aUnBoss ? eq.coeffBoss : 1));
}

/** v1 budgetRencontre. */
export function budgetRencontre(nbPJ: number, niveauMoyen: number): number {
  return Math.round(PM_PAR_PJ_ET_NIVEAU * nbPJ * niveauMoyen);
}

export type Verdict = 'vide' | 'facile' | 'moderee' | 'serieuse' | 'dure' | 'mortelle';

export const LIBELLES_VERDICT: Record<Verdict, string> = {
  vide: 'Aucun monstre',
  facile: 'Facile',
  moderee: 'Modérée',
  serieuse: 'Sérieuse',
  dure: 'Dure',
  mortelle: 'Très dangereuse',
};

/**
 * Le budget v1 décrit une rencontre sérieuse : environ la moitié des
 * ressources consommées, un ou deux personnages à terre. Les autres paliers
 * sont des repères autour de lui, pas une mesure.
 */
export function verdict(cout: number, budget: number): Verdict {
  if (cout <= 0) return 'vide';
  if (budget <= 0) return 'mortelle';
  const r = cout / budget;
  if (r < 0.5) return 'facile';
  if (r < 0.85) return 'moderee';
  if (r <= 1.15) return 'serieuse';
  if (r <= 1.5) return 'dure';
  return 'mortelle';
}

/** Le groupe face à la rencontre : les niveaux des personnages retenus (présents de la séance, sinon PJ joués). */
export function groupe(niveaux: readonly number[]): { nbPJ: number; niveauMoyen: number } {
  if (!niveaux.length) return { nbPJ: 0, niveauMoyen: 0 };
  return { nbPJ: niveaux.length, niveauMoyen: Math.round((10 * niveaux.reduce((a, b) => a + b, 0)) / niveaux.length) / 10 };
}

// ---------- Monstres du brouillon ----------

/** Ajoute `combien` exemplaires d'un monstre, avec des clés uniques et des noms distincts (« Gobelin », « Gobelin 2 »). */
export function ajouterMonstres(b: BrouillonRencontre, monstre: string, nomBase: string, combien: number): BrouillonRencontre {
  const n = Math.max(1, Math.min(60 - b.monstres.length, Math.round(combien)));
  const base = nomBase.trim().slice(0, 36) || 'Monstre';
  const cles = new Set(b.monstres.map((m) => m.cle));
  const noms = new Set(b.monstres.map((m) => m.nom));
  const racine = monstre.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 50) || 'm';
  const ajoutes: MonstreRencontre[] = [];
  for (let i = 0; i < n; i++) {
    let k = 1;
    while (cles.has(`${racine}-${k}`)) k++;
    const cle = `${racine}-${k}`;
    cles.add(cle);
    let nom = base;
    for (let j = 2; noms.has(nom); j++) nom = `${base} ${j}`;
    noms.add(nom);
    ajoutes.push({ cle, monstre, nom, cx: null, cy: null });
  }
  return { ...b, monstres: [...b.monstres, ...ajoutes] };
}

/**
 * Place les monstres qui ne le sont pas encore : en spirale autour du
 * centre de la scène, sur des cases libres. Le MJ les déplace ensuite dans
 * l'aperçu.
 */
export function placerLesNonPlaces(monstres: readonly MonstreRencontre[], scene: { colonnes: number; lignes: number }): MonstreRencontre[] {
  const prises = new Set(monstres.filter((m) => m.cx !== null && m.cy !== null).map((m) => `${m.cx},${m.cy}`));
  const centre = borner(scene, Math.floor(scene.colonnes / 2), Math.floor(scene.lignes / 2));
  const cases = spirale(centre, scene);
  return monstres.map((m) => {
    if (m.cx !== null && m.cy !== null) {
      const c = borner(scene, m.cx, m.cy);
      return c.cx === m.cx && c.cy === m.cy ? m : { ...m, ...c };
    }
    const libre = cases.find((c) => !prises.has(`${c.cx},${c.cy}`));
    if (!libre) return m;
    prises.add(`${libre.cx},${libre.cy}`);
    return { ...m, cx: libre.cx, cy: libre.cy };
  });
}

function spirale(centre: Case, scene: { colonnes: number; lignes: number }): Case[] {
  const cases: Case[] = [];
  const rayonMax = Math.max(scene.colonnes, scene.lignes);
  for (let r = 0; r <= rayonMax && cases.length < 200; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = centre.cx + dx, cy = centre.cy + dy;
        if (cx >= 0 && cy >= 0 && cx < scene.colonnes && cy < scene.lignes) cases.push({ cx, cy });
      }
    }
  }
  return cases;
}

/** Nom du jeton d'un monstre de la rencontre (L6 retrouvera la rencontre et le monstre par lui). */
export function idJetonRencontre(rencontre: string, cle: string): string {
  return `m-${rencontre}-${cle}`;
}

/** Ce qui manque pour lancer, en une phrase ; null si tout est prêt. */
export function manquePourLancer(b: BrouillonRencontre): string | null {
  if (!b.scene) return 'Choisis une scène.';
  if (!b.monstres.length) return 'Ajoute au moins un monstre.';
  if (b.monstres.some((m) => m.cx === null || m.cy === null)) return 'Des monstres ne sont pas encore placés : ouvre l’aperçu de la scène.';
  return null;
}

/** Identifiant d'une nouvelle rencontre. */
export function nouvelIdRencontre(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}
