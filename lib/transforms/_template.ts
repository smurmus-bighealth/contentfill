/**
 * Transform template — copy this file, rename it, and fill in the TODOs.
 * After creating the file, register your transform in index.ts:
 *
 *   import { myTransform } from './_my-transform';
 *   export const TRANSFORMS = [..., myTransform];
 */

import type { Transform } from './types';

// 1. Define your config shape.
//    Each key becomes a UI input driven by configSchema below.
//    Must extend Record<string, unknown> (TypeScript requirement).
export interface MyTransformConfig extends Record<string, unknown> {
  sourceField: string; // example — remove fields you don't need
  myOption: string;
}

export const myTransform: Transform<MyTransformConfig> = {
  // 2. Unique machine-readable ID — used in the DB/plan; never change once in use.
  id: 'my-transform',

  // 3. Human-readable name shown in the UI dropdown.
  label: 'My transform',

  // 4. One-sentence description of what this transform does.
  description: 'Describe what value this produces and any notable behaviour.',

  // 5. Contentful field types this transform can write to.
  //    Omit entirely to allow any type.
  //    Common types: 'Symbol', 'Text', 'Integer', 'Number', 'Boolean', 'RichText'
  targetFieldTypes: ['Symbol'],

  // 6. Declare the config inputs the UI will render, in display order.
  //    Each id must match a key in MyTransformConfig above.
  configSchema: [
    {
      id: 'sourceField',
      label: 'Source field',
      // type='contentful-field' renders a dropdown of fields on the selected content type.
      // Narrow it with fieldTypeFilter if your transform only works with certain field types.
      type: 'contentful-field',
      fieldTypeFilter: ['Symbol', 'Text'], // omit to show all fields
      description: 'The field to read from',
    },
    {
      id: 'myOption',
      label: 'My option',
      // type='select' renders a dropdown of fixed choices.
      type: 'select',
      defaultValue: 'option-a',
      options: [
        { value: 'option-a', label: 'Option A' },
        { value: 'option-b', label: 'Option B' },
      ],
      // Other input types:
      //   type: 'text'   — free-form string input
      //   type: 'number' — numeric input
    },
  ],

  // 7. Core logic: compute the proposed value for one entry.
  //    - Return null to skip this entry (it will not be updated).
  //    - The full snapshot array is available for cross-entry lookups,
  //      but prefer validateBatch for cross-entry *validation*.
  //    - Keep this pure — no API calls, no side effects.
  apply(entry, config /* , allSnapshots */) {
    const source = entry.fields[config.sourceField];
    if (typeof source !== 'string' || !source) return null;

    // TODO: transform `source` using `config.myOption` and return the result.
    return source;
  },

  // 8. Optional: cross-entry validation run after all apply() calls.
  //    Return { entryId, error } for each blocking problem.
  //    Common uses: duplicate detection, referential integrity checks.
  //    Remove this method entirely if you don't need it.
  validateBatch(results, _config, _allSnapshots) {
    const errors: Array<{ entryId: string; error: string }> = [];

    // Example: flag duplicate proposed values
    const seen = new Map<unknown, string>(); // value → first entryId
    for (const result of results) {
      if (!result.proposedValue) continue;
      const prev = seen.get(result.proposedValue);
      if (prev) {
        errors.push({
          entryId: result.entryId,
          error: `Duplicate value "${result.proposedValue}" — also produced for entry ${prev}`,
        });
      } else {
        seen.set(result.proposedValue, result.entryId);
      }
    }

    return errors;
  },
};
