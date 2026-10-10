const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  filterAndSortModels,
  normalizeModelName,
  buildTranslationPayload,
  cleanThinkingArtifacts,
  extractCleanTranslation,
  makeCacheKey,
  getCachedTranslation,
  setCachedTranslation,
  TONE_INSTRUCTIONS,
} = require("../background/background.js");

describe("Background Service Worker - Model Filtering & Sorting", () => {
  it("should filter out non-text models (TTS, Lyria, Nano Banana, Robotics, etc.)", () => {
    const mockRawModels = [
      {
        name: "models/gemini-2.5-flash",
        displayName: "Gemini 2.5 Flash",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/nano-banana-pro",
        displayName: "Nano Banana Pro",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/lyria-3-clip-preview",
        displayName: "Lyria 3 Clip Preview",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-3.5-transcribe",
        displayName: "Gemini 3.5 Transcribe",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-2.5-flash-preview-tts",
        displayName: "Gemini 2.5 Flash Preview TTS",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-robotics-er-2",
        displayName: "Gemini Robotics",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/deep-research-preview",
        displayName: "Deep Research Preview",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-2.5-flash-lite",
        displayName: "Gemini 2.5 Flash-Lite",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-2.5-pro",
        displayName: "Gemini 2.5 Pro",
        supportedGenerationMethods: ["generateContent"],
      },
    ];

    const result = filterAndSortModels(mockRawModels);

    // Only Flash-Lite, Flash, and Pro should survive
    assert.strictEqual(result.length, 3);
    const names = result.map((m) => m.name);
    assert.ok(names.includes("models/gemini-2.5-flash-lite"));
    assert.ok(names.includes("models/gemini-2.5-flash"));
    assert.ok(names.includes("models/gemini-2.5-pro"));

    // Excluded models should not be present
    assert.ok(!names.includes("models/nano-banana-pro"));
    assert.ok(!names.includes("models/lyria-3-clip-preview"));
    assert.ok(!names.includes("models/gemini-3.5-transcribe"));
  });

  it("should prioritize Flash-Lite first, then Flash, then Pro", () => {
    const mockRawModels = [
      {
        name: "models/gemini-2.5-pro",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-2.5-flash",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-2.5-flash-lite",
        supportedGenerationMethods: ["generateContent"],
      },
    ];

    const result = filterAndSortModels(mockRawModels);
    assert.strictEqual(result[0].name, "models/gemini-2.5-flash-lite");
    assert.strictEqual(result[1].name, "models/gemini-2.5-flash");
    assert.strictEqual(result[2].name, "models/gemini-2.5-pro");
  });

  it("should return an empty array if input is not an array", () => {
    assert.deepStrictEqual(filterAndSortModels(null), []);
    assert.deepStrictEqual(filterAndSortModels(undefined), []);
  });
});

describe("Background Service Worker - Model Name Normalization", () => {
  it("should prefix model name with models/ if missing", () => {
    assert.strictEqual(
      normalizeModelName("gemini-2.5-flash"),
      "models/gemini-2.5-flash",
    );
  });

  it("should preserve models/ prefix if already present", () => {
    assert.strictEqual(
      normalizeModelName("models/gemini-2.5-flash"),
      "models/gemini-2.5-flash",
    );
  });

  it("should fallback to gemini-1.5-flash if empty", () => {
    assert.strictEqual(normalizeModelName(""), "models/gemini-1.5-flash");
    assert.strictEqual(normalizeModelName(null), "models/gemini-1.5-flash");
  });
});

describe("Background Service Worker - Translation Payload Builder", () => {
  it("should construct proper systemInstruction with targetLanguage and markdown preservation", () => {
    const payload = buildTranslationPayload(
      "Hello world",
      "Russian",
      "models/gemini-2.5-flash",
    );

    assert.ok(payload.systemInstruction);
    const instructionText = payload.systemInstruction.parts[0].text;
    assert.ok(instructionText.includes("Russian"));
    assert.ok(instructionText.includes("Discord markdown"));
    assert.ok(instructionText.includes("raw translated text"));

    // User content must only contain the source text
    assert.strictEqual(payload.contents[0].parts[0].text, "Hello world");
  });

  it("should set thinkingBudget to 0 for Gemini 2.5 Flash", () => {
    const payload = buildTranslationPayload(
      "Hello",
      "English",
      "models/gemini-2.5-flash",
    );
    assert.strictEqual(
      payload.generationConfig?.thinkingConfig?.thinkingBudget,
      0,
    );
  });

  it("should set thinkingLevel to low for Gemini 3.x models", () => {
    const payload = buildTranslationPayload(
      "Hello",
      "English",
      "models/gemini-3.5-flash",
    );
    assert.strictEqual(
      payload.generationConfig?.thinkingConfig?.thinkingLevel,
      "low",
    );
  });

  it("should NOT set thinkingConfig for Gemini 1.5 models", () => {
    const payload = buildTranslationPayload(
      "Hello",
      "English",
      "models/gemini-1.5-flash",
    );
    assert.strictEqual(payload.generationConfig?.thinkingConfig, undefined);
  });
});

describe("Background Service Worker - Response Parsing & Thought Filtering", () => {
  it("should extract translation from a standard single-part response", () => {
    const candidate = {
      content: {
        parts: [{ text: "Привет, мир!" }],
      },
    };
    assert.strictEqual(extractCleanTranslation(candidate), "Привет, мир!");
  });

  it("should ignore parts with thought: true and take the actual text part", () => {
    const candidate = {
      content: {
        parts: [
          {
            thought: true,
            text: "* Analyzing context...\n* Checking grammar...",
          },
          {
            text: "Ты отлично справляешься",
          },
        ],
      },
    };
    assert.strictEqual(
      extractCleanTranslation(candidate),
      "Ты отлично справляешься",
    );
  });

  it("should clean leaked thought artifacts if model outputs thought breakdown into text", () => {
    const leakedText =
      "* Source text: 'You are doing great'\n* Target language: Russian\n* Analyzing...\nТы отлично справляешься";
    assert.strictEqual(
      cleanThinkingArtifacts(leakedText),
      "Ты отлично справляешься",
    );
  });

  it("should throw error if candidate has no parts", () => {
    assert.throws(() => {
      extractCleanTranslation({ content: { parts: [] } });
    }, /Модель вернула пустой ответ/);
  });
});

describe("Background Service Worker - Translation Tones", () => {
  it("should include tone instruction for casual tone", () => {
    const payload = buildTranslationPayload(
      "let's go",
      "Russian",
      "models/gemini-2.5-flash",
      "casual",
    );
    const instruction = payload.systemInstruction.parts[0].text;
    assert.ok(instruction.includes("casual Discord chat tone"));
  });

  it("should include tone instruction for formal tone", () => {
    const payload = buildTranslationPayload(
      "thank you",
      "German",
      "models/gemini-2.5-flash",
      "formal",
    );
    const instruction = payload.systemInstruction.parts[0].text;
    assert.ok(instruction.includes("formal tone"));
  });

  it("should include tone instruction for concise tone", () => {
    const payload = buildTranslationPayload(
      "enemy missing middle",
      "Russian",
      "models/gemini-2.5-flash",
      "concise",
    );
    const instruction = payload.systemInstruction.parts[0].text;
    assert.ok(instruction.includes("brief, direct, and compact"));
  });

  it("should fallback to neutral tone if unspecified or unknown", () => {
    const payload = buildTranslationPayload(
      "hello",
      "Russian",
      "models/gemini-2.5-flash",
      "unknown-tone",
    );
    const instruction = payload.systemInstruction.parts[0].text;
    assert.ok(instruction.includes("standard conversational translation"));
  });
});

describe("Background Service Worker - LRU Translation Cache", () => {
  it("should generate normalized cache keys", () => {
    const key1 = makeCacheKey("  Hello World  ", "Russian", "Casual");
    const key2 = makeCacheKey("hello world", "russian", "casual");
    assert.strictEqual(key1, key2);
    assert.strictEqual(key1, "hello world|||russian|||casual");
  });

  it("should retrieve cached translation and return null on miss", () => {
    const cache = {
      "hello|||russian|||neutral": {
        translation: "Привет",
        updatedAt: Date.now(),
      },
    };
    assert.strictEqual(
      getCachedTranslation(cache, "hello", "Russian", "neutral"),
      "Привет",
    );
    assert.strictEqual(
      getCachedTranslation(cache, "unknown text", "Russian", "neutral"),
      null,
    );
  });

  it("should support legacy plain string cache format", () => {
    const cache = {
      "gg|||russian|||casual": "Хорошая игра",
    };
    assert.strictEqual(
      getCachedTranslation(cache, "gg", "Russian", "casual"),
      "Хорошая игра",
    );
  });

  it("should set and update cache entries", () => {
    let cache = {};
    cache = setCachedTranslation(
      cache,
      "hello",
      "Russian",
      "neutral",
      "Привет",
    );
    assert.strictEqual(
      getCachedTranslation(cache, "hello", "Russian", "neutral"),
      "Привет",
    );
  });

  it("should enforce maxEntries and evict the oldest entry", () => {
    let cache = {};
    cache = setCachedTranslation(cache, "one", "en", "neutral", "1", 2);
    // Artificially space time
    cache["one|||en|||neutral"].updatedAt = 1000;

    cache = setCachedTranslation(cache, "two", "en", "neutral", "2", 2);
    cache["two|||en|||neutral"].updatedAt = 2000;

    // Adding third entry should evict "one"
    cache = setCachedTranslation(cache, "three", "en", "neutral", "3", 2);
    cache["three|||en|||neutral"].updatedAt = 3000;

    assert.strictEqual(getCachedTranslation(cache, "one", "en", "neutral"), null);
    assert.strictEqual(getCachedTranslation(cache, "two", "en", "neutral"), "2");
    assert.strictEqual(getCachedTranslation(cache, "three", "en", "neutral"), "3");
    assert.strictEqual(Object.keys(cache).length, 2);
  });
});

describe("Background Service Worker - Reverse Translation Preview", () => {
  it("should instruct model to output strict JSON when includeReverse is true", () => {
    const payload = buildTranslationPayload(
      "Давайте начнем игру",
      "English",
      "models/gemini-2.5-flash",
      "casual",
      true, // includeReverse
    );
    const instruction = payload.systemInstruction.parts[0].text;
    assert.ok(instruction.includes("OUTPUT FORMAT"));
    assert.ok(instruction.includes('"translation"'));
    assert.ok(instruction.includes('"reverse"'));
  });

  it("should parse clean JSON response into translation and reverse properties", () => {
    const candidate = {
      content: {
        parts: [
          {
            text: JSON.stringify({
              translation: "Let's start the match",
              reverse: "Давайте начнем матч",
            }),
          },
        ],
      },
    };
    const result = extractCleanTranslation(candidate, true);
    assert.strictEqual(typeof result, "object");
    assert.strictEqual(result.translation, "Let's start the match");
    assert.strictEqual(result.reverse, "Давайте начнем матч");
  });

  it("should strip markdown json fences and parse correctly", () => {
    const candidate = {
      content: {
        parts: [
          {
            text: "```json\n{\n  \"translation\": \"Well played\",\n  \"reverse\": \"Отличная игра\"\n}\n```",
          },
        ],
      },
    };
    const result = extractCleanTranslation(candidate, true);
    assert.strictEqual(result.translation, "Well played");
    assert.strictEqual(result.reverse, "Отличная игра");
  });

  it("should fallback gracefully if model returned plain text instead of JSON", () => {
    const candidate = {
      content: {
        parts: [
          {
            text: "Just raw text without JSON formatting",
          },
        ],
      },
    };
    const result = extractCleanTranslation(candidate, true);
    assert.strictEqual(result.translation, "Just raw text without JSON formatting");
    assert.strictEqual(result.reverse, "");
  });
});
