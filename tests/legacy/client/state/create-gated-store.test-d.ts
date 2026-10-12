// Type pins for the gated-store wrapper's WHOLE POINT: the devtools action label (the setter's
// 3rd arg) is REQUIRED — a label-less `set`/`setState` is a compile error, both inside the
// initializer and on the store handle. Runtime behavior lives in the .test.ts sibling; these
// assertions are typecheck-only (no runtime pass).

import type { GatedSet, GatedStoreHook } from "@orb/client/state";
import { createGatedStore } from "@orb/client/state";
import { expectTypeOf, test } from "vitest";

interface CounterState {
  readonly n: number;
}

test("initializer set() without the action label fails to compile", () => {
  const store = createGatedStore<CounterState>("td-gated-initializer", (set, get) => {
    // @ts-expect-error — set(partial) alone: the replace flag + REQUIRED label are missing
    set({ n: 1 });
    // @ts-expect-error — set(partial, replace) without the label: the label 3rd arg is REQUIRED
    set({ n: 1 }, false);
    // @ts-expect-error — the replace:true form also REQUIRES the label
    set({ n: 1 }, true);
    set({ n: 1 }, false, "counter/merge-ok");
    set({ n: 1 }, true, "counter/replace-ok");
    expectTypeOf(set).toEqualTypeOf<GatedSet<CounterState>>();
    expectTypeOf(get()).toEqualTypeOf<CounterState>();
    return { n: 0 };
  });
  expectTypeOf(store).toEqualTypeOf<GatedStoreHook<CounterState>>();
});

test("store-handle setState without the action label fails to compile", () => {
  const store = createGatedStore<CounterState>("td-gated-handle", () => ({ n: 0 }));
  // @ts-expect-error — label-less setState is banned by the GatedSet re-typing
  store.setState({ n: 2 });
  // @ts-expect-error — label-less merge setState is banned
  store.setState({ n: 2 }, false);
  // @ts-expect-error — label-less replace setState is banned
  store.setState({ n: 2 }, true);
  store.setState({ n: 2 }, false, "counter/set");
  store.setState({ n: 2 }, true, "counter/replace");

  // The handle keeps the full gated shape (reads + the transient subscribe seam).
  expectTypeOf(store).toEqualTypeOf<GatedStoreHook<CounterState>>();
  expectTypeOf(store.getState()).toEqualTypeOf<CounterState>();
  expectTypeOf(store.setState).toEqualTypeOf<GatedSet<CounterState>>();
});
