import { slugifyTransform } from './slugify';
import { copyFieldTransform } from './copy-field';
import type { Transform } from './types';

// Register new transforms here — they automatically appear in the UI dropdown.
const _registered: unknown[] = [slugifyTransform, copyFieldTransform];

// ── Validation ────────────────────────────────────────────────────────────────

export interface BrokenTransform {
  id?: string;
  label?: string;
  reason: string;
}

function check(t: unknown): string | null {
  if (!t || typeof t !== 'object') return 'must be an object';
  const obj = t as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id) return '"id" must be a non-empty string';
  if (typeof obj.label !== 'string' || !obj.label) return '"label" must be a non-empty string';
  if (typeof obj.apply !== 'function') return '"apply" must be a function';
  if (!Array.isArray(obj.configSchema)) return '"configSchema" must be an array';
  return null;
}

export const TRANSFORMS: Transform[] = [];
export const BROKEN_TRANSFORMS: BrokenTransform[] = [];

const _seenIds = new Set<string>();

for (const t of _registered) {
  const err = check(t);
  if (err) {
    const obj = t as Record<string, unknown>;
    BROKEN_TRANSFORMS.push({
      id: typeof obj?.id === 'string' ? obj.id : undefined,
      label: typeof obj?.label === 'string' ? obj.label : undefined,
      reason: err,
    });
    console.error('[contentfill] Skipping invalid transform:', err, t);
    continue;
  }
  const valid = t as Transform;
  if (_seenIds.has(valid.id)) {
    BROKEN_TRANSFORMS.push({ id: valid.id, label: valid.label, reason: `duplicate id "${valid.id}" — only the first registration is used` });
    console.error(`[contentfill] Duplicate transform id "${valid.id}" — skipping`);
    continue;
  }
  _seenIds.add(valid.id);
  TRANSFORMS.push(valid);
}

// ── Lookup ────────────────────────────────────────────────────────────────────

export function getTransform(id: string): Transform | undefined {
  return TRANSFORMS.find((t) => t.id === id);
}

export type { Transform, TransformResult, EntrySnapshot, ConfigFieldDef } from './types';
