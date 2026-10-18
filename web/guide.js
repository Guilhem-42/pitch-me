/**
 * Calcule l'état du guide pendant le live
 * @param {Object} manifest - Manifeste de session
 * @param {Date} maintenant - Instant actuel
 * @returns {Object|null} État du guide ou null si pas de guide
 */
export function etatGuide(manifest, maintenant) {
  // Pas de guide configuré
  if (!manifest.guide) {
    return null;
  }

  // Pas encore prêt
  if (!manifest.pret) {
    return null;
  }

  const pret = new Date(manifest.pret).getTime();
  const now = maintenant.getTime();
  const ecoule_s = Math.floor((now - pret) / 1000);

  // Points déjà faits (repères de type 'point')
  const pointsFaits = new Set(
    manifest.reperes
      .filter(r => r.type === 'point')
      .map(r => r.texte)
  );

  // Séparer les points en catégories
  const pointsNonFaits = manifest.guide.points.filter(p => !pointsFaits.has(p.id));

  // Point attendu : premier non fait dont t_cible_s est atteint
  const pointAttendu = pointsNonFaits.find(p => p.t_cible_s <= ecoule_s);

  // Points en retard : t_cible_s dépassé, non faits
  const pointsEnRetard = pointsNonFaits.filter(p => p.t_cible_s < ecoule_s);

  // Points importants non faits (même après leur instant)
  const pointsImportantsNonFaits = pointsNonFaits.filter(p => p.important);

  // Temps restant
  const duree_cible_s = manifest.duree_cible_s || 0;
  const reste_s = duree_cible_s - ecoule_s;

  // Fenêtre finale ?
  const alerte_fin_s = manifest.guide.alerte_fin_s || 10;
  const fenetreFinale = reste_s > 0 && reste_s <= alerte_fin_s;

  // Durée dépassée ?
  const depassement = reste_s < 0;

  return {
    ecoule_s,
    reste_s,
    duree_cible_s,
    progression: duree_cible_s > 0 ? ecoule_s / duree_cible_s : 0,
    pointAttendu: pointAttendu || null,
    pointsEnRetard,
    pointsImportantsNonFaits,
    fenetreFinale,
    rappels_fin: fenetreFinale ? manifest.guide.rappels_fin : [],
    depassement
  };
}
