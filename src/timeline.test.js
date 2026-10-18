import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculerTimeline } from './timeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function chargerFixture(nom) {
  const path = join(__dirname, '__fixtures__', nom);
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content);
}

describe('calculerTimeline', () => {
  test('calcule la timeline avec audio', async () => {
    const manifest = await chargerFixture('manifest-session1.json');
    const donnees = await chargerFixture('donnees-session1.json');

    const timeline = calculerTimeline(manifest, donnees);

    // Vérifications de base
    assert.equal(timeline.session_id, '2026-10-18-s01');
    assert.equal(timeline.debut, '2026-10-18T14:00:00Z');
    assert.equal(timeline.pret, '2026-10-18T14:02:10Z');
    assert.equal(timeline.fin, '2026-10-18T14:07:40Z');

    // Durées
    assert.equal(timeline.duree_s, 460);
    assert.equal(timeline.duree_preparation_s, 130);
    assert.equal(timeline.duree_live_s, 330);

    // Fenêtres
    assert.ok(Array.isArray(timeline.fenetres));
    assert.ok(timeline.fenetres.length > 0);

    // Changements de fenêtre
    assert.ok(timeline.changements_fenetre >= 0);

    // Temps par app
    assert.ok(Array.isArray(timeline.temps_par_app));
    assert.ok(timeline.temps_par_app.length > 0);

    // Hors cadre (Slack n'est pas dans fenetres_prevues)
    assert.ok(Array.isArray(timeline.hors_cadre));
    const slackHorsCadre = timeline.hors_cadre.find(h => h.app === 'Slack');
    assert.ok(slackHorsCadre, 'Slack devrait être hors cadre');

    // Audio
    assert.ok(timeline.parole, 'La parole devrait être présente');
    assert.ok(timeline.parole.mots > 0, 'Il devrait y avoir des mots');
    assert.ok(timeline.parole.duree_s > 0, 'La durée de parole devrait être > 0');

    // Silences
    assert.ok(Array.isArray(timeline.silences));

    // Extraits de texte
    assert.ok(Array.isArray(timeline.extraits_texte));
    assert.ok(timeline.extraits_texte.length <= 40, 'Max 40 extraits');
  });

  test('calcule la timeline sans audio', async () => {
    const manifest = await chargerFixture('manifest-sans-audio.json');
    const donnees = await chargerFixture('donnees-sans-audio.json');

    const timeline = calculerTimeline(manifest, donnees);

    // Vérifications de base
    assert.equal(timeline.session_id, '2026-10-18-s02');

    // Pas d'audio
    assert.equal(timeline.parole, undefined, 'Pas de données de parole sans audio');
    assert.equal(timeline.silences, undefined, 'Pas de silences sans audio');

    // Fenêtres
    assert.ok(Array.isArray(timeline.fenetres));
    assert.ok(timeline.fenetres.length > 0);
  });

  test('cohérence des sommes (temps_par_app)', async () => {
    const manifest = await chargerFixture('manifest-session1.json');
    const donnees = await chargerFixture('donnees-session1.json');

    const timeline = calculerTimeline(manifest, donnees);

    // Somme des temps par app
    const sommeDurees = timeline.temps_par_app.reduce((acc, t) => acc + t.duree_s, 0);

    // Devrait être proche de duree_s (tolérance de quelques secondes)
    const ecart = Math.abs(sommeDurees - timeline.duree_s);
    assert.ok(ecart <= 10, `Écart trop important: ${ecart}s (somme: ${sommeDurees}, duree_s: ${timeline.duree_s})`);
  });

  test('repères convertis en décalage', async () => {
    const manifest = await chargerFixture('manifest-session1.json');
    const donnees = await chargerFixture('donnees-session1.json');

    const timeline = calculerTimeline(manifest, donnees);

    assert.ok(Array.isArray(timeline.reperes));
    assert.ok(timeline.reperes.length > 0);

    // Vérifier que les repères ont un décalage en secondes
    for (const repere of timeline.reperes) {
      assert.ok(typeof repere.t_s === 'number');
      assert.ok(repere.t_s >= 0);
    }
  });

  test('validation du schéma', async () => {
    const manifest = await chargerFixture('manifest-session1.json');
    const donnees = await chargerFixture('donnees-session1.json');

    // Ne devrait pas lancer d'erreur
    const timeline = calculerTimeline(manifest, donnees);
    assert.ok(timeline);
  });

  test('extraits de texte limités à 300 caractères', async () => {
    const manifest = await chargerFixture('manifest-session1.json');
    const donnees = await chargerFixture('donnees-session1.json');

    const timeline = calculerTimeline(manifest, donnees);

    for (const extrait of timeline.extraits_texte) {
      assert.ok(extrait.texte.length <= 300);
    }
  });

  test('filtre les frames du panneau de contrôle', async () => {
    const { MARQUEUR_PANNEAU } = await import('./config.js');
    const manifest = await chargerFixture('manifest-session1.json');
    const donnees = await chargerFixture('donnees-session1.json');

    // Ajouter une frame avec le marqueur dans window_name
    const framesAvecPanneau = [
      ...donnees.frames,
      {
        content: {
          timestamp: '2026-10-18T14:03:00Z',
          app_name: 'Google Chrome',
          window_name: `Contrôle ${MARQUEUR_PANNEAU}`,
          text: 'Panneau de contrôle'
        }
      }
    ];

    const donneesAvecPanneau = { ...donnees, frames: framesAvecPanneau };
    const timeline = calculerTimeline(manifest, donneesAvecPanneau);

    // Vérifier qu'aucune fenêtre ne contient le marqueur
    for (const fenetre of timeline.fenetres) {
      assert.ok(!fenetre.fenetre.includes(MARQUEUR_PANNEAU),
        `La fenêtre "${fenetre.fenetre}" ne devrait pas être dans la timeline`);
    }

    // Vérifier qu'aucun extrait ne contient le marqueur
    for (const extrait of timeline.extraits_texte) {
      assert.ok(!extrait.app.includes(MARQUEUR_PANNEAU));
      assert.ok(!extrait.texte.includes('Panneau de contrôle'));
    }
  });
});
