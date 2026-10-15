import { describe, expect, it } from 'vitest';
import classesJson from '../../src/donnees/classes.json';
import constantesJson from '../../src/donnees/constantes.json';
import donsJson from '../../src/donnees/dons.json';
import etatsJson from '../../src/donnees/etats.json';
import identifiantsJson from '../../src/donnees/identifiants.json';
import mutationsJson from '../../src/donnees/mutations.json';
import racesJson from '../../src/donnees/races.json';
import sortsJson from '../../src/donnees/sorts.json';
import {
  capaciteParId,
  classes,
  constantes,
  etatParId,
  races,
  sortParId,
  sorts,
  voieParId,
} from '../../src/lib/regles/donnees';
import {
  schemaClasse,
  schemaConstantes,
  schemaDon,
  schemaEtat,
  schemaIdentifiants,
  schemaMutations,
  schemaRace,
  schemaSort,
} from '../../src/lib/schemas/regles';

/*
 * Les JSON de src/donnees sont générés par outils/importer-v1.ts, qui les
 * valide déjà. Ces tests revérifient tout au moment de `npm run verifier`,
 * y compris si quelqu'un a modifié un JSON à la main, et contrôlent la
 * cohérence ENTRE fichiers (ce que la v1 ne vérifiait pas).
 */
describe('schémas', () => {
  it.each([
    ['classes', classesJson, schemaClasse.array()],
    ['races', racesJson, schemaRace.array()],
    ['sorts', sortsJson, schemaSort.array()],
    ['etats', etatsJson, schemaEtat.array()],
    ['dons', donsJson, schemaDon.array()],
    ['mutations', mutationsJson, schemaMutations],
    ['constantes', constantesJson, schemaConstantes],
    ['identifiants', identifiantsJson, schemaIdentifiants],
  ] as const)('%s.json respecte son schéma', (_nom, donnees, schema) => {
    const resultat = schema.safeParse(donnees);
    expect(resultat.success ? [] : resultat.error.issues.slice(0, 5)).toEqual([]);
  });
});

describe('volumes (garde-fou contre un import tronqué)', () => {
  it('10 classes de 5 voies, 6 races, 90 sorts', () => {
    expect(classes).toHaveLength(10);
    expect(classes.every((k) => k.voies.length === 5)).toBe(true);
    expect(races).toHaveLength(6);
    expect(sorts).toHaveLength(90);
  });
});

describe('identifiants', () => {
  it('chaque voie de classe a son entrée figée dans identifiants.json, et réciproquement', () => {
    const figes = new Set(Object.values(identifiantsJson.voies));
    const voies = new Set(voieParId.keys());
    expect([...voies].filter((id) => !figes.has(id))).toEqual([]);
    expect([...figes].filter((id) => !voies.has(id))).toEqual([]);
  });

  it('les identifiants de capacité suivent « voie.rang »', () => {
    for (const k of classes)
      for (const v of k.voies) v.rangs.forEach((c, i) => expect(c.id).toBe(`${v.id}.${i + 1}`));
  });

  it('la Voie du chaos de chaque classe a son propre identifiant', () => {
    const chaos = classes.map((k) => k.voies.find((v) => v.nom === 'Voie du chaos')?.id);
    expect(chaos).toEqual(classes.map((k) => `${k.id}.chaos`));
  });
});

/**
 * Anomalies de la v1 trouvées par ce test (15/10/2026), à corriger DANS LA V1
 * (la v1 reste la source des règles) puis à retirer d'ici. En v1, getEtat()
 * lève une erreur sur un état inconnu : ces sorts plantent quand on les lance.
 * Le test échoue si une anomalie apparaît ET si l'une d'elles disparaît,
 * pour que cette liste reste exacte.
 */
const ANOMALIES_V1_CONNUES = [
  'sommeil_enchanteur → endormi', // faute de frappe : l'état s'appelle « endormie »
  'metamorphose_bestiale → metamorphosee', // état à créer dans js/etats.js (décision MJ)
];

describe('références entre fichiers', () => {
  it('tout état appliqué par une mécanique existe (règle « marquee_<source> » de la v1 comprise)', () => {
    const mecaniques = [
      ...classes.flatMap((k) => k.voies.flatMap((v) => v.rangs.map((c) => [c.id, c.mecanique] as const))),
      ...races.flatMap((r) => r.voie.rangs.map((c) => [c.id, c.mecanique] as const)),
      ...races.flatMap((r) => r.variantes.map((v) => [v.id, v.mecanique] as const)),
      ...sorts.map((s) => [s.id, s.mecanique] as const),
    ];
    const inconnus: string[] = [];
    for (const [ou, m] of mecaniques)
      for (const e of m?.effets ?? []) {
        if (e.type !== 'etat') continue;
        const ok = e.id !== undefined && (etatParId.has(e.id) || (/^marquee_.+/.test(e.id) && etatParId.has('marquee')));
        if (!ok) inconnus.push(`${ou} → ${e.id}`);
      }
    expect(inconnus).toEqual(ANOMALIES_V1_CONNUES);
  });

  it('les capacités et sorts cités par les constantes existent', () => {
    const manquants = [
      ...Object.values(constantes.ecoleDeblocage).flat().filter((id) => !capaciteParId.has(id)),
      ...constantes.sortsAccordes.flatMap((a) => [a.capacite, a.sort]).filter((id) => !capaciteParId.has(id) && !sortParId.has(id)),
      ...constantes.invocations.map((i) => i.capacite).filter((id) => !capaciteParId.has(id)),
      ...Object.values(constantes.cercleSortGratuit).filter((id) => !sortParId.has(id)),
    ];
    expect(manquants).toEqual([]);
  });

  it("chaque classe a son archétype, sa famille, ses bonus et ses maîtrises", () => {
    for (const k of classes) {
      expect(constantes.archetypeClasse[k.id], k.id).toBeDefined();
      expect(constantes.familleClasse[k.id], k.id).toBeDefined();
      expect(constantes.bonusCaracsClasse[k.id], k.id).toBeDefined();
      expect(constantes.maitriseArmure[k.id], k.id).toBeDefined();
      expect(constantes.maitriseArme[k.id], k.id).toBeDefined();
    }
    expect(constantes.ordreClasses).toEqual(classes.map((k) => k.id));
  });
});
