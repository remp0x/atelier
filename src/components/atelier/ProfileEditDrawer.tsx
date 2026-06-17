'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import Image from 'next/image';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { getPrivyAccessToken } from '@/lib/privy-client';
import { upload } from '@vercel/blob/client';
import type { AtelierUser } from '@/lib/atelier-db';

interface ProfileEditDrawerProps {
  open: boolean;
  onClose: () => void;
  user: AtelierUser;
}

interface FieldErrors {
  display_name?: string;
  username?: string;
  bio?: string;
  avatar_url?: string;
}

const USERNAME_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])?$/;

async function checkUsername(u: string): Promise<{ available: boolean; reason: string | null }> {
  const res = await fetch(`/api/auth/check-username?u=${encodeURIComponent(u)}`);
  return res.json() as Promise<{ available: boolean; reason: string | null }>;
}

export function ProfileEditDrawer({ open, onClose, user }: ProfileEditDrawerProps): React.ReactElement {
  const { refreshAtelierUser } = useAtelierAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(user.display_name ?? '');
  const [username, setUsername] = useState(user.username ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url ?? '');

  const [errors, setErrors] = useState<FieldErrors>({});
  const [usernameState, setUsernameState] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const usernameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setDisplayName(user.display_name ?? '');
      setUsername(user.username ?? '');
      setBio(user.bio ?? '');
      setAvatarUrl(user.avatar_url ?? '');
      setErrors({});
      setUsernameState('idle');
      setSaveError(null);
    }
  }, [open, user]);

  const runAvailabilityCheck = useCallback(async (val: string) => {
    const trimmed = val.trim().toLowerCase();
    if (!trimmed || trimmed === (user.username ?? '')) {
      setUsernameState('idle');
      setErrors((e) => ({ ...e, username: undefined }));
      return;
    }
    if (trimmed.length < 3 || trimmed.length > 30 || !USERNAME_SLUG_REGEX.test(trimmed)) {
      setUsernameState('invalid');
      setErrors((e) => ({ ...e, username: 'Username must be 3-30 chars: lowercase, numbers, hyphens, underscores' }));
      return;
    }
    setErrors((e) => ({ ...e, username: undefined }));
    setUsernameState('checking');
    try {
      const { available } = await checkUsername(trimmed);
      setUsernameState(available ? 'available' : 'taken');
      if (!available) {
        setErrors((e) => ({ ...e, username: 'This username is already taken' }));
      }
    } catch {
      setUsernameState('idle');
    }
  }, [user.username]);

  const handleUsernameBlur = useCallback(() => {
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    void runAvailabilityCheck(username);
  }, [username, runAvailabilityCheck]);

  const handleUsernameChange = useCallback((val: string) => {
    setUsername(val);
    setUsernameState('idle');
    setErrors((e) => ({ ...e, username: undefined }));
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    usernameTimerRef.current = setTimeout(() => {
      void runAvailabilityCheck(val);
    }, 400);
  }, [runAvailabilityCheck]);

  useEffect(() => () => {
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
  }, []);

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const token = await getPrivyAccessToken();
      if (!token) throw new Error('Not authenticated');
      const rand = Math.random().toString(36).slice(2, 8);
      const ext = file.name.split('.').pop() ?? 'bin';
      const pathname = `atelier/avatars/${Date.now()}-${rand}.${ext}`;
      const blob = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/upload/client',
        clientPayload: JSON.stringify({ privy_token: token }),
      });
      setAvatarUrl(blob.url);
    } catch (err) {
      setErrors((e) => ({ ...e, avatar_url: 'Upload failed. Please try again.' }));
      console.error('[ProfileEditDrawer] avatar upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: FieldErrors = {};
    const dn = displayName.trim();
    if (dn.length > 30) newErrors.display_name = 'Display name must be 30 characters or fewer';

    const u = username.trim().toLowerCase();
    if (u && (u.length < 3 || u.length > 30 || !USERNAME_SLUG_REGEX.test(u))) {
      newErrors.username = 'Username must be 3-30 chars: lowercase, numbers, hyphens, underscores';
    }
    if (usernameState === 'taken') newErrors.username = 'This username is already taken';

    if (bio.trim().length > 280) newErrors.bio = 'Bio must be 280 characters or fewer';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [displayName, username, bio, usernameState]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const token = await getPrivyAccessToken();
      if (!token) throw new Error('Not authenticated');

      const newUsername = username.trim().toLowerCase();
      const usernameChanged = newUsername !== (user.username ?? '');

      // Last-mile availability check -- catches the case where the user typed a
      // taken handle and clicked Save before the debounced check fired.
      if (usernameChanged && newUsername) {
        const { available } = await checkUsername(newUsername);
        if (!available) {
          setUsernameState('taken');
          setErrors((e) => ({ ...e, username: 'This username is already taken' }));
          setSaving(false);
          return;
        }
      }

      const body: Record<string, string> = {};
      if (displayName.trim() !== (user.display_name ?? '')) body.display_name = displayName.trim();
      if (usernameChanged) body.username = newUsername;
      if (bio.trim() !== (user.bio ?? '')) body.bio = bio.trim();
      if (avatarUrl !== (user.avatar_url ?? '')) body.avatar_url = avatarUrl;

      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }

      const res = await fetch('/api/auth/user', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        if (res.status === 409) {
          setUsernameState('taken');
          setErrors((e) => ({ ...e, username: 'This username is already taken' }));
        }
        setSaveError(json.error ?? 'Failed to save. Please try again.');
        return;
      }

      await refreshAtelierUser();
      if (usernameChanged) {
        router.replace(`/profile/${newUsername}`);
      } else {
        router.refresh();
      }
      onClose();
    } catch (err) {
      setSaveError('Failed to save. Please try again.');
      console.error('[ProfileEditDrawer] save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [validate, displayName, username, bio, avatarUrl, user, refreshAtelierUser, router, onClose]);

  const avatarLetter = (displayName.trim() || user.username || 'A').charAt(0).toUpperCase();

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={onClose}
            />
            <motion.aside
              key="drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className="fixed inset-y-0 right-0 z-50 flex flex-col w-full sm:w-[420px] bg-white dark:bg-[#0a0a0a] border-l border-neutral-200 dark:border-neutral-900 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Edit profile"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-900 flex-shrink-0">
                <h2 className="text-base font-semibold font-display text-black dark:text-white">Edit Profile</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
                {/* Avatar */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-neutral-500 mb-3">
                    Avatar
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border border-neutral-300 dark:border-neutral-800 bg-atelier/10">
                      {avatarUrl ? (
                        <Image
                          src={avatarUrl}
                          alt="Avatar preview"
                          fill
                          sizes="64px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-2xl font-bold font-display text-atelier/60">
                          {avatarLetter}
                        </span>
                      )}
                      {uploading && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleAvatarUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-neutral-700 dark:text-neutral-300 bg-black/[0.04] dark:bg-white/5 hover:bg-black/[0.08] dark:hover:bg-white/10 border border-neutral-300 dark:border-neutral-800 rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        {uploading ? 'Uploading...' : 'Upload photo'}
                      </button>
                      {user.twitter_username && !avatarUrl && (
                        <p className="text-xs font-mono text-neutral-600">Pulled from X profile</p>
                      )}
                    </div>
                  </div>
                  {errors.avatar_url && (
                    <p className="mt-1.5 text-xs font-mono text-red-400">{errors.avatar_url}</p>
                  )}
                </div>

                {/* Display name */}
                <div>
                  <label htmlFor="edit-display-name" className="block text-xs font-mono uppercase tracking-wider text-neutral-500 mb-2">
                    Display name
                  </label>
                  <input
                    id="edit-display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={30}
                    placeholder="Your name"
                    className="w-full px-3 py-2.5 rounded-lg bg-white dark:bg-black border border-neutral-300 dark:border-neutral-800 text-black dark:text-white text-sm font-sans placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier transition-colors duration-200"
                  />
                  <div className="flex items-center justify-between mt-1">
                    {errors.display_name ? (
                      <p className="text-xs font-mono text-red-400">{errors.display_name}</p>
                    ) : (
                      <span />
                    )}
                    <span className="text-[10px] font-mono text-neutral-600 ml-auto">{displayName.length}/30</span>
                  </div>
                </div>

                {/* Username */}
                <div>
                  <label htmlFor="edit-username" className="block text-xs font-mono uppercase tracking-wider text-neutral-500 mb-2">
                    Username
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm font-mono pointer-events-none">@</span>
                    <input
                      id="edit-username"
                      type="text"
                      value={username}
                      onChange={(e) => handleUsernameChange(e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase())}
                      onBlur={handleUsernameBlur}
                      maxLength={30}
                      placeholder="your_handle"
                      className={`w-full pl-7 pr-24 py-2.5 rounded-lg bg-white dark:bg-black border text-black dark:text-white text-sm font-mono placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none transition-colors duration-200 ${
                        errors.username ? 'border-red-500/60 focus:border-red-400' : 'border-neutral-300 dark:border-neutral-800 focus:border-atelier'
                      }`}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {usernameState === 'checking' && (
                        <div className="w-3.5 h-3.5 border border-neutral-500 border-t-neutral-200 rounded-full animate-spin" />
                      )}
                      {usernameState === 'available' && (
                        <span className="text-[10px] font-mono text-green-400 uppercase tracking-wider">Available</span>
                      )}
                      {usernameState === 'taken' && (
                        <span className="text-[10px] font-mono text-red-400 uppercase tracking-wider">Taken</span>
                      )}
                      {usernameState === 'invalid' && (
                        <span className="text-[10px] font-mono text-red-400 uppercase tracking-wider">Invalid</span>
                      )}
                    </div>
                  </div>
                  {errors.username ? (
                    <p className="mt-1.5 text-xs font-mono text-red-400">{errors.username}</p>
                  ) : (
                    <p className="mt-1.5 text-[10px] font-mono text-neutral-600">
                      3-30 characters. Lowercase, numbers, hyphens, underscores.
                    </p>
                  )}
                </div>

                {/* Bio */}
                <div>
                  <label htmlFor="edit-bio" className="block text-xs font-mono uppercase tracking-wider text-neutral-500 mb-2">
                    Bio
                  </label>
                  <textarea
                    id="edit-bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={280}
                    rows={4}
                    placeholder="A short bio about yourself"
                    className="w-full px-3 py-2.5 rounded-lg bg-white dark:bg-black border border-neutral-300 dark:border-neutral-800 text-black dark:text-white text-sm font-sans placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier transition-colors duration-200 resize-none"
                  />
                  <div className="flex items-center justify-between mt-1">
                    {errors.bio ? (
                      <p className="text-xs font-mono text-red-400">{errors.bio}</p>
                    ) : (
                      <span />
                    )}
                    <span className={`text-[10px] font-mono ml-auto ${bio.length > 260 ? 'text-amber-400' : 'text-neutral-600'}`}>
                      {bio.length}/280
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0 px-5 py-4 border-t border-neutral-200 dark:border-neutral-900 space-y-3">
                {saveError && (
                  <p className="text-xs font-mono text-red-400 text-center">{saveError}</p>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || uploading}
                  className="w-full py-3 rounded-lg text-sm font-semibold font-mono text-white transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black"
                  style={{ background: 'linear-gradient(135deg, #fa4c14 0%, #ff7a3d 100%)' }}
                >
                  {saving ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
