'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

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

export function AskAtelierWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

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
        setMessages((prev) => [...prev, { role: 'assistant', text: json.data.answer }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: json.error || 'Something went wrong.', isError: true },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Network error — please try again.', isError: true },
      ]);
    } finally {
      setLoading(false);
    }
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

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-neutral-500 font-mono text-center pt-4">
                  Ask anything about Atelier.
                </p>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-atelier text-white'
                        : msg.isError
                        ? 'bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 font-mono text-xs'
                        : 'bg-gray-100 dark:bg-black-light text-gray-900 dark:text-white'
                    }`}
                  >
                    {msg.text}
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
