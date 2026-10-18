import { spawn } from 'node:child_process';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Attend que le endpoint /health réponde
 * @param {number} port - Port de l'instance Screenpipe
 * @param {string} apiKey - Clé API
 * @param {number} timeout - Timeout en ms
 * @returns {Promise<void>}
 */
async function attendreHealth(port, apiKey, timeout = 30000) {
  const start = Date.now();
  const url = `http://localhost:${port}/health`;
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'X-Screenpipe-Client': 'api'
  };

  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url, { headers });
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'healthy' || data.status_code === 200) {
          return;
        }
      }
    } catch {
      // Continuer à attendre
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timeout: l'instance Screenpipe n'a pas répondu après ${timeout}ms`);
}

/**
 * Lance une instance Screenpipe dédiée
 * @param {string} dataDir - Répertoire de données
 * @param {number} port - Port
 * @param {string} apiKey - Clé API
 * @param {boolean} disableAudio - Désactiver l'audio
 * @returns {Promise<number>} PID du processus
 */
export async function lancerScreenpipe(dataDir, port, apiKey, disableAudio = false) {
  const args = [
    '-y',
    'screenpipe@latest',
    'record',
    '--port', port.toString(),
    '--data-dir', dataDir
  ];

  if (disableAudio) {
    args.push('--disable-audio');
  }

  const child = spawn('npx', args, {
    detached: true,
    stdio: 'ignore'
  });

  const pid = child.pid;

  // Détacher le processus pour qu'il continue même si le wrapper s'arrête
  child.unref();

  // Attendre que l'API soit prête
  await attendreHealth(port, apiKey);

  return pid;
}

/**
 * Écrit le PID dans un fichier
 * @param {string} sessionDir - Répertoire de session
 * @param {number} pid - PID du processus
 */
export async function ecrirePid(sessionDir, pid) {
  const pidPath = join(sessionDir, 'screenpipe.pid');
  await writeFile(pidPath, pid.toString(), 'utf-8');
}

/**
 * Lit le PID depuis un fichier
 * @param {string} sessionDir - Répertoire de session
 * @returns {Promise<number|null>} PID ou null si non trouvé
 */
export async function lirePid(sessionDir) {
  try {
    const pidPath = join(sessionDir, 'screenpipe.pid');
    const content = await readFile(pidPath, 'utf-8');
    return parseInt(content.trim(), 10);
  } catch {
    return null;
  }
}

/**
 * Vérifie si le groupe de processus lancé par le wrapper tourne encore.
 * Le processus est lancé détaché : son PID est celui du chef de groupe, et
 * `npx` a des enfants (le vrai Screenpipe) qu'un signal sur le seul PID
 * laisserait en vie.
 * @param {number} pid - PID du chef de groupe
 * @returns {boolean} true si au moins un processus du groupe tourne
 */
export function processusEnVie(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/**
 * Arrête proprement tout le groupe de processus Screenpipe
 * @param {number} pid - PID du chef de groupe
 */
export async function arreterScreenpipe(pid) {
  if (!processusEnVie(pid)) {
    return;
  }

  try {
    // SIGTERM sur le groupe pour un arrêt propre
    process.kill(-pid, 'SIGTERM');

    // Attendre jusqu'à 10 secondes
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!processusEnVie(pid)) {
        return;
      }
    }

    // Si le groupe est toujours en vie, SIGKILL
    process.kill(-pid, 'SIGKILL');
  } catch (err) {
    // Le groupe est peut-être déjà mort
    if (err.code !== 'ESRCH') {
      throw err;
    }
  }
}

/**
 * Supprime le fichier PID
 * @param {string} sessionDir - Répertoire de session
 */
export async function supprimerPid(sessionDir) {
  try {
    const pidPath = join(sessionDir, 'screenpipe.pid');
    await unlink(pidPath);
  } catch {
    // Fichier déjà supprimé
  }
}
