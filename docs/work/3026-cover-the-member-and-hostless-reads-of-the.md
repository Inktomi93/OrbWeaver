---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: test-foundation
---

# Cover the member and hostless reads of the room racks

## What

worldInfo.listForChat and regex.listForChat now list only the present host's attachments and list none for a hostless room. The stale-row case reads the racks as the new host only; no case reads them as a member, and no case reads a hostless room.

## Why

The member read is the ruled reader of both racks (D18), and the hostless branch is new behaviour with no test.

## Done when

A case reads both racks as a non-host member and sees the host's attachments, and a case reads a room with no present host and sees none with a positive control in the same case.

## Evidence

Filled at landing: what ran and where its output is.
