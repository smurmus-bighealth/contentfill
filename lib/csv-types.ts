/** Raw parsed row from the CSV — keys are column headers, values are cell strings. */
export interface CsvRow {
  _id?: string;
  _locale?: string;
  [column: string]: string | undefined;
}

/** How a single CSV column maps to a Contentful field. */
export interface ColumnMapping {
  csvColumn: string;
  /** null = ignore this column */
  fieldId: string | null;
  /**
   * For reference/array-of-reference fields: the Contentful field ID on the
   * target content type to match the cell value against (e.g. 'name', 'slug').
   * Falls back to bare entry-ID lookup when no match is found.
   */
  resolveByField?: string;
}

export interface CsvImportConfig {
  contentTypeId: string;
  locale: string;
  /** One mapping per data column (excludes _id, _locale). */
  mappings: ColumnMapping[];
}

/** Result of attempting to resolve one reference cell value. */
export interface ResolvedRef {
  /** Raw cell value that was looked up. */
  csvValue: string;
  /** Resolved Contentful entry ID, if found. */
  entryId?: string;
  /** True if this entry will be created in the same upload (not pre-existing). */
  isNewRow?: boolean;
  error?: string;
}

export interface CsvEntryProposal {
  rowIndex: number;
  action: 'create' | 'update';
  /** Contentful entry ID — present for updates. */
  entryId?: string;
  /** Human label for display (best-effort: first text field or row index). */
  displayLabel: string;
  /** Resolved, locale-wrapped field values ready for the CMA. */
  fields: Record<string, Record<string, unknown>>;
  errors: string[];
  warnings: string[];
  /** Per-field reference resolutions for the preview UI. */
  referenceResolutions: Record<string, ResolvedRef[]>;
}

export interface CsvPreviewResult {
  proposals: CsvEntryProposal[];
  createCount: number;
  updateCount: number;
  errorCount: number;
  warningCount: number;
  canApply: boolean;
}

export interface CsvApplyResult {
  created: Array<{ rowIndex: number; entryId: string }>;
  updated: Array<{ rowIndex: number; entryId: string }>;
  failed: Array<{ rowIndex: number; entryId?: string; error: string }>;
}
