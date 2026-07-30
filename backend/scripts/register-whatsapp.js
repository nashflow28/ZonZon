#!/usr/bin/env node
/**
 * Enregistre le numéro WhatsApp sur la Cloud API (appel `/register`).
 *
 * POURQUOI : un numéro ajouté et vérifié dans la console Meta n'est pas encore
 * utilisable pour l'envoi — l'API répond `(#133010) Account not registered`
 * tant que ce call n'a pas été fait. Il fixe aussi le PIN de vérification en
 * deux étapes du numéro (à CONSERVER : il sera exigé pour tout
 * ré-enregistrement futur du numéro).
 *
 * USAGE (le PIN est saisi de façon masquée, jamais en argument ni en clair) :
 *   ssh -t ovh-ubuntu 'read -rs -p "PIN 6 chiffres : " P && echo && \
 *     printf "%s" "$P" | sudo docker exec -i zonzon-backend-ovh node scripts/register-whatsapp.js'
 *
 * Le token et le phone_number_id sont lus dans l'environnement du conteneur.
 * Rien de secret n'est affiché.
 */

const https = require('https');

const token = process.env.WHATSAPP_ACCESS_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const version = process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0';

if (!token || !phoneNumberId) {
  console.error(
    '✗ WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID absent de l’environnement.',
  );
  process.exit(1);
}

let stdin = '';
process.stdin.on('data', (c) => (stdin += c));
process.stdin.on('end', () => {
  const pin = stdin.trim();
  if (!/^[0-9]{6}$/.test(pin)) {
    console.error('✗ Le PIN doit faire exactement 6 chiffres.');
    process.exit(1);
  }

  const payload = JSON.stringify({ messaging_product: 'whatsapp', pin });
  const req = https.request(
    {
      hostname: 'graph.facebook.com',
      path: `/${version}/${phoneNumberId}/register`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✓ Numéro enregistré sur la Cloud API.');
          console.log(
            '  Conservez le PIN : il sera demandé pour tout ré-enregistrement.',
          );
        } else {
          console.error(`✗ Échec (HTTP ${res.statusCode}) :`);
          try {
            console.error(JSON.stringify(JSON.parse(body).error, null, 2));
          } catch {
            console.error(body.slice(0, 1000));
          }
          process.exit(1);
        }
      });
    },
  );
  req.on('error', (e) => {
    console.error('✗ Erreur réseau :', e.message);
    process.exit(1);
  });
  req.write(payload);
  req.end();
});
