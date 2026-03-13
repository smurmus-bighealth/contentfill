import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { getContentfulToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  // C3 fix: gate this route with the same auth as all other API routes.
  // Without this, an unauthenticated caller on a local/simple deployment
  // could exhaust the ANTHROPIC_API_KEY with arbitrary requests.
  const token = await getContentfulToken(req);
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
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
