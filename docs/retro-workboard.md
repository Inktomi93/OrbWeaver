# Retro Workboard — the live board

> **THIS IS THE WORKING DOC** (owner-stated 2026-07-25). Not law, not a deliverable — the durable
> state + work log an orchestrator resumes from cold. Authority for LAW = `docs/architecture/core/**`;
> `docs/architecture/proposed/**` is pre-rollback REBUILD REFERENCE (never cite its status as
> current). **Rewritten clean 2026-07-26 at owner direction** ("rewrite the whole doc") — the prior
> 2,300 lines of session layers live in this file's git history; their load-bearing content was
> promoted to commits, memories, law docs, and the sections below. Keep this file CURRENT-STATE ONLY:
> when a block goes stale, rewrite it — never stack a new layer on top.

## ═══ WHY RETRO EXISTS (read `shitsfucked` in the repo root — the post-mortem) ═══

Main's own ledger, verbatim: *"We are tired of hunting down invisible bugs. **Everything must be
proven.**"* Its two entries: (1) the SSE bus **dropped `turnCompleted`** so `MessageListSurface`
never refetched and the composer **locked forever** — caused by an RPG query storm making React
unmount/remount the SSE subscription; (2) the multi-speaker engine **threw the characters away** so
only the synthetic "Group" character spoke. **Both are the same disease: features that looked done
and silently weren't.** That class keeps being found (the knob-wire audit; the sortable "flake" that
was a real a11y defect) — "drive it live, then pin it" is the posture, not paranoia. Judge every
finding against that frame.

## ═══ ▶ NOW (2026-07-26) ═══

**Active program: LITE-RPG + GUIDED** (owner scope rulings, all final: built FRESH for this tree —
NO porting from legacy-main; NO full rpg mode, NO crew; but the shared spine is FULL-SHAPED so full
mode later only ever ADDS — the graft-map discipline).

**Build law: [`reports/lite-plus-guided-substrate-spec.md`](../reports/lite-plus-guided-substrate-spec.md)**
(committed, owner-RATIFIED; change-log at top). The ratification rulings folded into it:

1. **Total swipe-rewind** — everything the context panel renders is swipe-consistent. Quests live
   IN `rpg_snapshots`; journal is variant-aware (model entries variantId-stamped CASCADE, hand
   entries NULL = every-lineage, reads project the selected chain); a swipe writes NOTHING
   server-side (`variantSelected` → one refetch re-resolves the whole panel).
2. **Preset override is a wired KNOB from birth** (`rpg_games.gmPresetId` FK, NULL = augment the
   user's preset — the default). The spec's §4.11 posture sweep: 8 hardcoded postures found, 2 ship
   as knobs, 6 argued no-knob with recorded upgrade doorways.
3. **Wallet + inventory FIRST-CLASS stored** on every actor ("lite is a steering posture, NOT a
   reduced data model" — the surviving purge-era ruling; the CP money question is closed).
4. **Lite HAS quests + journal as DATA PLANES, not engines** ("just structured output that gets
   generated and can help steer the plot"). The engine set stays out: encounters, session-wrap,
   map (MA-3), d20 checks, GM seat. `rpg_sheets` NOT `rpg_party` (the no-party ruling made schema);
   `rpg_games` is a real table + `chats.metadata.rpg` is an opaque `{gameId}` sync pointer; 6 lite
   tables. D86 re-mints verbatim at land; the carve rulings mint D108+; the spec §5 records the
   CP-doc amendments to apply at land (lite's tab roster gains Quests + Journal).

**✅ W0 LANDED — committed in the same commit as this board update** (spec §6.1 in full:
`@orb/contracts/rpg` 11 concern files + barrel [bus.ts PARKED — see below] · `db/schema/rpg.ts` 6
tables born whole, D23-clean, all CASCADEs/CHECKs int-proven · the baseline regen [71→77,
verifier-diffed PURE INSERTION] · `chats.metadata.rpg` pointer + heal + ChatDetail projection ·
kit id brands · 78 tests). Verifier: CONFIRMED incl. a fresh-build honesty audit vs legacy-main
(no porting — deliberate divergences applied). Wave notes for W1:
· **bus.ts is PARKED until W1c** (G11 refused a bus contract without its belt set — the
  shitsfucked gate doing its job; the barrel carries the PARKED note; W1c re-lands the union WITH
  the coverage gate + stream-hook map).
· **Spec erratum for the D108 mint:** quest ids are `RpgQuestId` (prefix-less branded nanoid, no
  ID_PREFIX entry, stays in-blob) — the no-raw-id gate overruled the spec's "plain string".
· **seed:demo rpg content rides W1** (the seeder writes only through domain verbs — none exist
  until W1b).

**═══ W1 — THE DOMAIN VERTICAL — IN FLIGHT (2026-07-26; UNCOMMITTED) ═══**
W1 is ONE wave (stints W1a→W1b-core→W1b-integration→W1c); it is NOT committed per-stint — the domain
is not gate-legal until compose (`feature-structure` needs the full skeleton+verbs; the composed-real
int test is the proof, spec §6.1). **COMMIT AT W1c only.** The uncommitted tree = the spec
delivery-model amendment (below) + `scripts/check/gates/db-structure.ts` (rpg baseline-rider removed) +
`packages/server/src/domain/rpg/**` + `packages/contracts/src/rpg/config.ts` (extractionMode field) +
`tests/server/domain/rpg/**` + this board. Whole-tree check GREEN except ONE carried knip forward-seam
red (the `RpgContext` op-type exports in `domain/rpg/index.ts`+`contract/service.ts` —
`RpgGetMembership`/`SetPointer`/`ResolveTrackersReadOnly`/`IdMints`/`RpgService`/`RpgStagingStore`; sole
consumer is W1c compose; clears there — do NOT remove/ignore).

**✅ W1a (persistence+staging+locks) LANDED-uncommitted, TWICE-verified.** 4-rung snapshot ladder ·
`ChatTurnId`-keyed Option-A staging accumulator · `applyLockedPatch`. Verifier CONFIRMED the
swipe-consistency ratification pin. Defect found+fixed: per-quest `quests.<id>` locks didn't bite on the
ARRAY (merge hit the array-replace branch) → generic `KEYED_ARRAYS` element-lock (quests→id · inventory→id
· presentCharacters→key registered; **actorState deferred = computed-key forward-seam**); re-verified with
the exploit counterexample.

**✅ W1b-core (8-slot skeleton + 20 CRUD/read verbs + authority matrix) LANDED-uncommitted, security+code
verified + gate-finalized.** 103 tests. **security-executor FOUND+FIXED a cross-tenant WRITE IDOR:**
updateWidget/deleteWidget/editJournalEntry/deleteJournalEntry wrote by a caller-supplied id with NO
`gameId` predicate (host-of-A could rewrite game-B rows) → `and(eq(id),eq(gameId,game.id))` + leak-free
NotFound + a two-game exploit-drive test; rest of the authz model CONFIRMED sound. code-verifier CONFIRMED
the verb logic. Finalized through the whole-tree gates: verbs → group subdirs (each file exports
`create<Verb>`) + per-verb mirror tests; `.suite` reserved for cross-cutting (authority · swipe-consistency).

**✅ W1b-integration — LANDED-uncommitted, verifier CONFIRMED (8/8), whole-tree `pnpm check` FULLY GREEN
(0 reds) + full `pnpm test` battery GREEN (vitest 7558/0 · CT 1453/0 · 0 flakes). The W1a+W1b-core+
W1b-integration tree is fully green — gate-legal, verified, ready for W1c (the only remaining stint).** gather +
`buildLiteReminder` + `ChatRpgOps` runtime + `setRpgPointer` + the extractionMode branch + readonly-axis,
landed-uncommitted. Homes: rpg `chat-ops/{index,gather,flush,tracker-view}.ts` (a subsystem, NOT `verbs/`
— the cross-verb-value-import ban) + `substrate/{reminder,readonly-axis}.ts`; chat
`verbs/set-rpg-pointer.ts`. **`runExtraction` seam APPROVED** (orchestrator): `(input:{chatId, gameId,
turnId, messageId, variantId, baseState}) => Promise<RpgStateDelta>` — `narrationText` DROPPED (W1c's IMPL
reads the beat via connection; rpg supplies base state + the message ref only, staying out of
message-content reads). Empty delta → stages nothing → no redundant snapshot. Narrator-mint content stays
`""` (internal state-carrier, not a scene beat). Branch: cheap+writable → tool-names + guidance-ON;
reliable → no-tools + extraction-at-commit; readonly → no-tools/extraction but the reminder STILL injects
(no silent downgrade). `setRpgPointer` = the WRITE runtime only (metadata arm/parser/projection were W0).
**RpgContext seam W1c wires:** `getMembership` · `setPointer`(→`set-rpg-pointer.ts`) · `resolveRoster` ·
`postNarratorMessage` · `resolveTrackersReadOnly`(pure `deriveTrackersReadOnly` + connection I/O) ·
`runExtraction`. **W1c gains: run the extraction IMPL** (structured-output schema + connection/model call
reading the beat by `messageId`) + the tool DEFS + bus + compose + composed-real int test → COMMIT W1.

**🔄 W1c — SPLIT a/b; owner ruled HOLD the single atomic W1 commit until here (not per-stint).**
**✅ W1c-a DONE — check + full battery GREEN (vitest 7593/0 · CT 1453/0 · 0 flakes), verifier CONFIRMED
(gate bites its real shape).** Landed: the 7 D48 tool defs (`domain/rpg/tools/`) + the extraction schema
(`contracts/rpg/extraction.ts`, DERIVED from the tool arg schemas — proven) + the live-only bus
(`domain/rpg/bus.ts` module singleton + `contracts/rpg/bus.ts` union/belt + `transport/trpc/routers/rpg.ts`
`rpg.stream` + client `RPG_BUS_FILTERS`). NEW gate `rpg-bus-coverage` (count 150→151) with the full ritual:
inline proof + registry row + `__g_rpgbus.ts` STALE fixture (all 5 members DEFERRED → producers land in
W1c-b). `rpg.stream` EXEMPT in the cross-tenant sweep (subscription, per-yield chat-membership gate,
`chat.streamMessages` precedent). **LESSON: gate-file + transport-proc adds red the BATTERY not `check`
(`check-gates.int` + `cross-tenant-sweep.suite` ride `pnpm test`) — verify gate/proc waves with `pnpm test`.**
**✅ W1 VERTICAL CODE-COMPLETE + FULLY VERIFIED + LEDGER LANDED — COMMIT STAGED, HELD FOR OWNER GO
(hold-for-W1c ruling; NEVER push).** Final state: whole-tree check GREEN + battery GREEN (vitest 7608/0
· CT 1453/0/0-flaky) · verifier CONFIRMED all 4 stickler fixes · stickler IDOR class CLEAN. **Ledger
landed** (`Core-Path-Registry.md`): **D86 re-minted VERBATIM** from legacy-main (reserved-range survivor,
domain returned) + **D108 minted** (the retro lite carve + the extraction delivery-model amendment + the
5 carve rulings) + header/blurb/reserved-note bumped + `d-citation-integrity` re-verify in flight.
**Spec** got a no-born-seed change-log note (→ D108). **proposed/INDEX.md NOT touched** — per
[[proposed-is-rebuild-reference-not-our-plan]], proposed/ is frozen main-era reference; D108 + this
workboard are the retro authority. **CP-doc `Context-Panel-Program.md` §5 amendments DEFERRED to W3**
(the CP-4 client wave — edit that blueprint when the client is built + mockup-converged + side-eye'd,
not as part of a server commit; decisions already captured in D108 + spec change-log). **NEXT: on owner
GO → single atomic W1 commit** (server code + tests + ledger + spec note + this workboard; Co-Authored-By
trailer; commit-only, never push). Then W2 transport. — Stickler audit trail (now closed):
Report: `reports/stickler/2026-07-26-w1-rpg-lite-vertical.md`.
IDOR/cross-tenant class = CLEAN (the W1b game-scoping held; a real 2-game exploit drive reads victim rows
back). The 3 confirmed (fixes dispatched to the warm domain executor, task #10; memory
[[rpg-lite-state-loop-gotchas]] banked): **F1 HIGH** — `tools/apply.ts:105` fresh-pool mint `max=delta`
→ a negative pool delta (`-3`) mints `max:-3` (contract `max>=1`), row COMMITS then read throws forever
= canon poisoned (fix: sane mint `max(value,1)` + **validate-before-insert errors-as-data backstop**);
**F2 HIGH** — `resolveActor` mints `cast:<name>` but `tracker-view.ts:94` reads roster refs → party
writes are silent dead writes (fix: resolve name→roster key at apply time); **F3 MED** —
`compose/rpg.ts:79` `hostUserIdOf` picks first-by-joinSeq not `role==="host"` → post-handoff resolves the
wrong human's creds for the reliable extraction (D19 funding) (fix: resolve by role). MISSING TEST CLASS
(the real gap): a flush→`getTrackerView` ROUND-TRIP w/ a negative delta + a roster-actor write — added
in the fix. After fix → scoped-verify → re-run whole-tree check+battery → THEN ledger + commit.
**Ledger/doc land (drafted: scratchpad `d108-draft.md`, gate-safe):** D86 verbatim re-mint + D108 mint +
§5 CP-doc + proposed/INDEX.md → single atomic W1 commit (owner: hold-for-W1c, NEVER push, Co-Authored-By).
Landed in W1c-b: **`entry/compose/rpg.ts`** (`buildRpg` → RpgContext
[db · clock/ids/dice · the chat ops · emitBus→publishRpgEvent · resolveTrackersReadOnly · runExtraction] →
createRpgService → {service, chatOps}; 7 tools registered into `toolUse`; wired in `services.ts` AFTER chat
via a forward-ref delegate [crew precedent] so `input.rpg` reaches the live service). **`runExtraction` IMPL**
= resolve host chat-role connection (`resolveHostPrincipal` + `connection.resolveRole({role:"chat"})`) →
`executor.summarize` with `responseFormat = projectJsonSchema(rpgExtractionSchema)` → parse →
`extractionToStateDelta` (reuses cheap appliers); non-conforming → empty delta (errors-as-data); FAKE
executor/connection in tests, NO live model. **All 5 emits WIRED** → `deferred:{}` emptied →
**`rpg-bus-coverage` MOVED to `UNFIXTURABLE_GATES` + `__g_rpgbus.ts` DELETED** (bus-coverage twin posture;
STALE stays proven by user-bus-coverage). **NEW chat op built: `resolveRoster`** (`domain/chat/verbs/
resolve-rpg-roster.ts` — the 4th op RpgContext needs; compose-wiring silently required a new chat verb, the
tell was rpgChatOps exposing only 3/4). **Composed-real int test** (`tests/server/entry/compose/rpg.int.test.ts`):
cheap turn (REAL createServices → real `update_scene` via `app.toolUse` → real flush → state + bus emit through
the real `publishRpgEvent`) + reliable turn (real `runExtraction` w/ fake executor → parse → stage → flush).
`rpg` added to the `Services` bundle (W2 router reachability). **NEXT after verify: ORCHESTRATOR lands the
ledger/doc deltas** (D86 re-mint · D108+ from the RULINGS below · §5 CP-doc amendments · proposed/INDEX.md rpg
row) → then the single atomic W1 commit (owner: hold-for-W1c). The 7 plane shapes authored ONCE, exposed two ways — D48 tool defs (cheap) + the extraction
structured-output schema (reliable) — + bus (re-land the union WITH its belt set, G11) + compose (wire the
injected ops + `runExtraction` + the connection/model call) + the **composed-real int test** (the proof)
→ **COMMIT W1** (re-mint D86 verbatim; mint **D108+** for the carve + amendment rulings; apply the §5
CP-doc deltas). Then W2 transport (EVERY proc cross-tenant-sweep PROBED) → W3 the CP-4 lite takeover
client (Context-Panel program, mockup-first vs `reports/design-refs/rpg-shell-mockup-v2.html`, side-eye
AFTER convergence).

**═══ THE DELIVERY-MODEL AMENDMENT (owner sign-off 2026-07-26 — in the spec change log) ═══**
State extraction is a turn SEPARATE from narration, KNOB-gated: `config.extractionMode:
"reliable"(default) | "cheap"`. **reliable** = a dedicated post-narration structured-output extraction
turn (state PROVEN to land — the program thesis). **cheap** = inline state-tools on the character turn,
best-effort, honestly labeled (dodges the agent-sdk parallel-tool loss, pain-points §5). Honest-arms keys
on the RESOLVED mode's capability (cheap→`tools`, reliable→`output.structured`); absent → warn +
**manual-steering** (host hand-edits every plane; still steers via the injection; NO silent
mode-downgrade). W1a invariant; W1b branches the gather; W1c authors the plane shapes once, two ways.

**═══ RULINGS THIS SESSION (record at W1 land / the D108+ mint) ═══**
- **No-born-seed:** `createGame` stores NO snapshot; the reads synthesize the default from config when the
  ladder returns undefined — keeps `rpg_snapshots.message/variant` FKs non-nullable (no schema change, no
  baseline regen). Amends spec §2.4/§4.4 ("seeds the born snapshot" → "rung-4 synthesizes the
  born-default"). Pinned by a no-drift byte-identity test.
- **Cross-tenant write-boundary rule:** by-id host verbs MUST re-scope the id to the resolved game
  (`gameId` predicate), NotFound-not-Forbidden — copy `restoreCheckpoint`'s pattern (the IDOR class; a
  90-test-green suite missed it — the security lens caught it).
- **Turnless narrator-mint:** a hand-edit on a turnless game mints a narrator slot to key the first
  snapshot; content currently `""` vs restoreCheckpoint's `"— scene restored —"` — a W1b-integration UX call.
- **Verb/test structure:** group subdirs + per-verb mirror tests; `.suite` only for cross-cutting.
- **Loop reminder:** stints verify SCOPED; the ORCHESTRATOR runs the whole-tree check (it catches what
  scoped lanes can't — the IDOR, verb-naming, cross-graph types, inline-types all surfaced there, never in
  the lane). Two lenses on the load-bearing stint: `security-executor` (authz/trust boundary) + `verifier`.

**Already landed for this program:** the CP-3 tracker block kit — commit `afb3d383` — seven blocks
(`client/src/components/tracker-blocks/`, editable-in-place is the DEFAULT posture, read-only arm =
honest-arms), TrackBar/RingGauge in `charts/meter` (the OLD sealed Meter pair carries the OPPOSITE
role="meter" a11y model — co-homed so the tension stays visible; never mix), the D71
`--color-track-1..6` ramp, 28 CTs, committed mockup-convergence receipts (`reports/snaps/tracker-kit-*`).

## ═══ THE LOOP (standing law) ═══

Lane verifies SCOPED (its tests + per-package tsc + biome on its files; whole-tree gates are
BANNED in lanes) → the orchestrator runs `pnpm check` + `pnpm test` on the QUIESCED tree and READS
the artifacts (`reports/verify.json` · `test-report.json` · `ct-report.json` · `ct-flaky.json` —
exit codes lie) → a fresh-context `verifier` on any non-trivial diff (its brief MUST ban
check-gates.int / check:structure while the battery runs — the `__g_` fixture collision;
[shared-tree-contention-protocol] rule 10) → findings route back to the WARM lane → commit on
green → next wave. Commit messages end with the Co-Authored-By trailer. **Commit-only; NEVER push;
never ask about pushing.**

## ═══ STANDING FACTS & ENVIRONMENT ═══

- Stack UP: server :8788 · vite :5173, single-user auto-authed as the owner. vLLM engines LAZY by
  owner ruling (2026-07-26, "we don't need to turn the engine on if you don't need it") — no
  proactive warm-up; never hand-run engine launchers; supervised `bash scripts/dev/stack.sh
  restart` is the legal path.
- **The next stack restart RESETS `data/orbweaver.db` by design** (two baseline squashes on
  2026-07-26; pre-launch law in `entry/boot/migrate.ts`; boot backs up first + Backrest behind it).
  Contents are re-seedable fixtures.
- **Baseline-regen procedure** (proven 3×; owed by ANY change that moves a derived column DEFAULT —
  e.g. every USER_SETTINGS/APP_SETTINGS version bump with a column derivation): backup → rm
  `packages/db/src/migrations/0000_baseline.sql` + `meta/0000_snapshot.json` → `_journal.json` to
  empty entries → `cd packages/db && npx drizzle-kit generate --name baseline` → biome-format the
  two meta JSONs FROM REPO ROOT → scoped `npx vitest run tests/tooling/schema-baseline-parity.int.test.ts`.
  Quiesced tree only.
- Variant-cache keys were reshaped (`…-q<quality>.webp`): pre-existing cached image variants orphan
  once on demand — cosmetic regen churn, no action.
- `scripts/dev/multi-user-fixture.sh` SHARES the live ports — `snap --contexts` refuses with the
  up-remedy when it's down; the live stack itself is single-user with no login door.
- snap drives: `--goto settings:<cat>` / section ids / `modal:<slot>`; the settings nav is a
  scrolling `role=navigation` Stack — probe its innerText, never trust one viewport screenshot.

## ═══ LEDGERS ═══

### Flakes

- code-editor:192 — 1 strike, the CM6 internal-readiness class; remedy on 2nd strike: re-press
  poll (harmless re-Enter on an open tooltip).
- chart.ct:29 — NEW 1st-striker 2026-07-26 (retry-pass); watch.
- HELD after root-fix: swipe-strip:122 · file-dropzone:86 (both = the first-keypress-after-mount
  class, memory [native-file-input-first-enter-drop]) · sortable:79 (was a real PRODUCT a11y
  defect, fixed at the primitive — [sortable-keyboard-focus-monitor]) · message-list:309 · lightbox.

### Facelift (UGLY — accrues here; a dedicated pass ships it)

- Admin-pane density → bring up to the Chat-behavior craft bar (side-eye's "single biggest
  opportunity": description size + vertical rhythm).
- Section-level Save button needs a grouping spacer (reads as the last row's control).
- Autosave "Saved · Synced" status line floats between sections (orphaned placement).
- The tool-use description column is cramped in the narrow context panel (~180px, 6 lines).
- +/- steppers are 28px (sub-44 touch target; desktop-primary so low).
- Solo add-character double-popper stacking; Members-tab underfill (acknowledged until Trackers).
- @orb/ui Toggle pressed-state fill ΔL≈0.03 off its container (fix at the primitive) — pre-noted.

### Queued (after the rpg program, or at natural gaps)

- **Workloads junk-drawer exit, stages A–E — VERY LAST** (owner order stands). Design ACCEPTED:
  `reports/stickler/2026-07-25-workloads-junk-drawer-exit.md`; its two standalone product defects
  (global concurrency=1 head-blocking · silent poison-row drop) are PARKED WITH the program.
- BG-V live drive (video-background side-eye; needs a seeded video asset post-reset).
- Rebuild-gate verifications BEFORE buddy returns: capability cell-keying (source×api) ·
  AgentTurnRequest scalar-plucking · roles/agent.ts-vs-resolve-role tension · the generic
  tool-loop's home in chat.
- macro-before-scan audit chip: recall's `recent` feed may reach the keyword/semantic scanner with
  UNRESOLVED `{{…}}` macros (marinara scar class) — audit assemble-gather→recallMemory, pin
  resolved-before-scan.
- auto-mode native-compact characterization: auto turns succeed on vLLM but SDK-native compaction
  firing there was never positively confirmed (needs a compact_boundary log capture; cheap-probe
  moment).
- Greeting studio Phase-3 (committed-chat greeting surfaces) — only if pulled by demand.

### Sanctioned-NEVER + owner-sacred (no fresh ruling = don't touch)

- NEVER build: simpleSend · prompts.json machinery · profile hot-swap (guided-gen plan, sanctioned).
- Owner-sacred: persona pin mechanics (validation-only allowed) · security floors/rate limits ·
  pushing to origin · hand-launching engines · full-rpg/crew scope.
- The three gating classes are law: PHASE = disable-with-reason · PERMISSION = omit ·
  APPLICABILITY = omit + keep-the-doorway. One real surface, never reduced modes.

## ═══ COMPLETED PROGRAM RECORD (pointers; detail = git log + the cited reports) ═══

- **The knob-wire program (2026-07-25→26, COMPLETE):** ~440-file two-wave audit → gate 150
  (`knob-wire-coverage`, D107, six arms, self-cleaning registry) → Phase A (6 lanes: rateLimits
  enforced · chat six · dupThreshold · uploads catalog) → Phase B (7 stints on one warm lane:
  the settings-SECTION contribution seam · memory master switch · worldInfo · 3 admin panes +
  rateLimits.general DELETE / login ADD · databank wired [ownerId-blind stub killed] · workloads
  knobs · persona toggles · toolRecurseLimit · chat prefs w/ PD-146 ceilings · verbatimTail ·
  Advanced disclosure · pageSize · the admin tier ⑩ · imagery-templates lift ⑫) → side-eye
  SHIP-WITH-FIXES, zero BROKEN. Audit ledger: `reports/scout/2026-07-25-buried-knobs-audit-wip.md`.
- **Guided-generations program (COMPLETE through Phase 2):** parity audit
  (`reports/stickler/2026-07-25-guided-generations-parity-audit.md` — LAW-adjacent; §5/§10 = the
  convergence design the substrate spec builds on) · Phase 1 steering + CP-1/CP-2 · the greeting
  studio · the sampling ladder (gate 149).
- **Context-Panel program:** CP-1/CP-2 SHIPPED; CP-3 kit SHIPPED (`afb3d383`); CP-4 lite trim = W3
  of the active program; spec = `docs/architecture/Context-Panel-Program.md` (§4.4 amended by the
  quests/journal ruling — apply at land).
- **Contracts audit (F1–F5/G1–G3):** functionally closed 2026-07-25; `contracts/chat` 9-seam split;
  compose `services.ts` split (keystone + 8 seams).
- **Pain-point inventory triage:** all items nailed, purged, cured (settings god-feature → the
  contribution seam), or queued above; the localStorage brick-loop was already fixed (workboard-#11
  draft trust gate + save circuit breaker — this file's git history holds the old detail).

## ═══ COMMIT LOG (2026-07-25 → 26, one line each; full messages in git) ═══

`bb18ed73` review-fix wave (speaker-tag leak · avatars · slash combobox · shell brick · ARIA) →
`ba1eb63f` recovered design records → `b733a0b0` F6 transport schemas → `36d0b128` guided P1 +
CP-1/2 → `a659c48b` first e2e (4 @live legs) → `20627b64` guided P2 consolidation →
`2a450a8b` Stop-during-arbitration + worldInfoActivated + F3 → `80eca58e` contracts/chat 9-seam
split + chain-Stop → `712047b4` union-gate repair + snap --contexts + 2 flake root-fixes →
`c8c613fa` workboard-remainder close → `2ee1d0b2` services.ts split → `be1ba6b4` sampling ladder
(gate 149) → `d9525f02` knob-wire Phase A (gate 150/D107) → `9acbcf5b` B1 seam + memory switch →
`3c09113d` B2 admin surfaces + rulings → `201c2d74` B3 databank + deep-link race → `8876abaa`
B4+5 + sortable product fix + swipe-strip fix → `c4561fa8` B6 admin tier + reset trap →
`8195c660` side-eye close → `a5ace0fc` B⑫ imagery lift (PHASE B COMPLETE) → `afb3d383` the CP-3
tracker kit + ratified substrate spec.
