'use strict';

/* ── Constants ── */
const STORAGE_KEY = 'arun_board_v1';
const JB_KEY_KEY  = 'arun_jb_key';   // JSONBin master key
const JB_BIN_KEY  = 'arun_jb_bin';   // JSONBin bin ID
const JB_BASE     = 'https://api.jsonbin.io/v3';

/* ── In-memory state ── */
let data      = null;
let syncTimer = null;

let state = {
  completedTasks: {}, // { taskId: { completedAt, sectionId, ts } }
  checkedSteps:   {}, // { taskId: [stepIndex, ...] }
  expandedTasks:  [], // [taskId, ...]
};

/* ═══════════════════════════════════════════
   BOOT
═══════════════════════════════════════════ */
async function init() {
  // 1. Load localStorage for instant first render
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { Object.assign(state, JSON.parse(saved)); } catch (e) { /* ignore */ }
  }

  // 2. Fetch tasks.json
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

  // 3. Render immediately with local state
  render();

  // 4. Fetch remote state — source of truth for cross-device sync
  await loadRemoteState();
}

/* ═══════════════════════════════════════════
   JSONBIN SYNC
═══════════════════════════════════════════ */
function getJbKey() { return localStorage.getItem(JB_KEY_KEY) || ''; }
function getJbBin() { return localStorage.getItem(JB_BIN_KEY) || ''; }

async function loadRemoteState() {
  const key = getJbKey();
  const bin = getJbBin();
  if (!key || !bin) { updateSyncPill(); return; }

  try {
    const res = await fetch(`${JB_BASE}/b/${bin}/latest`, {
      headers: { 'X-Master-Key': key }
    });
    if (res.status === 401 || res.status === 403) { setSyncStatus('error', 'Key invalid'); return; }
    if (res.status === 404) { updateSyncPill(); return; }
    if (!res.ok) { updateSyncPill(); return; }

    const { record } = await res.json();
    state = Object.assign({ completedTasks: {}, checkedSteps: {}, expandedTasks: [] }, record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
    setSyncStatus('synced');
  } catch (e) {
    updateSyncPill();
  }
}

async function syncToJsonBin() {
  const key = getJbKey();
  if (!key) { setSyncStatus('no-token'); return; }

  setSyncStatus('syncing');

  let bin = getJbBin();

  try {
    if (!bin) {
      // First time — create a new bin
      const res = await fetch(`${JB_BASE}/b`, {
        method: 'POST',
        headers: {
          'X-Master-Key': key,
          'Content-Type': 'application/json',
          'X-Bin-Name': 'arun-task-board',
          'X-Bin-Private': 'true',
        },
        body: JSON.stringify(state),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSyncStatus('error', err.message || res.status);
        return;
      }
      const created = await res.json();
      bin = created.metadata.id;
      localStorage.setItem(JB_BIN_KEY, bin);
      showBinCreated(bin);
    } else {
      // Update existing bin
      const res = await fetch(`${JB_BASE}/b/${bin}`, {
        method: 'PUT',
        headers: {
          'X-Master-Key': key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(state),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSyncStatus('error', err.message || res.status);
        return;
      }
    }
    setSyncStatus('synced');
  } catch (e) {
    setSyncStatus('error', e.message);
  }
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncToJsonBin, 800);
}

/* ── Sync pill UI ── */
function setSyncStatus(status, detail) {
  const el = document.getElementById('sync-pill');
  if (!el) return;

  el.className = 'sync-pill ' + status;

  if (status === 'syncing') {
    el.innerHTML = '<span class="spin">↻</span> Syncing…';
  } else if (status === 'synced') {
    el.textContent = '✓ Synced';
    setTimeout(() => {
      if (el.className.includes('synced')) {
        el.className = 'sync-pill idle';
        el.textContent = '✓ Synced';
      }
    }, 3000);
  } else if (status === 'error') {
    el.textContent = '⚠ Sync failed — tap to retry';
    el.title = detail || '';
  } else if (status === 'no-token') {
    el.textContent = '⚙ Set up sync';
  } else {
    el.textContent = '✓ Synced';
  }
}

function updateSyncPill() {
  setSyncStatus(getJbKey() ? 'idle' : 'no-token');
}

/* ── Token modal ── */
function showTokenModal(prefill) {
  if (document.getElementById('token-modal')) return;

  const overlay = document.createElement('div');
  overlay.id        = 'token-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card" id="modal-card">
      <h3>Cross-device sync</h3>
      <p>Enter your <strong>JSONBin Master Key</strong> (from jsonbin.io → API Keys) and a <strong>Bin ID</strong> if syncing from another device. Keys are stored only in this browser.</p>
      <label class="modal-label">Master Key</label>
      <input type="password" id="jb-key-input" placeholder="$2a$10$…"
             autocomplete="off" spellcheck="false"
             value="${esc(prefill || getJbKey())}">
      <label class="modal-label" style="margin-top:10px">Bin ID <span style="font-weight:400;opacity:.6">(leave blank to create new)</span></label>
      <input type="text" id="jb-bin-input" placeholder="64a3f…"
             autocomplete="off" spellcheck="false"
             value="${esc(getJbBin())}">
      <div class="modal-btns">
        <button class="btn-primary" id="save-token-btn">Save &amp; Sync</button>
        <button class="btn-secondary" id="clear-token-btn">Remove credentials</button>
        <button class="btn-cancel" id="cancel-token-btn">Cancel</button>
      </div>
      <p class="modal-note">Credentials never leave your browser except to call the JSONBin API over HTTPS.</p>
    </div>`;

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeTokenModal();
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  document.getElementById('jb-key-input').focus();

  document.getElementById('save-token-btn').addEventListener('click', () => {
    const key = document.getElementById('jb-key-input').value.trim();
    const bin = document.getElementById('jb-bin-input').value.trim();
    if (!key) return;
    localStorage.setItem(JB_KEY_KEY, key);
    if (bin) localStorage.setItem(JB_BIN_KEY, bin);
    else localStorage.removeItem(JB_BIN_KEY);
    closeTokenModal();
    syncToJsonBin();
  });

  document.getElementById('clear-token-btn').addEventListener('click', () => {
    localStorage.removeItem(JB_KEY_KEY);
    localStorage.removeItem(JB_BIN_KEY);
    closeTokenModal();
    setSyncStatus('no-token');
  });

  document.getElementById('cancel-token-btn').addEventListener('click', closeTokenModal);
}

/* ── Show bin ID after auto-creation ── */
function showBinCreated(binId) {
  const existing = document.getElementById('bin-created-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id        = 'bin-created-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>Bin created ✓</h3>
      <p>Your state is now stored on JSONBin. To sync another device, enter your Master Key <strong>and</strong> this Bin ID in the sync setup:</p>
      <div class="bin-id-box" id="bin-id-display">${esc(binId)}</div>
      <p class="modal-note">Tap the Bin ID to copy it.</p>
      <div class="modal-btns">
        <button class="btn-primary" id="bin-ok-btn">Got it</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  document.getElementById('bin-id-display').addEventListener('click', () => {
    navigator.clipboard.writeText(binId).catch(() => {});
    document.getElementById('bin-id-display').textContent = 'Copied!';
    setTimeout(() => {
      const el = document.getElementById('bin-id-display');
      if (el) el.textContent = binId;
    }, 1500);
  });

  document.getElementById('bin-ok-btn').addEventListener('click', () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 200);
  });
}

function closeTokenModal() {
  const el = document.getElementById('token-modal');
  if (!el) return;
  el.classList.remove('open');
  setTimeout(() => el.remove(), 200);
}

function handleSyncPillClick() {
  const el = document.getElementById('sync-pill');
  if (!el) return;
  if (el.className.includes('no-token')) {
    showTokenModal();
  } else if (el.className.includes('error')) {
    syncToJsonBin(); // retry
  } else {
    showTokenModal(); // allow credential update
  }
}

/* ═══════════════════════════════════════════
   PERSIST (local + remote)
═══════════════════════════════════════════ */
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleSync();
}

/* ═══════════════════════════════════════════
   RENDER
═══════════════════════════════════════════ */
function render() {
  if (!data) return;

  const total = data.sections.reduce((n, s) => n + s.tasks.length, 0);
  const done  = Object.keys(state.completedTasks).length;
  const pct   = total ? Math.round(done / total * 100) : 0;
  const ready = getJbKey();

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
          <div class="header-meta-row">
            <div class="updated-note">Updated: ${esc(data.meta.updated)}</div>
            <span id="sync-pill"
                  class="sync-pill ${ready ? 'idle' : 'no-token'}"
                  onclick="handleSyncPillClick()"
                  title="${ready ? 'Tap to manage sync / retry' : 'Tap to set up cross-device sync'}">
              ${ready ? '✓ Synced' : '⚙ Set up sync'}
            </span>
          </div>
        </div>
      </div>
    </header>
    <div class="board">
      ${data.sections.map(renderSection).join('')}
      ${done > 0 ? renderCompleted() : ''}
    </div>`;

  bindEvents();
}

/* ═══════════════════════════════════════════
   SECTION
═══════════════════════════════════════════ */
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
  if (due === 'OVERDUE')   return 'due-overdue';
  if (due === 'This week') return 'due-hot';
  if (due === '31 Mar')    return 'due-soon';
  return 'due-norm';
}

/* ═══════════════════════════════════════════
   EVENTS
═══════════════════════════════════════════ */
function bindEvents() {
  document.querySelectorAll('.task-cb').forEach(cb => {
    cb.addEventListener('change', e => {
      e.stopPropagation();
      const id  = parseInt(cb.dataset.id);
      const sid = cb.dataset.section;
      if (cb.checked) markDone(id, sid, cb.closest('.task-card'));
      else            markUndone(id);
    });
  });

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
  cardEl.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
  cardEl.style.opacity    = '0';
  cardEl.style.transform  = 'translateX(14px)';
  setTimeout(() => {
    const now = new Date();
    state.completedTasks[id] = { sectionId, completedAt: formatDate(now), ts: now.getTime() };
    save();
    render();
  }, 240);
}

function markUndone(id) {
  delete state.completedTasks[id];
  save();
  render();
}

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
function formatDate(d) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
         ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

init();
