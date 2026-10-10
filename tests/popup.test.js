const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  translations,
  filterValidModels,
  filterLiveModels,
} = require("../popup/popup.js");

describe("Popup - i18n Localization Integrity", () => {
  it("should have matching top-level keys in both RU and EN dictionaries", () => {
    const ruKeys = Object.keys(translations.ru).sort();
    const enKeys = Object.keys(translations.en).sort();
    assert.deepStrictEqual(
      ruKeys,
      enKeys,
      "RU and EN must have identical top-level localization keys",
    );
  });

  it("should have matching language option codes in both RU and EN", () => {
    const ruLangs = Object.keys(translations.ru.languages).sort();
    const enLangs = Object.keys(translations.en.languages).sort();
    assert.deepStrictEqual(
      ruLangs,
      enLangs,
      "Both dictionaries must support identical language codes",
    );
  });

  it("should have matching status message keys in both RU and EN", () => {
    const ruMsgs = Object.keys(translations.ru.messages).sort();
    const enMsgs = Object.keys(translations.en.messages).sort();
    assert.deepStrictEqual(
      ruMsgs,
      enMsgs,
      "Both dictionaries must define identical status message keys",
    );
  });
});

describe("Popup - Model Filtering", () => {
  it("should exclude audio, image, and robotics models", () => {
    const rawList = [
      { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
      { name: "models/lyria-3", displayName: "Lyria Music" },
      { name: "models/nano-banana", displayName: "Nano Banana Image" },
      { name: "models/gemini-2.5-flash-lite", displayName: "Gemini Flash-Lite" },
    ];

    const filtered = filterValidModels(rawList);
    assert.strictEqual(filtered.length, 2);
    assert.strictEqual(filtered[0].name, "models/gemini-2.5-flash-lite");
    assert.strictEqual(filtered[1].name, "models/gemini-2.5-flash");
  });

  it("should filter dedicated Live models list for popup liveModelSelect", () => {
    const rawList = [
      { name: "models/gemini-3.8-live", displayName: "Gemini 3.8 Live" },
      { name: "models/gemini-3.5-transcribe-live", displayName: "Gemini 3.5 Transcribe Live" },
      { name: "models/gemini-3.8-flash", displayName: "Gemini 3.8 Flash" },
      { name: "models/gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash Lite" },
      { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
      { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro" },
      { name: "models/imagen-3", displayName: "Imagen 3" },
    ];

    const liveList = filterLiveModels(rawList);
    assert.strictEqual(liveList.length, 2);
    assert.strictEqual(liveList[0].name, "models/gemini-3.8-live");
    assert.strictEqual(liveList[1].name, "models/gemini-3.5-transcribe-live");
  });
});
