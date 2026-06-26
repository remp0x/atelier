import { ImageResponse } from 'next/og';
import { resolveServiceByAgentSlug } from '@/lib/atelier-db';
import { CATEGORY_LABELS } from '@/components/atelier/constants';

export const dynamic = 'force-dynamic';

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function formatPrice(priceType: string, priceUsd: string): string {
  if (priceType === 'fixed') return `$${priceUsd}`;
  if (priceType === 'weekly') return `$${priceUsd}/wk`;
  if (priceType === 'monthly') return `$${priceUsd}/mo`;
  return 'Get Quote';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentSlug = searchParams.get('agent');
  const serviceSlug = searchParams.get('service');

  if (!agentSlug || !serviceSlug) {
    return new Response('Missing agent or service param', { status: 400 });
  }

  try {
    const service = await resolveServiceByAgentSlug(agentSlug, serviceSlug);

    if (!service) {
      return new Response('Service not found', { status: 404 });
    }

    const baseUrl = getBaseUrl(request);
    const category = CATEGORY_LABELS[service.category] || 'Service';
    const price = formatPrice(service.price_type, service.price_usd);
    const rating = service.avg_rating ? service.avg_rating.toFixed(1) : null;
    const description = service.description
      ? service.description.length > 130
        ? service.description.slice(0, 127) + '...'
        : service.description
      : 'AI service on Atelier';

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'sans-serif',
            position: 'relative',
          }}
        >
          {/* Background image */}
          <img
            src={`${baseUrl}/og_atelier.jpg`}
            width={1200}
            height={630}
            style={{ position: 'absolute', top: 0, left: 0 }}
          />

          {/* Header: Logo + branding */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '36px 48px 0 48px',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={`${baseUrl}/og-logo.png`} width={36} height={36} />
              <span style={{ color: '#ffffff', fontSize: 28, fontWeight: 700 }}>Atelier</span>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18 }}>useatelier.ai</span>
          </div>

          {/* Main content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              padding: '40px 48px',
              gap: 18,
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            {/* Category pill */}
            <div style={{ display: 'flex' }}>
              <span
                style={{
                  backgroundColor: 'rgba(250,76,20,0.85)',
                  color: '#ffffff',
                  fontSize: 18,
                  fontWeight: 700,
                  padding: '6px 16px',
                  borderRadius: 16,
                  display: 'flex',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                {category}
              </span>
            </div>

            {/* Service title */}
            <span style={{ color: '#ffffff', fontSize: 54, fontWeight: 700, lineHeight: 1.1 }}>
              {service.title.length > 60 ? service.title.slice(0, 57) + '...' : service.title}
            </span>

            {/* Description */}
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 24, lineHeight: 1.3 }}>
              {description}
            </span>

            {/* Agent + stats row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {service.agent_avatar_url ? (
                  <img
                    src={service.agent_avatar_url}
                    width={48}
                    height={48}
                    style={{ borderRadius: 24, border: '2px solid rgba(255,255,255,0.15)' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: 'rgba(0,0,0,0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      color: '#ff7a3d',
                      fontWeight: 700,
                    }}
                  >
                    {(service.agent_name || 'A').charAt(0).toUpperCase()}
                  </div>
                )}
                <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 22, fontWeight: 600 }}>
                  {service.agent_name || 'Atelier'}
                </span>
              </div>

              {rating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 16, height: 16, backgroundColor: '#ff7a3d', borderRadius: 8, display: 'flex' }} />
                  <span style={{ color: '#ffffff', fontSize: 20, fontWeight: 600 }}>{rating}</span>
                </div>
              )}

              <span style={{ color: '#ffb199', fontSize: 24, fontWeight: 700 }}>{price}</span>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 48px 32px 48px',
              position: 'relative',
            }}
          >
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>AI Agent Marketplace</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>@useAtelier</span>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>t.me/atelierai</span>
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
