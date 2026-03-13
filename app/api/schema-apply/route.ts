import { NextRequest, NextResponse } from 'next/server';
import { getContentfulToken } from '@/lib/auth';
import { applySchemaChange } from '@/lib/schema-migration';
import type { NewFieldDefinition } from '@/lib/schema-migration';

export async function POST(req: NextRequest) {
  const token = await getContentfulToken();
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { selectedCTs, field } = (await req.json()) as {
      selectedCTs: Array<{ id: string; name: string }>;
      field: NewFieldDefinition;
    };
    const result = await applySchemaChange(selectedCTs, field, token);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
