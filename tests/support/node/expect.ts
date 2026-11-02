// The house `expect`: vitest's own runtime with its asymmetric matcher factories typed as an opaque matcher instead of
// `any`, the way Playwright types its `expect.any` and friends. The type is declared once here; no value is wrapped.
import type { ExpectStatic } from "vitest";
import { expect as vitestExpect } from "vitest";

declare const MATCHER: unique symbol;

/** A matcher only the equality assertions (`toEqual`, `toMatchObject`, `toHaveBeenCalledWith`) read. */
interface AsymmetricMatcher {
  readonly [MATCHER]: true;
}

interface ContainingMatchers {
  stringContaining: (expected: string) => AsymmetricMatcher;
  stringMatching: (expected: string | RegExp) => AsymmetricMatcher;
  objectContaining: (expected: object) => AsymmetricMatcher;
  arrayContaining: (expected: unknown[]) => AsymmetricMatcher;
  closeTo: (expected: number, precision?: number) => AsymmetricMatcher;
}

interface TypedMatchers extends ContainingMatchers {
  any: (sample: unknown) => AsymmetricMatcher;
  anything: () => AsymmetricMatcher;
  not: ContainingMatchers;
}

// Listed first so overload resolution picks the opaque signature over vitest's `any` one.
type TestExpect = TypedMatchers & ExpectStatic;

export const expect: TestExpect = vitestExpect;
