'use client';

import type { ContentTypeSummary, SampleEntry } from '@/lib/contentful';
import { typeBadgeClass } from '@/lib/field-type-colors';

// Only types whose API name isn't self-explanatory get a friendly label shown below the badge
const TYPE_FRIENDLY: Record<string, string> = {
  Symbol: 'Short text',
};

/** Turns a raw Contentful field value into a readable preview string. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    return value.length > 120 ? value.slice(0, 120) + '…' : value || '(empty string)';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty array)';
    // Array of links or primitives
    const previews = value.slice(0, 3).map((item) => formatValue(item));
    return previews.join(', ') + (value.length > 3 ? ` … +${value.length - 3} more` : '');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Contentful link
    if (obj.sys && typeof obj.sys === 'object') {
      const sys = obj.sys as Record<string, unknown>;
      const linkType = sys.linkType ?? sys.type ?? 'Link';
      return `[${linkType}: ${sys.id ?? '?'}]`;
    }
    // Rich text
    if (obj.nodeType) return '[Rich text]';
    // Geo coordinates
    if ('lat' in obj && 'lon' in obj) return `${obj.lat}, ${obj.lon}`;
    return JSON.stringify(value).slice(0, 100);
  }
  return String(value);
}

interface Props {
  ct: ContentTypeSummary;
  locale: string;
  spaceId: string;
  environment: string;
  sample: SampleEntry | null | 'loading' | 'error';
}

function envSegment(environment: string) {
  return environment === 'master' ? '' : `/environments/${environment}`;
}

function ctUrl(spaceId: string, environment: string, ctId: string) {
  return `https://app.contentful.com/spaces/${spaceId}${envSegment(environment)}/content_types/${ctId}/fields`;
}

function entryUrl(spaceId: string, environment: string, entryId: string) {
  return `https://app.contentful.com/spaces/${spaceId}${envSegment(environment)}/entries/${entryId}`;
}

export default function ContentTypeInspector({ ct, locale, spaceId, environment, sample }: Props) {

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden text-sm">
      {/* Header */}
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
        <a
          href={ctUrl(spaceId, environment, ct.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-blue-600 hover:underline break-words"
        >
          {ct.name} ↗
        </a>
        <p className="text-xs text-gray-400 font-mono break-all">{ct.id}</p>
      </div>

      {/* Fields list */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Fields ({ct.fields.length})
          </p>
          <p className="text-xs text-gray-400 italic">types are Contentful API names</p>
        </div>
        <div className="divide-y divide-gray-50">
          {ct.fields.map((f) => (
            <div key={f.id} className="flex items-start gap-2 py-1.5">
              {/* Name + id + linked types */}
              <div className="flex-1 min-w-0 text-xs">
                <span className="font-medium text-gray-700 break-words block">
                  {f.name}
                  {f.required && <span className="ml-1 text-red-400" title="Required">✱</span>}
                </span>
                <span className="text-gray-400 font-mono break-all">{f.id}</span>

                {/* Reference targets */}
                {f.linkType === 'Entry' && f.linkedContentTypes && f.linkedContentTypes.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {f.linkedContentTypes.map((refId) => (
                      <a
                        key={refId}
                        href={ctUrl(spaceId, environment, refId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block rounded bg-pink-50 px-1.5 py-0.5 font-mono text-pink-600 hover:underline"
                      >
                        {refId} ↗
                      </a>
                    ))}
                  </div>
                )}
                {f.linkType === 'Entry' && (!f.linkedContentTypes || f.linkedContentTypes.length === 0) && (
                  <span className="mt-0.5 block text-gray-400 italic">any entry type</span>
                )}
                {f.linkType === 'Asset' && (
                  <span className="mt-0.5 block text-gray-400 italic">asset</span>
                )}
              </div>
              {/* Type badge */}
              <div className="shrink-0 text-right">
                <span className={`rounded px-1.5 py-0.5 text-xs font-mono font-medium ${typeBadgeClass(f.type)}`}>
                  {f.type}
                </span>
                {TYPE_FRIENDLY[f.type] && TYPE_FRIENDLY[f.type] !== f.type && (
                  <span className="block text-[10px] text-gray-400 mt-0.5 leading-none">
                    {TYPE_FRIENDLY[f.type]}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sample entry */}
      <div className="border-t border-gray-100 px-4 pt-3 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
          Sample entry
        </p>

        {sample === 'loading' && (
          <p className="text-xs text-gray-400 animate-pulse">Loading…</p>
        )}

        {sample === 'error' && (
          <p className="text-xs text-red-400">Could not load sample entry.</p>
        )}

        {sample === null && (
          <p className="text-xs text-gray-400 italic">No entries exist yet for this type.</p>
        )}

        {sample !== null && sample !== 'loading' && sample !== 'error' && (
          <>
            <a
              href={entryUrl(spaceId, environment, sample.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono break-all text-blue-600 hover:underline mb-2 block"
            >
              {sample.id} ↗
            </a>
            <dl className="space-y-1.5">
              {ct.fields.map((f) => {
                const localeMap = sample.fields[f.id];
                const raw = localeMap?.[locale] ?? localeMap?.[Object.keys(localeMap ?? {})[0]];
                return (
                  <div key={f.id}>
                    <dt className="text-xs font-medium text-gray-500 break-words">{f.name}</dt>
                    <dd className="text-xs text-gray-700 font-mono break-words leading-relaxed">
                      {formatValue(raw)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </>
        )}
      </div>
    </div>
  );
}
