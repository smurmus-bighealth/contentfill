import { NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth';
import { getContentTypes } from '@/lib/contentful';
import { TRANSFORMS } from '@/lib/transforms';

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const contentTypes = await getContentTypes();
    return NextResponse.json({
      contentTypes,
      transforms: TRANSFORMS.map((t) => ({
        id: t.id,
        label: t.label,
        description: t.description,
        configSchema: t.configSchema,
        targetFieldTypes: t.targetFieldTypes,
      })),
      spaceId: process.env.CONTENTFUL_SPACE_ID ?? '',
      environment: process.env.CONTENTFUL_ENVIRONMENT ?? 'master',
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
