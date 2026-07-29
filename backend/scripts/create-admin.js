#!/usr/bin/env node
/**
 * Création d'un compte ADMIN.
 *
 * POURQUOI CE SCRIPT EXISTE : `POST /auth/register` interdit volontairement le
 * rôle ADMIN (cf. `REGISTRABLE_ROLES` dans src/auth/dto/register.dto.ts — sinon
 * n'importe qui s'auto-promeut administrateur). Il n'existe donc aucun chemin
 * applicatif pour créer un admin : c'est un geste d'exploitation, délibérément
 * manuel et tracé.
 *
 * À UTILISER NOTAMMENT POUR : disposer d'un SECOND compte admin. Le bouton
 * « Réinitialiser le mot de passe » du dashboard ne s'affiche que sur les
 * lignes ADMIN et refuse l'auto-ciblage — avec un seul admin en base, ce filet
 * de secours ne protège personne.
 *
 * USAGE (depuis le VPS, dans le conteneur qui détient les credentials DB) :
 *   sudo docker exec -it zonzon-backend-ovh node scripts/create-admin.js
 *
 * Le mot de passe est saisi de façon interactive et masquée : il ne transite
 * ni par la ligne de commande, ni par l'historique du shell, ni par les
 * variables d'environnement du conteneur.
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const readline = require('readline');

const PHONE_REGEX = /^\+?[0-9]{8,15}$/; // même règle que RegisterDto
const MIN_PASSWORD_LENGTH = 8;
const INDICATIF_TOGO = '228';

/** Passe un numéro togolais local (8 chiffres) au format international. */
function toInternational(input) {
  const digits = input.replace(/[^0-9]/g, '');
  if (digits.startsWith(INDICATIF_TOGO) && digits.length > 8) return `+${digits}`;
  if (digits.length === 8) return `+${INDICATIF_TOGO}${digits}`;
  return input.startsWith('+') ? input : `+${digits}`;
}

/**
 * Même normalisation que `UsersService.findByPhone` : c'est elle qui décide
 * si deux lignes désignent le même numéro réel. Comparer `phone = ?` à
 * l'identique laisse passer un doublon `90828624` / `+22890828624`, et les
 * deux comptes deviennent alors indiscernables à la connexion.
 */
const SQL_NORMALISE =
  "REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), '.', '')";

// Une SEULE interface réutilisée pour toutes les questions : en créer une par
// question et la fermer consomme stdin et fait échouer silencieusement les
// saisies suivantes.
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Hors terminal (entrée redirigée), readline reçoit toutes les lignes d'un coup
 * et les questions posées après coup ne se déclenchent jamais. On bufferise donc
 * l'entrée en amont dans ce cas, ce qui rend aussi le script utilisable de façon
 * non interactive (automatisation, tests).
 */
const interactive = Boolean(process.stdin.isTTY);
const bufferedLines = [];
const bufferReady = interactive
  ? Promise.resolve()
  : new Promise((resolve) => {
      rl.on('line', (line) => bufferedLines.push(line));
      rl.on('close', resolve);
    });

function ask(question) {
  if (!interactive) {
    const answer = bufferedLines.shift() ?? '';
    process.stdout.write(`${question}\n`);
    return Promise.resolve(answer.trim());
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

/**
 * Saisie masquée : seule l'invite est écrite à l'écran, les caractères frappés
 * ne sont jamais réaffichés (le mot de passe ne reste donc pas lisible dans le
 * terminal ni dans un scrollback partagé).
 */
function askHidden(question) {
  if (!interactive) return ask(question);
  return new Promise((resolve) => {
    const original = rl._writeToOutput;
    rl._writeToOutput = (str) => {
      // On ne laisse passer que l'invite elle-même.
      if (str.trim() === question.trim()) rl.output.write(str);
    };
    rl.question(question, (answer) => {
      rl._writeToOutput = original;
      rl.output.write('\n');
      resolve(answer.trim());
    });
  });
}

(async () => {
  console.log('\n=== Création d\'un compte ADMIN ZonZon ===\n');
  await bufferReady;

  const firstName = await ask('Prénom            : ');
  const lastName = await ask('Nom               : ');
  const phone = await ask('Téléphone (+228…) : ');
  const password = await askHidden('Mot de passe      : ');
  const confirm = await askHidden('Confirmer         : ');
  if (interactive) rl.close(); // plus aucune saisie attendue au-delà de ce point

  // --- Validations avant toute connexion à la base ---
  if (firstName.length < 2 || lastName.length < 2) {
    console.error('\n✗ Prénom et nom doivent faire au moins 2 caractères.');
    process.exit(1);
  }
  if (!PHONE_REGEX.test(phone)) {
    console.error(
      '\n✗ Numéro invalide. Format attendu : 8 à 15 chiffres, indicatif optionnel (ex. +22890111111).',
    );
    process.exit(1);
  }

  // Normalisation en format international. INDISPENSABLE : stocker un numéro
  // local (ex. `90828624`) crée un compte que la page de connexion ne retrouve
  // JAMAIS — elle envoie `+228…`, et `UsersService.findByPhone` ne sait
  // remonter que du local vers l'international, pas l'inverse.
  const phoneNormalise = toInternational(phone);
  if (phoneNormalise !== phone) {
    console.log(`\nNuméro enregistré au format international : ${phoneNormalise}`);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `\n✗ Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`,
    );
    process.exit(1);
  }
  if (password !== confirm) {
    console.error('\n✗ Les deux saisies ne correspondent pas.');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'zonzon_db',
    // Identique à la configuration TypeORM de src/app.module.ts.
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });

  try {
    // Détection de doublon sur le NUMÉRO RÉEL, pas sur la chaîne exacte : les
    // comptes soft-deleted sont inclus (contrainte UNIQUE sur `phone`), et un
    // compte existant sous l'autre format doit bloquer la création.
    const digits = phoneNormalise.replace(/[^0-9]/g, '');
    const suffixe = digits.slice(-8); // partie significative d'un numéro togolais
    const [existing] = await conn.execute(
      `SELECT id, role, phone, deletedAt FROM users
        WHERE ${SQL_NORMALISE} = ? OR ${SQL_NORMALISE} LIKE ?`,
      [digits, `%${suffixe}`],
    );
    if (existing.length > 0) {
      console.error('\n✗ Ce numéro correspond déjà à un ou plusieurs comptes :');
      for (const u of existing) {
        console.error(
          `    ${u.phone}  rôle ${u.role}${u.deletedAt ? '  (compte supprimé)' : ''}`,
        );
      }
      console.error(
        "\n  Créer un second compte sur le même numéro réel le rendrait inutilisable :\n" +
          '  la connexion ne peut en retrouver qu\'un seul. Utilisez un autre numéro.',
      );
      process.exit(1);
    }

    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10); // même coût que AuthService

    await conn.execute(
      `INSERT INTO users
         (id, role, firstName, lastName, phone, password,
          isAvailable, isPublic, status, createdAt, updatedAt)
       VALUES (?, 'ADMIN', ?, ?, ?, ?, 0, 1, 'ACTIVE', NOW(), NOW())`,
      [id, firstName, lastName, phoneNormalise, hash],
    );

    const [admins] = await conn.execute(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND deletedAt IS NULL",
    );

    console.log(
      `\n✓ Compte ADMIN créé : ${firstName} ${lastName} (${phoneNormalise})`,
    );
    console.log(`  id : ${id}`);
    console.log(`  Nombre total d'admins actifs : ${admins[0].n}`);
    console.log('\nConnexion : https://zonzon-admin.pages.dev\n');
  } finally {
    await conn.end();
  }
})().catch((e) => {
  // mysql2 lève une AggregateError au `message` VIDE pour les échecs de
  // connexion (ECONNREFUSED, ENOTFOUND…) : afficher `e.message` seul
  // produirait un « ✗ ERREUR : » muet, impossible à diagnostiquer.
  const detail =
    [e.code, e.message].filter((p) => p && String(p).trim()).join(' — ') ||
    String(e);
  console.error('\n✗ ERREUR :', detail);

  if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') {
    console.error(
      "  La base est injoignable. Ce script doit être lancé DEPUIS le conteneur\n" +
        '  backend, qui seul porte les credentials TiDB :\n' +
        '    sudo docker exec -it zonzon-backend-ovh node scripts/create-admin.js',
    );
  }
  process.exit(1);
});
