#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Créer le dossier si nécessaire (simule sessions/XXX/screenpipe/)
const sessionDir = join(__dirname, 'session-test');
const dbDir = join(sessionDir, 'screenpipe');
mkdirSync(dbDir, { recursive: true });

const dbPath = join(dbDir, 'db.sqlite');

// Créer la base
const db = new DatabaseSync(dbPath);

// Schéma minimal compatible avec Screenpipe
db.exec(`
  CREATE TABLE IF NOT EXISTS frames (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    app_name TEXT,
    window_name TEXT,
    text TEXT
  );

  CREATE TABLE IF NOT EXISTS audio_transcriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    transcription TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_frames_timestamp ON frames(timestamp);
  CREATE INDEX IF NOT EXISTS idx_audio_timestamp ON audio_transcriptions(timestamp);
`);

// Insérer des données de test
const insertFrame = db.prepare(`
  INSERT INTO frames (timestamp, app_name, window_name, text)
  VALUES (?, ?, ?, ?)
`);

const insertAudio = db.prepare(`
  INSERT INTO audio_transcriptions (timestamp, transcription)
  VALUES (?, ?)
`);

// Frames de test
insertFrame.run('2026-10-18T14:00:00Z', 'Google Chrome', 'Présentation - Slides', 'Titre du deck');
insertFrame.run('2026-10-18T14:01:00Z', 'Google Chrome', 'Présentation - Slides', 'Slide 2');
insertFrame.run('2026-10-18T14:02:00Z', 'Google Chrome', 'Présentation - Slides', 'Slide 3');
insertFrame.run('2026-10-18T14:03:00Z', 'Slack', 'Message de Jean', 'Salut');
insertFrame.run('2026-10-18T14:04:00Z', 'Google Chrome', 'Présentation - Slides', 'Conclusion');

// Audio de test
insertAudio.run('2026-10-18T14:02:30Z', 'Bonjour à tous');
insertAudio.run('2026-10-18T14:03:00Z', 'Je vais vous présenter notre projet');
insertAudio.run('2026-10-18T14:04:30Z', 'Merci pour votre attention');

db.close();

console.log(`Base de test créée : ${dbPath}`);
