---
kind: review
status: active
updated: 2026-08-03
---

# Archive rescue audit — unresolved obligations left behind in `docs/history/**`

> **Charge (owner, 2026-08-03):** *"if it needs follow up it goes on the board, otherwise it gets
> forgotten."* The prior rescue used a grep for ONE phrase (`FOLLOW-UPS named not built`). This pass
> READ all 25 documents that entered `docs/history/` since 2026-07-23, line by line, and verified every
> candidate against TODAY'S tree.
>
> **Method:** full reads first; `/usr/bin/grep -a --exclude-dir=node_modules` + file reads to verify.
> Existence was never accepted as evidence — every DONE-SINCE row cites the mechanism (a symbol, a
> predicate, a consumer count, a deleted file), not a path.

## Headline

**The archive is much cleaner than feared.** 22 of the 25 documents yielded ZERO still-open rows; the
overwhelming majority of every review's findings were built in the 07-25→08-03 burn-down. **Ten rows
are genuinely STILL OPEN**, and most are S-sized. Three of the orchestrator's five "already rescued"
items are **wrong** — see the corrections block.

---

## ⚠ CORRECTIONS to the already-rescued set

| Rescued claim | Verdict | Evidence |
|---|---|---|
| **S6 SEAL not done — `SETTINGS_SECTION_ANCHORS` = 2 live refs** | **WRONG — DONE.** Both "refs" are COMMENTS documenting the retirement | `packages/client/src/state/shell-store.ts:79` *"The old `SETTINGS_SECTION_ANCHORS` subset tuple retired with stage 0"* · `settings-pane-registry.ts:105` same. Zero declarations, zero consumers. **Strike this board row.** |
| **icon fill-axis adoption — measured ZERO client consumers** | **WRONG/STALE — two live consumers** | `FillableIcon` consumed at `packages/client/src/features/preset/components/preset-library-row.tsx` (the O-1 active dot) and `packages/client/src/components/row-toggle-action.tsx`. The seal is adopted where it was ruled to be. **Downgrade to "further adoption is taste, not debt."** |
| **MAC macro-union gap — PREMISE DIED (`withUserMacros` has 18 refs)** | **Right outcome, wrong label: DONE SINCE, not premise-died** | `withUserMacros` is consumed by 7 modules incl. `preset-macro-suggestions.tsx`, `user-macros-tab.tsx`, `rpg-game-macros.tsx`, `user-macro-editor-dialog.tsx`, `use-prompt-macro-suggestions.ts`. The union was BUILT (lane MACU, `95f4c00b`). |
| **`PROMPT_MACROS` phantom in a parked spec** | **CONFIRMED STILL OPEN** | `docs/architecture/proposed/world-state-clips-trackers-spec.md:267` still names the deleted `PROMPT_MACROS`. One-line repair. |
| **Barrel root-fix sweep — 60 `export *` today vs ~27 estimate** | **CONFIRMED STILL OPEN; count is 56** | `/usr/bin/grep -rn "^export \* from" packages/*/src --include=*.ts \| wc -l` → **56**. (`@orb/db`'s root barrel WAS fixed by lane DBG, 47 files repointed; the residue is the other packages.) |

---

## Findings by source document

### `docs/history/reviews/stickler/2026-07-24-wire-capture-bridge-custom-params.md`

| # | Finding | Class | Evidence | Target | Size |
|---|---|---|---|---|---|
| WC-1 | F1 — OR capture records SDK input, not the wire; doc claims wrong | **DONE SINCE** | doc sites corrected; `mergeCustomParameters` is GONE from the tree (0 hits repo-wide) — the removal blueprint landed | — | — |
| WC-2 | F2 — stateless captures carry `chatId: undefined`; the `?chatId=` debug filter can never match | **DONE SINCE** | `entry/compose/chat.ts:456-458` now sets `chatId: req.chatId` with the comment *"Carried so the wire-capture sink keys the recorded body by chat (the debug endpoint's `chatId`…)"* | — | — |
| WC-3 | F3 — user `providerRouting` never reaches the OR wire; the comment lied | **DONE SINCE (comment) / accepted-deferred (feature)** | `domain/connection/verbs/resolve-chat.ts:9-13` now reads *"It is DORMANT/RESERVED … the middle hop … is intentionally NOT wired (no writer verb, no UI). This verb drops it today; wiring it is a deferred feature, not an accident."* The lie is gone; the capability is a cited dormant doorway | — | — |
| WC-4 | F4 — custom-byo capture can retain body-borne credentials | **DONE SINCE** | `backends/custom-byo/runners/chat.ts:481-484` — `scrubCapturedBody(body, cred)` with the exact rationale the finding named | — | — |
| **WC-5** | **Removal blueprint step 4: emit a `custom_parameters_dropped` warning when an OR request carries `customParameters`** | **STILL OPEN** | `/usr/bin/grep -rn "custom_parameters_dropped" packages` → **zero hits**. `WARNING_CODES` has no such member. Today a BYO-style preset pointed at OpenRouter silently loses its blob | new `WARNING_CODES` member + emit site in both OR runners (`chat-completions.ts`, `responses.ts`) | **S** |

### `docs/history/reviews/stickler/2026-07-25-contracts-layer-audit.md`

| # | Finding | Class | Evidence | Target | Size |
|---|---|---|---|---|---|
| CA-1 | F1 — purged-domain comment drift (agents/crew/rpg/poses) | **DONE SINCE** | Lane TRUTH (`fe46f9df`) + GRAD (`23078849`) + CERD swept the corpus and the D-ledger; D60 carries its build-state rider | — | — |
| CA-2 | F2 — unminted D-citations (D80/85/86/91/99) + gate rec **G1** | **DONE SINCE** | `scripts/check/gates/d-citation-integrity.ts` exists and is registered | — | — |
| CA-3 | F3 — trigger tuples not `satisfies`-pinned to their source unions | **DONE SINCE** | `contracts/src/automation/index.ts:39` `] as const satisfies readonly ChatBusEvent["type"][]`; `:47` `satisfies readonly DomainEventType[]` | — | — |
| CA-4 | F4 — axis re-spells + gate rec **G2** (`MIN_MEMBERS=3`, `AsExpression` blind spots) | **DONE SINCE** | `no-inline-union-redecl.ts:122` `Node.isSatisfiesExpression` unwrap; `:24` `TUPLE_MIN_MEMBERS_HOMED = 2`; `NOTIFICATION_RECIPIENTS` minted at `contracts/src/notifications/index.ts:28` and consumed by automation. Residual: `infra/plugin-host/membrane.ts:453` still compares the raw `"all_members"` literal (membrane boundary — arguably correct) | — | — |
| CA-5 | F5 — `contracts/src/chat/index.ts` is a 1,475-line god-file | **DONE SINCE** | split into 13 files; `chat/index.ts` is now 209 lines (front door) | — | — |
| CA-6 | F6 — `DEFAULT_BLUR_SURFACES` dead + contradicts the real default | **DONE SINCE** | `settings/index.ts:782-783` — the schema now `.catch([...DEFAULT_BLUR_SURFACES]).default([...DEFAULT_BLUR_SURFACES])`; the constant is live and the contradiction is gone | — | — |
| CA-7 | F7 — orphan `google_vertex` metadata arm | **DONE SINCE** | zero hits repo-wide | — | — |
| CA-8 | F8 — orphan contract exports w/ lying consumer comments | **DONE SINCE** | lanes CLEAN (`de36d51a`) + LENS (`09822fe3`) — the whole tree collapses to 1 tagged orphan under `deps:orphan-ratchet` | — | — |
| CA-9 | F9 — sibling deep contract imports + gate rec **G3** | **DONE SINCE** | one residual (`domain/rpg/contract/service.ts:53` → `"../../chat"`) and that IS the front door, not an internal | — | — |
| **CA-10** | **F10 — `packages/contracts/src/index.ts` is a 1-line placeholder with zero importers and a stale promise comment** | **STILL OPEN** | file body verbatim: `// @orb/contracts — public barrel (placeholder; re-exports added as modules land)` — 41+ modules landed, none re-exported, nothing imports bare `@orb/contracts` | delete the stale promise sentence (the file must survive for the `exports` map) | **S (trivial)** |

### `docs/history/reviews/stickler/2026-07-25-services-split-review.md`

All three findings **DONE SINCE**: `PortabilityChatSlice` has zero hits repo-wide (F1 fixed); zero
inline `import("@orb/…")` type annotations remain in `packages/*/src` (F2); `buildCopyCharacterBooks`
/ `buildImportStandaloneLorebook` are gone (F3). `services.ts` is 854 lines with 9 seam siblings.
**No open rows.**

### `docs/history/reviews/stickler/2026-07-25-workloads-junk-drawer-exit.md`

The whole §3 replacement shape shipped (D117 A–E). Eight `domain/*/workload-contributions.ts`
factories exist; `runner-env.ts` is gone; lanes/durable progress/poison-visibility landed.
§6 Q1–Q7 were all resolved by the D117 stages or the owner. **No open rows.**

### `docs/history/reviews/stickler/2026-07-26-w1-rpg-lite-vertical.md`

| # | Finding | Class | Evidence |
|---|---|---|---|
| W1-1 | F1 HIGH — negative pool delta mints `max <= 0`, poisons the snapshot | **PREMISE DIED** | pools were demoted into the unified tracker system at ACTOR-STATE R3; `poolDeltas` / the `(name, delta) => ({max: delta})` mint no longer exist in `tools/apply.ts` |
| W1-2 | F2 HIGH — `update_party` writes never reach a roster actor's volatile | **DONE SINCE** | `tools/apply.ts:83-96` `resolveActor` now goes through `refForTarget(targetRef, roster)` → `actorRefKey`, so a roster name resolves to `character:<id>` / `user:<id>`, not an orphan `cast:` row |
| W1-3 | F3 MEDIUM — rpg compose resolved "the host" as first-joined human | **DONE SINCE** | `hostUserIdOf` now lives in `domain/chat/substrate/roster-host.ts` and is role-derived; lane R2 (`7a0e8c08`) collapsed 15 lookup sites onto it; `compose/rpg.ts` no longer declares its own |

**No open rows.**

### `docs/history/reviews/stickler/2026-07-27-w4-batch.md`

| # | Finding | Class | Evidence | Target | Size |
|---|---|---|---|---|---|
| W4-1 | F1 HIGH — state rounds bypass the D17 consent belt + the room's connection | **DONE SINCE** | the TURN path now threads `ownerConsented: turnConnection.ownerConsented` (`compose/rpg.ts:626`, `:937`) and resolves through the room's connection. The three surviving `ownerConsented: true` literals (`:1118`, `:1201`, `:1336`) are the HOST-CLICKED doors (resync / resync tool round / populate) and each carries a written rationale — *"The host funds + authorizes this call (the consenting human clicked the button) — never an inherited turn verdict"* | — | — |
| W4-2 | F2 MEDIUM — state round fires on readonly/manual-steering games | **DONE SINCE** | `domain/rpg/chat-ops/flush.ts:195` — `if (deriveTrackersReadOnly(mode, turn.turnConnection.connection.capability))` now gates the flush |
| W4-3 | F3 MEDIUM — nudge-tail turns put the depth-0 system reminder bare into the agent-sdk prompt | **DONE SINCE** | `compose/chat.ts:161-174` — `extractTrailingSystemRows` now walks BACK past the non-system nudge tail before bracketing the system run |
| W4-4 | F4 MEDIUM — enum over-constraint: scene-NPC removal unrepresentable, cast writes dead | **DONE SINCE (reshaped)** | `tools/apply.ts:9-13` documents the R5 ghost guard and the *"wallet/inventory-on-every-actor ruling"* — cast mints are legal, the per-tool handlers keep the open mint. The plane was re-shaped by ACTOR-STATE R1/R2 |
| W4-5 | F5 LOW-MED — state-round calls invisible to ToolCallRecord/stats, choice never argued | **DONE SINCE** | the ask was "an explicit ruling comment at minimum": `compose/rpg.ts:610` + `:908` now state *"State-round economics: this is a real billed call that lands NO `ToolCallRecord` and NO stats delta (deliberate — see spec §10.1a)"*, plus `logToolRoundUsage` as the economics record |
| **W4-6** | **F6 LOW-MED — the state round is UNCANCELABLE (no `AbortSignal` threaded)** | **STILL OPEN (half)** | the barrier-leak half is FIXED (`domain/rpg/flush-barrel.ts` → set-per-chat + `BARRIER_TIMEOUT_MS` release, S2 hardening). The **cancellation half stands**: `/usr/bin/grep -n "signal" packages/server/src/entry/compose/rpg.ts` finds only a prose hit — neither state-round arm passes a signal, so a mid-turn abort cannot cancel a running state round | thread the turn's `AbortSignal` into `runExtraction` / `runToolRound` | **S** |
| W4-7 | F7 LOW — `UPDATE_GUIDANCE` is dead code | **DONE SINCE** | zero hits repo-wide |
| W4-8 | F8 LOW — firewall still advertises `agent × vllm` | **DONE SINCE** | `infra/providers/roles/firewall.ts:17` — `agent: ["max-pro-sub", "openrouter"]` |
| W4-9 | F9 LOW — three stale law-headers | **DONE SINCE** | `flush.ts` header now describes the dedicated round; the wire-capture api vocab lists `structured` |
| W4-10 | F10 LOW — a roster character named "Player" breaks the semantic ref both ways | **DONE SINCE** | `compose/rpg.ts:456` + `:500` — *"the semantic `player` token — ADDED only when NO roster member already occupies the name 'player' … (that char owns it, F10)"* |

### `docs/history/reviews/stickler/2026-08-02-workloads-stage-e.md`

| # | Finding | Class | Evidence |
|---|---|---|---|
| SE-1 | F1 MEDIUM — `scheduledAt` deferral never enforced at dispatch | **DONE SINCE** | `domain/workloads/persistence/queries.ts:345` — `lte(workloads.scheduledAt, now)` is now in the head query; the file header (`:5`, `:337-340`) documents it as *"the DEFERRAL gate"* |
| SE-2 | F2 LOW — worker header claims enqueue wakes the lanes | **DONE SINCE** | `transport/jobs/workloads-worker.ts` header now reads *"WAKE-ON-EMIT IS A LIFECYCLE WAKE, NOT AN ENQUEUE WAKE … ENQUEUE emits nothing"* |
| SE-3 | A1 LOW — `stats.reconcile` has no throttle | assessed no-action by the review itself | — |

**No open rows.**

### `docs/history/reviews/stickler/2026-08-02-sse-s2-chat-fold.md`

| # | Finding | Class | Evidence |
|---|---|---|---|
| S2-1 | F1/RF1 HIGH — cursor advanced at enqueue; no chat lag heal; rewind defeated by the seq-guard | **DONE SINCE** | `stream/socket.ts:123` `advanceCursorOnDelivery` + `:232-235` *"DELIVERY, not enqueue … and BEFORE the yield"*; `startOrHoldPump` is the barrier |
| S2-2 | **P3F1 HIGH — no single-owner guard on the socket cell (zombie generator clobbers the live one)** | **DONE SINCE** | `stream/socket-registry.ts:39-52` — *"THE CELL IS SINGLE-OWNER, AND OWNERSHIP TRANSFERS AT `goLive`"* with `connectionSeq` epochs (`:109`), `onEvicted` (`:96`), and ownership-checked `goDark` (`:127`, socket.ts:247) |
| S2-3 | **P3F2 MEDIUM — the barrier hangs on one swallowed, unretried announce mutation** | **DONE SINCE** | `client/src/data/bus/room-registry.ts:132-141` — a 3-attempt retry schedule (`ANNOUNCE_RETRY_FIRST_MS`/`SECOND_MS`) plus `ANNOUNCE_FAILED_MESSAGE` surfaced to the user |
| S2-4 | F2 MEDIUM — `event-sequence.spec.ts` asserts the deleted proc | **DONE SINCE** | re-pinned onto the multiplex wire per the review's own PASS-3 record |

**No open rows.**

### `docs/history/reviews/stickler/2026-08-02-actor-state-model.md`

The R1/R2/R3/R4 program shipped (workboard HANDOFF #3 + `ANCHOR`/`D124`).

| # | Finding | Class | Evidence |
|---|---|---|---|
| AS-1 | MS-1 — image-shaped hand-write contract | **DONE SINCE (R1)** | `rpg.patchActor` / `rpg.dismissActor` op-shaped door; `contracts/src/rpg/actor.ts:237` and `snapshot.ts:122` both carry the past-tense post-mortem of the image contract |
| AS-2 | MS-2 — NPC identity/presence fused | **DONE SINCE (R2)** | `contracts/src/rpg/views.ts:80-83` — *"It replaced THREE bolted-on cast projections (`castVolatile` · `castTrackers` · the `cast` identity array) … `castVolatile` had zero consumers, and carrier CLASSES partitioned ROWS rather than PEOPLE"* |
| AS-3 | #3 — cast NPC hard state host-invisible | **DONE SINCE** | dissolved by the unified `RpgActorView` (same evidence) |
| AS-4 | #4 — carrier classes partition rows not people | **DONE SINCE** | same comment names the exact defect as closed; `castCarrier` has zero code hits |
| AS-5 | #6 — "normalized" cast key was actually verbatim | **DONE SINCE** | `contracts/src/rpg/actor.ts:42-67` — `rpgCastSlug` is THE one home, with a schema `.refine((key) => key === rpgCastSlug(key))` making a non-canonical key unrepresentable at the wire |
| AS-6 | §5 Stage R4 doorways (promotion verb · `rpg_npcs` cross-game library · offstage steering line) | **partly DONE, remainder DECLARED-PARKED** | promotion is BUILT (`promote-actor.ts` + `actor-rekey.ts`); the `rpg_npcs` cross-game library + the offstage steering line remain declared doorways with D121 clause F recording the two known gaps — not silent debt |

**No open rows worth boarding.**

### `docs/history/reviews/misc/2026-07-25-compose-services-seam-map.md`

**DONE SINCE.** The recommended split shipped verbatim: `admin.ts`, `assets-character.ts`,
`automation-plugin.ts`, `databank.ts`, `imagery.ts`, `portability-runner.ts`, `search-discovery.ts`,
`world-info.ts` all exist beside a 854-line keystone. **One residual, low value:** §4 asked the split
to move `tests/server/entry/compose/services.test.ts`'s describe blocks into per-file mirrors; the
services-split review §12 recorded that the lane did NOT do it and the gate does not force it. No open row.

### `docs/history/reviews/misc/2026-07-25-kit-candidates-first-run.md`

**DONE SINCE.** The one actionable finding (duplicated `stableStringify`) was resolved by LIFTING it
to `packages/kit/src/stable-stringify/index.ts`; both former authors now import it
(`client/src/forms/entity-form-base.ts:9`, `server/src/kit/serde/card/index.ts:27`, with a pointer
comment at `card/index.ts:310`). The min-tokens-25 exploration was explicitly informational.

### `docs/history/reviews/misc/2026-07-25-settings-section-registry.md`

**DONE SINCE.** See the CORRECTIONS block — `SETTINGS_SECTION_ANCHORS` is retired, not live.

### `docs/history/reviews/misc/2026-07-25-side-gen-posture-inventory.md`

**DONE SINCE — the whole proposed ladder shipped.** `SIDE_GEN_POSTURES` catalog at
`contracts/src/preset/index.ts:108`; `resolveSideGenSampling` folds it over the caller's preset params;
`entry/compose/side-gen-params.ts` is the middle rung (`resolveUserPresetParams` /
`resolveChatPresetParams`); all nine sites converted (turn/compaction/quiet-generate/extract-quiet/
analyze/distill/caption/greeting/autobg); **and the proposed gate exists**:
`scripts/check/gates/no-hardcoded-side-gen-sampling.ts`.

### `docs/history/reviews/misc/2026-07-26-appsettings-admin-surfaces.md`

**Nothing open.** Every fork in the doc was resolved in-lane and the sections shipped (SET-SEAMS stage 3/4).

### `docs/history/reviews/misc/2026-07-26-imagery-templates-lift.md`

**DONE SINCE.** `DEFAULT_PROMPT_TEMPLATES` + `DEFAULT_CAPTION_INSTRUCTIONS` live at
`contracts/src/imagery/index.ts:42,71`; `UserSettings.imagery` exists
(`contracts/src/settings/index.ts:576-590`, per-mode optional overrides with the byte-identity default);
the editing surface is `client/src/features/chat/components/imagery-templates-section.tsx`. The lane
IMGMAC later threaded user macros into it.

### `docs/history/reviews/misc/2026-08-02-preset-execution-crunch-list.md`

Self-declared 36/36 CLOSED. Three residual obligations were embedded in prose:

| # | Finding | Class | Evidence | Target | Size |
|---|---|---|---|---|---|
| CL-1 | item 20 "DEFERRED SMALL: `__orb.shell()` should expose `focusMode`" | **DONE SINCE** | `focusMode` is a first-class store field (`state/shell-store.ts:108,143,220,246,265,314`) and the workboard records `c745e85c` exposing it via `data-focus-mode` |
| CL-2 | item 22-arm1 "THE OWNER'S 418×634 SIGHTING REMAINS OPEN-UNREPRODUCED" | **DONE SINCE (refuted)** | lane H's device-emulation sweep across 8 sections × both panes measured clean; the receipt was DevTools chrome. The doc records the refutation |
| CL-3 | out-of-lane find: "worldInfo's CONTEXT pane body is genuinely EMPTY at every width, no empty-state arm" | **DONE SINCE** | `features/world-info/lib/world-info-collection.tsx:37` — `context: { kind: "body", title: "Where it fires", render: … <WorldInfoContextBody/> }` |
| **CL-4** | **Process note: "Sampling KnobRow deck (sliders) unverifiable on sonnet-5 … Re-verify the slider deck on a vLLM/OR connection before closing the program."** | **STILL OPEN** | nothing in the strike pass, the graduation record, or the workboard records this re-verification. The preset program was closed without it | one `pnpm snap --goto presets` drive on a chat bound to a vLLM or OpenRouter connection that exposes sampling knobs; assert the KnobRow slider deck renders and round-trips | **S** |

### `docs/history/reviews/side-eye/2026-08-01-waystone-first-pass.md`

**DONE SINCE — including the ROOT CAUSE.** The review's diagnosis (*"the sky is painted with the CHART
palette"*) was fixed at the token layer: `packages/ui/src/tokens/tokens.json:146-194` now carries a
dedicated **atmospheric** set (`sky-day`, `sky-day-horizon`, `sky-night`, `sky-night-horizon`,
`sky-ember`, `sky-ember-deep`, `sky-twilight`, `sky-star`, `sky-cloud`, `sky-cloud-dark`), and every
token's `$description` names the exact finding it closes:

- F1 (light theme inverts day/night) → *"POLARITY-FIXED by design and base-only … night is dark in every theme"*
- F5 (CLOUD_DARK/LIGHT swapped) → *"a storm deck: DARKER than the lit one (they were inverted, so storm clouds were the brightest thing in the sky)"*
- the STAR_FILL half of F1 → *"starlight: the NIGHT ANCHOR's contrast partner, never `--color-foreground` (which flips dark on a light theme and turned the stars into dirt)"*

`waystone-geometry.ts:152-156` consumes them (`CLOUD_LIGHT = var(--color-sky-cloud)`, etc.), and the
owner rulings (grow the stone, `Waystone compact`) landed via HUD-1 H3. **No open rows.**

### `docs/history/design/home-section-spec.md` (status: BUILT)

| # | Finding | Class | Evidence |
|---|---|---|---|
| HS-1 | §8 "DEFERRED (named so nobody fakes them)": buddy's real tile · automation chips · a URL axis for `activeSection` | **DECLARED-DORMANT, not debt** | `features/home/lib/buddy-tile.tsx` + `automation-tile.tsx` exist as the gate-checked `{dormant:{reason,teaser}}` doorways the spec designed. The URL axis is explicitly its own program |
| HS-2 | §5 H5 — the reaper needs a call site | **DONE SINCE** | `chat.reapTemporaryChats` is a real procedure (`routers/chat.ts:588`) called fire-and-forget from `features/chat/components/home-temp-chat-tile-body.tsx:28` |
| HS-3 | §5 items 1-2 — the temp-chat wire | **DONE SINCE** | `routers/chat.ts:62` `temporary: z.boolean().optional()`; `features/chat/lib/draft-commit.ts:29,65` carries it sparsely |

**No open rows.**

### `docs/history/design/hud-home-spec.md` (status: closed, BUILT — D119)

Every stage H0–H4 carries a receipt sha; the §5.2 amendments are recorded as applied; the §8 gate arms
are probe-proven at H4. **No open rows.**

### `docs/history/design/set-seams-spec.md` (status: BUILT, S0–S6 CLOSED)

All six owner questions Q1–Q6 are RULED in the doc. Stage 6's named deletions verified: the anchors
tuple, the `make*Pane` factories, and the `*-settings-surface.tsx` shells are gone. **No open rows.**

### `docs/history/design/sse-multiplex-spec.md` (status: CLOSED, BUILT S0–S5, D118)

| # | Finding | Class | Evidence | Target | Size |
|---|---|---|---|---|---|
| SM-1 | §14 "`automation.stream` is a DOORWAY — sanctioned-dormant" | **DECLARED-DORMANT, not debt** | the doorway ruling is the record | — | — |
| SM-2 | §11 "fix the `bus-definition-belts` header comment citing a non-existent `use-rpg-stream.ts`" | **UNVERIFIABLE cheaply** | not chased this pass; would be settled by reading `scripts/check/gates/bus-definition-belts.ts`'s header | — | — |
| **SM-3** | **The doc's own STATUS line is CORRUPTED** — `**Status:** SPEC — **CLOSED — BUILT S0-S5, D118.\nTHE MULTIPLEX PROPERLY, spec first."*` — a truncated/mangled sentence with an orphan quote-close | **STILL OPEN (doc defect)** | verbatim at `docs/history/design/sse-multiplex-spec.md:3-4` | rewrite the status line | **S (trivial)** |
| **SM-4** | **§12 "The starvation regression pin: an `/api/_debug` counter of live sockets per user — assert 1 per tab, 2 across two tabs, opening a GAME chat adds ZERO"** | **UNVERIFIABLE — I could not settle it** | I did not locate an `/api/_debug` live-socket-count route or an e2e spec asserting it; the SSE close-out block in the workboard does not mention it either. I did NOT run an exhaustive two-method absence check, so I will not claim it is absent | settle by reading `foundation/observability/debug/routes.ts` + sweeping `tests/e2e/**` for a socket-count assertion; build the counter + pin if genuinely missing | **S–M** |

### `docs/history/design/rpg-lite-and-full-cohesion-brief.md`

A brief, superseded wholesale by its own game plan. **Nothing open.**

### `docs/history/design/rpg-lite-and-full-cohesion-game-plan.md` (RATIFIED, D86)

| # | Finding | Class | Notes |
|---|---|---|---|
| GP-1 | §9 chunk **L3** — `rpgCardStatsSchema` seeding at joinParty + the unmatched-key review surface | **PREMISE PARTLY DIED / UNVERIFIABLE** | the card-seeding story was overtaken by `populate-from-character.ts` (the populate round), which is the built answer to "seed a sheet from a card". Whether `extensions.rpgStats` name-matching specifically is wanted is now an owner-taste question, not tracked debt |
| GP-2 | §9 "Deferred (named, not scheduled)": per-NPC structured `meters[]` · a profile library table · lite hidden ring · alt-resolution plugins · the Tier-3b polyfill | **DECLARED-DEFERRED by design** | each carries its own "reserved, lands additively" rationale in §2.2/§4.3/§6/§7. Not debt |

**No open rows worth boarding.**

### `docs/history/README.md`

Index only. **Nothing open** — but note its own rule (*"a doc moves here ONLY when EVERY stage,
finding, and recommendation in it is landed or explicitly superseded/ruled-dead"*) was violated by at
least four of the moves this audit found rows in (crunch-list CL-4, wire-capture WC-5, contracts CA-10,
sse-multiplex SM-3/SM-4). Worth a line in the README that graduation must check the PROSE tails, not
just the numbered findings.

### `docs/history/retro-workboard-2026-08-03.md`

**Coverage: lines 1–2130 of 3515 (~61%), read in sections.** Covered: COMPACT-SAFETY SNAPSHOTS
#4/#3/#2, the SESSION-RESURRECTION block, HANDOFF #3, the whole 08-03 wave/lane ledger, the
merge/seal blocks, and the owner-rulings blocks. **Not covered: lines 2130–3515** (the 08-02-and-earlier
archeology: the PRESET wave detail blocks, the SSE S0–S5 seals, the W-chunk seals, and the earliest
retro burn-down layers).

Rows extracted from the covered portion that are **STILL OPEN** and not visibly on the live board:

| # | Finding | Source | Class | Evidence | Target | Size |
|---|---|---|---|---|---|---|
| **WB-1** | **SM7 flagged, explicitly "noted not touched": `engine/chat-completion.ts:116` is a SECOND `response_format` builder that never emitted strict** | line 57 | **UNVERIFIABLE** | the cited path no longer exists — `packages/server/src/infra/providers/backends/vllm/` is gone (the backend layer was restructured). Whether the second builder survived under a new path is unsettled | locate the current vLLM engine `chat-completion` module and re-check the strict arm | **S** |
| **WB-2** | **TRANSCRIPTS flag (3): "editSnapshot rejects the WHOLE patch as data on one bad plane — callers ignoring `HandDoorResult.ok` LOSE writes (a 41-char weather.label dropped a 5-plane scene write); sweep callers for ok-checks"** | line 939 | **partly DONE, one named residual** | lane SM5's EDITSNAP-OK fixed the factory-level refusal path and swept callers — but its own report FLAGGED `field-reachability.suite:358 ignores .ok` as *"non-vacuous, honest-fix-same-shape — smalls tail"* (line 975) | fix the suite's ok-check | **S** |
| **WB-3** | **TRANSCRIPTS flag (4): "WATCH: hand `editSnapshot` during an in-flight turn can be clobbered by the flush (seen once, unchased)"** | line 942 | **STILL OPEN (unchased)** | no lane in the covered portion picks it up; the actor-state review's §8 lists the same interleaving as an explicitly-unconfirmed suspicion | reproduce: fire a hand `patchActor` between a turn's commit and its flush; assert the hand write survives | **M** |
| **WB-4** | **ANCHOR: "TICKET: biome stack-overflows on single-file check of `chat-ops/handoff-heal.ts` (whole-tree passes — parallelism quirk; reproduces on main)"** | line 950 | **DONE SINCE** | SNAPSHOT #4 line 62 records it: *"handoff-heal biome overflow ROOT-FIXED (self-referential loop assignment; restructured, do-not-restore comment; no suppression)"* |
| **WB-5** | **ANCHOR: "L8-inbound (foreign ST `mes:""` rows at import) = declined-by-scope, one-liner if wanted"** | line 951 | **STILL OPEN (declined-by-scope)** | an explicit scope refusal with a named one-line fix — exactly the class that gets forgotten | decide: refuse or strip `mes:""` rows at ST import | **S** |
| **WB-6** | **`pnpm codemod` script referenced by codemod-kit docs but ABSENT from `package.json`** | line 1497 | **STILL OPEN** | FIX lane's NEW SMALL (2), never boarded as a lane | add the script or repair the docs | **S (trivial)** |
| **WB-7** | **codemod-kit: the same moved-path cache lie survives in `moveFiles`/`deleteFiles`/`copyFile` path VALIDATION (guard converts it to a loud refusal, but the asserts deserve the exact map)** | line 1495 | **STILL OPEN** | FIX lane's NEW SMALL (1) — "own ticket" | thread the `getSourceFiles` exact map into the three validators | **S** |
| **WB-8** | **codemod-kit refuses/warns on custom Plans that under-declare `touchedFiles` — "kit should refuse or warn" (silent-error class)** | line 1455 | **DONE SINCE** | lane FIX (`321b562d`) landed exactly this: *"MutationLedger … REFUSES on undeclared mutation naming files + plan"* |
| **WB-9** | **`export-rot-cleanup.ts`'s disposition table is STALE post-apply — "note in table header that it's a one-shot record"** | line 1498 | **DONE SINCE** | the reports index (line 698) labels it *"(one-shot record)"* |
| **WB-10** | **QUEUED (architecture): "unify rpg's chokepoint onto an injected authority op (`can`/`permitsHost` through compose)" — the minted law reads "one CITED chokepoint per authority domain," chat=`can()`, rpg=`guard.ts` pending unification** | line 1466 | **DONE SINCE** | lane R1 (`c466477e`) — *"rpg kernel-unified; SANCTIONED_HOMES down to ONE row; self-red ratchet receipt worked exactly as designed"* |
| **WB-11** | **`REGEX F2` residual: "REASONING prints slot 4 vs executes post-postProcess — unobservable, owner-call for strict fidelity"** | line 1837 | **STILL OPEN (owner-call)** | SM2's own flag; never posed to the owner in the covered blocks | pose the fidelity question, or cite-and-close | **S** |
| **WB-12** | **MACU follow-up: "other `MacroTextarea` consumers (persona editor, imagery templates, prose settings, character facets) pass own catalogs — do any want the user plane?"** | line 1846 | **partly DONE** | owner RULED *"MACRO PLANE = EVERYWHERE"* (line 908) and lane SM5's MACU-2 arm-a wired the 2 honest surfaces citing the 2 exempt with the door named. The remaining consumers are **cited-exempt, not forgotten** | — | — |
| **WB-13** | **`code-editor.ct` completion flake under contention (documented CM6 75ms window — watch list) · `drawer.ct:162` focus-trap failure PRE-EXISTING at HEAD (watch list)** | lines 825, 887 | **STILL OPEN (watch items)** | two named flakes explicitly parked on a "watch list" that has no durable home outside this archive | board as a single flake-watch row | **S** |
| **WB-14** | **"httpBatchStreamLink probe" boarded from the tRPC leverage audit** | line 1626 | **DONE SINCE** | lane DRV (`bf86e641`) — *"httpBatchStreamLink CLOSED w/ 2 source-pinned blockers written at the site"* |
| **WB-15** | **TAGSORT: "audit who reads `tags.sortOrder` — if it's only the library sidebar's folder grouping, sort-by-usage/name may be strictly better; report-then-decide, do not delete blind"** | line 176 | **STILL OPEN (owner-queued, never dispatched)** | owner ruling #2 of 08-03 dawn explicitly queued it | one scout: enumerate `sortOrder` readers, report | **S** |
| **WB-16** | **REGX2: "build bulk edit + the pipeline debugger + the per-script JSON door; NOT regex presets" (owner-ruled 08-03 dawn) → Lane REGX2 queued** | line 184 | **STILL OPEN (ruled, queued, never dispatched in the covered blocks)** | an explicit owner BUILD ruling sitting in the archive | three regex affordances | **M** |
| **WB-17** | **"MORNING OWABLES": the push word · the 3 nudge default texts (NARCOLOR, verbatim) · tag drag-reorder fork · REGPAR F1/F3/F4/F5 menu · v3-transcripts-new-installs-only note · the BRAND burn-down (374 sites) · countByBook twins (2-instance dup) · "Untitled chat" in regex rosters** | lines 198–203 | **STILL OPEN (owner-facing)** | the whole owables list moved into the archive at the board rewrite; only some of it is visibly on the live board | one consolidated owner-decisions row | **S (to board)** |

---

## Documents that yielded NOTHING (recorded so nobody re-reads them)

1. `docs/history/README.md` — index only (one process suggestion, no obligation)
2. `docs/history/design/hud-home-spec.md` — every stage receipted, every amendment applied
3. `docs/history/design/rpg-lite-and-full-cohesion-brief.md` — superseded wholesale by its game plan
4. `docs/history/design/set-seams-spec.md` — S0–S6 sealed, all six owner Qs ruled
5. `docs/history/design/home-section-spec.md` — BUILT; the two "deferred" rows are gate-checked dormant doorways
6. `docs/history/reviews/misc/2026-07-25-compose-services-seam-map.md` — the split shipped
7. `docs/history/reviews/misc/2026-07-25-kit-candidates-first-run.md` — the one hit was lifted to `@orb/kit`
8. `docs/history/reviews/misc/2026-07-25-settings-section-registry.md` — anchors tuple retired
9. `docs/history/reviews/misc/2026-07-25-side-gen-posture-inventory.md` — the full ladder + its gate shipped
10. `docs/history/reviews/misc/2026-07-26-appsettings-admin-surfaces.md` — all forks resolved in-lane
11. `docs/history/reviews/misc/2026-07-26-imagery-templates-lift.md` — catalog + settings section + macro plane all live
12. `docs/history/reviews/side-eye/2026-08-01-waystone-first-pass.md` — root cause fixed at the token layer
13. `docs/history/reviews/stickler/2026-07-25-services-split-review.md` — all 3 findings closed
14. `docs/history/reviews/stickler/2026-07-25-workloads-junk-drawer-exit.md` — D117 A–E shipped the whole shape
15. `docs/history/reviews/stickler/2026-07-26-w1-rpg-lite-vertical.md` — all 3 HIGH/MED closed
16. `docs/history/reviews/stickler/2026-08-02-workloads-stage-e.md` — both findings closed
17. `docs/history/reviews/stickler/2026-08-02-sse-s2-chat-fold.md` — all four passes' findings closed
18. `docs/history/reviews/stickler/2026-08-02-actor-state-model.md` — R1–R4 shipped; residue is declared doorways

---

## BOARD THESE — the still-open shortlist, ranked by value-per-effort

Paste-ready.

```
- [ ] EDITSNAP-OK residual (S) — `tests/.../field-reachability.suite.ts:358` ignores `HandDoorResult.ok`;
      SM5's own flag, "honest-fix-same-shape". Source: retro-workboard-2026-08-03.md:975
- [ ] CODEMOD-DOCS (S, trivial) — `pnpm codemod` is cited by codemod-kit docs but absent from
      package.json. Add the script or repair the docs. Source: workboard:1497
- [ ] CONTRACTS-BARREL (S, trivial) — `packages/contracts/src/index.ts` still promises
      "re-exports added as modules land" after 41 modules landed and zero importers. Delete the
      promise sentence. Source: contracts-layer-audit F10
- [ ] SSE-SPEC-STATUS (S, trivial) — `docs/history/design/sse-multiplex-spec.md:3-4` has a corrupted
      status line (truncated sentence, orphan quote). Rewrite it.
- [ ] CP-DROPPED-WARN (S) — emit `custom_parameters_dropped` when an OpenRouter request carries
      `customParameters`; today a BYO-style preset pointed at OR loses its blob silently.
      New WARNING_CODES member + emit site in both OR runners. Source: wire-capture review, blueprint step 4
- [ ] RPG-ROUND-SIGNAL (S) — the rpg state round is still uncancelable: no AbortSignal is threaded
      into `runExtraction`/`runToolRound` (`entry/compose/rpg.ts`). A mid-turn abort cannot stop it.
      (The barrier-leak half of this finding IS fixed.) Source: w4-batch F6
- [ ] L8-INBOUND (S) — foreign ST `mes:""` rows at import were declined-by-scope with a named
      one-liner. Decide: refuse or strip. Source: workboard:951
- [ ] TAGSORT (S) — owner-queued 08-03 dawn, never dispatched: audit who reads `tags.sortOrder`;
      if it's only the sidebar's folder grouping, sort-by-usage/name may be strictly better.
      Report-then-decide, do not delete blind. Source: workboard:176
- [ ] PRESET-SLIDER-VERIFY (S) — the preset program closed WITHOUT the re-verification its own
      crunch list demanded: "Re-verify the slider deck on a vLLM/OR connection before closing the
      program" (sonnet-5 exposes no sampling knobs, so the deck was never seen rendered).
      Source: 2026-08-02-preset-execution-crunch-list.md, Process notes
- [ ] CODEMOD-PATHMAP (S) — the moved-path cache lie survives in codemod-kit's
      moveFiles/deleteFiles/copyFile path VALIDATION (loud refusal today, but the asserts want the
      exact getSourceFiles map). Source: workboard:1495
- [ ] FLAKE-WATCH (S) — two named flakes parked on a "watch list" with no durable home:
      `code-editor.ct` CM6 75ms completion window under contention, and `drawer.ct:162` focus-trap
      failure (PRE-EXISTING at HEAD). Source: workboard:825,887
- [ ] REGEX-REASONING-FIDELITY (S, owner-call) — REASONING prints at slot 4 but executes
      post-postProcess. Unobservable today; SM2 flagged it as an owner call for strict fidelity
      and it was never posed. Source: workboard:1837
- [ ] SSE-STARVATION-PIN (S–M, UNVERIFIED) — the spec's §12 regression pin (an `/api/_debug` live
      socket count per user; 1 per tab, 2 across tabs, a GAME chat adds ZERO) — I could not find it
      and did not run a two-method absence check. Settle, then build if genuinely missing.
      Source: sse-multiplex-spec §12
- [ ] SM7-STRICT-RESIDUE (S, UNVERIFIED) — SM7 flagged "engine/chat-completion.ts:116 = a SECOND
      response_format builder, never emitted strict, noted not touched". That path no longer exists
      (the vllm backend dir was restructured). Re-locate and re-check. Source: workboard:57
- [ ] HAND-EDIT-VS-FLUSH (M) — "hand editSnapshot during an in-flight turn can be clobbered by the
      flush (seen once, unchased)". Same interleaving the actor-state review listed as an
      unconfirmed suspicion. Reproduce and rule. Source: workboard:942
- [ ] REGX2 (M) — owner-RULED 08-03 dawn, queued, never dispatched: regex bulk edit + pipeline
      debugger + per-script JSON door (NOT regex presets — "we made regex part of presets kinda").
      Source: workboard:184
- [ ] OWNER-OWABLES (S to board) — the archived "MORNING OWABLES" list: the 3 nudge default texts
      (NARCOLOR report, verbatim) · tag drag-reorder fork · REGPAR F3/F4/F5 menu ·
      v3-transcripts-reach-new-installs-only note · the BRAND burn-down (374 sites) · countByBook
      twins (2-instance dup) · "Untitled chat" in regex rosters. Source: workboard:198-203
- [ ] PROMPT_MACROS phantom (S, trivial — already known) —
      `docs/architecture/proposed/world-state-clips-trackers-spec.md:267` names the deleted symbol.
- [ ] BARREL ROOT-FIX (M, already known) — 56 `export * from` remain across packages/*/src.
- [ ] HISTORY-GRADUATION RULE (S) — `docs/history/README.md` says a doc moves only when EVERY
      finding is landed; four of the moved docs carried live PROSE-tail obligations (this audit's
      CL-4, WC-5, CA-10, SM-3/SM-4). Add a line: graduation must check prose tails, not just the
      numbered findings.
```

---

## What I did NOT cover

- **`docs/history/retro-workboard-2026-08-03.md` lines 2130–3515 (~39%)** — the 08-02-and-earlier
  archeology (PRESET wave detail blocks, SSE S0–S5 seals, W-chunk seals, the earliest retro burn-down
  layers). I read the file in sections and stopped where the budget forced a choice between finishing
  it and verifying the ~45 candidates I already had; verification was the harder requirement, so it
  won. **A second pass over that tail is worth one cheap lane** — it is the same class of blocks that
  produced WB-2 through WB-17, so the residue rate there is likely similar.
- **Two rows I could not settle** and have marked UNVERIFIABLE rather than guessed: the SSE starvation
  regression pin (SM-4) and the SM7 strict-residue path (WB-1). Both name exactly what would settle them.
- **`bus-definition-belts`'s header comment** (SM-2) — a one-line doc claim in the SSE spec's §11 gate
  table; not chased.
