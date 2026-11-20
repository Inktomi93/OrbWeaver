---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: user-admin
---

# Linking an SSO identity with an id that does not parse says why nothing happened

## What

`LinkSsoBody` in `packages/client/src/features/user-admin/components/admin-link-sso-dialog.tsx` returns early when the trimmed input fails `externalIdSchema`. The press does nothing and shows nothing. Before the catch narrowing the same input threw a ZodError inside a catch-all, with the same silent result.

## Why

An admin who pastes a malformed external id gets no answer and cannot tell a refused id from a dead button.

## Done when

A CT pastes an id `externalIdSchema` refuses, presses Link, and sees the field's refusal text; the dialog stays open and no mutation is sent.

## Evidence

Filled at landing: what ran and where its output is.
