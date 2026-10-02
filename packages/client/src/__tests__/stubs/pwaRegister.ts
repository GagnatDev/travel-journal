/**
 * Test stub for the `virtual:pwa-register` module, which is only provided by
 * vite-plugin-pwa at build/dev time and isn't available under Vitest. Aliased
 * in vitest.config.ts so components using `usePwaUpdate` render in tests.
 */
export function registerSW(_options?: unknown): (reloadPage?: boolean) => Promise<void> {
  return async () => {};
}
