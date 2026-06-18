// Client-safe admin gate. Reads the NEXT_PUBLIC_ list so it can run in the
// browser (sidebar, page guards). Server routes use admin-auth.ts instead.
const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ATELIER_ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAtelierAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
