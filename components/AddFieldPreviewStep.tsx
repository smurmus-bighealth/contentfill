'use client';

import type { CTDryRunOutcome, NewFieldDefinition } from '@/lib/schema-migration-shared';

const FIELD_TYPE_LABELS: Record<string, string> = {
  Symbol: 'Short text',
  Text: 'Long text',
  RichText: 'Rich text',
  Integer: 'Integer',
  Number: 'Decimal number',
  Boolean: 'Boolean',
  Date: 'Date & time',
  Location: 'Location',
  Object: 'JSON object',
  Link: 'Reference',
  Array: 'Array',
};

function fieldSummary(field: NewFieldDefinition): string {
  let type = FIELD_TYPE_LABELS[field.type] ?? field.type;
  if (field.type === 'Link') type += ` → ${field.linkType ?? 'Entry'}`;
  if (field.type === 'Array') {
    const item = field.arrayItemType === 'Link'
      ? `Reference → ${field.arrayLinkType ?? 'Entry'}`
      : 'Short text';
    type += ` of ${item}`;
  }
  const flags: string[] = [];
  if (field.required) flags.push('required');
  if (field.localized) flags.push('localized');
  return type + (flags.length ? ` · ${flags.join(', ')}` : '');
}

interface Props {
  field: NewFieldDefinition;
  outcomes: CTDryRunOutcome[];
  onApply: (addOutcomes: CTDryRunOutcome[]) => void;
  onBack: () => void;
  isApplying: boolean;
}

export default function AddFieldPreviewStep({ field, outcomes, onApply, onBack, isApplying }: Props) {
  const toAdd = outcomes.filter((o) => o.status === 'add');
  const conflicts = outcomes.filter((o) => o.status === 'conflict');
  const hasConflicts = conflicts.length > 0;
  const canApply = toAdd.length > 0 && !hasConflicts;

  return (
    <div className="space-y-6">
      {/* Field summary card */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Field to be added</h2>
        <dl className="grid gap-2 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs text-gray-400 uppercase tracking-wide">Name</dt>
            <dd className="font-medium text-gray-800">{field.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400 uppercase tracking-wide">ID</dt>
            <dd className="font-mono text-gray-800">{field.id}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400 uppercase tracking-wide">Type</dt>
            <dd className="text-gray-800">{fieldSummary(field)}</dd>
          </div>
        </dl>
      </div>

      {/* Conflict banner */}
      {hasConflicts && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>{conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} detected.</strong>{' '}
          Resolve the conflicts below before applying — the field ID <code className="rounded bg-red-100 px-1 font-mono">{field.id}</code> already exists in those content types.
        </div>
      )}

      {/* Conflicts */}
      {hasConflicts && (
        <div className="rounded-lg border border-red-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-red-100 bg-red-50 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-500">
              Conflicts ({conflicts.length})
            </p>
          </div>
          <ul className="divide-y divide-red-50">
            {conflicts.map((o) => (
              <li key={o.contentTypeId} className="px-4 py-3">
                <p className="text-sm font-medium text-gray-800">{o.contentTypeName}</p>
                <p className="text-xs text-gray-400 font-mono">{o.contentTypeId}</p>
                {o.conflictReason && (
                  <p className="mt-1 text-xs text-red-500">{o.conflictReason}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Will add */}
      {toAdd.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Will add field to ({toAdd.length})
            </p>
          </div>
          <ul className="divide-y divide-gray-50">
            {toAdd.map((o) => (
              <li key={o.contentTypeId} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 text-xs">+</span>
                <span>
                  <p className="text-sm font-medium text-gray-800">{o.contentTypeName}</p>
                  <p className="text-xs text-gray-400 font-mono">{o.contentTypeId}</p>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {toAdd.length === 0 && !hasConflicts && (
        <p className="text-sm text-gray-500">No content types selected.</p>
      )}

      {/* Sticky actions */}
      <div className="sticky bottom-0 -mx-4 px-4">
        <div className="pointer-events-none h-8" style={{ background: 'linear-gradient(to bottom, rgba(249,250,251,0), rgb(249,250,251))' }} />
        <div className="bg-gray-50 pb-6 pt-1 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={isApplying}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => onApply(toAdd)}
            disabled={!canApply || isApplying}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isApplying ? 'Applying…' : `Apply to ${toAdd.length} content type${toAdd.length !== 1 ? 's' : ''} →`}
          </button>
        </div>
      </div>
    </div>
  );
}
