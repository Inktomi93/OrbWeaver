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

## ═══ ▶▶ SESSION STATE — 2026-07-27 EOD (READ THIS FIRST; supersedes the layered W4 blocks below) ═══

**W4 IS AT THE COMMIT GATE — GREEN.** The rpg-lite loop WORKS end-to-end in BOTH modes on the local
default (proven live, 5 observation rounds → round-5 both-pass: reliable 3/3 flush, race closed, all
failure logs zero). Whole-tree `pnpm check` GREEN (0 failed); **full battery RUNNING as the final gate**
(prior clean run: vitest 7691/0 · CT 1466/0 · 0 flakes). On battery-green → **THE W4 COMMIT** (server +
client + tests + config + workboard, one batch; mint the D-entry for the day's rulings). NEVER push.

**WHAT'S IN THE W4 COMMIT (the uncommitted tree, ~110 files):** the rpg-lite delivery reshape (char turn
ALWAYS tool-less prose; cheap = dedicated TOOL ROUND at flush [required + no_changes escape + parallel];
reliable = structured extraction routed by conn.api; per-call ref-ENUM constraint; journalTitleFor derive;
the flush BARRIER [set-per-chat, sync-register, 120s engine timeout]; TOTAL observability set) · the
`structured` provider-role split (summarize ≠ structured; own firewall row, metered-sub exclusion HOLDS) ·
the agent-sdk×vllm skin RETIREMENT (6-mode canon) · agent-sdk chat structured-output + MCP tools + the
`$schema` strip + the Responses tool-finish fix + the capability-gated system splice · the STICKLER FIX
ROUND (10 findings F1-F10 + suspicions S1/S2/S3/S5 — F1 consent-inheritance the headline: state round rides
the char turn's ALREADY-RESOLVED connection + enforced consent, no second seam) · the CP-4 freshness
indicator · the vLLM config `36221388` + GPU util 0.28→0.55 · boot-seed catch · the build-argv
thinking-swap-playbook comment + CLAUDE_CODE_ATTRIBUTION_HEADER pin · @live backend-matrix + rpg-lite-loop specs.

**TERMINOLOGY DEBT (owner-flagged 2026-07-27):** code comments say "narration turn" for what is really THE
CHARACTER TURN (the {{char}} prose reply). There is NO narration round in lite; the word collides with group
chat's actual narrator seat (the deferred mode-3 doorway). RENAME "narration turn" → "character turn" in the
~8 comment sites (reminder.ts, contract/service.ts, chat-ops/flush.ts:30/52/137, chat-ops/index.ts:75,
compose/rpg.ts:15) — comment-only, fold into the W4 commit or an immediate follow-up.

**IN-FLIGHT / QUEUED (post-commit):**
- **PARITY-PLUS (task #15) — spec v2 RATIFIED** (`reports/parity-plus-program-spec.md`, ~23.8k words):
  7 features + cast-fields + macro×rpg (§12) + the MACRO ENGINE PARITY workstream (§12A). Owner's §13
  cover items eyeballed/ruled. Build waves P0→P6 + MG (grammar) EARLY-parallel-with-P0 GATED on the W4 commit.
- **MACRO ENGINE PARITY (owner ruling): on par with ST's NEW chevrotain engine "so I can build on top."**
  Universal scoped blocks · lazy contract w/ determinism threading · enforced typed args · reserved flags
  grammar · user-defined macros — WHILE KEEPING ours (variant-scoped vars, freeze, CEL, row atom, budgets).
  Pre-launch = ideal grammar now (stored-content compat downgraded to free-when-cheap; one seed migration);
  language-kernel exhaustive testing. §12A specced. **MARINARA-ENGINE deep audit (Opus, read-only) landing —
  the standout delta: their `[tag: attr="value"]` GM-output bracket-DSL (~1000 lines, balanced/quote-aware),
  a design input for our parity-plus FENCE grammar + full-mode encounter/skill-check tags. Plus {{idle_duration}}
  + a var-op-aware memoization cache. Fold into §12A when the report lands.**
- **ENGINE TOOLING + SLEEP MODE (owner, read-only design done, HELD for post-W4 GO):**
  `reports/engine-tooling-sync-and-sleep-mode.md`. Fleet-singleton/adopter model + posture vocab (replaces
  VLLM_DISABLED/STACK_ENGINES folklore) · detached spawner (the children-die-with-launcher fix) · orphan
  sweep · VRAM pre-check refusals · auto-sleep-on-idle + auto-wake + hold-marker (ComfyUI) · env-var
  inventory table · found: RUNNER_OVERRIDE reader-less dangler; workboard's "restart resets DB" was FALSE.
- **DEFERRED (workboard §Queued):** S4 (pre-existing sub-summarize dead-switch) · F5-upgrade (state-round
  stats/records → early parity-plus wave).

**AGENTS (this session):** Fable `a270e20cdb3e1fb76` (backend/spec — IDLE, resumable) · sec-exec
`a8b2404a6c16fabf2` (F1 lane — DONE) · tooling `a79ddc00a0549f186` (design — DONE) · Opus marinara
`a63903aae9d989b83` (audit — finalizing). **LESSON THIS SESSION: the whole apparatus (fresh-context
stickler + 5 live rounds + whole-tree gates) is what caught F1 — a consent-belt bypass invisible to 244
green rpg tests because the composed-real tests faked resolveRole. Verification is the moat.**

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

- Stack UP: server :8788 · vite :5173, single-user auto-authed as the owner. **ENGINE-START AUTHORIZED
  (owner 2026-07-27: "you are authed to start the engines up") — ComfyUI GPU work done, GPU free. Use
  `pnpm engines` (engine-only, NO DB reset — unlike `stack.sh restart`) when engines are DOWN + a live
  drive needs them; don't spawn a 2nd set when up; config-diff correctness is still argv-snapshot not a
  launch. [[never-run-engine-launcher-live]] SCOPE-CORRECTED — stop deferring engine starts to owner.**
  (Engines UP 2026-07-27: embed :8701 · rerank :8702 · gen :8703 = `Qwen/Qwen3-VL-8B-Instruct`; boot
  CONFIRMED the config fix live — `dtype=torch.bfloat16` · max_seq_len 32768 · TP=2. W4 first `E2E_LIVE=1`
  run FAILED on a SPEC bug NOT a model issue — `openDetailPanel` waits for the non-game `tablist "Detail"`
  but a game chat's takeover has `"Game"`/`"Chat"` tablists; failed BEFORE the turn so model UNOBSERVED yet.
  Exec `a35051138928fbc01` iterating the live run to green [engines up = it CAN run E2E_LIVE] + WILL REPORT
  the model's actual behavior (assistant text + wire body + did getTrackerView write) = the weird-response
  verdict. W4 spec still HELD uncommitted til green.)
  **═══ W4 SCOPE EXPANDED (owner 2026-07-27) — exhaustive rpg-lite audit, happy + sad paths ═══**
  **PHASE 0 GATE — model coherence:** exec reads ACTUAL model output on every failure; SPEC bug (selector/
  timing) → fix; MODEL looping/garbage/not-writing → STOP + report = route-2 (Qwen 3.5) trigger. "DON'T
  BURN TIME if it's just a bad model" (owner). Nothing downstream until model confirmed sane.
  **PHASE 1 — steering/injection mechanics audit** (agent `a01892a185a3f62a1`): framing · DEPTH · ROLE ·
  role/position under STRICT/SEMI-STRICT/MERGE modes · does state actually steer — OURS vs the reference
  `neo-tavern/references/rpg-companion-sillytavern` (owner-pointed). Code-side now; wire-captures confirm live.
  **PHASE 2 — scenario matrix (gated on Phase 0):** swipes(re-resolve per swipe) · cancel mid-turn · deleted
  turn · two turns in a row · 1:1 · multi-character · multi-human · DOES THE STAT STATE STEER THE CONVO ·
  framing/depth/role verified live E2E. Every part, happy + sad.
  **═══ LIVE-RUN DIAGNOSIS (2026-07-27) — config fix WORKED for coherence, but STATE-WRITES BROKEN ═══**
  Model `Qwen3-VL-8B-Instruct`: coherent prose on simple prompts ✓ (~4.5s, completed, NO loop — rep_pen/
  top_p/bf16 fix killed the runaway). BUT: cheap mode = model PROSE-EMITS the tool call (`update_party — …`
  as text) not a structured `tool_use` → ZERO real tool calls; reliable mode = structured-output extraction
  ERRORS SILENTLY (swallowed by `engine.ts:561 .catch(()=>undefined)`); meta-heavy prompts STILL LOOP to
  the 8192 cap → `api_error`, no row. So trackers stay EMPTY → **the "sad panel" = the honest empty-state of
  a game with NO state written (NOT a render bug; a populated game matches the mockup).** Loop CODE is sound;
  it's starved of state. **MODEL-vs-ROUTING ROOT-CAUSE in flight (exec `a35051138928fbc01`):** hypothesis =
  local Qwen routed through AGENT-SDK backend (Anthropic prompt-string, hosted-Claude) instead of the vLLM
  chat surface (openai-compat, sends tools+response_format + `--tool-call-parser hermes`) → wrong backend =
  no real tool/structured request reaches vLLM. If ROUTING → fix routing (swap won't help); if MODEL (right
  backend, request well-formed, model still can't) → route-2 Qwen 3.5. Also lighting up the SILENT-EXTRACTION
  observability bug (log the swallowed throw). **eslint `1 ⚠` FIXED** (use-rpg-context-state trackersReadOnly
  `any`→typed; dynamic-array useSuspenseQueries idiom). W4 spec panel-open fixed (Game/Chat tablist).
  **═══ ROOT-CAUSE VERDICT (2026-07-27) — MODEL IS FINE, it's OUR WIRING. NO Qwen-3.5 swap. ═══**
  Direct HTTP probes vs the live engine: Qwen3-VL-8B does OpenAI `/v1/chat/completions`+tools (real
  tool_calls) ✓, +`response_format` json_schema (clean JSON) ✓, AND Anthropic `/v1/messages`+tools ✓.
  "prose-emitting" = model was NEVER GIVEN TOOLS. Config-fix (route 1) sufficient; state-write fail = WIRING:
  • **Route A (vLLM openai-compat surface `vllm/surfaces/chat.ts`)**: code CORRECT (sends tools+response_format)
  but `VLLM_DISABLED=true` → vllm backend unregistered → surface UNREACHABLE. Fix = register vllm + pin roles.
  • **Route B (agent-sdk)**: chat path is TOOL-LESS by design (never forwards req.tools + a firewall tripwire);
  summarize HARD-REQUIRES `max-pro-sub` → local-vLLM structured extraction has NO route. Real backend gaps.
  **OBSERVABILITY FIXES KEPT (align w/ owner's visibility doctrine): `compose/rpg.ts` logs the reliable-
  extraction throw (`rpg.extraction.failed`); `engine.ts fireRpgTurnCompleted` logs the swallowed flush fail.**
  **CORRECTION (owner, orchestrator over-assumed — DROP the "VLLM_DISABLED / enable-vllm" framing):** the
  E2E `E2E_LIVE=1` spins up its OWN stack with `VLLM_DISABLED=false` (`playwright.config.ts:34`) and IS driving
  the vLLM engines (owner HEARS live inference). The `VLLM_DISABLED=true` I found was the SEPARATE `:8788`
  DEV stack (owner's manual stack → Claude), irrelevant to the E2E. The chat resolves to **agent-sdk backend
  → the vLLM engine's Anthropic `/v1/messages`** (probed: serves tools + json_schema fine). So the FAILING
  PATH IS the agent-sdk route; the fix is to make THAT route work (= owner's "agent-sdk does structured output
  too"). REAL FIX (exec `a35051138928fbc01`): (1) agent-sdk chat runner is TOOL-LESS (tripwire treats tools as
  leak — scope a fix to the LOOPBACK-vLLM path so rpg tools forward for cheap mode), (2) extraction's
  `executor.summarize` hits the agent-sdk `max-pro-sub` gate instead of the agent-sdk's OWN structured-output
  mode (`agent-runner.ts:86` `outputFormat: json_schema`, proven working) — route the extraction through
  `outputFormat`, not max-pro-sub summarize. The tool-less agent-sdk chat runner is the COMMON blocker (both
  the E2E AND owner's manual :8788 test fail state-writes on it). Also confirm the vLLM chat-surface (openai-
  compat) route works (both routes, owner's ask). LESSON: VERIFY before relaying an agent's diagnosis as fact. **PARALLEL: Fable-5 max-effort exec `a270e20cdb3e1fb76`** on the injection ROLE
  handling (owner: VISIBILITY, no silent convert — line-144 in_chat system→user is unconditional, make it
  MODEL-AWARE: deliver real system when the model's turn-order allows mid-convo system, cache-break=user's
  choice WITH a heads-up).

**═══════ W4 LIVE STATE — COMPACT-SAFE SNAPSHOT (2026-07-27, latest; read THIS first, it supersedes the messy notes above) ═══════**
COMMITTED (main, ahead origin ~30, NEVER pushed): W1 `a9052b54` · W2 `9f9f15ce` · W3 `4843f0aa` · vLLM config `36221388` · taste polish `05f8c4af`.
**MODEL IS FINE — NO Qwen-3.5 swap** (route-2 OFF): direct probes proved Qwen3-VL-8B does tools + json_schema on `/v1/chat/completions` AND `/v1/messages`; the REAL `rpgExtractionSchema` round-trips through `/v1/messages` json_schema → clean parse + full state. The config fix (`36221388`: rep_pen 1.0 + top_p/top_k base + `--dtype bfloat16`) killed the weird responses.
**BLOCKER = OUR WIRING (agent-sdk route), being fixed:** (1) agent-sdk CHAT runner is tool-less (rpg tools never forwarded → model prose-emits) — but **cowork is separately denylist-handled** (`translate.ts:21` `COWORK_DENYLIST` via `disallowedTools` + `CLAUDE_CODE_DISABLE_ADVISOR_TOOL`); the `mcpServers:{}+maxTurns:1` firewall is the SUB/hosted-Claude roleplay case, so forwarding rpg tools on the LOOPBACK path is NOT a leak. (2) reliable extraction's `executor.summarize` hits the agent-sdk `max-pro-sub` gate instead of its own working `outputFormat: json_schema` mode.
**KEY FACT (I got this wrong twice):** the E2E runs `agent-sdk × vllm` via the loopback (`buildClaudeVllmEnv → 127.0.0.1:VLLM_GEN_PORT /v1/messages`) and DRIVES THE ENGINE **even with `VLLM_DISABLED=true`** — that flag only gates the `vllm` BACKEND registration (the chat-completions route), NOT the loopback. So "enable vllm" was a non-fix.
**OWNER OWNS THE FIX VIA FABLE (trust it — my recent calls were bad, do NOT override its judgment):** Fable-5 max-effort exec **`a270e20cdb3e1fb76`** owns the FULL cross-route consistency: fix the broken cells + `@live` matrix test **`tests/e2e/backend-matrix.live.int.test.ts`** (E2E_LIVE=1-gated) proving every SUPPORTED (API×skin×model) cell does TOOLS + STRUCTURED OUTPUT via real SDK dispatch, + characterize **parallel/interleaved vs sequential** tool-calling per cell, + the turn/role/injection VISIBILITY axis (line-144 in_chat system→user → model-aware). Matrix = {agent-sdk: vllm/sub/OR} × {chat-completions: vllm/OR} × {responses: OR + valid cells}. Skips only for genuinely-invalid combos (documented).
**E2E-VALIDATION exec `a35051138928fbc01`** = the live-drive harness (`tests/e2e/rpg-lite-loop.spec.ts`, HELD, panel-open fixed = wait "Game"/"Chat" tablist not "Detail"); it does NOT edit backend (Fable does — avoid conflict).
**KEEP (observability, uncommitted): `compose/rpg.ts` logs the reliable-extraction throw (`rpg.extraction.failed`); `engine.ts fireRpgTurnCompleted` logs the swallowed flush fail. eslint `1 ⚠` FIXED: `use-rpg-context-state.ts` trackersReadOnly `any`→typed (dynamic-array useSuspenseQueries idiom).**
UNCOMMITTED (HELD until the loop works + green): the obs fixes, the eslint fix, `rpg-lite-loop.spec.ts` + `support/trpc.ts` + `playwright.config.ts`(WIRE_CAPTURE=on), `backend-matrix.live.int.test.ts`, + Fable's in-flight backend/assembly edits.
KEYS: `.env` has `OPENROUTER_PROBE_KEY` + `ANTHROPIC_PROBE_KEY` (probe keys) + owner-added runtime `OPENROUTER_API_KEY`. Running server reports OR `configured:false` until a restart reloads .env.
ENV: `:8788`/`:5173` = OUR web server (NOT owner's — freely manageable), currently UP. **ENGINES UP (relaunched 2026-07-27, `setsid nohup pnpm engines & disown` — the DETACHED form, survives session restarts; a plain backgrounded launch died with my session once, and killing the launcher kills ALL engines [children]). Config fix `36221388` live (override_gen temp0.7/top_p0.8/top_k20/rep_pen1, bf16, hermes, structured-outputs). **GPU RE-PROVISION (owner-directed 2026-07-27): `VLLM_GEN_GPU_UTIL_MULTI_DEFAULT` 0.28→0.55 (env/index.ts, commented) — gen KV concurrency at 32k context went 1.38x → 7.07x (vLLM boot math; the 0.28 ComfyUI-era floor was why ONE slow turn starved the stack). ~13GB/GPU still free; drop toward 0.28 if a ComfyUI-class tenant returns. Argv snapshot test unaffected (fixture-fed).** Owner's unrelated Open WebUI on :8080.** Engine-start + stack ops AUTHORIZED (owner said 3×) — `pnpm engines` (no DB reset) / `stack.sh start`; alt-port stack (PORT=8790, VLLM_DISABLED=false, scratch DB) for live test runs. **Fable's agent-sdk×vllm + chat-completions×vllm live cells CAN NOW RUN.**

**═══ MATRIX PROVEN 18/18 FIRST-HAND (2026-07-27, orch-run vs fresh engines) + EXTRACTION REROUTE IN FLIGHT ═══**
Orchestrator ran `E2E_LIVE=1 npx vitest run tests/e2e/backend-matrix.live.int.test.ts` MYSELF post-engine-relaunch: **18/18 PASS, 39.8s, 0 type errors** — including the two previously-blocked vllm cells. Full characterization: **agent-sdk = SEQUENTIAL on ALL skins (vllm/sub/OR, numTurns=3 for 2 tools); BOTH array wires PARALLEL (chat-completions×vllm hermes 2-calls-one-turn, chat-completions×OR, responses×OR)**. Every supported route does real tools + structured output.
**ENGINE LIFETIME LESSON:** the earlier engine death = MY backgrounded `pnpm engines` shell was torn down on session restart → engines were its process-group children → died with it. Relaunched **`setsid nohup pnpm engines & disown`** (detached, survives session restarts) — use that form ALWAYS.
**OWNER DESIGN CLARIFICATION (kills my "combine narration into schema" confusion):** rpg-lite has NO narration generation — the CHARACTER turn is the prose (reminder injection = flavor to react off); the EXTRACTION turn is PURE STATE (read beat → emit delta). So the combined-schema single-call fits extraction perfectly (no streaming/prose concern), and marinara-`together` mode is NOT needed. **DECISION: Fable's option (b)** — reroute `runExtraction` (compose/rpg.ts `buildRunExtraction`) off `executor.summarize` onto the agent-sdk `outputFormat: json_schema` path WHEN conn.api==="agent-sdk" (other apis keep summarize; firewall UNTOUCHED — sub-credential rule stands). **Dispatched to warm Fable `a270e20cdb3e1fb76`** (+ composed-real int pins both arms + a new @live cell proving the REAL rpgExtractionSchema through agent-sdk×vllm loopback; visibility doctrine: no silent fallback; extraction never mounts rpg tools).

**═══ EXTRACTION REROUTE LANDED (Fable, 2026-07-27, orch spot-verified) ═══**
`buildRunExtraction` now routes **by `conn.api`** (compose/rpg.ts:164): agent-sdk → `runChatTurn` w/ bare structured ChatRequest (responseFormat=projected rpgExtractionSchema, NO toolServer, ownerConsented:true); every other api keeps `summarize`. **Firewall UNTOUCHED (0-line diff, verified).** Both arms int-pinned (fake executor: right one fires, other doesn't, identical state lands). **LATENT BUG CAUGHT+FIXED: `z.toJSONSchema` stamps `$schema` which the SDK's `--json-schema` validator REJECTS — every agent-sdk structured turn against a zod projection was broken; `sanitizeAnthropicOutputSchema` strips `$schema`/`$id` (position-aware), 2 pins.** Live: real rpgExtractionSchema round-trips on **max-pro-sub ✓ + OR-skin ✓**. **vLLM CHARACTERIZATION: Qwen3-VL-8B HANGS 180s→ProviderError on the big 6-array nested schema via the SDK structured path** (observable error → empty delta, never corrupt) — while the same engine's guided decoding (chat-completions response_format) handles complex schemas (constrained decoding ≠ prompt-validate loop). ⚠ NOTE this CONTRADICTS the earlier "real schema round-trips through /v1/messages" probe claim — the SDK path adds mechanics the direct probe didn't exercise. ~~OPEN REFINEMENT~~ **SUPERSEDED BY OWNER RULING (2026-07-27): REMOVE the agent-sdk×vllm skin ENTIRELY — vLLM is chat-completions-only** (its strictly-better wire: guided decoding + hermes PARALLEL tools). Local chat rides chat-completions×vllm; local reliable extraction rides summarize→guided decoding; cheap mode gets parallel tools locally. **Dispatched to warm Fable:** drop vllm from assertCoherent's agent-sdk set, delete the loopback machinery (buildClaudeVllmEnv + arms), deriveRunner/catalog rows, matrix cells → not-a-valid-combo pins, stored agent-sdk×vllm connection rows get a VISIBLE error/heal (no silent convert), comment sweep + new mode count ([[connection-modes-canon]] update owed at land). Memory updated: [[agent-sdk-usage-cap-gotchas]] #4/#5.

**═══ 🟢 OWNER RULING: MACRO ENGINE PARITY PROGRAM (2026-07-27) ═══**
Orchestrator read ST's NEW macro engine IN FULL (`neo-tavern/references/sillytavern/public/scripts/macros/` — chevrotain Lexer→Parser→CST→Walker, flags grammar, universal scoped blocks w/ dedent, delayArgResolution lazy contract, runtime-typed args, dynamic macros w/ source attribution, pre/post-processor pipeline; it feeds STscript). **Owner: "I want our macro engine on par with theirs in capability and flexibility so I can build on top of it."** Corrected scorecard: OURS leads (variant-scoped swipe-safe vars, commit-freeze determinism, CEL, one server/client row atom, cache honesty, budgets — ALL non-negotiable through the upgrade); THEIRS leads (grammar generality + authoring surface). **The parity workstream (queued to spec-Fable, expands §12): (1) universal scoped-block grammar (2) generalized lazy contract w/ determinism threading (3) runtime-ENFORCED typed args (4) RESERVED flags grammar (parse-and-carry; retrofit breaks stored content) (5) user-defined macros (preset/game-authored, budget-bounded) (6) skip their ./$  shorthand (CEL covers — argued).** Stored-content compat mandatory; hand-rolled parser extension over importing chevrotain (argued). Sequenced after P6.

**═══ STICKLER ON THE W4 BATCH: 10 CONFIRMED — F1 HIGH BLOCKS COMMIT; FIX ROUND IN FLIGHT (report: reports/stickler/2026-07-27-w4-batch.md) ═══**
**F1 (HIGH):** rpg state rounds resolve the HOST'S GLOBAL chat default (not the room's RouteChatAssignment) AND force-stamp ownerConsented:true, bypassing the D17 consent belt (resolveTurnPolicy/assertMaxProSubConsent) — member-triggered game turns can bill the owner's sub with policy OFF. Composed-real tests blind (fakes made both seams identical). F2: state round fires on readonly games (comments claim otherwise). F3: nudge-tail [assistant, system, user] shape defeats extractTrailingSystemRows → BARE reminder in the SDK prompt + reseed churn. F4: extraction enums roster-only → cast NPCs unremovable + cast-actor writes structurally dead (the whole write surface). F5: state rounds invisible to ToolCallRecord/stats — ORCH RULED: accepted-documented v1 (infra-economic class, provider logs = the record) + parity-plus doorway. F6: no timeout on enginePost → hung flush = PERMANENT barrier-entry leak (15s tax every later turn). F7 dead UPDATE_GUIDANCE · F8 stale agent×vllm firewall row · F9 3 stale headers · F10 roster-"Player" collision. **ROUTING: security-executor `a8b2404a6c16fabf2` = F1/F2/F4/F8/F10 (consent lane + ALL compose/rpg.ts + firewall — the durable lesson: state rounds must ride the engine's resolveChat/resolveTurnPolicy pair, no hand-rolled second seam) ∥ Fable = F3/F5-doc/F6/F7/F9 (disjoint files). Then whole-tree check + battery → COMMIT.** Verified-clean highlights: structured-split metered-sub exclusion HOLDS on every role path; enum projection clone-safe; barrier sync-register true; retirement fully swept; Responses fix exact.

**═══ ✅✅✅ W4 GREEN — ROUND 5 BOTH PASS (2026-07-27). THE RPG-LITE LOOP WORKS END-TO-END IN BOTH MODES ON THE LOCAL DEFAULT. ═══**
**RELIABLE: 3/3 FLUSH** (was 0/3) — journalTitleFor derive killed the parse-fail class; windows 1.2–2.5s; panel tracked potion pool+inventory decrementing across the arc; **ALL failure logs ZERO** (unparseable/empty/phantom/failed/dropped — the total observability set, quiet). **RACE: CLOSED** — sync barrier register proven: the raced turn's reminder carried the prior flush (quest active→completed across immediate re-sends); barrier latency signature visible (~+2-3s on raced turns); barrier_timeout 0. Honest caveat (accepted, [[plan-for-small-hardware]]): the 8B still under-decomposes some planes — writes are consistent, coverage is model-bounded. Fix locations pinned: apply.ts:373 (journalTitleFor) · compose/rpg.ts:255 (unparseable log) · chat-ops/index.ts:60 (sync register). **COMMIT PIPELINE RUNNING: full battery → stickler (xhigh) on the whole W4 batch → THE W4 COMMIT.** Fable meanwhile on spec v2 (writes only reports/).
**vLLM docs intel (owner-supplied, banked in memory #7):** `structural_tag` = schema-in-tags amid free prose, ONE generation (vLLM-only, capability-keyed) — the token-enforced primitive for future mode-3/together + tag/fence emission enforcement → spec doorway. **THINKING-checkpoint landmine:** reasoning-enabled Qwen3 SILENTLY DISABLES structured outputs without `--structured-outputs-config.enable_in_reasoning=True` — mandatory at any route-2/thinking swap.

**═══ 🟢 PARITY-PLUS FULLY RATIFIED (owner 2026-07-27) — all 11 + cast-fields, 5 mods ═══**
Owner ruled the whole cover list: #1 rel RATIFIED + **custom values get HINTS for steering** · #2/3/4 ratified · #5 stub + **build the keep-last-X knob** · #6 sandbox full-build + **toggle for no-interactive-HTML (governs the ASK too)** · #7 host-eye + **host-of-room toggle over hidden-content posture** · #8 defaults + **options-first program-wide** · **#9 OVERRIDE: CYOA+plot HOME IN THE GUIDED-ACTIONS WAND, not rpg** (coupling solved via the macro/CEL projection feed — {{rpgSceneState}} in a steer template = state w/ zero contract coupling) · #10 delta always-on + **graceful-degrade everywhere custom + reuse D79 kit heal (ONE home, never parallel healing) + defensive per-plane delta rendering** · #11 extensibility "all the yes" · **CAST-FIELDS = YES, full build, maximal-reliability** (joins P1 w/ relationship). Fable: fix stint → spec revision (A macros + B regex + C cast-fields + these rulings) + v1→v2 changelog.

**═══ PARITY-PLUS SPEC v1 LANDED + REVISION DIRECTED (2026-07-27) ═══**
Spec v1 = `reports/parity-plus-program-spec.md` (13.4k words, 12 sections, 11-item cover list — relationship enum+custom · level hand-only · the visibility MATRIX (surface×wire registry) · XML-attr hidden tags + `:::fence` cards/choices · immediate-total card stub · tierB+allow-scripts sandbox · model-always/host-eye/members-SERVER-STRIPPED · defaults rel/plot/html ON, level/lie/ofilter/cyoa OFF · CYOA+plot homed in rpg · delta block always-on P0 · registries+named doorways). **REVISION DIRECTED (after the fix stint):** fold in **(A) MACRO×RPG — owner-RATIFIED ("CEL is in base — yes")**: feed the 2 lite-feedable orphan macros ({{rpgSceneState}}/{{rpgCast}} via gather.macros; 6 full-mode orphans get honest "(full mode)" labels), CEL `rpg` object into {{expr}} (conditional steering off live state — read-only projection, tracker≠vars preserved), {{rpgDelta}}/{{rpgQuests}}/flat path-read set, volatile-cache notes in the macro browser. **(B) REGEX RECONCILIATION** (kit/regex ST-parity engine has placements + markdownOnly/promptOnly — spec must argue why lie-hiding-via-markdownOnly is the LEAKY version [client-only = truth in member payloads], pin tag/fence-extraction vs AI_OUTPUT/DISPLAY script ORDERING, display choke-point reuse audit). **(C) CUSTOM TRACKED CAST-FIELDS** as a designed section + cover item AWAITING RULING (trackedCastFields {name,hint} — statProfile pattern on cast observation, enum-enforced names; rec: build WITH relationship). MACRO AUDIT FACT BANK: engine = parser/AST + #if/else + volatile-freeze-at-commit + seeded roll/random + runtime/global vars (D46 op-log) + {{expr}} CEL + row-macros shared server/client + metadata DX; rpg-lite currently contributes macros:{} = ZERO usage; 8 purge-era rpg macros in the registry render empty (2 feedable now).

**═══ 🟢 NEW PROGRAM GREENLIT (owner 2026-07-27): PARITY-PLUS — task #15 ═══**
Marinara-reference audit verdict → owner ruling: **skip spotify + skills + dynamic-weather-VFX; EVERYTHING else first-class, properly, BETTER than the reference — "green light on a max level Fable 5 executor to design and build the tits off it."** Scope (7): relationship (rpg plane + vocab + badge + steering loop + journal beats) · level (sheet) · deception `<lie>` (hidden model-visible transcript memory + render filter + host GM-eye — BEYOND hers) · omniscience `<ofilter>` (same ONE mechanism; multi-human perception doorway designed) · CYOA (first-class mode, clickable structural choices) · plot progression (guided-gen steering entries, rpg-state-aware) · immersive HTML (wire the RESERVED `html-card` extraction grammar into the EXISTING tierA/tierB trust model, client.md §12.2). Already-done-not-in-scope: core trackers, dialogue coloring (structural `<speaker>` spans + OKLCH — better than her font-tag begging), parse-machinery moat. **Fable `a270e20cdb3e1fb76` designing NOW → `reports/parity-plus-program-spec.md`** (complete-blueprint pattern, owner eyeballs load-bearing decisions before build). **BUILD GATED on the W4 commit landing first** (checkpoint-before-big-work). Security-touching slices (html-card wiring, hidden-content visibility) flagged for a security-executor pass at build.

**═══ OWNER RULINGS 2026-07-27 (extraction-mode design, all final — mint with the W4 D-entry) ═══**
1. **Reliable-mode one-beat lag ACCEPTED, WITH an indicator** (visibility doctrine on freshness): reliable extracts AFTER the beat commits → the reminder {{char}} sees is as-of the PREVIOUS beat. Panel must honestly show what the state reflects (as-of beat ref and/or a transient "extracting…" between turn-commit and flush; bus-driven). Cheap mode = state moves mid-turn (fresh) — the modes are "fresh but best-effort" vs "one-beat-behind but guaranteed".
2. **Reminder DELIVERY becomes a knob** (so steering can be A/B tested): (a) current in_chat depth-0 row (the injection channel) vs (b) **ephemeral append to the TAIL of the user message** — the state block is the last thing the model sees before generating. Both are assembly-time only, NEVER persisted to history. Home: rpg config beside extractionMode.
3. **Together/narrator mode DEFERRED with a doorway**: group chat HAS a narrator mode (the inline speaker-attribution seat, non-default) — that's the natural host for a marinara-`together`-style combined turn LATER. Not now: modes 1 (reliable) + 2 (cheap) done PROPERLY first.
3b. **CHEAP-MODE SHAPE CLARIFIED (owner 2026-07-27, final): "I don't need prose and tools on the same turn — I've never wanted them all in one; that's mode three for later. It's all about parallel tool calls or an all-in-one tool call where all tools generate in one request, and THEN we have the turn."** So cheap = a DEDICATED TOOL ROUND (own request, state-focused prompt, parallel tool calls or one composite call, NO prose) that PRECEDES the char's tool-less prose turn. Inline-tools-on-the-narration-turn (the R2 fight) was never the intent. Cheap and reliable become SYMMETRIC (dedicated state request + prose turn; vehicle differs: parallel tools vs one schema). Prose+state in ONE generation = mode 3, deferred. Ordering reconciliation (tool round pre-turn vs current post-commit hook) + pipeline seam + indicator semantics = Fable's design, flagged in its report. Relayed to Fable 2026-07-27 (queued after its observability stint).
**═══ OBSERVED-TIMELINE RESULTS (E2E exec, 2026-07-27 — REAL 3-exchange conversations, alt stack :8790, agent-sdk×vllm route [pre-removal]) ═══**
**CHEAP MODE WORKS END-TO-END — first live proof of the whole loop.** Tools fire IN-TURN via the mounted MCP server (Fable's chat-tools fix live: log `"agent-sdk: chat turn mounts the in-process tool server"`; MCP defs invisible in HTTP body.tools — that's expected, not tool-less); flush lands **+5–54ms after commit** (effectively synchronous); panel tracked the story (potion→beats:1 · Bleeding cond → cleared · loc:"Village of Dunmoor"); **state STEERS** (ex3 reminder carried full accumulated state + tool list). **MY PREDICTED RACE = REFUTED for cheap** — flush beat an immediate scripted re-send (~40ms window, unraceable). **RELIABLE MODE = BROKEN on the observed route** (agent-sdk×vllm): 3/3 extractions hit the 180s Qwen hang → `is_error`, tokensOut:0 → empty delta → panel NEVER populated + **each failure saturates the single gen slot ~3min** (starved a later cheap turn into is_error). Both stack configs broken differently (:8788 VLLM_DISABLED=true dies earlier: "provider vllm not wired for summarize"). **THIS IS THE DOOMED PATH — the owner's agent-sdk×vllm removal (Fable, in flight) reroutes local reliable → summarize→vllm GUIDED DECODING, which handles the big schema. RE-OBSERVE reliable after removal lands.** Note: reliable's commit→flush window will be extraction-DURATION (seconds, humanly raceable) unlike cheap's ms — the BARRIER decision waits on the re-observed window size. **OBSERVABILITY GAPS found (fix owed, vllm summarize is about to be THE local extraction route): (1) `createVllmSummarize`/`runVllmChatCompletion` have NO wire capture + NO provider log — total blind spot; (2) the 180s-failure engine-churn class.** Raw evidence: scratchpad reliable-obs/cheap-obs/cheap-race logs; exec cleaned up (alt stack killed, scratch DB isolated, owner daemon + engines untouched/healthy).

**═══ OBSERVED ROUND 2 (E2E exec, post-retirement topology: chat-completions×vllm, 7x engine) — INFRA FIXED, FAILURE MOVED UP TO MODEL-ALIGNMENT ═══**
Route VERIFIED `backend=vllm api=chat-completions` every turn; turns 4.5–7.3s, 0 engine errors/loops across 35 completions; prose quality GOOD on this wire. **Extraction now FIRES and the engine honors the full projected schema via guided decoding (2 engine calls per reliable turn, 3/3 isolated probes SCHEMA PARSE SUCCESS ~2.5s). The 180s-hang class is DEAD.** BUT the panel still never populates — TWO NEW blockers, both prompt/alignment NOT infra:
**(R1) Reliable mis-targets refs:** model emits `targetRef:"player"` but the roster actor is named "You" → `resolveActor` arm-3 mints a phantom `cast:player` that NEVER RENDERS (panel projects roster∪sheets only); location goes to a bogus `widgets:[{widgetRef:"location"}]` instead of `scene.location`. Schema-VALID but semantically wrong → silent empty panel, **no throw/no log = a NEW visibility gap (a delta resolving to zero renderable writes is silent)**.
**(R2) Cheap on the hermes wire: model NEVER tool-calls** — tools=7 sent in the array, but all 35 finishes are `stop`, zero `tool_calls`; the roleplay prompt ("weave into prose") suppresses tool use. REGRESSION vs the agent-sdk MCP round (which DID write beats/conditions — the SDK loop drives tool use; the raw wire doesn't under this prompt).
**Race/barrier: MOOT until a write path works** (prior working cheap flush was +5–54ms, sub-perceptual). Evidence: scratchpad reliable2/cheap2 logs, probe2/probe3.mjs, engine request-delta 23→25.
**═══ FABLE ALIGNMENT STINT LANDED (2026-07-27) — R1/R2/R3 + observability KEEPERS; R4 SUPERSEDED mid-flight ═══**
**(A) Summarize observability FIXED, one-home seam:** shared `logProviderSummarizeItem` (backends/kit/provider-log.ts choke point) + wire capture via existing `captureWire`→`/api/_debug/wire/captures` (`api:"summarize"` tag). vLLM (`onWireBody` hook on runVllmChatCompletion, finishReason surfaced) AND OpenRouter (was ALSO dark — same seam). agent-sdk summarize already had batch logs (metered-sub path, not the extraction route). Pinned.
**(B) RESEARCH FINDINGS (against installed vLLM 0.22.1 source + live probes, not priors):** enum-in-json_schema IS token-enforced by xgrammar (live-probed: forced "player"→valid ref); per-call fresh schema = cache-miss recompile **~0.7–2.7s** (acceptable); `tool_choice` auto|required|named all work on hermes, `parallel_tool_calls` default true; **`required` forces calls but DROPS PROSE** (finish=tool_calls, empty content) — fatal on a char turn, PERFECT for a prose-less tool round; OR `strict:true` json_schema already binds enums on strict-capable models.
**LANDED KEEPERS: R1** `constrainExtractionSchema` (contracts/rpg/extraction.ts, pure fn injecting per-call roster/widget ref ENUMS into the projected schema — plain JSON Schema out, zero provider-specific code; live-proven: refs resolved "You"/"Moss Bridge"/real widget, every observed mis-target class eliminated) + prompt enumeration fallback; **R2** resolveActor self-aliases (player/you/self/me→user-kind actor); **R3** `rpg.extraction.empty` + `rpg.extraction.phantom` logs. 234 rpg + 30 obs tests green, typecheck:graph clean.
**R4 (char-turn tool guidance) = WRONG SHAPE** — built before the owner's dedicated-tool-round clarification reached it (message queued mid-run). **REDIRECTED: unwind char-turn tool mounting for cheap; build the DEDICATED TOOL ROUND** (own request, state prompt, `tool_choice:required` now FINE [no prose at stake] + a no_changes escape tool, parallel calls, skip the wrap-up generation; ordering reconciliation pre-turn-vs-post-commit = its design to flag; R1 enums apply to tool args too). In flight.
**═══ FABLE TRIPLE-STINT LANDED (2026-07-27, orch spot-verified incl. the firewall Record + PROVIDER_ROLES) — 1132 touched-set tests green ═══**
**(1) `structured` role split LANDED:** PROVIDER_ROLES += "structured" (backend.ts:41), own dispatcher (roles/structured.ts), firewall row `structured:[openrouter,vllm]` (exhaustive Record — posture mirrors summarize, metered sub still excluded; sub's structured channel = chat outputFormat only). Backends: vllm+OR expose BOTH roles from ONE parameterized batch runner; agent-sdk implements the method but stays OUT of the role at the dispatcher (honest — its seam is extractViaChat). **Caller re-homing = facade-routes-by-intent:** `RoleClients.summarize` routes responseFormat→executor.structured, plain→summarize (zero caller churn; moved = rpg extraction/discovery analyze+distill/probes; stayed = memory digests/captions/extract-quiet/imagery/smart-arbitrate/assets). Obs split: `api:"structured"` captures + `provider.structured-item` logs.
**(2) DEDICATED TOOL ROUND LANDED (R4 unwound):** char turn ALWAYS tool-less prose (gather returns tools:[] every mode — pinned in the header comment); cheap = `runToolRound` at flushTurn (6 state tools w/ R1 enum-constrained args + `RPG_NO_CHANGES_TOOL` escape, `tool_choice:required`, no prose, fold via toolCallsToExtraction→SAME RpgStateDelta; agent-sdk host degrades to structured extraction). Live-proven: required forces calls, no_changes→empty delta (never fake writes), parallel 3-call vLLM / 2-call OR, player refs resolve. **⚠ ORDERING = POST-COMMIT (Fable's judgment call, FLAGGED FOR OWNER):** it read "tool round precedes char turn" as CONSUMPTION ordering (round reads the COMMITTED beat at flush; the NEXT char turn consumes the fresh snapshot) — pre-generation would read a beat that doesn't exist yet. Pre-generation-against-uncommitted-state = a larger pipeline move needing an owner ruling.
**(3) SEMANTIC `player` REF LANDED:** canonical wire ref = stable `player` token (enum-led, prompt-explained "currently shown as X"), display name layered as also-valid; PLAYER_SELF_ALIASES (player/you/self/me/the player). **Latent-bug check CLEAN:** actorState keys on stable `user:<id>`/`character:<id>` — persona set/unset mid-game orphans NOTHING (brittleness was only the display-name ref index, now fixed).
**⚠ OWNER NOTE (honest-arms): small local Qwen3-VL UNDER-DECOMPOSES the tool round** (often 1 call where 2-3 planes changed) — model capacity, not code; hosted models decompose reliably. `required`+escape+enums make cheap-on-local never CORRUPT, only sometimes INCOMPLETE. [[plan-for-small-hardware]] class.
**═══ ✅✅ WHOLE-TREE GREEN 2026-07-27: check ok:true/0-failed AND full battery vitest 7686/0 · CT 1465/0/227-suites (one flake = code-editor 2nd strike → remedy dispatched). Battery round-1's two reds resolved: (1) boot-seed kill = REAL bug (owner's .env OPENROUTER_API_KEY armed seedCredentialFromEnv; storage-disabled add THREW and killed boot) → orch fixed: catch `credentials_disabled` → visible warn-skip, anything else fatal; CREDENTIALS_OP_CODES exported via front door; lifecycle test green. (2) the freshness-CT "failure" = a TRUNCATED CT REPORT (bundle build race on the mid-edit tree; 1-suite report = bundle never built — never a real failure; memory [[ct-lane-outside-commit-bar]] updated with the reading rule). **E2E ROUND 3 DISPATCHED (the W4 commit gate):** both modes in final shapes vs live engines — reliable (structured-role captures now visible, flush-window distribution = the barrier number, race probe), cheap (tool round at flush: required+escape+parallel, no-op-exchange probe, under-decomposition rate), steering loop, indicator DOM, + first live SWIPE-consistency drive. After its green report → verifier/stickler on the batch → COMMIT W4.**
**→ GATE-FIX ROUND (Fable): 4 RED stages → whole-tree `pnpm check` GREEN (verify.json ok:true, 0 failed; structure single-pass CLEAN).** Fix notes: structuredClone→JSON round-trip (contracts lib); extraction Records→ReadonlyMap (honest `.get()` killed the eslint red AND both suppressions); flush.ts `"cheap"==="cheap"` WAS vestigial → ternary `mode==="reliable" ? runExtraction : runToolRound`; MESSAGE_ROLES re-spells → derive from `@orb/kit/message-role` + `Exclude<ChatApi,"agent-sdk">`; fabrication casts → typed schema + FABRICATION-OK on the literal's OPENING line (gate anchors there, not the close — lesson). **FULL BATTERY NOW RUNNING** → then E2E round 3 → verify/stickler → W4 commit. **OPEN OWNER DECISIONS (marinara parity audit, orch read both models in full): relationship field (rec YES — closed steering loop, cheap w/ enum machinery) · level on sheet (near-free coin flip; a pool fakes it better) · per-actor skills (rec PARK — full-mode graft field, off-by-default even in hers).**

**═══ OWNER RULING 2026-07-27 (frustrated-final): SEPARATE structured output FROM summarize ═══** "summarize is just ONE part and it's getting truly confusing — we use structured output to summarize stuff but also for other things." The `summarize` ROLE is being used as the generic one-shot constrained-generation channel (rpg extraction — which summarizes NOTHING — rides it; obs captures tag extraction `api:"summarize"`). **Split dispatched to Fable (queued after/with the tool-round stint, its sequencing):** new first-class `structured` provider role = the schema-constrained one-shot PRIMITIVE (backends implement; own firewall row; own obs tag `api:"structured"`); `summarize` returns to meaning SUMMARIZATION (a consumer — may ride the primitive internally); sweep + re-home every executor.summarize caller honestly; agent-sdk mapping = Fable's stated call; batch-vs-single shape = Fable's stated call. No half-renamed tree between stints.

4. **EXTRACTION ORDERING FORK = OPEN, decided EMPIRICALLY (owner 2026-07-27: "check how it actually works in reality, not assume").** Code-read facts: cheap = tools in-turn before prose (both parties fresh, best-effort); reliable AS BUILT = post-commit FIRE-AND-FORGET extraction (engine.ts:1177 → flush.ts) — predicted: player-fresh panel, char block lags current action (transcript compensates), **+ an unpinned RACE: fast next send can assemble before the previous flush lands (silently older state)**. Orch's laid-out options: (A) post-beat + BARRIER (recommended fit w/ ruling 1's lag+indicator), (B) pre-turn extraction (char-fresh but panel stale + per-turn latency), (C) cheap (both fresh, best-effort), (D) extract-twice (both fresh, 2× calls). **E2E exec `a35051138928fbc01` dispatched: multi-exchange REAL conversation drive (reliable then cheap), capturing per-hop wire-capture reminder content/position, commit→flush timing, panel freshness at decision time, does-state-steer, a fast-send RACE PROBE, and (on failure) the exact extraction route + `rpg.extraction.failed` evidence.** Barrier/reorder decision AFTER the observed timeline comes back.

**═══ REFERENCE EXTRACTION-MODE COMPARISON (2026-07-27, scout vs marinara rpg-companion) — RESOLVED by the clarification above; kept for the record ═══**
Marinara has TWO modes, DEFAULT = 1-call: **`together`** (default, 1 call — prompt tells model to APPEND a unified JSON tracker block to its reply [`promptBuilder.js:341`], brace-match it out of the prose after [`parser.js:198-260`]; no tools, no schema-constraint, no 2nd call) vs **`separate`/`external`** (opt-in, 2 calls — dedicated extraction `generateRaw`, regex parse). MAPPING: our **`reliable`** (2-call schema-constrained) ≈ their **`separate`** but WE DEFAULT TO IT (they opt-in); their **`together`** (1-call append-JSON+parse) = a mode WE LACK; our **`cheap`** (inline tools) = a mode THEY LACK (zero tool-calling anywhere in reference). KEY INSIGHT: `together` is WIRE-AGNOSTIC (no tools → the agent-sdk sequential-tool problem that forced `reliable` becomes irrelevant); can't 1-call-schema-constrain because response_format forces the WHOLE output to JSON (kills prose), so they use unconstrained gen + prompt + best-effort parse. FORK put to owner: (A) keep reliable default, just make it work on local vLLM (reroute runExtraction off the max-pro-sub-gated `summarize`); (B) flip to cheap (weak — tools flaky on agent-sdk); (C) ADD a 3rd `together`-style mode (1 call, no tools, wire-agnostic, parse-fragile w/ existing empty-delta backstop) — orch recommended (C) as worth considering. **AWAITING OWNER DECISION.**
**NEXT:** Fable delivers the matrix (per-cell works/fixed/invalid + parallel-vs-sequential) → validate live → commit the W4 batch (rpg-lite loop demonstrably works end-to-end) → then Phase-2 scenario matrix (swipes/cancel-midturn/deleted-turn/two-in-a-row/1:1/multi-char/multi-human + DOES STATE STEER + framing/depth/role live). **LESSONS THIS STINT: VERIFY a subagent's diagnosis myself before relaying to owner as fact; READ files (grep silent-fails on .env — [[sandbox-grep-silent-fail]]); don't over-treat things as security-sensitive; owner trusts Fable's judgment right now.**

- **CORRECTED (2026-07-27 tooling audit, source-verified): `stack.sh restart` does NOT reset the DB.**
  The old "next restart resets" claim was true only while a baseline-squash HASH MISMATCH was pending
  (migrate.ts resets a dev DB solely on baseline-migration-hash mismatch; launched DBs are boot-FATAL,
  never wiped) — that reset happened long ago. The only deliberate wipe is `pnpm seed:demo --fresh`.
  Stack restarts are DB-safe.
- **ENGINE TOOLING AUDIT + SLEEP-MODE DESIGN READY (2026-07-27, `reports/engine-tooling-sync-and-sleep-mode.md`,
  read-only, implementation HELD for post-W4 GO):** drift = no detached engine launch (engines.ts SIGTERM
  trap group-kills — the bit-us-twice class; fix = stack.sh's proven setsid+pidfile pattern) · no
  engines:stop/status verbs · sh files otherwise CLEAN (engines.sh = live venv shim; one shared argv
  builder; e2e rides stack.sh start-fg, not a bespoke stack) · `oracle-steady-clone.sh` = retired-campaign
  candidate (output still test-consumed — owner call). SLEEP MODE: GO — no idle runtime cost (pinned CPU
  backup allocs at sleep() not startup); RAM 2x margin (~25GiB backup vs 72Gi free); frees ~35GiB/card;
  **`/health` stays 200 ASLEEP** (supervisor needs an is_sleeping arm — else respawn confusion);
  **requests during sleep SILENTLY QUEUE, no error** → auto-wake = PRE-DISPATCH gate in client.ts, not
  error-reactive; sleep all 3 engines; auto-sleep timer in the IN-SERVER supervisor via /metrics counters,
  knob `VLLM_AUTO_SLEEP_IDLE_MS` (default 10min); manual sleep = HOLD via `.cache/stack/engines.hold`
  marker (works server-down — the ComfyUI workflow); auto-wake single-flight, 30s-bounded, honest
  ProviderErrors; barrier 15s fits a ~6-8s wake. **GO-TIME ADDENDUM owed: the VRAM PRE-CHECK before any
  wake/cold-start (nvidia-smi free-mem + compute-apps tenant NAMING; refuse loudly, never OOM mid-load —
  owner ruling, generic visible-refusal not box-specific).** Supersedes the 0.28-fallback note in env/index.ts.
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

- code-editor:192 — **2nd strike 2026-07-27; the pre-decided re-press-poll remedy APPLIED but REFUTED as
  a fix** (mech-exec, honest report): under `--repeat-each=20` parallel contention the doc sits stuck at
  `"--color-p"` for the WHOLE 15s poll window — Enter never reaches CM6's accept handler AT ALL (NOT the
  ledgered 75ms-window class; suspect focus loss under CPU-starved workers). Isolated 10/10 green; only
  reproduces under full-file parallel repeat. The poll diff KEPT (strict idiom improvement). **Root-cause
  diagnosis QUEUED (judgment tier, trace-on run needed — one-off `--trace on` override since non-retries
  don't trace); non-blocking (retry-absorbed). Do NOT re-apply re-press variants — the mechanism is
  disproven.**
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

- **S4 (stickler suspicion, PRE-EXISTING, post-W4-commit):** the summarize role's selector supports
  pinning `max-pro-sub` (isSub arm) + agent-sdk ships a summarize impl, but the firewall's summarize row
  denies max-pro-sub — a D107 dead-switch (selectable-but-unreachable). Either remove the selector arm or
  consciously wire the consent-gated path; owner call at pickup. `structured` consciously mirrors it.
- **F5 upgrade (owner "handle properly in full"):** state-round calls into ToolCallRecord/stats — was
  ruled documented-doorway for v1; UPGRADED to a committed early parity-plus wave item (real stats deltas
  + record visibility for the per-turn state rounds), unless the owner objects at spec ratification.

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
