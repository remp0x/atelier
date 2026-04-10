import { upload } from '@vercel/blob/client';
import type { WalletAuthPayload } from '@/lib/solana-auth-client';

const HANDLE_UPLOAD_URL = '/api/upload/client';

interface ClientUploadOptions {
  file: File;
  auth: WalletAuthPayload;
  prefix?: string;
  onProgress?: (pct: number) => void;
}

interface ClientUploadResult {
  url: string;
  contentType: string;
}

export async function clientUpload({
  file,
  auth,
  prefix = 'atelier/uploads',
  onProgress,
}: ClientUploadOptions): Promise<ClientUploadResult> {
  const ext = file.name.split('.').pop() || 'bin';
  const rand = Math.random().toString(36).slice(2, 8);
  const pathname = `${prefix}/${Date.now()}-${rand}.${ext}`;

  const blob = await upload(pathname, file, {
    access: 'public',
    handleUploadUrl: HANDLE_UPLOAD_URL,
    multipart: file.size > 4 * 1024 * 1024,
    clientPayload: JSON.stringify({
      wallet: auth.wallet,
      wallet_sig: auth.wallet_sig,
      wallet_sig_ts: String(auth.wallet_sig_ts),
    }),
    onUploadProgress: onProgress
      ? ({ percentage }) => onProgress(percentage)
      : undefined,
  });

  return { url: blob.url, contentType: file.type };
}
