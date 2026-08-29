---
kind: design
status: active
updated: 2026-08-28
---

# Saved rosters (roster presets) — the RP1+RP2 build record (#26, lane roster-26)

> **What this is:** the as-built design for `domain/roster-preset` + the client party picker, built
> 2026-08-28 against the parked program doc
> [`saved-rosters-design.md`](../architecture/proposed/saved-rosters-design.md) (D61 B6). The program
> doc stays the WHY; this file records the deltas the 2026-07-25 rollback + the D80 seat-knob
> consolidation forced, the alternatives weighed on today's tree, and the coupled-site inventory the
> landing swept. On conflict: the D-ledger (D61, D80's reserved meaning) wins, then this record, then
> the parked program doc (its RIDER/triage lines describe the pre-rollback tree and are stale).

## 0. Premise repair (what the dispatch believed vs the tree)

The dispatch said schema + contracts were "already scaffolded, never imported." On this tree
(b281929cd) that was **half false**: `packages/db/src/schema/roster-preset.ts`, the
`@orb/contracts/roster-preset` module, the `RosterPresetId` brand and `domain/roster-preset` do NOT
exist (all purged with the 2026-07-25 rollback; `rg -i "roster_preset" packages/` matched only
`contracts/src/chat/roster.ts` + its test). What DOES exist — and is the load-bearing scaffold — is
the D80 member vocabulary in `@orb/contracts/chat/roster`
(`characterMemberSpecSchema`/`rosterMemberSpecSchema`/`seatKnobsSchema`, roster.ts:76-99) and the
chat verbs whose headers name this feature as their consumer: `addCharacterToChat` ("the floor RP1's
`applyToChat` re-apply idempotency stands on", verbs/roster.ts:578) and `setSeatKnobs` ("applyToChat
re-apply leans on this", verbs/roster.ts:707). Everything else was rebuilt fresh per D61 B6.

## 1. Shape (unchanged from the program doc — revalidated on today's tree)

- **Home:** a small `domain/roster-preset` leaf (8-slot template). *Rejected again on today's tree:*
  `domain/chat` (library data vs membership-scoped chat, D18), `domain/preset` (generation config
  only, Core-0 §6), `domain/character` (a cast list is not card identity).
- **Storage:** `roster_presets` (TRUE PRODUCER — stamps `ownerId`, D23/D61; `unique(ownerId, name)`;
  nullable `anchorPersonaId` SET NULL; nullable `groupConfig` JSON blob typed `GroupConfigInput`,
  validated by `groupConfigSchema` at write, stored as the LENIENT INPUT so chat's `setGroupConfig`
  owns defaulting at apply) + `roster_preset_members` (real FK junction — `(presetId, characterId)`
  PK, `position`, nullable `talkativeness`, `disabled` default false; character delete CASCADEs the
  seat out). *Rejected:* marinara's JSON id-array (rots into dangling ids); FK-to-template-chat
  (couples library data to room lifecycle).
- **Verbs:** `create` / `update` (full-replace member list) / `remove` / `list` / `get` /
  `applyToChat`. Owner-only via the stamped `ownerId` (the persona posture: no guard slot, ownership
  IS the gate); `applyToChat` additionally requires target-chat HOST — through chat's own authority,
  never a re-implementation (§2).
- **Never a second add path:** `applyToChat` drives the injected chat ops; `domain/roster-preset`
  writes only its two tables (no `chat_participants` write — grep-provable, dep-cruiser backstopped).

## 2. Deltas from the program doc (each with its receipt)

1. **The injected op set is `{ addCharacterToChat, setSeatKnobs, setGroupConfig }`** — the doc's
   `setParticipantTalkativeness`/`setParticipantDisabled` were retired by D80's participantId-keyed
   `setSeatKnobs` consolidation (chat/verbs/roster.ts:700). Op TYPES are
   `Pick<ChatService, …>` imported type-only through chat's front door (the sanctioned shape —
   `domain-no-cross-feature` exempts type-only; the `automation/contract/ops.ts` precedent), so the
   signatures cannot drift from chat's.
2. **`requireChatHost` is a FOURTH injected op, and it runs FIRST.** The doc's apply mechanics
   (resolve preset → add missing members → knobs → config) have a leak the letter misses: when every
   member is already present and the preset carries no config, NO host-gated op ever fires, and a
   preset owner probing a foreign `chatId` would read back `{added: [], alreadyPresent: [...]}` — a
   roster-intersection oracle. `applyToChat` therefore gates host authority BEFORE the roster
   pre-read, via chat's own exported `requireHost` wired at compose (`{db, can}` — the tag-context
   precedent, entry/compose/services.ts:470). Still no second authority path: it IS chat's guard.
3. **The wire member shape is `characterMemberSpecSchema`** (kind-discriminated, explicit
   `position`), not the doc's ad-hoc `{characterId, talkativeness?, disabled?}` array — the D80
   vocabulary law ("every membership-template lifetime PROJECTS through it; nothing mints a flat
   characterId array beside it", chat/roster.ts:92-99). The verb normalizes: sort by wire
   `position`, re-stamp dense 0..n-1 (the doc's "stamp position from array order", honored after the
   sort).
4. **`ApplyRosterPresetResult` gains `skipped`** — the doc's §4 text requires skipped/missing
   members reported while its §3 sketch omits the field. The FK CASCADE makes a stale member nearly
   unreachable (a deleted character deletes its seat rows), so `skipped` is the PRE-DRIVE re-verify
   arm only: members failing the ownership re-check between the member read and the drive are dropped
   and reported. A failure INSIDE the drive (an injected chat verb throwing — the sub-verify deletion
   window, a dying room) SURFACES and aborts the loop — deliberately NOT collected (truth-repaired
   after the pre-merge stickler, F3): classifying it would need cross-domain error-class sniffing, and
   the additive + idempotent contract already makes a retry converge (landed seats re-classify
   `alreadyPresent`). The program doc's "never an abort" letter is therefore narrowed to the
   pre-drive arm.
5. **`rosterPresetsChanged` joins the user bus.** The doc predates the `staleTime: Infinity` /
   bus-driven-freshness era; a library-CRUD read surface with no bus member is the exact H1/H3 class
   the event-bus coverage survey forced members for (contracts/user-bus header). One coarse member
   with a `rosterPresetId` hint; every mutating verb emits it after commit; the client invalidation
   row path-invalidates `trpc.rosterPreset`.
6. **Knob re-stamps send `{disabled, talkativeness?}` for every member on every apply** —
   `disabled` is NOT NULL in the junction so "unset" is unrepresentable and the stored value is the
   preset's answer; `talkativeness` rides only when non-null (NULL = inherit the chat default, the
   doc's letter). Re-apply therefore re-stamps knobs (the doc's stated idempotency semantics) and an
   added-then-hand-tuned seat is reset by a deliberate re-apply — documented, not accidental.
7. **added vs alreadyPresent is classified by a pre-read**, `listPresentCharacterSeats(chatId)` →
   `{characterId, participantId}[]`, wired at compose as a direct `chat_participants` read (the
   `resolveChatHostUserId` precedent, entry/compose/services.ts:534). Present members' participantIds
   feed `setSeatKnobs` without a second add call; missing members go through `addCharacterToChat`
   (idempotent, returns the seat view whose `id` feeds the knob stamp).
8. **Member-character + anchor-persona ownership is verified at the producer verb** via injected
   compose-wired reads (`verifyCharactersOwned` — one owned-id filter query; `verifyPersonaOwned` —
   the chat compose precedent, entry/compose/chat.ts:1144). The FK proves existence, never ownership
   (the persona `ensureAssetOwned` comment); a foreign id is a leak-free NotFound.

## 3. Client (RP2) — the party picker

- **A new `features/roster-preset` slice** (name = the server domain, `client-structure` rule 2). It
  earns existence under G23 by OWNING the `savedParties` MODAL definition
  (`lib/saved-parties-modal.tsx`); body in `components/`, reads/mutations in `hooks/`.
- **One modal, three affordance families** (the program doc's §6 compressed into one surface):
  per-row **Start chat** (preset members in position order + anchor → the real `useStartChat`, then
  the `applyToChat` polish call — two calls is CORRECT, call 1 alone yields a valid room), per-row
  **Add to this chat** (visible only when a room is open AND the viewer HOSTS it — the doc's §6
  capability-driven rule, tightened at the pre-merge stickler's F6; `applyToChat`, result toast),
  per-row **Delete** (ConfirmDialog), and **Save current party** (snapshots the OPEN chat's present
  character seats + knobs + groupConfig + anchor into `create` — author-by-example, reading
  `chat.getChat` from cache; rendered only when a chat is active and the viewer hosts it).
- **Openers:** "Start from party…" in the new-chat picker footer and "Add party…" in the members
  panel — both `openModal("savedParties")`, the sanctioned cross-feature channel (no feature
  imports the other). Empty library ⇒ the modal shows its designed empty state (the picker-hides
  rule from the doc applies to the OPENERS' badge, not the modal itself).
- **Freshness:** `rosterPreset.list` is covered by the `rosterPresetsChanged` invalidation row
  (query-freshness-coverage); mutations are `busDriven: true` (the persona idiom).

*Rejected:* folding the picker into `features/chat` (roster-preset is its own server domain and owns
a registered definition — the feature-naming and G23 lines both point at a slice); a rail
section/library-management surface (the doc parks library management as a small later surface; the
modal's rename/delete covers v1).

## 4. Coupled-site inventory (as landed)

| # | Site | Edit |
| - | - | - |
| 1 | `packages/kit/src/ids/index.ts` | `ID_PREFIX.rosterPreset = "roster_preset"` + `RosterPresetId` |
| 2 | `packages/db/src/schema/roster-preset.ts` + `schema/index.ts` | the two tables + barrel row |
| 3 | `packages/db/src/migrations/` | baseline SQUASH regen (dev-db drop — merge-window scheduled) |
| 4 | `tooling/src/verify/gates/table-scoping-class.ts` | `roster_presets: ownerId` · `roster_preset_members: junction` (+ census comment) |
| 5 | `tooling/src/verify/gates/ownerid-registry.ts` | `OWNERID_ALLOWLIST.roster_presets` |
| 6 | `packages/contracts/src/roster-preset/index.ts` | schemas + views + `ApplyRosterPresetResult` |
| 7 | `packages/contracts/src/user-bus/index.ts` | `rosterPresetsChanged` ×3 (union · TYPES · COARSE) |
| 8 | `packages/server/src/domain/roster-preset/**` | the leaf (contract/ · verbs/ · persistence/ · service · index) |
| 9 | `packages/server/src/entry/compose/roster-preset.ts` + `services.ts` | seam builder + Services key |
| 10 | `packages/server/src/transport/trpc/context.ts` + `router.ts` + `routers/roster-preset.ts` | Services type + mount + router |
| 11 | `tests/server/entry/compose/services.test.ts` | `SERVICE_KEYS` + key count |
| 12 | `tests/server/transport/cross-tenant-sweep.suite.int.test.ts` | MARK + OwnerIds + seed + probes + EXEMPT rows |
| 13 | `vitest.config.ts` `SERIAL_INT` | the full-`createServices` apply test rides the serial lane |
| 14 | `tests/{contracts,server}/…` mirrors | per-verb + persistence + contract tests (test-presence) |
| 15 | `packages/client/src/state/modal-slot-ids.ts` | `"savedParties"` (appended — the registry CT loops + the prefix-pinned ids assertion both stay green by construction) |
| 16 | `packages/client/src/compose/authed-app.tsx` | modal registration (Record-total forces it) |
| 17 | `packages/client/src/data/invalidation.ts` (+ its EXPECTED-map test) | `rosterPresetsChanged` row |
| 18 | `packages/client/src/features/roster-preset/**` + the two chat openers | the slice + reachability |
| 19 | `docs/catalog/receipts/design.json` (+ regenerated catalog) | this record's receipt |

## 5. Test plan (what proves what)

- **FK physics** (`persistence/queries.int.test.ts`): character delete → seat gone, preset survives;
  persona delete → anchor NULL; preset delete → members gone; owner delete → all gone.
- **Producer gates** (`verbs/create.int.test.ts` / `update`): foreign characterId / personaId →
  NotFound; garbage `groupConfig` refused; valid narrator blob round-trips as INPUT; `(owner, name)`
  conflict → typed `RosterPresetNameConflictError`; member clamp 1..25; position normalization.
- **Apply semantics** (`verbs/apply-to-chat.int.test.ts`, over the REAL compose graph via
  `createServices` — the compose-stub antidote; SERIAL_INT): fresh room → all added in position
  order + knobs stamped; re-apply → zero duplicate seats (the `addCharacterToChat` present-seat
  floor) + knobs re-stamped; sans-config preset never touches the room's `groupConfig`; with-config
  → the stored blob lands through the real `setGroupConfig` fully defaulted; **non-host actor →
  chat's own NOT_FOUND surfaces through the injected guard, and the all-present no-op probe returns
  nothing to a non-host** (the §2.2 leak, pinned).
- **Cross-tenant sweep**: `get`/`update`/`remove`/`applyToChat` PROBED with A's presetId;
  `create`/`update` probed with A's characterId (foreign member refused); `applyToChat` second-scope
  probe (stranger's OWN preset onto A's chat → NOT_FOUND); `list` PROBED marker-free (the
  WHERE-partition rule — "no id input" is not grounds for EXEMPT).
- **Contract round-trip** (`tests/contracts/roster-preset/index.contract.test.ts`).
- **Client CT** (`party-picker.ct.tsx`): rows render from a routed list; empty state; Start/Add
  affordance gating; delete confirm.
