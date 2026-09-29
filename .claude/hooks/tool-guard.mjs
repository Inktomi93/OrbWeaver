#!/usr/bin/env node
// PreToolUse guard for Bash and Read. It shapes HOW a command runs, never WHAT an agent may run: it denies
// the shapes that destroy work or signal, rewrites the ones with exactly one correct fix, and allows the
// rest. `.claude/settings.json` registers this file, and a hook binds at session launch. The path is fixed:
// replay, the regression corpus and SELF_CHECKOUT resolve through it. Claude only: `.codex/hooks.json`
// stays empty by owner ruling, pinned in tests/tooling/agent-sync/ops/sync.int.test.ts.
//
// INVARIANTS
//   · PASS MEANS ALLOW. A command the guard does not object to gets `allow`. The normal permission flow
//     prompts a human, and a subagent has nobody to prompt: it stops mid-turn with no report. The symptom is
//     a lane that "completes" after 1-4 tool calls, with `settings deferred Bash` in the raw tool output.
//   · NO DECISION PRINTS NOTHING. Only where the guard has not judged the call (the kill switch, an internal
//     error, unparseable stdin, a tool it does not judge) does it print nothing and exit 0. It never prints
//     `defer`: that is a real outcome, and it stops a `claude -p` run with `tool_deferred`.
//   · THE HARD FLOOR RUNS FIRST (sudo, a network fetch piped to a shell), ahead of every rewrite and the
//     self-exemption. An `allow` bypasses the permission flow, so the floor is the only gate left there.
//   · TEXT IS NOT A COMMAND. Quoted spans, comments and heredoc bodies are blanked (same length) before any
//     rule matches, so `git commit -m "fix the pnpm check pipe"` never fires. Structure is found on the
//     blanked text; a rewrite slices the ORIGINAL text by index, so quoted content survives verbatim.
//   · A REWRITE GOES THROUGH gateRewrite. It vets only its own clause, so the rest of the command is
//     classified again and the strictest verdict wins: a rewrite never launders a dangerous clause.
//   · WHAT RUNS IS JUDGED. An untracked script's body, a `bash -c` operand, a `$( … )` in live quoting, a
//     heredoc or stdin fed to a shell, and a file this command writes and then runs are all classified by
//     this same `classify`, strictest-wins. What the guard cannot see is an `ask`, never silence.
//     A `$( … )` inside single quotes is literal text and stays unread.
//   · NEVER BLOCK THE SANCTIONED FORM OF A JOB (`pnpm test:ct <paths>`, a path-scoped `biome check
//     --write`). A rule that catches the right way teaches agents to route around the hook.
//   · FAIL-OPEN. Any internal error or stdin stall prints no decision and exits 0.
//   · SELF-EXEMPTION IS A REALPATH IDENTITY: only a sole invocation of this file, its replay or the census
//     miner skips the rules, because such a command cannot execute its own arguments.
//
// DECISIONS: REWRITE (allow + updatedInput), DENY, WARN (allow + additionalContext), ASK (owner-only; a
// SUBAGENT gets a DENY with the escalation line instead), PASS (allow). A piped harness is rewritten
// because the pipeline reports the reader's exit code, and the harness's descendants hold the pipe open.
//
// OBSERVABILITY: every decision appends a JSONL line to reports/tool-guard/decisions.jsonl.
// TRIAGE: node -e "const r=require('fs').readFileSync('reports/tool-guard/decisions.jsonl','utf8')
//   .trim().split('\n').map(JSON.parse); console.log(r.filter(x=>x.agent&&x.agent!=='main').slice(-10))"
// KILL SWITCH: ORB_TOOL_GUARD=off (also "0"/"false") disables every rule; the hook logs the bypass and
// prints no decision. Set it in the session environment or on the `claude` launch.
//
// ENTRY POINTS:
//   echo '<PreToolUse json>' | tool-guard.mjs     real mode (hook contract on stdin, JSON on stdout)
//   tool-guard.mjs --classify-batch               stdin: JSON array of {command, cwd?, agentId?, sessionId?,
//                                                 timeout?, runInBackground?}; stdout: JSON array of
//                                                 decisions. Used by tests/tooling/tool-guard.int.test.ts
//                                                 and scripts/probes/guard-replay.ts.
// TEST SEAMS (env, test-only): ORB_TOOL_GUARD_NOW_FOR_TEST pins the clock; ORB_TOOL_GUARD_CRASH_FOR_TEST
// forces an internal throw, which proves fail-open.

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

// ── quote blanking (same length in, same length out — indexes into the blank map into the original) ──

export function blankQuoted(cmd) {
  const out = cmd.split(""); // UTF-16 units, the same indexes quoteSpans reports
  for (const { start, end } of quoteSpans(cmd)) {
    out.fill(" ", start, Math.min(end + 1, cmd.length));
  }
  return out.join("");
}

// ── comment blanking: bash ends a line at an unquoted WORD-INITIAL `#`, so everything after it is text,
//    not commands (`ls packages # never git stash` is not a stash). Runs on the quote-blanked text, BEFORE
//    heredocs: a `<<EOF` inside a comment must not start a heredoc scan. The character before the `#` is
//    checked in the RAW text: after `echo "x"# ; git stash` the blanked predecessor is a space, but the `#`
//    is part of a word there, and blanking to end-of-line would hide a real destructive clause. ──

export function blankComments(raw, blank) {
  let out = blank;
  for (const [start, stop] of commentSpans(raw, blank)) {
    out = out.slice(0, start) + " ".repeat(stop - start) + out.slice(stop);
  }
  return out;
}

/** The `[start, stop)` spans blankComments blanks. A caller that REWRITES text needs the spans themselves:
 *  a comment is invisible in the blanked text, so a rewrite that slices the ORIGINAL by clause indexes
 *  carries the comment along, and anything appended after it is swallowed to end-of-line (see pipeRewrite,
 *  whose exit-code restore goes on its own line for this reason). */
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
 *  CHARACTERS (end = the string length when unterminated). blankQuoted is built from these spans, so the
 *  two can never disagree about what is quoted; the spans also say WHICH quote opened each one, which is
 *  the whole question for a `$( … )`: live inside `"`, literal text inside `'`.
 *
 *  A heredoc body is skipped: a quote character there is plain text, and an apostrophe (`it's`) read as
 *  an opening quote would blank every command after the heredoc. The operator is found the way
 *  heredocUnits finds it (outside quotes and comments, one heredoc per line), and the body ends where
 *  `heredocBodyEnd` says. */
export function quoteSpans(cmd) {
  const spans = [];
  let quote = null;
  let start = 0;
  let inComment = false;
  let heredoc = null;
  for (let i = 0; i < cmd.length; i += 1) {
    const ch = cmd[i];
    if (heredoc !== null && i === heredoc.bodyStart) {
      if (quote === null) {
        i = heredocBodyEnd(cmd, heredoc.bodyStart, heredoc.delim).spanEnd - 1;
      }
      heredoc = null;
      continue;
    }
    if (quote === null && ch === "\n") {
      inComment = false;
    } else if (quote === null && ch === "#" && (i === 0 || /\s/.test(cmd[i - 1]))) {
      inComment = true;
    } else if (quote === null && ch === "<" && !inComment && heredoc === null) {
      HEREDOC_OPERATOR_AT.lastIndex = i;
      const m = HEREDOC_OPERATOR_AT.exec(cmd);
      const bodyStart = m === null ? -1 : cmd.indexOf("\n", i + m[0].length);
      heredoc = bodyStart === -1 ? null : { bodyStart, delim: m[2] };
    }
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

// ── heredoc blanking: a `<<DELIM` body is TEXT, not commands (a python heredoc that mentions `pnpm check |
//    grep` is not a piped harness). Blanks the operator, delimiter, body and terminator line, keeping
//    newlines so clause indexes stay honest. Runs on the quote-blanked text, reading delimiters from raw. ──

// Scanned on the RAW text: a quoted delimiter like <<'EOF' is already spaces in the blanked text, so the
// scanner would take the first body word for the delimiter. An operator inside a quoted span (blanked at
// that index) is skipped: that `<<` is string content, not a heredoc.
const HEREDOC_OPERATOR = /<<-?\s*(['"]?)(\w+)\1/g;
// The same operator, matched only at a given index (quoteSpans walks the text one character at a time).
const HEREDOC_OPERATOR_AT = new RegExp(HEREDOC_OPERATOR.source, "y");

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
 *  terminator line ends, and `quoted` says the delimiter was quoted, which keeps the body literal. ONE
 *  scanner, because two consumers need different slices of the same shape and a second scanner would
 *  eventually disagree with this one: `heredocSpans` blanks operator + body + terminator (a heredoc body
 *  is TEXT to every rule), while the script pass needs the body TEXT — a `<<EOF` fed to a SHELL, or
 *  written into a file the same command then runs, is a PROGRAM. */
export function heredocUnits(raw, blank) {
  const units = [];
  HEREDOC_OPERATOR.lastIndex = 0;
  for (let m = HEREDOC_OPERATOR.exec(raw); m !== null; m = HEREDOC_OPERATOR.exec(raw)) {
    if (blank[m.index] !== "<") {
      continue; // the operator is inside a quoted span — string content, not a heredoc
    }
    const bodyStart = raw.indexOf("\n", m.index + m[0].length);
    if (bodyStart === -1) {
      break;
    }
    const { bodyEnd, spanEnd } = heredocBodyEnd(raw, bodyStart, m[2]);
    units.push({ opStart: m.index, opEnd: m.index + m[0].length, bodyStart, bodyEnd, spanEnd, quoted: m[1] !== "" });
    HEREDOC_OPERATOR.lastIndex = spanEnd;
  }
  return units;
}

/** Where a heredoc body that starts at the newline `bodyStart` ends: `bodyEnd` is the terminator line's
 *  start, `spanEnd` its end. An unterminated body runs to the end of the text. */
function heredocBodyEnd(raw, bodyStart, delim) {
  for (let lineStart = bodyStart + 1; lineStart < raw.length; ) {
    const lineEnd = raw.indexOf("\n", lineStart);
    const stop = lineEnd === -1 ? raw.length : lineEnd;
    // the terminator line may carry leading tabs under `<<-`
    if (raw.slice(lineStart, stop).replace(/^\t+/, "") === delim) {
      return { bodyEnd: lineStart, spanEnd: stop };
    }
    if (lineEnd === -1) {
      break;
    }
    lineStart = lineEnd + 1;
  }
  return { bodyEnd: raw.length, spanEnd: raw.length };
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

// ── structure scan: clauses (split on && / || / ; / newline / a lone backgrounding `&`) and pipe stages
//    within each clause. Runs on the BLANKED text; returns index ranges so callers can slice the
//    original. ──

// A lone `&` BACKGROUNDS the command before it and starts a new one, the same clause boundary as `;`.
// Every rule that scans `clauses` must see the two halves apart: kept as one clause, `pnpm check > log &
// rm -rf /` has a `pnpm` head, and the per-stage `rm` rule never sees its own head. Three shapes are not a
// boundary: `&&` (checked first) and an `&` glued to a `>` on either side (`2>&1`, `1>&2`, `&>`, `&>>`).
// A quoted `&` never reaches here: `blank` has already turned every quoted span to spaces.
function isBackgroundAmpersand(blank, i) {
  return blank[i + 1] !== "&" && blank[i - 1] !== ">" && blank[i + 1] !== ">";
}

// `|&` is bash's pipe-both operator (`2>&1 |`): one pipeline, never a pipe followed by a backgrounding `&`.
// Splitting it there leaves `curl … |& bash` as two unpiped clauses, which the network-pipe floor, reading
// pipe stages, passes.
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
    } else if (c === ";" || c === "\n" || (c === "&" && isBackgroundAmpersand(blank, i))) {
      endClause(i);
      i += 1;
      clauseStart = i;
      stageStart = i;
    } else if (c === "|") {
      stages.push({ start: stageStart, end: i });
      i += next === "&" ? 2 : 1;
      stageStart = i;
    } else {
      i += 1;
    }
  }
  endClause(blank.length);
  return clauses.filter((cl) => blank.slice(cl.start, cl.end).trim().length > 0);
}

// ── vocab ──

// ── THE ONE WRAPPER VOCABULARY ──
// A WRAPPER is a command word that PREFIXES another command. Every head detector steps over the same set
// (the CT anchor PW_ANCHOR, the harness head HARNESS_HEAD, and the inline-shell and heavy-tool heads
// through `execHead`), so the vocabulary is DATA with two derived readers: `WRAP_PREFIX` (regex half) and
// `wrapperPrefixEnd` (token half). A detector with its own partial list has its own hole: `env -C <dir>`,
// the spelling .claude/skills/lane/SKILL.md orders every lane to use, has to resolve like `timeout 60`.
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
// A bare number is prefix noise for both readers (`timeout 60`, `timeout 1m`), tolerated after any wrapper.
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
    // is not: in `out=$(timeout 150 node_modules/.bin/tsc --noEmit …` the `$(` is not word-initial, so
    // `ungroup` leaves it and `out=$(timeout` reads as ONE assignment token, and the `150` is then all that
    // stands between the walk and the un-floored `.bin/tsc`.
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
// `pnpm check:show` is the READER every other harness's piped/redirected rewrite in this file points AT,
// so it must never itself be classified as a harness to rewrite (`check:show | grep` piping a READER's
// output is exactly as fine as `cat file | grep` — this hook is not the piping police for those). The
// exclusion is a lookahead BEFORE `check` is allowed to match at all: an exclusion folded into the
// OPTIONAL colon-suffix instead (`check(?::(?!show\b)[\w-]+)?`) only rejects the suffix, and the group
// being optional lets the match backtrack to bare `check` and still fire — `.test()` doesn't require
// consuming ":show", so that shape silently un-excludes itself. `showcase-release` stays a harness: the
// lookahead's `show\b` needs a boundary right after "show", and "showcase" has none there.
const NOT_CHECK_SHOW = String.raw`check(?!:show\b)`;
const HARNESS_HEAD = new RegExp(
  `^\\s*${WRAP_PREFIX}(?:(?:pnpm|npm|turbo)\\s+(?:run\\s+)?(?:${NOT_CHECK_SHOW}|verify|test|lint|typecheck|e2e|gate)\\b(?::[\\w-]+)?\\b|pnpm\\s+(?:exec\\s+)?vitest\\b|pnpm\\s+snap\\b)`,
);
// A harness head that actually runs: one asked only to list its stages or print help (`--list`, `--help`,
// `-h`) writes no artifact and forks nothing, so its pipe is left as written.
const HARNESS_RUN_HEAD = new RegExp(String.raw`^(?![^\n]*\s(?:--list|--help|-h)(?:\s|$))` + HARNESS_HEAD.source.slice(1));
// Readers we know how to re-target at a file (a rewrite's reader chain must be built from these; the
// optional path prefix admits the doctrine's own `/usr/bin/grep` spelling).
const READER = /^\s*(?:\S*\/)?(?:tail|head|grep|egrep|fgrep|rg|wc|cat|tee|sort|uniq|cut|awk|sed|tr|column|less|more|jq)\b/;
// A reader stage that is ONLY a capture sink (`tee <file>`, no filtering) carries no information a real
// artifact does not already have — `pnpm check`/`pnpm test` write their own reports/ files regardless of
// where stdout goes, so a `tee` stage adds nothing worth preserving. `bareHarnessRewrite` treats an
// all-`tee` reader chain the same as a bare `>` redirect: drop it.
const TEE_READER = /^\s*(?:\S*\/)?tee\b/;
const STDERR_MERGE_TAIL = /\s*2>&1\s*$/;
// ── An agent does not redirect harness output to a private log or `tee` sink and read that instead of the
// artifacts the harness writes; the harness's own exit code and `pnpm check:show` are the read path. ──
// A redirect/tee-only stage carries NO reader to preserve, so, unlike `pipeRewrite`, this cuts the redirect
// off entirely. Matches a bare `>`/`>>`/`&>`/`&>>` to a file AND an fd-merge (`2>&1`): one stripper keeps
// the cut point one regex instead of two that could disagree.
const REDIRECT_TOKEN = /\s(?:\d*>{1,2}|&>{1,2}|<)\s*\S+/g;
// What is left of a stage after every redirect token is cut — a subshell, backtick or a REAL background
// `&` (not the `&` inside `2>&1`/`&>`, which REDIRECT_TOKEN above already consumed) still makes the shape
// too complex for this rewrite to trust; deny/leave it to the general rules instead of guessing.
const UNSAFE_AFTER_REDIRECT_STRIP = /[()`&]/;
// The verify-family harness proper (`pnpm check`, `pnpm check:<x>`, `pnpm verify …`) — every OTHER
// `check:<x>` member except `check:show` itself (NOT_CHECK_SHOW, above), which is the READER and must
// never be rewritten as if it were the thing it reads.
const VERIFY_FAMILY_HEAD = new RegExp(`^\\s*${WRAP_PREFIX}pnpm\\s+(?:run\\s+)?(?:verify|${NOT_CHECK_SHOW})\\b(?::[\\w-]+)?`);
// Test harnesses with ONE fixed, known artifact file (AGENTS.md "Read the harness artifacts") — checked
// most-specific-first so `test:tooling`/`test:ct`/`test:node` never fall through to the bare `test\b`
// entry. `test:scoped` is deliberately absent: it takes explicit path operands and writes no fixed report
// file, so it keeps the generic private-log rewrite (pipeRewrite) — see the dispatch site.
const TEST_FAMILY_ARTIFACTS = [
  [new RegExp(`^\\s*${WRAP_PREFIX}pnpm\\s+(?:run\\s+)?test:tooling\\b`), "reports/test-report-tooling.json"],
  [new RegExp(`^\\s*${WRAP_PREFIX}pnpm\\s+(?:run\\s+)?test:ct\\b`), "reports/ct-flaky.json"],
  [new RegExp(`^\\s*${WRAP_PREFIX}pnpm\\s+(?:run\\s+)?test:node\\b`), "reports/test-report.json"],
  [new RegExp(`^\\s*${WRAP_PREFIX}pnpm\\s+(?:run\\s+)?test\\b(?!:)`), "reports/test-report.json"],
];
// A grep pattern shaped like a verify stage id (`lint:biome`, `structure:full` — tooling/src/verify/lib/
// registry.ts `name` fields are all `word:word`) is read as "show me that one stage", never hard-coded
// against the registry itself: the registry is a live import chain of every gate module, so pulling it
// into a hook that runs on EVERY Bash call would pay that whole load per call. The shape is stable even
// as stage names come and go.
const STAGE_LIKE_PATTERN = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;
const REDIRECT_FD_MERGE = /\d?>>?&\d/g;
// The guard's own validation tooling, identified by CANONICAL REALPATH — never by mention or path SUFFIX.
// A suffix is forgeable: `node /tmp/.claude/hooks/tool-guard.mjs $(git stash)` ends with it while running
// a planted file. The identity is "the same FILE this process is executing" (plus the two probes beside it
// in the same checkout), resolved through realpath on both sides, so a symlink to the real hook exempts
// (it runs the same bytes) and a look-alike never does.
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
// GLOBAL OPTIONS sit between `git` and its subcommand, and the lane skill orders the most common one
// (`git -C <worktree>` on every lane git call), so a bare `\bgit\s+stash\b` rule would be blind to the
// spelling every agent is told to use.
// The loop consumes only FLAG-SHAPED tokens plus at most one value each, so a non-flag first token stops
// it dead: `git log --oneline -5 -- .claude` and `git diff -- restore.ts` can never reach a subcommand
// match. A QUOTED value (`-C "$WT"`) is already blanked to whitespace by blankQuoted, contributing no
// token at all — hence the value group is optional, and JS backtracking covers the boolean-flag case
// (`git --no-pager stash`: the value group first eats `stash`, fails, then gives it back).
const GIT_GLOBAL_OPTS = String.raw`(?:-{1,2}[A-Za-z][^\s;|&]*\s+(?:[^\s;|&-][^\s;|&]*\s+)?)*`;
// git commands whose children hold a pipe open after the visible command ends: the credential/network helper
// of push/pull/fetch/clone, and the commit/merge hooks with their verify runs. Piped, a commit also reports
// the reader's exit code, so a failed hook reads as success. The subcommand must end the word, so
// `commit-tree` and `merge-base` never match.
const GIT_LONG_LIVED_VERBS = new Set(["push", "pull", "fetch", "clone", "commit", "merge"]);
// A commit or merge runs its hooks: a stage that starts one, for the commit-timeout rule.
const GIT_HOOKED_VERBS = new Set(["commit", "merge"]);
// Unlike GIT_GLOBAL_OPTS (which the destructive-git bans share), only git's real value options take the
// next word: every other flag is bare, so `git --no-pager log -S commit` does not read `log` as a value.
const GIT_VALUE_OPTIONS = new Set(["-C", "-c", "--config-env", "--git-dir", "--work-tree", "--namespace"]);
// Shell prefix keywords that `wrapperPrefixEnd` does not skip: `command git commit`, `time sleep 5`.
const PREFIX_KEYWORDS = new Set(["command", "time"]);
// A path-prefixed binary (`/usr/bin/git`) is the same git.
const GIT_EXEC_HEAD = new RegExp(String.raw`^\s*${WRAP_PREFIX}(?:(?:${[...PREFIX_KEYWORDS].join("|")})\s+(?:-p\s+)?${WRAP_PREFIX})*(?:\S*\/)?git\s`);
// A piped `pnpm doc` goes through the same log rewrite: its output is short and the paths it prints are the
// result, so the reader runs against the full log and the exit code survives.
const DOC_PIPE_HEAD = new RegExp(String.raw`^\s*${WRAP_PREFIX}pnpm\s+(?:run\s+)?doc(?=\s|$)`);
// stash: read-only subcommands (list/show) destroy nothing and pass; everything else is the ban.
const GIT_STASH = new RegExp(String.raw`\bgit\s+${GIT_GLOBAL_OPTS}stash\b(?:\s+(list|show))?`);
// restore: `--staged` WITHOUT `--worktree`/-W only unstages (index-only) — safe; all else destroys.
const GIT_RESTORE = new RegExp(String.raw`\bgit\s+${GIT_GLOBAL_OPTS}restore\b([^\n;|&]*)`);
const RESTORE_WORKTREE_ARM = /--worktree|(^|\s)-W\b|(^|\s)-[a-zA-Z]*W/;
const RESTORE_STAGED = /--staged|(^|\s)-S\b/;
const GIT_CHECKOUT = new RegExp(String.raw`\bgit\s+${GIT_GLOBAL_OPTS}checkout\s+(.*)`);
// checkout-index: with `-f`/`--force` (or `-a`/`--all`) it overwrites worktree files from the INDEX, which is
// `git checkout <path>` under another spelling. Without a force/all flag it refuses to overwrite an existing
// file, so that arm passes.
const GIT_CHECKOUT_INDEX = new RegExp(String.raw`\bgit\s+${GIT_GLOBAL_OPTS}checkout-index\b([^\n;|&]*)`);
const CHECKOUT_INDEX_OVERWRITE = /(^|\s)--(?:force|all)\b|(^|\s)-[a-zA-Z]*[fa]/;
// `--ours`/`--theirs` is a CONFLICT-RESOLUTION checkout: it overwrites the worktree file with one merge
// side, discarding any hand-edit already made there. Named explicitly (not left to the extension list)
// because the pathspec is often extension-less or an unlisted suffix, and refused uniformly: the house
// spelling `git show MERGE_HEAD:<path> > <path>` covers the legitimate merge case.
const CHECKOUT_PATHISH = /(^|\s)(--(\s|$)|--(ours|theirs)\b|\.(\s|$)|\S+\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|md|css|html|sql|sh|yml|yaml|txt|svg|png|lock)\b)/;
const BIOME_WRITE_MODE = /\bbiome\s+(?:check|lint|format)\b[^\n;|&]*--(?:write|fix|apply|unsafe)\b/;
const BIOME_SUBCOMMAND = /\bbiome\s+(?:check|lint|format)\b/;
const BIOME_ONLY_SCOPED = /--only=\S/;
const PNPM_LINT_FIX = /\bpnpm\s+(?:run\s+)?lint:fix\b/;
const HARNESS_OR_TRUE =
  /(?:\b(?:pnpm|npm|turbo)\s+(?:run\s+)?(?:check|verify|test|lint|typecheck|e2e|gate)(?::[\w-]+)?\b|\bpnpm\s+(?:exec\s+)?vitest\b)[^\n;]*\|\|\s*(?:true|echo|:)(?:\s|$)/;
const HARNESS_SEMI_TRUE = /(?:\b(?:pnpm|npm|turbo)\s+(?:run\s+)?(?:check|verify|test|lint|typecheck|e2e|gate)(?::[\w-]+)?\b)[^\n;]*;\s*true\s*$/;
// THE RAW-CT HEAD VOCABULARY: `./node_modules/.bin/playwright test` and `pnpm playwright test` run with the
// stock shared `playwright/.cache`, no worktree lock, no host slot and no run marker, and the `.bin`/`node`
// spellings with no heap floor either. A head regex for any tool carries `(?:\S*\/)?<bin>` and `pnpm <bin>`
// beside `npx`/`pnpm exec`; `@playwright/test/cli.js` is the same binary spelled as a node script.
const PLAYWRIGHT_CLI_JS = String.raw`node\s+\S*@playwright\/test\/cli\.js\s+test\b`;
// A COMMAND POSITION is line start, a separator, or one of them followed by the usual env/timeout/nice
// wrappers (WRAP_PREFIX) — `cd <wt> && timeout 400 ./node_modules/.bin/playwright test …` is the shape
// lanes actually type, and an anchor without the wrapper allowance reads it as text.
const PW_ANCHOR = String.raw`(?:\bnpx\s+|\bpnpm\s+(?:exec\s+)?|(?:^|[;&|(])\s*${WRAP_PREFIX})`;
const PLAYWRIGHT_TEST = new RegExp(String.raw`${PW_ANCHOR}(?:\S*\/)?playwright\s+test\b|${PW_ANCHOR}${PLAYWRIGHT_CLI_JS}`);
const CT_CONFIG = /playwright-ct\.config\.ts/;
const CT_FILE_HINT = /\.ct\.tsx?\b/;
const SG_AS_AST_GREP = /(?:^|[;&|(]\s*|\s)sg\s+(?:run|scan|outline|test|new|--version|-p\b|--pattern)/;
// Every vitest spelling that is NOT the sanctioned door. The `pnpm …` forms carry the heap floor but still
// miss the supervisor watchdog, the preflight that proves the paths collect a test, and the nice floor. A
// WARN is the honest tier: the difference from the door is a watchdog, not a missing heap ceiling (the deny
// family below is for that, and a deny on a floored spelling would cry wolf).
const VITEST_HEAD = /^\s*(?:npx\s+vitest|vitest|\S*node_modules\/\.bin\/vitest|pnpm\s+(?:exec\s+|run\s+)?vitest|node\s+\S*node_modules\/vitest\/vitest\.mjs)\b/;

// ── un-floored heavy tools ──
// A bare `node` gets heap_size_limit 4192 MiB and no NODE_OPTIONS; a `pnpm exec node` / `pnpm run` child
// gets 16480 (pnpm-workspace.yaml `nodeOptions`). The ENTRY SPELLING decides the heap ceiling, and these
// are the tools that need it: typed eslint, tsc, the in-process ts-morph verbs, stryker, jscpd, knip,
// depcruise. The priority floor does NOT depend on the spelling (every _shared/proc.ts niced door lowers its
// child regardless of caller), so this rule is about the heap FLOOR, never politeness.
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
  // `run` is the whole-battery verb behind `pnpm check`/`pnpm verify`; HARNESS_HEAD names only the
  // pnpm/npm/turbo spellings, so the raw form is caught here.
  run: "`pnpm check` (add `--full`/`--push` for other tiers) or `pnpm verify`",
};
const NPX_HEAD = /^(?:\S*\/)?npx$/;
const BIN_DIR_TOOL = /(?:^|\/)node_modules\/\.bin\/([\w.-]+)$/;
// An explicit worker count above the fleet cap. The caps are DATA — tooling/concurrency-profile.json is
// their ONE home, derived for this machine by its door — so this asks that door rather than
// hard-coding a number, and the shipped defaults ARE the caps: a flag is only ever needed to go LOWER.
const WORKER_FLAG = /(?:^|\s)--(?:workers|maxWorkers|max-workers)(?:=|\s+)(\d+)/;
const CT_RUNNER_STAGE = /\bpnpm\s+(?:run\s+)?test:ct\b/;
const VITEST_RUNNER_STAGE = /\bpnpm\s+(?:run\s+)?test:(?:scoped|node|tooling)\b/;
/** The profile door every runner sizes itself through, or null when it cannot load. */
const CONCURRENCY_DOOR =
  SELF_CHECKOUT === null
    ? null
    : await import(pathToFileURL(path.join(SELF_CHECKOUT, "tooling", "src", "_shared", "concurrency-profile.ts")).href).catch(() => null);
let concurrencyCapsCache;
/** `{ct, vitest}` as the door derives them for this machine, or null when it cannot answer — fail-open, like
 *  every other fact this guard derives from the tree. */
function concurrencyCaps() {
  if (concurrencyCapsCache === undefined) {
    concurrencyCapsCache = null;
    try {
      const active = CONCURRENCY_DOOR?.readConcurrencyProfile();
      if (active !== undefined) {
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
// listing/count flag silently vanishes and output is REPLACED text instead of a match list, with no error
// (the lane skill's "CLI hazards"). Scoped to an `rg` head only (a bare `-r` glued to a value on another tool, e.g.
// `tar -rf`, is that tool's own business). A bare `-r`/`--replace` with a SEPARATE token (or `--replace=`)
// is unambiguous and passes — only the glued-cluster shape silently mangles.
const RG_HEAD = /^\s*(?:\S*\/)?rg\b/;
const RG_REPLACE_MANGLE = /(?:^|\s)-r[A-Za-z]/;
// ── pgrep/pidof/`ps | grep` wait loops ──
const PGREP_OR_PIDOF = /(?:^|[\s;&|(])(?:\S*\/)?(?:pgrep|pidof)\b/;
const PS_PIPE_GREP = /(?:^|[\s;&|(])(?:\S*\/)?ps\b[^\n;]*\|\s*(?:\S*\/)?e?grep\b/;
// A wait loop's condition names a HARNESS only when it names the actual process the harness spawns
// (verify/cli.ts, vitest, playwright) or the pnpm door that launches one — a loop polling for an
// unrelated process name is this rule's business only when it says so explicitly.
const HARNESS_NAME_HINT = /verify\/cli\.ts|\bvitest\b|\bplaywright\b|pnpm\s+(?:run\s+)?(?:check|test|verify)(?::[\w-]+)?/;
// A command that is NOTHING BUT `true`/`:`, chained with `;`: "still waiting" filler. `true foo` (an argument)
// or `cmd || true` (real work in another clause) are not this shape; every clause must reduce to the bare word.
const TRUE_OR_COLON_CLAUSE = /^(?:true|:)$/;
// The sleep binary as an exec head: bare, path-prefixed (`/bin/sleep`) or backslash-escaped (`\sleep`).
const SLEEP_BIN = /^\\?(?:\S*\/)?sleep$/;
// The only duration the settle-delay exemption trusts: a literal in seconds. `sleep $N`, a quoted operand
// (blanked to nothing) and any other unit count as long, or a variable would walk any sleep past it.
const SLEEP_LITERAL_SECONDS = /^([0-9]+(?:\.[0-9]+)?)s?$/;
// Clauses that do no work a sleep could be waiting for, so a chain of them plus sleeps is still sleep-only.
// A redirect makes `echo` a write, which is work; a substitution is checked on the raw text by the caller.
const NOOP_CLAUSE = /^(?:true|:|cd(?:\s+\S+)?|echo(?:\s+[^<>]*)?|printf(?:\s+[^<>]*)?)$/;
// A pipe stage after a sleep that does nothing with its empty input, so `sleep 300 | cat` is still a sleep.
const NOOP_CONSUMER = /^(?:cat|tee(?:\s+\S+)*|true|:)$/;
const SUBSTITUTION_OPEN = /\$\(|`/;
// A Claude Code background task's own files (`<task>.output`, `.done`, `.exit`) under the per-session
// `/tmp/claude-<uid>/…/tasks/` dir. The harness already notifies the agent when that task exits, so a wait on
// one only polls for a notification that is coming anyway. The second form catches a variable-prefixed dir.
const HARNESS_TASK_FILE = /\/tmp\/claude-\d+\/\S*\/tasks\/|\/tasks\/[\w.-]+\.(?:done|exit|output)\b/;
const TAIL_BIN = /^(?:\S*\/)?tail$/;
// A background task's output file as the Read tool names it: always an absolute path.
const HARNESS_TASK_OUTPUT = /^\/tmp\/claude-\d+\/.+\/tasks\/[^/]+\.output$/;
// `pnpm doc` verbs that change shared board state (item numbering, transitions, landing), which the
// orchestrator owns. `new adr|plan|law` and `review` author a doc in the lane's own worktree and stay open.
const DOC_WRITE_VERBS = new Set(["item", "set", "land", "remove", "index", "status"]);
// A repeat of the same task-output range inside this window is a poll; after it, a reread is allowed.
const TASK_REREAD_WINDOW_MS = 120_000;
// pnpm's own options that take their value as a separate word, ahead of the script name.
const PNPM_VALUE_OPTIONS = new Set(["-C", "--dir", "--filter", "-F", "--filter-prod", "--reporter", "--loglevel", "--workspace-dir"]);
// A case arm's pattern ahead of the command it runs: `case x in a)`, `a|b)` after a pipe split, `(b)`.
const CASE_ARM_LEAD = /^\s*(?:case\s+\S+\s+in\s+)?\(?[^\s()|;]+\)/;
const TAIL_FOLLOW_FLAG = /^-[A-Za-z0-9]*[fF]|^--follow\b/;
// Shell tokens for `shellLoops`, on the BLANKED text: a redirect (`2>&1`, `>`, `<`) first so its `&` is not
// read as an operator, then the control operators, then words.
const SHELL_TOKEN = /\d*[<>]+&?\d*|&&|\|\||\|&|[;&|\n()`]|[^\s;&|()<>`]+/g;
// `{` opens a group or a function body (`f() {`, `function f {`), so a command can start right after it.
// Parentheses and case patterns are tracked by `shellLoops` itself.
const SHELL_OPERATOR = /^(?:&&|\|\||\|&|[;&|\n{])$/;
// The character glued before an extglob group's `(` in a case pattern: `?(…)`, `*(…)`, `+(…)`, `@(…)`, `!(…)`.
const EXTGLOB_OPERATOR = /^[?*+@!]$/;
const LOOP_KEYWORDS = new Set(["for", "select", "while", "until"]);
const RESERVED_CLOSERS = new Set(["done", "fi", "esac", "}"]);
// The rest of one simple command, from its first word up to the next operator or group boundary.
const SIMPLE_COMMAND_TEXT = /^[^;&|\n()`]*/;
// Reserved words after which the next word is again in command position.
const COMMAND_FOLLOWS = new Set(["do", "then", "else", "elif", "if", "while", "until", "!", "time"]);
// Bare foreground sleeps AT OR UNDER 2s are the settle-delay idiom (`kill …; sleep 2; ps …`), not a wait.
// Over 2s outside a loop is the hand-polling shape ("sleep N; tail log") this rule exists to remove.
const SLEEP_EXEMPT_MAX_SECONDS = 2;
// Reads that are ONLY a status check when they are the WHOLE command (single clause, single stage) — a
// `tail`/`head`/`wc`/`cat`/`grep` chained into something ELSE is doing real work, not just polling.
const LOG_READ_HEAD = /^\s*(?:\S*\/)?(?:tail|head|wc|cat|grep|egrep|fgrep)\b/;
const PS_P_HEAD = /^\s*(?:\S*\/)?ps\s+(?:[\w-]+\s+)*-p\b/;
const KILL_ZERO_HEAD = /^\s*(?:\S*\/)?kill\s+-0\b/;
const PNPM_CHECK_SHOW_HEAD = /^\s*pnpm\s+check:show\b/;
// The status-read TARGET is the command's last token — every shape this rule cares about (`tail -c 3000
// log`, `wc -l log`, `ps -p $PID`, `kill -0 $PID`) puts the thing being polled last. A trailing `2>&1`
// would otherwise BECOME the "target" (its own last token is `1`), so it is stripped first.
const TRAILING_REDIRECT_MERGE = /\s+\d*>&\d+\s*$/;
// The third consecutive read of the same target, nothing else run in between, is the deny: the first two are
// a normal check-in, the third is hand-polling instead of using the one notification a background job's
// own exit gives.
const STATUS_READ_STREAK_DENY_AT = 3;
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
// The `rm` COMMAND WORD, and nothing else. Everything after it (flags AND targets) is read off the RAW stage
// (`collectStageWarns`), because in the BLANKED text a quoted token is spaces and the head cannot tell a
// flag from a path: `rm "-rf" packages/server/src` receives `-rf` all the same. The optional path prefix
// makes `/bin/rm` an `rm`; only a token whose LAST path segment is exactly `rm` matches, so `npm`,
// `pnpm rm`, `/usr/bin/rmdir` and `/usr/bin/grm` cannot be confused for it.
// A target is judged with its quote characters ATTACHED, and RM_SAFE_TARGET matches by SUBSTRING, so
// `"/tmp/scratch"` stays sanctioned in quotes while `"packages/server/src"` does not.
const RM_HEAD = /^\s*(?:\S*\/)?rm(?=\s|$)/;
// An rm flag as `rm`'s own getopt sees it — quoted or not, short or long, EITHER CASE. Two tokens with
// two jobs, by owner ruling: the RECURSIVE token GATES the rule — only a flag that actually
// recurses (`-r`/`-R`, alone or folded into a cluster like `-rf`, or `--recursive`) makes an `rm` this
// rule's business; plain `rm -f <path>` force-unlinks ONE path and is not a recursive delete. The broader
// FLAG token still classifies tokens for the TARGET split below, so a quoted "-f"/"--force"/"--dir" can
// never be mistaken for a path (counting `"-rf"` as a path would make `rm "-rf" /tmp/scratch` ask — a
// false positive on the sanctioned sweep, and a guard that blocks the right way of doing a job gets
// routed around). Both are recognised on the RAW token so quoted spellings engage/classify identically.
const RM_RECURSIVE_TOKEN = /^(['"]?)(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\1$/;
const RM_FLAG_TOKEN = /^(['"]?)(?:-[a-zA-Z]*[rRfF][a-zA-Z]*|--(?:recursive|force|dir))\1$/;
// `.claude/worktrees/` is safe: lane worktrees are disposable and are swept by hand (teardown does not fire
// on agent completion). Scoped to `worktrees/` ONLY: the rest of `.claude/` (settings, hooks, agents) stays
// ask-tier.
const RM_SAFE_TARGET = /\/tmp\/|scratchpad|playwright\/\.cache|node_modules|reports\/|\.claude\/worktrees\/|\bdist\b|\bcoverage\b|\.cache\b|\.bak\b/;
// An rm target is tested AFTER resolving variables the command ITSELF assigned earlier (assignedVars +
// expandAssigned), so `SP=/tmp/…/scratchpad; rm -f "$SP/x.log"` is a scratch delete. This is EVIDENCE,
// never a hint: the value comes from the command's own text, so `R=/home/…/orbweaver; rm -rf "$R"` still
// asks, and a variable the command does not assign stays unresolved and therefore unsafe. A blanket "$ means
// scratch" rule would wave `rm -rf "$REPO"` through.
const ASSIGN_HEAD = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/;
// …and the EXPORT half of the same question (childEnvVars): which names reach a CHILD's environment.
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
// Cheap per-stage pre-filter: a shell name at a word boundary, a `.sh` operand, a `.`/`source` head
// (sourcing runs the file in the CURRENT shell, the same power as `bash <file>`), or `eval` (it takes its
// PROGRAM from an operand like `bash -c`, and a quoted operand is blanked). Everything below only runs for
// a stage that passes this. The shell arm ends at `(?:\s|$)`, not `\s`: a PIPE SINK is a stage whose whole
// text is the shell name (`cat f | bash`).
const SCRIPT_STAGE_HINT = /(?:^|[\s/])(?:sh|bash|zsh|ksh|dash)(?:\s|$)|\.sh(?:\s|$)|^\s*(?:\.|source)\s|(?:^|\s)eval\s/;
// `.`/`source` as a stage's COMMAND WORD. Never a path argument: the head is found at the exec-head
// position, so `find . -name x`, `biome check . --write` and `grep . --exclude-dir=y` are not this.
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
// `-s` is NOT the same thing: it means READ THE PROGRAM FROM STDIN, so `sh -s < f` and `cat f | bash -s`
// are channels, not inline strings (and the nested pass reads only `-c` operands). Any following non-flag
// word is the script's $0/argv, never the program, which is why hitting `-s` stops the operand hunt.
const SCRIPT_STDIN_FLAG = /^-[a-zA-Z]*s[a-zA-Z]*$/;
// The operand must resolve LITERALLY. Quoting is stripped and `$VAR`/`${VAR}` are expanded from the
// command's OWN assignments first (shellWords + assignedVars); what survives that may still be unknowable —
// an unassigned variable, a substitution, a glob. An unresolvable operand is an `ask`, because the guard
// cannot see what will execute. A resolvable path that does not EXIST fails open: that command dies in the
// shell with ENOENT, so there is nothing to judge.
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
const SCRIPT_MAX_BYTES = 64 * 1024;
// Depth of the OUTER command is 1; a body classified from it runs at 2, a body reached from THAT at 3 ==
// the cap, where a further script invocation is `ask` instead of another read. So two levels of body are
// read. Two, not one: `. <file>` counts as an interpreter target, and the common scratchpad launcher that
// sources the repo's own `.env` would otherwise sit AT the cap and be refused by budget, not inability.
// The extra level costs one stat, one `git ls-files` and one bounded read per nested target.
const SCRIPT_DEPTH_CAP = 3;
const SCRIPT_LINE_MAX = 160;

// ── nested commands: a command inside a QUOTED string is still a command ──
// The same visibility class as the wrapper-script hole, one layer down. Two shapes:
//   · `sh -c '<string>'` — the operand IS a command, and quote-blanking erases it before any rule can see
//     it.
//   · `$( … )` / backticks — a substitution EXECUTES, including inside double quotes, where blanking again
//     erases it. Head-anchored rules (`rm -rf …`, the harness heads) are blind to an UNQUOTED one too,
//     since the substitution is not at the head of the stage.
// ASYMMETRY, deliberate: inside SINGLE quotes `'$(x)'` is literal TEXT, never executed, and is NOT
// extracted — classifying it would be a false tighten on a string nobody runs. That is the whole reason
// this pass reads quoteSpans instead of just scanning for `$(`.
// The extracted text runs through this same `classify` and merges strictest-wins, so a nested command can
// only ever make the outer one STRICTER.
const SHELL_INLINE_C_FLAG = /^-[a-zA-Z]*c[a-zA-Z]*$/; // `-s` alone reads the command from STDIN — nothing to extract
// `eval` is a shell BUILTIN whose operand is the program — the `-c` shape with the flag left off. There is
// no file to read and no `-c` to find, so the operand is the word right after the head.
const EVAL_EXEC = /^eval$/;
// An operand that is NOTHING BUT variable references (`"$CMD"`, `"${PRE} ${POST}"`). This is the ONLY
// shape whose expansion is read, deliberately: a variable-carried command is one the guard
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
// reading one more level costs nothing. It sits well past real shapes: `$(dirname $(readlink -f $(which
// claude)))` is depth 3 and idiomatic. A hook that cries wolf gets disabled.
const NESTED_DEPTH_CAP = 6;
const SCRIPT_LINE_SCAN_MAX = 400;
const GIT_LS_TIMEOUT_MS = 2_000;
// the line locator re-classifies single lines; point the /proc scan at nothing so it stays O(1) there
const NO_PROC_ROOT = "/nonexistent-proc-root";
// deny > ask > allow(rewrite) > defer > pass. `defer` sits UNDER `allow` on purpose: it means "the guard
// did not judge the script body", which must never cancel a judgement the guard DID make.
const DECISION_RANK = { deny: 4, ask: 3, allow: 2, defer: 1, pass: 0 };

const REWRITE_TIMEOUT_MS = 600_000;
const CMD_LOG_MAX = 240;
const STDIN_DEADLINE_MS = 2_500;

// ── teaching text (the entire user-visible surface of this hook — mechanism + number + exact fix) ──

// Every filler/poll deny ends here. Report first: a lane told only to "end your turn" can end it with no
// report, and its committed work then goes unreported.
const WAIT_DENY_NEXT_STEP =
  "If your work is done, write your final report now. Otherwise end your turn with no more tool calls; the harness wakes you when your background job exits.";

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
  pgrepWaitLoop: `A \`pgrep\`/\`pidof\`/\`ps | grep\` WAIT LOOP for a harness process matches every checkout on the box, not just yours — a sibling lane's orphaned \`verify/cli.ts\`/vitest/playwright process blocks you, and outlives your own run's end (measured: 38+ minutes blocked, waiters outliving their lane by 80+ minutes). A ONE-SHOT \`pgrep\` (no loop) stays allowed. ${WAIT_DENY_NEXT_STEP}`,
  foregroundWaitLoopSleep: `A foreground \`until\`/\`while\` loop with \`sleep\` in its body re-bills your whole context on every poll. To wait on a real condition, such as a port or a file your script writes, run the loop with run_in_background. ${WAIT_DENY_NEXT_STEP}`,
  foregroundSleep: `A foreground \`sleep\` blocks this turn and re-bills your whole context while it waits. A literal sleep of 2s or less between real steps, or inside a bounded \`for\` loop, still runs. ${WAIT_DENY_NEXT_STEP}`,
  sleepOnly: `A command whose only work is \`sleep\` is a wait, backgrounded or not: it spends a tool call and re-bills your whole context to do nothing. ${WAIT_DENY_NEXT_STEP}`,
  taskFileWait: `This loop waits on a Claude Code background task file. The harness already notifies you when that task exits, so the loop only spends tool calls. ${WAIT_DENY_NEXT_STEP}`,
  taskOutputReread: (file) =>
    `You read this range of \`${file}\` less than ${TASK_REREAD_WINDOW_MS / 1000} s ago; rereading it this soon is a poll. If the job has finished, its output is what you already read. If your work is done, write your final report now; otherwise do other work or end your turn.`,
  docWriteLane: (verb) =>
    `\`pnpm doc ${verb}\` changes the board, and the orchestrator owns the board (items, status, landing); put the item's title, what, why and done in your report. Authoring a plan, ADR or law in your worktree with \`pnpm doc new\` is fine.`,
  trueOrColonFiller: `A command that is only \`true\`/\`:\` is filler: it re-bills your whole context and does nothing. ${WAIT_DENY_NEXT_STEP}`,
  drizzleKitSubagent: (verb) =>
    `A SUBAGENT ran \`drizzle-kit ${verb}\` — migration generation and application run on main by the orchestrator: parallel lanes generating migrations collide on migration numbers. Report the schema change and stop.`,
  repeatedStatusRead: (target, count) =>
    `This is the ${count}${count === 3 ? "rd" : "th"} consecutive read of \`${target}\` with nothing else run in between. Each re-check re-bills your whole context. ${WAIT_DENY_NEXT_STEP}`,
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
  rewritePipedArtifact: (target) =>
    `tool-guard rewrote this command: piping the harness hangs and swallows its exit code (see \`rewritePiped\`), and a private log is unnecessary here — the harness already writes its own artifact regardless of where stdout goes. It ran bare, and your reader now targets ${target} instead; the harness's REAL exit code is preserved.`,
  rewriteRedirectDropped:
    "tool-guard dropped this redirect/tee: the harness writes its own artifacts under reports/ regardless of where its stdout goes, so capturing stdout to a private file or `tee` sink is never necessary and only tempts a later poll of that file instead of reading the harness's own exit code. Run it bare and read the artifact — `pnpm check:show` for check/verify, reports/test-report.json (or reports/ct-flaky.json for test:ct) for a test run.",
  wholeTreeRun:
    "This is a whole-tree run: it can hold the host verify slot for up to an hour, and the orchestrator runs the whole-tree barrier after merging. Run it only if your brief asked for it or your scoped floor cannot answer the question. Run it with run_in_background, make no call while it runs, and put its verdict in your report.",
  rewriteLongLived: (log) =>
    `tool-guard rewrote this command: git's children (a push/pull/fetch credential helper, or commit/merge hooks and their verify runs) hold a pipe open after the visible command ends, and a pipe reports the reader's exit code, so a failed hook would read as success. Output went to ${log}, your reader ran against the file, and git's real exit code is preserved.`,
  commitTimeout: (ms) =>
    `tool-guard raised this call's timeout to ${ms / 60_000} min: commit and merge hooks often run past the 120 s Bash default, and a timed-out commit leaves its hook running. The command is unchanged.`,
  rewriteReaderStatus:
    "Your chain continues with `&&` after a status-checking reader (`grep -q`/`-c`, `rg -q`/`-c`), so that `&&` still tests the reader, as it did in the original pipe. The exit code is not carried past the reader here: run the command and the check as separate steps to see it.",
  rewriteDocPiped: (log) =>
    `tool-guard rewrote this command: the \`pnpm doc\` output went to ${log}, your reader ran against the file, and the real exit code is preserved.`,
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
    "A piped `git push/pull/fetch/commit/merge` can hang to the full 120s tool timeout — git's credential/network child or a commit hook holds the pipe open after the visible command finishes — and a pipe reports the reader's exit code, not git's. Drop the pipe, or redirect to a file and read it.",
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
 *  argument, an earlier `&&` stage — is not an invocation and is judged by every rule. Neither is a
 *  LOOK-ALIKE: `node /tmp/.claude/hooks/tool-guard.mjs $(git stash)` ends with the right path suffix while
 *  running a planted file. */
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

/** `…; <harness> [2>&1] | <readers> [; …]`  →  redirect the harness to a log, run the
 *  agent's own reader chain against the file, preserve the real exit code (unless `&&` tests a status-checking
 *  last reader: see `chainTestsReader`). Clauses BEFORE and AFTER the piped one (the ubiquitous `cd <repo> && …`
 *  prefix, a trailing `; echo done`) are kept verbatim with their original separators. `isHead(stageBlank,
 *  stageRaw)` says whether stage 0 is the command this caller rewrites. Returns null when the shape is not
 *  unambiguous (callers deny/warn instead): `||` chains, more than one piped clause, subshells/backticks/
 *  backgrounding or a mid-stage fd merge in stage 0, a reader line continued with `\`, or a reader outside the
 *  known re-targetable set. */
function pipeRewrite(command, blank, clauses, isHead, ctx) {
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
  const stage0Raw = command.slice(stage0.start, stage0.end);
  if (!isHead(stage0Blank, stage0Raw) || UNSAFE_STAGE0.test(stripFdMerges(stage0Blank)) || hasInnerFdMerge(stage0Blank)) {
    return null;
  }
  // A stage ending in a backslash met an escaped `\|` or `\ |`, which the clause scan splits as a pipe; the
  // shell does not, so a rewrite would change what runs.
  if (clause.stages.slice(0, -1).some((st) => endsEscaped(command.slice(st.start, st.end)))) {
    return null;
  }
  for (const r of readers) {
    const rBlank = blank.slice(r.start, r.end);
    if (!READER.test(rBlank) || UNSAFE_READER.test(stripFdMerges(rBlank))) {
      return null;
    }
  }
  const readerChain = command.slice(readers[0].start, clause.end).trim();
  if (clauseHasHeredoc(command, clause) || clauseContinues(command, clause)) {
    return null;
  }
  const log = `${ctx.projectDir}/reports/tool-guard/run-${ctx.now}.log`;
  const harness = stage0Raw.replace(STDERR_MERGE_TAIL, "").trim();
  // stderr joins the log only when the original sent it down the pipe; otherwise it stays on the terminal.
  const merge = mergesStderr(blank, stage0, stage0Raw) ? " 2>&1" : "";
  const readerStatus = chainTestsReader(command, clause);
  const body = readerStatus
    ? `${harness} > ${log}${merge}; < ${log} ${readerChain}\n`
    : `${harness} > ${log}${merge}; __tg_ec=$?; < ${log} ${readerChain}${EXIT_RESTORE}`;
  return { log, clause, readerStatus, command: groupRewrite(command, clause, body) };
}

/** Does stage 0 merge or move a file descriptor anywhere but a trailing `2>&1`? A mid-stage `2>&1` still sends
 *  stderr down the pipe, and the log rewrite can only reproduce the trailing form. */
function hasInnerFdMerge(stage0Blank) {
  return /\d?>>?&\d/.test(stage0Blank.replace(STDERR_MERGE_TAIL, ""));
}

/** Does the chain after this pipe test the LAST reader's status (`… | grep -q X && next`)? Then the group ends
 *  with that reader, as the original pipe did, instead of the harness's exit restore. */
function chainTestsReader(command, clause) {
  if (!command.slice(clause.end).trimStart().startsWith("&&")) {
    return false;
  }
  const words = shellWords(command.slice(clause.stages.at(-1).start, clause.end)).map((w) => w.value);
  const tool = words[0]?.replace(/^.*\//, "");
  const flags = words.slice(1, words.includes("--") ? words.indexOf("--") : undefined).filter((w) => w.startsWith("-"));
  if (tool === "grep" || tool === "egrep" || tool === "fgrep") {
    return flags.some((f) => f === "--quiet" || f === "--silent" || f === "--count" || /^-[A-Za-z]*[qc]/.test(f));
  }
  if (tool === "rg") {
    return flags.some((f) => f === "--quiet" || f === "--count" || /^-[A-Za-z]*[qc]/.test(f));
  }
  return false;
}

/** Does a heredoc start in this clause? Its body follows the clause's line, so the group's closing line
 *  would land inside the body. */
function clauseHasHeredoc(command, clause) {
  return heredocUnits(command, blankComments(command, blankQuoted(command))).some((u) => u.opStart >= clause.start && u.opStart < clause.end);
}

/** Does the clause's last line end in `\`? The escaped newline joins it to the next operator, and a rewrite
 *  that cuts or moves the clause text breaks that join. Read with comments blanked, because a `\` inside a
 *  trailing comment is comment text and joins nothing. */
function clauseContinues(command, clause) {
  return endsEscaped(blankComments(command, blankQuoted(command)).slice(clause.start, clause.end));
}

/** Is the character at `i` escaped? Only an odd run of backslashes before it escapes: a `\\` pair is one
 *  literal backslash and escapes nothing after it. */
function escapedAt(text, i) {
  let run = 0;
  while (text[i - 1 - run] === "\\") {
    run += 1;
  }
  return run % 2 === 1;
}

/** Does `text` end in a backslash that escapes whatever follows it (a newline, or the next operator)? */
function endsEscaped(text) {
  const trimmed = text.trimEnd();
  return escapedAt(trimmed, trimmed.length);
}

// A line continuation in the BLANKED text: an odd backslash run, then a newline. Quotes, comments and
// heredoc bodies are already blanks there, so a `\` in any of them never matches.
const LINE_CONTINUATION = /(?<!\\)(?:\\\\)*\\\n/g;

/** `raw` and `blank` with every line continuation's `\` and newline turned into two spaces. Bash deletes
 *  the pair, so the two lines are one command. Same length, so every index still points into `command`. */
function joinContinuations(command, blank) {
  let raw = command;
  let joined = blank;
  for (const m of blank.matchAll(LINE_CONTINUATION)) {
    const at = m.index + m[0].length - 2;
    raw = `${raw.slice(0, at)}  ${raw.slice(at + 2)}`;
    joined = `${joined.slice(0, at)}  ${joined.slice(at + 2)}`;
  }
  return { raw, blank: joined };
}

/** Did the original stage send stderr down the pipe too: a trailing `2>&1`, or a `|&` right after it? */
function mergesStderr(blank, stage0, stage0Raw) {
  return STDERR_MERGE_TAIL.test(stage0Raw) || blank[stage0.end + 1] === "&";
}

// Ends a rewrite's group body with the command's real exit code. It goes on its OWN LINE because the reader
// chain is sliced from the ORIGINAL text and can end in a comment, which runs to end-of-line.
const EXIT_RESTORE = "\n( exit $__tg_ec ); ";

/** The command with `clause` replaced by a brace group around `body`, which ends in a newline or
 *  `EXIT_RESTORE`. What followed the pipeline (`&&`, `||`, `;`, a backgrounding `&`) now applies to the
 *  group, which carries the real exit code: appended after the reader, a `&& next` would test the reader's
 *  status instead. */
function groupRewrite(command, clause, body) {
  const prefix = command.slice(0, clause.start);
  const rawSuffix = command.slice(clause.end);
  const suffix = /^[\s;]*$/.test(rawSuffix) ? "" : rawSuffix; // a bare trailing `;` would yield `; ;` — a bash syntax error
  const joiner = prefix === "" || /\s$/.test(prefix) ? "" : " ";
  return `${prefix}${joiner}{ ${body}}${suffix}`;
}

/** Which known artifact (if any) a harness clause's stage0 writes, as `{kind: "verify"}` or
 *  `{kind: "test", artifact}` — or null for a harness with no single fixed reader (lint, typecheck, e2e,
 *  gate, snap, bare vitest, `test:scoped`), which keeps the generic `pipeRewrite` log instead. */
function classifyHarnessFamily(stage0Blank) {
  if (VERIFY_FAMILY_HEAD.test(stage0Blank)) {
    return { kind: "verify" };
  }
  for (const [re, artifact] of TEST_FAMILY_ARTIFACTS) {
    if (re.test(stage0Blank)) {
      return { kind: "test", artifact };
    }
  }
  return null;
}

/** `pnpm check:show`'s flags for a reader chain written to grep/tail/head the harness's raw stdout —
 *  `--stage <name>` when a reader's grep pattern is shaped like one stage id, else the terse
 *  `--errors-only` view that covers tail/head/wc/a non-stage-shaped grep alike. Reads the PATTERN off
 *  `command` (the raw text), not
 *  `blank` — a quoted grep pattern is blanked to spaces there, so the stage-id text only survives in the
 *  original. */
function checkShowFlags(command, blank, readers) {
  for (const r of readers) {
    if (!/^\s*(?:\S*\/)?e?f?grep\b/.test(blank.slice(r.start, r.end))) {
      continue;
    }
    const tokens = command.slice(r.start, r.end).trim().split(/\s+/).slice(1);
    const pattern = tokens.find((t) => !t.startsWith("-"))?.replace(/^['"]|['"]$/g, "");
    if (pattern !== undefined && STAGE_LIKE_PATTERN.test(pattern)) {
      return `--stage ${pattern}`;
    }
  }
  return "--errors-only";
}

/** A verify-family or known-artifact test harness piped into a reader is
 *  rewritten against the REAL artifact the harness already writes on disk — never a private log — because
 *  that artifact exists regardless of where the harness's stdout goes. Verify-family (`pnpm check[:x]`,
 *  `pnpm verify`) gets `pnpm check:show` in place of the whole reader chain: it is a structured view over
 *  `reports/check-structure.json` / the verify run's stage transcripts, strictly better than grepping raw
 *  console text. A known test harness keeps the agent's OWN reader chain, just retargeted at its report
 *  file instead of a captured copy of stdout. Same shape constraints as `pipeRewrite` (one piped clause,
 *  no `||`, a safe stage0, every reader from the known set) — and null for anything `classifyHarnessFamily`
 *  does not recognize, or an all-`tee` reader chain (that shape is `bareHarnessRewrite`'s, not this one's:
 *  there is no filter to preserve). */
function artifactPipeRewrite(command, blank, clauses) {
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
  if (UNSAFE_STAGE0.test(stripFdMerges(stage0Blank)) || hasInnerFdMerge(stage0Blank)) {
    return null;
  }
  const family = classifyHarnessFamily(stage0Blank);
  if (family === null || clause.stages.slice(0, -1).some((st) => endsEscaped(command.slice(st.start, st.end)))) {
    return null; // an escaped `\|` is an argument to bash, not a pipe (see pipeRewrite)
  }
  if (readers.every((r) => TEE_READER.test(blank.slice(r.start, r.end)))) {
    return null; // a pure capture sink is bareHarnessRewrite's shape, not this one's
  }
  for (const r of readers) {
    const rBlank = blank.slice(r.start, r.end);
    if (!READER.test(rBlank) || UNSAFE_READER.test(stripFdMerges(rBlank))) {
      return null;
    }
  }
  if (clauseHasHeredoc(command, clause) || clauseContinues(command, clause)) {
    return null;
  }
  const harness = command.slice(stage0.start, stage0.end).replace(STDERR_MERGE_TAIL, "").trim();
  const readerStatus = chainTestsReader(command, clause);
  if (family.kind === "verify") {
    if (readerStatus) {
      return null; // `pnpm check:show` replaces the reader whose status the chain tests; the private-log rewrite keeps it
    }
    const target = `pnpm check:show ${checkShowFlags(command, blank, readers)}`;
    return { command: groupRewrite(command, clause, `${harness}; __tg_ec=$?; ${target}${EXIT_RESTORE}`), target, clause, readerStatus };
  }
  const readerChain = command.slice(readers[0].start, clause.end).trim();
  const target = family.artifact;
  const body = readerStatus ? `${harness}; < ${target} ${readerChain}\n` : `${harness}; __tg_ec=$?; < ${target} ${readerChain}${EXIT_RESTORE}`;
  return { command: groupRewrite(command, clause, body), target, clause, readerStatus };
}

/** A harness redirected to a file (`> x.log 2>&1`, `&> x.log`) or piped into
 *  a pure capture sink (`| tee x.log`, no further filter) writes its real artifacts to `reports/` on disk
 *  regardless — there is nothing in the private copy worth keeping, so this drops the redirect/tee outright
 *  and runs the harness bare. Unlike `pipeRewrite`/`artifactPipeRewrite` there is no reader chain to
 *  preserve, so the safety check is looser on `<>&` (those characters ARE the redirect being cut) and
 *  stricter on what is left AFTER the cut (`UNSAFE_AFTER_REDIRECT_STRIP`) — a subshell, backtick or a REAL
 *  backgrounding `&` past every redirect token is still too complex to trust. Returns null for anything
 *  that is not exactly this shape (including a plain harness with no redirect/tee at all — nothing to
 *  drop, so no rewrite). */
function bareHarnessRewrite(command, blank, clauses, headRe) {
  if (blank.includes("||")) {
    return null; // `harness || true`-shaped swallowing is rule 5's business, never this one's
  }
  if (command.includes("__tg_ec=$?")) {
    return null; // this IS a prior rewrite's own redirect-to-log — never re-fire on the guard's own output
  }
  const candidates = clauses.filter((cl) => headRe.test(blank.slice(cl.stages[0].start, cl.stages[0].end)));
  if (candidates.length !== 1) {
    return null;
  }
  const [clause] = candidates;
  if (blank[clause.end] === "&" && blank[clause.end + 1] !== "&") {
    return null; // backgrounded: dropping the redirect would send a background job's output to the tool
  }
  if (clauseContinues(command, clause)) {
    return null;
  }
  const [stage0, ...readers] = clause.stages;
  const isSafeTeeSink = (r) => {
    const rBlank = blank.slice(r.start, r.end);
    return TEE_READER.test(rBlank) && !UNSAFE_READER.test(rBlank.replace(REDIRECT_TOKEN, " "));
  };
  if (readers.length > 0 && !readers.every(isSafeTeeSink)) {
    return null;
  }
  const stage0Blank = blank.slice(stage0.start, stage0.end);
  const hasRedirect = REDIRECT_TOKEN.test(stage0Blank);
  REDIRECT_TOKEN.lastIndex = 0; // `.test` on a `g` regex advances lastIndex — reset before the next use
  if (!hasRedirect && readers.length === 0) {
    return null; // nothing to drop
  }
  const stripped = stage0Blank.replace(REDIRECT_TOKEN, " ");
  if (UNSAFE_AFTER_REDIRECT_STRIP.test(stripped)) {
    return null;
  }
  const cut = stage0Blank.search(REDIRECT_TOKEN);
  REDIRECT_TOKEN.lastIndex = 0;
  const harnessRaw = command.slice(stage0.start, stage0.end);
  const harness = (cut === -1 ? harnessRaw : harnessRaw.slice(0, cut)).trim();
  const prefix = command.slice(0, clause.start);
  const rawSuffix = command.slice(clause.end);
  const suffix = /^[\s;]*$/.test(rawSuffix) ? "" : rawSuffix;
  return { command: `${prefix}${harness}${suffix}`, clause };
}

/** The git subcommand a stage runs, or null when the stage does not run git. The exec head is found in the
 *  BLANKED stage, so a comment or quoted text never reads as git; the options are walked on the RAW stage's
 *  shell words, where a quoted value with a space (`-C "/w t"`) is one word. */
function gitSubcommand(stageBlank, stageRaw) {
  return gitCall(stageBlank, stageRaw)?.verb ?? null;
}

/** The git call a stage runs as `{verb, args}` (the words after the subcommand, quotes removed), or null. */
function gitCall(stageBlank, stageRaw) {
  if (!GIT_EXEC_HEAD.test(stageBlank)) {
    return null;
  }
  // stripOperandTail: a group's `(`/`)` is glued to the raw word, so `(git commit)` ends in `commit)`
  const words = shellWords(stageRaw).map((w) => stripOperandTail(w).value);
  let at = prefixKeywordsEnd(words, wrapperPrefixEnd(words));
  if (words[at]?.replace(/^.*\//, "") !== "git") {
    return null;
  }
  at += 1;
  while (words[at]?.startsWith("-") === true) {
    at += GIT_VALUE_OPTIONS.has(words[at]) ? 2 : 1;
  }
  return words[at] === undefined ? null : { verb: words[at], args: words.slice(at + 1) };
}

/** Does a stage run a commit or merge with its hooks skipped (`--no-verify`, or `-n` on commit)? Read
 *  through git's global options (`git -C <wt> commit --no-verify`) and a quoted flag. */
function gitSkipsHooks(stageBlank, stageRaw) {
  const call = gitCall(stripCompoundLead(stageBlank), stripCompoundLead(stageRaw));
  if (call === null || !GIT_HOOKED_VERBS.has(call.verb)) {
    return false;
  }
  return call.args.includes("--no-verify") || (call.verb === "commit" && call.args.includes("-n"));
}

/** A `pnpm doc` stage as `{verb, help}` (`verb` is `""` for a bare `pnpm doc`), or null when the stage is
 *  not one. Reads through a case-arm pattern, compound-command lead words, redirects and pnpm's own
 *  options ahead of `doc`. */
function docCall(stageBlank, stageRaw) {
  // Every blanking keeps the length, so a token's offset here is its offset in `stageRaw`.
  const text = stripCompoundLead(stageBlank.replace(CASE_ARM_LEAD, (lead) => " ".repeat(lead.length))).replace(REDIRECT_TOKEN, (r) => " ".repeat(r.length));
  const { exec } = execHead(text);
  if (exec === undefined || !/^(?:\S*\/)?pnpm$/.test(exec[0])) {
    return null;
  }
  // The blanked stage proves which token is `pnpm`; every word after it is read off the raw text, where a
  // quoted option value (`-C "$WT"`) is one word rather than blank space, and `'doc'` is `doc`.
  const words = docArgs(stageRaw.slice(exec.index + exec[0].length));
  let at = 0;
  while (words[at]?.startsWith("-") === true) {
    at += PNPM_VALUE_OPTIONS.has(words[at]) ? 2 : 1;
  }
  if (words[at] === "run") {
    at += 1;
  }
  if (words[at] !== "doc") {
    return null;
  }
  const args = words.slice(at + 1);
  return { verb: args.find((w) => !w.startsWith("-")) ?? "", help: args.length === 2 && (args[1] === "--help" || args[1] === "-h") };
}

/** Raw text as shell words: a quoted argument is still one word (`'set'` is `set`), so a quoted verb
 *  still writes and a quoted title still counts. Redirects and their targets are not arguments. */
function docArgs(argsRaw) {
  const words = shellWords(argsRaw);
  const args = [];
  for (let i = 0; i < words.length; i += 1) {
    if (REDIRECT_OPERATOR_ONLY.test(words[i].raw)) {
      i += 1;
    } else if (!REDIRECT_WORD.test(words[i].raw)) {
      args.push(stripOperandTail(words[i]).value); // `(pnpm doc index)`: the group's `)` is glued to the verb
    }
  }
  return args;
}

// The same four spellings, anchored at a clause head so the rewrite knows exactly what to replace. Its
// match LENGTH is what the argument slice is taken from (see playwrightRewrite): the `cli.js` form carries
// no `playwright test` substring to search for, and a length-based slice reads the same for all four.
// The wrapper group is the shared vocabulary, captured whole and carried verbatim into the sanctioned call:
// `env -C <wt> ./node_modules/.bin/playwright test <paths>` becomes `env -C <wt> pnpm test:ct <paths>`, the
// spelling .claude/skills/lane/SKILL.md prescribes. The group always matches (possibly empty).
const PW_CLAUSE_HEAD = new RegExp(
  String.raw`^\s*(${WRAP_PREFIX})(?:(?:npx|pnpm(?:\s+exec)?)\s+)?(?:(?:\S*\/)?playwright|node\s+\S*@playwright\/test\/cli\.js)\s+test\b`,
);
// Playwright flags that take their value as a SEPARATE word. The rewritten `pnpm test:ct` runs
// `scoped-test`, whose preflight reads every non-flag operand carrying a `/`
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
 *  preserved). The `-c/--config` flag is dropped because the script owns the config. A cache-clearing
 *  `rm -rf <root>/playwright/.cache && npx playwright test …` is rewritten like any other raw run: the CT
 *  build cache is minted per invocation under `.cache/ct/build-<id>` (ct-runner-lock.ts §1), so that
 *  directory is read by nothing, and the raw runner takes neither the exclusion lock nor a host slot. */
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
// Needed because the pass-through is `allow`: a hook `allow` bypasses the whole permission system,
// including the auto-mode CLASSIFIER that is the owner's real gate, so `sudo rm -rf /etc` or `curl … | bash`
// would reach nothing. This floor puts them back in front of a human.
//
// It is deliberately SMALL. It is not a security model and it cannot become one — a hand-written
// pattern list will always lose to a determined bypass. Its job is to stop an ACCIDENT (a wrong path
// in an rm, a copy-pasted install one-liner), which is the realistic failure here.
const SUDO_HEAD = /^\s*(?:sudo|doas)\b/;
// The words that can open a stage without being its command: a subshell or group opener, or a reserved word
// of an enclosing `if`/loop (`do rm -rf /`, `(sudo ls)`, `{ rm -rf /; }`). Blanked to spaces, never removed,
// so every index into the stage still points at the same character of the raw command. `time` and
// `command` (with `time -p`) are stepped over by prefixKeywordsEnd, the one reader of those prefixes.
const COMPOUND_LEAD = /^(?:\s*(?:\(|\{(?=\s)|(?:do|then|else|elif|if|while|until|!)(?=\s)))+/;

function stripCompoundLead(text) {
  let out = text;
  for (;;) {
    out = out.replace(COMPOUND_LEAD, (lead) => " ".repeat(lead.length));
    const words = [...out.matchAll(/\S+/g)];
    const end = prefixKeywordsEnd(
      words.map((w) => w[0]),
      0,
    );
    if (end === 0) {
      return out;
    }
    const cut = words[end]?.index ?? out.length;
    out = " ".repeat(cut) + out.slice(cut);
  }
}
const NET_FETCH_HEAD = /^\s*(?:\S*\/)?(?:curl|wget)\b/;
// shells + `node -e` only. `python3 -c` is a sanctioned everyday tool here and is NOT a sink.
const SHELL_SINK_HEAD = /^\s*(?:\S*\/)?(?:sh|bash|zsh|dash|ksh)\b/;
// node as a pipe SINK executes STDIN as a program — bare `node`, `node -`, or node with only flags —
// byte-equivalent to `curl | sh`. `-e`/`-p` run LOCAL, command-visible code and read stdin as DATA, while
// the bare forms run whatever the network sent. The threat this floor stops is NETWORK-authored code; an `-e` body
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
      const text = stripCompoundLead(blank.slice(stage.start, stage.end));
      if (SUDO_HEAD.test(text)) {
        return { decision: "ask", rule: "sudo", reason: REASONS.sudo };
      }
      // a network fetch feeding a shell has no legitimate use. The node sink is judged on the RAW stage,
      // so a quoted script operand reads as file execution.
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
      const text = stripCompoundLead(blank.slice(stage.start, stage.end));
      vitest ||= VITEST_HEAD.test(text);
      if (SQLITE_HEAD.test(text) && !SQLITE_SAFE_HINT.test(command.slice(stage.start, stage.end))) {
        sqlite = true;
      }
      const rm = text.match(RM_HEAD);
      if (rm) {
        // The head is found in the BLANKED text (so a quoted `rm -rf` in an echo argument is never one) and
        // covers the COMMAND WORD only; flags and targets are then read off the RAW command, which is the
        // only place a quoted one still exists. Split on whitespace with the quote characters left ON,
        // deliberately: joining a quoted span into one word would let `rm -rf /tmp/a "/tmp/b c"`, which
        // asks on its `c"` token, pass.
        const tokens = command
          .slice(stage.start + rm[0].length, stage.end)
          .split(/\s+/)
          .filter((t) => t.length > 0);
        // An `rm` carrying no RECURSIVE flag is not this rule (`rm one-file.txt` and `rm -f one-file.txt`
        // unlink a single named path): the flags are searched across ALL tokens rather
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
  // returned so the caller can ESCALATE: pass means allow, so a warn alone would let an unsafe-target
  // `rm -rf` or a bare sqlite3 on the LIVE db run with nothing in front of them.
  return { sqlite, rmrf };
}

// ── script bodies: a wrapper file is not a shield ──
// A lane's `bash /tmp/…/lane-run.sh` is ONE opaque line to every rule above. These helpers give the
// classifier eyes on what that line actually executes. Order of cheapness is deliberate: a per-stage
// regex hint → token scan → path resolve → stat (size cap) → `git ls-files` (tracked = reviewed code,
// stop) → read → classify. Nothing spawns unless a stage really names a resolvable script file.

/** A GROUP OPENER is not part of the command it opens: `(setsid nohup bash -c 'git stash' &)` would
 *  tokenise as `(setsid`, neither a wrapper nor a shell, so the exec head is never found and the quoted
 *  command inside is never extracted. A subshell is how a lane backgrounds work. Blanked to a SPACE, never
 *  removed: every index in this file points back into the original text. Only a WORD-INITIAL `(`/`{`
 *  counts, which is what keeps `$( … )` (handled by its own extraction pass) and `${VAR}` untouched. */
const GROUP_OPENER = /(^|\s)([({]+)/g;
// …AND NEITHER IS A CLOSER. Glued to the LAST word, it would hide the stage from the cheap pre-filter and
// the exec head: `.sh)` fails SCRIPT_STAGE_HINT's `\.sh(?:\s|$)`, `bash)` fails its shell arm (the
// pipe-sink shape), and `execHead`'s token for `(/tmp/x.sh)` does not end in `.sh`. A closer run is blanked when what follows is
// whitespace, end, another separator, or a glued redirect (`)2>&1`) — never mid-word, so a path that
// genuinely contains `)` keeps it. Blanked, never removed: every index in this file points back into the
// original text. (A `)` that closes a `$( … )` is blanked here too; both consumers of this view look only
// for interpreter heads, and the substitution pass reads the RAW command.)
const GROUP_CLOSER = /[)}]+(?=[\s&;]|\d*[<>]|$)/g;

function ungroup(text) {
  return text.replace(GROUP_OPENER, (_m, pre, opener) => pre + " ".repeat(opener.length)).replace(GROUP_CLOSER, (m) => " ".repeat(m.length));
}

/** The same fix on the RAW side. `shellWords` treats `)` as an ordinary character, so the operand word of
 *  `(bash /tmp/x.sh)` is `/tmp/x.sh)`, which would stat as ENOENT and fail open unread. Every operand this guard resolves
 *  goes through `resolveScriptOperand`, so the strip lives there and `commandWrites` keys its map by the
 *  same stripped path (the write-then-run pair `(printf … > w.sh); bash w.sh` needs both sides to agree).
 *  Stripped only when the VALUE ends in the same noise the RAW word does — a quoted `"/tmp/a)b"` ends its
 *  raw word with the QUOTE, so its `)` is part of the path and survives.
 *
 *  A CLOSER IS NOT REQUIRED: a BACKGROUNDING `&` glued to the operand is noise too, so `bash /tmp/x.sh&`
 *  resolves `/tmp/x.sh` and its body is read. `&` is the commonest thing a lane glues to a scratch script.
 *  Every alternative consumes at least one character, so the `+` cannot loop on an empty match, and none of
 *  the classes appears in an ordinary path — a word with no trailing noise does not match at all. */
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
 *  shared reader (`wrapperPrefixEnd`). Returns the token list too, so a caller can look at the
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
 *  WHY IT EXISTS: an interpreter's operand is a PATH, and a path is the same file quoted or not. In the
 *  BLANKED text a quoted path is a run of spaces, so `bash "$SP/run.sh"` would resolve to nothing and
 *  `bash "/abs/run.sh" arg` to the trailing argument. Reading the operand off the RAW stage is safe because
 *  the exec head is still found in the BLANKED text, so a comment, a heredoc body or a quoted argument never
 *  conjures an invocation. */
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
  // A GROUP CLOSER OR A BACKGROUNDING `&` GLUED TO THE OPERAND IS NOT PART OF THE PATH — see stripOperandTail.
  const word = stripOperandTail(rawWord);
  const expanded = expandAssigned(word.value, vars);
  // `$HOME`/`${HOME}` resolve exactly like the `~/` this already expanded: the same variable and value.
  // `expandAssigned` runs first, so a command that assigns HOME itself still wins.
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
 *  generator, a fetch, a copy). Only consulted for a path the SAME command also executes: there the bytes
 *  on disk are stale or absent by construction. The house's own `cat > x.sh <<'EOF' … EOF; bash x.sh`
 *  wrapper idiom is this shape, so refusing it would wall the idiom, and reading the DISK would judge bytes
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
 *  THE CHANNEL IS NOT THE OPERAND: an interpreter takes its program from an operand, from stdin
 *  (`bash < f`, `cat f | bash`), from a heredoc, or from the current shell (`. f`), and each is judged
 *  where the program actually comes from. */
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
      // GROUPED: this stage carried a `(`/`{`/`)`/`}` that had to be blanked before its head and
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
        // any word beginning with `<` as a redirect, so `source <(grep … .env)` would skip the psub and
        // return grep's PATTERN as the "path".
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
 *  relative to the cwd inside an ordinary tree (`.git`, `../.git`) and absolute from a linked worktree,
 *  so it is resolved against `dir` before canonicalizing. Memoized: one
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
 *  THE REPOSITORY IS PINNED. If ANY repository could answer, "reviewed" would be forgeable in two commands:
 *  `git init /tmp/w; git -C /tmp/w add evil.sh`. Tracked-ness means tracked in the repository THIS HOOK
 *  belongs to, compared by `--git-common-dir` so every registered worktree of it still counts (a lane's
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
  // WRITTEN BY THIS COMMAND — judge what will LAND there, never what is on disk. For `printf '…' > x.sh;
  // bash x.sh` the file may not exist yet at classify time, or holds a PREVIOUS body the command is about
  // to overwrite. When the writer's output is not visible in the command text there is nothing to read,
  // so it asks.
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
    // TRACKED FIRST, THEN THE SIZE CAP. The cap exists so the guard never waves through an UNREVIEWED body
    // it could not read; a tracked file is reviewed by definition and is skipped whatever its size, and
    // refusing it for size would push a lane off the sanctioned spelling.
    if (isTrackedScript(file)) {
      return null; // reviewed code — the normal rules judge the command line, nothing more
    }
    if (stat.size > SCRIPT_MAX_BYTES) {
      return { decision: "ask", rule: "script-too-large", reason: REASONS.scriptTooLarge(file, stat.size), contexts: [] };
    }
    // Past the read depth: there IS an unreviewed body here and the guard is choosing not to open it, so
    // say so rather than wave it through. Reached only for a resolvable, untracked, readable file — a
    // wrapper ending in `exec bash scripts/dev/stack.sh` (tracked) is not this, and must not be asked about.
    if (depth >= SCRIPT_DEPTH_CAP) {
      return { decision: "ask", rule: "script-depth-cap", reason: REASONS.scriptDepthCap(file), contexts: [] };
    }
    body = readFileSync(file, "utf8");
  } catch {
    // missing / unreadable / a directory: the command would fail anyway, so the guard has nothing to
    // judge and says so by staying silent (fail-open — the guard breaking must never block work).
    //
    // …EXCEPT FROM A GROUPED CLAUSE. Fail-open assumes the path the guard resolved is the path the SHELL
    // will run, and inside a `( … )`/`{ … }` a glued group character is exactly how a path comes out
    // mis-parsed: ENOENT there is not "the command dies anyway". The operand stripping is the real fix; this
    // arm is the backstop for the next glued character, because a guard that cannot identify what will
    // execute must not return a content verdict (silence IS one, since pass means allow).
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
    // FAIL CLOSED, LEGIBLY (owner ruling): a scan failure must never become allow, and a bare
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

/** What a CHILD PROCESS this command starts can see of its variables, as `{env, shellLocal}`.
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
      // A VAR-ONLY operand: the question is WHO EXPANDS IT, and the answer is the quoting.
      //   · `eval '$CMD'` re-parses in the SAME shell, so even a single-quoted `$CMD` expands from the
      //     shell's own variables. Unchanged: the command's assignments are the right source.
      //   · `bash -c "$CMD"` / `bash -c $CMD`: the PARENT expands before the child exists. Same source.
      //   · `bash -c '$CMD'`: the parent expands NOTHING. The child expands `$CMD` from its ENVIRONMENT,
      //     which carries only what this command EXPORTED — and a bare `CMD='git stash'` is shell-LOCAL,
      //     so the child's `$CMD` is unset and the command it runs is the EMPTY STRING. Resolving it from
      //     the parent's assignments would deny `CMD="git stash"; bash -c '$CMD'`, a command that does
      //     nothing. An assignment PREFIX (`CMD=… bash -c '$CMD'`) DOES reach the child, so it is read.
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
 *  ESCAPES ARE HONOURED HERE, unlike `blankQuoted`, which treats a `\"` as OPENING a quote (it checks the
 *  backslash only when CLOSING one). A substitution nested in double quotes must escape its own inner
 *  quotes, so with `blankQuoted` `echo "$(rm -rf \"packages/server/src\")"` would open a phantom quoted span
 *  at the `\"`, swallow the closing paren and drop the substitution entirely. `blankQuoted`'s job is to
 *  blank spans for the RULE regexes, not to parse shell escapes, so this walk is self-contained. */
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
 *  that is itself inside a comment, which the quote map alone reads as live. The exception is the body of
 *  a heredoc whose delimiter is unquoted (`<<EOF`): bash expands a substitution there, quotes in it are
 *  plain characters, and only a backslash makes a `$(` or backtick literal. Nested substitutions are not
 *  returned separately — the recursion through
 *  `classify` reaches them from the body it is handed. */
export function commandSubstitutions(command) {
  const quoted = blankQuoted(command);
  const units = heredocUnits(command, blankComments(command, quoted));
  const inBody = (at) => units.some((u) => at >= u.bodyStart && at < u.bodyEnd);
  const text = [
    // bash has no comments inside a heredoc body: a `#` there is text, and a `$(` after it still expands
    ...commentSpans(command, quoted).filter(([start]) => !inBody(start)),
    ...units.flatMap((u) => [[u.opStart, u.opEnd], u.quoted ? [u.bodyStart, u.spanEnd] : [u.bodyEnd, u.spanEnd]]),
  ];
  const spans = quoteSpans(command);
  const spanAt = (at) => spans.find((s) => at > s.start && at < s.end);
  const isText = (at) => text.some(([start, stop]) => at >= start && at < stop);
  const inExpandedBody = (at) => units.some((u) => !u.quoted && at >= u.bodyStart && at < u.bodyEnd);
  const found = [];
  let i = 0;
  while (i < command.length) {
    const isDollar = command[i] === "$" && command[i + 1] === "(";
    if (!isDollar && command[i] !== "`") {
      i += 1;
      continue;
    }
    const literal = inExpandedBody(i) ? escapedAt(command, i) : spanAt(i)?.quote === "'";
    if (isText(i) || literal) {
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
    // broke, and falling through to the permission flow stalls a subagent mid-turn with no report. A
    // visible advisory keeps the breakage findable without a stall.
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

/** SECURITY: what would `classify` have said about `command` with `clause` — the ONE clause a rewrite rule
 *  just vetted and is about to `allow` — deleted? A rewrite rule (`bareHarnessRewrite`, `pipeRewrite`,
 *  `artifactPipeRewrite`, `playwrightRewrite`) proves only the clause it rewrites is safe, and its early
 *  `return` would otherwise skip every later rule for a DIFFERENT clause in the same command:
 *  `pnpm check > /tmp/x; rm -rf /` must not come out a clean `allow`. The remainder is always
 *  STRICTLY SHORTER than `command` (the excluded clause's own span is gone), so recursing through the
 *  full `classify` cannot loop forever, and reusing it (rather than a second copy of rules 1-11) is what
 *  keeps this catching a heredoc/script-body/nested-command danger in the OTHER clause too, not just a
 *  flat regex scan. The two replaces trim the ONE separator now dangling where the deleted clause joined
 *  its neighbor — at most one of them ever matches (the clause was first, last, or the whole
 *  command), and a doubled `&&` `;` from a MIDDLE deletion is left for `classify` to parse as it lands:
 *  still no less safe than doing nothing, since the danger-detecting rules test `blank` as a whole string,
 *  not per well-formed clause. */
function remainderVerdict(command, clause, ctx) {
  const remainder = (command.slice(0, clause.start) + command.slice(clause.end)).replace(/^\s*(?:&&|\|\||;)\s*/, "").replace(/\s*(?:&&|\|\||;)\s*$/, "");
  return remainder.trim() === "" ? null : classify(remainder, ctx);
}

/** Gate a rewrite's `allow` against `remainderVerdict` — the stricter of the two wins (`mergeVerdicts`),
 *  so a rewrite can never launder a dangerous clause it did not itself vet. Every `decision: "allow",
 *  rewrite: …` a rewrite rule builds must be returned through this, never directly. */
function gateRewrite(pending, command, clause, ctx) {
  return mergeVerdicts(pending, remainderVerdict(command, clause, ctx));
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

/** Is this an `until`/`while … do` loop whose condition polls for a harness process with `pgrep`/`pidof`/
 *  `ps | grep`? A ONE-SHOT pgrep — no enclosing loop — never reaches this: the loop head must be found
 *  first, and the condition text is everything between it and the loop's own `do`. The harness-name check
 *  reads the RAW command (quoting still applies inside `-f "…"`, which `blank` erases), so the pattern
 *  actually has to name a harness, not merely sit near the word `until`. */
function pgrepHarnessWaitLoop(command, blank) {
  return shellLoops(blank).some((loop) => {
    if ((loop.kind !== "while" && loop.kind !== "until") || loop.doAt === undefined) {
      return false;
    }
    const condBlank = blank.slice(loop.start, loop.doAt);
    return (PGREP_OR_PIDOF.test(condBlank) || PS_PIPE_GREP.test(condBlank)) && HARNESS_NAME_HINT.test(command.slice(loop.start, loop.doAt));
  });
}

/** Is this an `until`/`while … do … done` loop with a `sleep` in its BODY (the part that actually runs
 *  each cycle) — any condition, not only a harness name? Broader than `pgrepHarnessWaitLoop` above: that
 *  one is scoped to the specific cross-checkout collision a process-name poll causes, this one is the
 *  general case (a `curl`/`grep`/`test -f` condition polls exactly as wastefully). The two never fire on
 *  the same loop redundantly in practice — `pgrepHarnessWaitLoop` returns first and this one is only
 *  reached for loops it did not already catch — but either alone is a complete deny for its own shape. */
function foregroundWaitLoopWithSleep(blank) {
  return shellLoops(blank).some((loop) => (loop.kind === "while" || loop.kind === "until") && loop.bodySleeps);
}

/** Body spans (after `do`, before the matching `done`) of every `for … do … done` loop in the command —
 *  a BOUNDED iteration count, unlike `until`/`while`. A retry idiom capped at N tries (`for i in $(seq 1
 *  60); do curl … && break; sleep 1; done`) is real, sanctioned work (it appears in this repo's own dev-
 *  stack-boot scripts), so a `sleep` clause inside one of these spans is exempt from the bare-foreground-
 *  sleep rule below regardless of its duration. */
function forLoopBodySpans(blank) {
  return shellLoops(blank)
    .filter((loop) => loop.kind === "for" && loop.bodyStart !== undefined)
    .map((loop) => [loop.bodyStart, loop.bodyEnd]);
}

/** Is any CLAUSE in this command nothing but a foreground `sleep <n>`, above the settle-delay threshold,
 *  and outside a bounded `for` loop's body? Checked per clause so a chained shape (`sleep 300; tail log`)
 *  is caught by its own clause — the clause after it does not need to be a sleep too. */
function bareForegroundSleepClause(blank, clauses) {
  const forSpans = forLoopBodySpans(blank);
  for (const clause of clauses) {
    const stage = clause.stages[0];
    if (forSpans.some(([start, end]) => stage.start >= start && stage.end <= end)) {
      continue;
    }
    const operands = sleepClauseOperands(blank, clause);
    if (operands === null) {
      continue;
    }
    const literal = operands.length === 1 ? operands[0].match(SLEEP_LITERAL_SECONDS) : null;
    if (literal !== null && Number(literal[1]) <= SLEEP_EXEMPT_MAX_SECONDS) {
      continue;
    }
    return true;
  }
  return false;
}

/** The operands of a clause whose work is one `sleep`, or null. The sleep may be grouped, path-prefixed,
 *  backslash-escaped, behind `command` or a wrapper prefix, redirected, or piped into a no-op consumer. */
function sleepClauseOperands(blank, clause) {
  const [first, ...consumers] = clause.stages;
  if (!consumers.every((s) => NOOP_CONSUMER.test(ungroup(blank.slice(s.start, s.end)).trim()))) {
    return null;
  }
  return sleepHeadOperands(blank.slice(first.start, first.end));
}

/** The operands of a single command whose head is `sleep`, through the same prefixes as above, or null. */
function sleepHeadOperands(text) {
  const { tokens, index } = execHead(text.replace(REDIRECT_TOKEN, " "));
  const words = tokens.map((t) => t[0]);
  const i = prefixKeywordsEnd(words, index);
  return words[i] !== undefined && SLEEP_BIN.test(words[i]) ? words.slice(i + 1) : null;
}

/** Advance past `command`/`time` prefix keywords, and the wrapper prefix after each, to the exec head. */
function prefixKeywordsEnd(words, start) {
  let i = start;
  while (PREFIX_KEYWORDS.has(words[i])) {
    i = wrapperPrefixEnd(words, words[i] === "time" && words[i + 1] === "-p" ? i + 2 : i + 1);
  }
  return i;
}

/** Is the command's only work `sleep`: every clause a sleep or a no-op, and at least one sleep? Nothing
 *  real runs, so even a 1s sleep or a backgrounded one only spends a tool call. */
function sleepOnlyCommand(command, blank, clauses) {
  let sawSleep = false;
  for (const clause of clauses) {
    if (sleepClauseOperands(blank, clause) !== null) {
      sawSleep = true;
      continue;
    }
    const text = ungroup(blank.slice(clause.start, clause.end)).trim();
    if (clause.stages.length !== 1 || (text !== "" && !NOOP_CLAUSE.test(text)) || SUBSTITUTION_OPEN.test(command.slice(clause.start, clause.end))) {
      return false;
    }
  }
  return sawSleep;
}

/** Every `for`/`select`/`while`/`until` loop in the command as `{kind, start, doAt, bodyStart, bodyEnd, end,
 *  sleeps, bodySleeps}` (`doAt`/`bodyStart` are unset for a loop with no `do`), found from shell
 *  structure: the keyword counts only in command position, and each loop closes at its own `done` with
 *  nesting counted. A loop keyword used as a plain word (`echo waiting until ready`, `ls src/while`) and
 *  a `done` that is an argument (`echo not done`) are neither. An unclosed loop runs to the end. */
function shellLoops(blank) {
  const loops = [];
  const open = [];
  // One entry per open `(`: a `$(`/`$((` substitution restores the state saved at its opener when it closes,
  // since it sits inside a word; a subshell or arithmetic group is followed by operators only.
  const parens = [];
  const cases = [];
  let backtick = null;
  let commandPosition = true;
  // After a subshell or arithmetic `)` only operators follow, except a reserved closer: `(cd d && ls) done`.
  let closerOnly = false;
  for (const m of blank.matchAll(SHELL_TOKEN)) {
    const token = m[0];
    const kase = cases.at(-1);
    const closerAllowed = closerOnly && RESERVED_CLOSERS.has(token);
    closerOnly = false;
    if (kase?.phase === "pattern") {
      // An extglob group (`@(a|b)`, `+(x)`) opens glued to its operator and closes inside the pattern.
      if (token === "(" && EXTGLOB_OPERATOR.test(blank[m.index - 1] ?? "")) {
        kase.extglob += 1;
      } else if (token === ")" && kase.extglob > 0) {
        kase.extglob -= 1;
      } else if (token === ")") {
        kase.phase = "body";
        commandPosition = true;
      } else if (token === "esac") {
        cases.pop();
        commandPosition = false;
      }
      continue;
    }
    if ((token === "`" || token === "(" || token === ")") && escapedAt(blank, m.index)) {
      continue;
    }
    if (token === "`") {
      [backtick, commandPosition] = backtick === null ? [commandPosition, true] : [null, backtick];
      continue;
    }
    if (token === "(") {
      parens.push({ substitution: blank[m.index - 1] === "$", saved: commandPosition });
      commandPosition = true;
      continue;
    }
    if (token === ")") {
      const paren = parens.pop();
      commandPosition = paren?.substitution === true ? paren.saved : false;
      closerOnly = paren?.substitution !== true;
      continue;
    }
    if (kase?.phase === "body" && token === ";" && (blank[m.index + 1] === ";" || blank[m.index + 1] === "&")) {
      kase.phase = "pattern";
      continue;
    }
    if (SHELL_OPERATOR.test(token)) {
      commandPosition = true;
      continue;
    }
    if (kase?.phase === "head") {
      if (token === "in") {
        kase.phase = "pattern";
      }
      continue;
    }
    if (!commandPosition && !closerAllowed) {
      continue;
    }
    if (token === "case") {
      cases.push({ phase: "head", extglob: 0 });
    } else if (token === "esac" && kase !== undefined) {
      cases.pop();
    } else if (LOOP_KEYWORDS.has(token)) {
      open.push({ kind: token, start: m.index, sleeps: false, bodySleeps: false });
    } else if (token === "do") {
      const loop = open.at(-1);
      if (loop !== undefined && loop.doAt === undefined) {
        loop.doAt = m.index;
        loop.bodyStart = m.index + token.length;
      }
    } else if (token === "done") {
      const loop = open.pop();
      if (loop !== undefined) {
        loops.push({ ...loop, bodyEnd: m.index, end: m.index + token.length });
      }
    } else if (sleepHeadOperands(blank.slice(m.index).match(SIMPLE_COMMAND_TEXT)[0]) !== null) {
      for (const loop of open) {
        loop.sleeps = true;
        loop.bodySleeps ||= loop.bodyStart !== undefined;
      }
    }
    commandPosition = COMMAND_FOLLOWS.has(token) || ASSIGN_PREFIX.test(token);
  }
  return [...loops, ...open.map((loop) => ({ ...loop, bodyEnd: blank.length, end: blank.length }))];
}

/** Does the command wait on a harness task file: an `until`/`while` loop that reads one, a `for`/`select`
 *  loop that reads one and sleeps, or a `tail -f` of one? Read on the RAW text, since a quoted path is
 *  blanked in `blank`, with the command's own earlier assignments expanded, so `D=<task dir>; until [ -f
 *  "$D/x.done" ]` is seen too. */
function harnessTaskFileWait(command, blank, clauses) {
  const readsTaskFile = (start, end) => HARNESS_TASK_FILE.test(expandAssigned(command.slice(start, end), assignedVars(command, blank, clauses, start)));
  for (const loop of shellLoops(blank)) {
    const waits = loop.kind === "while" || loop.kind === "until" || loop.sleeps;
    if (waits && readsTaskFile(loop.start, loop.end)) {
      return true;
    }
  }
  for (const clause of clauses) {
    for (const stage of clause.stages) {
      const { tokens, index, exec } = execHead(blank.slice(stage.start, stage.end));
      if (
        exec !== undefined &&
        TAIL_BIN.test(exec[0]) &&
        tokens.slice(index + 1).some((t) => TAIL_FOLLOW_FLAG.test(t[0])) &&
        readsTaskFile(stage.start, stage.end)
      ) {
        return true;
      }
    }
  }
  return false;
}

/** The (kind, target) a whole command reads as a status check — or null if it is not, in whole, one of
 *  the shapes this rule tracks. Scoped to a command that IS ONLY the read (one clause, one stage): a read
 *  chained into real work is not a poll, it is a step. */
function statusReadTargetKind(command, blank, clauses) {
  if (clauses.length !== 1 || clauses[0].stages.length !== 1) {
    return null;
  }
  const stage = clauses[0].stages[0];
  const stageBlank = blank.slice(stage.start, stage.end);
  const stageRaw = command.slice(stage.start, stage.end).replace(TRAILING_REDIRECT_MERGE, "").trim();
  const target = stageRaw.split(/\s+/).at(-1) ?? "";
  if (PNPM_CHECK_SHOW_HEAD.test(stageBlank)) {
    return { kind: "artifact", target: "pnpm check:show" };
  }
  if (PS_P_HEAD.test(stageBlank) || KILL_ZERO_HEAD.test(stageBlank)) {
    return { kind: "pid", target };
  }
  if (LOG_READ_HEAD.test(stageBlank)) {
    return { kind: "log", target };
  }
  return null;
}

// Read-streak state, one record per agent/session key: `{kind, target, count}`. A real hook invocation is
// a FRESH PROCESS per Bash call, so the record has to survive on disk (reports/tool-guard/reads/<key>.json,
// same shape as `firstContact`'s marker directory — bounded, one small file per key). `--classify-batch`
// and the corpus replay call `classify` many times in ONE process, so the in-memory cache below does the
// work there; replay pins `ctx.projectDir` to a nonexistent path, so the fs half no-ops. The batch entry
// point's "no side effects" promise is about the tree this guard protects, not this internal counter.
const READ_STREAK_CACHE = new Map();

function readStreakState(projectDir, key) {
  if (READ_STREAK_CACHE.has(key)) {
    return READ_STREAK_CACHE.get(key);
  }
  try {
    return JSON.parse(readFileSync(path.join(projectDir, "reports", "tool-guard", "reads", `${key}.json`), "utf8"));
  } catch {
    return null;
  }
}

function writeStreakState(projectDir, key, state) {
  READ_STREAK_CACHE.set(key, state);
  try {
    const dir = path.join(projectDir, "reports", "tool-guard", "reads");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(state));
  } catch {
    // best-effort fs persistence — the in-memory cache above already gives the SAME-process callers
    // (--classify-batch, replay) a correct answer even when projectDir is unwritable.
  }
}

// One state key per agent, or per session for the main agent; also a file name, so it is sanitised.
function streakKey(ctx) {
  return String(ctx.agentId ?? ctx.sessionId ?? "main").replace(/[^\w.-]/g, "_");
}

/** Update this agent/session's read streak for the current command and say whether it is the THIRD (or
 *  later) consecutive read of the same target. Any command that is NOT one of the tracked status-read
 *  shapes resets the streak — "no other command between" is the rule, so real work in between clears it. */
function repeatedStatusReadDeny(ctx, command, blank, clauses) {
  const key = streakKey(ctx);
  const read = statusReadTargetKind(command, blank, clauses);
  if (read === null) {
    writeStreakState(ctx.projectDir, key, null);
    return null;
  }
  const prev = readStreakState(ctx.projectDir, key);
  const count = prev !== null && prev.kind === read.kind && prev.target === read.target ? prev.count + 1 : 1;
  writeStreakState(ctx.projectDir, key, { kind: read.kind, target: read.target, count });
  return count >= STATUS_READ_STREAK_DENY_AT ? { target: read.target, count } : null;
}

/** The whole-tree family a stage runs (`check`, `verify`, `test`, `check:instrument-affected`, `e2e`), or
 *  null. `pnpm check`/`pnpm verify` with `--changed` are scoped, and so is every other `check:<gate>`. */
function wholeTreeFamily(stageBlank) {
  const { tokens, index, exec } = execHead(stageBlank);
  if (exec === undefined || !/^(?:\S*\/)?pnpm$/.test(exec[0])) {
    return null;
  }
  const rest = tokens.slice(index + 1).map((t) => t[0]);
  const at = rest[0] === "run" ? 1 : 0;
  const script = rest[at];
  const args = rest.slice(at + 1);
  if ((script === "check" || script === "verify") && !args.includes("--changed")) {
    return script;
  }
  if (script === "test" || script === "check:instrument-affected") {
    return script;
  }
  return script?.startsWith("e2e") === true ? "e2e" : null;
}

/** The whole-tree note for a subagent, once per agent per family. */
function wholeTreeNote(ctx, blank, clauses) {
  if (!ctx.agentId) {
    return null;
  }
  const families = clauses.flatMap((cl) => cl.stages.map((st) => wholeTreeFamily(blank.slice(st.start, st.end)))).filter((f) => f !== null);
  if (families.length === 0) {
    return null;
  }
  const key = `${streakKey(ctx)}.whole-tree`;
  const noted = readStreakState(ctx.projectDir, key) ?? [];
  const fresh = families.filter((f) => !noted.includes(f));
  if (fresh.length === 0) {
    return null;
  }
  writeStreakState(ctx.projectDir, key, [...noted, ...fresh]);
  return CONTEXTS.wholeTreeRun;
}

/** The Read tool on a background task's output file. A repeat of the same range within
 *  TASK_REREAD_WINDOW_MS of the previous one is a poll, so it denies; a first read or a later reread
 *  passes. Every such Read also counts as a status read of that path, so a Bash re-read after it continues
 *  the same streak. Null when the Read is not this rule's business. */
function taskOutputReadVerdict(filePath, range, ctx) {
  if (!HARNESS_TASK_OUTPUT.test(filePath)) {
    return null;
  }
  // A chunked read of a large finished output is not a poll, so each offset/limit range is its own target.
  // A whole-file Read keys on the bare path, the same target a Bash `tail` of that file records.
  const target = range.offset === undefined && range.limit === undefined ? filePath : `${filePath}#${range.offset ?? ""}:${range.limit ?? ""}`;
  const key = streakKey(ctx);
  const prev = readStreakState(ctx.projectDir, key);
  const count = prev !== null && prev.kind === "log" && prev.target === target ? prev.count + 1 : 1;
  writeStreakState(ctx.projectDir, key, { kind: "log", target, count });
  const seenKey = `${key}.task-output`;
  const seen = readStreakState(ctx.projectDir, seenKey) ?? {};
  const last = seen[target];
  writeStreakState(ctx.projectDir, seenKey, { ...seen, [target]: ctx.now });
  if (last === undefined || ctx.now - last > TASK_REREAD_WINDOW_MS) {
    return null;
  }
  return { decision: "deny", rule: "task-output-reread", reason: REASONS.taskOutputReread(filePath) };
}

// ── drizzle-kit, subagent-scoped (owner directive): parallel lanes generating migrations
// collide on migration numbers, so a SUBAGENT never runs a verb that writes one or touches the live db.
// `check` (this repo's own `pnpm check:drizzle-kit`) reads the schema against the migrations on disk and
// writes nothing — never this rule's business, for anyone. ──
const DRIZZLE_KIT_BIN = /^(?:\S*\/)?drizzle-kit$/;
const DRIZZLE_KIT_DENY_VERBS = new Set(["generate", "migrate", "push", "drop", "up", "studio"]);

/** The drizzle-kit VERB a stage invokes, through every sanctioned runner spelling — bare/path-prefixed,
 *  `npx`, and `pnpm` (`exec`/`dlx`, with an optional `--filter <pkg>` ahead of `exec`) — or null if this
 *  stage does not invoke drizzle-kit at all. Reuses `execHead`'s wrapper-prefix skip (env/timeout/nice/
 *  setsid stack ahead of any of these still resolves to the real exec head). */
function drizzleKitVerb(blank, clauses) {
  for (const clause of clauses) {
    for (const stage of clause.stages) {
      const { tokens, index, exec } = execHead(blank.slice(stage.start, stage.end));
      if (exec === undefined) {
        continue;
      }
      const rest = tokens.slice(index + 1).map((t) => t[0]);
      const verbAfter = (words) => words.find((w) => !w.startsWith("-"));
      if (DRIZZLE_KIT_BIN.test(exec[0])) {
        const verb = verbAfter(rest);
        if (verb !== undefined) {
          return verb;
        }
        continue;
      }
      if (NPX_HEAD.test(exec[0])) {
        const toolIndex = rest.findIndex((w) => !w.startsWith("-"));
        if (toolIndex !== -1 && DRIZZLE_KIT_BIN.test(rest[toolIndex])) {
          const verb = verbAfter(rest.slice(toolIndex + 1));
          if (verb !== undefined) {
            return verb;
          }
        }
        continue;
      }
      if (!/^(?:\S*\/)?pnpm$/.test(exec[0])) {
        continue;
      }
      let i = 0;
      if (rest[i] === "--filter") {
        i += 2; // `--filter <pkg>` — the value is a separate word, consumed with the flag
      }
      if (rest[i] === "exec" || rest[i] === "dlx") {
        i += 1;
      } else {
        continue; // `pnpm --filter <pkg> drizzle-kit …` with no `exec` is not a runnable pnpm shape
      }
      if (rest[i] !== undefined && DRIZZLE_KIT_BIN.test(rest[i])) {
        const verb = verbAfter(rest.slice(i + 1));
        if (verb !== undefined) {
          return verb;
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
 * @param {{cwd?: string, agentId?: string|null, sessionId?: string|null, projectDir: string, timeout?: number,
 *          now: number, procRoot?: string, scriptDepth?: number, nestedDepth?: number, runInBackground?: boolean}} ctx
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
  //     test: a command that merely names one of the files is judged by every rule.
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

  // 0e. a third (or later) consecutive read of the same status target — DENY:
  //     `tail`/`head`/`wc`/`cat`/`grep` on the same log, `ps -p`/`kill -0` on the same pid, or
  //     `pnpm check:show`, re-run with nothing else in between. The first two are a normal check-in. FIRST
  //     in this function on purpose (not grouped with 9e-9g below): its state update has to run for EVERY
  //     command that reaches here, including one a later rule allows or denies for an unrelated reason —
  //     a real command running between two reads has to break the streak, and it can only do that if this
  //     check sees it before an early return elsewhere skips the rest of the function.
  const repeatedRead = repeatedStatusReadDeny(ctx, command, blank, clauses);
  if (repeatedRead !== null) {
    return { decision: "deny", rule: "repeated-status-read", reason: REASONS.repeatedStatusRead(repeatedRead.target, repeatedRead.count), contexts };
  }

  // 0f. a whole-tree run from a subagent still runs, with a once-per-family note that it is normally the
  //     orchestrator's. Pushed first so a rewrite of the same command carries it too.
  const wholeTree = wholeTreeNote(ctx, blank, clauses);
  if (wholeTree !== null) {
    contexts.push(wholeTree);
  }

  // 1. destructive git (doctrine ban) — DENY. Read-only forms pass:
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
  const skipsHooks = clauses.some((cl) => cl.stages.some((st) => gitSkipsHooks(blank.slice(st.start, st.end), command.slice(st.start, st.end))));
  if (skipsHooks || GIT_NO_VERIFY.test(blank) || GIT_C_HOOKSPATH.test(blank)) {
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

  // 2. biome write-mode — blast radius decides (owner ruling): a WHOLE-TREE fix-all is the
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

  // 3. cd into a lane worktree — MAIN SESSION: DENY (a persisted cwd lands a main-session commit on a lane
  //    branch; orchestrator law is `git -C`, always). SUBAGENT: WARN — a lane cd-ing into its own worktree
  //    is routine, and own-vs-foreign is undecidable once the lane's cwd has been reset to the repo root.
  const cdTarget = blank.match(CD_WORKTREE);
  if (cdTarget) {
    if (!ctx.agentId) {
      return { decision: "deny", rule: "cd-worktree", reason: REASONS.cdWorktree, contexts };
    }
    if (laneName(ctx.cwd ?? "") !== cdTarget[1]) {
      contexts.push(CONTEXTS.cdWorktreeLaneCtx);
    }
  }

  // 3b. AN OVER-CAP WORKER COUNT — DENY. Ahead of the two REWRITE rules on
  //     purpose: a rewrite would carry `--workers=8` verbatim into the sanctioned script, laundering the
  //     one number this rule exists to hold. (Its sibling, the un-floored heavy-tool family, sits at 5b
  //     instead — see there.)
  const overCap = overCapWorkers(blank, clauses);
  if (overCap !== null) {
    return { decision: "deny", rule: "worker-over-cap", reason: REASONS.workerOverCap(overCap.asked, overCap.cap), contexts };
  }

  // 4a. harness redirected to a file, or piped into a pure `tee` capture sink — REWRITE by dropping the
  //     redirect/sink outright: the harness writes its own reports/
  //     artifacts regardless of where stdout goes, so a private capture is never necessary and only
  //     tempts a later poll of that file instead of reading the harness's own exit code.
  const bareRewrite = bareHarnessRewrite(command, blank, clauses, HARNESS_RUN_HEAD);
  if (bareRewrite) {
    contexts.push(CONTEXTS.rewriteRedirectDropped);
    return gateRewrite({ decision: "allow", rule: "harness-redirect", rewrite: { command: bareRewrite.command }, contexts }, command, bareRewrite.clause, ctx);
  }

  // 4b. harness piped into a real reader — REWRITE the simple shape, DENY the rest. The harness must be at
  //     a pipeline HEAD (env/timeout/nice wrappers allowed) — mid-text
  //     mentions can never fire. A verify-family harness (`pnpm check[:x]`, `pnpm verify`) or a known-
  //     artifact test harness (`pnpm test`/`test:node`/`test:tooling`/`test:ct`) is rewritten against its
  //     REAL on-disk artifact (`artifactPipeRewrite`) rather than a private log; anything else (lint,
  //     typecheck, e2e, gate, snap, bare vitest, `test:scoped`) keeps the general private-log rewrite.
  const harnessPiped = clauses.some((cl) => cl.stages.length > 1 && HARNESS_RUN_HEAD.test(blank.slice(cl.stages[0].start, cl.stages[0].end)));
  if (harnessPiped) {
    const artifact = artifactPipeRewrite(command, blank, clauses);
    if (artifact) {
      contexts.push(CONTEXTS.rewritePipedArtifact(artifact.target));
      if (artifact.readerStatus) {
        contexts.push(CONTEXTS.rewriteReaderStatus);
      }
      const timeout = ctx.timeout === undefined ? REWRITE_TIMEOUT_MS : undefined;
      return gateRewrite(
        { decision: "allow", rule: "harness-piped", rewrite: { command: artifact.command, timeout }, contexts },
        command,
        artifact.clause,
        ctx,
      );
    }
    const rewrite = pipeRewrite(command, blank, clauses, (b) => HARNESS_RUN_HEAD.test(b), ctx);
    if (rewrite) {
      contexts.push(CONTEXTS.rewritePiped(rewrite.log));
      if (rewrite.readerStatus) {
        contexts.push(CONTEXTS.rewriteReaderStatus);
      }
      const timeout = ctx.timeout === undefined ? REWRITE_TIMEOUT_MS : undefined;
      return gateRewrite(
        { decision: "allow", rule: "harness-piped", rewrite: { command: rewrite.command, timeout, log: rewrite.log }, contexts },
        command,
        rewrite.clause,
        ctx,
      );
    }
    return { decision: "deny", rule: "harness-piped", reason: REASONS.harnessPipedDeny, contexts };
  }

  // 4c. `pnpm doc`: a lane never runs a board-writing verb. Read with line continuations joined, so
  //     `pnpm doc \⏎ set 5` is one call rather than a bare `pnpm doc` and a separate `set` command.
  if (ctx.agentId) {
    const joined = joinContinuations(command, blank);
    for (const clause of parseStructure(joined.blank)) {
      for (const stage of clause.stages) {
        const call = docCall(joined.blank.slice(stage.start, stage.end), joined.raw.slice(stage.start, stage.end));
        if (call !== null && !call.help && DOC_WRITE_VERBS.has(call.verb)) {
          return { decision: "deny", rule: "doc-write-lane", reason: REASONS.docWriteLane(call.verb), contexts };
        }
      }
    }
  }

  // 5. harness failure swallowed (`|| true`) — DENY
  if (HARNESS_OR_TRUE.test(blank) || HARNESS_SEMI_TRUE.test(blank)) {
    return { decision: "deny", rule: "harness-swallowed", reason: REASONS.harnessSwallowed, contexts };
  }

  // 5b. A HEAVY TOOL THROUGH AN UN-FLOORED SPELLING — DENY WITH THE DOOR.
  //     AFTER the two harness rules and BEFORE the CT rewrite, deliberately: a command that is BOTH a
  //     piped harness and an un-floored tool (`npx tsc | head -5; pnpm typecheck 2>&1 | tail -15`) denies
  //     either way, and the pipe is the older, better-taught diagnosis — so the harness rule keeps the
  //     verdict and triage keeps reading one rule id for one shape. Ahead of rule 6 because that one is a
  //     REWRITE, and a rewrite must never be reached by a spelling this rule refuses.
  const heavy = heavyToolDoor(blank, clauses);
  if (heavy !== null) {
    return { decision: "deny", rule: "heavy-tool-unfloored", reason: REASONS.heavyToolUnfloored(heavy.tool, heavy.door), contexts };
  }

  // 5c. drizzle-kit, subagent-scoped — DENY a verb that writes a migration or touches the live db:
  //     a parallel lane generating a migration collides with a sibling's
  //     migration NUMBER, and only the orchestrator on main serializes that. `check` (read-only) and a
  //     main-session caller (no agentId) both pass untouched.
  if (ctx.agentId) {
    const verb = drizzleKitVerb(blank, clauses);
    if (verb !== null && DRIZZLE_KIT_DENY_VERBS.has(verb)) {
      return { decision: "deny", rule: "drizzle-kit-subagent", reason: REASONS.drizzleKitSubagent(verb), contexts };
    }
  }

  // 6. playwright CT — the sanctioned spelling is the SCRIPT (`pnpm test:ct <paths>`), so every raw
  //    playwright run with CT intent is rewritten into it, or denied when the shape is too complex to
  //    rewrite. e2e invocations (no CT hint) are not this rule's business. A raw runner takes no exclusion
  //    lock and no host slot, whatever cache it clears first, so no raw spelling passes. A piped run needs
  //    no branch here: the rewritten spelling is a `pnpm test:*` harness head, which rule 4 handles.
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
        return gateRewrite({ decision: "allow", rule: "playwright-ct", rewrite: { command: rewritten, timeout }, contexts }, command, clauses.at(-1), ctx);
      }
      return { decision: "deny", rule: "playwright-ct", reason: REASONS.playwrightCt, contexts };
    }
  }

  // 7. sg-as-ast-grep — static WARN (owner ruling): `sg` is deprecated upstream (the tool
  //    itself warns), and the newgrp collision is PRESENT on this box, merely shadowed by PATH order.
  //    No runtime check — the rule holds regardless of which binary wins.
  if (SG_AS_AST_GREP.test(blank)) {
    contexts.push(CONTEXTS.sgDeprecated);
  }

  // 8. force push — ASK (owner judgment)
  if (GIT_PUSH_FORCE.test(blank)) {
    return { decision: "ask", rule: "git-push-force", reason: REASONS.pushForce, contexts };
  }

  // 9. any push from a LANE — ASK (standing law: lanes never push; orchestrator merges, owner words pushes)
  if (ctx.agentId && GIT_PUSH.test(blank)) {
    return { decision: "ask", rule: "lane-git-push", reason: REASONS.lanePush, contexts };
  }

  // 9b. ANY push, from anywhere — ASK. `git push` is deliberately absent from settings.json's allowlist,
  //     and pass means allow, so a silent fall-through here would push to origin with no word at all: the
  //     one thing the standing law forbids outright.
  if (GIT_PUSH.test(blank)) {
    return { decision: "ask", rule: "git-push", reason: REASONS.ownerWordPush, contexts };
  }

  // 9c. rg -r/--replace GLUED to a shorthand flag cluster (`-rln`) — DENY. ripgrep silently REPLACES
  //     matched text instead of listing it, with no error (owner ruling).
  //     Scoped to an `rg` HEAD stage only — the same glued cluster on an unrelated tool is not this rule.
  for (const clause of clauses) {
    for (const stage of clause.stages) {
      const text = blank.slice(stage.start, stage.end);
      if (RG_HEAD.test(text) && RG_REPLACE_MANGLE.test(text)) {
        return { decision: "deny", rule: "rg-replace-mangle", reason: REASONS.rgReplaceMangle, contexts };
      }
    }
  }

  // 9d. a pgrep/pidof/`ps … | grep` WAIT LOOP polling for a harness — DENY: the pattern matches EVERY
  //     checkout on the box, so a sibling's orphaned `verify/cli.ts` process blocks a lane that has nothing
  //     to do with it. Scoped to `until`/`while … do` — a ONE-SHOT `pgrep` inspection outside a loop stays
  //     allowed. Gated on `!ctx.runInBackground`: the identical loop run in the background is the sanctioned
  //     fix this reason teaches (rule 9f shares the same gate for the general-condition case).
  //     A loop on a harness task file comes first and is NOT gated on `run_in_background`: the harness
  //     already notifies on that task's exit, so backgrounding the loop is still pure polling.
  if (harnessTaskFileWait(command, blank, clauses)) {
    return { decision: "deny", rule: "task-file-wait", reason: REASONS.taskFileWait, contexts };
  }
  if (!ctx.runInBackground && pgrepHarnessWaitLoop(command, blank)) {
    return { decision: "deny", rule: "pgrep-wait-loop", reason: REASONS.pgrepWaitLoop, contexts };
  }

  // 9e. a command that is NOTHING BUT `true`/`:` — DENY: turn-filler for "still waiting", never a real
  //     step. Every clause must reduce to the bare word; `true foo` or `cmd || true` are the tool doing
  //     something else. A command with no clause at all (the lone `&` a rewrite's remainder leaves) is not
  //     filler.
  if (
    clauses.length > 0 &&
    clauses.every((clause) => clause.stages.length === 1 && TRUE_OR_COLON_CLAUSE.test(blank.slice(clause.stages[0].start, clause.stages[0].end).trim()))
  ) {
    return { decision: "deny", rule: "true-filler", reason: REASONS.trueOrColonFiller, contexts };
  }

  // 9e2. a command whose only work is `sleep`, any duration, backgrounded or not — DENY. The settle-delay
  //      exemption in 9g covers a short sleep between real steps; with no real step, the sleep is the wait.
  if (sleepOnlyCommand(command, blank, clauses)) {
    return { decision: "deny", rule: "sleep-only", reason: REASONS.sleepOnly, contexts };
  }

  // 9f. a foreground until/while loop with `sleep` in its body, ANY condition — DENY:
  //     the general case of 9d — a `curl`/`grep`/`test -f` condition polls exactly as
  //     wastefully as a `pgrep`. Gated on `!ctx.runInBackground` the same way.
  if (!ctx.runInBackground && foregroundWaitLoopWithSleep(blank)) {
    return { decision: "deny", rule: "sleep-wait-loop", reason: REASONS.foregroundWaitLoopSleep, contexts };
  }

  // 9g. a bare foreground `sleep`, alone or chained — DENY, except a
  //     settle-delay of 2s or less, or a `sleep` inside a bounded `for` loop's body (see the two helpers).
  if (!ctx.runInBackground && bareForegroundSleepClause(blank, clauses)) {
    return { decision: "deny", rule: "foreground-sleep", reason: REASONS.foregroundSleep, contexts };
  }

  // NOTE — deliberately NO `git reset` rule. The owner's GLOBAL settings wildcard-allow `git reset *`
  // and `git checkout *`; adding an ask here would override a call he already made. The ones absent from
  // that allowlist are `git push`, `git stash` and `git restore`, and stash/restore are DENIED above on
  // their destructive arms, which is this guard's own doctrine call, not a permissions gap.

  // 10. long-lived non-harness command piped — REWRITE simple, WARN otherwise. A piped `pnpm doc` takes the
  //     same rewrite; when its shape is too complex it is left as written, with no note.
  for (const clause of clauses) {
    if (clause.stages.length < 2) {
      continue;
    }
    const stage0 = blank.slice(clause.stages[0].start, clause.stages[0].end);
    const stage0Raw = command.slice(clause.stages[0].start, clause.stages[0].end);
    if (DOC_PIPE_HEAD.test(stage0)) {
      const rewrite = pipeRewrite(command, blank, clauses, (b) => DOC_PIPE_HEAD.test(b), ctx);
      if (rewrite) {
        contexts.push(CONTEXTS.rewriteDocPiped(rewrite.log));
        if (rewrite.readerStatus) {
          contexts.push(CONTEXTS.rewriteReaderStatus);
        }
        return gateRewrite(
          { decision: "allow", rule: "doc-piped", rewrite: { command: rewrite.command, log: rewrite.log }, contexts },
          command,
          rewrite.clause,
          ctx,
        );
      }
      continue; // a later piped git clause still gets its advisory
    }
    const verb = gitSubcommand(stage0, stage0Raw);
    if (!GIT_LONG_LIVED_VERBS.has(verb)) {
      continue;
    }
    const rewrite = pipeRewrite(command, blank, clauses, (b, r) => GIT_LONG_LIVED_VERBS.has(gitSubcommand(b, r)), ctx);
    if (rewrite) {
      contexts.push(CONTEXTS.rewriteLongLived(rewrite.log));
      if (rewrite.readerStatus) {
        contexts.push(CONTEXTS.rewriteReaderStatus);
      }
      // a piped foreground commit/merge runs its hooks too, so it gets the same long timeout as a bare one
      const timeout = ctx.timeout === undefined && !ctx.runInBackground && GIT_HOOKED_VERBS.has(verb) ? REWRITE_TIMEOUT_MS : undefined;
      return gateRewrite(
        { decision: "allow", rule: "longlived-piped", rewrite: { command: rewrite.command, timeout, log: rewrite.log }, contexts },
        command,
        rewrite.clause,
        ctx,
      );
    }
    contexts.push(CONTEXTS.longLivedPipe);
    break;
  }

  // 11. advisory tier — never blocks, EXCEPT the two shapes that escalate (see collectStageWarns):
  //     an `rm -rf` whose target is not on the safe list, and a bare `sqlite3` on a non-scratch db. Pass
  //     means allow, so those two need a human.
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

  // 12. a foreground commit/merge with no timeout of its own — ALLOW with only the tool timeout raised. Last on
  //     purpose: every rule above has already judged the WHOLE command and none objected, and `classify` still
  //     merges the script-body and nested verdicts over this one. No `gateRewrite`: the command text is
  //     unchanged, and judging it with the git clause cut out would turn a heredoc body into commands.
  if (ctx.timeout === undefined && !ctx.runInBackground) {
    const hooked = clauses.some((cl) =>
      cl.stages.some((st) =>
        GIT_HOOKED_VERBS.has(gitSubcommand(stripCompoundLead(blank.slice(st.start, st.end)), stripCompoundLead(command.slice(st.start, st.end)))),
      ),
    );
    if (hooked) {
      contexts.push(CONTEXTS.commitTimeout(REWRITE_TIMEOUT_MS));
      return { decision: "allow", rule: "commit-timeout", rewrite: { command, timeout: REWRITE_TIMEOUT_MS }, contexts };
    }
  }
  // "pass" = the guard LOOKED and has no objection. It becomes `allow` at the hook boundary, never a
  // fall-through to the permission flow, which a subagent cannot answer (see the header).
  return { decision: "pass", rule: contexts.length > 0 ? "advisory" : null, contexts };
}

// ── hook plumbing ──

// ── first-contact briefing: tell each SUBAGENT the guard's rules ONCE, on its first Bash call ──
// A lane cannot see this file and does not read the doctrine section about it, so it learns the rules
// only by tripping them. One `additionalContext` injection per agent_id fixes that, and it doubles as the
// visible marker that the guard is live, so a lane stalled on a permission prompt is not blamed on
// something else.
const BRIEFING = [
  "TOOL-GUARD IS ACTIVE on Bash and Read in this repo (.claude/hooks/tool-guard.mjs). What it does to you:",
  "· REWRITES a harness command piped into tail/head/grep into a redirect + reader, so the exit code",
  "  survives. A pipeline returns the READER's status and can hang, because playwright/vite/stack children",
  "  inherit the pipe. Run the harness bare instead: its exit code is the verdict. Start a long run with",
  "  run_in_background and read results with `pnpm check:show`, not a log you wrote. A piped",
  "  `git commit/merge/pull/fetch/clone` or `pnpm doc` gets the same log + reader rewrite; a piped",
  "  `git push` is asked about (or, from a lane, denied) first, never rewritten.",
  "· GIVES a foreground `git commit`/`git merge` a 10 min tool timeout when you set none: hooks outrun 120 s.",
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
  "· DENIES hand-polling: a bare `true`/`:`, a command that only sleeps, a foreground `sleep` over 2s,",
  "  a foreground `until`/`while` loop with `sleep` in its body, any loop on a harness task file, and a",
  "  third consecutive read of the same log/pid/artifact. If your work is done, write your final report",
  "  now. Otherwise end your turn; the harness wakes you when your background job exits.",
  "· DENIES rereading the same range of a background task's output file within 2 min: read it once.",
  "· DENIES a SUBAGENT running a board-state `pnpm doc` verb (item/set/land/remove/index/status); report",
  "  the item instead. `pnpm doc new adr|plan|law` and `review` in your own worktree stay allowed.",
  "· NOTES a SUBAGENT's whole-tree run (`pnpm check`, `pnpm verify` without --changed, `pnpm test`,",
  "  `pnpm e2e:*`): it runs, but only if your brief asks; background it and report its verdict.",
  "· DENIES a SUBAGENT running `drizzle-kit generate/migrate/push/drop/up/studio` (any runner spelling —",
  "  bare, `npx`, `pnpm exec`/`pnpm dlx`, `pnpm --filter <pkg> exec`): migrations run on main. `drizzle-kit",
  "  check` stays allowed for everyone.",
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
  if (output !== NO_DECISION) {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  }
}

function hookOutput(fields) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", ...fields } };
}

// Reserved for the paths where the guard has NOT judged the command: the kill switch, an internal
// error, unparseable stdin, a tool it does not judge. There, "no opinion" is the honest answer, so the hook
// prints nothing and the normal permission flow decides. `permissionDecision: "defer"` is NOT that: it is a
// real outcome that logs a warning in an interactive session and stops a `claude -p` run with
// `tool_deferred`. Everywhere the guard HAS looked and is content, it says `allow`.
const NO_DECISION = null;
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
    // A subagent has nobody to ask. An unanswered `ask` kills the lane mid-turn with no report. DENY
    // instead: the lane gets the reason, ends cleanly, and can SendMessage the orchestrator, who CAN
    // decide. The main session still gets the prompt.
    if (ctx?.agentId) {
      return hookOutput({
        permissionDecision: "deny",
        permissionDecisionReason: `${result.reason}\n${SUBAGENT_ASK_SUFFIX}`,
      });
    }
    return hookOutput({ permissionDecision: "ask", permissionDecisionReason: result.reason });
  }
  if (result.decision === "allow" && result.rewrite) {
    // `updatedInput` REPLACES the tool's arguments, so every other field (run_in_background, description, …)
    // is carried over and only `command`/`timeout` are overridden.
    const updatedInput = { ...ctx?.toolInput, command: result.rewrite.command };
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
  // An explicit `defer` from the classifier means it did NOT judge this command (classifier-error), so
  // the hook prints no decision: auto-allowing something nobody looked at is not the fix.
  if (result.decision === "defer") {
    return NO_DECISION;
  }
  // PASS-THROUGH IS `allow`. This guard shapes HOW a command runs; it is not the gatekeeper of WHAT an
  // agent may run (owner ruling: "our issue was never permissions of what an agent can do, we just want
  // them running the right way"). Falling through to the normal permission flow prompts a human, so for a
  // subagent it is a silent stop at the first uncovered command. An `allow` here says what the guard
  // means: I looked at this and I have no objection.
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
      sessionId: c.sessionId ?? null,
      projectDir: c.projectDir ?? "/repo",
      timeout: c.timeout,
      now: Number(process.env.ORB_TOOL_GUARD_NOW_FOR_TEST ?? Date.now()),
      procRoot: c.procRoot,
      runInBackground: c.runInBackground === true,
    };
    try {
      return classify(c.command, ctx);
    } catch (err) {
      return { decision: "defer", rule: "classifier-error", contexts: [], error: String(err) };
    }
  });
  process.stdout.write(JSON.stringify(out, null, 2));
}

/** The Read branch of the hook: deny a quick re-read of a task output file, otherwise print nothing. It never
 *  allows, so every other Read keeps the normal permission flow. */
function runReadHook(input, filePath) {
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  if (ENV_KILL.test(process.env.ORB_TOOL_GUARD ?? "")) {
    emit(NO_DECISION);
    return;
  }
  const range = { offset: input.tool_input.offset, limit: input.tool_input.limit };
  const now = Number(process.env.ORB_TOOL_GUARD_NOW_FOR_TEST ?? Date.now());
  const result = taskOutputReadVerdict(filePath, range, { agentId: input.agent_id ?? null, sessionId: input.session_id ?? null, projectDir, now });
  if (result === null) {
    emit(NO_DECISION);
    return;
  }
  logDecision(projectDir, {
    t: new Date().toISOString(),
    sid: input.session_id ?? null,
    agent: input.agent_type ?? "main",
    decision: result.decision,
    rule: result.rule,
    read: filePath,
  });
  emit(hookOutput({ permissionDecision: "deny", permissionDecisionReason: result.reason }));
}

async function runHookMode() {
  const started = Date.now();
  let projectDir = process.cwd();
  try {
    const raw = await readStdin(STDIN_DEADLINE_MS);
    if (raw === null) {
      emit(NO_DECISION);
      return;
    }
    const input = JSON.parse(raw);
    const filePath = input?.tool_input?.file_path;
    if (input?.tool_name === "Read" && typeof filePath === "string") {
      runReadHook(input, filePath);
      return;
    }
    const command = input?.tool_input?.command;
    if (input?.tool_name !== "Bash" || typeof command !== "string") {
      emit(NO_DECISION);
      return;
    }
    projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
    if (ENV_KILL.test(process.env.ORB_TOOL_GUARD ?? "")) {
      logDecision(projectDir, { t: new Date().toISOString(), decision: "defer", rule: "kill-switch", cmd: command.slice(0, CMD_LOG_MAX) });
      emit(NO_DECISION);
      return;
    }
    if (process.env.ORB_TOOL_GUARD_CRASH_FOR_TEST) {
      throw new Error("forced crash (ORB_TOOL_GUARD_CRASH_FOR_TEST)");
    }
    const ctx = {
      cwd: input.cwd,
      agentId: input.agent_id ?? null,
      sessionId: input.session_id ?? null,
      projectDir,
      timeout: input.tool_input.timeout,
      now: Number(process.env.ORB_TOOL_GUARD_NOW_FOR_TEST ?? Date.now()),
      // The Bash tool's own field for the sanctioned wait: `run_in_background: true` means the harness
      // notifies the agent on exit instead of the agent blocking this turn on it — see BRIEFING.
      runInBackground: input.tool_input.run_in_background === true,
      toolInput: input.tool_input,
    };
    const result = classify(command, ctx);
    if (result.rewrite?.log) {
      mkdirSync(path.dirname(result.rewrite.log), { recursive: true });
    }
    // Compute the output BEFORE logging so the record carries what was actually EMITTED, not just what the
    // classifier decided. They diverge where it matters for triage: a subagent `ask` is emitted as `deny`
    // (see toHookOutput), and logging only `decision` would make those read as hung `ask`s.
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
    emit(NO_DECISION);
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  if (process.argv.includes("--classify-batch")) {
    runBatchMode().catch(() => {
      process.stdout.write("[]");
    });
  } else {
    runHookMode().catch(() => emit(NO_DECISION));
  }
}
