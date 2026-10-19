import { EmailAuthProvider, linkWithCredential, signInAnonymously, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { emailJoueur, messageConnexion, verifierCode } from '../acces/pseudo';
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

/** Le nom saisi, validé ; sinon une erreur avec la phrase du schéma (pas le détail Zod). */
function nomValide(nomSaisi: string): string {
  const r = schemaNom.safeParse(nomSaisi);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? 'Nom invalide.');
  return r.data;
}

/** Relance une erreur de connexion avec une phrase lisible. */
function erreurConnexion(erreur: unknown, nom: string): Error {
  return new Error(messageConnexion(erreur, nom) ?? messageDe(erreur));
}

/**
 * Au chargement : connexion anonyme (mémorisée par le navigateur), puis on
 * regarde si cet appareil est déjà MJ ou joueur de la table.
 * Remplace le choix de rôle par clic et l'identité par `prompt()` de la v1.
 *
 * Correctif du 19/10 : un joueur qui a un code perso est connecté par son
 * compte pseudo + code (`session.protege`), le même sur tous ses appareils.
 */
export async function demarrerSession(table: string): Promise<void> {
  session.table = table;
  session.etape = 'chargement';
  try {
    await auth.authStateReady();
    const utilisateur = auth.currentUser ?? (await signInAnonymously(auth)).user;
    session.uid = utilisateur.uid;
    session.protege = !utilisateur.isAnonymous;

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

/**
 * Première venue d'un joueur : le pseudo et le code perso deviennent son
 * compte (le compte anonyme de ce navigateur reçoit l'adresse et le code :
 * son uid ne change pas). Un pseudo déjà pris est refusé.
 */
export async function rejoindreCommeJoueur(nomSaisi: string, code: string): Promise<void> {
  const nom = nomValide(nomSaisi);
  const email = emailJoueur(session.table, nom);
  verifierCode(code);
  const utilisateur = auth.currentUser;
  if (!utilisateur) throw new Error('Connexion perdue : recharge la page.');
  if (utilisateur.isAnonymous) {
    try {
      await linkWithCredential(utilisateur, EmailAuthProvider.credential(email, code));
    } catch (erreur) {
      throw erreurConnexion(erreur, nom);
    }
  }
  const joueur = schemaJoueur.parse({ nom, protege: true, rejointLe: Date.now() });
  await setDoc(doc(db, 'tables', session.table, 'joueurs', utilisateur.uid), joueur);
  session.nom = nom;
  session.protege = true;
  session.etape = 'joueur';
}

/**
 * « Je suis déjà venu » : le pseudo et le code perso redonnent le compte
 * du joueur, donc son uid, son inscription et ses personnages, sur ce
 * navigateur comme sur un autre.
 */
export async function retrouverJoueur(nomSaisi: string, code: string): Promise<void> {
  const nom = nomValide(nomSaisi);
  const email = emailJoueur(session.table, nom);
  let uid: string;
  try {
    uid = (await signInWithEmailAndPassword(auth, email, code)).user.uid;
  } catch (erreur) {
    throw erreurConnexion(erreur, nom);
  }
  session.uid = uid;
  session.protege = true;
  const lu = await getDoc(doc(db, 'tables', session.table, 'joueurs', uid));
  const joueur = lu.exists() ? schemaJoueur.safeParse(lu.data()) : null;
  if (joueur?.success) {
    session.nom = joueur.data.nom;
  } else {
    // Le compte existe mais l'inscription s'était interrompue : on la refait.
    await setDoc(doc(db, 'tables', session.table, 'joueurs', uid), schemaJoueur.parse({ nom, protege: true, rejointLe: Date.now() }));
    session.nom = nom;
  }
  session.etape = 'joueur';
}

/**
 * Un joueur inscrit avant le correctif (compte anonyme) choisit son code
 * perso : son compte garde son uid, il garde donc ses personnages.
 */
export async function protegerJoueur(code: string): Promise<void> {
  const utilisateur = auth.currentUser;
  if (!utilisateur) throw new Error('Connexion perdue : recharge la page.');
  const email = emailJoueur(session.table, session.nom);
  verifierCode(code);
  try {
    await linkWithCredential(utilisateur, EmailAuthProvider.credential(email, code));
  } catch (erreur) {
    throw erreurConnexion(erreur, session.nom);
  }
  await updateDoc(doc(db, 'tables', session.table, 'joueurs', utilisateur.uid), { protege: true });
  session.protege = true;
}

/** Quitter ce joueur sur ce navigateur et revenir à l'accueil (pour se reconnecter avec son pseudo). */
export async function changerDeJoueur(): Promise<void> {
  await signOut(auth);
  session.nom = '';
  session.protege = false;
  await demarrerSession(session.table);
}

/** Le MJ retire un joueur de la table (un doublon, par exemple). Ses personnages restent. */
export async function retirerJoueur(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'tables', session.table, 'joueurs', uid));
}

/**
 * Rejoint la table comme MJ. Le code n'est jamais lu par l'app : ce sont
 * les règles Firestore qui le comparent à tables/{table}/secret/codeMj,
 * document illisible par les clients.
 */
export async function rejoindreCommeMj(nomSaisi: string, code: string): Promise<void> {
  const nom = nomValide(nomSaisi);
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
