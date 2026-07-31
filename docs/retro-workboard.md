# Retro Workboard — the live board

> **THIS IS THE WORKING DOC** (owner-stated). Not law, not a deliverable — the durable state + work
> log an orchestrator resumes from cold. Authority for LAW = `docs/architecture/core/**`; the D-ledger
> (`Core-Path-Registry.md` / `Core-Laws-and-Precedents.md`) wins on ANY conflict.
> `docs/architecture/proposed/**` is pre-rollback REBUILD REFERENCE — never cite its status as current.
>
> **CURRENT-STATE ONLY.** When a block goes stale, REWRITE it — never stack a new session layer on top.
> Rewritten in full 2026-07-30 (owner: "centralize shit in there"): the 07-29/07-30 session narrative
> blocks were collapsed into §THE BOARD below, which is now the SINGLE backlog. Prior baselines:
> `git show HEAD:docs/retro-workboard.md`, and `git show HEAD~1:` for the 07-29 rewrite.

## ═══ WHY RETRO EXISTS — the north star ═══

Read `shitsfucked` at the repo root (the post-mortem). Main's own ledger, verbatim: *"We are tired of
hunting down invisible bugs. **Everything must be proven.**"* The disease it names — **features that
looked done and silently weren't** (a dropped SSE `turnCompleted` that locked the composer forever; a
multi-speaker engine that threw the characters away) — is the thing this rebuild exists to kill. So the
posture is **drive it live, then pin it**, not paranoia. Judge every "done" against that frame.

Global **KISS/YAGNI are SUSPENDED here** — build the maximal, most-provable version ([[kiss-yagni-suspended-build-maximal]]).
Package cake: kit ← contracts ← db ← server ← client + sealed ui; one-directional flow (rpg ↔ chat only
via injected ops). Read `docs/architecture/core/AGENTS.md` IN FULL before any work.

## ═══ ▶▶▶ CURRENT STATE — 2026-08-01 morning (the overnight run's ledger — READ FIRST) ═══

**THE OVERNIGHT RUN (07-31 → 08-01) — everything below landed gate-green; FULL BATTERY GREEN at the
end: vitest 8287/0 (23 skipped) + CT 1531/0/0-flaky.** Commits (local until the authorized
end-of-run push): R4b `7604bd6f` · R5a+R5 `7d0e6f60` · OR-1…4 `e39418d7` · R1 fold `940969f6` +
verifier hardening `5fb7816a` · AU-1/2/3+9 (worktree, merged `84a78c4f`) · EFF-2 `f7113ae0` +
logitBias `28e0892a` · connection-test curation reality (in `b0859a40`'s sibling) · docs/law commits
(D111, D112, rulings, spec). **Owner granted ONE push on green (07-31)** — verify:push runs e2e-smoke;
stack must be up.

**Headline:** the R1 fold is LIVE-shaped end-to-end (`extractionMode:"folded"`, terminal-tools
primitive, D112), adversarially VERIFIED (CONFIRMED, 3 findings fixed same night), and the steering
loop is PROVEN on production code (R4b steer-probe-real: Δ −2.33 last-3). The Tracker unification is
fully ruled + spec-approved (§THE BOARD, `docs/design/tracked-field-unification.md`) — it is the next
big lane, with R6+R2 inside it. The workloads junk-drawer exit
(`docs/reviews/stickler/2026-07-25-workloads-junk-drawer-exit.md`) is queued as its own headline lane.

**E2E SUITE 30/30 GREEN (08-01):** one real app regression found+fixed (`a2658fbc` — useRpgBus SSE
socket starvation, see [[sse-per-origin-connection-budget]]); stale-IA tests re-pinned to current law
(`b0f0b353`). New board items from the pass: **SSE-1 — RULED (owner 08-01): BUILD THE MULTIPLEX PROPERLY, spec
first.** Context: prod runs h2+h3 on Caddy (cap invisible there), but dev/e2e live on plain-h1 :5173,
and one typed-envelope channel makes the starvation CLASS unmakeable — it collapses the transport back
to the ONE-bus shape D38 already has domain-side. Spec must cover: per-stream auth scopes (user vs
chat-membership vs game-gated), reconnect/replay semantics (member-strip replay is the leak-prone
path — [[reasoning-cut-durable-replay-leak]]), subscription lifecycle (per-room attach/detach on one
socket), the CT SSE-stub harness reshape, bus-coverage gate rows. Own lane, queued behind the Tracker
unification · **D111-GAP resolved as PARKED (owner 08-01):** the ☰ relocation "got boogered up" — breaks NOTHING
(menu functional in the topbar, no test pins location); owner isn't loving the current look and wants
to get it right — a DISCUSSION item, not a build item; D111's clause amended to "OPEN, neither
location is law" · useRpgBus has no CT (e2e-consequence coverage only).

**DAWN ADDENDUM (the last stretch):** weather = closed 8-state enum + flavor label end-to-end
(`745ed3dc`+`f96e24d7` — axis homed in kit by reachability, 65-row binning table deleted, host picker,
one display rule; TOTAL-storage lesson banked) · Waystone size-steps fixed (`611dee66` — the header
band had NO query container + unreachable thresholds; `.shell-panel` now the container) · panel
26vw→30vw (`660b2dd4`, owner's cramped ruling — a 1280 desktop now reaches the 120px stone) · the
:5173 vite was a DEAD-WATCHER ZOMBIE serving 2-day-old modules (killed by PID; stack restarted fresh;
[[live-client-port-5173]] extended: curl /@fs/<file> vs disk before trusting any live measurement) ·
two off-enum weather rows repaired in the dev DB while down · **FINAL LIVE MEASUREMENT: stone 120px,
panel 480px** ✓.

## ═══ ▶▶▶ 08-01 DAY WAVE — LIVE STATE @ ~07:00 (compact-safety snapshot) ═══

**TRK-1 "escape" — FALSE ALARM (corrected):** main was NEVER touched. The scary ~84-file list was
the agent running a doctrine-banned bare `git checkout --` (no pathspec) in its WORKTREE — that no-op
prints a file list that reads exactly like a dirty-tree report. The tool layer hard-rejected its one
main-path attempt. My captures confirmed main clean throughout. Lessons kept: verify with
`git diff --cached` (staged) not just `diff`; worktree briefs still say "paths are references."

**08-01 BIG-LANE LANDINGS (both merged to main, merge `22cf37ea`, check 12/12 green ×2, battery running):**
- **TRK-1 stage 1 LANDED** (`ea99b0e3`, → **D113** minted): `RpgTrackerDef` one home in `config.trackers[]`;
  `RpgTrackerValue` has NO max (drift class unspellable); `carriesTracker` revoke>grant>class one home;
  `hud_widgets` DROPPED + `widget_values`→`tracker_values` no-legacy baseline regen; R6 per-call grouped
  schema; R2 game-rendered tool descriptions; TRACKER vocab sweep (roster untouched). Its worktree ran
  vitest 7295/0 + CT 1551/0. **DB SCHEMA CHANGED — dev DB needs wipe/reseed on next stack cycle (owner).**
  Stage-2 remains queued: Status-absorbs-Sheet takeover, GM Tracker editor, RV-8 primitives; flagged for
  side-eye: Status max-edit is now honestly `updateConfig` (game-wide) from a per-actor row.
- **PREV LANDED** (4 commits, un-defer round done properly per owner): Preview = context-budget instrument;
  found+fixed 2 real server defects — preview never ran `shapeContextForSpeaker` (multi-character rooms
  under-reported the prompt) and the merged card block was one opaque string (now per-member slices via the
  approved `getCard`→`gatherAssembleContext` seam, zero client math). `AssemblyBudgetSlice.parts` per-contributor;
  `ChatInjection.originLabel`; delivered prompt asserted byte-identical (accounting-only split). Diagnostics
  drawer KEPT pending owner word.
- Merge conflicts were import-block-only ×4 (TRK cut pre-TIME_OF_DAY-consolidation); resolved by
  used-symbol union; both packages tsc-clean.

**OWNER RULING (08-01, mid-stage-2): per-carrier tracker max RESTORED.** Stage 1's "one ceiling on
the def" was an agent DEVIATION from approved spec §5.2 (which kept `max?` on the value) that I wrongly
ratified into D113 — owner caught it live ("max lowered for everyone who carries it" is super wrong).
Amended model: `def.max` = DEFAULT ceiling · `RpgTrackerValue.max?` = per-carrier override (absent = def's;
written only when it differs, write-equal clears) · effective = `trackerCeiling(def, value)` ONE home in
contracts/rpg/tracker.ts · max stays host-authored (no model write surface change) · Status-row max edit =
this character; Game-tab editor = the default. Stage-2 lane redirected to build the whole vertical in its
worktree; D113 + spec §5.2 amendment ride the merge. LESSON: diff an agent's self-flagged "deliberate
deviation" against the spec TEXT before minting it into law.

**200k-CEILING FIX LANDED `2934af26`** (owner-found post-wipe): the DB wipe killed the OR catalog
snapshot; `resolve-model-capability.ts`'s cold-mirror fallback silently handed EVERY OR model a 200k
window. Fix: `WARM_WINDOW_TRUTH` — an exhaustive per-`CredentialSource` Record (tsc-total) that warms
each source's real window truth (OR snapshot→live /models · max-pro-sub daemon · vLLM engine
max_model_len · custom = user-declared · local-light env floor), cold-gated + single-flighted +
best-effort; genuinely-unknown windows mark themselves (`windowEstimated` → `ceilingEstimated` wire) —
Preview + transcript divider say "window unknown", ratio suppressed, CT pins that 200,000 appears
nowhere; a user preset maxContextTokens at/below the guess BINDS (their declared truth un-estimates
the ceiling). Bonus harness fix: read.int.test.ts makeDeps spread order silently ate overrides.

**PRESET PARAMS FIXES MERGED** (owner-found, `b71dbc60` → main): (a) capability staleness — Connections
persists roleDefaults via settingsChanged, but USER_BUS_FILTERS.settingsChanged never invalidated
`connection.resolveChatCapability` (staleTime Infinity ⇒ page-refresh-only); narrow pathFilter added +
CT reproduces the bug with the row removed. (b) blank Output fields now show effective-default
placeholders — max output = `DEFAULT_MAX_OUTPUT_TOKENS` 2048 (the pipeline's real materialization, NOT
the model cap), max context = window "(full window)"; NumberField gained a placeholder prop (Base UI
Root swallows input-part props — routed to the Input slot explicitly). (c) CapabilityGate empty state
names the hidden knobs per axis. Side-eye look at the new copy/placeholders rides the W-H pass.

**IN-FLIGHT AGENTS (SendMessage ids):** smalls DONE (`edb78a26` AU-5 kill incl. re-homed cold-cache regression tests + `d9563dd1` VER-1d quality guard; NEW ITEM: `resolveAgentSdkAlias` branch now product-unreachable — separate look). Was: smalls ON MAIN — AU-5 `edb78a26`
(NOTE: my staged density spec got index-swept into that commit — content fine, cosmetic), VER-1d guard
IN PROGRESS (`resolve-chat.ts` uncommitted in main's tree — **NO git ops on main until it lands**) ·
CARD round-2 SOLVED (`aa20a1940c51c9826`, wt alive, commits 3326615d/1fb37fca/83f3464b rebased on
cf82ade3): the "empty archive" was NEVER an archive bug — the owner's "cards" are UNTERMINATED
`:::card` fences (a nested `:::choices` ate the single closer; two more = mid-stream truncation),
degrading to literal text that LOOKS like a card in the transcript; archive is byte-consistent with
the transcript in all 10 card-bearing chats. Shared artifact-row treatment landed (Journal+Scene, the
collapsed-card title bar anatomy). ROUND 3 DONE `dfa2e427` (teach clause both variants; tokenizer `committed:true` EOF-close, DIRECTIVE-registered names only; call sites classified — `stripHiddenSpans` deliberately STRICT, fail-closed at the §3.6 member boundary; the 3 broken dogfood bodies = regression fixtures, archive now 'Cards — 3'). LANE READY TO MERGE (4 commits, held behind the token-drift fix on main). Was: (a) RPG_CARD_TEACH forbids
nesting :::choices inside :::card; (b) tokenizer implicit-close-at-EOF for COMMITTED bodies only
(committed:true option — streaming hold-back untouched; wire projection follows the card class,
D110 §3 tests incl. the wire-stub arm) · TRK-1 `ae441b0805535fe2e` (wt) — Tracker
stage-1 server core, LONG · PREV `aa855bb2e7ac7e9d3` (wt) — Preview rebuild · AU-8 COMPLETE (final table): #1 `automation.stream` server-built+tested, ZERO client surface — WIRE-L
or explicit-DOORWAY (OWNER CALL; the sse-multiplex spec should record whichever) · #2
`chat.setUserMacroValues` zero client caller — this IS #24 MU-picks-pane's server half, WIRE-M · #3
`chat.setChatDocumentVisibility` (D85 host databank override) zero caller — WIRE-M · #4
ResolvedWarning = EFF-3 DOORWAY (tracked) · #5 rpg.extraction.* logs-only-by-design · smalls: GroupOutput
declared 4× (dedup-S) · ~24 internal-use-only over-exports (cosmetic-S) · tailwindcss/tsx manifest
hygiene-S. Sweep-method find: TWO repo files carry stray NUL bytes (transcript.ts, markdown policy
test) flipping grep to silent binary no-match — `grep -a` required; two false orphans corrected.

**MERGE TRAIN DONE (MP `90409adb` + TIDY `0c2e52e6` merged, certified; ghosts cleared; merged
worktrees pruned). REMOTE DELETION BLOCKED + TOKEN DRIFT FOUND:** `git push origin --delete
retro-burn-down` failed on verify:push — tests:node red: TWO D71 token-pipeline tests (theme.css
hand-edited by the Waystone lane [12 --color-sky-* + 3 motion tokens] and my 30vw panel edit instead
of the tokens.json pipeline; sky tokens unclassified in the three-class partition). check-is-static
gap: no commit gate runs tests. FIX LANDED `30cc434d` (sole real drift was the 30vw clamp — sky/motion tokens were already pipeline-sourced, only theme.css was stale; sky family classified STATIC_RATIONALE; panel measured 384px→120px stone at 1280 ✓). Was: fix lane `a3b2e764fdb990032` (main) — move values into the
pipeline source + regenerate + classify, owner-approved semantics preserved. DELETION DONE (2nd detached run): origin/retro-burn-down removed; verify:push GREEN in 665s — a full push-grade certification of current HEAD as a side effect. Origin = main + legacy-main only. Branch-hygiene thread CLOSED.

**OLD MERGE QUEUE (done):** 1) `wt/agent-aa010e6ca404b138a`
(MP done `90409adb` — grouped picker + curated-fallback notice; lesson: new data-testid must register in
test-ids.ts, gate only fires in structure:full) · 2) `wt/agent-ab95fa9827638dfbf` (TIDY done `0c2e52e6` —
66 mocks → docs/design/mocks, reviews → docs/reviews, agent defs repointed, crunchy DESIGN.md RESCUED
from untracked; owner BLESSED the biome mocks exclusion) · 3) after TIDY merge: DELETE the stale
untracked dupes in main's reports/ (crunchy DESIGN.md, 2 stickler, appsettings, marinara audit,
user-macro spec — they became tracked copies in docs/) · 4) detached
`setsid nohup git push origin --delete retro-burn-down` (OWNER AUTHORIZED; contained-in-main VERIFIED;
first attempt died at a 2-min timeout — the pre-push hook runs ~10min even for deletions; use the
overnight detached+watcher pattern) · then CARD-2/TRK-1/PREV merges as they land.

**Waystone: owner-approved state** (night sky + lit homestead + vivid bands + needle + numeric hour +
weather label all landing). Two OPEN card issues (CARD-2 owns both). Push word SPENT at `b87ec743`;
everything since is LOCAL commit-only. Owner decisions pending: the three spec docs' flagged sections
(SSE §14 · SET-SEAMS §10 · DENSITY §7 D1–D10) — morning review stack.

## ═══ (superseded wave table below) ═══

| Lane | Where | Scope |
|---|---|---|
| **TRK-1 — Tracker unification stage 1 (server core)** | worktree | contracts TrackerDef + value storage (spec §5, no-legacy clean break) · db schema (drop hud_widgets, R4c journal-custom) + baseline regen in-worktree · apply path · R6 per-actor-aware tool assembly + R2 templated descriptions + R5b (conditions in refEnumerationLines, delta gloss) · reminder one-gloss-path. Client editors = stage 2 AFTER. |
| **MP — model picker** | worktree | MP-1 provider grouping · MP-2 visible curated-fallback state |
| **CARD — card collapse** | worktree | RV-1 collapse control in chat · RV-2 cards renderable in Scene tab |
| **TOD — time-of-day ranges** | main (running) | band starts = period starts; label derivation consolidated to one home |
| **SPEC×2 — SSE multiplex + SET-SEAMS** | docs-only | full design docs to docs/design/, spec-first per rulings, aware of each other |
| Next wave (queued): Preview rebuild D-4 · EFF-3 warnings surface + effective-delivery freshness · smalls (AU-5 kill, VER-1 guards) · Tracker stage 2 (GM editor + Status absorption + Sheet dissolution) · workloads exit |

**Open from the night:** UI stretch order ruled:
Waystone → model picker → card collapse → Preview · VER-1 routed findings · EFF-3 (warnings client
surface + effective-delivery freshness) · AU-8 hunt-A backlog · **settings-registry migration DONE-as-scoped** `21abdc42` (merged): the registry pattern was
already 90% there (nav/search/shell derive from SettingsPaneRegistry); the one foreign straggler
(library page-size) migrated to features/character via the new `appearance` anchor. TWO principled
stops recorded in [[settings-section-seam-body-only]] — and then **SUPERSEDED BY OWNER DIRECTION
(08-01): the SET-SEAMS program.** Settings' end-state is the skim-the-seams doctrine (the workloads-exit
philosophy applied here): every section becomes SELF-OWNED (own read + own write via section-scoped
patches — `updateUserSettingsSection` is the existing server mechanism; tonight's migrated library
section is the proof-of-shape), the autosave-welded panes DECOMPOSE properly (designed per-section
saves, not N racing blob patches), features host their own sections and contribute them at anchors,
and the settings shell becomes a pure skimmer. Includes the O3 amendment (tags/regex re-home into
proper feature homes as part of the program, superseding "settings keeps them"). SPEC FIRST — a real
design pass (per-section save UX/status, section-patch schema discipline, the anchor map); joins the
big-lane queue: Tracker unification → SSE multiplex → workloads exit ∥ SET-SEAMS (same doctrine
family — spec them aware of each other).

**⚡ TONIGHT'S STANCE (owner, 2026-07-31 pre-overnight, verbatim intent):** "if it isn't wired
properly, do it RIGHT even if it means more work — no half measures, no shims, no whatever. If you
need to delete the db then do it." Applies to every lane tonight: dead knobs get BUILT not flagged,
e2e reds get root-caused as app defects first, schema fixes may regen the baseline + wipe the dev DB.

**2026-07-30 late session — the fidelity audit (owner dogfood concerns):**
`docs/design/context-panel-fidelity-findings.md` is the new verification target for W-H/#1 — meta-tabs
vs mocks (Preview tab = worst gap, screenshot-proven), model-roles picker findings (MP-1/MP-2), the
This-chat IA verdict, owner decisions D-1…D-4. Owner rulings pinned same session: **crew = DEAD scope**
("we are not doing crew" — zero crew code exists; shipped comments citing it are proposed/-doc drift);
**rpg-lite = narrative steering device, NOT a dice roller, takes NO GM slot.**

**Engines are AWAKE** (embed/rerank/gen; gen = `Qwen3-VL-8B-Instruct`, port 8703, spawned
`--enable-auto-tool-choice --tool-call-parser hermes`). `pnpm engines:sleep` to park.
Dev stack posture from 07-29: server `:8788` `adopt-or-start` + `WIRE_CAPTURE=on DEBUG_TOKEN=dbg` ·
vite `:5173`; `pnpm stack restart --force` is the sanctioned re-env ([[dev-stack-fights-host-automation]]).

### Tonight's queue (ordered — rationale in §ORDER)

| # | Item | Lane | Size |
|---|---|---|---|
| 1 | ~~**R4b**~~ LANDED `7604bd6f` + **LIVE-VERIFIED** (`steer-probe-real.ts` through the real `buildLiteReminder`: Δ −1.13 mean / −2.33 last-3 — §4d reproduces on production) | server/rpg | done |
| 2 | ~~**R5a + R5**~~ LANDED `7d0e6f60` (enum bind + ghost guard, one-homed predicate) | server/rpg | done |
| 3 | ~~**OR-1…OR-4**~~ LANDED `e39418d7` (1h ttl on the true wire · real pin `allow_fallbacks:false` · type-sealed ttl guard · isError drop loud on BOTH dialects) | server/providers | done |
| 4 | ~~**W-I / D111**~~ MINTED (registry + laws index) | docs/law | done |
| 5 | ~~**R1**~~ **BUILT** `940969f6` — `extractionMode:"folded"` + the terminal-tools primitive; second call provably gone; degrade matrix tested; freshness lie fixed; **D112 MINTED**. Verifier pass in flight. Fallback-arm freshness gap → EFF-3. | server/rpg+chat | done |
| 6 | **R6 + R2** per-game tool assembly, gating at the schema, templated descriptions | server/rpg | **L** |
| 7 | stretch: **R4c** journal `custom` escape (needs a migration) | contracts/db | M |

## ═══ ▶▶▶ OPEN THREADS — THE COMPLETE REGISTER (2026-08-01, audit-restored) ═══

> Owner asked "100% everything on the board?" — an audit found my snapshot rewrites had DROPPED
> threads. This register is now the canonical open-thread list; keep it current.

**BIG-LANE QUEUE (all spec-first, specs written):** ① TRACKER stage 1 IN FLIGHT (`ae441b0805535fe2e`
wt) → **stage 2 QUEUED**: unified GM-tab Tracker editor + Status-absorbs-Sheet (expand = full-takeover
sheet view) + Sheet-tab dissolution + RV-8 CRUD primitives (spec `docs/design/tracked-field-unification.md`)
② **SSE MULTIPLEX** — spec at `docs/design/sse-multiplex-spec.md`; OWNER DECISIONS §14 (SSE-vs-wsLink
fork · presence-moves-to-socket behavior change · impersonateStream exemption · hygiene numbers)
③ **SET-SEAMS** — spec at `docs/design/set-seams-spec.md`; OWNER DECISIONS §10 Q1–Q6 (tags/regex homes ·
system+admin merge · status UX · sub-deep-links · UNCLAIMED keys registry · app-shell vs features/appearance)
④ **DENSITY PASS** — spec at `docs/design/density-pass-spec.md`; OWNER DECISIONS §7 D1–D10 (rounded-card
demotion · Card.padding retirement · paddings/ratios) ⑤ **WORKLOADS JUNK-DRAWER EXIT** — headline lane,
investigation ready at `docs/reviews/stickler/2026-07-25-workloads-junk-drawer-exit.md` (seam/skim).

**EXT-4 (from the 08-01 tool-coverage audit — queued AFTER TRK stage 2 merges; touches tools.ts/apply.ts
which stage 2's max amendment also edits):** (a) reliable-mode whole-object `safeParse`
(`compose/rpg.ts:517`) drops ALL SIX planes on one bad nested field — make it salvage per-plane (or
per-entry) like the per-call validation cheap/folded already do; the three delivery paths should carry
EQUAL drop semantics. (b) journal `[].type`/`content` sit in the same xgrammar nested-required blind spot
that bit `title` (title was fixed; these weren't) — same treatment. (c) quest objective completion:
`upsert_quest.update` carrying `objectives` remints all flags `completed:false`; give the model a way to
mark an objective done without wiping the rest (merge-by-match preserving completed, or a completed field
on the objectives arg) — small design decision at build. Full matrix + receipts in the audit report.

**BUILD ITEMS QUEUED:** PREV in flight (`aa855bb2e7ac7e9d3` wt) · EFF-3 warnings client surface +
effective-delivery freshness (D112 gap + ResolvedWarning DOORWAY) · #24 MU-picks pane (server half =
`chat.setUserMacroValues`, AU-8 #2) · `chat.setChatDocumentVisibility` wire (AU-8 #3, D85) ·
`automation.stream` WIRE-vs-DOORWAY (AU-8 #1, OWNER CALL) · VER-1 leftovers: (a) swipe-lineage
duplicate fold-base (own ticket) · (b) tool-only prose-less completions guard (design item) ·
(c) custom-byo tool-result `isError` silent drop (OR-4's sibling) · smalls batch: GroupOutput dedup ·
~24 over-exports strip · tailwindcss/tsx manifest hygiene · `resolveAgentSdkAlias` unreachable-branch
look · MP footer "from config" mildly untrue on curated fallback · AU-10 background-library manage UI.

**W-H FULL SIDE-EYE (after TRK stage 2):** the panel-beauty §4.2 list + Scene-tab refinement (RV-2's
second half) + lightbox nested-dialog oddity + icon-only meta-tabs at narrow widths + mock fidelity
re-verify (`docs/design/context-panel-fidelity-findings.md` is the target).

**DISCUSSION PILE (owner, no build):** ☰ chat-options placement sketch (D111 clause OPEN, breaks
nothing) · persona=character design pass ([[persona-pin-prompt-resolution]] — anchor-vs-active,
host-chosen {{user}} VERIFY, per-persona state cost) · Meteocons artwork-fork optional ticket (~8
icons under MIT, currentColor + CSS motion rewrite) · D22 member-tiers live verification (needs the
multi-user e2e stack) · #16 engine auto-sleep/wake live pass (optional) · spike probes F2 (card
frequency) / F4 / F4a (effort-vs-cache on OR wire) / F5 (OR effort translation → native-skin question).

## ═══ ▶▶▶ THE BOARD — the single backlog ═══

Every open item lives here. Design lives in the cited doc; this table is the index + status, not a
re-statement. **ID conventions:** `R*`/`F*` = rpg-extraction spike · `OR-*` = OpenRouter findings ·
`W-*` = crunchy-cluster waves · `#n` = the original numbered punch list · `RV-*`/`D-*`/`MP-*` =
context-panel fidelity audit + owner review (`docs/design/context-panel-fidelity-findings.md`).

### A. RPG extraction — the fold (doc: `docs/design/rpg-extraction-one-call-spike.md`)

> Read that doc's header banner FIRST — §4/§4a are **superseded in place** and retained for methodology
> only. R1–R3, R5, R6 stand. R4/R4a are WITHDRAWN (the `removeCondition`/`hpDelta` "gaps" were a test
> artifact: a game that never unambiguously ended a condition, scored per-turn not per-opportunity;
> a purpose-built 12-turn game gets 5/5 retirement recall + 4/4 hpDelta in 6/6 runs with thinking OFF).

| ID | Item | Status | Size |
|---|---|---|---|
| **R4b** | `castFieldSegs` (`server/src/domain/rpg/substrate/reminder.ts:182`) **drops `field.hint`** despite its docstring; nothing else carries it to the model (`compose/rpg.ts:370` passes castField KEYS only). Pools (`:127`) + relationships (`:172`) gloss correctly — cast fields are the odd one out. Measured: bare number moves portrayal **−0.12 (noise)**, glossed **−1.00 mean / −2.33 last-3**, monotonic. **Every host-defined tracked field is currently decoration, not a steering lever.** | **TOP — highest value/effort on the board** | 1 line + test + re-run `steer-probe.mjs` against the REAL reminder |
| **R5a** | Bind `removeCondition` to an enum of currently-active condition names in `constrainExtractionSchema` (mirrors the existing `targetRef`/`widgetRef` binding). The 8B emitted `removeCondition: "Bleeding, Poisoned, Exhausted, Lamed"` — a comma-joined list into a `{type:"string"}` scalar; hermes accepts it. Enum makes the bad shape unrepresentable under xgrammar, free defence on hosted. | open | S |
| **R5** | Ghost-actor guard: reject/drop tool args naming actors not in the live cast. Proven load-bearing — the model treats the ref enum as a MENU and injected "Aldric Vane" from a stale enum. | open | S |
| **R1** | **Fold extraction into the narrative turn** for hosted strong models: one call, GM persona + the existing 7 tools + `tool_choice:"auto"`, keep BOTH `content` (narrative) and `tool_calls` (state); drop the post-commit state round on that path. **~43% cheaper, ~34% faster**, 6/6 turns co-emitted. **Wiring change, not schema.** Build notes in §6: thread `tool_calls` off the narrative completion into `stageStateRound`; a malformed tool arg must NOT fail the turn (errors-as-data, mirror the empty-delta drop); backend-aware gate at `deriveTrackersReadOnly`/the mode branch. | DECIDED, not built | **L** |
| **R2** | Ship enriched tool descriptions + the state-tracking guide (Appendix A). Lifted coverage 33→37/43 distinct fields, +27 field-writes, +$0.008/game. ⚠️ Per R6 these are **TEMPLATES**, not static ship strings — build with R6, not before. | open | M (with R6) |
| **R3** | Keep `reliable`/structured for the local 8B — revised: for **ACCURACY, not capability**. The 8B *can* do the fold (co-emitted 589-char narrative + valid `update_party`, `finish_reason: tool_calls`), but inverted a subtractive case (`addCondition:{Bleeding}` on the beat that ENDS bleeding). Ground truth vs Sonnet: `removeCondition` 0/5 vs 5/5, `hpDelta` 4/4 both, 33/43 vs 38/43 fields. | decided (no build beyond R1's gate) | — |
| **R6** | **Per-game dynamic tool assembly + lock/toggle gating AT THE SCHEMA.** The principle: *the reminder is the model's knowledge, the tools are its permissions.* Read-surface always shows full state (incl. locked); write-surface exposes only enabled-and-unlocked — a locked field is REMOVED from the tool schema, a disabled feature's tool omitted entirely (prevent-at-schema; today's `staging.stage` strip becomes a backstop). Custom def descriptions thread into per-tool guidance, not just plane teaching. | **REQUIRED**, not built | **L** |
| **R4c** | `RPG_JOURNAL_TYPES` is closed (`location·npc·combat·quest·item·event·note`) **with a DB CHECK** (`db/schema/rpg.ts:238,253`) and no `custom` arm — inconsistent with `RPG_RELATIONSHIP_KINDS`, which solved exactly this with `{kind:"custom", label}`. Combat-flavoured on a plane that fires on **79%** of turns, in the genres lite is best at. Fix: keep the enum, add `custom` + free `label`, per-game hints in `config.features` so host types gloss. **Needs a migration — decide before more rows accumulate.** | open, wants a go/no-go | M |
| **R5b** | Follow-ups from the R4b/R5 landing (executor-surfaced, 2026-07-31): (a) `refEnumerationLines` (the prompt fallback for non-enforcing backends) doesn't enumerate active conditions — the matching half of R5a's schema bind, ~2 lines when R2/R6 touch the prompt; (b) `substrate/delta.ts` (CHANGES-SINCE block) renders cast-field transitions UNGLOSSED — same steering argument as R4b. Fold both into the R6+R2 lane. Also noted: `ExtractionRefs` is a 4-way coupled site (interface + constrain body + compose resolve + ~11 test literals; tsc catches all — budget the churn). | open | S |
| **EFF-1** | ~~Effort-preset wiring verification~~ **DONE (scouted 2026-07-31 night): WIRED end-to-end on hosted** — preset `params.effort` (contracts/preset:200) → editor (params-panel.tsx:246, model-real levels, adaptive no-dial) → `foldGenerationParams` (pipeline.ts:277) → `resolveChat` (quality fallback + mandatory/allowlist clamps) → OR `reasoning:{effort}` (kit/reasoning-budget.ts). rpg turns inherit via the shared pipeline, no bypass in compose/rpg.ts. R1 consumes the preset, nothing to build. **Two follow-up gaps → EFF-2/EFF-3.** | done | — |
| **EFF-2** | ~~custom-byo resolveChat unify~~ **BUILT + MERGED** `f7113ae0`: plain-path byte-compat pinned whole-body; `reasoning_effort` scalar (not OR's nested object) emitted only when capability-enabled; budget/off-allowlist drops LOUD; customParameters still win (BYOK). Companion domain fix `28e0892a` (logitBias joins staticProfile's full-sampling claim). | done | — |
| VER-1 | Verifier-routed (R1 CONFIRMED; not R1 defects): (a) **swipe-lineage duplicate fold-base** — `extractionBase` resolves without `regenMessageId`/exclude, so a re-fold on a new variant duplicates beats; PRE-EXISTING across all three vehicles — own ticket; (b) **tool-only completions** — `auto` permits prose-less completions and the engine has no empty-content guard (design item, spike-accepted risk); (c) custom-byo `role:"tool"` wire drops `isError` SILENTLY (OR-4's unbuilt sibling); (d) latent `QUALITY_SAMPLING[quality]` TypeError if an untyped quality ever reaches resolve-chat.ts:84 (unreachable typed; cheap guard). | open | S–M |
| **EFF-3** | **`ResolvedWarning` is a dead-ended pair (D107 class):** produced server-side on every degrade (mandatory clamp, allowlist clamp, adaptive-budget-ignored) and consumed by ZERO client code — degrades are invisible. The owner's "recommend, don't force" flag = build the client surface for these warnings (+ GM-tab note when the game connection resolves thinking-off). | open — tonight if runway | M |
| **F2** | Immersive `:::card` was rare across ALL spike methods (0/6 for the winner, and also 0/6 for the pure narrative call) → points at prompt/seed, not tools. Own investigation. | open | ? |
| **F4** | Do the enriched descriptions still hit the prompt-cache prefix? (+$0.008/game is trivial; the per-turn input growth is the question.) | open | S |
| **F4a** | Does an `effort` change bust the cache **on the OR wire**? Anthropic documents effort as rendered into the prompt; our path goes through the OpenAI-compat shim. Decides whether per-turn effort variation is merely inadvisable or ruinous. Cheap: two requests, identical cached prefix, differ only in effort, read `cache_read_input_tokens`. | open | S |
| **F5** | How does OR translate `reasoning:{effort}`, and is native depth reachable at all? Try raising `max_tokens` and OR's `reasoning:{max_tokens:N}` form. **If neither reaches native depth, any recommendation depending on deliberation is capped by the wire** — which re-opens the "migrate to the Anthropic skin" branch §7a currently dismisses. | open | M |
| F1c | The §4 A/B's ±1–2 single-field rows sit under a **15/43-fields variance floor**. Ship the enrichment; never quote individual row deltas. Cheap fix if ever needed: 3 runs/arm, report medians. | posture, not work | — |
| F3 | Hosted structured would need a lean all-required union-free schema under Anthropic's strict caps (24 optional / 16 union / "grammar too large"). Documented so nobody re-discovers the wall. | not needed | — |

### B. OpenRouter provider layer (doc: `docs/design/openrouter-provider-findings.md`)

> Sealed section `packages/server/src/infra/providers/backends/openrouter/`. **Applies to every hosted
> chat turn, not just rpg.** None applied. Decided AGAINST (with reasons, in the doc): migrating to
> `@tanstack/ai`; switching to OR's Anthropic `/v1/messages` skin.

| ID | Finding | Fix | Impact |
|---|---|---|---|
| **OR-1** | **`ttl:"1h"` IS honored on the OR wire with no beta header** — `kit/cache-control.ts`'s comment saying it needs one is WRONG. Proven by the write-price multiplier (1.25× = 5m, 2.0× = 1h). | 1 field | ~$0.018/turn on a 10k prefix; pays for itself the first time a session goes quiet >5 min |
| **OR-2** | **The Anthropic pin doesn't pin** — `{order:["Anthropic"]}` with `allow_fallbacks` defaulting true; a probe leaked Anthropic→Bedrock→Azure→Google. | `allow_fallbacks:false` **or** soften the comment (interacts with `resolveFallbackModels`) | correctness of a stated guarantee |
| **OR-3** | **An invalid `ttl` silently disables caching** — `ttl:"9z"` → 200 OK, zero cache, 10× cost, no signal. | validate at the seam + warn loudly | D41 no-silent-degrade |
| **OR-4** | **`isError` on tool results is silently dropped** (`runners/chat/shared.ts:91`) — the wire has nowhere to put it. | `tool_result_error_dropped` warning alongside `verbosity_dropped` | D41 |
| **OR-5** | Cache breakpoints count **array offsets, not role switches** — `toolResultMessages` fans one turn into N wire messages, so the caller's depth skews on tool-heavy turns. Confirmed harmless-but-wrong (a breakpoint on a `role:"tool"` row is accepted). | small | under-caches quietly |
| **OR-6** | OR under-drives `effort` **3–6×** vs native (`high` 297 vs 1858 thinking tokens; OR `max` returned ZERO tool calls). | none — know it | scopes every effort claim to OR; = **F5** |
| **OR-7** | Reasoning never round-tripped (`signature` dropped; no reasoning arm on `ChatContentPart`). Measured: **dropping is safe; replaying wrong is a hard 400.** Payoff is agentic continuity, unquantified. | contract change | lowest priority |

### C. Crunchy-cluster leftovers (doc: `docs/design/mocks/crunchy-cluster-redesign/DESIGN.md`)

Most of that design landed (extraction-rides-transcript W-B, fork-clone + host-or-sole-human gate W-F,
dangling-pointer heal W-G, wand v2) and is pushed @ `adec7490`. Still open:

- **W-H panel-beauty** — the §4.2 mock-convergence punch list (dead space · tiny Waystone · asymmetric
  roster cards · duplicate orb numbers · header hierarchy · bar-color grammar). Was gated on "owner
  dogfood populating panels" — **that gate is now CLEARED** (hosted Sonnet 4.6 populates; see §LANDED).
  Runs a side-eye pass, fix ALL findings ([[side-eye-fix-all-findings]]). Mocks:
  `docs/design/mocks/panel-redesign/DESIGN.md`. **Audited statically 2026-07-30:** findings, per-tab
  gap table, and owner decisions D-1…D-4 in `docs/design/context-panel-fidelity-findings.md` — that doc
  is the lane's verification target. Headline: **Preview tab is the worst gap** (screenshot-proven —
  mock's context-budget bar + per-source token breakdown never built; needs new ui primitives, D-4);
  model-picker MP-1 flat pile / MP-2 silent catalog-fallback swap ride the same lane. First lane step:
  reproduce every sighting on :5173 (stale-:8788 suspect).
- **W-I / D111** — mint the D-ledger entry for the crunchy-cluster redesign (deception→tracker ruling A,
  extraction-transcript, wand map, fork-clone). **D111 is the next free number.** Cheap, closes debt.

### C2. Owner dogfood review 2026-07-30 (doc: `context-panel-fidelity-findings.md` §6 — RV-1…RV-15)

The owner's comprehensive current-state pass. Extends W-H/#1 well beyond polish — grouped by lane:

| Group | Items | Nature |
|---|---|---|
| Chat surface | RV-1 card collapse · RV-2 cards-in-Scene + refine | build, chat/client |
| Panel CRUD program | RV-4 attributes add/rename/edit+hints · RV-5 inventory add/edit + surface `location` · RV-6 journal/quests manual add/edit · RV-12 stat-profile editing · **RV-8 the primitive set first** (add-row / inline-edit / hint-editor) — everything above consumes it | build, client+server verbs where missing |
| Fidelity/polish | RV-3 Sheet pills · RV-7 Map "coming soon" · RV-10 Waystone animation + full time×weather matrix ("does not read as a clock") | W-H side-eye lane |
| Read-half steering | RV-9 Waystone steering text (R4b class) · RV-4's hint-to-reminder verify · RV-11 surface the guide schemas (clothes/thoughts — schema exists, zero UI; check both ends) | server/rpg |
| **RULINGS (settled)** | **RV-13** freeform demoted — d20-in-lite properly editable is the direction, + branch-and-save custom modes derived from prebuilt d20 · **RV-14 SUPERSEDED** by the tracked-field unification (`docs/design/tracked-field-unification.md` — pool/cast-field/widget = ONE def with axes; the name ships with the merge) · **RV-15** `__orb.seed` output is NEVER verification evidence (hid rot + dual-homing) — verify against model-populated games | posture/direction |

RV-13 and the CRUD program change R6's shape too: per-game tool assembly must cover host-EDITED
d20-derived profiles, not just seeded freeform — build them aware of each other.

### C3. Wiring audit 2026-07-31 night (owner-directed pnpm-ast/knip sweep; snapshot — re-sweep before acting)

11 confirmed zero-client-caller tRPC procs across rpg/settings/connection. Triaged:

| ID | Finding | Verdict | Size |
|---|---|---|---|
| AU-1 | ~~external background~~ **BUILT** `1b1da37b` (worktree, merge pending). Audit premise corrected: "URL" was DELIBERATELY filtered from the select (BG-C: external = transient input, never persisted paintable) — the real gap was the verb + `backgroundLibrary` having ZERO writers. Built: URL row in the Upload branch → `addExternalBackground` → library append + live-select; leak-free inline refusals. | done | — |
| AU-2 | ~~journal CRUD~~ **BUILT** `ba951deb` (RV-6 closed: composer type+title, in-place body authoring — the ≥3-field form gate steered the design — inline edit, confirmed delete, entry TYPE now rendered; host-only per the verbs, members get permission-omit). Pixel pass caught + fixed a 320px-rail overflow. | done | — |
| AU-3 | ~~quest delete~~ **BUILT** `ba951deb` (ConfirmDialog, `canEditShared`) | done | — |
| AU-9 | ~~uploads → library~~ **RULED yes + BUILT** `4a5150d9` (worktree): uploads mint a full `BackgroundLibraryEntry` (mime + derived name), one `addBackground` handler serves upload+URL arms; real-bytes CT. | done | — |
| AU-10 | Follow-up: no library browse/rename/remove UI in Appearance (add-and-select only). | open | M |
| AU-4 | rpg widget CRUD verbs unwired | SUPERSEDED — Tracker unification drops the subsystem; build NOTHING | — |
| AU-5 | `connection.getModelCapability` — refactor leftover | KILL (owner no-objection 07-31 night; small commit + sweep-classification touch) | S |
| AU-6 | `settings.get/setGlobalSetting` — **RULED: DOORWAY** (ops/CLI escape hatch; cite as sanctioned-dormant, no build) | ruled | — |
| AU-7 | `rollDice` — model-tool surface, not a client gap | no action | — |
| AU-8 | HUNT-A backlog: 73 unused exports + 12 types from knip:prod UNSCREENED; bus-member/contract-field/warning-sibling sweeps not started | open — future audit session | L |

- **#24 MU picks pane** — VERIFIED NOT BUILT (no in-chat user-macro picks UI). Typed macro inputs
  resolve to defaults until it lands. Design = extend the ChoiceBlock variables pane
  ([[mu-store-flat-vs-nested-wall]]).
- **#1 meta-tabs redesign** (settings / injections / preview) — statically audited 2026-07-30; no
  longer uncertain: the This-chat merge IS the intended IA (CP-1, newer mock wins), but **Preview never
  landed its design** and This-chat carries unreviewed deviations. Full gap table + D-1…D-4 =
  `docs/design/context-panel-fidelity-findings.md`; folded into the W-H lane above.
- **D22 sub-`full` member tiers** (name-avatar / sheet / +lore + HiddenTierNote) — code + CT verified,
  **NOT live**. Needs a multi-user NON-host view; the 1:1 dogfood chat can't expose it. Fold into the
  next multi-user E2E ([[e2e-live-verification-facts]] — needs Playwright's own adopt-only stack).
- **`permitsHost` dead-code purge** (`auth/decide.ts`, true orphan) — go/no-go, owner call.
- **#16 engine auto-sleep/wake live pass** — optional polish, already characterized
  ([[vllm-sleep-fleet-facts]]).
- Flakes/facelift micro-ledgers · grimstone theme — **owner: skip/park (07-31)**.
- UI-stretch order (owner: "pick the order, all important"): Waystone RV-9/10 → model picker MP-1/2 →
  card collapse RV-1/2 → Preview D-4.

### E. OWNER DECISIONS — the 2026-07-31 late-night Q&A RESOLVED nearly everything

**RULED (recorded in the cited docs):** noun = **TRACKER** · unification spec §5 APPROVED (widgets
full-fold + table drop; appliesTo classes) · **R4c GO — batched into the unification baseline regen** ·
D-1 split host-ops subgroup · D-2 converge injections to mock (adds an `enabled` flag) · D-3
beat-notifications DEAD · D-4 Preview rebuild GREENLIT · `permitsHost` KEEP (doorway, not purged) ·
**push word GRANTED for ONE end-of-overnight-run push, only on check+battery green** · effort/gen
settings are PRESET-OWNED, global, never feature-forced ([[gen-settings-are-preset-owned]]) — R1
consumes the preset; add an effort-wiring verification + optional GM-tab recommendation flag ·
e2e stretch = existing-suite-green (multi-user harness already exists — `scripts/dev/multi-user-*`).

**STILL PARKED:** persona=character (#3) — owner's 07-31 thinking captured in
[[persona-pin-prompt-resolution]] (anchor-vs-active, host-chosen {{user}} needs VERIFY, per-persona
state retention cost); wants a design pass, not ruled.

**SCOPED OUT (owner):** rpg game-data macro fields (quest titles / pool hints / widget labels) do NOT
render macros — deliberate, not a bug.

## ═══ ORDER — why tonight runs in that sequence ═══

1. **Commit first.** Dirty tree + any build lane = gate-thrash; and the spike analysis is currently
   one `rm` from gone.
2. **R4b before anything else in rpg.** One line, and it's the difference between host-defined tracked
   fields *steering the story* and *decorating the panel* — i.e. between lite doing its job and not.
   Also the cheapest possible proof the read-half of the loop works end-to-end.
3. **R5a + R5 next** — same file neighbourhood (`constrainExtractionSchema` / extraction refs), both
   small, both harden the write surface **before** R1 widens it. Doing them after R1 means touching the
   same seam twice.
4. **OR-1…OR-4 as one self-contained commit** — disjoint from the rpg lane (sealed providers section),
   small, and OR-1/OR-3 are live money. Serialized rather than parallel per
   [[concurrent-main-lanes-gate-thrash]]; if it's worth parallelizing, worktree-isolate it
   ([[worktree-isolate-concurrent-lanes]]).
5. **W-I/D111 here** — 20-minute debt closure, and the ledger entry wants to exist before R1 mints
   another one on top of it.
6. **R1 is the big one** — do it with a clear tree behind it and the write surface already hardened.
   Ends with a `verifier` pass on the fold seam (graceful degrade is the risky half: a malformed tool
   arg must never eat the narrative).
7. **R6 + R2 together** — R2's strings are R6's templates; shipping R2 static first is guaranteed
   rework.
8. **R4c only if the above lands and the go/no-go comes back yes** — it's a migration, and migrations
   are the one class where "do it at 3am unattended" earns extra scrutiny.

**Parked out of tonight's serial lane on purpose:** W-H/#1 (a side-eye UI lane — genuinely concurrent
with the server work, so it gets a worktree or a different night), D22 (needs a multi-user E2E stack),
#24 (fresh feature, not a leftover), F2/F4/F4a/F5 (probes — cheap, but they spend live money and
answer nothing that blocks tonight's builds).

## ═══ LANDED (recent, newest first — one line each; git log has the detail) ═══

**Committed, NOT pushed (13 commits, each whole-tree green):**
- **Extraction spike + OR findings** (2026-07-30) — see §THE BOARD A/B. Net: R1 decided, R4/R4a
  withdrawn, R4b found, R5a found, 7 provider defects catalogued.
- **Hosted-model dogfood resolution** — owner's "hosted Sonnet won't populate panel / do cards" was ONE
  bug: `roleDefaults.chat = {source:"vllm", model:"anthropic/claude-sonnet-4.6"}` (model-leak residue)
  → local vLLM asked for a Claude model → **404, nothing generated**. NOT capability/catalog/readonly
  (all red herrings chased before reading the console). Fixed live via
  `settings.updateUserSettingsSection`; hosted Sonnet 4.6 then generated, rendered the immersive HTML
  card, and populated the panel. **Lesson: fire a turn + read the console FIRST**
  ([[hosted-model-diagnose-console-first]]).
- Model-capability / catalog-cache class — `c656bc1b` curate claude-sonnet-4-6 · `c40dbe45` OR catalog
  cold-cache degrade (boot-seed + TTL 1h→week) · `b3721735` agent-sdk sibling
  ([[or-catalog-cold-cache-degrades-capability]]).
- Connection model-leak `385dba8d` — provider switch omitted the empty model key; deepMergePlain kept
  the stale value. Now emits `model: null`.
- Swipe duplicate-row `7bddf96f` · **"This chat" tab** `8e7a22b6` + side-eye polish `ef1aacdd` ·
  composer keystroke no longer re-renders the thread `6ce5a4c6` · CT nested-submenu flake `d4f7e805` ·
  LoAF migration `fe66520f`.

**Pushed:**
- Live-dogfood verification pass (#54/#55 send-availability both directions; impersonate closed E2E on
  the live 8B via wire capture; #57 HMR no-strand; `--force` cold-spawn timeout `f81e56d9`).
- Impersonate / guided-macro saga (`23bcfe62`, `22ec5de7`, `b7ad92df`, `caf8f7e6`) —
  [[nudge-macro-substitution-seam]], [[identity-macro-resolution-is-chat-owned]].
- D22 member-card-viewer (`29f25983`/`bceac4e3`/`8dada55b`/`82a8a97a`) · #56 `pnpm stack --force`
  (`ce46540e`) · #57 HMR-login strand fix (`4020790c`).
- Crunchy-cluster + comprehensive rpg lane (@ `adec7490`) · Parity-plus program (`ecf98497` + follow-ups,
  D109/D110 minted).

## ═══ STANDING FACTS + POSTURE ═══

- **NEVER push to origin** unless owner explicitly authorizes THAT push (per-push, doesn't generalize).
  Default is commit-only. Commit cadence relaxed — batch small changes ([[commit-cadence-relaxed]]).
- **Overnight/full-auto is a NORMAL mode here.** vLLM engines + the dev stack are PRE-AUTHORIZED —
  start/stop/restart freely, detached (`setsid nohup … & disown`). NEVER emit a blocking question for
  anything already authorized. Stuck → the ESCALATION LADDER: stickler pass → read the code with
  `pnpm ast`/ast-grep → search `docs/` → judge against maximal / do-it-right-ONCE / avoids past burns /
  repo strictness. Stand down only if ALL of that fails, and write the dilemma here
  ([[overnight-full-auto-posture]]).
- **`pnpm check` = STATIC only** (no tests); read `reports/verify.json`. Battery (`pnpm test`) is
  separate. `verify:push` (pre-push) is a superset: check + tests:node(fresh CT) + e2e-smoke — have the
  stack up first ([[verify-push-stricter-than-commit-gate]]).
- **SERIALIZE main-tree build lanes** — 2+ concurrent lanes cause gate-thrash + index collisions
  ([[concurrent-main-lanes-gate-thrash]], [[work-directly-on-main]]); worktree-isolate genuinely
  concurrent big lanes ([[worktree-isolate-concurrent-lanes]]).
- **Worktree setup is AUTOMATIC — nobody has to remember it.** `EnterWorktree` (and subagent
  `isolation:"worktree"`) fires the `WorktreeCreate` hook → `.claude/hooks/worktree-setup.sh`, which
  creates the worktree on `wt/<name>`, runs `pnpm install`, and symlinks the gitignored
  `settings.local.json` in. `ExitWorktree`-remove fires `worktree-remove.sh` (scoped to
  `.claude/worktrees/`, deletes only `wt/*` branches). ⚠️ **Configuring `WorktreeCreate` REPLACES the
  built-in creation** — the hook owns it, and **stdout IS the worktree path** (anything else printed
  becomes a bogus directory). Payloads (probed, undocumented): create gets `{cwd = MAIN checkout,
  name}` and NO path; remove gets `worktree_path` with `cwd` = the worktree. `ExitWorktree` may say
  "could not verify worktree state" and need `discard_changes: true` — expected, since the harness
  did not create it.
- **Worktrees are cheap on their own — `git worktree add` + `pnpm install`. MEASURED 2026-07-30:
  2.06 s install, 48 MiB real disk.** The 1.9 G `du` is apparent size: default pnpm HARDLINKS every
  file from the content-addressable store (`~/.local/share/pnpm/store/v11`), verified same-inode
  across main + worktree + store. Requires only that worktrees sit on the same filesystem as the
  store — `.claude/worktrees/` does. `CI=true` is needed for a non-interactive re-install (pnpm
  otherwise aborts purging `node_modules` with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`).
- **⛔ Do NOT set `enableGlobalVirtualStore: true`.** pnpm's own multi-agent-worktree recipe
  (https://pnpm.io/git-worktrees) recommends it; **it breaks this repo's gate deterministically** —
  tested clean-install both arms, reproduced twice. ON: `lint:biome` (50 errors), `lint:eslint`,
  `types:packages`, `types:graph`, `types:tests-dom` all FAIL. OFF: whole-tree green.
  **Mechanism:** it replaces the local `node_modules/.pnpm` with symlinks into the global store, and
  TypeScript resolves realpaths — so from `<store>/links/@/echarts-for-react/<hash>/node_modules/…`
  the walk-up for `@types/*` exits into the STORE instead of reaching the hoisted
  `node_modules/.pnpm/node_modules` fallback that carries `@types/react`. React types go unresolved
  → `'ReactEChartsCore' cannot be used as a JSX component` / dnd-kit loses its `children` prop, and
  every type-aware biome/eslint rule then sees `any`. Upstream: pnpm#9739. It buys nothing anyway —
  48 MiB and 2 s is already the floor. Worth stealing from their recipe: symlink `.claude/` into new
  worktrees so agents share settings/approved commands.
- **NEVER bare `sqlite3` on the live `orbweaver.db`** (deletes WAL, stales readers) — use the app /
  `/api/_debug/*` / an immutable copy ([[sqlite3-wal-danger-on-live-db]]).
- **Wire-capture harness** (the diagnostic lever): `WIRE_CAPTURE=on` + `DEBUG_TOKEN=<t>` →
  `GET /api/_debug/wire/captures?chatId=…` (host-gated, `x-debug-token`), replay `messages` at
  `POST 127.0.0.1:8703/v1/chat/completions` to ablate ([[nudge-macro-substitution-seam]]).
- **Orchestration:** delegate volume (scout/executor/mech-executor/security-executor), keep judgment;
  non-trivial work passes a fresh-context verifier/side-eye before "done"
  ([[fable-5-orchestration-audit]]).
- **Spike harnesses are reusable:** `scripts/probes/rpg-extraction/` — `run-coverage.mjs` (env-driven:
  `SPIKE_ARMS`/`SPIKE_EFFORT`/`SPIKE_OUT`/`SPIKE_GAME=afflictions` for the ground-truth game;
  `SPIKE_LOCAL`/`SPIKE_ENDPOINT`/`SPIKE_MODEL` retarget it at the local 8B and strip OR-only body
  fields), `steer-probe.mjs` (the READ half), `native-wire-probe.mjs` / `effort-ladder-native-vs-or.mjs`
  (need `ANTHROPIC_API_KEY`). Conditional fields are scored against **opportunities, not turns** (§4b).
- **Resume read order:** this block → §THE BOARD → `git log --oneline -15` → `MEMORY.md` (auto-loads) →
  `docs/architecture/core/AGENTS.md` only if touching architecture.
