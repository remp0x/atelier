// Earn access gates. Two independent concepts, deliberately NOT sharing a flag:
//  - isEarnPublic(): page/sidebar VISIBILITY only. The /earn page renders for
//    anyone regardless; this just controls whether the sidebar link surfaces.
//  - isEarnDepositsOpen(): whether ANYONE may DEPOSIT. Defaults closed. While
//    battle-testing, deposits are admin-only and CANNOT be opened by the
//    visibility flag -- open them explicitly with EARN_DEPOSITS_OPEN=true.

export function isEarnPublic(): boolean {
  return process.env.NEXT_PUBLIC_EARN_PUBLIC === 'true' || process.env.EARN_PUBLIC === 'true';
}

export function isEarnDepositsOpen(): boolean {
  return process.env.NEXT_PUBLIC_EARN_DEPOSITS_OPEN === 'true' || process.env.EARN_DEPOSITS_OPEN === 'true';
}

const EARN_ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ATELIER_ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isEarnAdminEmail(email: string | null | undefined): boolean {
  return !!email && EARN_ADMIN_EMAILS.includes(email.toLowerCase());
}
