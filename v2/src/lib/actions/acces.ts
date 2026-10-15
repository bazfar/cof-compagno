import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/client';
import { schemaJoueur, schemaMj, schemaNom } from '../schemas/acces';
import { session } from '../session.svelte';

/** Message d'erreur lisible, quelle que soit la forme de l'exception. */
function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

function estRefusDeDroits(erreur: unknown): boolean {
  return typeof erreur === 'object' && erreur !== null && 'code' in erreur && erreur.code === 'permission-denied';
}

/**
 * Au chargement : connexion anonyme (mémorisée par le navigateur), puis on
 * regarde si cet appareil est déjà MJ ou joueur de la table.
 * Remplace le choix de rôle par clic et l'identité par `prompt()` de la v1.
 */
export async function demarrerSession(table: string): Promise<void> {
  session.table = table;
  session.etape = 'chargement';
  try {
    await auth.authStateReady();
    const utilisateur = auth.currentUser ?? (await signInAnonymously(auth)).user;
    session.uid = utilisateur.uid;

    const docMj = await getDoc(doc(db, 'tables', table, 'mjs', utilisateur.uid));
    const mj = docMj.exists() ? schemaMj.safeParse(docMj.data()) : null;
    if (mj?.success) {
      session.nom = mj.data.nom;
      session.etape = 'mj';
      return;
    }

    const docJoueur = await getDoc(doc(db, 'tables', table, 'joueurs', utilisateur.uid));
    const joueur = docJoueur.exists() ? schemaJoueur.safeParse(docJoueur.data()) : null;
    if (joueur?.success) {
      session.nom = joueur.data.nom;
      session.etape = 'joueur';
      return;
    }

    session.etape = 'accueil';
  } catch (erreur) {
    session.erreur = messageDe(erreur);
    session.etape = 'erreur';
  }
}

/** Rejoint la table comme joueur. Lève une erreur lisible si le nom est invalide. */
export async function rejoindreCommeJoueur(nomSaisi: string): Promise<void> {
  const nom = schemaNom.parse(nomSaisi);
  const joueur = schemaJoueur.parse({ nom, rejointLe: Date.now() });
  await setDoc(doc(db, 'tables', session.table, 'joueurs', session.uid), joueur);
  session.nom = nom;
  session.etape = 'joueur';
}

/**
 * Rejoint la table comme MJ. Le code n'est jamais lu par l'app : ce sont
 * les règles Firestore qui le comparent à tables/{table}/secret/codeMj,
 * document illisible par les clients.
 */
export async function rejoindreCommeMj(nomSaisi: string, code: string): Promise<void> {
  const nom = schemaNom.parse(nomSaisi);
  const mj = schemaMj.parse({ nom, rejointLe: Date.now() });
  try {
    await setDoc(doc(db, 'tables', session.table, 'mjs', session.uid), { ...mj, code });
  } catch (erreur) {
    if (estRefusDeDroits(erreur)) throw new Error('Code MJ incorrect.');
    throw erreur;
  }
  session.nom = nom;
  session.etape = 'mj';
}
