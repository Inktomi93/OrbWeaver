// The walk's coverage verdict: what fails a published inventory and what the report lists as skipped. Planted rows
// reach the audit untyped, as a retained attachment does, because the walker's types refuse them at compile time.
import { describe, expect, test } from "vitest";
import { auditSurfaceInventory, SURFACE_SKIP_REASONS } from "./surface-coverage.ts";

const LEAF = { id: "presets/menu-0/leaf-0", kind: "menu-leaf" } as const;

function inventory(observations: readonly object[], expected: readonly object[] = [LEAF]): object {
  return { name: "planted", expected, observations };
}

describe("an unlisted skip fails the walk", () => {
  test("a skip reason outside the closed list names the leaf", () => {
    const audit = auditSurfaceInventory(inventory([{ ...LEAF, disposition: "skipped", skip: "felt-optional", reason: "Read, not run" }]));
    expect(audit.unlistedSkips).toEqual([{ ...LEAF, issue: expect.stringContaining("skip") }]);
    expect(audit.malformed).toEqual([]);
  });

  test("a skip with free text and no listed reason names the leaf", () => {
    const audit = auditSurfaceInventory(inventory([{ ...LEAF, disposition: "skipped", reason: "Read, not run" }]));
    expect(audit.unlistedSkips).toEqual([{ ...LEAF, issue: expect.stringContaining("skip") }]);
  });

  test("a listed skip without its detail is still unlisted", () => {
    const audit = auditSurfaceInventory(inventory([{ ...LEAF, disposition: "skipped", skip: "not-activated" }]));
    expect(audit.unlistedSkips).toEqual([{ ...LEAF, issue: expect.stringContaining("reason") }]);
  });

  test("a malformed witness row is malformed, not an unlisted skip", () => {
    const audit = auditSurfaceInventory(inventory([{ ...LEAF, disposition: "visted" }]));
    expect(audit.unlistedSkips).toEqual([]);
    expect(audit.malformed).toHaveLength(1);
  });
});

describe("listed skips are reported, never failed", () => {
  test.each(SURFACE_SKIP_REASONS)("%s passes and is listed", (reason) => {
    const audit = auditSurfaceInventory(inventory([{ ...LEAF, disposition: "skipped", skip: reason, reason: "Read, not run" }]));
    expect(audit).toMatchObject({ missing: [], unlistedSkips: [], malformed: [] });
    expect(audit.skipped).toEqual([{ ...LEAF, disposition: "skipped", skip: reason, reason: "Read, not run" }]);
  });

  test("a journey's later witness settles a leaf the walk skipped", () => {
    const audit = auditSurfaceInventory(
      inventory([
        { ...LEAF, disposition: "skipped", skip: "not-activated", reason: "Read, not run" },
        { ...LEAF, disposition: "visited", reason: "Disposable preset renamed and read back" },
      ]),
    );
    expect(audit.skipped).toEqual([]);
    expect(audit.missing).toEqual([]);
  });

  test("a later unvisited row reopens an expected subject", () => {
    const audit = auditSurfaceInventory(
      inventory([
        { ...LEAF, disposition: "skipped", skip: "not-activated", reason: "Read, not run" },
        { ...LEAF, disposition: "unvisited", reason: "No execution witness" },
      ]),
    );
    expect(audit.missing).toEqual([LEAF]);
    expect(audit.skipped).toEqual([]);
  });

  test("an expected subject with no observation is missing", () => {
    expect(auditSurfaceInventory(inventory([])).missing).toEqual([LEAF]);
  });
});
