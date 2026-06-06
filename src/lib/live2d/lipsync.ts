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

export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function estimateDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length || 1;
  const ms = (words / WORDS_PER_MINUTE) * 60_000;
  return Math.min(Math.max(ms, MIN_DURATION_MS), MAX_DURATION_MS);
}

/**
 * Browser speechSynthesis exposes no audio node, so the visible mouth is driven
 * by a synthetic phoneme envelope rather than real amplitude. The licensed
 * Cubism renderer consumes the same onMouth signal, so swapping in real
 * audio-analyser amplitude later is contained to this file.
 */
export function createSpeechController(cb: LipsyncCallbacks): SpeechController {
  let rafId: number | null = null;
  let startTime = 0;
  let durationMs = 0;
  let active = false;

  const stopLoop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const finish = () => {
    if (!active) return;
    active = false;
    stopLoop();
    cb.onMouth(0);
    cb.onEnd?.();
  };

  const tick = () => {
    if (!active) return;
    const elapsed = performance.now() - startTime;
    if (elapsed >= durationMs) {
      finish();
      return;
    }
    const phase = elapsed / 85;
    const base = Math.sin(phase) * 0.5 + 0.5;
    const flutter = Math.sin(phase * 2.7) * 0.5 + 0.5;
    const open = Math.min(1, Math.max(0, base * 0.65 + flutter * 0.35));
    cb.onMouth(open);
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
