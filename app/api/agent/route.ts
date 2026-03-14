import { NextRequest, NextResponse } from 'next/server';
import { getContentfulToken } from '@/lib/auth';
import { runAgent } from '@/lib/agent';
import type { AgentMessage } from '@/lib/agent-types';
import type { ContentTypeSummary } from '@/lib/contentful';

export async function POST(req: NextRequest) {
  const token = await getContentfulToken();
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 501 });
  }

  let body: { messages: AgentMessage[]; contentTypes: ContentTypeSummary[]; focusedCTIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { messages, contentTypes, focusedCTIds } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages must be a non-empty array' }, { status: 400 });
  }
  if (messages.length > 30) {
    return NextResponse.json({ error: 'Conversation exceeds maximum length' }, { status: 400 });
  }
  if (!Array.isArray(contentTypes)) {
    return NextResponse.json({ error: 'contentTypes must be an array' }, { status: 400 });
  }
  // Validate each message has a role and string content
  for (const m of messages) {
    if ((m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      return NextResponse.json({ error: 'Each message must have role "user"|"assistant" and string content' }, { status: 400 });
    }
    if (m.content.length > 4000) {
      return NextResponse.json({ error: 'Message content exceeds 4000 characters' }, { status: 400 });
    }
  }

  try {
    const result = await runAgent(messages, contentTypes, token, focusedCTIds ?? []);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/agent]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
