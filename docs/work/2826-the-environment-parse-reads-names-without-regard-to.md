---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: security
plan: cross-platform
---

# The environment parse reads names without regard to case on Windows

## What

The server's environment parse reads names case-sensitively. On Windows a lower-case spelling of the database name is the same variable to the system and is scrubbed at boot, but the parse never reads it, so the setting is ignored.

## Why

A Windows operator's setting is dropped with no message, against the server rule on reading the environment without regard to case.

## Done when

The parse reads each known name without regard to case on every platform, a test with no platform gate sets a lower-case database name and reads it back, and two spellings of one name at once are refused with a message.

## Evidence

Filled at landing: what ran and where its output is.
