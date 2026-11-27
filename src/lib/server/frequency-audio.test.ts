import { describe, expect, it } from "vitest";
import { createFrequencyWave } from "./frequency-audio";

describe("frequency replay audio", () => {
  it("produces deterministic mono PCM with a correct WAV header", () => {
    const buffer = createFrequencyWave(440);
    const view = new DataView(buffer);
    expect(String.fromCharCode(...new Uint8Array(buffer, 0, 4))).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(buffer.byteLength - 8);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint32(40, true)).toBe(buffer.byteLength - 44);
    expect(new Uint8Array(createFrequencyWave(440))).toEqual(new Uint8Array(buffer));
    expect(new Uint8Array(createFrequencyWave(880))).not.toEqual(new Uint8Array(buffer));
  });
  it("rejects invalid frequencies", () => {
    expect(() => createFrequencyWave(0)).toThrow();
    expect(() => createFrequencyWave(NaN)).toThrow();
  });
});
