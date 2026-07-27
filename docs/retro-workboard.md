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
**✅✅ W1 VERTICAL COMMITTED — `a9052b54` (on main, ahead origin 26, NEVER pushed). W2 TRANSPORT NOW IN
FLIGHT.** W1 = the whole rpg-lite domain: 6-table substrate + staging/locks + CRUD/read verbs + gather +
chat ops + 7 plane shapes (two ways) + bus/gate + compose/runExtraction + composed-real int test. Verified
3 lenses (stickler found 3 bugs → fixed → verifier CONFIRMED; IDOR clean). Ledger D86 re-mint + D108 mint
landed. CP-doc §5 amendments DEFERRED to W3; proposed/INDEX untouched (frozen ref). ——— **W2 = expose rpg
via tRPC, EVERY proc cross-tenant-sweep PROBED/EXEMPT** ([[new-router-needs-sweep-classification]]); a
minimal `transport/trpc/routers/rpg.ts` reachability stub already rode W1 (stickler-judged legit) — W2 is
the FULL proc surface. Mirror chat's router; auth via the chat FK chain (no ownerId). Then W3 CP-4 client.
**🔄 W2 BUILT (security-executor) + VERIFYING (whole-tree check+battery `bivrp6nuj` + verifier
`ac85a73df37c2aa08`).** 20 verb procs added to `routers/rpg.ts` (15 mut + 5 query, thin
`{principal,...input}` pass-throughs mirroring chat), all PROBED in the cross-tenant sweep (only
`rpg.stream` EXEMPT); `seedOwnerWorld` seeds a MARKED owner-A game; teeth-proven (broke `getTrackerView`
gate → sweep RED naming the proc → restored). **Security fix the sweep surfaced: `createGame` was a weak
existence oracle** (BAD_REQUEST to a NON-member) → split to leak-free NOT_FOUND (non-member) / FORBIDDEN
(non-host member), matching `guard.ts` doctrine — a behavior change to committed W1 code, hence the
verifier lens on it. New `contracts/rpg/inputs.ts` (DERIVED wire schemas) + mirror test; `| undefined`
param/patch widening for exactOptionalPropertyTypes (drizzle `.set()` skips undefined = runtime-neutral,
verifier confirming). `invalidation.ts` untouched (W3). **✅ W2 DONE + COMMITTED `9f9f15ce`** — 3-lens green
(check ✓ · battery 7613/0 + CT 1453/0 ✓ · verifier CONFIRMED all 4 parts incl. the createGame leak-fix).

**═══ W3 — CP-4 LITE CLIENT ✅ COMMITTED `4843f0aa` (side-eye SHIP 0 P0/P1 + battery green) ═══**
W1/W2/W3 rpg-lite vertical all committed (main, ahead origin ~28, NEVER pushed). Side-eye taste follow-ups
(non-blocking, TODO): game chats should land on Status tab not Members (seed `contextTab:"rpg.status"`);
Scene "Date" empty input wants a placeholder.
**🔬 LLM CONFIG AUDIT (owner ask 2026-07-26, task #14, mech-exec `afadce255a3b05883`):** gen model =
`Qwen/Qwen3-VL-8B-Instruct`. Wire snake_case VERIFIED correct. Bugs vs the model card (temp0.7/top_p0.8/
top_k20/rep_pen1.0/presence1.5): **rep_pen was 1.05 (double-penalty w/ presence 1.5 → weird output) → 1.0**,
and **top_p/top_k had no base default** (silent preset → vLLM's 1.0/off → Qwen incoherence) → put the full
VL rec into the gen `--override-generation-config` base (presets still override per-request). Verify=argv
snapshot ONLY, no live launch. **✅ CONFIG FIX COMMITTED `36221388`** (sampling rep_pen→1.0 + top_p/top_k/
temp base in the gen override + `--dtype bfloat16`; check green). Launch args otherwise CORRECT (tool-parser
hermes · max-model-len 32768 in-native-window no-rope-needed · mm max_pixels · model's own chat template).
**ENGINES CURRENTLY DOWN** (8701/2/3 unresponsive) — the fix applies on the NEXT supervised
`stack.sh restart`/`pnpm engines` (human-supervised; I never hand-launch). **ROUTE-2 CONTINGENCY (owner):
if STILL weird after route-1 + a live observe → swap to a suitable Qwen 3.5 model wired per their guide.**
**🔬 W4 FOUNDATION BUILDING (exec `a35051138928fbc01`):** extend `tests/e2e/` — wire `RPG_TRACE=on`/
`WIRE_CAPTURE=on` into the e2e stackEnv + a `@live` `rpg-lite-loop.spec.ts` (Mara-EXCLUDED seed) driving the
full loop through the DOM + cross-checking server truth per hop via `/api/_debug/rpg/traces` · `db/chat/:id`
· `wire/captures`. Structurally verified now; LIVE RUN gated on engine-up. **The live run both validates the
spec AND observes whether route-1 fixed the weirdness.**
**FINDING (W4 exec):** `/api/_debug/rpg/traces` (R-OBS rpg flight recorder) is SCAFFOLDED-BUT-UNBUILT —
env `RPG_TRACE`, `ServicesDeps.rpgTrace`, the `RpgTraceInspector` port (`recent(filter)→object[]`, mirrors
`wire-capture.ts`) + the route registrar all exist, but NOTHING emits trace events / consumes the flag /
passes the inspector to `app.ts` → the route 404s even with `RPG_TRACE=on`. `wire/captures` IS fully wired;
`db/chat/:id` carries NO rpg snapshot state (snapshot truth = `rpg.getTrackerView`). **OWNER RULING
2026-07-27: PATH B — lite has no internal resolution machinery needing hop-level trace; observe every hop's
RESULT via getTrackerView + wire/captures + DOM + messages. R-OBS DEFERRED to full-mode (its real use).**
[✅ W4 Path B BUILT — `tests/e2e/rpg-lite-loop.spec.ts` (@live) + `WIRE_CAPTURE=on` env + trpc helpers;
typecheck:tests-dom/tests-membership/biome green; `--list` default="No tests found", `E2E_LIVE=1`=1 test
(gate both ways). Observes every hop's RESULT: createGame→turn(DOM+listMessages)→wire(wire/captures agent-sdk)
→extraction/flush/snapshot(getTrackerView empty→populated)→re-render(Scene DOM = exact server-truth string).
Mara-excluded (mints "Thornwick"). **HELD UNCOMMITTED — validate on first `E2E_LIVE=1` run.** Deferred-risk:
(1 highest) does that narration make the model WRITE on a freeform empty base? (2) re-render/bus timing (3)
agent-sdk wire chatId-correlation (4) game-tab helpers. **GATE = supervised engine restart → run validates
spec + observes weird-response fix.**]
**W3 TASTE POLISH in flight (exec `a2e30469c13ef560a`, snap-verified no-inference):** game chats land on
Status tab not Members (side-eye's top note) + Scene "Date" empty-input placeholder. → small W3-polish commit.
**═══ W3 — CP-4 LITE CLIENT (history) ═══** Orchestrator READ FIRST-HAND (owner-corrected 2026-07-26):
full CP-doc `docs/architecture/Context-Panel-Program.md` §4 · the cohesion game plan `reports/rpg-lite-
and-full-cohesion-game-plan.md` (D86 argument) · the mockup `reports/design-refs/rpg-shell-mockup-v2.png`
(SEEN) · OSRS `osrs-fixed-interface.png` (SEEN). **The docs ALREADY decide what I nearly asked: §4.2 KEEP
THE BRACKET (two strips, one selection — single-strip rejected); §3.2 EVERY BLOCK EDITABLE-IN-PLACE (read-
only-first is the named "lite died" failure).** VERIFIED W2 IS TO SPEC — `views.ts` maps every §4.4 lite
tab (Status/Sheet/Inventory/Scene→getTrackerView actors/ambient/cast/quests/widgets/recentBeats/poolOrbs/
trackersReadOnly; mode→getGame; host editor→getConfigView incl. extractionMode; edit→15 mutations); the
view contract itself cites §4.3/§4.5/§4.6. **Stints:** W3a = the shared §4.11 two-strip mechanism
(`ContextTabDef.strip`+badge+disabledReason · `ContextTabsPanel` bracket · BACKWARD-COMPAT single-strip
byte-identical) [✅ DONE scoped: 8/8 new CT + 96/96 no-regress, tc+biome green; whole-tree battery batched
w/ W3b] → W3b = the FUNCTIONAL panel: `useRpgContextState` (gate `chat.rpg!==null`) + rpg game-strip
contribution (4 lite tabs via `chatContextContributors` — MAY be first-of-kind, executor flags) + header
banner/orbs + editable-in-place (CP-3 onEdit→mutations) + `use-rpg-bus.ts`→wire RPG_BUS_FILTERS [🔄
executor `ae79bd06b9f218dbf`] — [🔧 FIX ROUND in flight: (A) ARCHITECTURE — rpg contributor must be
SELF-CONTAINED, read pointer via cache-first `trpc.chat.getChat` (§12/line 43/163/268 lockdown law); REVERT
the `CommittedChatContext.rpg` coupling; keep `ChatDetail.rpg` server view. (B) 6 gate reds scoped-lane
missed: eslint rpg-scene-tab:50 · ct-no-oneshot-live-read-assert · feature-owns-definition · no-inline-types
· no-test-fabrication ×4 invalidation.test · suppressions rpg-scene-tab:198] →
**W3c = LAYOUT CONVERGENCE (owner feedback 2026-07-26 + §4.2 anatomy, snap-driven):** (1) PIN THE BRACKET —
header+game-strip+viewport+bottom-strip; ONLY the VIEWPORT scrolls internally (`flex-1 min-h-0
overflow-y-auto`, brackets `shrink-0`) — bottom meta strip must NOT get pushed off / scrolled-to (current
bug; W3a CT ran in a fixed-height box so overflow never showed). (2) HEADER-BAND SEAM — scene banner+orbs
ABOVE both strips (§4.2), not inside each tab body (needs a header-contributor mechanism extension, W3a-class).
[✅ W3c BUILT + snaps reviewed by orch: header band above strips · bottom strip pinned · viewport scrolls
· bigger OSRS cells · un-clipped meters · single-strip indicator fixed · backward-compat single-strip ·
three-dots de-dup (removed Settings/Preview/Injections/Invite/Handoff/Leave — all have panel homes) · NO
filler (grep-audited). Header-band SEAM = `ContextTabDef.header?` supplies `ResolvedContextTabs.header`
(symmetric w/ owner slot, self-contained, no chat import) — orch APPROVED. **P1 RULING (owner 2026-07-26:
"i think its fine"): ACCEPT the taller context vitals band on game chats — breaks north-star P1 "one shared
horizon" for the takeover, scoped to `[data-panel-side=context]`; consistent w/ CP-doc §4.5 2-line band.**
2 whole-tree reds in fix (motion-token-purity shell.css:342 · 2 stale chat-options-topbar CTs from the
de-dup) → then final battery → side-eye → COMMIT W3.] (3) BIGGER/NICER OSRS tab buttons. (4) pixel convergence to
`rpg-shell-mockup-v2.png`. (5) IA DE-DUP (owner rule 2026-07-26): if an option exists in the context
panel it does NOT belong in the chat's three-dots/overflow menu — the PANEL is the one home. Audit the
chat topbar "..." menu; strip anything duplicated as a panel tab/section (Members/Settings/Injections/
Preview/Game/…). Applies to ALL chats (the standard panel has those tabs too), not just game chats.
→ side-eye AFTER. + the OLD lite panel bodies (CP-3 kit:
Status/Sheet/Inventory/Scene + header orbs + editable-in-place + read-only pill; MOCKUP-CONVERGED) → W3d =
snap-vs-mockup converge + side-eye. **Deferred CP-doc §5 reconciliation rides W3** (§3.1 pointer mode-free
· §6 Q6 wallet=first-class-built · my "6-tab" note was WRONG → 4 lite tabs). Open §6 owner items (surface
as hit): grimstone theme ship/skip · orb pinning. **W4 (task #13, blocked by W3): exhaustive full-stack E2E driving REAL inference.**
SHAPE (scout `a0c70d1ad6919610e`): NOT a new rig — new `@live`-tagged specs under `tests/e2e/**`, opt-in
`E2E_LIVE=1 pnpm e2e <spec>` (default battery excludes `@live` via `grepInvert`), mirroring
`tests/e2e/start-chat-with-character.spec.ts`. Drive the loop through the DOM (createGame → send msg →
extraction/tools → CP-4 panel asserts) + cross-check SERVER TRUTH per hop via the `/api/_debug/*`
observability surface (`packages/server/src/foundation/observability/debug/routes.ts`, admin-cookie or
`x-debug-token`): **`/api/_debug/rpg/traces?chatId=&turnId=`** (the rpg flight recorder, gate `RPG_TRACE=on`)
· `wire/captures` (raw LLM prompt bodies, gate `WIRE_CAPTURE=on`) · `db/chat/:id` · `traces` · `logs`.
**GAP to close in W4:** `RPG_TRACE=on`/`WIRE_CAPTURE=on` are NOT in the e2e `stackEnv` (`playwright.config.ts:27-33`)
— add them or the trace observability is silently starved. Engines LAZY/human-supervised launch
(`stack.sh restart`); generation roles never fall back (real engine or honest fail) — CHECK engine status
before a live spec. **SEED RULE (owner 2026-07-26): do NOT include the "Mara" character in any test that
drives REAL inference — she destabilizes the model (weird output → flaky asserts). Use other characters
for `@live` seeds. (Mara in a UI-render-only seed is fine — no inference.)** Loop-hop→observe map lives in the scout report. **COMMIT W3 first (checkpoint before
contentious live-inference work).**

_↓ W1c-b historical detail (committed in a9052b54) ↓_

**W1 VERTICAL — COMMITTED a9052b54.** Final state: whole-tree check GREEN + battery GREEN (vitest 7608/0
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

**UI-STINT ADDENDUM (owner directive 2026-07-26):** a CT proves behavior in an isolated fixed-width box —
it does NOT prove the thing renders in our real context pane / geometry, or that it isn't reinventing a
panel outside our system. EVERY UI stint (W3b/W3c/…) verifies LIVE with `pnpm snap <route> --out <name>`
against the up stack (:5173 uncommitted): confirm (a) it's inside the REAL `ContextTabsPanel` bracket +
fixed-width CONTEXT column + header slot (not bespoke/off-grid), (b) DEADCSS scan CLEAN (off-namespace
utils = built outside our tokens), (c) structurally matches `reports/design-refs/rpg-shell-mockup-v2.png`.
Orchestrator VIEWS the snap PNGs (`reports/snaps/`), not just the report. side-eye does the after-audit
(live geometry/a11y/fugliness). To snap the rpg panel a game must exist (`chat.rpg!==null`) — seed via
`createGame` on a demo chat. **NO PLACEHOLDER/FILLER CONTENT (owner 2026-07-26): every rendered datum
flows from the live tRPC read — ZERO hardcoded names/numbers/beats/mock arrays to make a snap match the
pretty mockup; empty planes show the HONEST empty state, never padded rows. The mockup is a LAYOUT target,
not a content target. Audit: grep the components for content-literals-masquerading-as-code; whatever the
mockup shows must come from EXTENDING THE SEED, not a literal.**

Lane verifies SCOPED (its tests + per-package tsc + biome on its files; whole-tree gates are
BANNED in lanes) → the orchestrator runs `pnpm check` + `pnpm test` on the QUIESCED tree and READS
the artifacts (`reports/verify.json` · `test-report.json` · `ct-report.json` · `ct-flaky.json` —
exit codes lie) → a fresh-context `verifier` on any non-trivial diff (its brief MUST ban
check-gates.int / check:structure while the battery runs — the `__g_` fixture collision;
[shared-tree-contention-protocol] rule 10) → findings route back to the WARM lane → commit on
green → next wave. Commit messages end with the Co-Authored-By trailer. **Commit-only; NEVER push;
never ask about pushing.**

## ═══ AUTONOMY PROTOCOL (owner 2026-07-26: "keep driving and refining") ═══
- **Autonomous refine mode:** drive rpg-lite to completion + continually test/improve; observe EVERY part.
- **LLM engines NOW USABLE** (ComfyUI GPU work done) — tests may drive REAL model inference (extraction turns,
  the tool loop). W4 E2E becomes genuinely full-stack (frontend+backend+LLM), not UI-only.
- **Use the EXISTING full-stack-observability E2E tool** (find it — NOT a from-scratch Playwright rig).
- **Hard questions → ask `fable` (Fable-5 agent) or check docs** — don't stall on the owner.
- **COMMIT as a checkpoint BEFORE anything possibly contentious, then do it** (safe restore point).
- **Keep THIS doc updated as work proceeds** (compact-safety).

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
