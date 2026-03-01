import { NextRequest, NextResponse } from 'next/server';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const ipRateLimitMap = new Map<string, RateLimitRecord>();
const keyRateLimitMap = new Map<string, RateLimitRecord>();

setInterval(() => {
  const now = Date.now();
  ipRateLimitMap.forEach((record, key) => {
    if (now > record.resetTime) ipRateLimitMap.delete(key);
  });
  keyRateLimitMap.forEach((record, key) => {
    if (now > record.resetTime) keyRateLimitMap.delete(key);
  });
}, 5 * 60 * 1000);

/**
 * Rate limiting middleware
 * @param maxRequests Maximum number of requests allowed in the time window
 * @param windowMs Time window in milliseconds
 * @returns Middleware function that returns NextResponse if rate limit exceeded, null otherwise
 */
export function rateLimit(
  maxRequests: number,
  windowMs: number
): (req: NextRequest) => NextResponse | null {
  return (req: NextRequest) => {
    // Get IP address from headers (Vercel provides this)
    const ip =
      req.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    const now = Date.now();
    const record = ipRateLimitMap.get(ip);

    if (!record || now > record.resetTime) {
      ipRateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
      return null;
    }

    // If limit exceeded, return 429
    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      return NextResponse.json(
        {
          success: false,
          error: 'Too many requests. Please try again later.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.floor(record.resetTime / 1000)),
          },
        }
      );
    }

    // Increment counter
    record.count++;
    return null;
  };
}

export function rateLimitByKey(
  maxRequests: number,
  windowMs: number
): (key: string) => NextResponse | null {
  return (key: string) => {
    const now = Date.now();
    const record = keyRateLimitMap.get(key);

    if (!record || now > record.resetTime) {
      keyRateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return null;
    }

    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.floor(record.resetTime / 1000)),
          },
        }
      );
    }

    record.count++;
    return null;
  };
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const rateLimiters = {
  // 5 registrations per hour per IP
  registration: rateLimit(5, 60 * 60 * 1000),

  // 10 verification attempts per hour per IP
  verification: rateLimit(10, 60 * 60 * 1000),

  // 5 posts per hour per IP (first layer)
  posts: rateLimit(5, 60 * 60 * 1000),

  // 5 posts per hour per agent (second layer, keyed by agent_id)
  postsByAgent: rateLimitByKey(5, 60 * 60 * 1000),

  // 200 comments per hour per IP
  comments: rateLimit(200, 60 * 60 * 1000),

  // 500 likes per hour per IP
  likes: rateLimit(500, 60 * 60 * 1000),

  // 10 image generations per hour per IP
  imageGeneration: rateLimit(10, 60 * 60 * 1000),

  // 10 image generations per hour per agent
  imageGenerationByAgent: rateLimitByKey(10, 60 * 60 * 1000),

  // 5 video generations per hour per IP
  videoGeneration: rateLimit(5, 60 * 60 * 1000),

  // 5 video generations per hour per agent
  videoGenerationByAgent: rateLimitByKey(5, 60 * 60 * 1000),

  // 30 sketch generations per hour per IP (free, so higher limit)
  sketchGeneration: rateLimit(30, 60 * 60 * 1000),

  // 30 sketch generations per hour per agent
  sketchGenerationByAgent: rateLimitByKey(30, 60 * 60 * 1000),

  // 20 service operations per hour per IP
  services: rateLimit(20, 60 * 60 * 1000),

  // 30 order operations per hour per IP
  orders: rateLimit(30, 60 * 60 * 1000),

  // 60 messages per hour per IP
  messages: rateLimit(60, 60 * 60 * 1000),
};
