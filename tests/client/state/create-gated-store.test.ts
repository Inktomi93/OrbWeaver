// The gated-store wrapper (runtime half; the REQUIRED-action-label typing is pinned by the
// .test-d.ts sibling): store CRUD through labeled setState, the subscribeWithSelector transient
// seam, the duplicate-name registry throw, and the node-lane warning-clean guarantee (devtools is
// enabled only when DEV *and* the Redux DevTools extension exist — neither here, so zustand must
// not console-warn about a missing extension).

import { createGatedStore, STORE_DEVTOOLS_ENABLED } from "@orb/client/state";
import { describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures";

const DUPLICATE_NAME_RE = /duplicate store name/u;

interface CounterState {
  readonly n: number;
  readonly label: string;
}

describe("createGatedStore", () => {
  test("creation + labeled writes + selector reads; devtools stays warning-clean in the node lane", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const counterStore = createGatedStore<CounterState>(
      "t-gated-counter",
      (): CounterState => ({ n: 0, label: "start" }),
    );
    expect(counterStore.getState()).toEqual({ n: 0, label: "start" });

    // Partial merge + REPLACE writes, both label-carrying (the type demands it).
    counterStore.setState({ n: 1 }, false, "counter/increment");
    expect(counterStore.getState()).toEqual({ n: 1, label: "start" });
    counterStore.setState({ n: 2, label: "replaced" }, true, "counter/replace");
    expect(counterStore.getState()).toEqual({ n: 2, label: "replaced" });

    // No extension + no DEV-gated bridge in node → zustand must not warn.
    expect(STORE_DEVTOOLS_ENABLED).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  test("subscribeWithSelector is baked in: selector-scoped transient subscription fires on its slice only", () => {
    const counterStore = createGatedStore<CounterState>(
      "t-gated-subscribe",
      (): CounterState => ({ n: 0, label: "start" }),
    );
    const seen: number[] = [];
    const unsub = counterStore.subscribe(
      (s) => s.n,
      (n) => seen.push(n),
    );

    counterStore.setState({ n: 5 }, false, "counter/set");
    counterStore.setState({ label: "other-slice" }, false, "counter/label");
    counterStore.setState({ n: 7 }, false, "counter/set");
    unsub();
    counterStore.setState({ n: 9 }, false, "counter/set");

    // The label-only write did not fire the n-selector listener; post-unsub writes don't either.
    expect(seen).toEqual([5, 7]);
  });

  test("initializer set() (labeled) works and a duplicate store name throws at creation", () => {
    const toggleStore = createGatedStore<{ readonly on: boolean; readonly flip: () => void }>(
      "t-gated-toggle",
      (set, get) => ({
        on: false,
        flip: (): void => {
          set({ on: !get().on }, false, "toggle/flip");
        },
      }),
    );
    toggleStore.getState().flip();
    expect(toggleStore.getState().on).toBe(true);

    expect(() =>
      createGatedStore<CounterState>("t-gated-toggle", () => ({ n: 0, label: "" })),
    ).toThrow(DUPLICATE_NAME_RE);
  });
});
