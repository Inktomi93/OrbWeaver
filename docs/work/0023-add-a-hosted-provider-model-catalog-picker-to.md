---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: client
---

# Add a hosted-provider model catalog picker to the add-connection dialog

## What

Hosted providers in the add-connection dialog (packages/client/src/features/credentials/components/add-connection-dialog.tsx, ProviderFields) only get a typed Model text field. The only model list the dialog knows how to fetch is the base-URL endpoint list. Four pieces of work:
1. Add a connection-door read that lists a hosted provider's models for an unsaved draft, identified by provider plus a draft key or a saved credential id. The existing catalogModels read needs a saved connection id, so it cannot serve the dialog.
2. Drive the dialog's Model field from that read, the same way the saved-connection editor does (connection-editor-essential.tsx): a non-retrying query, a visible loading state, a searchable list, and a typed-id field when the list is empty or the read fails.
3. Add an "Add another model on this key" action to the saved-key view. It opens the dialog with the provider and credential already filled in, shows no secret, and puts focus on the model picker.
4. Either use the CommandLoading primitive in the new picker, or delete it and its exports from packages/ui/src/primitives/command.

## Why

When a user creates a hosted connection, they have to type an exact model id from memory. Endpoint connections and already-saved connections both get a real model list, so hosted creation is the one path left without one. A saved key also cannot be reused for a second model without pasting the secret again.

## Done when

Picking a hosted provider in the add-connection dialog shows a loading state, then a searchable model list built from the new connection read. Choosing an entry sets the form's model value. An empty list or a failed read shows the typed Model field, and submitting still works. The saved-key view has an "Add another model on this key" action that opens the dialog with provider and credential set, no key text visible, and the model picker showing. Component tests cover the listed, loading, empty, failed and typed-fallback states and the saved-key prefill. A server test covers the new read's principal scoping. CommandLoading is either imported by the picker or no longer exported from @orb/ui.

## Evidence

Filled at landing: what ran and where its output is.
