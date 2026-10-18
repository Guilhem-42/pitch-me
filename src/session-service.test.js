import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  creerSession,
  demarrer,
  pret,
  repere,
  arreter,
  etat,
  ErreurSession,
  ERREUR
} from './session-service.js';
import { CONFIG } from './config.js';

test('creerSession crée une nouvelle session', async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'test-session-'));
  const originalSessionsDir = CONFIG.SESSIONS_DIR;
  CONFIG.SESSIONS_DIR = tmpDir;

  try {
    const result = await creerSession('Test pitch');

    assert.ok(result.id);
    assert.ok(result.sessionDir);
    assert.equal(result.manifest.titre, 'Test pitch');
    assert.equal(result.manifest.statut, 'preparation');
  } finally {
    CONFIG.SESSIONS_DIR = originalSessionsDir;
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('demarrer refuse sans consentement', async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'test-session-'));
  const originalSessionsDir = CONFIG.SESSIONS_DIR;
  CONFIG.SESSIONS_DIR = tmpDir;

  try {
    const { id } = await creerSession('Test');

    await assert.rejects(
      async () => await demarrer(id, false),
      (err) => {
        assert(err instanceof ErreurSession);
        assert.equal(err.code, ERREUR.CONSENTEMENT_REQUIS);
        return true;
      }
    );
  } finally {
    CONFIG.SESSIONS_DIR = originalSessionsDir;
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('pret refuse si pas en live ou prêt déjà posé', async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'test-session-'));
  const originalSessionsDir = CONFIG.SESSIONS_DIR;
  CONFIG.SESSIONS_DIR = tmpDir;

  try {
    const { id } = await creerSession('Test');

    // En préparation : refuse
    await assert.rejects(
      async () => await pret(id),
      (err) => {
        assert(err instanceof ErreurSession);
        assert.equal(err.code, ERREUR.ETAT_INVALIDE);
        return true;
      }
    );
  } finally {
    CONFIG.SESSIONS_DIR = originalSessionsDir;
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('repere ajoute un repère', async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'test-session-'));
  const originalSessionsDir = CONFIG.SESSIONS_DIR;
  CONFIG.SESSIONS_DIR = tmpDir;

  try {
    const { id } = await creerSession('Test');

    const result = await repere(id, 'note', 'Un test');

    assert.equal(result.reperes.length, 1);
    assert.equal(result.reperes[0].type, 'note');
    assert.equal(result.reperes[0].texte, 'Un test');
  } finally {
    CONFIG.SESSIONS_DIR = originalSessionsDir;
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('repere refuse un type invalide', async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'test-session-'));
  const originalSessionsDir = CONFIG.SESSIONS_DIR;
  CONFIG.SESSIONS_DIR = tmpDir;

  try {
    const { id } = await creerSession('Test');

    await assert.rejects(
      async () => await repere(id, 'invalide', 'Test'),
      (err) => {
        assert(err instanceof ErreurSession);
        assert.equal(err.code, ERREUR.ETAT_INVALIDE);
        return true;
      }
    );
  } finally {
    CONFIG.SESSIONS_DIR = originalSessionsDir;
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('etat retourne les informations de session', async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'test-session-'));
  const originalSessionsDir = CONFIG.SESSIONS_DIR;
  CONFIG.SESSIONS_DIR = tmpDir;

  try {
    const { id } = await creerSession('Test');

    const result = await etat(id);

    assert.equal(result.id, id);
    assert.equal(result.titre, 'Test');
    assert.equal(result.statut, 'preparation');
    assert.equal(result.debut, null);
    assert.equal(result.pret, null);
    assert.equal(result.fin, null);
    assert.equal(result.pid, null);
    assert.equal(result.pidVivant, false);
  } finally {
    CONFIG.SESSIONS_DIR = originalSessionsDir;
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('arreter met à jour le statut', async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'test-session-'));
  const originalSessionsDir = CONFIG.SESSIONS_DIR;
  CONFIG.SESSIONS_DIR = tmpDir;

  try {
    const { id, sessionDir } = await creerSession('Test');

    // Simuler une session live
    const manifestPath = join(sessionDir, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    manifest.statut = 'live';
    manifest.debut = new Date().toISOString();
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const result = await arreter(id);

    assert.equal(result.statut, 'termine');
    assert.ok(result.fin);
  } finally {
    CONFIG.SESSIONS_DIR = originalSessionsDir;
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('arreter refuse si déjà terminée', async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'test-session-'));
  const originalSessionsDir = CONFIG.SESSIONS_DIR;
  CONFIG.SESSIONS_DIR = tmpDir;

  try {
    const { id, sessionDir } = await creerSession('Test');

    // Simuler une session terminée
    const manifestPath = join(sessionDir, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    manifest.statut = 'termine';
    manifest.fin = new Date().toISOString();
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    await assert.rejects(
      async () => await arreter(id),
      (err) => {
        assert(err instanceof ErreurSession);
        assert.equal(err.code, ERREUR.ETAT_INVALIDE);
        return true;
      }
    );
  } finally {
    CONFIG.SESSIONS_DIR = originalSessionsDir;
    await rm(tmpDir, { recursive: true, force: true });
  }
});
