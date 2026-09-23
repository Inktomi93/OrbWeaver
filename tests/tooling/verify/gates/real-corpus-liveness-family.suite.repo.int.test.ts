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
// every armed policy through one shared BASELINE pass, then proves the overlays in BATCHED passes over the
// same project: every add-only arm in one pass, each rewriting arm alone (or with arms planting the
// identical overlay set), and any arm whose policy reported on a batch-mate's file proved again alone. Each
// arm still has its own test, reading its batch's verdict, so a failure names its arm.
//
// THE ARMS ARE DATA in `_liveness/<chunk>.ts`, one exported array per chunk, and that directory is the only
// place `real-corpus-liveness-manifest` counts a pin (it reads `policy:` rows in files there that import both
// a gate module and the liveness vocabulary). A chunk this file does not import runs nowhere, and knip
// (whose `tests/**` project set admits it and whose entries are the test files) reports it as an unused
// file — the one door from "declared" to "run" is the import list.
//
// THE TIER IS THE MEASURED COST OF THE ONE SHARED RUN (0043). Measured 2026-09-23 at 47 arms, back to back
// on the same box (loadavg 5-8): one pass PER ARM took 142s of test time, because every overlay invalidates
// the shared type program and each `types` arm re-ran its checker work cold (6-26s apiece); the BATCHED plan
// (one 37-arm pass plus ten solo rewriting arms) takes 54s: baseline 22s, every overlaid pass together 25s,
// the two controls 6s. At 82 arms (the `@client` + `@ui` chunk added heavier policies: its members cost
// ~45s of the structure run's own policy time) the file measured 392-414s of test time on a box at loadavg
// 21-31: baseline 104-209s, every overlaid pass together 186-238s, controls 50s. No quiet-box figure exists
// for 82 arms yet; the budgets below are quiet-box bases that `scaledBudget` stretches under load. At 109
// arms the baseline was scoped to the arms whose silence is a measurement (an `add` arm is silent by
// construction): measured back to back at loadavg 27-36, the scoped pass over 24 policies took 153s and the
// old whole-roster pass over 109 took 290s. It stays in the `repository` project (`.suite.repo.int`,
// inside `--full`'s `tests:tooling`), with per-test budgets rather than the project's 30s default.
// SPLITTING THIS FILE PER CHUNK BUYS NOTHING HERE: that project runs its files one at a time
// (`fileParallelism: false`, vitest.config.ts; Core-Tooling-Law.md serialises repository-resource tests), so N
// files would each pay a corpus load and a baseline, in series. Solo passes are the growth term: each
// rewriting arm that plants a distinct overlay costs one program rebuild.

import { gate as queryBoundaryReservation } from "../../../../tooling/src/verify/gates/query-boundary-reservation.ts";
import { gate as queryBoundaryReservationHealth } from "../../../../tooling/src/verify/gates/query-boundary-reservation-health.ts";
import type { RealCorpusLivenessArm, RealCorpusLivenessRunner } from "../../../support/real-corpus-liveness.ts";
import { assertArmVerdict, openRealCorpusLiveness, planLivenessBatches } from "../../../support/real-corpus-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { CLIENT_ARMS } from "./_liveness/client.ts";
import { CLIENT_APP_ARMS } from "./_liveness/client-app.ts";
import { FRONTEND_ARMS } from "./_liveness/frontend.ts";
import { SERVER_ARMS } from "./_liveness/server.ts";
import { TESTS_ARMS } from "./_liveness/tests.ts";
import { TOOLING_ARMS } from "./_liveness/tooling.ts";
import { TOOLING_AND_AUTHORED_ARMS } from "./_liveness/tooling-and-authored.ts";

const CHUNKS = {
  client: CLIENT_ARMS,
  clientApp: CLIENT_APP_ARMS,
  frontend: FRONTEND_ARMS,
  server: SERVER_ARMS,
  tests: TESTS_ARMS,
  tooling: TOOLING_ARMS,
  toolingAndAuthored: TOOLING_AND_AUTHORED_ARMS,
} as const;
const ARMS: readonly RealCorpusLivenessArm[] = Object.values(CHUNKS).flat();

// Quiet-box ceilings, each ~2.5x the slowest measured case above; `scaledBudget` stretches them under
// measured load so a contended box never reads as a false RED. The per-arm tests carry the BATCH budget:
// they only read a kept verdict, but a filtered run that starts at one of them proves every batch first.
const BASELINE_BASE_MS = 180_000;
const BATCHES_BASE_MS = 300_000;
const CONTROL_BASE_MS = 60_000;

let runner: RealCorpusLivenessRunner | undefined;
/** The runner is opened on first use and shared by every test in this file (vitest runs a file's tests in
 *  one worker, in order), so the corpus is built ONCE whichever test a filtered run starts from. */
function liveness(repoRoot: string): RealCorpusLivenessRunner {
  runner ??= openRealCorpusLiveness(repoRoot, ARMS);
  return runner;
}

/** The chunk's arm for `policyId`, for the controls below. */
function armFor(policyId: string): RealCorpusLivenessArm {
  const arm = CLIENT_APP_ARMS.find((candidate) => candidate.policy.id === policyId);
  if (arm === undefined) {
    throw new Error(`the client-app chunk has no arm for ${policyId}, so the control has nothing to drive`);
  }
  return arm;
}

test("every chunk declares arms, and no policy carries two", () => {
  // An empty chunk is an import that runs nothing; a duplicated id makes "which control fired" ambiguous.
  for (const [chunk, arms] of Object.entries(CHUNKS)) {
    expect(arms.length, `chunk ${chunk} declares no arms`).toBeGreaterThan(0);
  }
  const ids = ARMS.map((arm) => arm.policy.id);
  expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
});

test("the batch plan puts every arm in exactly one pass, and a rewriting arm shares only an identical overlay set", () => {
  const plan = planLivenessBatches(ARMS);
  expect(
    plan
      .flat()
      .map((arm) => arm.policy.id)
      .toSorted(),
  ).toEqual(ARMS.map((arm) => arm.policy.id).toSorted());
  const spelled = (arm: RealCorpusLivenessArm): string => JSON.stringify(arm.overlays.map((overlay) => JSON.stringify(overlay)).toSorted());
  const mixedRewriters = plan
    .filter((batch) => batch.some((arm) => arm.overlays.some((overlay) => overlay.kind !== "add")))
    .filter((batch) => new Set(batch.map(spelled)).size > 1)
    .map((batch) => batch.map((arm) => arm.policy.id));
  expect(mixedRewriters, "a rewriting arm shares its pass with an arm that plants something else").toEqual([]);
});

test("every measured arm's policy is refusal-free and silent in its scope on the real tree", { timeout: scaledBudget(BASELINE_BASE_MS) }, ({ repoRoot }) => {
  const opened = liveness(repoRoot);
  const ran = opened.assertBaseline();
  expect(ran.toSorted(), "the shared pass ran every measured arm's policy").toEqual(
    opened
      .baselineArms()
      .map((arm) => arm.policy.id)
      .toSorted(),
  );
});

test("the overlaid batches produce a verdict for every arm", { timeout: scaledBudget(BATCHES_BASE_MS) }, ({ repoRoot }) => {
  const verdicts = liveness(repoRoot).proveAll();
  expect([...verdicts.keys()].toSorted()).toEqual(ARMS.map((arm) => arm.policy.id).toSorted());
});

test.for(ARMS.map((arm) => [arm.policy.id, arm] as const))(
  "%s reports its real-corpus positive control",
  { timeout: scaledBudget(BATCHES_BASE_MS) },
  ([, arm], { repoRoot }) => {
    expect(assertArmVerdict(arm, liveness(repoRoot).verdict(arm)).join("\n")).toContain(arm.messageIncludes);
  },
);

test("a DEAD arm batched beside a live one is still named dead", { timeout: scaledBudget(CONTROL_BASE_MS) }, ({ repoRoot }) => {
  // The planted negative for batching: two real armed policies in ONE overlaid pass, one of them handed a
  // source that violates nothing. Sharing the pass must not lend the dead arm the live one's finding.
  const live = armFor("chrome-registry-completeness");
  const deadOf = armFor("testid-typed-only");
  const dead: RealCorpusLivenessArm = {
    ...deadOf,
    overlays: [{ kind: "add", path: "packages/client/src/components/liveness-clean-control.tsx", source: "export const clean = 1;\n" }],
  };
  const verdicts = liveness(repoRoot).proveBatch([live, dead]);
  const liveVerdict = verdicts.get(live.policy.id);
  const deadVerdict = verdicts.get(dead.policy.id);
  if (liveVerdict === undefined || deadVerdict === undefined) {
    throw new Error("the control batch produced no verdict for one of its two arms");
  }
  expect(deadVerdict.batch, "the two arms really shared one pass").toEqual([live.policy.id, dead.policy.id]);
  expect(assertArmVerdict(live, liveVerdict).join("\n")).toContain(live.messageIncludes);
  expect(() => assertArmVerdict(dead, deadVerdict)).toThrow("reported NOTHING for a real-corpus positive control");
});

test("an arm that speaks only BECAUSE of its batch-mate is caught and proved alone", { timeout: scaledBudget(CONTROL_BASE_MS) }, ({ repoRoot }) => {
  // The planted negative for the entanglement detector. `query-boundary-reservation-health` reports a
  // `reserveKey` minted at TWO sites. Hand it ONE site, and give the other to a batch-mate of a different
  // policy: in the shared pass the pair exists and the health policy reports at BOTH paths, so a detector
  // that trusted the batch would credit the health arm with a finding its own overlay cannot make.
  const health = armFor(queryBoundaryReservationHealth.id);
  const [ownSite, mateSite] = health.overlays;
  if (mateSite === undefined) {
    throw new Error("the reservation-health arm no longer carries its two duplicate sites");
  }
  const halfHealth: RealCorpusLivenessArm = { ...health, overlays: [ownSite] };
  const mate: RealCorpusLivenessArm = { ...armFor(queryBoundaryReservation.id), overlays: [mateSite] };
  const verdict = liveness(repoRoot).proveBatch([halfHealth, mate]).get(health.policy.id);
  if (verdict === undefined) {
    throw new Error("the control batch produced no verdict for the health arm");
  }
  expect(verdict.entangledWith, "the detector saw the health policy report on its batch-mate's file").toEqual([mate.policy.id]);
  expect(verdict.batch, "the verdict is the SOLO re-proof, not the shared pass").toEqual([health.policy.id]);
  expect(() => assertArmVerdict(halfHealth, verdict)).toThrow("reported NOTHING for a real-corpus positive control");
});

test("a RESOURCE overlay that plants nothing is refused — the reader's overlay seam cannot make a policy speak", {
  timeout: scaledBudget(CONTROL_BASE_MS),
}, ({ repoRoot }) => {
  // The planted negative for `kind: "resource"`: the ownership arm's real sheet, handed a tail that is only a
  // comment. If the overlay alone made the policy report, every green resource arm would be unfalsified.
  const ownership = FRONTEND_ARMS.find((arm) => arm.grantConsumption !== true && arm.overlays.some((overlay) => overlay.kind === "resource"));
  const [planted] = ownership?.overlays ?? [];
  if (ownership === undefined || planted === undefined) {
    throw new Error("the frontend chunk carries no resource arm, so the control has nothing to drive");
  }
  const dead: RealCorpusLivenessArm = { ...ownership, overlays: [{ kind: "resource", path: planted.path, append: "\n/* liveness clean control */\n" }] };
  const verdict = liveness(repoRoot).proveBatch([dead]).get(dead.policy.id);
  if (verdict === undefined) {
    throw new Error("the control batch produced no verdict for its arm");
  }
  expect(() => assertArmVerdict(dead, verdict)).toThrow("reported NOTHING for a real-corpus positive control");
});

test("a GRANT-CONSUMPTION arm whose overlay leaves the licensed subject in place is refused", { timeout: scaledBudget(CONTROL_BASE_MS) }, ({ repoRoot }) => {
  // The planted negative for `grantConsumption`: the same policy, its real sheet plus a comment. The recipes
  // are still painted, so the grants stay consumed and the arm must fail — otherwise "went stale" would be
  // something the runner produces rather than something the policy's reading of the subject produces.
  const consuming = FRONTEND_ARMS.find((arm) => arm.grantConsumption === true);
  const [planted] = consuming?.overlays ?? [];
  if (consuming === undefined || planted === undefined) {
    throw new Error("the frontend chunk carries no grant-consumption arm, so the control has nothing to drive");
  }
  const dead: RealCorpusLivenessArm = { ...consuming, overlays: [{ kind: "resource", path: planted.path, append: "\n/* liveness clean control */\n" }] };
  const verdict = liveness(repoRoot).proveBatch([dead]).get(dead.policy.id);
  if (verdict === undefined) {
    throw new Error("the control batch produced no verdict for its arm");
  }
  expect(() => assertArmVerdict(dead, verdict)).toThrow("its grants stayed consumed");
});
