/**
 * Server-side schema migration — adds a new field to one or more content types.
 *
 * Steps:
 *  1. dryRunSchemaChange (in schema-migration-shared.ts) — pure, zero API calls
 *  2. applySchemaChange — getContentType → push field → update → publish,
 *     running SCHEMA_CONCURRENCY at a time
 */

import { getEnvironment, mapRawContentType } from './contentful';
import type { RawContentType } from './contentful';
import type { NewFieldDefinition, SchemaApplyResult, SchemaDeleteResult } from './schema-migration-shared';

// Re-export shared types so callers can import from one place
export type {
  NewFieldType,
  NewFieldDefinition,
  CTDryRunStatus,
  CTDryRunOutcome,
  SchemaApplyResult,
  CTDeleteStatus,
  CTDeleteOutcome,
  SchemaDeleteResult,
} from './schema-migration-shared';
export { dryRunSchemaChange, dryRunDeleteField } from './schema-migration-shared';

/** Builds the raw field descriptor object for the Contentful CMA. */
function buildFieldProps(field: NewFieldDefinition): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: field.id,
    name: field.name,
    type: field.type,
    required: field.required,
    localized: field.localized,
  };

  if (field.type === 'Link') {
    base.linkType = field.linkType ?? 'Entry';
  }

  if (field.type === 'Array') {
    const itemType = field.arrayItemType ?? 'Symbol';
    base.items =
      itemType === 'Link'
        ? { type: 'Link', linkType: field.arrayLinkType ?? 'Entry' }
        : { type: itemType };
  }

  return base;
}

/**
 * CMA rate limit: ~7 req/s.
 * Each CT costs 2 calls (update + publish), so 3 concurrent = 6 req/s — within limits.
 */
const SCHEMA_CONCURRENCY = 3;

async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, limit: number): Promise<R[]> {
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

/**
 * Applies the schema change — adds the field to each selected content type.
 * Each CT: getContentType → update (append field) → publish.
 * Runs SCHEMA_CONCURRENCY content types concurrently.
 */
export async function applySchemaChange(
  selectedCTs: Array<{ id: string; name: string }>,
  field: NewFieldDefinition,
): Promise<SchemaApplyResult> {
  const env = await getEnvironment();
  const succeeded: SchemaApplyResult['succeeded'] = [];
  const failed: SchemaApplyResult['failed'] = [];

  await pMap(
    selectedCTs,
    async ({ id: ctId, name: ctName }) => {
      try {
        const ct = await env.getContentType(ctId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ct.fields as any[]).push(buildFieldProps(field));
        const updated = await ct.update();
        const published = await updated.publish();
        succeeded.push({
          contentTypeId: ctId,
          contentTypeName: ctName,
          updatedFields: mapRawContentType(published as unknown as RawContentType).fields,
        });
      } catch (err) {
        failed.push({ contentTypeId: ctId, contentTypeName: ctName, error: String(err) });
      }
    },
    SCHEMA_CONCURRENCY,
  );

  return { succeeded, failed };
}

/**
 * Contentful requires a two-step publish cycle to safely delete a field
 * (the CMA rejects single-step deletion to prevent accidental data loss):
 *
 *   Phase 1 — omitField:  mark `omitted: true` → update → publish  (3 calls/CT)
 *   Phase 2 — removeField: filter out field → update → publish       (2 calls/CT)
 *
 * Splitting into two exported functions lets the caller report progress between phases.
 * Each phase runs SCHEMA_CONCURRENCY content types concurrently.
 */

/** Phase 1: marks the field as omitted on each CT and publishes. */
export async function omitField(
  selectedCTs: Array<{ id: string; name: string }>,
  fieldId: string,
): Promise<SchemaDeleteResult> {
  const env = await getEnvironment();
  const succeeded: SchemaDeleteResult['succeeded'] = [];
  const failed: SchemaDeleteResult['failed'] = [];

  await pMap(
    selectedCTs,
    async ({ id: ctId, name: ctName }) => {
      try {
        const ct = await env.getContentType(ctId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const field = (ct.fields as any[]).find((f: any) => f.id === fieldId);
        if (!field) throw new Error(`Field "${fieldId}" not found in content type "${ctId}"`);
        field.omitted = true;
        const updated = await ct.update();
        await updated.publish();
        succeeded.push({ contentTypeId: ctId, contentTypeName: ctName });
      } catch (err) {
        failed.push({ contentTypeId: ctId, contentTypeName: ctName, error: String(err) });
      }
    },
    SCHEMA_CONCURRENCY,
  );

  return { succeeded, failed };
}

/** Phase 2: removes the field from the schema array and publishes. */
export async function removeField(
  selectedCTs: Array<{ id: string; name: string }>,
  fieldId: string,
): Promise<SchemaDeleteResult> {
  const env = await getEnvironment();
  const succeeded: SchemaDeleteResult['succeeded'] = [];
  const failed: SchemaDeleteResult['failed'] = [];

  await pMap(
    selectedCTs,
    async ({ id: ctId, name: ctName }) => {
      try {
        const ct = await env.getContentType(ctId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ct.fields as any[]) = (ct.fields as any[]).filter((f: any) => f.id !== fieldId);
        const updated = await ct.update();
        const published = await updated.publish();
        succeeded.push({
          contentTypeId: ctId,
          contentTypeName: ctName,
          updatedFields: mapRawContentType(published as unknown as RawContentType).fields,
        });
      } catch (err) {
        failed.push({ contentTypeId: ctId, contentTypeName: ctName, error: String(err) });
      }
    },
    SCHEMA_CONCURRENCY,
  );

  return { succeeded, failed };
}
