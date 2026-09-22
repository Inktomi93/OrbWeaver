// The structural-gate orchestrator (`pnpm check:structure` → `cli.ts structure`) — THE FRONT DOOR
// (docs/design/gate-runtime-standardization.md §1). One loader classifies every
// tooling/src/verify/gates/*.ts module (lib/loader.ts), ONE shared ts-morph Project is built, and the policy
// dispatcher runs the roster in this one invocation (`runPolicyPass`, the FULL roster as `knownPolicies`,
// the central grant table). It lands in ONE artifact (contract/structure-report.ts) and ONE console under
// the unchanged 0/1/2/3 exit contract. Add a gate by dropping it in gates/ — the loader IS the registry.
//
// IT WAS THE MIXED FRONT DOOR UNTIL #2176 PHASE F (2026-09-14). The legacy `runPass` side and the exit
// `Math.max` that composed the two verdicts are gone with the descriptor contract; what the mixed era
// established and this file KEEPS is that the run's completeness is reconciled and its verdict is refused
// rather than shortened.
//
// RUN COMPLETENESS (#410, contract/run-manifest.ts): the artifact is written TWICE — an IN-FLIGHT stub the
// moment the run starts, and the finished report at the end — and the counts are reconciled before any
// clean/violations exit. A killed run therefore leaves an artifact that SAYS it is not a verdict instead of
// leaving the previous run's complete-looking file for the next reader to consume.
//
// THE POLICY COMMAND DOOR (#1964/#1973/#1992). `--check <id>` / `--family <name>` narrow WHICH gates run.
// With no scope flag their populations remain the whole real tree, preserving the per-conversion floor's
// question. An explicit file/folder/package/project/changed scope narrows through the canonical planner and
// records that different question in the manifest; `--strict-scope` refuses an entire-population owner that
// cannot answer it completely.
//
// Two properties keep a partial run from ever being mistaken for the corpus verdict — they are the whole
// difference between a useful door and a dangerous one, because a wrong answer with a real artifact behind it
// is strictly worse than no answer: the manifest records the SELECTION, and a selected run does NOT publish
// `reports/check-structure.json` (it prints its own slot), so no fixed-path reader can pick a one-gate report
// up as the whole one.
//
// QUIET (#2069). A fixture-planting suite materializes `__g_` / `__dc_` files INSIDE the real package tree,
// so a structure run overlapping one judges a tree that does not exist and comes back with inflated raw
// counts that look exactly like a real number. This run therefore
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
//
// THE ARTIFACT'S PROBE-FINDING STRIP now lives beside the observer that shares its sentinel vocabulary
// (`lib/planted-fixtures.ts#stripProbePolicyFindings`); it moved out of the retired `lib/pass.ts`.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import type { RunSlot } from "@orb/tooling/_shared/artifacts";
import { checkoutName, closeRunSlot, openRunSlot, publishRunSlot, reportsPath } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { GateCorpus, SelectedGateCorpus } from "../contract/gate-corpus.ts";
import type { PolicyPassResult } from "../contract/policy-pass.ts";
import type { PolicyCommandRequest, PolicyInspectionPlan, PolicyRunPlan } from "../contract/policy-plan.ts";
import type { PolicyScopeResolution } from "../contract/policy-scope.ts";
import type { ProjectContext } from "../contract/project-context.ts";
import type { RunManifest, StructureScopeManifest } from "../contract/run-manifest.ts";
import type { FinalPolicyRow, StructureReport } from "../contract/structure-report.ts";
import { STRUCTURE_REPORT_NAME } from "../contract/structure-report.ts";
import { loadGateCorpus } from "../lib/loader.ts";
import { nonVerdictReason, notQuietReasons, plantedPaths, stripProbePolicyFindings } from "../lib/planted-fixtures.ts";
import { parsePolicyCommand } from "../lib/policy-command.ts";
import { planPolicyArgv, policyPassExitCode } from "../lib/policy-plan.ts";
import { executePolicyPlan } from "../lib/policy-plan-execute.ts";
import { resolvePolicyScope } from "../lib/policy-scope.ts";
import { projectCtx, repoRel } from "../lib/project-context.ts";
import { reviewedGrantsFor } from "../lib/reviewed-grants.ts";
import { structureConsole } from "../lib/structure-console.ts";
import { finalSide, finalToolErrorCount, structureCountReconciliation } from "../lib/structure-report.ts";
import { parseStructureTombstone, tailRefusal, VOID_FLAG } from "../lib/structure-tail.ts";
import { policyTimingAlarms } from "../lib/timing.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

/** The reconciliation (#410) over the roster: every corpus file accounted for, every registered policy
 *  actually reported. A mismatch means the report is SHORTER than the corpus — the exact shape a silently
 *  skipped gate makes, and the one a verdict must never be read off. */
function reconcile(corpus: GateCorpus, selected: SelectedGateCorpus, rows: readonly FinalPolicyRow[]): readonly string[] {
  const out: string[] = [];
  if (corpus.files.length === 0) {
    out.push("the gate corpus resolved ZERO modules — nothing was loaded, so this run is not a verdict");
  }
  // The denominator is the SELECTION, not the corpus (#1964): a gate-scoped run is short only when it failed
  // to run something it WAS asked about. On the default whole-corpus run the two are the same set.
  if (rows.length !== selected.gates.length) {
    out.push(
      `${rows.length} polic(ies) produced a result but ${selected.gates.length} were registered — the pass is short by ${selected.gates.length - rows.length}`,
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
  // `run.complete: false` is what tells a reader this is not a verdict — no other field has to carry that
  // signal too.
  writeReport(slot, {
    run,
    gates: [],
    policy: null,
    reconciliation: { finalEffectiveFindings: 0, nonblockingWarnings: 0, authorityAlarms: 0, blocking: 0 },
    total: 0,
    ok: false,
  });
}

interface StructurePlanIdentity {
  readonly selector: Extract<PolicyCommandRequest, { readonly mode: "run" }>["selector"];
  readonly scope: PolicyScopeResolution;
  readonly tier: PolicyRunPlan["tier"];
  readonly strictScope: boolean;
}

function scopeManifest(plan: StructurePlanIdentity): StructureScopeManifest {
  return {
    kind: plan.scope.kind,
    label: plan.scope.label,
    tier: plan.tier,
    strict: plan.strictScope,
    requestedPaths: plan.scope.requestedPaths === null ? null : structuredClone(plan.scope.requestedPaths),
    requestedProgramIds: [...plan.scope.requestedProgramIds],
    workspacePackage: plan.scope.workspacePackage === null ? null : { ...plan.scope.workspacePackage },
    projectConfig: plan.scope.projectConfig,
    inventory: structuredClone(plan.scope.inventory),
  };
}

function startManifest(root: string, slot: RunSlot, plan: StructurePlanIdentity): RunManifest {
  return {
    selection: plan.selector,
    scope: scopeManifest(plan),
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
    final: { registered: 0, ran: 0, withheld: 0 },
    incompleteReasons: [],
  };
}

async function loadCorpusWithFailureStub(root: string, request: PolicyCommandRequest, context: () => ProjectContext): Promise<GateCorpus> {
  try {
    return await loadGateCorpus(root);
  } catch (error) {
    if (request.mode === "run" && request.selector.kind === "all") {
      const scope = resolvePolicyScope(root, request.scope, {
        wholeWorkspacePaths: () => context().files.map((file) => repoRel(root, file.getFilePath())),
      });
      const slot = openRunSlot(root, "structure");
      announceRacing(slot);
      writeInFlight(slot, startManifest(root, slot, { selector: request.selector, scope, tier: request.tier, strictScope: request.strictScope }));
    }
    throw error;
  }
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

function renderInspection(plan: PolicyInspectionPlan): string {
  if (plan.json) {
    return `${JSON.stringify(plan, null, 2)}\n`;
  }
  const heading =
    plan.mode === "list" ? `${String(plan.policies.length)} final policies in ${String(plan.families.length)} families` : `policy ${plan.selector.kind}`;
  const rows = plan.policies.map(
    ({ id, family, analysis, execution, authority, severity }) => `${id}\tfamily=${family}\t${analysis}/${execution}\t${authority}/${severity}`,
  );
  return `${heading}\n${rows.join("\n")}\n`;
}

function selectedCorpus(corpus: GateCorpus, plan: PolicyRunPlan): SelectedGateCorpus {
  const selectedIds = new Set(plan.policyIds);
  return { gates: corpus.gates.filter(({ id }) => selectedIds.has(id)) };
}

function planningFailure(result: { readonly exitCode: 2 | 3; readonly message: string }): number {
  if (result.exitCode === EXIT.misuse) {
    throw new UsageError(tailRefusal(result.message));
  }
  process.stderr.write(`check:structure: TOOL ERROR — ${result.message}\n`);
  return EXIT.toolError;
}

function parseStructurePolicyCommand(argv: readonly string[]): PolicyCommandRequest {
  const parsed = parsePolicyCommand(argv);
  if (!parsed.ok) {
    throw new UsageError(tailRefusal(parsed.message));
  }
  return parsed.request;
}

/** The single invocation: load the corpus, build ONE Project, run the dispatcher, render it, write the ONE
 *  JSON, and RETURN the 0/1/2 verdict (2 when a policy threw, refused a receipt, or the run did not
 *  reconcile; 1 on a blocking finding/alarm; 0 clean). The cli's
 *  `runTool` sets `process.exitCode` from it — never `process.exit`, which drops the buffered stdout write below
 *  and truncates a large report mid-line (the fixture-run report the check-gates anti-drift test parses). */
export async function runStructure(root: string, argv: readonly string[]): Promise<number> {
  const tombstone = parseStructureTombstone(argv);
  if (tombstone !== null) {
    return tombstoneSlot(root, tombstone);
  }
  const command = parseStructurePolicyCommand(argv);
  let cachedContext: ProjectContext | undefined;
  const context = (): ProjectContext => {
    cachedContext ??= projectCtx(root);
    return cachedContext;
  };
  const corpus = await loadCorpusWithFailureStub(root, command, context);
  const planned = planPolicyArgv(root, argv, corpus, {
    wholeWorkspacePaths: () => context().files.map((file) => repoRel(root, file.getFilePath())),
    executionWorkspacePaths: () => context().files.map((file) => repoRel(root, file.getFilePath())),
    deferResourceFailuresToExecution: true,
  });
  if (!planned.ok) {
    return planningFailure(planned);
  }
  if (planned.plan.mode !== "run") {
    process.stdout.write(renderInspection(planned.plan));
    return EXIT.clean;
  }
  const plan = planned.plan;
  const selected = selectedCorpus(corpus, plan);
  const slot = openRunSlot(root, "structure");
  announceRacing(slot);
  const started = startManifest(root, slot, plan);
  writeInFlight(slot, started);

  const ctx = context();
  // #2069 sample ONE: the tree as it stood when this run took its fileset.
  const plantedAtStart = plantedPaths(root);
  const executed = executePolicyPlan({ root, project: ctx.project, corpus, plan, reviewedGrants: reviewedGrantsFor(corpus.gates) });
  if (!executed.ok) {
    process.stderr.write(`check:structure: TOOL ERROR — ${executed.message}\n`);
    closeRunSlot(slot);
    return EXIT.toolError;
  }
  const executedPass: PolicyPassResult = keepProbeFindings() ? executed.pass : stripProbePolicyFindings(executed.pass);
  const final = finalSide(selected.gates, executedPass);
  // #2069 sample TWO: a plant that opened AFTER the project was built still poisons every fs-reading policy.
  const observed = keepProbeFindings() ? [] : [...new Set([...plantedAtStart, ...plantedPaths(root)])].toSorted();

  // An UNTIMED policy rides the same class as a SHORT run (lib/timing.ts): both leave a report that looks
  // complete while a fact the artifact promises is silently absent.
  const incompleteReasons = [
    ...reconcile(corpus, selected, final.rows),
    ...notQuietReasons(observed),
    // A corpus with no policy owes no ledger; one WITH a policy owes the whole one.
    ...(final.result === null ? [] : policyTimingAlarms(final.rows, final.result.timing)),
  ];
  // ANNOTATED LOCAL, not a bare `final.result`: biome's type service resolves the imported `FinalSide`'s
  // nullable member as always-present and reds every `?.`/`??` below as an unnecessary condition, while tsc
  // reads the same union correctly. Re-stating the type here restores the union for both readers without a
  // suppression and without weakening the guard (the house answer for biome's cross-module narrowing).
  const finalResult: PolicyPassResult | null = final.result;
  const reconciliation = structureCountReconciliation(final.rows, final.report);
  const total = reconciliation.blocking;
  // Every count below is a denominator over what this run was ASKED about. On the default run the selection
  // IS the corpus, so the numbers are byte-identical to the pre-#1964 manifest.
  const nonVerdict = nonVerdictReason(keepProbeFindings(), observed);
  const run: RunManifest = {
    ...started,
    quiet: observed.length === 0,
    verdict: nonVerdict === null ? "verdict" : "non-verdict",
    nonVerdictReason: nonVerdict,
    finishedAt: new Date().toISOString(),
    complete: true,
    corpusFiles: corpus.files.length,
    registered: selected.gates.length,
    unregistered: corpus.unregistered,
    active: selected.gates.length,
    ran: final.rows.length,
    final: { registered: selected.gates.length, ran: final.rows.length, withheld: finalResult?.authority.withheldPolicyIds.length ?? 0 },
    incompleteReasons,
  };

  // THE ONE console write — the text is composed in lib/structure-console.ts and lands here, once.
  const broken = incompleteReasons.length > 0 || (final.result !== null && finalToolErrorCount(final.result) > 0);
  const report: StructureReport = {
    run,
    gates: final.rows,
    policy: final.report,
    reconciliation,
    total,
    ok: total === 0 && !broken,
  };
  process.stdout.write(
    plan.json ? `${JSON.stringify(report, null, 2)}\n` : structureConsole({ selected, final, reconciliation, run, slotRelDir: slot.relDir }),
  );
  writeReport(slot, report);
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
  finishSlot(root, slot, run);

  // A short run, an untimed policy, a contaminated tree and a refused owner ride the SAME severity: in all of
  // them the run is not a verdict. The dispatcher's own exit rule has ONE home (`policyPassExitCode`, the
  // planner's) and is composed here with the run-completeness verdict, never re-spelled.
  const dispatcherExit = final.result === null ? EXIT.clean : policyPassExitCode(final.result);
  return Math.max(incompleteReasons.length > 0 ? EXIT.toolError : EXIT.clean, dispatcherExit);
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
function finishSlot(root: string, slot: RunSlot, run: RunManifest): void {
  if (run.scope.kind === "whole" && run.selection.kind === "all" && run.verdict === "verdict") {
    publishRunSlot(root, slot, [{ alias: STRUCTURE_REPORT_NAME, target: STRUCTURE_REPORT_NAME }]);
    return;
  }
  closeRunSlot(slot);
}
