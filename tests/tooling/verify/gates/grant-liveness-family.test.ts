// The standing conformance net for the `grant-liveness` FAMILY: every policy whose verdict is "does this
// config selector still name something this repository carries". The family shares two readers — the
// executable-config subject reader (`lib/config-snapshot.ts` `readConfigSnapshot`, reached only through the
// `native-config` ResourceHost fact) and the liveness/exemption reconciler
// (`lib/grant-liveness.ts` `livenessFindings` / `patternLivenessFindings`).
//
// `runner-config-path-liveness` JOINED 2026-09-12 (#1584): the `authored-path` door its 2026-09-11 refusal
// specified shipped inside the frozen 18-kind vocabulary, so the refusal's premise is retired and the module
// converted. It adds a third shared reader to the family — the authored-path IDENTITY door
// (`contract/resource-path.ts`), which answers containment and normalization for a selector read out of
// another resource.
//
// THE LAST TWO LEGACY MEMBERS JOINED 2026-09-12 (#2021), as four policies rather than two: the
// `biome-grant-liveness` and `tsconfig-entry-liveness` pairs, each an ordinary grant-carrying policy plus a
// `hard` `-health` sibling holding its §4.6 blindness tripwires. They add two more shared readers to the
// family — `lib/config-grant-rows.ts` (the per-config row classifier both halves of each pair report
// through) and, behind it, the world program's compiler reader
// (`lib/policy-program-membership.ts` `compilerConfigRoster` / `readCompilerConfigEntries`), which now
// publishes the RAW unfolded `include`/`exclude` entries with line identity. That publication is what
// retired `tsconfig-entry-liveness`'s recorded conversion refusal; the family is now complete and the
// `grant-liveness` roster below is its census.
//
// THE FAMILY IS NO LONGER ONE AUTHORITY, which is why the second arm below now has two rows. The four
// policies that converted first are `hard` carrying gate-local `ExemptionTable`s; the two that converted
// last are `reviewed-grant` carrying central rows, per `exception-authority-census.md:96-100` and §12.5's
// ban on a gate-owned exemption grammar. That is a MIGRATION boundary (#1922), not an inconsistency — and
// the grant-identity arm below is the surface the old comment predicted this file would then owe.
//
// WHY THIS FILE EXISTS (#1932): both converted policies' permanent-pin int tests previously cited
// `tests/tooling/verify/ops/policy-conformance.test.ts` as the harness that runs their `mustFlag`/`mustPass`
// rows. That file imports NO gate module — it proves `verifyPolicyProofs` itself against synthetic policies —
// so no committed test executed these policies' proofs, including depcruise's #973 pattern-liveness rows.
// `verifyPolicyProofs` runs each row through the production dispatcher (`runPolicyPass`), so an empty result
// is the receipt that every arm still fires on its own fixture.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate as biomeGrantLiveness } from "../../../../tooling/src/verify/gates/biome-grant-liveness.ts";
import { gate as biomeGrantLivenessHealth } from "../../../../tooling/src/verify/gates/biome-grant-liveness-health.ts";
import { gate as depcruiseGrantLiveness } from "../../../../tooling/src/verify/gates/depcruise-grant-liveness.ts";
import { gate as eslintGrantLiveness } from "../../../../tooling/src/verify/gates/eslint-grant-liveness.ts";
import { gate as runnerConfigPathLiveness } from "../../../../tooling/src/verify/gates/runner-config-path-liveness.ts";
import { gate as tsconfigEntryLiveness } from "../../../../tooling/src/verify/gates/tsconfig-entry-liveness.ts";
import { gate as tsconfigEntryLivenessHealth } from "../../../../tooling/src/verify/gates/tsconfig-entry-liveness-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { filesystemReach } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const policies = [
  biomeGrantLiveness,
  biomeGrantLivenessHealth,
  depcruiseGrantLiveness,
  eslintGrantLiveness,
  runnerConfigPathLiveness,
  tsconfigEntryLiveness,
  tsconfigEntryLivenessHealth,
] as const;

// Every row in this family is `mode: "resource"`: each one materialises a real temp repository and drives a
// NATIVE loader in a niced child (dependency-cruiser, ESLint's ConfigArray, Vitest's `resolveConfig`). That is
// seconds per row by construction, so the arm carries an explicit load-scaled budget instead of sitting one
// contention spike away from vitest's 5s default.
test("every grant-liveness policy's own proofs hold through the production dispatcher", { timeout: scaledBudget(180_000) }, () => {
  expect(verifyPolicyProofs(policies)).toEqual([]);
});

test("the family is one family, and each member's authority is the one its arms need", () => {
  // A `hard` policy has no waiver or reviewed-grant door; a `reviewed-grant` policy has one and owes the
  // §4.3 identity arm below. This row is the tripwire on BOTH halves: adding a door to a `hard` member, or
  // taking one away from a grant-carrying member, changes what the central engine reconciles for it.
  expect(policies.map((policy) => [policy.id, policy.family, policy.authority])).toEqual([
    ["biome-grant-liveness", "grant-liveness", "reviewed-grant"],
    ["biome-grant-liveness-health", "grant-liveness", "hard"],
    ["depcruise-grant-liveness", "grant-liveness", "hard"],
    ["eslint-grant-liveness", "grant-liveness", "hard"],
    ["runner-config-path-liveness", "grant-liveness", "hard"],
    ["tsconfig-entry-liveness", "grant-liveness", "reviewed-grant"],
    ["tsconfig-entry-liveness-health", "grant-liveness", "hard"],
  ]);
});

/** The parent of `97e68be91`, the conversion that landed both pairs. Both modules' headers cite it. */
const LEGACY_BASE = "c97de9d2f";

// ── §4.6: WHY THIS PAIR'S CONVERSION DIFFERENTIAL IS A REAL-TREE DRIVE AND NOT A FIXTURE REPLAY ───────
// The shared harness (`tests/support/legacy-differential.ts`) replays a frozen descriptor on an IN-MEMORY
// project and REFUSES anything that touches disk (#2119): an `existsSync` arm answers about the running
// checkout rather than about the fixture, so a confident differential over it would be wrong. Both legacy
// blobs at `c97de9d2f` are filesystem readers — that is what the conversion RETIRED. This arm pins the
// refusal, so the §4.6 records in both module headers cite an executed fact rather than a reading, and so
// a later lane cannot quietly relax the scan to "add the missing differential".
test("§4.6 — the shared in-memory replay harness REFUSES both legacy descriptors, which is why their records are real-tree drives", () => {
  const blobs = ["tooling/src/verify/gates/biome-grant-liveness.ts", "tooling/src/verify/gates/tsconfig-entry-liveness.ts"] as const;
  for (const path of blobs) {
    const source = execFileSync("git", ["show", `${LEGACY_BASE}:${path}`], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    expect(source, `${path} at ${LEGACY_BASE} is the LEGACY descriptor, not an already-converted policy`).toContain("GateDescriptor");
    expect(filesystemReach(source), `${path} reaches disk, so the in-memory harness must refuse it`).toContain("existsSync");
  }
  // The reader's own controls, both directions — a `toContain` that never sees an empty answer proves nothing.
  expect(filesystemReach("export const gate = { name: 'x' };\n"), "the clean control").toEqual([]);
  expect(filesystemReach('import { existsSync } from "node:fs";\n'), "the dirty control").toEqual(["node:fs", "existsSync"]);
});

// ── §4.3: the grant-carrying half's exact `(policy, subject, operation)` identity ─────────────────────
// A `mustFlag`/`mustPass` row cannot reach this: `verifyPolicyProofs` drives every row with
// `reviewedGrants: []`, so a policy whose whole exemption mechanism is the central table has no in-module
// home for the arm that proves the table binds. These three drive `runPolicyPass` with a REAL grant list.

const DEAD_SUBJECT = "packages/client/src/gone.ts";
const DEAD_GRANT: ReviewedGateGrant = {
  id: "probe:dead-exact",
  policyId: "biome-grant-liveness",
  subject: DEAD_SUBJECT,
  operation: "biome-exact-grant",
  why: "a proof-local grant, never a repository permission — it exists to prove the identity binds.",
  endsWhen: "this arm stops driving a planted dead grant.",
};

function driveWithGrants(root: string, grants: readonly ReviewedGateGrant[]): ReturnType<typeof runPolicyPass> {
  const config = `{\n  "overrides": [\n    {\n      "includes": ["${DEAD_SUBJECT}"],\n      "linter": { "rules": {} }\n    }\n  ]\n}\n`;
  writeFileSync(join(root, "biome.json"), config);
  execFileSync("git", ["-c", "core.hooksPath=/dev/null", "init", "-q"], { cwd: root });
  execFileSync("git", ["-c", "core.hooksPath=/dev/null", "add", "-A"], { cwd: root });
  const project = new Project({ useInMemoryFileSystem: true });
  return runPolicyPass({
    knownPolicies: [biomeGrantLiveness, biomeGrantLivenessHealth],
    policies: [biomeGrantLiveness, biomeGrantLivenessHealth],
    root,
    project,
    reviewedGrants: grants,
    failOnWarnings: false,
  });
}

test("§4.3 — the intended grant is consumed EXACTLY once, and licenses the finding", ({ scratch }) => {
  const result = driveWithGrants(scratch, [DEAD_GRANT]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.grantedFindings.map(({ grantId }) => grantId)).toEqual(["probe:dead-exact"]);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("§4.3 — a WRONG operation licenses nothing: the finding stays effective and the row goes stale", ({ scratch }) => {
  const result = driveWithGrants(scratch, [{ ...DEAD_GRANT, operation: "biome-glob-grant" }]);
  expect(result.authority.effectiveFindings).toHaveLength(1);
  expect(result.authority.grantedFindings).toEqual([]);
  expect(result.authority.authorityAlarms.length).toBeGreaterThan(0);
});

test("§4.3 — a RENAMED subject stales the row rather than silently forgiving the new one", ({ scratch }) => {
  const result = driveWithGrants(scratch, [{ ...DEAD_GRANT, subject: "packages/client/src/moved.ts" }]);
  expect(result.authority.effectiveFindings).toHaveLength(1);
  expect(result.authority.grantedFindings).toEqual([]);
  expect(result.authority.authorityAlarms.length).toBeGreaterThan(0);
});
