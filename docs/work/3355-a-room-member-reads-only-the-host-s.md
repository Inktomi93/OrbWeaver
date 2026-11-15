---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: regex
plan: import-robustness
---

# A room member reads only the host's scripts the room shares with them

## What

The read that lists a chat's regex scripts checks only that the caller is in the room and returns every script the host attached to it, with patterns, prompt-only scripts included. A member gets them with the host's sharing switch off. The display read is correct; this second read is not.

## Why

A host who switched sharing off still exposes every room script and pattern to any member.

## Done when

A member-principal case reads the list with sharing off and gets no host script, and with sharing on gets only the enabled display scripts the display read hands them. The host's read is unchanged. A stored sharing value that fails to parse reads as off.

## Evidence

Filled at landing: what ran and where its output is.
