// The KINDED selection mint (create-kinded-selection-store): the (kind, member) drill behind the config
// workspace's ONE selection across N sibling collections. The reactive read hook needs a React render (the
// create-drill-selection-store.test.ts posture — the state transitions are exercised end-to-end by
// config-selection-store.ct.tsx), so this node lane pins the FACTORY contract: the surface it exposes,
// callable actions, and the `createGatedStore` duplicate-name guard propagating through the mint.

import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { afterEach, describe, vi } from "vitest";
import { createKindedSelectionStore } from "#client/state/create-kinded-selection-store.ts";

const DUPLICATE_NAME_RE = /duplicate store name/u;

describe("createKindedSelectionStore", () => {
  test("exposes the kinded drill surface as callable actions", () => {
    const drill = createKindedSelectionStore("t-kinded-surface");
    for (const fn of [drill.useSelection, drill.select, drill.clear, drill.selectFromList]) {
      expect(typeof fn).toBe("function");
    }
    // The actions run without throwing (`selectFromList` also pokes the shell overlay); the rendered
    // read-back is the CT's.
    expect(() => {
      drill.select("tags", "tag_probe");
      drill.selectFromList("regex", "regex_probe");
      drill.clear();
    }).not.toThrow();
  });

  test("two mints can never share a devtools connection label (the door's guard propagates)", () => {
    createKindedSelectionStore("t-kinded-dupe");
    expect(() => createKindedSelectionStore("t-kinded-dupe")).toThrow(DUPLICATE_NAME_RE);
  });
});

// The kinded door is the config workspace's selection: its writes ride the same content-swap transition as
// every other section's item switch (see create-drill-selection-store.test.ts).
describe("createKindedSelectionStore — content writes ride the shell's content swap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("select, selectFromList and clear each raise one view transition and write inside it", async () => {
    const callbacks: Array<() => void | Promise<void>> = [];
    const start = vi.fn((callback: () => void | Promise<void>) => {
      callbacks.push(callback);
      return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: Promise.resolve() };
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("document", { querySelector: () => null, startViewTransition: start });
    const drill = createKindedSelectionStore("t-kinded-swap");
    const hasSelection = (): boolean => drill.selection.hasSelection();

    drill.select("tags", "tag_probe");
    expect(start).toHaveBeenCalledTimes(1);
    expect(hasSelection()).toBe(false);
    await callbacks[0]?.();
    expect(hasSelection()).toBe(true);

    await Promise.resolve();
    drill.clear();
    expect(start).toHaveBeenCalledTimes(2);
    expect(hasSelection()).toBe(true);
    await callbacks[1]?.();
    expect(hasSelection()).toBe(false);

    await Promise.resolve();
    drill.selectFromList("regex", "regex_probe");
    expect(start).toHaveBeenCalledTimes(3);
    await callbacks[2]?.();
    expect(hasSelection()).toBe(true);
  });
});
