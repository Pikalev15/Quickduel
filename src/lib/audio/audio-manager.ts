import { RHYTHM_SEQUENCE_GAP_MS } from "@/games/rhythm-input";

export class AudioManager {
  private static instance: AudioManager | null = null;
  private context: AudioContext | null = null;
  private muted = false;
  private volume = 0.16;
  private playbackId = 0;
  private sources = new Set<AudioScheduledSourceNode>();

  stopPlayback() {
    this.playbackId += 1;
    for (const source of this.sources) {
      try { source.stop(); } catch { /* already ended */ }
      source.disconnect();
    }
    this.sources.clear();
  }

  private track(source: AudioScheduledSourceNode) {
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
    };
  }

  async unlock() {
    const context = await this.getContext();
    return context?.state === "running";
  }

  async playRemoteTone(url: string) {
    this.stopPlayback();
    const id = this.playbackId;
    if (this.muted) return;
    const context = await this.getContext();
    if (!context || this.muted || id !== this.playbackId) return;
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("Tone unavailable");
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    if (this.muted || id !== this.playbackId) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = this.volume / 0.16;
    source.connect(gain).connect(context.destination);
    this.track(source);
    source.start();
  }

  static shared() {
    if (!AudioManager.instance) AudioManager.instance = new AudioManager();
    return AudioManager.instance;
  }

  setMuted(value: boolean) {
    this.muted = value;
    if (value) this.stopPlayback();
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(0.3, value));
  }

  private async getContext() {
    if (typeof window === "undefined") return null;
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") {
      try {
        await this.context.resume();
      } catch {
        return null;
      }
    }
    return this.context;
  }

  async playToneSequence(frequencies: number[]) {
    this.stopPlayback();
    const id = this.playbackId;
    const context = await this.getContext();
    if (!context || this.muted || id !== this.playbackId) return;
    let at = context.currentTime + 0.03;
    for (const frequency of frequencies) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(Math.max(80, Math.min(3000, frequency)), at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(this.volume, at + 0.02);
      gain.gain.linearRampToValueAtTime(0, at + 0.34);
      oscillator.connect(gain).connect(context.destination);
      this.track(oscillator);
      oscillator.start(at);
      oscillator.stop(at + 0.36);
      at += 0.48;
    }
  }

  async playRhythmSequence(rhythms: number[][]) {
    this.stopPlayback();
    const id = this.playbackId;
    const context = await this.getContext();
    if (!context || this.muted || id !== this.playbackId) return;
    let at = context.currentTime + 0.03;
    for (const rhythm of rhythms) {
      for (const offset of rhythm) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 720;
        gain.gain.setValueAtTime(this.volume, at + offset / 1000);
        gain.gain.exponentialRampToValueAtTime(0.001, at + offset / 1000 + 0.07);
        oscillator.connect(gain).connect(context.destination);
      this.track(oscillator);
        oscillator.start(at + offset / 1000);
        oscillator.stop(at + offset / 1000 + 0.08);
      }
      at += (rhythm.at(-1) ?? 0) / 1000 + RHYTHM_SEQUENCE_GAP_MS / 1000;
    }
  }
}
