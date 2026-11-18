// Emberwake's sound, synthesised with WebAudio: no audio files, nothing to load.
// Short oscillator and noise voices for every action, plus a slow two-voice
// arpeggio that plays under the action. The context opens on the first user
// gesture (the title screen's key or click), as browsers require.

const MUSIC_NOTES = [220, 261.63, 329.63, 440, 329.63, 261.63];
const BASS_NOTES = [110, 87.31, 98, 130.81];

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let musicTimer = 0;
  let musicStep = 0;
  let lastShotAt = 0;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(context.destination);
    return true;
  }

  function tone({ freq = 440, end = null, type = 'sine', dur = 0.15, gain = 0.2, delay = 0 }) {
    if (!ensure()) return;
    const t0 = context.currentTime + delay;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (end !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + dur);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.25, gain = 0.25, delay = 0, freq = 900 }) {
    if (!ensure()) return;
    const t0 = context.currentTime + delay;
    const length = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, t0);
    filter.frequency.exponentialRampToValueAtTime(120, t0 + dur);
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    source.connect(filter).connect(amp).connect(master);
    source.start(t0);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      const now = performance.now();
      if (now - lastShotAt < 45) return;
      lastShotAt = now;
      tone({ freq: 880, end: 320, type: 'square', dur: 0.07, gain: 0.05 });
    },
    dash() {
      noise({ dur: 0.18, gain: 0.12, freq: 2400 });
      tone({ freq: 240, end: 720, type: 'sine', dur: 0.16, gain: 0.08 });
    },
    hitEnemy() {
      tone({ freq: 340, end: 180, type: 'triangle', dur: 0.06, gain: 0.1 });
    },
    explode(big) {
      noise({ dur: big ? 0.4 : 0.22, gain: big ? 0.3 : 0.18, freq: big ? 700 : 1000 });
      tone({ freq: big ? 160 : 220, end: 40, type: 'sine', dur: big ? 0.35 : 0.2, gain: 0.22 });
    },
    hurt() {
      tone({ freq: 200, end: 70, type: 'sawtooth', dur: 0.25, gain: 0.2 });
      noise({ dur: 0.2, gain: 0.15, freq: 500 });
    },
    pickup(kind) {
      if (kind === 'heal') {
        tone({ freq: 523, type: 'sine', dur: 0.12, gain: 0.14 });
        tone({ freq: 784, type: 'sine', dur: 0.18, gain: 0.14, delay: 0.08 });
      } else if (kind === 'surge') {
        tone({ freq: 440, end: 1320, type: 'square', dur: 0.2, gain: 0.1 });
      } else {
        tone({ freq: 988, type: 'sine', dur: 0.09, gain: 0.12 });
        tone({ freq: 1319, type: 'sine', dur: 0.12, gain: 0.1, delay: 0.05 });
      }
    },
    waveStart(wave) {
      tone({ freq: 392, type: 'triangle', dur: 0.14, gain: 0.16 });
      tone({ freq: 587, type: 'triangle', dur: 0.2, gain: 0.16, delay: 0.1 + wave * 0.0 });
    },
    uiMove() {
      tone({ freq: 660, type: 'sine', dur: 0.05, gain: 0.06 });
    },
    win() {
      [523, 659, 784, 1047].forEach((freq, i) => tone({ freq, type: 'triangle', dur: 0.3, gain: 0.16, delay: i * 0.13 }));
    },
    lose() {
      [392, 330, 262, 196].forEach((freq, i) => tone({ freq, type: 'triangle', dur: 0.32, gain: 0.16, delay: i * 0.15 }));
    },
    /** Advance the ambient music; call once a frame while a run is live. */
    music(dt, active) {
      if (!context || muted || !active) return;
      musicTimer -= dt;
      if (musicTimer > 0) return;
      musicTimer = 0.24;
      const step = musicStep;
      musicStep += 1;
      tone({ freq: MUSIC_NOTES[step % MUSIC_NOTES.length], type: 'sine', dur: 0.22, gain: 0.035 });
      if (step % 4 === 0) tone({ freq: BASS_NOTES[(step / 4) % BASS_NOTES.length], type: 'triangle', dur: 0.8, gain: 0.05 });
    },
  };
}
