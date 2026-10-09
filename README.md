# <img src="icons/icon48.png" width="28" height="28" valign="middle" alt="Gemini" /> Discord Gemini Translator

<p align="center">
  <strong>English</strong> | <a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <a href="https://developer.chrome.com/docs/extensions/develop"><img src="https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue?logo=googlechrome" alt="Manifest V3" /></a>
  <a href="https://ai.google.dev/"><img src="https://img.shields.io/badge/Google%20Gemini-API%20v1beta-4285F4?logo=google" alt="Gemini API" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT" /></a>
</p>

<p align="center">
  A lightweight, privacy-focused browser extension for real-time two-way translation in <strong>Discord Web</strong> (<code>https://discord.com/*</code>) powered by the <strong>Google Gemini API</strong>.
</p>

<p align="center">
  <img src="assets/settings.png" alt="Discord Gemini Translator Settings" width="380" />
</p>

---

## ✨ Features

- 📥 **Translate Incoming Messages**:
  - Direct translation button on every message and quote/reply in the chat.
  - Clean inline translation bubble right below the original text, dismissable in one click.
- 📤 **Translate Outgoing Messages Before Sending**:
  - Gemini translation button embedded beside the Discord input bar.
  - Ergonomic shortcut: **`Ctrl + ~`** (Tilde / `ё`) instantly translates the typed text in the Discord Slate editor to the target language before sending.
- 🧠 **Full Support for Modern Google Gemini Models**:
  - Automatically fetches the list of available text models from your API key.
  - Supports **Gemini 2.5 Flash**, **Gemini 2.5 Flash-Lite**, **Gemini 2.5 Pro**, and **Gemini 1.5 Flash/Pro**.
  - **Hardware Reasoning Disabled (`thinkingBudget = 0`)**: 2.5 series models respond near-instantaneously (200–400 ms) without reasoning token latency or thoughts leaking into chat.
- 🛡️ **Discord Syntax Preservation**:
  - Preserves Markdown formatting (`**bold**`, `*italic*`, `~~strikethrough~~`, `||spoiler||`, inline and multi-line code blocks ```` ``` ````).
  - Preserves mentions (`<@id>`, `<#id>`, `<@&id>`), server custom emojis (`<:name:id>`), and URLs.
- 🎨 **Modern Acrylic Glass Interface**:
  - Dark glassmorphic theme with soft neon gradients and Discord/Gemini aesthetic.
  - Native bilingual UI with instant **`EN` / `RU`** switcher.
- 🔒 **Privacy & Security First**:
  - Your API key is stored **strictly locally** in your browser (`chrome.storage.local`).
  - Calls are made directly to Google's official Gemini endpoint (`generativelanguage.googleapis.com`) with zero third-party telemetry or middleware servers.

---

## 🚀 Installation

No build steps or dependencies required. Runs natively on pure JavaScript (Manifest V3):

1. **Download the repository**:
   - Click the green **Code** button ➔ **Download ZIP** and extract it anywhere on your computer (or run `git clone https://github.com/<your-username>/discord-gemini-translator.git`).
2. **Open Extensions page**:
   - In any Chromium browser (Google Chrome, Microsoft Edge, Brave, Opera, Vivaldi), navigate to:
     ```text
     chrome://extensions
     ```
3. **Enable Developer Mode**:
   - Toggle **Developer mode** in the top-right corner.
4. **Load the extension**:
   - Click **Load unpacked** in the top-left corner.
   - Select the `discord-gemini-translator` folder.
5. **Done!** The extension icon will appear in your browser toolbar.

---

## ⚙️ Setup

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Click the **Gemini Translator** icon in your browser toolbar.
3. Paste your key into the **Google Gemini API Key** field.
4. Click **Load Models List** and pick your preferred model (recommended: **Gemini 2.5 Flash-Lite** or **Gemini 2.5 Flash**).
5. Choose your incoming and outgoing target languages.
6. Click **Save Settings**.

---

## ⌨️ Shortcuts

| Shortcut | Description |
| :--- | :--- |
| **`Ctrl + ~`** (or `Ctrl + ё`) | Translate text currently typed in the Discord chat box to the target outgoing language |

---

## 📁 Project Structure

```text
discord-gemini-translator/
├── manifest.json              # Extension Manifest V3 configuration
├── assets/                    # Project screenshots and promotional artwork
│   └── settings.png           # Extension settings interface preview
├── icons/                     # Extension icons (16x16, 48x48, 128x128 px and source SVG)
├── popup/                     # Extension settings modal
│   ├── popup.html             # Acrylic markup with language switchers
│   ├── popup.css              # Glassmorphic and neon aesthetic styles
│   └── popup.js               # EN/RU i18n, model loader, storage sync
├── background/                # Service worker
│   └── background.js          # Secure Gemini API caller with thinking budget management
└── content/                   # Discord DOM integration scripts
    ├── content.js             # Button injections and translation controller
    ├── content.css            # Styles for Discord translation boxes & buttons
    └── inject.js              # Direct bridge for React Slate Editor mutations
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
