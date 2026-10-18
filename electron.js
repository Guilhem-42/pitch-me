import { app, BrowserWindow, dialog } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demarrerServeur } from './src/server.js';
import { CONFIG } from './src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT_DEBUT = 3000;
const NB_PORTS = 10;

let port = PORT_DEBUT;

let win = null;
let serveur = null;
let creation = false;

function demarrerServeurSur(portCible) {
  return new Promise((resolve, reject) => {
    const { server } = demarrerServeur(portCible, join(__dirname, 'web'), CONFIG.SESSIONS_DIR);
    server.once('error', reject);
    server.once('listening', () => resolve(server));
  });
}

/**
 * Démarre toujours son propre serveur, sur le premier port libre à partir de
 * 3000. On ne réutilise jamais un serveur déjà actif : il pourrait tourner avec
 * un code plus ancien que celui du dépôt (routes manquantes).
 */
async function demarrerServeurLibre() {
  for (let p = PORT_DEBUT; p < PORT_DEBUT + NB_PORTS; p++) {
    try {
      serveur = await demarrerServeurSur(p);
      port = p;
      return;
    } catch (err) {
      if (err.code !== 'EADDRINUSE') {
        throw err;
      }
    }
  }
  throw new Error(`aucun port libre entre ${PORT_DEBUT} et ${PORT_DEBUT + NB_PORTS - 1}`);
}

async function creerFenetre() {
  if (creation || win) {
    return;
  }
  creation = true;

  try {
    try {
      await demarrerServeurLibre();
    } catch (err) {
      dialog.showErrorBox('Pitch-Me', `Impossible de démarrer le serveur : ${err.message}`);
      app.quit();
      return;
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

    win.loadURL(`http://localhost:${port}/controle.html`);

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
