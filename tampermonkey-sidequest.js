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

  /**
   * Listen for messages from the extension (via window.postMessage)
   * Format: { type: 'SIDEQUEST_SEND_FOLLOWUP', text: 'message text' }
   */
  window.addEventListener('message', async (event) => {
    // Only accept messages from extension context
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

      // Find the textarea input
      const textarea = document.querySelector('textarea[data-testid="chat-input"], textarea#prompt-textarea, textarea');
      if (!textarea) {
        console.error('[SideQuest Tampermonkey] Cannot find textarea');
        return;
      }

      console.log('[SideQuest Tampermonkey] Found textarea, setting value');

      // Clear existing text
      textarea.value = '';
      await new Promise(r => setTimeout(r, 50));

      // Set the new text
      textarea.value = text;

      // Dispatch events to trigger React state updates
      const events = [
        new Event('input', { bubbles: true }),
        new Event('change', { bubbles: true }),
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true }),
        new KeyboardEvent('keyup', { bubbles: true, cancelable: true }),
      ];

      events.forEach(evt => textarea.dispatchEvent(evt));

      console.log('[SideQuest Tampermonkey] Dispatched input events');

      // Small delay to let React update
      await new Promise(r => setTimeout(r, 100));

      // Find and click the send button
      // ChatGPT has multiple button implementations, try multiple selectors
      let sendButton = 
        document.querySelector('button[data-testid="send-button"]') ||
        document.querySelector('button[type="submit"]') ||
        document.querySelector('button[aria-label*="Send" i]') ||
        // Fallback: find button near the textarea
        textarea.closest('form')?.querySelector('button[type="submit"]') ||
        textarea.parentElement?.parentElement?.querySelector('button');

      if (!sendButton) {
        console.error('[SideQuest Tampermonkey] Cannot find send button');
        return;
      }

      console.log('[SideQuest Tampermonkey] Found send button, clicking');

      // Click the send button
      sendButton.click();

      console.log('[SideQuest Tampermonkey] Message sent successfully');

    } catch (error) {
      console.error('[SideQuest Tampermonkey] Error:', error);
    }
  });

  console.log('[SideQuest Tampermonkey] Bridge ready and listening');
})();
