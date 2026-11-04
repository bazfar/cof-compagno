import { COUCHAGES, DE_REPOS_COURT, PART_PP_REPOS_COURT, REPOS_COURTS_MAX, type Couchage } from '../../regles/repos.ts';
import { jaugesDeLaFiche } from '../fiche/actions-fiche.ts';
import { classeDeLaRefonte } from '../fiche/refonte.ts';
import { vueFiche } from '../fiche/vue-fiche.ts';
import type { Fiche } from '../schemas/fiche.ts';

/*
 * Le repos, en fonctions pures (lot L7.1a, décisions de Thomas du
 * 29/10/2026) ; lib/actions/repos.ts l'écrit. Voir src/regles/repos.ts.
 */

export { COUCHAGES, REPOS_COURTS_MAX, type Couchage };

/** Les ressources de classe que ce repos remplit : « repos court » au court ; « repos court » et « repos long », et le Sacré, au long. */
function jaugesRemplies(f: Fiche, quoi: 'court' | 'long'): Record<string, number> {
  if (f.schemaVersion !== 2) return {};
  const res = classeDeLaRefonte(f.refonte.classe)?.ressourceDeClasse;
  const cles = new Set<string>([
    ...(res && (res.recharge === 'reposCourt' || (quoi === 'long' && res.recharge === 'reposLong')) ? [res.ressource] : []),
    ...(quoi === 'long' ? ['sacre'] : []),
  ]);
  return Object.fromEntries(jaugesDeLaFiche(f).flatMap((j) => (cles.has(j.cle) && j.max !== null && j.actuel !== j.max ? [[`refonte.jauges.${j.cle}`, j.max]] : [])));
}

/** 2a, 3a : les champs de la fiche qu'un repos change (PP, ressources) ; les PV attendent le jet du joueur (4b). */
export function apresRepos(f: Fiche, quoi: 'court' | 'long'): Record<string, number> {
  const pp = vueFiche(f).pp;
  const ppApres = !pp ? null : quoi === 'long' ? pp.max : Math.min(pp.max, pp.actuel + Math.ceil(pp.max * PART_PP_REPOS_COURT));
  return { ...(pp && ppApres !== pp.actuel ? { ppActuel: ppApres! } : {}), ...jaugesRemplies(f, quoi) };
}

/** 2a, 3a : le jet de PV du repos : 1d4 au court ; au long, un dé de vie par tranche de deux niveaux, le dé du couchage, le mod de CON. */
export function formuleRepos(f: Fiche, quoi: 'court' | 'long', couchage: Couchage = 'camp'): string {
  if (quoi === 'court') return DE_REPOS_COURT;
  const v = vueFiche(f);
  const con = v.caracs.find((c) => c.code === 'CON')?.mod ?? 0;
  const de = COUCHAGES.find((c) => c.id === couchage)?.de;
  return `${Math.ceil(f.niveau / 2)}d${v.deVie}${de ? `+${de}` : ''}${con > 0 ? `+${con}` : con < 0 ? `${con}` : ''}`;
}

/**
 * Les PV après le jet : un repos n'en retire jamais (un mod de CON négatif
 * ne fait pas descendre) ; jamais au-delà du maximum, ni des PV max
 * stockés, que les règles Firestore bornent (le Pacte de sang affiche un
 * maximum plus haut).
 */
export function pvApresJet(f: Fiche, total: number): number {
  const pv = vueFiche(f).pv;
  return Math.min(pv.max, f.pvMax, pv.actuel + Math.max(0, total));
}
