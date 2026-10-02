---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: contracts
---

# Remove test-only chat and document-visibility helpers

## What

Remove isChatBusEventType and DEFAULT_CHAT_DOCUMENT_VISIBILITY after confirming their consumers. Keep the event registry, event contracts and document visibility schema.

## Why

Only tests call the discriminator helper or read the default object. A test comment incorrectly describes the helper as live event validation. Current document visibility reads represent an absent override without that object.

## Done when

Check symbol, alias, barrel and literal consumers across packages and tools. Preserve event membership and visibility boundary assertions against the actual registry and schema. Remove only helper-specific tests, correct the misleading validation comment, and keep runtime event handling and visibility behavior unchanged. Run the affected contract suites.

## Evidence

Filled at landing: what ran and where its output is.
