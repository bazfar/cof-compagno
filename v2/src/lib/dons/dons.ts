import type { AvecId } from '../firebase/suivre.svelte';
import type { Joueur } from '../schemas/acces';
import type { Don } from '../schemas/don';
import type { Fiche } from '../schemas/fiche';

/*
 * Dons d'objets entre joueurs (lot L3.3) : la partie pure, testée.
 * Les écritures sont dans lib/actions/dons.ts.
 */

/** Un personnage à qui l'on peut donner : le personnage joué d'un autre joueur. */
export interface Destinataire {
  uid: string;
  perso: string;
  nom: string;
  joueur: string;
}

/** Les personnages joués des autres joueurs, triés par nom. */
export function destinataires(joueurs: AvecId<Joueur>[], persos: AvecId<Fiche>[], moi: string): Destinataire[] {
  const parId = new Map(persos.map((p) => [p.id, p]));
  const liste: Destinataire[] = [];
  for (const j of joueurs) {
    if (j.id === moi || !j.persoActif) continue;
    const p = parId.get(j.persoActif);
    if (!p || p.proprietaireUid !== j.id) continue;
    liste.push({ uid: j.id, perso: p.id, nom: p.nom, joueur: j.nom });
  }
  return liste.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/** « Potion de soins ×3 » : ce que l'on montre d'un objet donné. */
export function libelleObjet(objet: Record<string, unknown>): string {
  const nom = typeof objet.nom === 'string' && objet.nom ? objet.nom : 'Objet';
  return typeof objet.quantite === 'number' && objet.quantite > 1 ? `${nom} ×${objet.quantite}` : nom;
}

/** Ce que le panneau du joueur montre : les dons qui attendent un geste de lui. */
export function donsEnAttente(dons: AvecId<Don>[], moi: string): { entrants: AvecId<Don>[]; sortants: AvecId<Don>[]; refuses: AvecId<Don>[] } {
  const parDate = (a: AvecId<Don>, b: AvecId<Don>) => a.creeLe - b.creeLe;
  return {
    entrants: dons.filter((d) => d.aUid === moi && d.statut === 'propose').sort(parDate),
    sortants: dons.filter((d) => d.deUid === moi && d.statut === 'propose').sort(parDate),
    refuses: dons.filter((d) => d.deUid === moi && d.statut === 'refuse').sort(parDate),
  };
}

/** Identifiant d'un nouveau don. */
export function nouvelIdDon(): string {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
