// The `pnpm verify` orchestrator's pure helpers (UNIFIED-VERIFICATION-DESIGN.md §3.1/§3.3): the per-tool
// exit-code classifiers and the run-level max-severity aggregation. Pins the SAME 0/1/2/3 contract the
// retired `pnpm check` orchestrator spoke — now generalized to the registry's named adapters (this test
// supersedes that orchestrator's exit-code pins). A signal-kill (null) is ALWAYS a tool error (2), never a verdict; a
// foreign tool's digit is never trusted to mean the scheme's 2/3.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { spawnNiced, spawnNicedTranscript } from "@orb/tooling/_shared/proc";
import { vi } from "vitest";
import YAML from "yaml";
import type { Parsed, StageDef, StageResult, VerifyReport } from "../../../../tooling/src/verify/index.ts";
import {
  aggregateExit,
  asViolations,
  eslintScheme,
  failReason,
  failuresWorstFirst,
  noticesIn,
  noVerdictStages,
  ownScheme,
  parse,
  printSummary,
  producedNoVerdict,
  REGISTRY,
  readCompilerPrograms,
  resolveSelection,
  resolveStageCommand,
  stagesForTier,
  unresolvableCommandTranscript,
  unrunnableRegistryRows,
  workspaceBinPath,
} from "../../../../tooling/src/verify/index.ts";
import { HOST_POOL_ROOT_ENV } from "../../../../tooling/src/verify/lib/host-slots.ts";
import { workingChangeClassification } from "../../../../tooling/src/verify/lib/selection.ts";
import { enterWholeRunQueue } from "../../../../tooling/src/verify/lib/whole-run-queue.ts";
import { nonRunningStageResult, planStage } from "../../../../tooling/src/verify/ops/run.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

/** A parse result that IS a misuse error (what main() maps to exit 3). */
function isMisuse(argv: readonly string[]): boolean {
  return "error" in parse(argv);
}

function stage(name: string): StageDef {
  const s = REGISTRY.find((r) => r.name === name);
  if (s === undefined) {
    throw new Error(`no stage ${name}`);
  }
  return s;
}

async function eventually(predicate: () => boolean, attempts = Math.ceil(scaledBudget(10_000) / 20)): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) {
      return true;
    }
    await delay(20);
  }
  return false;
}

test("Lefthook forwards each long gate before its held child exits and preserves the nonzero exit", { timeout: scaledBudget(60_000) }, async ({
  repoRoot,
  scratch,
}) => {
  const live = YAML.parse(readFileSync(join(repoRoot, "lefthook.yml"), "utf8")) as Record<string, { readonly follow?: boolean }>;
  const hooks = ["pre-commit", "pre-merge-commit", "pre-push"] as const;
  writeFileSync(join(scratch, "package.json"), '{"name":"lefthook-progress-fixture","private":true}\n');
  execFixtureGit(scratch, ["init", "-q"]);
  writeFileSync(
    join(scratch, "hold.cjs"),
    "const fs=require('node:fs');const hook=process.argv[2];process.stdout.write('HELD '+hook+'\\n',()=>fs.writeFileSync('ready-'+hook,'yes'));const timer=setInterval(()=>{if(fs.existsSync('release-'+hook)){clearInterval(timer);process.exitCode=7}},20);\n",
  );
  // biome-ignore lint/style/noProcessEnv: the native hook child needs the caller's toolchain environment; only its config and PATH are overlaid.
  const parentEnv = process.env;
  for (const hook of hooks) {
    const config = join(scratch, `lefthook-${hook}.yml`);
    writeFileSync(
      config,
      `colors: false\noutput: [summary, failure, execution_out]\n${hook}:\n  follow: ${String(live[hook]?.follow)}\n  commands:\n    held:\n      run: pnpm exec node hold.cjs ${hook}\n`,
    );
    let output = "";
    const child = spawn("pnpm", ["exec", "lefthook", "run", hook, "--force", "--no-tty"], {
      cwd: scratch,
      env: Object.fromEntries([
        ...Object.entries(parentEnv),
        ["LEFTHOOK_CONFIG", config],
        ["PATH", `${join(repoRoot, "node_modules", ".bin")}:${parentEnv["PATH"] ?? ""}`],
      ]),
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    const exit = new Promise<number | null>((resolve) => child.once("exit", resolve));
    const ready = join(scratch, `ready-${hook}`);
    const release = join(scratch, `release-${hook}`);
    const announcedReady = await eventually(() => existsSync(ready) || child.exitCode !== null);
    const streamedBeforeRelease = announcedReady && child.exitCode === null && (await eventually(() => output.includes(`HELD ${hook}`)));
    writeFileSync(release, "release");
    const code = await exit;
    expect(announcedReady, `${hook} child never reached its readiness barrier:\n${output}`).toBe(true);
    expect(streamedBeforeRelease, `${hook} buffered its child output until exit:\n${output}`).toBe(true);
    expect(code, `${hook} swallowed the held command's nonzero exit:\n${output}`).not.toBe(0);
  }
  expect(hooks.map((hook) => live[hook]?.follow)).toEqual([true, true, true]);
});

test("compact verification names the active stage before its held child exits and preserves the stage verdict", { timeout: scaledBudget(60_000) }, async ({
  fakeBin,
  repoRoot,
  scratch,
}) => {
  const ready = join(scratch, "stage-ready");
  const release = join(scratch, "stage-release");
  const heldOnce = join(scratch, "stage-held-once");
  await fakeBin(
    "pnpm",
    `#!/usr/bin/env bash
set -u
if [ ! -f ${JSON.stringify(heldOnce)} ]; then
  touch ${JSON.stringify(heldOnce)}
  echo HELD VERIFY STAGE
  touch ${JSON.stringify(ready)}
  while [ ! -f ${JSON.stringify(release)} ]; do sleep 0.02; done
  exit 1
fi
exit 0
`,
  );
  const runner = join(scratch, "run-verify.ts");
  writeFileSync(
    runner,
    `import { parse } from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/lib/run-argv.ts")).href)};
import { runVerify } from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/ops/run.ts")).href)};
const parsed = parse(["--static"]);
if ("error" in parsed) throw new Error(parsed.error);
process.exitCode = await runVerify(${JSON.stringify(scratch)}, parsed);
`,
  );
  let output = "";
  // biome-ignore lint/style/noProcessEnv: the child inherits fakeBin's isolated PATH and redirects its whole-run slot into scratch.
  const childEnv = Object.fromEntries([...Object.entries(process.env), [HOST_POOL_ROOT_ENV, join(scratch, "verify-slots")]]);
  const child = spawn("nice", ["-n", "19", process.execPath, runner], {
    cwd: repoRoot,
    detached: true,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  const exit = new Promise<number | null>((resolve) => child.once("exit", resolve));
  try {
    expect(await eventually(() => existsSync(ready) || child.exitCode !== null), output).toBe(true);
    expect(child.exitCode, output).toBeNull();
    expect(output).toContain("[verify] START lint:biome");
    expect(output).not.toMatch(/^[✓✗‼] lint:biome/mu);
    writeFileSync(release, "release");
    expect(await exit, output).toBe(2);
    expect(output).toContain("‼ lint:biome");
    expect(output.indexOf("[verify] START lint:biome")).toBeLessThan(output.indexOf("‼ lint:biome"));
  } finally {
    writeFileSync(release, "release");
    if (child.exitCode === null && child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // The readiness-controlled group may finish between the exitCode read and cleanup signal.
      }
    }
  }
});

// ─── #2469: THE STAGE CHILD'S COLOUR ENV, and why "we never SET FORCE_COLOR" was not enough ─────────
// `runStage` composes `NO_COLOR=1` so every checker prints greppable plain text. Node emits
// `Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.` whenever BOTH are
// present — and the parent routinely exports one (an agent shell and a `pnpm` run both do; `FORCE_COLOR=3`
// measured on the run that surfaced this). Not setting it left the INHERITED one in place, so the warning
// rode the stderr of every node child of every stage: noise in each stage log, and a real failure in
// `tests/tooling/stack/ops/engines-compose.int.test.ts`, which asserts a compose child prints NOTHING on
// stderr and was instead reading node's complaint about our own contradictory env.
test("a stage child carries NO_COLOR and never an inherited FORCE_COLOR (#2469)", { timeout: scaledBudget(60_000) }, async ({ fakeBin, repoRoot, scratch }) => {
  const seen = join(scratch, "stage-colour-env");
  await fakeBin(
    "pnpm",
    `#!/usr/bin/env bash
set -u
printf 'NO_COLOR=[%s] FORCE_COLOR=[%s]\n' "\${NO_COLOR-unset}" "\${FORCE_COLOR-unset}" >> ${JSON.stringify(seen)}
exit 0
`,
  );
  const runner = join(scratch, "run-verify-colour.ts");
  writeFileSync(
    runner,
    `import { parse } from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/lib/run-argv.ts")).href)};
import { runVerify } from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/ops/run.ts")).href)};
const parsed = parse(["--static"]);
if ("error" in parsed) throw new Error(parsed.error);
process.exitCode = await runVerify(${JSON.stringify(scratch)}, parsed);
`,
  );
  // THE PARENT IS THE PLANTED POSITIVE CONTROL: without FORCE_COLOR here the assertion below would pass
  // against a fixed AND against a broken composer, because node only warns when both are set.
  // biome-ignore lint/style/noProcessEnv: the child needs the parent's real PATH (fakeBin prepended its shim to it) plus an isolated slot root.
  const parentEnv = Object.entries(process.env);
  const childEnv = Object.fromEntries([...parentEnv, [HOST_POOL_ROOT_ENV, join(scratch, "verify-slots-colour")], ["FORCE_COLOR", "3"]]);
  const child = spawn("nice", ["-n", "19", process.execPath, runner], { cwd: repoRoot, detached: true, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  await new Promise<number | null>((resolve) => child.once("exit", resolve));

  const recorded = existsSync(seen) ? readFileSync(seen, "utf8") : "";
  const lines = recorded.split("\n").filter((line) => line !== "");
  // A zero denominator would pass the uniqueness assertion below on its own.
  expect(lines.length, `no stage reached the fake pnpm:\n${output}`).toBeGreaterThan(0);
  expect([...new Set(lines)]).toEqual(["NO_COLOR=[1] FORCE_COLOR=[unset]"]);
});

test("asViolations: clean 0, any non-zero is a violation (tsc's 2 = type errors, not tool-error)", () => {
  expect(asViolations(0)).toBe(0);
  expect(asViolations(1)).toBe(1);
  expect(asViolations(2)).toBe(1); // tsc exits 2 for type errors — a VIOLATION, not a broken checker
  expect(asViolations(127)).toBe(1);
});

test("asViolations: a signal-kill (null) is a TOOL error (2), never a violation", () => {
  expect(asViolations(null)).toBe(2);
});

test("the supervised node stages preserve their owned 0/1/2/3 exit contract through aggregation", () => {
  for (const name of ["tests:node", "tests:tooling"]) {
    const classify = stage(name).classify;
    expect(classify(0), `${name} clean`).toBe(0);
    expect(classify(1), `${name} assertion failure`).toBe(1);
    expect(classify(2), `${name} supervisor tool error`).toBe(2);
    expect(classify(3), `${name} supervisor misuse`).toBe(3);
    expect(classify(null), `${name} signal`).toBe(2);
  }
  expect(aggregateExit([1, stage("tests:node").classify(2), 3])).toBe(2);
});

test("eslintScheme: its 2 IS a tool error (opposite of tsc's 2), 1 is lint problems", () => {
  expect(eslintScheme(0)).toBe(0);
  expect(eslintScheme(1)).toBe(1);
  expect(eslintScheme(2)).toBe(2); // eslint's 2 = config/internal error = the checker broke
  expect(eslintScheme(null)).toBe(2);
});

// ── the failure-block presentation (§3.3): a tool-error (exit 2 — a BROKEN checker) is never dressed as a
// violation. eslint's exit 2 (e.g. "No files matching the pattern" on a deleted path) classifies to 2; the
// tail failure line must carry the tool-error glyph + TOOL-ERROR label, not the violations glyph. ──

function failedStage(name: string, exitCode: number): StageResult {
  return {
    name,
    group: "lint",
    mode: "scoped",
    ok: false,
    exitCode,
    durationMs: 1,
    logFile: `reports/verify/${name.replace(/:/gu, "-")}.log`,
    failureExcerpt: null,
    runsAt: null,
    notices: [],
  };
}

// ── the NOTICE channel (#534) — how a PASSING stage says something the reader must see ──
// A green stage's output lands in reports/verify/<stage>.log and nowhere else: the console prints one ✓
// line. That is exactly how the #533 dev-db drop happened — its only warning was a log line nobody read.
// A stage opts in by printing `[verify-notice] …`; the runner lifts those lines and the TAIL block renders
// them beside the verdict. A notice must NEVER move the verdict — that is the other half of the contract.

test("noticesIn lifts `[verify-notice]` lines and nothing else", () => {
  const transcript = ["db-baseline-parity — 214 statement(s)", "[verify-notice] THE NEXT RESPAWN WILL DROP THE DEV DB", "  ✓ baseline matches"].join("\n");
  expect(noticesIn(transcript)).toEqual(["THE NEXT RESPAWN WILL DROP THE DEV DB"]);
  expect(noticesIn("nothing to declare here\n  ✓ clean")).toEqual([]);
});

/** Run `emit` with `process.stdout.write` captured, and return everything it wrote. ONE home (#1566). */
function captureStdout(emit: () => void): string {
  const written: string[] = [];
  const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written.push(String(chunk));
    return true;
  });
  try {
    emit();
  } finally {
    write.mockRestore();
  }
  return written.join("");
}

test("printSummary renders a notice in the TAIL block while the verdict stays PASS", () => {
  const noticed: StageResult = { ...failedStage("structure:db-baseline", 0), ok: true, notices: ["THE NEXT RESPAWN WILL DROP THE DEV DB"] };
  const report = { tier: "static", scope: "whole", ok: true, exitCode: 0, failed: 0, noVerdict: [], stages: [noticed] } as const;
  const out = captureStdout(() => {
    printSummary(report);
  });
  expect(out).toContain("NOTICES (not failures)");
  expect(out).toContain("THE NEXT RESPAWN WILL DROP THE DEV DB");
  // The load-bearing half: a notice is presentation, never severity.
  expect(out).toContain("VERDICT: PASS");
});

test("a tier-precondition SKIP carries its reason to the tail and to verify.json (#1566)", () => {
  // THE PRODUCER, NOT A HAND-BUILT ROW. The first cut of this test wrote its own `StageResult` with the
  // notice already in it, so deleting the line in `ops/run.ts` that ATTACHES the notice left it green —
  // a renderer pin wearing a producer's clothes. It now drives the real pair: `planStage` decides (with a
  // precondition that answers FALSE), and `nonRunningStageResult` shapes the row the runner returns.
  // THE SUBJECT ROW IS SYNTHETIC SINCE #1842, and deliberately so: the owner took the instrument battery
  // off `--push` entirely, so NO registry row declares a `tierPrecondition` today (pinned by
  // tests/tooling/verify/lib/registry.test.ts). The FIELD and the runner path below are still live
  // contract — the next expensive stage that wants a conditional rung inherits both — so the mechanism
  // keeps its producer-driven proof rather than being deleted with the row that motivated it. Everything
  // outside the precondition is copied from a REAL registry row (`tests:tooling`), and the `satisfied`
  // arm answers FALSE because that is the case this test exists for (a `null` would mean RUN).
  const stageDef = stagesForTier("full").find((row) => row.name === "tests:tooling");
  expect(stageDef, "tests:tooling is not in the full tier — the row this test borrows moved").toBeDefined();
  const reason = "the branch diff (vs its merge base, plus the working tree) touches tooling/** or tests/tooling/**";
  const declining: StageDef = {
    ...(stageDef as StageDef),
    tierPrecondition: { tiers: ["push"], reason, satisfied: () => false },
  };
  const plan = planStage(declining, undefined, "push", "/nonexistent");

  // The planner's half: a declined precondition is a SKIP that names the tier which runs it anyway.
  expect(plan.mode).toBe("skipped");
  expect(plan.runsAt).toBe("verify --full");

  // The producer's half: the notice is attached HERE, and `notices` is a StageResult field, so the same
  // string is in verify.json by construction.
  const skipped = nonRunningStageResult(declining, plan);
  expect(skipped.notices).toEqual([`tier precondition: ${reason}`]);
  expect(skipped.ok, "a skip is not a failure").toBe(true);
  // …and a stage with NO precondition gets no notice, so the line above is conditional, not unconditional.
  expect(nonRunningStageResult(stage("types:native"), { mode: "deferred", runsAt: "verify --static" }).notices).toEqual([]);

  const report = { tier: "push", scope: "whole", ok: true, exitCode: 0, failed: 0, noVerdict: [], stages: [skipped] } as const;
  const out = captureStdout(() => {
    printSummary(report);
  });

  // The per-stage line names the tier that DOES run it — never the bare "no files in scope" a scoped skip
  // prints, which is simply false on a whole-tier run.
  expect(out).toContain("tests:tooling  skipped — tier precondition not met; runs at verify --full");
  expect(out).not.toContain("tests:tooling  skipped (no files in scope)");
  // …and the CONDITION reaches the tail, verbatim from the row.
  expect(out).toContain("NOTICES (not failures)");
  expect(out).toContain(`tests:tooling: tier precondition: ${reason}`);
  expect(out).toContain("tooling/**");
  // A skip is not a failure: the verdict is untouched.
  expect(out).toContain("VERDICT: PASS");
});

test("printSummary prints NO notices block when no stage declared one", () => {
  const report = {
    tier: "static",
    scope: "whole",
    ok: true,
    exitCode: 0,
    failed: 0,
    noVerdict: [],
    stages: [{ ...failedStage("lint:biome", 0), ok: true }],
  } as const;
  const out = captureStdout(() => {
    printSummary(report);
  });
  expect(out).not.toContain("NOTICES");
});

test("failReason: an eslint exit-2 TOOL error renders as a tool-error (‼ · TOOL-ERROR), never a violation", () => {
  const line = failReason(failedStage("lint:eslint", eslintScheme(2)));
  expect(line).toContain("TOOL-ERROR");
  expect(line).toContain("‼");
  expect(line).not.toContain("violations");
  expect(line).not.toContain("✗"); // the violations glyph must NOT appear on a tool-error line
});

test("failReason: a genuine violation (exit 1) still renders as ✗ · violations", () => {
  const line = failReason(failedStage("lint:biome", 1));
  expect(line).toContain("violations");
  expect(line).toContain("✗");
  expect(line).not.toContain("‼");
});

test("ownScheme: our scheme-speaking scripts pass 0/1/2/3 through; an unexpected code is a tool error", () => {
  expect(ownScheme(0)).toBe(0);
  expect(ownScheme(1)).toBe(1);
  expect(ownScheme(2)).toBe(2);
  expect(ownScheme(3)).toBe(3);
  expect(ownScheme(99)).toBe(2);
  expect(ownScheme(null)).toBe(2);
});

test("aggregateExit: clean when every stage is 0", () => {
  expect(aggregateExit([0, 0, 0])).toBe(0);
});

test("aggregateExit: a single tool-error (2) dominates violations (1) and misuse (3)", () => {
  expect(aggregateExit([1, 2, 0])).toBe(2);
  expect(aggregateExit([3, 2])).toBe(2);
});

test("aggregateExit: misuse (3) dominates a mere violation (1) but not a tool error", () => {
  expect(aggregateExit([1, 3])).toBe(3);
});

test("aggregateExit: violations (1) when the worst is a violation, no tool error / misuse", () => {
  expect(aggregateExit([0, 1])).toBe(1);
});

// ── tier composition (§3.2) — the registry is the ONE spelling of "run everything" ──

test("the static tier is EXACTLY the known ordered stage set (the pre-commit `pnpm check` battery)", () => {
  // One native stage discovers and runs every concrete compiler program. The separate ownership guard
  // makes a silently-un-type-checked authored root, ambient, or imported closure structurally impossible. `tests:execution-membership`
  // (GitHub issue #22) is its EXECUTION-lane sibling — same whole-tree-invariant shape, in the
  // `tests` group (it reconciles RUNNER coverage, not type-program coverage).
  const staticNames = stagesForTier("static").map((s) => s.name);
  expect(staticNames).toEqual([
    "lint:biome",
    "lint:eslint",
    // #1943 F3: the PreToolUse Bash guard is linted by nothing else, so its syntax rides the commit bar. The
    // registry row landed in 515b775cc without this pin — a stale exact-list pin reads red for every later row.
    "lint:hook-syntax",
    "types:native",
    "types:testd",
    "types:ownership",
    "tests:execution-membership",
    // The db-baseline parity stage (2026-08-02): the committed squashed baseline vs the live schema.
    // Promoted from a push-only int test after two baseline-regen misses shipped and sat ~10h.
    "structure:db-baseline",
    // #1584: every live FK→assets.id column vs the asset-ref classification registry. Replaced the
    // `asset-refs-fk-coverage` AST gate with a Drizzle-runtime comparator (the db-baseline shape).
    "structure:asset-refs",
    // drizzle-kit's own journal/snapshot-chain validator (2026-08-02): near-no-op against the single
    // squashed baseline, ARMED for the first post-launch incremental migration (Tier-1-DB.md).
    "structure:drizzle-kit",
    "structure:agent-config",
    "structure:full",
    // #1941: every final defineGate policy's own proofs through the production dispatcher, on every check —
    // before it, 21 of 163 converted modules were imported by no committed test.
    "structure:policy-conformance",
    // #817: the committed single-writer ledgers (the caught-failure census and its siblings)
    // vs a fresh derivation. Their freshness checks were vitest suites, so `pnpm check` stayed green while
    // main sat red on the next whole node run.
    "ledgers:fresh",
    // #2074: the RULE half of biome grant liveness, successor to the policy arm `97e68be91` deleted under
    // §12.3 (a write plus a spawn). Path liveness proves the granted SUBJECT exists; nothing proved the
    // granted RULE still fires, so a rule-off override on a file that stopped violating it was unpoliced.
    "config:biome-rule-liveness",
    // Every literal knip.ts negation names a tracked file; knip's own hints never report a dead negation.
    "config:knip-negative-liveness",
    "imports:depcruise",
    "deps:knip",
    "docs:format",
    // #1967: the AFFECTED subset of the instrument battery. `tests:tooling` stays `--full`-only (#1842 was
    // right about 71 CPU-minutes of recertification), but everything a declared proof row CANNOT express —
    // the §4.2 identity arm, the central grant table's boundaries, the §4.5 refusal and receipt pins — ran
    // there and NOWHERE ELSE, and sat red for five days twice. This row runs only the family tests of the
    // instruments the branch changed; a product-only commit skips it through the trigger table.
    "tests:instrument-affected",
  ]);
});

test("one native stage and one package script replace the three legacy compiler lanes", () => {
  const native = stage("types:native");
  expect(native.argv).toEqual(["pnpm", "typecheck"]);
  expect(native.classify).toBe(ownScheme);
  for (const retired of ["types:packages", "types:graph", "types:tests-dom"]) {
    expect(REGISTRY.some(({ name }) => name === retired)).toBe(false);
  }
  const scripts = (JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")) as { readonly scripts: Record<string, string> })
    .scripts;
  expect(scripts["typecheck"]).toBe("node tooling/src/verify/cli.ts typecheck");
  expect(scripts["typecheck:graph"]).toBeUndefined();
  expect(scripts["typecheck:tests-dom"]).toBeUndefined();
});

test("static ⊂ push ⊂ full (the whole-tree ladder); changed ⊆ push (the scoped inner loop)", () => {
  const names = (t: "changed" | "static" | "push" | "full"): Set<string> => new Set(stagesForTier(t).map((s) => s.name));
  const changed = names("changed");
  const staticT = names("static");
  const push = names("push");
  const full = names("full");
  // The WHOLE-TREE ladder strictly nests — each tier adds stages, never drops one.
  for (const n of staticT) {
    expect(push.has(n)).toBe(true);
  }
  for (const n of push) {
    expect(full.has(n)).toBe(true);
  }
  // `changed` is the SCOPED inner loop and is deliberately NOT ⊆ static: it carries related-tests
  // (tests:node, run over vitest's changed-file graph) that static omits by doctrine — static is the
  // born-compliant TEST-FREE commit gate (the `bots run check and miss` line below). Everything the inner
  // loop runs, the push tier also runs whole-tree, so the containment is changed ⊆ push — with NO carve-out
  // since #1848: `browser:ct` used to ride INSIDE `tests:node` at push (the composite `pnpm test`), which
  // made the stage-NAME containment fail while the behaviour held. The CT suite is its own push stage now,
  // so both containments are true at once.
  for (const n of changed) {
    expect(push.has(n)).toBe(true);
  }
  expect(changed.has("browser:ct")).toBe(true);
  expect(push.has("browser:ct")).toBe(true);
  expect(push.has("tests:node")).toBe(true);
  expect(changed.has("types:native")).toBe(true);
  expect(changed.has("structure:full")).toBe(true);
});

test("the boot-chunk ratchet is a push/full stage, whole-only, speaking the OWN 0/1/2/3 scheme (#460)", () => {
  // #433 (-20.4%) + #448 (-19.0%) cut the entry chunk 1,146,760 -> 740,339 B and NOTHING defended either
  // win: one new barrel import in main.tsx's static graph re-pays it while every other stage stays green.
  // Pinned here because all three properties are load-bearing and each fails silently if it drifts.
  const boot = stage("quality:boot-chunk");
  // PUSH, never static: the stage runs a real vite production build (15.45s warm, 2026-08-22) and the
  // static tier is the structural-fast commit bar. A static row would put a bundler in every commit.
  expect(boot.tiers).toEqual(["push", "full"]);
  expect(new Set(stagesForTier("static").map((s) => s.name)).has("quality:boot-chunk")).toBe(false);
  // ownScheme, not asViolations: an UNMEASURABLE dist (no entry chunk / two / a failed build) must reach
  // the runner as a TOOL ERROR (2), never collapse to a violation or — worse — a clean pass.
  expect(boot.classify).toBe(ownScheme);
  // Whole-only: the boot chunk is a property of the ENTIRE static graph reachable from main.tsx, so no
  // changed-file subset is an honest partial. An absent scopedArgv is how a stage declares that.
  expect(boot.scopedArgv).toBeUndefined();
});

test("the push tier carries the behavioral suites the static tier omits (the `bots run check and miss` fix)", () => {
  const push = new Set(stagesForTier("push").map((s) => s.name));
  expect(push.has("tests:node")).toBe(true);
  expect(push.has("browser:e2e-smoke")).toBe(true);
  // CT rode INSIDE tests:node from 2026-07-17 until #1848 (2026-09-06): the composite `pnpm test` carried
  // both suites under ONE 45-minute hang ceiling, and once #1835 put CT on the shared worker cap the sum
  // outgrew it — `verify --full` reported `[tool-error] TIMED OUT` on a QUIET box for a stage that was
  // still working. The suite is its own push/full stage again, with a ceiling DERIVED from the profile
  // (lib/stage-budget.ts), and `tests:node` is the vitest half alone. No double-run: the composite is a
  // manual-only row (`tests:product-composite`) that no tier includes.
  expect(push.has("browser:ct")).toBe(true);
  expect(stage("browser:ct").tiers).toEqual(["changed", "push", "full"]);
  // The composition remains the explicit combined product-test command: if `test` stops composing
  // test:ct, callers asking for the combined behavioral suites silently lose CT coverage.
  const rootPkg = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")) as {
    readonly scripts: Record<string, string>;
  };
  expect(rootPkg.scripts["test"]).toContain("pnpm test:ct --retries=2");
  expect(rootPkg.scripts["test"]).toContain("pnpm test:node");
  expect(rootPkg.scripts["test:ct"]).toContain("tooling/src/verify/cli.ts scoped-test ct");
  expect(rootPkg.scripts["test:ct"]).not.toContain("playwright test");
  expect(rootPkg.scripts["ct:scoped"]).toBeUndefined();
  expect(REGISTRY.filter(({ argv }) => argv[0] === "pnpm" && argv[1] === "test:ct")).toHaveLength(1);
  // …and the static tier does NOT run behavioral suites (the core hole §2.1).
  const staticT = new Set(stagesForTier("static").map((s) => s.name));
  expect(staticT.has("tests:node")).toBe(false);
});

test("public command families keep one canonical front door", () => {
  const scripts = (JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")) as { readonly scripts: Record<string, string> })
    .scripts;
  expect(scripts["check:type-ownership"]).toContain("tests-membership");
  expect(scripts["check:tests-membership"]).toBeUndefined();
  expect(scripts["engines"]).toContain("tooling/src/stack/engines.sh");
  for (const verb of ["start", "stop", "status", "sleep", "wake", "reconcile"]) {
    expect(scripts[`engines:${verb}`]).toBeUndefined();
  }
});

// ── V2 scope propagation (§3.4) — the ONE selection resolver feeds every stage's scopedArgv ──
const AFFECTED_PLAN_TIMEOUT = scaledBudget(20_000);

test(
  "resolveSelection --file: derives the per-tool views (eslint surface, tsc owner, depcruise, docs)",
  () => {
    // A ui src file + a docs file. eslint sees the ui file; tsc owns it via packages/ui/tsconfig; depcruise
    // sees the packages/ file; docs sees the .md.
    const sel = resolveSelection({
      kind: "file",
      paths: ["packages/ui/src/primitives/button/variants.ts", "docs/law/Constitution.md"],
    });
    expect(sel.eslintPaths).toContain("packages/ui/src/primitives/button/variants.ts");
    expect(sel.tsconfigs).toContain("packages/ui/tsconfig.json");
    expect(sel.depcruisePaths).toContain("packages/ui/src/primitives/button/variants.ts");
    expect(sel.docsPaths).toContain("docs/law/Constitution.md");
    // A docs file is NOT in the eslint/tsc/depcruise surfaces.
    expect(sel.eslintPaths).not.toContain("docs/law/Constitution.md");
  },
  // Affected planning asks native TS7 for every program closure on a cold snapshot. The first selection in
  // a process pays that startup; later selections reuse the content-keyed membership snapshot. Spelled
  // `scaledBudget` from the vitest seam like the other ~70 suites: identical arithmetic over the same
  // policy, and the seam is also the door that refuses a mis-spelled `ORB_BOX_LOAD` in a worker (#1666).
  scaledBudget(20_000),
);

test("resolveSelection: a DELETED path lints clean — dropped from the tool file-lists, KEPT in paths + its tsconfig", {
  timeout: AFFECTED_PLAN_TIMEOUT,
}, () => {
  // The D79 same-commit-deletion doctrine: a git-changed set carries deleted paths (git diff --name-only
  // HEAD keeps them). eslint/depcruise/docs take CONCRETE file args and hard-error on a path that's gone
  // ("No files matching the pattern" ⇒ the whole stage aborts) — so those views must DROP the deletion,
  // while `paths` (the structure walk) + `tsconfigs` (the deleted file's owning per-package typecheck) KEEP
  // it. A co-changed EXISTING server file must survive in every view.
  const deleted = "packages/server/src/domain/discovery/substrate/json-extract.ts"; // a real T6 deletion
  const survivor = "packages/server/src/index.ts"; // exists on disk
  const sel = resolveSelection({ kind: "changed", paths: [deleted, survivor] });
  expect(sel.existingPaths).toEqual([survivor]);
  // eslint/depcruise drop the deletion but keep the survivor.
  expect(sel.eslintPaths).not.toContain(deleted);
  expect(sel.eslintPaths).toContain(survivor);
  expect(sel.depcruisePaths).not.toContain(deleted);
  expect(sel.depcruisePaths).toContain(survivor);
  // NOT a blanket drop: the deletion stays in `paths` (mirror/structure walk) and still drives the owning
  // per-package tsc (deleting a file can break its consumers — that package MUST re-typecheck).
  expect(sel.paths).toContain(deleted);
  expect(sel.tsconfigs).toContain("packages/server/tsconfig.json");
  expect(stage("lint:biome").scopedArgv?.(sel)).toEqual([
    "biome",
    "check",
    "--diagnostic-level=error",
    "--reporter=concise",
    "--no-errors-on-unmatched",
    survivor,
  ]);
  expect(stage("structure:full").scopedArgv?.(sel)).toEqual(["node", "tooling/src/verify/cli.ts", "scoped", "--changed", deleted, survivor]);
});

test("explicit selections refuse out-of-repository operands while preserving nonexistent in-repository deletions", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  expect(() => resolveSelection({ kind: "changed", paths: ["/tmp/outside-orbweaver.ts"] })).toThrow(/resolves outside repository/u);

  const deleted = "packages/server/src/does-not-exist-anymore.ts";
  const selection = resolveSelection({ kind: "changed", paths: [deleted] });
  expect(selection.paths).toEqual([deleted]);
  expect(selection.existingPaths).toEqual([]);
  expect(selection.tsconfigs).toContain("packages/server/tsconfig.json");
});

test("resolveSelection: bare --changed preserves modified, untracked, deleted, and both rename identities", () => {
  const scratch = mkdtempSync(join(tmpdir(), "orb-selection-git-"));
  const src = join(scratch, "packages/server/src");
  const toolingSrc = join(scratch, "tooling/src");
  mkdirSync(src, { recursive: true });
  mkdirSync(toolingSrc, { recursive: true });
  writeFileSync(join(src, "modified.ts"), "export const value = 1;\n");
  writeFileSync(join(src, "deleted.ts"), "export const deleted = true;\n");
  writeFileSync(join(src, "rename-old.ts"), "export const renamed = true;\n");
  writeFileSync(join(toolingSrc, "tracked.ts"), "export const tracked = true;\n");
  writeFileSync(join(toolingSrc, "deleted.ts"), "export const deleted = true;\n");
  writeFileSync(join(scratch, ".gitignore"), "tooling/src/ignored.ts\n");
  execFixtureGit(scratch, ["init", "-q"]);
  execFixtureGit(scratch, ["config", "user.email", "selection-test@example.invalid"]);
  execFixtureGit(scratch, ["config", "user.name", "Selection Test"]);
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-qm", "fixture"]);

  writeFileSync(join(src, "modified.ts"), "export const value = 2;\n");
  rmSync(join(src, "deleted.ts"));
  renameSync(join(src, "rename-old.ts"), join(src, "rename-new.ts"));
  execFixtureGit(scratch, ["add", "-A"]);
  writeFileSync(join(src, "modified.ts"), "export const value = 3;\n");
  writeFileSync(join(src, "untracked.ts"), "export const untracked = true;\n");
  rmSync(join(toolingSrc, "deleted.ts"));
  writeFileSync(join(toolingSrc, "untracked.ts"), "export const untracked = true;\n");
  writeFileSync(join(toolingSrc, "ignored.ts"), "export const ignored = true;\n");

  try {
    const selected = workingChangeClassification(scratch);
    expect(selected.paths.toSorted()).toEqual([
      "packages/server/src/deleted.ts",
      "packages/server/src/modified.ts",
      "packages/server/src/rename-new.ts",
      "packages/server/src/rename-old.ts",
      "packages/server/src/untracked.ts",
      "tooling/src/deleted.ts",
      "tooling/src/untracked.ts",
    ]);
    expect(selected.existingPaths.toSorted()).toEqual([
      "packages/server/src/modified.ts",
      "packages/server/src/rename-new.ts",
      "packages/server/src/untracked.ts",
      "tooling/src/untracked.ts",
    ]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("resolveSelection carries root programs directly in the complete affected plan", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  const sel = resolveSelection({ kind: "file", paths: ["tests/tooling/verify/ops/run.int.test.ts"] });
  expect(sel.tsconfigs).toContain("tsconfig.json");
  const pkg = resolveSelection({
    kind: "file",
    paths: ["packages/client/src/main.tsx"],
  });
  expect(pkg.tsconfigs).not.toContain("tsconfig.json");
});

test("resolveSelection: an import-pulled src file DOES flag the graph (the TS2584 overlay, rule 5)", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  // tokens/index.ts is transitively imported by the DOM-less root graph (confirmed via tsgo
  // --listFilesOnly) — so it belongs to TWO programs (packages/ui WITH dom AND the graph DOM-less). Editing
  // it must include the root Node program, or the TS2584-class break (a graph consumer of a DOM-typed export) escapes at
  // verify --file. Its per-package owner stays ui (the graph is a separate stage, not a tsc -p owner).
  // THE SUBJECT MOVED (#1231, #1243 fallout): this pinned `primitives/button/variants.ts` until #1243
  // excluded `tests/ui` from the root program — those two specs were its ONLY graph-rooted importers, so
  // the file silently left the overlay and this proof went red while `structure:full` stayed clean (a node
  // suite, not a gate). The token vault is the durable choice: `tooling/src` reads it directly, so the
  // overlay membership does not depend on which test tree is in the graph this month.
  const sel = resolveSelection({
    kind: "file",
    paths: ["packages/ui/src/tokens/index.ts"],
  });
  expect(sel.tsconfigs).toEqual([
    "packages/client/tsconfig.json",
    "packages/ui/tsconfig.json",
    "tooling/tsconfig.json",
    "tsconfig.json",
    "tsconfig.tests-dom.json",
  ]);
});

test("types:native scopedArgv forwards every affected program and skips a docs-only selection", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  const pkgSel = resolveSelection({
    kind: "file",
    paths: ["packages/client/src/main.tsx"],
  });
  expect(stage("types:native").scopedArgv?.(pkgSel)).toEqual(["pnpm", "typecheck", ...pkgSel.tsconfigs.flatMap((config) => ["--config", config])]);
  const testSel = resolveSelection({ kind: "file", paths: ["tests/tooling/x.int.test.ts"] });
  expect(stage("types:native").scopedArgv?.(testSel)).toEqual(["pnpm", "typecheck", ...testSel.tsconfigs.flatMap((config) => ["--config", config])]);
  const docs = resolveSelection({ kind: "file", paths: ["docs/law/Constitution.md"] });
  expect(stage("types:native").scopedArgv?.(docs)).toBe("skip-empty");
});

test("a shared ambient selects every runnable native program", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  const selection = resolveSelection({ kind: "file", paths: ["reset.d.ts"] });
  const runnable = readCompilerPrograms(process.cwd())
    .filter(({ files }) => files.length > 0)
    .map(({ config }) => config)
    .toSorted();
  expect(selection.tsconfigs).toEqual(runnable);
  expect(stage("types:native").scopedArgv?.(selection)).toEqual(["pnpm", "typecheck", ...runnable.flatMap((config) => ["--config", config])]);
});

test("the composed changed-tier plan executes the complete native plan", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  const graphSubject = resolveSelection({ kind: "file", paths: ["tests/tooling/verify/ops/run.int.test.ts"] });
  expect(planStage(stage("types:native"), graphSubject, "changed", process.cwd())).toMatchObject({
    mode: "scoped",
    argv: ["pnpm", "typecheck", ...graphSubject.tsconfigs.flatMap((config) => ["--config", config])],
  });
  expect(planStage(stage("structure:full"), graphSubject, "changed", process.cwd())).toMatchObject({
    mode: "scoped",
    argv: ["node", "tooling/src/verify/cli.ts", "scoped", "--changed", "tests/tooling/verify/ops/run.int.test.ts"],
  });
});

test("types:native per --package runs every imported consumer exactly once", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  for (const name of ["kit", "server", "db", "contracts", "ui", "client"]) {
    const selection = resolveSelection({ kind: "package", name });
    expect(stage("types:native").scopedArgv?.(selection), name).toEqual([
      "pnpm",
      "typecheck",
      ...selection.tsconfigs.flatMap((config) => ["--config", config]),
    ]);
    expect(new Set(selection.tsconfigs).size).toBe(selection.tsconfigs.length);
  }
});

// ── #2277 RE-POINTED THIS PIN, AND THE RULING IT GUARDS SURVIVES INTACT ─────────────────────────────
//
// WHAT IT ASSERTED, AND WHY THAT SPELLING IS NOW WRONG. Until #2277 this test read
// `expect(stage(name).scopedArgv).toBeUndefined()` for nine stages, under the title "whole-only (no
// scopedArgv)". The RULING behind it — stated in each row's own registry header — is that these stages
// have **no honest SCOPED form**: "a census derived from a scoped fileset is a census of a different
// tree"; "a coverage verdict derived from a partial schema would call every unwalked column
// unclassified"; "a policy's proofs are its own fixtures, not a property of any changed file".
// `scopedArgv === undefined` was the PROXY for that ruling, not the ruling.
//
// #2277 gives eight of them a PATH TRIGGER (../../../../tooling/src/verify/lib/registry-triggers.ts,
// which also carried the retired `docs:catalog` stage's own bespoke version of this mechanism): at a
// scoped tier they now run their OWN WHOLE `argv` when the selection touches the paths that can change
// their verdict, and `skip-empty` when it does not. The trigger changes WHEN a stage runs and never WHAT
// it reads — so the ruling is untouched and the proxy is obsolete.
//
// SO THE PIN IS STRONGER NOW, NOT WEAKER: instead of "there is no scopedArgv" it asserts THE THING THE
// RULING ACTUALLY SAYS — a triggered run is BYTE-FOR-BYTE the whole-scope argv, never a narrowed fileset.
// A future edit that hands one of these a partial file list reds here, which the old spelling could not
// have caught (it would have gone green the moment `scopedArgv` became undefined again).
// #2304 adds three identity-triggered whole commands below; their complete input cannot be narrowed, and
// their measured cost admits running them for every non-empty changed selection.

test("#2277 — a path-triggered stage runs its WHOLE argv or nothing: the no-honest-scoped-form ruling, pinned directly", {
  timeout: AFFECTED_PLAN_TIMEOUT,
}, () => {
  // Each pair is [stage, a path that MUST trigger it] — taken from the trigger table's stated subject.
  for (const [name, triggering] of [
    // The whole-tree ownership reconciliation over every type program.
    ["types:ownership", "packages/kit/src/ids/index.ts"],
    // tests-execution-membership's #22 sibling: unions every runner's --list view.
    ["tests:execution-membership", "tests/tooling/verify/ops/run.int.test.ts"],
    // The whole schema module vs the ONE committed baseline.
    ["structure:db-baseline", "packages/db/src/schema/index.ts"],
    // The whole schema module vs the ONE asset-ref registry.
    ["structure:asset-refs", "packages/db/src/schema/index.ts"],
    // The ONE migrations dir's journal/snapshot chain.
    ["structure:drizzle-kit", "packages/db/src/migrations/0000_baseline.sql"],
    // #1941: the roster is the corpus, and the gate modules are what move it.
    ["structure:policy-conformance", "tooling/src/verify/gates/tooling-size.ts"],
    // The PreToolUse Bash guard's own glob — the #2220 stage, and the tightest trigger in the table.
    ["lint:hook-syntax", ".claude/hooks/tool-guard.mjs"],
    // agent-sync's six coordinates. #2266 sat red on main through several folds for want of this row.
    ["structure:agent-config", ".claude/agents/executor.md"],
  ] as const) {
    const row = stage(name);
    const hit = resolveSelection({ kind: "file", paths: [triggering] });
    expect(row.scopedArgv?.(hit), `${name}: a triggered run is the WHOLE command, never a narrowed fileset`).toEqual(row.argv);
    // AND THE NEGATIVE DIRECTION, without which the arm above would pass against a trigger that matched
    // everything — which is the shape that would quietly put all eight on every scoped run.
    const miss = resolveSelection({ kind: "file", paths: ["README.md"] });
    expect(row.scopedArgv?.(miss), `${name}: an untouched subject is not owed`).toBe("skip-empty");
  }
});

test("#2277 — the DECLINED rows keep deferring: no path set over-approximates their inputs", () => {
  // THE HALF THAT KEEPS THE MECHANISM HONEST. A trigger's untriggered arm is `skip-empty`, which the
  // summary renders as "skipped (no files in scope)" — an affirmative claim that the stage was NOT OWED.
  // For these, no pattern can support that claim (knip is reachability over the whole import graph and
  // e2e is cross-cutting by nature), so they carry NO
  // trigger and keep deferring with the notice that names where they do run. `registry-triggers.ts` states
  // each reason beside its `null`, and this arm is what stops one being "fixed" into a false clean.
  for (const name of ["deps:knip", "browser:e2e-smoke", "browser:e2e"]) {
    expect(stage(name).scopedArgv, `${name} must stay deferred, not skipped`).toBeUndefined();
  }
});

test("#2304 — the cheap identity-triggered checks run their whole command for every changed selection", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  for (const name of ["types:testd", "config:biome-rule-liveness", "config:knip-negative-liveness", "ledgers:fresh"]) {
    const row = stage(name);
    for (const path of ["README.md", "packages/kit/src/ids/index.ts"]) {
      const selection = resolveSelection({ kind: "file", paths: [path] });
      expect(row.scopedArgv?.(selection), `${name}: ${path}`).toEqual(row.argv);
    }
  }
});

test("types:native includes DOM roots and imported production consumers", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  for (const paths of [["tests/client/agent-nav/index.dom.test.ts"], ["packages/kit/src/ids/index.ts"]]) {
    const selection = resolveSelection({ kind: "file", paths });
    expect(selection.tsconfigs).toContain("tsconfig.tests-dom.json");
    expect(stage("types:native").scopedArgv?.(selection)).toEqual(["pnpm", "typecheck", ...selection.tsconfigs.flatMap((config) => ["--config", config])]);
  }
  for (const name of ["ui", "kit", "tooling"]) {
    const selection = resolveSelection({ kind: "package", name });
    expect(selection.tsconfigs, name).toContain("tsconfig.tests-dom.json");
  }
});

test("helper-world files and folders reach dependency enforcement without adding unrelated support trees", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  const helper = "tests/support/node/route-trpc.ts";
  const selected = resolveSelection({ kind: "file", paths: [helper] });
  expect(selected.depcruisePaths).toEqual([helper]);
  expect(stage("imports:depcruise").scopedArgv?.(selected)).toContain(helper);
  expect(resolveSelection({ kind: "scope", glob: "tests/support/browser/**" }).depcruisePaths).toEqual(["tests/support/browser"]);
  expect(resolveSelection({ kind: "scope", glob: "tests/support/chat/**" }).depcruisePaths).toEqual([]);
});

test("lint:eslint scopedArgv: skip-empty when no file is in the eslint surface", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  // A docs file is outside every eslint `files` pattern AND outside the script's argv — the honest
  // no-op. (This pin USED to use a `tooling/src/**` path; tooling joined the eslint surface on
  // 2026-08-22 (#459), so that path now correctly RESOLVES — see the pin directly below.)
  const sel = resolveSelection({ kind: "file", paths: ["docs/law/Constitution.md"] });
  expect(stage("lint:eslint").scopedArgv?.(sel)).toBe("skip-empty");
});

test("lint:eslint scopedArgv: tooling AND every test dir are in the eslint surface (#459, #473)", { timeout: scaledBudget(30_000) }, () => {
  // The surface has two halves that must agree or the coverage is a lie: the `lint:eslint` SCRIPT argv
  // (package.json) and this selection regex. Before #459 NEITHER named tooling — eslint answered "File
  // ignored because no matching configuration" and the scoped lane silently linted nothing there, which
  // is how 36 un-awaited async matchers (assertions that could not fail their own test) survived. #473
  // closed the same hole over the REST of the test tree; this pin is what stops either half regressing.
  const sel = resolveSelection({ kind: "file", paths: ["tooling/src/verify/lib/registry.ts"] });
  // Scoped files use the native adapter directly. Whole lint enters the verify ESLint operation, which
  // partitions by compiler owner and invokes the same adapter once per sequential child.
  expect(stage("lint:eslint").scopedArgv?.(sel)).toEqual([
    "node",
    "scripts/eslint.ts",
    "--max-warnings",
    "0",
    "--no-warn-ignored",
    "--cache",
    "--cache-strategy",
    "content",
    "--cache-location",
    ".cache/eslint/scoped.eslintcache",
    "tooling/src/verify/lib/registry.ts",
  ]);
  // Every test dir, named individually — a `tests/` regex arm that silently lost one is the exact
  // failure this pin exists for, and only a per-dir assertion catches it.
  const testFiles = [
    "tests/tooling/verify/ops/run.int.test.ts",
    "tests/server/entry/http/spa.test.ts",
    "tests/kit/ids/index.test-d.ts",
    "tests/db/client.int.test.ts",
    "tests/contracts/portability/index.contract.test.ts",
    "tests/support/tool-fixtures.ts",
    "tests/e2e/support/global-setup.ts",
    "tests/ui/stream/snap.test.ts",
    "tests/client/state/create-entity-draft-store.test.ts",
  ];
  for (const file of testFiles) {
    expect(resolveSelection({ kind: "file", paths: [file] }).eslintPaths).toEqual([file]);
  }
  // ...and the SCRIPT half, pinned against package.json itself — a regex that agreed with nothing would
  // read exactly like coverage.
  const eslintPkg = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")) as {
    readonly scripts: Record<string, string>;
  };
  expect(eslintPkg.scripts["lint:eslint"]).toContain("tooling/src/verify/cli.ts eslint");
});

test("lint:eslint reaches root and package-root Node tools through shared world intent", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  for (const file of ["knip.ts", "playwright-ct.config.ts", "packages/ui/token-contract.ts"]) {
    expect(resolveSelection({ kind: "file", paths: [file] }).eslintPaths).toEqual([file]);
  }
  const eslintPkg = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")) as {
    readonly scripts: Record<string, string>;
  };
  expect(eslintPkg.scripts["lint:eslint"]).toContain("tooling/src/verify/cli.ts eslint");
});

test("structure:full scopedArgv: routes to scoped.ts with the selection's flag (walk-scoped gates)", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  const sel = resolveSelection({ kind: "package", name: "ui" });
  expect(stage("structure:full").scopedArgv?.(sel)).toEqual(["node", "tooling/src/verify/cli.ts", "scoped", "--package", "ui"]);
});

// ── the CT changed-scope view (§3.4, the ONE deliberately-open edge, LANDED 2026-07-17) — mirror + the
// declared blast-radius sweeps. Scoped CT UNDER-selects on purpose; the push bar is the coverage verdict. ──

test("ct view: a ui primitive source selects EXACTLY its test-layout mirror .ct.tsx", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  // badge.tsx mirrors to tests/ui/primitives/badge/badge.ct.tsx (exists on disk) — mode "files", that one.
  const sel = resolveSelection({ kind: "changed", paths: ["packages/ui/src/primitives/badge/badge.tsx"] });
  expect(sel.ct).toEqual({ mode: "files", targets: ["tests/ui/primitives/badge/badge.ct.tsx"] });
});

test("ct view: a source with NO mirror on disk contributes nothing (no mirror, no CT)", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  // index.ts barrels have no `.ct.tsx` mirror — the existsSync guard drops them (no contribution → skip).
  const sel = resolveSelection({ kind: "changed", paths: ["packages/ui/src/primitives/badge/index.ts"] });
  expect(sel.ct).toEqual({ mode: "skip", targets: [] });
});

test("ct view: a tokens file SWEEPS both trees (the light-dark()/computed-style incident class)", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  const sel = resolveSelection({ kind: "changed", paths: ["packages/ui/src/tokens/semantic.ts"] });
  expect(sel.ct.mode).toBe("sweep");
  expect(sel.ct.targets.toSorted()).toEqual(["tests/client", "tests/ui"]);
});

test("ct view: a client state/ file SWEEPS tests/client only (the section-registry incident class)", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  const sel = resolveSelection({ kind: "changed", paths: ["packages/client/src/state/active-chat-store.ts"] });
  expect(sel.ct).toEqual({ mode: "sweep", targets: ["tests/client"] });
});

test("ct view: a server-only change → skip (no CT surface)", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  const sel = resolveSelection({ kind: "changed", paths: ["packages/server/src/index.ts"] });
  expect(sel.ct).toEqual({ mode: "skip", targets: [] });
});

test("ct view: a changed .ct.tsx selects ITSELF", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  const ct = "tests/ui/primitives/badge/badge.ct.tsx";
  const sel = resolveSelection({ kind: "changed", paths: [ct] });
  expect(sel.ct).toEqual({ mode: "files", targets: [ct] });
});

test("ct view: a .suite.ct.tsx is NEVER mirror-selected (it mirrors no single module — rides sweeps only)", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  // The touch-target-floor cross-cutting suite: changed alone, it selects nothing (it is not a module mirror).
  const sel = resolveSelection({ kind: "changed", paths: ["tests/ui/touch-target-floor.suite.ct.tsx"] });
  expect(sel.ct).toEqual({ mode: "skip", targets: [] });
});

test("ct view: a shared GROUP CORE sweeps its group dir; a chart source's mirror stays file-scoped", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  // charts/chart/** is consumed by every chart primitive → sweep the whole charts group mirror.
  const core = resolveSelection({ kind: "changed", paths: ["packages/ui/src/charts/chart/chart.tsx"] });
  expect(core.ct).toEqual({ mode: "sweep", targets: ["tests/ui/charts"] });
});

test("browser:ct scopedArgv: skip-empty on no CT surface; the one-slot CT launcher otherwise", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  const skip = resolveSelection({ kind: "changed", paths: ["packages/server/src/index.ts"] });
  expect(stage("browser:ct").scopedArgv?.(skip)).toBe("skip-empty");
  // A mirror hit → the scoped launcher, which opens the one invocation slot before Playwright loads config.
  // It keeps retries at the config's 0 default, so the inner loop still exposes a transient raw.
  const hit = resolveSelection({ kind: "changed", paths: ["packages/ui/src/primitives/badge/badge.tsx"] });
  expect(stage("browser:ct").scopedArgv?.(hit)).toEqual(["pnpm", "test:ct", "tests/ui/primitives/badge/badge.ct.tsx"]);
});

// ── tests:node's derived-empty selection (#1272) — a red that means "there was nothing to run" ──
// THE DEFECT: `pnpm verify --scope <path>` exited 1 on a CLEAN COMMITTED tree whose identical content
// exited 0 minutes earlier while uncommitted. The scoped child is `vitest … --changed`, which selects
// nothing on a clean tree; the repo's `vitest.config.ts` sets `passWithNoTests: false`, so vitest prints
// "No test files found, exiting with code 1" and `asViolations` scores that digit as VIOLATIONS. §L tells
// lanes to commit and then report receipts, so the door reds exactly when a lane is told to walk it.
// THE FIX is `--passWithNoTests` on the SCOPED argv alone. `vitest.config.ts:134` sets `passWithNoTests: false`
// repo-wide so a lane whose include glob matches NOTHING (a typo'd pattern, a moved tree) FAILS instead of
// passing, and that ruling SURVIVES here — its INPUT changed. It judges an ASSERTED
// selector (a config include glob asserts a fileset); this argv's selector is always the DERIVED
// `--changed` one, which AGENTS.md "Verification tiers" and ops/scoped.ts's `emptyScopeNotice` already rule CLEAN when
// empty. The asserted-selector class stays guarded: `tests:execution-membership` REDs a runner view matching ZERO
// files at the STATIC tier, and every whole-scope `pnpm test` still runs at `passWithNoTests: false`.

test("tests:node scopedArgv: git changes stay derived, while explicit source/test/folder/package subjects reach Vitest", {
  timeout: AFFECTED_PLAN_TIMEOUT,
}, () => {
  // The Git-derived arm keeps Vitest's VCS selector and its derived-empty allowance. Explicit test claims
  // enter the runner's zero-match preflight; source and mixed claims enter native `related`. Folder
  // subjects were already expanded from Git's authored inventory by the shared Selection resolver.
  const derived = resolveSelection({ kind: "changed", paths: [] });
  expect(stage("tests:node").scopedArgv?.(derived)).toEqual(["pnpm", "test:scoped", "--passWithNoTests", "--changed", "HEAD"]);
  const explicit = resolveSelection({ kind: "file", paths: ["packages/server/src/index.ts"] });
  expect(stage("tests:node").scopedArgv?.(explicit)).toEqual(["pnpm", "test:scoped", "--related", "packages/server/src/index.ts"]);
  const explicitTest = resolveSelection({ kind: "file", paths: ["tests/tooling/verify/lib/registry.test.ts"] });
  expect(stage("tests:node").scopedArgv?.(explicitTest)).toEqual(["pnpm", "test:scoped", "tests/tooling/verify/lib/registry.test.ts"]);
  const folder = resolveSelection({ kind: "scope", glob: "tooling/src/verify/ops" });
  const folderArgv = stage("tests:node").scopedArgv?.(folder);
  expect(folderArgv).not.toBe("whole-only");
  expect(folderArgv).not.toBe("skip-empty");
  expect(folderArgv?.slice(0, 3)).toEqual(["pnpm", "test:scoped", "--related"]);
  expect(folderArgv).toContain("tooling/src/verify/ops/run.ts");

  const packageSelection = resolveSelection({ kind: "package", name: "server" });
  expect(stage("tests:node").scopedArgv?.(packageSelection)).toEqual(["pnpm", "test:scoped", "tests/server"]);
  // The OTHER half of the ruling: the WHOLE-scope argv asserts the whole suite, where zero test files means
  // the runner broke. It must never carry the flag — that is what keeps the asserted-selector ruling alive
  // where it applies.
  expect(stage("tests:node").argv).toEqual(["pnpm", "test:node"]);
  expect(stage("tests:node").argv).not.toContain("--passWithNoTests");
});

// THE BUDGET IS DECLARED, because this case SPAWNS TWO REAL VITEST RUNS (#2469). It never declared one and
// inherited vitest's 5s default, which was never sized for two cold boots of the repo's own config:
// MEASURED: 1.87s for one bare spawn on a quiet box, and 12.66s for this case end to end inside its own
// scoped suite run (the niced transcript capture and the two runner boots together) — so 5s was never
// enough, and it happened to pass only by finishing before vitest's clock in the runs that saw it.
// `scaledBudget(30_000)` is sized off that 12.66s. `scaledBudget` is the load-aware instrument
// every other long case in this file already uses — the slow path here is two real runner boots and is the
// point of the test, so what was wrong was the missing declaration, not the duration.
test("tests:node: the repo's own config is what reds an empty selection, and ONLY the CLI flag lifts it (#1272 mechanism, both directions)", {
  timeout: scaledBudget(30_000),
}, async () => {
  // A planted control in both directions against the REAL binary under the REAL config — vitest 4 defaults
  // `passWithNoTests` to TRUE, so a scratch-repo probe would prove nothing about this repo. The filter names
  // no file on any tree, which is the cheapest way to reach the same "no test files" branch deterministically
  // (a `--changed` selection's emptiness depends on the working tree and cannot be pinned).
  const filter = "tests/__pscopedred_no_such_test_file__.test.ts";
  const red = await spawnNicedTranscript("./node_modules/.bin/vitest", ["run", "--project", "unit", filter], CAPTURE_OPTS);
  expect(red.code).toBe(1);
  expect(red.transcript).toContain("No test files found, exiting with code 1");
  expect(asViolations(red.code)).toBe(1); // …and the classifier scores that digit as VIOLATIONS — the false red

  const clean = await spawnNicedTranscript("./node_modules/.bin/vitest", ["run", "--project", "unit", "--passWithNoTests", filter], CAPTURE_OPTS);
  expect(clean.code).toBe(0);
  expect(clean.transcript).toContain("No test files found, exiting with code 0");
});

// ── argv parsing (parseArgs, strict schema §3.4) — the misuse (exit 3) matrix + good invocations ──

test("parse: an UNKNOWN flag is misuse (exit 3), never silent-ignore", () => {
  expect(isMisuse(["--bogus", "--list"])).toBe(true);
});

test("parse: a value option with NO value (or a flag as its value) is misuse", () => {
  expect(isMisuse(["--package"])).toBe(true); // no value
  expect(isMisuse(["--package", "--json"])).toBe(true); // next token is a flag, not a value
  expect(isMisuse(["--scope"])).toBe(true);
  expect(isMisuse(["--tier"])).toBe(true);
});

test("parse: --package=db (inline value) parses and runs (not misuse)", { timeout: AFFECTED_PLAN_TIMEOUT }, () => {
  const r = parse(["--package=db", "--list"]);
  expect("error" in r).toBe(false);
});

test("parse: --file with no path is misuse; --file a b (space-separated paths) parses", () => {
  expect(isMisuse(["--file"])).toBe(true);
  expect(isMisuse(["--file", "nonexistent-xyz-123.ts"])).toBe(true); // path not under repo/nonexistent
  const r = parse(["--file", "tooling/src/verify/ops/run.ts", "tooling/src/verify/lib/registry.ts"]);
  if ("error" in r) {
    throw new Error(`expected a parse, got misuse: ${r.error}`);
  }
  expect(r.selection?.kind).toBe("file");
  expect(r.selection?.paths).toEqual(["tooling/src/verify/ops/run.ts", "tooling/src/verify/lib/registry.ts"]);
});

test("parse: more than one scope selector is misuse", () => {
  expect(isMisuse(["--package", "db", "--scope", "packages/ui"])).toBe(true);
});

test("parse: more than one tier is misuse; --tier <bad> is misuse", () => {
  expect(isMisuse(["--static", "--push"])).toBe(true);
  expect(isMisuse(["--tier=bogus"])).toBe(true);
});

test("parse: bare positionals with no scope selector are misuse (not silently dropped)", () => {
  expect(isMisuse(["foo", "bar"])).toBe(true);
});

test("parse: valid tier flags resolve to the right tier (default = static, scope implies changed)", () => {
  const asTier = (argv: readonly string[]): string | undefined => {
    const r = parse(argv);
    return "error" in r ? undefined : r.tier;
  };
  expect(asTier([])).toBe("static"); // default
  expect(asTier(["--push"])).toBe("push");
  expect(asTier(["--full"])).toBe("full");
  expect(asTier(["--tier", "push"])).toBe("push");
  // Use a docs-only scope here: this row owns tier selection, while the dedicated --package=db case above
  // owns package affected-planning under AFFECTED_PLAN_TIMEOUT.
  expect(asTier(["--file", "docs/law/Constitution.md"])).toBe("changed"); // a scope flag implies the changed (inner-loop) tier
  expect(asTier(["--changed", "git"])).toBe("changed");
});

// ── null-spawn end-to-end (§3.3): a STAGE whose child fails to spawn (nonexistent bin ⇒ ENOENT ⇒ status
// null) must surface as tool-error (2) at the RUN's aggregated exit, never a silent 0. The classifiers are
// unit-pinned above; this drives the real spawn→classify→aggregate path with a genuine failed spawn. ──

test("a stage whose child fails to spawn (ENOENT) aggregates to tool-error (2), not a silent 0", () => {
  // A REAL failed spawn: a nonexistent binary. Node's spawnSync returns status:null (signal:null, error
  // ENOENT) — the exact shape a signal-kill also produces, which the classifiers map to 2.
  const result = spawnSync("orb-nonexistent-binary-xyz-123", ["--noop"], {
    shell: false,
    encoding: "utf8",
  });
  expect(result.status).toBeNull();

  // Feed the real child status through a real stage's real classify (asViolations here) exactly as
  // run.ts's runOneStage does, then through the real run-level aggregation.
  const failedStageExit = stage("lint:biome").classify(result.status);
  expect(failedStageExit).toBe(2); // null spawn ⇒ TOOL-ERROR, not a violation and not clean

  // A run where every OTHER stage was clean still exits 2 — the failed spawn dominates, no silent 0.
  const runExit = aggregateExit([0, 0, failedStageExit, 0]);
  expect(runExit).toBe(2);
});

test("every stage carries a classify + non-empty tiers", () => {
  for (const s of REGISTRY) {
    expect(s.tiers.length).toBeGreaterThan(0);
    expect(typeof s.classify).toBe("function");
  }
});

// A stage NAME is an IDENTITY, not a label: run.ts derives the stage's log path from it
// (`reports/verify/<name with ':'→'-'>.log`) and keys the run artifact's per-stage row by it, while every
// lookup — this file's `stage()`, and any `--stage`-shaped selection — is a first-match `.find`. Two rows
// sharing a name (or two names that FLATTEN to the same log file: "a:b" and "a-b" both land on `a-b.log`)
// would silently overwrite one another's output and hide the second row behind the first — a verification
// stage that ran but whose evidence is gone. The registry's `name` doc says "kebab, unique"; nothing enforced
// it. (The other two completeness arms are already covered: the `verify-registry-parity` gate reconciles both
// directions between the registry and package.json — arm 1 = an unplaced verification-shaped script, arm 2 =
// a registry row whose `pnpm <script>` argv names no script — exercised below.)
const STAGE_NAME_RE = /^[a-z0-9]+(?:[:-][a-z0-9]+)*$/u;

test("stage names are unique, kebab, and collide-free as log filenames", () => {
  const names = REGISTRY.map((s) => s.name);
  expect(new Set(names).size).toBe(names.length);

  const logNames = names.map((n) => n.replace(/:/gu, "-"));
  expect(new Set(logNames).size).toBe(logNames.length);

  expect(names.filter((n) => !STAGE_NAME_RE.test(n))).toEqual([]);
});

test("every manual-tier stage carries a reason", () => {
  const manualWithoutReason = REGISTRY.filter((s) => s.tiers.includes("manual") && s.manualReason === undefined);
  expect(manualWithoutReason).toEqual([]);
});

// ── V4 verify-registry-parity (§3.6) — ONE HOME, and it is the gate's own conformance rows ──
// The three standalone cases that used to sit here (arm 1 bites · arm 1 no-over-bite on the allowlist ·
// arm 2 guarded on a dev-only package.json) were deleted 2026-08-22 (#417 F5): the gate is `fsBacked`, so
// the conformance runner already materializes a real temp dir and drives every one of those behaviors
// through the SAME dispatcher — tooling/src/verify/gates/verify-registry-parity.ts's mustFlag/mustPass.
// The one behavior conformance did not yet carry (the `check:show` INSPECTOR half of the allowlist) moved
// into that gate's first mustPass row in the same commit; nothing was dropped.

// ── the stage transcript (#259) — the log/excerpt a failure is READ from ──
// The stage runner used to capture with spawnSync and store `stdout + stderr` (whole-stream CONCATENATION).
// Consequences it cost a night to diagnose: (1) for a compound stage the transcript ENDED with the tail of
// stderr — pnpm's `$ …` banner + node ExperimentalWarnings — while the real verdict sat mid-file, so
// reports/verify.json's failureExcerpt reported warning noise and a hard CT failure read as a silent death;
// (2) spawnSync's DEFAULT maxBuffer does not truncate, it TERMINATES the child, so a chatty stage would
// have been killed mid-suite. Both are pinned here through the ONE proc door's public result
// (`spawnNicedTranscript` — ops/run.ts's own spawn moved there at the @orb/tooling P6 move).

/** The running node, addressed by absolute path. The child env carries PATH ONLY — the door execs through
 *  `nice`, which has to be resolvable, and nothing else may leak in (the capture stays deterministic under
 *  any caller's environment). */
const NODE_BIN = process.execPath;
// biome-ignore lint/style/noProcessEnv: the child needs a resolvable PATH for `nice` and NOTHING else — reading the parent's PATH here IS the point, not app config.
const CAPTURE_OPTS = { cwd: process.cwd(), env: Object.fromEntries([["PATH", process.env["PATH"] ?? ""]]), timeoutMs: scaledBudget(120_000) } as const;

/** A child that writes to stderr FIRST and puts its verdict LAST on stdout — the compound-stage shape. */
const VERDICT_CHILD = "process.stderr.write('warn: noise\\n'); setTimeout(() => { process.stdout.write('THE VERDICT\\n'); process.exit(3); }, 150);";

test("spawnNicedTranscript: the transcript is CHRONOLOGICAL — a stdout verdict after stderr noise is LAST (not buried by stream concatenation)", async () => {
  const cap = await spawnNicedTranscript(NODE_BIN, ["-e", VERDICT_CHILD], CAPTURE_OPTS);
  expect(cap.code).toBe(3);
  expect(cap.transcript).toContain("warn: noise");
  expect(cap.transcript.trimEnd().endsWith("THE VERDICT")).toBe(true);
});

test("spawnNicedTranscript: a stage far chattier than spawnSync's ~1 MiB maxBuffer is captured WHOLE and exits normally (no SIGTERM/ENOBUFS kill)", async () => {
  const bytes = 4 * 1024 * 1024;
  const cap = await spawnNicedTranscript(NODE_BIN, ["-e", `process.stdout.write('x'.repeat(${bytes}))`], CAPTURE_OPTS);
  expect(cap.code).toBe(0); // spawnSync's default cap returns status null + SIGTERM here
  expect(cap.transcript.length).toBe(bytes);
});

test("spawnNicedTranscript: a bin that does not exist is a TOOL error (status null ⇒ exit 2), with the reason in the transcript", async () => {
  const cap = await spawnNicedTranscript("./node_modules/.bin/definitely-not-a-real-bin", [], CAPTURE_OPTS);
  expect(cap.code).toBeNull();
  expect(asViolations(cap.code)).toBe(2);
  expect(cap.transcript).toContain("spawn failed");
});

// ── THE HOST-WIDE WHOLE-RUN QUEUE (#1835) ──────────────────────────────────────────────────────────────
// Two whole batteries on one box is never faster than one after the other, so `runVerify` takes a
// host-wide slot before its first stage. Pinned at the DOOR (`enterWholeRunQueue`) rather than by running
// a battery: the pool's own mechanics are tests/tooling/verify/lib/host-slots.test.ts, and what only this
// file can answer is WHICH RUNS QUEUE. The planted holder lives in a scratch runtime dir — never the real
// /run/user/<uid> pool, where it would block an operator's live `pnpm check`.

function parsedOrThrow(argv: readonly string[]): Parsed {
  const parsedArgv = parse(argv);
  if ("error" in parsedArgv) {
    throw new Error(`argv ${argv.join(" ")} did not parse: ${parsedArgv.error}`);
  }
  return parsedArgv;
}

function scratchQueueEnv(): NodeJS.ProcessEnv {
  return { [HOST_POOL_ROOT_ENV]: mkdtempSync(join(tmpdir(), "orb-verify-queue-")) };
}

test("a WHOLE verify run takes the host-wide queue slot; a SCOPED run does not (the inner loop must never wait)", async () => {
  const env = scratchQueueEnv();
  const whole = await enterWholeRunQueue(process.cwd(), parsedOrThrow(["--static"]), { env, pid: 30_001, alive: (pid) => pid === 30_001 });
  expect(whole?.slot, "a whole run holds the single host slot").toBe(1);
  // An explicit path keeps selection off the working change, whose compiler-closure plan is slow on a dirty tree.
  const scoped = await enterWholeRunQueue(process.cwd(), parsedOrThrow(["--changed", "docs/law/Constitution.md"]), { env, pid: 30_002, alive: () => true });
  expect(scoped, "a scoped run is exempt — it is the fast inner loop a lane runs beside a live battery").toBeNull();
  const commit = await enterWholeRunQueue(process.cwd(), parsedOrThrow(["--static", "--changed", "docs/law/Constitution.md"]), {
    env,
    pid: 30_003,
    alive: () => true,
  });
  expect(commit, "the pre-commit spelling is scoped, so a commit never waits behind a whole battery").toBeNull();
  whole?.release();
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("a second whole run QUEUES behind a live holder and says whose pid it is behind — it is never refused", async () => {
  const env = scratchQueueEnv();
  const held = await enterWholeRunQueue(process.cwd(), parsedOrThrow(["--push"]), { env, pid: 31_001, alive: (pid) => pid === 31_001 });
  expect(held?.slot).toBe(1);

  const queuedBehind: number[] = [];
  let clockMs = 5_000_000;
  const second = await enterWholeRunQueue(process.cwd(), parsedOrThrow(["--static"]), {
    env,
    pid: 31_002,
    alive: (pid) => pid === 31_001 || pid === 31_002,
    now: () => new Date(clockMs),
    // The wait is BUDGET-SCALED off a 45-minute base, so a real ceiling would take 45 wall-clock minutes to
    // reach; the injected clock jumps a day per poll and lands on the overflow arm in one iteration.
    sleep: (ms) => {
      clockMs += ms + 86_400_000;
      return Promise.resolve();
    },
    onQueued: (holder) => queuedBehind.push(holder.pid),
    onNotice: () => undefined,
  });
  expect(queuedBehind, "the waiter announces the run it is behind").toStrictEqual([31_001]);
  expect(second?.slot, "past the ceiling it runs as the overflow run — a refused verify breaks a merge train").toBeNull();

  held?.release();
  const third = await enterWholeRunQueue(process.cwd(), parsedOrThrow(["--static"]), { env, pid: 31_003, alive: (pid) => pid === 31_003 });
  expect(third?.slot, "once the holder releases, the slot is free again").toBe(1);
  third?.release();
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

// ── #2220 / #2225: A STAGE'S argv[0] AND THE VERDICT IT OWES ────────────────────────────────────────
//
// THE DEFECT. `ops/run.ts` resolved argv[0] through `PATH_RESOLVED = new Set(["pnpm","node"])`, sending
// every other name to `node_modules/.bin/<cmd>`. The `lint:hook-syntax` row's argv[0] is `bash`, so it
// resolved to a `.bin/bash` that does not exist; `spawnNicedTranscript` existence-checks a path-shaped
// command and returns `code: null`, which every classifier maps to 2. The stage exited TOOL ERROR on every
// static run from the day it landed and NEVER produced a verdict — while the file it guards is the
// PreToolUse Bash guard, whose own syntax error makes the hook exit non-zero with no JSON, which the hook
// contract reads as a NON-BLOCKING error. Unguarded Bash in every session, behind a green push bar.
//
// THE CLASS (#2225). A registered stage that can never produce a verdict is invisible to its tier. So the
// pins below are in two layers: the resolver's rungs (what argv[0] IS, from evidence), and the two
// remedies — `--list` REFUSES an unrunnable row instead of printing it as runnable, and the run summary
// prints exit-2 stages FIRST.

// biome-ignore lint/style/noProcessEnv: the resolver's input IS the PATH a stage child would be spawned with — reading the parent's PATH here IS the measurement, not app config.
const PHSV_PATH = process.env["PATH"] ?? "";
/** Spawn options for the `lint:hook-syntax` arms: a resolvable PATH for `nice` + the loop's own `node`,
 *  and NO_COLOR so a planted SyntaxError arrives as greppable plain text (run.ts composes the same pair). */
function phsvSpawnOpts(cwd: string): { readonly cwd: string; readonly env: Record<string, string>; readonly timeoutMs: number } {
  return {
    cwd,
    env: Object.fromEntries([
      ["PATH", PHSV_PATH],
      ["NO_COLOR", "1"],
    ]),
    timeoutMs: scaledBudget(60_000),
  };
}

test("resolveStageCommand: the WORKSPACE BIN wins over a system program of the same name — that is the version pin", ({ scratch }) => {
  const bin = join(scratch, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  const system = join(scratch, "sysdir");
  mkdirSync(system, { recursive: true });
  // The same NAME in both places. The workspace copy is the one this repo installed and pinned.
  writeFileSync(join(bin, "phsv-tool"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  writeFileSync(join(system, "phsv-tool"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  const resolved = resolveStageCommand(scratch, "phsv-tool", system);
  expect(resolved.kind).toBe("workspace-bin");
  expect(resolved.kind === "workspace-bin" && resolved.command).toBe(join(bin, "phsv-tool"));
});

test("resolveStageCommand: a SYSTEM program resolves off PATH with no allowlist — the #2220 arm", ({ scratch }) => {
  const system = join(scratch, "sysdir");
  mkdirSync(system, { recursive: true });
  writeFileSync(join(system, "phsv-sys"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  // No node_modules/.bin at all, and "phsv-sys" is in no allowlist anywhere. Evidence is the whole test.
  const resolved = resolveStageCommand(scratch, "phsv-sys", system);
  expect(resolved.kind).toBe("system-program");
  expect(resolved.kind === "system-program" && resolved.command).toBe(join(system, "phsv-sys"));

  // A NON-EXECUTABLE file of the same name is not a program — the rung must not stop on it.
  const other = join(scratch, "sysdir2");
  mkdirSync(other, { recursive: true });
  writeFileSync(join(other, "phsv-sys"), "not a program\n", { mode: 0o644 });
  expect(resolveStageCommand(scratch, "phsv-sys", `${other}:${system}`).kind).toBe("system-program");
  expect(resolveStageCommand(scratch, "phsv-sys", other).kind, "a readable-but-not-executable file resolves NOTHING").toBe("unresolvable");
});

test("resolveStageCommand: an UNRESOLVABLE argv[0] refuses, and the refusal NAMES both places it looked", ({ scratch }) => {
  const resolved = resolveStageCommand(scratch, "phsv-absent-tool", join(scratch, "empty-path-dir"));
  expect(resolved.kind).toBe("unresolvable");
  if (resolved.kind !== "unresolvable") {
    throw new Error("unreachable");
  }
  const transcript = unresolvableCommandTranscript("lint:phsv", resolved);
  expect(transcript).toContain('REFUSED to run stage "lint:phsv"');
  expect(transcript).toContain("phsv-absent-tool");
  expect(transcript, "the workspace-bin path it checked").toContain(workspaceBinPath(scratch, "phsv-absent-tool"));
  expect(transcript, "and that PATH was searched").toContain("PATH director");
  // THE EXIT CONTRACT, not a courtesy: a refusal is a TOOL ERROR (2) — "the run is not a verdict" — and
  // never a violation (1). #2225's whole point is that a refusal wearing a finding's costume is the same
  // lie. `code: null` is what runOneStage settles the un-spawned stage with; every classifier maps it to 2.
  expect(stage("lint:hook-syntax").classify(null)).toBe(2);
  expect(stage("lint:eslint").classify(null)).toBe(2);
  expect(stage("types:native").classify(null)).toBe(2);
});

test("EVERY registry row's whole-scope argv[0] resolves on this checkout — the #2225 --list refusal, with its planted control", () => {
  // The real answer first: nothing in the registry is unrunnable here.
  expect(unrunnableRegistryRows(process.cwd(), PHSV_PATH)).toStrictEqual([]);
  // PLANTED POSITIVE CONTROL — a zero above is only evidence if a non-zero is reachable. Hand it a PATH
  // that resolves nothing and a root with no node_modules: every row must come back unrunnable, named.
  const blind = unrunnableRegistryRows(join(process.cwd(), "no-such-root-phsv"), "");
  expect(blind.length).toBe(REGISTRY.length);
  expect(blind.map((r) => r.name)).toContain("lint:hook-syntax");
});

test("lint:hook-syntax RUNS and produces a real verdict — clean on the tree, RED on a planted syntax error", async ({ scratch }) => {
  const row = stage("lint:hook-syntax");
  const [cmd, ...args] = row.argv;
  const resolved = resolveStageCommand(process.cwd(), cmd, PHSV_PATH);
  expect(resolved.kind, "#2220: argv[0] `bash` used to resolve to a nonexistent node_modules/.bin/bash").toBe("system-program");
  if (resolved.kind === "unresolvable") {
    throw new Error("unreachable");
  }

  // ARM 1 — the REAL repo: the stage executes and returns a VERDICT (0 or 1), never a tool error.
  const live = await spawnNicedTranscript(resolved.command, args, phsvSpawnOpts(process.cwd()));
  expect(row.classify(live.code), `the stage must MEASURE, not error: ${live.transcript}`).not.toBe(2);
  expect(row.classify(live.code), "and the repo's hooks parse").toBe(0);

  // ARM 2 — the detector actually detects. A scratch tree shaped like the glob: a COPY of the live hook
  // (never the real file — it gates this session's own Bash calls and a syntax error there fails OPEN)
  // plus one deliberately broken sibling.
  const hooks = join(scratch, ".claude", "hooks");
  mkdirSync(hooks, { recursive: true });
  cpSync(join(process.cwd(), ".claude", "hooks", "tool-guard.mjs"), join(hooks, "tool-guard.mjs"));
  const control = await spawnNicedTranscript(resolved.command, args, phsvSpawnOpts(scratch));
  expect(row.classify(control.code), "control: a copy of the real hook is clean").toBe(0);

  writeFileSync(join(hooks, "phsv-broken.mjs"), "export function guard( {\n  return 1;\n");
  const planted = await spawnNicedTranscript(resolved.command, args, phsvSpawnOpts(scratch));
  expect(row.classify(planted.code), "a syntax error in ANY .claude/hooks/*.mjs is a VIOLATION (1)").toBe(1);
  expect(planted.transcript).toContain("SyntaxError");

  rmSync(join(hooks, "phsv-broken.mjs"));
  const restored = await spawnNicedTranscript(resolved.command, args, phsvSpawnOpts(scratch));
  expect(row.classify(restored.code), "and it goes green again when the plant is removed").toBe(0);
});

test("the summary prints TOOL ERRORS first and leaves report.stages in registry order (#2225)", () => {
  const failing = (name: string, exitCode: 1 | 2 | 3): StageResult => ({
    name,
    group: "lint",
    mode: "full",
    ok: false,
    exitCode,
    durationMs: 1,
    logFile: `reports/verify/${name}.log`,
    failureExcerpt: null,
    runsAt: null,
    notices: [],
  });
  // Registry order puts the violation first and the tool error last — the shape that hid #2220 among
  // thirty rows. A reader scanning the first failing line must meet "nothing was measured" before "your
  // code has a lint finding".
  const stages = [failing("lint:biome", 1), failing("lint:eslint", 1), failing("lint:hook-syntax", 2), failing("types:native", 3)];
  expect(failuresWorstFirst(stages).map((s) => s.name)).toStrictEqual(["lint:hook-syntax", "types:native", "lint:biome", "lint:eslint"]);
  // STABLE within a severity: the two violations keep registry order, never an arbitrary shuffle.
  const sorted = failuresWorstFirst(stages);
  expect(sorted.slice(2).map((r) => r.name)).toStrictEqual(["lint:biome", "lint:eslint"]);
  // AND THE RECORD IS UNTOUCHED. The artifact is read by other instruments and by later runs; a reporter
  // may reorder what it PRINTS and must never reorder what it RECORDS.
  expect(stages.map((s) => s.name)).toStrictEqual(["lint:biome", "lint:eslint", "lint:hook-syntax", "types:native"]);
});

// ── #2225 PART 2: THE NO-VERDICT LIST — the half the `--list` refusal did not close ──────────────────
//
// WHAT WAS ALREADY THERE and is NOT re-proved here: `--list` refuses an unrunnable registry row (above),
// and `failuresWorstFirst` sorts tool-errors to the top of the FAIL block (above). Both are real and both
// are about a run's PRESENTATION ORDER or a registry's STATIC readability.
//
// WHAT WAS MISSING, and is the row's own general form — "a tier's own summary must NAME every stage whose
// exit class was 2 or whose `code` is null, and A BARRIER READS THAT LIST BEFORE THE RED COUNT". Before
// this pair, `VerifyReport` carried exactly one number for that question: `failed`, documented as
// "violations or tool-error". LUMPED. A bot reading reports/verify.json could not distinguish "a checker
// broke and nothing was measured" from "your code has a lint finding" without re-deriving the exit
// contract itself — which is precisely the re-derivation nobody performed for the day `lint:hook-syntax`
// sat at exit 2 (#2220).
//
// AND THE RAW CHILD EXIT NOW SURVIVES THE CLASSIFIER. `StageDef.classify` is per-stage DATA; the three
// adapters on the tree all map `null` to 2, but that is a property of three functions, not of the
// contract. The arms below include the LAUNDERING case — a row whose classifier answered CLEAN for a
// killed child — because that is the only shape that tells the disjunction apart from a bare
// `exitCode === 2` filter, and a pin that cannot tell them apart is not pinning the disjunction.
//
// WHAT THIS PAIR DELIBERATELY DOES NOT DO: it does not make a no-verdict stage force the RUN's exit to 2.
// That was proposed and REFUSED (orchestrator ruling, 2026-09-13) — the 0/1/2/3 exit contract is repo-wide
// law and overriding a row's own classifier is an owner-scale change. #2225 asks for VISIBILITY. So the
// verdict LINE below still says PASS on the laundered arm, and the NO-VERDICT block above it is the whole
// repair. If that ever changes, this comment is the record of why it was not done here.

/** A stage row as the RUNNER now shapes it: the classified exit AND the child's raw digit. */
function ranStage(name: string, exitCode: number, childExit: number | null): StageResult {
  return { ...failedStage(name, exitCode), mode: "full", ok: exitCode === 0, childExit };
}

test("producedNoVerdict: exit-2 OR a null child exit — and a LAUNDERING classifier cannot hide either (#2225)", () => {
  // POSITIVE (a) — the #2220 shape exactly: the tool errored, so nothing was measured.
  expect(producedNoVerdict(ranStage("lint:hook-syntax", 2, null))).toBe(true);
  // POSITIVE (a') — a completed child whose own scheme says TOOL ERROR (eslint's 2). Still no verdict.
  expect(producedNoVerdict(ranStage("lint:eslint", 2, 2))).toBe(true);
  // POSITIVE (b) — THE ARM A BARE `exitCode === 2` FILTER CANNOT REACH. A row whose classifier answered
  // CLEAN for a child that reported no exit at all: the stage looks green, the run looks green, and
  // nothing was measured. This is why the predicate is a disjunction over two independent facts.
  expect(producedNoVerdict(ranStage("lint:laundered", 0, null)), "a killed child laundered to 0 is STILL no verdict").toBe(true);

  // NEGATIVE — a stage that RAN and MEASURED. A real red is not a broken instrument and must not be
  // named beside one; without these arms the predicate would pass while flagging every failure.
  expect(producedNoVerdict(ranStage("lint:biome", 1, 1)), "a measured violation IS a verdict").toBe(false);
  expect(producedNoVerdict(ranStage("types:native", 0, 0)), "a measured clean IS a verdict").toBe(false);
  // NEGATIVE — a DECLARED non-run. A deferred/skipped stage did not run; it carries `runsAt` naming where
  // it does. Calling those "measured nothing" would bury the real ones under every scoped run's deferrals.
  const deferred = nonRunningStageResult(stage("types:native"), { mode: "deferred", runsAt: "verify --static" });
  expect(producedNoVerdict(deferred), "a deferred stage is an honest non-run, not a no-verdict").toBe(false);
  const skipped = nonRunningStageResult(stage("lint:eslint"), { mode: "skipped", runsAt: null });
  expect(producedNoVerdict(skipped)).toBe(false);
});

test("noVerdictStages names them in REGISTRY order, and `[]` is the honest zero (#2225)", () => {
  const stages = [ranStage("lint:biome", 1, 1), ranStage("lint:hook-syntax", 2, null), ranStage("types:native", 0, 0), ranStage("lint:laundered", 0, null)];
  expect(noVerdictStages(stages)).toStrictEqual(["lint:hook-syntax", "lint:laundered"]);
  // THE ZERO IS ONLY EVIDENCE BECAUSE THE NON-ZERO ABOVE IS REACHABLE from the same reader — a clean-zero
  // from an unprobed predicate is the exact shape this row exists to end.
  expect(noVerdictStages([ranStage("lint:biome", 1, 1), ranStage("types:native", 0, 0)])).toStrictEqual([]);
});

test("printSummary NAMES the no-verdict stages ABOVE the failure count — and does it on a GREEN run too (#2225)", () => {
  const stages = [ranStage("lint:biome", 1, 1), ranStage("lint:hook-syntax", 2, null)];
  const report = { tier: "static", scope: "whole", ok: false, exitCode: 2, failed: 2, noVerdict: noVerdictStages(stages), stages } as const;
  const out = captureStdout(() => {
    printSummary(report);
  });

  expect(out).toContain("NO VERDICT: 1 stage(s) RAN AND MEASURED NOTHING");
  expect(out, "the child's raw state is named, because 'killed' and 'exited 2' are different repairs").toContain(
    "child reported NO exit (killed, timed out, or never spawned)",
  );
  // THE ORDERING IS THE ROW'S OWN WORDS — "a barrier reads that list BEFORE the red count". A reader who
  // meets "2 stage(s) failed" first goes hunting for a lint finding that does not exist.
  expect(out.indexOf("NO VERDICT:")).toBeLessThan(out.indexOf("stage(s) failed:"));
  expect(out.indexOf("NO VERDICT:"), "and it is INSIDE the truncation-robust tail fence, not lost up-page").toBeGreaterThan(out.indexOf("════"));

  // THE GREEN ARM, and it is the load-bearing one. With the exit-forcing rule refused, a laundering
  // classifier leaves the run reading PASS — so the NAMING is the only thing standing between a reader and
  // a tier that covered nothing. If this block were printed only on failure, that reader would get PASS
  // and silence, which is #2220 with extra steps.
  const laundered = [ranStage("types:native", 0, 0), ranStage("lint:laundered", 0, null)];
  const green = { tier: "static", scope: "whole", ok: true, exitCode: 0, failed: 0, noVerdict: noVerdictStages(laundered), stages: laundered } as const;
  const greenOut = captureStdout(() => {
    printSummary(green);
  });
  expect(greenOut).toContain("VERDICT: PASS");
  expect(greenOut, "a PASS over an unmeasured stage still NAMES it").toContain("NO VERDICT: 1 stage(s)");
  expect(greenOut).toContain("lint:laundered");

  // NEGATIVE CONTROL — no block at all when every stage that ran produced a verdict. Without this the
  // arms above would pass against a renderer that printed the header unconditionally.
  const measured = [ranStage("lint:biome", 1, 1), ranStage("types:native", 0, 0)];
  const clean = { tier: "static", scope: "whole", ok: false, exitCode: 1, failed: 1, noVerdict: [], stages: measured } as const;
  expect(
    captureStdout(() => {
      printSummary(clean);
    }),
  ).not.toContain("NO VERDICT");
});

// ── #2225 PART 3: THE REAL RUN DOOR — the PRODUCER of `childExit`, not a hand-built row ──────────────
//
// WHAT PART 2 ABOVE STRUCTURALLY CANNOT REACH, and why this arm exists (adjudicated 2026-09-13). Every
// arm above consumes a `ranStage(...)` literal: the predicate, the list and the renderer are all proven
// against a `StageResult` THE TEST BUILT. The only production producer of the field is
// `ops/run.ts:320` (`childExit: result.code`), and nothing reached it — so cutting that one expression
// left the whole #2225 pair green. That is the false clean this arm closes, and the cut is the receipt:
// with `:320` stubbed to `childExit: 0` the three arms above stay green and only this one reds.
//
// THE DRIVE IS THE REAL `runVerify`, over a scratch root, under a PATH holding exactly one fake `pnpm`
// (green, and printing the `Checked N files` line `lint:biome`'s output audit demands — without it that
// stage refuses and every arm below would be measuring the audit instead) plus `nice`, and NO `bash`.
// `lint:hook-syntax` is the registry's only `bash` argv[0], so a REGISTERED stage — never a planted one —
// resolves to nothing, `run.ts:272-275` settles it `code: null` WITHOUT spawning, and `:320` is the one
// line that carries that null into `reports/verify.json` and the NO-VERDICT block. Both directions are
// asserted in one invocation: the refused stage's `childExit` is null while every stage that RAN carries
// its real digit, which is what tells the producer apart from a constant of either value.
//
// WHY NOT THE `fakeBin` FIXTURE: it PREPENDS its dir to the inherited PATH, and a prepend can never make
// a system program unresolvable. This is the same mechanism with the PATH stated outright.
//
// NOT RE-PROVED HERE: the `--list` refusal (its own arm above, with its planted control) and the exit
// contract itself — half (a) of #2225, a no-verdict forcing the RUN's exit, was REFUSED and the refusal
// is recorded at `lib/exit-classifiers.ts:99-101`. This is a VISIBILITY pin.

/** The absolute path of a system program on THIS process's PATH. `nice` must exist inside the isolated
 *  PATH below — the test and `spawnNicedTranscript` both exec through it — and an absent one would make
 *  EVERY stage a no-verdict, which is the exact answer the arm is trying to measure. So it refuses. */
function systemProgram(name: string): string {
  for (const dir of PHSV_PATH.split(delimiter)) {
    const candidate = join(dir, name);
    if (dir.length > 0 && existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`run.int: no ${name} on PATH — the isolated-PATH run cannot be built, so nothing below is a measurement`);
}

/** One real `pnpm verify --static` through `runVerify`, rooted at `scratch` and spawned with `isolatedPath`
 *  as its whole PATH: the stage children inherit it, so what argv[0] resolves to is this test's variable. */
async function runIsolatedStatic(
  repoRoot: string,
  scratch: string,
  isolatedPath: string,
): Promise<{ readonly code: number | null; readonly output: string; readonly report: VerifyReport }> {
  const runner = join(scratch, "phsv-run-verify.ts");
  writeFileSync(
    runner,
    `import { parse } from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/lib/run-argv.ts")).href)};
import { runVerify } from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/ops/run.ts")).href)};
const parsed = parse(["--static"]);
if ("error" in parsed) throw new Error(parsed.error);
process.exitCode = await runVerify(${JSON.stringify(scratch)}, parsed);
`,
  );
  const childEnv = Object.fromEntries([
    // biome-ignore lint/style/noProcessEnv: the runner needs the caller's node environment; PATH and the host-pool root are the only overlays, and the PATH overlay IS the measurement.
    ...Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ["PATH", isolatedPath],
    ["NO_COLOR", "1"],
    [HOST_POOL_ROOT_ENV, join(scratch, "verify-slots")],
  ]);
  // The host-pool root is redirected into scratch so this run never takes the REAL whole-run slot an
  // operator's `pnpm check` is queueing for.
  const child = await spawnNiced(process.execPath, [runner], {
    cwd: repoRoot,
    env: childEnv,
  });
  const output = `${child.stdout}${child.stderr}`;
  const report = JSON.parse(readFileSync(join(scratch, "reports", "verify.json"), "utf8")) as VerifyReport;
  return { code: child.code, output, report };
}

/** The stages that actually RAN — a deferred/skipped row carries no `childExit` by contract, and lumping
 *  those in would make the "every other stage reported its digit" assertion vacuously true. */
function ranStages(report: VerifyReport): readonly StageResult[] {
  return report.stages.filter((s) => s.mode !== "deferred" && s.mode !== "skipped");
}

test("the REAL run door produces childExit: an unresolvable REGISTERED stage lands null, the NO-VERDICT block names it, and a resolvable one clears it (#2225)", {
  timeout: scaledBudget(180_000),
}, async ({ repoRoot, scratch }) => {
  const binDir = join(scratch, "phsv-bin");
  mkdirSync(binDir, { recursive: true });
  // Every `pnpm <script>` stage: instantly green, and carrying biome's summary line so the lint:biome
  // output audit (#1245) reads an honest measurement instead of refusing — a refusal there would put a
  // SECOND stage in the no-verdict list and the arms below would stop discriminating.
  writeFileSync(join(binDir, "pnpm"), '#!/bin/sh\necho "Checked 3 files in 0s."\nexit 0\n', { mode: 0o755 });
  symlinkSync(systemProgram("nice"), join(binDir, "nice"));

  // ARM 1 — `bash` is on no PATH the child can see, and the workspace-bin rung finds nothing under the
  // scratch root either, so the registry's lint:hook-syntax row is UNRESOLVABLE at the real door.
  const refused = await runIsolatedStatic(repoRoot, scratch, binDir);
  expect(refused.code, `an unresolvable stage is a TOOL ERROR, and the run's exit says so:\n${refused.output}`).toBe(2);
  expect(refused.output).toContain("[verify] NO VERDICT: 1 stage(s) RAN AND MEASURED NOTHING");
  expect(refused.output).toContain("‼ lint:hook-syntax — child reported NO exit (killed, timed out, or never spawned)");
  expect(refused.report.noVerdict, "and the ARTIFACT carries the same list a bot reads").toStrictEqual(["lint:hook-syntax"]);

  // THE PRODUCER, both directions in one run. `childExit` is null for the stage that never spawned and
  // the CHILD'S OWN DIGIT for every stage that did — a `:320` stubbed to either constant fails one half.
  const refusedRow = refused.report.stages.find((s) => s.name === "lint:hook-syntax");
  expect(refusedRow?.mode, "it RAN in the planner's sense — it is not a deferral wearing a refusal's clothes").toBe("full");
  // The refusal text is NOT on stdout — compact mode prints one glyph line and the transcript goes to the
  // per-stage log, which is exactly why the excerpt is cut into the artifact: a bot reading only
  // reports/verify.json still learns WHICH command could not be found.
  expect(refusedRow?.failureExcerpt, "the refusal names the command it could not find").toContain('its argv[0] "bash" resolves to nothing runnable');
  expect(Object.is(refusedRow?.childExit, null), `childExit must be null, not absent or 0: ${JSON.stringify(refusedRow)}`).toBe(true);
  const measured = ranStages(refused.report).filter((s) => s.name !== "lint:hook-syntax");
  expect(measured.length, "the fake pnpm stages are the control population").toBeGreaterThan(0);
  expect(
    measured.map((s) => s.childExit),
    "every stage whose child DID report an exit carries that digit, not a constant",
  ).toStrictEqual(measured.map(() => 0));

  // ARM 2 — THE NEGATIVE CONTROL: the same registry, the same door, `bash` now resolvable. Without it
  // the arm above would pass against a runner that named every stage no-verdict.
  writeFileSync(join(binDir, "bash"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const resolvedRun = await runIsolatedStatic(repoRoot, scratch, binDir);
  expect(resolvedRun.code, `every stage resolved and measured:\n${resolvedRun.output}`).toBe(0);
  expect(resolvedRun.output, "a run where every stage reported an exit prints NO block at all").not.toContain("NO VERDICT");
  expect(resolvedRun.report.noVerdict).toStrictEqual([]);
  expect(resolvedRun.report.stages.find((s) => s.name === "lint:hook-syntax")?.childExit).toBe(0);
});
