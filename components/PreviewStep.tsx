'use client';

import { useState } from 'react';
import type { DryRunResult } from '@/lib/migration';
import type { TransformResult } from '@/lib/transforms';
import type { ConfigValues } from './ConfigStep';

type Filter = 'all' | 'errors' | 'warnings' | 'clean';

interface Props {
  config: ConfigValues;
  result: DryRunResult;
  onApply: (updates: TransformResult[]) => void;
  onBack: () => void;
  isApplying: boolean;
}

export default function PreviewStep({ config, result, onApply, onBack, isApplying }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  // Allow manual overrides for flagged entries
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const filtered = result.updates.filter((u) => {
    const matchesSearch =
      !search ||
      u.displayLabel.toLowerCase().includes(search.toLowerCase()) ||
      u.entryId.toLowerCase().includes(search.toLowerCase()) ||
      String(u.proposedValue ?? '').toLowerCase().includes(search.toLowerCase());

    const matchesFilter =
      filter === 'all' ||
      (filter === 'errors' && u.errors.length > 0) ||
      (filter === 'warnings' && u.warnings.length > 0 && u.errors.length === 0) ||
      (filter === 'clean' && u.errors.length === 0 && u.warnings.length === 0);

    return matchesSearch && matchesFilter;
  });

  // Merge overrides into updates before applying
  function buildFinalUpdates(): TransformResult[] {
    return result.updates.map((u) => {
      const override = overrides[u.entryId];
      if (override !== undefined) {
        return { ...u, proposedValue: override, errors: [], warnings: ['Manually overridden'] };
      }
      return u;
    });
  }

  const finalUpdates = buildFinalUpdates();
  const remainingErrors = finalUpdates.filter((u) => u.errors.length > 0).length;
  const canApply = remainingErrors === 0;

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm text-sm">
        <span className="font-semibold text-gray-700">
          {config.contentTypeName} → <code className="rounded bg-gray-100 px-1">{config.targetField}</code>
        </span>
        <span className="ml-auto flex gap-3">
          <Chip color="blue">{result.updates.length} to update</Chip>
          <Chip color="gray">{result.skipped} skipped</Chip>
          {result.errorCount > 0 && <Chip color="red">{result.errorCount} errors</Chip>}
          {result.warningCount > 0 && <Chip color="yellow">{result.warningCount} warnings</Chip>}
        </span>
      </div>

      {/* Error banner */}
      {result.errorCount > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>{result.errorCount} entries have errors</strong> and will be skipped unless you fix them manually below.
          Resolve each by editing the proposed value in the Proposed column.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search by label, ID, or proposed value…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <div className="flex gap-1 text-sm">
          {(['all', 'errors', 'warnings', 'clean'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 font-medium capitalize ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left w-32">Entry ID</th>
              <th className="px-4 py-3 text-left">Label</th>
              <th className="px-4 py-3 text-left w-36">Current value</th>
              <th className="px-4 py-3 text-left w-56">Proposed value</th>
              <th className="px-4 py-3 text-left w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">No entries match this filter.</td>
              </tr>
            )}
            {filtered.map((u) => {
              const hasError = u.errors.length > 0 && !overrides[u.entryId];
              const hasWarning = u.warnings.length > 0 && u.errors.length === 0;
              const isOverridden = overrides[u.entryId] !== undefined;

              return (
                <tr
                  key={u.entryId}
                  className={
                    hasError ? 'bg-red-50' : isOverridden ? 'bg-purple-50' : hasWarning ? 'bg-yellow-50' : ''
                  }
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{u.entryId.slice(0, 8)}…</td>
                  <td className="px-4 py-3 font-medium">{u.displayLabel}</td>
                  <td className="px-4 py-3 text-gray-400 italic">
                    {u.currentValue ? String(u.currentValue) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      defaultValue={isOverridden ? overrides[u.entryId] : String(u.proposedValue ?? '')}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== String(u.proposedValue ?? '')) {
                          setOverrides((prev) => ({ ...prev, [u.entryId]: val }));
                        }
                      }}
                      className={`w-full rounded border px-2 py-1 text-sm font-mono ${
                        hasError ? 'border-red-400 bg-red-50' : 'border-gray-200'
                      }`}
                    />
                    {u.errors.map((e) => (
                      <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
                    ))}
                    {u.warnings.map((w) => (
                      <p key={w} className="mt-1 text-xs text-yellow-700">{w}</p>
                    ))}
                  </td>
                  <td className="px-4 py-3">
                    {isOverridden && (
                      <button
                        onClick={() => setOverrides((prev) => { const n = { ...prev }; delete n[u.entryId]; return n; })}
                        title="Revert override"
                        className="text-gray-400 hover:text-gray-700"
                      >
                        ↩
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          disabled={isApplying}
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          ← Back
        </button>
        <div className="flex-1" />
        {!canApply && (
          <p className="text-sm text-red-600">
            {remainingErrors} error{remainingErrors !== 1 ? 's' : ''} must be resolved before applying.
          </p>
        )}
        <button
          onClick={() => onApply(finalUpdates)}
          disabled={!canApply || isApplying}
          className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isApplying ? 'Applying…' : `Apply ${finalUpdates.filter(u => u.errors.length === 0).length} updates`}
        </button>
      </div>
    </div>
  );
}

function Chip({ color, children }: { color: 'blue' | 'gray' | 'red' | 'yellow'; children: React.ReactNode }) {
  const colors = {
    blue: 'bg-blue-100 text-blue-700',
    gray: 'bg-gray-100 text-gray-600',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors[color]}`}>
      {children}
    </span>
  );
}
