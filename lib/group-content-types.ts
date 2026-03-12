import type { ContentTypeSummary } from './contentful';

/** Groups content types by the "Parent: Sub type" naming convention. */
export function groupContentTypes(items: ContentTypeSummary[]): {
  groups: Map<string, ContentTypeSummary[]>;
  ungrouped: ContentTypeSummary[];
} {
  const groups = new Map<string, ContentTypeSummary[]>();
  const ungrouped: ContentTypeSummary[] = [];
  for (const c of items) {
    try {
      const colonIdx = c.name.indexOf(': ');
      if (colonIdx > 0) {
        const parent = c.name.slice(0, colonIdx);
        if (!groups.has(parent)) groups.set(parent, []);
        groups.get(parent)!.push(c);
      } else {
        ungrouped.push(c);
      }
    } catch {
      ungrouped.push(c);
    }
  }
  return { groups, ungrouped };
}
