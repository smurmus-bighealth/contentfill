'use client';

import type { SchemaDeleteResult } from '@/lib/schema-migration-shared';

function envSegment(environment: string) {
  return environment === 'master' ? '' : `/environments/${environment}`;
}

function ctUrl(spaceId: string, environment: string, ctId: string) {
  return `https://app.contentful.com/spaces/${spaceId}${envSegment(environment)}/content_types/${ctId}/fields`;
}

interface Props {
  result: SchemaDeleteResult;
  fieldId: string;
  fieldName: string;
  spaceId: string;
  environment: string;
  onReset: () => void;
}

export default function DeleteFieldApplyStep({ result, fieldId, fieldName, spaceId, environment, onReset }: Props) {
  const { succeeded, failed } = result;
  const allSucceeded = failed.length === 0 && succeeded.length > 0;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className={`rounded-lg border p-5 shadow-sm ${allSucceeded ? 'border-green-200 bg-green-50' : failed.length > 0 ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200 bg-white'}`}>
        <p className="text-sm font-semibold text-gray-800">
          {succeeded.length > 0 && (
            <span className="text-green-700">
              {succeeded.length} content type{succeeded.length !== 1 ? 's' : ''} updated.
            </span>
          )}
          {failed.length > 0 && (
            <>
              {succeeded.length > 0 && ' '}
              <span className="text-red-700">{failed.length} failed.</span>
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Field removed: <span className="font-semibold">{fieldName}</span>{' '}
          <span className="font-mono text-gray-400">{fieldId}</span>
        </p>
      </div>

      {/* Failed */}
      {failed.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-red-100 bg-red-50 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-500">Failed ({failed.length})</p>
          </div>
          <ul className="divide-y divide-red-50">
            {failed.map((f) => (
              <li key={f.contentTypeId} className="px-4 py-3">
                <p className="text-sm font-medium text-gray-800">{f.contentTypeName}</p>
                <p className="text-xs text-gray-400 font-mono">{f.contentTypeId}</p>
                <p className="mt-1 text-xs text-red-600 break-words">{f.error}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Succeeded */}
      {succeeded.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-green-100 bg-green-50 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-600">Succeeded ({succeeded.length})</p>
          </div>
          <ul className="divide-y divide-gray-100">
            {succeeded.map((s) => (
              <li key={s.contentTypeId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 text-xs font-bold">✓</span>
                  <span className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{s.contentTypeName}</p>
                    <p className="text-xs text-gray-400 font-mono">{s.contentTypeId}</p>
                  </span>
                </div>
                <a
                  href={ctUrl(spaceId, environment, s.contentTypeId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs text-blue-600 hover:underline font-medium"
                >
                  View in Contentful ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onReset}
        className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Delete another field
      </button>
    </div>
  );
}
