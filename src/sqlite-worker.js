// Processus `node` système : lit SQLite pour le compte d'Electron (sans node:sqlite).
import { recupererDonneesDepuisSqlite, compterFrames } from './screenpipe-sqlite.js';

const [operation, sessionDir, debut, fin] = process.argv.slice(2);

try {
  const resultat = operation === 'compter'
    ? await compterFrames(sessionDir, debut, fin)
    : await recupererDonneesDepuisSqlite(sessionDir, debut, fin);
  process.stdout.write(JSON.stringify(resultat));
} catch (err) {
  process.stderr.write(err.message);
  process.exit(1);
}
