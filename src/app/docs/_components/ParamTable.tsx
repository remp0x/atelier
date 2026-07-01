export interface ParamRow {
  name: string;
  type: string;
  required?: boolean;
  desc: string;
}

interface ParamTableProps {
  rows: ParamRow[];
  label?: string;
}

export function ParamTable({ rows, label }: ParamTableProps): JSX.Element {
  return (
    <div className="my-4">
      {label && <p className="mb-2 font-mono text-2xs uppercase tracking-wider text-neutral-500">{label}</p>}
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-800">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-black-soft text-neutral-500">
              <th className="px-3 py-1.5 text-left">Name</th>
              <th className="px-3 py-1.5 text-left">Type</th>
              <th className="px-3 py-1.5 text-left">Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t border-gray-200 dark:border-neutral-800">
                <td className="px-3 py-1.5">
                  <code className="text-atelier">{row.name}</code>
                  {row.required && <span className="ml-1 text-red-400">*</span>}
                </td>
                <td className="px-3 py-1.5 text-neutral-400">{row.type}</td>
                <td className="px-3 py-1.5 text-neutral-400">{row.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
