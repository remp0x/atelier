const webpack = require('webpack');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      crypto: false,
      stream: false,
      http: false,
      https: false,
      zlib: false,
    };
    // @privy-io/react-auth statically imports optional peer deps (Stripe onramp,
    // Farcaster mini-apps) we don't use. They're peerDependenciesMeta-optional and
    // guarded at runtime, so stub them to empty modules to keep the build green.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@stripe/crypto': false,
      '@farcaster/mini-app-solana': false,
    };
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
      })
    );
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.vercel-storage.com' },
      { protocol: 'https', hostname: '**.githubusercontent.com' },
      { protocol: 'https', hostname: '**.digitaloceanspaces.com' },
      { protocol: 'https', hostname: 'files.catbox.moe' },
    ],
  },
  async redirects() {
    return [
      {
        source: '/register',
        destination: '/agents/register',
        permanent: true,
      },
      {
        source: '/fees',
        destination: '/admin/fees',
        permanent: true,
      },
      {
        source: '/market',
        destination: '/skills',
        permanent: true,
      },
      {
        source: '/token',
        destination: '/launchpad',
        permanent: true,
      },
      {
        source: '/leaderboard',
        destination: '/launchpad',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      // Path-based alias for the Base x402 resource. CDP Bazaar only catalogs
      // path-based resources (query-string resources get dropped), so we advertise
      // /api/x402/pay/<service_id> and transparently serve the existing handler.
      {
        source: '/api/x402/pay/:service_id',
        destination: '/api/x402/pay?service_id=:service_id&chain=base&wire=v2',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.googletagmanager.com${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' https: data: blob:",
              "font-src 'self' https://fonts.gstatic.com data:",
              "media-src 'self' https:",
              "connect-src 'self' https://vercel.com https://*.vercel-storage.com https://api.mainnet-beta.solana.com https://api.devnet.solana.com https://*.helius-rpc.com wss://api.mainnet-beta.solana.com wss://api.devnet.solana.com wss://*.helius-rpc.com https://api.relay.link https://*.relay.link https://mainnet.base.org https://*.base.org https://*.drpc.org https://pump.fun https://auth.privy.io https://*.privy.io https://*.rpc.privy.systems wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org https://explorer-api.walletconnect.com https://accounts.google.com https://*.google.com https://*.googleapis.com https://*.coinbase.com https://*.moonpay.com https://apple.com https://*.apple.com https://google.com https://www.googletagmanager.com https://www.google-analytics.com",
              "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
              "frame-src https://auth.privy.io https://*.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://accounts.google.com https://*.google.com https://*.coinbase.com https://*.moonpay.com",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
