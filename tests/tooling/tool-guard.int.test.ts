// The PreToolUse Bash guard's proof (.claude/hooks/tool-guard.mjs) — every rule has MUST-BITE rows and
// MUST-PASS rows, validated here through the hook's REAL entry points (subprocess spawns, never an
// in-process re-implementation): `--classify-batch` for the corpus table, full stdin/stdout hook-contract
// runs for the wire shape, fail-open, the kill switch, the rewrite contract, and the decision log.
// The ruleset itself was tuned against the real 133k-command transcript corpus
// (scripts/probes/guard-replay.mjs); the rows below pin the shapes that corpus surfaced, including the
// owner's own false-positive case (a commit MESSAGE mentioning `pnpm check | tail` must never fire) and
// the heredoc-body leak that once turned a commit message into a `lane-git-push` ask.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.ts";

const HOOK = fileURLToPath(new URL("../../.claude/hooks/tool-guard.mjs", import.meta.url));
const PINNED_NOW = "1700000000000";
// every batch case gets an EMPTY proc root by default so a real `git push` running on this box while the
// suite executes can never leak a push-in-flight context into an unrelated row
const EMPTY_PROC = mkdtempSync(join(tmpdir(), "tg-proc-none-"));
const PW_SANCTIONED_PREFIX = /^rm -rf \/repo\/playwright\/\.cache && npx playwright test -c playwright-ct\.config\.ts/;

interface BatchCase {
  command: string;
  cwd?: string;
  agentId?: string;
  timeout?: number;
  projectDir?: string;
  procRoot?: string;
}

interface BatchResult {
  decision: "deny" | "ask" | "allow" | "defer";
  rule: string | null;
  reason?: string;
  rewrite?: { command: string; timeout?: number; log?: string };
  contexts: string[];
}

// hook payload / env keys are the EXTERNAL wire contract (snake_case, CONSTANT_CASE) — built from pair
// lists so the contract spellings stay data, not identifiers the house naming convention applies to.
function env(pairs: [string, string][] = []): NodeJS.ProcessEnv {
  return Object.fromEntries([["ORB_TOOL_GUARD_NOW_FOR_TEST", PINNED_NOW], ...pairs]);
}

/** checked index access — the graph program runs noUncheckedIndexedAccess */
function at<T>(items: T[], i: number): T {
  const item = items[i];
  if (item === undefined) {
    throw new Error(`missing result ${i}`);
  }
  return item;
}

function runBatch(cases: BatchCase[]): BatchResult[] {
  const r = spawnSync(process.execPath, [HOOK, "--classify-batch"], {
    input: JSON.stringify(cases.map((c) => ({ procRoot: EMPTY_PROC, ...c }))),
    encoding: "utf8",
    env: env(),
  });
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout) as BatchResult[];
}

interface HookRun {
  status: number | null;
  out: {
    hookSpecificOutput?: {
      hookEventName: string;
      permissionDecision: string;
      permissionDecisionReason?: string;
      updatedInput?: { command: string; timeout?: number };
      additionalContext?: string;
    };
  };
}

function runHook(input: unknown, envPairs: [string, string][] = [], rawStdin?: string): HookRun {
  const r = spawnSync(process.execPath, [HOOK], {
    input: rawStdin ?? JSON.stringify(input),
    encoding: "utf8",
    env: env(envPairs),
  });
  return { status: r.status, out: JSON.parse(r.stdout) as HookRun["out"] };
}

function bashInput(command: string, extraPairs: [string, unknown][] = []): Record<string, unknown> {
  return Object.fromEntries([["tool_name", "Bash"], ["tool_input", { command }], ["cwd", "/repo"], ["session_id", "test-session"], ...extraPairs]);
}

// ── the corpus table ──────────────────────────────────────────────────────────────────────────────────
// [expected decision, expected rule (null = clean pass), command, ctx overrides]
// "advisory" = defer + at least one additionalContext line (warn tier).
const LANE = { agentId: "agent-1", cwd: "/x/.claude/worktrees/agent-abc" };
type Row = [BatchResult["decision"] | "advisory", string | null, string, Omit<BatchCase, "command">?];

const ROWS: Row[] = [
  // ---- harness piped: REWRITE the unambiguous shape (the measured 45-hour class) ----
  ["allow", "harness-piped", "pnpm check | tail -30"],
  ["allow", "harness-piped", "pnpm verify --push 2>&1 | tail -40"],
  ["allow", "harness-piped", "pnpm test | head -20"],
  ["allow", "harness-piped", "pnpm check 2>&1 | tail -n 40"],
  ["allow", "harness-piped", 'pnpm check 2>&1 | grep -E "error|FAIL" | sort -u'],
  ["allow", "harness-piped", "pnpm typecheck:graph 2>&1 | grep -c character-card"],
  ["allow", "harness-piped", "pnpm check | wc -l"],
  ["allow", "harness-piped", "timeout 300 pnpm check | wc -l"],
  ["allow", "harness-piped", "FOO=1 pnpm check 2>&1 | tail -20"],
  ["allow", "harness-piped", "cd /home/x/orbweaver && pnpm vitest run tests/server/x.test.ts 2>&1 | tail -8"],
  ["allow", "harness-piped", 'pnpm typecheck 2>&1 | /usr/bin/grep -a -v "^Scope" | head -60; '],
  ["allow", "harness-piped", "pnpm snap / --map 2>&1 | sed -n '1,50p'"],
  ["allow", "harness-piped", "pnpm check 2>&1 | tee /tmp/out.log"],
  // ---- harness piped: DENY the shapes with no single safe rewrite ----
  ["deny", "harness-piped", "pnpm check | tail -3 || echo failed"],
  ["deny", "harness-piped", "npx tsc | head -5; pnpm typecheck:graph 2>&1 | tail -15"],
  ["deny", "harness-piped", 'pnpm lint 2>&1 | tail -4; echo "exit: ${PIPESTATUS[0]}"'],
  ["deny", "harness-piped", "(cd packages/ui && pnpm exec tsc --noEmit 2>&1 | head -10); pnpm test:ct 2>&1 | tail -25"],
  ["deny", "harness-piped", "pnpm test tests/server/x.int.test.ts 2>&1 | tail -25 & sleep 5"],
  // ---- harness failure swallowed ----
  ["deny", "harness-swallowed", "pnpm check || true"],
  ["deny", "harness-swallowed", "pnpm typecheck:graph >/dev/null 2>&1 && echo PASS || echo FAIL"],
  // ---- destructive git ----
  ["deny", "git-destructive", "git stash"],
  ["deny", "git-destructive", "git stash pop"],
  ["deny", "git-destructive", "git stash push -- packages/ui/src/styles/globals.css && pnpm snap /"],
  ["deny", "git-destructive", "git restore packages/client/src/app.tsx"],
  ["deny", "git-destructive", "git restore --staged --worktree packages/client/src/app.tsx"],
  ["deny", "git-destructive", "git checkout -- packages/server/src/index.ts"],
  ["deny", "git-destructive", "git checkout ."],
  ["deny", "git-destructive", "git checkout main -- tests/ui/x.ct.tsx"],
  // read-only forms PASS — a deny here would be a lie about destruction
  ["defer", null, "git stash list 2>/dev/null"],
  ["defer", null, "git restore --staged docs/retro-workboard.md"],
  ["defer", null, "git checkout -b feature/x"],
  ["defer", null, "git checkout main"],
  // ---- biome write-mode: blast radius decides (owner ruling — the tsx-shedding migration is sanctioned) ----
  ["deny", "biome-write", "biome check --write ."],
  ["deny", "biome-write", "pnpm exec biome check --write"],
  ["deny", "biome-write", "npx biome check . --write --unsafe --diagnostic-level=error"],
  ["deny", "biome-write", "pnpm exec biome check . --write --diagnostic-level=error --reporter=concise 2>&1 | tail -60"],
  ["deny", "biome-write", "pnpm lint:fix"],
  ["deny", "biome-write", "biome format --write ."],
  ["advisory", "advisory", "pnpm exec biome check --write --only=correctness/useImportExtensions packages/client/src tests scripts"],
  ["advisory", "advisory", "npx biome check --write packages/ui/src/primitives/button/button.tsx"],
  ["defer", null, "pnpm exec biome check --reporter=concise packages/client/src/x.tsx"],
  ["defer", null, "biome format packages/ui/src/x.ts"],
  // ---- cd into a worktree: main-session DENY; lane = advisory (own-vs-foreign is undecidable) ----
  ["deny", "cd-worktree", "cd /x/.claude/worktrees/agent-abc && git status --short"],
  ["advisory", "advisory", "cd /x/.claude/worktrees/agent-other && git diff", LANE],
  ["defer", null, "cd /x/.claude/worktrees/agent-abc/packages/client", LANE],
  ["defer", null, "git -C /x/.claude/worktrees/agent-abc status --short"],
  ["defer", null, "git worktree remove .claude/worktrees/agent-abc"],
  // ---- playwright CT ----
  ["allow", "playwright-ct", "npx playwright test tests/client/features/chat/composer.ct.tsx"],
  ["allow", "playwright-ct", "npx playwright test -c playwright-ct.config.ts tests/client/x.ct.tsx --reporter=line"],
  ["allow", "playwright-ct", "cd /repo && timeout 400 npx playwright test -c playwright-ct.config.ts tests/client/x.ct.tsx 2>&1 | tail -20"],
  ["allow", "playwright-ct", "rm -rf playwright/.cache && npx playwright test -c playwright-ct.config.ts tests/client/x.ct.tsx 2>&1 | tail -40"],
  ["deny", "playwright-ct", "for i in 1 2 3; do npx playwright test -c playwright-ct.config.ts tests/client/x.ct.tsx; done"],
  ["defer", null, "rm -rf playwright/.cache && npx playwright test -c playwright-ct.config.ts tests/client/x.ct.tsx"],
  ["defer", null, "npx playwright test tests/e2e/login.spec.ts"],
  // ---- push tiers ----
  ["ask", "git-push-force", "git push --force origin main"],
  ["ask", "git-push-force", "git push --force-with-lease origin main"],
  ["ask", "lane-git-push", "git push origin main", LANE],
  ["ask", "lane-git-push", "git -C /x/.claude/worktrees/agent-abc push origin wt-branch", LANE],
  ["defer", null, "git push origin main"],
  ["allow", "longlived-piped", "git push origin main 2>&1 | tail -8"],
  // ---- advisory tier ----
  ["advisory", "advisory", "sg run -p 'useMemo($$$A)' -l tsx packages/client/src"],
  ["advisory", "advisory", "npx vitest run tests/client/x.test.ts"],
  ["advisory", "advisory", '/usr/bin/grep -rn "useMemo" packages/'],
  ["advisory", "advisory", "grep -r useMemo ."],
  ["advisory", "advisory", 'sqlite3 data/orbweaver.db "select count(*) from chats"'],
  ["advisory", "advisory", 'git add -A && git commit -m "x" '],
  ["advisory", "advisory", "git commit --no-verify -m x -- docs"],
  ["advisory", "advisory", "rm -rf packages/client/src/features/old-thing"],
  // ---- MUST-PASS: the false-positive traps ----
  ["defer", null, 'git commit -m "fix the pnpm check pipe that ate our exit code"'],
  ["defer", null, 'git commit -m "docs(board): pnpm verify --push 17/17 green" -- docs'],
  ["defer", null, 'echo "never run pnpm check | tail"'],
  ["defer", null, "git commit -F - <<'EOF'\nfix(settings): push-detail narrow arm\n\nbody mentions pnpm check | tail and git stash\nEOF", LANE],
  ["defer", null, "python3 - <<'PY'\ns = 'pnpm check | tail -40'\nprint(s)\nPY\necho done"],
  ["defer", null, "git log --oneline -20 | head -5"],
  ["defer", null, "ls packages | grep client"],
  ["defer", null, "cat reports/verify.json | python3 -m json.tool"],
  ["defer", null, "pnpm check"],
  ["defer", null, "pnpm check > reports/run.log 2>&1"],
  ["defer", null, "pnpm verify --push > /tmp/push.log 2>&1"],
  ["defer", null, "pnpm test:ct"],
  ["defer", null, "pnpm vitest run tests/tooling/tool-guard.int.test.ts"],
  ["defer", null, "pnpm ast refs resolveChat | head -20"],
  ["defer", null, "npx tsc -p packages/server --noEmit"],
  ["defer", null, "ast-grep run -p 'useMemo($$$A)' -l tsx packages/client/src"],
  ["defer", null, 'git commit -m "use sg run for the sweep"'],
  ["defer", null, "git show HEAD:packages/server/src/index.ts"],
  ["defer", null, '/usr/bin/grep -rn --exclude-dir=node_modules "useMemo" packages/client/src'],
  ["defer", null, 'grep -rn "useMemo" packages/client/src/features/chat/use-send.ts'],
  ["defer", null, "sqlite3 /tmp/probe-test.db 'select 1'"],
  ["defer", null, "rm -rf playwright/.cache"],
  ["defer", null, "rm -rf node_modules/.cache/hook-pool"],
  ["defer", "self-exempt", "node .claude/hooks/tool-guard.mjs --classify-batch < cases.json"],
  ["defer", "self-exempt", "node scripts/probes/guard-replay.mjs --out reports/guard-replay.json"],
];

test("corpus: every rule bites its measured shapes and passes the false-positive traps", () => {
  const results = runBatch(ROWS.map(([, , command, ctx]) => ({ command, ...ctx })));
  const failures: string[] = [];
  ROWS.forEach(([expected, rule, command], i) => {
    const got = at(results, i);
    const decisionOk = expected === "advisory" ? got.decision === "defer" && got.contexts.length > 0 : got.decision === expected;
    const ruleOk = rule === null ? got.rule === null : got.rule === rule;
    // a clean pass must also be SILENT (no advisory noise) — crying wolf is the failure mode
    const silentOk = expected !== "defer" || rule !== null || got.contexts.length === 0;
    if (!(decisionOk && ruleOk && silentOk)) {
      failures.push(`[${i}] want ${expected}/${rule} got ${got.decision}/${got.rule} ctx=${got.contexts.length} :: ${command.slice(0, 80)}`);
    }
  });
  expect(failures).toEqual([]);
});

test("rewrite: the piped-harness rewrite preserves the reader chain, the log target, and the exit code", () => {
  const r = at(runBatch([{ command: "pnpm check 2>&1 | tail -40" }]), 0);
  expect(r.decision).toBe("allow");
  const log = `/repo/reports/tool-guard/run-${PINNED_NOW}.log`;
  const expected = `pnpm check > ${log} 2>&1; __tg_ec=$?; < ${log} tail -40; ( exit $__tg_ec )`;
  expect(r.rewrite?.command).toBe(expected);
  expect(r.rewrite?.timeout).toBe(600_000); // verify/check legitimately outrun the 120s default
  // an agent-chosen timeout is never overridden
  const withTimeout = at(runBatch([{ command: "pnpm check 2>&1 | tail -40", timeout: 120_000 }]), 0);
  expect(withTimeout.rewrite?.timeout).toBeUndefined();
  // the rewritten command must not re-fire the guard (no rewrite loops)
  const again = at(runBatch([{ command: expected }]), 0);
  expect(again.decision).toBe("defer");
  expect(again.rule).toBeNull();
});

test("rewrite: the emitted template really preserves the harness exit code through the reader chain", () => {
  // Same template the guard emits, with a stand-in for the harness stage (running the real harness here
  // would be a load bomb): red run → reader still sees output, final exit code is the harness's 3.
  const tmp = mkdtempSync(join(tmpdir(), "tg-template-"));
  const log = join(tmp, "run.log");
  const cmd = `fake_harness() { echo ok; echo bad >&2; return 3; }; fake_harness > ${log} 2>&1; __tg_ec=$?; < ${log} tail -40; ( exit $__tg_ec )`;
  const r = spawnSync("bash", ["-c", cmd], { encoding: "utf8" });
  expect(r.stdout).toContain("ok");
  expect(r.stdout).toContain("bad"); // stderr was merged into the log, so the reader surfaces it
  expect(r.status).toBe(3);
});

test("rewrite: the playwright CT rewrite injects the sanctioned prefix with absolute paths", () => {
  const r = at(runBatch([{ command: "npx playwright test tests/client/x.ct.tsx --reporter=line" }]), 0);
  expect(r.decision).toBe("allow");
  expect(r.rewrite?.command).toBe(
    "rm -rf /repo/playwright/.cache && npx playwright test -c /repo/playwright-ct.config.ts tests/client/x.ct.tsx --reporter=line",
  );
  // config present + piped + cache missing → cache-clear AND pipe fix compose
  const piped = at(runBatch([{ command: "npx playwright test -c playwright-ct.config.ts tests/client/x.ct.tsx 2>&1 | tail -20" }]), 0);
  expect(piped.decision).toBe("allow");
  expect(piped.rewrite?.command).toMatch(PW_SANCTIONED_PREFIX);
  expect(piped.rewrite?.command).toContain("< /repo/reports/tool-guard/run-");
});

test("push-in-flight: a live `git push` process turns a commit into a warn (never a block)", () => {
  const procRoot = mkdtempSync(join(tmpdir(), "tg-proc-"));
  mkdirSync(join(procRoot, "999999"));
  writeFileSync(join(procRoot, "999999", "cmdline"), "git\u0000push\u0000origin\u0000main");
  const results = runBatch([
    { command: 'git commit -m "x" -- docs', procRoot },
    { command: 'git commit -m "x" -- docs', procRoot: mkdtempSync(join(tmpdir(), "tg-proc-empty-")) },
  ]);
  const withPush = at(results, 0);
  const withoutPush = at(results, 1);
  expect(withPush.decision).toBe("defer");
  expect(withPush.contexts.join("\n")).toContain("git push");
  expect(withoutPush.contexts).toEqual([]);
});

// ── the hook contract (real stdin/stdout wire shape) ──────────────────────────────────────────────────

test("contract: deny emits the PreToolUse wire shape with the teaching reason", () => {
  const tmp = mkdtempSync(join(tmpdir(), "tg-hook-"));
  const { status, out } = runHook(bashInput("git stash"), [["CLAUDE_PROJECT_DIR", tmp]]);
  expect(status).toBe(0);
  const h = out.hookSpecificOutput;
  expect(h?.hookEventName).toBe("PreToolUse");
  expect(h?.permissionDecision).toBe("deny");
  expect(h?.permissionDecisionReason).toContain("git show HEAD:");
});

test("contract: a rewrite emits updatedInput, creates the log dir, and logs the decision", () => {
  const tmp = mkdtempSync(join(tmpdir(), "tg-hook-"));
  const { out } = runHook(bashInput("pnpm check 2>&1 | tail -40"), [["CLAUDE_PROJECT_DIR", tmp]]);
  const h = out.hookSpecificOutput;
  expect(h?.permissionDecision).toBe("allow");
  const log = `${tmp}/reports/tool-guard/run-${PINNED_NOW}.log`;
  expect(h?.updatedInput?.command).toBe(`pnpm check > ${log} 2>&1; __tg_ec=$?; < ${log} tail -40; ( exit $__tg_ec )`);
  expect(h?.updatedInput?.timeout).toBe(600_000);
  expect(h?.additionalContext).toContain("tool-guard rewrote this command");
  expect(existsSync(`${tmp}/reports/tool-guard`)).toBe(true); // the redirect target's dir exists before the shell needs it
  const decisions = readFileSync(`${tmp}/reports/tool-guard/decisions.jsonl`, "utf8").trim().split("\n");
  const logged = JSON.parse(decisions.slice(-1).join("")) as { decision: string; rule: string; ms: number; rewrittenTo?: string };
  expect(logged.decision).toBe("allow");
  expect(logged.rule).toBe("harness-piped");
  expect(logged.ms).toBeGreaterThanOrEqual(0);
  expect(logged.rewrittenTo).toContain("pnpm check >");
});

test("contract: warn tier defers with additionalContext; clean commands defer silently", () => {
  const tmp = mkdtempSync(join(tmpdir(), "tg-hook-"));
  const warn = runHook(bashInput("npx vitest run tests/client/x.test.ts"), [["CLAUDE_PROJECT_DIR", tmp]]);
  expect(warn.out.hookSpecificOutput?.permissionDecision).toBe("defer");
  expect(warn.out.hookSpecificOutput?.additionalContext).toContain("pnpm vitest run");
  const clean = runHook(bashInput("git status --short"), [["CLAUDE_PROJECT_DIR", tmp]]);
  expect(clean.out.hookSpecificOutput?.permissionDecision).toBe("defer");
  expect(clean.out.hookSpecificOutput?.additionalContext).toBeUndefined();
});

test("contract: the lane push ask carries agent identity from the hook payload", () => {
  const tmp = mkdtempSync(join(tmpdir(), "tg-hook-"));
  const lane = runHook(
    bashInput("git push origin main", [
      ["agent_id", "agent-123"],
      ["agent_type", "executor"],
    ]),
    [["CLAUDE_PROJECT_DIR", tmp]],
  );
  expect(lane.out.hookSpecificOutput?.permissionDecision).toBe("ask");
  const main = runHook(bashInput("git push origin main"), [["CLAUDE_PROJECT_DIR", tmp]]);
  expect(main.out.hookSpecificOutput?.permissionDecision).toBe("defer");
});

test("fail-open: garbage stdin, a non-Bash tool, and an internal crash all defer with exit 0", () => {
  const tmp = mkdtempSync(join(tmpdir(), "tg-hook-"));
  const garbage = runHook(null, [["CLAUDE_PROJECT_DIR", tmp]], "this is not json{{{");
  expect(garbage.status).toBe(0);
  expect(garbage.out.hookSpecificOutput?.permissionDecision).toBe("defer");
  const nonBash = runHook(
    Object.fromEntries([
      ["tool_name", "Edit"],
      ["tool_input", { command: "n/a" }],
    ]),
    [["CLAUDE_PROJECT_DIR", tmp]],
  );
  expect(nonBash.out.hookSpecificOutput?.permissionDecision).toBe("defer");
  // a deny-worthy command + a forced internal throw MUST fail open — a broken guard never blocks work
  const crashed = runHook(bashInput("git stash"), [
    ["CLAUDE_PROJECT_DIR", tmp],
    ["ORB_TOOL_GUARD_CRASH_FOR_TEST", "1"],
  ]);
  expect(crashed.status).toBe(0);
  expect(crashed.out.hookSpecificOutput?.permissionDecision).toBe("defer");
});

test("kill switch: ORB_TOOL_GUARD=off bypasses every rule and logs the bypass", () => {
  const tmp = mkdtempSync(join(tmpdir(), "tg-hook-"));
  const { out } = runHook(bashInput("git stash"), [
    ["CLAUDE_PROJECT_DIR", tmp],
    ["ORB_TOOL_GUARD", "off"],
  ]);
  expect(out.hookSpecificOutput?.permissionDecision).toBe("defer");
  const logged = JSON.parse(readFileSync(`${tmp}/reports/tool-guard/decisions.jsonl`, "utf8").trim().split("\n").slice(-1).join("")) as { rule: string };
  expect(logged.rule).toBe("kill-switch");
});
