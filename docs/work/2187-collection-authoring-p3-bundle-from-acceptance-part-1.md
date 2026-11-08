---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: client
lane: wt/agent-a53049a5655c3c496
plan: cross-surface-consistency
---

# Collection authoring P3 bundle from acceptance part 1

## What

Databank with an empty library renders a second empty state in Content with misleading copy. The Presets phone tab strip has no overflow cue when the reveal scrolls Params out. Regex insights show two identical Open Clean HTML doors. Short-landscape collection landings push the first row far down. The Characters shelf meta wraps at its separator. The Presets list Default name is misaligned by its lock glyph.

## Why

Each breaks the collection family's shared composition found in acceptance.

## Done when

Each finding is fixed with a capture, or answered with a cited reason in this item's Evidence. Source: acceptance part 1 report.

## Evidence

- Databank empty library: with the list on screen, CONTENT holds a heading and a note and the list keeps the one empty state with its Add door. With the list off screen, CONTENT is the one empty state. CT `tests/client/features/databank/surfaces/databank-empty-landing.ct.tsx`.
- Presets phone tab strip: answered by measurement. After the reveal scrolls the strip, its Row carries `data-fade-start` and a start-edge mask stop, and the first tab is cut at the edge under that fade. At rest it carries neither. The shared scroll fade owns the cue (`.scroll-fade-x`), so a stronger cue is a change to every scroll fade and is not part of this item. CT `tests/client/features/preset/components/platform-preset-strip-cue.suite.ct.tsx` locks the transition.
- Regex insights: a door renders once per member in `config-collection-landing.tsx`. `CollectionInsight.open` carries the member id, so two facts about one member draw one door and two members that share a name keep a door each. Asserted in `platform-collection-composition.suite.ct.tsx`, including two unnamed regex scripts whose doors both read `Open Unnamed script`.
- Short-landscape landings: `Stack` takes `order="lastWhenShort"` and the landing sets it, so the first row sits above the insights and inside the viewport. Asserted at 844 by 390 and at desktop in the same suite.
- Characters shelf: `chattedStamp` joins the separator and the count with no-break spaces, so a wrapped stamp never ends on the dot. CT `tests/client/features/character/components/shelf-stamp-wrap.ct.tsx` reads painted lines in the real landing.
- Presets Default name: the lock moved from the leading slot to `subtitleLead`, so every row name starts on one x. Asserted in `platform-preset-strip-cue.suite.ct.tsx`.

Each CT fails on the prior source, except the tab strip guard, which pins a working cue.
