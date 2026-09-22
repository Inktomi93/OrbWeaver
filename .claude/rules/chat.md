---
paths:
  - "packages/server/src/domain/chat/**"
---

# Chat domain

- A prose slot whose rendered bytes must match a legacy constant needs a no-trim path through
  `processMacros`. `resolveGuidedInstruction` (`packages/kit/src/guided`) trims its template.
- Adding a `ChatService` verb touches four places: the `VerbAuthority` record
  (`substrate/auth/matrix.ts`), the service composition root, `contract/params.ts`, and, for a
  client-visible verb, automation's trigger-label switch.
- Changing how a content class projects to the model wire needs two edits: the
  `CONTENT_CLASS_POLICY` table and the dispatch in `spanToWirePart` (`substrate/wire-history.ts`).
  Add a pipeline behavior test, not just a table test.
- History-floor policy changes go in `resolveHistoryFloorSeq`
  (`substrate/auth/clamp.ts`), never in `resolveViewerVisibility` alone. Both read paths delegate
  to it; patching only one misses `listMessages`.
- Before treating a bus payload as id-only and unclamped, check whether the direct read of the
  same plane floors on its own. This is per-plane, not global.
- Macros such as `{{user}}`/`{{char}}` render only in display or consumption contexts, never in
  type-as-you-type editor fields. Route any new raw-appended text (nudges, scenario fields)
  through the macro renderer.
- A per-call recording sink over a per-turn-shared engine lives on the context object, never in
  the registry closure, or calls pool each other's data.
- When stripping member-visible content, cover every delivery path: at-commit read, live stream,
  and durable event replay. Prove each with a real member principal.
- Chrome that must survive an entity leaving a room resolves from a message-stamp-coverage
  producer, never the live roster alone.
- Any verb stamping an entity id onto canon must room- or ownership-gate it at the write
  boundary. Read-side name/avatar producers resolve every stamped id by design, so an
  unvalidated stamp is a cross-tenant identity leak.
- A guided steer that must read live game state rides the trusted template side keyed by an enum
  member, never client-composed macro text. Add an enum member plus a template case in
  `resolveGuidedSteer` (`assembly/`).
- Identity-macro resolution for `{{char}}`/`{{user}}` is chat-owned. A cross-domain feature
  threads chat's already-resolved values in as opaque strings and never re-derives them from its
  own roster.
- A new per-user chat turn knob is an optional, all-off-default field on `ForeignInputs`
  (`contract/foreign.ts`), populated at compose. Chat never imports `domain/settings` sideways.
- The chat engine's only in-turn stop is the provider `AbortSignal`. Compose a new kill path onto
  `prep.signal` via `AbortSignal.any`, and surface the abort reason above the provider layer,
  never through it (`engine/`).
- In the engine pipeline, run the lossy wire conversion before the token budget that prices it:
  build, shape, convert, then fit. Never fit pre-conversion content (`engine/pipeline.ts`).
- A position-keyed derived store, such as memory digests, needs a separate shrink-reclaim path.
  A content-hash self-heal only fixes rows still produced, never ones that vanished (`memory/`).
- For the open JSON column in `chat-metadata-write.ts`, use `json_set`/`json_remove` on one path
  over `coalesce(col,'{}')`, only when every writer merges exactly one key.
- A cross-domain injected op that takes no Principal, because the caller already gated
  authority, is a standalone compose-built factory, never a `ChatService` method or a tRPC
  procedure (`verbs/**`), and needs no cross-tenant sweep row.
