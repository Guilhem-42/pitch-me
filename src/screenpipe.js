/**
 * Client pour l'API Screenpipe
 */

/**
 * Effectue une requête à l'API Screenpipe
 * @param {string} endpoint - Endpoint (ex: /search, /raw_sql)
 * @param {Object} params - Paramètres de requête
 * @param {number} port - Port de l'API
 * @param {string} apiKey - Clé API
 * @returns {Promise<Object>} Réponse JSON
 */
async function requete(endpoint, params, port, apiKey) {
  const url = new URL(endpoint, `http://localhost:${port}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        url.searchParams.append(key, value.toString());
      }
    });
  }

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-Screenpipe-Client': 'api'
    }
  });

  if (!response.ok) {
    throw new Error(`Erreur API Screenpipe: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Recherche dans les captures
 * @param {Object} params - Paramètres de recherche
 * @param {string} params.start_time - Début (ISO 8601 ou relatif)
 * @param {string} params.end_time - Fin (ISO 8601 ou relatif)
 * @param {string} [params.content_type] - Type de contenu
 * @param {string} [params.app_name] - Nom de l'app
 * @param {string} [params.window_name] - Titre de fenêtre
 * @param {number} [params.limit] - Limite de résultats
 * @param {number} [params.offset] - Offset de pagination
 * @param {number} port - Port de l'API
 * @param {string} apiKey - Clé API
 * @returns {Promise<Object>} Résultats de recherche
 */
export async function search(params, port, apiKey) {
  return requete('/search', params, port, apiKey);
}

/**
 * Exécute une requête SQL
 * @param {string} query - Requête SQL
 * @param {number} port - Port de l'API
 * @param {string} apiKey - Clé API
 * @returns {Promise<Object>} Résultats SQL
 */
export async function rawSql(query, port, apiKey) {
  return requete('/raw_sql', { query }, port, apiKey);
}

/**
 * Récupère toutes les frames dans une plage horaire
 * @param {string} startTime - Début (ISO 8601)
 * @param {string} endTime - Fin (ISO 8601)
 * @param {number} port - Port
 * @param {string} apiKey - Clé API
 * @returns {Promise<Array>} Liste des frames
 */
export async function recupererFrames(startTime, endTime, port, apiKey) {
  const results = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await search({
      start_time: startTime,
      end_time: endTime,
      content_type: 'ocr',
      limit,
      offset
    }, port, apiKey);

    if (!response.data || response.data.length === 0) {
      break;
    }

    results.push(...response.data);

    if (response.data.length < limit) {
      break;
    }

    offset += limit;
  }

  return results;
}

/**
 * Récupère les transcriptions audio dans une plage horaire
 * @param {string} startTime - Début (ISO 8601)
 * @param {string} endTime - Fin (ISO 8601)
 * @param {number} port - Port
 * @param {string} apiKey - Clé API
 * @returns {Promise<Array>} Liste des transcriptions
 */
export async function recupererAudio(startTime, endTime, port, apiKey) {
  const results = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await search({
      start_time: startTime,
      end_time: endTime,
      content_type: 'audio',
      limit,
      offset
    }, port, apiKey);

    if (!response.data || response.data.length === 0) {
      break;
    }

    results.push(...response.data);

    if (response.data.length < limit) {
      break;
    }

    offset += limit;
  }

  return results;
}

/**
 * Récupère les données complètes d'une session
 * @param {string} debut - Début (ISO 8601)
 * @param {string} fin - Fin (ISO 8601)
 * @param {number} port - Port
 * @param {string} apiKey - Clé API
 * @returns {Promise<Object>} Données de la session
 */
export async function recupererDonneesSession(debut, fin, port, apiKey) {
  const [frames, audio] = await Promise.all([
    recupererFrames(debut, fin, port, apiKey),
    recupererAudio(debut, fin, port, apiKey)
  ]);

  return {
    frames,
    audio
  };
}
