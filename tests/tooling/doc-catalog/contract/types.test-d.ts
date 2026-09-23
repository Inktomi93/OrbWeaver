// Type-level pin for the inventory row shape: a row is READONLY (a classification, never a record to
// mutate and re-serialize) and carries exactly a path and an authority — nothing a prose edit could
// invalidate. And the catalog verbs are the closed set the cli guards on.
import { expectTypeOf, test } from "vitest";
import type { CATALOG_MODES, CatalogMode, ReceiptEntry } from "../../../../tooling/src/doc-catalog/index.ts";

test("a row is readonly and carries only a path and an authority", () => {
  // @orb-waive no-test-fabrication(ReceiptEntry): a type-level probe — a `.test-d` file is typechecked, never executed, so the value is never read; the cast exists only so the next line can prove the property. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const entry = {} as ReceiptEntry;
  // @ts-expect-error — a row is a classification, not a mutable record.
  entry.authority = "normative";
  expectTypeOf<keyof ReceiptEntry>().toEqualTypeOf<"path" | "authority">();
});

test("the catalog verbs are the closed set the cli guards on", () => {
  expectTypeOf<CatalogMode>().toEqualTypeOf<(typeof CATALOG_MODES)[number]>();
});
