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
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import type { RunSlot } from "@orb/tooling/_shared/artifacts";
import { checkoutName, openRunSlot, publishRunSlot } from "@orb/tooling/_shared/artifacts";
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
import type { FinalPolicyRow, LegacyGateRow, StructurePolicyReport, StructureReport } from "../contract/structure-report.ts";
import { loadMixedGateCorpus } from "../lib/loader.ts";
import { projectCtx, runPass, stripProbeFindings, stripProbePolicyFindings, zeroScanGates } from "../lib/pass.ts";
import { notQuietReasons, plantedPaths } from "../lib/planted-fixtures.ts";
import { buildSelector, CHECK_FLAG, FAIL_ON_WARNINGS_FLAG, FAMILY_FLAG, isSelectionRefusal, refuseDuplicateOptions } from "../lib/policy-command.ts";
import { runPolicyPass } from "../lib/policy-pass.ts";
import { policyPassExitCode } from "../lib/policy-plan.ts";
import { isSelectionFailure, resolveMixedSelection } from "../lib/policy-selection.ts";
import { populationAlarms } from "../lib/population.ts";
import { renderPass, renderPolicyPass } from "../lib/render.ts";
import { reviewedGrantsFor } from "../lib/reviewed-grants.ts";
import { finalToolErrorCount, policyReport, policyRows } from "../lib/structure-report.ts";
import { policyTimingAlarms, policyTimingLine, timingAlarms, timingLine } from "../lib/timing.ts";

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

/** The artifact's name — inside this run's slot, and the published pointer's basename (#1029). */
const REPORT_NAME = "check-structure.json";

/** Write into THIS RUN'S slot. Never the published path: `reports/check-structure.json` is a symlink
 *  publishRunSlot swaps in at completion, so no in-flight write can ever be read as somebody's verdict. */
function writeReport(slot: RunSlot, report: StructureReport): void {
  writeFileSync(join(slot.dir, REPORT_NAME), `${JSON.stringify(report, null, 2)}\n`);
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
    process.stderr.write(`[check:structure] this run writes to ${slot.relDir} and publishes reports/${REPORT_NAME} only if it finishes last.\n`);
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

interface FinalSide {
  readonly result: PolicyPassResult | null;
  readonly rows: readonly FinalPolicyRow[];
  readonly report: StructurePolicyReport | null;
}

function finalSide(selectedFinal: readonly GatePolicy[], result: PolicyPassResult | null): FinalSide {
  if (result === null) {
    return { result, rows: [], report: null };
  }
  return { result, rows: policyRows(result, selectedFinal), report: policyReport(result) };
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
  const legacyRows = toLegacyRows(pass, gatesByName);
  const legacyTotal = legacyRows.reduce((n, g) => n + g.violations.length, 0);
  const finalBlocking = final.result?.authority.verdict.blocking ?? 0;
  const total = legacyTotal + finalBlocking;
  const scanAlarms = zeroScanGates(pass);
  const populations = populationAlarms(pass);
  // Every count below is a denominator over what this run was ASKED about. On the default run the selection
  // IS the corpus, so the numbers are byte-identical to the pre-#1964 manifest.
  const legacyActive = selected.legacy.filter((g) => g.status === "active").length;
  const run: RunManifest = {
    ...started,
    quiet: observed.length === 0,
    finishedAt: new Date().toISOString(),
    complete: true,
    corpusFiles: corpus.files.length,
    registered: selected.legacy.length + selected.final.length,
    unregistered: corpus.unregistered,
    active: legacyActive + selected.final.length,
    ran: pass.gates.length + final.rows.length,
    legacy: { registered: selected.legacy.length, active: legacyActive, ran: pass.gates.length },
    final: { registered: selected.final.length, ran: final.rows.length, withheld: final.result?.authority.withheldPolicyIds.length ?? 0 },
    incompleteReasons,
  };

  // zeroScanAlarm is set HERE and nowhere else: this is the only entrypoint whose fileset is the real
  // whole tree, so it is the only one where "this gate read nothing" means the checker is blind.
  process.stdout.write(renderPass(pass, gatesByName, { zeroScanAlarm: true }));
  if (final.report !== null) {
    process.stdout.write(`\n${renderPolicyPass(final.rows, final.report, selected.final)}`);
  }
  process.stdout.write(`\n${completenessLine(run)}\n`);
  process.stdout.write(`${timingLine(pass.timing, pass.gates, `${slot.relDir}/${REPORT_NAME}`)}\n`);
  if (final.result !== null) {
    process.stdout.write(`${policyTimingLine(final.result.timing, final.rows)}\n`);
  }

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
  if (request.selection.kind === "all") {
    publishRunSlot(root, slot, [{ alias: REPORT_NAME, target: REPORT_NAME }]);
  }

  // A short run, a blind gate, a refused POPULATION receipt, a thrown gate and a refused final owner ride the SAME
  // severity: in all of them the run is not a verdict. The final side's exit rule has ONE home
  // (`policyPassExitCode`, the planner's) and is composed here by max, never re-spelled.
  const finalExit = final.result === null ? EXIT.clean : policyPassExitCode(final.result);
  return Math.max(legacyExit(legacyBroken, legacyTotal), finalExit);
}

/** The legacy side's exit under the unchanged contract: a broken run outranks a verdict, a verdict outranks clean. */
function legacyExit(broken: boolean, violations: number): number {
  if (broken) {
    return EXIT.toolError;
  }
  return violations > 0 ? EXIT.violations : EXIT.clean;
}

/** What the operator asked for. `selection.kind === "all"` is the shipped default and the ONLY shape that
 *  publishes the pointer; `failOnWarnings` DEFAULTS FALSE (runFinalPass's header). */
interface StructureRequest {
  readonly failOnWarnings: boolean;
  readonly selection: PolicySelector;
}

const TAIL_OPTIONS = {
  "fail-on-warnings": { type: "boolean" },
  check: { type: "string", multiple: true },
  family: { type: "string", multiple: true },
} as const;
/** `--check`/`--family` are the repeatable pair; `--fail-on-warnings` twice stays misuse (the grammar is zero
 *  or one), which is exactly `refuseDuplicateOptions`'s contract. */
const REPEATABLE_TAIL_OPTIONS: ReadonlySet<string> = new Set(["check", "family"]);

/** THIS VERB'S WHOLE TAIL GRAMMAR (lib/verb-tail.ts rules it "own"): zero or one `--fail-on-warnings`, plus a
 *  repeatable `--check` OR `--family` selection.
 *
 *  Every token is imported from `lib/policy-command.ts`, the final-policy grammar that already owns them —
 *  this door is a second REACH, never a second spelling, and the selector rules (ambiguity, nonempty,
 *  duplicate, kebab-case) come from that module's `buildSelector` rather than being re-decided here. Anything
 *  else is misuse (exit 3) refused BEFORE the run slot opens, so a typo can never leave an in-flight artifact
 *  behind: the whole point of #1117 is that a verb which swallows an unread tail reports a verdict nobody
 *  asked for, and the verdicts here are opposite in two directions (promoted warnings block; a SELECTED run
 *  is not the corpus verdict at all). */
function parseStructureTail(argv: readonly string[]): StructureRequest {
  const duplicate = refuseDuplicateOptions(argv, REPEATABLE_TAIL_OPTIONS);
  if (duplicate !== null) {
    throw new UsageError(tailRefusal(duplicate));
  }
  let values: { readonly "fail-on-warnings"?: boolean; readonly check?: readonly string[]; readonly family?: readonly string[] };
  try {
    values = parseArgs({ args: [...argv], options: TAIL_OPTIONS, strict: true, allowPositionals: false }).values;
  } catch (error) {
    throw new UsageError(tailRefusal(error instanceof Error ? error.message : String(error)), { cause: error });
  }
  const selection = buildSelector(values.check, values.family);
  if (isSelectionRefusal(selection)) {
    throw new UsageError(tailRefusal(selection.message));
  }
  return { failOnWarnings: values["fail-on-warnings"] === true, selection };
}

/** ONE refusal shape for every way this tail can be wrong. It LEADS with the whole grammar rather than with
 *  `parseArgs`'s bare "Unknown option", because an operator who typed the near-miss needs the legal set — and
 *  because the sentence `structure takes at most --fail-on-warnings` is the literal the #1117 pins were
 *  written against (tests/tooling/verify/cli.int.test.ts, ops/warning-promotion.suite.int.test.ts): it stays
 *  true and stays a prefix as the grammar grows, so widening the tail never silently retires those pins. */
function tailRefusal(reason: string): string {
  return `structure takes at most ${FAIL_ON_WARNINGS_FLAG}, ${CHECK_FLAG} <id> or ${FAMILY_FLAG} <name> — ${reason}\n${STRUCTURE_USAGE}`;
}

/** This verb's usage line — ONE home, read by the tail refusal above and by the front door's pre-dispatch
 *  `--help` answer (cli.ts VERB_HELP, #809). */
export const STRUCTURE_USAGE =
  `usage: node tooling/src/verify/cli.ts structure [${FAIL_ON_WARNINGS_FLAG}] [${CHECK_FLAG} <id>]... | [${FAMILY_FLAG} <name>]...\n` +
  "  Runs every structural gate in one ts-morph pass; writes reports/check-structure.json (read it with `show`).\n" +
  `  ${FAIL_ON_WARNINGS_FLAG} promotes final \`severity: "warning"\` findings into the blocking count (exit 1). It is OFF by default: a warning is reported, counted, and blocks nothing.\n` +
  `  ${CHECK_FLAG} <id> runs ONLY the named gate(s) — a legacy gate name or a final policy id — over the SAME whole real tree. ${FAMILY_FLAG} <name> does the same for a final policy family; the two are mutually exclusive.\n` +
  "  A selected run is NOT the corpus verdict: it reports only what it was asked about and does NOT republish reports/check-structure.json, so read the slot path it prints.";

/** The visible half of the #410 guarantee: the console says how many of the corpus actually ran, per contract. */
function completenessLine(run: RunManifest): string {
  const split = `${run.legacy.ran}/${run.legacy.active} legacy · ${run.final.ran}/${run.final.registered} final`;
  if (run.selection.kind !== "all") {
    // A selected run's own line says what it is NOT, in the same place a reader looks for the verdict.
    return [
      `single-pass: SELECTED RUN (--${run.selection.kind} ${run.selection.names.join(`, --${run.selection.kind} `)}) — ran ${run.ran}/${run.active} selected gate(s) (${split}) of ${run.corpusFiles} corpus file(s)`,
      `  this is NOT a whole-corpus verdict and reports/${REPORT_NAME} was NOT republished — read ${run.artifactDir}/${REPORT_NAME}`,
      ...(run.incompleteReasons.length === 0 ? [] : ["  the SELECTED run is itself INCOMPLETE:", ...run.incompleteReasons.map((r) => `  ‼ ${r}`)]),
    ].join("\n");
  }
  if (run.incompleteReasons.length === 0) {
    return `single-pass: ran ${run.ran}/${run.active} active gate(s) (${split}) of ${run.corpusFiles} corpus file(s) — run COMPLETE (run ${run.runId} → ${run.artifactDir}/${REPORT_NAME})`;
  }
  return [
    `single-pass: run INCOMPLETE — the report is NOT a verdict (run ${run.runId}; ${split}):`,
    ...run.incompleteReasons.map((r) => `  ‼ ${r}`),
    "  See tooling/src/verify/contract/run-manifest.ts (#410).",
  ].join("\n");
}
