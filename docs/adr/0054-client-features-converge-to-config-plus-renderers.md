---
kind: adr
status: active
updated: 2026-09-23
---

# Client features converge to config plus renderers

## Context

Not recorded in the ledger row.

## Decision

Client-foundation reuse model (full law: `UI-Primitives-and-Reuse.md` §13): extend "footguns carried by structure" to BOILERPLATE — a feature converges to config + a renderer; wiring lives in primitives the call site can't bypass (`createEntityMutation`, `createCollectionSurface`, `useGatedQuery`/`skipToken`, `<QueryBoundary>`, the two form factories, the virtual-list/message-list seals). The §13.2 surface→primitive map is the cold-agent contract. QueryClient pins: `staleTime:Infinity` (the SSE bus drives freshness — never `'static'`, which silently ignores invalidation), `refetchOnReconnect:true` (the SSE-gap catch-up), `refetchOnWindowFocus:false`, mutations `retry:0`, global meta-toasts. Form threshold: ≥3 fields OR validation OR save/draft semantics → the factories (forms are for forms, not "entities"). Zustand: frozen `EMPTY` default-ref + `useShallow`; `persist` requires `partialize` + a total `migrate`; DU transitions use `set(next, true)`. Router stays minimal (hand-written code-based tree, no codegen plugin; router-context DI; `beforeLoad` auth; editor dirty-guard is hand-rolled in-app — `useBlocker` can't see pane switches). **TanStack Virtual is KEPT** — sealed with `directDomUpdates: true` + `containerRef` (the shipped Compiler fix; `"use no memo"` is obsolete) + the native chat APIs (`anchorTo:'end'`/`followOnAppend`/`isAtEnd`). Deps: Base UI provides toast + drawer natively (sonner + vaul dropped); `react-resizable-panels` dropped; `tailwind-variants` replaces cva/clsx/tailwind-merge; `lucide-react` in ui; `@dnd-kit` kept (`@dnd-kit/react`); `react-dom` lives at client (ui peer-deps react only). `@orb/ui/diff` seals jsdiff; PWA (`vite-plugin-pwa`) at client; sanitize is Streamdown-native (no DOMPurify); `strip-markdown` for plaintext previews; `macro-textarea` stays hand-rolled + sealed (MiniSearch inside). Compiler: full-compile day one, `reactCompilerPreset` before `react()`, react-hooks lint is the enforcement; the Compiler memoizes components/hooks only — heavy pure kit compute caches itself. Adopt-when (no consumer yet): `react-hotkeys-hook` v5, `es-toolkit`, `react-dropzone`, `react-easy-crop`, `motion`. Gates: `no-static-staletime-on-bus-keys`, `no-inline-cache-surgery-in-stream` (subscription bodies only), `persist-partialize-and-total-migrate`, `form-factory-for-multifield`, `virtualizer-only-in-seal`, the strict Query/hooks eslint presets.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
