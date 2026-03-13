import { NextResponse } from 'next/server';
import { getContentfulToken } from '@/lib/auth';
import { applyMigration, type MigrationPlan } from '@/lib/migration';
import type { TransformResult } from '@/lib/transforms';

interface ApplyBody {
  plan: MigrationPlan;
  updates: TransformResult[];
}

export async function POST(request: Request) {
  const token = await getContentfulToken();
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ApplyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { plan, updates } = body;
  if (!plan || !Array.isArray(updates)) {
    return NextResponse.json({ error: 'plan and updates are required' }, { status: 400 });
  }

  // Reject if any updates still have errors — caller should run preview first
  const withErrors = updates.filter((u) => u.errors.length > 0);
  if (withErrors.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot apply: ${withErrors.length} entries still have errors. Run preview and resolve them first.`,
        errorEntries: withErrors.map((u) => ({ id: u.entryId, label: u.displayLabel, errors: u.errors })),
      },
      { status: 422 },
    );
  }

  try {
    const result = await applyMigration(plan, updates, token);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/apply]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
