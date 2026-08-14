# Orbweaver UI — weave motion cluster (conventions)

This project currently syncs the **main-page weave animation cluster only**: `WebWeave` (the living
brand web, canvas), `WeaveVeil` (the fullscreen boot/blocking veil), `WebSpinner` (THE loader, five
sizes). It exists for a **motion review** — see "Review brief" below before proposing changes.

## Setup — no provider

No provider or wrapper component is required. Components read the theme through CSS custom
properties defined in the shipped `styles.css` closure (dark-first palette). Two hosting rules:

- `<WebWeave>` is pure decoration that **fills its host box** — the host decides the size. Always
  wrap it: `<div className="bg-background" style={{ position: "relative", overflow: "hidden", width: …, height: … }}><WebWeave /></div>`.
  It is `aria-hidden` and pointer-transparent; the hosting surface carries the words.
- `<WeaveVeil open label="…">` is a **fixed full-viewport layer** (z `var(--z-modal)`). Mount it for
  real waits only; flip `open` false to play the dissolve exit. Children position against the veil.
- `<WebSpinner label="…">` requires `label` (it is a `role="status"` live region). It inherits
  `currentColor` — tint via `className="text-primary"`.

## Styling idiom

Tailwind utility classes, resolved from the shipped compiled stylesheet — **only class names that
already appear in `styles.css`'s import closure resolve**; do not invent new utility spellings.
The load-bearing vocabulary: `bg-background`, `text-foreground`, `text-primary`,
`text-muted-foreground`. Color tokens for custom CSS: `var(--color-primary)`,
`var(--color-foreground)`, `var(--color-sky-star)`. Motion tokens: `var(--motion-layout)` (layout
transitions), `var(--motion-ambient)` (slow ambient rotation), `var(--motion-shimmer)` (silk
pulse). The weave resolves its palette at runtime from these tokens via computed style — theme
changes recolor the canvas without props.

## Where the truth lives

Read `styles.css` and its `@import`ed `_ds_bundle.css` (the app's real compiled stylesheet) before
styling; each component's `.d.ts` is its API contract and its `.prompt.md` shows composition.

## Idiomatic build snippet

```tsx
// The login composition: dimmed web behind a card, spider hidden.
<div className="bg-background" style={{ position: "relative", overflow: "hidden", width: 640, height: 400 }}>
  <WebWeave state="settled" dim={0.45} spider={false} hub={{ x: 0.5, y: 0.34 }} />
  {/* the card/content renders above the web */}
</div>
```

## Review brief — owner-reported motion defects (2026-08-14)

The point of this sync. Judge the animations live (cards animate in the pane; the synced
screenshots catch single frames):

1. **Unconnected geometry** — some strands don't join the web (visible in the `Partial` card:
   radial spokes overshoot the ellipse instead of terminating on it).
2. **Overflow at certain host sizes** — pieces stick out of bounds in wide-short and tall-narrow
   hosts (the `WideShort` / `TallNarrow` cards reproduce it deliberately).
3. **Spider pathing** — her movement doesn't read as sensible spider motion.
4. **Web highlights look glitchy** — the silk highlight/shimmer treatment reads wrong.

Proposed fixes should land against the pure modules (`web-weave-geometry` / `web-weave-spider` /
`web-weave-render` — deterministic, vitest-covered), never as canvas hacks in the component.
