// The authored-identity VOCABULARY, pinned to its emitter (#1080).
//
// `TARGET_VARIANT_ATTRS` is the walker's whole answer to "are these two rendered targets the same authored
// decision?" — and it is raw browser JS inside a template literal, so it CANNOT import the vocabulary it
// reads (no `${…}`, by that module's own contract). A hand-written copy of a live list is a second list,
// and this one fails in the SILENT direction: an axis @orb/ui stamps but the walker never reads simply
// folds two authored decisions back into one population row, with a run that still looks clean. That
// collapse is exactly the F8 defect this vocabulary was armed for
// (docs/reviews/stickler/2026-09-02-uiaudit-orbui-mechanism-audit.md).
//
// So both sides are DERIVED and compared: `STAMPED_VARIANT_AXES` (packages/ui/src/lib/variant-attrs.ts —
// the ONE home of what the primitives emit) against the array parsed out of the walker string. The parser
// is floor-guarded and carries a PLANTED CONTROL, because a regex that stops matching returns `[]` and
// every set comparison then passes vacuously.
// The LEAF, not the `@orb/ui/lib` barrel (it value-exports DOM-coupled hooks — type-worlds #1351).
import { STAMPED_VARIANT_AXES } from "../../../../../packages/ui/src/lib/variant-attrs.ts";
import { WALKER_TARGET_IDENTITY } from "../../../../../tooling/src/ui-audit/ops/walker/target-identity.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";

/** Base UI's RUNTIME state attribute — deliberately in the walker's list and deliberately NOT stamped by
 *  the ui primitives (they never author it; Base UI writes it live). Any OTHER extra member is an
 *  unreviewed widening of the identity key and reds below. */
const RUNTIME_STATE_ATTRS = ["data-orientation"] as const;

/** The array literal the walker actually ships, read out of the emitted browser source. */
function walkerVariantAttrs(source: string): readonly string[] {
  const declaration = /TARGET_VARIANT_ATTRS\s*=\s*\[([^\]]*)\]/u.exec(source);
  if (declaration?.[1] === undefined) {
    return [];
  }
  return [...declaration[1].matchAll(/"([^"]+)"/gu)].map(([, attr]) => attr ?? "");
}

test("the walker's identity vocabulary is exactly the stamped axes plus Base UI's runtime state attr", () => {
  const walker = walkerVariantAttrs(WALKER_TARGET_IDENTITY);
  // FLOOR GUARD: an empty parse is "the reader broke", never "the list is empty".
  expect(walker.length).toBeGreaterThan(0);
  const stamped = STAMPED_VARIANT_AXES.map((axis) => `data-${axis}`);
  expect(walker.toSorted()).toStrictEqual([...stamped, ...RUNTIME_STATE_ATTRS].toSorted());
});

test("every axis @orb/ui stamps is READ by the walker", () => {
  // The directional half stated on its own: adding a member to STAMPED_VARIANT_AXES without teaching the
  // walker produces attributes nothing consumes, and the population keeps collapsing.
  const walker = new Set(walkerVariantAttrs(WALKER_TARGET_IDENTITY));
  for (const axis of STAMPED_VARIANT_AXES) {
    expect(walker.has(`data-${axis}`), `${axis} is stamped by @orb/ui but absent from TARGET_VARIANT_ATTRS`).toBe(true);
  }
});

test("PLANTED CONTROL: the comparison fails when the walker drops a stamped axis", () => {
  const neutered = WALKER_TARGET_IDENTITY.replace('"data-size", ', "");
  const walker = walkerVariantAttrs(neutered);
  expect(walker.length).toBeGreaterThan(0);
  expect(walker).not.toContain("data-size");
});

test("PLANTED CONTROL: the parser reports EMPTY when the declaration is renamed, so the floor guard bites", () => {
  expect(walkerVariantAttrs(WALKER_TARGET_IDENTITY.replace("TARGET_VARIANT_ATTRS", "TARGET_VARIANT_ATTRS_RENAMED"))).toStrictEqual([]);
});

test("the identity CLAIM reads the vocabulary through that one array", () => {
  // A member added to the array but never read would be inert: the claim builder is the only consumer, and
  // it must loop the list rather than naming attributes inline.
  expect(WALKER_TARGET_IDENTITY).toContain("for (var va = 0; va < TARGET_VARIANT_ATTRS.length; va += 1)");
});
