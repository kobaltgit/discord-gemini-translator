const translations = {
  ru: {
    subtitle: "Двусторонний перевод в Discord",
    apiKeyLabel: "API-ключ Google Gemini:",
    apiKeyPlaceholder: "AIzaSy...",
    toggleApiKeyTitle: "Показать/скрыть ключ",
    fetchModelsBtn: "Загрузить список моделей",
    modelSelectLabel: "Модель Gemini (Текстовый чат):",
    modelSelectPlaceholder: "Сначала загрузите модели по API-ключу",
    liveModelSelectLabel: "Модель Live-субтитров (Голосовые каналы):",
    liveModelSelectPlaceholder: "Сначала загрузите модели по API-ключу",
    incomingLangLabel: "Входящие:",
    outgoingLangLabel: "Исходящие:",
    toneSelectLabel: "Стиль перевода:",
    toneOptionNeutral: "Нейтральный (разговорный)",
    toneOptionCasual: "Геймерский / Сленг",
    toneOptionFormal: "Официальный / Вежливый",
    toneOptionConcise: "Краткий (для коллов)",
    reversePreviewLabel: "Обратный перевод для самопроверки",
    autoTranslateLabel: "Глобальный автоперевод всех каналов",
    cacheLabel: "Кэш переводов:",
    clearCacheBtn: "Очистить",
    saveBtn: "Сохранить настройки",
    footerText: "Ключ сохраняется локально в вашем браузере",
    languages: {
      Russian: "Русский",
      English: "Английский",
      German: "Немецкий",
      French: "Французский",
      Spanish: "Испанский",
      Chinese: "Китайский",
      Japanese: "Японский",
      Korean: "Корейский",
      Ukrainian: "Украинский",
    },
    messages: {
      emptyKeyBeforeFetch: "Введите API-ключ перед запросом моделей.",
      fetchingModels: "Запрос доступных моделей к Gemini API...",
      connectionError: "Ошибка соединения",
      fetchFailed: "Не удалось получить модели",
      modelsFound: "Найдено подходящих моделей",
      missingApiKey: "Пожалуйста, укажите API-ключ Gemini.",
      missingModel: "Пожалуйста, загрузите и выберите модель из списка.",
      settingsSaved: "Настройки успешно сохранены!",
      cacheCleared: "Кэш переводов успешно очищен!",
    },
  },
  en: {
    subtitle: "Two-way translation for Discord",
    apiKeyLabel: "Google Gemini API Key:",
    apiKeyPlaceholder: "AIzaSy...",
    toggleApiKeyTitle: "Show/hide API key",
    fetchModelsBtn: "Load Models List",
    modelSelectLabel: "Gemini Model (Text Chat):",
    modelSelectPlaceholder: "Load models with your API key first",
    liveModelSelectLabel: "Live Subtitles Model (Voice Channels):",
    liveModelSelectPlaceholder: "Load models with your API key first",
    incomingLangLabel: "Incoming:",
    outgoingLangLabel: "Outgoing:",
    toneSelectLabel: "Translation Tone:",
    toneOptionNeutral: "Neutral (Conversational)",
    toneOptionCasual: "Gamer / Casual Slang",
    toneOptionFormal: "Formal / Professional",
    toneOptionConcise: "Concise (Fast Calls)",
    reversePreviewLabel: "Reverse translation self-check",
    autoTranslateLabel: "Global auto-translate all channels",
    cacheLabel: "Translation Cache:",
    clearCacheBtn: "Clear",
    saveBtn: "Save Settings",
    footerText: "Key is stored locally in your browser",
    languages: {
      Russian: "Russian",
      English: "English",
      German: "German",
      French: "French",
      Spanish: "Spanish",
      Chinese: "Chinese",
      Japanese: "Japanese",
      Korean: "Korean",
      Ukrainian: "Ukrainian",
    },
    messages: {
      emptyKeyBeforeFetch: "Enter your API key before fetching models.",
      fetchingModels: "Requesting models from Gemini API...",
      connectionError: "Connection error",
      fetchFailed: "Failed to load models",
      modelsFound: "Found suitable models",
      missingApiKey: "Please specify a Gemini API key.",
      missingModel: "Please load and select a model from the list.",
      settingsSaved: "Settings saved successfully!",
      cacheCleared: "Translation cache cleared successfully!",
    },
  },
};

function filterValidModels(models) {
  if (!Array.isArray(models)) return [];
  const excludedKeywords = [
    "tts", "audio", "music", "lyria", "transcribe", "image", "imagen",
    "banana", "robotics", "computer-use", "research", "antigravity",
    "customtools", "tools", "embedding", "embed", "aqa", "veo", "clip",
  ];
  return models.filter((m) => {
    const lower = (m.name + " " + (m.displayName || "")).toLowerCase();
    const isExcluded = excludedKeywords.some((kw) => lower.includes(kw));
    if (isExcluded) return false;
    return lower.includes("gemini") || lower.includes("gemma");
  }).sort((a, b) => {
    const score = (model) => {
      const n = model.name.toLowerCase();
      if (n.includes("flash-lite")) return 1;
      if (n.includes("flash")) return 2;
      if (n.includes("pro")) return 3;
      return 4;
    };
    return score(a) - score(b);
  });
}

function filterLiveModels(models) {
  const fallback = [
    { name: "models/gemini-3.8-live", displayName: "Gemini 3.8 Live" },
    { name: "models/gemini-3.5-transcribe-live", displayName: "Gemini 3.5 Transcribe Live" },
    { name: "models/gemini-3.5-live-translate-preview", displayName: "Gemini 3.5 Live Translate" },
  ];
  if (!Array.isArray(models) || models.length === 0) {
    return fallback;
  }

  const excluded = [
    "tts",
    "embedding",
    "embed",
    "imagen",
    "image",
    "banana",
    "robotics",
    "computer-use",
    "veo",
    "aqa",
    "lyria",
    "music",
    "clip",
    "thinking", // requires non-blocking tool function declarations
    "3.1-flash", // discontinued preview
    "native-audio", // discontinued preview
  ];

  const filtered = models
    .filter((m) => {
      if (!m || !m.name) return false;
      const lower = (m.name + " " + (m.displayName || "")).toLowerCase();
      if (excluded.some((kw) => lower.includes(kw))) return false;
      if (!lower.includes("gemini")) return false;

      return (
        lower.includes("live") ||
        lower.includes("transcribe")
      );
    })
    .map((m) => ({
      name: m.name,
      displayName: m.displayName || m.name.replace("models/", ""),
    }))
    .sort((a, b) => {
      const score = (model) => {
        const n = model.name.toLowerCase();
        if (n.includes("3.8-live")) return 1;
        if (n.includes("3.5-transcribe-live")) return 2;
        if (n.includes("3.5-transcribe")) return 3;
        if (n.includes("3.5-live-translate")) return 4;
        return 5;
      };
      return score(a) - score(b);
    });

  return filtered.length > 0 ? filtered : fallback;
}

function initPopup() {
  const apiKeyInput = document.getElementById("apiKey");
  const toggleApiKeyBtn = document.getElementById("toggleApiKey");
  const fetchModelsBtn = document.getElementById("fetchModelsBtn");
  const modelSelect = document.getElementById("modelSelect");
  const liveModelSelect = document.getElementById("liveModelSelect");
  const incomingLangSelect = document.getElementById("incomingLang");
  const outgoingLangSelect = document.getElementById("outgoingLang");
  const toneSelect = document.getElementById("toneSelect");
  const reversePreviewToggle = document.getElementById("reversePreviewToggle");
  const autoTranslateToggle = document.getElementById("autoTranslateToggle");
  const cacheCount = document.getElementById("cacheCount");
  const clearCacheBtn = document.getElementById("clearCacheBtn");
  const saveBtn = document.getElementById("saveBtn");
  const statusMessage = document.getElementById("statusMessage");
  const langButtons = document.querySelectorAll(".lang-btn");

  let currentUiLang = "ru";
  let cachedModels = [];
  let cachedLiveModels = [];

  // Switch UI Language
  function setUiLanguage(lang) {
    currentUiLang = lang === "en" ? "en" : "ru";
    document.documentElement.lang = currentUiLang;

    langButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === currentUiLang);
    });

    const dict = translations[currentUiLang];

    // Static text elements with data-i18n
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (dict[key]) {
        el.textContent = dict[key];
      }
    });

    // Titles with data-i18n-title
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.dataset.i18nTitle;
      if (dict[key]) {
        el.title = dict[key];
      }
    });

    // Inputs placeholder
    if (apiKeyInput) {
      apiKeyInput.placeholder = dict.apiKeyPlaceholder;
    }

    // Model select placeholder options if empty
    if (modelSelect && modelSelect.options.length <= 1 && modelSelect.disabled) {
      if (modelSelect.options[0]) {
        modelSelect.options[0].textContent = dict.modelSelectPlaceholder;
      }
    }
    if (liveModelSelect && liveModelSelect.options.length <= 1 && liveModelSelect.disabled) {
      if (liveModelSelect.options[0]) {
        liveModelSelect.options[0].textContent = dict.liveModelSelectPlaceholder;
      }
    }

    // Localize options of incoming & outgoing selects while keeping original values
    localizeSelect(incomingLangSelect, dict.languages);
    localizeSelect(outgoingLangSelect, dict.languages);

    // Save choice
    chrome.storage.local.set({ uiLang: currentUiLang });
  }

  function localizeSelect(selectEl, langDict) {
    if (!selectEl) return;
    const currentVal = selectEl.value;
    Array.from(selectEl.options).forEach((opt) => {
      if (langDict[opt.value]) {
        opt.textContent = langDict[opt.value];
      }
    });
    selectEl.value = currentVal;
  }

  langButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setUiLanguage(btn.dataset.lang);
    });
  });

  restoreSettings();

  toggleApiKeyBtn.addEventListener("click", () => {
    if (apiKeyInput.type === "password") {
      apiKeyInput.type = "text";
      toggleApiKeyBtn.textContent = "🙈";
    } else {
      apiKeyInput.type = "password";
      toggleApiKeyBtn.textContent = "👁️";
    }
  });

  fetchModelsBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    const dict = translations[currentUiLang].messages;
    if (!key) {
      showStatus(dict.emptyKeyBeforeFetch, "error");
      return;
    }
    loadModelsFromApi(key);
  });

  if (clearCacheBtn) {
    clearCacheBtn.addEventListener("click", () => {
      const dict = translations[currentUiLang].messages;
      chrome.runtime.sendMessage({ action: "CLEAR_CACHE" }, () => {
        if (cacheCount) {
          cacheCount.textContent = "0";
        }
        showStatus(dict.cacheCleared, "success");
      });
    });
  }

  saveBtn.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    const selectedModel = modelSelect.value;
    const selectedLiveModel = liveModelSelect ? liveModelSelect.value : "";
    const incomingLang = incomingLangSelect.value;
    const outgoingLang = outgoingLangSelect.value;
    const selectedTone = toneSelect ? toneSelect.value : "neutral";
    const reverseEnabled = reversePreviewToggle
      ? reversePreviewToggle.checked
      : true;
    const autoTranslateEnabled = autoTranslateToggle
      ? autoTranslateToggle.checked
      : false;
    const dict = translations[currentUiLang].messages;

    if (!apiKey) {
      showStatus(dict.missingApiKey, "error");
      return;
    }

    if (!selectedModel) {
      showStatus(dict.missingModel, "error");
      return;
    }

    chrome.storage.local.set(
      {
        geminiApiKey: apiKey,
        geminiModel: selectedModel,
        geminiLiveModel: selectedLiveModel,
        incomingLang: incomingLang,
        outgoingLang: outgoingLang,
        translationTone: selectedTone,
        reversePreviewEnabled: reverseEnabled,
        autoTranslateEnabled: autoTranslateEnabled,
        savedModelsList: cachedModels,
        savedLiveModelsList: cachedLiveModels,
        uiLang: currentUiLang,
      },
      () => {
        showStatus(dict.settingsSaved, "success");
      },
    );
  });

  function restoreSettings() {
    chrome.storage.local.get(
      [
        "geminiApiKey",
        "geminiModel",
        "geminiLiveModel",
        "incomingLang",
        "outgoingLang",
        "translationTone",
        "reversePreviewEnabled",
        "autoTranslateEnabled",
        "translationCache",
        "savedModelsList",
        "savedLiveModelsList",
        "uiLang",
      ],
      (items) => {
        if (items.uiLang) {
          setUiLanguage(items.uiLang);
        } else {
          setUiLanguage("ru");
        }

        if (items.geminiApiKey) {
          apiKeyInput.value = items.geminiApiKey;
        }

        if (items.incomingLang) {
          incomingLangSelect.value = items.incomingLang;
        }

        if (items.outgoingLang) {
          outgoingLangSelect.value = items.outgoingLang;
        }

        if (items.translationTone && toneSelect) {
          toneSelect.value = items.translationTone;
        }

        if (reversePreviewToggle) {
          reversePreviewToggle.checked = items.reversePreviewEnabled !== false;
        }

        if (autoTranslateToggle) {
          autoTranslateToggle.checked = Boolean(items.autoTranslateEnabled);
        }

        if (cacheCount) {
          const count = items.translationCache
            ? Object.keys(items.translationCache).length
            : 0;
          cacheCount.textContent = String(count);
        }

        if (
          items.savedModelsList &&
          Array.isArray(items.savedModelsList) &&
          items.savedModelsList.length > 0
        ) {
          cachedModels = items.savedModelsList;
          renderModelOptions(cachedModels, items.geminiModel);
        }

        if (
          items.savedLiveModelsList &&
          Array.isArray(items.savedLiveModelsList) &&
          items.savedLiveModelsList.length > 0
        ) {
          cachedLiveModels = items.savedLiveModelsList;
          renderLiveModelOptions(cachedLiveModels, items.geminiLiveModel);
        } else {
          renderLiveModelOptions([], items.geminiLiveModel);
        }
      },
    );
  }

  function loadModelsFromApi(key) {
    const dict = translations[currentUiLang].messages;
    showStatus(dict.fetchingModels, "info");
    fetchModelsBtn.disabled = true;

    chrome.runtime.sendMessage(
      {
        action: "FETCH_MODELS",
        apiKey: key,
      },
      (response) => {
        fetchModelsBtn.disabled = false;

        if (chrome.runtime.lastError) {
          showStatus(
            `${dict.connectionError}: ${chrome.runtime.lastError.message}`,
            "error",
          );
          return;
        }

        if (!response || !response.success) {
          const errorText =
            response && response.error ? response.error : "Unknown error";
          showStatus(`${dict.fetchFailed}: ${errorText}`, "error");
          return;
        }

        cachedModels = response.textModels || response.models || [];
        cachedLiveModels =
          response.voiceModels ||
          response.liveModels ||
          filterLiveModels(response.models);

        chrome.storage.local.get(["geminiModel", "geminiLiveModel"], (items) => {
          renderModelOptions(cachedModels, items.geminiModel);
          renderLiveModelOptions(cachedLiveModels, items.geminiLiveModel);
          showStatus(
            `${dict.modelsFound}: ${cachedModels.length}`,
            "success",
          );
        });
      },
    );
  }

  function renderModelOptions(models, currentSelected) {
    const filtered = filterValidModels(models);
    cachedModels = filtered;
    modelSelect.innerHTML = "";
    modelSelect.disabled = false;

    filtered.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.name;
      const cleanId = item.name.replace("models/", "");
      option.textContent = item.displayName.includes(cleanId)
        ? item.displayName
        : `${item.displayName} (${cleanId})`;
      modelSelect.appendChild(option);
    });

    if (currentSelected && filtered.some((m) => m.name === currentSelected)) {
      modelSelect.value = currentSelected;
    } else if (filtered.length > 0) {
      const preferredDefault =
        filtered.find((m) => m.name.includes("flash-lite")) ||
        filtered.find((m) => m.name.includes("flash")) ||
        filtered[0];
      modelSelect.value = preferredDefault.name;
    }
  }

  function renderLiveModelOptions(models, currentSelected) {
    if (!liveModelSelect) return;
    const filtered = filterLiveModels(models);
    cachedLiveModels = filtered;
    liveModelSelect.innerHTML = "";
    liveModelSelect.disabled = false;

    filtered.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.name;
      const cleanId = item.name.replace("models/", "");
      option.textContent = item.displayName.includes(cleanId)
        ? item.displayName
        : `${item.displayName} (${cleanId})`;
      liveModelSelect.appendChild(option);
    });

    if (currentSelected && filtered.some((m) => m.name === currentSelected)) {
      liveModelSelect.value = currentSelected;
    } else if (filtered.length > 0) {
      liveModelSelect.value = filtered[0].name;
    }
  }

  function showStatus(text, type) {
    statusMessage.textContent = text;
    statusMessage.className = `status-message show ${type}`;
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initPopup);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    translations,
    filterValidModels,
    filterLiveModels,
  };
}
