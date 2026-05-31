import type { NextRequest } from 'next/server';
import type { ServiceOrder } from './atelier-db';
import { authenticateUserRequest } from './session';
import { readPrivyAccessToken, verifyPrivyAccessToken } from './privy-auth';

type OrderClientIdentity = Pick<ServiceOrder, 'client_wallet' | 'user_id'>;

/**
 * Authorize the buyer of an order for actions that release no funds from their
 * own wallet (approve, revision, dispute, cancel, review).
 *
 * The order's Privy user_id is the stable owner identity: the buyer may have
 * switched the wallet connected in their extension, or signed in with Google and
 * never connected an external wallet. The approve payout goes to the agent's
 * payout wallet, not the buyer's, so the buyer wallet is only an auth credential.
 *
 * Privy identity is checked first; legacy orders without a user_id fall back to
 * wallet-signature / session auth bound to client_wallet.
 *
 * Returns the resolved client identity (wallet when available, else the Privy id).
 * Throws on failed authentication.
 */
export async function authorizeOrderClient(
  request: NextRequest | Request,
  body: Record<string, unknown> | null | undefined,
  order: OrderClientIdentity,
): Promise<string> {
  if (order.user_id) {
    const token = readPrivyAccessToken(request, body ?? null);
    if (token) {
      try {
        const info = await verifyPrivyAccessToken(token);
        if (info.privyUserId === order.user_id) {
          return order.client_wallet ?? order.user_id;
        }
      } catch {
        // Fall through to wallet auth below.
      }
    }
  }

  return authenticateUserRequest(request, body ?? null, order.client_wallet);
}
