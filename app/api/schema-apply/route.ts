import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { checkAuth } from '@/lib/auth';
import { applySchemaChange } from '@/lib/schema-migration';
import { CT_CACHE_TAG } from '@/lib/contentful';
import type { NewFieldDefinition } from '@/lib/schema-migration';

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { selectedCTs, field } = (await req.json()) as {
      selectedCTs: Array<{ id: string; name: string }>;
      field: NewFieldDefinition;
    };
    const result = await applySchemaChange(selectedCTs, field);
    if (result.succeeded.length > 0) revalidateTag(CT_CACHE_TAG);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
