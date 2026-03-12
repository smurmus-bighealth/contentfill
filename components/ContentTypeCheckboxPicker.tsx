'use client';

import type { ContentTypeSummary } from '@/lib/contentful';

interface Props {
  groupedCTs: {
    groups: Map<string, ContentTypeSummary[]>;
    ungrouped: ContentTypeSummary[];
  };
  filteredTotal: number;
  selectedIds: Set<string>;
  ctSearch: string;
  onSearchChange: (q: string) => void;
  onToggle: (id: string) => void;
  onGroupToggle: (ids: string[]) => void;
  onToggleAll: () => void;
}

export default function ContentTypeCheckboxPicker({
  groupedCTs,
  filteredTotal,
  selectedIds,
  ctSearch,
  onSearchChange,
  onToggle,
  onGroupToggle,
  onToggleAll,
}: Props) {
  const allFilteredSelected = filteredTotal > 0 && filteredTotal === selectedIds.size;

  return (
    <>
      <div className="mt-3 mb-4 flex items-center gap-3">
        <input
          type="search"
          placeholder="Search content types…"
          value={ctSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={onToggleAll}
          className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          {allFilteredSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {selectedIds.size > 0 && (
        <p className="mb-3 text-xs text-blue-600 font-medium">
          {selectedIds.size} content type{selectedIds.size !== 1 ? 's' : ''} selected
        </p>
      )}

      {filteredTotal === 0 && (
        <p className="text-sm text-gray-400">No content types match your search.</p>
      )}

      <div className="space-y-4">
        {Array.from(groupedCTs.groups.entries()).map(([parent, children]) => {
          const childIds = children.map((c) => c.id);
          const allSelected = childIds.every((id) => selectedIds.has(id));
          const someSelected = childIds.some((id) => selectedIds.has(id));
          return (
            <div key={parent}>
              <div className="mb-1.5 flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{parent}</p>
                <button
                  type="button"
                  onClick={() => onGroupToggle(childIds)}
                  className="text-xs text-blue-500 hover:underline"
                >
                  {allSelected ? 'Deselect all' : someSelected ? 'Select rest' : 'Select all'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {children.map((c) => {
                  const subLabel = c.name.slice(parent.length + 2);
                  return (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-3 hover:bg-gray-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => onToggle(c.id)} className="accent-blue-600" />
                      <span className="text-sm min-w-0">
                        <span className="block font-medium break-words">{subLabel}</span>
                        <span className="text-xs text-gray-400 break-all">{c.id}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}

        {groupedCTs.ungrouped.length > 0 && (
          <div>
            {groupedCTs.groups.size > 0 && (
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Other</p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {groupedCTs.ungrouped.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-3 hover:bg-gray-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                  <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => onToggle(c.id)} className="accent-blue-600" />
                  <span className="text-sm min-w-0">
                    <span className="block font-medium break-words">{c.name}</span>
                    <span className="text-xs text-gray-400 break-all">{c.id}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
