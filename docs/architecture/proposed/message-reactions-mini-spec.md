---
kind: spec
status: active
updated: 2026-09-21
---

# MA-2 — message reactions mini-spec (segment-level · character-to-character · prompt-attribution)

> **Current disposition (2026-09-21).** The Unicode reaction plane, segment anchoring, prompt
> attribution, character `react` tool, and client controls shipped in `99b6ba2c6` and `24169def4`.
> Reaction writes already emit the canonical `reactionsChanged` automation fact. Custom emoji is the
> only launch remainder; [#2565](https://github.com/Inktomi93/orbweaver/issues/2565) owns it. This spec
> therefore remains **PARTIAL**, not a dormant unstarted program.

> **Source banner.** This mini-spec is the D55-style entry ticket for a build lane, minted from the
> 2026-07-18 Marinara-Engine audit (v2.0.8→v2.3.3, `reports/research/marinara-delta-features.md` §6 +
> RANKED shortlist #2). Marinara code read in full at
> `references/marinara-engine` (paths cited inline). \*\*DESIGN-FIRST per the BUILD-QUEUE
> §Marinara-audit adoptions rule (MA-2). The proposal and chunk plan below are retained as design
> provenance; the current-disposition banner and live code own what remains.

## Bottom line

Orbweaver now ships user-facing Unicode message reactions, segment anchoring, prompt attribution, and
character reactions. The remaining ruled piece is CAS-backed custom emoji. Marinara shipped a complete,
genuinely good reaction system: Discord-style emoji
chips on a message, optionally targeting one **speaker segment** of a multi-speaker turn, reactable by
**humans AND characters** (`[react: emoji="😂" to "Name"]`), and — the clever part — **fed back into the
next turn's prompt** as an inline note under the exact targeted line. The whole thing is single-user in
Marinara (`extra.reactions` JSON blob, a `"user"` sentinel reactor). Porting it to orbweaver's
**multi-user, variant-split, membership-scoped, arbitration-safe** chat model changes three things
load-bearingly: reactions are **CANON** (bus-emitted, not per-viewer), the reactor is a **participant**
(five planes, not one sentinel), and the store is a **junction table** (not a JSON blob — concurrent
toggles race on a blob). The prompt-attribution loop drops cleanly into the assembly pipeline as a
bounded gather-and-inject seam.

## 1. What Marinara shipped (grounded)

| Piece | Marinara home | Fact |
| - | - | - |
| reaction shape | `packages/shared/src/types/chat.ts:660` `MessageReaction` | `{ emoji, imageUrl?, by: string[], segment?, segmentSpeaker? }` — one entry per emoji, `by` is the reactor list (Discord grouping). `segment`+`segmentSpeaker` present ⇒ targets one speaker segment; absent ⇒ whole message. |
| store | `MessageExtra.reactions?` (JSON on the message) | Single JSON array on `extra`; toggled by a pure `toggleReaction` read-modify-write (`packages/client/src/lib/reactions.ts:63`). |
| reactor identity | `USER_REACTOR = "user"` sentinel · character ids | Human = the `"user"` sentinel (single-user app); a character reacts with its character id. |
| segment index | `packages/shared/src/utils/speaker-segments.ts` (ONE module, client+server) | The shared "segment index N" source of truth so display and prompt-attribution can never drift — the takeaway the report calls worth more than the feature. |
| segment staleness | `splitReactionsBySegment` (reactions.ts) | A segment-keyed reaction lands only when its index is in range AND the stored `segmentSpeaker` still matches; after an edit/regeneration re-segments, orphans **fall back to whole-message** (stay visible + removable, never mis-attach). |
| character→character | `[react: emoji="😂" to "Name"]` bracket command (`services/conversation/character-commands.ts:437`) | Parsed out of the model's own output; personality-gated, optional. |
| prompt attribution | `annotateContentWithReactions` (`routes/generate/conversation-custom-assets.ts:481`) | Next turn: re-segment the stored content, resolve client-shape→prompt-shape by `(speaker, ordinal + marker-line)`, splice an **inline** note (`[Nate reacted with 😂]`) under the targeted group, or an **end** note for whole-message/orphaned. Capped at `REACTION_ANNOTATION_CONTENT_CAP = 32_000` chars (skip segmentation past the cap). |
| render isolation | `MessageReactions.tsx` renders OUTSIDE the card-CSS container | So a character's bubble theme can't restyle the chips. |

## 2. The anchoring decision (the core call)

Marinara stores reactions on the **message** (`extra.reactions`) and lets segment indices go stale on
re-segmentation. Orbweaver's chat model is different in a way that forces a sharper call: **content is
`message_variants`-owned, not message-owned (D26).** A message is a pure slot; every swipe is a distinct
variant with its OWN content, and therefore its own segmentation. A segment index is only meaningful
against one specific variant's rendered content.

**RULING (recommended, owner to confirm): reactions anchor to `(messageVariantId, segmentIndex?)`.**

- **Why variant, not slot:** a segment index without a variant is nonsense (which swipe's segments?). A
  fresh swipe shows its own reactions (empty until someone reacts) — the natural, correct UX. Deleting a
  variant cascades its reactions (FK `onDelete: cascade`). This mirrors how `rpg_snapshots` and
  `spatial_context_snapshots` (Marinara) key per-swipe, and how orbweaver already keys per-variant delta.
- **Segment index is OPTIONAL and points at a grouped speaker segment** of that variant's content (the
  D44 `MessageContentBlock` render is the display; the segment split is a further grouping over the
  markdown block's speaker lines). `segmentSpeaker` is captured at react time exactly as Marinara does,
  so a *content edit that re-segments the same variant* (edit-in-place, not a swipe) degrades a stale
  segment reaction to whole-message display instead of mis-attaching. **Projections degrade, never throw**
  (the `contentSpansToBlocks` doctrine, contracts/chat) — a stale segment index is a fallback, not an error.
- **Alternative flagged as Open-Q A:** slot-level (reactions shared across all swipes of a message). This
  is closer to Marinara's literal storage but breaks segment semantics (segments differ per swipe) and
  raises "does a reaction to swipe #1 show on swipe #2?" — a real product fork, owner's call.

**Swipe / regen semantics (falls out of the variant anchor):**

| Action | Effect on reactions |
| - | - |
| swipe to another variant | shows THAT variant's reactions (its own set; a fresh regen has none) |
| regenerate a variant (new variant row) | new variant = new (empty) reaction set; old variant's reactions stay with it unless the old variant is pruned |
| edit-in-place (same variant, new content) | segment reactions whose index/speaker no longer align degrade to whole-message (Marinara's orphan fallback) |
| delete message / variant | FK cascade drops the reactions |
| fork (deep copy, D27) | reactions copy with the variant rows (fork is a deep copy) |

Block-level (D44 `MessageContentBlock`) targeting is **out of v1** — Marinara has no block reactions, and
orbweaver's segments live inside the markdown block. Reserve nothing for it; add later if a media/card
block ever needs its own reaction (Open-Q E).

## 3. Who reacts (D80 five planes)

Marinara has one sentinel + character ids. Orbweaver's five-plane participant model (D80) unifies every
reactor as a **`chat_participants` seat**:

| Reactor | Plane | Attribution | v1? |
| - | - | - | - |
| a human member | identity=user, authority=Principal | their participant seat (carries their `personaId`) | YES |
| a character | identity=character (no authority) | the character's participant seat; emitted by a turn (§7) | YES |
| an agent | identity=agent, authority=AgentActor+`canAgent` | the agent's participant seat; a `canAgent('react')` gate arm if agents ever react | RESERVED |

**RULING (recommended): the reactor is `reactorParticipantId` (FK → `chat_participants.id`).** This is
the D80-correct unifier — every plane is a seat, so one column covers humans, characters, and (reserved)
agents without a `reactorKind` discriminant. Multiple humans in a group each react distinctly (each is a
participant). A character-to-character reaction (§7) is attributed to the reacting character's seat.
Reactions by non-members are structurally impossible (no seat) — matching the membership scope (D18).

## 4. Persistence shape (junction, not JSON — argued)

**RULING (recommended): a `message_reactions` junction table, NOT a JSON blob on the variant.**

```
message_reactions
  id            (typeid, ID_PREFIX.messageReaction)
  variantId     FK → message_variants.id  onDelete: cascade   -- the anchor (§2)
  reactorParticipantId  FK → chat_participants.id  onDelete: cascade
  emoji         text                       -- unicode "😂" or a custom ":name:" token
  emojiImageAssetId  FK → assets.id?       -- custom-emoji snapshot (D21 CAS), null for unicode
  segmentIndex  integer?                   -- null = whole-variant (§2)
  segmentSpeaker text?                     -- captured speaker for staleness detection (null = narration)
  createdAt     integer (epoch-ms)
  unique(variantId, reactorParticipantId, emoji, segmentIndex)   -- one reactor · one emoji · one target
```

- **Why a junction, not JSON (the load-bearing argument):** reactions are CANON and **multi-user**. Two
  humans toggling the same message concurrently on a JSON blob is a lost-update race (read-modify-write
  the whole array). A junction makes each toggle **one INSERT or one DELETE** — no blob RMW, no lock
  needed (§5). The `unique` constraint makes a double-add idempotent (`INSERT … ON CONFLICT DO NOTHING`);
  a remove is a keyed `DELETE`. This is why Marinara's pure `toggleReaction` array-rewrite does NOT port —
  it's a single-user pattern.
- **Owner derivation (D23): NO `ownerId`.** Walk one FK: reaction → variant → message → chat →
  membership. A reaction is an association row anchored by a required FK to owned canon (the D23 DERIVE
  case, same class as `gallery_items` / `roster_preset_members` / `imagery_generations`). The reactor's
  identity is DATA (`reactorParticipantId`), not the ownership key.
- **Grouping is a read projection.** The Discord "one chip per emoji, N reactors" view is a `GROUP BY
  (variantId, emoji, segmentIndex)` at read time — the DB stores one row per reactor, the contract view
  (`MessageReactionGroup { emoji, imageUrl?, reactorParticipantIds[], segmentIndex? }`) groups. This is
  strictly better than Marinara's stored-grouped array for concurrency.
- **Custom emoji:** Marinara snapshots `imageUrl` on the reaction. Orbweaver routes it through the CAS
  (`emojiImageAssetId` → the image-proxy magic-sniff path) rather than storing a raw URL — an emoji image
  is an asset like any other (Open-Q D: does v1 ship custom emoji at all, or unicode-only? Unicode-only is
  a clean smaller v1).

## 5. Multi-user semantics + the write path

Reactions are **CANON, not per-viewer** — every member of the chat sees the same reaction set (like
messages, unlike a private draft). Two consequences:

1. **A chat bus member is REQUIRED.** A reaction toggle by one member must reach every other member's
   open chat. Add `reactionsChanged` to `CHAT_BUS_EVENT_TYPES` (contracts/chat) carrying
   `{ chatId, variantId }` — the client re-reads that variant's reaction groups on receipt (the
   bus-driven pattern; the client never reads the mutation return, `busDriven: true`). **This is the
   `bus-coverage three coupled sites` change** (memory): the event union member + the DEFERRED/live map +
   the `check-gates.int` fixture, in one change. Recommend it lands LIVE (emitted), not reserved — v1
   ships reactions, so the member is emitted from day one.
2. **The write path is arbitration-safe WITHOUT the turn lock.** Reactions are not turns — they do not go
   through `chat_locks` / turn arbitration. Concurrency safety comes from the `unique` constraint +
   idempotent INSERT/DELETE (§4): a toggle is a single atomic statement, so two members racing on the
   same (variant, reactor, emoji, segment) can't corrupt state (one wins the INSERT, the other no-ops;
   the reactor is distinct anyway since each human is a different participant). The verb emits the bus
   event AFTER the write commits (durable-first, matching `createChatBus`).

**Verbs (domain/chat):** `addReaction(variantId, emoji, segmentTarget?)` and
`removeReaction(variantId, emoji, segmentTarget?)`, or ONE `toggleReaction` verb (returns nothing;
bus-driven). Both `requireParticipant` (membership floor, D18). A tRPC route pair on the `chat` router
→ **needs sweep classification** (the `new-router-needs-sweep-classification` rule: PROBED/EXEMPT in the
cross-tenant sweep, participant-scoped → PROBED).

## 6. The prompt-attribution loop (the clever part)

Marinara's `annotateContentWithReactions` re-segments stored content and injects reaction notes into the
NEXT turn's prompt. Orbweaver home: **a gather-and-inject seam in the chat assembly pipeline**, bounded.

- **Gather seam.** During assembly, for the recent in-context messages, load their selected variant's
  reaction groups (one scoped query, not per-message N+1). This is a read the assembler already has the
  variant ids for.
- **Inject shape.** For each reacted segment, resolve the segment against the variant's content (the
  SAME segment-index module the client uses — port `speaker-segments.ts` as `@orb/kit/speaker-segments`,
  isomorphic, so display and attribution can't drift; this is the report's headline takeaway) and splice
  an inline note under the targeted line: `[Nate reacted with 😂 to Aurey's part ("…")]`. Whole-message /
  orphaned reactions become an end-of-message note. Reactor names resolve through the participant→display
  path (persona-aware).
- **BOUNDED BUDGET (required — not optional).** Two caps, both because a hot chat can accumulate hundreds
  of reactions:
  - a **content cap** (Marinara's `REACTION_ANNOTATION_CONTENT_CAP = 32_000`): skip re-segmentation for a
    message body past the cap (fall back to a bare end-note or drop).
  - a **count cap** (NEW, orbweaver — Marinara lacks it): annotate at most the **most-recent K reactions
    per message** (K ≈ 8, tunable) so a brigaded message can't blow the prompt budget. Older reactions
    are still displayed, just not all re-injected.
    This is a `UserIntent`/assembly-config knob (a floor + owner-tunable), not a magic number buried in the
    shaper — the `reasoning-starves-output` sibling lesson (MA-5) applies: measure the injected token cost
    against the turn budget.
- **Attribution is a `PromptTransform`-class injection** (D50), not a content mutation — the stored
  variant content is never rewritten; the note is spliced into the assembled prompt only.

## 7. Character-to-character reactions

Marinara parses `[react: emoji="😂" to "Name"]` out of the model's own output (a bracket command). Two
orbweaver-shaped options:

- **Option 1 — a tool call (D48 tool-use).** A `react` tool registered on the tool-use registry; the
  model calls it during a turn, the executor writes the reaction attributed to the acting character's
  seat. Clean, structured, rides the built tool-loop — but a tool round-trip per reaction is heavier than
  a bracket command.
- **Option 2 — a post-generation inline command** parsed from the committed message (the D46 macro /
  command surface). Lighter, matches Marinara, but adds a new parse pass over model output.

**RECOMMEND Option 1 (tool)** for structural cleanliness and because orbweaver already has the tool-loop
(`domain/tool-use`, T1–T7 landed) — but flag as **Open-Q C** because it depends on whether the owner
wants reactions in the tool vocabulary vs a lighter command surface. Either way the write path is §4/§5's
verb (the character's participant is the reactor); the model surface is the only difference. v1 could
ship **human reactions only** and defer character-to-character to v2 (Open-Q C).

## 8. The D46 automation trigger — resolved

Orbweaver uses one canonical reaction event for both canon sync and automation: `reactionsChanged`.
The durable reaction write emits it after commit with `added: true | false`; the automation fact resolver
projects the same event. `reactionAdded` was a proposal spelling and is retired — adding it now would fork
one state change into two competing trigger names.

## 9. Client surface (D66 A3 hover cluster)

- **React affordance in the hover cluster.** Add a react button to `MessageActionsRow`
  (`features/chat/components/message-actions-row.tsx`) — the D66 A3 hidden-until-hover cluster
  (Edit/Fork inline + ⋯ menu). A smiley/emoji-picker button opens an emoji picker; picking toggles the
  reaction via the §5 mutation (`busDriven: true`). Segment targeting (if shipped, Open-Q B) reacts to
  the hovered/selected segment.
- **Pill row rendered OUTSIDE the bubble** (Marinara's isolation lesson — a character's card CSS must not
  restyle the chips). A `MessageReactions` component under the message row consuming the grouped view;
  `aria-pressed` for the viewer's own reactions, a tooltip of reactor names (persona-aware). A `@orb/ui`
  primitive if the chip needs to be reused; otherwise a `features/chat` component.
- **Segment-level rendering is gated on the shared segment module.** Orbweaver's `renderSingleBubble`
  renders one bubble per message with a Tide/non-Tide multi-speaker split but **no per-line
  group→bubble explosion** (report §6). Segment-level reaction *display* therefore needs the segment
  split built first. **v1 can ship message-level reactions** (no segment index) and add segment-level
  with the shared module in v2 (Open-Q B). Message-level is a strictly smaller, still-valuable v1.
- **No new media element ban trip:** custom-emoji images (if shipped) go through the `@orb/ui` media
  primitive, not a raw `<img>` (the D44 media-element gate; `media-element-needs-ui-primitive` memory).

## 10. Open questions — RULED (owner, 2026-07-18)

> Owner ruling 2026-07-18: **maximal — "if we don't have something we can make it; not doing
> something because v1 is bullshit."** Every lack-driven deferral below is OVERRIDDEN: the missing
> piece gets BUILT and the feature ships whole. Only design-judgment "no"s survive.

| # | Question | RULING |
| - | - | - |
| A | **Anchor: variant-level vs slot-level?** | **Variant-level** (as recommended — architecture-correct, D26). |
| B | **Segment-level in v1?** | **YES — segment-level ships in the program.** The shared segment-index module (`@orb/kit/speaker-segments`) is BUILT as part of it (MR3 is not optional; a missing module is a build item, not a scope cut). |
| C | **Character-to-character reactions? Tool or command?** | **YES, in the program — via the D48 `react` tool** on the built tool-loop (MR5 is not optional). |
| D | **Custom-emoji reactions?** | **YES — custom emoji ships too** (CAS-backed, additive over the unicode path; the picker surface is a build item). |
| E | **Block-level (media/card) reaction targeting?** | **No** — the one surviving "no", and it is a DESIGN no (segments live in the markdown block; Marinara precedent agrees), not a lack-driven one. Revisitable with its own row. |
| F | **Reaction automation trigger?** | **LIVE as canonical `reactionsChanged`** for adds and removals. The proposed `reactionAdded` spelling is retired. |
| G | **Attribution caps owner-tunable?** | **Yes** — K≈8 + 32k content cap, both knobs (as recommended). |
| H | **Reaction bus member?** | **LIVE (emitted)** (as recommended — reactions are canon). |

## 11. Chunk plan (post-owner-review)

Dependency-ordered; each chunk green (`pnpm check` + `pnpm test`) before the next.

1. **MR0 — contracts + schema (born-whole).** `message_reactions` table (§4) on the baseline;
   `MessageReactionGroup` view + `reactionsChanged` bus-event member (`CHAT_BUS_EVENT_TYPES` +
   DEFERRED map + `check-gates.int` fixture — the three coupled sites); `ID_PREFIX.messageReaction`;
   the live `reactionsChanged` automation-trigger member (Open-Q F). Tests: schema DDL + the bus-member
   coverage fixture.
2. **MR1 — domain/chat verbs + tRPC + sweep.** `toggleReaction` (or add/remove) verb, `requireParticipant`,
   grouped-read; the bus emit (durable-first); the tRPC route pair + **sweep classification** (PROBED).
   Tests: verb persistence (idempotent add, keyed remove, cascade on variant delete), the participant floor.
3. **MR2 — client surface (message-level).** React button in `MessageActionsRow`; the `MessageReactions`
   pill row (outside the bubble); the `busDriven` mutation + `reactionsChanged` apply arm. Verify by
   exercising the flow (two-tab canon sync) + a side-eye pass. v1 stops here if the owner picks Open-Q B
   "message-level first".
4. **MR3 — the shared segment module + segment-level.** Port `speaker-segments.ts` →
   `@orb/kit/speaker-segments` (isomorphic); the group→segment split; segment targeting in the UI + the
   staleness fallback. (Gated on Open-Q B.)
5. **MR4 — the prompt-attribution loop.** The assembly gather seam + the bounded inject (§6, the K + content
   caps); reactor-name resolution; the `PromptTransform`-class injection. Tests: attribution shape,
   the caps bite, stale-segment fallback. **This is the engagement payoff — reactions steer the story.**
6. **MR5 — character-to-character (gated on Open-Q C).** The `react` tool (D48) or command surface; the
   character-seat attribution; personality-gated model guidance.

MR0–MR2 (+ MR4 if the loop is wanted early) is a coherent v1; MR3/MR5 are the segment + character
extensions.
