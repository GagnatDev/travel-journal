import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import PDFDocument from 'pdfkit';

import { logger } from '../logger.js';

type PDFDoc = InstanceType<typeof PDFDocument>;

/** Same resolution strategy as `trip-photobook-fonts.ts` so assets resolve in dev, tests, and `dist/`. */
function serverPackageRoots(): string[] {
  const fromFile = join(__dirname, '../..');
  const fromCwd = join(process.cwd());
  const fromCwdParent = join(process.cwd(), '..');
  return [...new Set([fromFile, fromCwd, fromCwdParent])];
}

/** Coated FOGRA39 CMYK profile (e.g. from Linux colord: `/usr/share/color/icc/colord/`). */
const ICC_FILENAME = 'FOGRA39L_coated.icc';

export function resolvePhotobookOutputIccPath(): string | null {
  for (const root of serverPackageRoots()) {
    const p = join(root, 'assets', 'icc', ICC_FILENAME);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * PDF/X-4: embed FOGRA39 CMYK OutputIntent + XMP `pdfxid:GTS_PDFXVersion` for print (e.g. Prodigi).
 * Set `TRIP_PDF_PDFX=0` to skip. If the ICC file is missing, logs a warning and skips (PDF stays valid).
 */
export async function attachPhotobookPdfX4(doc: PDFDoc): Promise<void> {
  const raw = process.env['TRIP_PDF_PDFX'];
  if (raw === '0' || raw === 'false') return;

  const iccPath = resolvePhotobookOutputIccPath();
  if (!iccPath) {
    logger.warn('Photobook PDF/X: ICC profile not found (expected packages/server/assets/icc/FOGRA39L_coated.icc); skipping OutputIntent');
    return;
  }

  let icc: Buffer;
  try {
    icc = await readFile(iccPath);
  } catch (err) {
    logger.warn({ err }, 'Photobook PDF/X: failed to read ICC profile; skipping OutputIntent');
    return;
  }

  const iccRef = doc.ref({
    Length: icc.length,
    N: 4,
    Alternate: 'DeviceCMYK',
  });
  iccRef.compress = false;
  iccRef.write(icc);
  iccRef.end(undefined);

  const outputIntentRef = doc.ref({
    Type: 'OutputIntent',
    S: 'GTS_PDFX',
    OutputConditionIdentifier: 'FOGRA39',
    RegistryName: 'http://www.color.org',
    Info: 'Coated FOGRA39 (ISO 12647-2:2004)',
    DestOutputProfile: iccRef,
  });
  outputIntentRef.end(undefined);

  const root = doc as unknown as { _root: { data: { OutputIntents?: unknown } } };
  root._root.data.OutputIntents = [outputIntentRef];

  doc.appendXML(`
        <rdf:Description rdf:about="" xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/">
            <pdfxid:GTS_PDFXVersion>PDF/X-4</pdfxid:GTS_PDFXVersion>
        </rdf:Description>
        `);
}
