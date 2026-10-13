---
kind: bug
status: doing
updated: 2026-10-13
priority: P1
lane: codex/auth-wire-982
---

# Wire values are parsed at every boundary, not only in the client

## What

Spine-TypeScript says wire values that cross a boundary are parsed, not cast, but wire-json-parsed-at-consumer judges the client only. The server casts fetched bodies, among them the JWKS body in packages/server/src/infra/auth/jwks.ts. Parse each server and inference wire read through its schema, and widen the rule to every package that reads a wire value.

## Why

A cast of an untrusted response body trusts whatever arrives; on the auth path that is a key set the server verifies tokens with.

## Done when

Every server and inference wire read parses through a schema; the check covers every package with a planted control; a security review confirms the auth reads.

## Evidence

The auth configuration bootstrap also lacks a complete canonical wire schema. `packages/server/src/entry/http/auth-meta.ts` constructs its response directly. `packages/client/src/data/auth-config.ts` declares `AuthConfig` and casts the JSON response instead of parsing it.

Move the complete wire shape into its contract owner and parse the consumer response. Preserve request-specific transport, client scope, first-run admission and signed-in share projection. Apply the [unused-field ruling](0979-decide-the-auth-config-requireslogin-wire-field.md) without retaining `requiresLogin` in the new schema.

This production boundary blocks the complete typed auth-configuration builder in the [corpus assignment](0959-one-builder-per-shape-and-one-golden-corpus.md). Capture responses through the real HTTP application; do not declare a replacement shape in testkit. Other builder and harness work can continue.

Legacy success stubs omit required auth-config fields in persona-panel-surface, character-appearance-tab, character-editor-surface, chats-section, reauth-modal and app-shell CTs. Chat and shell also use `single`, outside the canonical auth-mode tuple. Complete production parsing must reject these inputs. Preserve their behavior cases for corpus-builder replacement; do not fabricate missing fields or weaken the schema. This source finding is not a completed CT verdict.
