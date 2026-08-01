---
kind: spec
status: draft
updated: 2026-08-01
---

# HOME-SECTION — the glyph goes somewhere: a home the features furnish

**Status:** DESIGN SPEC — DRAFT, nothing here is built. Owner-proposed 2026-08-01 (late), verbatim:
*"a separate home page that we can click on the glyph to come back to; I can put some future stuff on
this page, quick-jump to other sections, have a temp chat thing, buddy when we eventually add one back."*

**The one-sentence thesis:** home is NOT a page and NOT a feature that knows about other features — it is
an eighth rail SECTION whose CONTENT is a grid of **door-assembled tiles**, so "put some future stuff on
this page" is forever ONE file in the owning feature plus one array member at the door, never surgery on
home.

**Name disambiguation (read this first):** `docs/history/design/hud-home-spec.md` is a DIFFERENT program — "the CONTEXT panel
IS the HUD's home" (the rpg takeover of the right panel). It shares no file and no concept with this spec.
This one is HOME-SECTION; that one is HUD-HOME. There is also a dead third meaning: `routes/home-page.tsx`
was the `/` route's old misnomer, RENAMED `app-root.tsx` under lockdown O7 precisely because *"there is no
home page concept"* — a claim this spec deliberately reverses, and §1.1 states why that is legal.

**Law read IN FULL for this spec:** `client-architecture-lockdown.md` (the registry/contributor/section
seams — §5 registry rules, §6a-§6d, §7 the door, §8 the settings precedent, §12 channel matrix, §16 gate
spec) · the D18 RATIONALE RIDER (`Core-Path-Registry.md:49`) · `docs/design/list-pane-projection-proposal.md`
(RATIFIED A+B — this spec composes with it, §9.1) · `docs/history/design/set-seams-spec.md` §1-§5 (the contribution precedent
this mirrors) · `density-pass-spec.md` §2.3 (the four-voice grammar) + §3.1 (tier map) + §3.2 (chrome diet) ·
`docs/design/mocks/README.md` + the `panel-redesign/` + `list-pane-projection/` mock sets (house style).

**Evidence (full-file code reads, 2026-08-01, this worktree):**
`packages/client/src/features/app-shell/surfaces/app-shell.tsx` · `app-shell/components/rail.tsx` ·
`app-shell/components/shell-topbar.tsx` · `app-shell/components/section-placeholder.tsx` ·
`app-shell/surfaces/shell.css` (the `.shell-rail-brand` + mobile `@media` blocks) ·
`app-shell/hooks/use-shell-layout.ts` · `state/section-registry.ts` · `state/chrome-registry.ts` ·
`state/assemble-chrome.ts` · `state/settings-pane-registry.ts` · `state/shell-store.ts` ·
`state/active-chat-store.ts` (`startNewChat`) · `main.tsx` (the door region) ·
`features/chat/surfaces/chat-landing-surface.tsx` · `features/chat/lib/chats-section.tsx` ·
`features/chat/lib/draft-commit.ts` · `features/chat/lib/new-chat-modal.tsx` ·
`features/chat/hooks/use-send-message.ts` · `packages/db/src/schema/chat.ts` (the `temporary` column) ·
`packages/server/src/domain/chat/verbs/{start-chat,chat-lifecycle}.ts` ·
`domain/chat/persistence/queries.ts` (`listMemberChats`) · `domain/chat/contract/params.ts` ·
`packages/server/src/transport/trpc/routers/chat.ts` (`startChatSchema`) ·
`packages/contracts/src/settings/index.ts` (`tempChatTtlHours`) · `packages/ui/src/primitives/icons/index.ts`.

**Mock (authored with this spec — the owner rules from pixels):**
`docs/design/mocks/home-section/home.html` — the tile grid with realistic content: Azarael's recents with
snippets + markers, the character quick-picks, the temp-chat launcher, the section jump grid, buddy in its
DORMANT state, and the automation doorway as the honest face of "future stuff".

---

## 1. The direction, restated as a contract

### 1.1 What home is, and why it does not re-open a closed decision

Lockdown §7 records: *"there is NO 'home page' concept — the no-selection landing is the CHATS section's
CONTENT-none-selected state (`{kind:"landing"}`, D62 P4), a SECTION state, not a page."* That ruling killed
**a ROUTE named home-page that hand-assembled a 63-symbol god-map**. It did not rule that the product may
never have a place to land. This spec obeys it literally:

- home is **a SECTION**, not a route. `SECTION_IDS` gains `"home"`; `routes/app-root.tsx` is untouched;
  no route body, no `sections={{…}}` map, no new router entry (G1's anti-god-map arm stays green).
- home is **a shell that skims contributions**, not a god-feature. `features/home/` owns the section
  definition, the tile grid, and the ONE tile that can only be derived from the shell (section jumps).
  Every other tile is authored by the feature that owns its data, exactly as `docs/history/design/set-seams-spec.md` §1's
  doctrine parent states it: *domains raise seams, the worker skims them* — here, **features raise home
  tiles, home skims them.**
- the landing STATE (D62 P4) does not survive as a second launcher. §4 rules its fate; the coupling
  between "home is the default" and "the landing slims" is stated as ONE ruling, not two independent knobs.

### 1.2 The four things the owner asked for, mapped to mechanisms

| owner phrase | mechanism | § |
| - | - | - |
| "click on the glyph to come back to" | the rail BRAND slot becomes a registry-derived affordance (`rail.brand`, a fourth `ChromeZone`) whose behavior arm is `{kind:"section", sectionId:"home"}` — app-shell never spells `"home"` | §4.1 |
| "put some future stuff on this page" | the `HomeTileContribution` registry: a new tile is ONE co-located file + ONE array member at the door — home is never edited | §3 |
| "quick-jump to other sections" | a home-owned tile that DERIVES its rows from the section registry (a hardcoded section list would be G2-RED) | §3.4 |
| "temp chat thing" | `chats.temporary` is ALREADY BUILT server-side (column + `startChat` param + TTL setting + reaper verb) and has ZERO wire and ZERO client — §5 is the three-line exposure, not a design | §5 |
| "buddy when we eventually add one back" | the DORMANT tile arm — a real registered tile whose `body` is `{ dormant: "<cited reason>" }`, the structural twin of `content:{planned}` (lockdown O1) | §3.5 |

## 2. Current state — what exists, what does not (recon receipts)

| seam | code | what it gives home |
| - | - | - |
| the section registry | `state/section-registry.ts:47-63` + `main.tsx:148-157` | `SectionDefinition` already carries everything home needs: `rail`, `panelDefaults`, `placeholder`, optional `list`/`listHeader`/`header`, required `content`, required `context`. A new section is ONE definition + ONE tuple member; tsc's total `Record` forces the door to register it |
| the contributor primitive | `lib/registry.ts` (`createContributorRegistry`) + `main.tsx:114-146` | five live contributor registries at the door today (chat-context · chat-surface · tool-renderers · slash-commands · character-detail) + the settings-section ones — home tiles are the SIXTH application of an unchanged primitive. Duplicate ids throw at construction |
| the settings-section precedent | `state/settings-pane-registry.ts:66-120` (`SettingsSectionContribution`) | the exact shape to mirror: `{id, anchor, nav, body}`, assembled at the door, threaded into the host by PROP, zero contributions ⇒ the host renders byte-identical |
| the chrome registry | `state/chrome-registry.ts` + `state/assemble-chrome.ts` | rail affordances DERIVE from `SectionDefinition.rail` (`sectionEntry`, `assemble-chrome.ts:37-48`). `ChromeEntry.useVisible` is the live per-entry gate, *"called UNCONDITIONALLY per entry — the registry list is frozen at the door"* — the precedent for a tile-level visibility hook |
| the brand glyph | `rail.tsx:73-76` — `<div className="shell-rail-brand" aria-hidden="true"><WeaveGlyph size={26}/></div>` | **it is a decorative div today**: not a button, `aria-hidden`, no handler, and `display:none` below 48rem (`shell.css:614-617`). Making it navigate is a real (small) build, and the mobile regime needs its own answer (§4.3) |
| the landing | `features/chat/surfaces/chat-landing-surface.tsx` (whole file) | the hero + "Recent chats" (8) + "Start a chat" character quick-picks (6), two suspense reads in ONE `useSuspenseQueries`, `showRecents` already exists to avoid duplicating a docked chats pane. This IS home's chats tiles, already written |
| the chat row anatomy | `features/chat/components/chat-summary-row.tsx` + `lib/chat-summary-row.ts` | portrait · title chain · snippet · relative time · game/star/archived markers — reused verbatim by home's recents tile (and by the projection pane, list-pane-projection §2) |
| **temp chat, server-side** | `db/src/schema/chat.ts:108-111` · `domain/chat/verbs/start-chat.ts:362,418` · `persistence/queries.ts:190-198` · `verbs/chat-lifecycle.ts:188-200` · `contracts/src/settings/index.ts:408-413,526` | **BUILT:** `chats.temporary` (set only at `startChat`; a fork is born non-temporary), `listMemberChats` excludes temporary rows ALWAYS (not just when `includeArchived`), `reapTemporaryChats` bulk-deletes the caller's expired temp chats, TTL = `UserSettings.chat.tempChatTtlHours` (default 24, 1h..1yr) |
| **temp chat, client-side** | `transport/trpc/routers/chat.ts:74-102` (`startChatSchema`) · `features/chat/lib/draft-commit.ts:17-25` (`DraftCarry`) | **ABSENT:** `temporary` is NOT in the wire schema, NOT in `DraftConfig`/`DraftCarry`, and `reapTemporaryChats` has NO router procedure. A built domain verb with no wire — the AU-8 wiring-audit class |
| buddy | `packages/server/src/domain/` (26 domains; **no `buddy`**) · `packages/client/src/features/` (no `buddy`) | the domain map (`AGENTS.md` §6) still lists buddy = *"the companion = the `agent` role connection"*, and the lockdown's bus table + O4 describe a `domain/buddy` that the RETRO tree does not contain. Buddy is PURGED-pending-return: exactly the state the DORMANT arm exists to render honestly |
| the sanctioned-dormant precedent | `docs/history/design/sse-multiplex-spec.md:594-596` | *"`automation.stream` is a **DOORWAY** — sanctioned-dormant, wired through the multiplex at stage 4; the future automation-chips UI consumes it there. Not a WIRE item, not deleted."* Home's dormant tiles are the UI half of that posture |

**Two receipts that BOUND the design:**

1. **Every section derives a rail nav button — there is no opt-out today.** `assembleChrome` maps
   `sections.map(sectionEntry)` unconditionally into `rail.nav` (`assemble-chrome.ts:69-77`). So "the glyph
   is home's affordance" is not free: either home also gets a nav row (duplicate affordance), or the rail
   gains a `brand` zone the section can target. §4.1 rules it.
2. **The shell has NO pane-less section.** `list` is optional on the Def, but app-shell substitutes copy —
   `activeDef.list?.() ?? <SectionPlaceholder title="${title} list" />` (`app-shell.tsx:119`) — the
   `PanelChrome` always mounts, and `ShellTopbar`'s list toggle is unconditional chrome
   (`shell-topbar.tsx:59-…`, wired at `app-shell.tsx:222-223`). A `list`-less home therefore ships a
   toggle that reveals *"Home list — this surface isn't wired yet"*. That is the "looks unbuilt" defect the
   empty-states law names. §4.4 gives three honest arms and a recommendation.

## 3. THE CENTERPIECE — the HOME-TILE contributor seam

> The architectural point of this whole spec. Everything else is navigation plumbing.

### 3.1 The contract

```ts
// client/src/lib/registry-contracts.ts (tier 4 — beside CharacterDetailContribution)
/** How much of the tile grid one tile claims. A CLOSED axis: an unlisted span is unspellable. */
export const HOME_TILE_SPANS = ["half", "full"] as const;
export type HomeTileSpan = (typeof HOME_TILE_SPANS)[number];

/** A feature-contributed home tile. Home renders the FRAME (kicker header + icon + optional trailing
 *  action + the card); the contribution supplies only its own body. */
export interface HomeTileContribution {
  /** Registry key + React key (a duplicate throws at door construction). */
  readonly id: string;
  /** The tile's name, rendered by HOME in the `kicker` voice — a tile never draws its own band. */
  readonly title: string;
  readonly icon: LucideIcon;
  /** Canonical `(order, id)` sort at the door — the `assembleChrome` ordering precedent. */
  readonly order?: number;
  readonly span?: HomeTileSpan; // default "half"
  /** The tile's ONE trailing affordance (e.g. "All characters →"). Never a second primary (CD3). */
  readonly action?: ReactNode;
  /** Live capability gate, called UNCONDITIONALLY over the door-frozen list (the `ChromeEntry.useVisible`
   *  contract, `chrome-registry.ts:44-48`). `false` ⇒ render NOTHING (no gap, no empty card). */
  readonly useVisible?: () => boolean;
  /** A real body, or the DECLARED-DORMANT arm — the structural twin of `SectionDefinition.content`'s
   *  `{planned}` (lockdown O1): the marker and the body are the SAME field, so building the tile forces
   *  deleting the marker in the same edit. A stale doorway is unrepresentable, not merely detected. */
  readonly body: (() => ReactNode) | { readonly dormant: DormantDoorway };
}

/** What a dormant doorway must say to earn its pixels. */
export interface DormantDoorway {
  /** The tracked reason — non-empty, cites what must land first (gate-checked). */
  readonly reason: string;
  /** The one-line user-facing promise the tile renders. Never "coming soon" with no subject. */
  readonly teaser: string;
}
```

**Home is `lib/registry-contracts.ts`, not `state/`** — the §5-rule-6 test decides it: `SettingsSectionContribution`
homes in `state/` *"because a contribution reuses `SettingsSubcategory` — a state-owned nav shape"*
(`settings-pane-registry.ts:79-81`); `CharacterDetailContribution` homes in `lib/registry-contracts.ts`
because it binds no state vocabulary. `HomeTileContribution` binds none either (`ReactNode` + `LucideIcon`
only), and tier-4 is importable by every contributor without importing home. `client-lib-floor` permits
`@orb/ui`/kit/contracts imports, so `LucideIcon` is legal there (the same import `registry-contracts.ts`
neighbours already make).

### 3.2 The assembly + the host

```ts
// main.tsx (the ONE door, G8) — the sixth contributor registry, assembled beside its siblings
const homeTiles = createContributorRegistry<HomeTileContribution>("home-tiles", [
  chatRecentsTile,        // features/chat  — order 10
  chatQuickPicksTile,     // features/chat  — order 20
  tempChatTile,           // features/chat  — order 30
  sectionJumpTile,        // features/home  — order 40 (derived, §3.4)
  buddyDormantTile,       // features/home  — order 80 (DORMANT, §3.5)
  automationDormantTile,  // features/home  — order 90 (DORMANT, §3.5)
]);

const sections = createRegistry("sections", SECTION_IDS, {
  home: makeHomeSection(homeTiles),   // ← the factory takes the registry; home consumes it BLIND
  chats: makeChatsSection(…), characters: makeCharactersSection(…), corpus: corpusSection,
  worldInfo: worldInfoSection, presets: presetsSection, refinery: refinerySection, analytics: analyticsSection,
});
```

The `makeChatsSection(contributors)` / `makeCharactersSection(contributors)` factory posture is the landed
precedent (`main.tsx:149-151`) — home adds nothing new. **Zero contributions ⇒ home renders its own designed
empty state**, never a broken grid (§3.7).

The host (`features/home/surfaces/home-surface.tsx`) is \~60 lines and knows nothing about any feature:

```tsx
function HomeSurface({ tiles }: { readonly tiles: ContributorRegistry<HomeTileContribution> }) {
  return <Stack …>{tiles.list().map((t) => <HomeTile key={t.id} tile={t} />)}</Stack>;
}
// HomeTile: header (Icon + Text voice="kicker" + optional action) + body — or the dormant doorway.
// `useVisible` is called by HomeTile itself (a component per entry, the RailChromeEntry precedent,
// rail.tsx:27-38), never in a map body — rules-of-hooks holds over the door-frozen list.
```

### 3.3 The born tiles — chats (MOVED from the landing, not forked)

| tile | id | owner | body | receipts |
| - | - | - | - | - |
| Recent chats | `chat.recents` | `features/chat/lib/home-recents-tile.tsx` | the landing's `recents.map(<ChatSummaryRow/>)` block verbatim (`chat-landing-surface.tsx:89-100`), 8 rows, `trpc.chat.listChats` cache-first | same query key as the chats pane ⇒ one truth, free `chatsChanged` freshness |
| Start a chat | `chat.quickPicks` | `features/chat/lib/home-quick-picks-tile.tsx` | the landing's quick-pick block (`:102-118`) — 6 character rows, `action` = "All characters →" firing `setActiveSection("characters")` | `character.list` is a cache-first cross-feature read (§12 row 2 — the sanctioned channel) |
| Temp chat | `chat.tempChat` | `features/chat/lib/home-temp-chat-tile.tsx` | §5 — one primary button + the TTL gloss | rides `startNewChat` + the draft carry |

**Ownership ruling: all three are CHAT-owned, including the character faces.** The faces tile starts a
chat (`startNewChat({characterIds:[id]})` is chat intent) and its anatomy already lives in chat's landing;
homing it in `features/character` would fork a body that exists, to no benefit. This mirrors list-pane
projection §3.2's inverse call (chat-row anatomy stays chat-owned even when a character surface hosts it) —
the rule is the same in both: **the tile belongs to the feature that owns the DATA and the INTENT, never to
the host.**

### 3.4 The section-jump tile — DERIVED, or it is gate-RED

`features/home/lib/section-jump-tile.tsx`, home-owned (it is shell-derived content with no other owner):

```tsx
const sections = useSectionRegistry().list().filter((s) => s.id !== "home");
// rows: s.rail.icon + s.rail.label + s.placeholder.description (the gloss) → setActiveSection(s.id)
```

**A hardcoded list of sections here is RED, not merely wrong:** G2 `no-parallel-section-map` fires on *"an
object literal / `Record<Id,…>` type / array whose keys or `id` members cover ≥2 members of `SectionId`…
outside the allowlist"* (lockdown §16). The jump tile is the single most likely place a cold agent would
spell `["chats","characters",…]`, and the gate already stops it. Derived rows also mean a NEW section
appears on home automatically, with its own icon and its own placeholder copy — no home edit, ever.

The quick-jump rows use each section's `placeholder.description` as the `gloss` line. That copy is already
gate-checked for distinctness (`placeholder-copy-registry`, G13) and is written to teach — a second copy
table for home would be a shadow map (G2 again) and would rot.

**A DECLARED-PLANNED section renders its state honestly:** refinery's definition is
`content: { planned: "…" }` (lockdown O1, `refinery-section.tsx:13-14`), so its jump row carries a
**Planned** badge derived from `typeof def.content !== "function"` — no second list of "which sections are
real", and the day refinery ships the badge disappears by itself.

### 3.5 Dormant doorways — buddy, and the honest face of "future stuff"

```ts
// features/home/lib/buddy-tile.tsx
export const buddyDormantTile: HomeTileContribution = {
  id: "buddy", title: "Buddy", icon: BrainCircuit, order: 80, span: "half",
  body: {
    dormant: {
      reason: "domain/buddy is not in the retro tree (26 domains, no buddy); returns as the `agent`-role connection per AGENTS.md §6 + D60's agent-principal waves",
      teaser: "Your companion — the agent-role connection that reacts to what you and your characters do.",
    },
  },
};
```

Three rules make a doorway honest rather than an IOU:

1. **The reason is a tracked citation** (non-empty, names what must land) — the bus-coverage DEFERRED
   discipline applied to tiles, exactly as lockdown O1 applies it to sections.
2. **The rendering is a DOORWAY, not a fake feature.** A dormant tile renders at reduced weight: the icon
   muted, the teaser in `gloss` voice, a `Badge tone="soft"` reading **Dormant**, no button, no skeleton,
   no fake data. It says *what this will be*, and it does not pretend to be waiting on a spinner.
   (`empty-states-are-load-bearing`: omitting the tile entirely would say "this product has no companion";
   a fake-loading tile would lie. The doorway is the only truthful third option.)
3. **Self-cleaning by construction:** `body` is one field. Building buddy means writing
   `body: () => <BuddyHomeTile/>` — which DELETES the marker in the same edit. The tile then MOVES to
   `features/buddy/lib/buddy-home-tile.tsx` (see the G23 coupled site, §7).

**`when` vs the dormant arm (the owner's phrasing, adjudicated).** The brief said *"the tile def exists,
`when` gates on the domain's return."* A predicate that gates on a BUILD fact is a constant — it can only be
`() => false`, which renders nothing and makes the tile invisible until someone edits it: the doorway
disappears, the promise disappears, and a stale `() => false` is undetectable. The dormant ARM is the same
intent made structural and visible. `useVisible` stays on the contract for its real job — a LIVE capability
gate (a tile that should hide when its backing connection role is unconfigured). Owner decision **H7**.

**"Future stuff" posture (the standing statement, no placeholder tile):** home does NOT ship a "more coming"
card. The posture is mechanical: *a new home tile is a contribution — one file in the owning feature and one
array member at the door. Home is never edited to add a tile.* The mock renders the `automation` doorway as
the honest face of what future stuff looks like WHEN IT IS REAL (a server surface exists —
`automation.stream` is the sanctioned-dormant DOORWAY the sse-multiplex spec ruled), rather than an empty
promise card.

### 3.6 Why a registry and not "just render the tiles in home"

The whole spec exists to prevent one specific future: home accumulating imports of nine features to render
their cards. That shape is barred at three tiers before it can ship —

- `client-features-no-cross` (LIVE dep-cruiser) makes `import { ChatSummaryRow } from "#features/chat"`
  in `features/home` RED at lint time;
- G8 `registry-assembly-at-door-only` makes a second `createContributorRegistry(` outside the door RED;
- G23 `feature-owns-definition` keeps `features/home/` honest (it owns `lib/home-section.tsx`).

…and the positive form is the thing the owner actually asked for: *"I can put some future stuff on this
page"* costs one file, forever.

### 3.7 The three states (§11 of the lockdown, applied to the grid)

| state | render |
| - | - |
| zero visible tiles (every `useVisible` false / an empty door array) | ONE designed `EmptyState`: Weave decoration, "Nothing on your home yet", description naming the next step, action = **New chat**. The grid never renders as blank space |
| a tile's own body suspends | each tile body mounts inside its own `QueryBoundary` with a shape-matched skeleton — **per tile, never one boundary for the grid** (one slow read must not blank the whole home) |
| a tile's own body throws | that tile renders `QueryErrorState label="<tile title>"` with a real retry; its siblings are untouched |

At most ONE Weave decoration per screen (`section-placeholder.tsx:4-5`): it rides home's empty state only,
and the section `placeholder` copy keeps the muted sparkle everywhere else.

## 4. Navigation

### 4.1 The glyph — a derived affordance, never a magic id

The brand slot is decorative today (`rail.tsx:73-76`, `aria-hidden="true"`). Making app-shell call
`setActiveSection("home")` from that div would put a feature id inside the domain-agnostic shell — the exact
smear `AppShell` was cleaned of (lockdown §6a: *"`AppShell` stays domain-agnostic … it knows RAIL/LIST/
CONTENT/CONTEXT, never a specific feature"*). The structural form:

- `CHROME_ZONES` gains `"rail.brand"` (`chrome-registry.ts:17` — one tuple member);
- `RailEntry` gains `readonly zone?: "rail.nav" | "rail.brand"` (default `"rail.nav"`), and
  `assembleChrome`'s `sectionEntry` reads it (`assemble-chrome.ts:37-48` — one line);
- `Rail` renders the brand zone's single entry INSIDE `.shell-rail-brand` as a real
  `<RailButton>`-shaped affordance wrapping `WeaveGlyph` — `aria-label="Home"`, `aria-current` when active,
  the same active skin every rail button gets. `aria-hidden` comes off.
- Home's definition declares `rail: { label: "Home", icon: Compass, group: "primary", mobile: "tab", zone: "rail.brand" }`.

`Compass` is already in the icons seal (`packages/ui/src/primitives/icons/index.ts:37`) — the icon is only
the mobile/⌘K face of home; the desktop face is the glyph itself. **No seal growth is needed for this whole
spec**: `Compass` · `BrainCircuit` · `Zap` · `Sparkles` · `MessagesSquare` · `Users` · `Clock` · `LayoutGrid`
are all exported today (verified against the seal file).

**⌘K reaches home for free** — the palette's "Go to" rows are *"derived from the section registry"*
(`command-palette-surface.tsx:4`), so a new section appears with no palette edit.

### 4.2 The born default — SPEC BOTH ARMS (owner fork, coupled to the landing's fate)

`DEFAULT_STATE.activeSection = "chats"` (`shell-store.ts:87`) and `activeSection` is PERSISTED
(`PersistedShellState`, `:81-84`) — so this fork only ever affects a fresh install / cleared storage; an
existing user keeps their last section either way, and no persist-version bump is needed (`isSectionId`
already validates against the tuple, `:100-102`).

| arm | `DEFAULT_STATE.activeSection` | consequence for the landing (`chat-landing-surface.tsx`) |
| - | - | - |
| **D-1 — home is the born default** | `"home"` | the landing RETIRES to a slim empty state: "No chat selected — pick a thread on the left, or start a new one" + the New-chat primary. D62 P4's rule (*the app never opens on an empty room*) is satisfied by home, not by a hero inside chats. The hero + recents + quick-picks MOVE to home's tiles; nothing is duplicated |
| **D-2 — chats stays the born default** | `"chats"` (unchanged) | the landing must remain a full launcher (a fresh user lands there), so home's recents/quick-picks tiles DUPLICATE it — two launchers, two truths, and the "which one do I fix" question every time copy changes |

**These are ONE ruling, not two knobs** (owner decision **H1**). Recommendation: **D-1 + retire the hero.**
The landing's `showRecents` flag already exists precisely because *"that panel is the recents finder, so this
would duplicate it"* (`chat-landing-surface.tsx:40`) — the same argument applied to home retires the hero
rather than growing a third flag. Under D-1 the chats-no-selection state keeps exactly what a section state
should be: a one-line empty state with the section's own primary.

If the owner rules D-2 anyway (a legitimate "I want chats first" preference), the spec's honest form is:
home's chats tiles ship, and the LANDING drops its recents/quick-picks to the slim state anyway — the
launcher lives in exactly one place regardless of which section boots. The fork is only "where do I land",
never "how many launchers exist".

### 4.3 Mobile, deep-links, and back

- **Mobile:** `.shell-rail-brand` is `display:none` below 48rem (`shell.css:613-617`) — the glyph has no
  mobile affordance and should not grow one (the mobile rail is a thumb-reach TAB BAR). Home declares
  `mobile: "tab"`, so it rides the bottom bar; the curated bar becomes **Home · Chats · Characters · You**
  (`Corpus` folds into the You sheet — D62 P3's curation is per-section `mobile` today, so this is one field
  flip on `corpus-section.tsx`, not a new mechanism). Owner decision **H2** (the alternative: 5 tabs).
- **Deep-link / back:** there is nothing to wire and nothing to break. The app is a hand-written TWO-route
  tree (`/` + `/login`, lockdown §7); `activeSection` is store state, not a URL segment, so the browser
  back button has never navigated between sections and does not start to here. "Back to where I was" is the
  rail/glyph/⌘K, and the persisted `activeSection` restores the last section across reloads. **No history
  entry, no route param, no `?section=` — do not add one for home**; a URL axis for section state is a
  separate program (it would need every section's selection state to be URL-representable).
- **`<Activity>` continuity holds:** app-shell renders EVERY section's content and keeps recently-visited
  panes mounted (`app-shell.tsx:124-132,228`), so glyph → home → glyph-back restores the previous section
  with its scroll and selection intact. Home costs one more entry in `contentBySection`.

### 4.4 The LIST pane on home — the shell has no pane-less mode (receipts in §2.2)

Three arms, ordered by honesty:

| arm | what ships | cost | verdict |
| - | - | - | - |
| **L-a — home declares no `list`** | `panelDefaults: {list:"collapsed", context:"collapsed"}`; the toggle stays and reveals *"Home list — this surface isn't wired yet"* | zero | **REJECT.** A reachable "isn't wired yet" panel on the app's front door is the exact "looks unbuilt" defect |
| **L-b — the shell learns `unavailable`** | `SectionDefinition.panels?: { readonly list?: "unavailable" }`; THREE consumer sites: `useShellLayout` (force `collapsed`, ignore any persisted override), `ShellTopbar` (render no list toggle), and `useListDocked`'s shared `resolvePanelMode` input. `shell.css` needs NOTHING — the collapsed track is already zero-width | one optional Def field + 3 sites + a CT | **RECOMMEND.** This is genuine missing shell capability (every future pane-less section needs it), it adds no `PanelMode` member (the 4th-mode cost list-pane-projection §4.2 rightly refused), and it is invisible to every existing section |
| **L-b AMENDED (side-eye fix-all, 2026-08-01)** | the axis covers BOTH panels — `panels?: { list?: "unavailable"; context?: "unavailable" }`, and home declares both. The consumer sites grow with it: `useShellLayout` pins `contextMode` collapsed + derives `anyPanelAvailable`, `contextToggleChrome`/`fullscreenChrome` gate their `useVisible` on it, and `AppShell` renders NO context body into the dead track | +1 field arm + 4 sites | shipped. Declaring only `list` left the front door with a detail-panel toggle onto `context:{kind:"none"}` and a focus toggle that cold-booted reading "Exit focus mode" (zero panels trivially satisfies "both collapsed") |
| **L-c — home ships a real LIST** | the LIST becomes the recents list; the recents TILE drops | no shell change | **alternative.** Honest but weaker: it makes home a two-column surface competing with the chats section, and the tile grid loses its best row-content. Take this only if the owner wants zero shell change |

Owner decision **H3**. Under L-b, home's CONTEXT panel is `context: { kind: "none" }` (an explicit decision,
never an absence — `section-registry.ts:61-62`), and `panelDefaults` is `{ list: "collapsed", context: "collapsed" }`
so the tile grid gets the full width on arrival.

## 5. Temp chat — the mini-ruling (the answer is: it is already built, expose it)

The brief asked for three options and a recommendation. Recon changes the question: **option (c) — a flag
excluded from `listChats` and purged on a cadence — IS THE BUILT DESIGN**, has been since the chat domain
landed, and carries ST parity (PD-65). The receipts, all quoted:

- `db/src/schema/chat.ts:108-111` — *"ST 'Temporary Chat' (PD-65): an ephemeral room — persisted so turns
  can run, but HIDDEN from the recent list (`listMemberChats` excludes it) and swept by
  `reapTemporaryChats` once expired. Set only at `startChat` (a fork is born non-temporary). Expiry is a
  domain TTL over `createdAt`, not a column."*
- `persistence/queries.ts:198` — `eq(chats.temporary, false)` is in BOTH branches: a temp chat is hidden
  from the list even with `includeArchived`.
- `verbs/chat-lifecycle.ts:188-200` — `reapTemporaryChats` bulk-deletes the caller's expired temp chats,
  scoped to chats the caller HOSTS.
- `contracts/src/settings/index.ts:408-413` — `tempChatTtlHours`, default 24, bounds 1h..1yr, *"1h..1yr
  bounds keep a fat-fingered value from wiping fresh temp chats or never reaping"*.

**So the ruling is exposure, not design.** Judged against the two alternatives anyway, because the owner
asked for the comparison:

| option | verdict |
| - | - |
| (a) auto-archive on leave | **REJECT.** `archive` is HOST-ONLY and *"archiving removes the room from every member's active list"* (`chat-lifecycle.ts:127-131`) — in a multi-human room one person's "temp" would hide the room for everyone. It also overloads archive's meaning (curation) with ephemerality (lifecycle), and the rows never die |
| (b) hard-ephemeral (no row at all) | **REJECT — it contradicts the chat write law.** A turn needs a `chats` row and a `chat_participants` row to run at all (messages FK the chat; the D18 authority chain resolves through membership; the durable chat bus assigns per-chat `seq` on an INSERT). "Persisted so turns can run" is not a compromise in the schema comment — it is the only shape a turn can have. Hard-ephemeral would mean a second, roster-less, bus-less turn path: a parallel engine |
| **(c) the `temporary` flag** | **RECOMMEND — already built.** Rows exist (turns run, canon is canon), the list never shows them, the reaper deletes them on the user's own TTL |

**What actually has to be built (all small, all client/transport):**

1. `startChatSchema` gains `temporary: z.boolean().optional()` (`routers/chat.ts:74-102`) — the domain param
   already exists (`params.ts:75-76`).
2. `DraftConfig` gains `temporary?: true` and `DraftCarry`/`resolveDraftCommit` carry it
   (`draft-commit.ts:17-25,50-60`) — ONE sparse field, absent ⇒ today's plain new chat, byte-identical.
   Both commit paths (`use-send-message.ts`, `use-guided-actions.ts`) inherit it because the carry has one
   home (that file's own header states why).
3. The home tile: a primary **Temp chat** button seeding `{ temporary: true }` (a `DraftSeed` field)
   - a `gloss` line rendering the user's own TTL: *"Not saved to your chats · deleted after 24h"*.
   - **AMENDED (side-eye fix-all, 2026-08-01):** the button does NOT call `startNewChat` directly — it calls
     `openNewChatPicker({ temporary: true })`, opening the SAME character picker every other "New chat"
     affordance opens, with the creation-only flag preset (the picker mints preset ⊕ picks). ONE creation
     ceremony: the direct call forked a second launcher that silently skipped the cast pick, so a temp room
     could only ever be born castless.
4. The draft surface must SAY it is temporary before the first send (a `Badge` in the topbar draft header) —
   the flag is set at creation and cannot be toggled later (`start-chat.ts:418`; the schema comment is
   explicit), so a user who does not see it before sending cannot fix it after. Post-send, the room shows
   the same badge.
5. The reaper needs a call site. Recommended: a `chat.reapTemporaryChats` authed procedure called
   fire-and-forget on home mount (the user's own maintenance, their own TTL, their own rows).
   The alternative is a workloads runner — heavier, and the verb is already per-caller-scoped.
   Owner decision **H5**.

**What is deliberately NOT built:** no "make this chat temporary" toggle on an existing room (the flag is
creation-only by design), no per-chat TTL override (the setting is per user), and no UI for the reaper
(it is maintenance, not a feature).

## 6. Tier, density, and voice

Home is a **CONTENT-tier surface** hosting **`form`-tier islands** — the density map's own row: *"library
grid cards | form | `p-block` inset | `gap-block` between | `p-block` island pad | `gap-field` atom gap |
`rounded-card` | islands carry border+bg: yes — a grid cell IS an interactive island"* (`density-pass-spec.md`
§3.1). Tiles are cards; their INNER row lists are `instrument` islands nested one level (a legal nested
`<Surface tier="instrument">` — the map explicitly permits the reverse nesting too).

- **CD2 (one box deep):** the tile is the box. The rows inside it carry NO border and NO background except
  the `ListRow` hover/selection tint. A bordered row inside a bordered tile is RED by the chrome diet.
- **CD3 (one focal element per surface):** exactly ONE tile may carry the accent primary at rest. That is
  the **temp-chat / new-chat** action. The quick-pick tile's "All characters →" is a ghost; the jump rows
  are ghosts; the dormant tiles have no button at all.
- **The four voices** (`density-pass-spec.md` §2.3), applied to every tile identically because HOME renders
  the header:
  - `kicker` — the tile title ("RECENT CHATS", micro/caps/semibold/muted + hairline rule);
  - `label` — a row's name (a chat title, a character name, a section name);
  - `datum` — the mono numbers: relative times, counts, the TTL hours;
  - `gloss` — the quiet second line: a chat's snippet, a section's teaching copy, a doorway's teaser.
- **The grid:** two columns at the CONTENT width (`--width-shell-content`), one column below the container
  breakpoint, via a `@container` query on the content region's own inline size — **never the viewport**
  (the shell's docked panels narrow this pane independently; the same rule the chat thread-flank seam
  already obeys, lockdown §6c). `span: "full"` claims both columns.

## 7. Enforcement — every boundary names the tier that REDs it

| violation | wall | tier |
| - | - | - |
| `features/home` imports `#features/chat` (or any feature) to render a tile | `client-features-no-cross` (LIVE dep-cruiser) — tiles arrive through the door factory | resolve/lint |
| a second home-tile assembly (a tile list built inside home, a `register()` call) | G8 `registry-assembly-at-door-only` (LIVE) + §5 rule 1's ban on mutating registration | lint |
| the jump tile hardcodes a section list | G2 `no-parallel-section-map` (LIVE) — ≥2 `SectionId` members outside {tuple, door, definition files} | lint |
| home registered in the rail but not in the section registry | tsc — `createRegistry("sections", SECTION_IDS, {…})` is TOTAL over the tuple; adding `"home"` fails compile until a definition exists | compile |
| home ships without honest placeholder copy | G1 `section-registry-completeness` + `placeholder-copy-registry` (distinct title/description per section) | lint |
| a dormant tile with an empty reason, or a dormant tile that ALSO wires a body | **NEW gate `home-tile-registry-completeness`** — mirrors G1's PLANNED arms: co-location (`features/*/lib/*-tile.tsx`), id uniqueness, dormant honesty (non-empty `reason` + `teaser`; a `{dormant}` tile cannot also supply `action`), and the anti-god-map arm (no tile array outside the door) | lint (new) |
| app-shell spells `"home"` | review + the brand-zone derivation (§4.1): the shell reads `behavior.sectionId` off a chrome entry, exactly as `RailChromeEntry` already does (`rail.tsx:58-59`) | review |
| a tile mirrors server rows into a store | `state-files` + the three store doors + `bus-onData-no-store-write` (LIVE); a tile reads `trpc.*` cache-first (§12 row 2) | lint |
| a tile hand-writes `fetch()` / a bespoke query key | `no-array-literal-querykey` + G9 `query-machine-seals` (LIVE) | lint |
| a feature whose ONLY definition is a home tile | **G23 `feature-owns-definition` coupled site:** its predicate is `lib/*-{section,modal,pane,chrome}.tsx`. Adding `tile` to that suffix list is REQUIRED the day such a feature exists (buddy's return is the first candidate). Until then, dormant tiles home in `features/home/lib/` — no empty feature dir, no gate amendment | lint (coupled) |
| the `temporary` flag set anywhere but creation | the domain: `start-chat.ts:418` is the only writer; `chat-lifecycle`'s row-update verbs do not name the column, and a fork is born non-temporary (schema comment) | code + review |

**New-gate coupled sites (four, per house law):** the gate module (`scripts/check/gates/home-tile-registry-completeness.ts`
with its `mustFlag`/`mustPass` self-tests) · a row in `Core-Enforcement-Active-Gates.md` · the registered-gate
COUNT in that file's header · the gate-fixture writer. A gate landed at three of four sites is a silent GREEN.

## 8. Build shape — stages, each shippable

Sequenced **AFTER** the list-pane projection L0-L4 (§9.1 states why), one commit per stage,
`pnpm check` + the touched tests green per stage.

| stage | lands | new vs existing | verified by |
| - | - | - | - |
| **H0 — the seam** | `HomeTileContribution` + `HomeTileSpan` + `DormantDoorway` in `lib/registry-contracts.ts`; `features/home/` with `lib/home-section.tsx` (`makeHomeSection(tiles)`), `surfaces/home-surface.tsx`, `components/home-tile.tsx`; `SECTION_IDS` gains `"home"`; the door assembles `createContributorRegistry("home-tiles", [])` — **EMPTY but typed**, so the whole door→factory→grid path compiles and renders the designed empty state with zero contributions (the M8 posture) | new contract + new feature; zero feature moves | unit: the empty registry renders the empty state, not a blank grid · CT: three fake tiles render in `(order,id)` order · `pnpm check` |
| **H1 — the glyph + the pane** | `CHROME_ZONES` + `"rail.brand"`; `RailEntry.zone`; `assembleChrome` mapping; `Rail` renders the brand affordance (label/`aria-current`/active skin); `SectionDefinition.panels.list = "unavailable"` + its 3 consumer sites (if H3 = L-b) | shell capability, small | CT: clicking the glyph calls `setActiveSection("home")` — **assert the store action fired, never a rendered echo** · CT: no list toggle renders on home · snap: rail baseline drift ± the brand button, wide + narrow |
| **H2 — the chats tiles + the landing ruling** | `chatRecentsTile` + `chatQuickPicksTile` exported on chat's front door; the landing hero/recents/quick-picks DELETED (not left beside the new — the half-migration ban) and replaced by the slim empty state; `DEFAULT_STATE.activeSection` flipped if H1 = D-1 | moves only; zero new reads | CT: the recents tile renders rows from a seeded `listChats` cache · CT: the landing renders the slim state with its primary · the existing `chat-landing-surface.ct.tsx` is REWRITTEN (its recents/quick-pick assertions move to the tile CTs — a deleted-surface red is a harness artifact, not a regression) · side-eye pass |
| **H3 — temp chat** | the wire field; `DraftConfig`/`DraftCarry`/`startNewChat` seed; the tile; the draft + room badge; the `reapTemporaryChats` procedure + the home-mount call | 1 transport line, 1 carry line, 1 verb exposure | int: a `temporary:true` start writes the flag and the chat is absent from `listChats` · unit: `resolveDraftCommit` carries the flag sparsely (absent ⇒ byte-identical payload) · CT: the tile fires `startNewChat({temporary:true})` (assert the store) · CT: the badge renders pre-send |
| **H4 — the doorways** | `buddyDormantTile` + `automationDormantTile`; the `home-tile-registry-completeness` gate (all four coupled sites) | new gate | gate self-tests (`mustFlag` an empty reason, a dormant-with-action, a duplicate id; `mustPass` the real registry) · CT: a dormant tile renders the teaser + badge, no button, no skeleton |
| **DEFERRED (named so nobody fakes them)** | a URL axis for `activeSection` (needs every section's selection state URL-representable — its own program) · buddy's real tile (needs `domain/buddy`) · automation chips (needs the multiplex stage-4 wiring) | — | their own specs |

### 8.1 Test plan (the specific asserts, beyond "it renders")

- **the door CT** — mount `HomeSurface` with a hand-built `createContributorRegistry` of three fakes:
  order respected, a duplicate id THROWS at construction (assert the throw), `useVisible:()=>false` renders
  NOTHING (no gap, no empty card — the `RailChromeEntry` contract).
- **the dormant arm** — a `{dormant}` tile renders teaser + Dormant badge and NO interactive element
  (`getByRole("button")` count 0 inside the tile).
- **the glyph** — click → the shell store's `activeSection` is `"home"` (store assert), the brand button
  carries `aria-current="page"` while active, and `aria-hidden` is gone from the brand slot.
- **the jump tile** — rows equal `useSectionRegistry().list()` minus home, in registry order; clicking one
  fires `setActiveSection(id)`.
- **the pane capability** — on home, no list-toggle button exists in the topbar; on chats it still does.
- **rendered truth, not source** — a `pnpm snap` of home wide (1440) and narrow (900): assert the tile grid
  is TWO columns wide / ONE narrow via `boundingBox`, and that the tile card's resolved padding matches the
  `form`-tier token (never a hardcoded px). `done ≠ rendered`.

## 9. Composition with the sibling programs

**9.1 vs LIST-PANE PROJECTION (ratified A+B).** Both programs edit `main.tsx` (the door) and both touch
`features/chat`'s front door; L1 additionally rewrites `characters-section.tsx` and adds
`CharacterChatsProjectionView` to `lib/registry-contracts.ts` — the same file H0 edits. **Run home AFTER
L0-L4, never concurrently** (concurrent lanes on shared files are gate-thrash). Once landed they compose
cleanly and reinforce each other:

- the projection's `chatsWithCharacter` predicate and its `ChatSummaryRow` `portraits` upgrade (L2) are
  inherited by home's recents tile for free — one row anatomy, three surfaces (chats pane, her pane, home);
- Arm B's `FaceStrip` tier-2 composite (projection §11.2) is exactly what home's quick-picks tile should
  render once it exists — home's tile then becomes \~10 lines. **If both are approved, build the quick-picks
  tile ON `FaceStrip`** rather than moving the landing's private row markup; if home lands first, the tile
  is a named S5/L3 migration site.

**9.2 vs HUD-HOME.** Zero overlap: HUD-HOME owns the CONTEXT chain; home declares `context:{kind:"none"}`.

**9.3 vs DENSITY.** Home's tiles are a named S5 sweep item (`form`-tier islands); build home first, sweep
once. `<Surface tier>` does not exist yet — H0 builds on today's layout axes and the sweep re-voices it.

**9.4 vs SET-SEAMS.** No overlap in files. Deliberate rhyme in shape: both are "the host skims what features
raise". Where they differ, the difference is principled — settings sections claim SETTINGS KEYS (§2.3's
partition assertion exists because two sections writing one key is a lost update), while home tiles claim
only SCREEN SPACE, so home needs no partition pin, only a duplicate-id throw.

## 10. Owner decisions

| # | decision | recommendation |
| - | - | - |
| **H1** | **The headline, ONE coupled ruling: is home the born default, and does the chat landing hero retire?** D-1 (home default + landing slims to an empty state) vs D-2 (chats default; home tiles then duplicate the landing) | **D-1.** One launcher, one truth. The persisted `activeSection` means only fresh installs are affected; D62 P4's "never open on an empty room" is better served by a home than by a hero bolted inside chats. Under D-2 the launcher should STILL move to home — the fork is "where do I land", not "how many launchers exist" |
| **H2** | Mobile: home takes a bottom-bar tab. Which curation — **Home · Chats · Characters · You** (Corpus folds to the sheet) or five tabs (Home · Chats · Characters · Corpus · You)? | **four tabs, Corpus folds.** Thumb-reach targets stay wide; Corpus is a deliberate search entry, reachable from the You sheet and ⌘K. One `mobile` field flip, no mechanism |
| **H3** | The LIST pane on home: **L-b** (teach the shell `list: "unavailable"` — 1 Def field + 3 sites) vs L-c (home's LIST becomes the recents list) vs L-a (leave the "isn't wired yet" placeholder reachable) | **L-b.** It is genuine missing capability every future pane-less section needs, it adds no `PanelMode` member, and it is invisible to existing sections. L-a is rejected outright |
| **H4** | Temp chat mechanism: the BUILT `chats.temporary` flag (hidden from `listChats` + TTL reaper) vs auto-archive-on-leave vs hard-ephemeral | **the built flag.** Auto-archive is host-only and would hide a multi-human room for everyone; hard-ephemeral contradicts the write law (a turn needs a row + a roster + a seq). This is exposure work, not design work |
| **H5** | The reaper's call site: fire-and-forget `chat.reapTemporaryChats` on home mount vs a workloads runner | **home mount.** The verb is already per-caller-scoped with a per-user TTL; a workload adds scheduling for a sweep that costs one indexed delete |
| **H6** | Tile ownership: the character quick-picks tile is CHAT-owned (moves as-is) vs CHARACTER-owned (new home for the faces) | **chat-owned.** The tile's data and intent are "start a chat"; character-homing forks a body that already exists. Revisit only if `FaceStrip` (projection §11.2) lands first, which makes either home \~10 lines |
| **H7** | The dormant mechanism: the `{dormant:{reason,teaser}}` BODY ARM (recommended) vs the brief's `when`-gate | **the dormant arm.** A `when` gating a BUILD fact can only be `()=>false` — the doorway vanishes and the stale predicate is undetectable. The arm is visible, gate-checkable, and self-cleaning (marker and body are one field). `useVisible` stays for LIVE capability gates |
| **H8** | Buddy's tile home before the domain returns: `features/home/lib/buddy-tile.tsx` vs an empty `features/buddy/` dir | **home-owned.** An empty feature dir is G23-RED, and adding `tile` to G23's suffix list is work that belongs to the day buddy actually lands |
| **H9** | Does home ship a "more coming" placeholder tile for unnamed future stuff? | **NO.** The posture is mechanical (a tile is one file + one array member). The mock shows the `automation` doorway as the honest face of future stuff that is REAL; an empty promise card is the `{placeholder}` marker the doctrine bans |
| **H10** | The tile CONTRACT's home: `lib/registry-contracts.ts` (tier 4) vs `state/home-tile-registry.ts` | **tier 4.** It binds no state-owned vocabulary — the `CharacterDetailContribution` precedent. If a tile ever needs `SectionId` in its own contract, it moves to `state/` under the same test that moved `SettingsSectionContribution` there |
| **H11** | Home's own placeholder copy (title + the description the jump rows and ⌘K show) | proposed: **"Home" / "Your landing — recent threads, quick jumps, and whatever you keep here."** Distinctness is gate-checked; the owner owns the voice |

## 11. Homes — the file map

| file | change |
| - | - |
| `packages/client/src/lib/registry-contracts.ts` | H0: `HomeTileContribution` · `HomeTileSpan` · `DormantDoorway` |
| `packages/client/src/features/home/lib/home-section.tsx` | NEW (H0) — `makeHomeSection(tiles)`; the section definition (rail/panelDefaults/placeholder/content/context:none) |
| `packages/client/src/features/home/surfaces/home-surface.tsx` | NEW (H0) — the grid host + the zero-tile empty state |
| `packages/client/src/features/home/components/home-tile.tsx` | NEW (H0) — the tile frame: kicker header + icon + action + per-tile `QueryBoundary`; the dormant doorway arm |
| `packages/client/src/features/home/lib/section-jump-tile.tsx` | NEW (H0) — DERIVED from the section registry (§3.4) |
| `packages/client/src/features/home/lib/{buddy,automation}-tile.tsx` | NEW (H4) — the dormant doorways |
| `packages/client/src/features/home/index.ts` | NEW (H0) — the front door (the section + the home-owned tiles) |
| `packages/client/src/state/shell-store.ts` | H0: `SECTION_IDS` gains `"home"` · H2: `DEFAULT_STATE.activeSection` (if H1 = D-1) |
| `packages/client/src/state/chrome-registry.ts` | H1: `CHROME_ZONES` gains `"rail.brand"` |
| `packages/client/src/state/section-registry.ts` | H1: `RailEntry.zone?` · H1/H3: `SectionDefinition.panels?.list` (if H3 = L-b) |
| `packages/client/src/state/assemble-chrome.ts` | H1: `sectionEntry` reads `rail.zone` |
| `packages/client/src/features/app-shell/components/rail.tsx` | H1: the brand slot renders the `rail.brand` entry as a real affordance |
| `packages/client/src/features/app-shell/components/shell-topbar.tsx` + `hooks/use-shell-layout.ts` | H1: honor `panels.list = "unavailable"` (no toggle, forced collapsed) |
| `packages/client/src/features/chat/lib/home-{recents,quick-picks,temp-chat}-tile.tsx` | NEW (H2/H3) — chat's contributions, exported on its front door |
| `packages/client/src/features/chat/surfaces/chat-landing-surface.tsx` | H2: hero + recents + quick-picks DELETED; the slim no-selection state remains (`showRecents` dies with them) |
| `packages/client/src/features/chat/lib/draft-commit.ts` + `state/draft-config-store.ts` + `state/active-chat-store.ts` | H3: the sparse `temporary` carry + the `DraftSeed` field |
| `packages/server/src/transport/trpc/routers/chat.ts` | H3: `startChatSchema.temporary` + the `reapTemporaryChats` procedure |
| `packages/client/src/main.tsx` | H0: the `home-tiles` registry + `makeHomeSection` in the section assembly (the door — G8) |
| `scripts/check/gates/home-tile-registry-completeness.ts` (+ the Active-Gates row, the count, the fixture writer) | H4: the new gate, all four coupled sites |
| tests | `tests/client/features/home/**` (surface + tile CTs), `tests/client/features/app-shell/components/rail.ct.tsx` (glyph), `tests/client/features/chat/**` (tile CTs + the rewritten landing CT), `tests/server/domain/chat/**` (the temporary-start int test) |

**No db, contracts-schema, or migration work in any stage.** The only server change in the whole program is
two transport lines (H3) over verbs that already exist.
