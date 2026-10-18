import type { ArmeMonstre, ArmureMonstre, Monstre, MonstreEnBase } from '../schemas/bestiaire.ts';

/*
 * Bestiaire du MJ (lot L3.2), en fonctions pures et testées : passage d'un
 * monstre au document Firestore et retour, recherche, lignes d'attaque
 * lisibles, identifiant d'une créature créée par le MJ. Les écrans et les
 * actions ne font qu'appeler ces fonctions.
 */

/** Monstre → document (sans son id, qui est celui du document). */
export function versDocument(m: Monstre, origine: MonstreEnBase['origine'], majLe: number): MonstreEnBase {
  const { id: _id, ...reste } = m;
  return { ...reste, origine, majLe };
}

/** Document → monstre (l'id revient du document). */
export function depuisDocument(id: string, d: MonstreEnBase): Monstre {
  const { origine: _o, majLe: _m, ...reste } = d;
  return { id, ...reste };
}

/** Recherche sans majuscules ni accents, sur le nom, la faction, la famille et le rôle. */
export function correspond(m: Pick<Monstre, 'nom' | 'faction' | 'famille' | 'role'>, recherche: string): boolean {
  const n = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = n(recherche.trim());
  return !q || n([m.nom, m.faction ?? '', m.famille ?? '', m.role].join(' ')).includes(q);
}

export interface FiltresBestiaire {
  recherche: string;
  /** 0 : toutes. */
  dangerosite: number;
  /** '' : toutes. */
  race: string;
  bossSeulement: boolean;
}

export function filtrer<T extends Pick<Monstre, 'nom' | 'faction' | 'famille' | 'role' | 'dangerosite' | 'race' | 'boss'>>(monstres: T[], f: FiltresBestiaire): T[] {
  return monstres
    .filter((m) => correspond(m, f.recherche))
    .filter((m) => !f.dangerosite || m.dangerosite === f.dangerosite)
    .filter((m) => !f.race || (m.race as string[]).includes(f.race))
    .filter((m) => !f.bossSeulement || m.boss)
    .sort((a, b) => a.dangerosite - b.dangerosite || a.nom.localeCompare(b.nom, 'fr'));
}

const signe = (n: number) => (n >= 0 ? `+${n}` : String(n));

/** « Dague rouillée +2 · 1d4 · contact » ; l'arme inconnue est dite, pas devinée. */
export function ligneAttaque(a: Monstre['attaques'][number], armes: ReadonlyMap<string, ArmeMonstre>): string {
  const arme = armes.get(a.armeId);
  if (!arme) return `${a.nom} ${signe(a.bonusAttaque)} · arme inconnue (${a.armeId})`;
  const degats = a.bonusDegats ? `${arme.degats}${signe(a.bonusDegats)}` : arme.degats;
  return `${a.nom} ${signe(a.bonusAttaque)} · ${degats} ${arme.typedegats === 'magique' ? 'magiques' : ''}`.trim() + ` · ${arme.portee}`;
}

/** « Cuir épais (réduction 1, naturelle) » ou null. */
export function ligneArmure(id: string | undefined, armures: ReadonlyMap<string, ArmureMonstre>): string | null {
  if (!id) return null;
  const a = armures.get(id);
  if (!a) return `armure inconnue (${id})`;
  return `${a.nom} (réduction ${a.reduction}${a.naturelle ? ', naturelle' : ''})`;
}

/** Identifiant d'une créature créée par le MJ : lisible, unique, compatible avec schemaId. */
export function nouvelIdMonstre(nom: string, existants: ReadonlySet<string>): string {
  const base =
    'mj_' +
    (nom
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || 'creature');
  let id = base;
  for (let i = 2; existants.has(id); i++) id = `${base}_${i}`;
  return id;
}
