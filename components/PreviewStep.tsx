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
  spaceId: string;
  environment: string;
}

function entryUrl(spaceId: string, environment: string, entryId: string) {
  const envSegment = environment === 'master' ? '' : `/environments/${environment}`;
  return `https://app.contentful.com/spaces/${spaceId}${envSegment}/entries/${entryId}`;
}

export default function PreviewStep({ config, result, onApply, onBack, isApplying, spaceId, environment }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  // Allow manual overrides for flagged entries
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  // Merge overrides into updates before applying.
  // When overrides exist, server-side collision errors may be stale (they reference
  // pre-edit values), so we strip them and re-run duplicate detection client-side.
  function buildFinalUpdates(): TransformResult[] {
    const withOverrides = result.updates.map((u) => {
      const override = overrides[u.entryId];
      if (override !== undefined) {
        return { ...u, proposedValue: override, errors: [], warnings: ['Manually overridden'] };
      }
      return u;
    });

    if (Object.keys(overrides).length === 0) return withOverrides;

    // Strip stale collision errors then re-detect duplicates across current values
    const cleaned = withOverrides.map((u) => ({
      ...u,
      errors: u.errors.filter((e) => !e.toLowerCase().includes('collides with')),
    }));

    const seen = new Map<unknown, string[]>(); // proposedValue → [entryIds]
    for (const u of cleaned) {
      if (u.proposedValue == null || u.proposedValue === '') continue;
      const group = seen.get(u.proposedValue) ?? [];
      group.push(u.entryId);
      seen.set(u.proposedValue, group);
    }

    return cleaned.map((u) => {
      if (u.proposedValue == null || u.proposedValue === '') return u;
      const group = seen.get(u.proposedValue)!;
      if (group.length <= 1) return u;
      const otherLabels = group
        .filter((id) => id !== u.entryId)
        .map((id) => cleaned.find((o) => o.entryId === id)?.displayLabel ?? id);
      return {
        ...u,
        errors: [...u.errors, `Value "${u.proposedValue}" collides with: ${otherLabels.join(', ')}. Rename one of them.`],
      };
    });
  }

  // All display and counts derive from finalUpdates so overrides are always reflected.
  const finalUpdates = buildFinalUpdates();
  const remainingErrors = finalUpdates.filter((u) => u.errors.length > 0).length;
  const canApply = remainingErrors === 0;
  const liveErrorCount = remainingErrors;
  const liveWarningCount = finalUpdates.filter((u) => u.warnings.length > 0 && u.errors.length === 0).length;
  const applyCount = finalUpdates.filter((u) => u.errors.length === 0 && u.proposedValue !== null).length;

  const filtered = finalUpdates.filter((u) => {
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

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm text-sm">
        <span className="font-semibold text-gray-700">
          {config.contentTypeName} → <code className="rounded bg-gray-100 px-1">{config.targetField}</code>
        </span>
        <span className="ml-auto flex gap-3">
          <Chip color="blue">{applyCount} to update</Chip>
          <Chip color="gray">{result.skipped} skipped</Chip>
          {liveErrorCount > 0 && <Chip color="red">{liveErrorCount} errors</Chip>}
          {liveWarningCount > 0 && <Chip color="yellow">{liveWarningCount} warnings</Chip>}
        </span>
      </div>

      {/* Error banner */}
      {liveErrorCount > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>{liveErrorCount} {liveErrorCount === 1 ? 'entry has an error' : 'entries have errors'}</strong> and will be skipped unless you fix them manually below.
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
              <th className="px-4 py-3 text-left">{typeof config.transformConfig?.sourceField === 'string' ? config.transformConfig.sourceField : 'Entry'}</th>
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
              const hasError = u.errors.length > 0;
              const hasWarning = u.warnings.length > 0 && u.errors.length === 0;
              const isOverridden = overrides[u.entryId] !== undefined;

              return (
                <tr
                  key={u.entryId}
                  className={
                    hasError ? 'bg-red-50' : isOverridden ? 'bg-purple-50' : hasWarning ? 'bg-yellow-50' : ''
                  }
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    <a
                      href={entryUrl(spaceId, environment, u.entryId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={u.entryId}
                      className="text-blue-500 hover:underline hover:text-blue-700"
                    >
                      {u.entryId.slice(0, 8)}…
                    </a>
                  </td>
                  <td className="px-4 py-3 font-medium">{u.displayLabel}</td>
                  <td className="px-4 py-3 text-gray-400 italic">
                    {u.currentValue ? String(u.currentValue) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      key={`${u.entryId}-${isOverridden ? 'o' : 'orig'}`}
                      type="text"
                      defaultValue={isOverridden ? overrides[u.entryId] : String(u.proposedValue ?? '')}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== String(u.proposedValue ?? '')) {
                          setOverrides((prev) => ({ ...prev, [u.entryId]: val }));
                        } else {
                          // Value reset to original — remove any existing override
                          setOverrides((prev) => { const n = { ...prev }; delete n[u.entryId]; return n; });
                        }
                      }}
                      className={`w-full rounded border px-2 py-1 text-sm font-mono ${
                        hasError ? 'border-red-400 bg-red-50' : 'border-gray-200'
                      }`}
                    />
                    {u.errors.length > 0 ? (
                      u.errors.map((e) => (
                        <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
                      ))
                    ) : isOverridden ? (
                      <p className="mt-1 text-xs text-purple-600">Manually overridden</p>
                    ) : (
                      u.warnings.map((w) => (
                        <p key={w} className="mt-1 text-xs text-yellow-700">{w}</p>
                      ))
                    )}
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

      {/* Sticky actions */}
      <div className="sticky bottom-0 -mx-4 px-4">
        <div className="pointer-events-none h-8" style={{ background: 'linear-gradient(to bottom, rgba(249,250,251,0), rgb(249,250,251))' }} />
        <div className="bg-gray-50 pb-6 pt-1 flex items-center gap-3">
          <button
            onClick={onBack}
            disabled={isApplying}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
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
            {isApplying ? 'Applying…' : `Apply ${applyCount} updates`}
          </button>
        </div>
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
