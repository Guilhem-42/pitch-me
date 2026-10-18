// Chargement des sessions
async function chargerSessions() {
  const response = await fetch('/api/sessions');
  const sessions = await response.json();

  const select = document.getElementById('session-select');
  select.innerHTML = '<option value="">Sélectionner une session</option>';

  sessions
    .sort((a, b) => new Date(b.debut || 0) - new Date(a.debut || 0))
    .forEach(session => {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = `${session.id} - ${session.titre} (${session.statut})`;
      select.appendChild(option);
    });

  // Charger la première session par défaut
  if (sessions.length > 0) {
    select.value = sessions[0].id;
    chargerSession(sessions[0].id);
  }
}

// Chargement d'une session
async function chargerSession(id) {
  if (!id) return;

  document.getElementById('content').innerHTML = '<div class="loading">Chargement...</div>';

  const response = await fetch(`/api/session/${id}`);
  const data = await response.json();

  afficherDashboard(data);
}

// Affichage du dashboard
function afficherDashboard(data) {
  const { manifest, timeline, report } = data;

  if (!timeline || !report) {
    document.getElementById('content').innerHTML = `
      <div class="section">
        <p>Timeline ou rapport non disponible. Exécutez "node src/cli.js report ${manifest.id}"</p>
      </div>
    `;
    return;
  }

  const html = `
    <header>
      <h1>
        ${manifest.titre}
        <span class="verdict ${report.objectif_atteint.verdict}">${report.objectif_atteint.verdict}</span>
      </h1>
      <div class="objectif">${manifest.objectif}</div>
    </header>

    <div class="section">
      <h2>Résumé</h2>
      <p>${report.resume}</p>
      <p style="margin-top:10px; color:#666;">${report.objectif_atteint.justification}</p>
    </div>

    <div class="section">
      <h2>Indicateurs</h2>
      <div class="indicateurs">
        <div class="indicateur">
          <div class="indicateur-label">Durée live</div>
          <div class="indicateur-valeur">${timeline.duree_live_s}s</div>
        </div>
        <div class="indicateur">
          <div class="indicateur-label">Changements de fenêtre</div>
          <div class="indicateur-valeur">${timeline.changements_fenetre}</div>
        </div>
        ${timeline.parole ? `
          <div class="indicateur">
            <div class="indicateur-label">Débit de parole</div>
            <div class="indicateur-valeur">${timeline.parole.mots_par_min} mots/min</div>
          </div>
          <div class="indicateur">
            <div class="indicateur-label">Silences</div>
            <div class="indicateur-valeur">${timeline.silences ? timeline.silences.length : 0}</div>
          </div>
        ` : ''}
        <div class="indicateur">
          <div class="indicateur-label">Hors cadre</div>
          <div class="indicateur-valeur">${timeline.hors_cadre.length}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Frise temporelle</h2>
      <canvas id="timeline-chart" class="timeline-chart"></canvas>
    </div>

    <div class="section">
      <h2>Temps par application</h2>
      <canvas id="apps-chart" style="height: 300px;"></canvas>
    </div>

    ${report.constats.length > 0 ? `
      <div class="section">
        <h2>Constats</h2>
        ${report.constats.map(c => `
          <div class="constat ${c.gravite}">
            <div class="constat-titre">${c.titre}</div>
            <div class="constat-detail">${c.detail}</div>
            <div class="constat-preuve" onclick="scrollToTimestamp(${c.preuve.t_s})">
              Preuve : ${c.preuve.source} à ${c.preuve.t_s}s
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${report.recommandations.length > 0 ? `
      <div class="section">
        <h2>Recommandations</h2>
        ${report.recommandations
          .sort((a, b) => a.priorite - b.priorite)
          .map(r => `
          <div class="recommandation priorite-${r.priorite}">
            ${r.texte}
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${report.checklist_suivante.length > 0 ? `
      <div class="section">
        <h2>Checklist pour la prochaine session</h2>
        ${report.checklist_suivante.map(c => `
          <div class="checklist-item">☐ ${c.texte}</div>
        `).join('')}
      </div>
    ` : ''}

    ${report.comparaison ? `
      <div class="section">
        <h2>Comparaison avec ${report.comparaison.avec}</h2>
        <table class="comparaison-table">
          <thead>
            <tr>
              <th>Mesure</th>
              <th>Avant</th>
              <th>Après</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            ${report.comparaison.deltas.map(d => {
              const delta = d.apres - d.avant;
              const deltaClass = delta > 0 ? 'delta-positif' : (delta < 0 ? 'delta-negatif' : '');
              return `
                <tr>
                  <td>${d.mesure}</td>
                  <td>${d.avant}</td>
                  <td>${d.apres}</td>
                  <td class="${deltaClass}">${delta > 0 ? '+' : ''}${delta}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    ${report.todo_detectes.length > 0 ? `
      <div class="section">
        <h2>TODOs détectés</h2>
        ${report.todo_detectes.map(t => `
          <div style="padding:10px; background:#fff3cd; border-radius:4px; margin-bottom:8px;">
            ${t.texte} <span style="color:#666; font-size:12px;">(source: ${t.source})</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${report.incertitudes.length > 0 ? `
      <div class="section">
        <h2>Incertitudes</h2>
        ${report.incertitudes.map(i => `
          <div style="padding:10px; background:#f8d7da; border-radius:4px; margin-bottom:8px;">
            ${i}
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;

  document.getElementById('content').innerHTML = html;

  // Créer les graphiques
  creerGraphiqueFrise(timeline);
  creerGraphiqueApps(timeline);
}

// Graphique de la frise temporelle
function creerGraphiqueFrise(timeline) {
  const canvas = document.getElementById('timeline-chart');
  if (!canvas) return;

  // Créer les datasets pour chaque fenêtre
  const couleurs = {
    'Google Chrome': '#4285f4',
    'zoom.us': '#2d8cff',
    'Visual Studio Code': '#007acc',
    'Slack': '#e01e5a'
  };

  const datasets = timeline.fenetres.map((f, i) => ({
    label: `${f.app} - ${f.fenetre}`,
    data: [{
      x: [f.debut_s, f.fin_s],
      y: 1
    }],
    backgroundColor: couleurs[f.app] || `hsl(${i * 40}, 70%, 50%)`,
    barThickness: 30
  }));

  new Chart(canvas, {
    type: 'bar',
    data: { datasets },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: timeline.duree_s,
          title: {
            display: true,
            text: 'Temps (secondes)'
          }
        },
        y: {
          display: false
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const fenetre = timeline.fenetres[ctx.datasetIndex];
              return `${fenetre.app}: ${fenetre.duree_s}s`;
            }
          }
        }
      }
    }
  });
}

// Graphique du temps par app
function creerGraphiqueApps(timeline) {
  const canvas = document.getElementById('apps-chart');
  if (!canvas) return;

  const couleurs = {
    'Google Chrome': '#4285f4',
    'zoom.us': '#2d8cff',
    'Visual Studio Code': '#007acc',
    'Slack': '#e01e5a'
  };

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: timeline.temps_par_app.map(t => t.app),
      datasets: [{
        label: 'Durée (secondes)',
        data: timeline.temps_par_app.map(t => t.duree_s),
        backgroundColor: timeline.temps_par_app.map(t =>
          couleurs[t.app] || '#999'
        )
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Durée (secondes)'
          }
        }
      }
    }
  });
}

// Scroll vers un timestamp (TODO: améliorer)
function scrollToTimestamp(ts) {
  alert(`Timestamp: ${ts}s`);
}

// Initialisation
document.getElementById('session-select').addEventListener('change', (e) => {
  chargerSession(e.target.value);
});

chargerSessions();
