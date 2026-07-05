import { describe, it, expect } from 'vitest';

import { preventPhotobookTextWidows } from '../services/trip-photobook-pdf-text.js';

const NBSP = '\u00a0';

describe('preventPhotobookTextWidows', () => {
  it('binds the last three words of a long paragraph with no-break spaces', () => {
    expect(preventPhotobookTextWidows('We walked along the old harbour')).toBe(
      `We walked along the${NBSP}old${NBSP}harbour`,
    );
  });

  it('leaves paragraphs under four words untouched', () => {
    expect(preventPhotobookTextWidows('one two three')).toBe('one two three');
    expect(preventPhotobookTextWidows('hello')).toBe('hello');
    expect(preventPhotobookTextWidows('')).toBe('');
  });

  it('applies per paragraph across newlines', () => {
    const input = 'first line has many words\nshort one\nsecond line also has words';
    const out = preventPhotobookTextWidows(input);
    const lines = out.split('\n');
    expect(lines[0]).toBe(`first line has${NBSP}many${NBSP}words`);
    expect(lines[1]).toBe('short one');
    expect(lines[2]).toBe(`second line also${NBSP}has${NBSP}words`);
  });

  it('collapses trailing whitespace and multi-space separators at the join points', () => {
    expect(preventPhotobookTextWidows('a b c  d   e  ')).toBe(`a b c${NBSP}d${NBSP}e`);
  });
});
