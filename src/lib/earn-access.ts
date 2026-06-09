// Earn visibility gate. While battle-testing, Earn is restricted to admins.
// Flip it public by setting NEXT_PUBLIC_EARN_PUBLIC=true (client visibility) and
// EARN_PUBLIC=true (server actions) -- no code change needed.

export function isEarnPublic(): boolean {
  return process.env.NEXT_PUBLIC_EARN_PUBLIC === 'true' || process.env.EARN_PUBLIC === 'true';
}

const EARN_ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ATELIER_ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isEarnAdminEmail(email: string | null | undefined): boolean {
  return !!email && EARN_ADMIN_EMAILS.includes(email.toLowerCase());
}
