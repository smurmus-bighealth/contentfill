import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { getContentfulToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  // Gate this route the same as all other API routes — an unauthenticated
  // caller in local dev mode could otherwise exhaust the ANTHROPIC_API_KEY.
  const token = await getContentfulToken();
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 501 });
  }

  try {
    const { description, fields } = (await req.json()) as {
      description: string;
      fields: string[];
    };

    if (typeof description !== 'string' || description.length > 2000) {
      return NextResponse.json(
        { error: 'description must be a string under 2000 characters' },
        { status: 400 },
      );
    }
    if (!Array.isArray(fields) || fields.length > 200) {
      return NextResponse.json(
        { error: 'fields must be an array with at most 200 entries' },
        { status: 400 },
      );
    }

    const templatePath = join(process.cwd(), 'lib', 'transforms', '_template.ts');
    const template = await readFile(templatePath, 'utf-8');

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `You are a TypeScript code generator for a Contentful field migration tool.

Generate a complete transform file based on the following template:

\`\`\`typescript
${template}
\`\`\`

The available field IDs on this content type are: ${fields.join(', ')}

User's description of the desired transform:
${description}

Rules:
- Follow the template structure exactly
- Use a descriptive unique id (kebab-case)
- Set appropriate targetFieldTypes based on the output
- Include only configSchema fields that are actually needed
- The apply() function must be pure (no API calls, no side effects)
- Remove validateBatch if not needed
- Output ONLY the TypeScript code, no markdown fences, no explanation`,
        },
      ],
    });

    const code = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('');

    return NextResponse.json({ code });
  } catch (err) {
    console.error('[api/generate-transform]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
