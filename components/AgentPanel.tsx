'use client';

/**
 * AgentPanel — conversational AI interface for describing bulk Contentful changes.
 *
 * Users type plain-English descriptions of what they want to change.
 * The agent (Claude Sonnet) asks clarifying questions if needed, then resolves
 * to a MigrationPlan which is passed to the parent via onResolution.
 *
 * The parent (AgentFlow in page.tsx) immediately triggers /api/preview with the
 * resolved plan, then transitions to the existing PreviewStep → ApplyStep flow.
 *
 * Once a resolution is received, the ContentTypeInspector for the resolved
 * content type is surfaced below the chat so users can verify the schema and
 * a sample entry before proceeding.
 *
 * Multi-type operations are not yet supported — the agent will ask the user to
 * pick a single content type if the request is ambiguous.
 */

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { AgentMessage, AgentResolution, AgentRunOutput } from '@/lib/agent-types';
import type { ContentTypeSummary } from '@/lib/contentful';
interface Props {
  contentTypes: ContentTypeSummary[];
  /** IDs of content types the user has pre-selected in the UI — passed to the agent as focus context. */
  focusedCTIds: string[];
  onResolution: (resolution: AgentResolution) => void;
  /** Called when the agent identifies a content type, so the parent can persist the inspector. */
  onCTResolved: (ct: ContentTypeSummary) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING =
  "Hi! Describe what bulk change you'd like to make to your Contentful content. For example:\n\n" +
  "• \"Generate slugs for all Blog Post entries from the title field\"\n" +
  "• \"Copy the title into the seoTitle field for Articles\"\n" +
  "• \"Write a 2-sentence summary of each article's body into the excerpt field\"";

export default function AgentPanel({ contentTypes, focusedCTIds, onResolution, onCTResolved }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: GREETING },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      // The initial greeting is UI-only — not part of the actual Claude conversation.
      // Send only turns after the greeting to the API.
      const apiMessages: AgentMessage[] = nextMessages
        .slice(1)
        .map((m) => ({ role: m.role, content: m.content }));

      const result = await apiFetch<AgentRunOutput>('/api/agent', {
        method: 'POST',
        json: { messages: apiMessages, contentTypes, focusedCTIds },
      });

      setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);

      if (result.resolution) {
        const ct = contentTypes.find((c) => c.id === result.resolution!.plan.contentType);
        if (ct) onCTResolved(ct);
        onResolution(result.resolution);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-blue-200 bg-white overflow-hidden" style={{ height: '380px' }}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-blue-100 bg-blue-50 shrink-0">
          <span className="text-sm font-semibold text-blue-900">AI Assistant</span>
          <span className="text-xs text-blue-600 bg-blue-100 rounded-full px-2 py-0.5">Beta</span>
        </div>

        {/* Message history */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[82%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-400 animate-pulse">
                Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Error strip */}
        {error && (
          <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-t border-red-200 shrink-0">
            {error}
          </div>
        )}

        {/* Input row */}
        <div className="px-3 py-2 border-t border-gray-200 bg-white flex gap-2 shrink-0">
          <textarea
            className="flex-1 resize-none rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
            rows={2}
            placeholder="Describe the change you want to make… (Enter to send, Shift+Enter for newline)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!input.trim() || isLoading}
            className="self-end rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            Send
          </button>
        </div>
    </div>
  );
}
