# Tool-use anti-pattern census (2026-08-03)

**Purpose:** measure the real corpus of Bash tool_use calls across every Claude Code session
transcript on this box, to spec a PreToolUse hook against actual frequency/false-positive data
instead of guessing a ruleset. Read-only. No repo source was touched.

**Instrument:** `scripts/probes/transcript-census.mjs` (committed, reusable — re-run any time the
hook needs retuning). Streams every `*.jsonl` line-by-line (never loads a file whole), pre-filters
on a cheap substring check before `JSON.parse`, classifies every Bash `tool_use` command by regex
heuristics (documented as heuristic, NOT a shell parser — see the script's own header), and pairs
each `tool_use` with its `tool_result` in the same file to measure wall-clock duration and detect
the literal `"Command timed out after …"` marker Claude Code emits on a Bash-tool timeout.

```
node scripts/probes/transcript-census.mjs --out reports/census.json
```

## Corpus scanned

| | |
|---|---|
| Roots | `~/.claude/projects/**/*.jsonl`, `~/.claude-b/projects/**/*.jsonl` |
| Files | 3,138 |
| Lines read | 929,054 |
| Parse errors | 0 |
| Bash `tool_use` calls found | **133,631** |
| — main session | 19,105 (14.3%) |
| — subagent (`isSidechain:true`) | **114,526 (85.7%)** |

**The corpus is overwhelmingly subagent traffic.** Whatever the hook does, if PreToolUse doesn't
fire for subagent tool calls, it misses 6 in 7 of every Bash invocation this repo produces, and
(see below) an even higher share of the pain. I could not determine from the transcripts whether
PreToolUse fires for subagents — that's a product/SDK-mechanism fact, not something the JSONL
shows. Flagging it as the single most consequential unknown for hook design.

Per-role breakdown (bonus data, `attributionAgent` field — present on subagent lines only, not
universal, so treat as directional not exhaustive): `executor` 64,741 · `general-purpose` 14,095 ·
`side-eye` 7,217 · `mech-executor` 6,087 · `scout` 5,434 · `security-executor` 5,311 · `verifier`
4,377 · `stickler` 3,596 · `claude` (main, when stamped) 1,815 · `Explore` 1,234 · `workflow-subagent`
589 · `fork` 36.

## Headline finding: the pipe hangs, it doesn't just eat the exit code

Owner's addendum mechanism claim — checked directly against duration data, and it holds up.

For every `pnpm <script>` invocation I could match to a signature (`pnpm check`, `pnpm verify`,
`pnpm test`, `pnpm test:ct`, `pnpm lint`, `pnpm typecheck`, `pnpm e2e`, plus the `check:*`/
`typecheck:*` sub-scripts), I split by whether the SAME command was piped into a swallower
(`tail`/`head`/`grep`/`wc`/`less`/`awk`/`sed`/…) or stderr-merged-then-piped (`2>&1 |`), and
compared **wall-clock tool_use→tool_result duration** for piped vs unpiped:

| signature | piped n | piped median | unpiped n | unpiped median | inflation |
|---|---|---|---|---|---|
| `pnpm check` | 1,512 | **64.1s** | 408 | 2.3s | **28×** |
| `pnpm verify` | 255 | **120.3s** | 40 | 2.2s | **55×**, clustered at the 2‑min ceiling |
| `pnpm test` | 299 | **120.1s** | 99 | 0.07s | at the 2‑min ceiling (unpiped sample skewed by fast-fail no-arg invocations) |
| `pnpm test:ct` | 1,030 | 16.7s | 23 | 13.3s | 1.25× (small unpiped n) |
| `pnpm typecheck:graph` | 377 | 5.4s | 32 | 4.5s | 1.2× |
| `pnpm typecheck` | 260 | 6.2s | 23 | 7.3s | none |
| `pnpm check:structure` | 1,053 | 28.9s | 61 | 34.7s | none (piped slightly faster) |
| `pnpm check:docs` | 291 | 4.8s | 60 | 4.6s | none (near-identical) |
| `pnpm check:file` | 82 | 12.0s | 18 | 11.4s | none |

**87.3% of every harness invocation I could fingerprint (5,319 of 6,096) was piped** in a way that
loses the exit code. Aggregate wall-clock for those 5,319 piped calls: **~3,655 minutes (61 hours)**.
Comparing each piped call's duration against the SAME command's unpiped median (a fair per-signature
baseline, not a global average): **~2,743 minutes (45.7 hours) of that is excess** — time that would
not have been spent had the command not been piped. That excess is not evenly spread: it is almost
entirely `pnpm check` (≈1,562 of the 2,743 minutes on its own) and `pnpm verify`/`pnpm test`
(clustering at exactly the ~120s Bash-tool default timeout, i.e. genuinely hung until the tool
killed them).

**The concentration is real and matches the owner's sharpened hypothesis.** `check:docs`,
`check:structure`, `check:file`, and plain `typecheck` show **no** inflation piped vs unpiped —
these are static-analysis-only scripts with no spawned server/browser/worker descendants, so there's
no lingering write-fd to hang the reader on. `check` (which runs the full gate battery, including
steps that touch the dev stack/vitest workers) and `verify`/`test`/`test:ct`/`e2e` (which spawn
Playwright's browser + `webServer`, or the stack daemons directly) are the ones with detached
children — and those are exactly the ones that hang.

### Explicit timeouts (ground truth, not inference)

Claude Code's own Bash-tool timeout leaves a literal `"Command timed out after <N>"` string in the
`tool_result`. This is unambiguous — no heuristic involved.

| | count | wall-clock |
|---|---|---|
| Total timeouts | 243 | 651 minutes (10.9 hrs) |
| — piped/stderr-merged | 137 | 397 minutes |
| — not piped | 106 | 255 minutes |
| — main session | 51 | |
| — subagent | **192 (79%)** | |

Verbatim examples (piped, timed out at exactly 120s — the default Bash-tool ceiling):
- `git push origin main 2>&1 | tail -8` — 120s
- `cd .../orbweaver; git rev-parse --abbrev-ref HEAD; git rev-list ...; echo "─ retrying push...` (contains a `| tail`-style tee later in the pipeline) — 122s
- `pnpm check 2>&1 | grep -E "×|error TS|✗" | sort -u` — captured elsewhere at 64–136s range, consistent with the signature table above

The `git push … | tail` example is notable: **the hang isn't limited to `pnpm` scripts.** Any
command that spawns something long-lived (here, git's own network/credential-helper subprocess can
outlive the visible `git push`) and gets piped into a `tail`/`head`/etc. is at risk. The rule should
be shaped around **"piped into a non-follow reader"**, not just "piped `pnpm`".

## Ranked frequency table (all Bash calls, main+subagent)

| rank | tag | total | main | subagent | note |
|---|---|---|---|---|---|
| 1 | `grep -r` without `--exclude-dir` | 25,036 | 2,876 | 22,160 | **high false-positive rate — see below** |
| 2 | bare `vitest run` / `npx vitest` | 6,410 | 590 | 5,820 | |
| 3 | harness `2>&1 \|` | 5,383 | 918 | 4,465 | overlaps almost 1:1 with #4 |
| 4 | harness piped to swallower | 5,324 | 920 | 4,404 | the headline class |
| 5 | `npx biome` / `biome … --write` | 4,464 | 421 | 4,043 | |
| 6 | `cd` into `.claude/worktrees/…` | 3,064 | 259 | 2,805 | matches the known lane-branch-commit bug |
| 7 | `npx playwright test` unsanctioned | 1,795 | 194 | 1,601 | vs only 318 sanctioned — **85% unsanctioned** |
| 8 | bare `npx tsc` | 960 | 120 | 840 | |
| 9 | `rm -rf` outside scratchpad/tmp | 760 | 104 | 656 | |
| 10 | bare `sg ` | 719 | 56 | 663 | **ambiguous — see below** |
| 11 | `git add -A` / `git add .` | 456 | 247 | 209 | |
| 12 | `git commit/merge --no-verify` | 412 | 352 | 60 | needs context — see below |
| 13 | `npx depcruise` / `npx knip` | 323 | 22 | 301 | |
| 14 | `npx playwright test` sanctioned | 318 | 14 | 304 | (the good form, for contrast) |
| 15 | `git stash` | 221 | 45 | 176 | banned outright; **trend improving** |
| 16 | `sqlite3` against a live-looking path | 220 | 62 | 158 | |
| 17 | `sqlite3` against a tmp/test path | 103 | 33 | 70 | (safe arm, for contrast) |
| 18 | `git restore` | 27 | 19 | 8 | |
| 19 | harness `\|\| true` / `\|\| echo` | 24 | 3 | 21 | |
| 20 | `git checkout -- <path>` / `git checkout .` | 23 | 5 | 18 | destroys uncommitted work |
| 21 | `git push --force`/`-f` | 6 | 6 | 0 | |
| 22 | `--no-gpg-sign` | 2 | 1 | 1 | noise-level |
| 23 | harness inside `$(…)` subshell | 1 | 0 | 1 | noise-level |
| 24 | `curl \| sh` | 1 | 1 | 0 | the rustup installer — legitimate idiom |

## False-positive risk per candidate rule

**`grep -r` without `--exclude-dir` (25,036 hits, the single biggest bucket) — HIGH false-positive
rate, do not deny on this alone.** Sampled examples are overwhelmingly `grep -rn "X" path/to/one/file.ts`
or `grep -rn "X" packages/server/src/domain/foo/` — a scoped single-file or narrow-subtree target
where `-r` is redundant but harmless (no `node_modules` under a `.ts` file glob or a `packages/…/src/…`
leaf directory). The real danger case — `grep -r "X" .` or `grep -r "X" packages/` from repo root,
which WILL walk into `node_modules` and either hang on a huge tree or return node_modules noise —
is a small minority of the 25k. **Recommend WARN, not DENY, and only fire when the search root is
unscoped** (`.`, `packages/`, or no path argument at all) rather than any `-r` flag whatsoever.

**Bare `sg ` (719 hits) — genuinely ambiguous, needs a runtime check, not a static ban.** A prior
memory note on this box says `sg` is `newgrp` here (silent no-search). But the sampled corpus shows
extensive, apparently-successful `sg run -p '...' -l ts <path>` invocations (ast-grep CLI syntax),
including one session that explicitly probed `which ast-grep sg; ast-grep --version || sg --version
|| pnpm dlx @ast-grep/cli --version` — i.e. agents themselves have hit this ambiguity and built a
fallback chain. This may be host/container-dependent (some worktrees may have `sg` aliased to
ast-grep, others not) or a stale memory. **The hook should check `command -v sg` / compare its
resolved target at hook-fire time rather than trust a blanket rule either way** — a hard DENY here
risks blocking a tool that works in that agent's actual shell.

**`git commit/merge --no-verify` (412 hits, 85% main-session) — needs context, mixed legitimacy.**
Sampled examples are consistently "ran `pnpm check` immediately before, already know it's green,
skip re-running the same gate the pre-commit hook would re-run" — a defensible pattern, not a
dodge. A small number could not be distinguished from "just skip the hook" without correlating
against the preceding tool call. **WARN with a reason prompt, not DENY** — this one is legitimately
sometimes right and the brief already flagged it as needing judgment.

**`cd` into `.claude/worktrees/…` (3,064 hits) — this is the real thing the memory warns about.**
Sampled examples show extended multi-command sessions operating inside a worktree cwd from the
*main* session (not a lane agent) — exactly the shape that previously landed a main-session commit
on a lane branch, since Bash cwd persists across calls. Low false-positive risk: legitimate reasons
to `cd` into a worktree path are rare enough (mostly a lane agent operating in its OWN worktree,
which is a different risk profile than main hopping into someone else's). **Recommend DENY for
main-session; WARN (or allow) for a subagent whose own worktree it is** — the hook needs the calling
agent's identity to make this distinction, which the census can't confirm exists.

**`sqlite3` against a live-looking path (220 hits) — real risk, matches a standing memory
(`sqlite3-wal-danger-on-live-db`).** Sampled examples include read-only `SELECT count(*)` probes
(low risk) but also a `PRAGMA wal_checkpoint` + backup-copy sequence and ad-hoc writes against
`data/orbweaver.db` while the stack may be live. Cannot distinguish read vs write intent from the
command text alone (SQL is in a quoted string). **Recommend WARN for any bare `sqlite3 <path-not-
under-tmp-or-scratch>`, with the fix text pointing at "stack down first, or use the `/api/_debug`
endpoints instead."**

**`curl | sh` (1 hit) — the sole example is the official rustup install idiom.** Do not build a
rule for n=1; if one is built anyway, it needs an allowlist for well-known installer URLs, or it
will cry wolf on the single most standard install pattern in the ecosystem.

**Bare-runner dodges (`npx vitest`, `npx tsc`, `npx biome`, unsanctioned `npx playwright test`,
`npx knip`/`depcruise`) — LOW false-positive risk.** I did not find a single sampled example where
running the bare tool was the *only* reasonable choice — every one had a `pnpm <equivalent>` script
available. These are clean DENY candidates. The one nuance: `npx playwright test` has a **documented
sanctioned form** (`rm -rf playwright/.cache && npx playwright test -c playwright-ct.config.ts
<paths>`) that the classifier already separates out (318 sanctioned vs 1,795 unsanctioned, i.e. 85%
of Playwright CT invocations skip the cache-clear that lane doctrine requires) — the rule must
recognize that exact prefix and NOT flag it.

## DENY vs WARN recommendation

**DENY (hard-block, model must not proceed):**
1. Any `pnpm check|verify|test*|lint|typecheck|e2e` (and the `pnpm exec`/`turbo`/`npm run`
   equivalents) piped into `tail`/`head`/`grep`/`wc`/`less`/`awk`/`sed`/`cut`/`column`, or with
   `2>&1 |` anywhere after the invocation. **Justification: not just exit-code loss — proven to
   hang** (28–55× wall-clock inflation on `check`/`verify`/`test`, both clustering at the Bash-tool
   timeout ceiling). Fix text: *"redirect to a file (`> reports/out.log 2>&1`) and read it after —
   a pipe has no reader once the command exits, but a detached child (playwright/vite/stack) still
   holds the write end open, so `tail`/`head`/`grep` block forever waiting for an EOF that never
   comes."*
2. `git stash`, `git restore`, `git checkout -- <path>` / `git checkout .` — destroys uncommitted
   work outright, already repo doctrine, and the false-positive rate is near zero (no sampled
   example was anything but the literal footgun). Fix text: *"never discard uncommitted work — if
   you need a clean tree, commit first."*
3. Bare `npx vitest`/`vitest run`, `npx tsc` (when a `typecheck*` script exists), `npx biome …
   --write`/`--apply`, unsanctioned `npx playwright test` (missing the cache-clear + `-c
   playwright-ct.config.ts` prefix). Fix text per-tool: *"use `pnpm test` — the bare runner skips
   the JSON reporter and `reports/test-report.json` never gets written."* / *"use `pnpm typecheck`
   — same compiler config, but wired into the report."* / *"never `biome --write`/`--apply` — see
   doctrine; use the scoped diff-and-restore procedure."* / *"clear `playwright/.cache` first or
   CT mounts go stale — `rm -rf playwright/.cache && npx playwright test -c
   playwright-ct.config.ts <paths>`."*

**WARN (advisory, let it proceed but surface the concern):**
1. `grep -r` without `--exclude-dir=node_modules`, **only when the search root is unscoped**
   (`.`, a top-level package dir, or omitted) — too many legitimate single-file/narrow-dir hits to
   deny blindly.
2. `git commit/merge --no-verify` — legitimately used after an already-green gate; ask for
   confirmation the gate really did just run clean rather than blocking outright.
3. `cd` into `.claude/worktrees/…` from what looks like a main-session cwd — WARN with "you're
   about to operate inside a lane worktree; confirm this is intentional," escalate to DENY only if
   the hook can positively identify "this is NOT my own worktree."
4. Bare `sqlite3` against a path that isn't under `/tmp`/`scratchpad`/`:memory:` — WARN pointing at
   the stack-down or `/api/_debug` alternative; can't tell read vs write from the command text.
5. `rm -rf` outside scratchpad/tmp, `git add -A`/`git add .`, `git push --force` — real footguns
   but with enough legitimate uses (repo-root cleanup, intentional full-stage commits, authorized
   force-pushes after a rebase) that a hard deny would cry wolf; WARN keeps them visible without
   blocking.

**Explicitly NOT worth a rule (n too small / no signal):** `--no-gpg-sign` (2), harness-in-subshell
(1), `curl | sh` (1). A rule that fires zero-to-twice in 3,138 sessions is noise per the brief's own
standard.

**Deliberately left unruled — needs a runtime check, not a static pattern:** bare `sg` — see the
false-positive section above. Building a DENY or WARN off the command TEXT alone will be wrong in
whichever direction the box's actual `sg` resolution isn't; this needs `command -v sg` at hook time.

## Trend (weekly, normalized to a rate per 1,000 Bash calls — raw counts are misleading since call
## volume itself varies 4× week to week: W27=8.2k calls, W29=35.3k, W32=6.3k and partial)

| tag | W27 | W28 | W29 | W30 | W31 | W32 (partial) | direction |
|---|---|---|---|---|---|---|---|
| harness piped to swallower | 64.4 | 32.8 | 45.5 | 23.4 | 41.1 | 54.0 | **noisy, no clear improvement** — this is the class most needing a hook, not fixed by doctrine alone |
| `git stash` | 5.12 | 2.28 | 1.81 | 1.53 | 0.53 | 0.32 | **clearly improving** — matches the standing doctrine ban; a hook here would mostly be reinforcement |
| unsanctioned `playwright test` | 1.46 | 7.90 | 7.93 | 24.99 | 16.83 | 25.97 | **getting worse** — CT authoring ramped up faster than the sanctioned-prefix habit did |

Weeks are ISO (`2026-W27` = late June/early July run through `2026-W32` = the current week,
partial). W32 is a partial week (scan run mid-week) so its rate is the least reliable data point —
treat it as directional only.

## What else I found (category D, unprompted)

- **`git push … 2>&1 | tail`** — the hang mechanism applies beyond `pnpm` scripts; git itself can
  spawn a long-lived credential-helper/network child. The rule's `RE_HARNESS` should not be
  narrowly `pnpm|turbo|npm` — a broader "any command piped into a non-follow reader" WARN, with the
  DENY reserved for the specific pnpm-script family that's proven to hang, covers this gap without
  over-blocking every `git log | head` (which is fine — no descendant, no hang).
- **`pnpm tsx <ad-hoc script> 2>&1 | head`** — the same swallow-and-maybe-hang pattern shows up on
  one-off scratch scripts (`reports/*/scratch/*.ts`), not just the named harness scripts. Lower
  volume, same mechanism; not worth its own rule given the general pipe-to-swallower WARN already
  covers it.
- **Background health-check polling loops** (`curl -s -o /dev/null -w "%{http_code}" http://localhost:5173`,
  `until ! kill -0 $(pgrep -f probe.cjs); do sleep …; done`) are extremely common in the sample and
  are NOT anti-patterns — they're the correct way to poll an async subagent/background job without
  a bare long `sleep`. No rule needed; flagging only so a future overly-broad "no polling loops"
  rule doesn't get proposed against real, legitimate usage.
- **`python3 - <<'EOF' … EOF`** heredocs for file edits are common (used as an Edit-tool substitute
  for multi-site regex-style rewrites). Not in scope of this census (not a harness/footgun pattern)
  but noted as a real, frequent idiom in case a future rule ever considers "prefer the Edit tool"
  — it would have a very high false-positive rate against legitimate batch-rewrite scripts.
- **`cat ~/.config/civitai/token`** and similar credential-file reads appeared in the raw sample.
  Out of scope for THIS census (not a tooling anti-pattern) but worth a separate look if secret
  handling is ever audited — not measured here, flagging only.

## What I did NOT cover

- **Exhaustive parse:** every file was streamed in full (no sampling at the classification level —
  `bashCallsTotal` reflects every Bash `tool_use` in the corpus, not a subsample). The **eyeball
  read** for category D was a 400-command sample (2 Bash calls from every 9th file, deterministic
  stride, not random) plus the up-to-6 stored verbatim examples per classified tag (≈150 more) —
  that sample is what the "what else did I find" section is based on, not the full 133,631.
- **`attributionAgent` role split** is a bonus, not a splitter: the field is absent on plain
  `general-purpose`/unnamed subagent lines and on all main-session lines, so the role counts above
  undercount roles that ran through unnamed dispatches.
- **Duration pairing** assumes `tool_use` and its `tool_result` land in the SAME file, which held
  for every case checked (subagent transcripts are self-contained; main-session results pair within
  the session file). I did not find, and did not specifically hunt for, cross-file pairing failures.
- **Shell parsing is heuristic, not exact** (documented in the script itself): clause-splitting on
  `&&`/`;`/newline doesn't respect quoting, so a `pipe`/`swallower` token inside a quoted string
  (e.g. a commit message containing the literal text `"| tail"`) could theoretically false-positive.
  I did not find an actual instance of this in the sampled data, but it's a known approximation gap
  — a real hook needs a real shell tokenizer for the same classification, not this regex approach.
- **PreToolUse-fires-for-subagents** — could not be determined from transcripts at all; this is a
  mechanism fact about the Agent SDK, not something logged. Flagged above as the biggest open
  question for hook design given subagents are 85.7% of all Bash calls and 79% of timeouts.
