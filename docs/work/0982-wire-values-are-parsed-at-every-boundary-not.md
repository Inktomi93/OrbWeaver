---
kind: bug
status: doing
updated: 2026-10-14
priority: P1
lane: codex/contract-boundary-integration-904-905
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

The reviewed bootstrap prerequisite is integrated. Installed JOSE validates key-set structure and configured signature claims. The [corpus assignment](0959-one-builder-per-shape-and-one-golden-corpus.md) captures configuration through real HTTP, not a replacement shape or success default.

Legacy success stubs omit required auth-config fields in persona-panel-surface, character-appearance-tab, character-editor-surface, chats-section, reauth-modal and app-shell CTs. Chat and shell also use `single`, outside the canonical auth-mode tuple. Complete production parsing must reject these inputs. Preserve their behavior cases for corpus-builder replacement; do not fabricate missing fields or weaken the schema. This source finding is not a completed CT verdict.

The remaining boundary batch covers Ollama responses, local-light model files, MediaWiki responses, synchronous plugin replies and stored connection fields. Preserve sanctioned tolerant import adapters and native codecs; classify their complete consumed paths separately from unchecked casts.

Stored connections require owner comparison before JSON decoding or schema refusal. Project JSON columns as raw text and return an explicit owner-bearing parse envelope through the runtime port. Owned reads parse after their owner predicate. Preserve summarize compatibility through a derived input schema and validate canonical output. Corrupt owned bytes must refuse before read-derived writes or rollback, never become persisted null stand-ins. Composed boundary proof depends on genuine runtime and testkit seams, not test-only exports.

The listed contract and stored-value recovery is integrated. The uncommitted boundary candidate classifies direct server and inference reads, traces native decoders and widens the existing policy. Scoped cases and the complete selected policy population pass without grants. Canonical owner-bearing reads remain prerequisites, not complete wire qualification.

Independent security review confirms logout admission before revocation and SDK admission before consumed effects. It requires corrections for raw validation causes disclosing echoed credentials and inherited activation registry keys bypassing refusal. The author owns both corrections in the final batch. Context usage remains an unqualified optional post-terminal miss. No application or complete wire verdict is claimed.

The candidate uses one canonical filename-and-file-text schema for the persona, regex and world-info wrappers. Their decoded contents remain separate contracts.
