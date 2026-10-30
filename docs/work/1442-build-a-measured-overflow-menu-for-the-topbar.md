---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: ui
plan: css-system
---

# Build a measured overflow menu for the topbar trail, Context header and list band actions

## What

Give the shell's action rows one overflow mechanism. When the topbar trail, the Context panel header or a list band runs out of inline space, the actions that do not fit move into a "More" menu at the row's end, never wrapping, clipping or sliding under a neighbour.

Design (ruled):

- Each action in these rows declares a menu form beside its inline form: label, icon and the same handler. Registry-driven topbar trail widgets declare it on their registry entry, so a new widget cannot ship without one.
- The row measures with a `ResizeObserver` on its own container (not a viewport media query), keeps actions inline in their declared priority order while they fit, and moves the rest into the menu. The "More" trigger is always reserved.
- One shared hook and one menu component own the measuring and rendering. The topbar, the Context header and the list band use it; none hand-rolls its own.
- Keyboard and screen-reader order follow declared priority, and focus stays on the trigger when an action moves between inline and menu.

## Why

Item 1438 records the ruling that these actions overflow into a menu at enlarged text, and item 0884 moves panel toggles into the panel headers. Neither can land without the mechanism. At 200% text on a phone, Import, New character and Show details already sit under the Search field.

## Done when

The 1438 topbar, Context header and list band cases pass in `QUALIFIED` in `tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx` on Chromium and WebKit at 390x844 and 1440x900. A production-mounted CT proves an action moves into the menu as the row narrows, back out as it widens, keeps its handler, and keeps focus on the trigger.

## Evidence

- Mechanism: `OverflowActions` in `packages/client/src/components/overflow-actions.tsx`. The row observes its own box and each action with a `ResizeObserver`, keeps actions inline in declared order while they fit, and moves the first that does not fit, and every action after it, into a "More actions" menu. A moved action stays mounted, out of flow and `inert`, so its dialogs keep their state and its width stays measurable. Focus on an action that leaves the row moves to the trigger. A menu form is an item or a submenu (`packages/client/src/lib/overflow-menu-form.ts`).
- Topbar trail: `TrailWidgetBehavior.useMenuForms` (`packages/client/src/state/chrome-registry.ts`) is required on every `topbar.trail` widget; `tests/client/state/chrome-registry.dom.test-d.ts` pins that one without it does not type-check. Each form invokes the same action as its inline control. Context toggle: the same handler. Characters doors, notifications, bug report and the refinery start picker: a request channel (`packages/client/src/lib/open-request-channel.ts`) into the mounted control, which opens its own dialog or popover. Plugin commands: a submenu of the same commands and runner. The command modal entry derives its form from its modal behavior. Nothing opens the You sheet on a desktop.
- List band: `ListPaneHeaderView.actions` (`packages/client/src/lib/list-pane-header-view.ts`) replaces `action`. Each band action carries a non-empty `menu`, and `tests/client/lib/list-pane-header-view.dom.test-d.ts` pins that one without it does not type-check. `ListPaneHeader` renders the band's actions through `OverflowActions`. Sites: Chats (Import, New), Presets (Import, New), Characters (the door cluster), Databank (a maintenance submenu with its reason line, Add), Labels (New) and Refinery (the start picker). `shell/panels.css` lets the band's identity shrink first and gives the action row its floor.
- Tests, `tests/client/features/app-shell/surfaces/platform-topbar-overflow.suite.ct.tsx`, Chromium and WebKit: the trail action leaves and returns with its handler and focus; the notifications and bug report entries open their own surfaces; the Chats, Characters, Presets and Databank bands move their actions into the menu at enlarged text and each entry opens the same surface. The four band cases fail with the mechanism absent from the band (the band rendering its inline nodes).
- Not covered by a CT: the Labels band and the plugin commands submenu (a corpus with no labels mode seed and no launcher commands), and the Refinery band (the corpus lists no session). Each form is wired the same way as a covered one.
- Context header: no overflow is needed. Its tab strip is the row's shrinker (`min-inline-0`) with its own tab chooser, and the pane's one actions node and its dismiss follow it. The 200% probe finds no action past the edge.
- Room accounting, one place (`overflow-actions.tsx` plus the two CSS minimums): the row measures the parent's content width minus every sibling's floor and the gaps, so it can grow back after it overflowed, and it claims only what it shows (the inline run plus the trigger, nothing when no action renders). Its floor is the trigger's own token (`--size-control-md`), not a fixed 44px, and a shed title holds no floor (`shell/mobile.css`). The topbar title floor yields before the trigger does (`shell/chrome.css`). An action that renders nothing takes no box and no gap, and the trigger names its row ("More top bar actions", "More list actions").
- Focus: a surface opened from the menu hands focus back to the trigger when its own, out-of-reach control cannot take it. The row arms on a menu choice, notes the surface that takes focus, and when that element is gone and focus has dropped to the page it focuses the trigger (a mechanism of `OverflowActions`; no surface carries a patch). `platform-overflow-room.suite.ct.tsx` covers Notifications, Report a bug, Jump and the Refinery start picker by keyboard. The first three failed on the previous tip; the Refinery band never overflowed on the previous tip, so its case has no old-tip red.
- Arrival: `useFocusListArrival` skips an inert or overflowed control and falls through to the next visible one, or the trigger. A return to Chats from Home landed on the content landing, which replayed focus on every reveal; it now takes focus once (`chat-landing-surface.tsx`), and `list-arrival-focus.ct.tsx` pins the return for Chats, Characters and Presets.
- Limits: at 300% text on a 320px phone the lead control, the trigger and the row's padding exceed the viewport, so the 300% case runs at 390 and the 320 case at 200%. The Databank band's menu can overrun the right edge by about 5px at 200% on a phone: the menu primitive takes no collision padding, so the fix belongs to the primitives tree. At 300% with a character open a screen can show four ellipsis controls; each now has its own name (More top bar actions, More list actions, the tab chooser, the character actions), which is acceptable.
