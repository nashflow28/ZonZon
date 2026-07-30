#!/usr/bin/env node
/**
 * Injecte une clé de compte de service Firebase dans le `.env` de production,
 * SANS que son contenu transite par un terminal partagé, un presse-papiers ou
 * une conversation : le JSON est lu sur l'entrée standard et n'est jamais
 * affiché.
 *
 * POURQUOI : `FIREBASE_CREDENTIALS_JSON` doit tenir sur UNE seule ligne dans le
 * `.env`. Coller le JSON à la main dans un éditeur casse le fichier (retours à
 * la ligne) — c'est précisément ce qui avait corrompu le bloc WhatsApp.
 *
 * USAGE (depuis le poste local, le fichier ne quitte jamais votre machine
 * autrement que par le tunnel SSH) :
 *   Get-Content "C:\chemin\vers\cle.json" -Raw | `
 *     ssh ovh-ubuntu 'sudo node /opt/zonzon/backend/scripts/set-firebase-credentials.js'
 *
 * Puis redémarrer :
 *   ssh ovh-ubuntu 'cd /opt/zonzon/backend && sudo docker compose up -d'
 */

const fs = require('fs');

const ENV_PATH = '/opt/zonzon/backend/.env';
const CLE = 'FIREBASE_CREDENTIALS_JSON';

let entree = '';
process.stdin.on('data', (c) => (entree += c));
process.stdin.on('end', () => {
  let compte;
  try {
    compte = JSON.parse(entree);
  } catch (e) {
    console.error('✗ Entrée illisible : ce n’est pas du JSON valide.');
    process.exit(1);
  }

  // Garde-fous : on refuse tout ce qui n'est pas une clé de compte de service
  // complète, plutôt que d'écrire une valeur qui casserait le démarrage.
  const requis = ['type', 'project_id', 'private_key', 'client_email'];
  const manquants = requis.filter((k) => !compte[k]);
  if (manquants.length) {
    console.error(`✗ Champs manquants dans le JSON : ${manquants.join(', ')}`);
    process.exit(1);
  }
  if (compte.type !== 'service_account') {
    console.error(`✗ type attendu "service_account", reçu "${compte.type}".`);
    process.exit(1);
  }
  if (!compte.private_key.includes('BEGIN PRIVATE KEY')) {
    console.error('✗ `private_key` ne contient pas de clé privée PEM.');
    process.exit(1);
  }

  const brut = fs.readFileSync(ENV_PATH, 'utf8');
  const sauvegarde = `${ENV_PATH}.bak-avant-firebase`;
  fs.writeFileSync(sauvegarde, brut, { mode: 0o600 });

  const eol = brut.includes('\r\n') ? '\r\n' : '\n';
  const lignes = brut.split(/\r?\n/);

  // JSON.stringify recompacte sur une seule ligne et ré-échappe les `\n` de la
  // clé privée — indispensable pour un fichier .env.
  const valeur = JSON.stringify(compte);

  let trouvee = false;
  const sorties = lignes.map((l) => {
    if (new RegExp(`^\\s*${CLE}\\s*=`).test(l)) {
      trouvee = true;
      return `${CLE}=${valeur}`;
    }
    return l;
  });
  if (!trouvee) sorties.push(`${CLE}=${valeur}`);

  fs.writeFileSync(ENV_PATH, sorties.join(eol), { mode: 0o600 });

  // On n'affiche que des métadonnées : jamais la clé, jamais le JSON.
  console.log('✓ Clé Firebase enregistrée dans le .env.');
  console.log(`  projet          : ${compte.project_id}`);
  console.log(`  compte de service : ${compte.client_email}`);
  console.log(`  private_key_id  : ${compte.private_key_id}`);
  console.log(`  ligne ${trouvee ? 'remplacée' : 'ajoutée'} · sauvegarde : ${sauvegarde}`);
  console.log('\nRedémarrez maintenant :');
  console.log('  ssh ovh-ubuntu "cd /opt/zonzon/backend && sudo docker compose up -d"');
});
