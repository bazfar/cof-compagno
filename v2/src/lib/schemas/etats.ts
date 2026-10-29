import { z } from 'zod';
import { schemaFormuleDes, schemaId } from './commun.ts';
import { schemaCibleBonus, schemaTypeDegats } from './effets.ts';

/*
 * Les états de la refonte (lot L4.2), écrits à la main dans
 * src/regles/etats.ts. Un état dit ce qu'il change, en champs typés, pour
 * que le combat (L6) l'applique sans lire de texte :
 *   - modificateurs : bonus ou malus permanents tant que l'état dure ;
 *   - degatsParTour : dégâts subis au début de chaque tour du porteur ;
 *   - degatsInfliges : réduction en pourcentage des dégâts qu'il inflige ;
 *   - deplacement, agit, ciblable : ce qu'il peut encore faire ;
 *   - desavantage / avantage : jets lancés avec 2d20, en gardant le pire ou
 *     le meilleur (décision 6a du 20/10/2026) ;
 *   - rompuPar : ce qui met fin à l'état avant sa durée.
 * Ce que l'app ne calcule pas reste dans `regle`, le texte montré aux
 * joueurs. `parSource` : l'effet dépend de la capacité qui pose l'état
 * (Marque, Charme…), qui le précise.
 *
 * Ce fichier n'importe que `zod` et d'autres schémas (avec l'extension).
 */

/** Jets concernés par un avantage ou un désavantage. */
export const schemaJetsAffectes = z.enum([
  'attaques',
  /** Le prochain jet d'attaque seulement, puis l'état tombe (Déséquilibré). */
  'prochaineAttaque',
  /** Les attaques des autres contre le porteur (Dissimulé). */
  'attaquesContre',
]);

export const schemaEtatRefonte = z
  .strictObject({
    id: schemaId,
    nom: z.string().min(1),
    categorie: z.enum(['controle', 'malus', 'degats', 'physique', 'perception']),
    /** Ce que lisent les joueurs. */
    regle: z.string().min(1),
    modificateurs: z.array(z.strictObject({ cible: schemaCibleBonus, valeur: z.number().int().min(-10).max(10) })).default([]),
    degatsParTour: z.strictObject({ des: schemaFormuleDes, typeDegats: schemaTypeDegats }).optional(),
    /** Dégâts infligés réduits de `pourcent` %, d'au moins `minimum` (Affaibli). */
    degatsInfliges: z.strictObject({ pourcent: z.number().int().min(1).max(100), minimum: z.number().int().min(0).max(5) }).optional(),
    /** `moitie` : arrondi au supérieur (décision 8a du 21/10/2026). */
    deplacement: z.enum(['normal', 'moitie', 'nul']).default('normal'),
    /** `deplacementSeul` : perd son action, garde son déplacement (Étourdi). */
    agit: z.enum(['oui', 'deplacementSeul', 'non']).default('oui'),
    ciblable: z.boolean().default(true),
    /** Ne peut viser qu'au contact (Aveuglé). */
    contactSeulement: z.boolean().default(false),
    desavantage: z.array(schemaJetsAffectes).default([]),
    avantage: z.array(schemaJetsAffectes).default([]),
    /** `soinMagique` : un soin de sort ou de capacité y met fin (Putréfié, lot L6.6b). */
    rompuPar: z.array(z.enum(['degatsSubis', 'sesAttaques', 'estAttaque', 'actionMouvement', 'soinMagique'])).default([]),
    parSource: z.boolean().default(false),
    /** Chaque charge fait rater une attaque contre le porteur (Double, lot L4.5). */
    annuleAttaquesContre: z.boolean().default(false),
    /** Chaque nouvelle pose s'ajoute aux précédentes, ses modificateurs aussi (Ivresse : −1 par point, lot L4.8). */
    cumulable: z.boolean().default(false),
    /** Le porteur ne lance aucun sort (Silence, lot L4.8) : le moteur refuse ses verbes et sorts mineurs. */
    interditSorts: z.boolean().default(false),
    /** Forme animale du Druide (lot L4.15) : une seule à la fois ; le Masque du prédateur la lit (condition `enFormeAnimale`). */
    formeAnimale: z.boolean().default(false),
  })
  .superRefine((e, ctx) => {
    const ko = (message: string, path: string[]) => ctx.addIssue({ code: 'custom', message, path });
    if (e.categorie === 'degats' && !e.degatsParTour && !e.parSource) ko('un état de dégâts dit ce qu’il inflige, ou dépend de sa source', ['degatsParTour']);
    if (e.agit === 'non' && e.deplacement !== 'nul') ko('qui n’agit pas ne se déplace pas', ['deplacement']);
    if (e.desavantage.some((j) => e.avantage.includes(j))) ko('avantage et désavantage sur le même jet', ['avantage']);
  });
export type EtatRefonte = z.infer<typeof schemaEtatRefonte>;
export type EtatSaisi = z.input<typeof schemaEtatRefonte>;
