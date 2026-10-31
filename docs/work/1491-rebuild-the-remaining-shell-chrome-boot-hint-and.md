---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: client
plan: restoration-register
---

# Rebuild the remaining shell chrome, boot-hint and chrome-assembly reference cases

## What

The flow-walking close-out left three register rows Partial with named cases:

- Topbar, rail, You sheet and boot veil: the boot veil cases, the mobile bar's waiting-count badge, label ramp, label fit and current-section tab, the rail's single Home affordance, and the `rail.end` widget sheet and modal row.
- Appearance root and boot hint: the server answer replayed on the next boot, a corrupt hint healing to the floors, boot-theme names accepted only from generated seed palettes, and the pre-paint read keeping the other axes.
- Chrome assembly: rail entries, `rail.end`, the `topbar.trail` modal entry, unmapped placements, order and curation, widget identity and the `(order, id)` ordering.

Also make the cold corpus boot check permanent: a corpus e2e case that the first navigation finishes with no failed or refused request, with a control that aborts one stylesheet.

## Why

The register rows stay Partial until each named case has a decision, and the cold-boot row rests on one unmaintained observation.

## Done when

Each named case is rebuilt through production with a planted-defect red, moved, or dropped with a reason. The three register rows read Accounted for. The cold-boot case passes and its control fails.

## Evidence

Decisions are in the [shell chrome case map](../plans/test-foundation/design.md#shell-chrome-boot-hint-and-chrome-assembly). Each rebuilt case failed under a planted production defect and passed restored.

| Case | Test | Planted defect that failed it |
| - | - | - |
| Boot veil | `tests/client/features/app-shell/components/boot-veil.ct.tsx` | the floor set to zero (fails the minimum-beat case, which reads the veil's own ending stamp once after five frames); the ready latch forced off; the ready test narrowed to an empty value; the reduced-motion exemption in `floorHeld` removed (fails the reduced-motion case, which stamps ready straight after mount and checks the absence once after five frames). Removing only the effect guard changes nothing, because `floorHeld` already exempts reduced motion |
| Boot hint | `tests/client/state/appearance-boot-hint.ct.tsx` | the seed guard cast away; the theme write made a replace; the axes write removed; the stored shape parsed unchecked |
| Mobile bar and Home | `tests/client/features/app-shell/surfaces/mobile-bar.ct.tsx` | the label voice set to micro; the label tripled; the displaced-tab swap removed; the badge removed; the section zone ignored |
| Chrome assembly | `tests/client/state/assemble-chrome.dom.test.ts` | the section order zeroed; trigger order ignored; widgets copied; an extra placement mapped; the id tie break removed |
| Cold boot | `tests/e2e/corpus-cold-boot.spec.ts` | the control aborts a stylesheet and the watch names it |

Findings: no modal ships on `rail.end`, so that arm of the placement map has no shipped subject. The boot hint store's in-memory state carries the full appearance defaults, not only its declared axes; the persisted blob is pruned by `partialize`.

Runs: `pnpm test:ct` over the three CT files, `pnpm test` over the assembly test, and the e2e command recorded in the report.
