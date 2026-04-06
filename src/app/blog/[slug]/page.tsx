'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { atelierHref } from '@/lib/atelier-paths';
import { AtelierLayout } from '@/components/atelier/AtelierLayout';
import { getPostBySlug } from '@/lib/blog-data';

function renderBold(text: string): string {
  return text.replace(
    /\*\*(.+?)\*\*/g,
    '<strong class="text-black dark:text-white font-medium">$1</strong>',
  );
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const post = getPostBySlug(slug);

  if (!post) {
    return (
      <AtelierLayout>
        <div className="max-w-3xl mx-auto px-6 py-24 md:py-32 text-center">
          <h1 className="text-4xl font-bold font-display mb-4">Post not found</h1>
          <Link href={atelierHref('/atelier/blog')} className="text-sm font-mono text-atelier hover:text-atelier-bright transition-colors">
            Back to blog
          </Link>
        </div>
      </AtelierLayout>
    );
  }

  return (
    <AtelierLayout>
      <article className="max-w-3xl mx-auto px-6 py-24 md:py-32">
        <div className="mb-10">
          <Link
            href={atelierHref('/atelier/blog')}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-gray-400 dark:text-neutral-500 hover:text-atelier transition-colors mb-6"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Blog
          </Link>

          <div className="flex items-center gap-3 mb-4">
            <time className="text-xs font-mono text-gray-400 dark:text-neutral-500">
              {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </time>
            <span className="text-xs font-mono text-gray-300 dark:text-neutral-700">/</span>
            <span className="text-xs font-mono text-gray-400 dark:text-neutral-500">{post.readTime}</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold font-display leading-tight mb-4">
            {post.title}
          </h1>

          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span key={tag} className="text-2xs font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-neutral-900 text-gray-500 dark:text-neutral-500">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-10">
          {post.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-bold font-display mb-4">{section.heading}</h2>
              <div className="space-y-4 text-gray-600 dark:text-neutral-400 leading-relaxed">
                {section.body.split('\n\n').map((para, i) => {
                  if (para.startsWith('- ') || para.startsWith('1. ')) {
                    const items = para.split('\n').filter(Boolean);
                    return (
                      <ul key={i} className="space-y-2 pl-1">
                        {items.map((item, j) => {
                          const isNumbered = /^\d+\./.test(item);
                          const prefix = isNumbered ? item.match(/^\d+\./)?.[0] ?? '' : '\u2022';
                          const content = isNumbered ? item.replace(/^\d+\.\s*/, '') : item.replace(/^-\s*/, '');
                          return (
                            <li key={j} className="flex gap-2">
                              <span className="text-atelier/50 shrink-0 mt-0.5">{prefix}</span>
                              <span dangerouslySetInnerHTML={{ __html: renderBold(content) }} />
                            </li>
                          );
                        })}
                      </ul>
                    );
                  }

                  return (
                    <p key={i} dangerouslySetInnerHTML={{ __html: renderBold(para) }} />
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-gray-200 dark:border-neutral-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <Link
              href={atelierHref('/atelier/blog')}
              className="inline-flex items-center gap-1.5 text-sm font-mono text-atelier hover:text-atelier-bright transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              All posts
            </Link>
            <Link
              href={atelierHref('/atelier/agents')}
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-atelier/60 text-atelier text-sm font-medium rounded transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier"
            >
              Browse Agents
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </article>
    </AtelierLayout>
  );
}
