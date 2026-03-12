'use client';

import { useMemo, useState } from 'react';
import type { ContentTypeSummary } from '@/lib/contentful';
import { groupContentTypes } from '@/lib/group-content-types';
import ContentTypeCheckboxPicker from './ContentTypeCheckboxPicker';

export interface DeleteFieldValues {
  selectedCTs: Array<{ id: string; name: string }>;
  fieldId: string;
  fieldName: string;
  fieldType: string;
}

interface Props {
  contentTypes: ContentTypeSummary[];
  onSubmit: (values: DeleteFieldValues) => void;
}

export default function DeleteFieldStep({ contentTypes, onSubmit }: Props) {
  const [ctSearch, setCtSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedFieldId, setSelectedFieldId] = useState('');

  const filteredCTs = useMemo(() => {
    const q = ctSearch.toLowerCase().trim();
    if (!q) return contentTypes;
    return contentTypes.filter(
      (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  }, [contentTypes, ctSearch]);

  const groupedCTs = useMemo(() => groupContentTypes(filteredCTs), [filteredCTs]);

  // Fields available across selected CTs, with count of how many selected CTs have each
  const fieldOptions = useMemo(() => {
    const map = new Map<string, { name: string; type: string; count: number }>();
    for (const ct of contentTypes.filter((c) => selectedIds.has(c.id))) {
      for (const f of ct.fields) {
        if (map.has(f.id)) {
          map.get(f.id)!.count++;
        } else {
          map.set(f.id, { name: f.name, type: f.type, count: 1 });
        }
      }
    }
    return Array.from(map.entries())
      .map(([id, meta]) => ({ id, ...meta }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [contentTypes, selectedIds]);

  function toggleCT(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedFieldId('');
  }

  function toggleGroup(ids: string[]) {
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
    setSelectedFieldId('');
  }

  function toggleAll() {
    setSelectedIds(
      selectedIds.size === filteredCTs.length ? new Set() : new Set(filteredCTs.map((c) => c.id)),
    );
    setSelectedFieldId('');
  }

  const selectedCTCount = selectedIds.size;
  const isReady = selectedCTCount > 0 && selectedFieldId !== '';
  const selectedField = fieldOptions.find((f) => f.id === selectedFieldId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isReady || !selectedField) return;
    const selectedCTs = contentTypes
      .filter((c) => selectedIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
    onSubmit({ selectedCTs, fieldId: selectedFieldId, fieldName: selectedField.name, fieldType: selectedField.type });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Warning banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Destructive operation.</strong> Deleting a field is permanent and removes all stored data for that field across every entry. Use the preview step to confirm before applying.
      </div>

      {/* 1. Select content types */}
      <fieldset className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <legend className="px-1 text-sm font-semibold text-gray-700">1. Target content types</legend>
        <p className="mt-1 text-xs text-gray-500">Select the content types to remove the field from.</p>
        <ContentTypeCheckboxPicker
          groupedCTs={groupedCTs}
          filteredTotal={filteredCTs.length}
          selectedIds={selectedIds}
          ctSearch={ctSearch}
          onSearchChange={(q) => { setCtSearch(q); setSelectedFieldId(''); }}
          onToggle={toggleCT}
          onGroupToggle={toggleGroup}
          onToggleAll={toggleAll}
        />
      </fieldset>

      {/* 2. Field to delete */}
      {selectedCTCount > 0 && (
        <fieldset className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <legend className="px-1 text-sm font-semibold text-gray-700">2. Field to delete</legend>

          {fieldOptions.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400">No fields found in the selected content types.</p>
          ) : (
            <>
              <p className="mt-1 mb-3 text-xs text-gray-500">
                The count badge shows how many of the {selectedCTCount} selected type{selectedCTCount !== 1 ? 's' : ''} contain each field.
              </p>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {fieldOptions.map((f) => (
                  <label
                    key={f.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-gray-50 has-[:checked]:border-red-400 has-[:checked]:bg-red-50"
                  >
                    <input
                      type="radio"
                      name="fieldToDelete"
                      value={f.id}
                      checked={selectedFieldId === f.id}
                      onChange={() => setSelectedFieldId(f.id)}
                      onClick={() => { if (selectedFieldId === f.id) setSelectedFieldId(''); }}
                      className="accent-red-600"
                    />
                    <span className="flex-1 min-w-0 text-sm">
                      <span className="font-medium text-gray-800">{f.name}</span>
                      <span className="ml-2 font-mono text-xs text-gray-400">{f.id}</span>
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-500">{f.type}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${f.count === selectedCTCount ? 'bg-gray-200 text-gray-600' : 'bg-amber-100 text-amber-700'}`}>
                      {f.count}/{selectedCTCount}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </fieldset>
      )}

      <div className="sticky bottom-0 -mx-4 px-4">
        <div className="pointer-events-none h-8" style={{ background: 'linear-gradient(to bottom, rgba(249,250,251,0), rgb(249,250,251))' }} />
        <div className="bg-gray-50 pb-6 pt-1">
          <button
            type="submit"
            disabled={!isReady}
            className="rounded-lg bg-red-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Preview deletion →
          </button>
        </div>
      </div>
    </form>
  );
}
