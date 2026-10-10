const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  isTildeKey,
  isHotkeyTriggered,
  getCleanMessageText,
  getLangCode,
  SUPPORTED_LANGUAGES,
  CONTENT_I18N,
  getCurrentChannelId,
  isAutoTranslateActiveForChannel,
  shouldAutoTranslateMessage,
} = require("../content/content.js");

describe("Content Script - Hotkey Detection (Ctrl + ~)", () => {
  it("should recognize Backquote physical code as tilde", () => {
    assert.strictEqual(isTildeKey({ code: "Backquote" }), true);
  });

  it("should recognize English tilde and backtick characters", () => {
    assert.strictEqual(isTildeKey({ key: "`" }), true);
    assert.strictEqual(isTildeKey({ key: "~" }), true);
  });

  it("should recognize Russian letter 'ё' and 'Ё' as tilde key", () => {
    assert.strictEqual(isTildeKey({ key: "ё" }), true);
    assert.strictEqual(isTildeKey({ key: "Ё" }), true);
  });

  it("should return false for unrelated keys", () => {
    assert.strictEqual(isTildeKey({ key: "t", code: "KeyT" }), false);
    assert.strictEqual(isTildeKey({ key: "Enter", code: "Enter" }), false);
    assert.strictEqual(isTildeKey(null), false);
  });

  it("should trigger hotkey when Ctrl + ~ is pressed", () => {
    const event = {
      ctrlKey: true,
      altKey: false,
      code: "Backquote",
    };
    assert.strictEqual(isHotkeyTriggered(event), true);
  });

  it("should trigger hotkey on Russian layout with Ctrl + ё", () => {
    const event = {
      ctrlKey: true,
      altKey: false,
      key: "ё",
    };
    assert.strictEqual(isHotkeyTriggered(event), true);
  });

  it("should NOT trigger hotkey when Alt is pressed (preventing Edge tab-switch conflict)", () => {
    const event = {
      ctrlKey: true,
      altKey: true, // Alt is held
      code: "Backquote",
    };
    assert.strictEqual(isHotkeyTriggered(event), false);
  });

  it("should NOT trigger hotkey when Ctrl is missing", () => {
    const event = {
      ctrlKey: false,
      altKey: false,
      code: "Backquote",
    };
    assert.strictEqual(isHotkeyTriggered(event), false);
  });
});

describe("Content Script - Clean Message Text Extraction", () => {
  it("should strip translation UI buttons and boxes from extracted message text", () => {
    const mockElement = {
      cloneNode() {
        return {
          querySelectorAll(selector) {
            if (selector.includes("dgt-translate-msg-btn")) {
              return [
                {
                  remove() {
                    this.removed = true;
                  },
                },
              ];
            }
            return [];
          },
          innerText: "Hello, this is a Discord message!  ",
        };
      },
    };

    const text = getCleanMessageText(mockElement);
    assert.strictEqual(text, "Hello, this is a Discord message!");
  });
});

describe("Content Script - Quick Language Switcher", () => {
  it("should correctly map supported language names to short uppercase codes", () => {
    assert.strictEqual(getLangCode("English"), "EN");
    assert.strictEqual(getLangCode("Russian"), "RU");
    assert.strictEqual(getLangCode("German"), "DE");
    assert.strictEqual(getLangCode("Japanese"), "JA");
    assert.strictEqual(getLangCode("unknown"), "UN");
    assert.strictEqual(getLangCode(null), "EN");
  });

  it("should provide at least 9 distinct supported languages", () => {
    assert.ok(Array.isArray(SUPPORTED_LANGUAGES));
    assert.ok(SUPPORTED_LANGUAGES.length >= 9);
    const codes = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));
    assert.strictEqual(codes.size, SUPPORTED_LANGUAGES.length);
  });
});

describe("Content Script - Channel Auto-Translate", () => {
  it("should extract channel ID from guild channel URL", () => {
    assert.strictEqual(
      getCurrentChannelId("/channels/123456789/987654321"),
      "987654321",
    );
  });

  it("should extract channel ID from direct messages URL (@me)", () => {
    assert.strictEqual(
      getCurrentChannelId("/channels/@me/987654321"),
      "987654321",
    );
  });

  it("should extract channel ID from URL with message ID", () => {
    assert.strictEqual(
      getCurrentChannelId("/channels/123456789/987654321/555666777"),
      "987654321",
    );
  });

  it("should return null for non-channel paths", () => {
    assert.strictEqual(getCurrentChannelId("/channels"), null);
    assert.strictEqual(getCurrentChannelId("/guild-discovery"), null);
    assert.strictEqual(getCurrentChannelId(""), null);
    assert.strictEqual(getCurrentChannelId(null), null);
  });

  it("should determine if auto-translate is active globally or per channel", () => {
    const channels = { "100": true, "200": false };

    // When global is true, any channel is active
    assert.strictEqual(isAutoTranslateActiveForChannel("300", true, channels), true);

    // When global is false, only channels mapped as true are active
    assert.strictEqual(isAutoTranslateActiveForChannel("100", false, channels), true);
    assert.strictEqual(isAutoTranslateActiveForChannel("200", false, channels), false);
    assert.strictEqual(isAutoTranslateActiveForChannel("300", false, channels), false);
    assert.strictEqual(isAutoTranslateActiveForChannel(null, false, channels), false);
  });

  it("should filter messages for auto-translation", () => {
    const el = { id: "msg-1", dataset: {}, parentElement: { querySelector: () => null } };

    // Active channel, valid text
    assert.strictEqual(shouldAutoTranslateMessage(el, "Hello world", true), true);

    // Inactive channel
    assert.strictEqual(shouldAutoTranslateMessage(el, "Hello world", false), false);

    // Empty text
    assert.strictEqual(shouldAutoTranslateMessage(el, "", true), false);

    // Pure URL
    assert.strictEqual(
      shouldAutoTranslateMessage(el, "https://google.com/test", true),
      false,
    );

    // Already auto-translated
    const alreadyDone = { id: "msg-2", dataset: { dgtAutoTranslated: "true" } };
    assert.strictEqual(shouldAutoTranslateMessage(alreadyDone, "Hi", true), false);

    // Already has translation box
    const hasBox = {
      id: "msg-3",
      dataset: {},
      parentElement: { querySelector: (sel) => sel.includes("msg-3") ? {} : null },
    };
    assert.strictEqual(shouldAutoTranslateMessage(hasBox, "Hi", true), false);
  });
});

describe("Content Script - UI Localization (CONTENT_I18N)", () => {
  it("should have matching dictionary keys for both RU and EN", () => {
    assert.ok(CONTENT_I18N.ru, "RU dictionary must exist");
    assert.ok(CONTENT_I18N.en, "EN dictionary must exist");

    const ruKeys = Object.keys(CONTENT_I18N.ru).sort();
    const enKeys = Object.keys(CONTENT_I18N.en).sort();
    assert.deepStrictEqual(ruKeys, enKeys, "All keys must match between RU and EN");
  });

  it("should provide clean single-line button labels without appending (ВКЛ) or (ON)", () => {
    assert.strictEqual(CONTENT_I18N.ru.voiceBtn, "Голос");
    assert.strictEqual(CONTENT_I18N.en.voiceBtn, "Live");
    assert.strictEqual(CONTENT_I18N.ru.autoBtn, "Авто");
    assert.strictEqual(CONTENT_I18N.en.autoBtn, "Auto");

    assert.ok(!CONTENT_I18N.ru.voiceBtn.includes("ВКЛ"), "voiceBtn must not include (ВКЛ)");
    assert.ok(!CONTENT_I18N.en.voiceBtn.includes("ON"), "voiceBtn must not include (ON)");
  });

  it("should have localized tooltips for active and inactive states", () => {
    assert.ok(CONTENT_I18N.ru.voiceTitleActive.includes("ВКЛ"));
    assert.ok(CONTENT_I18N.ru.voiceTitleInactive.includes("ВЫКЛ"));
    assert.ok(CONTENT_I18N.en.voiceTitleActive.includes("ON"));
    assert.ok(CONTENT_I18N.en.voiceTitleInactive.includes("OFF"));
  });
});
