import * as fontkit from 'fontkit';
import type PDFDocument from 'pdfkit';

import { setPhotobookFont, type PhotobookPdfFontRole } from './trip-photobook-pdf-fonts.js';

type PDFDoc = InstanceType<typeof PDFDocument>;

/** Single code points we render with the body font (Latin text style), not Noto Emoji. */
const EMOJI_AS_TEXT_SINGLE_CP = new Set([0x00a9, 0x00ae, 0x2122]); // © ® ™

export type FontkitOpenFont = ReturnType<typeof fontkit.openSync>;

let cachedEmojiKitKey = '';
let cachedEmojiKitFonts: FontkitOpenFont[] | null = null;

export function openPhotobookEmojiKitFonts(paths: string[] | null): FontkitOpenFont[] | null {
  if (!paths?.length) return null;
  const key = paths.join('\0');
  if (cachedEmojiKitKey === key && cachedEmojiKitFonts) return cachedEmojiKitFonts;
  cachedEmojiKitKey = key;
  cachedEmojiKitFonts = paths.map((p) => fontkit.openSync(p));
  return cachedEmojiKitFonts;
}

export function photobookEmojiPdfFontName(subset: number): string {
  return `PhotobookEmoji${subset}`;
}

export function registerPhotobookEmojiFonts(doc: PDFDoc, paths: string[]): void {
  for (let i = 0; i < paths.length; i++) {
    doc.registerFont(photobookEmojiPdfFontName(i), paths[i]!);
  }
}

export interface PhotobookPdfFontState {
  fontsOk: boolean;
  emojiFontsRegistered: boolean;
  emojiKitFonts: FontkitOpenFont[] | null;
}

export interface PhotobookPdfUserTextOptions {
  width: number;
  height?: number;
  align?: 'left' | 'center' | 'right';
  lineGap?: number;
}

function graphemeSegments(text: string): string[] {
  try {
    const seg = new Intl.Segmenter('und', { granularity: 'grapheme' });
    return [...seg.segment(text)].map((s) => s.segment);
  } catch {
    return [...text];
  }
}

function isSingleScalarGrapheme(g: string): boolean {
  const cp = g.codePointAt(0);
  if (cp === undefined) return false;
  return String.fromCodePoint(cp) === g;
}

/** Whether this grapheme should use the embedded Noto Emoji face (when available). */
export function preferPhotobookEmojiFont(g: string): boolean {
  if (!g) return false;
  const cp = g.codePointAt(0);
  if (cp !== undefined && isSingleScalarGrapheme(g) && EMOJI_AS_TEXT_SINGLE_CP.has(cp)) {
    return false;
  }
  if (/\p{Extended_Pictographic}/u.test(g)) return true;
  if (/\p{Emoji_Presentation}/u.test(g)) return true;
  if (g.includes('\u200d')) return true;
  if (/\u20e3/i.test(g)) return true;
  return false;
}

function emojiSubsetIndex(grapheme: string, fonts: FontkitOpenFont[]): number {
  for (let i = 0; i < fonts.length; i++) {
    const glyphs = fonts[i]!.layout(grapheme).glyphs;
    if (glyphs.length > 0 && glyphs.every((glyph) => glyph.id !== 0)) return i;
  }
  return -1;
}

type PdfToken =
  | { kind: 'text'; value: string }
  | { kind: 'emoji'; value: string; subset: number };

function buildTokens(text: string, emojiKitFonts: FontkitOpenFont[]): PdfToken[] {
  const out: PdfToken[] = [];
  for (const g of graphemeSegments(text)) {
    if (!g) continue;
    if (preferPhotobookEmojiFont(g)) {
      const subset = emojiSubsetIndex(g, emojiKitFonts);
      if (subset >= 0) {
        const prev = out[out.length - 1];
        if (prev?.kind === 'emoji' && prev.subset === subset) {
          prev.value += g;
        } else {
          out.push({ kind: 'emoji', value: g, subset });
        }
        continue;
      }
    }
    const prev = out[out.length - 1];
    if (prev?.kind === 'text') prev.value += g;
    else out.push({ kind: 'text', value: g });
  }
  return out;
}

function textNeedsEmojiLayout(text: string, emojiKitFonts: FontkitOpenFont[]): boolean {
  for (const g of graphemeSegments(text)) {
    if (!g) continue;
    if (!preferPhotobookEmojiFont(g)) continue;
    if (emojiSubsetIndex(g, emojiKitFonts) >= 0) return true;
  }
  return false;
}

function flattenTextForWrapping(tokens: PdfToken[]): PdfToken[] {
  const out: PdfToken[] = [];
  for (const t of tokens) {
    if (t.kind === 'emoji') {
      out.push(t);
      continue;
    }
    const parts = t.value.split(/(\s+)/);
    for (const p of parts) {
      if (p) out.push({ kind: 'text', value: p });
    }
  }
  return out;
}

function measureTokenWidth(
  doc: PDFDoc,
  state: PhotobookPdfFontState,
  baseRole: PhotobookPdfFontRole,
  fontSize: number,
  token: PdfToken,
): number {
  doc.save();
  doc.fontSize(fontSize);
  if (token.kind === 'text') {
    setPhotobookFont(doc, state.fontsOk, baseRole);
    const w = doc.widthOfString(token.value);
    doc.restore();
    return w;
  }
  doc.font(photobookEmojiPdfFontName(token.subset));
  const w = doc.widthOfString(token.value);
  doc.restore();
  return w;
}

function splitLongTextToWidths(
  text: string,
  maxWidth: number,
  measureText: (s: string) => number,
): string[] {
  const segs = graphemeSegments(text);
  const chunks: string[] = [];
  let buf = '';
  for (const g of segs) {
    const next = buf + g;
    if (buf && measureText(next) > maxWidth) {
      chunks.push(buf);
      buf = g;
      if (measureText(buf) > maxWidth) {
        chunks.push(buf);
        buf = '';
      }
    } else {
      buf = next;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function wrapTokensToLines(
  doc: PDFDoc,
  state: PhotobookPdfFontState,
  baseRole: PhotobookPdfFontRole,
  fontSize: number,
  tokens: PdfToken[],
  maxWidth: number,
): PdfToken[][] {
  const atoms = flattenTextForWrapping(tokens);
  const measure = (t: PdfToken) => measureTokenWidth(doc, state, baseRole, fontSize, t);
  const lines: PdfToken[][] = [];
  let line: PdfToken[] = [];
  let lineW = 0;

  const flush = () => {
    if (line.length) {
      lines.push(line);
      line = [];
      lineW = 0;
    }
  };

  for (const atom of atoms) {
    let w = measure(atom);
    if (atom.kind === 'text' && w > maxWidth) {
      flush();
      const parts = splitLongTextToWidths(atom.value, maxWidth, (s) =>
        measureTokenWidth(doc, state, baseRole, fontSize, { kind: 'text', value: s }),
      );
      for (const p of parts) {
        const piece: PdfToken = { kind: 'text', value: p };
        const pw = measure(piece);
        if (line.length && lineW + pw > maxWidth) flush();
        if (!line.length) {
          line.push(piece);
          lineW = pw;
        } else {
          line.push(piece);
          lineW += pw;
        }
        flush();
      }
      continue;
    }

    if (line.length && lineW + w > maxWidth) flush();
    if (!line.length) {
      line.push(atom);
      lineW = w;
    } else {
      line.push(atom);
      lineW += w;
    }
  }
  flush();
  return lines;
}

/**
 * Renders user-authored strings (trip title/description, entry title/body) with Noto Emoji
 * for pictographs when emoji fonts are registered; otherwise falls back to {@link setPhotobookFont} only.
 */
export function drawPhotobookPdfUserText(
  doc: PDFDoc,
  state: PhotobookPdfFontState,
  baseRole: PhotobookPdfFontRole,
  fontSize: number,
  fillColor: string,
  text: string,
  x: number,
  y: number,
  options: PhotobookPdfUserTextOptions,
): void {
  if (!text.trim()) {
    doc.y = y;
    return;
  }

  const body = text;
  const { width, height, align = 'left', lineGap = 0 } = options;

  const canMix =
    state.emojiFontsRegistered && state.emojiKitFonts && textNeedsEmojiLayout(body, state.emojiKitFonts);

  if (!canMix) {
    setPhotobookFont(doc, state.fontsOk, baseRole);
    doc.fontSize(fontSize).fillColor(fillColor).text(body, x, y, {
      width,
      height,
      align,
      lineGap,
    });
    return;
  }

  const emojiKitFonts = state.emojiKitFonts!;
  const tokens = buildTokens(body, emojiKitFonts);
  doc.save();
  doc.fontSize(fontSize).fillColor(fillColor);
  doc.lineGap(lineGap);

  setPhotobookFont(doc, state.fontsOk, baseRole);
  const lineHeight = doc.currentLineHeight(true);

  const lines = wrapTokensToLines(doc, state, baseRole, fontSize, tokens, width);
  const maxY = height !== undefined ? y + height : Number.POSITIVE_INFINITY;

  let yPos = y;
  for (const lineTokens of lines) {
    if (yPos + lineHeight > maxY) break;

    let totalW = 0;
    for (const t of lineTokens) {
      totalW += measureTokenWidth(doc, state, baseRole, fontSize, t);
    }

    let startX = x;
    if (align === 'center') startX = x + (width - totalW) / 2;
    else if (align === 'right') startX = x + (width - totalW);

    let curX = startX;
    for (const t of lineTokens) {
      if (t.kind === 'text') setPhotobookFont(doc, state.fontsOk, baseRole);
      else doc.font(photobookEmojiPdfFontName(t.subset));
      doc.text(t.value, curX, yPos, { lineBreak: false });
      curX = doc.x;
    }
    yPos += lineHeight;
  }

  doc.y = Math.min(yPos, maxY);
  doc.restore();
}
