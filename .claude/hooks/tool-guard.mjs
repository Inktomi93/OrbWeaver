#!/usr/bin/env node
// PreToolUse guard for Bash — catches command shapes that silently destroy signal.
//
// WHY THIS EXISTS (measured, not guessed — `docs/reviews/misc/2026-08-03-tool-use-antipattern-census.md`):
// 87.3% of harness invocations across 133,631 Bash calls were piped into a swallower. `pnpm check` piped
// runs a median 64.1s vs 2.3s unpiped (28x); `pnpm verify`/`pnpm test` piped cluster at the 120s tool
// timeout. ~2,743 minutes of EXCESS wall-clock. Two failure modes from one habit:
//   1. EXIT CODE — a pipeline's status is the LAST stage's, so `pnpm check | tail` reports tail's 0 even
//      when check failed. A run was reported to the owner as green while it was red.
//   2. HANG — tail/head/grep read until EOF; our harness spawns descendants (playwright, vite, the stack
//      daemons, vitest workers) that INHERIT the pipe's write end, so EOF never arrives and the call sits
//      long after the work finished. Commands that DON'T fork (check:docs, typecheck) show no inflation —
//      that contrast is the proof of mechanism.
//
// DESIGN: precision over coverage. A hook that cries wolf gets disabled, and then we have nothing.
//   · QUOTE-AWARE — quoted spans are blanked before matching, so `git commit -m "fix pnpm check pipe"`
//     does NOT fire. This is the owner's own false-positive case and it is a test row below.
//   · PIPELINE-AWARE — only a HARNESS stage feeding a SWALLOWER stage bites. `git log | head` is fine.
//   · SANCTIONED FORMS PASS — the lane CT recipe (`rm -rf playwright/.cache && npx playwright test -c …`)
//     is the CORRECT command; flagging it would train agents to ignore the hook.
//
// Usage:
//   echo '<hook json>' | tool-guard.mjs      real mode (PreToolUse contract on stdin)
//   tool-guard.mjs --test                    run the corpus, print bite/pass table, exit 1 on mismatch

/** Blank out quoted spans so text INSIDE a string literal can never match a rule. */
function blankQuoted(cmd) {
  let out = "";
  let quote = null;
  for (let i = 0; i < cmd.length; i += 1) {
    const ch = cmd[i];
    if (quote === null && (ch === '"' || ch === "'")) {
      quote = ch;
      out += " ";
    } else if (quote !== null && ch === quote && cmd[i - 1] !== "\\") {
      quote = null;
      out += " ";
    } else {
      out += quote === null ? ch : " ";
    }
  }
  return out;
}

/** Split a command line into pipeline stages, ignoring `||`. Returns stages of each pipeline. */
function pipelines(cmd) {
  // split on && ; and newlines first — each clause has its own pipeline
  const clauses = cmd.split(/&&|\|\||;|\n/g);
  return clauses.map((c) => c.split(/(?<!\|)\|(?!\|)/g).map((s) => s.trim()));
}

// A harness command whose exit code and artifacts matter, and which spawns forking descendants.
const HARNESS = /\bpnpm\s+(run\s+)?(check|verify|test|lint|typecheck|e2e|gate|snap|ast)\b|\bpnpm\s+(check|verify|test|e2e|typecheck):/;
// Readers that terminate a pipeline and replace its exit status.
const SWALLOWER = /^(tail|head|grep|rg|wc|less|more|sort|uniq|cut|awk|sed)\b/;

const RULES = [
  {
    id: "harness-piped",
    decision: "deny",
    test: (clean) =>
      pipelines(clean).some(
        (stages) =>
          stages.length > 1 &&
          stages.some((s) => HARNESS.test(s)) &&
          stages.slice(1).some((s) => SWALLOWER.test(s)),
      ),
    reason:
      "A pipeline's exit code is the LAST stage's, so this reports tail/grep's status, not the harness's — a run was reported green while it was red. It also HANGS: the reader waits for an EOF that never comes because playwright/vite/stack descendants inherit the pipe (measured: 64s piped vs 2.3s unpiped). Redirect instead: `<cmd> > reports/run.log 2>&1` then read the log and `reports/verify.json`.",
  },
  {
    id: "harness-status-swallowed",
    decision: "deny",
    test: (clean) => /(?:pnpm\s+(?:run\s+)?(?:check|verify|test|lint|typecheck|e2e))[^\n;]*?(\|\|\s*(true|echo|:)|;\s*true\b)/.test(clean),
    reason:
      "`|| true` / `; true` after a harness command discards the failure — the run can fail and the tool reports success. Let it exit non-zero and read `reports/verify.json`.",
  },
  {
    id: "cd-into-worktree",
    decision: "deny",
    test: (clean) => /\bcd\s+[^\s;&|]*\.claude\/worktrees\//.test(clean),
    reason:
      "The Bash cwd PERSISTS across calls, so one `cd` into a worktree silently relocates every LATER command — this landed a main-only commit on a lane branch mid-sweep. Use `git -C <absolute-path>` instead; it needs no cd.",
  },
  {
    id: "destructive-git-restore",
    decision: "deny",
    test: (clean) => /\bgit\s+(stash|restore)\b|\bgit\s+checkout\s+(--\s+|\S*\.(ts|tsx|md|json)\b)/.test(clean),
    reason:
      "`git stash`/`restore`/`checkout <path>` silently destroy uncommitted work, and this tree usually carries a large uncommitted surface. To read an old version use `git show HEAD:<path>`; to undo a probe, `rm` the throwaway file.",
  },
  {
    id: "biome-write-all",
    decision: "deny",
    test: (clean) => /\bbiome\s+(check[^\n;|&]*--(write|fix)|format)\b/.test(clean),
    reason:
      "`biome check --write` / `format` applies INFO-level autofixes that have changed behavior and crashed the server (the /u unicode-regex wave took down boot). Fix only ERROR-level diagnostics, scoped to named files.",
  },
  {
    id: "sg-not-ast-grep",
    decision: "warn",
    test: (clean) => /(^|[\s;&|(])sg\s+(run|scan|outline|test)\b/.test(clean),
    reason:
      "Use `ast-grep`, not `sg`. It resolves here, but `sg` is `newgrp` on most Debian/Ubuntu boxes and the alias is one environment away from silently searching nothing — we standardize on the explicit binary so a command is portable and unambiguous.",
  },
  {
    id: "bare-vitest",
    decision: "warn",
    test: (clean) => /\bnpx\s+vitest\b|(?<!pnpm\s)(?<!\.bin\/)\bvitest\s+run\b/.test(clean),
    reason:
      "A bare vitest run drops the json reporter, so `reports/test-report.json` is never written and the failure list is lost. Prefer `pnpm test` (or `pnpm vitest run <paths>` for a scoped lane run).",
  },
  {
    id: "grep-r-unscoped",
    decision: "warn",
    test: (clean) =>
      /\bgrep\s+(-[a-zA-Z]*r[a-zA-Z]*\s|\S*\s+-r\b)/.test(clean) &&
      !/--exclude-dir/.test(clean) &&
      /\bgrep[^\n;|&]*\s(\.|\.\/|packages\/?|tests\/?|src\/?)\s*$/.test(clean),
    reason:
      "`grep -r` does not respect ignore files and every package has its own node_modules — pass `--exclude-dir=node_modules`. (Today it happens to be symlinks the walker won't follow, so a count can be right by ACCIDENT of the store layout.)",
  },
];

export function classify(command) {
  const clean = blankQuoted(command);
  for (const rule of RULES) {
    if (rule.test(clean)) {
      return { decision: rule.decision, rule: rule.id, reason: rule.reason };
    }
  }
  return { decision: "defer", rule: null, reason: null };
}

// ── test corpus ────────────────────────────────────────────────────────────────────────────────────
// MUST-BITE: the shapes measured in the census. MUST-PASS: legitimate commands, incl. every
// false-positive trap we could think of. A rule that fails a MUST-PASS is worse than no rule.
const CASES = [
  // ---- MUST BITE ----
  ["deny", "pnpm check | tail -30"],
  ["deny", "pnpm verify --push 2>&1 | tail -40"],
  ["deny", "pnpm test | head -20"],
  ["deny", 'pnpm check 2>&1 | grep -E "✗|FAIL"'],
  ["deny", "pnpm check | wc -l"],
  ["deny", "cd /home/x/.claude/worktrees/agent-abc && git status --short"],
  ["deny", "git stash"],
  ["deny", "git restore packages/client/src/app.tsx"],
  ["deny", "git checkout -- packages/server/src/index.ts"],
  ["deny", "biome check --write ."],
  ["deny", "pnpm check || true"],
  ["deny", "pnpm typecheck | tail -5"],
  ["warn", "npx vitest run tests/client/x.test.ts"],
  ["warn", "sg run -p 'useMemo($$$A)' -l tsx packages/client/src"],

  // ---- MUST PASS (legitimate) ----
  ["defer", 'git commit -m "fix the pnpm check pipe that ate our exit code"'],
  ["defer", 'git commit -m "docs(board): pnpm verify --push 17/17 green" -- docs'],
  ["defer", 'echo "never run pnpm check | tail"'],
  ["defer", "git log --oneline -20 | head -5"],
  ["defer", "ls packages | grep client"],
  ["defer", "pnpm check"],
  ["defer", "pnpm check > reports/run.log 2>&1"],
  ["defer", "pnpm verify --push > /tmp/push.log 2>&1"],
  ["defer", "rm -rf playwright/.cache && npx playwright test -c playwright-ct.config.ts tests/client/x.ct.tsx"],
  ["defer", "git show HEAD:packages/server/src/index.ts"],
  ["defer", "/usr/bin/grep -rn --exclude-dir=node_modules 'useMemo' packages/client/src"],
  ["defer", "cat reports/verify.json | python3 -m json.tool"],
  ["defer", "git worktree remove .claude/worktrees/agent-abc"],
  ["defer", "pnpm test:ct"],
  ["defer", "npx tsc -p packages/server --noEmit"],
  ["defer", "ast-grep run -p 'useMemo($$$A)' -l tsx packages/client/src"],
  ["defer", 'git commit -m "use sg run for the sweep"'],
];

if (process.argv.includes("--test")) {
  let fails = 0;
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad("EXPECT", 7)} ${pad("GOT", 7)} ${pad("RULE", 26)} COMMAND`);
  console.log("-".repeat(110));
  for (const [expected, cmd] of CASES) {
    const got = classify(cmd);
    const ok = got.decision === expected;
    if (!ok) {
      fails += 1;
    }
    console.log(
      `${ok ? " " : "✗"}${pad(expected, 6)} ${pad(got.decision, 7)} ${pad(got.rule ?? "-", 26)} ${cmd.slice(0, 60)}`,
    );
  }
  console.log("-".repeat(110));
  console.log(fails === 0 ? `ALL ${CASES.length} CASES PASS` : `${fails} of ${CASES.length} MISMATCHED`);
  process.exit(fails === 0 ? 0 : 1);
}
