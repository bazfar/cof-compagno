/*
 * Évaluateur de formules de scaling des objets (`@player-coin`…), repris
 * À L'IDENTIQUE de js/formule.js (v1) pour les tests d'équivalence (L1.3).
 *
 * Sécurité, comme en v1 : seuls les noms du registre et un jeu restreint
 * d'opérateurs et de fonctions passent la liste blanche ; toute autre
 * formule vaut 0. À remplacer par un vrai analyseur avec le lot loot (L3),
 * qui reprend la Forge du MJ : `new Function` n'est gardé ici que pour
 * produire exactement les mêmes nombres que la v1.
 */

/** Ce que les formules peuvent lire du personnage. */
export interface PersoFormule {
  piecesOr?: number;
  piecesArgent?: number;
  piecesBronze?: number;
  niveau?: number;
  pvActuel?: number;
  pvMax?: number;
  corruptionCombat?: number;
  caracs?: Partial<Record<string, number>>;
  mod(code: string): number;
}

function pourcentage(p: PersoFormule): number {
  const m = p.pvMax;
  return m ? Math.floor(((p.pvActuel || 0) / m) * 100) : 0;
}

const carac = (p: PersoFormule, code: string) => (p.caracs && p.caracs[code]) || 0;
const modCarac = (p: PersoFormule, code: string) => p.mod(code) || 0;

const REGISTRE: Record<string, (p: PersoFormule) => number> = {
  'player-coin': (p) => p.piecesOr || 0,
  'player-silver': (p) => p.piecesArgent || 0,
  'player-bronze': (p) => p.piecesBronze || 0,
  'player-level': (p) => p.niveau || 1,
  'player-hp': (p) => p.pvActuel || 0,
  'player-hp-max': (p) => p.pvMax || 0,
  'player-hp-percent': pourcentage,
  'player-corruption': (p) => p.corruptionCombat || 0,
  'player-for': (p) => carac(p, 'FOR'),
  'player-dex': (p) => carac(p, 'DEX'),
  'player-con': (p) => carac(p, 'CON'),
  'player-int': (p) => carac(p, 'INT'),
  'player-sag': (p) => carac(p, 'SAG'),
  'player-cha': (p) => carac(p, 'CHA'),
  'player-mod-for': (p) => modCarac(p, 'FOR'),
  'player-mod-dex': (p) => modCarac(p, 'DEX'),
  'player-mod-con': (p) => modCarac(p, 'CON'),
  'player-mod-int': (p) => modCarac(p, 'INT'),
  'player-mod-sag': (p) => modCarac(p, 'SAG'),
  'player-mod-cha': (p) => modCarac(p, 'CHA'),
};

const FONCTIONS = ['floor', 'ceil', 'round', 'min', 'max', 'abs'];

export function evaluerFormule(formule: unknown, perso: PersoFormule): number {
  if (!formule || typeof formule !== 'string') return 0;
  const expr = formule.replace(/@([a-z0-9-]+)/gi, (_m, nom: string) => {
    const lire = REGISTRE[nom.toLowerCase()];
    return '(' + (lire ? Number(lire(perso)) || 0 : 0) + ')';
  });
  const sansFonctions = expr.replace(new RegExp('\\b(' + FONCTIONS.join('|') + ')\\b', 'g'), '');
  if (!/^[-+*/%().,\s0-9]*$/.test(sansFonctions)) return 0;
  try {
    const f = new Function(...FONCTIONS, '"use strict"; return (' + expr + ');') as (...a: unknown[]) => unknown;
    const r = f(Math.floor, Math.ceil, Math.round, Math.min, Math.max, Math.abs);
    return typeof r === 'number' && Number.isFinite(r) ? r : 0;
  } catch {
    return 0;
  }
}
