---
kind: work
status: open
updated: 2026-09-24
priority: P3
area: client
---

# Finish the connection-aware capability panel and warning cadence

## What

Give the preset editor's capability panel a switcher so it can inspect any role binding or connection, not only the caller's chat binding. The server needs a capability read that takes the selected connection. Change the turn warning path so the drop warnings from one turn arrive as a single aggregated notice per connection. Emit that notice only when the dropped set differs from the previous turn's set on that connection.

## Why

The panel resolves only the chat binding, so a user cannot see what another role or connection supports before using it. On the turn path, the engine emits one warning event per dropped capability and per runner warning. The client turns each event into its own toast, so every turn repeats a burst of the same notices even when nothing changed. That buries the one signal that matters, which is that support changed.

## Done when

- The capability panel has a switcher. It defaults to the chat binding and can select any other role binding or connection. The panel shows the selected connection's role, provider and model, plus its sampling, effort and conflict drops.
- A stale or deleted binding shows an explicit error state on the panel, not a blank or crashed one. A pending read shows the panel's loading state and a failed read shows its error state.
- A turn produces at most one warning notice. It lists every drop from that turn and appears only when the dropped set differs from the previous turn on that connection. A turn with an unchanged set produces no notice.
- `custom_parameters_ignored` still offers the Open Connections action. `declared_overrides_measured` still never appears as a turn notice. Background and arbitration degradation still gets one notice per session.
- Component tests run through the rendered UI and cover: switching connections, a stale or deleted binding, a pending read, an errored read, an unchanged warning set that produces no notice, and a changed set that produces exactly one notice.

## Evidence

Filled at landing: what ran and where its output is.
