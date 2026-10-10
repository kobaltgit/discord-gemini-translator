const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  filterLiveModels,
  buildLiveSetupMessage,
  buildLiveAudioChunkMessage,
  parseLiveServerMessage,
} = require("../background/background.js");

describe("Background Service Worker - Live Models Filtering", () => {
  it("should filter models list specifically for Live and Native-Audio capable models", () => {
    const rawModels = [
      { name: "models/gemini-3.8-live", displayName: "Gemini 3.8 Live" },
      { name: "models/gemini-3.5-transcribe-live", displayName: "Gemini 3.5 Transcribe Live" },
      { name: "models/gemini-3.1-flash-live-preview", displayName: "Gemini 3.1 Live" },
      { name: "models/gemini-2.5-flash-native-audio-preview", displayName: "Native Audio" },
      { name: "models/gemini-3.8-flash", displayName: "Gemini 3.8 Flash" },
      { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
      { name: "models/gemini-1.5-pro", displayName: "Gemini 1.5 Pro" },
      { name: "models/text-embedding-004", displayName: "Text Embedding" },
      { name: "models/imagen-3", displayName: "Imagen 3" },
    ];

    const liveModels = filterLiveModels(rawModels);
    assert.strictEqual(liveModels.length, 2);

    const names = liveModels.map((m) => m.name);
    assert.ok(names.includes("models/gemini-3.8-live"));
    assert.ok(names.includes("models/gemini-3.5-transcribe-live"));
    assert.ok(!names.includes("models/gemini-3.1-flash-live-preview"));
    assert.ok(!names.includes("models/gemini-2.5-flash-native-audio-preview"));
    assert.ok(!names.includes("models/gemini-3.8-flash"));
    assert.ok(!names.includes("models/gemini-2.5-flash"));
    assert.ok(!names.includes("models/gemini-1.5-pro"));
    assert.ok(!names.includes("models/text-embedding-004"));
  });

  it("should return fallback live model list if input is empty or invalid", () => {
    const emptyResult = filterLiveModels([]);
    assert.ok(Array.isArray(emptyResult));
    assert.ok(emptyResult.length > 0);

    const nullResult = filterLiveModels(null);
    assert.ok(Array.isArray(nullResult));
    assert.ok(nullResult.length > 0);
  });

  it("should include transcribe and live models while strictly excluding TTS models", () => {
    const rawModels = [
      { name: "models/gemini-3.8-live", displayName: "Gemini 3.8 Live" },
      { name: "models/gemini-3.5-transcribe-live", displayName: "Gemini 3.5 Transcribe Live" },
      { name: "models/gemini-3.5-transcribe", displayName: "Gemini 3.5 Transcribe" },
      { name: "models/gemini-3.8-flash-tts", displayName: "Gemini 3.8 Flash TTS" },
      { name: "models/gemini-2.5-flash-preview-tts", displayName: "Gemini 2.5 Flash TTS" },
      { name: "models/veo-2.0-generate", displayName: "Veo Video" },
      { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
    ];

    const liveModels = filterLiveModels(rawModels);
    const names = liveModels.map((m) => m.name);

    assert.ok(names.includes("models/gemini-3.8-live"));
    assert.ok(names.includes("models/gemini-3.5-transcribe-live"));
    assert.ok(names.includes("models/gemini-3.5-transcribe"));

    // Text Flash, TTS, Veo, etc. must be excluded
    assert.ok(!names.includes("models/gemini-2.5-flash"));
    assert.ok(!names.includes("models/gemini-3.8-flash-tts"));
    assert.ok(!names.includes("models/gemini-2.5-flash-preview-tts"));
    assert.ok(!names.includes("models/veo-2.0-generate"));

    // Check prioritization: 3.8-live, then transcribe-live, then transcribe
    assert.strictEqual(names.length, 3);
    assert.strictEqual(names[0], "models/gemini-3.8-live");
    assert.strictEqual(names[1], "models/gemini-3.5-transcribe-live");
    assert.strictEqual(names[2], "models/gemini-3.5-transcribe");
  });
});

describe("Background Service Worker - Live API Setup Message", () => {
  it("should construct valid setup message with AUDIO response modality and transcriptions for live models", () => {
    const setupMsg = buildLiveSetupMessage("gemini-3.8-live", "Russian");

    assert.ok(setupMsg.setup);
    assert.strictEqual(setupMsg.setup.model, "models/gemini-3.8-live");
    assert.deepStrictEqual(setupMsg.setup.generationConfig.responseModalities, ["AUDIO"]);
    assert.ok(setupMsg.setup.outputAudioTranscription);
    assert.strictEqual(setupMsg.setup.inputAudioTranscription, undefined);
    assert.strictEqual(setupMsg.setup.generationConfig.outputAudioTranscription, undefined);
    assert.strictEqual(setupMsg.setup.generationConfig.inputAudioTranscription, undefined);
    assert.ok(setupMsg.setup.systemInstruction.parts[0].text.includes("Russian"));
  });

  it("should construct valid setup message with TEXT response modality for transcribe models", () => {
    const setupMsg = buildLiveSetupMessage("gemini-3.5-transcribe-live", "Russian");

    assert.ok(setupMsg.setup);
    assert.strictEqual(setupMsg.setup.model, "models/gemini-3.5-transcribe-live");
    assert.deepStrictEqual(setupMsg.setup.generationConfig.responseModalities, ["TEXT"]);
    assert.deepStrictEqual(setupMsg.setup.inputAudioTranscription, { languageCodes: [] });
    assert.strictEqual(setupMsg.setup.outputAudioTranscription, undefined);
    assert.strictEqual(setupMsg.setup.generationConfig.outputAudioTranscription, undefined);
    assert.strictEqual(setupMsg.setup.generationConfig.inputAudioTranscription, undefined);
  });

  it("should add translationConfig when model is live-translate", () => {
    const setupMsg = buildLiveSetupMessage("gemini-3.5-live-translate-preview", "Russian");
    assert.deepStrictEqual(setupMsg.setup.generationConfig.translationConfig, {
      targetLanguageCode: "ru",
      echoTargetLanguage: false,
    });
  });

  it("should normalize model names with models/ prefix", () => {
    const msg = buildLiveSetupMessage("models/gemini-3.8-live", "English");
    assert.strictEqual(msg.setup.model, "models/gemini-3.8-live");
  });

  it("should fallback to default live model if unspecified", () => {
    const msg = buildLiveSetupMessage(null, "Russian");
    assert.strictEqual(msg.setup.model, "models/gemini-3.8-live");
  });
});

describe("Background Service Worker - Live Audio Chunk Message", () => {
  it("should wrap PCM base64 string into realtimeInput with correct 16kHz audio mimeType", () => {
    const sampleBase64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
    const chunkMsg = buildLiveAudioChunkMessage(sampleBase64);

    assert.ok(chunkMsg.realtimeInput);
    assert.strictEqual(chunkMsg.realtimeInput.mediaChunks.length, 1);
    assert.strictEqual(
      chunkMsg.realtimeInput.mediaChunks[0].mimeType,
      "audio/pcm;rate=16000",
    );
    assert.strictEqual(chunkMsg.realtimeInput.mediaChunks[0].data, sampleBase64);
  });
});

describe("Background Service Worker - Live API Server Message Parsing", () => {
  it("should prioritize outputTranscription for streaming speech translation", () => {
    const serverPayload = {
      serverContent: {
        outputTranscription: {
          text: "Привет, как дела?",
        },
      },
    };

    const parsed = parseLiveServerMessage(serverPayload);
    assert.strictEqual(parsed.text, "Привет, как дела?");
    assert.strictEqual(parsed.isTurnComplete, false);
    assert.strictEqual(parsed.error, null);
  });

  it("should parse inputTranscription for live transcription when isTranscribeOnly is true", () => {
    const serverPayload = {
      serverContent: {
        inputTranscription: {
          text: "Hello everyone",
        },
      },
    };

    const parsed = parseLiveServerMessage(serverPayload, true);
    assert.strictEqual(parsed.text, "Hello everyone");
  });

  it("should strictly ignore inputTranscription when in translation mode (isTranscribeOnly: false)", () => {
    const serverPayload = {
      serverContent: {
        inputTranscription: {
          text: "Hello everyone",
        },
      },
    };

    const parsed = parseLiveServerMessage(serverPayload, false);
    assert.strictEqual(parsed.text, "");
  });

  it("should parse text from serverContent modelTurn parts as fallback", () => {
    const serverPayload = {
      serverContent: {
        modelTurn: {
          parts: [
            { text: "Привет всем, " },
            { text: "как дела?" },
          ],
        },
      },
    };

    const parsed = parseLiveServerMessage(serverPayload);
    assert.strictEqual(parsed.text, "Привет всем, как дела?");
    assert.strictEqual(parsed.isTurnComplete, false);
    assert.strictEqual(parsed.error, null);
  });

  it("should ignore parts with thought: true", () => {
    const serverPayload = {
      serverContent: {
        modelTurn: {
          parts: [
            { text: "thinking about grammar...", thought: true },
            { text: "Ребята, пойдём на мид." },
          ],
        },
      },
    };

    const parsed = parseLiveServerMessage(serverPayload);
    assert.strictEqual(parsed.text, "Ребята, пойдём на мид.");
  });

  it("should recognize turnComplete flag and setupComplete flag", () => {
    const serverPayload = {
      serverContent: {
        turnComplete: true,
      },
      setupComplete: {},
    };

    const parsed = parseLiveServerMessage(serverPayload);
    assert.strictEqual(parsed.isTurnComplete, true);
    assert.strictEqual(parsed.isSetupComplete, true);
  });

  it("should handle error messages from server gracefully", () => {
    const serverPayload = {
      error: {
        code: 429,
        message: "Resource exhausted (rate limit exceeded)",
      },
    };

    const parsed = parseLiveServerMessage(serverPayload);
    assert.strictEqual(parsed.error, "Resource exhausted (rate limit exceeded)");
  });

  it("should parse raw JSON strings safely", () => {
    const jsonStr = JSON.stringify({
      serverContent: {
        outputTranscription: { text: "Успешный парсинг" },
      },
    });

    const parsed = parseLiveServerMessage(jsonStr);
    assert.strictEqual(parsed.text, "Успешный парсинг");
  });
});

describe("Content Script - Live Captions UI", () => {
  it("should correctly handle incoming caption updates and turn completion", () => {
    // Setup minimal DOM mocks
    const createdElements = [];
    global.document = {
      getElementById(id) {
        return createdElements.find((el) => el.id === id) || null;
      },
      createElement(tag) {
        const el = {
          tagName: tag.toUpperCase(),
          className: "",
          id: "",
          innerHTML: "",
          textContent: "",
          style: {},
          children: [],
          dataset: {},
          appendChild(child) {
            this.children.push(child);
            child.parentElement = this;
            return child;
          },
          querySelector(sel) {
            if (sel.startsWith("#")) {
              const id = sel.slice(1);
              let found = this.children.find((c) => c.id === id);
              if (!found && this.innerHTML && this.innerHTML.includes(`id="${id}"`)) {
                found = global.document.createElement("div");
                found.id = id;
                this.appendChild(found);
              }
              return found || null;
            }
            if (sel.startsWith(".")) {
              const cls = sel.slice(1);
              return this.children.find((c) => (c.className || "").includes(cls)) || null;
            }
            return this.children[0] || null;
          },
          querySelectorAll(sel) {
            return [];
          },
          addEventListener() {},
          remove() {
            if (this.parentElement) {
              const idx = this.parentElement.children.indexOf(this);
              if (idx !== -1) this.parentElement.children.splice(idx, 1);
            }
          },
          classList: {
            add(c) { el.className = (el.className + " " + c).trim(); },
            remove(c) { el.className = el.className.replace(c, "").trim(); },
            toggle(c, force) {
              if (force) this.add(c);
              else this.remove(c);
            },
          },
        };
        createdElements.push(el);
        return el;
      },
      body: {
        children: [],
        appendChild(child) {
          this.children.push(child);
          child.parentElement = this;
          return child;
        },
      },
    };

    const { handleIncomingLiveCaption } = require("../content/content.js");

    // Feed first token of subtitle
    handleIncomingLiveCaption("Привет", false);
    const overlay = document.getElementById("dgtCaptionsOverlay");
    assert.ok(overlay, "Overlay must be created in document");

    const body = overlay.querySelector("#dgtCaptionsBody");
    assert.ok(body, "Body container must be present");
    assert.strictEqual(body.children.length, 1);
    assert.strictEqual(body.children[0].children[0].textContent, "Привет");

    // Feed continuous stream in same turn
    handleIncomingLiveCaption("Привет, как дела?", false);
    assert.strictEqual(body.children[0].children[0].textContent, "Привет, как дела?");

    // Turn complete
    handleIncomingLiveCaption("Привет, как дела?", true);
    assert.ok(
      !body.children[0].className.includes("dgt-caption-active"),
      "Active class should be removed on turn completion",
    );

    // Feed incremental streaming deltas for next turn
    handleIncomingLiveCaption("Отличная", false);
    assert.strictEqual(body.children.length, 2);
    assert.strictEqual(body.children[1].children[0].textContent, "Отличная");

    handleIncomingLiveCaption(" погода", false);
    assert.strictEqual(body.children[1].children[0].textContent, "Отличная погода");

    handleIncomingLiveCaption(" сегодня!", true);
    assert.strictEqual(body.children[1].children[0].textContent, "Отличная погода сегодня!");
  });
});
