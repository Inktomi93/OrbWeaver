# Retro Workboard — the live board

> **THIS IS THE WORKING DOC** (owner-stated). Not law, not a deliverable — the durable state an
> orchestrator resumes from cold. Authority for LAW = `docs/architecture/core/**`; the D-ledger
> (`Core-Path-Registry.md` / `Core-Laws-and-Precedents.md`, current through **D136**; **D137 is
> reserved** for the persona build if C1 rules) wins on ANY conflict. `docs/architecture/proposed/**`
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
| 08-09 | **Structured-output corrections (owner, late sitting — all folded into task #36):** (1) the 2026-08-02 "OR response\_format 400s" ruling is WRONG-OR-STALE — OR supports `response_format: json_schema` per-ENDPOINT; the probe missed `require_parameters: true` provider routing (lane owes a two-sided live re-probe before truth-repairing the header). (2) TWO seams only — vLLM xgrammar + the OpenRouter SDK (hosted EXCLUSIVELY; no agent-sdk arm); Anthropic's feature/complexity limits apply THROUGH OR as the routed-provider floor (no bounds, minItems 0\|1, ≤24 optionals, ≤16 unions). (3) The `structured` ROLE already exists (split from summarize 2026-07-27: roles/structured.ts, createVllmStructured guided = already enforced, OR structuredWireTool = the swap target) — EXTEND, never reinvent. (4) **VEHICLE KNOB ruling: three values beside the existing as-projected/strict-compatible shape knob — `auto` (default; resolve-model-capability decides, falls back to forced-tool) / `response-format` / `forced-tool`** — the knobs compose, rpg-lite protected by construction, rpg suites must stay green at ALL THREE values. |
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

## ═══ LIVE STATE (2026-08-13 — ⚠ TREE DIRTY + RED; fleet down; owner out sick) ═══

**⚠ STEP 0 — NOTHING DISPATCHES UNTIL THE TREE IS CLEAN.** Main is `e777c47e5` (7 ahead, unpushed, zero
worktrees) but the WORKING TREE carries an **uncommitted, unrecorded vLLM thinking-checkpoint swap** (9
files) that is **RED**: `pnpm vitest run tests/server/infra/providers/vllm/engine/build-argv.test.ts` =
**4 failed / 25 passed** (verified 08-13). Lane worktrees spawn from HEAD, so lanes silently build
against pre-swap code and any merge touching these paths collides. The swap moves gen off
`Qwen/Qwen3-VL-8B-Instruct` to a local W8A8-int8 Qwen3.6-27B, bumps the vLLM pin `0.22`→`0.26`, and fires
the dormant thinking-checkpoint playbook for real. Good work, half-landed. **Five findings, all STATIC
(no GPU needed) — fix in place on main, ONE commit, no branch:**

1. **`env/index.ts:81` — the presence-penalty change never landed.** Comment says *"1.5 → 0.0 with the
   THINKING-checkpoint swap"*; the constant is still `1.5`. `surfaces/chat.ts` DID move its
   `CARD_DEFAULT_PRESENCE_PENALTY` to `0.0`, but compose always injects the resolved getter, so the LIVE
   wire still sends 1.5 — punishing a thinking model for reusing its own scratchpad, the exact failure
   the comment describes. The updated test only covers the no-getter fallback, so it greens while live
   behavior is unchanged. **Owes a test on the INJECTED-getter path.**
2. **`env/index.ts:59` — comment vs value contradict.** Comment narrates *"0.6 → 0.55"* and mints a rule
   (*"utils must stay near \~0.85 on a 2-card box"*); the constant is `0.8`. With embed at `0.1` that is
   0.9/card, breaking the rule the comment just wrote. Pick one, rewrite the other.
3. **`env/index.ts:44-46` — embed/rerank utils dropped to `0.1`** while the comment block still cites the
   0.14/0.16/0.22 measurements that justified the old floors, including embed *actually* taking 7.68 GiB
   (0.162 effective) at a 0.14 budget. `--enforce-eager` was added to both pooling engines which claws
   some back, but the pairing is unverified. Re-justify or restore.
4. **rerank topology is a confirmed TWO-HOME miss.** `build-argv.ts:379` now returns `"1"` (reversing
   `4805fb0ba`); `wake-budget.ts:69-70` still pins rerank to GPU0 and its comment claims it *"mirrors
   engineCudaVisibleDevices"* — now false. Wake budget reserves on the wrong card.
   (\[\[vllm-concurrency-topology-tuning]])
5. **Snapshot + assertion re-record:** `build-argv.test.ts` inline snapshot (new flags:
   `--max-num-batched-tokens 2096`, `--max-num-seqs 150`, `--default-chat-template-kwargs`; `--dtype
   bfloat16` REMOVED) and the topology assertion at `:331`.
   **Undocumented, decide + write down:** `2096` is an odd batched-tokens value against 32768 max-model-len;
   `--dtype` removal is probably right for compressed-tensors but unexplained in a file that explains every
   other flag; and `enable_thinking:false` means thinking is OFF by default while every sampler around it
   was retuned FOR thinking (defensible buy-per-call, but nowhere stated).

**Not fixable statically:** whether the fleet boots and performs on these numbers. Supervised live window,
stays owed. **⚠ FLEET STILL DOWN** (all 3 engines since 08-10 12:49 under score-sweep+backfill load on the
98%-tight GPU0; state is the 08-10 claim carried forward, NOT re-probed 08-13).

**SICK-WINDOW POSTURE (08-13 → until owner returns).** Norovirus in the house; owner unavailable to
oversee. Deltas from STANDING LAWS, in force until he lifts them: **static-verifiable work only** (no
rendered-surface lenses, no GPU); **no fleet ops** (no `engines:start`, no `stack restart --force`, do NOT
boot on the §3 util numbers); **no pushes** (standing law already needs a fresh word he can't give — main
drifts further ahead, fine); **no DB wipe, no re-import** (owner-triggered by ruling); **no baseline-squashing
schema changes** (drops the dev db). Owner-free queue = the LANE-READY rows below; everything under
OWNER-GATED and LIVE-WINDOW VERIFICATION is parked by definition.

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
- [ ] **Selector changes need a SERVER RESTART to take effect** — summarize and every other role selector
  EXCEPT chat-completion. Config hot-reload gap on the role/selector path.
- [ ] **Settings screen scrolls past the end of its results** — blank space below the last row for no
  reason. Small client fix; route with the next side-eye.
- [ ] **Streaming message SHAPE CHURN** — during generation the message "changes shapes and kind of goes
  wonky," then settles into its final shape when streaming completes. Disorienting. Cross-ref #42
  streaming reveal (`docs/design/streaming-reveal-42.md`) and the smoothStream default→true ruling; this
  may be unaddressed rather than regressed.
- [ ] **Follow-mode is jumpy when you manually scroll up** to read the top mid-generation. **PROMOTED FROM
  A LEAD:** the board already carried "12px scroll-step march in follow-mode streaming (forge §4 —
  touching it risks the follow-intent detector)" as a lead. Owner drive CONFIRMS it. It is now a row.
- [ ] **Regex scripts do not import** with the ST user-data import. Folds into the deferred import lane
  (#28) with databank/user-settings/backgrounds/themes.
- [ ] **vLLM is forced into strict mode at all times.** Receipt: `strictByDefault(format: ResponseFormat)`
  in `packages/server/src/infra/providers/vllm/surfaces/chat.ts`. Decide whether strict is a floor, a
  default, or a knob — it interacts with the #36 structured-output vehicle work.
- [ ] **RPG-LITE is broken around rewind** — swipes especially; **state ends up stuck**. Owner-reported as
  a class, not a single repro. Needs a real investigation lane with instrumentation directives (per
  \[\[rpg-lite-state-loop-gotchas]]), not endpoint poking.
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

- [ ] **#36 schema-forge ENFORCED structured output** (ruled 08-09, owner veto of prompt-based JSON:
  "fragile as fuck and anti-everything about us"). xgrammar / tool-call grammar, generalized so
  USER-BUILT schemas work by construction; the `structured` role EXTENDS, never reinvents; VEHICLE KNOB =
  `auto` / `response-format` / `forced-tool`, rpg suites green at all three. **"Lands before the R3
  graduation lens"** — so R3 cannot close without it. Also owes the two-sided OpenRouter re-probe that
  truth-repairs the stale "OR response\_format 400s" claim.
- [ ] **#37 trust-gated card images + token-concepts unification** — one security lane; "BUILDS GO" 08-09.
- [ ] **#38 ruled smalls, all four** — Untitled-chat rosters · X-16 edited-ago · REGPAR F3/F4/F5 ·
  unsent-draft reload persistence. "SMALLS GO" 08-09.
- [ ] **C1 PERSONA PROGRAM — approved IN FULL 08-08** on the doc's recommended arms (Phase D → Phase C,
  all five §10 forks on their recs, build lane mints **D137** with the §10.5 draft clause; phase gate =
  persona-resolution suite BYTE-UNTOUCHED). Recorded as "**Forge lane dispatched**" and never closed.
  **⚠ `forge` has since been BANNED** — if that lane did not land, this program is stranded and needs
  re-dispatch to a permitted role. **Status genuinely unknown; establish it before anything else here.**
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

- [ ] **RV-13 talk-then-spec** — the conversation is his to open; spec lane spawns after.
- [ ] **Re-import of the 3-year corpus** — his trigger, NOW UNBLOCKED (#45 landed). Note: dev db re-mints on next boot regardless.
- [ ] **Taste pass** — :5173 live · forge-42 before/after gifs · refinery gifs/pngs.
- [ ] **AGENT-1** — his Claude Max re-auth unblocks the ruled keep-whole lane.
- [ ] **Next push** — resets per standing law (fresh word + fresh battery).

**LIVE-WINDOW VERIFICATION (needs a running window, not a ruling):**

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
