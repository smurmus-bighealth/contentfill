'use client';

import { useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { parseCsv, generateTemplateCsv, CSV_ROW_LIMIT, CSV_ROW_WARNING } from '@/lib/csv-parser';
import type { ContentTypeSummary } from '@/lib/contentful';
import type {
  CsvRow,
  ColumnMapping,
  CsvImportConfig,
  CsvEntryProposal,
  CsvPreviewResult,
  CsvApplyResult,
  ResolvedRef,
} from '@/lib/csv-types';

type CsvStep = 'upload' | 'mapping' | 'preview' | 'apply';

const PAGE_SIZE = 25;
type PreviewFilter = 'all' | 'create' | 'update' | 'errors' | 'warnings';

// ── Root flow ─────────────────────────────────────────────────────────────────

export default function CsvImportFlow({
  contentTypes,
  spaceId,
  environment,
}: {
  contentTypes: ContentTypeSummary[];
  spaceId: string;
  environment: string;
}) {
  const [step, setStep] = useState<CsvStep>('upload');
  const [contentTypeId, setContentTypeId] = useState('');
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [previewResult, setPreviewResult] = useState<CsvPreviewResult | null>(null);
  const [applyResult, setApplyResult] = useState<CsvApplyResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originalRows, setOriginalRows] = useState<CsvRow[]>([]);

  const selectedCT = contentTypes.find((ct) => ct.id === contentTypeId) ?? null;

  function reset() {
    setStep('upload');
    setContentTypeId('');
    setRows([]);
    setCsvColumns([]);
    setMappings([]);
    setPreviewResult(null);
    setApplyResult(null);
    setError(null);
    setOriginalRows([]);
  }

  async function handleMappingSubmit(finalMappings: ColumnMapping[], locale: string) {
    setMappings(finalMappings);
    setError(null);
    setIsLoading(true);
    const config: CsvImportConfig = {
      contentTypeId,
      locale,
      mappings: finalMappings,
    };
    try {
      const result = await apiFetch<CsvPreviewResult>('/api/csv-preview', {
        method: 'POST',
        json: { rows, config },
      });
      setPreviewResult(result);
      setStep('preview');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApply(proposals: CsvEntryProposal[], locale: string) {
    setError(null);
    setIsLoading(true);
    const config: CsvImportConfig = { contentTypeId, locale, mappings };
    try {
      const result = await apiFetch<CsvApplyResult>('/api/csv-apply', {
        method: 'POST',
        json: { proposals, config },
      });
      setApplyResult(result);
      setStep('apply');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  const allSucceeded =
    step === 'apply' &&
    !!applyResult &&
    applyResult.failed.length === 0 &&
    (applyResult.created.length + applyResult.updated.length) > 0;

  const csvSteps: { id: CsvStep; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'mapping', label: 'Map Columns' },
    { id: 'preview', label: 'Preview' },
    { id: 'apply', label: 'Results' },
  ];
  const currentIdx = csvSteps.findIndex((s) => s.id === step);

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <ol className="flex items-center gap-0 text-sm">
        {csvSteps.map((s, i) => {
          const done = i < currentIdx || (allSucceeded && i === currentIdx);
          const active = i === currentIdx && !done;
          return (
            <li key={s.id} className="flex items-center">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {done ? '✓' : i + 1}
              </span>
              <span className={`ml-2 font-medium ${done || active ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</span>
              {i < csvSteps.length - 1 && <span className="mx-4 text-gray-300">—</span>}
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {step === 'upload' && (
        <UploadStep
          contentTypes={contentTypes}
          contentTypeId={contentTypeId}
          onContentTypeChange={setContentTypeId}
          onParsed={(parsedRows, cols) => {
            setRows(parsedRows);
            setOriginalRows(parsedRows);
            setCsvColumns(cols);
            // Auto-build initial mappings
            const ct = contentTypes.find((c) => c.id === contentTypeId);
            const initial: ColumnMapping[] = cols.map((col) => {
              const match = ct?.fields.find((f) => f.id === col);
              return { csvColumn: col, fieldId: match ? col : null };
            });
            setMappings(initial);
            setStep('mapping');
          }}
        />
      )}

      {step === 'mapping' && selectedCT && (
        <>
          {isLoading && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              Fetching entries and resolving references… this may take a moment.
            </div>
          )}
          <MappingStep
            csvColumns={csvColumns}
            contentType={selectedCT}
            initialMappings={mappings}
            rowCount={rows.length}
            onBack={() => setStep('upload')}
            onSubmit={handleMappingSubmit}
            isLoading={isLoading}
          />
        </>
      )}

      {step === 'preview' && previewResult && selectedCT && (
        <PreviewStep
          result={previewResult}
          contentType={selectedCT}
          spaceId={spaceId}
          environment={environment}
          onBack={() => setStep('mapping')}
          onApply={handleApply}
          isApplying={isLoading}
          locale={mappings.length > 0 ? 'en-US' : 'en-US'}
        />
      )}

      {step === 'apply' && applyResult && (
        <ApplyStep
          result={applyResult}
          originalRows={originalRows}
          spaceId={spaceId}
          environment={environment}
          onReset={reset}
        />
      )}
    </div>
  );
}

// ── Upload step ───────────────────────────────────────────────────────────────

function UploadStep({
  contentTypes,
  contentTypeId,
  onContentTypeChange,
  onParsed,
}: {
  contentTypes: ContentTypeSummary[];
  contentTypeId: string;
  onContentTypeChange: (id: string) => void;
  onParsed: (rows: CsvRow[], columns: string[]) => void;
}) {
  const [parseError, setParseError] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedCT = contentTypes.find((ct) => ct.id === contentTypeId) ?? null;

  function handleFile(file: File) {
    setParseError(null);
    setRowCount(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const rows = parseCsv(text);
        if (rows.length === 0) {
          setParseError('No data rows found in CSV (only a header row or empty file).');
          return;
        }
        if (rows.length > CSV_ROW_LIMIT) {
          setParseError(`CSV has ${rows.length} rows, which exceeds the ${CSV_ROW_LIMIT}-row limit. Split it into smaller files.`);
          return;
        }
        setRowCount(rows.length);

        // Extract non-reserved columns
        const allKeys = new Set<string>();
        for (const row of rows) {
          for (const key of Object.keys(row)) {
            if (key !== '_id' && key !== '_locale') allKeys.add(key);
          }
        }
        onParsed(rows, Array.from(allKeys));
      } catch (err) {
        setParseError(`CSV parse error: ${String(err)}`);
      }
    };
    reader.readAsText(file);
  }

  function downloadTemplate() {
    if (!selectedCT) return;
    const csv = generateTemplateCsv(selectedCT.fields);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedCT.id}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Content type</label>
          <select
            value={contentTypeId}
            onChange={(e) => onContentTypeChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a content type…</option>
            {contentTypes.map((ct) => (
              <option key={ct.id} value={ct.id}>{ct.name} ({ct.id})</option>
            ))}
          </select>
        </div>

        {selectedCT && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              ↓ Download template CSV
            </button>
            <span className="text-xs text-gray-400">
              {selectedCT.fields.length} fields · fill in the template, then upload it below
            </span>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Upload CSV</label>
          <div
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
          >
            <div className="text-3xl text-gray-400 mb-2">📄</div>
            <p className="text-sm font-medium text-gray-700">Drop a CSV here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">Max {CSV_ROW_LIMIT} rows · UTF-8 · .csv</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={!contentTypeId}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
          {!contentTypeId && (
            <p className="mt-2 text-xs text-gray-400">Select a content type first to enable file upload.</p>
          )}
        </div>

        {parseError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{parseError}</div>
        )}
        {rowCount !== null && !parseError && (
          <div className={`rounded-md border px-4 py-3 text-sm ${rowCount >= CSV_ROW_WARNING ? 'border-yellow-200 bg-yellow-50 text-yellow-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
            {rowCount >= CSV_ROW_WARNING && <strong>Large upload: </strong>}
            {rowCount} data rows detected.
            {rowCount >= CSV_ROW_WARNING && ' Preview and apply may take longer than usual.'}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mapping step ──────────────────────────────────────────────────────────────

function MappingStep({
  csvColumns,
  contentType,
  initialMappings,
  rowCount,
  onBack,
  onSubmit,
  isLoading,
}: {
  csvColumns: string[];
  contentType: ContentTypeSummary;
  initialMappings: ColumnMapping[];
  rowCount: number;
  onBack: () => void;
  onSubmit: (mappings: ColumnMapping[], locale: string) => void;
  isLoading: boolean;
}) {
  const [mappings, setMappings] = useState<ColumnMapping[]>(initialMappings);
  const [locale, setLocale] = useState('en-US');

  function setFieldId(csvColumn: string, fieldId: string | null) {
    setMappings((prev) => prev.map((m) => m.csvColumn === csvColumn ? { ...m, fieldId, resolveByField: undefined } : m));
  }

  function setResolveBy(csvColumn: string, resolveByField: string) {
    setMappings((prev) => prev.map((m) => m.csvColumn === csvColumn ? { ...m, resolveByField: resolveByField || undefined } : m));
  }

  const referenceFieldTypes = new Set(['Link']);
  const arrayRefFields = contentType.fields.filter((f) => f.type === 'Array' && f.linkType === 'Entry');
  const singleRefFields = contentType.fields.filter((f) => f.type === 'Link' && f.linkType === 'Entry');
  const refFieldIds = new Set([...arrayRefFields.map((f) => f.id), ...singleRefFields.map((f) => f.id)]);
  void referenceFieldTypes;

  const mappedCount = mappings.filter((m) => m.fieldId !== null).length;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Map columns to fields</h2>
            <p className="text-sm text-gray-500 mt-0.5">{rowCount} rows · {mappedCount} of {csvColumns.length} columns mapped</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mr-2">Locale</label>
            <input
              type="text"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm w-28 font-mono"
              placeholder="en-US"
            />
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">CSV column</th>
              <th className="px-4 py-2 text-left">Maps to field</th>
              <th className="px-4 py-2 text-left">Resolve references by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {mappings.map((m) => {
              const isRef = m.fieldId ? refFieldIds.has(m.fieldId) : false;
              const mappedField = contentType.fields.find((f) => f.id === m.fieldId);
              return (
                <tr key={m.csvColumn} className={m.fieldId === null ? 'opacity-50' : ''}>
                  <td className="px-4 py-2 font-mono text-xs">{m.csvColumn}</td>
                  <td className="px-4 py-2">
                    <select
                      value={m.fieldId ?? '__ignore__'}
                      onChange={(e) => setFieldId(m.csvColumn, e.target.value === '__ignore__' ? null : e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value="__ignore__">— ignore —</option>
                      {contentType.fields.map((f) => (
                        <option key={f.id} value={f.id}>{f.name} ({f.id}) · {f.type}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {isRef ? (
                      <div className="flex flex-col gap-1">
                        <select
                          value={m.resolveByField ?? ''}
                          onChange={(e) => setResolveBy(m.csvColumn, e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                        >
                          <option value="">Use bare entry ID</option>
                          {contentType.fields
                            .filter((f) => f.type === 'Symbol' || f.type === 'Text')
                            .map((f) => (
                              <option key={f.id} value={f.id}>Match by {f.name} ({f.id})</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-400">
                          {m.resolveByField
                            ? `Looks up entries where "${m.resolveByField}" matches the cell value`
                            : 'Cell values must be Contentful entry IDs'}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">
                        {mappedField ? mappedField.type : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          ← Back
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onSubmit(mappings, locale)}
          disabled={isLoading || mappedCount === 0}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? 'Generating preview…' : 'Preview →'}
        </button>
      </div>
    </div>
  );
}

// ── Preview step ──────────────────────────────────────────────────────────────

function PreviewStep({
  result,
  contentType,
  spaceId,
  environment,
  onBack,
  onApply,
  isApplying,
  locale,
}: {
  result: CsvPreviewResult;
  contentType: ContentTypeSummary;
  spaceId: string;
  environment: string;
  onBack: () => void;
  onApply: (proposals: CsvEntryProposal[], locale: string) => void;
  isApplying: boolean;
  locale: string;
}) {
  const [filter, setFilter] = useState<PreviewFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filtered = result.proposals.filter((p) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'create' && p.action === 'create') ||
      (filter === 'update' && p.action === 'update') ||
      (filter === 'errors' && p.errors.length > 0) ||
      (filter === 'warnings' && p.warnings.length > 0 && p.errors.length === 0);

    const matchesSearch =
      !search ||
      p.displayLabel.toLowerCase().includes(search.toLowerCase()) ||
      (p.entryId ?? '').toLowerCase().includes(search.toLowerCase()) ||
      p.rowIndex.toString().includes(search);

    return matchesFilter && matchesSearch;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageSlice = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const canApply = result.canApply;
  const eligibleCount = result.proposals.filter((p) => p.errors.length === 0).length;

  function entryUrl(entryId: string) {
    const envSeg = environment === 'master' ? '' : `/environments/${environment}`;
    return `https://app.contentful.com/spaces/${spaceId}${envSeg}/entries/${entryId}`;
  }

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm text-sm">
        <span className="font-semibold text-gray-700">{contentType.name}</span>
        <span className="flex flex-wrap gap-2 ml-auto">
          <Chip color="blue">{result.createCount} creates</Chip>
          <Chip color="gray">{result.updateCount} updates</Chip>
          {result.errorCount > 0 && <Chip color="red">{result.errorCount} errors</Chip>}
          {result.warningCount > 0 && <Chip color="yellow">{result.warningCount} warnings</Chip>}
        </span>
      </div>

      {result.errorCount > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>{result.errorCount} rows have errors</strong> and will be skipped. Fix the CSV and re-upload, or proceed and skip the errored rows.
        </div>
      )}

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search by label, row #, or entry ID…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="flex-1 min-w-40 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <div className="flex gap-1 text-sm flex-wrap">
          {(['all', 'create', 'update', 'errors', 'warnings'] as PreviewFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(0); }}
              className={`rounded-full px-3 py-1 font-medium capitalize ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
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
              <th className="px-4 py-3 text-left w-10">#</th>
              <th className="px-4 py-3 text-left w-24">Action</th>
              <th className="px-4 py-3 text-left">Label</th>
              <th className="px-4 py-3 text-left w-28">Entry ID</th>
              <th className="px-4 py-3 text-left">Fields</th>
              <th className="px-4 py-3 text-left w-48">Issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {pageSlice.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No rows match this filter.</td></tr>
            )}
            {pageSlice.map((p) => (
              <tr
                key={p.rowIndex}
                className={p.errors.length > 0 ? 'bg-red-50' : p.warnings.length > 0 ? 'bg-yellow-50' : ''}
              >
                <td className="px-4 py-3 text-xs text-gray-400">{p.rowIndex + 1}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${p.action === 'create' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    {p.action}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">{p.displayLabel}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {p.entryId ? (
                    <a href={entryUrl(p.entryId)} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline" title={p.entryId}>
                      {p.entryId.slice(0, 8)}…
                    </a>
                  ) : <span className="text-gray-400">new</span>}
                </td>
                <td className="px-4 py-3">
                  <FieldSummary proposal={p} contentType={contentType} />
                </td>
                <td className="px-4 py-3">
                  {p.errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                  {p.warnings.map((w, i) => <p key={i} className="text-xs text-yellow-700">{w}</p>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{filtered.length} rows · page {safePage + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="rounded border border-gray-300 px-3 py-1 disabled:opacity-40 hover:bg-gray-50">← Prev</button>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage === totalPages - 1} className="rounded border border-gray-300 px-3 py-1 disabled:opacity-40 hover:bg-gray-50">Next →</button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="sticky bottom-0 -mx-4 px-4">
        <div className="pointer-events-none h-8" style={{ background: 'linear-gradient(to bottom, rgba(249,250,251,0), rgb(249,250,251))' }} />
        <div className="bg-gray-50 pb-6 pt-1 flex items-center gap-3">
          <button onClick={onBack} disabled={isApplying} className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            ← Back
          </button>
          <div className="flex-1" />
          {!canApply && (
            <p className="text-sm text-red-600">{result.errorCount} error{result.errorCount !== 1 ? 's' : ''} — errored rows will be skipped.</p>
          )}
          <button
            onClick={() => onApply(result.proposals.filter((p) => p.errors.length === 0), locale)}
            disabled={isApplying || eligibleCount === 0}
            className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isApplying ? 'Applying…' : `Apply ${eligibleCount} entries as drafts`}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldSummary({ proposal, contentType }: { proposal: CsvEntryProposal; contentType: ContentTypeSummary }) {
  const fieldEntries = Object.entries(proposal.fields);
  if (fieldEntries.length === 0) return <span className="text-xs text-gray-400">no fields</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {fieldEntries.slice(0, 4).map(([fieldId]) => {
        const hasRefIssue = (proposal.referenceResolutions[fieldId] ?? []).some((r) => r.error);
        const isNewRow = (proposal.referenceResolutions[fieldId] ?? []).some((r) => r.isNewRow);
        return (
          <span
            key={fieldId}
            className={`rounded px-1.5 py-0.5 text-xs font-mono ${hasRefIssue ? 'bg-yellow-100 text-yellow-700' : isNewRow ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}
            title={contentType.fields.find((f) => f.id === fieldId)?.name ?? fieldId}
          >
            {fieldId}
          </span>
        );
      })}
      {fieldEntries.length > 4 && <span className="text-xs text-gray-400">+{fieldEntries.length - 4} more</span>}
    </div>
  );
}

// ── Apply / results step ──────────────────────────────────────────────────────

function ApplyStep({
  result,
  originalRows,
  spaceId,
  environment,
  onReset,
}: {
  result: CsvApplyResult;
  originalRows: CsvRow[];
  spaceId: string;
  environment: string;
  onReset: () => void;
}) {
  const total = result.created.length + result.updated.length + result.failed.length;
  const succeeded = result.created.length + result.updated.length;
  const allOk = result.failed.length === 0;

  function entryUrl(entryId: string) {
    const envSeg = environment === 'master' ? '' : `/environments/${environment}`;
    return `https://app.contentful.com/spaces/${spaceId}${envSeg}/entries/${entryId}`;
  }

  function downloadFailureReport() {
    if (result.failed.length === 0) return;
    const headers = Object.keys(originalRows[0] ?? {});
    const lines = [
      [...headers, '_error'].join(','),
      ...result.failed.map((f) => {
        const row = originalRows[f.rowIndex] ?? {};
        const vals = headers.map((h) => csvQuote(row[h] ?? ''));
        vals.push(csvQuote(f.error));
        return vals.join(',');
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'csv-import-failures.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className={`rounded-lg border p-5 shadow-sm ${allOk ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
        <p className="text-base font-semibold text-gray-900">
          {allOk ? `All ${total} entries saved as drafts.` : `${succeeded} of ${total} entries saved as drafts.`}
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          {result.created.length > 0 && <Chip color="blue">{result.created.length} created</Chip>}
          {result.updated.length > 0 && <Chip color="gray">{result.updated.length} updated</Chip>}
          {result.failed.length > 0 && <Chip color="red">{result.failed.length} failed</Chip>}
        </div>
        <p className="mt-3 text-xs text-gray-500">Entries were saved as drafts. Use the Contentful UI or a future &quot;Bulk Publish&quot; workflow to publish them.</p>
      </div>

      {result.created.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wide">Created entries</div>
          <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {result.created.map(({ rowIndex, entryId }) => (
              <li key={entryId} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-gray-500 text-xs">Row {rowIndex + 1}</span>
                <a href={entryUrl(entryId)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-blue-500 hover:underline">{entryId}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.failed.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-red-50">
            <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">Failed rows</span>
            <button onClick={downloadFailureReport} className="text-xs text-red-600 underline hover:text-red-800">Download failure report CSV</button>
          </div>
          <ul className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {result.failed.map((f) => (
              <li key={f.rowIndex} className="px-4 py-2 text-sm">
                <span className="text-gray-500 text-xs mr-2">Row {f.rowIndex + 1}</span>
                <span className="text-red-600 text-xs">{f.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onReset} className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          Start new import
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Chip({ color, children }: { color: 'blue' | 'gray' | 'red' | 'yellow' | 'green'; children: React.ReactNode }) {
  const colors = {
    blue: 'bg-blue-100 text-blue-700',
    gray: 'bg-gray-100 text-gray-600',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    green: 'bg-green-100 text-green-700',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors[color]}`}>{children}</span>;
}

function csvQuote(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

// Kept for potential future use in reference resolution display
void ((_ref: ResolvedRef) => {});
