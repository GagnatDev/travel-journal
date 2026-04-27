import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Resolve `packages/server` (fonts live in `node_modules` next to package root). */
function serverPackageRoots(): string[] {
  const fromFile = join(__dirname, '../..');
  const fromCwd = join(process.cwd());
  const fromCwdParent = join(process.cwd(), '..');
  return [...new Set([fromFile, fromCwd, fromCwdParent])];
}

/** Latin .woff files from @fontsource (embedded subset; matches app Tailwind stack). */
export interface PhotobookFontPaths {
  display: string;
  displayItalic: string;
  ui: string;
  uiMedium: string;
}

export function resolvePhotobookFontPaths(): PhotobookFontPaths | null {
  for (const root of serverPackageRoots()) {
    const notoDir = join(root, 'node_modules', '@fontsource', 'noto-serif', 'files');
    const jakartaDir = join(root, 'node_modules', '@fontsource', 'plus-jakarta-sans', 'files');

    const paths: PhotobookFontPaths = {
      display: join(notoDir, 'noto-serif-latin-400-normal.woff'),
      displayItalic: join(notoDir, 'noto-serif-latin-400-italic.woff'),
      ui: join(jakartaDir, 'plus-jakarta-sans-latin-400-normal.woff'),
      uiMedium: join(jakartaDir, 'plus-jakarta-sans-latin-500-normal.woff'),
    };

    if (Object.values(paths).every((p) => existsSync(p))) return paths;
  }
  return null;
}
