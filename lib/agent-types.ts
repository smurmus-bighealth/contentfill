/**
 * Shared types for the AI agent feature.
 *
 * Kept in a separate file from lib/agent.ts so that client components
 * (e.g. AgentPanel) can import these type definitions without pulling in
 * @anthropic-ai/sdk, which is a Node.js-only module.
 */

import type { MigrationPlan } from './migration';

/** Whether the agent resolved using a built-in deterministic transform or AI per-entry. */
export type AgentMode = 'existing-transform' | 'ai-per-entry';

/** A single turn in the agent conversation (matches Anthropic message role format). */
export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * A fully-resolved migration plan produced by the agent.
 * - mode='existing-transform': plan.transformId is 'slugify' or 'copy-field'; no AI dry-run needed.
 * - mode='ai-per-entry':       plan.transformId is 'ai-agent'; preview route calls aiDryRun().
 *   plan.transformConfig includes:
 *     instruction  — what Haiku should do per entry
 *     sourceFields — which fields to include in each batch prompt (token optimisation)
 */
export interface AgentResolution {
  mode: AgentMode;
  plan: MigrationPlan;
  rationale: string;
}

/** Response shape returned by POST /api/agent on each turn. */
export interface AgentRunOutput {
  /** The assistant's reply to show in the chat UI. */
  reply: string;
  /**
   * Present when the agent has gathered enough information to produce a
   * migration plan. The parent component should trigger /api/preview immediately.
   */
  resolution?: AgentResolution;
}
