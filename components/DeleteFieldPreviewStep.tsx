'use client';

import type { CTDeleteOutcome } from '@/lib/schema-migration-shared';
import type { ContentTypeSummary } from '@/lib/contentful';
import { typeBadgeClass } from '@/lib/field-type-colors';

interface Props {
  fieldId: string;
  fieldName: string;
  fieldType: string;
  outcomes: CTDeleteOutcome[];
  contentTypes: ContentTypeSummary[];
  onApply: (toDelete: CTDeleteOutcome[]) => void;
  onBack: () => void;
  isApplying: boolean;
  /** 1 = omitting, 2 = removing, null = not in progress */
  applyPhase?: 1 | 2 | null;
}

export default function DeleteFieldPreviewStep({
  fieldId,
  fieldName,
  fieldType,
  outcomes,
  contentTypes,
  onApply,
  onBack,
  isApplying,
  applyPhase,
}: Props) {
  const toDelete = outcomes.filter((o) => o.status === 'delete');
  const notFound = outcomes.filter((o) => o.status === 'not-found');
  const canApply = toDelete.length > 0;

  return (
    <div className="space-y-6">
      {/* Field summary */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-red-800 mb-2">Field to be deleted</h2>
        <dl className="grid gap-2 sm:grid-cols-3 text-sm">
          <div>
            <dt className="text-xs text-red-400 uppercase tracking-wide">Name</dt>
            <dd className="font-medium text-red-900">{fieldName}</dd>
          </div>
          <div>
            <dt className="text-xs text-red-400 uppercase tracking-wide">ID</dt>
            <dd className="font-mono text-red-900">{fieldId}</dd>
          </div>
          <div>
            <dt className="text-xs text-red-400 uppercase tracking-wide">Type</dt>
            <dd className="text-red-900">{fieldType}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-red-700">
          All data stored in this field across all entries in the selected content types will be permanently lost.
        </p>
      </div>

      {/* Not found (informational, not blocking) */}
      {notFound.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Field not present — will skip ({notFound.length})
            </p>
          </div>
          <ul className="divide-y divide-gray-50">
            {notFound.map((o) => (
              <li key={o.contentTypeId} className="px-4 py-2.5 text-sm text-gray-500">
                <span className="font-medium">{o.contentTypeName}</span>
                <span className="ml-2 font-mono text-xs text-gray-400">{o.contentTypeId}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Will delete — with field shape showing what will be removed */}
      {toDelete.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-red-100 bg-red-50 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-500">
              Will delete from ({toDelete.length})
            </p>
          </div>
          <ul className="divide-y divide-gray-100">
            {toDelete.map((o) => {
              const ct = contentTypes.find((c) => c.id === o.contentTypeId);
              return (
                <li key={o.contentTypeId} className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-800 mb-1">{o.contentTypeName}</p>
                  <p className="text-xs text-gray-400 font-mono mb-2">{o.contentTypeId}</p>

                  {ct && (
                    <details>
                      <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 select-none">
                        Show field list ({ct.fields.length} fields)
                      </summary>
                      <div className="mt-2 divide-y divide-gray-50 rounded border border-gray-100">
                        {ct.fields.map((f) => {
                          const isTarget = f.id === fieldId;
                          return (
                            <div
                              key={f.id}
                              className={`flex items-center justify-between gap-2 px-3 py-1.5 ${isTarget ? 'bg-red-50' : ''}`}
                            >
                              <div className="min-w-0 text-xs flex items-center gap-1.5">
                                {isTarget && <span className="text-red-400">✕</span>}
                                <span className={`font-medium ${isTarget ? 'text-red-700 line-through' : 'text-gray-700'}`}>
                                  {f.name}
                                </span>
                                <span className={`font-mono ${isTarget ? 'text-red-400 line-through' : 'text-gray-400'}`}>
                                  {f.id}
                                </span>
                              </div>
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-mono font-medium ${isTarget ? 'bg-red-100 text-red-600' : typeBadgeClass(f.type)}`}>
                                {f.type}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!canApply && (
        <p className="text-sm text-gray-500">The field was not found in any of the selected content types.</p>
      )}

      {/* Delete progress (shown while applying) */}
      {isApplying && applyPhase && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-orange-600">
            Deleting field — do not navigate away
          </p>
          <ol className="space-y-2">
            {([
              { phase: 1, label: 'Mark field as omitted', sublabel: 'Hides field from API responses while preserving data' },
              { phase: 2, label: 'Remove field from schema', sublabel: 'Permanently removes field definition and all associated data' },
            ] as const).map(({ phase, label, sublabel }) => {
              const done = applyPhase > phase;
              const active = applyPhase === phase;
              return (
                <li key={phase} className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold
                    ${done ? 'bg-green-500 text-white' : active ? 'bg-orange-500 text-white animate-pulse' : 'bg-gray-200 text-gray-400'}`}>
                    {done ? '✓' : phase}
                  </span>
                  <div>
                    <p className={`text-sm font-medium ${active ? 'text-orange-800' : done ? 'text-gray-500' : 'text-gray-400'}`}>
                      {label}
                    </p>
                    <p className={`text-xs ${active ? 'text-orange-600' : 'text-gray-400'}`}>{sublabel}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Sticky actions */}
      <div className="sticky bottom-0 -mx-4 px-4">
        <div className="pointer-events-none h-8" style={{ background: 'linear-gradient(to bottom, rgba(249,250,251,0), rgb(249,250,251))' }} />
        <div className="bg-gray-50 pb-6 pt-1 flex items-center gap-3">
          <button type="button" onClick={onBack} disabled={isApplying} className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            ← Back
          </button>
          <button
            type="button"
            onClick={() => onApply(toDelete)}
            disabled={!canApply || isApplying}
            className="rounded-lg bg-red-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isApplying ? 'Deleting…' : `Delete from ${toDelete.length} content type${toDelete.length !== 1 ? 's' : ''} →`}
          </button>
        </div>
      </div>
    </div>
  );
}
