---
kind: work
status: open
updated: 2026-09-23
priority: P1
area: client
---

# Finish the connection surfaces still missing from the inference client cut-over

## What

Build the connection-aware client surfaces the server already supports.
(1) Role slots: the automation-rule editor and the plugin grant surface each get a per-task connection role picker. It reads and writes connection bindings with the automation-rule and plugin-grant actor kinds. The plugin surface lists only tasks the plugin declared.
(2) Capability panel: add a connection switcher that defaults to the chat binding and names the role, provider and model in view. The panel becomes the ambient home for sampling, effort and conflict drop warnings.
(3) Warning cadence: replace one toast per bus warning with at most one grouped notice per turn, raised only when the dropped set differs from the previous turn on that connection. The Extras-row custom-parameter warning, the declared-override badge and the session-level background and arbitration notices stay where they are.
(4) Room readouts: each assistant swipe shows the connection, provider and model that produced it, taken from the persisted swipe record. The composer shows a quiet line naming the connection and model the next turn will use. Shared rooms state at the image control that generated pictures live in the room, and the room gallery gets a room-scoped filter.
(5) Add flow: the Claude subscription step gets a keyboard-operable copy action for the `claude setup-token` command. Component tests drive a full add, credential mint then connection create, for every built-in provider.

## Why

Automation rules and plugin grants cannot be pointed at a connection, so rules silently use the author's own defaults and plugins have no grant-time routing. The capability panel and the warning toasts never say which connection or role they describe. Every turn can repeat the same stack of toasts. Transcripts cannot show which connection or model wrote a given swipe, even though the server records it. Shared rooms give no hint where generated pictures go. The add-connection flow has no test that proves a full add works for each provider.

## Done when

(1) The automation-rule editor and the plugin grant surface each render a per-task connection role picker. Component tests assert the actor kind, the actor id and the task sent on every write. They also cover the unset, deleted-connection, loading, error and cross-owner refusal states.
(2) The capability panel has a connection switcher that defaults to the chat binding and names the role, provider and model in view.
(3) A turn raises at most one grouped warning notice, and none when the dropped set matches the previous turn on that connection. A rendered test proves both cases.
(4) Each assistant swipe shows its connection, provider and model. Swipes with no attribution and swipes whose connection was deleted render honestly.
(5) The room composer shows the next-turn connection and model, including the unset state.
(6) A shared room shows the pictures-live-here sentence at the image control, and the room gallery has a room-scoped filter.
(7) The Claude subscription step has a working copy action for `claude setup-token`.
(8) A component test drives the add dialog through credential mint and connection create for every built-in provider, including partial-failure recovery.
(9) The new surfaces render correctly at desktop, narrow and mobile widths.

## Evidence

Filled at landing: what ran and where its output is.
