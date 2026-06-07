export interface LipsyncCallbacks {
  onMouth: (open: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface SpeechController {
  speak: (text: string, withAudio: boolean) => void;
  cancel: () => void;
  dispose: () => void;
}

const WORDS_PER_MINUTE = 165;
const MIN_DURATION_MS = 800;
const MAX_DURATION_MS = 22000;
const BOUNDARY_FRESH_MS = 200;
const KICK_DECAY = 0.86;
const VOICE_PITCH = 1.5;
const VOICE_RATE = 1.05;
const AUDIO_GAIN = 11;
const TTS_ENDPOINT = '/api/tts';

export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function estimateDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length || 1;
  const ms = (words / WORDS_PER_MINUTE) * 60_000;
  return Math.min(Math.max(ms, MIN_DURATION_MS), MAX_DURATION_MS);
}

const PREFERRED_VOICE = /(samantha|victoria|karen|tessa|moira|fiona|zira|google us english|female)/i;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const english = voices.filter((v) => /^en/i.test(v.lang));
  return english.find((v) => PREFERRED_VOICE.test(v.name)) || english[0] || voices[0] || null;
}

/**
 * Lip-sync engine with three tiers, all driving the same onMouth signal:
 *  1. Real neural voice from Pod (/api/tts) -> mouth follows actual audio
 *     amplitude (perfect sync) via a Web Audio analyser.
 *  2. Fallback browser speechSynthesis (pitched up, female voice) -> mouth from a
 *     phoneme envelope with per-word emphasis from `boundary` events.
 *  3. Muted -> envelope only (animated, no sound).
 */
export function createSpeechController(cb: LipsyncCallbacks): SpeechController {
  let rafId: number | null = null;
  let active = false;
  let token = 0;
  let audioCtx: AudioContext | null = null;
  let currentSource: AudioBufferSourceNode | null = null;
  let startTime = 0;
  let durationMs = 0;
  let kick = 0;
  let lastBoundary = 0;

  const stopLoop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const stopSource = () => {
    if (currentSource) {
      currentSource.onended = null;
      try {
        currentSource.stop();
      } catch {
        /* already stopped */
      }
      currentSource = null;
    }
  };

  const finish = () => {
    if (!active) return;
    active = false;
    kick = 0;
    stopLoop();
    stopSource();
    cb.onMouth(0);
    cb.onEnd?.();
  };

  const envelopeTick = () => {
    if (!active) return;
    const now = performance.now();
    if (now - startTime >= durationMs) {
      finish();
      return;
    }
    const phase = (now - startTime) / 80;
    const base = Math.sin(phase) * 0.5 + 0.5;
    const flutter = Math.sin(phase * 2.6 + 1.3) * 0.5 + 0.5;
    let open = base * 0.65 + flutter * 0.35;
    if (now - lastBoundary < BOUNDARY_FRESH_MS) {
      kick *= KICK_DECAY;
      open = Math.max(open, kick);
    }
    cb.onMouth(Math.min(1, Math.max(0, open)));
    rafId = requestAnimationFrame(envelopeTick);
  };

  const startEnvelope = (text: string, scale: number) => {
    active = true;
    startTime = performance.now();
    durationMs = estimateDurationMs(text) * scale;
    cb.onStart?.();
    rafId = requestAnimationFrame(envelopeTick);
  };

  const browserSpeak = (text: string) => {
    if (!isTtsAvailable()) {
      startEnvelope(text, 1);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = VOICE_RATE;
    utterance.pitch = VOICE_PITCH;
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.onboundary = () => {
      lastBoundary = performance.now();
      kick = 0.95;
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    startEnvelope(text, 1.6);
  };

  const ensureCtx = (): AudioContext => {
    if (!audioCtx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctor();
    }
    return audioCtx;
  };

  // Autoplay policy: Web Audio can only start from a user gesture, but speech
  // begins after the answer fetch resolves (gesture expired). Create + resume
  // the context on the first interaction so later playback is unblocked.
  const unlock = () => {
    try {
      ensureCtx().resume().catch(() => {});
    } catch {
      /* AudioContext unsupported */
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  const realSpeak = async (text: string, myToken: number): Promise<boolean> => {
    let res: Response;
    try {
      res = await fetch(TTS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch {
      return false;
    }
    if (!res.ok) return false;

    const bytes = await res.arrayBuffer();
    if (myToken !== token) return true;

    const ctx = ensureCtx();
    await ctx.resume().catch(() => {});
    const audioBuffer = await ctx.decodeAudioData(bytes);
    if (myToken !== token) return true;

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyser.connect(ctx.destination);

    const data = new Uint8Array(analyser.fftSize);
    active = true;
    currentSource = source;
    cb.onStart?.();
    source.onended = () => {
      if (currentSource === source) finish();
    };

    const loop = () => {
      if (!active || currentSource !== source) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const x = (data[i] - 128) / 128;
        sum += x * x;
      }
      const rms = Math.sqrt(sum / data.length);
      cb.onMouth(Math.min(1, Math.max(0, rms * AUDIO_GAIN)));
      rafId = requestAnimationFrame(loop);
    };

    source.start();
    rafId = requestAnimationFrame(loop);
    return true;
  };

  const speak = (text: string, withAudio: boolean) => {
    cancel();
    const myToken = ++token;
    if (!withAudio) {
      startEnvelope(text, 1);
      return;
    }
    realSpeak(text, myToken)
      .then((ok) => {
        if (!ok && myToken === token) browserSpeak(text);
      })
      .catch(() => {
        if (myToken === token) browserSpeak(text);
      });
  };

  const cancel = () => {
    token++;
    if (isTtsAvailable()) window.speechSynthesis.cancel();
    finish();
  };

  const dispose = () => {
    token++;
    active = false;
    stopLoop();
    stopSource();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    }
    if (isTtsAvailable()) window.speechSynthesis.cancel();
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
  };

  return { speak, cancel, dispose };
}
