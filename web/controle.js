// État global
let state = {
  token: null,
  sessionId: null,
  sessions: [],
  manifest: null,
  etat: null,
  chronoInterval: null
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

  document.getElementById('btn-back-prep').addEventListener('click', () => {
    state.sessionId = null;
    state.manifest = null;
    showView('view-select');
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

  // Terminée
  document.getElementById('btn-report').addEventListener('click', async () => {
    try {
      document.getElementById('report-progress').classList.remove('hidden');
      // Note: POST /api/session/:id/report n'existe pas encore, on utilise le CLI pour le lot B
      showError('Utilisez le CLI pour générer le rapport : node src/cli.js report ' + state.sessionId);
    } catch (err) {
      showError(err.message);
    }
  });

  document.getElementById('btn-back-done').addEventListener('click', () => {
    state.sessionId = null;
    state.manifest = null;
    showView('view-select');
  });
}

// Démarrer l'app
init();
