export function atelierHref(path: string): string {
  const stripped = path.replace(/^\/atelier/, '');
  return stripped || '/';
}
