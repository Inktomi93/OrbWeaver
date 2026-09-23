---
kind: adr
status: active
updated: 2026-09-23
---

# Shell clusters are registries

## Context

Not recorded in the ledger row.

## Decision

**Clusters are registries; the frame's own grammar is intrinsic.** Every global affordance in the shell frame is a `ChromeEntry` in ONE registry — zones as data (`CHROME_ZONES`: currently rail.nav · rail.end · topbar.trail — the tuple is the truth, not this list), entries derived (sections from `SectionDefinition.rail`, modals from `ModalDefinition.trigger` placements, widgets from co-located `features/<owner>/lib/<id>-chrome.tsx`), assembled ONCE at the door by the pure `state/assemble-chrome.ts` (dupe/zone/order algebra has ONE home there — consumers filter by zone and trust the order). The rail/topbar/You-sheet are blind views over the same resolved list; the You sheet is a PROJECTION, never a second derivation. The crisp line: clusters are registries, but the frame's own panel grammar (list/detail toggles positionally bound to their panels) stays intrinsic — never registry-fed. The shell accepts ZERO ReactNode chrome props (the shell has no `AppShellProps`; `railFoot`/`topbarTrail` do not exist). Modal-trigger placements align with chrome zones (`rail.end`/`topbar.trail`/`mobile-tab`/`surface`). Enforcers: `chrome-registry-completeness` · `no-parallel-section-map` (the `chrome arm`) · `modal-registry-completeness` (the `surface-reachability arm`).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
