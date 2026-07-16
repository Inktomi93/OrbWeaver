---
kind: spec
status: draft
updated: 2026-07-16
---

# Shell Chrome Unification (proposed program — Fable design, owner-approved for AFTER the lockdown)

> **STATUS: design of record. Slice 1 (`topbar.trail`) SHIPPED (N1); the rail/sheet/prop-kill waves remain.**
> **Sequencing across the three programs lives in ONE home: `ui-cohesion-north-star.md` header ("Sequencing")**
> — §E steps 1–3 land BEFORE the cohesion N1 paint (rail brand/topbar skin style the post-cutover DOM once);
> steps 5–7 may run parallel to cohesion N2–N5. Step 7's account-pane deletion is cross-recorded there (§6).
> **Derive-program pairing (`derive-modernization-audit.md`):** its W3 `createRegistryContext` mint (G26)
> replaces the four hand context/provider pairs INCLUDING `state/chrome-registry-{context,provider}`, and
> §E-1's `SectionGroup` re-home ABSORBS the audit's `SECTION_GROUPS` double-spell finding (W3-#5) —
> whichever wave lands first, the other consumes it, never re-does it.
> Authored by the Fable architect 2026-07-15 from the live app (screenshots) + the code. The owner ratified the
> DIRECTION and sequenced the bulk AFTER the client-architecture lockdown (M0–M11, now promoted to `core/` as law).
> This doc captures the full design so no work is lost.
>
> **What N1 shipped (a vertical slice, not §E steps 1–2 in order):** a REDUCED `ChromeEntry` — the widget arm only
> (`{id,label,icon?,zone,order?,useVisible?,body:()=>ReactNode}`; NO `section`/`modal`/`widget` behavior union),
> assembled via `createContributorRegistry` (NOT `assembleChrome`), with only `zone:"topbar.trail"` consumed.
> `notificationsChrome` + `fullscreenChrome` + `contextToggleChrome` are real registered widgets; the
> `chrome-registry-completeness` gate is live; the `topbarTrail` prop and the doubled detail-panel close are gone.
> **Notifications is therefore NO LONGER an O2 exemption — it owns `notifications-chrome.tsx` (G23/O2 in
> `client-architecture-lockdown.md`, which is authoritative on this).** STILL UNBUILT: the behavior union +
> derivation from sections/modals (§A), `assembleChrome` + its door gate, the rail single-DOM cutover (§C),
> the You-sheet projection + mobile persona (§B), and killing `railFoot` (§E steps 3/5/6). §A–§E remain the design
> of record for that remainder.

## The problem (verified, eyes + code)

Chrome enters the shell frame by **three different mechanisms**: registry derivation (sections, modal triggers),
ReactNode **prop injection** (`AppShellProps.railFoot` → the persona avatar, `topbarTrail` → the notification
bell, both hand-wired in `routes/app-root.tsx`), and **hardcoding** (the topbar focus + context-panel toggles).
That mechanical non-uniformity — not the visual foot cluster — is the real "rail-foot vs rail-body vs top-rail"
weirdness. Three load-bearing consequences:

1. The avatar is the ONE bespoke exception the lockdown left behind (it renders the live persona face, which a
   static `{icon,label}` modal trigger can't express) → prop-injected, not registered.
2. **Mobile has no persona switcher at all** — the avatar lives only in the desktop DOM block; the mobile You
   sheet shows Theme/Settings/Account but "playing as" switching is unreachable on a phone. The bespoke seam
   silently dropped a capability on one regime.
3. "Account" exists in THREE places — the account modal (real: handle/role/sign-out), the persona popover's
   Account strip (opens it), and a DECLARED-PLANNED settings pane (`features/settings/lib/account-pane.tsx`) whose
   planned-reason ("identity + sign-out land here when auth is wired") is now FALSE (auth is wired, in the modal).

## A. The unified model — ONE chrome registry, zones as data, projections as lenses

Every global affordance in the shell frame is a **chrome entry** in ONE registry, assembled once at the door,
consumed blind. "Rail body vs rail foot vs topbar" becomes ONE mechanism with a `zone` field. The rail is one
component rendering one list; the foot is just more entries after the spacer. Entries come from three sources but
by **derivation, never re-declaration**: sections (from `SectionDefinition.rail`), modal triggers (from
`ModalDefinition.trigger`), and **widgets** (the new arm — live feature-owned chrome a static icon can't express:
the persona avatar, the notification bell, and the shell's own topbar affordances).

Vocabulary (`state/chrome-registry.ts` — state owns shell vocab, §5 rule 5):

```ts
export const CHROME_ZONES = ["rail.nav", "rail.end", "topbar.trail"] as const;
export type ChromeZone = (typeof CHROME_ZONES)[number];

// A rail entry's mobile fate — an EXPLICIT decision, replaces `mobilePrimary?: boolean`.
export type MobileCuration = "tab" | "sheet";
// Which lens renders a widget: the always-mounted bar DOM, or the You-sheet projection.
export type ChromePresentation = "bar" | "sheet";

export type ChromeEntryBehavior =
  | { readonly kind: "section"; readonly sectionId: SectionId }
  | { readonly kind: "modal"; readonly modalId: ModalSlotId }
  | { readonly kind: "widget"; readonly body: (p: ChromePresentation) => ReactNode };

export interface ChromeEntry {
  readonly id: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly zone: ChromeZone;
  readonly group?: SectionGroup;      // rail.nav grouping — ONE home (kills rail-slots.ts's duplicate tuple)
  readonly order?: number;
  readonly mobile?: MobileCuration;   // rail entries only
  readonly useVisible?: () => boolean; // capability gate, called unconditionally; false ⇒ render NOTHING (no gap)
}
```

Assembly at the door: `assembleChrome({ sections, modals, widgets })` (a pure, unit-testable function: dupe-id
throw, zone-validate, deterministic per-zone order algebra) → `ChromeRegistryProvider` (the section-registry
context/provider split pattern). Widgets: `personaChrome` (rail.end, mobile:"sheet"), `notificationsChrome`
(topbar.trail, useVisible: multiHumanCapable), `focusToggleChrome` + `contextToggleChrome` (topbar.trail —
app-shell registers its own chrome through the same door, no self-privilege).

**The topbar becomes dynamic** (the owner's ask): the trail is a registry render of `zone === "topbar.trail"` —
bell (widget, gated) + ⌘K (derived from `commandModal.trigger`) + fullscreen/focus (widget) + context toggle
(widget). The crisp line: **clusters are registries; the frame's own panel grammar is NOT.** The list/detail
panel toggles stay intrinsic — a toggle is positionally bound to the panel it controls. (This also resolves the
DOUBLED detail-panel close button: one registered context toggle, delete the panel-header's redundant collapse.)

`MODAL_TRIGGER_PLACEMENTS` tightens to `["rail.end", "topbar.trail", "mobile-tab", "surface"]` (`"surface"` merges
today's `content`+`avatar` = "my trigger lives inside a feature surface"; the `avatar` pseudo-zone dies — the
account modal is reached from inside the identity widget). **`AppShellProps.railFoot` + `topbarTrail` DIE** — the
shell accepts zero ReactNode chrome props; `app-root.tsx` slims to §7 residue.

## B. You vs Account — a containment chain: You ⊃ Identity ⊃ Account

| Thing | What it is | Presentation |
|---|---|---|
| **You** | NOT a page — the mobile PROJECTION of shell chrome (the drawer where `mobile:"sheet"` rail entries land). No content of its own. | Bottom-sheet drawer (modal slot `"you"`, app-shell-owned) |
| **Identity** | A chrome widget (persona switcher + Account strip). ONE widget, two lenses: `body("bar")` = avatar chip + popover (desktop); `body("sheet")` = same sections inline in the You sheet. | Both |
| **Account** | A leaf modal (auth card: handle · role · sign-out). Reached only from inside Identity. Placement `"surface"`. | Centered dialog |

Two rulings fall out: (1) **the mobile persona gap closes for free** — `personaChrome.body("sheet")` renders the
Playing-as header + persona rows in the sheet; (2) **the settings `account` pane dies** (stale planned-reason) —
one concept named "account" remains (the modal); it graduates to a pane only if account-settings ever grow real
weight (a D-note, not speculative structure now).

## C. CSS-transform verdict — YES for the bar, projection (not CSS) for the sheet

- **Rail bar = ONE DOM list, CSS-reflowed.** Today `rail.tsx` renders every button TWICE (`.shell-rail-desktop`
  + `.shell-rail-mobile`, `RailButton` vs `RailTabButton`) and the one `@media` flips `display`. The single-DOM
  design: one flat grouped list with `data-mobile="tab|sheet"` per entry; inside the existing one
  `@media (max-width:48rem)` — `flex-direction: column→row`, `[data-mobile="sheet"]{display:none}` (curation as CSS
  visibility over the same DOM; `display:none` also removes them from the a11y tree), labels shown on mobile via
  CSS, brand/spacer hidden + overflow "You" button shown. **Dies:** `.shell-rail-desktop`, `.shell-rail-mobile`,
  `RailTabButton`, the double render.
- **You sheet CANNOT be pure CSS** — it's a real modal (portal into the themed root, focus trap, scrim, Escape,
  `aria-modal`). CSS can restyle nodes; it cannot re-parent into a portal, trap focus, or make the background
  inert. A "CSS-only sheet" would be a fake modal that fails keyboard + SR users. **BUT** the maintenance
  duplication dies one level up: the sheet becomes a blind PROJECTION over the same resolved chrome list (not a
  second hand-maintained derivation — today `YouSheet` re-derives the registries with complementary filters kept
  correct by discipline alone). Add a chrome entry once at the door → desktop rail, mobile bar, AND the You sheet
  all pick it up, each in its native form. Nothing maintained twice. The breakpoint story (the one `@media`,
  `mobileViewport`/`narrowViewport`, `resolvePanelMode`) is untouched.

## D. Door + gates

Door: `assembleChrome(...)` + `ChromeRegistryProvider` in `main.tsx`. Gate family (mirror the existing pattern):
**`chrome-registry-completeness`** (new; mirror `modal-registry-completeness`: widget co-location
`features/<owner>/lib/<id>-chrome.tsx`, dupe-id, zone ∈ CHROME_ZONES, a `rail.*` widget must declare `mobile`, a
`topbar.*` must not); **`modal-registry-completeness`** update (new placement vocab; singleton shrinks to
`mobile-tab`; a `"surface"` modal needs ≥1 `openModal("<id>")` call site); **`shell-no-chrome-props`** (new arm in
`client-structure`: `AppShellProps`/`ShellTopbarProps`/`RailProps` may declare no ReactNode chrome slot props —
the rotted seam becomes unspellable); **`no-parallel-section-map`** extend (a hand-maintained chrome list outside
the door/`-chrome.tsx` is RED). Chrome adds no id tuple — it's a contributor-style OPEN set over a CLOSED zone
vocabulary (zones are architecture, entries are growth).

## E. Migration sketch (each step green; ~one executor wave each)

> **N1 took a vertical slice — a minimal mint + step 4 — via `createContributorRegistry`, skipping steps 1–2's
> `assembleChrome`. Statuses below reflect that. The remainder still stands as written.**

1. **Mint** — ● DONE (2026-07-16). Full zone/curation vocab minted (`MobileCuration`,
   `ChromePresentation`, `ChromeEntry.group?/mobile?`); `SECTION_GROUPS` has ONE home
   (`state/section-registry.ts`, closing derive-audit W3-#5); `rail-slots.ts` DELETED early with
   clean consumers (its §E-7 deadline beaten); the chrome context/provider rides the W3
   `createRegistryContext` mint (G26). The behavior union + `body(presentation)` stay step 2's crux
   by design.
2. **Assemble** — ● DONE (2026-07-16). `ChromeEntryBehavior` union (section|modal|widget with the
   `ChromePresentation` lens param, bar-only until §E-5); pure `state/assemble-chrome.ts` derives
   `rail.nav` from `SectionDefinition`s (`mobilePrimary → tab|sheet` mapped in ONE home; the 7 defs
   migrate at step 3) + `rail.end` from `rail-footer` modal triggers + the widgets, owning the
   dupe/zone/order algebra; `main.tsx` assembles once through the existing provider (G8 intact).
   `topbar-command` deliberately unmapped — the bespoke ⌘K chip's unification is a VISIBLE change
   deferred to N1's skin pass. `rail.nav`/`rail.end` entries are assembled-but-unconsumed until step 3.
   Completeness gate: `rail.*` widgets must declare `mobile`; `topbar.*` must not.
3. **Rail cutover** — ● DONE (2026-07-16). ONE nav from the assembled registry (brand → grouped
   `rail.nav` → spacer → `rail.end` + railFoot avatar → the mobile-only You tab); the merged
   `RailButton` carries a CSS-toggled label; the one `@media` reflows the SAME DOM
   (`[data-mobile="sheet"]` hidden = out of the a11y tree). Twin blocks + `RailTabButton` +
   `.shell-tab-*` deleted (zero external refs). The 7 defs migrated to REQUIRED
   `mobile: MobileCuration`; the assembler shim died. NOTE: `MobileCuration` HOMES in
   `section-registry.ts` (a chrome↔section type cycle trips `no-circular`); `chrome-registry.ts`
   re-exports it — §A's vocab listing reads accordingly.
4. **Topbar-trail cutover** — ● DONE (N1). Trail renders `zone("topbar.trail")`; bell carries `useVisible`;
   `topbarTrail` prop + app-root wiring deleted; hardcoded focus/context buttons → app-shell widget entries; the
   doubled detail-panel close is gone.
5. **Sheet cutover** — ○ NOT DONE. `YouSheet` → blind projection (`presentation:"sheet"`); persona widget grows
   `body("sheet")` (**mobile persona switching ships here**); placement `avatar` dies; account modal → `"surface"`.
6. **Kill `railFoot`** — ○ NOT DONE. `railFoot` prop still lives on `AppShellProps`. Persona chrome entry owns the
   avatar; app-root slims to §7 residue.
7. **Vocabulary + law** — ○ NOT DONE. `rail-footer`→`rail.end`, `content`→`surface`; delete the settings `account`
   pane; land the remaining gates (prove each bites); update `UI-Architecture-and-Layout.md` §4.x; D-ledger entries
   for (a) clusters-are-registries / frame-grammar-is-intrinsic, (b) You ⊃ Identity ⊃ Account.

**Deleted at the end:** `railFoot` + `topbarTrail` props, `RailTabButton`, both rail DOM twins, `YouSheet`'s
filters, `rail-slots.ts`, placement `avatar`, the planned account pane. **Watchpoints:** hooks-over-registry-list
needs the frozen-at-door list (holds by construction); `.ct.tsx` front-door crash → story-module indirection for
rail/you-sheet stories; the bell's no-flash rule preserved by `useVisible` returning false until authConfig lands.
