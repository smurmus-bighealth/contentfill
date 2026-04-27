import { NextResponse } from 'next/server';
import { getContentfulToken } from '@/lib/auth';
import { getContentTypes } from '@/lib/contentful';
import { buildPreview } from '@/lib/csv-import';
import { CSV_ROW_LIMIT } from '@/lib/csv-parser';
import type { CsvImportConfig, CsvRow } from '@/lib/csv-types';

interface RequestBody {
  rows: CsvRow[];
  config: CsvImportConfig;
}

export async function POST(request: Request) {
  const token = await getContentfulToken();
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { rows, config } = body;

  if (!config?.contentTypeId) {
    return NextResponse.json({ error: 'contentTypeId is required' }, { status: 400 });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'rows must be a non-empty array' }, { status: 400 });
  }
  if (rows.length > CSV_ROW_LIMIT) {
    return NextResponse.json(
      { error: `CSV exceeds the ${CSV_ROW_LIMIT}-row limit (${rows.length} rows provided)` },
      { status: 400 },
    );
  }

  try {
    const contentTypes = await getContentTypes(token);
    const contentType = contentTypes.find((ct) => ct.id === config.contentTypeId);
    if (!contentType) {
      return NextResponse.json(
        { error: `Content type "${config.contentTypeId}" not found` },
        { status: 404 },
      );
    }

    const result = await buildPreview(rows, config, contentType, token);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/csv-preview]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
