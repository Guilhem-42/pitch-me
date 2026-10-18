#!/usr/bin/env node

import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { CONFIG, validerConfig } from './config.js';
import {
  genererIdSession,
  creerManifeste,
  creerDossierSession,
  lireManifeste,
  ecrireManifeste,
  ajouterRepere
} from './manifest.js';
import {
  lancerScreenpipe,
  ecrirePid,
  lirePid,
  arreterScreenpipe,
  supprimerPid,
  processusEnVie
} from './screenpipe-process.js';
import { recupererDonneesSession } from './screenpipe.js';
import { calculerTimeline } from './timeline.js';
import { genererRapport } from './report.js';
import { demarrerServeur } from './server.js';
import { writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COMMANDES = ['new', 'start', 'ready', 'mark', 'stop', 'report', 'serve', 'next', 'dupliquer'];

/**
 * Affiche l'aide
 */
function afficherAide() {
  console.log(`
Usage: node src/cli.js <commande> [arguments]

Commandes:
  new <titre>              Crée une nouvelle session
  start <id>               Lance la capture (phase préparation)
  ready <id>               Pose le repère "prêt" (début du live)
  mark <id> <type> [texte] Pose un repère
  stop <id>                Arrête la capture
  report <id>              Calcule la timeline et produit le rapport
  serve                    Sert le dashboard
  next <id>                Crée la session suivante
  dupliquer <id>           Duplique une session (depuis n'importe quel statut)

Types de repères: pret, blocage, ok, note
  `);
}

/**
 * Demande confirmation à l'utilisateur
 * @param {string} question - Question à poser
 * @returns {Promise<boolean>} true si confirmation
 */
async function demanderConfirmation(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${question} (o/N) `, (reponse) => {
      rl.close();
      resolve(reponse.toLowerCase() === 'o');
    });
  });
}

/**
 * Commande: new <titre>
 */
async function commandeNew(args) {
  if (args.length === 0) {
    console.error('Erreur: titre manquant');
    console.log('Usage: new <titre>');
    process.exit(1);
  }

  const titre = args.join(' ');
  const id = await genererIdSession(CONFIG.SESSIONS_DIR);
  const sessionDir = join(CONFIG.SESSIONS_DIR, id);

  await creerDossierSession(sessionDir);
  await creerDossierSession(join(sessionDir, 'screenpipe'));

  const manifest = creerManifeste(id, titre);
  await ecrireManifeste(sessionDir, manifest);

  console.log(`✅ Session créée: ${id}`);
  console.log(`📁 Dossier: ${sessionDir}`);
  console.log(`\n📝 Prochaines étapes:`);
  console.log(`1. Éditer ${join(sessionDir, 'manifest.json')} pour renseigner:`);
  console.log(`   - objectif`);
  console.log(`   - criteres`);
  console.log(`   - fenetres_prevues`);
  console.log(`   - audio (true/false)`);
  console.log(`2. Lancer: node src/cli.js start ${id}`);
}

/**
 * Commande: start <id>
 */
async function commandeStart(args) {
  validerConfig(false, true);

  if (args.length === 0) {
    console.error('Erreur: ID de session manquant');
    console.log('Usage: start <id>');
    process.exit(1);
  }

  const id = args[0];
  const sessionDir = join(CONFIG.SESSIONS_DIR, id);
  const manifest = await lireManifeste(sessionDir);

  if (manifest.statut !== 'preparation') {
    console.error(`Erreur: la session est déjà en cours ou terminée (statut: ${manifest.statut})`);
    process.exit(1);
  }

  // Afficher l'objectif et demander confirmation
  console.log(`\n📋 Session: ${manifest.titre}`);
  console.log(`🎯 Objectif: ${manifest.objectif || '(non renseigné)'}`);
  console.log(`\n📹 Capture:`);
  console.log(`   - Écran: oui`);
  console.log(`   - Audio: ${manifest.audio ? 'oui' : 'non'}`);
  console.log(`\n⚠️  La capture va démarrer. Assurez-vous d'avoir fermé les fenêtres sensibles.`);

  const confirmation = await demanderConfirmation('\nDémarrer la capture ?');
  if (!confirmation) {
    console.log('❌ Annulé');
    process.exit(0);
  }

  // Lancer Screenpipe
  console.log('\n🚀 Démarrage de Screenpipe...');
  const dataDir = join(sessionDir, 'screenpipe');
  const pid = await lancerScreenpipe(
    dataDir,
    CONFIG.SCREENPIPE_PORT,
    CONFIG.SCREENPIPE_API_KEY,
    !manifest.audio
  );

  await ecrirePid(sessionDir, pid);

  // Mettre à jour le manifeste
  manifest.debut = new Date().toISOString();
  manifest.statut = 'live';
  await ecrireManifeste(sessionDir, manifest);

  console.log(`✅ Capture démarrée (PID: ${pid})`);
  console.log(`📊 API: http://localhost:${CONFIG.SCREENPIPE_PORT}`);
  console.log(`\n⏭️  Prochaine étape: node src/cli.js ready ${id}`);
  console.log(`   (quand vous êtes prêt à commencer le live)`);
}

/**
 * Commande: ready <id>
 */
async function commandeReady(args) {
  if (args.length === 0) {
    console.error('Erreur: ID de session manquant');
    console.log('Usage: ready <id>');
    process.exit(1);
  }

  const id = args[0];
  const sessionDir = join(CONFIG.SESSIONS_DIR, id);
  const manifest = await lireManifeste(sessionDir);

  if (manifest.statut !== 'live' || manifest.pret !== null) {
    console.error('Erreur: la session doit être en cours et sans repère "prêt"');
    process.exit(1);
  }

  manifest.pret = new Date().toISOString();
  await ecrireManifeste(sessionDir, manifest);

  console.log(`✅ Repère "prêt" posé`);
  console.log(`🎬 Début du live`);
  console.log(`\n💡 Pendant le live, vous pouvez poser des repères:`);
  console.log(`   node src/cli.js mark ${id} blocage "je n'arrive pas à..."`);
  console.log(`   node src/cli.js mark ${id} ok "ça fonctionne"`);
}

/**
 * Commande: mark <id> <type> [texte]
 */
async function commandeMark(args) {
  if (args.length < 2) {
    console.error('Erreur: arguments manquants');
    console.log('Usage: mark <id> <type> [texte]');
    console.log('Types: pret, blocage, ok, note');
    process.exit(1);
  }

  const id = args[0];
  const type = args[1];
  const texte = args.slice(2).join(' ');

  const types = ['pret', 'blocage', 'ok', 'note'];
  if (!types.includes(type)) {
    console.error(`Erreur: type invalide. Types acceptés: ${types.join(', ')}`);
    process.exit(1);
  }

  const sessionDir = join(CONFIG.SESSIONS_DIR, id);
  const manifest = await lireManifeste(sessionDir);

  const updated = ajouterRepere(manifest, type, texte);
  await ecrireManifeste(sessionDir, updated);

  console.log(`✅ Repère "${type}" posé${texte ? ': ' + texte : ''}`);
}

/**
 * Commande: stop <id>
 */
async function commandeStop(args) {
  if (args.length === 0) {
    console.error('Erreur: ID de session manquant');
    console.log('Usage: stop <id>');
    process.exit(1);
  }

  const id = args[0];
  const sessionDir = join(CONFIG.SESSIONS_DIR, id);
  const manifest = await lireManifeste(sessionDir);

  if (manifest.statut === 'termine') {
    console.error('Erreur: la session est déjà terminée');
    process.exit(1);
  }

  // Lire le PID et arrêter le processus
  const pid = await lirePid(sessionDir);
  if (pid) {
    if (processusEnVie(pid)) {
      console.log(`🛑 Arrêt de Screenpipe (PID: ${pid})...`);
      await arreterScreenpipe(pid);
      console.log('✅ Screenpipe arrêté');
    } else {
      console.log(`⚠️  Le processus ${pid} n'est plus en vie`);
    }
    await supprimerPid(sessionDir);
  } else {
    console.log('⚠️  Aucun PID trouvé (capture peut-être déjà arrêtée)');
  }

  // Mettre à jour le manifeste
  manifest.fin = new Date().toISOString();
  manifest.statut = 'termine';
  await ecrireManifeste(sessionDir, manifest);

  console.log(`✅ Session terminée`);
  console.log(`\n⏭️  Prochaine étape: node src/cli.js report ${id}`);
}

/**
 * Commande: report <id>
 */
async function commandeReport(args) {
  validerConfig(true, true); // Nécessite les deux clés API

  if (args.length === 0) {
    console.error('Erreur: ID de session manquant');
    console.log('Usage: report <id>');
    process.exit(1);
  }

  const id = args[0];
  const sessionDir = join(CONFIG.SESSIONS_DIR, id);
  const manifest = await lireManifeste(sessionDir);

  if (manifest.statut !== 'termine') {
    console.error('Erreur: la session doit être terminée avant de générer le rapport');
    console.log('Utilisez "stop" pour terminer la session');
    process.exit(1);
  }

  console.log(`\n📊 Calcul de la timeline pour ${id}...`);

  // Récupérer les données depuis l'API Screenpipe
  // Note: l'instance dédiée doit toujours tourner pour accéder aux données
  const donnees = await recupererDonneesSession(
    manifest.debut,
    manifest.fin,
    CONFIG.SCREENPIPE_PORT,
    CONFIG.SCREENPIPE_API_KEY
  );

  console.log(`   - Frames récupérées: ${donnees.frames.length}`);
  console.log(`   - Audio récupérés: ${donnees.audio.length}`);

  // Calculer la timeline
  const timeline = calculerTimeline(manifest, donnees);

  // Écrire timeline.json
  const timelinePath = join(sessionDir, 'timeline.json');
  await writeFile(timelinePath, JSON.stringify(timeline, null, 2), 'utf-8');

  console.log(`✅ Timeline calculée et sauvegardée`);
  console.log(`   - Durée totale: ${timeline.duree_s}s`);
  console.log(`   - Durée live: ${timeline.duree_live_s}s`);
  console.log(`   - Changements de fenêtre: ${timeline.changements_fenetre}`);
  console.log(`   - Fenêtres hors cadre: ${timeline.hors_cadre.length}`);

  // Générer le rapport via LLM
  console.log(`\n🤖 Génération du rapport via LLM...`);
  const rapport = await genererRapport(
    manifest,
    timeline,
    CONFIG.SESSIONS_DIR,
    CONFIG.ANTHROPIC_API_KEY,
    CONFIG.ANTHROPIC_MODEL
  );

  // Écrire report.json
  const reportPath = join(sessionDir, 'report.json');
  await writeFile(reportPath, JSON.stringify(rapport, null, 2), 'utf-8');

  console.log(`✅ Rapport généré et sauvegardé`);
  console.log(`   - Verdict: ${rapport.objectif_atteint.verdict}`);
  console.log(`   - Constats: ${rapport.constats.length}`);
  console.log(`   - Recommandations: ${rapport.recommandations.length}`);

  // Mettre à jour le statut
  manifest.statut = 'analyse';
  await ecrireManifeste(sessionDir, manifest);

  console.log(`\n⏭️  Prochaine étape: node src/cli.js serve`);
}

/**
 * Commande: serve
 */
async function commandeServe() {
  const port = 3000;
  const webDir = join(__dirname, '..', 'web');

  console.log(`\n🚀 Démarrage du serveur dashboard...`);
  demarrerServeur(port, webDir, CONFIG.SESSIONS_DIR);

  // Bloquer l'exécution
  await new Promise(() => {});
}

/**
 * Commande: next <id>
 */
async function commandeNext(args) {
  if (args.length === 0) {
    console.error('Erreur: ID de session manquant');
    console.log('Usage: next <id>');
    process.exit(1);
  }

  const idPrecedent = args[0];
  const sessionDirPrecedente = join(CONFIG.SESSIONS_DIR, idPrecedent);

  // Lire le rapport de la session précédente
  let reportPrecedent;
  try {
    const reportPath = join(sessionDirPrecedente, 'report.json');
    const content = await readFile(reportPath, 'utf-8');
    reportPrecedent = JSON.parse(content);
  } catch {
    console.error('Erreur: la session précédente doit avoir un rapport');
    console.log('Utilisez "report" pour générer le rapport');
    process.exit(1);
  }

  // Lire le manifeste précédent pour récupérer le titre
  const manifestPrecedent = await lireManifeste(sessionDirPrecedente);

  // Générer un nouveau titre
  const titre = `${manifestPrecedent.titre} (suite)`;

  // Créer la nouvelle session
  const id = await genererIdSession(CONFIG.SESSIONS_DIR);
  const sessionDir = join(CONFIG.SESSIONS_DIR, id);

  await creerDossierSession(sessionDir);
  await creerDossierSession(join(sessionDir, 'screenpipe'));

  // Créer le manifeste en reprenant la checklist du rapport précédent
  const manifest = {
    ...creerManifeste(id, titre),
    objectif: manifestPrecedent.objectif,
    criteres: manifestPrecedent.criteres,
    duree_cible_s: manifestPrecedent.duree_cible_s,
    fenetres_prevues: manifestPrecedent.fenetres_prevues,
    audio: manifestPrecedent.audio,
    session_precedente: idPrecedent,
    checklist: reportPrecedent.checklist_suivante
  };

  await ecrireManifeste(sessionDir, manifest);

  console.log(`✅ Session suivante créée: ${id}`);
  console.log(`📁 Dossier: ${sessionDir}`);
  console.log(`🔗 Session précédente: ${idPrecedent}`);
  console.log(`\n📝 Checklist pré-remplie:`);
  reportPrecedent.checklist_suivante.forEach(item => {
    console.log(`   ☐ ${item.texte}`);
  });
  console.log(`\n⏭️  Prochaine étape: node src/cli.js start ${id}`);
}

/**
 * Commande: dupliquer <id>
 */
async function commandeDupliquer(args) {
  if (args.length === 0) {
    console.error('Erreur: ID de session manquant');
    console.log('Usage: dupliquer <id>');
    process.exit(1);
  }

  const idSource = args[0];
  const sessionDirSource = join(CONFIG.SESSIONS_DIR, idSource);

  // Lire le manifeste source
  const manifestSource = await lireManifeste(sessionDirSource);

  // Créer la copie
  const titre = `${manifestSource.titre} (copie)`;
  const id = await genererIdSession(CONFIG.SESSIONS_DIR);
  const sessionDir = join(CONFIG.SESSIONS_DIR, id);

  await creerDossierSession(sessionDir);
  await creerDossierSession(join(sessionDir, 'screenpipe'));

  // Créer le manifeste en copiant les champs appropriés
  const manifest = {
    ...creerManifeste(id, titre),
    objectif: manifestSource.objectif,
    criteres: manifestSource.criteres,
    duree_cible_s: manifestSource.duree_cible_s,
    fenetres_prevues: manifestSource.fenetres_prevues,
    audio: manifestSource.audio,
    session_precedente: manifestSource.session_precedente,
    guide: manifestSource.guide,
    contexte: manifestSource.contexte ? {
      ...manifestSource.contexte,
      date_prevue: null
    } : null,
    // Checklist avec tous les rappels décochés
    checklist: manifestSource.checklist.map(item => ({
      ...item,
      fait: false
    }))
  };

  await ecrireManifeste(sessionDir, manifest);

  console.log(`✅ Session dupliquée: ${id}`);
  console.log(`📁 Dossier: ${sessionDir}`);
  console.log(`🔗 Session source: ${idSource}`);
  console.log(`\n📝 Checklist copiée (${manifest.checklist.length} rappels, tous décochés)`);
  console.log(`\n⏭️  Prochaine étape: node src/cli.js start ${id}`);
}

/**
 * Point d'entrée
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
    afficherAide();
    process.exit(0);
  }

  const commande = args[0];
  const commandeArgs = args.slice(1);

  if (!COMMANDES.includes(commande)) {
    console.error(`Erreur: commande inconnue: ${commande}`);
    afficherAide();
    process.exit(1);
  }

  try {
    switch (commande) {
      case 'new':
        await commandeNew(commandeArgs);
        break;
      case 'start':
        await commandeStart(commandeArgs);
        break;
      case 'ready':
        await commandeReady(commandeArgs);
        break;
      case 'mark':
        await commandeMark(commandeArgs);
        break;
      case 'stop':
        await commandeStop(commandeArgs);
        break;
      case 'report':
        await commandeReport(commandeArgs);
        break;
      case 'serve':
        await commandeServe();
        break;
      case 'next':
        await commandeNext(commandeArgs);
        break;
      case 'dupliquer':
        await commandeDupliquer(commandeArgs);
        break;
    }
  } catch (err) {
    console.error(`\n❌ Erreur: ${err.message}`);
    if (err.stack && process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
