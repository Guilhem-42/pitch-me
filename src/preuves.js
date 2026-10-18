/**
 * Validation des rapports par rapport aux timelines : le LLM interprète, mais
 * ne doit citer que des faits qui existent et reprendre des chiffres exacts.
 */

/**
 * Vérifie qu'une entrée de timeline correspond à l'instant t_s.
 * Une entrée correspond si elle porte exactement ce t_s, ou si t_s tombe dans
 * son intervalle [debut_s, fin_s].
 */
function entreeCorrespond(item, t_s) {
  if (item === null || typeof item !== 'object') {
    return false;
  }
  // Plan réalisé : on peut citer l'instant visé ou l'instant réel du point.
  if (typeof item.t_cible_s === 'number') {
    return item.t_cible_s === t_s || item.t_reel_s === t_s;
  }
  if (typeof item.t_s === 'number') {
    return item.t_s === t_s;
  }
  if (typeof item.debut_s === 'number') {
    const fin = typeof item.fin_s === 'number' ? item.fin_s : item.debut_s;
    return t_s >= item.debut_s && t_s <= fin;
  }
  return false;
}

/**
 * Valide les preuves des constats.
 * @param {Object} rapport - Rapport à valider
 * @param {Object} timeline - Timeline de référence
 * @returns {Array<string>} Liste des erreurs
 */
export function validerPreuves(rapport, timeline) {
  const erreurs = [];

  for (const constat of rapport.constats) {
    const { source, t_s } = constat.preuve;
    const donnees = Object.hasOwn(timeline, source) ? timeline[source] : undefined;

    if (donnees === undefined || donnees === null) {
      erreurs.push(`Preuve invalide pour "${constat.titre}": la source "${source}" n'existe pas dans timeline.json`);
      continue;
    }

    let trouve;
    if (Array.isArray(donnees)) {
      trouve = donnees.some(item => entreeCorrespond(item, t_s));
    } else {
      // Source qui n'est pas une liste (parole, durées…) : t_s doit être dans la session.
      trouve = t_s >= 0 && t_s <= timeline.duree_s;
    }

    if (!trouve) {
      erreurs.push(`Preuve invalide pour "${constat.titre}": aucune entrée de "${source}" ne correspond à t_s=${t_s}`);
    }
  }

  return erreurs;
}

/**
 * Lit une mesure numérique dans une timeline (chemin pointé : "parole.mots_par_min").
 */
function lireMesure(timeline, mesure) {
  let courant = timeline;
  for (const cle of mesure.split('.')) {
    if (courant === null || typeof courant !== 'object' || !Object.hasOwn(courant, cle)) {
      return undefined;
    }
    courant = courant[cle];
  }
  return typeof courant === 'number' ? courant : undefined;
}

/**
 * Valide la comparaison : chaque delta doit reprendre exactement les valeurs
 * des deux timelines. Le LLM ne calcule ni n'arrondit.
 * @param {Object} rapport - Rapport à valider
 * @param {Object} timeline - Timeline de la session courante
 * @param {Object|null} timelinePrecedente - Timeline de la session précédente
 * @returns {Array<string>} Liste des erreurs
 */
export function validerComparaison(rapport, timeline, timelinePrecedente) {
  const erreurs = [];
  const { comparaison } = rapport;

  if (!timelinePrecedente) {
    if (comparaison) {
      erreurs.push('Comparaison fournie alors qu\'il n\'y a pas de session précédente : mettre "comparaison" à null');
    }
    return erreurs;
  }

  if (!comparaison) {
    return erreurs;
  }

  for (const delta of comparaison.deltas) {
    const avant = lireMesure(timelinePrecedente, delta.mesure);
    const apres = lireMesure(timeline, delta.mesure);

    if (avant === undefined || apres === undefined) {
      erreurs.push(`Delta invalide "${delta.mesure}": mesure numérique absente d'une des deux timelines`);
    } else if (avant !== delta.avant || apres !== delta.apres) {
      erreurs.push(
        `Delta invalide "${delta.mesure}": valeurs attendues avant=${avant}, apres=${apres} ` +
        `(reçu avant=${delta.avant}, apres=${delta.apres})`
      );
    }
  }

  return erreurs;
}
