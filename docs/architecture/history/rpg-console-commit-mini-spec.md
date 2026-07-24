# RPG-CONSOLE-COMMIT — the human-GM out-of-turn commit model (mini-spec)

> **Status: REALIZED + GRADUATED 2026-07-19 (D101) — code is the doc; frozen historical record.** The
> ruled shape (§2 direct-commit adapters over the one-home engines; the nullable-variant round arm) is
> BUILT: CC0/CC1/CC2 are DONE (§6) — the six console arms + `requestIllustration` promoted to a real
> verb + the `resolvedByUserId` attribution + the server-minted narrator lines + the client forms +
> CTs, landed in the wave-6 straggler close `c469b9ca`. The three open questions are RULED (§5). The
> code (`packages/{server,client}/src/**/rpg**` — `console-section.tsx`, `console-commit-forms.tsx`,
> `encounter-commit.ts`, `substrate/encounter/narrator.ts`) wins on every detail; any "PROPOSED /
> await owner review" voice below is pre-graduation.

## 1. The problem (why a console click can't ride the tool path)

The 6 staged verbs (`advanceTime` · `setWidgetValue` · `grantLoot` · `startEncounter` ·
`encounterRound` · `attemptFlee`) accumulate into the in-memory per-turn staging overlay
(`domain/rpg/staging.ts` — keyed by `ChatTurnId`, read-through via `readTurnState` so later tools
see earlier tools' writes). Nothing durable happens until `onTurnCompleted` FLUSHES: a NEW
`rpg_snapshots` row keyed to the just-committed `(messageId, variantId)`, born `committed=0`
(swipe-safe — a swipe selects a different variant's row; `onUserCommit` flips it). Encounter work
flushes into `rpg_encounters.state.rounds[]`, where every round carries a **required**
`variantId` ("the committed message variant this round was resolved on").

A human console call has no turn, no message, no variant: nothing to stage into, nothing to key a
flush to, and no variant for a round to anchor on. `requestIllustration` is separately unexposed
because it is a bare tool handler (resolve host → `workloads.enqueue`), not an `RpgService` verb.

## 2. The ruled shape — (a) direct-commit adapters over the one-home engines

**A human-GM act is a deliberate host act, not swipeable variant content.** It therefore rides the
`editSnapshot` precedent — the one turn-free write that already exists: read the CURRENT resolved
snapshot (`resolveSnapshotForTurn`), apply the change through the SAME pure engine the tool path
uses, write **in place** on the resolved variant's row (`updateSnapshotState`), emit the SAME bus
member the flush emits (`snapshotPatched` / encounter events). No staging, no new snapshot row, no
commit-flip dance — the host's act stands regardless of which AI variant is later selected.

**Rounds get a nullable-variant arm.** `rounds[].variantId` widens to `MessageVariantId | null` —
`null` = a console-committed round (a deliberate host resolution, anchored to no message and never
swipe-invalidated). This is the ONE contract widening; every reader that consumes `variantId`
handles `null` as "host-committed" (display: attribute to the GM seat, not a message).

**Rejected — (b) console-minted turns:** fabricating a turn row per button click drags in turn
locks, budget/funding attribution, and a phantom entry in turn history for something that is not a
generation. Fake-at-the-seam is the shape D100 exists to kill.

## 3. Per-verb console arms (each reuses the tool arm's pure engine — zero logic forks)

| Verb | Console arm writes | Notes / decisions |
| - | - | - |
| `advanceTime` | clock/weather onto the resolved snapshot in place | **D1:** the console arm SKIPS the tool path's random-encounter roll — a console GM who wants an encounter has `startEncounter`. (Owner may flip to "roll and offer".) |
| `setWidgetValue` | `widgetValues[widgetId]` in place | Refuses a locked leaf exactly like the tool arm — the host's remedy is the existing explicit `editSnapshot.unlock` (consistency over a silent override). Custom-source widgets only, as today. |
| `grantLoot` | lead member's inventory (party volatile) in place | Same `upsertVolatile` merge the flush performs. |
| `startEncounter` | a real `rpg_encounters` insert (status active) | Carries party volatile in from the resolved snapshot, refuses on an existing active encounter — both behaviors already live in the verb; only the staging write is replaced by the direct insert. |
| `encounterRound` | `appendResolvedRound` with `variantId: null` + merged HP onto the resolved snapshot in place | Runs `resolveEncounterRound` (`substrate/encounter/engine.ts`) against the persisted encounter state — the same one-home decider the flush calls. |
| `attemptFlee` | same mechanism, terminal `status:"fled"` | Same legality checks (`substrate/encounter/legality.ts`). |
| `requestIllustration` | — (no state write) | Promoted to a real `RpgService` verb wrapping what the tool handler does (resolve funding host → enqueue `rpg-illustration`); router row + sweep classification like any verb. |

Shared skeleton: resolve game → `requireHost` (per-user seat gating arrives with the doc 12 §8
rollout — these arms adopt it the day it lands, same as every rpg action verb) →
`requireModeCapability` (unchanged per verb — lite still refuses checks/encounters) → resolve
snapshot → pure engine → in-place write → the same bus emit the flush path uses. The adapters live
beside their verbs (a `console` param arm or sibling `*Direct` functions — implementer's call), but
the ENGINE stays one-homed: any divergence between a tool-path result and a console-path result for
the same inputs is a defect, and the int tests pin that parity.

## 4. Swipe/lock/freshness invariants

- In-place writes on the resolved variant are the `editSnapshot`-sanctioned turn-free shape;
  nothing here touches the staged/flush path, so tool-turn behavior is byte-identical.
- A `variantId: null` round never invalidates on swipe. A swipe DURING an active console-run
  encounter selects a different narrative variant, but the encounter row was never
  variant-anchored in its meta — unchanged from today.
- Locks: console arms READ the same `fieldLocks` the tool path respects; no new lock semantics.
- Freshness: the emitted members are already in the client's `EVENT_INVALIDATIONS` map — the
  console client work is forms only, zero stream wiring.

## 5. Open questions — RULED 2026-07-19 (orchestrator recs under the standing doc-silent→recs-stand

## rule; the doc letter and marinara are silent on all three)

- **Q1 — RULED: roll-and-offer.** The random-encounter roll is world-simulation pressure, not an
  AI-GM convenience. The console arm runs the SAME engine roll (parity — no forked probability),
  returns the outcome in the result; on a trigger the client offers "An encounter stirs — start
  it?" → `startEncounter`. A declined offer records nothing (identical to a non-triggering tool
  roll). D1 in §3 is superseded accordingly.
- **Q2 — RULED: structural attribution.** Rounds gain `resolvedByUserId: UserId | null` alongside
  the nullable `variantId` (`null` = model-resolved). Display reads it with the seat-badge grammar
  today; the doc 12 §8 seat-gating rollout inherits durable attribution instead of an inference.
  (CC0 carries both round-shape widenings together.)
- **Q3 — RULED: server-minted narrator line.** A console round with no post is an invisible canon
  event (members see HP move with no story record; export/distill lose the beat). The console arms
  post the canonical mechanical line in the `[dice:]`/`[check:]` format family — which the §4 fold
  - decorator seams (RPG-CHIP-POLISH) render for free.

## 6. Build chunks (unlock after owner review)

- **CC0 (S) — DONE.** contracts: `rpgEncounterRoundSchema.variantId` widened to nullable + the new
  required-nullable `resolvedByUserId` (Q2); null-reader sweep landed — round-builders take an
  `RpgRoundAttribution`, `truncateToVariant`→`truncateToRound` re-keyed to round IDENTITY (null-safe,
  console-exempt), `resolveSelectedRound` round-based head-first (console rounds stand). DB unchanged
  (`rounds[]` is JSON). Result schemas reused unchanged (advanceTime already carries `encounter`).
- **CC1 (M) — DONE.** server: the 6 console arms (advance/setWidget/grantLoot in-place snapshot
  writes; start/round/flee direct encounter commits, `variantId:null`+`resolvedByUserId`) +
  `requestIllustration` promoted to a real verb (the tool handler forwards to it) + the shared
  `encounter-commit.ts` one-home round-commit (flush + console parity) + Q3 `[round:]`/`[flee:]`
  narrator lines (`substrate/encounter/narrator.ts`) + router rows + 7 cross-tenant-sweep probes.
  Int tests: per-verb + a tool-vs-console PARITY test, lock refusal, mode refusal (lite), the
  console round shape, retract-never-voids-console pins, the advanceTime offer result, leak-free
  stranger probes.
- **CC2 (S/M) — DONE.** client: the six console forms + the Q1 encounter-offer affordance in the GM
  drawer's console section (`console-section.tsx`; form-factory for the ≥3-field StartEncounter),
  busDriven mutation hooks appended to `use-rpg-mutations.ts` (the emitted members already
  invalidate), CTs extended at the bucket-mirror path (render + fire-count per form + the offer flow;
  the lite-absence canary rides the full-mode drawer gate, unchanged).
