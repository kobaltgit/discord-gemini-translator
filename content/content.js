(() => {
  let incomingLang = "Russian";
  let outgoingLang = "English";
  let reversePreviewEnabled = true;
  let autoTranslateEnabled = false;
  let autoTranslateChannels = {};
  let lastSeenChannelId = null;
  const autoTranslateQueue = [];
  let isQueueProcessing = false;

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
    const match = SUPPORTED_LANGUAGES.find(
      (l) => l.name.toLowerCase() === langName.toLowerCase(),
    );
    return match ? match.code : langName.slice(0, 2).toUpperCase();
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
    return true;
  }

  function updateAllAutoButtons() {
    const currentChId = getCurrentChannelId();
    const isActive = isAutoTranslateActiveForChannel(
      currentChId,
      autoTranslateEnabled,
      autoTranslateChannels,
    );
    document.querySelectorAll(".dgt-auto-btn").forEach((btn) => {
      btn.classList.toggle("active", isActive);
      btn.title = isActive
        ? "Автоперевод канала: ВКЛ (нажмите для выключения)"
        : "Автоперевод канала: ВЫКЛ (нажмите для включения)";
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

      const translationBox = document.createElement("div");
      translationBox.className = "dgt-translation-box dgt-auto-box";
      translationBox.dataset.for = contentElement.id;
      translationBox.innerHTML = `
        <div class="dgt-translation-header">
          <span class="dgt-translation-title">⚡ Gemini [Auto] (${incomingLang})</span>
          <button type="button" class="dgt-close-btn" title="Закрыть">✕</button>
        </div>
        <div class="dgt-translation-text">Перевод...</div>
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
        const res = await requestTranslation(rawText, incomingLang);
        textElement.textContent =
          typeof res === "object" ? res.translatedText : res;
      } catch (err) {
        textElement.className = "dgt-translation-error";
        textElement.textContent = `Ошибка: ${err.message}`;
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
        updateAllAutoButtons();
        checkAndAutoTranslateMessages();
      },
    );

    // Отслеживание изменений настроек в реальном времени без перезагрузки вкладки
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local") {
        if (changes.incomingLang) incomingLang = changes.incomingLang.newValue;
        if (changes.outgoingLang) outgoingLang = changes.outgoingLang.newValue;
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
      '[id^="message-content-"]',
    );

    contentElements.forEach((contentElement) => {
      if (contentElement.dataset.dgtProcessed === "true") {
        return;
      }

      contentElement.dataset.dgtProcessed = "true";

      const isReply = Boolean(
        contentElement.closest('[class*="repliedMessage"]'),
      );

      const btn = document.createElement("button");
      btn.className = `dgt-translate-msg-btn ${isReply ? "dgt-reply-btn" : "dgt-main-btn"}`;
      btn.title = isReply
        ? "Перевести цитату (Gemini)"
        : "Перевести сообщение (Gemini)";
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

        btn.classList.add("dgt-loading");
        btn.innerHTML = "⏳";

        const translationBox = document.createElement("div");
        translationBox.className = "dgt-translation-box";
        translationBox.dataset.for = contentElement.id;
        translationBox.innerHTML = `
          <div class="dgt-translation-header">
            <span class="dgt-translation-title">${GEMINI_ICON_SVG} Gemini (${incomingLang})</span>
            <button type="button" class="dgt-close-btn" title="Закрыть">✕</button>
          </div>
          <div class="dgt-translation-text">Перевод...</div>
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
          const res = await requestTranslation(rawText, incomingLang);
          textElement.textContent =
            typeof res === "object" ? res.translatedText : res;
        } catch (error) {
          textElement.className = "dgt-translation-error";
          textElement.textContent = `Ошибка: ${error.message}`;
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

    const previewBox = document.createElement("div");
    previewBox.className = "dgt-reverse-box";
    previewBox.innerHTML = `
      <div class="dgt-reverse-header">
        <span class="dgt-reverse-title">🔍 Самопроверка (${getLangCode(outgoingLang)} ➔ RU):</span>
        <div class="dgt-reverse-actions">
          <button type="button" class="dgt-revert-btn">Отменить</button>
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

    const wrapper = document.createElement("div");
    wrapper.className = "dgt-outgoing-wrapper";

    const outgoingBtn = document.createElement("button");
    outgoingBtn.className = "dgt-chat-input-btn";
    outgoingBtn.type = "button";
    outgoingBtn.title = `Перевести ввод на ${outgoingLang} (Ctrl + ~)`;
    outgoingBtn.innerHTML = GEMINI_ICON_SVG;

    const langBadge = document.createElement("button");
    langBadge.type = "button";
    langBadge.className = "dgt-lang-badge";
    langBadge.title = "Выбор языка перевода";
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

      const title = document.createElement("div");
      title.className = "dgt-lang-menu-title";
      title.textContent = "Язык перевода";
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
          outgoingBtn.title = `Перевести ввод на ${outgoingLang} (Ctrl + ~)`;
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
        alert(`Не удалось перевести текст: ${err.message}`);
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
    autoBtn.innerHTML = `<span>⚡</span><span class="dgt-auto-text">Авто</span>`;

    const currentChId = getCurrentChannelId();
    const isAutoActive = isAutoTranslateActiveForChannel(
      currentChId,
      autoTranslateEnabled,
      autoTranslateChannels,
    );
    if (isAutoActive) {
      autoBtn.classList.add("active");
      autoBtn.title = "Автоперевод канала: ВКЛ (нажмите для выключения)";
    } else {
      autoBtn.title = "Автоперевод канала: ВЫКЛ (нажмите для включения)";
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
  if (typeof document !== "undefined" && document.body) {
    const observer = new MutationObserver(() => {
      if (observerTimeout) return;
      observerTimeout = setTimeout(() => {
        checkChannelChange();
        attachIncomingButtons();
        attachOutgoingButton();
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
    updateAllAutoButtons();
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      isTildeKey,
      isHotkeyTriggered,
      getCleanMessageText,
      getLangCode,
      SUPPORTED_LANGUAGES,
      getCurrentChannelId,
      isAutoTranslateActiveForChannel,
      shouldAutoTranslateMessage,
    };
  }
})();
