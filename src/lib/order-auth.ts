import type { NextRequest } from 'next/server';
import type { ServiceOrder } from './atelier-db';
import { isAgentOwnedByUser, isAgentOwnedByWallet } from './atelier-db';
import { authenticateUserRequest, authenticateUserRequestWithChain, readSigFieldsFromQuery } from './session';
import { readPrivyAccessToken, verifyPrivyAccessToken } from './privy-auth';
import { isPrivyAdmin, isAdminEmail } from './admin-auth';
import { resolveExternalAgentByApiKey } from './atelier-auth';

type OrderClientIdentity = Pick<ServiceOrder, 'client_wallet' | 'user_id'>;

type OrderViewerIdentity = Pick<
  ServiceOrder,
  'client_wallet' | 'user_id' | 'client_agent_id' | 'provider_agent_id'
>;

export type OrderViewerRole = 'buyer' | 'seller' | 'admin';

function walletInSet(target: string | null | undefined, wallets: string[]): boolean {
  if (!target) return false;
  const lower = target.toLowerCase();
  return wallets.some((w) => w === target || w.toLowerCase() === lower);
}

/**
 * Decide whether the caller may VIEW an order. Only the buyer, the seller (owner
 * of the provider agent), and Atelier admins are authorized; everyone else gets
 * null. An order detail leaks the brief, deliverables, client identity, and tx
 * hashes, so the read path must be gated as strictly as the mutation paths.
 *
 * Identity is resolved from, in order: the provider/buyer agent API key, the
 * Privy access token (social + embedded-wallet identity, plus admin email), and
 * finally a wallet session/signature bound to client_wallet or the agent owner.
 *
 * Returns the matched role, or null when the caller is not a participant.
 */
export async function authorizeOrderViewer(
  request: NextRequest | Request,
  order: OrderViewerIdentity,
): Promise<OrderViewerRole | null> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer atelier_')) {
    try {
      const agent = await resolveExternalAgentByApiKey(request as NextRequest);
      if (agent.id === order.provider_agent_id) return 'seller';
      if (order.client_agent_id && agent.id === order.client_agent_id) return 'buyer';
    } catch {
      // Not a valid agent key; fall through to user auth.
    }
  }

  const token = readPrivyAccessToken(request, null);
  if (token) {
    try {
      const info = await verifyPrivyAccessToken(token);
      if (isAdminEmail(info.email || info.googleEmail)) return 'admin';
      if (order.user_id && info.privyUserId === order.user_id) return 'buyer';
      const linkedWallets = [...info.linkedSolanaWallets, ...info.linkedEvmWallets];
      if (walletInSet(order.client_wallet, linkedWallets)) return 'buyer';
      if (await isAgentOwnedByUser(order.provider_agent_id, info.privyUserId)) return 'seller';
    } catch {
      // Invalid/expired token; fall through to wallet auth.
    }
  }

  try {
    const { wallet } = await authenticateUserRequestWithChain(
      request,
      readSigFieldsFromQuery(request),
      null,
    );
    if (order.client_wallet && wallet === order.client_wallet) return 'buyer';
    if (await isAgentOwnedByWallet(order.provider_agent_id, wallet)) return 'seller';
  } catch {
    // No wallet session/signature.
  }

  return null;
}

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

  // Admins act as the buyer on any order (e.g. approving delivery of bounties
  // the Atelier treasury funded, which have no linked client account).
  if (await isPrivyAdmin(request, body ?? null)) {
    return order.client_wallet ?? order.user_id ?? 'admin';
  }

  return authenticateUserRequest(request, body ?? null, order.client_wallet);
}
