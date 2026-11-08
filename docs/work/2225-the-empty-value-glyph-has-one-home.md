---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: client
lane: wt/agent-a53049a5655c3c496
plan: cross-surface-consistency
---

# The empty-value glyph has one home

## What

Stats, rpg, discovery, preset, refinery and chat each spell their own lone em dash for a missing value (for example analytics-view-model.ts, unset-datum.ts, format-count.ts, payload-view\.tsx, swipe-strip.tsx). Give the no-value glyph one home in kit or ui and read it from every site, with its accessible name.

## Why

One home per concept: a second copy of the placeholder drifts, and a screen reader hears a bare dash at each site.

## Done when

Every no-value placeholder reads the one constant, no feature spells the glyph itself, and the tests that read a placeholder import it.

## Evidence

`NO_VALUE` and `NO_VALUE_NAME` live in `@orb/kit/strings`, beside the USD formatter that already used the glyph. `NoValue` in `@orb/ui/text` renders the glyph under that name, and `StatFigure` renders it for a value equal to `NO_VALUE`, so every Insights figure carries the name.

Moved by codemod: the nine `UNSET_DATUM` readers through `move-import-names`, and the lone-dash literals in the stats overview, rhythm figures and assembly diagnostics through `literal-to-binding`. Each dry run listed exactly the files an independent `rg` listed, and a rerun changed nothing. By hand: the local constants in the stats view model, payload view, regex tier row and preset format-count, and the JSX sites in payload view and the compare tab, which render `NoValue`. The swipe counters read the constant, because their text is hidden from assistive technology beside a separate spoken count.

`packages/client/src/features/rpg/lib/unset-datum.ts` is gone. Tests that read a placeholder import the constant. CT `tests/ui/charts/stat-figure/no-value.ct.tsx` fails without the mapping.

Every accessible-name sink reads the name. The NPC mood button names itself `<name> mood: No value` when no mood is written (asserted in `tests/client/features/rpg/components/own-key-panels.ct.tsx`). `spokenText` in `@orb/kit/strings` says each glyph in a string by its name, and the chart text table builders apply it to every cell, so BarList, Histogram and Heatmap tables read `No value` (`tests/ui/charts/stat-figure/no-value.ct.tsx`). `shownValue` in `@orb/ui/text` renders a formatter's glyph as `NoValue`, and the stats list row, persona row and model rows use it for the nullable token, cost, time and throughput formatters. `StatFigure` reads the same helper.

Left as text: the clock reading `21:—` in the RPG takeover header, which is one datum inside a joined line of visible text. The tracker rest buttons and meter datums show the glyph under an `aria-label` that names the control, and the swipe counters keep their separate spoken count.

Kept as developer diagnostics: the lone dash in `trpc-devlog.ts` and `bus-devlog.ts`, which only reach the console.
