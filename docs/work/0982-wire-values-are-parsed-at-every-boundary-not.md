---
kind: bug
status: doing
updated: 2026-10-13
priority: P1
lane: codex/auth-wire-982
---

# Wire values are parsed at every boundary, not only in the client

## What

Spine-TypeScript requires wire values to be parsed at boundaries, but wire-json-parsed-at-consumer judges the client only. Classify every server and inference wire read by its actual parser. Repair missing validation and widen the rule to every reading package. Preserve native library validation rather than duplicating its schema.

## Why

Unvalidated response bodies can cross security and application boundaries. A cast alone does not prove validation; native parser behavior must be inspected.

## Done when

Every server and inference wire read parses through a schema; the check covers every package with a planted control; a security review confirms the auth reads.

## Evidence

The complete bootstrap wire schema lives at `packages/contracts/src/auth-config/index.ts`. Both client reads parse the full response. The server projection preserves request-specific transport, client scope, first-run admission and signed-in share privacy. The unused login flag is removed.

The reviewed bootstrap prerequisite is integrated. Server and inference wire inventory and checker population widening remain required. Installed JOSE validates local key-set structure; remote responses enter the same validator. Inspect its key selection, import and application claim boundaries before declaring missing auth validation. The [corpus assignment](0959-one-builder-per-shape-and-one-golden-corpus.md) captures configuration through real HTTP, not a replacement shape or success default.

Legacy success stubs omit required auth-config fields in persona-panel-surface, character-appearance-tab, character-editor-surface, chats-section, reauth-modal and app-shell CTs. Chat and shell also use `single`, outside the canonical auth-mode tuple. Complete production parsing must reject these inputs. Preserve their behavior cases for corpus-builder replacement; do not fabricate missing fields or weaken the schema. This source finding is not a completed CT verdict.

The remaining boundary batch covers Ollama responses, local-light model files, MediaWiki responses, synchronous plugin replies and stored connection fields. Preserve sanctioned tolerant import adapters and native codecs; classify their complete consumed paths separately from unchecked casts.

Stored connections require owner comparison before JSON decoding or schema refusal. Project JSON columns as raw text and return an explicit owner-bearing parse envelope through the runtime port. Owned reads parse after their owner predicate. Preserve summarize compatibility through a derived input schema and validate canonical output. Corrupt owned bytes must refuse before read-derived writes or rollback, never become persisted null stand-ins. Composed boundary proof depends on genuine runtime and testkit seams, not test-only exports.

The boundary branch includes current main; its source is frozen but not integrated or qualified. Integrate its owner-bearing read with the harness and executor authorization before the shared affected floor. Preserve SDK, kernel and timer additions; reuse the canonical owned-read rather than a parallel parser. Strict head/kernel, host lifecycle and scoped-query rejection proof remain required.
