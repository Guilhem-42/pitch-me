import { app, BrowserWindow } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demarrerServeur } from './src/server.js';
import { CONFIG } from './src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let win;
let serveur;

function createWindow() {
  const port = 3000;
  const webDir = join(__dirname, 'web');

  // Démarrer le serveur
  const result = demarrerServeur(port, webDir, CONFIG.SESSIONS_DIR);
  serveur = result.server;

  // Créer la fenêtre Electron
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

  // Charger la page de contrôle
  win.loadURL(`http://localhost:${port}/controle.html`);

  // Empêcher de voler le focus
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, 'floating', 1);

  // Événements
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serveur) {
    serveur.close();
  }
  app.quit();
});

app.on('activate', () => {
  if (win === null) {
    createWindow();
  }
});
