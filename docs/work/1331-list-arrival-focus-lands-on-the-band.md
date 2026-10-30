---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: client
---

# List arrival focus lands on the band

## What

On arrival the Chats and Presets list surfaces park focus on their own root, which sits after the list band, so a forward Tab skips the band's New button.

## Why

Forward Tab must reach the list band's controls before the search field and rows.

## Owner ruling

Arrival focus lands on the band's first control (or the band), so Tab order is New, then search, then the rows.

## Done when

Every list surface with a band follows the ruling through one shared arrival-focus mechanism, a CT per affected section asserts the first Tab stop, and a planted root-focus control fails.

## Evidence

- Mechanism: `useFocusListArrival` in `packages/client/src/lib/use-focus-on-mount.ts` shares the arrival guard with `useFocusOnMount` and lands focus on the LIST band's first control (the back chevron, then the pane's action), found through the `list-pane-back` and `list-pane-action` slots. A band with no control keeps the surface root. The Chats, Presets and Characters list surfaces use it.
- Red first: `tests/client/features/app-shell/surfaces/list-arrival-focus.ct.tsx` arrives from the rail by keyboard in each of the three sections and failed on the old source with focus in the pane body, not the band. Green after, and the next Tab leaves the band into the body.
- Not changed, because the band holds no control at arrival or the surface is not a shell list on a desktop arrival: Refinery (the action renders only with a session open), Extensions, Insights, Corpus Explore (omnibox ruling), Databank and Labels. Databank and Labels have a band action; each needs its own case and is open.
