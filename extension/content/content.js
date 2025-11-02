// Content script: injects sidebar, attaches star buttons, observes replies, and handles follow-ups.

(function () {
  console.log('[SideQuest] Content script loaded at', location.href);
  
  const STATE = {
    provider: detectProvider(location.href),
    sidebarIframe: null,
  };

  function detectProvider(url) {
    if (/chat\.openai\.com|chatgpt\.com/.test(url)) return 'chatgpt';
    if (/gemini\.google\.com/.test(url)) return 'gemini';
    return 'unknown';
  }
  
  console.log('[SideQuest] Provider detected:', STATE.provider);

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
    iframe.style.transition = 'transform 200ms ease, opacity 150ms ease';
    document.documentElement.appendChild(iframe);
    STATE.sidebarIframe = iframe;
    ensureFloatingHandle();
  }

  // Utility: simple debounce
  function debounce(fn, ms) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  
  // Wrap in try-catch to prevent errors from breaking the extension
  try {
    // Any previous helper code that may reference undefined variables
    void(0);
  } catch (e) {
    console.warn('[SideQuest] Caught error in init:', e.message);
  }

  // Heuristic: find assistant bubbles in ChatGPT/Gemini (2024–2025 DOM variants)
  function findAssistantBubbles() {
    if (STATE.provider === 'chatgpt') {
      const nodes = new Set();
      
      // Try primary attribute selector
      document.querySelectorAll('[data-message-author-role="assistant"]').forEach(el => {
        const container = el.closest('[data-testid^="conversation-turn-"], [data-testid="conversation-turn"], article, section') || el.parentElement?.parentElement || el;
        nodes.add(container);
      });
      
      // If that found nothing, try scanning all message containers and filter by presence of action buttons
      if (nodes.size === 0) {
        document.querySelectorAll('[data-testid^="conversation-turn-"], [role="listitem"]').forEach(el => {
          const text = el.innerText || '';
          // Heuristic: assistant messages tend to be long-form and have action buttons
          if (text.length > 20 && el.querySelector('button[aria-label*="Copy" i], button[data-testid*="copy" i]')) {
            nodes.add(el);
          }
        });
      }
      
      // Ultimate fallback: grab all substantial divs that look like message containers
      if (nodes.size === 0) {
        document.querySelectorAll('div[role="article"], article, div[data-message-author-role]').forEach(el => {
          const text = (el.innerText || '').trim();
          if (text.length > 20) nodes.add(el);
        });
      }
      
      return Array.from(nodes).filter(Boolean);
    }
    if (STATE.provider === 'gemini') {
      const candidates = [
        '[data-author="model"]',
        '[aria-label*="response" i]',
        '.assistant',
      ];
      const nodes = new Set();
      candidates.forEach(sel => document.querySelectorAll(sel).forEach(n => nodes.add(n.closest('article, div, section') || n)));
      return Array.from(nodes).filter(Boolean);
    }
    return [];
  }

  function extractQAFromBubble(node) {
    // Best-effort extraction. For MVP, we pull the latest user prompt and assistant text.
    let answer = (node?.innerText || '').trim();
    let question = '';
    // Ensure we have a stable locator for this DOM node so we can jump back later
    const locator = ensureLocatorFor(node);
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
    return { provider: STATE.provider, question, answer, locator };
  }

  function findLatestAssistantBubble() {
    const bubbles = findAssistantBubbles();
    // choose the last one in DOM order with sufficient text length
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const n = bubbles[i];
      const txt = (n?.innerText || '').trim();
      // accept very short answers too (e.g., "hi")
      if (txt && txt.replace(/\s+/g, '').length > 0) return n;
    }
    return null;
  }

  function attachStar(node) {
    if (!node || node.dataset.sidequestAttached) return;
    node.dataset.sidequestAttached = '1';
    // Pre-assign a locator id so future lookups can find the exact DOM node again
    ensureLocatorFor(node);
    const btn = document.createElement('button');
    btn.innerHTML = starSvg();
    btn.title = 'Save to SideQuest';
    btn.className = 'sidequest-star-btn';
    Object.assign(btn.style, {
      position: 'absolute',
      top: '8px',
      right: '8px',
      fontSize: '0',
      cursor: 'pointer',
      background: '#fff',
      border: '1px solid rgba(0,0,0,0.1)',
      borderRadius: '6px',
      padding: '4px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
      zIndex: '2147483646',
      color: '#111'
    });
    btn.addEventListener('click', () => {
      const payload = extractQAFromBubble(node);
      chrome.runtime.sendMessage({ type: 'SIDEQUEST_BOOKMARK', payload });
    });

    // Create a relatively positioned wrapper if needed
    const wrapper = node;
    try {
      if (getComputedStyle(wrapper).position === 'static') {
        wrapper.style.position = 'relative';
      }
    } catch {}
    wrapper.appendChild(btn);
  }

  function scanAndAttachStars() {
    const bubbles = findAssistantBubbles();
    bubbles.forEach(attachStar);
    // Show floating star on latest bubble as an extra fallback
    if (bubbles.length) ensureOverlayFor(bubbles[bubbles.length - 1]); else hideOverlay();
  }

  const debouncedScan = debounce(scanAndAttachStars, 300);
  const mo = new MutationObserver(() => debouncedScan());

  function startObserving() {
    mo.observe(document.documentElement, { childList: true, subtree: true });
    scanAndAttachStars();
  }

  window.addEventListener('scroll', positionOverlay, { passive: true });
  window.addEventListener('resize', positionOverlay, { passive: true });

  // Handle messages from sidebar
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'SIDEQUEST_CAPTURE_LATEST') {
      try {
        let node = findLatestAssistantBubble();
        if (node) {
          const payload = extractQAFromBubble(node);
          chrome.runtime.sendMessage({ type: 'SIDEQUEST_BOOKMARK', payload }, () => sendResponse({ ok: true }));
          return true;
        }
        // Fallback: capture current text selection if any
        const sel = (window.getSelection()?.toString() || '').trim();
        if (sel) {
          const payload = { provider: STATE.provider, question: '', answer: sel, locator: null };
          chrome.runtime.sendMessage({ type: 'SIDEQUEST_BOOKMARK', payload }, () => sendResponse({ ok: true, via: 'selection' }));
          return true;
        }
        sendResponse({ ok: false, error: 'no-bubble' });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return true;
    }
    if (msg?.type === 'SIDEQUEST_JUMP_TO') {
      try {
        const node = findNodeByLocator(msg.locator, msg.fallbackText);
        if (node) {
          // Smooth scroll and a subtle highlight
          node.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
          try {
            node.style.transition = 'box-shadow 0.8s ease';
            const oldShadow = node.style.boxShadow;
            node.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.45)';
            setTimeout(() => (node.style.boxShadow = oldShadow || ''), 1200);
          } catch {}
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'not-found' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return true;
    }
    if (msg?.type === 'SIDEQUEST_SIDEBAR_MINIMIZE') {
      minimizeSidebar();
      sendResponse?.({ ok: true });
      return true;
    }
    if (msg?.type === 'SIDEQUEST_SIDEBAR_RESTORE') {
      restoreSidebar();
      sendResponse?.({ ok: true });
      return true;
    }
    return false;
  });

  // Floating overlay star anchored to the latest assistant bubble
  let overlayStarEl = null; let overlayTarget = null; let overlayBound = null;
  function ensureOverlayFor(node) {
    overlayTarget = node;
    if (!overlayStarEl) {
      overlayStarEl = document.createElement('button');
      overlayStarEl.innerHTML = starSvg();
      overlayStarEl.title = 'Save to SideQuest';
      Object.assign(overlayStarEl.style, {
        position: 'absolute', border: '1px solid rgba(0,0,0,0.1)', background: '#fff', borderRadius: '6px',
        padding: '4px', fontSize: '0', cursor: 'pointer', zIndex: 2147483647, boxShadow: '0 1px 2px rgba(0,0,0,0.08)', color: '#111'
      });
      overlayStarEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!overlayTarget) return;
        const payload = extractQAFromBubble(overlayTarget);
        chrome.runtime.sendMessage({ type: 'SIDEQUEST_BOOKMARK', payload });
      });
      document.body.appendChild(overlayStarEl);
    }
    positionOverlay();
  }
  // Position and hide helpers for the floating overlay star (needed by scroll/resize listeners)
  function positionOverlay() {
    if (!overlayStarEl || !overlayTarget) return;
    const r = overlayTarget.getBoundingClientRect();
    overlayStarEl.style.top = `${Math.max(0, r.top + window.scrollY + 6)}px`;
    overlayStarEl.style.left = `${Math.max(0, r.right + window.scrollX - 28)}px`;
    overlayStarEl.style.display = r.width > 0 && r.height > 0 ? 'block' : 'none';
  }

  function hideOverlay() {
    if (overlayStarEl) overlayStarEl.style.display = 'none';
  }

  // --- Jump-to helpers -----------------------------------------------------
  function ensureLocatorFor(node) {
    if (!node) return null;
    // Attach a persistent data attribute id on the assistant bubble container
    if (!node.dataset.sidequestId) {
      node.dataset.sidequestId = 'sq-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    const text = (node.innerText || '').trim();
    return { type: 'dataset', id: node.dataset.sidequestId, fp: fingerprint(text) };
  }

  function fingerprint(text) {
    try {
      let h = 2166136261;
      const s = String(text || '');
      for (let i = 0; i < s.length; i++) {
        h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      }
      return (h >>> 0).toString(16);
    } catch { return null; }
  }

  function findNodeByLocator(locator, fallbackText) {
    try {
      if (locator?.type === 'dataset' && locator?.id) {
        const escaped = (window.CSS && CSS.escape) ? CSS.escape(locator.id) : locator.id.replace(/"/g, '\\"');
        const n = document.querySelector(`[data-sidequest-id="${escaped}"]`);
        if (n) return n;
      }
      // Fallback: match by fingerprint on assistant bubbles
      const fpTarget = locator?.fp || fingerprint(fallbackText || '');
      if (fpTarget) {
        const candidates = findAssistantBubbles();
        for (let i = candidates.length - 1; i >= 0; i--) {
          const c = candidates[i];
          const txt = (c.innerText || '').trim();
          if (fingerprint(txt) === fpTarget) {
            // Reattach id for future fast lookup
            ensureLocatorFor(c);
            return c;
          }
        }
      }
    } catch {}
    return null;
  }

  function starSvg() {
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9"></polygon></svg>';
  }

  function hasInternalStar(node) {
    try { return !!node.querySelector('.sidequest-star-btn'); } catch { return false; }
  }

  // Override scan to only show overlay if the latest bubble has no internal star
  function scanAndAttachStars() {
    const bubbles = findAssistantBubbles();
    bubbles.forEach(attachStar);
    if (bubbles.length) {
      const last = bubbles[bubbles.length - 1];
      if (!hasInternalStar(last)) ensureOverlayFor(last); else hideOverlay();
    } else {
      hideOverlay();
    }
  }

  // --- Sidebar minimize/restore ------------------------------------------
  function ensureFloatingHandle() {
    if (STATE.handleBtn) return;
    const btn = document.createElement('button');
    btn.textContent = '◀ SideQuest';
    Object.assign(btn.style, {
      position: 'fixed',
      top: '10px',
      right: '8px',
      zIndex: 2147483647,
      padding: '6px 10px',
      borderRadius: '999px',
      border: '1px solid rgba(0,0,0,0.12)',
      background: '#ffffff',
      color: '#111',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      cursor: 'pointer',
      fontSize: '12px',
      display: 'none'
    });
    btn.addEventListener('click', () => restoreSidebar());
    document.documentElement.appendChild(btn);
    STATE.handleBtn = btn;
  }

  function minimizeSidebar() {
    if (!STATE.sidebarIframe) return;
    try {
      STATE.sidebarIframe.style.transform = 'translateX(100%)';
      STATE.sidebarIframe.style.opacity = '0.9';
      if (STATE.handleBtn) STATE.handleBtn.style.display = 'inline-block';
      chrome.storage.local.set({ 'sidequest.sidebarMinimized': true });
    } catch {}
  }

  function restoreSidebar() {
    if (!STATE.sidebarIframe) return;
    try {
      STATE.sidebarIframe.style.transform = 'translateX(0)';
      STATE.sidebarIframe.style.opacity = '1';
      if (STATE.handleBtn) STATE.handleBtn.style.display = 'none';
      chrome.storage.local.set({ 'sidequest.sidebarMinimized': false });
    } catch {}
  }



  // Initialize
  ensureSidebar();
  startObserving();
  // Restore minimized state on load
  chrome.storage.local.get('sidequest.sidebarMinimized', (res) => {
    if (res && res['sidequest.sidebarMinimized']) minimizeSidebar();
  });
  
  // Log startup status (no send/input references)
  setTimeout(() => {
    const bubbles = findAssistantBubbles();
    console.log('[SideQuest READY] provider=' + STATE.provider + ' bubbles=' + bubbles.length);
  }, 500);
 })();// ---
// SideQuest helpers: selection capture + page info gatherer with safe scoping
// This mirrors the user's custom logic but fixes scope issues and SPA URL changes.
// ---

(function () {
  const SQ = {
    pageTitle: '',
    metaDescription: '',
    currentUrl: location.href,
  };

  // Capture selected text into chrome.storage.local
  document.addEventListener('mouseup', () => {
    try {
      const selectedText = (window.getSelection()?.toString() || '').trim();
      if (selectedText) {
        chrome.storage.local.set({ selectedText, hasSelection: true });
        // optional: console.log(`The selected text is ${selectedText}`);
      }
    } catch {}
  });

  function sqCleanupTitle(anything) {
    const cleanedText = String(anything || '')
      .replace(/[^\w\s-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .trim();
    const commonStopWords = [
      "i","me","my","myself","we","our","ours","ourselves","you","your","yours","yourself","yourselves","he","him","his","himself","she","her","hers","herself","it","its","itself","they","them","their","theirs","themselves","what","which","who","whom","this","that","these","those","am","is","are","was","were","be","been","being","have","has","had","having","do","does","did","doing","a","an","the","and","but","if","or","because","as","until","while","of","at","by","for","with","about","against","between","into","through","during","before","after","above","below","to","from","up","down","in","out","on","off","over","under","again","further","then","once","here","there","when","where","why","how","all","any","both","each","few","more","most","other","some","such","no","nor","not","only","own","same","so","than","too","very","s","t","can","will","just","don","should","now"
    ];
    const usefulWords = cleanedText
      .split(' ')
      .filter(w => w.length > 2 && !commonStopWords.includes(w));
    return usefulWords.slice(0, 6).join(' ');
  }

  function sqGatherPageInfo() {
    try {
      SQ.pageTitle = document.title || '';
      const metaTag = document.querySelector('meta[name="description"]');
      SQ.metaDescription = metaTag?.content || '';
      const cleanedTitle = sqCleanupTitle(SQ.pageTitle);
      chrome.storage.local.set({
        rawPageTitle: SQ.pageTitle,
        pageTitle: cleanedTitle,
        metaDescription: SQ.metaDescription,
        pageUrl: location.href,
        hasSelection: false,
      });
    } catch {}
  }

  // Run on ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sqGatherPageInfo);
  } else {
    sqGatherPageInfo();
  }

  // SPA URL change detection (polling fallback)
  setInterval(() => {
    if (location.href !== SQ.currentUrl) {
      SQ.currentUrl = location.href;
      sqGatherPageInfo();
    }
  }, 1000);
})();

