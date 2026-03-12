import { NextRequest, NextResponse } from 'next/server';
import { omitField, removeField } from '@/lib/schema-migration';

/**
 * POST /api/schema-delete
 * Body: { selectedCTs, fieldId, phase: 'omit' | 'remove' }
 *
 * The two-phase approach lets the client report progress between phases:
 *   Phase 'omit'   — marks field as omitted on each CT and publishes
 *   Phase 'remove' — removes field from the schema array and publishes
 */
export async function POST(req: NextRequest) {
  try {
    const { selectedCTs, fieldId, phase } = (await req.json()) as {
      selectedCTs: Array<{ id: string; name: string }>;
      fieldId: string;
      phase: 'omit' | 'remove';
    };
    const result = phase === 'omit'
      ? await omitField(selectedCTs, fieldId)
      : await removeField(selectedCTs, fieldId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
