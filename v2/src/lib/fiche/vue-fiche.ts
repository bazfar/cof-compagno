import type { Fiche, FicheV1, FicheV2 } from '../schemas/fiche.ts';
import { classeParId as classeRefonteParId, voieParId as voieRefonteParId } from '../../regles/index.ts';
import { CalculsPersonnage, decouperCapacite, statistiquesFiche, type StatistiquesFiche } from '../regles/calculs.ts';
import { capaciteParId, classeParId, constantes, donParId, mutations as tableMutations, raceParId, voieParId } from '../regles/donnees.ts';
import type { Carac } from '../regles/fiche-calcul.ts';
import { ficheCalculDepuisFiche } from '../regles/fiche-document.ts';

/*
 * Ce que la fiche vivante affiche (lot L2.3), calculé d'un coup depuis le
 * document Firestore. Pure et testée sur les 9 fiches réelles : l'écran ne
 * fait que dessiner ce résultat, sans calcul ni règle (v1 : trois CA
 * différentes selon l'endroit, et une fiche entière recalculée et
 * redessinée à chaque événement).
 *
 * Hors périmètre (combat, L6) : compteurs d'usage, états actifs, dégâts,
 * réactions. Équipement et inventaire : L2.4.
 *
 * Fiche de la refonte (version 2, lot L4.11a) : les voies viennent de
 * src/regles/ (rangs pris dans `refonte.rangs`), sans points de Cercle ; la
 * Corruption d'Âme tient lieu de corruption majeure. Les actions et les
 * jauges s'afficheront au lot L4.12.
 */

export interface LigneCarac {
  code: Carac;
  nom: string;
  /** Valeur stockée (base + classe + points libres). */
  valeur: number;
  /** Modificateur effectif (race, capacités, dons, équipement, mutations compris). */
  mod: number;
}

export interface RangAffiche {
  rang: number;
  nom: string;
  effet: string;
  choix?: string;
  offert?: boolean;
}

export interface VoieAffichee {
  id: string;
  nom: string;
  horsProfil: boolean;
  chaos: boolean;
  /** Voie hors combat (L2.6) : rangée à part dans l'onglet Capacités. */
  horsCombat: boolean;
  rangs: RangAffiche[];
}

export interface VueFiche {
  titre: string;
  stats: StatistiquesFiche;
  pv: { actuel: number; max: number };
  pp: { actuel: number; max: number } | null;
  deVie: number;
  caracs: LigneCarac[];
  competences: { carac: Carac; nom: string; mod: number }[];
  voies: VoieAffichee[];
  race: { nom: string; traitPassif: string | null; rangs: RangAffiche[] } | null;
  dons: { id: string; nom: string; effet: string; choix?: string }[];
  donsManquants: number;
  pointsCercle: { nom: string; actuel: number; max: number }[];
  mutations: { palier: number; nom: string; effet: string }[];
  corruptionMajeure: number;
  amesStockees: number;
}

/*
 * Voies hors combat (lot L2.6, à confirmer par Thomas) : les voies v1 que
 * la refonte sort des classes vers l'arbre du Vécu (2.1). D'ici là, la
 * fiche les range sous « Hors combat » ; les données v1 n'ont aucune
 * marque pour le dire, d'où cette liste, seule source de ce classement.
 * L'Alcoolisme n'y est pas : c'est une voie de combat du Barde (Thomas,
 * 18/10).
 */
export const VOIES_HORS_COMBAT: ReadonlySet<string> = new Set([
  'guerrier.ingenieur',
  'barde.spectacle',
  'enchanteur.historien',
  'enchanteur.spectacle',
]);

const CERCLES: { cle: string; nom: string; max: keyof StatistiquesFiche['pointsCercleMax'] }[] = [
  { cle: 'benediction', nom: 'Bénédiction', max: 'benediction' },
  { cle: 'conviction', nom: 'Conviction', max: 'conviction' },
  { cle: 'bannissement', nom: 'Bannissement', max: 'bannissement' },
  { cle: 'jugement', nom: 'Jugement', max: 'jugement' },
];

const texteChoix = (c: unknown): string | undefined =>
  c === undefined || c === null ? undefined : Array.isArray(c) ? c.join(', ') : String(c);

/** Voies v1 : celles de la classe dans leur ordre, puis les hors profil, avec les rangs pris. */
function voiesV1(f: FicheV1, classe: ReturnType<typeof classeParId.get>): VoieAffichee[] {
  const ordre = [...(classe?.voies.map((v) => v.id) ?? []), ...f.voiesHorsProfil.map((h) => h.voie)];
  return ordre
    .map((id) => {
      const voie = voieParId.get(id);
      const rangs = f.capacites
        .filter((cap) => decouperCapacite(cap.id).voie === id)
        .map((cap) => {
          const r = decouperCapacite(cap.id).rang;
          const def = capaciteParId.get(cap.id);
          return { rang: r, nom: def?.nom ?? cap.id, effet: def?.effet ?? '', ...(cap.choix ? { choix: cap.choix } : {}), ...(cap.offert ? { offert: true } : {}) };
        })
        .sort((a, b) => a.rang - b.rang);
      return { id, nom: voie?.nom ?? id, horsProfil: !classe?.voies.some((v) => v.id === id), chaos: !!voie?.speciale, horsCombat: VOIES_HORS_COMBAT.has(id), rangs };
    })
    .filter((v) => v.rangs.length > 0);
}

/** Voies de la refonte : celles de la classe, dans leur ordre, avec les rangs pris. */
function voiesRefonte(f: FicheV2): VoieAffichee[] {
  const classe = classeRefonteParId.get(f.refonte.classe);
  return (classe?.voies ?? [])
    .map((id) => {
      const voie = voieRefonteParId.get(id);
      const n = f.refonte.rangs[id] ?? 0;
      const rangs: RangAffiche[] = (voie?.rangs ?? []).slice(0, n).map((r) => ({
        rang: r.rang,
        nom: r.nom,
        effet: r.description,
        ...(f.refonte.rangOffert?.voie === id && f.refonte.rangOffert.rang === r.rang ? { offert: true } : {}),
      }));
      return { id, nom: voie?.nom ?? id, horsProfil: false, chaos: !!voie?.surAccordDuMJ, horsCombat: false, rangs };
    })
    .filter((v) => v.rangs.length > 0);
}

export function vueFiche(f: Fiche): VueFiche {
  const calc = ficheCalculDepuisFiche(f);
  const c = new CalculsPersonnage(calc);
  const stats = statistiquesFiche(calc);
  const classe = f.classe ? classeParId.get(f.classe) : undefined;
  const race = f.race ? raceParId.get(f.race) : undefined;
  const voies = f.schemaVersion === 1 ? voiesV1(f, classe) : voiesRefonte(f);
  const classeRefonte = f.schemaVersion === 2 ? classeRefonteParId.get(f.refonte.classe) : undefined;

  const variante = race?.variantes.find((v) => v.code === f.raceVariante);
  const rangsRace: RangAffiche[] = race
    ? race.voie.rangs
        .filter((r) => f.capacitesRace.includes(r.rang))
        .map((r) => {
          const choix = f.capacitesRaceChoix[String(r.rang)];
          const parVariante = r.rang === 3 && variante;
          return {
            rang: r.rang,
            nom: (parVariante ? variante.nomCapacite : r.nom) ?? `Rang ${r.rang}`,
            effet: parVariante ? variante.effet : r.effet,
            ...(choix ? { choix } : {}),
          };
        })
    : [];

  const pvMax = f.pvMax;
  return {
    titre: `${race?.nom ?? '—'} · ${classeRefonte?.nom ?? classe?.nom ?? '—'} · niveau ${f.niveau}`,
    stats,
    pv: { actuel: f.pvActuel ?? pvMax, max: pvMax },
    pp: stats.ppMax === null ? null : { actuel: f.ppActuel ?? stats.ppMax, max: stats.ppMax },
    deVie: c.facesDeVie(),
    caracs: constantes.caracs.map((k) => ({ code: k.code as Carac, nom: k.nom, valeur: f.caracs[k.code as Carac] ?? 10, mod: stats.mods[k.code as Carac] })),
    competences: (Object.entries(constantes.competencesParCarac) as [Carac, string[]][]).flatMap(([carac, noms]) =>
      noms.map((nom) => ({ carac, nom, mod: c.modCompetence(nom, carac) })),
    ),
    voies,
    race: race ? { nom: race.voie.nom, traitPassif: race.traitPassif, rangs: rangsRace } : null,
    dons: f.dons.map((id) => {
      const choix = texteChoix(f.donsChoix[id]);
      return { id, nom: donParId.get(id)?.nom ?? id, effet: donParId.get(id)?.effet ?? '', ...(choix ? { choix } : {}) };
    }),
    donsManquants: stats.dons.manquants,
    pointsCercle:
      f.schemaVersion === 1
        ? CERCLES.filter((k) => stats.pointsCercleMax[k.max] > 0).map((k) => ({
            nom: k.nom,
            max: stats.pointsCercleMax[k.max],
            actuel: f.pointsCercle?.[k.cle] ?? stats.pointsCercleMax[k.max],
          }))
        : [],
    mutations: (f.mutations ?? []).map((m) => {
      const def = tableMutations.paliers.find((p) => p.palier === m.palier)?.mutations.find((x) => x.d6 === m.d6);
      return { palier: m.palier, nom: def?.nom ?? `Palier ${m.palier}, ${m.d6}`, effet: def?.effet ?? '' };
    }),
    corruptionMajeure: f.schemaVersion === 1 ? f.corruptionMajeure : f.refonte.jauges.corruptionAme,
    amesStockees: f.amesStockees,
  };
}
