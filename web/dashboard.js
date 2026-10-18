let graphiques = [];

function detruireGraphiques() {
  graphiques.forEach(g => g.destroy());
  graphiques = [];
}

// Chargement des sessions
async function chargerSessions() {
  const response = await fetch('/api/sessions');
  const sessions = await response.json();

  const select = document.getElementById('session-select');
  select.innerHTML = '<option value="">Sélectionner une session</option>';

  // Les ids (AAAA-MM-JJ-sNN) sont chronologiques : tri inverse, plus récente en haut.
  sessions
    .sort((a, b) => b.id.localeCompare(a.id))
    .forEach(session => {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = `${session.id} - ${session.titre} (${session.statut})`;
      select.appendChild(option);
    });

  // Session demandée dans l'URL (?session=ID) sinon la plus récente
  const demandee = new URLSearchParams(location.search).get('session');
  const choisie = sessions.find(x => x.id === demandee) || sessions[0];
  if (choisie) {
    select.value = choisie.id;
    chargerSession(choisie.id);
  } else {
    document.getElementById('content').innerHTML = '<div class="section"><p>Aucune session.</p></div>';
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
  detruireGraphiques();
  const { manifest, timeline, report } = data;

  if (!timeline || !report) {
    const zone = document.getElementById('content');
    const section = document.createElement('div');
    section.className = 'section';
    const msg = document.createElement('p');
    section.appendChild(msg);
    zone.innerHTML = '';
    zone.appendChild(section);

    const fini = manifest.statut === 'termine' || manifest.statut === 'analyse';
    if (!fini) {
      msg.textContent = `Session non terminée (${manifest.statut}) : pas encore de rapport.`;
    } else if (!data.nb_frames) {
      msg.textContent = 'Session vide : aucune capture dans la base.';
    } else if (manifest.statut !== 'termine') {
      msg.textContent = 'Timeline ou rapport non disponible.';
    } else {
      msg.textContent = 'Timeline ou rapport non disponible - Voulez-vous le générer maintenant ?';
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.textContent = 'Générer maintenant';
      bouton.style.marginLeft = '12px';
      bouton.addEventListener('click', async () => {
        bouton.disabled = true;
        msg.textContent = 'Génération en cours… (environ une minute)';
        try {
          const { token } = await (await fetch('/api/token')).json();
          const r = await fetch(`/api/session/${manifest.id}/rapport`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: '{}'
          });
          const corps = await r.json();
          if (!r.ok) throw new Error(corps.error || 'Échec');
          chargerSession(manifest.id);
        } catch (err) {
          msg.textContent = `Génération impossible : ${err.message}`;
          bouton.disabled = false;
          section.appendChild(bouton);
        }
      });
      section.appendChild(bouton);
    }
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
          <div class="indicateur-valeur">${Number(timeline.duree_live_s).toFixed(2)}s</div>
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
      <div class="chart-box" style="height:220px"><canvas id="timeline-chart"></canvas></div>
    </div>

    <div class="section">
      <h2>Temps par application</h2>
      <div class="chart-box" style="height:300px"><canvas id="apps-chart"></canvas></div>
    </div>

    ${report.constats.length > 0 ? `
      <div class="section">
        <h2>Constats</h2>
        ${report.constats.map(c => `
          <div class="constat ${c.gravite}">
            <div class="constat-titre">${c.titre}</div>
            <div class="constat-detail">${c.detail}</div>
            <div class="constat-preuve" onclick="scrollToTimestamp(${c.preuve.t_s})">
              Preuve : ${c.preuve.source} à ${Number(c.preuve.t_s).toFixed(2)}s
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
        <h2>À revoir</h2>
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

  graphiques.push(new Chart(canvas, {
    type: 'bar',
    data: { datasets },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
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
            title: (items) => {
              const f = timeline.fenetres[items[0].datasetIndex];
              return `${f.app} - ${f.fenetre}`;
            },
            label: (ctx) => {
              const f = timeline.fenetres[ctx.datasetIndex];
              const n = v => Number(v).toFixed(2);
              return `${n(f.debut_s)}s → ${n(f.fin_s)}s (${n(f.duree_s)}s)`;
            }
          }
        }
      }
    }
  }));
}

// Graphique du temps par app
// Outillage (Pitch-Me, terminal…) : jamais compté comme application de présentation
const OUTILLAGE = ['Claude', 'Electron', 'Terminal', 'iTerm2', 'screenpipe', 'Screenpipe', 'node'];

// Applications prévues (fenêtres marquées « prévue »), sinon tout sauf l'outillage
function appsUtiles(timeline) {
  const prevues = new Set(timeline.fenetres.filter(f => f.prevue).map(f => f.app));
  return timeline.temps_par_app.filter(t =>
    prevues.size > 0 ? prevues.has(t.app) : !OUTILLAGE.includes(t.app)
  );
}

function creerGraphiqueApps(timeline) {
  const canvas = document.getElementById('apps-chart');
  if (!canvas) return;

  const couleurs = {
    'Google Chrome': '#4285f4',
    'zoom.us': '#2d8cff',
    'Visual Studio Code': '#007acc',
    'Slack': '#e01e5a'
  };

  graphiques.push(new Chart(canvas, {
    type: 'bar',
    data: {
      labels: appsUtiles(timeline).map(t => t.app),
      datasets: [{
        label: 'Durée (secondes)',
        data: appsUtiles(timeline).map(t => Number(t.duree_s.toFixed(2))),
        backgroundColor: appsUtiles(timeline).map(t =>
          couleurs[t.app] || '#999'
        )
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
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
  }));
}

// Scroll vers un timestamp (TODO: améliorer)
function scrollToTimestamp(ts) {
  alert(`Timestamp: ${ts}s`);
}

// Suppression : la session est déplacée dans sessions/_corbeille (récupérable)
async function supprimerSessionCourante() {
  const select = document.getElementById('session-select');
  const id = select.value;
  if (!id) return;
  if (!confirm(`Supprimer la session ${id} ?\nElle sera déplacée dans sessions/_corbeille.`)) return;
  try {
    const { token } = await (await fetch('/api/token')).json();
    const r = await fetch(`/api/session/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    });
    const corps = await r.json();
    if (!r.ok) throw new Error(corps.error || 'Échec');
    history.replaceState(null, '', location.pathname);
    detruireGraphiques();
    await chargerSessions();
  } catch (err) {
    alert(`Suppression impossible : ${err.message}`);
  }
}

document.getElementById('btn-supprimer').addEventListener('click', supprimerSessionCourante);

// Initialisation
document.getElementById('session-select').addEventListener('change', (e) => {
  chargerSession(e.target.value);
});

chargerSessions();
