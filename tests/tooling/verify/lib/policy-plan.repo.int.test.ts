// Live compiler-roster controls require the repository resource; scratch planner cases stay unit-owned.
import { execFileSync } from "node:child_process";
import { planPolicyArgv, policySourceCandidates } from "@orb/tooling/verify";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { policy } from "./_policy-plan-fixture.ts";

const LS_FILES_MAX_BUFFER = 268_435_456;

/** Below this the census stopped reading (a wrong cwd, a broken `git ls-files`) rather than measuring a
 *  small repo — and a derivation that stopped reading returns the same empty list as a tree that genuinely
 *  tracks no module scripts, which is exactly how the reality arm below could pass while proving nothing. */
const MIN_TRACKED_SOURCES = 1000;

/** A tracked path the census MUST contain, so a silent mis-read is caught by identity and not only by
 *  count. It is this suite's own subject, which cannot disappear without this file moving with it. */
const ANCHOR_SOURCE = "tooling/src/verify/lib/policy-plan.ts";

/** Tracked repo-relative paths matching `patterns`, sorted. Tracked-ness is the question the planner's
 *  population asks, so an untracked stray must not be able to masquerade as a compiler member here. */
function trackedPaths(root: string, patterns: readonly string[]): readonly string[] {
  return execFileSync("git", ["ls-files", "--", ...patterns], { cwd: root, encoding: "utf8", maxBuffer: LS_FILES_MAX_BUFFER })
    .split("\n")
    .filter((line) => line.trim() !== "")
    .toSorted();
}

test.describe("final policy planner", () => {
  test("the argv coordinator resolves a real six-kind scope through the programmatic front door", ({ repoRoot }) => {
    const gate = policy("known");
    const result = planPolicyArgv(repoRoot, ["--file", "tooling/src/verify/lib/policy-plan.ts", "--check", gate.id], {
      gates: [gate],
      families: [gate.family],
    });
    expect(result).toMatchObject({
      ok: true,
      plan: {
        mode: "run",
        policyIds: [gate.id],
        requestedPaths: [{ path: "tooling/src/verify/lib/policy-plan.ts", status: "present", previousPath: null }],
        policies: [{ population: { effectiveSourcePaths: ["tooling/src/verify/lib/policy-plan.ts"] } }],
      },
    });
  });

  // Synthetic unit scopes prove exclusion; this census engages for every actual tracked module script.
  test("no tracked compiler-member module script enters policy source population", ({ repoRoot }) => {
    const sources = trackedPaths(repoRoot, ["*.ts", "*.tsx"]);
    // POSITIVE CONTROL, same invocation, same machinery as the module-script census below: without it a
    // broken `git ls-files` yields an empty module-script list that reads exactly like a clean pass.
    expect(sources).toContain(ANCHOR_SOURCE);
    expect(sources.length).toBeGreaterThan(MIN_TRACKED_SOURCES);

    const moduleScripts = trackedPaths(repoRoot, ["*.mts", "*.cts"]);
    // Runs empty census or not: every tracked module script is dropped while a real tracked source
    // survives, so the extension fence is asserted against the REAL tree on every run.
    expect(policySourceCandidates([...moduleScripts, ANCHOR_SOURCE])).toEqual([ANCHOR_SOURCE]);

    for (const modulePath of moduleScripts) {
      const gate = policy("real-module-script-source-fence", { population: "@tests" });
      const result = planPolicyArgv(repoRoot, ["--file", modulePath, "--check", gate.id], { gates: [gate], families: [gate.family] });
      expect(result).toMatchObject({
        ok: true,
        plan: {
          requestedPaths: [{ path: modulePath, status: "present", previousPath: null }],
          policies: [{ mode: "skipped", population: { effectiveSourcePaths: [] } }],
        },
      });
      if (!result.ok || result.plan.mode !== "run") {
        throw new Error(`module-script plan did not resolve: ${modulePath}`);
      }
      expect(result.plan.policies[0]?.population.declaredSourcePaths).not.toContain(modulePath);
    }
  });
});
