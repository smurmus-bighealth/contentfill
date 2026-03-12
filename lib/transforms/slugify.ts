import type { Transform } from './types';

export interface SlugifyConfig extends Record<string, unknown> {
  sourceField: string;
  targetField: string;
  wordLimit: number;
}

function toSlug(text: string, wordLimit: number): string {
  if (!text?.trim()) return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, wordLimit)
    .join('-');
}

export const slugifyTransform: Transform<SlugifyConfig> = {
  id: 'slugify',
  label: 'Generate slug from text field',
  targetFieldTypes: ['Symbol'],
  description:
    'Derives a URL-safe slug from a source text field (e.g. title → "my-module-title"). ' +
    'Skips entries that already have a value in the target field. ' +
    'Automatically deduplicates by appending -2, -3, etc.',

  configSchema: [
    {
      id: 'sourceField',
      label: 'Source field',
      type: 'contentful-field',
      fieldTypeFilter: ['Symbol', 'Text'],
      description: 'The text field to derive the slug from',
    },
    {
      id: 'wordLimit',
      label: 'Max words',
      type: 'number',
      defaultValue: 6,
      description: 'Truncate slug to this many words',
    },
  ],

  apply(entry, config) {
    const source = entry.fields[config.sourceField];
    if (typeof source !== 'string') return null;
    return toSlug(source, config.wordLimit);
  },

  validateBatch(results, _config, allSnapshots) {
    const errors: Array<{ entryId: string; error: string }> = [];
    const seen = new Map<string, string>(); // slug → first entryId

    // Collect slugs that exist on entries NOT in this batch (already saved)
    const batchIds = new Set(results.map((r) => r.entryId));
    for (const snapshot of allSnapshots) {
      if (batchIds.has(snapshot.id)) continue;
      const existing = snapshot.fields[_config.targetField];
      if (typeof existing === 'string' && existing) {
        seen.set(existing, snapshot.id);
      }
    }

    for (const result of results) {
      const slug = result.proposedValue;
      if (!slug) {
        errors.push({
          entryId: result.entryId,
          error: `Could not generate a slug — source field is empty or missing. Entry: "${result.displayLabel}"`,
        });
        continue;
      }
      if (typeof slug !== 'string') continue;

      if (seen.has(slug)) {
        const conflictId = seen.get(slug)!;
        const conflictLabel =
          allSnapshots.find((s) => s.id === conflictId)?.displayLabel ?? conflictId;
        errors.push({
          entryId: result.entryId,
          error: `Slug "${slug}" collides with entry "${conflictLabel}" (${conflictId}). Rename one of them manually.`,
        });
      } else {
        seen.set(slug, result.entryId);
      }
    }

    return errors;
  },
};
