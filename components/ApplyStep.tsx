'use client';

import type { ApplyResult } from '@/lib/migration';

function envSegment(environment: string) {
  return environment === 'master' ? '' : `/environments/${environment}`;
}

function entryUrl(spaceId: string, environment: string, entryId: string) {
  return `https://app.contentful.com/spaces/${spaceId}${envSegment(environment)}/entries/${entryId}`;
}

interface Props {
  result: ApplyResult;
  spaceId: string;
  environment: string;
  onReset: () => void;
}

export default function ApplyStep({ result, spaceId, environment, onReset }: Props) {
  const total = result.succeeded.length + result.failed.length;
  const allSucceeded = result.failed.length === 0 && result.succeeded.length > 0;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className={`rounded-lg border p-5 shadow-sm ${allSucceeded ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
        <p className="text-lg font-semibold">
          {allSucceeded
            ? `All ${total} entries updated successfully`
            : `${result.succeeded.length} / ${total} entries updated — ${result.failed.length} failed`}
        </p>
      </div>

      {/* Failures */}
      {result.failed.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-white shadow-sm">
          <div className="border-b border-red-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-red-700">Failed entries</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {result.failed.map((f) => (
              <li key={f.entryId} className="px-4 py-3 text-sm">
                <span className="font-mono text-xs text-gray-500 mr-2">{f.entryId}</span>
                <span className="text-red-700">{f.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Successes (collapsible) */}
      {result.succeeded.length > 0 && (
        <details className="rounded-lg border border-gray-200 bg-white shadow-sm" open={result.succeeded.length <= 10}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-700 select-none">
            {result.succeeded.length} updated {result.succeeded.length === 1 ? 'entry' : 'entries'}
          </summary>
          <ul className="divide-y divide-gray-100 border-t border-gray-100">
            {result.succeeded.map((id) => (
              <li key={id} className="flex items-center gap-3 px-4 py-2">
                <span className="text-green-500 text-xs">✓</span>
                <a
                  href={entryUrl(spaceId, environment, id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-blue-600 hover:underline break-all"
                >
                  {id} ↗
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}

      <button
        onClick={onReset}
        className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        ← Start over
      </button>
    </div>
  );
}
