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

  // Helper function to trigger React's state change
  function setReactInputValue(textarea, value) {
    // Get the React fiber from the DOM node
    const key = Object.keys(textarea).find(key => 
      key.startsWith('__react') || key.startsWith('__preact')
    );
    
    if (key) {
      const fiber = textarea[key];
      console.log('[SideQuest Tampermonkey] Found React fiber, updating value');
      
      // Traverse the fiber tree to find the state setter
      let instance = fiber;
      while (instance) {
        if (instance.memoizedState) {
          // Found the component state
          break;
        }
        instance = instance._owner || instance.return;
      }
    }
    
    // Use the native property setter to trigger React's onChange
    const nativeSetValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (nativeSetValue && nativeSetValue.set) {
      nativeSetValue.set.call(textarea, value);
    } else {
      textarea.value = value;
    }

    // Dispatch all necessary events for React
    const events = [
      new Event('input', { bubbles: true, cancelable: true }),
      new Event('change', { bubbles: true, cancelable: true }),
      new KeyboardEvent('keydown', { 
        bubbles: true, 
        cancelable: true, 
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13
      }),
      new KeyboardEvent('keyup', { 
        bubbles: true, 
        cancelable: true, 
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13
      }),
    ];

    events.forEach(evt => {
      textarea.dispatchEvent(evt);
    });

    console.log('[SideQuest Tampermonkey] Triggered React state update with all events');
  }

  /**
   * Listen for messages from the extension (via window.postMessage)
   */
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

      // Find textarea with multiple fallbacks
      let textarea = null;
      const textareaSelectors = [
        'textarea[data-testid="chat-input"]',
        'textarea#prompt-textarea',
        'textarea[placeholder*="Ask"]',
        'textarea[placeholder*="Message"]',
        'textarea'
      ];

      for (const selector of textareaSelectors) {
        textarea = document.querySelector(selector);
        if (textarea) {
          console.log('[SideQuest Tampermonkey] Found textarea with selector:', selector);
          break;
        }
      }

      if (!textarea) {
        console.error('[SideQuest Tampermonkey] Cannot find textarea with any selector');
        return;
      }

      // Set the value using React-compatible method
      setReactInputValue(textarea, text);

      // Wait for React to update
      await new Promise(r => setTimeout(r, 200));

      // Find and click the send button
      let sendButton = null;
      const buttonSelectors = [
        'button[data-testid="send-button"]',
        'button[aria-label*="Send"]',
        'button:has-text("Send")',
        'button[type="submit"]',
      ];

      // Try standard selectors first
      for (const selector of buttonSelectors) {
        try {
          sendButton = document.querySelector(selector);
          if (sendButton) {
            console.log('[SideQuest Tampermonkey] Found send button with selector:', selector);
            break;
          }
        } catch (e) {
          // :has-text is not standard, skip
        }
      }

      // If still not found, search by proximity to textarea
      if (!sendButton) {
        console.log('[SideQuest Tampermonkey] Searching for send button by proximity...');
        const allButtons = Array.from(document.querySelectorAll('button'));
        const textareaRect = textarea.getBoundingClientRect();
        
        const nearbyButtons = allButtons.filter(btn => {
          if (btn.offsetParent === null) return false; // Hidden
          if (btn.disabled) return false;
          const btnRect = btn.getBoundingClientRect();
          const distance = Math.hypot(
            btnRect.left - textareaRect.right,
            btnRect.top - textareaRect.top
          );
          return distance < 200; // Within 200px
        });

        if (nearbyButtons.length > 0) {
          sendButton = nearbyButtons[0];
          console.log('[SideQuest Tampermonkey] Found send button by proximity');
        }
      }

      if (!sendButton) {
        console.error('[SideQuest Tampermonkey] Cannot find send button anywhere');
        return;
      }

      console.log('[SideQuest Tampermonkey] Clicking send button now');

      // Click with small delay to ensure React state is updated
      await new Promise(r => setTimeout(r, 100));
      sendButton.click();

      console.log('[SideQuest Tampermonkey] ✅ Message sent successfully!');

    } catch (error) {
      console.error('[SideQuest Tampermonkey] Error:', error);
      console.error('[SideQuest Tampermonkey] Stack:', error.stack);
    }
  });

  console.log('[SideQuest Tampermonkey] Bridge ready and listening');
})();
