'use client';

import type { SchemaApplyResult, NewFieldDefinition } from '@/lib/schema-migration-shared';
import type { ContentTypeSummary } from '@/lib/contentful';
import { typeBadgeClass } from '@/lib/field-type-colors';

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

function fieldTypeSummary(field: NewFieldDefinition): string {
  let type = FIELD_TYPE_LABELS[field.type] ?? field.type;
  if (field.type === 'Link') type += ` → ${field.linkType ?? 'Entry'}`;
  if (field.type === 'Array') {
    const item = field.arrayItemType === 'Link' ? `Ref → ${field.arrayLinkType ?? 'Entry'}` : 'Short text';
    type += ` of ${item}`;
  }
  return type;
}

function envSegment(environment: string) {
  return environment === 'master' ? '' : `/environments/${environment}`;
}

function ctUrl(spaceId: string, environment: string, ctId: string) {
  return `https://app.contentful.com/spaces/${spaceId}${envSegment(environment)}/content_types/${ctId}/fields`;
}

interface Props {
  result: SchemaApplyResult;
  field: NewFieldDefinition;
  contentTypes: ContentTypeSummary[];
  spaceId: string;
  environment: string;
  onReset: () => void;
}

export default function AddFieldApplyStep({ result, field, contentTypes, spaceId, environment, onReset }: Props) {
  const { succeeded, failed } = result;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className={`rounded-lg border p-5 shadow-sm ${failed.length === 0 && succeeded.length > 0 ? 'border-green-200 bg-green-50' : failed.length > 0 ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200 bg-white'}`}>
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
          {succeeded.length === 0 && failed.length === 0 && (
            <span className="text-gray-500">Nothing was applied.</span>
          )}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Field added: <span className="font-mono">{field.id}</span> ({fieldTypeSummary(field)})
          {field.required && ' · required'}
          {field.localized && ' · localized'}
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

      {/* Succeeded — with new CT shape */}
      {succeeded.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-green-100 bg-green-50 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-600">
              Succeeded ({succeeded.length})
            </p>
          </div>
          <ul className="divide-y divide-gray-100">
            {succeeded.map((s) => {
              const ct = contentTypes.find((c) => c.id === s.contentTypeId);
              return (
                <li key={s.contentTypeId} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{s.contentTypeName}</p>
                      <p className="text-xs text-gray-400 font-mono">{s.contentTypeId}</p>
                    </div>
                    <a
                      href={ctUrl(spaceId, environment, s.contentTypeId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs text-blue-600 hover:underline font-medium"
                    >
                      View in Contentful ↗
                    </a>
                  </div>

                  {/* New field shape */}
                  {ct && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 select-none">
                        Show updated field list ({ct.fields.length + 1} fields)
                      </summary>
                      <div className="mt-2 divide-y divide-gray-50 rounded border border-gray-100">
                        {ct.fields.map((f) => (
                          <div key={f.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                            <div className="min-w-0 text-xs">
                              <span className="font-medium text-gray-700">{f.name}</span>
                              <span className="ml-1.5 text-gray-400 font-mono">{f.id}</span>
                            </div>
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-mono font-medium ${typeBadgeClass(f.type)}`}>
                              {f.type}
                            </span>
                          </div>
                        ))}
                        {/* New field — highlighted */}
                        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-green-50 rounded-b border-t-2 border-green-200">
                          <div className="min-w-0 text-xs">
                            <span className="font-semibold text-green-800">{field.name}</span>
                            <span className="ml-1.5 text-green-600 font-mono">{field.id}</span>
                            <span className="ml-1.5 rounded bg-green-100 px-1 py-0.5 text-[10px] font-semibold text-green-700 uppercase tracking-wide">new</span>
                          </div>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-mono font-medium ${typeBadgeClass(field.type)}`}>
                            {field.type}
                          </span>
                        </div>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 px-4">
        <div className="pointer-events-none h-8" style={{ background: 'linear-gradient(to bottom, rgba(249,250,251,0), rgb(249,250,251))' }} />
        <div className="bg-gray-50 pb-6 pt-1">
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Add another field
          </button>
        </div>
      </div>
    </div>
  );
}
