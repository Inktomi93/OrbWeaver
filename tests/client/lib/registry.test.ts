// createRegistry/createContributorRegistry (client-architecture-lockdown.md §5) — completeness is a
// compile fact (see registry.test-d.ts); these pin the runtime behavior tsc can't: unknown-id throw,
// duplicate-contributor-id throw at construction, list() order.

import { createContributorRegistry, createRegistry } from "@orb/client/lib";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const ID_TUPLE = ["a", "b", "c"] as const;
type Id = (typeof ID_TUPLE)[number];
const IDS: readonly Id[] = ["b", "a", "c"];
const UNKNOWN_BOGUS_RE = /unknown id "bogus"/u;
const UNKNOWN_MISSING_RE = /unknown id "missing"/u;
const DUPLICATE_X_RE = /duplicate contributor id "x"/u;

describe("createRegistry", () => {
  test("get() returns the definition for a known id", () => {
    const registry = createRegistry("t", IDS, { a: 1, b: 2, c: 3 });
    expect(registry.get("a")).toBe(1);
    expect(registry.get("b")).toBe(2);
  });

  test("get() throws on an id outside the vocabulary", () => {
    const registry = createRegistry("t", IDS, { a: 1, b: 2, c: 3 });
    expect(() => registry.get("bogus" as Id)).toThrow(UNKNOWN_BOGUS_RE);
  });

  test("has() reports membership without throwing", () => {
    const registry = createRegistry("t", IDS, { a: 1, b: 2, c: 3 });
    expect(registry.has("a")).toBe(true);
    expect(registry.has("bogus" as Id)).toBe(false);
  });

  test("list() preserves the ids-tuple order, not object-key order", () => {
    const registry = createRegistry("t", IDS, { a: 1, b: 2, c: 3 });
    expect(registry.list()).toEqual([2, 1, 3]);
  });

  test("name is carried through unchanged", () => {
    expect(createRegistry("sections", IDS, { a: 1, b: 2, c: 3 }).name).toBe("sections");
  });
});

describe("createContributorRegistry", () => {
  test("get()/has() resolve a registered contributor by id", () => {
    const registry = createContributorRegistry("t", [
      { id: "x", n: 1 },
      { id: "y", n: 2 },
    ]);
    expect(registry.get("x")).toEqual({ id: "x", n: 1 });
    expect(registry.has("y")).toBe(true);
    expect(registry.has("z")).toBe(false);
  });

  test("get() throws on an unregistered contributor id", () => {
    const registry = createContributorRegistry("t", [{ id: "x", n: 1 }]);
    expect(() => registry.get("missing")).toThrow(UNKNOWN_MISSING_RE);
  });

  test("duplicate contributor ids throw at construction", () => {
    expect(() =>
      createContributorRegistry("t", [
        { id: "x", n: 1 },
        { id: "x", n: 2 },
      ]),
    ).toThrow(DUPLICATE_X_RE);
  });

  test("list() preserves contribution order", () => {
    const registry = createContributorRegistry("t", [
      { id: "z", n: 1 },
      { id: "a", n: 2 },
    ]);
    expect(registry.list()).toEqual([
      { id: "z", n: 1 },
      { id: "a", n: 2 },
    ]);
  });
});
