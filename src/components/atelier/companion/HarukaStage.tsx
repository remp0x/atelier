'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import * as PIXI from 'pixi.js';
import { install as installUnsafeEval } from '@pixi/unsafe-eval';
import type { Live2DModel, Cubism4InternalModel } from 'pixi-live2d-display/cubism4';
import { loadCubismCore } from '@/lib/live2d/cubism-core';
import { createSpeechController, type SpeechController } from '@/lib/live2d/lipsync';
import type { ExpressionName } from '@/lib/live2d/emotion';
import type { HarukaStageHandle, HarukaStageProps } from '@/lib/live2d/types';

const MODEL_URL = '/live2d/hiyori/Hiyori.model3.json';
const MOUTH_PARAM = 'ParamMouthOpenY';

const CANVAS_W = 180;
const CANVAS_H = 200;
const MODEL_ZOOM = 2.0;
const MODEL_Y_RATIO = 0.78;

const REACTION_BY_EXPRESSION: Partial<Record<ExpressionName, string>> = {
  happy: 'TapBody',
  surprised: 'TapBody',
};

type Status = 'loading' | 'ready' | 'error';

let unsafeEvalInstalled = false;

/**
 * Renders the Hiyori Live2D model (the "Haruka" face) and drives its mouth from
 * the lipsync controller. The HarukaStageHandle contract is identical to the
 * earlier placeholder, so the widget is unaware of the renderer swap.
 */
export default function HarukaStage({ voiceEnabled, onHandle }: HarukaStageProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [speaking, setSpeaking] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<Live2DModel<Cubism4InternalModel> | null>(null);
  const mouthRef = useRef(0);
  const voiceRef = useRef(voiceEnabled);
  const controllerRef = useRef<SpeechController | null>(null);

  useEffect(() => {
    voiceRef.current = voiceEnabled;
  }, [voiceEnabled]);

  useEffect(() => {
    let cancelled = false;

    const controller = createSpeechController({
      onMouth: (open) => {
        mouthRef.current = open;
      },
      onStart: () => setSpeaking(true),
      onEnd: () => {
        setSpeaking(false);
        mouthRef.current = 0;
      },
    });
    controllerRef.current = controller;

    const handle: HarukaStageHandle = {
      speak: (text) => controller.speak(text, voiceRef.current),
      stopSpeaking: () => controller.cancel(),
      setExpression: (expression) => {
        const reaction = REACTION_BY_EXPRESSION[expression];
        if (reaction) modelRef.current?.motion(reaction);
      },
    };
    onHandle(handle);

    async function init() {
      try {
        (window as unknown as { PIXI: typeof PIXI }).PIXI = PIXI;
        if (!unsafeEvalInstalled) {
          installUnsafeEval(PIXI);
          unsafeEvalInstalled = true;
        }
        await loadCubismCore();
        if (cancelled || !canvasRef.current) return;

        const { Live2DModel: Live2DModelClass } = await import('pixi-live2d-display/cubism4');
        if (cancelled || !canvasRef.current) return;

        const app = new PIXI.Application({
          view: canvasRef.current,
          width: CANVAS_W,
          height: CANVAS_H,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
        });
        appRef.current = app;

        const model = (await Live2DModelClass.from(MODEL_URL, {
          autoInteract: false,
        })) as Live2DModel<Cubism4InternalModel>;

        if (cancelled) {
          model.destroy();
          return;
        }

        model.autoUpdate = false;
        model.anchor.set(0.5, 0.5);
        const scale = (CANVAS_H / model.height) * MODEL_ZOOM;
        model.scale.set(scale);
        model.position.set(CANVAS_W / 2, CANVAS_H * MODEL_Y_RATIO);
        app.stage.addChild(model);
        modelRef.current = model;

        app.ticker.add(() => {
          const m = modelRef.current;
          if (!m) return;
          m.internalModel.coreModel.setParameterValueById(MOUTH_PARAM, mouthRef.current);
          m.update(app.ticker.deltaMS);
        });

        setStatus('ready');
      } catch (err) {
        console.error('[HarukaStage] failed to initialize Live2D model', err);
        if (!cancelled) setStatus('error');
      }
    }

    init();

    return () => {
      cancelled = true;
      controller.dispose();
      controllerRef.current = null;
      onHandle(null);
      modelRef.current?.destroy();
      modelRef.current = null;
      appRef.current?.destroy(false, { children: true });
      appRef.current = null;
    };
  }, [onHandle]);

  return (
    <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H }}>
      <motion.div
        className="absolute inset-x-6 bottom-3 h-6 rounded-[50%] bg-atelier/20 blur-md"
        animate={speaking ? { opacity: [0.5, 0.8, 0.5] } : { opacity: 0.4 }}
        transition={{ duration: 0.9, repeat: speaking ? Infinity : 0, ease: 'easeInOut' }}
      />
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className={`relative transition-opacity duration-300 ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
      />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center">
          {status === 'loading' ? (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-atelier-bright to-atelier animate-pulse" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-atelier-bright to-atelier ring-1 ring-white/20 flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
