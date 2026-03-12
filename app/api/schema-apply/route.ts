import { NextRequest, NextResponse } from 'next/server';
import { applySchemaChange } from '@/lib/schema-migration';
import type { NewFieldDefinition } from '@/lib/schema-migration';

export async function POST(req: NextRequest) {
  try {
    const { selectedCTs, field } = (await req.json()) as {
      selectedCTs: Array<{ id: string; name: string }>;
      field: NewFieldDefinition;
    };
    const result = await applySchemaChange(selectedCTs, field);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
