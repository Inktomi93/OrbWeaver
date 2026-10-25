---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: client
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

`tests/tooling/eslint-container-ownership.test.ts` gained controls for each gap; the shorthand, aria-label and bodyProps controls failed before the selector changes and all 42 tests pass after. `tooling/src/eslint/ui-feature-policy.ts`: `container={false}` no longer counts as declaring or providing containment, and `bodyProps={{ container }}` is refused in a surface. `tooling/src/eslint/ui-policy.ts`: the `container:` shorthand is refused in a `style` prop or with a string value, and prose attributes (`aria-label`) are not scanned. Both discovery comments now name the content region's container. The four anchors that render inside their surface stay there; `docs/law/UI-Architecture-and-Layout.md` §4 records the form and its reason (the surface owns a scroller inset, popup or page box the container must measure inside), because moving them changes the width each query reads, which is the open scrollbar-gutter question. The headed gutter check is not run here. Whole `pnpm lint:eslint` over client and ui: 402 errors, none from these rules. Rule cost under `TIMING=all`: `no-raw-container-in-features` 1.8 ms, `surface-consumes-container` 0.1 ms, `anchor-provides-container` 0.04 ms.
