chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "FETCH_MODELS") {
    handleFetchModels(request.apiKey)
      .then((models) => sendResponse({ success: true, models }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "TRANSLATE") {
    handleTranslate(request.text, request.targetLanguage)
      .then((translatedText) => sendResponse({ success: true, translatedText }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

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

  const excludedKeywords = [
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

  const availableModels = data.models
    .filter((m) => {
      const canGenerate =
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes("generateContent");
      if (!canGenerate) return false;

      const lowerName = (m.name + " " + (m.displayName || "")).toLowerCase();

      // Отсекаем нетекстовые и узкоспециализированные модели
      const isExcluded = excludedKeywords.some((kw) => lowerName.includes(kw));
      if (isExcluded) return false;

      // Оставляем только основные диалоговые модели Gemini и Gemma
      return lowerName.includes("gemini") || lowerName.includes("gemma");
    })
    .map((m) => ({
      name: m.name,
      displayName: m.displayName || m.name.replace("models/", ""),
    }))
    .sort((a, b) => {
      // Приоритет: сначала быстрые и легкие Flash модели (идеальны для чатов), затем Pro
      const score = (model) => {
        const n = model.name.toLowerCase();
        if (n.includes("flash-lite")) return 1;
        if (n.includes("flash")) return 2;
        if (n.includes("pro")) return 3;
        return 4;
      };
      return score(a) - score(b);
    });

  if (availableModels.length === 0) {
    throw new Error(
      "Не найдено подходящих моделей с поддержкой генерации текста.",
    );
  }

  return availableModels;
}

async function handleTranslate(text, targetLanguage) {
  if (!text || text.trim() === "") {
    return "";
  }

  const storageData = await chrome.storage.local.get([
    "geminiApiKey",
    "geminiModel",
  ]);
  const apiKey = storageData.geminiApiKey;
  let model = storageData.geminiModel;

  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "API-ключ Gemini не настроен. Откройте настройки расширения.",
    );
  }

  if (!model || model.trim() === "") {
    model = "models/gemini-1.5-flash";
  }

  const normalizedModel = model.startsWith("models/")
    ? model
    : `models/${model}`;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${normalizedModel}:generateContent?key=${apiKey.trim()}`;

  const systemInstructionText = [
    `You are an accurate, native translator. Your ONLY purpose is to translate the given text into ${targetLanguage}.`,
    "Strict rules:",
    "1. Output ONLY the raw translated text. NEVER provide reasoning, explanations, metadata, linguistic analysis, or bullet lists.",
    "2. Do NOT repeat or analyze the source text.",
    "3. Preserve all Discord markdown (such as bold **, italic *, strikethrough ~~, spoiler ||, code blocks ```).",
    "4. Keep all mentions (<@id>, <#id>, <@&id>), custom emojis (<:name:id>), and URLs intact.",
    "5. Preserve original line breaks and punctuation as close to original as possible.",
  ].join("\n");

  const generationConfig = {
    temperature: 0.1,
  };

  // Точная конфигурация рассуждений по официальной документации Google:
  if (normalizedModel.includes("3.") || normalizedModel.includes("gemini-3")) {
    generationConfig.thinkingConfig = {
      thinkingLevel: "low", // В Gemini 3.x используется thinkingLevel
    };
  } else if (
    normalizedModel.includes("2.5-flash") ||
    normalizedModel.includes("2.5-flash-lite") ||
    normalizedModel.includes("thinking")
  ) {
    generationConfig.thinkingConfig = {
      thinkingBudget: 0, // В Gemini 2.5 Flash / Flash-Lite размышления полностью выключаются бюджетом 0
    };
  }

  const payload = {
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

  let response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  // Если модель не знает параметр thinkingConfig (вернула 400), повторяем запрос без него
  if (!response.ok && payload.generationConfig?.thinkingConfig) {
    const errorData = await response.clone().json().catch(() => ({}));
    const errMsg = (errorData.error?.message || "").toLowerCase();
    if (errMsg.includes("thinking") || errMsg.includes("unknown field") || response.status === 400) {
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

  if (!candidate || !candidate.content?.parts || candidate.content.parts.length === 0) {
    throw new Error(
      "Модель вернула пустой ответ или ответ был заблокирован фильтрами безопасности.",
    );
  }

  // Фильтруем части, помеченные как thought process
  const actualParts = candidate.content.parts.filter((p) => !p.thought && p.text);
  const targetPart =
    actualParts.length > 0
      ? actualParts[actualParts.length - 1]
      : candidate.content.parts[candidate.content.parts.length - 1];

  let translatedResult = targetPart?.text ? targetPart.text.trim() : "";

  // Страховочная очистка от случайного вывода цепочки рассуждений
  if (
    translatedResult.startsWith("* Source text:") ||
    translatedResult.includes("* Target language:") ||
    translatedResult.startsWith("Source text:")
  ) {
    const lines = translatedResult.split("\n");
    const lastMeaningfulLine = lines
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("*") && !l.startsWith("-"))
      .pop();
    if (lastMeaningfulLine) {
      translatedResult = lastMeaningfulLine;
    }
  }

  return translatedResult;
}
