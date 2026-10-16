/*
 * Jets de dés (lot L2.5). Une seule fonction de tirage pour toute l'app :
 * potions, PV de montée de niveau, tests depuis la fiche, lanceur libre.
 * `alea` rend un nombre dans [0, 1[ (Math.random par défaut) : les tests
 * fixent les dés.
 */

export interface Jet {
  des: number[];
  faces: number;
  bonus: number;
  total: number;
}

/** « XdY », « XdY+Z », « XdY-Z » (espaces ignorés) ; null si la formule est illisible. Au plus 100 dés de 1000 faces, bonus entre −1000 et +1000. */
export function lancerFormule(formule: string, alea: () => number = Math.random): Jet | null {
  const m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(formule.replace(/\s/g, ''));
  if (!m) return null;
  const nb = Number(m[1] || 1), faces = Number(m[2]), bonus = Number(m[3] || 0);
  if (nb < 1 || nb > 100 || faces < 2 || faces > 1000 || Math.abs(bonus) > 1000) return null;
  const des = Array.from({ length: nb }, () => 1 + Math.floor(alea() * faces));
  return { des, faces, bonus, total: des.reduce((t, d) => t + d, bonus) };
}

/** Formule d'un test : « 1d20+3 », « 1d20-1 », « 1d20 ». */
export function formuleTest(mod: number): string {
  return `1d20${mod > 0 ? `+${mod}` : mod < 0 ? mod : ''}`;
}

/** Texte d'un jet : « 1d20+3 → 14 + 3 = 17 ». */
export function texteJet(formule: string, jet: Jet): string {
  const des = jet.des.join(' + ');
  const bonus = jet.bonus ? ` ${jet.bonus > 0 ? '+' : '−'} ${Math.abs(jet.bonus)}` : '';
  return jet.des.length === 1 && !jet.bonus ? `${formule} → ${jet.total}` : `${formule} → ${des}${bonus} = ${jet.total}`;
}
