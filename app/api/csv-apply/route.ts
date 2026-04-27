import { NextResponse } from 'next/server';
import { getContentfulToken } from '@/lib/auth';
import { applyImport } from '@/lib/csv-import';
import type { CsvImportConfig, CsvEntryProposal } from '@/lib/csv-types';

interface RequestBody {
  proposals: CsvEntryProposal[];
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

  const { proposals, config } = body;

  if (!config?.contentTypeId) {
    return NextResponse.json({ error: 'contentTypeId is required' }, { status: 400 });
  }
  if (!Array.isArray(proposals) || proposals.length === 0) {
    return NextResponse.json({ error: 'proposals must be a non-empty array' }, { status: 400 });
  }

  try {
    const result = await applyImport(proposals, config, token);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/csv-apply]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
