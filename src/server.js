import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json'
};

/**
 * Démarre le serveur HTTP
 * @param {number} port - Port d'écoute
 * @param {string} webDir - Répertoire web
 * @param {string} sessionsDir - Répertoire des sessions
 */
export function demarrerServeur(port, webDir, sessionsDir) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${port}`);
      let path = url.pathname;

      // Route racine
      if (path === '/') {
        path = '/index.html';
      }

      // Routes API
      if (path === '/api/sessions') {
        // Lister les sessions
        const sessions = await readdir(sessionsDir);
        const liste = [];

        for (const id of sessions) {
          try {
            const manifestPath = join(sessionsDir, id, 'manifest.json');
            const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
            liste.push({
              id: manifest.id,
              titre: manifest.titre,
              statut: manifest.statut,
              debut: manifest.debut,
              fin: manifest.fin
            });
          } catch {
            // Ignorer les dossiers invalides
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(liste));
        return;
      }

      if (path.startsWith('/api/session/')) {
        // Détails d'une session
        const id = path.replace('/api/session/', '');
        const sessionDir = join(sessionsDir, id);

        const [manifest, timeline, report] = await Promise.all([
          readFile(join(sessionDir, 'manifest.json'), 'utf-8').then(JSON.parse),
          readFile(join(sessionDir, 'timeline.json'), 'utf-8').then(JSON.parse).catch(() => null),
          readFile(join(sessionDir, 'report.json'), 'utf-8').then(JSON.parse).catch(() => null)
        ]);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ manifest, timeline, report }));
        return;
      }

      // Fichiers statiques
      const filePath = join(webDir, path);
      const content = await readFile(filePath);
      const ext = extname(filePath);
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content);
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        console.error('Erreur serveur:', err);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    }
  });

  server.listen(port, () => {
    console.log(`\n🌐 Dashboard accessible sur http://localhost:${port}`);
    console.log(`   Ctrl+C pour arrêter`);
  });

  return server;
}
