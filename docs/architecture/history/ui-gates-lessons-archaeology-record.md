---
kind: history
status: active
updated: 2026-07-13
---

# UI Gates & Lessons — Archaeology Record

> **Frozen 2026-07-13, extracted from `core/UI-Gates-and-Lessons.md`.** The war stories behind that
> doc's standing rulings — the neo-client audit (D43) provenance, the per-footgun bug narratives, the
> gate build/realization diaries, and the 2026-06 stack re-verification write-up. The LAW those stories
> produced lives (condensed to one-line rulings) in the core doc; this is the "why we believed it"
> record. Nothing here is enforceable; do not cite it as law. Live enforcement state is
> `core/Core-Enforcement-Active-Gates.md` + `core/Core-Enforcement-Deferred-Dropped.md`.

## The neo-client audit — provenance (ledger D43)

Ten agents read every file in neo's client (\~51k LOC) against a shared
KEEP / DUMP / IMPLICIT-CONVENTION / CROSS-LIB-FOOTGUN / ENFORCEABLE-RULE contract. The ratified
synthesis became `UI-Gates-and-Lessons.md` §11; D43 is the decision record. The findings converged
across independent slices — which is what made them load-bearing rather than slice-local.

## Why neo rotted *despite* being structured + enforced (the three root causes)

neo had feature-slices, dep-cruiser, a token system, and \~104 gated queryKeys — and still became a
mess. It rotted in exactly three seams; orbweaver closes all three by construction (the three standing
rulings are D43 (1)/(2)/(3) and `UI-Gates-and-Lessons.md` §11.0).

1. **Exemption zones become rot zones.** Two directories were carved OUT of the rules
   (`features/_shared/` from `client-no-cross-feature`; `components/ui/` from the token gates). Every
   documented production bug, every raw style value, and the entire cross-feature-coupling mess lived
   in those two exempt zones.
2. **Consumer-obligation footguns leak as comments and rot; library-owned ones don't.** The four
   footguns that required the CALL SITE to remember something (`reset(value)`-after-submit, silent
   `setValue`, `onFieldUnmount` flush, `key={entityId}` remount) leaked as prose, and only one of four
   editors honored all of them — forgetting `reset(value)` silently bricks the save bar with a green
   `check`.
3. **The cross-feature CONTRACT was unrecognized, so coupling pooled.** neo conflated "imports another
   feature's React module" with "couples to another feature," so a legit cross-feature READ (calling
   `trpc.worldInfo.*`) had no legal home and got dumped in `_shared/`. \~29 of neo's 66 `_shared` files
   evaporate as a category once the tRPC router is recognized as the cross-feature contract.

## The container model was a near-zero-cost FREEZE, not an unwind (the audit's happy surprise)

The plan assumed unwinding neo's `compact`/`inDrawer`/`density` threading. It didn't exist in the hot
paths: chat had 0 occurrences and 0 `@media`/`@container`; the macro shell needed 0 `@media`; total
viewport-responsive sites client-wide: \~6. So `no-media-queries-in-features` + `no-layout-context-props`
were a freeze at \~6 sites' cost. This produced the standing correction to D42 §4 (features MAY use
`@container`; only the SHELL tier may use viewport `@media`) — now `UI-Gates-and-Lessons.md` §11.2.

## Per-footgun and per-primitive war stories

- **Virtual × React Compiler.** `useVirtualizer`'s return is internally mutable; the Compiler memo pass
  could flash the list. The interior-mutability issue was real but the fix shipped and is
  Compiler-E2E-tested (`directDomUpdates: true` + `containerRef`, TanStack Virtual 3.14+); the
  streaming-chat cluster went native in core 3.16. `"use no memo"` is obsolete. The mid-2026 "virtua
  swap" idea rested on two now-refuted premises — TanStack Virtual is KEPT (D54), sealed because of the
  chat cluster + dep-cruiser ban + tripwire, not because the lib is "broken."
- **The chat surface neo hand-rolled.** The streaming-chat cluster (`anchorTo:'end'`, `followOnAppend`,
  `isAtEnd` stick-to-bottom-without-yank · id-keyed `getItemKey` for the ghost→canonical swap) was a
  387-line surface in neo; native since core 3.16 and owned by `@orb/ui/message-list`.
- **PD-119 (keep-mounted).** The `message-list` seal was doc-claimed to own a no-recycle path for
  stateful/Tier-B rows, but the built seal was pure windowed virtualization — a `sandbox-frame` iframe
  reloaded on scroll-back and an edit-in-place textarea dropped local state (neo's virtualizer footgun
  \#3). Shipped DONE 2026-07-09 as the `keepMounted?: (item: T) => boolean` predicate (matched items'
  indices forced into the rendered range via a composed `rangeExtractor`). Full record:
  `Core-Debt-Cleared-Ledger.md` PD-119.
- **ChatHandle.** neo killed the URL-coupled `this_chid` but resurrected the disease as an ambient
  `isOptimistic` boolean read in 15+ sites. The discriminated `{kind:"committed"} | {kind:"draft"}`
  handle makes forgetting the branch a compile error.
- **The invalidation sprawl.** queryKeys were solved (100% tRPC-derived) but invalidation was the real
  sprawl: neo had 81 `invalidateQueries` across 40 files, no map, several arg-less. Sealed to one
  `client/data/invalidation.ts` event→`queryFilter()` map.
- **`CustomOpenAiMetadata` had THREE homes** because neo had no contracts layer and re-declared wire
  schemas client-side. `@orb/contracts` + the frontend cake make this physics.
- **Charts.** ECharts renders to Canvas, so `var(--token)` does NOT resolve as it did in nivo's SVG —
  the seal resolves DTCG tokens to concrete values (`getComputedStyle`) and re-reads on theme switch.
  neo's voluntary `theme=` prop shipped an invisible white-on-transparent chart, which is why the seal
  injects the token theme internally. nivo dropped at D52 (stuck at v0.99 — the dead-lib risk this
  architecture exists to avoid; the client had zero charts written, so pre-committing was free).

## The zustand-selector gate realization (task #51, 2026-07-05)

`§11.5`'s "extend the selector gate to ALL keyed stores" ask was not wholly unwritten:
`tools/grit/zustand-selector-stability.grit` (Layer 2) already caught the narrow
"arrow concise-body IS `({...})`/`[...]`" shape and was LIVE. Task #51 discharged the rest with the
Layer-3 structural gate `zustand-selector-derived.ts`, adding full-body reasoning (block `return`s,
`?:`/`??`/`||`/`&&` branches, `Object.keys/values/entries`, array-rebuilding `.map/.filter/…`) and the
second call shape (`useStore(store, selector)`) a Grit AST pattern can't express. Both layers stay live
— the grit is the fast narrow belt, the structural gate is the comprehensive one.

## Streamdown two-policy — build diary + API correction

The audit confirmed D21's threat surface is chat-only: character-card fields render as escaped text; the
only untrusted-markdown render is chat's message body. Streamdown runs `rehype-sanitize` +
`rehype-harden` by default, but that default is deliberately permissive — suitable only for content the
box owner authored. The `@orb/ui/markdown` seam exposes two trust policies (built in
`packages/ui/src/markdown/policy.ts`). Governing posture (D44 §12.0, corrected 2026-07-05 #25):
UNTRUSTED BY DEFAULT — "trusted" names the permissive POLICY, not a default; the model is untrusted
(indirect prompt-injection can make it emit exfil-shaped markup — Claude-Artifacts treats its own
model's HTML the same way).

API correction recorded at build (the docs-assumed knobs do not exist): Streamdown 2.5's real security
surface is `allowedElements`/`disallowedElements` + `urlTransform` — NOT
`allowedLinkPrefixes`/`allowedImagePrefixes`/`allowDataImages`. And `img` must be dropped at the element
level for untrusted content: verified 2026-07-02, Streamdown emits a `<link rel="preload" as="image">`
that `urlTransform` does NOT intercept — an untrusted external image would prefetch to the source (the
exact D21 tracking-pixel exfil) even with the url gate. This is why the load-bearing warning survives in
the core doc. The Phase-6 chat wiring (per-message trust selection + `MessageMedia`/`SandboxFrame`
dispatch) LANDED #25.

## Stack-currency verification (2026-06 — the load-bearing bets re-checked)

- **Base UI** — `@base-ui/react` 1.x stable (1.0 shipped 2025-12; MUI-backed). The rc-era
  `@base-ui-components/react` name is dead and biome-banned.
- **React Compiler × TanStack Virtual** — corrected at D54 (see the Virtual war story above).
- **React 19.2 `<Activity>` + `useEffectEvent`** — both stable (Oct 2025).
- **DTCG + Style Dictionary + Tailwind v4 `@theme`** — DTCG first stable spec 2025-10; Style Dictionary
  v5 (a recorded delta from the doc-era v4) has first-class DTCG support.
- **Streamdown** — real + security-first by default (bundles sanitize+harden), but needed the two-policy
  config + the API correction above.
- **Charts** — Apache ECharts, nivo dropped (D52). ECharts is the only single mainstream lib natively
  covering the corpus set — bar · line · heatmap · calendar heatmap · scatter · force-directed network
  — which eliminated Recharts (renders neither hard one) and visx (hand-build). One dep replaced 6
  `@nivo/*` packages; Canvas-rendered. Fallback if the similarity graph outgrows the force layout: split
  that one chart to a WebGL lib behind the same seal.

## §8 gate-status snapshots (2026-07-05 / -07-09) — superseded by the live registry

The core doc's §8 formerly maintained a LIVE / PARKED / DORMANT / REALIZED / PLANNED per-gate status
board. It drifted (PARKED/PLANNED gates landed without the board being updated; the DORMANT list went
stale) and duplicated the gated registry (`enforcement-registry-parity.ts`). It was collapsed
2026-07-13 into a terse concept index pointing at `Core-Enforcement-Active-Gates.md`. The snapshot at
freeze, for archaeology only:

- Gates that had LANDED but were still listed PARKED/PLANNED: `no-arbitrary-tw-values`,
  `no-raw-interactive-intrinsics`, `empty-state-has-action`, `form-factory-for-multifield`,
  `no-media-queries-in-features`, `no-raw-container-widths`.
- Stale DORMANT list: the doc listed `surface-in-a-container` · `component-size-ui` ·
  `test-presence-client`; the actual dormant-UI set had narrowed to `component-size-ui` only.
- A phantom physics rule: §8 claimed a dep-cruiser rule `client-no-raw-satellites`. There is no such
  rule — "client ⇏ raw satellite libs" is RESOLVER physics (a deliberate non-rule, annotated as such in
  `.dependency-cruiser.cjs`).
- Still genuinely awaiting enforcement at freeze: the ARIA-tree goldens + screenshot goldens (blocked on
  a CI browser lane that `ci.yml` does not yet have) and the CT state-coverage extension.
