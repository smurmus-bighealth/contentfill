import { NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth';
import { getSampleEntry } from '@/lib/contentful';

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contentType = searchParams.get('contentType');
  if (!contentType) {
    return NextResponse.json({ error: 'contentType is required' }, { status: 400 });
  }

  try {
    const entry = await getSampleEntry(contentType);
    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
