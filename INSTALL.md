# 🚀 SideQuest Extension - Installation & Setup Guide

## Overview

**SideQuest** is a Chrome extension that lets you:
- 📌 Bookmark ChatGPT responses into a sidebar
- 💬 Send follow-up questions directly from the sidebar without switching tabs
- 💾 Organize all your conversations in threads

---

## ⚠️ Important: Two-Part Installation

This extension requires **TWO components** to work fully:

1. **Chrome Extension** (bookmarking + UI)
2. **Tampermonkey Script** (sending follow-ups to ChatGPT)

Without BOTH, bookmarking will work but sending will not.

---

## 📋 Prerequisites

- Google Chrome browser
- Access to https://chat.openai.com or https://chatgpt.com

---

## 🔧 Installation Steps

### Part 1: Install Tampermonkey

Tampermonkey is a user script manager that allows scripts to run with full DOM access inside web pages.

**Step 1:** Go to Chrome Web Store
```
https://chrome.google.com/webstore/search/tampermonkey
```

**Step 2:** Click **"Add to Chrome"** → **"Add extension"**

You should see the Tampermonkey icon (🐒) in your Chrome toolbar.

---

### Part 2: Add the SideQuest Tampermonkey Script

**Step 1:** Click the **Tampermonkey icon** (🐒) in your toolbar → **"Dashboard"**

**Step 2:** Click the **"+"** icon to create a new script

**Step 3:** Delete all template content and paste the following script:

```javascript
// ==UserScript==
// @name         SideQuest - ChatGPT Follow-Up Bridge
// @namespace    https://github.com/dexisback/gpt_extension
// @version      0.1.0
// @description  Receives follow-up messages from SideQuest extension and sends them to ChatGPT
// @author       SideQuest Team
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @match        https://www.chatgpt.com/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  console.log('[SideQuest Tampermonkey] Bridge script loaded');

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    
    const data = event.data;
    if (!data || data.type !== 'SIDEQUEST_SEND_FOLLOWUP') return;

    console.log('[SideQuest Tampermonkey] Received message:', data);

    try {
      const text = data.text || '';
      if (!text.trim()) {
        console.warn('[SideQuest Tampermonkey] Empty message text, skipping');
        return;
      }

      const textarea = document.querySelector('textarea[data-testid="chat-input"], textarea#prompt-textarea, textarea');
      if (!textarea) {
        console.error('[SideQuest Tampermonkey] Cannot find textarea');
        return;
      }

      console.log('[SideQuest Tampermonkey] Found textarea, setting value');

      textarea.value = '';
      await new Promise(r => setTimeout(r, 50));

      textarea.value = text;

      const events = [
        new Event('input', { bubbles: true }),
        new Event('change', { bubbles: true }),
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true }),
        new KeyboardEvent('keyup', { bubbles: true, cancelable: true }),
      ];

      events.forEach(evt => textarea.dispatchEvent(evt));

      console.log('[SideQuest Tampermonkey] Dispatched input events');

      await new Promise(r => setTimeout(r, 100));

      let sendButton = 
        document.querySelector('button[data-testid="send-button"]') ||
        document.querySelector('button[type="submit"]') ||
        document.querySelector('button[aria-label*="Send" i]') ||
        textarea.closest('form')?.querySelector('button[type="submit"]') ||
        textarea.parentElement?.parentElement?.querySelector('button');

      if (!sendButton) {
        console.error('[SideQuest Tampermonkey] Cannot find send button');
        return;
      }

      console.log('[SideQuest Tampermonkey] Found send button, clicking');

      sendButton.click();

      console.log('[SideQuest Tampermonkey] Message sent successfully');

    } catch (error) {
      console.error('[SideQuest Tampermonkey] Error:', error);
    }
  });

  console.log('[SideQuest Tampermonkey] Bridge ready and listening');
})();
```

**Step 4:** Press **Ctrl+S** (or **Cmd+S** on Mac) to save

**Step 5:** Close the dashboard tab

---

### Part 3: Install the Chrome Extension

**Step 1:** Open Chrome and go to `chrome://extensions/`

**Step 2:** Enable **"Developer mode"** (toggle in top-right)

**Step 3:** Click **"Load unpacked"**

**Step 4:** Navigate to the extension folder:
```
/home/amaan/my_stuff/gpt_extension/extension
```

**Step 5:** Click **"Select folder"** or **"Open"**

You should now see **SideQuest** in your extensions list with a green checkmark.

---

## ✅ Verify Installation

1. Go to https://chat.openai.com
2. You should see a **sidebar on the right side** with:
   - A header saying "SideQuest"
   - Two buttons: ⭐ (bookmark) and ↻ (refresh)
   - An input area showing "Select a thread or bookmark one ⭐"

3. Open the browser console (**F12** → **Console tab**)
4. Look for messages starting with:
   - `[SideQuest]` - extension messages
   - `[SideQuest Tampermonkey]` - Tampermonkey script messages

If you see these, everything is installed correctly! ✅

---

## 🎯 How to Use

### Bookmark a Response
1. Ask ChatGPT a question
2. Get a response
3. Click the **⭐** button on the response (floating in top-right of the answer)
4. The response appears in your sidebar

### Send a Follow-Up
1. Click on a thread in the sidebar
2. Type your follow-up question in the composer box
3. Click **"Send ↑"** or press **Ctrl+Enter**
4. The message is typed into ChatGPT and sent automatically
5. You don't need to switch tabs!

### Refresh Threads
- Click the **↻** button to reload all saved threads

### Bookmark Latest Answer
- Click the **⭐** button in the header to bookmark the most recent assistant response on the page

---

## 🐛 Troubleshooting

### Sidebar doesn't appear
- Make sure the extension is installed (`chrome://extensions/`)
- Refresh the ChatGPT page
- Check browser console (F12) for `[SideQuest]` errors

### Send button doesn't work
- Verify Tampermonkey is installed and shows 🐒 icon
- Check that the Tampermonkey script is installed (Dashboard → should show SideQuest script)
- Open ChatGPT console (F12) and look for `[SideQuest Tampermonkey]` messages
- If missing, the script wasn't installed correctly

### Messages not appearing in Tampermonkey
- Tampermonkey needs the userscript to be active on the domain
- Refresh the ChatGPT page after installing the Tampermonkey script

### Still not working?
1. Open **F12** → **Console** tab
2. Copy all errors
3. Verify both components are installed:
   - `chrome://extensions/` should show "SideQuest"
   - Tampermonkey dashboard should show the "SideQuest - ChatGPT Follow-Up Bridge" script

---

## 🔒 Privacy & Security

- ✅ All data stored locally in `chrome.storage.local`
- ✅ No data sent to external servers
- ✅ Tampermonkey script only runs on ChatGPT domains specified in the script
- ✅ Extension has no network permissions

---

## 📝 Notes

- Bookmarks are stored locally in your Chrome profile
- Closing the browser doesn't delete threads (they persist)
- Each ChatGPT domain (chat.openai.com, chatgpt.com) shares the same storage
- The Tampermonkey script only needs to be installed once

---

## 🎓 How It Works (Technical)

```
Sidebar UI
    ↓
Chrome Extension Message API
    ↓
Background Service Worker
    ↓
Content Script (injected on ChatGPT)
    ↓
window.postMessage() → Page Context
    ↓
Tampermonkey Script (full DOM access)
    ↓
Directly manipulates textarea + clicks send button
    ↓
ChatGPT processes the message normally
```

This architecture allows us to bypass content-script sandboxing by using Tampermonkey as a bridge.

---

## ✨ Features

| Feature | Status |
|---------|--------|
| Bookmark responses | ✅ Working |
| View bookmarked threads | ✅ Working |
| Send follow-ups from sidebar | ✅ Working |
| Keyboard shortcut (Ctrl+Enter) | ✅ Working |
| Persistent storage | ✅ Working |
| Multi-provider support (ChatGPT) | ✅ Supported |

---

Enjoy! 🎉
