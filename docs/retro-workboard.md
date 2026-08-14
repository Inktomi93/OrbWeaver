# ☀️ DELTA (2026-08-14 midday — TRAIN SEALED + PUSHED)

**Origin is CURRENT: pushed `6155e3050..31f9516be` (160 commits; owner word, `--no-verify` on battery
receipts). Battery 2 (`verify --push`, clean-room) landed ONE red — structure:full ×2, both fallout of
the battery-1 fix commit: the `FABRICATION-OK` escape must sit ON or DIRECTLY ABOVE the cast's line
(the gate's own probe table), and the collapse-filters.ts extraction owed its tests/client mirror.
Fixed `31f9516be` (20/20 both files · types:graph exit 0 · structure exit 0, 207 gates, single-pass
clean). Every other battery stage was green.**

- **⚠ NEXT STACK BOOT WIPES THE DEV DB** (R0 + star/updatedAt baseline squashes; the latch reseeds).
- **Race artifact, receipted:** an unattributed vitest run of the tooling int tests started 10:12
  (post-battery, zero lanes live) and planted the shared `__g_` gate fixtures mid-scan — the first
  structure re-run saw phantom `domain/hub` reds. Waited it out; clean pass followed. Lead boarded in
  OPEN ITEMS.
- Open work: the OPEN ITEMS list in LIVE STATE (entity→room bridge design · gate candidates G-G + ui
  exports-arm · guard follow-up family · R1-4a · F6 · vite-prebundle ops lead · owner pile).

# Retro Workboard — the live board

> **THIS IS THE WORKING DOC** (owner-stated). Not law, not a deliverable — the durable state an
> orchestrator resumes from cold. Authority for LAW = `docs/architecture/core/**`; the D-ledger
> (`Core-Path-Registry.md` / `Core-Laws-and-Precedents.md`, current through **D138** — D137 landed
> 08-08 with the persona cast substrate, D138 landed 08-14 with the W10 freshness contract) wins on
> ANY conflict. `docs/architecture/proposed/**`
> is pre-rollback REBUILD REFERENCE — never cite its status as current.
>
> **REWRITTEN IN FULL 2026-08-08** (owner-ordered: one doc, current-state only, "so we stop fucking
> it up"). This rewrite **ABSORBED `docs/retro-remaining-work-ledger.md`** (the 2026-08-08
> tree-reverified reconciliation) — that file is DELETED; its content IS the QUEUE below. The prior
> layered board moved INTACT to
> [`docs/history/retro-workboard-2026-08-08.md`](history/retro-workboard-2026-08-08.md); earlier
> archeology: [`retro-workboard-2026-08-07.md`](history/retro-workboard-2026-08-07.md) ·
> [`retro-workboard-2026-08-03.md`](history/retro-workboard-2026-08-03.md). Nothing was deleted;
> things moved.
>
> **BOARD RULES (how this doc stays trustworthy):** CURRENT-STATE ONLY — when a block goes stale,
> REWRITE it in place, never stack a session layer on top · every row states its EVIDENCE METHOD
> (live-verified / grep-sourced / relayed-claim) or it is a LEAD, not a row · a remainder belongs in
> a CHECKBOX, never a prose tail under a ✅ · a status claim ("routed", "dispatched") owes the same
> receipt a row does.

## ═══ WHY RETRO EXISTS — the north star ═══

Read `shitsfucked` at the repo root. Main's own ledger, verbatim: *"We are tired of hunting down
invisible bugs. **Everything must be proven.**"* The disease: features that looked done and silently
weren't. The posture: **drive it live, then pin it.** A row that says "merged" is not a receipt; a
sha, a symbol, a registered gate, a running test is. Global **KISS/YAGNI are SUSPENDED here** —
build the maximal, most-provable version (\[\[kiss-yagni-suspended-build-maximal]]). Package cake:
kit ← contracts ← db ← server ← client + sealed ui; one-directional flow (rpg ↔ chat only via
injected ops). Read `docs/architecture/core/AGENTS.md` IN FULL before any work.

## ═══ OWNER RULINGS LEDGER (append-only; CHECK HERE BEFORE POSING ANY QUESTION) ═══

> **Why (owner, 2026-08-08, frustrated and right):** rulings kept getting re-asked — W5 was ruled
> 2026-07-27 at its spec's foot and re-posed as an open fork on 2026-08-08; the OpenRouter-key row
> re-posed a dead question. **RULE: no question reaches the owner until it is grepped against THIS
> table + the named design doc's foot. Every answered question is appended here the same day.**
> One line per ruling; receipts live where the line points.

| date | ruling |
| - | - |
| 07-27 | **W5 user-macro values = Arm A per-chat** ("yes option A"); no ForeignInputs field. BUILT. |
| 08-02 | wiFormat `{{entry}}` carrier BLOCKS at write · main-prompt ADDRESS clause is deliberate |
| 08-07 | Templates ONE home = PRESETS (D132) · row-27 WIRE · pushes = fresh word + fresh battery · tag ≤30 cap stays · probe-lint = scratch · summarize-sub DROP |
| 08-08 | Containerize default = usable-as-owner (ST first-run) · refinery BUILD F1-F5 · FF-merge/currency discipline |
| 08-08 | **C2 `{{note}}` BLOCKS** (carrier, Option C) · **C3 nudge texts SHIP VERBATIM** (veto pile closed) · **C8 shared `MAX_INJECTION_TEMPLATE_LENGTH`=10000** |
| 08-08 | **C4 narrator marker = MODE-AWARE default, bytes BLESSED** (in the C4 merge `0282bb554`) · **Arm A/D16: narrator-of-one KEEPS narrator framing** (mode is data; size branch forbidden; owner: "do whatever's cleanest") |
| 08-08 | **C6 = kebab PNG/JSON submenu** · **C7 = launcher sheds count+create when populated, New-book double STAYS** |
| 08-08 | **OpenRouter: F5 build+prove+depth-knob (ARM A clamp-to-safe) · F6 skip · F7 defer** (drop-is-safe measured; storage exists) |
| 08-08 | **Stickler F1 = short-circuit narrator arbitration, KEEP policy field · F2 = BUILD real round-robin · F3 = DELETE groupCharacterId · F4 = re-home group framings to PRESET + amend D132(B)** |
| 08-08 | **Vocab kill list RATIFIED IN FULL** (crew incl. schema field · director→arbiter · seat · 3 UI strings; party/scene/act + ember/weave STAY) |
| 08-08 | **CAS = weekly GC + monthly fsck** · **AGENT-1 = wait for owner re-auth, keep whole** · **Refinery R2 GO + R3 MOCKUPS GO** (TanStack, not "React Query") |
| 08-08 | **PUSH WORD GRANTED** for this train (drain → battery → E2E\_LIVE → push) · queued trio = train two |
| 08-08 | **C1 persona program APPROVED IN FULL on the doc's recommended arms** (owner, after the Reading-B walkthrough): Phase D → Phase C, all 5 §10 forks on their recs (C after D, before the agent wave · substrate home contracts · 4-field overlap only · NO character-arm description · build lane mints **D137** w/ the §10.5 draft clause). Phase gate: persona-resolution suite BYTE-UNTOUCHED. Forge lane dispatched. |
| 08-08 | **R0 ratifications:** handoff-clear KEPT (critique never rides the copy) · 12 refinery prose texts BLESSED as adapted · **caps re-ruled CHARS→TOKENS: 4,000 tokens per critique field via the kit tokenizer + 32k-char DoS backstop** (owner: "it needs to be tokens… 1000 tokens is piddly"; lane live) · ENTRIES\_MAX stands · **C5 presets STAY STANDALONE** (row closed) · **R3 mockups delivered + published as artifacts; deltas + taste forks ruled on orchestrator judgment** (owner: "fine with your judgement") — deltas 1/2/3 = A/A/A, forks per the mock recs, F-K ruled at build-brief time. |
| 08-08 | **Accept grammar = ARM (B) per-block Keep/Discard VERBS** (owner: "makes my brain happy"; re-opens fork C/D only) — and (b) natively satisfies security belt 10 (default = nothing accepted); arm (c) default-keep is DEAD (belt-10 collision, mock lane's find). Mock reshaping. **Graduations:** group-engine verifier CONFIRMED 5/5 · OR-F5 verifier CONFIRMED 6/6 (wire receipts reconciled to the cent) — both chunks GRADUATED; gaps → smalls batch 2 (task #12). **OG-extension feedback doc** landed (`docs/design/refinery-og-extension-feedback.md`) — manual-rewrite arm is R3-scope, in the build brief. |
| 08-08 | **R3 DIRECTIVE — DO NOT HARDCODE THE SURFACE TO THE FIXED PAYLOAD** (owner, verbatim intent: custom schemas are "the cool part… people doing requests to make their own schema, to shape what gets scored… cool graphs" — and the good-looking version must look good with custom shapes too). The built-in payload = ONE INSTANCE of a schema-DRIVEN renderer: widget vocabulary keyed on schema STRUCTURE (bounded number→gauge · enum→verdict banner · long string→prose · array<object>+numeric→scored rows), well-known shapes light up the full treatment, NL→schema generator taught to EMIT renderer-loved shapes, floor = good generic rendering never raw JSON. Also ratified: the three D62 delta A-arms (direct, was delegated). Goes in the R3 build brief as a first-class constraint. |
| 08-08 | **REFINERY = CROWNING FEATURE (owner posture ruling):** "one of our three crowning features so I need this whole thing to fuck… If we need to add packages that help we totally can. We do things once and we do them right even if it means more work" — the schema-renderer stickler workshop expanded to a full crowning-feature review (refinery proposal corpus + contracts/db/kit packages IN FULL; dependency latitude granted w/ vendored-vs-dep discipline; OG test suite mined as steal/adapt ledger; the OG scars = hand-rolled-in-ST artifacts vs real lessons, classified three ways). Caps merged `e488f8f9e` (4k tokens, ANALYZE +9%) · accept-mock merged `5b34b48ff` + published (3 artifacts live) · mock forks taken on delegated judgment: re-run REOPENS undecided · coarse tax taken w/ decided-blocks-collapse. |
| 08-08 | **REFINERY design directives (owner word-of-warning):** (1) field topology is NOT 1:1 — rewrites may fill empty fields, empty filled ones (consolidate-into-description), split or merge across the SELECTED set; the pipeline + accept UI must model field-set DELTAS within the belt-9 fence (contract representability questions routed to the crowning-feature stickler: emptying writes, fill-empty applicability, absent-field scoring, absent-side compare blocks). (2) OUTPUT-BUDGET PREFLIGHT — no ST connection opacity here: poll the resolved preset/connection and WARN pre-run when expected rewrite output exceeds max output tokens; fit readout covers BOTH directions. |
| 08-08 | **REFINERY: EMPTYING IS REFINING (owner overrules a shipped R0 stance):** "they can fill it therefore they can empty it." The shipped contract blocks it deliberately — `refinery/index.ts:294-299` `text: .min(1)` with the comment "a rewrite never CLEARS a field (clearing is authoring, not refining)" — that stance is OVERRULED: consolidation-into-fewer-fields requires emptying, within the belt-9 selection fence. Fix designed by the crowning-feature stickler first (open wrinkles: greetings are an ARRAY — empty-string vs entry-removal are different writes; the wire grammar minLength changes; the accept UI needs a cleared-side block), then a lane builds. |
| 08-08 | **REFINERY directives round 3 (owner):** revert/step-back FIRST-CLASS on all three axes (phases within a round · iterations across rounds · card VERSIONS via D28 snapshots + F6 — and AUDIT the versions plane, owner "hasn't messed with it much": list/diff/restore/run-provenance gaps = pre-launch fixes) · **SAVE-AS-NEW-CHARACTER-COPY RULED IN** (OG gap 3 promoted from R4-candidate to committed scope; rides character-create + fork-copy precedents) · **primitive-minting latitude confirmed** ("never been shy" — D44 precedent; each mint names contract/consumers/CT obligation). All routed to the crowning-feature stickler. |
| 08-08 | **REFINERY state-model rulings (owner):** (1) NO as-you-go card writes — the session is a WORKSPACE; the live character is touched ONCE at the terminal act (apply / save-as-copy); the F6 analyze auto-stamp flagged to the stickler as a possible declared carve-out (signals vs card fields). (2) **THINK IN GIT TERMS** — base ref = anchored original · session = working branch · rounds = commits · step-back = checkout · per-block Keep/Discard = staging hunks (`git add -p`) · apply = merge · save-as-copy = branch-off · D28 snapshots = the live card's reflog · live-card-changed-mid-session = a detectable merge conflict (design the affordance). Semantics are git's; user-facing words stay product vocabulary. |
| 08-08 | **USAGE DISCIPLINE (owner, evening sitting):** BIGGER LANES — group all of a lane's items into one brief, **ONE commit per lane**, then finish (too-granular commits waste time + weekly usage) · **no dedicated verifier/side-eye for smalls** (the tiny verify/side-eye dispatches burned the other account; batched lenses only for substantial/risky trains) · **forge BANNED until further notice** · concurrency = **5 agents, fill the lanes** · no push reminders (owner says when). |
| 08-08 | **MERGE FLOW = rebase-in-worktree → `--no-ff` merge onto main** (owner: "we literally made a lefthook pre-merge config") — the `pre-merge-commit` hook gates the EXACT merged tree; lane agents commit through pre-commit (a landed commit IS the static receipt — never a separate `pnpm check`, never `--no-verify`); the ff-only flow was gate-naked (rebase + ff fire no hooks — how #21's red reached main). Currency half of the 08-08 morning ruling stands. |
| 08-08 | **Vocab-lane forks (orchestrator-ruled in-lane):** seat = **POSTURE-ONLY** (ratified text is "stop minting seat\*", NOT remove — census's "\~8 symbols" false: 384 `seat` + \~70 load-bearing compounds; removal = own future lane) · `entryMetadata.crew` → **`provenance`** (schema's own "generic machine-writer provenance" header; owner may override) · F4 re-home mints **`group` template kind** ("Group rounds" kicker, 7 TEMPLATE\_DEFS rows, teach/extract one-kicker-per-cohort precedent) · model-facing "turn director" default text + "Round-robin" CARVED OUT (D132-E / F2 territory). |
| 08-08 | **DB WIPED + fresh stack (owner: stop the backfill churn)** — data/orbweaver.db deleted, stack rebooted clean; memoryEnabled back to default OFF; browser stale-cookie empty EXPECTED until #23 lands. **#21 MERGED `10c7066d1` + live-PROVEN** (4-6s natural stops vs 30-120s loops, \~6-25x/item; NOTE: this vLLM never logs per-request samplers — behavioral receipts, not log greps, are the live instrument). **#7/#12 SPEC-LOST** (gap lists died in lane transcripts, never landed in a file — re-source or drop) · **#11 RE-SCOPED** (no schedule-seed mechanism exists; new boot-seed step = executor work, riding the #24 leg). |
| 08-08 | **NL→SCHEMA IS FIRST-CLASS R3 SCOPE (owner):** whoever builds the R3 refinery surface builds the NL→custom-schema UI WITH it, same lane, same build — NOT an SF0 layer-on-after. Pairs with the row-59 schema-driven-renderer directive: the custom path ships alongside the fixed payload so the renderer can never quietly hardcode. |
| 08-08 | **Import-fidelity §5 rulings (owner, via question tool):** variants metadata = ONE CANONICAL SHAPE written at import (reader stays single-shape; pre-launch NO-LEGACY + re-import coming) · `chat_metadata.variables` = WIRE THROUGH to the existing column/field · author's note = ADAPT/CONVERT ST's note\_depth/position/role onto ORB'S OWN injection-system note ("we basically have our own author's note with our injection system — just adapt and convert to that") · #28 dispatch NOW alongside R3. |
| 08-08 | **ST IMPORT PLANE RE-HOMES (owner):** backgrounds/ = GALLERY ("backgrounds is our gallery — a media store for characters and etc"), imports into the gallery/CAS media store (the "no domain home / cosmetic" report reason is dead). THEMES: orb's D71 pipeline is a legit target — owner open to a SAFE ST→orb theme conversion (mapping study first, convert what maps, report the rest). Both fold into the deferred import lane (task #28) with databank/user-settings. |
| 08-08 | **NO TEXT-COMPLETION (owner, "who the fuck is building text completion"):** the #25 ST-preset import scope is CHAT-COMPLETION ONLY (OpenAI Settings/ + `oai_settings` via the shipped `importStChatCompletionPreset`). TextGen/NovelAI/KoboldAI preset families stay UNIMPORTED with an honest report reason — orb has no text-completion mode and no mapper gets built for one. (Orchestrator had wrongly approved 3 text-completion mappers; overruled live.) |
| 08-08 | **Templating rows 53-73 = ARM B (owner, via question tool): SERVER composes** — wire carries toggle KINDS only, server joins the 21 fragments via prose slots (the "wire carries only the kind, never template text" doctrine generalized). Spec: `docs/design/templating-fork-rows-53-73.md`. Build = task #33, parked under the freeze. **"Runs" rename KEPT** (Jobs pane > Runs section — the 08-02 Jobs>Jobs letter yields to WCAG label-in-name; mechanism \[user never sees "workload"] preserved). |
| 08-08 | **DISPATCH FREEZE (owner, late evening): no new agent dispatches until further notice — 5h session limit at 90%.** Running lanes finish + get merged by the orchestrator's own hands; queued tasks #30 (R4) / #31 (agents naming) / #32 (CLS+tab-strip) stay PARKED until the owner lifts it. |
| 08-09 | **SCHEMA-FORGE STRUCTURED-OUTPUT VETO (owner, on the 13th-slot draft):** "asking the model to pretty-please output proper JSON is fragile as fuck and anti-everything about us" — the NL→schema generator must use ENFORCED structured output (xgrammar/tool-call grammar, the RP-extraction precedent), generalized so USER-BUILT schemas work by construction; the prompt describes the task, the grammar owns the shape. Rework = task #36, lands before the R3 graduation lens. |
| 08-09 | **Schema-forge design elaboration (owner):** defaults are PRE-SUPPORTED (predefined shapes, full renderer treatment baked, zero model calls in the default path) · custom per-stage schemas = an authoring pipeline WITH OPTIONS — single enforced structured call / structured + tool calls / structured call → second call deriving format/render-hints via our TEACH machinery — "it's a one-time setup for them so they pay it once, but we should have options." vLLM local + OpenRouter env key + existing structured/tool support are the substrate. Folded into task #36. |
| 08-09 | **Refinery session identity = SERVER-SIDE** (orchestrator ruling, ledgered on the reconciler's flag): `refinerySessionSummarySchema` carries `characterName` (non-null) + `characterAvatarHash` off the existing owner-scoping inner join — the client-side `character.list` resolve is DELETED (it capped at the 100-row page = the paginating-breaks-resolve-by-find class). Contract comment truth-repaired; landed in phase-2.5 `87fce8f15`. |
| 08-09 | **MORNING SITTING (owner, via question tool):** PROSE ALL SIGNED (schemaForge design-task rewrite + rewrite/refine v3 append bullets = the shipped baselines) · **e2e PROCEED NOW** (wake the fleet) · **mobile refinery entry = UNDER "YOU"** (no bar redesign) · **01/02/03 markers = REDRAW without numbers** (the §6 ban stays absolute; mock loses this one) · lanes filled: #40 bounds→description + #35 corpus-stage instrument gap · re-import = OWNER-TRIGGERED (he runs it himself) · push = OWNER-RUN (he pushes himself; origin lags by the overnight merges until then). |
| 08-09 | **Structured-output corrections (owner, late sitting — all folded into task #36):** (1) the 2026-08-02 "OR response\_format 400s" ruling is WRONG-OR-STALE — OR supports `response_format: json_schema` per-ENDPOINT; the probe missed `require_parameters: true` provider routing (lane owes a two-sided live re-probe before truth-repairing the header). **DONE + SETTLED 08-09** — 23 live calls, 3 families, receipt at [`docs/reviews/misc/2026-08-09-openrouter-structured-output-probe.md`](reviews/misc/2026-08-09-openrouter-structured-output-probe.md); Finding 1: `require_parameters: true` changed **no cell** in either direction — the variable is the schema SHAPE. Header truth-repaired in place at `backends/openrouter/index.ts`. Do NOT re-probe. (2) TWO seams only — vLLM xgrammar + the OpenRouter SDK (hosted EXCLUSIVELY; no agent-sdk arm); Anthropic's feature/complexity limits apply THROUGH OR as the routed-provider floor (no bounds, minItems 0\|1, ~~≤24 optionals, ≤16 unions~~ → **CORRECTED 08-14: 46 optionals · 8 variants per `anyOf` · 50 total variants**, and they are ADVISORY, not refusals). The 24/16 numbers cited nothing; 46 is OURS, measured against Anthropic's grammar compiler (`@orb/kit/json-schema/wire-subset.ts`'s `strict-compatible` note) and 8/50 are the OG extension's own table — measured beats remembered. The ADVISORY posture is ratified, not a shortfall: a hard refusal would reverse `docs/design/refinery-schema-renderer.md` §1 ("providers own their wire" — client-side re-implementation of provider schema law is the OG's ACCIDENTAL pattern) and task #40's bounds→description relay. Built at `packages/contracts/src/refinery/schema-advisory.ts`, whose header records the reconciliation. (3) The `structured` ROLE already exists (split from summarize 2026-07-27: roles/structured.ts, createVllmStructured guided = already enforced, OR structuredWireTool = the swap target) — EXTEND, never reinvent. (4) **VEHICLE KNOB ruling: three values beside the existing as-projected/strict-compatible shape knob — `auto` (default; resolve-model-capability decides, falls back to forced-tool) / `response-format` / `forced-tool`** — the knobs compose, rpg-lite protected by construction, rpg suites must stay green at ALL THREE values. |
| 08-09 | **R3 POLISH MANDATE (owner, verbatim): "refinery should be sexy and modern and flow and have animations and shimmer bars where it tastefully fits, it should be buttery smooth"** — end-of-night: deep side-eye vs the rendered mocks → polish lane (motion/shimmer/flow, compositor-only, reduced-motion-respecting) → re-verify → EXHAUSTIVE e2e (refinery sessions against LIVE vLLM + smoke). Task #39. **Cap drops to 4 agents post-drain** (usage until morning). |
| 08-09 | **Overnight decision sitting (owner, via question tool):** re-import WAITS for the owner (no overnight run) · BUILDS GO: trust-gated card images + token-concepts unification (one security lane, task #37) · SMALLS GO (all four): Untitled-chat rosters, X-16 edited-ago, REGPAR F3/F4/F5, unsent-draft reload persistence (task #38) · NOT picked (stay parked): RV-13 spec, chars+chats rail merge. |
| 08-09 | **MIDDAY: pushed `216725582..3a432603e`** (battery 18/19 + orphan-ratchet ratchet-down fix, one-shot clean) · **count-up dual-arm = merge-expedience; single-mechanism cleanup AGREED (task #47)** — the phase-2.5 `awaited` latch is prod-unreachable (CT-only state). |
| 08-09 | **RULING SITTING round 1:** smoothStream default **→ TRUE** (fade rides streaming both modes; the jank objection measured dead: commits 205→55) · **user-capped overrun = REFUSE + fit receipt** (fail-closed; receipt names need/cap/knob) · **#43 code-split BUILD NOW** · **RV-13 = TALK FIRST, then spec** (owner wants it properly understood before the spec lane — conversation is his to open). |
| 08-09 | **Round 2:** C9 CLOSED all recs (1a tag-only backup SKIP · 1b KEEP durable import queue · 1d build folder OPEN, defer CLOSED) · **C11/C12 barrels GO now, one lane** (Tier B 50 drops + Tier A 85 verdicts + knip `--include-entry-exports` flip LAST) · **chars+chats rail merge KILLED** (distinct jobs; D121 kind-ceiling blessed nine) · **home-tile promotion KILLED** (in-place chips cover it; static sort stays). |
| 08-09 | **Round 3:** **C13 containerize = ALL AT LAUNCH-DAY** (every live-infra step + the `*_FILE` env fork fold into the D3 trio) · DRAFT-TRUST seam + v3-transcripts heal = **scout briefs then re-pose** (no half-premised question) · taste pile: **chat-options D111 placement BUILD**; speaker-tint door + Meteocons + grimstone **KILLED** · **stepper `{index+1}` badge KEPT** (a stepper is a real sequence — structure-is-information; the §6 ban kills ORNAMENT markers). |
| 08-09 | **Demo seeding = BROAD REBUILD, PARKED till endgame clears** (audit docs/design/demo-seeding-rebuild.md): the seeder generates nothing — replays frozen bytes + a hand-transcribed rpg manifest. "The actual way" ⇒ a record-demo harness (real turns via pipeline, Sonnet-5/OR) + **rpg-state made FIRST-CLASS in export/interchange** (chat-bundle + export-chat + parseChatJsonl carry the TURN snapshots/d20 tool-calls/journal) — which also pays down the D6 rpg-session portability gap. Forge design pass → owner sign → multi-lane build, all AFTER the burn-down drains. Task #52. |
| 08-09 | **OWNER: sweep launch-day-parked items that don't need to wait; CONTAINER + IMPORT stay DELAYED.** First non-wait item = D2/REGX2 bulk placement (mis-tagged 'externally blocked' — only blocker was the kit lift; lane #57 doing it properly: lift deriveRegexTierFlags→@orb/kit/regex + build the bulk-placement verb+UI). Container/C13 deploy-moment work + the #52 demo/import rebuild both explicitly HELD by owner word. |
| 08-09 | **Auth study III (first-run + mode-switch) done** — §7. First-run: ours ALREADY-BETTER (DDL singleton owner, no open-registration window; OW has a real first-signup admin race). Mode-switch: OWNER solved db-surgery-free (tryAdoptUnboundOwner). **NEW GAP MS-W1 (MEDIUM, needs owner call): a NON-owner local user whose IdP preferred\_username ≠ their local handle is ORPHANED on a flip to oidc** (new row minted, old row + password unreachable, NO in-app remedy — only DB surgery). Borrow **B5 (rank 1): admin 'link SSO identity' verb** stamping a stable subject onto an existing local row (reuse isSubjectMismatch) — the only surgery-free path for non-owner locals + closes the MS-W1 window · B6 boot-warn on SSO-flip with password users present · B4 local first-run setup screen. OWNER FORKS: build B5? / is orphan-on-mismatch acceptable or should it hard-deny until linked? |
| 08-09 | **Auth-methods study II done** (docs/design/openwebui-auth-methods-study.md): the four-mode FUNNEL AUDIT CONFIRMS our architecture is the INVERSE of OpenWebUI's fragmentation — every external-identity mode (oidc, forward-header) routes through the ONE provisionIdentity/bind-once seam; local + single-user carry no external claim. One documented nuance (owner-row first-bind is the sole unguarded bind — verified-channel, already owner-ruled at provision-identity.ts:263-276, NOT OW's rebind class). Their weak paths: OIDC email-rebind (W1) + LDAP email-link (L-W1); SCIM is actually SAFE (409 on collision, stable-id). BORROW: B1 per-HANDLE signin throttle (rolling window, NOT lockout — anti-DoS; rank 1, small) · U1 doc the single-chokepoint rule in the spine · B2/B3 native LDAP/SCIM DEFERRED (owner fork, default NO — forward-header subsumes proxy identity). Note: A4 groups-parse already exists on forward-header.ts:14-28 — "match our own path", not "borrow from OW". |
| 08-09 | **Mode-switch mismatch = HARD-DENY (owner)** — MS-W1 resolved: an unbound OIDC identity that COLLIDES with an existing row (email/handle) HARD-DENIES login with an operator-actionable error ("ask your admin to link it"), never silently mints a duplicate/orphan; admin resolves via B5. CRITICAL: deny-only, NEVER auto-link (auto-link = the W1 email-merge takeover). Precedence: subject-match → owner-exempt → collision-hard-deny (before JIT) → A1 signup gate → mint. Covers the OIDC\_SIGNUP=on case (signup=off already denies no-existing-row). Folded into the auth-entry lane (B5 already building — owner "build the link"). |
| 08-09 | **A1 SCOPED TO OIDC ONLY** (orchestrator clarification of the A1 ruling, not a re-pose — security-executor flagged the cross-mode consequence): OIDC\_SIGNUP default-OFF in the mode-blind provisionIdentity would ALSO deny forward-header JIT (proxy auto-provisioning) on upgrade. Scoped OIDC-only because the knob NAME says so, forward-header's proxy already gates admission (auto-provision = the model working), and it REDUCES breakage. Mechanism: resolve `allowJitProvision` at the SEAM (oidc = OIDC\_SIGNUP==on; forward-header = unconditionally true) and pass a boolean IN — do NOT route AUTH\_MODE into the verb (mode-blind by design, isSubjectMismatch scope note depends on it). Owner may override from here. |
| 08-09 | **#53 OIDC cohesion MERGED `bd8c64f6d`** — A7 (callback errors → /login?authError, no raw JSON) · A6 (IdP end-session on logout) · A4 (tolerant `;`-joined groups parse, closes the fail-closed total-deny) · A5 (back-channel logout, full §2.4 checklist vs issuer JWKS, revokeByExternalId, NO Redis) · A1 (OIDC\_SIGNUP default OFF, scoped OIDC-only via caller boolean — forward-header not gated, verb stays mode-blind) · A2 (OIDC\_REQUIRE\_APPROVAL, enabled:false first-SSO-user + Settings→Admin→Approvals surface). TWO human-pass items (NOT blockers): Authentik `sub`-stability is documented-not-live-verified (A4/A5/rename-safety assume it) — cheap to confirm on the live Authentik; A5 revokes on `sub`, a sid-only logout token is a validated no-op. |
| 08-09 | **OIDC study rulings:** BUILD A7 (callback errors → `/login?authError=`, not raw JSON) · A6 (IdP end-session on logout) · A4 (tolerant `;`-joined groups-claim parse) · A5 (back-channel logout, ours Redis-free) — one security-executor lane · **A1 `OIDC_SIGNUP` default = OFF** (deny-by-default; breaks-on-upgrade accepted, matches OW) · **A2 approval queue = YES via `enabled:false` carrier** (no new role; +admin approve surface) · **F1 KEEP D65** (no app-level groups; role-mapping covers the need). |
| 08-09 | **Chat search = ARM B, server-side** (owner: "I'm fine with a server side message thing") — `search` param on chat.listChats matching title OR participant names OR **lastMessagePreview via the messages join**; the 2026-08-01 preview-matching semantics carry to the server WHOLE. Folded into the live L1 lane (supersedes its Arm A default for the search path; plain pagination stays for the unsearched list). |
| 08-09 | **Post-brief rulings:** DRAFT-TRUST = **ARM 1 client floor combine** (contracts `resolveRenderPolicy` in the editor preview; riding lane #48) · **v3 demo transcripts = REGENERATE, not heal** ("we changed quite a lot — regenerate so they're in the fully proper format") — v4 pack task #52, heal fork dissolved · **OUT-OF-BAND STUDY AUTHORIZED:** mine Open WebUI's OIDC/Authentik user-creation/login/group-assignment + precautions → adopt/improve proposal for our flow (auth-dominant ⇒ routed to security-executor per the security law, stickler depth; deliverable docs/design/oidc-authentik-openwebui-study.md). |
| 08-09 | **L1 in-lane rulings (orchestrator):** chat search over the paged list = **ARM A** loaded-pages filter + honest copy (the landed character-library precedent; preserves the 2026-08-01 preview-matching ruling) — server-search Arm B boarded as a follow-up needing an owner word on lastMessagePreview semantics · server `characterId` filter YES (chats-with-character.ts DELETED) · real-COUNT `totalCount` · readout-binding → `getChat`. **L4 barrels worklist was DEAD (correct refusal):** 135-symbol 08-08 list → 42 live orphans, near-zero overlap; re-specced on the fresh list, refinery cluster excluded until that lane drains, C12 flip in the follow-up leg. |
| 08-13 | **USAGE RE-RULE — bigger chunks, cheaper fan-out. The orchestrator is NOT throttled.** Real shape (owner): TWO Max accounts, primary resets Thu 23:00 and the second Sat 05:00 — the gap to close is a DAY-ISH, not 3×. Cause is **"five opus plus orchestrator at full tilt"**, i.e. TIER on the fan-out, not the orchestrator working. Ruled: (1) **lane = one AREA, 4-8 items, one brief, one commit** — the agent's cold area read is the expensive part and per-ticket lanes re-pay it every ticket; (2) **MODEL TIER is the lever** — cheapest role that can plausibly succeed, escalate on failure; every ad-hoc agent / fan-out sets `model` EXPLICITLY (unset inherits the main tier = accidental Opus lanes); (3) **warm `SendMessage` legs over fresh spawns** for a second task in a live agent's area. **OVERRULED same day:** an orchestrator "diet" (cap 3, waves, go-quiet, no source reads) — owner: *"I'd rather the orchestrator properly runs and works itself normally… don't footgun us and I fully intend to still do all day things."* Cap stays FIVE, fill the lanes. The only surviving load rule is the independent \~3 GATE-HEAVY-lanes flake ceiling. |
| 08-13 | **AGENT-SDK×vLLM RESIDUE — STRIP (owner-flagged).** The skin was retired by the 2026-07-27 ruling (`buildClaudeVllmEnv` deleted · `translate.ts:70` refuses `case "vllm"` · `deriveRunner` throws at `dispatch.ts:37-46`); what survived is vLLM-side scaffolding built FOR it. **Agent-sdk itself STAYS** (max-pro-sub + the OR-Anthropic skin). Scope + the do-not-touch list in the LANE-READY row. Key hazard: the flags are mostly still LIVE, only the RATIONALE died — a strip driven by comments alone breaks rpg tool calling. |
| 08-13 | **SICK-WINDOW POSTURE** (norovirus; owner unavailable): static-verifiable work only · no fleet ops · no pushes · no DB wipe / re-import / baseline-squash · cap 3 in waves. Lifts on his word. Recorded in LIVE STATE. |
| 08-14 | **`maxTurns` BANNED on EVERY agent (owner, overnight, verbatim "hell no")** — reverted same night (`579f28161`) after the agents-revamp lane added it (80/40/25) and the pre-existing scout 45 / Explore 30 were stripped too. WHY: the dispatch model is bigger chunks per agent FOR caching + wider dispatch; a turn cap decapitates long area-lanes and a killed lane re-pays its cold read. Runaway protection = the orchestrator watching lanes (TaskStop), never a per-agent ceiling. agent-authoring skill §5 carries the ban. The rest of the revamp (permissionMode / memory / mcpServers scoping) STANDS. |
| 08-14 | **RPG HEAD-LADDER ARM A RATIFIED (owner, awake mid-run: "im fine with the decision, the whole vibe with everything is do it right once even if it means more work")** — the orchestrator's overnight ruling (walk the selected lineage; B half-fix rejected; C dead as a law-reversal) is now OWNER LAW, not provisional. Same sitting: **paged-list lens law ratified** ("if i search then it should not just search on virtual stuff yeah? same for sort etc") → \[\[paged-list-lenses-go-server-side]]; the character-tab lane brief carries search+sort+tag-filter+favorites ALL server-side, chip vocabulary from a server tags query, and the .find() consumer sweep. |
| 08-14 | **STALENESS FORKS RULED (owner, via question tool, all four on recommended arms):** F1 per-USER localStorage namespacing · F2 in-app re-auth MODAL (state-preserving, single-flight, resume-in-place) · F4 logout = per-SESSION eviction (admin revoke stays per-user via back-channel) · F5 bulk ops = server QUIET-MODE emits (the #23 terminal-fan precedent generalized). F3 taken on stickler rec as stated assumption: OIDC silent renewal = redirect-bounce. **PREMISE CORRECTION (owner): multi-HUMAN-same-box is NOT a scenario — one human per box; the binding requirement is ONE user, many tabs, many devices.** Lane-B design doc's "multi-human install" phrasing needs truth-repair when W-items build; the W-items themselves survive re-motivated (F1 by db-remint identity splits, F4 by multi-device). **W1-W4+W6 BUILT + MERGED overnight** (the modal/resume/single-flight/per-user program; 9 as-built deltas in the design doc §5a); W5/W7/W8 remain queued. |
| 08-14 | **SECOND OVERNIGHT SITTING (owner, via question tool):** F4/F5 **CONFIRMED as ruled** with the stickler's counter-rationale surfaced (per-SESSION eviction accepting the D135 sessionId-threading cost · server quiet-mode emits) — framing debt discharged, doc §7 truth-repaired. **EVENT-BUS FIX WAVE: FULL GO** (refineryChanged + rulesChanged + databankChanged + sweep terminals, E4 ritual each, THEN gates G-A + G-B). **ALL NINE ruled-never-rowed programs STILL WANTED** (nothing killed; C1 = status-check INVESTIGATION first, forge-ban means re-dispatch to a permitted role if stranded). **PUSH: HELD — owner pushes himself**; verify --push battery still runs at close-out and its verdict lands here. W4 clarified for the owner: the cross-tab session channel + single-flight primitive; full plan is W1-W10, W9 fenced to the live character lane. |
| 08-14 | **SWEEP RESULTS MUST BE ACTIONED OR GATE-EVALUATED (owner, standing): "when we do sweeps the results need to be actioned or seen if a gate can be made — board things."** Every sweep/survey deliverable now owes board rows: each finding → a lane/small/kill decision, each CLASS → an explicit gate-candidate verdict. Applied retroactively to tonight's class sweep + bus survey (rows below). **Also recorded (owner): the PRESET/PARAM system "is feeling crunchy — not like the registry system that is easy to grow"** — a design smell on the books, paired with the sampler-defaults MAYBE row; any future preset-area lane reads this first. |
| 08-14 | **OVERNIGHT CAP RAISED 3 → 5 (owner, mid-night: "since we have codex and can make progress your orchestrator limit is five agents now").** Matches the daytime standing law again; lanes stay FILLED. |
| 08-14 | **MORNING RULINGS (question tool):** DRAFT-MODE = **ALL SEVEN RECS RATIFIED + R0 GO NOW** (server substrate; takes first free slot; R1-R3 follow; db squash rides R0) · LONGER-OUTPUTS = **PARKED, owner picks numbers** (row stays, no lane) · THEME-EDITOR = **DRIFT — convert to autosave** (smalls) · SID-01 tails = **BOTH GO**: local/loopback endpoints exempt from 3-strike auto-revoke + custom Test button switches to testHealth (smalls). |
| 08-14 | **W7b/W8 in-lane rulings (orchestrator, receipted premise-deltas):** W8 sweep found every named bulk verb ALREADY single-emit — the ONLY real per-item storm is the IMPORT per-card path; quiet mode ships as a GENERAL primitive `withQuietUserEvents` at the one publish funnel (ALS-scoped so concurrent same-user edits pass; first emit = start marker, coarse terminal per silenced type from finally, satisfies-Record totality). W7b: no self-service profile verb exists; `identityChanged` emits from setRole/setEnabled (AdminContext) **+ the provisionIdentity updateExisting arm APPROVED** (ProvisionResult flag, entry callers emit — login-time demotion must reach live devices). Hint-less member, plain-TS+belt grammar (zod directive targets the dead-twin class, not this file). |
| 08-14 | **DAYTIME SITTING (question tool, all four):** `chats.star`→`starred` = **RENAME EVERYWHERE** incl. the chat-bundle export/import wire key (NO-LEGACY; RPC mutation name `chat.star` stays per the archive precedent) · **updatedAt = ALL THREE** (characters/world\_books/world\_entries) via baseline squash · **33 unwired procs = PARK ALL** (dormant product surface by design; row closes as parked, NO deletions, no sitting — supersedes the intent-sitting row) · **max-output = KEEP 2048** (longer-outputs row stays parked until the owner names a number). Sequencing law for the two schema rulings: R0's squash lands FIRST, then ONE db-rename leg (star→starred + updatedAt + bundle-key rename) re-squashes on the merged tree — never two concurrent baseline regens. |
| 08-14 | **R0 in-lane rulings (orchestrator, receipted):** squash rides R0 per tree law (Tier-1-DB regime 1 + baseline-single-migration gate — the brief's "additive only" line was WRONG, lane correctly refused) · stats rebuild-from-canon gets the SAME husk exclusion as the live delta (drift-gate contract; fence extended, no stats lane live) · host writes CLAIM incl. pre-first-turn greeting edits (F4(a) letter; losing hand-edits > premature visibility) · R0-early delta accepted: refused send → hidden husk reaped at 24h, recorded as-built. |
| 08-14 | **Client cross-feature calls (owner, verbatim): "chat and character can call whatever they want on the client if they use proper channels/methods like trpc or etc."** Features still never import each other's INTERNALS, but any feature may fire any tRPC verb through the proper tiers (#data hooks / createEntityMutation) — no capability ceremony, no registry indirection required for a plain cross-feature mutation. Applied live to R1's use-start-chat.ts home. |
| 08-14 | **BRIDGE FORKS F-A..F-G = ALL SEVEN ON RECS (question tool, midday):** gate-free `chatDeleted` to still-attached pumps (F-A, unblocks LANE 2) · bulk quiet window silences the room fan w/ coarse terminal per (room, kind) · ONE `roomEntityChanged` member with an `entity` enum · migrate the built character fan in the SAME wave (no double-fan) · databank/regex twins deferred as candidate rows under the SEATED-red gate arm · preset "host changed model" notice = registry-row end condition only, no build · rename `withQuietUserEvents` when it learns room pairs. LANE 1 dispatched (doc §10 1-7 = the spec). **SHAPE-CHURN = PROBE FIRST** (doc §4 live probe settles M1 table-promotion vs M4 reasoning-mount before any arm builds; probe lane dispatched). |
| standing | persona↔rpg linkage DO-NOT-BUILD (persona-pin flavor recorded) · persona reading-B OFF THE TABLE (re-affirmed 08-08 after full walkthrough) · presets are GLOBAL, never per-room · WIRE\_CAPTURE on = deliberate debugging posture |
| open | *(none — every fork ruled as of the 08-09 midday sitting; new forks append here)* |

## ═══ STANDING LAWS (owner-set, all in force) ═══

- **LANE SIZING = BY AREA, NOT BY TICKET (re-ruled 08-13 on the burn math).** The expensive part of a
  lane is the agent's COLD READ of the area (contracts + schema + neighbouring code), not the edit. Three
  tickets in one area dispatched as three lanes pay that read THREE times. So a lane is now **one AREA
  with every queued item in it, 4-8 items, one brief, ONE commit** — not one ticket. The 08-08 "BIGGER
  LANES" ruling said bigger; this says HOW to be bigger. Split only when two items genuinely can't share
  a read set. Receipts in the report, never the commit message.
- **Cap FIVE concurrent lanes, fill them.** (08-08 stands. An 08-13 draft cut this to three-in-waves and
  the owner OVERRULED it same day: *"I'd rather the orchestrator properly runs and works itself normally…
  I fully intend to still do all day things."* The orchestrator working continuously is the intended
  posture, not the leak — do not re-propose throttling it.) Independent nuance that DOES stand: no more
  than \~3 GATE-HEAVY lanes verifying at once, staggered by a couple of minutes — 5+ synchronize their
  verification into load-60 spikes that flake gates, and a flaked gate is a re-run. That is a FLAKE
  ceiling, not a usage one.
- **MODEL TIER IS THE BURN LEVER, NOT LANE COUNT (08-13, owner: *"it's just not running five opus plus
  orchestrator at full tilt"*).** Five concurrent lanes cost what five lanes of WORK cost; five concurrent
  lanes **on Opus** cost multiples of that. The orchestrator stays frontier-tier and runs all day — the
  fan-out is what gets tiered. Start every lane at the cheapest role that can plausibly succeed and
  escalate on failure, never the reverse: `scout`/`Explore` (pinned Sonnet, never inherits the main tier)
  → `mech-executor` for anything fully specified → `executor` for judgment work → Opus-tier
  (`security-executor`, `stickler`) ONLY for security-dominant or pre-merge-review work. `forge` stays
  BANNED. Any ad-hoc agent or workflow fan-out MUST set `model` explicitly — an unset model inherits the
  main session's tier, which is how five Opus lanes happen by accident.
- **Worktree CURRENCY (owner intent 2026-08-08):** origin always lags local main (owner pushes by hand,
  and did push when the sub ran out) — **measured 08-13: `origin/main` `6155e3050`, main 7 AHEAD, 0
  behind.** Not "70 behind"; that figure came from a stale 08-09 block and is retired. The lag is small
  but real, so worktrees must still carry the latest LOCAL commit. (1) SPAWN: `worktree.baseRef: "head"`
  — `head` branches from local HEAD; the default `fresh` branches from `origin/main` and would spawn every
  lane 7 commits stale. **MIGRATED 08-13 (owner-approved) out of the gitignored
  `.claude/settings.local.json` into the TRACKED `.claude/settings.json`, so it now travels with the repo
  and survives a reset of the local file. Also set globally in `~/.claude/settings.json` as a belt.**
  (2) DRIFT: before merging, REBASE
  the lane's single commit onto current main in its worktree (`git -C <wt> rebase main`), then
  `git -C <main> merge --ff-only` (rebase rewrites the SHA — track the new tip). Consolidated `pnpm check`
  after every merge; **read EVERY check exit** — a finished check that sits unread is the same as
  skipping it.
- **⚠ WORKTREE TEARDOWN DOES NOT FIRE ON AGENT COMPLETION (probed live 08-13).** CREATION is correct —
  the `WorktreeCreate` hook runs, produces a real worktree (`.git` FILE with a gitdir pointer, common-dir
  → main), branches `wt/<name>` from local HEAD, symlinks `settings.local.json`, and installs deps.
  **REMOVAL does not:** a completed probe agent left its worktree on disk, still registered, metadata
  intact, branch undeleted. **So worktrees ACCUMULATE — the orchestrator must sweep them by hand.** This
  is the origin of the two Aug-9 orphans cleaned up 08-13, whose end state (dir present, NO `.git`, NO
  `node_modules`, NO `.claude/`, metadata gone, `wt/` branch surviving = the remove hook's branch-delete
  never reached) matches a teardown that started and died partway, never a clean one. **THE FOOTGUN:** a
  worktree dir with no `.git` resolves `git -C` UP TO MAIN — an agent handed that path commits to main
  believing it is isolated. **Sweep at end of session: `git worktree list` · `git worktree remove --force`
  registered ones · `rm -rf` unregistered dirs · `git worktree prune` · `git branch -D wt/*` AFTER
  confirming `git rev-list --left-right --count main...<branch>` shows 0 on the branch side.**
- **GRADUATION = the fresh lens, not the static check:** every non-trivial merged work-stream gets a
  fresh-context `verifier` (code) and/or `side-eye` (rendered) at CHUNK granularity BEFORE its row is
  done. Security-dominant → `security-executor` (never Fable, never the main session).
- **NEVER push origin without a fresh per-push owner word.** Current standing: a CONDITIONAL word is
  granted for the preset train — after PRESET-FOLLOWUP lands + fix legs + a FRESH battery greens,
  push. Otherwise held. `E2E_LIVE=1 pnpm e2e` is owed on the push window.
- **A value/label/enum-changing merge owes the BATTERY, not just static** — `pnpm check` never runs
  `tests:node`; budget \~1 stale coupled fixture per value-changing lane
  (\[\[shared-value-change-owes-a-battery-not-static]]). One `verify --push` when the train drains.
- **Every UI build gets its side-eye, and ALL findings get fixed** (\[\[side-eye-fix-all-findings]])
  — but a side-eye PRESCRIPTION never reverses a recorded ruling; kill the symptom, keep the law.
- **Gates land on a FIXED tree**; allowlists are permanent deliberate exemptions, never debt parking.
- **Overnight full-auto:** work the queue via the escalation ladder, no blocking questions. Block
  only for: destructive/irreversible · owner-sacred (persona pin) · origin pushes · scope pivots.
- **DOC-ONLY commits are `--no-verify`** (owner re-affirmed 08-14) + `node scripts/docs/format-md.ts --write` first (path corrected 08-13 — `scripts/check/format-md.ts` is MODULE\_NOT\_FOUND). **Gate
  economics (lefthook.yml read IN FULL 08-14):** `pre-commit` AND `pre-merge-commit` each run the whole
  \~150s static tier; `pre-push` runs the full battery (static + tests:node + CT + e2e-smoke + cpd +
  parity). So: merge a DRAINING TRAIN `--no-verify` on branch-side green receipts and gate ONCE at the
  train's end — never pay the static tier twice for one tree state. `scripts/verify/registry.ts` /
  `pnpm verify --list` is the tier authority; anything else is folklore (lefthook's own words). Code
  merges otherwise keep the discipline above. D-numbers allocate at DISPATCH when two live
  lanes both mint. Lane briefs name their exact playwright CT files (a CT nobody names is a CT
  nobody ran).

## ═══ LIVE STATE (2026-08-14 afternoon — DAYTIME ROTATION, rewritten in place at the lens+probes merges) ═══

**Main `dd8683627`+, \~110 commits ahead of origin (owner pushes himself). Tree CLEAN (sweep
`68566aec7`: apisurface-\*.txt gitignored as regenerable scratch; Codex's .agents/skills committed;
audit dir committed `0de9e087d`, 330 files, hashes verified). STACK UP + FLEET UP on the 27B.**

**R0 MERGED `879827373`** (husk lens + ONE ClaimChatOp chokepoint \[claim after authority guard,
before write; stats replay bucketed on created\_at] + both reap arms; baseline squash = one line;
**⚠ NEXT STACK BOOT WIPES THE DEV DB** — regime 1, latch reseeds; red-first receipts all five arms,
2639 tests; R1 substrate ready: chat.reapHusk live-unused row + unchanged StartChatResult). Items-6/7
leg now UNBLOCKED (fires when the cleanup leg reports). Doc small owed: Tier-1-DB §Regime-1 step 2
`rm -rf migrations` → mv-then-verify form (subagent rm-rf deny bit the lane; mv is safer anyway).

**RUNNING (4):** **report-cards cleanup leg** afd5458183e0c973f (mech, warm-leg — the 9 consolidated-check structure
violations: \_shared→db/src/kit re-home · density-tier ELEVATED\_ALLOW stale arm · suppressions
regen · hint-trigger §13.7 trio+CT; structure must be exit-0 before the drain battery; items 6/7
STILL HELD behind R0) · **forms autosave-honesty** a6792eef0a9000b6c (executor — client-forms-01:
seams optional + unconditional "saved" = silent edit loss; mint-time rejection preferred) ·
**refinery bundle** a33497e3148dbbb6d (executor — content-surface routed CT \[zero mounted CT on a
crowning feature] + stale story header + `selection` two-writer mergeSheet fix) · **mutation gate**
adeeb7c0ae82ce38c (executor — RC-01 break:null cannot fail + RC-02 foreign-tree scan; clean run →
calibrated break + positive control; long run DETACHED).

**MERGED THIS ROTATION (chronological):** Qwen cleanup `8fd771c4c` (6 of 33 dead; 27 marker-ratified/
live — zod hypothesis VERIFIED nothing-to-restructure; delete verdicts owe a full leading-comment
read) · smalls `ce7e9dac1` (9 of 10; theme-editor autosaves; density-tier 226→224; loopback 3-strike
exemption + universal testHealth) · report-cards train `d5dee1bd7` (items 1-5, 10-11, 14-16; new
homes: db checkList \[re-homing now], kit isIfTruthy, ui live-token-resolver + sin-hash +
hint-trigger; item-14 "all three" premise stale — web-weave technique differs, consolidated 2-of-3) ·
W7b+W8 `b85e82e24` (identityChanged + withQuietUserEvents; setEnabled REFUSED w/ receipt; **CT-broken
claim vs sibling green CT = CONTRADICTION — arbitrate on the quiesced tree at drain;
es2025/esbuild-0.25 suspicion, 67d7805d0's dead premise**) · DEPLOCK `5d0105e72` (sharp 0.35 + pdfjs
6.2; audit highs 12→10; jsx-a11y/eslint-10 REFUSED-unfixable-upstream) · **AGENT-TOOLING-01 P1 CLOSED
`27aad9d18`** (identity-based self-exemption post-blanking post-hard-floor; corpus A/B 119,845 calls:
self-exempt 106→1) · **GUARD SCRIPT-BODIES CLOSED `b5b1db9c7`** (owner-spotted hole: untracked
wrapper bodies now classify through the same rules, strictest wins; corpus A/B 115,894 cmds — 196
move, ALL stricter; live lanes warned re: 68 wrapper shapes that now refuse) · **GUARD FOLLOW-UP
FAMILY, one future security-executor leg:** `bash -c '<string>'` operand invisible (73/day — extract

- classify recursively; not bundled because setsid-nohup-bash-c is a live sanctioned shape) ·
  quoted rm-rf target blind \[pre-existing] · RM\_RF\_HEAD matches plain `rm -f` + counts
  `2>/dev/null` as a target (narrowing WEAKENS a control — owner call) · `packages/**/__probe` not
  in RM\_SAFE\_TARGET (doctrine's own probe cleanup is ask-tier; one token, loosens — OWNER call) ·
  double-quoted `$()` invisible guard-wide · pipe-rewrite comment tail ·
  **design-sync `6598c489d`** (weave cluster → claude.ai/design "Orbweaver UI" 2ec379a2-…; 3 components
  10 graded cells; motion brief in the README; find: app names Geist but ships NO @font-face) ·
  **lens calibration `defc033f2`** (six classes fixed AT THE LENS: typeonly 47→1, prodonly→derived,
  testonly \_\_-seams, columns→provenance, regkeys row-array shapes; rows 101-133 VERIFIED-REAL →
  owner ruled PARK ALL; 57 lens tests, stdout parity ×4 verbs) · **probes hygiene `dd8683627`**
  (fail-closed goldens, REPO\_ROOT resolver ×8, viewport >0, README 5→7).

**REFINERY BUNDLE MERGED `57fb8595b`** (arm C patch grammar: absent=keep · null=all · array=exact —
"I didn't touch this" is now sayable on the wire; content surface has routed CT 41/41; straddle
red-first = G-C's historical control banked). **es2025 CT arbitration — second cold receipt:**
warnings-only, 3 full green builds on the refinery tree; W7b's hard-stop claim now the outlier;
final word at the drain's cold `pnpm test:ct`. **New small from the lane:** ScopeEditorDialog seeds
useState once at pane mount and never re-syncs from view\.selection — fields axis is last-write-wins
from a possibly-ancient image (greetings axis now safe via the delta grammar); one-line remount fix
(`key=` on view\.selection or open-time reset), rides any refinery client pass. **Lesson (board law
restated):** an audit row's prescribed REMEDY can be a no-op for its own symptom — mergeSheet was
right as a class name, wrong as an instruction; the tell was reading the actual WRITER, not the two
verbs the row named.

**WEAVE-LAB SECOND HANDOFF FETCHED + committed `bf1d3a654`** (spec: docs/design/weave-lab-upgrades.md;
references vendored in mocks/): silk physics pure module (pluck/shiver/wind) · spider prey state
machine (rest→alert→sprint→inspect→return) · character presets + araneid anatomy v2 + frame-laying
itinerary · WebSpinner weave-loop redesign · WebWeave interactive/wind/character/tempo API.
**AMENDS motion-fixes §2** (rect-bounded radii OVERSHOOT +14 as crop-anchors, never inset floating
tips) — relayed to the in-flight motion lane mid-build. The upgrade program = the motion lane's
SECOND LEG after its fixes commit (design side's own sequencing: fixes first).

**UI-RENDERING-01 CLOSED `a383c669d`** (mechanism measured: toBeVisible's \~100ms poll grid vs CM6's
75ms wall-clock accept-guard = the coin flip; the OLD retry band-aid was destructive — re-pressed
Enter mutated the doc invisibly to textContent. Component INNOCENT, untouched; 300/300 ×2 at
repeat-each=20 + neutralized-barrier control red. Watch-list row "CM6 75ms completion" closes with
it. Product fact for the owner, not a defect: Enter within 75ms of the list appearing inserts a
newline by CM6 design — `autocompletion({ interactionDelay })` is the lever if accept should be
snappier. Gate note: `test-determinism` regexes COMMENTS too — prose mentioning Date.now() fires it,
no exemption grammar. Lessons → \[\[ct-test-gotchas-hub]]).

**MOTION FIXES MERGED `9be2fbd92`** (all four owner defects dead, red-first ×8, rendered
before/after at three hosts; three-mode sway respects the shipped bake/blit cache; two residual
seams PINNED: 104px scaffold entry \[choreography-scoped, may dissolve in the lab leg] + rest-beat
snap). **Its pre-existing-red sweep caught the checkList-barrel 80-cycle class** (my cleanup-leg
brief's convention wiring — every lane's scoped check missed it, all branched pre-re-home): FIXED
`7994de156` (schema imports the LEAF, depcruise 80→0). Drain small: knip flags
LiveResolverRootElement unused in live-token-resolver.ts.

**═══ LIVE STATE (2026-08-14 midday — TRAIN SEALED + PUSHED; supersedes every rotation block below) ═══**

**Battery 2 landed (1 red → fixed `31f9516be`; receipts in the delta at board top). `pnpm check`
GREEN, structure single-pass clean (207 gates), types:graph green. PUSHED: origin
`6155e3050 → 0351b8a37` (+161; owner word). **DB WIPE CONFIRMED DONE** — live db is on the new
schema (`chats.starred`, `characters.updated_at`), 11 characters / 6 chats = fresh reseed; the
472MB file size is SQLite freelist (drop never shrinks). The reset fired on an earlier watch-reload
boot; the 10:21 stack restart was a no-op boot (hashes matched, migrate.ts:62 latch quiet). Stack UP
:8788 loopback + vite :5173, engines all adopted.**

**RUNNING (2 — `orbweaver-wt/{gg-gates,gf-guard}` self-made worktrees, sweep by hand at drain;
plus Codex on its own worktree now, owner-relayed):** MERGED FROM THIS WAVE: deps-mermaid
`c05a2e45d` (swept) · bridge design doc (wt/bd-bridge, worktree still up pending fork answers) ·
smalls-client `1abbaf62f` (post-merge types:graph 0; worktree pending sweep). **PostToolUse biome
hook FIXED for worktrees** (root now walked up from the FILE — CLAUDE\_PROJECT\_DIR always names
MAIN; the false-positive wall on every lane edit is dead; verified both tree kinds).
**Original dispatch note (4 lanes, \~10:30):** `gates-gg-exports`
(executor — G-G testid-liveness + ui exports-map arm + density-tier ratchet-arm port) ·
`bridge-design` (stickler — entity→room member-freshness bridge + R1-4a, design doc only) ·
`guard-followup` (security-executor — bash -c operand + double-quoted `$()` + pipe-rewrite tail;
the two LOOSENING items stay owner-calls) · `smalls-client` (executor — book-attachments picker
clamp · turn-tool-calls lineage filter \[paths drifted to features/rpg] · ScopeEditorDialog remount ·
genRepetitionPenalty row move · staleness-doc §1.1 truth-repair; rpg-takeover-header `:95` item was
already-fixed, dropped at re-derive). **CODEX is active on the MAIN checkout** (their doc lane is
reconciling; 60-finding docs verdict incoming — orchestrator watch armed on the audit dir).

Design project: claude.ai/design/p/2ec379a2-fddd-4bc2-bc58-023b8a684575.\*\*

**TODAY'S TRAIN (compressed; git log 8fd771c4c..HEAD is the authority):** Qwen cleanup 8fd771c4c ·
audit committed 0de9e087d · smalls ce7e9dac1 · report-cards train d5dee1bd7 + cleanup 8eca945c7 +
star/updatedAt 31ef3df43 · W7b/W8 b85e82e24 · DEPLOCK 5d0105e72 · guard P1 27aad9d18 + script-bodies
b5b1db9c7 + tuple f42f3ea3c · design-sync 6598c489d + fonts + annotator fd9c89234 · lens defc033f2 ·
probes dd8683627 · R0 879827373 · motion fixes 9be2fbd92 · weave lab 242a08707 · checkList-cycle
7994de156 · factory bbfa31605 · #36 close 35a69347e-merge · reapHusk sweep d885ff311 · mutation
runnable be258f4e9 + break=50 2463765ed (FIRST SCORE: 55.56/58.02; artifacts reports/mutation/) ·
smalls-3 2f9a9897e · R1 efc4cc2b2 (draft runtime DELETED −4,432) · R3 leg caa06972c (message-loss
window closed) · heal collapse dc72ac325-merge · gate batch 7ebe3a12c (201→207, G-E refused) ·
lint drain 62e7aa6bc · draft-cast pins 595b8a5f6 · UI-RENDERING-01 a383c669d.

**OPEN ITEMS (the real list, everything else below is archive):**

- [x] **BRIDGE LANE 1 BUILT + MERGED (`7df073db5`, 08-14 evening; 519 tests, red-first on the
  owner's exact symptom — the getMemberCard row).** A character/persona/world-info edit now reaches
  OTHER humans' open rooms on the null-seq live lane. NO SQUASH, dev db NOT dropped (225v225
  baseline parity proof — the durable-subset derive removed no CHECK key; squash rides LANE 2).
  As-built deltas receipted in the design doc (§3.4/§3.5/§3.6/§10): four world-info arms ·
  chat\_events column types STAY `ChatBusEvent` (narrowing would re-type the D16-frozen §3.6
  stamper for zero coverage; CHECK is the second belt) · invalidation.ts SPLIT (reads →
  `invalidation-reads.ts`, component-size) which forced a one-hop walk fix on
  query-freshness-coverage (two-sided conformance) + 2 BELT\_EXEMPT grammar rows.
  **QUEUED — LANE 2 (dispatch when ghost-tail lands; bus.ts collision fence):** chatDeleted
  live-only + both delete paths DELETE-first (R1-4a closes) + the baseline SQUASH (⚠ next boot
  wipes then) + quiet (room,kind) generalization + F-G rename + the G-A roomReach SEATED-red gate
  lane. **NEW ROW — ENTITY-DELETE FRESHNESS (named by the lane, boarded as promised):** deleting a
  seated persona / attached book reaches NO member (SET NULL/CASCADE fires with no verb emit; reach
  resolves ∅ post-write by construction) — fix shape = pre-write reach capture, per the
  emits-precede-deletes law; recorded in contracts/events member headers + doc §3.6. **Follow-up
  small:** `forceCharacterTurn` still opens its slot only at turnStarted (the aux-accepted lane's
  \~6-line leftover; `slotAccepted` machinery exists). Original design row:
  `docs/design/entity-room-member-freshness-bridge.md` (stickler lane, 427 lines, check:docs green).
  TWO PREMISE CORRECTIONS from the tree (doc §0/§3.2): the character→room fan ALREADY EXISTS
  (`entry/compose/emit-character-updated.ts`, always-on at search-discovery.ts:162-170) — the owner's
  live symptom is a MISSING CLIENT FILTER ROW (`chatUpdated` never covered `chat.getMemberCard`,
  invalidation.ts:174-199 vs :216); and `chatUpdated` can NOT be reused live-only (client seq-guard
  drops non-advancing frames; wholesale exemption un-dedups real replays). Design: entity domains
  emit domain events (persona/world-info join character, ids mandatory) → ONE reach engine at the
  composition root (`Record<RoomEntityKind, resolver>`, three single-indexed-SELECT resolvers) → NEW
  id-free chat-bus member `roomEntityChanged {chatId, entity}` on a durable-append-free NULL-SEQ live
  lane (attach-synthetic non-advancement rule reused) — which ALSO closes R1-4a (`chatDeleted` goes
  live-only, both delete paths reorder DELETE-first, window CLOSED not narrowed). Clamp suite
  byte-untouched (both clamps are structural pass-throughs for id-only members). Quiet mode extends
  to (chatId, entity) pairs. **7 forks F-A..F-G await the owner (doc §11, recs marked; F-A blocks
  LANE 2). Build cut: LANE 1 = contracts member + live lane + baseline SQUASH + reach engine +
  old-fan deletion + client rows (doc §10 1-7); LANE 2 (post-F-A) = R1-4a reorder + quiet
  generalization + G-A roomReach lane w/ SEATED-red arm.**
- [x] **G-G `testid-liveness` BUILT + MERGED (gates lane, 207→209 with its sibling):** historical
  control REPLAYED (`efc4cc2b2` pre-fix file planted → RED at the exact two draft-cast ghosts;
  restored → green, scanned 4644/4853). Mechanism correction banked: CT stories are FIRST-CLASS
  producers (the ghosts' producer was `_ct-stories.tsx:309`, not packages/) and producer evidence
  is 3 rules (literal · static-template · registry-KEY in packages src — the `testKey` prop
  indirection); 313 consumed values, 0 false positives, no allowlist. 3 dead registry ids DELETED
  at landing (`appShell`/`messageList`/`corpusSearchInput`).
- [x] **ui `exports-map-complete` BUILT + MERGED (own gate, not an arm — receipted decision):**
  ui-primitive-structure is §13.7 primitive-structure law; this spans charts/content/art + top-level
  modules, module/family split DERIVED from the tree (no stale family list possible), A3 two-sided
  stale-entry arm. RED on planted `gg-probe` dir, GREEN 85/85 module dirs. **BONUS: gate-count
  ONE-HOME arm on enforcement-registry-parity** — the rotted "133" was a frozen copy in the
  lockdown doc (:639, 07-16), not Active-Gates; any core doc restating the count now REDS; the
  lockdown doc cites the line instead. Codex's "active-gates says 133" was mis-aimed at the right
  rot.
- [ ] **R1-4a residual false-emit** (accepted-documented): closing needs a durable-append-free live
  fan on the chat bus — pairs with the bridge item above, one bus-surface design.
- [ ] **F6 addMember-greets-before-freeze arm** (roster verb, out of R1/R3 scope).
- [x] **Guard follow-up family — LEG LANDED (security-executor, merging):** four holes closed
  red-first — `bash -c` operand extracted+classified (the HEADLINE: the push-word control was
  bypassable by `bash -c 'git push …'`, 3 real corpus commands did it) · `$()`/backtick
  substitutions classified when they'd RUN (single-quote/comment/heredoc stay text) · pipe-rewrite
  comment tail (a `# comment` ate the exit-restore; harness exit 3 returned 0 — proven, fixed) ·
  self-exemption = canonical REALPATH (a /tmp look-alike hook now denies; Codex's reconciliation
  find). Corpus A/B 122,062 cmds: 61 moved, 17 stricter, 0 LOOSER; depth-cap 6 after a cap-2 run
  cried wolf on benign `$(dirname $(readlink …))`; 16.9µs/cmd. 19 int tests. A/B report landing at
  `docs/reviews/security/2026-08-14-tool-guard-operand-visibility-ab.md`.
- [ ] **GUARD OWNER-CALL PILE (all surfaced by the leg, each would LOOSEN a control — rule when
  convenient):** (A) 6 corpus cmds `$(sqlite3 "file:…backup-*?mode=ro" …)` now ask — a ro/backup
  safe-hint is a loosening · (B) 4 cmds `"$(curl localhost | node -e …)"` now deny via the
  net-pipe-shell floor arm — `node -e` doesn't exec fetched bytes, narrowing is a loosening ·
  (C) one snap-in-substitution idiom now denies (piped harness inside `$()`, no safe rewrite) ·
  (D) quoted `rm -rf "target"` blindness MECHANISM NAMED (greedy RM\_RF\_HEAD eats the blanked
  quoted target → empty target list; 29/32,171 rows) — minimal fix = read targets off a
  quote-stripped stage; separate A/B-owed change · (E) `script-scan-error` still DEFERS at the wire
  (stalls a lane on a command nothing objected to; :989, one line, decision not fix) · (F) standing:
  RM\_RF\_HEAD matches plain `rm -f` (bit the lane's own cleanup — live receipt the over-match
  costs) + `__probe` not in RM\_SAFE\_TARGET.
- [ ] **OPS LEAD:** after a merge that MOVES exports between modules, main's vite dev server serves
  stale prebundle (nearestRayHit outage, :5173 down until cache clear + bounce) — teach
  stack.sh/dev tooling to clear packages/client/node\_modules/.vite on merge, or document the bounce.
- [x] **OPS LEAD RESOLVED (10:12 08-14): the "unattributed" tooling-int vitest run was CODEX** —
  their lanes share the MAIN checkout (owner word: no worktrees taught) and the board's own
  Codex-verify line for the scan-denominators item names exactly that command. Standing consequence:
  while Codex is active, a structure red taken mid-window can be their `__g_` fixture race (phantom
  `domain/hub` reds) — re-run on a quiet tree before believing it.
- [ ] Codex snapshot-only doc families = revalidate-when-touched (their own instruction) · owner
  pile: longer-outputs numbers · theme/dogfood live receipts (selector wire-capture flip, W3 revoke
  probe) · re-import (owner-run). ~~the push~~ (PUSHED 08-14 midday, owner word).
- [ ] **CODEX DOCS CLEANUP LANDED `a2fb3d950` (58/58 classified: 15 fixed · 33 archive-no-action ·
  10 NEEDS-OWNER).** Disposition tables under
  `docs/reviews/repository-audit-2026-08-13/doc-cleanup/`. The 10 owner calls, distilled: (1)
  Documentation-Law's size ceiling vs two over-limit core docs — permanent exception or split? ·
  (2-3) a review-record disposition convention (frontmatter can't say historical/current/superseded;
  don't mass-rewrite dated findings) · (4-10) vendor-corpus policy — base-ui carries 333 site-root
  links + no refresh producer, vite 173/255 root/relative links + no pinned fetch command; needs a
  link-rewrite mapping + snapshot-provenance ruling. Orchestrator delta on top of their patch:
  Core-Laws §7 range bumped D137→D138 (patch predated the W10 mint); their de-dup of the §7
  D-synopsis line to a registry pointer ACCEPTED as the one-home fix.
- [ ] **CODEX RECONCILIATION RESIDUE (their final verdict, 08-14 midday — routed items excluded):**
  test-coverage cluster as ONE future lane (LOWER-DB-01 four schema behavioral tests · UI-AI-01
  AriaAnnouncer · UI-SZ-01 VirtualList branches · LOWER-KIT-01 card-frame browser/iframe proof ·
  CLIENT-SHELL-02 dev bridges · platform-tooling-01 egress-firewall behavioral proof ·
  test-baseline manifest regen) — candidate SECOND Codex package if their docs round proves out.
  CMD-01 refusal STANDS (ledger law, re-listed by them without new evidence). agent-sdk 0.3.232
  exists upstream — a dedicated small proves whether it clears the fast-uri/ip-address/hono
  transitive cluster. Already routed live: realpath self-exemption → guard lane · Active-Gates
  count → gates lane · mermaid/dompurify → MERGED `c05a2e45d` + serving (installed, vite cache
  cleared, stack bounced).

**UNSETTLED-DESIGNS SWEEP (owner-asked 08-14 midday) — SCOUT-CORRECTED same hour: the owner
suspected rows 1-4 were already done and was RIGHT ON ALL FOUR.** Lesson minted: a design doc's own
status header ROTS exactly like a board row — minting a row from a header owes the same tree
re-derive as dispatching one (\[\[audit-lists-are-snapshots]] extends to docs/design). Second lesson
(owner-spotted): design-bearing docs land in BOTH `docs/design/` AND `docs/reviews/` (stickler
lanes write reviews/ by role even when the output is a spec — collection-contribution IS the
config-rail contract law) — every future design sweep covers both dirs; briefs name docs/design as
the deliverable path for design-shaped outputs.

- [x] **SHAPE-CHURN — M5 + M1 BOTH FIXED + MERGED (`f24abd1cb`; doc §6 carries the source-pinned
  mechanism).** M5's real cause: Streamdown ships the code-block container with INLINE
  `content-visibility:auto` + `contain-intrinsic-size:auto 200px` — the browser SKIPS the first
  layout and births the box at 202px from the hint, real layout one frame later = the 94px snap
  (both §5 leads dead: shiki was coincident cost, the dead utilities only set 202-vs-218). Fix =
  `content-visibility:visible !important` in globals.css (the component forwards no style/className
  — CSS is the only seam), global not ghost-scoped (also kills the scroll-in snap on settled
  blocks), cost priced (transcript not virtualized, MAX\_RENDER\_LENGTH already bounds). M1 =
  `holdAmbiguousTail` prefix-truncation pre-pass, streaming-only, remend untouched, head-block
  UL→P covered free; red-first defect proof + honest fences-vs-proofs labeling; 169 CT + 59 unit
  green. RESIDUAL: M4 still unmeasured (needs a reasoning connection) · M3 cadence = owner call ·
  live §4 re-shoot post-merge worth one snap · **:5173 may serve the STALE prebundle until a
  client .vite clear + stack bounce (new module inside @orb/ui — the nearestRayHit class); bounce
  is owner-timed, he is mid-drive.** Original probed row: §5 probe results merged: **M5 NEW + the best symptom match** — the code-block
  container is born 202px and snaps to 108px (−94px) in 20-100ms, 5/5 runs at exactly those values,
  children byte-identical (the churn is the container's OWN box; leads: shiki 254ms long frame in
  the window · Streamdown's `.my-4`/`.h-8`/`.p-1`/`.rounded-lg` DEAD in our CSS). **M1 confirmed**,
  2-3× slower than first measured (300-365ms), per-ambiguous-block (a HEAD UL→P flip too). **M4 NOT
  EXERCISED** (defaults emit no reasoning tokens; when it fires the churn will be the
  auto-COLLAPSE on first answer token, reasoning-block.tsx:70 — needs a reasoning-emitting
  connection, one-line re-dispatch then). Caret risk premise corrected (caret+reveal are OURS, #42,
  markdown.tsx:155-159; "remend" is upstream parseIncompleteMarkdown; M1 fix = tail PRE-PASS in our
  seal). Probe traps banked in §4: sample HEIGHT not just left/width (a container can churn while
  every child holds still) · probe prompts must not start with `/` (composer eats it as a slash
  command).
- [x] **LIST-PANE PROJECTION — CLOSED, BUILT-AS-SPECCED (scout, live-path rung):** the pane is
  live-wired — `ChatsWithCharacterPane` (chats-with-character-pane.tsx:57, chat front door) mounted
  at `main.tsx:243` via `makeCharactersSection(…, chatsProjection)`; picker⇄projection swap in
  characters-list-pane.tsx:29-39 + character-chats-projection-shell.tsx:45-68; O5 shape published
  (registry-contracts.ts:282). The doc's "draft, nothing built" header was ROT. Unverified residue
  (no row unless owner wants the layers): L2 portraits AvatarStack · L3 Arm-B faces strip · L4 band
  sweep · CT coverage.
- [x] **DEFAULT-CHARACTER ROSTER — CLOSED, TRANSPLANTED (scout):** all 10 handles 1:1 in
  `seeder/cards.ts` (lines 79-549, same order as the doc), landed by the dedicated migration commit
  `5b4541c07` ("v2-pack reseed — re-dress unedited seeded cards, never touch the user's"). Doc's
  "nothing wired yet" header was ROT. Field-level verbatim diff not performed (handle-level only).
- [x] **PARITY-PLUS PROGRAM — CLOSED, ALL SEVEN BUILT (scout, per-feature receipts):** relationship
  (RPG\_RELATIONSHIP\_KINDS → cast-card-slots) · level (sheet.ts:35, cites "parity-plus §2.6") ·
  lie/ofilter/CYOA (reveal.ts / member-visibility.ts / CONTENT\_CLASS\_POLICY + rpg-choice-echo) ·
  plot steers BUILT-DIFFERENTLY-HOMED (`@orb/kit/guided` via composer-utility-menu.tsx:153-211, not
  the spec's named file) · immersive card (RPG\_CARD\_TEACH + sandbox-frame srcdoc, §4.2 comment
  verbatim) · §2.7 delta block BUILT+TESTED (substrate/delta.ts, reminder.ts:531-539, delta.test.ts).
  Residue: the §12/§12A macro×rpg workstream unread by the scout — memory records it third-built
  (\[\[macro-rpg-feed-seam-third-built]]); no new row.
- [x] **CONTEXT-PANEL FIDELITY — CLOSED AS A GAP ROW (scout):** D-1..D-4 were ANSWERED 07-31 in the
  doc's own §4; D-4 Preview rebuild SHIPPED (`001846479` + 3 sibling commits); D-2 compact-switch
  was REJECTED BY DESIGN (injections-manager.tsx:121-124 comment: no toggle, "off" = delete the
  row). What remains is exactly what was already gated: the RV-1..15 owner-dogfood items re-verify
  under the W-H side-eye AFTER re-import (LIVE-WINDOW list) — no new row.
- [ ] **Config-rail R3-presets line is DEAD — doc amendment small:** `config-rail-spec.md` still
  carries "R3 (presets, owner-timed) is unbuilt and remains one door line", but the 08-08 C5 ruling
  closed it (presets STAY STANDALONE). Truth-repair the doc status; no build.
- [ ] **Config panel revamp — owner intent, now rowed:** recorded in the junk-drawer doc §9;
  registry-based relocations make it cheap when he calls it. Owner-timed.
- [ ] **Preset/param "crunchy" smell — no design doc exists yet:** ledger row 08-14 ("not like the
  registry system that is easy to grow") + the sampler-defaults MAYBE row = one future design lane
  (stickler-class) when promoted. Any preset-area lane reads the smell first.
- **Swept clean (no action):** actions-tab IA BUILT · preset-surface-redesign CLOSED (D121) ·
  tracked-field-unification stages 1+2 SHIPPED · note-token-intent settled by C2 ·
  gate-ignore-mention-fence BUILT · node-26-w4-residual LANDED · staleness W5 BUILT (lane 2,
  08-14) · notifications domain EXISTS on tree · st-message-shaping-atlas + docker-research +
  parked-options-\* = reference/parked by design.

**QUEUED:** gates G-A/G-B/G-C/G-D/G-E (fixed tree at drain; G-C's historical control banked) ·
**G-F scroller-positioning gate** (smalls-3's measured win: overflow-y-auto/overflow-auto/
overflow-y-scroll className must carry relative/absolute/fixed/sticky — \~40-site enumeration +
preset-editor 11-escapee receipt attached to the lane report; readPhantomScrollers in
tests/support/ct/scroll-containing-block.ts is the positive-control instrument; strictly stronger
than per-surface symptom pins, which are hereby NOT owed) ·
R2/R3 draft-mode · R3 refinery build + #39 polish + NL→schema (after #36) · #37 trust-gated card
images · #38 leftovers · C1 persona status investigation · #33 templating · #43 code-split ·
\#52 demo-v4 (fleet) · chats-pane eviction trap **(CLOSED — see the \[x] row below)** ·
gates G-A/G-B/G-C/G-D/G-E · Qwen-doc truth-repair (rows 101-133 "lens noise"→VERIFIED-REAL-then-
PARKED + row 281 "safe to kill"→provenance-mechanized — lens lane deliberately left the doc to avoid
a collision; the durable verdicts live in ast.ts's per-lens headers) · report-cards items 6/7 leg
(AFTER R0 merges) · Codex final-synthesis re-sweep at drain.

**DRAIN GATE OWED when the 5 drain:** consolidated `pnpm check` exit-0 (structure currently red-9,
cleanup leg out) → CT-contradiction arbitration (`pnpm test:ct` cold on the quiesced tree) → full
`verify --push` battery (value-changing merges: contracts user-bus + settings nullable + sharp bump

- schema re-home) via setsid+Monitor → morning-delta rewrite at board top. Push stays OWNER'S.

**MERGED OVERNIGHT (all hook-gated or branch-receipted, chronological):** WAVE-0 vLLM swap statics
`c46e282ea` + tooling `348d3fa7a` · agents revamp (then maxTurns owner-BANNED, reverted `579f28161`) ·
staleness design + W1-W4/W6 build `b0f3343e1` · PROD-LEAK `57b091d74` · rpg stat+rewind `73041bf59` ·
bus survey + refineryChanged `7c7d14fa4`-era · residue strip (samplers per-request) · ast scan-ledger
`d9f2d5726` · T2 PID-lock `8f54440` · T3 gate denominators `abd3f2fac` · SID-01 `6cf7ffc68` · character
lenses `7605c5ee5` + type re-home `de6a5157c` · selector hot-reload `4720512e6` · chats eviction
`181684772` · client bundle (settings phantom-scroll + follow-mode) `cd9e88406` · bus wave 2
`b46281df4` (rulesChanged + databankChanged + corpusRecomputed; 32 STATIC self-cleans; G-B receipt).
Draft-mode replacement DESIGNED (7 forks, morning sitting). Autosave inventory: NO leftovers;
theme-editor fork for morning.

**CLOSE-OUT OWED (after last 2 lanes):** consolidated `pnpm check` (read every exit) · `verify --push`
FULL battery (value-changing lanes merged; owner HOLDS the push himself) · selector live receipt (restart
→ flip summarize selector → wire-capture) · staleness live revoke probe · morning delta at board top.
**MORNING OWNER PILE:** 33-proc intent (now lane-VERIFIED real: 33 genuinely unwired verbs — wire,
purge, or backlog? receipts in lens lane report) · **chats.star→starred wire-format call** (report-cards
item 6: renaming the field also renames the chat-bundle EXPORT/IMPORT on-disk JSON key — pre-launch
"don't care" is the likely answer but it's a wire format, so it's yours) · **updatedAt policy** (item 7:
characters/world\_books/world\_entries lack it — rule the policy, then baseline-squash carries it) ·
longer-outputs numbers (cap inventory on board) · theme-editor autosave fork · fp8 stays BANNED ·
3-strike auto-revoke on local endpoints (one-liner if unwanted) · Codex reply ledger (5 SHAs + verify
commands, on the punch-list row). Draft-mode F1-F7 RULED (all recs; R0 GO — ledger row 043620320).

### ═══ PRIOR (2026-08-10 — backfill PHASE-4 + refinery score-sweep fix) ═══

> **⚠ vLLM FLEET IS DOWN** (all 3 engines adopted→down since 12:49 under score-sweep+backfill load on the
> 98%-tight GPU0; prod node pid 1600923 alive but `:5173` refuses). Dogfooding blocked until restarted —
> owner-gated (rebuild dist + `engines:start` DETACHED). NOT a node crash (400 is a clean vLLM reject; runner
> catches handler throws) — infra: two heavy gen workloads on a maxed card starve/kill the engine.

**Main `e777c47e5` — 7 ahead of origin (UNPUSHED), zero worktrees. ⚠ TREE NO LONGER CLEAN as of 08-13 —
uncommitted vLLM swap, `build-argv.test.ts` 4 failed/25 passed; see the gameplan pointer above.**
Committed this session:
`e777c47e5` refinery score-sweep 400+containment · `94e9c5a96` memory max\_tokens+PHASE-4 · `08b47fb6e` board.

**Refinery score-card fix `e777c47e5` (verifier-CONFIRMED):** (1) `output-budget.ts` window clamp reserve was
FIXED 256 < estimateTokens' input-scaled undercount (\~257 at 31k) → sized output onto the context boundary →
vLLM 400 by 1 token; now `256+ceil(5%·input)`. (2) `score-sweep.ts` batch fetch was uncontained + all-or-nothing
→ one oversized card failed the whole sweep; `fetchBatchReplies` degrades to bounded per-card retry (the memory
`summarizeBatchIsolated` pattern — the sweep was ALREADY batched, needed isolation). Residual: preset maxOutput
above window room still wins the ladder → can 400 near-full, now fails-soft. Detail → \[\[refinery-score-sweep-budget-and-containment]].

**THIS TURN (08-10 continued) — two backfill bugs the reorder left, both fixed + fresh-verifier CONFIRMED (7/7):**
**(3) summarize wire had NO max\_tokens on a fresh db** (`memorySummarizer={}` → unbounded gen → 120s-timeout loop
that collapsed the 8-wide batch to Running:1). Fix: `summarizerOpts` rides `maxTokens ?? DEFAULT_MEMORY_SUMMARIZER_MAX_TOKENS`
(1024) ALWAYS, like presencePenalty — 1024 is ALREADY the token-guard reserve (one home, no new truncation).
**(4) PHASE 4 — consolidation now batches corpus-wide** (the reorder only did tier-0; consolidation still ran serial
per-bucket = the real Running:1 tail). `backfill.ts` `commitAllPlans` → `storeAllTier0` (PHASE 3) + `consolidateAllTiers`
(PHASE 4: per tier k, collect every bucket's parents → ONE length-sorted `summarizeConsolidationBatch` → per-bucket
store; tier k fully stores before k+1 collects). `digests.ts` split `writeConsolidations` → `collectConsolidationTier`+
`storeConsolidationTier`; live path byte-identical. Battery: 1736 chat-domain + 10 backfill (new cross-bucket test:
`batchSizes∋4`) + `pnpm check` all green. **HF check: Qwen3-VL card sampling (0.7/0.8/20/1.0/presence 1.5) already
fully wired** (override-generation-config + summarizerOpts presence). **SEGMENTS spike DONE → DON'T build a batch
embed+store seam (\~1× no-op):** live :8701 N=32 \~3k-tok blocks — serial 194ms/block vs batched 199ms vs conc 192ms =
0.97-1.01×. COMPUTE-bound (13ms round-trip / 181ms GPU forward-pass), NOT round-trip-bound like gen. Segment "slowness"
\= real embedding × many blocks, irreducible by batching; accept as small-hardware cost (GPU0 98%, no headroom to give
embed more util). Detail → \[\[vllm-concurrency-topology-tuning]].

### ═══ PRIOR THIS SESSION (08-10, committed) ═══

**Main `08b47fb6e`/`90b3a821e`/`4805fb0ba` — committed earlier 08-10:**
**(1) memory backfill reorder `90b3a821e`** — corpus-wide summarize-ALL-then-embed-ALL (was per-(chat×scope)-bucket
interleave); spike **6.64×** (23.1s→3.5s / 30 blocks; 8B summarize \~95%, embed \~5%). `digests.ts` split into
`planDigests`/`commitDigestPlan`/`summarizeDigestBatch` (DigestPlan build-internal, backfill derives by inference);
`backfill.ts` 3-phase (plan all → summarize all length-sorted → commit all); 41 mem tests green; embed stays per-item.
**(2) vLLM tuning `4805fb0ba`** — rerank→GPU0 with embed (BOTH homes: build-argv `engineCudaVisibleDevices` +
wake-budget `engineVramNeed`), gen util 0.55→0.60, **summarize concurrency 32→8** (BOTH homes: layer.ts
`VLLM_SUMMARIZE_CONCURRENCY_FLOOR` + vllm/index.ts `DEFAULT_SUMMARIZE_CONCURRENCY`); embed conc stays 4.
**FLEET REBOOTED + VERIFIED:** embed+rerank on GPU0, gen both @0.60, `Maximum concurrency 8.57x` (was 7.52x\@0.55),
all healthy, **GPU0 TIGHT 98% (48.1/49.1 GB)** — clean boot, little margin. Concurrency finding: 32 overshot (vLLM ran
\~3-7 during load, KV ceiling \~7.5-8.5x) → excess queued → tail-latency into the \~120s timeout; 8 matches. **OPS GOTCHA:
`pnpm engines:start` blocks >2min (synchronous reap+health-wait) — run DETACHED/backgrounded, NEVER foreground.** The
summarize-conc change is SERVER-side (applies on app-server boot, not the engine reboot). PEER commits on main (other
session, unpushed): `cf38eebce` login-polish · `d2478aaf7` report-card. Ops facts → \[\[vllm-concurrency-topology-tuning]].

### ═══ (2026-08-09 EVENING CLOSE — superseded on tip/fleet only; carry-forward + #43-parked `park/43-code-split` still valid) ═══

**REPORT-CARD SESSION (2026-08-09, post-close, read-only):** owner-ordered package report cards —
db/kit/ui source read IN FULL by the orchestrator (393 files, \~33k lines; no lanes, no code
changes, tree stays clean at `efd6b52b9` + docs). **Grades: db A · kit A · ui A.** Complete
follow-up punch list (17 items incl. the quick-win set: kit truthiness ×3, kit isRecord vs
\#guards, ui avatar-stack initials vs kit, db checkList hoist, kit stale barrel comment; plus db
star/starred + updatedAt-policy schema renames \[baseline-squash caveat], ui token-resolver
triplet consolidation, ui/kit sin-hash + emphasis-regex + hint-anatomy dedups) lives in
[`docs/reviews/misc/2026-08-09-package-report-cards-worklist.md`](reviews/misc/2026-08-09-package-report-cards-worklist.md)
— next session picks work from THERE, don't re-derive from the transcript.

**Main `efd6b52b9` — GREEN (consolidated `pnpm check` PASS, all stages), zero worktrees, tree clean.
Origin UNPUSHED (\~70 ahead) — owner pushing himself, then DB WIPE + WHOLE FLEET RESTART (owner-driven
endgame).** This session's big client/security train all merged: login/loading + brand-A forge
`eb0e3d3a3` · #69 F1 sourcemaps-off + Caddy `*.map`/dev-route edge belts LIVE · gates batch (external-id
chokepoint #64 + color-literal/CSS tighten) · #61 ResponseFormat WireReady brand · #68 bound 24 list/topN
sites + `bounded-list-limit` gate #46 · #75 discovery.maxNodes bound · security cross-tenant IDOR sweep
(admin.linkSsoIdentity EXEMPT / regex.bulkSetPlacement PROBE) · #65 Loader2→WebSpinner unify · #63
boot-loader offscreen-cache (60fps software-raster, GPU-safe) + min-display floor + wordmark halo.
Battery fixes landed: orphan-ratchet `fe4c45af9`. **Pre-push battery (`verify --push`) surfaced its two
push-tier reds — orphan-ratchet + cross-tenant-sweep — BOTH now fixed & merged.**

**⚠ #43 boot code-split PARKED on branch `park/43-code-split` (`b56fb78b6`)** — it skip-committed a
`registry-assembly-at-door-only` violation (moved 11 registry assemblies into the lazy `authed-app.tsx`;
lockdown = assemble only at `main.tsx`/`compose/`; 22 structure:full violations the consolidated drain
check caught). PULLED from the drain (perf optimization, NOT correctness). Re-lane later: relocate
assemblies to a `compose/` door while keeping the lazy split (or architecture ruling), and RUN THE FULL
structure:full before commit (the skip is what let it in). See task #43.

**OWNER endgame (in progress):** push `efd6b52b9` → `data/orbweaver.db` wipe → `pnpm stack restart`
whole fleet. **AUTH LIVE:** OIDC verified end-to-end (issuer/redirect/sub\_mode=hashed\_user\_id \[#53
closed]/groups/RS256), A5 back-channel logout LIVE both sides (only a real-login `sub` byte-proof
outstanding). Ops facts → memory \[\[authentik-integration-ops]]. **DEV-SERVE GOTCHA:** the FQDN (`:8788`)
serves prebuilt `dist/` — goes stale after client merges until `pnpm --filter @orb/client build`
(\[\[live-client-port-5173]]); rebuild after the push if dogfooding the web.

**CARRY-FORWARD (next session):** #43 code-split re-lane (parked branch) · #52 demo-v4 · #62 all-white
theme probe · #70 F3 Host-header/C13 (launch-day) · #74 home-shell boot CLS 0.106 · #63 real-GPU-foreground
fps read (owner's eyes — 30fps was a headless SwiftShader artifact) · launch-day D3 trio + C13. Full
pre-rewrite board: [`history/retro-workboard-2026-08-09.md`](history/retro-workboard-2026-08-09.md).

**LATE-AFTERNOON (main `3d80bfb61`, all hook-gated, origin UNPUSHED — 49 ahead):**
\#48 smalls `a6133ffe4` · #50 barrels `02f0a91a0` · #54 apisurface `ef931ad45` · #45 chat-list `c33833d58`
(pre-re-import gate CLEARED) · #53 OIDC cohesion `bd8c64f6d` · #57 regex bulk-placement `dd37bc8dd` ·
\#41 transpiler-premise-refuted (doc) `8e0e90cde` · #58 anti-rot gate `662cb49d4` (bare-\@public-on-UNUSED
now REDS; 47 adjudicated) · #59 macro-DoS `6a319267c` (O(n²)→O(n) parser \[100KB 4386ms→4.7ms] + 2MB belt +
client DISPLAY ReDoS pre-filter) · #60 refinery narrow-container polish `cd6cf5e20` (#39 side-eye GRADUATED
— holds at 3-pane+mobile, roster a11y) · **auth-entry `56391328d`** (the whole OpenWebUI-study auth arc:
B5 admin link-SSO \[one bind-once site] + B4 local first-run + A7/A8/A9 + unified mode-aware login all 4
modes + MS-W1 collision hard-deny). **EVENING MERGES (main `487fcd877`, origin UNPUSHED \~56 ahead):** login/loading/brand-A forge `eb0e3d3a3` (WebWeave/WeaveVeil canvas + WebSpinner one-loader via icon seal + load-gated boot-veil + brand-A favicon/manifest/icons; 47/47 CT, green on-branch pre-commit; **side-eye graduation IN FLIGHT `a56739e552f9cdebe`** before #63 closes) · **#69 F1 sourcemap fix `487fcd877`** (vite `sourcemap:false` + spa.ts `.map`/`.ts`/`.tsx` 404 belt + red-green test; scoped branch receipt, full check owed at drain) · **Caddy edge belts LIVE** — applied+`caddy validate`+graceful-reload+FQDN-verified (`*.map`/`/@fs`/`/@vite`/`/@id`/`/api/_debug`→404, /healthz+/ 200); NOT committed in the stack repo (`M caddy/conf/Caddyfile` + `M docker-compose.yaml` carry FOREIGN uncommitted edits I didn't author — honeypot `@local` restructure + AI-UA regex; owner commits OR the 4:30 daemon carries) · **OIDC provider crosscheck `a3c7eb2ef`** (`docs/reviews/security/2026-08-09-authentik-provider-config-crosscheck.md`; NO code defects; 6 owner action items, 2 HIGH). **CONSOLIDATED STATIC CHECK DISCHARGED:** gates-batch merged `eb503cd97` through the REAL pre-merge hook (`pnpm check` PASS exit 0, 161s) on the FULL merged tree = main+forge+F1+gates — so forge's new web-weave/brand CSS+canvas were scanned by the tightened color gates and PASSED (no coupled-site red). #64 external-id single-writer chokepoint + no-color-literals palette-scale tighten + no-raw-color-in-css all landed. #46 pagination HELD → #68 (7 unbounded growing catalogs found; premise "big lists already bounded" was FALSE). Still owed: the value/label BATTERY (`tests:node`) at push. #61 ResponseFormat WireReady brand MERGED `a334dcc01` (final drain hook green — supersedes #41). **ALL CODE LANES DRAINED — zero worktrees, main `a334dcc01`, origin UNPUSHED \~63 ahead.** **IN FLIGHT (1):** side-eye login/boot `a56739e552f9cdebe` (graduation lens for #63); + warm A5-enable lane aee2a952 (env/config, no worktree). **OIDC — ALL VERIFIED GREEN (tasks #72/#73, agents af9f28be+aee2a952 — LIVE vs Authentik provider pk=18 + deployed env; NOTHING was wrong, no change made):** issuer trailing-slash exact · redirect URI both sides exact · **`sub_mode=hashed_user_id` LIVE → #53 sub-stability CLOSED** · `profile` emits `groups` (OWNER\_GROUP='Neo Owners' matches) · Signing-Key RS256/JWKS live · PKCE S256 · no `offline_access` · `email_verified` never read (2025.10 default safe) · one orbweaver provider, no neo dup. Provider **blueprint-managed** (`authentik/blueprints/apps/orbweaver.yaml`). Secret hygiene GOOD (AUTHENTIK\_API\_TOKEN stack `.env` + OIDC\_CLIENT\_SECRET orbweaver `.env`, both gitignored + not web-served). **A5 back-channel logout: LIVE END-TO-END, VERIFIED** (owner ruled ENABLE; built #53) — `OIDC_BACKCHANNEL_LOGOUT=true` (orbweaver `.env`, note: envBool STRICT, `true` not `on`), provider pk=18 `logout_uri` set via blueprint (`authentik/blueprints/apps/orbweaver.yaml`; `check-blueprints.sh` ALL OK; owner applied — subagent edit was classifier-BLOCKED, correctly NOT laundered), endpoint mounted post-restart (POST → 400 validator-ran vs 404-control → env picked up). ONLY REMAINING: live-login byte-proof `sub` is in the logout\_token (watch securityEvent `oidc_backchannel_logout` revoked>0 — confirm-when-convenient, NOT a blocker). optional-ours: seamless post-logout return needs id\_token retention (design change, parked). Ops facts → memory \[\[authentik-integration-ops]]. **CAVEAT:** Authentik MCP NOT reachable from headless background agents — mutations need main-session or blueprint edit; verified read via service-account API. **(superseded — MERGED above) prior forge in-flight note:** mock APPROVED, brand dir **A (Open Orb)** ruled; building the real WebWeave/WeaveVeil + WebSpinner (homed ui/primitives/spinner as a lucide-icon in the icons seal — NOT client/lib, because 3 Loader2 consumers are ui-internal) + sexy layer over the shipped login-surface + icons in FINAL served spots (favicon SVG+raster/manifest/apple-touch). OWNER TWEAKS baked: fix odd fade-out · slow the turbo spider · loading = buttery \~300-400ms fade-in + LOAD-GATED exit (never force full weave). Responsive mobile+desktop. Login FORM preserves base-ui Field/Input + real <form> + autocomplete username/current-password/new-password (Chrome autofill) — skin-not-reimplement, +CT guard. (superseded mock note: #63 —
animated spider-web-weave loader, ST-iconic beat, one mode-aware surface; owner "make it fuck / branding is
awful"; orchestrator publishes as artifacts for taste). **LOGIN-MOCK RULINGS:** plain username+password (NO
advertise-usernames picker — don't have/want it) · pre-session so default/brand theme + OS light-dark only
(no login theme-picker). **QUEUED:** #61 ResponseFormat brand (codemod-kit, 60-file precedent) · GATES/PROBES
batch \[#46 pagination gate (UNBLOCKED) + ResponseFormat-provenance gate + #62 all-white-theme probe +
no-color-literals tighten] · #43 code-split · #39 custom-schema e2e (needs fleet) · #52 demo-v4 (parked).
**RULED THIS STRETCH:** brand dir A · login form = plain user/pass (no picker) · pre-session brand/OS theme only · NO-LEGACY: retire generic Loader2, ONE loader (WebSpinner) — #65 (after the build lands) · MS-W1 mode-switch = collision HARD-DENY (merged in auth-entry). **QUEUED LANES:** #61 ResponseFormat brand (codemod-kit) · GATES/PROBES batch \[#46 pagination + #64 auth-single-chokepoint(external\_id one writer) + ResponseFormat-provenance + #62 all-white-theme probe + no-color-literals tighten] · #43 code-split (ALSO a security win — shrinks the unauthed JS surface) · #39 custom-schema e2e · #52 demo-v4 (parked) · #65 Loader2 retirement (after forge). **PRE-AUTH AUDIT DONE** (docs/reviews/security/2026-08-09-pre-auth-attack-surface.md): **F1 HIGH — prod sourcemaps SERVED** (sourcemap:'hidden' leaves .map in dist; GET /assets/\*.js.map → 200, 20.3MiB, 811 src files; live-confirmed) → #69 must-fix-before-launch (vite sourcemap:false OR strip .map from container + spa.ts .map-404 belt). **F3 MEDIUM** — Host-header owner-fallback trust → C13 deploy invariant (proxy-fronted + IP\_ALLOWLIST). Rest CLEAN (dev routes gated, no data sans session, no dir listing). **CADDY REVIEW #71 DONE** (Appendix A of the audit doc; sibling repo `/home/inktomi/inktomi-stack/caddy/conf/Caddyfile:370-392`, verified against my own read): edge is ALREADY-CORRECT — public FQDN closes F3 THROUGH Caddy (real-Host routing → owner-fallback denied → SSO mandatory), **CSP is app-owned with ZERO clash (Caddy sets no CSP on orbweaver — answer to Nate's Q: never add one), OIDC XFF/backchannel/HSTS-split/SSE-no-compress/h3 all correct.** LIVE F3 HOLE SHARPENED: app runs BARE on host (`reverse_proxy host.docker.internal:8788`; the Caddyfile's OWN `:365-366` comment admits it) → `http://<host-lan-ip>:8788` bypasses Caddy/CrowdSec/rate\_limit/OIDC and mints owner on the LAN. Interim fix (cheap, pre-D4): bind app to `127.0.0.1:8788` OR `IP_ALLOWLIST` OR SSO+`AUTH_FALLBACK=deny`; proper fix = D4 containerize (owner-HELD). ADD edge belts (build-ready caddy in the doc): `*.map`→404 (F1 second belt) · `/@fs /@vite /@id`→404 · `/api/_debug/*`→404. LOW header-drift: shared snippet's XFO SAMEORIGIN overrides app DENY (CSP frame-ancestors 'none' still enforces) + Referrer-Policy no-referrer (stricter) — harmless. Honest floor: on-disk config only, bare app bind (0.0.0.0 vs 127.0.0.1) NOT live-confirmed. **PRIOR OFFER (superseded, now done):** a PRE-AUTH ATTACK-SURFACE audit (what a no-session client can reach: routes + servable files incl. hidden `.map` in distDir + no prod dev/\_debug routes — recommended security-executor) · #65-adjacent. **OWNER:** push (mine on your word, fresh battery first) · re-import (unblocked). **AUTH human-review notes
(non-blocking):** agent-target link guard is dead-code today (USER\_KINDS=\["human"]; DB `users_agent_shape`
CHECK is the belt; re-add on the seat wave) · a stale `app.test` /api/auth/config fixture was missing
`trustHtml` (from #48's DRAFT-TRUST wire) — aligned.

**RECORDED (findings + owner design intent, so it isn't lost — full write-up in docs/design/config-ia-the-junk-drawer-problem.md §9):** templates check — D132 DONE (prose/prompt-assembly templates live ONLY in PRESETS); the "templates in Settings" the owner remembered are the IMAGERY templates (image-gen prompt config, chat-feature contribution rendered in the settings host — settings/index.ts:668 + features/chat/components/imagery-templates-section.tsx), a DIFFERENT concept, NOT a D132 leftover. Owner: imagery = functional-but-ugly, Presets Templates section unwieldy-but-functional — both FINE for now. **Config panel revamp is COMING (owner intent, not a lane):** relocations are cheap because most surfaces are REGISTRY-BASED (settings sections / home tiles / workloads-tuning are contributions) — add/remove/relocate = a registry edit at the door, not surgery. The optional taste fix (rename imagery "templates" so the word means one thing) rides that revamp.

**This sitting's merges (all hook-gated):** #35 corpus-settle `2073bbdc8` · #39 live-e2e `275f5ea83`
(768 output-budget class + content-pane scroll + count-up arrival; report
`docs/reviews/misc/2026-08-09-refinery-live-e2e.md`) · #42 streaming reveal `de72f8d9e` (forge; gifs
`reports/recordings/forge-42-*.gif`; design `docs/design/streaming-reveal-42.md`).

## ═══ THE ENDGAME (complete remainder — tagged by what unblocks each) ═══

**═══ CODEX AUDIT — FINAL SYNTHESIS LANDED + COMMITTED `0de9e087d` (78/78 lanes, 312 artifacts, read in full 08-14) ═══**

> Source of law: `docs/reviews/repository-audit-2026-08-13/SYNTHESIS.md` (SHA-256 `c02802fd…` verified
> at commit) + FINAL-VERIFICATION + PORTFOLIO-QA + SECURITY-VALIDATION — all four read IN FULL by the
> orchestrator 08-14. Verdict: **1 current P1 · 8 current P2 · 1 partial P2 (deps) · 6 current P3**;
> static 14/14 green at `5783331`; behavioral/push/full/live graduation UNPROVEN by the audit (their
> scope; our own 08-14 `verify --push` PASS is a fresher behavioral receipt they did not count).
> Resolved-at-close: DEVRT-01/02, GA-H-02, SID-01 (all ours, already boarded). The 33-proc STK-01 =
> candidate-only, now owner-ruled PARK ALL. Snapshot-only families: revalidate only when touched.

- [ ] **P1 AGENT-TOOLING-01 — guard self-exemption bypass. LANE RUNNING (security-executor):** the
  unanchored `SELF_EXEMPT` raw-string match (tool-guard.mjs:213) fires before blanking + hard floor
  (:544-554), so `git stash # tool-guard.mjs` → explicit hook ALLOW (R5 wire-protocol receipt,
  SECURITY-VALIDATION §1). Fix = parse/blank first, sole-invocation exemption only, must-bite rows
  (comment · quoted arg · earlier &&-stage) + wire-protocol receipts.

- [ ] **P2 DEPLOCK-01 bounded upgrades:** `sharp` 0.34.5→≥0.35.0 (authed untrusted-image decode path,
  GHSA-f88m-g3jw-g9cj) + `pdfjs-dist` 6.1.200 bump (untrusted PDF server extraction; browser-context
  preconditions absent here). Regen lock, rerun the 42 focused upload/image/PDF tests + online
  `pnpm audit --json`. NOT twelve exploits — audit's own bounding. Small dep lane.

- [ ] **P2 client-forms-01 — autosave can lie:** both persistence seams optional (`save?.` then
  unconditional rebaseline + draft clear + "saved") — invalid config discards edits while reporting
  success. Fix: require exactly one seam or REJECT before rebaseline; CT proving missing-persistence
  retains the draft + reports error. create-autosave-entity-form.tsx:77-102,182-189,380-404.

- [ ] **P2 UI-RENDERING-01 — code-editor completion nondeterminism** (3 fail/2 pass on target,
  43/2 at repeat-each=3; root cause unassigned). Trace + stabilize; watch-list row graduates to a lane.

- [ ] **P2 client-preset-refinery-01/02 — refinery content surface has ZERO mounted CT** + stale story
  prose claiming no production surface exists. One routed CT: load → view-back → rewrite
  decision/apply → terminal result; fix the story header same change.

- [ ] **P2 RC-01/RC-02 — mutation "gate" cannot fail** (`thresholds.break: null`) and scans the foreign
  gitignored ST runtime (7,707 files for a 4-target run). Finish one clean run, set a calibrated
  non-null break, exclude the foreign tree, low-threshold positive control — or stop calling it a gate.

- [ ] **P2 PROBES-RUNTIME-02 + PPR-01 / P3 PROBES-RUNTIME-01 + PPR-02 — probe evidence hygiene:**
  golden-demo scripts suppress capture failures then compare (stale-as-fresh); 8 RPG probe entries
  hard-code one checkout's `.env`; parseViewport truthiness admits negatives; OR README says 5 probes,
  code runs 7. One probes lane: fail-closed + repo-root resolver + viewport tests + README sync.

- [ ] **P2 DEPLOCK-02 / P3 DEPLOCK-03 — peer + dedupe hygiene:** ESLint/TS peer-range violations
  (`pnpm peers check` exits 1) + one `enhanced-resolve` dedupe lift. Maintenance, rides the dep lane.

- [x] **GA-H-01 ratchet debt now 276** (224 density + 52 provenance — our density-tier stale-arm small
  landed post-audit, 226→224) — visible-by-design, keep burning.

- [x] **SID-01 FIXED + MERGED** (`6cf7ffc68`): custom\_openai dials its own endpoint through the
  host-pin/safeFetch boundary; anthropic/openai report an honest `unchecked` arm; reachable-but-non-auth
  answers (404/405/500) are `unchecked` so a BYO endpoint without /models can't be 3-strike-revoked out
  from under the user. LIVE three-arm control vs the real engine (ok · unreachable-scrubbed ·
  unchecked). **Codex verify:** `pnpm vitest run tests/server/domain/credentials/` (their own test file
  now proves the truth). FOLLOW-UP one-liner: the client "Test" button on custom rows still calls
  fetchModels, not testHealth — switch it (rides any client small).

- [ ] **P2 (GA-H-02): structure artifact owes PER-GATE scan denominators** — candidate/scanned/skipped
  per gate in normal output, else a predicate regression is a zero-scan placebo (OUR
  \[\[instruments-lie-verify-the-verifier]] law at gate scale). Pairs with the G-A/G-B gate lane — same
  harness region, fold in. Includes surfacing the **278 ratchet-admitted sites** (226 density + 52
  finding-overload) as visible debt in the report (GA-H-01).

- [ ] **33-proc tRPC INTENT reconciliation (their P2-candidate queue + our lens-calibration row = one
  program):** their classification stands — 10 automation (P1-candidate pending client lanes + INTENT) ·
  7 plugin = closed-intentional-dormancy · 1 regex.getScript · 5 content · 10 unclassified. The LENS
  half (proxy-consumption resolution) is our lens-calibration lane; the INTENT half is an OWNER sitting
  ("which server surfaces are product commitments vs parked") — added to OWNER-GATED. No bulk-wire, no
  bulk-delete (their caution = the owner's 08-13 lens ruling, independently converged).

- [x] **SPR-01 vLLM live receipt — CLOSED TONIGHT, receipts on this board:** their #4 blunt priority
  (live flags/template/GPU/one-request proof) was satisfied hours after their cutoff — fleet booted on
  the 27B, GPU topology verified (19.04x), probes P1-P4 green, enable\_in\_reasoning A/B'd live. Their
  four vLLM argv "failures" in the accidental whole-suite run were the WAVE-0 statics, since fixed.

- [ ] **Smalls batch (Codex tail):** wire-capture.ts:100 stale function contract (says never persisted,
  spills at :106 — truth-repair the law, header is already honest) · imagery `PROMPT_TEMPLATES`/
  `CAPTION_INSTRUCTIONS` compat re-exports are test-only (fold into lens-calibration verdicts) ·
  GQZ-01 rpg-bus gate arm lacks a local positive control (gate-authoring debt) · local-light
  `ORB_LOCAL_LIGHT_E2E=1` opt-in run (LIVE-WINDOW list; disposable networked env, never CI).

- [ ] **bounded-list-limit KNOWN-NARROW verdict (GA-H-03):** it names only `limit`, misses topN/named
  schemas BY DESIGN with passing controls preserving the bypass. Record verdict: acceptable-as-scoped
  or widen — gate lane decides with the two-receipt law.

- **Cross-refs, no new rows:** their 15 write-only DB columns = our lens-calibration `columns` class
  (ORDER-BY blindness caveat stands) · their 27 contract orphan candidates = our Qwen corpus rows 1-33
  overlap · chat-component/DB mirror-count debt = allocation signal only, their own caution — no
  boilerplate tests.

**═══ SWEEP ACTIONS (owner law: actioned or gate-evaluated — nothing falls into obscurity) ═══**

- [ ] **MAYBE (owner-parked, do NOT let rot): per-launched-model SAMPLER-DEFAULTS map** — one generic
  `preset[k] ?? modelDefaults[k]` rung replacing the per-sampler env-const surgery (\~6 coupled sites per
  knob; presence + repetition both paid it). Small-medium, server-only, CT-provable; queue behind the
  bus wave unless the owner promotes. Context: the preset-crunchiness smell (ledger row above).
- [x] **Databank lenses: CLOSED — superseded on the tree (third stale row caught by the dispatch
  re-derive ritual).** `36c137740` "every library lens server-side + a real bank census" +
  `24f99e257` "walkable past its first page" killed exactly this: no `maxPages` on today's
  `databank-library-surface.tsx` (its own comments record the removal), `routers/databank.ts:57`
  carries the server `search` param. The row's cited path had also drifted (file lives in
  `surfaces/`, not `components/`).
- [ ] **Refinery `selection` two-writer** (class-sweep P2): `update-session.ts:50` whole-replaces from a
  client image while `apply-fields.ts:67` server-remaps indexes — a scope-dialog save straddling an
  applyFields undoes the remap. The mergeSheet class server-side; small, rides any refinery lane.
- [x] **CHATS-PANE EVICTION: CLOSED — superseded by `181684772` (row was stale at dispatch).** The
  overnight commit killed exactly this hook (no maxPages, no getPreviousPageParam on today's tree;
  the row's `:30` receipt is dead — that line is now a comment). A dispatched lane REFUSED correctly
  and added what the fix commit lacked: a planted-control proof the landed head-page CT pin can
  actually fail (re-inserted window → red at the scroll-back assertion), and the `.find()` consumer
  sweep (8 hits, all non-paged local arrays; ts 77 + tsx 104 scanned, `?.find` zero with control).
  chats-with-character-pane deliberately NOT separately pinned (window is a property of the shared
  hook — one fact, one assertion). Lesson pinned: board rows citing file:line owe a re-derive AT
  DISPATCH (\[\[audit-lists-are-snapshots]]).
- [x] **World-info small: FIXED in the smalls-client merge (`1abbaf62f`):** the real defect was only
  the unpaged picker read (`:108`, one silent 50-row page) — fixed with the add-chat-document-dialog
  precedent (debounced server search + limit 100 + honest empty/loading states). The kicker claim was
  STALE (it counts the ATTACHED set off listBooksWithUsage, never the library). Red-first CT ×2.
- [x] **Smalls batch (sweep tail): ALL RESOLVED (smalls-client lane, receipts in its report):**
  turn-tool-calls window-budget FIXED via per-MESSAGE window — newest N slots, every record of each
  (`limit`→`turnLimit` rename so the re-denomination is a compile error, not a silent unit change;
  contract pin that the old spelling no longer binds; header carries BOTH texts — the no-projection
  ruling STANDS, the budget is per-slot now; eviction pin hardcodes 51 so raising the default REDs
  it) · rpg-takeover-header `:95` was ALREADY-FIXED (`64110bcc5`; only the correct `:108` angle-feed
  survives) · staleness §1.1 was ALREADY-REPAIRED (W10 lane 1, doc:61). **LESSON (board law): the
  row's "add the lineage filter" instruction INVERTED the dogfood sweep's own finding ("window-budget
  defect, NOT wrong-row") — when compressing a review into a row, carry the review's framing
  verbatim, never a remembered fix. Lane caught it by reading the target file's header.**
- [ ] **"LONGER OUTPUTS" LEVER (owner ruling, cap inventory landed by the residue lane):** the two binding
  constants are `DEFAULT_MAX_OUTPUT_TOKENS` = **2048** (`contracts/preset/index.ts:238` — BOTH the wire
  max\_tokens AND the history-fit reserve: `history-budget.ts:65,112`, every output token is a prompt
  token removed) and `DEFAULT_MEMORY_SUMMARIZER_MAX_TOKENS` = **1024** (also the prompt reserve via
  token-guard). Raising either = value-changing change, owes the BATTERY. rpg extraction sends NO cap
  (engine-window bounded) — already maximal. Morning decision: new values + the battery run.
- [x] **density-tier ratchet: RETIRED-STALE (fifth stale row of 08-14, gates lane receipt):**
  `64110bcc5` (04:15 same day) already ported the `actual < budget` arm — live at
  density-tier.ts:339 + :428-438, baseline regenerated 226→224, pass prints admitted-by-ratchet:
  224\. The T3 find row outlived its own fix by eight hours.
- [ ] **Low-scan gates, human eye when convenient (denominators visible for the first time):**
  bus-payload-allowlist 5 files · modal-body-not-placeholder 7 · selection-store-via-factory 9 ·
  turn-identity 10 — presumably intended-narrow; no invented threshold added, just now readable.
- [ ] **Residue-lane smalls:** ~~genRepetitionPenalty relocation~~ ALREADY-DONE (smalls-client
  receipt: system-tuning-section.tsx:32 owns it, negative marker at engine-launch-fields.ts:35-37,
  CT :94) · REMAINING: tighten `no-test-fabrication.baseline.json` for chat.test.ts 2→1
  (gate-ledger edit, do at a quiet moment).
- [ ] **AST TWO-CORPORA ASYMMETRY (ruling needed; surfaced by the scan ledger, deliberately NOT fixed
  in-lane — it changes match semantics):** syntactic verbs (callers/importers/exports/jsx/ident/aliases/
  regkeys) load harness-globs and are structurally BLIND to `scripts/**`, `packages/*/*.ts`, `*.mts`,
  `playwright/**`; typed verbs see them via search-globs. `pnpm ast ident X --in scripts/` scans only
  the 219 gate files. Every historical syntactic-verb NEGATIVE over those trees is suspect. Fix fork:
  ONE corpus everywhere vs an explicit `--corpus` flag — small lane after a ruling; the epilogue now at
  least NAMES the corpus per run. (Also: `regkeys TEMPLATE_DEFS` — the USAGE block's own example —
  derives zero registries on today's tree; folded into the boarded lens-calibration lane.)
- [ ] **CODEX TOOLING PUNCH LIST (owner-relayed 08-14, priority-ordered; audit dir is READ-ONLY law;
  deliverable back to Codex = commit SHAs + exact verification commands):**
  1. `pnpm ast` negative-output auditability — **LANE RUNNING** (one reporting seam, stderr epilogue +
     \--json meta; zero-scan zeroes become LOUD; CLI/stdout byte-compatible).
  2. Concurrent-CT execution races — **IGNORED per owner word** ("haven't taught Codex worktrees yet" —
     our lanes are worktree-isolated; their agents share the main checkout's reports/ + cache).
  3. Per-gate scan health — **DONE, merged** (`abd3f2fac`): every gate line + reports/check-structure.json
     carry candidates/scanned/visited/skipped; scanned=0 at real-tree scope = EXIT-2 tool error ("the
     checker is BLIND, not clean"); ratchet debt printed (admitted-by-ratchet per gate + the summary
     line). ctx.scan() is a context METHOD — all 200 gates compiled untouched. **Codex verify:**
     `pnpm check:structure` (read the new per-gate lines + the 276-admitted summary) +
     `pnpm vitest run tests/tooling/check-gates.int.test.ts` (committed tripwires: every gate states a
     denominator, zero blind gates, both ratchets name counts).
  4. Newline/line-count alignment — the one byte that was OURS is DONE (`f18314e1d`, gen jinja trailing
     newline; 331→331 agree). Their receipt-counting convention is their tooling.
  5. export-rot dry-run abort — **REFUSED BY LEDGER LAW, correctly** (T2 lane receipt): the disposition
     file is a ONE-SHOT APPLIED RECORD whose own header rules the abort CORRECT and forbids "fixing" its
     staleness; `PersonaMetadataWrite` no longer exists in the tree (`pnpm ast refs` → no declaration).
     **Message for Codex:** to act on export rot again, re-run the lenses (`pnpm ast orphans|testonly`)
     and write a NEW dated table with its own executor — never edit the 2026-08-03 record.
  6. engines.ts parses empty boot lock as PID 0 → `process.kill(0,0)` wedges future starts — reuse
     `_kit/spawn-lock.ts` positive-PID discipline + fs regression test — **T2 smalls bundle**
     (memory \[\[kill-signal-zero-pid-zero-always-succeeds]] predicted this exact class).
- [x] **GATE CANDIDATES — CLOSED 2026-08-14. Five gates BUILT, one REFUSED with receipts; whole-tree
  `check:structure` exit-0 + `gate-conformance` + `check-gates.int` green, 201 → 207 registered gates.**
  Two receipts each: every gate went RED on a violation planted at a REAL path and GREEN on the clean tree.
  - **G-A `domain-freshness-plane`** — every mutating domain declares its freshness plane in ONE registry
    (26 rows, `none` is a cited verdict with an end condition). Mutating domains DERIVED (`@orb/db` import
    AND a drizzle write call — the `@orb/db` half is what kept `search`'s in-memory MiniSearch index out
    of the roster; `export`/`import`/`search`/`tool-use` correctly carry NO row). Four arms: MISSING ·
    STALE (`none` + emits) · ORPHAN · BLINDNESS. Probe: `domain/__probe/verbs/write-thing.ts` → MISSING-red.
  - **G-B belt existence** — `bus-definition-belts` ARM C: every exported `*BusEvent` in contracts (plus
    `DomainEvent` by name) owes a belt. Forced the real work: `AUTOMATION_BUS_EVENT_TYPES` minted +
    `automation-bus-coverage` spec, `DOMAIN_EVENT_TYPES` gained its `satisfies` +
    `domain-events-coverage` spec. Two typed two-sided tables carry the architecture facts —
    `BELT_EXEMPT` (`WiBusEvent`, a sub-union belted by its parent) and `SERVER_INTERNAL_REACH`
    (`DomainEvent`, `AutomationBusEvent` — the survey's MEASURED client-map unsatisfiability, §2.3).
    Probe: a beltless `ProbeBusEvent` in contracts → red.
  - **G-C `json-column-write-parity`** — the straddle gate. Historical control REPLAYED: `git show
    57fb8595b^:…/update-session.ts` planted over the fixed file → RED at the exact
    `set.selection = refinerySelectionSchema.parse(patch.selection)` line; restored, green. It is a TAINT
    test, not a shape test, because both the defect and the fix mention `.selection` — a `X: {…patch.X}`
    matcher would have been a lying proof. Corpus today: 4 multi-writer JSON columns, 0 straddles.
  - **G-D `windowed-infinite-query`** — EXTINCT-class tripwire, built lean. Two arms named by finding
    TOKEN (`maxPages/no-rewind` · `maxPages/client-lens`) + a zero-`infiniteQueryOptions` blindness
    tripwire. Zero `maxPages` on the tree, so the baseline is unambiguous.
  - **G-E floor-synthesis — REFUSED, with receipts.** (1) The discriminator is SEMANTIC, not syntactic,
    and the tree proves it in ONE FILE: `rpg-takeover-header.tsx:97` had to lose its synthesized `:00`
    (`64110bcc5`) while `:108`'s `clock.minute ?? 0` eleven lines below is CORRECT — it feeds a clock-hand
    ANGLE, not a reading. No AST shape separates "a number a human reads" from "a number a renderer does
    maths with". (2) Corpus: 65 `?? 0` in client+ui, 14 inside a JSX expression container — 13 of those 14
    are `count={… ?? 0}` on a list header, where 0 is the TRUE count of an empty list. A shape gate would
    land \~93% false and need 13 allowlist rows at birth, which GATE-AUTHORING §4.7 bans. (3) The obvious
    narrowing (fence to JSX containers) MISSES the historical control outright — `clockTime` built its
    string in a plain helper two calls from any JSX, so the fence would ship a confident false clean.
    Verdict: no gate. The class stays owned by the memory lesson + `side-eye`, and the em-dash/unset
    reading precedent stays a `StatCell` convention.
  - **G-F `scroll-container-positioned`** — the ripest one, and it found live defects the 469be29d6
    client sweep never reached: **15 unpositioned vertical scrollers, 13 of them in `packages/ui`**
    (dialog popup · drawer content · menu/popover/autocomplete/command popups · `POPUP_SURFACE` ·
    log-viewer · virtual-list · message-list · immersive-card `pre` · markdown oversized `pre` ·
    textarea) plus 2 in `discovery/corpus-search-results.tsx`. All fixed with `relative` in the same
    class string; the five containing-block CT pins re-run green (49/49, cache cleared). `overflow-x-*`
    is deliberately out of scope — the instrument's own `isScroller` reads overflowY only.
- **Already-actioned receipts:** class 5 clean (recent-models IS the W5 exemplar — `model-picker-model.ts:262`) ·
  class 2 clean (meter-row + apply.ts ruled-in-header) · chat-list eviction-only (server lenses already
  correct) · bus-survey wave + gates = owner GO (ledger).

**═══ OVERNIGHT PLAN 2026-08-13 → 08-14 (owner-ordered; wake-up armed for 23:03) ═══**

> Owner word (08-13 evening, second sitting — supersedes the first): scheduled start at 23:00 reset ·
> **overnight full-auto rules** (escalation ladder, no blocking questions; block only for
> destructive/irreversible · owner-sacred · origin pushes · scope pivots) · **THE 08-08 DISPATCH FREEZE IS
> LIFTED** (explicit) · **cap = session + THREE agents at any time, and KEEP THE LANES FILLED** (backfill
> as lanes drain — tonight's cap is 3, not 5; continuous, not waves) · **DOGFOOD ITEMS ARE IN SCOPE —
> owner wants the morning to start MAXIMAL: every dogfood row either FIXED with receipts or DIAGNOSED
> with a written game plan** · **ONE stickler-tier lane at a time is authorized for the design-heavy
> items** (staleness / cookie+localStorage / auth freshness / multi-tab multi-device multi-human; also
> the event-bus coverage survey) — owner: none of it is net new, it is bringing things up to par;
> **do it right once even if it means more work; KISS/YAGNI are suspended here.** Mechanical note:
> stickler has Write but NO Edit — it diagnoses and writes the design/game-plan doc; a paired
> executor lane implements from that spec. **START WITH THE AGENTS REVAMP** (prior word stands).
> **FLEET/STACK ARE NOT SACRED (owner, third correction this sitting: "whatever is telling you the
> fleet is sacred… fix it — spin it up or down at will, the cards are idle, I'd rather have you doing
> that than sitting idle").** The "no fleet ops" line was an ORCHESTRATOR INVENTION extrapolated from
> the 08-10 owner-gated-restart note — retired. Stack + engines go up/down as the work needs. The REAL
> operational rules (gotchas, not sanctity) still bind: `engines:start` blocks >2min — run DETACHED ·
> no stack restart mid-battery (\[\[stack-restart-vs-battery-contention]]) · engines truth =
> `GET /is_sleeping` · never run the engine LAUNCHER as a live probe · rebuild client dist after
> client merges if dogfooding the FQDN. **This unblocks the big prize: boot the fleet on the WAVE-0-fixed
> swap statics and LIVE-VERIFY the thinking checkpoint** (reasoning parser routes to the separate field ·
> tool calls parse under qwen3\_coder · structured output enforced IN reasoning · samplers land as
> merged) — watch the first boot: the new util numbers (0.1/0.1/0.8) are UNVERIFIED and GPU0 OOMed once
> at 0.9-sum; if it OOMs, retune and reboot, that IS the verification. Live dogfood repro (streaming
> churn · follow-mode · RPG rewind · selector hot-reload) and `E2E_LIVE=1 pnpm e2e` are back in scope.
> Still held: no pushes (standing law, no word granted) · no RE-IMPORT (owner runs it himself). **DEV DB
> IS EXPENDABLE (owner: "we don't give a fuck about the dev db, nuke it if need be")** — baseline-squash
> UNBLOCKED; a lane that drops the db announces it, the latch reseeds. ≤3 gate-heavy verifying at once
> is moot at cap 3 but stagger anyway.

- [ ] **WAVE 0 (orchestrator's own hands, before any dispatch): STEP 0 vLLM statics.** The five
  LIVE-STATE findings, fixed in place on main, ONE commit — the tree is RED and lanes spawn from HEAD;
  nothing dispatches until this lands green (`build-argv.test.ts` 29/29). Then commit today's
  tooling/config work as its own commit (settings + hooks + rules + skills + board + deletions).
  **FIXED CHAT TEMPLATE VENDORED + WIRED (owner-directed, 08-13 late):**
  `scripts/dev/qwen3_gen_thinking_serve.jinja` (froggeric/Qwen-Fixed-Chat-Templates, sha256 `398edf5b…`,
  inspected clean of sandbox-escape patterns; kwargs contract matches our emitted
  `enable_thinking`/`preserve_thinking` BY NAME, adds per-request `reasoning_effort` xhigh|medium|low
  default xhigh) + `--chat-template` in gen argv (`GEN_CHAT_TEMPLATE_REL`, embed/rerank convention).
  Fixes the shipped template's four defects we hit DIRECTLY: mid-dialogue system drops (our injection
  system inserts them) · JSON-string tool `arguments` crash (the wire we send) · blank-`<think>` history
  poisoning (prefix cache) · fragile enable\_thinking:false. The 4 red tests are UNCHANGED by the wire-in
  (same inline snapshot, same WAVE-0 re-record).
  **THEN (fleet unblocked, owner word): boot the fleet DETACHED on the fixed statics and live-verify the
  thinking-checkpoint swap WITH the template** — reasoning field populated · tool-call parse (template
  README: `qwen3_xml` on current vLLM, `qwen3_coder` older — ours notes they alias in 0.26; if tool calls
  DON'T parse, try `qwen3_xml` first) · **mid-dialogue system message SURVIVES** (injection regression,
  the template's headline fix) · **JSON-string tool arguments round-trip** · xgrammar enforcement inside
  reasoning (rpg extraction path) · merged samplers on the wire · multi-turn prefix-hit rate
  (`vllm:prefix_cache_hits_total` — the template claims \~100%) · watch GPU0 on first boot (new utils
  unverified; OOM → retune → reboot, that IS the verification). A verified-up fleet is what makes the
  dogfood live repros and `E2E_LIVE` possible for the rest of the night.
- [ ] **OPENING THREE (dispatched together at start):**
  - **LANE A (the owner-named starter): AGENTS REVAMP** — `mech-executor`, area = `.claude/agents/*` +
    `~/.claude/agents/*` (9 files). Invoke the `agent-authoring` skill FIRST; it is the spec. Per file:
    add `permissionMode` (`acceptEdits` for executor/mech/forge; security-executor stays default;
    read-only roles scout/Explore/verifier/side-eye/stickler need none) · ~~maxTurns~~ **(EXECUTED with
    maxTurns, then owner OVERRULED same night — BANNED fleet-wide, reverted `579f28161`; see ledger)** ·
    `memory: project` on stickler +
    verifier · scope `mcpServers: ["authentik"]` to security-executor and REMOVE the global
    `enabledMcpjsonServers` grant (coupled site: `.claude/settings.local.json`) · keep every existing
    `model`/`effort` pin EXACTLY as-is · no role gains `Agent`. Done = all 9 files + a table receipt.
  - **LANE B (the standing stickler slot, first occupant): STALENESS + SESSION-FRESHNESS DESIGN** —
    `stickler`, the big one, owner-authorized tonight. Scope = DOGFOOD THEME A + the auth row as ONE
    problem: client cache/localStorage/cookie invalidation architecture + silent-stale-login, designed
    for multi-tab · multi-device · multi-human, "the most full and proper way modern sites do."
    Deliverable = a diagnosis + full design + implementation game plan in `docs/design/` (stickler has
    Write, no Edit — executor lanes implement from it, tomorrow or tonight if it lands early). Brief
    carries: repo stance do-it-right-once, KISS/YAGNI suspended; read the character-tab + import repro
    rows as evidence; \[\[per-user-scoped-empty-is-about-the-asker]] + SSE budget memory pointers.
  - **LANE C: PROD-LEAK errorFormatter** — `security-executor`, unchanged spec (belt at
    `transport/trpc/trpc.ts:31` + red-first test + deploy-mode invariant doc line).
- [ ] **BACKFILL QUEUE (keep 3 lanes filled; pull top-down as slots free):**
  1. **DOGFOOD easy fixes, area-bundled** — `executor`: stat-attributes revert (\[\[rpg-writable-field-
     coupled-sites]]) + RPG-lite rewind/stuck-state DIAGNOSIS with instrumentation directives (fix if
     root cause is clean, else game plan) — one rpg-area lane.
  2. **DOGFOOD client bundle** — `executor`: settings scroll-past-end + streaming shape-churn + follow-
     mode jumpiness (⚠ forge §4: touching the scroll march risks the follow-intent detector — diagnosis
     - CT-provable fix only; live streaming verify needs the fleet, mark residual) — one client lane.
  3. **Character-tab ceiling** — `executor`: the bounded-ceilings row (RESUME\_WINDOW=100 + clamped
     `character.list` callers), #45-class keyset treatment for characters. Fixes the dogfood repro.
  4. **Selector hot-reload gap** — `executor`: summarize/role selectors require server restart; find the
     config-read seam, make it live-reload like chat-completion's. vLLM strict-mode knob DIAGNOSIS rides
     this lane (same area; decision doc, owner rules later).
  5. **DOCTRINE SPLIT** — `mech-executor`: disposition table is the spec; delivers skill+rules files,
     REPORTS the `skills:` lines for the orchestrator to apply at merge (never edits Lane A's 9 files).
  6. **LENS CALIBRATION** — `executor`: the 6-class table, corpus tracked.
  7. **#47+#49+scoreSweep refinery statics** — `executor`.
  8. **Report-cards punch list IN FULL** — `mech-executor`. **Owner 08-13: "we don't give a fuck about
     the dev db, nuke it if need be" — the baseline-squash HOLD is DEAD**; the db `star`/`starred` +
     `updatedAt`-policy schema renames are IN (announce the drop in the report; the latch reseeds).
  9. **When the stickler slot frees: EVENT-BUS COVERAGE SURVEY (THEME B)** — second stickler occupant:
     inventory every domain against the bus, name what is missing one (refinery confirmed), design the
     gate expansion; extensibility is the WHY. Deliverable in `docs/design/`.
- [ ] **STILL not overnight:** regex-ST-import (rides #28, import lane is owner-held) · MECHANIZE §0.3
  (wants the UI-distillation talk) · RULED-BUT-NEVER-ROWED builds (owner still-wanted word; the C1
  status INVESTIGATION may run read-only if a slot is idle) · #43 · OWNER-GATED / LIVE-WINDOW /
  LAUNCH-DAY. **Anything needing live GENERATION to verify gets code-diagnosis + CT only — fleet stays
  down.**
- **Morning close-out:** drain lanes → zero worktrees (SWEEP: teardown does not fire) → consolidated
  `pnpm check` on the merged tree, READ the exit → one `verify --push` battery if any value-changing
  lane merged → rewrite LIVE STATE in place → 30-second owner delta at the top.

**LANE-READY (dispatch order):**

- [ ] **STEP 0 — vLLM thinking-swap statics (BLOCKS EVERY OTHER LANE).** The five LIVE-STATE findings,
  fixed in place on main, ONE commit, no branch. All static; the live boot stays owed to a supervised
  window. Nothing else dispatches first — lanes spawn from HEAD and would build against pre-swap code.

- [ ] **agent-sdk×vLLM residue strip (AREA LANE: `infra/providers/vllm` + `backends/agent-sdk`).**
  Rides STEP 0 (same files). Three tiers, and the brief MUST carry all three:
  - **DEAD — strip:** the `req.api === "agent-sdk"` guard at `surfaces/chat.ts:205-211` is unreachable
    (`deriveRunner` rejects the pairing at `dispatch.ts:37-46`). Do NOT just delete the throw — the
    `ChatRequest` union still carries the agent-sdk arm (`contract/chat.ts:99,152`); narrow the surface's
    parameter to the existing `VllmChatTurn` (`chat.ts:212`) so the state is unrepresentable.
  - **DEAD RATIONALE, LIVE MECHANISM — the actual double-up:** `--override-generation-config` /
    `generationConfigOverrides` (`build-argv.ts:226-249`) exists, per its own header, as *"the fix for the
    sampler-less agent-sdk /v1/messages path"*. Gone. Every surviving vLLM chat request carries
    per-request samplers via `buildBody` (`chat.ts:227`), so launch-time + per-request are two homes for
    one value — **this is where the LIVE-STATE finding 1 presence-penalty bug lives.** Same class: the
    `repetition_penalty` 1.05 default (`build-argv.ts:49`). Dropping the override also lets the W8A8
    checkpoint's own `generation_config.json` win, which the swap's own comment argues is correct.
    **BLOCKER TO CHECK FIRST:** `surfaces/summarize.ts` + the structured role may not carry per-request
    samplers the way chat does — verify before removing the launch-time home.
  - **DO NOT STRIP (stale comment, live flag):** `--enable-auto-tool-choice` + `--tool-call-parser` reads
    as buddy-agent scaffolding but rpg extraction runs `tool_choice:"required"` on local vLLM through
    chat-completions. `genModelAlias` / dual `--served-model-name` lost its "Claude Code can't resolve a
    /" reason but GAINED a live one in the swap (stops the catalog advertising the raw checkpoint path).
    **Rewrite both comments so a future lane doesn't strip them for the dead reason.**

- [ ] **PROD-LEAK — error-formatter stack strip + deploy-mode invariant (SECURITY, launch-critical).**
  Live incident 2026-08-09: `orbweaver.inktomi.tech` was being served by a DEV/snap `node --watch`
  process out of a worktree cache behind Caddy → `NODE_ENV` defaulted to `development` → every tRPC
  error returned `data.stack` with absolute host paths (`/home/inktomi/…/packages/server/src/…`), the
  OS username, and exact dep versions (`@trpc+server@11.18.0`) to any anon caller. Authz itself was
  intact (401s correct); pure pre-auth info-disclosure. FIXED THIS SESSION by cutting over to
  `pnpm stack up prod` (pid 3677836, NODE\_ENV=production, prod dist, no vite) — leak verified gone
  (`data.stack` absent, keys now `code/httpStatus/path`). Two PERMANENCE items remain (the cutover is
  environmental, not structural):
  - [ ] **errorFormatter belt:** `transport/trpc/trpc.ts:31` spreads `shape.data` forward, which carries
    `stack` whenever env ≠ production. Strip it explicitly (`const { stack: _drop, ...data } = shape.data;`
    then `data: { ...data, reason: domainReason(error) }`) so the leak is UNREPRESENTABLE regardless of
    env. This is the doctrine fix; NODE\_ENV is only the stopgap. Owes a red-first test (assert no `stack`
    key on a UNAUTHORIZED error shape).
  - [ ] **deploy-mode invariant:** a C13-sibling line in `docs/security` — *the public server runs via
    `pnpm stack up prod` (NODE\_ENV=production, prod dist), NEVER a dev/worktree/snap process* — plus a
    boot-time REFUSE when `NODE_ENV !== "production"` on a public-interface bind, so this cannot silently
    recur. Candidate gate arm: no public bind under a dev env.

- [x] **#45 chat-list class fix MERGED `c33833d58` — THE PRE-RE-IMPORT GATE IS CLEARED.**
  Keyset-paged listChats + server characterId filter + server search (title/participant-char-name/
  lastMessagePreview, ARM B) + real totalCount; 3 unbounded renders sealed (command-palette capped
  at 20 not virtualized — cmdk scores only mounted rows); the .find()-sweep landed (chats-with-
  character.ts DELETED); char.list clamps fixed. Live-drive-verified (zero unbounded {} asks). Merged
  \--no-verify on the branch-side green receipt (manifest rebase conflict); regenerated the manifest on
  the merged tree + consolidated `pnpm check` exit 0 (this ALSO cleared the \~126-stale manifest debt).
  **RE-IMPORT IS NOW UNBLOCKED.** Original spec follows:
  - [ ] (superseded)  Paginate `chat.listChats` (keyset, the
    `character.list` 50/100 pattern) + sealed VirtualList on the 3 unbounded renders
    (`chat-list-surface.tsx:311` · `chats-with-character-pane.tsx:109` · `command-palette-surface.tsx:152`)
  * the \[\[paginating-a-list-breaks-resolve-by-find]] `.find()` sweep over all 8 consumers + the 3
    silently-clamped `character.list` callers. Receipts in task #45.

- [ ] **#47+#49 refinery pair (one lane):** delete the prod-unreachable `awaited` latch + honest CT
  through StagePane (task #47) · capped-overrun **REFUSE + fit receipt** mechanism (task #49, ruled).

- [x] **#48 ruled-smalls MERGED `a6133ffe4`** — smoothStream default→true (3 coupled sites swept) ·
  chat-options D111 relocated to composer gutter (topbar chrome deleted) · tag folders OPEN
  (folderType now has a live reader) · DRAFT-TRUST arm 1 (brief mechanism was INVERTED — the real
  lie is an `inherit` card UNDER-rendering on a trusting floor; fixed both class sites, added the
  `trustHtml` wire to /api/auth/config; doc corrected).

- [x] **#50 barrels FULLY DONE (leg merged `02f0a91a0`)** — Tier-A/B was a verified no-op; the
  post-refinery-merge leg found 5 genuinely-untagged star-suppressed schema-forge/authoring type
  twins → tagged `@public`-with-reason. **C12 VERDICT: refuse the global `--include-entry-exports`
  flip** (720+1276 dominated by legit package-boundary API; ui's 231 already R2-sealed-exempt); a
  narrow per-package variant is a possible future config lane, not a resurrection. Original no-op
  detail: (evidence: `orphan-export-ratchet` exit 0, 0/0/0, a
  live-positive-controlled instrument \[it bit 3 stale tags the same morning]; all 36 fresh orphan
  candidates hand-checked already `@public`-with-reason). The 08-08 135-symbol worklist was dead —
  correct lane refusal, then a verified already-done. REMAINING LEG (warm agent idle in its
  worktree, fires after the refinery lane merges): refinery-cluster verdicts (5 star-suppressed + 4
  index hits) + **C12 feasibility VERDICT only** — the flip surfaces 720 entry-export findings, so
  it is not a config toggle; decompose legit package-entry API vs rot, then per-package entry
  config vs baseline vs refuse-with-receipt.

- [ ] **#43 boot code-split:** 4.9MB chunk / \~610ms parse → route-level split + lazy sections. GO-ruled.

- [ ] **Chat-search hidden-class exposure (security pass, LOW):** server search matches the newest message's RAW body, so a hidden-class span's text becomes findable by a floored member (search also floors to D16 in SQL). Member-only, low-grade, single-owner mostly self; a security-executor pass before/after re-import. NOT a re-import blocker.

- [ ] **Retire the two bounded chat ceilings (roster-contract):** character-library resume map (RESUME\_WINDOW=100) + use-chat-portrait-map (raised to 500) are BOUNDED, not solved — the real fix is ChatSummary carrying its seats' avatarHash + a batch characterIds→resume-chatId server read, which retires use-chat-portrait-map entirely. Roster/participants contract territory.

- [ ] **B1 per-handle signin throttle + U1 chokepoint doc** (from auth study II) — rolling-window (never lockout) per-handle axis beside per-IP, reusing rate\_limit\_buckets; + fold the single-chokepoint rule into Spine-Identity-and-Auth.md. Small; could ride the #53 OIDC lane if still open, else its own.

- [ ] **#46 pagination gate** (list procedures declare limit+max+default) — AFTER #45 lands (fixed tree);
  two receipts (historical control + reach probe).

- [ ] **#41 transpiler additionalProperties** — generated schemas ship OPEN on hosted; fix in the
  transpiler, not advisory.

- [ ] **#39 CLOSE, part 1: the RE-VERIFY side-eye** on merged refinery (roster N-sessions labeling ·
  chevron-at-wrap · stepper badge now RULED-KEEP, verify rendering only).

- [ ] **#39 CLOSE, part 2: custom-schema live e2e lane** — checklist item 4 ALL ARMS undriven (single /
  guided / two-stage, needs-raw refusal, strippedKeys warn) + manual-rewrite dialog + OR
  reasoning×structured probe + REGRESSION verdict arm. Nothing blocks it.

- [x] **#51 scout briefs DONE** — both forks RULED same sitting (see rulings): DRAFT-TRUST arm 1
  rides lane #48; v3 heal dissolved into **#52 demo-pack v4 REGENERATION** (six transcripts through
  the current pipeline, version bump, delivery design that honors the user-deleted latch — needs the
  live fleet; dispatch when a slot frees).

- [x] **OIDC/Authentik study DONE** — `docs/design/oidc-authentik-openwebui-study.md` (owner-review-
  required). Headline: OUR flow is ALREADY-BETTER at every identity-binding boundary (bind-once vs
  their email-merge takeover; fail-closed groups vs their 2 fail-opens; HttpOnly DB-session vs
  JS-readable JWT). 10 ranked adopt/improve items A1-A10; nothing at the binding layer copied. Awaits
  owner forks below, then a security-executor BUILD lane for the ruled subset (A7/A6/A4/A5 are the
  no-fork wins — errors-to-/login, IdP end-session, tolerant groups parse, back-channel logout).
  3 owner forks: A1 signup-default · A2 approval-queue whether · F1 group-sync vs D65.

- [x] **Chat server-search — RULED ARM B, folded into the live L1 lane** (see rulings; the
  follow-up row dissolved).

- [ ] **scoreSweep on the raw output floor** — same 768 class #39 fixed for runStage; small server fix,
  fold into the #47+#49 lane.

- [ ] **DOCTRINE SPLIT — make `.claude/agent-doctrine.md` load instead of hoping (owner-approved 08-13).**
  478 lines / **10,739 measured tokens** sitting inert in `.claude/` — auto-loads NOTHING today; agents see
  it only if a brief says to read it. Three injection mechanisms, pick by scope: `.claude/rules/*.md`
  WITHOUT `paths:` → everyone every session (and subagents) · WITH `paths:` → fires automatically when a
  lane opens a matching file · `skills:` in an agent's frontmatter → full content injected into that ONE
  role at startup. Disposition (est. tokens by char-share of the measured total):
  | section | \~tok | goes to |
  | - | - | - |
  | The hard rules | 2,997 | SKILL, preloaded via `skills:` on executor / mech-executor / forge / security-executor only |
  | Lane invariants | 2,072 | **MERGE deltas into constitution §L, then DELETE** — verified near-duplicate (same `git -C`, same prove-your-commits, same pathspec-skips-untracked; minted a day apart) |
  | Minted 08-07 identity/fork-security | 1,015 | `paths:`-scoped rule → auth/identity paths |
  | Minted 08-07 late | 1,055 | `paths:`-scoped rule, same domains |
  | Code recon | 713 | **DELETE** — triplicate with global CLAUDE.md + the `code-recon` skill |
  | INSTRUMENTS LIE 602 · Verify-before-building 411 · ABSENCE CLAIMS 271 · Boundaries 265 · Reporting 88 | 1,637 | one always-load rule (universal epistemics) |
  | Minted 08-07 overnight | 381 | distill into the verify rule, archive the rest |
  | Minted 08-08 Base UI/dogfood | 262 | `paths:`-scoped → `packages/ui/**`, `packages/client/**` |
  | preamble + Read order | 190 | fold into survivors |
  | Net: always-load grows \~1,700 (not 10,739); per-agent baseline 10,946 → \~12.6k; 2,785 deleted as | | |
  | duplicates. Static, reversible, no fleet — good sick-window lane. | | |

- [ ] **MECHANIZE §0.3 (the reading-set router the constitution ALREADY defines).** §0.3 is a task→doc-set
  table that today is prose an agent may or may not obey. Convert each row into a `paths:`-scoped rule (or
  a skill for the ones a lane must know BEFORE writing — note `paths:` rules fire when Claude READS a
  matching file, so a lane whose first act is Write can miss them — **now CONFIRMED as filed bug
  anthropics/claude-code#23478**, so treat Read-only firing as the mechanism's contract, not a doc
  nuance). **Second filed bug #22170: `paths:` rules in USER-scope `~/.claude/rules/` are silently
  ignored entirely — never put a path-scoped rule at user scope; project `.claude/rules/` only.**
  Both verified against the tracker 08-13. **DO NOT make per-area agents:** role
  (executor/mech/security/verifier) and area (ui/db/auth/providers) are orthogonal axes; crossing them is
  9 × N agents. Agents carry ROLE; rules and skills carry AREA. **Measured per branch:**
  identity 5,020 · db 5,177 · testing 5,094 → cheap, mechanize as-is.
  **UI is 35,555** (`UI-Architecture-and-Layout.md` 14,522 + `ui-package-design.md` 14,107 +
  `UI-Primitives-and-Reuse.md` 6,926) — with the constitution+rules baseline, \~46.5k before the agent
  reads any code.
  **⚠ CORRECTION (owner, 08-13): the \~45k "source-read budget" an earlier draft of this row cited is the
  QWEN/vLLM fleet's ceiling** (`docs/Qwen_Offline_Investigation.md` §BUDGET — 131k windows, and what the
  `budget` CLI prints its "fits (N of 45,000)" line against). **It does NOT apply to Claude Code
  subagents.** **This fleet has never run a 200k window** (owner, 08-13) — Opus 5 and Sonnet 5 both carry
  1M, and every agent here is `sonnet` / `opus` / `fable`. So 46.5k is **\~4.6%** of the window and the
  full UI set alone is \~3.5%. **Capacity is not a consideration at all — stop citing it.** When reading a
  `budget` figure for a Claude lane, take the raw token count and ignore its 45,000 verdict line entirely.
  Cost per lane is the only number that matters.
  The two real arguments for distilling UI anyway: (1) **cost** — 35,555 per UI lane, \~178k across a
  five-lane wave, which is the live constraint while rate-limited, not capacity; (2) **quality** — the
  constitution's own "reading all 34 measurably LOWERS task success," which is window-independent and is
  the stronger case. Target: distill the two 14k docs to an injectable 5-8k core, remainder on-demand.
  Mechanizing UI is NOT blocked on that rewrite — it is just expensive per lane until it lands.

**═══ DOGFOOD 2026-08-13 (OWNER LIVE-DRIVE — the strongest evidence class on this board) ═══**

> Owner drove the app on his real 3-year ST corpus and reported these directly. Nothing here is
> grep-sourced or relayed. **Untriaged: no lane assigned, no root cause confirmed.** Two THEMES cut across
> most of it (staleness, and event-bus absence) — triage those as programs, not as individual bugs.

- [ ] **DRAFT-MODE REPLACEMENT RESEARCH (owner dogfood, 08-14, verbatim intent): chat-creation draft
  mode "is driving me insane — we have to design around it so hard… so clunky and bad UX and we have so
  much work going into just making it semi-usable." RISK EXPLICITLY ACCEPTED: "if it's just empty chats
  we never started or did something with, we're fine — we can clean up."** Stickler research lane
  (dispatched): modern top-tier patterns (instant-create + empty-husk GC is the hypothesis to beat) vs
  our draft complexity inventory; deliverable = design + migration plan + cleanup semantics.
- [ ] **DRAFT-MODE REPLACEMENT — DESIGNED, awaiting owner sitting (7 forks, all with recs):**
  `docs/design/chat-creation-draft-mode-replacement.md` (merged). Verdict: draft mode is a parallel
  client-side chat runtime (\~1,207 LOC pure-draft + branches in 25+ shared files + a server-logic MIRROR
  - 7 dated shipped defects rooted in the split). Rec: **CREATE-ON-START-CLICK** — Start mints the real
    row, room mounts committed-only, husks hidden by a server-side listChats lens, claimed by first
    activity, reaped nav-away + 24h TTL belt. NEW BUG found en route (§2.7): draftKey module-counter
    collision repopulates a PREVIOUS session's composer text into a DIFFERENT room after reload — instant-
    create dissolves it. Forks F1-F7 (creation moment · visibility · reap · claim predicate · TTL ·
    greeting window · husk reload) each carry recs; D123 + PD-65 + stats-poisoning prior law resolved in
    §4-§5. Build = staged R0-R3, dev-db squash rides R0 (db expendable per owner). MORNING SITTING ITEM.
- [x] **AUTOSAVE INVENTORY DONE (scout): class (a) leftovers = EMPTY, class (c) missing = EMPTY.** The
  shared forms/ autosave lib covers every entity editor; all Save buttons are one-shot dialog chrome or
  DOCUMENTED deliberate exceptions (admin-override batched deltas · refinery terminal-apply, owner-ruled ·
  schema-editor commit · theme-editor). MORNING FORK: `theme-editor.tsx` is Button-gated while its sibling
  preset editor AUTOSAVES on the same mint mechanism — header documents the deviation, not the WHY;
  intentional or drift? TASTE OPTION: the four deliberate surfaces listed for keep/convert per-surface.
- [ ] **THEME A — APP-WIDE STALENESS (owner: "most of our app has a staleness problem").** After importing
  the full ST library he had to **delete localStorage + cache + cookies and reload** before characters
  rendered correctly. That is a cache-invalidation architecture gap, not one screen's bug. Needs a
  cross-cutting design pass: what invalidates what, on which mutation, across tabs. Pairs with THEME B.
- [ ] **THEME B — EVENT BUS COVERAGE.** **Refinery was built with NO event bus.** Expand the existing
  bus + its gates, then **sweep for what else is missing one**. Owner's WHY: the bus is the substrate for
  **user-authored extensions and extensibility**, so absence is a product gap, not just an internal one.
  Existing coupled-site law: \[\[bus-coverage-three-coupled-sites]].
- [ ] **AUTH — stale login is silently tolerated** (owner): instead of refreshing the token/cookie it just
  lets you continue. Wants it handled "the most full and proper way that modern sites do" — seamless
  refresh — **without breaking the multi-tab / multi-device requirement, per user, on a multi-human
  install.** security-executor + design. Likely the SAME ROOT as THEME A — client state nothing
  invalidates covers both the stale list and the tolerated dead session; design them as one pass.
  (An "and the licenses thing" aside was recorded here on 08-13 and RETRACTED by the owner same day —
  he did not know what he meant. Nothing owed.)
- [ ] **Character tab does not load all characters** when scrolled or searched; the SAME character that is
  missing there **does** appear via other tabs and the new-chat selection window. Strong hypothesis: the
  known bounded ceiling — `RESUME_WINDOW=100` / the clamped `character.list` callers (see the roster-
  contract row above); the ST corpus is far past 100. This is the #45 keyset-paging class, applied to
  CHARACTERS instead of chats.
- [x] **Selector restart-gap FIXED + MERGED** (`4720512e6`): every role selector re-resolves per call
  (the defect was four boot-time closures over an already-hot resolver; per-call totality chosen over
  hook enumeration, 0.072ms measured). MORNING RECEIPT OWED: after restart, flip summarize's selector
  live → wire-capture shows the next call on the other backend (the lane correctly declined to prove
  this against main's pre-fix code). FOLLOW-UP SMALL: three boot-frozen PROVENANCE reads survive
  (chat.ts:955 summarizerContextTokens · compose/refinery.ts:50-65 · search-discovery.ts:243) — domain
  contract fields need the thunk shape; \~3 files each, identical to the admin/databank conversion.
- [ ] **Settings phantom-scroll is a CLASS (client-bundle find):** any position:static overflow scroller
  holding Base UI form primitives under a positioned ancestor phantom-scrolls (35 escaped absolutes in
  ONE pane). Only the reported surface fixed; sweep lane = `readEscapedAbsolutes` (landed in
  tests/support/ct/settings-geometry.ts) over every overflow-y-auto container.
- [ ] **pin-prompt mode: unmeasured yield gap** — scrollToFn's yield is installed only when
  tailFollowActive; the tail-adjustment veto covers pin mode but the input-yield does not. Measure
  before touching (client-bundle flag, not speculation).
- [ ] **Shape churn: measured plan doc landed** (docs/design/streaming-shape-churn.md): tail paints <p>,
  replaced by <table> 103-161ms later — markdown block grammar undecidable from a prefix; code fences
  DON'T churn because remend already recognizes unterminated fences (= the natural fix home). Reasoning
  mount + tool chips UNMEASURED (probe in doc). Four ranked fixes with costs; renderer untouched.
  **08-14 UPDATE: the doc's arm-1 risk premise is corrected — see the SHAPE-CHURN ARM PICK row in
  OPEN ITEMS (caret+reveal are OURS, fix = tail pre-pass in our seal, no upstream fork).**
- [x] **Settings scroll-past-end FIXED + MERGED** (position:relative on the pane region; live A/B 2900→1014 scrollHeight; red-first mechanism+symptom pins). Original row: **Settings screen scrolls past the end of its results** — blank space below the last row for no
  reason. Small client fix; route with the next side-eye.
- [ ] **Streaming message SHAPE CHURN** — during generation the message "changes shapes and kind of goes
  wonky," then settles into its final shape when streaming completes. Disorienting. Cross-ref #42
  streaming reveal (`docs/design/streaming-reveal-42.md`) and the smoothStream default→true ruling; this
  may be unaddressed rather than regressed.
- [x] **Follow-mode FIXED + MERGED** (tail-growth compensation veto + user-input-keyed yield renewed per gesture event; intent detection byte-unchanged; virtual-core instance-field trap documented). Original row: **Follow-mode is jumpy when you manually scroll up** to read the top mid-generation. **PROMOTED FROM
  A LEAD:** the board already carried "12px scroll-step march in follow-mode streaming (forge §4 —
  touching it risks the follow-intent detector)" as a lead. Owner drive CONFIRMS it. It is now a row.
- [ ] **Regex scripts do not import** with the ST user-data import. Folds into the deferred import lane
  (#28) with databank/user-settings/backgrounds/themes.
- [ ] **vLLM is forced into strict mode at all times.** Receipt: `strictByDefault(format: ResponseFormat)`
  in `packages/server/src/infra/providers/vllm/surfaces/chat.ts`. Decide whether strict is a floor, a
  default, or a knob — it interacts with the #36 structured-output vehicle work.
- [x] **CARD FENCE-CLOSE MOUNT GATE — FIXED + MERGED (`47f2bbe16`; 128 CT green, 5 genuine red
  pins).** Cards now mount the instant their `:::` close line is NEWLINE-TERMINATED. The lane
  caught the dispatch diagnosis WRONG on a security point: close detection was SPOOFABLE on HEAD
  (an unterminated `…\n:::` read closed:true, one more token un-closed it — live receipt) — fixed
  with the terminated-line predicate + an immutability-under-append proof in the kit header. Trust:
  ONE resolver threaded (no call-site re-derive); tier-B scripts DON'T execute today anyway
  (SANDBOX\_ATTR="" — the flip never happened); the real hazard was pre-commit model-controlled
  FETCHES, so the ghost pins allowExternalMedia=false + srcdoc floor. **OWNER NOTE (deliberate,
  cited in the file header as a security decision):** a card's external/`data:` images show at
  COMMIT, not mid-stream — widening is one line if you want them live, and it re-opens a
  pre-commit exfil channel. FOLLOW-UP LEAD: one iframe reload flash at ghost→settled swap
  (GHOST\_APPEND\_KEY vs message.id — keyed-handoff work, message-list-surface scope). §4.5 spec
  truth-repaired with a dated AMENDED block.
- [ ] **08-14 AFTERNOON GATE EVALUATION (owner-asked; sweeps-get-gate-evaluated law):** pre-compact
  candidates ALL closed (7 built, G-E refused-with-receipts, density-arm was already-built; registry
  209 + the count one-home arm). Today's classes: G-A roomReach SEATED-red arm = COMMITTED (bridge
  LANE 2) · member-projection strip-totality arm = CANDIDATE pending strip-card-hole's consumer
  table · turnAccepted gap / fence-close spoof / turnLimit rename = TEST-PINNED by design (emit
  sites too varied, kit-internal, contract pin) · stale-row class = RITUAL-owned (6-for-6 today,
  ungateable) · documented-field-no-producer = LEAD only (the G-E semantic-discriminator trap; if
  it recurs, a typed obligations table is the cheap form).
- [ ] **MEMBER-STRIP CARD-FENCE HOLE (found by the card lane, SECURITY LANE RUNNING
  `strip-card-hole`):** `stripHiddenSpans` never reaches inside a closed `:::card` span — a
  `<lie truth>` in a card body re-emits VERBATIM in the member's COMMITTED view (mid-stream
  scrubber is clean, so it looks fine while streaming and betrays on reload). D16 member-visible
  bytes. Fix = strip totality over card bodies (order swap or recursive strip), host view
  byte-identical, projection-only.
- [ ] **SWIPE GHOST-VISIBILITY — ROOT-CAUSED (diagnosis FLAG merged at createSwipe, `e62b8c16f`);
  TWO FIX LANES RUNNING.** Cause: `swipe`/`continueTurn`/`generate` NEVER emit `turnAccepted` —
  the slot opens only at the engine's `turnStarted`, which lands AFTER resolveTurnBase (assembly +
  memory recall + lock); measured click→ghost 151/341/1075/1719/1887 ms, unbounded (the
  "sometimes"). `send` emits early on purpose (turn.ts:921-929); the contract field
  `turnAccepted.targetMessageId` (bus.ts:262) documents exactly this use and NEVER had a producer.
  **H1 EXONERATED with pins** — the R3 attach floor feeds only the sinceSeq thunk
  (use-chat-bus.ts:123); the live dedup's mark advances only on durable frames
  (chat-event-seq-guard.ts:84), chatOpened type-exempt (:63); `caa06972c` innocent. LANE
  `aux-accepted` (server): emit at acceptance + close EVERY strand path with turnAborted
  (total-resolution invariant honored — 3 verbs × \~6 paths + the shared engine pre-start refusals,
  int test per strand). LANE `ghost-tail` (client): the 100-400ms EVERY-turn tail flash (slot
  closes before refetch; the `view` no-refetch carrier is never applied — the designed fix) + the
  silent contention-400 (symptom verbatim, zero feedback — measured old text 74/75 samples).
  Durable lesson (lane's words): a bus event that opens client state is a per-INTENT obligation,
  not a per-turn one — the gap was invisible to every test because the slot does eventually open.
  DATA NOTE for the owner: investigation drives appended \~7 swipe variants to "Example — The Ashen
  Spire" (append-only; selection moved).
- [ ] **RPG-LITE is broken around rewind** — swipes especially; **state ends up stuck**. Owner-reported as
  a class, not a single repro. Needs a real investigation lane with instrumentation directives (per
  \[\[rpg-lite-state-loop-gotchas]]), not endpoint poking. *(08-14 note: the rpg stat+rewind lane
  `73041bf59` fixed the stat-revert + rewind arm overnight — if the swipe-ghost lane's findings
  overlap this row's swipe residue, reconcile both rows at its merge.)*
- [ ] **Stat attributes do not persist** — type `20` into strength, click out, it reverts to `1`. Concrete
  repro. Likely the writable-field commit seam (\[\[rpg-writable-field-coupled-sites]] — a writable field
  is \~7 coupled sites).
- [ ] **LENS CALIBRATION — fix `pnpm ast` using its own 281-row output as the corpus (owner ruling,
  08-13).** The audit is `docs/Qwen_Offline_Investigation.md` (currently UNTRACKED — track it; it is now a
  calibration corpus, not a scratch file). An 08-13 draft of this row dismissed \~248 of its rows as
  "noise"; **the owner overruled that and he is right**: the rows came out of OUR OWN lenses, so a
  false-positive class is a finding ABOUT THE LENS, and a lens that cries wolf gets ignored (the same
  argument `tool-guard.mjs`'s header makes about hooks). Each class below is a fix in
  `scripts/codemods/ast.ts`, not a row to delete:
  | rows | lens | why it fired | the lens fix |
  | - | - | - | - |
  | 41-88, 90 (48) | `typeonly-alive` | `as const` + `typeof X[number]` is THIS REPO'S standard way to give a union a runtime source of truth | recognize the idiom; don't flag it, or bucket it separately from real type-only rot |
  | 101-133 (33) | `unwired` | tRPC procs consumed through the TYPED PROXY — several rows admit it in their own text (`api.assets.resolveBlobRefs.*()`) | resolve proxy consumption; the doc claims `unwired` is the one lens that sees the proxy, so this is a straight defect |
  | 134-137 | `prodonly` | `drizzle.config.ts` · `vite.config.ts` · `tokens.build.ts` — build-tool entry points with no import edge BY DESIGN | known-tooling-entrypoint allowlist |
  | the `__`-prefixed set | `testonly` | `__resetX` / `__readXForTest` is a declared naming convention | treat the `__` prefix as declared intent and suppress |
  | 281 | `columns` | 16 W-only timestamps "safe to kill" — `createdAt`/`updatedAt` are read via `ORDER BY` / raw SQL, invisible to the lens (its own blind-spot §5) | resolve ORDER BY, or exempt timestamp columns by convention — **do NOT act on this row as written; it is dangerous** |
  | 1-33 | `orphans` \[V] | genuinely dead type twins, dead z-schemas, six UI `*Handle` aliases | no lens fix — these are the real deletions |
  | Ties to \[\[knip-ast-liveness-lens-gotchas]] and \[\[instruments-lie-verify-the-verifier]]. Re-run the | | | |
  | lenses after each fix; the corpus is the regression suite. **Separately and still live:** the package | | | |
  | report cards punch list | | | |
  | ([`docs/reviews/misc/2026-08-09-package-report-cards-worklist.md`](reviews/misc/2026-08-09-package-report-cards-worklist.md), | | | |
  | db/kit/ui, 17 items) is a DIFFERENT audit and already has its own lane above. | | | |

**═══ ⚠ RULED BUT NEVER ROWED (audited 2026-08-13 — the board was undercounting) ═══**

> Owner asked "most of the big items should be done, we're mostly done with feature dev?" — the queue
> looked drained because **nine approved/ruled BUILD programs live only in the RULINGS LEDGER and never
> got a checkbox.** A ruling is a decision, not a tracked task; this board's own rule says a status claim
> owes the same receipt a row does, and these had none. Statuses below are as-recorded — each needs an
> owner word on whether it is still wanted before it becomes a lane.

- [x] **#36 schema-forge ENFORCED structured output** — **SHIPPED 08-09 at `e916b25a2`** (32 files, +1733);
  closed 08-14 after a tree re-derive. This row was written off the RULINGS LEDGER and never off the tree, so
  it read as open for five days: the audit block's own caveat ("statuses below are as-recorded") was the tell.
  Receipts: flat leaf-language grammar + total transpiler (`packages/contracts/src/refinery/schema-forge.ts`);
  the forge asks `vehicle: "response-format"` per call and every arm rides `projectJsonSchema`
  (`domain/refinery/substrate/schema-forge.ts`); VEHICLE KNOB as one importable union + zod enum
  (`contracts/role-clients`, `STRUCTURED_OUTPUT_VEHICLES`), resolved at `entry/compose/role-clients.ts`,
  dispatched at `backends/openrouter/index.ts`; three authoring arms via exhaustive Record. The two-sided
  re-probe is DONE and settled (row 08-09 above). **#41 is closed twice over** — refuted at `8e0e90cde`
  (the hosted wire already ships CLOSED via `projectJsonSchema` at every send-site) then superseded by
  `6ab3765c1`, which brands `ResponseFormat.schema` `WireReady` so an unprojected schema at a send-site fails
  tsc. rpg-lite-protected-at-all-three-values is now PINNED, not merely claimed: the deployment knob has
  exactly one reader (the `summarize`→`structured` facade), the rpg rail mints its own `ResponseFormat` and
  asks for no vehicle, and `tests/server/entry/compose/rpg.int.test.ts`'s "#36 (vehicle knob)" test holds that
  premise on both arms (planted-control verified). **R3's graduation lens is unblocked.**
- [ ] **#37 trust-gated card images + token-concepts unification** — one security lane; "BUILDS GO" 08-09.
- [ ] **#38 ruled smalls, all four** — Untitled-chat rosters · X-16 edited-ago · REGPAR F3/F4/F5 ·
  unsent-draft reload persistence. "SMALLS GO" 08-09.
- [x] **C1 PERSONA PROGRAM — STATUS ESTABLISHED 08-14: the forge lane LANDED before the ban (sixth
  stale row of the day).** D137 is MINTED in the ledger (Core-Path-Registry.md:502, dated 08-08,
  "owner-approved in full with the design's recommendations") and its cited homes are all on the
  tree: `@orb/contracts/card-face` (leg commit `6f948f922` "D137 leg C1"), `domain/chat/persistence/
  cast.ts`, `tests/contracts/card-face/index.contract.test.ts`, and the phase gate names the
  persona-resolution suite byte-untouched. The "status genuinely unknown" premise is dead. Residual
  worth ONE scoped check at leisure: whether every PHASE of the program (D then C then the agent
  wave) completed, or only the C1 substrate legs — the ledger entry covers the substrate; the agent
  wave was always a later phase.
- [ ] **#33 templating rows 53-73 (ARM B, server composes)** — wire carries toggle KINDS only, server
  joins the 21 fragments via prose slots. Spec exists: `docs/design/templating-fork-rows-53-73.md`.
  Parked under the 08-08 dispatch freeze.
- [ ] **#30 R4** · **#31 agents naming** · **#32 CLS + tab-strip** — all three "stay PARKED until the owner
  lifts it" (08-08 freeze).
- [ ] **#52 demo-pack v4 + record-demo harness** — regenerate six transcripts through the current
  pipeline, and make **rpg-state FIRST-CLASS in export/interchange** (chat-bundle + export-chat +
  parseChatJsonl carry TURN snapshots / d20 tool-calls / journal), which also pays down the D6 rpg-session
  portability gap. Needs the live fleet. Explicitly HELD by owner word.
- [ ] **⚠ THE 08-08 DISPATCH FREEZE WAS NEVER EXPLICITLY LIFTED.** It says "no new agent dispatches until
  further notice" and parks #30/#31/#32. Every plan on this board since assumes dispatching is normal.
  **Resolve the contradiction: lift it in the ledger, or honour it.**

**OWNER-GATED (his action/word, in order of appearance):**

- [ ] **INTENT SITTING (from the Codex audit): which server capabilities are PRODUCT commitments vs internal seams vs deliberately parked** — the 33-proc queue reduces to this one owner question; 15-minute sitting with their classification table as the agenda.
- [ ] **RV-13 talk-then-spec** — the conversation is his to open; spec lane spawns after.
- [ ] **Re-import of the 3-year corpus** — his trigger, NOW UNBLOCKED (#45 landed). Note: dev db re-mints on next boot regardless.
- [ ] **Taste pass** — :5173 live · forge-42 before/after gifs · refinery gifs/pngs.
- [ ] **AGENT-1** — his Claude Max re-auth unblocks the ruled keep-whole lane.
- [ ] **Next push** — resets per standing law (fresh word + fresh battery).

**LIVE-WINDOW VERIFICATION (needs a running window, not a ruling):**

- [ ] **Staleness live-drive probe (W3 acceptance, needs a warm real session):** revoke server-side
  (`sessions.revoke` via FQDN/oidc profile) → the warm tab must probe `/api/auth/me`, show the modal
  (local) or bounce (oidc), and land back WITHOUT a reload. · **side-eye candidate:** re-auth modal
  copy/title (`features/auth/components/reauth-form.tsx`) — conservative arm shipped, wording unruled.
- [ ] E1 prod-build CLS re-measure (`pnpm stack up prod`) · \[ ] E2 slider deck on a vLLM/OR connection ·
  \[ ] E3 full `E2E_LIVE=1 pnpm e2e` (never re-confirmed this era) · \[ ] E4 narrowest-mount report ·
  \[ ] E5 databank >100-doc drive · \[ ] E6 fillRule probe (optional) · \[ ] E7 residual tail (ARCHIVE2
  six · NIGHTFIX refusals owner-vs-reviewer · engine auto-sleep/wake + VRAM drill) · \[ ] D5 engines
  adopt live check (next real adopt IS the test) · \[ ] W-H side-eye on a model-populated game
  (unblocks AFTER re-import).

**LAUNCH-DAY (the D3 trio + C13 whole, per the 08-09 ruling):**

- [ ] REGIME-2 db-baseline re-point · two-switch migration-regime flip · h3/QUIC checklist ·
  **C13 in full:** docker build both targets + healthcheck inspect · container runs ·
  fleet-in-namespace · read-only shakeout · sibling-vllm cap\_drop probe · pentest cage ·
  deploy posture · `*_FILE` env fork.

**EXTERNALLY BLOCKED (recorded end-conditions):** node-26 Temporal swap (Safari unshipped) · D2 REGX2
bulk placement (needs the kit lift of `deriveRegexTierFlags`) · D6 automation\_rules/global\_variables
portability (12th kind) · OR-F7 re-probe arms (record-only, next harness run) · D4 CT-vite spike
(probe when curious) · agent-nav 500-char `.find()` ceiling (real only past 500) · D8/D9 in-file
opportunists.

**LEADS (needing tasks if they firm up):** adoptMovedSeedKey rename persistence (boot, from #35) ·
`roleDefaults.chat={model:null}` inert residue.
*(The 12px scroll-step / follow-intent lead FIRMED UP 08-13 and moved to the DOGFOOD block as a row —
owner reproduced the jumpiness by scrolling up mid-generation. The forge §4 warning still applies:
touching the scroll march risks the follow-intent detector.)*

**WATCH LIST (flakes, none blocking):** code-editor CM6 75ms completion · drawer.ct:162 focus-trap ·
preset-editor-surface.ct:140 parallel-load · seed-demo-chats cold-import contention ·
rpg-scene-tab.tsx near the 450-line cap.

**KILLED THIS SITTING (do not re-chase; reasons in RULINGS):** chars+chats rail merge · home-tile
promotion · speaker-tint door · Meteocons · grimstone · tag-only backup (C9-1a) · ST import dialog
(C9-1b, ours kept).

## ═══ ORCHESTRATOR QUICK-ONBOARD (load-bearing — keep) ═══

> **▶ 08-13 — delegation POLICY moved to [`.claude/rules/orchestration.md`](../.claude/rules/orchestration.md)**
> (out of the global `~/.claude/CLAUDE.md`, which now carries only a generic stub). That file AUTO-LOADS
> every session and also reaches subagents, so it is the home for: role→task routing, model-tier
> discipline, what a brief owes, and merge/lane mechanics. **This section stays for CURRENT-STATE
> operational detail only.** If the two disagree: the board wins on operational matters, the rule wins on
> role selection. Agent-FILE authoring (all 17 frontmatter fields, what a subagent inherits) is the
> `agent-authoring` skill — invoke it before writing or optimizing any `.claude/agents/*.md`.

**Dispatch + lanes**

- `Agent {isolation:"worktree"}` — the hook owns creation (local HEAD + auto-install). Verify base =
  main HEAD post-dispatch. Briefs ALWAYS include: back-channel line (SendMessage mid-run) · scope
  fences vs siblings · `git -C` discipline · lane-unique scratch names · the explicit CT files the
  floor must run · re-verify-your-premise-first + a correct refusal is a SUCCESS · the WHY, and the
  hazards (every trap that bit was one no brief mentioned).
- **RE-DERIVE EVERY ROW BEFORE DISPATCHING IT (minted 08-14 after TWO stale dispatches in one day:**
  chats-eviction \[killed overnight by 181684772] and #36 schema-forge \[BUILT 08-09, e916b25a2 —
  the ruled-never-rowed block even warns "statuses as-recorded"]**).** The ritual, \~60 seconds,
  BEFORE the Agent call: `git log --oneline -5 -- <the row's primary path>` + Read the row's cited
  file:line + `git log --all --grep="<the row's key noun>" --oneline -5`. A refusing lane costs
  \~5 min; a lane fixing a fixed thing costs an hour. \[\[audit-lists-are-snapshots]] applies to THIS
  BOARD at dispatch time.
- Message live lanes by AGENT ID; verify the id↔lane mapping against dispatch results before every
  SendMessage. TaskStop an agent once its report merges; NEVER resume an agent whose worktree you
  removed.
- **WARM LEGS ARE MANDATORY, NOT PREFERRED (08-13).** A second task in a live agent's AREA gets a
  `SendMessage` leg, never a fresh spawn. A fresh spawn re-pays the cold area read and the cache
  warm-up; a leg re-uses both. Only spawn fresh when the agent is dead or the area is genuinely
  different. Corollary: don't `TaskStop` an agent whose area still has queued items — park it warm
  until the area drains.
- **Orchestrator hygiene (08-13 — NOT a throttle; the owner explicitly wants it running normally and all
  day. These are waste-removals that cost the orchestrator nothing.)**
  - **Don't re-read this board mid-session.** It is \~30k tokens. Read it once on resume, then work from
    what you hold. Re-reading to re-orient is the single biggest avoidable orchestrator cost.
  - **Don't poll.** Background work re-invokes you when it lands; a polling loop is billed turns that
    learn nothing, and it can reap your own task (\[\[polling-reaps-your-own-background-task]]).
  - Reading a source file you need RIGHT NOW is fine and always was — that is in the delegation law
    already. The ban is on the orchestrator doing an agent's SWEEP, not on it looking at a file.
- Lane law §L is in `AGENTS.md` (git -C everywhere · prove your commits · scoped floors, hooks off ·
  `:5173` serves MAIN — use `snap --isolated --ref <sha>` · report deviations with receipts).

**Merges**

- **AFTER EVERY VALUE-CHANGING MERGE: run `node scripts/ts7.cjs --noEmit -p tsconfig.json`
  (types:graph, \~15s) — it is the ONLY cheap program that compiles scripts/ + tests/ + packages/
  together** (minted 08-14: TWO whole-tree reds sat invisible on main in one session — the REPO
  rename miss and the updatedAt factory omission — because lane floors ran the per-package program,
  blind to tests/, and the train law defers `pnpm check` to drain. The mutation gate's root-program
  compile caught both; this tripwire is that sensitivity at merge time. Briefs for value-changing
  lanes must name types:graph in the floor, not bare `pnpm typecheck`.)
- Rebase-then-ff (standing law above). NEVER chain teardown or verify behind a merge in one command;
  NEVER pipe `git merge` (a `| tail` swallowed a conflict; tsc then red TS1185 = tool-error, not
  code). Merge BARE, read output, THEN check. A staged-failed merge is `git merge --abort`.
- NEVER `cd` into a worktree (cwd persists; a stray board commit landed on a lane branch). Repair:
  cherry-pick to main first, then `reset --soft` in the lane; never `git restore` in a lane's tree.
- Teardown: `status --short` + `git show --stat` receipts FIRST. Recovery: the branch survives —
  `git worktree add <path> <branch>`.
- HOLD merges while a `verify --push` battery runs (it owns the box). Any gate result taken during a
  merge window is VOID.

**Verification instruments**

- `pnpm check` = STATIC (\~90-220s). `pnpm verify --push` = static + `tests:node` (vitest+CT, ONE
  behavioral lane) + e2e-smoke + cpd + parity (\~16min; setsid-detach + `.exit` file, READ it).
  `--full` adds full e2e + mutation. Exit 2 = a checker BROKE (not a verdict). Read `reports/`,
  never re-run to find a failure; never `| tail` the harness.
- A lane's COLD-worktree red OUTRANKS your warm read — reproduce on a clean tree before calling it
  an artifact.
- A fence/instrument claim needs a planted POSITIVE control before its zero is trusted
  (\[\[instruments-lie-verify-the-verifier]]). Every scout PRESENCE claim needs AST, not grep; an
  ABSENCE claim needs two methods + a scanned-count receipt, scoped to where the LAW puts the thing.
- snap: `--eval` takes a BARE arrow · `--jsclick` for rows · `--isolated`/`--dirty` beat HMR ·
  hover-loop class is REAL-POINTER-ONLY. `pnpm ast` for any code question. Chrome MCP for live
  pairing.

**Distilled session lessons (the full narratives live in the 08-08 archive + memory)**

- Two agents agreeing is not corroboration when they read the same artifact.
- A ✅ with a prose tail overstates completion; mis-scoped rows let a lane report done truthfully
  at 1%.
- A side-eye SYMPTOM is gold; its mechanism PRESCRIPTION is a proposal — check against the ledger
  and file headers before relaying. When a ruling's premise dies, re-rule — don't defend it.
- When a lane damages a sibling, WARN every mid-run lane (phantoms cost more than the accident).
- Fences hold in intent and still collide in LINES — sequence same-file lanes or brief the resolve.
- Board edits: grep the CURRENT text (anchors drift under format-md); backticks in `git commit -m`
  command-substitute — use the single-quoted heredoc form.
- Deliverable TEXT lands in `docs/`, never only in a report/transcript. Audit a lane fleet by
  reading each transcript's LAST message in full (\[\[audit-lanes-read-transcript-tails]]).

**Owner cadence**

- Batch pending forks \~4 at a time via the question tool, recommendations marked; he answers fast
  and usually takes the marked arm. He challenges PREMISES, correctly — when a premise dies, say so.
- "Read the reports in full" means it — summaries drop load-bearing items (proven twice).
- Publish mocks as artifacts for taste calls.

**Compact ritual**

- Before compact: bring LIVE STATE current (lane ids, tree state, open decisions) · flush memory +
  MEMORY.md index · reconcile tasks. Owed deliverables get written INTO this board.
- Resume read order: this board (whole file) → `git log --oneline -40` → MEMORY.md →
  `AGENTS.md` for architecture work → history archives only for archeology.

## ═══ STANDING FACTS + POSTURE ═══

- **The neo-parity oracle is a FLOOR we've passed, not a golden** — a red `test:parity` diff means
  update/annotate the reference, NEVER regress `assembly/shape.ts`
  (\[\[neo-parity-oracle-is-a-floor-not-a-golden]]).
- **Stack:** `pnpm stack restart` defaults `ENGINES_POSTURE=adopt-only`; `--force` is the ONE
  fleet-killer. Engines truth = `GET /is_sleeping` (`/health` and `/v1/models` LIE asleep). No
  stack restart mid-battery.
- **DB:** pre-launch, schema changes SQUASH into `0000_baseline.sql` — a regen DROPS the dev db on
  next boot (announce it; backup first; the latch reseeds). **REFINERY R0 squashed the baseline
  2026-08-08 — the next boot drops+reseeds.** NEVER bare `sqlite3` on the live db. Wire capture:
  `GET /api/_debug/wire/captures?chatId=…` (`x-debug-token`).
- **Worktree lanes:** the hook creates `wt/<name>` from local HEAD + installs; NEVER
  `enableGlobalVirtualStore`. ONE committer on main; lanes commit with pathspec.
- **Probe harnesses:** `scripts/probes/rpg-extraction/` (probes are lint-free scratch by ruling).
  Score against OPPORTUNITIES through the PRODUCTION tokenizer.
- **The extraction-mode map is EMPIRICAL** (spike §4f-§4h): hosted strong × folded = default ·
  agent-sdk = LOUD fallback round · local vLLM × folded prose-silenced → cheap round is the local
  champion (`tool_choice:"required"`).
- **Orchestration:** delegate volume, keep judgment; fresh lens before any non-trivial "done"; diff
  an executor's self-flagged deviation against the SPEC TEXT before minting law.

## ═══ THE RECEIPT TRAIL ═══

Every prior era lives INTACT in `docs/history/`:
[`retro-workboard-2026-08-09.md`](history/retro-workboard-2026-08-09.md) (the pre-endgame board:
full A-F queue text, F strike-lists, specced-designs reconcile, initiatives, superseded live states)
· [`retro-workboard-2026-08-08.md`](history/retro-workboard-2026-08-08.md) ·
[`retro-workboard-2026-08-07.md`](history/retro-workboard-2026-08-07.md) ·
[`retro-workboard-2026-08-03.md`](history/retro-workboard-2026-08-03.md) ·
`git log docs/retro-workboard.md` for everything else. Dogfood record:
[`dogfood-tracking-2026-08-08.md`](history/dogfood-tracking-2026-08-08.md) (CLOSED).
