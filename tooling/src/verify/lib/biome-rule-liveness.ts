// The RULE half of `biome-grant-liveness` (#1158): a `biome.json` override row that turns a rule OFF for
// named files is a promise that those files WOULD violate it — path liveness proves the subject exists,
// never that the rule still fires. This module answers the only question that can: strip the rule-off
// grants from a COPY of biome.json, run the real biome binary over the granted files, and read which
// grants suppressed nothing. Refuses LOUDLY (throws ⇒ exit 2) rather than calling a grant dead on a run
// it could not trust — a truncated, unparseable or config-broken report is "I could not measure".
import { existsSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { runNicedSync } from "../../_shared/proc.ts";

/** The probe config lives AT THE REPO ROOT, never in a temp dir. MEASURED 2026-09-02: with
 *  `--config-path` pointing outside the repo, biome moves its PROJECT ROOT to the config's directory —
 *  `noUndeclaredDependencies` then reports "no package.json file was found" and overrides re-scope, so the
 *  run answers a different question while looking healthy. THIS IS THE ONE SURVIVING `__g_` WRITER in the
 *  repo (#2176 Phase F, 2026-09-14): the legacy gate self-test's planters that minted the namespace are
 *  deleted, and the surviving `__g_` negation in `biome.json` plus the `__g_` ignore in `.gitignore` exist
 *  for this probe alone.
 *  The `__g_` prefix is already negated in
 *  biome.json's own `files.includes`, so a concurrent lint can never see this file. */
const PROBE_PREFIX = "__g_biome-rule-liveness.";
const PROBE_SUFFIX = ".json";
const BIOME_BIN = join("node_modules", ".bin", "biome");
/** biome exits 0 (clean) or 1 (diagnostics). Anything else is the tool failing, not a verdict. */
const LINT_EXIT_CLEAN = 0;
const LINT_EXIT_DIAGNOSTICS = 1;
/** The JSON report of ~30 lint-heavy files runs to a few hundred KB; the default 1MB pipe truncates. */
const STDOUT_BUFFER_BYTES = 64_000_000;
const OFF = "off";
const NEGATION_PREFIX = "!";

/** ONE rule-off grant: the (override row × rule) pair, which is the unit the config AUTHORS.
 *  DECLARED LIMIT — a row granting one rule over five files is judged as one grant: it is dead only when
 *  the rule fires on NONE of them. The per-file half is counted (`deadFilePairs`) and printed, never
 *  reported, because reporting it would force splitting a multi-file row into per-file rows. */
export interface RuleGrant {
  readonly group: string;
  readonly rule: string;
  /** The row's file-exact subjects that are actually on the tree (a missing one is the DEAD-PATH arm's). */
  readonly files: readonly string[];
  /** The row's first exact include — where the finding anchors in biome.json. */
  readonly anchor: string;
}

export interface RuleLivenessOutcome {
  readonly dead: readonly RuleGrant[];
  readonly live: number;
  /** Distinct files handed to biome — the arm's denominator. */
  readonly filesProbed: number;
  /** (file × rule) pairs judged, and the subset that fired nowhere (the declared-limit receipt). */
  readonly filePairs: number;
  readonly deadFilePairs: number;
  /** Rule-off grants on rows that ALSO carry a glob include — stripped, never judged (declared limit). */
  readonly skippedMixed: number;
}

/** biome's `--reporter=json` payload, narrowed to what this arm reads. `location.path` is a STRING. */
interface BiomeDiagnostic {
  readonly category?: string;
  readonly location?: { readonly path?: string };
}

interface BiomeReport {
  /** `changed + unchanged` is biome's PROCESSED-FILE count — the same number the text reporters print as
   *  `Checked N files` (#1245). Zero over a non-empty file list means biome applied no config at all. */
  readonly summary: { readonly diagnosticsNotPrinted?: number; readonly changed?: number; readonly unchanged?: number };
  readonly diagnostics: readonly BiomeDiagnostic[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function levelOf(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return isRecord(value) && typeof value["level"] === "string" ? value["level"] : undefined;
}

/** Strip the rule-off entries of ONE rule group, returning the rules it carried. Mutates `members`. */
function stripGroup(members: Record<string, unknown>): string[] {
  const stripped: string[] = [];
  for (const [rule, value] of Object.entries(members)) {
    if (levelOf(value) === OFF) {
      delete members[rule];
      stripped.push(rule);
    }
  }
  return stripped;
}

/** The exact-path includes of ONE override row that are actually on the tree. */
function exactIncludes(override: Record<string, unknown>, isExactPath: (include: string) => boolean): string[] {
  const includes = Array.isArray(override["includes"]) ? override["includes"] : [];
  return includes.filter((entry): entry is string => typeof entry === "string" && !entry.startsWith(NEGATION_PREFIX) && isExactPath(entry));
}

function overrideRules(override: Record<string, unknown>): Record<string, unknown> {
  const linter = isRecord(override["linter"]) ? override["linter"] : {};
  return isRecord(linter["rules"]) ? linter["rules"] : {};
}

/** Every positive include of a row that is NOT file-exact — a GLOB, whose members this arm cannot enumerate. */
function hasGlobInclude(override: Record<string, unknown>, isExactPath: (include: string) => boolean): boolean {
  const includes = Array.isArray(override["includes"]) ? override["includes"] : [];
  return includes.some((entry) => typeof entry === "string" && !entry.startsWith(NEGATION_PREFIX) && !isExactPath(entry));
}

/** The rule-off grants of ONE override row. ALWAYS strips (that keeps a glob row from masking an exact
 *  row's rule and turning a live grant into a false DEAD); JUDGES only rows whose every positive include
 *  is file-exact. A MIXED row (`**\/*.config.ts` beside five named files) is skipped and counted:
 *  its subject set is the glob's expansion, so "the rule fired on none of the named files" says NOTHING
 *  about the row. Stripping everything is the PERMISSIVE direction on purpose — a file suppressed twice
 *  reads as live rather than as a grant to delete. */
function grantsOfOverride(
  override: Record<string, unknown>,
  root: string,
  isExactPath: (include: string) => boolean,
): { readonly grants: RuleGrant[]; readonly skippedMixed: number } {
  const exact = exactIncludes(override, isExactPath);
  const anchor = exact[0];
  const rules = overrideRules(override);
  const judgeable = anchor !== undefined && !hasGlobInclude(override, isExactPath);
  const live = exact.filter((rel) => existsSync(join(root, rel)));
  const grants: RuleGrant[] = [];
  let skippedMixed = 0;
  for (const [group, members] of Object.entries(rules)) {
    if (!isRecord(members)) {
      continue;
    }
    for (const rule of stripGroup(members)) {
      if (anchor === undefined) {
        continue; // a glob-only row: stripped so it cannot mask another row, but it grants no named file
      }
      if (judgeable) {
        grants.push({ group, rule, files: live, anchor });
      } else {
        skippedMixed += 1;
      }
    }
    if (Object.keys(members).length === 0) {
      delete rules[group];
    }
  }
  return { grants, skippedMixed };
}

/** Strip every rule-off entry the config carries, collecting the JUDGEABLE grants as it goes. The config
 *  passed in is MUTATED — callers hand it a fresh parse of biome.json's text. */
function stripRuleOffGrants(
  config: unknown,
  root: string,
  isExactPath: (include: string) => boolean,
): { readonly grants: readonly RuleGrant[]; readonly skippedMixed: number } {
  const overrides = isRecord(config) && Array.isArray(config["overrides"]) ? config["overrides"] : [];
  const rows = overrides.filter(isRecord).map((override) => grantsOfOverride(override, root, isExactPath));
  return { grants: rows.flatMap((row) => row.grants), skippedMixed: rows.reduce((total, row) => total + row.skippedMixed, 0) };
}

/** Is the process that owns this probe still alive? `kill(pid, 0)` tests for existence without signalling;
 *  EPERM means a live process this UID does not own, which is still ALIVE and still not ours to delete. */
function probeOwnerIsAlive(name: string): boolean {
  const pid = Number(name.slice(PROBE_PREFIX.length, -PROBE_SUFFIX.length));
  if (!(Number.isInteger(pid) && pid > 0)) {
    return false;
  }
  // @orb-waive caught-failure-ownership(error): EPERM alone means a LIVE process this UID may not signal — still alive, still not ours to sweep; every other errno (ESRCH, a malformed pid) means the owner is gone and its probe is ours to clear. Ends if the probe name stops carrying its owner's pid.
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** A leftover probe config means a previous run was KILLED mid-flight (OOM, timeout). Sweep them before
 *  writing ours: the `finally` below cannot run for a process that never returned.
 *
 *  ONLY the ones whose OWNER IS DEAD. The probe name carries its pid precisely so this is answerable, and
 *  an unconditional sweep deletes a CONCURRENT sibling's config out from under its running biome — the
 *  sibling then lints against a vanished `--config-path` and reports a verdict about a different question,
 *  or reds on load. Same disease as a `tmpdir()` census that answers a question about the BOX: a
 *  cross-process namespace needs a per-process predicate, or the instrument reds on LOAD rather than on a
 *  defect (measured on `ops/policy-conformance.ts` the same day, #1584 lane p-verify-instruments). */
function sweepStaleProbes(root: string): void {
  for (const name of readdirSync(root)) {
    if (!(name.startsWith(PROBE_PREFIX) && name.endsWith(PROBE_SUFFIX))) {
      continue;
    }
    if (!probeOwnerIsAlive(name)) {
      unlinkSync(join(root, name));
    }
  }
}

function runBiomeJson(root: string, configRel: string, files: readonly string[]): string {
  const bin = join(root, BIOME_BIN);
  if (!existsSync(bin)) {
    throw new Error(
      `biome-grant-liveness rule arm: the biome binary is not at ${BIOME_BIN} — the rule-liveness question is UNANSWERABLE, and a green here would claim every rule-off grant is live without running anything. Run pnpm install (a worktree needs pnpm worktree:bootstrap).`,
    );
  }
  const args = ["check", ...files, "--config-path", configRel, "--reporter=json", "--diagnostic-level=warn"];
  // stderr is CAPTURED (runNicedSync's collect mode), never inherited: biome prints an "--json is unstable"
  // banner on every run and it would land in the middle of the gate harness's own report.
  const res = runNicedSync(bin, args, { cwd: root, maxBuffer: STDOUT_BUFFER_BYTES });
  if (res.status === LINT_EXIT_CLEAN || res.status === LINT_EXIT_DIAGNOSTICS) {
    return res.stdout;
  }
  const stderr = res.stderr.trim();
  throw new Error(
    `biome-grant-liveness rule arm: biome exited outside its lint contract (expected ${String(LINT_EXIT_CLEAN)} or ${String(LINT_EXIT_DIAGNOSTICS)}, got ${String(res.status)}) — the run is NOT a verdict.${stderr === "" ? "" : `\n${stderr}`}`,
  );
}

function parseReport(stdout: string): BiomeReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error("biome-grant-liveness rule arm: biome's --reporter=json output did not parse — the run is NOT a verdict.", { cause: error });
  }
  const shaped = isRecord(parsed) && isRecord(parsed["summary"]) && Array.isArray(parsed["diagnostics"]);
  if (!shaped) {
    throw new Error(
      "biome-grant-liveness rule arm: biome's JSON report carries no `summary`/`diagnostics` — the reporter shape changed, so the run is NOT a verdict.",
    );
  }
  return parsed as unknown as BiomeReport;
}

/** Which (file, rule) pairs actually produced a diagnostic under the stripped config. */
function firedPairs(report: BiomeReport): ReadonlySet<string> {
  const notPrinted = report.summary.diagnosticsNotPrinted ?? 0;
  if (notPrinted > 0) {
    throw new Error(
      `biome-grant-liveness rule arm: biome TRUNCATED its report (${String(notPrinted)} diagnostics not printed) — every grant whose diagnostics fell off the end would read as DEAD, so this run is NOT a verdict.`,
    );
  }
  const fired = new Set<string>();
  for (const diagnostic of report.diagnostics) {
    const category = diagnostic.category ?? "";
    if (!category.startsWith("lint/")) {
      throw new Error(
        `biome-grant-liveness rule arm: biome emitted a non-lint diagnostic (${category}) — the probe config is broken, so the run is NOT a verdict.`,
      );
    }
    const file = diagnostic.location?.path;
    if (typeof file === "string") {
      fired.add(`${file} ${category.slice(category.lastIndexOf("/") + 1)}`);
    }
  }
  return fired;
}

/** THE ZERO-MEASUREMENT REFUSAL (#1245). A biome run that processed NO files produces an empty diagnostic
 *  list — which is byte-identical to "every rule-off grant is dead" and would red the gate over the whole
 *  config. It is exactly what a config biome could not parse looks like (a JSONC comment before an element
 *  of an array does it, with no diagnostic at any level), and the probe config is written by THIS module,
 *  so a shape bug here is a live cause, not a hypothetical. Asked only when there are no diagnostics at
 *  all: a single diagnostic proves files were processed, and the hand-built report fixtures that carry one
 *  stay judgeable without restating biome's whole summary. */
function refuseEmptyMeasurement(grants: readonly RuleGrant[], report: BiomeReport): void {
  const expected = new Set(grants.flatMap((grant) => grant.files)).size;
  if (expected === 0 || report.diagnostics.length > 0) {
    return;
  }
  const processed = (report.summary.changed ?? 0) + (report.summary.unchanged ?? 0);
  if (processed === 0) {
    throw new Error(
      `biome-grant-liveness rule arm: biome processed 0 of ${String(expected)} probe files — the probe config was not applied (a config biome cannot parse reads EXACTLY like this, silently). Every grant would read DEAD, so this run is NOT a verdict.`,
    );
  }
}

/** The pure half: which grants did the stripped run leave unfired? Split out so the truncation and
 *  broken-config refusals are pinnable without spawning biome. */
export function judgeReport(grants: readonly RuleGrant[], stdout: string): { readonly dead: readonly RuleGrant[]; readonly deadFilePairs: number } {
  const report = parseReport(stdout);
  // ORDER: truncation and non-lint diagnostics are diagnosed by `firedPairs` FIRST — each names a more
  // specific cause than "0 files processed", and a truncated report can also be an empty one.
  const fired = firedPairs(report);
  refuseEmptyMeasurement(grants, report);
  const dead: RuleGrant[] = [];
  let deadFilePairs = 0;
  for (const grant of grants) {
    const hits = grant.files.filter((rel) => fired.has(`${rel} ${grant.rule}`));
    deadFilePairs += grant.files.length - hits.length;
    if (hits.length === 0) {
      dead.push(grant);
    }
  }
  return { dead, deadFilePairs };
}

/** biome.json's own text, or this module's refusal shape (#2172).
 *
 *  The exit CLASS was already right — a thrown `SyntaxError` reaches `run-tool.ts` as exit 2 — but the
 *  MESSAGE was V8's: `Expected property name or '}' in JSON at position 2`, naming neither `biome.json`,
 *  nor the arm, nor "NOT a verdict", while every other refusal in this module states all three. An operator
 *  reading a bare parse error has to guess which of the run's several JSON reads produced it; the probe
 *  config this arm writes is itself JSON, so the guess is not obvious.
 *
 *  The original error rides `cause`, so the position information is not lost — only unhandled.
 *
 *  NO `@orb-waive caught-failure-ownership` MARKER BELONGS HERE, and one was deleted from this spot
 *  (#2196). `{ cause }` chaining IS ownership in the shared reader's vocabulary (lib/caught-failure.ts),
 *  so this `catch` is not a caught-failure SITE at all: the derived census
 *  (docs/reviews/caught-failure-ownership/population.json) holds exactly one row for this module, the
 *  EPERM absorb in `isDeadProbe`, and never this one. The marker waived nothing. It still ALARMED —
 *  `unbound-trivia`, because the engine found no finding inside the marker's carrier and then matched its
 *  `error` position against that other site's finding elsewhere in the file. Relocating it (the obvious
 *  repair) would have been worse than deleting it: the only occurrence it could reach already carries its
 *  own waiver, so the pair would report `duplicate-target` instead. */
function parseConfigOrRefuse(configText: string): unknown {
  try {
    return JSON.parse(configText);
  } catch (error) {
    throw new Error("biome-grant-liveness rule arm: biome.json did not parse as JSON, so no grant could be read — the run is NOT a verdict.", { cause: error });
  }
}

/** Run the whole arm. THROWS (⇒ exit 2) on every shape it cannot trust; never returns a clean zero. */
export function judgeRuleLiveness(input: {
  readonly root: string;
  readonly configText: string;
  readonly isExactPath: (include: string) => boolean;
}): RuleLivenessOutcome {
  const config: unknown = parseConfigOrRefuse(input.configText);
  const { grants, skippedMixed } = stripRuleOffGrants(config, input.root, input.isExactPath);
  const files = [...new Set(grants.flatMap((grant) => grant.files))].sort();
  const filePairs = grants.reduce((total, grant) => total + grant.files.length, 0);
  if (files.length === 0) {
    // EVERY GRANTED SUBJECT HAS VANISHED — and that is a VERDICT, not a refusal (#2171).
    //
    // This arm used to return `live: grants.length` here, so the operator line read
    // `N live · 0 dead … over 0 probed file(s)`: a LIVE count for grants nothing had measured, which is the
    // false-clean shape this module's own doctrine names everywhere else.
    //
    // WHY DEAD RATHER THAN A REFUSAL, since the row offered both and they are not equivalent. The
    // measurement ALREADY HAPPENED: `grant.files` is `exactIncludes(...).filter(existsSync)`, so an empty
    // set is `existsSync` answering NO for every exact include on a judgeable row — evidence of absence,
    // not absence of evidence. A grant whose files are all gone has nothing left to suppress, which is
    // precisely what `dead` means in every other branch of this arm, and the remedy is the same one a dead
    // grant always gets: delete the row.
    //
    // AND THE MODULE ALREADY SEPARATES THE TWO ZEROS — collapsing them would destroy that.
    // `refuseEmptyMeasurement` refuses when biome processed 0 of N **expected** files, because a config
    // biome cannot parse reads EXACTLY like a clean sweep and the arm genuinely cannot tell. Here N is 0
    // because nothing was expected. Refusing would be exit-2 (a TOOL ERROR that blocks `pnpm check`) over a
    // condition with a determinate answer and an author-side fix, which is the opposite error from the one
    // the row reports.
    //
    // `grants.length === 0` stays honest on its own: no grants, nothing dead, nothing live.
    return { dead: [...grants], live: 0, filesProbed: 0, filePairs, deadFilePairs: filePairs, skippedMixed };
  }
  sweepStaleProbes(input.root);
  const probeRel = `${PROBE_PREFIX}${String(process.pid)}${PROBE_SUFFIX}`;
  const probeAbs = join(input.root, probeRel);
  try {
    writeFileSync(probeAbs, JSON.stringify(config));
    const judged = judgeReport(grants, runBiomeJson(input.root, probeRel, files));
    return {
      dead: judged.dead,
      live: grants.length - judged.dead.length,
      filesProbed: files.length,
      filePairs,
      deadFilePairs: judged.deadFilePairs,
      skippedMixed,
    };
  } finally {
    if (existsSync(probeAbs)) {
      unlinkSync(probeAbs);
    }
  }
}
