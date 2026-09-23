---
kind: adr
status: active
updated: 2026-09-23
---

# on an ENGAGED game chat the rpg Waystone takes the context pane's HEAD BAND via the REGION-CLAIM registry (a HEAD-BAND claim since D150 — the column around it is the shell's context bracket in every room); on everything else chat's own band renders

## Context

Not recorded in the ledger row.

## Decision

The seam: `ContextRegionDef { id, claims, band }` / `defineContextRegion` (`client/src/lib/registry-contracts.ts`), folded into the resolved `header` by `resolveContextTabs`; chat consumes the registry BLIND (`makeChatsSection(regions)`); the ONE claim site in the tree is `features/rpg/lib/rpg-hud-region.tsx`, gated by the same `isGameChat` predicate the tab contributions use (one predicate — band and game rail can never disagree). Enter/exit is machinery-free: commit/disengage invalidates `chat.getChat`, the panel re-resolves. **Guards are gate law** (`context-definition-shape`, 8 checks, probe-checked): no hand-rolled region defs · ONE `defineContextRegion` call site (count check) · shell-chrome classes never painted outside app-shell · ONE `data-context-bracket` writer. **Layout law (§7, computed-value CTs):** viewport `flex-initial`, the ground absorbs residual span, admin rail pinned to the pane foot; chrome ≤30% of the pane; the waystone band <65% of chrome (measured 54.9%, down from F6's 68%). **Compactness is DERIVED, never a prop** — `clock === null` ⇒ the meter's `unset` variant steps down (a `compact` boolean is `no-layout-context-props` RED; `variants.ts` stays the one sizing home). **Voices (AMENDED, tracker variant A owner pick, `0b8814d77`):** BOTH rails speak kicker, and the rail that OWNS the selection prints it as its kicker's suffix ("Game state · Status" / "Chat · This chat"); selection still echoes two-way (surface fill + the owning rail's kicker). The superseded shape — only the admin rail kicker'd, with the band printing an aria-hidden echo line as its last row — was re-ruled because the echo bound 1:2.5 the WRONG way (8px to the medallions above vs 20px to the rail it named, worst case 524px on a chat selection); the second kicker is budget-neutral (347.0→346.0px, CT-pinned). Host-only crown rides the additive `ContextTabDef.crown` field (shaped like `strip`), unchanged. **Rulings taken in-place** (spec amended): locked Map = activatable one-story (no aria-disabled in a claimed pane; the generic panel keeps its treatment); the collapsed `<header>` survives as an `:empty`-collapsed element (rendered-identical to deletion). Deleted with H1 in the same commit: bracket strips, `hasBracket`/`TAB_EDGE_CLASSES`, per-tab headers, the band growth exception.

- **D119a — AMENDED (side-eye review, P1): the vertical budget is a TWO-CASE law, because the single one was unsatisfiable.** The `≤30%` above was measured and CT-pinned on the AMBIENT-UNSET case only (the CT stubbed `ambientLess`); the case a scene-set game actually lands on measures **41.2%** and cannot reach 30% without deleting the composite: at the 30rem × 900 reference the two rails alone cost 116.4px of the 270px ceiling, leaving 153.6px against a set band whose FLOOR was ~159px with zero satellites (18px padding + the 120px focal stone row + 8px + a since-deleted band echo; with the echo gone and both rails carrying kickers, rails ≈137-138px, band floor ≈146px, same conclusion, CT arithmetic updated in `rpg-context-section.ct.tsx`). The only way under is to step the waystone below the size F16 grew it to — the signature element §7.3 exists to protect. **The law: compact case ≤30% (measured 28.7%) · ambient-SET case ≤45% (measured 41.2%) · BOTH cases <50%, the viewport always owns the majority.** Both cases are now computed-value CT-pinned (the set case was the unguarded default). Landed with it (same side-eye lane): the crown glyph inherits its rail's recede (a receded strip's brightest pixel may not be its crown) · a >4-cell rail wraps to rows of three below the `xs` container step (at 320px "Inventory" wanted 48px of caption in a 36px cell) · band satellite ELIGIBILITY is shape-follows-the-datum (ceilinged pool ⇒ `RingGauge` arc, max-less quantity ⇒ `CoinFigure` disc — `max ?? value` was drawing a permanently-full ring, DESIGN §2/§8.1's "lie of shape"). **RATIFIED.**

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
