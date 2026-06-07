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
const BOUNDARY_FRESH_MS = 220;
const KICK_DECAY = 0.8;

export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function estimateDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length || 1;
  const ms = (words / WORDS_PER_MINUTE) * 60_000;
  return Math.min(Math.max(ms, MIN_DURATION_MS), MAX_DURATION_MS);
}

/**
 * Browser speechSynthesis exposes no audio stream, so the mouth is driven two
 * ways: when the voice fires word `boundary` events, each word kicks the mouth
 * open and decays (speech-rhythm synced); otherwise it falls back to a phoneme
 * envelope. Swapping in real audio-analyser amplitude is contained to this file.
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
    let open: number;
    if (now - lastBoundary < BOUNDARY_FRESH_MS) {
      kick *= KICK_DECAY;
      open = kick;
    } else {
      const phase = (now - startTime) / 85;
      const base = Math.sin(phase) * 0.5 + 0.5;
      const flutter = Math.sin(phase * 2.7) * 0.5 + 0.5;
      open = base * 0.55 + flutter * 0.3;
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
      utterance.rate = 1.05;
      utterance.onboundary = (event) => {
        if (event.name === 'word' || event.name === undefined) {
          lastBoundary = performance.now();
          kick = 0.75 + (event.charLength ? Math.min(0.25, event.charLength / 40) : 0.15);
        }
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
