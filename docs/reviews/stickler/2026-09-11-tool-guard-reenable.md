---
kind: review
status: active
updated: 2026-09-11
---

# Stickler review — Bash tool-guard re-registration and vocabulary refresh (40223a091)

Lane `p-stickler-guard`. Branch `codex/world-gate-integration`, reviewed at HEAD `1e6556733` (the brief named
`b54b2c34e`; one docs-only follow-up landed after the brief was written — `1e6556733`, +5 header lines on the
guard and +9/-2 on `sync.int.test.ts`, no behaviour). Diff under review: `40223a091` (four files) plus that
follow-up. Every touched file was read in full; the guard (`.claude/hooks/tool-guard.mjs`, 2,355 lines) was
read whole including its header decision log, and every claim below was reproduced in this session by
spawning that committed file with real `--classify-batch` payloads (the same door the pin uses), never by
reasoning from the hunk alone. Tree was clean before and after (`git status --short` empty at HEAD).

## Findings (CONFIRMED only, most severe first)

### F1 · P2 — Rule 6's head vocabulary misses the raw CT spelling lanes actually use: 268 corpus sightings run un-floored and pass silently

`.claude/hooks/tool-guard.mjs:460` (`PLAYWRIGHT_TEST`) and `:874` (`PW_CLAUSE_HEAD`) anchor the CT rule on
`npx playwright test`, `pnpm exec playwright test`, or `playwright test` at line start / after `&&`. This diff
retargeted the rule at `pnpm test:ct` and rewrote its rationale around the per-worktree lock, the host slot
and the per-invocation cache — and left every other raw spelling outside the rule:

| input | verdict (committed guard) |
| - | - |
| `node_modules/.bin/playwright test -c playwright-ct.config.ts tests/client/x.ct.tsx` | `pass/null` |
| `./node_modules/.bin/playwright test tests/client/x.ct.tsx` | `pass/null` |
| `pnpm playwright test -c playwright-ct.config.ts tests/client/x.ct.tsx` | `pass/null` |
| `node node_modules/@playwright/test/cli.js test -c playwright-ct.config.ts tests/client/x.ct.tsx` | `pass/null` |

(probe group D rows 0–4). Each of those runs playwright directly: shared `playwright/.cache` build dir (the
\#1581 corruption the diff's own comment at `:880-885` says the rewrite exists to refuse — `playwright-ct.config.ts:335-342`
falls back to the stock cache when `ORB_CT_CACHE_DIR` is unset), no worktree lock, no host-wide slot, no
run marker (the #1848 orphan-chromium hole), and for the `.bin`/`node` spellings no heap floor either
(measured: bare node `heap_size_limit=4192MiB`, `pnpm exec node` 16480MiB). Corpus (main's
`reports/tool-guard/decisions.jsonl`, 179,120 rows): **268** rows use one of these three spellings vs 476
`npx playwright test` and 38 `pnpm exec playwright test` — i.e. roughly a third of raw CT invocations, mostly
`cd <worktree> && ./node_modules/.bin/playwright test -c playwright-ct.config.ts …` from lanes. Consequence: the
exact racing runner the rewrite was rewritten to catch still passes with no advice, on the spelling lanes most
often type when they avoid `npx`. Fix shape (orchestrator's call): widen the two head regexes to
`(?:\S*\/)?playwright` and `pnpm\s+playwright`, add the three rows to the pin's rewrite block.

### F2 · P2 — A group CLOSER glued to the operand is still a shield: `(bash /tmp/lane.sh)` passes while `(bash /tmp/lane.sh )` denies

The fix blanks a word-initial `(`/`{` (`:1138-1142 ungroup`) so the exec head is found; it never looks at the
closer. `shellWords` (`:1168-1206`) treats `)` as an ordinary character, so the operand word of
`(bash /tmp/x.sh)` is `/tmp/x.sh)`, `resolveScriptOperand` (`:1246-1257`) returns that path, and
`oneScriptVerdict` (`:1602-1633`) hits `statSync` ENOENT and returns `null` — the fail-open "the command would
fail anyway" arm — so the body is never read. Verdicts on the committed guard, all with a real
`p-stickler-guard-evil.sh` whose body is `git stash`:

| input | verdict | mechanism |
| - | - | - |
| `(bash /PSG/evil.sh)` | `pass/null` | operand word carries the `)` → ENOENT → silence |
| `(bash "/PSG/evil.sh")` | `pass/null` | same (quote closes, `)` appended to the value) |
| `(sh /PSG/evil.sh)&` · `(bash /PSG/evil.sh) &` · `( bash /PSG/evil.sh)` · `(bash /PSG/evil.sh) \| cat` · `(bash /PSG/evil.sh)2>&1` | `pass/null` | same |
| `SP=/PSG; (bash "$SP/evil.sh")` | `pass/null` | same, after a correct `$SP` expansion |
| `(source /PSG/evil.sh)` · `(. /PSG/evil.sh)` | `pass/null` | `:1390 first` word carries the `)` |
| `(/PSG/evil.sh)` · `(/PSG/evil.sh &)` · `(exec /PSG/evil.sh)` | `pass/null` | bare `.sh` head: `words[head]` (`:1397`) still carries the leading `(` — `ungroup` fixed the token, not the word |
| `(cat /PSG/evil.sh \| bash)` | `pass/null` | pipe-sink stage text is ` bash)` → `SCRIPT_STAGE_HINT` (`:542`) needs `\s\|$` after the shell name |
| `(printf 'git stash\n' > /PSG/w.sh); bash /PSG/w.sh` · `(echo "git stash" > /PSG/w.sh); bash /PSG/w.sh` | `pass/null` | `commandWrites` (`:1295-1301`) records the target as `…/w.sh)` so the later `bash …/w.sh` misses the map and reads the (absent) disk file |
| `(bash < /PSG/evil.sh)` | `ask/script-unresolved-operand` | not silent — acceptable |

Controls in the same run: `( bash /PSG/evil.sh )`, `(bash /PSG/evil.sh &)`, `{ bash /PSG/evil.sh; }`,
`(bash /PSG/evil.sh >/dev/null)`, `(nohup /PSG/evil.sh &)` all `deny/script:git-destructive` (probe groups A
rows 14–23, E rows 0–25). Every glued-closer row was also `pass/null` on the pre-diff guard, so this is not a
regression — it is the half of the class the fix's own header calls "a live hole in the destroy-uncommitted
ban" that the fix did not close, one character away from a denied spelling. It also violates the guard's own
\#631 law (`:98-105`, "a guard that cannot identify what will execute must not return a content verdict"): a
mis-parsed path reads as ENOENT, and ENOENT is silence. Corpus: 0 sightings of `(bash …`/`(sh …`/`(. …`
grouped rows (the `(setsid …` shape that motivated the fix had 4). Fix shape: strip a trailing unquoted run of
`)`/`}` from an operand word before resolving it (or teach `ungroup` closers with `(^|\S)([)}]+)(?=\s|$)` and
let `shellWords` split on them), key `commandWrites` by the same stripped path, and add the rows above to the
pin's must-bite block.

### F3 · P2 — The hook is linted by nothing, its only behavioral pin is `--full`-only, and the diff pins a "sanctioned" biome spelling that checks zero files

Receipts:

- `pnpm exec biome check .claude/hooks/tool-guard.mjs --diagnostic-level=error` → `Checked 0 files … No
  files were processed in the specified paths … These paths were provided but ignored: .claude/hooks/tool-guard.mjs`,
  exit 1. Cause: `biome.json:16` `files.includes` carries `!.claude`. Yet `tests/tooling/tool-guard.int.test.ts:349`
  pins that exact spelling as a "sanctioned spelling this guard's own refusals recommend" (`pass/null`) — the
  guard recommends it nowhere, and it measures nothing.
- `pnpm exec eslint .claude/hooks/tool-guard.mjs` → exit 0, empty output. `tooling/src/_shared/project-worlds.ts:65`
  `NODE_TOOL_SURFACE_GLOBS = ["*.{ts,mts,cts}", "packages/*/*.{ts,mts,cts}", "scripts/*.{ts,mts,cts}"]` — no
  `.mjs`, no `.claude/**`; only the no-`files` global block reaches it, i.e. zero substantive rules.
- `pnpm verify --list` (this tree): `tests:tooling` appears under `full` ONLY. `pnpm check` (static) and
  `pnpm verify --push` never spawn `tests/tooling/tool-guard.int.test.ts`, which is the only place the hook is
  executed by any check. A syntax error in the 2,355-line hook exits node non-zero with no JSON; per the hook
  contract the guard's own header relies on (non-zero, non-2 = non-blocking error, the tool call proceeds) every
  Bash call would then run unguarded, and the push bar would stay green. The diff's new `registration:` test
  asserts shebang + exec bit but lives in the same `--full`-only file.

This is the 7(b) ruling with receipts: the style carve-out is acceptable; a behavioral floor that runs before
push is not optional. Smallest honest floor: (1) a static-tier stage that runs `node --check` over
`.claude/hooks/*.mjs` (sub-second; catches the silent fail-open); (2) move the guard's contract/registration/
advice tests — or the whole pin (2.35 s measured) — into a push-tier stage; (3) retire or relabel pin row 349.

### F4 · P3 — The `-c` operand path neither expands the command's own assignments nor asks on an unresolvable one; `eval "…"` is not a shell head

| input | verdict |
| - | - |
| `CMD="git stash"; bash -c "$CMD"` · `CMD='git stash'; bash -c "$CMD"` | `pass/null` |
| `bash -c "$CMD"` (never assigned) · `sh -c "$UNSET"` | `pass/null` |
| `eval "git stash"` · `eval 'git stash'` | `pass/null` |
| controls: `eval git stash` → `deny/git-destructive`; `eval "$(echo git stash)"` → `deny/subst:git-destructive`; `bash -c "$(echo git stash)"` → `deny/inline:git-destructive`; `bash "$NOT_ASSIGNED/run.sh"` → `ask/script-unresolved-operand` (pinned) | |

`inlineShellCommands` (`:1717-1718`) reads the raw `-c` operand and classifies `$CMD` as text; the script-path
resolver one function up (`:1246-1257`, `:1382`) expands `assignedVars` and asks on anything unresolvable —
the two arms disagree on the guard's own law. `eval` is absent from `SCRIPT_SHELL_EXEC` (`:563`) and its
quoted argument is blanked before any rule sees it. Pre-existing, 0 corpus sightings for both shapes (the 180
regex hits on `eval ["']` were snap's `--eval` flag), hence P3.

### F5 · P3 — Heavy tools reachable un-floored through spellings the guard passes silently, with no advice naming the floored door

The guard names a floored door for exactly two tools (CT → `pnpm test:ct`; vitest → `pnpm test:scoped`).
Everything else below is `pass/null` with no context (probe group D). Measured floor facts: bare `node` =
4192 MiB heap, `pnpm exec node`/`pnpm run` child = 16480 MiB (`NODE_OPTIONS=--max-old-space-size=16384`);
`nice` is applied in-process by every `tooling/src/_shared/proc.ts` door (`:88`, `:131`, `:147`, `:290`, `:300`),
so nice does not depend on the entry spelling; heap does.

| spelling | corpus | floor state | guard |
| - | - | - | - |
| `npx eslint <paths>` | 380 | no heap floor (typed lint via projectService), `--concurrency off`, no nice | pass, no advice |
| `node scripts/eslint.cjs <paths>` | — | no heap floor, concurrency 4 from the profile → four typed workers un-floored | pass |
| `npx tsc …` / `node_modules/.bin/tsc …` | 269 | TS6 JS tsc, no heap floor, single thread, no `--checkers` cap; `tests/tooling/tool-guard.int.test.ts:407` pins `npx tsc -p packages/server --noEmit` as a clean PASS | pass |
| `pnpm -r exec tsc --noEmit` (settings allowlisted) | — | heap yes, but pnpm's default `workspace-concurrency` 4 (no `workspaceConcurrency` key in `pnpm-workspace.yaml`) → up to four 16 GiB-ceiling tsc at once; the profile's `pnpmWorkspaceConcurrency: 1` is applied only by `verify/ops/typecheck.ts` | pass |
| `node tooling/src/verify/cli.ts structure` (bare) | 3 (+3 `pnpm exec node …`) | in-process ts-morph at 4 GiB — the recorded exit-134 (`.claude/rules/gates-and-tooling.md`, `tooling/src/codemod/lib/heap-floor.ts:4`) | pass |
| `node tooling/src/ast/cli.ts …` (bare) | 2 | in-process ts-morph lens at 4 GiB | pass (`pnpm ast` deliberately outside the harness heads) |
| `npx stryker run …` | — | no heap, no nice; concurrency 6 still applies (the config factory reads the profile in-process) | pass (standing fact: orchestrator-scheduled) |
| `npx jscpd …` | — | jscpd defaults to every core (24) — `scripts/cpd.ts` caps to 4 only through `pnpm cpd` | pass |
| `npx knip` · `npx depcruise …` · `npx tsx …` | — | no heap (knip/depcruise are whole-project) | pass |
| `pnpm vitest run …` · `pnpm exec vitest run …` · `node node_modules/vitest/vitest.mjs run …` | — | heap yes for the pnpm forms; no nice, no supervisor watchdog (`scripts/vitest-supervised.mjs`); maxWorkers 4 from config | pass, **silent** (`VITEST_HEAD` `:464` warns only on `npx vitest`/bare `vitest`/`.bin/vitest`) |
| `--workers=N` / `--maxWorkers=N` above the cap, any spelling | 0 | overrides the profile caps (`playwright-ct.config.ts:283`, `vitest.config.ts:97`) | pass |

Under the coordinator's bar these are confirmed; they are pre-existing gaps the re-registration inherits, not
regressions. Highest-consequence rows by sightings: `npx eslint` (380) and `npx tsc` (269).

### F6 · P3 — The CT rewrite forwards flag VALUES that `scoped-test`'s preflight reads as path claims (verified by reading, not executed)

`playwrightRewrite` (`:886-913`) keeps every non-`-c` token verbatim. `tooling/src/verify/ops/scoped-test.ts:265`
then runs `rest.filter(isPathShaped)`, and `tooling/src/_shared/scoped-run-paths.ts:80-82` `isPathShaped` is
"not a flag AND (contains `/` OR ends in a test-file extension)". So `npx playwright test tests/x.ct.tsx --output reports/ct-out` → `pnpm test:ct tests/x.ct.tsx --output reports/ct-out` → `reports/ct-out` is a path
claim → UNRESOLVED (exit 3, `unresolvedRefusal`) when absent, BARREN (exit 2) when present; `-g "chat/composer"`
the same. The raw command would have run. Space-form values without a slash survive (`--workers 2`,
`--trace on`, `--project chromium`, `-g "foo bar"` — `2`/`on`/`chromium`/`foo bar` are not path-shaped). Rare
flags; low. The `--config` drop is safe: the tree has exactly one CT config (`playwright-ct.config.ts`;
`playwright.config.ts` is e2e), and `spawnCt` (`scoped-test.ts:168`) adds `-c playwright-ct.config.ts` itself.

## Item-by-item judgments

### 1 · `ungroup()` — index preservation, `$(`/`${` safety, no loosening, remaining shields

- **(a) index preservation is real.** `ungroup` (`:1140-1142`) replaces each opener run with the same number of
  spaces and keeps `pre`; every consumer of `execHead`'s token indexes points back into the original text:
  `:1717` `command.slice(stage.start + flag.index + flag[0].length, …)` (the `-c` operand read off the RAW
  command), `:1375` `exec.index` matched against `shellWords(raw)` word starts, `:1281` head name only.
  Probe: `(setsid nohup bash -c 'git stash' &)`, `( setsid nohup bash -c 'git stash' & )`, `(bash -c 'git stash')`,
  `bash -c "(bash -c 'git stash')"` all extract the correct quoted operand → `deny/inline:git-destructive`
  (A rows 0–2, 10).
- **(b) `$(…)` and `${…}` untouched.** `GROUP_OPENER = /(^|\s)([({]+)/g` requires start-of-text or whitespace
  immediately before the opener; `$(`/`${` have `$` there. Adversarial rows: `$(bash -c 'git stash')` →
  `deny/subst:inline:git-destructive`; `eval "$(echo git stash)"` → `deny/subst:git-destructive`;
  `bash -c "$(echo git stash)"` → `deny/inline:git-destructive`; `SP=…; (bash "$SP/evil.sh" &)` →
  `deny/script:git-destructive` (the `${SP}`/`$SP` expansion path intact) (A 12, 28, 43; E 10).
- **(c) it cannot loosen — verified by A/B.** I materialized the pre-diff guard (`git show
  1ce276795:.claude/hooks/tool-guard.mjs`) into the scratchpad and ran the same 175-row corpus through both.
  41 rows changed; every one is `pass → deny/ask` or `pass → pass/advisory`, except two rows
  (`bash tooling/src/stack/stack.sh start dev`, `bash tooling/src/stack/engines.sh up`) that read
  `ask/script:script-unresolved-operand` on the OLD copy and `pass` on the committed file — a placement
  artifact, proven by running the NEW guard from a scratchpad copy at the same depth, which gives the same
  `ask` (repository identity is derived from the hook's own path, `:392-398`, so a copy outside the repo
  reads tracked scripts as untracked). Zero real loosenings. The one direction `ungroup` can move a verdict
  looser in principle — a grouped literal writer now READ and found clean (`(printf 'echo hi' > w.sh); bash
  w.sh`) — does not materialize, because the glued `)` in F2 defeats `commandWrites` first (E rows 23–25 pass on
  both guards).
- **(d) shields.** Closed by the fix (all deny on new, pass on old): `(setsid nohup bash -c … &)`,
  `(bash -c …)`, `{ bash -c …; }`, `( (bash -c …) )`, `(exec|env|timeout N bash -c …)`, `( bash -c … ) | cat`,
  `(bash /path &)`, `( bash /path )`, `{ bash /path; }`, `( source /path )`, `( /path )`, `bash <<'EOF'\n(bash
  -c …)\nEOF`, `(bash /path >/dev/null)`, `(nohup /path &)`. Never shields (deny on both): `{ git stash; }`,
  `[[ … ]] && bash -c …`, `timeout 60 bash -c '(git stash)'`, `echo x | xargs git stash`, `xargs -0 git stash <
  /dev/null`, `env -C /wt git stash`, `command git stash`, `\git stash`, `git -C /wt stash`, `exec git stash`,
  `builtin cd /x && git stash`, `bash <<'EOF'\n(git stash)\nEOF`. Still open: F2 (glued closer family),
  F4 (`$CMD` operand, `eval "…"`). Out of the guard's stated doctrine (a hand-written list is not a security
  model, `:944-946`), reported for completeness and not as findings: `g''it stash`, `gi\t stash`,
  `python3 -c "…os.system('git stash')"`, `node -e "…execSync('git stash')"`, `perl -e 'system("git stash")'`,
  `G=git; $G stash` — all pass.

### 2 · Advice strings — clean

Every emitted string (`REASONS` `:647-693`, `CONTEXTS` `:701-740`, `BRIEFING` `:2116-2147`, the two ask
suffixes) was read. Recommended spellings and their existence in this branch's `package.json`: `pnpm test:ct`
✓, `pnpm test:scoped` ✓, `pnpm check` ✓, `pnpm test` ✓, `pnpm snap` ✓, `pnpm lint:fix` ✓ (named as the banned
form), `pnpm verify --push` ✓; `git show HEAD:<path> > <path>`, `git show MERGE_HEAD:<path> > <path>`, `cp <f> <f>.bak`/`mv`, `git -c core.hooksPath=/dev/null`, `ast-grep run -p … -l ts`, `biome check --write --only=<rule> <paths>` — all real. Own non-comment grep for retired doors (`npx|ct:scoped|pnpm
vitest|typecheck:graph|types:graph|tests-dom|lint:biome|typecheck.cjs|check:tests-membership|playwright/.cache`)
hits only the four head regexes (`:460`, `:464`, `:874`), two DESCRIPTIVE mentions of `npx vitest` (`:711`,
`:2136` — "a bare/npx vitest bypasses…", "WARNS on bare `npx vitest`"), and the rm safe-target list
(`:670`). No retired door is recommended. The pin (`tests/tooling/tool-guard.int.test.ts:1250-1274`) is
non-vacuous: its positive-control loop asserts six live spellings are PRESENT before the dead-list zero
counts (note only that `"pnpm test"` is a substring of `"pnpm test:ct"`, so that one control is trivially
true — harmless). Merge caveat: main's `package.json` still has `ct:scoped`, `typecheck:graph`,
`typecheck:tests-dom`, `check:tests-membership` and `scripts/typecheck.cjs` (lines 48–52, 92); the dead list
is true only with this branch's `package.json`, which lands in the same merge.

### 3 · The CT rewrite — right posture, with the F6 edge

A rewrite (allow + `updatedInput`) is the guard's REWRITE tier by definition (`:52-55`: "the fix is
unambiguous … strictly better than deny"), and here it is unambiguous: one script, one config. Judged against
`test:ct` = `nice -n 19 node tooling/src/verify/cli.ts scoped-test ct` → `runScopedTest` (`scoped-test.ts:238-296`):
it takes the lock and host slot BEFORE preflight, accepts zero path operands (`preflight` `:216-218` returns
with nothing to audit → whole suite, so `npx playwright test -c playwright-ct.config.ts` → `pnpm test:ct` is
faithful), adds `-c playwright-ct.config.ts` itself (`:168`, so dropping `-c` is correct and keeping it would
pass two), and forwards every flag verbatim to playwright (`--reporter=line`, `--repeat-each=3`,
`--retries=2`, `--project=chromium`, `--workers=8`, `--headed --debug`, `--update-snapshots`, `--trace on`,
`-g "foo bar"`, `--list` all rewrite and are accepted: B rows 1–8, 18–22). Deny arms are all
deny-with-advice, none loosen: a redirected raw run (`… > /tmp/ct.log 2>&1`), a `nice`/env-assignment
prefix (`nice -n 19 npx …`, `CT_PORT=3200 npx …`), a non-last clause (`npx … ; echo done`) — B 9, 11, 12, 16,
17\. A `timeout N` prefix is preserved and now also bounds the host-slot queue wait (up to 45 min load-scaled);
a killed queued run leaves a lock file, but both the worktree lock and the host slot self-heal on a dead pid
(`ct-runner-lock.ts:23-24`, `host-slots.ts:271-275`), so no wedge. Old recipe rows: `rm -rf playwright/.cache &&
npx playwright …` → `rm -rf playwright/.cache && pnpm test:ct …` (the dead clear survives as a harmless
no-op prefix).

### 4 · The deletions — premise verified, rule 4 owns the piped case

`ct-runner-lock.ts:13-17` and `:207-208` mint `.cache/ct/build-<pid>-<ms>` per invocation and export it as
`ORB_CT_CACHE_DIR`; `playwright-ct.config.ts:335-342` reads it into `use.ctCacheDir` and falls back to
playwright-ct's stock `playwright/.cache` only when unset; `ct-run-slot.ts:11-13` documents the same. Nothing
on the tree READS `playwright/.cache` any more: the tree-wide sweep (excluding node\_modules/reports/.cache and
the three `.stryker-tmp` sandbox copies) hits only comments, `biome.json:33`'s ignore, the guard's rm
safe-target list, the pin rows, and `.claude/settings.json:139` `Bash(rm -rf playwright/.cache)` (a stale but
harmless allow). So `PLAYWRIGHT_CACHE_CLEAR`, the "sanctioned = cache-clear + `-c`" arm and the piped-rewrite
branch were built on a dead premise and their deletion is correct — with the caveat that the stock default
is exactly why F1's un-rewritten spellings still corrupt. Rule 4 genuinely owns the piped case now:
`pnpm test:ct x 2>&1 | tail -40`, `pnpm test:ct x | tail -40`, `cd /repo && pnpm test:ct x 2>&1 | tail -40; echo
done`, `nice -n 19 pnpm test:ct x | tail -40`, `pnpm test:ct x --repeat-each=3 2>&1 | tail -40`, `pnpm run
test:ct x | tail -40` → all `allow/harness-piped` with the redirect+reader+exit-restore template; `pnpm test:ct x
|| true` → `deny/harness-swallowed`; a redirected `pnpm test:ct x > /tmp/ct.log 2>&1` → `pass` (B 23–30).
`CONTEXTS.playwrightPiped` is gone and its only caller went with it.

### 5 · The registration — executes, Bash-only, sane timeout, Codex untouched

`.claude/settings.json:4-14`: one `PreToolUse` entry, `matcher: "Bash"`, `type: "command"`, `command:
"$CLAUDE_PROJECT_DIR/.claude/hooks/tool-guard.mjs"`, `timeout: 10`. The file is `-rwxrwxr-x` with
`#!/usr/bin/env node` on line 1, so the direct form executes; proof that this exact form runs: main's checkout
carries a byte-identical block (`git diff main HEAD -- .claude/settings.json` differs only in the
`biome-check.sh` PostToolUse form) and main's `reports/tool-guard/decisions.jsonl` shows rule decisions from
this very session today (03:56Z–11:42Z, sid `aa2323a7…`, agent `main`/`executor`). Timeout: measured 6–11 ms
per decision in the logs; the worst path is two 2 s-capped `git` spawns for a script target plus a /proc scan
on commit/merge — 10 s holds. `.codex/hooks.json` is `{"hooks":{}}`, untouched by the diff (`git show --stat
40223a091 -- .codex` is empty), and `.codex/hooks` symlinks to `.claude/hooks`. `sync.int.test.ts` flips
`not.toContain("tool-guard.mjs")` → `toContain("/.claude/hooks/tool-guard.mjs")` on the Claude side only and
pins `hookConfig.hooks` equal to `{}` on the Codex side with the owner quote (at HEAD `1e6556733`). Note for
the merge: the archive commit `1ce276795` is NOT an ancestor of main (`merge-base --is-ancestor` → 1); the
settings hunk is a no-op against main and the guard/pin/sync-test changes are what land.

### 6 · The #1898 fork entry — house idiom satisfied; two accuracy caveats

Header `:2-12`: the ARCHIVED banner became a dated entry naming #1898, the mechanism that survives (the path
is fixed because replay and the corpus execute this exact file and `SELF_CHECKOUT` `:392-398` derives identity
from `../..` of it), the input that changed (registration, with the incident), the Codex ruling with the
owner's words, and the coupled assertion's home. That is "the ruling survives — its INPUT changed" in full.
The file did not move: `git log --oneline -6 -- .claude/hooks/tool-guard.mjs` is continuous at the same path
(`1e6556733`, `40223a091`, `1ce276795`, `24d54ca2d`, …), and `SELF_TOOL_PATHS`/`projectRepoIdentity` still
resolve from it (the self-exempt pin rows pass, 25/25). Caveats, not findings: (i) the entry says "swept five
lanes' files" (`:4`, and the sync-test comment) where the brief and the memory record say four siblings /
four lanes live — I could not confirm which; (ii) "the archival removed the ONLY enforcement" is true for
sessions rooted at this branch's checkout, not for main-rooted ones (main never had the archive and its log
shows the guard firing today).

### 7 · The two escalated judgment calls

**(a) `pnpm stack` / `pnpm engines` in the harness-head alternation — NO, at any severity.** The hang mechanism
the harness rule is built on (descendants inheriting the pipe's write end, `:44-50`) is structurally absent
here: `tooling/src/stack/stack.sh:730` launches the leader as `(cd "$REPO" && exec setsid bash "$SELF" _leader) >>"$LOG" 2>&1 &` and `engines.sh:267` as `setsid "$TSX" … --detach >>"$LOG_DIR/engines-start.log"
2>&1 &` — the daemons' stdio is a log file before the pipe could ever be inherited, so the only cost of
piping is the exit code. Corpus: 121 piped `pnpm stack|engines` rows, 36+7+2+2+2+2+1 of them `pnpm stack
status … | tail/head` (short-lived, harmless), a handful `stack restart|stop … | tail -1`. A rewrite/deny
would cry wolf on the dominant benign shape for a benefit the launcher already provides; "precision over
coverage" says leave it. If the owner wants the exit-code nit covered at all, the only honest arm is a
WARN-tier context on `pnpm stack (start|restart|stop)`/`pnpm engines (up|down|restart)` piped — never
`status`, never deny.

**(b) `.claude/**` linted by nothing — acceptable as a STYLE carve-out, not as a BEHAVIORAL one.** Receipts in
F3. The smallest honest floor is behavioral and cheap: `node --check .claude/hooks/*.mjs` as a static-tier
stage (sub-second, catches the one failure that silently disables every rule), plus the guard's pin — or at
minimum its contract/registration/advice tests — in a push-tier stage (the whole file runs in 2.35 s). Biome
coverage of a 2,355-line hook would need a scoped override with a correctness-only subset; optional, and not
what protects anything. Pin row 349 should be retired or relabelled, since it asserts a spelling that checks
zero files.

### 8 · The pin

`pnpm test:scoped tests/tooling/tool-guard.int.test.ts tests/tooling/agent-sync/ops/sync.int.test.ts` →
`Test Files 2 passed (2) · Tests 25 passed (25) · Type Errors no errors · Duration 2.35s`, exit 0
(`tool-guard.int.test.ts` 24 tests, `sync.int.test.ts` 1). Matches the lane's 25/25.

### 9 · The invocation-floor map

Floor facts measured this session: bare `node` → `heap_size_limit=4192MiB`, `NODE_OPTIONS=null`; `pnpm exec
node` and a `pnpm run` script → `16480MiB`, `NODE_OPTIONS="--max-old-space-size=16384"`. `scripts/ts7.cjs:82`
injects `--max-old-space-size=16384` itself. Every `tooling/src/_shared/proc.ts` spawn door prefixes `nice -n
19` (`:88`, `:131`, `:147`, `:290`, `:300`); the one un-niced door (`spawnFullPrioritySync` `:156`) is
census-gated. `verify run`'s stage registry (`tooling/src/verify/lib/registry.ts:34-384`) spawns every stage
as `["pnpm", "<script>"]` through `spawnNicedTranscript` with the ambient env, so stage children are floored
regardless of how `run` itself was invoked. `gate-contract` measured both ways: bare `node` and `pnpm
gate:contract` each 831 findings / 271 modules, \~82 s wall, max RSS 1,059,816 vs 1,062,672 KB (≈1.0 GiB) —
it fits under the 4 GiB default today; the ceiling is the difference, not the footprint. `structure` was not
re-run bare (the exit-134 is on record in `gates-and-tooling.md` and `heap-floor.ts:4`).

| spelling | heap floor | nice | concurrency cap | guard | advice names floored door |
| - | - | - | - | - | - |
| `pnpm check` / `pnpm verify …` | yes (pnpm run) | yes (script + proc.ts) | whole-run host queue; every stage re-enters `pnpm <script>` | pass (rewrite if piped) | n/a |
| `node tooling/src/verify/cli.ts run …` (bare) | orchestrator NO (light); stage children YES (pnpm) | yes | same | pass | — |
| `pnpm check:structure` / `pnpm gate:contract` / `pnpm check:type-ownership` | yes | NO (in-process, no script prefix) | — | pass | — |
| `node tooling/src/verify/cli.ts structure\|gate-contract\|tests-membership` (bare) | NO — 4 GiB in-process ts-morph | NO | — | pass | — (F5) |
| `pnpm typecheck [--config]` | children YES (ts7.cjs self-floors) | yes (spawnNiced) | `--checkers 4`, pool 1 | pass | (recommended in pin row 346) |
| `node scripts/ts7.cjs …` | yes (self) | NO | checkers 4 | pass | — |
| `npx tsc …` / `node_modules/.bin/tsc …` | NO | NO | none (TS6, single thread) | pass (row 407 pins PASS) | — (F5) |
| `pnpm exec tsc …` / `pnpm -r exec tsc …` | yes | NO | `-r`: pnpm default 4-wide | pass | — (F5) |
| `pnpm test:scoped <paths>` | yes | yes | vitest 4 + supervisor watchdog + preflight | pass | is the door |
| `pnpm test:node` / `pnpm test:tooling` / `pnpm test` | yes | yes | supervisor | pass | — |
| `pnpm vitest run …` / `pnpm exec vitest run …` | yes | NO | vitest 4 (config), no watchdog | pass, silent | — (F5) |
| `npx vitest …` / `vitest …` / `node_modules/.bin/vitest …` | NO | NO | vitest 4 | WARN → `pnpm test:scoped` | yes |
| `node node_modules/vitest/vitest.mjs run …` | NO | NO | vitest 4 | pass, silent | — |
| `pnpm test:ct <paths>` | yes | yes | ct 4 + worktree lock + host slots 2 + per-invocation cache + run marker | pass | is the door |
| `npx playwright test …ct…` / `pnpm exec playwright test …ct…` | (rewritten) | (rewritten) | (rewritten) | REWRITE → `pnpm test:ct` | yes |
| `node_modules/.bin/playwright test …` / `pnpm playwright test …` / `node …/@playwright/test/cli.js test …` | `.bin`/`node` NO; `pnpm playwright` yes | NO | ct 4 only; NO lock/slot/marker, shared cache | pass, silent | — (F1) |
| `pnpm e2e` / `pnpm e2e:smoke` | yes | yes (script) | — | pass | — |
| `pnpm lint` | n/a (Rust) | yes | biome uses all cores | pass | — |
| `npx biome …` / `pnpm exec biome …` | n/a | NO | all cores | pass (write-mode rules only) | — |
| `pnpm lint:eslint` | yes (re-enters `pnpm exec node scripts/eslint.cjs`) | yes | `--concurrency off` per compiler owner | pass | — |
| `pnpm exec node scripts/eslint.cjs <paths>` | yes | NO | 4 (profile) | pass | — |
| `node scripts/eslint.cjs <paths>` | NO | NO | 4 | pass | — (F5) |
| `npx eslint <paths>` / `node_modules/.bin/eslint` | NO | NO | off | pass | — (F5, 380 sightings) |
| `pnpm test:mutation[:gate]` | yes | yes | stryker 6 | pass | — |
| `npx stryker run …` / `pnpm exec stryker run …` | npx NO / exec yes | NO | 6 (config reads profile) | pass | — |
| `pnpm knip` / `npx knip` | pnpm yes / npx NO | NO | — | pass | — |
| `pnpm depcruise` | yes | yes (runNicedSync) | — | pass | — |
| `npx depcruise …` | NO | NO | — | pass | — |
| `pnpm cpd` | yes | NO | workers 4 | pass | — |
| `npx jscpd …` | NO | NO | all cores (24) | pass | — |
| `pnpm ast …` | yes | NO | — | pass (deliberately outside harness heads) | — |
| `node tooling/src/ast/cli.ts …` | NO | NO | — | pass | — |
| `pnpm snap …` / `node tooling/src/snap/cli.ts …` | pnpm yes / bare NO | full-priority stage boot by design | stage cap 3 | harness head (pipe rule) | — |
| `pnpm codemod …` / `pnpm codemod:run x.ts` | yes + `assertHeapFloor` | NO | — | pass | (the codemod kit's own refusal names it) |
| `node scripts/codemods/x.ts` | NO → refused at second zero by `heap-floor.ts` | — | — | pass | — |
| `tsx …` / `npx tsx …` | NO | NO | — | pass | — |
| `bash tooling/src/stack/stack.sh …` / `pnpm stack …` / `pnpm engines …` | n/a (daemons detach with own logs) | leader/engines as launched | — | pass, incl. piped | — |
| `pnpm --filter @orb/client build` / `pnpm --filter @orb/ui exec tsc --noEmit` | yes | NO | — | pass | — |

Guard judgment against the map: it denies/rewrites nothing for typecheck, eslint, stryker, knip, depcruise,
jscpd or the in-process ts-morph verbs; it rewrites raw CT only on the `npx`/`pnpm exec` spellings; it warns
on vitest only on the `npx`/bare/`.bin` spellings; and its advice names the floored door only for CT and
vitest. `--workers`/`--maxWorkers` above the cap pass on every spelling.

## Verified clean (what my silence covers)

- Every hunk of `40223a091` and `1e6556733` read against the full files; `.claude/hooks/tool-guard.mjs`
  read whole (1–2355) including the header law and every REASONS/CONTEXTS/BRIEFING string;
  `tests/tooling/tool-guard.int.test.ts` whole (1–1295); `tests/tooling/agent-sync/ops/sync.int.test.ts`
  whole; `.claude/settings.json` whole; `.codex/hooks.json`; `package.json` whole; `pnpm-workspace.yaml`
  whole; `tooling/concurrency-profile.json` whole.
- Guard probes: 175 spellings across four groups, each classified through the committed hook by
  `--classify-batch` with `procRoot` pointed at an empty dir and `projectDir=/repo` (the pin's shape); the
  same 175 through the pre-diff guard (`1ce276795`) and diffed; the tracked-script rows re-run from a
  scratchpad copy of the new guard to isolate the placement artifact.
- Pin: `pnpm test:scoped …` 25/25 (receipt in §8). `pnpm verify --list` read whole for the tier facts.
- Floors: `heap_size_limit` under bare node / `pnpm exec node` / `pnpm run`; `/usr/bin/time -v` on
  `gate-contract` both ways; `proc.ts`, `process-env.ts`, `heap-floor.ts`, `entrypoint.ts`, `ts7.cjs`,
  `vitest-supervised.mjs`, `depcruise.mjs`, `cpd.ts`, `eslint.cjs`, `verify/ops/{scoped-test,typecheck,eslint}.ts`,
  `verify/lib/{ct-runner-lock,host-slots,whole-run-queue,registry(argv lines)}.ts`, `_shared/{ct-run-slot,
  concurrency-profile,scoped-run-paths,stryker-config}.ts`, `vitest.config.ts`, `playwright-ct.config.ts`,
  `stryker.config.js`, `.claude/hooks/cpu-fence.sh`, `biome.json` (files block), `eslint.config.js` (ignores +
  surfaces), `project-worlds.ts:65`.
- Lint coverage of the hook probed live (biome: 0 files; eslint: exit 0 empty).
- Tree sweep for `playwright/.cache` readers and the `.cache/ct` premise (`/usr/bin/grep -a -rn`, node\_modules/
  reports/.cache excluded; `.stryker-tmp` copies discounted).
- Corpus counts from main's 179,120-row decision log for every spelling in F1/F4/F5/7(a).
- `git status --short` empty at HEAD `1e6556733` before and after; nothing outside this file was written in the
  tree (probes lived in the session scratchpad and `/tmp`; the `pnpm test:scoped`/`gate:contract` runs wrote
  only under gitignored `reports/`).

## Unconfirmed / low priority (not findings)

- "five lanes' files" (guard header `:4`, sync-test comment) vs "four siblings" (brief) / "four lanes live"
  (memory record) — could not confirm which number is right.
- `pnpm gate:contract` is RED on this branch (831 legacy-field/direct-walk/module-mutation findings across
  271 gate modules, exit 1) — the in-flight gate migration state, not this diff; not in any `pnpm check` tier.
- The pin's garbage-stdin test appends a `guard-error` row to the REAL worktree `reports/tool-guard/decisions.jsonl`
  on every run (`runHookMode` `:2286-2293` logs to `process.cwd()` before `CLAUDE_PROJECT_DIR` is read at
  `:2299`; `:2341`). Cosmetic, pre-existing.
- `REWRITE_TIMEOUT_MS` 600 s vs a host-slot queue wait of up to 45 min (load-scaled): a rewritten CT run queued
  behind two fleets can be killed by the Bash tool while still queued — identical to typing `pnpm test:ct`
  directly, so not a rewrite defect.
- `.claude/settings.json:139` still allowlists `Bash(rm -rf playwright/.cache)`; harmless (the rm rule already
  passes it via `RM_SAFE_TARGET`).

## Not covered

- No real CT run was executed through the rewrite (F6 is by reading `isPathShaped` + `runScopedTest`).
- `structure` was not re-run bare (the exit-134 receipt is cited, not reproduced).
- The 179k-row replay (`scripts/probes/guard-replay.ts`) was not run; the A/B is my 175-row probe corpus.
- `tooling/src/verify/ops/run.ts` was read only at its spawn sites (`:240-300`, `:145`, `:415`);
  `stack.sh`/`engines.sh` only at their detach lines; `tests/tooling/verify/ops/scoped-test.int.test.ts` not read.
- Claude Code's hook-timeout and non-zero-exit semantics are taken from the documented contract the guard's
  header relies on, not re-verified against the client.
- The memory-watchdog incident the coordinator cited was not investigated.

## Proposed memory lessons (the orchestrator owns the write)

- `- [glued closer shields the guard](group-closer-glued-to-operand-is-a-shield.md) — \`(bash /tmp/x.sh)\` passes tool-guard, \`(bash /tmp/x.sh )\` denies: shellWords keeps \`)\` in the word, ENOENT is silence`Body: the 2026-09-11`ungroup`fix blanks word-initial`(`/`{`so`(setsid nohup bash -c … &)`is read, but a`)`/`}` glued to the LAST word rides into the operand (`/tmp/x.sh)`), resolves to a nonexistent path, and the
  fail-open ENOENT arm returns silence — script operand, `source`operand, bare`.sh`head, pipe sink and
  write-then-run target all inherit it. **How to apply:** any operand resolver strips a trailing unquoted
  group-closer run before`statSync\`, and a pin row for the glued spelling sits beside every spaced one.
- `- [raw CT head vocabulary](ct-rule-head-misses-dot-bin-playwright.md) — 268/782 raw CT corpus rows are \`./node\_modules/.bin/playwright test\` or \`pnpm playwright test\`; a head regex naming only npx/pnpm exec passes them un-floored`Body: measured 2026-09-11 on the 179k-row decision log. **How to apply:** a head regex for any tool must
  carry`(?:\S\*/)?<bin>`and`pnpm <bin>`beside`npx`/`pnpm exec\`, and the corpus count is the receipt.
- `- [guard pin is --full-only](tool-guard-pin-is-full-tier-only.md) — \`tests:tooling\` runs only under \`pnpm verify --full\`; \`pnpm check\`/\`--push\` never spawn tool-guard.mjs, and biome/eslint apply zero rules to \`.claude/hooks/\*.mjs\``Body: a syntax error in the hook exits non-zero with no JSON → non-blocking hook error → every Bash call
  proceeds unguarded and the push bar stays green. **How to apply:** a hook's floor is`node --check`in the
  static tier plus its contract pin in the push tier; a`pnpm exec biome check .claude/…\` receipt is "Checked
  0 files".

## Issue summary (paste-ready)

Stickler review of `40223a091` (+ docs follow-up `1e6556733`) on `codex/world-gate-integration`: the
`ungroup()` fix is index-safe, leaves `$(…)`/`${…}` alone, and loosens nothing (175-row A/B against the
pre-diff guard: 41 rows moved, all stricter; the two apparent loosenings were a placement artifact, proven);
the advice surface names only live scripts; the CT rewrite is the right tier and `pnpm test:ct` accepts what it
forwards; the `playwright/.cache` premise is dead on the tree and rule 4 owns the piped case; the registration
executes (byte-identical to main's block), Bash-only, 10 s timeout sane, `.codex` untouched; the #1898 entry
follows the house idiom; pin 25/25 in 2.35 s. Six CONFIRMED findings, severity ceiling P2, none a regression:
F1 rule 6 misses `./node_modules/.bin/playwright test` / `pnpm playwright test` / `node …/cli.js test` (268
corpus sightings pass un-floored with no lock/slot/marker and the shared cache); F2 a group closer glued to the
operand still shields a script body — `(bash /tmp/x.sh)` passes, `(bash /tmp/x.sh )` denies (0 corpus
sightings; violates the guard's own #631 law); F3 the hook is linted by nothing, its only behavioral pin is
`--full`-only (a syntax error fails open through the push bar), and pin row 349 asserts a biome spelling that
checks 0 files; F4 `CMD='git stash'; bash -c "$CMD"` and `eval "git stash"` pass (0 sightings); F5 `npx
eslint` (380 sightings), `npx tsc` (269, pinned PASS at row 407), bare `node …/cli.ts structure`, `npx
stryker|jscpd|knip|depcruise`, silent `pnpm vitest`, and over-cap `--workers=N` all pass un-floored with no
advice; F6 the rewrite forwards a slash-bearing flag value (`--output reports/x`, `-g a/b`) that
`scoped-test`'s preflight refuses as a path claim. Judgments: 7(a) do NOT add `pnpm stack`/`engines` to the
harness heads (daemons detach with their own log redirects; 36+ of 121 piped sightings are harmless
`status | tail`); 7(b) the lint carve-out is acceptable, the honest floor is `node --check .claude/hooks/*.mjs`
in the static tier plus the guard pin in the push tier. Full invocation-floor map (item 9) in the report:
`docs/reviews/stickler/2026-09-11-tool-guard-reenable.md`.
