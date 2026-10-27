---
kind: bug
status: doing
updated: 2026-10-27
priority: P2
area: client
lane: composer_two_rows
---

# Keep plugin row controls inside narrow hosts

## What

Make the shared plugin row renderer reflow whole controls within the available host width. Card Atlas currently requires horizontal scrolling to reach the full SFW switch on a phone.

## Why

At 390px, the switch spans x366–430 while its nested scroll host is 390px wide. The closed guest row contract exposes no wrapping option; a root overflow PASS does not prove child control containment.

## Done when

Preserve the existing SDK, grants, always-visible filter controls and coarse touch floors. Qualify the production Atlas row in portrait, landscape and narrow desktop containers, plus pager/action-row positive cases. Use existing primitives; do not add Atlas CSS or change the global Row default.

## Case map

Rendered owner: `tests/client/features/plugin/components/platform-plugin-presentation.suite.ct.tsx`.

| Behavior | Layer | Existing coverage | Decision |
| - | - | - | - |
| Atlas filters and whole controls at constrained widths | CT | No maintained Atlas geometry case | Add production Extensions mount with the installed Atlas guest. |
| Pager, text and action rows | CT | Atlas guest integration covers provider parsing, not host layout | Add rendered Atlas pager and detail-action positive controls using scripted remote HTTP. |

Execution remains pending. These are audit regressions, not wholesale legacy restoration.

## Evidence

Filled at landing: what ran and where its output is.
