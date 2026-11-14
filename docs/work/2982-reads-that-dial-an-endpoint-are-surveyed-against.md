---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
---

# Reads that dial an endpoint are surveyed against the surfaces that paint from a sibling read

## What

Reads that dial a provider or endpoint on the server: chat.checkSendAvailability, chat.previewContextFit, connection.catalogModels, connection.accountCredits, connection.generationCost, connection.tokenizeWords, connection.capabilities and connection.resolveChatCapability on a cold endpoint mirror, search.search. Each sits in a surface owned by another lane (credentials connection editor, preset params deck and logit-bias editor, discovery corpus search results and dossier, chat composer next-turn line and message list). For each, read its mount beside the surface's suspense reads and either tag the read the surface paints from, or record that the dialing read mounts after the first paint.

## Why

The same batching hazard as the room roster holds wherever a dialing read mounts in the same tick as a read a surface waits on; only the room roster is tagged today.

## Done when

Each listed read is either shown to mount after the surface's first paint or has the paint-gating read beside it tagged through the typed options helper, with a dom test per tag.

## Evidence

Filled at landing: what ran and where its output is.
