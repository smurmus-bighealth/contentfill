'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ContentTypeSummary } from '@/lib/contentful';
import type { NewFieldDefinition, NewFieldType } from '@/lib/schema-migration-shared';
import { groupContentTypes } from '@/lib/group-content-types';
import ContentTypeCheckboxPicker from './ContentTypeCheckboxPicker';

export interface AddFieldValues {
  selectedCTs: Array<{ id: string; name: string }>;
  field: NewFieldDefinition;
}

interface Props {
  contentTypes: ContentTypeSummary[];
  onSubmit: (values: AddFieldValues) => void;
}

const FIELD_TYPES: { value: NewFieldType; label: string }[] = [
  { value: 'Symbol', label: 'Short text' },
  { value: 'Text', label: 'Long text' },
  { value: 'RichText', label: 'Rich text' },
  { value: 'Integer', label: 'Integer' },
  { value: 'Number', label: 'Decimal number' },
  { value: 'Boolean', label: 'Boolean' },
  { value: 'Date', label: 'Date & time' },
  { value: 'Location', label: 'Location' },
  { value: 'Object', label: 'JSON object' },
  { value: 'Link', label: 'Reference' },
  { value: 'Array', label: 'Array' },
];

function toFieldId(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9 _]/g, '')
    .replace(/\s+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/\s/g, '')
    .replace(/^[A-Z]/, (c: string) => c.toLowerCase());
}

export default function AddFieldStep({ contentTypes, onSubmit }: Props) {
  const [ctSearch, setCtSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [fieldName, setFieldName] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [fieldIdManuallyEdited, setFieldIdManuallyEdited] = useState(false);
  const [fieldType, setFieldType] = useState<NewFieldType>('Symbol');
  const [required, setRequired] = useState(false);
  const [localized, setLocalized] = useState(false);
  const [linkType, setLinkType] = useState<'Entry' | 'Asset'>('Entry');
  const [arrayItemType, setArrayItemType] = useState<'Symbol' | 'Link'>('Symbol');
  const [arrayLinkType, setArrayLinkType] = useState<'Entry' | 'Asset'>('Entry');

  useEffect(() => {
    if (!fieldIdManuallyEdited) setFieldId(toFieldId(fieldName));
  }, [fieldName, fieldIdManuallyEdited]);

  useEffect(() => {
    setLinkType('Entry');
    setArrayItemType('Symbol');
    setArrayLinkType('Entry');
  }, [fieldType]);

  const filteredCTs = useMemo(() => {
    const q = ctSearch.toLowerCase().trim();
    if (!q) return contentTypes;
    return contentTypes.filter(
      (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  }, [contentTypes, ctSearch]);

  const groupedCTs = useMemo(() => groupContentTypes(filteredCTs), [filteredCTs]);

  function toggleCT(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(ids: string[]) {
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(
      selectedIds.size === filteredCTs.length ? new Set() : new Set(filteredCTs.map((c) => c.id)),
    );
  }

  const isReady =
    selectedIds.size > 0 &&
    fieldName.trim() !== '' &&
    fieldId.trim() !== '' &&
    /^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isReady) return;
    const field: NewFieldDefinition = {
      id: fieldId,
      name: fieldName,
      type: fieldType,
      required,
      localized,
      ...(fieldType === 'Link' ? { linkType } : {}),
      ...(fieldType === 'Array'
        ? { arrayItemType, ...(arrayItemType === 'Link' ? { arrayLinkType } : {}) }
        : {}),
    };
    const selectedCTs = contentTypes
      .filter((c) => selectedIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
    onSubmit({ selectedCTs, field });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. Select content types */}
        <fieldset className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <legend className="px-1 text-sm font-semibold text-gray-700">1. Target content types</legend>
          <p className="mt-1 text-xs text-gray-500">Select every content type that should receive the new field.</p>
          <ContentTypeCheckboxPicker
            groupedCTs={groupedCTs}
            filteredTotal={filteredCTs.length}
            selectedIds={selectedIds}
            ctSearch={ctSearch}
            onSearchChange={setCtSearch}
            onToggle={toggleCT}
            onGroupToggle={toggleGroup}
            onToggleAll={toggleAll}
          />
        </fieldset>

        {/* 2. Field definition */}
        <fieldset className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <legend className="px-1 text-sm font-semibold text-gray-700">2. Field definition</legend>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Field name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                placeholder="e.g. Short Description"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Field ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={fieldId}
                onChange={(e) => { setFieldIdManuallyEdited(true); setFieldId(e.target.value); }}
                placeholder="e.g. shortDescription"
                className={`mt-1 block w-full rounded border px-3 py-1.5 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  fieldId && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldId)
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-blue-500'
                }`}
              />
              {fieldId && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldId) && (
                <p className="mt-1 text-xs text-red-500">Must start with a letter; only letters, digits, underscores.</p>
              )}
              <p className="mt-1 text-xs text-gray-400">Auto-derived from name — edit to override.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Field type</label>
              <select
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value as NewFieldType)}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft.value} value={ft.value}>{ft.label}</option>
                ))}
              </select>
            </div>

            {fieldType === 'Link' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">References</label>
                <select
                  value={linkType}
                  onChange={(e) => setLinkType(e.target.value as 'Entry' | 'Asset')}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Entry">Entry</option>
                  <option value="Asset">Asset</option>
                </select>
              </div>
            )}

            {fieldType === 'Array' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Array item type</label>
                  <select
                    value={arrayItemType}
                    onChange={(e) => setArrayItemType(e.target.value as 'Symbol' | 'Link')}
                    className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Symbol">Short text (Symbol)</option>
                    <option value="Link">Reference (Link)</option>
                  </select>
                </div>
                {arrayItemType === 'Link' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Link references</label>
                    <select
                      value={arrayLinkType}
                      onChange={(e) => setArrayLinkType(e.target.value as 'Entry' | 'Asset')}
                      className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="Entry">Entry</option>
                      <option value="Asset">Asset</option>
                    </select>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="accent-blue-600" />
              <span>Required field</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={localized} onChange={(e) => setLocalized(e.target.checked)} className="accent-blue-600" />
              <span>Enable localization for this field</span>
            </label>
          </div>
        </fieldset>

        <div className="sticky bottom-0 -mx-4 px-4">
          <div className="pointer-events-none h-8" style={{ background: 'linear-gradient(to bottom, rgba(249,250,251,0), rgb(249,250,251))' }} />
          <div className="bg-gray-50 pb-6 pt-1">
            <button
              type="submit"
              disabled={!isReady}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Preview changes →
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
