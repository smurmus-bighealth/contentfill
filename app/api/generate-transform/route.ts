import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getContentfulToken } from '@/lib/auth';
import { GENERATE_TRANSFORM_MODEL } from '@/lib/ai-models';

const DEFINE_TRANSFORM_TOOL: Anthropic.Tool = {
  name: 'define_transform',
  description: 'Define the inline transform with its label, description, and apply function body.',
  input_schema: {
    type: 'object' as const,
    properties: {
      label: { type: 'string', description: 'Short human-readable name (3–6 words)' },
      description: { type: 'string', description: 'One-sentence description of what the transform does' },
      code: {
        type: 'string',
        description:
          'Body of the JavaScript apply function — the statements inside apply(entry, config, allSnapshots) { ... }. ' +
          'No TypeScript types, no imports, no require().',
      },
    },
    required: ['label', 'description', 'code'],
  },
};

export async function POST(req: NextRequest) {
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

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: GENERATE_TRANSFORM_MODEL,
      max_tokens: 1024,
      tools: [DEFINE_TRANSFORM_TOOL],
      tool_choice: { type: 'tool', name: 'define_transform' },
      messages: [
        {
          role: 'user',
          content: `You are a JavaScript code generator for a Contentful field migration tool.

Generate an inline apply function based on the user's description.

The function signature is: apply(entry, config, allSnapshots)
- entry.fields contains all field values keyed by field ID, already locale-resolved (e.g. entry.fields.title is the string value)
- config is always empty — ignore it
- allSnapshots is the full array of all entries (use for cross-entry logic only if needed)
- Return the new value to write to the target field, or null to skip this entry

Available field IDs on this content type: ${fields.join(', ')}

Rules:
- Generate ONLY the body of the function (the statements that go inside the braces — not the function declaration itself)
- Plain JavaScript only — no TypeScript, no imports, no side effects
- Keep it concise and readable

User description: ${description}`,
        },
      ],
    });

    const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!toolUse) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
    }

    const { label, description: genDescription, code } = toolUse.input as {
      label: string;
      description: string;
      code: string;
    };

    if (typeof code !== 'string' || !code.trim()) {
      return NextResponse.json({ error: 'AI returned an empty transform — try rephrasing your description' }, { status: 500 });
    }

    return NextResponse.json({ code, label, description: genDescription });
  } catch (err) {
    console.error('[api/generate-transform]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
