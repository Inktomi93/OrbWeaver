#!/usr/bin/env node
// PreToolUse guard for Bash — catches command shapes that destroy signal, and REWRITES the ones with
// exactly one correct fix so the agent never even loses the turn.
//
// ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
// │ THIS GUARD SHAPES *HOW* A COMMAND RUNS. IT IS NOT THE GATEKEEPER OF *WHAT* AN AGENT MAY RUN.  │
// │ Owner ruling 2026-08-03: "our issue was never permissions of what an agent can do, we just     │
// │ want them running the right way." Read every decision below through that sentence.            │
// │                                                                                               │
// │ THEREFORE: a command this guard does not object to gets `allow` — not `defer`.                │
// │ `defer` means "no hook decision, fall through to the normal permission flow", and that flow   │
// │ PROMPTS A HUMAN. A subagent has nobody to prompt, so it stops mid-turn, silently, with no      │
// │ report. That is not a hypothetical: it killed NINE lanes on 2026-08-03 before it was believed. │
// │                                                                                               │
// │ THE OLD SYMPTOM, for the record: a lane "completes" after a one-line preamble and 1-4 tool     │
// │ calls at a suspiciously CONSISTENT token count. It reads exactly like a transient API failure. │
// │ The raw tool output said `settings deferred Bash`. Consistency across lanes was the tell —     │
// │ a real transient is ragged. "0 denies, so it isn't the hook" was asserted TWICE and was wrong  │
// │ both times: the guard denied nothing and was still the cause, because defer ≠ allow.          │
// │                                                                                               │
// │ `defer` now survives ONLY where this guard has genuinely not judged the command — the kill     │
// │ switch, an internal error, unparseable stdin, a non-Bash tool. If you are adding a rule and    │
// │ reach for `defer`, you almost certainly want `allow` (with a WARN context) or `deny`.          │
// │ TRIAGE: node -e "const r=require('fs').readFileSync('reports/tool-guard/decisions.jsonl','utf8')\
// │   .trim().split('\n').map(JSON.parse); console.log(r.filter(x=>x.agent&&x.agent!=='main').slice(-10))"│
// └──────────────────────────────────────────────────────────────────────────────────────────────┘
//
// WHY THIS EXISTS (measured, not guessed — docs/reviews/misc/2026-08-03-tool-use-antipattern-census.md,
// mined from 3,138 transcripts / 133,631 Bash calls; 85.7% of them from subagents):
//   · 87.3% of harness invocations (5,319/6,096) were piped into a swallower. `pnpm check` piped runs a
//     median 64.1s vs 2.3s unpiped (28×); `pnpm verify`/`pnpm test` piped cluster at the ~120s Bash-tool
//     timeout ceiling. Excess wall-clock across the corpus: ~2,743 minutes (~45 hours).
//   · Two failure modes from the one habit:
//       1. EXIT CODE — a pipeline reports the LAST stage's status, so `pnpm check | tail` returns tail's
//          0 even when check failed. A red run was reported to the owner as green this way.
//       2. HANG — tail/head/grep read until EOF; the harness spawns descendants (playwright, vite, the
//          stack daemons, vitest workers) that INHERIT the pipe's write end, so EOF never arrives.
//          Commands that don't fork (check:docs, check:structure, typecheck) show NO piped-vs-unpiped
//          inflation — that contrast is the proof of mechanism.
//
// DECISION TIERS (per rule; validated against the full 133,631-command corpus by guard-replay.mjs):
//   REWRITE (allow + updatedInput)  — the fix is unambiguous: run the harness redirected to a log, then
//                                     run the agent's own reader chain against the file with the real
//                                     exit code preserved. Strictly better than deny: no lost turn.
//   DENY                            — needs intent to fix (compound shapes), or doctrine-banned outright.
//   WARN (allow + additionalContext)— merely suboptimal, or too many legitimate uses to block. It RUNS;
//                                     the agent is told why it was suboptimal and learns for next time.
//   ASK                             — only the owner can judge (force-push; a lane touching the remote).
//                                     From a SUBAGENT this is emitted as DENY + the escalation line,
//                                     because an unanswered ask kills the lane exactly like a defer did.
//   PASS                            — allow, with a reason. The overwhelming majority. See the box above.
//
// DESIGN: precision over coverage. A hook that cries wolf gets disabled, and then we have nothing.
//   · QUOTE-AWARE — quoted spans are blanked (same-length) before matching, so
//     `git commit -m "fix the pnpm check pipe"` can never fire. Structure is found on the blanked text;
//     rewrites slice the ORIGINAL text by index, so quoted content survives verbatim. COMMENTS and
//     HEREDOC BODIES are blanked the same way: neither is a command (`ls packages # never git stash`
//     denied as git-destructive until comment blanking landed, 2026-08-14).
//   · PIPELINE-AWARE — only a HARNESS stage feeding a later stage bites. `git log | head` is fine.
//   · THE GUARD NEVER BLOCKS THE SANCTIONED FORM OF A JOB — `rm -rf playwright/.cache && npx playwright
//     test -c playwright-ct.config.ts <paths>` is the CORRECT lane CT recipe and passes untouched, and a
//     path-scoped / `--only=`-scoped `biome check --write` is the CORRECT mechanical-migration form
//     (tsx-shedding spec Stage 1) and is warn-tier, never deny. A rule that catches the right way of
//     doing something teaches agents to route around the hook, and then it protects nothing.
//   · FAIL-OPEN — any internal error, unparseable stdin, or stdin stall emits "defer" and exits 0. The
//     guard breaking must never block work (proven by test).
//   · SELF-EXEMPT — IDENTITY-based and deliberately narrow: a SOLE invocation of this guard, its replay,
//     or the census miner (one clause, one stage, no subshell / substitution / backgrounding) passes
//     without further judgement, because such a command cannot execute its own arguments — so a corpus
//     string sitting in an argv can never be mistaken for a command. Until 2026-08-14 this was an
//     unanchored MENTION of those filenames, tested BEFORE blanking and BEFORE the hard floor, so
//     `git stash # tool-guard.mjs` emitted an explicit `allow` and every rule below was skipped
//     (docs/reviews/repository-audit-2026-08-13/SECURITY-VALIDATION.md §AGENT-TOOLING-01, R5).
//
// OBSERVABILITY: every decision appends one JSONL line to reports/tool-guard/decisions.jsonl (gitignored
// via /reports/) with rule, decision, latency and a command prefix — tune from evidence, not vibes.
//
// KILL SWITCH (emergencies only, greppable): ORB_TOOL_GUARD=off (also "0"/"false") disables all rules —
// the hook logs the bypass and defers. `export ORB_TOOL_GUARD=off` in the session env, or prefix the
// `claude` launch. Re-enable by unsetting.
//
// ENTRY POINTS:
//   echo '<PreToolUse json>' | tool-guard.mjs     real mode (hook contract on stdin, JSON on stdout)
//   tool-guard.mjs --classify-batch               stdin: JSON array of {command, cwd?, agentId?, timeout?}
//                                                 stdout: JSON array of decisions (no side effects) —
//                                                 used by tests/tooling/tool-guard.int.test.ts and
//                                                 scripts/probes/guard-replay.mjs (corpus validation).
//
// TEST SEAMS (env, test-only, self-identifying): ORB_TOOL_GUARD_NOW_FOR_TEST (pins the rewrite-log
// timestamp), ORB_TOOL_GUARD_CRASH_FOR_TEST (forces an internal throw — proves fail-open).

import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

// ── quote blanking (same length in, same length out — indexes into the blank map into the original) ──

export function blankQuoted(cmd) {
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

// ── comment blanking: bash ends a line at an unquoted WORD-INITIAL `#`, so everything after it is text,
//    not commands, and must never be matched (`ls packages # remember: never git stash` was denied as
//    git-destructive before this existed). Runs on the quote-blanked text, BEFORE heredocs — a `<<EOF`
//    inside a comment must not start a heredoc scan. The character before the `#` is checked in the RAW
//    text on purpose: after `echo "x"# ; git stash` the blanked predecessor is a space, but the `#` is
//    part of a word there, and blanking to end-of-line would hide a real destructive clause. ──

export function blankComments(raw, blank) {
  let out = blank;
  for (let i = 0; i < out.length; i += 1) {
    if (out[i] !== "#" || (i > 0 && !/\s/.test(raw[i - 1]))) {
      continue;
    }
    const lineEnd = out.indexOf("\n", i);
    const stop = lineEnd === -1 ? out.length : lineEnd;
    out = out.slice(0, i) + " ".repeat(stop - i) + out.slice(stop);
    i = stop;
  }
  return out;
}

// ── heredoc blanking: a `<<DELIM` body is TEXT, not commands — without this, a python heredoc whose
//    body mentions `pnpm check | grep` fires the pipe rule (observed in the real corpus). Blanks the
//    operator + delimiter + body (newlines kept, so clause indexes stay honest); the terminator line
//    itself is blanked too. Runs on the already-quote-blanked text, reading delimiters from the raw. ──

// Scanned on the RAW text (a quoted delimiter like <<'EOF' is already spaces in the blanked text, which
// once made the scanner mistake the first body word for the delimiter — a real corpus commit message
// then leaked its body into rule matching). An operator that is itself inside a quoted span (blanked
// at that index) is skipped — that `<<` is string content, not a heredoc.
const HEREDOC_OPERATOR = /<<-?\s*(['"]?)(\w+)\1/g;

export function blankHeredocs(raw, blank) {
  let out = blank;
  HEREDOC_OPERATOR.lastIndex = 0;
  for (let m = HEREDOC_OPERATOR.exec(raw); m !== null; m = HEREDOC_OPERATOR.exec(raw)) {
    if (out[m.index] !== "<") {
      continue; // the operator is inside a quoted span — string content, not a heredoc
    }
    const delim = m[2];
    const bodyStart = raw.indexOf("\n", m.index + m[0].length);
    if (bodyStart === -1) {
      break;
    }
    // find the terminator line (allowing leading tabs for <<-)
    let end = raw.length;
    for (let lineStart = bodyStart + 1; lineStart < raw.length; ) {
      const lineEnd = raw.indexOf("\n", lineStart);
      const stop = lineEnd === -1 ? raw.length : lineEnd;
      if (raw.slice(lineStart, stop).replace(/^\t+/, "") === delim) {
        end = stop;
        break;
      }
      if (lineEnd === -1) {
        break;
      }
      lineStart = lineEnd + 1;
    }
    const blankSpan = (text, from, to) => text.slice(0, from) + text.slice(from, to).replace(/[^\n]/g, " ") + text.slice(to);
    out = blankSpan(out, m.index, m.index + m[0].length); // the operator + delimiter
    out = blankSpan(out, bodyStart, end); // the body + terminator line
    HEREDOC_OPERATOR.lastIndex = end;
  }
  return out;
}

// ── structure scan: clauses (split on && / || / ; / newline) and pipe stages within each clause.
//    Runs on the BLANKED text; returns index ranges so callers can slice the original. ──

export function parseStructure(blank) {
  const clauses = [];
  let clauseStart = 0;
  let stageStart = 0;
  let stages = [];
  const endClause = (end) => {
    stages.push({ start: stageStart, end });
    clauses.push({ start: clauseStart, end, stages });
    stages = [];
  };
  let i = 0;
  while (i < blank.length) {
    const c = blank[i];
    const next = blank[i + 1];
    if ((c === "&" && next === "&") || (c === "|" && next === "|")) {
      endClause(i);
      i += 2;
      clauseStart = i;
      stageStart = i;
    } else if (c === ";" || c === "\n") {
      endClause(i);
      i += 1;
      clauseStart = i;
      stageStart = i;
    } else if (c === "|") {
      stages.push({ start: stageStart, end: i });
      i += 1;
      stageStart = i;
    } else {
      i += 1;
    }
  }
  endClause(blank.length);
  return clauses.filter((cl) => blank.slice(cl.start, cl.end).trim().length > 0);
}

// ── vocab ──

// Harness family with forking descendants (playwright/vite/stack/vitest workers) — the measured hang
// class. `pnpm ast` is deliberately EXCLUDED: it is a pure static tool with no descendants, and the
// census shows non-forkers have no piped inflation (only the exit-code nit — not worth firing on).
// HEAD-anchored: the harness must BE the command at the head of a pipeline stage (env-assignment /
// timeout / nice wrappers allowed). Anchoring is the structural fix for exposed-quote false positives —
// text merely mentioning `pnpm check | tail` mid-command can never fire this.
const WRAP_PREFIX = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:timeout\s+\d+[a-z]?\s+|nice\s+(?:-n\s*\d+\s+)?)*`;
const HARNESS_HEAD = new RegExp(
  `^\\s*${WRAP_PREFIX}(?:(?:pnpm|npm|turbo)\\s+(?:run\\s+)?(?:check|verify|test|lint|typecheck|e2e|gate)(?::[\\w-]+)?\\b|pnpm\\s+(?:exec\\s+)?vitest\\b|pnpm\\s+snap\\b)`,
);
// Readers we know how to re-target at a file (a rewrite's reader chain must be built from these; the
// optional path prefix admits the doctrine's own `/usr/bin/grep` spelling).
const READER = /^\s*(?:\S*\/)?(?:tail|head|grep|egrep|fgrep|rg|wc|cat|tee|sort|uniq|cut|awk|sed|tr|column|less|more|jq)\b/;
// Long-lived-child commands beyond the harness (census: `git push origin main 2>&1 | tail -8` timed out
// at exactly 120s — git's credential/network child holds the pipe open after the visible push finishes).
const LONG_LIVED = /^\s*git\s+(?:push|pull|fetch|clone)\b/;
const STDERR_MERGE_TAIL = /\s*2>&1\s*$/;
const REDIRECT_FD_MERGE = /\d?>>?&\d/g;
// The guard's own validation tooling — matched by RESOLVED PATH SUFFIX (so `.claude/…`, `./.claude/…`,
// `$CLAUDE_PROJECT_DIR/.claude/…` and an absolute worktree path all resolve alike), never by mention.
// A bare basename is deliberately NOT enough: it says nothing about which file would run. The probes are
// `.ts` since the tsx shed (node runs TypeScript directly) — the old `.mjs` spellings in this list named
// files that no longer exist.
const SELF_TOOLS = ["/.claude/hooks/tool-guard.mjs", "/scripts/probes/guard-replay.ts", "/scripts/probes/transcript-census.ts"];
const SELF_ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=\S*$/;
const SELF_NODE_EXEC = /^(?:\S*\/)?node$/;
const SELF_OPERAND = /^[\w./@:+$-]+$/;
// Anything that could run a SECOND command inside the one stage: a subshell/group `()` or backgrounding
// `&` (checked on the blanked text with fd-merges stripped, so a plain `2>&1` still exempts), and command
// substitution — `$(…)` and backticks execute even inside double quotes, which blanking turns to spaces,
// so those two are checked against the RAW text.
const SELF_UNSAFE = /[()&]/;
const WORKTREE_PATH = /\.claude\/worktrees\/([^\s/;&|)]+)/;
const CD_WORKTREE = /\b(?:cd|pushd)\s+[^\s;&|]*\.claude\/worktrees\/([^\s/;&|]+)/;
// stash: read-only subcommands (list/show) destroy nothing and pass; everything else is the ban.
const GIT_STASH = /\bgit\s+stash\b(?:\s+(list|show))?/;
// restore: `--staged` WITHOUT `--worktree`/-W only unstages (index-only) — safe; all else destroys.
const GIT_RESTORE = /\bgit\s+restore\b([^\n;|&]*)/;
const RESTORE_WORKTREE_ARM = /--worktree|(^|\s)-W\b|(^|\s)-[a-zA-Z]*W/;
const RESTORE_STAGED = /--staged|(^|\s)-S\b/;
const GIT_CHECKOUT = /\bgit\s+checkout\s+(.*)/;
const CHECKOUT_PATHISH =
  /(^|\s)(--(\s|$)|\.(\s|$)|\S+\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|md|css|html|sql|sh|yml|yaml|txt|svg|png|lock)\b)/;
const BIOME_WRITE_MODE = /\bbiome\s+(?:check|lint|format)\b[^\n;|&]*--(?:write|fix|apply|unsafe)\b/;
const BIOME_SUBCOMMAND = /\bbiome\s+(?:check|lint|format)\b/;
const BIOME_ONLY_SCOPED = /--only=\S/;
const PNPM_LINT_FIX = /\bpnpm\s+(?:run\s+)?lint:fix\b/;
const HARNESS_OR_TRUE =
  /(?:\b(?:pnpm|npm|turbo)\s+(?:run\s+)?(?:check|verify|test|lint|typecheck|e2e|gate)(?::[\w-]+)?\b|\bpnpm\s+(?:exec\s+)?vitest\b)[^\n;]*\|\|\s*(?:true|echo|:)(?:\s|$)/;
const HARNESS_SEMI_TRUE =
  /(?:\b(?:pnpm|npm|turbo)\s+(?:run\s+)?(?:check|verify|test|lint|typecheck|e2e|gate)(?::[\w-]+)?\b)[^\n;]*;\s*true\s*$/;
const PLAYWRIGHT_TEST = /(?:\bnpx\s+|\bpnpm\s+exec\s+|^\s*|&&\s*)playwright\s+test\b/;
const PLAYWRIGHT_CACHE_CLEAR = /rm\s+-rf\s+(?:\S*\/)?playwright\/\.cache/;
const CT_CONFIG = /playwright-ct\.config\.ts/;
const CT_FILE_HINT = /\.ct\.tsx?\b/;
const SG_AS_AST_GREP = /(?:^|[;&|(]\s*|\s)sg\s+(?:run|scan|outline|test|new|--version|-p\b|--pattern)/;
const VITEST_HEAD = /^\s*(?:npx\s+vitest|vitest|\S*node_modules\/\.bin\/vitest)\b/;
const GREP_HEAD = /^\s*(?:\/usr\/bin\/)?grep\s/;
const GREP_RECURSIVE_FLAG = /\s-[a-zA-Z]*r/i;
const GREP_EXCLUDE_DIR = /--exclude-dir/;
const GREP_BROAD_ROOT = /^(\.|\.\/|packages\/?|tests\/?|src\/?|scripts\/?|\*)$/;
const SQLITE_HEAD = /^\s*sqlite3\b/;
const SQLITE_SAFE_HINT = /\/tmp\/|scratchpad|:memory:|test|\.bak\b/i;
const GIT_NO_VERIFY = /\bgit\s+(?:commit|merge)\b[^\n;|&]*--no-verify\b/;
const GIT_COMMIT_OR_MERGE = /\bgit\s+(?:[^\s;|&]+\s+)*?(?:commit|merge)\b/;
const PROC_GIT_PUSH = /(^|\0)git\0([^\0]*\0)*push(\0|$)/;
const GIT_ADD_ALL = /\bgit\s+add\s+(?:-A\b|--all\b|\.(?:\s|$))/;
const GIT_PUSH = /\bgit\s+(?:[^\s;|&]+\s+)*?push\b/;
const GIT_PUSH_FORCE = /\bgit\s+push\b[^\n;|]*(?:\s--force(?:-with-lease)?\b|\s-f\b)/;
const RM_RF_HEAD = /^\s*rm\s+(?:-[a-z]*[rf][a-z]*\s+)+/;
// `.claude/worktrees/` added 2026-08-13: lane worktrees are disposable by construction and the standing
// law now requires sweeping them by hand (teardown does not fire on agent completion — probed live). Asking
// about every sweep spent lane turns for nothing. Scoped to `worktrees/` ONLY — the rest of `.claude/`
// (settings, hooks, agents) is load-bearing and stays ask-tier.
const RM_SAFE_TARGET = /\/tmp\/|scratchpad|playwright\/\.cache|node_modules|reports\/|\.claude\/worktrees\/|\bdist\b|\bcoverage\b|\.cache\b|\.bak\b/;
// `$VAR` is safe (the rewrite copies text verbatim, the shell expands identically); `$(`/backticks/
// parens/bare-& are not (subshells, grouping, backgrounding). fd-merges (2>&1) are stripped first.
const UNSAFE_STAGE0 = /[<>()`&]/;
const UNSAFE_READER = /[<()`&]/;
const ENV_KILL = /^(?:off|0|false)$/i;

const REWRITE_TIMEOUT_MS = 600_000;
const CMD_LOG_MAX = 240;
const STDIN_DEADLINE_MS = 2_500;

// ── teaching text (the entire user-visible surface of this hook — mechanism + number + exact fix) ──

const REASONS = {
  harnessPipedDeny:
    "Piping the harness loses its exit code (the pipeline reports tail/grep's status — a red run was reported green this way) AND hangs: playwright/vite/stack/vitest descendants inherit the pipe's write end, so the reader waits for an EOF that never comes (measured: `pnpm check` piped median 64.1s vs 2.3s unpiped, 28×). Run it bare — `pnpm check` — and read the auto-written artifacts: reports/verify.json + reports/verify/<stage>.log.",
  harnessSwallowed:
    "`|| true` (or `; true`) after a harness command erases the failure — the tool reports success even when the gate was red. Let it exit non-zero; the failure list is already in reports/verify.json / reports/test-report.json.",
  gitDestructive:
    "`git stash` / `git restore` / `git checkout <path>` silently destroy uncommitted work, and this tree usually carries a large uncommitted surface (doctrine ban; near-zero legitimate sightings in 133k calls). Read an old version with `git show HEAD:<path>`; undo a probe by `rm`-ing the throwaway file; protect a risky edit with `cp <f> <f>.bak` first.",
  biomeWrite:
    "A whole-tree biome fix-all (`--write` with no explicit paths, or `.`; `pnpm lint:fix`) applies EVERY autofix including INFO-level ones that change behavior — the `/u` unicode-regex wave crashed server boot (doctrine ban). Scope it: name the paths and/or a single rule (`biome check --write --only=<rule> <paths>`), or fix ERROR-level diagnostics by hand.",
  cdWorktree:
    "The Bash cwd PERSISTS across calls — one `cd` into a lane worktree silently relocates every later command (this landed a main-session commit on a lane branch; 3,064 sightings in the corpus). Use `git -C /abs/path/to/worktree <cmd>` — no cd needed.",
  playwrightCt:
    "CT runs need the sanctioned prefix: `rm -rf playwright/.cache && npx playwright test -c playwright-ct.config.ts <paths>`. A stale playwright/.cache replays errors that stopped existing ('Identifier already declared'), and a missing `-c playwright-ct.config.ts` runs the wrong project — 85% of historical CT invocations skipped the cache clear.",
  pushForce:
    "Force-push rewrites shared history on the integration trunk — that is an owner call (6 sightings in 133,631 calls, none routine). State why, or use a plain push.",
  lanePush:
    "Standing law: a lane never pushes. Commit on your branch and report — the orchestrator merges, and each push to origin gets an explicit owner word (pushes are outward-facing and hard to walk back). If this push was explicitly ordered, confirm it here.",
  ownerWordPush:
    "Every push to origin needs a FRESH explicit owner word — not a banked one, not a green battery, not 'it was approved yesterday'. Pushing is outward-facing and hard to walk back. Confirm here only if the owner just gave the word for THIS push.",
  sudo: "Root changes this box outside the repo, and nothing here needs it — the toolchain, the tests, the stack and the engines all run unprivileged. If a package genuinely needs installing, say so and let the owner run it. Confirm here only if he just asked for this.",
  netPipeShell:
    "Piping a network fetch straight into a shell executes whatever that URL serves right now, unreviewed — there is no legitimate instance of this shape in the 133k-command corpus this guard was tuned against. Download it, READ it, then run it.",
  rmRfUnsafe:
    "`rm -rf` on a target that is not scratch (/tmp, scratchpad, node_modules, reports/, .claude/worktrees/, dist, coverage, .cache, *.bak, playwright/.cache). This used to reach the permission layer on its way past; it no longer does, so it stops here. Re-read the path — if it is right, confirm.",
  sqliteLive:
    "Never run bare `sqlite3` against the LIVE db — a stray write or a held lock corrupts the running stack's state, and WAL makes the damage non-obvious. Probe a COPY, or use `/api/_debug/*`. If this really is a scratch/:memory: db, confirm.",
};

const CONTEXTS = {
  rewritePiped: (log) =>
    `tool-guard rewrote this command: piping the harness hangs (forked descendants hold the pipe's write end — measured 28×–55× wall-clock inflation, census 2026-08-03) and swallows its exit code. The harness now writes ${log}, your reader chain ran against that file, and the harness's REAL exit code is preserved. Full artifacts: reports/verify.json + reports/verify/<stage>.log (pnpm check) / reports/test-report.json (pnpm test).`,
  rewriteLongLived: (log) =>
    `tool-guard rewrote this command: git spawns credential/network children that hold a pipe open after the visible command finishes (census: \`git push … | tail\` hit the 120s tool timeout). Output went to ${log}, your reader ran against the file, and the real exit code is preserved.`,
  rewritePlaywright:
    "tool-guard prepended the sanctioned CT prefix (`rm -rf playwright/.cache && npx playwright test -c playwright-ct.config.ts …`): a stale CT cache replays errors that no longer exist, and 85% of historical CT runs skipped the clear.",
  sgDeprecated:
    "Use `ast-grep`. `sg` is deprecated upstream (the tool itself warns on --version), and /usr/bin/sg on this machine is a symlink to newgrp — it only resolves to ast-grep because ~/.cargo/bin happens to come first in PATH. Same CLI: `ast-grep run -p '<pattern>' -l ts <paths>` (run both -l ts AND -l tsx).",
  bareVitest:
    "Prefer `pnpm vitest run <paths>` (the sanctioned scoped lane run) or `pnpm test` (writes reports/test-report.json). A bare/npx vitest bypasses the workspace harness and its artifacts.",
  grepUnscoped:
    "`grep -r` from a broad root does NOT respect ignore files and every package has its own node_modules — add `--exclude-dir=node_modules` (and use `/usr/bin/grep -a`; the shell's `grep` is a ugrep wrapper that skips some .ts as binary). Better: the Grep tool, or ast-grep for structure.",
  sqliteLive:
    "sqlite3 against a live-looking DB: touching a WAL database while the stack is up can corrupt it (repo memory: sqlite3-wal-danger). Stop the stack first, or read through the /api/_debug endpoints instead.",
  noVerify:
    "`--no-verify` is legitimate only immediately after a green gate receipt in THIS session. Lanes: prefer `git -c core.hooksPath=/dev/null …` (the sanctioned spelling) so the skip is visible and scoped.",
  gitAddAll:
    "`git add -A` / `git add .` stages everything — including sibling-lane debris and untracked scratch. Repo law is pathspec staging: `git add <paths>` and `git commit -- <paths>`. Check `git status --short` first.",
  rmRf:
    "`rm -rf` outside scratch/cache territory — double-check the target: uncommitted work here is unrecoverable, and git-based undo (stash/restore) is banned.",
  biomeWriteScoped:
    "Scoped `biome --write` — the sanctioned mechanical-migration form. Read the WHOLE diff before committing (INFO-level autofixes have changed behavior here before), and never widen it to the bare tree.",
  pushInFlight:
    "A `git push` is RUNNING on this box right now. The push window is not atomic: with a long pre-push hook, git re-reads the ref at transfer time, so a commit landed mid-window ships silently while the push's own summary line reports the stale range (measured incident, 2026-08-03). Hold this commit until the push returns, or verify afterwards exactly what landed on origin.",
  longLivedPipe:
    "A piped `git push/pull/fetch` can hang to the full 120s tool timeout — git's credential/network child holds the pipe open after the visible command finishes (measured in the census). Drop the pipe, or redirect to a file and read it.",
  playwrightPiped:
    "Piping a playwright run risks the harness hang (browser/ctViteDev descendants inherit the pipe's write end) — prefer `> file 2>&1` then read the file.",
  cdWorktreeLaneCtx:
    "cd pins your cwd to that worktree for every later call, and your cwd can silently reset between calls — prefer absolute paths and `git -C <worktree>` so each command names its own ground.",
};

// ── helpers ──

function stripFdMerges(text) {
  return text.replace(REDIRECT_FD_MERGE, "");
}

function laneName(text) {
  const m = text?.match(WORKTREE_PATH);
  return m ? m[1] : null;
}

/** Is this command a SOLE invocation of one of the guard's own validation tools (SELF_TOOLS)? Exempting
 *  one is safe for exactly one reason: such a command cannot execute anything but that tool, so a
 *  destructive-looking string in its argv is data, never a command. Every condition below defends that
 *  reason — one clause, one pipeline stage, no subshell / backgrounding / command substitution, an
 *  UNQUOTED `node` (or the tool itself, via its shebang) at the head, and a script operand that resolves
 *  to a SELF_TOOLS path. A mention anywhere else — a trailing comment, a quoted argument, an earlier
 *  `&&` stage — is not an invocation and is judged by every rule (AGENT-TOOLING-01, 2026-08-14). */
export function isSelfToolInvocation(command, blank, clauses) {
  if (clauses.length !== 1) {
    return false;
  }
  const [clause] = clauses;
  if (clause.stages.length !== 1) {
    return false;
  }
  const text = blank.slice(clause.start, clause.end);
  const raw = command.slice(clause.start, clause.end);
  if (SELF_UNSAFE.test(stripFdMerges(text)) || raw.includes("`") || raw.includes("$(")) {
    return false;
  }
  // Tokens are read off the BLANKED text, where a quoted span is spaces — so a quoted word can never be
  // read as the executable or the script (`node 'other.js' .claude/hooks/tool-guard.mjs` runs other.js).
  // The head is then required to be quote-free in the ORIGINAL, which is what makes that hold.
  const tokens = [...text.matchAll(/\S+/g)];
  let i = 0;
  while (tokens[i] !== undefined && SELF_ENV_ASSIGN.test(tokens[i][0])) {
    i += 1;
  }
  const exec = tokens[i];
  if (exec === undefined) {
    return false;
  }
  const operand = SELF_NODE_EXEC.test(exec[0]) ? tokens.slice(i + 1).find((t) => !t[0].startsWith("-")) : exec;
  if (operand === undefined || !SELF_OPERAND.test(operand[0])) {
    return false;
  }
  if (/['"]/.test(command.slice(clause.start, clause.start + operand.index + operand[0].length))) {
    return false;
  }
  const resolved = path.posix.normalize(operand[0]);
  const absolute = resolved.startsWith("/") ? resolved : `/${resolved}`;
  return SELF_TOOLS.some((tool) => absolute.endsWith(tool));
}

/** Best-effort: is a `git push` process live on this box? (Linux /proc scan — a push window is not
 *  atomic when a pre-push hook runs long, and a commit landed mid-window ships silently. Race-prone by
 *  nature — a push starting AFTER this check is invisible — so this only ever feeds a WARN, never a
 *  block. `procRoot` is injectable for tests.) */
export function pushInFlight(procRoot = "/proc") {
  try {
    for (const entry of readdirSync(procRoot)) {
      if (!/^\d+$/.test(entry) || Number(entry) === process.pid) {
        continue;
      }
      try {
        const cmdline = readFileSync(path.join(procRoot, entry, "cmdline"), "utf8");
        if (PROC_GIT_PUSH.test(cmdline)) {
          return true;
        }
      } catch {
        // process vanished mid-scan — fine
      }
    }
  } catch {
    // no /proc (non-Linux) — the warn simply never fires
  }
  return false;
}

/** The star move: `…; <harness> [2>&1] | <readers> [; …]`  →  redirect the harness to a log, run the
 *  agent's own reader chain against the file, preserve the real exit code. Clauses BEFORE and AFTER the
 *  piped one (the ubiquitous `cd <repo> && …` prefix, a trailing `; echo done`) are kept verbatim with
 *  their original separators. Returns null when the shape is not unambiguous (callers deny/warn instead):
 *  `||` chains, more than one piped clause, subshells/backticks/backgrounding in the piped clause, or a
 *  reader outside the known re-targetable set. */
function pipeRewrite(command, blank, clauses, headRe, ctx) {
  // PIPESTATUS anywhere means the command inspects the pipe we are about to remove — bail to deny.
  if (blank.includes("||") || command.includes("PIPESTATUS")) {
    return null;
  }
  const piped = clauses.filter((cl) => cl.stages.length > 1);
  if (piped.length !== 1) {
    return null;
  }
  const [clause] = piped;
  const [stage0, ...readers] = clause.stages;
  const stage0Blank = blank.slice(stage0.start, stage0.end);
  if (!headRe.test(stage0Blank) || UNSAFE_STAGE0.test(stripFdMerges(stage0Blank))) {
    return null;
  }
  for (const r of readers) {
    const rBlank = blank.slice(r.start, r.end);
    if (!READER.test(rBlank) || UNSAFE_READER.test(stripFdMerges(rBlank))) {
      return null;
    }
  }
  const log = `${ctx.projectDir}/reports/tool-guard/run-${ctx.now}.log`;
  const harness = command.slice(stage0.start, stage0.end).replace(STDERR_MERGE_TAIL, "").trim();
  const readerChain = command.slice(readers[0].start, clause.end).trim();
  const prefix = command.slice(0, clause.start);
  const rawSuffix = command.slice(clause.end);
  const suffix = /^[\s;]*$/.test(rawSuffix) ? "" : rawSuffix; // a bare trailing `;` would yield `; ;` — a bash syntax error
  return {
    log,
    command: `${prefix}${harness} > ${log} 2>&1; __tg_ec=$?; < ${log} ${readerChain}${suffix}; ( exit $__tg_ec )`,
  };
}

const PW_CLAUSE_HEAD = /^\s*(timeout\s+\d+[a-z]?\s+)?(?:npx\s+|pnpm\s+exec\s+)?playwright\s+test\b/;

/** Rebuild an unsanctioned CT invocation into the sanctioned recipe (cache clear + explicit CT config,
 *  absolute paths so a `cd` prefix can't misroute them), or null if too complex. Prefix clauses (a
 *  `cd <repo>` etc.) are kept verbatim; the playwright clause must be LAST, unpiped, and shaped exactly
 *  `[timeout N] [npx|pnpm exec] playwright test …` (the timeout wrapper is preserved). */
function playwrightRewrite(command, blank, clauses, ctx) {
  if (blank.includes("||") || PLAYWRIGHT_CACHE_CLEAR.test(blank)) {
    return null;
  }
  const clause = clauses.at(-1);
  if (!clause || clause.stages.length !== 1) {
    return null;
  }
  const text = blank.slice(clause.start, clause.end);
  const head = text.match(PW_CLAUSE_HEAD);
  if (!head || UNSAFE_STAGE0.test(stripFdMerges(text))) {
    return null;
  }
  if (clauses.slice(0, -1).some((cl) => cl.stages.length > 1 || PLAYWRIGHT_TEST.test(blank.slice(cl.start, cl.end)))) {
    return null;
  }
  const original = command.slice(clause.start, clause.end);
  const afterIdx = original.search(/playwright\s+test\b/);
  const args = original
    .slice(afterIdx)
    .replace(/^playwright\s+test\s*/, "")
    .replace(/(?:^|\s)(?:-c|--config)(?:=\S+|\s+\S+)/g, " ")
    .trim();
  const root = ctx.projectDir;
  const prefix = command.slice(0, clause.start);
  const wrapper = head[1] ?? "";
  const joiner = prefix === "" || /\s$/.test(prefix) ? "" : " ";
  return `rm -rf ${root}/playwright/.cache && ${prefix}${joiner}${wrapper}npx playwright test -c ${root}/playwright-ct.config.ts${args ? ` ${args}` : ""}`;
}

// ── warn collectors (defer + additionalContext — visible, never blocking) ──

function collectGrepWarn(command, blank, clauses, contexts) {
  for (const clause of clauses) {
    for (const stage of clause.stages) {
      const text = blank.slice(stage.start, stage.end);
      if (!GREP_HEAD.test(text) || !GREP_RECURSIVE_FLAG.test(text) || GREP_EXCLUDE_DIR.test(text)) {
        continue;
      }
      // tokenize the RAW slice — a quoted pattern must stay a token, or the first path is mistaken for it
      const tokens = command.slice(stage.start, stage.end).trim().split(/\s+/).slice(1);
      const positional = tokens.filter((t) => !t.startsWith("-"));
      // with -e/-f the pattern is a flag argument, so every positional is a path
      const paths = /(^|\s)-[ef]\b/.test(text) ? positional : positional.slice(1);
      if (paths.length === 0 || paths.some((p) => GREP_BROAD_ROOT.test(p))) {
        contexts.push(CONTEXTS.grepUnscoped);
        return;
      }
    }
  }
}

// ── the hard floor ──
// Load-bearing ONLY because the pass-through became `allow` (see the box at the top). A hook `allow`
// bypasses the whole permission system — including the auto-mode CLASSIFIER that is the owner's real
// gate — so shapes that used to reach that classifier now reach nothing. These four are the ones a
// probe found falling through: measured 2026-08-03, `sudo rm -rf /etc` and `curl … | bash` both
// classified as clean passes. This floor puts them back in front of a human.
//
// It is deliberately SMALL. It is not a security model and it cannot become one — a hand-written
// pattern list will always lose to a determined bypass. Its job is to stop an ACCIDENT (a wrong path
// in an rm, a copy-pasted install one-liner), which is the realistic failure here.
const SUDO_HEAD = /^\s*(?:sudo|doas)\b/;
const NET_FETCH_HEAD = /^\s*(?:\S*\/)?(?:curl|wget)\b/;
// shells + `node -e` only. `python3 -c` is a sanctioned everyday tool here and is NOT a sink.
const SHELL_SINK_HEAD = /^\s*(?:\S*\/)?(?:sh|bash|zsh|dash|ksh)\b|^\s*(?:\S*\/)?node\s+-e\b/;

/** @returns {{decision: "deny"|"ask", rule: string, reason: string}|null} */
function detectHardFloor(blank, clauses) {
  for (const clause of clauses) {
    for (let i = 0; i < clause.stages.length; i += 1) {
      const stage = clause.stages[i];
      const text = blank.slice(stage.start, stage.end);
      if (SUDO_HEAD.test(text)) {
        return { decision: "ask", rule: "sudo", reason: REASONS.sudo };
      }
      // a network fetch feeding a shell — no legitimate sighting in a 133k-command corpus
      const next = clause.stages[i + 1];
      if (NET_FETCH_HEAD.test(text) && next !== undefined && SHELL_SINK_HEAD.test(blank.slice(next.start, next.end))) {
        return { decision: "deny", rule: "net-pipe-shell", reason: REASONS.netPipeShell };
      }
    }
  }
  return null;
}

function collectStageWarns(command, blank, clauses, contexts) {
  let vitest = false;
  let sqlite = false;
  let rmrf = false;
  for (const clause of clauses) {
    for (const stage of clause.stages) {
      const text = blank.slice(stage.start, stage.end);
      vitest ||= VITEST_HEAD.test(text);
      if (SQLITE_HEAD.test(text) && !SQLITE_SAFE_HINT.test(command.slice(stage.start, stage.end))) {
        sqlite = true;
      }
      const rm = text.match(RM_RF_HEAD);
      if (rm) {
        const targets = command
          .slice(stage.start + rm[0].length, stage.end)
          .split(/\s+/)
          .filter((t) => t.length > 0 && !t.startsWith("-"));
        if (targets.some((t) => !RM_SAFE_TARGET.test(t))) {
          rmrf = true;
        }
      }
    }
  }
  if (vitest) {
    contexts.push(CONTEXTS.bareVitest);
  }
  if (sqlite) {
    contexts.push(CONTEXTS.sqliteLive);
  }
  if (rmrf) {
    contexts.push(CONTEXTS.rmRf);
  }
  // returned so the caller can ESCALATE: as warns these two were fine while the pass-through was a
  // defer (the permission layer still saw them). Now that pass means allow, a warn would let an
  // unsafe-target `rm -rf` and a bare sqlite3 on the LIVE db run with nothing in front of them.
  return { sqlite, rmrf };
}

// ── the classifier ──

/**
 * @param {string} command  the raw Bash command
 * @param {{cwd?: string, agentId?: string|null, projectDir: string, timeout?: number, now: number,
 *          procRoot?: string}} ctx
 * @returns {{decision: "deny"|"ask"|"allow"|"defer", rule: string|null, reason?: string,
 *           rewrite?: {command: string, timeout?: number, log?: string}, contexts: string[]}}
 */
export function classify(command, ctx) {
  const blank = blankHeredocs(command, blankComments(command, blankQuoted(command)));
  const clauses = parseStructure(blank);
  const contexts = [];

  // 0. THE HARD FLOOR — first, so neither a later rewrite tier NOR the self-exemption can route around it.
  const floor = detectHardFloor(blank, clauses);
  if (floor) {
    return { ...floor, contexts };
  }

  // 0b. SELF-EXEMPTION — the guard's own validation tooling, by IDENTITY (isSelfToolInvocation): a sole
  //     `node <tool> …` cannot execute its argv, so a corpus string inside it is data and the rules below
  //     have nothing real to judge. It runs AFTER blanking and AFTER the floor, and it is not a mention
  //     test: the unanchored raw-string version of this check turned any command containing one of the
  //     filenames into an explicit `allow` (AGENT-TOOLING-01).
  if (isSelfToolInvocation(command, blank, clauses)) {
    return { decision: "pass", rule: "self-exempt", contexts };
  }

  // 1. destructive git (doctrine ban; near-zero legitimate sightings) — DENY. Read-only forms pass:
  //    `stash list`/`stash show` destroy nothing, and `restore --staged` (no --worktree) only unstages.
  const stash = blank.match(GIT_STASH);
  if (stash && stash[1] === undefined) {
    return { decision: "deny", rule: "git-destructive", reason: REASONS.gitDestructive, contexts };
  }
  const restore = blank.match(GIT_RESTORE);
  if (restore && !(RESTORE_STAGED.test(restore[1]) && !RESTORE_WORKTREE_ARM.test(restore[1]))) {
    return { decision: "deny", rule: "git-destructive", reason: REASONS.gitDestructive, contexts };
  }
  const checkout = blank.match(GIT_CHECKOUT);
  if (checkout && CHECKOUT_PATHISH.test(checkout[1])) {
    return { decision: "deny", rule: "git-destructive", reason: REASONS.gitDestructive, contexts };
  }

  // 2. biome write-mode — blast radius decides (owner ruling 2026-08-03): a WHOLE-TREE fix-all is the
  //    doctrine-banned wave (DENY); a path-scoped and/or --only= single-rule rewrite is the sanctioned
  //    mechanical-migration form (WARN). `pnpm lint:fix` is `biome check --write .` by definition — DENY.
  if (PNPM_LINT_FIX.test(blank)) {
    return { decision: "deny", rule: "biome-write", reason: REASONS.biomeWrite, contexts };
  }
  if (BIOME_WRITE_MODE.test(blank)) {
    for (const clause of clauses) {
      for (const stage of clause.stages) {
        const stageBlank = blank.slice(stage.start, stage.end);
        if (!BIOME_WRITE_MODE.test(stageBlank)) {
          continue;
        }
        if (BIOME_ONLY_SCOPED.test(stageBlank)) {
          contexts.push(CONTEXTS.biomeWriteScoped);
          continue;
        }
        const rawStage = command.slice(stage.start, stage.end);
        const sub = stageBlank.match(BIOME_SUBCOMMAND);
        const rest = rawStage.slice((sub?.index ?? 0) + (sub?.[0].length ?? 0));
        const tokens = rest.trim().split(/\s+/);
        // not paths: flags, bare numbers (flag values), redirects (2>&1, >log), and the whole-tree dot
        const paths = tokens.filter((t) => t.length > 0 && !t.startsWith("-") && !/^\d+$/.test(t) && !/[<>&]/.test(t) && t !== "." && t !== "./");
        if (paths.length === 0) {
          return { decision: "deny", rule: "biome-write", reason: REASONS.biomeWrite, contexts };
        }
        contexts.push(CONTEXTS.biomeWriteScoped);
      }
    }
  }

  // 3. cd into a lane worktree — MAIN SESSION: DENY (the commit-landed-on-a-lane-branch incident class;
  //    orchestrator law is `git -C`, always). SUBAGENT: WARN — a lane cd-ing into its own worktree is
  //    routine and legitimate (975 corpus sightings), and own-vs-foreign is undecidable when the lane's
  //    cwd has been reset to the repo root (which happens constantly). A deny here would cry wolf.
  const cdTarget = blank.match(CD_WORKTREE);
  if (cdTarget) {
    if (!ctx.agentId) {
      return { decision: "deny", rule: "cd-worktree", reason: REASONS.cdWorktree, contexts };
    }
    if (laneName(ctx.cwd ?? "") !== cdTarget[1]) {
      contexts.push(CONTEXTS.cdWorktreeLaneCtx);
    }
  }

  // 4. harness piped — REWRITE the simple shape, DENY the rest (the headline 45-hour class). The harness
  //    must be at a pipeline HEAD (env/timeout/nice wrappers allowed) — mid-text mentions can never fire.
  const harnessPiped = clauses.some((cl) => cl.stages.length > 1 && HARNESS_HEAD.test(blank.slice(cl.stages[0].start, cl.stages[0].end)));
  if (harnessPiped) {
    const rewrite = pipeRewrite(command, blank, clauses, HARNESS_HEAD, ctx);
    if (rewrite) {
      contexts.push(CONTEXTS.rewritePiped(rewrite.log));
      const timeout = ctx.timeout === undefined ? REWRITE_TIMEOUT_MS : undefined;
      return { decision: "allow", rule: "harness-piped", rewrite: { command: rewrite.command, timeout, log: rewrite.log }, contexts };
    }
    return { decision: "deny", rule: "harness-piped", reason: REASONS.harnessPipedDeny, contexts };
  }

  // 5. harness failure swallowed (`|| true`) — DENY
  if (HARNESS_OR_TRUE.test(blank) || HARNESS_SEMI_TRUE.test(blank)) {
    return { decision: "deny", rule: "harness-swallowed", reason: REASONS.harnessSwallowed, contexts };
  }

  // 6. playwright CT — the sanctioned prefix (cache clear + explicit CT config) is REQUIRED, and a piped
  //    CT run hangs exactly like the harness (browser + ctViteDev descendants inherit the pipe). REWRITE
  //    what is unambiguous: missing prefix → prepend it; piped → redirect + re-read; both → both.
  //    e2e invocations (no CT hint) are not this rule's business.
  if (PLAYWRIGHT_TEST.test(blank)) {
    const sanctioned = PLAYWRIGHT_CACHE_CLEAR.test(blank) && CT_CONFIG.test(blank);
    const ctIntent = CT_CONFIG.test(command) || CT_FILE_HINT.test(command);
    const piped = clauses.some((cl) => cl.stages.length > 1 && PW_CLAUSE_HEAD.test(blank.slice(cl.stages[0].start, cl.stages[0].end)));
    if (ctIntent && (!sanctioned || piped)) {
      const timeout = ctx.timeout === undefined ? REWRITE_TIMEOUT_MS : undefined;
      const rewritten = playwrightRewrite(command, blank, clauses, ctx);
      if (rewritten) {
        contexts.push(CONTEXTS.rewritePlaywright);
        return { decision: "allow", rule: "playwright-ct", rewrite: { command: rewritten, timeout }, contexts };
      }
      if (CT_CONFIG.test(blank)) {
        const pr = pipeRewrite(command, blank, clauses, PW_CLAUSE_HEAD, ctx);
        if (pr) {
          const cachePrefix = sanctioned ? "" : `rm -rf ${ctx.projectDir}/playwright/.cache && `;
          if (!sanctioned) {
            contexts.push(CONTEXTS.rewritePlaywright);
          }
          contexts.push(CONTEXTS.rewritePiped(pr.log));
          return { decision: "allow", rule: "playwright-ct", rewrite: { command: `${cachePrefix}${pr.command}`, timeout, log: pr.log }, contexts };
        }
      }
      if (!sanctioned) {
        return { decision: "deny", rule: "playwright-ct", reason: REASONS.playwrightCt, contexts };
      }
      // sanctioned but piped in a shape we can't safely rewrite — teach without blocking
      contexts.push(CONTEXTS.playwrightPiped);
    }
  }

  // 7. sg-as-ast-grep — static WARN (owner ruling 2026-08-03): `sg` is deprecated upstream (the tool
  //    itself warns), and the newgrp collision is PRESENT on this box, merely shadowed by PATH order.
  //    No runtime check — the rule holds regardless of which binary wins.
  if (SG_AS_AST_GREP.test(blank)) {
    contexts.push(CONTEXTS.sgDeprecated);
  }

  // 8. force push — ASK (owner judgment; n=6 in the whole corpus)
  if (GIT_PUSH_FORCE.test(blank)) {
    return { decision: "ask", rule: "git-push-force", reason: REASONS.pushForce, contexts };
  }

  // 9. any push from a LANE — ASK (standing law: lanes never push; orchestrator merges, owner words pushes)
  if (ctx.agentId && GIT_PUSH.test(blank)) {
    return { decision: "ask", rule: "lane-git-push", reason: REASONS.lanePush, contexts };
  }

  // 9b. ANY push, from anywhere — ASK. Load-bearing since pass became `allow`: this used to reach the
  //     permission flow and prompt, because `git push` is DELIBERATELY absent from settings.json's
  //     allowlist. With the guard allowing what it does not object to, a silent fall-through here would
  //     push to origin with no word at all — the one thing the standing law forbids outright.
  if (GIT_PUSH.test(blank)) {
    return { decision: "ask", rule: "git-push", reason: REASONS.ownerWordPush, contexts };
  }

  // NOTE — deliberately NO `git reset` rule. The owner's GLOBAL settings wildcard-allow `git reset *`
  // and `git checkout *`; adding an ask here would override a call he already made. (An earlier version
  // of this file, the board, and the doctrine all claimed reset/checkout were "deliberately excluded
  // from the allowlist" — that was FALSE, corrected 2026-08-03 by reading ~/.claude-b/settings.json.
  // The ones genuinely absent are `git push`, `git stash`, `git restore` — and stash/restore are DENIED
  // above on their destructive arms, which is this guard's own doctrine call, not a permissions gap.)

  // 10. long-lived non-harness command piped — REWRITE simple, WARN otherwise
  for (const clause of clauses) {
    if (clause.stages.length < 2) {
      continue;
    }
    if (!LONG_LIVED.test(blank.slice(clause.stages[0].start, clause.stages[0].end))) {
      continue;
    }
    const rewrite = pipeRewrite(command, blank, clauses, LONG_LIVED, ctx);
    if (rewrite) {
      contexts.push(CONTEXTS.rewriteLongLived(rewrite.log));
      return { decision: "allow", rule: "longlived-piped", rewrite: { command: rewrite.command, log: rewrite.log }, contexts };
    }
    contexts.push(CONTEXTS.longLivedPipe);
    break;
  }

  // 11. advisory tier — never blocks, EXCEPT the two shapes that escalate (see collectStageWarns):
  //     an `rm -rf` whose target is not on the safe list, and a bare `sqlite3` on a non-scratch db.
  //     Both were warn-only while pass meant defer; with pass meaning allow they need a human.
  const stageWarns = collectStageWarns(command, blank, clauses, contexts);
  if (stageWarns.rmrf) {
    return { decision: "ask", rule: "rm-rf-unsafe", reason: REASONS.rmRfUnsafe, contexts };
  }
  if (stageWarns.sqlite) {
    return { decision: "ask", rule: "sqlite-live", reason: REASONS.sqliteLive, contexts };
  }
  collectGrepWarn(command, blank, clauses, contexts);
  if (GIT_NO_VERIFY.test(blank)) {
    contexts.push(CONTEXTS.noVerify);
  }
  if (GIT_ADD_ALL.test(blank)) {
    contexts.push(CONTEXTS.gitAddAll);
  }
  if (GIT_COMMIT_OR_MERGE.test(blank) && pushInFlight(ctx.procRoot)) {
    contexts.push(CONTEXTS.pushInFlight);
  }

  // "pass" = the guard LOOKED and has no objection. It becomes `allow` at the hook boundary. It is
  // deliberately NOT called "defer": deferring hands the decision to a permission flow that prompts a
  // human, and a subagent has no human — see the box at the top of this file.
  return { decision: "pass", rule: contexts.length > 0 ? "advisory" : null, contexts };
}

// ── hook plumbing ──

// ── first-contact briefing: tell each SUBAGENT the guard's rules ONCE, on its first Bash call ──
// A lane cannot see this file and does not read the doctrine section about it, so it learns the rules
// only by tripping them. One `additionalContext` injection per agent_id fixes that — and it doubles as
// the visible marker that the guard is live, which is exactly what was missing when seven lanes died on
// a permission defer and the guard was repeatedly (wrongly) exonerated.
const BRIEFING = [
  "TOOL-GUARD IS ACTIVE on Bash in this repo (.claude/hooks/tool-guard.mjs). What it does to you:",
  "· REWRITES a harness command piped into tail/head/grep into a redirect + reader — your exit code and",
  "  artifacts survive. A pipeline returns the READER's status, and it can hang forever because",
  "  playwright/vite/stack children inherit the pipe. Just redirect: `<cmd> > run.log 2>&1`, then read",
  "  the log and reports/verify.json.",
  "· DENIES: `git stash`/`restore`/`checkout <path>` (they destroy uncommitted work — use",
  "  `git show HEAD:<path>` to read an old version), whole-tree `biome check --write` fix-alls, and",
  "  `cd` into a worktree (the Bash cwd PERSISTS across calls — use `git -C <abs-path>`).",
  "· DENIES `git push` from a lane: you do not push. Commit on your branch and report; the orchestrator",
  "  merges and the owner gives an explicit word per push.",
  "· WARNS on bare `npx vitest` (drops the json reporter), `grep -r` without --exclude-dir=node_modules,",
  "  and `sg` (use `ast-grep` — `sg` is deprecated upstream and is `newgrp` on most boxes). A warn RUNS.",
  "· EVERYTHING ELSE RUNS. This guard is about HOW you run a command, never about what you are allowed",
  "  to do — it does not gate your toolbox, so do not narrow your work in anticipation of it.",
  "If a command is refused, the message names the correct form — use it rather than working around it,",
  "and if you believe the refusal is wrong, SendMessage the orchestrator instead of routing around it.",
  "IF A BASH CALL EVER RETURNS `settings deferred Bash`: that is a PERMISSION gap, not this guard and not",
  "your mistake. You cannot answer a prompt, so you CANNOT recover by retrying. Use SendMessage to tell",
  "the orchestrator the EXACT command that was deferred, then stop cleanly. Do not silently give up: a",
  "lane that dies without reporting looks like a transient failure and costs the orchestrator a",
  "re-dispatch — and that misdiagnosis has already cost nine lanes in one day.",
].join("\n");

/** True the FIRST time this agent_id is seen; writes a marker so later calls stay quiet. Best-effort:
 *  any fs failure returns false (never brief twice-noisily, never block on a marker write). */
function firstContact(projectDir, agentId) {
  if (!agentId) {
    return false;
  }
  try {
    const dir = path.join(projectDir, "reports", "tool-guard", "briefed");
    mkdirSync(dir, { recursive: true });
    const marker = path.join(dir, `${String(agentId).replace(/[^\w.-]/g, "_")}.txt`);
    if (readdirSync(dir).includes(path.basename(marker))) {
      return false;
    }
    appendFileSync(marker, `${new Date().toISOString()}\n`);
    return true;
  } catch {
    return false;
  }
}

function emit(output) {
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

function hookOutput(fields) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", ...fields } };
}

// Reserved for the paths where the guard has NOT judged the command: the kill switch, an internal
// error, unparseable stdin, a non-Bash tool. There, "no opinion" is the honest answer and the normal
// permission flow should decide. Everywhere the guard HAS looked and is content, it says `allow`.
const DEFER = hookOutput({ permissionDecision: "defer" });
const PASS_REASON = "tool-guard: no objection";
const SUBAGENT_ASK_SUFFIX =
  "You are a subagent and cannot answer a permission prompt, so this is a DENY rather than a stall. " +
  "SendMessage the orchestrator with the exact command and why you wanted it — that decision is theirs.";

function logDecision(projectDir, record) {
  try {
    const dir = path.join(projectDir, "reports", "tool-guard");
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, "decisions.jsonl"), `${JSON.stringify(record)}\n`);
  } catch {
    // observability must never break the guard — fail soft
  }
}

function readStdin(deadlineMs) {
  return new Promise((resolve) => {
    let data = "";
    const timer = setTimeout(() => resolve(null), deadlineMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

function toHookOutput(result, ctx) {
  if (result.decision === "deny") {
    return hookOutput({ permissionDecision: "deny", permissionDecisionReason: result.reason });
  }
  if (result.decision === "ask") {
    // A subagent has nobody to ask. An unanswered `ask` kills the lane mid-turn with no report —
    // the same failure `defer` used to cause. DENY instead: the lane gets the reason, ends cleanly,
    // and can SendMessage the orchestrator, who CAN decide. The main session still gets the prompt.
    if (ctx?.agentId) {
      return hookOutput({
        permissionDecision: "deny",
        permissionDecisionReason: `${result.reason}\n${SUBAGENT_ASK_SUFFIX}`,
      });
    }
    return hookOutput({ permissionDecision: "ask", permissionDecisionReason: result.reason });
  }
  if (result.decision === "allow" && result.rewrite) {
    const updatedInput = { command: result.rewrite.command };
    if (result.rewrite.timeout !== undefined) {
      updatedInput.timeout = result.rewrite.timeout;
    }
    return hookOutput({
      permissionDecision: "allow",
      permissionDecisionReason: result.contexts[0] ?? "rewritten by tool-guard",
      updatedInput,
      additionalContext: result.contexts.join("\n"),
    });
  }
  // An explicit `defer` from the classifier means it did NOT judge this command (classifier-error).
  // That must stay a defer — auto-allowing something nobody looked at is not the fix we are making.
  if (result.decision === "defer") {
    return DEFER;
  }
  // PASS-THROUGH IS `allow`, NEVER `defer`. This guard shapes HOW a command runs; it is not the
  // gatekeeper of WHAT an agent may run (owner ruling 2026-08-03: "our issue was never permissions of
  // what an agent can do, we just want them running the right way"). `defer` means "fall through to the
  // normal permission flow" — and that flow prompts a human, so for a subagent it is a silent death at
  // the first uncovered command. It killed nine lanes. An `allow` here is the guard saying what it
  // actually means: I looked at this and I have no objection.
  const brief = ctx !== undefined && firstContact(ctx.projectDir, ctx.agentId) ? [BRIEFING] : [];
  const contexts = [...brief, ...result.contexts];
  return hookOutput({
    permissionDecision: "allow",
    permissionDecisionReason: PASS_REASON,
    ...(contexts.length > 0 ? { additionalContext: contexts.join("\n") } : {}),
  });
}

async function runBatchMode() {
  const raw = await readStdin(STDIN_DEADLINE_MS);
  const cases = JSON.parse(raw ?? "[]");
  const out = cases.map((c) => {
    const ctx = {
      cwd: c.cwd,
      agentId: c.agentId ?? null,
      projectDir: c.projectDir ?? "/repo",
      timeout: c.timeout,
      now: Number(process.env.ORB_TOOL_GUARD_NOW_FOR_TEST ?? Date.now()),
      procRoot: c.procRoot,
    };
    try {
      return classify(c.command, ctx);
    } catch (err) {
      return { decision: "defer", rule: "classifier-error", contexts: [], error: String(err) };
    }
  });
  process.stdout.write(JSON.stringify(out, null, 2));
}

async function runHookMode() {
  const started = Date.now();
  let projectDir = process.cwd();
  try {
    const raw = await readStdin(STDIN_DEADLINE_MS);
    if (raw === null) {
      emit(DEFER);
      return;
    }
    const input = JSON.parse(raw);
    const command = input?.tool_input?.command;
    if (input?.tool_name !== "Bash" || typeof command !== "string") {
      emit(DEFER);
      return;
    }
    projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
    if (ENV_KILL.test(process.env.ORB_TOOL_GUARD ?? "")) {
      logDecision(projectDir, { t: new Date().toISOString(), decision: "defer", rule: "kill-switch", cmd: command.slice(0, CMD_LOG_MAX) });
      emit(DEFER);
      return;
    }
    if (process.env.ORB_TOOL_GUARD_CRASH_FOR_TEST) {
      throw new Error("forced crash (ORB_TOOL_GUARD_CRASH_FOR_TEST)");
    }
    const ctx = {
      cwd: input.cwd,
      agentId: input.agent_id ?? null,
      projectDir,
      timeout: input.tool_input.timeout,
      now: Number(process.env.ORB_TOOL_GUARD_NOW_FOR_TEST ?? Date.now()),
    };
    const result = classify(command, ctx);
    if (result.rewrite?.log) {
      mkdirSync(path.dirname(result.rewrite.log), { recursive: true });
    }
    // Compute the output BEFORE logging so the record can carry what was actually EMITTED, not just what
    // the classifier decided. These diverge on exactly one path and it is the one that matters: a subagent
    // `ask` is emitted as `deny` (see toHookOutput). Logging only `decision` made 64 subagent rows read as
    // hung `ask`s in triage when every one of them had been a clean deny — the header's own triage
    // one-liner walked straight into that false alarm on 2026-08-13.
    const output = toHookOutput(result, ctx);
    const emitted = output?.hookSpecificOutput?.permissionDecision ?? null;
    logDecision(projectDir, {
      t: new Date().toISOString(),
      sid: input.session_id ?? null,
      agent: input.agent_type ?? "main",
      cwd: input.cwd ?? null,
      decision: result.decision,
      ...(emitted !== null && emitted !== result.decision ? { emitted } : {}),
      rule: result.rule,
      ms: Date.now() - started,
      cmd: command.slice(0, CMD_LOG_MAX),
      ...(result.rewrite ? { rewrittenTo: result.rewrite.command.slice(0, CMD_LOG_MAX) } : {}),
    });
    emit(output);
  } catch (err) {
    // FAIL OPEN — a broken guard must never block work.
    logDecision(projectDir, { t: new Date().toISOString(), decision: "defer", rule: "guard-error", error: String(err) });
    emit(DEFER);
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  if (process.argv.includes("--classify-batch")) {
    runBatchMode().catch(() => {
      process.stdout.write("[]");
    });
  } else {
    runHookMode().catch(() => emit(DEFER));
  }
}
