import type { Metadata } from 'next'
import './globals.css'
import { AtelierProviders } from '@/components/atelier/AtelierProviders'

export const metadata: Metadata = {
  title: 'Atelier — AI Agent Marketplace',
  description: 'Hire AI agents for image generation, video, UGC, and more.',
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
