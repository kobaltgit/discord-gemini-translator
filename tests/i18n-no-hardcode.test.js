const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { translations } = require("../popup/popup.js");
const { CONTENT_I18N } = require("../content/content.js");

describe("i18n Hardcode Prevention - Popup HTML & Dictionaries", () => {
  const popupHtmlPath = path.join(__dirname, "../popup/popup.html");
  const htmlContent = fs.readFileSync(popupHtmlPath, "utf8");

  it("should ensure every data-i18n key in popup.html exists in both RU and EN dictionaries", () => {
    const dataI18nMatches = [...htmlContent.matchAll(/data-i18n="([^"]+)"/g)].map(
      (m) => m[1],
    );
    assert.ok(dataI18nMatches.length > 0, "popup.html must contain data-i18n attributes");

    for (const key of dataI18nMatches) {
      assert.ok(
        translations.ru[key],
        `Key "${key}" in popup.html is missing in translations.ru`,
      );
      assert.ok(
        translations.en[key],
        `Key "${key}" in popup.html is missing in translations.en`,
      );
    }
  });

  it("should ensure every data-i18n-title key in popup.html exists in both RU and EN dictionaries", () => {
    const dataI18nTitleMatches = [
      ...htmlContent.matchAll(/data-i18n-title="([^"]+)"/g),
    ].map((m) => m[1]);

    for (const key of dataI18nTitleMatches) {
      assert.ok(
        translations.ru[key],
        `Title key "${key}" in popup.html is missing in translations.ru`,
      );
      assert.ok(
        translations.en[key],
        `Title key "${key}" in popup.html is missing in translations.en`,
      );
    }
  });

  it("should prevent text-bearing tags in popup.html from having raw text without data-i18n", () => {
    // Strip scripts, styles, comments, and head
    const bodyContent = htmlContent
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "");

    // Check tags that display text: p, label, button, span, small, option
    // Allowed exceptions: brand names ('Gemini Translator'), language toggle buttons ('RU', 'EN'), numeric badges, icon-only buttons
    const tagRegex = /<([a-z0-9]+)([^>]*)>([^<]+)<\/\1>/gi;
    let match;
    const unlocalizedElements = [];

    while ((match = tagRegex.exec(bodyContent)) !== null) {
      const [, tagName, attrs, innerText] = match;
      const text = innerText.trim();
      if (!text) continue;

      // Skip title tag
      if (tagName.toLowerCase() === "title") continue;
      // Skip language switch buttons ('RU', 'EN')
      if (attrs.includes("lang-btn")) continue;
      // Skip brand title h1
      if (tagName === "h1" && text.includes("Gemini Translator")) continue;
      // Skip cache count number
      if (attrs.includes('id="cacheCount"')) continue;
      // Skip icon-only buttons like 👁️, ⏳
      if (/^[👁️🙈⏳🧹✕✖\d\s]+$/u.test(text)) continue;
      // Skip language options inside incoming/outgoing select (they are populated dynamically via dict.languages)
      if (
        tagName === "option" &&
        (text === "Русский" || text === "Английский" || text === "Немецкий" || text === "Французский" || text === "Испанский" || text === "Китайский" || text === "Японский" || text === "Корейский" || text === "Украинский")
      ) {
        continue;
      }

      const hasI18n = attrs.includes("data-i18n=");
      if (!hasI18n) {
        unlocalizedElements.push(`<${tagName}${attrs}>${text}</${tagName}>`);
      }
    }

    assert.deepStrictEqual(
      unlocalizedElements,
      [],
      `Found elements in popup.html with hardcoded text and no data-i18n attribute: \n${unlocalizedElements.join("\n")}`,
    );
  });

  it("should guarantee that English popup translations contain ZERO Cyrillic characters", () => {
    const cyrillicRegex = /[а-яА-ЯёЁ]/;
    const inspectObject = (obj, prefix = "") => {
      for (const [key, val] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof val === "string") {
          assert.ok(
            !cyrillicRegex.test(val),
            `English translation for "${fullKey}" contains Cyrillic characters: "${val}"`,
          );
        } else if (typeof val === "object" && val !== null) {
          inspectObject(val, fullKey);
        }
      }
    };

    inspectObject(translations.en);
  });

  it("should guarantee that all Russian popup translations are non-empty and localized", () => {
    const inspectObject = (obj, prefix = "") => {
      for (const [key, val] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof val === "string") {
          assert.ok(
            val.trim().length > 0,
            `Russian translation for "${fullKey}" must not be empty`,
          );
        } else if (typeof val === "object" && val !== null) {
          inspectObject(val, fullKey);
        }
      }
    };

    inspectObject(translations.ru);
  });
});

describe("i18n Hardcode Prevention - Content Script (CONTENT_I18N)", () => {
  it("should have identical key parity between RU and EN in CONTENT_I18N", () => {
    const ruKeys = Object.keys(CONTENT_I18N.ru).sort();
    const enKeys = Object.keys(CONTENT_I18N.en).sort();
    assert.deepStrictEqual(
      ruKeys,
      enKeys,
      "CONTENT_I18N.ru and CONTENT_I18N.en must have identical keys",
    );
  });

  it("should guarantee that English content translations contain ZERO Cyrillic characters", () => {
    const cyrillicRegex = /[а-яА-ЯёЁ]/;
    for (const [key, val] of Object.entries(CONTENT_I18N.en)) {
      assert.ok(
        !cyrillicRegex.test(val),
        `CONTENT_I18N.en["${key}"] contains Cyrillic characters: "${val}"`,
      );
    }
  });

  it("should guarantee that Russian content translations are non-empty", () => {
    for (const [key, val] of Object.entries(CONTENT_I18N.ru)) {
      assert.ok(
        val.trim().length > 0,
        `CONTENT_I18N.ru["${key}"] must not be empty`,
      );
    }
  });

  it("should guarantee different translations between RU and EN for all content keys", () => {
    for (const key of Object.keys(CONTENT_I18N.ru)) {
      assert.notStrictEqual(
        CONTENT_I18N.ru[key],
        CONTENT_I18N.en[key],
        `Key "${key}" has identical value in both RU and EN ("${CONTENT_I18N.ru[key]}"). It must be properly translated!`,
      );
    }
  });

  it("should guarantee button labels are clean single-line strings without line wraps or appended status", () => {
    const { voiceBtn: ruVoice, autoBtn: ruAuto } = CONTENT_I18N.ru;
    const { voiceBtn: enVoice, autoBtn: enAuto } = CONTENT_I18N.en;

    assert.ok(!ruVoice.includes("ВКЛ"), "ru.voiceBtn must not append (ВКЛ)");
    assert.ok(!ruVoice.includes("\n"), "ru.voiceBtn must not contain newlines");
    assert.ok(!enVoice.includes("ON"), "en.voiceBtn must not append (ON)");
    assert.ok(!enVoice.includes("\n"), "en.voiceBtn must not contain newlines");

    assert.ok(!ruAuto.includes("ВКЛ"), "ru.autoBtn must not append (ВКЛ)");
    assert.ok(!ruAuto.includes("\n"), "ru.autoBtn must not contain newlines");
    assert.ok(!enAuto.includes("ON"), "en.autoBtn must not append (ON)");
    assert.ok(!enAuto.includes("\n"), "en.autoBtn must not contain newlines");
  });
});

describe("i18n Hardcode Prevention - Source Code Static Analysis", () => {
  const contentJsPath = path.join(__dirname, "../content/content.js");
  const contentSource = fs.readFileSync(contentJsPath, "utf8");

  it("should ensure no DOM element text/title in content.js assigns hardcoded Cyrillic strings outside CONTENT_I18N", () => {
    const lines = contentSource.split("\n");
    let insideI18nBlock = false;
    const violations = [];

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmed = line.trim();

      if (trimmed.includes("const CONTENT_I18N = {")) {
        insideI18nBlock = true;
      }
      if (insideI18nBlock && trimmed.includes("const SUPPORTED_LANGUAGES = [")) {
        insideI18nBlock = false;
      }
      if (insideI18nBlock) return;

      // Ignore comments
      if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
        return;
      }

      // Check if line assigns a string with Cyrillic to a DOM property
      const hasCyrillic = /[а-яА-ЯёЁ]/.test(trimmed);
      if (!hasCyrillic) return;

      // Ignore hotkey layout checks like `e.key === "ё"` or comments
      if (trimmed.includes('"ё"') || trimmed.includes('"Ё"') || trimmed.includes("'ё'") || trimmed.includes("'Ё'")) {
        return;
      }

      // Check for hardcoded DOM assignments or alerts: .textContent = "...", .title = "...", .placeholder = "...", .innerHTML = "...", alert(...)
      const isDomAssignment =
        /(\.(textContent|title|placeholder|innerHTML)\s*=\s*|alert\()\s*[`"'].*?[а-яА-ЯёЁ].*?[`"']/.test(
          trimmed,
        );

      if (isDomAssignment) {
        violations.push({ lineNum, code: trimmed });
      }
    });

    assert.deepStrictEqual(
      violations,
      [],
      `Found hardcoded Cyrillic string assignments in content.js outside CONTENT_I18N: \n${violations.map((v) => `Line ${v.lineNum}: ${v.code}`).join("\n")}`,
    );
  });

  it("should ensure no DOM element text/title in popup.js assigns hardcoded Cyrillic strings outside translations", () => {
    const popupJsPath = path.join(__dirname, "../popup/popup.js");
    const popupSource = fs.readFileSync(popupJsPath, "utf8");
    const lines = popupSource.split("\n");
    let insideTranslationsBlock = false;
    const violations = [];

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmed = line.trim();

      if (trimmed.startsWith("const translations = {")) {
        insideTranslationsBlock = true;
      }
      if (insideTranslationsBlock && trimmed === "function filterValidModels(models) {") {
        insideTranslationsBlock = false;
      }
      if (insideTranslationsBlock) return;

      // Ignore comments
      if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
        return;
      }

      // Check if line assigns a string with Cyrillic to a DOM property or alert
      const hasCyrillic = /[а-яА-ЯёЁ]/.test(trimmed);
      if (!hasCyrillic) return;

      const isDomAssignment =
        /(\.(textContent|title|placeholder|innerHTML)\s*=\s*|alert\()\s*[`"'].*?[а-яА-ЯёЁ].*?[`"']/.test(
          trimmed,
        );

      if (isDomAssignment) {
        violations.push({ lineNum, code: trimmed });
      }
    });

    assert.deepStrictEqual(
      violations,
      [],
      `Found hardcoded Cyrillic string assignments in popup.js outside translations: \n${violations.map((v) => `Line ${v.lineNum}: ${v.code}`).join("\n")}`,
    );
  });
});
