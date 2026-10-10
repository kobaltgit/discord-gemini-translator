const EXCLUDED_MODEL_KEYWORDS = [
  "tts",
  "audio",
  "music",
  "lyria",
  "transcribe",
  "image",
  "imagen",
  "banana",
  "robotics",
  "computer-use",
  "research",
  "antigravity",
  "customtools",
  "tools",
  "embedding",
  "embed",
  "aqa",
  "veo",
  "clip",
];

const TONE_INSTRUCTIONS = {
  neutral: "Provide a natural, standard conversational translation.",
  casual:
    "Adopt a friendly, casual Discord chat tone. Gaming slang, abbreviations, and informal phrasing are welcome.",
  formal:
    "Maintain a polite, formal tone suitable for professional or serious Discord communities.",
  concise:
    "Keep the translation as brief, direct, and compact as possible (ideal for fast gaming callouts).",
};

function makeCacheKey(text, targetLanguage, tone = "neutral") {
  const normText = (text || "").trim().toLowerCase();
  const normLang = (targetLanguage || "").trim().toLowerCase();
  const normTone = (tone || "neutral").trim().toLowerCase();
  return `${normText}|||${normLang}|||${normTone}`;
}

function getCachedTranslation(cache, text, targetLanguage, tone = "neutral") {
  if (!cache || typeof cache !== "object") return null;
  const key = makeCacheKey(text, targetLanguage, tone);
  const entry = cache[key];
  if (!entry) return null;
  if (typeof entry === "object" && entry.translation) {
    return entry.translation;
  }
  if (typeof entry === "string") {
    return entry;
  }
  return null;
}

function setCachedTranslation(
  cache,
  text,
  targetLanguage,
  tone = "neutral",
  translation = "",
  maxEntries = 500,
) {
  const safeCache = cache && typeof cache === "object" ? { ...cache } : {};
  const key = makeCacheKey(text, targetLanguage, tone);

  delete safeCache[key];
  safeCache[key] = {
    translation,
    updatedAt: Date.now(),
  };

  const keys = Object.keys(safeCache);
  if (keys.length > maxEntries) {
    keys.sort((a, b) => {
      const timeA = safeCache[a]?.updatedAt || 0;
      const timeB = safeCache[b]?.updatedAt || 0;
      return timeA - timeB;
    });
    const toRemove = keys.slice(0, keys.length - maxEntries);
    for (const k of toRemove) {
      delete safeCache[k];
    }
  }

  return safeCache;
}

function filterAndSortModels(rawModels) {
  if (!Array.isArray(rawModels)) return [];

  return rawModels
    .filter((m) => {
      const canGenerate =
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes("generateContent");
      if (!canGenerate) return false;

      const lowerName = (m.name + " " + (m.displayName || "")).toLowerCase();
      const isExcluded = EXCLUDED_MODEL_KEYWORDS.some((kw) =>
        lowerName.includes(kw),
      );
      if (isExcluded) return false;

      return lowerName.includes("gemini") || lowerName.includes("gemma");
    })
    .map((m) => ({
      name: m.name,
      displayName: m.displayName || m.name.replace("models/", ""),
    }))
    .sort((a, b) => {
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

function normalizeModelName(model) {
  if (!model || typeof model !== "string" || model.trim() === "") {
    return "models/gemini-1.5-flash";
  }
  const trimmed = model.trim();
  return trimmed.startsWith("models/") ? trimmed : `models/${trimmed}`;
}

function buildTranslationPayload(
  text,
  targetLanguage,
  normalizedModel,
  tone = "neutral",
  includeReverse = false,
) {
  const toneInstruction =
    TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.neutral;

  const rules = [
    `You are an accurate, native translator. Your purpose is to translate the given text into ${targetLanguage}.`,
    "Strict rules:",
    "1. Preserve all Discord markdown (such as bold **, italic *, strikethrough ~~, spoiler ||, code blocks ```).",
    "2. Keep all mentions (<@id>, <#id>, <@&id>), custom emojis (<:name:id>), and URLs intact.",
    "3. Preserve original line breaks and punctuation as close to original as possible.",
    `4. Style/Tone instruction: ${toneInstruction}`,
  ];

  if (includeReverse) {
    rules.push(
      "5. OUTPUT FORMAT: You MUST return a JSON object with two fields: {\"translation\": \"<translated text in target language>\", \"reverse\": \"<back-translation of the result into original source language for meaning verification>\"}. Output ONLY raw valid JSON without markdown wrapping or commentary.",
    );
  } else {
    rules.push(
      "5. Output ONLY the raw translated text. NEVER provide reasoning, explanations, metadata, linguistic analysis, or bullet lists.",
      "6. Do NOT repeat or analyze the source text.",
    );
  }

  const systemInstructionText = rules.join("\n");

  const generationConfig = {
    temperature: 0.1,
  };

  if (normalizedModel.includes("3.") || normalizedModel.includes("gemini-3")) {
    generationConfig.thinkingConfig = {
      thinkingLevel: "low",
    };
  } else if (
    normalizedModel.includes("2.5-flash") ||
    normalizedModel.includes("2.5-flash-lite") ||
    normalizedModel.includes("thinking")
  ) {
    generationConfig.thinkingConfig = {
      thinkingBudget: 0,
    };
  }

  return {
    systemInstruction: {
      parts: [{ text: systemInstructionText }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: text }],
      },
    ],
    generationConfig: generationConfig,
  };
}

function cleanThinkingArtifacts(translatedResult) {
  if (
    !translatedResult ||
    (!translatedResult.startsWith("* Source text:") &&
      !translatedResult.includes("* Target language:") &&
      !translatedResult.startsWith("Source text:"))
  ) {
    return translatedResult;
  }

  const lines = translatedResult.split("\n");
  const lastMeaningfulLine = lines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("*") && !l.startsWith("-"))
    .pop();

  return lastMeaningfulLine || translatedResult;
}

function extractCleanTranslation(candidate, includeReverse = false) {
  if (
    !candidate ||
    !candidate.content?.parts ||
    candidate.content.parts.length === 0
  ) {
    throw new Error(
      "Модель вернула пустой ответ или ответ был заблокирован фильтрами безопасности.",
    );
  }

  const actualParts = candidate.content.parts.filter(
    (p) => !p.thought && p.text,
  );
  const targetPart =
    actualParts.length > 0
      ? actualParts[actualParts.length - 1]
      : candidate.content.parts[candidate.content.parts.length - 1];

  const rawText = targetPart?.text ? targetPart.text.trim() : "";

  if (includeReverse) {
    try {
      const stripped = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/, "")
        .replace(/```$/, "")
        .trim();
      const parsed = JSON.parse(stripped);
      if (parsed && typeof parsed.translation === "string") {
        return {
          translation: cleanThinkingArtifacts(parsed.translation.trim()),
          reverse: typeof parsed.reverse === "string" ? parsed.reverse.trim() : "",
        };
      }
    } catch {
      // Fallback if model didn't return strict JSON
    }
    return {
      translation: cleanThinkingArtifacts(rawText),
      reverse: "",
    };
  }

  return cleanThinkingArtifacts(rawText);
}

async function handleFetchModels(apiKey) {
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("API-ключ не указан или имеет неверный формат.");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      errorData.error?.message ||
      `Ошибка сервера: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  const data = await response.json();
  if (!data.models || !Array.isArray(data.models)) {
    throw new Error("Не удалось получить список моделей от Google API.");
  }

  const availableModels = filterAndSortModels(data.models);

  if (availableModels.length === 0) {
    throw new Error(
      "Не найдено подходящих моделей с поддержкой генерации текста.",
    );
  }

  return availableModels;
}

async function handleTranslate(
  text,
  targetLanguage,
  requestedTone,
  includeReverse = false,
) {
  if (!text || text.trim() === "") {
    return includeReverse ? { translation: "", reverse: "" } : "";
  }

  const storageData = await chrome.storage.local.get([
    "geminiApiKey",
    "geminiModel",
    "translationTone",
    "translationCache",
  ]);
  const apiKey = storageData.geminiApiKey;
  const model = storageData.geminiModel;
  const tone = requestedTone || storageData.translationTone || "neutral";
  const cache = storageData.translationCache || {};

  // Проверяем локальный кэш
  const cached = getCachedTranslation(cache, text, targetLanguage, tone);
  if (cached) {
    if (includeReverse) {
      if (typeof cached === "object" && cached.translation) {
        return {
          translation: cached.translation,
          reverse: cached.reverse || "",
        };
      }
      return {
        translation: typeof cached === "string" ? cached : (cached.translation || ""),
        reverse: "",
      };
    }
    return typeof cached === "object" ? cached.translation : cached;
  }

  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "API-ключ Gemini не настроен. Откройте настройки расширения.",
    );
  }

  const normalizedModel = normalizeModelName(model);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${normalizedModel}:generateContent?key=${apiKey.trim()}`;
  const payload = buildTranslationPayload(
    text,
    targetLanguage,
    normalizedModel,
    tone,
    includeReverse,
  );

  let response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok && payload.generationConfig?.thinkingConfig) {
    const errorData = await response.clone().json().catch(() => ({}));
    const errMsg = (errorData.error?.message || "").toLowerCase();
    if (
      errMsg.includes("thinking") ||
      errMsg.includes("unknown field") ||
      response.status === 400
    ) {
      delete payload.generationConfig.thinkingConfig;
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      errorData.error?.message ||
      `Ошибка API: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const translatedResult = extractCleanTranslation(candidate, includeReverse);

  // Сохраняем в кэш
  try {
    const translationText =
      typeof translatedResult === "object"
        ? translatedResult.translation
        : translatedResult;
    const updatedCache = setCachedTranslation(
      cache,
      text,
      targetLanguage,
      tone,
      translationText,
    );
    if (typeof translatedResult === "object" && translatedResult.reverse) {
      const key = makeCacheKey(text, targetLanguage, tone);
      if (updatedCache[key]) {
        updatedCache[key].reverse = translatedResult.reverse;
      }
    }
    chrome.storage.local.set({ translationCache: updatedCache });
  } catch (err) {
    console.warn("Failed to update translation cache:", err);
  }

  return translatedResult;
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "FETCH_MODELS") {
      handleFetchModels(request.apiKey)
        .then((models) => sendResponse({ success: true, models }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }

    if (request.action === "TRANSLATE") {
      handleTranslate(
        request.text,
        request.targetLanguage,
        request.tone,
        Boolean(request.includeReverse),
      )
        .then((res) => {
          if (typeof res === "object" && res !== null && "translation" in res) {
            sendResponse({
              success: true,
              translatedText: res.translation,
              reversePreview: res.reverse,
            });
          } else {
            sendResponse({
              success: true,
              translatedText: res,
            });
          }
        })
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }

    if (request.action === "CLEAR_CACHE") {
      chrome.storage.local.set({ translationCache: {} }, () => {
        sendResponse({ success: true });
      });
      return true;
    }

    if (request.action === "GET_CACHE_STATS") {
      chrome.storage.local.get(["translationCache"], (data) => {
        const cache = data.translationCache || {};
        sendResponse({ success: true, count: Object.keys(cache).length });
      });
      return true;
    }
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    EXCLUDED_MODEL_KEYWORDS,
    TONE_INSTRUCTIONS,
    makeCacheKey,
    getCachedTranslation,
    setCachedTranslation,
    filterAndSortModels,
    normalizeModelName,
    buildTranslationPayload,
    cleanThinkingArtifacts,
    extractCleanTranslation,
    handleFetchModels,
    handleTranslate,
  };
}
