import { NextResponse } from 'next/server';
import { getContentfulToken } from '@/lib/auth';
import { dryRun, type MigrationPlan } from '@/lib/migration';

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
    const result = await dryRun(plan, token);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
