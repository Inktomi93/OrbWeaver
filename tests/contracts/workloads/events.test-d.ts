// Type-level pin for the workload LIFECYCLE EVENT union — specifically the `succeeded` arm's per-kind
// RESULT correlation (#1047). No runtime test can see any of this: the union carries no schema, and the
// whole claim is "a reader that narrowed on `kind` gets that kind's own result type, and nothing else can
// be written into the arm".
//
// The three properties pinned here, and what each one would let through if it were absent:
//   • CORRELATION — `succeeded & { kind: "index" }` is `EmbedPassResult`, not `unknown`. Without it a
//     producer could emit any kind's result under any kind and every consumer would have to re-narrow a
//     blob it already knew the shape of.
//   • TOTALITY — the arm's `kind` axis is exactly `WorkloadKind`, derived from the mapped type over
//     `WorkloadResultByKind` (§5.5: one importable union + a mapped type, never a restated kind list), so
//     a new kind lands as a tsc error at the result map rather than as a silently `unknown` arm.
//   • REQUIREDNESS — `result` is a required property. It was optional while its type was `unknown`
//     (an `unknown` property is inhabited by `undefined`, which made the wire type unsatisfiable-as-
//     required through tRPC's output inference); with the concrete per-kind types that reason is gone,
//     and every producer already emitted it.

import type { EmbedPassResult } from "@orb/contracts/embeddings";
import type { ReconcileStatsWorkloadResult } from "@orb/contracts/stats";
import type { WorkloadEvent, WorkloadKind } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

type SucceededEvent = Extract<WorkloadEvent, { readonly type: "succeeded" }>;
type SucceededOf<K extends WorkloadKind> = Extract<SucceededEvent, { readonly kind: K }>;

const RUN = "workload_01j000000000000000000000" as WorkloadId;

test("the succeeded arm correlates kind to that kind's own result type", () => {
  expectTypeOf<SucceededOf<"index">["result"]>().toEqualTypeOf<EmbedPassResult>();
  expectTypeOf<SucceededOf<"reconcile-stats">["result"]>().toEqualTypeOf<ReconcileStatsWorkloadResult>();
});

test("the succeeded arm's kind axis is exactly WorkloadKind (derived, never restated)", () => {
  expectTypeOf<SucceededEvent["kind"]>().toEqualTypeOf<WorkloadKind>();
});

test("a wrong-kind result is a compile error", () => {
  expectTypeOf<SucceededOf<"reconcile-stats">["result"]>().not.toEqualTypeOf<EmbedPassResult>();
  const right: WorkloadEvent = { type: "succeeded", workloadId: RUN, kind: "index", at: 1, result: { embedded: 2, skipped: 0 } };
  void right;
  const wrong: WorkloadEvent = {
    type: "succeeded",
    workloadId: RUN,
    kind: "index",
    at: 1,
    // @ts-expect-error — `reconcile-stats`'s result under `index`: the correlation is what refuses it.
    result: { owners: 1, characters: 4 },
  };
  void wrong;
});

test("result is REQUIRED on the succeeded arm", () => {
  expectTypeOf<SucceededEvent>().toHaveProperty("result");
  // @ts-expect-error — a succeeded event with no result is not a WorkloadEvent.
  const bare: WorkloadEvent = { type: "succeeded", workloadId: RUN, kind: "index", at: 1 };
  void bare;
});

test("narrowing on type then kind reaches the result's own fields with no cast", () => {
  const read = (event: WorkloadEvent): number => {
    if (event.type === "succeeded" && event.kind === "index") {
      return event.result.embedded;
    }
    return 0;
  };
  expectTypeOf(read).returns.toEqualTypeOf<number>();
});
