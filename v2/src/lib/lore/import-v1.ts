import { schemaFicheLoreMj, type FicheLoreMj, type PassageMj } from '../schemas/lore.ts';

/*
 * Conversion du lore de la v1 (data/donnees.js : LORE, CHRONOLOGIE,
 * FACTIONS, PNJ_CLES) en fiches de lore 2.0 (lot L2.7a, décision 1a du
 * 18/10/2026). Pure : elle reçoit les objets v1 déjà chargés. Lancée par
 * outils/exporter-lore-v1.ts, jamais par l'app : le lore v1 ne doit pas
 * se retrouver dans le code livré aux joueurs.
 *
 * Partage à l'import « comme la v1 » (décision 2a) :
 * - section `mjSeulement` → fiche visible du MJ seul ; les autres → tous ;
 * - PNJ : nom, titre et faction visibles de tous ; les accroches sont
 *   scellées (MJ seul en v1) ; pour un PNJ `secret`, résumé et
 *   description aussi (la v1 les verrouillait jusqu'à révélation) ;
 * - entité de faction `secret` : sa `descriptionSecrete` est scellée.
 * Les révélations faites en v1 (PNJ et entités révélés) vivent dans la
 * base v1 et ne sont pas reprises : le MJ descelle à la main.
 */

type Brut = any;

export interface LoreV1 {
  LORE: { sections: Brut[] };
  CHRONOLOGIE: Brut[];
  FACTIONS: Brut[];
  PNJ_CLES: Brut[];
}

export interface FicheImportee {
  id: string;
  fiche: FicheLoreMj;
}

/** Identifiant lisible tiré d'un nom : minuscules sans accents, tirets. */
export function slug(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/** Paragraphes d'un texte v1 (séparés par une ligne vide). */
export function paragraphes(texte: unknown): string[] {
  if (typeof texte !== 'string') return [];
  return texte
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

const CATEGORIE_CHRONOLOGIE = 'Chronologie';
const CATEGORIE_FACTIONS = 'Factions';
const CATEGORIE_PNJ = 'Personnages';

export function convertirLoreV1(v1: LoreV1, date: number): FicheImportee[] {
  const sortie: FicheImportee[] = [];
  let ordre = 0;
  const ajouter = (id: string, f: Omit<FicheLoreMj, 'ordre' | 'majLe' | 'reveleLe' | 'lecteurs'> & { passages: PassageMj[] }) => {
    if (sortie.some((s) => s.id === id)) throw new Error(`Identifiant de fiche en double : ${id}`);
    ordre += 10;
    const fiche = schemaFicheLoreMj.parse({ ...f, ordre, lecteurs: [], majLe: date, reveleLe: date });
    sortie.push({ id, fiche });
  };
  /** Passages d'un texte : un par paragraphe ; l'intertitre va sur le premier. */
  const passagesDe = (prefixe: string, texte: unknown, scelle: boolean, intertitre?: string): PassageMj[] =>
    paragraphes(texte).map((t, i) => ({ id: `${prefixe}-${i + 1}`, ...(intertitre && i === 0 ? { intertitre } : {}), texte: t, scelle }));

  // 1. Sections du lore (sauf celles que la v1 range sous une faction).
  for (const s of v1.LORE.sections.filter((s: Brut) => !s.deplaceVersFaction)) {
    ajouter(`section-${slug(s.titre)}`, {
      titre: s.titre,
      categorie: s.categorie,
      etiquettes: [],
      visibilite: s.mjSeulement ? 'mj' : 'tous',
      passages: passagesDe('p', s.contenu, false),
      source: `v1:section:${slug(s.titre)}`,
    });
  }

  // 2. Chronologie : une fiche par période.
  for (const c of v1.CHRONOLOGIE) {
    const quand = [c.quand, typeof c.duree === 'string' ? `durée ${c.duree}` : null].filter(Boolean).join(' · ');
    ajouter(`chrono-${c.id}`, {
      titre: c.periode,
      ...(quand ? { sousTitre: quand } : {}),
      categorie: CATEGORIE_CHRONOLOGIE,
      etiquettes: (c.peuples ?? []).map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)),
      visibilite: 'tous',
      passages: passagesDe('p', c.description, false),
      source: `v1:chrono:${c.id}`,
    });
  }

  // 3. Factions : une fiche par groupe, puis une par entité, puis les sections rattachées.
  for (const g of v1.FACTIONS) {
    const idGroupe = slug(g.groupe);
    ajouter(`faction-${idGroupe}`, {
      titre: g.groupe,
      categorie: CATEGORIE_FACTIONS,
      etiquettes: [],
      visibilite: 'tous',
      passages: [
        ...passagesDe('histoire', g.histoire, false, 'Histoire'),
        ...passagesDe('situation', g.update, false, 'Situation actuelle'),
        ...passagesDe('intro', g.intro, false),
        ...passagesDe('synthese', g.synthese, false, 'Rapports de force'),
      ],
      source: `v1:faction:${idGroupe}`,
    });
    for (const e of g.entites ?? []) {
      const idEntite = e.id ? slug(e.id) : slug(e.nom);
      ajouter(`entite-${idEntite}`, {
        titre: e.nom,
        sousTitre: [g.groupe, e.devise ? `« ${e.devise} »` : null].filter(Boolean).join(' · '),
        categorie: CATEGORIE_FACTIONS,
        etiquettes: [g.groupe.slice(0, 40)],
        visibilite: 'tous',
        passages: [
          ...passagesDe('description', e.description, false),
          ...passagesDe('situation', e.update, false, 'Situation actuelle'),
          ...passagesDe('secret', e.descriptionSecrete, true, 'Ce que cache cette entité'),
        ],
        source: `v1:entite:${idEntite}`,
      });
    }
    for (const s of v1.LORE.sections.filter((s: Brut) => s.deplaceVersFaction === g.groupe)) {
      ajouter(`section-${slug(s.titre)}`, {
        titre: s.titre,
        sousTitre: g.groupe,
        categorie: CATEGORIE_FACTIONS,
        etiquettes: [g.groupe.slice(0, 40)],
        visibilite: s.mjSeulement ? 'mj' : 'tous',
        passages: passagesDe('p', s.contenu, false),
        source: `v1:section:${slug(s.titre)}`,
      });
    }
  }

  // 4. PNJ.
  for (const p of v1.PNJ_CLES) {
    const secret = !!p.secret;
    ajouter(`pnj-${p.id}`, {
      titre: p.nom,
      sousTitre: [p.titre, p.faction].filter(Boolean).join(' · '),
      categorie: CATEGORIE_PNJ,
      etiquettes: [p.faction, ...(p.rencontre ? ['Rencontré'] : [])].filter(Boolean).map((t: string) => t.slice(0, 40)),
      visibilite: 'tous',
      passages: [
        ...passagesDe('resume', p.resume, secret),
        ...passagesDe('description', p.description, secret),
        ...(p.accroches ?? []).map((a: string, i: number) => ({ id: `accroche-${i + 1}`, intertitre: 'Accroche', texte: a.trim(), scelle: true })),
      ],
      source: `v1:pnj:${p.id}`,
    });
  }

  // Une section v1 rattachée à une faction absente serait perdue : on le refuse.
  const absentes = v1.LORE.sections.filter((s: Brut) => s.deplaceVersFaction && !v1.FACTIONS.some((g: Brut) => g.groupe === s.deplaceVersFaction));
  if (absentes.length) throw new Error(`Sections rattachées à une faction inconnue : ${absentes.map((s: Brut) => s.titre).join(', ')}`);
  return sortie;
}

/*
 * Garde-fou de canon : des noms que les joueurs ne doivent jamais lire
 * (contrainte de campagne : le Roi des Mendiants n'est jamais nommé ni
 * soupçonné). L'export échoue si l'un d'eux paraît dans un texte que la
 * fiche montrerait aux joueurs.
 */
export const NOMS_JAMAIS_REVELES = ['Roi des Mendiants'] as const;

/** Les fuites trouvées : « fiche › passage : nom ». Vide si aucune. */
export function fuitesDeCanon(fiches: FicheImportee[], interdits: readonly string[] = NOMS_JAMAIS_REVELES): string[] {
  const fuites: string[] = [];
  for (const { id, fiche } of fiches) {
    if (fiche.visibilite === 'mj') continue;
    const visibles = [fiche.titre, fiche.sousTitre ?? '', ...fiche.etiquettes, ...fiche.passages.filter((p) => !p.scelle).flatMap((p) => [p.intertitre ?? '', p.texte])];
    for (const nom of interdits) if (visibles.some((t) => t.includes(nom))) fuites.push(`${id} : ${nom}`);
  }
  return fuites;
}
