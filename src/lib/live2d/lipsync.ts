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
 * Browser speechSynthesis exposes no audio stream, so the mouth is driven by a
 * phoneme envelope (always-open baseline) with extra emphasis on each word
 * `boundary` event. Voice is pitched up toward a lighter tone. Swapping in a
 * real TTS stream + audio-analyser amplitude is contained to this file.
 */
export function createSpeechController(cb: LipsyncCallbacks): SpeechController {
  let rafId: number | null = null;
  let startTime = 0;
  let durationMs = 0;
  let active = false;
  let kick = 0;
  let lastBoundary = 0;

  const stopLoop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const finish = () => {
    if (!active) return;
    active = false;
    kick = 0;
    stopLoop();
    cb.onMouth(0);
    cb.onEnd?.();
  };

  const tick = () => {
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
    rafId = requestAnimationFrame(tick);
  };

  const startLoop = (text: string, scale: number) => {
    active = true;
    startTime = performance.now();
    durationMs = estimateDurationMs(text) * scale;
    cb.onStart?.();
    rafId = requestAnimationFrame(tick);
  };

  const speak = (text: string, withAudio: boolean) => {
    cancel();
    if (withAudio && isTtsAvailable()) {
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
      startLoop(text, 1.6);
      return;
    }
    startLoop(text, 1);
  };

  const cancel = () => {
    if (isTtsAvailable()) window.speechSynthesis.cancel();
    finish();
  };

  const dispose = () => {
    active = false;
    stopLoop();
    if (isTtsAvailable()) window.speechSynthesis.cancel();
  };

  return { speak, cancel, dispose };
}
