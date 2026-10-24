---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: plugin
---

# One home for the plugin guest log caps

## What

The client's `UI_GUEST_BUDGETS.logLines` and `logChars` in `packages/client/src/lib/plugin-ui-guest-protocol.ts` copy the server's `LOG_LINES_PER_INVOCATION` and `LOG_BYTES_PER_INVOCATION` in `packages/server/src/infra/plugin-host/budgets.ts`, and a doc comment is the only link between them. A CT that proved the guest protocol read the server constants sideways until item 1282 moved it onto the client copy.

## Why

A second copy of a shape is a defect; the two caps can drift and the guest would be cut at a different line than the host counts.

## Done when

Both sides read one constant in `@orb/contracts/plugin`; the client and server copies are gone; the guest protocol CT and the plugin-host budget tests import the contract value; a change to the constant moves both sides in one commit.

## Evidence

Filled at landing: what ran and where its output is.
