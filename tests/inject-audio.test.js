const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  float32ToInt16Pcm,
  calculateRMS,
  int16ToBase64,
  downsampleBuffer,
} = require("../content/inject.js");

describe("Inject Audio Processing - VAD & PCM 16kHz", () => {
  it("should convert silence Float32Array to Int16Array of zeros", () => {
    const f32 = new Float32Array([0, 0, 0, 0]);
    const int16 = float32ToInt16Pcm(f32);
    assert.strictEqual(int16.length, 4);
    assert.strictEqual(int16[0], 0);
    assert.strictEqual(int16[3], 0);
  });

  it("should clamp values between -1.0 and +1.0 properly to 16-bit signed range", () => {
    const f32 = new Float32Array([-1.5, -1.0, 0.0, 1.0, 1.5]);
    const int16 = float32ToInt16Pcm(f32);
    assert.strictEqual(int16[0], -32768);
    assert.strictEqual(int16[1], -32768);
    assert.strictEqual(int16[2], 0);
    assert.strictEqual(int16[3], 32767);
    assert.strictEqual(int16[4], 32767);
  });

  it("should calculate correct RMS value", () => {
    const silence = new Float32Array([0, 0, 0, 0]);
    assert.strictEqual(calculateRMS(silence), 0);

    const dcSignal = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    assert.strictEqual(Math.round(calculateRMS(dcSignal) * 100) / 100, 0.5);

    const empty = new Float32Array([]);
    assert.strictEqual(calculateRMS(empty), 0);
  });

  it("should encode Int16Array to valid Base64 string", () => {
    const pcm = new Int16Array([0, 1000, -1000, 32767]);
    const b64 = int16ToBase64(pcm);
    assert.strictEqual(typeof b64, "string");
    assert.ok(b64.length > 0);

    const decoded = Buffer.from(b64, "base64");
    assert.strictEqual(decoded.length, pcm.byteLength);
    const roundtrip = new Int16Array(
      decoded.buffer,
      decoded.byteOffset,
      decoded.length / 2,
    );
    assert.strictEqual(roundtrip[0], 0);
    assert.strictEqual(roundtrip[1], 1000);
    assert.strictEqual(roundtrip[2], -1000);
    assert.strictEqual(roundtrip[3], 32767);
  });

  it("should downsample audio buffer from 48000Hz to 16000Hz (ratio 3:1)", () => {
    const input = new Float32Array([0.3, 0.3, 0.3, 0.6, 0.6, 0.6]);
    const downsampled = downsampleBuffer(input, 48000, 16000);
    assert.strictEqual(downsampled.length, 2);
    assert.strictEqual(Math.round(downsampled[0] * 10) / 10, 0.3);
    assert.strictEqual(Math.round(downsampled[1] * 10) / 10, 0.6);
  });
});
