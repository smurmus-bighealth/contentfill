/**
 * Generic migration runner.
 *
 * Steps:
 *  1. Fetch all entries for a content type
 *  2. Build EntrySnapshot[]
 *  3. Apply transform to every entry that needs updating
 *  4. Run batch validation
 *  5. Return a DryRunResult — caller decides whether to proceed
 *  6. (Apply phase) updateEntryField for each result with no errors
 */

import { getAllEntries, fetchEntriesByIds, bulkPublishEntries, type RawEntry } from './contentful';
import { getTransform, type TransformResult, type EntrySnapshot } from './transforms';

export interface MigrationPlan {
  contentType: string;
  targetField: string;
  locale: string;
  transformId: string;
  transformConfig: Record<string, unknown>;
  /** Skip entries that already have a non-null value in targetField */
  skipExisting: boolean;
}

export interface DryRunResult {
  plan: MigrationPlan;
  updates: TransformResult[];
  skipped: number;
  canApply: boolean;
  errorCount: number;
  warningCount: number;
}

export interface ApplyResult {
  succeeded: string[];
  failed: Array<{ entryId: string; error: string }>;
}

export async function dryRun(plan: MigrationPlan): Promise<DryRunResult> {
  const transform = getTransform(plan.transformId);
  if (!transform) throw new Error(`Unknown transform: "${plan.transformId}"`);

  const rawEntries = await getAllEntries(plan.contentType);

  const snapshots: EntrySnapshot[] = rawEntries.map((entry) => {
    const resolvedFields: Record<string, unknown> = {};
    for (const [key, localeMap] of Object.entries(entry.fields)) {
      resolvedFields[key] = (localeMap as Record<string, unknown>)[plan.locale] ?? null;
    }
    return {
      id: entry.sys.id,
      displayLabel:
        (resolvedFields['title'] as string) ??
        (resolvedFields['name'] as string) ??
        entry.sys.id,
      fields: resolvedFields,
    };
  });

  const toProcess = plan.skipExisting
    ? snapshots.filter((s) => !s.fields[plan.targetField])
    : snapshots;

  const skipped = snapshots.length - toProcess.length;

  // Apply transform to each entry
  const results: TransformResult[] = toProcess.map((snapshot) => {
    let proposedValue: unknown = null;
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      proposedValue = transform.apply(snapshot, plan.transformConfig, snapshots);
    } catch (err) {
      errors.push(`Transform error: ${String(err)}`);
    }

    return {
      entryId: snapshot.id,
      displayLabel: snapshot.displayLabel,
      currentValue: snapshot.fields[plan.targetField],
      proposedValue,
      warnings,
      errors,
    };
  });

  // Batch validation (cross-entry concerns like uniqueness)
  if (transform.validateBatch) {
    const batchErrors = transform.validateBatch(results, plan.transformConfig, snapshots);
    for (const { entryId, error } of batchErrors) {
      const result = results.find((r) => r.entryId === entryId);
      if (result) result.errors.push(error);
    }
  }

  const errorCount = results.filter((r) => r.errors.length > 0).length;
  const warningCount = results.filter((r) => r.warnings.length > 0).length;

  return {
    plan,
    updates: results,
    skipped,
    canApply: errorCount === 0,
    errorCount,
    warningCount,
  };
}

/**
 * Contentful CMA rate limit: ~7 req/s.
 * The update phase issues 1 call per entry, so 4 concurrent = 4 req/s — safely
 * within limits while yielding ~4× throughput vs sequential.
 * The publish phase uses the Bulk Actions API (1 call per 100 entries).
 */
const APPLY_CONCURRENCY = 4;

/** Runs async tasks over `items` with at most `limit` in-flight at once. */
async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function applyMigration(
  plan: MigrationPlan,
  updates: TransformResult[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyResult> {
  const eligible = updates.filter((u) => u.errors.length === 0 && u.proposedValue !== null);
  if (eligible.length === 0) return { succeeded: [], failed: [] };

  // Phase 1: Batch-fetch all entries — ceil(N/200) calls instead of N individual getEntry calls
  const entries = await fetchEntriesByIds(eligible.map((u) => u.entryId));
  const byId = new Map<string, RawEntry>(entries.map((e) => [e.sys.id, e]));

  // Phase 2: Concurrently write field values to all entries (N calls, APPLY_CONCURRENCY at a time)
  let done = 0;
  type Outcome =
    | { kind: 'ok'; entryId: string; saved: RawEntry }
    | { kind: 'err'; entryId: string; error: string };

  const outcomes = await pMap<TransformResult, Outcome>(
    eligible,
    async (update) => {
      const entry = byId.get(update.entryId);
      if (!entry) return { kind: 'err', entryId: update.entryId, error: 'Entry not found after batch fetch' };
      try {
        entry.fields[plan.targetField] = { [plan.locale]: update.proposedValue };
        const saved = await entry.update();
        onProgress?.(++done, eligible.length);
        return { kind: 'ok', entryId: update.entryId, saved };
      } catch (err) {
        onProgress?.(++done, eligible.length);
        return { kind: 'err', entryId: update.entryId, error: String(err) };
      }
    },
    APPLY_CONCURRENCY,
  );

  const saved = outcomes.filter((o): o is Extract<Outcome, { kind: 'ok' }> => o.kind === 'ok');
  const updateFailed = outcomes
    .filter((o): o is Extract<Outcome, { kind: 'err' }> => o.kind === 'err')
    .map((o) => ({ entryId: o.entryId, error: o.error }));

  // Phase 3: Bulk-publish all successfully updated entries — ceil(N/100) calls instead of N
  // Re-uses in-memory updated entry objects to avoid extra GETs on fallback
  const { published, failed: publishFailed } = await bulkPublishEntries(
    saved.map((o) => o.entryId),
    new Map(saved.map((o) => [o.entryId, o.saved])),
  );

  return {
    succeeded: published,
    failed: [...updateFailed, ...publishFailed],
  };
}
