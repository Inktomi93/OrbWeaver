// THE ONE REAL-CORPUS LIVENESS RUNNER (#2149, owner ruling docs/work/0043) — the arm that tells "silent
// because the tree is clean" apart from "silent because the policy is dead", for every final policy that
// declares one.
//
// WHY ONE RUNNER. Every final policy owes a real-corpus pin, and the pins used to build their own corpora:
// one ts-morph project per glob-set here, a tsconfig-loaded type graph over four files in
// `ct-config-mirror-parity.test.ts`, a 300-second `@ui`+`@client` build in each of two family tests. At ~350
// policies that is hundreds of project builds, and a `types` corpus over `@client` alone pushed this file
// past the integration ceiling (0043). The ruling mirrors verify's shared design: `check:structure` loads ONE
// corpus and runs every policy through ONE walker, so this runner loads THAT corpus once
// (`tests/support/real-corpus-liveness.ts` — the header says why it is verify's corpus and no other), runs
// every armed policy through one shared BASELINE pass, then proves each arm's overlay against the same
// project.
//
// THE ARMS ARE DATA in `_liveness/<chunk>.ts`, one exported array per chunk, so
// `real-corpus-liveness-manifest` can census them (it reads `policy:` rows in any file under
// `tests/tooling/verify/gates/` that imports both a gate module and the liveness vocabulary). A chunk this
// file does not import runs nowhere, and knip (whose `tests/**` project set admits it and whose entries are
// the test files) reports it as an unused file — the one door from "declared" to "run" is the import list.
//
// THE TIER IS THE MEASURED COST OF THE ONE SHARED RUN (0043). Measured 2026-09-23 at 47 arms over three
// runs on a shared box: the shared baseline (corpus load + every armed policy in one pass + the lazy type
// graph) ≈46-69s; a `syntax` arm ≈2-7s; a `types` arm ≈6-26s, because every overlay invalidates the shared
// program and the policy's checker work re-runs cold; the file ≈240-460s end to end. That is an
// instrument-battery cost, not an inner-loop one, so the file stays in the `repository` project
// (`.suite.repo.int`, file-serial, inside `--full`'s `tests:tooling`) with per-test budgets derived from
// those numbers rather than the project's 30s default. The cost is linear in `types` arms: at the full
// roster it owes a re-measure before the manifest blocks.

import type { RealCorpusLivenessArm, RealCorpusLivenessRunner } from "../../../support/real-corpus-liveness.ts";
import { openRealCorpusLiveness } from "../../../support/real-corpus-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { CLIENT_ARMS } from "./_liveness/client.ts";
import { CLIENT_APP_ARMS } from "./_liveness/client-app.ts";
import { SERVER_ARMS } from "./_liveness/server.ts";
import { TESTS_ARMS } from "./_liveness/tests.ts";

const CHUNKS = { client: CLIENT_ARMS, clientApp: CLIENT_APP_ARMS, server: SERVER_ARMS, tests: TESTS_ARMS } as const;
const ARMS: readonly RealCorpusLivenessArm[] = Object.values(CHUNKS).flat();

// Quiet-box ceilings, each ~2.5x the slowest measured case above; `scaledBudget` stretches them under
// measured load so a contended box never reads as a false RED.
const BASELINE_BASE_MS = 180_000;
const ARM_BASE_MS = 60_000;

let runner: RealCorpusLivenessRunner | undefined;
/** The runner is opened on first use and shared by every test in this file (vitest runs a file's tests in
 *  one worker, in order), so the corpus is built ONCE whichever test a filtered run starts from. */
function liveness(repoRoot: string): RealCorpusLivenessRunner {
  runner ??= openRealCorpusLiveness(repoRoot, ARMS);
  return runner;
}

test("every chunk declares arms, and no policy carries two", () => {
  // An empty chunk is an import that runs nothing; a duplicated id makes "which control fired" ambiguous.
  for (const [chunk, arms] of Object.entries(CHUNKS)) {
    expect(arms.length, `chunk ${chunk} declares no arms`).toBeGreaterThan(0);
  }
  const ids = ARMS.map((arm) => arm.policy.id);
  expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
});

test("every armed policy is refusal-free and silent in its arm's scope on the real tree", { timeout: scaledBudget(BASELINE_BASE_MS) }, ({ repoRoot }) => {
  const ran = liveness(repoRoot).assertBaseline();
  expect(ran.toSorted(), "the shared pass ran every armed policy").toEqual(ARMS.map((arm) => arm.policy.id).toSorted());
});

test.for(ARMS.map((arm) => [arm.policy.id, arm] as const))(
  "%s reports its real-corpus positive control",
  { timeout: scaledBudget(ARM_BASE_MS) },
  ([, arm], { repoRoot }) => {
    expect(liveness(repoRoot).assertArm(arm).join("\n")).toContain(arm.messageIncludes);
  },
);

test("the runner REFUSES an arm whose overlay plants nothing — a dead control cannot read as live", { timeout: scaledBudget(ARM_BASE_MS) }, ({ repoRoot }) => {
  // The planted negative for the runner itself: a real armed policy, an overlay at a path its population
  // admits, and a source that violates nothing. If this passed, every green arm above would be unfalsified.
  const [live] = CLIENT_APP_ARMS;
  if (live === undefined) {
    throw new Error("the client-app chunk is empty, so the runner's control has no policy to drive");
  }
  const dead: RealCorpusLivenessArm = {
    ...live,
    overlays: [{ kind: "add", path: "packages/client/src/features/chat/lib/liveness-clean-control.ts", source: "export const clean = 1;\n" }],
  };
  expect(() => liveness(repoRoot).assertArm(dead)).toThrow("reported NOTHING for a real-corpus positive control");
});
