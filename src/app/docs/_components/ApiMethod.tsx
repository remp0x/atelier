export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiMethodProps {
  method: HttpMethod;
}

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  POST: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  PUT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PATCH: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  DELETE: 'bg-red-500/15 text-red-400 border-red-500/30',
};

export function ApiMethod({ method }: ApiMethodProps): JSX.Element {
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-2xs font-bold ${METHOD_COLORS[method]}`}>
      {method}
    </span>
  );
}
