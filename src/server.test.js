import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demarrerServeur } from './server.js';

let racine, serveur, port;

before(async () => {
  racine = await mkdtemp(join(tmpdir(), 'pitch-me-'));
  await mkdir(join(racine, 'web'));
  await mkdir(join(racine, 'sessions', 'ok'), { recursive: true });
  await writeFile(join(racine, 'web', 'index.html'), '<p>ok</p>');
  await writeFile(join(racine, 'secret.txt'), 'hors web');
  await writeFile(join(racine, 'sessions', 'ok', 'manifest.json'), '{"id":"ok"}');
  serveur = demarrerServeur(0, join(racine, 'web'), join(racine, 'sessions'));
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
