// The structural-gate orchestrator (`pnpm check:structure` → `cli.ts structure`) — THE MIXED FRONT DOOR
// (docs/design/gate-runtime-standardization.md §5 item 2; docs/reviews/gate-runtime/mixed-runtime-front-door.md).
// One loader classifies every tooling/src/verify/gates/*.ts module by exact contract identity (lib/loader.ts), ONE
// shared ts-morph Project is built, and each contract runs through its OWN dispatcher in this one invocation: the
// legacy single-pass machine (`runPass`) over the legacy descriptors and the final policy dispatcher
// (`runPolicyPass`, the FULL final roster as `knownPolicies`, the central grant table) over the final policies.
// Both land in ONE artifact (contract/structure-report.ts) and ONE console; the exit is the max of the two
// verdicts under the unchanged 0/1/2/3 contract. Add a gate by dropping it in gates/ — the loader IS the registry.
//
// RUN COMPLETENESS (#410, contract/run-manifest.ts): the artifact is written TWICE — an IN-FLIGHT stub the
// moment the run starts, and the finished report at the end — and the counts are reconciled before any
// clean/violations exit, on BOTH contracts. A killed run therefore leaves an artifact that SAYS it is not a
// verdict instead of leaving the previous run's complete-looking file for the next reader to consume.
//
// THE GATE-SCOPED DOOR (#1964/#1973/#1992). `--check <id>` / `--family <name>` narrow WHICH gates run — and
// NOTHING ELSE. The ts-morph Project, the fileset and every population stay the whole real tree, because the
// question the per-conversion floor (§8.8) asks is "what does MY policy report on the REAL tree", and
// narrowing the population answers a different question: it would change what the gate SEES and therefore can
// change its verdict. So the door filters the SELECTED SET and leaves the corpus alone: a floor asking about
// one gate runs that gate's dispatchers and nobody else's, which is also why #1992 is DISCHARGED here rather
// than optimized — `policy-soundness` is simply not in a selection that did not name it.
//
// Two properties keep a partial run from ever being mistaken for the corpus verdict — they are the whole
// difference between a useful door and a dangerous one, because a wrong answer with a real artifact behind it
// is strictly worse than no answer: the manifest records the SELECTION, and a selected run does NOT publish
// `reports/check-structure.json` (it prints its own slot), so no fixed-path reader can pick a one-gate report
// up as the whole one.
//
// QUIET (#2069). A fixture-planting suite materializes `__g_` / `__dc_` files INSIDE the real package tree
// (tests/tooling/check-gates.repo.int.test.ts), so a structure run overlapping one judges a tree that does not
// exist and comes back with inflated raw counts that look exactly like a real number. This run therefore
// OBSERVES those paths at both ends of its own walk and marks itself NOT QUIET when it sees any it did not
// plant — a non-verdict that says so, instead of a number nobody can tell apart from a real one.
//
// IS THIS ARTIFACT ABOUT THE REAL TREE? (#2167 — `run.verdict`, contract/run-manifest.ts). The bigger half of
// that story is not contamination at all: a FIXTURE-MODE run (`ORB_GATE_FIXTURES=1`) is complete, correct, and
// reporting on the gate self-test's OWN planted props, and until now its artifact was byte-indistinguishable
// from a real-tree verdict. Derived 2026-09-12 over all twelve published slots with the predicate "any
// `__g_`/`__dc_` path in a slot's violations" — a real-tree run STRIPS those, so a slot that CONTAINS them
// opted out — THREE were that shape, and a fresh-context verifier built a whole REAL-TREE LIVENESS section on
// one of them. It acted correctly on every rule it had; the lie was the missing LABEL, not the content. So a
// non-verdict run says so on its own artifact, prints it above the roster, and NEVER publishes the pointer —
// and `structure --void <slot> --reason` writes the same judgement into a slot after the fact.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import type { RunSlot } from "@orb/tooling/_shared/artifacts";
import { checkoutName, closeRunSlot, openRunSlot, publishRunSlot, reportsPath } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import type { MixedGateCorpus, SelectedGateCorpus } from "../contract/gate-corpus.ts";
import type { Violation } from "../contract/harness.ts";
import type { PassResult } from "../contract/pass.ts";
import type { GatePolicy } from "../contract/policy.ts";
import type { PolicyPassResult } from "../contract/policy-pass.ts";
import type { PolicySelector } from "../contract/policy-plan.ts";
import type { RunManifest } from "../contract/run-manifest.ts";
import type { FinalPolicyRow, LegacyGateRow, StructureReport } from "../contract/structure-report.ts";
import { STRUCTURE_REPORT_NAME } from "../contract/structure-report.ts";
import { loadMixedGateCorpus } from "../lib/loader.ts";
import { projectCtx, runPass, stripProbeFindings, stripProbePolicyFindings, zeroScanGates } from "../lib/pass.ts";
import { nonVerdictReason, notQuietReasons, plantedPaths } from "../lib/planted-fixtures.ts";
import { runPolicyPass } from "../lib/policy-pass.ts";
import { policyPassExitCode } from "../lib/policy-plan.ts";
import { isSelectionFailure, resolveMixedSelection } from "../lib/policy-selection.ts";
import { populationAlarms } from "../lib/population.ts";
import { reviewedGrantsFor } from "../lib/reviewed-grants.ts";
import { structureConsole } from "../lib/structure-console.ts";
import { finalSide, finalToolErrorCount } from "../lib/structure-report.ts";
import { parseStructureTail, tailRefusal, VOID_FLAG } from "../lib/structure-tail.ts";
import { policyTimingAlarms, timingAlarms } from "../lib/timing.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

/** Map the legacy PassResult onto the artifact's legacy rows: each gate's per-occurrence findings collapse into
 *  `{file,line,message}` violations, where the message is the finding's own override or the descriptor's `message`. */
function toLegacyRows(pass: PassResult, gatesByName: ReadonlyMap<string, GateDescriptor>): readonly LegacyGateRow[] {
  return pass.gates.map((g) => {
    const descriptor = gatesByName.get(g.name);
    const violations: Violation[] = g.findings.map((f) => ({ file: f.file, line: f.line, message: f.message ?? descriptor?.message ?? g.name }));
    return { contract: "legacy", name: g.name, ok: violations.length === 0, violations, scan: g.scan, timing: g.timing };
  });
}

/** The reconciliation (#410) over BOTH contracts: every corpus file accounted for, every ACTIVE legacy descriptor
 *  actually run, every registered final policy actually reported. A mismatch means the report is SHORTER than the
 *  corpus — the exact shape a silently-skipped gate makes, and the one a verdict must never be read off. */
function reconcile(corpus: MixedGateCorpus, selected: SelectedGateCorpus, pass: PassResult, finalRows: readonly FinalPolicyRow[]): readonly string[] {
  const out: string[] = [];
  if (corpus.files.length === 0) {
    out.push("the gate corpus resolved ZERO modules — nothing was loaded, so this run is not a verdict");
  }
  // The denominator is the SELECTION, not the corpus (#1964): a gate-scoped run is short only when it failed
  // to run something it WAS asked about. On the default whole-corpus run the two are the same set.
  const active = selected.legacy.filter((g) => g.status === "active").length;
  if (pass.gates.length !== active) {
    out.push(`${pass.gates.length} legacy gate(s) produced a result but ${active} were ACTIVE — the legacy pass is short by ${active - pass.gates.length}`);
  }
  if (finalRows.length !== selected.final.length) {
    out.push(
      `${finalRows.length} final polic(ies) produced a result but ${selected.final.length} were registered — the final pass is short by ${selected.final.length - finalRows.length}`,
    );
  }
  if (corpus.unregistered.length > 0) {
    out.push(`${corpus.unregistered.length} corpus file(s) registered NO descriptor (the loader skipped them): ${corpus.unregistered.join(", ")}`);
  }
  return out;
}

/** Write into THIS RUN'S slot. Never the published path: `reports/check-structure.json` is a symlink
 *  publishRunSlot swaps in at completion, so no in-flight write can ever be read as somebody's verdict. */
function writeReport(slot: RunSlot, report: StructureReport): void {
  writeFileSync(join(slot.dir, STRUCTURE_REPORT_NAME), `${JSON.stringify(report, null, 2)}\n`);
}

/** The IN-FLIGHT stub (#410). Written BEFORE the walk, so a run killed mid-pass leaves an artifact whose
 *  own `run.complete: false` refuses to be read as a verdict. Since #1029 it lands in the run's own slot
 *  and the slot's in-flight marker is what surfaces it to a fixed-path reader (`abandonedRuns`). */
function writeInFlight(slot: RunSlot, run: RunManifest): void {
  // The zeroed timing is the honest stub value: nothing has run yet. `run.complete: false` is what tells
  // a reader this is not a verdict — the cost ledger never has to carry that signal too.
  writeReport(slot, {
    run,
    gates: [],
    toolErrors: [],
    scanAlarms: [],
    populationAlarms: [],
    timing: { totalMs: 0, gateMs: 0 },
    policy: null,
    total: 0,
    ok: false,
  });
}

function startManifest(root: string, slot: RunSlot, selection: PolicySelector): RunManifest {
  return {
    selection,
    // The stub's honest value: nothing has been OBSERVED yet, and `complete: false` is already what refuses
    // this artifact as a verdict. The finished report carries the real answer.
    quiet: true,
    // IN FLIGHT IS A NON-VERDICT, stated on the axis readers now key off rather than inferred from
    // `complete: false` — a stub that says only "unfinished" left a reader to decide what that meant.
    verdict: "non-verdict",
    nonVerdictReason: "this run is IN FLIGHT — the finished report has not replaced this stub",
    runId: slot.runId,
    checkout: checkoutName(root),
    artifactDir: slot.relDir,
    concurrent: slot.racing,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    complete: false,
    corpusFiles: 0,
    registered: 0,
    unregistered: [],
    active: 0,
    ran: 0,
    legacy: { registered: 0, active: 0, ran: 0 },
    final: { registered: 0, ran: 0, withheld: 0 },
    incompleteReasons: [],
  };
}

/** A concurrent writer is NAMED, never silently last-write-wins (#1029). stderr, not stdout: the verdict
 *  stream stays parseable, and a lane reading only the artifact still finds the same list in `run.concurrent`. */
function announceRacing(slot: RunSlot): void {
  if (slot.racing.length > 0) {
    process.stderr.write(`[check:structure] CONCURRENT RUN(S) of this instrument on this checkout: ${slot.racing.join(", ")}\n`);
    process.stderr.write(`[check:structure] this run writes to ${slot.relDir} and publishes reports/${STRUCTURE_REPORT_NAME} only if it finishes last.\n`);
  }
}

// Probe-artifact findings are stripped UNLESS this run is the check-gates conformance suite's own child (it plants
// __g_ fixtures and MUST see them fire — it sets ORB_GATE_FIXTURES=1). One knob, both contracts.
function keepProbeFindings(): boolean {
  // biome-ignore lint/style/noProcessEnv: ORB_GATE_FIXTURES is the check-gates suite's opt-out knob for its own child runs — harness plumbing, not app config.
  return process.env["ORB_GATE_FIXTURES"] === "1";
}

/** The FINAL dispatcher over the SAME Project the legacy pass walked: the full roster as `knownPolicies` (a
 *  narrower roster manufactures unknown-policy waiver alarms) and the grant rows that name a LOADED policy. The
 *  door filters (`reviewedGrantsFor`) so a partial roster — every planted tree, every future scoped policy
 *  selection — is not buried under `invalid-grant` errors for rows naming policies it never loaded; the
 *  WHOLE table against the WHOLE roster is the conformance stage's job (ops/policy-conformance-stage.ts), where a
 *  row naming a legacy gate, a deleted policy or a non-reviewed-grant policy is a tool error on every check.
 *
 *  `failOnWarnings` arrives from the operator and DEFAULTS FALSE (see runStructure's tail): a final
 *  `severity: "warning"` finding is reported, counted in `verdict.warnings`, and blocks nothing. */
function runFinalPass(
  corpus: MixedGateCorpus,
  selectedFinal: readonly GatePolicy[],
  ctx: Omit<GateRunCtx, "report" | "scan">,
  failOnWarnings: boolean,
): PolicyPassResult | null {
  if (selectedFinal.length === 0) {
    return null;
  }
  const raw = runPolicyPass({
    // `knownPolicies` stays the WHOLE loaded roster even under a selection (#1964): a narrower roster
    // manufactures unknown-policy waiver alarms, and `assertSelectedPoliciesAreLoaded` already rules
    // `policies ⊆ knownPolicies` as the supported scoped shape.
    knownPolicies: corpus.final,
    policies: selectedFinal,
    root: ctx.root,
    project: ctx.project,
    reviewedGrants: reviewedGrantsFor(corpus.final),
    failOnWarnings,
  });
  return keepProbeFindings() ? raw : stripProbePolicyFindings(raw);
}

/** THE EXPLICIT VOID (#2167 clause 2). The operator knows a published slot is not evidence — it overlapped a
 *  planter, it was taken under a load kill, its premise died — and no re-derivation from the artifact alone
 *  can say so. This writes that judgement INTO the slot, which is the only place a future reader will look.
 *
 *  It mutates the artifact rather than dropping a sibling file: every reader already opens
 *  `check-structure.json`, and a tombstone that needs a second path is a tombstone half the readers miss.
 *  `complete` is untouched — the run did finish, and that field's meaning (#410: finished vs DIED) is load-
 *  bearing for `abandonedRuns`. A slot that does not exist is MISUSE (exit 3): the operator named the wrong
 *  run, and silently succeeding would leave them believing a void happened. */
function tombstoneSlot(root: string, request: { readonly slot: string; readonly reason: string }): number {
  const file = reportsPath(root, "runs", "structure", request.slot, STRUCTURE_REPORT_NAME);
  let report: StructureReport;
  try {
    report = JSON.parse(readFileSync(file, "utf8")) as StructureReport;
  } catch (error) {
    throw new UsageError(
      `structure ${VOID_FLAG}: no readable artifact at ${file}\n  Name a slot directory under reports/runs/structure/ (the id the run printed).`,
      { cause: error },
    );
  }
  const voided: StructureReport = { ...report, run: { ...report.run, verdict: "non-verdict", nonVerdictReason: request.reason } };
  writeFileSync(file, `${JSON.stringify(voided, null, 2)}\n`);
  process.stdout.write(
    `structure: TOMBSTONED ${request.slot}\n  reason: ${request.reason}\n  every reader of this slot now refuses it and prints that reason.\n`,
  );
  return EXIT.clean;
}

/** A SELECTED run resolves its names against the loader BEFORE the run slot opens (#1117): an id that matches
 *  nothing is misuse and must leave no artifact at all, and a selection that matched nothing must never run as
 *  a clean zero. The corpus it loaded is handed back so the run below loads it exactly ONCE.
 *
 *  `null` on the DEFAULT run — nothing moves, and the corpus still loads in its original position, which is
 *  what keeps the whole-corpus artifact identical to the pre-#1964 one. */
async function preflightSelection(
  root: string,
  selection: PolicySelector,
): Promise<{ readonly corpus: MixedGateCorpus; readonly selected: SelectedGateCorpus } | null> {
  if (selection.kind === "all") {
    return null;
  }
  const corpus = await loadMixedGateCorpus(root);
  const selected = resolveMixedSelection(corpus, selection);
  if (isSelectionFailure(selected)) {
    throw new UsageError(tailRefusal(selected.message));
  }
  return { corpus, selected };
}

/** The single invocation: load BOTH contracts, build ONE Project, run each dispatcher, render both, write the ONE
 *  JSON, and RETURN the 0/1/2 verdict — the max of the two sides (2 when any gate threw, read nothing, refused a
 *  receipt, or the run did not reconcile; 1 on violations or a blocking final finding/alarm; 0 clean). The cli's
 *  `runTool` sets `process.exitCode` from it — never `process.exit`, which drops the buffered stdout write below
 *  and truncates a large report mid-line (the fixture-run report the check-gates anti-drift test parses). */
export async function runStructure(root: string, argv: readonly string[]): Promise<number> {
  const request = parseStructureTail(argv);
  if (request.tombstone !== null) {
    return tombstoneSlot(root, request.tombstone);
  }
  const preflight = await preflightSelection(root, request.selection);
  const slot = openRunSlot(root, "structure");
  announceRacing(slot);
  const started = startManifest(root, slot, request.selection);
  writeInFlight(slot, started);

  const corpus = preflight?.corpus ?? (await loadMixedGateCorpus(root));
  const selected = preflight?.selected ?? { legacy: corpus.legacy, final: corpus.final };
  const gatesByName = new Map(corpus.legacy.map((g) => [g.name, g]));
  const ctx = projectCtx(root);
  // #2069 sample ONE: the tree as it stood when this run took its fileset.
  const plantedAtStart = plantedPaths(root);
  const rawPass = runPass(selected.legacy, ctx);
  const pass = keepProbeFindings() ? rawPass : stripProbeFindings(rawPass);
  const final = finalSide(selected.final, runFinalPass(corpus, selected.final, ctx, request.failOnWarnings));
  // #2069 sample TWO: a plant that opened AFTER the project was built still poisons every fs-reading gate.
  const observed = keepProbeFindings() ? [] : [...new Set([...plantedAtStart, ...plantedPaths(root)])].toSorted();

  // An UNTIMED gate (either contract) rides the same class as a SHORT run (lib/timing.ts): both leave a report
  // that looks complete while a fact the artifact promises is silently absent.
  const incompleteReasons = [
    ...reconcile(corpus, selected, pass, final.rows),
    ...notQuietReasons(observed),
    ...timingAlarms(pass),
    // A corpus with no final policy owes no final ledger; one WITH a final policy owes the whole one.
    ...(final.result === null ? [] : policyTimingAlarms(final.rows, final.result.timing)),
  ];
  // ANNOTATED LOCAL, not a bare `final.result`: biome's type service resolves the imported `FinalSide`'s
  // nullable member as always-present and reds every `?.`/`??` below as an unnecessary condition, while tsc
  // reads the same union correctly. Re-stating the type here restores the union for both readers without a
  // suppression and without weakening the guard (the house answer for biome's cross-module narrowing).
  const finalResult: PolicyPassResult | null = final.result;
  const legacyRows = toLegacyRows(pass, gatesByName);
  const legacyTotal = legacyRows.reduce((n, g) => n + g.violations.length, 0);
  const finalBlocking = finalResult?.authority.verdict.blocking ?? 0;
  const total = legacyTotal + finalBlocking;
  const scanAlarms = zeroScanGates(pass);
  const populations = populationAlarms(pass);
  // Every count below is a denominator over what this run was ASKED about. On the default run the selection
  // IS the corpus, so the numbers are byte-identical to the pre-#1964 manifest.
  const legacyActive = selected.legacy.filter((g) => g.status === "active").length;
  const nonVerdict = nonVerdictReason(keepProbeFindings(), observed);
  const run: RunManifest = {
    ...started,
    quiet: observed.length === 0,
    verdict: nonVerdict === null ? "verdict" : "non-verdict",
    nonVerdictReason: nonVerdict,
    finishedAt: new Date().toISOString(),
    complete: true,
    corpusFiles: corpus.files.length,
    registered: selected.legacy.length + selected.final.length,
    unregistered: corpus.unregistered,
    active: legacyActive + selected.final.length,
    ran: pass.gates.length + final.rows.length,
    legacy: { registered: selected.legacy.length, active: legacyActive, ran: pass.gates.length },
    final: { registered: selected.final.length, ran: final.rows.length, withheld: finalResult?.authority.withheldPolicyIds.length ?? 0 },
    incompleteReasons,
  };

  // THE ONE console write — the text is composed in lib/structure-console.ts and lands here, once.
  process.stdout.write(structureConsole({ pass, gatesByName, selected, final, run, slotRelDir: slot.relDir }));

  const legacyBroken = pass.toolErrors.length > 0 || scanAlarms.length > 0 || populations.length > 0 || incompleteReasons.length > 0;
  const finalBroken = final.result !== null && finalToolErrorCount(final.result) > 0;
  writeReport(slot, {
    run,
    gates: [...legacyRows, ...final.rows],
    toolErrors: pass.toolErrors,
    scanAlarms,
    populationAlarms: populations,
    timing: pass.timing,
    policy: final.report,
    total,
    ok: total === 0 && !legacyBroken && !finalBroken,
  });
  // Published at the END and only here: a reader arriving at reports/check-structure.json therefore always
  // resolves to a run that FINISHED — its own or a sibling's — never to an in-flight or torn artifact.
  //
  // AND ONLY BY A WHOLE-CORPUS RUN (#1964). A gate-scoped run answers a NARROWER question, so republishing the
  // pointer would hand every fixed-path reader a partial report that looks exactly like the corpus verdict —
  // the same class of lie the in-flight stub exists to prevent. Its artifact stays reachable only through the
  // slot the timing line prints.
  //
  // AND ONLY BY A RUN THAT MEANS IT (#2167). A FIXTURE-MODE run is complete, correct and about planted props;
  // a CONTAMINATED run read a tree that stopped existing. Both used to publish, and the pointer is what every
  // casual reader follows — that is precisely how slot `main-2930600`'s fixture findings reached a verifier as
  // real-tree liveness. A non-verdict keeps its slot and never becomes `latest`.
  finishSlot(root, slot, request.selection, run);

  // A short run, a blind gate, a refused POPULATION receipt, a thrown gate and a refused final owner ride the SAME
  // severity: in all of them the run is not a verdict. The final side's exit rule has ONE home
  // (`policyPassExitCode`, the planner's) and is composed here by max, never re-spelled.
  const finalExit = final.result === null ? EXIT.clean : policyPassExitCode(final.result);
  return Math.max(legacyExit(legacyBroken, legacyTotal), finalExit);
}

/** END THE RUN: publish the pointer when this run may speak for the corpus, and CLOSE the slot either way.
 *
 *  PUBLISHING is narrow, and both narrowings are the same lie prevented twice: a GATE-SCOPED run (#1964)
 *  answers a narrower question, and a NON-VERDICT run (#2167) answers about planted props or a tree that
 *  stopped existing — republishing either hands every fixed-path reader something that looks exactly like
 *  the corpus verdict.
 *
 *  CLOSING IS UNIVERSAL (#2221), and that is the half that was missing. The `.inflight` marker means "a
 *  process is writing here", never "this slot became `latest`" — but `publishRunSlot` was its only unlinker,
 *  so every selected or non-verdict run left one behind and `abandonedRuns` then read it as a run that DIED.
 *  `pnpm check:show` refused the real, complete pointer with "that run never finished", about a run that
 *  finished perfectly and only declined to speak. Measured on main 2026-09-12 over `reports/runs/structure/`
 *  (N=32): 17 slots carried a marker, 13 of them FINISHED fixture-mode runs. */
function finishSlot(root: string, slot: RunSlot, selection: PolicySelector, run: RunManifest): void {
  if (selection.kind === "all" && run.verdict === "verdict") {
    publishRunSlot(root, slot, [{ alias: STRUCTURE_REPORT_NAME, target: STRUCTURE_REPORT_NAME }]);
    return;
  }
  closeRunSlot(slot);
}

/** The legacy side's exit under the unchanged contract: a broken run outranks a verdict, a verdict outranks clean. */
function legacyExit(broken: boolean, violations: number): number {
  if (broken) {
    return EXIT.toolError;
  }
  return violations > 0 ? EXIT.violations : EXIT.clean;
}
