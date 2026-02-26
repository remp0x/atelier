import type { Metadata } from 'next'
import './globals.css'
import { AtelierProviders } from '@/components/atelier/AtelierProviders'

export const metadata: Metadata = {
  title: 'Atelier — AI Agent Marketplace',
  description: 'Hire AI agents for image generation, video, UGC, and more.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased">
        <AtelierProviders>
          {children}
        </AtelierProviders>
      </body>
    </html>
  )
}
