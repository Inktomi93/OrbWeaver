// The edit hook across real linked checkouts: each edited file is checked in the checkout that owns it, and
// every gap in that check is a named warning in the advisory context. A stub `pnpm` answers the planner and
// the compiler from files inside the child's own cwd, so a leg run in the wrong checkout shows it.
import type { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { TypecheckPlan } from "@orb/tooling/verify";
import type { HookRun } from "./_edit-hook-fixture.ts";
import { codexContext, codexPayload, findings, git, HOOK_REL, hookPayload, installCodexAdapter, plantCheckout, runHook } from "./_edit-hook-fixture.ts";
import { scaledBudget } from "./_load-budget.ts";

const STUB_PLAN = "hook-stub-plan.json";
const STUB_COMPILER = "hook-stub-ts7";
const KILLED = "KILL";
const SUBJECT = "tests/client/subject.dom.test.ts";
const CONSUMER = "tests/client/unchanged-consumer.ts";
const CONSUMER_ERROR = `${CONSUMER}(7,3): error TS2322: Type string is not assignable to number.`;
const DOM_PROGRAM = "tsconfig.tests-dom.json";
const TOOLING_PROGRAM = "tsconfig.tooling.json";
// The program main's own plan names: a leg that ran in main instead of the edited checkout shows it.
const MAIN_ONLY_PROGRAM = "tsconfig.main-only.json";
const ELSEWHERE = "current type error(s) in files outside this edit:";
const UNFINISHED_HEADING = "── edit advisory was NOT completed ──";
// Claude Code replaces a longer additionalContext with a file path the model is not asked to read.
const HOST_CONTEXT_LIMIT = 10_000;
const MULTI_RUN_BUDGET_MS = scaledBudget(10_000);

function stubCheckoutPnpm(bin: string): void {
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "pnpm"),
    `#!/usr/bin/env bash
printf '%s|%s|admission=%s\n' "$PWD" "$*" "\${ORB_TS7_ADMISSION:-}" >> "$HOOK_TEST_LOG"
if [[ "$*" == *"typecheck-plan"* ]]; then
  if [ -f "${STUB_PLAN}" ]; then cat "${STUB_PLAN}"; fi
  exit 0
fi
if [[ "$*" == *"scripts/ts7.ts"* ]]; then
  response="${STUB_COMPILER}-\${@: -1}"
  if [ ! -f "$response.exit" ]; then exit 0; fi
  cat "$response.out"
  status="$(cat "$response.exit")"
  if [ "$status" = "${KILLED}" ]; then kill -s KILL $$; fi
  exit "$status"
fi
exit 0
`,
    { mode: 0o755 },
  );
}

interface Lanes {
  readonly main: string;
  /** A lane inside main's tree, where Claude lanes live. */
  readonly nested: string;
  /** A lane outside main's tree, where Codex lanes live. */
  readonly outside: string;
}

/** Real linked checkouts of one temporary repository, both layouts, at canonical paths. */
function plantLanes(scratch: string): Lanes {
  const checkout = plantCheckout(realpathSync(scratch));
  const nested = join(checkout.main, ".claude", "worktrees", "lane a");
  git(checkout.main, "worktree", "add", "--quiet", "-b", "fixture-nested-lane", nested);
  plantPlan(checkout.main, [[SUBJECT, MAIN_ONLY_PROGRAM]]);
  return { main: checkout.main, nested, outside: checkout.worktree };
}

/** The planner answer the stub prints in this checkout: each subject and its program. */
function plantPlan(root: string, subjects: readonly (readonly [path: string, program: string])[]): void {
  const plan: TypecheckPlan = {
    mode: "primary",
    coverage: "advisory-primary-programs",
    programs: [...new Set(subjects.map(([, program]) => program))],
    subjects: subjects.map(([path, program]) => ({
      path,
      status: "present",
      previousPath: null,
      disposition: "selected",
      rootedBy: [program],
      containedBy: [program],
      selectedPrograms: [program],
      reason: "primary-root",
    })),
  };
  writeFileSync(join(root, STUB_PLAN), `${JSON.stringify(plan)}\n`);
}

/** What this checkout's compiler prints for one program, and how it ends: an exit status or a SIGKILL. */
function plantCompiler(root: string, program: string, lines: readonly string[], end: number | typeof KILLED): void {
  writeFileSync(join(root, `${STUB_COMPILER}-${program}.out`), lines.map((line) => `${line}\n`).join(""));
  writeFileSync(join(root, `${STUB_COMPILER}-${program}.exit`), `${String(end)}\n`);
}

interface Invocation {
  readonly cwd: string;
  readonly args: string;
  readonly admission: string;
}

function childCalls(log: string): readonly Invocation[] {
  if (!existsSync(log)) {
    return [];
  }
  return readFileSync(log, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [cwd = "", args = "", admission = ""] = line.split("|");
      return { cwd, args, admission };
    });
}

function sorted(values: readonly string[]): readonly string[] {
  return values.toSorted((left, right) => left.localeCompare(right));
}

/** The child processes one checkout must have run for its edited files: one Biome run per file, one planner
 *  run for all of them and one advisory compiler run per planned program, every one in that checkout. */
function expectCheckoutLegs(calls: readonly Invocation[], root: string, rels: readonly string[], programs: readonly string[]): void {
  const own = calls.filter((call) => call.cwd === root);
  const biome = own.filter((call) => call.args.startsWith("exec biome check "));
  expect(sorted(biome.map((call) => call.args.split(" ").at(-1) ?? "")), root).toEqual(sorted(rels));
  for (const call of biome) {
    expect(call.args, root).toContain(`--config-path=${join(root, "tooling", "biome.edit.jsonc")} `);
  }
  expect(
    own.filter((call) => call.args.includes(" typecheck-plan ")).map((call) => call.args),
    root,
  ).toEqual([`exec node tooling/src/verify/cli.ts typecheck-plan --primary --file --json -- ${rels.join(" ")}`]);
  const compiler = own.filter((call) => call.args.includes("scripts/ts7.ts"));
  expect(sorted(compiler.map((call) => call.args.split(" ").at(-1) ?? "")), root).toEqual(sorted(programs));
  for (const call of compiler) {
    expect(call.args.startsWith(`exec node ${join(root, "scripts", "ts7.ts")} --noEmit `), root).toBe(true);
    expect(call.admission, root).toBe("admission=try");
  }
  expect(own, root).toHaveLength(biome.length + 1 + compiler.length);
}

/** The finding blocks a context carries, each opened by a `── … ──` heading line after the lead. */
function findingBlocks(context: string): readonly string[] {
  return context.split("\n").slice(1).join("\n").split("\n\n");
}

/** The context's lead names how many finding blocks follow it. */
function expectFindingLead(context: string, label: string): void {
  const lead = /^edit-check: (\d+) finding block\(s\)/u.exec(context);
  expect(lead, label).not.toBeNull();
  expect(Number(lead?.[1]), label).toBe(findingBlocks(context).length);
}

/** A run whose check did not finish says so: the lead and the named block that follows it. */
function expectUnfinished(context: string, label: string): void {
  const [lead = "", heading = ""] = context.split("\n");
  expect(lead, label).toContain("NOT completed");
  expect(heading, label).toBe(UNFINISHED_HEADING);
}

/** The blocks a multi-checkout run printed for one checkout, which the hook heads with that checkout's root. */
function checkoutBlocks(context: string, root: string): string {
  return findingBlocks(context)
    .filter((block) => block.startsWith(`── checkout ${root} ──\n`))
    .join("\n\n");
}

/** A run with nothing to report delivers nothing at all: exit 0 alone does not mean clean. */
function expectQuiet(result: ReturnType<typeof spawnSync>, label: string): void {
  expect(result.status, label).toBe(0);
  expect(result.stderr, label).toBe("");
  expect(result.stdout, label).toBe("");
}

function patchSubjects(cwd: string, subjects: readonly { readonly file: string; readonly status: string }[]): string {
  return hookPayload([
    ["hook_event_name", "PostToolUse"],
    ["tool_name", "CodexPatch"],
    ["cwd", cwd],
    ["tool_input", { subjects }],
  ]);
}

function laneRun(scratch: string, repoRoot: string, lanes: Lanes): HookRun {
  const bin = join(scratch, "stub bin");
  stubCheckoutPnpm(bin);
  return {
    hook: join(repoRoot, HOOK_REL),
    project: lanes.main,
    cwd: lanes.main,
    file: "",
    bin,
    log: join(scratch, "pnpm.log"),
    runtime: join(scratch, "runtime"),
  };
}

function presentIn(lanes: Lanes, lane: string): string {
  return patchSubjects(lanes.main, [{ file: join(lane, SUBJECT), status: "present" }]);
}

test("an edit to a linked checkout's file sent with main's cwd runs every leg in that checkout", { timeout: MULTI_RUN_BUDGET_MS }, ({ scratch, repoRoot }) => {
  const lanes = plantLanes(scratch);
  const base = laneRun(scratch, repoRoot, lanes);
  for (const [layout, lane] of [
    ["nested", lanes.nested],
    ["outside main", lanes.outside],
  ] as const) {
    plantPlan(lane, [[SUBJECT, DOM_PROGRAM]]);
    const log = join(scratch, `${layout}.log`);
    expectQuiet(runHook({ ...base, log, file: join(lane, SUBJECT) }), layout);
    const calls = childCalls(log);
    expect(
      calls.every((call) => call.cwd === lane),
      layout,
    ).toBe(true);
    expectCheckoutLegs(calls, lane, [SUBJECT], [DOM_PROGRAM]);
  }
});

test("one Codex patch across two linked checkouts checks each file in its own checkout, once per program", { timeout: MULTI_RUN_BUDGET_MS }, ({
  scratch,
  repoRoot,
}) => {
  const lanes = plantLanes(scratch);
  const base = laneRun(scratch, repoRoot, lanes);
  const adapter = installCodexAdapter(lanes.main, repoRoot);
  const second = "tooling/src/second.ts";
  mkdirSync(join(lanes.outside, "tooling", "src"), { recursive: true });
  writeFileSync(join(lanes.outside, second), "export const second = true;\n");
  plantPlan(lanes.nested, [[SUBJECT, DOM_PROGRAM]]);
  plantPlan(lanes.outside, [
    [SUBJECT, DOM_PROGRAM],
    [second, TOOLING_PROGRAM],
  ]);
  const patch = [
    "*** Begin Patch",
    `*** Update File: ${join(lanes.nested, SUBJECT)}`,
    `*** Update File: ${join(lanes.outside, SUBJECT)}`,
    `*** Add File: ${join(lanes.outside, second)}`,
    "*** End Patch",
  ].join("\n");

  const cleanLog = join(scratch, "clean.log");
  expectQuiet(runHook({ ...base, hook: adapter, log: cleanLog, rawInput: codexPayload(lanes.main, patch) }), "clean patch");
  const calls = childCalls(cleanLog);
  expectCheckoutLegs(calls, lanes.nested, [SUBJECT], [DOM_PROGRAM]);
  expectCheckoutLegs(calls, lanes.outside, [SUBJECT, second], [DOM_PROGRAM, TOOLING_PROGRAM]);
  expect(calls.filter((call) => call.cwd !== lanes.nested && call.cwd !== lanes.outside)).toEqual([]);

  plantCompiler(lanes.outside, DOM_PROGRAM, [`${SUBJECT}(3,9): error TS2305: Module has no exported member Missing.`], 1);
  const red = runHook({ ...base, hook: adapter, log: join(scratch, "red.log"), rawInput: codexPayload(lanes.main, patch) });
  expect(red.status).toBe(0);
  const context = codexContext(red);
  expectFindingLead(context, "red patch");
  const outsideBlocks = checkoutBlocks(context, lanes.outside);
  expect(outsideBlocks).toContain(`── ${DOM_PROGRAM} ──`);
  expect(outsideBlocks).toContain("subject.dom.test.ts:3,9");
  expect(outsideBlocks).toContain("── 1 type error(s) ──");
  expect(checkoutBlocks(context, lanes.nested), "the clean checkout prints no finding").toBe("");
  expect(context).not.toContain(MAIN_ONLY_PROGRAM);
});

test("each checkout's compiler output stays under its own checkout, even for one relative path", { timeout: MULTI_RUN_BUDGET_MS }, ({ scratch, repoRoot }) => {
  const lanes = plantLanes(scratch);
  const base = laneRun(scratch, repoRoot, lanes);
  for (const lane of [lanes.nested, lanes.outside]) {
    plantPlan(lane, [[SUBJECT, DOM_PROGRAM]]);
  }
  plantCompiler(lanes.nested, DOM_PROGRAM, [CONSUMER_ERROR], 1);
  plantCompiler(lanes.outside, DOM_PROGRAM, [`${CONSUMER}(7,3): error TS2305: Module has no exported member Missing.`], 1);
  const context = findings(
    runHook({
      ...base,
      rawInput: patchSubjects(lanes.main, [
        { file: join(lanes.nested, SUBJECT), status: "present" },
        { file: join(lanes.outside, SUBJECT), status: "present" },
      ]),
    }),
  );
  expectFindingLead(context, "two red checkouts");
  const nested = checkoutBlocks(context, lanes.nested);
  const outside = checkoutBlocks(context, lanes.outside);
  expect(nested).toContain("TS2322");
  expect(nested).not.toContain("TS2305");
  expect(outside).toContain("TS2305");
  expect(outside).not.toContain("TS2322");
  for (const block of [nested, outside]) {
    expect(block).toContain(`1 ${ELSEWHERE}`);
    expect(block).toContain("── 1 type error(s) ──");
  }
  expect(findingBlocks(context)).toHaveLength(2);
  const calls = childCalls(base.log);
  expectCheckoutLegs(calls, lanes.nested, [SUBJECT], [DOM_PROGRAM]);
  expectCheckoutLegs(calls, lanes.outside, [SUBJECT], [DOM_PROGRAM]);
});

test("a program-level compiler error is reported, alone or beside located errors", { timeout: MULTI_RUN_BUDGET_MS }, ({ scratch, repoRoot }) => {
  const lanes = plantLanes(scratch);
  const base = laneRun(scratch, repoRoot, lanes);
  plantPlan(lanes.outside, [[SUBJECT, DOM_PROGRAM]]);
  const unlocated = "error TS5083: Cannot read file '/fixture/tsconfig.base.json'.";

  plantCompiler(lanes.outside, DOM_PROGRAM, [unlocated], 1);
  const alone = findings(runHook({ ...base, rawInput: presentIn(lanes, lanes.outside) }));
  expectFindingLead(alone, "alone");
  expect(alone).toContain(`typecheck compiler failed for ${DOM_PROGRAM} (exit 1)`);
  expect(alone).toContain("TS5083");

  plantCompiler(lanes.outside, DOM_PROGRAM, [unlocated, CONSUMER_ERROR], 1);
  const beside = findings(runHook({ ...base, rawInput: presentIn(lanes, lanes.outside) }));
  expectFindingLead(beside, "beside");
  expect(beside, "the program-level error keeps its code and message under its program").toContain(`── ${DOM_PROGRAM} ──\n${unlocated}\n`);
  expect(beside).toContain("── 2 type error(s) ──");
  expect(beside).toContain("unchanged-consumer.ts:7,3");
  expect(beside).not.toContain("checks without a verdict");

  const missing = Array.from({ length: 100 }, (_, index) => `error TS6053: File '/fixture/missing-${String(index)}.ts' not found.`);
  plantCompiler(lanes.outside, DOM_PROGRAM, missing, 1);
  const many = findings(runHook({ ...base, rawInput: presentIn(lanes, lanes.outside) }));
  expectFindingLead(many, "many alone");
  const shown = missing.filter((line) => many.includes(`${line}\n`)).length;
  const omitted = /^… (\d+) more line\(s\) not shown$/mu.exec(many);
  expect(omitted, "a cut excerpt names how many lines it left out").not.toBeNull();
  expect(shown, "the excerpt keeps whole leading lines").toBeGreaterThan(0);
  expect(many, "the count follows the last shown line").toContain(`${missing.slice(0, shown).join("\n")}\n${omitted?.[0] ?? ""}`);
  expect(shown + Number(omitted?.[1]), "every program-level line is shown or counted").toBe(missing.length);
});

test("an edit in a registered checkout whose directory is gone is a named warning in both layouts", { timeout: MULTI_RUN_BUDGET_MS }, ({
  scratch,
  repoRoot,
}) => {
  const lanes = plantLanes(scratch);
  const base = laneRun(scratch, repoRoot, lanes);
  const goneNested = join(lanes.main, ".claude", "worktrees", "gone lane");
  const goneOutside = join(realpathSync(scratch), "gone worktree");
  git(lanes.main, "worktree", "add", "--quiet", "-b", "fixture-gone-nested", goneNested);
  git(lanes.main, "worktree", "add", "--quiet", "-b", "fixture-gone-outside", goneOutside);
  rmSync(goneNested, { recursive: true, force: true });
  rmSync(goneOutside, { recursive: true, force: true });
  const missing = (gone: string): string => `${SUBJECT}: its registered checkout ${gone} is missing; no check ran`;

  for (const [gone, status] of [
    [goneNested, "present"],
    [goneOutside, "present"],
    [goneOutside, "deleted"],
  ] as const) {
    const label = `${gone} ${status}`;
    const log = join(scratch, `${status}-${String(gone.length)}.log`);
    const context = findings(runHook({ ...base, log, rawInput: patchSubjects(lanes.main, [{ file: join(gone, SUBJECT), status }]) }));
    expectFindingLead(context, label);
    expect(context, label).toContain("── checks without a verdict ──");
    expect(context, label).toContain(missing(gone));
    expect(childCalls(log), "no check runs for a missing checkout").toEqual([]);
  }

  // A live checkout in the same patch is still checked, and the missing one is still named.
  plantPlan(lanes.nested, [[SUBJECT, DOM_PROGRAM]]);
  const mixedLog = join(scratch, "mixed.log");
  const mixed = findings(
    runHook({
      ...base,
      log: mixedLog,
      rawInput: patchSubjects(lanes.main, [
        { file: join(lanes.nested, SUBJECT), status: "present" },
        { file: join(goneOutside, SUBJECT), status: "present" },
      ]),
    }),
  );
  expectFindingLead(mixed, "mixed");
  expect(mixed).toContain(missing(goneOutside));
  expectCheckoutLegs(childCalls(mixedLog), lanes.nested, [SUBJECT], [DOM_PROGRAM]);
});

test("compiler output that is not a diagnostic is a bounded warning, and the diagnostics beside it are kept", ({ scratch, repoRoot }) => {
  const lanes = plantLanes(scratch);
  const base = laneRun(scratch, repoRoot, lanes);
  plantPlan(lanes.outside, [[SUBJECT, DOM_PROGRAM]]);
  const crash = Array.from({ length: 40 }, (_, index) => `checker worker ${String(index)} panicked: index out of range`);
  const tail = `${"x".repeat(1000)}TAIL-MARKER`;
  plantCompiler(lanes.outside, DOM_PROGRAM, [CONSUMER_ERROR, ...crash, tail], 1);
  const context = findings(runHook({ ...base, rawInput: presentIn(lanes, lanes.outside) }));
  expectFindingLead(context, "crash output");
  expect(context).toContain("── checks without a verdict ──");
  expect(context).toContain(`typecheck output for ${DOM_PROGRAM} has ${String(crash.length + 1)} line(s) that are not diagnostics; the check is incomplete:`);
  expect(context).toContain(crash[0]);
  expect(context).toContain("more line(s) not shown");
  expect(context, "the excerpt is bounded").not.toContain("TAIL-MARKER");
  expect(context).toContain("unchanged-consumer.ts:7,3");
});

test("only a clean or diagnostics-found compiler exit is a verdict", { timeout: MULTI_RUN_BUDGET_MS }, ({ scratch, repoRoot }) => {
  const lanes = plantLanes(scratch);
  const base = laneRun(scratch, repoRoot, lanes);
  plantPlan(lanes.outside, [[SUBJECT, DOM_PROGRAM]]);
  for (const [end, status] of [
    [70, "exit 70"],
    [2, "exit 2"],
    [KILLED, "signal SIGKILL"],
  ] as const) {
    plantCompiler(lanes.outside, DOM_PROGRAM, [CONSUMER_ERROR], end);
    const context = findings(runHook({ ...base, rawInput: presentIn(lanes, lanes.outside) }));
    expectFindingLead(context, status);
    expect(context, status).toContain("── checks without a verdict ──");
    expect(context, status).toContain(`typecheck compiler failed for ${DOM_PROGRAM} (${status}); its output may be partial and is not a verdict:`);
    expect(context, "partial output is never attributed as findings").not.toContain("type error(s) ──");
  }
});

test("an edited path that resolves through a file or directory link out of its checkout is refused", { timeout: MULTI_RUN_BUDGET_MS }, ({
  scratch,
  repoRoot,
}) => {
  const lanes = plantLanes(scratch);
  const base = laneRun(scratch, repoRoot, lanes);
  const outside = join(realpathSync(scratch), "outside");
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, "subject.ts"), "export {};\n");
  symlinkSync(join(outside, "subject.ts"), join(lanes.nested, "tests", "client", "escape.dom.test.ts"));
  symlinkSync(outside, join(lanes.nested, "directory-link"));
  symlinkSync(join(lanes.outside, "tests", "client"), join(lanes.nested, "cross-link"));
  // A path not yet created through the link is judged by its existing prefix, the link itself.
  for (const edited of ["tests/client/escape.dom.test.ts", "directory-link/subject.ts", "directory-link/new/subject.ts", `cross-link/${basename(SUBJECT)}`]) {
    const file = join(lanes.nested, edited);
    const log = join(scratch, `${edited.replaceAll("/", "-")}.log`);
    const context = findings(runHook({ ...base, log, file }));
    expectUnfinished(context, edited);
    expect(context, edited).toContain(`edited path resolves outside the active checkout: ${file}`);
    expect(childCalls(log), edited).toEqual([]);
  }
});

test("a listing over the host context limit keeps whole leading lines and counts the rest", ({ scratch, repoRoot }) => {
  const lanes = plantLanes(scratch);
  const base = laneRun(scratch, repoRoot, lanes);
  plantPlan(lanes.outside, [[SUBJECT, DOM_PROGRAM]]);
  // Each error has its own message, so no two group into one line of the summary.
  const errors = Array.from({ length: 600 }, (_, index) => `${CONSUMER}(${String(index + 1)},1): error TS2322: Distinct failure ${String(index)}.`);
  plantCompiler(lanes.outside, DOM_PROGRAM, errors, 1);
  const context = findings(runHook({ ...base, rawInput: presentIn(lanes, lanes.outside) }));
  expect(context.length).toBeLessThanOrEqual(HOST_CONTEXT_LIMIT);
  const lines = context.split("\n");
  expect(lines[0]).toMatch(/^edit-check: 1 finding block\(s\)/u);
  const omitted = /^… (\d+) more line\(s\) not shown: the listing exceeds the hook context limit\./u.exec(lines.at(-1) ?? "");
  expect(omitted).not.toBeNull();
  // The whole listing is the lead, the program heading, the outside-the-edit label, one line per error and
  // the total; the kept lines and the counted ones together are all of it.
  const listing = 1 + 1 + 1 + errors.length + 1;
  expect(lines.length - 1 + Number(omitted?.[1])).toBe(listing);
  expect(lines[1]).toBe(`── ${DOM_PROGRAM} ──`);
  expect(lines[2]).toBe(`${String(errors.length)} ${ELSEWHERE}`);
});
