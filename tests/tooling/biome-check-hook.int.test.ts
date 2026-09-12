import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { expect, test } from "../support/tool-fixtures.ts";

const GIT_ARGS = ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"] as const;

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync("git", [...GIT_ARGS, ...args], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
}

function plantCheckout(scratch: string): { readonly main: string; readonly worktree: string } {
  const main = join(scratch, "main checkout");
  const worktree = join(scratch, "linked worktree");
  mkdirSync(join(main, "tooling"), { recursive: true });
  mkdirSync(join(main, "tests", "client"), { recursive: true });
  writeFileSync(join(main, "package.json"), '{"name":"fixture","private":true}\n');
  writeFileSync(join(main, ".dependency-cruiser.cjs"), "module.exports = {};\n");
  writeFileSync(
    join(main, "tooling", "concurrency-profile.json"),
    '{"profiles":{"shared":{"hookPoolSlots":3,"hookTs7Checkers":1},"dedicated":{"hookPoolSlots":3,"hookTs7Checkers":1}}}\n',
  );
  writeFileSync(join(main, "tests", "client", "subject.dom.test.ts"), "export const subject = true;\n");
  git(main, "init", "--quiet");
  git(main, "config", "user.email", "test@orb.local");
  git(main, "config", "user.name", "orb test");
  git(main, "add", ".");
  git(main, "commit", "--quiet", "-m", "fixture");
  git(main, "worktree", "add", "--quiet", "-b", "fixture-worktree", worktree);
  return { main, worktree };
}

function stubPnpm(bin: string): void {
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "pnpm"),
    `#!/usr/bin/env bash
printf '%s|%s\n' "$PWD" "$*" >> "$HOOK_TEST_LOG"
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
if [[ "$*" == *"scripts/ts7.cjs"* ]] && [ "\${HOOK_TEST_MODE:-}" = "plan-preamble-diagnostic" ]; then
  printf 'tests/client/subject.dom.test.ts(3,9): error TS2322: Type string is not assignable to number.\n'
  exit 1
fi
if [[ "$*" == *"scripts/ts7.cjs"* ]] && [ "\${HOOK_TEST_MODE:-}" = "consumer-diagnostic" ]; then
  printf 'tests/client/unchanged-consumer.ts(7,3): error TS2322: Type string is not assignable to number.\n'
  exit 1
fi
if [[ "$*" == *"scripts/ts7.cjs"* ]] && [ "\${HOOK_TEST_MODE:-}" = "unknown-program" ]; then
  printf 'project config does not exist\n' >&2
  exit 2
fi
exit 0
`,
    { mode: 0o755 },
  );
}

interface HookRun {
  readonly hook: string;
  readonly project: string;
  readonly cwd: string;
  readonly file: string;
  readonly bin: string;
  readonly log: string;
  readonly runtime: string;
  readonly mode?: string;
  readonly path?: string;
  readonly rawInput?: string;
  readonly tempDir?: string;
}

function runHook(input: HookRun): ReturnType<typeof spawnSync> {
  mkdirSync(input.runtime, { recursive: true, mode: 0o700 });
  chmodSync(input.runtime, 0o700);
  const payload = JSON.stringify(
    Object.fromEntries([
      ["hook_event_name", "PostToolUse"],
      ["tool_name", "Edit"],
      ["cwd", input.cwd],
      ["tool_input", Object.fromEntries([["file_path", input.file]])],
    ]),
  );
  return spawnSync("/bin/bash", [input.hook], {
    encoding: "utf8",
    input: input.rawInput ?? payload,
    env: {
      ...inheritedProcessEnv({}),
      ...Object.fromEntries([
        ["PATH", input.path ?? `${input.bin}:/usr/bin:/bin`],
        ["CLAUDE_PROJECT_DIR", input.project],
        ["XDG_RUNTIME_DIR", input.runtime],
        ["HOOK_TEST_LOG", input.log],
        ["HOOK_TEST_MODE", input.mode ?? ""],
        ...(input.tempDir === undefined ? [] : [["TMPDIR", input.tempDir]]),
      ]),
    },
  });
}

function hookPayload(entries: readonly (readonly [string, unknown])[]): string {
  return JSON.stringify(Object.fromEntries(entries));
}

test("missing jq and malformed supported-event payloads are visible while a valid unsupported event is ignored", ({ scratch, repoRoot }) => {
  const hook = join(repoRoot, ".claude/hooks/biome-check.sh");
  const common = {
    hook,
    project: repoRoot,
    cwd: repoRoot,
    file: join(repoRoot, "tests/tooling/biome-check-hook.int.test.ts"),
    bin: join(scratch, "unused-bin"),
    log: join(scratch, "pnpm.log"),
    runtime: join(scratch, "runtime"),
  };
  mkdirSync(common.bin, { recursive: true });
  for (const [name, target] of [
    ["bash", "/bin/bash"],
    ["cat", "/usr/bin/cat"],
    ["git", "/usr/bin/git"],
  ] as const) {
    symlinkSync(target, join(common.bin, name));
  }

  const missingJq = runHook({ ...common, path: common.bin });
  expect(missingJq.status).toBe(2);
  expect(missingJq.stderr).toContain("jq is unavailable");

  const malformedJson = runHook({ ...common, rawInput: "not-json{" });
  expect(malformedJson.status).toBe(2);
  expect(malformedJson.stderr).toContain("hook input is malformed");

  const malformedFileEvent = runHook({
    ...common,
    rawInput: hookPayload([
      ["hook_event_name", "PostToolUse"],
      ["tool_name", "Edit"],
    ]),
  });
  expect(malformedFileEvent.status).toBe(2);
  expect(malformedFileEvent.stderr).toContain("supported PostToolUse file event requires");

  const unsupported = runHook({
    ...common,
    rawInput: hookPayload([
      ["hook_event_name", "PostToolUse"],
      ["tool_name", "Bash"],
    ]),
  });
  expect(unsupported.status).toBe(0);
  expect(unsupported.stderr).toBe("");

  const missingTempRoot = runHook({ ...common, tempDir: join(scratch, "missing-tmp-root") });
  expect(missingTempRoot.status).toBe(2);
  expect(missingTempRoot.stderr).toContain("temporary workspace could not be created");

  const unwritableTempRoot = join(scratch, "unwritable-tmp-root");
  mkdirSync(unwritableTempRoot, { mode: 0o700 });
  chmodSync(unwritableTempRoot, 0o000);
  const unwritableTemp = runHook({ ...common, tempDir: unwritableTempRoot });
  chmodSync(unwritableTempRoot, 0o700);
  expect(unwritableTemp.status).toBe(2);
  expect(unwritableTemp.stderr).toContain("temporary workspace could not be created");
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
    hook: join(repoRoot, ".claude/hooks/biome-check.sh"),
    project: checkout.main,
    cwd: checkout.worktree,
    file: hostile,
    bin,
    log,
    runtime,
  });
  expect(result.status).toBe(0);
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
  const script = ["$", "{CLAUDE_PROJECT_DIR}/.claude/hooks/biome-check.sh"].join("");
  expect(postToolUse).toEqual([
    {
      matcher: "Edit|Write|MultiEdit",
      hooks: [{ type: "command", command: "bash", args: [script] }],
    },
  ]);
});

test("a non-TypeScript file may carry an explicit not-applicable plan", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  stubPnpm(bin);
  const result = runHook({
    hook: join(repoRoot, ".claude/hooks/biome-check.sh"),
    project: checkout.main,
    cwd: checkout.worktree,
    file: join(checkout.worktree, "package.json"),
    bin,
    log: join(scratch, "pnpm.log"),
    runtime: join(scratch, "runtime"),
    mode: "not-applicable",
  });
  expect(result.status).toBe(0);
});

test("a foreign checkout is refused before any repository command executes", ({ scratch, repoRoot }) => {
  const trusted = plantCheckout(join(scratch, "trusted"));
  const foreign = plantCheckout(join(scratch, "foreign"));
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  stubPnpm(bin);
  const result = runHook({
    hook: join(repoRoot, ".claude/hooks/biome-check.sh"),
    project: trusted.main,
    cwd: foreign.worktree,
    file: join(foreign.worktree, "tests/client/subject.dom.test.ts"),
    bin,
    log,
    runtime: join(scratch, "runtime"),
  });
  expect(result.status).toBe(2);
  expect(result.stderr).toContain("different repository");
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
    hook: join(repoRoot, ".claude/hooks/biome-check.sh"),
    project: checkout.main,
    cwd: checkout.worktree,
    file: link,
    bin,
    log,
    runtime: join(scratch, "runtime"),
  });
  expect(result.status).toBe(2);
  expect(result.stderr).toContain("outside the active checkout");
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
    hook: join(repoRoot, ".claude/hooks/biome-check.sh"),
    project: checkout.main,
    cwd: checkout.worktree,
    file: outside,
    bin,
    log,
    runtime: join(scratch, "runtime"),
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(existsSync(log)).toBe(false);
});

test("hostile admission directories and lock symlinks are refused without touching their targets", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  stubPnpm(bin);
  const hook = join(repoRoot, ".claude/hooks/biome-check.sh");
  const file = join(checkout.worktree, "tests/client/subject.dom.test.ts");
  const uid = String(process.getuid?.() ?? process.geteuid?.() ?? 0);
  const base = { hook, project: checkout.main, cwd: checkout.worktree, file, bin };

  const symlinkRuntime = join(scratch, "symlink-runtime");
  const symlinkTarget = join(scratch, "attacker-directory");
  mkdirSync(symlinkRuntime, { recursive: true, mode: 0o700 });
  chmodSync(symlinkRuntime, 0o700);
  mkdirSync(symlinkTarget, { recursive: true });
  symlinkSync(symlinkTarget, join(symlinkRuntime, `orb-hook-pool-${uid}`));
  const symlinkPool = runHook({ ...base, log: join(scratch, "symlink.log"), runtime: symlinkRuntime });
  expect(symlinkPool.status).toBe(2);
  expect(symlinkPool.stderr).toContain("admission directory must not be a symlink");

  const openRuntime = join(scratch, "open-runtime");
  const openPool = join(openRuntime, `orb-hook-pool-${uid}`);
  mkdirSync(openPool, { recursive: true, mode: 0o777 });
  chmodSync(openRuntime, 0o700);
  chmodSync(openPool, 0o777);
  const insecurePool = runHook({ ...base, log: join(scratch, "open.log"), runtime: openRuntime });
  expect(insecurePool.status).toBe(2);
  expect(insecurePool.stderr).toContain("owned mode-0700 directory");

  const lockRuntime = join(scratch, "lock-runtime");
  const lockPool = join(lockRuntime, `orb-hook-pool-${uid}`);
  const target = join(scratch, "must-not-change.txt");
  mkdirSync(lockPool, { recursive: true, mode: 0o700 });
  chmodSync(lockRuntime, 0o700);
  chmodSync(lockPool, 0o700);
  writeFileSync(target, "preserved\n");
  symlinkSync(target, join(lockPool, "slot.1.lock"));
  const hostileLock = runHook({ ...base, log: join(scratch, "lock.log"), runtime: lockRuntime });
  expect(hostileLock.status).toBe(2);
  expect(hostileLock.stderr).toContain("admission lock is not an owned mode-0600 regular file");
  expect(readFileSync(target, "utf8")).toBe("preserved\n");
});

test("planner failure and admission contention are visible non-verdicts", async ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  const runtime = join(scratch, "runtime");
  stubPnpm(bin);
  const hook = join(repoRoot, ".claude/hooks/biome-check.sh");
  const file = join(checkout.worktree, "tests/client/subject.dom.test.ts");
  const broken = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file, bin, log, runtime, mode: "planner-failure" });
  expect(broken.status).toBe(2);
  expect(broken.stderr).toContain("checks without a verdict");
  expect(broken.stderr).toContain("planner failed");

  const empty = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file, bin, log, runtime, mode: "empty-plan" });
  expect(empty.status).toBe(2);
  expect(empty.stderr).toContain("planner returned malformed output");

  const emptyProgram = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file, bin, log, runtime, mode: "empty-program" });
  expect(emptyProgram.status).toBe(2);
  expect(emptyProgram.stderr).toContain("planner returned malformed output");

  for (const mode of ["mismatched-subject", "mismatched-program"]) {
    const mismatch = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file, bin, log, runtime, mode });
    expect(mismatch.status, mode).toBe(2);
    expect(mismatch.stderr, mode).toContain("planner returned malformed output");
  }

  const unknown = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file, bin, log, runtime, mode: "unknown-program" });
  expect(unknown.status).toBe(2);
  expect(unknown.stderr).toContain("checks without a verdict");
  expect(unknown.stderr).toContain("compiler failed for tsconfig.missing.json");

  const biomeToolError = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file, bin, log, runtime, mode: "biome-tool-error" });
  expect(biomeToolError.status).toBe(2);
  expect(biomeToolError.stderr).toContain("biome failed without a diagnostic");
  expect(biomeToolError.stderr).not.toContain("biome (lint)");

  const packageFile = join(checkout.worktree, "packages/client/src/source.ts");
  mkdirSync(join(checkout.worktree, "packages/client/src"), { recursive: true });
  writeFileSync(packageFile, "export {};\n");
  const depFooter = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file: packageFile, bin, log, runtime, mode: "dep-footer-only" });
  expect(depFooter.status).toBe(2);
  expect(depFooter.stderr).toContain("dep-cruiser returned malformed or empty JSON");
  expect(depFooter.stderr).toContain("1 dependency violations");

  const orphanOnly = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file: packageFile, bin, log, runtime, mode: "dep-no-orphans" });
  expect(orphanOnly.status).toBe(0);

  const actionable = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file: packageFile, bin, log, runtime, mode: "dep-actionable" });
  expect(actionable.status).toBe(2);
  expect(actionable.stderr).toContain("dep-cruiser (imports)");
  expect(actionable.stderr).toContain("client-cake");
  expect(actionable.stderr).toContain("client cannot import server runtime");

  const pool = join(runtime, `orb-hook-pool-${String(process.getuid?.() ?? process.geteuid?.() ?? 0)}`);
  mkdirSync(pool, { recursive: true, mode: 0o700 });
  chmodSync(pool, 0o700);
  const holders = [1, 2, 3].map((slot) => {
    const lock = join(pool, `slot.${String(slot)}.lock`);
    writeFileSync(lock, "", { mode: 0o600 });
    chmodSync(lock, 0o600);
    return spawn("/usr/bin/flock", [lock, "sleep", "10"], { stdio: "ignore" });
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  try {
    const contended = runHook({ hook, project: checkout.main, cwd: checkout.worktree, file, bin, log, runtime });
    expect(contended.status).toBe(2);
    expect(contended.stderr).toContain("checks without a verdict");
    expect(contended.stderr).toContain("shared slots busy");
    expect(contended.stderr).toContain("SKIPPED");
  } finally {
    for (const holder of holders) {
      holder.kill("SIGTERM");
    }
  }
});

// The hook reads two MACHINE-READABLE streams — the typecheck planner's `--json` and dep-cruiser's
// `--output-type json` — from children it launches through `pnpm exec`, and pnpm prints its OWN
// install/prepare reporting on STDOUT above the wrapped command's output whenever it decides the store
// needs verifying. Measured in this checkout on 2026-09-12: `Scope: all 9 workspace projects … .
// prepare: lefthook install … Done in 1.6s using pnpm v11.15.1` landed above well-formed planner JSON,
// `jq` refused the file, and the typecheck leg was SKIPPED behind a line that reads like noise. That is
// a FAIL-OPEN in the one advisory every lane leans on, so each leg gets both directions here: the leg
// must still FIRE under the preamble, and must still be SILENT under the preamble when the tree is
// clean. The third arm is the refusal: a stream carrying preamble and NO payload must stay a loud
// non-verdict, never a clean pass.
test("a pnpm wrapper preamble above the JSON payload cannot skip the typecheck or dep-cruiser leg", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  const runtime = join(scratch, "runtime");
  stubPnpm(bin);
  const hook = join(repoRoot, ".claude/hooks/biome-check.sh");
  const file = join(checkout.worktree, "tests/client/subject.dom.test.ts");
  const base = { hook, project: checkout.main, cwd: checkout.worktree, bin, runtime };

  const cleanLog = join(scratch, "preamble-clean.log");
  const clean = runHook({ ...base, file, log: cleanLog, mode: "plan-preamble" });
  expect(clean.status).toBe(0);
  expect(clean.stderr).toBe("");
  expect(readFileSync(cleanLog, "utf8")).toContain("-p tsconfig.tests-dom.json");

  const biteLog = join(scratch, "preamble-bite.log");
  const bite = runHook({ ...base, file, log: biteLog, mode: "plan-preamble-diagnostic" });
  expect(bite.status).toBe(2);
  expect(bite.stderr).not.toContain("planner returned malformed output");
  expect(bite.stderr).toContain("tests/client/subject.dom.test.ts(3,9): error TS2322");
  expect(readFileSync(biteLog, "utf8")).toContain("-p tsconfig.tests-dom.json");

  const noiseLog = join(scratch, "preamble-noise.log");
  const noise = runHook({ ...base, file, log: noiseLog, mode: "plan-preamble-only" });
  expect(noise.status).toBe(2);
  expect(noise.stderr).toContain("checks without a verdict");
  expect(noise.stderr).toContain("typecheck planner printed no JSON payload");
  expect(noise.stderr).toContain("Done in 1.6s using pnpm v11.15.1");
  expect(readFileSync(noiseLog, "utf8")).not.toContain("ts7.cjs");

  const packageFile = join(checkout.worktree, "packages/client/src/source.ts");
  mkdirSync(join(checkout.worktree, "packages/client/src"), { recursive: true });
  writeFileSync(packageFile, "export {};\n");

  const depBite = runHook({ ...base, file: packageFile, log: join(scratch, "preamble-dep-bite.log"), mode: "dep-preamble-actionable" });
  expect(depBite.status).toBe(2);
  expect(depBite.stderr).not.toContain("dep-cruiser returned malformed or empty JSON");
  expect(depBite.stderr).toContain("dep-cruiser (imports)");
  expect(depBite.stderr).toContain("client-cake");

  const depClean = runHook({ ...base, file: packageFile, log: join(scratch, "preamble-dep-clean.log"), mode: "dep-preamble-clean" });
  expect(depClean.status).toBe(0);
  expect(depClean.stderr).toBe("");

  // biome's concise reporter puts its DIAGNOSTICS on stderr and its counters on stdout, which is the
  // stream pnpm's own reporting shares. The lint block therefore carries the diagnostic and none of the
  // wrapper's chatter.
  const lint = runHook({ ...base, file, log: join(scratch, "preamble-biome.log"), mode: "biome-preamble-finding" });
  expect(lint.status).toBe(2);
  expect(lint.stderr).toContain("biome (lint)");
  expect(lint.stderr).toContain("lint/suspicious/noDoubleEquals");
  expect(lint.stderr).not.toContain("Done in 1.6s using pnpm v11.15.1");
  expect(lint.stderr).not.toContain("Scope: all 9 workspace projects");

  // The other direction of the same assumption: a reporter that moves the diagnostics to stdout must be
  // a NAMED non-verdict, never an empty lint block that reads like a clean file.
  const moved = runHook({ ...base, file, log: join(scratch, "biome-stdout.log"), mode: "biome-stdout-diagnostic" });
  expect(moved.status).toBe(2);
  expect(moved.stderr).toContain("its reporter contract changed");
  expect(moved.stderr).not.toContain("biome (lint)");
});

test("type diagnostics from unchanged consumers in the selected program are shown", ({ scratch, repoRoot }) => {
  const checkout = plantCheckout(scratch);
  const bin = join(scratch, "stub bin");
  const log = join(scratch, "pnpm.log");
  stubPnpm(bin);
  const result = runHook({
    hook: join(repoRoot, ".claude/hooks/biome-check.sh"),
    project: checkout.main,
    cwd: checkout.worktree,
    file: join(checkout.worktree, "tests/client/subject.dom.test.ts"),
    bin,
    log,
    runtime: join(scratch, "runtime"),
    mode: "consumer-diagnostic",
  });
  expect(result.status).toBe(2);
  expect(result.stderr).toContain("full selected-program diagnostics");
  expect(result.stderr).toContain("tests/client/unchanged-consumer.ts(7,3): error TS2322");
});
