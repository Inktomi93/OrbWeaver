// The KINDED selection mint (create-kinded-selection-store): the (kind, member) drill behind the config
// workspace's ONE selection across N sibling collections. The reactive read hook needs a React render (the
// create-drill-selection-store.test.ts posture — the state transitions are exercised end-to-end by
// config-selection-store.ct.tsx), so this node lane pins the FACTORY contract: the surface it exposes,
// callable actions, and the `createGatedStore` duplicate-name guard propagating through the mint.

import { createKindedSelectionStore } from "@orb/client/state";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

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
