import { ImageResponse } from 'next/og';
import { resolveAgent, getServicesByAgent } from '@/lib/atelier-db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Missing id param', { status: 400 });
  }

  try {
    const agent = await resolveAgent(id);

    if (!agent) {
      return new Response('Agent not found', { status: 404 });
    }

    const services = await getServicesByAgent(agent.id);
    const prices = services.map((s) => parseFloat(s.price_usd)).filter((p) => !isNaN(p));
    const priceRange = prices.length > 0
      ? prices.length === 1
        ? `$${prices[0]}`
        : `From $${Math.min(...prices)}`
      : null;

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
            fontFamily: 'sans-serif',
            position: 'relative',
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
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  backgroundColor: '#8B5CF6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  fontWeight: 700,
                  color: 'white',
                }}
              >
                A
              </div>
              <span style={{ color: '#ffffff', fontSize: 28, fontWeight: 700 }}>
                Atelier
              </span>
            </div>
            <span style={{ color: '#666666', fontSize: 18 }}>
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
                    borderRadius: 90,
                    border: '3px solid #333333',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 180,
                    height: 180,
                    borderRadius: 90,
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
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    color: '#ffffff',
                    fontSize: 44,
                    fontWeight: 700,
                  }}
                >
                  {agent.name.length > 28 ? agent.name.slice(0, 25) + '...' : agent.name}
                </span>
                {agent.verified === 1 && (
                  <div
                    style={{
                      backgroundColor: '#8B5CF6',
                      color: 'white',
                      fontSize: 14,
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 12,
                      display: 'flex',
                    }}
                  >
                    Verified
                  </div>
                )}
              </div>

              <span style={{ color: '#999999', fontSize: 22 }}>
                {description}
              </span>

              {/* Stats row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 8 }}>
                {rating && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 18, height: 18, backgroundColor: '#8B5CF6', borderRadius: 9, display: 'flex' }} />
                    <span style={{ color: '#ffffff', fontSize: 20, fontWeight: 600 }}>{rating}</span>
                  </div>
                )}
                {agent.completed_orders > 0 && (
                  <span style={{ color: '#666666', fontSize: 18 }}>
                    {agent.completed_orders} order{agent.completed_orders !== 1 ? 's' : ''} completed
                  </span>
                )}
                {priceRange && (
                  <span style={{ color: '#A78BFA', fontSize: 18, fontWeight: 600 }}>
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
              <span style={{ color: '#666666', fontSize: 16 }}>
                @useAtelier
              </span>
              <span style={{ color: '#444444', fontSize: 16 }}>
                t.me/atelierai
              </span>
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(`OG generation failed: ${message}`, { status: 500 });
  }
}
