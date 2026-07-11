// Unit: path-compressed fork-lineage roots — every chat resolves to its family root (via parentChatId), so a
// look-alike pair sharing a root is `forked` vs an independent `duplicate`. Guards a cyclic/orphan chain.

import { describe } from "vitest";
import { forkRoots } from "../../../../../packages/server/src/domain/discovery/substrate/fork-roots.ts";
import { expect, test } from "../../../../support/fixtures";

describe("forkRoots", () => {
  test("resolves a fork chain to the topmost root", () => {
    // a → b → c (c is the root); d is an independent root.
    const roots = forkRoots(
      new Map([
        ["a", "b"],
        ["b", "c"],
        ["c", null],
        ["d", null],
      ]),
    );
    expect(roots.get("a")).toBe("c");
    expect(roots.get("b")).toBe("c");
    expect(roots.get("c")).toBe("c");
    expect(roots.get("d")).toBe("d");
    // a and b share a root (a fork family); d does not.
    expect(roots.get("a")).toBe(roots.get("b"));
    expect(roots.get("a")).not.toBe(roots.get("d"));
  });

  test("a parent row that's gone (SET NULL) makes the child its own root", () => {
    // b's parent "missing" isn't a key → b is a root (a fork outlived its parent).
    const roots = forkRoots(new Map([["b", "missing"]]));
    expect(roots.get("b")).toBe("b");
  });

  test("a cyclic chain terminates (corrupt lineage guard)", () => {
    const roots = forkRoots(
      new Map([
        ["x", "y"],
        ["y", "x"],
      ]),
    );
    // Both resolve to some stable node without looping forever.
    expect(roots.get("x")).toBeDefined();
    expect(roots.get("y")).toBeDefined();
  });
});
