---
kind: history
status: archived
updated: 2026-08-20
---

# Composer action anatomy (#206) — superseded record

> Archived pre-grid design record. [`chat-visual-findings-364-366.md`](chat-visual-findings-364-366.md) supersedes its wrapping-row and three-group layout; current source and CT remain the behavior's one home.

## Superseded decision

The composer owns one wrapping action row. Its chat-options singleton remains first, followed by one width-owning action cluster containing three atomic semantic groups in this order: `Your message`, `Their reply`, `Attach and send`. `Their reply` also owns the size-gated speaker picker; `Attach and send` owns the utility trigger and the single Send/Stop slot. The textarea follows the action row and remains the only control in the input row.

The conditional `Stop drafting your line` control is a second member of `Your message`, immediately after `Draft your line`. It stops a stream that is writing the user's draft, so neither `Their reply` nor `Attach and send` is truthful ownership. It never becomes a fourth group or a direct cluster child. Its appearance may widen the atomic `Your message` island and cause that whole island to reflow; the group itself must not split.

The outer action row and the cluster both participate in reflow. The outer row may wrap the chat-options singleton away from the message-action cluster. The cluster must accept the remaining width (`min-width:0`, flex growth, no `shrink-0`) and wrap only between semantic groups. Each group stays an unbroken flex island, preserving adjacency between controls that share a meaning. Inter-group spacing uses the `section` intent token; intra-group spacing uses `field`, so hierarchy is measurable without raw values.

The cluster remains the state/action orchestrator. Its utility-menu adapter belongs in `composer-utility-menu.tsx` beside the menu contract it adapts; keeping that adapter in the cluster made the candidate 492 lines before this repair and violated the 450-line component boundary. This extraction changes no behavior or dependency direction: the cluster passes its already-resolved action bundles down, and the utility module renders them.

This is capability-independent layout. Pointer sizing stays in the existing generated control tokens: coarse icon controls resolve to 48px and therefore clear the 44px floor; fine pointers retain the desktop scale (`packages/ui/src/styles/theme.css:86-88`, `packages/ui/src/styles/theme.css:183-188`). Feature code adds no pointer media query and never shrinks, hides, or duplicates a control.

## Resolved candidate defect

The candidate constrains the wrong element. `composer-guided-cluster` has `flex-wrap` but also `shrink-0` (`packages/client/src/features/chat/components/composer-guided-cluster.tsx:126`), while its parent is a non-wrapping `justify-between` row and inserts another wrapper (`packages/client/src/features/chat/components/composer.tsx:393-420`). At a coarse pointer, the token layer enlarges each icon, but the cluster keeps its max-content width; wrapping inside an unconstrained shrink-proof child cannot contain the outer row.

The candidate also leaves the speaker picker in a second group named `Choose the next speaker` (`packages/client/src/features/chat/components/composer.tsx:422-426`) even though it is a reply action. That creates a fourth semantic home and makes the `Their reply` group incomplete.

The committed mobile CT does not exercise the governed capability. It sets only viewport and reduced-motion media (`tests/client/features/chat/components/composer.ct.tsx:185-188`), so Chromium keeps a fine pointer and 34px icon controls. Its containment check therefore cannot detect the coarse 48px width tax described by UI law (`docs/architecture/core/UI-Gates-and-Lessons.md:58`; `docs/architecture/core/UI-Architecture-and-Layout.md:347`).

## Rejected alternatives

1. **Shrink icons on mobile.** Rejected: D62 P1 requires the coarse 44px floor, and the task explicitly forbids squeezing touch targets.
2. **Wrap only the existing inner cluster.** Rejected: this is the failed candidate; without width ownership, `flex-wrap` has no useful constraint.
3. **Hide lower-priority actions or put them in a mobile-only menu.** Rejected: the owner requires all actions visible and one composition across pointer classes.
4. **Render a second mobile action rail.** Rejected: duplicate controls would split semantics and function ownership, including the terminal Send/Stop slot.
5. **Flatten every button into one freely wrapping row.** Rejected: it can interleave semantic categories across line breaks and erases the required intra-group cohesion.
6. **Leave the conditional drafting Stop as an ungrouped cluster child.** Rejected: conditional presence does not suspend semantic ownership, and an ungrouped ninth control makes the live state less truthful than the static state.

## Coupled sites

| Site | Obligation |
| - | - |
| `packages/client/src/features/chat/components/composer.tsx` | Own the outer wrapping row, remove the width-stealing wrapper, pass speaker and terminal slots once, keep textarea order/function. |
| `packages/client/src/features/chat/components/composer-guided-cluster.tsx` | Own the three semantic groups, accept width, wrap between groups, keep group order and spacing hierarchy. |
| `packages/client/src/features/chat/components/composer-send-control.tsx` | Keep Send/Stop single-homed and tooltip-named. |
| `packages/client/src/features/chat/components/composer-utility-menu.tsx` | Keep the attach/tools trigger single-homed and tooltip-named; own the utility-menu adapter so the cluster remains below the component-size boundary. |
| `packages/client/src/lib/injection-copy.ts` | Keep shared disabled reasons and guided cues in one copy home, using the owner-ruled product vocabulary everywhere they surface. |
| `packages/client/src/features/chat/components/speak-as-select.tsx` | Keep the speaker control's behavior while its nearest semantic owner moves to `Their reply`. |
| `packages/client/src/features/chat/components/chat-options-menu.tsx` | Keep chat options single-homed with plain-language tooltip copy. |
| `packages/client/src/components/row-actions-menu.tsx` | Preserve the shared optional tooltip wrapper used by chat options. |
| `tests/client/features/chat/components/composer.ct.tsx` | Prove semantics, names, focus, order, spacing, real coarse sizing, containment, overflow, and non-overlap. |

No token, primitive, import-path, wire, store, or server contract changes. No owner-language fork remains: issue #206 fixes the product-voice names and the repair brief fixes the group names/order.

## Test plan

Red-first on candidate `0ed8be7ad`:

- Mount a two-character composer so all eight icon actions exist.
- Assert each action's nearest named group and the single `Your message` / `Their reply` / `Attach and send` homes. This reds because the speaker picker is outside `Their reply`.
- Create a `hasTouch:true` Playwright context, assert `(pointer:coarse)` true and `(pointer:fine)` false as the planted media control, then assert every icon control is at least 44px.
- At 390×844 and 320×720, assert every visible composer button/textbox is inside both composer and viewport, no pair intersects, composer/document have no horizontal overflow, and visual order is row-major. The candidate reds on the 390px right edge.

Graduation on the repaired source:

- Desktop: exact action order, all plain-language accessible names/tooltips, disabled reason-bearing action remains focusable, group order, and `section > field` computed spacing.
- Coarse mobile at both widths, before and during a drafting stream: the planted pointer control, ≥44px target floor, containment, pairwise non-overlap, no horizontal overflow, row-major order, one terminal Send/Stop slot, no static/duplicate drafting Stop, and the same semantic ownership. While live, the ninth control's nearest group is exactly `Your message`; activating it retires the control and preserves the partial draft.
- Full `tests/client/features/chat/components/composer.ct.tsx`, all three type programs, touched-file Biome/ESLint, structural consumer sweep in TS and TSX, and `git diff --check`.
