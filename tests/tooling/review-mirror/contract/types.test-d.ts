// The evidence is immutable and E7's classifications are closed: a reviewer consumes a snapshot, and a new
// class cannot appear without updating the census totals and every downstream reader.
import { expectTypeOf, test } from "vitest";
import type { PENDING_GUARD_CLASSIFICATIONS, PendingGuardClassification, ReviewMirrorEvidence } from "../../../../tooling/src/review-mirror/index.ts";

declare const evidence: ReviewMirrorEvidence;

test("pending-guard classification is one closed vocabulary", () => {
  expectTypeOf<PendingGuardClassification>().toEqualTypeOf<(typeof PENDING_GUARD_CLASSIFICATIONS)[number]>();
});

test("review evidence is a readonly snapshot", () => {
  // @ts-expect-error — a source commit in evidence cannot be rewritten after generation.
  evidence.sourceCommit = "new";
  expectTypeOf<ReviewMirrorEvidence["schemaVersion"]>().toEqualTypeOf<1>();
});
