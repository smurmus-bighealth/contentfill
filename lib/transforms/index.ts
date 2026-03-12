import { slugifyTransform } from './slugify';
import { copyFieldTransform } from './copy-field';
import type { Transform } from './types';

// Register new transforms here — they automatically appear in the UI dropdown.
export const TRANSFORMS: Transform[] = [slugifyTransform, copyFieldTransform];

export function getTransform(id: string): Transform | undefined {
  return TRANSFORMS.find((t) => t.id === id);
}

export type { Transform, TransformResult, EntrySnapshot, ConfigFieldDef } from './types';
