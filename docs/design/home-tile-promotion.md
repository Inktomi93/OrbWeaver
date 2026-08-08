---
kind: design
status: open — owner decision pending
updated: 2026-08-08
---

# Conditional HOME-tile promotion (the databank `useOrder` follow-up)

**The ask.** side-eye 2026-08-08 P2-f, against the databank home tile: when the bank has documents needing
attention (`bankHealth(...).attention.length > 0`), the Databank tile should float **above** the jump grid
instead of sitting at its static `order` 50, below the jump tile's 40.

**Status.** REFUSED once by the S3 fix-all lane ("static order — home-owned `useOrder` follow-up boarded"),
then re-examined by the DBANK-HOME lane, which found the boarded follow-up's own suggested mechanism
unbuildable and a second, independent objection nobody had named. Escalated to the owner: **the question is
not how, it is whether.** This file is the design if the answer is "build it".

## Why it is not a small change

### The tree today (verified 2026-08-08)

- `packages/client/src/features/home/lib/order-home-tiles.ts` — `orderHomeTiles(tiles)` is a pure
  `(order ?? 0, id)` total sort over the door-frozen registry list. No data, no hooks.
- `packages/client/src/features/home/surfaces/home-surface.tsx` — calls it once, then `list.map(tile =>
  <HomeTile key tile />)`.
- `packages/client/src/features/home/components/home-tile.tsx` — a **component per entry**, which is the
  sanctioned site for a per-tile hook: it already calls `tile.useVisible?.()` at its own top level. Its
  header states the rule: *"A component per entry (never a hook call in a `.map()` body)."*
- `packages/client/src/state/home-tile-contracts.ts` — `HomeTileContribution`. `useVisible` is documented as
  "called UNCONDITIONALLY over the door-frozen list ... by the tile's own component, never in a map body".

### Arm (a) — `useOrder?: () => number` + "a component-per-entry sort stage in HomeSurface": NOT BUILDABLE

The boarded follow-up's own words. It cannot be built as stated, and the reason is structural, not stylistic:
to SORT in `HomeSurface`, the parent needs N order values before it renders anything. N hook calls cannot
happen in the parent (`react-hooks/rules-of-hooks`, and this repo's own no-hook-in-a-map law). A
component-per-entry can only report a value **upward**, which means `useEffect` + `setState` in the parent —
effect-derived render state, a guaranteed second render pass, and a visible reflow. That is not a sort stage;
it is a flash with extra steps.

### Arm (b) — CSS `order` on the grid item: REFUSED, with a receipt

The one shape where a per-entry hook works: `HomeTile` calls `tile.useOrder?.()` at its already-sanctioned
top level and applies the result as a grid-item `order`. It is small, it needs no store, it has no flash.

It is also a **WCAG 2.4.3 (Focus Order, Level A) divergence**: CSS `order` moves the tile visually while DOM
order — and therefore tab order — stays at registration order. A keyboard user tabs into the jump grid
*before* the tile that is painted above it. On a dashboard of independent landmarks that is not a
comprehension failure, but it is exactly the class of defect a side-eye pass files, and shipping it to
satisfy a side-eye finding would be trading one finding for another.

### The objection the refusal did not name: this re-opens F14

The promotion signal is **query data** (`databank.list` → `bankHealth`). It is not known at first paint. So
any data-driven promotion moves a **full-span** tile (the jump grid) after the databank read lands — a boot
layout shift on the one surface whose CLS is a tracked, measured, already-fixed defect (F14; the
`home-tile-box-store` reservation in `home-tile.tsx` exists precisely because a tile changing size after its
read cost CLS 0.0913–0.24). A tile changing POSITION is the same defect one axis over.

**Any correct build of this feature must therefore resolve the promotion at first paint, or it ships a
regression of a defect this codebase already paid to fix.**

## The arm that would be built

DOM-correct, F14-consistent, no hook in a map, no state lifting:

1. **A new `#state` store, `home-tile-promotion`** — `promoteHomeTile(id, promoted)` /
   `useHomeTilePromotions(): ReadonlySet<string>`, localStorage-backed and read **synchronously**, so the
   value is present in the FIRST commit. This is not a new idea on this surface: it is exactly the
   `home-tile-box-store` shape and the same bargain (shift once, remembered thereafter).
2. **`HomeSurface` calls `useHomeTilePromotions()` ONCE** at its own top level — one hook, no map — and
   passes the set to `orderHomeTiles(list, promoted)`, which sorts promoted ids ahead of the static order.
   The sort stays pure; the data arrives as an argument.
3. **The databank tile publishes**: `promoteHomeTile("databank.documents", health.attention.length > 0)`
   from an effect in its own body — a cross-subtree publication, the same effect class `rememberHomeTileBox`
   already runs from `HomeTile`.

### Costs the owner is buying

- **An effect publication.** It may trip `react-you-might-not-need-an-effect` (mirroring derived query data
  into an external store). A suppression there would need a cited reason; the honest framing is
  "publication to another subtree", not "derived state", but the rule does not distinguish.
- **Per-device promotion memory, with an asymmetric demote.** The tile paints promoted at first commit
  because *this device* last saw attention. When the user fixes the stall, the first load after the fix
  paints promoted and then demotes when the data lands — one downward shift. Rarer than the upward one, but
  real, and it is a UX call, not an implementation detail.
- **Shared-surface surgery for one tile.** A contract-adjacent store, a signature change to
  `orderHomeTiles`, and a new ordering concept every future tile author must understand — for a promotion
  exactly one tile uses today.

## Recommendation

**Do not build it; close the finding as covered.** The attention signal is already loud and actionable
*where it sits*: the S3 fix-all landed the aggregate chips as danger-toned, deep-linking **buttons** that
scope the library to the wedged phase and navigate there ("Show the 3 stalled documents in your databank").
Promotion moves the tile a few hundred pixels up a page the user is already looking at; the chips already
tell them what is wrong and take them to it. That is polish on a solved problem, and its honest price is a
new ordering mechanism on a shared surface plus a re-litigation of the CLS work.

If the owner wants it anyway, build the store arm above — never arm (b).
