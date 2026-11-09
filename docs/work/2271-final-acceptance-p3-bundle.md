---
kind: work
status: doing
updated: 2026-11-09
priority: P3
area: client
lane: wt/agent-a29d5d507070ebb1d
plan: cross-surface-consistency
---

# Final acceptance P3 bundle

## What

Part A: the More below cue sits inside the row it announces in cramped cells; the member card viewer title shrinks at 390 and 300%; the Tags skip link reads Skip to labels and the Settings skip link is squashed with a clipped ring; a character greeting note has no prose cap; settings section intros mix two type steps; and the rest listed in the part A report. Part B: below cq-16 the avatar reach covers the bubble start; coarse short landscape avatar reach is under the floor with no CT cell; the Characters editor prose has no cap; the pinned plate stacks on the sticky header; the phone anchored toolbar sits at x4 with a jargon gloss; target deleted is screen-reader only.

## Why

Each breaks a family's shared composition found in final acceptance.

## Done when

Each finding is fixed with a capture, or answered with a cited reason in this item's Evidence. Source: acceptance part 4 reports A and B.

## Evidence

### Part B (lane wt/agent-a18d3a4c83c54f7cb)

Source: `reports/ux-reviewer/2026-11-08-acceptance-4-final-B.md`. Each finding was re-derived on main before the fix.

| Finding | Answer | Proof |
| - | - | - |
| B3: below `cq-16` the avatar reach covers the bubble start | Answered. The finding measured a reach of the rem touch token, which doubles at 200% text. Below `cq-16` the text keeps the room (`packages/ui/src/lib/avatar-reach.ts` header): a reach gap there splits words, and `platform-text-scale.suite.ct.tsx` "breaks between words" goes red (0.067 against 0.03) when the gap is kept. The chip there is the enlarged `size.avatar-sm` (30px at 125% on a 320 phone), above the 24px minimum of WCAG 2.5.8 but under the 44px floor. A reach that holds 44px without splitting words needs a touch pseudo sized on the physical floor below `cq-16`; that is a ruling on `TOUCH_TARGET_PSEUDO`, filed as a proposed board item in the lane report. | A 320-at-125% cell measured the gap: chip 30px, start reach 2px outside the scroller, a bubble point covered. It is not kept, because the ruling gives that reach up. |
| B4: a coarse short landscape avatar reach is under the floor, with no CT cell | Fixed. The coarse branch now applies at every step wider than `cq-28`, for the inset and the gap. | `tests/client/features/chat/components/message-avatar-reach.ct.tsx`, new cell "844x390": red on main (chip 77..101, bubble from 109, covered points); green after. |
| B5: the Characters editor prose has no cap | Fixed for the greeting preview: the bubble reads at `reading.measure-prose`. The Description and Creator notes facet previews are single-line, truncated, `aria-hidden` echoes with no line return, so a line-length cap does not apply. The design-audit line-length rule counts them; a board item is proposed in the lane report. | `tests/client/features/character/components/platform-remaining-action-groups.suite.ct.tsx` "reads at the prose measure": red on main (720 against 518), green after. |
| B6: the pinned history plate stacks on the sticky name row | Fixed. While the plate is pinned, the name rows stop pinning (`packages/client/src/styles/globals.css`); sticky and static take the same place in flow, so the reading row is unchanged. | `tests/client/features/app-shell/surfaces/platform-history-pager.suite.ct.tsx` at 390x844 and 1280x800: red on main (3 sticky name rows under the plate), green after. |
| B7: the phone anchored toolbar sits at x4 with a jargon gloss | Fixed. The toolbar and gloss take the rows' `avatarReach` inset, the composer's edge; the gloss is plain words in `CHAT_WINDOW_PAGING_HINT`. | `tests/client/features/chat/components/platform-history-pagination.suite.ct.tsx` "a window whose target is gone says so on screen" at 390x844 and 1280x900: red on main at 390, the toolbar box at x4 against the composer and the new line at x14; green after, with the line above the scroller. |
| B8: a deleted target is screen-reader only | Fixed. A deleted or unavailable target shows the outcome line on screen under the toolbar; the `role=status` announcement stays. The copy has one home, `CORPUS_SOURCE_OUTCOME_COPY`. | Same CT: red on main at both widths (the line is not found); green after. |

### Lane cb-p3a (wt/agent-a29d5d507070ebb1d, 65e971cee7)

| ID | Result | Proof |
| - | - | - |
| 2271 NC-1, SKIP-1, SKIP-2, ED-1, SET-1 | ANSWERED | 62fa71a34b with CTs new-chat-picker-blank, config-skip-link, greeting-focus, settings-intro-voice |
| 2271 DLG-1 member card title | FIXED | `tests/client/features/chat/components/member-card-viewer.ct.tsx`: red on main (scrollWidth over clientWidth by 337, Close on its own line), green after. The viewer drops `titleTruncate`, so the title wraps by words |
| 2271 BAND-2 | ANSWERED | Same as T3 |
| 2271 INS-1 | ANSWERED | 5f0fc91d59 |
| 2271 INS-2 intro measure | FIXED (the uncapped Insights character notes; the overview's already carry the cap) | `platform-insights-identity.suite.ct.tsx`: every leaf note reads at the prose measure; red on main (1050 against 330 at 1440), green after |
| 2271 SET-3 automation switch off track | ANSWERED | `rule-editor-settings.tsx` uses `SettingSwitchRow`; measured 720px editor: switch right edge 731, equal to the Rule name field's right edge 731 |
| 2271 NC-3, NC-4, SET-2, SET-4, TAG-1, CTX-1 | NOT DONE | Not re-derived; no CT written. TAG-1 was called an audit false positive in 62fa71a34b. CTX-1 needs a phone Context sheet mount |

Part A still open: NC-3, NC-4, SET-2, SET-4, TAG-1, CTX-1. Code review: reports/code-reviewer/2026-11-09-cb-p3ab.md, C2 and C3 confirmed.
