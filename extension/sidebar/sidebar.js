const STORAGE_KEY = 'sidequest.threads';

const els = {
  threadList: document.getElementById('threadList'),
  threadView: document.getElementById('threadView'),
  refreshBtn: document.getElementById('refreshBtn'),
  captureLatestBtn: document.getElementById('captureLatestBtn'),
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
    li.innerHTML = `<div class="title">${escapeHtml(t.title || 'Thread')}</div>
                    <div class="meta">${t.provider || ''} • ${fmtTime(t.updatedAt)}</div>`;
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

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'SIDEQUEST_THREADS_UPDATED') {
    refresh();
  }
});

refresh();
