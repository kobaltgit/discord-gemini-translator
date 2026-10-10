(() => {
  let incomingLang = "Russian";
  let outgoingLang = "English";
  let reversePreviewEnabled = true;
  let autoTranslateEnabled = false;
  let autoTranslateChannels = {};
  let lastSeenChannelId = null;
  const autoTranslateQueue = [];
  let isQueueProcessing = false;

  let isLiveCaptionsActive = false;
  let liveCaptionsPort = null;
  let captionsOverlayElement = null;
  let currentCaptionLineElement = null;
  let uiLang = "ru";

  const CONTENT_I18N = {
    ru: {
      autoBtn: "Авто",
      autoTitleActive: "Автоперевод канала: ВКЛ (нажмите для выключения)",
      autoTitleInactive: "Автоперевод канала: ВЫКЛ (нажмите для включения)",
      voiceBtn: "Голос",
      voiceTitleActive: "Перевод голоса в субтитры (Gemini Live): ВКЛ (нажмите для выключения)",
      voiceTitleInactive: "Перевод голоса в субтитры (Gemini Live): ВЫКЛ (нажмите для включения)",
      voicePanelBtnActive: "Перевод голоса: ВКЛ",
      voicePanelBtnInactive: "Перевод голоса (субтитры)",
      voicePanelTitleActive: "Перевод голоса (субтитры): ВКЛ (нажмите для выключения)",
      voicePanelTitleInactive: "Перевод голоса (субтитры): ВЫКЛ (нажмите для включения)",
      overlayTitle: "Субтитры Gemini Live",
      overlayConnecting: "Подключение...",
      overlayListening: "Слушаю канал",
      overlayStopped: "Остановлено",
      overlayError: "Ошибка",
      overlayClearTitle: "Очистить субтитры",
      overlayCloseTitle: "Остановить и закрыть",
      overlayPlaceholder: "Слушаю голосовой канал... Говорите или ждите участников",
      overlayCleared: "Субтитры очищены. Слушаю канал...",
      translateTitle: "Перевести ввод на {lang} (Ctrl + ~)",
      langBadgeTitle: "Выбор языка перевода",
      langMenuTitle: "Язык перевода",
      closeTitle: "Закрыть",
      translatingText: "Перевод...",
      translateMsgReplyTitle: "Перевести цитату (Gemini)",
      translateMsgTitle: "Перевести сообщение (Gemini)",
      reverseTitle: "🔍 Самопроверка ({code} ➔ {dest}):",
      revertBtn: "Отменить",
      errorPrefix: "Ошибка",
      translationFailed: "Не удалось перевести текст",
      alreadyInTargetLang: "Сообщение уже на целевом языке",
    },
    en: {
      autoBtn: "Auto",
      autoTitleActive: "Channel Auto-translate: ON (click to disable)",
      autoTitleInactive: "Channel Auto-translate: OFF (click to enable)",
      voiceBtn: "Live",
      voiceTitleActive: "Live Voice Captions (Gemini Live): ON (click to disable)",
      voiceTitleInactive: "Live Voice Captions (Gemini Live): OFF (click to enable)",
      voicePanelBtnActive: "Voice Captions: ON",
      voicePanelBtnInactive: "Voice Captions (Live)",
      voicePanelTitleActive: "Voice Captions: ON (click to disable)",
      voicePanelTitleInactive: "Voice Captions: OFF (click to enable)",
      overlayTitle: "Gemini Live Captions",
      overlayConnecting: "Connecting...",
      overlayListening: "Listening to channel",
      overlayStopped: "Stopped",
      overlayError: "Error",
      overlayClearTitle: "Clear captions",
      overlayCloseTitle: "Stop & Close",
      overlayPlaceholder: "Listening to voice channel... Speak or wait for members",
      overlayCleared: "Captions cleared. Listening to channel...",
      translateTitle: "Translate input to {lang} (Ctrl + ~)",
      langBadgeTitle: "Select translation language",
      langMenuTitle: "Translation Language",
      closeTitle: "Close",
      translatingText: "Translating...",
      translateMsgReplyTitle: "Translate quote (Gemini)",
      translateMsgTitle: "Translate message (Gemini)",
      reverseTitle: "🔍 Reverse check ({code} ➔ {dest}):",
      revertBtn: "Revert",
      errorPrefix: "Error",
      translationFailed: "Failed to translate text",
      alreadyInTargetLang: "Message is already in the target language",
    },
  };

  const SUPPORTED_LANGUAGES = [
    { code: "EN", name: "English" },
    { code: "RU", name: "Russian" },
    { code: "DE", name: "German" },
    { code: "FR", name: "French" },
    { code: "ES", name: "Spanish" },
    { code: "ZH", name: "Chinese" },
    { code: "JA", name: "Japanese" },
    { code: "KO", name: "Korean" },
    { code: "UK", name: "Ukrainian" },
  ];

  function getLangCode(langName) {
    if (!langName) return "EN";
    const lower = String(langName).toLowerCase().trim();
    const match = SUPPORTED_LANGUAGES.find(
      (l) => l.name.toLowerCase() === lower || l.code.toLowerCase() === lower,
    );
    if (match) return match.code;
    return langName.length >= 2 ? langName.slice(0, 2).toUpperCase() : langName.toUpperCase();
  }

  function isLikelySameLanguage(text, targetLanguage) {
    if (!text || typeof text !== "string") return false;
    if (!targetLanguage || typeof targetLanguage !== "string") return false;

    // Clean URLs, mentions, emojis, and punctuation
    const clean = text
      .replace(/<@&?\d+>/g, "")
      .replace(/<#\d+>/g, "")
      .replace(/<a?:\w+:\d+>/g, "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/[0-9\s\p{P}\p{S}]/gu, "");

    if (clean.length < 2) return false;

    const target = targetLanguage.toLowerCase().trim();

    // Russian / Ukrainian: check Cyrillic script
    if (target === "russian" || target === "ukrainian") {
      const cyrillicMatches = clean.match(/[\u0400-\u04FF]/g) || [];
      const latinMatches = clean.match(/[a-zA-Z]/g) || [];
      const total = cyrillicMatches.length + latinMatches.length;
      if (total >= 2 && cyrillicMatches.length / total >= 0.8) {
        return true;
      }
    }

    // Japanese: Hiragana & Katakana
    if (target === "japanese") {
      const kanaMatches = clean.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || [];
      if (kanaMatches.length >= 2) {
        return true;
      }
    }

    // Korean: Hangul
    if (target === "korean") {
      const hangulMatches = clean.match(/[\uAC00-\uD7AF\u1100-\u11FF]/g) || [];
      if (hangulMatches.length >= 2) {
        return true;
      }
    }

    // Chinese: Han characters without Japanese Kana or Korean Hangul
    if (target === "chinese") {
      const hanMatches = clean.match(/[\u4E00-\u9FFF]/g) || [];
      const kanaMatches = clean.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || [];
      const hangulMatches = clean.match(/[\uAC00-\uD7AF\u1100-\u11FF]/g) || [];
      if (hanMatches.length >= 2 && kanaMatches.length === 0 && hangulMatches.length === 0) {
        return true;
      }
    }

    return false;
  }

  const GEMINI_ICON_SVG = `
    <svg width="15" height="15" viewBox="0 0 65 65" fill="none" class="dgt-gemini-icon" style="vertical-align: middle; display: inline-block;">
      <path d="M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z" fill="url(#dgt_gem_grad)"/>
      <defs>
        <linearGradient id="dgt_gem_grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#4893FC"/>
          <stop offset="45%" stop-color="#7D5FFF"/>
          <stop offset="100%" stop-color="#BD99FE"/>
        </linearGradient>
      </defs>
    </svg>
  `;

  function getCurrentChannelId(
    pathname = typeof window !== "undefined" ? window.location?.pathname : "",
  ) {
    if (!pathname) return null;
    const match = pathname.match(/\/channels\/([^\/]+)\/([^\/]+)/);
    return match ? match[2] : null;
  }

  function isAutoTranslateActiveForChannel(
    channelId,
    globalEnabled,
    channelMap,
  ) {
    if (globalEnabled) return true;
    if (!channelId || !channelMap) return false;
    return Boolean(channelMap[channelId]);
  }

  function shouldAutoTranslateMessage(
    contentElement,
    rawText,
    isChannelActive,
  ) {
    if (!isChannelActive) return false;
    if (!contentElement || !rawText) return false;
    if (contentElement.dataset.dgtAutoTranslated === "true") return false;
    if (
      contentElement.parentElement?.querySelector(
        `.dgt-translation-box[data-for="${contentElement.id}"]`,
      )
    ) {
      return false;
    }
    if (/^https?:\/\/\S+$/i.test(rawText.trim())) return false;
    if (isLikelySameLanguage(rawText, incomingLang)) {
      contentElement.dataset.dgtAutoTranslated = "true";
      return false;
    }
    return true;
  }

  function updateAllAutoButtons() {
    const currentChId = getCurrentChannelId();
    const isActive = isAutoTranslateActiveForChannel(
      currentChId,
      autoTranslateEnabled,
      autoTranslateChannels,
    );
    const dict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
    document.querySelectorAll(".dgt-auto-btn").forEach((btn) => {
      btn.classList.toggle("active", isActive);
      const textSpan = btn.querySelector(".dgt-auto-text");
      if (textSpan) {
        textSpan.textContent = dict.autoBtn;
      }
      btn.title = isActive
        ? dict.autoTitleActive
        : dict.autoTitleInactive;
    });
  }

  function checkChannelChange() {
    const currentChId = getCurrentChannelId();
    if (currentChId && currentChId !== lastSeenChannelId) {
      lastSeenChannelId = currentChId;
      autoTranslateQueue.length = 0;
      const isChannelActive = isAutoTranslateActiveForChannel(
        currentChId,
        autoTranslateEnabled,
        autoTranslateChannels,
      );
      if (!isChannelActive) {
        document.querySelectorAll('[id^="message-content-"]').forEach((el) => {
          el.dataset.dgtAutoTranslated = "true";
        });
      }
      updateAllAutoButtons();
    }
  }

  function checkAndAutoTranslateMessages() {
    const currentChId = getCurrentChannelId();
    const isChannelActive = isAutoTranslateActiveForChannel(
      currentChId,
      autoTranslateEnabled,
      autoTranslateChannels,
    );
    if (!isChannelActive) return;

    const messages = Array.from(
      document.querySelectorAll('[id^="message-content-"]'),
    ).slice(-3);
    messages.forEach((contentElement) => {
      const rawText = getCleanMessageText(contentElement);
      if (shouldAutoTranslateMessage(contentElement, rawText, true)) {
        if (autoTranslateQueue.length < 8) {
          autoTranslateQueue.push({ contentElement, rawText });
          processAutoTranslateQueue();
        }
      }
    });
  }

  async function processAutoTranslateQueue() {
    if (isQueueProcessing) return;
    isQueueProcessing = true;

    while (autoTranslateQueue.length > 0) {
      const item = autoTranslateQueue.shift();
      const { contentElement, rawText } = item;

      if (!contentElement || !contentElement.isConnected) continue;

      const existing = contentElement.parentElement?.querySelector(
        `.dgt-translation-box[data-for="${contentElement.id}"]`,
      );
      if (existing) continue;

      contentElement.dataset.dgtAutoTranslated = "true";

      const dict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
      const targetCode = getLangCode(incomingLang);
      const translationBox = document.createElement("div");
      translationBox.className = "dgt-translation-box dgt-auto-box";
      translationBox.dataset.for = contentElement.id;
      translationBox.innerHTML = `
        <div class="dgt-translation-header">
          <span class="dgt-translation-title">⚡ Gemini [Auto] (${targetCode})</span>
          <button type="button" class="dgt-close-btn" title="${dict.closeTitle}">✕</button>
        </div>
        <div class="dgt-translation-text">${dict.translatingText}</div>
      `;

      const closeBtn = translationBox.querySelector(".dgt-close-btn");
      closeBtn.addEventListener("click", () => {
        translationBox.remove();
      });

      contentElement.insertAdjacentElement("afterend", translationBox);
      const textElement = translationBox.querySelector(
        ".dgt-translation-text",
      );

      try {
        const res = await requestTranslation(rawText, incomingLang, {
          detectLanguage: true,
        });
        const fromCode = res.detectedLanguage
          ? getLangCode(res.detectedLanguage)
          : "";

        if (res.isAlreadyTarget || (fromCode && fromCode === targetCode)) {
          translationBox.remove();
        } else {
          const langIndicator = fromCode
            ? `${fromCode} ➔ ${targetCode}`
            : targetCode;
          const headerTitleSpan = translationBox.querySelector(
            ".dgt-translation-title",
          );
          if (headerTitleSpan) {
            headerTitleSpan.textContent = `⚡ Gemini [Auto] (${langIndicator})`;
          }
          textElement.textContent =
            typeof res === "object" ? res.translatedText : res;
        }
      } catch (err) {
        textElement.className = "dgt-translation-error";
        textElement.textContent = `${dict.errorPrefix}: ${err.message}`;
      }

      await new Promise((r) => setTimeout(r, 350));
    }

    isQueueProcessing = false;
  }

  // Загрузка сохраненных настроек языков
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.get(
      [
        "incomingLang",
        "outgoingLang",
        "reversePreviewEnabled",
        "autoTranslateEnabled",
        "autoTranslateChannels",
        "uiLang",
      ],
      (items) => {
        if (items.incomingLang) incomingLang = items.incomingLang;
        if (items.outgoingLang) outgoingLang = items.outgoingLang;
        if (typeof items.reversePreviewEnabled === "boolean") {
          reversePreviewEnabled = items.reversePreviewEnabled;
        }
        if (typeof items.autoTranslateEnabled === "boolean") {
          autoTranslateEnabled = items.autoTranslateEnabled;
        }
        if (
          items.autoTranslateChannels &&
          typeof items.autoTranslateChannels === "object"
        ) {
          autoTranslateChannels = items.autoTranslateChannels;
        }
        if (items.uiLang) {
          uiLang = items.uiLang;
        }
        updateAllContentUiTexts();
        checkAndAutoTranslateMessages();
      },
    );

    // Отслеживание изменений настроек в реальном времени без перезагрузки вкладки
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local") {
        if (changes.incomingLang) incomingLang = changes.incomingLang.newValue;
        if (changes.outgoingLang) {
          outgoingLang = changes.outgoingLang.newValue;
          updateAllContentUiTexts();
        }
        if (changes.reversePreviewEnabled) {
          reversePreviewEnabled = changes.reversePreviewEnabled.newValue;
        }
        if (changes.autoTranslateEnabled) {
          autoTranslateEnabled = Boolean(changes.autoTranslateEnabled.newValue);
          updateAllAutoButtons();
          checkAndAutoTranslateMessages();
        }
        if (changes.autoTranslateChannels) {
          autoTranslateChannels = changes.autoTranslateChannels.newValue || {};
          updateAllAutoButtons();
          checkAndAutoTranslateMessages();
        }
        if (changes.uiLang) {
          uiLang = changes.uiLang.newValue || "ru";
          updateAllContentUiTexts();
        }
      }
    });
  }

  // Вспомогательная функция безопасного вызова перевода через фоновый воркер
  function requestTranslation(text, targetLang, options = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "TRANSLATE",
          text: text,
          targetLanguage: targetLang,
          includeReverse: Boolean(options.includeReverse),
          detectLanguage: Boolean(options.detectLanguage ?? true),
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.success) {
            reject(new Error(response?.error || "Неизвестная ошибка перевода"));
            return;
          }
          resolve({
            translatedText: response.translatedText,
            reversePreview: response.reversePreview || "",
            detectedLanguage: response.detectedLanguage || "",
            isAlreadyTarget: Boolean(response.isAlreadyTarget),
          });
        },
      );
    });
  }

  // Очистка текста от служебных элементов расширения перед отправкой в Gemini
  function getCleanMessageText(element) {
    const clone = element.cloneNode(true);
    clone
      .querySelectorAll(".dgt-translate-msg-btn, .dgt-translation-box")
      .forEach((el) => el.remove());
    return clone.innerText.trim();
  }

  // Функция гарантированной подмены текста во внутреннем состоянии Slate.js и React
  function replaceSlateText(slateEditor, newText) {
    slateEditor.focus();

    // 1. Отправляем команду в MAIN world (inject.js) для прямого вызова методов Slate Editor
    window.dispatchEvent(
      new CustomEvent("DGT_REPLACE_TEXT", {
        detail: { text: newText },
      }),
    );

    // 2. Страховочный тайм-аут: если MAIN world скрипт по какой-то причине не сработал
    setTimeout(() => {
      if (
        !slateEditor.innerText.includes(newText.trim()) ||
        slateEditor.innerText.trim() !== newText.trim()
      ) {
        // Fallback через DOM
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(slateEditor);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("delete", false, null);

        const dataTransfer = new DataTransfer();
        dataTransfer.setData("text/plain", newText);
        const pasteEvent = new ClipboardEvent("paste", {
          clipboardData: dataTransfer,
          bubbles: true,
          cancelable: true,
        });
        slateEditor.dispatchEvent(pasteEvent);
        slateEditor.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }, 50);
  }

  // --- ОБРАБОТКА ВХОДЯЩИХ СООБЩЕНИЙ ---

  function attachIncomingButtons() {
    const contentElements = document.querySelectorAll(
      '[id^="message-content-"], [class*="messageContent_"], [class*="messageContent-"]',
    );

    contentElements.forEach((contentElement) => {
      // Если кнопка уже прикреплена к данному элементу сообщения, пропускаем
      if (contentElement.querySelector(".dgt-translate-msg-btn")) {
        return;
      }

      // Гарантируем наличие id для привязки блока перевода
      if (!contentElement.id) {
        contentElement.id = `message-content-dgt-${Math.random().toString(36).slice(2, 9)}`;
      }

      const isReply = Boolean(
        contentElement.closest('[class*="repliedMessage"]'),
      );

      const dict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
      const btn = document.createElement("button");
      btn.className = `dgt-translate-msg-btn ${isReply ? "dgt-reply-btn" : "dgt-main-btn"}`;
      btn.title = isReply
        ? dict.translateMsgReplyTitle
        : dict.translateMsgTitle;
      btn.type = "button";
      btn.innerHTML = GEMINI_ICON_SVG;

      btn.addEventListener("click", async (e) => {
        e.stopPropagation();

        const existingBox = contentElement.parentElement?.querySelector(
          `.dgt-translation-box[data-for="${contentElement.id}"]`,
        );
        if (existingBox) {
          existingBox.remove();
          return;
        }

        const rawText = getCleanMessageText(contentElement);
        if (!rawText) return;

        const currentDict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
        const targetCode = getLangCode(incomingLang);

        if (isLikelySameLanguage(rawText, incomingLang)) {
          const translationBox = document.createElement("div");
          translationBox.className = "dgt-translation-box";
          translationBox.dataset.for = contentElement.id;
          translationBox.innerHTML = `
            <div class="dgt-translation-header">
              <span class="dgt-translation-title">${GEMINI_ICON_SVG} Gemini (${targetCode})</span>
              <button type="button" class="dgt-close-btn" title="${currentDict.closeTitle}">✕</button>
            </div>
            <div class="dgt-translation-text">${currentDict.alreadyInTargetLang}</div>
          `;

          const closeBtn = translationBox.querySelector(".dgt-close-btn");
          closeBtn.addEventListener("click", () => {
            translationBox.remove();
          });

          contentElement.insertAdjacentElement("afterend", translationBox);
          return;
        }

        btn.classList.add("dgt-loading");
        btn.innerHTML = "⏳";

        const translationBox = document.createElement("div");
        translationBox.className = "dgt-translation-box";
        translationBox.dataset.for = contentElement.id;
        translationBox.innerHTML = `
          <div class="dgt-translation-header">
            <span class="dgt-translation-title">${GEMINI_ICON_SVG} Gemini (${targetCode})</span>
            <button type="button" class="dgt-close-btn" title="${currentDict.closeTitle}">✕</button>
          </div>
          <div class="dgt-translation-text">${currentDict.translatingText}</div>
        `;

        const closeBtn = translationBox.querySelector(".dgt-close-btn");
        closeBtn.addEventListener("click", () => {
          translationBox.remove();
        });

        contentElement.insertAdjacentElement("afterend", translationBox);
        const textElement = translationBox.querySelector(
          ".dgt-translation-text",
        );

        try {
          const res = await requestTranslation(rawText, incomingLang, {
            detectLanguage: true,
          });
          const fromCode = res.detectedLanguage
            ? getLangCode(res.detectedLanguage)
            : "";
          const headerTitleSpan = translationBox.querySelector(
            ".dgt-translation-title",
          );

          if (res.isAlreadyTarget || (fromCode && fromCode === targetCode)) {
            if (headerTitleSpan) {
              headerTitleSpan.innerHTML = `${GEMINI_ICON_SVG} Gemini (${targetCode})`;
            }
            textElement.textContent = currentDict.alreadyInTargetLang;
          } else {
            const langIndicator = fromCode
              ? `${fromCode} ➔ ${targetCode}`
              : targetCode;
            if (headerTitleSpan) {
              headerTitleSpan.innerHTML = `${GEMINI_ICON_SVG} Gemini (${langIndicator})`;
            }
            textElement.textContent =
              typeof res === "object" ? res.translatedText : res;
          }
        } catch (error) {
          textElement.className = "dgt-translation-error";
          textElement.textContent = `${currentDict.errorPrefix}: ${error.message}`;
        } finally {
          btn.classList.remove("dgt-loading");
          btn.innerHTML = GEMINI_ICON_SVG;
        }
      });

      contentElement.appendChild(btn);

      const currentChId = getCurrentChannelId();
      const isChannelActive = isAutoTranslateActiveForChannel(
        currentChId,
        autoTranslateEnabled,
        autoTranslateChannels,
      );

      const rawText = getCleanMessageText(contentElement);
      if (
        isChannelActive &&
        shouldAutoTranslateMessage(contentElement, rawText, isChannelActive)
      ) {
        if (autoTranslateQueue.length < 8) {
          autoTranslateQueue.push({ contentElement, rawText });
          processAutoTranslateQueue();
        }
      }
    });
  }

  function showReversePreviewBox(
    container,
    originalText,
    reverseText,
    slateEditor,
  ) {
    if (!container || !reverseText) return;

    // Удаляем предыдущую плашку если есть
    container.querySelectorAll(".dgt-reverse-box").forEach((el) => el.remove());

    const dict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
    const previewBox = document.createElement("div");
    previewBox.className = "dgt-reverse-box";
    const headerTitle = dict.reverseTitle
      .replace("{code}", getLangCode(outgoingLang))
      .replace("{dest}", getLangCode(incomingLang));
    previewBox.innerHTML = `
      <div class="dgt-reverse-header">
        <span class="dgt-reverse-title">${headerTitle}</span>
        <div class="dgt-reverse-actions">
          <button type="button" class="dgt-revert-btn">${dict.revertBtn}</button>
          <button type="button" class="dgt-close-preview-btn">✕</button>
        </div>
      </div>
      <div class="dgt-reverse-text">«${reverseText}»</div>
    `;

    const revertBtn = previewBox.querySelector(".dgt-revert-btn");
    revertBtn.addEventListener("click", () => {
      replaceSlateText(slateEditor, originalText);
      previewBox.remove();
    });

    const closeBtn = previewBox.querySelector(".dgt-close-preview-btn");
    closeBtn.addEventListener("click", () => {
      previewBox.remove();
    });

    // Автоматическое скрытие через 8 секунд
    let autoDismiss = setTimeout(() => {
      previewBox.remove();
    }, 8000);

    previewBox.addEventListener("mouseenter", () => clearTimeout(autoDismiss));

    container.prepend(previewBox);
  }

  // --- ОБРАБОТКА ИСХОДЯЩИХ СООБЩЕНИЙ (ПОЛЕ ВВОДА) ---

  function attachOutgoingButton() {
    const slateEditor = document.querySelector(
      '[role="textbox"][contenteditable="true"]',
    );
    if (!slateEditor) return;

    const form = slateEditor.closest("form") || document.querySelector("form");

    let buttonContainer = form?.querySelector(
      '[class*="buttons__"], [class*="buttons_"], [class*="buttons-"]',
    );

    if (!buttonContainer) {
      const expressionButton = form?.querySelector(
        '[class*="expression-picker"], [class*="buttonContainer"]',
      );
      if (expressionButton) {
        buttonContainer = expressionButton.parentElement;
      }
    }

    if (!buttonContainer) {
      return;
    }

    if (buttonContainer.querySelector(".dgt-outgoing-wrapper")) {
      return;
    }

    const dict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
    const wrapper = document.createElement("div");
    wrapper.className = "dgt-outgoing-wrapper";

    const outgoingBtn = document.createElement("button");
    outgoingBtn.className = "dgt-chat-input-btn";
    outgoingBtn.type = "button";
    outgoingBtn.title = dict.translateTitle.replace("{lang}", outgoingLang);
    outgoingBtn.innerHTML = GEMINI_ICON_SVG;

    const langBadge = document.createElement("button");
    langBadge.type = "button";
    langBadge.className = "dgt-lang-badge";
    langBadge.title = dict.langBadgeTitle;
    langBadge.innerHTML = `<span>${getLangCode(outgoingLang)}</span><span class="dgt-badge-arrow">▾</span>`;

    let activeMenu = null;
    let cleanupListeners = null;

    const closeMenu = () => {
      if (activeMenu) {
        activeMenu.remove();
        activeMenu = null;
      }
      if (cleanupListeners) {
        cleanupListeners();
        cleanupListeners = null;
      }
    };

    langBadge.addEventListener("mousedown", (e) => e.preventDefault());
    langBadge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (activeMenu) {
        closeMenu();
        return;
      }

      const menu = document.createElement("div");
      menu.className = "dgt-lang-menu";

      const currentDict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
      const title = document.createElement("div");
      title.className = "dgt-lang-menu-title";
      title.textContent = currentDict.langMenuTitle;
      menu.appendChild(title);

      SUPPORTED_LANGUAGES.forEach((lang) => {
        const item = document.createElement("button");
        item.type = "button";
        const isActive = lang.name === outgoingLang;
        item.className = `dgt-lang-item ${isActive ? "active" : ""}`;
        item.innerHTML = `
          <span class="dgt-lang-item-name">${lang.name}</span>
          <span class="dgt-lang-item-meta">
            <span class="dgt-lang-item-code">${lang.code}</span>
            ${isActive ? '<span class="dgt-lang-item-check">✓</span>' : ""}
          </span>
        `;

        item.addEventListener("mousedown", (ev) => ev.preventDefault());
        item.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          outgoingLang = lang.name;
          langBadge.querySelector("span").textContent = lang.code;
          const dict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
          outgoingBtn.title = dict.translateTitle.replace("{lang}", outgoingLang);
          chrome.storage.local.set({ outgoingLang: lang.name });
          closeMenu();
        });

        menu.appendChild(item);
      });

      document.body.appendChild(menu);
      activeMenu = menu;

      const updatePosition = () => {
        if (!activeMenu || !langBadge.isConnected) {
          closeMenu();
          return;
        }
        const rect = langBadge.getBoundingClientRect();
        const menuWidth = 170;
        const left = Math.max(10, Math.min(window.innerWidth - menuWidth - 10, rect.right - menuWidth));
        const bottom = Math.max(10, window.innerHeight - rect.top + 8);
        activeMenu.style.left = `${left}px`;
        activeMenu.style.bottom = `${bottom}px`;
      };

      updatePosition();

      const onDocClick = (ev) => {
        if (activeMenu && !activeMenu.contains(ev.target) && !langBadge.contains(ev.target)) {
          closeMenu();
        }
      };

      const onKeyDown = (ev) => {
        if (ev.key === "Escape") {
          closeMenu();
        }
      };

      document.addEventListener("click", onDocClick, true);
      document.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("resize", updatePosition);
      window.addEventListener("scroll", updatePosition, true);

      cleanupListeners = () => {
        document.removeEventListener("click", onDocClick, true);
        document.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("resize", updatePosition);
        window.removeEventListener("scroll", updatePosition, true);
      };
    });

    const translateAndReplaceInput = async () => {
      const currentText = slateEditor.innerText.trim();
      if (!currentText) return;

      outgoingBtn.classList.add("dgt-loading");

      try {
        const res = await requestTranslation(currentText, outgoingLang, {
          includeReverse: reversePreviewEnabled,
        });

        const translated =
          typeof res === "object" ? res.translatedText : res;
        replaceSlateText(slateEditor, translated);

        if (reversePreviewEnabled && res.reversePreview) {
          const channelArea =
            form.closest('[class*="channelTextArea"]') || form;
          showReversePreviewBox(
            channelArea,
            currentText,
            res.reversePreview,
            slateEditor,
          );
        }
      } catch (err) {
        const dict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
        alert(`${dict.translationFailed}: ${err.message}`);
      } finally {
        outgoingBtn.classList.remove("dgt-loading");
      }
    };

    outgoingBtn.addEventListener("mousedown", (e) => {
      // Предотвращаем потерю фокуса из текстового поля Slate при клике
      e.preventDefault();
    });

    outgoingBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      translateAndReplaceInput();
    });

    const autoBtn = document.createElement("button");
    autoBtn.type = "button";
    autoBtn.className = "dgt-auto-btn";
    autoBtn.innerHTML = `<span>⚡</span><span class="dgt-auto-text">${dict.autoBtn}</span>`;

    const currentChId = getCurrentChannelId();
    const isAutoActive = isAutoTranslateActiveForChannel(
      currentChId,
      autoTranslateEnabled,
      autoTranslateChannels,
    );
    if (isAutoActive) {
      autoBtn.classList.add("active");
      autoBtn.title = dict.autoTitleActive;
    } else {
      autoBtn.title = dict.autoTitleInactive;
    }

    autoBtn.addEventListener("mousedown", (e) => e.preventDefault());
    autoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const chId = getCurrentChannelId();
      if (!chId) return;

      const active = isAutoTranslateActiveForChannel(
        chId,
        autoTranslateEnabled,
        autoTranslateChannels,
      );
      const next = !active;
      autoTranslateChannels[chId] = next;
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ autoTranslateChannels: { ...autoTranslateChannels } });
      }
      updateAllAutoButtons();
      if (next) {
        checkAndAutoTranslateMessages();
      }
    });

    wrapper.appendChild(outgoingBtn);
    wrapper.appendChild(langBadge);
    wrapper.appendChild(autoBtn);

    const voiceBtn = document.createElement("button");
    voiceBtn.type = "button";
    voiceBtn.className = "dgt-voice-subtitles-btn";
    voiceBtn.innerHTML = `<span>🎙️</span><span class="dgt-voice-text">${dict.voiceBtn}</span>`;
    voiceBtn.title = isLiveCaptionsActive
      ? dict.voiceTitleActive
      : dict.voiceTitleInactive;
    if (isLiveCaptionsActive) {
      voiceBtn.classList.add("active");
    }
    voiceBtn.addEventListener("mousedown", (e) => e.preventDefault());
    voiceBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleLiveCaptionsSession();
    });
    wrapper.appendChild(voiceBtn);

    buttonContainer.prepend(wrapper);

    if (slateEditor.dataset.dgtKeybound !== "true") {
      slateEditor.dataset.dgtKeybound = "true";
      slateEditor.addEventListener("keydown", (e) => {
        if (isHotkeyTriggered(e)) {
          e.preventDefault();
          translateAndReplaceInput();
        }
      });
    }
  }

  function attachVoicePanelButton() {
    if (typeof document === "undefined") return;
    const rtcEl = document.querySelector(
      '[class*="rtcConnectionStatus"], [class*="connection_"], [class*="voiceUsers_"], button[aria-label*="Отключиться"], button[aria-label*="Disconnect"]',
    );
    if (!rtcEl) return;

    // Ищем карточку голосового подключения (над профилем пользователя в левом сайдбаре)
    const voiceCard =
      rtcEl.closest('[class*="container_"]') ||
      rtcEl.closest('section[class*="panels_"] > div') ||
      rtcEl.parentElement;
    if (!voiceCard) return;

    // Игнорируем карточку профиля пользователя
    if (voiceCard.querySelector('[class*="avatar_"], [class*="accountProfile_"]')) {
      return;
    }

    if (voiceCard.querySelector(".dgt-voice-panel-btn")) return;

    // Удаляем случайные дубликаты
    document
      .querySelectorAll(".panels_ > .dgt-voice-panel-btn, section > .dgt-voice-panel-btn")
      .forEach((el) => el.remove());

    const dict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dgt-voice-panel-btn";
    btn.innerHTML = `<span class="dgt-voice-btn-icon">🎙️</span><span class="dgt-voice-btn-text">${
      isLiveCaptionsActive ? dict.voicePanelBtnActive : dict.voicePanelBtnInactive
    }</span>`;
    btn.title = isLiveCaptionsActive
      ? dict.voicePanelTitleActive
      : dict.voicePanelTitleInactive;
    if (isLiveCaptionsActive) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleLiveCaptionsSession();
    });

    voiceCard.appendChild(btn);
  }

  function makeElementDraggable(element, handle) {
    if (!element || !handle) return;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = element.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      element.style.left = `${origLeft}px`;
      element.style.top = `${origTop}px`;
      element.style.bottom = "auto";
      element.style.transform = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    function onMouseMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      element.style.left = `${Math.max(10, Math.min(window.innerWidth - element.offsetWidth - 10, origLeft + dx))}px`;
      element.style.top = `${Math.max(10, Math.min(window.innerHeight - element.offsetHeight - 10, origTop + dy))}px`;
    }

    function onMouseUp() {
      isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
  }

  function createCaptionsOverlay() {
    if (typeof document === "undefined") return null;
    let overlay = document.getElementById("dgtCaptionsOverlay");
    if (overlay) return overlay;

    const dict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
    overlay = document.createElement("div");
    overlay.id = "dgtCaptionsOverlay";
    overlay.className = "dgt-captions-overlay";
    overlay.innerHTML = `
      <div class="dgt-captions-header" id="dgtCaptionsHeader">
        <div class="dgt-captions-title">
          <span class="dgt-pulse-dot connecting" id="dgtCaptionsDot"></span>
          <span class="dgt-captions-header-label">${dict.overlayTitle}</span>
          <span class="dgt-captions-status" id="dgtCaptionsStatus">${dict.overlayConnecting}</span>
        </div>
        <div class="dgt-captions-actions">
          <button type="button" class="dgt-captions-action-btn" id="dgtCaptionsClearBtn" title="${dict.overlayClearTitle}">🧹</button>
          <button type="button" class="dgt-captions-action-btn" id="dgtCaptionsCloseBtn" title="${dict.overlayCloseTitle}">✖</button>
        </div>
      </div>
      <div class="dgt-captions-body" id="dgtCaptionsBody">
        <div class="dgt-caption-placeholder">${dict.overlayPlaceholder}</div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector("#dgtCaptionsCloseBtn")?.addEventListener("click", () => {
      stopLiveCaptionsSession();
      overlay.remove();
      captionsOverlayElement = null;
    });

    overlay.querySelector("#dgtCaptionsClearBtn")?.addEventListener("click", () => {
      const body = overlay.querySelector("#dgtCaptionsBody");
      if (body) {
        const currentDict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
        body.innerHTML = `<div class="dgt-caption-placeholder">${currentDict.overlayCleared}</div>`;
        currentCaptionLineElement = null;
        currentTurnCaption = "";
      }
    });

    makeElementDraggable(overlay, overlay.querySelector("#dgtCaptionsHeader"));
    captionsOverlayElement = overlay;
    return overlay;
  }

  let currentTurnCaption = "";

  function cleanStutterRepetitions(text) {
    if (!text || typeof text !== "string") return "";
    // Устраняем зацикленные артефакты ASR/LLM, когда одно слово повторяется 3+ раз подряд (с поддержкой Юникода)
    return text.replace(/(^|\s+)(\S+)(?:\s+\2){2,}(?=\s+|$)/gi, "$1$2");
  }

  function mergeStreamingText(existing, incoming) {
    if (!existing) return cleanStutterRepetitions(incoming);
    if (!incoming) return cleanStutterRepetitions(existing);
    if (incoming.startsWith(existing)) return cleanStutterRepetitions(incoming);
    if (existing.endsWith(incoming)) return cleanStutterRepetitions(existing);

    // Проверяем перекрытие окончания existing и начала incoming
    const maxOverlap = Math.min(existing.length, incoming.length);
    for (let len = maxOverlap; len > 0; len--) {
      if (existing.endsWith(incoming.slice(0, len))) {
        return cleanStutterRepetitions(existing + incoming.slice(len));
      }
    }

    const needsSpace =
      !/[\s\p{P}]$/u.test(existing) && !/^[\s\p{P}]/u.test(incoming);
    return cleanStutterRepetitions(existing + (needsSpace ? " " : "") + incoming);
  }

  function handleIncomingLiveCaption(text, isTurnComplete) {
    if (!text && !isTurnComplete) return;
    const overlay = createCaptionsOverlay();
    if (!overlay) return;
    const body = overlay.querySelector("#dgtCaptionsBody");
    if (!body) return;

    const placeholder = body.querySelector(".dgt-caption-placeholder");
    if (placeholder) placeholder.remove();

    if (text) {
      if (!currentCaptionLineElement) {
        currentCaptionLineElement = document.createElement("div");
        currentCaptionLineElement.className = "dgt-caption-item dgt-caption-active";
        const textSpan = document.createElement("span");
        textSpan.className = "dgt-caption-text";
        currentTurnCaption = text;
        textSpan.textContent = currentTurnCaption;
        currentCaptionLineElement.appendChild(textSpan);
        body.appendChild(currentCaptionLineElement);
      } else {
        const textSpan = currentCaptionLineElement.querySelector(".dgt-caption-text");
        if (textSpan) {
          currentTurnCaption = mergeStreamingText(currentTurnCaption, text);
          textSpan.textContent = currentTurnCaption;
        }
      }
      body.scrollTop = body.scrollHeight;
    }

    if (isTurnComplete && currentCaptionLineElement) {
      const finishedLine = currentCaptionLineElement;
      finishedLine.classList.remove("dgt-caption-active");
      currentCaptionLineElement = null;
      currentTurnCaption = "";

      // Автоматическое затухание через 7 секунд
      setTimeout(() => {
        finishedLine.classList.add("dgt-fade-out");
        setTimeout(() => {
          if (finishedLine.parentElement) {
            finishedLine.remove();
          }
        }, 600);
      }, 7000);
    }
  }

  function showOverlaySystemError(errorMsg) {
    const overlay = createCaptionsOverlay();
    if (!overlay) return;
    const body = overlay.querySelector("#dgtCaptionsBody");
    if (!body) return;
    const placeholder = body.querySelector(".dgt-caption-placeholder");
    if (placeholder) placeholder.remove();
    const errDiv = document.createElement("div");
    errDiv.className = "dgt-caption-item dgt-caption-error";
    errDiv.textContent = `⚠️ ${errorMsg}`;
    body.appendChild(errDiv);
    body.scrollTop = body.scrollHeight;
  }

  function updateAllContentUiTexts() {
    if (typeof document === "undefined") return;
    const dict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
    updateAllAutoButtons();
    updateAllVoiceButtons(isLiveCaptionsActive);

    // Update outgoing buttons
    document.querySelectorAll(".dgt-chat-input-btn").forEach((btn) => {
      btn.title = dict.translateTitle.replace("{lang}", outgoingLang);
    });

    // Update lang badge
    document.querySelectorAll(".dgt-lang-badge").forEach((btn) => {
      btn.title = dict.langBadgeTitle;
    });

    // Update message buttons
    document.querySelectorAll(".dgt-translate-msg-btn").forEach((btn) => {
      btn.title = btn.classList.contains("dgt-reply-btn")
        ? dict.translateMsgReplyTitle
        : dict.translateMsgTitle;
    });

    // Update overlay if present
    const overlay = document.getElementById("dgtCaptionsOverlay");
    if (overlay) {
      const titleLabel = overlay.querySelector(".dgt-captions-header-label");
      if (titleLabel) titleLabel.textContent = dict.overlayTitle;
      const clearBtn = overlay.querySelector("#dgtCaptionsClearBtn");
      if (clearBtn) clearBtn.title = dict.overlayClearTitle;
      const closeBtn = overlay.querySelector("#dgtCaptionsCloseBtn");
      if (closeBtn) closeBtn.title = dict.overlayCloseTitle;
      const placeholder = overlay.querySelector(".dgt-caption-placeholder");
      if (placeholder) placeholder.textContent = dict.overlayPlaceholder;
    }
  }

  function updateAllVoiceButtons(isActive) {
    if (typeof document === "undefined") return;
    const dict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
    document
      .querySelectorAll(".dgt-voice-subtitles-btn, .dgt-voice-panel-btn")
      .forEach((btn) => {
        btn.classList.toggle("active", isActive);
        const textSpan = btn.querySelector(
          ".dgt-voice-text, .dgt-voice-btn-text",
        );
        if (textSpan) {
          if (btn.classList.contains("dgt-voice-panel-btn")) {
            textSpan.textContent = isActive
              ? dict.voicePanelBtnActive
              : dict.voicePanelBtnInactive;
          } else {
            textSpan.textContent = dict.voiceBtn;
          }
        }
        btn.title = isActive
          ? (btn.classList.contains("dgt-voice-panel-btn")
              ? dict.voicePanelTitleActive
              : dict.voiceTitleActive)
          : (btn.classList.contains("dgt-voice-panel-btn")
              ? dict.voicePanelTitleInactive
              : dict.voiceTitleInactive);
      });
  }

  function startLiveCaptionsSession() {
    if (isLiveCaptionsActive) return;
    isLiveCaptionsActive = true;
    updateAllVoiceButtons(true);
    const dict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
    const overlay = createCaptionsOverlay();
    if (overlay) {
      const statusEl = overlay.querySelector("#dgtCaptionsStatus");
      const dotEl = overlay.querySelector("#dgtCaptionsDot");
      if (statusEl) statusEl.textContent = dict.overlayConnecting;
      if (dotEl) dotEl.className = "dgt-pulse-dot connecting";
    }

    if (liveCaptionsPort) {
      try {
        liveCaptionsPort.disconnect();
      } catch {}
      liveCaptionsPort = null;
    }

    let hasLiveError = false;

    if (typeof chrome !== "undefined" && chrome.runtime?.connect) {
      console.log("[DGT Content] Открытие порта dgt-live-captions...");
      liveCaptionsPort = chrome.runtime.connect({ name: "dgt-live-captions" });

      liveCaptionsPort.onMessage.addListener((msg) => {
        if (!overlay) return;
        const statusEl = overlay.querySelector("#dgtCaptionsStatus");
        const dotEl = overlay.querySelector("#dgtCaptionsDot");

        const currentDict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;

        if (msg.type === "LIVE_STATUS") {
          console.log("[DGT Content] Статус от воркера:", msg.status);
          if (statusEl) statusEl.textContent = msg.status;
        } else if (msg.type === "LIVE_CONNECTED") {
          console.log("[DGT Content] Live сессия готова к переводу");
          hasLiveError = false;
          if (statusEl) statusEl.textContent = currentDict.overlayListening;
          if (dotEl) dotEl.className = "dgt-pulse-dot live";
        } else if (msg.type === "LIVE_CAPTION") {
          console.log("[DGT Content] Получен субтитр:", msg.text);
          hasLiveError = false;
          if (statusEl) statusEl.textContent = currentDict.overlayListening;
          if (dotEl) dotEl.className = "dgt-pulse-dot live";
          handleIncomingLiveCaption(msg.text, msg.isTurnComplete);
        } else if (msg.type === "LIVE_ERROR") {
          console.error("[DGT Content] Ошибка Live:", msg.error);
          hasLiveError = true;
          if (statusEl) statusEl.textContent = currentDict.overlayError;
          if (dotEl) dotEl.className = "dgt-pulse-dot error";
          showOverlaySystemError(msg.error || currentDict.overlayError);
        } else if (msg.type === "LIVE_CLOSED") {
          console.warn("[DGT Content] Сессия закрыта сервером:", msg.code, msg.reason);
          if (isLiveCaptionsActive) {
            stopLiveCaptionsSession(hasLiveError);
          }
        }
      });

      liveCaptionsPort.onDisconnect.addListener(() => {
        const lastErr = chrome.runtime?.lastError?.message;
        console.warn("[DGT Content] Порт закрыт (onDisconnect). Ошибка:", lastErr);
        if (isLiveCaptionsActive) {
          if (lastErr) {
            showOverlaySystemError("Фоновый процесс расширения перезапущен или недоступен: " + lastErr);
          }
          stopLiveCaptionsSession(hasLiveError);
        }
      });

      console.log("[DGT Content] Отправка START_LIVE...");
      liveCaptionsPort.postMessage({ type: "START_LIVE" });
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("DGT_START_VOICE_CAPTURE"));
    }
  }

  function stopLiveCaptionsSession(preserveError = false) {
    isLiveCaptionsActive = false;
    updateAllVoiceButtons(false);
    const dict = CONTENT_I18N[uiLang] || CONTENT_I18N.ru;
    if (captionsOverlayElement && !preserveError) {
      const statusEl = captionsOverlayElement.querySelector("#dgtCaptionsStatus");
      const dotEl = captionsOverlayElement.querySelector("#dgtCaptionsDot");
      if (statusEl) statusEl.textContent = dict.overlayStopped;
      if (dotEl) dotEl.className = "dgt-pulse-dot idle";
    }

    if (liveCaptionsPort) {
      try {
        liveCaptionsPort.postMessage({ type: "STOP_LIVE" });
        liveCaptionsPort.disconnect();
      } catch {}
      liveCaptionsPort = null;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("DGT_STOP_VOICE_CAPTURE"));
    }
  }

  function toggleLiveCaptionsSession() {
    if (isLiveCaptionsActive) {
      stopLiveCaptionsSession();
    } else {
      startLiveCaptionsSession();
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("DGT_VOICE_AUDIO_CHUNK", (e) => {
      if (isLiveCaptionsActive && liveCaptionsPort && e.detail?.pcmBase64) {
        liveCaptionsPort.postMessage({
          type: "AUDIO_CHUNK",
          pcmBase64: e.detail.pcmBase64,
        });
      }
    });
  }

  function isTildeKey(e) {
    if (!e) return false;
    return (
      e.code === "Backquote" ||
      e.key === "`" ||
      e.key === "~" ||
      e.key === "ё" ||
      e.key === "Ё"
    );
  }

  function isHotkeyTriggered(e) {
    if (!e) return false;
    return Boolean(e.ctrlKey && !e.altKey && isTildeKey(e));
  }

  // --- НАБЛЮДАТЕЛЬ ЗА ВИРТУАЛЬНЫМ DOM DISCORD ---

  let observerTimeout = null;
  if (
    typeof document !== "undefined" &&
    document.body &&
    typeof MutationObserver !== "undefined"
  ) {
    const observer = new MutationObserver(() => {
      if (observerTimeout) return;
      observerTimeout = setTimeout(() => {
        checkChannelChange();
        attachIncomingButtons();
        attachOutgoingButton();
        attachVoicePanelButton();
        updateAllAutoButtons();
        observerTimeout = null;
      }, 100);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Первичная инициализация при загрузке
    checkChannelChange();
    attachIncomingButtons();
    attachOutgoingButton();
    attachVoicePanelButton();
    updateAllAutoButtons();
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      isTildeKey,
      isHotkeyTriggered,
      getCleanMessageText,
      getLangCode,
      SUPPORTED_LANGUAGES,
      CONTENT_I18N,
      updateAllContentUiTexts,
      getCurrentChannelId,
      isAutoTranslateActiveForChannel,
      shouldAutoTranslateMessage,
      handleIncomingLiveCaption,
      mergeStreamingText,
      cleanStutterRepetitions,
      toggleLiveCaptionsSession,
      startLiveCaptionsSession,
      stopLiveCaptionsSession,
      isLikelySameLanguage,
    };
  }
})();
