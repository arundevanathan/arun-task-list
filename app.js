'use strict';

/* ── State ── */
const STORAGE_KEY = 'arun_board_v1';
let data = null;
let state = {
  completedTasks: {}, // { taskId: { completedAt, sectionId, ts } }
  checkedSteps:   {}, // { taskId: [stepIndex, ...] }
  expandedTasks:  [], // [taskId, ...]
};

/* ── Boot ── */
async function init() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { Object.assign(state, JSON.parse(saved)); } catch (e) { /* ignore */ }
  }

  try {
    const res = await fetch('tasks.json?v=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    data = await res.json();
  } catch (e) {
    document.getElementById('app').innerHTML =
      '<div style="color:#e05a4e;padding:2rem;text-align:center;font-size:13px">' +
      'Failed to load tasks.json: ' + e.message + '</div>';
    return;
  }

  render();
}

/* ── Persist ── */
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ── Render ── */
function render() {
  if (!data) return;

  const total = data.sections.reduce((n, s) => n + s.tasks.length, 0);
  const done  = Object.keys(state.completedTasks).length;
  const pct   = total ? Math.round(done / total * 100) : 0;

  const sectionsHtml = data.sections.map(renderSection).join('');
  const completedHtml = done > 0 ? renderCompleted() : '';

  document.getElementById('app').innerHTML = `
    <header class="app-header">
      <div class="header-inner">
        <div class="header-title">
          <h1>${esc(data.meta.title)}</h1>
          <p>${esc(data.meta.subtitle)}</p>
        </div>
        <div class="header-right">
          <div class="overall-bar">
            <span class="lbl">${done}/${total} complete</span>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
            <span class="pct">${pct}%</span>
          </div>
          <div class="updated-note">Last updated: ${esc(data.meta.updated)}</div>
        </div>
      </div>
    </header>
    <div class="board">
      ${sectionsHtml}
      ${completedHtml}
    </div>
  `;

  bindEvents();
}

/* ── Section ── */
const COLORS = { red: '#e05a4e', amber: '#d4973a', purple: '#7b6fd4', blue: '#5a8eb5' };

function renderSection(section) {
  const c      = COLORS[section.color] || '#888';
  const active = section.tasks.filter(t => !state.completedTasks[t.id]);
  const doneN  = section.tasks.length - active.length;
  const pct    = section.tasks.length ? Math.round(doneN / section.tasks.length * 100) : 0;

  return `
    <div class="section-card">
      <div class="section-head">
        <div class="section-label-row">
          <span class="s-dot" style="background:${c}"></span>
          <span class="s-label" style="color:${c}">${esc(section.label)}</span>
          ${section.badge
            ? `<span class="s-badge" style="color:${c};background:${c}18;border:1px solid ${c}28">${esc(section.badge)}</span>`
            : ''}
        </div>
        <div class="section-prog">
          <span class="cnt">${doneN}/${section.tasks.length}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${c}"></div></div>
        </div>
      </div>
      <div class="tasks-wrap">
        ${active.length === 0
          ? `<div class="all-done-msg" style="color:${c}">All tasks complete ✓</div>`
          : active.map(t => renderCard(t, section, c, false)).join('')}
      </div>
    </div>`;
}

/* ── Completed section ── */
function renderCompleted() {
  const entries = Object.entries(state.completedTasks)
    .sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));

  const cards = entries.map(([id]) => {
    const tid = parseInt(id);
    for (const s of data.sections) {
      const t = s.tasks.find(x => x.id === tid);
      if (t) return renderCard(t, s, COLORS[s.color] || '#888', true);
    }
    return '';
  }).join('');

  return `
    <div class="section-card completed-section">
      <div class="section-head">
        <div class="section-label-row">
          <span class="s-dot" style="background:#4caf50"></span>
          <span class="s-label" style="color:#4caf50">Completed</span>
          <span class="s-badge" style="color:#4caf50;background:#4caf5018;border:1px solid #4caf5028">
            ${entries.length} done
          </span>
        </div>
      </div>
      <div class="tasks-wrap">${cards}</div>
    </div>`;
}

/* ── Task card ── */
function renderCard(task, section, color, isDone) {
  const expanded     = state.expandedTasks.includes(task.id);
  const checkedSteps = state.checkedSteps[task.id] || [];
  const totalSteps   = task.steps ? task.steps.length : 0;
  const stepsDone    = checkedSteps.length;
  const stepPct      = totalSteps ? Math.round(stepsDone / totalSteps * 100) : 0;
  const info         = state.completedTasks[task.id];

  const expandedBody = expanded ? `
    <div class="task-expanded">
      <p class="task-desc">${esc(task.desc)}</p>
      ${totalSteps > 0 ? `
        <div class="steps">
          ${task.steps.map((step, i) => {
            const done = checkedSteps.includes(i);
            return `<label class="step-row${done ? ' done' : ''}">
              <input type="checkbox" class="step-cb" data-id="${task.id}" data-i="${i}" ${done ? 'checked' : ''}>
              <span class="step-box">${done ? '✓' : ''}</span>
              <span class="step-txt">${esc(step)}</span>
            </label>`;
          }).join('')}
        </div>` : ''}
    </div>` : '';

  return `
    <div class="task-card${isDone ? ' is-done' : ''}" data-id="${task.id}">
      <div class="task-top-row">
        <label class="cb-wrap" title="${isDone ? 'Mark incomplete' : 'Mark complete'}">
          <input type="checkbox" class="task-cb"
            data-id="${task.id}" data-section="${section.id}" ${isDone ? 'checked' : ''}>
          <span class="cb-circle">${isDone ? '✓' : ''}</span>
        </label>
        <div class="task-info" data-expand="${task.id}">
          <div class="task-name-row">
            <span class="task-name${isDone ? ' done' : ''}">${esc(task.title)}</span>
            <span class="expand-arrow">${expanded ? '▲' : '▼'}</span>
          </div>
          <div class="task-pills">
            ${task.tags.map(g => `<span class="pill">${esc(g)}</span>`).join('')}
            ${isDone
              ? `<span class="done-stamp">Done ${esc(info ? info.completedAt : '')}</span>`
              : `<span class="due-pill ${dueCls(task.due)}">${esc(task.due)}</span>`}
          </div>
          ${totalSteps > 0 && !isDone
            ? `<div class="mini-prog"><div class="mini-fill" style="width:${stepPct}%;background:${color}"></div></div>`
            : ''}
        </div>
      </div>
      ${expandedBody}
    </div>`;
}

function dueCls(due) {
  if (due === 'OVERDUE')    return 'due-overdue';
  if (due === 'This week')  return 'due-hot';
  if (due === '31 Mar')     return 'due-soon';
  return 'due-norm';
}

/* ── Event binding ── */
function bindEvents() {
  // Task checkboxes
  document.querySelectorAll('.task-cb').forEach(cb => {
    cb.addEventListener('change', e => {
      e.stopPropagation();
      const id  = parseInt(cb.dataset.id);
      const sid = cb.dataset.section;
      if (cb.checked) markDone(id, sid, cb.closest('.task-card'));
      else            markUndone(id);
    });
  });

  // Expand toggles — clicking anywhere on task-info expands, except checkbox labels
  document.querySelectorAll('[data-expand]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.cb-wrap') || e.target.closest('.step-row')) return;
      const id  = parseInt(el.dataset.expand);
      const idx = state.expandedTasks.indexOf(id);
      if (idx === -1) state.expandedTasks.push(id);
      else            state.expandedTasks.splice(idx, 1);
      save();
      render();
    });
  });

  // Step checkboxes
  document.querySelectorAll('.step-cb').forEach(cb => {
    cb.addEventListener('change', e => {
      e.stopPropagation();
      const id  = parseInt(cb.dataset.id);
      const i   = parseInt(cb.dataset.i);
      if (!state.checkedSteps[id]) state.checkedSteps[id] = [];
      const arr = state.checkedSteps[id];
      const pos = arr.indexOf(i);
      if (pos === -1) arr.push(i);
      else            arr.splice(pos, 1);
      save();
      render();
    });
  });
}

/* ── Task completion ── */
function markDone(id, sectionId, cardEl) {
  // Animate card out, then update state
  cardEl.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
  cardEl.style.opacity    = '0';
  cardEl.style.transform  = 'translateX(14px)';
  setTimeout(() => {
    const now = new Date();
    state.completedTasks[id] = {
      sectionId,
      completedAt: formatDate(now),
      ts: now.getTime(),
    };
    save();
    render();
  }, 240);
}

function markUndone(id) {
  delete state.completedTasks[id];
  save();
  render();
}

/* ── Helpers ── */
function formatDate(d) {
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return date + ', ' + time;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

init();
