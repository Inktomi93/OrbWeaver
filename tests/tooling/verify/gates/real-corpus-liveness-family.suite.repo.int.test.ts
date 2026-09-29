// One serial real-corpus runner retains every selected policy and its complete intervention.
// Only identical ordered overlays share a pass; report paths cannot prove input independence.
// Affected runs keep the controls associated with their selected policies.

import { processEnvValue } from "../../../../tooling/src/_shared/process-env.ts";
import { INSTRUMENT_AFFECTED_POLICIES_ENV } from "../../../../tooling/src/verify/contract/instrument-affected.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as queryBoundaryReservation } from "../../../../tooling/src/verify/gates/query-boundary-reservation.ts";
import { gate as queryBoundaryReservationHealth } from "../../../../tooling/src/verify/gates/query-boundary-reservation-health.ts";
import {
  decodeInstrumentAffectedPolicyIds,
  includeInstrumentAffectedControlPolicies,
  instrumentAffectedIncludes,
  selectedInstrumentAffectedPolicyIds,
  selectInstrumentAffectedArms,
} from "../../../../tooling/src/verify/lib/instrument-affected-liveness.ts";
import { QUERY_BOUNDARY_HOME } from "../../../../tooling/src/verify/lib/query-boundary-vocabulary.ts";
import type { LivenessBatchProgress, RealCorpusArmVerdict, RealCorpusLivenessArm, RealCorpusLivenessRunner } from "../../../support/real-corpus-liveness.ts";
import { assertArmVerdict, openRealCorpusLiveness, planLivenessBatches } from "../../../support/real-corpus-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { AUTHORED_ARMS } from "./_liveness/authored.ts";
import { CLIENT_ARMS } from "./_liveness/client.ts";
import { CLIENT_APP_ARMS } from "./_liveness/client-app.ts";
import { CLIENT_UI_ARMS } from "./_liveness/client-ui.ts";
import { FRONTEND_ARMS } from "./_liveness/frontend.ts";
import { MULTI_ROOT_A_ARMS } from "./_liveness/multi-root-a.ts";
import { MULTI_ROOT_B_ARMS } from "./_liveness/multi-root-b.ts";
import { PRODUCT_DB_SERVER_ARMS } from "./_liveness/product-db-server.ts";
import { RESOURCE_ARMS } from "./_liveness/resources.ts";
import { SERVER_ARMS } from "./_liveness/server.ts";
import { SERVER_APP_ARMS } from "./_liveness/server-app.ts";
import { TESTS_ARMS } from "./_liveness/tests.ts";
import { TOOLING_ARMS } from "./_liveness/tooling.ts";
import { TOOLING_AND_AUTHORED_ARMS } from "./_liveness/tooling-and-authored.ts";
import { TOOLING_TESTS_ARMS } from "./_liveness/tooling-tests.ts";

const CHUNKS = {
  authored: AUTHORED_ARMS,
  client: CLIENT_ARMS,
  clientApp: CLIENT_APP_ARMS,
  clientUi: CLIENT_UI_ARMS,
  frontend: FRONTEND_ARMS,
  multiRootA: MULTI_ROOT_A_ARMS,
  multiRootB: MULTI_ROOT_B_ARMS,
  productDbServer: PRODUCT_DB_SERVER_ARMS,
  server: SERVER_ARMS,
  resources: RESOURCE_ARMS,
  serverApp: SERVER_APP_ARMS,
  tests: TESTS_ARMS,
  tooling: TOOLING_ARMS,
  toolingAndAuthored: TOOLING_AND_AUTHORED_ARMS,
  toolingTests: TOOLING_TESTS_ARMS,
} as const;
const ALL_ARMS: readonly RealCorpusLivenessArm[] = Object.values(CHUNKS).flat();
const AFFECTED_POLICY_IDS = decodeInstrumentAffectedPolicyIds(processEnvValue(INSTRUMENT_AFFECTED_POLICIES_ENV));
const CLOSEOUT_POLICY_IDS = ["css-var-defined-health", "open-json-column-key-parity-health", "no-manual-memo-compiler-health"] as const;
const DEAD_BATCH_CONTROL_IDS = ["chrome-registry-completeness", "testid-typed-only"] as const;
const DEPENDENCY_CONTROL_IDS = [queryBoundaryReservationHealth.id, queryBoundaryReservation.id] as const;
const RESOURCE_CONTROL_IDS = FRONTEND_ARMS.filter((arm) => arm.grantConsumption !== true && arm.overlays.some((overlay) => overlay.kind === "resource"))
  .slice(0, 1)
  .map((arm) => arm.policy.id);
const GRANT_CONSUMPTION_CONTROL_IDS = FRONTEND_ARMS.filter((arm) => arm.grantConsumption === true)
  .slice(0, 1)
  .map((arm) => arm.policy.id);
const REPORT_ANCHOR_CONTROL_IDS = ALL_ARMS.filter((arm) => (arm.reportsAt?.length ?? 0) > 0).map((arm) => arm.policy.id);
const RUNNER_POLICY_IDS = includeInstrumentAffectedControlPolicies(AFFECTED_POLICY_IDS, [DEAD_BATCH_CONTROL_IDS, DEPENDENCY_CONTROL_IDS]);
const ARMS = selectInstrumentAffectedArms(ALL_ARMS, RUNNER_POLICY_IDS);

// A filtered per-policy assertion can trigger every planned pass before reading its cached verdict.
const BASELINE_BASE_MS = 300_000;
const BATCHES_BASE_MS = 1_500_000;
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

function rosterArm(policyId: string): RealCorpusLivenessArm {
  const arm = ALL_ARMS.find((candidate) => candidate.policy.id === policyId);
  if (arm === undefined) {
    throw new Error(`the liveness roster has no arm for ${policyId}`);
  }
  return arm;
}

function mapOverlays(
  arm: RealCorpusLivenessArm,
  map: (overlay: RealCorpusLivenessArm["overlays"][number]) => RealCorpusLivenessArm["overlays"][number],
): RealCorpusLivenessArm {
  const [first, ...rest] = arm.overlays;
  return { ...arm, overlays: [map(first), ...rest.map(map)] };
}

function healthyCloseoutArm(policyId: string): RealCorpusLivenessArm {
  const arm = rosterArm(policyId);
  if (policyId === "css-var-defined-health") {
    return mapOverlays(arm, (overlay) => {
      if (overlay.kind === "add") {
        return { ...overlay, source: 'export const livenessCssHealth = <div className="w-(--liveness)" />;\n' };
      }
      if (overlay.kind === "resource") {
        return {
          kind: "resource",
          path: overlay.path,
          source: ":root { --liveness: 1px; width: var(--anchor-width, 0px); } .liveness { width: var(--liveness); }\n",
        };
      }
      return overlay;
    });
  }
  if (policyId === "open-json-column-key-parity-health") {
    return mapOverlays(arm, (overlay) =>
      overlay.kind === "neutralise"
        ? {
            ...overlay,
            source:
              'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const liveness = sqliteTable("liveness", { payload: text("payload", { mode: "json" }) });\n',
          }
        : overlay,
    );
  }
  if (policyId === "no-manual-memo-compiler-health") {
    return mapOverlays(arm, (overlay) =>
      overlay.kind === "installed-package" ? { ...overlay, source: 'const denylist = "@tanstack/react-virtual";\n' } : overlay,
    );
  }
  throw new Error(`no healthy closeout overlay is declared for ${policyId}`);
}

test("every chunk declares arms, and no policy carries two", () => {
  // An empty chunk is an import that runs nothing; a duplicated id makes "which control fired" ambiguous.
  for (const [chunk, arms] of Object.entries(CHUNKS)) {
    expect(arms.length, `chunk ${chunk} declares no arms`).toBeGreaterThan(0);
  }
  const ids = ALL_ARMS.map((arm) => arm.policy.id);
  expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
});

test("the batch plan retains every arm and shares only identical ordered interventions", () => {
  const plan = planLivenessBatches(ALL_ARMS);
  expect(plan.flat()).toHaveLength(ALL_ARMS.length);
  expect(
    plan
      .flat()
      .map((arm) => arm.policy.id)
      .toSorted(),
  ).toEqual(ALL_ARMS.map((arm) => arm.policy.id).toSorted());
  for (const batch of plan) {
    expect(new Set(batch.map((arm) => JSON.stringify(arm.overlays))).size).toBe(1);
  }
});

test("identical interventions share a pass without a synthetic-file cutoff", () => {
  const first = rosterArm(queryBoundaryReservationHealth.id);
  const second = rosterArm(queryBoundaryReservation.id);
  const [ownSite, secondSite, ...rest] = first.overlays;
  if (secondSite === undefined) {
    throw new Error("the ordering control needs two overlays");
  }
  const large: RealCorpusLivenessArm = {
    ...first,
    overlays: [
      ownSite,
      secondSite,
      ...rest,
      ...Array.from({ length: ALL_ARMS.length }, (_, index) => ({
        kind: "add" as const,
        path: `packages/client/src/components/liveness-plan-${String(index)}.tsx`,
        source: "export const control = true;\n",
      })),
    ],
  };
  const identical = { ...second, overlays: large.overlays };
  expect(planLivenessBatches([large, identical])).toEqual([[large, identical]]);
  const reordered: RealCorpusLivenessArm = { ...second, overlays: [secondSite, ...rest, ownSite] };
  expect(planLivenessBatches([first, reordered])).toEqual([[first], [reordered]]);
});

test.runIf(ARMS.length > 0)(
  "every measured arm's policy is refusal-free and silent in its scope on the real tree",
  { timeout: scaledBudget(BASELINE_BASE_MS) },
  ({ repoRoot }) => {
    const opened = liveness(repoRoot);
    const ran = opened.assertBaseline();
    expect(ran.toSorted(), "the shared pass ran every measured arm's policy").toEqual(
      opened
        .baselineArms()
        .map((arm) => arm.policy.id)
        .toSorted(),
    );
  },
);

test.runIf(ARMS.length > 0)("the overlaid batches produce a verdict for every arm", { timeout: scaledBudget(BATCHES_BASE_MS) }, ({ repoRoot }) => {
  // Settled batches show progress while preserving the supervisor's hung-pass detection.
  const verdicts = liveness(repoRoot).proveAll((progress) => {
    const { index, of, arms, ms, passes } = progress;
    console.log(
      `liveness batch ${String(index + 1)}/${String(of)}: ${String(arms.length)} arm(s), ${String(passes)} corpus pass(es), ${String(ms)}ms (${arms[0] ?? ""}${arms.length > 1 ? ", ..." : ""})`,
    );
    console.log(`liveness timing ${JSON.stringify(progress)}`);
    const expectedFacts = [...new Set(ARMS.filter((arm) => arms.includes(arm.policy.id)).flatMap((arm) => arm.policy.facts.map(({ id }) => id)))];
    expect(progress.measurements.flatMap((measurement) => measurement.policies.map(({ id }) => id)).toSorted()).toEqual(arms.toSorted());
    expect(progress.measurements.flatMap((measurement) => measurement.facts.map(({ id }) => id)).toSorted()).toEqual(expectedFacts.toSorted());
  });
  expect([...verdicts.keys()].toSorted()).toEqual(ARMS.map((arm) => arm.policy.id).toSorted());
});

test.for(ARMS.map((arm) => [arm.policy.id, arm] as const))(
  "%s reports its real-corpus positive control",
  { timeout: scaledBudget(BATCHES_BASE_MS) },
  ([, arm], { repoRoot }) => {
    expect(assertArmVerdict(arm, liveness(repoRoot).verdict(arm)).join("\n")).toContain(arm.messageIncludes);
  },
);

test.runIf(instrumentAffectedIncludes(AFFECTED_POLICY_IDS, ["zod-output-twin-parity"]))(
  "the Zod output twin control detects its real-corpus overlay alone",
  { timeout: scaledBudget(CONTROL_BASE_MS) },
  ({ repoRoot }) => {
    const arm = rosterArm("zod-output-twin-parity");
    const verdict = liveness(repoRoot).proveBatch([arm]).get(arm.policy.id);
    if (verdict === undefined) {
      throw new Error(`${arm.policy.id}: the planted control produced no verdict`);
    }
    expect(assertArmVerdict(arm, verdict).join("\n")).toContain(arm.messageIncludes);
  },
);

test.runIf(instrumentAffectedIncludes(AFFECTED_POLICY_IDS, CLOSEOUT_POLICY_IDS))(
  "the selected closeout policies report their planted population loss",
  { timeout: scaledBudget(CONTROL_BASE_MS) },
  ({ repoRoot }) => {
    for (const policyId of selectedInstrumentAffectedPolicyIds(AFFECTED_POLICY_IDS, CLOSEOUT_POLICY_IDS)) {
      const arm = rosterArm(policyId);
      const verdict = liveness(repoRoot).proveBatch([arm]).get(policyId);
      if (verdict === undefined) {
        throw new Error(`${policyId}: the planted control produced no verdict`);
      }
      expect(assertArmVerdict(arm, verdict).join("\n"), `${policyId}: the planted control reported a different defect`).toContain(arm.messageIncludes);
    }
  },
);

test.runIf(instrumentAffectedIncludes(AFFECTED_POLICY_IDS, CLOSEOUT_POLICY_IDS))(
  "the selected closeout overlays stay silent when their watched population remains healthy",
  { timeout: scaledBudget(CONTROL_BASE_MS) },
  ({ repoRoot }) => {
    for (const policyId of selectedInstrumentAffectedPolicyIds(AFFECTED_POLICY_IDS, CLOSEOUT_POLICY_IDS)) {
      const healthy = healthyCloseoutArm(policyId);
      const verdict = liveness(repoRoot).proveBatch([healthy]).get(policyId);
      if (verdict === undefined) {
        throw new Error(`${policyId}: the healthy control produced no verdict`);
      }
      expect(verdict.refusals, `${policyId}: the healthy overlay refused instead of measuring the policy`).toEqual([]);
      expect(() => assertArmVerdict(healthy, verdict), `${policyId}: the overlay itself manufactured a finding`).toThrow(
        "reported NOTHING for a real-corpus positive control",
      );
    }
  },
);

test.runIf(instrumentAffectedIncludes(AFFECTED_POLICY_IDS, DEAD_BATCH_CONTROL_IDS))(
  "partitioning preserves a live verdict and a DEAD batch-mate is still named dead",
  { timeout: scaledBudget(CONTROL_BASE_MS) },
  ({ repoRoot }) => {
    // Partitioning must not lend the dead control the live policy's finding.
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
    const isolatedLive = liveness(repoRoot).proveBatch([live]).get(live.policy.id);
    if (isolatedLive === undefined) {
      throw new Error("the isolated partition produced no verdict for the live arm");
    }
    const evidence = (verdict: RealCorpusArmVerdict): Pick<RealCorpusArmVerdict, "messages" | "refusals" | "outOfScope" | "staleGrants"> => ({
      messages: verdict.messages,
      refusals: verdict.refusals,
      outOfScope: verdict.outOfScope,
      staleGrants: verdict.staleGrants,
    });
    expect(evidence(liveVerdict), "partitioning changed the live arm's verdict evidence").toEqual(evidence(isolatedLive));
    expect(deadVerdict.batch, "distinct interventions are proved separately").toEqual([dead.policy.id]);
    expect(assertArmVerdict(live, liveVerdict).join("\n")).toContain(live.messageIncludes);
    expect(() => assertArmVerdict(dead, deadVerdict)).toThrow("reported NOTHING for a real-corpus positive control");
  },
);

test.runIf(instrumentAffectedIncludes(AFFECTED_POLICY_IDS, DEPENDENCY_CONTROL_IDS))(
  "a duplicate-key finding that depends on a companion intervention is not credited",
  { timeout: scaledBudget(CONTROL_BASE_MS) },
  ({ repoRoot }) => {
    // Each duplicate site alone is healthy; another policy cannot supply the missing site.
    const health = armFor(queryBoundaryReservationHealth.id);
    const [ownSite, mateSite] = health.overlays;
    if (mateSite === undefined) {
      throw new Error("the reservation-health arm no longer carries its two duplicate sites");
    }
    const identicalMate: RealCorpusLivenessArm = { ...armFor(queryBoundaryReservation.id), overlays: health.overlays };
    const shared = liveness(repoRoot).proveBatch([health, identicalMate]).get(health.policy.id);
    if (shared === undefined) {
      throw new Error("the identical intervention control produced no verdict");
    }
    expect(shared.batch).toEqual([health.policy.id, identicalMate.policy.id]);
    expect(assertArmVerdict(health, shared).join("\n")).toContain(health.messageIncludes);
    const halfHealth: RealCorpusLivenessArm = { ...health, overlays: [ownSite] };
    const mate: RealCorpusLivenessArm = { ...armFor(queryBoundaryReservation.id), overlays: [mateSite] };
    const verdict = liveness(repoRoot).proveBatch([halfHealth, mate]).get(health.policy.id);
    if (verdict === undefined) {
      throw new Error("the control batch produced no verdict for the health arm");
    }
    expect(verdict.batch, "the verdict measures only the policy's own intervention").toEqual([health.policy.id]);
    expect(() => assertArmVerdict(halfHealth, verdict)).toThrow("reported NOTHING for a real-corpus positive control");
  },
);

test.runIf(instrumentAffectedIncludes(AFFECTED_POLICY_IDS, DEPENDENCY_CONTROL_IDS))(
  "an own-path-only finding cannot borrow an unreported dependency from a companion",
  { timeout: scaledBudget(CONTROL_BASE_MS) },
  ({ repoRoot }) => {
    const original = armFor(queryBoundaryReservationHealth.id);
    const [own, companion] = original.overlays;
    if (own.kind !== "add" || companion?.kind !== "add") {
      throw new Error("the reservation-health control needs two added source files");
    }
    const dependent: RealCorpusLivenessArm = {
      ...original,
      overlays: [own],
      policy: defineGate({
        ...original.policy,
        create: (ctx) => ({
          evaluate: () => {
            const paths = new Set(ctx.files.map((file) => ctx.relativePath(file)));
            if (paths.has(own.path) && paths.has(companion.path)) {
              ctx.report.file(own.path, { line: 1, message: original.messageIncludes });
            }
          },
        }),
      }),
    };
    const mate: RealCorpusLivenessArm = { ...armFor(queryBoundaryReservation.id), overlays: [companion] };
    const complete: RealCorpusLivenessArm = { ...dependent, overlays: [own, companion] };
    const plantedRunner = openRealCorpusLiveness(repoRoot, [dependent, mate]);
    const positive = plantedRunner.proveBatch([complete]).get(dependent.policy.id);
    if (positive === undefined) {
      throw new Error("the complete hidden-dependency control produced no verdict");
    }
    expect(assertArmVerdict(complete, positive)).toEqual([original.messageIncludes]);
    expect(positive.outOfScope).toBe(JSON.stringify([{ file: own.path, message: original.messageIncludes }]));

    const isolated = plantedRunner.proveBatch([dependent]).get(dependent.policy.id);
    if (isolated === undefined) {
      throw new Error("the isolated hidden-dependency control produced no verdict");
    }
    expect(isolated.refusals).toEqual([]);
    expect(() => assertArmVerdict(dependent, isolated)).toThrow("reported NOTHING for a real-corpus positive control");

    const separated = plantedRunner.proveBatch([dependent, mate]).get(dependent.policy.id);
    if (separated === undefined) {
      throw new Error("the separated hidden-dependency control produced no verdict");
    }
    expect(separated.refusals).toEqual([]);
    expect(() => assertArmVerdict(dependent, separated)).toThrow("reported NOTHING for a real-corpus positive control");
    expect(separated.batch).toEqual([dependent.policy.id]);

    const progress: LivenessBatchProgress[] = [];
    const measured = plantedRunner.proveAll((batch) => progress.push(batch));
    expect(measured.get(dependent.policy.id)).toEqual(isolated);
    expect([...measured.keys()].toSorted()).toEqual([dependent.policy.id, mate.policy.id].toSorted());
    expect(progress.map((batch) => batch.arms)).toEqual([[dependent.policy.id], [mate.policy.id]]);
    for (const batch of progress) {
      expect(batch.passes).toBe(batch.measurements.length);
      expect(batch.measurements.flatMap((measurement) => measurement.policies.map(({ id }) => id))).toEqual(batch.arms);
      for (const measurement of batch.measurements) {
        expect(measurement.facts).toEqual([]);
        expect(measurement.pass.policyMs).toBe(measurement.policies.reduce((sum, policy) => sum + policy.timing.totalMs, 0));
        expect(measurement.pass.factMs).toBe(0);
        const timings = [
          measurement.preparationMs,
          measurement.overlayMs,
          measurement.executionMs,
          measurement.restorationMs,
          ...Object.values(measurement.pass),
          ...measurement.policies.flatMap((policy) => [policy.timing.totalMs, ...Object.values(policy.timing.phaseMs)]),
        ];
        expect(timings.every((ms) => Number.isFinite(ms) && ms >= 0)).toBe(true);
      }
    }
    expect(plantedRunner.proveAll((batch) => progress.push(batch))).toBe(measured);
    expect(progress).toHaveLength(2);
  },
);

test.runIf(instrumentAffectedIncludes(AFFECTED_POLICY_IDS, REPORT_ANCHOR_CONTROL_IDS))(
  "an add-only control cannot credit an existing report anchor without baseline silence",
  { timeout: scaledBudget(CONTROL_BASE_MS) },
  ({ repoRoot }) => {
    const original = armFor(queryBoundaryReservationHealth.id);
    const [own] = original.overlays;
    if (own.kind !== "add") {
      throw new Error("the baseline anchor control needs an added source file");
    }
    const anchoredRunnerFor = (reportWithoutOverlay: boolean): RealCorpusLivenessRunner => {
      const anchored: RealCorpusLivenessArm = {
        ...original,
        overlays: [own],
        reportsAt: [QUERY_BOUNDARY_HOME],
        policy: defineGate({
          ...original.policy,
          create: (ctx) => ({
            evaluate: () => {
              if (reportWithoutOverlay || ctx.files.some((file) => ctx.relativePath(file) === own.path)) {
                ctx.report.file(QUERY_BOUNDARY_HOME, { line: 1, message: original.messageIncludes });
              }
            },
          }),
        }),
      };
      const anchoredRunner = openRealCorpusLiveness(repoRoot, [anchored]);
      const overlaid = anchoredRunner.proveBatch([anchored]).get(anchored.policy.id);
      if (overlaid === undefined) {
        throw new Error("the existing-anchor control produced no verdict");
      }
      expect(assertArmVerdict(anchored, overlaid)).toEqual([original.messageIncludes]);
      expect(overlaid.outOfScope).toBe(JSON.stringify([{ file: QUERY_BOUNDARY_HOME, message: original.messageIncludes }]));
      expect(anchoredRunner.baselineArms()).toEqual([anchored]);
      return anchoredRunner;
    };
    const polluted = anchoredRunnerFor(true);
    const healthy = anchoredRunnerFor(false);
    expect(() => polluted.assertBaseline()).toThrow("already report in their arm's scope before any overlay");
    expect(healthy.assertBaseline()).toEqual([original.policy.id]);
  },
);

test.runIf(instrumentAffectedIncludes(AFFECTED_POLICY_IDS, RESOURCE_CONTROL_IDS))(
  "a RESOURCE overlay that plants nothing is refused — the reader's overlay seam cannot make a policy speak",
  {
    timeout: scaledBudget(CONTROL_BASE_MS),
  },
  ({ repoRoot }) => {
    // The planted negative for `kind: "resource"`: the ownership arm's real sheet, handed a tail that is only a
    // comment. If the overlay alone made the policy report, every green resource arm would be unfalsified.
    const ownership = FRONTEND_ARMS.find((arm) => arm.grantConsumption !== true && arm.overlays.some((overlay) => overlay.kind === "resource"));
    const planted = ownership?.overlays.find(
      (overlay): overlay is Extract<RealCorpusLivenessArm["overlays"][number], { readonly kind: "resource" }> => overlay.kind === "resource",
    );
    if (ownership === undefined || planted === undefined) {
      throw new Error("the frontend chunk carries no resource arm, so the control has nothing to drive");
    }
    const dead: RealCorpusLivenessArm = { ...ownership, overlays: [{ kind: "resource", path: planted.path, append: "\n/* liveness clean control */\n" }] };
    const verdict = liveness(repoRoot).proveBatch([dead]).get(dead.policy.id);
    if (verdict === undefined) {
      throw new Error("the control batch produced no verdict for its arm");
    }
    expect(() => assertArmVerdict(dead, verdict)).toThrow("reported NOTHING for a real-corpus positive control");
  },
);

test.runIf(instrumentAffectedIncludes(AFFECTED_POLICY_IDS, ["test-executable-mode"]))(
  "a TRACKED-MODE overlay that keeps the real test non-executable stays silent",
  { timeout: scaledBudget(CONTROL_BASE_MS) },
  ({ repoRoot }) => {
    const executableMode = rosterArm("test-executable-mode");
    const planted = executableMode.overlays.find(
      (overlay): overlay is Extract<RealCorpusLivenessArm["overlays"][number], { readonly kind: "tracked-mode" }> => overlay.kind === "tracked-mode",
    );
    if (planted === undefined) {
      throw new Error("the executable-mode arm carries no tracked-mode overlay, so the control has nothing to drive");
    }
    const dead: RealCorpusLivenessArm = { ...executableMode, overlays: [{ ...planted, executable: false }] };
    const verdict = liveness(repoRoot).proveBatch([dead]).get(dead.policy.id);
    if (verdict === undefined) {
      throw new Error("the tracked-mode control produced no verdict");
    }
    expect(verdict.refusals, "the ordinary-mode control refused instead of reading the real candidate index").toEqual([]);
    expect(() => assertArmVerdict(dead, verdict)).toThrow("reported NOTHING for a real-corpus positive control");
  },
);

test.runIf(instrumentAffectedIncludes(AFFECTED_POLICY_IDS, GRANT_CONSUMPTION_CONTROL_IDS))(
  "a GRANT-CONSUMPTION arm whose overlay leaves the licensed subject in place is refused",
  { timeout: scaledBudget(CONTROL_BASE_MS) },
  ({ repoRoot }) => {
    // The planted negative for `grantConsumption`: the same policy, its real sheet plus a comment. The recipes
    // are still painted, so the grants stay consumed and the arm must fail — otherwise "went stale" would be
    // something the runner produces rather than something the policy's reading of the subject produces.
    const consuming = FRONTEND_ARMS.find((arm) => arm.grantConsumption === true);
    const planted = consuming?.overlays.find(
      (overlay): overlay is Extract<RealCorpusLivenessArm["overlays"][number], { readonly kind: "resource" }> => overlay.kind === "resource",
    );
    if (consuming === undefined || planted === undefined) {
      throw new Error("the frontend chunk carries no grant-consumption arm, so the control has nothing to drive");
    }
    const dead: RealCorpusLivenessArm = { ...consuming, overlays: [{ kind: "resource", path: planted.path, append: "\n/* liveness clean control */\n" }] };
    const verdict = liveness(repoRoot).proveBatch([dead]).get(dead.policy.id);
    if (verdict === undefined) {
      throw new Error("the control batch produced no verdict for its arm");
    }
    expect(() => assertArmVerdict(dead, verdict)).toThrow("its grants stayed consumed");
  },
);
