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
  `tests:node`; budget ~1 stale coupled fixture per value-changing lane
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

- **main `b7ca6d55a`**, ~165 ahead of origin, tree clean. **Gates 197.** Battery last green at
  `6494c540e` (night-seal); a FRESH battery is owed when the current train drains (docker + refinery
  + preset-followup are all value-changing).
- **Merged today, this train:** FORGE#4 CONTAINERIZE (`fd4ae9119`, consolidated check **PASS exit
  0** — read) · REFINERY R0 (`b7ca6d55a`, consolidated check RUNNING — read
  `<scratchpad>/refinery-merge-check.exit`).
- **LIVE lanes (3):** PRESET-FOLLOWUP (executor, worktree — see A3) · CONTAINERIZE §8 security
  review (security-executor, on main — see A2) · REFINERY R0 verifier (pre-R1 gate — see A1).
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
  cheap test adds (status CHECK never bitten; sessions-row cascade control). **R1 (domain/refinery,
  warm forge lane preferred) dispatches on the security pass's GO**, building its prescribed belts;
  R1 deletes the two pre-producer gate rows (design §7 — only the db-structure rider auto-flags,
  the SCHEMA_OWNERS row will NOT remind you). Owner already ruled BUILD F1-F5.
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
  rec: try cap_drop, CUDA may need IPC_LOCK) · profile coupling only pins `sibling` (availability
  not exposure). **FOLLOW-UP LEG (running):** spec truth-repair ×3 sites + the `superRefine`
  boot-fence (single-user+deny = boot-fatal, red-first) + 3 in-code comment repairs + the
  shim⇔`HOST_SECRET_ENV_KEYS` coupled-site tie. **OWNER after that:** fork — zero-config default
  usable-as-owner (shipped, spec-matching) vs deliberately-inert (stricter) · the live-infra steps
  — `docker build` both targets (+`docker inspect` the healthcheck), container runs,
  fleet-in-namespace, read-only shakeout, the pentest cage (§4/Fork F), deploy posture (C13).
- **A3 · PRESET-FOLLOWUP (executor, worktree).** B1 CapabilityGate→`resolve-failure.ts` (the
  inverted "routing problem" claim over a missing-credential failure) + B2 Prompt-view
  section-drill fork-eject (the FORGE#1 store-axis fix applied) + 2 verification CTs (readout
  skeleton-height == settled; error arm earns its cause + Retry refetches). ITEM-3 (snake_case
  `fires` gloss) **DECLINED per recorded ruling** — `contracts/preset/index.ts:1265-1267` states
  the wire name in `fires` IS the row→tool map, all eight tool rows; owner may override as a copy
  call (C-taste). Graduates on a verifier over B1's classification logic.
- **A4 · The preset/config side-eye train GRADUATED (2026-08-08):** FORGE#1 Actions IA + POLISH
  cluster + PROSE-GEOMETRY all **SHIP** under the batched rendered lens (`be00cf36a` ref-stage;
  delivery-truth readout, fork-eject picker, prose cap geometry all confirmed live). Their rows are
  closed; residue is A3's items.

### B · DISPATCHABLE NOW (no owner ruling needed)

- **B1 · Populate-round prose migration** (`docs/design/prose-1-populate-census.md`): 7 model-facing
  slot candidates (`POPULATE_SYSTEM_HEADER`, inline identity clause, `POPULATE_DOCTRINE`, 4
  `populateUserPrompt` labels) → `RPG_PROSE_SLOTS` rows + call-site swaps on the existing
  `rpgProse`/`spliceProseTokens` convention. PROSE-1 class already ruled. Rows 8-10 (host toasts)
  excluded. [live-verified 08-08]
- **B2 · `respell` derive-or-cite**: `DigestsParams`/`SegmentsParams` ≡ contracts
  `MemoryQueryOptions` (`domain/search/contract/params`) — cite-or-derive; the `MemoryBackfillCounts`
  twin is already gone. Tiny. [grep-sourced; re-verify at dispatch]
- **B3 · PORT-R6 residual fixture**: a ≥2-turn cross-link fixture (the "cannot cross-link two
  rpg-anchored turns" invariant is currently verified by reading, not by a runtime counterexample).
  One fixture add. [verifier-flagged, boarded]
- **B4 · Verify-then-strike pair**: the ledger carried `no-test-fabrication` baseline regen +
  `fork.ts:154-155` stale comment as open, but SMALLS-1 (`208abac21`) claims both landed
  ("fabrication baseline regen 81→70", "fork.ts comment LIVE w/ both SHAs"). One grep each; strike
  or dispatch. [board-contradiction found in the 08-08 full read]

### C · OWNER-DECISION (his word only; recommended arm marked)

**Persona / prose cluster**
- **C1 · persona = character** — OWNER-SACRED. Design:
  `docs/design/persona-character-kind-substrate.md` (5 forks §10). **Rec: Phase D now**
  (kind-polymorphic cast — `CAST_KINDS`+`CAST_KIND_POLICY`, no stored column), **then Phase C**
  (`@orb/contracts/card-face` 4-field substrate). Reading B is OFF THE TABLE (D122/D131 collision).
  Build lane mints **D137**; behavioral gate: `persona-resolution.suite.int.test.ts` byte-untouched.
- **C2 · `{{note}}` warn-vs-block** — `docs/design/note-token-intent-history.md`: warn-never-block
  was INHERITED, never decided. **Rec: Option C** — reclassify `{{note}}` as a CARRIER token that
  BLOCKS at write (join `FORMAT_STRING_CARRIER_TOKENS`, today only wiFormat/`{{entry}}` at
  `preset/index.ts:734`), keep cosmetic `{{name}}`/`{{names}}` as warns. [live-verified still warn]
- **C3 · Default-text veto pile** (ship-verbatim rec on all): the 3 nudge texts (`speakerTags` v1 ·
  `narratorNudge` v1 · `roundNudge` v2 — LIVE defaults today) + `chat.group.castMember`
  (`[Cast — {{name}}]`). **Rec: ship all verbatim**, no token added.
- **C4 · Narrator main-prompt marker contradicts itself** — once `{{char}}` binds the joined cast,
  the default marker renders "…write Charlotte, JFC's perspective only" (self-contradictory;
  `contracts/preset/index.ts:995`). PRESET-owned template, deliberately not fixed from the
  assembler. **Owner call: a mode-aware default marker, or a documented narrator-preset.**

**Config / portability cluster** (`docs/design/parked-options-config-port.md`)
- **C5 · Presets into the config rail** — **Rec: arm 4** (leave standalone; the "one array member"
  premise is false — folding needs 3 seam extensions; migrate properly when he feels it).
- **C6 · JSON-card export affordance** — **Rec: arm 1** — server arm SHIPPED (`?format=png|json`);
  add the PNG/JSON submenu to the character kebab mirroring the chat kebab. ~10 lines.
- **C7 · Landing-cards + "New book" duplication** — **Rec: arm 2 (split the class)** — fix the
  landing at the child level (each `CollectionLauncher` drops count+create once populated), KEEP the
  New-book double affordance (mock-ratified + CT-pinned).

**Tag / contract cluster** (`docs/design/parked-options-tag-contract.md`)
- **C8 · Guided-prompt cap** — **Rec: Option 2** — shared `MAX_INJECTION_TEMPLATE_LENGTH` (=10000)
  for BOTH formatStrings and `guidedActions.*.prompt` + UI maxLength. [live-verified:
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
- **C11 · Barrel amputation worklist** — root-fix LANDED (57→28 stars); HELD for a quiet tree: Tier
  A 85 per-symbol verdicts (delete / `@public` / header-cite; several RPG_* protected) + Tier B 50
  zero-risk drops. Then **C12 · `--include-entry-exports`** — **Rec: arm (c)**, enable AFTER the
  amputation (else it buries the 85 under entry-export noise).
- **C13 · Containerize deploy posture** (post-A2-review): `AUTH_FALLBACK=deny` for public
  multi-user · `OWNER_HANDLES`/`OWNER_GROUP` provisioning · image build + pentest-cage sequencing ·
  the env-schema `*_FILE` support fork (lane refused as out-of-scope — foundation surgery, his
  call).
- **C14 · Refinery F6/F7** — F6 auto-stamp rec: every analyze refreshes `characters.refinery`,
  `applyFields` auto-snapshots first · F7 retention rec: no caps v1. Low-stakes; fold into R1
  unless he objects.

**Standing owner items (genuinely open, unchanged)**
- DRAFT-TRUST server render-policy seam (architecture call) · VRAM-refusal live drill ·
  v3-transcripts-reach-new-installs-only heal · RV-13 branch-and-save game modes (READY TO SPEC —
  PROSE-1 landed) · unsent-draft reload persistence + the nav-away draft-discard design pass ·
  chars+chats one-glyph rail merge · trust-gated card images doorway (mechanism pinned: `src=`-routed
  card-frame doc with its own CSP) · **mid-session persona↔rpg linkage — OWNER-SACRED, ruled flavor
  recorded (persona-pin semantics), DO NOT BUILD** · `.env` OpenRouter key is INERT (no env
  fallback; decide: env fallback for the testing arm, or document UI-entry-once) · templating fork
  rows 53-73 (REWRITE_TOGGLES/GREETING_TRANSFORMS fragment bytes — client-composed via kit, a
  design fork) · **rail shows 9 facet icons vs the §14 seven-ceiling** (amend §14 or trim — doc-law
  vs tree divergence) · shell-tier CLS ~0.26 (F-14, three sightings, needs an owner look — pairs
  with E1) · home-tile promotion WHETHER (`docs/design/home-tile-promotion.md` — in-place chips may
  already cover it) · ctx-tab-strip label unreachable at coarse · REGPAR F3/F4/F5 menu · "Untitled
  chat" in regex rosters · X-16 edited-ago timestamp (contracts+db) · **taste (optional):** the
  eight tool-row `fires` glosses humanize-or-keep (recorded ruling says keep) · per-character
  speaker-tint override (the ThemeOverride door — optional, nothing asks for it) · Meteocons ·
  grimstone · chat-options placement (D111 clause).

### D · OLDER OPEN (small, real, re-verified where marked)

- **D1 · AMBIENT-NONE-AFFORDANCE** (S): `RPG_WEATHER_TYPES`/`TIME_OF_DAY` closed vocabs have no
  unset member — weather/timeOfDay can't be cleared (location/date can).
- **D2 · Tool-round wire-capture blindness**: the tool-round provider call has no `captureWire`
  sink — `update_scene` traffic never reaches `/api/_debug/wire/captures`. One sink closes it.
  [re-verify at dispatch]
- **D3 · Phone notification bell** (LOW): unread-indicator gap + the sheet never marks read
  (`notification-bell.tsx:155` mount-time markAllRead comment is FALSE — no useEffect).
- **D4 · Snap-isolated boot gap** (tooling): post-D135 an isolated stage can't boot without
  `OWNER_HANDLES`+`CREDENTIALS_KEY` in its env — snap-stage propagation fix.
- **D5 · LAUNCH-DAY trio** (parked to the day): REGIME-2 db-baseline re-point ·
  the two-switch migration-regime flip · h3/QUIC checklist (Caddy h3 + UDP 443).
- **D6 · Surface-manifest FORMAT ping-pong**: teach `gen-baseui-surface.ts` to emit biome-format.
  [not re-verified]
- **D7 · `.claude/hooks/biome-check.sh`** lints the guard file biome.json says to skip. [not
  re-verified]
- **D8 · Home `useOrder` follow-up** (from the S3 tile P2-f refusal — static order stands; a
  store-backed order is the proper arm if wanted).
- **D9 · CT-on-our-vite spike**: pnpm override `@playwright/experimental-ct-core>vite: ^8.1.2`;
  green = one vite; red = revert.
- **D10 · Engines fleet fix — live verification owed**: the next real `pnpm engines adopt` IS the
  test (one launcher exits promptly, no dupe on a healthy port, pidfile merges).
- **D11 · REGX2 deferred bulk PLACEMENT add/remove** — unblocks when `deriveRegexTierFlags` lifts
  into `@orb/kit/regex`.
- **D12 · automation_rules + global_variables portable family** (the 12th kind — own
  serde/verbs/descriptor/import-order/doors). Fork lineage (`parentChatId`) structurally does not
  travel. Deferred with corrected end conditions.
- **D13 · CPD 3 dup rows + TYPO 27 as-const tuples** — consolidate only when next IN the file
  (DRY-not-gospel).
- **D14 · WAKE-STATUS**: the 3s engine wake is silent; revisit only if laggy.
- **D15 · Recorded-no-action set** (kept so nobody re-derives): L8-inbound one-liner
  declined-by-scope · seeder drop-patch stays until the next fixture regen · `staging.ensure`
  dormant (`gather.ts:194` still `tools: []`) · per-chat connection `providerRouting` phantom
  (DORMANT/RESERVED by its own comment — feature row, not defect) · FillableIcon adoption targets
  are OPPORTUNITIES not rot · `lockdown` §16 G-table defers to live count.

### E · VERIFY / INVESTIGATE (report-then-decide)

- **E1 · prod-build CLS window** (`docs/design/prod-build-cls-investigation.md`): dev home-boot CLS
  0.134 + the shell-tier 0.26 sightings; run `pnpm stack up prod` (non-8788) and re-measure when a
  window opens.
- **E2 · PRESET-SLIDER-VERIFY** (S): re-verify the slider deck rendered on a vLLM/OR connection
  (sonnet-5 exposes no sampling knobs — the deck was never seen).
- **E3 · E2E_LIVE=1 pnpm e2e** on the push window (never re-confirmed this era).
- **E4 · narrowest-mount row gate candidate**: a `Row` with a `shrink-0` trailing cluster sized wide
  and never re-measured at its production width (the class behind both gap-audit P1s). Candidate:
  such a row owes a CT at its narrowest real mount asserting leading text ≥50%. Gate-shaped;
  ASTLENS-precedent report first.
- **E5 · Databank pagination live-drive**: pagination is BUILT (keyset + infinite-query,
  live-verified); DBANK-HOME proved reach via a contract STUB — drive a real >100-doc bank once.
- **E6 · Paged-list `.find(` tree sweep**: DBANK-HOME's lesson
  (\[\[paginating-a-list-breaks-resolve-by-find]]) — sweep OTHER keyset-paged surfaces
  (chats/notifications/characters) for resolve-by-find-over-a-page. Un-run.
- **E7 · `countByBook` twins**: REGROSTER flagged a 2-instance dup; today ONE home
  (`world-info/persistence/queries.ts:81`). Already dissolved or respelled — look before acting.
- **E8 · `names.ts:2` header vs `shape.ts:213`** (stamp applied before vs after squash) — verify
  GAP-FIX's doc leg landed it; repair in-commit if not.
- **E9 · fillRule=evenodd fillable-set probe** (owner-optional, needs a side-eye gallery verdict).
- **E10 · Low-priority unverified tail**: ARCHIVE2's six unreached side-eye items ·
  `refEnumerationLines` active-conditions coverage · SM7 second `response_format` builder residue
  (path restructured — re-locate) · SSE-STARVATION-PIN (two-method absence check never run) ·
  whether NIGHTFIX's three argued refusals are settled with the OWNER or only the reviewer · the
  engine auto-sleep/wake live pass + VRAM drill dependency.

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
  pre-existing) · `seed-demo-chats` cold-import contention (structurally fixed → SERIAL_INT; watch
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

- `pnpm check` = STATIC (~90-220s). `pnpm verify --push` = static + `tests:node` (vitest+CT, ONE
  behavioral lane) + e2e-smoke + cpd + parity (~16min; setsid-detach + `.exit` file, READ it).
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

- Batch pending forks ~4 at a time via the question tool, recommendations marked; he answers fast
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
