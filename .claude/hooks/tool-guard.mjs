#!/usr/bin/env node
// RE-REGISTERED 2026-09-11 (owner ruling, superseding the ARCHIVED-2026-09-10 banner #1898 that stood
// here): the archival removed the ONLY enforcement of the destroy-uncommitted ban, and a lane then ran
// `git stash -u` on a shared tree and swept five lanes' files. `.claude/settings.json` registers this file
// on PreToolUse again. The #1898 observation stays true of the PATH — replay and the regression corpus
// execute this exact file, and SELF_CHECKOUT derives repository identity from this depth — so it never
// moves. HOOKS BIND AT SESSION LAUNCH: a session already running does not pick this up.
// CLAUDE ONLY, BY OWNER RULING (2026-09-11): "it's fine, Codex is a lot more cautious than our side so I
// haven't had to use the tool guard." `.codex/hooks.json` therefore stays `{"hooks":{}}` deliberately —
// it is not an oversight to be repaired, and `.codex/hooks` symlinks here, so the file is already present
// on that side should the ruling ever change. The assertion that pins it empty is in
// tests/tooling/agent-sync/ops/sync.int.test.ts, which carries the same ruling (JSON holds no comments).
// SIX CONFIRMED GAPS CLOSED 2026-09-11 (#1943, from the stickler review of the re-registration —
// 2026-09-11; each fix carries its WHY at the code it
// changed, and every one was pre-existing, not a regression of the re-enable):
//   F1 rule 6's head vocabulary now names `<path>/node_modules/.bin/playwright`, `pnpm playwright` and
//      `node …/@playwright/test/cli.js` (268 of 782 raw CT corpus rows ran un-floored through those).
//   F2 a group CLOSER glued to the operand is no longer a shield (`(bash /tmp/x.sh)` passed while
//      `(bash /tmp/x.sh )` denied), and ENOENT from a GROUPED clause is an `ask`, not silence.
//   F3 is OUTSIDE this file: `pnpm verify`'s STATIC tier now runs `node --check .claude/hooks/*.mjs` and
//      its PUSH tier runs this guard's pin (a syntax error here exits non-zero with no JSON, which the
//      hook contract treats as a non-blocking error — i.e. every Bash call would run unguarded while the
//      push bar stayed green, and `tests:tooling` is `--full`-only). tooling/src/verify/lib/registry.ts.
//   F4 a `-c`/`eval` operand that is nothing but a variable is resolved from the command's own
//      assignments, and asks when it cannot be (`CMD='git stash'; bash -c "$CMD"` denied).
//   F5 a heavy tool reached through a spelling with NO HEAP FLOOR is denied WITH the floored door.
//   F6 the CT rewrite refuses (naming the `=`-joined spelling) when a space-form flag value is
//      path-shaped, because `scoped-test`'s preflight would read it as a path claim and kill the run.
// FIVE RESIDUALS CLOSED 2026-09-11 (#1946, from the Opus verifier's replay of 167,097 distinct real
// commands against #1943 — it found zero loosenings there and these five pre-existing holes beside them;
// each fix carries its WHY at the code it changed, and all five are proven in BOTH directions by
// tests/tooling/tool-guard.int.test.ts):
//   R1 THE FOUR HEAD DETECTORS NOW SHARE ONE WRAPPER VOCABULARY (COMMAND_WRAPPERS + wrapperPrefixEnd +
//      the derived WRAP_PREFIX). Each used to carry its own partial list, so each had a different hole:
//      `env -C <dir> ./node_modules/.bin/playwright test …` ran un-floored, `nice -n 19 bash -c "git
//      stash"` and `env -C /tmp bash -c …` passed a LITERAL `git stash`, and `env -C <wt> npx eslint …`
//      escaped the heap floor — while the `timeout`/`FOO=1` spellings of all three bit. `env -C <dir>` is
//      the spelling .claude/skills/lane/SKILL.md ORDERS every lane to use, so the guard was blind to the house
//      idiom. 110 rows of a 171,473-command replay moved, every one toward a stricter or equal verdict.
//   R2 A BACKGROUNDING `&` GLUED TO A SCRIPT OPERAND is stripped like a group closer (OPERAND_TAIL_NOISE,
//      which no longer requires a closer FIRST): `bash /tmp/x.sh&` — no subshell at all — resolved
//      `/tmp/x.sh&`, ENOENT'd and PASSED with the destructive body never read.
//   R3 A SINGLE-QUOTED VAR-ONLY `-c` OPERAND is resolved from the CHILD's environment, not the parent's
//      shell-local assignments (childEnvVars). `CMD='git stash'; bash -c '$CMD'` runs the EMPTY STRING and
//      was being denied; `CMD='git stash' bash -c '$CMD'` really does stash and was only an ask. `eval` is
//      excluded — it re-parses in the same shell, so its single-quoted `$CMD` genuinely expands.
//   R4 THE CT REWRITE HEAD reads the same vocabulary, so a wrapper-prefixed raw CT run is rewritten into
//      `<prefix> pnpm test:ct <paths>` (cwd and port preserved) instead of losing the lane its turn.
//   R5 `lint:hook-syntax` (tooling/src/verify/lib/registry.ts) now has a committed red-first pin: its
//      shipped argv is run against a planted broken hook, a good one, and this tree.
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
// WHY THIS EXISTS (measured, not guessed — 2026-08-03,
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
//   · THE GUARD NEVER BLOCKS THE SANCTIONED FORM OF A JOB — `pnpm test:ct <paths>` is the CORRECT lane CT
//     recipe (vocabulary refresh 2026-09-11: it was `rm -rf playwright/.cache && npx playwright test -c
//     playwright-ct.config.ts <paths>` until the per-invocation cache landed) and passes untouched, and a
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
// (2026-08-13 §AGENT-TOOLING-01, R5).
//   · SCRIPT BODIES ARE CLASSIFIED — the same defect class as AGENT-TOOLING-01: visibility, not rule
//     weakness. Lanes legitimately wrap work in a scratchpad `.sh` (logging + the 120s Bash ceiling), and
//     `bash /tmp/…/lane-run.sh` used to pass as ONE opaque line — every rule below judged the wrapper, not
//     what ran (986 such invocations in one day's decision log; today's were all sanctioned recipes, and
//     nothing enforced that). Now a `bash <path>` / `sh <path>` / bare `<path>.sh` stage resolves its
//     path: a REPO-TRACKED script passes through to the normal rules (it is reviewed code — re-linting
//     the repo on every call is not this hook's job), an UNTRACKED one (scratchpad, worktree-local, /tmp)
//     has its CONTENTS classified through this same `classify` and the strictest verdict merges with the
//     rest of the command. TRACKED MEANS TRACKED IN *THIS* PROJECT'S REPOSITORY (#633, 2026-08-24): the
//     predicate used to run `git ls-files` in the FILE'S OWN directory, so any repository answered and
//     "reviewed" was forgeable in two commands (`git init /tmp/w; git -C /tmp/w add evil.sh` flipped the
//     identical body from deny to pass). Identity is the project's `--git-common-dir`, which every
//     registered lane WORKTREE shares — see isTrackedScript. THE OPERAND IS RESOLVED OFF THE RAW WORDS (#631, 2026-08-24): quotes stripped,
//     `$VAR` expanded from the command's own assignments, `bash`'s flags skipped and the script's trailing
//     ARGS not mistaken for it — reading it off the BLANKED text made `bash "$SP/run.sh"` resolve to
//     nothing and `bash "/abs/run.sh" arg` resolve to the ARGUMENT, so the guard returned a content
//     verdict on a body it never opened (owner-confirmed: those two spellings EXECUTED with no prompt,
//     while the identical script denied bare). And when the command does not pin the path down at all —
//     an unassigned variable, a substitution, a glob — the stage is an `ask`, never silence: with `allow`
//     bypassing the permission flow, "I did not look" must never read as "I have no objection".
//     The body is classified WHOLE, not line-by-line: real wrappers use `\`
//     continuations and put `rm -rf playwright/.cache` on its own line, so per-line judgement would deny
//     the sanctioned CT recipe. Bounded by construction — one level deep (a script invoked from a script
//     body is `ask`, never a recursive walk) and a 64KB read cap.
//   · THE CHANNEL IS NOT THE OPERAND (#634, 2026-08-24) — an interpreter takes its program from an
//     operand, from STDIN (`bash < f`, `cat f | bash`), from a HEREDOC, or from the current shell
//     (`. f` / `source f`), and only the first was ever resolved. Each is now judged where the program
//     actually comes from: a stdin/dot-source FILE resolves and is read like any operand; a heredoc fed to
//     a shell is classified as the text it is; a pipe sink whose producer is not a readable `cat` is an
//     `ask` (it is a program the guard genuinely cannot see). Corpus frequency, 135,505 calls: stdin-file
//     0, heredoc-to-shell 0, pipe-to-shell 0, dot-source 325 (a raw-regex count said 2,367 — the rest were
//     a bare `.` PATH ARGUMENT: `find . -path`, `biome check . --write`).
//   · WRITE-THEN-RUN IS JUDGED ON WHAT WILL LAND (#634) — `printf '…' > x.sh; bash x.sh` passed because
//     the file did not exist yet when the guard looked, and the re-run case is worse (it reads the
//     PREVIOUS body while the command overwrites it). For a path this same command writes, the guard
//     classifies the CONTENT the command shows — a heredoc body, a `printf`/`echo` literal — and asks only
//     when the writer's output is invisible (a generator, a fetch). Not a refusal of the SHAPE: 258 corpus
//     commands write-and-run in one call and 246 are the house's own `cat > x.sh <<'EOF' … EOF; bash x.sh`
//     wrapper idiom, so refusing it would be a wall on the sanctioned way of doing the job.
//   · QUOTED COMMANDS ARE CLASSIFIED — the same defect one layer further down (2026-08-14). A `bash -c
//     '<string>'` operand and a `$( … )` substitution are COMMANDS, and quote-blanking erased both before
//     any rule could see them: `bash -c "git stash"` and `echo "$(git stash)"` were clean passes. Both are
//     now extracted and classified through this same `classify`, strictest-of merges, bounded at
//     NESTED_DEPTH_CAP levels of quoting (6 — the fence moved from 2 when the corpus showed benign
//     three-deep idioms hitting it; the "two levels" this line claimed until leg 5 was stale). The `$( … )`
//     walk honours BACKSLASH ESCAPES rather than reusing `blankQuoted`: an escaped inner quote used to
//     swallow the closing paren and drop the whole substitution from extraction (see substitutionEnd).
//     ASYMMETRY, on purpose: inside SINGLE quotes a `$( … )` is literal text and is NOT
//     extracted — biting it would be a false tighten on a string nobody executes. Heredoc bodies and
//     comments stay text guard-wide, so a substitution inside one is not extracted either.
//   · SELF-EXEMPTION IS A REALPATH IDENTITY, not a path suffix — a look-alike (`/tmp/.claude/hooks/
//     tool-guard.mjs`) used to satisfy the suffix test and skip every rule below.
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

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
  for (const [start, stop] of commentSpans(raw, blank)) {
    out = out.slice(0, start) + " ".repeat(stop - start) + out.slice(stop);
  }
  return out;
}

/** The `[start, stop)` spans blankComments blanks. Split out because a caller that REWRITES text needs the
 *  spans themselves: a comment is INVISIBLE in the blanked text (its spaces read as spaces), so a rewrite
 *  that slices the ORIGINAL by clause indexes carries the comment along, and everything appended after it
 *  is swallowed to end-of-line — which is exactly how the pipe rewrite lost the harness exit code it exists
 *  to preserve (pipeRewrite, 2026-08-14). */
export function commentSpans(raw, blank) {
  const spans = [];
  for (let i = 0; i < blank.length; i += 1) {
    if (blank[i] !== "#" || (i > 0 && !/\s/.test(raw[i - 1]))) {
      continue;
    }
    const lineEnd = blank.indexOf("\n", i);
    const stop = lineEnd === -1 ? blank.length : lineEnd;
    spans.push([i, stop]);
    i = stop;
  }
  return spans;
}

/** Quoted spans of the RAW text as `{start, end, quote}` — the indexes of the opening and closing quote
 *  CHARACTERS (end = the string length when unterminated). Same state machine as blankQuoted, kept beside
 *  it so the two can never disagree about what is quoted; the only addition is WHICH quote opened the span,
 *  which is the whole question for a `$( … )`: live inside `"`, literal text inside `'`. */
export function quoteSpans(cmd) {
  const spans = [];
  let quote = null;
  let start = 0;
  for (let i = 0; i < cmd.length; i += 1) {
    const ch = cmd[i];
    if (quote === null && (ch === '"' || ch === "'")) {
      quote = ch;
      start = i;
    } else if (quote !== null && ch === quote && cmd[i - 1] !== "\\") {
      spans.push({ start, end: i, quote });
      quote = null;
    }
  }
  if (quote !== null) {
    spans.push({ start, end: cmd.length, quote });
  }
  return spans;
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
  const blankSpan = (text, from, to) => text.slice(0, from) + text.slice(from, to).replace(/[^\n]/g, " ") + text.slice(to);
  for (const [start, stop] of heredocSpans(raw, blank)) {
    out = blankSpan(out, start, stop);
  }
  return out;
}

/** Every heredoc in the command, as index ranges: `opStart`/`opEnd` bound the operator + delimiter,
 *  `bodyStart`/`bodyEnd` bound the BODY ALONE (terminator line excluded), `spanEnd` is where the
 *  terminator line ends. ONE scanner, because two consumers need different slices of the same shape and
 *  a second scanner would eventually disagree with this one: `heredocSpans` blanks operator + body +
 *  terminator (a heredoc body is TEXT to every rule), while the script pass needs the body TEXT — a
 *  `<<EOF` fed to a SHELL, or written into a file the same command then runs, is a PROGRAM (#634). */
export function heredocUnits(raw, blank) {
  const units = [];
  HEREDOC_OPERATOR.lastIndex = 0;
  for (let m = HEREDOC_OPERATOR.exec(raw); m !== null; m = HEREDOC_OPERATOR.exec(raw)) {
    if (blank[m.index] !== "<") {
      continue; // the operator is inside a quoted span — string content, not a heredoc
    }
    const delim = m[2];
    const bodyStart = raw.indexOf("\n", m.index + m[0].length);
    if (bodyStart === -1) {
      break;
    }
    // find the terminator line (allowing leading tabs for <<-)
    let end = raw.length;
    let bodyEnd = raw.length;
    for (let lineStart = bodyStart + 1; lineStart < raw.length; ) {
      const lineEnd = raw.indexOf("\n", lineStart);
      const stop = lineEnd === -1 ? raw.length : lineEnd;
      if (raw.slice(lineStart, stop).replace(/^\t+/, "") === delim) {
        end = stop;
        bodyEnd = lineStart;
        break;
      }
      if (lineEnd === -1) {
        break;
      }
      lineStart = lineEnd + 1;
    }
    units.push({ opStart: m.index, opEnd: m.index + m[0].length, bodyStart, bodyEnd, spanEnd: end });
    HEREDOC_OPERATOR.lastIndex = end;
  }
  return units;
}

/** The `[start, stop)` spans blankHeredocs blanks — the operator + delimiter, and the body + terminator
 *  line. Split out for the same reason as commentSpans: a caller that needs to know whether a position is
 *  TEXT rather than command cannot tell from the blanked string (a blanked heredoc body and a blanked
 *  quoted span both read as spaces). */
export function heredocSpans(raw, blank) {
  return heredocUnits(raw, blank).flatMap((u) => [
    [u.opStart, u.opEnd],
    [u.bodyStart, u.spanEnd],
  ]);
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
// ── THE ONE WRAPPER VOCABULARY (2026-09-11, #1946) ──
// A WRAPPER is a command word that PREFIXES another command. FOUR head detectors have to step over the
// same set — the CT anchor (PW_ANCHOR), the harness head (HARNESS_HEAD), and the inline-shell and
// heavy-tool heads (both through `execHead`) — and until this object existed each carried its OWN partial
// list, so each had a DIFFERENT hole. Measured on the shipped guard (#1946, from the verifier replay of
// 167,097 real commands against #1943):
//   · `env -C <dir> ./node_modules/.bin/playwright test …` PASSED un-floored, while the `npx` and `pnpm`
//     spellings of the same run were caught — and `env -C <dir>` is the spelling
//     `.claude/skills/lane/SKILL.md` ORDERS every lane to use, so the guard was blind to the
//     house idiom and caught only the shapes nobody was told to type.
//   · `nice -n 19 bash -c "git stash"` and `env -C /tmp bash -c "$CMD"` PASSED a literal `git stash`,
//     while `timeout 60 bash -c …`, `FOO=1 bash -c …` and `env bash -c …` denied. One wrapper flag apart.
// Patching the four call sites separately would have recreated the class, which is why the vocabulary is
// DATA with two derived readers: `WRAP_PREFIX` (regex half, below) and `wrapperPrefixEnd` (token half).
// `arg` names the flags that consume a SEPARATE value word. A bare flag (`env -i`, `setsid -f`), a
// `--flag=value`, and a bare duration (`timeout 60`, `timeout 1m`) need no entry — see the two readers.
const COMMAND_WRAPPERS = {
  timeout: { arg: ["-s", "-k", "--signal", "--kill-after"] },
  nice: { arg: ["-n", "--adjustment"] },
  env: { arg: ["-u", "-C", "-S", "--unset", "--chdir", "--split-string"] },
  setsid: { arg: [] },
  nohup: { arg: [] },
  exec: { arg: ["-a"] },
};
// Longest-first so `--signal` can never be shadowed by a `-s` arm that then fails the whole alternation.
const WRAPPER_ARG_ALT = Object.values(COMMAND_WRAPPERS)
  .flatMap((w) => w.arg)
  .sort((a, b) => b.length - a.length)
  .join("|");
const WRAPPER_NAME_ALT = Object.keys(COMMAND_WRAPPERS).join("|");
// A bare number is prefix noise for both readers (`timeout 60`, `timeout 1m`) — the pre-#1946 vocabulary
// tolerated it after ANY wrapper, and keeping that tolerance is what makes this change widening-only.
const WRAP_NUMBER = /^\d+[a-z]?$/;
const ASSIGN_PREFIX = /^[A-Za-z_][A-Za-z0-9_]*=/;
// ONE prefix WORD: an arg-flag WITH its value, any other flag, an env assignment, a bare duration, or a
// wrapper name. The negative lookahead on the generic-flag arm makes the alternatives MUTUALLY EXCLUSIVE
// — without it `-n 19` decomposes two ways and an N-flag prefix costs 2^N backtracks on a near miss.
const WRAP_WORD = String.raw`(?:(?:${WRAPPER_ARG_ALT})\s+\S+|(?!(?:${WRAPPER_ARG_ALT})\s)--?[A-Za-z]\S*|[A-Za-z_][A-Za-z0-9_]*=\S*|\d+[a-z]?|(?:${WRAPPER_NAME_ALT}))`;
const WRAP_PREFIX = String.raw`(?:${WRAP_WORD}\s+)*`;

/** Advance past the wrapper prefix starting at `words[start]` — env assignments and any stack of
 *  COMMAND_WRAPPERS with their own flags — and return the index of the REAL exec head. The TOKEN half of
 *  the vocabulary above; `WRAP_PREFIX` is the regex half, and both are derived from the one object so a
 *  wrapper added to it can never reach three detectors and miss the fourth.
 *
 *  WIDENING ONLY, by construction: a head found DEEPER can only make a rule fire where it did not. Every
 *  head this newly resolves was previously a FLAG or a flag VALUE (`-n`, `-C`, `/wt`), and none of those
 *  is an npx, a `.bin/<tool>`, a node, or a shell — so every changed cell is a MISS becoming a catch. */
export function wrapperPrefixEnd(words, start = 0) {
  let i = start;
  for (;;) {
    // A bare number is skipped HERE as well as inside a wrapper's own flag run, which looks redundant and
    // is not: the pre-#1946 vocabulary tolerated one ANYWHERE in the prefix, and dropping that tolerance
    // LOOSENED one real corpus row (`out=$(timeout 150 node_modules/.bin/tsc --noEmit …` — `$(` is not
    // word-initial so `ungroup` leaves it, the whole `out=$(timeout` reads as ONE assignment token, and
    // the `150` is then all that stands between the walk and the un-floored `.bin/tsc`). Parity with the
    // old reader is what makes this change provably widening-only.
    while (words[i] !== undefined && (ASSIGN_PREFIX.test(words[i]) || WRAP_NUMBER.test(words[i]))) {
      i += 1;
    }
    const name = words[i];
    const spec = name === undefined ? undefined : COMMAND_WRAPPERS[name.replace(/^.*\//, "")];
    if (spec === undefined) {
      return i;
    }
    i += 1;
    while (words[i] !== undefined) {
      const word = words[i];
      if (ASSIGN_PREFIX.test(word) || WRAP_NUMBER.test(word)) {
        i += 1; // `env FOO=1 bash …` (the wrapper's own environment) and `timeout 60 …`
        continue;
      }
      if (word.startsWith("-") && word !== "-") {
        i += 1;
        if (spec.arg.includes(word)) {
          i += 1; // the flag's value is a SEPARATE word: `-C /wt`, `-n 19`, `-k 5`
        }
        continue;
      }
      break;
    }
  }
}
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
// The guard's own validation tooling, identified by CANONICAL REALPATH — never by mention, and (since
// 2026-08-14) never by path SUFFIX either. Suffix matching made the exemption forgeable: `node
// /tmp/.claude/hooks/tool-guard.mjs $(git stash)` ends with the sanctioned suffix while running an
// attacker-placed file, i.e. a laundering hole through the very control the AGENT-TOOLING-01 leg built.
// The identity is now "the same FILE this process is executing" (plus the two probes that live beside it
// in the same checkout), resolved through realpath on both sides — so a symlink to the real hook exempts
// (it runs the same bytes, deliberately) and a look-alike never does. The probes are `.ts` since the tsx
// shed (node runs TypeScript directly).
const SELF_TOOL_RELPATHS = ["scripts/probes/guard-replay.ts", "scripts/probes/transcript-census.ts"];

/** Resolve a path to its canonical form; falls back to the normalized absolute path when the file does not
 *  exist (a non-existent path can never BE the running hook, so the fallback only ever fails to exempt). */
function canonicalPath(file) {
  try {
    return realpathSync(file);
  } catch {
    return path.resolve(file);
  }
}

/** The checkout this hook lives in (`<checkout>/.claude/hooks/tool-guard.mjs` → `<checkout>`), or null when
 *  the module's own location is unknowable. Pure path math — no spawn, no fs beyond the realpath above. */
const SELF_CHECKOUT = (() => {
  try {
    return path.resolve(path.dirname(canonicalPath(fileURLToPath(import.meta.url))), "..", "..");
  } catch {
    return null;
  }
})();

/** The canonical paths that exempt, computed ONCE from this module's own location. */
const SELF_TOOL_PATHS = (() => {
  if (SELF_CHECKOUT === null) {
    return new Set(); // identity unknowable ⇒ nothing exempts (the strict direction)
  }
  try {
    return new Set([canonicalPath(fileURLToPath(import.meta.url)), ...SELF_TOOL_RELPATHS.map((rel) => canonicalPath(path.join(SELF_CHECKOUT, rel)))]);
  } catch {
    return new Set();
  }
})();
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
// GLOBAL OPTIONS sit between `git` and its subcommand — and §L MANDATES the most common one (`git -C
// <worktree>` on EVERY lane git call), so a bare `\bgit\s+stash\b` rule was blind to exactly the spelling
// this repo orders every agent to use (#497). Evidence, reports/tool-guard/decisions.jsonl (40 git-ish
// rows of 69,937): `git -C .claude/worktrees/<lane> checkout --ours packages/client/…/use-count-up.ts`
// and `git -C "$MAIN" checkout --theirs docs/…/Core-Enforcement-Active-Gates.md` both PASSED, while every
// bare-`git` row denied correctly — the ban read as enforced and was decorative for lanes.
// The loop consumes only FLAG-SHAPED tokens plus at most one value each, so a non-flag first token stops
// it dead: `git log --oneline -5 -- .claude` and `git diff -- restore.ts` can never reach a subcommand
// match. A QUOTED value (`-C "$WT"`) is already blanked to whitespace by blankQuoted, contributing no
// token at all — hence the value group is optional, and JS backtracking covers the boolean-flag case
// (`git --no-pager stash`: the value group first eats `stash`, fails, then gives it back).
const GIT_GLOBAL_OPTS = String.raw`(?:-{1,2}[A-Za-z][^\s;|&]*\s+(?:[^\s;|&-][^\s;|&]*\s+)?)*`;
// stash: read-only subcommands (list/show) destroy nothing and pass; everything else is the ban.
const GIT_STASH = new RegExp(String.raw`\bgit\s+${GIT_GLOBAL_OPTS}stash\b(?:\s+(list|show))?`);
// restore: `--staged` WITHOUT `--worktree`/-W only unstages (index-only) — safe; all else destroys.
const GIT_RESTORE = new RegExp(String.raw`\bgit\s+${GIT_GLOBAL_OPTS}restore\b([^\n;|&]*)`);
const RESTORE_WORKTREE_ARM = /--worktree|(^|\s)-W\b|(^|\s)-[a-zA-Z]*W/;
const RESTORE_STAGED = /--staged|(^|\s)-S\b/;
const GIT_CHECKOUT = new RegExp(String.raw`\bgit\s+${GIT_GLOBAL_OPTS}checkout\s+(.*)`);
// checkout-index: with `-f`/`--force` (or `-a`/`--all`) it overwrites worktree files from the INDEX — `git checkout
// <path>` under a fourth spelling (a lane destroyed its own uncommitted regex-section.tsx with `checkout-index -f --
// <path>` on 2026-09-06 while restoring a planted control). Without a force/all flag it refuses to overwrite an
// existing file, so that arm passes.
const GIT_CHECKOUT_INDEX = new RegExp(String.raw`\bgit\s+${GIT_GLOBAL_OPTS}checkout-index\b([^\n;|&]*)`);
const CHECKOUT_INDEX_OVERWRITE = /(^|\s)--(?:force|all)\b|(^|\s)-[a-zA-Z]*[fa]/;
// `--ours`/`--theirs` is a CONFLICT-RESOLUTION checkout: it overwrites the worktree file with one merge
// side, discarding any hand-edit already made there. Named explicitly (not left to the extension list)
// because the pathspec is often extension-less or an unlisted suffix — and refused UNIFORMLY per #497:
// the house spelling `git show MERGE_HEAD:<path> > <path>` covers the legitimate merge case.
const CHECKOUT_PATHISH = /(^|\s)(--(\s|$)|--(ours|theirs)\b|\.(\s|$)|\S+\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|md|css|html|sql|sh|yml|yaml|txt|svg|png|lock)\b)/;
const BIOME_WRITE_MODE = /\bbiome\s+(?:check|lint|format)\b[^\n;|&]*--(?:write|fix|apply|unsafe)\b/;
const BIOME_SUBCOMMAND = /\bbiome\s+(?:check|lint|format)\b/;
const BIOME_ONLY_SCOPED = /--only=\S/;
const PNPM_LINT_FIX = /\bpnpm\s+(?:run\s+)?lint:fix\b/;
const HARNESS_OR_TRUE =
  /(?:\b(?:pnpm|npm|turbo)\s+(?:run\s+)?(?:check|verify|test|lint|typecheck|e2e|gate)(?::[\w-]+)?\b|\bpnpm\s+(?:exec\s+)?vitest\b)[^\n;]*\|\|\s*(?:true|echo|:)(?:\s|$)/;
const HARNESS_SEMI_TRUE = /(?:\b(?:pnpm|npm|turbo)\s+(?:run\s+)?(?:check|verify|test|lint|typecheck|e2e|gate)(?::[\w-]+)?\b)[^\n;]*;\s*true\s*$/;
// THE RAW-CT HEAD VOCABULARY (2026-09-11, #1943 F1): this named only `npx`, `pnpm exec`, line-start and
// `&&`, and 268 of the 782 raw CT rows in main's 179,120-row decision log are `./node_modules/.bin/
// playwright test` or `pnpm playwright test` — a third of them, every one running with the stock shared
// `playwright/.cache` (the #1581 corruption the rewrite exists to refuse), no worktree lock, no host slot,
// no run marker, and for the `.bin`/`node` spellings no heap floor either. A head regex for any tool
// carries `(?:\S*\/)?<bin>` and `pnpm <bin>` beside `npx`/`pnpm exec`; `@playwright/test/cli.js` is the
// same binary spelled as a node script, so it is named too. WIDENING ONLY — every spelling that matched
// before still matches, so this rule cannot have loosened.
const PLAYWRIGHT_CLI_JS = String.raw`node\s+\S*@playwright\/test\/cli\.js\s+test\b`;
// A COMMAND POSITION is line start, a separator, or one of them followed by the usual env/timeout/nice
// wrappers (WRAP_PREFIX) — `cd <wt> && timeout 400 ./node_modules/.bin/playwright test …` is the shape
// lanes actually type, and an anchor without the wrapper allowance reads it as text.
const PW_ANCHOR = String.raw`(?:\bnpx\s+|\bpnpm\s+(?:exec\s+)?|(?:^|[;&|(])\s*${WRAP_PREFIX})`;
const PLAYWRIGHT_TEST = new RegExp(String.raw`${PW_ANCHOR}(?:\S*\/)?playwright\s+test\b|${PW_ANCHOR}${PLAYWRIGHT_CLI_JS}`);
const CT_CONFIG = /playwright-ct\.config\.ts/;
const CT_FILE_HINT = /\.ct\.tsx?\b/;
const SG_AS_AST_GREP = /(?:^|[;&|(]\s*|\s)sg\s+(?:run|scan|outline|test|new|--version|-p\b|--pattern)/;
// Every vitest spelling that is NOT the sanctioned door (2026-09-11, #1943 F5 widened it from
// npx/bare/.bin). The `pnpm …` forms carry the heap floor but still miss the supervisor watchdog, the
// preflight that proves the paths collect a test, and the nice floor — silence there was the gap; a WARN
// is the honest tier for it, because the difference from the door is a watchdog, not a missing heap
// ceiling (that is what the deny family below is for, and a deny on a floored spelling would cry wolf).
const VITEST_HEAD = /^\s*(?:npx\s+vitest|vitest|\S*node_modules\/\.bin\/vitest|pnpm\s+(?:exec\s+|run\s+)?vitest|node\s+\S*node_modules\/vitest\/vitest\.mjs)\b/;

// ── un-floored heavy tools (2026-09-11, #1943 F5) ──
// MEASURED on this box (stickler 2026-09-11, item 9): a bare `node` gets heap_size_limit 4192 MiB and no
// NODE_OPTIONS; a `pnpm exec node` / `pnpm run` child gets 16480 (pnpm-workspace.yaml `nodeOptions`). The
// ENTRY SPELLING decides the heap ceiling, and these are the tools that need it — typed eslint (380 corpus
// sightings), tsc (269), the in-process ts-morph verbs (the recorded exit-134 OOM),
// stryker, jscpd, knip, depcruise. `nice` does NOT depend on the spelling (every _shared/proc.ts door
// applies it in-process), so this rule is about the FLOOR, never politeness.
// PRECISION, the guard's first law: only the spellings with NO floor at all are refused — `npx <tool>`,
// `<path>/node_modules/.bin/<tool>`, and a bare `node <heavy script>`. EVERY `pnpm …` spelling passes
// untouched (`pnpm exec tsc`, `pnpm lint:eslint`, `pnpm ast`), because a guard that refuses the floored
// door is what teaches agents to route around it.
const HEAVY_TOOLS = {
  eslint: "`pnpm lint:eslint` (or `pnpm exec eslint <paths>` when you want eslint's own flags)",
  tsc: "`pnpm typecheck` (add `--config <tsconfig>` to scope it to one program)",
  stryker: "`pnpm test:mutation` — and a mutation run is orchestrator-scheduled, never ad hoc",
  jscpd: "`pnpm cpd` (which caps the workers; jscpd's own default is every core)",
  knip: "`pnpm knip`",
  depcruise: "`pnpm depcruise`",
  "dependency-cruiser": "`pnpm depcruise`",
  tsx: "node runs TypeScript directly since the tsx shed — `pnpm exec node <file>`",
};
// The same tools wearing a script path, reached through a bare `node`.
const HEAVY_NODE_SCRIPTS = [
  [/(?:^|\/)scripts\/eslint\.ts$/, "`pnpm lint:eslint`"],
  [/(?:^|\/)tooling\/src\/ast\/cli\.ts$/, "`pnpm ast <lens>` (the bare spelling runs an in-process ts-morph lens at 4 GiB)"],
];
const HEAVY_VERIFY_CLI = /(?:^|\/)tooling\/src\/verify\/cli\.ts$/;
const HEAVY_VERIFY_VERBS = {
  structure: "`pnpm check:structure`",
  "gate-contract": "`pnpm gate:contract`",
  "tests-membership": "`pnpm check:type-ownership`",
};
const NPX_HEAD = /^(?:\S*\/)?npx$/;
const BIN_DIR_TOOL = /(?:^|\/)node_modules\/\.bin\/([\w.-]+)$/;
// An explicit worker count above the fleet cap. The caps are DATA — tooling/concurrency-profile.json is
// their ONE home (#1835) — so this reads them rather than hard-coding a number, and the shipped defaults
// ARE the shared-host values: a flag is only ever needed to go LOWER.
const WORKER_FLAG = /(?:^|\s)--(?:workers|maxWorkers|max-workers)(?:=|\s+)(\d+)/;
const CT_RUNNER_STAGE = /\bpnpm\s+(?:run\s+)?test:ct\b/;
const VITEST_RUNNER_STAGE = /\bpnpm\s+(?:run\s+)?test:(?:scoped|node|tooling)\b/;
const PROFILE_REL = "tooling/concurrency-profile.json";
let concurrencyCapsCache;
/** `{ct, vitest}` from the profile, or null when it cannot be read — fail-open, like every other fact this
 *  guard derives from the tree. */
function concurrencyCaps() {
  if (concurrencyCapsCache === undefined) {
    concurrencyCapsCache = null;
    try {
      const profiles = JSON.parse(readFileSync(path.join(SELF_CHECKOUT ?? "", PROFILE_REL), "utf8")).profiles;
      const active = profiles[process.env.ORB_DEDICATED_BOX === "1" ? "dedicated" : "shared"];
      if (typeof active?.ctWorkers === "number" && typeof active?.vitestMaxWorkers === "number") {
        concurrencyCapsCache = { ct: active.ctWorkers, vitest: active.vitestMaxWorkers };
      }
    } catch {
      concurrencyCapsCache = null;
    }
  }
  return concurrencyCapsCache;
}
const GREP_HEAD = /^\s*(?:\/usr\/bin\/)?grep\s/;
const GREP_RECURSIVE_FLAG = /\s-[a-zA-Z]*r/i;
const GREP_EXCLUDE_DIR = /--exclude-dir/;
const GREP_BROAD_ROOT = /^(\.|\.\/|packages\/?|tests\/?|src\/?|scripts\/?|\*)$/;
// ripgrep's `-r`/`--replace` REWRITES matched text (it does not list matches); glued directly to another
// flag letter (`-rln`, `-rl`, `-rc`…) rg parses the glued letters as the REPLACEMENT VALUE, so the intended
// listing/count flag silently vanishes and output is REPLACED text instead of a match list — no error, no
// warning (four paid offenses this era, three by the orchestrator; owner ruling 2026-08-19, the lane skill's
// "CLI hazards"). Scoped to an `rg` head only (a bare `-r` glued to a value on another tool, e.g.
// `tar -rf`, is that tool's own business). A bare `-r`/`--replace` with a SEPARATE token (or `--replace=`)
// is unambiguous and passes — only the glued-cluster shape silently mangles.
const RG_HEAD = /^\s*(?:\S*\/)?rg\b/;
const RG_REPLACE_MANGLE = /(?:^|\s)-r[A-Za-z]/;
const SQLITE_HEAD = /^\s*sqlite3\b/;
const SQLITE_SAFE_HINT = /\/tmp\/|scratchpad|:memory:|test|\.bak\b/i;
// The hook-bypass family — the ONE sanctioned skip is `LEFTHOOK_EXCLUDE=check git commit/merge …` (whole-tree
// `check` only; the `commit-msg` contract still fires). Every other spelling skips hooks WHOLESALE and is
// banned outright: `--no-verify`/`-n` on commit or merge, `-c core.hooksPath=`, `git config … core.hooksPath`
// (setting, not reading/unsetting), and a `LEFTHOOK=0`/`LEFTHOOK=false` env prefix.
// `-n` is git's own documented shorthand for `--no-verify` on `commit` (not `merge`, where `-n` means
// "no diffstat") — so the `-n` arm is commit-only.
const GIT_NO_VERIFY = /\bgit\s+(?:commit|merge)\b[^\n;|&]*--no-verify\b|\bgit\s+commit\b[^\n;|&]*(?:^|\s)-n\b/;
const GIT_COMMIT_OR_MERGE = /\bgit\s+(?:[^\s;|&]+\s+)*?(?:commit|merge)\b/;
// `-c core.hooksPath=<anything>` is a git GLOBAL OPTION on ANY subcommand — it retargets the hooks dir for
// that one invocation, same effect as `--no-verify` but not caught by the commit/merge-scoped rule above.
const GIT_C_HOOKSPATH = /\bgit\s+(?:[^\s;|&]+\s+)*?-c\s+core\.hooksPath\s*=/;
// `git config … core.hooksPath …` — SETS the key unless it is a read (`--get*`) or an `--unset`. Captured
// tail is everything after `config` on the stage so the read/unset check can see the whole flag set.
const GIT_CONFIG_HOOKSPATH = /\bgit\s+(?:[^\s;|&]+\s+)*?config\b([^\n;|&]*\bcore\.hooksPath\b[^\n;|&]*)/;
const CONFIG_HOOKSPATH_READONLY = /--get\b|--unset\b/;
// `LEFTHOOK=0` / `LEFTHOOK=false` as an env-assignment PREFIX on a git command — lefthook's own kill switch.
const LEFTHOOK_DISABLE = /\bLEFTHOOK=(?:0|false)\b[^\n;|&]*\bgit\b/i;
const PROC_GIT_PUSH = /(^|\0)git\0([^\0]*\0)*push(\0|$)/;
const GIT_ADD_ALL = /\bgit\s+add\s+(?:-A\b|--all\b|\.(?:\s|$))/;
const GIT_PUSH = /\bgit\s+(?:[^\s;|&]+\s+)*?push\b/;
const GIT_PUSH_FORCE = /\bgit\s+push\b[^\n;|]*(?:\s--force(?:-with-lease)?\b|\s-f\b)/;
// The `rm` COMMAND WORD, and nothing else. Everything after it — flags AND targets — is read off the RAW
// stage (`collectStageWarns`), because in the BLANKED text a quoted token is spaces and the head cannot
// tell a flag from a path. Two holes closed here, both the same defect class as the quoted-TARGET one this
// rule already carries (visibility, not rule weakness), leg 5 / 2026-08-14:
//   · QUOTED FLAGS — the previous head required an UNQUOTED `-r`/`-f` right after `rm`
//     (`/^\s*rm(?:\s+-[a-z]*[rf][a-z]*)+/`), so `rm "-rf" packages/server/src` matched NOTHING and the rule
//     never engaged. Quoting is the SHELL's business: `rm` itself receives `-rf` either way.
//   · A PATH PREFIX — `/bin/rm -rf packages/server/src` was not `rm`. Every other head regex in this file
//     already carries `(?:\S*\/)?` (READER, NET_FETCH_HEAD, SHELL_SINK_HEAD, SCRIPT_SHELL_EXEC); this one
//     did not. It can only match a token whose LAST path segment is exactly `rm`, so `npm`, `pnpm rm`,
//     `/usr/bin/rmdir` and `/usr/bin/grm` have no `/rm`+boundary to match and cannot be confused for it.
// The 2026-08-14 quoted-TARGET reasoning still holds and is why the tail is sliced from the RAW command: a
// target is judged with its quote characters ATTACHED, and RM_SAFE_TARGET matches by SUBSTRING, so
// `"/tmp/scratch"` stays sanctioned in quotes while `"packages/server/src"` does not. The head shrinking to
// the command word only ever GROWS the tail, and the verdict is `targets.some(unsafe)`.
const RM_HEAD = /^\s*(?:\S*\/)?rm(?=\s|$)/;
// An rm flag as `rm`'s own getopt sees it — quoted or not, short or long, EITHER CASE. Two tokens with
// two jobs, split by owner ruling (#51): the RECURSIVE token GATES the rule — only a flag that actually
// recurses (`-r`/`-R`, alone or folded into a cluster like `-rf`, or `--recursive`) makes an `rm` this
// rule's business; plain `rm -f <path>` force-unlinks ONE path and is not a recursive delete. The broader
// FLAG token still classifies tokens for the TARGET split below, so a quoted "-f"/"--force"/"--dir" can
// never be mistaken for a path (counting `"-rf"` as a path would make `rm "-rf" /tmp/scratch` ask — a
// false positive on the sanctioned sweep, and a guard that blocks the right way of doing a job gets
// routed around). Both are recognised on the RAW token so quoted spellings engage/classify identically.
const RM_RECURSIVE_TOKEN = /^(['"]?)(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\1$/;
const RM_FLAG_TOKEN = /^(['"]?)(?:-[a-zA-Z]*[rRfF][a-zA-Z]*|--(?:recursive|force|dir))\1$/;
// `.claude/worktrees/` added 2026-08-13: lane worktrees are disposable by construction and the standing
// law now requires sweeping them by hand (teardown does not fire on agent completion — probed live). Asking
// about every sweep spent lane turns for nothing. Scoped to `worktrees/` ONLY — the rest of `.claude/`
// (settings, hooks, agents) is load-bearing and stays ask-tier.
const RM_SAFE_TARGET = /\/tmp\/|scratchpad|playwright\/\.cache|node_modules|reports\/|\.claude\/worktrees\/|\bdist\b|\bcoverage\b|\.cache\b|\.bak\b/;
// An rm target is tested AFTER resolving variables the command ITSELF assigned earlier (assignedVars +
// expandAssigned). Owner ruling 2026-08-14, taken WITH the quoted-target tighten above, because the two
// are the same question asked twice: `SP=/tmp/…/scratchpad; rm -f "$SP/x.log"` is a scratch delete and the
// guard could not see it — 52 of the 53 quoted-rm rows in a live decision log are exactly that shape, and
// the identical UNQUOTED spelling was already asking. This is EVIDENCE, never a hint: the value comes from
// the command's own text, so `R=/home/…/orbweaver; rm -rf "$R"` still asks, and a variable the command does
// not assign stays unresolved and therefore unsafe. A blanket "$ means scratch" rule was rejected outright
// — it would wave `rm -rf "$REPO"` through.
const ASSIGN_HEAD = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/;
// …and the EXPORT half of the same question (#1946, childEnvVars): which names reach a CHILD's environment.
const EXPORT_CLAUSE = /^\s*export\s/;
const EXPORT_NAME_WORD = /^([A-Za-z_][A-Za-z0-9_]*)(?:=|$)/;
// A shell WORD that is an assignment, split — the value keeps its spaces (`CMD="git stash"` is one word).
const ASSIGN_WORD_SPLIT = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/;
const VAR_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;
// A value that still carries an expansion after substitution is NOT recorded: `SP=$(mktemp -d)` tells the
// guard nothing about where SP points, and a half-resolved string must never be able to match a safe hint.
const UNRESOLVED_VALUE = /[$`]/;
// `$VAR` is safe (the rewrite copies text verbatim, the shell expands identically); `$(`/backticks/
// parens/bare-& are not (subshells, grouping, backgrounding). fd-merges (2>&1) are stripped first.
const UNSAFE_STAGE0 = /[<>()`&]/;
const UNSAFE_READER = /[<()`&]/;
const ENV_KILL = /^(?:off|0|false)$/i;

// ── script-body inspection (the wrapper hole) ──
// Cheap per-stage pre-filter: a shell name at a word boundary, a `.sh` operand, or a `.`/`source` head
// (#634 — sourcing runs the file in the CURRENT shell, which is the same power as `bash <file>`).
// Everything below only runs for a stage that passes this.
// The shell arm ends at `(?:\s|$)`, not `\s`: a PIPE SINK is a stage whose whole text is the shell name
// (`cat f | bash`), so a required trailing space skipped the exact shape #634 is about.
// `eval` joined the hint 2026-09-11 (#1943 F4): `eval "git stash"` takes its PROGRAM from an operand just
// like `bash -c` does, and the quoted operand was blanked before any rule could see it — the control
// `eval git stash` denied only because an UNQUOTED one is still visible in the blanked text.
const SCRIPT_STAGE_HINT = /(?:^|[\s/])(?:sh|bash|zsh|ksh|dash)(?:\s|$)|\.sh(?:\s|$)|^\s*(?:\.|source)\s|(?:^|\s)eval\s/;
// `.`/`source` as a stage's COMMAND WORD. Never a path argument: the head is found at the exec-head
// position, so `find . -name x`, `biome check . --write` and `grep . --exclude-dir=y` are not this
// (measured: a raw-regex count of "dot-source" said 2,367 on the 135,505-command corpus and the
// exec-head count says 325 — the rest were a bare `.` PATH followed by a flag).
const SOURCE_EXEC = /^(?:\.|source)$/;
// A process substitution `<( … )` hands the interpreter a program built by ANOTHER command's stdout —
// unknowable by construction, so it is an `ask` rather than a resolvable path.
const PROCESS_SUBSTITUTION = /^<\(/;
// A stdin redirect naming a FILE (`bash < run.sh`, `sh 0< run.sh`) — the operand channel the resolver
// cannot see, because a redirect word is deliberately skipped when hunting the file operand.
const STDIN_FILE_REDIRECT = /(?:^|\s)0?<\s*([^\s<>&|;()]+)/;
// A write redirect and its target: `> f`, `>> f`, `2> f` (attached or separate word). `>&1`-style fd
// merges are excluded — they name a descriptor, not a file.
const WRITE_REDIRECT_ATTACHED = /^&?\d*(?:>>|>)(?!&)(.+)$/;
const WRITE_REDIRECT_OPERATOR = /^&?\d*(?:>>|>)$/;
const TEE_HEAD = /^(?:\S*\/)?tee$/;
const CAT_HEAD = /^(?:\S*\/)?cat$/;
// Writers whose OUTPUT is visible in the command text itself, so what lands in the file can be classified
// instead of refused. Everything else that writes a file the same command then runs is unknowable ⇒ ask.
const LITERAL_WRITER_HEAD = /^(?:\S*\/)?(?:printf|echo)$/;
const SCRIPT_SHELL_EXEC = /^(?:\S*\/)?(?:sh|bash|zsh|ksh|dash)$/;
// `-c` (alone or combined, e.g. `-xc`) means the operand is an inline command STRING, not a file — there
// is no body to READ, so the stage is not a script invocation. `--norc`-style long flags are not this
// (single dash only). The string itself is classified by the nested-command pass below, which is the same
// defect class one layer down: visibility, not rule weakness.
const SCRIPT_INLINE_C_FLAG_ARG = /^-[a-zA-Z]*c[a-zA-Z]*$/;
// `-s` is NOT the same thing and was treated as if it were (#634): it means READ THE PROGRAM FROM STDIN,
// so `sh -s < f` and `cat f | bash -s` are channels, not inline strings — and the nested pass never
// extracted them either (it only reads `-c` operands), so the stage was silently dropped by both. It also
// means any following non-flag word is the script's $0/argv, never the program, which is why hitting `-s`
// stops the operand hunt rather than continuing it.
const SCRIPT_STDIN_FLAG = /^-[a-zA-Z]*s[a-zA-Z]*$/;
// The operand must resolve LITERALLY. Quoting is stripped and `$VAR`/`${VAR}` are expanded from the
// command's OWN assignments first (shellWords + assignedVars); what survives that may still be unknowable —
// an unassigned variable, a substitution, a glob. Those NO LONGER skip silently: an unresolvable operand is
// an `ask`, because the guard cannot see what will execute (#631). A resolvable path that does not EXIST
// still fails open — that command dies in the shell with ENOENT, so there is nothing to judge.
const SCRIPT_UNRESOLVED = /[$`*?[]/;
// A redirect word is never the file operand: `bash < run.sh`, `bash x.sh > log`, `bash x.sh 2>&1`,
// `bash x.sh <<EOF`. The operator-only form (`>` / `2>` / `<`) also consumes the word after it (its target).
const REDIRECT_WORD = /^&?\d*(?:>>|>|<<|<)/;
const REDIRECT_OPERATOR_ONLY = /^&?\d*(?:>>|>|<<|<)&?\d*$/;
// `~/x.sh` is the same file as `$HOME/x.sh`; expanding it keeps a routine spelling out of the ask above.
const HOME_PREFIX = /^~(?=\/)/;
// …and `$HOME`/`${HOME}` is the same variable spelled the long way (see resolveScriptOperand).
const HOME_VAR = /^\$\{?HOME\}?(?=\/)/;
const HOME_DIR = process.env.HOME ?? null;
// (the wrapper vocabulary that used to be duplicated here as SCRIPT_WRAPPER_TOKEN/SCRIPT_WRAPPER_ARG is
//  COMMAND_WRAPPERS + wrapperPrefixEnd, up in the vocab section — one home, four detectors; #1946)
const SCRIPT_MAX_BYTES = 64 * 1024;
// Depth of the OUTER command is 1; a body classified from it runs at 2, a body reached from THAT at 3 ==
// the cap, where a further script invocation is `ask` instead of another read. So: two levels of body are
// ever read, and the fence still exists — it is one level further out.
//
// MOVED FROM 2 TO 3 (2026-08-24, with the #634 channel work, and for the reason NESTED_DEPTH_CAP moved
// from 2 to 6): the corpus decides where a runaway fence sits, and at 2 it had become a cry-wolf. Once
// `. <file>` counts as an interpreter target — it must, or a hostile body just spells its second level
// with a dot — the single most common wrapper idiom on this box (`source …/orbweaver/.env` inside a
// scratchpad launcher) sat exactly AT the cap: 21 of 135,586 corpus commands flipped to
// `ask/script-depth-cap` purely for sourcing the repo's own env file, which for a LANE is a deny. The
// guard could READ that file; it was refusing by budget, not by inability, and a refusal on the
// sanctioned way of doing a job is what teaches agents to route around the hook. Cost of the extra level
// is one stat + one `git ls-files` + one bounded read per nested target.
const SCRIPT_DEPTH_CAP = 3;
const SCRIPT_LINE_MAX = 160;

// ── nested commands: a command inside a QUOTED string is still a command ──
// The same visibility class as the wrapper-script hole, one layer down. Two shapes:
//   · `sh -c '<string>'` — the operand IS a command, and quote-blanking erases it before any rule can see
//     it (73 sightings in one day's decision log; `bash -c "git stash"` classified clean).
//   · `$( … )` / backticks — a substitution EXECUTES, including inside double quotes, where blanking again
//     erases it. Head-anchored rules (`rm -rf …`, the harness heads) are blind to an UNQUOTED one too,
//     since the substitution is not at the head of the stage.
// ASYMMETRY, deliberate: inside SINGLE quotes `'$(x)'` is literal TEXT, never executed, and is NOT
// extracted — classifying it would be a false tighten on a string nobody runs. That is the whole reason
// this pass reads quoteSpans instead of just scanning for `$(`.
// The extracted text runs through this same `classify` and merges strictest-wins, so a nested command can
// only ever make the outer one STRICTER.
const SHELL_INLINE_C_FLAG = /^-[a-zA-Z]*c[a-zA-Z]*$/; // `-s` alone reads the command from STDIN — nothing to extract
// `eval` is a shell BUILTIN whose operand is the program — the `-c` shape with the flag left off, and it
// was in no head list at all (#1943 F4). There is no file to read and no `-c` to find, so the operand is
// the word right after the head.
const EVAL_EXEC = /^eval$/;
// An operand that is NOTHING BUT variable references (`"$CMD"`, `"${PRE} ${POST}"`). This is the ONLY
// shape whose expansion is read, deliberately (#1943 F4): a variable-carried command is one the guard
// cannot see AT ALL, whereas expanding the `$VAR` inside `bash -c "echo $MSG"` would move TEXT into
// command position and invent denials (`MSG='git stash'; bash -c "echo $MSG"` echoes three words; it
// stashes nothing). Resolved from the command's OWN assignments, exactly like the script-path resolver;
// unresolvable ⇒ `ask`, because an operand the guard could not read must not pass as "no objection".
const VAR_ONLY_COMMAND = /^(?:\s*\$\{?[A-Za-z_][A-Za-z0-9_]*\}?)+\s*$/;
// The operand right after `-c`: single-quoted (literal), double-quoted (escapes resolved), or a bare word.
const INLINE_OPERAND = /^\s*(?:'([^']*)'|"((?:[^"\\]|\\.)*)"|([^\s'"|;&<>()]+))/;
const INLINE_DQ_ESCAPE = /\\(["\\$`])/g;
// Depth of the OUTER command is 0; a string extracted from it classifies at 1. At the cap the guard stops
// and SAYS so (`ask`) rather than waving an unread command through. Unlike the script-body cap this is a
// RUNAWAY FENCE, not a budget — extraction is pure string work and each level is strictly shorter, so
// reading one more level costs nothing. It is set well past real shapes: `$(dirname $(readlink -f $(which
// claude)))` is depth 3 and idiomatic, and a cap of 2 asked about it — measured on 121,984 corpus commands,
// where 4 benign commands hit the cap at 2 and ZERO reach 6. A hook that cries wolf gets disabled.
const NESTED_DEPTH_CAP = 6;
const SCRIPT_LINE_SCAN_MAX = 400;
const GIT_LS_TIMEOUT_MS = 2_000;
// the line locator re-classifies single lines; point the /proc scan at nothing so it stays O(1) there
const NO_PROC_ROOT = "/nonexistent-proc-root";
// deny > ask > allow(rewrite) > defer > pass. `defer` sits UNDER `allow` on purpose: it means "the guard
// did not judge the script body", which must never cancel a judgement the guard DID make (and a defer
// emitted at the hook boundary kills a subagent mid-turn — see the box at the top).
const DECISION_RANK = { deny: 4, ask: 3, allow: 2, defer: 1, pass: 0 };

const REWRITE_TIMEOUT_MS = 600_000;
const CMD_LOG_MAX = 240;
const STDIN_DEADLINE_MS = 2_500;

// ── teaching text (the entire user-visible surface of this hook — mechanism + number + exact fix) ──

const REASONS = {
  harnessPipedDeny:
    "Piping the harness loses its exit code (the pipeline reports tail/grep's status — a red run was reported green this way) AND hangs: playwright/vite/stack/vitest descendants inherit the pipe's write end, so the reader waits for an EOF that never comes (measured: `pnpm check` piped median 64.1s vs 2.3s unpiped, 28×). Run it bare — `pnpm check` — and read the auto-written artifacts: reports/verify.json + reports/verify/<stage>.log. Same for a harness inside `$( … )` (owner ruling: the substitution form stays denied — no safe grammar exists for it): `pnpm snap`/`pnpm test:scoped` run BARE with output redirected to a file, then the file is read in a SEPARATE command.",
  harnessSwallowed:
    "`|| true` (or `; true`) after a harness command erases the failure — the tool reports success even when the gate was red. Let it exit non-zero; the failure list is already in reports/verify.json / reports/test-report.json.",
  gitHookBypass:
    "This skips git hooks wholesale, not just the pre-commit `check`. The one sanctioned skip is `LEFTHOOK_EXCLUDE=check git commit …` / `LEFTHOOK_EXCLUDE=check git merge …` — it excludes only the `check` command and keeps the `commit-msg` contract (`scripts/commit-msg-check.sh`) enforced. `--no-verify`/`-n`, `-c core.hooksPath=…`, `git config core.hooksPath …` (setting it) and `LEFTHOOK=0`/`LEFTHOOK=false` all disable hooks entirely and are refused. Reading the key (`git config --get core.hooksPath`) or `--unset`-ing it stays allowed.",
  gitDestructive:
    "`git stash` / `git restore` / `git checkout <path>` / `git checkout-index -f` silently destroy uncommitted work, and this tree usually carries a large uncommitted surface (doctrine ban; near-zero legitimate sightings in 133k calls). Read an old version with `git show HEAD:<path>` (redirect it to write one: `git show HEAD:<path> > <path>`); undo a probe by `rm`-ing the throwaway file; protect a risky edit with `cp <f> <f>.bak` first, then `mv <f>.bak <f>` to revert. A GLOBAL OPTION does not exempt the spelling — `git -C <worktree> checkout -- <path>` destroys exactly as much as the bare form. In an ACTIVE MERGE, `checkout --ours/--theirs <path>` is refused the same way (it discards any hand-edit already in the worktree file): take one side with `git show MERGE_HEAD:<path> > <path>` (theirs) or `git show HEAD:<path> > <path>` (ours). Read-only inspection still passes: `git stash list` / `git stash show`, and `git restore --staged <path>` (index-only, no `--worktree`).",
  biomeWrite:
    "A whole-tree biome fix-all (`--write` with no explicit paths, or `.`; `pnpm lint:fix`) applies EVERY autofix including INFO-level ones that change behavior — the `/u` unicode-regex wave crashed server boot (doctrine ban). Scope it: name the paths and/or a single rule (`biome check --write --only=<rule> <paths>`), or fix ERROR-level diagnostics by hand.",
  cdWorktree:
    "The Bash cwd PERSISTS across calls — one `cd` into a lane worktree silently relocates every later command (this landed a main-session commit on a lane branch; 3,064 sightings in the corpus). Use `git -C /abs/path/to/worktree <cmd>` — no cd needed.",
  playwrightCt:
    "CT runs go through the sanctioned script: `pnpm test:ct <paths>` (= `cli.ts scoped-test ct`). Driving playwright directly skips everything that makes a CT run trustworthy on this box — the PER-INVOCATION build cache under .cache/ct (a shared cache replays errors that stopped existing, 'Identifier already declared'), the per-worktree exclusion lock that refuses a corrupting second runner (#1581: a racing runner reported failures in tests it never touched), the host-wide runner slots and the nice floor that protect the co-hosted homelab (#1835), and the CT config + flake reporter. Pass runner flags straight through: `pnpm test:ct tests/ui/x.ct.tsx --repeat-each=3` — and JOIN a flag to its value with `=` when the value contains a slash (`--output=reports/ct-out`, `-g='chat/composer'`), because the scoped runner reads a bare slash-bearing operand as a path claim and refuses the run.",
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
  heavyToolUnfloored: (tool, door) =>
    `\`${tool}\` run this way has NO HEAP FLOOR: measured on this box, a bare \`node\`/\`npx\` child gets heap_size_limit 4192 MiB and no NODE_OPTIONS, while anything spawned through pnpm gets 16480 (the workspace-wide --max-old-space-size=16384 in pnpm-workspace.yaml, which \`npx\` never carries). This is the whole tool family, not a pair of tools, and an OOM under that ceiling reads as a tool error nobody can distinguish from a real finding (a bare in-process ts-morph verb exit-134'd on this box). Use the floored door: ${door}. \`pnpm exec <tool> …\` also carries the floor when you genuinely need the tool's own CLI.`,
  workerOverCap: (asked, cap) =>
    `\`--workers=${asked}\` is above the fleet cap of ${cap}. The SHIPPED defaults ARE the shared-host values (tooling/concurrency-profile.json is their ONE home, #1835): this box co-hosts the homelab and runs up to three lanes per account, and per-run caps multiplying across lanes is exactly what put node_load1 at 105.8 on 24 cores. Pass NO worker flag — or pass one only to go LOWER. If you genuinely have the box to yourself, the switch is \`ORB_DEDICATED_BOX=1\` in the SHELL environment, which retunes every reader at once.`,
  rgReplaceMangle:
    "`rg -r`/`--replace` glued directly to another flag letter (e.g. `-rln`) is parsed by ripgrep as `-r` TAKING the glued letters as its REPLACEMENT VALUE — so the intended listing/count flag silently vanishes and the command REPLACES matched text instead of listing matches, with no error (four paid offenses this era). Spell it out: `-n`/`--files-with-matches`/`--count` for listing, or `-r 'text'`/`--replace='text'` (a SEPARATE token) when you actually mean a replacement.",
  scriptBody: (script, line, inner) =>
    `This runs the untracked script ${script}, and tool-guard read its CONTENTS — a wrapper file is not a shield, the rules judge what actually executes.${line === null ? "" : `\nThe line that decided it:\n    ${line}`}\n\n${inner}`,
  scriptProgram: (what, line, inner) =>
    `${what}, and tool-guard classified that program — the channel a program arrives through is not a shield, the rules judge what actually executes.${line === null ? "" : `\nThe line that decided it:\n    ${line}`}\n\n${inner}`,
  scriptOpaqueWriter: (target, writer) =>
    `This command WRITES ${target} and then RUNS it, and tool-guard cannot see what ${writer} will put there — so the body that executes is unreadable by construction, and reading the file from disk would judge bytes that are about to be overwritten. A PreToolUse \`allow\` bypasses the permission flow entirely, so "I did not look" must never read as "I have no objection". Write the file in one Bash call and run it in the NEXT one (the body is on disk by then and IS read), or inline the commands. A heredoc (\`cat > ${target} <<'EOF' … EOF\`) and a \`printf\`/\`echo\` literal are both read as written and need no split.`,
  scriptOpaqueStdin: (spelling) =>
    `This runs an interpreter whose PROGRAM arrives on stdin from \`${spelling.length > SCRIPT_LINE_MAX ? `${spelling.slice(0, SCRIPT_LINE_MAX)}…` : spelling}\` — it is not an operand, so there is no path for tool-guard to resolve and nothing it can read. Feed the interpreter a FILE it can name (\`bash <path>\`, or \`. <path>\`), or inline the commands: a program the guard cannot see must not be waved through, because \`allow\` is the end of the line (no permission prompt follows it).`,
  scriptTooLarge: (script, bytes) =>
    `${script} is ${bytes} bytes, past the ${SCRIPT_MAX_BYTES}-byte body-inspection cap, so tool-guard cannot see what it runs and will not wave it through blind. Split the wrapper, or run the commands directly.`,
  scriptUnresolvedOperand: (spelling) =>
    `This runs a script tool-guard could not IDENTIFY: the operand \`${spelling.length > SCRIPT_LINE_MAX ? `${spelling.slice(0, SCRIPT_LINE_MAX)}…` : spelling}\` still carries an expansion, a substitution or a glob after the command's own assignments were resolved, so the guard cannot read the body — and it will not wave an unreviewed body through blind. A PreToolUse \`allow\` bypasses the permission flow entirely, so "I did not look" must never read as "I have no objection" (#631: \`bash "$SP/run.sh"\` and \`bash "/abs/run.sh" arg\` both executed unread). Write the path literally, or assign it in THIS command — \`SP=/abs/dir; bash "$SP/run.sh"\` resolves and is read.`,
  scriptGroupedMissing: (file) =>
    `This runs a script from inside a GROUPED clause (\`( … )\` / \`{ … }\`) and the path tool-guard read — ${file} — does not exist, so it could not read the body. Inside a group that is not the harmless "the command would fail anyway" case it is everywhere else: a group character glued to the operand is exactly how a path comes out mis-parsed, which is how \`(bash /tmp/x.sh)\` ran unread while \`(bash /tmp/x.sh )\` was refused. Drop the parentheses (a lane backgrounds with \`setsid nohup … &\`, no group needed), or put a space before the closer, and the body IS read.`,
  scriptDepthCap: (script) =>
    `A wrapper script that invokes another wrapper script (${script}) — tool-guard reads ONE level of script body, so what this ultimately runs is unseen. Flatten it: invoke the inner script directly from your Bash call, or inline its commands.`,
  inlineUnresolvedOperand: (spelling) =>
    `This hands a shell (or \`eval\`) a command string that is nothing but a VARIABLE — \`${spelling}\` — and the command's own assignments do not pin it down, so tool-guard cannot see what will execute. It will not wave an unread command through: a PreToolUse \`allow\` bypasses the permission flow, so "I did not look" must never read as "I have no objection" (#631, the same law the script-path resolver obeys). Write the command literally, or assign it in THIS command — \`CMD='pnpm check'; bash -c "$CMD"\` resolves and IS read.`,
  nestedCommand: (kind, snippet, inner) =>
    `${NESTED_LABEL[kind]} — quoting is not a shield, tool-guard classifies what actually executes.\nThe command it decided on:\n    ${snippet}\n\n${inner}`,
  nestedDepthCap: (kind, snippet) =>
    `${NESTED_LABEL[kind]}, nested past the ${NESTED_DEPTH_CAP} levels of quoting tool-guard reads — so what this ultimately runs is unseen:\n    ${snippet}\nFlatten it: run the inner command directly, or put it in a scratchpad script (whose body IS read).`,
};

// what a nested command is, per extraction kind — one sentence, reused by the reason and the two contexts
const NESTED_LABEL = {
  inline: "This runs an inline command string (`sh -c '…'`), which tool-guard read",
  subst: "This runs a command substitution (`$( … )` / backticks — it executes even inside double quotes), which tool-guard read",
};

const CONTEXTS = {
  rewritePiped: (log) =>
    `tool-guard rewrote this command: piping the harness hangs (forked descendants hold the pipe's write end — measured 28×–55× wall-clock inflation, census 2026-08-03) and swallows its exit code. The harness now writes ${log}, your reader chain ran against that file, and the harness's REAL exit code is preserved. Full artifacts: reports/verify.json + reports/verify/<stage>.log (pnpm check) / reports/test-report.json (pnpm test).`,
  rewriteLongLived: (log) =>
    `tool-guard rewrote this command: git spawns credential/network children that hold a pipe open after the visible command finishes (census: \`git push … | tail\` hit the 120s tool timeout). Output went to ${log}, your reader ran against the file, and the real exit code is preserved.`,
  rewritePlaywright:
    "tool-guard routed this CT run through the sanctioned script (`pnpm test:ct <paths>`): driving playwright directly skips the per-invocation build cache, the exclusion lock that catches a racing sibling runner, the host-wide slot pool and the nice floor. Your runner flags were carried over verbatim.",
  sgDeprecated:
    "Use `ast-grep`. `sg` is deprecated upstream (the tool itself warns on --version), and /usr/bin/sg on this machine is a symlink to newgrp — it only resolves to ast-grep because ~/.cargo/bin happens to come first in PATH. Same CLI: `ast-grep run -p '<pattern>' -l ts <paths>` (run both -l ts AND -l tsx).",
  bareVitest:
    "Prefer `pnpm test:scoped <paths>` (the sanctioned scoped lane run — it verifies the paths actually collect a test, keeps the watchdog and carries the nice floor) or `pnpm test` (writes reports/test-report.json). A bare/npx vitest bypasses the workspace harness and its artifacts.",
  grepUnscoped:
    "`grep -r` from a broad root does NOT respect ignore files and every package has its own node_modules — add `--exclude-dir=node_modules` (and use `/usr/bin/grep -a`; the shell's `grep` is a ugrep wrapper that skips some .ts as binary). Better: the Grep tool, or ast-grep for structure.",
  sqliteLive:
    "sqlite3 against a live-looking DB: touching a WAL database while the stack is up can corrupt it (repo memory: sqlite3-wal-danger). Stop the stack first, or read through the /api/_debug endpoints instead.",
  gitAddAll:
    "`git add -A` / `git add .` stages everything — including sibling-lane debris and untracked scratch. Repo law is pathspec staging: `git add <paths>` and `git commit -- <paths>`. Check `git status --short` first.",
  rmRf: "`rm -rf` outside scratch/cache territory — double-check the target: uncommitted work here is unrecoverable, and git-based undo (stash/restore) is banned.",
  biomeWriteScoped:
    "Scoped `biome --write` — the sanctioned mechanical-migration form. Read the WHOLE diff before committing (INFO-level autofixes have changed behavior here before), and never widen it to the bare tree.",
  pushInFlight:
    "A `git push` is RUNNING on this box right now. The push window is not atomic: with a long pre-push hook, git re-reads the ref at transfer time, so a commit landed mid-window ships silently while the push's own summary line reports the stale range (measured incident, 2026-08-03). Hold this commit until the push returns, or verify afterwards exactly what landed on origin.",
  longLivedPipe:
    "A piped `git push/pull/fetch` can hang to the full 120s tool timeout — git's credential/network child holds the pipe open after the visible command finishes (measured in the census). Drop the pipe, or redirect to a file and read it.",
  // (playwrightPiped retired 2026-09-11 with rule 6's piped branch: a raw CT run is now rewritten into
  //  `pnpm test:ct`, which is a harness head, so a piped CT run is rule 4's redirect — not a bare notice.)
  cdWorktreeLaneCtx:
    "cd pins your cwd to that worktree for every later call, and your cwd can silently reset between calls — prefer absolute paths and `git -C <worktree>` so each command names its own ground.",
  scriptAdvisory: (script, note) => `From inside the untracked script ${script} (tool-guard classifies wrapper bodies, not just the command line): ${note}`,
  scriptRewriteHint: (script, note) =>
    `The untracked script ${script} contains a shape tool-guard would have REWRITTEN had you typed it directly — it cannot rewrite a file, so fix the script itself: ${note}`,
  nestedScanError: (err) =>
    `tool-guard could not read inside this command's quoted parts (${err}) — the command LINE was judged normally, but a \`sh -c '…'\` operand or a \`$( … )\` in it went unclassified. Worth reporting: this scan does not fail in normal use.`,
  nestedAdvisory: (kind, snippet, note) => `From inside ${NESTED_KIND_NOUN[kind]} \`${snippet}\` (tool-guard classifies quoted commands too): ${note}`,
  nestedRewriteHint: (kind, snippet, note) =>
    `${NESTED_KIND_NOUN[kind]} \`${snippet}\` contains a shape tool-guard would have REWRITTEN had you typed it directly — it cannot rewrite inside a quoted string, so spell it that way yourself: ${note}`,
};

const NESTED_KIND_NOUN = { inline: "the inline command string", subst: "the command substitution" };

// ── helpers ──

function stripFdMerges(text) {
  return text.replace(REDIRECT_FD_MERGE, "");
}

function laneName(text) {
  const m = text?.match(WORKTREE_PATH);
  return m ? m[1] : null;
}

/** Is this command a SOLE invocation of one of the guard's own validation tools (SELF_TOOL_PATHS)?
 *  Exempting one is safe for exactly one reason: such a command cannot execute anything but that tool, so
 *  a destructive-looking string in its argv is data, never a command. Every condition below defends that
 *  reason — one clause, one pipeline stage, no subshell / backgrounding / command substitution, an
 *  UNQUOTED `node` (or the tool itself, via its shebang) at the head, and a script operand whose CANONICAL
 *  REALPATH is one of this checkout's own tools. A mention anywhere else — a trailing comment, a quoted
 *  argument, an earlier `&&` stage — is not an invocation and is judged by every rule (AGENT-TOOLING-01,
 *  2026-08-14). Neither is a LOOK-ALIKE: `node /tmp/.claude/hooks/tool-guard.mjs $(git stash)` satisfied
 *  the old path-SUFFIX test while running an attacker-placed file, which laundered a command straight
 *  through the control this exemption's own fix had just built (Codex reconciliation, 2026-08-14). */
export function isSelfToolInvocation(command, blank, clauses, ctx) {
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
  // A relative operand is resolved against the SHELL's cwd (the same base the script-body pass uses), then
  // canonicalized. `$VAR`-bearing paths cannot be resolved here and therefore never exempt — strict by
  // construction, and harmless: losing the exemption only means the command is judged by the normal rules.
  const base = ctx?.cwd ?? ctx?.projectDir ?? process.cwd();
  return SELF_TOOL_PATHS.has(canonicalPath(path.resolve(base, operand[0])));
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
  // The exit-code restore goes on its OWN LINE, never after a `;`. The reader chain and the suffix are
  // sliced from the ORIGINAL text, so either can end in a COMMENT (`pnpm check | tail -30 # note`) — and a
  // comment runs to end-of-line, which swallowed `; ( exit $__tg_ec )` whole. Measured 2026-08-14: the
  // rewritten command returned 0 for a harness that exited 3, i.e. the rewrite reintroduced the exact
  // red-reported-as-green failure this rule exists to prevent. A newline ends the comment; nothing else
  // about the template changes.
  return {
    log,
    command: `${prefix}${harness} > ${log} 2>&1; __tg_ec=$?; < ${log} ${readerChain}${suffix}\n( exit $__tg_ec )`,
  };
}

// The same four spellings, anchored at a clause head so the rewrite knows exactly what to replace. Its
// match LENGTH is now what the argument slice is taken from (see playwrightRewrite): the `cli.js` form
// carries no `playwright test` substring to search for, and a length-based slice is the one that reads the
// same for all four.
// THE WRAPPER GROUP IS THE SHARED VOCABULARY (2026-09-11, #1946) — it named `timeout N` alone, so an
// `env -C <wt> …` or `nice -n 19 …` raw CT run reached rule 6 and DENIED for want of a rewrite it should
// have got. Capturing the whole prefix carries it verbatim into the sanctioned call, which is how
// `env -C <wt> ./node_modules/.bin/playwright test <paths>` becomes `env -C <wt> pnpm test:ct <paths>` —
// the exact spelling .claude/skills/lane/SKILL.md prescribes. Always matches (possibly empty).
const PW_CLAUSE_HEAD = new RegExp(
  String.raw`^\s*(${WRAP_PREFIX})(?:(?:npx|pnpm(?:\s+exec)?)\s+)?(?:(?:\S*\/)?playwright|node\s+\S*@playwright\/test\/cli\.js)\s+test\b`,
);
// Playwright flags that take their value as a SEPARATE word. Load-bearing for the rewrite (#1943 F6): the
// rewritten `pnpm test:ct` runs `scoped-test`, whose preflight reads every non-flag operand carrying a `/`
// (or a test-file extension) as a PATH CLAIM (`_shared/scoped-run-paths.ts` isPathShaped) — so a forwarded
// `--output reports/ct-out` or `-g chat/composer` turns a run that would have worked into exit 3
// (UNRESOLVED) or exit 2 (BARREN). The `=`-joined spelling starts with `-` and is never read as a claim,
// which is why the refusal names it instead of the rewrite silently mangling the run. An INCOMPLETE list
// fails toward today's behaviour (forward it), never toward a false refusal.
const PW_VALUE_FLAGS = new Set([
  "-g",
  "--grep",
  "--grep-invert",
  "--output",
  "--reporter",
  "--project",
  "--trace",
  "--workers",
  "-j",
  "--retries",
  "--repeat-each",
  "--timeout",
  "--global-timeout",
  "--max-failures",
  "--shard",
  "--config",
  "-c",
]);
const PW_PATH_SHAPED = /^[^-].*(?:\/|\.[cm]?[jt]sx?$)/u;

/** Rebuild a raw CT invocation into the sanctioned script call (`pnpm test:ct <args>`), or null if too
 *  complex. Prefix clauses (a `cd <repo>` etc.) are kept verbatim; the playwright clause must be LAST,
 *  unpiped, and shaped exactly `[timeout N] [npx|pnpm exec] playwright test …` (the timeout wrapper is
 *  preserved). The `-c/--config` flag is dropped because the script owns the config.
 *  2026-09-11: the target was `rm -rf <root>/playwright/.cache && npx playwright test -c
 *  <root>/playwright-ct.config.ts …`. Both halves went stale at once — the CT build cache is now minted
 *  per invocation under `.cache/ct/build-<id>` (ct-runner-lock.ts §1), so clearing `playwright/.cache`
 *  cleans a directory nothing reads, and the raw runner takes neither the exclusion lock nor a host-wide
 *  slot. The old recipe is therefore no longer a PASS either: it is rewritten like any other raw run,
 *  which is why the cache-clear early-bail that used to sit here is gone. */
function playwrightRewrite(command, blank, clauses) {
  if (blank.includes("||")) {
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
  const args = original
    .slice(head[0].length)
    .replace(/(?:^|\s)(?:-c|--config)(?:=\S+|\s+\S+)/g, " ")
    .trim();
  // A space-form flag VALUE that looks like a path would be read by `scoped-test`'s preflight as a path
  // claim (see PW_VALUE_FLAGS): rewriting would hand the runner an operand that fails the run. Refuse with
  // advice instead — the `=`-joined spelling survives the rewrite untouched.
  const tokens = args.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.some((t, i) => PW_VALUE_FLAGS.has(t) && tokens[i + 1] !== undefined && PW_PATH_SHAPED.test(tokens[i + 1]))) {
    return null;
  }
  const prefix = command.slice(0, clause.start);
  const wrapper = head[1] ?? "";
  const joiner = prefix === "" || /\s$/.test(prefix) ? "" : " ";
  return `${prefix}${joiner}${wrapper}pnpm test:ct${args ? ` ${args}` : ""}`;
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
const SHELL_SINK_HEAD = /^\s*(?:\S*\/)?(?:sh|bash|zsh|dash|ksh)\b/;
// node as a pipe SINK executes STDIN as a program — bare `node`, `node -`, or node with only flags —
// byte-equivalent to `curl | sh` (owner ruling #47 replaced the old `node -e`-only spelling, which had
// it INVERTED: `-e`/`-p` run LOCAL, command-visible code and read stdin as DATA, while the bare forms
// run whatever the network sent). The threat this floor stops is NETWORK-authored code; an `-e` body
// that chooses to eval(stdin) is still LOCAL authorship — the same power any allowed script already
// has, and not this floor's business. Tokens are read off the RAW stage so a QUOTED script operand
// (`node "x.js"`) is seen as file execution rather than misread as a bare-node sink.
const NODE_SINK_HEAD = /^\s*(?:\S*\/)?node(?=\s|$)/;
const NODE_EVAL_FLAG = /^(['"]?)(?:-e|--eval|-p|--print)\1$/;
const NODE_EVAL_INLINE = /^(['"]?)--(?:eval|print)=.\S*\1$/;
function nodeStdinSink(rawStage) {
  const head = rawStage.match(NODE_SINK_HEAD);
  if (head === null) {
    return false;
  }
  const tokens = rawStage
    .slice(head[0].length)
    .split(/\s+/)
    .filter((t) => t.length > 0);
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (NODE_EVAL_INLINE.test(t)) {
      return false; // --eval=<code>: local code inline, stdin is data
    }
    if (NODE_EVAL_FLAG.test(t)) {
      return tokens[i + 1] === undefined; // -e/-p WITH an operand: data pipe; a dangling flag is still a sink
    }
    if (t === "-") {
      return true; // explicit read-the-program-from-stdin
    }
    if (!t.startsWith("-")) {
      return false; // a script operand (quoted included): file execution, the script-body pass's business
    }
  }
  return true; // bare node / flags only: stdin becomes the program
}

/** @returns {{decision: "deny"|"ask", rule: string, reason: string}|null} */
function detectHardFloor(blank, clauses, command) {
  for (const clause of clauses) {
    for (let i = 0; i < clause.stages.length; i += 1) {
      const stage = clause.stages[i];
      const text = blank.slice(stage.start, stage.end);
      if (SUDO_HEAD.test(text)) {
        return { decision: "ask", rule: "sudo", reason: REASONS.sudo };
      }
      // a network fetch feeding a shell — no legitimate sighting in a 133k-command corpus. The node
      // sink is judged on the RAW stage (quoted script operands must read as file execution, #47).
      const next = clause.stages[i + 1];
      if (
        NET_FETCH_HEAD.test(text) &&
        next !== undefined &&
        (SHELL_SINK_HEAD.test(blank.slice(next.start, next.end)) || nodeStdinSink(command.slice(next.start, next.end)))
      ) {
        return { decision: "deny", rule: "net-pipe-shell", reason: REASONS.netPipeShell };
      }
    }
  }
  return null;
}

/** One shell WORD read from the RAW text at `from`: stops at the first UNQUOTED whitespace, and the quote
 *  characters themselves are dropped (`SP="/tmp/a b"` is one value, `/tmp/a b`). Returns the text and where
 *  it ended, so a caller can keep reading further assignments on the same stage. */
function readWord(command, from, end) {
  let value = "";
  let quote = null;
  let i = from;
  for (; i < end; i += 1) {
    const ch = command[i];
    if (quote === null && /\s/.test(ch)) {
      break;
    }
    if (quote === null && (ch === '"' || ch === "'")) {
      quote = ch;
    } else if (quote !== null && ch === quote && command[i - 1] !== "\\") {
      quote = null;
    } else {
      value += ch;
    }
  }
  return { value, end: i };
}

/** The variables this command assigns BEFORE offset `before`, as name → literal value. Assignments are
 *  located in the BLANKED text (so `echo "SP=/etc"` and a commented-out assignment are never read as one)
 *  and their VALUES in the raw, because a value is routinely quoted. Only the leading assignments of a
 *  clause count — that is where bash puts them, and anything else in the clause is a command, not a
 *  declaration. Later assignments overwrite earlier ones, matching the shell. A value that still contains
 *  `$` or a backtick after resolving what is already known is DROPPED, never half-resolved. */
export function assignedVars(command, blank, clauses, before) {
  const vars = new Map();
  for (const clause of clauses) {
    if (clause.start >= before) {
      break;
    }
    const [stage] = clause.stages;
    let at = stage.start;
    for (;;) {
      const head = blank.slice(at, stage.end).match(ASSIGN_HEAD);
      if (head === null || at + head[0].length > before) {
        break;
      }
      const read = readWord(command, at + head[0].length, stage.end);
      const value = expandAssigned(read.value, vars);
      if (UNRESOLVED_VALUE.test(value)) {
        vars.delete(head[1]); // an unknowable value must not leave a STALE one in place
      } else {
        vars.set(head[1], value);
      }
      at = read.end;
    }
  }
  return vars;
}

/** `$NAME` / `${NAME}` replaced from `vars`. An unknown name is left EXACTLY as written, so it stays in the
 *  string the safe-list is tested against and the target stays unsafe — the strict direction, and the
 *  reason this can only ever resolve what the command itself proved. */
export function expandAssigned(text, vars) {
  return text.replace(VAR_REF, (whole, braced, bare) => vars.get(braced ?? bare) ?? whole);
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
      const rm = text.match(RM_HEAD);
      if (rm) {
        // The head is found in the BLANKED text (so a quoted `rm -rf` in an echo argument is never one) and
        // covers the COMMAND WORD only; flags and targets are then read off the RAW command, which is the
        // only place a quoted one still exists. Split on whitespace with the quote characters left ON,
        // deliberately: joining a quoted span into one word would make `rm -rf /tmp/a "/tmp/b c"` — which
        // asks today on its `c"` token — start passing, and this rule may only ever tighten.
        const tokens = command
          .slice(stage.start + rm[0].length, stage.end)
          .split(/\s+/)
          .filter((t) => t.length > 0);
        // An `rm` carrying no RECURSIVE flag is not this rule (`rm one-file.txt` and `rm -f one-file.txt`
        // unlink a single named path — owner ruling #51): the flags are searched across ALL tokens rather
        // than required adjacent to the head, since `rm packages/x -rf` is the same deletion.
        if (tokens.some((t) => RM_RECURSIVE_TOKEN.test(t))) {
          const targets = tokens.filter((t) => !t.startsWith("-") && !RM_FLAG_TOKEN.test(t));
          // The map is built lazily — an `rm` head is rare, and this is the only rule that needs it.
          const vars = targets.length > 0 ? assignedVars(command, blank, clauses, stage.start) : null;
          if (targets.some((t) => !RM_SAFE_TARGET.test(vars === null ? t : expandAssigned(t, vars)))) {
            rmrf = true;
          }
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

// ── script bodies: a wrapper file is not a shield ──
// A lane's `bash /tmp/…/lane-run.sh` is ONE opaque line to every rule above. These helpers give the
// classifier eyes on what that line actually executes. Order of cheapness is deliberate: a per-stage
// regex hint → token scan → path resolve → stat (size cap) → `git ls-files` (tracked = reviewed code,
// stop) → read → classify. Nothing spawns unless a stage really names a resolvable script file.

/** A GROUP OPENER is not part of the command it opens (2026-09-11). `(setsid nohup bash -c 'git stash' &)`
 *  tokenised as `(setsid` — neither a wrapper nor a shell — so the exec head was never found and the
 *  QUOTED COMMAND INSIDE IT WAS NEVER EXTRACTED: that exact spelling classified `pass/null` on HEAD while
 *  the identical `setsid nohup bash -c 'git stash' &` denied. A subshell is how a lane backgrounds work,
 *  so this was a live hole in the destroy-uncommitted ban, not a curiosity. Blanked to a SPACE, never
 *  removed: every index in this file points back into the original text. Only a WORD-INITIAL `(`/`{`
 *  counts, which is what keeps `$( … )` (handled by its own extraction pass) and `${VAR}` untouched. */
const GROUP_OPENER = /(^|\s)([({]+)/g;
// …AND NEITHER IS A CLOSER (2026-09-11, #1943 F2). The opener fix left the other end glued to the LAST
// word, so `(bash /tmp/x.sh)` passed while `(bash /tmp/x.sh )` denied — one character apart. In the
// BLANKED views this is what hid the stage from the cheap pre-filter and the exec head: `.sh)` fails
// SCRIPT_STAGE_HINT's `\.sh(?:\s|$)`, `bash)` fails its shell arm (the pipe-sink shape), and
// `execHead`'s token for `(/tmp/x.sh)` did not end in `.sh`. A closer run is blanked when what follows is
// whitespace, end, another separator, or a glued redirect (`)2>&1`) — never mid-word, so a path that
// genuinely contains `)` keeps it. Blanked, never removed: every index in this file points back into the
// original text. (A `)` that closes a `$( … )` is blanked here too; both consumers of this view look only
// for interpreter heads, and the substitution pass reads the RAW command.)
const GROUP_CLOSER = /[)}]+(?=[\s&;]|\d*[<>]|$)/g;

function ungroup(text) {
  return text.replace(GROUP_OPENER, (_m, pre, opener) => pre + " ".repeat(opener.length)).replace(GROUP_CLOSER, (m) => " ".repeat(m.length));
}

/** The same fix on the RAW side. `shellWords` treats `)` as an ordinary character, so the operand word of
 *  `(bash /tmp/x.sh)` is `/tmp/x.sh)` — which resolves, statSync's ENOENT, and returns the fail-open
 *  "the command would fail anyway" silence, i.e. the body is never read. Every operand this guard resolves
 *  goes through `resolveScriptOperand`, so the strip lives there and `commandWrites` keys its map by the
 *  same stripped path (the write-then-run pair `(printf … > w.sh); bash w.sh` needs both sides to agree).
 *  Stripped only when the VALUE ends in the same noise the RAW word does — a quoted `"/tmp/a)b"` ends its
 *  raw word with the QUOTE, so its `)` is part of the path and survives.
 *
 *  A CLOSER IS NOT REQUIRED, since #1946. The pattern used to be `[)}]+…`, i.e. a group closer had to come
 *  FIRST, so a BACKGROUNDING `&` glued to the operand was never stripped and `bash /tmp/x.sh&` — no
 *  subshell anywhere — resolved `/tmp/x.sh&`, ENOENT'd, and PASSED with the body unread. `(bash
 *  /tmp/x.sh&)` reached only the grouped `ask` for the same reason, one character from the `( … .sh &)`
 *  that denies. `&` is the single commonest thing a lane glues to a scratch script (it is how work is
 *  backgrounded), which made this the widest remaining hole in the destroy-uncommitted ban. Every
 *  alternative consumes at least one character, so the `+` cannot loop on an empty match, and none of the
 *  classes appears in an ordinary path — a word with no trailing noise does not match at all. */
const OPERAND_TAIL_NOISE = /(?:[)}]|[&;]|\d*>>?&?\d*|>+\S*)+$/;
// The opener half of the same word problem: `ungroup` blanks a word-initial `(` in the BLANKED view, which
// is what lets `execHead` find the head of `(/tmp/x.sh)` — but the RAW word is still `(/tmp/x.sh)`, and for
// a bare `.sh` head that word IS the operand.
const GROUP_OPENER_HEAD = /^[({]+/;

function stripOperandTail(word) {
  let { value, raw } = word;
  const opener = raw.match(GROUP_OPENER_HEAD);
  if (opener !== null && GROUP_OPENER_HEAD.test(value)) {
    raw = raw.slice(opener[0].length);
    value = value.replace(GROUP_OPENER_HEAD, "");
  }
  const rawTail = raw.match(OPERAND_TAIL_NOISE);
  const valueTail = value.match(OPERAND_TAIL_NOISE);
  if (rawTail === null || valueTail === null || raw[rawTail.index - 1] === "\\") {
    return { ...word, value, raw };
  }
  return { ...word, value: value.slice(0, valueTail.index), raw: raw.slice(0, rawTail.index) };
}

/** The executable token of a stage, read off the BLANKED text (so a shell name in a comment, a heredoc
 *  body or a quoted argument is never mistaken for one) with subshell openers and the whole WRAPPER PREFIX
 *  skipped — env assignments plus any stack of COMMAND_WRAPPERS and their own flags, through the one
 *  shared reader (`wrapperPrefixEnd`, #1946). Returns the token list too, so a caller can look at the
 *  flags that follow. */
function execHead(text) {
  const tokens = [...ungroup(text).matchAll(/\S+/g)];
  const index = wrapperPrefixEnd(tokens.map((t) => t[0]));
  return { tokens, index, exec: tokens[index] };
}

/** Raw text split into SHELL WORDS: quotes stripped and adjacent segments joined exactly as the shell joins
 *  `"a"b'c'` → `abc`, backslash escapes honoured outside single quotes. `value` is the argv entry the shell
 *  would build BEFORE expansion, `raw` is the text as written (so a redirect is still recognisable), `start`
 *  is the word's offset in `text`, and `unterminated` flags a quote that never closed.
 *
 *  WHY IT EXISTS (#631): an interpreter's operand is a PATH, and a path is the same file quoted or not. The
 *  operand used to be read off the BLANKED text, where a quoted path is a run of spaces — so `bash
 *  "$SP/run.sh"` resolved to NOTHING and `bash "/abs/run.sh" arg` resolved to the TRAILING ARGUMENT, and in
 *  both cases the guard returned a content verdict on a body it never opened. Reading the operand off the
 *  RAW stage is safe for the reason it always was: the exec head is still found in the
 *  BLANKED text, so a comment, a heredoc body or a quoted argument never conjures an invocation. */
export function shellWords(text) {
  const words = [];
  let cur = null;
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote === null && /\s/.test(ch)) {
      if (cur !== null) {
        words.push(cur);
        cur = null;
      }
      continue;
    }
    if (cur === null) {
      cur = { value: "", raw: "", start: i, unterminated: false };
    }
    if (quote !== "'" && ch === "\\" && i + 1 < text.length) {
      cur.raw += ch + text[i + 1];
      cur.value += text[i + 1];
      i += 1;
      continue;
    }
    cur.raw += ch;
    if (quote === null && (ch === '"' || ch === "'")) {
      quote = ch;
      continue;
    }
    if (ch === quote) {
      quote = null;
      continue;
    }
    cur.value += ch;
  }
  if (cur !== null) {
    cur.unterminated = quote !== null;
    words.push(cur);
  }
  return words;
}

/** The interpreter's FILE operand among the words after the exec head: `undefined` when there is none (a
 *  bare `bash` reads stdin), `null` when a leading `-c`/`-s` means the operand is an inline command STRING
 *  (no body to read — the nested-command pass judges it). Bash's own flags come first and the FIRST
 *  non-flag word is the script; everything after it is that SCRIPT's argv, which is exactly why a trailing
 *  argument must never be mistaken for the operand. Redirects are skipped wherever they sit. */
function shellFileOperand(words) {
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if (w === undefined) {
      continue;
    }
    if (REDIRECT_OPERATOR_ONLY.test(w.raw)) {
      i += 1; // `> log` / `< run.sh`: the next word is the redirect TARGET, not argv
      continue;
    }
    if (REDIRECT_WORD.test(w.raw)) {
      continue; // `>log`, `2>&1`, `<<EOF`
    }
    if (w.value.startsWith("-") && w.value !== "-" && w.value !== "--") {
      if (SCRIPT_INLINE_C_FLAG_ARG.test(w.value)) {
        return null; // `-c`: the operand is a command string, and the nested pass owns it
      }
      if (SCRIPT_STDIN_FLAG.test(w.value)) {
        return undefined; // `-s`: the program is on stdin — the caller's channel logic owns it
      }
      continue;
    }
    if (w.value === "--") {
      continue;
    }
    return w;
  }
  return undefined;
}

/** One operand word → the literal path it names, or `{path: null}` when the command itself does not pin it
 *  down. `$VAR`/`${VAR}` are expanded from the command's OWN assignments only (`assignedVars` — an unknown
 *  name is left as written, so it stays unresolvable), `~/` from `$HOME`. */
function resolveScriptOperand(rawWord, vars) {
  if (rawWord.unterminated) {
    return { path: null, spelling: rawWord.raw };
  }
  // A GROUP CLOSER OR A BACKGROUNDING `&` GLUED TO THE OPERAND IS NOT PART OF THE PATH (#1943 F2,
  // widened past the closer-first requirement by #1946) — see stripOperandTail.
  const word = stripOperandTail(rawWord);
  const expanded = expandAssigned(word.value, vars);
  // `$HOME`/`${HOME}` resolve exactly like the `~/` this already expanded — same variable, same value, and
  // the comment beside HOME_PREFIX has always SAID they are the same file. They were not: `. "$HOME/.cargo/
  // env"` was an `ask` for spelling a routine path the long way (1 corpus sighting, and the ask is a DENY
  // for a lane). `expandAssigned` runs first, so a command that assigns HOME itself still wins.
  const home = HOME_DIR === null ? expanded : expanded.replace(HOME_PREFIX, HOME_DIR).replace(HOME_VAR, HOME_DIR);
  return { path: home.length === 0 || SCRIPT_UNRESOLVED.test(home) ? null : home, spelling: word.raw };
}

/** The heredoc a stage owns, or null. The OPERATOR position decides (the body lives past the newline the
 *  clause split on, so it is not inside the stage's own range). */
function stageHeredoc(command, units, stage) {
  const unit = units.find((u) => u.opStart >= stage.start && u.opStart < stage.end);
  return unit === undefined ? null : command.slice(unit.bodyStart + 1, unit.bodyEnd);
}

/** Every FILE this command writes, as `resolved path → what will land there`. The value is the text when
 *  the command itself shows it (a heredoc body, a `printf`/`echo` literal) and null when it does not (a
 *  generator, a fetch, a copy). Only consulted for a path the SAME command also executes (#634): there the
 *  bytes on disk are stale or absent by construction, so they are the wrong thing to judge — 258 corpus
 *  commands write-and-run in one call, 246 of them the house's own `cat > x.sh <<'EOF' … EOF; bash x.sh`
 *  wrapper idiom, so refusing the SHAPE would wall the idiom while reading the DISK judges bytes that are
 *  about to be replaced. Order is deliberately not checked: a write anywhere in the command makes the
 *  file's disk content untrustworthy for this call. */
function commandWrites(command, blank, clauses, ctx) {
  const units = heredocUnits(command, blankComments(command, blankQuoted(command)));
  const writes = new Map();
  const base = ctx?.cwd ?? ctx?.projectDir ?? process.cwd();
  for (const clause of clauses) {
    for (const stage of clause.stages) {
      const words = shellWords(command.slice(stage.start, stage.end));
      const { exec } = execHead(blank.slice(stage.start, stage.end));
      const head = exec?.[0] ?? "";
      const heredoc = stageHeredoc(command, units, stage);
      const vars = assignedVars(command, blank, clauses, stage.start);
      const content = heredoc !== null ? heredoc : LITERAL_WRITER_HEAD.test(head) ? literalWriterText(words, vars) : null;
      const writer = heredoc !== null ? "a heredoc" : head.length === 0 ? "that stage" : `\`${head}\``;
      const record = (word) => {
        const resolved = resolveScriptOperand(word, vars);
        if (resolved.path !== null) {
          writes.set(path.resolve(base, resolved.path), { content, writer });
        }
      };
      for (let i = 0; i < words.length; i += 1) {
        const w = words[i];
        const attached = w.raw.match(WRITE_REDIRECT_ATTACHED);
        if (attached) {
          record({ ...w, value: attached[1], raw: attached[1] });
        } else if (WRITE_REDIRECT_OPERATOR.test(w.raw) && words[i + 1] !== undefined) {
          record(words[i + 1]);
          i += 1;
        }
      }
      if (TEE_HEAD.test(head)) {
        for (const w of words.slice(1)) {
          if (!w.value.startsWith("-") && !REDIRECT_WORD.test(w.raw)) {
            record(w);
          }
        }
      }
    }
  }
  return writes;
}

/** What a `printf`/`echo` stage puts on its stdout, as far as the command text shows it.
 *
 *  Two fidelity steps, both because the guard's rules are STRUCTURAL: `\n` is turned into a real newline
 *  (printf interprets it, and a literal backslash-n leaves the whole program as one line, where every
 *  head-anchored rule — the harness heads, `rm`, the CT recipe — silently stops matching), and `%s`
 *  directives are filled from the following operands, each resolved against the command's OWN assignments
 *  first (so `S=/tmp/x; printf '%s/run.sh' "$S" > f` names the real path, and an unknown name stays as
 *  written). Anything else is left as written: the aim is to hand `classify` the text that will land in
 *  the file, not to reimplement printf. */
function literalWriterText(words, vars) {
  const operands = words
    .slice(1)
    .filter((w) => !w.value.startsWith("-") && !REDIRECT_WORD.test(w.raw) && !WRITE_REDIRECT_ATTACHED.test(w.raw))
    .map((w) => expandAssigned(w.value, vars));
  const [format, ...args] = operands;
  if (format === undefined) {
    return "";
  }
  let i = 0;
  const filled = format.replace(/%s/g, () => args[i++] ?? "");
  const rest = args.slice(i);
  return [filled, ...rest].join(" ").replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
}

/** The programs a command would EXECUTE through an interpreter, one entry per pipeline stage. Three shapes:
 *    · `{path}`      — a file to read: `bash <path>` / `sh <path>` (leading env assignments and
 *                      timeout/nice/setsid/nohup/env/exec wrappers allowed, bash's own flags skipped, the
 *                      script's trailing args NOT mistaken for it), a bare `<path>.sh` head, `. <path>` /
 *                      `source <path>`, or `bash < <path>` (the stdin channel).
 *    · `{text}`      — a program that is IN the command: a heredoc fed to a shell.
 *    · `{path: null}`— "there is a program here and the guard cannot tell WHICH", which the caller turns
 *                      into an ask rather than silence.
 *  The executable is read off the BLANKED text; operands off the RAW words of the same stage.
 *
 *  THE CHANNEL IS NOT THE OPERAND (#634): an interpreter takes its program from an operand, from stdin
 *  (`bash < f`, `cat f | bash`), from a heredoc, or from the current shell (`. f`) — and the operand
 *  resolver saw only the first, so the rest reached execution unread. Corpus frequency of each closed
 *  here, over 135,505 calls: stdin-file 0, heredoc-to-shell 0, pipe-to-shell 0, dot-source 325. */
export function scriptTargets(command, blank, clauses) {
  const found = [];
  const units = heredocUnits(command, blankComments(command, blankQuoted(command)));
  for (const clause of clauses) {
    for (let si = 0; si < clause.stages.length; si += 1) {
      const stage = clause.stages[si];
      // ungrouped for the same reason as the inline pass: `(bash /tmp/lane.sh &)` runs that script
      const stageBlank = blank.slice(stage.start, stage.end);
      const text = ungroup(stageBlank);
      if (!SCRIPT_STAGE_HINT.test(text)) {
        continue;
      }
      // GROUPED (#1943 F2): this stage carried a `(`/`{`/`)`/`}` that had to be blanked before its head and
      // operand could be read. Recorded on every target the stage produces, because a MIS-PARSE in grouped
      // text presents as a path that does not exist — and ENOENT is the guard's fail-open silence.
      const grouped = text !== stageBlank;
      const push = (target) => found.push(grouped ? { ...target, grouped: true } : target);
      const { exec } = execHead(text);
      if (exec === undefined) {
        continue;
      }
      const isShell = SCRIPT_SHELL_EXEC.test(exec[0]);
      const isSource = SOURCE_EXEC.test(exec[0]);
      if (!isShell && !isSource && !exec[0].endsWith(".sh")) {
        continue;
      }
      const raw = command.slice(stage.start, stage.end);
      const words = shellWords(raw);
      const head = words.findIndex((w) => w.start <= exec.index && exec.index < w.start + w.raw.length);
      if (head === -1) {
        // Structurally unreachable (a token found in the blanked text has non-space raw at that index, so
        // some word covers it) — but if the two views ever disagree, the guard has NOT identified what runs.
        push({ path: null, spelling: text.trim() });
        continue;
      }
      const vars = assignedVars(command, blank, clauses, stage.start);
      // `.`/`source` runs the file in the CURRENT shell — same power as `bash <file>`, and its operand is
      // the first non-flag word. A process substitution there is a program built by another command's
      // stdout: unknowable, so it asks.
      if (isSource) {
        // The FIRST non-flag word, read directly rather than through shellFileOperand: that helper skips
        // any word beginning with `<` as a redirect, which is exactly how `source <(grep … .env)` used to
        // slide past — the psub was skipped and grep's PATTERN was returned as the "path".
        const first = words.slice(head + 1).find((w) => !(w.value.startsWith("-") && w.value !== "-" && w.value !== "--"));
        if (first === undefined) {
          continue; // `source` with no operand: the shell errors out, nothing to judge
        }
        push(PROCESS_SUBSTITUTION.test(first.raw) ? { path: null, stdin: true, spelling: first.raw } : resolveScriptOperand(first, vars));
        continue;
      }
      const word = isShell ? shellFileOperand(words.slice(head + 1)) : words[head];
      // A process substitution IS the program when nothing else is (`bash <(gen)`): the interpreter reads a
      // pipe another command fills, so there is no path to resolve and no bytes to read.
      if (word === undefined && words.slice(head + 1).some((w) => PROCESS_SUBSTITUTION.test(w.raw))) {
        push({ path: null, stdin: true, spelling: text.trim() });
        continue;
      }
      if (word === null) {
        continue; // a `-c`/`-s` inline string the nested pass owns
      }
      if (word !== undefined) {
        push(resolveScriptOperand(word, vars));
        continue;
      }
      // No file operand: the interpreter's program arrives through a CHANNEL. Judge the channel, or say
      // the guard cannot see it — silence here is an `allow`, and nothing looks after that.
      const heredoc = stageHeredoc(command, units, stage);
      if (heredoc !== null) {
        push({ text: heredoc, label: "a heredoc" });
        continue;
      }
      const stdin = raw.match(STDIN_FILE_REDIRECT);
      if (stdin) {
        const target = words.find((w) => w.value === stdin[1] || w.raw === stdin[1]);
        push(target === undefined ? { path: null, spelling: stdin[1] } : resolveScriptOperand(target, vars));
        continue;
      }
      if (si > 0) {
        // A pipe SINK: the previous stage's stdout is the program. `cat <files>` names files that can be
        // read; anything else is a program the guard cannot see. (`curl … | sh` never reaches here — the
        // hard floor denies it first.)
        const prev = clause.stages[si - 1];
        const prevWords = shellWords(command.slice(prev.start, prev.end));
        const prevHead = execHead(blank.slice(prev.start, prev.end)).exec?.[0] ?? "";
        const files = CAT_HEAD.test(prevHead) ? prevWords.slice(1).filter((w) => !w.value.startsWith("-") && !REDIRECT_WORD.test(w.raw)) : [];
        if (files.length > 0) {
          for (const f of files) {
            push(resolveScriptOperand(f, assignedVars(command, blank, clauses, prev.start)));
          }
        } else {
          push({ path: null, stdin: true, spelling: blank.slice(prev.start, prev.end).trim() });
        }
      }
    }
  }
  return found;
}

/** A directory's repository IDENTITY: the canonical path of its `--git-common-dir`, or null when the
 *  directory is in no repository (or git failed). The COMMON dir — not `--show-toplevel` — because a lane
 *  WORKTREE has a toplevel of its own while sharing main's common dir, and a worktree's tracked scripts
 *  must keep reading as reviewed or every lane's helper wrappers start getting refused. Git prints this
 *  relative to the cwd inside an ordinary tree (`.git`, `../.git`) and absolute from a linked worktree
 *  (probed both ways, 2026-08-24), so it is resolved against `dir` before canonicalizing. Memoized: one
 *  hook process classifies at most a handful of paths, and `oneScriptVerdict` asks per target. */
const gitCommonDirCache = new Map();
function gitCommonDir(dir) {
  const cached = gitCommonDirCache.get(dir);
  if (cached !== undefined) {
    return cached;
  }
  let value = null;
  try {
    const r = spawnSync("git", ["-C", dir, "rev-parse", "--git-common-dir"], {
      encoding: "utf8",
      timeout: GIT_LS_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const out = r.status === 0 && typeof r.stdout === "string" ? r.stdout.trim() : "";
    value = out.length === 0 ? null : canonicalPath(path.resolve(dir, out));
  } catch {
    value = null;
  }
  gitCommonDirCache.set(dir, value);
  return value;
}

/** THIS PROJECT's repository identity, resolved lazily from the checkout the hook itself lives in (so it
 *  cannot be spoofed by the command's cwd, and so a command with no script target never pays the spawn).
 *  `undefined` = not computed yet; `null` = unknowable, which makes NOTHING reviewed. */
let projectRepoIdentityCache;
function projectRepoIdentity() {
  if (projectRepoIdentityCache === undefined) {
    projectRepoIdentityCache = SELF_CHECKOUT === null ? null : gitCommonDir(SELF_CHECKOUT);
  }
  return projectRepoIdentityCache;
}

/** Is this path a file THIS PROJECT's git tracks? Tracked scripts are reviewed code and pass through to the
 *  normal rules — classifying their bodies would re-lint the repository on every call.
 *
 *  THE REPOSITORY IS PINNED (#633, 2026-08-24). This used to ask `git ls-files` in the FILE'S OWN
 *  directory, so ANY repository answered — and "reviewed" was therefore forgeable in two commands:
 *  `git init /tmp/w; git -C /tmp/w add evil.sh` flipped the identical body from `deny/script:git-destructive`
 *  to `pass/null`, i.e. an attacker- or agent-created directory turned the guard off for the file inside it
 *  (the same class as AGENT-TOOLING-01, and it fails OPEN: a PreToolUse `allow` bypasses the permission
 *  flow, so nothing else looks either). Tracked-ness now means tracked in the repository THIS HOOK belongs
 *  to, compared by `--git-common-dir` so every registered worktree of it still counts (a lane's
 *  `.claude/worktrees/<lane>/…` tracked wrapper is reviewed code exactly like main's).
 *
 *  Fails toward UNTRACKED (read the body) on any git error, a foreign repository, or an unknowable project
 *  identity: the strict direction, and reading a body blocks nothing by itself — a clean body still passes.
 *  ASSUMPTION, stated so it can be challenged: tracked ⇒ reviewed. A tracked script with UNCOMMITTED local
 *  edits is still passed through — index membership is a read-only one-call test (`ls-files`), while
 *  dirty-detection needs `git status`, which refreshes (writes) the index and would contend for the lock
 *  on every Bash call across a multi-lane box. The edit itself is visible in `git status` at merge. */
function isTrackedScript(file) {
  const project = projectRepoIdentity();
  if (project === null) {
    return false;
  }
  const dir = path.dirname(file);
  if (gitCommonDir(dir) !== project) {
    return false; // no repository, or somebody else's — never this project's reviewed code
  }
  try {
    const r = spawnSync("git", ["-C", dir, "ls-files", "--error-unmatch", "--", file], {
      encoding: "utf8",
      timeout: GIT_LS_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

/** Which line of the body earned the verdict — quoted back so the agent can fix the script instead of
 *  guessing. Re-classifies single lines at the SAME depth the body ran at (so a nested-script line
 *  reproduces its depth-cap ask), with the /proc scan disabled and the scan bounded. */
function offendingLine(body, rule, ctx, depth) {
  const lines = body.split("\n").slice(0, SCRIPT_LINE_SCAN_MAX);
  const lineCtx = { ...ctx, scriptDepth: depth + 1, procRoot: NO_PROC_ROOT };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    try {
      if (classify(line, lineCtx).rule === rule) {
        return trimmed.length > SCRIPT_LINE_MAX ? `${trimmed.slice(0, SCRIPT_LINE_MAX)}…` : trimmed;
      }
    } catch {
      // a line the classifier chokes on is not the quote we are hunting — keep scanning
    }
  }
  return null;
}

/** Turn a body's own classification into a verdict about the OUTER command. A deny/ask carries through
 *  (rule prefixed `script:` so triage can tell body-sourced verdicts from typed ones); a rewrite becomes
 *  a teaching context, because the guard can rewrite a command and not a file; advisories carry through
 *  attributed. */
function liftScriptVerdict(script, body, inner, ctx, depth, describe) {
  if (inner.decision === "deny" || inner.decision === "ask") {
    const line = offendingLine(body, inner.rule, ctx, depth);
    return {
      decision: inner.decision,
      rule: `script:${inner.rule}`,
      reason: describe === undefined ? REASONS.scriptBody(script, line, inner.reason ?? "") : REASONS.scriptProgram(describe, line, inner.reason ?? ""),
      contexts: [],
    };
  }
  if (inner.decision === "defer") {
    return { decision: "defer", rule: `script:${inner.rule}`, contexts: [] };
  }
  const notes = inner.contexts.map((c) => CONTEXTS.scriptAdvisory(script, c));
  if (inner.decision === "allow" && inner.rewrite) {
    notes.unshift(CONTEXTS.scriptRewriteHint(script, inner.contexts[0] ?? inner.rule));
  }
  return { decision: "pass", rule: null, contexts: notes };
}

/** A program the command text itself carries — a heredoc fed to a shell, or the content a `printf`/heredoc
 *  writes into a file this same command runs. There is no disk read and no tracked-ness question: what
 *  executes is right here, so it is classified directly (bounded by the same depth and size fences). */
function textProgramVerdict(describe, text, ctx, depth) {
  if (depth >= SCRIPT_DEPTH_CAP) {
    return { decision: "ask", rule: "script-depth-cap", reason: REASONS.scriptDepthCap(describe), contexts: [] };
  }
  if (text.length > SCRIPT_MAX_BYTES) {
    return { decision: "ask", rule: "script-too-large", reason: REASONS.scriptTooLarge(describe, text.length), contexts: [] };
  }
  if (text.trim().length === 0) {
    return null; // an empty program does nothing
  }
  return liftScriptVerdict(describe, text, classify(text, { ...ctx, scriptDepth: depth + 1 }), ctx, depth, describe);
}

/** @returns {{decision: string, rule: string|null, reason?: string, contexts: string[]}|null} */
function oneScriptVerdict(operand, ctx, depth, writes, grouped = false) {
  const base = path.isAbsolute(operand) ? "/" : (ctx.cwd ?? ctx.projectDir ?? process.cwd());
  const file = path.resolve(base, operand);
  // WRITTEN BY THIS COMMAND (#634) — judge what will LAND there, never what is on disk. `printf '…' > x.sh;
  // bash x.sh` passed clean because the file did not exist yet at classify time, and the re-run case is
  // worse: the guard reads the PREVIOUS body and the command then overwrites it. When the writer's output
  // is not visible in the command text there is nothing to read at all, so it asks.
  const written = writes?.get(file);
  if (written !== undefined) {
    return written.content === null
      ? { decision: "ask", rule: "script-written-opaque", reason: REASONS.scriptOpaqueWriter(file, written.writer), contexts: [] }
      : textProgramVerdict(`This command WRITES ${file} and then RUNS it`, written.content, ctx, depth);
  }
  let body;
  try {
    const stat = statSync(file);
    if (!stat.isFile()) {
      return null;
    }
    // TRACKED FIRST, THEN THE SIZE CAP (#617). These two were the other way round, so a TRACKED file big
    // enough to clear the cap was refused for its SIZE — a limit that reads as a policy refusal on
    // reviewed code. Measured: `bash <tests/tooling/check-gates.int.test.ts>` (99,797 bytes, tracked) →
    // ask script-too-large, while the same spelling on a SMALL tracked file passes silently. The cap
    // exists so the guard never waves through an UNREVIEWED body it could not read; a tracked file is
    // reviewed by definition and is skipped whatever its size, so asking about it teaches a lane that the
    // sanctioned spelling is refused and pushes it onto an unniced ad-hoc one.
    if (isTrackedScript(file)) {
      return null; // reviewed code — the normal rules judge the command line, nothing more
    }
    if (stat.size > SCRIPT_MAX_BYTES) {
      return { decision: "ask", rule: "script-too-large", reason: REASONS.scriptTooLarge(file, stat.size), contexts: [] };
    }
    // Past the read depth: there IS an unreviewed body here and the guard is choosing not to open it, so
    // say so rather than wave it through. Reached only for a resolvable, untracked, readable file — a
    // wrapper ending in `exec bash scripts/dev/stack.sh` (tracked) is not this, and must not be asked
    // about (25 such corpus commands were false-positive asks before this guard clause).
    if (depth >= SCRIPT_DEPTH_CAP) {
      return { decision: "ask", rule: "script-depth-cap", reason: REASONS.scriptDepthCap(file), contexts: [] };
    }
    body = readFileSync(file, "utf8");
  } catch {
    // missing / unreadable / a directory: the command would fail anyway, so the guard has nothing to
    // judge and says so by staying silent (fail-open — the guard breaking must never block work).
    //
    // …EXCEPT FROM A GROUPED CLAUSE (2026-09-11, #1943 F2). The fail-open ruling SURVIVES — its INPUT
    // changed: it assumes the path the guard resolved is the path the SHELL will run, and inside a
    // `( … )`/`{ … }` that assumption is exactly what failed. `(bash /tmp/x.sh)` resolved to `/tmp/x.sh)`,
    // which cannot exist, so ENOENT was not "the command dies anyway" — it was a mis-parse wearing that
    // answer's clothes, and the body went unread for a whole era one character away from a deny. The
    // stripping above is the real fix; this arm is the honesty backstop for the next glued character
    // nobody has thought of, and it obeys #631: a guard that cannot identify what will execute must not
    // return a content verdict (silence IS a content verdict now that pass means allow).
    return grouped ? { decision: "ask", rule: "script-grouped-unresolvable", reason: REASONS.scriptGroupedMissing(file), contexts: [] } : null;
  }
  return liftScriptVerdict(file, body, classify(body, { ...ctx, scriptDepth: depth + 1 }), ctx, depth);
}

/** One `scriptTargets` entry → its verdict. Three shapes, and the two that mean "the guard could not see
 *  the program" are `ask`, never silence: an `allow` is the end of the line (no permission prompt follows
 *  a PreToolUse allow), so "I did not look" must never read as "I have no objection". */
function oneTargetVerdict(target, ctx, depth, writes) {
  if (target.text !== undefined) {
    return textProgramVerdict(`This interpreter reads its program from ${target.label}`, target.text, ctx, depth);
  }
  if (target.path !== null) {
    return oneScriptVerdict(target.path, ctx, depth, writes, target.grouped === true);
  }
  return target.stdin === true
    ? { decision: "ask", rule: "script-opaque-stdin", reason: REASONS.scriptOpaqueStdin(target.spelling), contexts: [] }
    : { decision: "ask", rule: "script-unresolved-operand", reason: REASONS.scriptUnresolvedOperand(target.spelling), contexts: [] };
}

/** The pre-pass. Any UNEXPECTED throw becomes `defer` per the header's fail-open law — but `defer` ranks
 *  below every real judgement in mergeVerdicts, so it can only ever surface on a command nothing else
 *  objected to. */
function scriptBodyVerdict(command, blank, clauses, ctx) {
  try {
    const depth = ctx.scriptDepth ?? 1;
    // `bash x.sh && bash x.sh` reads once; two DIFFERENT unresolvable spellings still ask separately.
    const targets = [
      ...new Map(scriptTargets(command, blank, clauses).map((t) => [t.text === undefined ? (t.path ?? ` ${t.spelling}`) : ` text:${t.text}`, t])).values(),
    ];
    if (targets.length === 0) {
      return null;
    }
    const writes = commandWrites(command, blank, clauses, ctx);
    let worst = null;
    for (const target of targets) {
      const verdict = oneTargetVerdict(target, ctx, depth, writes);
      if (verdict === null) {
        continue;
      }
      worst =
        worst === null || DECISION_RANK[verdict.decision] > DECISION_RANK[worst.decision]
          ? { ...verdict, contexts: [...(worst?.contexts ?? []), ...verdict.contexts] }
          : { ...worst, contexts: [...worst.contexts, ...verdict.contexts] };
    }
    return worst;
  } catch (err) {
    // FAIL CLOSED, LEGIBLY (owner ruling #50): a scan failure must never become allow, and a bare
    // defer stalls the lane with NOTHING on screen to act on. Surface an ask that names the failure —
    // recoverable by the operator (fix the file / confirm the command), never a silent stall. The
    // error still lands in the decision log for the repair loop.
    return {
      decision: "ask",
      rule: "script-scan-error",
      contexts: [],
      error: String(err),
      reason: `tool-guard could not READ a script this command runs (${String(err).slice(0, 160)}). Nothing else rejected the command — the guard is asking because it could not see the script body, not because a rule fired. If the path/permissions are right, confirm to proceed; recurring sightings of this message are a guard bug to report.`,
    };
  }
}

// ── nested commands: quoting is not a shield ──
// Same shape as the script-body pre-pass: EXTRACT what really executes, classify it through this same
// classifier, merge strictest-wins. The difference is only where the command hides — in a `-c` operand or
// a `$( … )`, both of which quote-blanking erased before any rule could see them.

/** What a CHILD PROCESS this command starts can see of its variables, as `{env, shellLocal}` (#1946).
 *  `env` = name → value for the names that actually REACH the child: an `export NAME[=…]` in an earlier
 *  clause (its value comes from `assignedVars`, whose ASSIGN_HEAD already reads the `export ` form), and
 *  the stage's OWN assignment prefix — `CMD=… bash -c …`, `env CMD=… bash …` — which bash places in that
 *  one command's environment and nowhere else. The prefix is walked with the shared wrapper reader, so it
 *  steps over `env`/`nice`/`timeout` exactly like every other head detector.
 *  `shellLocal` = the names this command assigns WITHOUT exporting. A child's `$NAME` is UNSET for those.
 *  Anything neither exported nor assigned here is in neither set, and stays unknowable on purpose — a
 *  `declare -x` or an ambient session export is invisible to this guard, so its names fall through to the
 *  `inline-unresolved-operand` ask rather than to a silent pass. */
function childEnvVars(command, blank, clauses, stage) {
  const assigned = assignedVars(command, blank, clauses, stage.start);
  const env = new Map();
  for (const clause of clauses) {
    if (clause.start >= stage.start) {
      break;
    }
    if (!EXPORT_CLAUSE.test(blank.slice(clause.start, clause.end))) {
      continue;
    }
    // `export A B`, `export CMD="…"` — names run until a word that is not one.
    for (const word of shellWords(command.slice(clause.start, clause.end)).slice(1)) {
      const name = word.value.match(EXPORT_NAME_WORD);
      if (name === null) {
        break;
      }
      const value = assigned.get(name[1]);
      if (value !== undefined) {
        env.set(name[1], value);
      }
    }
  }
  const words = shellWords(command.slice(stage.start, stage.end));
  for (const word of words.slice(0, wrapperPrefixEnd(words.map((w) => w.value)))) {
    const assign = word.value.match(ASSIGN_WORD_SPLIT);
    if (assign !== null) {
      env.set(assign[1], assign[2]);
    }
  }
  return { env, shellLocal: new Set([...assigned.keys()].filter((name) => !env.has(name))) };
}

/** The inline command strings a command would execute: the operand of a `sh -c` / `bash -c` stage. The
 *  exec head and the flag are read off the BLANKED text (a shell name in a comment or a heredoc body is
 *  never one), the operand off the RAW — it is quoted by construction, which is the entire gap. */
export function inlineShellCommands(command, blank, clauses) {
  const found = [];
  for (const clause of clauses) {
    for (const stage of clause.stages) {
      // ungrouped so a subshell-wrapped stage still shows its head — `(bash -c '…' &)` (see `ungroup`)
      const text = ungroup(blank.slice(stage.start, stage.end));
      if (!SCRIPT_STAGE_HINT.test(text)) {
        continue;
      }
      const { tokens, index, exec } = execHead(text);
      if (exec === undefined) {
        continue;
      }
      const isEval = EVAL_EXEC.test(exec[0]);
      if (!isEval && !SCRIPT_SHELL_EXEC.test(exec[0])) {
        continue;
      }
      // `eval`'s program is the word right after the head; a shell's is the word right after `-c`.
      const flag = isEval ? exec : tokens.slice(index + 1).find((t) => SHELL_INLINE_C_FLAG.test(t[0]));
      if (flag === undefined) {
        continue;
      }
      // bash takes the command string as the FIRST word after `-c`, whatever it looks like (`bash -c -x`
      // runs "-x"), so this reads the next word rather than skipping flags.
      const operand = command.slice(stage.start + flag.index + flag[0].length, stage.end).match(INLINE_OPERAND);
      const inner = operand === null ? null : (operand[1] ?? operand[2]?.replace(INLINE_DQ_ESCAPE, "$1") ?? operand[3]);
      // WHICH QUOTE held the operand — group 1 is the single-quoted arm, the one the parent shell does not
      // expand. Load-bearing for the var-only branch below, and for nothing else.
      const single = operand !== null && operand[1] !== undefined;
      if (inner === null || inner === undefined || inner.trim().length === 0) {
        continue;
      }
      if (!VAR_ONLY_COMMAND.test(inner)) {
        found.push({ inner });
        continue;
      }
      // A VAR-ONLY operand: the question is WHO EXPANDS IT, and the answer is the quoting (#1946).
      //   · `eval '$CMD'` re-parses in the SAME shell, so even a single-quoted `$CMD` expands from the
      //     shell's own variables. Unchanged: the command's assignments are the right source.
      //   · `bash -c "$CMD"` / `bash -c $CMD`: the PARENT expands before the child exists. Same source.
      //   · `bash -c '$CMD'`: the parent expands NOTHING. The child expands `$CMD` from its ENVIRONMENT,
      //     which carries only what this command EXPORTED — and a bare `CMD='git stash'` is shell-LOCAL,
      //     so the child's `$CMD` is unset and the command it runs is the EMPTY STRING. Resolving it from
      //     the parent's assignments made `CMD="git stash"; bash -c '$CMD'` a DENY: an over-refusal of a
      //     command that does nothing, and a guard that refuses inert commands is one lanes route around.
      //     The same read fixes the opposite error, because an assignment PREFIX (`CMD=… bash -c '$CMD'`)
      //     DOES reach the child and used to be a mere `inline-unresolved-operand` ask.
      const parentExpands = isEval || !single;
      const child = parentExpands ? null : childEnvVars(command, blank, clauses, stage);
      const resolved = expandAssigned(inner, parentExpands ? assignedVars(command, blank, clauses, stage.start) : child.env);
      if (!UNRESOLVED_VALUE.test(resolved) && resolved.trim().length > 0) {
        found.push({ inner: resolved });
        continue;
      }
      // Unresolvable. When EVERY name in it is one this command assigned but kept shell-local, that is not
      // "the guard could not see it" — the guard sees exactly what the child will: nothing. Contribute no
      // target rather than an ask, which for a lane is a deny. Any other unknown name stays an ask: a
      // variable this command never mentions may well be exported in the session, and `allow` bypasses the
      // permission flow, so "I did not look" must never read as "I have no objection".
      const names = [...inner.matchAll(VAR_REF)].map((m) => m[1] ?? m[2]);
      if (child !== null && names.length > 0 && names.every((n) => child.shellLocal.has(n))) {
        continue;
      }
      found.push({ unresolved: inner });
    }
  }
  return found;
}

/** The end index of a `$( … )` body that starts at `from`, by paren depth with quote tracking (a `)` inside
 *  quotes must not close it), or -1 when unbalanced.
 *
 *  ESCAPES ARE HONOURED HERE, unlike `blankQuoted` — which this walk used until leg 5 (2026-08-14) and
 *  which treats a `\"` as OPENING a quote (it only checks the backslash when CLOSING one). A substitution
 *  nested in double quotes must escape its own inner quotes, so `echo "$(rm -rf \"packages/server/src\")"`
 *  opened a phantom quoted span at the `\"`, swallowed the closing paren, returned -1, and the substitution
 *  was dropped from the extraction ENTIRELY — the inner `rm -rf` was classified as nothing at all. A
 *  self-contained walk is also the honest one: `blankQuoted`'s job is to blank spans for the RULE regexes,
 *  not to parse shell escapes, and changing it would touch every rule in the file. Direction of the fix is
 *  one-way: a substitution that used to be invisible is now handed to `classify`, which can only make the
 *  outer verdict stricter. */
function substitutionEnd(command, from) {
  let depth = 0;
  let quote = null;
  for (let j = from; j < command.length; j += 1) {
    const ch = command[j];
    if (ch === "\\") {
      j += 1; // the next character is literal — including \" \) \` and \\
    } else if (quote !== null) {
      quote = ch === quote ? null : quote;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      if (depth === 0) {
        return j;
      }
      depth -= 1;
    }
  }
  return -1;
}

/** Every command substitution that would actually RUN: `$( … )` and backticks, unquoted or inside DOUBLE
 *  quotes. Inside SINGLE quotes it is literal text and is skipped — extracting it would be a false tighten
 *  on a string nobody executes. Comments and heredoc bodies are skipped for the same reason, and they need
 *  their own SPANS to detect: `ls # echo "$(git stash)"` puts the substitution inside a double-quoted span
 *  that is itself inside a comment, which the quote map alone reads as live (caught by this pass's own
 *  must-pass rows, 2026-08-14). Nested substitutions are not returned separately — the recursion through
 *  `classify` reaches them from the body it is handed. */
export function commandSubstitutions(command) {
  const quoted = blankQuoted(command);
  const text = [...commentSpans(command, quoted), ...heredocSpans(command, blankComments(command, quoted))];
  const spans = quoteSpans(command);
  const spanAt = (at) => spans.find((s) => at > s.start && at < s.end);
  const isText = (at) => text.some(([start, stop]) => at >= start && at < stop);
  const found = [];
  let i = 0;
  while (i < command.length) {
    const isDollar = command[i] === "$" && command[i + 1] === "(";
    if (!isDollar && command[i] !== "`") {
      i += 1;
      continue;
    }
    if (isText(i) || spanAt(i)?.quote === "'") {
      i += 1;
      continue;
    }
    const bodyStart = i + (isDollar ? 2 : 1);
    const end = isDollar ? substitutionEnd(command, bodyStart) : command.indexOf("`", bodyStart);
    if (end === -1) {
      i += 1;
      continue;
    }
    const body = command.slice(bodyStart, end);
    if (body.trim().length > 0) {
      found.push(body);
    }
    i = end + 1;
  }
  return found;
}

/** Turn a nested command's own classification into a verdict about the OUTER command — the same lift the
 *  script bodies get (deny/ask carry through with an `inline:`/`subst:`-prefixed rule so triage can tell
 *  where the verdict came from; a rewrite becomes a teaching context, because the guard can rewrite a
 *  command and not the inside of a quoted string). */
function liftNestedVerdict(kind, snippet, inner) {
  const quoted = snippet.length > SCRIPT_LINE_MAX ? `${snippet.slice(0, SCRIPT_LINE_MAX)}…` : snippet;
  if (inner.decision === "deny" || inner.decision === "ask") {
    return { decision: inner.decision, rule: `${kind}:${inner.rule}`, reason: REASONS.nestedCommand(kind, quoted, inner.reason ?? ""), contexts: [] };
  }
  if (inner.decision === "defer") {
    return { decision: "defer", rule: `${kind}:${inner.rule}`, contexts: [] };
  }
  const notes = inner.contexts.map((c) => CONTEXTS.nestedAdvisory(kind, quoted, c));
  if (inner.decision === "allow" && inner.rewrite) {
    notes.unshift(CONTEXTS.nestedRewriteHint(kind, quoted, inner.contexts[0] ?? inner.rule));
  }
  return { decision: "pass", rule: null, contexts: notes };
}

/** The pre-pass. Fail-open on any unexpected throw (`defer` ranks below every real judgement, so it can
 *  only surface on a command nothing else objected to). */
function nestedCommandVerdict(command, blank, clauses, ctx) {
  try {
    const depth = ctx.nestedDepth ?? 0;
    const targets = [
      // keyed so `bash -c X && bash -c X` reads once, while an unresolvable operand keys on its own
      // spelling (it has no readable text to key on)
      ...new Map(inlineShellCommands(command, blank, clauses).map((t) => [t.inner ?? ` ${t.unresolved}`, { kind: "inline", ...t }])).values(),
      ...new Set(commandSubstitutions(command)).values().map((inner) => ({ kind: "subst", inner })),
    ];
    if (targets.length === 0) {
      return null;
    }
    const first = targets[0];
    if (depth >= NESTED_DEPTH_CAP) {
      const snippet = (first.inner ?? first.unresolved).slice(0, SCRIPT_LINE_MAX);
      return { decision: "ask", rule: "nested-depth-cap", reason: REASONS.nestedDepthCap(first.kind, snippet), contexts: [] };
    }
    let worst = null;
    for (const { kind, inner, unresolved } of targets) {
      const verdict =
        unresolved === undefined
          ? liftNestedVerdict(kind, inner, classify(inner, { ...ctx, nestedDepth: depth + 1 }))
          : { decision: "ask", rule: "inline-unresolved-operand", reason: REASONS.inlineUnresolvedOperand(unresolved), contexts: [] };
      worst =
        worst === null || DECISION_RANK[verdict.decision] > DECISION_RANK[worst.decision]
          ? { ...verdict, contexts: [...(worst?.contexts ?? []), ...verdict.contexts] }
          : { ...worst, contexts: [...worst.contexts, ...verdict.contexts] };
    }
    return worst;
  } catch (err) {
    // FAIL-OPEN, and deliberately NOT `defer`: the command LINE was judged in full, only this extra scan
    // broke, and a defer at the hook boundary stalls a subagent mid-turn with no report (the nine-lane
    // failure in the header box). A visible advisory keeps the breakage findable without a stall.
    // NOTE, not changed here because it predates this pass and flipping it is an owner call: the script
    // -body pre-pass answers the same situation with `defer` (`script-scan-error`, above), which CAN
    // stall a lane on a command nothing objected to.
    return { decision: "pass", rule: null, contexts: [CONTEXTS.nestedScanError(String(err))] };
  }
}

/** Strictest-wins merge of the command-line verdict and a nested one (script body / quoted command),
 *  contexts unioned. */
function mergeVerdicts(outer, script) {
  if (script === null) {
    return outer;
  }
  const contexts = [...new Set([...outer.contexts, ...script.contexts])];
  const winner = DECISION_RANK[script.decision] > DECISION_RANK[outer.decision] ? script : outer;
  const merged = { ...winner, contexts };
  if (merged.decision === "pass") {
    merged.rule = outer.rule ?? (contexts.length > 0 ? "advisory" : null);
  }
  return merged;
}

/** The first stage that runs a heavy tool through a spelling with no heap floor, as `{tool, door}` — or
 *  null. Head-anchored per stage through `execHead`, so a tool NAME inside an argument, a commit message
 *  or a `pnpm` script's own text can never fire it. */
function heavyToolDoor(blank, clauses) {
  for (const clause of clauses) {
    for (const stage of clause.stages) {
      const { tokens, index, exec } = execHead(blank.slice(stage.start, stage.end));
      if (exec === undefined) {
        continue;
      }
      const rest = tokens.slice(index + 1).map((t) => t[0]);
      if (NPX_HEAD.test(exec[0])) {
        const tool = rest.find((t) => !t.startsWith("-"));
        const door = tool === undefined ? undefined : HEAVY_TOOLS[tool.replace(/^.*\//, "")];
        if (door !== undefined) {
          return { tool: `npx ${tool}`, door };
        }
        continue;
      }
      const bin = exec[0].match(BIN_DIR_TOOL);
      if (bin !== null) {
        const door = HEAVY_TOOLS[bin[1]];
        if (door !== undefined) {
          return { tool: exec[0], door };
        }
        continue;
      }
      if (!SELF_NODE_EXEC.test(exec[0])) {
        continue;
      }
      const script = rest.find((t) => !t.startsWith("-"));
      if (script === undefined) {
        continue;
      }
      const known = HEAVY_NODE_SCRIPTS.find(([re]) => re.test(script));
      if (known !== undefined) {
        return { tool: `node ${script}`, door: known[1] };
      }
      if (HEAVY_VERIFY_CLI.test(script)) {
        const verb = rest[rest.indexOf(script) + 1];
        const door = verb === undefined ? undefined : HEAVY_VERIFY_VERBS[verb];
        if (door !== undefined) {
          return { tool: `node ${script} ${verb}`, door };
        }
      }
    }
  }
  return null;
}

/** An explicit worker count above the fleet cap, as `{asked, cap}` — or null. Only asked of a stage that
 *  IS a CT or vitest invocation: `--workers` on an unrelated tool is that tool's own business, and the two
 *  runners have different caps. */
function overCapWorkers(blank, clauses) {
  const caps = concurrencyCaps();
  if (caps === null) {
    return null;
  }
  for (const clause of clauses) {
    for (const stage of clause.stages) {
      const text = blank.slice(stage.start, stage.end);
      const asked = text.match(WORKER_FLAG);
      if (asked === null) {
        continue;
      }
      const ct = PLAYWRIGHT_TEST.test(text) || CT_RUNNER_STAGE.test(text);
      const vitest = VITEST_HEAD.test(text) || VITEST_RUNNER_STAGE.test(text);
      const cap = ct ? caps.ct : vitest ? caps.vitest : null;
      if (cap !== null && Number(asked[1]) > cap) {
        return { asked: Number(asked[1]), cap };
      }
    }
  }
  return null;
}

// ── the classifier ──

/**
 * @param {string} command  the raw Bash command
 * @param {{cwd?: string, agentId?: string|null, projectDir: string, timeout?: number, now: number,
 *          procRoot?: string, scriptDepth?: number, nestedDepth?: number}} ctx
 * @returns {{decision: "deny"|"ask"|"allow"|"defer", rule: string|null, reason?: string,
 *           rewrite?: {command: string, timeout?: number, log?: string}, contexts: string[]}}
 */
export function classify(command, ctx) {
  const blank = blankHeredocs(command, blankComments(command, blankQuoted(command)));
  const clauses = parseStructure(blank);

  // 0. THE HARD FLOOR — first, so neither a later rewrite tier NOR the self-exemption can route around it.
  const floor = detectHardFloor(blank, clauses, command);
  if (floor) {
    return { ...floor, contexts: [] };
  }

  // 0b. SELF-EXEMPTION — the guard's own validation tooling, by IDENTITY (isSelfToolInvocation): a sole
  //     `node <tool> …` cannot execute its argv, so a corpus string inside it is data and the rules below
  //     have nothing real to judge. It runs AFTER blanking and AFTER the floor, and it is not a mention
  //     test: the unanchored raw-string version of this check turned any command containing one of the
  //     filenames into an explicit `allow` (AGENT-TOOLING-01).
  if (isSelfToolInvocation(command, blank, clauses, ctx)) {
    return { decision: "pass", rule: "self-exempt", contexts: [] };
  }

  // 0c. SCRIPT BODIES and 0d. NESTED COMMANDS — same class as 0b: visibility, not rule weakness. A
  //     `bash <untracked>.sh` stage, a `bash -c '<string>'` operand and a `"$( … )"` are each ONE opaque
  //     span to the rules below, which would judge the wrapper instead of what actually runs. Both
  //     verdicts merge strictest-wins with the command line's own (rules 1-11), which keeps every existing
  //     precedence intact: a deny down there still outranks an ask from a body, and a nested command can
  //     only ever make the outer one STRICTER, never wave one through.
  const line = mergeVerdicts(classifyCommandLine(command, blank, clauses, ctx), scriptBodyVerdict(command, blank, clauses, ctx));
  return mergeVerdicts(line, nestedCommandVerdict(command, blank, clauses, ctx));
}

/** Rules 1-11: the judgement of the command TEXT itself. Split out of `classify` only so the script-body
 *  pre-pass can merge with a complete verdict rather than being threaded through every early return. */
function classifyCommandLine(command, blank, clauses, ctx) {
  const contexts = [];

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
  const checkoutIndex = blank.match(GIT_CHECKOUT_INDEX);
  if (checkoutIndex && CHECKOUT_INDEX_OVERWRITE.test(checkoutIndex[1])) {
    return { decision: "deny", rule: "git-destructive", reason: REASONS.gitDestructive, contexts };
  }

  // 1b. hook-bypass spellings — DENY every spelling that skips hooks wholesale; the one sanctioned skip is
  //     `LEFTHOOK_EXCLUDE=check git commit/merge …` (excludes only the pre-commit `check`, keeps the
  //     `commit-msg` contract). `--no-verify`/`-n` on commit/merge, a `-c core.hooksPath=` global option,
  //     `git config core.hooksPath …` when it SETS the key, and a `LEFTHOOK=0`/`LEFTHOOK=false` env prefix
  //     all disable hooks entirely.
  if (GIT_NO_VERIFY.test(blank) || GIT_C_HOOKSPATH.test(blank)) {
    return { decision: "deny", rule: "git-hook-bypass", reason: REASONS.gitHookBypass, contexts };
  }
  const configHooksPath = blank.match(GIT_CONFIG_HOOKSPATH);
  if (configHooksPath && !CONFIG_HOOKSPATH_READONLY.test(configHooksPath[1])) {
    return { decision: "deny", rule: "git-hook-bypass", reason: REASONS.gitHookBypass, contexts };
  }
  for (const clause of clauses) {
    if (LEFTHOOK_DISABLE.test(blank.slice(clause.start, clause.end))) {
      return { decision: "deny", rule: "git-hook-bypass", reason: REASONS.gitHookBypass, contexts };
    }
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

  // 3b. AN OVER-CAP WORKER COUNT — DENY (2026-09-11, #1943 F5). Ahead of the two REWRITE rules on
  //     purpose: a rewrite would carry `--workers=8` verbatim into the sanctioned script, laundering the
  //     one number this rule exists to hold. (Its sibling, the un-floored heavy-tool family, sits at 5b
  //     instead — see there.)
  const overCap = overCapWorkers(blank, clauses);
  if (overCap !== null) {
    return { decision: "deny", rule: "worker-over-cap", reason: REASONS.workerOverCap(overCap.asked, overCap.cap), contexts };
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

  // 5b. A HEAVY TOOL THROUGH AN UN-FLOORED SPELLING — DENY WITH THE DOOR (2026-09-11, #1943 F5).
  //     AFTER the two harness rules and BEFORE the CT rewrite, deliberately: a command that is BOTH a
  //     piped harness and an un-floored tool (`npx tsc | head -5; pnpm typecheck 2>&1 | tail -15`) denies
  //     either way, and the pipe is the older, better-taught diagnosis — so the harness rule keeps the
  //     verdict and triage keeps reading one rule id for one shape. Ahead of rule 6 because that one is a
  //     REWRITE, and a rewrite must never be reached by a spelling this rule refuses.
  const heavy = heavyToolDoor(blank, clauses);
  if (heavy !== null) {
    return { decision: "deny", rule: "heavy-tool-unfloored", reason: REASONS.heavyToolUnfloored(heavy.tool, heavy.door), contexts };
  }

  // 6. playwright CT — the sanctioned spelling is the SCRIPT (`pnpm test:ct <paths>`), so every raw
  //    playwright run with CT intent is rewritten into it, or denied when the shape is too complex to
  //    rewrite. e2e invocations (no CT hint) are not this rule's business.
  //    2026-09-11, the vocabulary refresh: this rule used to accept a raw run that carried the "sanctioned
  //    prefix" (`rm -rf playwright/.cache` + an explicit `-c playwright-ct.config.ts`) and to rewrite a
  //    piped one into a redirect. BOTH premises died with the per-invocation cache (#1581) and the
  //    host-wide slot pool (#1835): `playwright/.cache` is not the CT cache any more, and a raw runner
  //    takes no exclusion lock and no host slot — so passing that shape let through the exact corrupting
  //    sibling runner the lock exists to refuse. The piped branch went with it and lost nothing: the
  //    rewritten spelling is a `pnpm test:*` harness head, so `pnpm test:ct … | tail` is caught and
  //    redirected by rule 4 above, one rule instead of two.
  if (PLAYWRIGHT_TEST.test(blank)) {
    // Intent is read off the RAW command: a path is the same path quoted or not, and `-c
    // "$WT/playwright-ct.config.ts"` is a CT run. The rule still only ENGAGES on a real playwright stage
    // in the blanked text, so a comment can never conjure this branch out of nothing.
    const ctIntent = CT_CONFIG.test(command) || CT_FILE_HINT.test(command);
    if (ctIntent) {
      const timeout = ctx.timeout === undefined ? REWRITE_TIMEOUT_MS : undefined;
      const rewritten = playwrightRewrite(command, blank, clauses);
      if (rewritten) {
        contexts.push(CONTEXTS.rewritePlaywright);
        return { decision: "allow", rule: "playwright-ct", rewrite: { command: rewritten, timeout }, contexts };
      }
      return { decision: "deny", rule: "playwright-ct", reason: REASONS.playwrightCt, contexts };
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

  // 9c. rg -r/--replace GLUED to a shorthand flag cluster (`-rln`) — DENY. ripgrep silently REPLACES
  //     matched text instead of listing it, with no error (four paid offenses, owner ruling 2026-08-19).
  //     Scoped to an `rg` HEAD stage only — the same glued cluster on an unrelated tool is not this rule.
  for (const clause of clauses) {
    for (const stage of clause.stages) {
      const text = blank.slice(stage.start, stage.end);
      if (RG_HEAD.test(text) && RG_REPLACE_MANGLE.test(text)) {
        return { decision: "deny", rule: "rg-replace-mangle", reason: REASONS.rgReplaceMangle, contexts };
      }
    }
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
  "· REWRITES a raw `playwright test` CT run into `pnpm test:ct <paths>` — the script owns the config, the",
  "  per-invocation build cache, the exclusion lock that catches a racing sibling runner, and the nice floor.",
  "· DENIES: `git stash`/`restore`/`checkout <path>`/`checkout-index -f` (they destroy uncommitted work — use",
  "  `git show HEAD:<path>` to read an old version), whole-tree `biome check --write` fix-alls, and",
  "  `cd` into a worktree (the Bash cwd PERSISTS across calls — use `git -C <abs-path>`).",
  "· DENIES a HEAVY TOOL run through a spelling with no heap floor — `npx eslint|tsc|stryker|jscpd|knip|",
  "  depcruise|tsx`, `node_modules/.bin/<tool>`, a bare `node scripts/eslint.ts` or `node tooling/src/",
  "  {verify,ast}/cli.ts <verb>` — and names the floored door (`pnpm lint:eslint`, `pnpm typecheck`,",
  "  `pnpm check:structure`, `pnpm ast`, …). A bare node child gets 4 GiB and OOMs; anything through pnpm",
  "  gets 16 GiB. `pnpm exec <tool>` is floored too, so it always passes. Same tier for a `--workers=N`",
  "  above the fleet cap: the shipped defaults ARE the shared-host caps, and a flag is for going LOWER.",
  "· DENIES `git push` from a lane: you do not push. Commit on your branch and report; the orchestrator",
  "  merges and the owner gives an explicit word per push.",
  "· READS THE BODY of an untracked wrapper script you run (`bash /tmp/…/lane-run.sh`) and judges its",
  "  contents by these same rules — wrapping work in a scratchpad .sh for logging or the 120s timeout is",
  "  encouraged, but it is not a way around them. Repo-tracked scripts (scripts/dev/*.sh) are not read.",
  "· READS INSIDE QUOTED COMMANDS the same way: the operand of `bash -c '…'` and any `$( … )` that would",
  "  actually run (unquoted or in double quotes) is classified on its own merits. So the sanctioned",
  "  `setsid nohup bash -c 'pnpm check > log 2>&1'` still runs — but a bad command no longer hides in a",
  "  quoted string. Single-quoted `'$(…)'` is literal text and is left alone.",
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
