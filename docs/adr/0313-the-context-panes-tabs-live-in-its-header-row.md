---
kind: adr
status: active
updated: 2026-10-11
supersedes: docs/adr/0150-the-context-pane-is-one-chrome-the-context.md
---

# The context pane's tabs live in its header row, as the pane's one tablist: no foot rail, no kicker, no band title

## Context

ADR 0150 ruled the context pane as ONE column: head band, state rail, viewport, ground and a meta rail pinned to the foot, with the room title and chips handed into the band while the pane was docked. The owner reversed it: the room's identity (participants, the user's own name, the members and memory chips) always lives in the center header, and the pane's own tabs are its header.

## Decision

Every tabs pane (chat, characters, rpg, config) draws one header row on the shared 48px horizon with the pane surface: the pane's ONE tablist (real tab roles, roving focus, manual activation, horizontal scroll with no native scrollbar), the view-level actions and a close x at the trailing end. A single resolved tab draws no strip. The optional identity band sits under the header row. A game room's state cells stay panel content under the header as a named toolbar with its own Tabs root, so the header's tab map and active bar only ever see header tabs. There is no foot rail, kicker or ground. Viewport panels keep role=region (a tabpanel's children offload, and the bracket keeps a visited panel mounted).

## Consequences

- The pane's navigation is where the shell's other headers are, on one divider.
- The room name lives in the center header, so no band repeats it and the rpg band prints only the scene.
- While a state cell holds the view the header tablist has no selected tab and paints no bar.
- Closing a docked pane returns focus to the toggle that reopens it.

## Alternatives rejected

- Keep the foot rail and add header chrome: two navigations for one pane.
- Put the state cells into the header tablist: one tablist always has a selection, but a game room's header carries ten tabs and the state rail loses its place under it.
