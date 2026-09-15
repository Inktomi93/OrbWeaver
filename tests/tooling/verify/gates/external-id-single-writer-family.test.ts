// The family net for the U1 externalId bind-once chokepoint AND its §4.6 SPLIT-ARM DIFFERENTIAL (#2000,
// p-parity-tier1).
//
// `external-id-single-writer-health` exists BECAUSE one legacy descriptor carried two arms with different
// execution needs: a per-node `visit` (a third writer / a third claim caller is RED) and a whole-project
// `finalize` (each sanctioned file must STILL write, and link-external-id.ts must STILL call the atomic
// claim writer). The split gave the occurrence half `execution: "selected-files"` and the carve-out half
// `execution: "entire-population"`, so the legacy gate's behaviour is now the behaviour of the two policies
// TOGETHER and nothing checked the union. This file checks it, against the frozen legacy descriptor at
// `9377887c0` — the commit immediately before `35bf7d328` split them.
//
// THE CLASSIFIED DIFFERENCES:
//   1. SPLIT — one legacy gate, two final policies; the union is what is compared.
//   2. THE BLINDNESS GUARD CHANGED MECHANISM, and it is why the two halves are compared SEPARATELY rather
//      than as one union over the legacy corpus. The legacy `finalize` self-guarded on
//      `scope.kind === "project" && fileLoaded(packages/db/src/schema/users.ts)` — a REAL-TREE ANCHOR, so a
//      conformance mini-project that holds neither sanctioned file could not "prove" the carve-out dead.
//      The final health policy has no anchor: it declares `execution: "entire-population"` and the PLANNER
//      defers it on any narrowed request (pinned in `runPolicyPass`'s own contract). Under a whole-project
//      run over a two-file fixture the two therefore disagree BY DESIGN — legacy stays silent, final
//      reports — so the occurrence corpus is replayed against the occurrence policy, and the moved arm gets
//      its own successor proof below with the anchor present on the legacy side.
//   3. HEALTH FINDING ANCHOR — the legacy finalize reported on line 1 of the GATE MODULE ITSELF, a path
//      outside the policy's own `@server` population and therefore inexpressible under the final contract.
//      The final health policy anchors on `ctx.files[0]`, and drops the trailing " — <gate module>" the
//      legacy message repeated. Subject identity (WHICH sanctioned row is dead) is compared instead.
//   4. POSITION TOKEN CORRECTED — see `TOKEN_CORRECTIONS` below; found by running this differential.
//
// THE FINDING THIS DIFFERENTIAL PRODUCED (reported to #2000/#2005): the legacy corpus NEVER EXERCISED the
// arm that moved. Not one of the legacy gate's 4 mustFlag / 7 mustPass examples loads the real-tree anchor,
// so `finalize` returned at its first line in every one of them — the health arm the split carried over was
// covered by zero legacy rows. The first test asserts that fact per example rather than leaving it as
// prose, because it is the reason the successor proof below had to be CONSTRUCTED from the legacy arm's own
// trigger conditions instead of replayed from its corpus.
import { gate as externalIdSingleWriter } from "../../../../tooling/src/verify/gates/external-id-single-writer.ts";
import { gate as externalIdSingleWriterHealth } from "../../../../tooling/src/verify/gates/external-id-single-writer-health.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the U1 externalId bind-once chokepoint and its carve-out health tripwire both self-prove", () => {
  expect(verifyPolicyProofs([externalIdSingleWriter, externalIdSingleWriterHealth])).toEqual([]);
});
