// Background service worker (MV3)
// - Stores threads in chrome.storage.local
// - Routes messages between sidebar and content

const STORAGE_KEY = 'sidequest.threads';

async function getThreads() {
  const { [STORAGE_KEY]: data } = await chrome.storage.local.get(STORAGE_KEY);
  return data || { threads: {}, order: [] };
}

async function setThreads(data) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function handleBookmark(payload) {
  const data = await getThreads();
  const id = uuid();
  const now = Date.now();
  data.threads[id] = {
    id,
    title: payload?.question?.slice(0, 80) || 'Thread',
    provider: payload?.provider || 'chatgpt',
    createdAt: now,
    updatedAt: now,
    messages: [
      payload?.question ? { role: 'user', content: payload.question, timestamp: now } : null,
      payload?.answer ? { role: 'assistant', content: payload.answer, timestamp: now } : null
    ].filter(Boolean)
  };
  data.order.unshift(id);
  await setThreads(data);
  chrome.runtime.sendMessage({ type: 'SIDEQUEST_THREADS_UPDATED' }).catch(() => {});
  return id;
}

async function appendMessage(threadId, msg) {
  const data = await getThreads();
  if (!data.threads[threadId]) return;
  data.threads[threadId].messages.push(msg);
  data.threads[threadId].updatedAt = Date.now();
  await setThreads(data);
  chrome.runtime.sendMessage({ type: 'SIDEQUEST_THREADS_UPDATED' }).catch(() => {});
}

// Broadcast helper to active tab (content script)
async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, message);
      return res;
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  return { ok: false, error: 'no-active-tab' };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'SIDEQUEST_BOOKMARK': {
        const id = await handleBookmark(message.payload || {});
        sendResponse({ ok: true, threadId: id });
        break;
      }
      case 'SIDEQUEST_LIST_THREADS': {
        const data = await getThreads();
        sendResponse({ ok: true, data });
        break;
      }
      case 'SIDEQUEST_APPEND_MESSAGE': {
        await appendMessage(message.threadId, message.msg);
        sendResponse({ ok: true });
        break;
      }
      case 'SIDEQUEST_SEND_FOLLOWUP': {
        // Forward to content script to relay to Tampermonkey via postMessage
        const res = await sendToActiveTab({ type: 'SIDEQUEST_SEND_FOLLOWUP', text: message.text });
        sendResponse(res?.ok === false ? res : { ok: true });
        break;
      }
      case 'SIDEQUEST_CAPTURE_LATEST': {
        const res = await sendToActiveTab({ type: 'SIDEQUEST_CAPTURE_LATEST' });
        sendResponse(res?.ok === false ? res : { ok: true });
        break;
      }
      default:
        sendResponse({ ok: false });
    }
  })();
  return true; // keep channel open for async
});
