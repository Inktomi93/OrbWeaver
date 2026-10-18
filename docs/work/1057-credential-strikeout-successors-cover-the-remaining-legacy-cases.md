---
kind: work
status: open
updated: 2026-10-18
priority: P2
area: tests
plan: test-foundation
---

# Credential strikeout successors cover the remaining legacy cases

## What

The legacy credential-strikeout.suite.int.test.ts fails most cases on main, and its passing cases assert against a callback the engine no longer calls. Maintained suites under tests/server/domain/credentials/verbs/ cover most cases. Three gaps remain: the embed-role failure message that names the role (digests.ts), side-role isolation (an embed-role 401 during a chat turn leaves the chat key alone), and a plain non-provider error striking nothing.

## Why

A stranded legacy suite whose passing cases prove nothing keeps a dead support stub alive (maybeRevokeOnAuthFailed in tests/legacy/server/domain/chat/\_support.ts).

## Done when

The three cases are maintained, red-first against planted defects; the legacy suite and its support stub are deleted.

## Evidence

Filled at landing: what ran and where its output is.
