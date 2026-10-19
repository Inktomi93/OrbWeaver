// The edit hook (.claude/hooks/biome-check.mjs), driven across the real process boundary with a stub
// `pnpm` on PATH. Every run gets its own runtime dir, so the hook's host-wide pools are the test's alone.
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { readConcurrencyProfile } from "@orb/tooling/floor/host/concurrency-profile";
import { HOST_POOL_ROOT_ENV, hostPoolDir } from "@orb/tooling/floor/host/host-slots";
import { TS7_SLOT_BUSY_EXIT } from "@orb/tooling/floor/host/ts7-admission";
import type { HookRun } from "./_edit-hook-fixture.ts";
import { codexContext, codexPayload, findings, git, HOOK_REL, hookPayload, installCodexAdapter, plantCheckout, runHook } from "./_edit-hook-fixture.ts";
import { scaledBudget } from "./_load-budget.ts";

function stubPnpm(bin: string): void {
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "pnpm"),
    `#!/usr/bin/env bash
printf '%s|%s|admission=%s\n' "$PWD" "$*" "\${ORB_TS7_ADMISSION:-}" >> "$HOOK_TEST_LOG"
# pnpm's own install/prepare reporting rides STDOUT, above the wrapped command's output. Captured
# verbatim from this repo on 2026-09-12; see the "wrapper preamble" tests.
wrapper_preamble() {
  printf 'Scope: all 9 workspace projects\n'
  printf 'Lockfile is up to date, resolution step is skipped\n'
  printf '. prepare: lefthook install\n'
  printf '. prepare: Done\n'
  printf 'Done in 1.6s using pnpm v11.15.1\n'
}
if [[ "$*" == *"exec biome"* ]] && [ "\${HOOK_TEST_MODE:-}" = "biome-preamble-finding" ]; then
  wrapper_preamble
  printf 'Checked 1 file in 4ms. No fixes applied.\nFound 1 error.\n'
  printf '%s:4:38 lint/suspicious/noDoubleEquals  FIXABLE  ━━━━━\n' "\${@: -1}" >&2
  printf '  x Using == may be unsafe if you are relying on type coercion.\n' >&2
  printf 'check ━━━━━\n\n  x Some errors were emitted while running checks.\n' >&2
  exit 1
fi
if [[ "$*" == *"exec biome"* ]] && [ "\${HOOK_TEST_MODE:-}" = "biome-stdout-diagnostic" ]; then
  printf '%s:4:38 lint/suspicious/noDoubleEquals  FIXABLE  ━━━━━\n' "\${@: -1}"
  exit 1
fi
if [[ "$*" == *"exec biome"* ]] && [ "\${HOOK_TEST_MODE:-}" = "biome-tool-error" ]; then
  printf 'configuration file is malformed\n' >&2
  exit 1
fi
if [[ "$*" == *"exec depcruise"* ]] && [ "\${HOOK_TEST_MODE:-}" = "dep-footer-only" ]; then
  printf '1 dependency violations (1 errors, 0 warnings)\n'
  exit 1
fi
if [[ "$*" == *"exec depcruise"* ]] && [ "\${HOOK_TEST_MODE:-}" = "dep-no-orphans" ]; then
  printf '{"summary":{"violations":[{"from":"packages/client/src/source.ts","to":"","rule":{"name":"no-orphans","severity":"warn"}}],"ruleSetUsed":{"forbidden":[]}}}\n'
  exit 1
fi
if [[ "$*" == *"exec depcruise"* ]] && [ "\${HOOK_TEST_MODE:-}" = "dep-preamble-actionable" ]; then
  wrapper_preamble
  printf '{"summary":{"violations":[{"from":"packages/client/src/source.ts","to":"packages/server/src/index.ts","rule":{"name":"client-cake","severity":"error"}}],"ruleSetUsed":{"forbidden":[{"name":"client-cake","comment":"client cannot import server runtime"}]}}}\n'
  exit 1
fi
if [[ "$*" == *"exec depcruise"* ]] && [ "\${HOOK_TEST_MODE:-}" = "dep-preamble-clean" ]; then
  wrapper_preamble
  printf '{"summary":{"violations":[],"ruleSetUsed":{"forbidden":[]}}}\n'
  exit 0
fi
if [[ "$*" == *"exec depcruise"* ]] && [ "\${HOOK_TEST_MODE:-}" = "dep-actionable" ]; then
  printf '{"summary":{"violations":[{"from":"packages/client/src/source.ts","to":"packages/server/src/index.ts","rule":{"name":"client-cake","severity":"error"}}],"ruleSetUsed":{"forbidden":[{"name":"client-cake","comment":"client cannot import server runtime"}]}}}\n'
  exit 1
fi
if [[ "$*" == *"typecheck-plan"* ]]; then
  subject="\${@: -1}"
  if [ "\${HOOK_TEST_MODE:-}" = "batch-diagnostic" ]; then
    printf '{"mode":"primary","coverage":"advisory-primary-programs","programs":["tsconfig.tests-dom.json"],"subjects":['
    separator=""
    seen_separator=0
    for argument in "$@"; do
      if [ "$seen_separator" = 1 ]; then
        printf '%s{"path":"%s","disposition":"selected","selectedPrograms":["tsconfig.tests-dom.json"]}' "$separator" "$argument"
        separator=,
      elif [ "$argument" = -- ]; then
        seen_separator=1
      fi
    done
    printf ']}\n'
    exit 0
  fi
  if [ "\${HOOK_TEST_MODE:-}" = "plan-preamble" ] || [ "\${HOOK_TEST_MODE:-}" = "plan-preamble-diagnostic" ]; then
    wrapper_preamble
    printf '{"mode":"primary","coverage":"advisory-primary-programs","programs":["tsconfig.tests-dom.json"],"subjects":[{"path":"%s","disposition":"selected","selectedPrograms":["tsconfig.tests-dom.json"]}]}\n' "$subject"
    exit 0
  fi
  if [ "\${HOOK_TEST_MODE:-}" = "plan-preamble-only" ]; then
    wrapper_preamble
    exit 0
  fi
  if [ "\${HOOK_TEST_MODE:-}" = "planner-failure" ]; then
    printf 'planner exploded\n' >&2
    exit 2
  fi
  if [ "\${HOOK_TEST_MODE:-}" = "unknown-program" ]; then
    printf '{"mode":"primary","coverage":"advisory-primary-programs","programs":["tsconfig.missing.json"],"subjects":[{"path":"%s","disposition":"selected","selectedPrograms":["tsconfig.missing.json"]}]}\n' "$subject"
    exit 0
  fi
  if [ "\${HOOK_TEST_MODE:-}" = "empty-plan" ]; then
    printf '{"mode":"primary","coverage":"advisory-primary-programs","programs":[],"subjects":[{"path":"%s","disposition":"selected","selectedPrograms":[]}]}\n' "$subject"
    exit 0
  fi
  if [ "\${HOOK_TEST_MODE:-}" = "empty-program" ]; then
    printf '{"mode":"primary","coverage":"advisory-primary-programs","programs":[""],"subjects":[{"path":"%s","disposition":"selected","selectedPrograms":[""]}]}\n' "$subject"
    exit 0
  fi
  if [ "\${HOOK_TEST_MODE:-}" = "mismatched-subject" ]; then
    printf '{"mode":"primary","coverage":"advisory-primary-programs","programs":["tsconfig.tests-dom.json"],"subjects":[{"path":"tests/not-the-edited-file.ts","disposition":"selected","selectedPrograms":["tsconfig.tests-dom.json"]}]}\n'
    exit 0
  fi
  if [ "\${HOOK_TEST_MODE:-}" = "mismatched-program" ]; then
    printf '{"mode":"primary","coverage":"advisory-primary-programs","programs":["tsconfig.tests-dom.json"],"subjects":[{"path":"%s","disposition":"selected","selectedPrograms":["tsconfig.json"]}]}\n' "$subject"
    exit 0
  fi
  if [ "\${HOOK_TEST_MODE:-}" = "not-applicable" ]; then
    printf '{"mode":"primary","coverage":"advisory-primary-programs","programs":[],"subjects":[{"path":"%s","disposition":"not-applicable","selectedPrograms":[]}]}\n' "$subject"
    exit 0
  fi
  printf '{"mode":"primary","coverage":"advisory-primary-programs","programs":["tsconfig.tests-dom.json"],"subjects":[{"path":"%s","disposition":"selected","selectedPrograms":["tsconfig.tests-dom.json"]}]}\n' "$subject"
  exit 0
fi
if [[ "$*" == *"scripts/ts7.ts"* ]] && [ "\${HOOK_TEST_MODE:-}" = "plan-preamble-diagnostic" ]; then
  printf 'tests/client/subject.dom.test.ts(3,9): error TS2322: Type string is not assignable to number.\n'
  exit 1
fi
if [[ "$*" == *"scripts/ts7.ts"* ]] && { [ "\${HOOK_TEST_MODE:-}" = "batch-diagnostic" ] || [ "\${HOOK_TEST_MODE:-}" = "consumer-diagnostic" ]; }; then
  printf '%s(7,3): error TS2322: Type string is not assignable to number.\n' "\${HOOK_TEST_TS_FILE:-tests/client/unchanged-consumer.ts}"
  printf '  Elaboration line that belongs to the diagnostic above.\n'
  exit 1
fi
if [[ "$*" == *"scripts/ts7.ts"* ]] && [ "\${HOOK_TEST_MODE:-}" = "consumer-and-edited-diagnostic" ]; then
  printf 'tests/client/unchanged-consumer.ts(7,3): error TS2322: Type string is not assignable to number.\n'
  printf 'tests/client/subject.dom.test.ts(3,9): error TS2305: Module has no exported member Missing.\n'
  exit 1
fi
if [[ "$*" == *"scripts/ts7.ts"* ]] && [ "\${HOOK_TEST_MODE:-}" = "ts7-busy" ]; then
  printf 'ts7: all 1 host "ts7" typecheck slots are busy; this advisory run was SKIPPED\n' >&2
  exit ${String(TS7_SLOT_BUSY_EXIT)}
fi
if [[ "$*" == *"scripts/ts7.ts"* ]] && [ "\${HOOK_TEST_MODE:-}" = "unknown-program" ]; then
  printf 'project config does not exist\n' >&2
  exit 2
fi
exit 0
`,
    { mode: 0o755 },
  );
}

test("malformed supported-event payloads are visible while a valid unsupported event is ignored", ({ scratch, repoRoot }) => {
  const common = {
    hook: join(repoRoot, HOOK_REL),
    project: repoRoot,
    cwd: repoRoot,
    file: join(repoRoot, "tests/tooling/biome-check-hook.int.test.ts"),
    bin: join(scratch, "unused-bin"),
    log: join(scratch, "pnpm.log"),
    runtime: join(scratch, "runtime"),
  };

  const malformedJson = runHook({ ...common, rawInput: "not-json{" });
  expect(malformedJson.status).toBe(0);
  expect(findings(malformedJson)).toContain("hook input is malformed");

  const malformedFileEvent = runHook({
    ...common,
    rawInput: hookPayload([
      ["hook_event_name", "PostToolUse"],
      ["tool_name", "Edit"],
    ]),
  });
  expect(malformedFileEvent.status).toBe(0);
  expect(findings(malformedFileEvent)).toContain("supported PostToolUse file event requires");

  const unsupported = runHook({
    ...common,
    rawInput: hookPayload([
      ["hook_event_name", "PostToolUse"],
      ["tool_name", "Bash"],
    ]),
  });
  expect(unsupported.status).toBe(0);
  expect(unsupported.stderr).toBe("");
  expect(unsupported.stdout).toBe("");
});

test("a main-registered launcher executes every leg in the payload worktree and preserves quoted paths", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  const runtime = join(scratch, "runtime dir");
  stubPnpm(bin);
  const hostile = "tests/client/$(touch injected).dom.test.ts";
  writeFileSync(join(checkout.worktree, hostile), "export const safe = true;\n");
  const result = runHook({
    hook: join(repoRoot, HOOK_REL),
    project: checkout.main,
    cwd: checkout.worktree,
    file: hostile,
    bin,
    log,
    runtime,
  });
  expect(result.status).toBe(0);
  expect(result.stdout, "a clean run prints no edit-check context").toBe("");
  const invocations = String(result.stdout) + (existsSync(log) ? readFileSync(log, "utf8") : "");
  expect(invocations).toContain(`${checkout.worktree}|exec biome check`);
  expect(invocations).toContain(`${checkout.worktree}|exec node tooling/src/verify/cli.ts typecheck-plan`);
  expect(invocations).toContain("-p tsconfig.tests-dom.json");
  expect(invocations).not.toContain(`${checkout.main}|`);
  expect(existsSync(join(checkout.worktree, "injected"))).toBe(false);
});

test("project settings use command plus args so a project path with spaces stays one operand", ({ repoRoot }) => {
  const settings = JSON.parse(readFileSync(join(repoRoot, ".claude/settings.json"), "utf8")) as unknown;
  const hooks = typeof settings === "object" && settings !== null ? Reflect.get(settings, "hooks") : undefined;
  const postToolUse = typeof hooks === "object" && hooks !== null ? Reflect.get(hooks, "PostToolUse") : undefined;
  const script = ["$", `{CLAUDE_PROJECT_DIR}/${HOOK_REL}`].join("");
  expect(postToolUse).toEqual([
    {
      matcher: "Edit|Write|MultiEdit",
      hooks: [{ type: "command", command: "node", args: [script] }],
    },
  ]);
});

test("JSON and Markdown files may carry an explicit not-applicable plan", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  stubPnpm(bin);
  const markdown = join(checkout.worktree, "README.md");
  writeFileSync(markdown, "# Fixture\n");
  for (const file of [join(checkout.worktree, "package.json"), markdown]) {
    const result = runHook({
      hook: join(repoRoot, HOOK_REL),
      project: checkout.main,
      cwd: checkout.worktree,
      file,
      bin,
      log: join(scratch, "pnpm.log"),
      runtime: join(scratch, "runtime"),
      mode: "not-applicable",
    });
    expect(result.status, file).toBe(0);
    expect(result.stderr, file).toBe("");
    expect(result.stdout, file).toBe("");
  }
});

test("a prose file edit runs no checker at all", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  stubPnpm(bin);
  const log = join(scratch, "pnpm.log");
  for (const name of ["NOTES.md", "config.yaml", "run.sh"]) {
    const file = join(checkout.worktree, name);
    writeFileSync(file, "x\n");
    const result = runHook({
      hook: join(repoRoot, HOOK_REL),
      project: checkout.main,
      cwd: checkout.worktree,
      file,
      bin,
      log,
      runtime: join(scratch, "runtime"),
      mode: "not-applicable",
    });
    expect(result.status, name).toBe(0);
    expect(result.stderr, name).toBe("");
    expect(result.stdout, name).toBe("");
  }
  expect(existsSync(log) ? readFileSync(log, "utf8") : "").toBe("");
});

test("a foreign checkout is refused before any repository command executes", ({ scratch, repoRoot }) => {
  const trusted = plantCheckout(join(scratch, "trusted"));
  const foreign = plantCheckout(join(scratch, "foreign"));
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  stubPnpm(bin);
  const result = runHook({
    hook: join(repoRoot, HOOK_REL),
    project: trusted.main,
    cwd: foreign.worktree,
    file: join(foreign.worktree, "tests/client/subject.dom.test.ts"),
    bin,
    log,
    runtime: join(scratch, "runtime"),
  });
  expect(result.status).toBe(0);
  expect(findings(result)).toContain("different repository");
  expect(existsSync(log)).toBe(false);
});

test("an edited symlink that escapes the trusted checkout is refused", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  stubPnpm(bin);
  const outside = join(scratch, "outside.ts");
  const link = join(checkout.worktree, "tests/client/escape.dom.test.ts");
  writeFileSync(outside, "export {};\n");
  symlinkSync(outside, link);
  const result = runHook({
    hook: join(repoRoot, HOOK_REL),
    project: checkout.main,
    cwd: checkout.worktree,
    file: link,
    bin,
    log,
    runtime: join(scratch, "runtime"),
  });
  expect(result.status).toBe(0);
  expect(findings(result)).toContain("outside the active checkout");
  expect(existsSync(log)).toBe(false);
});

test("an edit to a file OUTSIDE the checkout (scratchpad, bridge note, /tmp probe) is a silent no-op — exit 0, no stderr, nothing spawned", ({
  scratch,
  repoRoot,
}) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  stubPnpm(bin);
  const scratchpad = join(scratch, "session scratchpad");
  mkdirSync(scratchpad, { recursive: true });
  const outside = join(scratchpad, "branch-audit.sh");
  writeFileSync(outside, "#!/usr/bin/env bash\nexit 0\n");
  const result = runHook({
    hook: join(repoRoot, HOOK_REL),
    project: checkout.main,
    cwd: checkout.worktree,
    file: outside,
    bin,
    log,
    runtime: join(scratch, "runtime"),
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toBe("");
  expect(existsSync(log)).toBe(false);
});

test("hostile admission directories and slot symlinks are refused without touching their targets", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  stubPnpm(bin);
  const file = join(checkout.worktree, "tests/client/subject.dom.test.ts");
  const base = { hook: join(repoRoot, HOOK_REL), project: checkout.main, cwd: checkout.worktree, file, bin };
  const hookPool = (runtime: string): string => hostPoolDir({ name: "hook", label: "", slots: 1 }, { [HOST_POOL_ROOT_ENV]: runtime });

  const symlinkRuntime = join(scratch, "symlink-runtime");
  const symlinkTarget = join(scratch, "attacker-directory");
  mkdirSync(symlinkRuntime, { recursive: true, mode: 0o700 });
  mkdirSync(symlinkTarget, { recursive: true });
  symlinkSync(symlinkTarget, hookPool(symlinkRuntime));
  const symlinkPool = runHook({ ...base, log: join(scratch, "symlink.log"), runtime: symlinkRuntime });
  expect(symlinkPool.status).toBe(0);
  expect(findings(symlinkPool)).toContain("is a symlink or not a directory");
  expect(existsSync(join(symlinkTarget, "queue")), "nothing was created through the link").toBe(false);

  // A too-open pool directory this uid owns is not hostile: the slot layer tightens it to 0700 and admits the run.
  const openRuntime = join(scratch, "open-runtime");
  mkdirSync(hookPool(openRuntime), { recursive: true });
  chmodSync(hookPool(openRuntime), 0o777);
  const openPool = runHook({ ...base, log: join(scratch, "open.log"), runtime: openRuntime });
  expect(openPool.status).toBe(0);
  expect(openPool.stdout, "an admitted clean run prints no edit-check context").toBe("");
  expect(statSync(hookPool(openRuntime)).mode.toString(8).slice(-3), "the pool is tightened to owner-only").toBe("700");

  const lockRuntime = join(scratch, "lock-runtime");
  const target = join(scratch, "must-not-change.txt");
  mkdirSync(hookPool(lockRuntime), { recursive: true, mode: 0o700 });
  writeFileSync(target, "preserved\n");
  symlinkSync(target, join(hookPool(lockRuntime), "1.lock"));
  const hostileLock = runHook({ ...base, log: join(scratch, "lock.log"), runtime: lockRuntime });
  expect(hostileLock.status).toBe(0);
  expect(findings(hostileLock)).toContain("is a symlink or not a regular file");
  expect(readFileSync(target, "utf8")).toBe("preserved\n");
});

test("a torn slot record the hook clears is announced, never silent", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  stubPnpm(bin);
  const runtime = join(scratch, "torn-runtime");
  const pool = hostPoolDir({ name: "hook", label: "", slots: 1 }, { [HOST_POOL_ROOT_ENV]: runtime });
  mkdirSync(pool, { recursive: true, mode: 0o700 });
  // Every slot the hook could take holds a half-written record, so whichever it takes is a cleared torn file.
  for (let slot = 1; slot <= 16; slot += 1) {
    writeFileSync(join(pool, `${String(slot)}.lock`), '{"pid": ');
  }
  const file = join(checkout.worktree, "tests/client/subject.dom.test.ts");
  const run = runHook({ hook: join(repoRoot, HOOK_REL), project: checkout.main, cwd: checkout.worktree, file, bin, log: join(scratch, "torn.log"), runtime });
  expect(run.status).toBe(0);
  expect(findings(run)).toContain("an unreadable record");
});

// Eleven complete hook invocations share one fixture here so each planner/tool refusal and the admission
// non-verdict crosses the real shell boundary. Together they exceeded the generic 5s budget under load (#2308).
test("planner failure and admission contention are visible non-verdicts", { timeout: scaledBudget(10_000) }, ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  const runtime = join(scratch, "runtime");
  stubPnpm(bin);
  const hook = join(repoRoot, HOOK_REL);
  const file = join(checkout.worktree, "tests/client/subject.dom.test.ts");
  const broken = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file, bin, log, runtime, mode: "planner-failure" });
  expect(broken.status).toBe(0);
  expect(findings(broken)).toContain("checks without a verdict");
  expect(findings(broken)).toContain("planner failed");

  const empty = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file, bin, log, runtime, mode: "empty-plan" });
  expect(empty.status).toBe(0);
  expect(findings(empty)).toContain("planner returned malformed output");

  const emptyProgram = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file, bin, log, runtime, mode: "empty-program" });
  expect(emptyProgram.status).toBe(0);
  expect(findings(emptyProgram)).toContain("planner returned malformed output");

  for (const mode of ["mismatched-subject", "mismatched-program"]) {
    const mismatch = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file, bin, log, runtime, mode });
    expect(mismatch.status, mode).toBe(0);
    expect(findings(mismatch), mode).toContain("planner returned malformed output");
  }

  const unknown = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file, bin, log, runtime, mode: "unknown-program" });
  expect(unknown.status).toBe(0);
  expect(findings(unknown)).toContain("checks without a verdict");
  expect(findings(unknown)).toContain("compiler failed for tsconfig.missing.json");

  const biomeToolError = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file, bin, log, runtime, mode: "biome-tool-error" });
  expect(biomeToolError.status).toBe(0);
  expect(findings(biomeToolError)).toContain("biome failed without a diagnostic");
  expect(findings(biomeToolError)).not.toContain("biome (lint)");

  const packageFile = join(checkout.worktree, "packages/client/src/source.ts");
  mkdirSync(join(checkout.worktree, "packages/client/src"), { recursive: true });
  writeFileSync(packageFile, "export {};\n");
  const depFooter = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file: packageFile, bin, log, runtime, mode: "dep-footer-only" });
  expect(depFooter.status).toBe(0);
  expect(findings(depFooter)).toContain("dep-cruiser returned malformed or empty JSON");
  expect(findings(depFooter)).toContain("1 dependency violations");

  const orphanOnly = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file: packageFile, bin, log, runtime, mode: "dep-no-orphans" });
  expect(orphanOnly.status).toBe(0);
  expect(orphanOnly.stdout, "an excluded no-orphans violation is not a finding").toBe("");

  const actionable = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file: packageFile, bin, log, runtime, mode: "dep-actionable" });
  expect(actionable.status).toBe(0);
  expect(findings(actionable)).toContain("dep-cruiser (imports)");
  expect(findings(actionable)).toContain("client-cake");
  expect(findings(actionable)).toContain("client cannot import server runtime");

  // Every hook slot held by a LIVE process — this test's own — is admission contention: each leg says it
  // was skipped, and nothing is spawned for it.
  const pool = hostPoolDir({ name: "hook", label: "", slots: 1 }, { [HOST_POOL_ROOT_ENV]: runtime });
  mkdirSync(pool, { recursive: true, mode: 0o700 });
  for (let slot = 1; slot <= readConcurrencyProfile({}).hookPoolSlots; slot += 1) {
    writeFileSync(join(pool, `${String(slot)}.lock`), JSON.stringify({ pid: process.pid, startedAt: "x", label: "a live holder" }));
  }
  const contended = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file, bin, log: join(scratch, "contended.log"), runtime });
  expect(contended.status).toBe(0);
  expect(findings(contended)).toContain("checks without a verdict");
  expect(findings(contended)).toContain("shared slots busy");
  expect(findings(contended)).toContain("SKIPPED");
  expect(existsSync(join(scratch, "contended.log")), "a skipped leg spawns nothing").toBe(false);
});

// The hook reads two MACHINE-READABLE streams — the typecheck planner's `--json` and dep-cruiser's
// `--output-type json` — from children it launches through `pnpm exec`, and pnpm prints its OWN
// install/prepare reporting on STDOUT above the wrapped command's output whenever it decides the store
// needs verifying. Measured in this checkout on 2026-09-12: `Scope: all 9 workspace projects … .
// prepare: lefthook install … Done in 1.6s using pnpm v11.15.1` landed above well-formed planner JSON,
// the payload parse refused it, and the typecheck leg was SKIPPED behind a line that reads like noise. That is
// a FAIL-OPEN in the one advisory every lane leans on, so each leg gets both directions here: the leg
// must still FIRE under the preamble, and must still be SILENT under the preamble when the tree is
// clean. The third arm is the refusal: a stream carrying preamble and NO payload must stay a loud
// non-verdict, never a clean pass.
test("a pnpm wrapper preamble above the JSON payload cannot skip the typecheck or dep-cruiser leg", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  const runtime = join(scratch, "runtime");
  stubPnpm(bin);
  const hook = join(repoRoot, HOOK_REL);
  const file = join(checkout.worktree, "tests/client/subject.dom.test.ts");
  const base = { hook, project: checkout.main, cwd: checkout.worktree, bin, runtime };

  const cleanLog = join(scratch, "preamble-clean.log");
  const clean = runHook({ ...base, file, log: cleanLog, mode: "plan-preamble" });
  expect(clean.status).toBe(0);
  expect(clean.stderr).toBe("");
  expect(clean.stdout).toBe("");
  expect(readFileSync(cleanLog, "utf8")).toContain("-p tsconfig.tests-dom.json");

  const biteLog = join(scratch, "preamble-bite.log");
  const bite = runHook({ ...base, file, log: biteLog, mode: "plan-preamble-diagnostic" });
  expect(bite.status).toBe(0);
  expect(findings(bite)).not.toContain("planner returned malformed output");
  expect(findings(bite)).toContain("── tsconfig.tests-dom.json ──");
  expect(findings(bite)).toContain("TS2322");
  expect(findings(bite)).toContain("subject.dom.test.ts:3,9");
  expect(readFileSync(biteLog, "utf8")).toContain("-p tsconfig.tests-dom.json");

  const noiseLog = join(scratch, "preamble-noise.log");
  const noise = runHook({ ...base, file, log: noiseLog, mode: "plan-preamble-only" });
  expect(noise.status).toBe(0);
  expect(findings(noise)).toContain("checks without a verdict");
  expect(findings(noise)).toContain("typecheck planner printed no JSON payload");
  expect(findings(noise)).toContain("Done in 1.6s using pnpm v11.15.1");
  expect(readFileSync(noiseLog, "utf8")).not.toContain("ts7.ts");

  const packageFile = join(checkout.worktree, "packages/client/src/source.ts");
  mkdirSync(join(checkout.worktree, "packages/client/src"), { recursive: true });
  writeFileSync(packageFile, "export {};\n");

  const depBite = runHook({ ...base, file: packageFile, log: join(scratch, "preamble-dep-bite.log"), mode: "dep-preamble-actionable" });
  expect(depBite.status).toBe(0);
  expect(findings(depBite)).not.toContain("dep-cruiser returned malformed or empty JSON");
  expect(findings(depBite)).toContain("dep-cruiser (imports)");
  expect(findings(depBite)).toContain("client-cake");

  const depClean = runHook({ ...base, file: packageFile, log: join(scratch, "preamble-dep-clean.log"), mode: "dep-preamble-clean" });
  expect(depClean.status).toBe(0);
  expect(depClean.stderr).toBe("");
  expect(depClean.stdout).toBe("");

  // biome's concise reporter puts its DIAGNOSTICS on stderr and its counters on stdout, which is the
  // stream pnpm's own reporting shares. The lint block therefore carries the diagnostic and none of the
  // wrapper's chatter.
  const lint = runHook({ ...base, file, log: join(scratch, "preamble-biome.log"), mode: "biome-preamble-finding" });
  expect(lint.status).toBe(0);
  expect(findings(lint)).toContain("biome (lint)");
  expect(findings(lint)).toContain("lint/suspicious/noDoubleEquals");
  expect(findings(lint)).not.toContain("Done in 1.6s using pnpm v11.15.1");
  expect(findings(lint)).not.toContain("Scope: all 9 workspace projects");

  // The other direction of the same assumption: a reporter that moves the diagnostics to stdout must be
  // a NAMED non-verdict, never an empty lint block that reads like a clean file.
  const moved = runHook({ ...base, file, log: join(scratch, "biome-stdout.log"), mode: "biome-stdout-diagnostic" });
  expect(moved.status).toBe(0);
  expect(findings(moved)).toContain("its reporter contract changed");
  expect(findings(moved)).not.toContain("biome (lint)");
});

const ELSEWHERE = "current type error(s) in files outside this edit:";

function redProgramRun(scratch: string, repoRoot: string): { readonly checkout: string; readonly base: HookRun } {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  stubPnpm(bin);
  return {
    checkout: checkout.worktree,
    base: {
      hook: join(repoRoot, HOOK_REL),
      project: checkout.main,
      cwd: checkout.worktree,
      file: join(checkout.worktree, "tests/client/subject.dom.test.ts"),
      bin,
      log: join(scratch, "pnpm.log"),
      runtime: join(scratch, "runtime"),
    },
  };
}

test("a consumer error blocks on every check: no check turns its own output into inheritance", ({ scratch, repoRoot }) => {
  const { base } = redProgramRun(scratch, repoRoot);
  const clean = runHook(base);
  expect(clean.status).toBe(0);
  expect(clean.stdout).toBe("");
  for (const attempt of ["first", "repeat"]) {
    const broken = runHook({ ...base, mode: "consumer-diagnostic" });
    expect(broken.status, attempt).toBe(0);
    expect(findings(broken), attempt).toContain("── tsconfig.tests-dom.json ──");
    // The position belongs to a file the edit never touched: a break the edit caused in a consumer blocks.
    expect(findings(broken), attempt).toContain("unchanged-consumer.ts:7,3");
    expect(findings(broken), attempt).toContain(`1 ${ELSEWHERE}`);
  }
});

test("a well-formed count file from an earlier hook version cannot hide a consumer break", ({ scratch, repoRoot }) => {
  const { checkout, base } = redProgramRun(scratch, repoRoot);
  // The exact path and shape the earlier hook wrote from its own post-edit output.
  const gitDir = execFixtureGit(checkout, ["rev-parse", "--absolute-git-dir"]).trim();
  const key = createHash("sha256")
    .update(`${realpathSync(checkout)}\0tsconfig.tests-dom.json`)
    .digest("hex")
    .slice(0, 16);
  mkdirSync(join(gitDir, "orb-edit-hook"), { recursive: true });
  const identity = ["tests/client/unchanged-consumer.ts", "TS2322", "Type string is not assignable to number."].join("\0");
  writeFileSync(
    join(gitDir, "orb-edit-hook", `typecheck-${key}.json`),
    `${JSON.stringify({ program: "tsconfig.tests-dom.json", counts: { [identity]: 1 } })}\n`,
  );
  const result = runHook({ ...base, mode: "consumer-diagnostic" });
  expect(result.status).toBe(0);
  expect(findings(result)).toContain("unchanged-consumer.ts:7,3");
});

test("an error in the edited file is listed first, and the program's other current errors still block", ({ scratch, repoRoot }) => {
  const { base } = redProgramRun(scratch, repoRoot);
  const result = runHook({ ...base, mode: "consumer-and-edited-diagnostic" });
  expect(result.status).toBe(0);
  const stderr = findings(result);
  expect(stderr).toContain("TS2305");
  expect(stderr).toContain("── 2 type error(s) ──");
  const edited = stderr.indexOf("subject.dom.test.ts:3,9");
  const label = stderr.indexOf(`1 ${ELSEWHERE}`);
  const consumer = stderr.indexOf("unchanged-consumer.ts:7,3");
  expect(edited).toBeGreaterThan(-1);
  expect(label).toBeGreaterThan(edited);
  expect(consumer).toBeGreaterThan(label);
});

test("an absolute edit into a lane worktree nested in main's tree is checked in that worktree", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const lane = join(checkout.main, ".claude", "worktrees", "lane");
  git(checkout.main, "worktree", "add", "--quiet", "-b", "fixture-lane", lane);
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  stubPnpm(bin);
  const result = runHook({
    hook: join(repoRoot, HOOK_REL),
    project: checkout.main,
    cwd: checkout.main,
    file: join(lane, "tests/client/subject.dom.test.ts"),
    bin,
    log,
    runtime: join(scratch, "runtime"),
  });
  expect(result.status).toBe(0);
  expect(result.stdout, "a clean run prints no edit-check context").toBe("");
  const invocations = readFileSync(log, "utf8");
  expect(invocations).toContain(`${realpathSync(lane)}|exec biome check`);
  expect(invocations).toContain("-- tests/client/subject.dom.test.ts");
  expect(invocations).not.toContain(".claude/worktrees/lane/tests");
  expect(invocations).not.toContain(`${checkout.main}|`);
});

test("the typecheck leg asks the ts7 pool as an advisory caller, and a busy pool is a named skip, not a compiler failure", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  stubPnpm(bin);
  const result = runHook({
    hook: join(repoRoot, HOOK_REL),
    project: checkout.main,
    cwd: checkout.worktree,
    file: join(checkout.worktree, "tests/client/subject.dom.test.ts"),
    bin,
    log,
    runtime: join(scratch, "runtime"),
    mode: "ts7-busy",
  });
  expect(result.status).toBe(0);
  expect(findings(result)).toContain("typecheck: tsconfig.tests-dom.json was SKIPPED — every host typecheck slot is busy");
  expect(findings(result)).not.toContain("compiler failed");
  const ts7Line = readFileSync(log, "utf8")
    .split("\n")
    .find((line) => line.includes("scripts/ts7.ts"));
  expect(ts7Line, "the ts7 leg is spawned as an advisory try").toContain("admission=try");
  expect(ts7Line).toContain(`--checkers ${String(readConcurrencyProfile({}).hookTs7Checkers)}`);
});

test("a program already being checked for this checkout is skipped, not run twice", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  const runtime = join(scratch, "runtime");
  stubPnpm(bin);
  // The duplicate-suppression pool is keyed by the checkout's real path and the program.
  const key = createHash("sha256")
    .update(`${realpathSync(checkout.worktree)}\0tsconfig.tests-dom.json`)
    .digest("hex")
    .slice(0, 16);
  const dir = hostPoolDir({ name: `hook-typecheck-${key}`, label: "", slots: 1 }, { [HOST_POOL_ROOT_ENV]: runtime });
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, "1.lock"), JSON.stringify({ pid: process.pid, startedAt: "x", label: "the first edit's typecheck" }));
  const result = runHook({
    hook: join(repoRoot, HOOK_REL),
    project: checkout.main,
    cwd: checkout.worktree,
    file: join(checkout.worktree, "tests/client/subject.dom.test.ts"),
    bin,
    log,
    runtime,
  });
  expect(result.status).toBe(0);
  expect(findings(result)).toContain("typecheck: tsconfig.tests-dom.json is already running for this checkout; it was SKIPPED");
  expect(readFileSync(log, "utf8")).not.toContain("scripts/ts7.ts");
});

test("Codex patch findings reach model context with one planner and one compiler run for a multi-file world", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const adapter = installCodexAdapter(checkout.worktree, repoRoot);
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  stubPnpm(bin);
  writeFileSync(join(checkout.worktree, "tests/client/second.dom.test.ts"), "export const second = true;\n");
  const patch = ["*** Begin Patch", "*** Update File: tests/client/subject.dom.test.ts", "*** Add File: tests/client/second.dom.test.ts", "*** End Patch"].join(
    "\r\n",
  );
  const result = runHook({
    hook: adapter,
    project: checkout.main,
    cwd: checkout.worktree,
    file: "",
    bin,
    log,
    runtime: join(scratch, "runtime"),
    mode: "batch-diagnostic",
    tsFile: "tests/client/second.dom.test.ts",
    rawInput: codexPayload(checkout.worktree, patch),
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  const output = JSON.parse(String(result.stdout)) as { hookSpecificOutput?: { hookEventName?: string; additionalContext?: string } };
  expect(output.hookSpecificOutput?.hookEventName).toBe("PostToolUse");
  expect(output.hookSpecificOutput?.additionalContext).toContain("TS2322");
  expect(output.hookSpecificOutput?.additionalContext).toContain("second.dom.test.ts:7,3");
  const commands = readFileSync(log, "utf8").split("\n");
  expect(commands.filter((line) => line.includes("typecheck-plan"))).toHaveLength(1);
  expect(commands.filter((line) => line.includes("scripts/ts7.ts"))).toHaveLength(1);
  expect(commands.filter((line) => line.includes("exec biome"))).toHaveLength(2);
  expect(commands.filter((line) => line !== "").every((line) => line.startsWith(`${checkout.worktree}|`))).toBe(true);
});

test("Codex adapter reports tool nonverdicts, deletion gaps, and failed patch results without false clean", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const adapter = installCodexAdapter(checkout.worktree, repoRoot);
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  stubPnpm(bin);
  const patch = "*** Begin Patch\n*** Update File: tests/client/subject.dom.test.ts\n*** End Patch";
  const base = { hook: adapter, project: checkout.main, cwd: checkout.worktree, file: "", bin, log, runtime: join(scratch, "runtime") };
  const error = runHook({ ...base, mode: "biome-tool-error", rawInput: codexPayload(checkout.worktree, patch) });
  expect(error.status).toBe(0);
  expect(codexContext(error)).toContain("checks without a verdict");
  expect(codexContext(error)).toContain("biome failed without a diagnostic");

  unlinkSync(join(checkout.worktree, "tests/client/subject.dom.test.ts"));
  const deletion = runHook({
    ...base,
    rawInput: codexPayload(checkout.worktree, "*** Begin Patch\n*** Delete File: tests/client/subject.dom.test.ts\n*** End Patch"),
  });
  expect(deletion.status).toBe(0);
  expect(codexContext(deletion)).toContain("deleted");
  const beforeFailed = readFileSync(log, "utf8");
  const failed = runHook({
    ...base,
    rawInput: codexPayload(checkout.worktree, patch, { isError: true, content: [{ type: "text", text: "Failed to find expected lines" }] }),
  });
  expect(failed.status).toBe(0);
  expect(failed.stdout).toBe("");
  const failedText = runHook({
    ...base,
    rawInput: codexPayload(checkout.worktree, patch, "apply_patch verification failed: expected lines were absent"),
  });
  expect(failedText.status).toBe(0);
  expect(failedText.stdout).toBe("");
  expect(readFileSync(log, "utf8")).toBe(beforeFailed);
});

test("Codex adapter rejects foreign checkout before running pnpm", ({ scratch, repoRoot }) => {
  const trusted = plantCheckout(join(scratch, "trusted"));
  const foreign = plantCheckout(join(scratch, "foreign"));
  const adapter = installCodexAdapter(trusted.worktree, repoRoot);
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  stubPnpm(bin);
  const result = runHook({
    hook: adapter,
    project: trusted.main,
    cwd: foreign.worktree,
    file: "",
    bin,
    log,
    runtime: join(scratch, "runtime"),
    rawInput: codexPayload(foreign.worktree, "*** Begin Patch\n*** Update File: tests/client/subject.dom.test.ts\n*** End Patch"),
  });
  expect(result.status).toBe(0);
  expect(codexContext(result)).toContain("different repository");
  expect(existsSync(log)).toBe(false);
});

test("Codex adapter checks a moved destination and names the removed source", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const adapter = installCodexAdapter(checkout.worktree, repoRoot);
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  stubPnpm(bin);
  renameSync(join(checkout.worktree, "tests/client/subject.dom.test.ts"), join(checkout.worktree, "tests/client/moved.dom.test.ts"));
  const patch = "*** Begin Patch\n*** Update File: tests/client/subject.dom.test.ts\n*** Move to: tests/client/moved.dom.test.ts\n*** End Patch";
  const result = runHook({
    hook: adapter,
    project: checkout.main,
    cwd: checkout.worktree,
    file: "",
    bin,
    log,
    runtime: join(scratch, "runtime"),
    mode: "batch-diagnostic",
    tsFile: "tests/client/moved.dom.test.ts",
    rawInput: codexPayload(checkout.worktree, patch),
  });
  expect(result.status).toBe(0);
  const context = codexContext(result);
  expect(context).toContain("TS2322");
  expect(context).toContain("subject.dom.test.ts: deleted or moved away");
  expect(readFileSync(log, "utf8")).toContain("tests/client/moved.dom.test.ts");
  expect(readFileSync(log, "utf8")).not.toContain("-- tests/client/subject.dom.test.ts");
});

test("Codex adapter silently ignores deleted prose and paths outside its checkout", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const adapter = installCodexAdapter(checkout.worktree, repoRoot);
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  stubPnpm(bin);
  const outside = join(scratch, "elsewhere.ts");
  const patch = `*** Begin Patch\n*** Delete File: README.md\n*** Delete File: ${outside}\n*** End Patch`;
  const result = runHook({
    hook: adapter,
    project: checkout.main,
    cwd: checkout.worktree,
    file: "",
    bin,
    log,
    runtime: join(scratch, "runtime"),
    rawInput: codexPayload(checkout.worktree, patch),
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("");
  expect(existsSync(log)).toBe(false);
});

test("Codex adapter in main routes an absolute patch path to the nested lane worktree", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const lane = join(checkout.main, ".claude", "worktrees", "lane");
  git(checkout.main, "worktree", "add", "--quiet", "-b", "fixture-lane", lane);
  const adapter = installCodexAdapter(checkout.main, repoRoot);
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  stubPnpm(bin);
  const result = runHook({
    hook: adapter,
    project: checkout.main,
    cwd: checkout.main,
    file: "",
    bin,
    log,
    runtime: join(scratch, "runtime"),
    rawInput: codexPayload(checkout.main, `*** Begin Patch\n*** Update File: ${join(lane, "tests/client/subject.dom.test.ts")}\n*** End Patch`),
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("");
  const invocations = readFileSync(log, "utf8");
  expect(invocations).toContain(`${realpathSync(lane)}|exec node tooling/src/verify/cli.ts typecheck-plan`);
  expect(invocations).not.toContain(`${checkout.main}|`);
});

// The owner disabled automatic Codex edit feedback; the marker also silences sessions that kept the old command.
test("Codex edit feedback stays unregistered while the owner's disable marker exists", ({ repoRoot }) => {
  const config = JSON.parse(readFileSync(join(repoRoot, ".codex/hooks.json"), "utf8")) as { hooks?: Record<string, unknown> };
  expect(existsSync(join(repoRoot, ".codex/edit-feedback.disabled"))).toBe(true);
  expect(config.hooks?.["PostToolUse"]).toBeUndefined();
});
