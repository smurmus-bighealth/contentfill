/**
 * Centralised AI model identifiers.
 * Update here when switching to a newer model — no other files need to change.
 */

/** Planning agent — one call per conversation turn. Sonnet for stronger reasoning. */
export const AGENT_MODEL = 'claude-sonnet-4-6';

/** Batched dry-run transforms — many calls at preview time. Haiku for speed and cost. */
export const BATCH_TRANSFORM_MODEL = 'claude-haiku-4-5-20251001';

/** Transform code generator — one call per generation request. */
export const GENERATE_TRANSFORM_MODEL = 'claude-sonnet-4-6';
