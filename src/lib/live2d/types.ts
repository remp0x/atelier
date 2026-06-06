import type { ExpressionName } from './emotion';

export interface HarukaStageHandle {
  speak: (text: string) => void;
  stopSpeaking: () => void;
  setExpression: (expression: ExpressionName) => void;
}

export interface HarukaStageProps {
  voiceEnabled: boolean;
  onHandle: (handle: HarukaStageHandle | null) => void;
}
