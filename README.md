# SideQuest

Bookmark AI chat answers in a tidy sidebar and jump back to them instantly. Works with GPT and Gemini

## Works on links:
- ChatGPT: chat.openai.com, chatgpt.com (and related openai.com paths)
- Google Gemini: gemini.google.com

## Install 101:

### Method 1: Load unpacked (developer mode)

1. Download or clone this repository.
2. In Chrome, open `chrome://extensions` and enable "Developer mode".
3. Click "Load unpacked" and select the folder: `extension/` (the folder that contains `manifest.json`).


---------------------

### From the Chrome Web Store

- brokie, sorry



## Usage

- On a supported chat page, click the ⭐ next to an assistant message to save it.
- Open the sidebar (it appears automatically). Click a saved thread to jump to that answer.
- Use the pencil to rename, the bin to delete a thread, or "Clear all" to wipe everything.
- Toggle dark/light theme from the header. Drag the vertical handle to resize the thread list.
- You can also "Bookmark latest answer" from the header if the star isn’t visible.

## Permissions and privacy

- Permissions: `scripting`, `storage`, `activeTab`; host access limited to ChatGPT/OpenAI and Gemini.
- No backend: all data lives in `chrome.storage.local` on your device.
- No analytics, no remote requests, no eval/remote code execution.

## Packaging for release

- Zip the contents of the `extension/` folder so that `manifest.json` is at the root of the zip.
- Do not zip the entire repository; only the extension files.

## Notes

- If sites change their DOM, the star/jump heuristics may need small updates.
- If jumping fails, try refreshing the page and re‑bookmarking the message.

## License
- idc its vibe coded anyways
