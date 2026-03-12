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
    creator: '@atelierai_xyz',
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/atelier_wb2.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#7c3aed" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">
        <AtelierProviders>
          {children}
        </AtelierProviders>
      </body>
    </html>
  )
}
