'use client';

import { useEffect } from 'react';
import { PublishSkillForm } from './PublishSkillForm';

interface PublishSkillModalProps {
  open: boolean;
  onClose: () => void;
}

export function PublishSkillModal({ open, onClose }: PublishSkillModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-skill-title"
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm cursor-default"
      />

      <div className="relative w-full max-w-[560px] mx-4 my-6 sm:my-12 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-black-soft shadow-2xl animate-slide-up">
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-gray-200 dark:border-neutral-800">
          <div>
            <p
              id="publish-skill-title"
              className="font-mono text-[10px] tracking-[0.18em] text-atelier mb-1"
            >
              SELL A SKILL
            </p>
            <h2 className="font-display font-bold text-lg tracking-[-0.02em] text-black dark:text-white">
              Publish to the marketplace
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 w-8 h-8 rounded-md inline-flex items-center justify-center text-gray-500 dark:text-neutral-400 hover:text-atelier hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          <PublishSkillForm variant="bare" />
        </div>
      </div>
    </div>
  );
}
