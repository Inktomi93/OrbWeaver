---
paths:
  - "packages/ui/src/**"
  - "packages/client/src/**"
---

# UI and client

## Tokens and generated files

- Get every value from `packages/ui/src/tokens/tokens.json` through `pnpm --filter @orb/ui tokens:build` (`packages/ui/tokens.build.ts`). Never hand-edit `theme.css` or a generated token file. A lint rule blocks raw px, hex and arbitrary Tailwind values, and `className` on a raw HTML element; compose `@orb/ui` primitives, and assert geometry against the resolved token value, never a hard-coded px.
- Import icons only from `@orb/ui/icons`; grow that allowlist for a new icon, never import `lucide-react` directly.
- `ThemeScope` emits CSS custom properties and `colorScheme` only, never a color value. Primary, ring and accent-fill are the one palette family a carried background does not derive.

## Composition and ownership

- New client wiring for state, features and data lives in a directory module at `packages/client/src/<name>/index.ts`, wired into `main.tsx`. `lib/` and non-root files under `routes/` stay import-restricted.
- A feature that needs a raw `img`, `video` or `audio` element mints a primitive in `@orb/ui` and composes it thinly; `client/components` is not the place for one.
- Before minting an accessible-name grammar, check whether `@orb/ui/src/lib/action-names.ts` already spells it. A ui-owned grammar lives there, not in client `lib`.
- Any anchored popup composes the shared `POPUP_SURFACE` recipe, or states why not; a hand-spelled surface silently loses the Base UI available-height clamp.

## Composing Base UI primitives

- Base UI parts compute their own CSS vars and do not re-render a wrapper on that change. Observe the node with a `MutationObserver` on `style`, not a React commit.
- A positioner side is unreachable from the trigger; it is portaled and exposes no side attribute. Publish side through your own context from the Popup wrapper.
- `data-focused` and other field-state attributes are no-ops outside `Field.Root`. Style a standalone control's focus ring with `:has(:focus-visible)`, never `data-focused:*`.
- Composing a root via `render={<Other/>}` keeps only one `data-slot` in the DOM; decide which component owns it.
- Before minting a `data-*` prop, sweep the installed package for a runtime clash. `variant`, `size`, `intent` and `tone` are confirmed safe.
- Merge a caller ref into a sealed primitive rather than overriding it; check the primitive's header for a vendor self-correction first.
- A disabled button or menu item renders `aria-disabled`, not native `disabled`, and swallows its click. Explain it with `aria-describedby` plus visible copy reachable at a coarse pointer; never rely on `title` alone, and never wrap it in the tooltip primitive. A disabled trigger also drops pointer events, so a reason tooltip needs `data-disabled:pointer-events-auto` on the trigger.
- The tooltip's painted popup is `aria-hidden`. Assert it by its open-state attribute, and assert the always-mounted description by its own slot, never by visible text.
- A call-site `className` cannot reliably override a size or height utility built from a custom token; add a real variant in `@orb/ui` instead.
- Floating-ui rounds a popup positioner's transform to the device pixel grid; treat an off-grid-transform finding as a tool artifact first.

## Layout and CSS

- A layout or balance fix measures both width ends, any crossover, and every appearance variant.
- A child carrying `flex:*` under a non-flex parent means the parent needs `display:flex`.
- In a row of truncating text plus a must-not-shrink cluster, floor the cluster with `min-content`/`shrink-0` and give the text `min-width:0` plus truncate. Never do the reverse.
- A `@container` query on the same element that declares the container never matches. Split the container root from the child that reads it.
- A bare `max-content` subgrid track a full-span row shares absorbs its full width and collapses a neighbor. Use `fit-content` or a fixed token track.
- A reduced-motion floor sets `transition-property:none`, not only `transition-duration`, or every inserted node still fires a transition event.
- In a `pointer-events:none` region with `auto` children, only the gaps between children are inert. Probe operability at the gaps.

## Empty, disabled and degraded states

- Distinguish an omitted state, a taught empty state and a populated state explicitly. A section that silently renders nothing when empty reads the same as an unbuilt feature.
- Never build a separate reduced-mode surface for a not-ready state. Render the real surface with inapplicable affordances disabled and explained, and omit only permission-gated ones.
- Put essential copy in visible or announced content, never only in `title`; it is invisible on touch and is not the accessible name.
- Inside the chat transcript, a tool call always renders, even with no registered card. Fall back to the generic block rather than rendering nothing.

## React state and effects

- The client and `@orb/ui` are React-Compiler compiled. Manual `memo`/`useMemo`/`useCallback` are banned outside the gate-exempted files. Diagnose re-render cost as a subscription or virtualization cost, not a missing memo.
- Never read or write `ref.current` during render, including passing a ref into a render-called function. Use setState-during-render with a prev check, or `useState`.
- A controlled Base UI popover closed by your own `setOpen(false)` does not fire `onOpenChange`. Route every close path through one setter.
- `.then(fn, fn)` with a void-returning handler resolves instead of propagating a rejection. Use `.finally()` for cleanup.
- `usePrefetchQuery` does not type-check against tRPC's `queryOptions`. Prefetch with `queryClient.ensureQueryData` in an effect, sharing query keys with the reader.
- A persisted zustand store's `reset` writes through to storage. Clear storage directly around a reset instead of setting initial state alone.
- An editable id-less form array needs a real parallel `rowIds` field synced at every mutation site, never a uuid generated from the array index.
- A one-off labeled control in a feature uses static `label` + `htmlFor` + `aria-labelledby` instead of the `@orb/ui` `Field`, which associates at runtime and forces an a11y suppression.
- When a host calls an optional per-contribution hook once per registry entry, key the component by contribution id, or a hook-count mismatch crashes React past route boundaries.

## Debugging heuristics

- If a stale render survives reload, the in-memory query cache is exonerated; sweep `localStorage` and cookies instead.
- Before moving a shared className's threshold, grep every element wearing that class; a shared name can hide an unrelated control.
- `window.__orb.queries()` semantics live in `rules/browser-tests.md`.
- Chrome's missing id/name warning is invisible to console and to Playwright's bundled Chromium, and `aria-label` does not satisfy it.

## Dev instrumentation

- Every new dev observer, flagger, ring or debug surface registers an accessor on `window.__orb` (`packages/client/src/lib/agent-bridge.ts`) in the same change that creates it, or it is invisible to snap and agent probes.
- `window.__orb` does not exist in a prod bundle. Measure prod layout shift with a buffered `PerformanceObserver`, not `getEntriesByType`.
- A session-deduped evidence ring's timestamp is its first raise, not an occurrence. Never time-window filter it.
- Gate a new `EventSource` on the feature being active; the browser's per-origin connection budget is shared and small.
