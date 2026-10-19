/**
 * Express 5 types each route param as `string | string[]`.
 * These routes only declare a single path segment, so the value is a string.
 */
export function routeParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw.length === 0) {
    const err = new Error('Missing route parameter') as Error & { status: number; code: string };
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  return raw;
}
