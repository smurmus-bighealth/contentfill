import { NextResponse } from 'next/server';
import { getContentfulToken } from '@/lib/auth';
import { getContentTypes, fetchContentTypesFresh } from '@/lib/contentful';
import { TRANSFORMS, BROKEN_TRANSFORMS } from '@/lib/transforms';

export async function GET(request: Request) {
  const token = await getContentfulToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === '1';
    const contentTypes = forceRefresh
      ? await fetchContentTypesFresh(token)
      : await getContentTypes(token);

    return NextResponse.json({
      contentTypes,
      transforms: TRANSFORMS.map((t) => ({
        id: t.id,
        label: t.label,
        description: t.description,
        configSchema: t.configSchema,
        targetFieldTypes: t.targetFieldTypes,
      })),
      brokenTransforms: BROKEN_TRANSFORMS,
      spaceId: process.env.CONTENTFUL_SPACE_ID ?? '',
      environment: process.env.CONTENTFUL_ENVIRONMENT ?? 'master',
      anthropicEnabled: !!process.env.ANTHROPIC_API_KEY,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
