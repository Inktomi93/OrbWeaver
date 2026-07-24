---
kind: reference
status: draft
updated: 2026-07-18
---

# MA-3 — spatial world-maps design capture (Marinara architecture record + orbweaver fit sketch)

> \[!IMPORTANT]
> **CAPTURED, NOT QUEUED.** This is an architecture RECORD, not a build ticket. It documents what
> Marinara shipped (hierarchical spatial world-maps) and sketches — honestly — what an orbweaver
> version would cost and where its seams would sit. **A build requires its own explicit owner ruling.**
> Marinara themselves shipped this as an optional downloadable capability package (i.e. they treated it
> as a heavyweight add-on); the report ranks it the single largest greenfield concept in the delta and
> recommends design-first capture over a build-now. Nothing here is scheduled. The BUILD-QUEUE §Marinara
> row (MA-3) says exactly this: "explicitly NOT a build lane (high cost; they shipped it optional)".

> **Source banner.** Minted from the 2026-07-18 Marinara-Engine audit (v2.0.8→v2.3.3,
> `reports/research/marinara-delta-features.md` §3 + RANKED shortlist #7). Marinara code read in full at
> `references/marinara-engine` (paths cited inline). Representative commits: `142bea99` (core),
> `6f5d9bfd`/`540584fe` (history/persist), `c1239218` (history-safe expansion), `6c101eb6` (lorebook),
> `d3634c91` (runtime movement), `5610c23f` (package extraction).

## 1. What Marinara shipped (faithful record)

A **hierarchical world-map**: `region → settlement → place → building → floor → room`, with graph edges
between locations, per-location lore grounding, AI-drafted + AI-expanded maps, runtime movement, and a
prompt projection of "where you are / where you can go" spliced into the LLM message array. It is
history-safe (per-swipe/branch snapshots), never-throw (validation returns issue codes, not exceptions),
and per-viewer aware (an owner projection distinct from a redacted player view). The whole real engine
(activation logic, AI-draft prompts, the editor UI) lives in an extracted capability package; only thin
contract/facade files + the schema remain in-tree.

### 1.1 The data model (`packages/shared/src/types/spatial-context.ts`, read in full)

| Type | Shape | Notes |
| - | - | - |
| `SpatialContextDefinition` | `{ schemaVersion: 1, ownerMode, enabled, locations[], startingLocationId, revision }` | The whole map. `revision` is a **monotonic counter** (bumped on every definition edit — the anchor for history-safety, §1.2). `ownerMode ∈ {roleplay, game}`. |
| `SpatialLocation` | `{ id, parentId, name, kind, description, modelMemory?, awarenessSummary?, icon?, lorebookEntryIds[], childPresentation, placement?{x,y}, layerOrder?, links[], status, sortOrder }` | Hierarchy is **`parentId`-linked in a FLAT array** (not a nested tree) — reorder-safe, cycle-checkable. `kind ∈ region/settlement/place/building/floor/room`. `childPresentation ∈ map/layers/list` (how a location renders its children). `awarenessSummary` = the per-viewer "what's known here" seam. |
| `SpatialLocationLink` | `{ targetId, label?, bidirectional, state }` | Graph edges. `state ∈ available/hidden/blocked` — an edge can exist but be hidden or blocked from traversal. |
| `SpatialContextSnapshot` | `{ id, chatId, messageId, swipeIndex, currentLocationId, definitionRevision, source, transitionCommandId?, transitionPayloadHash?, createdAt }` | The **immutable per-visit record** (§1.2). Keyed `chatId + messageId + swipeIndex`. `source ∈ bootstrap/owner_turn/assistant_swipe/definition_repair/branch_copy`. |
| `SpatialMapLocationProvenance` | `{ kind, sources[] }`, `kind ∈ lore_backed/inferred/added_by_ai` | Per-location record of **why it exists** — was it lore-backed, inferred, or invented by the AI drafter. |

### 1.2 History-safety (the part worth capturing on paper — `c1239218`)

Every visit persists as an **immutable `spatial_context_snapshots` row** keyed by
`chatId + messageId + swipeIndex`, tagging the `definitionRevision` it was taken against and its
`source`. Swipes and branches each get their own snapshot. **AI expansion only APPENDS locations under a
bumped `revision` — it never mutates already-snapshotted history.** A `branch_copy` snapshot forks the
spatial state with the chat fork.

This is philosophically **native to orbweaver**: it is the derive-don't-stamp / per-variant-delta model
applied to geography — the exact shape orbweaver's D46 variables substrate
(`message_variants.variable_delta` folded onto `chats.runtime_variables`) and `rpg_snapshots`
(per-swipe, keyed on `message_variants`) already use. If orbweaver ever builds this, the snapshot design
transfers almost verbatim — mirror `spatial_context_snapshots` on the message-variant delta pattern.

### 1.3 Movement + projection (never-throw engine contract)

- **Transition validation is never-throw** — the engine returns result objects with issue codes, not
  exceptions. The in-tree types demonstrate the whole family: `SpatialTransitionValidationResult`
  (`{ok:true, destination} | {ok:false, code, message}`, codes like `spatial_transition_stale_definition`
  / `spatial_destination_unreachable`), `SpatialDefinitionValidationResult` (`{valid, issues[]}` over
  \~17 `SpatialDefinitionIssueCode`s — `parent_cycle`, `maximum_depth_exceeded`, `link_target_missing`, …),
  `SpatialArchiveValidationResult`. This is the **same never-throw contract** the turn-game/tactical
  engine uses (`applyMove → {ok:false, error, legalMoves}`, report §2) — an illegal move is data, not an
  exception. A build should copy this posture (it matches orbweaver's "projections degrade, never throw"
  doctrine).
- **Idempotent, optimistic-concurrency commit** — `owner-turn.ts` validates a `PendingSpatialTransition`
  (`expectedDefinitionRevision` + `expectedCurrentLocationId` + a `commandId` idempotency key) BEFORE
  committing a transition. Stale revision / stale location → a coded failure, not a corrupt write. The
  `commandId` de-dupes a retried transition. (Same optimistic-revision guard orbweaver's variables/RPG
  state layers use.)
- **Prompt projection** — `projection.ts` builds `ResolvedOwnerSpatialProjection`
  (`{ kind: "owner", currentLocationId, breadcrumb[], description, modelMemory?, lorebookEntryIds[],
  destinations[], omittedDestinationCount }`) and splices it into the LLM message array
  (`formatOwnerSpatialPrompt`). The `kind` discriminant is the **per-viewer seam**: the owner projection
  is what remains in-tree; the redacted player view (Marinara's turn-game `publicView(state, viewerSeatId)`
  redaction pattern, report §2) is in the extracted package. `omittedDestinationCount` = "there are more
  exits than shown" without leaking them.

### 1.4 Lore grounding (`6c101eb6`)

`SpatialLocation.lorebookEntryIds` activate **only while that location is current** — location-scoped
injection, NOT global keyword triggers. This is the interesting inversion: a normal lorebook entry fires
on keyword match anywhere; a spatial-bound entry fires on **presence** (you're in the throne room → the
throne-room lore is live). Drafting has a `groundingMode ∈ {setup, lore_strict, lore_expand}` controlling
how freely the AI drafter invents beyond the provided lore, and `SpatialMapLocationProvenance` records
per-location whether each location is `lore_backed` / `inferred` / `added_by_ai`.

### 1.5 Activation, migration, the optional-package framing

- **`game-map-binding.ts`** binds a hierarchical `SpatialLocation` to a tactical-grid `GameMap`/cell/node
  via an optional `spatialLocationId` — maps can be free-floating or tied to a location. (The tactical
  grid itself is rejected-by-design for orbweaver, report §2 / rpg `01 §6`; noted only for completeness.)
- **Activation migration** (`c0e9d85b`, `3c2004ae`) — a botched prior rollout force-selected Hierarchical
  Maps for existing chats; the fix strips the capability back out only for chats with it active but **no
  real map data** (no snapshots/locations), gated by a one-time completion marker. The generic lesson —
  *a capability activation migration must no-op where real data exists* — is already native to
  orbweaver's born-whole schema posture (report §4 rates this N/A for orbweaver).
- **Optional-package framing** — the whole engine was extracted into a downloadable capability package
  (`5610c23f`); `registry.generated.ts` went empty; only thin contract/facade files + the schema stay
  in-tree. **Marinara treated this as a heavyweight optional add-on, not core.** That is the single most
  important fact for the owner ruling: even the shippers didn't put it in the base engine.

## 2. Orbweaver fit sketch (honest — what exists, what's missing, what it costs)

### 2.1 What already exists (the seams a build would consume)

| Orbweaver asset | Relevance |
| - | - |
| `rpg_maps` table (rpg-design, LANDED `4075bf28`) | A **fog-of-war** table exists — but the rpg design **explicitly does NOT track positioning or movement** (rpg `01 §6`: "positioning is not tracked"; the encounter engine is stat-and-declaration based). So the reveal/fog primitive is there; hierarchical position + movement is the gap. |
| scenes (rpg R10, `07-encounters-scenes-party.md`) | "Scenes over `forkChat`" — the closest existing spatial-ish concept (a scene is a narrative place-cut), but flat, not a positioned hierarchy. |
| the D86 profile spine + lite/full mode axis | The stat-profile + mode machinery a spatial layer would sit beside; a map would be profile/mode DATA, not a new hard axis. |
| world-info / lorebook system (`domain/world-info`) | The grounding substrate §1.4 needs — one books/entries store + scope junctions already built. Location-scoped activation would be a NEW scope kind over the existing entries. |
| the D46 variables substrate + `rpg_snapshots` (per-variant delta) | The **history-safe snapshot model** (§1.2) is already the house pattern — `spatial_context_snapshots` mirrors it near-verbatim. |
| the chat assembly pipeline + `PromptTransform` (D50) | The projection splice (§1.3) is a bounded injection, the same class as the MA-2 reaction-attribution loop and the RPG staging injection. |
| `domain/tool-use` (T1–T7 landed) | A `move` / `look` tool would ride the built tool-loop — the never-throw `applyMove` maps onto a tool executor returning a coded result. |

### 2.2 What is missing (the actual build)

- A `SpatialContextDefinition`-equivalent schema (flat `parentId` locations + graph links + placement) —
  a new `domain/spatial` leaf or an rpg R-chunk. **No orbweaver analog exists.**
- The **AI-draft + AI-expand workload** (draft a map from lore; expand under a bumped revision) — a new
  workload kind + its prompt shapers + the `groundingMode` + provenance tracking.
- **Movement verbs** (the never-throw transition with the optimistic-revision + `commandId` guard) + the
  per-swipe `spatial_context_snapshots` table (though the pattern is native, §1.2).
- The **projection shaper** (breadcrumb + reachable-destinations + model-memory splice) + the per-viewer
  redaction (owner vs player `publicView`).
- **Location-scoped lorebook activation** — a new activation path in `domain/world-info` (fire-on-presence,
  not fire-on-keyword).
- A **map editor client** + a map-render surface + fog-of-war reconciliation against `rpg_maps`.

### 2.3 Cost + where it would seat

**Cost: HIGH** (the report's rating). Schema + AI-draft workload + movement verbs + projection shaper +
a map editor client + fog reconciliation — a multi-chunk vertical on the scale of an rpg R-chunk, not a
mini-spec's worth of work. **Where it would seat:** either a new `domain/spatial` leaf (if the owner
wants it independent of rpg) or a new rpg R-chunk (if it's a game-mode feature) — consuming the
world-info system for grounding, mirroring the variable/snapshot delta pattern for history, and riding
the tool-loop for movement. The `ownerMode ∈ {roleplay, game}` split maps onto orbweaver's D86 lite/full
mode axis.

## 3. Explicit disposition

**NOVEL** (zero hits for "world map" / "spatial" in orbweaver docs; `rpg_maps` is fog-of-war only, no
positioning). **NOT queued. NOT a build lane.** The part worth having captured NOW, on paper, is:

1. the **history-safe snapshot-per-variant model** (§1.2) — cheap to record, and it's the design detail
   that transfers verbatim to orbweaver's existing delta patterns;
2. the **never-throw validation-result contract** (§1.3) — already orbweaver-doctrine-aligned, worth
   copying if any spatial/movement engine is ever built (and reference-grade for the R8 encounter engine
   regardless, per report §2);
3. the **location-scoped (fire-on-presence) lorebook activation** inversion (§1.4) — a genuinely novel
   grounding idea independent of the full map feature;
4. the **optional-package framing** (§1.5) — the load-bearing fact for the ruling: even Marinara shipped
   it as a heavyweight opt-in add-on, not base.

Any build requires an explicit owner ruling that opens the concept (the D49/D86 out-of-bounds rule:
adding a large greenfield capability without a row is out of scope). Recommend the owner treat this like
D55 Clips — a design-first candidate captured on paper, activated only on an explicit decision.
