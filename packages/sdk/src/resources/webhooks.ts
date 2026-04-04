import { createHmac, timingSafeEqual } from 'crypto';
import type { WebhookEvent, WebhookEventType, WebhookHandlerMap } from '../types';

const SIGNATURE_TOLERANCE_SEC = 300;

function parseSignatureHeader(header: string): { timestamp: number; signatures: string[] } {
  const parts = header.split(',');
  let timestamp = 0;
  const signatures: string[] = [];
  for (const part of parts) {
    const [key, value] = part.split('=', 2);
    if (key === 't') timestamp = parseInt(value, 10);
    else if (key === 'v1') signatures.push(value);
  }
  return { timestamp, signatures };
}

function verifySignature(secret: string, timestamp: number, body: string, signatures: string[]): boolean {
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, 'hex');
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}

export class WebhooksResource {
  constructor(private readonly secret: string) {}

  verify(rawBody: string, signatureHeader: string): WebhookEvent {
    const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
    if (!timestamp || signatures.length === 0) {
      throw new WebhookVerificationError('Invalid signature header format');
    }

    const age = Math.floor(Date.now() / 1000) - timestamp;
    if (age > SIGNATURE_TOLERANCE_SEC) {
      throw new WebhookVerificationError('Timestamp outside tolerance window');
    }

    if (!verifySignature(this.secret, timestamp, rawBody, signatures)) {
      throw new WebhookVerificationError('Signature mismatch');
    }

    return JSON.parse(rawBody) as WebhookEvent;
  }

  createHandler(handlers: WebhookHandlerMap): (req: { body: string; headers: Record<string, string | undefined> }) => Promise<void> {
    return async (req) => {
      const sig = req.headers['x-atelier-signature'];
      if (!sig) throw new WebhookVerificationError('Missing X-Atelier-Signature header');

      const event = this.verify(req.body, sig);
      const handler = handlers[event.event as WebhookEventType];
      if (handler) await handler(event);
    };
  }
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}
