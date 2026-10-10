---
kind: bug
status: doing
updated: 2026-10-10
lane: fix/saved-key-connection
---

# Reuse saved credentials when adding a connection

## What

The add-connection dialog accepts only a pasted secret and cannot reuse an owned saved credential before a connection exists.

## Why

Credentials imported from environment settings remain unusable in first connection authoring without pasting the secret again.

## Done when

The add dialog offers usable same-provider saved credentials, lists models and creates the connection by credential ID, and preserves the new-key path and provider-change isolation. Scoped tests and rendered checks pass.

## Evidence

Filled at landing: what ran and where its output is.
