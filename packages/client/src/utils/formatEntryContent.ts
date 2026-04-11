function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Formats entry content with basic Markdown-like syntax.
 *
 * Supported:
 *   **text** → <strong>text</strong>
 *   *text*   → <em>text</em>
 *   Nested: **bold and *italic*** → <strong>bold and <em>italic</em></strong>
 *
 * All raw HTML in the input is escaped to prevent XSS.
 */
export function formatEntryContent(raw: string): string {
  const escaped = escapeHtml(raw);

  // Apply bold. When the bold block ends with *** (italic-close + bold-close),
  // wrap the trailing italic content inside <em> before closing <strong>.
  const withBold = escaped.replace(/\*\*(.+?)\*{2,3}/g, (match, content: string) => {
    if (match.endsWith('***')) {
      // The last * (before **) closes an italic that opened somewhere in content.
      const inner = content.replace(/\*([^*]+)$/, '<em>$1</em>');
      return `<strong>${inner}</strong>`;
    }
    // Regular bold block: apply italic inside.
    const inner = (content as string).replace(/\*([^*<>]+)\*/g, '<em>$1</em>');
    return `<strong>${inner}</strong>`;
  });

  // Apply any remaining italic markers that were outside bold blocks.
  return withBold.replace(/\*([^*<>]+)\*/g, '<em>$1</em>');
}
