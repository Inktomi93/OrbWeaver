---
kind: bug
status: open
updated: 2026-10-13
priority: P1
---

# Wire values are parsed at every boundary, not only in the client

## What

Spine-TypeScript says wire values that cross a boundary are parsed, not cast, but wire-json-parsed-at-consumer judges the client only. The server casts fetched bodies, among them the JWKS body in packages/server/src/infra/auth/jwks.ts. Parse each server and inference wire read through its schema, and widen the rule to every package that reads a wire value.

## Why

A cast of an untrusted response body trusts whatever arrives; on the auth path that is a key set the server verifies tokens with.

## Done when

Every server and inference wire read parses through a schema; the check covers every package with a planted control; a security review confirms the auth reads.

## Evidence

The complete bootstrap wire schema lives at `packages/contracts/src/auth-config/index.ts`. Both client reads parse the full response. The server projection preserves request-specific transport, client scope, first-run admission and signed-in share privacy. The unused login flag is removed.

The reviewed bootstrap prerequisite is integrated. Server and inference wire reads, including JWKS, and checker population widening remain required. The [corpus assignment](0959-one-builder-per-shape-and-one-golden-corpus.md) must capture auth configuration through the real HTTP application, not declare a replacement shape or success default in testkit.

Legacy success stubs omit required auth-config fields in persona-panel-surface, character-appearance-tab, character-editor-surface, chats-section, reauth-modal and app-shell CTs. Chat and shell also use `single`, outside the canonical auth-mode tuple. Complete production parsing must reject these inputs. Preserve their behavior cases for corpus-builder replacement; do not fabricate missing fields or weaken the schema. This source finding is not a completed CT verdict.
