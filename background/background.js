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

  const textModels = filterAndSortModels(data.models);
  const voiceModels = filterLiveModels(data.models);

  if (textModels.length === 0 && voiceModels.length === 0) {
    throw new Error(
      "Не найдено подходящих моделей Gemini для вашей учетной записи.",
    );
  }

  const result = textModels;
  result.models = textModels;
  result.textModels = textModels;
  result.voiceModels = voiceModels;

  return result;
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
        .then((res) =>
          sendResponse({
            success: true,
            models: res.textModels || res,
            textModels: res.textModels || res,
            voiceModels: res.voiceModels || [],
          }),
        )
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

    if (request.action === "FETCH_LIVE_MODELS") {
      handleFetchModels(request.apiKey)
        .then((res) => {
          sendResponse({
            success: true,
            liveModels: res.voiceModels || [],
            voiceModels: res.voiceModels || [],
          });
        })
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }
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

const LANG_TO_BCP47 = {
  Russian: "ru",
  English: "en",
  German: "de",
  French: "fr",
  Spanish: "es",
  Chinese: "zh",
  Japanese: "ja",
  Korean: "ko",
  Ukrainian: "uk",
};

function buildLiveSetupMessage(
  modelName = "models/gemini-3.8-live",
  targetLanguage = "Russian",
) {
  const safeModel = normalizeModelName(modelName || "models/gemini-3.8-live");
  const lang = targetLanguage || "Russian";
  const bcp47 = LANG_TO_BCP47[lang] || "ru";
  const isTranscribe = safeModel.includes("transcribe");
  const isLiveTranslate = safeModel.includes("live-translate");

  const setup = {
    model: safeModel,
    generationConfig: {
      responseModalities: isTranscribe ? ["TEXT"] : ["AUDIO"],
    },
  };

  if (isTranscribe) {
    setup.inputAudioTranscription = { languageCodes: [] };
  } else if (isLiveTranslate) {
    setup.outputAudioTranscription = {};
    setup.generationConfig.translationConfig = {
      targetLanguageCode: bcp47,
      echoTargetLanguage: false,
    };
  } else {
    // Standard Gemini 3.8 Live
    setup.outputAudioTranscription = {};
    setup.systemInstruction = {
      parts: [
        {
          text: `You are an ultra-fast real-time speech translator for Discord voice chat. Listen to incoming spoken audio and translate it immediately into ${lang}. Speak only the translation in ${lang} clearly and concisely. Do not repeat original foreign words, do not explain or add commentary, output only the clean translation.`,
        },
      ],
    };
  }

  return { setup };
}

function buildLiveAudioChunkMessage(pcmBase64) {
  return {
    realtimeInput: {
      audio: {
        mimeType: "audio/pcm;rate=16000",
        data: pcmBase64,
      },
      mediaChunks: [
        {
          mimeType: "audio/pcm;rate=16000",
          data: pcmBase64,
        },
      ],
    },
  };
}

function resolveLiveModel(requestedModel) {
  if (requestedModel && typeof requestedModel === "string" && requestedModel.trim()) {
    return normalizeModelName(requestedModel.trim());
  }
  return "models/gemini-3.8-live";
}

function parseLiveServerMessage(data, isTranscribeOnly = false) {
  let msg = data;
  if (typeof data === "string") {
    try {
      msg = JSON.parse(data);
    } catch {
      return { text: "", isTurnComplete: false, isSetupComplete: false, error: null };
    }
  }
  if (!msg || typeof msg !== "object") {
    return { text: "", isTurnComplete: false, isSetupComplete: false, error: null };
  }

  if (msg.error) {
    return {
      text: "",
      isTurnComplete: false,
      isSetupComplete: false,
      error: msg.error.message || `Error ${msg.error.code}`,
    };
  }

  let text = "";
  const serverContent = msg.serverContent || msg.server_content;

  if (serverContent) {
    const outputTrans = serverContent.outputTranscription || serverContent.output_transcription;
    const modelTurn = serverContent.modelTurn || serverContent.model_turn;
    const inputTrans = serverContent.inputTranscription || serverContent.input_transcription;
    const interimTrans = serverContent.interimInputTranscription || serverContent.interim_input_transcription;

    if (isTranscribeOnly) {
      // Режим распознавания речи (STT): берём распознанный исходный текст
      if (inputTrans?.text) {
        text = inputTrans.text;
      } else if (interimTrans?.text) {
        text = interimTrans.text;
      }
    } else {
      // Режим перевода: берём ИСКЛЮЧИТЕЛЬНО перевод модели (outputTranscription или modelTurn)
      // Исходная речь (inputTranscription) строго игнорируется, чтобы не смешивать английский и русский
      if (outputTrans?.text) {
        text = outputTrans.text;
      } else if (modelTurn?.parts) {
        const parts = modelTurn.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (part.text && !part.thought) {
              text += part.text;
            }
          }
        }
      }
    }
  }

  const isTurnComplete = Boolean(serverContent?.turnComplete || serverContent?.turn_complete);
  const isSetupComplete = Boolean(msg.setupComplete || msg.setup_complete);
  return { text, isTurnComplete, isSetupComplete, error: null };
}

class GeminiLiveSession {
  constructor({ apiKey, model, targetLanguage, onStatus, onSetupComplete, onCaption, onError, onClose }) {
    this.apiKey = apiKey;
    this.model = model || "models/gemini-3.8-live";
    this.targetLanguage = targetLanguage || "Russian";
    this.onStatus = onStatus;
    this.onSetupComplete = onSetupComplete;
    this.onCaption = onCaption;
    this.onError = onError;
    this.onClose = onClose;
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.isSetupComplete = false;
    this.pendingChunks = [];
  }

  connect() {
    if (this.ws || this.isConnecting) return;
    this.isConnecting = true;
    this.isSetupComplete = false;

    const liveModel = resolveLiveModel(this.model);
    const maskedKey = this.apiKey ? `${this.apiKey.trim().slice(0, 6)}...` : "(missing)";
    console.log(`[DGT Live WebSocket] Connecting: model=${liveModel}, lang=${this.targetLanguage}, key=${maskedKey}`);
    if (this.onStatus) {
      this.onStatus(`Подключение к ${liveModel.replace("models/", "")}...`);
    }

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(this.apiKey.trim())}`;

    try {
      const WsClass = typeof WebSocket !== "undefined" ? WebSocket : global.WebSocket;
      if (!WsClass) {
        throw new Error("WebSocket API недоступен в данном окружении");
      }

      this.ws = new WsClass(wsUrl);
      if ("binaryType" in this.ws) {
        this.ws.binaryType = "arraybuffer";
      }

      this.ws.onopen = () => {
        this.isConnected = true;
        this.isConnecting = false;
        console.log(`[DGT Live WebSocket] onopen: Соединение с Google Live API успешно установлено (${liveModel})`);
        if (this.onStatus) {
          this.onStatus("Сокет открыт, отправка конфигурации...");
        }

        const setupMsg = buildLiveSetupMessage(liveModel, this.targetLanguage);
        console.log("[DGT Live WebSocket] Отправка setup:", JSON.stringify(setupMsg));
        this.ws.send(JSON.stringify(setupMsg));

        if (this.onSetupComplete) {
          this.onSetupComplete();
        }
      };

      this.ws.onmessage = (event) => {
        let rawData = event.data;
        if (typeof ArrayBuffer !== "undefined" && rawData instanceof ArrayBuffer) {
          try {
            rawData = new TextDecoder("utf-8").decode(rawData);
          } catch (e) {
            console.error("[DGT Live WebSocket] Ошибка декодирования ArrayBuffer:", e);
          }
        }
        console.log("[DGT Live WebSocket] onmessage получен ответ:", typeof rawData === "string" ? rawData.slice(0, 300) : rawData);

        const isTranscribeOnly = resolveLiveModel(this.model).includes("transcribe");
        const parsed = parseLiveServerMessage(rawData, isTranscribeOnly);
        if (parsed.isSetupComplete) {
          this.isSetupComplete = true;
          console.log("[DGT Live WebSocket] Google подтвердил setupComplete");
          if (this.onStatus) {
            this.onStatus("Сессия готова, слушаю канал");
          }
          while (this.pendingChunks.length > 0) {
            const chunk = this.pendingChunks.shift();
            if (this.ws && this.ws.readyState === (WsClass.OPEN || 1)) {
              this.ws.send(JSON.stringify(chunk));
            }
          }
        }
        if (parsed.error) {
          console.error("[DGT Live WebSocket] Ошибка в ответе сервера:", parsed.error);
          if (this.onError) {
            this.onError(parsed.error);
          }
        } else if (parsed.text || parsed.isTurnComplete) {
          console.log("[DGT Live WebSocket] Текст субтитра:", parsed.text, "turnComplete:", parsed.isTurnComplete);
          if (this.onCaption) {
            this.onCaption(parsed.text, parsed.isTurnComplete);
          }
        }
      };

      this.ws.onerror = (err) => {
        console.error("[DGT Live WebSocket Error]", err);
        if (this.onError) {
          this.onError("Ошибка подключения к Gemini Live API (проверьте сетевой доступ / VPN / API-ключ)");
        }
      };

      this.ws.onclose = (event) => {
        console.warn("[DGT Live WebSocket Closed] code:", event?.code, "reason:", event?.reason);
        this.isConnected = false;
        this.isConnecting = false;
        this.isSetupComplete = false;
        this.ws = null;
        if (event && event.code !== 1000) {
          const reasonMsg = event.reason ? `: ${event.reason}` : "";
          if (this.onError) {
            this.onError(`Соединение Live API закрыто сервером (код ${event.code}${reasonMsg})`);
          }
        }
        if (this.onClose) {
          this.onClose(event?.code, event?.reason);
        }
      };
    } catch (e) {
      this.isConnecting = false;
      console.error("[DGT Live WebSocket Exception]", e);
      if (this.onError) {
        this.onError(e.message || "Ошибка инициализации WebSocket");
      }
    }
  }

  sendAudioChunk(pcmBase64) {
    if (!pcmBase64) return;
    const msg = buildLiveAudioChunkMessage(pcmBase64);
    const WsClass = typeof WebSocket !== "undefined" ? WebSocket : global.WebSocket;
    if (this.ws && this.isConnected && this.isSetupComplete && (WsClass && this.ws.readyState === (WsClass.OPEN || 1))) {
      this.ws.send(JSON.stringify(msg));
    } else if (this.isConnecting || !this.isSetupComplete) {
      if (this.pendingChunks.length < 50) {
        this.pendingChunks.push(msg);
      }
    }
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.isSetupComplete = false;
    this.pendingChunks = [];
  }
}

if (typeof chrome !== "undefined" && chrome.runtime?.onConnect) {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "dgt-live-captions") {
      console.log("[DGT Background] Порт dgt-live-captions подключен");
      let currentSession = null;

      port.onMessage.addListener(async (msg) => {
        if (msg.type === "START_LIVE") {
          console.log("[DGT Background] Получена команда START_LIVE");
          port.postMessage({ type: "LIVE_STATUS", status: "Чтение API-ключа и настроек..." });

          const storage = await chrome.storage.local.get([
            "geminiApiKey",
            "geminiLiveModel",
            "incomingLang",
          ]);
          const apiKey = storage.geminiApiKey;
          if (!apiKey) {
            console.warn("[DGT Background] API-ключ Gemini отсутствует в хранилище");
            port.postMessage({
              type: "LIVE_ERROR",
              error: "API-ключ Gemini не настроен. Откройте окно расширения и укажите ключ.",
            });
            return;
          }

          const model = resolveLiveModel(storage.geminiLiveModel);
          const lang = storage.incomingLang || "Russian";
          console.log(`[DGT Background] Запуск сессии Live: model=${model}, lang=${lang}`);
          port.postMessage({ type: "LIVE_STATUS", status: `Подключение к ${model.replace("models/", "")}...` });

          if (currentSession) {
            currentSession.close();
          }

          currentSession = new GeminiLiveSession({
            apiKey,
            model,
            targetLanguage: lang,
            onStatus: (status) => {
              port.postMessage({ type: "LIVE_STATUS", status });
            },
            onSetupComplete: () => {
              port.postMessage({ type: "LIVE_CONNECTED" });
            },
            onCaption: (text, isTurnComplete) => {
              port.postMessage({ type: "LIVE_CAPTION", text, isTurnComplete });
            },
            onError: (err) => {
              port.postMessage({ type: "LIVE_ERROR", error: err });
            },
            onClose: (code, reason) => {
              port.postMessage({ type: "LIVE_CLOSED", code, reason });
            },
          });

          currentSession.connect();
        } else if (msg.type === "AUDIO_CHUNK") {
          if (currentSession) {
            currentSession.sendAudioChunk(msg.pcmBase64);
          }
        } else if (msg.type === "STOP_LIVE") {
          console.log("[DGT Background] Получена команда STOP_LIVE");
          if (currentSession) {
            currentSession.close();
            currentSession = null;
          }
        }
      });

      port.onDisconnect.addListener(() => {
        console.log("[DGT Background] Порт dgt-live-captions отключен");
        if (currentSession) {
          currentSession.close();
          currentSession = null;
        }
      });
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
    filterLiveModels,
    normalizeModelName,
    buildTranslationPayload,
    buildLiveSetupMessage,
    buildLiveAudioChunkMessage,
    parseLiveServerMessage,
    GeminiLiveSession,
    cleanThinkingArtifacts,
    extractCleanTranslation,
    handleFetchModels,
    handleTranslate,
  };
}
