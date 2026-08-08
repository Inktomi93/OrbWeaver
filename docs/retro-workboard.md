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
| standing | persona↔rpg linkage DO-NOT-BUILD (persona-pin flavor recorded) · persona reading-B OFF THE TABLE (re-affirmed 08-08 after full walkthrough) · presets are GLOBAL, never per-room · WIRE\_CAPTURE on = deliberate debugging posture |
| open | R0 ratifications (handoff-clear default · ENTRIES\_MAX=108 · PROSE\_MAX=4000 · the 12 prose-slot baseline texts) · C5 · C9 · C13 · home-tile WHETHER · ctx-tab-strip coarse · token-unification offer |

## ═══ STANDING LAWS (owner-set, all in force) ═══

- **Cap FIVE concurrent lanes.** ONE COMMIT per lane (stack, never amend); receipts in the report,
  never the commit message.
- **Worktree CURRENCY (owner intent 2026-08-08):** origin is far behind (unpushed) — worktrees must
  carry the latest LOCAL commit. (1) SPAWN: `.claude/settings.local.json` `worktree.baseRef: "head"`
  — verify it stays `head`. (2) DRIFT: before merging, REBASE the lane's single commit onto current
  main in its worktree (`git -C <wt> rebase main`), then `git -C <main> merge --ff-only` (rebase
  rewrites the SHA — track the new tip). Consolidated `pnpm check` after every merge; **read EVERY
  check exit** — a finished check that sits unread is the same as skipping it. Prune dead worktrees.
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
- Board commits are `-c core.hooksPath=/dev/null` + `node scripts/check/format-md.ts --write` first
  (owner word); code merges keep the discipline above. D-numbers allocate at DISPATCH when two live
  lanes both mint. Lane briefs name their exact playwright CT files (a CT nobody names is a CT
  nobody ran).

## ═══ LIVE STATE (2026-08-08, evening) ═══

- **main `1f62fadb5`**, \~170 ahead of origin, tree clean. **Gates 197.** **⚑ FRESH BATTERY RUN
  2026-08-08 evening (verify --push, detached, exit read): 17/19 — `tests:node` (whole vitest+CT)
  GREEN.** Two push-tier-only reds, both root-caused + fix lanes live: (1) orphan-ratchet —
  `RefineryFieldScore` (contracts/refinery/index.ts:204), R1 export whose consumer is unbuilt R2 →
  `@public` tag in the C2/C8 lane; (2) e2e-smoke — multi-user-seed owner-handle failure. **The auth
  merges are EXONERATED** (security lane, cold-reproduced): harness stacks inherit `OWNER_HANDLES`
  from the repo `.env` (ORB\_ENV\_NO\_OVERRIDE flips precedence only for keys the harness SETS); the
  seed had lived off the pre-D135 twin-mint bug's artifact (last passing DB minted its twin 4 min
  before `04a96f459` removed the class). Fix: pin `OWNER_HANDLES=owner` in e2e envs + state-root
  move `.cache/e2e-<mode>/` → `.cache/e2e/<mode>/` (dodges stale-DB D17 unique-owner collision).
  Re-certify battery after the fix train merges; the conditional push word spends on that green.
- **Merged today, this train:** FORGE#4 CONTAINERIZE (`fd4ae9119`, check PASS) · REFINERY R0
  (`b7ca6d55a`, check PASS) · AUTH BOOT-FENCE + spec repair + shim⇔firewall pin (`06a706551`,
  check RUNNING — read `<scratchpad>/sec-leg-check.exit`).
- **⚑ TRAIN STATE (2026-08-08 late): main `0282bb554` — ONE write lane out (group-engine), push
  word GRANTED.** Merged + check-green this sitting, in order: C2/C8/orphan `c0f896d76` (VERIFIER
  CONFIRMED 6/6 — GRADUATED; 5 observations routed to the smalls batch, notably `preset.importFile`
  bypasses the write-boundary carrier guard, pre-existing {{entry}} twin) · e2e seed fix `ebe6f8905`
  (VERIFIER CONFIRMED 6/6 — GRADUATED; ran smoke 6/6 itself on the new cache paths + forward 4/4) ·
  OR-F5 `05b69a9e9` (wire-proven: array-offset breakpoint landed on a `tool` row costing 5341
  cache-write tokens/turn; conversational-depth fix = 0, invariant across recursion; knob
  `promptCacheMinDepth` in Settings›Admin›System tuning, clamp-to-safe, null=byte-identical;
  F7 probe STRENGTHENED the deferral — 3-hop chain kept naming the mid-chain rune with reasoning
  dropped; $0.152 spent of $0.75) + biome fixup `f71ff9586` · C6/C7 `7f7d56c7f` (export submenu +
  launcher shed; New-book byte-untouched; MOCK CONTRADICTION recorded — the ratified empty-states
  mock frame 2 draws the shed affordance but was drawn SOLO where the duplication can't arise;
  deviation in the component docblock, mock truth-repair in the smalls batch) · C4 `dab954f40`→
  merged `0282bb554` (narrator marker mode-aware, blessed bytes byte-exact; 4 coupled test sites
  caught by the literal sweep; drill-in note w/ planted control). **AWAITING GRADUATION:** OR-F5 +
  C6/C7 + C4 + group-engine — one batched verifier + one batched side-eye (C6/C7 surfaces: submenu
  at narrowest pane · card rhythm sans footer verb · mixed empty/populated arrangement) when the
  train drains.
- **⚑ STICKLER VERDICT (group-chat coherence, owner-ordered "feels crunchy"): BLESS with 4 real
  mis-splits** (`docs/reviews/stickler/2026-08-08-group-chat-coherence.md`). C4's mode-aware fix
  independently vindicated ("the right fix, not a symptom"). Findings ruled by the owner same
  sitting: **F1 short-circuit narrator arbitration, KEEP the policy field** (no smart side-LLM call
  discarded, no phantom warning; field survives mode toggles) · **F2 BUILD real round-robin**
  (pooled ≡ list today, UI label lies, chain starves members) · **F3 delete `groupCharacterId`**
  (D107 dead-switch default — zero readers, travels as a foreign id in bundles) · F5 stale
  smart-fallback comment · F6 per-speaker arm → strictObject (with F3 transition test) · F7
  @mention first-occurrence masking + narrator-room @mention routes through asPerSpeaker →
  **all six in the GROUP-ENGINE lane (live)**. **F4 RULED arm (a): re-home the group-round framings
  to the PRESET home + amend D132(B)** (queued, task #9). **VOCAB CENSUS RATIFIED IN FULL** (task
  \#10): kill crew (39 files + the LIVE `entryMetadata.crew` schema field, NO-LEGACY rename) ·
  director→arbiter · stop minting seat\* · 3 theatrical UI strings; KEEP party/scene/act (model-facing
  wire vocab) + ember/weave (brand rulings stand).
- **⚑ ARM A / D16 MARGIN RULED (orchestrator, owner-endorsed "do whatever's cleanest"):**
  narrator-of-ONE (reachable only by shrinkage/mute — group controls gate at 2+) keeps the NARRATOR
  marker: mode is host-chosen DATA, a `members.length > 1` gate is the exact `if (isGroup)` shape
  D16 forbids, and narrator-of-one was never byte-identical in the persisted plane (synthetic-
  character canon authorship). The solo-byte suite's narrator test reformulated LOUDLY (old text
  preserved above the amendment; nudge-suppression-at-≤1 stays — mechanics vs identity distinction
  recorded). **Ceremony candidate: a D16 amendment clause** at the next batch (enforcer exists —
  the reformulated suite test).
- **⚑ PUSH WORD GRANTED (owner, 2026-08-08 late): "you have my word to push when we get there."**
  Sequence it spends on: group-engine merges → batched lenses → FRESH `verify --push` green →
  `E2E_LIVE=1 pnpm e2e` → PUSH. The queued trio (F4 re-home · vocab sweep · OIDC owner-binding
  task #8 — the owner's dogfood pain point, security-executor, FIRST dispatch after the push) is
  train two.
- **⚑ NEW ROWS from the sitting's lenses:** OIDC owner-flip binding (#8 — seeded owner collides
  with OIDC sign-in under D17; bind-or-heal by OWNER\_HANDLES match; owner wants db-surgery-free
  mode flips) · harness env-inheritance class (#7 — 3 sibling harnesses on the weak hatch +
  OWNER\_GROUP/WIRE\_CAPTURE latent leak notes; e2e lane's class sweep) · smalls batch (#6 —
  recognizer-mismatch chip lie · guidedActions read-degradation class created by C8 (no .catch) ·
  importFile guard bypass truth-repair-or-guard · 2 stale comments · @public wording · the C7 mock
  truth-repair). Token-concepts unification (DEBUG\_TOKEN/wire/allowlist as ONE ops story) OFFERED,
  not yet ruled — DEBUGGATE unified only the debug surface's credential model.
- **⚑ DECISION SITTING RESULTS (2026-08-08, owner live):** C2 BLOCK (Option C) · C3 SHIP ALL
  VERBATIM (ratified — the veto pile is closed) · C4 RULED mode-aware default + BLESSED narrator
  bytes (verbatim in the session TaskList #5; identity-as-narrator, address clause preserved;
  per-section override stays one text for both kinds) · C6 arm 1 (kebab PNG/JSON submenu, queued) ·
  C7 arm 2 (CollectionLauncher drops count+create once populated; New-book double stays, queued) ·
  C8 Option 2 (shared constant, in-lane) · **openrouter split: F5 BUILD+prove+depth-knob (lane 3) ·
  F6 SKIP (wire property, nothing to build) · F7 DEFER** — the board's "latent hard-400 bug" framing
  was WRONG: we never replay reasoning (no ChatContentPart arm), drop-is-safe is MEASURED, reasoning
  STORAGE already exists per-message; probe arms ride lane 3 to re-confirm on a multi-hop chain.
- **⚑ W5 (user-macro values store) STRUCK — FULLY BUILT, board row was rotted** (orchestrator
  ast/grep ladder 2026-08-08): sibling column `chats.userMacroValues` (schema/chat.ts:156) ·
  `setUserMacroValues` verb (chat-lifecycle.ts:254) + proc (routers/chat.ts:534) + matrix member row
  (:115) · turn consumption `turn.ts:394` via `loadStoredUserMacroValues` (placeholder `values: {}`
  gone, zero hits) · pane `MacroPicksSection` mounted (settings-context-tab.tsx:144) · bundle
  portability. The spec's own F1 ruling (2026-07-27, "yes option A") was recorded at its foot and
  the board's "parked on owner fork" claim never re-checked it.
- **⚑ FULL-BOARD SCOUT SWEEP DONE (2026-08-08, owner-ordered "verify they aren't already done"):**
  four scouts re-laddered every B/C-premise/D/E row. **Stale harvest: B 3/4 · C 1/10 · D 7/9 ·
  E 5/6 already-done** — struck below with receipts (F). The C pile survived near-intact (it waits
  on the OWNER, not on memory). Every surviving row below now carries a 2026-08-08 live receipt.
- **Worktrees on disk:** `agent-forge-docker` (merged — reap after the security review clears, may
  get a fix leg) · `agent-refinery-r0` (merged — reap after the verifier clears) · the
  PRESET-FOLLOWUP worktree (live) · `.cache/snap-stage/be00cf36a4dc` (side-eye ref-pinned stage,
  :5273/:8888, left running DELIBERATELY for re-verification).
- **⚑ OWNER OPS (standing, security):** rotate `DEBUG_TOKEN` (surface was open an unknown window) ·
  set `IP_ALLOWLIST` (still unset with `WIRE_CAPTURE=on` in the live `.env`).
- **"Tag colour voices" RESOLVED (2026-08-08):** the phrase meant the `Text` primitive's `voice`
  prop (TYPOGRAPHY — `datum` vs `gloss` on the tag color readout), already fixed by POLISH-CLUSTER
  and re-verified. The board's old "preset swatches" gloss was an orchestrator paraphrase error; no
  swatch feature was ever asked for. Do not re-chase. (A user-set per-character speaker-tint
  override remains an OPTIONAL unbuilt doorway — `speaker-color.ts` hash is "the fallback before a
  real per-character ThemeOverride exists" — see C-taste.)

## ═══ THE QUEUE (absorbed ledger, tree-reverified 2026-08-08 + live updates) ═══

Ranked by consequence within each category. Every item carries its receipt state.

### A · IN-FLIGHT (reconcile at landing)

- **A1 · REFINERY R0 → merged `b7ca6d55a`, check PASS, ✅ VERIFIER CONFIRMED ALL 7 (graduated);
  PRE-R1 SECURITY PASS RUNNING.** R0 landed contracts (`contracts/src/refinery/` —
  stages/verdicts/statuses/F4 enums/F5 fields, single-arm `{kind:"fixed"}` config union — DDL-free
  seam PROVEN, custom arm is contract-only) + db (`refinery_sessions`/`refinery_runs`, tuple-CHECKs
  in the regenerated baseline, FK chain complete+NOT-NULL so no unscoped row is representable —
  **dev db drops on next boot**) + kit brands + gate rows (census 84 re-counted) + 21 tests
  (cascade proofs real, planted tsc probe proves dispatch exhaustiveness). Deviations ratified
  (no-ownerId per D23 derive — verifier read D23 and agrees). **The verifier handed the security
  pass 5 foundation bounds-gaps:** unbounded score/analyze payload strings/arrays (analysis lands
  in CANON and ships to the client) · whole-object `.catch(null)` deletes a stamped score on
  analysis drift · `greetingIndex⇔greetings` unenforced + unbounded · `sessions.guidance` uncapped
  free text with no contract schema (the prompt-injection surface) · zod strips-not-rejects. Plus 2
  cheap test adds (status CHECK never bitten; sessions-row cascade control). **✅ SECURITY PASS
  LANDED — GO for R1** (`d8674e83a` + report
  `docs/reviews/security/2026-08-08-refinery-r0-security-pass.md`): every model-authored
  string/array now contract-bounded (red-first ×8; analyze ≈130KB worst-case, was unbounded;
  status CHECK now bitten; guidance/session-name schemas minted) · rulings: field-level heal (+
  HARD ordering: score tightening same-change) · greetingIndex = verb-tier assert (3 receipts why
  not a refine) · strip stays + itemize stripped KEYS · 3 latent MEDIUMs for R1 (applyFields
  re-parse per card.ts:192; dropNullValues under D126 strict-compatible — verified every rewrite
  would fail; neutralizeMacros card text) · member plane confirmed NOT exposed · no
  lifecycle-portability row owed · prose homed `user` = no fork strip.
  **✅ R1 (THE ENGINE) GRADUATED `1abec875b` — verifier CONFIRMED all 7 + security-executor GO +
  consolidated check exit 0; worktree reaped.** 64 files/+3729, 266 tests. **Security GO receipt
  (`docs/reviews/security/2026-08-08-refinery-r1-live-flow-audit.md`):** belt-5 downstream seam
  BROKEN-AND-HELD — the ONLY repo-wide readers of `characters.refinery` are the admin-gated debug
  inspector + card-merge field-carry, ZERO chat/prompt/macro consumer, so stamped card bytes never
  reach a macro-resolving path; stamp-WHERE owner-predicate real+non-vacuous; injection can't widen
  the apply set (selection fence + server-derived characterId); write re-validates card TEXT\_MAX;
  strippedKeys paths-only. **Verifier receipt:** apply-intersection algebra red-pinned; heal
  independence proven via RAW column bytes (score survives analysis-drift); latestVerdict newest-wins;
  iterate mid-round writes nothing on failure; shared stage-engine has no pooled sink.
  **⚑ ONE REAL FIX from the cross-lens loop (`11c3ec6e7`, consolidated check exit 0 — SEALED):** the
  code-verifier flagged that belt-9's apply fence honored `selection.fields[]` but NOT
  `selection.greetingIndexes` → orchestrator relayed it to the live security lens → ruled NEEDS-FIX
  (a prompt-steered rewrite could reach an UNSELECTED greeting slot the user accepts) → security
  lens fixed it in-verb RED-FIRST (`classifyAccept` now drops out-of-`greetingIndexes` accepts as
  `not_selected`; `undefined`=all greetings, common case untouched; 56/56 + typecheck). R0's belt-9
  wording under-specified greeting granularity — the fix closes it. LOW severity, security-lens
  self-proven; an independent re-verify of the fence is available on the owner's word (optional,
  belt-and-suspenders).
  **⚑ NON-BLOCKING SMALLS (boarded, from both lenses — see D):** `accepts` has no wire `.max()`
  (self-DoS, owner-only today) · apply-fields lacks an explicit foreign-session NOT\_FOUND pin (reuses
  a belt proven in 6 siblings) · `depthPrompt→not_applicable` branch unpinned · `latestVerdict` ORDER
  BY has no id secondary-sort (deterministic in practice, ms-apart runs). **⚑ OWNER product calls
  (carried from R0, not defects):** the handoff-clear verdict (new owner does NOT inherit the prior
  owner's private card critique) · `PROSE_MAX=4000`/`ENTRIES_MAX=108` ceilings.
  Built `domain/refinery`: 9 verbs (session lifecycle + runStage + iterate + applyFields), shared
  stage engine, D23 character-join ownership, 3 substrates + all 17 §4 belts with receipts (belt-5
  by-construction per the mid-run ruling below, pinned BOTH drift directions + two-method
  zero-macro-imports; heal+score-tightening in ONE change; handoff-copy `refinery:null` clear; 12
  user-homed prose slots + 3 `refine_*` postures; `refinery_runs.strippedKeys` column; both
  pre-producer gate rows DELETED). Two of the lane's OWN test expectations were wrong not the code
  (null-drop non-itemization; drop-reason precedence) — corrected. **GRADUATION LENSES DISPATCHED
  (owner-cleared "do the security audit, enough usage"):** verifier `a8f6d051…` (apply-intersection
  algebra · heal independence · latestVerdict newest-wins · iterate mid-round state · shared
  stage-engine sink · the 2 self-corrected tests) + security-executor `acd25d370…` (belt-5 DOWNSTREAM
  reach via viewers/replays/exports/preview/reminder — the seam by-construction does NOT auto-cover ·
  the stamp WHERE belt · injection widening apply past belts 9/10 · strippedKeys keys-not-values ·
  internal re-parse caps). Graduates on both CONFIRMED + the consolidated check exit. **⚑ OWNER-SACRED, awaits sign-off: the 12 shipped
  prose-slot baseline TEXTS** (the lane's adaptation of the extension corpus to structured output —
  model-facing default bytes, \[\[persona-is-owner-sacred]] class). **⚑ BELT-5 DEVIATION RULED
  (orchestrator, mid-run):** `neutralizeMacros` on refinery text would CORRUPT canon (ZWSP'd braces
  ride rewrite→applyFields→card, killing the card's own {{char}} at chat time) —
  satisfaction-by-construction APPROVED instead (no macro engine in the domain, concatenation not
  splice, all 12 slots macros:"none"), pinned by a both-directions substrate test (card {{char}}
  reaches the prompt VERBATIM: unresolved AND un-neutralized) + a two-method zero-engine-imports
  receipt. Named attack target for the post-R1 security re-review (design §9.10). **OWNER (small):** ratify
  the handoff-copy CLEAR default · the two judgment caps (`ENTRIES_MAX=108`, `PROSE_MAX=4000` — how
  much critique a model may write).
- **A2 · CONTAINERIZE → merged `fd4ae9119`, check PASS; ✅ SECURITY §8 REVIEW LANDED (8/9 hold);
  FOLLOW-UP LEG on the warm security lane.** Review:
  `docs/reviews/security/2026-08-08-containerize-surface-review.md`. **F1 (real, fixed
  `82bf99a60`):** the shipped `single-user`+`AUTH_FALLBACK=deny` pair was INERT (401s everything) —
  the "single-user ignores the knob" claim is FALSE (`infra/auth/index.ts:48` checks fallback
  first; pinned by its own test) — and the natural deployer reaction (flip fallback + publish
  ports) is the AUTHFIX-2 exploit shape. Now ships `owner` with single-user; `deny` moved into
  each SSO mode's block. CONFIRMED: expose-only (0 `ports:` all profiles) · secrets (planted
  positive+negative context controls; shim clean) · egress structurally can't accumulate ·
  hostile `VLLM_ENGINE_HOST` fails closed (all smuggling shapes measured) · non-root both app
  targets. REFUTED (recorded): the vllm SIBLING runs root/default-caps (upstream image — live-step
  rec: try cap\_drop, CUDA may need IPC\_LOCK) · profile coupling only pins `sibling` (availability
  not exposure). **FOLLOW-UP LEG (running):** spec truth-repair ×3 sites + the `superRefine`
  boot-fence (single-user+deny = boot-fatal, red-first) + 3 in-code comment repairs + the
  shim⇔`HOST_SECRET_ENV_KEYS` coupled-site tie. **✅ FORK RULED (owner, 2026-08-08):
  usable-as-owner IS the default** — the SillyTavern first-run model; ratified, recorded in the
  spec. **✅ THE LEG LANDED (`06a706551`) — BUILD STREAM GRADUATED:** spec truth-repaired ×3 with
  the ruling verbatim · boot fence red-first (single-user+deny refuses at env parse; `oidc`+`deny`
  scope-control green; per-mode requirements now a mapped `Record` so a 5th auth mode fails tsc) ·
  all 3 false-claim comments repaired · shim⇔`HOST_SECRET_ENV_KEYS` set-identity conformance test
  w/ planted control that DEMONSTRATED the leak · 249 tests + 3 typecheck programs green. The
  fence is env-boundary only (infra `resolve` still accepts a constructed incoherent config — its
  contract test depends on it; stated in-code). **OWNER — the only remaining containerize work is
  the live-infra steps:** `docker build` both targets (+`docker inspect` the healthcheck),
  container runs, fleet-in-namespace, read-only shakeout, sibling-vllm cap\_drop probe, the pentest
  cage (§4/Fork F), deploy posture (C13).
- **✅ A3 · PRESET-FOLLOWUP — GRADUATED** (fix leg `eb3669b1e`, re-verify CONFIRMED all 5
  consequences DEAD + all 4 minors real + both truth-repaired CTs bite; fix-leg check exit 0;
  worktree reaped). The drill is a scoped `(presetId,sectionId)` pair
  (`state/preset-section-drill-store.ts`) —
  cross-preset leak UNREPRESENTABLE (scoped read → foreign preset = null), retarget-on-fork from
  the one site that knows (`use-preset-autosave.ts`), clear at the single view-writer chokepoint
  (`setPresetEditorView` — so nav doors inherit it), `presetId` REQUIRED (7 sites). All 5 pins bite;
  swept coupled sites the brief didn't name (2 pre-existing CTs falsely named routing → BAD\_REQUEST,
  branding, a test-presence mirror). Durable lesson: moving state useState→store is taking on a
  lifecycle you must design per nav axis (banked). Original verifier verdict (3/4 CONFIRMED, 2a
  REFUTED — the drill store had NO production reset:
  `closePresetSectionDrill`, scanned=987): **B-2 live regression** (Delivers-via chip lands in the
  WRONG section's editor when drilled — its contract CT green only because it never drills first) ·
  B-1 view-switch persists the drill · B-3 cross-preset leak (section ids are DEFAULT literal
  collisions by the norm) · `clear()` side-effect dismisses the mobile overlay panel. Fix-leg
  constraints: fork KEEPS drill · chip lands on rack w/ target current · view-return = rack ·
  no cross-preset leak; + 4 minors (unknown-typed prop, headline over-claim P3, false fixture
  prose, retry-CT focus-heal false-pass path). Graduates on the fix leg + re-verify. Original
  landing detail:
  Shipped 3/4: B1 CapabilityGate wired to shared `failureCause` (verdict verbatim ONLY on
  BAD\_REQUEST; error threads WHOLE so `data.code` survives; red-first CT bite-proven) · B2 Prompt
  section-drill on a store axis (mirrors FORGE#1; red-first: old source ejected, new survives the
  fork; 20/20 drill CTs) · retry CT closed the real gap (fail→Retry→recovers over the wire; click
  proven the only trigger). ITEM-3 DECLINED per recorded ruling (`index.ts:1265-1267` — the wire
  name in `fires` IS the row→tool map; owner may override as a copy call, C-taste). **⚑ MECHANISM
  CORRECTION (lane receipt, `resolve-role.ts:355`):** `resolveChatCapability` is CREDENTIAL-FREE —
  the old board text "missing credential inverts the claim" was wrong; the hardcoded verdict lied
  over ANY non-routing failure (500s etc.). Same class, same fix. Durable lesson banked:
  \[\[ct-vite-prebundle-masks-source-neuter]] (bare `@orb/client/*` CT imports run PREBUNDLED code
  — a source-neuter bite lies green; prove via rendered pre/post controls).
- **A4 · The preset/config side-eye train GRADUATED (2026-08-08):** FORGE#1 Actions IA + POLISH
  cluster + PROSE-GEOMETRY all **SHIP** under the batched rendered lens (`be00cf36a` ref-stage;
  delivery-truth readout, fork-eject picker, prose cap geometry all confirmed live). Their rows are
  closed; residue is A3's items.

### B · DISPATCHABLE NOW (no owner ruling needed)

- **✅ B1 · Populate-round prose migration — GRADUATED** (verifier CONFIRMED all 6, byte-identity
  INDEPENDENTLY derived by eval'ing the old functions from git across all 4 corpus arms; all 100
  prose-baseline sha256s recomputed 0-mismatch; ratchet regen diff-empty). Worktree torn down.
  **2 notes recorded:** (A) sequential token splice = a character NAME containing literal
  `{{cardBody}}` expands to the card's own body — SELF-injection only, no cross-tenant reach, no
  action; (B) pre-existing gate reach gap — `no-hardcoded-model-prose` counts `rpg.ts:380` but not
  sibling `:377` (the turn-loop extraction user prompt) — small gate-reach row for a later lane.
  Landing detail: All 7
  strings are `rpg.populate.*` slots (2 tokened blocks body-as-token per the {{actorTrackers}}
  precedent) + TEMPLATE\_DEFS rows in `cluster:"round"` ("Born-state round —" glosses; a dedicated
  band = a later 1-member sibling-file change if wanted). Byte-identity: pre-migration fixtures
  green on HEAD then green post + planted 1-char control red. Ratchets shrink-only
  (extraction-prompt row DELETED, rpg.ts 8→6; prose-baseline 93→100). Its literal sweep caught +
  fixed 1 stale coupled site (hand-spelled slot-id list). 376 tests + 21 CT + full static floors.
  Verifier is independently re-deriving the old bytes from git. \[merged 08-08]
- ~~B2 respell~~ · ~~B3 cross-link fixture~~ · ~~B4 baseline+fork.ts~~ — **ALL STRUCK, scout-
  verified already-done** (receipts in F).

### C · OWNER-DECISION (his word only; recommended arm marked)

**Persona / prose cluster**

- **C1 · persona = character** — OWNER-SACRED. Design:
  `docs/design/persona-character-kind-substrate.md` (5 forks §10). **Rec: Phase D now**
  (kind-polymorphic cast — `CAST_KINDS`+`CAST_KIND_POLICY`, no stored column), **then Phase C**
  (`@orb/contracts/card-face` 4-field substrate). Reading B is OFF THE TABLE (D122/D131 collision).
  Build lane mints **D137**; behavioral gate: `persona-resolution.suite.int.test.ts` byte-untouched.
- **✅ C2 · RULED 2026-08-08: BLOCK (Option C), lane live** — `{{note}}` warn-vs-block. History:
  `docs/design/note-token-intent-history.md`: warn-never-block
  was INHERITED, never decided. **Rec: Option C** — reclassify `{{note}}` as a CARRIER token that
  BLOCKS at write (join `FORMAT_STRING_CARRIER_TOKENS`, today only wiFormat/`{{entry}}` at
  `preset/index.ts:734`), keep cosmetic `{{name}}`/`{{names}}` as warns. \[live-verified still warn]
- **✅ C3 · RATIFIED 2026-08-08: SHIP ALL VERBATIM (closed, no build)** — the veto pile: the 3 nudge texts (`speakerTags` v1 ·
  `narratorNudge` v1 · `roundNudge` v2 — LIVE defaults today) + `chat.group.castMember`
  (`[Cast — {{name}}]`). **Rec: ship all verbatim**, no token added.
- **✅ C4 · RULED 2026-08-08: MODE-AWARE DEFAULT + bytes BLESSED (build queued behind the group-chat
  stickler verdict; bytes verbatim in TaskList #5 + the sitting block above).** Decisive facts: presets
  are GLOBAL (a narrator-preset would flip every chat), and one narrator room legitimately produces
  BOTH turn shapes (forced/@mention coerces per-speaker via `asPerSpeaker`), so only turn-time
  selection by speaker kind puts right bytes on both. Original row: once `{{char}}` binds the joined cast,
  the default marker renders "…write Charlotte, JFC's perspective only" (self-contradictory;
  `contracts/preset/index.ts:995`). PRESET-owned template, deliberately not fixed from the
  assembler. **Owner call: a mode-aware default marker, or a documented narrator-preset.**

**Config / portability cluster** (`docs/design/parked-options-config-port.md`)

- **C5 · Presets into the config rail** — **Rec: arm 4** (leave standalone; the "one array member"
  premise is false — folding needs 3 seam extensions; migrate properly when he feels it).
- **✅ C6 · RULED 2026-08-08: arm 1, build queued (TaskList #3)** — server arm SHIPPED (`?format=png|json`);
  add the PNG/JSON submenu to the character kebab mirroring the chat kebab. \~10 lines.
- **✅ C7 · RULED 2026-08-08: arm 2 split-the-class, build queued (TaskList #4)** — fix the
  landing at the child level (each `CollectionLauncher` drops count+create once populated), KEEP the
  New-book double affordance (mock-ratified + CT-pinned).

**Tag / contract cluster** (`docs/design/parked-options-tag-contract.md`)

- **✅ C8 · RULED 2026-08-08: Option 2, in the C2 lane (renames `MAX_FORMAT_STRING_LENGTH`)** —
  shared `MAX_INJECTION_TEMPLATE_LENGTH` (=10000)
  for BOTH formatStrings and `guidedActions.*.prompt` + UI maxLength. \[live-verified:
  `guidedActionConfigSchema.prompt` still uncapped `z.string()` at `preset/index.ts:337` — the lone
  uncapped authored-text field reaching DB + wire]
- **C9 · Four tag taste-calls** — recs: 1a tag-only backup → SKIP (bundle carries tags.json) · 1b
  import Ask/All/Existing/None → KEEP ours (durable queue) · 1c manual/`sortOrder` → KEEP
  (owner-ruled) · 1d folder OPEN vs CLOSED → build OPEN, defer CLOSED (else drop write-only
  `folderType`).

**Ops / posture cluster** (`docs/design/parked-options-ops-posture.md`)

- **C10 · AGENT-1** — **Rec: SPLIT.** The credential is an OWNER ACTION (re-auth Claude Max OAuth);
  arms 1-3 (knob honesty · reasoning-visibility parity · usage/context parity) are a buildable lane
  that does NOT wait on it; only arm 4 (live rpg-lite on the SDK wire) is credential-blocked.

- **C11 · Barrel amputation worklist** — root-fix LANDED (57→**29** stars, scout recount 08-08 —
  doc says 28, off-by-one; both files the sanctioned db-schema stars); HELD for a quiet tree: Tier
  A 85 per-symbol verdicts (delete / `@public` / header-cite; several RPG\_\* protected) + Tier B 50
  zero-risk drops. Then **C12 · `--include-entry-exports`** — **Rec: arm (c)**, enable AFTER the
  amputation (else it buries the 85 under entry-export noise).

- **C13 · Containerize deploy posture** (post-A2-review): `AUTH_FALLBACK=deny` for public
  multi-user · `OWNER_HANDLES`/`OWNER_GROUP` provisioning · image build + pentest-cage sequencing ·
  the env-schema `*_FILE` support fork (lane refused as out-of-scope — foundation surgery, his
  call).

- **C14 · Refinery F6/F7** — F6 auto-stamp rec: every analyze refreshes `characters.refinery`,
  `applyFields` auto-snapshots first · F7 retention rec: no caps v1. Low-stakes; fold into R4.

- **⚑ C15 · REFINERY TAIL R2-R4 + NL→schema** (owner-sequenced; R0+R1 DONE+graduated, port study
  `:379-386`). **R2 client mutations (S)** — just the React-Query hooks over the tRPC router R1
  already shipped; safe/mechanical, clear to start on the owner's word. **R3 the Refinery SURFACE
  (L-XL, the center of mass)** — the D62 anatomy UI wired into the D70 founding-member section
  (currently a "planned marker"); DESIGN-SENSITIVE → wants a mockup ruling + side-eye after (owner
  taste territory, do NOT start unprompted). **R4 sweep+library (M)** — `refine-score-sweep`
  workload (batch-score every card, the orb-native win) + I2 sorts + dossier hookup; folds F6/F7.
  **NL→JSON-schema UI (SF0+, the owner-flagged "important" feature)** — the single-arm `{kind:"fixed"}`
  config union has DDL-FREE room for a `{kind:"custom", schemaId}` arm; engine tier already exists
  both directions (`liftJsonSchema`/`projectJsonSchema`). Layers onto R3's surface. Design:
  `docs/reviews/stickler/2026-08-08-card-refinery-nl-schema-design.md`.

- **C-TBD · CAS maintenance scheduling** (orchestrator read the CAS with own eyes 2026-08-08 — the
  store is EXCELLENT and correct; this is the one "built but not used to its fullest"). The
  mark-sweep GC (`collectGarbage` — whole-CAS orphan + abandoned-upload sweep) and `fsck` are
  registered `WorkloadContribution`s + manually triggerable from the workloads UI, but **nothing
  seeds a default schedule** — the targeted `reapIfOrphan` IS wired to character-remove
  (`assets-character.ts:222`), so the common case reaps immediately, but crash/DR orphans +
  abandoned uploads accumulate on disk until a manual trigger. **TBD (owner posture):** seed a
  default schedule (rec: weekly GC real-run + monthly fsck) and fold in the variant-cache
  stale-quality reclaim (a quality-setting change orphans old `qN.webp` files until the blob is
  purged — disk-only, recomputable), OR keep manual-trigger as the deliberate self-hosted posture.
  Non-blocking; blob-serve full-buffer/no-Range is a NON-issue today (owner-gated capped images
  only) — recorded, not a fix.

**Standing owner items (genuinely open, unchanged)**

- DRAFT-TRUST server render-policy seam (architecture call) · VRAM-refusal live drill ·
  v3-transcripts-reach-new-installs-only heal · RV-13 branch-and-save game modes (READY TO SPEC —
  PROSE-1 landed) · unsent-draft reload persistence + the nav-away draft-discard design pass ·
  chars+chats one-glyph rail merge · trust-gated card images doorway (mechanism pinned: `src=`-routed
  card-frame doc with its own CSP) · **mid-session persona↔rpg linkage — OWNER-SACRED, ruled flavor
  recorded (persona-pin semantics), DO NOT BUILD** · ~~`.env` OpenRouter key is INERT~~ **FALSE —
  struck 2026-08-08 (owner caught it, orchestrator pinned the receipt):** `seedCredentialFromEnv`
  (`entry/boot/seed-credential.ts`, wired `lifecycle.ts:242`, predates the retro era) idempotently
  seeds the env key onto the OWNER's credentials at boot when no openrouter row exists. The 08-07
  "no env fallback" claim promoted an empty-list STATE observation into a structural claim without
  a two-method check. Decision row premise-dead; note the task-#8 interplay (a mode-flip owner row
  inherits the seeded key at next boot) · templating fork
  rows 53-73 (REWRITE\_TOGGLES/GREETING\_TRANSFORMS fragment bytes — client-composed via kit, a
  design fork) · shell-tier CLS \~0.26 (F-14, three sightings, needs an owner look — pairs
  with E1) · home-tile promotion WHETHER (`docs/design/home-tile-promotion.md` — in-place chips may
  already cover it) · ctx-tab-strip label unreachable at coarse · REGPAR F3/F4/F5 menu · "Untitled
  chat" in regex rosters · X-16 edited-ago timestamp (contracts+db) · **taste (optional):** the
  eight tool-row `fires` glosses humanize-or-keep (recorded ruling says keep) · per-character
  speaker-tint override (the ThemeOverride door — optional, nothing asks for it) · Meteocons ·
  grimstone · chat-options placement (D111 clause).

### D · OLDER OPEN (scout-swept 2026-08-08 — 7 of 9 checked rows were ALREADY DONE, struck to F)

- **D1 · Home `useOrder` follow-up** — CONFIRMED still static (`order-home-tiles.ts:9-11`, pure
  sort, no store) — but that's the DESIGN OPTION awaiting the owner (home-tile promotion, C-pile),
  not debt. \[scout-verified]
- **D2 · REGX2 deferred bulk PLACEMENT** — CONFIRMED blocked: `deriveRegexTierFlags` still
  client-homed (`features/regex/lib/derive-tier-flags.ts:48`), zero kit twin (two-method). Unblocks
  when it lifts into `@orb/kit/regex`. \[scout-verified]
- **D3 · LAUNCH-DAY trio** (parked to the day, not scout-checkable): REGIME-2 db-baseline re-point
  · the two-switch migration-regime flip · h3/QUIC checklist (Caddy h3 + UDP 443).
- **D4 · CT-on-our-vite spike**: pnpm override `@playwright/experimental-ct-core>vite: ^8.1.2`;
  green = one vite; red = revert. \[not scout-checkable — a probe, not a premise]
- **D5 · Engines fleet fix — live verification owed**: the next real `pnpm engines adopt` IS the
  test (one launcher exits promptly, no dupe on a healthy port, pidfile merges).
- **D6 · automation\_rules + global\_variables portable family** (the 12th kind). Fork lineage
  (`parentChatId`) structurally does not travel. Deferred with corrected end conditions.
- **D7 · SM7 residue — RELOCATED (scout 08-08), recorded DELIBERATE (I-1):** the second
  `response_format` builder that never emits `strict` lives at
  `vllm/engine/chat-completion.ts:87-105` today (post-restructure), consumed only by vLLM
  summarize (`surfaces/summarize.ts:79-180`). I-1 recorded it deliberately-untouched; if summarize
  ever wants grammar enforcement this is the address. Not debt unless re-ruled.
- **D8 · CPD 3 dup rows + TYPO 27 as-const tuples** — consolidate only when next IN the file.
- **D9 · WAKE-STATUS**: the 3s engine wake is silent; revisit only if laggy.
- **D10 · Recorded-no-action set** (kept so nobody re-derives): L8-inbound declined-by-scope ·
  seeder drop-patch stays until the next fixture regen · `staging.ensure` dormant · per-chat
  `providerRouting` phantom (DORMANT/RESERVED by design) · FillableIcon targets are OPPORTUNITIES
  · `lockdown` §16 G-table defers to live count.

### E · VERIFY / INVESTIGATE (scout-swept 2026-08-08 — 5 of 6 checked rows CLOSED, receipts in F)

What remains needs a LIVE window or a rendered lens, not a scout:

- **E1 · prod-build CLS window** (`docs/design/prod-build-cls-investigation.md`): dev home-boot CLS
  0.134 + the shell-tier 0.26 sightings; run `pnpm stack up prod` (non-8788) and re-measure when a
  window opens.
- **E2 · PRESET-SLIDER-VERIFY** (S): re-verify the slider deck rendered on a vLLM/OR connection
  (sonnet-5 exposes no sampling knobs — the deck was never seen).
- **E3 · E2E\_LIVE=1 pnpm e2e** on the push window (never re-confirmed this era).
- **E4 · narrowest-mount row gate candidate**: gate-shaped, ASTLENS-precedent report first (the
  class behind both gap-audit P1s: `shrink-0` trailing cluster never re-measured at production
  width; candidate CT floor: leading text ≥50% at narrowest real mount).
- **E5 · Databank pagination live-drive**: drive a real >100-doc bank once (reach was proven via a
  contract stub).
- **E6 · fillRule=evenodd fillable-set probe** (owner-optional, needs a side-eye gallery verdict).
- **E7 · Residual unverified tail** (low): ARCHIVE2's six unreached side-eye items · whether
  NIGHTFIX's three argued refusals are settled with the OWNER or only the reviewer · the engine
  auto-sleep/wake live pass + VRAM drill dependency.
- **⚑ One documented ceiling from the E-sweep (not a bug, recorded):** `agent-nav/index.ts:144`
  resolves a character by `.find()` over ONE `character.list` page (limit 500) — self-documented
  dev-tool limitation ("dev library is small… no keyset walk needed"); becomes real if the library
  exceeds 500.

### F · STRUCK DONE (verified closed — do NOT re-chase; receipts in the 08-08 archive + git)

AUTHFIX-2/debug-gate CLOSED (DEBUGGATE graduated; `debug/routes.ts:142-149` +
`DEBUG_GATE_CREDENTIALED`, `via:"fallback"`=false — only the two OWNER OPS remain) · databank
pagination BUILT (server+client) · I-2 DATABANK CLOSED (S1+S2+S3) · pointer-coarse gate MINTED
(`no-pointer-variants-in-features`) · run-coverage widgets bug FIXED · DOCLAW carve-out in
`Documentation-Law.md:114` · MACRO-CAST-GUIDES threaded · ZOD-STAGE-D all legs · IMPORT-SETTINGS
guard PREMISE-DEAD · tsx-shedding DONE (all 4 stages) · CRUNCH (a)+(b) DONE (note frames are
PROSE-1 slots; templating unified) · st-goldens/STATLAS leg 2 LANDED · 17 probes typed + node-26
gate · gate-ignore class ENFORCED + the mention fence (FORGE#2) · tag-wants premise-dead (all 3
shipped 5 days prior) · TRACKERGATE closed the member-self-grant hole · TOAST stream CLOSED ·
CANON-IDENTITY complete (4 legs, graduated) · PROSE-1 rpg program COMPLETE incl. row-27 wire +
extraction seam + RE-HOME to preset `promptConfig.prose` · PORT-R6/D136 (chat bundle travels,
graduated) · I-1/I-5/I-6/I-7 initiatives closed · brand burn-down terminal · REGX2 landed ·
square-glyph sweep paid · icon-seal doorways BUILD-NONE · dogfood campaign CLOSED 08-08 dawn ·
smallbatch3 (phone-markread was already fixed; ashen-spire 26-anchor seed coverage added) ·
gap-audit DONE (EmptyState w-full fence merged) · "tag colour voices" resolved (typography voice
prop — already fixed; the swatch reading was a gloss error) · principal divergence fixed (D135,
graduated) · ROW-27 WIRED (`bbb6364a2`) · probe-lint ruled leave-as-scratch · tag ≤30 drag-cap
ruled leave-as-is · CapabilityGate PENDING arm shipped (distinct from A3's wrong-cause fix) ·
F4-CACHE-VOLATILITY built · `getCatalog` boot-warm readers answered.

**The 2026-08-08 scout sweep's strikes (4 scouts, every negative two-method with scanned counts):**
respell = plain aliases now (`search/contract/params.ts:28,31`) · PORT-R6 cross-link fixture
EXISTS (`bundle-round-trip.suite.int.test.ts:732-1013`, ≥2 rpg turns, own-ids + `not.toBe` the
sibling's) · fabrication baseline clean (10/10 sample paths live) · fork.ts comment already
corrected ("LIVE, not dormant", cites both writer SHAs; file is `verbs/fork.ts`) · rail 9-vs-7
PREMISE-DEAD (D121 amended the law — the ceiling is about KIND, not count;
`UI-Architecture-and-Layout.md:189-208` documents all nine) · ambient CLEAR built
(`ambient-strip.tsx:167-184`, dated header) · tool-round wire capture built (`rpg.ts:1047-1053`
threads chatId; executor wires captureWire uniformly) · notification bell built BOTH halves
(mount-effect markAllRead + unread count in the sheet kicker) · snap-stage env propagates
(`snap-stage.ts:290-308` spreads process.env) · surface-manifest generator already biome-clean
(probed read-only) · biome hook cannot lint the excluded guard file ("Checked 0 files", probed) ·
paged-list `.find(` sweep CLEAN — no live instance of the DBANK-HOME bug class; chats.listChats is
NOT paged (the board's claim refuted); infinite-query surfaces resolve against the flattened
multi-page set · countByBook twin NEVER EXISTED (git -S: one introducing commit, one home ever) ·
names.ts header self-corrected 08-07 ("NAME FIRST, THEN SQUASH") · SSE-STARVATION-PIN exists at
unit tier (`debug/index.test.ts` header names it + `socket-registry.test.ts:289-306`) ·
`refEnumerationLines` active-conditions COVERED (`rpg.int.test.ts:972-1010` asserts the exact
line).

## ═══ SPECCED DESIGNS — pinned docs, build not (fully) sent ═══

> **Why this section exists (owner catch 2026-08-08):** the board rewrite absorbed the remaining-work
> LEDGER, which was built from OPEN board ROWS — a specced+pinned design DOC that never became a row
> could fall off. This section carries every `docs/design/*.md` that represents specced-but-unbuilt (or
> partial) work, so it can't be lost again. **NOT `docs/architecture/proposed/**`** — those are the
> separate parked-programs set (`proposed/INDEX.md` owns their status); leave them alone.
> **RECONCILED 2026-08-08** (scout `a43b158ec`, then **ORCHESTRATOR-RE-VERIFIED with ast-grep**
> ts+tsx, declared→exported→called-live ladders — not relayed). Headline: **the big one — parity-plus
> — has ALL 7 features BUILT** (F1 relationship called-live `actor-ops.ts:90`; F2 level `sheet.ts:35`;
> F3/4/5/7 `CONTENT_CLASS_POLICY`+`HIDDEN_TAGS`/`DIRECTIVE_FENCE_NAMES` consumed in strip/reminder/
> tokenizer; F6 plot exceeded). FIVE docs had ROTTED status lines claiming "nothing built" while the
> tree shows them shipped (spot-verified: `rpg_quests` tsx=0/folded, density gate present, list-pane in
> `main.tsx:241`, roster `cards.ts:57`). The 3 PARTIAL confirmed genuinely partial (openrouter
> signature ast-grep ts=13/tsx=0 = truly absent). Genuinely-open carried below; built struck.

**GENUINELY OPEN (specced, a real remainder — carry these):**

- **persona = character** (`persona-character-kind-substrate.md`) — UNBUILT, specced+pinned, **= C1**
  (awaits the 5-fork ruling; forge lane ready on the owner's word). The one that prompted this section.
- ~~user-macro W5 values-store~~ — **STRUCK 2026-08-08: FULLY BUILT** (see the W5 strike block in
  LIVE STATE — column/verb/turn-read/pane/portability all live; the F1 fork was ruled Arm A
  2026-07-27 at the spec's own foot). The spec's status line + this row were both rotted.
- **openrouter findings 5-7 — RULED 2026-08-08 (F5 lane LIVE · F6 skip · F7 defer).** The old
  "signature round-trip = latent hard-400 bug" framing was a board paraphrase error the doc's own
  §7 caveat refutes: we never replay reasoning (no `ChatContentPart` arm), DROP-IS-SAFE is measured,
  and reasoning STORAGE already exists per-message — the 400 lives only on a path we can't take.
  F7 re-probe arms (multi-hop drop / unsigned-400 / ST encrypted-rebuild) ride the F5 lane's harness
  run, record-only.
- **tracked-field unification + context-panel fidelity** (`tracked-field-unification.md` ·
  `context-panel-fidelity-findings.md`) — PARTIAL: stages 1+2 shipped (`ea99b0e3`,`98ee6da2`); both feed
  the SAME still-open **W-H side-eye lane** (needs a model-populated game) + EXT-4 (likely mostly closed
  — worth a second scout pass before boarding as work). = E4/E-adjacent (rendered lens, live window).
- **node-26 adoption program** (`node-26-adoption-program.md`) — mostly BUILT (W1-W5 live: `using`/
  `await using` in turn.ts/cas.ts/port.ts; the 4-arm platform-spellings gate); only remainder is the
  **Temporal/luxon swap (EXTERNAL blocker — Safari Temporal unshipped, deliberate deferral)** + §7
  explicitness smalls (low-urgency). Not a real queue item until the browser ships.

**BUILT — rotted status lines, struck (do NOT re-chase; receipts from the reconcile):**

- **parity-plus program** (`parity-plus-program-spec.md`) — the BIG one: **ALL 7 features BUILT**
  (declared+exported+live). 1-5,7: `RpgRelationship`/`setRelationship` `actor.ts:128,149,295` · `level`
  `rpg.ts:35` · `CONTENT_CLASS_POLICY` `content-classes.ts:44-51`; D110 "foundation-landed 2026-07-27".
  **§6 plot-progression CONFIRMED (orchestrator re-checked 2026-08-08 — the scout missed it: symbols
  home in `@orb/kit/guided`, not `domain/rpg`):** `RPG_PLOT_STEERS`/`RPG_PLOT_STEER_KINDS`
  (`kit/guided/index.ts:84,116` — **6 kinds vs the specced 5**, `advance` added), delivered via M5's
  guided-wand re-homing (`composer-utility-menu.tsx:199-211` `PlotSteersSubmenu` → `onSteer`), PLUS a
  structured act-rail plot DATA plane the marinara floor lacked (`plot-edit.ts`, `plot.acts`/`plot.act`
  - `plotProgression` host toggle). Only §12A macro-parity DEPTH un-probed (a "how thorough" question,
    not a gap — no evidence of missing machinery).
- **lite+guided substrate** (`lite-plus-guided-substrate-spec.md`) — BUILT (quests folded into
  `rpg_snapshots` JSON, `rpg_quests` deleted, journal variant-aware — `rpg.ts:170,13-18`).
- **density pass** (`density-pass-spec.md`) — BUILT (gate `density-tier.ts` minted + self-cites the
  spec + baseline generator + CT lens).
- **list-pane projection** (`list-pane-projection-proposal.md`) — BUILT `baea66933` (the doc's own
  "DRAFT/nothing built" line PREDATES the build by a day — `chats-with-character-pane.tsx:39` live).
- **default-character roster** (`default-character-roster.md`) — BUILT `bb6d50646` (10-card pack v2 in
  `character/seeder/cards.ts:80-575`).
- **preset-surface-redesign** (`preset-surface-redesign.md`) — BUILT (D121, five-view shell + setDefault).

## ═══ INITIATIVES — one-line status ═══

I-1 structured output **CLOSED** · I-2 databank **CLOSED** · I-3 config workspace **CLOSED** (C5
presets-into-rail owner-timed) · I-4 regex **CLOSED** (tail smalls → C-standing/D11) · I-5 brand
**CLOSED** (terminal ratchet) · I-6 portability **CLOSED** (D12 deferred family) · I-7
observability **CLOSED** · I-8 prose/nudge/persona — machinery BUILT, voice items = C2/C3/C4;
persona↔rpg linkage DO-NOT-BUILD (sacred) · I-9 ceremony **CLOSED** (ledger through D136) · I-10
launch-day = D5 · I-11 containerize-then-test — **build MERGED (A2)**; security review in flight;
owner live steps + pentest cage remain (the container IS the mitigation; test the clone, positive
controls both ways, security-executor only).

## ═══ WATCH LIST (flakes + pre-existing; none blocking) ═══

- `code-editor.ct` CM6 75ms completion flake under contention · `drawer.ct:162` focus-trap
  (pre-existing at HEAD) · `preset-editor-surface.ct:140` parallel-load flake (A/B-proven
  pre-existing) · `seed-demo-chats` cold-import contention (structurally fixed → SERIAL\_INT; watch
  it stays quiet) · `rpg-scene-tab.tsx` near the 450-line cap.

## ═══ ORCHESTRATOR QUICK-ONBOARD (load-bearing — keep) ═══

**Dispatch + lanes**

- `Agent {isolation:"worktree"}` — the hook owns creation (local HEAD + auto-install). Verify base =
  main HEAD post-dispatch. Briefs ALWAYS include: back-channel line (SendMessage mid-run) · scope
  fences vs siblings · `git -C` discipline · lane-unique scratch names · the explicit CT files the
  floor must run · re-verify-your-premise-first + a correct refusal is a SUCCESS · the WHY, and the
  hazards (every trap that bit was one no brief mentioned).
- Message live lanes by AGENT ID; verify the id↔lane mapping against dispatch results before every
  SendMessage. TaskStop an agent once its report merges; NEVER resume an agent whose worktree you
  removed. Warm-agent LEGS beat fresh spawns (cache economics).
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

Every lane seal, merge sha, verifier verdict, superseded ruling and session narrative this board
used to carry inline lives INTACT in:
[`docs/history/retro-workboard-2026-08-08.md`](history/retro-workboard-2026-08-08.md) (the
2026-08-07→08 era: identity build, PROSE-1, the graduation-law era, the absorbed remaining-work
ledger's full text) · [`retro-workboard-2026-08-07.md`](history/retro-workboard-2026-08-07.md) ·
[`retro-workboard-2026-08-03.md`](history/retro-workboard-2026-08-03.md) (the burn-down archeology)
· `git log docs/retro-workboard.md` for everything else. The dogfood campaign record:
[`docs/history/dogfood-tracking-2026-08-08.md`](history/dogfood-tracking-2026-08-08.md) (CLOSED).
