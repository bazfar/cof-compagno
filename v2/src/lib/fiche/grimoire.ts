import { coutHorsCombat, coutSort, ddSort, seuilEchec, type TermeCout } from '../effets/cout.ts';
import { actionAuPalier, paliersDefinis, palierSuivant, rangDeblocage } from '../effets/paliers.ts';
import { secondeEcole, type ProfilMagique } from '../effets/profil.ts';
import type { ClasseRefonte } from '../schemas/classes.ts';
import type { Action, Element, Maitrise, Palier } from '../schemas/effets.ts';
import type { FicheV2 } from '../schemas/fiche.ts';
import { actionParId, combinaisons } from '../../regles/index.ts';
import { classeDeLaRefonte, contexteDe, NOMS_MAITRISES, nomEcole, nomElement, profilDe, voieDeLaRefonte } from './refonte.ts';
import { texteDuSort, texteElement } from './texte-sort.ts';

/*
 * Le grimoire d'un personnage de la refonte (lot G1, décisions de Thomas du
 * 22/10/2026), tel que la page de magie le dessine (maquette 2.0, « écran
 * Joueur · grimoire », validée) :
 *   - la voie de chaque école en colonne de nœuds R1 à R5, avec le verbe de
 *     chaque rang, appris ou non ;
 *   - pour un verbe : ses paliers, l'effet en combat généré depuis les
 *     données (3a), l'usage hors combat palier par palier (7 : chaque palier
 *     ouvre des possibilités que le joueur et le MJ apprécient), le coût
 *     réel détaillé, le DD, l'aperçu avec un élément et la surcharge ;
 *   - les verbes appris par grimoire (9a), les sorts mineurs, les éléments
 *     (10a).
 * Classes concernées (2a) : toutes celles qui ont des verbes ou des sorts
 * mineurs. Rien ne se lance d'ici (4a : le combat viendra avec L6 ; l'usage
 * hors combat, avec le lot G2). Fonctions pures.
 */

const ORDRE: Palier[] = ['I', 'II', 'III'];

export interface PalierGrimoire {
  palier: Palier;
  /** Rang de la voie qui le débloque (hors voie : palier I seulement). */
  rang: number;
  atteint: boolean;
  combat: string[];
  /** Ce que ce palier ouvre hors combat (le dernier texte défini s'il en a moins). */
  horsCombat: string | null;
}

export interface VerbeGrimoire {
  id: string;
  nom: string;
  description: string;
  rang: number;
  ecole: string;
  /** Maîtrise de son école pour ce personnage. */
  maitrise: string;
  /** Appris par grimoire (hors voie) : palier I seulement. */
  parGrimoire: boolean;
  /** Connu : dans la voie (rang atteint) ou par grimoire ; sinon montré pour ce qui vient. */
  appris: boolean;
  /** Plus haut résultat du d20 qui fait échouer (Non maîtrisé 10, Initié 4, sinon 0). */
  echec: number;
  palierAtteint: Palier;
  paliers: PalierGrimoire[];
  /** Coût au palier atteint, sans élément ni surcharge, terme par terme. */
  cout: { pp: number; detail: TermeCout[] } | null;
  coutHorsCombat: number | null;
  /** DD des sauvegardes contre ce verbe, s'il en demande une. */
  dd: number | null;
  /** Il prend un élément. */
  element: boolean;
  /** Surcharge possible : le palier suivant, et son coût. */
  surcharge: { palier: Palier; pp: number } | null;
  limite: string | null;
}

export interface NoeudVoieEcole {
  rang: number;
  nom: string;
  pris: boolean;
  /** Le verbe de ce rang, s'il y en a un. */
  verbe: string | null;
}

export interface VoieEcole {
  id: string;
  nom: string;
  ecole: string;
  rang: number;
  noeuds: NoeudVoieEcole[];
}

export interface MineurGrimoire {
  id: string;
  nom: string;
  description: string;
  palier: Palier;
  combat: string[];
  horsCombat: string | null;
}

export interface ElementGrimoire {
  id: Element;
  nom: string;
  maitrise: string;
  role: string;
  sort: string;
  derapage: string;
  /** Risque de dérapage en pourcentage (Non maîtrisé 50 %, Initié 20 %). */
  risque: number;
}

export interface Grimoire {
  reservePP: number;
  voies: VoieEcole[];
  verbes: VerbeGrimoire[];
  parGrimoire: VerbeGrimoire[];
  mineurs: MineurGrimoire[];
  elements: ElementGrimoire[];
  combinaisons: { nom: string; elements: string; texte: string }[];
}

/** Les voies de la classe qui donnent les verbes d'une école (Voie de l'école, seconde école, Cercles…). */
function voiesDEcole(classe: ClasseRefonte, ecoleChoisie: string | null): { id: string; ecole: string; palierMax?: Palier }[] {
  const r: { id: string; ecole: string; palierMax?: Palier }[] = [];
  for (const id of classe.voies) {
    const voie = voieDeLaRefonte(id);
    const regle = voie?.rangs.flatMap((x) => x.regles).find((g) => g.type === 'verbeDeLEcole');
    if (!voie || !regle || regle.type !== 'verbeDeLEcole') continue;
    const ecole = regle.ecole ?? (regle.quelle === 'seconde' ? secondeEcole(classe, { ecole: ecoleChoisie ?? undefined }) : ecoleChoisie);
    if (ecole) r.push({ id, ecole, ...(regle.palierMax ? { palierMax: regle.palierMax } : {}) });
  }
  return r;
}

const verbeDuRang = (ecole: string, rang: number) => [...actionParId.values()].find((a) => a.nature === 'verbe' && a.ecole === ecole && a.rang === rang) ?? null;

function verbe(a: Action, palier: Palier, rangVoie: number, maitrise: Maitrise, parGrimoire: boolean, modMagie: number, palierMax?: Palier, appris = true): VerbeGrimoire {
  const max = palierMax ? ORDRE.indexOf(palierMax) : 2;
  const definis = paliersDefinis(a).filter((p) => ORDRE.indexOf(p) <= max && (!parGrimoire || p === 'I'));
  const textes = a.horsCombat?.paliers ?? [];
  const cout = coutSort(a, { palier, ecole: maitrise });
  const suivant = parGrimoire ? null : palierSuivant(a, palier);
  const surcharge = suivant && ORDRE.indexOf(suivant) <= max ? coutSort(a, { palier, surcharge: true, ecole: maitrise }) : null;
  return {
    id: a.id,
    nom: a.nom,
    description: a.description,
    rang: a.rang,
    ecole: nomEcole(a.ecole!),
    maitrise: NOMS_MAITRISES[maitrise],
    parGrimoire,
    appris,
    echec: seuilEchec(maitrise),
    palierAtteint: palier,
    paliers: definis.map((p, i) => ({
      palier: p,
      rang: rangDeblocage(a, p),
      atteint: parGrimoire ? p === 'I' : rangVoie >= rangDeblocage(a, p),
      combat: texteDuSort(p === 'I' ? a : actionAuPalier(a, p)),
      horsCombat: textes.length ? (textes[Math.min(i, textes.length - 1)] ?? null) : null,
    })),
    cout: cout.ok ? { pp: cout.pp, detail: cout.detail } : null,
    coutHorsCombat: cout.ok && textes.length ? coutHorsCombat(cout.pp) : null,
    dd: a.resolution.jet === 'sauvegarde' ? (a.resolution.ddFixe ?? ddSort(modMagie, maitrise)) : null,
    element: !!a.element,
    surcharge: surcharge?.ok ? { palier: surcharge.palierLance, pp: surcharge.pp } : null,
    limite: a.limite === 'volonte' ? null : a.limite,
  };
}

/** Coût d'un verbe avec un élément de cette maîtrise, et sa surcharge éventuelle (aperçu du grimoire). */
export function coutAvecElement(id: string, palier: Palier, ecole: Maitrise, element: Maitrise | null, surcharge = false): { pp: number; detail: TermeCout[] } | null {
  const a = actionParId.get(id);
  if (!a) return null;
  const c = coutSort(a, { palier, ecole, element, surcharge });
  return c.ok ? { pp: c.pp, detail: c.detail } : null;
}

export function grimoireDeLaFiche(f: FicheV2): Grimoire | null {
  const classe = classeDeLaRefonte(f.refonte.classe);
  if (!classe) return null;
  const ctx = contexteDe(f, classe);
  const p: ProfilMagique = profilDe(classe, f.refonte, ctx);
  const seconde = secondeEcole(classe, { ecole: f.refonte.ecole ?? undefined });
  const maitriseDe = (ecole: string | undefined): Maitrise =>
    ecole === f.refonte.ecole ? (p.maitriseEcole ?? 'adepte') : ecole === seconde ? (p.maitriseSecondeEcole ?? 'adepte') : 'adepte';

  const voies: VoieEcole[] = [];
  const verbes: VerbeGrimoire[] = [];
  for (const v of voiesDEcole(classe, f.refonte.ecole)) {
    const voie = voieDeLaRefonte(v.id)!;
    const rang = f.refonte.rangs[v.id] ?? 0;
    voies.push({
      id: v.id,
      nom: voie.nom,
      ecole: nomEcole(v.ecole),
      rang,
      noeuds: voie.rangs.map((rv) => ({ rang: rv.rang, nom: rv.nom, pris: rv.rang <= rang, verbe: rv.regles.some((g) => g.type === 'verbeDeLEcole') ? (verbeDuRang(v.ecole, rv.rang)?.id ?? null) : null })),
    });
    // Tous les verbes de la voie, appris ou non : le grimoire montre aussi ce qui vient.
    for (const rv of voie.rangs) {
      if (!rv.regles.some((g) => g.type === 'verbeDeLEcole')) continue;
      const a = verbeDuRang(v.ecole, rv.rang);
      if (!a || verbes.some((x) => x.id === a.id)) continue;
      const appris = p.verbes.find((x) => x.id === a.id);
      verbes.push(verbe(a, appris?.palier ?? 'I', rang, maitriseDe(a.ecole), false, ctx.modMagie, v.palierMax, !!appris));
    }
  }
  const parGrimoire = p.verbesHorsVoie
    .filter((v) => !p.verbes.some((x) => x.id === v.id))
    .map((v) => actionParId.get(v.id))
    .filter((a): a is Action => !!a)
    .map((a) => verbe(a, 'I', 0, p.verbesHorsVoie.find((v) => v.id === a.id)!.maitrise, true, ctx.modMagie));
  const mineurs: MineurGrimoire[] = p.mineurs
    .map((m) => {
      const a = actionParId.get(m.id);
      if (!a) return null;
      const textes = a.horsCombat?.paliers ?? [];
      return {
        id: a.id,
        nom: a.nom,
        description: a.description,
        palier: m.palier,
        combat: texteDuSort(m.palier === 'I' ? a : actionAuPalier(a, m.palier)),
        horsCombat: textes.length ? (textes[Math.min(ORDRE.indexOf(m.palier), textes.length - 1)] ?? null) : null,
      };
    })
    .filter((m): m is MineurGrimoire => m !== null);
  const elements: ElementGrimoire[] = (Object.entries(p.elements) as [Element, Maitrise][]).map(([id, m]) => {
    const t = texteElement(id)!;
    return { id, nom: nomElement(id), maitrise: NOMS_MAITRISES[m], role: t.role, sort: t.sort, derapage: t.derapage, risque: seuilEchec(m) * 5 };
  });
  const maitres = elements.filter((e) => p.elements[e.id] === 'maitre').map((e) => e.id);
  const connus = elements.map((e) => e.id);
  if (!verbes.length && !parGrimoire.length && !mineurs.length) return null;
  return {
    reservePP: p.reservePP,
    voies,
    verbes,
    parGrimoire,
    mineurs,
    elements,
    combinaisons: maitres.length
      ? combinaisons
          .filter((c) => c.elements.some((e) => maitres.includes(e)) && c.elements.every((e) => connus.includes(e)))
          .map((c) => ({ nom: c.nom, elements: c.elements.map(nomElement).join(' + '), texte: c.texte }))
      : [],
  };
}

/** Maîtrise (clé) d'un élément du personnage, pour l'aperçu du coût. */
export function maitriseElement(f: FicheV2, element: Element): Maitrise | null {
  const classe = classeDeLaRefonte(f.refonte.classe);
  if (!classe) return null;
  return profilDe(classe, f.refonte, contexteDe(f, classe)).elements[element] ?? null;
}

/** Maîtrise (clé) de l'école d'un verbe pour le personnage. */
export function maitriseDuVerbe(f: FicheV2, id: string): Maitrise {
  const classe = classeDeLaRefonte(f.refonte.classe);
  const a = actionParId.get(id);
  if (!classe || !a) return 'adepte';
  const p = profilDe(classe, f.refonte, contexteDe(f, classe));
  const hors = p.verbesHorsVoie.find((v) => v.id === id && !p.verbes.some((x) => x.id === id));
  if (hors) return hors.maitrise;
  const seconde = secondeEcole(classe, { ecole: f.refonte.ecole ?? undefined });
  return a.ecole === f.refonte.ecole ? (p.maitriseEcole ?? 'adepte') : a.ecole === seconde ? (p.maitriseSecondeEcole ?? 'adepte') : 'adepte';
}
