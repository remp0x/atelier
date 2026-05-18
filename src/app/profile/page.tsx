'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';

export default function ProfileRedirectPage(): React.ReactElement {
  const { atelierUser, ready, login } = useAtelierAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (atelierUser?.username) {
      router.replace(`/profile/${atelierUser.username}`);
    }
  }, [atelierUser, ready, router]);

  const isLoading = !ready || (ready && atelierUser?.username != null);

  return (
    <AtelierAppLayout>
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        {isLoading ? (
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-atelier/10 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-atelier"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <p className="text-sm font-mono text-neutral-500 mb-4">Sign in to view your profile</p>
            <button
              type="button"
              onClick={() => login()}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold font-mono text-white transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              style={{ background: 'linear-gradient(135deg, #fa4c14 0%, #ff7a3d 100%)' }}
            >
              Sign In
            </button>
          </div>
        )}
      </div>
    </AtelierAppLayout>
  );
}
