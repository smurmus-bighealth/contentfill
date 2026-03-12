/**
 * Generic transform system.
 *
 * A Transform describes how to derive a new field value from entry data.
 * Transforms are pure functions — they never touch Contentful directly.
 * The migration runner handles fetching, dry-run validation, and applying.
 */

export interface EntrySnapshot {
  id: string;
  /** Human-readable label for display (usually title or name field value) */
  displayLabel: string;
  /** All field values for this entry, keyed by field ID, already locale-resolved */
  fields: Record<string, unknown>;
}

export interface TransformResult {
  entryId: string;
  displayLabel: string;
  currentValue: unknown;
  proposedValue: unknown;
  /** Non-blocking notices (e.g. "slug was deduplicated") */
  warnings: string[];
  /** Blocking issues that must be resolved before applying */
  errors: string[];
}

/**
 * A UI config field descriptor — tells the frontend what inputs to render
 * for a given transform's configuration.
 */
export interface ConfigFieldDef {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'contentful-field';
  defaultValue?: unknown;
  /** For type='select' */
  options?: { value: string; label: string }[];
  /** For type='contentful-field' — filters fields shown in the dropdown */
  fieldTypeFilter?: string[];
  description?: string;
}

export interface Transform<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  label: string;
  description: string;
  /** Config fields the UI should render for this transform */
  configSchema: ConfigFieldDef[];
  /**
   * Contentful field types this transform may write to (e.g. ['Symbol', 'Text']).
   * Omit to allow any field type. Used to filter the UI and warn users about
   * incompatible selections.
   *
   * For complex eligibility logic that depends on linkType, validations, or
   * cross-field rules, add a server-side `allowTarget` predicate instead and
   * expose the result through the bootstrap API.
   */
  targetFieldTypes?: string[];
  /**
   * Compute a proposed value for a single entry.
   * Must be pure — receives all snapshots so transforms can implement
   * uniqueness logic (e.g. slugify can check existing values).
   */
  apply: (
    entry: EntrySnapshot,
    config: TConfig,
    allSnapshots: EntrySnapshot[],
  ) => unknown;
  /**
   * Optional batch validation run after all `apply` calls.
   * Return an array of { entryId, error } to flag blocking errors.
   * Use this for cross-entry concerns (duplicate detection, format checks, etc.)
   */
  validateBatch?: (
    results: TransformResult[],
    config: TConfig,
    allSnapshots: EntrySnapshot[],
  ) => Array<{ entryId: string; error: string }>;
}
