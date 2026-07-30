export class AudioManager {
  private static instance: AudioManager | null = null;
  private context: AudioContext | null = null;
  private muted = false;
  private volume = 0.16;

  static shared() {
    if (!AudioManager.instance) AudioManager.instance = new AudioManager();
    return AudioManager.instance;
  }

  setMuted(value: boolean) {
    this.muted = value;
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(0.3, value));
  }

  private getContext() {
    if (typeof window === "undefined") return null;
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") void this.context.resume();
    return this.context;
  }

  async playToneSequence(frequencies: number[]) {
    const context = this.getContext();
    if (!context || this.muted) return;
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
      oscillator.start(at);
      oscillator.stop(at + 0.36);
      at += 0.48;
    }
  }

  async playRhythmSequence(rhythms: number[][]) {
    const context = this.getContext();
    if (!context || this.muted) return;
    let at = context.currentTime + 0.03;
    for (const rhythm of rhythms) {
      for (const offset of rhythm) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 720;
        gain.gain.setValueAtTime(this.volume, at + offset / 1000);
        gain.gain.exponentialRampToValueAtTime(0.001, at + offset / 1000 + 0.07);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(at + offset / 1000);
        oscillator.stop(at + offset / 1000 + 0.08);
      }
      at += (rhythm.at(-1) ?? 0) / 1000 + 0.55;
    }
  }
}
