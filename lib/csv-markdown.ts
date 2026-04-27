/**
 * Converts a Markdown string to a Contentful Rich Text document AST.
 * Handles: headings (h1–h3), paragraphs, bold, italic, inline code,
 * unordered lists, ordered lists, and hyperlinks.
 *
 * This is intentionally minimal — no external dependencies.
 */

type RtNode =
  | { nodeType: 'document'; data: object; content: RtBlock[] }
  | RtBlock
  | RtInline;

type RtBlock =
  | { nodeType: 'heading-1' | 'heading-2' | 'heading-3'; data: object; content: RtInline[] }
  | { nodeType: 'paragraph'; data: object; content: RtInline[] }
  | { nodeType: 'unordered-list' | 'ordered-list'; data: object; content: RtListItem[] }
  | { nodeType: 'hr'; data: object; content: [] };

type RtListItem = { nodeType: 'list-item'; data: object; content: Array<{ nodeType: 'paragraph'; data: object; content: RtInline[] }> };

type RtInline =
  | { nodeType: 'text'; value: string; marks: Array<{ type: 'bold' | 'italic' | 'code' }>; data: object }
  | { nodeType: 'hyperlink'; data: { uri: string }; content: RtInline[] };

export function markdownToRichText(md: string): RtNode {
  const blocks = parseBlocks(md.trim());
  return {
    nodeType: 'document',
    data: {},
    content: blocks,
  };
}

function parseBlocks(text: string): RtBlock[] {
  const blocks: RtBlock[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) { i++; continue; }

    // Headings
    const h3 = line.match(/^### (.+)/);
    if (h3) { blocks.push({ nodeType: 'heading-3', data: {}, content: parseInlines(h3[1]) }); i++; continue; }
    const h2 = line.match(/^## (.+)/);
    if (h2) { blocks.push({ nodeType: 'heading-2', data: {}, content: parseInlines(h2[1]) }); i++; continue; }
    const h1 = line.match(/^# (.+)/);
    if (h1) { blocks.push({ nodeType: 'heading-1', data: {}, content: parseInlines(h1[1]) }); i++; continue; }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { blocks.push({ nodeType: 'hr', data: {}, content: [] }); i++; continue; }

    // Unordered list
    if (/^[-*+] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+] /.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+] /, ''));
        i++;
      }
      blocks.push({
        nodeType: 'unordered-list',
        data: {},
        content: items.map((item) => listItem(item)),
      });
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      blocks.push({
        nodeType: 'ordered-list',
        data: {},
        content: items.map((item) => listItem(item)),
      });
      continue;
    }

    // Paragraph — collect consecutive non-blank, non-block lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,3} /.test(lines[i]) &&
      !/^[-*+] /.test(lines[i]) &&
      !/^\d+\. /.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ nodeType: 'paragraph', data: {}, content: parseInlines(paraLines.join(' ')) });
    }
  }

  return blocks;
}

function listItem(text: string): RtListItem {
  return {
    nodeType: 'list-item',
    data: {},
    content: [{ nodeType: 'paragraph', data: {}, content: parseInlines(text) }],
  };
}

function parseInlines(text: string): RtInline[] {
  const nodes: RtInline[] = [];
  // Tokenise: links, bold, italic, inline-code, plain text
  const re = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|(?<![*_])\*([^*]+)\*(?![*])|_([^_]+)_/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(textNode(text.slice(last, match.index), []));
    }

    if (match[1] !== undefined) {
      // Hyperlink [label](url)
      nodes.push({ nodeType: 'hyperlink', data: { uri: match[2] }, content: [textNode(match[1], [])] });
    } else if (match[3] !== undefined) {
      nodes.push(textNode(match[3], [{ type: 'code' }]));
    } else if (match[4] !== undefined) {
      nodes.push(textNode(match[4], [{ type: 'bold' }]));
    } else if (match[5] !== undefined) {
      nodes.push(textNode(match[5], [{ type: 'bold' }]));
    } else if (match[6] !== undefined) {
      nodes.push(textNode(match[6], [{ type: 'italic' }]));
    } else if (match[7] !== undefined) {
      nodes.push(textNode(match[7], [{ type: 'italic' }]));
    }

    last = match.index + match[0].length;
  }

  if (last < text.length) {
    nodes.push(textNode(text.slice(last), []));
  }

  return nodes.length > 0 ? nodes : [textNode('', [])];
}

function textNode(value: string, marks: Array<{ type: 'bold' | 'italic' | 'code' }>): Extract<RtInline, { nodeType: 'text' }> {
  return { nodeType: 'text', value, marks, data: {} };
}
