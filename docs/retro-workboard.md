# Retro Workboard — the live board

> **THIS IS THE WORKING DOC** (owner-stated). Not law, not a deliverable — the durable state an
> orchestrator resumes from cold. Authority for LAW = `docs/architecture/core/**`; the D-ledger
> (`Core-Path-Registry.md` / `Core-Laws-and-Precedents.md`, current through **D126**) wins on ANY
> conflict. `docs/architecture/proposed/**` is pre-rollback REBUILD REFERENCE — never cite its status
> as current.
>
> **CURRENT-STATE ONLY, INITIATIVE-SHAPED.** When a block goes stale, REWRITE it — never stack a new
> session layer on top. Rewritten in full 2026-08-03 (the line-by-line audit close: every claim in the
> ~3,500-line accreted board was classified DONE-PROVEN / OPEN / STALE / UNKNOWABLE against the tree
> and git; only proven-done work was removed from the live board). **The audited archeology — every
> struck block, snapshot, lane seal and receipt from 2026-08-01 through 2026-08-03 — moved intact to
> [`docs/history/retro-workboard-2026-08-03.md`](history/retro-workboard-2026-08-03.md).** Nothing was
> deleted; things moved. Prior baselines: `git log docs/retro-workboard.md`.

## ═══ WHY RETRO EXISTS — the north star ═══

Read `shitsfucked` at the repo root (the post-mortem). Main's own ledger, verbatim: *"We are tired of
hunting down invisible bugs. **Everything must be proven.**"* The disease it names — **features that
looked done and silently weren't** — is the thing this rebuild exists to kill. The posture is **drive
it live, then pin it**. 2026-08-01 proved it: one owner dogfood day found ~20 real defects, every one
fixed at its ROOT the same day, five whole bug CLASSES made unmakeable. Judge every "done" against
that frame — a row that says "merged" is not a receipt; a sha, a symbol, a registered gate, a running
test is.

Global **KISS/YAGNI are SUSPENDED here** — build the maximal, most-provable version
([[kiss-yagni-suspended-build-maximal]]). Package cake: kit ← contracts ← db ← server ← client +
sealed ui; one-directional flow (rpg ↔ chat only via injected ops). Read
`docs/architecture/core/AGENTS.md` IN FULL before any work.

## ═══ STANDING LAWS (the posture — all owner-set, all still in force) ═══

- **Cap FIVE concurrent lanes** (owner raised it from three, 2026-08-03, to burn the almost-done
  initiatives to CLOSED; the original three-cap came from "six ate our usage too fast" — five is the
  tested ceiling, six is not). **ONE COMMIT per lane**, terse
  message drafted in seconds; receipts go in the final report, never the commit message.
- **Merges** `--no-ff --no-verify` on branch-side hook-green receipts — BUT any branch certified
  BEFORE sibling merges landed gets a consolidated `pnpm check` on the merged result (caught reds
  three separate nights). Merge → SEPARATE verify call → THEN teardown, never chained. `git -C
  <ABSOLUTE-main-path>` on every merge/verify command.
- **NEVER push to origin without a fresh per-push owner word.** Not overnight, not on a green battery,
  not "the word was banked yesterday".
- **Overnight full-auto**: proceed through the queue, escalation ladder (stickler → ast/code → docs →
  judgment) instead of blocking questions. Blocking only for destructive/irreversible, owner-sacred
  (persona pin), origin pushes, genuine scope pivots.
- **Every UI build gets its side-eye, and ALL side-eye findings get fixed** — never just the top ones
  ([[side-eye-fix-all-findings]]).
- **Gates land on a FIXED tree**: a new gate's live violations get FIXED in the same lane; allowlists
  are for permanent deliberate exemptions with a reason + stale arm, never debt parking.
- Board commits are `--no-verify` (owner word); code merges keep the hook. D-numbers are allocated at
  DISPATCH when two live lanes both mint.
- Lane floors MUST name their playwright CT files explicitly — `pnpm verify --push` runs NO CTs
  (tests:node + e2e only); the full `pnpm test` battery at quiesce is the CT proof.

## ═══ STATE (2026-08-03, after the tsx migration + the guard fix) ═══

- **main @ `fe8f677f8`**, tree clean, **17 commits past origin** (`origin/main = f8cb5e948`,
  SERVER-VERIFIED via `git ls-remote`, not the console summary). Gates **183**. D-ledger through
  **D126**; **D127 DRAFTED, UNMINTED** (compiler-owns-memoization + uncompiled-CT; text in the MEMOBAN
  block below). **NO LANES LIVE, no second session.**
- ✅ **NODE-26 W1 + W2 BOTH MERGED, consolidated `pnpm check` 14/14 on the merged tree, worktrees torn
  down.** W1 `7b283c874` (§1 — `esnext.disposable` across all four programs, `platform.d.ts` proven in
  **all 8** TS programs by `--listFilesOnly`, `engines` in the six packages). W2 `725f0ba85` (§2 —
  undici 8, the dispatcher tripwire). **Each lane's real value was a defect it found on the way:**
  - **W1: `.npmrc engine-strict=true` is INERT on pnpm 11** — four probe arms with a control; pnpm 10.6+
    moved settings into `pnpm-workspace.yaml` (`engineStrict: true`). The wave whose whole point is
    "the floor is declarative-only, make it bite" would have shipped a SECOND no-op. Doc truth-repaired.
  - **W1: `scripts/verify/selection.ts` routed root ambient `.d.ts` to the GRAPH program only** — so
    `types:packages` was SKIPPED entirely on an ambient edit, and the graph carries `@types/node`, which
    independently declares `Disposable`/`getOrInsert`/`isError`. Measured: the probe showed **1** error
    under the graph vs **6** per-package. A graph-only route masks 5 of 6. Both root ambient files now
    route everywhere (`ROOT_AMBIENT_DTS`) — **this changes `reset.d.ts`'s behavior too, deliberately.**
    Neither `tsconfig-routing-parity` (filters `.d.ts` out) nor `tests-type-membership` (enumerates
    `tests/**` only) can catch this class.
  - **W2: undici 8 MOVED the global slot** `Symbol.for("undici.globalDispatcher.1")` → `.2`, and node's
    bundled 8.7 still populates `.1` as a legacy alias **nothing reads**. Both egress int suites
    hardcoded `.1` for teardown, so the bump turned their restore into a **no-op leaking the installed
    firewall into every later test in the worker** — probe-proven (`getGlobalDispatcher() === firewall`
    after "restore"). Fixed at landing via the public `get/setGlobalDispatcher`.
  - **W2 RED proof, the strongest receipt of the night:** it broke the contract the way real skew would
    (flipped the npm copy's slot in `node_modules`), and the two suites failed **differently** —
    tripwire names the dispatcher contract, `egress.int` says `expected 'TypeError: fetch failed' to
    contain 'SSRF_BLOCKED'` while *actually dialing private addresses*. That contrast IS the tripwire's
    justification (isolating CONTRACT from POLICY), and it replaced the doc's overstated
    "nothing tests this". Also: `^8.10.0` was refused by `minimumReleaseAge: 1440` — pinned `^8.9.0`
    rather than weakening the control; the caret floats when it matures.
- ⚠️ **`biome.json` WAS UNPARSEABLE FOR ~9 HOURS — fixed `8a76894a5`.** Comments between array elements
  in `files.includes` (added by tsx-shedding stage 2, `896e3d221`) are a hard parse error: **biome.json
  is strict JSON here, not JSONC.** Biome does not fail loudly — it falls back to **built-in defaults**
  (tabs, 80 cols, every rule on, `node_modules` walked): **73,518 files / 16,835 errors**, healthy is
  **4,564**. **It had been hiding 14 real diagnostics**, every one in code touched during the blind window: a
  trailing comma making `tsconfig.json` unparseable, an import after a statement in `pdf.ts`,
  method-style signatures in `platform.d.ts`, a bare `process` global in the new dispatcher test.
  **Probe for next time:** `npx biome check <one-known-clean-file>` — clean config prints `Checked 1
  file`, broken config prints a `parse` diagnostic naming `biome.json`. Two seconds.
  **⚑ THE "BIOME IS BROKEN IN WORKTREES" THEORY IS DEAD — and it was mine to kill sooner.** Both lanes
  reported it, I believed them, and I wrote it into three fresh lane briefs. The owner challenged it
  ("we've been using biome fine in worktrees for like a week") and was right. **Nested-root is a
  downstream SYMPTOM of the parse failure**: broken config → defaults → the defaults have no `!.claude`
  → biome walks into `.claude/worktrees/*` → finds each worktree's own `biome.json` → nested-root error.
  **Measured with the fixed config, both directions:** from main, worktree paths are correctly IGNORED;
  with cwd INSIDE a live lane worktree, `Checked 1 file`, **exit 0**. Retracted to all three lanes.
  **The lesson worth more than the bug: two independent agents agreeing is NOT corroboration** when
  both are looking at the same broken artifact — their agreement is correlated, not independent. Test
  the two-second claim. (Use `env -C <dir> <cmd>` to test a cwd-sensitive claim; never `cd`.)
- **LANE ROSTER — EMPTY** (both merged and torn down). Historical dispatch record:
  **W2-UNDICI** (security-executor) — node-26 program §2: bump catalog undici 7.28 → ^8.10, mint
  `tests/server/infra/network/dispatcher-contract.int.test.ts` as the cross-copy tripwire. Owns the
  undici catalog entry, `pnpm-lock.yaml`, root `package.json` devDependencies, `egress.ts` if forced.
  **W1-TOOLCHAIN** (executor) — node-26 program §1: `esnext.disposable` lib delta across all four
  programs, a root `platform.d.ts` for the V8 14.6 surfaces TS has not shipped, `.npmrc`
  `engine-strict=true` + `engines` in the six workspace packages, the Spine §8 ADOPT/AVOID table.
  Explicitly told to stay OUT of root `package.json` (W2's).
- ✅ **TSX-SHEDDING: COMPLETE — all four stages, one sitting** (`2001aec5` · `896e3d22` · `e2bed75c` ·
  `e899498a`). `start` = `node …/entry/index.ts`; dev = `node --watch --watch-preserve-output`; all ~38
  tooling scripts on node; `tsx` dropped from `@orb/ui` (knip flagged it — the migration reporting its
  own completion). **9,092 imports across 3,171 files** now carry extensions.
  **ENFORCEMENT PROVEN:** `nodenext` makes a missing extension **TS2835, a compile error** —
  demonstrated by reverting one import. That closes the gap where green ≠ bootable.
  **RESOLUTION SPLIT (deviates from the spec, deliberately):** nodenext where NODE runs
  (server/kit/contracts/db, per-package); **bundler for ui/client AND for the tsconfig.json /
  tests-dom AGGREGATORS** — they pull browser code in TRANSITIVELY, and node-strict resolution made tsc
  pick different third-party declarations than the ones that ship (echarts resolved two ways).
  **LIVE PROOF:** server 200 · vite 200 · **engines RE-ADOPTED (identical pids)** · traces landing ·
  e2e-smoke 5/5. `pnpm check` 14/14; battery 9,931 vitest + 2,384 CT, 0 failed.
- ⚠️ **THREE PRE-EXISTING DEFECTS the migration surfaced** (each worth more than the swap):
  1. **`domain/chat/memory/build/**` + its test mirror were INVISIBLE to biome** — 13 files never linted
     or formatted, because `biome.json` copied `.gitignore`'s `build/` exclusion WITHOUT its negations.
     They held 45 extensionless imports the sweep could not see. **Any biome-driven sweep has been
     skipping that subsystem** — including the Node-26 program's §4.2 sort sites.
  2. **A stale `tsbuildinfo.json` described a tree purged 2026-07-22** — `check:structure` reported 6
     PHANTOM violations naming `domain/hub` (which does not exist) under node while clean under tsx.
     Not a runtime bug: changing runtime changed which cache was read. **A surprising gate result
     deserves a cache-clear before a theory** — I nearly reverted a working stage on a false premise.
  3. `tokens.build.ts` **emitted** an extensionless import — the GENERATOR was fixed, not just its
     artifact, and the round-trip verified.
- ✅ **TWO PUSHES LANDED** (both on an explicit word, both server-verified): the 176-commit era, then 26
  commits. **Never push without a FRESH word.**
- **PreToolUse GUARD LIVE** (`.claude/hooks/tool-guard.mjs`) — rewrites piped harness commands, denies a
  few destructive shapes, fails open, logs to `reports/tool-guard/decisions.jsonl`, kill switch
  `ORB_TOOL_GUARD=off`. It has already corrected the orchestrator mid-session (bare `npx vitest`,
  `git add -A`, `--no-verify`).
- **NODE 21→26 PROGRAM READ IN FULL** (`docs/design/node-26-adoption-program.md`). Verified against the
  tree: `engines.ts:99` sleep ✓ · `digests.ts:255,260` sort sites ✓ · **all six workspace packages carry
  NO `engines` field** ✓ (the `>=26` floor is declarative-only). **STALE CLAIM — §7.4 says ONE `.mjs`
  outside the nets; there are 17** under `scripts/probes/` (two created today by my own lanes).
  **⚑ HIGHEST-RISK ITEM IN THAT DOC (§2), jump it to the front:** the SSRF egress firewall works by
  installing a dispatcher into undici and trusting node's global `fetch` to route through it — a
  CROSS-COPY shared-symbol contract, with npm undici pinned at **7.28** while node 26.5 bundles **8.7**,
  and the pin's own comment claims it tracks the bundled major. **Nothing tests that contract.** If a
  bump breaks it the firewall silently stops governing `fetch` and nothing goes red.

- **⚠️ SUBAGENTS DIE ON A PERMISSION DEFER — root-caused 2026-08-03, FIXED.** Seven lanes across five
  dispatches "completed" after a one-line preamble at a suspiciously consistent **~42k tokens**. It read
  as transient API failure. It was not: `settings deferred Bash · resume with -p --resume` — the command
  was not in `.claude/settings.json` `permissions.allow`, the permission flow asked, and **a subagent has
  nobody to ask**, so it stops silently. Trigger was the new PreToolUse guard returning `defer` for the
  ~87% it does not object to; `defer` = "fall through to the normal permission flow", and that flow has
  no one to prompt. **The guard denied nothing (189 decisions, 0 denies) and was still the cause.**
  **FIX (owner chose option 2):** allowlist expanded **34 → 72** — read-only inspection (`wc`/`ls`/`cat`/
  `find`/`sed -n`/`python3 -c`), structural search (`ast-grep`/`pnpm ast`), git read-only + the lane's own
  `add`/`commit`/`merge`/`-C`, and the toolchain (`node`/`npx`/`pnpm exec`/`pnpm verify`/`e2e:smoke`).
  **DELIBERATELY EXCLUDED: `git push`, `reset`, `stash`, `restore`, `checkout`.**
  **The tell for next time:** several lanes stopping at a CONSISTENT token count right after their first
  Bash call. Consistency is the signal — a real transient is ragged. Check
  `reports/tool-guard/decisions.jsonl`: all-`defer`/zero-deny exonerates the guard's RULES while still
  being the cause, because defer ≠ allow.
  **✅ SECOND ARM LANDED (`fe8f677f8`) — every subagent is BRIEFED ONCE, on its first Bash call.** A
  `BRIEFING` block (what the guard rewrites / denies / asks / warns on) is attached as
  `additionalContext`, marker-file keyed by `agent_id` under `reports/tool-guard/briefed/`, so it costs
  one paragraph per lane and never repeats. It carries the owner's instruction verbatim: **if a call
  ever returns `settings deferred Bash`, that is a PERMISSION gap — you cannot answer a prompt, so
  SendMessage the orchestrator the EXACT command and stop cleanly.** A lane that dies without reporting
  reads as a transient and costs a re-dispatch. 11/11 guard tests green. (First cut threw: `ctx` wasn't
  in `toHookOutput`'s scope, fail-open swallowed it and the warn lost its context — `ctx` is now threaded
  through the signature.)
  **✅ FIXED FOR REAL (`50a913bb6`) — THE PASS-THROUGH NOW `allow`s.** Owner's framing is the design:
  *"our issue was never permissions of what an agent can do, we just want them running the right way."*
  A guard that shapes HOW a command runs should never have been answering WHETHER it may run.
  **The allowlist could never have fixed this** — the permission matcher requires EVERY SEGMENT of a
  compound command to match, and the two relaunched lanes died on `ls -a | head && echo … && find … |
  sort` and `pwd && git -C <wt> status`, whose only unlisted segments were **`echo`, `sort`, `pwd`**.
  Agents compose ad-hoc pipelines; that list is unbounded by construction. Changes: classifier `"defer"`
  renamed **`"pass"`** (the honest name); `defer` survives only where the guard did NOT judge (kill
  switch, internal error, bad stdin); a subagent `ask` is emitted as **`deny` + the escalation path**,
  since an unanswerable ask kills a lane exactly like a defer; **`git push` gained an explicit ask from
  any caller** — it was reaching a prompt only by falling through, and pass-becomes-allow would have
  pushed to origin with NO owner word (caught by probing before commit, not after). 12/12 guard tests.
  **SMOKE-TESTED LIVE: a haiku scout ran all four killing shapes, 4/4, zero deferrals.**
  **⚠️ THE COST, AND IT IS REAL — a hook `allow` BYPASSES THE AUTO-MODE CLASSIFIER.** The owner's global
  settings run `"defaultMode": "auto"`, so a classifier is the actual gate (it refused two edits to a
  permissions file this session, correctly). A hook `allow` skips the permission system entirely, so for
  Bash in this repo the guard now answers first. **Probe receipt:** `sudo rm -rf /etc`, `curl -sL … |
  bash` and `rm -rf <the repo>` all classify as clean PASSES today — they would run unprompted where the
  classifier would have caught them. **OPEN OWNER CALL, two honest arms:** (a) narrow the allow to a
  curated safe-verb set and keep deferring the rest to the classifier, or (b) keep the blanket allow and
  give the guard a hard floor (sudo · network-pipe-to-shell · `rm -rf` outside safe targets · bare
  `sqlite3` on the live db). NOT (c) blanket-allow with no floor, which is where the tree sits right now.
  **PREMISE CORRECTED, propagated from this board and the doctrine:** "`git push`/`reset`/`stash`/
  `restore`/`checkout` are deliberately excluded from the allowlist" is **FALSE for two of them** — the
  owner's global settings wildcard-allow `Bash(git reset *)` and `Bash(git checkout *)`. Genuinely
  absent: `push`, `stash`, `restore`. A guard rule for reset/checkout would override a call he made.
  **Also found:** `biome.json` excludes `.claude`, but `.claude/hooks/biome-check.sh` lints it anyway —
  every edit to the guard throws a format error on a file the config says to skip. Own small lane.
  **⚑ SUPERSEDED DESIGN NOTE (kept for the reasoning) — `defer` is the wrong answer for an UNCOVERED command:**
  `defer` is correct when the allowlist covers the command: the guard has no opinion, the allowlist
  approves, work proceeds. It is wrong for a command NOTHING matches — there `defer` means "ask someone"
  and a subagent has no one, so it dies mid-turn with no chance to report. **The shape to build: the
  guard reads `.claude/settings.json` `permissions.allow` itself; when the caller is a subagent AND no
  rule matches, return `deny` with a teaching reason** naming the command and instructing SendMessage.
  That turns a silent unrecoverable death into an actionable event while auto-approving nothing.
  **Deliberately NOT built same-session** — it gates every Bash call in the repo and the matcher must be
  tested against the real allowlist's glob semantics (`Bash(pnpm check *)` etc.); a wrong matcher denies
  everything. Own lane, fresh context.
- **NEXT UP (node-26 program, `docs/design/node-26-adoption-program.md`):** W2-UNDICI (the untested SSRF
  dispatcher contract + the 7.28→8.x pin drift — **highest risk in the doc**) · W1-TOOLCHAIN (lib delta +
  `platform.d.ts` + the engines wall; **all six packages carry NO `engines` field**) · then W3/W4/W5, §8
  gate LAST. Also queued: convert the **17** `.mjs` probes to `.ts` (§7.4 undercounts this as one file) —
  `.mjs` escapes every type program and sweep, and its only reason (bare-node runnability) died with the
  tsx migration.

## ═══ INITIATIVES ═══

### I-1 · STRUCTURED OUTPUT — ✅ the four projector defects are CLOSED; one owner item remains

**Landed under it:** RESYNC-OR (`d432ed51` — the structured role sends ONE FORCED TOOL CALL, the D112
vehicle; both rpg write paths now speak one dialect; probe matrix receipted) · STRICTFMT + CUSTOMBYO
(`35014699` — the kit stops INVENTING `strict`; it rides only when the caller sets it; vLLM pins it at
its own call site, the xgrammar lever) · the vendor-docs research (`docs/reviews/misc/2026-08-03-
structured-output-docs.md`).

✅ **CLOSED by SCHEMA (`c92b7aeb`):** all four unsupported keyword classes now stripped per-wire-subset
by one `scrubWireSchema` engine (four modes); `parallel_tool_calls:false` + a loud extra-call warn;
**refusals READ on both roles** (a refusal used to log `ok:true`). Absorbing three drifted hand-rolled
walkers found a live bug on the way: vLLM's wasn't position-aware, so a field NAMED `title`/`default`
was being deleted from the guided wire.
**Still true, deliberately:** `WireTool` (`infra/providers/contract/chat.ts`) has no `strict` field, so
the forced-tool vehicle carries no grammar-level enforcement — the D112 vehicle is a SHAPE contract,
not a compiled grammar. Say it that way; do not claim otherwise.
**Rides it:** `engine/chat-completion.ts` holds a SECOND `response_format` builder that never emitted
strict (SM7 flagged, deliberately not touched).
✅ **OWNER FORK CLOSED + SHIPPED (D126, lane STRUCTOUT `ffd3b4b4`).** Owner: *"i kinda wanted it to be
somethign we could swap to if we wanted or like a config thing etc. I dont want it to be seen as dead."*
The nullable-union arm is now **Settings › Admin › Structured output → "JSON-Schema shape"**, an
AppSettings-tier knob (DB override wins) reaching `scrubWireSchema` on the real request. **Default
unchanged.** Full receipts in the RECONCILIATION block at the foot of this file.
**⚑ THE ONE OWNER ITEM LEFT ON I-1:** whether to make `strict-compatible` the DEFAULT. It is now a
switch he can flip and live with for a while first — which is the point. Blanket-vs-capability already
ruled: KEEP BLANKET.

### I-2 · DATABANK — S1 + S2 shipped; S3 unstarted (lane DBFIX live on ingest concurrency)

**Landed:** DATABANK IS A LIVE RAIL SECTION (`b377ed8c` + merge `17f83015`) — the library, Add
upload/paste/link, phase chips, bounded ingest poll, owner-wide reindex in the band kebab, empty
states, auto-appears on Home via the registry; 199 CT + 110 unit; consolidated `pnpm check` 14/14 on
the merged result. D-1 `listGlobal` minted. Its rendered check caught a real defect and minted
`ListRow.subtitleLead`. **Owner CLOSED the section-vs-collection fork: Arm A (own rail section)
stands** — demotion stays a one-file edit if he ever wants it.

**OPEN — S2 (the live lane):** the per-chat rack (D-2 sources threaded — `scope.ts` already runs the
three junction queries and DISCARDS the answer) · the rack after Injections per D-4 · **the D85 host
visibility toggle — the original workboard item, still unbuilt** · the `listActiveForChat` freshness
row.
**Receipt of not-done:** `packages/server/src/domain/databank/verbs/` holds attach · create-from-text ·
gather-retrieval · get · list · list-active-for-chat · list-attachments · reindex · remove · rename ·
scrape · upload — and NO visibility/hidden setter, while `packages/contracts/src/databank/index.ts:96`
already specs the D85 override.
**OPEN — S3:** unbuilt. D-7's real home tile still owed. Spec: `docs/design/databank-surface-spec.md`.

### I-3 · CONFIG WORKSPACE — the rail is live; MOBILE is the ruled tail

**Landed:** R1 the Configuration workspace + the `CollectionContribution` seam, tags + regex OFF
settings (`3769d4f9`, gate #175 collection-registry-completeness) · R2 world-info into the workspace,
rail back to 8 (`e7a86df1`) · CR0 gate #174 `section-factory-contribution-bundle` (makeChatsSection
refactored 4→1 in the gate's own landing commit) · NIGHTFIX, the combined side-eye's fix-all (`48f47f09`):
the CONTENT region's padding (the "looks unfinished" verdict killed at the region), the double
empty-state lie ×3, `actionsReserved` boolean→NUMBER (a row reserves what its LIST declares), narrator
rows say "Narrator", dialogue-hue de-collision, Prune confirm, `placement:[]` made legible ×3,
Find-pattern affordance, FACEFILT `aria-pressed`, theme cluster values + one vocabulary,
Settings›Personas contains personas, the 4-affordance ceiling.

**OPEN — the live SWEEP lane:** the side-eye's NOT-REACHED tail (tag context arm · the regex picker's
order split with drag + keyboard + >30 arm · the mobile & rail mock diffs) PLUS a fresh-eyes
hunt-and-FIX over config / databank / regex at 320px + mobile. Owner: "any bugs found can be fixed."
**⚑ OWNER-TIMED:** **presets stay OUT of the config rail until he feels it** (one array member,
forever, whenever he wants it). "Still not set on presets being their own thing" stands.

### I-4 · REGEX — the reshape is complete; the extras and one premise question are not

**Landed:** R1-R6 (`12cf0a8a` + `ff2aa8b4`) — first-class script library (owner-stamped + 4 FK
junctions, 19 verbs, tRPC all-PROBED), 3 embed carriers DEAD on one baseline regen, `regex` at
`PORTABLE_IMPORT_ORDER[5]`, lift/re-embed at the card seam, **DISPLAY tier ALIVE** (viewer-only default
+ the HOST per-room broadcast toggle, viewer-last precedence), ORDER pins, 2211 node + 314 CT · REGPAR
the paneside tester + ST disabled-POLARITY fix (`1a9687bf`) · REGORDER all four scope-order arms
authorable (`e2d4087f`) · REGROSTER the attached-by rosters + `resolveVisibleRooms` (`6df02b16`) +
its rename-freshness gap fixed direct-on-main (`930955e4`).
**Receipt the portability cross-link held:** `PORTABLE_KINDS` in
`packages/contracts/src/portability/index.ts` carries `"regex"` — REGEX did NOT become the next PORT-F1.

**OPEN — REGX2 (owner-ruled 08-03, dispatch when a slot frees):** bulk edit · the pipeline debugger ·
the per-script JSON door. **NOT regex presets** — owner: "we made regex part of presets kinda" (the
preset carrier already IS the named-set mechanism).
✅ **TAGSORT AUDITED + RULED (2026-08-03) — KEEP BUT NARROW. The owner's premise targeted a surface
that never read the column.** He challenged manual tag order with *"this is an overall global tag manager
across our entire lib"* — and the evidence says the surface he meant, the character-library folder-grouping
sidebar (`features/character/lib/character-list-view.ts:52-74` `groupByTag`), **does not read `sortOrder`
at all**: `RowTag` does not even carry the field, and groups sort by `name.localeCompare`. Same for pending
tag suggestions (`character/persistence/queries.ts:270`, name only). So the objection is resolved by
evidence, not by deleting anything.
**Every reader (AST-confirmed, both languages scanned non-zero, grep-corroborated, zero disagreement):**
`tag/persistence/queries.ts:39` `listOwnedTags` (`ORDER BY sortOrder IS NULL, sortOrder, name`) →
`tag.listTagsWithUsage` · `character/persistence/queries.ts:387` `canonicalTagsFor` → every character
summary's `tags` array · `tag/verbs/export.ts:17` (round-trip only, not a distinct decision). **No `.tsx`
reads it** except the write hook.
**Surfaces that can actually SEE it:** ONE primary — the tag-management collection rows
(`features/tag/components/tag-collection-rows.tsx:75-81`, drag → `useSetTagOrder`), and ONE passive echo —
tag-CHIP order on character cards (`character-card.tsx:75` + dossier + quick-picks), which render the
server's array order with no client re-sort.
**RULED:** keep `sortOrder`, its write verb and the sortable rows as-is — a real, bounded, actively-used
affordance. **Do NOT extend it anywhere else** (not into `groupByTag`, not into suggestions); those already
made the better call. Removal would cost only alphabetical-instead-of-curated on those two surfaces —
survivable, but a real regression on a purpose-built UI, for no gain.
**⚑ THE ONE THING THAT NEEDS THE OWNER'S EYES — the 30-of-400 ratio.** The drag arm is capped at ≤30 items
(`COLLECTION_LARGE_GROUP`, `collection-contracts.ts:39`); above that the same order renders in a read-only
`VirtualList` with NO drag affordance. At his stated ~400-tag scale that means **manual ordering is
unreachable for ~92% of the library, while still silently deciding chip order on every character card.**
That is not a bug and the cliff was a deliberate owner-flagged fork — but it is worth his explicit ruling
now that the numbers are on the table.
**Audit limits (stated):** packages outside server/client not exhaustively enumerated (none found);
non-TS consumers (raw SQL/seed outside `db/src/schema`) not searched.
✅ **TAGDIG — the full tag-experience audit vs ST + neo (2026-08-03).** Report:
`docs/reviews/misc/2026-08-03-tag-experience-audit.md` (gap register by theme, every `-l ts`/`-l tsx`
sweep run in PAIRS with scanned-file counts; neo read via `git archive legacy-main` into scratchpad,
never checked out; a false-negative self-corrected mid-audit — a bare-identifier pattern returned 0/0
and looked like absence until `$X.folderType` found the real site).
**Sort-by-most-used CONFIRMED CHEAP (S, zero server cost):** `listOwnedTagsWithUsage`
(`domain/tag/persistence/queries.ts:288`) already returns `usage.total` in every payload the client
renders — it is a client comparator + a mode `Select`, mirroring ST's `tag_sort_mode`.
**RANKED WANTS:** (1) sort mode Alphabetical/Most-Used, default Most-Used — S · (2) **autocomplete on
the tag-attach input** (`components/tag-picker-dialog.tsx` is a bare `Input` with NO suggestion list on
BOTH neo and main) — S–M, the highest value-per-effort row: at ~400 tags it is what prevents
duplicate-tag rot, and the data is already cached client-side · (3) tag EXCLUSION / three-state filter
(ST has `toggleTagThreeState`/`FILTER_STATES.EXCLUDED`; **neither lineage ever built it**) — M, needs a
new axis threaded through `LibraryFilters`/`filterByChips`. Past #3 is L and changes the browsing MODEL
— separate owner decision, not a queued build.
**WE ARE AHEAD OF ST in one place:** the pending-suggestion Accept/Reject review queue
(`character-tag-suggestions.tsx` + `tag/verbs/list-pending-suggestions.ts`) plus the LLM auto-distill
producer (`discovery/verbs/distill.ts`) — ST has no equivalent.
**DELIBERATELY NOT COPIED (with reasons):** ST's DUAL tag lists (local organizing tags vs a separately
authored "tags to embed" export field — a known confusion source in ST itself; our WYSIWYG
accepted-tags-are-what-exports model is better) · a user-facing AND/OR toggle (ST hardcodes
`const TAG_LOGIC_AND = true; // switch to false…` — config-via-source-edit; AND is the right default and
per-tag exclusion covers the real "not this one" need).
**⚑ OWNER TASTE CALLS:** standalone tag-only backup/restore button (REC skip) · import-time
Ask/All/Existing/None vs our always-queue model (REC keep ours, it is strictly more capable — record as a
deliberate divergence) · **whether Manual/`sortOrder` retires once Alphabetical/Most-Used ship**, given the
≤30 cap already makes it near-unreachable at ~400 tags · folder OPEN (collapsible, cheap) vs CLOSED
drilldown (navigation-model change) — REC build OPEN, defer CLOSED.
**Not covered (stated):** anti-troll import cap, non-English locale completeness, mobile/touch behaviour.
**OPEN smalls:** "Untitled chat" in the regex rosters (REGROSTER's naming question) · X-16 edited-ago
needs a `RegexScriptRow` timestamp (contracts + db — verified absent) · REGPAR's F6 residual (REASONING
prints slot 4 but executes post-postProcess — unobservable; strict-fidelity is an owner nit).
**⚑ OWNER-RULED CLOSED (record):** prompt-EPHEMERALITY — min/max DEPTH is a PROMPT-leg concern; DISPLAY
needs none of it because we own the viewport. The D121-E depth drop stays dead for display; the depth
knobs come back only WITH the prompt-build history leg, if that is ever built. REC (a)
ACCEPT-AND-RENAME stands.

### I-5 · BRAND BURN-DOWN — the gate is live, the debt is named

**Landed:** gate #176 `brand-in-name-position` (`35014699`) — positions DERIVED from `kit/ids`, zero
hardcoded paths, blindness tripwire, two-sided markers, position-NAMED escape
(`@foreign-id-ok(<position>): reason` — because one line can carry ours + theirs), the six-case
real-tree probe. 28 permanent foreign-wire markers planted at landing (agent-sdk `sessionId` name
collision · local-light HF `modelId` · plugin wire DTOs).
**OPEN:** the arm-A baseline ratchet is ACTIVE and shrink-only. **Receipt:
`scripts/check/gates/brand-in-name-position.baseline.json` = 169 files / 374 sites.** Terminal state is
`{}` + delete both the baseline and its generator. Burn it down in named lanes when the owner wants
them; `sessionId`→`sdkSessionId` is a dissolving candidate.

### I-6 · PORTABILITY — R0-R5 landed; R6 is the honest scope-out

**Landed:** PORT (`87b3c826`) — F1 CLOSED (databank travels, real bundle round-trip), the
`lifecycle-portability` gate #173 (it caught `globalDocuments` unclassified WHILE BEING WRITTEN), the
R3 serde spine (8 families, envelope/decode/version-gate/emit exist ONCE), world-info doors +
`?format=png|json`, persona chrome re-homed, the O-3 merge-in-place flip (theme + tag restore-wins,
USER-VISIBLE).
**OPEN — R6:** the orb-native chat-bundle arm alongside jsonl. It was scoped out HONESTLY and is
MACHINE-TRACKED: the ACCEPTED-LOSSY / DEFERRED rows each say "ends when R6 lands". O-6
characterless-import rides it, and so does the standing owner question below.
**⚑ OWNER ITEMS on this initiative:** the absent-character transcript import policy (refuse vs
mint-placeholder — PORT recommends the "import as characterless chat" arm) · the JSON-card export
format (PORT's recommended home: `?format=png|json` on the existing character door) · F9's design fork
for the chat-anchored planes that are unportable by construction (rpg campaigns · injections · room
overrides · re-links; plus automation_rules / global_variables / plugins, which have no arm at all).

### I-7 · OBSERVABILITY — ✅ CLOSED (2026-08-03, lane OBSCLOSE)

**Landed:** OBS (`93e40fb1`) `addSpanEvent` wired across cache / retry / wake with trace-ring landing
proofs; the ratchet baseline is EMPTY. SM4 (`f46122ad`) the rpg round TRACED (`withRequestSpan` needs
`root: true` — a parented span never seals the ring), `provider.*` spans at `runRole` (all 9 role
dispatchers, so `providerDurationMs` finally lands), structured-retry `onRetry` injected.
**CLOSED by OBSCLOSE (`521b8343`):** all three named holes — `fireExpressionClassify`,
`fireRpgTurnAborted`, the post-turn memory pass — plus a FOURTH found in the same sweep
(`fireManagedCompaction`, identical fire-and-forget shape) now open their own DETACHED root
(`withRequestSpan(…, root:true)`, SM4's template). The rest of the file was swept: no other
outlives-the-request siblings (`markRpgDiceEligible` is sync; the bus fans don't outlive their
request). **The correctness find that mattered more than the spans:** memory + compaction `catch`
blocks SWALLOWED their error after warn+emit, so the new spans would have sealed `"ok"` on every
failure — an observability hole wearing observability's clothes. Both now rethrow (the outer
`.catch(() => undefined)` still absorbs). 7 landing proofs through the real trace ring
(`recentTraces`, driven from inside an outer request root, asserting rootName + requestId prefix +
status + `requestId !== OUTER`); 167 tests green across the three engine suites. Consolidated
`pnpm check` on the merged result: 14/14.

### I-8 · PROSE / NUDGE / PERSONA — built machinery waiting on the owner's voice

**Landed:** NARCOLOR (`136139fc`) — narrator coloring works for the first time ever (the render half
existed; the PRODUCE instruction never did). `narratorNudge` + `speakerTags` are PROSE-1 slots
(owner-editable data), `roundNudge` v1→v2, one tint producer, the tolerant line-start `Name:` parse
gated to narrator assistant rows. PERSONA R0-R4 (`c736ae8a` + D122) — the multi-human keyhole is
CLOSED. HCOPY (`d4aa40f9`) — the handoff copy arm end-to-end.
**⚑ OWNER VETO OWED — THE THREE NUDGE DEFAULT TEXTS, VERBATIM** in NARCOLOR's report (speakerTags v1 ·
narratorNudge v1 · roundNudge v2). `{{user}}` is deliberately absent (`macros:"none"` slots); a
`{{names}}`-style pre-sub token is small plumbing on his word.
**⚑ PARKED WITH ITS RULED DESIGN FLAVOR (owner-sacred, do not build):** mid-session persona-change
linkage for rpg state. Owner's reasoning verbatim: *"if you form relations with NPCs with persona A and
then swap to persona B, all those keyed things will now point to persona B even though they haven't
done anything — the same debacle as persona pin and why we made it."* The ruled answer whenever it
unparks: **PERSONA-PIN SEMANTICS applied to rpg-lite state tracking** — relations / keyed state PIN to
the persona they were formed under; a swap opens new/parallel context, never a silent re-point.
Recast-is-story is NOT the answer; the design derives from the pin concept.
**Recorded, not scheduled:** the tint plane paints quoted speech + italics only — plain prose spans get
scope-no-color (pre-existing; the likely next "still not colored" report). `GhostMessageRow` has NO
identity chrome for ANY row kind.

### I-9 · CEREMONY + DOC GRADUATION — 2 of 3 done; HCOPY's D-entry is the survivor

- ✅ **D125 MINTED** — the fifth regex leg (`PROMPT_HISTORY`, amends D121-E), from HISTLEG's report.
  Both range headers + the master enumeration updated (which was itself behind: D123/D124 had never
  been appended to `Core-Laws-and-Precedents.md:62` — backfilled in the same edit). **Next free: D126**
  (allocated to STRUCTOUT). HCOPY's handoff-copy D-entry (amends D64) is STILL unminted and rolls to
  the next ceremony batch alongside any REGPAR / R2WI deltas — that is the initiative's one survivor.
- ✅ **Graduation move DONE (08-03):** the 36/36-ACCOUNTED preset-execution crunch list graduated to
  `docs/history/reviews/misc/`; its three inbound refs repointed. (The board's "that dir is EMPTY"
  claim was stale — it already held six graduated reviews.)

### I-10 · LAUNCH-DAY — three things that only matter on the day

- **REGIME-2 LANDMINE:** `structure:db-baseline` is regime-1-SHAPED (it generates from `{}` vs `0000`
  alone). It MUST be re-pointed at the applied chain on launch day or it reds every legitimate
  incremental. Documented in `Tier-1-DB.md`, deliberately not fixed.
- **The TWO-SWITCH flip** in Tier-1-DB's migration-lifecycle section (pre-launch squash regime →
  incremental regime).
- **h3/QUIC checklist (five minutes, deployment-level):** verify Caddy h3 enabled (default since 2.6) +
  **UDP 443 open** (the classic silent miss — browsers fall back to h2 via Alt-Svc and never tell you).
  The 15s SSE ping already keeps QUIC NAT bindings alive; 0-RTT stays off non-idempotent; add no
  TCP-era tricks. Dev stays h1.1 deliberately (a stricter transport test).

## ═══ SMALLS / TAIL (each independently landable) ═══

- **Square-glyph Button size variant + the 14-row sweep** — `DEBT_BASELINE` in
  `scripts/check/gates/ui-size-via-variant.ts` holds 14 rows across 9 `features/rpg` files, all one
  shape (`<Button intent="ghost" size="sm" className="!size-N !p-0">` + one `!w-block` TrackBar). The
  honest fix is a square-glyph size arm swept with computed-geometry proof; it returns the baseline to
  terminal `{}`.
- **Per-actor tracker grant/revoke EDITOR** — `sheet.trackerGrants` / `trackerRevokes` exist and gate
  NPC tracker applicability, but NO client editor exists. The owner's "keep explicit-list-only"
  NPC-grants ruling is a DEAD LETTER until hosts can edit the list. **Re-flagged by the archive tail
  audit (T-11), which trusted the doc's citation rather than re-grepping — a one-minute grep of
  `trackerGrants|trackerRevokes` in `packages/client/src` firms it before dispatch.**
- **`readout-parts.tsx` pending-flash** (`packages/client/src/features/preset/components/readout/`) —
  the same F-02 lying-pending-arm class SM4 fixed elsewhere; flagged, not fixed.
- **CapabilityGate's no-error arm is UNREACHABLE as a settled state** (capability required | error —
  undefined+null = PENDING), so every editor open FLASHES "connect a chat model" at users who have one.
  Owner ruling was "build it later": add a pending arm, then delete-or-reach the note.
- **`respell` derive-or-cite row:** search `DigestsParams` / `SegmentsParams` ≡ contracts
  `MemoryQueryOptions` (both still live in `domain/search/contract/params`). Its twin,
  `MemoryBackfillCounts`, is GONE — that half is closed.
- **`import-user-settings` bypasses the routing write-guard** (whole-blob verb) — imports heal+warn at
  read instead of refusing at write; lift the guard into the import path on want.
- ✅ **`connection.getCatalog` / `getAgentSdkCatalog` — ANSWERED, not dead** (archive tail audit): both are
  called at BOOT to warm caches (`entry/lifecycle.ts:181-191`), and `use-admin-mutations.ts:80` already
  carries the explanation in a comment. Deliberate boot-only readers. No action.
- **`field-reachability` suite ignores a `.ok`** (SM5's flag — non-vacuous, honest-fix-same-shape).
- **L8-inbound:** foreign ST `mes:""` rows at import — declined-by-scope in ANCHOR, a one-liner if
  wanted.
- **The seeder drop-patch STAYS** until the next fixture regen (the committed flagship fixture carries
  durable pre-D124 `mes:""` rows). ANCHOR's "matched nothing" premise was corrected.
- **CPD's 3 opportunistic dup rows** (invites verb+persistence pair · embed-store per-store reads ·
  rebuild-from-canon) — consolidate when next IN the file, no dedicated lane (DRY-not-gospel).
- **TYPO class-A: 27 as-const tuples** stay untagged manual-lens candidates.
- **`staging.ensure` residual** — first-write-wins seeded from HEAD; dormant unless rpg tools ever mount
  as REGISTRY tools again. **Re-verified 08-03:** `chat-ops/gather.ts:194` is still `tools: []`, so the
  dormancy condition holds — a correctly-cited doorway, not forgotten debt.
- **R5b(a) verify:** `refEnumerationLines` (the non-enforcing-backend prompt fallback) should enumerate
  active conditions post-R5a — confirm the R6 build carried it; ~2 lines if not.
- **WAKE-STATUS:** the 3s engine wake is silent (spec accepted the wait); revisit if it feels laggy.
- **`lockdown` §16 G-table deliberately not grown** (CR0's flag — it defers to the live count).
- ✅ **F4-CACHE-VOLATILITY — BUILT, close it** (archive tail audit): `buildFoldedTurnBuilder` calls
  `cacheStableExtractionRefs(refs, config.trackers)` before `buildToolRoundWireTools`
  (`entry/compose/rpg.ts:991-1008`), with a header naming it *"F4 — CACHE-STABLE REFS ON THIS VEHICLE
  ONLY … option (b)"*. Option (b) was picked and shipped. No action.
- **`E2E_LIVE=1 pnpm e2e`** is owed on a push window (never re-confirmed since the era's start).

## ═══ ARCHIVE-RESCUED FOLLOW-UPS (owner ruling 2026-08-03: a named follow-up goes ON THE BOARD) ═══

> **Why this section exists.** Lanes ended seal blocks with follow-ups they named but did not build; those
> blocks then moved to `docs/history/` with the archeology. **A follow-up that lives only in the archive is
> forgotten.** Owner: *"if it needs follow up it goes on the board, otherwise it gets forgotten."*
> My first pass used a GREP for one exact phrase and the owner correctly called it fragile — lane ARCHIVE
> then READ all 25 docs archived since 2026-07-23 line by line and verified ~45 candidates against the tree.
> Full report + per-document tables: **`docs/reviews/misc/2026-08-03-archive-rescue-audit.md`**.
> **22 of 25 documents yielded ZERO still-open rows** — recorded there so nobody re-reads them.

**⚠ THREE OF MY FIVE GREP-RESCUED ROWS WERE WRONG. Corrected:**
- ~~S6 SEAL not done~~ — **DONE.** Both `SETTINGS_SECTION_ANCHORS` hits are comments DOCUMENTING the
  retirement (`shell-store.ts:79`: *"the old … subset tuple retired with stage 0"*). Zero declarations,
  zero consumers. My existence-check counted prose as code — the exact failure the audit was ordered to
  avoid.
- ~~Icon fill-axis has zero consumers~~ — **STALE.** `FillableIcon` has TWO live consumers:
  `preset-library-row.tsx` (the O-1 active dot) and `components/row-toggle-action.tsx`. Demoted from debt
  to taste; the named adoption targets (F-06 bolt · tracker orbs · meter glyphs · `weight=` emphasis) and
  the unbuilt `iconNode` door for `weave-glyph.tsx` stand as OPPORTUNITIES, not rot.
- ~~MAC macro-union PREMISE-DIED~~ — right outcome, **wrong label: DONE SINCE**, built by lane MACU
  (`95f4c00b`); `withUserMacros` has 7 consuming modules.
- **HELD:** the `PROMPT_MACROS` phantom, and the barrel sweep (measured **56** `export *`, not 60).

### BOARD THESE — still-open, ranked by value-per-effort (paste-ready from the audit)

- [ ] **PRESET-SLIDER-VERIFY** (S) — the preset program CLOSED without the re-verification its own crunch
      list demanded: *"Re-verify the slider deck on a vLLM/OR connection before closing the program"*
      (sonnet-5 exposes no sampling knobs, so the deck was never seen rendered).
- [x] ~~**CP-DROPPED-WARN**~~ — **PREMISE WAS WRONG; the row grepped a symbol that never existed.** The code
      is `custom_parameters_ignored`, not `custom_parameters_dropped`: declared at
      `infra/providers/contract/resolve.ts:27`, emitted by `withCustomParametersDrop`
      (`openrouter/runners/chat/shared.ts:343-357`), folded by BOTH OR chat runners
      (`chat-completions.ts:288`, `responses.ts:476`), asserted by two tests. **It could not have been
      missing at any point since the `warning-code-coverage` gate landed** — that gate REDs any
      `WARNING_CODES` member with no emit site and an empty `deferred` map, so a zero-hit member is
      structurally impossible on a green tree. Nobody need hand-verify this row again. It cost a lane its
      opening. **Superseded by INFRA-WARN-DEAF, which is what it was actually pointing at.**
- [ ] **INFRA-WARN-DEAF** (M — LANE LIVE) — **`ChatResult.events` has ZERO production readers, so all TEN
      infra `WARNING_CODES` reach the logs and never a human.** `createRunChatTurnBridge`
      (`entry/compose/chat.ts`) awaits the result and reads only reply/reasoning/usage/…, never `.events`;
      `TurnStreamChunk` (`domain/chat/contract/results.ts:197`) is `text | reasoning | final` with no
      warning arm; `ChatRequest.onEvent?` has zero wiring outside the backends. Receipt: `ast-grep '$X.events'`,
      scannedFileCount **1994**, every hit a runner BUILDING the array or a test — no reader.
      **D41's no-silent-degrade is satisfied in the type system and violated in the product.**
      The surface itself WORKS and the IMAGE role proves it (`entry/compose/imagery.ts:43` guards the infra
      code down, `chat/verbs/generate-image.ts:26` re-maps to a `ChatWarningCode`, rides the bus to
      `apply-chat-bus-event.ts:47` → toast) — only the CHAT role's infra→domain hop is missing.
      **`warning-code-coverage` is blind to this BY CONSTRUCTION: it ratchets the EMIT, never the READ** —
      that limit belongs in the gate's header, and a reader-side arm is its own lane.
      **Ruled:** build the pipe now with ONE passenger (the customParameters drop); **the residual NINE codes
      are OWNER-GATED on copy** — each needs user-facing text, and several (`sampling_knob_dropped`,
      `dynamic_context_demoted`) are arguably too noisy to toast every turn. That is a product call, not a
      lane's. Side-eye owed after merge (new toast).
- [ ] **STRUCTURED-ABORT-REASON-LEAK** (S) — **a cancelled `structured` call can be RE-RUN as a retry.**
      `classifyTransportName` (`backends/kit/error-classify.ts:92-101`) regexes `/timeout|connection|network|overload/i`
      over an error's name+message → `{kind:"server", retryable:true}`, and `retry.ts` re-runs on that. The
      chat runners are protected — `turnAbortSignal` (`backends/kit/idle-timeout.ts:53-67`) deliberately
      re-aborts its own controller instead of `AbortSignal.any`, with a comment naming this exact bug. **The
      structured role is NOT:** `backends/openrouter/index.ts:279` passes `req.signal` straight to
      `client.chat.send` with no flattening — and that is the arm rpg extraction rides. RPG-SIGNAL is
      flattening at rpg's own seam, which covers rpg only; every other structured caller stays exposed.
      **The general law worth pinning: `AbortSignal.any` propagates the source signal's `reason`, and a
      reason that reaches `fetch` becomes the error your transport classifier sees.**
- [ ] **REGX2** (M) — an owner BUILD RULING that got archived: regex bulk edit + pipeline debugger +
      per-script JSON door (NOT regex presets). Ruled 08-03 dawn, queued, never dispatched.
- [ ] **RPG-ROUND-SIGNAL** (S) — the rpg state round is still UNCANCELABLE: no `AbortSignal` threaded into
      `runExtraction`/`runToolRound` (`entry/compose/rpg.ts`). The barrier-leak half IS fixed.
- [ ] **HAND-EDIT-VS-FLUSH** (M) — a hand `editSnapshot` during an in-flight turn can be clobbered by the
      flush. **Two independent sightings** (the watch list's "seen once, unchased" + the actor-state
      review's unconfirmed suspicion), nobody chased it. Reproduce and rule.
- [ ] **CONTRACTS-BARREL** (S) — `packages/contracts/src/index.ts` still promises "re-exports added as
      modules land" after 41 modules landed with zero importers. Delete the sentence.
- [ ] **CODEMOD-DOCS** (S) — `pnpm codemod` is cited by codemod-kit docs but absent from package.json.
- [ ] **CODEMOD-PATHMAP** (S) — the moved-path cache lie survives in `moveFiles`/`deleteFiles`/`copyFile`
      path VALIDATION (loud refusal today, but the asserts want the exact `getSourceFiles` map).
- [ ] **EDITSNAP-OK residual** (S) — `field-reachability.suite.ts:358` ignores `HandDoorResult.ok`.
- [ ] **SSE-SPEC-STATUS** (S) — `docs/history/design/sse-multiplex-spec.md:3-4` has a corrupted status line.
- [ ] **L8-INBOUND** (S) — foreign ST `mes:""` rows at import: refuse or strip. Named one-liner.
- [ ] **REGEX-REASONING-FIDELITY** (S, owner-call) — REASONING prints at slot 4 but executes
      post-postProcess. Unobservable today; flagged as an owner call that was never posed.
- [ ] **FLAKE-WATCH** (S) — `code-editor.ct` CM6 75ms window + `drawer.ct:162` focus-trap (pre-existing at
      HEAD) have no durable home beyond a watch list.
- [ ] **HISTORY-GRADUATION RULE** (S) — `docs/history/README.md` says a doc graduates only when EVERY
      finding is landed; **four moved docs carried live obligations anyway, and in every case the survivor
      was a PROSE TAIL** (a "Process notes" bullet, a blueprint step 4, an INFO-rank F10, a corrupted
      status line) — the graduation check reads findings TABLES, not the paragraphs around them. Add that line.
- [ ] **PROMPT_MACROS phantom** (S) — `proposed/world-state-clips-trackers-spec.md:267` names the deleted symbol.
- [ ] **BARREL ROOT-FIX** (M) — 56 `export * from` remain across `packages/*/src`.
- [x] ✅ **TSX-SHEDDING MIGRATION — DONE 2026-08-03, all four stages** (receipts in STATE above; the row
      is kept for its rationale). Original text: (`docs/design/tsx-shedding-migration-spec.md`, adopted from the memoban
      session, probe-verified preconditions). **Owner has particular interest.** `tsx` is a RUNTIME dep in
      production — `start` runs `tsx …/entry/index.ts`, so the server's real module resolver is tsx's and
      any divergence from node is an invisible bug class. The whole migration is one hazard: **6,359
      extensionless relative imports** (+ directory imports), fixed by Biome `useImportExtensions --write`
      SCOPED to paths (never bare `--write .`), which then stays on as the permanent enforcer.
      **⚑ THIS ONE RUNS IN A SINGLE SITTING, ALONE — owner-ruled, and SPECIFIC TO THIS MIGRATION, not a
      general orchestration rule.** All four stages start-to-finish from the main session with no sibling
      lanes and no concurrent session: Stage 1's ~6,359-file rewrite conflicts with any other writer, and
      **stages 1–3 without 4 leave a state where GREEN ≠ BOOTABLE** — under bundler+extensions the checker
      still accepts extensionless, so a missed extension typechecks green and crashes at boot with only the
      biome rule in between; `nodenext` (stage 4) makes it a compile error. Verify by BATTERY, not by
      reading 6,359 hunks. **Step zero: inventory what still needs `tsx`** (scripts/dev/*.sh, package.json,
      probes, codemods, seeds — spec expects zero) and put the list to the owner before flipping anything.
- [ ] **OWNER-OWABLES** — the archived "MORNING OWABLES" list, re-surfaced: the 3 nudge default texts ·
      REGPAR F3/F4/F5 menu · v3-transcripts-reach-new-installs-only · `countByBook` twins · "Untitled chat"
      in the regex rosters.

### BOARD THESE — the TAIL pass (ARCHIVE2, lines 2130–3515, 100% covered)

Report: **`docs/reviews/misc/2026-08-03-archive-rescue-audit-tail.md`**. It **independently re-confirmed
all three of the sibling's corrections to me** (the S6 seal block at :3060 confirms the anchors tuple was
deleted; the icon-seal block at :2469 confirms two real client consumers) — so those corrections stand
twice over, not once.

- [ ] **SQUARE-GLYPH-BUTTON-SWEEP** (M) — `ui-size-via-variant`'s `DEBT_BASELINE` still carries the full
      **14-row `!size-N !p-0` icon-Button debt across 9 `rpg/*` files**, unpaid since it was surfaced.
      Confirmed live in the gate's current source. Needs a Button square-glyph size arm + a sweep with
      computed-geometry proof; returns that baseline to terminal `{}`.
- [ ] **ICON-SEAL-DOORWAYS** (M) — the OTHER four named-not-built follow-ups, all **zero-hit confirmed**:
      `LucideProvider` at the client composition root · vector-effect CSS stroke route · the `iconNode`
      door for brand glyphs · the `fillRule=evenodd` probe to grow the fillable set.
- [ ] **AGENT-1-PROGRAM** (L, owner-scoped) — agent-sdk first-class for rpg-lite, 5 named arms explicitly
      scoped-and-not-dispatched, ruled order 2→3→1→4.
- [ ] **ZOD-STAGE-D-OWNER-GATE** (S–M) — the zod audit's stage D (stringbool / hostname /
      strip-observability) was **never posed to the owner**; stages A and B both landed.
- [ ] **AMBIENT-NONE-AFFORDANCE** (S) — `ambient-strip.tsx`'s weather/timeOfDay CLOSED vocabs carry no
      "none"/unset member (`RPG_WEATHER_TYPES` / `TIME_OF_DAY`), so they cannot be cleared; location/date
      are free text and can. This is the UI gap behind the unreachable compact arm.
- [ ] **DOCLAW-RPG-REFS-FORK** (S, decide-then-mechanical) — `compose/rpg.ts` now carries **41**
      Documentation-Law §-vocab comment refs (up from the 33 first flagged) with no sweep and no carve-out
      ruling. Pose it: sweep, or write the rationale.
- [ ] **MACRO-CAST-GUIDES-FORK** (S) — should user macros bind cast guides (appearance/outfit/thoughts)
      via `celBindings`? `macro-view.ts`'s cast projection still omits all three. If the answer is no, note
      the asymmetry in the file.
- [ ] **EMBER-VOCAB-SWEEP** (S) — "ember" strays as a design-constant name in CT/spec prose; rename to the
      accent/primary vocabulary.
- [ ] **WORKLOADS-LABEL-RENAME** (S, trivial) — 3 files still cite the RETIRED
      "[workloads.subscribe cross-feature]" precedent label (`rpg-choice-echo`, `use-rpg-mutations.ts:101`,
      `chat-options-menu.ts:37`).
- [ ] **IMPORT-SETTINGS-WRITE-GUARD** (S, owner-taste) — `import-user-settings` bypasses the write-boundary
      guard (heals+warns at READ instead of refusing at WRITE); lift on want.

**⚑ ARCHIVE2's own UNVERIFIED tail** (flagged, not asserted — each is one targeted grep from a verdict):
the six named UNREACHED side-eye items (waystone-compact · impersonate+1 · scene-lightbox · Status
max-edit · F9-F10 · stats-Recompute) — it did not run a fresh side-eye pass to see whether a later round
absorbed them · `refEnumerationLines` active-conditions coverage · and the two contradictory `#16 engine
wake` mentions inside the same range (one says still-open, a later one says 6/6 arms PASS live).

**⚑ TWO ROWS THE AUDIT REFUSED TO GUESS ON (UNVERIFIABLE, each names what would settle it):**
`SSE-STARVATION-PIN` (the spec §12 live-socket regression pin — could not find it, and it did NOT run a
two-method absence check, so it will not say "not found") · `SM7-STRICT-RESIDUE` (the "second
`response_format` builder" at a path that no longer exists — `backends/vllm/` was restructured away;
re-locate and re-check).

**⚑ ~~COVERAGE GAP~~ — CLOSED, and this note was STALE AND SELF-CONTRADICTORY (corrected 2026-08-03).**
It said the audit read only **lines 1–2130 of 3515 (~61%)** with 39% owed — but the TAIL section directly
above it states ARCHIVE2 covered **exactly 2130–3515, 100% line-by-line**. Together that is the whole file.
The bullet was describing the FIRST lane's coverage and was never updated when ARCHIVE2 filled it.
**It cost a dispatch:** lane ARCHIVE-GAP was sent to read a range already read, caught the contradiction
itself, and re-scoped to the more valuable job — a FINAL VERIFYING pass that re-checks ARCHIVE2's 10 rows
against today's tree (several were asserted from the document's own citation rather than a fresh grep —
T-11 says so explicitly), settles ARCHIVE2's flagged-unverified tail, and re-attempts the two REFUSED rows
with two-method absence discipline. **The lesson: a board note that describes coverage must be rewritten
when coverage changes, not left to be contradicted by the section above it.**

- **⚠ LIVE SHELL-TIER CLS FINDING (do NOT re-board the old PERF P1 — it resurfaced):** the archive tail
  audit traced the archived "CLS 0.24, profile lane owed" row forward and found the defect is ALREADY
  tracked live as **F-14 — *"CLS is 2–4× the budget on EVERY section — shell-tier, not preset-specific"***
  (measured **0.26**), in `docs/reviews/side-eye/2026-08-03-preset-shell-reverify.md:249`. A separate
  side-eye pass today independently measured 0.2542 on the config pane and attributed it to
  collection-group expansion, pre-existing. **One shell-wide defect, three sightings, no owner yet.**

- **⚠ MANUAL MEMO WAS HIDING CT FAILURES (owner report, 2026-08-03, second session).** The
  React-modernization program's memo burn-down deleted the manual `useMemo`/`useCallback` cache sites —
  and the CT suite **exploded**. Being fixed in that session.
  **The load-bearing reading: those failures are LATENT ON MAIN TODAY.** Deleting the memo did not create
  them; it stopped SUPPRESSING the re-render that reveals them. Same disease shape as the swallowed catch
  inside a root span (SPANGATE/OBSCLOSE) — green because the reporting mechanism was disabled, not because
  the behaviour was right.
  **The question that decides whether this blocks a push:** are the exposed reds (a) FIXTURE artifacts (a
  test that leaned on a memo boundary to hold a stale value — only the test was wrong) or (b) REAL product
  defects memo was masking at runtime as well? Any (b) ships today regardless of the burn-down. Ask the
  second session for the split before the push word is given.
  **It also vindicates the direction** — [[react-compiler-no-manual-memo]] treats manual memo as
  against-convention here; this is the first evidence it was actively concealing breakage, not merely
  redundant. Worth a D-entry clause if the split shows real defects.

- ✅ **ENGINES FLEET FIX — MERGED (`a386a4fae`, merge `2b1332159`; consolidated `pnpm check` 14/14).** Root-caused the
  long-standing "esbuild and something else running at the same time" annoyance: it is the **engines fleet
  launcher**, not the dep-optimizer / CT cache / gate fixtures (all three tested and RULED OUT). Every
  `pnpm engines adopt` left an immortal `tsx engines.ts --detach` + node-loader + esbuild cluster, because
  the `--detach` path says "and EXITS" but never `unref()`'d its child handles — so the launcher's event
  loop was held for the fleet's entire life (two were alive ~8h). **A DUPLICATE FLEET existed for ~8h
  holding ~17 GiB serving nothing:** a second adopter 6 min into the first's cold boot passed the VRAM
  headroom gate (mid-boot VRAM is ambiguous by construction) and `waitHealthy` reported success **because
  it polls the PORT — it validated the FIRST fleet's engines** ([[health-check-validates-the-port-not-your-process]]).
  Bonus defect: a no-op adopt overwrites the pidfile UNCONDITIONALLY, which can blank the live fleet's rows
  and orphan `engines:stop`.
  **Fix (4 arms, in that worktree):** an atomic boot lock for the adopt window · **adopt-in-place** (a
  healthy port is adopted, never re-spawned — the dupe class becomes unrepresentable) · pidfile MERGE ·
  `unref()` + fd-close in detach. **Honestly flagged by its author: not live-tested against a real fleet**
  per [[never-run-engine-launcher-live]] — the next real adopt IS the verification.
  **Box state 2026-08-03 (verified by the orchestrator, read-only first):** the owner had already reaped the
  dupes and stale launchers — all six cited pids gone, no detached launchers resident, **3 engines healthy
  one per port, ~40 GiB free across both cards.** Nothing left to clean.
  **✅ THE "DO NOT ADOPT" HOLD IS LIFTED** — the fix is on main. **But the verification is still owed:**
  per [[never-run-engine-launcher-live]] this was NOT live-tested against a real fleet, so **the next real
  `engines adopt` IS the test** — watch for exactly one launcher exiting promptly, no duplicate spawn on an
  already-healthy port, and a pidfile that merges rather than clobbers.
  Also corrected in passing: the workspace comment blaming ancient `esbuild@0.18.20` on tsx — it is a
  **drizzle-kit transitive** (`pnpm why` receipt in the commit).

- ✅ **`@orb-gate-ignore` NOW REQUIRES A REASON (`d55350d07`)** — the marker honoured by `pass.ts` for all
  183 gates accepted a bare `// @orb-gate-ignore <gate>` and suppressed the finding, contradicting
  GATE-AUTHORING §4.3 (*"a bare-marker-exempts rule is a rubber stamp"*). Grammar is now
  `// @orb-gate-ignore <gate>[(<position>)]: <reason>` — `parseGateIgnoreMarker`/`judgeGateIgnore`,
  `malformed` when the reason OR the position is empty, and a malformed marker **suppresses nothing**.
  **The subtle right call:** RECOGNITION stays permissive so a malformed marker is still SEEN and can be
  red-flagged by `gate-ignore-inventory` — a stricter parser would have made broken markers INVISIBLE to
  the gate that exists to catch them. 24 files swept to the colon grammar; `report.ts` single-pass clean;
  `pnpm check` 14/14; gate suites 16/16.
  **⚠ OWED — THE SIX-CASE PROBE WAS NEVER RUN.** Two lanes stalled on this task (four early terminations
  between them) and the orchestrator finished it by hand. So the grammar is LANDED and the corpus is
  green, but the §5 probe (violation-unmarked RED · marker-with-reason GREEN · dead-gate marker RED ·
  MALFORMED RED as its own flavour · blindness tripwire · a `mustPass` per limit) and the §4.3a two-guarded-
  things-on-one-line case are **unproven**. Also unverified: whether tightening surfaced any PREVIOUSLY-
  SILENT violation (the sibling claimed "baseline is clean" but stopped before checking) and an audit of
  the 24 rewritten reasons for any that paper over a real defect. **One small lane closes all of it.**
  **Lesson banked:** where biome and tsc CONTRADICT each other (biome called a trailing `return;`
  unnecessary; tsc's `noImplicitReturns` demanded it), the fix is a SINGLE-RETURN accumulator shape that
  satisfies both — not a suppression of one to appease the other. One cited suppression survives, where
  biome's type lens wrongly believes `exec()` is non-nullable.

- **📄 NODE 21→26 MAXIMAL-ADOPTION PROGRAM boarded** (`docs/design/node-26-adoption-program.md`, 336
  lines, probe-verified + implementor-grade, from the same session). Pairs naturally with the
  **tsx-shedding migration** — both are "make the platform the runtime" work, and tsx-shedding's stage 4
  (`nodenext`) is the seam where they meet. Read them together before scheduling either.
- Also landed with it: `drizzle.config.ts` joins the db type program (the **no-program hole** class — the
  same defect the memoban session closed for the four root configs), and the ignored esbuild `target` is
  dropped from `vitest.config.ts`, killing the per-lane esbuild/oxc warning.

## ═══ WATCH LIST (flakes + pre-existing reds; none blocking) ═══

- `code-editor.ct` completion flake under contention (documented CM6 75ms window).
- `drawer.ct:162` focus-trap failure — PRE-EXISTING at HEAD (D8R's flag).
- `preset-editor-surface.ct:140` parallel-load flake — A/B-proven pre-existing.
- `seed-demo-chats` cold-import contention — STRUCTURALLY fixed by routing to `SERIAL_INT`
  (`aef89ecb`); watch that it stays quiet.
- A hand `editSnapshot` during an in-flight turn can be clobbered by the flush (seen once, unchased).
- `rpg-scene-tab.tsx` sits near the 450-line cap.

## ═══ STANDING OWNER ITEMS (his word, nobody else's) ═══

1. **THE PUSH WORD** — 101 commits armed; a fresh `verify --push` is owed first (see STATE).
2. **The three nudge default texts** (I-8) — his veto, verbatim in NARCOLOR's report.
3. **Structured-output nullable-union reshape** (I-1) — the A/B call.
4. **Presets into the config rail** (I-3) — owner-timed, one array member forever.
5. ✅ **`tags.sortOrder`** — AUDITED + RULED KEEP-BUT-NARROW (I-4). **One question left for him:** the
   drag arm caps at 30 items while the library is ~400 — manual order is unreachable for ~92% of tags yet
   still decides character-card chip order. His call whether that cliff is right.
6. **DRAFT-TRUST** — drafts run the untrusted floor (strip `<i>`/`<b>`), committed `trustHtml` renders
   them; needs a "what render policy would this card get" server seam. Architecture call.
7. **AGENT-1** — agent-sdk FIRST-CLASS for rpg-lite. Plumbing is ~complete (terminal tools · stateful
   tools · session resume · compaction envs · firewall · catalog). Remaining arms in ruled order 2→3→1→4:
   (2) REASONING visibility parity — the model reasons at native depth on BOTH arms; max-pro-sub
   delivers ENCRYPTED deltas (hidden by provider), the OR skin delivers them readable, so the OR arm
   captures into our reasoning channel and the sub arm handles encrypted deltas HONESTLY (never an
   empty/broken pane) · (3) usage/context accounting parity (per-turn DELTA semantics) · (1) knob
   HONESTY (the SDK wire ignores most sampling knobs) · (4) the live rpg-lite loop scored on the SDK
   wire. FYI standing: Claude Max OAuth expired — the agent-sdk backend is dead until he re-auths.
8. **JSON-card export format** + **absent-character transcript import policy** (I-6).
9. **Doc-Law §-refs-in-comments ruling** — `rpg.ts` carries 33; sweep or carve out.
10. **Macro-feed cast-guides** — `chat-ops/macro-view.ts`'s cast projection does NOT carry the RV-11
    guide fields (appearance/outfit/thoughts). Should user macros bind cast guides via `celBindings`?
    Thread them, or note the asymmetry in the file.
11. **VRAM-refusal drill** — needs his word for a real GPU hog (unit-covered; the live arm is open).
12. **v3 transcripts reach NEW installs only** — the pack heal carries dressing, never transcripts
    (deliberate; his stack is fresh, so this is fine). A transcript-heal arm is his call if other
    installs ever matter.
13. **RV-13 second half — branch-and-save game modes**: the ruling (freeform demoted, d20-in-lite is the
    direction) is doctrine; the BUILD was deliberately sequenced AFTER the hardcoded-constants-become-
    user-slots work (PROSE-1 + knob editors + tracker-def editors — now largely landed, so this is
    ready to spec when he wants it).
14. **Unsent-draft reload persistence** — nav round-trips keep everything; only a PAGE RELOAD loses an
    unsent draft, deliberately. Persistence-design fork, not a bug.
15. **The held-back rail merge** — characters + chats into ONE glyph. He considered it, went with A+B,
    and A+B CONVERGES toward it, so it stays a cheap rail-level edit whenever he feels it.
16. Taste tail: Meteocons artwork fork (~8 icons, MIT) · grimstone theme (parked) · chat-options
    placement (D111 clause OPEN, breaks nothing) · persona=character design pass
    ([[persona-pin-prompt-resolution]]).

## ═══ UNKNOWABLE — flagged for the owner, kept on the board ═══

Items this audit could not prove either way from the tree. **None were dropped.**

- **The three live lanes' outcomes** (SCHEMA · DBANK2 · SWEEP). Their scope above is what was
  dispatched, not what landed; reconcile at their merges.
- **"the two `countByBook` twins"** (REGROSTER's flag, 2-instance dup). Today the symbol exists in
  exactly ONE home — `packages/server/src/domain/world-info/persistence/queries.ts:81`, called five
  times. Either the twin already dissolved or it lives under a different spelling; needs a look before
  anyone acts on the flag.
- The 08-01/08-02-era probe residue that was never re-driven: the `#16` engine auto-sleep/wake LIVE
  pass beyond the 6/6 arms already proven, and the VRAM drill it depends on.
- Whether every one of NIGHTFIX's three ARGUED refusals (row-pitch parity · scent scope ·
  `listScriptUsage` ×3) is settled with the owner, or only with the reviewer.

## ═══ ORCHESTRATOR QUICK-ONBOARD (load-bearing — keep) ═══

**Dispatch + lanes**

- `Agent {isolation:"worktree"}` — the WorktreeCreate hook owns creation (local HEAD + auto-install).
  POST-DISPATCH verify bases (`git -C <wt> rev-parse HEAD` = main HEAD). Briefs ALWAYS include: the
  back-channel line (lanes SendMessage you MID-RUN — the owner wants this), scope boundaries vs sibling
  lanes, `git -C` discipline, lane-unique scratchpad names, and **the explicit playwright CT files the
  lane's floor must run**.
- Message live lanes by AGENT ID, not role name. **TaskStop an agent once its report merges** — a
  lingering resumed instance in a torn-down worktree correctly refuses to act but sits in the owner's
  UI as running. NEVER resume an agent whose worktree you removed.
- **ALLOCATE D-NUMBERS AT DISPATCH** when two live lanes both mint (D123/D124 needed a mid-run
  renumber).
- Lanes cite their own defaults mid-run (the default-and-deadline law) — rule fast, they don't stall.
- Sticklers are the design-question vehicle (five ran in one day, every one changed the plan) —
  dispatch with the actor-state-review form + "write the file first".
- Scout dormancy censuses (LIVE / DOORWAY / DEAD-WIRE / ABSENT per verb) answer "is this domain real"
  cheaply — wired-or-cited applies at domain scale.
- **Every scout PRESENCE claim needs AST, not grep** (three instrument-error retractions in one day).

**Merges**

- A FAST-FORWARD merge SKIPS the pre-merge-commit hook — run `pnpm check` on main after any FF (or
  `merge --no-ff`). NEVER DEFER that check when the branch's gate list missed any stage.
- **NEVER CHAIN TEARDOWN BEHIND A MERGE IN ONE COMMAND** (burned twice: a `| tail` swallowed a hook
  failure and teardown ran on a failed merge; a red hook left staged-no-commit and the chained `rm -rf`
  deleted a lane worktree that then needed resurrection). merge → SEPARATE verify call → THEN teardown.
  A staged-failed merge is `git merge --abort`, never `reset --hard` with uncommitted work.
- **NEVER `cd` INTO A WORKTREE AT ALL — not even as a throwaway prefix.** The Bash tool's cwd PERSISTS
  across calls, so one `cd <wt> 2>/dev/null; git -C <wt> status` silently relocates every LATER command:
  a board edit + `git add -A docs` + commit then landed a main-only doc commit on a LANE'S BRANCH, on top
  of that lane's checkpoint, while it was mid-sweep (2026-08-03, BRAND-F). `git -C <ABSOLUTE-path>` is
  sufficient for every worktree read — the `cd` buys nothing and costs this.
  **The repair, when it happens:** cherry-pick the commit to main FIRST (bank the work), then in the lane
  `reset --soft HEAD~1`, rewrite the stray file from `git show HEAD:<path>`, and `git reset -- <path>` to
  unstage. NEVER `git restore`/`checkout <path>` in a lane's tree — it carries live uncommitted work.
  Verify the lane's modified-file count is unchanged afterward and TELL the lane.
- **HOLD merges while a `verify --push` runs** (merging mid-battery muddies what got certified).
- Merge-hook format-drift reds: fix IN the staged merge (scoped biome on the named files, inspect the
  diff, `git add`, `commit --no-edit`).
- Teardown: `status --short` (untracked survivors) + `git show --stat` receipts FIRST; never tear down
  a resumable lane. Recovery: the branch always survives —
  `git worktree add <same-path> <branch>` re-installs via the post-checkout hook.

**Verification instruments**

- `pnpm check` = STATIC only (~90-220s, in the pre-commit hook). `pnpm test` = the battery (~10 min,
  vitest ~9,800 + CT). `pnpm verify --push` = check + tests:node + e2e-smoke and **runs NO CTs**. READ
  `reports/` instead of re-running.
- snap is STUDIED IN FULL in `side-eye.md`: `--eval` takes a BARE arrow (an arrow-IIFE double-invokes);
  `--jsclick` for list rows; `--isolated`/`--dirty` beat dev-stack HMR; `--goto`/`__orb.nav` for SPA
  reach; `--file` renders committed HTML mocks; `--contexts` now works ALONGSIDE the dev stack (the
  fixture is an offset-pair sidecar since `73f78c81`). **The hover-loop class is REAL-POINTER-ONLY** —
  synthetic/CT/CDP-discrete are all blind; assert the structural invariant instead.
- `pnpm ast refs/jsx/orphans/unwired/chains` (resolution-based, beats grep) to verify a lane's deletion
  and sweep claims. Probes: snap + design-audit + perf-meter + motion-audit + `pnpm record`.
- Chrome MCP (claude-in-chrome) for live pairing with the owner: CDP hover survives screenshots, zoom
  regions, in-page counter probes — the tool for "I see it but can't shoot it".

**Owner cadence**

- He answers question-tool batches fast and almost always takes the mantra-marked arm — pose ALL
  pending forks, batch of ~4, recommendations marked; text-list the minor defaults you're taking under
  proceed-in-full.
- **When he says "read the reports in full" — do it.** The summaries drop load-bearing items (proven
  twice).
- **He challenges PREMISES, correctly and often** (tag reorder, display ephemerality, databank
  section). When a queued item's premise dies, say so and re-rule — don't build the boarded letter.
- Publish mocks as artifacts for his eyeball (four config-rail mocks ruled two forks in minutes).

**Compact ritual**

- Any OWED DELIVERABLE (unanswered owner question, undelivered report) gets written INTO this board
  before compact — never trust the summary to carry a whole deliverable across the boundary.
- The context-sentinel can fire a STALE ~99%-full warning on the first post-compact turn — ignore it.
- MEMORY is SYMLINKED across both accounts (one store, either login).
- **Resume read order:** this board (whole file) → `git log --oneline -40` → `MEMORY.md` (auto-loads) →
  `docs/architecture/core/AGENTS.md` for architecture work → the history archive only if you need the
  archeology of a specific landed program.
- AGENT-DEF REFINEMENT LOOP: at lane completion, occasionally ask the agent for onboarding friction and
  fold the good answers into `.claude/agents/*.md` / `.claude/agent-doctrine.md`.

## ═══ STANDING FACTS + POSTURE ═══

- **Stack:** `pnpm stack restart` defaults `ENGINES_POSTURE=adopt-only`; `--force` is the ONE
  fleet-killer. Engines: `pnpm engines:{wake,sleep,status}`; truth = `GET /is_sleeping` (`/health` AND
  `/v1/models` both LIE while asleep); the hold marker refuses auto-wake. Wake-on-demand is built into
  the server's vllm request seam (single-flight, fail-loud). No stack restart mid-battery.
- **⚠️ BASELINE SQUASHED 2026-08-03 (DBFIX, `e9e76f35`)** — `workloads.source` → `admission_key` + the
  two index keys + the dropped CHECK. **The dev db DROPS on next boot**; back it up first if anything
  in it matters, then let the latch re-migrate + reseed. The owner's hand-entered regex scripts are the
  usual casualty ([[backrest-recovery-and-cited-reports]]).
- **DB:** pre-launch, schema changes SQUASH into `0000_baseline.sql` — a baseline regen DROPS the dev db
  on next boot (backup + re-migrate, reseeds via the latch). Announce it when squashing. **NEVER bare
  `sqlite3` on the live db** — probe COPIES or `/api/_debug/*`. Wire capture:
  `GET /api/_debug/wire/captures?chatId=…` (`x-debug-token: dbg`).
- **Worktree lanes:** the auto-hook creates `wt/<name>` from local HEAD + `pnpm install` (2s/48MiB);
  NEVER `enableGlobalVirtualStore`. ONE committer on main; lanes commit with PATHSPEC and must
  `git add` new files first; lane cwd RESETS across notification boundaries. Semantic conflicts on a
  lane's own files → abort and send the LANE to merge main into its branch.
- **Probe harnesses:** `scripts/probes/rpg-extraction/` (`run-coverage.mjs` env-driven ·
  `steer-probe-real.ts` · `local-8b-vehicles.ts` with resumable `SPIKE_ARMS` · `card-teach-probe.ts`).
  Score against OPPORTUNITIES and through the PRODUCTION tokenizer (emitted ≠ rendered).
- **The extraction-mode map is EMPIRICAL** (spike §4f-§4h — read it before ANY mode work): hosted strong
  × folded = the proven default · agent-sdk wire = no terminal channel → LOUD fallback round · local
  vLLM × folded = prose-silenced → the `local-engine-fold-guard` runs the cheap round · **cheap is the
  local champion** (grammar-bound via `tool_choice:"required"`). `reliable` was CONTRADICTED by
  measurement and DELETED 2026-08-01.
- **Orchestration:** delegate volume, keep judgment; a fresh-context verifier/side-eye before any
  non-trivial "done"; diff an executor's self-flagged "deliberate deviation" against the SPEC TEXT
  before minting law ([[spec-completeness-no-improvisation]]).

## ═══ THE RECEIPT TRAIL ═══

Everything this board used to carry inline — the 2026-08-01→08-03 snapshots, every lane seal with its
merge sha, every superseded ruling, the whole burn-down archeology — lives at
[`docs/history/retro-workboard-2026-08-03.md`](history/retro-workboard-2026-08-03.md), audited and
intact. `git log --follow docs/retro-workboard.md` is the other half.

## ═══ ▶▶▶ RECONCILIATION (post-audit, 08-03 — landed AFTER the board rewrite's base) ═══

The audit wrote SCHEMA / DBANK2 / SWEEP as *dispatched*. Since then:
- ✅ **SCHEMA MERGED (`c92b7aeb`)** — one `scrubWireSchema` engine + FOUR wire modes
  (hosted-common · anthropic-format · guided-decoding [KEEPS bounds, the xgrammar lever] ·
  strict-compatible [all-required + anyOf-null, BUILT and OFF behind `EXTRACTION_STRICT_WIRE`]).
  Absorbed THREE drifted hand-rolled walkers — vLLM's wasn't position-aware, so a field NAMED
  `title`/`default` was being deleted from the guided wire (live bug, found by absorption).
  `parallel_tool_calls:false` + a loud extra-call warn. **Refusals READ on both roles.**
  **RESYNC IS A TOOL ROUND**; FOLDED PROVEN UNTOUCHED (4 named pins + 49 tests unmodified).
- ✅ **DBANK2 MERGED (`2b4c2d24`)** — the per-chat rack + **the D85 visibility toggle (the
  board's oldest unbuilt item)**; D-2 sources threaded; hide writes the FULL set; `formatBytes`
  promoted to `@orb/kit/strings`. Databank tail: D-3 arm (a) · S6 character rack · D-7 tile.
- ✅ **HISTLEG MERGED (`537a475e`, merge `fc35b0d9`)** — the FIFTH regex leg `PROMPT_HISTORY` is
  live: transforms the assembled history at prompt-build time and never reaches canon, with
  `historyDepth {min,max|null}` scoped to that leg alone (contracts-checked in BOTH directions,
  because `placement` is a SET and no discriminated arm can say "this field exists only here").
  **D125 MINTED** from its text. Consolidated `pnpm check` on the merged result: **14/14 PASS**.
  795 node tests / 143 CT green; ephemerality pinned at the SHARED source all four planes read
  (`message_variants.content`, D26) plus the mutation route — not four verb-level round-trips.
  **Deviation ACCEPTED:** the leg runs before the token FIT, not after — which is ST's own order
  (`script.js:4475-4501` precedes `getMaxPromptTokens()`) and the better arm, because stripping
  before the fit is what makes "strip it from the prompt" actually buy context back.
  **⚑ TWO FORKS IT RAISED, both boarded not built:** (1) ST derives a ROLE scope from the
  placement; our persist-time legs can't, so `PROMPT_HISTORY` hits ALL history rows — a role axis
  is a later two-member split, deliberately not a silent difference. (2) The card lift
  accept-and-DROPS an imported card's flat `minDepth`/`maxDepth` rather than mapping them onto
  `historyDepth` (ST scopes them on placements meaning something else here) — **the only place
  ST's stored depth data is currently discarded**; re-scoping is one chip in the editor.
- ✅ **GATES3 MERGED (`c0b6e347`)** — **gates 176 → 179**, every live violation FIXED not baselined:
  `nullable-column-inequality` (nullability DERIVED from the schema every run; reads BOTH `ne`
  operands — the live defect had the nullable column on the RIGHT), `no-nul-bytes-in-source` (17 raw
  NULs across 10 tracked files; `dangling-refs.ts` had been diffing as `Bin` since it was written, so
  a 26KB rewrite reviewed as literally nothing), `wire-schema-vocab-one-home` (vocabulary read off the
  engine's own keyword arrays, so a new keyword arms the gate in the same commit). **Real data bug
  found and fixed:** `loadSwipeStatRows` used `ne(messageVariants.id, messages.selectedVariantId)` —
  nullable by D26 (SET NULL on variant delete) — so a slot with a NULL pointer had **all** its variants
  dropped from the delete-messages delta. Red-proved at HEAD; the verb had ZERO coverage before.
  Arm-3 shipped BOTH gate and contract pin (a gate can't evaluate zod; a pin can't see a fourth backend
  re-inventing the walk — disjoint halves). Consolidated `pnpm check`: 14/14.
  **Its three flags:** (1) my brief's `sed -i 's/\x00//g'` remedy was WRONG — all 17 NULs are composite-key
  SEPARATORS, deleting them collides `a`+`bc` with `ab`+`c`; escaped to the two-char sequence `\u0000` instead (byte-identical at runtime). (2)
  `GATE-AUTHORING.md` did NOT carry the marker laws I claimed — **fixed on main**: §4.3a position-named
  markers, §4.3b block-scoped stacked-marker resolver, §5 the six-case real-tree probe. (3) `default`
  rides the hosted wire and neither vendor doc lists it — allowlisted rather than relitigate an
  owner-landed call; probe it if a hosted 400 ever names it.
- ✅ **STRUCTOUT MERGED (`ffd3b4b4`) — I-1's owner fork is CLOSED, and D126 is MINTED.** The
  nullable-union arm is now a runtime-switchable capability: **Settings › Admin › Structured output →
  "JSON-Schema shape" (As projected / Strict-compatible)** → `AppSettings.structuredOutputShape` →
  `EffectiveAppConfig` → a thunk on `RpgComposeDeps` → `scrubWireSchema(schema, "strict-compatible")`
  + `strict:true` on the real request. **The default is UNCHANGED — the switch was built, not thrown.**
  A string union (`STRUCTURED_OUTPUT_SHAPES`) dispatched through a mapped `Record`, so a third shape
  fails tsc rather than falling through. Consolidated `pnpm check` on the merged result: 14/14.
  **The per-connection fork was REJECTED with a reason, not a preference:** the per-wire keyword subset
  is already decided per backend at the request-build site (D93), and `runner`/`family` are sealed
  inside infra — a per-vendor shape knob in `domain/connection` would put wire vocabulary in a domain
  forbidden to know it.
  **Premise correction:** the brief (and this board) called it an env flag. It was NOT env — a
  hardcoded `const EXTRACTION_STRICT_WIRE: boolean = false` in `entry/compose/rpg.ts`. Deader than
  described: a redeploy, not a restart.
  **It minted D126 itself, correctly** — the `d-citation-integrity` gate REDs on any `D126` citation
  without an anchor (11 violations), so "cite now, mint later" could not ship gate-green. Merge
  conflict with my D125 mint resolved as a union; ranges now read D106–D126, next free **D127**.
  **Its rendered check caught a real defect:** the `Select` trigger is a fixed 200px and the first
  labels rendered `"As projected — opti…"` — the selected value unreadable. Labels shortened, the
  teaching moved to always-visible copy (`SettingRow.hint` is a HOVER-ONLY tooltip — a keyboard or
  touch admin would never have seen it), and a `scrollWidth ≤ clientWidth` assertion added so it
  cannot regress. **Fourth coupled site discovered:** a settings-section addition also needs
  `tests/support/ct/ct-data-providers.tsx`'s `realSettingsSections`, or every pane CT lies.
- 🔨 **SPANGATE DISPATCHED (`a40e2b5d8df6e2282`)** — the owner asked whether OBSCLOSE's class should be
  a gate or just discipline. **Gate**: the class recurred FIVE times (SM4 fixed one; OBSCLOSE found
  four more of the identical shape in the same file). Arm A = untraced fire-and-forget (work that never
  opens a DETACHED root span). **Arm B is the one that matters** = inside a detached-root span callback,
  a `catch` that does not rethrow — the shape that seals `status:"ok"` on every failure, i.e. a green dashboard
  over failing work. Tractable because `withRequestSpan` has only 15 call sites across 5 files.
  **⚠️ MECHANISM CORRECTED MID-RUN (my brief was wrong):** `root: true` is NOT a call-site argument —
  it is baked INSIDE `withRequestSpan` (`foundation/observability/tracing.ts:318`) and no call site
  passes it. I inherited that phrasing from a prior lane's report and repeated it unchecked; the lane
  applied the doctrine's "a brief's cited mechanism is a HYPOTHESIS" law and re-derived it from source.
  The gate keys on **an EXPORTED function of `tracing.ts` that calls OTel `startActiveSpan` with
  `root:true`** — which survives wrapper renames, cannot be defeated by a second wrapper, and gives the
  §4.6 blindness tripwire a real hook (strip the detach → derivation empty → RED, probed live).
  **A SIXTH instance found:** `fireRpgUserCommit` in `domain/chat/verbs/turn.ts` — a DB snapshot-commit
  plus a dice consume, entirely untraced, in a DIFFERENT file. Tally is now SM4 (1) + OBSCLOSE (4) +
  SPANGATE (1). The class demonstrably survives discipline.
  **Declared limit to carry when it lands:** a gate can prove a span is OPENED and that errors REACH
  it; it cannot prove the span is meaningful, named right, or correlated to the work. Floor, not
  ceiling.
- ✅ **DBFIX MERGED (`e9e76f35`) — the D117 contradiction is RESOLVED, and the mechanism was arm (a).**
  D117's lane machinery was INNOCENT and proven so: `databank-ingest` already declared
  `lane:"interactive"`, `workloads.lane` is stamped, the worker really does run one poll loop per lane.
  **The refusal was ADMISSION, not execution** — the `workloads_mode_active_singular` partial unique
  index over `(kind, owner_id, source)`, where `source` was a fixed enum and every databank row carried
  the `none` sentinel, so the lock read "one user, one databank-ingest at a time". SQL receipt from the
  red-first run: `UNIQUE constraint failed: workloads.kind, workloads.owner_id, workloads.source`.
  **Both symptoms were ONE root cause:** the producers insert the `documents` row and THEN enqueue
  (the enqueue crosses a domain boundary through an injected op, so it structurally cannot join the
  batch) — the CONFLICT rejected the mutation AFTER the document existed, leaving a chunk-less row with
  no workload that derives to `indexing` → "Queued" forever. The 3-of-7 parked documents were the same
  refusal seen from the other end. **No claim/reap/heartbeat bug exists.**
  **The fix:** `workloads.source` → **`admission_key`** (free TEXT) and the owning domain declares its
  own concurrency unit via `WorkloadContribution.admissionKey` — ingest keys on `documentId`, reindex on
  scope, index on its embed source. That also deleted the queue's LAST piece of domain knowledge
  (`resolveWorkloadSource`'s `kind === "index"` switch), which is D117's own inversion finally landing.
  Plus: one guarded `queue-ingest` seam for all four producers (errors-as-data — canon survives, the
  audit row records which arm ran), `stalled` as a rendered LIST phase clocked off the query's
  `dataUpdatedAt` (a mount snapshot would freeze), and actionable CONFLICT copy.
  **⚠️ DB BASELINE WAS SQUASHED** (pre-launch rule) — see the STACK note in STANDING FACTS.
  **Its flags:** (1) my "zero buttons" premise was STALE and named the wrong file — that was the
  *databank* `add-document-dialog`, already fixed by the 08-03 sweep and CT-asserted; the undecided
  component was chat's `add-chat-document-dialog` picker, which now has a real 5-test CT (no waiver).
  (2) `pnpm test:ct` is a WHOLE-TREE run that collides with the lane ban — **doctrine corrected** to
  `rm -rf playwright/.cache && npx playwright test -c … <paths>`.
  **Follow-up `b99357e7`:** the merged tree went RED on `types:packages` — three unbranded `DocumentId`
  literals in the new CT. The lane's floor ran `typecheck:graph` + `tests-dom` but NOT the per-package
  `pnpm typecheck`, which is the only stage that sees `tests/client/**` from `packages/client`'s
  tsconfig. Fixed with `castId<DocumentId>`; **lane floors should name `pnpm typecheck` explicitly.**
- ✅ **SPANGATE MERGED (`898eef25`) — gate #180 `detached-work-traced`.** ONE gate, TWO arms, live-green
  on a FIXED tree. Arm A = fire-and-forget work under no detached root; **Arm B = a `catch` that does
  not rethrow INSIDE an opener callback** — the shape that seals `status:"ok"` on failure, i.e. a green
  dashboard over failing work. One gate not two, argued: same derived opener set, same marker resolver,
  same stale/malformed arms — **and A2 is reachable BY "fixing" A1 wrongly** (move the discard inside the
  callback), so one producer must judge both. Consolidated `pnpm check`: 14/14.
  **A SIXTH instance of the class, in a THIRD file:** `fireRpgUserCommit` (`domain/chat/verbs/turn.ts`)
  — a DB snapshot-commit plus a queued-dice consume, under no span at all. Tally: SM4 (1) → OBSCLOSE (4)
  → SPANGATE (1). **The class survived one fix, a four-instance sweep of its own file, AND normal
  review.** That is the sentence that justifies the gate.
  **BOTH of my brief's premises died** (recorded so neither propagates): (1) `root:true` is baked INSIDE
  `withRequestSpan` (`tracing.ts:318`) and no call site passes it — vocabulary derived from the mechanism
  instead (*an exported fn of tracing.ts calling `startActiveSpan` with `root:true`*), which survives
  wrapper renames and gives §4.6 a real hook, probed live. (2) "15 call sites across 5 files" was wrong:
  `pnpm ast callers` → **32 hits in 12 files, 7 production**; the observability index/tracing pair are
  the declaration + re-export, not call sites.
  **Fixed, not parked:** `turn.ts` + both `search-discovery.ts` reindex enqueues open their own roots.
  **Permanently marked** with position + reason + end condition: egress teardowns ×5, local-light
  eviction dispose, the engine's inner warning-emit catch, and the rate-limit per-request GC — that last
  one because a detached root per request would push one bucket per request through a **500-entry ring
  and evict the real traces.**
  **⚠️ DECLARED LIMITS (the gate's green is a FLOOR, not a ceiling) — verbatim:** *it can prove a root
  span is OPENED and that errors REACH it; it CANNOT prove the span is MEANINGFUL — that its name,
  request id, or attributes correlate to the work it wraps. A wrong-but-present span passes.* Also: only
  DISCARDING handlers count · bare `void work()` is out (an unhandled rejection is loud) · statement
  position only · an absorbed promise assigned to a variable is out · "traced" is satisfied by ANY opener
  in the statement (proving it wraps THE work needs types) · Arm B reads only a SYNTACTIC `throw`, so a
  rethrow routed through a helper is invisible · `scanRoot` is `packages/server/src/**` only.
- ✅ **TAGUX MERGED (`fb3cf32a`)** — all THREE audit wants in one lane. Consolidated `pnpm check`: 14/14.
  **(1) Sort mode** Most-used (default) / A–Z / Manual, pure client comparator over `usage.total` — zero
  server change. **Manual NOT retired** and is now the ONLY arm offering drag handles (dragging a DERIVED
  order would write a `sortOrder` the screen never reflects — the right call). **(2) Suggest-existing
  picker**: `tag-picker-dialog.tsx` is an `@orb/ui/autocomplete` ranked most-used-first; a CASE-ONLY match
  submits the LIBRARY's spelling so "Fantasy" cannot drift "fantasy"; attached tags never offered; confirm
  reads `Create "fantsy"` vs `Apply`; three distinct always-visible empty states. **(3) Exclusion**: chips
  cycle off → include → exclude → off, new axis at `lib/tag-filter-state.ts` (one tuple + `Exclude`-derived
  active type + THREE total Records, so a fourth member is three tsc errors); `off` stored as ABSENCE;
  `character-library` persist v2 with a migrate reading the old `string[]` as `include`.
  6 red-first assertions run against OLD source (6 failed / 23 passed) before the fix. 79 CT + 12 unit.
  **Sort preference persists device-local** (`state/tag-library-store.ts`, registered in
  `persistence-boundary`'s `DEVICE_LOCAL_REGISTRY`) — a browse posture, not something that should follow a
  user to another machine or ride the synced settings blob on every dropdown change. Its OWN store, because
  `character-library` is the character list's prefs and folding another workspace's pane in would make that
  store's name and registry rationale a lie.
  **⚠️ A BRIEF PREMISE DIED:** "already cached client-side, zero new fetches" was FALSE for the
  character-library callers — `listTagsWithUsage` has exactly two consumers, both inside `features/tag`,
  and nothing prefetches it app-wide. The picker now does `useQuery({…, enabled: open})` on the SAME key:
  cache hit when the roster is mounted, one fetch otherwise, shared thereafter. No new endpoint, no new key.
  **@orb/ui DEFECT FOUND + FIXED IN THE PRIMITIVE:** with nothing to suggest, Base UI opened an EMPTY popup
  that (a) intercepted the pointer on the very Create button beneath it and (b) removed the whole host
  dialog — title, description, Cancel, Confirm — from the A11Y TREE while open. Added an `open`/
  `onOpenChange` passthrough to `packages/ui/src/primitives/autocomplete/autocomplete.tsx`; the picker
  pre-filters with `mode="none"` and declines to open an empty popup. **Durable:** any autocomplete inside a
  `FormDialog` needs the controlled-open arm, and any CT asserting a footer button after typing must barrier
  on the popup being CLOSED.
  **⚑ OWNER TASTE (open):** the default flip means the ≤30 drag UI is no longer what you land on — you pick
  "Manual order" to get handles. Honest reading of "default Most-Used", but it puts manual one click further
  away, which bears on the still-open **"retire `sortOrder`?"** call. Side-eye is judging whether manual
  reads as REMOVED.
  **⚑ GATE BUG FOUND (not TAGUX's, left untouched):** `ui-size-via-variant`'s ALLOWLIST still carries
  `features/tag/components/tag-settings-row.tsx`, a file that NO LONGER EXISTS (F-11 moved it) — and the
  gate did NOT fire. Its own two-sided contract says a stale row is RED, so **its stale arm appears not to
  check for a missing file.** That is the exact loaded-gun class the marker laws exist to prevent; worth a
  small lane.
- 🔨 **SIDE-EYE DISPATCHED on TAGUX** (`a7c895dddb90ded5f`) — judged at the owner's REAL ~400-tag scale, not
  fixture scale; re-verifying the autocomplete a11y fix independently.
- 🔨 **ASTLENS DISPATCHED** (`a56651b299a85551c`) — a RESOLUTION-based `pnpm ast` lens for **aliases that
  resolve to `string` without narrowing** ("an alias must NARROW or BRAND; if it does neither it is a lie
  with a nice name"). Template literals and `Branded` are legitimate and OUT of scope; the target is
  `type X = string` and its TRANSITIVE chains across import/re-export hops, which are invisible to every
  syntactic tool we own. **Lens first, gate decision after seeing the real corpus** (report-then-decide —
  a gate built against an imagined corpus is how you get eleven false reds). Sweep confirmed no existing
  gate covers it: `no-inline-types` is placement, `contract-derives-not-respells` is object-shape
  re-spelling, `no-inline-union-redecl` is unions, `brand-in-name-position` declares alias-typed positions
  out of reach — **none inspect an alias's RHS for `string`**, and `ast.ts`'s existing `aliases` lens is
  IMPORT aliasing, a different concept.
- ✅ **I-5 BRAND BURN-DOWN — CLOSED (`93eb9537` + fix `8f0c458a`).** 169 files/374 sites → **`{}`**;
  baseline AND generator DELETED; the ratchet machinery removed; live bite re-proven with no budget left
  to hide behind (plant `chatId: string` → RED; `rm` → green). 9 checkpoint commits, 549 files, 738 vitest
  + 285 CT. `retypeIdAnnotations` closed 359 retypes; a lane-written MULTI-BRAND single-diagnostics-pass
  variant closed **2,538 fixture casts in one typecheck each** (the stock helper is O(brands × whole-project
  typechecks)). ~140 sites hand-judged. **`CharacterHandle` minted** — `characters.handle` branded
  type-only, `0000_baseline.sql` UNTOUCHED (no squash after all). Misnomers renamed OUT of the vocabulary
  rather than falsely branded (`stagedHandle`, `busInvalidate: ChatId | "user"`, form drafts as
  `Handle | ""` after `no-fake-disabled-id` correctly refused `castId<Handle>("")` sentinels).
  **⚠️ THE ZERO'S MEASURED LIMITS (do not read it as "no stringy ids remain"):** the **suffix class = 66
  live bare-string positions** the EXACT matcher can never see (`hostUserId`, `targetUserId`,
  `parentChatId`, `avatarAssetId`, `defaultPresetId`, `anchorPersonaId`, `ownerHandle`, `gmHandle`) — ~10
  spellings cover most, so a curated compound-name arm is a plausible follow-up. **Alias class = 0.**
  Variables/returns out of scope by design.
  **The red it shipped, and the rule it bought:** the merged tree failed `types:tests-dom` with **170
  errors in 20 e2e specs** — the lane branded the e2e SUPPORT signatures but ran only `typecheck` +
  `typecheck:graph`. **`tsconfig.json`'s program does not include `tests/e2e/*.spec.ts` AT ALL**, so the
  graph program is structurally incapable of seeing a spec. Fixed at the PRODUCER SEAMS (branding
  `startChat`/`ensureCharacter` returns + the wire mirrors, type-only so the e2e carve-out holds) rather
  than 170 casts. **Doctrine now requires naming all THREE typecheck programs** (there is no
  `typecheck:testd` — the `.test-d` lane runs through vitest; name the file).
- ✅ **ASTLENS MERGED (`5f764a7b`) — `pnpm ast stringy` ships, and it argued AGAINST its own gate.**
  The cut is ONE checker call (`decl.getType().isString()`) and needs **no allowlist** — template
  literals, `string & {brand}`, literal unions, `string | null`, `T extends string` and containers all
  fall out of the compiler's own flags, probe-measured before building. **Corpus: 1 hit in `packages/`
  (`RestartVllmEngineResult`) + 1 in `scripts/` (`LocKey`, dev-tooling, leave). ZERO transitive chains** —
  credible only because a planted 3-hop cross-package chain (through a RENAMING re-export) was reported
  with its full resolution chain while brand/template/union probes beside it stayed silent.
  **RECOMMENDATION TAKEN — NO GATE**, and the reason is load-bearing: **`scripts/check/pass.ts` builds
  the PURE-AST workspace** (`getWorkspace({root})` — no tsconfig, no `@orb/*` resolution), so a gate
  calling `ctx.checker()` there gets a checker over an UNRESOLVED project and would report the one direct
  hit while silently missing every chain it exists to find. Green, confident, blind. If ever wanted:
  push tier beside `deps:orphan-ratchet`, folded into that typed pass. **Corollary:**
  `brand-in-name-position` is syntactic BY NECESSITY, not laziness. `RestartVllmEngineResult` deleted on
  main (`01139227`). Known limit: the CLI's `resolveScope` only accepts `packages/*`, so the `scripts/`
  finding is unreachable from the verb — a cross-lens change, not taken.
- ✅ **STALEARM MERGED (`d67868da`) — it WAS a class: 5 gates, 18 dead rows.** The anti-pattern is one
  line: `if (!fileLoaded(ctx, rel) …) continue` — **the row's own presence gating its own staleness
  check**, so a DELETED file's row is never examined and can never red. Fixed uniformly by gating the
  sweep on a separate permanent ANCHOR and making every per-row check an unconditional `!seen.has(rel)`,
  which unifies mode (A) *no longer violates* and mode (B) *file is gone* into one test.
  **Fixed + rows deleted:** `ui-size-via-variant` (1 — `tag-settings-row.tsx`), `dialog-via-composite`
  (3 — party→roster rework), `empty-state-has-action` (**14** — the rpg-client flattening),
  `no-arbitrary-tw-values` + `motion-token-purity` (mechanism fixed pre-emptively, rows still live).
  11 gates were ALREADY correct (unconditional `seen` / explicit `sf === undefined` / separate anchor);
  ~165 carry no path-keyed table. Each fix ships a `mustFlag` reproducing a deleted survivor.
  **`GATE-AUTHORING.md` gains §4a** naming both modes — the gap that let a careful author implement half
  the contract and believe they were done.
- **LANE ROSTER: EMPTY** (see STATE). Everything below this line is a HISTORICAL reconciliation of the
  08-03 burn-down; do not read it as a live roster.
  **Also present and NOT MINE:** `wt/memo-ban-investigation` — the owner's SECOND session. Do not touch.
  **NEXT, in order:** side-eye findings fixed (ALL of them, standing law) → quiesce → full `pnpm test`
  battery (the CT proof — `verify --push` runs none) → fresh `pnpm verify --push` → board PUSH-READY and
  ASK FOR THE WORD. ~150 commits past origin; last PUSH-READY was declared at 85.
- **KILLED (owner word):** the first brand lane (mech-executor tier) — zero commits, one untracked
  codemod script, nothing lost. Replaced by BRAND-F above.
- **LIVE RED ON MAIN (routed to DBFIX):** `tests/tooling/chat-component-presence.test.ts` —
  `add-chat-document-dialog` landed with no CT and no waiver, so ratchet #18 is red and would block
  `verify --push`. Preference stated: the REAL CT, because SWEEP found that dialog's upload arm shipped
  with ZERO buttons — exactly what a CT catches and a waiver does not.
- **OWNER RULINGS (dawn):** databank KEEPS its rail section (fork closed) · tag manual reorder
  NOT lifted (premise challenged: `tags.sortOrder` exists but a global manager may not want it
  — TAGSORT audit queued, do not delete blind) · prompt-ephemerality **now BUILDING** via
  HISTLEG (supersedes the accept-and-rename REC) · regex extras = bulk edit + debugger +
  per-script JSON door, **NOT presets** ("we made regex part of presets kinda").
- **PUSH-READY IS STALE** (declared at 85; HEAD is 101+ past origin) — a fresh `verify --push`
  is owed at quiesce before asking for the word.

### SWEEP SEALED (`d2b73def`) — 6 defects found-and-fixed + the REAL mock-vs-rendered pass
Fixed: the config CONTEXT pane said one fact TWICE (NIGHTFIX's new header re-printed the body's
title — it REBUILT the F-12 defect registry-contracts.ts names verbatim) · both CONTEXT bands
painted a different voice than the LIST band on the same 48px horizon · databank's band said
generic "Details" colliding with CONTENT's own group · a databank readout row spread 1392px in
a 1440px pane · the picker's ordered slice carried NO RANK numbers · **the Add-a-document
upload arm had ZERO buttons — Esc/backdrop was the only exit**. All red-first, 150 CT green.
MOCK-VS-RENDERED done properly: 18 frame pairs (`reports/snaps/mvr-*`) with per-element delta
tables classified rendered-wrong / mock-stale-sanctioned / deliberate-with-cite.
**⚑ NEW OWNER FORK — mobile config lands on the WELCOME, not the roster** (the mock says "the
roster IS the screen"): `resolvePanelMode` makes mobile never dock a LIST *shell-wide*, so the
fix is either a shell-law change (every section) or config rendering its roster into CONTENT
on mobile (two homes for one roster). Lane did NOT improvise. REC: config-local.
**FLAGGED, not fixed:** SwitchField anatomy differs CONTENT vs CONTEXT (shared forms-tier
component — own lane) · COLLECTION_WINDOW_MAX_HEIGHT is a fixed cap where a pane-relative one
belongs (~485px dead at 1080) · **`databank.createFromText` CONFLICTs while another ingest
runs** (a second document is refused server-side; client shows a generic toast — workloads
lane) · **documents can park in `Queued` forever** (3 of 7 in the seed; the 5-min stall hint
fires on DETAIL but the LIST row says nothing) · character-opening inline `<code>` renders
with UNGENERATED classes (the Streamdown-root-seal class) · listScriptUsage still 3× per batch
· an inherited app-shell CT red (proven pre-existing at HEAD).

**⚑ MOBILE-ROSTER FORK — OWNER RULED (08-03): NEITHER offered arm; the CONSISTENT rule.**
Owner: "what would be the cleanest most consistent option? do it properly without making a
singular exception." The finding was mis-framed as config-vs-shell — the truth is chats and
characters ALREADY do the right thing on mobile (list is the screen → tap → container-queried
PUSH-detail with a back row, the SE-A arm), and config + databank are the DEVIATIONS. RULED:
**one shell rule — on mobile, a list-bearing section with NO selection shows its LIST as the
screen; selecting pushes to CONTENT with a back row** — applied by the shell to every section
that declares a list. That REMOVES two exceptions instead of minting a third, and it is what
`mobile.html` was drawing. Lane MOBILE queued: resolvePanelMode (shell-store.ts:372) + the
push-detail seam + per-section CTs at the mobile frame (config · databank · chats · characters
· corpus regression) + the mock frame re-compared.

**▶ MEMOBAN SESSION — MERGED (08-03, `wt/memo-ban-investigation`; worktree KEPT on owner's word).**
Merged by the orchestrator on the owner's say-so; consolidated `pnpm check` on the merged tree **14/14**,
full `pnpm test` battery **GREEN on the merged tree — 9,920 vitest / 2,384 CT / 0 failed / 0 flaky**
(the number that mattered: this work's whole hazard was that deleting manual memo UN-HIDES CT failures,
and static cannot see that class. Their session fixed every one it exposed, incl. the `takeDiscard`
save-loop).
Gate count is now **183** (STATE block corrected).
Four waves + audits, all hook-green: useContext→use() ×10 · web-api + YMNNAE eslint families
(3 rejected rules carry the 25/25-LEGIT-SEAM triage receipt in the config header) · 52-site
manual-memo burn-down (3 exemptions: the 2 denylist-skipped seals + fuzzy-search value-keying;
exposed + FIXED the autosave takeDiscard save-loop — CT caught it BECAUSE CT is uncompiled) ·
the React-modernization gate trio no-manual-memo/no-use-context/no-legacy-react-api (180→183,
§4a stale arms, the compiler-denylist tripwire at the REAL pnpm path) · installed-surface audits
(tsconfig/vite/vitest/depcruise/stryker) that killed two dead Vitest-4 keys, closed the
root-configs-in-no-program hole (+ selection.ts routing), landed detectProcessBuiltinModuleCalls,
and put gate TOOL ERRORS into check-structure.json + check:show.

**D127 DRAFT — for the owner to mint (or strike):** THE COMPILER OWNS MEMOIZATION + THE UNCOMPILED
CT LANE. (a) Manual useMemo/useCallback/React.memo is BANNED from the react import (gate
no-manual-memo); exemptions are typed rows with end conditions — the two compiler-denylist seals
(message-list, media-grid; the gate's tripwire reds when @tanstack/react-virtual is delisted) and
fuzzy-search's value-keyed deps. (b) CT runs NO compiler pass BY RULING — correctness must hold
without the compiler; a CT red the compiler would mask is a REAL DEFECT (the takeDiscard loop is
the founding receipt). DECLARED LIMIT: compiler-only defects (bail-out behavior shifts, altered
effect timing) are caught only by e2e/dev-stack; remedy if it ever bites = a targeted compiled-CT
project ALONGSIDE, never a swap.

**BOARDED (new, each own-lane):** (1) pass.ts `@orb-gate-ignore` requires NO reason — the house
marker is one-sided for all 183 gates; tighten hasGateIgnore + sweep the tree (Wave-3 receipt:
six-case probe case 4 fails by §4.3's letter). (2) CT-on-our-vite spike: pnpm override
`@playwright/experimental-ct-core>vite: ^8.1.2` + CT battery; green = one vite + ct-config joins
the type program; red = revert (also rehearses the ct-react-culled contingency — vitest browser
mode is OFF the table, owner: chromium bug). (3) tsx-shedding migration (quiet window): biome
useImportExtensions --write (fixes to .ts + index expansion, probe-verified) → node runs server →
nodenext on the node-side programs; ui/client stay bundler (vite is their resolver — settled).
