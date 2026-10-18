import { app, BrowserWindow, dialog } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demarrerServeur } from './src/server.js';
import { CONFIG } from './src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3000;

let win = null;
let serveur = null;
let creation = false;

/**
 * Détecte un serveur Pitch-Me déjà actif sur le port (ex. `serve` lancé avant).
 * Dans ce cas la coque le réutilise au lieu d'en démarrer un second.
 */
async function serveurDejaActif() {
  try {
    const rep = await fetch(`http://127.0.0.1:${PORT}/api/token`, {
      signal: AbortSignal.timeout(1000)
    });
    return rep.ok;
  } catch {
    return false;
  }
}

function demarrerServeurLocal() {
  return new Promise((resolve, reject) => {
    const { server } = demarrerServeur(PORT, join(__dirname, 'web'), CONFIG.SESSIONS_DIR);
    server.once('error', reject);
    server.once('listening', () => resolve(server));
  });
}

async function creerFenetre() {
  if (creation || win) {
    return;
  }
  creation = true;

  try {
    if (!(await serveurDejaActif())) {
      try {
        serveur = await demarrerServeurLocal();
      } catch (err) {
        dialog.showErrorBox(
          'Pitch-Me',
          `Impossible de démarrer le serveur sur le port ${PORT} : ${err.message}\n` +
          'Un autre programme utilise peut-être ce port.'
        );
        app.quit();
        return;
      }
    }

    win = new BrowserWindow({
      width: 380,
      height: 600,
      alwaysOnTop: true,
      type: 'panel',
      frame: true,
      titleBarStyle: 'default',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    // Exclure des captures (macOS)
    if (process.platform === 'darwin') {
      try {
        win.setContentProtection(true);
      } catch (err) {
        console.warn('setContentProtection non supporté:', err.message);
      }
    }

    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, 'floating', 1);

    win.loadURL(`http://localhost:${PORT}/controle.html`);

    win.on('closed', () => {
      win = null;
    });
  } finally {
    creation = false;
  }
}

if (!app.requestSingleInstanceLock()) {
  // Un panneau est déjà ouvert : on ne lance pas une seconde coque.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      win.showInactive();
    }
  });

  app.whenReady().then(creerFenetre);

  app.on('window-all-closed', () => {
    if (serveur) {
      serveur.close();
    }
    app.quit();
  });

  app.on('activate', () => {
    creerFenetre();
  });
}
