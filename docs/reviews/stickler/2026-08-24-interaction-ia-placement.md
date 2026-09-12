---
kind: review
status: draft
updated: 2026-08-24
---

# Interaction direction — IA/UI placement (geometry · physics · homes; NO mockups)

> **Provenance.** Owner-commissioned placement pass over the committed
> `docs/design/interaction-direction-spec.md`: every user-facing surface gets a SECTION · REGION
> (LIST|CONTENT|CONTEXT) · ANCHOR/REGISTRY home · MOBILE posture · the physics rules it obeys,
> each with a law receipt (`UI-Architecture-and-Layout.md` = "UI §", `client-architecture-lockdown.md`
> \= "LD §", SET-SEAMS, D66/D62/D121). One adversarial stickler round run to convergence. Spec
> deltas this pass forces are FLAGGED in §4 — the committed spec is not edited.
>
> **The one as-built correction everything below keys on:** UI §4.2's per-section grid lists the
> Chats CONTEXT as five tabs (Members·Overrides·Group·Preview·Injections) — the TREE has since
> consolidated it to THREE: **Members · "This chat" (Overrides + Injections + Group + Background +
> Tool-use as host-gated SECTIONS inside one body) · Preview (host-only, `crown`)** —
> `features/chat/lib/chats-section.tsx:54-88` ("Overrides + Injections + Group + Background +
> Tool-use consolidated into ONE 'This chat' tab … the permission-omit, now per-section"). Code is
> truth (LD §15 doctrine); placements below target the as-built strip, and the §4.2 grid row is a
> doc-rot note for the next UI-law touch.

## §1 The master placement table

| Surface (spec row) | Section · REGION | Home (anchor / registry / tab) | Mobile posture | Physics obeyed (receipts in §2) |
| - | - | - | - | - |
| offer-choices toggle (B1) | Chats · CONTEXT | a section inside the **"This chat"** tab (the chat-behavior section family) | CONTEXT → sheet (one-shell) | UI §4.2 CONTEXT=config-of-artifact; SET-SEAMS self-owned section |
| offer-choices per-user default (B1) | settings modal | the **chat-behavior pane** (`features/chat` owns its sections — `chat-behavior-*-section.tsx` under `features/chat/lib`, SET-SEAMS landed) | settings modal full-bleed | LD §8 features-own-panes |
| wand one-shot (R3) | Chats · CONTENT | `composer-utility-menu.tsx` (existing home; un-gate the item) | same (composer is CONTENT) | D111 wand = the composer control map |
| rules list + fire log + Test/Run-now (B2) | Chats · CONTEXT | a **"Rules" SECTION inside "This chat"** — beside the Tool-use/Background sections, host-gated per the tab's own per-section permission-omit | CONTEXT → sheet | UI §4.2 physics 1 (actions ON the artifact); §2.1 argues vs a 4th tab |
| preset picker (B2) | Chats · CONTEXT | the Rules section's "Add rule" flow (a popover/select over the preset catalog — a picker, not a modal-worthy interrupt) | inline in the sheet | UI §4.3 rule 5 LIST-finds/CONTENT-does n/a — CONTEXT config |
| global automation remainder (B2) | settings modal | **NONE v1** — the existing `automation` pane stays `placeholder: true` (LD §8 names it unbuilt); §4 Δ2 | — | honest empty; no pane minted without content |
| home automation tile retirement (B3) | Home section | delete the dormant tile from the **home-tiles contributor registry** at B3 (its own header: "disappears by construction the day the chips consume the channel") | — | LD §9 registry census (`home-tiles`) |
| quick-reply chips (B3) | Chats · CONTENT | the S1 control registry delivered as ONE **`above-composer` chat-surface contribution** (`CHAT_SURFACE_ANCHORS`, LD §6c; room-state arm) | in-column above composer (CONTENT is the mobile landing) | §2.2: stacking, turn-phase busy, accent |
| confirm cards + refusal invitations (B4/A4) | Chats · CONTENT | the SAME above-composer contribution — cards render above chips within the one S1 mount | same | §2.2 |
| /imagine (B5) | Chats · CONTENT | a **slash-command contribution** (`SlashCommandContribution`, the live door registry — `chat-slash-commands.ts` shape) | ⌘K + composer both consume the one registry | LD §5 rule 4 derive-don't-redeclare |
| image preview → edit (B5) | Chats · CONTENT → modal | the **lightbox** (existing `@orb/ui` primitive) on the message image → an **`imageEdit` modal** (modal registry, chat-owned, `trigger: {placement:"content"}`) | modal | UI §4.2 physics 5 modals-for-interrupts (§2.3 argues it) |
| set-as-background (B5) | Chats · CONTEXT + CONTENT shortcut | the "This chat" **Background section** (existing host-gated seam) + a same-action shortcut on the image detail — ONE store/verb path | sheet | UI §4.3 rule 10 same-action-same-home |
| provenance read (B5) | Chats · CONTENT | the lightbox's detail strip (mono data accents) | same | UI §4.3 voice table |
| reaction pills (B6) | Chats · CONTENT | **`message-footer`** chat-surface contribution (per COMMITTED row only — the seam already excludes ghost/draft rows, LD §6c) | §2.4: coarse targets + band budget | #220 band-budget receipts |
| reaction picker (B6) | Chats · CONTENT | fine pointers: the **message-actions hover cluster** (`message-actions-row.tsx`; D66 A3 hidden-at-rest); coarse: an item INSIDE the `RowActionsMenu` (⋯), never a new inline cluster button (§2.4) | cluster always-visible at coarse; picker behind ⋯ | UI §4.3 rule 4 progressive disclosure |
| segment targeting (B7) | Chats · CONTENT | same cluster, scoped to the hovered/selected span | coarse: whole-message default | reactions spec MR3 |
| check chip — the ASK (B8) | Chats · CONTENT | the S1 above-composer mount (game-mode arm) | in-column | ask=transient (spec S1 law) |
| roll result — CANON (B8) | Chats · CONTENT | a **tool-renderers contribution** (`tool-renderers` door registry — renders from the persisted `ToolCallRecord`) | in-thread | result=canon provenance (spec S1 law; the legacy chip split) |
| clock widget (B9) | Chats · CONTENT | a **`thread-flank`** chat-surface contribution rendering `SegmentedClock` (@orb/ui meter family, D52) over `vars`; config lives in the Rules section | flank stacks BELOW the thread <512px container (LD §6c built-in) | §2.5 argues vs CONTEXT |
| save-a-cast (B10) | Chats · CONTEXT | a host action in the **Members** tab ("Save cast…") | sheet | CONTEXT actions-on-artifact |
| apply-a-cast, new chat (B10) | modal | the **new-chat picker** (`newChat` modal, chat-owned) gains a "Start from saved cast" arm; `/new-chat` slash reaches it | modal | UI §4.3 rule 2 (character-first) + §4.2 physics 5 (picker-modal) |
| apply-a-cast, existing chat (B10) | Chats · CONTEXT | Members tab "Add cast…" (host) | sheet | same |
| cast library management (B10) | **Configuration** · LIST+CONTENT | a **`CollectionContribution`** in the Configuration section ("the roster of the LIBRARIES the others are built from" — UI §4.1; group band → member editor in CONTENT) | Configuration's own mobile fate | UI §4.2 Configuration grid row |
| C1–C3 analysis knobs | Chats · CONTEXT | rows inside the **Rules section** (steer knob, cadence, confirm-first flips) | sheet | no new surface |
| C1 guidance visibility | Chats · CONTEXT | **CONFIRMED sufficient: the as-built Preview tab** — host-only by `when: (s) => s.isHost` + `crown` (`chats-section.tsx:83-88`); no new surface | Preview rides the CONTEXT sheet | F6 no-UI ruling upheld |
| C3 rewrite card | Chats · CONTENT | the S1 card variant: summary + a collapsible **`@orb/ui/diff`** body (the legacy edit-proposal-chip lesson) + Confirm/Dismiss | in-column | §2.2 card physics |

## §2 The argued calls (each with WHY + the rejected alternative)

### 2.1 B2's per-chat rules = a SECTION inside "This chat", not a fourth CONTEXT tab

WHY: the as-built consolidation ruling moved exactly this class INTO one tab with per-section
host-gating ("the permission-omit, now per-section so the strip drops slots without dropping
controls" — chats-section.tsx:62-66); a Rules section beside Tool-use/Background follows the
landed direction. CONTEXT physics hold: rules are config/actions ON the room (UI §4.2 physics 1),
never navigation. The fire log renders as a compact recent-fires list inside the section (mono
data accents); Test/Run-now are per-row actions. *(Rejected: a fourth tab — the strip was JUST
consolidated 5→3, and a tab per feature is the god-strip vector; rejected: the settings modal —
rules are per-room state, not user/app preferences (UI §4.2: "Generation config is NOT settings"
is the same class line); rejected: CONTENT — the room's working surface is the thread, and
section content never lives in a modal either (rule 5).)*

### 2.2 The S1 mount = ONE above-composer contribution; the in-band physics

- **The mount chokepoint maps onto the EXISTING seam:** S1's registry renders through a single
  `above-composer` `ChatSurfaceContribution` (room-state arm, LD §6c) — the "anchor renders
  registry output only" chokepoint the spec demands, with zero new mount machinery. Zero
  controls ⇒ the contribution renders nothing ⇒ byte-identical (the seam's own M8 property).
- **Stacking when controls contend:** cards above chips (an authority decision outranks a
  send-suggestion); at most ONE card visible across BOTH card classes — stored-arm confirm
  cards AND rate-refusal invitations share the one display slot (newest of either shows; a mono
  "+N pending" count discloses the rest). Class-2 invitations get the display semantics the
  spec leaves implicit (flagged as Δ8): one pending invitation per rule (replace on re-refusal),
  the same TTL sweep as class 1, dismiss drops it. Chips are one wrapping row, already capped
  at 4 (`QUICK_REPLY_MAX_CHOICES`).
- **Turn-phase physics per the spec's per-mode busy law:** send-mode chips turn-phase-disabled
  with the reason on title; execute-mode card buttons disabled only while their own mutation is
  pending (spec S1).
- **Accent budget (UI §4.3 rule 9 ≤10%, rule 3 one-primary):** the composer **Send is CONTENT's
  ONE `primary`** (rule 3's own parenthetical) — so a confirm card's buttons are NEVER
  `intent="primary"`: neutral/outline buttons + a hairline accent left-border on the card as its
  attention cue. A card that shipped a primary button would put two primaries in CONTENT — a
  rule-3 violation by arithmetic, not taste.
- **Dismissal affordance:** every card carries an explicit dismiss (✕) — rule 1 no-dead-ends
  (the host can always decline); chips self-expire (TTL / next fire's replace) and need none.
- Mobile: above-composer sits in the CONTENT column; one-shell holds (mobile lands on CONTENT —
  UI §4.1); coarse targets via the token floor (axis 3 — the pointer-conditional token, never a
  feature variant, `no-pointer-variants-in-features`).

### 2.3 B5's edit flow is a modal — argued against rule 5's letter

Rule 5: modals for interrupts and pickers ONLY. An image edit (prompt tweak → regenerate →
accept) is an INTERRUPT on the reading flow with a bounded outcome — the same class as the
new-chat picker, not section content (it configures nothing durable about the room; it produces
one artifact and closes). It registers as a `ModalDefinition` (chat-owned, `placement:"content"`
trigger — the lightbox's edit affordance), inheriting `modal-registry-completeness` for free.
*(Rejected: a CONTEXT tab — the edit is per-image transient, and CONTEXT follows the ARTIFACT
(the chat), not a message's media; rejected: inline expansion in-thread — a form inside the
transcript violates the reading surface's quiet (rule 9) and the thread's virtual-list geometry.)*

### 2.4 Reaction pills under the #220 band budget

\#220's lesson, located precisely (stickler-corrected): the inverted band was the NAME band —
the bubble HEADER (speaker 16% wrapped ×3, action cluster 73%; fixed identity-first, actions
collapsed to a 48px inline+menu, credit `HIDE_AT_COARSE`). The pills' placed home is a
DIFFERENT band: `message-footer` is its own stack BELOW the bubble, rendered after
`MessageToolCalls` and `MessageMetadataRow` (`message-row.tsx:354-360`) — it contains no
identity, so "pills after identity" is not a constraint here. What #220 DOES bind on this band
is its budget discipline: the pills row joins an already-populated footer stack as a THIRD quiet
row, ONE line with overflow collapsing to a "+N" chip (never wrapping ×3 — the #220 failure
shape), chrome-quiet (rule 9 — muted fills, count in mono; the accent never colors a pill at
rest), and it must not re-crowd the coarse row the #220 fix just re-budgeted: coarse pointers
get the ≥44px HIT AREA via the pointer-conditional token wrap while the visual box stays small
(UI §4b axis 3's explicit sub-44px-visual + ≥44px-hit pattern). The picker does NOT ride the
footer at all — at FINE pointers it is an item in the hover cluster (D66 A3); at COARSE it
lands INSIDE the `RowActionsMenu` (⋯), NOT as a new inline cluster button — the cluster is
always-visible at coarse (`REVEAL_AT_COARSE`), and a new inline button there is exactly the
rest-state chrome #220's 48px budget exists to refuse.

### 2.5 The clock is thread-flank, not CONTEXT

WHY: a countdown is ambient play state the room WATCHES during reading; CONTEXT defaults
collapsed in every section (UI §4.1) — a collapsed clock is a dead countdown. `thread-flank`
exists for exactly this (room-anchored, beside the thread, auto-stacking below it under 512px of
container width so it can never crush the prose column — LD §6c's own responsive law), and
`SegmentedClock` is a built @orb/ui primitive (D52 meter family). *(Rejected: a CONTEXT tab —
collapse-by-default kills it; rejected: an rpg-style region CLAIM — the claim seam is for a
feature owning the WHOLE pane in a declared state (HUD-1), and a plain-room widget must not
evict the Members/This-chat/Preview strip; rejected: a HUD overlay — no such plane exists for
plain rooms and minting one is the god-surface reflex.)*

### 2.6 The cast library is a Configuration collection

Saved casts are "a library others are built from" — the Configuration section's stated charter
(UI §4.1: "the roster of the LIBRARIES the others are built from"; its LIST is "one COLLAPSED
group per registered `CollectionContribution`", §4.2 grid). The collection group band (icon ·
kicker · count · create) + the member editor mounting in CONTENT ("never a dialog" — §4.2
Configuration row) come free from the section's existing machinery. *(Rejected: a new rail
section — D121's ceiling is about KIND, and a small library is a collection, not a workspace;
rejected: managing casts only from the Members tab — rename/delete of a LIBRARY artifact from
inside one room hides the library (rule 10's one-home would break the day two rooms disagree).)*

## §3 Cross-cutting compliance (the checklist the stickler verifies)

- **One-shell mobile:** every placement is CONTENT, CONTEXT (→ sheet), a modal, or the settings
  modal — no new viewport `@media` anywhere (`no-media-queries-in-features` untouched); the
  flank's responsive stack is the seam's own `@container` law (LD §6c). ✓
- **No `features/automation` mirror:** every automation-facing surface lands in `features/chat`
  (sections/contributions) or the door registries; the only settings pane named already exists
  as a placeholder. ✓ (spec's own law, upheld.)
- **One primary per region:** Send stays CONTENT's one primary; the Rules section's "Add rule"
  is the CONTEXT pane's action (and if the D66-A2 one-primary-per-panel pattern applies, it is
  the pane's New). ✓
- **Accent ≤10%:** cards = hairline border; pills = quiet; clock = meter tokens (the meter
  primitive's own palette discipline). Review-tier + the side-eye lens at each row's land. ✓
- **Progressive disclosure:** picker in the hover cluster (A3); Test/Run-now one click into the
  Rules section; nothing new at rest on the message row except the pills row itself. ✓
- **Enforcers, honestly:** the three TOTAL registries (sections/modals/settings-panes) are
  tsc-total; the placements this pass actually mints are CONTRIBUTOR registries — door-assembled
  (G8 one-assembly) + construction-time duplicate-id throws + their named gates
  (`chrome-registry-completeness`, `modal-registry-completeness`), NOT compile-total;
  section additions inside "This chat" are review-tier (the tab body is chat-owned composition);
  the accent/band budgets are review + side-eye tier (no gate measures them — stated, not
  wished).

## §4 Spec deltas forced by this pass (flagged; the committed spec is NOT edited)

1. **Δ1 (B2):** "a rules section in the chat settings section family" sharpens to: a Rules
   SECTION inside the as-built "This chat" CONTEXT tab. Also a DOC-ROT note for the next UI-law
   touch: UI §4.2's Chats CONTEXT row (five tabs) is superseded by the as-built three-tab strip.
2. **Δ2 (B2):** the "genuinely global rides a settings section" sentence has NO v1 content — the
   `automation` settings pane stays `placeholder: true`; nothing global exists until a real
   surface wants it (budgets are per-chat; presets are code data reached via the picker).
3. **Δ3 (B9):** "render home named at build" is now NAMED: a `thread-flank` chat-surface
   contribution rendering `SegmentedClock`.
4. **Δ4 (B5):** two small costs the spec's B5 cell didn't name: a `SlashCommandContribution` row
   - an `imageEdit` `ModalDefinition` (both door-registry members; `modal-registry-completeness`
   - the trigger-placement vocabulary are their enforcers).
5. **Δ5 (B10):** one cost the spec's B10 cell didn't name: the Configuration
   `CollectionContribution` (the library-management home) — LIST group + CONTENT editor ride the
   section's existing machinery.
6. **Δ6 (S1):** the "ONE mount per anchor" chokepoint is REALIZED as a single above-composer
   `ChatSurfaceContribution` consuming the control registry — S1 rides the existing M8 seam;
   no new mount mechanism is built.
7. **Δ7 (B8):** the roll-result canon chip mints a `tool-renderers` door-registry member
   (`compose/authed-app.tsx:144`) the spec's B8 cell doesn't name — the same door-registry cost
   class Δ4 flags for B5.
8. **Δ8 (S4/B4):** class-2 refusal invitations need the display/storage semantics the spec's
   §3-S4 leaves implicit — one pending invitation per rule (replace on re-refusal), the class-1
   TTL sweep, and the shared one-visible-card slot (§2.2). A spec sentence, not a redesign.
9. **Δ9 (B9):** the spec's own owner test "host resets it" has NO placed mechanism — a clock
   reset is a `vars.X` STATE write and no host variable-write door exists for plain rooms. The
   affordance PLACES on the Rules section's clock row; the MECHANISM is a spec-level decision
   the B9 build must own (smallest candidates: R7 `runRuleNow` over a preset-minted reset rule,
   or a narrowly-scoped host variable-write verb) — flagged, not decided here.

**Clarifying note (stickler's unconfirmed item):** between B2 and B3 the dormant automation home
tile stays AS-IS (its teaser copy still true — the chips are not yet consuming the channel); the
spec's "the tile is the door" reads as citing the tile's own doorway self-description, not as a
B2 retarget obligation. Retirement stays scheduled at B3 per the tile's own stated contract.
