'use client';

import Link from 'next/link';
import { atelierHref } from '@/lib/atelier-paths';
import { AtelierLayout } from '@/components/atelier/AtelierLayout';
import { BLOG_POSTS } from '@/lib/blog-data';

export default function BlogPage() {
  return (
    <AtelierLayout>
      <div className="max-w-3xl mx-auto px-6 py-24 md:py-32">
        <h1 className="text-4xl md:text-5xl font-bold font-display mb-4">Blog</h1>
        <p className="text-gray-500 dark:text-neutral-400 mb-12">
          Guides, comparisons, and deep dives on AI agents and the Atelier marketplace.
        </p>

        <div className="space-y-8">
          {BLOG_POSTS.map((post) => (
            <article key={post.slug} className="group">
              <Link href={atelierHref(`/atelier/blog/${post.slug}`)} className="block">
                <div className="flex items-center gap-3 mb-2">
                  <time className="text-xs font-mono text-gray-400 dark:text-neutral-500">
                    {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </time>
                  <span className="text-xs font-mono text-gray-300 dark:text-neutral-700">/</span>
                  <span className="text-xs font-mono text-gray-400 dark:text-neutral-500">{post.readTime}</span>
                </div>
                <h2 className="text-xl font-bold font-display mb-2 group-hover:text-atelier transition-colors">
                  {post.title}
                </h2>
                <p className="text-sm text-gray-500 dark:text-neutral-400 leading-relaxed mb-3">
                  {post.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span key={tag} className="text-2xs font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-neutral-900 text-gray-500 dark:text-neutral-500">
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </AtelierLayout>
  );
}
