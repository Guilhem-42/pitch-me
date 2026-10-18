#!/usr/bin/env node

/**
 * Script de test pour générer un rapport à partir des fixtures
 * Simule une session complète sans avoir besoin de vraies données Screenpipe
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculerTimeline } from './timeline.js';
import { genererRapport } from './report.js';
import { CONFIG } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function chargerFixture(nom) {
  const path = join(__dirname, '__fixtures__', nom);
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content);
}

async function main() {
  console.log('🧪 Test de génération de rapport avec fixtures\n');

  // Charger les fixtures
  const manifest = await chargerFixture('manifest-session1.json');
  const donnees = await chargerFixture('donnees-session1.json');

  console.log('📊 Calcul de la timeline...');
  const timeline = calculerTimeline(manifest, donnees);

  console.log(`✅ Timeline calculée`);
  console.log(`   - Durée totale: ${timeline.duree_s}s`);
  console.log(`   - Durée live: ${timeline.duree_live_s}s`);
  console.log(`   - Fenêtres hors cadre: ${timeline.hors_cadre.length}`);
  console.log(`   - Extraits de texte: ${timeline.extraits_texte.length}`);

  // Afficher les extraits pour voir si "Take" est présent
  console.log('\n📝 Extraits de texte:');
  timeline.extraits_texte.slice(0, 5).forEach(e => {
    console.log(`   ${e.t_s}s [${e.app}]: ${e.texte.substring(0, 50)}...`);
  });

  // Générer le rapport
  console.log('\n🤖 Génération du rapport via LLM...');

  if (!CONFIG.ANTHROPIC_API_KEY) {
    console.error('\n❌ ANTHROPIC_API_KEY manquante dans .env');
    console.log('Définir ANTHROPIC_API_KEY pour tester la génération du rapport');
    process.exit(1);
  }

  if (!CONFIG.ANTHROPIC_MODEL) {
    console.error('\n❌ ANTHROPIC_MODEL manquante dans .env');
    console.log('Définir ANTHROPIC_MODEL (ex: claude-sonnet-4-5-20250929)');
    process.exit(1);
  }

  console.log(`   Modèle: ${CONFIG.ANTHROPIC_MODEL}`);

  // Créer un dossier temporaire pour le test
  const testDir = join(__dirname, '__fixtures__', 'test-output');
  await mkdir(testDir, { recursive: true });

  const rapport = await genererRapport(
    manifest,
    timeline,
    join(__dirname, '__fixtures__'), // sessionsDir pour chercher session précédente
    CONFIG.ANTHROPIC_API_KEY,
    CONFIG.ANTHROPIC_MODEL
  );

  // Sauvegarder le rapport
  await writeFile(
    join(testDir, 'report.json'),
    JSON.stringify(rapport, null, 2),
    'utf-8'
  );

  console.log(`\n✅ Rapport généré\n`);

  // Afficher le résumé
  console.log('📋 RÉSUMÉ');
  console.log('─'.repeat(60));
  console.log(rapport.resume);
  console.log();

  console.log('🎯 VERDICT:', rapport.objectif_atteint.verdict.toUpperCase());
  console.log(rapport.objectif_atteint.justification);
  console.log();

  if (rapport.constats.length > 0) {
    console.log('⚠️  CONSTATS (' + rapport.constats.length + ')');
    console.log('─'.repeat(60));
    rapport.constats.forEach((c, i) => {
      const icon = c.gravite === 'bloquant' ? '🔴' : c.gravite === 'attention' ? '🟡' : '🔵';
      console.log(`${icon} ${c.titre}`);
      console.log(`   ${c.detail}`);
      console.log(`   Preuve: ${c.preuve.source} à ${c.preuve.t_s}s`);
      if (i < rapport.constats.length - 1) console.log();
    });
    console.log();
  }

  if (rapport.recommandations.length > 0) {
    console.log('💡 RECOMMANDATIONS (' + rapport.recommandations.length + ')');
    console.log('─'.repeat(60));
    rapport.recommandations.forEach(r => {
      const prio = r.priorite === 1 ? '🔴 P1' : r.priorite === 2 ? '🟡 P2' : '🟢 P3';
      console.log(`${prio} ${r.texte}`);
    });
    console.log();
  }

  if (rapport.todo_detectes.length > 0) {
    console.log('📌 TODOs DÉTECTÉS (' + rapport.todo_detectes.length + ')');
    console.log('─'.repeat(60));
    rapport.todo_detectes.forEach(t => {
      console.log(`• ${t.texte} (source: ${t.source})`);
    });
    console.log();
  } else {
    console.log('⚠️  AUCUN TODO DÉTECTÉ');
    console.log('─'.repeat(60));
    console.log('Le LLM n\'a pas détecté l\'incohérence "Take" vs "Pitch-Me"');
    console.log('dans les extraits de texte.');
    console.log('\n💡 Le prompt dans prompts/analyste.md devrait être amélioré.');
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

  console.log(`Rapport complet sauvegardé dans: ${join(testDir, 'report.json')}`);
}

main().catch(err => {
  console.error('\n❌ Erreur:', err.message);
  if (process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});
