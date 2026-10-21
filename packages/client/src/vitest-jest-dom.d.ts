import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

/**
 * Vitest 5's `Assertion` has two type parameters. jest-dom 7 still augments the
 * single-parameter form, so the DOM matchers are declared again here.
 */
declare module 'vitest' {
  // Declaration merging needs an empty interface; the first parameter exists only to match Vitest's signature.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<_R extends void | Promise<void> = void, T = unknown>
    extends TestingLibraryMatchers<unknown, T> {}
}
