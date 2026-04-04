import { PrivyClient } from '@privy-io/node';

let _client: PrivyClient | null = null;

export function getPrivyServer(): PrivyClient {
  if (!_client) {
    _client = new PrivyClient({
      appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
      appSecret: process.env.PRIVY_APP_SECRET!,
    });
  }
  return _client;
}
