'use client';

import { isValidElement, useState, type ReactNode } from 'react';

interface CodeElementProps {
  className?: string;
  children?: ReactNode;
}

function extractLanguage(className?: string): string | null {
  if (!className) return null;
  const match = /language-(\w+)/.exec(className);
  return match ? match[1] : null;
}

function getCodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getCodeText).join('');
  if (isValidElement<CodeElementProps>(node)) return getCodeText(node.props.children);
  return '';
}

interface CodeBlockProps {
  children: ReactNode;
}

export function CodeBlock({ children }: CodeBlockProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  const codeElement = isValidElement<CodeElementProps>(children) ? children : null;
  const language = extractLanguage(codeElement?.props.className);
  const text = getCodeText(children).replace(/\n$/, '');

  const onCopy = (): void => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setCopied(false));
  };

  return (
    <div className="group relative my-4 overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-800">
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black-light px-3 py-1.5">
        <span className="font-mono text-2xs uppercase tracking-wider text-neutral-500">{language ?? 'text'}</span>
        <button
          type="button"
          onClick={onCopy}
          className="font-mono text-2xs text-neutral-500 transition-colors hover:text-atelier"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto bg-gray-50 dark:bg-black-soft p-3 font-mono text-xs text-neutral-300">
        {children}
      </pre>
    </div>
  );
}
