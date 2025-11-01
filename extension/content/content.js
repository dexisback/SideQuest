// Content script: injects sidebar, attaches star buttons, observes replies, and handles follow-ups.

(function () {
  const STATE = {
    provider: detectProvider(location.href),
    sidebarIframe: null,
  };

  function detectProvider(url) {
    if (/chat\.openai\.com/.test(url)) return 'chatgpt';
    if (/gemini\.google\.com/.test(url)) return 'gemini';
    return 'unknown';
  }

  // Sidebar injection (as iframe from extension assets)
  function ensureSidebar() {
    if (STATE.sidebarIframe) return;
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('sidebar/sidebar.html');
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.right = '0';
    iframe.style.height = '100vh';
    iframe.style.width = '360px';
    iframe.style.zIndex = '2147483647';
    iframe.style.border = '0';
    iframe.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.18)';
    iframe.style.background = 'transparent';
    iframe.style.display = 'block';
    document.documentElement.appendChild(iframe);
    STATE.sidebarIframe = iframe;
  }

  // Utility: simple debounce
  function debounce(fn, ms) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // Heuristic: find assistant bubbles in ChatGPT/Gemini
  function findAssistantBubbles() {
    switch (STATE.provider) {
      case 'chatgpt':
        return Array.from(document.querySelectorAll('[data-message-author-role="assistant"], .assistant, [data-testid="conversation-turn-assistant"]').values());
      case 'gemini':
        return Array.from(document.querySelectorAll('[data-author="model"], .assistant, [aria-label*="response"]').values());
      default:
        return [];
    }
  }

  function extractQAFromBubble(node) {
    // Best-effort extraction. For MVP, we pull the latest user prompt and assistant text.
    let answer = (node?.innerText || '').trim();
    let question = '';
    // Try to find previous user bubble text
    const all = Array.from(document.querySelectorAll('div, article, section'));
    const idx = all.indexOf(node);
    if (idx > 0) {
      for (let i = idx - 1; i >= 0; i--) {
        const el = all[i];
        const txt = (el.innerText || '').trim();
        if (txt && txt.length > 0 && txt.length < 2000) { question = txt.slice(0, 600); break; }
      }
    }
    return { provider: STATE.provider, question, answer };
  }

  function attachStar(node) {
    if (!node || node.dataset.sidequestAttached) return;
    node.dataset.sidequestAttached = '1';
    const btn = document.createElement('button');
    btn.textContent = '⭐';
    btn.title = 'Save to SideQuest';
    btn.className = 'sidequest-star-btn';
    Object.assign(btn.style, {
      position: 'absolute',
      top: '8px',
      right: '8px',
      fontSize: '16px',
      cursor: 'pointer',
      background: '#fff',
      border: '1px solid rgba(0,0,0,0.1)',
      borderRadius: '6px',
      padding: '2px 6px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.08)'
    });
    btn.addEventListener('click', () => {
      const payload = extractQAFromBubble(node);
      chrome.runtime.sendMessage({ type: 'SIDEQUEST_BOOKMARK', payload });
    });

    // Create a relatively positioned wrapper if needed
    const wrapper = node.closest('[data-sidequest-wrapper]') || node;
    if (getComputedStyle(wrapper).position === 'static') {
      wrapper.style.position = 'relative';
    }
    wrapper.appendChild(btn);
  }

  function scanAndAttachStars() {
    const bubbles = findAssistantBubbles();
    bubbles.forEach(attachStar);
  }

  const debouncedScan = debounce(scanAndAttachStars, 300);
  const mo = new MutationObserver(() => debouncedScan());

  function startObserving() {
    mo.observe(document.documentElement, { childList: true, subtree: true });
    scanAndAttachStars();
  }

  // Handle follow-up requests from sidebar via background relay
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'SIDEQUEST_SEND_FOLLOWUP') {
      const text = msg.text || '';
      sendFollowUp(text).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    return false;
  });

  async function sendFollowUp(text) {
    const oldY = window.scrollY;
    const input = findChatInput();
    if (!input) throw new Error('input-not-found');
    focusAndSetValue(input, text);
    triggerSend(input);
    window.scrollTo(0, oldY);
  }

  function findChatInput() {
    if (STATE.provider === 'chatgpt') {
      return document.querySelector('textarea, [contenteditable="true"]');
    } else if (STATE.provider === 'gemini') {
      return document.querySelector('textarea, [contenteditable="true"]');
    }
    return null;
  }

  function focusAndSetValue(el, text) {
    if (!el) return;
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (el.getAttribute('contenteditable') === 'true') {
      el.textContent = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function triggerSend(el) {
    // Try Enter key
    const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
    el.dispatchEvent(ev);
    // Also try to click send buttons nearby
    const sendBtn = document.querySelector('button[type="submit"], button[aria-label*="Send" i], button[data-testid*="send" i]');
    if (sendBtn) sendBtn.click();
  }

  // Initialize
  ensureSidebar();
  startObserving();
})();
