const STORAGE_KEY = 'sidequest.threads';

const els = {
  threadList: document.getElementById('threadList'),
  threadView: document.getElementById('threadView'),
  refreshBtn: document.getElementById('refreshBtn'),
  captureLatestBtn: document.getElementById('captureLatestBtn'),
  minimizeBtn: document.getElementById('minimizeBtn'),
  clearAllBtn: document.getElementById('clearAllBtn'),
  resizer: document.getElementById('resizer'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
};

let state = {
  data: { threads: {}, order: [] },
  currentThreadId: null,
};

function fmtTime(ts) { try { return new Date(ts).toLocaleString(); } catch { return '' } }

async function loadThreads() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY, res => {
      resolve(res[STORAGE_KEY] || { threads: {}, order: [] });
    });
  });
}

async function refresh() {
  state.data = await loadThreads();
  renderThreadList();
  if (state.currentThreadId && !state.data.threads[state.currentThreadId]) {
    state.currentThreadId = null;
  }
  renderThreadView(state.currentThreadId);
}

// Initialize saved width for threads column
(async function initThreadsWidth() {
  const key = 'sidequest.threadsWidth';
  chrome.storage.local.get(key, (res) => {
    const val = res?.[key];
    if (typeof val === 'number' && val >= 160 && val <= 640) {
      document.documentElement.style.setProperty('--threads-width', `${val}px`);
    }
  });
})();

// Drag-to-resize for threads column
if (els.resizer) {
  let dragging = false;
  const key = 'sidequest.threadsWidth';
  const onMove = (e) => {
    if (!dragging) return;
    const x = e.clientX;
    const rect = document.body.getBoundingClientRect();
    // threads width = distance from left edge to resizer (with header padding baseline)
    let width = Math.min(Math.max(x - rect.left, 160), 640);
    document.documentElement.style.setProperty('--threads-width', `${width}px`);
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    const computed = getComputedStyle(document.documentElement).getPropertyValue('--threads-width').trim();
    const n = parseInt(computed, 10);
    if (!Number.isNaN(n)) chrome.storage.local.set({ [key]: n });
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  els.resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function renderThreadList() {
  els.threadList.innerHTML = '';
  const { order, threads } = state.data;
  if (!order.length) {
    const li = document.createElement('li');
    li.innerHTML = '<div class="meta">No threads yet. Click ⭐ on an answer bubble.</div>';
    els.threadList.appendChild(li);
    return;
  }
  for (const id of order) {
    const t = threads[id];
    if (!t) continue;
    const li = document.createElement('li');
    li.dataset.id = id;
    li.className = state.currentThreadId === id ? 'active' : '';
      li.innerHTML = `<div class="row">
                        <div>
                          <div class="title">${escapeHtml(t.title || 'Thread')}</div>
                          <div class="meta">${t.provider || ''} • ${fmtTime(t.updatedAt)}</div>
                        </div>
                        <div class="actions">
                          <button class="btn-icon" data-action="rename" title="Rename thread" aria-label="Rename thread">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M12 20h9"></path>
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                            </svg>
                          </button>
                          <button class="btn-icon" data-action="delete" title="Delete thread" aria-label="Delete thread">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                              <path d="M10 11v6"></path>
                              <path d="M14 11v6"></path>
                              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </div>
                      </div>`;
    li.addEventListener('click', () => {
      state.currentThreadId = id;
      renderThreadList();
      renderThreadView(id);
      // Ask content script to jump to the bookmarked answer in the main page
      const lastAssistant = (t.messages || []).slice().reverse().find(m => m.role === 'assistant');
      chrome.runtime.sendMessage({
        type: 'SIDEQUEST_JUMP_TO',
        threadId: id,
        locator: t.locator || null,
        fallbackText: lastAssistant?.content || ''
      }).catch(() => {});
    });
    // Stop propagation for delete button
    li.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Delete this thread? This cannot be undone.')) {
        chrome.runtime.sendMessage({ type: 'SIDEQUEST_DELETE_THREAD', threadId: id }, () => {
          if (state.currentThreadId === id) state.currentThreadId = null;
          refresh();
        });
      }
    });
    // Rename thread
    li.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
      e.stopPropagation();
      const current = (t.title || '').trim();
      const next = prompt('Rename thread:', current);
      if (next == null) return; // cancelled
      const title = String(next).trim();
      if (!title) return; // ignore empty
      chrome.runtime.sendMessage({ type: 'SIDEQUEST_RENAME_THREAD', threadId: id, title }, () => {
        refresh();
      });
    });
    els.threadList.appendChild(li);
  }
}

function renderThreadView(id) {
  els.threadView.innerHTML = '';
  if (!id) {
    const div = document.createElement('div');
    div.className = 'sq-empty';
    div.textContent = 'Select a thread or bookmark one ⭐';
    els.threadView.appendChild(div);
    return;
  }
  const t = state.data.threads[id];
  if (!t) return;
  (t.messages || []).forEach(m => {
    const wrap = document.createElement('div');
    wrap.className = `msg ${m.role}`;
    wrap.innerHTML = `<div class="role">${m.role}</div><div class="content">${escapeHtml(m.content)}</div>`;
    els.threadView.appendChild(wrap);
  });
  els.threadView.scrollTop = els.threadView.scrollHeight;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

els.refreshBtn.addEventListener('click', refresh);
els.captureLatestBtn.addEventListener('click', async () => {
  // Ask content script to capture the most recent assistant bubble
  let res;
  try {
    res = await chrome.runtime.sendMessage({ type: 'SIDEQUEST_CAPTURE_LATEST' });
  } catch (e) {
    // If extension was reloaded, the iframe's extension context may be invalidated.
    // Reload this iframe to re-bind chrome.runtime.*
    try { location.reload(); } catch {}
    res = {};
  }
  if (res?.ok) {
    await refresh();
  } else {
    // Surface a simple inline toast by briefly changing header title
    const header = document.querySelector('.sq-header .sq-header-left');
    if (header) {
      const old = header.textContent || 'SideQuest';
      header.textContent = res?.error ? String(res.error) : 'No assistant message found yet';
      setTimeout(() => (header.textContent = old), 1500);
    }
  }
});

// Minimize sidebar (handled by content script via background forwarder)
if (els.minimizeBtn) {
  els.minimizeBtn.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'SIDEQUEST_SIDEBAR_MINIMIZE' });
    } catch {}
  });
}

// Clear all threads
if (els.clearAllBtn) {
  els.clearAllBtn.addEventListener('click', async () => {
    if (!confirm('Clear ALL threads? This cannot be undone.')) return;
    try {
      await chrome.runtime.sendMessage({ type: 'SIDEQUEST_CLEAR_ALL_THREADS' });
      state.currentThreadId = null;
      await refresh();
    } catch {}
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'SIDEQUEST_THREADS_UPDATED') {
    refresh();
  }
});

refresh();

// --- Theme toggle with roll-down animation ---
let currentTheme = 'light';
const THEME_KEY = 'sidequest.theme';
const THEME_BG = { light: '#ffffff', dark: '#0f1115' };

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  chrome.storage.local.set({ [THEME_KEY]: theme });
  updateThemeIcon();
}

function updateThemeIcon() {
  if (!els.themeToggleBtn) return;
  if (currentTheme === 'dark') {
    // Show moon icon
    els.themeToggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"></path></svg>';
  } else {
    // Show sun icon
    els.themeToggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
  }
}

function animateThemeSwitch(nextTheme) {
  const curtain = document.createElement('div');
  Object.assign(curtain.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '0%',
    background: THEME_BG[nextTheme] || '#000', zIndex: 9999, pointerEvents: 'none',
    transition: 'height 280ms ease, opacity 200ms ease 280ms'
  });
  document.body.appendChild(curtain);
  requestAnimationFrame(() => { curtain.style.height = '100%'; });
  setTimeout(() => { applyTheme(nextTheme); curtain.style.opacity = '0'; }, 320);
  setTimeout(() => { curtain.remove(); }, 560);
}

// Load saved theme and set icon
chrome.storage.local.get(THEME_KEY, (res) => {
  const t = res?.[THEME_KEY];
  applyTheme(t === 'dark' ? 'dark' : 'light');
});

if (els.themeToggleBtn) {
  els.themeToggleBtn.addEventListener('click', () => {
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    animateThemeSwitch(next);
  });
}
