interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface RecognitionGlobals {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as RecognitionGlobals;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionAvailable(): boolean {
  return getCtor() !== null;
}

export interface RecognitionHandle {
  start: () => void;
  stop: () => void;
}

export interface RecognitionOptions {
  onResult: (transcript: string) => void;
  onEnd?: () => void;
  onError?: () => void;
  lang?: string;
}

export function createRecognition(options: RecognitionOptions): RecognitionHandle | null {
  const Ctor = getCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = options.lang ?? 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    options.onResult(transcript.trim());
  };
  recognition.onend = () => options.onEnd?.();
  recognition.onerror = () => options.onError?.();

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
  };
}
