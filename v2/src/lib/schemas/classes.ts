import { z } from 'zod';
import { schemaCarac, schemaFormuleDes, schemaId } from './commun.ts';
import { schemaElement, schemaFamilleArme, schemaLimite, schemaMaitrise, schemaRessource } from './effets.ts';

/*
 * Classes et voies de la refonte (lot L4.4b1). Une voie a 5 rangs ; un rang
 * débloque des actions (src/regles/) et porte des règles typées que le
 * profil d'un personnage (lib/effets/profil.ts) et le moteur lisent :
 *   - verbeDeLEcole : le verbe de même rang de l'école choisie à la
 *     création (Voie de l'école du Magicien) ;
 *   - maitriseEcole : l'école choisie passe à ce rang de maîtrise (Adepte à
 *     la création, Maître au rang 4 : validé) ;
 *   - maitriseElement : un élément passe à ce rang (le départ, le second, ou
 *     celui que le joueur choisit) ;
 *   - secondElement : un nouvel élément, à ce rang ;
 *   - annuleDerapage : annule un dérapage, avec sa limite (Résonance) ;
 *   - texte : ce que l'app ne calcule pas encore, assumé et listé.
 * Le reste des règles de la refonte s'ajoutera ici, au fil des classes.
 */

/**
 * Capacités de voie que le code lit (lot L4.4b2) :
 *   - Voie sauvage : mutationSauvage (2d4 − 4 aux dégâts de chaque sort
 *     offensif, et à la place du dérapage), instinctChaotique, canalisation,
 *     maitriseDuChaos, submersion ;
 *   - Hémomancie : pacteDeSang, sangAppelleSang, seuilCritique, sangVerse,
 *     saignee ;
 *   - Virtuose : repertoire, affinite, gesteReflexe, perfection, gesteUnique ;
 *   - Voie de l'esprit (Envoûteur, lot L4.5) : realiteDeLEsprit (une
 *     illusion psionique inflige 1d6 psychiques à sa cible au début de
 *     chacun de ses tours, décision 9a du 21/10/2026 ; appliqué par L6).
 */
export const CAPACITES_DE_VOIE = [
  'mutationSauvage',
  'instinctChaotique',
  'canalisation',
  'maitriseDuChaos',
  'submersion',
  'pacteDeSang',
  'sangAppelleSang',
  'seuilCritique',
  'sangVerse',
  'saignee',
  'repertoire',
  'affinite',
  'gesteReflexe',
  'perfection',
  'gesteUnique',
  'realiteDeLEsprit',
  /*
   * Guerrier (lot L4.7) :
   *   - Voie du soldat : postureDeCombat (le profil passe au moteur le rang
   *     de la voie, plafond de la posture), maitriseTactique ;
   *   - Voie du maître d'armes : maniementExpert (attaque spéciale −1
   *     Endurance), precisionLetale (critique sur 19–20, état d'attaque
   *     spéciale +1 round), coupDouble (une 2ᵉ attaque spéciale si la 1ʳᵉ
   *     touche, au coût normal : décision 10a du 21/10/2026), coupDeMaitre
   *     (1x/combat : deux états, ou l'arme et un élément).
   */
  'postureDeCombat',
  'maitriseTactique',
  'maniementExpert',
  'precisionLetale',
  'coupDouble',
  'coupDeMaitre',
  /*
   * Voies du chaos (lot L4.9) : donCorrompu (R2, commun : une fois par
   * tour, +1d6 chaotiques ou relance du dé de dégâts le plus bas, +1
   * Plongée : décision 4a du 21/10/2026) ; eclatChaotique (Envoûteur R1 :
   * chaque sort d'Illusion qui affecte un ennemi lui inflige aussi 1d6
   * chaotiques, +1 Plongée par sort : 8a).
   */
  'donCorrompu',
  'eclatChaotique',
  /** Voie des souffles du Moine (lot L4.16, décision 9a) : un coup à mains nues qui porte un élément gagne +1d6 de cet élément. */
  'maitriseDuSouffle',
] as const;
export type CapaciteDeVoie = (typeof CAPACITES_DE_VOIE)[number];

export const schemaRegleDeVoie = z.discriminatedUnion('type', [
  /**
   * `quelle` : l'école choisie à la création, ou la seconde (4ᵉ voie de
   * l'Envoûteur, lot L4.5) ; `palierMax` plafonne ses paliers (seconde
   * école : pas de palier III, validé).
   */
  z.strictObject({
    type: z.literal('verbeDeLEcole'),
    quelle: z.enum(['choisie', 'seconde']).default('choisie'),
    /** École fixée par la voie elle-même (les Cercles du Prêtre, lot L4.6) : prime sur `quelle`. */
    ecole: schemaId.optional(),
    palierMax: z.enum(['I', 'II', 'III']).optional(),
  }),
  z.strictObject({ type: z.literal('maitriseEcole'), quelle: z.enum(['choisie', 'seconde']).default('choisie'), niveau: schemaMaitrise }),
  z.strictObject({ type: z.literal('maitriseElement'), quel: z.enum(['depart', 'auChoix']), niveau: schemaMaitrise }),
  z.strictObject({ type: z.literal('secondElement'), niveau: schemaMaitrise }),
  z.strictObject({ type: z.literal('annuleDerapage'), limite: schemaLimite }),
  z.strictObject({ type: z.literal('texte'), texte: z.string().min(1) }),
  /** +valeur à une caractéristique choisie parmi `parmi`, fixée à l'acquisition (Spécimen d'élite, lot L4.7). */
  z.strictObject({ type: z.literal('caracEnPlus'), parmi: z.array(schemaCarac).min(1), valeur: z.number().int().min(1).max(2) }),
  /** Une capacité que le moteur ou le profil lit par son nom (lot L4.4b2). */
  z.strictObject({ type: z.literal('capacite'), nom: z.enum(CAPACITES_DE_VOIE), limite: schemaLimite.default('volonte') }),
]);
export type RegleDeVoie = z.infer<typeof schemaRegleDeVoie>;

export const schemaRangDeVoie = z.strictObject({
  rang: z.number().int().min(1).max(5),
  nom: z.string().min(1),
  description: z.string().min(1),
  actions: z.array(schemaId).default([]),
  regles: z.array(schemaRegleDeVoie).default([]),
});

export const schemaVoieRefonte = z
  .strictObject({
    id: schemaId,
    nom: z.string().min(1),
    description: z.string().min(1),
    /** Voie du chaos (lot L4.9) : proposée sur demande du joueur ou par accord du MJ, jamais par défaut (règle v1). */
    surAccordDuMJ: z.boolean().default(false),
    rangs: z.array(schemaRangDeVoie).length(5),
  })
  .superRefine((v, ctx) => {
    v.rangs.forEach((r, i) => {
      if (r.rang !== i + 1) ctx.addIssue({ code: 'custom', message: `rang ${i + 1} attendu`, path: ['rangs', i, 'rang'] });
      if (r.actions.length === 0 && r.regles.length === 0) ctx.addIssue({ code: 'custom', message: 'un rang débloque une action ou porte une règle', path: ['rangs', i] });
    });
  });
export type VoieRefonte = z.infer<typeof schemaVoieRefonte>;
export type VoieSaisie = z.input<typeof schemaVoieRefonte>;

export const schemaClasseRefonte = z.strictObject({
  id: schemaId,
  nom: z.string().min(1),
  famille: z.enum(['magique', 'physique', 'hybride']),
  deVie: z.number().int().min(4).max(12),
  caracMagie: schemaCarac.optional(),
  /** Réserve de PP = base + parNiveau × niveau + parMod × mod de magie (formule v1 conservée, validé). */
  reservePP: z.strictObject({ base: z.number().int(), parNiveau: z.number().int(), parMod: z.number().int() }).optional(),
  /** Réserve de Sacré du Prêtre (lot L4.6, validé) : base + niveau / diviseur, arrondi à l'inférieur. */
  reserveSacre: z.strictObject({ base: z.number().int(), diviseurNiveau: z.number().int().min(1) }).optional(),
  /**
   * Ressource martiale (doc de cadre, « Ressources de classe (validé) » ;
   * lot L4.7) : réserve = base + niveau / diviseur, arrondi à l'inférieur ;
   * `parDegatsSubis` : gain quand le porteur subit des dégâts, une fois par
   * round (Endurance du Guerrier : +1). Le combat (L6) tient la réserve.
   */
  ressourceDeClasse: z
    .strictObject({
      ressource: schemaRessource,
      base: z.number().int().min(0),
      diviseurNiveau: z.number().int().min(1),
      /**
       * `jamais` : pleine à la création, elle ne remonte que par ses gains (Inspiration du Barde, lot L4.8) ;
       * `chaqueCombat` : elle repart à `debutCombat` à chaque combat (Ki du Moine, lot L4.16).
       */
      recharge: z.enum(['reposCourt', 'reposLong', 'jamais', 'chaqueCombat']),
      debutCombat: z.number().int().min(0).max(5).optional(),
      /** Gain par coup qui touche, et plafond par round (Ki : +1, 2 par round, décision 1a du 22/10/2026). Le combat (L6) l'applique. */
      parTouche: z.strictObject({ montant: z.number().int().min(1).max(3), parRound: z.number().int().min(1).max(5) }).optional(),
      parDegatsSubis: z.number().int().min(0).max(3).default(0),
      /**
       * +1 sur un 20 naturel (Inspiration) : le sien, ou aussi celui de tout
       * allié qui l'entend (décision 5b du 21/10/2026, lot L4.8). Le combat
       * (L6) l'applique ; le MJ ajoute ceux des actions inspirantes.
       */
      parVingtNaturel: z.enum(['lui', 'luiEtAlliesQuiLEntendent']).optional(),
    })
    .refine((r) => (r.recharge === 'chaqueCombat') === (r.debutCombat !== undefined), { message: 'une ressource qui repart à chaque combat dit sa valeur de départ' })
    .optional(),
  /** Dé des mains nues selon le niveau : chaque palier vaut dès son niveau (Moine : d6, d8 au niveau 5, 2d6 au niveau 9 ; lot L4.16). */
  mainsNues: z
    .array(z.strictObject({ niveau: z.number().int().min(1).max(20), des: schemaFormuleDes }))
    .min(1)
    .refine((p) => p[0]!.niveau === 1 && p.every((x, i) => i === 0 || x.niveau > p[i - 1]!.niveau), { message: 'des paliers croissants, dès le niveau 1' })
    .optional(),
  /**
   * Attaques spéciales d'arme (lot L4.7) : les familles permises et leur
   * coût. Guerrier : toutes, 2 Endurance (validé). Hybrides : leur famille
   * de prédilection (décision du 20/10/2026), une fois par combat, sans
   * coût (décision 3c du 21/10/2026).
   */
  attaquesSpeciales: z
    .strictObject({
      familles: z.union([z.literal('toutes'), z.array(schemaFamilleArme).min(1)]),
      cout: z.union([z.strictObject({ ressource: schemaRessource, montant: z.number().int().min(1).max(5) }), z.literal('unParCombat')]),
    })
    .optional(),
  /** Actions de classe, hors voies (Vêtements sacrés du Prêtre). */
  actionsDeClasse: z.array(schemaId).default([]),
  /** Voies de la classe, dans l'ordre d'affichage. */
  voies: z.array(schemaId).min(1),
  /** Groupes de voies exclusives : on n'en prend qu'une par groupe (4ᵉ voie du Magicien). */
  voiesExclusives: z.array(z.array(schemaId).min(2)).default([]),
  creation: z.strictObject({
    /** Écoles proposées à la création ; la Voie de l'école suit celle choisie. */
    ecoles: z.array(schemaId).default([]),
    /** Éléments de départ proposés ; null : pas d'élément. */
    elements: z.array(schemaElement).nullable().default(null),
    /** Éléments que le second élément de la voie élémentaire peut prendre. */
    elementsSecond: z.array(schemaElement).default([]),
    /** Maîtrise de l'élément de départ tant que la voie ne la monte pas. */
    maitriseElementDepart: schemaMaitrise.default('adepte'),
  }),
  /** Sorts mineurs de la classe ; combien à la création, et les niveaux qui en ajoutent un (validé). */
  mineurs: z.strictObject({ liste: z.array(schemaId), creation: z.number().int().min(0), plusUnAuNiveau: z.array(z.number().int().min(2).max(12)) }),
});
export type ClasseRefonte = z.infer<typeof schemaClasseRefonte>;
export type ClasseSaisie = z.input<typeof schemaClasseRefonte>;
