import { createClient, type Environment } from 'contentful-management';
import { unstable_cache } from 'next/cache';

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

// Cache the environment handle across requests in dev (hot-reload safe via module cache)
let _env: Environment | null = null;

/** Returns a cached Contentful environment handle. Server-side only. */
export async function getEnvironment(): Promise<Environment> {
  if (_env) return _env;
  const client = createClient({ accessToken: requireEnv('CONTENTFUL_MANAGEMENT_TOKEN') });
  const space = await client.getSpace(requireEnv('CONTENTFUL_SPACE_ID'));
  _env = await space.getEnvironment(process.env.CONTENTFUL_ENVIRONMENT ?? 'master');
  return _env;
}

export interface ContentTypeField {
  id: string;
  name: string;
  type: string;
  required: boolean;
  /** 'Entry' | 'Asset' — present on Link and Array-of-Link fields */
  linkType?: string;
  /** Content type IDs this field can reference (from validations), if constrained */
  linkedContentTypes?: string[];
}

export interface ContentTypeSummary {
  id: string;
  name: string;
  fields: ContentTypeField[];
}

export const CT_CACHE_TAG = 'contentful:content-types';

export type RawEntry = Awaited<ReturnType<Environment['getEntries']>>['items'][number];
export type RawContentType = Awaited<ReturnType<Environment['getContentTypes']>>['items'][number];

/** Maps a raw CMA ContentType object to our slim summary shape. */
export function mapRawContentType(ct: RawContentType): ContentTypeSummary {
  return {
    id: ct.sys.id,
    name: ct.name,
    fields: ct.fields.map((f) => {
      let linkType: string | undefined;
      let linkedContentTypes: string[] | undefined;

      if (f.type === 'Link') {
        linkType = f.linkType as string | undefined;
        const v = (f.validations as Array<{ linkContentType?: string[] }>)
          ?.find((x) => x.linkContentType?.length);
        if (v?.linkContentType) linkedContentTypes = v.linkContentType;
      } else if (f.type === 'Array') {
        const items = f.items as { type?: string; linkType?: string; validations?: Array<{ linkContentType?: string[] }> } | undefined;
        if (items?.type === 'Link') {
          linkType = items.linkType;
          const v = items.validations?.find((x) => x.linkContentType?.length);
          if (v?.linkContentType) linkedContentTypes = v.linkContentType;
        }
      }

      return {
        id: f.id,
        name: f.name,
        type: f.type,
        required: f.required,
        ...(linkType ? { linkType } : {}),
        ...(linkedContentTypes ? { linkedContentTypes } : {}),
      };
    }),
  };
}

export const getContentTypes = unstable_cache(
  async (): Promise<ContentTypeSummary[]> => {
    const env = await getEnvironment();
    const result = await env.getContentTypes({ limit: 200 });
    return result.items.map(mapRawContentType);
  },
  ['contentful:content-types'],
  { revalidate: 3600, tags: [CT_CACHE_TAG] },
);

/** Bypasses the cache — use for manual refresh after out-of-band Contentful changes. */
export async function fetchContentTypesFresh(): Promise<ContentTypeSummary[]> {
  const env = await getEnvironment();
  const result = await env.getContentTypes({ limit: 200 });
  return result.items.map(mapRawContentType);
}

/** Fetches all entries for a content type, handling Contentful's pagination. */
export async function getAllEntries(contentType: string): Promise<RawEntry[]> {
  const env = await getEnvironment();
  const items: RawEntry[] = [];
  let skip = 0;
  const limit = 200;

  while (true) {
    const page = await env.getEntries({ content_type: contentType, limit, skip, order: 'sys.id' });
    items.push(...page.items);
    if (items.length >= page.total) break;
    skip += limit;
  }

  return items;
}

export interface SampleEntry {
  id: string;
  /** fieldId → locale → raw value */
  fields: Record<string, Record<string, unknown>>;
}

/** Fetches one entry for a content type to use as a schema/data preview. */
export const getSampleEntry = unstable_cache(
  async (contentType: string): Promise<SampleEntry | null> => {
    const env = await getEnvironment();
    const result = await env.getEntries({ content_type: contentType, limit: 1 });
    if (result.items.length === 0) return null;
    return {
      id: result.items[0].sys.id,
      fields: result.items[0].fields as Record<string, Record<string, unknown>>,
    };
  },
  ['contentful:sample-entry'],
  { revalidate: 3600 },
);

/**
 * Batch-fetches entries by ID.
 * Uses `sys.id[in]` to retrieve up to 200 entries per API call instead of N individual
 * getEntry calls — ceil(N/200) calls total.
 */
export async function fetchEntriesByIds(entryIds: string[]): Promise<RawEntry[]> {
  const env = await getEnvironment();
  const all: RawEntry[] = [];
  for (let i = 0; i < entryIds.length; i += 200) {
    const page = await env.getEntries({
      'sys.id[in]': entryIds.slice(i, i + 200).join(','),
      limit: 200,
    });
    all.push(...page.items);
  }
  return all;
}

/**
 * Bulk-publishes entries using the CMA Bulk Actions API (ceil(N/100) calls vs N).
 * Automatically falls back to concurrent individual publishes per chunk on failure,
 * re-using the in-memory `updatedEntries` objects to avoid extra GET calls.
 */
export async function bulkPublishEntries(
  entryIds: string[],
  updatedEntries: Map<string, RawEntry>,
): Promise<{ published: string[]; failed: Array<{ entryId: string; error: string }> }> {
  if (entryIds.length === 0) return { published: [], failed: [] };
  const env = await getEnvironment();
  const published: string[] = [];
  const failed: Array<{ entryId: string; error: string }> = [];

  for (let i = 0; i < entryIds.length; i += 100) {
    const chunk = entryIds.slice(i, i + 100);
    let bulkSucceeded = false;

    try {
      const action = await env.createPublishBulkAction({
        entities: {
          sys: { type: 'Array' },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items: chunk.map((id) => ({ sys: { type: 'Link', linkType: 'Entry', id } })) as any,
        },
      });
      const result = await action.waitProcessing();
      if (result.sys.status === 'succeeded') {
        published.push(...chunk);
        bulkSucceeded = true;
      }
    } catch { /* fall through to individual publish */ }

    if (!bulkSucceeded) {
      await Promise.all(
        chunk.map(async (id) => {
          try {
            // Prefer the already-updated in-memory object; fall back to a fresh GET if missing
            const entry = updatedEntries.get(id) ?? await env.getEntry(id);
            await entry.publish();
            published.push(id);
          } catch (err) {
            failed.push({ entryId: id, error: String(err) });
          }
        }),
      );
    }
  }

  return { published, failed };
}
