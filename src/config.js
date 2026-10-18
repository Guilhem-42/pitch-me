import { config } from 'dotenv';
import { resolve } from 'node:path';

// Charger les variables d'environnement
config();

/**
 * Configuration de l'application
 */
export const CONFIG = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
  SCREENPIPE_API_KEY: process.env.SCREENPIPE_API_KEY || '',
  SCREENPIPE_PORT: parseInt(process.env.SCREENPIPE_PORT || '3035', 10),
  SESSIONS_DIR: resolve(process.env.SESSIONS_DIR || './sessions')
};

/**
 * Valide que les clés API sont présentes
 * @param {boolean} needAnthropic - Vérifier la clé Anthropic
 * @param {boolean} needScreenpipe - Vérifier la clé Screenpipe
 */
export function validerConfig(needAnthropic = false, needScreenpipe = true) {
  const errors = [];

  if (needAnthropic && !CONFIG.ANTHROPIC_API_KEY) {
    errors.push('ANTHROPIC_API_KEY manquante dans .env');
  }

  if (needScreenpipe && !CONFIG.SCREENPIPE_API_KEY) {
    errors.push('SCREENPIPE_API_KEY manquante dans .env');
  }

  if (errors.length > 0) {
    throw new Error(
      `Configuration invalide:\n${errors.join('\n')}\n\n` +
      `Copier .env.example en .env et renseigner les valeurs.`
    );
  }
}
