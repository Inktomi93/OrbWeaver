---
kind: design
status: active
updated: 2026-08-20
---

# Chat visual findings 364–366

## Chosen architecture

### Composer action grid

Keep the four existing named groups and their DOM order: Chat actions, Your message, Their reply, Attach and send (`packages/client/src/features/chat/components/composer-guided-cluster.tsx:143`). Replace both wrapping flex rows with one explicit `actionBar` layout-kit grid. Its wide tracks are `auto auto 1fr auto`. Below the `md` container step it becomes `1fr auto`: Chat actions and Your message own row one, while Their reply and Attach and send own row two. At the `xs` step Their reply spans and centers on row two, and Attach and send owns row three (`packages/ui/src/layout/variants.ts:228`, `packages/client/src/features/chat/components/composer-guided-cluster.tsx:145`).

The narrow arrangement fits the live Your-message pair plus Attach-and-send pair at 320px coarse-pointer geometry while the four-control reply group owns its separate centered row. The conditional impersonation Stop remains a child of the Your message group, so its visual and accessible ownership cannot diverge. The composer action grid is container-driven; viewport size and pointer class remain test inputs, not feature layout selectors.

### Face-filter captions

Use the existing `Text` label voice for every visible interactive run inside a face or overflow Button: character names, the `+N` overflow count, and the overflow tile's “More” caption. `label` resolves to the readable functional-label step while preserving the current truncation classes and the Button's full `aria-label` (`packages/client/src/components/face-strip.tsx:255`, `packages/client/src/components/face-strip.tsx:416`). The pending placeholder uses the same voice so the reserved line box stays byte-for-shape with settled content. The live audit correctly classified `+N` as control text, not a passive datum; hidden off-canvas detection arms are untouched.

### Keyboard focus motion

Remove `transition-colors` from the composer carrier and shared Textarea skin (`packages/client/src/features/chat/components/composer.tsx:385`, `packages/ui/src/primitives/textarea/variants.ts:10`). Keep the existing focus-within ring, ring offset, glow and focused background/border states. Focus becomes immediate in full motion and remains transition-free in reduced motion; no paint property is replaced with decorative motion.

## Rejected alternatives

- **Tune `flex-wrap` gaps or justification.** Rejected because line breaks stay emergent and repeat the 390/320 dead-island defect when Stop appears.
- **Keep Chat actions outside and nest a second guided grid.** Rejected because two independently wrapping grids cannot prove one row order across all four ARIA homes; passing the room action into one grid preserves each semantic group without `display: contents`.
- **Add viewport media queries.** Rejected because feature layout answers to the composer container, not the window.
- **Create a new 11px text token or use `credit`.** Rejected because `label` already names a datum and clears the functional-label floor; `credit` semantically names attribution metadata.
- **Animate opacity/transform on focus.** Rejected because the focus state needs immediacy and the optional motion communicates no additional state.

## Coupled-site inventory

| Shape | Production homes | Behavioral proof |
| - | - | - |
| composer grid tracks | `packages/ui/src/layout/variants.ts`; `packages/client/src/features/chat/components/composer.tsx`; `packages/client/src/features/chat/components/composer-guided-cluster.tsx` | `tests/client/features/chat/components/composer.ct.tsx`; `tests/ui/layout/grid.ct.tsx` |
| face caption voice | `packages/client/src/components/face-strip.tsx`; consumer posture `packages/client/src/features/chat/surfaces/chat-list-surface.tsx` | `tests/client/components/face-strip.ct.tsx`; `tests/client/features/chat/surfaces/chat-list-surface.ct.tsx` |
| focus paint | `packages/client/src/features/chat/components/composer.tsx`; `packages/ui/src/primitives/textarea/variants.ts` | `tests/client/features/chat/components/composer.ct.tsx`; `tests/ui/primitives/textarea/textarea.ct.tsx` |

No export, dependency, registry, contract, persistence, or server ownership changes are required.

## Red-first and planted controls

1. Extend composer CT geometry to desktop plus real coarse-pointer 430/390/320 arms. Assert the four named groups, row assignment, 44px floor, owned hit centers with `elementFromPoint`, no overlaps, and no composer/document overflow. Drive static and live impersonation so Stop is proved inside Your message.
2. Add a full-motion keyboard focus CT that rejects non-zero-duration `all`, color, background-color, border-color and outline-color transitions on the composer carrier and textarea, while asserting the focus-within box shadow is present immediately. Repeat under reduced motion as the truth control.
3. Add face-caption and overflow-count CTs reading the whole computed font size and requiring at least 11px, while retaining the existing truncation and full-accessible-name assertions.
4. Add layout-kit CT assertions for both new grid track shapes so a variant that fails to emit cannot green-wash the feature test.

The old source must fail the explicit grid-row/430 hit ownership assertions, the face-caption font floor, and the full-motion paint-transition assertion before production edits land.

## Rendered proof matrix

Drive the affected composer and chat-list surfaces on private ports/database only:

- appearance presets: defaults, maximal, compact, reading, diagnostics;
- desktop/mobile × OS light/dark × full/reduced motion;
- 430/390/320 real coarse-pointer composer widths plus desktop fine pointer;
- Light/none, list/content/context focus-pane arms;
- empty, populated, long-name/truncated face lists;
- enabled, disabled-with-tooltip, keyboard focus, static, streaming, Stopping and impersonation-Stop states;
- contrast, 44px targets, `elementFromPoint` ownership, horizontal overflow, transition properties and representative screenshots.

Artifact stems and per-arm results are recorded in the final lane report. No whole-tree battery or shared stage is used.
