# SideQuest — Threaded Sidebar for Chatbots

> **One-line:** A Chrome extension that turns chatbot answers into persistent, threaded side-context cards (bookmarks) so follow-ups live beside the main conversation — not buried beneath it.

---

## Table of contents

1. [Project Overview](#project-overview)
2. [Goals & Non-goals](#goals--non-goals)
3. [High-level user flows](#high-level-user-flows)
4. [Architecture & Components](#architecture--components)
5. [Storage schema & data model](#storage-schema--data-model)
6. [Detailed UI / UX behavior & wireframes](#detailed-ui--ux-behavior--wireframes)
7. [DOM integration strategy](#dom-integration-strategy)
8. [Key technical algorithms & snippets](#key-technical-algorithms--snippets)
9. [Permissions & manifest.json (Manifest V3)](#permissions--manifestjson-manifest-v3)
10. [Security, privacy & legal considerations](#security-privacy--legal-considerations)
11. [Testing strategy (unit, integration, e2e)](#testing-strategy-unit-integration-e2e)
12. [Performance & reliability](#performance--reliability)
13. [Accessibility & internationalization](#accessibility--internationalization)
14. [Packaging, publishing & distribution](#packaging-publishing--distribution)
15. [Analytics, telemetry & opt-in settings](#analytics-telemetry--opt-in-settings)
16. [CI/CD & release checklist](#cicd--release-checklist)
17. [Open issues / future improvements](#open-issues--future-improvements)
18. [Contribution guide & license](#contribution-guide--license)

---

## Project overview

SideQuest is a privacy-first Chrome extension that overlays a right-hand sidebar on web-based chatbot UIs (initially targeting ChatGPT and Google Gemini). It allows users to **bookmark specific answer bubbles**, attach threaded follow-ups to those bookmarks, and run those follow-ups using the chatbot UI while keeping the user's viewport fixed. The extension captures the generated reply and appends it to the corresponding thread — preserving a clean, navigable learning workflow.

This README is a full specification for building an MVP production-ready extension intended for public distribution.

---

## Goals & Non-goals

### Goals (MVP)

* Inject bookmark (⭐) affordance next to each chatbot **answer bubble**.
* Create a collapsible right-hand sidebar to store and organize threads.
* Allow typed follow-ups inside a thread to be sent to the chatbot **by automating the page UI** (no API use required).
* Preserve user scroll position while sending follow-ups.
* Detect the chatbot reply using `MutationObserver` and capture it to the sidebar thread.
* Persist bookmarks/threads locally (localStorage) and provide an export/import JSON utility.
* Implement a professional UI, good error handling, and a clear privacy statement.

### Non-goals (MVP)

* Server-side storage or syncing (no cloud backend) — optional future feature.
* Built-in LLM inference or calling 3rd-party APIs for answers (avoid billing complexity).
* Multi-account server-side analytics by default — only opt-in telemetry.

---

## High-level user flows

### 1. Bookmarking an answer

* User sees a chatbot answer bubble.
* Clicks the injected ⭐ button.
* Extension opens a thread card in the sidebar pre-filled with the **question** and **answer**.
* User can add a note or tags and save.

### 2. Asking a follow-up

* User opens a thread and writes a follow-up question in the thread textarea.
* On `Send`, extension:

  1. Saves current `window.scrollY`.
  2. Focuses chatbot input (via DOM selectors), pastes context + follow-up, and simulates Enter.
  3. Immediately restores the original scroll position.
  4. Starts waiting for new reply DOM node(s) using a `MutationObserver`.
  5. When the reply appears, extracts plaintext and attachments, appends to thread, and shows a toast.

### 3. Thread navigation

* Users can expand/collapse threads, search threads by text/tags, export thread as Markdown/JSON.

### 4. Unbookmark / delete

* Remove thread → archived / permanently delete. Provide confirm modal.

---

## Architecture & Components

```
Chrome Extension (MV3)
├─ manifest.json
├─ icons/
├─ content/
│  ├─ content.js         // page DOM integration + star injection + mutation observer registration
│  └─ utils.js           // DOM helpers, selector maps per-provider
├─ sidebar/
│  ├─ sidebar.html
│  ├─ sidebar.js         // thread UI, storage, send-follow-up orchestration
│  └─ sidebar.css
├─ background/
│  └─ background.js      // minimal: handles extension commands, optional context menu
└─ assets/
   └─ i18n.json
```

### Responsibilities

* **content.js**: DOM discovery for the current provider (ChatGPT / Gemini). Inject star buttons into detected answer bubbles. Implement `MutationObserver` to detect new replies and tag them with metadata so they can be grabbed by `sidebar`. Use `window.postMessage` or `chrome.runtime.sendMessage` for content ↔ sidebar comms.

* **sidebar.js**: UI rendering for threads, bookmarking CRUD, follow-up orchestration (send follow-ups, capture replies, attach to threads), storage layer, search, export, and settings.

* **background.js**: Optional. For commands (keyboard shortcuts), long-lived tasks, context menu entries. Keep background minimal to comply with MV3.

---

## Storage schema & data model

Start with `localStorage` for MVP. Use a single key `sidequest.data` that stores the entire JSON blob. Later, migrate to IndexedDB for scale.

Example schema (v1):

```json
{
  "version": "1.0",
  "threads": {
    "uuid-1": {
      "id": "uuid-1",
      "provider": "chatgpt",
      "providerMessageId": "msg-3278",
      "question": "Why do LLMs convert text to tokens?",
      "answer": "Because neural networks operate on numbers...",
      "createdAt": "2025-11-01T22:03:00Z",
      "tags": ["nlp","tokens"],
      "notes": "Read for exam",
      "messages": [
        { "role": "assistant", "text": "Because neural...", "createdAt":"..." },
        { "role": "user", "text": "How is vocabulary selected?", "createdAt":"..." },
        { "role": "assistant", "text": "Vocabulary is...", "createdAt":"..." }
      ]
    }
  },
  "meta": {
    "lastBackupAt": null,
    "settings": { "exportOnUninstall": false }
  }
}
```

Notes:

* `providerMessageId` should be the DOM-derived stable id or a generated id tied to the DOM node (store a hashed fingerprint of the text + timestamp to re-identify nodes across reloads where possible).
* `messages` holds the chronological messages for that thread. The original `question` and `answer` map to messages[0..1].

---

## Detailed UI / UX behavior & wireframes

### Sidebar variants

* **Persistent (A)**: right-hand fixed pane, always visible (good for power users).
* **Collapsible (B)**: collapsed by default, opens when star clicked (Notion comments style).

MVP: implement **collapsible** with a small floating handle — less intrusive.

### Thread card layout

```
[Header]  Title (editable) | Tag icons | More (export, delete)
[Context]  "Question" (muted)  
[Context]  "Answer" (boxed)  
[Messages] chronological list (user/assistant)  
[Composer] textarea + Send button + quick templates
```

### UX details

* Star hover reveals tooltip: "Save to SideQuest".
* After sending follow-up, show small toast: "Answer added to 'Tokenization'".
* On reply capture failure: show inline error in thread with steps for manual fallback (e.g., "Click 'Capture latest reply'").
* Provide keyboard shortcuts: `Ctrl+Shift+S` to toggle sidebar, `Ctrl+Enter` send in composer.

---

## DOM integration strategy (provider-specific)

**Important:** Chat UIs have different DOMs and may change. Build abstraction layers:

* `providers/chatgpt.js`
* `providers/gemini.js`
* `providers/claude.js` (future)

Each provider module exposes:

```js
{
  matchUrl(url) => boolean,
  findAnswerBubbles() => NodeList,
  getBubbleText(node) => { question, answer, messageId },
  attachStar(node, onClick),
  getChatInput() => HTMLElement,
  sendText(text) => Promise<void>,
  observeNewReplies(onNewReplyCallback) => ObserverHandle
}
```

This keeps `content.js` small — just `detectProvider()` + load provider module.

### Bubble identification

* Prefer semantic selectors if UI exposes them.
* Otherwise use robust fallback selectors + heuristics:

  * Select nodes with role `listitem`, or class names like `.message`, `.chat-line`.
  * Use bubble length and presence of author marker (assistant vs user) to separate.
* For `providerMessageId`, compute `sha1(node.innerText + node.dataset.timestamp || '')` to create a fingerprint.

---

## Key technical algorithms & snippets

### 1) Injecting star buttons (safe & idempotent)

```js
function attachStarToBubble(bubbleNode) {
  if (bubbleNode.dataset.sidequestAttached) return;
  bubbleNode.dataset.sidequestAttached = '1';
  const btn = document.createElement('button');
  btn.className = 'sidequest-star';
  btn.title = 'Save to SideQuest';
  btn.innerText = '⭐';
  btn.addEventListener('click', () => {
    const payload = provider.getBubbleText(bubbleNode);
    chrome.runtime.sendMessage({ type: 'SIDEQUEST_BOOKMARK', payload });
  });
  // append visually near bubble header; be careful to not break layout
  bubbleNode.appendChild(btn);
}
```

### 2) Scroll freeze + send follow-up

```js
async function sendFollowUpViaChat(chatInputNode, contextText, followUpText) {
  const composed = `${contextText}\n\nFollow-up: ${followUpText}`;
  const oldY = window.scrollY;

  // focus and paste
  chatInputNode.focus();
  chatInputNode.value = composed; // or use execCommand if contenteditable

  // trigger send (simulate Enter or click send button)
  simulateEnter(chatInputNode);

  // restore scroll immediately
  window.scrollTo(0, oldY);

  // now listen for reply via observer registered earlier
}
```

**Notes:** Different chat inputs are either `<textarea>` or `contenteditable`. Use provider abstraction helpers to set value + send.

### 3) MutationObserver example to capture new replies

```js
const observer = new MutationObserver(mutations => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (provider.isAssistantBubble(node) && !node.dataset.sidequestCaptured) {
        node.dataset.sidequestCaptured = '1';
        const text = provider.getBubbleText(node).answer;
        // send to sidebar via postMessage
        window.postMessage({ sidequest: true, type: 'NEW_REPLY', text }, '*');
      }
    }
  }
});

observer.observe(provider.getMessageListRoot(), { childList: true, subtree: true });
```

### 4) Reliable capture (edge cases)

* Some providers lazy-render content — reply node may be built incrementally. When you detect an assistant bubble, wait 200–600ms and then sample innerText until it stabilizes (use a simple debounce / stabilization check).
* If capture seems incomplete, allow a manual `Capture latest reply` button in the thread.

---

## Permissions & manifest.json (Manifest V3)

Minimal required permissions:

* `scripting` — to inject scripts
* `storage` — for localStorage / chrome.storage usage (optional; prefer chrome.storage.local)
* `activeTab` / `tabs` — to check active tab URL and inject when appropriate
* host permissions for the target chat domains (later use):

  * `https://chat.openai.com/*`
  * `https://gemini.google.com/*`

Example `manifest.json` (abridged):

```json
{
  "manifest_version": 3,
  "name": "SideQuest",
  "version": "1.0.0",
  "description": "Bookmark chatbot answers and thread follow-ups in a sidebar.",
  "icons": { "128": "icons/icon128.png" },
  "action": { "default_title": "SideQuest" },
  "permissions": ["scripting", "storage", "activeTab"],
  "host_permissions": ["https://chat.openai.com/*", "https://gemini.google.com/*"],
  "background": { "service_worker": "background/background.js" },
  "content_scripts": [
    {
      "matches": ["https://chat.openai.com/*", "https://gemini.google.com/*"],
      "js": ["content/content.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    { "resources": ["sidebar/*", "icons/*"], "matches": ["<all_urls>"] }
  ]
}
```

**Tip:** Keep host permissions minimal during development; request additional domains via extension prompts or manifest updates as you expand.

---

## Security, privacy & legal considerations

### Privacy-first principles

* **Do not** send any user conversation data to remote servers by default.
* All bookmarks and threads stored locally.
* If you implement cloud sync later, make it **opt-in** and encrypt data client-side.
* Provide a clear Settings > Privacy page describing exactly what is saved.

### Security

* Don’t store API keys in extension code. If you add API features later, use OAuth or require users to paste keys into settings (store in chrome.storage with `sensitive` flag if supported).
* Sanitize any HTML scraped from chat DOM before insertion into sidebar (display as text or sanitize via DOMPurify).

### Terms of service

* Check the target providers’ terms of service for automated UI interactions and scraping. Add an explanation in the FAQ about how SideQuest automates the UI and that users are responsible for complying with provider TOS.

---

## Testing strategy (unit, integration, e2e)

### Unit tests

* Use Jest or Vitest for pure JS utilities (storage, fingerprinting, text extraction logic). Content scripts are hard to unit-test but utility functions should be covered.

### Integration tests

* Use headless browsers (Playwright) to simulate provider pages and verify the `content.js` injection, star attachment, and `MutationObserver` behavior.
* Mock provider DOM with test fixtures representing chat UIs and run full flows.

### E2E tests

* Use Playwright to run the extension in a real browser context and perform full flows:

  1. Open target site URL.
  2. Ensure star icons are injected.
  3. Click star → thread created.
  4. Type follow-up in sidebar → send.
  5. Simulate provider reply → sidebar captures reply.

**Test CI:** Run Playwright tests on GitHub Actions with the extension loaded into the browser.

---

## Performance & reliability

* Use ID memoization for bubble nodes to avoid re-attaching star buttons repeatedly.
* Throttle DOM scans (use `requestIdleCallback` or a MutationObserver with debounced responses).
* Use `chrome.storage.local` for larger storage and quota benefits vs localStorage.
* Avoid huge memory retention by capping threads stored by default (e.g., 200 threads) and offer archive/cleanup.

---

## Accessibility & internationalization

* Label star buttons with `aria-label` and keyboard focusability.
* Support `prefers-reduced-motion` in CSS.
* Design for high contrast and test with screen readers; thread composer should be keyboard-accessible.
* Provide localization scaffolding: a simple `i18n.json` and use `chrome.i18n` APIs during packaging.

---

## Packaging, publishing & distribution

### Chrome Web Store prep

* Create a privacy policy page that explicitly states local-only storage unless user opts in to cloud sync or analytics.
* Prepare screenshots and a short demo GIF of the sidebar in action.
* Provide detailed description and ensure you use correct categories and contact info.

### Release assets

* Build ZIP with minimized JS, sourcemaps optional (private), icons, and manifest.
* Use `web-ext` or a small Node script to zip and upload to the Chrome Web Store Developer Dashboard.

### Versioning

* Follow semver (major.minor.patch) and update `manifest.json` for each release.

---

## Analytics, telemetry & opt-in settings

* If you want product analytics, make it **opt-in**. Use a privacy-aware provider (e.g., PostHog self-hosted or Plausible) and only collect anonymous events (no content). Key events:

  * `thread_created` (no content)
  * `followup_sent` (no content)
  * `capture_success` / `capture_failure`

Provide settings to purge analytics data and to disable telemetry.

---

## CI/CD & release checklist

1. Unit tests pass.
2. Integration & Playwright tests pass.
3. Build artifacts created (minified JS).
4. Security scan for any accidental secrets.
5. Update `CHANGELOG.md`.
6. Bump `version` in manifest.
7. Create GitHub release with assets + release notes.
8. Upload package to Chrome Web Store.
9. Tweet / Product Hunt launch checklist (marketing).

---

## Open issues / future improvements

* Add optional cloud sync with end-to-end encryption.
* Multi-domain provider support and auto-updates for selector maps.
* Plugin system for provider-specific renderers (e.g., code blocks, images, attachments).
* Shared threads / team sync (paid feature).

---

## Contribution guide & license

* Use permissive license: MIT by default. Include `LICENSE` file.
* Contributor workflow: fork → branch → PR → CI checks → merge.

---

## Appendix A — Helpful utility functions (full examples)

### Stable fingerprint (sha1 placeholder)

```js
// lightweight fingerprint for bubble text
function fingerprint(text) {
  // simple hash fallback for demo; use a stable hash lib in production
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return (h >>> 0).toString(16);
}
```

### Debounce utility

```js
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
```

---

## Appendix B — Example end-to-end timeline (developer POV)

1. Scaffold extension and manifest.
2. Implement provider abstraction for ChatGPT.
3. Implement star injection & basic sidebar UI.
4. Implement follow-up send orchestration and scroll freeze.
5. Implement MutationObserver capture & append to thread.
6. Polish UI, add export/import, tests.
7. Hit QA & publish.

---

## Final notes

This README is intentionally exhaustive to hand to a code-generation assistant like Copilot Pro and to act as your canonical spec. If you want, I can now generate the **exact starter files** (manifest.json, content script, provider abstraction, sidebar HTML/CSS/JS) in a ready-to-run scaffold. Tell me if you want:

* `A` — full scaffold (MVP) with ChatGPT provider only
* `B` — full scaffold multi-provider (ChatGPT + Gemini)
* `C` — just minimal manifest + content script + sidebar template

Pick `A`, `B`, or `C` and I will generate the starter code files.

### c) Reliable capture (edge cases)

Some chat providers lazy‑render or chunk responses — the assistant bubble may update several times. To safely capture the **final** rendered message:

```js
let captureTimeout;

observer = new MutationObserver(() => {
  clearTimeout(captureTimeout);
  captureTimeout = setTimeout(() => {
    const latest = findLatestAssistantBubble();
    if (latest) saveReplyToSidebar(latest.innerText);
  }, 500); // waits for rendering to finish
});
```

> Using a debounce (delay) ensures you don’t record partial or incomplete text.

---

## 🧩 6. UI/Interaction Flow (Detailed)

```
[User clicks ⭐ on an answer bubble]
          ↓
Extension extracts message + question
          ↓
Stored as a `Thread` object in localStorage
          ↓
Sidebar shows Thread card (Q + A)
          ↓
User types follow‑up inside sidebar
          ↓
Extension injects context + follow‑up back into chat input
          ↓
Message sent (programmatically triggers Enter)
          ↓
MutationObserver detects new GPT message
          ↓
Reply copied back into Thread block → appended under Thread
```

### Sidebar UX goals

* Never lose the original message context
* Maintain thread clarity (mini chat per concept)
* Zero scroll jumps in main chat

---

## 🏗️ 7. Data Model (storage schema)

Minimal Thread structure:

```ts
interface Thread {
  id: string;             // uuid
  createdAt: number;
  provider: 'chatgpt' | 'gemini';
  messages: Array<Msg>;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
```

### Saved to storage

```js
localStorage.setItem("threads", JSON.stringify(threads));
```

> Later improvement: switch to IndexedDB for syncing + larger data.

---

## 🧱 8. File Structure (final)

```
extension/
├─ manifest.json
├─ content.js              # runs inside ChatGPT/Gemini DOM
├─ sidebar/
│   ├─ index.html
│   ├─ sidebar.js
│   └─ sidebar.css
├─ assets/
│   └─ icons/
└─ utils/
    └─ storage.js
```

---

## 🚀 9. Build & Ship

### ▶️ Dev Mode

1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Load unpacked → select folder

### 🧪 Testing checklist

* [ ] Can bookmark answer
* [ ] Sidebar shows thread
* [ ] Follow‑up inserts into input box
* [ ] GPT reply captured without scroll jump
* [ ] Thread auto‑updates

### 🏁 Publishing to Chrome Web Store

1. Bundle + zip folder
2. Create Developer account
3. Add store listing assets
4. Upload build + publish

> Users don’t need API keys — extension works in free tier.

---

## 🧊 10. Future Enhancements (Roadmap)

✅ Search threads
✅ Edge/Gemini support
🔜 Export thread → Markdown/Notion
🔜 Sync threads to cloud (IndexedDB → Supabase)
🔜 Tagging and color labels like Notion DB

---

## 🏁 Final Note

> You are not building *another chatbot.*
> You are building a **learning interface layer for any chatbot.**

When you ship this, people will use ChatGPT/Gemini/Claude in a way that’s **actually usable for learning.**

---

**Ready to code.**

If you want, I can now generate:

* `manifest.json`
* `content.js`
* `sidebar.html` + CSS + JS scaffold

Just say: **"generate code scaffold"**.


## 3. Feature Goals (Recap & Clarity)

SideQuest (your Chrome extension) solves this frustration:

> "When I ask a follow‑up, ChatGPT scrolls away and loses context. I want side context threads like Notion."

### ✅ What the extension *should* do

* Capture each **assistant answer** automatically
* Let user click **"Follow‑up"** on any past answer
* Send follow‑up to ChatGPT **without leaving scroll position**
* Store that follow‑up + new answer inside a **sidebar thread**

### ❌ What the extension should NOT do

* Replace ChatGPT UI
* Read or store entire conversation without user action
* Force paid API usage

You are not building a UI competitor.
You are adding *memory + structure* to ChatGPT/Gemini.

---

## 4. Architecture (High‑Level)

```
┌───────── Browser Tab (ChatGPT / Gemini / Claude) ───────┐
│ 1. Content Script injects MutationObserver               │
│ 2. Detects new assistant answer bubbles                  │
│ 3. When user clicks "Follow-up" → autofill input box     │
│ 4. Extension keeps scroll fixed                          │
└──────────────▲───────────────────────────────┘
               │ send follow‑up
┌──────────────┴───────────────┐
│    Extension Background       │
│   - Stores thread in local DB │
│   - Routes UI messages        │
└──────────────▲───────────────┘
               │ display
┌──────────────┴───────────────┐
│        Sidebar UI             │
│  - Thread list                │
│  - Each thread → messages     │
│  - Click = jump to bubble     │
└───────────────────────────────┘
```

### File structure

```
/extension
  /public
    sidebar.html
    sidebar.css
  /src
    content.js        ← injected into chat ui
    background.js     ← manages state & storage
    sidebar.js        ← UI logic (threads)
    providers/
      chatgpt.js
      gemini.js
  manifest.json
```

---

## 5. Implementation Planning

| Phase       | Scope                            | Output                               |
| ----------- | -------------------------------- | ------------------------------------ |
| **Phase 1** | Detect bubbles + capture answers | Text stabilization + storage working |
| **Phase 2** | Sidebar w/ follow‑up buttons     | Visible thread management UI         |
| **Phase 3** | Provider abstraction             | Works on Gemini/ChatGPT/Claude       |
| **Phase 4** | Polish (telemetry, onboarding)   | Publish to Chrome store              |

### Success metric

> User can click ANY past paragraph and start a new follow‑up branch **without losing place in chat**.

---

✅ Part 3–5 Completed
Next part continues with: **"Reliable Capture (edge cases)"** (already in your Part 2).





## 6. Reliable Capture (continued)

When detecting an assistant bubble, do **not** assume the bubble is fully rendered on first DOM insertion. Some chat UIs progressively stream / mount nodes.

### ✅ Stabilization Strategy

**Algorithm: text-stabilization capture**

1. Observe newly created assistant bubble.
2. Wait 150–600ms (debounced). If more DOM mutations are detected inside that bubble, reset timer.
3. Keep sampling `innerText()` until 2 consecutive samples match.
4. Once stable, commit capture → store into thread.

```js
function waitUntilStableText(node, onStable) {
  let last = "";
  let tries = 0;
  const interval = setInterval(() => {
    const now = node.innerText.trim();
    if (now === last && now.length > 0) {
      clearInterval(interval);
      onStable(now);
    }
    last = now;
    if (++tries > 20) clearInterval(interval); // fail-safe: stops after ~2s
  }, 100);
}
```

**Why stabilization?**
LLMs stream text → without stabilization you'd store partial chunks ("Sure, here’s a list:" w/o list).

---

## 7. Sidebar Thread Composer — Full Flow (User → GPT → Sidebar)

```
[User writes follow‑up] → [Extension auto-inserts to chatbox] → [GPT replies] →
[MutationObserver catches it] → [Thread gets appended]
```

### Follow‑up message formatting

When sending a follow‑up, the extension composes context:

```
Original topic: <Thread Title>
Relevant answer: <Latest assistant answer>

Follow‑up: <User typed input>
```

> **This prompts LLMs better** and avoids losing context.

### Scroll-lock Guarantee

When extension sends follow‑up:

* Save current scroll: `const y = window.scrollY;`
* Simulate Enter
* Immediately restore `scrollTo(0, y)`

This prevents ChatGPT UI from auto-scrolling you away from the bookmarked answer.

---

## 8. Storage System (Final Spec)

### Keys used

| Key                    | Description                                             |
| ---------------------- | ------------------------------------------------------- |
| `sidequest.threads`    | JSON tree storing all threads                           |
| `sidequest.settings`   | UI preferences (sidebar width, theme, telemetry toggle) |
| `sidequest.lastBackup` | timestamp in ISO format                                 |

### Data Structure

```json
{
  "threads": {
    "uuid-123": {
      "title": "vector embeddings explained",
      "provider": "chatgpt",
      "messages": [
        { "role": "assistant", "content": "Embeddings are..." },
        { "role": "user", "content": "Explain with visuals" },
        { "role": "assistant", "content": "Imagine a 3D space..." }
      ],
      "createdAt": 1730482501000,
      "updatedAt": 1730482553000
    }
  }
}
```

### Export / Import

* Export → JSON file
* Import → merges threads; never overwrites blindly

---

## 9. Provider Abstraction (Modular Design)

```
/ providers
  ├─ chatgpt.js
  ├─ gemini.js
  ├─ claude.js (future)
```

Each must implement:

```ts
export function detectProvider(url: string): boolean;
export function findAnswerNodes(): HTMLElement[];
export function extractAnswer(node: HTMLElement): string;
export function getInputBox(): HTMLElement;
export function fireSendEvent(box: HTMLElement): Promise<void>;
```

This abstraction makes adding new platforms trivial.

---

## 10. Sidebar Layout (Detailed)

```
┌──────────────────────────────────────────────┐
│ ChatGPT / Gemini page                        │
└───────────────┬──────────────────────────────┘
                │  SideQuest Sidebar
                │  ┌────────────────────────┐
                │  │ [ Search bar ]         │
                │  │                        │
                │  │ THREAD LIST            │
                │  │  ⭐ Tokenization (3 msg)│
                │  │  ⭐ Embeddings (5 msg) │
                │  │                        │
                │  └────────────────────────┘
```

### Sidebar Themes

* Light / Dark
* Width drag‑resizable (save in settings)

---

## 11. Performance & Optimizations

| Problem                        | Solution                      |
| ------------------------------ | ----------------------------- |
| Observers firing too much      | Debounce / throttle DOM scans |
| Memory bloat from huge threads | Soft cap + archive mode       |
| Slow renders inside sidebar    | Virtualized thread list       |

Example: throttling MutationObserver stream

```js
let queued = false;
const observer = new MutationObserver(() => {
  if (!queued) {
    queued = true;
    requestIdleCallback(() => {
      scanForBubbleUpdates();
      queued = false;
    });
  }
});
```

---

## 12. Telemetry (Optional & Opt‑In)

Event names (no content recorded):

* `thread.created`
* `followup.sent`
* `reply.captured`

Telemetry providers allowed:

* Posthog (self‑hosted)
* Plausible

All tracking → disabled by default.

---

## 13. Release Checklist (before publishing)

| Task                         | Status     |
| ---------------------------- | ---------- |
| Privacy policy               | ✅ required |
| Manifest version bump        | ✅          |
| Screenshots + marketing copy | ✅          |
| QA test on ChatGPT + Gemini  | ✅          |

---

## 14. Future Roadmap

| Feature                         | Type |
| ------------------------------- | ---- |
| Cloud sync w/ encryption        | Paid |
| Mobile extension (Kiwi browser) | Free |
| Share thread as Notion page     | Free |
| AI summarization of threads     | Paid |

---

## End of README Part 2

> If you want, I can now generate **the full code scaffolding**: manifest, content.js, sidebar.html/css/js ready to run.

Reply with: **`generate scaffold`**






