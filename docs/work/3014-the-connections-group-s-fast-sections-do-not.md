---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
---

# The Connections group's fast sections do not wait on the Model roles read that warms provider facts

## What

connection.listBindings runs a task resolve per role on the server, and a resolve warms the row's provider facts, which dials a cold or down endpoint (3 s per attempt). The Connections group mounts its sections together: connections-roles-section.tsx (line 84, a sequential suspense read of connection.list then listBindings then providersAvailable), connections-list-section.tsx (line 88, parallel with connection.list, credentials.list and providersAvailable) and connections-keys-section.tsx (credentials.list, connection.list, providersAvailable). A fast read of one section that leaves in the tick of the listBindings read shares its batch and waits for the dial. Tag the listBindings reads through one options helper beside roomRosterOptions in packages/client/src/data/trpc.ts (the key with no actor input is also read by components/use-utility-model.ts), exported through #data and read at every spelling of that key. All three files sit under packages/client/src/features/credentials/, which the client-data lane could not touch.

## Why

A batch is answered after its slowest call, so a Connections pane with one sleeping endpoint paints its key and connection lists only after the endpoint's probe timeout. The slow read is the one to tag here because every section of the group is a gating read and none of them can be listed as the exception.

## Done when

Every reader of connection.listBindings with no actor input rides alone through one typed options helper; a dom test sends it beside a held fast read through createTrpcClient and sees the fast read settle first, and a control without the helper is held; a CT holds the listBindings read and sees the keys section draw.

## Evidence

Filled at landing: what ran and where its output is.
