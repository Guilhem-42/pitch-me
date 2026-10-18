import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  creerSession,
  dupliquerSession,
  demarrer,
  pret,
  repere,
  arreter,
  majGuide,
  ErreurSession
} from './session-service.js';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json'
};

/**
 * Génère un jeton de sécurité
 * @returns {string} Jeton
 */
function genererJeton() {
  return randomBytes(32).toString('hex');
}

/**
 * Lit le corps JSON d'une requête
 * @param {Object} req - Requête HTTP
 * @returns {Promise<Object>} Corps parsé
 */
async function lireCorps(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Valide une requête d'écriture
 * @param {Object} req - Requête HTTP
 * @param {string} jeton - Jeton attendu
 * @returns {Object|null} Erreur ou null
 */
function validerRequeteEcriture(req, jeton) {
  // Vérifier Host (localhost ou 127.0.0.1 avec n'importe quel port)
  const host = req.headers.host;
  if (!host || (!host.startsWith('localhost:') && !host.startsWith('127.0.0.1:'))) {
    return { status: 403, message: 'Host invalide' };
  }

  // Vérifier Content-Type
  const contentType = req.headers['content-type'];
  if (contentType !== 'application/json') {
    return { status: 400, message: 'Content-Type doit être application/json' };
  }

  // Vérifier Authorization
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return { status: 401, message: 'Authorization manquante' };
  }

  const token = auth.substring(7);
  if (token !== jeton) {
    return { status: 401, message: 'Jeton invalide' };
  }

  return null;
}

/**
 * Démarre le serveur HTTP
 * @param {number} port - Port d'écoute
 * @param {string} webDir - Répertoire web
 * @param {string} sessionsDir - Répertoire des sessions
 * @returns {Object} Serveur et jeton
 */
export function demarrerServeur(port, webDir, sessionsDir) {
  const jeton = genererJeton();

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
        if (!/^[A-Za-z0-9_-]+$/.test(id)) {
          res.writeHead(400);
          res.end('Bad Request');
          return;
        }
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

      // Route: GET /api/token - Expose le jeton
      if (path === '/api/token' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token: jeton }));
        return;
      }

      // Route: POST /api/sessions - Créer une session
      if (path === '/api/sessions' && req.method === 'POST') {
        const erreur = validerRequeteEcriture(req, jeton);
        if (erreur) {
          res.writeHead(erreur.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: erreur.message }));
          return;
        }

        const body = await lireCorps(req);
        if (!body.titre) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'titre requis' }));
          return;
        }

        try {
          const { manifest } = await creerSession(body.titre);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(manifest));
        } catch (err) {
          const status = err instanceof ErreurSession ? 400 : 500;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message, code: err.code }));
        }
        return;
      }

      // Route: POST /api/session/:id/dupliquer - Dupliquer une session
      const matchDupliquer = path.match(/^\/api\/session\/([A-Za-z0-9_-]+)\/dupliquer$/);
      if (matchDupliquer && req.method === 'POST') {
        const erreur = validerRequeteEcriture(req, jeton);
        if (erreur) {
          res.writeHead(erreur.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: erreur.message }));
          return;
        }

        const idSource = matchDupliquer[1];

        try {
          const { manifest } = await dupliquerSession(idSource);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(manifest));
        } catch (err) {
          const status = err instanceof ErreurSession ? 400 : 500;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message, code: err.code }));
        }
        return;
      }

      // Route: POST /api/start - Démarrer une session
      if (path === '/api/start' && req.method === 'POST') {
        const erreur = validerRequeteEcriture(req, jeton);
        if (erreur) {
          res.writeHead(erreur.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: erreur.message }));
          return;
        }

        const body = await lireCorps(req);
        if (!body.id || !body.consentement) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'id et consentement requis' }));
          return;
        }

        try {
          const result = await demarrer(body.id, body.consentement);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          const status = err instanceof ErreurSession ? 400 : 500;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message, code: err.code }));
        }
        return;
      }

      // Route: PATCH /api/ready - Poser le repère prêt
      if (path === '/api/ready' && req.method === 'PATCH') {
        const erreur = validerRequeteEcriture(req, jeton);
        if (erreur) {
          res.writeHead(erreur.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: erreur.message }));
          return;
        }

        const body = await lireCorps(req);
        if (!body.id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'id requis' }));
          return;
        }

        try {
          const result = await pret(body.id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          const status = err instanceof ErreurSession ? 400 : 500;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message, code: err.code }));
        }
        return;
      }

      // Route: POST /api/mark - Poser un repère
      if (path === '/api/mark' && req.method === 'POST') {
        const erreur = validerRequeteEcriture(req, jeton);
        if (erreur) {
          res.writeHead(erreur.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: erreur.message }));
          return;
        }

        const body = await lireCorps(req);
        if (!body.id || !body.type) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'id et type requis' }));
          return;
        }

        try {
          const result = await repere(body.id, body.type, body.texte || '');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          const status = err instanceof ErreurSession ? 400 : 500;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message, code: err.code }));
        }
        return;
      }

      // Route: PATCH /api/stop - Arrêter une session
      if (path === '/api/stop' && req.method === 'PATCH') {
        const erreur = validerRequeteEcriture(req, jeton);
        if (erreur) {
          res.writeHead(erreur.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: erreur.message }));
          return;
        }

        const body = await lireCorps(req);
        if (!body.id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'id requis' }));
          return;
        }

        try {
          const result = await arreter(body.id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          const status = err instanceof ErreurSession ? 400 : 500;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message, code: err.code }));
        }
        return;
      }

      // Route: PATCH /api/guide - Modifier le guide
      if (path === '/api/guide' && req.method === 'PATCH') {
        const erreur = validerRequeteEcriture(req, jeton);
        if (erreur) {
          res.writeHead(erreur.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: erreur.message }));
          return;
        }

        const body = await lireCorps(req);
        if (!body.id || !body.guide) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'id et guide requis' }));
          return;
        }

        try {
          const result = await majGuide(body.id, body.guide);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          const status = err instanceof ErreurSession ? 400 : 500;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message, code: err.code }));
        }
        return;
      }

      // Fichiers statiques
      const racine = resolve(webDir);
      const filePath = resolve(racine, '.' + path);
      if (!filePath.startsWith(racine + sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
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

  // Écoute sur la boucle locale uniquement : le dashboard affiche du texte d'écran.
  server.listen(port, '127.0.0.1', () => {
    console.log(`\n🌐 Dashboard accessible sur http://localhost:${port}`);
    console.log(`🔑 Jeton API: ${jeton}`);
    console.log(`   Ctrl+C pour arrêter`);
  });

  return { server, jeton };
}
