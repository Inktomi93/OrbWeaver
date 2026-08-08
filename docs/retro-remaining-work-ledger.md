---
kind: ledger
status: authoritative "what's left" — reconciled against the tree 2026-08-08
supersedes-for-status: the scattered OPEN rows in docs/retro-workboard.md
updated: 2026-08-08
---

# Retro — remaining-work ledger (the single "what's left")

**What this is.** One deduped, ranked, re-verified list of everything that still reads as open across
`docs/retro-workboard.md` (2,272 lines), the four `docs/design/parked-options-*.md` decision docs, the
gap-audit, and the standing owner items — with each item's board/doc SOURCE and a LIVE or STALE receipt.
The board's measured stale rate on grep-sourced rows is ~50%, so **every item below was re-checked against
the current tree** (`main` @ `16ef01478`); I did not trust a row's own status.

**The headline reconciliations this pass produced** (read these first — the scattered board contradicts
itself on all four):

1. **AUTHFIX-2 is CLOSED, not open.** The board's big "AN OPEN UNAUTHENTICATED HOLE" section
   (`retro-workboard.md:355-392`) is STALE — superseded by DEBUGGATE, which graduated (`:173-185`).
   Verified live: `foundation/observability/debug/routes.ts:142-149` now carries an AUTHFIX-2 marker and
   the middleware gates on `DEBUG_GATE_CREDENTIALED[principal.via]` (`entry/auth/seam.ts:264,325`);
   `via:"fallback"` maps to `false`, so `/api/_debug/*` no longer 200s to an un-credentialed caller in any
   mode. Only the two OWNER OPS remain (rotate `DEBUG_TOKEN`, set `IP_ALLOWLIST`). **See F1.**
2. **Databank pagination is BUILT** (server + client), not the open ceiling the board's "new boarded row"
   (`:934-937`, `:721-722`) describes. Verified: keyset cursor in `databank/verbs/list.ts:25-36` +
   `contract/params.ts:75-78` + `results.ts:26-32`; client infinite-query `getNextPageParam:
   lastPage.nextCursor` at `databank-library-surface.tsx:82`, "100+" honesty at `databank-model.ts:243`.
   Only a **live-drive >100-doc verification** is owed. **See E5 + F2.**
3. **I-2 DATABANK is CLOSED** (S1+S2+S3 all merged, `88508bb6e` + fixes). The `### I-2` header still says
   "S3 unbuilt" (`:1239`) — STALE. **See F3.**
4. **capability-gate wiring is genuinely OPEN.** Verified: `features/preset/components/capability-gate.tsx`
   still hardcodes "This is a routing problem, not a missing connection" (~:66) and does NOT import the
   shared classifier; `resolve-failure.ts` exists and owns the discrimination. **See B1.**

Ranking is by consequence within each category. Coverage limits are stated at the foot.

---

## A. IN-FLIGHT (lanes running now — reconcile at their merges)

Confirmed live: worktrees `agent-forge-docker` and `agent-refinery-r0` present in `git worktree list`;
neither deliverable has landed on the tree yet.

- **A1 · REFINERY R0** (forge, worktree `agent-refinery-r0`). Contracts+db foundation: F1 new
  `domain/refinery` · F3 fixed payloads · F4 stage-mode enums · F5 card-fields v1; verify the pre-built
  scaffold, add only what's missing, DB baseline squash. **Receipt it's real:** no `packages/server/src/
  domain/refinery/` and no `packages/contracts/src/refinery/` dir exist yet. **Security-executor pass is
  MANDATORY pre-R1** (untrusted card → LLM → write-back); R1+ waits on R0's review. Design:
  `docs/reviews/stickler/2026-08-08-card-refinery-port-study.md` + `-nl-schema-design.md`. Owner already
  RULED the build with F1-F5 (`:694-698`).
- **A2 · FORGE #4 — containerize BUILD** (forge, worktree `agent-forge-docker`, on top of the landed
  research `a7c550e3e`). Prod Dockerfile(s) + docker-compose + `.dockerignore` against
  `docs/design/containerize-prod-image-spec.md` (2-profile) + the research, PLUS the profile-2 code changes
  (`VLLM_ENGINE_HOST` at engine-url.ts + egress.ts, GPU-detect-under-posture). **Receipt:** only
  `.devcontainer/Dockerfile` exists on the tree. **Then:** security-executor reviews §8 (secrets, auth-mode
  env, `AUTH_FALLBACK=deny`, the Host-mint control) before done; the image build+cage is the OWNER's live
  step (a lane cannot `docker build` the GPU image in a worktree). Board: `:614-625`.
- **A3 · Preset/config batched side-eye** (`a528c629d6a4aa017`). The deferred rendered lens over FORGE#1
  (Actions-tab IA) + POLISH-CLUSTER + PROSE-GEOMETRY preset/config surfaces. Board: `:71-92`, `:563-583`.
  **This gates B1/B2 (queued behind it to avoid surface collision) AND the conditional push word.**

---

## B. DISPATCHABLE NOW (buildable, no owner ruling needed)

- **B1 · Wire CapabilityGate → `resolve-failure.ts`** (board `:553-558`). **LIVE-VERIFIED OPEN:**
  `capability-gate.tsx:~66` hardcodes "This is a routing problem, not a missing connection", but
  `resolveChatCapability` can fail `PRECONDITION_FAILED` (`DomainNoCredentialError` = literally a missing
  credential — the claim INVERTED), `NOT_FOUND`, or 500. The shared classifier
  (`features/preset/lib/resolve-failure.ts`) already owns the discrimination and is consumed by
  `readout-parts.tsx`. ~3-line change. **Queued behind A3** (same preset surface).
- **B2 · Prompt-view section-drill fork-eject** (FORGE#1 finding (b), board `:582-583`). The Prompt view's
  section drill has the SAME local-drill-state fork-eject class the Actions-tab store-axis fix already
  solved; apply the store-axis fix. **Queued behind A3.**
- **B3 · Populate-round prose migration** (`docs/design/prose-1-populate-census.md`). 7 model-facing slot
  candidates (`POPULATE_SYSTEM_HEADER`, the inline identity clause, `POPULATE_DOCTRINE`, 4 `populateUserPrompt`
  labels) still hardcoded; all follow the existing `rpgProse(...)`/`spliceProseTokens` convention — new
  `RPG_PROSE_SLOTS` rows + call-site swaps, no new machinery. PROSE-1 class already ruled
  (`prose-is-user-editable`). Rows 8-10 (host toasts) correctly excluded.
- **B4 · `respell` derive-or-cite** (SMALLS, board `:1536`). `DigestsParams`/`SegmentsParams` ≡ contracts
  `MemoryQueryOptions` — a cite-or-derive cleanup (its `MemoryBackfillCounts` twin is already gone). Tiny.
- **B5 · `no-test-fabrication.baseline.json` regen** (board `:1132`). Stale ~15 rows (deleted files,
  absorbed shrinks). One-line shrink-only cleanup; belongs to whoever owns the tree.
- **B6 · `fork.ts:154-155` stale comment** (board `:1134`). "no production writer yet" is false since
  `c197ce01b` landed the host-plane-strip writers. Comment-only truth-repair; the strip itself is correct
  and PROVGATE passes it.

---

## C. OWNER-DECISION (needs his ruling — recommended arm from the options doc)

### Persona / prose cluster
- **C1 · persona = character** — OWNER-SACRED. Design: `docs/design/persona-character-kind-substrate.md`
  (5 forks in §10). **Rec: Phase D now** (kind-polymorphic cast producer — `CAST_KINDS`+`CAST_KIND_POLICY`,
  no table, no pin-layer moves), **then Phase C** (4-field card-face substrate `@orb/contracts/card-face`,
  shape-only). Reading B (persona-as-character-with-a-flag) is OFF THE TABLE (collides with D122/D131).
  Fork-by-fork recs: (1) Phase C after D, before agent-principal; (2) home = contracts; (3) 4-field
  overlap only, not full-card; (4) NO character-arm description in the cast entry; (5) build lane mints
  D137. Behavioral gate: `persona-resolution.suite.int.test.ts` byte-untouched. Parked-options
  `parked-options-persona-prose.md` §1.
- **C2 · `{{note}}` warn-vs-block** — `docs/design/note-token-intent-history.md` +
  `parked-options-persona-prose.md` §3. **Rec: Option C** — reclassify `{{note}}` as a CARRIER token that
  BLOCKS at write (join `FORMAT_STRING_CARRIER_TOKENS`), keeping cosmetic `{{name}}`/`{{names}}` as warns.
  Intent archaeology: warn-never-block was a mechanical inheritance, never a decision about `{{note}}`
  specifically; the `{{entry}}` carrier-block ruling (2026-08-02) drew its line while the note frames were
  still prose slots. **LIVE-VERIFIED still warn:** `FORMAT_STRING_CARRIER_TOKENS` (`preset/index.ts:734`)
  is still only `wiFormat`/`{{entry}}`; the note frames carry `caps:[{kind:"tokens",tokens:["{{note}}"]}]`
  (`:935`). Reverses a recorded posture — owner rules the fork.
- **C3 · The 3 nudge default TEXTS** (owner veto; `parked-options-persona-prose.md` §2, board `:1443`,
  standing #2). **Rec: ship all three verbatim** (`speakerTags` v1 · `narratorNudge` v1 · `roundNudge` v2),
  and do NOT add a token to `speakerTags`. They are already version-bumped and read as clean model
  instructions. LIVE (defaults, so every unedited room ships these bytes today).

### Config-rail / portability cluster (`parked-options-config-port.md`)
- **C4 · Presets into the config rail** (owner-timed; §1, standing #4, board `:1256`). **Rec: arm 4** —
  leave presets standalone, KILL the false "one array member" premise (verified: presets is already its
  own top-level rail section, not a config collection; folding needs 3 seam extensions), migrate properly
  as a scoped seam job when the owner feels it.
- **C5 · JSON-card export affordance** (§3, standing #8, I-6). **Rec: arm 1** — the server arm shipped
  (`?format=png|json`, verified `export.ts` + `export-character.ts`); add a PNG/JSON submenu to the
  character kebab mirroring the chat kebab. ~10 lines. Pure "surface a built capability."
- **C6 · Landing-cards + "New book" duplication** (§2, board `:699` owner DEFERRED). **Rec: arm 2 (split
  the class)** — fix the landing at the child level (each `CollectionLauncher` drops count+create once
  populated, keeps the blurb), KEEP the New-book double affordance (mock-ratified + CT-pinned + owner-drawn).

### Tag taste-calls + contract cap (`parked-options-tag-contract.md`)
- **C7 · guided-prompt contract cap** (§2, board `:628-633`). **Rec: Option 2** — introduce shared
  `MAX_INJECTION_TEMPLATE_LENGTH` (=10000) referenced by BOTH `formatStrings` and `guidedActions.*.prompt`,
  plus wire the UI `maxLength`. **LIVE-VERIFIED still open:** `guidedActionConfigSchema.prompt` is
  `z.string()` uncapped (`preset/index.ts:337`), reaches DB + model wire unbounded; no
  `MAX_INJECTION_TEMPLATE_LENGTH` constant exists. The lone uncapped authored-text field in the contract.
- **C8 · Four tag taste-calls** (§1). Recs: **1a** tag-only backup button → **SKIP** (bundle already
  carries `tags.json`); **1b** import Ask/All/Existing/None → **KEEP ours** (durable queue is strictly more
  capable); **1c** retire manual/`sortOrder` → **KEEP** (owner-ruled `tag-sort.ts:9-10`; reversible middle
  = drop the mode, keep the column); **1d** folder OPEN vs CLOSED → **build OPEN, defer CLOSED** (else drop
  the write-only `folderType`).

### Ops / posture cluster (`parked-options-ops-posture.md`)
- **C9 · AGENT-1** (standing #7, board `:1824`). **Rec: SPLIT.** The credential is an OWNER ACTION
  (re-auth Claude Max OAuth on the host — the refresh code is correct and fails safe; `host-token.ts:85-87`).
  Arms 1-3 (knob honesty, reasoning-visibility parity, usage/context parity) are a **buildable lane that
  does NOT need the credential** (unit/CT against recorded wire shapes + the OpenRouter arm). Only arm 4
  (live rpg-lite loop on the SDK wire) is credential-blocked. Surface to owner: "three of these don't wait
  on your OAuth."
- **C10 · `--include-entry-exports`** (knip whole-repo posture; §2 + `barrel-star-reexport-residue.md`).
  **Rec: arm (c)** — enable AFTER the barrel amputation lands (else it buries the 85 Tier-A findings under
  every legitimate entry export). Keep the 2 sanctioned db-schema stars via `/** @public */`.
- **C11 · Barrel amputation worklist** (the 135-name follow-up; `barrel-star-reexport-residue.md` §4,
  board `:668`, `:1775`). The root-fix conversion LANDED (57→28 stars); what's HELD for a quiet tree is the
  per-symbol amputation: **Tier A 85** (dead once the barrel line drops — each needs delete / `@public` /
  header-cite; several are RPG_* shape-data protected by module law) + **Tier B 50** (surplus barrel line
  only, zero-risk drop). Owner-timed / needs a drained tree.

### Refinery / containerize residual forks
- **C12 · Refinery F6/F7** (port-study §6). F1-F5 already ruled. **F6 auto-stamp** rec: every analyze
  refreshes `characters.refinery`, `applyFields` auto-snapshots first, prose baselines owner-signed.
  **F7 retention** rec: no caps v1. Low-stakes — fold into R0/R1 unless owner objects.
- **C13 · Containerize deploy decisions** (spec §7 forks + §8). Mostly folded into A2, but the deploy-time
  posture is owner's: `AUTH_FALLBACK=deny` default for public multi-user, `OWNER_HANDLES`/`OWNER_GROUP`
  provisioning, and the live image-build + pentest-cage sequencing.

### Standing owner items still genuinely open (his word only)
- **C14** DRAFT-TRUST server render-policy seam (standing #6, architecture call) · **VRAM-refusal drill**
  live arm (#11) · **v3-transcripts-reach-new-installs-only** heal (#12) · **RV-13 branch-and-save game
  modes** — ready to spec now that PROSE-1 landed (#13) · **unsent-draft reload persistence** fork (#14) ·
  **chars+chats one-glyph rail merge** — owner-timed (#15) · **trust-gated card images doorway** — design
  fork, owner-timed (board `:1594-1599`) · **mid-session persona↔rpg-state linkage** — OWNER-SACRED,
  ruled-flavor recorded, DO NOT BUILD (I-8, `:1446-1452`) · Meteocons/grimstone/chat-options-placement
  taste tail (#18).

---

## D. OLDER OPEN (archaeology / forgotten — re-verify CONFIRMED still real)

- **D1 · AMBIENT-NONE-AFFORDANCE** (S; board `:1829`). `RPG_WEATHER_TYPES`/`TIME_OF_DAY` are closed vocabs
  with no "none"/unset member, so weather+timeOfDay can't be cleared (location/date are free text and can).
  The UI gap behind the unreachable compact ambient arm. Still real per the board's own description; small.
- **D2 · Tool-round wire-capture blindness** (DOG-ENGINE find; board `:1584-1585`). The tool-round provider
  call has no `captureWire` sink, so `update_scene` traffic never reaches `/api/_debug/wire/captures`. One
  sink at the tool-round call site closes it. (Verify against the tree before building — see E7.)
- **D3 · CPD opportunistic dup rows** (board `:1555`) · **TYPO class-A 27 as-const tuples** (`:1557`) —
  consolidate only when next IN the file; no dedicated lane (DRY-not-gospel). Low.
- **D4 · WAKE-STATUS** (`:1565`) — the 3s engine wake is silent; revisit only if it feels laggy. Watch.
- **D5 · LAUNCH-DAY (I-10, `:1514-1524`)** — three day-of items, none actionable until launch:
  the **REGIME-2 db-baseline landmine** (`structure:db-baseline` must be re-pointed at the applied chain or
  it reds every incremental) · the **two-switch migration-regime flip** · the **h3/QUIC checklist**
  (Caddy h3 + UDP 443 open). Keep parked to the day.
- **D6 · Surface-manifest FORMAT ping-pong** (board `:1583`) — teach `gen-baseui-surface.ts` to emit
  biome-format so a regen can't fight the formatter. Small tooling. (Not re-verified live — see limits.)
- **D7 · `.claude/hooks/biome-check.sh`** lints the guard file `biome.json` says to skip (board `:1580`).
  Own small. (Not re-verified live.)

Note: the ARCHIVE-RESCUED "BOARD THESE" list is mostly struck (see F). The survivors that are genuine
open work — PRESET-SLIDER-VERIFY, fillRule-evenodd probe, narrowest-mount gate, E2E_LIVE — are
verification/report-then-decide items and live in **E**, not here.

---

## E. VERIFY / INVESTIGATE (report-then-decide, not a build)

- **E1 · prod-build CLS window** (`docs/design/prod-build-cls-investigation.md`). Dev home-boot CLS 0.134
  (>0.1) stands; the prod launcher EXISTS but :8788 is held by the live dev stack. Cold-dev-module-graph
  is the leading unconfirmed suspect. Run `pnpm stack up prod` (staged client build, non-8788 PORT) and
  re-measure when a window opens.
- **E2 · PRESET-SLIDER-VERIFY** (S; board `:1677`). The preset program closed without re-verifying the
  slider deck on a vLLM/OR connection (sonnet-5 exposes no sampling knobs, so the deck was never seen
  rendered). Its own crunch list demanded it.
- **E3 · E2E_LIVE=1 pnpm e2e** owed on a push window (board `:1574`) — never re-confirmed since the era's
  start. Also flagged on every push window in the compact snapshot.
- **E4 · narrowest-mount row gate candidate** (side-eye 08-08; board `:1600-1604`). The class behind both
  gap-audit P1s: a `Row` with a `shrink-0` trailing cluster sized wide and never re-measured at its
  production width (persona row 358px, theme band 256px, ...). Candidate rule: such a row owes a CT at its
  narrowest real mount asserting the leading text block ≥50%. Gate-shaped; report-then-decide (ASTLENS
  precedent).
- **E5 · Databank pagination live-drive** (board `:634-636`). Pagination is BUILT (F2); DBANK-HOME proved
  reach+geometry via a keyset-contract STUB, not a live SQL keyset under a real shell with a >100-doc bank.
  Cheap verification-completeness add.
- **E6 · fillRule=evenodd fillable-set probe** (S; board `:1821`). The one live icon-seal candidate —
  probe whether `evenodd` usefully grows the fillable icon set; needs a side-eye gallery verdict.
  Owner-optional, not debt.
- **E7 · `countByBook` twins** (UNKNOWABLE; board `:2011-2014`). REGROSTER flagged a 2-instance dup; today
  the symbol has exactly one home (`world-info/persistence/queries.ts:81`). Either already dissolved or
  under a different spelling — needs a look before anyone acts.
- **E8 · `names.ts:2` header vs code** (gap-audit #6). Header says the name-stamp is "Applied AFTER
  squash"; `shape.ts:213` applies it before. A Documentation-Law §1 doc-truth defect — verify a later
  assembly lane didn't touch the header, then repair in-commit. Low.

---

## F. STRUCK AS DONE / STALE (re-verify found these already closed — do NOT re-chase)

- **F1 · AUTHFIX-2 (the "open unauthenticated hole")** — CLOSED. `retro-workboard.md:355-392` is superseded
  by DEBUGGATE's graduation (`:173-185`). Live receipt: `debug/routes.ts:142-149` + `seam.ts:264,325`
  gate on `DEBUG_GATE_CREDENTIALED[principal.via]`, `via:"fallback"` = false. **Residual = OWNER OPS only:**
  rotate `DEBUG_TOKEN`, set `IP_ALLOWLIST` (still unset with `WIRE_CAPTURE=on`).
- **F2 · Databank pagination (the 100-doc ceiling BUILD)** — BUILT server+client (keyset cursor +
  infinite-query + "100+" honesty; receipts in the headline). Only the live-drive verify (E5) remains.
- **F3 · I-2 DATABANK S3 / "S3 unbuilt"** (`:1239` header) — CLOSED. S1+S2+S3 merged (`88508bb6e` + fixes);
  board itself says "I-2 CLOSED" at `:711`, `:906`.
- **F4 · pointer-coarse-in-features gate** (`:466-473`) — MINTED as `no-pointer-variants-in-features` by
  PTRGATE (194→195, `:235`, `:477`).
- **F5 · run-coverage.ts widgets bug** (`:489`) — FIXED (`20b883e3e`, `:519`).
- **F6 · DOCLAW-RPG-REFS** (`:1832`) — the carve-out is already in `Documentation-Law.md:114` (`:1114`).
- **F7 · MACRO-CAST-GUIDES** (`:1835`) — already threaded at `rpg/chat-ops/macro-view.ts:144-150` (`:1121`).
- **F8 · ZOD-STAGE-D** (`:1826`) — all three legs landed (`:1118`).
- **F9 · IMPORT-SETTINGS-WRITE-GUARD** (`:1847`) — PREMISE-DEAD (routing fenced out of
  `SHARE_SAFE_SETTINGS_NAMESPACES`; no import can carry it) (`:1096`, `:1540`).
- **F10 · tsx-shedding migration** (`:1776`) — DONE 2026-08-03, all four stages.
- **F11 · CRUNCH (a) hardcoded injection note-framings + (b) two templating systems** (`:1610-1621`) —
  (a) the note frames are now PROSE-1 slots (`chat.injection.systemNote`/`userNote`); (b) the (b)
  unification is COMPLETE (`:1082`, `:1101`).
- **F12 · st-goldens re-sweep / STATLAS leg 2** (`:1608`) — LANDED (`56af5ea2e`).
- **F13 · The 17 `.mjs` probes → `.ts`** + **node-26 §8 gate** (`:1578`) — DONE (PROBES-TYPING `56ae7f493`;
  NODE26-GATE `5d65bd961`).
- **F14 · Already-struck on the board (recorded so nobody reopens):** REGX2 (`:1724`) · square-glyph Button
  sweep (`:1528`, `:1802`) · icon-seal doorways (BUILD-NONE, `:1811`) · SUMMARIZE-SUB drop (`:452`) · I-5
  brand burn-down (`:1366`) · I-6 portability R6 (`:1384`) · I-7 observability (`:1417`) · per-actor
  tracker grant/revoke editor (`:1530`) · readout-parts pending-flash (`:1532`) · CapabilityGate PENDING
  arm (`:1534`, distinct from B1's wrong-cause copy) · field-reachability `.ok` (`:1546`) · R5b(a) verify
  (`:1563`) · CONTRACTS-BARREL / CODEMOD-DOCS / CODEMOD-PATHMAP / SSE-SPEC-STATUS / PROMPT_MACROS phantom /
  EMBER-VOCAB / WORKLOADS-LABEL (all premise-false, `:1739-1846`) · L8-INBOUND (`:1753`) · HAND-EDIT-VS-FLUSH
  (`:1726`) · STRUCTURED-ABORT-REASON-LEAK (`:1705`) · RPG-ROUND-SIGNAL (`:1725`) · INFRA-WARN-DEAF
  (`:1689`) · I-1 structured-output last item (RULED keep-default, `:1162`).

---

## Coverage limits (what I did and did NOT fully re-verify)

- **Live-verified against the tree (highest confidence):** AUTHFIX-2/debug gate, databank pagination
  (server+client), capability-gate wrong-cause copy + `resolve-failure.ts`, guided-prompt cap, `{{note}}`
  carrier set, refinery/containerize in-flight status, the two live worktrees, recent git log.
- **Classified from the board's own strike-throughs + a spot read, NOT independently re-run:** most of F6-F14.
  The board struck these with commit receipts; I confirmed the receipts exist in the log where cheap but did
  not re-derive each. If any is load-bearing, re-grep before acting.
- **NOT re-verified live (accepted at board-face, flagged in-line):** D6, D7, the exact current state of
  several one-line SMALLS, and REGEX-REASONING-FIDELITY / RULED-BATCH landings (board says dispatched; I did
  not confirm the merge). These are low-consequence.
- **The gap-audit's own residual** stands: a follow-up flagged ONLY mid-transcript via SendMessage (never
  restated in a final report) is the one class neither the audit nor this ledger would catch.
- I did **not** re-drive any live UI, run any battery, or read every one of the ~2,272 board lines
  word-for-word — I read the STATE blocks, all initiatives (I-1..I-11), SMALLS/TAIL, ARCHIVE-RESCUED,
  BOARD-THESE (both passes), standing owner items, and the four decision docs in full, and sampled the
  history-archive pointers. A row not surfaced here is either struck on the board, or fell in a section I
  read but judged closed; the four decision docs + this ledger are now the precise "what's left."
