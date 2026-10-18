import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { etatGuide } from './guide.js';

describe('etatGuide', () => {
  test('retourne null sans guide', () => {
    const manifest = {
      guide: null,
      pret: '2026-10-18T14:00:00Z',
      duree_cible_s: 300,
      reperes: []
    };

    const maintenant = new Date('2026-10-18T14:02:00Z');
    const etat = etatGuide(manifest, maintenant);

    assert.equal(etat, null);
  });

  test('retourne null avant prêt', () => {
    const manifest = {
      guide: {
        points: [],
        rappels_fin: [],
        alerte_fin_s: 10
      },
      pret: null,
      duree_cible_s: 300,
      reperes: []
    };

    const maintenant = new Date('2026-10-18T14:02:00Z');
    const etat = etatGuide(manifest, maintenant);

    assert.equal(etat, null);
  });

  test('calcule temps écoulé et restant', () => {
    const manifest = {
      guide: {
        points: [],
        rappels_fin: [],
        alerte_fin_s: 10
      },
      pret: '2026-10-18T14:00:00Z',
      duree_cible_s: 300,
      reperes: []
    };

    const maintenant = new Date('2026-10-18T14:02:00Z'); // +120s
    const etat = etatGuide(manifest, maintenant);

    assert.equal(etat.ecoule_s, 120);
    assert.equal(etat.reste_s, 180);
    assert.equal(etat.duree_cible_s, 300);
    assert.equal(etat.progression, 0.4);
    assert.equal(etat.depassement, false);
  });

  test('détecte le dépassement', () => {
    const manifest = {
      guide: {
        points: [],
        rappels_fin: [],
        alerte_fin_s: 10
      },
      pret: '2026-10-18T14:00:00Z',
      duree_cible_s: 300,
      reperes: []
    };

    const maintenant = new Date('2026-10-18T14:06:00Z'); // +360s
    const etat = etatGuide(manifest, maintenant);

    assert.equal(etat.ecoule_s, 360);
    assert.equal(etat.reste_s, -60);
    assert.equal(etat.depassement, true);
  });

  test('identifie le point attendu', () => {
    const manifest = {
      guide: {
        points: [
          { id: 'intro', titre: 'Introduction', t_cible_s: 30, important: false },
          { id: 'demo', titre: 'Démo', t_cible_s: 120, important: false },
          { id: 'conclu', titre: 'Conclusion', t_cible_s: 240, important: false }
        ],
        rappels_fin: [],
        alerte_fin_s: 10
      },
      pret: '2026-10-18T14:00:00Z',
      duree_cible_s: 300,
      reperes: []
    };

    const maintenant = new Date('2026-10-18T14:02:00Z'); // +120s
    const etat = etatGuide(manifest, maintenant);

    assert.ok(etat.pointAttendu);
    assert.equal(etat.pointAttendu.id, 'intro');
  });

  test('identifie les points en retard', () => {
    const manifest = {
      guide: {
        points: [
          { id: 'intro', titre: 'Introduction', t_cible_s: 30, important: false },
          { id: 'demo', titre: 'Démo', t_cible_s: 120, important: false },
          { id: 'conclu', titre: 'Conclusion', t_cible_s: 240, important: false }
        ],
        rappels_fin: [],
        alerte_fin_s: 10
      },
      pret: '2026-10-18T14:00:00Z',
      duree_cible_s: 300,
      reperes: []
    };

    const maintenant = new Date('2026-10-18T14:03:00Z'); // +180s
    const etat = etatGuide(manifest, maintenant);

    assert.equal(etat.pointsEnRetard.length, 2);
    assert.equal(etat.pointsEnRetard[0].id, 'intro');
    assert.equal(etat.pointsEnRetard[1].id, 'demo');
  });

  test('exclut les points déjà faits', () => {
    const manifest = {
      guide: {
        points: [
          { id: 'intro', titre: 'Introduction', t_cible_s: 30, important: false },
          { id: 'demo', titre: 'Démo', t_cible_s: 120, important: false },
          { id: 'conclu', titre: 'Conclusion', t_cible_s: 240, important: false }
        ],
        rappels_fin: [],
        alerte_fin_s: 10
      },
      pret: '2026-10-18T14:00:00Z',
      duree_cible_s: 300,
      reperes: [
        { t: '2026-10-18T14:00:40Z', type: 'point', texte: 'intro' },
        { t: '2026-10-18T14:02:10Z', type: 'point', texte: 'demo' }
      ]
    };

    const maintenant = new Date('2026-10-18T14:03:00Z'); // +180s
    const etat = etatGuide(manifest, maintenant);

    // Seul 'conclu' reste
    assert.equal(etat.pointsEnRetard.length, 0);
    assert.equal(etat.pointAttendu, null); // t_cible_s=240 > 180
  });

  test('liste les points importants non faits', () => {
    const manifest = {
      guide: {
        points: [
          { id: 'intro', titre: 'Introduction', t_cible_s: 30, important: true },
          { id: 'demo', titre: 'Démo', t_cible_s: 120, important: false },
          { id: 'prix', titre: 'Prix', t_cible_s: 180, important: true }
        ],
        rappels_fin: [],
        alerte_fin_s: 10
      },
      pret: '2026-10-18T14:00:00Z',
      duree_cible_s: 300,
      reperes: []
    };

    const maintenant = new Date('2026-10-18T14:04:00Z'); // +240s
    const etat = etatGuide(manifest, maintenant);

    assert.equal(etat.pointsImportantsNonFaits.length, 2);
    assert.equal(etat.pointsImportantsNonFaits[0].id, 'intro');
    assert.equal(etat.pointsImportantsNonFaits[1].id, 'prix');
  });

  test('active la fenêtre finale', () => {
    const manifest = {
      guide: {
        points: [],
        rappels_fin: ['Merci !', 'github.com/project'],
        alerte_fin_s: 10
      },
      pret: '2026-10-18T14:00:00Z',
      duree_cible_s: 300,
      reperes: []
    };

    const maintenant = new Date('2026-10-18T14:04:55Z'); // +295s, reste 5s
    const etat = etatGuide(manifest, maintenant);

    assert.equal(etat.fenetreFinale, true);
    assert.equal(etat.rappels_fin.length, 2);
    assert.equal(etat.rappels_fin[0], 'Merci !');
  });

  test('pas de fenêtre finale si trop tôt', () => {
    const manifest = {
      guide: {
        points: [],
        rappels_fin: ['Merci !'],
        alerte_fin_s: 10
      },
      pret: '2026-10-18T14:00:00Z',
      duree_cible_s: 300,
      reperes: []
    };

    const maintenant = new Date('2026-10-18T14:04:40Z'); // +280s, reste 20s
    const etat = etatGuide(manifest, maintenant);

    assert.equal(etat.fenetreFinale, false);
    assert.equal(etat.rappels_fin.length, 0);
  });

  test('pas de fenêtre finale si dépassement', () => {
    const manifest = {
      guide: {
        points: [],
        rappels_fin: ['Merci !'],
        alerte_fin_s: 10
      },
      pret: '2026-10-18T14:00:00Z',
      duree_cible_s: 300,
      reperes: []
    };

    const maintenant = new Date('2026-10-18T14:06:00Z'); // +360s, reste -60s
    const etat = etatGuide(manifest, maintenant);

    assert.equal(etat.fenetreFinale, false);
    assert.equal(etat.rappels_fin.length, 0);
  });

  test('session sans duree_cible_s', () => {
    const manifest = {
      guide: {
        points: [],
        rappels_fin: [],
        alerte_fin_s: 10
      },
      pret: '2026-10-18T14:00:00Z',
      duree_cible_s: 0,
      reperes: []
    };

    const maintenant = new Date('2026-10-18T14:02:00Z');
    const etat = etatGuide(manifest, maintenant);

    assert.equal(etat.duree_cible_s, 0);
    assert.equal(etat.reste_s, -120);
    assert.equal(etat.progression, 0);
  });
});
