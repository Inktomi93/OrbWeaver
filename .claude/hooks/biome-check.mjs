#!/usr/bin/env node
// PostToolUse (Edit|Write|MultiEdit): a fast advisory over the checkout that owns the edited file. Biome and
// dep-cruiser stay file-scoped; TypeScript checks the planner's primary program(s). Advisory by owner ruling:
// it never blocks, and every finding or non-verdict exits 0 as PostToolUse additionalContext behind one
// "edit-check:" warning line. A tool error or a skipped leg is a named non-verdict, never a silent pass.
// A red program reports its whole native diagnostic set, program-level errors and then edited files first: no
// pre-edit observation exists to rule an error inherited.
//
// PORTABLE BY CONSTRUCTION: Node only, plus `git` and `pnpm` on PATH. The host-wide admission pool, the
// per-program duplicate suppression and the caps all come from tooling/src/floor/host (the same doors every
// other tool uses); nothing here needs flock, GNU stat, jq, sed or awk.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { setPriority } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const FLOOR_HOST = path.join(import.meta.dirname, "..", "..", "tooling", "src", "floor", "host");
const CHECKED_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json", ".jsonc", ".css"]);
const TYPED_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const DEPCRUISE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]);
const SUPPORTED_TOOLS = new Set(["Edit", "Write", "MultiEdit", "CodexPatch"]);
const HOOK_POOL = "hook";
// Every leg is an advisory beside real work; it yields the CPU to anything the operator is running.
const LEG_NICENESS = 10;
const EXCERPT_LINES = 80;
const TS_DIAGNOSTIC = /\.(ts|tsx|mts|cts)\(\d+,\d+\): error TS\d+/u;
const TS_DIAGNOSTIC_EXCERPT = /[^/\\\n]+\(\d+,\d+\): error TS\d+: .{0,60}/gu;
const TS_LOCATED = /^(.+)\(\d+,\d+\): error (TS\d+): (.*)$/u;
const TS_UNLOCATED = /^error TS\d+: /u;
// tsc's ExitStatus.DiagnosticsPresent_OutputsSkipped: the only non-zero status under --noEmit that is a verdict.
const TSC_DIAGNOSTICS_EXIT = 1;
const UNRECOGNISED_LINES = 10;
const UNRECOGNISED_LINE_CHARS = 200;
const BIOME_NOISE = /^(Checked |Found |check )|Some errors were emitted|^\s*$/u;
// Claude Code caps additionalContext at 10,000 characters and swaps a longer value for a file path and a
// short preview that the model is not asked to read, so the hook bounds the listing itself.
const CONTEXT_LIMIT = 10_000;
const NOT_COMPLETED_LEAD = "edit-check: the edit check was NOT completed — verify this edit with scoped checks before you report";

/** Deliver findings as model context and exit 0. A listing over the cap keeps whole leading lines and states
 *  how many lines it left out, so nothing disappears without a count. */
function report(lead, body) {
  const lines = `${lead}\n${body.replace(/\n*$/u, "")}`.split("\n");
  const tail = (omitted) => `… ${String(omitted)} more line(s) not shown: the listing exceeds the hook context limit. Run the scoped checks for the full list.`;
  let context = lines.join("\n");
  if (context.length > CONTEXT_LIMIT) {
    const kept = [];
    let size = 0;
    for (const line of lines) {
      if (size + line.length + 1 + tail(lines.length).length > CONTEXT_LIMIT) {
        break;
      }
      kept.push(line);
      size += line.length + 1;
    }
    context = [...kept, tail(lines.length - kept.length)].join("\n");
  }
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context } })}\n`);
  process.exit(0);
}

function noticeAndExit(message) {
  report(NOT_COMPLETED_LEAD, `── edit advisory was NOT completed ──\n${message}`);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

// A bounded excerpt that cut lines ends with their count, so a cut never reads as the whole output.
function notShown(omitted) {
  return omitted > 0 ? `… ${String(omitted)} more line(s) not shown\n` : "";
}

function excerpt(text) {
  if (text === "") {
    return "";
  }
  const lines = text.replace(/\n*$/u, "").split("\n");
  return `${lines.slice(0, EXCERPT_LINES).join("\n")}\n${notShown(lines.length - EXCERPT_LINES)}`;
}

function git(cwd, ...args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function realpathOrNull(target) {
  try {
    return realpathSync(target);
  } catch {
    return null;
  }
}

// pnpm prints its OWN install/prepare reporting on STDOUT above the wrapped command's output whenever it
// decides the store needs verifying (measured 2026-09-12: `Scope: all 9 workspace projects … Done in 1.6s
// using pnpm v11.15.1` arrived above well-formed planner JSON). So the payload of a `--json` child begins at
// the first line that opens a JSON object, and an absent payload is a loud non-verdict, never a pass.
function jsonPayload(stdout) {
  const lines = stdout.split("\n");
  const start = lines.findIndex((line) => line.startsWith("{"));
  if (start === -1) {
    return null;
  }
  try {
    return JSON.parse(lines.slice(start).join("\n"));
  } catch {
    return null;
  }
}

/** Spawn `pnpm <args>` in `cwd` at lowered priority and collect both streams separately: a stream that is
 *  parsed must carry only what the parsed tool wrote. */
function runPnpm(cwd, args, env = process.env) {
  return new Promise((resolve) => {
    // Windows ships pnpm as a `.cmd` shim, which Node only spawns through a shell.
    const child = spawn("pnpm", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
    if (child.pid !== undefined) {
      try {
        setPriority(child.pid, LEG_NICENESS);
      } catch {
        // The child already exited, or the platform refused a niceness change: the leg still runs.
      }
    }
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => resolve({ code: null, signal: null, stdout, stderr: `${stderr}${error.message}\n` }));
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function readInput() {
  let raw;
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    noticeAndExit("hook input could not be read");
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    input = null;
  }
  if (!isObject(input) || typeof input.hook_event_name !== "string" || typeof input.tool_name !== "string") {
    noticeAndExit("hook input is malformed: expected an object with string hook_event_name and tool_name");
  }
  if (input.hook_event_name !== "PostToolUse" || !SUPPORTED_TOOLS.has(input.tool_name)) {
    process.exit(0);
  }
  if (!nonEmptyString(input.cwd) || !isObject(input.tool_input)) {
    noticeAndExit("hook input is malformed: a supported PostToolUse file event requires nonempty cwd and tool_input.file_path strings");
  }
  if (input.tool_name === "CodexPatch") {
    if (
      !Array.isArray(input.tool_input.subjects) ||
      !input.tool_input.subjects.every((subject) => isObject(subject) && nonEmptyString(subject.file) && ["present", "deleted"].includes(subject.status))
    ) {
      noticeAndExit("hook input is malformed: CodexPatch requires file subjects with present or deleted status");
    }
    return { cwd: input.cwd, subjects: input.tool_input.subjects };
  }
  if (!nonEmptyString(input.tool_input.file_path)) {
    noticeAndExit("hook input is malformed: a supported PostToolUse file event requires nonempty cwd and tool_input.file_path strings");
  }
  return { cwd: input.cwd, subjects: [{ file: input.tool_input.file_path, status: "claude" }] };
}

/** Every checkout Git registers for the trusted repository, missing ones included, after proving the payload
 *  cwd belongs to that repository. A checkout's `real` path is null when its directory no longer exists. */
function resolveCheckouts(payloadCwd) {
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? "";
  if (projectDir === "") {
    noticeAndExit("CLAUDE_PROJECT_DIR is unset; repository trust boundary cannot be established");
  }
  const top = git(payloadCwd, "rev-parse", "--show-toplevel");
  if (top === null) {
    noticeAndExit(`hook cwd is not inside a Git checkout: ${payloadCwd}`);
  }
  const projectTop = git(projectDir, "rev-parse", "--show-toplevel");
  if (projectTop === null) {
    noticeAndExit(`CLAUDE_PROJECT_DIR is not inside a Git checkout: ${projectDir}`);
  }
  const root = realpathOrNull(top) ?? noticeAndExit(`checkout root cannot be resolved: ${top}`);
  const projectRoot = realpathOrNull(projectTop) ?? noticeAndExit(`project root cannot be resolved: ${projectTop}`);
  const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const projectCommon = git(projectRoot, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (common === null || projectCommon === null) {
    noticeAndExit("checkout Git common directory cannot be resolved");
  }
  const realCommon = realpathOrNull(common);
  const realProjectCommon = realpathOrNull(projectCommon);
  if (realCommon === null || realProjectCommon === null) {
    noticeAndExit("checkout Git common directory cannot be canonicalized");
  }
  if (realCommon !== realProjectCommon) {
    noticeAndExit("hook cwd belongs to a different repository than CLAUDE_PROJECT_DIR");
  }
  const listed = spawnSync("git", ["-C", projectRoot, "worktree", "list", "--porcelain", "-z"], { encoding: "utf8" });
  if (listed.status !== 0) {
    noticeAndExit(`registered checkouts cannot be listed: ${listed.stderr.trim()}`);
  }
  const checkouts = listed.stdout
    .split("\0")
    .filter((field) => field.startsWith("worktree "))
    .map((field) => {
      const registered = field.slice("worktree ".length);
      return { registered, real: realpathOrNull(registered) };
    });
  if (checkouts.length === 0) {
    noticeAndExit("Git listed no checkout for the trusted repository");
  }
  return checkouts;
}

function within(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** The registered checkout that contains a path, by its registered or its real location, and the base it
 *  matched. Lane worktrees nest inside main's tree, so the deepest match owns the path. */
function ownerOf(checkouts, target) {
  let owner = null;
  for (const checkout of checkouts) {
    for (const base of [checkout.registered, checkout.real]) {
      if (base !== null && within(base, target) && (owner === null || base.length > owner.base.length)) {
        owner = { checkout, base };
      }
    }
  }
  return owner;
}

/** The deepest prefix of a path that exists without following its last link, so a dangling or escaping
 *  symlink component is still the prefix that gets resolved. */
function existingPrefix(target) {
  let probe = target;
  for (;;) {
    try {
      lstatSync(probe);
      return probe;
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) {
        return probe;
      }
      probe = parent;
    }
  }
}

/** The edited file as its owning checkout and a checkout-relative path. Lexical first (the path as WRITTEN):
 *  a file outside every registered checkout is not repository code and is a silent no-op, a file in a
 *  registered checkout whose directory is gone is a named non-verdict, and a path whose existing part
 *  RESOLVES through any symlink component into another checkout or outside the repository is a refusal. */
function resolveSubject(checkouts, payloadCwd, file) {
  const lexical = path.resolve(payloadCwd, file);
  const owner = ownerOf(checkouts, lexical);
  if (owner === null || owner.base === lexical) {
    return null;
  }
  const rel = path.relative(owner.base, lexical).split(path.sep).join("/");
  // Only code and config have a verdict here: Biome skips markdown, and a typecheck plan for a prose file
  // costs a pool slot and a pnpm spawn for nothing.
  if (!CHECKED_EXTENSIONS.has(path.extname(rel))) {
    return null;
  }
  if (owner.checkout.real === null) {
    return { missing: owner.checkout.registered, rel };
  }
  const prefix = existingPrefix(lexical);
  const resolved = realpathOrNull(prefix) ?? noticeAndExit(`edited path cannot be resolved: ${lexical}`);
  if (ownerOf(checkouts, resolved)?.checkout !== owner.checkout) {
    noticeAndExit(`edited path resolves outside the active checkout: ${lexical}`);
  }
  return { root: owner.checkout.real, rel };
}

async function loadShared() {
  try {
    const [profile, slots, ts7] = await Promise.all(
      ["concurrency-profile.ts", "host-slots.ts", "ts7-admission.ts"].map((name) => import(pathToFileURL(path.join(FLOOR_HOST, name)).href)),
    );
    return { caps: profile.readConcurrencyProfile(), tryAcquireHostSlot: slots.tryAcquireHostSlot, ts7 };
  } catch (error) {
    return noticeAndExit(`the shared tooling doors could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Run the legs over the host slots this invocation can take without waiting: one per leg at most, at
 *  least one or every leg is a named skip. A small machine derives fewer slots than one edit has legs, so
 *  the legs share what was taken instead of skipping each other. A refused pool directory throws. */
async function runLegs(shared, pool, legs, diag) {
  const leases = [];
  while (leases.length < legs.length) {
    const lease = shared.tryAcquireHostSlot(pool);
    if (lease === null) {
      break;
    }
    leases.push(lease);
  }
  if (leases.length === 0) {
    for (const leg of legs) {
      diag.push(`pool: all ${String(pool.slots)} shared slots busy; ${leg.name} was SKIPPED\n`);
    }
    return legs.map(() => "");
  }
  const results = legs.map(() => "");
  let next = 0;
  const worker = async () => {
    while (next < legs.length) {
      const index = next;
      next += 1;
      // A leg that throws — a spawn the platform cannot make, a refused duplicate-suppression pool — is that
      // leg's named non-verdict, never a crash that hides the other legs' findings.
      results[index] = await legs[index].run().catch((error) => {
        diag.push(`${legs[index].name}: ${error instanceof Error ? error.message : String(error)}\n`);
        return "";
      });
    }
  };
  try {
    await Promise.all(leases.map(worker));
  } finally {
    for (const lease of leases) {
      lease.release();
    }
  }
  return results;
}

async function biomeLeg(root, rel, diag) {
  const run = await runPnpm(root, [
    "exec",
    "biome",
    "check",
    `--config-path=${path.join(root, "tooling", "biome.edit.jsonc")}`,
    "--reporter=concise",
    "--diagnostic-level=error",
    "--max-diagnostics=20",
    "--no-errors-on-unmatched",
    rel,
  ]);
  // biome's concise reporter writes its DIAGNOSTICS on stderr and its counting summary on stdout (measured
  // 2026-09-12), and pnpm's wrapper reporting shares that stdout. So the block is built from stderr alone:
  // a reporter that moves the diagnostics to stdout takes the named non-verdict arm, never an empty block.
  if (run.code === 0) {
    return "";
  }
  if (run.code === 1) {
    if (run.stderr.includes(`${rel}:`)) {
      return run.stderr
        .split("\n")
        .filter((line) => !BIOME_NOISE.test(line))
        .join("\n");
    }
    if (run.stdout.includes(`${rel}:`)) {
      diag.push(`biome reported ${rel} on stdout, not stderr; its reporter contract changed and the lint block was NOT built:\n${excerpt(run.stdout)}`);
      return "";
    }
    diag.push(`biome failed without a diagnostic for ${rel} (exit 1):\n${excerpt(run.stderr)}${excerpt(run.stdout)}`);
    return "";
  }
  diag.push(`biome failed as a tool (exit ${String(run.code)}):\n${excerpt(run.stderr)}${excerpt(run.stdout)}`);
  return "";
}

function wellFormedDepcruise(payload) {
  return (
    isObject(payload) &&
    isObject(payload.summary) &&
    Array.isArray(payload.summary.violations) &&
    payload.summary.violations.every(
      (violation) => isObject(violation) && isObject(violation.rule) && nonEmptyString(violation.rule.name) && typeof violation.rule.severity === "string",
    )
  );
}

async function depcruiseLeg(root, rel, diag) {
  const run = await runPnpm(root, ["exec", "depcruise", rel, "--config", path.join(root, ".dependency-cruiser.cjs"), "--output-type", "json"]);
  if (run.code !== 0 && run.code !== 1) {
    diag.push(`dep-cruiser failed as a tool (exit ${String(run.code)}):\n${excerpt(run.stdout)}`);
    return "";
  }
  const payload = jsonPayload(run.stdout);
  if (!wellFormedDepcruise(payload)) {
    diag.push(`dep-cruiser returned malformed or empty JSON (exit ${String(run.code)}):\n${excerpt(run.stdout)}${excerpt(run.stderr)}`);
    return "";
  }
  const { violations } = payload.summary;
  const actionable = violations.filter((violation) => violation.rule.name !== "no-orphans" && violation.rule.severity === "error");
  if (actionable.length > 0) {
    const forbidden = Array.isArray(payload.summary.ruleSetUsed?.forbidden) ? payload.summary.ruleSetUsed.forbidden : [];
    return actionable
      .map((violation) => {
        const comment = forbidden.find((rule) => isObject(rule) && rule.name === violation.rule.name)?.comment ?? "rule comment unavailable";
        return `${violation.from ?? "<unknown>"} → ${violation.to ?? "<unknown>"} [${violation.rule.name}]\n    ${comment}`;
      })
      .join("\n");
  }
  const onlyOrphans = violations.length > 0 && violations.every((violation) => violation.rule.name === "no-orphans");
  if (run.code === 1 && !onlyOrphans) {
    diag.push(`dep-cruiser exited 1 without an actionable or explicitly excluded no-orphans violation:\n${excerpt(run.stdout)}`);
  }
  return "";
}

function wellFormedPlan(plan, rels) {
  const programs = plan?.programs;
  if (
    !isObject(plan) ||
    plan.coverage !== "advisory-primary-programs" ||
    !Array.isArray(programs) ||
    !programs.every(nonEmptyString) ||
    new Set(programs).size !== programs.length
  ) {
    return false;
  }
  if (!Array.isArray(plan.subjects) || plan.subjects.length !== rels.length) {
    return false;
  }
  const expected = new Set(rels);
  const selected = new Set();
  for (const subject of plan.subjects) {
    if (!isObject(subject) || !expected.delete(subject.path) || !Array.isArray(subject.selectedPrograms) || !subject.selectedPrograms.every(nonEmptyString)) {
      return false;
    }
    if (TYPED_EXTENSIONS.has(path.extname(subject.path)) || subject.disposition === "selected") {
      if (subject.disposition !== "selected" || subject.selectedPrograms.length === 0) {
        return false;
      }
      for (const program of subject.selectedPrograms) {
        selected.add(program);
      }
    } else if (subject.disposition !== "not-applicable" || subject.selectedPrograms.length > 0) {
      return false;
    }
  }
  return expected.size === 0 && selected.size === programs.length && programs.every((program) => selected.has(program));
}

function unsafeProgram(program) {
  const wrapped = `/${program}/`;
  return wrapped.startsWith("//") || wrapped.includes("\\") || wrapped.includes("/../") || wrapped.includes("/./");
}

/** Compiler output as one record per diagnostic: its root-relative file (null for a program-level error) and
 *  its text with the indented elaboration lines. Every other non-blank line is returned as unrecognised:
 *  output this parser cannot read must surface as a non-verdict, never vanish. */
function parseDiagnostics(root, output) {
  const records = [];
  const unrecognised = [];
  let current = null;
  for (const line of output.split("\n")) {
    const located = TS_LOCATED.exec(line);
    if (located !== null) {
      const file = path.relative(root, path.resolve(root, located[1])).split(path.sep).join("/");
      current = { file, text: line };
      records.push(current);
    } else if (TS_UNLOCATED.test(line)) {
      current = { file: null, text: line };
      records.push(current);
    } else if (current !== null && /^\s+\S/u.test(line)) {
      current.text += `\n${line}`;
    } else if (line.trim() !== "") {
      current = null;
      unrecognised.push(line);
    }
  }
  return { records, unrecognised };
}

function boundedLines(lines) {
  const shown = lines.slice(0, UNRECOGNISED_LINES).map((line) => (line.length > UNRECOGNISED_LINE_CHARS ? `${line.slice(0, UNRECOGNISED_LINE_CHARS)}…` : line));
  return `${shown.join("\n")}\n${notShown(lines.length - shown.length)}`;
}

async function checkProgram(shared, root, program, edited, diag, typeOut) {
  // Two edits in one checkout must not type-check the same program twice at once: one host slot per
  // (checkout, program), taken without waiting.
  const key = createHash("sha256").update(`${root}\0${program}`).digest("hex").slice(0, 16);
  const duplicate = shared.tryAcquireHostSlot({ name: `hook-typecheck-${key}`, label: `edit hook ${program} in ${path.basename(root)}`, slots: 1 });
  if (duplicate === null) {
    diag.push(`typecheck: ${program} is already running for this checkout; it was SKIPPED\n`);
    return;
  }
  try {
    const run = await runPnpm(
      root,
      ["exec", "node", path.join(root, "scripts", "ts7.ts"), "--noEmit", "--pretty", "false", "--checkers", String(shared.caps.hookTs7Checkers), "-p", program],
      { ...process.env, [shared.ts7.TS7_ADMISSION_ENV]: "try" },
    );
    const output = `${run.stdout}${run.stderr}`;
    if (run.code === shared.ts7.TS7_SLOT_BUSY_EXIT) {
      diag.push(`typecheck: ${program} was SKIPPED — every host typecheck slot is busy\n`);
      return;
    }
    // Only a clean exit and the diagnostics-found exit are compiler verdicts. A signal, a spawn failure or any
    // other status (ts7's reserved abnormal exit included) leaves output that may be partial.
    if (run.code !== 0 && run.code !== TSC_DIAGNOSTICS_EXIT) {
      const status = run.signal === null ? `exit ${String(run.code)}` : `signal ${run.signal}`;
      diag.push(
        `typecheck compiler failed for ${program} (${status}); its output may be partial and is not a verdict:\n${boundedLines(output.split("\n").filter((line) => line.trim() !== ""))}`,
      );
      return;
    }
    if (run.code !== 0 && !TS_DIAGNOSTIC.test(output)) {
      diag.push(`typecheck compiler failed for ${program} (exit ${String(run.code)}):\n${excerpt(output)}`);
      return;
    }
    const { records, unrecognised } = run.code === 0 ? { records: [], unrecognised: [] } : parseDiagnostics(root, output);
    if (unrecognised.length > 0) {
      diag.push(
        `typecheck output for ${program} has ${String(unrecognised.length)} line(s) that are not diagnostics; the check is incomplete:\n${boundedLines(unrecognised)}`,
      );
    }
    if (records.length > 0) {
      // Every current diagnostic is reported; the split only orders program-level errors and then the edited
      // files' own errors first. A program-level error has no site to group, so it is listed whole.
      const texts = (keep) => records.filter(keep).map((record) => record.text);
      typeOut.push({
        program,
        unlocated: texts((record) => record.file === null),
        edited: texts((record) => record.file !== null && edited.has(record.file)),
        elsewhere: texts((record) => record.file !== null && !edited.has(record.file)),
      });
    }
  } finally {
    duplicate.release();
  }
}

async function typecheckLeg(shared, root, rels, diag, typeOut) {
  const planned = await runPnpm(root, ["exec", "node", "tooling/src/verify/cli.ts", "typecheck-plan", "--primary", "--file", "--json", "--", ...rels]);
  const names = rels.join(", ");
  if (planned.code !== 0) {
    diag.push(`typecheck planner failed for ${names}:\n${excerpt(planned.stdout)}${excerpt(planned.stderr)}`);
    return "";
  }
  const plan = jsonPayload(planned.stdout);
  if (plan === null) {
    diag.push(`typecheck planner printed no JSON payload on stdout for ${names}:\n${excerpt(planned.stdout)}${excerpt(planned.stderr)}`);
    return "";
  }
  if (!wellFormedPlan(plan, rels)) {
    diag.push(`typecheck planner returned malformed output for ${names}\n${excerpt(planned.stdout)}`);
    return "";
  }
  for (const program of plan.programs) {
    if (unsafeProgram(program)) {
      diag.push(`typecheck planner returned an unsafe program path: ${program}\n`);
      continue;
    }
    await checkProgram(shared, root, program, new Set(rels), diag, typeOut);
  }
  return "";
}

/** Located TS errors grouped by code and message, with basename:position per site: the full expanded generic types
 *  would cost ~1-2KB of context per error. */
function groupedSites(texts) {
  const groups = new Map();
  for (const match of texts.join("\n").matchAll(TS_DIAGNOSTIC_EXCERPT)) {
    const site = match[0];
    const open = site.indexOf("(");
    const where = `${site.slice(0, open)}:${site.slice(open + 1, site.indexOf(")"))}`;
    const coded = /error (TS\d+): (.*)$/u.exec(site);
    const key = coded === null ? "" : `${coded[1]} ${coded[2]}`;
    const group = groups.get(key) ?? [];
    group.push(where);
    groups.set(key, group);
  }
  return [...groups].map(([key, sites]) => `${key} (${String(sites.length)}): ${sites.join(" ")}`).toSorted((a, b) => a.localeCompare(b));
}

function typeSummary(typeOut) {
  const lines = [];
  let total = 0;
  for (const { program, unlocated, edited, elsewhere } of typeOut) {
    lines.push(`── ${program} ──`, ...unlocated, ...groupedSites(edited));
    if (elsewhere.length > 0) {
      lines.push(`${String(elsewhere.length)} current type error(s) in files outside this edit:`, ...groupedSites(elsewhere));
    }
    total += unlocated.length + edited.length + elsewhere.length;
  }
  return [...lines, `── ${String(total)} type error(s) ──`].join("\n");
}

/** Every leg for one checkout's edited files, as the finding blocks they produced. */
async function checkCheckout(shared, root, rels, diag) {
  const pool = { name: HOOK_POOL, label: `edit hook in ${path.basename(root)}`, slots: shared.caps.hookPoolSlots };
  const typeOut = [];
  const legs = rels.flatMap((rel) => [
    { name: `biome ${rel}`, heading: "biome (lint)", run: () => biomeLeg(root, rel, diag) },
    ...(rel.startsWith("packages/") && DEPCRUISE_EXTENSIONS.has(path.extname(rel)) && existsSync(path.join(root, ".dependency-cruiser.cjs"))
      ? [{ name: `depcruise ${rel}`, heading: "dep-cruiser (imports)", run: () => depcruiseLeg(root, rel, diag) }]
      : []),
  ]);
  legs.push({ name: "typecheck", heading: "", run: () => typecheckLeg(shared, root, rels, diag, typeOut) });
  let results;
  try {
    results = await runLegs(shared, pool, legs, diag);
  } catch (error) {
    noticeAndExit(`hook admission failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const blocks = [];
  for (const [index, result] of results.entries()) {
    if (result !== "") {
      blocks.push(`── ${legs[index].heading} ──\n${result}`);
    }
  }
  if (typeOut.length > 0) {
    blocks.push(typeSummary(typeOut));
  }
  return blocks;
}

async function main() {
  const { cwd, subjects } = readInput();
  const registered = resolveCheckouts(cwd);
  const checkouts = new Map();
  const diag = [];
  for (const subject of subjects) {
    const resolved = resolveSubject(registered, cwd, subject.file);
    if (resolved === null) {
      continue;
    }
    if ("missing" in resolved) {
      diag.push(`${resolved.rel}: its registered checkout ${resolved.missing} is missing; no check ran. Restore the checkout or run git worktree prune.\n`);
      continue;
    }
    const { root, rel } = resolved;
    if (subject.status === "deleted") {
      diag.push(`${rel}: deleted or moved away; file-scoped checks cannot assess removed paths. Run pnpm verify --changed.\n`);
    } else if (subject.status === "present" && !existsSync(path.resolve(cwd, subject.file))) {
      diag.push(`${rel}: edited path is absent; checks were SKIPPED.\n`);
    } else {
      const rels = checkouts.get(root) ?? [];
      if (!rels.includes(rel)) {
        rels.push(rel);
      }
      checkouts.set(root, rels);
    }
  }
  if (checkouts.size === 0) {
    if (diag.length > 0) {
      report(findingLead(1), `── checks without a verdict ──\n${diag.join("")}`);
    }
    process.exit(0);
  }
  const shared = await loadShared();
  const blocks = [];
  for (const [root, rels] of checkouts) {
    const checked = await checkCheckout(shared, root, rels, diag);
    // One patch can span checkouts; each block then names the tree it describes.
    const prefix = checkouts.size > 1 ? `── checkout ${root} ──\n` : "";
    blocks.push(...checked.map((block) => `${prefix}${block}`));
  }
  if (diag.length > 0) {
    blocks.push(`── checks without a verdict ──\n${diag.join("")}`);
  }
  if (blocks.length === 0) {
    process.exit(0);
  }
  report(findingLead(blocks.length), blocks.join("\n\n"));
}

function findingLead(blocks) {
  return `edit-check: ${String(blocks)} finding block(s) — fix before you report`;
}

// A crash would exit non-zero with a stack the model never sees; it is a stated non-verdict instead.
await main().catch((error) => noticeAndExit(`the edit hook crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`));
