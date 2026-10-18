import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validerPreuves, validerComparaison } from './preuves.js';

const timeline = {
  duree_s: 460,
  fenetres: [{ app: 'Chrome', fenetre: 'Deck', debut_s: 0, fin_s: 95, duree_s: 95, prevue: true }],
  hors_cadre: [{ app: 'Slack', fenetre: 'general', debut_s: 140, fin_s: 152, duree_s: 12 }],
  silences: [{ debut_s: 201, fin_s: 205, duree_s: 4 }],
  reperes: [{ t_s: 140, type: 'blocage', texte: '' }],
  duree_live_s: 330,
  parole: { duree_s: 290, mots: 640, mots_par_min: 132 }
};

const constat = (source, t_s) => ({
  constats: [{ titre: 'X', detail: '', gravite: 'info', preuve: { source, t_s } }]
});

describe('validerPreuves', () => {
  test('accepte un instant dans un intervalle hors cadre', () => {
    assert.deepEqual(validerPreuves(constat('hors_cadre', 145), timeline), []);
  });

  test('accepte un repère exact', () => {
    assert.deepEqual(validerPreuves(constat('reperes', 140), timeline), []);
  });

  test('rejette un instant sans entrée correspondante', () => {
    assert.equal(validerPreuves(constat('silences', 300), timeline).length, 1);
  });

  test('rejette une source inconnue', () => {
    assert.equal(validerPreuves(constat('inventee', 10), timeline).length, 1);
  });

  test('rejette une source héritée de Object (constructor)', () => {
    assert.equal(validerPreuves(constat('constructor', 10), timeline).length, 1);
  });

  test('source non liste : t_s doit tomber dans la session', () => {
    assert.deepEqual(validerPreuves(constat('parole', 100), timeline), []);
    assert.equal(validerPreuves(constat('parole', 9999), timeline).length, 1);
  });
});

describe('validerComparaison', () => {
  const precedente = { ...timeline, duree_live_s: 410, parole: { ...timeline.parole, mots_par_min: 120 } };
  const rapport = deltas => ({ comparaison: { avec: 's00', deltas } });

  test('accepte des valeurs reprises exactement', () => {
    const r = rapport([
      { mesure: 'duree_live_s', avant: 410, apres: 330 },
      { mesure: 'parole.mots_par_min', avant: 120, apres: 132 }
    ]);
    assert.deepEqual(validerComparaison(r, timeline, precedente), []);
  });

  test('rejette une valeur arrondie ou inventée', () => {
    const r = rapport([{ mesure: 'duree_live_s', avant: 400, apres: 330 }]);
    assert.equal(validerComparaison(r, timeline, precedente).length, 1);
  });

  test('rejette une mesure absente', () => {
    const r = rapport([{ mesure: 'mesure_inconnue', avant: 1, apres: 2 }]);
    assert.equal(validerComparaison(r, timeline, precedente).length, 1);
  });

  test('première session : comparaison doit être null', () => {
    assert.equal(validerComparaison(rapport([]), timeline, null).length, 1);
    assert.deepEqual(validerComparaison({ comparaison: null }, timeline, null), []);
  });
});
