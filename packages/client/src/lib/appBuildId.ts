/**
 * Identifies this JS bundle. Set at build time via Vite `define` so a new
 * deployment can be detected by comparing with `/version.json` on the server.
 */
export const BUILD_ID: string = import.meta.env.VITE_APP_BUILD_ID ?? '';

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
