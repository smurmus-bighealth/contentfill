/**
 * Client-safe schema migration types and pure dry-run logic.
 * No server-side imports — safe to use in 'use client' components.
 */

import type { ContentTypeSummary, ContentTypeField } from './contentful';

export type NewFieldType =
  | 'Symbol'
  | 'Text'
  | 'RichText'
  | 'Integer'
  | 'Number'
  | 'Boolean'
  | 'Date'
  | 'Location'
  | 'Object'
  | 'Link'
  | 'Array';

export interface NewFieldDefinition {
  id: string;
  name: string;
  type: NewFieldType;
  required: boolean;
  localized: boolean;
  /** Only for type='Link' */
  linkType?: 'Entry' | 'Asset';
  /** Only for type='Array' */
  arrayItemType?: 'Symbol' | 'Link';
  /** Only for type='Array' when arrayItemType='Link' */
  arrayLinkType?: 'Entry' | 'Asset';
}

// ── Add field ─────────────────────────────────────────────────────────────────

export type CTDryRunStatus = 'add' | 'conflict';

export interface CTDryRunOutcome {
  contentTypeId: string;
  contentTypeName: string;
  status: CTDryRunStatus;
  /** Reason for 'conflict' status */
  conflictReason?: string;
}

export interface SchemaApplyResult {
  succeeded: Array<{ contentTypeId: string; contentTypeName: string; updatedFields?: ContentTypeField[] }>;
  failed: Array<{ contentTypeId: string; contentTypeName: string; error: string }>;
}

/**
 * Pure in-memory dry run — zero API calls.
 * Checks each selected content type for field ID conflicts.
 */
export function dryRunSchemaChange(
  contentTypes: ContentTypeSummary[],
  selectedIds: string[],
  field: NewFieldDefinition,
): CTDryRunOutcome[] {
  return selectedIds.map((ctId) => {
    const ct = contentTypes.find((c) => c.id === ctId);
    if (!ct) {
      return {
        contentTypeId: ctId,
        contentTypeName: ctId,
        status: 'conflict' as const,
        conflictReason: 'Content type not found in schema',
      };
    }
    const existing = ct.fields.find((f) => f.id === field.id);
    if (existing) {
      return {
        contentTypeId: ctId,
        contentTypeName: ct.name,
        status: 'conflict' as const,
        conflictReason: `Field ID "${field.id}" already exists (type: ${existing.type})`,
      };
    }
    return {
      contentTypeId: ctId,
      contentTypeName: ct.name,
      status: 'add' as const,
    };
  });
}

// ── Delete field ──────────────────────────────────────────────────────────────

export type CTDeleteStatus = 'delete' | 'not-found';

export interface CTDeleteOutcome {
  contentTypeId: string;
  contentTypeName: string;
  status: CTDeleteStatus;
  /** Details about the field being deleted (for display) */
  fieldName?: string;
  fieldType?: string;
}

export interface SchemaDeleteResult {
  succeeded: Array<{ contentTypeId: string; contentTypeName: string; updatedFields?: ContentTypeField[] }>;
  failed: Array<{ contentTypeId: string; contentTypeName: string; error: string }>;
}

/**
 * Pure in-memory dry run for field deletion — zero API calls.
 * Checks if the field exists in each selected content type.
 */
export function dryRunDeleteField(
  contentTypes: ContentTypeSummary[],
  selectedIds: string[],
  fieldId: string,
): CTDeleteOutcome[] {
  return selectedIds.map((ctId) => {
    const ct = contentTypes.find((c) => c.id === ctId);
    if (!ct) {
      return {
        contentTypeId: ctId,
        contentTypeName: ctId,
        status: 'not-found' as const,
      };
    }
    const existing = ct.fields.find((f) => f.id === fieldId);
    if (!existing) {
      return {
        contentTypeId: ctId,
        contentTypeName: ct.name,
        status: 'not-found' as const,
      };
    }
    return {
      contentTypeId: ctId,
      contentTypeName: ct.name,
      status: 'delete' as const,
      fieldName: existing.name,
      fieldType: existing.type,
    };
  });
}
