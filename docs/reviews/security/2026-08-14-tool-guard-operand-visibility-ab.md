---
kind: security-review
status: landed (code merged with this doc)
owner-review: REQUIRED (the A–K decision agenda below)
updated: 2026-08-14
scope: tool-guard operand visibility — bash -c operands, $( ) substitutions, realpath self-identity, pipe-rewrite comment tail, quoted rm targets/flags, path-prefixed rm, escaped quotes in a substitution; corpus A/B receipts
---

# tool-guard: quoted-command visibility — corpus A/B

The evidence receipt for the third guard leg (`.claude/hooks/tool-guard.mjs`), in the format the two
prior legs set: replay BOTH classifiers over every recorded Bash call on this box and account for every
command whose classification MOVES. **A guard change may only ever TIGHTEN**; "0 looser" is the claim
this document exists to support.

| | |
| - | - |
| **Base** | `0351b8a37` (`.claude/hooks/tool-guard.mjs` as merged after the script-body leg `b5b1db9c7`) |
| **Head** | this lane's commit (branch `wt/gf-guard`) |
| **Corpus** | **122,062** Bash `tool_use` commands across **2,264** transcripts (`~/.claude/projects` + `~/.claude-b/projects`) |
| **Method** | both `classify` implementations imported and run on the identical ctx (projectDir `/repo`, pinned clock, `/proc` scan pointed at a nonexistent root); read-only — strings are classified, never executed |
| **Headline** | **61 moved · 17 stricter · 0 looser · 44 same-rank** (38 of the same-rank are advisory text added, 6 are rule-id renames / a removed exemption) |

Prior legs for comparison: `27aad9d18` (identity-based self-exemption, 119,845 calls, 1 mover) ·
`b5b1db9c7` (untracked script bodies, 115,894 calls, 196 movers, all stricter).

## What the leg closed

1. **`bash -c '<string>'` operands were invisible** — the operand is quoted, so quote-blanking erased it
   before any rule could look. `bash -c 'git stash'` classified clean.
2. **`$( … )` / backtick substitutions were invisible** inside double quotes, and invisible to every
   HEAD-anchored rule even unquoted (the substitution is never at the head of its stage).
3. **The pipe rewrite's own comment tail** — the reader chain is sliced from the ORIGINAL text, so a
   trailing comment swallowed `; ( exit $__tg_ec )` to end-of-line. Measured: a harness exiting **3**
   produced a rewritten command returning **0** — the "red run reported green" failure the pipe rule
   exists to prevent, reintroduced by the fix for it.
4. **Self-exemption compared paths by SUFFIX** (found while writing the above): any file whose path ended
   in `/.claude/hooks/tool-guard.mjs` counted as the guard's own tooling and skipped every rule below it
   — including the hard floor. Identity is now the canonical **realpath** of the running hook.

## The finding that matters most

**The push control was bypassable by wrapping the push in `bash -c`.** Standing law is "a lane never
pushes; every push to origin gets a fresh owner word", and the guard enforces it (`git-push` /
`lane-git-push`). Three real corpus commands routed straight past it:

```
setsid nohup bash -c 'git push origin main > .cache/stack/push-overnight.log 2>&1; …' >/dev/null 2>&1 & disown
setsid nohup bash -c 'git push origin --delete retro-burn-down > .cache/stack/branch-delete2.log 2>&1; …' & disown
```

Both classified `pass/null` on the base guard (an explicit hook ALLOW) and now classify
`ask/inline:git-push`. There is no evidence these were malicious — they are the ordinary detached-launch
shape — which is exactly the point: the control was not enforcing what it claimed to enforce, and nobody
had to try to evade it.

## Transition table (every mover)

```
  38  pass/none        ->  pass/advisory              (+advisory)
   6  pass/none        ->  ask/subst:sqlite-live
   4  pass/none        ->  deny/subst:net-pipe-shell
   4  pass/self-exempt ->  pass/none
   3  pass/none        ->  ask/inline:git-push
   2  pass/none        ->  deny/inline:harness-piped
   1  allow/harness-piped -> ask/inline:git-push
   1  deny/harness-piped  -> deny/harness-piped       (+advisory)
   1  allow/harness-piped -> deny/subst:harness-piped
   1  ask/git-push        -> ask/git-push             (+advisory)
```

Read `inline:` = the verdict came from a `-c` operand, `subst:` = from a command substitution;
`script:` (prior leg) = from a wrapper script's body. Prefixes nest (`script:inline:…`).

An earlier run of the same A/B, with the nesting fence at 2 levels, showed **4 additional movers**:
benign `$(dirname $(readlink -f $(which claude)))`-shaped commands hitting the fence and asking. A hook
that cries wolf gets disabled, so the fence moved to 6 levels (extraction is pure string work on a
strictly shrinking input — it is a runaway fence, not a budget) and those four disappeared. Zero corpus
commands reach depth 6.

## Samples, per transition (verbatim, truncated at 260 chars)

### allow/harness-piped -> ask/inline:git-push

```
pnpm check 2>&1 | grep VERDICT | head -1 && rm -f reports/design-refs/crunchy-cluster-redesign/DESIGN.md reports/stickler/2026-07-24-wire-capture-bridge-custom-params.md reports/stickler/2026-07-27-w4-my-lane.md reports/executor/2026-07-26-appsettings-admin-su…
```

(the full command ends in a `setsid nohup bash -c 'git push origin --delete …'` clause)

### allow/harness-piped -> deny/subst:harness-piped

```
pnpm snap / --wide --open-chat "$(pnpm snap / --eval '__orb.queries().find(q=>JSON.stringify(q.queryKey).includes("listChats"))?.state?.data?.chats?.[0]?.id ?? "x"' 2>/dev/null | /usr/bin/grep -ao 'chat_[a-z0-9]*' | head -1)" --out x 2>&1 | tail -1
```

### ask/git-push -> ask/git-push (+advisory)

```
git add docs/retro-workboard.md .claude/agent-doctrine.md && git commit --no-verify -m "$(cat <<'EOF'\ndocs: kill the "verify --push runs NO CTs" folklore — it runs the whole battery\n\nReceipt, registry.ts:304's own comment: tests:node runs `pnpm test`, which is…
```

### deny/harness-piped -> deny/harness-piped (+advisory)

```
grep -rln "resolveContextTabs" tests/ | head; echo "---run it if present---"; pnpm vitest run $(grep -rln "resolveContextTabs" tests/ 2>/dev/null | head -1) 2>&1 | grep -E "Test Files|Tests|passed|failed" | tail -4
```

### pass/none -> ask/inline:git-push

```
setsid nohup bash -c 'git push origin main > .cache/stack/push-overnight.log 2>&1; echo "PUSH_EXIT:$?" >> .cache/stack/push-overnight.log' >/dev/null 2>&1 & disown; echo "push launched detached"
setsid nohup bash -c 'git push origin --delete retro-burn-down > .cache/stack/branch-delete2.log 2>&1; echo "EXIT:$?" >> .cache/stack/branch-delete2.log' >/dev/null 2>&1 & disown; echo launched
cd /home/inktomi/inktomi-stack/development/orbweaver\nSC=/tmp/claude-1000/-home-inktomi-…/scratchpad\nrm -f "$SC/push.log" "$SC/push.exit"\necho "pushing tip: $(git log --oneline -1)  ·  ahead…
```

### pass/none -> ask/subst:sqlite-live

```
for f in data/orbweaver.db.backup-* data/orbweaver.db.pre-baseline-reset-manual; do c=$(sqlite3 "file:$f?mode=ro" "select count(*) from chats;" 2>/dev/null); ts=$(echo $f | /usr/bin/grep -o '[0-9]*$'); when=$([ -n "$ts" ] && date -d @$((ts/1000)) +%m-%d\ %H:%M…
S=/tmp/claude-1000/-home-…/scratchpad; ls data/ | grep -oE "backup-17855[67][0-9]+$|backup-17856[0-9]+$" 2>/dev/null | grep -oE "[0-9]+" | sort -n | awk '$1>1785567604921 && $1<1785…
grep -n "snap-stage\|stageRoot\|\.cache\|join(root\|worktree\|STAGE_DIR\|stageDir" scripts/probes/_kit/snap-stage.ts | head; echo "==="; find . -name 'orbweaver.db' 2>/dev/null | grep -iv node_modules | while read f; do echo "$f: $(sqlite3 "$f" 'select count(*…
sed -n '73,90p' scripts/probes/_kit/snap-stage.ts; echo "=== all db under stage worktree ==="; find .cache/snap-stage -name 'orbweaver.db' 2>/dev/null | while read f; do echo "$f: $(sqlite3 "$f" 'select group_concat(name) from roster_presets;' 2>/dev/null)"; d…
```

### pass/none -> deny/inline:harness-piped

```
timeout 180 bash -c 'pnpm depcruise 2>&1 | tail -4 && echo "---STRUCTURE---" && pnpm check:structure 2>&1 | /usr/bin/grep -aiE "client-structure|feature|cross|fail|✗|error|clean" | tail -8'; echo "=== EXIT ${PIPESTATUS[0]} ==="
```

(two sightings of the same command — a piped harness plus `PIPESTATUS`, i.e. the shape the rewrite
cannot fix, hidden one layer inside a `-c` string)

### pass/none -> deny/subst:net-pipe-shell

```
cd …/orbweaver-retro\nenc() { node -e "process.stdout.write(encodeURIComponent(JSON.stringify({0:JSON.parse(process.argv[1])})))" "$1"; }\nCID=$(curl -s "http://localhost:5173/api/trpc/chat.listChats?batch=1&input=$(enc '{}')" | node -e "let d='';process.stdin…
cd …/orbweaver; echo "=== any rpg.extraction.* logs this run …"; for ev in unparseable empty phantom failed; do C=$(curl -s -m5 "http://localhost:8790/api/_debug/logs?q=extraction.$ev&limit=5" 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c)…
```

The extraction was audited by hand for these four: the substitutions genuinely contain
`curl … | node -e "<script>"`, so the hard floor's existing `net-pipe-shell` arm fires. See decision **B**.

### pass/none -> pass/advisory (advisory-only; non-blocking)

```
cd …/orbweaver-retro\nf=$(/usr/bin/grep -rln "FABRICATION-OK\|no-test-fabrication" scripts/ | grep -iE "fabricat" | head -1); echo "gate: $f"…
echo "=== makeMessageView fixture ==="; /usr/bin/grep -rln "makeMessageView\|MessageView" tests/client/**/*.ts … ; f=$(/usr/bin/grep -rln "function makeMessageView\|makeMessageView =" test…
perl -0777 -ne 'while (/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"(#providers|…)"/gs) { … }' $(grep -rl '"#providers"\|"@orb/server/infra/p…
```

All 38 are the same class: a `grep -r` without `--exclude-dir=node_modules` (or a bare `npx vitest`)
INSIDE a substitution now earns the same advisory it earns when typed. They RUN.

### pass/self-exempt -> pass/none

```
node --check …/.claude/worktrees/agent-a0541a7d3e011724d/.claude/hooks/tool-guard.mjs
node …/.claude/worktrees/agent-a830baf4f26c209ec/.claude/hooks/tool-guard.mjs --classify-batch < /tmp/…/cases.json
```

A worktree's COPY of the hook is not the hook this process is running, so it no longer self-exempts. All
four still pass — they simply get judged by the normal rules now, which is the whole point.

## Owner decision agenda (A–G; leg 5's H–K are in the section after this one)

Verbatim from the lane report. **Nothing in A–C, E–G was actioned** — every one of those would LOOSEN a
control, or is out of its leg's scope by instruction. D was closed by a follow-up leg (see its entry).

- **A.** 6 corpus commands like `c=$(sqlite3 "file:$f?mode=ro" "select count(*) …")` over
  `data/orbweaver.db.backup-*` now `ask/subst:sqlite-live`. That is the *existing* top-level rule applied
  consistently (a typed `sqlite3 data/orb.db …` already asks). Making `?mode=ro` or `backup-` a safe hint
  is a loosening → owner.
- **B.** 4 corpus commands `"$(curl -s http://localhost:… | node -e "<inline script>")"` now
  `deny/subst:net-pipe-shell` (the hard floor's arm; the typed form already denied). `node -e` does not
  execute the fetched bytes, so this arm arguably over-matches — but narrowing it is a loosening → owner.
- **C.** 1 command `pnpm snap / --open-chat "$(pnpm snap / --eval … | grep … | head -1)" … | tail -1` now
  denies (piped harness inside a substitution, no safe rewrite). Correct by the rule; costs one idiom.
- **D. Quoted `rm -rf` target blindness — CLOSED 2026-08-14 by the follow-up leg, not by this one.**
  Recorded here as found: `rm -rf "packages/server/src"` still passed at this leg's head. Exact
  mechanism, which the board row did not have: `RM_RF_HEAD`'s greedy `(?:-[a-z]*[rf][a-z]*\s+)+` matches
  the flag **plus all the blanked quoted target**, so the tail slice is empty and the target list comes
  out `[]` → the ask never fires. 29 of 32,171 rows in one decision log carry a quoted rm target. **The
  fix taken** was the second option — anchor the head to the flags only (`/^\s*rm(?:\s+-[a-z]*[rf][a-z]*)+/`),
  which grows the raw tail rather than re-reading a stripped one, so `targets.some(unsafe)` can only move
  a command STRICTER. Its own A/B: 122,880 commands, 131 moved, 130 stricter, **0 looser**. Shipped
  together with the owner-ruled other half — an rm target is now resolved against the variables the
  command ITSELF assigned earlier (`SP=/tmp/…/scratchpad; rm -f "$SP/x.log"` passes; `R=/home/…/orbweaver;
  rm -rf "$R"` still asks; an unresolvable `$VAR` still asks) — because 52 of the 53 quoted-rm rows in a
  live decision log are that idiom and the identical unquoted spelling was already asking. Combined A/B:
  122,959 commands, 69 moved, 44 stricter, 17 ask→pass (every one audited: 28 resolved targets, all
  substring-safe under `RM_SAFE_TARGET`), 8 same-rank rule-id changes. Rows in
  `tests/tooling/tool-guard.int.test.ts`.
- **E. `script-scan-error` still emits `defer`** (`.claude/hooks/tool-guard.mjs`, script-body pre-pass),
  which at the wire stalls a subagent on a command nothing objected to. Pre-existing, one line, but
  flipping it is a decision, not a fix. (This leg's own `nested-scan-error` path deliberately returns
  `pass` + a visible advisory instead, for exactly that reason.)
- **F.** Untouched as instructed: `RM_RF_HEAD` matching plain `rm -f` (it refused this lane's own
  `rm -f gf-ab-report.txt` mid-run — a live receipt that the over-match bites) and `packages/**/__probe`
  not in `RM_SAFE_TARGET`.
- **G (added by the D follow-up leg, 2026-08-14; owner declined to take it — standing).** The rm-target
  scan counts a trailing COMMENT's words as targets, so `rm -rf /tmp/foo # cleanup` asks today on its `#`
  and `cleanup` tokens. Mechanism: the target slice runs to the end of the STAGE, and a comment is
  invisible in the blanked text (its span reads as spaces, exactly like a blanked quoted span — the same
  class that cost the pipe rewrite its exit code, above). Pre-existing and an OVER-match, so fixing it
  would LOOSEN — hence not taken inside a tighten-only leg. Closing the quoted-target hole extends the
  same false positive to the quoted spelling (`rm -rf "/tmp/foo" # cleanup`). The fix, when it is worded:
  intersect the target slice with the stage's non-comment span (`commentSpans` already returns it).

## Leg 5 — three more visibility closures (2026-08-14)

Same instrument, same law, one corpus later: **123,462** Bash commands across **2,281** transcripts (both
`~/.claude*` roots), base = `629dc7e89` (the D follow-up as merged), each tighten replayed BOTH on its own
and combined, so a 0-mover arm can be told apart from a broken one. Arms were verified to actually apply
their tighten (probe rows) before their mover count was believed.

| arm | moved | stricter | looser |
| - | - | - | - |
| H — quoted flags | 0 | 0 | 0 |
| I — path-prefixed `rm` | 1 | 1 | 0 |
| J — escaped quotes in a `$( )` | 0 (2 change EXTRACTION) | 0 | 0 |
| combined head vs base | **1** | **1** | **0** |
| K — flag vocabulary (second commit, vs `351a5af2d`) | 0 | 0 | 0 |

Rows in `tests/tooling/tool-guard.int.test.ts` (26 new for H–J, **11 of them RED on base**; 5 more for K,
**3 RED** on the leg-5 commit — all green on head).

- **H. Quoted `rm` FLAGS were invisible — CLOSED.** `rm "-rf" packages/server/src` classified `pass/none`:
  the head required an UNQUOTED `-r`/`-f` immediately after `rm` (`/^\s*rm(?:\s+-[a-z]*[rf][a-z]*)+/`), and
  a quoted token is spaces in the blanked text, so the regex matched NOTHING and the rule never engaged.
  Exactly the D hole one token to the left — quoting is the SHELL's business, `rm`'s getopt receives `-rf`
  either way. Fix: the head is now the COMMAND WORD only (`RM_HEAD`) and both flags and targets are read as
  RAW tokens, with an `-r`/`-f` flag recognised quoted or not (`RM_FLAG_TOKEN`). **Corpus: 0 commands carry
  the shape at all** — an evasion path closed before it was walked, not a measured behaviour change. Also
  tightened by construction: a flag AFTER the target (`rm packages/server/src -rf`, a real deletion) used
  to pass because the old head demanded adjacency.
  **The one direction this leg can move a command LOOSER**, stated because "0 looser" is the claim this
  document exists to support: a quoted `-r`/`-f` token stops counting as a TARGET, so
  `rm -r "-f" /tmp/scratch` goes ask → pass. It was a false positive (the deletion is `/tmp/scratch`,
  sanctioned; `"-f"` is not a path), 0 corpus commands are that shape, and it is pinned as an int row
  together with `rm -rf "-i" /tmp/scratch` / `rm -rf "--one-file-system" /tmp/scratch`, which still ask —
  only r/f flag tokens are reclassified, nothing else.
- **I. A path-prefixed `rm` was not `rm` — CLOSED.** `/bin/rm -rf packages/server/src` classified
  `pass/none`; every other head regex in the guard already carried `(?:\S*\/)?` (`READER`,
  `NET_FETCH_HEAD`, `SHELL_SINK_HEAD`, `SCRIPT_SHELL_EXEC`) and this one did not. **The single mover in the
  whole leg is this one, and it is real:** a recorded lane command
  `/usr/bin/rm -f <repo>/tests/client/features/refinery/components/zzverify-contrast.ct.tsx && git -C … status --short`
  deleted a file inside the checkout and passed clean; the identical `rm -f …` spelling already asked. Now
  `ask/rm-rf-unsafe`. The prefix can only match a token whose LAST path segment is exactly `rm`, so `npm`,
  `pnpm rm`, `/usr/bin/rmdir` and `/usr/bin/grm` cannot be confused for it (all pinned must-pass).
- **J. An escaped quote inside `$( … )` skipped the substitution ENTIRELY — CLOSED.** `substitutionEnd`
  walked a `blankQuoted` copy, and that helper treats `\"` as OPENING a quote (it only honours the
  backslash when CLOSING one). A `$( … )` nested in double quotes must escape its own inner quotes, so the
  phantom span swallowed the closing paren, the walk returned -1, and the substitution was dropped from
  extraction — `echo "$(rm -rf \"packages/server/src\")"` was classified as NOTHING, which is the one
  outcome the whole quoted-command pass exists to prevent. Fix: a self-contained paren walk that honours
  escapes (`blankQuoted`'s job is blanking spans for the rule regexes, not parsing shell escapes, and
  changing it would touch every rule in the file). **Corpus: 0 verdict movers, but 2 commands change what
  is EXTRACTED** — in both, base missed the OUTER substitution and picked up inner ones instead; head reads
  the outer body and the recursion reaches the inner ones from it. 41 corpus commands carry an escaped
  quote inside a `$(`; none of the other 39 classified differently. A verdict A/B alone cannot see this
  fix, which is why the extraction delta was measured separately.
- **K. The flag VOCABULARY was lowercase-short-only — CLOSED** (found by leg 5, ruled in by the
  orchestrator the same day: a 0-mover TIGHTEN closing an identical-deletion blindspot needs no owner word
  under the tighten-only law — only loosenings escalate). `rm -R packages/server/src` and
  `rm --recursive --force packages/server/src` classified `pass/none`: `-R` is GNU rm's documented
  recursive spelling and `--recursive --force` is the long form of `-rf`, so both deleted the identical
  tree while carrying nothing `RM_FLAG_TOKEN` recognised, and the rule never engaged. A different defect
  from A–J — vocabulary, not visibility — and pre-existing (the leg-5 base behaves the same). Fix, exactly
  as measured before it was ruled in: `/^(['"]?)(?:-[a-zA-Z]*[rRfF][a-zA-Z]*|--(?:recursive|force|dir))\1$/`.
  **A/B against the leg-5 commit `351a5af2d`: 123,462 commands, 0 moved, 0 looser** — the gap cost nothing
  to close. It composes with the other three closures: `rm "-R" …`, `/bin/rm --recursive --force …` and
  `echo "$(rm -R …)"` all ask now too. `rm -R /tmp/scratch` stays a clean pass (the safe list decides, as
  ever), and `-i`/`-I` still carry no r/f so an interactive-only rm is still not this rule.
  Declared limit, deliberate because it is what was measured: long `--dir` engages, short `-d` does not
  (no r/f in the token) — `-d` only unlinks an EMPTY directory, the least urgent of the family.

## Assumptions this leg makes (stated so they can be challenged)

- **Single-quote asymmetry is deliberate.** `'$(x)'` is literal text and is NOT extracted; biting it
  would be a false tighten on a string nobody runs. A `bash -c '…'` operand IS extracted regardless of
  quote kind, because the operand is a command either way.
- **Comments and heredoc bodies stay text**, consistent with the guard-wide blanking. Declared limit: a
  heredoc with an *unquoted* delimiter does expand `$( )` in real bash; treating heredoc bodies as
  commands is a separate guard-wide decision.
- **Symlink → the real hook exempts** (same realpath, same bytes, deliberate); a byte-identical COPY does
  not. `$VAR`-bearing paths never resolve and therefore never exempt — the loss is only the exemption,
  never the ability to run.
- **Tracked ⇒ reviewed** (inherited from the script-body leg) still holds for script files; the nested
  pass adds no new trust assumption of its own.

## Reproducing

The A/B harness is ephemeral by design (it imports both classifier versions by path). To re-run against a
future base: extract the base guard with `git show <sha>:.claude/hooks/tool-guard.mjs`, import both
`classify` functions, and replay the transcript roots the way `scripts/probes/guard-replay.ts` does — that
probe is the maintained instrument for single-version replays, and its extraction loop is what this A/B
copied. The int suite (`tests/tooling/tool-guard.int.test.ts`, 20 tests) pins every must-bite and must-pass
row named here, at the classifier AND at the PreToolUse wire protocol.

Leg 5 added two method notes worth reusing. **Extract the corpus ONCE to a JSONL cache** (command, scope,
cwd) and replay N variants against it — the 4.5GB read is the whole cost, classification of 123k commands
is ~15s per variant, so per-tighten arms become free. **Place every variant at
`<dir>/.claude/hooks/tool-guard.mjs`**, including the base: the guard's self-exemption is a realpath
identity computed from `import.meta.url`, so an asymmetric layout invents `self-exempt` movers. And a
0-mover arm is only evidence once the arm has been shown to APPLY its tighten (probe rows first, then
believe the count) — one of leg 5's three arms moves nothing in 123k commands and is still a real closure.
