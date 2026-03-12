import type { Transform } from './types';

export interface CopyFieldConfig extends Record<string, unknown> {
  sourceField: string;
  targetField: string;
  overwriteExisting: boolean;
}

export const copyFieldTransform: Transform<CopyFieldConfig> = {
  id: 'copy-field',
  label: 'Copy field value',
  description: 'Copies the value of one field to another, optionally skipping entries that already have a value.',

  configSchema: [
    {
      id: 'sourceField',
      label: 'Source field',
      type: 'contentful-field',
      description: 'Field to copy from',
    },
    {
      id: 'overwriteExisting',
      label: 'Overwrite existing values',
      type: 'select',
      defaultValue: 'false',
      options: [
        { value: 'false', label: 'Skip entries that already have a value' },
        { value: 'true', label: 'Overwrite all entries' },
      ],
    },
  ],

  apply(entry, config) {
    return entry.fields[config.sourceField] ?? null;
  },
};
