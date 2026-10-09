(() => {
  let incomingLang = "Russian";
  let outgoingLang = "English";

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

  // Загрузка сохраненных настроек языков
  chrome.storage.local.get(["incomingLang", "outgoingLang"], (items) => {
    if (items.incomingLang) incomingLang = items.incomingLang;
    if (items.outgoingLang) outgoingLang = items.outgoingLang;
  });

  // Отслеживание изменений настроек в реальном времени без перезагрузки вкладки
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      if (changes.incomingLang) incomingLang = changes.incomingLang.newValue;
      if (changes.outgoingLang) outgoingLang = changes.outgoingLang.newValue;
    }
  });

  // Вспомогательная функция безопасного вызова перевода через фоновый воркер
  function requestTranslation(text, targetLang) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "TRANSLATE",
          text: text,
          targetLanguage: targetLang,
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
          resolve(response.translatedText);
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
          const translated = await requestTranslation(rawText, incomingLang);
          textElement.textContent = translated;
        } catch (error) {
          textElement.className = "dgt-translation-error";
          textElement.textContent = `Ошибка: ${error.message}`;
        } finally {
          btn.classList.remove("dgt-loading");
          btn.innerHTML = GEMINI_ICON_SVG;
        }
      });

      contentElement.appendChild(btn);
    });
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

    if (buttonContainer.querySelector(".dgt-chat-input-btn")) {
      return;
    }

    const outgoingBtn = document.createElement("button");
    outgoingBtn.className = "dgt-chat-input-btn";
    outgoingBtn.type = "button";
    outgoingBtn.title = `Перевести ввод на ${outgoingLang} (Ctrl + ~)`;
    outgoingBtn.innerHTML = GEMINI_ICON_SVG;

    const translateAndReplaceInput = async () => {
      const currentText = slateEditor.innerText.trim();
      if (!currentText) return;

      outgoingBtn.classList.add("dgt-loading");

      try {
        const translatedText = await requestTranslation(
          currentText,
          outgoingLang,
        );
        replaceSlateText(slateEditor, translatedText);
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

    buttonContainer.prepend(outgoingBtn);

    if (slateEditor.dataset.dgtKeybound !== "true") {
      slateEditor.dataset.dgtKeybound = "true";
      slateEditor.addEventListener("keydown", (e) => {
        const isTilde =
          e.code === "Backquote" ||
          e.key === "`" ||
          e.key === "~" ||
          e.key === "ё" ||
          e.key === "Ё";
        if (e.ctrlKey && !e.altKey && isTilde) {
          e.preventDefault();
          translateAndReplaceInput();
        }
      });
    }
  }

  // --- НАБЛЮДАТЕЛЬ ЗА ВИРТУАЛЬНЫМ DOM DISCORD ---

  let observerTimeout = null;
  const observer = new MutationObserver(() => {
    if (observerTimeout) return;
    observerTimeout = setTimeout(() => {
      attachIncomingButtons();
      attachOutgoingButton();
      observerTimeout = null;
    }, 100);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Первичная инициализация при загрузке
  attachIncomingButtons();
  attachOutgoingButton();
})();
