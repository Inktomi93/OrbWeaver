---
kind: bug
status: doing
updated: 2026-11-12
priority: P2
area: client
lane: wt/agent-a4fe6241d109f14ce
plan: cross-surface-consistency
---

# Rendered review follow-ups on the list pane, the drill header and member focus

## What

From the rendered review of the shared list and drill header work. In Settings collections at phone-shell widths the topbar Back is named for Settings but opens the collection library. Where the topbar carries the Back, focus after Back stays on the topbar Back and does not return to the row that opened the member. Opening a World Info entry by keyboard drops focus to the page. The selection bar's dismiss control falls alone onto a second row, against the ruling in the bar's own variants header. Smaller: scrollers a few pixels tall that still draw an edge fade; a single row followed by a screen of empty list box in landscape at enlarged text; the census block stranded below a short list; the drill Back label wrapping at the mid-width docked layout. Not reached by the review: empty libraries, and the pending and error states of the drill header. Evidence: the client merge train review under reports/ux-reviewer.

## Why

Each is a person losing their place or reading a control that does something other than its name, on surfaces changed today.

## Done when

The topbar Back names where it goes. Back from a member returns focus to the opening row whichever Back is pressed. Opening an entry by keyboard lands focus in the entry. The dismiss control sits on the bar's first row. Each smaller finding is fixed or closed with a reason. The unreached states get a rendered check. Component tests cover the three focus paths, red before.

## Evidence

Filled at landing: what ran and where its output is.
