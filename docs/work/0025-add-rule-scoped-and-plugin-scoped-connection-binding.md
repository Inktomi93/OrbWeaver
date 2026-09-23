---
kind: work
status: open
updated: 2026-09-23
priority: P1
area: client
---

# Add rule-scoped and plugin-scoped connection binding editors to the client

## What

Give the automation-rule editor and the plugin grant surface their own per-task connection binding controls. The rule editor reads and writes `connection.listBindings` / `connection.setBinding` with `actor: { kind: "automation-rule", ruleId }`. It lists the rule author's compatible connections for each routable task. The plugin grant surface reads and writes with `actor: { kind: "plugin-grant", pluginId }`. It lists only the tasks the plugin declared and only the installing user's connections. The server router, domain verbs and inference fold already accept both actor shapes. Only the client side is missing.

## Why

The server supports rule-scoped and plugin-scoped bindings, but no client code can create one. An automation rule can only run on its author's user bindings, and a user cannot give a plugin a grant-time connection. So the per-actor routing the connection design requires cannot be set up from the product, and the security review of plugin model access has no surface to review.

## Done when

Rule editor: a per-task binding control lists the author's compatible connections, and saving calls setBinding with the rule's id and the chosen task. Reopening the rule shows the saved binding from listBindings for that rule actor. Plugin grant surface: a per-task binding control appears only for tasks the plugin declared. Saving calls setBinding with the plugin's id and the chosen task. Reopening shows the saved binding. Both surfaces render the unset, unavailable-connection, background-refused, deleted-connection, loading, error and cross-owner-refused states. A plugin with no plugin-grant binding for a task is shown as unbound, not as using the user's default. Component tests for each surface assert the actor kind, actor id and task on every write and cover each of those states through the real tRPC doors. A server integration test shows that a caller who does not own the rule or plugin is refused on both listBindings and setBinding.

## Evidence

Filled at landing: what ran and where its output is.
