'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { createSpeechController, type SpeechController } from '@/lib/live2d/lipsync';
import type { ExpressionName } from '@/lib/live2d/emotion';
import type { HarukaStageHandle, HarukaStageProps } from '@/lib/live2d/types';

const EYE_BY_EXPRESSION: Record<ExpressionName, { d: string; rest: boolean }> = {
  neutral: { d: 'M 0 0 a 4 4 0 1 0 0.01 0', rest: true },
  happy: { d: 'M -5 1 q 5 -6 10 0', rest: false },
  thinking: { d: 'M -5 0 h 9', rest: false },
  apologetic: { d: 'M -5 -2 q 5 4 10 0', rest: false },
  surprised: { d: 'M 0 0 a 5 5 0 1 0 0.01 0', rest: true },
};

function Eye({ expression, cx }: { expression: ExpressionName; cx: number }) {
  const cfg = EYE_BY_EXPRESSION[expression];
  if (cfg.rest) {
    const r = expression === 'surprised' ? 5 : 4;
    return <circle cx={cx} cy={44} r={r} fill="currentColor" />;
  }
  return (
    <path
      transform={`translate(${cx} 44)`}
      d={cfg.d}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
    />
  );
}

/**
 * Placeholder renderer standing in for the licensed Live2D Cubism stage. It
 * implements the full HarukaStageHandle contract (speak / stopSpeaking /
 * setExpression) and consumes the lipsync onMouth signal, so replacing it with
 * the Cubism canvas is a drop-in swap that leaves the widget untouched.
 */
export default function HarukaStage({ voiceEnabled, onHandle }: HarukaStageProps) {
  const [expression, setExpression] = useState<ExpressionName>('neutral');
  const [blinking, setBlinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const mouthRef = useRef<SVGGElement>(null);
  const voiceRef = useRef(voiceEnabled);
  const controllerRef = useRef<SpeechController | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    voiceRef.current = voiceEnabled;
  }, [voiceEnabled]);

  useEffect(() => {
    const controller = createSpeechController({
      onMouth: (open) => {
        const el = mouthRef.current;
        if (el) el.style.transform = `scaleY(${0.18 + open})`;
      },
      onStart: () => setSpeaking(true),
      onEnd: () => {
        setSpeaking(false);
        const el = mouthRef.current;
        if (el) el.style.transform = 'scaleY(0.18)';
      },
    });
    controllerRef.current = controller;

    const handle: HarukaStageHandle = {
      speak: (text) => controller.speak(text, voiceRef.current),
      stopSpeaking: () => controller.cancel(),
      setExpression: (next) => setExpression(next),
    };
    onHandle(handle);

    return () => {
      controller.dispose();
      controllerRef.current = null;
      onHandle(null);
    };
  }, [onHandle]);

  useEffect(() => {
    if (reduceMotion) return;
    const interval = setInterval(() => {
      setBlinking(true);
      const timeout = setTimeout(() => setBlinking(false), 130);
      return () => clearTimeout(timeout);
    }, 4200);
    return () => clearInterval(interval);
  }, [reduceMotion]);

  const eyeExpression = blinking ? 'thinking' : expression;

  return (
    <div className="relative" style={{ width: 96, height: 96 }}>
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-atelier-bright/25 to-atelier/10"
        animate={speaking && !reduceMotion ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={{ duration: 0.9, repeat: speaking ? Infinity : 0, ease: 'easeInOut' }}
      />
      <motion.div
        className="relative w-full h-full rounded-full bg-gradient-to-br from-atelier-bright to-atelier ring-1 ring-white/20 shadow-lg shadow-atelier/30 flex items-center justify-center overflow-hidden"
        animate={reduceMotion ? { y: 0 } : { y: [0, -3, 0] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent"
        />
        <svg viewBox="0 0 100 100" className="w-3/4 h-3/4 text-white" aria-hidden="true">
          <Eye expression={eyeExpression} cx={36} />
          <Eye expression={eyeExpression} cx={64} />
          <g
            ref={mouthRef}
            style={{ transformBox: 'fill-box', transformOrigin: 'center', transform: 'scaleY(0.18)' }}
          >
            <ellipse cx={50} cy={66} rx={11} ry={9} fill="currentColor" />
          </g>
        </svg>
      </motion.div>
    </div>
  );
}
