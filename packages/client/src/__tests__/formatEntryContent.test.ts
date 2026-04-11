import { describe, it, expect } from 'vitest';

import { formatEntryContent } from '../utils/formatEntryContent.js';

describe('formatEntryContent', () => {
  it('wraps **bold** in <strong>', () => {
    expect(formatEntryContent('**bold**')).toBe('<strong>bold</strong>');
  });

  it('wraps *italic* in <em>', () => {
    expect(formatEntryContent('*italic*')).toBe('<em>italic</em>');
  });

  it('handles nested **bold and *italic***', () => {
    expect(formatEntryContent('**bold and *italic***')).toBe(
      '<strong>bold and <em>italic</em></strong>',
    );
  });

  it('passes plain text through unchanged', () => {
    expect(formatEntryContent('plain text')).toBe('plain text');
  });

  it('HTML-escapes <script>alert(1)</script> — not rendered as a tag', () => {
    const result = formatEntryContent('<script>alert(1)</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('handles multiple bold spans on one line', () => {
    const result = formatEntryContent('**hello** and **world**');
    expect(result).toBe('<strong>hello</strong> and <strong>world</strong>');
  });

  it('handles multiple italic spans on one line', () => {
    const result = formatEntryContent('*hello* and *world*');
    expect(result).toBe('<em>hello</em> and <em>world</em>');
  });

  it('handles bold containing italic with clean delimiters', () => {
    const result = formatEntryContent('**before *italic* after**');
    expect(result).toBe('<strong>before <em>italic</em> after</strong>');
  });

  it('escapes & in content', () => {
    expect(formatEntryContent('bread & butter')).toBe('bread &amp; butter');
  });

  it('returns empty string for empty input', () => {
    expect(formatEntryContent('')).toBe('');
  });
});
