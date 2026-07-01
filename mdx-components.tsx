import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';
import {
  isValidElement,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type OlHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';
import { ApiMethod } from '@/app/docs/_components/ApiMethod';
import { Callout } from '@/app/docs/_components/Callout';
import { Card } from '@/app/docs/_components/Card';
import { CardGrid } from '@/app/docs/_components/CardGrid';
import { CodeBlock } from '@/app/docs/_components/CodeBlock';
import { ParamTable } from '@/app/docs/_components/ParamTable';
import { StatusBadge } from '@/app/docs/_components/StatusBadge';
import { Step, Steps } from '@/app/docs/_components/Steps';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

interface NodeWithChildren {
  children?: ReactNode;
}

function getNodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join('');
  if (isValidElement<NodeWithChildren>(node)) return getNodeText(node.props.children);
  return '';
}

type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

function makeHeading(level: HeadingLevel, className: string) {
  return function Heading({ children, id, ...props }: HTMLAttributes<HTMLHeadingElement>): ReactElement {
    const resolvedId = id ?? slugify(getNodeText(children));
    const Tag = level;
    return (
      <Tag id={resolvedId} className={`${className} scroll-mt-24`} {...props}>
        {children}
      </Tag>
    );
  };
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: makeHeading('h1', 'font-display text-3xl sm:text-4xl font-bold text-black dark:text-white mt-0 mb-4'),
    h2: makeHeading(
      'h2',
      'font-display text-2xl font-bold text-black dark:text-white mt-10 mb-4 pb-2 border-b border-gray-200 dark:border-neutral-800'
    ),
    h3: makeHeading('h3', 'font-display text-xl font-semibold text-black dark:text-white mt-8 mb-3'),
    h4: makeHeading('h4', 'font-display text-lg font-semibold text-black dark:text-white mt-6 mb-2'),
    p: (props: HTMLAttributes<HTMLParagraphElement>) => (
      <p className="mb-4 text-sm leading-relaxed text-neutral-400 sm:text-base" {...props} />
    ),
    a: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>): ReactElement => {
      const resolvedHref = href ?? '#';
      const linkClassName = 'text-atelier underline decoration-atelier/30 underline-offset-2 hover:decoration-atelier';
      if (/^https?:\/\//.test(resolvedHref)) {
        return (
          <a href={resolvedHref} target="_blank" rel="noopener noreferrer" className={linkClassName} {...props}>
            {children}
          </a>
        );
      }
      return (
        <Link href={resolvedHref} className={linkClassName} {...props}>
          {children}
        </Link>
      );
    },
    ul: (props: HTMLAttributes<HTMLUListElement>) => (
      <ul className="mb-4 ml-5 list-disc space-y-1.5 text-sm text-neutral-400 marker:text-atelier sm:text-base" {...props} />
    ),
    ol: (props: OlHTMLAttributes<HTMLOListElement>) => (
      <ol className="mb-4 ml-5 list-decimal space-y-1.5 text-sm text-neutral-400 marker:text-atelier sm:text-base" {...props} />
    ),
    li: (props: HTMLAttributes<HTMLLIElement>) => <li className="pl-1" {...props} />,
    strong: (props: HTMLAttributes<HTMLElement>) => (
      <strong className="font-semibold text-black dark:text-white" {...props} />
    ),
    em: (props: HTMLAttributes<HTMLElement>) => <em className="italic text-neutral-400" {...props} />,
    hr: () => <hr className="my-8 border-gray-200 dark:border-neutral-800" />,
    blockquote: (props: HTMLAttributes<HTMLQuoteElement>) => (
      <blockquote className="my-4 border-l-2 border-atelier pl-4 italic text-neutral-400" {...props} />
    ),
    code: ({ className, children, ...props }: HTMLAttributes<HTMLElement>): ReactElement => {
      if (className) {
        return (
          <code className={`${className} font-mono`} {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className="rounded bg-gray-100 dark:bg-neutral-900 px-1.5 py-0.5 font-mono text-[0.85em] text-atelier" {...props}>
          {children}
        </code>
      );
    },
    pre: (props: HTMLAttributes<HTMLPreElement>): ReactElement => <CodeBlock>{props.children}</CodeBlock>,
    table: (props: TableHTMLAttributes<HTMLTableElement>) => (
      <div className="my-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-neutral-800">
        <table className="w-full font-mono text-xs sm:text-sm" {...props} />
      </div>
    ),
    thead: (props: HTMLAttributes<HTMLTableSectionElement>) => (
      <thead className="bg-gray-50 dark:bg-black-soft text-neutral-500" {...props} />
    ),
    th: (props: ThHTMLAttributes<HTMLTableCellElement>) => (
      <th className="px-3 py-2 text-left font-medium" {...props} />
    ),
    td: (props: TdHTMLAttributes<HTMLTableCellElement>) => (
      <td className="border-t border-gray-200 dark:border-neutral-800 px-3 py-2 text-neutral-400" {...props} />
    ),
    Callout,
    Steps,
    Step,
    StatusBadge,
    ApiMethod,
    ParamTable,
    CodeBlock,
    Card,
    CardGrid,
    ...components,
  };
}
