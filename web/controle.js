import { etatGuide } from '/guide.js';

// État global
let state = {
  token: null,
  sessionId: null,
  sessions: [],
  manifest: null,
  etat: null,
  chronoInterval: null,
  guideEtat: null
};

// API client
async function api(method, path, body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (state.token && (method === 'POST' || method === 'PATCH')) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const options = {
    method,
    headers
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(path, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Erreur API');
  }

  return data;
}

// UI helpers
function showView(viewId) {
  document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById(viewId).classList.remove('hidden');
}

function showError(message) {
  const el = document.getElementById('error');
  el.textContent = message;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

function hideError() {
  document.getElementById('error').classList.add('hidden');
}

// Formatage du temps
function formatTime(seconds) {
  const mins = Math.floor(Math.abs(seconds) / 60);
  const secs = Math.floor(Math.abs(seconds) % 60);
  const sign = seconds < 0 ? '-' : '';
  return `${sign}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Initialisation
async function init() {
  try {
    // Récupérer le jeton
    const { token } = await api('GET', '/api/token');
    state.token = token;

    // Charger les sessions
    await loadSessions();

    // Attacher les événements
    attachEvents();

    // Polling de l'état si une session est active
    setInterval(pollState, 2000);
  } catch (err) {
    showError(err.message);
  }
}

// Charger la liste des sessions
async function loadSessions() {
  try {
    state.sessions = await api('GET', '/api/sessions');
    renderSessionList();
    showView('view-select');
  } catch (err) {
    showError(err.message);
  }
}

// Rendre la liste des sessions
function renderSessionList() {
  const list = document.getElementById('session-list');
  list.innerHTML = '';

  const prepSessions = state.sessions.filter(s => s.statut === 'preparation' || s.statut === 'live' || s.statut === 'termine');

  if (prepSessions.length === 0) {
    list.innerHTML = '<p style="color: #999;">Aucune session</p>';
    return;
  }

  prepSessions.forEach(session => {
    const item = document.createElement('div');
    item.className = 'session-item';
    if (session.id === state.sessionId) {
      item.classList.add('active');
    }

    item.innerHTML = `
      <div style="font-weight: 600;">${session.titre}</div>
      <div style="font-size: 12px; color: #666;">${session.id} · ${session.statut}</div>
    `;

    item.addEventListener('click', () => selectSession(session.id));
    list.appendChild(item);
  });
}

// Sélectionner une session
async function selectSession(id) {
  try {
    state.sessionId = id;
    const data = await api('GET', `/api/session/${id}`);
    state.manifest = data.manifest;

    renderSessionList();
    renderCurrentView();
  } catch (err) {
    showError(err.message);
  }
}

// Rendre la vue courante selon le statut
function renderCurrentView() {
  const statut = state.manifest.statut;

  if (statut === 'preparation') {
    renderPrep();
  } else if (statut === 'live' && !state.manifest.pret) {
    renderLiveBefore();
  } else if (statut === 'live' && state.manifest.pret) {
    renderLiveAfter();
  } else if (statut === 'termine') {
    renderDone();
  }
}

// Vue préparation
function renderPrep() {
  document.getElementById('prep-titre').textContent = state.manifest.titre;
  document.getElementById('prep-objectif').textContent = state.manifest.objectif || '(non renseigné)';
  document.getElementById('prep-duree').textContent = state.manifest.duree_cible_s
    ? `${Math.floor(state.manifest.duree_cible_s / 60)} minutes`
    : '(non renseigné)';

  // Checklist
  const checklist = document.getElementById('prep-checklist');
  checklist.innerHTML = '';

  if (state.manifest.checklist && state.manifest.checklist.length > 0) {
    state.manifest.checklist.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'checkbox-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.fait;
      checkbox.id = `check-${index}`;
      checkbox.addEventListener('change', () => toggleCheck(index));

      const label = document.createElement('label');
      label.htmlFor = `check-${index}`;
      label.textContent = item.texte;

      div.appendChild(checkbox);
      div.appendChild(label);
      checklist.appendChild(div);
    });
  } else {
    checklist.innerHTML = '<p style="color: #999;">Aucun rappel</p>';
  }

  // Guide
  if (state.manifest.guide) {
    // Charger les points
    const pointsTexte = state.manifest.guide.points.map(p => {
      const mm = Math.floor(p.t_cible_s / 60);
      const ss = p.t_cible_s % 60;
      const prefix = p.important ? '!' : '';
      return `${prefix}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')} ${p.titre}`;
    }).join('\n');
    document.getElementById('guide-points').value = pointsTexte;

    // Charger les rappels
    document.getElementById('guide-rappels').value = state.manifest.guide.rappels_fin.join('\n');

    // Charger l'alerte
    document.getElementById('guide-alerte').value = state.manifest.guide.alerte_fin_s || 10;
  } else {
    // Vider les champs
    document.getElementById('guide-points').value = '';
    document.getElementById('guide-rappels').value = '';
    document.getElementById('guide-alerte').value = 10;
  }

  // Blockers
  const blockers = document.getElementById('prep-blockers');
  blockers.innerHTML = '';

  // Vérifier config
  if (!state.manifest.objectif || state.manifest.duree_cible_s === 0) {
    const indicator = document.createElement('div');
    indicator.className = 'indicator warning';
    indicator.innerHTML = `
      <span class="status-dot yellow"></span>
      <span>Objectif ou durée cible manquant dans le manifeste</span>
    `;
    blockers.appendChild(indicator);
  }

  showView('view-prep');
}

// Vue live avant prêt
function renderLiveBefore() {
  // Checklist restante
  const checklist = document.getElementById('live-checklist');
  checklist.innerHTML = '';

  const remaining = (state.manifest.checklist || []).filter(item => !item.fait);

  if (remaining.length > 0) {
    remaining.forEach(item => {
      const div = document.createElement('div');
      div.style.padding = '4px 0';
      div.innerHTML = `<span style="color: #dc3545;">•</span> ${item.texte}`;
      checklist.appendChild(div);
    });
  } else {
    checklist.innerHTML = '<p style="color: #28a745;">✓ Tous les rappels cochés</p>';
  }

  showView('view-live-before');
}

// Vue live après prêt
function renderLiveAfter() {
  // Démarrer le chrono
  if (!state.chronoInterval) {
    state.chronoInterval = setInterval(updateChrono, 1000);
  }

  updateChrono();
  updateGuide();

  const target = state.manifest.duree_cible_s
    ? `Cible : ${formatTime(state.manifest.duree_cible_s)}`
    : '';
  document.getElementById('chrono-target').textContent = target;

  showView('view-live-after');
}

// Mettre à jour le chrono
function updateChrono() {
  if (!state.manifest || !state.manifest.pret) return;

  const now = Date.now();
  const pret = new Date(state.manifest.pret).getTime();
  const elapsed = Math.floor((now - pret) / 1000);

  document.getElementById('chrono').textContent = formatTime(elapsed);
  updateGuide();
}

// Mettre à jour le guide
function updateGuide() {
  if (!state.manifest) return;

  const maintenant = new Date();
  state.guideEtat = etatGuide(state.manifest, maintenant);

  if (!state.guideEtat) {
    // Pas de guide
    document.getElementById('guide-progress').classList.add('hidden');
    document.getElementById('guide-point').classList.add('hidden');
    document.getElementById('guide-rappels').classList.add('hidden');
    return;
  }

  // Barre de progression
  const progressBar = document.getElementById('guide-progress-bar');
  const progressPercent = Math.min(state.guideEtat.progression * 100, 100);
  progressBar.style.width = `${progressPercent}%`;
  document.getElementById('guide-progress').classList.remove('hidden');

  // Point attendu
  if (state.guideEtat.pointAttendu) {
    document.getElementById('guide-point-titre').textContent = state.guideEtat.pointAttendu.titre;
    document.getElementById('guide-point').classList.remove('hidden');

    // Points en retard
    if (state.guideEtat.pointsEnRetard.length > 1) {
      const retard = `${state.guideEtat.pointsEnRetard.length} points en retard`;
      document.getElementById('guide-point-retard').textContent = retard;
      document.getElementById('guide-point-retard').classList.remove('hidden');
    } else {
      document.getElementById('guide-point-retard').classList.add('hidden');
    }
  } else {
    document.getElementById('guide-point').classList.add('hidden');
  }

  // Rappels de fin
  if (state.guideEtat.fenetreFinale && state.guideEtat.rappels_fin.length > 0) {
    const liste = document.getElementById('guide-rappels-liste');
    liste.innerHTML = '';
    state.guideEtat.rappels_fin.forEach(rappel => {
      const div = document.createElement('div');
      div.style.padding = '4px 0';
      div.style.fontSize = '14px';
      div.textContent = `• ${rappel}`;
      liste.appendChild(div);
    });
    document.getElementById('guide-rappels').classList.remove('hidden');
  } else {
    document.getElementById('guide-rappels').classList.add('hidden');
  }
}

// Vue terminée
function renderDone() {
  if (state.chronoInterval) {
    clearInterval(state.chronoInterval);
    state.chronoInterval = null;
  }

  showView('view-done');
}

// Cocher/décocher un rappel
async function toggleCheck(index) {
  try {
    // Note: cette route n'existe pas encore dans le lot A, on la crée dans le lot B
    // Pour l'instant, on simule juste localement
    state.manifest.checklist[index].fait = !state.manifest.checklist[index].fait;
    renderCurrentView();
  } catch (err) {
    showError(err.message);
  }
}

// Valider un point du guide
async function validerPoint(pointId) {
  try {
    await api('POST', '/api/mark', { id: state.sessionId, type: 'point', texte: pointId });
    // Recharger le manifeste pour mettre à jour les repères
    const data = await api('GET', `/api/session/${state.sessionId}`);
    state.manifest = data.manifest;
    updateGuide();
  } catch (err) {
    showError(err.message);
  }
}

// Polling de l'état
async function pollState() {
  if (!state.sessionId) return;

  try {
    const data = await api('GET', `/api/session/${state.sessionId}`);
    state.manifest = data.manifest;

    // Mettre à jour la vue si le statut a changé
    const currentView = Array.from(document.querySelectorAll('[id^="view-"]'))
      .find(el => !el.classList.contains('hidden'));

    if (currentView) {
      renderCurrentView();
    }
  } catch (err) {
    // Ignorer les erreurs de polling silencieusement
  }
}

// Événements
function attachEvents() {
  // Nouvelle session
  document.getElementById('btn-new').addEventListener('click', () => {
    showView('view-new');
  });

  document.getElementById('btn-cancel-new').addEventListener('click', () => {
    showView('view-select');
  });

  document.getElementById('btn-create').addEventListener('click', async () => {
    const titre = document.getElementById('new-titre').value.trim();
    if (!titre) {
      showError('Le titre est requis');
      return;
    }

    try {
      const manifest = await api('POST', '/api/sessions', { titre });
      state.sessionId = manifest.id;
      state.manifest = manifest;
      await loadSessions();
      renderCurrentView();
    } catch (err) {
      showError(err.message);
    }
  });

  // Préparation
  document.getElementById('btn-start-capture').addEventListener('click', async () => {
    if (!confirm('⚠️ La capture va démarrer. Assurez-vous d\'avoir fermé les fenêtres sensibles.\n\nDémarrer la capture ?')) {
      return;
    }

    try {
      await api('POST', '/api/start', { id: state.sessionId, consentement: true });
      const data = await api('GET', `/api/session/${state.sessionId}`);
      state.manifest = data.manifest;
      renderCurrentView();
    } catch (err) {
      showError(err.message);
    }
  });

  document.getElementById('btn-duplicate-prep').addEventListener('click', event => dupliquerAvecRetour(event.currentTarget));

  document.getElementById('btn-back-prep').addEventListener('click', () => {
    state.sessionId = null;
    state.manifest = null;
    showView('view-select');
  });

  // Guide
  document.getElementById('btn-save-guide').addEventListener('click', async () => {
    try {
      const pointsTexte = document.getElementById('guide-points').value.trim();
      const rappelsTexte = document.getElementById('guide-rappels').value.trim();
      const alerteFin = parseInt(document.getElementById('guide-alerte').value, 10);

      // Parser les points
      const points = [];
      if (pointsTexte) {
        const lignes = pointsTexte.split('\n').filter(l => l.trim());
        for (const ligne of lignes) {
          const match = ligne.match(/^(!?)(\d{1,2}):(\d{2})\s+(.+)$/);
          if (!match) {
            showError(`Format invalide : "${ligne}". Attendu : mm:ss titre`);
            return;
          }

          const important = match[1] === '!';
          const mm = parseInt(match[2], 10);
          const ss = parseInt(match[3], 10);
          const titre = match[4].trim();

          // Générer un id simple (slug du titre)
          const id = titre.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Retirer accents
            .replace(/[^a-z0-9]+/g, '-') // Remplacer espaces et caractères spéciaux
            .replace(/^-+|-+$/g, ''); // Retirer tirets début/fin

          points.push({
            id,
            titre,
            t_cible_s: mm * 60 + ss,
            important
          });
        }
      }

      // Parser les rappels
      const rappels_fin = rappelsTexte
        ? rappelsTexte.split('\n').filter(l => l.trim()).map(l => l.trim())
        : [];

      // Construire le guide
      const guide = points.length > 0 ? {
        points,
        rappels_fin,
        alerte_fin_s: alerteFin
      } : null;

      // Enregistrer
      await api('PATCH', '/api/guide', { id: state.sessionId, guide });
      const data = await api('GET', `/api/session/${state.sessionId}`);
      state.manifest = data.manifest;
      renderCurrentView();

      hideError();
    } catch (err) {
      showError(err.message);
    }
  });

  // Live avant prêt
  document.getElementById('btn-ready').addEventListener('click', async () => {
    try {
      await api('PATCH', '/api/ready', { id: state.sessionId });
      const data = await api('GET', `/api/session/${state.sessionId}`);
      state.manifest = data.manifest;
      renderCurrentView();
    } catch (err) {
      showError(err.message);
    }
  });

  // Live après prêt
  document.getElementById('btn-blocage').addEventListener('click', async () => {
    try {
      await api('POST', '/api/mark', { id: state.sessionId, type: 'blocage', texte: '' });
    } catch (err) {
      showError(err.message);
    }
  });

  document.getElementById('btn-ok').addEventListener('click', async () => {
    try {
      await api('POST', '/api/mark', { id: state.sessionId, type: 'ok', texte: '' });
    } catch (err) {
      showError(err.message);
    }
  });

  document.getElementById('btn-note').addEventListener('click', async () => {
    const texte = document.getElementById('note-text').value.trim();
    if (!texte) return;

    try {
      await api('POST', '/api/mark', { id: state.sessionId, type: 'note', texte });
      document.getElementById('note-text').value = '';
    } catch (err) {
      showError(err.message);
    }
  });

  document.getElementById('btn-stop').addEventListener('click', async () => {
    if (!confirm('Terminer la session ?')) return;

    try {
      await api('PATCH', '/api/stop', { id: state.sessionId });
      const data = await api('GET', `/api/session/${state.sessionId}`);
      state.manifest = data.manifest;
      renderCurrentView();
    } catch (err) {
      showError(err.message);
    }
  });

  // Guide : clic sur le point pour valider
  document.getElementById('guide-point-titre').addEventListener('click', async () => {
    if (state.guideEtat && state.guideEtat.pointAttendu) {
      await validerPoint(state.guideEtat.pointAttendu.id);
    }
  });

  // Guide : touche Entrée pour valider le point
  document.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && state.guideEtat && state.guideEtat.pointAttendu) {
      // Seulement si on est dans la vue live
      const currentView = document.getElementById('view-live-after');
      if (!currentView.classList.contains('hidden')) {
        e.preventDefault();
        await validerPoint(state.guideEtat.pointAttendu.id);
      }
    }
  });

  // Tableau de bord dans une fenêtre dédiée (même nom de fenêtre : un seul exemplaire)
  function ouvrirTableauDeBord(id) {
    const q = new URLSearchParams({ fenetre: '1' });
    if (id) q.set('session', id);
    window.open(`/index.html?${q}`, 'pitch-me-dashboard', 'width=1100,height=800');
  }
  document.getElementById('btn-dashboard-select').addEventListener('click', () => ouvrirTableauDeBord(null));
  document.getElementById('btn-dashboard-done').addEventListener('click', () => ouvrirTableauDeBord(state.sessionId));

  // Terminée : génération du rapport via l'API (même route que le tableau de bord)
  document.getElementById('btn-report').addEventListener('click', async () => {
    const bouton = document.getElementById('btn-report');
    const progression = document.getElementById('report-progress');
    try {
      bouton.disabled = true;
      progression.classList.remove('hidden');
      const { token } = await (await fetch('/api/token')).json();
      const r = await fetch(`/api/session/${state.sessionId}/rapport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}'
      });
      const corps = await r.json();
      if (!r.ok) throw new Error(corps.error || 'Échec');
      ouvrirTableauDeBord(state.sessionId);
    } catch (err) {
      showError(err.message);
    } finally {
      bouton.disabled = false;
      progression.classList.add('hidden');
    }
  });

  document.getElementById('btn-duplicate-done').addEventListener('click', event => dupliquerAvecRetour(event.currentTarget));

  document.getElementById('btn-back-done').addEventListener('click', () => {
    state.sessionId = null;
    state.manifest = null;
    showView('view-select');
  });
}

// Duplication avec retour visuel : le bouton est désactivé pendant l'appel (pas de
// double clic), puis affiche l'identifiant de la copie pendant quelques secondes.
async function dupliquerAvecRetour(bouton) {
  if (bouton.disabled || !state.sessionId) {
    return;
  }
  const libelle = bouton.dataset.libelle || bouton.textContent;
  bouton.dataset.libelle = libelle;
  bouton.disabled = true;
  bouton.textContent = 'Duplication…';
  try {
    const manifest = await api('POST', `/api/session/${state.sessionId}/dupliquer`);
    bouton.textContent = `Dupliquée ✓ ${manifest.id}`;
    // Rafraîchir la liste sans quitter la vue courante (loadSessions() y ramènerait)
    state.sessions = await api('GET', '/api/sessions');
    renderSessionList();
  } catch (err) {
    bouton.textContent = libelle;
    bouton.disabled = false;
    showError(err.message);
    return;
  }
  setTimeout(() => {
    bouton.textContent = libelle;
    bouton.disabled = false;
  }, 3000);
}

// Démarrer l'app
init();
