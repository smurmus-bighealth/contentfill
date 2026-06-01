import { NextResponse } from 'next/server';
import { getContentfulToken } from '@/lib/auth';
import { dryRun, dryRunInline, type MigrationPlan } from '@/lib/migration';
import { aiDryRun } from '@/lib/ai-transform';

export async function POST(request: Request) {
  const token = await getContentfulToken();
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let plan: MigrationPlan;
  try {
    plan = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!plan.contentType || !plan.targetField || !plan.transformId) {
    return NextResponse.json(
      { error: 'contentType, targetField, and transformId are required' },
      { status: 400 },
    );
  }

  plan.locale ??= 'en-US';
  plan.skipExisting ??= true;

  try {
    // AI agent path: batched Haiku calls instead of a deterministic transform.
    if (plan.transformId === 'ai-agent') {
      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 501 });
      }
      const result = await aiDryRun(plan, token);
      return NextResponse.json(result);
    }

    // Inline AI-generated transform: eval the function body server-side.
    if (plan.transformId === 'ai-inline') {
      if (!plan.inlineCode) {
        return NextResponse.json({ error: 'inlineCode is required for ai-inline transforms' }, { status: 400 });
      }
      const result = await dryRunInline(plan, token);
      return NextResponse.json(result);
    }

    const result = await dryRun(plan, token);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/preview]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
