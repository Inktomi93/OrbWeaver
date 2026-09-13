// Type-level pin for the D139 receipt shape. Two properties no runtime test can see:
//   • a receipt row is fully READONLY — nothing can mutate a claim in place and re-serialize it, which is
//     what makes "editing the document invalidates the receipt by hash" a property of the data, not of
//     discipline;
//   • the verified triple (`verifiedSha256`/`verifiedCommit`/`verifiedAt`) is `string | null`, never
//     optional: a PENDING row must carry the fields EXPLICITLY nulled, so "absent" and "not yet reviewed"
//     cannot be confused by a reader (or by `JSON.stringify` dropping them).
import { expectTypeOf, test } from "vitest";
import type { CATALOG_MODES, CatalogMode, ReceiptClaim, ReceiptEntry, ReceiptEvidence } from "../../../../tooling/src/doc-catalog/index.ts";

test("a receipt row and its claims are readonly all the way down", () => {
  // @orb-waive no-test-fabrication(ReceiptEntry): a type-level probe — a `.test-d` file is typechecked, never executed, so the value is never read; the cast exists only so the next line can prove the property. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const entry = {} as ReceiptEntry;
  // @ts-expect-error — a receipt row is evidence, not a mutable record.
  entry.disposition = "current";
  // @orb-waive no-test-fabrication(ReceiptClaim): a type-level probe — a `.test-d` file is typechecked, never executed, so the value is never read; the cast exists only so the next line can prove the property. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const claim = {} as ReceiptClaim;
  // @ts-expect-error — same for the typed claim's evidence list.
  claim.evidence = [];
  expectTypeOf<ReceiptEntry["claims"]>().toEqualTypeOf<readonly ReceiptClaim[] | undefined>();
  expectTypeOf<ReceiptClaim["evidence"]>().toEqualTypeOf<readonly ReceiptEvidence[]>();
});

test("the verified triple is explicitly nullable, never optional", () => {
  expectTypeOf<ReceiptEntry["verifiedSha256"]>().toEqualTypeOf<string | null>();
  expectTypeOf<ReceiptEntry["verifiedCommit"]>().toEqualTypeOf<string | null>();
  expectTypeOf<ReceiptEntry["verifiedAt"]>().toEqualTypeOf<string | null>();
});

test("the catalog verbs are the closed set the cli guards on", () => {
  expectTypeOf<CatalogMode>().toEqualTypeOf<(typeof CATALOG_MODES)[number]>();
});
