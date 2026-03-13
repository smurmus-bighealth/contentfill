import { createClient, type Environment } from 'contentful-management';

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

/**
 * Per-token cache of the Contentful environment handle to avoid redundant
 * getSpace + getEnvironment API calls on every request.
 *
 * Entries are evicted on any error during construction so a revoked or
 * expired token never leaves a stale handle in the cache. The cache is
 * process-scoped; a process restart clears it completely.
 */
const _envCache = new Map<string, Environment>();

/** Returns a Contentful environment handle for the given CMA token. */
export async function getEnvironment(token: string): Promise<Environment> {
  const cached = _envCache.get(token);
  if (cached) return cached;

  try {
    const client = createClient({ accessToken: token });
    const space = await client.getSpace(requireEnv('CONTENTFUL_SPACE_ID'));
    const env = await space.getEnvironment(process.env.CONTENTFUL_ENVIRONMENT ?? 'master');
    _envCache.set(token, env);
    return env;
  } catch (err) {
    // Never cache a failed construction — ensures a revoked token
    // doesn't persist in the cache waiting for a process restart.
    _envCache.delete(token);
    throw err;
  }
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

/** Kept for import compatibility with routes that call revalidateTag. */
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

export async function getContentTypes(token: string): Promise<ContentTypeSummary[]> {
  const env = await getEnvironment(token);
  const result = await env.getContentTypes({ limit: 200 });
  return result.items.map(mapRawContentType);
}

/** Bypasses any client-side cache — use after out-of-band Contentful changes. */
export async function fetchContentTypesFresh(token: string): Promise<ContentTypeSummary[]> {
  // Evict the env cache entry so we get a fresh environment snapshot too
  _envCache.delete(token);
  const env = await getEnvironment(token);
  const result = await env.getContentTypes({ limit: 200 });
  return result.items.map(mapRawContentType);
}

/** Fetches all entries for a content type, handling Contentful's pagination. */
export async function getAllEntries(contentType: string, token: string): Promise<RawEntry[]> {
  const env = await getEnvironment(token);
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
export async function getSampleEntry(contentType: string, token: string): Promise<SampleEntry | null> {
  const env = await getEnvironment(token);
  const result = await env.getEntries({ content_type: contentType, limit: 1 });
  if (result.items.length === 0) return null;
  return {
    id: result.items[0].sys.id,
    fields: result.items[0].fields as Record<string, Record<string, unknown>>,
  };
}

/**
 * Batch-fetches entries by ID.
 * Uses `sys.id[in]` to retrieve up to 200 entries per API call instead of N individual
 * getEntry calls — ceil(N/200) calls total.
 */
export async function fetchEntriesByIds(entryIds: string[], token: string): Promise<RawEntry[]> {
  const env = await getEnvironment(token);
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
  token: string,
): Promise<{ published: string[]; failed: Array<{ entryId: string; error: string }> }> {
  if (entryIds.length === 0) return { published: [], failed: [] };
  const env = await getEnvironment(token);
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
