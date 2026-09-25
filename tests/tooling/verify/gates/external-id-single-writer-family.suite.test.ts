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
import { Project } from "ts-morph";
import { gate as externalIdSingleWriter } from "../../../../tooling/src/verify/gates/external-id-single-writer.ts";
import { gate as externalIdSingleWriterHealth } from "../../../../tooling/src/verify/gates/external-id-single-writer-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/external-id-single-writer-family";
const FAMILY = [externalIdSingleWriter, externalIdSingleWriterHealth];
const SESSIONS = "packages/server/src/domain/sessions";
const CLAIM_IMPORT = 'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n';
const PENDING_CALLER =
  'import { insertPendingSignupUserStatement } from "../persistence/users.ts";\nexport const account = (db: D, row: R, admission: S): B => insertPendingSignupUserStatement(db, row, admission);\n';
const BASE_TREE: Readonly<Record<string, string>> = {
  [`${SESSIONS}/persistence/users.ts`]:
    'import { users } from "@orb/db";\nexport const claimExternalIdIfUnbound = (db: DB, id: string, sub: string) => db.update(users).set({ externalId: sub });\n',
  [`${SESSIONS}/verbs/provision-identity.ts`]: `${CLAIM_IMPORT}export function patch(changes: { externalId?: E }, sub: E): void {\n  changes.externalId = sub;\n}\nexport const bindOwnerSubject = (db: D, id: U, sub: E): B => claimExternalIdIfUnbound(db, id, sub, 0);\n`,
  [`${SESSIONS}/verbs/link-external-id.ts`]: `${CLAIM_IMPORT}export const linkExternalId = (db: D, id: U, sub: E): B => claimExternalIdIfUnbound(db, id, sub, 0);\n`,
};

function findingsOf(files: Readonly<Record<string, string>>): readonly { readonly policyId: string; readonly file: string; readonly message: string }[] {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries({ ...BASE_TREE, ...files })) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  const result = runPolicyPass({ knownPolicies: FAMILY, policies: FAMILY, root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  return result.authority.effectiveFindings.map((finding) => ({
    policyId: finding.policyId,
    file: finding.file.replace(`${ROOT}/`, ""),
    message: finding.message ?? "",
  }));
}

test("the U1 externalId bind-once chokepoint and its carve-out health tripwire both self-prove", () => {
  expect(verifyPolicyProofs([externalIdSingleWriter, externalIdSingleWriterHealth])).toEqual([]);
});

// The registry has two readers, and a moved subject bind must trip both: the detector at the new, unregistered
// caller and the health half at the registry row the move left dead. One without the other lets the registry
// drift from the tree in the direction that half cannot see.
test("a subject writer call that moves off its registered caller is red in both halves of the family", () => {
  expect(findingsOf({ [`${SESSIONS}/verbs/pending-signup.ts`]: PENDING_CALLER })).toEqual([]);

  const moved = findingsOf({
    [`${SESSIONS}/verbs/pending-signup.ts`]: "export const account = (): null => null;\n",
    [`${SESSIONS}/verbs/pending-join-account.ts`]: PENDING_CALLER,
  });
  expect(moved.map(({ policyId, file }) => ({ policyId, file })).toSorted((a, b) => a.policyId.localeCompare(b.policyId))).toEqual([
    { policyId: "external-id-single-writer", file: `${SESSIONS}/verbs/pending-join-account.ts` },
    { policyId: "external-id-single-writer-health", file: expect.any(String) },
  ]);
  expect(moved.find((finding) => finding.policyId === "external-id-single-writer-health")?.message).toContain(
    `${SESSIONS}/verbs/pending-signup.ts no longer calls insertPendingSignupUserStatement`,
  );
});
