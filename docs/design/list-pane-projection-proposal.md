---
kind: spec
status: draft
updated: 2026-08-01
---

# LIST-PANE PROJECTION — the character screen's pane becomes her chats (face → history → play)

**Status:** DESIGN SPEC — DRAFT, nothing here is built beyond the landed seams §2 inventories.
Owner-ratified direction (workboard §DISCUSSION PILE "LIST-PANE RENT" + the ratification of the
projection recommendation): *"chats with this character" is the character screen's list-pane content —
face → history → play.* Owner steer mid-draft: the deliverable designs the **NEW PROJECTION — the two
list roles (character picker · chats-with-her) combined into ONE pane slot as a modal flow** — and
judges the more radical reading (**one globally unified launcher rail**) as a first-class alternative
the owner can rule between.

**The governing guardrail, stated first (D18 RATIONALE RIDER, `Core-Path-Registry.md:49`):** D16/D18/D28
exist jointly to avoid the SillyTavern coupling smell — the character panel as chat LAUNCHER, chats hung
off a character. In orbweaver a chat is FIRST-CLASS; characters are library entities a chat references
through the roster. **Any "chats with this character" surface must be a filtered PROJECTION of
first-class chats — never a home, never a launcher-ownership seam.** The rejected concrete shape is
marinara's `chats.characterIds` array. Every arm in this spec is measured against that rider; §7 names
the enforcement tier that makes a violation RED per arm.

**Evidence:** full-file reads 2026-08-01 of the panel/section/row chain —
`packages/client/src/features/chat/lib/chats-section.tsx` · `chat/surfaces/chat-list-surface.tsx` ·
`chat/lib/chat-summary-row.ts` + `chat/components/chat-summary-row.tsx` · `chat/lib/filter-chats.ts` ·
`chat/components/chat-list-header.tsx` · `features/character/lib/characters-section.tsx` ·
`character/surfaces/character-editor-surface.tsx` · `character/surfaces/character-library-surface.tsx` ·
`character/lib/character-list-view.ts` · `character/components/character-hero-band.tsx` (head) ·
`state/{chat-list-filter-store,section-registry,create-drill-selection-store,active-chat-store,shell-store}.ts` ·
`lib/view-transition.ts` · `server/src/domain/chat/contract/views.ts` ·
`server/src/domain/chat/contract/params.ts` · `contracts/src/user-bus/index.ts` ·
`client/src/data/invalidation.ts` (chat rows) · `components/library-surface.tsx` ·
`preset/components/preset-library-row.tsx` · `world-info/surfaces/world-info-library-surface.tsx` (head) ·
`app-shell/surfaces/app-shell.tsx` (LIST mount region) · `main.tsx` (door region). Law read IN FULL:
the seven `UI-*.md`/lockdown/motion docs, `ui-cohesion-north-star.md`, `density-pass-spec.md` (approved),
`hud-home-spec.md` (sibling program), the D-ledger D16/D18/D28/D62/D66 entries, workboard §LIST-PANE
RENT, and the visual audit §F5/§F7 (`docs/reviews/stickler/2026-08-01-visual-blech-audit.md`).

**Mocks (authored with this spec — the owner rules from pixels, not vibes):**
`docs/design/mocks/list-pane-projection/character-launcher.html` (Arm A: picker ⇄ projection ⇄ empty,
the full row anatomy incl. the shared group room) ·
`docs/design/mocks/list-pane-projection/unified-rail.html` (Arm C at its honest best beside Arm B —
the duplication cost rendered visibly). House style per the `panel-redesign/` set.

**Sibling programs (this spec composes with, never fights):** `hud-home-spec.md` (CONTEXT panel — zero
file overlap with the LIST panes; §9.2 here records the one interaction) ·
`density-pass-spec.md` S5 ("LIST panes + library grids" — §9.1 sequencing) · SET-SEAMS
(`set-seams-spec.md` — owns the settings modal's nav pane, which is NOT a shell LIST pane; §6 note).

---

## 1. The direction, restated as a contract

The character screen today: LIST = the character library (always), CONTENT = her editor, CONTEXT =
Field/Links/Options. Her chats are reachable only by LEAVING — the hero's "N chats ›" sets a filter
chip and jumps to the Chats section (`character-editor-surface.tsx:158-161`).

The ratified shape: **the LIST pane is modal.** No selection → it is the **picker** (the library,
unchanged). A selected character → the SAME pane slot becomes **her history**: a pinned identity header
(the face), a back affordance, the New-chat CTA, and the chats-with-her rows — snippet, game marker,
star, archived recede, real portraits. You pick a face, her history stands beside her card, and any
row (or New) is one click into play. The two rail slots' JOBS combine in one pane without merging the
rail: finding a character and finding your history with her become one flow.

What makes this cheap is that it is **a projection of reads that already exist** — no new server verb,
no new store, no new query key, no schema change. §2 is the receipt.

## 2. Current state — the projection is half-landed as scattered seams (recon 2026-08-01)

| seam | code | what it gives the projection |
| - | - | - |
| `ChatSummary.participantCharacterIds` | `server/src/domain/chat/contract/views.ts:78-84` | the reverse "which chats include character X" read, **deliberately including DEPARTED seats** ("every chat you've had with them"), deduped, bulk-read per page (no N+1). Contract-designed for exactly this surface (the FINAL-Character §7 Activity tab cite in its doc comment) |
| `ChatSummary.lastMessagePreview` | `views.ts:62-68` | the row's scent line — newest **visible** message, flattened + capped server-side, per-caller by construction (the D16 history floor resolves from the viewer's own participant row; a member whose floor hides everything gets `null`, never a leak) |
| `ChatSummary.isGame` / `star` / `archived` / `viewerRole` / `parentChatId` | `views.ts:52-89` | the row markers (game = the ONE `isRpgEngaged` predicate over `metadata.rpg`, so the list marker can never disagree with the room it opens) |
| the row composite | `chat/components/chat-summary-row.tsx` (F7, landed) | portrait-over-blob via `Avatar` (`blobUrl(hash)`), `Swords` game marker with a text label, star `Icon label="Starred"`, archived = a TEXT `Badge` + `opacity-60` recede — the a11y-datum rule already honored (`:44-80`) |
| the ONE display derivation | `chat/lib/chat-summary-row.ts:43-52` | title fallback chain · snippet-or-identity subtitle · `lastMessageAt ?? updatedAt` recency — shared by list rows, landing recents, and the command palette (derive-W5), so a new consumer CANNOT drift |
| the portrait resolver | `chat-summary-row.ts:28-36` + `chat-list-surface.tsx:110-113` | `chatPortraitHash(participantCharacterIds, avatarHashById)` — the surface owns one non-blocking `character.list` read (`{limit: 200}`, decoration-grade: never blocks or errors the list) |
| the per-character filter | `state/chat-list-filter-store.ts` + `chat-list-surface.tsx:131` | `chats.filter((c) => c.participantCharacterIds.includes(id))` — the projection PREDICATE, live today behind the chats-section chip, with its own empty state ("No chats with {name} yet. Start one, or clear the filter." — `:141`) |
| the resume map | `character/lib/character-list-view.ts:92-108` | `resumeTargets(chats)` — characterId → most-recent chat, a pure render derivation over the SAME `listChats` cache (the library card's Chat CTA rides it) |
| the hero affordances | `character-editor-surface.tsx:145-161` | `chatCount` derived in render from the cached list; `onNewChat` (`startNewChat({characterIds:[id]})` + section jump); `onViewChats` (filter chip + jump) — the flow this spec brings HOME to the pane |
| freshness | `contracts/src/user-bus/index.ts` (`chatsChanged`) → `data/invalidation.ts:220` · emit sites incl. `chat/engine/engine.ts:1161` | every canon/lifecycle change fans `chatsChanged` to each present member's devices → `listChats` refetches. The projection is the SAME query key, so it inherits app-wide freshness with ZERO new wiring |
| the swap slot | `state/section-registry.ts:53-57` (`list?`/`listHeader?`) + `app-shell.tsx:186-188` | the LIST pane + its chrome band are definition-owned render props — the shell is blind; a definition may render ANYTHING there, including a mode-swapped pane |
| the door precedent | `main.tsx:149-151` (`makeChatsSection(…)`, `makeCharactersSection(…)`) | section factories already take door-injected foreign content (M3/M8 contributor posture) — the legal channel for chat-owned UI inside the characters section |

Two receipts that BOUND the design:

- **`chat.listChats` has NO server-side character/search param** — `ListChatsParams` is
  `{ includeArchived? }` only (`contract/params.ts:85-87`); the read returns the caller's whole unpaged
  membership list, newest-updated first (`verbs/read.ts:410-412`). The projection is therefore a
  CLIENT-SIDE filter over the one cached list — which is exactly the D18-clean shape (and the
  performant one: single-user scale, the list is already in cache on the character screen because the
  library's resume map reads it, `character-library-surface.tsx:101-102`).
- **`participantNames` is PRESENT roster only; `participantCharacterIds` includes departed seats**
  (`views.ts:75-84`). A room she has since left appears in her history (correct — it IS a chat you had
  with her) with her absent from the name line. No extra field needed; §3.5 states the rendering rule.

## 3. THE CENTERPIECE — the modal pane (Arm A, ratified direction, full anatomy)

> **Mock:** `mocks/list-pane-projection/character-launcher.html` — all three states of this section
> side by side (picker → projection → empty), with the design notes inline.

### 3.1 The two roles of one slot

```
CHARACTERS section, LIST pane
┌────────────────────────────────────────┐
│ role 1 — PICKER (selection = null)     │   role 2 — PROJECTION (selection = her)
│ band: CHARACTERS · 42        [+ New]   │   band: [‹] CHATS · Azarael      [+ New chat]
│ toolbar · chips · favorites strip      │   ┌ identity row ───────────────────────┐
│ character rows / cards (unchanged)     │   │ (portrait md)  Azarael              │
│                                        │   │ 7 chats · last 2h ago               │
│                                        │   └─────────────────────────────────────┘
│                                        │   search (when >8 rows)
│                                        │   chat rows — snippet · ⚔ · ★ · archived
└────────────────────────────────────────┘
```

- **Role 1 is byte-identical to today's library** (`character-library-surface.tsx`) — bulk mode, tag
  chips, categorized view, favorites strip all keep their home. The picker is not redesigned here.
- **Role 2 replaces the pane the moment a character is selected** — the same moment CONTENT becomes her
  editor. Face (identity row) → history (rows) → play (row click or New chat). The pane and the editor
  read as one statement about one character.
- The swap key is the section's OWN drill selection (`useSelectedCharacterId`,
  `state/character-selection-store.ts:22`) — reader shape 2 of §5.1 (own-section, render-only). No
  effect, no new state: the pane is a render derivation of a pointer that already exists.

### 3.2 Ownership + the seam (who renders what — the one-directional answer)

The projection rows are CHAT anatomy over a CHAT read; the pane host is the CHARACTERS section. The
one-directional resolution (lockdown §6c, the `makeChatsSection` factory precedent):

- **`features/chat` exports the projection body** on its front door: `ChatsWithCharacterPane`
  (props: `{ characterId, characterName, onNewChat }`) — internally it reuses `ChatSummaryRow`,
  `ChatListRowMenu`, `chatPortraitHash`, `filterChats`, and the extracted predicate (§3.3). Chat owns
  chat-row anatomy and the `listChats` consumer; nothing is hoisted, nothing forks.
- **`makeCharactersSection` gains a second injected param**:
  `chatsProjection: (view: CharacterChatsProjectionView) => ReactNode` (a `#lib/registry-contracts`
  published shape, the O5 posture). `main.tsx` threads chat's export in at the door
  (`main.tsx:149-151`); character composes it blind. character never imports chat; chat never imports
  character; `client-features-no-cross` keeps enforcing it.
- **`features/character` owns the swap decision and the pinned chrome**: the `list()` render prop
  branches on its own selection; the identity row, back affordance, and the band's projection mode are
  character-rendered (they are character identity, sourced from `character.get`/the library cache the
  section already holds).

```tsx
// characters-section.tsx (sketch — the definition stays a pure data object)
list: () => <CharacterLibraryAnchor><CharactersListPane chatsProjection={chatsProjection} /></CharacterLibraryAnchor>,
listHeader: () => <CharactersListHeader />, // band swaps by the same selection read (§3.4)
// CharactersListPane (character-owned):
//   selectedId === null ? <CharacterLibrarySurface/> : <ProjectionShell characterId={selectedId}>{chatsProjection(view)}</ProjectionShell>
```

### 3.3 The predicate — ONE home, semantics pinned

Extract the inline filter (`chat-list-surface.tsx:131`) into
`features/chat/lib/chats-with-character.ts`:

```ts
/** The D18 projection predicate: chats whose character seats (present OR departed) include `id`. */
export function chatsWithCharacter<T extends { participantCharacterIds: readonly CharacterId[] }>(
  chats: readonly T[], id: CharacterId): readonly T[]
```

Consumed by BOTH the chats-section filter chip and the projection pane — one predicate, one home, and
a unit test pinning the departed-seats semantics (the contract's own doc comment is the oracle,
`views.ts:78-84`). The hero's `chatCount` (`character-editor-surface.tsx:147`) and `resumeTargets`
stay as they are (count = `chatsWithCharacter(...).length` after L0 lands, so the hero and the pane
can never disagree).

### 3.4 The chrome band (D66 A1/A2 honored in both modes)

The band is definition-owned (`SectionDefinition.listHeader`, `section-registry.ts:53-57`), so it
swaps with the pane — `CharactersListHeader` reads the same selection:

- **Picker mode:** `CHARACTERS` micro-caps + live count, and the panel's ONE primary — **New**
  (character create) — closing the A1/N2 gap: characters passes NO `listHeader` today (only
  chats/corpus/analytics do — grep receipt in §6), its title/actions still live in the in-surface
  toolbar. This spec's L1 migrates the band per the chats pattern (`chat-list-header.tsx` is the
  template: non-suspending count off the shared cache, title + action render immediately).
- **Projection mode:** a leading **back** chevron (`aria-label="Back to all characters"`, ghost,
  `ChevronLeft`) + `CHATS · <name>` micro-caps + the ONE primary — **New chat** (`Plus`, label "New
  chat") firing `startNewChat({characterIds:[id]})` + `setActiveSection("chats")` (the existing hero
  handler, `character-editor-surface.tsx:151-155`, moved to its one home). P2 holds: one primary per
  surface per mode, and the mode determines WHICH create the pane owns.

The identity row (below the band, pane content): portrait (`Avatar size="md"`, `blobUrl(avatarHash)`,
initials fallback) · name (`Text` label voice) · a gloss line `7 chats · last 2h ago` (count +
`timeLib.formatRelative` of the newest row's `when`) — mono/micro/muted per the voice table. It is an
`instrument`-tier island per the density map (§6): `p-row` pad, `rounded-base`, no border box (CD1 —
it is read-only identity, a kicker-weight header, not a card).

### 3.5 States (every one designed — §4.3 rule 8)

| state | render | receipts |
| - | - | - |
| loading | shape-matched `SkeletonRows shape="avatar-row"` — but in practice a CACHE HIT: the library already holds `listChats` for its resume map (`character-library-surface.tsx:101`), so entering projection is usually zero-fetch | `data/skeleton-rows.tsx` |
| no chats yet | `EmptyState` — icon `MessagesSquare`, title "No chats yet", description "No chats with {name} yet — start the first one.", action = primary **New chat**. The copy + action EXIST at `chat-list-surface.tsx:132-146` (the filter-chip empty state); the projection reuses the same body. Empty teaches and acts — never a dead end (rule 1; empty-states-are-load-bearing) | `empty-state-has-action` (LIVE) |
| populated | rows newest-first (server order — `listChats` is newest-updated first, `read.ts:410`; no re-sort). Row = `ChatSummaryRow` verbatim: portrait/stack · title · snippet subtitle · relative time meta · markers · kebab (`ChatListRowMenu` — rename/star/archive/delete keep working from her pane) | §2 rows |
| many chats | a search input appears above the rows when the projection exceeds ~8 rows (the `useDeferredValue` + `filterChats` pattern verbatim); the pane scrolls (`overflow-y-auto overscroll-contain`, the chats-list shape). No virtualization — parity with the chats pane (plain Stack; the projection is a subset of an already-unpaged list) | `chat-list-surface.tsx:53,165` |
| games mixed in | the `Swords` "Game chat" marker rides in from `ChatSummaryRow` untouched — a live game with her reads distinctly at a glance | `chat-summary-row.tsx:55` |
| starred / archived | star `Icon label="Starred"` (warning hue); archived = TEXT badge + `opacity-60` recede, shown only when `includeArchived` — the projection passes the same list the chats pane shows (no separate archived policy; one list, one truth) | `chat-summary-row.tsx:56-61,79` |
| a room she LEFT | included (the departed-seats contract, §2) — the row renders normally; her absence from `participantNames` means the title/subtitle name the PRESENT cast. No "departed" marker exists in `ChatSummary` and none is proposed (the history claim is "you had this chat with her", which is true) | `views.ts:78-84` |
| error | `QueryErrorState label="chats with {name}"` + real retry (the QueryBoundary handshake) | `data/query-error-state.tsx` |

### 3.6 The group-room rendering (a 3-character room must read SHARED, not owned)

> Rendered in the mock's projection panel — "The Crimson Court" row (AvatarStack of three + overflow).

In her pane every row contains her — the differentiator is the rest of the cast. Two rules:

1. **Multi-seat rooms lead with an `AvatarStack`, not a single portrait.** The primitive exists and is
   exported (`@orb/ui/avatar-stack`, `packages/ui/package.json:12` — N overlapping Avatars + a "+N"
   chip that IS one more Avatar). Rule: `participantCharacterIds.length >= 2` → stack (max 3 + chip),
   resolved through the same `avatarHashById` map; single-seat rooms keep today's single portrait.
   This is a `ChatSummaryRow` upgrade (a `portraits` prop generalizing `portraitHash`), so the CHATS
   pane inherits it in the same commit — one row anatomy, both surfaces, no fork (R2's bar: same
   anatomy, 2 features, changing together).
2. **The title already carries shared-ness** — the fallback chain renders the full present cast
   ("Nate, Azarael, Kev", `chat-summary-row.ts:14-20`), and the subtitle carries the snippet. No
   "owned by" phrasing anywhere; the pane header says "CHATS · Azarael", the rows say who is in the
   room. The projection never claims the room is HERS — it claims she is IN it. (This is the D18
   rider's UI half: the surface's grammar must teach membership, not ownership.)

### 3.7 The swap interaction — motion, focus, keyboard

- **Motion:** the pane swap is a section-internal structural transition → the hand-rolled View
  Transition seam (`lib/view-transition.ts` — the ONE legal wrapper; router VT cannot fire on a
  reducer change). Wrap the character section's `select`/`clear` writers in `withViewTransition` in
  `state/character-selection-store.ts` (state→lib import is the landed pattern —
  `active-chat-store.ts:13,62`; the drill FACTORY stays untouched so other sections keep today's
  behavior). Duration/curve are the browser's VT cross-fade — consistent with rail-section switches
  (`shell-store.ts:179-186`); no new tokens, no stagger (rows are a group arriving via cross-fade;
  stagger is reserved and unnecessary — guide §3.10 cap vs §3.8 frequency). `prefers-reduced-motion`
  removes it entirely inside the wrapper (guide §3.9 — REMOVE, not shorten).
- **Focus (the WCAG obligation of a pane swap):** entering projection moves focus to the pane
  container (`tabIndex={-1}` + `useFocusOnMount` — the standing surface pattern,
  `chat-list-surface.tsx:56-57`); the first Tab lands on the band's back affordance. **Back restores
  focus to her row in the library** — the landed back-focus pattern
  (`character-editor-surface.tsx:138-139,232-235`: a `backFocusId` handed to the re-mounting list, the
  facet-editor precedent applied to the library). A swap that drops focus to `<body>` is a defect,
  not a polish item.
- **Keyboard path:** rail ⇥ band (back → New chat) ⇥ search ⇥ rows (each row is a `ListRow`
  `clickable` — real button semantics from the primitive) ⇥ per-row kebab (hover-reveal has
  `focus-within` parity per P3/A3). Esc is NOT bound to back (Esc belongs to overlays/modals —
  `app-shell.tsx:150-156`; a second Esc meaning would race the slide-over close on narrow shells).
  ⌘K continues to reach everything.
- **Text is the datum:** every marker keeps its text form (labels/badges — §3.5); the pane announces
  as `aria-label="Chats with {name}"` `role="list"`; the count lives in the identity gloss as TEXT.
  The relative-time stamp stays in the row's `meta` slot (inside the accessible description —
  `chat-summary-row.tsx:45-48`).
- **Panel-mode composure:** the swap changes pane CONTENT only — dock/overlay/collapse, the 64rem
  auto-overlay, and the focus toggle are untouched shell mechanics (lockdown §4 O6). On MOBILE the
  LIST is a sheet: the projection is simply what the sheet shows while she is selected; the hero's
  "N chats ›" becomes "open the pane" (`setOpenOverlayPanel("list")` on narrow viewports) instead of
  a cross-section jump (§3.8).
- **`<Activity>` continuity:** rail round-trips restore the section exactly (selection stores +
  pane-keeping, §4.2 rule 2) — leave Characters mid-projection, return, the projection is still
  there with scroll intact.

### 3.8 What Arm A retires, keeps, and amends

- **KEEPS the filter-chip seam** (`chat-list-filter-store.ts`) — it is the CHATS-section arm of the
  same projection (and Arm B's mechanism, §5.2). One predicate serves both (§3.3).
- **AMENDS the hero affordances** (`character-editor-surface.tsx:149-161`): "N chats ›" stops
  jumping sections — wide: focus the projection pane; narrow: open the LIST sheet. "New chat" is
  unchanged (it must land in the room, so the section jump is correct there).
- **AMENDS UI-Arch §4.2's Characters row on ratification:** the grid's CONTEXT cell reads "activity
  (chats with them) + actions" — never built there (as-built CONTEXT is Field/Links/Options,
  `characters-section.tsx:39-58`). The activity surface's home becomes the LIST projection; the §4.2
  row is amended, not silently contradicted (the D-entry is the orchestrator's to mint, with the D18
  rider cited).
- **RETIRES nothing else.** The picker, bulk mode, favorites, resume-CTA all stand.

## 4. The chats-screen pane (the other rail slot) — instruments judged honestly

### 4.1 Live-instrument rows — what exists TODAY vs needs a contract field

| signal | status | receipt |
| - | - | - |
| snippet + recency, live across devices | **EXISTS.** `lastMessagePreview`/`lastMessageAt` refetch on every `chatsChanged` fan (turn commit, lifecycle, fork, image, narrator — `engine.ts:1161`, `chat-lifecycle.ts:106`, `fork.ts:481`, `start-chat.ts:460`) | §2 freshness row |
| game marker · star · archived · portraits | **EXISTS** (F7, landed) | `chat-summary-row.tsx` |
| host-vs-member | **EXISTS in the contract**, unrendered (`viewerRole`, `views.ts:85-89`). Verdict: leave unrendered — role is not scan-value in a single-owner install; revisit with multi-human dogfood | — |
| "streaming NOW" dot on a non-open room | **DOES NOT EXIST and is not free.** The chat bus is per-room member-scoped SSE — only the OPEN room streams to you; the user bus fans at COMMIT, not at turn start, and a `turnActive` flag cannot be a DB projection (it is process state). The honest path is the SSE-MULTIPLEX program (workboard QUEUE 2: rooms/presence vocabulary) — a per-user rooms socket can carry turn-lifecycle ticks for member rooms. **DEFER; do not fake it** with a commit-latency proxy | `transport/trpc/chat-events-bus.ts` posture; workboard §QUEUE 2 |
| unread state | **DOES NOT EXIST.** No per-viewer read cursor in the contract (`ChatSummary` carries no `viewerLastSeenSeq`; nothing writes one on open). Needs: a contract field + a participant-row write on room open + the row chrome. Real work with a real payoff — flagged as a contract-field item, sequenced AFTER multiplex (same participant-row territory) | `views.ts:52-92` absence |
| snippet SEARCH | **CHEAP TODAY** — `filterChats` matches title + participant names only (`filter-chats.ts:18-24`); adding a `lastMessagePreview` arm is a one-line predicate widening + test. The subtitle is now VISIBLE text; search should match what the eye scans | owner decision D6 |

### 4.2 The auto-collapse-to-rail arm — judged, and judged NO

The workboard sketch (arm 1): once a chat is open, the LIST auto-collapses to a slim glyph rail,
reclaiming ~280px. Against the code and the sibling programs:

- The shell already has a THREE-mode panel model with persistence, per-section defaults, a focus
  toggle, and the 64rem auto-overlay regime (`resolvePanelMode` — lockdown §4/M10). A glyph-rail is a
  FOURTH mode: a new `PanelMode` member, a new grid track in `shell.css`, new `resolvePanelMode`
  algebra arms, new persistence semantics, and a second miniature row anatomy (glyph-only chat rows —
  exactly the "compressed form is the permanent form" defect HUD-HOME F6-2 just paid to remove).
- The payoff is weak by construction: reclaimed LIST width does NOT widen prose — leftover width
  feeds the centered CONTENT gutter (`--width-shell-content` clamp; lockdown §15 reconciliation), and
  immersion already has a one-keystroke answer (the focus toggle = both panels collapsed, D62 rule 6).
- The right side of the frame is about to be reshaped by HUD-HOME; tuning left-side reclaim before
  the HUD lands is polish on a moving frame.

**Recommendation: DROP the arm** (owner decision D5). Revisit only with post-HUD screenshots showing
a real problem the focus toggle doesn't solve.

## 5. "Combining the two rail slots" — the radical arm, first-class

> **Mock:** `mocks/list-pane-projection/unified-rail.html` — Arm C rendered at its honest best (faces
> with nested threads + the "Everything else" bucket, the Crimson Court duplication marked in red)
> beside Arm B (the faces strip over the landed filter-chip seam).

### 5.1 Arm C — ONE unified launcher rail (characters ∪ chats as one global surface)

The strong reading: merge the Chats and Characters rail entries into one launcher section — faces with
their recent threads nested (ST-launcher feel), or a mixed home rail of faces + threads.

**What it buys (honestly):** one mental model — every "start or resume" flows through one pane;
ST-migrant familiarity (the character panel WAS the launcher there); one fewer rail decision; the
face→history flow is the DEFAULT everywhere rather than a per-screen mode.

**What it costs (honestly, each named):**

1. **The chats-as-rooms door.** Rooms that are not "a character's chats" — multi-character rooms,
   characterless "Blank chat" drafts (an explicit first-class pick, D62 P4), agent-seated and
   multi-human rooms — need a non-face home inside the launcher. Every sketch converges on an "All
   threads" bucket beside the faces… which is the two-list problem reborn INSIDE one pane, with
   worse geography.
2. **Nesting duplicates or elects.** A 3-character room either appears under three faces
   (duplication — acceptable for a projection, but the UI now renders the same room thrice) or under
   an ELECTED primary face — and electing a primary character for a room is precisely marinara's
   `chats.characterIds` ownership smell re-derived as UI (the D18 rider's named rejected shape). The
   grammar of "her threads, nested under her" teaches chats-belong-to-characters even when the data
   stays clean. Arm A's grammar ("chats WITH her", she is IN rooms) does not.
3. **The library's non-launcher jobs lose their home.** Bulk mode, tag chips/categorized view,
   import, archived management (`character-library-surface.tsx` whole file) are management surfaces,
   not launcher content — they would need a second home (a management mode? CONTENT grid?), which is
   a real migration, not a repaint.
4. **Structural churn:** `SECTION_IDS` surgery (7→6) ripples the section registry, chrome registry +
   mobile tab curation (`Chats · Characters · Corpus · You`, D62 P3), ⌘K, per-section selection
   memory, G1/G2 fixtures, and the placeholder-copy registry. All gate-guided, none free.
5. **It already half-exists at CONTENT tier.** The LANDING surface (D62 P4 — hero + recent chats +
   character quick-picks) IS the combined launcher, rendered where a combined launcher belongs: the
   no-selection CONTENT state. Building a second combined launcher in the LIST tier duplicates it.

**Where the reads would live if built:** the same two cached reads (`chat.listChats` +
`character.list`), folded client-side (`resumeTargets` + `chatsWithCharacter` are the fold's halves —
both exist). Nothing about Arm C REQUIRES a D18 violation server-side; the pressure is entirely in
the UI grammar (cost 2) and the structure (costs 1/3/4).

**Verdict: NOT RECOMMENDED.** Arm A delivers face→history at LIST tier and the landing delivers the
mixed launcher at CONTENT tier; Arm C buys familiarity those two already provide, at high churn and
with the one cost that cannot be gated away — a UI that teaches ownership the architecture rejects.

### 5.2 Arm B — the lightweight synthesis (the chats pane learns faces)

A middle reading of "combining the two slots" that COMPOSES with Arm A instead of replacing the rail:
the CHATS pane gains a compact **faces strip** at its top — recent/starred characters as small
portraits (the `CharacterFavoritesStrip` anatomy, `character-library-surface.tsx:181`). Tapping a
face sets the LANDED filter chip (`setChatListCharacterFilter`) — the same pane instantly becomes her
threads, chip + empty-state + New-chat already built (`chat-list-surface.tsx:61,83-97,131-146`).

- Rides entirely on landed seams: the filter store, the chip, the predicate (§3.3 gives it the one
  home), the character-list cache the pane already reads for portraits (`:112`).
- Zero registry/rail surgery; the D18 grammar stays "filtered by", visibly a chip you can clear.
- Cost: one more strip of chrome in the chats pane (density S5 must size it; instrument tier, no
  boxes), and a curation rule for WHICH faces (recommend: `resumeTargets` recency order, capped ~8).

**Recommendation: ratify as the chats-screen arm** (owner decision D1) — Arm A gives the character
screen its history; Arm B gives the chats screen its faces; together they are "the two slots
combined" with the rail untouched.

## 6. Per-screen list-pane law (the supporting table — tier-mapped to density §3.1)

Density tier for every row below: **LIST panes = instrument** (`density-pass-spec.md:122` — surface
inset `p-field`, blocks `gap-tight`, island pad `p-row`, atom gap `gap-field`, `rounded-control`,
**no border boxes — selection is a bg tint**, already the landed `list-row` skin: `bg-primary/10` +
left accent rail, `packages/ui/src/primitives/list-row/variants.ts:16-18`). Band = the
`.shell-panel-header` chrome row (D66 A1), content definition-owned via `listHeader`.

| section | the pane IS | band (`listHeader`) | as-built gap |
| - | - | - | - |
| **chats** | conversation rows (snippet · portraits/stacks · ⚔ ★ archived) + search + the filter chip; Arm B adds the faces strip | `CHATS · count` + **New** — BUILT (`chat-list-header.tsx`) | faces strip (B); snippet search (D6) |
| **characters** | **MODAL (Arm A):** picker ⇄ chats-with-her projection | picker: `CHARACTERS · count` + **New** · projection: `‹ CHATS · <name>` + **New chat** — swap-aware | NO `listHeader` today (title lives in the in-surface toolbar); L1 builds both modes |
| **corpus** | the search omnibox + target picker + results — the section's primary ENTRY (law amended 2026-07-13: default-docked precisely because collapsing it hid the only way in) | `CorpusListHeader` — BUILT (`corpus-section.tsx:37`) | none (leave alone) |
| **worldInfo** | book rows + search (`LibraryListLayout`) | **MISSING** — micro-caps title still in-surface (`components/library-surface.tsx:74-79` renders it; no `listHeader` in the section def) | A1/N2 band migration (L4 sweep; the layout composite header collapses into the band) |
| **presets** | preset rows (F5 scent subtitles LANDED — `preset-library-row.tsx:56-58`) + active-for-generation Select + search | **MISSING** — same `LibraryListLayout` in-surface title | same L4 sweep |
| **refinery** | DECLARED-PLANNED (`content: {planned}`); pane defaults collapsed | n/a | none until built |
| **analytics** | leaderboard list, default-collapsed | `AnalyticsListHeader` — BUILT (`analytics-section.tsx:46`) | none |
| **settings** | **NOT a shell LIST pane.** Settings is a full-bleed modal; its left nav is the SET-SEAMS program's surface (`set-seams-spec.md` — approved-to-build). This spec deliberately does not touch it; the shell LIST system and the settings nav stay two mechanisms | n/a | pointer only |

## 7. The D18 guardrail, threaded structurally (per arm — a prose boundary is a wish)

**Where the projection reads live (Arm A + B):** ONE consumer chain, no new anything —

> `chat.listChats` (the first-class membership read, `viewerRole`/floor resolved per-caller
> server-side) → the ONE TanStack cache entry (`trpc.chat.listChats.queryOptions({})`, key
> proxy-derived) → `chatsWithCharacter(chats, id)` (the one predicate, `features/chat/lib/`) → rows
> rendered by chat-owned components, hosted by the characters section through the door.

Freshness inherits `chatsChanged` invalidation because the key IS the chats pane's key — the
projection can never show a different truth than the Chats section (one cache entry, one truth).

**The walls, by enforcement tier:**

| violation | wall | tier |
| - | - | - |
| character imports chat (or vice versa) to build the pane | `client-features-no-cross` (LIVE dep-cruiser) — the pane threads at the door via the `makeCharactersSection` factory param; a direct import is RED today | resolve/lint |
| the projection minted as a second store ("her chats" mirrored into zustand) | `state-files` + the three store doors + G27 `selection-store-via-factory` (a bare `create()` is RED); `bus-onData-no-store-write` guards the SSE path; lockdown §12's verdict row makes a server-row mirror RETIRE-on-sight | lint |
| a second query shape for "her chats" (an ad-hoc key, a bespoke fetch) | `no-array-literal-querykey` (keys are 100% tRPC-proxy) + G9 `query-machine-seals` (`useMutation`/`useInfiniteQuery` sealed) — the only spellable read IS `trpc.chat.listChats` | lint |
| a second spelling of the predicate | the L0 extraction makes `chatsWithCharacter` the one home, unit-pinned on departed-seat semantics; both landed consumers (chip filter, hero count) migrate onto it in the same commit — the "old beside new" shape is the banned half-migration | test + review |
| the server grows a character-scoped chat HOME (a `listChatsForCharacter` verb with its own scoping, or marinara's `chats.characterIds` column) | D18's standing shape is the wall the ledger already holds: `chats` has no `ownerId`, `fetchOwned` never applies, access is `requireParticipant` — a new verb/column re-deriving character ownership fails ledger review against D18 + D23 (the ownership-stamp test). **This spec requires NO server change**, which is itself the strongest posture: the D-entry rider (orchestrator-minted on ratification) records that the projection is client-side BY DESIGN and any server-side "chats of a character" read must be a membership-scoped projection, never a scoping seam | ledger/review |
| the pane swap smuggled through a parallel map or a route branch | G1 anti-god-map + G2 `no-parallel-section-map` + G8 (door-only assembly) — the swap lives INSIDE the definition's own `list()`/`listHeader()` closures | lint |
| Arm C's dangerous half, if ever revisited: an elected "primary character" per chat | no gate can ban a UI grammar — this is exactly why §5.1 recommends rejection; the D23 test walls the COLUMN form (a `primaryCharacterId` fails "derive, don't stamp" review), and the rider names the array form | ledger/review |

## 8. Global interaction rules (both panes, one grammar)

- **Row click = play, always** — `selectChatFromList(chatId)` + `setActiveSection("chats")` from the
  projection (cross-section action carries its subject through store actions — §4.2 physics rule 4;
  `active-chat-store.ts:101` already closes the mobile slide-over). The room never renders inside the
  characters section; rooms live where rooms live.
- **HUD-HOME composition:** a projection row into a game room lands in the chats section where (post
  HUD-1) the rpg claimant owns CONTEXT. Zero shared files with HUD-HOME (`hud-home-spec.md` scope =
  the CONTEXT chain; this spec = LIST surfaces + section defs). The only touch-point is the `isGame`
  marker, which reads the SAME `metadata.rpg` predicate the takeover gate reads (`views.ts:69-74`) —
  the marker and the panel cannot disagree.
- **Density:** every pane in §6 composes on the instrument-tier steps once S1's mechanism lands; the
  projection's identity row and Arm B's faces strip are named S5 sweep items so the density lane
  can't miss them (§9.1).
- **Motion:** one rule — pane-content swaps ride `withViewTransition`; rows never animate on
  arrival/scroll; hover-reveal owns the kebab (P3/A3); reduced-motion removes the VT wholesale.

## 9. Build shape — stages, each shippable

| stage | lands | rides existing seams / needs new | verified by |
| - | - | - | - |
| **L0 — the predicate home** | extract `chatsWithCharacter` to `features/chat/lib/`; migrate the chip filter (`chat-list-surface.tsx:131`) + the hero count (`character-editor-surface.tsx:147`) onto it in the same commit | existing only; zero visual delta | unit tests (incl. departed-seat pin); scoped lane battery |
| **L1 — the modal pane (Arm A)** | chat exports `ChatsWithCharacterPane`; `CharacterChatsProjectionView` published in `lib/registry-contracts.ts`; `makeCharactersSection` second param + door thread (`main.tsx`); character's `CharactersListPane` swap + `CharactersListHeader` (both band modes — this ALSO closes characters' A1/N2 band gap); identity row; back-focus restoration; VT wrap on select/clear; hero "N chats ›" re-pointed (§3.8) | existing seams only — **no server change, no contract change, no new store** | CTs: swap renders from a seeded cache · back restores focus to her row · New-chat fires `startNewChat` with her id (assert the store action fired, not a UI echo) · empty state renders with action · projection rows == `chatsWithCharacter(cache)` ids; snap: band baseline zero-drift (flat/ramp ± glass), projection at 1280/wide; side-eye pass |
| **L2 — shared row upgrades** | `ChatSummaryRow` `portraits` (AvatarStack for ≥2 seats, both surfaces); snippet-search arm in `filterChats` (if D6 yes) | existing (`@orb/ui/avatar-stack`) | CT: stack renders + falls back; predicate tests |
| **L3 — the chats-screen arm (Arm B, if ratified)** | faces strip over the filter-chip seam; curation = resume-recency, cap ~8 | existing (filter store, chip, `resumeTargets`, portrait map) | CT: face-tap sets the chip + scopes rows; snap + side-eye |
| **L4 — the band sweep** | `listHeader` for presets + worldInfo (the `LibraryListLayout` in-surface title collapses into the band; A2's ONE primary New per pane) | existing | snap: four-header baseline; §9 checklist lines |
| **DEFERRED (contract-field items, post-SSE-multiplex)** | streaming-now ticks (rooms socket) · `viewerLastSeenSeq` unread cursor (participant-row write + field + row chrome) | NEW contract fields + emit/write paths — named here so nobody fakes them client-side | their own specs |

**Sequencing vs the sibling programs (§9.1):** L0–L2 touch LIST surfaces + section defs only — no
collision with HUD-HOME (CONTEXT chain) at any stage. Density: S0–S2 (mechanism) are independent; S5
sweeps LIST panes — run S5 AFTER L1/L3 so it sweeps the projection + faces strip once, not twice
(the exact HUD-1/S3 ruling shape, `hud-home-spec.md` §9.1). Never run L1 and density-S5 concurrently
on the same files (concurrent-lanes gate-thrash). SET-SEAMS: zero overlap (settings nav is not a
shell LIST pane). **(§9.2)** The one HUD touch-point is read-only (`isGame`); no ordering constraint
either way.

## 10. Owner decisions — every genuine fork, with recommendations

| # | decision | recommendation |
| - | - | - |
| **D1** | **The headline ruling: Arm A (per-screen modal pane, as ratified) · Arm A+B (plus the chats-pane faces strip) · Arm C (one unified launcher rail).** Rule from the mocks: `character-launcher.html` vs `unified-rail.html`. | **A now, B as the chats-screen arm (A+B = "the two slots combined" without rail surgery); C rejected** — §5.1's five costs, led by the ungateable one: a nested-under-faces grammar teaches the chat-ownership model D18 exists to reject, and the landing already IS the mixed launcher at CONTENT tier |
| D2 | The swap trigger: unconditional (selection ⇒ projection, back = deselect) vs a band toggle (`Library \| Chats` segmented, selection kept) | **unconditional** — the ratified modal flow; one selection axis, no extra chrome; back is one click and ⌘K covers cross-jumps. The real cost (can't browse the library while editing her) is the direction's honest price — a toggle can be added later without unwinding anything |
| D3 | Group rooms in her pane: single first-portrait (today's resolver) vs `AvatarStack` for ≥2 seats | **AvatarStack** — shared-ness must be legible at rest (§3.6); the primitive exists; the chats pane inherits the same upgrade so the row anatomy stays ONE |
| D4 | Projection ordering: server recency order vs starred-first | **server order** — identical to the chats pane (one truth, one order); the star is a MARKER, not a sort key; a diverging order between the two surfaces would read as two different lists |
| D5 | The auto-collapse-to-rail arm (workboard arm 1) | **DROP** (§4.2) — a fourth panel mode for width the prose column doesn't receive, against a landed one-keystroke focus toggle; revisit only post-HUD-HOME with screenshots |
| D6 | Snippet search: widen `filterChats` to match `lastMessagePreview` | **YES** — one predicate arm + tests; search should match what the row visibly says (the workboard's "cheap adjacent call") |
| D7 | Streaming/unread instrumentation | **DEFER to post-SSE-multiplex as contract-field work** (§4.1) — the streaming dot needs the rooms socket, unread needs a per-viewer cursor write; both named, neither faked |
| D8 | The hero's "N chats ›" under Arm A | **re-point in place** (§3.8): wide = focus the projection pane; narrow = open the LIST sheet. The count stays (it now derives from the same predicate, L0) |
| D9 | The band's projection mode: back + `CHATS · <name>` + New-chat in the BAND, identity row in the pane (recommended) vs everything in one in-pane header (band stays `CHARACTERS`) | **band swaps** — the band is the panel's chrome voice and its ONE primary must be the pane's actual primary (A2); a `CHARACTERS` band over her chats would mislabel the pane for a screen-reader user landing on the band |
| D10 | §4.2 doc amendment (Characters CONTEXT "activity" cell → the LIST projection) + the D18-rider D-entry | **approve both on ratification** — the amendment is recorded in §3.8; the D-entry mint is the orchestrator's |
| D11 | **Star rest-visibility (the §12 grammar's one surviving fork):** unpressed star hidden-at-rest everywhere (revealed on hover/focus, coarse always) — which RETROFITS the character card's landed always-visible-both-states star — vs keep the card's posture and let lists diverge | **unify on pressed-always / unpressed-revealed** (quieter rows; the marker earns rest pixels only when it carries state) — but it reverses a shipped posture on the card, so it is the owner's call, not spec fiat |
| D12 | The three §11.2 mints (`ListPaneHeader` · `FaceStrip` · `RowToggleAction`) as tier-2 composites, each retiring its live hand-copies in the same commit | **approve** — all three clear the R2/§13.0 placement bars on verified receipts; zero new primitives/tokens/variants needed |

## 11. Primitives inventory — the build material (fugly-prevention; owner-directed follow-up)

> **Ruling context:** Arm A + Arm B approved; the MOCKS' look is the approved target. This § walks both
> approved mocks element by element and names, for each, the EXISTING `@orb/ui`/tier-2 piece that
> renders it — verified against the variants files, not assumed — or the NEW piece to mint. The
> anti-fugly law it enforces: **a mock element needing a size/weight/tone no variant offers is a NEW
> VARIANT row, never a `className` override.** The F2 lesson is now written INTO the button seal
> itself: `size-*` on custom tokens is opaque to tailwind-merge, so a call-site override of a sealed
> size silently loses to the variant (`packages/ui/src/primitives/button/variants.ts` — the `media`
> size's own comment). Features compose primitives + the layout kit; zero feature CSS.

### 11.1 Element-by-element (both approved mocks)

| mock element | verdict | renders as / mint spec |
| - | - | - |
| the chrome band container (48px, hairline) | EXISTS — shell-owned | `.shell-panel-header` via `PanelChrome` (`app-shell.tsx:186`); content arrives through `SectionDefinition.listHeader` — nothing to build |
| the band title cluster (`CHATS · Azarael` + mono count) | **NEW tier-2 composite: `ListPaneHeader`** | Three landed headers hand-copy the identical `Row(Heading micro/caps/semibold + Text micro/mono/muted)` cluster today — `chat-list-header.tsx:27-36`, `corpus-list-header.tsx:22-33`, `analytics-list-header.tsx:16-27` — and Arm A adds two more modes: the §13.0 bar (3+ sites AND changing together) is met. Home `components/list-pane-header.tsx` (the LibrarySurfaceShell owner-ruling precedent: composites live client-shared, not `@orb/ui`). API: `{ back?: { label: string; onClick: () => void }; title: string; accent?: string; count?: number; action?: ReactNode }` — `accent` is the foreground entity-name half (`CHATS · <b>Azarael</b>`), `action` the panel's ONE primary. CT: cluster voices (micro/caps + mono) via `toHaveCSS` against `TOKENS`; back is focusable + labeled; exactly one `action` node renders |
| the back affordance (`‹`) | EXISTS | `Button intent="ghost" size="icon"` + `Icon icon={ChevronLeft}` (in the icons seal — the characters stop landed "ChevronLeft Back"). The mock's 26px square yields to the token size (`size-control-md`: 34px fine / 48px coarse) — the mock is a look target, never a geometry override |
| New / New chat primary | EXISTS | `Button intent="primary" size="sm"` + `Icon Plus` — the landed A2 pattern (`chat-list-header.tsx:37-40`) |
| the pinned identity row (portrait · name · `7 chats · last 2h ago`) | EXISTS — feature composition, no mint | `Row align="center" gap="block" padding="row"` (the layout kit HAS a `padding` variant — `layout/variants.ts:12-18,41`) + `Avatar size="md"` + `Stack`(`Text` name, `Text size="micro" tone="muted" className="font-mono"` gloss — the landed mono-micro idiom). Instrument-tier island: no border box (CD1). Density S1's `Text.voice` re-voices it (`label`/`gloss`) when it lands — build on today's axes, S5 sweeps |
| portrait / initials avatar | EXISTS | `Avatar` (`sm`/`md`, `hueSeed`, `blobUrl(hash)` src, initials fallback) — sizes are display tokens (24/32/40 post-PP4) |
| the group-room stack | EXISTS at `sm` | `AvatarStack size="sm" max={4}` in the `ListRow` leading slot (`@orb/ui/avatar-stack` — overlap map has `sm/md/lg/hero`; display-only, right for a leading slot). The mock's 20px `xs` is NOT minted — it yields to the 24px `sm` token. **No `xs` avatar size** unless a real density defect appears in S5 |
| the chat row (title / snippet / meta time / markers / actions) | EXISTS | `ListRow` — leading · `title` · `subtitle` (truncating) · `meta` (title-line mono stamp) · `actions` sibling · **`renderActions(collapsed)` + `collapseBelow`** (the collapse-aware arm §12 uses) · `density` · selection skin (2px ember bar + 10% tint). The `portraits` generalization is a prop change on the FEATURE composite `ChatSummaryRow`, not a primitive change |
| markers (⚔ · ★ · Archived) | EXISTS | labeled `Icon` (`Swords`/`Star`) + `Badge intent="neutral" size="sm" tone="soft"` — landed F7 anatomy (`chat-summary-row.tsx:53-61`); the star's ROLE changes in §12 (marker → toggle), primitives unchanged |
| the row state-toggle (star as a pressable) | **NEW tier-2 composite: `RowToggleAction`** (small) | 2 features render the same anatomy (character-card's inline star, `character-card.tsx:140-147`; the chats row gains it in §12) — R2 places a 2-feature composite at tier 2. Home `components/row-toggle-action.tsx`. API: `{ pressed: boolean; onToggle: () => void; labelOn: string; labelOff: string; icon: LucideIcon; pressedClassName?: string; rest: "always" | "when-on" }` — a `Button intent="ghost" size="icon"` carrying `aria-pressed`, the pressed tone (e.g. `text-warning` fill), and the `rest` posture (`when-on` = visible at rest only while pressed; unpressed rides `ROW_REVEAL`). CT: `aria-pressed` flips; coarse-pointer always-visible; the control box meets the per-pointer floor |
| the faces strip + captioned face chip (Arm B) | **NEW tier-2 composite: `FaceStrip`** | Generalizes the landed `CharacterFavoritesStrip` (avatar-in-Button, no captions) — 2 features, same anatomy, changing together. Home `components/face-strip.tsx`; the favorites strip becomes its first consumer (retiring the private copy — no old-beside-new). API: `{ items: readonly { id: string; name: string; avatarHash: string | null }[]; selectedId: string | null; onSelect: (id: string) => void; caption?: boolean }`. Face = `Button intent="ghost" size="media"` (content-sized — the F2-safe size for a display-token child) wrapping `Avatar size="md" ring={selected ? "accent" : "none"}` + optional `Text size="micro"` caption (truncate ~6ch); `aria-current` on the selected face; `role="list"` strip, horizontal scroll. The active ring is the EXISTING `Avatar ring="accent"` variant — no new ring styling. CT: selected face carries ring + `aria-current`; caption truncates; per-pointer floor on the face button |
| the filter chip row (`Filtered: Azarael ✕`) | EXISTS | landed feature composition (`chat-list-surface.tsx:83-97`): `Badge intent="info" tone="soft"` + ghost icon clear — stays chat-local (one consumer) |
| the projection empty state | EXISTS | `EmptyState` (icon · title · description · `action` slot) — the landed copy + primary New chat at `chat-list-surface.tsx:132-146` moves into the pane body |
| search input | EXISTS | `Input` + aria-label (landed) |
| pane scroll shell | EXISTS | `Stack` + the landed `h-full min-h-0 overflow-y-auto overscroll-contain` className idiom (legal on primitives; values are token-free layout) |

### 11.2 The mint list (summary)

Three NEW pieces, all tier-2 `components/` (each replaces live hand-copies in the same commit it lands,
per the no-half-migration law): **`ListPaneHeader`** (retires 3 hand-assembled band clusters, gains the
Arm A two-mode band) · **`FaceStrip`** (generalizes + retires `CharacterFavoritesStrip`'s private copy) ·
**`RowToggleAction`** (the §12 state-toggle; character-card's inline star migrates onto it). Zero new
`@orb/ui` primitives, zero new tokens, zero new variants — every size/weight/tone the approved mocks
need already has a variant, verified against `button/variants.ts`, `avatar/variants.ts`,
`layout/variants.ts`, `list-row/variants.ts`. Each mint ships with its CT per the §13.7/§13.8 bar
(token assertions via the generated map, the 8 interactive states where interactive, per-pointer floor).

## 12. Row actions — the kebab escape (owner: "I REALLY hate having to click the three dots")

### 12.1 What the kebabs actually hold today (read, not assumed)

| list | kebab contents | inline today |
| - | - | - |
| chats (`chat-list-row-menu.tsx`) | Rename · Star/Unstar · Archive/Unarchive · Delete (confirm) — trigger `reveal={true}` | none (the star renders as a PASSIVE marker only) |
| characters (`character-card.tsx:115-178`) | Archive/Unarchive · Duplicate · Delete (confirm) | **the escape already landed here:** always-visible Star toggle + `ROW_REVEAL` Chat CTA |
| presets (`preset-library-row.tsx` → `LibraryRow`) | Rename · Duplicate · Delete (confirm) | none |
| world-info (`LibraryRow`) | Rename · Duplicate · Delete (confirm) | none |

The grammar below GENERALIZES the character card's landed pattern — it is not an invention.

### 12.2 The one row-action grammar (law for every list pane)

Every list row composes ≤ three trailing things, in this order, all riding `ListRow`'s `actions`
sibling slot (never inside the clickable body — the primitive enforces the a11y split):

1. **The state toggle (≤1 per row type)** — `RowToggleAction` (§11): a real pressable that IS the
   marker. Pressed = always visible (it carries state the eye scans for); unpressed = `ROW_REVEAL`
   (rest hidden, hover/`focus-within` revealed, **coarse pointers always-on** — `row-reveal.ts`).
   `aria-pressed` + per-entity label ("Star The Crimson Court"). One element, marker + affordance —
   the chats row's passive star `Icon` is REPLACED by it, not doubled.
2. **The primary verb (≤1 per row type)** — a `ROW_REVEAL` ghost icon `Button` for the row's ONE
   frequent non-navigational action. The row CLICK is always open/select and never needs a button.
3. **The kebab (`RowActionsMenu`, `reveal`)** — retains EVERY action including the inline ones (the
   N3 keyboard/discoverability parity rule; the §9-checklist hover-mirror exception covers the
   duplication), and is the ONLY home for destructive (Delete behind `ConfirmDialog`) and
   dialog-opening occasional actions (Rename, Archive).

Per-list assignment (frequency-ranked from the menus above):

| list | state toggle | primary verb | stays in kebab |
| - | - | - | - |
| chats | **Star** | — (row click = open; nothing else is frequent) | Rename · Archive · Delete |
| characters | Star (landed — migrates onto `RowToggleAction`) | Chat CTA (landed) | Archive · Duplicate · Delete |
| presets | — (no boolean state on the row) | **Duplicate** — the fork workflow is the measured frequent action (nine "Default (edited)" rows are its receipt) | Rename · Delete |
| world-info | — | — (no frequency evidence; books are low-churn) | Rename · Duplicate · Delete |
| projection pane (Arm A) / filtered pane (Arm B) | inherits the chats row verbatim | | |

### 12.3 The touch-floor math (why this fits, per pointer)

- Inline icon buttons ride `size="icon"` = `size-control-md` — **34px fine / 48px coarse by token
  construction** (D62 P1); no hand math, no floor risk.
- Row heights absorb them: `ListRow` default density = `min-h-control-md` + `py-field` (~46-52px
  fine, ~60px coarse) — a 34px control fits the fine row, a 48px control fits the coarse row.
- Width at the 320px pane floor: leading (24-56px stack) + the `content` `min-w-24` title floor +
  toggle 34 + kebab 34 + gaps ≈ 210px of fixed budget — fits with ~80px slack; a THIRD inline
  (toggle + verb + kebab) still fits (~46px slack) but is the cap. **Hard cap: two icon affordances
  + kebab.** Where a pane runs narrower (overlay/sheet edge cases), `ListRow.renderActions(collapsed)`
  + `collapseBelow` is the built-in fallback: collapsed ⇒ render kebab-only (every action still
  reachable). That arm exists in the primitive today — no new mechanism.
- Coarse rest-noise honesty: at coarse, `ROW_REVEAL` shows the cluster always (hover doesn't exist);
  with the cap that is at most toggle + verb + kebab = 3 quiet ghost glyphs per row — the A3
  flex-starvation hazard is absent (the cluster keeps its box; opacity changes no layout).

### 12.4 Keyboard reachability

- Every inline affordance is a real `Button` — tabbable in DOM order after the row's body button;
  `ROW_REVEAL` includes `group-focus-within:opacity-100`, so tabbing INTO the row reveals the cluster
  (visible-focus law holds; nothing is reachable-but-invisible).
- The kebab retains the full action set, so a keyboard user may also do everything from one menu
  (roving menu semantics from the Base UI seal) — inline is a shortcut, never the only path.
- The state toggle announces as a toggle (`aria-pressed`), not a command — "Star, pressed".

### 12.5 What this changes on landed surfaces

`ChatSummaryRow`: passive star `Icon` → `RowToggleAction` (the star mutation hook already exists in
the kebab — `useStarChat`); the kebab keeps its Star item (mirror parity). `character-card.tsx`: the
hand-rolled star Button migrates onto `RowToggleAction` with `rest` per owner ruling D11 (below).
`PresetLibraryRow`/`LibraryRow`: `LibraryRowActions` gains an optional `inlineVerb` arm rendering the
`ROW_REVEAL` Duplicate beside the kebab. All shifts ride existing mutations — zero server change.

## 13. Homes — the file map (Arm A + B)

| file | change |
| - | - |
| `packages/client/src/features/chat/lib/chats-with-character.ts` | NEW (L0) — the one predicate |
| `packages/client/src/features/chat/surfaces/chat-list-surface.tsx` | L0: filter onto the predicate · L3: faces strip |
| `packages/client/src/features/chat/components/chats-with-character-pane.tsx` | NEW (L1) — the projection body (rows/search/empty), exported on chat's front door |
| `packages/client/src/features/chat/components/chat-summary-row.tsx` (+ `lib/chat-summary-row.ts`) | L2: `portraits` stack generalization |
| `packages/client/src/lib/registry-contracts.ts` | L1: `CharacterChatsProjectionView` (the O5-published shape the factory param consumes) |
| `packages/client/src/features/character/lib/characters-section.tsx` | L1: factory gains `chatsProjection`; `list`/`listHeader` closures swap on the section's own selection |
| `packages/client/src/features/character/components/characters-list-header.tsx` | NEW (L1) — both band modes (closes the A1/N2 characters gap) |
| `packages/client/src/features/character/components/character-chats-projection-shell.tsx` | NEW (L1) — identity row + back + host wiring around the injected body |
| `packages/client/src/features/character/surfaces/character-library-surface.tsx` | L1: back-focus row restoration (the facet-editor pattern) |
| `packages/client/src/features/character/surfaces/character-editor-surface.tsx` | L0: count onto the predicate · L1: hero re-point (§3.8) |
| `packages/client/src/state/character-selection-store.ts` | L1: `withViewTransition` wrap on select/clear (store-tier, factory untouched) |
| `packages/client/src/main.tsx` | L1: thread chat's pane into `makeCharactersSection` (the door — G8) |
| `packages/client/src/features/{preset,world-info}/…` + their section defs | L4: `listHeader` band migration |
| `packages/client/src/components/list-pane-header.tsx` | NEW (§11.2) — retires the 3 hand-assembled band clusters; Arm A's two-mode band consumes it |
| `packages/client/src/components/face-strip.tsx` | NEW (§11.2, Arm B) — generalizes + retires `CharacterFavoritesStrip`'s private copy |
| `packages/client/src/components/row-toggle-action.tsx` | NEW (§11.2/§12) — the state-toggle; chats row + character-card star migrate onto it |
| `packages/client/src/components/library-row.tsx` | §12.5: optional `inlineVerb` arm (presets' revealed Duplicate) |
| tests | `tests/client/features/chat/lib/chats-with-character.test.ts` (L0) · CTs per §9's L1/L2/L3 rows under the `tests/client` mirror |

**No server, contract, db, or gate files change in L0–L4.** The deferred instrumentation items are the
only contract-field work, and they are explicitly out of this program.
