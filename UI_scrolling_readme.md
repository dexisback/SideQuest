# SideQuest — ChatGPT Answer Bookmarking + Jump-To Extension
_A Chrome extension that helps you quickly jump back to any previous ChatGPT answer._

---

## 🚀 What is SideQuest?

SideQuest is a Chrome extension that adds a persistent sidebar to chat.openai.com.

### Problem
ChatGPT threads get extremely long.  
You scroll and scroll like a lost pilgrim trying to find **that one response** buried 40 messages earlier.

### Solution
✅ Show every ChatGPT assistant reply in a sidebar  (already done)
✅ Clicking a sidebar item scrolls the ChatGPT UI to that exact answer(to be done)  
✅ NOTE: User still types follow-ups normally in the ChatGPT textbox  
❌ We **do not** auto-send messages (ChatGPT blocks scripted input)

**We bookmark answers. We don’t hijack ChatGPT.**

---

## 🧠 Key Architecture Decisions

| Component | Responsibility |
|----------|----------------|
| `content.js` | Runs inside ChatGPT page, detects new assistant messages, extracts message DOM nodes, assigns unique IDs, and handles "scroll to message" logic. |
| `sidebar.html` + `sidebar.js` | Renders sidebar UI (bookmarked messages with timestamps). |
| `chrome.storage.local` | Stores bookmarked messages persistently. |
| `manifest.json` | Declares permissions and injects content scripts and sidebar. |

---

## ✅ Core Behaviors (non-negotiable)

### 1. Detect ChatGPT Answers
- Observe DOM using `MutationObserver`
- Whenever a `.assistant` chat bubble appears:
  - Generate a unique message ID (`msg-<timestamp>`)
  - Attach a ⭐ button to the bubble

### 2. Bookmark Answers
When ⭐ is clicked:
- Extract short preview text (first 60 characters)
- Store entry in Chrome storage:
```ts
{
  id: "msg-17229483823",
  snippet: "Here’s how you implement pagination…",
  timestamp: "2025-11-02T17:23:00Z"
}
