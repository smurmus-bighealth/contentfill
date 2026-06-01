/**
 * AI-powered batched dry-run for the "ai-agent" transform path.
 *
 * Instead of calling Claude once per entry (O(N) API calls), entries are grouped
 * into batches of BATCH_SIZE and each batch is processed in a single Haiku call.
 * This yields ~50x fewer API calls and ~50% fewer tokens vs per-entry calls,
 * because the system prompt is paid once per batch rather than once per entry.
 *
 * Further token reduction: the planning agent (Sonnet) identifies which source
 * fields are actually needed for the transformation. Only those fields are
 * included per entry in the batch prompt — not all fields on the content type.
 *
 * Structured output is enforced via the `propose_field_values` tool, which
 * guarantees a well-formed [{id, value}] response without fragile text parsing.
 *
 * If an entire batch fails (API error, malformed response), all entries in that
 * batch are marked with a blocking error in the DryRunResult so the user can
 * see what happened before deciding whether to retry.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getAllEntries } from './contentful';
import type { MigrationPlan, DryRunResult } from './migration';
import type { EntrySnapshot, TransformResult } from './transforms/types';
import { pMap } from './concurrency';
import { BATCH_TRANSFORM_MODEL } from './ai-models';

/** Number of entries per Haiku call. Keeps output well within Haiku's 8 192-token limit. */
const BATCH_SIZE = 50;

/** Number of concurrent batch calls. Conservative to avoid Anthropic rate limits. */
const BATCH_CONCURRENCY = 3;

// ── Tool definition ───────────────────────────────────────────────────────────

const PROPOSE_TOOL: Anthropic.Tool = {
  name: 'propose_field_values',
  description:
    'Return the proposed field value for every entry in the batch. ' +
    'You must include a result for every entry ID that was provided.',
  input_schema: {
    type: 'object' as const,
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id:    { type: 'string', description: 'Entry ID — must match an ID from the input' },
            value: { type: ['string', 'null'], description: 'Computed field value, or null to skip this entry' },
          },
          required: ['id', 'value'],
        },
      },
    },
    required: ['results'],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function aiDryRun(plan: MigrationPlan, token: string): Promise<DryRunResult> {
  const { contentType, targetField, locale, skipExisting, transformConfig } = plan;
  const instruction   = transformConfig.instruction as string;
  // sourceFields is set by the agent to minimise tokens — fall back to all fields if absent.
  const sourceFields  = Array.isArray(transformConfig.sourceFields)
    ? (transformConfig.sourceFields as string[])
    : null;

  // ── 1. Fetch entries and build locale-resolved snapshots ──────────────────
  const rawEntries = await getAllEntries(contentType, token);

  const snapshots: EntrySnapshot[] = rawEntries.map((entry) => {
    const resolvedFields: Record<string, unknown> = {};
    for (const [key, localeMap] of Object.entries(entry.fields)) {
      resolvedFields[key] = (localeMap as Record<string, unknown>)[locale] ?? null;
    }
    const displayLabel =
      (typeof resolvedFields['title'] === 'string' ? resolvedFields['title'] : null) ??
      (typeof resolvedFields['name']  === 'string' ? resolvedFields['name']  : null) ??
      entry.sys.id;
    return { id: entry.sys.id, displayLabel, fields: resolvedFields };
  });

  // ── 2. Filter entries that already have a value (if skipExisting) ─────────
  const toProcess = skipExisting
    ? snapshots.filter((s) => s.fields[targetField] == null || s.fields[targetField] === '')
    : snapshots;

  const skipped = snapshots.length - toProcess.length;

  if (toProcess.length === 0) {
    return { plan, updates: [], skipped, canApply: true, errorCount: 0, warningCount: 0 };
  }

  // ── 3. Process batches ────────────────────────────────────────────────────
  const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const batches = chunkArray(toProcess, BATCH_SIZE);

  // Build an entry object for the batch prompt — only include relevant fields.
  function buildEntryPayload(snapshot: EntrySnapshot): Record<string, unknown> {
    const fields = sourceFields ?? Object.keys(snapshot.fields);
    const payload: Record<string, unknown> = { id: snapshot.id };
    for (const key of fields) {
      if (snapshot.fields[key] != null) payload[key] = snapshot.fields[key];
    }
    return payload;
  }

  function makeBatchError(snapshot: EntrySnapshot, message: string): TransformResult {
    return {
      entryId:       snapshot.id,
      displayLabel:  snapshot.displayLabel,
      currentValue:  snapshot.fields[targetField],
      proposedValue: null,
      warnings:      [],
      errors:        [`AI batch error: ${message}`],
    };
  }

  async function processBatch(batch: EntrySnapshot[]): Promise<TransformResult[]> {
    const entryPayloads = batch.map(buildEntryPayload);

    try {
      const response = await client.messages.create({
        model:     BATCH_TRANSFORM_MODEL,
        // Budget ~200 output tokens per entry — enough for summaries, well within Haiku's 8 192 limit.
        max_tokens: Math.min(8192, BATCH_SIZE * 200),
        tools:      [PROPOSE_TOOL],
        // Force Haiku to call the tool — eliminates free-form text parsing.
        tool_choice: { type: 'tool', name: 'propose_field_values' },
        system: [
          `You are a Contentful field migration assistant.`,
          `For each entry, compute the value for the target field "${targetField}" based on the instruction.`,
          `Call propose_field_values with a result for every entry ID in the input.`,
          `Return null for entries where the value cannot be computed.`,
          `Be concise — return only the field value, no explanation or markdown.`,
        ].join('\n'),
        messages: [{
          role:    'user',
          content: `Target field: ${targetField}\nInstruction: ${instruction}\n\nEntries:\n${JSON.stringify(entryPayloads)}`,
        }],
      });

      const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (!toolUse) {
        return batch.map((s) => makeBatchError(s, 'No tool response from AI'));
      }

      type ToolResult = { results: Array<{ id: string; value: string | null }> };
      const { results: batchResults } = toolUse.input as ToolResult;
      const byId = new Map(batchResults.map((r) => [r.id, r.value]));

      const snapshotById = new Map(snapshots.map((s) => [s.id, s]));

      return batch.map((s) => {
        const snap = snapshotById.get(s.id) ?? s;
        if (!byId.has(s.id)) {
          return makeBatchError(s, 'Entry was not included in the AI response');
        }
        const proposedValue = byId.get(s.id) ?? null;
        const errors: string[] = [];
        if (proposedValue === null && plan.targetFieldRequired && !snap.fields[targetField]) {
          errors.push(`Transform returned no value, but "${targetField}" is a required field`);
        }
        return {
          entryId:       s.id,
          displayLabel:  s.displayLabel,
          currentValue:  snap.fields[targetField],
          proposedValue,
          warnings:      [],
          errors,
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return batch.map((s) => makeBatchError(s, message));
    }
  }

  const batchResults = await pMap(batches, processBatch, BATCH_CONCURRENCY);
  const updates = batchResults.flat();

  const errorCount   = updates.filter((r) => r.errors.length > 0).length;
  const warningCount = updates.filter((r) => r.warnings.length > 0).length;

  return {
    plan,
    updates,
    skipped,
    canApply: errorCount === 0,
    errorCount,
    warningCount,
  };
}
