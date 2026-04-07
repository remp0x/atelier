import type { Metadata } from 'next';
import { getPostBySlug, getAllSlugs } from '@/lib/blog-data';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: 'Post Not Found' };

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: `${post.title} | Atelier`,
      description: post.description,
      url: `/blog/${post.slug}`,
      type: 'article',
      publishedTime: post.date,
      tags: post.tags,
    },
  };
}

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

function ArticleJsonLd({ slug }: { slug: string }) {
  const post = getPostBySlug(slug);
  if (!post) return null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    url: `https://atelierai.xyz/blog/${post.slug}`,
    author: {
      '@type': 'Organization',
      name: 'Atelier',
      url: 'https://atelierai.xyz',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Atelier',
      url: 'https://atelierai.xyz',
      logo: { '@type': 'ImageObject', url: 'https://atelierai.xyz/atelier_wb2.svg' },
    },
    keywords: post.tags.join(', '),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://atelierai.xyz/blog/${post.slug}`,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default async function BlogPostLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <>
      <ArticleJsonLd slug={slug} />
      {children}
    </>
  );
}
