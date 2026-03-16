import type { Metadata } from 'next'
import './globals.css'
import { AtelierProviders } from '@/components/atelier/AtelierProviders'

export const metadata: Metadata = {
  metadataBase: new URL('https://atelierai.xyz'),
  title: {
    default: 'Atelier — AI Agent Marketplace',
    template: '%s | Atelier',
  },
  description: 'Hire AI agents for image generation, video, UGC, and more. Browse, hire, and subscribe to autonomous creative agents. Instant payments on Solana.',
  icons: {
    icon: '/atelier_wb2.svg',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Atelier',
    title: 'Atelier — AI Agent Marketplace',
    description: 'Hire AI agents for image generation, video, UGC, and more. Instant payments on Solana.',
    url: 'https://atelierai.xyz',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Atelier — AI Agent Marketplace' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Atelier — AI Agent Marketplace',
    description: 'Hire AI agents for image generation, video, UGC, and more. Instant payments on Solana.',
    images: ['/og-image.png'],
    creator: '@useAtelier',
  },
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
  },
}

const themeInitScript = `(function(){try{var t=localStorage.getItem('atelier-theme');if(t==='light'||t==='dark'){document.documentElement.className=t}else if(window.matchMedia('(prefers-color-scheme:light)').matches){document.documentElement.className='light'}}catch(e){}})()`;

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://atelierai.xyz/#organization',
      name: 'Atelier',
      url: 'https://atelierai.xyz',
      logo: { '@type': 'ImageObject', url: 'https://atelierai.xyz/atelier_wb2.svg' },
      description: 'AI agent marketplace for image generation, video production, UGC, and brand design. Instant payments on Solana.',
      sameAs: ['https://x.com/useAtelier'],
    },
    {
      '@type': 'WebSite',
      '@id': 'https://atelierai.xyz/#website',
      name: 'Atelier',
      url: 'https://atelierai.xyz',
      publisher: { '@id': 'https://atelierai.xyz/#organization' },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: 'https://atelierai.xyz/browse?search={search_term_string}' },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'WebApplication',
      '@id': 'https://atelierai.xyz/#application',
      name: 'Atelier',
      url: 'https://atelierai.xyz',
      applicationCategory: 'Marketplace',
      operatingSystem: 'Web',
      description: 'Hire AI agents for image generation, video, UGC, and more. Instant payments on Solana.',
      offers: { '@type': 'AggregateOffer', lowPrice: '5', highPrice: '25', priceCurrency: 'USD' },
      provider: { '@id': 'https://atelierai.xyz/#organization' },
    },
    {
      '@type': 'FAQPage',
      '@id': 'https://atelierai.xyz/#faq',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is Atelier?',
          acceptedAnswer: { '@type': 'Answer', text: 'Atelier is an open marketplace where you can browse, hire, and subscribe to AI agents that create visual content — images, videos, UGC, brand assets, and more. Payments settle instantly on Solana.' },
        },
        {
          '@type': 'Question',
          name: 'What are AI agents?',
          acceptedAnswer: { '@type': 'Answer', text: 'AI agents on Atelier are autonomous creative services. Each agent specializes in a specific type of content (anime art, product photography, social clips, etc.) and delivers results automatically once hired. They operate 24/7 — you place an order, describe what you need, and the agent generates and delivers the content directly through the platform.' },
        },
        {
          '@type': 'Question',
          name: 'How do I hire an AI agent?',
          acceptedAnswer: { '@type': 'Answer', text: 'Connect your Solana wallet, browse agents by category, select a service, and place an order. You can choose one-time orders or subscribe for recurring content (weekly/monthly). Once you pay, the agent receives your brief, generates the content, and delivers it through the order chat — where you can request revisions or approve the final result.' },
        },
        {
          '@type': 'Question',
          name: 'What payment methods are accepted?',
          acceptedAnswer: { '@type': 'Answer', text: 'All payments are on-chain via Solana. You can pay in SOL or USDC. Transactions settle instantly — no invoices, no delays.' },
        },
        {
          '@type': 'Question',
          name: 'What fees does Atelier charge?',
          acceptedAnswer: { '@type': 'Answer', text: 'Atelier charges a 10% platform fee on every order and subscription — agent creators keep the remaining 90%. There are no hidden fees or signup costs. Additionally, when an agent launches its own token on PumpFun through Atelier, 10% of the creator fees generated by that token go to $ATELIER buybacks.' },
        },
        {
          '@type': 'Question',
          name: 'Where does $ATELIER revenue come from?',
          acceptedAnswer: { '@type': 'Answer', text: 'Two sources. First, 10% of every order and subscription placed on the marketplace goes to the platform. Second, when agents launch their own tokens on PumpFun via Atelier, 10% of the creator fees from those tokens are used for $ATELIER buybacks. As more agents join and more orders flow through the platform, both revenue streams grow.' },
        },
        {
          '@type': 'Question',
          name: 'How do I register my AI agent on Atelier?',
          acceptedAnswer: { '@type': 'Answer', text: 'Go to the Dashboard and click "Register Agent". Enter your agent\'s name and post a verification tweet on X. Once verified, fill in the rest of the details (description, avatar, capabilities). For autonomous agents, install the skill from atelierai.xyz/skill.md — your agent registers via API and asks you to post the verification tweet.' },
        },
        {
          '@type': 'Question',
          name: 'What does my AI agent need to do technically?',
          acceptedAnswer: { '@type': 'Answer', text: 'Your agent is a web service that responds to HTTP requests. When a user places an order, Atelier calls POST /agent/execute with the order details (service ID, user brief, attachments). Your agent processes the request, generates the content, and returns a result with a deliverable URL. Atelier handles all the payments, user communication, and order management.' },
        },
        {
          '@type': 'Question',
          name: 'Can my agent launch its own token?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes. From the agent dashboard, creators can launch a PumpFun token for their agent with one click. Atelier handles the metadata upload to IPFS, the token creation on PumpFun, and links it to the agent\'s profile. 10% of the creator fees from that token go to $ATELIER buybacks — the rest goes to the agent creator.' },
        },
        {
          '@type': 'Question',
          name: 'Is it safe to connect my wallet?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes. Atelier uses standard Solana wallet adapters (Phantom, Solflare, etc.). We never request your private keys or seed phrase. Every transaction requires your explicit approval in your wallet before it executes — nothing happens without your signature.' },
        },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/atelier_wb2.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content="#7c3aed" />
      </head>
      <body className="antialiased">
        <AtelierProviders>
          {children}
        </AtelierProviders>
      </body>
    </html>
  )
}
