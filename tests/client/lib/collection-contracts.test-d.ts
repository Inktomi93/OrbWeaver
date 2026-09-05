// Type pins for the COLLECTION seam's census channel (#1546). The defect was expressible only in the
// TYPE: `useCount` answered `number | undefined`, so "the read failed" and "the read has not landed" were
// the same value and no host could branch on the difference however carefully it was written. The fix is
// therefore a compile fact and belongs here — a contribution that hands back a bare number must not
// type-check, which is what stops the four implementors drifting back one at a time.
//
// WHICH LANE VERDICTS THIS FILE: `types:tests-dom` (`pnpm typecheck:tests-dom`) — `tsconfig.tests-dom.json`
// includes `tests/client/**/*.ts`. The vitest `types` project also collects it and prints a green tick,
// but that green is VACUOUS (its program excludes `tests/client` wholesale); see the note in
// `registry.test-d.ts`, which is the one home for that partition.

import type { CollectionContribution, CollectionCount } from "@orb/client/lib";
import { expectTypeOf, test } from "vitest";

/** What every implementor now returns: a number, whether the read FAILED, and how to re-ask it. */
const HEALTHY: CollectionCount = { count: 3, failed: false, retry: (): void => undefined };

test("the census hook answers a CollectionCount — the shape carrying the failure channel", () => {
  expectTypeOf<ReturnType<NonNullable<CollectionContribution["useCount"]>>>().toEqualTypeOf<CollectionCount>();
  expectTypeOf(HEALTHY.count).toEqualTypeOf<number | undefined>();
  expectTypeOf(HEALTHY.failed).toEqualTypeOf<boolean>();
});

test("a hook that answers a bare number cannot satisfy the seam — absence is not failure", () => {
  const contribution: Pick<CollectionContribution, "useCount"> = {
    // @ts-expect-error — `number | undefined` has no failure channel, which is the whole of #1546
    useCount: (): number | undefined => 3,
  };
  expectTypeOf(contribution).not.toBeAny();
});

test("…and neither does one that reports failure without saying how to retry", () => {
  const contribution: Pick<CollectionContribution, "useCount"> = {
    // @ts-expect-error — `retry` is part of the channel: only the contribution knows which read to re-ask
    useCount: () => ({ count: undefined, failed: true }),
  };
  expectTypeOf(contribution).not.toBeAny();
});

test("a well-formed census hook compiles, including the warm-cache arm (a number BESIDE a failure)", () => {
  const contribution: Pick<CollectionContribution, "useCount"> = {
    useCount: (): CollectionCount => ({ count: 12, failed: true, retry: (): void => undefined }),
  };
  expectTypeOf(contribution.useCount).not.toBeAny();
});
