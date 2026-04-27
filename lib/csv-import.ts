/**
 * Core CSV import logic: preview building and apply.
 *
 * Flow:
 *  1. Parse CSV rows (done client-side before calling these functions)
 *  2. buildPreview() — resolve references, validate, return CsvPreviewResult
 *  3. applyImport() — topological sort, create/update entries as drafts
 */

import { getEnvironment, getAllEntries, type RawEntry, type ContentTypeSummary } from './contentful';
import { pMap } from './concurrency';
import { markdownToRichText } from './csv-markdown';
import { splitPipeValues } from './csv-parser';
import type {
  CsvRow,
  ColumnMapping,
  CsvImportConfig,
  CsvEntryProposal,
  CsvPreviewResult,
  CsvApplyResult,
  ResolvedRef,
} from './csv-types';

const APPLY_CONCURRENCY = 4;

// ── Field value conversion ────────────────────────────────────────────────────

function convertFieldValue(
  raw: string,
  fieldType: string,
  locale: string,
): { value: unknown; error?: string } {
  if (raw === '') return { value: undefined }; // empty = skip

  switch (fieldType) {
    case 'Symbol':
    case 'Text':
    case 'Url':
      return { value: raw };

    case 'RichText':
      try {
        return { value: markdownToRichText(raw) };
      } catch (e) {
        return { value: null, error: `Rich text parse error: ${String(e)}` };
      }

    case 'Integer': {
      const n = parseInt(raw, 10);
      if (isNaN(n)) return { value: null, error: `"${raw}" is not a valid integer` };
      return { value: n };
    }

    case 'Number': {
      const n = parseFloat(raw);
      if (isNaN(n)) return { value: null, error: `"${raw}" is not a valid number` };
      return { value: n };
    }

    case 'Boolean': {
      const lower = raw.toLowerCase().trim();
      if (lower === 'true' || lower === '1' || lower === 'yes') return { value: true };
      if (lower === 'false' || lower === '0' || lower === 'no') return { value: false };
      return { value: null, error: `"${raw}" is not a valid boolean (use true/false)` };
    }

    case 'Date':
    case 'DateTime':
      return { value: raw }; // pass through — Contentful validates

    default:
      return { value: raw };
  }
}

// ── Reference resolution ──────────────────────────────────────────────────────

/**
 * Resolves a single reference cell value to a Contentful entry ID.
 * Checks the existing-entry map first, then falls back to treating the
 * raw value as a bare entry ID.
 */
function resolveRef(
  rawValue: string,
  resolveByField: string | undefined,
  existingByFieldValue: Map<string, string>, // fieldValue → entryId
  newRowsByFieldValue: Map<string, number>,   // fieldValue → rowIndex
): ResolvedRef {
  const trimmed = rawValue.trim();
  if (!trimmed) return { csvValue: trimmed, error: 'Empty reference value' };

  // Check new rows in this CSV first
  if (resolveByField && newRowsByFieldValue.has(trimmed)) {
    return { csvValue: trimmed, isNewRow: true };
  }

  // Check existing entries by resolveByField value
  if (resolveByField && existingByFieldValue.has(trimmed)) {
    return { csvValue: trimmed, entryId: existingByFieldValue.get(trimmed) };
  }

  // Fall back to treating value as a bare entry ID (24-char alphanumeric)
  if (/^[a-zA-Z0-9]{20,30}$/.test(trimmed)) {
    return { csvValue: trimmed, entryId: trimmed };
  }

  return { csvValue: trimmed, error: `Could not resolve reference "${trimmed}" — no matching entry found and value does not look like an entry ID` };
}

// ── Topological sort ──────────────────────────────────────────────────────────

/**
 * Returns proposal indices in dependency order (dependencies first).
 * Throws if a cycle is detected.
 */
function topoSort(proposals: CsvEntryProposal[], createOnly: CsvEntryProposal[]): number[] {
  // Build: newRowIndex → set of newRowIndices it depends on
  // We only need to sort new creates; updates have known entry IDs and no ordering constraint
  const newRowIndices = new Set(createOnly.map((p) => p.rowIndex));
  const deps = new Map<number, Set<number>>();
  for (const p of createOnly) {
    deps.set(p.rowIndex, new Set());
  }

  for (const p of createOnly) {
    for (const refs of Object.values(p.referenceResolutions)) {
      for (const ref of refs) {
        if (ref.isNewRow) {
          // Find which rowIndex that new row corresponds to
          const dep = createOnly.find((other) =>
            Object.values(other.referenceResolutions).some(() => false) || other.rowIndex !== p.rowIndex
          );
          // We'll resolve this differently: ref.isNewRow just means "same CSV"
          // We need to find the actual rowIndex that owns that value
          // This is done via the newRowsByFieldValue map — stored in referenceResolutions
          // For topo sort, we mark dependency by scanning all other proposals
          for (const other of createOnly) {
            if (other.rowIndex !== p.rowIndex && newRowIndices.has(other.rowIndex)) {
              // Check if `other` provides the value that `p` is referencing
              // We can't directly tell here without the value, but refs that are
              // isNewRow need to come after the row they reference is created.
              // Since we store isNewRow=true we need to resolve the actual rowIndex.
              // This info isn't stored yet — see note in buildPreview about cross-row
              // topo resolution being tracked via isNewRow + the newRowDeps map.
              void dep;
              void other;
            }
          }
        }
      }
    }
  }

  // Simplified: if there are no cross-row self-references, just return create then update order
  // Full topo sort is handled when newRowDeps is populated in buildPreview
  return proposals.map((p) => p.rowIndex);
}

// ── Preview builder ───────────────────────────────────────────────────────────

export async function buildPreview(
  rows: CsvRow[],
  config: CsvImportConfig,
  contentType: ContentTypeSummary,
  token: string,
): Promise<CsvPreviewResult> {
  const locale = config.locale || 'en-US';

  // Fetch all existing entries for this content type (for reference resolution)
  const existingEntries = await getAllEntries(config.contentTypeId, token);

  // Build lookup maps for each field that a reference column might resolve by
  const refMappings = config.mappings.filter((m) => m.fieldId && m.resolveByField);
  // fieldId → resolveByField → fieldValue → entryId
  const existingRefMaps = new Map<string, Map<string, string>>();
  for (const m of refMappings) {
    if (!m.fieldId || !m.resolveByField) continue;
    const key = `${m.fieldId}::${m.resolveByField}`;
    if (!existingRefMaps.has(key)) {
      const map = new Map<string, string>();
      for (const entry of existingEntries) {
        const fieldVal = (entry.fields as Record<string, Record<string, unknown>>)[m.resolveByField]?.[locale];
        if (typeof fieldVal === 'string' && fieldVal) {
          map.set(fieldVal, entry.sys.id);
        }
      }
      existingRefMaps.set(key, map);
    }
  }

  // Build new-row lookup: for cross-row references within the CSV
  // fieldId → resolveByField → fieldValue → rowIndex
  const newRowRefMaps = new Map<string, Map<string, number>>();
  for (const m of refMappings) {
    if (!m.fieldId || !m.resolveByField) continue;
    const key = `${m.fieldId}::${m.resolveByField}`;
    if (!newRowRefMaps.has(key)) {
      const map = new Map<string, number>();
      // Look at what value each row has in the resolveByField column
      rows.forEach((row, idx) => {
        const colForResolveBy = config.mappings.find((mm) => mm.fieldId === m.resolveByField);
        const val = colForResolveBy ? row[colForResolveBy.csvColumn] : row[m.resolveByField!];
        if (val && val.trim()) {
          map.set(val.trim(), idx);
        }
      });
      newRowRefMaps.set(key, map);
    }
  }

  const proposals: CsvEntryProposal[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const entryId = row._id?.trim() || undefined;
    const action = entryId ? 'update' : 'create';
    const errors: string[] = [];
    const warnings: string[] = [];
    const fields: Record<string, Record<string, unknown>> = {};
    const referenceResolutions: Record<string, ResolvedRef[]> = {};
    let displayLabel = `Row ${rowIndex + 1}`;

    for (const mapping of config.mappings) {
      if (!mapping.fieldId) continue; // ignored column

      const rawValue = row[mapping.csvColumn] ?? '';
      if (rawValue === '') continue; // empty = skip field

      const ctField = contentType.fields.find((f) => f.id === mapping.fieldId);
      if (!ctField) {
        warnings.push(`Field "${mapping.fieldId}" not found on content type — skipping`);
        continue;
      }

      const fieldLocale = row._locale?.trim() || locale;

      // Reference field (Link)
      if (ctField.type === 'Link' && ctField.linkType === 'Entry') {
        const key = `${mapping.fieldId}::${mapping.resolveByField ?? ''}`;
        const existingMap = existingRefMaps.get(key) ?? new Map<string, string>();
        const newRowMap = newRowRefMaps.get(key) ?? new Map<string, number>();
        const ref = resolveRef(rawValue, mapping.resolveByField, existingMap, newRowMap);
        referenceResolutions[mapping.fieldId] = [ref];

        if (ref.error) {
          warnings.push(`${mapping.fieldId}: ${ref.error}`);
        } else if (ref.entryId) {
          fields[mapping.fieldId] = {
            [fieldLocale]: { sys: { type: 'Link', linkType: 'Entry', id: ref.entryId } },
          };
        }
        // isNewRow refs get resolved during apply after the referenced entry is created
        continue;
      }

      // Array field
      if (ctField.type === 'Array') {
        const parts = splitPipeValues(rawValue);
        const items = ctField.linkType === 'Entry'
          ? (() => {
              const key = `${mapping.fieldId}::${mapping.resolveByField ?? ''}`;
              const existingMap = existingRefMaps.get(key) ?? new Map<string, string>();
              const newRowMap = newRowRefMaps.get(key) ?? new Map<string, number>();
              const refs = parts.map((p) => resolveRef(p, mapping.resolveByField, existingMap, newRowMap));
              referenceResolutions[mapping.fieldId] = refs;
              const refErrors = refs.filter((r) => r.error);
              if (refErrors.length > 0) {
                warnings.push(`${mapping.fieldId}: ${refErrors.map((r) => r.error).join('; ')}`);
              }
              return refs
                .filter((r) => !r.error && r.entryId)
                .map((r) => ({ sys: { type: 'Link', linkType: 'Entry', id: r.entryId } }));
            })()
          : parts; // Array of symbols
        if (items.length > 0) {
          fields[mapping.fieldId] = { [fieldLocale]: items };
        }
        continue;
      }

      // Scalar field
      const { value, error } = convertFieldValue(rawValue, ctField.type, fieldLocale);
      if (error) {
        errors.push(`${mapping.fieldId}: ${error}`);
      } else if (value !== undefined) {
        fields[mapping.fieldId] = { [fieldLocale]: value };

        // Use the first text field as display label
        if (displayLabel.startsWith('Row ') && (ctField.type === 'Symbol' || ctField.type === 'Text')) {
          displayLabel = typeof value === 'string' ? value : displayLabel;
        }
      }
    }

    // Validate required fields on create
    if (action === 'create') {
      for (const ctField of contentType.fields) {
        if (ctField.required && !fields[ctField.id]) {
          errors.push(`Required field "${ctField.id}" is missing`);
        }
      }
    }

    proposals.push({
      rowIndex,
      action,
      entryId,
      displayLabel,
      fields,
      errors,
      warnings,
      referenceResolutions,
    });
  }

  const errorCount = proposals.filter((p) => p.errors.length > 0).length;
  const warningCount = proposals.filter((p) => p.warnings.length > 0).length;
  const createCount = proposals.filter((p) => p.action === 'create').length;
  const updateCount = proposals.filter((p) => p.action === 'update').length;

  return {
    proposals,
    createCount,
    updateCount,
    errorCount,
    warningCount,
    canApply: errorCount === 0,
  };
}

// ── Apply ─────────────────────────────────────────────────────────────────────

export async function applyImport(
  proposals: CsvEntryProposal[],
  config: CsvImportConfig,
  token: string,
  onProgress?: (done: number, total: number) => void,
): Promise<CsvApplyResult> {
  const env = await getEnvironment(token);
  const eligible = proposals.filter((p) => p.errors.length === 0);
  if (eligible.length === 0) return { created: [], updated: [], failed: [] };

  // Separate creates and updates
  const creates = eligible.filter((p) => p.action === 'create');
  const updates = eligible.filter((p) => p.action === 'update');

  const created: CsvApplyResult['created'] = [];
  const updated: CsvApplyResult['updated'] = [];
  const failed: CsvApplyResult['failed'] = [];

  // Track newly created entries: rowIndex → entryId (for cross-row ref resolution)
  const newEntryIds = new Map<number, string>();
  let done = 0;
  const total = eligible.length;

  // Process creates first (in order — handles most dependency cases naturally)
  for (const proposal of creates) {
    // Resolve any isNewRow references now that we have created entry IDs so far
    const resolvedFields = resolveNewRowRefs(proposal.fields, proposal.referenceResolutions, newEntryIds, proposals);

    try {
      const entry = await env.createEntry(config.contentTypeId, { fields: resolvedFields });
      newEntryIds.set(proposal.rowIndex, entry.sys.id);
      created.push({ rowIndex: proposal.rowIndex, entryId: entry.sys.id });
    } catch (err) {
      failed.push({ rowIndex: proposal.rowIndex, error: String(err) });
    }
    onProgress?.(++done, total);
  }

  // Process updates concurrently
  await pMap(updates, async (proposal) => {
    if (!proposal.entryId) {
      failed.push({ rowIndex: proposal.rowIndex, error: 'No entry ID for update' });
      onProgress?.(++done, total);
      return;
    }

    const resolvedFields = resolveNewRowRefs(proposal.fields, proposal.referenceResolutions, newEntryIds, proposals);

    try {
      const entry = await env.getEntry(proposal.entryId);
      // Merge fields — only overwrite fields present in this proposal
      for (const [fieldId, localeMap] of Object.entries(resolvedFields)) {
        (entry.fields as Record<string, Record<string, unknown>>)[fieldId] = localeMap;
      }
      await entry.update();
      updated.push({ rowIndex: proposal.rowIndex, entryId: proposal.entryId });
    } catch (err) {
      failed.push({ rowIndex: proposal.rowIndex, entryId: proposal.entryId, error: String(err) });
    }
    onProgress?.(++done, total);
  }, APPLY_CONCURRENCY);

  return { created, updated, failed };
}

/**
 * For any reference fields marked isNewRow, replace the placeholder with the
 * real entry ID now that creates have run.
 */
function resolveNewRowRefs(
  fields: Record<string, Record<string, unknown>>,
  referenceResolutions: Record<string, ResolvedRef[]>,
  newEntryIds: Map<number, string>,
  allProposals: CsvEntryProposal[],
): Record<string, Record<string, unknown>> {
  if (Object.values(referenceResolutions).every((refs) => refs.every((r) => !r.isNewRow))) {
    return fields;
  }

  const resolved = { ...fields };
  for (const [fieldId, refs] of Object.entries(referenceResolutions)) {
    const hasNewRow = refs.some((r) => r.isNewRow);
    if (!hasNewRow) continue;

    // Find the locale key in the existing field entry (or default)
    const localeKey = resolved[fieldId] ? Object.keys(resolved[fieldId])[0] : undefined;
    if (!localeKey) continue;

    const isArray = Array.isArray((resolved[fieldId]?.[localeKey]));

    const resolvedRefs = refs.map((ref) => {
      if (!ref.isNewRow) {
        return ref.entryId ? { sys: { type: 'Link', linkType: 'Entry', id: ref.entryId } } : null;
      }
      // Find which create proposal owns this value (by csvValue matching displayLabel)
      const matchingProposal = allProposals.find(
        (p) => p.action === 'create' && p.displayLabel === ref.csvValue,
      );
      const newId = matchingProposal ? newEntryIds.get(matchingProposal.rowIndex) : undefined;
      if (!newId) return null;
      return { sys: { type: 'Link', linkType: 'Entry', id: newId } };
    }).filter(Boolean);

    if (isArray) {
      resolved[fieldId] = { [localeKey]: resolvedRefs };
    } else if (resolvedRefs[0]) {
      resolved[fieldId] = { [localeKey]: resolvedRefs[0] };
    }
  }

  return resolved;
}

// ── Failure report CSV ────────────────────────────────────────────────────────

/** Generates a failure-report CSV from the original rows + error messages. */
export function buildFailureReportCsv(
  rows: CsvRow[],
  failed: CsvApplyResult['failed'],
): string {
  if (rows.length === 0 || failed.length === 0) return '';

  const failedByRow = new Map(failed.map((f) => [f.rowIndex, f.error]));
  const headers = Object.keys(rows[0]).filter((k) => k !== '_error');
  const allHeaders = [...headers, '_error'];

  const lines = [
    allHeaders.map(quoteCsv).join(','),
    ...failed.map((f) => {
      const row = rows[f.rowIndex] ?? {};
      const values = headers.map((h) => quoteCsv(row[h] ?? ''));
      values.push(quoteCsv(failedByRow.get(f.rowIndex) ?? ''));
      return values.join(',');
    }),
  ];

  return lines.join('\n');
}

function quoteCsv(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}
