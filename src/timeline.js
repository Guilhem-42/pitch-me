import { TimelineSchema } from './schemas.js';
import { MARQUEUR_PANNEAU } from './config.js';

/**
 * Convertit un timestamp ISO 8601 en décalage en secondes depuis le début
 * @param {string} timestamp - Timestamp ISO 8601
 * @param {string} debut - Timestamp de début (ISO 8601)
 * @returns {number} Décalage en secondes
 */
function decalageDepuisDebut(timestamp, debut) {
  const t = new Date(timestamp);
  const d = new Date(debut);
  return (t - d) / 1000;
}

/**
 * Extrait les fenêtres successives depuis les frames
 * @param {Array} frames - Frames de Screenpipe
 * @param {string} debut - Timestamp de début
 * @param {string} fin - Timestamp de fin de la session
 * @param {Array} fenetresPrevues - Fenêtres prévues
 * @returns {Array} Liste des fenêtres avec durées
 */
function extraireFenetres(frames, debut, fin, fenetresPrevues) {
  if (frames.length === 0) return [];

  const fenetres = [];
  let current = null;

  // Trier les frames par timestamp
  const sorted = [...frames].sort((a, b) =>
    new Date(a.content.timestamp) - new Date(b.content.timestamp)
  );

  for (const frame of sorted) {
    const app = frame.content.app_name || 'Inconnu';
    const fenetre = frame.content.window_name || '';
    const timestamp = frame.content.timestamp;

    if (!current || current.app !== app || current.fenetre !== fenetre) {
      // Fermer la fenêtre précédente
      if (current) {
        const fin_s = decalageDepuisDebut(timestamp, debut);
        current.fin_s = fin_s;
        current.duree_s = fin_s - current.debut_s;
        fenetres.push(current);
      }

      // Ouvrir une nouvelle fenêtre
      const appsPrevues = fenetresPrevues.map(f => f.app);
      current = {
        app,
        fenetre,
        debut_s: decalageDepuisDebut(timestamp, debut),
        fin_s: 0,
        duree_s: 0,
        prevue: appsPrevues.includes(app)
      };
    }
  }

  // Fermer la dernière fenêtre en utilisant la fin de la session
  if (current) {
    const fin_s = decalageDepuisDebut(fin, debut);
    current.fin_s = fin_s;
    current.duree_s = fin_s - current.debut_s;
    fenetres.push(current);
  }

  return fenetres;
}

/**
 * Calcule le temps passé par application
 * @param {Array} fenetres - Liste des fenêtres
 * @param {number} dureeS - Durée totale en secondes
 * @returns {Array} Temps par app
 */
function calculerTempsParApp(fenetres, dureeS) {
  const tempsByApp = {};

  for (const fenetre of fenetres) {
    if (!tempsByApp[fenetre.app]) {
      tempsByApp[fenetre.app] = 0;
    }
    tempsByApp[fenetre.app] += fenetre.duree_s;
  }

  return Object.entries(tempsByApp)
    .map(([app, duree_s]) => ({
      app,
      duree_s: Math.round(duree_s),
      part: dureeS > 0 ? duree_s / dureeS : 0
    }))
    .sort((a, b) => b.duree_s - a.duree_s);
}

/**
 * Identifie les fenêtres hors cadre
 * @param {Array} fenetres - Liste des fenêtres
 * @param {Array} fenetresPrevues - Fenêtres prévues
 * @returns {Array} Fenêtres hors cadre
 */
function identifierHorsCadre(fenetres, fenetresPrevues) {
  const appsPrevues = fenetresPrevues.map(f => f.app);
  return fenetres
    .filter(f => !appsPrevues.includes(f.app))
    .map(f => ({
      app: f.app,
      fenetre: f.fenetre,
      debut_s: f.debut_s,
      fin_s: f.fin_s,
      duree_s: Math.round(f.duree_s)
    }));
}

/**
 * Détecte les silences dans les transcriptions audio
 * @param {Array} audioData - Transcriptions audio
 * @param {string} debut - Timestamp de début
 * @param {string} pret - Timestamp du repère prêt
 * @param {number} seuilS - Seuil de silence en secondes
 * @returns {Array} Liste des silences
 */
function detecterSilences(audioData, debut, pret, seuilS = 3) {
  if (audioData.length === 0) return [];

  const silences = [];
  const pretS = decalageDepuisDebut(pret, debut);

  // Trier les segments audio par timestamp
  const sorted = [...audioData].sort((a, b) =>
    new Date(a.content.timestamp) - new Date(b.content.timestamp)
  );

  // Filtrer pour ne garder que la phase live
  const live = sorted.filter(s =>
    decalageDepuisDebut(s.content.timestamp, debut) >= pretS
  );

  if (live.length === 0) return [];

  let dernierFinS = pretS;

  for (const segment of live) {
    const debutSegmentS = decalageDepuisDebut(segment.content.timestamp, debut);
    const gap = debutSegmentS - dernierFinS;

    if (gap >= seuilS) {
      silences.push({
        debut_s: Math.round(dernierFinS),
        fin_s: Math.round(debutSegmentS),
        duree_s: Math.round(gap)
      });
    }

    // Approximation : on suppose que chaque segment dure ~2 secondes
    dernierFinS = debutSegmentS + 2;
  }

  return silences;
}

/**
 * Calcule les statistiques de parole
 * @param {Array} audioData - Transcriptions audio
 * @param {string} debut - Timestamp de début
 * @param {string} pret - Timestamp du repère prêt
 * @param {string} fin - Timestamp de fin
 * @returns {Object|null} Statistiques de parole ou null
 */
function calculerParole(audioData, debut, pret, fin) {
  if (audioData.length === 0) return null;

  const pretS = decalageDepuisDebut(pret, debut);
  const finS = decalageDepuisDebut(fin, debut);
  const dureeLiveS = finS - pretS;

  // Filtrer pour ne garder que la phase live
  const live = audioData.filter(s => {
    const t = decalageDepuisDebut(s.content.timestamp, debut);
    return t >= pretS && t <= finS;
  });

  if (live.length === 0) return null;

  // Compter les mots (approximatif)
  let totalMots = 0;
  for (const segment of live) {
    const text = segment.content.transcription || '';
    const mots = text.split(/\s+/).filter(m => m.length > 0);
    totalMots += mots.length;
  }

  // Approximation : durée de parole = nombre de segments × 2 secondes
  const dureeParoleS = live.length * 2;

  return {
    duree_s: Math.round(dureeParoleS),
    mots: totalMots,
    mots_par_min: dureeLiveS > 0 ? Math.round((totalMots / dureeLiveS) * 60) : 0
  };
}

/**
 * Extrait les repères convertis en décalage depuis le début
 * @param {Array} reperes - Repères du manifeste
 * @param {string} debut - Timestamp de début
 * @returns {Array} Repères avec décalage
 */
function extraireReperes(reperes, debut) {
  return reperes.map(r => ({
    t_s: Math.round(decalageDepuisDebut(r.t, debut)),
    type: r.type,
    texte: r.texte
  }));
}

/**
 * Extrait le texte à l'écran (limité)
 * @param {Array} frames - Frames
 * @param {string} debut - Timestamp de début
 * @param {number} max - Nombre max d'extraits
 * @returns {Array} Extraits de texte
 */
function extraireTexte(frames, debut, max = 40) {
  const extraits = [];
  let derniereApp = null;
  let derniereFenetre = null;

  // Trier les frames par timestamp
  const sorted = [...frames].sort((a, b) =>
    new Date(a.content.timestamp) - new Date(b.content.timestamp)
  );

  for (const frame of sorted) {
    const app = frame.content.app_name || 'Inconnu';
    const fenetre = frame.content.window_name || '';
    const texte = frame.content.text || '';

    // Nouvel extrait au changement de fenêtre
    if (app !== derniereApp || fenetre !== derniereFenetre) {
      if (texte.trim().length > 0) {
        extraits.push({
          t_s: Math.round(decalageDepuisDebut(frame.content.timestamp, debut)),
          app,
          texte: texte.substring(0, 300) // Limiter à 300 caractères
        });

        if (extraits.length >= max) {
          break;
        }
      }

      derniereApp = app;
      derniereFenetre = fenetre;
    }
  }

  return extraits;
}

/**
 * Calcule la timeline depuis le manifeste et les données Screenpipe
 * @param {Object} manifest - Manifeste de session
 * @param {Object} donnees - Données de Screenpipe (frames, audio)
 * @returns {Object} Timeline calculée
 */
export function calculerTimeline(manifest, donnees) {
  let { frames = [], audio = [] } = donnees;
  const { debut, pret, fin, fenetres_prevues, reperes } = manifest;

  if (!debut || !pret || !fin) {
    throw new Error('Le manifeste doit avoir debut, pret et fin renseignés');
  }

  // Filtrer les frames du panneau de contrôle (marqueur dans window_name)
  frames = frames.filter(frame => {
    const windowName = frame.content?.window_name || '';
    return !windowName.includes(MARQUEUR_PANNEAU);
  });

  const debutDate = new Date(debut);
  const pretDate = new Date(pret);
  const finDate = new Date(fin);

  const duree_s = Math.round((finDate - debutDate) / 1000);
  const duree_preparation_s = Math.round((pretDate - debutDate) / 1000);
  const duree_live_s = Math.round((finDate - pretDate) / 1000);

  const fenetres = extraireFenetres(frames, debut, fin, fenetres_prevues);
  const temps_par_app = calculerTempsParApp(fenetres, duree_s);
  const changements_fenetre = fenetres.length - 1;
  const hors_cadre = identifierHorsCadre(fenetres, fenetres_prevues);

  const timeline = {
    session_id: manifest.id,
    debut,
    pret,
    fin,
    duree_s,
    duree_preparation_s,
    duree_live_s,
    fenetres,
    temps_par_app,
    changements_fenetre,
    hors_cadre,
    reperes: extraireReperes(reperes, debut),
    extraits_texte: extraireTexte(frames, debut)
  };

  // Ajouter les données audio si présentes
  if (manifest.audio && audio.length > 0) {
    timeline.silences = detecterSilences(audio, debut, pret);
    timeline.parole = calculerParole(audio, debut, pret, fin);
  }

  // Valider le schéma avant de retourner
  return TimelineSchema.parse(timeline);
}
