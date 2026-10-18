#!/usr/bin/env node

/**
 * Script de test pour exécuter une session complète automatiquement
 * Utilise des données fictives pour tester sans vraiment capturer
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG } from './config.js';
import {
  genererIdSession,
  creerDossierSession,
  ecrireManifeste
} from './manifest.js';
import { calculerTimeline } from './timeline.js';
import { genererRapport } from './report.js';

async function chargerFixture(nom) {
  const path = join(import.meta.dirname, '__fixtures__', nom);
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content);
}

async function main() {
  console.log('🧪 Test de session complète avec données fictives\n');

  // Créer une nouvelle session
  const id = await genererIdSession(CONFIG.SESSIONS_DIR);
  const sessionDir = join(CONFIG.SESSIONS_DIR, id);

  console.log(`📝 Création de la session ${id}...`);
  await creerDossierSession(sessionDir);
  await creerDossierSession(join(sessionDir, 'screenpipe'));

  // Créer le manifeste avec toutes les infos
  const manifest = {
    id,
    titre: "Test pitch - wrapper Pitch-Me",
    objectif: "Présenter le wrapper en 5 minutes sans sortir du cadre",
    criteres: [
      "durée entre 4 et 6 minutes",
      "aucune fenêtre hors cadre"
    ],
    duree_cible_s: 300,
    fenetres_prevues: [
      { app: "Google Chrome", motif: "deck en plein écran" },
      { app: "zoom.us", motif: "visio" }
    ],
    audio: true,
    session_precedente: null,
    checklist: [
      { id: "c1", texte: "Fermer les notifications", fait: false }
    ],
    reperes: [
      { t: "2026-10-18T14:03:12Z", type: "blocage", texte: "Problème de connexion" }
    ],
    debut: "2026-10-18T14:00:00Z",
    pret: "2026-10-18T14:02:10Z",
    fin: "2026-10-18T14:07:40Z",
    statut: "termine"
  };

  await ecrireManifeste(sessionDir, manifest);
  console.log('✅ Manifeste créé');

  // Utiliser les données des fixtures
  console.log('\n📊 Calcul de la timeline...');
  const donnees = await chargerFixture('donnees-session1.json');
  const timeline = calculerTimeline(manifest, donnees);

  // Sauvegarder la timeline
  await writeFile(
    join(sessionDir, 'timeline.json'),
    JSON.stringify(timeline, null, 2),
    'utf-8'
  );

  console.log('✅ Timeline calculée et sauvegardée');
  console.log(`   - Durée totale: ${timeline.duree_s}s`);
  console.log(`   - Durée live: ${timeline.duree_live_s}s`);
  console.log(`   - Changements de fenêtre: ${timeline.changements_fenetre}`);
  console.log(`   - Fenêtres hors cadre: ${timeline.hors_cadre.length}`);

  // Générer le rapport
  console.log('\n🤖 Génération du rapport via LLM...');

  if (!CONFIG.ANTHROPIC_API_KEY) {
    console.error('\n❌ ANTHROPIC_API_KEY manquante dans .env');
    console.log('\n⚠️  Le rapport ne peut pas être généré sans clé API.');
    console.log('Session créée : ' + id);
    console.log('Timeline sauvegardée, mais pas de rapport.');
    console.log('\nPour compléter :');
    console.log('1. Configurer .env avec ANTHROPIC_API_KEY et ANTHROPIC_MODEL');
    console.log(`2. Lancer: node src/cli.js report ${id}`);
    process.exit(0);
  }

  if (!CONFIG.ANTHROPIC_MODEL) {
    console.error('\n❌ ANTHROPIC_MODEL manquante dans .env');
    process.exit(1);
  }

  console.log(`   Modèle: ${CONFIG.ANTHROPIC_MODEL}`);

  const rapport = await genererRapport(
    manifest,
    timeline,
    CONFIG.SESSIONS_DIR,
    CONFIG.ANTHROPIC_API_KEY,
    CONFIG.ANTHROPIC_MODEL
  );

  // Sauvegarder le rapport
  await writeFile(
    join(sessionDir, 'report.json'),
    JSON.stringify(rapport, null, 2),
    'utf-8'
  );

  console.log('✅ Rapport généré et sauvegardé\n');

  // Afficher le résumé
  console.log('═'.repeat(60));
  console.log('📋 RÉSUMÉ DE LA SESSION');
  console.log('═'.repeat(60));
  console.log();
  console.log(rapport.resume);
  console.log();

  console.log('🎯 VERDICT:', rapport.objectif_atteint.verdict.toUpperCase());
  console.log('─'.repeat(60));
  console.log(rapport.objectif_atteint.justification);
  console.log();

  if (rapport.constats.length > 0) {
    console.log('⚠️  CONSTATS (' + rapport.constats.length + ')');
    console.log('─'.repeat(60));
    rapport.constats.forEach((c, i) => {
      const icon = c.gravite === 'bloquant' ? '🔴' : c.gravite === 'attention' ? '🟡' : '🔵';
      console.log(`\n${icon} ${c.titre} [${c.gravite}]`);
      console.log(`   ${c.detail}`);
      console.log(`   📍 Preuve: ${c.preuve.source} à ${c.preuve.t_s}s`);
    });
    console.log();
  }

  if (rapport.recommandations.length > 0) {
    console.log('💡 RECOMMANDATIONS (' + rapport.recommandations.length + ')');
    console.log('─'.repeat(60));
    rapport.recommandations
      .sort((a, b) => a.priorite - b.priorite)
      .forEach(r => {
        const prio = r.priorite === 1 ? '🔴 P1' : r.priorite === 2 ? '🟡 P2' : '🟢 P3';
        console.log(`${prio} ${r.texte}`);
      });
    console.log();
  }

  if (rapport.todo_detectes.length > 0) {
    console.log('✅ TODOs DÉTECTÉS (' + rapport.todo_detectes.length + ')');
    console.log('─'.repeat(60));
    rapport.todo_detectes.forEach(t => {
      console.log(`📌 ${t.texte}`);
      console.log(`   Source: ${t.source}`);
    });
    console.log();
  } else {
    console.log('❌ AUCUN TODO DÉTECTÉ');
    console.log('─'.repeat(60));
    console.log('Le LLM n\'a pas détecté l\'incohérence "Take" vs "Pitch-Me"');
    console.log('dans les extraits de texte malgré le prompt amélioré.');
    console.log();
  }

  if (rapport.incertitudes.length > 0) {
    console.log('❓ INCERTITUDES');
    console.log('─'.repeat(60));
    rapport.incertitudes.forEach(i => {
      console.log(`• ${i}`);
    });
    console.log();
  }

  console.log('═'.repeat(60));
  console.log(`Session complète : ${id}`);
  console.log(`Dashboard : node src/cli.js serve`);
  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('\n❌ Erreur:', err.message);
  if (process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});
