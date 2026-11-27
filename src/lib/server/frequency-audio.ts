/** Short sine-wave stimulus with a gentle attack/release, matching AudioManager. */
export function createFrequencyWave(hz: number): ArrayBuffer {
  if (!Number.isFinite(hz) || hz < 120 || hz > 2000) throw new Error("Invalid frequency");
  const sampleRate = 24_000;
  const sampleCount = Math.round(sampleRate * 0.36);
  const dataLength = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF"); view.setUint32(4, 36 + dataLength, true); write(8, "WAVE");
  write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, dataLength, true);
  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const gain = 0.16 * Math.max(0, Math.min(t / 0.02, (0.34 - t) / 0.32, 1));
    view.setInt16(44 + 2 * i, Math.round(Math.sin(2 * Math.PI * hz * t) * gain * 32767), true);
  }
  return buffer;
}
