export const dynamic = 'force-dynamic';

const CONTENT = `Contact: https://t.me/atelierai
Contact: https://x.com/useAtelier
Expires: 2027-04-07T00:00:00.000Z
Preferred-Languages: en
Canonical: https://atelierai.xyz/.well-known/security.txt
`;

export function GET(): Response {
  return new Response(CONTENT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
