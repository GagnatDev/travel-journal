/**
 * Identifies this JS bundle. Set at build time via Vite `define` so a new
 * deployment can be detected by comparing with `/version.json` on the server.
 *
 * Vitest does not always apply `vitest.config.ts` `define` to app modules the
 * same way as Vite dev/build; in `MODE === 'test'` we fall back so deployment
 * checks stay enabled in component tests.
 */
const envBuildId = import.meta.env.VITE_APP_BUILD_ID;
export const BUILD_ID: string =
  typeof envBuildId === 'string' && envBuildId.length > 0
    ? envBuildId
    : import.meta.env.MODE === 'test'
      ? 'vitest-client-bundle'
      : '';

export async function fetchDeployedBuildId(signal?: AbortSignal): Promise<string | null> {
  try {
    const init: RequestInit = { cache: 'no-store', ...(signal ? { signal } : {}) };
    const res = await fetch(`/version.json?${Date.now()}`, init);
    if (!res.ok) return null;
    const j = (await res.json()) as { buildId?: unknown };
    return typeof j.buildId === 'string' && j.buildId.length > 0 ? j.buildId : null;
  } catch {
    return null;
  }
}
