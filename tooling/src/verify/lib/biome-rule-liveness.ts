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
 *  run answers a different question while looking healthy. The `__g_` prefix is already negated in
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

/** A leftover probe config means a previous run was KILLED mid-flight (OOM, timeout). Sweep them before
 *  writing ours: the `finally` below cannot run for a process that never returned. */
function sweepStaleProbes(root: string): void {
  for (const name of readdirSync(root)) {
    if (name.startsWith(PROBE_PREFIX) && name.endsWith(PROBE_SUFFIX)) {
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

/** Run the whole arm. THROWS (⇒ exit 2) on every shape it cannot trust; never returns a clean zero. */
export function judgeRuleLiveness(input: {
  readonly root: string;
  readonly configText: string;
  readonly isExactPath: (include: string) => boolean;
}): RuleLivenessOutcome {
  const config: unknown = JSON.parse(input.configText);
  const { grants, skippedMixed } = stripRuleOffGrants(config, input.root, input.isExactPath);
  const files = [...new Set(grants.flatMap((grant) => grant.files))].sort();
  const filePairs = grants.reduce((total, grant) => total + grant.files.length, 0);
  if (files.length === 0) {
    return { dead: [], live: grants.length, filesProbed: 0, filePairs, deadFilePairs: 0, skippedMixed };
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
