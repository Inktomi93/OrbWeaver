# Retro Workboard — post-burn-down improvement program

> **THIS IS THE WORKING DOC** (owner-stated 2026-07-25). Not law, not a deliverable — the live board.
> Authority for LAW = `docs/architecture/core/**`. `docs/architecture/proposed/**` is PRE-ROLLBACK main-era
> REBUILD REFERENCE — never cite its status as current, never "correct" it.

## ═══ WHY RETRO EXISTS (read `shitsfucked` in MAIN's root — the post-mortem) ═══
Main's own ledger, verbatim: *"We are tired of hunting down invisible bugs. **Everything must be proven.**"*
Its two entries: (1) the SSE bus **dropped `turnCompleted`** so `MessageListSurface` never refetched and the
composer **locked forever** — caused by an RPG query storm (`getHud`/`getEncounter`) making React
unmount/remount the SSE subscription; (2) the multi-speaker engine **threw the characters away** so only the
synthetic "Group" character spoke — `round.ts` was supposed to yield the GM *and* the party.
**BOTH ARE THE SAME DISEASE: features that looked done and silently weren't.** That is the exact class this
program keeps finding (5 half-shipped features tonight), and it is why "drive it live, then pin it" is the
posture rather than paranoia. Judge every finding against that frame.

## ═══ ▶ RESUME HERE (2026-07-25 EVENING — full current state; supersedes everything below) ═══

**TODAY'S COMMIT LEDGER (all LOCAL — nothing pushed to origin, owner hasn't said push):**
`4b18cdbe` post-move check-in (biome useIgnoreFile) → `67ae9abd` BUILD-PLAN/BUILD-QUEUE → history/ →
`bb18ed73` the first side-eye wave (speaker-tag P1 · avatar P2 · slash-strip combobox+option-strip ·
shell-store family brick fix · ARIA sweep · snap nav/watch/pages/mobile · side-eye overhaul) →
`ba1eb63f` recovered design records committed (Backrest saved the rpg-lite cohesion game plan+brief +
marinara research; RULE minted: cited reports get `git add -f`) → `b733a0b0` F6 transport schemas
(zero z.any() across all 22 routers) → `36d0b128` guided Phase-1 + CP-1/CP-2 (details below) →
`a659c48b` guided-generations e2e (first ever; 4 @live legs, server-truth instruments).

**LANDED-UNCOMMITTED:** the `chat.generate` speaker-attribution hole CLOSED (security-executor:
presence-gate on explicit speakerCharacterId, leak-free NOT_FOUND; found via the turn-verb scout —
any member could stamp an ARBITRARY CharacterId onto canon and the message-stamp producers would
render a FOREIGN character's name+portrait) + the persona twin (`assertPersonaOwnedIfExplicit` on
send/impersonate — VALIDATION-ONLY, persona-resolution suite 7/7 ZERO diff; persona pin mechanics are
OWNER-SACRED, see memory). Mute ruled scheduling-not-authorization, documented at the check site.
Red-on-old proven; siblings swept safe (requestTurn eligible-intersects; swipe/continue stamp
DB-loaded ids). Rides the next consolidation commit.

**FOUR LANES IN FLIGHT (path-disjoint):** ① tab-strip container-responsive compression
(labels→icon+tooltip via @container; ContextTabDef gained `icon?` — fixes the side-eye BROKEN miss;
touches client context-tabs + ui) ② agent-drivability family (`/api/_debug/db/chats`+`db/characters`
lists · `--open-chat` ambiguity refusal then DEDUPE the duplicate fixture chats · `__orb.nav
.openCharacter`+`--open-character` · `scripts/dev/seed-chat.ts` heavy seeder · skill/README bake-in)
③ ✅ `d-citation-integrity` gate LANDED (own module on the pd pattern; reserved-range D79–D105
resolves; tree GREEN — no real dangling; both-direction bite proofs; gate count 147→148)
④ ✅ the Rewrite MODAL LANDED (FormDialog composite; `REWRITE_TOGGLES` as-const in contracts/preset;
`composeRewriteSteer` kit fn, catalog-order deterministic; existing fireRewrite wire; e2e leg 2 green
w/ the minimal modal-click edit). **SOURCE TRUTH FOUND: ST Corrections has NO toggle catalog** — the
toggles are editIntros vocabulary; shipped set = style(novella/internet-RP/literary) ·
tense(past/present) · length(concise/expand); perspective/gender excluded as greeting-studio's.
✅ OWNER-RESOLVED (2026-07-25): the toggle-memory was the editIntros/greetings set ("mixed up with
the create-greetings set") — the rewrite modal's lean trio STANDS; the remembered 17-option catalog
arrives with Phase 2's greeting studio where it belongs. **SELECTION-SCOPED REWRITE = PARKED for now**
(owner: "fine without it"; the feasibility verdict is on record if it ever revives). ⑤ ✅ tab-strip container-responsive fix LANDED (per-count
@container thresholds single-homed in shell.css; 5-tab icon-mode headroom 127px PROVEN; shell widths
= icon-mode effectively always — §13 cold-read question for the next side-eye pass; the suppressions
red resolved the GOOD way: the CSS killed a whole ResizeObserver effect + its suppression).

**✅ CONSOLIDATION LANDED — `20627b64` (2026-07-25 evening):** security fix (generate speaker
presence-gate + persona ownership twin) + all four lanes + the stale-comment reconcile + 3
import-sort fixes in ONE commit. Bar: check PASS · vitest 7247/0 · CT 1362/1 (the 1 = the KNOWN
`message-list-surface.ct.tsx` load flake — 3rd hard-fail under battery load today, 9/9 clean
isolated every time; CHIP: root-fix its timing sensitivity) · integrity ok · `_debug/errors` [].

**✅ NIGHT WAVE LANDED (all 4 lanes + reconcile; check GREEN `ok:true failed:[]` + battery GREEN):**
① **PHASE 2 greeting studio** — verbs `character.rewriteGreeting`/`generateGreeting` (owner-gated,
leak-free NOT_FOUND, RETURN-never-write, swept PROBED), `{{base}}` ZWSP-pinned kit pre-sub,
`GREETING_TRANSFORMS` 4-axis catalog, `GreetingStudio` in tier-2 `components/` (CharacterPicker
precedent) mounted in character-editor + draft greeting row, client appends on accept, ZERO
migrations. Design calls RATIFIED: side-LLM lane = `summarize` (caption precedent, NOT `agent`);
kind-widening closed BOTH exhaustive consumers (macros + preset editor — which now surfaces the
greeting templates as editable cards). ② **F2 host⇒floor-0 + `HistoryFloorSeq` brand** — landed in
`resolveHistoryFloorSeq` (clamp.ts — the REAL single authority; the visibility op AND guard both
delegate; see memory). ③ **#18 CTs** (assembly-preview-panel 3 · injections-manager 6; the
QueryBoundary-or-infinite-refetch trap memorized). ④ **Fable design pass on
Context-Panel-Program.md** — CP-4 blueprint (bracket, rosters, states, D71 theming, a11y, registry
deltas) + mockup v2 (rendered PNG). **OWNER RULINGS folded: NO party system — roster is the ONE
membership, tab renamed `rpg.status`; late-game gotchas headed off (ambient strip
location/date/time/weather MODE-AGNOSTIC in lite v1 · goal lines = lite quest tracker, no engine ·
editable-in-place law, corruption-trainer failure named · Status headshots D44 · Inventory currency
line reserved + money = open Q6 · minimap header allowance MA-3 + extensible orbs).** Reconcile
fixes: services.ts optional-chain truth (`guidedActions?.[kind].prompt ?? fallback`), historyFloor
mints in 2 test files, 3 lastInput reads → expect.poll (DEF-14), 2 stale WAIVERS deleted (ratchet
worked), 3 knip un-exports, docs formatted.

**✅ SIDE-EYE ON THE GREETING STUDIO: SHIP** (live generation proven end-to-end — accept grew the
greeting list 3→4; dialog a11y complete; single-homing confirmed: one component, doorway not
duplicate; the 14-chip / 4-axis surface ruled INTENTIONAL vs the rewrite modal's lean trio —
authored content earns the richer catalog). Its two studio-local P3s FIXED inline by the
orchestrator + re-proven (CT 3/3): the editor mount now carries the dialog's one-line explainer
(cold-read gap in the primary home), and each axis label is aria-labelledby-linked to its
ToggleGroup (double-announce killed). Third P3 → facelift ledger: the shared `@orb/ui` Toggle
pressed-state fill is only ΔL≈0.03 off its container — selection leans on text brightness alone;
fix at the PRIMITIVE (stronger pressed accent or a ring), benefits every toggle surface. INFRA
note: :8788 died mid-review + ~3s of Vite-proxy 502s on restart bounced the app to /login and
cost the reviewer drives — watch for recurrence (2nd class of review-killing infra after HMR). **✅ WAVE 2 LANDED (3 lanes + side-eye fixes + reconcile; bar: check green after 2 meta-JSON
formats · vitest 7276/0 · CT green after the one consumer-fixture fix):** ① **worldInfoActivated
in the Preview tab** — "World info — N activated" rows (entry id + keys, "always" for key-less;
honest empty state). TRUTH CORRECTION: the data was NOT on the wire — computed in `wiTrace`, fed
the bus event, DROPPED at `freshTrace`; the contract comment claiming otherwise was aspirational.
New required `AssembleTrace.worldInfoActivated: {id,keys}[]`; ALL literal producers migrated (the
lane got 3 files of them; the orchestrator caught the 4th — chats-section.ct's emptyTrace fixture
— on the quiesced bar; memory updated). ② **Stop-during-hung-arbitration FIXED** — new
`turnAccepted` bus event (26→27) opens the client slot (reuses `pending` phase) before
arbitration; `turnAborted` emits from arbitration-abort; totality: the silent no-eligible exit
emits `turnCompleted(null)`; abort verb already threaded into smartArbitrate (the gap was purely
the affordance). Coupled-site cost of the NEW event paid in full: client total map + count assert
+ **db `chat_events` CHECK baseline regen** (the CHECK derives from the tuple — baseline squash
via `cd packages/db && npx drizzle-kit generate --name baseline`; NO db:generate script exists;
memory updated). `KIND_TO_INTENT` re-homed to contract/results. ③ **F3 pins** — both `satisfies`
subset pins compiled clean (zero drift) + `NOTIFICATION_RECIPIENTS` minted in
contracts/notifications, 3 re-spell sites derive. ④ side-eye P3 fixes (editor explainer ·
aria-labelledby axes) re-proven CT 3/3.

**CHAIN-ARBITRATION STOP — OWNER RULED (2026-07-25): "handle it properly in full."** No known-gap
arm: `turnAccepted` fires at EVERY chain iteration's arbitration start (the
completed→accepted→pending flicker is ACCEPTED as honest UI — the director IS working between
speakers; any ugliness is a facelift concern, not semantics); per-iteration totality; Stop cancels
the WHOLE chain (abort handle must span the loop). Dispatched to the resumed warm Stop lane with a
contracts-touch ban (the 9-seam split owns that dir concurrently).

**✅ WAVE 3 LANDED (bar: check ok:true failed:[] · vitest 7279/0 · CT 1374/0):** ① **the
`contracts/chat` 9-seam split** — index.ts = 178-line re-export front-door (explicit named exports;
noReExportAll); 9 seam files (participants·assemble·messages·producers·bus·metadata·roster·
content-blocks·bulk-import), acyclic DAG, 135 exports 1:1, ZERO consumer edits (root-tsc proof).
Ripples closed by the orchestrator: `.ts`-extension sibling imports (root tsc allows, the
PER-PACKAGE tsconfig doesn't — plugin/'s extensionless style is the law) · **THREE path-keyed
gates went silently green** (bus-payload-allowlist [the credential-leak allowlist] · bus-coverage
· warning-code-coverage — retargeted to bus.ts incl. the ESCAPED-REGEX literals a plain sed
misses, bite re-proven via conformance mustFlag/mustPass) · the scoped-run suite's own fixture
(4th coupled site) · test-presence demanded 6 seam mirror contract tests → index.contract.test.ts
split byte-identical along the seams (6 mirrors + 9-test bus/producers residual; 47/47 total
unchanged; front-door imports kept per D15 — no deep-imports). ② **chain-arbitration Stop IN FULL
(owner ruling honored)** — turnAccepted at every chain iteration's arbitration; per-iteration
totality (no-next-speaker → turnCompleted(null)); Stop cancels the WHOLE chain (the activeTurns
handle already spanned the loop — proven by the hung-iteration-2 int test: only 2 speakers commit,
trailing event = the chain's turnAborted); bus-golden pins turnCompleted→turnAccepted→turnStarted
at the chain boundary; reducer completed→pending re-open pinned; zero contracts edits; 151 green.

**FLAKE LEDGER (both passed-on-retry, root-fix queued):** message-list-surface.ct:309 (4th battery
sighting) · lightbox focus-trap (2nd strike — promoted as warned).

**NEXT (dispatch order):** no-inline-union-redecl repair (G2, audit) · F1 comment-drift sweep ·
facelift ledger (Group-tab loading state · @orb/ui Toggle pressed-fill contrast [side-eye P3,
primitive-level]) · `--contexts N` snap chip · root-fix the two ledgered flakes.

**PUSH POSTURE (owner, 2026-07-25): commit-only — do not push; don't ask again.** Nothing pending
on the owner right now.

**TOOLING STATE:** snap = `--goto/--open-chat/--context-tab` (`__orb.nav`, home
`packages/client/src/agent-nav/` — the client composition-tier directory-module precedent) ·
`--watch` · `--pages N`+`@idx` · `--mobile/--desktop`; lane ② is adding `--open-character` +
ambiguity refusal. side-eye = OPUS, focused-scope discipline, ~8-call MCP budget, §12 repo map
(+seeding/enumeration/two-stacks-trap/checker-badge footguns), §13 blunt-taste+IA mandate, §14 shell
anatomy, flags baked in. Doctrine now LAW in AGENTS.md §4 + agent-doctrine.md: lanes verify SCOPED
(whole-tree gates banned in lanes; orchestrator runs them once, resurrects lanes to fix) + the
harness AUTO-WRITES artifacts (verify.json · test-report.json · ct-flaky.json — read, never re-run).
`__g_*`/`__dc_*` probe fixtures: gitignored + stripped from real-tree gate runs (ORB_GATE_FIXTURES
escape for the conformance suite, proven both directions). The bottom-right ❗N⚠M chip =
vite-plugin-checker overlay (STALE-WORKER caveat: restart the stack before trusting a nonzero on a
quiesced tree; renders in a shadow root — invisible to naive --eval probes).

## ═══ the review-fix wave record (2026-07-25 PM, committed `bb18ed73`) ═══
① P1 speaker-tag leak — the MODEL emits its own tag mid-word under speakerTags; strip was ^-anchored;
now scrubbed inline at persist AND on the streaming ghost row (red-on-old proven) ② P2
removed-character avatar blanking — participant-independent `characterAvatars` producer (personaAvatars
twin) through all 5 read verbs ③ P2 slash-strip keyboard — full combobox semantics via the NEW
`@orb/ui option-strip` primitive (aria-activedescendant, focus never leaves the textarea) ④ BONUS:
persisted `orb:shell` main-era blob (`activeSection:"hubs"`) hard-bricked boot — zustand
`persist.migrate` only fires on version MISMATCH; sanitize rides the always-run `merge` seam at the
createPersistedStore door (family-wide) ⑤ the ARIA sweep (ListRow title-only names + describedby,
room focus-target labeled, real h2s app-wide, "Chat actions for <title>", file-input hidden).
**GUIDED-GENERATIONS PROGRAM (audit DONE 2026-07-25 → the phased plan; THE report is LAW-adjacent:
`reports/stickler/2026-07-25-guided-generations-parity-audit.md` — COMMITTED `ba1eb63f`, incl. the §10
reconciliation against the backup-RECOVERED rpg-lite cohesion game plan, which RATIFIED the
convergence design: ONE ChatInjection channel for ALL steering; persistent guide ≡ tracker block, two
content arms (prose side-gen vs D48 tools), write paths + rewind semantics NEVER unified).**
Verdict: heart came through; builder mostly on base; F6 transport hole FIXED+COMMITTED `b733a0b0`
(zero z.any() across all 22 routers). **THE PLAN (owner asked for it; phases sized so NO rpg is
built — the only rpg obligation now is the one-channel/one-vocabulary discipline):**
**🔁 STANDING DRIVE LOOP (owner, 2026-07-25: "keep driving it; after side-eye each phase make sure
things look like your mockup / the right steps"): the orchestrator drives phase → reconcile → gate +
battery → consolidation commit → OPUS SIDE-EYE VERIFY of that phase's surfaces (focused brief citing
the design doc's expected end state — CP work is judged against Context-Panel-Program.md §1/§4's
layout decisions: consolidated 4-tab strip, labeled talkativeness, reduced panel header, width bump)
→ fix BROKEN → next phase. Do not stop for check-ins between phases; UGLY keeps accruing to the
facelift list. Phase order: guided P1 (LAUNCHED, 4 lanes incl. CP-1/CP-2) → guided e2e → side-eye →
Phase 2 greeting studio → side-eye → then the queued remainder.**
· **PHASE 1 + CP-1/CP-2: ✅ COMMITTED `36d0b128`** (all 4 lanes + integration: typed ChatContextTabId
  in lib/registry-contracts (no-inline-types + a dep cycle forced the home) · ChatContextHeader deleted
  for knip · the __g_/__dc_ probe-strip w/ ORB_GATE_FIXTURES escape (proven both ways) · scoped-lane +
  read-the-artifacts doctrine into AGENTS.md §4 + agent-doctrine.md). Battery at commit: check PASS ·
  7232/0 vitest · CT 0-flaky · integrity/errors clean. Guided e2e ✅ COMMITTED `a659c48b` (4 @live
  legs green; input-survives-failure deliberately CT-only, reason in the spec tail; `previewAssembly`
  = the honest pre-turn steer instrument). Opus side-eye verify ✅ RAN — see the SIDE-EYE WAVE-VERIFY
  block above (ship-with-fixes; the tab-clip fix + Rewrite-modal lanes it spawned are in flight).
  The original launch record: Lane A server/assembly = steer→WI haystack (F4, one-arg) + marker-absent-steer
  → depth-0-injection fallback (the recovered plan's refinement, attaches to F8). Lane B client
  composer/wand (ONE lane, shared files) = rewrite fire surface (F1, client-only over swipe+guided) +
  D57 input-recovery ring/restore-on-error (F3) + steer+speaker (F5) + F8 preset-card honesty. Lane C
  = expose undoContinue/revertContinue (F2 — verbs built+int-tested, need tRPC+menu). THEN the guided
  E2E lane (owner-asked; ZERO e2e exist) — after A–C so it pins the IMPROVED semantics; real journey,
  canon asserted from server truth.
· **PHASE 2:** the greeting studio (the "create opening is lame" fix) — rewrite-existing + make-new +
  transform catalog; `greeting_rewrite`/`greeting_new` GUIDED_ACTION_KINDS arms; results APPEND to
  `characters.greetings` (zero migrations); owner-gated character verbs (buddy-`ask` precedent).
· **PHASE 3 — deferred FOR CAUSE with triggers, do not pull forward:** persistent guides/trackers =
  D59, waits for its rebuild to be the SECOND consumer of the steering-prose kit (lift trigger
  recorded in §10); steer-library TABLE only when a real user-authored library is asked (as-const/blob
  first — recovered-plan precedent); spellchecker later; simpleSend/prompts.json machinery/profile
  hot-swap = NEVER (sanctioned).
· After Phase 1+2: ONE Opus side-eye re-verify pass (new rules: focused scope + taste mandate + §14
  anatomy) covering the group-chat fixes AND the new guided surfaces.
**CONTEXT-PANEL PROGRAM — OWNER'S NAMED NEXT SECTION (2026-07-25). SPEC MINTED:
`docs/architecture/Context-Panel-Program.md`** — CP-1 tab consolidation (Overrides+Group → one
"Settings" tab, kills the P3 clip; build FIRST, parallel-safe with guided Phase 1) → CP-2 width bump
(`--dimension-panel` value amendment via the D71 seed) → CP-3 Trackers embryo (gated on the steering
wave) → CP-4 the OSRS takeover (rpg rebuild; layout decisions recorded in the spec). Open questions
§6 await owner: clamp values · tab name · panel-header de-dup timing. The original chip context:

![The OSRS fixed-screen interface — minimap block over the two-strip tabbed control panel](../reports/design-refs/osrs-fixed-interface.png)
 a persistent non-tabbed header block (OSRS minimap →
our scene banner; the REAL map is MA-3-gated) over one sunken content pane framed by TWO icon-tab
strips — top strip = game state (Party · Stats/Trackers · Inventory · Quests · Journal), bottom
strip = meta (the EXISTING chat tabs Members/Overrides/Injections/Preview demoted, OSRS
settings/logout-style). Fits LAW as-is: it is `defineContextTabs` registry content for the rpg
artifact — no new geography, no pane replacement; the RS *look* must stay a token-clean visual
treatment (themes-are-palettes; the parked `orb-readable` parchment treatment is the natural skin
hook). **The lite-mode EMBRYO ships first**: the convergence design's Trackers tab in the normal chat
tab set — same slot, same registry; graduates to the full takeover at the rpg rebuild. Also recorded:
the orchestrator's own widescreen taste verdict (context panel underfilled — 3 rows in 1080px, bare
unlabeled "50%"; bubble-mode voids at 1920; title duplicated topbar+panel header; dot-size avatars
carry no identity) — items 2–4 are facelift, item 1 is INPUT to this chip, not polish.
**SIDE-EYE WAVE-VERIFY LANDED (2026-07-25): SHIP WITH FIXES.** Delivered-clean: solo/group
applicability gating airtight (conversion drive server-confirmed) · Settings-tab consolidation +
header de-dup · wand gating + speaker submenu · ARIA strong ("Sam can operate all of this") · mobile
clean. **BROKEN: the tab strip STILL clips at desktop default width** (4 word-labels overflow 64px;
CP-1's done-criterion missed — its deferred live receipt hid it) → FIX LANE RUNNING
(container-responsive labels→icon+tooltip, lays the CP-4 rails). **OWNER RULING: Rewrite NEEDS the
modal** ("it has toggle options to guide it") → LANE RUNNING (source Corrections toggle vocabulary →
contracts as-const catalog → composed steer through the existing fireRewrite wire; e2e leg 2 is the
regression guard). UGLY→facelift: solo add-character double-popper stacking; Members-tab underfill
acknowledged until Trackers. Honest-scope note: recent-steers ring not live-verifiable via snap
(session-only, dies on reload) — CT/e2e carry it.
**TURN-VERB CONSOLIDATION QUESTION — RULED NO (scout-verified 2026-07-25):** `generate` vs
`forceCharacterTurn` look like two doors for one concept but diverge on THREE load-bearing axes:
authority (member vs host, matrix.ts:66/70) · locking (lock-free-concurrent-with-send vs
lock-holding) · eligibility (none vs presence-with-deliberate-mute-bypass). Intentional two-door
design per the code's own headers (chat.ts:343-354, turn.ts:953-956/1254) — do not re-raise without
new evidence. **BUT the scout surfaced a REAL HOLE, orchestrator-verified: `generate` validates its
`speakerCharacterId` against NOTHING (turn.ts:1267)** — any member can commit an assistant row
stamped with an ARBITRARY CharacterId (attribution forgery), and the message-stamp-driven name/avatar
producers would render a FOREIGN character's identity in the room (cross-tenant read).
**security-executor lane ✅ LANDED (uncommitted — rides the next consolidation commit)**: presence
validation + leak-free NOT_FOUND on generate; `assertPersonaOwnedIfExplicit` on send/impersonate
(validation-only — persona-resolution suite 7/7 zero diff); mute ruled scheduling-not-authorization
(documented at the check site); sibling sweep = requestTurn/swipe/continue safe by construction;
red-on-old proven (3 tests red on the vulnerable code), turn suite 78/78. Doctrine memory minted:
[[stamped-id-write-boundary-gate]].
**CHIP FAMILY — agent-drivability (2026-07-25, one small lane when convenient; the class = agents
burning discovery calls / ambiguity in the drive loop):**
· `/api/_debug/db/chats` LIST endpoint (harness has per-chat reads, no list — everyone re-derives ids
  via the query cache). Same gate as siblings; consider a matching `db/characters` list row while there.
· **snap `--open-chat` must REFUSE on an ambiguous title** (loud, like its unknown-target refusal) —
  the dev DB holds TWO chats titled "Group UX review — 3 cast" and by-title open silently picks one;
  also DEDUPE that fixture (delete one dup) once no review is mid-flight.
· `__orb.nav.openCharacter(idOrName)` — the characters-section twin of `openChat` (character-detail
  reviews currently click rows by name; same one-hop rationale).
· A heavy-fixture seeder (`scripts/dev/seed-chat.ts`: N messages × M characters) — UI-driving seeds
  honest SMALL fixtures, but long-transcript/compaction/virtualization looks need volume the UI can't
  produce in reasonable calls.
· (DONE in-skill: the two-stacks separate-DB trap + the ❗-badge-is-devtools-noise footgun.)
**ALSO QUEUED (unchanged):** the UGLY facelift list (tab-strip overflow cue · Group-tab loading state)
· the `--contexts N` multi-user snap chip · the ranked remainder below (d-citation gate · F2
host⇒floor-0 · HistoryFloorSeq brand · worldInfoActivated placement (owner leaned Preview-tab) ·
Stop-button-during-hung-arbitration · #18 CTs · the 9-seam split).

## ═══ ▶ the pre-wave block (2026-07-25 early, kept for context) ═══
**TREE: CLEAN. Everything committed.** HEAD = `4887a75b`. Tonight's chain: `4c734060` → `20ac4154` →
`0d26921a` → `073c39b9` → `abec580d` → `f845607a` → `9de029ef` → `5ca8cc53` (the 126-file wave) →
`9cff7257` → `4887a75b`. Whole-tree `pnpm check` PASS · full battery green (CT 1317 pass / 0 fail / 1 flaky).
**OBSERVABILITY HARNESS says the wave landed clean** (`/api/_debug/*` on :8788): `db/integrity` →
`{ok:true, foreignKeyViolations:[], integrityCheck:["ok"]}` · `errors` → `[]` · `db/stats` → **0 audit
failures**. Real evidence for the squashed migration + default flip + crash fix, not an assertion.
**USE THIS HARNESS AS A STANDING STEP** — see [[observability-harness-verify-landings]].
**⚠️ THE ONE THING IN FLIGHT THAT DIED: the side-eye GROUP-CHAT FRONT-END REVIEW (task #31).** The agent was
killed when the process exited; **its work is LOST, nothing landed, re-dispatch from scratch.** Also note
`claude-in-chrome` MCP disconnected and `chrome-devtools` was reconnecting — confirm a browser tool is
actually available before re-dispatching, or the replacement will fail the same way.
**RE-DISPATCH KIT (everything it needs):**
· Stack: `bash scripts/dev/stack.sh status` (was up: server :8788, vite :5173, single-user auto-authed,
  vLLM live on GPU1 so turns are FREE — take them freely).
· **Seeded fixture: chat `chat_01kycthyz9e4e88kqxeqpd0pn2`, title "Group UX review — 3 cast"** — JFC + Mara +
  Niko, `output:per-speaker`, `policy:list`, `speakerTags:true`, 3 greetings + a user turn + a real
  multi-speaker round. Verified via `inspectChatState`: 4 participants / 6 messages / 19 events.
  (DB is DISPOSABLE — seed more freely.)
· Review targets, ranked: ① the ROOM (multi-speaker attribution legibility with 3 replying, avatar/name/
  spacing, does a 3-reply round read as conversation or a wall; streaming reflow BETWEEN speakers) ② the
  4-tab context panel (Members · Overrides · Group · Injections + Preview) incl. **3 surfaces NEVER SEEN**:
  the host-only history-visibility menu item, the **"Limited history" badge**, and the **slash-command
  strip** (type `/`) ③ cast bar + add/**remove** member flow ④ multi-tab GRACEFULNESS (correctness is
  already proven — the open question is jump/flash/scroll-loss in the passive tab) ⑤ responsive + dark +
  keyboard-only a11y.
· **Cross-check UI against server truth** via `/api/_debug/db/chat/:id` (`messages[]` count AND per-row
  `characterId` vs what the room renders; `participants[]` vs the Members panel), poll `/api/_debug/errors`
  after every novel/destructive interaction, re-run `/api/_debug/db/integrity` at the end.
· Judge with computed styles (`inspect`) for colour/contrast/spacing — screenshots lie about both. Classify
  **BROKEN vs UGLY vs FINE**; a facelift is planned, so pure taste notes rank below defects.
· ❌ **NOT a bug — do not re-flag**: `{{char}}` / `{{user}}` inside STORED greetings is standard character-card
  practice and the display path renders them correctly (observed live: Mara's greeting rendered `{{user}}` →
  "You"). I wrongly flagged this once already.
**AFTER THE REVIEW:** fix the BROKEN findings, keep UGLY as a separate list for the facelift.

### ═══ ✅ SIDE-EYE GROUP-CHAT REVIEW LANDED (2026-07-25) — ship-with-fixes 30/40; fix lanes dispatched ═══
**BROKEN (3, lanes dispatched):**
· **P1 speaker-tag leak into message CONTENT** — every streaming turn renders the raw `Speaker:` prefix
  in the bubble (transient), and at least one row is PERMANENTLY corrupted: fixture chat seq 5
  (`message_01kyctjmg6e4e88m0vg5dwr8cd`) stores `"...ship the dumJFC: —b version by Friday..."` — the
  strip spliced mid-word under a token-boundary condition. Fix = strip on the FINALIZED message before
  persistence + handle the streaming display; regression test named for the word-boundary case.
· **P2 remove-character blanks historical avatars** — after Remove, every past message from that character
  degrades to initials fallback (self-heals on re-add). Contradicts member-row.tsx:232's own promise
  ("Their messages stay in the transcript"). Fix = message-row avatar resolver falls back to the character
  record, not initials, when the live participant is absent.
· **P2 slash-strip is click-only** — suggestions render but ArrowDown/Up do nothing, no combobox ARIA
  (composer-slash-strip.tsx:1-8 documents the posture). Keyboard users can type the full command (works)
  but can't pick a suggestion. Fix = aria-activedescendant highlight + Enter-to-pick (focus stays in the
  textarea), per the review's recommendation.
**UGLY (facelift list, do NOT fix now):** 5-tab strip clips at default width with no overflow affordance
(fade/scroll cue); Group tab's text-only "Loading group settings…" (~1.5s) beneath the panel's polish bar.
**VERIFIED GOOD (don't touch):** transcript contrast 6.7–15.7:1 all AA+; slash-refusal error recovery
(role=alert, preserves input, `//` escape proven live end-to-end); multi-tab gracefulness CLEAN (real
2-page drive: passive tab tracked a whole streaming turn, no jump/flash/scroll-loss); kick/leave confirms
correctly scoped, remove-character no-confirm is documented-defensible; all other ARIA clean.
**Receipts:** reports/side-eye/*.png + reports/snaps/*.png; integrity + errors clean at close.
**ARIA/AGENT-NAVIGABILITY SWEEP (orchestrator live drive, 2026-07-25, all sections + settings + ⌘K):**
goal = SR-friendly AND agent-targetable (accessible names are snap --map's selector currency). SYSTEMIC:
① the shared ListRow mashes title+subtitle into row names app-wide (chats "…3 cast You, Mara, Niko, JFC" ·
characters "Mara mara-soul-check" · presets "Default Built-in default") — fix ONCE in the primitive;
② the chat-room focus target (tabindex=-1 DIV, focused on open) has no label → announces the ENTIRE
toolbar as its name; ③ no heading hierarchy outside Settings (LIST titles + detail sections are
paragraphs); ④ chats-list "Chat actions" generic ×N while characters does "Actions for Niko" right;
⑤ stray unlabeled "Choose File" beside "Replace portrait" in character detail. GOOD templates: Settings
modal (h2/h3+landmarks) · characters-list actions · Corpus pressed-group · ⌘K listbox · role=article per
message. Fix lane QUEUED behind the avatar lane (task #2). **BONUS CRASH FOUND+LANE RUNNING: a persisted
main-era `orb:shell` blob (`activeSection:"hubs"`) hard-bricks the app on boot** — registry throws on the
unvalidated persisted id; sanitize-on-rehydrate lane dispatched. TOOLING: chrome-devtools take_snapshot
FLATTENED role=article nodes (12 in DOM, 0 shown) — snap --aria is the trustworthy structure receipt.
**TOOLING ANSWER (snap vs MCP):** the review burned ~45 MCP calls before course-correcting to ~15 snap
calls + 1 hand-rolled 2-page Playwright script. Verdict: snap already covers static/computed checks fully
(`--contrast` corroborated the hand math); the two REAL gaps = **`--watch` (timed screenshot+eval series
during a stream)** and **`--pages N` (multi-page one-context step script)** — with those, this review ≈
8–12 snap calls and near-zero MCP. Upgrade lane dispatched (+ `__orb.nav` action arm + `--goto`, since the
app is state-navigated: 2 URL routes only; + `--mobile`/`--desktop` iPhone-14-Pro-Max/default toggles, owner ask).
**CHIP (deliberately NOT in the lane): `--contexts N` multi-USER mode** — side-eye's gap wording was
"multi-page/multi-CONTEXT"; its concrete ask (built) is N pages/one context (multi-tab, same user). The
multi-context tier = distinct identities per context (the alice/bob multi-human class) and needs
AUTH_MODE=local + credential seeding + invite scripting — the earlier multi-human drive hand-built exactly
this on :8790. Build when the next multi-human proof is needed, not speculatively.
**THEN:** the ranked remainder further down (d-citation-integrity gate · F2 host⇒floor-0 · brand
`HistoryFloorSeq` · worldInfoActivated display · the Stop-button-not-rendered-during-hung-arbitration fix ·
#18's deferred CTs · the `contracts/chat/index.ts` 9-seam split).

## ═══ ✅ PROMOTION EXECUTED (2026-07-25) — retro IS main; ONE folder on disk ═══
The armed ceremony ran to completion (owner-triggered): `legacy-main` bookmarked at the old main HEAD
(+ a final strays commit `9c64387a` carrying the `shitsfucked` post-mortem + pain-points original into git),
both lines pushed BEFORE surgery, then `main` force-with-lease'd to the retro HEAD. **GitHub verified: default
branch `main` = the retro tree** (workboard present; purged `expressions/` 404s); `legacy-main` +
`retro-burn-down` both on origin. **DISK: the two-worktree layout is GONE** — the old `orbweaver/` folder was
deleted (17 dirty agent-sdk files discarded by owner ruling; caches + `.env` rescued first) and
`orbweaver-retro/` was renamed to **`/home/inktomi/inktomi-stack/development/orbweaver`**, now a STANDALONE
repo (real `.git` absorbed, hooks re-linked, HEAD=`main` tracking origin). The 9.5G vLLM store + uv cache
moved with it (same absolute path post-rename, so venv paths + the RUNNING engines survived — all 3 re-ADOPTED
on stack restart with `VLLM_DISABLED=false`). DB + seeded side-eye fixture verified intact (`db/integrity` ok).
**Main-era reference reads now go through the BRANCH, not a folder**: `git show legacy-main:<path>` /
`git grep <pat> legacy-main` / a temp worktree — anywhere this doc says "MAIN's root" or "the main worktree",
read `legacy-main`. Memory files updated; the work-directly-on-main rule applies again (this line IS main).

## ═══ 🎯 CURRENT FOCUS (owner, 2026-07-25): GROUP CHAT — FLAWLESS, INCLUDING THE FRONT END ═══
*"we can leave it for now, i'd like to finish getting everything else flawless with group chat and multi-tab
multi-human and group chat stuff and ensuring the group chat FRONT END looks and works well."*
So: **agent-role / two-tool-loops / agent-runner work is PARKED** (see the pain-point triage below — the
`runAgentTurn` role + `agent-runner.ts` MCP tool-loop are unreachable but deliberately KEPT; 180 lines of
working MCP plumbing aimed at the automation/plugin lane, cheap to keep, expensive to rebuild).
**GROUP CHAT STATUS: mechanics PROVEN, appearance UNREVIEWED.** Done: 16 e2e (group-chat · live-group-modes ·
multi-tab-room-sync) · live multi-human bus proof (3 identities, isolated server, negative half clean) · all
modes verified live · remove-character wired · the cross-tab `getGroupConfig` invalidation bug found+fixed.
**NEVER LOOKED AT** — several surfaces landed sight-unseen: the per-seat history-visibility menu item + the
"Limited history" badge · the slash-command strip · the background/video layer (the BG lane SKIPPED its live
drive to avoid HMR contention with concurrent lanes). side-eye review DISPATCHED (task #31) against a seeded
3-cast fixture ("Group UX review — 3 cast", per-speaker + list + speakerTags, greetings + a real multi-speaker
round). Watch-list handed to it: multi-speaker attribution legibility, **whether `{{char}}` in a stored
greeting RENDERS or shows raw**, streaming reflow across speakers, the 4-tab panel at narrow widths, slash-strip
caret behaviour, and multi-tab update GRACEFULNESS (not just correctness — does the passive tab jump/flash/lose
scroll).

## ═══ THE REAL PAIN-POINT INVENTORY: `docs/architecture/Agent-And-Composition-Pain-Points.md` ═══
Owner-pointed (2026-07-25): *"the pain points are actually here… mind you this is from a time where we HAD
these features, so not all may be applicable."* Dated 2026-07-22, main-era, evidence-tagged
\[MEASURED]/\[CODE]/\[STATED]. **`shitsfucked` (main root) is the narrow RPG-bug ledger; THIS is the
architectural inventory.** Triaged against retro's tree 2026-07-25:
**STILL LIVE (verified in tree):**
· **§3 the agent provider-role HALF-VESTIGE** — `infra/providers/roles/agent.ts` still hardcodes
  `AGENT_BACKEND = "agent-sdk"` + "agent mode is always the agent-sdk", contradicting
  `connection/verbs/resolve-role.ts`'s owner ruling that agent turns ride the CHAT connection. **Two places
  still disagree about what an agent turn routes to.**
· **§3 TWO TOOL LOOPS** — chat's `runRecurseLoop` (`chat/engine/pipeline.ts`) AND agent-sdk's internal
  `agent-runner.ts`. Same "call tool → feed result → repeat" implemented twice. **And the generic loop is
  trapped INSIDE `domain/chat`** — so automation/plugin (the NEXT build) can't reuse it without going
  through chat or reimplementing. ⚠️ This one is on the critical path for the planned work.
· **§4 capability is carried WHOLE on the chat path, HAND-PLUCKED on the agent path** (`ChatRequest` gets
  `capability: ModelCapability`; `AgentTurnRequest` gets scalar flags each caller re-derives). Plus
  \[MEASURED]: capability is **source/model-keyed but real tool-ability is CELL-keyed (source × api)** —
  vLLM hardcodes `tools:{parallel:true}` for every api while `(agent-sdk, vllm)` actually runs tools
  SEQUENTIALLY.
· **§5** vLLM breaks the backend folder convention (`infra/providers/vllm/` not `backends/vllm/` — it owns
  GPU supervision) · agent-sdk keeps its **own turn-state store** beside DB canon (derived cache, but state
  machinery no raw backend has) · **\[MEASURED] parallel tool calls are UNREACHABLE on the SDK path**
  (`disable_parallel_tool_use` lives in the compressed CLI binary, not reachable via `Options`) — external
  constraint, not fixable here.
· **§7 workloads is a GOD-DOMAIN** — 18 runners (was 30+) owned by other domains + 19 Env bundles in
  `contract/runner-env.ts`; jobs organized by MECHANISM (async→workloads) not OWNERSHIP; a new background
  job touches ~6 sites. · **settings is a GOD-FEATURE** on the client (7 surfaces in one feature) ·
  import/export of the same entities live in different places.
**ALREADY FIXED BY THIS PROGRAM:** §8 localStorage hard-brick (the autosave loop) → workboard #11, with the
autosave-convergence property suite as the permanent guard. §3 "every agent-turn caller forks by hand on
`api === "agent-sdk"`" → the purge removed the crew/buddy/rpg callers AND extracting
`createRunChatTurnBridge` put the ONE remaining fork in ONE home.
**N/A (purged):** §2 entity zoo (buddy/crew/party) · §6 crew/agent-principal orchestration duplication ·
§1 "party" two homes · §5 anth-direct · §9 rpg flank. **§1 "agent" means 6 things is REDUCED not gone** —
the identity/seat axes died (`USER_KINDS=["human"]`, 2-member `PARTICIPANT_KINDS`) but provider-role + api +
backend axes remain. **§1 "session" means two things STILL STANDS** (auth session vs agent-sdk resume cache
— a spine rule exists solely to keep them apart).
**THE CROSS-CUTTING SHAPE (still the deep one):** every symptom is a cross-domain concern either
**centralized into a god-domain that must then know about everyone** (workloads, settings) or **fragmented
to mirror a boundary the composition seam never required**. The doc notes the right pattern EXISTS in-tree —
thin core + per-thing descriptor (portability core, character-detail editor-sections, chat-surface anchors) —
but is applied inconsistently. ✅ Tonight's slash-command + tool-renderer registries and the
`resolveViewerVisibility` op are all that sanctioned shape, so the work is drifting the right way.

**DATABANK · PLUGIN · AUTOMATION ARE PLANNED WORK** (owner, 2026-07-25) — *"something we are going to do, but
we are getting our base solid first before we begin."* Their unwired tRPC procs are NOT gaps and NOT debris:
they are deferred until the base is solid. Do not "clean them up", do not build them yet.

> **Living work doc**, not law (the constitution + D-ledger stay authoritative). Written 2026-07-24 so the
> diagnoses and rulings survive context compression. Each item carries its CAUSE (traced, with file refs)
> and its RULING (owner-sanctioned fix shape). Baseline: commit `a4192372` (burn-down complete, full
> battery green: check PASS · 6859 vitest + 1209 CT · e2e 11/11) + `3469212d` (worktree-shared vLLM
> stores) + `34d1829a` (live spec CTA repoint).

## ═══ RESUME-HERE STATUS (2026-07-24 late, compaction-survival — read THIS first) ═══

### ═══ ✅ COMMITTED `5ca8cc53` — 126 files, whole-tree check PASS ═══
Everything below this line that said "uncommitted" IS NOW IN. Contents: the cross-domain
`resolveViewerVisibility` op + **3 leaks closed** · structural enforcement (bus anchor allowlist ·
matrix-keyed reader gate · firehose import allowlist) · `joinHistoryVisibility` default → `full` + the
host-facing setter · delta `slotSeq` (streaming survives the clamp) · slash-command architecture · smart
degrade made LOUD + abort-signal→summarize · delete-during-stream crash + **`chat.delete` 500-on-every-call**
· 16 group-chat/multi-tab e2e · group-config cross-tab invalidation · `chatLayout` VN-debris removal ·
26 chat CTs + the component-presence ratchet · D106 mint + the D79–D105 reserved range.
Session commits: `4c734060` → `20ac4154` → `0d26921a` → `073c39b9` → `abec580d` → `f845607a` → `9de029ef`
→ **`5ca8cc53`**.
**REMAINING (not started, ranked):** ① contracts-audit follow-ups — the **`d-citation-integrity` gate**
(catches the whole D80/D85/D86/D91/D93/D99 dangling class), F3's two `satisfies` pins +
`NOTIFICATION_RECIPIENTS`, the `no-inline-union-redecl` repair (2-member floor + `as const satisfies`
blind spots), F1's comment-drift sweep. ② The **F2 host⇒floor-0 derive** (owner ratified "host has full
control"; the op already passes `role` through so it lands in one place) — also closes `export-chat` +
discovery handing a promoted host full-canon artifacts their `listMessages` withholds. ③ Brand
`HistoryFloorSeq` (flows through `ViewerVisibility` · `PluginHostOps.chat.listMessages.floorSeq` ·
`ExtractQuietParams.historyFloorSeq` — all bare `number` today). ④ `worldInfoActivated` human-facing display
(data is live; needs a placement call — natural home is beside the Preview provenance panel). ⑤ **The Stop
button is NOT RENDERED during a hung smart arbitration** (the turn slot only leaves `idle` on `turnStarted`,
emitted AFTER arbitration) — fix by opening the slot on turn ACCEPT, and pair it with emitting `turnAborted`
from the arbitration-abort path (deliberately withheld today precisely BECAUSE the slot is idle). ⑥ #18's
deferred CT gaps (`assembly-preview-panel`, `injections-manager`). ⑦ `contracts/chat/index.ts` 9-seam split
(now that lanes have settled). ~~PROMOTION to main still armed and un-executed.~~ **EXECUTED 2026-07-25 — see the PROMOTION EXECUTED block above.**

### ═══ CONTRACTS-LAYER AUDIT (Fable 5, 183/183 files read in full) — report: reports/stickler/2026-07-25-contracts-layer-audit.md ═══
**BOUNDARY VERDICT — CLEAN, the strongest structural result of the night.** `packages/contracts` vs
`domain/*/contract` is coherent and consistently applied across all 183 files; **nothing crosses in the wrong
direction.** Practiced rule: wire/domain↔domain/db-derived tuples → `@orb/contracts` (zod-first);
Principal-wrapping params, DI bundles, service interfaces, typed errors, tRPC-inference views → domain
`contract/`. The promotion rule ("promote iff the client deep-imports") is obeyed in ≥4 domains. **The
apparent duplicates are SANCTIONED MIRROR CLASSES verified at both ends — do NOT "fix" them.**
**WHAT'S GOOD (propagate):** the derive machinery SURVIVED the rollback (tuple narrowing auto-propagated to
db enums/CHECKs — only comments strayed); exhaustiveness pins used correctly everywhere;
secret-unrepresentability is ENGINEERED (closed bus unions + brand-protected credentials); fault-isolated
blob parsing is a house pattern; **`workloads/contract/` is the template folder**. Clean with nothing to
report: admin · character · credentials · export · imagery · notifications · persona · search · sessions ·
stats · tag · tool-use · world-info + ~13 contracts modules.
**FINDINGS (ranked):**
· **F1 HIGH — post-rollback COMMENT DRIFT: comments describe PURGED members as live.** `USER_KINDS=["human"]`
  under a comment declaring "`human|agent`" + "AP0-AP4a landed (D99)"; `PARTICIPANT_KINDS` (2 members) under
  a comment claiming a live **`chat.seatAgent` verb that has ZERO definitions** (7 comments repeat the
  claim); `events/index.ts` narrates 4 `crew.*` + 5 `rpg.*` union members (tuple has 2, neither family);
  db headers state a "4-member tuple"/"`human|agent`" while deriving 2/1 correctly. → one comment-
  reconciliation sweep; phrase future intent as "COMMITTED (not yet built)". **Ungateable without permanent
  noise — review-fixed.**
· **F2 HIGH — the D-citation problem** (see the collision section below).
· **F3 MED-HIGH — automation trigger tuples not machine-pinned.** `CHAT_TRIGGER_TYPES`/`DOMAIN_TRIGGER_TYPES`
  CLAIM to be subsets of `ChatBusEvent["type"]`/`DomainEventType` with **no `satisfies` binding**, while the
  sibling `AUTOMATION_TRIGGER_BUSES` in the same file models the correct idiom; the contract test pins the
  tuple against a literal copy of ITSELF. A bus-member rename leaves a trigger that **silently never fires**.
  → two one-line `satisfies` pins (type system beats a gate).
· **F4 MED — live axis re-spells slipping `no-inline-union-redecl` via TWO confirmed blind spots:**
  (a) `MIN_MEMBERS = 3` exempts every 2-member axis; (b) `tupleSig()` requires a bare `AsExpression`, so
  `as const satisfies …` tuples never register as canonical (a live instance of the gate-probe-literal-shapes
  trap). Instances: `PROMPT_TRANSFORM_POINTS` ×2, `ENTRY_POSITIONS` ×3, the notification-recipient axis with
  **no canonical tuple at all** (4 independent spellings), injection-position re-spelled instead of derived.
· **F5 MED — `contracts/chat/index.ts` (1,475 lines) should split along its own 9 banner seams** — AFTER the
  lanes settle (it is the highest-churn merge surface). `theme/` + `plugin/` model the sanctioned multi-file
  module; D15 makes the split consumer-invisible. `preset/index.ts` (1,215) is second.
· **F6/F7 LOW-MED — dead + contradictory:** `DEFAULT_BLUR_SURFACES` exports `["panels","composer","modals"]`
  as "the default set" while the schema default is `[]`, zero consumers; `google_vertex` is an orphan
  metadata arm whose provider tuple has no such member (the db CHECK would refuse it) + a lying db header.
· **F8/F9/F10 LOW — 32 orphan contract exports** (evaluate-intent, not auto-delete — "unwired ≠ worthless"),
  4 sideways deep-imports bypassing front doors, and a 1-line placeholder barrel with zero importers.
**GATE RECOMMENDATIONS (build order):** ① **`d-citation-integrity`** — every bare `D<n>` in `packages/**` +
`core/**` resolves to a registry entry; keyed off the live registry anchors (never a hardcoded ceiling);
built as a 2nd pattern on the `pd-citation-integrity` chassis; FP control = non-`P` left boundary. Catches
ALL of F2. ② F3's two `satisfies` pins + mint `NOTIFICATION_RECIPIENTS` (no gate — the type system is
stronger). ③ **repair `no-inline-union-redecl`** — unwrap `SatisfiesExpression` in `tupleSig()` + drop the
member floor to 2 for the exact-match arm only. ④ optional depcruise front-door arm (probe the
databank↔embeddings cycle risk first). **NOT to gate:** comment drift (noise), orphan exports (fights
"unwired ≠ worthless" — keep `pnpm ast orphans` advisory), contracts file size (ossifies).

### ═══ 🚨 D-LEDGER NUMBERING COLLISION — my error, renumber lane RUNNING ═══
**The rollback dropped D79–D105 from the registry while the CODE obeying them SURVIVED.** Retro's registry
ends at **D78**; MAIN's runs to **D105**. Tonight's mint took "next free = D79" — correct for retro's file,
**WRONG for the repo**: **main's D79 = "ONE structured-output stack"** and retro's surviving code cites D79
in **8 places** with that original meaning (`kit/src/json-schema/index.ts:1`, `.../lift.ts:1,5`,
`contracts/role-clients/index.ts:6,18,93`, `contracts/chat/index.ts:640`, `contracts/plugin/host-v1.ts:138`).
So the new entry made those citations resolve to the **WRONG LAW** — worse than dangling, which is at least
visible. Retro code also cites D80, D81, D82, D85, D86, D91, D93, D99 (all main-era, no retro home).
**FIX (lane running): renumber the visibility entry D79 → D106** (next free above main's D105), fix every
coupled site (title range · intro count · frontmatter · both `Core-Laws-and-Precedents` §7 refs ·
`Core-STATUS` ledger cursor), and add a **RESERVED-RANGE note: D79–D105 are reserved for main-era rulings —
re-mint them from main's registry WITH THEIR ORIGINAL NUMBERS AND MEANINGS as their domains return; never
mint a NEW ruling into that range; next free for new rulings is D106+.** Fix the LEDGER, never the code —
the code's citations are correct and traceable to main.
**LESSON: "next free D-number" must be computed against MAIN's ceiling, not retro's registry.**

### ═══ CROSS-DOMAIN VISIBILITY OP + 3 LEAKS CLOSED (uncommitted) ═══
`resolveViewerVisibility(chatId, userId) → { role, historyFloorSeq } | null` — chat's ONE exported
cross-domain op (contract in `domain/chat/contract/context.ts`, factory
`verbs/resolve-viewer-visibility.ts`, compose-wired once, consumers type-import via the front door).
**`null` for non-member is load-bearing**: the alternative (`{member:false, floor:0}`) is dangerous because
floor 0 MEANS UNCLAMPED — a consumer that forgot the membership test would grant the WIDEST visibility on
exactly the path where the check was skipped. `null` fails closed. The op passes the WHOLE membership row to
`resolveHistoryFloorSeq`, so F2's role-aware derive lands in one place.
**THREE leaks, all the same membership-without-floor mistake — the law's justification:**
1. **F1 plugin fan-out** (as briefed) — `canInstallerSeeFact` moved to `automation/substrate/`, now
   op-consuming; message-shaped facts deliver only at `seq >= floor`; activity-plane facts unclamped.
2. **Plugin membrane `chat.listMessages` — WORSE than F1** (whole transcript vs one row). Every admission
   path (`resolveChatAuthority`, `resolveInvocationChat`, the `events.on` delivery) is membership-only, so a
   clamped installer whose plugin got ANY legitimate post-join fact could read the ENTIRE pre-join
   transcript. Fixed at the ONE per-installer choke all three share (`plugin/substrate/bridge.ts`), and
   `floorSeq` is now a REQUIRED param — reading canon without a floor is no longer EXPRESSIBLE.
3. **🚨 `imagery.extractPrompt` — WIRE-REACHABLE BY ANY CLAMPED MEMBER, no plugin, no admin.** A plain
   `authedProcedure` gated on membership only; `createExtractQuiet` read the last 10 rows via floorless
   `loadCanonHistory` and returned **the side-LLM's DISTILLATION of them as a string on the wire**. Exploit:
   a from-join member calls `extractPrompt({chatId, mode})` and gets an LLM summary of canon their own
   `listMessages` withholds. Fixed: `historyFloorSeq` required, filter applied BEFORE the window slice (so a
   clamped caller still gets a full 10-row window of rows they MAY see).
   ⚠️ **THIS CORRECTS FABLE'S RULING**: its F3 claimed every floorless reader is "room-plane/host-gated, no
   live leak in-domain". WRONG on `extract-quiet.ts` — it is MEMBER-gated. Amend the report.
**Reviewer calls flagged, NOT fixed:** `/api/_debug/db/chat/:id` hands an operator full canon of any chat
(admin-cookie/DEBUG_TOKEN — operator plane, deliberate); `portable-refs::selectInlineReferencedContents`
joins `chat_participants` with **no `leftSeq IS NULL`** so a DEPARTED member's asset export still scans that
room's canon (harmless today — content never escapes, asset exit is owner-gated — one-line predicate if it
ever widens); notification `automation-notice.message` judged activity-plane.

### ═══ RECONCILIATION LOG (2026-07-25) — cross-lane seams I fixed by hand ═══
0. **`activeTurns` fixture (owner caught it).** I patched `persona-resolution.suite.int.test.ts` with a REAL
   `createActiveTurns()`. Wrong: that suite drives only `setChatAnchorPersona` and must NEVER touch in-flight
   turns, so a working registry would SILENTLY ABSORB an accidental reach. Replaced with a loudly-throwing
   `NO_TURNS` fixture per `_support.ts`'s notStubbed idiom ("an accidental reach fails loudly"). The DEP
   itself is correctly REQUIRED — `delete` must abort turns before dropping the row (abort→emit→drop); an
   optional dep would let a miswiring silently skip the abort and resurrect the process-kill.
With ~10 lanes writing one tree, the gate failures at consolidation were all INTEGRATION seams, not lane
defects. Fixed by me (the orchestrator's job — lanes are correct in isolation and can't see each other):
1. **`clamp.ts::canonAnchorSeq`** — `"view" in event && event.view !== undefined` became a provably-dead arm
   once the positive bus key-vocabulary pin landed (`view` is REQUIRED on every member that declares it), so
   eslint `no-unnecessary-condition` red. Dropped the arm; comment now explains WHY the key test alone is the
   whole guard (so nobody "defensively" re-adds it).
2. **`bus.emit` widened to `Promise<number | null>`** (the crash lane's total-emit fix) broke 5 assigning
   sites in `chat.int.test.ts` (the delta/clamp lane's file). Added a local `emitSeq()` that THROWS on null
   rather than publishing a fabricated cursor — a `?? 0` there would silently mis-key the live fan and make
   every clamp assertion meaningless. ⚠️ my first patch was a too-greedy string replace that rewrote the call
   INSIDE the helper → infinite recursion (biome `noParametersOnlyUsedInRecursion` caught it).
3. **`ChatLifecycleDeps` gained `activeTurns`** (crash lane) — it fixed `chat-lifecycle.int.test.ts` but
   MISSED `persona-resolution.suite.int.test.ts:268`. Patched + added the `createActiveTurns` import.
4. **3 dead e2e helpers** (`setGroupConfig`, `removeCharacterFromChat`, `GROUP_TURN_MAX_OUTPUT_TOKENS`
   exported) — knip red. All genuinely unused because the specs chose BETTER paths: group config is set at
   creation via `startGroupChat`, character removal is driven through the REAL UI affordance ("Remove X from
   chat" menu item), and the token ceiling is internal-only. Deleted two, unexported one.
**LESSON: knip `--cache` can go stale across a long multi-lane session** — `node_modules/.cache/knip` needed
clearing before its verdict matched the tree.

### ═══ D79 MINTED — chat read-visibility is now LAW (+ a reconciliation debt) ═══
Home: `docs/architecture/core/Core-Path-Registry.md` (NOT Core-Laws-and-Precedents, which holds the redirect
index). Coupled sites all updated: the entry, the `D1–D79` title range, the intro count, the frontmatter
date, BOTH §7 cross-refs in `Core-Laws-and-Precedents.md`, and the `Core-STATUS.md` ledger cursor (**it was
stale at D77**, predating even D78). `pnpm check:docs` green.
Encodes: canon-row unit · span classification · two planes (ROOM unclamped BY TYPE / VIEWER clamped) ·
membership+visibility inseparable (plugin fan-out precedent named) · one resolver + one chokepoint + three
projections · one `[joinSeq, leftSeq)` interval algebra, join-INCLUSIVE · **default `full`, from-join is a
host OPT-IN** · authority⇒visibility · "the prompt is the room's, the transcript is the reader's" ·
floored-fork-not-per-reader-prompts · invisible history collapses to a visible baseline · one verdict for one
seq across live+durable.
**⚠️ RECONCILIATION DEBT — D79 currently describes the TARGET, and several pieces are UNBUILT or in-flight:**
the branded `HistoryFloorSeq` (HELD), `role==="host" ⇒ floor 0` (F2, HELD), the matrix-keyed reader gate +
firehose import allowlist (in-flight lane), and `resolveViewerVisibility` (in-flight lane). The entry IS
honest about the host-facing setter being in progress but NOT about these five. **BEFORE CALLING THIS DONE:
re-read D79 against the landed code and either (a) confirm each clause is implemented, or (b) amend the entry
to state what is doctrine-pending-implementation.** A ledger that overstates the code is worse than no entry.

### ═══ SYSTEMATIC HALF-SHIPPED SWEEP (2026-07-25) — 7 categories, results ═══
Ran because the pattern was 4-for-4 tonight (removeCharacterFromChat · streamScrollMode · toolCalls ·
joinHistoryVisibility). Categories: A verb-without-transport · B proc-without-client-caller · C
persisted-but-never-read column · D emitted-but-never-consumed event · E setting-nothing-honors · F unused UI
primitive · G unreachable enum arm.
**CLEAN CATEGORIES (a real result):** **A** (no forgotten verb lacking transport) · **C** (no unread column
beyond the already-fixed `joinHistoryVisibility`) · **F** (`pnpm ast orphans ui` → only `handle.ts` ref-type
exports + a trivial `ToolbarSeparator`; **`ToolCallBlock` now confirmed WIRED with 3 client callers** — our
fix landed) · **D-reducer** (`apply-chat-bus-event.ts` is `assertNever`-exhaustive, every member has a case).
**FINDINGS:**
1. **`settings.addExternalBackground` — ⚠️ SCOUT SEVERITY CORRECTED BY ME (was "Medium-High, the
   streamScrollMode shape"; ACTUALLY an unbuilt feature, no broken flow).** I traced it: `BackgroundSourceField`
   (the URL+Apply UI) is used ONLY by chat room-overrides + character appearance, and BOTH materialize
   server-side on write (`chat/verbs/roster.ts:258`, `character/verbs/update.ts:104`) — **those flows WORK**.
   The SETTINGS surface deliberately FILTERS `external` OUT (`appearance-select-items.ts:90` — "a transient
   INPUT-only kind, never a persisted paintable"), so no user can reach a dead Apply. The verb serves a
   DIFFERENT unbuilt feature: adding a URL to the background LIBRARY from settings (verb returns a ready
   `BackgroundLibraryEntry` for the client to append via autosave). Server half complete, UI never built =
   VOLUME not SHAPE ⇒ NOT built tonight. **Lesson: a scout finding is an INPUT — this one's severity was
   wrong because it assumed the Apply button was reachable in settings.**
2. **`worldInfoActivated` — GENUINE GAP (transparency), NOT built.** The server computes which WI entries
   FIRED this turn and emits `entryIds` (`assembly/context.ts:712`, `engine.ts:1091`); automation's
   `fact-resolver.ts:114` consumes it for triggers — but the human-facing half doesn't exist
   (`data/invalidation.ts:61` filter = `nothing`, `apply-chat-bus-event.ts:76` = a no-op case). The code
   comment (`contracts/chat/index.ts` ~L807) explicitly names the ST-precedent `WORLD_INFO_ACTIVATED` display
   hook. Data is fully live; only a display is missing. Natural home = beside/inside the **Preview tab**
   (which already shows assembly provenance). Needs a placement decision ⇒ owner call, not auto-built.
3. **`chatLayout` — ⚠️ NOT a gap: VN-MODE PURGE DEBRIS. ✅ REMOVED (uncommitted).** Clean 2-file deletion
   (`contracts/src/settings/index.ts` + its contract test); repo-wide grep now returns ZERO. **No schema
   version bump needed** — `appearanceSchema` is a plain `z.object` (no `.strict()`/`.passthrough()`), so a
   stored blob carrying `chatLayout:"classic"` parses cleanly, drops the key, and keeps every sibling;
   verified EMPIRICALLY against `update-user-settings-echo-stability.suite.int.test.ts` (7/7) + the
   autosave-convergence fixed-point suite (11/11), not just asserted. The deleted line read
   `// VN-1 — the standard thread until opted into VN` — provenance confirmed. Owner's instinct
   ("check classic against main, see where it originally fed") cracked it. In MAIN:
   `CHAT_LAYOUTS = ["classic", **"vn"**]` (`contracts/settings:386`) feeding `use-chat-layout.ts:21`, an
   `AppField name="chatLayout"` (`appearance-settings-surface.tsx:109`), and a label map whose comment reads
   *"chatLayout (VN-1) — the whole-pane layout mode, orthogonal to the per-message `chatStyle` skin."*
   **`vn` = Visual Novel mode = PURGED.** The burn-down removed the arm + hook + UI and left the field ⇒ an
   INCOMPLETE PURGE, and a single-arm enum that selects nothing is a trap (a future reader assumes a layout
   system exists). Correct action = DELETE, not wire. Lane briefed to handle the versioned-config
   implications properly (persisted rows carry `chatLayout:"classic"`; removal must not throw, wipe siblings,
   or break the autosave-convergence fixed-point suite). `chatStyle` is a DIFFERENT, fully-wired concept —
   untouched.
   **GENERAL TRIAGE LESSON** → [[check-main-for-the-original-consumer]]: when retro has dead scaffolding,
   READ MAIN for what originally fed it — main still has the removed arms + their consumers, so it tells you
   instantly whether it's an unbuilt feature (build) or purge debris (delete). A **single-arm closed tuple is
   the loudest tell**; a fully-wired SIBLING (here `chatStyle`) is the corroborating clue.
4. **NOT gaps — the rollback's honest state:** `automation.*` (11 procs) is self-declared unbuilt
   (`automation-pane.tsx` = `placeholder: true`, the LAST placeholder pane); `databank.*` (16) + `plugin.*`
   (7) have NO client directories at all post-rollback — server domains survived, client wasn't rebuilt yet.
5. **INTENTIONALLY UNEXPOSED (verified, not gaps):** `chat.setChatDocumentVisibility` (host-only per
   `matrix.ts:108`, D85) · `connection.getModelCapability` (consumed server-side by `resolve-role.ts`) ·
   `assets.resolveBlobRefs` (superseded by the chat-scoped twin `resolveChatBlobRefs`, which IS client-called).
6. **UNVERIFIED, likely false positives** (docs assert client consumption, call chain not traced — do NOT act
   without a second pass): `world-info.attachToChat/detachFromChat/listForChat`, `discovery.swipeHotspots/
   similarChats`, `imagery.editImage/extractPrompt/readProvenance`, `tag.bulkAttachTag`.
7. ~~DOC DRIFT: BUILD-QUEUE.md claims A8 "DONE"…~~ **❌ RETRACTED — MY ERROR, owner corrected.**
   `docs/architecture/proposed/**` is **PRE-ROLLBACK MAIN-ERA REBUILD REFERENCE, not our plan** — retro
   exists BECAUSE that line was reverted. `BUILD-QUEUE.md` already carries the marker: *"⚠️ RETRO NOTE
   (2026-07-24): carried from main pre-rollback — the code this describes was purged in the retro burn-down;
   this set is the REBUILD reference."* and `INDEX.md` says *"Re-verify before trusting any set's internal
   status lines — several rotted."* So **"correcting" it to match current reality would DESTROY its value as
   a historical rebuild record.** Do not edit it; do not cite its status claims as current state.
   **THE ACTUAL FAILURE WAS AGENT DISCIPLINE (twice):** the sweep read PAST the marker and used
   "per BUILD-QUEUE wave 5-7 / A8 DONE" to JUSTIFY classifying the unwired `automation.*`/`databank.*`/
   `plugin.*` procs — reasoning from a doc that does not govern us; and I compounded it by proposing a fix.
   Their CONCLUSIONS still stand on INDEPENDENT evidence (the automation pane self-declares
   `placeholder:true`; databank/plugin have no client directories at all post-rollback) — but re-derive from
   code, never from proposed/. **The one authoritative status doc for this line is THIS workboard +
   `docs/architecture/core/**`.**

### ═══ LANE STATUS (2026-07-25, autonomous — owner: "keep going, no stopping for context") ═══
**LANDED, UNCOMMITTED** (nothing committed since `9de029ef` — 5 lanes were live so no clean gate window):
· live-SSE clamp · delta `slotSeq` classification (Fable-RATIFIED) · smart-arbitration degrade warning
· delete-during-stream crash fix (**+ `chat.delete` was returning 500 on 100% of calls** — emit-after-drop is
DOA under FK cascade; now abort→emit→drop, and `bus.emit` is TOTAL, classified off GROUND TRUTH via a row
probe, never off the error code) · 16 group-chat/multi-tab e2e tests · group-config cross-tab invalidation fix
· **joinHistoryVisibility default → `full`** (migration SQUASHED into `0000_baseline.sql` via a scratch
out-dir regen, one-line diff, parity test green; every clamp test now spells `from-join` EXPLICITLY; new pin
asserts the default) · **slash-command architecture** (ONE registry, TWO hosts: composer `/cmd` dispatch +
⌘K palette; the hardcoded "Create" rows became first-class contributions — `/new-chat` owned by
features/chat, `/new-character` by features/character; `SlashCommandContext` projection is the
forward-compat hinge so permissions arrive as PROJECTION fields, never new contribution fields;
`unavailableReason` returns a REASON not a boolean per the no-hiding law; `//` escapes; unknown `/cmd` is
REFUSED with an inline notice, never silently sent; 12 CTs + 17 grammar tests).
**RUNNING (5)**: structural enforcement (positive bus anchor allowlist · matrix-keyed reader gate ·
firehose import allowlist) · abort-signal→summarize (the smart HANG) · cross-domain
`resolveViewerVisibility` op + F1 fix · per-seat history-visibility SETTER · `quickReplySurfaced` dead-wire
triage.
**HELD**: brand `HistoryFloorSeq` (waits for the enforcement lane) · D-ledger mint (⚠️ Fable's ready text
says `from-join` is default — MUST be rewritten for `full` + opt-in + inclusive-joinSeq before minting) ·
F2 host⇒floor 0 · fork baseline batch (F6).
**`quickReplySurfaced` TRIAGED → VERDICT: DON'T BUILD (dead-ENDED pair, not a missing consumer).**
Both producers are complete + compose-wired + the watcher IS running (`lifecycle.ts:249`), BUT **nothing in
the product can trigger either**: the rule arm needs an `automation_rules` row and `createRule` has **ZERO
non-test call sites** (only `tests/**` + the tRPC router — the tell for *API-reachable, product-unreachable*);
the only client automation surface is `features/settings/lib/automation-pane.tsx`, 13 lines,
`body:{placeholder:true}`, **the LAST placeholder pane in the app**. The plugin arm DELIBERATELY withholds
`chat.quick_reply` from snippets (`plugin/verbs/run-snippet.ts:7-10,27`) so only an INSTALLED plugin can emit
— and there is no plugin installer UI (`packages/client/src` has zero refs to `plugin.install`/`runSnippet`).
No orphan UI primitive exists either (unlike `ToolCallBlock`) — the chip would be net-new.
⚠️ **MY BRIEF WAS WRONG ON A LOAD-BEARING FACT**: this does NOT ride the chat bus. It uses its own
`automation:${chatId}` channel with a SEPARATE gated subscription `automation.stream`
(`transport/trpc/automation-bus.ts:18-20`, `routers/automation.ts:142-168`) — the client tails only
`chat.streamMessages`. So the wiring point is a NEW subscription hook (the `use-chat-bus.ts` shape), NOT a
case in `apply-chat-bus-event.ts`. Whoever builds this later must know that.
**THE REAL MISSING HALF IS THE AUTOMATION RULE EDITOR (O1)** — build that and the chip becomes a genuine,
demonstrable requirement of it (and should ship in the same wave, since the chip is the member-facing payoff
of the `surface_quick_reply` arm). Building the chip first inverts the dependency. NOT built tonight: it is a
whole planned feature (VOLUME), explicitly marked DECLARED-PLANNED/unbuilt in the repo's own docs — not an
accidental gap. See [[dead-wire-vs-dead-ended-pair]].
**SERVER-SIDE SLASH-COMMAND DESIGN (scoped, NOT built)**: only 3 plugin contribution kinds exist today
(`PluginTool`/`Transform`/`EventSubscription`, `contracts/plugin/registrations.ts:18,27`, collected at
`plugin-host/sandbox.ts:185,192,199`); **no command capability**, and `plugin.list` returns NO registrations
at all so the client cannot discover them. Proposal: add `"commands.register"` to the closed
`PLUGIN_CAPABILITIES` tuple + a `PluginCommandRegistration` carrying THE SAME four fields the client
contribution does (so the mapper is a projection, not a translation); `collectedCommands` behind a
capability-gated membrane fn; a slim `domain/command/` (NOT inside `tool-use` — a command is not
model-callable). **THE FORK — decide before building**: a tool runs under the INSTALLER's ceiling but a
slash command is HUMAN-initiated. (i) run as the invoking caller = semantically right but the whole membrane
effect surface is written against the installer ceiling ⇒ consent gap. (ii) **installer ceiling ∩ caller's
chat authority** — reuses `resolveInvocationChat` verbatim, keeps "chat tools execute as HOST" intact —
**RECOMMENDED**. Client needs NO new architecture, only an additive **provider arm** on the registry
(`{id, useCommands()}`) so query-result commands coexist with statically-assembled ones (G8 keeps assembly
at the door).

### ═══ OWNER RULING: joinHistoryVisibility DEFAULT → `full` (+ the re-ordered plan) ═══
**RULING (2026-07-25):** *"if you are inviting someone into a group chat they should be able to view previous
turns, that makes the most sense for me"* + *"the host obviously should have full control."* ⇒ the
`chat_participants.joinHistoryVisibility` column default flips **`from-join` → `full`**. Lane dispatched.
The clamp machinery is NOT removed — it is **demoted from default-behavior to an OPT-IN restriction
mechanism**. Presence-ERAS: **accept destruction** (no append-only eras; a future per-era feature is
new-data-only).
**⚠️ VERIFIED: the restriction is currently UNSETTABLE.** Repo-wide sweep: **ZERO** references to
`joinHistoryVisibility` in `packages/client` (no UI) and **ZERO** in `packages/server/src/transport` (no tRPC
proc). The only write hardcodes `"full"` (`verbs/roster.ts:387`). So the clamp is pure mechanism with no way
to invoke it — not merely cold, **unreachable**. A setter (UI + proc) is future work; until then the
structural enforcement below is the ONLY thing keeping it correct.
**RE-ORDERED PLAN (supersedes Fable's §(C) ordering — the default flip landed AFTER Fable wrote it).**
The inversion: with `full` as default + no setter, F1/F2 both require a restricted member and are now
near-unreachable, while the hardening ladder becomes MORE important — compile-time + CI enforcement are the
only things that protect an unexercised path. New order:
  1. **Positive bus anchor allowlist** (contracts test-d) — a new content-bearing bus member is RED until it
     carries a canon anchor. ← DISPATCHED
  2. **Matrix-keyed reader gate** (ts-morph, keyed off `CHAT_VERB_AUTHORITY`, NOT a path list) — a
     member/author-or-host verb may not call the floorless room-plane canon readers. ← DISPATCHED
  3. **Firehose import allowlist** — `subscribeAllChatEvents` importable only by the compose root. ← DISPATCHED
  4. **Brand `HistoryFloorSeq`** (minted ONLY by `resolveHistoryFloorSeq`; a fabricated `0` stops
     typechecking) — HELD until the default-flip lane settles (it owns clamp.ts/queries.ts/guard.ts).
  5. **D-ledger mint + docs** — ⚠️ Fable's ready-to-mint entry text says `from-join` is the default; it MUST
     be rewritten for `full` + "the clamp is opt-in" + "joinSeq is INCLUSIVE" before minting.
  6. **F1 plugin-firehose fix** (real, now narrow) · 7. **F2 host⇒floor 0** (cheap belt) · 8. **fork baseline
     batch / F6** (rare path).
**THE NOT-BUILDING LIST IS REJECTED-FOR-CAUSE, NOT DEFERRED** — do not "finish" it later: a viewer-scoped
repository / clamped DB handle / edge membrane buys the SAME guarantee the ladder reaches, by inverting
persistence (churn for elegance); per-reader assembly + event redaction are incoherent (fork canon, N
assemblies per turn); clamping `getVariables`/`historyTruncated`/id-only payloads/fit numbers is theater and
would BREAK things (blinds a member to their own events); a second clamp home in another domain IS the F1
defect. Only two items are genuinely "not yet": a member-facing recall/search surface (rule defined, no
consumer) and multi-era floor reads (owner ruled: accept destruction).

### ═══ FABLE 5 DESIGN RULING — Presence-Interval Visibility (full report: reports/stickler/2026-07-25-join-history-visibility-model.md) ═══
**THE MODEL.** Unit of visibility = the **canon row** (`messages.seq`); every derived artifact classifies by
the seq-span of the canon it derives from (live stream → its slot, summary → coverage span, digest → block
span, variable delta → its stamp). An artifact with **no canon anchor** (ids, counts, lifecycle, resume
control, current variable values) is room-activity metadata and is **never clamped**.
**TWO PLANES**: the **ROOM plane** (assembly, engine, compaction, quiet extraction, arbitration, automation
fact resolution, the firehose) reads full canon under host authority, unclamped **BY TYPE**. The **VIEWER
plane** (any bytes toward a specific human) is clamped by that human's floor, resolved once at
`requireParticipant`. **THE LAW: membership and visibility are ONE INSEPARABLE ANSWER — no API may report
"member: yes" without handing back the floor in the same value.** One resolver, three projections: SQL
`seq >= floor` · per-event `isBelowHistoryFloor` (closed anchor-carrier set) · per-span `spanWitnessed`.
**The member floor and character witnessing are the SAME `[joinSeq, leftSeq)` interval algebra — never fork
the comparator.**
**ANSWER TO "is the required-floor-param an invariant or a convention?"** — type-forced in only 3 persistence
reads; repo-wide it is a **CONVENTION**, and it has **already failed once outside domain/chat** (F1). Keep
the chokepoint/matrix/one-resolver bones; add the hardening ladder: branded `HistoryFloorSeq` (minted only by
the resolver) · ONE cross-domain `resolveViewerVisibility({chatId,userId}) → null | {role, floor}` · positive
bus key-ALLOWLIST pin (content carriers = `view` | `delta`+`slotSeq` ONLY) · ts-morph gate keyed off
`CHAT_VERB_AUTHORITY` (member-classified verbs may not call floorless canon readers) · firehose importer
allowlist. **EXPLICITLY NOT: a viewer-scoped repository / clamped DB handle / edge membrane — "payoff would
be elegance alone."**
**CONFIRMED FINDINGS**: **F1 MEDIUM LEAK (unfixed)** — plugin event fan-out bypasses the floor: host edits a
pre-join slot → `messageEdited` → unclamped firehose (`compose/automation-watcher.ts:115`) → `fact-resolver`
resolves the variant's CONTENT → `plugin-subscribers.ts:50` gates on `canInstallerSeeFact`
(`automation/persistence/canon-reads.ts:79-82`) which checks **membership only, no floor** → pre-join content
to a clamped installer's guest. Precondition: installer is global admin AND a from-join member. THE proof the
floor is a convention outside chat. **F2 MEDIUM coherence** — host-handoff makes a clamped host
(`participant.ts:166` swaps role only; the resolver ignores role) ⇒ `listMessages` withholds while
`chat.compact` hands them the seq-1 summary. **F4 LOW** — `canonAnchorSeq` keys on carrier names; the
existing secret pin is a DENY-list, so a future content field under a new key bypasses both silently (→ the
positive allowlist). **F6 LOW** — floored fork's variable carry is a hybrid (drops pre-floor slot deltas but
carries pre-floor standalone batches verbatim ⇒ wrong current values + resurfaced pre-join values).
**RULINGS**: (1) `joinSeq` INCLUSIVE — keep (one interval algebra; exclusive forks it + needs a founder
special case). (2) id-only payloads ride through — RATIFY (the floor governs canon CONTENT, never
room-activity facts; same principle answers #4 + F5). (3) **`slotSeq` IS the right shape — RATIFIES the
landed delta lane** (the verdict is inherently per-event: one stream interleaves pre-join-slot and post-join
deltas, so floor-on-subscription is wrong). (4) `historyTruncated` leave as-is, reclassify as resume-control.
(5) firehose unclamped BY TYPE + two structural belts (importer allowlist; every per-member egress consumes
`resolveViewerVisibility` — one mechanism answers #5 AND F1). (6) turn assembly unclamped IS right doctrine —
"the prompt is the room's; the transcript is the reader's" (a turn is ONE shared utterance; per-reader
assembly forks canon; real secrecy = the floored fork). (7) memory/search **swept, NO current leak, proven**
(digests owner-belted via `characters.ownerId`; segments via `ownedChatIds`; documents chat-scope
transport-refused) — BUT closed by the WRONG AXIS (ownership, not membership+floor), so a future
member-facing "search this room" MUST consume the visibility op + `spanWitnessed`. (8) variables: current
VALUES are room-state (no floor — clamping is theater since post-join turns render them anyway); delta
HISTORY collapses to ONE synthetic baseline batch on a floored fork (the variables twin of the
compaction-checkpoint rule) — fixes F6 entirely.
**OWNER ANSWERS SO FAR**: presence-ERAS → **accept destruction, single interval is enough** (no append-only
eras; a future per-era feature would be new-data-only). Host/invite → **"if you invite someone to the room
they should be able to see the room's ENTIRE history; the host obviously should have full control"** ⇒ this
is BIGGER than F2: it implies the `joinHistoryVisibility` **column default should flip `from-join` → `full`**,
demoting the clamp from default-behavior to an opt-in restriction mechanism. **AWAITING CONFIRMATION** +
whether a deliberately-restricted member should also have the AI's knowledge restricted (ruling 6 is moot for
the default case once the flip lands). Turn-assembly doctrine → owner asked for a plain-language explanation,
given.

### ═══ SMART-POLICY FALLBACK (uncommitted) — was CORRECT but SILENT ═══
Owner's design ("smart routes to the side LLM for turn order; if that fails fall back to the math way from
SillyTavern") was **already implemented correctly**. `verbs/turn.ts::arbitrate` → `engine/smart-arbitrate.ts`
(a real `ctx.summarize` call) and EVERY failure mode already degraded to `selectSpeakers({policy:"natural"})`:
op rejects · **sync throw (the small-hardware `provider "vllm" is not wired for the "summarize" role` case)** ·
unparseable · empty · hallucinated names · a muted/left seat (unmatchable — the vocabulary is
`eligibleNamed`). All were **100% SILENT** ⇒ D41 violation. FIXED: `SmartArbitrationResult {speakers,
degraded}`, `degraded` true ONLY when the model was actually consulted and its answer was unusable (the
single-eligible / no-eligible short-circuits stay false — no model called, don't cry wolf), new
`smart_arbitration_degraded` warning code → toast: "The turn director model wasn't available — who speaks
next was picked automatically instead." Tests bite (flip to `degraded:false` → 10 fail; widen the match
vocabulary to all candidates → 2 muted-seat fails). Also corrected the LYING comment in `select-speakers.ts`
(read as "smart is unwired"; the `case "smart"` arm IS reachable — a smart room whose @mention resolved to
nobody eligible falls through with an empty forced list; that is NOT the degrade path, no model was called).
**UNFIXED, NEEDS A CALL — THE HANG**: `smartArbitrate` passes no signal/deadline, `RoleClients.summarize` has
no signal param, `vllm/engine/client.ts::enginePost` sets no fetch timeout ⇒ a box that accepts the socket
and never answers **hangs the whole turn**. The lane refused to invent a constant (a 7B director on slow
local HW can legitimately take tens of seconds). PROPOSED: plumb the turn's existing AbortSignal into the
summarize role so the user's own Stop governs it (matches [[chat-engine-abort-seam]]), NOT a guessed timeout.
Minor: auto-mode re-arbitrates per chained turn ⇒ one warning per turn on a persistent outage (client dedupe
by code is the polish).

### ═══ GROUP-CHAT + MULTI-TAB E2E LANDED (uncommitted) — 16 tests + 3 findings ═══
`tests/e2e/group-chat.spec.ts` 5/5 · `multi-tab-room-sync.spec.ts` 3/3 · `live-group-modes.spec.ts` 8/8.
Instrument = the COMMITTED CANON's speaker sequence (characterId per assistant row, in seq order) + row
count, read from the SERVER never the DOM. Each arm DISTINGUISHES its mode by controlled contrast:
per-speaker vs narrator use the SAME 3-cast + SAME `list` policy so 3-rows-vs-1-row is attributable to
`output` ALONE (and narrator's single author is a real id NOT in the roster = the synthetic group char);
`manual` = a plain send commits ZERO assistant rows (any other policy → ≥1); @mention is run UNDER manual
(policy schedules nobody ⇒ any speaker can only be the override); mute vs talkativeness-0 separated by
ABSENCE vs ORDER; autoMode's assertion is the BOUND (2 chain turns at maxTurns 2).
**FINDING 1 — FIXED: group config did NOT propagate cross-tab.** `BUS_FILTERS.chatUpdated → chatReads()`
covered getChat/listMessages/listMessageVariants/previewContextFit/listChats but **never
`chat.getGroupConfig`** — the Group tab's own read. With `staleTime: Infinity` + no refetchOnWindowFocus, a
2nd tab/device in the same room showed the PREVIOUS room behavior FOREVER; only the writing tab's own
mutation-invalidate refreshed it. Caught RED first, then fixed in `packages/client/src/data/invalidation.ts`
+ the coupled `tests/client/data/invalidation.test.ts` row. **LESSON: `chatUpdated` does not cover a context
tab's OWN read — any new per-room read outside `getChat` needs its own filter on that arm + the
invalidation.test.ts row.**
**FINDING 2 — 🚨 SERVER CRASH, FIX LANE RUNNING: deleting a chat while a turn STREAMS kills the process.**
The next `delta` after the chat row is gone violates the `chat_events.chat_id` FK; nothing catches it ⇒
unhandled rejection ⇒ Node exits. Observed TWICE with stack traces (`bus.ts:44` emit ←
`compose/services.ts:473` emitChatEvent). Real user path (delete from the list mid-turn). Fix brief: abort
the in-flight turn on delete AND make no bus emit able to kill the process (whole class), while keeping
durable-first ordering and NOT blanket-swallowing real DB errors.
**FINDING 3 — a COMMITTED SOLO chat has NO UI to add a character.** `AddMemberPopover` is rendered only by
`ChatCastBar`, which returns null below 2 characters; the Members + Group context tabs are likewise gated at
>1 character. So solo→group conversion is reachable ONLY via the API or by seeding a multi-character DRAFT.
(My earlier live drive did solo→group from a DRAFT, which DOES have the affordance — hence it looked fine.)
NOT FIXED — needs an owner call on where the affordance belongs on a committed solo chat.
**FINDING 4 — the `smart` policy premise is wrong in the docs**: `verbs/turn.ts:403` routes `smart` (no
forced target) to `smartArbitrateVia` — a REAL side-LLM `summarize` call — BEFORE `selectSpeakers` is
reached; the `select-speakers.ts:94-96` natural fallback only applies on the sync path. So e2e-observable
`smart` is the summarizer's behavior, not the documented fallback. Deliberately left uncovered (asserting
the fallback would be a lie; exercising the side-LLM is unscoped spend).
**MINOR**: the `list` form label "Everyone, in order" over-promises — after ban-last, a 2-char cast has ONE
speaker in round 2. And a per-send `maxOutputTokens` intent makes the **agent-sdk** arm fail
(`success-subtype flagged is_error`) — the live spec pins the stateless chat-completions × vllm wire and
restores the route in afterAll.
**OPS FLAG**: every dev-server restart **SPAWNS** an owned `rerank` vLLM engine (`"reason":"no engine
running"`) while embed/gen are ADOPTED — if rerank is meant to be adopted too, that's a supervisor gap.

### ═══ joinHistoryVisibility ENFORCED `9de029ef` — open questions + residue ═══
Single home: `substrate/auth/clamp.ts` (`resolveHistoryFloorSeq` / `isBelowHistoryFloor`), stamped onto
membership by `guard.ts::requireParticipant` (THE chokepoint), consumed as a REQUIRED param by every history
query (so a new caller can't forget it). Replay clamps by CONTENT (`"view" in event`) not cursor —
chat_events.seq and messages.seq are different axes; a post-join edit of a pre-join row rides a HIGH event
seq with a LOW view seq and would sail through a cursor floor. Verified by neutering the floor → 8 tests red.
**TWO ESCALATIONS found beyond the reported symptom (both fixed):** (1) `forkChat` was a FULL BYPASS —
member-classified, deep-copies every slot into a chat where the forker becomes HOST ⇒ a from-join member
could fork and permanently own the whole pre-join transcript; (2) the compaction summary (model prose
distilling canon from seq 1) leaked via getChat + previewContextFit + **redeemInvite/acceptInvite** — the
join response handed a joiner a summary of exactly what their floor withholds.
**⚠️ OPEN QUESTIONS FOR OWNER (low stakes, none blocking):**
· `joinSeq` treated as INCLUSIVE (member sees the last message posted before they arrived). Exclusive (`gt`)
  is one stricter and a ONE-CHARACTER change. Contract wording "only from their joinSeq" read inclusive.
· Id-only bus payloads (a `view`-less `messageCommitted`, `messagesDeleted` naming pre-join ids) ride through
  the clamp — no content, ids resolve only through the now-clamped listMessages, but it IS a weak existence
  oracle. Withholding them would blind a member to their OWN post-join events when a view races a delete.
· A from-join member reconnecting MID-TURN loses that turn's partial token stream (both replay paths).
  Functional cost, not security; doing better needs a schema-level event-log join marker.
**RESIDUE — ranked:** (1) ~~live SSE fan-out unclamped~~ **CLOSED (uncommitted)** — shape (a): `chatEventBounds`
(already the ONE member-gated read the subscription does per yield) now returns `historyFloorSeq`; the yield
site applies `isBelowHistoryFloor` verbatim at ZERO extra I/O. Cursor advances only on delivery ⇒ withheld
row leaves a gap, no stall/re-offer. Host/`full` short-circuit on one numeric compare. Proven to bite.
  ⚠️ **BUT it forced a UX trade → SECOND LANE RUNNING to remove it.** `ChatDeltaEvent` carries no
  messageId/seq so deltas are UNCLASSIFIABLE; the clamp lane conservatively withheld ALL deltas from clamped
  members. Since `from-join` is the DB DEFAULT, that means **every invited member in a room with prior canon
  loses token STREAMING** (messages pop in on commit). Unacceptable — streaming is core feel and multi-human
  group chat is the active focus. PROPER FIX DISPATCHED: put the target slot's seq on `ChatDeltaEvent` so
  deltas get the same per-row verdict → streaming restored for post-join content, pre-join slot deltas still
  withheld (the real leak: a host swiping/continuing a PRE-JOIN slot streams that slot's tokens live).
  Live and replay MUST agree (one emit = one seq, durably logged AND fanned; visibility must not depend on
  whether the client was connected) — that coherence was the clamp lane's core argument, preserved.
  Also flagged by that lane: `subscribeAllChatEvents` (firehose) is unclamped BY DESIGN — sole consumer is
  `entry/compose/automation-watcher.ts` (server-side rule engine under host authority, not per-member
  delivery). Fine today; if anything user-facing is ever wired to it, it needs the same clamp.
  And: `historyTruncated` is computed from the ROOM-wide retained window, not the member's floor — carries
  no content, but a clamped member can be told "history truncated" about rows they never had rights to. (2) Turn ASSEMBLY intentionally unclamped — the prompt builds from
full canon under the HOST's runAsUserId, so a from-join member can trigger a turn and ask the model about
pre-join events; that's room-semantics (the AI's context is the room's, not the reader's), a DESIGN question
not a defect. (3) `chat/memory` recall + `search`/`embeddings` never swept for the join floor — memory's
witnessing gates CHARACTERS not human readers; if any member-facing recall/search returns message bodies
cross-scope it needs the same treatment. **That cluster is unopened — highest-value next security sweep.**
(4) `standaloneVariableDeltas` on fork carry pre-join seq stamps (ChoiceBlock gameplay state, not transcript;
`getVariables` is member-gated with no floor — left alone rather than half-clamping one of two paths).

### ═══ OWNER CHECK-IN RULINGS (2026-07-24, latest — these supersede) ═══
1. **Member-menu doctrine fork → KEEP §8.1 OMIT.** Host-only actions stay HIDDEN for non-hosts (all 7
   incl. the new Remove). "No omissions ever" [[no-separate-reduced-modes]] is about PHASE-GATING (draft →
   committed), NOT PERMISSION gating. No work; do not re-litigate. Memory amended with the scope limit.
2. **#12 held trio → DO ALL THREE**, with a hard guard: **"make sure not to bring back sprites or vn mode."**
   3 lanes DISPATCHED (PD-147 · BG-C/V · section-hint). ⚠️ MAIN STILL HAS THE PURGED SURFACE:
   `packages/client/src/features/expressions/` = `expression-stage.tsx` (the VN stage), `sprite-grid.tsx`,
   `sprite-sheet-cta.tsx`. **BG-C/V is the highest-risk lane** — in main, VN mode composites SPRITES OVER A
   BACKGROUND, so main's background layer may be coupled to the expression stage; that coupling must be
   STRIPPED, background layer stands alone. Every lane was told to grep its OWN diff for
   expression/sprite/vn/pose/rpg before finishing. Retro is otherwise clean (only a harmless
   `spriteSheetOps` naming analogy in a services.ts COMMENT).
3. **Promotion to main → HOLD.** Still armed, no git surgery.
4. **Next verification → MULTI-HUMAN LIVE DRIVE** (dispatched). Needs `AUTH_MODE=local` (stack.sh pins with
   `:=` so a host export wins; dev SESSION_SECRET/LOCAL_INITIAL_PASSWORD already pinned for exactly this)
   + the `localMultiUser` runtime AppSetting (gates `multiHumanProcedure`, which NOT-FOUNDs every invite
   surface while false). 2nd human joins by INVITE ONLY (no addHuman mutation by design). Lane must restore
   AUTH_MODE=single-user when done.

### ═══ POST-CHECK-IN RESULTS (uncommitted at time of writing — lanes still landing) ═══
**MULTI-HUMAN LIVE DRIVE — ALL 6 POINTS PROVEN** (3 real identities alice/bob/carol, `AUTH_MODE=local` +
`localMultiUser`, an ISOLATED 2nd server on :8790 w/ own DB so the owner's stack was never touched; engines
ADOPTED not spawned — PIDs verified unchanged; `costUsd:0`, engine counter 628→630 = local vLLM only).
Proven: invite→redeem seats a human · bob's stream gets alice's msg + the character turn (Qwen3-VL-8B, real
tokens) · `chatsChanged` fans to bob · withhold-then-admit (stream opened pre-join stays silent, then
admits) · **negative half CLEAN**: carol (authed non-member) 0 events, un-cookied 0 events, pre-invite reads
404, **kick mid-stream → bob's open stream gets 0 further frames**.
**BUG FOUND → FIX LANE RUNNING (security-executor): `joinHistoryVisibility` IS NEVER ENFORCED.** Persisted
per-participant (`db/src/schema/chat.ts:421`, `.notNull().default("from-join")`, documented
`contracts/src/chat/index.ts:1043` as "only from their joinSeq") but `read.ts:319-331` `createListMessages`
never reads `joinSeq`/`joinHistoryVisibility`, and neither does the durable replay. Repro: member with
`{joinSeq:7, visibility:"from-join"}` got seqs 1-7 incl. pre-join greetings; `lastEventId:"0"` replayed ALL
665 durable events. Only readers anywhere = schema + roster projection + one write. NOT a membership bypass
(only seated members read) but a declared confidentiality contract doing nothing.
**PD-147 LANDED** (uncommitted): `streamScrollMode` is no longer a LYING NO-OP — full seam (8 src files,
pin-spacer wholesale) + 46 CTs incl. one BEYOND main's set proving `follow` vs `pin-prompt` observably
differ. ⚠️ **The sprite guard CAUGHT A REAL ONE**: main's `chat-behavior-settings-surface` wraps
`<ChatBehaviorForm2/>` + **`<ExpressionsSettings/>`** — the lane dropped the ExpressionsSettings import.
Diff sweep = 6 hits, all false positives (com**pose**r). Also deliberately did NOT take main-era
divergences where RETRO IS AHEAD (main had DELETED `previewContextFit`/`contextBoundaryLabel`/
`contextBoundaryCompactSummary`; diverged on toolRenderers/greeting-union) → see [[port-from-main-hunk-by-hunk]].
**SECTION-HINT LANDED** (uncommitted): `@orb/ui` Section gains optional `hint` → info-icon Tooltip as a
SIBLING of the h3 (never nested — keeps the heading's a11y name clean); ported byte-identical from main;
purged grep clean; CT 4/4.
**BG-C/V LANDED** — carried+video backgrounds WHOLE (server half was already live; client half = set via
chat+card, resolve via true-solo cascade, paint image|video). New `@orb/ui` **background-video** primitive
carries the D44 media policy + its subpath export (the 16th file). Sprite guard clean (only "ex**posed**");
stripped 2 TEXTUAL couplings (a TSDoc "VN/cinematic modes", a purged BG-F reference) and took ONLY
`background: ThemeBackground|null` out of the registry-contracts hunk — left `hasRpgGame`, 5 rpg
surface-anchor arms, ToolRenderer/SlashCommand/HubCard behind. **Fixed a live retro bug en route**:
`theme-background-layer` set `backgroundSize: fit` raw → INVALID CSS for `stretch`/`center`, so 2 of 4 fit
options silently did nothing.

**➡️ #12 HELD TRIO COMMITTED `f845607a`** (42 files, whole-tree check PASS; my OWN independent purged-domain
sweep over the full diff = zero code hits). **The #12 trio is DONE — the original 13-item board is CLOSED.**
STILL RUNNING: joinHistoryVisibility enforcement (task #29, security-executor).
QUEUED (not blocking): a live side-eye drive on a real chat with a video background — the BG lane skipped it
to avoid HMR contention with the concurrent lanes; worth doing now that the tree is settled.

### ═══ OVERNIGHT AUTONOMOUS (2026-07-24 night, Fable 5) — read THIS first ═══

**MISSION (owner, autonomous for the night):** DRIVE THE LIVE APP and prove behaviors, pin them as tests —
**behavior + data-flow, NOT layout snapshots** (a facelift is coming; hard-coded layout tests are banned by
owner). PRIMARY: **group chat**. Prove: all group-chat modes + their special options/types; single-human
multi-character; **multi-human multi-character** (observe flow between two humans, verify the BUS is correct);
add/remove characters to a chat; add/remove humans; **solo→group conversion** (add chars); the group panel in
the context panel is properly set up. The **four-panel context layout is LAW** — verify group mgmt lives
within it, don't invent panels. THEN (ongoing): character options drive the app · presets do what they mean ·
settings apply for real · world-info + guided actions. **RAILS:** local vLLM ONLY (gen :8703 — zero hosted
spend); testing DB is DISPOSABLE (delete/seed freely); serve from THIS retro repo (verify); leave GPU0/ComfyUI
+ the engine launcher alone (engines already up GPU1); no account creation / credential entry / external
irreversible actions — PushNotification the owner on a milestone or a real blocker. Keep THIS doc updated
every chapter so nothing is lost across compaction.

**LIVE GROUP-CHAT VERIFICATION (2026-07-24 night, driving :5173 single-user + local vLLM):**
PROVEN WORKING: solo→group conversion (Add-a-character flips a solo Mara chat to group; context panel gains
the 4-tab LAW layout **Members / Overrides / Group / Injections**, +**Preview** once committed); full group
config surface all wired (Per-speaker/Narrator · policy "Who speaks each round"=Natural incl list/pooled/manual
· cardScope · memberCardVisibility=Character-sheet · autoMode · speakerTags · groupNudge); a real group turn
fired on local vLLM — under per-speaker+natural, **Mara spoke turn 1, Niko turn 2** (ban-last-speaker rotation
WORKS); responses in-character + followed the instruction; variant/swipe + Speak-as-character present; persona
macro {{user}}→"You" resolved. Members panel = CAST section w/ per-seat Talkativeness (50%) + Mute.
**BUGS FOUND (2):**
1. **remove-character was UNWIRED** — domain verb existed, no tRPC/no UI (Cast row menu had only Mute +
   Talkativeness). FIXED+COMMITTED `073c39b9`: tRPC `removeCharacterFromChat` (sweep=PROBED) + client
   "Remove X from chat" menu + tests green. NOTE the executor matched the LOCAL member-row-menu §8.1 OMIT law
   (host actions omitted for non-hosts, 6 siblings + a CT pin it) rather than the "no separate reduced modes"
   memory (disabled-with-reason). FORK FOR OWNER: is "no omissions ever" meant to supersede §8.1 repo-wide?
   That's a separate campaign touching all 6 actions, not this ticket.
2. **Composer does NOT clear on the FIRST (draft→commit) send** — send a msg in a NEW chat: it sends + the turn
   fires, but the composer textarea RETAINS the sent text; the 2nd send (committed chat) clears fine. So the
   draft→commit migration carries the composer text to the new chatId key instead of clearing on send.
   FIXED+COMMITTED `073c39b9` — root cause was a stale-closure key mismatch (clear listener bound to the DRAFT
   scope key at send time); fix = hold onChange in a ref, clear post-commit. CT red-without/green-with.
PREVIEW TAB (assembly-preview-panel, host-only) = the fidelity smoking gun, WORKS: shows the assembled
prompt "What the model will see on the next turn", a token estimate (local QuadChars, advisory), AND a
PROVENANCE panel "Where each field's value came from" (Scenario from Mara, the char description/personality
assembled from the card). For the per-speaker group turn the static system prompt read "You are Mara … write
Mara's perspective ONLY" — so the single-speaker constraint IS correctly in the prompt. → The earlier
multi-character "Mara: … Niko: …" blob in Niko's turn is the small local model (Qwen3-VL-8B) DISOBEYING a
correctly-scoped prompt, NOT an app bug. App fidelity confirmed; model obedience is the weak link (expected
for an 8B). This validates the FE→prompt chain live and is exactly the "prove character options drive the
app" surface.

COVERAGE ALREADY STRONG (assessed, no big gap to manufacture — owner bans shit tests): select-speakers.test.ts
pins ALL policies (natural/list/pooled/manual/smart) + ban-last-speaker + talkativeness + @mention hard
override + eligible-set predicates; emit-chat-changed.int.test.ts pins the chatsChanged fan to EVERY present
human, never a non-member; chat.streamMessages tests pin the per-yield membership gate + kicked-member
mid-stream cutoff + durable-first resume. So the multi-human bus + speaker engine are well-proven at the
integration layer; live-confirmed the happy path. Multi-human LIVE would need multi-user mode + a 2nd identity
(single-user instance) — deferred; integration coverage already carries it.

ROUTE HEALTH BASELINE (pnpm snap, 2026-07-24 night): `/` `/presets` `/characters` `/world-info` `/corpus`
all render CLEAN — nav=OK, page-errors=0, failed-req=0, contrast-fails=0, deadcss=0. No broken routes. PNGs
in reports/snaps/night-*.png. (Minor: long-task ~126-168ms on `/`.) **USE `pnpm snap <route> [--eval …]`**
for further live looks — far lighter than chrome-devtools a11y dumps (owner's steer).
**NEXT AREA (owner's secondary list):** WORLD-INFO injection = VERIFIED + PINNED `abec580d` (5 behaviors:
keyword-fire from pending AND committed-recent haystack, keyword-absent→absent, always-scope, budget-drop +
budget<=0-keeps-all; NO bug — coverage was already solid, closed 2 gaps). STILL PENDING: do presets/settings
actually APPLY? (health clean; presets→wire is already covered by the fidelity harness + the Preview provenance
panel, so marginal — the un-covered bit is SETTINGS runtime-effect: toggle a setting → observe the behavior
change, not just the persist). Multi-human LIVE needs multi-user mode + a 2nd identity (DB disposable — owner
OK'd wiping/seeding); the bus fan-out is already integration-covered. Instruments: the Preview tab + wire-capture
seam + `pnpm snap`.

FULL BATTERY (post-commit, `pnpm test`): vitest all green + CT 1271 passed. ONE CT hard-failed UNDER BATTERY
LOAD — `message-list-surface.ct.tsx:305` (chatOpened non-advancing-cursor seq-guard/invalidation, a
timing-sensitive test) — but PASSES CLEAN IN ISOLATION (9/9, 0 flaky via `playwright test -c
playwright-ct.config.ts message-list-surface`). Confirmed FLAKE not regression (my _ct-stories change was
purely additive — a ChatRoomHarness button + a members-panel prop, never touches the MessageList stories or
the shared chatStream mock). Also: don't run a commit's whole-tree static gate CONCURRENTLY with `pnpm test`
— the gate-conformance tests litter `packages/server/src/domain/__dc_*` transient fixtures that trip
structure:full until they clean up. Serialize commits after the battery.

**FIDELITY/LOCKDOWN WAVE — COMMITTED (this session):**
- `4c734060` — extracted the domain→infra turn bridge into exported `createRunChatTurnBridge`; the #24
  fidelity harness now drives PROD code, not a facsimile (owner caught the facsimile).
- `20ac4154` — **customParameters is BYOK-ONLY** (owner ruling; see [D-LEDGER CANDIDATE] below). Removed from
  OpenRouter (both runners; `mergeCustomParameters` deleted); custom-byo keeps it (preset-wins). D41
  `custom_parameters_ignored` warning on OR. TRUE-WIRE capture: OR capture reparses through the SDK
  `$outboundSchema` (snake_case literal wire) + tripwire test; captureWire threaded into OR+custom-byo (were
  blind); custom-byo scrubs body-borne creds; bridge sets chatId on the stateless arm (debug ?chatId= filter).
- `0d26921a` — multi-surface fidelity matrix (vLLM full-4-layer + OR cc/responses + custom-byo + agent-sdk,
  all through the real bridge; pins OR-drops-customParameters + custom-byo-customParameters-WINS as law) +
  26 chat behavior CTs + a component-presence ratchet (tests/tooling) + #25 custom-byo redirect:"manual" pin.

**[D-LEDGER CANDIDATE — mint when convenient]:** customParameters BYOK-only. First-class/known providers
(vLLM, OpenRouter) use the MODELED sampling surface ONLY (the anti-SillyTavern-sprawl design — one
ResolvedSampling → each backend's wire); customParameters is the passthrough escape hatch for BYOK/unknown
endpoints (custom-byo) where you can't model the endpoint. OR leaked it via the shared chat-completions arm;
removed. Provider routing (`OpenRouterProviderRouting`) is DORMANT/RESERVED (contract + wire projection built,
middle hop unwired, no UI) — owner chose leave-dormant.

**TASKS: #24–#27 DONE. #18 partial** (26 CTs + ratchet landed; deferred gaps flagged: assembly-preview-panel
#28, injections-manager). **#12 held trio** (PD-147 ×8, BG-C/V ×16, section-hint ×2) — awaiting owner's
launch-now-vs-one-beat call. **Promotion to main still armed.**

**POST-ROTATION-4 FIX (2026-07-24, UNCOMMITTED — owner caught it): #24 harness was NOT using prod code.**
The fidelity harness drove a hand-rolled `harnessRunChatTurn` that reconstructed a LOPPED-OFF subset of the
real domain→infra bridge (chat-completions arm only; DROPPED customParameters/tools/toolChoice/
responseFormat/cacheBreakpoint spreads + the final-chunk economics). A fidelity tool testing a facsimile
can't catch a bug in the real mapping. FIX: extracted the inline `runChatTurn` generator from
`buildChatService` (compose/chat.ts) into an exported `createRunChatTurnBridge({ runChatTurn,
getOrSkinTierModels })` — behavior-preserving (2 `input.`→`deps.` swaps, nothing else) — barreled it via
`entry/compose`, and rewired the harness to call the SAME function, injecting only the leaf infra surface
(canned-SSE vllm client + captureWire sink) + a rejecting skin-map (agent-sdk arm unreached). Now the
name/history/max_tokens/DB assertions run through PROD code incl. real economics. Green: 89 files / 1045
chat-domain tests, type-clean; harness 5/5. NOTE: the dropped passthrough fields (customParameters etc.)
are mostly NOT vllm-surfaced — proving those needs a 2nd surface (custom-byo) row = a real follow-up, NOT
faked. Verifier dispatched on behavior-preservation. Files: `packages/server/src/entry/compose/chat.ts`,
`.../compose/index.ts`, `tests/server/domain/chat/wire-capture-fidelity.suite.int.test.ts`.



**COMMITTED (branch retro-burn-down, promotion-ready):** `a4192372` burn-down → `7c31da30` rotation 2 →
`7ff2e410` rotation 3 → `f110bcb7` docs corpus carry → `0272c980` live-sweep red fixes → `cca5037c`
workboard closeout. Tree state at last full run: check PASS, 971 vitest + 1236 CT, **full live e2e
24/24 green** (all 3 vLLM engines on GPU 1, gen has `--override-generation-config repetition_penalty
1.05` as a SESSION mitigation for #23). Original 13-item doc ≈ 10/13 done.

**ENGINE TOPOLOGY (owner reclaimed GPU 0 for ComfyUI):** all 3 vLLM engines hand-launched on **GPU 1**
via `CUDA_VISIBLE_DEVICES=1` + the shared buildEngineSpawnSpec argv (embed :8701 util 0.14, rerank
:8702 0.22, gen :8703 0.5 + rep-penalty 1.05). GPU 0 = owner's ComfyUI. The dev-server adoptive
supervisor adopts these. NEVER run the launcher live to "verify" (spawns real engines — see memory).

**IN FLIGHT (5 lanes, all path-disjoint, dispatched late session — check TaskList + agent inboxes):**
- **#24** fidelity harness + wire-capture seam (infra/providers/backends + tests). WIRE_CAPTURE env
  flag landed (default off, host-read /api/_debug/wire/captures). STEERED late (2026-07-24): the CORE
  harness is an INTEGRATION test — inject the wireCapture SINK via compose dep (rpgTrace-injection
  pattern, bypasses the env), drive turns through the real pipeline against a capture-and-return STUB
  provider (fidelity needs the REQUEST BODY captured at dispatch, NOT a live model), assert 4 layers
  (input / getShapeTrace+peek / captured wire body / canon) over the names-behavior/structure/
  injection/caps matrix. Deterministic, no live stack/GPU/env, gates normally. The @live e2e is a THIN
  optional proof that skips-with-message when WIRE_CAPTURE is off on the operator stack (never false
  pass). Had an in-flight typecheck red (services.ts:280 captureWire/WireCapture.at) — its own to fix.
  Reverted its stray edit to .env (a symlink → MAIN repo's .env; do NOT edit .env). Needs a VERIFIER
  when it lands (a cross-layer-divergence tool must not false-green its own capture).
- **#23 DONE** (uncommitted): sampling-override LAUNCH knob landed — gen argv permanently carries
  `--override-generation-config {"repetition_penalty":1.05}` (env-floor `VLLM_GEN_REPETITION_PENALTY_DEFAULT`,
  admin-retunable `genRepetitionPenalty` field + pending-restart, per-engine emit map). 76 vitest + 17
  CT green. Deferred (→ #24 coord): preset→stateless-body penalty threading (body.ts:62-68 already
  ACCEPTS repetitionPenalty; does a preset populate it?). NOTE: #24 has an in-flight typecheck red
  (services.ts:280 captureWire/WireCapture.at) — #24's own to fix before it lands, NOT #23's.
- **#22 DONE** (uncommitted, awaits consolidation commit): execution-membership verify gate landed —
  new scripts/verify/tests-execution-membership.ts, wired into the registry + package.json + verify-run
  pins + docs. Both directions proven-to-bite (orphan file REDs; empty glob REDs). Real tree clean (no
  orphan/dead-glob). New stage green; the other 6 red static stages are other lanes' uncommitted files.
- **#12-fixes DONE** (uncommitted): all 16 audit items landed — 2 data-loss killed (failing-generate
  keeps prompt; groupOnly survives edit round-trip), warning-notice restored + wired (maps #9's
  context_trimmed_no_summary/compaction_failed), a11y (autosave roles, composer bg-card, turn-abort
  toast, markdown break-words, world-info reorder + handleLabel), 2 restorations (composer-draft-store
  survives remount + migrates on commit; ShapeTrace panel — dropped main's `hint=` since that primitive
  is the held-trio's, panel uses its own Text line), credential dead-doors (inspector + revoke/clear).
  28 unit + 27 CT green. Its #21 flag RESOLVED by orchestrator: inspect.ts:86 already scrubs the
  response bodyPreview by secret VALUE (redactSecretsFromText) — the echo-leak sink is safe. NOT the
  held trio (PD-147/BG/section-hint — still a future wave).
- **#21 DONE** (security-executor, its own review = the verification): 3 scars CONFIRMED-SAFE +
  hardened the BYO inspect redirect credential-exfil (redirect:"manual" host-pin); pinned the 2
  previously-unpinned scars. Spawned **#25** (same redirect fix for custom-byo/runners/chat.ts, behind #24).

**HELD (sequenced, not forgotten):** #12 held trio (PD-147 ×8 files, BG-C/V ×16, section hint ×2 — big
multi-file FEATURES, own wave); **#18** CT coverage expansion (42-scenario mining backlog + presence
ratchet — needs #12's landed components as evidence, runs after #12).

**PROMOTION** armed for owner's go: legacy-main bookmark → `git branch -f main <HEAD>` → worktree
switch → push legacy + force-with-lease main (origin = github Inktomi93/orbweaver). Ceremony is
independent of the in-flight lanes (all additive atop committed rotation 3).

**ALL 5 LANES REPORTED (tree quiescent, uncommitted together)**: #21 (done, security-executor-verified),
#22 (execution gate, both-directions bite), #23 (sampling launch knob, 76+17 green), #12-fixes (16
items, 28+27 green, its #21 flag resolved — inspect.ts:86 scrubs response bodyPreview by value),
#24 (fidelity harness — RESOLVED the fork: agent-sdk has NO observable wire body, captures SDK QUERY
INPUT not a reconstructed HTTP body; matrix all-agree; compose-injected prod-safe sink). #24 IN
VERIFICATION now (a divergence-tool reporting no-divergence must be proven to actually bite —
esp. the null-fingerprint row not passing vacuously on an empty capture).

**IMMEDIATE NEXT (post #24-verify):** run the FULL gate on the quiesced tree (it was red only from
cross-lane uncommitted files — should go green now) + full battery + full live sweep (WIRE_CAPTURE stays
off; the @live fidelity leg skips honestly) → ONE CONSOLIDATION COMMIT for the whole wave (#21/#22/#23/
#12-fixes/#24) → update this block. THEN board = promotion (armed) + #18 (now UNBLOCKED by #12's landed
components) + #12 held trio + #25 (runner-redirect). Details of every item in the sections below.

## Standing rules minted this program (also in agent memory)

- **THE RIGHT WAY, ONCE (owner, 2026-07-24 — relay into every dispatch)**: "we do things the right way
  once even if it means more work. If there isn't something, then we build it (on the orchestrator's
  approval). No shortcuts or cop-outs. E2E testing is how we know our app works the way it is supposed
  to work." A missing seam/affordance/test-hook = a reported gap with a proposed shape, built on
  approval — never a workaround. E2E legs proving the real user journey are expected deliverables;
  a deliberately-deferred proof is named as an explicit known-gap, never silent.

- **Exhaustive, not minimal**: test coverage and handling are exhaustive by owner ruling — build shared
  kits over per-spec dodges; the global quality-over-quantity test preference is overridden here.
- **No separate reduced modes**: a not-yet-ready state (draft/empty/unprovisioned) renders the ONE real
  surface with inapplicable affordances DISABLED — never a sibling reduced component.
- **Hardcoded values and per-provider specials are the enemy** — generalize; single-home every constant
  (env-own it when two homes must agree, with a parity test). REFINED (owner, 2026-07-24): provider
  keying is legitimate SOMETIMES — when the mechanism is provider-NATIVE (no general form exists to
  write; compaction's sdk machinery — CLAUDE_CODE_* knobs, session-frame formats — is the type
  specimen). The discipline: provider-native code lives INSIDE that provider's backend module behind
  the general seam; the disease is provider special-cases in shared/domain code where a capability
  axis should carry the difference. New candidate exceptions = case-by-case, owner call — lanes stop
  and ask, never improvise one.
- **E2E spends nothing**: `tests/e2e/support/global-setup.ts` pins routing.roleDefaults to vLLM/agent-sdk
  before every run; the routing-honesty spec is the regression guard that the pin is HONORED (settings →
  resolved connection → engine-log traffic → canon `model` on the row). Caveat: the seed writes the real
  single-user settings row — running e2e leaves routing pinned to vllm (restore-after is an open decision).
- **The e2e suite is a BASELINE, not scripture**: it is days old and has already needed three of its
  own specs corrected. Lanes cite it as current evidence and improve it freely — never contort new work
  to match an existing spec's shape, and never call any spec "golden"/"the exemplar" in a brief.
- **Failure artifacts + machine-readable results are mandatory runner config**: trace/screenshot
  retain-on-failure (local retries=0 means on-first-retry artifacts never exist for the runs that need
  diagnosing) + a json reporter (extracting failing test names from html output cost real re-runs).
  Applied to both playwright configs 2026-07-24.
- **One token-estimator home**: `@orb/kit/tokens` `estimateTokens` — server fit, previewFit, compaction
  all ride it; the client NEVER estimates (it asks the server).

## ★ ROTATION 3 — LIVE STATUS (2026-07-24, the compaction-surviving truth; supersedes scattered notes)

**Overall program: ~90% of the original 13 items once rotation 3 commits** (8 committed via rotations
1-2; #9/#10/#14 land in rotation 3; #12 audit complete with rotation 4 specced; #18 seeded).

**LANDED + VERIFIED, riding the rotation-3 commit (uncommitted tree)**:
- **#14 DONE** (verifier: argv byte-parity vs the dead shell, lift, topology invariant, single-homing;
  one env rename documented VLLM_GEN_UTIL→_MULTI/_SINGLE; known-gap: restart-to-apply live drive is
  human-supervised). **#10 DONE** (virtualizer kit + spec GREEN live 13.8s; identity locators; doctrine
  README; flake ledger settled — fuzzy-search product-fixed at source, preset-inspector cured by the
  sortable port). **Macro parity DONE** (166 pins incl. 5 owner-ratified divergences; capability map;
  gap ledger parked). **Mining campaign DONE** (42-scenario shortlist; hidden-test sweep; #21/#22
  evidence). **#12 audit COMPLETE** (17/17 ui files; credentials re-verified; rotation-4 = 18 items +
  held trio; devtools hideUntilHover grabbed immediately). **Seq-guard + exemption, rAF batching,
  scrollToAnchor fix, favicon, e2e→tests-dom, baseline regen** — all verified.
- **#9 COMPACTION — built, twice-refuted, twice-fixed, currently REOPENED (4 items, one lane)**:
  the saga: (1) verifier refuted phantom shrinkage → fixed via toShapeCanon coverage exclusion,
  re-verified CONFIRMED with DB-level proof (311→278 tokensIn); (2) the owner's hosted 90% spike found
  provider tokensIn = PER-TURN DELTA on resuming sessions (neo shipped this bug) → trigger reworked to
  fit-estimate-authoritative, re-verified; (3) side-eye's live misadventure found: GAP-1 post-success-
  only trigger = WEDGE (a failing-model chat can never compact; 41K sent to the 32K window), GAP-2
  RESUMED sessions are compaction-blind (marker truncates the SEED only; the live shrinkage proof was
  MASKED by per-send-cap session forks), P1 pct-arm didn't fire at 56.9%/0.5-threshold (hypotheses:
  arm break vs the reviewer's threshold landing on an inactive preset), P2 preset fields blank on
  first paint. THE REOPENED LANE'S PLATE: pre-turn trigger arm + session-stale-on-compaction + pct
  root-cause (chat ids in the #12-audit section receipts) + preset defaults. Commit HOLDS for it.
- **Side-eye verdict on the three new surfaces: 34/40 ship-with-fixes** — render side exemplary
  (peek focus management, honest-degrade copy 8.45:1, admin flow); all four findings fixed-in-full
  per owner: P1+preset-P2 = reopened #9 lane; deployment-facts P2 = LANDED (infra-owned facts from
  the spawn-env single-home → AdminEngineStatus gains port/storePath, no new proc, 16/16 CTs, the
  comment now true); junk presets deleted via API.

**PROMOTION PREP DONE**: the docs corpus carry is green (12 truly-missing files handled: 8 verbatim
incl. rpg 13-lite-mode + the pain-points audit now finally in git; BUILD-QUEUE bannered; UVD
annotated tsgo→ts7; main's test-baseline manifest correctly REFUSED — it would poison the monotonic
gate). KEY INSIGHT for any future promotion diff: the burn-down RELOCATED history/→proposed/ — always
normalize that axis before reading a path-diff as a loss inventory (~100 apparent losses were 12).
Commit order at close: rotation-3 (code + workboard) → docs-carry (the 11 files) → promotion ceremony
(legacy-main bookmark → main -f to this HEAD → worktree switch → push legacy + force-with-lease main,
owner-triggered).

**ROTATION 3 — CLOSED + COMMITTED (2026-07-24)**. Commits: `7ff2e410` (rotation-3 code + workboard),
`f110bcb7` (docs corpus carry), `0272c980` (live-sweep red fixes). **FULL LIVE SWEEP 24/24 GREEN** (all
3 engines up on GPU 1; repetition_penalty 1.05 session mitigation for #23), check PASS, 971 vitest +
1236 CT. The two live reds the full-engine sweep surfaced were BOTH test-calibration (not product
bugs): usedTokens is the wrong shrinkage signal (recall lands in systemTokens, swings the residual —
assert droppedCount + boundary + the canon stamp instead); disposition "cleared" at a tiny ceiling is
CORRECT (empty seed → nothing to resume; history rides the system-prompt marker; backend-agnostic).
The virtualizer raw-vs-rendered fix uncovered + fixed a sweep race and a wrong-chat-by-updatedAt race.

**NEW CHIPS from the live-sweep + sampler investigation**:
- **#23 ESCALATED + code-verified**: the agent-sdk→vLLM wire threads NO samplers (translate.ts:243 =
  maxOutputTokens only; Anthropic Messages has no penalty fields); stateless (openai-compat body.ts:
  62-68) threads them all per-request. So the sdk path CANNOT self-correct — repetition_penalty MUST
  be a vLLM launch default (Qwen3-VL ships 1.0=loops; card recommends 1.05; proven live turn_127 =
  8192-out api_error). Session mitigation live; #23 wires it into engineLaunch permanently + verifies
  preset→stateless penalty threading. HIGH — it corrupts live long-transcript/compaction specs.
- **E2E shared-DB isolation (chip)**: any spec opening listChats()[0] and asserting identity flakes
  when a foreign spec's fire-and-forget write floats another chat to top. Fix: open-by-unique-title
  (done in the virtualizer spec); a `data-chat-id` on the chat-list row makes it a one-liner (@orb/ui).
- **E2E preset-leak on kill (chip)**: a killed STABLE-leg run leaks a tiny-ceiling defaultPresetId that
  poisons live-context-cutoff; idempotent entry-cleanup (mintFreshCharacter pattern) fixes it.

**PROMOTION READY** — rotation 3 committed, full battery + full live sweep green, docs corpus carried.
Ceremony armed for the owner's go (legacy-main bookmark → main -f to HEAD → worktree switch → push
legacy + force-with-lease main). Engines on GPU 1; GPU 0 is the owner's.

**REMAINING AFTER ROTATION 3 (= rotation 4+)**: the #12-completion lane (items 1-17 at exact file
scope + held trio PD-147×8/BG×16/hint×2 + scroll-spy polish — see the #12 AUDIT RESULTS section);
**#18** CT expansion (seeded: 42 scenarios + macro-parity stock + variant-freeze pin candidate);
**#21** SSRF/credential security review (scope tripled: proxy + card-delimiter injection + privilege
precedence); **#22** execution-membership gate (both directions, triple-evidenced); **#23** gen-engine
sampling-override launch knob (the repetition-loop fix — Anthropic wire carries no penalty fields;
rides #14's engineLaunch infra). Parked-for-rebuild ledgers: FUTURE-RELEVANT items (#12 audit),
macro gap ledger, neo anti-swipe-fishing, hosted auto-compact characterization (probe 1 unsettled).

## The work list (task numbers = the session task board)

### #6 — Context-boundary stale-resurrection bug (the "cutoff line after the first message")
- **Cause (traced + pinned-in-test)**: `packages/client/src/features/chat/lib/context-boundary.ts`
  `resolveContextBoundaryMessageId` walks newest→oldest and returns the FIRST NON-NULL
  `contextBoundaryMessageId` — but the newest assistant generation stamping `null` means "everything fit
  this turn" (authoritative), not "no data". One turn that ever trimmed pins a stale divider forever; the
  unit test ("walks past trailing messages…") pins the bug as intended.
- **Ruling**: the newest ASSISTANT generation's stamp is authoritative, null included — return it, skip
  user rows, never walk past a truthful null. Fix resolver + flip the test + a regression case named for
  the symptom. Server fit layer is already honest (`history-budget.ts` returns null on no-drop).

### #7 — Context/output caps threading + previewFit (de-hardcode the vLLM window)
- **Causes**: (a) `VLLM_GEN_CONTEXT_WINDOW = 32_768` in `resolve-model-capability.ts:48` is a hand-copy
  of `vllm-engine.sh --max-model-len 32768` — in sync by discipline only; (b) preset `maxOutputTokens`
  UI field (params-panel) has no clamp against `capability.output.maxTokens.max` despite capability being
  in scope; (c) `maxContextTokens` has NO UI field at all; (d) the resolved model window/output caps are
  shown nowhere; (e) `connection.resolveChatCapability` + `chat.getShapeTrace` are server-built,
  client-unwired.
- **Ruling** (upgraded 2026-07-24, owner-driven): the vllm window's TRUTH ORDER is (1) the ENGINE's
  self-reported `max_model_len` from loopback `/v1/models` (verified live: present on both id + alias
  entries), cached via the house model-cache pattern; (2) the `VLLM_GEN_MAX_MODEL_LEN` env fallback,
  which also drives the launch flag (script `:-` fallback + a text-parity test pinning script↔env
  defaults equal); (3) the static default, loudly absence-degraded. A test pins that the engine's
  answer WINS over env when available. Params-panel: clamp maxOutputTokens, add
  maxContextTokens, render the resolved caps ("N of window used · M reserved"). Wire
  `resolveChatCapability` where the panel needs live caps. **previewFit** (owner-sanctioned, beats ST):
  a model-free chat procedure running the SAME `fitHistoryToWindow` + kit estimator against current
  history+preset+capability, returning boundary id + budget numbers; the divider consumes it (invalidated
  on message-commit + settings change) so the line tracks knob changes live. Canon stamps stay as
  per-generation provenance (fit semantics already match ST: `ceiling = min(window, maxContextTokens)`,
  output reserve subtracted, newest-back fill).

### #8 — Kill the separate draft-mode surface
- **Cause**: the new-chat DRAFT renders its own reduced options surface instead of the committed room's
  surface with unavailable options greyed out. Owner: "really truly hates" it.
- **Ruling**: one surface, disabled affordances (reason tooltips where cheap). The e2e draft-inventory
  pin (being written) is the before-anchor; side-eye verifies the result. After #6/#7.

### #9 — Managed compaction + memory marker + recall cutoff
- **Causes (scouted)**: the memory substrate is LIVE and good (post-turn digest/segment builders,
  vector recall, memory counted in systemTokens BEFORE fit so it can't be squeezed) but: (a) the
  compaction WRITE side was never wired — `chat.compactSummary` is read into assembly, nothing writes it;
  `DEFAULT_COMPACT_INSTRUCTIONS` + `MANAGED_COMPACT_DEFAULT_PCT` are stranded exports; (b)
  `FLAG[recall-livewindow-cutoff]` (`assemble-gather.ts:161`) — recall can't know the fit cutoff at
  gather time; (c) no user-visible memory marker (only the fit divider; memory visibility is a dev panel).
- **Ruling**: (A) post-turn hook (same home as digest build) refreshes compactSummary when usage ≥ the
  managed pct of the effective ceiling OR the fit dropped rows; span = above the fit boundary;
  instructions preset-overridable. Digests = retrieval tier, compactSummary = linear tier, both keyed off
  the same cutoff. (B) NO second marker: the one divider (present-tense via previewFit) carries the
  memory fact ("older messages compacted into memory" + peek affordance). (C) recall's live-window cutoff
  = the PREVIOUS turn's canon boundary stamp (stored provenance). After #7.
- **AMENDED (owner, 2026-07-24, mid-rotation-3 — overrides (A)'s source-agnostic reading)**: compaction
  GENERATION is AGENT-SDK-SOURCE-ONLY (the stateful layer; history-budget.ts's "NOT compaction — the
  graceful agent-sdk-only layer above this" is load-bearing doctrine). PLACEMENT: an existing
  compactSummary occupies the slot at the TOP of assembled history — above all retained turns — for
  EVERY source. CARRY-FORWARD: the summary is durable chat state; a mid-chat swap to a stateless source
  carries the LAST summary in the top slot (never regenerated, never dropped; its staleness relative to
  post-swap turns is accepted by design). No summary ⇒ the slot is empty. The managed knobs
  (MANAGED_COMPACT_DEFAULT_PCT / DEFAULT_COMPACT_INSTRUCTIONS) are agent-sdk-path knobs. The heart-spec:
  agent-sdk chat compacts → swap source → summary still rides the top slot (live-provable at zero spend —
  the local stack serves agent-sdk via vLLM /v1/messages).
- **RESOLVED (owner, same day) — managed means OURS, via the CHAT'S OWN MODEL**: the SDK's native
  compaction event (kind: "compaction") carries token counts but NOT the summary text (the SDK
  compacts internally, never exposing the summary) — capture-from-SDK is impossible. Managed mode:
  WE fire a QUIET NON-CANON GENERATION through the chat's resolved connection (the same model the
  user chats with — NOT the local-light summarizer rail, owner-vetoed for this) carrying the compact
  instructions over the span, and write chat.compactSummary. Agent-sdk-source-gated; SDK auto-compact
  DISABLED (disableAutoCompact) — our managed summary IS that chat's compaction layer. Mechanism
  precedent: the Principal-less quiet-op factory shape (ExtractQuiet). Free on local vLLM; a normal
  visible-cost generation on hosted (cost stays in the chat's stats, never hidden).
- **SEMANTICS SEALED (owner, same day) — FULL-RESET MARKER, chained**: compaction summarizes the
  ENTIRE in-context conversation (previous marker + all turns since) into ONE new marker — "your new
  starting point, like a new conversation; all previous messages fall out into history." NOT a
  rolling keep-recent-verbatim prefix-summary. Post-compaction prompt = system → marker → turns
  accumulated since; the marker stores its coverage point (the span stamp). Nothing deleted — canon
  + scrollback stay complete. THE BOUNDARY IS SOURCE-MODED, ONE CONCEPT ("above this line isn't in
  the prompt"): agent-sdk chat → the marker's coverage point (the stateless fit pass does not manage
  the sdk window); stateless chat → the fit boundary (carried marker above it). previewFit reflects
  the mode per source. Recall's live-window cutoff on sdk chats = the marker's coverage point.
  **AXIS PRECISION (owner)**: every compaction branch keys on the API/RUNNER axis
  (`api === "agent-sdk"` vs the stateless wires) — NEVER the source/backend axis
  (vllm/openrouter/max-pro-sub/custom). Agent-sdk runs against multiple backends; one solution for
  the axis, zero backend-name conditionals in the compaction path (the lane's report must include the
  proving grep). vLLM in probe/e2e = the free local INSTANCE of the general path, never a special case.
- **RULING (owner, 2026-07-24) — COMPACTION CANNOT BE TURNED OFF**: "erroring out is bad UI — you can
  control WHEN it compacts but not compaction itself." Existence is a SAFETY PROPERTY (no chat may
  ever error from context growth). Consequences: the mode enum is auto|managed ("off" killed; stored
  "off" lifts to managed); UNSET resolves to MANAGED (auto can't be the safe floor while its
  non-Anthropic-backend behavior is unverified); the wall gets a terminal belt — pre-turn arm at/over
  window with no usable marker ⇒ forced reseed (fit-trims) + a VISIBLE warning, degraded-and-loud
  never error-and-dead; live-context-cutoff & kin rework to the compaction-by-default reality.
  CAVEAT under verification: SDK-native compact may be Claude-API-exclusive (likely no-ops/breaks on
  the local vLLM backend) — the lane verifies empirically and documents at the disableAutoCompact
  site (plan-for-small-hardware: no silent hosted/local asymmetry). Prior art: neo-tavern
  (~/inktomi-stack/development/neo-tavern) had working compaction — lane mines it read-only
  (reference, not law).

### #10 — Test-infra kit: virtualizer + strict-mode + no-hand-rolled machinery
- **Causes**: (a) the VIRTUALIZER breaks DOM-truth tests constantly (windowed DOM ≠ full canon; the live
  parity spec had to scope to short transcripts); (b) Playwright STRICT MODE friction — multi-match
  locators forcing ad-hoc `.first()/.last()` picks that can silently assert the wrong row; (c) specs
  hand-roll machinery (the tRPC batch wire shape is hand-built in global-setup; row identity is inferred
  from order/content).
- **Ruling**: one support kit: (1) message rows gain `data-message-id` → identity-scoped locator helpers
  (`messageRow(id)`, `assistantRows()`) so `.first()/.last()` is a deliberate choice, not a strict-mode
  escape; (2) `collectVirtualRows` scroll-sweep + `assertVirtualListMatchesCanon` for full-length parity
  on any transcript size (short-transcript specs stay as the fast core); (3) the shared typed tRPC
  support client (extracted from global-setup) is the ONE way specs touch the API — no per-spec wire
  rolling; (4) CT-side equivalents; (5) a short doctrine note in tests/e2e/support (when `.first()` is
  legitimate; helpers-not-hand-rolls). Exception stays: CONTRACT tests deliberately re-spell literals
  (the test-mirror pattern) — the rule is about MACHINERY, not assertion literals.
- **Kit items minted by rotation 2 (fold into the doctrine note + helpers)**: (a) Base UI select in live
  drives = trigger-click → `expect(listbox).toBeVisible()` → `getByRole("option",{name})` (identity,
  never positional `.first()`) → listbox hidden — clicking through the open animation gives the
  "not stable→not visible" flake; (b) DOM attributes driven by a debounced autosave lag the UI action by
  debounce+save+bus-refetch — gate the DOM assertion on a SERVER-state poll (doubles as the stronger
  render-truth proof); (c) e2e tree now rides the tests-dom program (real DOM types in evaluate
  callbacks — no more DomEl bridges/casts); (d) disabled-affordance CTs assert aria-disabled + title
  (unlock condition) + activation-prevention, per the #8 idiom.

### #11 — Autosave draft/server truth inversion (the localStorage brick)
- **Cause (traced)**: `create-autosave-entity-form.tsx:117` seeds `defaults ⊕ serverValues ⊕ draft` —
  the UNVALIDATED localStorage draft outranks the server, and `lastSavedRef = seed` defines the mount as
  clean. Stale drafts display as saved, resurrect onto the server on first touch, and any non-idempotent
  save/echo/projection hop (coercions, the versioned-config lift, zod `.catch`) oscillates save→revert→
  save forever, with `mirrorDraft` re-poisoning localStorage every cycle (why only hard-clear+reload
  recovers).
- **Ruling**: drafts persist `{values, schemaVersion, baselineHash-of-server-snapshot}`; a draft survives
  mount only if zod-valid AND its baseline matches current serverValues (else discarded — the mirror is
  demoted back to crash-survival, never authority). Per-form convergence property test
  `project(echo(save(x))) === x`. Save-driver circuit breaker (N saves/M sec with no user input → error
  state). Repro tests FIRST: mismatched-draft mount fires zero saves; poisoned mount heals to server.

### #13 — Composer re-mount eats keystrokes during room settle
- **Cause (found live by the e2e lane)**: typing immediately after opening a room registers only the
  FIRST character — the composer re-mounts (losing focus + controlled value) when a background query
  settles or a bus/SSE event lands mid-type. Real users lose input on fast room entry. The shared
  `typeAndSend` retry helper works around it in tests — which CONCEALS the defect (why this task exists).
- **Ruling**: trace the remount trigger (key change on draft/room settle? boundary epoch?), fix at
  SOURCE (composer survives room-settle re-renders: stable key or value/focus preservation). The retry
  helper stays as belt but must EXPOSE whether it retried, so an anti-regression live spec can pin
  zero-retry instant typing.

### #12 — Cherry-review main's ui/shell diff (grab fixes, skip abuse)
- **Context**: main's layout worsened via CLIENT-SHELL abuse (sections 7→10: parties/databank/hubs;
  imageStudio/buddyChat modals) — all discarded by the rollback; the ui FACTORIES stayed disciplined
  (their changes are targeted fixes). The DTCG token pipeline is byte-identical both sides (the
  theme-unfucking — light-dark() intents, generated value-sets — predates the snapshot; drift test
  green). All 235 globals.css diff lines read; the skip set is exactly the six rpg §12.2 polish blocks.
- **GRAB (direct, small)**: reduced-motion `!important` hardening (globals.css ×2 blocks); scroll-fade-x
  both-edge rewrite ATOMICALLY WITH its consumer (context-tabs-panel data-fade toggles + epsilon +
  active-tab scrollIntoView fix); shell.css flex-column fix (latent VirtualList seal-throw — region
  wrapper's flex:1 inert without it); app-shell named `main` landmark (a11y).
- **GRAB (executor, test-verified)**: dialog popup `overflow-y-auto` (FormDialog taller than viewport);
  slider `FOCUS_RING` → `FOCUS_RING_HAS` (bare-slider keyboard ring, WCAG 2.4.7); textarea rows-floor
  under `field-sizing: content` (rows={3} collapses to one line); PD-147 pin-prompt stream scroll
  (message-list + pin-spacer + consumer — `streamScrollMode` is currently a LYING no-op setting in
  retro); the 9-flaky-CT root fixes where they touch live primitives; section `hint` tooltip (benign
  additive, optional).
- **VERIFY-THEN-GRAB**: BG-C/BG-V carried+video backgrounds (`useChatBackground`, video layer,
  `background-video` primitive, resolver split) — retro's SERVER already roots carried backgrounds
  (asset-refs BG-C entries live), so the client half makes a half-shipped live feature whole. Both
  halves or neither.
- **SKIP**: six rpg css blocks; dead-domain icon exports; SECTION_IDS/MODAL_SLOT_IDS growth; rpg/
  expression/party/hub stores. **DELETE here**: MenuGroup/MenuGroupLabel (both trees' liveness lenses
  agree). **Backlog note**: token-counter + plugins context tabs are keeper-domain ideas, rebuild-era
  decisions.

### #14 — De-hardcode vLLM: TS engine-launch builder + engine-facts derived + policy single-homed
- **Causes (scout-inventoried)**: the 8192 triple-hardcode (engine script embed/rerank flags +
  LOCAL_LIGHT_WINDOW + character embed-text EMBED_MAX_TOKENS); the gen 32768 script literal not reading
  its env var; concurrency dead-path defaults drifting from the settings floor (4 vs 32); bare GPU-util
  fractions + two different max_pixels; SUMMARIZER_CONTEXT_FALLBACK's coincidental 8192 collision;
  EMBED_REQUEST_TIMEOUT literal. Root disease: the engine LAUNCH SPEC lives in bash
  (vllm-engine.sh) while the supervisor + capability layers are TS reading foundation/env.
- **Ruling (owner-driven)**: move the launch spec to TS — `buildEngineArgv(engine, gpu)` in
  infra/providers/vllm/engine/, reading EFFECTIVE CONFIG (the AppSettings→layer.ts admin-override ??
  env floor ?? code default pattern — the vllmConcurrency precedent), unit-tested. Config tiers by
  apply-time: HOT policy (concurrency/batch/timeouts) = plain AppSettings, applies on next use;
  LAUNCH config (models/max-model-len/utils/max_pixels/TP) = AppSettings-layered too, applied via the
  existing admin Engines section + engine-control RESTART ("restart to apply" affordance — no new
  subsystem); DEPLOYMENT facts (ports/store paths) stay env-only, displayed not edited. The engine
  self-report seam still outranks all config for capability truth, so a misconfigured setting can
  never lie to the fit math. "Good on our machine" dies: another box tunes utils/window in the admin
  UI and restarts engines from the same UI; the supervisor spawns argv directly;
  `engines.sh` → `tsx scripts/dev/engines.ts` using the SAME builder; vllm-engine.sh dies;
  vllm-setup.sh + stack.sh stay shell. Engine-facts derive from the self-report seam (gen-window
  pattern extended to embed/rerank; embed DIM stays env-pinned as a SCHEMA fact + startup probe assert).
  Policy values (utils, max_pixels, timeouts, concurrency) single-home in env/settings.
- **INVARIANT (HMR protection — must not regress)**: in dev, engines are spawned ONLY by the standalone
  entry OUTSIDE the tsx-watch loop; the watched server only ever ADOPTS (probe-first). The pipe-watchdog
  death-coupling wraps OWNED spawns only. The old constant-engine-restart hell came from ownership
  inside the watched process — the refactor changes where flags come from, never the process topology.
  Pin with a supervisor test: a healthy port is adopted, never respawned.

### #18 addendum — launched-suite coverage mining (owner-directed, 2026-07-24)
- **Input**: two scout inventories of LAUNCHED products' e2e/smoke suites — marinara-engine
  (~/inktomi-stack/development/marinara-engine) and SillyTavern
  (~/inktomi-stack/development/neo-tavern/references/sillytavern). Launched suites encode production
  regression history ("they've launched and they might be thorough").
- **Rule**: adapt SCENARIOS (journey + the assertion that matters), never port test code — rebuilt on
  our kit (identity locators, virtualizer sweep, self-seeding mintFreshCharacter, the doctrine README).
  Skip scenarios for features orbweaver deliberately excludes (D47's out-by-design list).
- **Flow**: scout inventories → cross against the current e2e suite + feature map → transfer shortlist
  becomes #18's seed backlog alongside the CT expansion.
- **INVENTORIES LANDED (2026-07-24), the synthesis**:
  - **ST verdict**: effectively ZERO enforced UI-journey coverage (one 12-line title test; the
    7,300-line macro suite isn't in CI). Orbweaver's 21 live specs already exceed the incumbent's
    entire enforced browser coverage. Chat-flow scenarios must be ORIGINATED, not inherited.
  - **SEED BACKLOG — journeys (from marinara)**: edit-during-stream row-dedupe; historical
    peekPrompt returns THAT turn's prompt not latest; swipe-toggle flip-flop never sticks;
    group membership notices never backfill pre-start; autoscroll follows stream + settles;
    editor save-vs-refetch list flicker; error toasts assert EXACT copy + fallback names the
    replacement; deep-nested modal reachability; expanded-editor edit retention; capability-gated
    UI appears only with its dependency.
  - **SEED BACKLOG — logic (from ST)**: the card-import validator suite (V1/V2/V3 discrimination,
    dual-shape tiebreak, PER-FIELD error naming, character_book malformed shapes, V3 version RANGE,
    validator state reset); path-traversal rejection for zip/png card import; same-role merge +
    name-prefix no-double-prefix + cache-depth-skips-prefill (cross-check ours — much already
    covered by role-squash/names/breakpoint tests, close gaps only); thinking-budget tier clamps
    (when reasoning lands).
  - **TECHNIQUES adopted into the kit doctrine**: deterministic SSE fake with a typed event
    vocabulary; collectUnexpectedErrors console collector as broad smoke; REST-seed + addInitScript
    for not-under-test state; per-field validator error assertions. ANTI-patterns recorded:
    per-test viewport skips (parametrize instead); suites named e2e that CI never runs.
  - **CHIPS**: (1) SECURITY — ST's SSRF/DNS-rebinding filter is a real scar class and orbweaver DOES
    proxy user-supplied endpoints (custom-openai) + fetches remote images: route a security-executor
    review of the endpoint-proxy path (resolved-IP pinning, private-range blocking). (2) INFRA —
    "every test file is executed by SOME runner" membership check (the ST CI lesson; we check TYPE
    membership, not EXECUTION membership — a spec can fall between vitest/playwright globs silently).
  - **SHORTLIST AMENDED to 25** (hidden regression layer mined): +fallback-never-double-answers,
    +user-abort-never-triggers-fallback, +typewriter-reveal-survives-normalization,
    +revision-keyed-not-content-keyed replay gating, +import timestamp monotonicity (tie → +1ms),
    +persona free-text wrap-shape, +worldinfo key dedupe/trim, +lenient-JSON params boundary,
    +jsonish-extraction-from-prose (D48-relevant), +error-message extraction both-shapes. Style
    verdict: their pure-fn-assert vs e2e split is legitimate and orbweaver already has it (vitest
    unit layer) — ENFORCED, unlike theirs.
  - **FINAL: SHORTLIST = 42** (prompt.regression.ts mined: 96 named cases / 4,120 lines — 41% of the
    hidden layer; 17 new transferable incl. the compaction-adjacent gold fed to #9 live: marker-
    present/absent placement two-case, cadence-counts-real-user-turns, duplicate-injection guard,
    macro-resolved-before-scan ordering; per-message-SEEDED random determinism (their swipe-stable
    rolls — compare to our freeze-at-commit volatile registry model); recursion caps; ReDoS gate for
    user regex scripts; items 37/38 routed to #21 security scope). Mining verdict: marinara = strong
    source badly hidden (the hidden unit layer out-yielded the visible e2e suite 17:15 on domain-
    matched scenarios); caveat — none of it is CI-enforced, so scars prove bugs were HIT once, not
    continuously guarded.
  - **ROLL REPLAYABILITY RESOLVED (owner question, main-worktree scouted 2026-07-24)**: main's rpg
    rolls replay via BAKE-ONCE STORAGE (live CSPRNG once inside tool execution → result stamped into
    stored message text + ToolCallRecord; re-render = pure text decoration, never re-executes) — the
    SAME discipline retro's freeze-at-commit volatile registry already generalizes for
    {{roll}}/{{random}}/{{pick}}. NOTHING TO PORT. **THE ROOT INVARIANT (owner): canon bytes are
    immutable EVIDENCE — the design exists to protect the PROMPT CACHE (stored history = the stable
    prefix; per-read re-resolution would churn bytes and invalidate the provider cache every send)
    and DB PROVENANCE (the row records what the model saw, it is not a template), and to keep macros
    from firing hot on every read. Replay is the corollary, not the goal. Same invariant behind: the
    D2 unknown-span ratification, compact-summary slot-0 cache-anchor placement, and the
    shape-breakpoint abort-on-prefix-mutation rule.** Seed-based replay (marinara's per-message-seeded
    model) was explicitly REJECTED in main as a security bug (clock-seeded PRNG brute-forceable from
    log timestamps, fixed → CSPRNG) — storage beats seeding. PARKED for the rpg REBUILD: the
    anti-swipe-fishing guard (player's declared pre-roll = turn-scoped, consume-once, re-feeds the
    SAME face on swipe). Candidate #18 pin: each VARIANT freezes its volatile macros independently
    (swipe = fresh roll; swipe-back = the original's stored value).
  - **MACRO PARITY LANDED**: tests/kit/macro/{st-parity,st-rejected,dos-bounds}.test.ts — 36 parity
    pins + 16 rejection pins + DoS pins; 4 divergences owner-RATIFIED-OURS 2026-07-24 (triple-brace
    left-greedy; unknown-span byte-stability R1 wins; whitespace = multi-arg; addvar renders "") —
    pins flipped to assert ratified semantics. Capability-parity map: ST flags→automation triggers,
    $-sigils→explicit var macros, pipes→block transforms; MISSING ledger: indexed-array var reads,
    named macro args, position-seeded pick, per-render dynamic registration, alias primitive — all
    owner feature decisions, parked.
  - **HIDDEN-TEST SWEEP (owner-tipped, ast-grep structural, 2026-07-24)**: marinara hides 23 files /
    ~10k lines of hand-rolled node:assert regression scripts (scripts/regressions/ — frameworkless,
    invisible to describe/it sweeps; provider-compat + roleplay-streaming ARE the per-source coverage
    the first inventory called absent — shortlist amendment in flight) AND its server pnpm test globs
    match ZERO files (silent no-op). Neo hides tools/st-extract/test (14 vitest files, workspace-only
    invocation, no CI) — st-extract parity oracles are extraction-tooling-specific, LOW transfer for
    orbweaver. ST re-swept: clean negative, prior inventory complete. META: enforcement-vs-existence
    disease confirmed in ALL THREE launched/reference repos → #22 upgraded to check both directions
    (file-in-no-runner AND glob-matching-no-files).

### #12 AUDIT RESULTS (Opus own-eyes delta review vs main, 2026-07-24) — ledger INCOMPLETE, corrected
- **11 MISSED items** (all diff-direction-locked by direct reads). P1 data-loss/silent-failure:
  (1) image-gen fire-and-forget destroys the typed prompt on failure (use-generate-image.ts +
  composer.tsx — main: mutateAsync + clear-on-success only); (2) character-card-form-model.ts:158
  silently strips greeting `groupOnly` on any edit (server contract + serde still support it; main
  had the per-greeting "group chats only" toggle); (3) warning-notice.ts deleted → the bus onWarning
  arm is unwired, ALL capability-degrade warnings swallowed. P2: (4) autosave-status.tsx lost
  role=alert/status — save state silent to SRs; (5) composer bg-input/60 translucency regression
  (main bg-card, dated side-eye fix); (6) turn-abort-notice.ts deleted — stale-lock takeover has no
  honest toast; (7) markdown.tsx lost break-words (long token drags a horizontal scrollbar);
  (8) world-info entry reorder UI + useApplyEntryOrder dropped (server verb LIVE). P3: (9) select
  value slot min-w-0 truncate; (10) members-panel ScrollArea contentClassName; (11) sortable
  handleLabel a11y prop (grab with #8's world-info reorder — its live consumer).
- **HELD scopes CORRECTED**: PD-147 = 8 files (incl. pin-spacer.ts wholesale, use-message-items /
  use-jump-to-latest / use-chat-behavior-prefs hooks, chat-behavior-model.ts + its settings surface —
  the lying streamScrollMode knob's full seam); BG-C/BG-V = 15 files (retro HAS the still-image half:
  theme-background-layer + room-overrides-tab need diffs only; the video primitive + use-chat-background
  + background-source-field + registry-contracts background field are absent-wholesale).
- **FUTURE-RELEVANT (ledger-for-rebuild)**: world-book attach/detach-to-chat hooks (server live;
  returns with the chat context-tab seam); accept-all tag suggestions (tag.bulkAttachTag live); ~~the
  message-tools-renderer/text-decorator/slash-command registry-seam pattern (returns with rpg)~~
  ⚠️ **MISCLASSIFIED — OWNER CORRECTED 2026-07-24**: "tool renderer and slash commands are still valid
  with our automation and plugin lane and macro engine." These are NOT rpg-coupled and do NOT wait for a
  rebuild — automation (`domain/automation/`), plugin-host (`infra/plugin-host/`) and the macro engine
  (`kit/src/macro/`) are ALL LIVE in retro, and chat TOOLS are live. So `ToolRenderer` /
  `MessageToolsRenderer` / `MessageTextDecorator` / `SlashCommandContribution` are the CLIENT
  CONTRIBUTION SEAMS those live systems need. (`HubCardContextState` + `hasRpgGame` DO stay purged.)
  **SCOUTED — per-seam verdicts (2026-07-24), act on these, don't re-derive:**
  · **TOOL-CALL RENDERING = GENUINE GAP, FIX LANE RUNNING.** `MessageView.toolCalls: ToolCallRecord[]`
    (`contracts/chat/index.ts:521`, shape at :468 — toolCallId/name/arguments/result/isError/durationMs) is
    populated on EVERY message read and its own doc calls it "the client's ONLY tool read surface". The
    client has ZERO handling (`message-content.tsx` renders markdown|media|html-card exhaustively, never
    reads it). AND `packages/ui/src/primitives/tool-call-block/` ships a generic `ToolCallBlock` with **no
    caller repo-wide**. Server emits → client drops → the renderer built for it sits unused. THIRD
    half-shipped feature of the night (after removeCharacterFromChat + streamScrollMode).
  · **MessageTextDecorator = NOT NEEDED YET** — generic seam, but its only producer was rpg's dice tag.
    Reinstate when automation emits an analogous inline marker.
  · **SlashCommandContribution = valid infra, NO LIVE PRODUCER.** Retro has no `/command` dispatch in the
    composer at ALL (missing lower in the stack than main); the command palette
    (`command-palette-surface.tsx`) is a fixed cmdk list, no registry. Nothing server-side emits a command
    today — plugin-host supports ONLY event subscribers (`automation/contract/plugin-subscribers.ts:20`),
    no renderer/command contribution kind exists. So: NOT dead, but YAGNI until a producer exists. Build it
    WITH the first producer, not before.
  · **Macro client seam = NOT NEEDED** — `kit/src/macro/registry.ts` is a fixed builtin registry consumed
    during server-side prompt assembly; macros resolve into the persisted body before the client sees text.
    No dynamic/plugin registration point exists anywhere.
  · **`HubCardContextState` + `hasRpgGame` = CORRECTLY PURGED** (genuinely hub/rpg-coupled).
  So the BG-C/V lane's omission was RIGHT for 4 of 5 and WRONG for tool rendering only — now FIXED.
  · **TOOL-CALL RENDERING LANDED (uncommitted).** `ToolCallBlock` needed ZERO changes (it already handled
    error/unexecuted/success + pretty-print fallback + duration — it was purely uncalled). New
    `message-tool-calls.tsx`; `ToolRenderer` (per-tool-NAME) rides the EXISTING `ChatSurfaceContribution`
    prop chain (no second mechanism); `MessageToolsRenderer` (whole-message) rides a null-tolerant registry
    context (G26). Precedence: whole-message → per-name → generic block. Empty `toolCalls` returns null
    BEFORE touching any registry ⇒ zero DOM on non-tool turns (2 tests pin it). Both registries EMPTY at
    `main.tsx` ⇒ today = bare ToolCallBlock. 7+2 CTs, check:structure clean, snap 0 page errors, purged
    grep clean. **FINDING: the tool path is LIVE but has NO DEFAULT REGISTRANT** — producers are
    plugin-registered tools only (`domain/plugin/activation/activate.ts` → `registerTool` →
    `domain/tool-use`); no built-in tool ships pre-registered, so blocks appear once automation/plugins
    register one. That matches the owner's automation/plugin lane; renderer is no longer the missing half.
- **OWNER RULED (2026-07-24) — both RESTORE**: (12) composer-draft-store persistence returns (keyed
  store + draft→commit migration; losing typed text on navigation is the image-gen-prompt data-loss
  family, unrelated to the reduced-modes trap); (13) ShapeTraceSummary host-only assembly-trace panel
  returns (wires the live-but-unwired chat.getShapeTrace — the observability surface for the exact
  assembly/fit/compaction machinery this program keeps debugging blind).
- **RE-VERIFICATION of the scout-swept sections (2026-07-24, tool-restricted verifier)**: settings +
  chat verdicts CONFIRMED; **credentials skip OVERTURNED** — 3 more dead-doors onto LIVE server
  capability: (14) endpoint-inspector-dialog + useInspectEndpoint deleted while the full server stack
  incl. the response-echo secret-scrub is intact (custom-byo/inspect.ts:72-75; credentials.ts:93) —
  MEDIUM, re-wire; (15) markRevokedByUser button (verb+tRPC live, credentials.ts:60) — grab;
  (16) clearRevoked button (credentials.ts:70) — grab. Plus a LOW polish note: settings scroll-spy's
  initial-compute still runs the 20-frame rAF poll anti-pattern the sibling scrollToAnchor fix
  root-caused (~line 181) — convert to observer+wall-clock when convenient.
- **(17) TanStack devtools trigger config — GRABBED IMMEDIATELY (owner-recalled, orchestrator-applied
  2026-07-24)**: main's dev-tools.tsx carried `config={{ hideUntilHover: true, position:
  "bottom-left" }}` (trigger invisible until corner-hover, docked away from the composer, position
  persisted); retro lacked it — the dev trigger camped over the UI. 4 dev-only lines, tsc-verified.
  (Neither the audit nor the re-verify named dev-tools.tsx — owner memory beat both.)
- **(18) Admin engines pane: deployment facts not rendered (side-eye P2) — OWNER-ESCALATED TO NOW,
  lane dispatched 2026-07-24** (deferral overridden: "every single one of these need fixed in full"):
  render ports/store-paths read-only in the status rows from the engineDeploymentEnv single-home,
  making engine-launch-config.tsx:6's promise true. All four side-eye findings in-flight-or-done:
  P1 pct-arm + preset-defaults P2 = the reopened #9 lane; deployment-facts P2 = this lane; P3 junk
  presets = deleted via API (verified 0 remaining).
- **ROTATION-4 LANE SPEC = items 1-16 above** (11 audit + 2 owner restorations + 3 credential
  dead-doors) **+ the held trio at corrected scope** (PD-147 ×8 files, BG-C/BG-V ×16 — the audit's 15 + the
  `./background-video` subpath export in packages/ui/package.json, without which the primitive is
  unimportable; section hint ×2) **+ the scroll-spy polish**. UI-diff universe fully closed: 17/17
  files adjudicated (audit 15 own-eyes + orchestrator 2: the export line above; icons/index.ts's 8
  removed exports = the ledger's dead-domain-icon skip, confirmed, trivially re-added per rebuild). Waits for rotation-3 commit (chat-zone overlap with #9's files).
  With this re-verification the #12 delta review is COMPLETE — every section either own-eyes
  adjudicated or independently re-verified.
- **Verified TRUE**: DTCG byte-identical; MenuGroup consumer-free both trees; globals.css skip-set
  exactly the 6 rpg blocks; all named grabs landed; #7/#11/#19/#20 retro-AHEAD confirmed.

### #16 — Settings echo-stability + render-truth (the real oscillation path)
- **Cause (owner repro, pre-revert)**: the oscillation lived in SETTINGS (background, theme) and required
  clearing localStorage AND cache to SEE saved changes — two coupled defects: (a) a save→rewrite→re-save
  loop on the server round-trip (suspect fuel: the versioned-config lift re-running on unstamped rows —
  the "always stamp USER_SETTINGS_SCHEMA_VERSION" gotcha; BG-C background materialization + theme
  .catch(null) are echo≠save BY DESIGN and must be handled as one-rewrite fixed points); (b) a
  DISPLAY-side shadow: some client-persisted layer rendered instead of server truth, so successful saves
  stayed invisible until a manual clear — the persistence-boundary law (device-local ONLY in persisted
  stores) punched through.
- **Ruling**: (1) int tests on the REAL updateUserSettingsSection path (appearance incl. materializing
  background, theme incl. stale id): fixed point in ≤1 legitimate rewrite, repeated parses byte-stable;
  verify every WRITE path stamps the schema version and a lifted row stabilizes. (2) AUDIT current
  persisted stores against server-owned state (the DEVICE_LOCAL_REGISTRY is the checklist; verify the
  gate's semantics actually catch a server-owned field, not just registry membership — probe it). (3)
  live e2e: change background + theme in the UI → visible IMMEDIATELY and after a PLAIN reload with
  storage fully intact (the no-clear-needed pin), exact user-initiated save-request count (zero
  self-triggered tail), breaker never trips. #11's breaker contains any residual loop; this kills the
  fuel and the shadow.

## In flight — INTEGRATION of the #6/#7/#11/#13 wave (2026-07-24, near-complete)

**Everything below is DONE and green unless marked PENDING.** All four lanes landed (see their sections);
integration seam-fixes applied: #11's DOM-touching tests routed (create-entity-draft-store.test.ts →
tsconfig.tests-dom.json include + tsconfig.json exclude; save-circuit-breaker.test imports its pure module
directly, NOT the DOM forms barrel); the load-bearing `?? "null"` in entity-form-base stableStringify is
eslint-suppressed-with-repro (TS lib lies: JSON.stringify(undefined)===undefined); breaker wiring uses the
client's sanctioned `performance.timeOrigin + performance.now()` clock; FABRICATION-OK marker on the
draft-store invalid-shape probe; suppressions baseline regenerated; vitest types project gained
`ignoreSourceErrors: true` (wrong-lib double-reports die; test-file errors still fail).

**CT harness seam (fixed)**: #7's `chat.previewContextFit` rides the same batch as listMessages; the CT
harness's unlisted-proc default (`data:null`) is OUT-OF-CONTRACT for it and crashed the chat surfaces.
Fix: PREVIEW_FIT_STUB folded into ROSTER_STUB in chat-room-surface.ct + message-list-surface.ct. RULE:
any new always-fired query needs a valid stub in the shared chat-surface stub bundle.

**Playwright config findings (both configs committed-pending)**: e2e = list+json reporters, trace/screenshot
retain-on-failure, actionTimeout 15s, UTC/en-US, NO video (owner ruling — pnpm record exists). CT = json
reporter, screenshot only-on-failure, UTC/en-US, but trace STAYS on-first-retry: always-on trace RECORDING
instruments network enough to flip component behavior (bisect-proven repro: message-content's external-image
CT). That CT is now route-intercepted (a real served pixel — "LOADS" finally means loads).

**Battery state**: check PASS · pnpm test PASS (6892 vitest + 1215 CT, 1 retry-passed flake:
settings-shell fuzzy-search anchor — watch item for #10) · routine e2e 12/12 · live 17/18.

**The #7 previewFit null-boundary bug — FIXED (2026-07-24)**: the merge/squash suspects were innocent
(`squashSameRole` is first-wins and preserves extras; an alternating transcript never merges). The real
defect lived in `fitHistoryToWindow` (history-budget.ts): the preview's shaped history ends on the
ID-LESS continuation nudge (preview canon ends on assistant → SHAPE appends `[Continue…]`), and with a
tiny ceiling the prompt budget goes NEGATIVE, so the old "always keep the newest ROW" irreducible rule
kept ONLY the nudge — `kept.find(messageId)` found nothing → null boundary with droppedCount 7 (probe's
usedTokens 11 ≈ the nudge's cost, confirming). Same latent bug on the ENGINE path: a group-nudge tail +
blown budget kept only the nudge and dropped the user's actual message, violating the function's own
"never silently drop the user's current turn" doc. FIX (one home): the irreducible unit is the newest
ID-BEARING turn plus everything after it (trailing synthetics — nudge, depth-0 injections — ride with
the turn they follow); no-id histories keep the old newest-row behavior. Why the parity int-test missed
it: its comment DOCUMENTED the degenerate null as intended and dodged it (odd turn count → no nudge; mid
window) — the per-spec-dodge pattern. Now pinned three ways: unit (blown budget keeps id-turn+nudge,
names boundary), int (even-count transcript + 200-window → boundary = newest row, droppedCount 5), and
live P2. Verifier CONFIRMED (both new tests proven red-on-old-code; engine normal-case unaffected; all
fitHistory callers swept). **WAVE COMMITTED `2ef07b8f`** (68 files) after the full gate: check PASS ·
pnpm test PASS (vitest + 1211 CT; 5 retry-flakes in the known parallelism class → #10's flake-hunt
list) · **full e2e 18/18 including live** — the first fully-green live suite.

**Assertion-quality audit (#17, DONE)**: 205 files / all tests read by 4 sonnet readers — ZERO sick, 2
MIXED-WEAK both fixed (character-library bulk-tag payload pin; theme-picker delete zero-call pin with
ONESHOT-OK marker). No gate needed — the house idiom (consequence testids + trpc.lastInput payload polling
+ the state-store <output> funnel) structurally prevents the disease. #18 grows coverage from healthy stock.

## Rotation 2 — CLOSED (2026-07-24, committed after this edit)

**Landed + verified (every lane got a fresh-context verifier; #8 also side-eyed live):**
- **#8 DONE**: one-surface draft redesign (wand + ⋯ menu were the two real reduced-mode violations; room
  surface/context tabs were already unified). Owner 1:1 ruling landed: NOTHING hides — Delete/Download
  render disabled on a draft; EVERY disabled affordance (menu items AND the wand/image-gen buttons)
  carries a hover reason naming the UNLOCK condition. Mechanism: Base UI disabled MenuItems are
  aria-disabled divs (title surfaces); buttons use `focusableWhenDisabled` (same effect). Copy
  single-homed in lib/injection-copy.ts. Side-eye: 33/40 Nielsen, menus called a model implementation.
- **#15 DONE**: spend/budget enforcement stripped (automation $ ceilings, whole plugin spend tier incl.
  the runExclusive serializer — verifier proved it protected ONLY the spend gate); rate caps + cost
  visibility + DoS caps kept; `budget_refused` = rate-cap terminal; D46 annotated; baseline regenerated.
- **#16 DONE**: echo-stability suite (server exonerated — fuel was #11's client seed, already fixed);
  persisted-store audit clean; gate blind spot proven; live no-clear-needed pin green ×3.
- **#12 ui tranche DONE**: dialog overflow, slider FOCUS_RING_HAS, textarea rows-floor, MenuGroup
  deleted, sortable keyboard-focus restoration (flake root-fix). PD-147 + BG-C/V + section hint HELD.
- **#19 DONE (side-eye P1)**: stuck-composer root cause = `lastEventId:"0"` seed re-replays the durable
  log from zero on subscription churn → re-replayed turnStarted re-opens the terminal turn slot. Fix =
  monotonic per-chat seq guard at the bus adapter with attach-SYNTHESIZED events (chatOpened/
  historyTruncated) exempted BY TYPE (the verifier REFUTED v1 — the guard was swallowing the sole
  reopen catch-up invalidate; the exemption CT is proven-to-bite). LRU-capped mark map.
- **#20 DONE**: rAF-batched token commits (burst of 5 deltas → ONE store commit, deterministically
  pinned; honest finding: a slow local model masks the win — tokens arrive under frame rate).
- **Infra**: e2e tree → tests-dom program (DomEl/FABRICATION casts dead); favicon (the first-load 404
  was the implicit /favicon.ico probe; no icon ever existed); draft spec now MINTS its own character
  (`mintFreshCharacter` support helper) — the rotating-sweep-failure class (seeded characters accumulate
  chats across a sweep; a character with chats resumes instead of drafting) is dead.
- **Battery at close**: check PASS · full battery PASS (1224 CT / 1 retry-flake) · **e2e 21/21 live**.
- **Lesson (artifact discipline)**: a sweep failure's retain-on-failure artifacts live in
  reports/e2e-results/ and are WIPED by the next run — read them BEFORE any re-run (one repro was lost
  to an instant re-run this rotation).

## Rotation 2 integration notes (2026-07-24)

- **DB baseline regenerated** (drizzle-kit generate --name baseline, migrations dir emptied first):
  reconciles #15's drops (plugin_budgets table + automation_budgets spend columns + narrowed CHECKs).
  Verified: schema-baseline-parity.int green (bidirectional set-equal), client.int migration-apply green,
  diff vs HEAD = exactly the intended drops. NOTE the pre-launch convention: a regenerated baseline
  AUTO-RESETS the dev db at next boot (data loss by design; boot re-seeds default characters + persona,
  e2e global-setup self-seeds — nothing breaks, but local dev chats are gone).
- **ANOMALY (unattributed, corrected)**: sometime during the rotation-2 lane window the WORKING-TREE
  0000_baseline.sql was reverted to commit `f4049019`'s pre-burn-down blob (1566 lines, buddies/sprites/
  crew tables) — git-proven byte-identical. All lanes were git-banned; cause unknown. The regen replaced
  it; backup preserved in the session scratchpad. If a working-tree file ever looks main-era again,
  hash-match it against history FIRST (git hash-object + rev-parse walk) before assuming schema drift.
- **Standing latents flagged by verifiers (no action this rotation)**: persistence-boundary gate checks
  store NAMES only, not fields (a registered store could shadow a server-owned field — field-level check
  is a real enforcement design decision); appearance.backgroundLibrary `.catch([])` drops the whole array
  on one malformed entry (entries are server-minted, latent); plugin storage.set 256-key cap has a
  documented race-tolerant TOCTOU (pre-existing, accepted by its own comment).
- **D46 ledger annotated** (spend half retired, rate half + visibility stay) — Core-Path-Registry.md.

## Rotation 3 chips (minted by lanes, pending routing)

- **macro-before-scan (pre-existing, #9-flagged)**: recall's `recent` text feed may reach the
  keyword/semantic scanner with UNRESOLVED `{{...}}` macros (marinara's `:1200` scar class). Predates
  the compaction work — audit what assemble-gather feeds recallMemory and pin resolved-before-scan.
- **auto-mode native-compact characterization (known-gap, documented at the translate site)**: auto
  turns SUCCEED on vLLM but whether SDK-native compaction actually FIRES there was not positively
  confirmed (needs compact_boundary log capture) — revisit when a longer-window probe is cheap.
- **SDK cap-interaction lesson (→ memory after verification)**: maxContextTokens env + disabled
  auto-compact = hard SDK is_error — the domain fit-cap and the SDK env-cap are DIFFERENT mechanisms,
  never force both; managed/off modes drop the context env (translate.ts, 7 tests).

## Open decisions (owner)

- Should the e2e settings seed snapshot-and-restore the user's routing instead of leaving the vllm pin?
- previewFit naming/shape (chat.previewContextFit?) — landing in #7 unless vetoed.
- `orb-readable` parchment treatment: resurrect from main's history if a live feature wants a document
  reading skin (skipped for now).
