import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { checkAuth } from '@/lib/auth';
import { getContentTypes, fetchContentTypesFresh, CT_CACHE_TAG } from '@/lib/contentful';
import { TRANSFORMS, BROKEN_TRANSFORMS } from '@/lib/transforms';

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === '1';
    if (forceRefresh) revalidateTag(CT_CACHE_TAG);
    const contentTypes = forceRefresh ? await fetchContentTypesFresh() : await getContentTypes();
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
