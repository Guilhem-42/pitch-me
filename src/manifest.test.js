import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { genererIdSession } from './manifest.js';

describe('genererIdSession', () => {
  it('génère s01 pour le premier jour', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'pitch-me-test-'));
    try {
      const id = await genererIdSession(tmpDir);
      const date = new Date().toISOString().split('T')[0];
      assert.equal(id, `${date}-s01`);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('trouve le numéro maximum et retourne max + 1', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'pitch-me-test-'));
    try {
      const date = new Date().toISOString().split('T')[0];

      // Créer quelques sessions du jour
      await mkdir(join(tmpDir, `${date}-s01`));
      await mkdir(join(tmpDir, `${date}-s03`));

      // Le prochain numéro doit être s04 (max + 1), pas s03
      const id = await genererIdSession(tmpDir);
      assert.equal(id, `${date}-s04`);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('ignore les dossiers non conformes', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'pitch-me-test-'));
    try {
      const date = new Date().toISOString().split('T')[0];

      // Créer des sessions conformes et non conformes
      await mkdir(join(tmpDir, `${date}-s01`));
      await mkdir(join(tmpDir, `${date}-s02`));
      await mkdir(join(tmpDir, 'autre-dossier'));
      await mkdir(join(tmpDir, `${date}-invalide`));

      // Le prochain numéro doit être s03
      const id = await genererIdSession(tmpDir);
      assert.equal(id, `${date}-s03`);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('gère les dossiers manquants (s01 absent, s02 et s05 présents)', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'pitch-me-test-'));
    try {
      const date = new Date().toISOString().split('T')[0];

      // Créer s02 et s05 mais pas s01
      await mkdir(join(tmpDir, `${date}-s02`));
      await mkdir(join(tmpDir, `${date}-s05`));

      // Le prochain numéro doit être s06 (max + 1)
      const id = await genererIdSession(tmpDir);
      assert.equal(id, `${date}-s06`);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('génère s01 si le dossier sessions n\'existe pas', async () => {
    const tmpDir = join(tmpdir(), 'pitch-me-test-inexistant');
    const id = await genererIdSession(tmpDir);
    const date = new Date().toISOString().split('T')[0];
    assert.equal(id, `${date}-s01`);
  });
});
