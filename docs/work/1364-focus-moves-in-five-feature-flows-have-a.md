---
kind: work
status: doing
updated: 2026-10-25
priority: P3
area: client
lane: closeout/rendered
plan: test-foundation
---

# Focus moves in five feature flows have a CT

## What

The DOM-lock rewrite moved focus to refs in flows that no CT pins: greeting remove, plugin hide (focus now lands on the shell main region, not the chat room surface), tag apply, connection fact-row focus and the refinery landing search (mount refinerySection through useSectionRegistry, serve character.list, call requestRefineryLandingFocus). The InlineFlankFitProbe sentinel width is unmeasured; it is reachable only in the full chat room. Model picker centring with a picked id in both Recent and its group is unpinned.

## Why

Each rewrite changed which code finds the focus target; without a CT a wrong target or an accessible-name change ships silently.

## Done when

Each flow has a CT through the real door that goes red on a planted wrong target; the plugin-hide target is ruled and recorded; the sentinel width is measured in an e2e or CT.

## Evidence

| Behavior | Maintained CT |
| - | - |
| Removing an alternate returns focus to Add opening. | [Greeting focus](../../tests/client/features/character/components/greeting-focus.ct.tsx) |
| Hiding the final plugin panel returns focus to the shell Chats main region, the cross-pane address owned by the shell. | [Plugin hide focus](../../tests/client/features/plugin/components/hide-focus.ct.tsx) |
| Applying a suggestion follows real mutation readback to the next Apply or the empty inbox. | [Suggestion focus](../../tests/client/features/tag/surfaces/suggestion-focus.ct.tsx) |
| A saved or reset fact override returns focus to its fact row. | [Connection editor](../../tests/client/features/credentials/components/connection-prompt-cache.ct.tsx) |
| A landing request focuses the refinery search mounted through the real section registry. | [Refinery landing focus](../../tests/client/features/refinery/components/landing-focus.ct.tsx) |
| Recent contains the selected model once and clamps at the list start; an interior provider-group selection is centred. | [Model position](../../tests/client/features/credentials/components/model-recent-focus.ct.tsx) |
| The room sentinel equals the resolved reading floor, sidebar width and gap. | [Room measurement](../../tests/client/features/chat/components/members-focus.ct.tsx) |

The model picker already excludes Recent ids from provider groups. No duplicate-centering mechanism is added. The external catalog fixture supplies a complete rendered group and chooses its midpoint; the interior case checks scroll room at both ends. The Recent row's unconstrained negative scroll target correctly clamps to zero.

Wrong production focus targets fail the corresponding cases. Duplicate Recent rows, disabled centring and a wrong sentinel gap also fail their assertions. [Rendered closeout](../reviews/rendered-closeout.md) records commands, retained artifacts and the final verification status.
