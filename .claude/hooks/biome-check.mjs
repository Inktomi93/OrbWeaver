#!/usr/bin/env node
// PostToolUse (Edit|Write|MultiEdit): a fast advisory over the checkout that owns the edited file. Biome and
// dep-cruiser stay file-scoped; TypeScript checks the planner's primary program(s). Exit 2 shows stderr to
// Claude after the tool ran; a tool error or a skipped leg is a named non-verdict, never a silent pass.
//
// PORTABLE BY CONSTRUCTION: Node only, plus `git` and `pnpm` on PATH. The host-wide admission pool, the
// per-program duplicate suppression and the caps all come from tooling/src/_shared (the same doors every
// other tool uses); nothing here needs flock, GNU stat, jq, sed or awk.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { setPriority } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SHARED = path.join(import.meta.dirname, "..", "..", "tooling", "src", "_shared");
const CHECKED_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json", ".jsonc", ".css"]);
const TYPED_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const DEPCRUISE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]);
const SUPPORTED_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);
const HOOK_POOL = "hook";
// Every leg is an advisory beside real work; it yields the CPU to anything the operator is running.
const LEG_NICENESS = 10;
const EXCERPT_LINES = 80;
const TS_DIAGNOSTIC = /\.(ts|tsx|mts|cts)\(\d+,\d+\): error TS\d+/u;
const TS_DIAGNOSTIC_EXCERPT = /[^/\\]+\(\d+,\d+\): error TS\d+: .{0,60}/gu;
const BIOME_NOISE = /^(Checked |Found |check )|Some errors were emitted|^\s*$/u;

function noticeAndExit(message) {
  process.stderr.write(`── edit advisory was NOT completed ──\n${message}\n`);
  process.exit(2);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function excerpt(text) {
  return text === "" ? "" : text.split("\n").slice(0, EXCERPT_LINES).join("\n").replace(/\n*$/u, "\n");
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
    child.on("error", (error) => resolve({ code: null, stdout, stderr: `${stderr}${error.message}\n` }));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
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
  if (!nonEmptyString(input.cwd) || !isObject(input.tool_input) || !nonEmptyString(input.tool_input.file_path)) {
    noticeAndExit("hook input is malformed: a supported PostToolUse file event requires nonempty cwd and tool_input.file_path strings");
  }
  return { cwd: input.cwd, file: input.tool_input.file_path };
}

/** The checkout that owns the edit, proven to share a repository with the trusted project. */
function resolveCheckout(payloadCwd) {
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
  return root;
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** The edited file as a checkout-relative path, or exit. Lexical first (the path as WRITTEN): a file
 *  outside the checkout is not repository code and is a silent no-op, while a path that looks inside but
 *  RESOLVES outside through a symlink is a refusal. */
function resolveSubject(root, payloadCwd, file) {
  const lexical = path.resolve(payloadCwd, file);
  if (!inside(root, lexical)) {
    process.exit(0);
  }
  if (existsSync(lexical)) {
    const target = realpathOrNull(lexical) ?? noticeAndExit(`edited path cannot be resolved: ${lexical}`);
    if (!inside(root, target)) {
      noticeAndExit(`edited path resolves outside the active checkout: ${lexical}`);
    }
  }
  const rel = path.relative(root, lexical).split(path.sep).join("/");
  // Only code and config have a verdict here: Biome skips markdown, and a typecheck plan for a prose file
  // costs a pool slot and a pnpm spawn for nothing.
  if (!CHECKED_EXTENSIONS.has(path.extname(rel))) {
    process.exit(0);
  }
  return rel;
}

async function loadShared() {
  try {
    const [profile, slots, ts7] = await Promise.all(
      ["concurrency-profile.ts", "host-slots.ts", "ts7-admission.ts"].map((name) => import(pathToFileURL(path.join(SHARED, name)).href)),
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

function wellFormedPlan(plan, rel, typeRequired) {
  const programs = plan?.programs;
  const subject = Array.isArray(plan?.subjects) && plan.subjects.length === 1 ? plan.subjects[0] : null;
  if (!isObject(plan) || plan.coverage !== "advisory-primary-programs" || !Array.isArray(programs) || !programs.every(nonEmptyString)) {
    return false;
  }
  if (!isObject(subject) || subject.path !== rel || !Array.isArray(subject.selectedPrograms) || !subject.selectedPrograms.every(nonEmptyString)) {
    return false;
  }
  if (typeRequired || subject.disposition === "selected") {
    return (
      subject.disposition === "selected" &&
      programs.length > 0 &&
      programs.length === subject.selectedPrograms.length &&
      programs.every((program, index) => program === subject.selectedPrograms[index])
    );
  }
  return subject.disposition === "not-applicable" && programs.length === 0 && subject.selectedPrograms.length === 0;
}

function unsafeProgram(program) {
  const wrapped = `/${program}/`;
  return wrapped.startsWith("//") || wrapped.includes("\\") || wrapped.includes("/../") || wrapped.includes("/./");
}

async function checkProgram(shared, root, program, diag, typeOut) {
  // Two edits in one checkout must not type-check the same program twice at once: one host slot per
  // (checkout, program), taken without waiting.
  const key = createHash("sha256").update(`${root}\0${program}`).digest("hex").slice(0, 16);
  const duplicate = shared.tryAcquireHostSlot({ name: `hook-typecheck-${key}`, label: `edit hook ${program} in ${path.basename(root)}`, slots: 1 });
  if (duplicate === null) {
    diag.push(`typecheck: ${program} is already running for this checkout; it was SKIPPED\n`);
    return;
  }
  let run;
  try {
    run = await runPnpm(
      root,
      ["exec", "node", path.join(root, "scripts", "ts7.ts"), "--noEmit", "--pretty", "false", "--checkers", String(shared.caps.hookTs7Checkers), "-p", program],
      { ...process.env, [shared.ts7.TS7_ADMISSION_ENV]: "try" },
    );
  } finally {
    duplicate.release();
  }
  const output = `${run.stdout}${run.stderr}`;
  if (run.code === shared.ts7.TS7_SLOT_BUSY_EXIT) {
    diag.push(`typecheck: ${program} was SKIPPED — every host typecheck slot is busy\n`);
  } else if (run.code !== 0) {
    if (TS_DIAGNOSTIC.test(output)) {
      typeOut.push(`── ${program} ──\n${output}`);
    } else {
      diag.push(`typecheck compiler failed for ${program} (exit ${String(run.code)}):\n${excerpt(output)}`);
    }
  }
}

async function typecheckLeg(shared, root, rel, diag, typeOut) {
  const planned = await runPnpm(root, ["exec", "node", "tooling/src/verify/cli.ts", "typecheck-plan", "--primary", "--file", "--json", "--", rel]);
  if (planned.code !== 0) {
    diag.push(`typecheck planner failed for ${rel}:\n${excerpt(planned.stdout)}${excerpt(planned.stderr)}`);
    return "";
  }
  const plan = jsonPayload(planned.stdout);
  if (plan === null) {
    diag.push(`typecheck planner printed no JSON payload on stdout for ${rel}:\n${excerpt(planned.stdout)}${excerpt(planned.stderr)}`);
    return "";
  }
  if (!wellFormedPlan(plan, rel, TYPED_EXTENSIONS.has(path.extname(rel)))) {
    diag.push(`typecheck planner returned malformed output for ${rel}\n${excerpt(planned.stdout)}`);
    return "";
  }
  for (const program of plan.programs) {
    if (unsafeProgram(program)) {
      diag.push(`typecheck planner returned an unsafe program path: ${program}\n`);
      continue;
    }
    await checkProgram(shared, root, program, diag, typeOut);
  }
  return "";
}

/** TS errors grouped by code and message, with basename:position per site: the full expanded generic types
 *  would cost ~1-2KB of context per error. */
function typeSummary(typeOut) {
  const text = typeOut.join("");
  const headers = text.split("\n").filter((line) => line.startsWith("── "));
  const groups = new Map();
  for (const match of text.matchAll(TS_DIAGNOSTIC_EXCERPT)) {
    const site = match[0];
    const open = site.indexOf("(");
    const where = `${site.slice(0, open)}:${site.slice(open + 1, site.indexOf(")"))}`;
    const coded = /error (TS\d+): (.*)$/u.exec(site);
    const key = coded === null ? "" : `${coded[1]} ${coded[2]}`;
    const group = groups.get(key) ?? [];
    group.push(where);
    groups.set(key, group);
  }
  const lines = [...groups].map(([key, sites]) => `${key} (${String(sites.length)}): ${sites.join(" ")}`).toSorted((a, b) => a.localeCompare(b));
  const total = (text.match(/error TS\d+:/gu) ?? []).length;
  return [...headers, ...lines, `── ${String(total)} type error(s) ──`].join("\n");
}

async function main() {
  const { cwd, file } = readInput();
  const root = resolveCheckout(cwd);
  const rel = resolveSubject(root, cwd, file);
  const shared = await loadShared();
  const pool = { name: HOOK_POOL, label: `edit hook in ${path.basename(root)}`, slots: shared.caps.hookPoolSlots };
  const diag = [];
  const typeOut = [];
  const runsDepcruise = rel.startsWith("packages/") && DEPCRUISE_EXTENSIONS.has(path.extname(rel)) && existsSync(path.join(root, ".dependency-cruiser.cjs"));
  const legs = [
    { name: "biome", run: () => biomeLeg(root, rel, diag) },
    ...(runsDepcruise ? [{ name: "depcruise", run: () => depcruiseLeg(root, rel, diag) }] : []),
    { name: "typecheck", run: () => typecheckLeg(shared, root, rel, diag, typeOut) },
  ];
  let results;
  try {
    results = await runLegs(shared, pool, legs, diag);
  } catch (error) {
    noticeAndExit(`hook admission failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const biome = results[0] ?? "";
  const dep = runsDepcruise ? (results[1] ?? "") : "";
  const blocks = [];
  if (biome !== "") {
    blocks.push(`── biome (lint) ──\n${biome}`);
  }
  if (dep !== "") {
    blocks.push(`── dep-cruiser (imports) ──\n${dep}`);
  }
  if (typeOut.length > 0) {
    blocks.push(typeSummary(typeOut));
  }
  if (diag.length > 0) {
    blocks.push(`── checks without a verdict ──\n${diag.join("")}`);
  }
  if (blocks.length === 0) {
    process.exit(0);
  }
  process.stderr.write(`${blocks.join("\n\n").replace(/\n*$/u, "")}\n`);
  process.exit(2);
}

await main();
