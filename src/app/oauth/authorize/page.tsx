'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';

interface OAuthParams {
  responseType: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  state: string;
}

function useOAuthParams(): OAuthParams {
  const sp = useSearchParams();
  return useMemo(
    () => ({
      responseType: sp.get('response_type') ?? '',
      clientId: sp.get('client_id') ?? '',
      redirectUri: sp.get('redirect_uri') ?? '',
      codeChallenge: sp.get('code_challenge') ?? '',
      codeChallengeMethod: sp.get('code_challenge_method') ?? '',
      scope: sp.get('scope') ?? '',
      state: sp.get('state') ?? '',
    }),
    [sp],
  );
}

export default function AuthorizePage() {
  const params = useOAuthParams();
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const host = useMemo(() => {
    try {
      return new URL(params.redirectUri).host;
    } catch {
      return '';
    }
  }, [params.redirectUri]);

  const paramsValid =
    params.responseType === 'code' &&
    !!params.clientId &&
    !!params.redirectUri &&
    params.codeChallengeMethod === 'S256' &&
    !!params.codeChallenge;

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setError('Could not get your session token. Try signing in again.');
        setBusy(false);
        return;
      }
      const res = await fetch('/api/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: params.clientId,
          redirect_uri: params.redirectUri,
          code_challenge: params.codeChallenge,
          code_challenge_method: params.codeChallengeMethod,
          scope: params.scope,
          state: params.state,
          privy_access_token: token,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { redirect?: string; error_description?: string; error?: string };
      if (!res.ok || !data.redirect) {
        setError(data.error_description || data.error || 'Authorization failed.');
        setBusy(false);
        return;
      }
      window.location.href = data.redirect;
    } catch {
      setError('Network error. Please try again.');
      setBusy(false);
    }
  }

  function deny() {
    try {
      const url = new URL(params.redirectUri);
      url.searchParams.set('error', 'access_denied');
      if (params.state) url.searchParams.set('state', params.state);
      window.location.href = url.toString();
    } catch {
      setError('Authorization denied.');
    }
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#333] bg-[#0a0a0a] p-8">
        <div className="mb-6">
          <div className="font-mono text-xs uppercase tracking-widest text-[#fa4c14]">Atelier MCP</div>
          <h1 className="mt-2 font-display text-2xl font-semibold">Connect to Atelier</h1>
        </div>

        {!paramsValid ? (
          <p className="text-sm text-[#ff7a3d]">Invalid authorization request. Missing or malformed parameters.</p>
        ) : (
          <>
            <p className="text-sm text-[#bbb]">
              <span className="font-mono text-white">{host || 'An MCP client'}</span> wants to connect to your Atelier account
              and act as your agent: manage services, orders, bounties, tokens, and Earn on your behalf.
            </p>

            {!ready ? (
              <p className="mt-6 font-mono text-xs text-[#888]">Loading...</p>
            ) : !authenticated ? (
              <button
                onClick={login}
                className="mt-6 w-full rounded-xl bg-[#fa4c14] px-4 py-3 font-medium text-white transition hover:bg-[#ff7a3d]"
              >
                Sign in to Atelier
              </button>
            ) : (
              <>
                <div className="mt-4 rounded-lg border border-[#222] bg-[#141414] px-3 py-2 font-mono text-xs text-[#aaa]">
                  Signed in{user?.email?.address ? ` as ${user.email.address}` : ''}
                  <button onClick={logout} className="ml-2 text-[#fa4c14] hover:underline">
                    switch
                  </button>
                </div>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={deny}
                    disabled={busy}
                    className="flex-1 rounded-xl border border-[#333] px-4 py-3 font-medium text-[#ccc] transition hover:bg-[#1a1a1a] disabled:opacity-50"
                  >
                    Deny
                  </button>
                  <button
                    onClick={approve}
                    disabled={busy}
                    className="flex-1 rounded-xl bg-[#fa4c14] px-4 py-3 font-medium text-white transition hover:bg-[#ff7a3d] disabled:opacity-50"
                  >
                    {busy ? 'Authorizing...' : 'Authorize'}
                  </button>
                </div>
              </>
            )}

            {error && <p className="mt-4 text-sm text-[#ff6b6b]">{error}</p>}
          </>
        )}
      </div>
    </main>
  );
}
