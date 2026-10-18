import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  creerSession,
  dupliquerSession,
  demarrer,
  pret,
  repere,
  arreter,
  etat,
  ErreurSession,
  ERREUR,
  dossierSession,
  majGuide
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

test('dossierSession refuse un identifiant qui sort du dossier des sessions', () => {
  for (const id of ['../x', '..', 'a/b', 'a\\b', '', '.', undefined, 42]) {
    assert.throws(() => dossierSession(id), err => err instanceof ErreurSession && err.code === ERREUR.INTROUVABLE);
  }
  assert.doesNotThrow(() => dossierSession('2026-10-18-s01'));
});

test('majGuide refuse un identifiant piégé sans rien lire', async () => {
  await assert.rejects(
    () => majGuide('../../etc', { points: [], rappels_fin: [], alerte_fin_s: 10 }),
    err => err instanceof ErreurSession && err.code === ERREUR.INTROUVABLE
  );
});

test('dupliquerSession copie les champs appropriés', async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'test-session-'));
  const originalSessionsDir = CONFIG.SESSIONS_DIR;
  CONFIG.SESSIONS_DIR = tmpDir;

  try {
    // Créer une session source avec tous les champs
    const { id: idSource, sessionDir } = await creerSession('Session originale');
    const manifestPath = join(sessionDir, 'manifest.json');
    const manifestSource = JSON.parse(await readFile(manifestPath, 'utf-8'));

    manifestSource.objectif = 'Objectif test';
    manifestSource.criteres = ['Critère 1', 'Critère 2'];
    manifestSource.duree_cible_s = 600;
    manifestSource.fenetres_prevues = [{ app: 'Firefox', motif: 'supports et pages web' }];
    manifestSource.audio = false;
    manifestSource.session_precedente = 'session-precedente';
    manifestSource.guide = { points: [], rappels_fin: [], alerte_fin_s: 10 };
    manifestSource.checklist = [
      { id: 'prep-1', texte: 'Rappel 1', fait: true },
      { id: 'prep-2', texte: 'Rappel 2', fait: false }
    ];
    manifestSource.reperes = [{ t: new Date().toISOString(), type: 'note', texte: 'Test' }];
    manifestSource.statut = 'termine';

    await writeFile(manifestPath, JSON.stringify(manifestSource, null, 2));

    // Dupliquer la session
    const result = await dupliquerSession(idSource);

    assert.ok(result.id);
    assert.notEqual(result.id, idSource);
    assert.equal(result.manifest.titre, 'Session originale (copie)');
    assert.equal(result.manifest.statut, 'preparation');

    // Champs copiés
    assert.equal(result.manifest.objectif, 'Objectif test');
    assert.deepEqual(result.manifest.criteres, ['Critère 1', 'Critère 2']);
    assert.equal(result.manifest.duree_cible_s, 600);
    assert.deepEqual(result.manifest.fenetres_prevues, [{ app: 'Firefox', motif: 'supports et pages web' }]);
    assert.equal(result.manifest.audio, false);
    assert.equal(result.manifest.session_precedente, 'session-precedente');
    assert.deepEqual(result.manifest.guide, { points: [], rappels_fin: [], alerte_fin_s: 10 });

    // Checklist copiée avec rappels décochés
    assert.equal(result.manifest.checklist.length, 2);
    assert.equal(result.manifest.checklist[0].id, 'prep-1');
    assert.equal(result.manifest.checklist[0].fait, false);
    assert.equal(result.manifest.checklist[1].fait, false);

    // Champs non copiés
    assert.equal(result.manifest.reperes.length, 0);
    assert.equal(result.manifest.debut, null);
    assert.equal(result.manifest.pret, null);
    assert.equal(result.manifest.fin, null);
  } finally {
    CONFIG.SESSIONS_DIR = originalSessionsDir;
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('dupliquerSession fonctionne depuis n\'importe quel statut', async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'test-session-'));
  const originalSessionsDir = CONFIG.SESSIONS_DIR;
  CONFIG.SESSIONS_DIR = tmpDir;

  try {
    // Créer une session en préparation
    const { id: idPrep } = await creerSession('Session prep');
    const resultPrep = await dupliquerSession(idPrep);
    assert.ok(resultPrep.id);
    assert.equal(resultPrep.manifest.statut, 'preparation');
  } finally {
    CONFIG.SESSIONS_DIR = originalSessionsDir;
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('dupliquerSession ne touche jamais la session source', async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'test-session-'));
  const originalSessionsDir = CONFIG.SESSIONS_DIR;
  CONFIG.SESSIONS_DIR = tmpDir;

  try {
    const { id: idSource, sessionDir } = await creerSession('Session source');
    const manifestPath = join(sessionDir, 'manifest.json');
    const manifestSourceAvant = await readFile(manifestPath, 'utf-8');

    await dupliquerSession(idSource);

    const manifestSourceApres = await readFile(manifestPath, 'utf-8');
    assert.equal(manifestSourceAvant, manifestSourceApres);
  } finally {
    CONFIG.SESSIONS_DIR = originalSessionsDir;
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('supprimerSession déplace dans _corbeille et refuse une session live', async () => {
  const { supprimerSession } = await import('./session-service.js');
  const { access, readdir } = await import('node:fs/promises');
  const { ecrireManifeste, lireManifeste } = await import('./manifest.js');
  const tmpDir = await mkdtemp(join(tmpdir(), 'test-suppr-'));
  const original = CONFIG.SESSIONS_DIR;
  CONFIG.SESSIONS_DIR = tmpDir;
  try {
    const a = await creerSession('A supprimer');
    const b = await creerSession('En cours');
    const mb = await lireManifeste(b.sessionDir);
    await ecrireManifeste(b.sessionDir, { ...mb, statut: 'live' });

    await assert.rejects(() => supprimerSession(b.id), ErreurSession);
    await access(b.sessionDir);

    await supprimerSession(a.id);
    await assert.rejects(() => access(a.sessionDir));
    assert.equal((await readdir(join(tmpDir, '_corbeille'))).length, 1);

    await assert.rejects(() => supprimerSession('../x'), ErreurSession);
  } finally {
    CONFIG.SESSIONS_DIR = original;
    await rm(tmpDir, { recursive: true, force: true });
  }
});
