# Audio

`src/lib/audio/audio-manager.ts` owns a lazily created browser `AudioContext`.
It creates short-lived oscillators and gain envelopes only after user
interaction, caps output gain at 0.3, and exposes mute/volume controls for future
settings UI.

Frequency Recall v1 uses a three-tone batch. Frequency Recall v2 uses five
sequential logarithmically distributed 120–2000Hz sine-tone rounds with short
attack/release ramps. Rhythm Recall schedules brief 720Hz ticks from relative
millisecond offsets. No microphone permission, audio upload, decoded asset, or
background playback is used.

Audio timing varies by browser, device, Bluetooth path, and power state.
Frequency and rhythm games therefore rank perceptual reconstruction, not audio
hardware latency. Players should use a comfortable volume and avoid these games
if pure tones are uncomfortable.
