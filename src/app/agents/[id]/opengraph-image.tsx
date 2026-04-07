import { ImageResponse } from 'next/og';
import { resolveAgent, getServicesByAgent } from '@/lib/atelier-db';

export const runtime = 'nodejs';
export const alt = 'Atelier AI Agent';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await resolveAgent(id);

  if (!agent) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0a0a0a',
            color: '#ffffff',
            fontSize: 48,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          Agent Not Found
        </div>
      ),
      { ...size }
    );
  }

  const services = await getServicesByAgent(agent.id);
  const prices = services.map((s) => parseFloat(s.price_usd)).filter((p) => !isNaN(p));
  const priceRange = prices.length > 0
    ? prices.length === 1
      ? `$${prices[0]}`
      : `From $${Math.min(...prices)}`
    : null;

  const [interBold, interRegular] = await Promise.all([
    fetch(new URL('https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcviYwYZ90RuPQ.ttf')).then((r) => r.arrayBuffer()),
    fetch(new URL('https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcviYwY.ttf')).then((r) => r.arrayBuffer()),
  ]);

  const description = agent.description
    ? agent.description.length > 120
      ? agent.description.slice(0, 117) + '...'
      : agent.description
    : 'AI Agent on Atelier';

  const rating = agent.avg_rating ? agent.avg_rating.toFixed(1) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0a0a0a',
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Purple gradient accent - top edge */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: 'linear-gradient(90deg, #7C3AED, #A78BFA, #8B5CF6)',
            display: 'flex',
          }}
        />

        {/* Subtle glow behind avatar area */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            right: -100,
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Header: Logo + branding */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '36px 48px 0 48px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Atelier logo mark */}
            <svg width="40" height="36" viewBox="0 0 1152 1043" fill="none">
              <rect x="107" y="17" width="1010" height="1010" rx="123" fill="#8B5CF6" />
              <polygon points="607,151 228,877 331,877 974,156 717,353 607,151" fill="white" />
              <polygon points="494,773 771,461 993,877 819,877 700,646 494,773" fill="white" />
            </svg>
            <span style={{ color: '#ffffff', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Atelier
            </span>
          </div>
          <span style={{ color: '#666666', fontSize: 18, fontFamily: 'monospace' }}>
            atelierai.xyz
          </span>
        </div>

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            padding: '40px 48px',
            gap: 40,
            alignItems: 'center',
          }}
        >
          {/* Agent avatar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {agent.avatar_url ? (
              <img
                src={agent.avatar_url}
                width={180}
                height={180}
                style={{
                  borderRadius: '50%',
                  border: '3px solid #333333',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                style={{
                  width: 180,
                  height: 180,
                  borderRadius: '50%',
                  border: '3px solid #333333',
                  backgroundColor: '#1a1a1a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 72,
                  color: '#8B5CF6',
                  fontWeight: 700,
                }}
              >
                {agent.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Agent info */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              gap: 12,
              minWidth: 0,
            }}
          >
            {/* Name + verified */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  color: '#ffffff',
                  fontSize: 44,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                }}
              >
                {agent.name.length > 28 ? agent.name.slice(0, 25) + '...' : agent.name}
              </span>
              {agent.verified === 1 && (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#8B5CF6">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#8B5CF6" strokeWidth="2" fill="none" />
                  <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2" fill="none" />
                </svg>
              )}
            </div>

            {/* Description */}
            <span
              style={{
                color: '#999999',
                fontSize: 22,
                lineHeight: 1.4,
              }}
            >
              {description}
            </span>

            {/* Stats row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 8 }}>
              {rating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="#8B5CF6">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span style={{ color: '#ffffff', fontSize: 20, fontWeight: 600 }}>{rating}</span>
                </div>
              )}
              {agent.completed_orders > 0 && (
                <span style={{ color: '#666666', fontSize: 18, fontFamily: 'monospace' }}>
                  {agent.completed_orders} order{agent.completed_orders !== 1 ? 's' : ''} completed
                </span>
              )}
              {priceRange && (
                <span style={{ color: '#A78BFA', fontSize: 18, fontWeight: 600, fontFamily: 'monospace' }}>
                  {priceRange}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 48px 32px 48px',
          }}
        >
          <span style={{ color: '#444444', fontSize: 16 }}>
            AI Agent Marketplace
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ color: '#666666', fontSize: 16, fontFamily: 'monospace' }}>
              @useAtelier
            </span>
            <span style={{ color: '#444444', fontSize: 16 }}>
              t.me/atelierai
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Inter', data: interBold, weight: 700 as const, style: 'normal' as const },
        { name: 'Inter', data: interRegular, weight: 400 as const, style: 'normal' as const },
      ],
    }
  );
}
