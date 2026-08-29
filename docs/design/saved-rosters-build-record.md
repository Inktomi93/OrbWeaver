---
kind: design
status: active
updated: 2026-08-29
---

# Saved casts (roster presets) — the RP1+RP2 build record (#26, lane roster-26)

> **What this is:** the as-built design for `domain/roster-preset` + the client saved-cast surfaces.
> **The CURRENT authority is [`interaction-direction-spec.md`](interaction-direction-spec.md) row B10
> "saved casts (#26)"** (updated 2026-08-28 — the modernized interaction plan): nomenclature is "saved
> cast(s)" everywhere user-facing; the four surfaces are save = a Members-tab host action, apply-new =
> the `newChat` picker's "Start from saved cast", apply-existing = Members "Add cast…", library
> management = a Configuration-section `CollectionContribution`. The build was originally cut against
> the July-3 program doc `saved-rosters-design.md` (D61 B6) — that doc is DELETED (2026-08-28,
> superseded by B10); its mechanics survive here and in D61. On conflict: the D-ledger (D61, D80's
> reserved meaning) wins, then B10, then this record.
>
> **B10's rules rider is BUILT (2026-08-29 — §6 below):** the cast also carries the room's enabled
> automation-RULE presets (catalogue id + resolved knob values), re-minted and re-enabled on apply
> through automation's own verbs. The enabling schema half — `preset_id`/`preset_knobs` provenance on
> `automation_rules` — landed with it (the B2 flip-shape the spec §3-S3 recorded as unbuilt).

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

## 3. Client (RP2) — the saved-cast surfaces

- **A new `features/roster-preset` slice** (name = the server domain, `client-structure` rule 2). It
  earns existence under G23 by OWNING the `savedCasts` MODAL definition (`lib/saved-casts-modal.tsx`)
  and the `castCollection` `CollectionContribution` (`lib/cast-collection.tsx` — B10's Configuration-
  section library management: rows + a mounted member editor for rename/describe/start/delete; member
  RE-composition stays author-by-example); body in `components/`, reads/mutations in `hooks/`.
- **One modal, three affordance families** (the program doc's §6 compressed into one surface):
  per-row **Start chat** (preset members in position order + anchor → the real `useStartChat`, then
  the `applyToChat` polish call — two calls is CORRECT, call 1 alone yields a valid room), per-row
  **Add to this chat** (visible only when a room is open AND the viewer HOSTS it — the doc's §6
  capability-driven rule, tightened at the pre-merge stickler's F6; `applyToChat`, result toast),
  per-row **Delete** (ConfirmDialog), and **Save current cast** (snapshots the OPEN chat's present
  character seats + knobs + groupConfig + anchor into `create` — author-by-example, reading
  `chat.getChat` from cache; rendered only when a chat is active and the viewer hosts it).
- **Openers (B10's exact labels):** "Start from saved cast" in the new-chat picker and "Add cast…"
  in the members panel — both `openModal("savedCasts")`, the sanctioned cross-feature channel (no feature
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
| 15 | `packages/client/src/state/modal-slot-ids.ts` | `"savedCasts"` (appended — the registry CT loops + the prefix-pinned ids assertion both stay green by construction) |
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
- **Client CT** (`cast-picker.ct.tsx`): rows render from a routed list; empty state; Start/Add
  affordance gating; delete confirm.

## 6. The B10 rules rider (built 2026-08-29) — "+rules on a cast"

B10's deferred leg: a saved cast ALSO carries the source room's ENABLED automation rule-presets +
their knob values, re-minted (and re-enabled) into the target room on apply. Spec authority:
`interaction-direction-spec.md` row B10 ("the room's enabled PRESET IDS + KNOB VALUES re-minted on
apply … doubles as B2's provenance flip-shape record") + §3-S3 (the flip shape: `preset_id` + `knobs`
provenance on `automation_rules`, previously recorded-unbuilt).

### 6.1 The provenance flip (the B2 record, landed here)

`automation_rules` gains `rule_preset_id` (nullable, `RulePresetId`-typed TEXT — spelled Rule-prefixed
per the 2026-08-24 vocabulary ruling, deviating from §3-S3's literal "`preset_id`"; NO FK and NO
CHECK: rule presets are a CODE catalogue, `contracts/automation` `RULE_PRESET_IDS`, not rows, and the
tuple grows by design so a DDL pin would turn every catalogue addition into a merge-window schema
change) and `rule_preset_knobs` (nullable JSON — the RESOLVED knob bag, every key present, validated
at mint). A
paired-nullability CHECK makes a half-stamped row unrepresentable. The BICONDITIONAL (provenance
present ⟺ the row is exactly what `createRuleFromPreset(presetId, knobs)` mints) is held by every
writer: `createRuleFromPreset` stamps it (via a verb-only optional `presetProvenance` on
`CreateRuleParams` — deliberately NOT on the tRPC wire, so a hand-authored rule can never carry one);
`updateRule` CLEARS it (a hand-edited rule is no longer the preset's mint — v1 knob-edit stays
re-mint per §3-S3); enable/reorder/dispatch writers don't touch it. `RuleView` projects both fields,
which is what makes the room's enabled-preset accrual READABLE (the capture read below, and B2's
future in-place knob editor).

### 6.2 Storage — a real junction, `roster_preset_rules`

`(preset_id FK → roster_presets CASCADE, rule_preset_id TEXT)` PK + dense `position` + `knobs` JSON
NOT NULL (the resolved bag). Owner scope DERIVES through `preset_id` (D23 — the
`roster_preset_members` posture exactly; `table-scoping-class` carries the junction row). *Rejected:*
a `groupConfig`-style JSON array column — the id would live INSIDE an open JSON value (invisible to
every gate/SQL read — the allow-list-blind-inside-JSON class), no PK dedupe, and the sibling junction
already sets the shape. *Rejected:* an FK to the rule preset itself — impossible, there is no table;
which also KILLS the "foreign rulePresetId → NotFound" framing: there is no *foreign*, only
*unknown*, refused by the closed `z.enum(RULE_PRESET_IDS)` at the wire, and a STALE id (a later
catalogue removal) degrades at apply as a reported skip, never a constraint violation.

### 6.3 Capture — client-composed, author-by-example (like every other cast field)

`createRosterPresetSchema` gains `rules?: {rulePresetId, knobs}[]` (default `[]`, unique ids, max =
catalogue size). The client's "Save current cast" derives the room's enabled rule-presets from
`automation.listRules` (host-gated; the B2 section's own read): enabled rows with provenance, grouped
by `presetId`, latest mint's bag winning a knob conflict. ANY-enabled counts (a partially-enabled
two-rule preset is still "in play"; requiring ALL would silently drop a preset the host believes is
on). *Rejected:* the server capturing from a `chatId` param on create/update — a SECOND capture path
beside the client snapshot that members/knobs/config/anchor already use, it breaks the
library-editor's full-replace rename (no chat open ⇒ rules wiped), and it adds a host gate to a
library CRUD verb for zero authority gain (a fabricated spec can only ever mint what the caller could
mint directly through `createRuleFromPreset`). The write verbs validate through ONE injected op,
`resolveChatRulePresetKnobs` (automation-owned logic exported through its front door; compose wires
it): catalogue membership, `scope === "chat"`, full descriptor resolution — and STORE the resolved
OUTPUT (the `parsedGroupConfig` posture). Refusals are automation's own `RuleValidationError`
(`DomainOperationError` → BAD_REQUEST, centrally mapped).

### 6.4 Apply — additive, idempotent, all through automation's front door

The rules phase runs AFTER members + config, over injected
`Pick<AutomationService, "listRulePresets" | "listRules" | "createRuleFromPreset" | "setRuleEnabled"
| "deleteRule">` — no second write path, every op host-gated inside automation. Per stored rule (cast
position order): catalogue lookup (gone/scope-flipped ⇒ `rulesSkipped`); the target room's
provenance groups (ONE `listRules` read) decide the arm — a COMPLETE group (`count === ruleCount`)
with every bag knob-equal ⇒ `rulesAlreadyPresent` (enable re-asserted); anything else present under
that presetId ⇒ delete those rules and re-mint (v1 knob-edit IS re-mint; this also FLATTENS a
multi-mint room to one instance — the cast is the single authority for that preset's config — and
makes a half-minted set from an aborted earlier apply CONVERGE on retry); absent ⇒ mint. Minted
rules are then ENABLED via `setRuleEnabled` — see 6.5. A mint refusal (`instanceof
DomainOperationError`, the KIT base class — the sanctioned cross-domain error vocabulary, never a
sibling-domain import) is an EXPECTED per-preset outcome (the lore presets' book-attachment consent
gate refuses in a room without the book — deliberately preserved) ⇒ collected into `rulesSkipped`
with its reason; every OTHER error class (a dying room's NotFound) surfaces and aborts, exactly the
member-drive posture. A sans-rules cast performs ZERO automation ops (pinned); non-cast rules —
hand-authored, other presets — are NEVER touched (additive law, same as never-kicks).

### 6.5 Enable-on-apply (flagged decision)

Re-minted rules land born-DISABLED through `createRule` (unchanged law), then the apply enables each
through automation's own host-gated `setRuleEnabled` as the acting host. WHY: the cast captures
ENABLED presets only and B10's owner test is "save a cast + rules; one click into a new chat" — a
disabled landing fails "the accrual travels" and re-imposes the per-room re-enable toil the row
exists to remove. The consent chain: the host enabled these rules in the source room, the cast
surface SHOWS the rules it carries, and the apply click — by the target room's HOST — is the consent
act, executed through the same verb a hand-enable uses (indexes + `rulesChanged` all maintained). A
mid-mint failure leaves an inert half set (never enabled), so the born-disabled safety posture
survives mechanically. *Rejected:* landing disabled (fails the spec's letter).

### 6.6 Coupled sites (delta over §4)

| # | Site | Edit |
| - | - | - |
| 1 | `packages/db/src/schema/automation.ts` | `preset_id` + `preset_knobs` + paired-null CHECK |
| 2 | `packages/db/src/schema/roster-preset.ts` | `rosterPresetRules` junction |
| 3 | `packages/db/src/migrations/` | baseline SQUASH regen (merge-window db drop) |
| 4 | `tooling/src/verify/gates/table-scoping-class.ts` | `roster_preset_rules: junction` |
| 5 | `packages/contracts/src/automation/presets.ts` | `RulePresetKnobValues` + `rulePresetKnobBagsEqual` + header truth-repair |
| 6 | `packages/contracts/src/roster-preset/index.ts` | rule-spec schema + `RosterPresetRuleView` + result arms |
| 7 | `domain/automation` | params/results/persistence/create-rule/update-rule/mint-verb/front door + `resolveChatRulePresetKnobs` |
| 8 | `domain/roster-preset` | ops + belts + junction persistence + the apply rules phase + view projection |
| 9 | `entry/compose/roster-preset.ts` | the automation op wiring |
| 10 | client `features/roster-preset` | capture + display (badge/include-line/editor echo) — copy says "rule", never bare "preset" |
| 11 | tests | §6.7 |
| 12 | docs | this §6; spec §3-S3 truth-repair; the two presets.ts headers |

### 6.7 Test plan (what proves what)

Junction FK physics (cast delete → rule rows gone) · provenance stamped at mint / cleared at
updateRule / projected on RuleView · create/update refuse bad knobs + global-scope presets, store
resolved bags, full-replace swaps rules · apply over FAKE ops (arm classification: mint+enable /
alreadyPresent / replace-on-drift / skip-on-refusal / abort-on-NotFound / zero-ops-sans-rules — the
fake RECORDS calls, the planted control) · apply over the REAL compose graph (SERIAL_INT
`entry/compose/roster-preset.int.test.ts`): rules re-minted + enabled into a fresh room with the
stored knobs; re-apply mints nothing; the lore preset's unattached-book refusal lands in
`rulesSkipped` through the REAL consent gate; non-host refused · contract round-trips · CT: the
rules badge + save include-line.
