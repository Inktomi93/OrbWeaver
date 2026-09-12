// The PERMANENT PIN for the `tsconfig-entry-liveness` PAIR, migrated to the final `defineGate` contract
// (#2021). Every arm the policies can express — a dead file-exact entry, a dead glob entry, the
// `${configDir}` irreducible entry, the config-directory resolution, the directory oracle, the
// one-finding-per-grant-identity rule, and the `-health` sibling's unparseable and classifier-rot arms — is
// proven by the policies' own `mustFlag`/`mustPass` rows, which
// `tests/tooling/verify/gates/grant-liveness-family.test.ts` runs through `verifyPolicyProofs`.
//
// What THIS file keeps is what a resource fixture structurally cannot show:
//   1. an EMPTY ROSTER — no `tsconfig*.json` tracked anywhere — refuses the whole run as a TOOL ERROR.
//      This is the successor to the legacy MISSING-CONFIG arm, and it is deliberately NOT a finding: with
//      no config on the tree there is no subject to anchor one on, and a liveness verdict over an empty
//      roster is vacuous rather than clean. The harness has no "expect a tool error" arm (guide §4.5b).
//   2. an EMPTY TRACKED CORPUS refuses the same way, one layer earlier — a non-ready `tracked-files`
//      resource, which `resolveResourceDeclarations` throws on before `create` runs. That is the successor
//      to the legacy CORPUS-BLIND finding.
//   3. the pair RESOLVES AND RUNS at repository scope over the whole-inventory `tracked-files` population,
//      and its verdict lands through the central grant table with zero alarms (#1947).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/tsconfig-entry-liveness.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/tsconfig-entry-liveness-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const POLICIES = [gate, health] as const;

function drive(root: string): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  return runPolicyPass({
    knownPolicies: [...POLICIES],
    policies: [...POLICIES],
    root,
    project,
    reviewedGrants: reviewedGrantsFor([...POLICIES]),
    failOnWarnings: false,
  });
}

/** A throwaway git repository — the tracked corpus this family's verdict is taken against. */
function plantRepo(root: string, files: Readonly<Record<string, string>>): void {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(root, rel);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  execFileSync("git", ["-c", "core.hooksPath=/dev/null", "init", "-q"], { cwd: root });
  execFileSync("git", ["-c", "core.hooksPath=/dev/null", "add", "-A"], { cwd: root });
}

test("an EMPTY ROSTER refuses the whole run — the successor to the legacy MISSING-CONFIG arm", ({ scratch }) => {
  plantRepo(scratch, { "not-tsconfig.json": "{}\n" });
  const result = drive(scratch);
  expect(result.toolErrors.length).toBeGreaterThan(0);
  expect(result.toolErrors.map(({ message }) => message).join("\n")).toContain("tsconfig roster is EMPTY");
});

test("an EMPTY TRACKED CORPUS refuses one layer earlier, at the population phase", ({ scratch }) => {
  // No `git init` at all: the tracked-files fact cannot resolve, so no policy here ever runs.
  writeFileSync(join(scratch, "tsconfig.json"), '{\n  "include": ["src"]\n}\n');
  const result = drive(scratch);
  expect(result.toolErrors.length).toBeGreaterThan(0);
  expect(result.toolErrors[0]).toMatchObject({ phase: "population" });
});

// The real inventory read plus fourteen config parses measures well under a second, but the arm carries an
// explicit load-scaled budget rather than sitting one contention spike away from vitest's 5s default.
test("the REAL repository root: both policies resolve, run, and land their verdict through the grant table", { timeout: scaledBudget(60_000) }, ({
  repoRoot,
}) => {
  const result = drive(repoRoot);

  expect(result.toolErrors).toEqual([]);
  expect(result.policies.map(({ owner }) => owner.status)).toEqual(["success", "success"]);
  expect(result.policies[0]?.population.effectiveResourcePaths.length).toBeGreaterThan(1000);
  // A reviewed-grant policy demands no ordinary-waiver text carrier, which is what keeps the whole-inventory
  // `tracked-files` population from throwing on a tracked symlink (#1947).
  expect(result.waiverCarrierRefusals).toEqual([]);
  // The two-sided half the retired EXEMPT/RATIFIED tables owned by hand is now central: a grant consumed
  // zero times is STALE and alarms. Zero alarms here IS that arm passing on the real tree, across all nine
  // ported rows.
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});
