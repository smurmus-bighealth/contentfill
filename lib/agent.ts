/**
 * AI planning agent for bulk Contentful migrations.
 *
 * The agent holds a conversation with the user (via Claude Sonnet) and uses
 * tool calls to produce a structured MigrationPlan once it has enough context.
 *
 * Tool categories:
 *
 *   READ TOOLS — the agent can call these to answer informational questions
 *   before (or instead of) committing to a migration plan:
 *     get_entry_stats      — fill-rate stats per field for a content type
 *     fetch_sample_entries — sample entry data for a content type
 *
 *   RESOLUTION TOOLS — end the agentic loop and return a MigrationPlan:
 *     resolve_with_existing_transform — for slugify / copy-field requests
 *     resolve_with_ai_transform       — for natural-language transformations
 *
 * The server runs an agentic loop: when Claude calls a read tool we execute it
 * against Contentful, return the result, and call Claude again — all within a
 * single HTTP request. The client sends plain AgentMessage[] and receives a
 * plain AgentRunOutput; the tool use / result blocks are internal.
 *
 * When the user pre-selects content types in the UI, those types are highlighted
 * in the system prompt so the agent prioritises them for ambiguous requests.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getEnvironment } from './contentful';
import type { ContentTypeSummary } from './contentful';
import type { MigrationPlan } from './migration';
import type { AgentMessage, AgentResolution, AgentRunOutput } from './agent-types';
import { AGENT_MODEL } from './ai-models';

// Re-export shared types so callers only need one import.
export type { AgentMessage, AgentResolution, AgentRunOutput };

/** Max conversation turns from the client. */
const MAX_TURNS = 30;
/** Max read-tool iterations within a single user turn before giving up. */
const MAX_TOOL_ITERATIONS = 5;
/** Max entries sampled for stats (one Contentful page). */
const STATS_SAMPLE_LIMIT = 200;
/** Max entries returned by fetch_sample_entries. */
const SAMPLE_ENTRIES_LIMIT = 10;

const RESOLUTION_TOOL_NAMES = ['resolve_with_existing_transform', 'resolve_with_ai_transform'] as const;

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  // ── Read tools ─────────────────────────────────────────────────────────────
  {
    name: 'get_entry_stats',
    description:
      'Get statistics about entries for a content type: total count and per-field fill rates ' +
      '(how many entries have a value vs. are empty). Use this to answer questions like ' +
      '"how many articles are missing slugs?" or "what percentage of posts have excerpts?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        contentType: { type: 'string', description: 'Content type ID' },
        fieldIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific field IDs to check. Omit to check all fields.',
        },
      },
      required: ['contentType'],
    },
  },
  {
    name: 'fetch_sample_entries',
    description:
      'Fetch a small sample of entries to understand the actual data in a content type. ' +
      'Use this when you need to see real values before deciding on an instruction or transform.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contentType: { type: 'string', description: 'Content type ID' },
        fieldIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Field IDs to include. Omit to include all fields.',
        },
        limit: { type: 'number', description: `Max entries to return (1–${SAMPLE_ENTRIES_LIMIT})` },
      },
      required: ['contentType'],
    },
  },

  // ── Resolution tools ────────────────────────────────────────────────────────
  {
    name: 'resolve_with_existing_transform',
    description:
      'Resolve the user request using a built-in deterministic transform. ' +
      'Use this for slugify (URL-safe slug from a text field) or copy-field (copy one field to another). ' +
      'No extra AI calls are needed at preview time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contentType:     { type: 'string', description: 'Content type ID' },
        targetField:     { type: 'string', description: 'Field ID to write to' },
        transformId:     { type: 'string', enum: ['slugify', 'copy-field'] },
        transformConfig: { type: 'object', description: 'Config for the transform, e.g. { "sourceField": "title" }' },
        locale:          { type: 'string', description: 'Locale code, default "en-US"' },
        skipExisting:    { type: 'boolean', description: 'Skip entries that already have a value in targetField' },
        rationale:       { type: 'string', description: 'One-sentence explanation to show the user' },
      },
      required: ['contentType', 'targetField', 'transformId', 'transformConfig', 'rationale'],
    },
  },
  {
    name: 'resolve_with_ai_transform',
    description:
      'Resolve the user request using AI-powered per-entry transformation. ' +
      'Use this for any natural-language operation (summarise, rewrite, extract, format, etc.). ' +
      'Set sourceFields to only the fields actually needed — this reduces tokens and cost.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contentType:  { type: 'string', description: 'Content type ID' },
        targetField:  { type: 'string', description: 'Field ID to write to' },
        instruction:  { type: 'string', description: 'Clear instruction for what value to compute per entry (passed verbatim to the batch model)' },
        sourceFields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Field IDs needed to compute the value — omit irrelevant fields to save tokens',
        },
        locale:       { type: 'string', description: 'Locale code, default "en-US"' },
        skipExisting: { type: 'boolean', description: 'Skip entries that already have a value in targetField' },
        rationale:    { type: 'string', description: 'One-sentence explanation to show the user' },
      },
      required: ['contentType', 'targetField', 'instruction', 'sourceFields', 'rationale'],
    },
  },
];

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(contentTypes: ContentTypeSummary[], focusedCTIds: string[]): string {
  const ctList = contentTypes
    .map((ct) => `  - ${ct.name} (id: "${ct.id}")\n    fields: ${ct.fields.map((f) => `${f.id} (${f.type})`).join(', ')}`)
    .join('\n');

  const focusSection = focusedCTIds.length > 0
    ? `\nThe user has pre-selected these content types as their primary focus:\n${
        contentTypes
          .filter((ct) => focusedCTIds.includes(ct.id))
          .map((ct) => `  - ${ct.name} (id: "${ct.id}")`)
          .join('\n')
      }\nPrioritise these when the user's request is ambiguous about which content type to use.\n`
    : '';

  return `You are a Contentful bulk migration assistant embedded in an admin tool.
Your job is to help users understand and bulk-modify their Contentful content.
${focusSection}
You can answer informational questions (entry counts, fill rates, sample data) using the read tools, or produce a migration plan using the resolution tools.

Available content types in this space:
${ctList}

Rules:
- Use get_entry_stats or fetch_sample_entries freely to answer questions or gather context before resolving.
- Use resolve_with_existing_transform for: generating URL-safe slugs (slugify) or copying one field to another (copy-field).
- Use resolve_with_ai_transform for everything else: summarising, rewriting, extracting, formatting, etc.
- For resolve_with_ai_transform, set sourceFields to only the fields that are actually needed.
- Ask a clarifying question if the content type, target field, or intent is ambiguous.
- Once you have enough information to produce a migration plan, call the resolution tool — do not ask for confirmation first.
- Keep replies concise and friendly.
- Note: the current implementation supports a single content type per migration operation.`;
}

// ── Read tool execution ───────────────────────────────────────────────────────

async function executeReadTool(
  tool: Anthropic.ToolUseBlock,
  contentTypes: ContentTypeSummary[],
  token: string,
): Promise<string> {
  const input = tool.input as Record<string, unknown>;

  if (tool.name === 'get_entry_stats') {
    const contentType = input.contentType as string;
    const requestedFieldIds = Array.isArray(input.fieldIds) ? (input.fieldIds as string[]) : null;

    const env = await getEnvironment(token);
    const page = await env.getEntries({ content_type: contentType, limit: STATS_SAMPLE_LIMIT });
    const total = page.total;
    const sampled = page.items.length;

    const ct = contentTypes.find((c) => c.id === contentType);
    const fieldsToCheck = requestedFieldIds ?? ct?.fields.map((f) => f.id) ?? [];

    const fieldStats: Record<string, { filled: number; empty: number }> = {};
    for (const fieldId of fieldsToCheck) {
      let filled = 0;
      for (const entry of page.items) {
        const localeMap = entry.fields[fieldId] as Record<string, unknown> | undefined;
        // Default locale for stats — the locale doesn't affect whether a value exists
        const val = localeMap ? Object.values(localeMap)[0] : undefined;
        if (val != null && val !== '' && !(Array.isArray(val) && val.length === 0)) filled++;
      }
      fieldStats[fieldId] = { filled, empty: sampled - filled };
    }

    return JSON.stringify({
      contentType,
      totalEntries: total,
      sampledEntries: sampled,
      approximate: total > sampled,
      fieldStats,
    });
  }

  if (tool.name === 'fetch_sample_entries') {
    const contentType = input.contentType as string;
    const fieldIds = Array.isArray(input.fieldIds) ? (input.fieldIds as string[]) : null;
    const limit = Math.min(Math.max(1, Number(input.limit) || 5), SAMPLE_ENTRIES_LIMIT);

    const env = await getEnvironment(token);
    const page = await env.getEntries({ content_type: contentType, limit });

    const entries = page.items.map((entry) => {
      const fields: Record<string, unknown> = { id: entry.sys.id };
      const keysToInclude = fieldIds ?? Object.keys(entry.fields);
      for (const key of keysToInclude) {
        const localeMap = entry.fields[key] as Record<string, unknown> | undefined;
        if (localeMap) {
          // Return the first locale's value (usually en-US)
          fields[key] = Object.values(localeMap)[0] ?? null;
        }
      }
      return fields;
    });

    return JSON.stringify({ contentType, totalEntries: page.total, entries });
  }

  return JSON.stringify({ error: `Unknown read tool: ${tool.name}` });
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runAgent(
  messages: AgentMessage[],
  contentTypes: ContentTypeSummary[],
  token: string,
  focusedCTIds: string[] = [],
): Promise<AgentRunOutput> {
  if (messages.length === 0) throw new Error('messages must not be empty');
  if (messages.length > MAX_TURNS) throw new Error(`Conversation exceeds ${MAX_TURNS} turns`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Internal message history — grows with each tool iteration within this turn.
  // Starts with the client's conversation history converted to Anthropic format.
  const internalMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await client.messages.create({
      model:      AGENT_MODEL,
      max_tokens: 1024,
      system:     buildSystemPrompt(contentTypes, focusedCTIds),
      tools:      TOOLS,
      messages:   internalMessages,
    });

    // ── Resolution tool call → end loop, return plan ─────────────────────────
    const resolutionTool = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && (RESOLUTION_TOOL_NAMES as readonly string[]).includes(b.name),
    );
    if (resolutionTool) {
      const input    = resolutionTool.input as Record<string, unknown>;
      const rationale = input.rationale as string;

      if (resolutionTool.name === 'resolve_with_existing_transform') {
        const plan: MigrationPlan = {
          contentType:     input.contentType as string,
          targetField:     input.targetField as string,
          transformId:     input.transformId as string,
          transformConfig: (input.transformConfig as Record<string, unknown>) ?? {},
          locale:          (input.locale as string) ?? 'en-US',
          skipExisting:    (input.skipExisting as boolean) ?? true,
        };
        const resolution: AgentResolution = { mode: 'existing-transform', plan, rationale };
        return { reply: rationale, resolution };
      }

      if (resolutionTool.name === 'resolve_with_ai_transform') {
        const plan: MigrationPlan = {
          contentType:  input.contentType as string,
          targetField:  input.targetField as string,
          transformId:  'ai-agent',
          transformConfig: {
            instruction:  input.instruction as string,
            sourceFields: (input.sourceFields as string[]) ?? [],
          },
          locale:       (input.locale as string) ?? 'en-US',
          skipExisting: (input.skipExisting as boolean) ?? true,
        };
        const resolution: AgentResolution = { mode: 'ai-per-entry', plan, rationale };
        return { reply: rationale, resolution };
      }
    }

    // ── Read tool calls → execute, add results, loop ──────────────────────────
    const readTools = response.content.filter(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && !RESOLUTION_TOOL_NAMES.includes(b.name as typeof RESOLUTION_TOOL_NAMES[number]),
    );

    if (readTools.length > 0) {
      // Add the assistant's response (including tool use blocks) to history
      internalMessages.push({ role: 'assistant', content: response.content });

      // Execute all read tools (concurrently) and add results
      const results = await Promise.all(
        readTools.map(async (tool) => {
          let content: string;
          try {
            content = await executeReadTool(tool, contentTypes, token);
          } catch (err) {
            content = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
          }
          return { tool_use_id: tool.id, content } as const;
        }),
      );

      internalMessages.push({
        role: 'user',
        content: results.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.tool_use_id,
          content: r.content,
        })),
      });

      continue; // call Claude again with the tool results
    }

    // ── Text reply → return to client ─────────────────────────────────────────
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    return { reply: textBlock?.text ?? "I couldn't understand that — could you rephrase?" };
  }

  return { reply: 'I reached the maximum number of steps. Please try rephrasing your request.' };
}
