declare module 'fontkit' {
  export interface FontkitGlyph {
    id: number;
  }

  export interface FontkitFont {
    layout(text: string): { glyphs: FontkitGlyph[] };
  }

  export function openSync(path: string): FontkitFont;
}
