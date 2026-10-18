import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demarrerServeur } from './server.js';
import { creerSession } from './session-service.js';
import { CONFIG } from './config.js';

let racine, serveur, port, jeton;

before(async () => {
  racine = await mkdtemp(join(tmpdir(), 'pitch-me-'));
  CONFIG.SESSIONS_DIR = join(racine, 'sessions');
  await mkdir(join(racine, 'web'));
  await mkdir(join(racine, 'sessions', 'ok'), { recursive: true });
  await writeFile(join(racine, 'web', 'index.html'), '<p>ok</p>');
  await writeFile(join(racine, 'secret.txt'), 'hors web');
  await writeFile(join(racine, 'sessions', 'ok', 'manifest.json'), '{"id":"ok"}');
  const result = demarrerServeur(0, join(racine, 'web'), join(racine, 'sessions'));
  serveur = result.server;
  jeton = result.jeton;
  await new Promise(resolve => serveur.once('listening', resolve));
  port = serveur.address().port;
});

after(async () => {
  serveur.close();
  await rm(racine, { recursive: true, force: true });
});

const get = chemin => fetch(`http://127.0.0.1:${port}${chemin}`);

test('le serveur écoute sur la boucle locale uniquement', () => {
  assert.equal(serveur.address().address, '127.0.0.1');
});

test('sert la page et une session valide', async () => {
  assert.equal((await get('/')).status, 200);
  assert.equal((await get('/api/session/ok')).status, 200);
});

test('refuse un identifiant de session non conforme', async () => {
  assert.equal((await get('/api/session/..%5C..')).status, 400);
  assert.equal((await get('/api/session/a%2Fb')).status, 400);
});

test('ne sert pas de fichier hors du dossier web', async () => {
  const reponse = await get('/..%2Fsecret.txt');
  assert.notEqual(reponse.status, 200);
});

test('GET /api/token retourne le jeton', async () => {
  const reponse = await get('/api/token');
  assert.equal(reponse.status, 200);
  const data = await reponse.json();
  assert.equal(data.token, jeton);
});

test('POST /api/start refuse sans Content-Type application/json', async () => {
  const { id } = await creerSession('Test');
  const reponse = await fetch(`http://127.0.0.1:${port}/api/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'Authorization': `Bearer ${jeton}`
    },
    body: JSON.stringify({ id, consentement: true })
  });
  assert.equal(reponse.status, 400);
  const data = await reponse.json();
  assert.equal(data.error, 'Content-Type doit être application/json');
});

test('POST /api/start refuse sans Authorization', async () => {
  const { id } = await creerSession('Test');
  const reponse = await fetch(`http://127.0.0.1:${port}/api/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id, consentement: true })
  });
  assert.equal(reponse.status, 401);
  const data = await reponse.json();
  assert.equal(data.error, 'Authorization manquante');
});

test('POST /api/start refuse avec un jeton invalide', async () => {
  const { id } = await creerSession('Test');
  const reponse = await fetch(`http://127.0.0.1:${port}/api/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer mauvais-jeton'
    },
    body: JSON.stringify({ id, consentement: true })
  });
  assert.equal(reponse.status, 401);
  const data = await reponse.json();
  assert.equal(data.error, 'Jeton invalide');
});

test('POST /api/start refuse sans consentement dans le corps', async () => {
  const { id } = await creerSession('Test');
  const reponse = await fetch(`http://127.0.0.1:${port}/api/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jeton}`
    },
    body: JSON.stringify({ id, consentement: false })
  });
  assert.equal(reponse.status, 400);
  const data = await reponse.json();
  assert.ok(data.error);
});
