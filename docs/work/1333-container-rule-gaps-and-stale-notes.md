---
kind: work
status: doing
updated: 2026-10-25
priority: P3
area: client
lane: closeout/css
---

# Container rule gaps and stale notes from the 1319 review

## What

- `orb/surface-consumes-container` passes `<PickerDialog bodyProps={{ container: true }} />` in a surface.
- `orb/anchor-provides-container` passes an anchor rendering only `<Section container={false}>` (`CONTAINMENT_OWNER` in `tooling/src/eslint/ui-feature-policy.ts` matches any `container` attribute).
- `orb/no-raw-container-in-features` passes `style={{ container: "x / inline-size" }}` and false-positives on `aria-label="@container"`.
- Stale comments: `features/discovery/components/corpus-understanding-invitation.tsx:76` and `features/discovery/surfaces/corpus-home-surface.tsx:216-217` describe the surface's own container.
- Four anchors render from inside the surface they contain (home, persona panel, extensions page, chat room flank), against law §4's "anchor wraps the surface".
- Five dropped containers sat inside a scroller, so their queries now resolve outside it and may flip one scrollbar gutter earlier (preset editor, corpus home, labels library, tag member, refinery content).

## Done when

The rule gaps have planted controls and fixes; the comments match the code; the anchor placement either moves outside the surface or the law records the inside-surface form with its reason; a headed check at a classic-scrollbar width just above each breakpoint confirms or refutes the gutter shift.

## Evidence

The existing container-ownership controls cover shorthand style declarations, prose attributes, bodyProps and false containment props. The rule homes are `tooling/src/eslint/ui-feature-policy.ts` and `tooling/src/eslint/ui-policy.ts`.
The discovery comments name the content region's container. UI-Architecture-and-Layout §4 records the reasoned inside-surface anchor form.

Headed Chromium at the committed CSS source measures a native 10px gutter. Corpus home and refinery queries cross at the outer owner's threshold before scroll-content width; their measured targets fit.
Preset and tag editors retain inner query owners: their wide column cap starts only when the inner width clears the threshold. The populated Labels library has no active query consumer, confirmed by the DOM census and source/variant cross-check.
[CSS closeout](../reviews/css-closeout.md#classic-scrollbar-boundaries) records exact widths, branches, native outcomes, the corrected interaction-readiness probe and platform limits.
