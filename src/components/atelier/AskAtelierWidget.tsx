'use client';

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { emotionFromText } from '@/lib/live2d/emotion';
import { createRecognition, isSpeechRecognitionAvailable, type RecognitionHandle } from '@/lib/live2d/speech-recognition';
import type { HarukaStageHandle } from '@/lib/live2d/types';

const COMPANION_ENABLED = process.env.NEXT_PUBLIC_HARUKA_COMPANION === 'true';

const HarukaStage = dynamic(() => import('./companion/HarukaStage'), { ssr: false });

interface Message {
  role: 'user' | 'assistant';
  text: string;
  isError?: boolean;
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-1 px-3 py-2.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-neutral-500"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

const INLINE_TOKEN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`/g;

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  INLINE_TOKEN.lastIndex = 0;
  while ((match = INLINE_TOKEN.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-semibold text-black dark:text-white">
          {match[1]}
        </strong>,
      );
    } else if (match[2] !== undefined && match[3] !== undefined) {
      nodes.push(
        <a
          key={key++}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-atelier underline underline-offset-2 hover:text-atelier-bright break-words"
        >
          {match[2]}
        </a>,
      );
    } else if (match[4] !== undefined) {
      nodes.push(
        <code key={key++} className="font-mono text-[0.85em] bg-black/5 dark:bg-white/10 rounded px-1 py-0.5">
          {match[4]}
        </code>,
      );
    }
    last = INLINE_TOKEN.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const ORDERED_ITEM = /^\s*\d+\.\s+/;
const UNORDERED_ITEM = /^\s*[-*]\s+/;

function MarkdownMessage({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    if (!lines[i].trim()) {
      i++;
      continue;
    }

    const ordered = ORDERED_ITEM.test(lines[i]);
    const unordered = !ordered && UNORDERED_ITEM.test(lines[i]);

    if (ordered || unordered) {
      const itemRe = ordered ? ORDERED_ITEM : UNORDERED_ITEM;
      const items: string[] = [];
      while (i < lines.length && itemRe.test(lines[i])) {
        items.push(lines[i].replace(itemRe, '').trim());
        i++;
      }
      const className = `${ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1 marker:text-gray-400 dark:marker:text-neutral-500`;
      blocks.push(
        ordered ? (
          <ol key={key++} className={className}>
            {items.map((item, idx) => (
              <li key={idx}>{renderInline(item)}</li>
            ))}
          </ol>
        ) : (
          <ul key={key++} className={className}>
            {items.map((item, idx) => (
              <li key={idx}>{renderInline(item)}</li>
            ))}
          </ul>
        ),
      );
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !ORDERED_ITEM.test(lines[i]) && !UNORDERED_ITEM.test(lines[i])) {
      paragraph.push(lines[i].trim());
      i++;
    }
    blocks.push(<p key={key++}>{renderInline(paragraph.join(' '))}</p>);
  }

  return <div className="space-y-2">{blocks}</div>;
}

export function AskAtelierWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stageRef = useRef<HarukaStageHandle | null>(null);
  const recognitionRef = useRef<RecognitionHandle | null>(null);
  const reduceMotion = useReducedMotion();

  const voiceInputAvailable = COMPANION_ENABLED && isSpeechRecognitionAvailable();

  const handleStage = useCallback((handle: HarukaStageHandle | null) => {
    stageRef.current = handle;
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) stageRef.current?.stopSpeaking();
  }, [open]);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function submit() {
    const question = input.trim();
    if (!question || question.length < 3 || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setLoading(true);

    try {
      const res = await fetch('/api/support/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const json = await res.json();
      if (json.success && json.data?.answer) {
        const answer: string = json.data.answer;
        setMessages((prev) => [...prev, { role: 'assistant', text: answer }]);
        if (COMPANION_ENABLED && stageRef.current) {
          stageRef.current.setExpression(emotionFromText(answer));
          stageRef.current.speak(answer);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: json.error || 'Something went wrong.', isError: true },
        ]);
        stageRef.current?.setExpression('apologetic');
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Network error — please try again.', isError: true },
      ]);
      stageRef.current?.setExpression('apologetic');
    } finally {
      setLoading(false);
    }
  }

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = createRecognition({
      onResult: (transcript) => setInput(transcript),
      onEnd: () => setListening(false),
      onError: () => setListening(false),
    });
    if (!recognition) return;
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const canSend = input.trim().length >= 3 && !loading;

  return (
    <div className="fixed bottom-20 right-5 md:bottom-16 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-[360px] max-w-[calc(100vw-2.5rem)] rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-black-soft shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: '70vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-black-light flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-atelier" aria-hidden="true">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </span>
                <span className="font-display font-semibold text-sm text-black dark:text-white">Ask Atelier</span>
              </div>
              <div className="flex items-center gap-1">
                {COMPANION_ENABLED && (
                  <button
                    type="button"
                    onClick={() => {
                      setVoiceEnabled((v) => {
                        if (v) stageRef.current?.stopSpeaking();
                        return !v;
                      });
                    }}
                    aria-label={voiceEnabled ? 'Mute voice' : 'Unmute voice'}
                    aria-pressed={voiceEnabled}
                    className="text-gray-400 dark:text-neutral-500 hover:text-black dark:hover:text-white transition-colors"
                  >
                    {voiceEnabled ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                      </svg>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close support chat"
                  className="text-gray-400 dark:text-neutral-500 hover:text-black dark:hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {COMPANION_ENABLED && (
              <div className="flex-shrink-0 flex justify-center py-3 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/60 dark:bg-black-light/40">
                <HarukaStage voiceEnabled={voiceEnabled} onHandle={handleStage} />
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="pt-4 text-center space-y-1.5">
                  <p className="text-xs text-gray-400 dark:text-neutral-500 font-mono">
                    Ask anything about Atelier.
                  </p>
                  <a
                    href="https://usepod.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-[10px] font-mono text-gray-300 dark:text-neutral-700 hover:text-gray-400 dark:hover:text-neutral-500 transition-colors"
                  >
                    Powered by usepod.ai
                  </a>
                </div>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-atelier text-white whitespace-pre-wrap'
                        : msg.isError
                        ? 'bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 font-mono text-xs'
                        : 'bg-gray-100 dark:bg-black-light text-gray-900 dark:text-white'
                    }`}
                  >
                    {msg.role === 'assistant' && !msg.isError ? (
                      <MarkdownMessage text={msg.text} />
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-black-light rounded-lg">
                    <TypingIndicator />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 border-t border-gray-100 dark:border-neutral-800 px-3 py-2.5 flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Type a question..."
                rows={1}
                maxLength={500}
                disabled={loading}
                className="flex-1 resize-none bg-transparent text-sm text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 outline-none font-sans leading-relaxed py-1 max-h-28 overflow-y-auto disabled:opacity-50"
                style={{ fieldSizing: 'content' } as React.CSSProperties}
              />
              {voiceInputAvailable && (
                <button
                  type="button"
                  onClick={toggleMic}
                  aria-label={listening ? 'Stop voice input' : 'Start voice input'}
                  aria-pressed={listening}
                  className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    listening
                      ? 'bg-atelier text-white animate-pulse'
                      : 'bg-gray-100 dark:bg-black-light text-gray-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={!canSend}
                aria-label="Send"
                className="flex-shrink-0 w-8 h-8 rounded-lg bg-atelier text-white flex items-center justify-center transition-colors hover:bg-atelier-bright disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <div className="relative" style={{ width: 52, height: 52 }}>
        <AnimatePresence>
          {!open && !reduceMotion && (
            <motion.span
              key="halo"
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-atelier-bright"
              initial={{ opacity: 0.45, scale: 1 }}
              animate={{ opacity: 0, scale: 1.7 }}
              exit={{ opacity: 0, scale: 1 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close support chat' : 'Open support chat'}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          animate={!open && !reduceMotion ? { y: [0, -5, 0] } : { y: 0 }}
          transition={
            !open && !reduceMotion
              ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }
              : { type: 'spring', stiffness: 500, damping: 30 }
          }
          className="relative w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-atelier-bright to-atelier text-white flex items-center justify-center ring-1 ring-white/20 shadow-lg shadow-atelier/40 transition-[filter,box-shadow] hover:brightness-110 hover:shadow-xl hover:shadow-atelier/50"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent"
          />
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.span
                key="close"
                className="relative"
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 90 }}
                transition={{ duration: 0.15 }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </motion.span>
            ) : (
              <motion.span
                key="open"
                className="relative"
                initial={{ opacity: 0, rotate: 90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: -90 }}
                transition={{ duration: 0.15 }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}
