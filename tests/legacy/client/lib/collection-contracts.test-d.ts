// Type pins for the COLLECTION seam's census channel (#1546). The defect was expressible only in the
// TYPE: `useCount` answered `number | undefined`, so "the read failed" and "the read has not landed" were
// the same value and no host could branch on the difference however carefully it was written. The fix is
// therefore a compile fact and belongs here — a contribution that hands back a bare number must not
// type-check, which is what stops the four implementors drifting back one at a time.

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

// #1219 — the SECOND defect expressible only in the type, and the #1203 class: `useMemberTitle` was
// OPTIONAL, so its caller (`useConfigSelectionTitle`, inside a persistent host it cannot key) had to spell
// `useMemberTitle?.()` — a HOOK whose existence varies by contribution. A kind switch between a collection
// that declares it and one that does not changes the hook COUNT mid-mount, which React answers with a
// crash. Required-in-the-type is the only enforcement that survives the fifth implementor.
// Spelled as an EXACT property type rather than a `@ts-expect-error` on an omitting literal: an optional
// field reads `((memberId: string) => string | undefined) | undefined` here, so this equality IS the
// "cannot be omitted" claim — and it does not spend a suppression the file's ratchet budget has no room
// for. Verified red against the old contract: `error TS2344: Type '(memberId: string) => string |
// undefined' does not satisfy the constraint '"Expected: function, Actual: undefined"'`.
test("the member-title hook is REQUIRED — and declining is a VALUE (the hook answers undefined)", () => {
  expectTypeOf<CollectionContribution["useMemberTitle"]>().toEqualTypeOf<(memberId: string) => string | undefined>();
  const contribution: Pick<CollectionContribution, "useMemberTitle"> = {
    useMemberTitle: (): string | undefined => undefined,
  };
  expectTypeOf(contribution.useMemberTitle).not.toBeAny();
});

test("a well-formed census hook compiles, including the warm-cache arm (a number BESIDE a failure)", () => {
  const contribution: Pick<CollectionContribution, "useCount"> = {
    useCount: (): CollectionCount => ({ count: 12, failed: true, retry: (): void => undefined }),
  };
  expectTypeOf(contribution.useCount).not.toBeAny();
});
