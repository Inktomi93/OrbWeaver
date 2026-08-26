// The evidence is immutable and E7's classifications are closed: a reviewer consumes a snapshot, and a new
// class cannot appear without updating the census totals and every downstream reader.
import { expectTypeOf, test } from "vitest";
import type { PendingGuardClassification, ReviewMirrorEvidence } from "../../../../tooling/src/review-mirror/index.ts";

test("pending-guard classification is one closed vocabulary", () => {
  expectTypeOf<PendingGuardClassification>().toEqualTypeOf<"direct-pending" | "derived-pending" | "epoch" | "missing" | "other-guard">();
});

test("review evidence is a readonly snapshot", () => {
  // FABRICATION-OK: type-only probe; this file is typechecked and the fabricated value is never executed.
  const evidence = {} as ReviewMirrorEvidence;
  // @ts-expect-error — a source commit in evidence cannot be rewritten after generation.
  evidence.sourceCommit = "new";
  expectTypeOf<ReviewMirrorEvidence["schemaVersion"]>().toEqualTypeOf<1>();
});
