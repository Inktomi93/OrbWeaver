---
kind: plan
status: active
updated: 2026-11-17
rank: 18
---

# A reply that cited the web keeps its citations

## Goal

A turn whose model retrieved or cited web sources keeps that fact: the provider's source parts become one typed list on the chat result, the turn writes the list into the variant's metadata sidecar, and a read through the parse seam returns it unchanged.

## Shape

Three hops, one shape. The type and its schema live in `packages/contracts/src/chat/messages.ts` beside `textSignatureSchema`, because the sidecar schema is their reader, and `@orb/inference` already imports host provenance types from that door (`packages/inference/src/contract/v4.ts`).

### Wire to drain

`packages/inference/src/backends/v4/stream.ts` meets two arrival forms of one fact:

| Wire | Arrival | Where the span is |
| - | - | - |
| OpenRouter | a `source` stream part per citation, built from the response's `url_citation` annotations | inside `providerMetadata.openrouter` as `content`, `startIndex`, `endIndex` |
| Anthropic | `citations` on the `text-end` part of a text block | `startIndex`, `endIndex`, `citedText` on each citation, relative to that block |

One accumulator list, in arrival order, with no deduplication: one URL cited for two spans is two facts, and a consumer that wants a distinct URL set collapses it itself.

### The offset frame is the reply

A source part is stamped with `acc.reply.length` at the moment it arrives; an Anthropic citation of a block is shifted by that block's own arrival point. Both are stored as `atChars` and `endChars`, offsets into `ChatResult.reply`, so a reader never has to know which wire produced an entry.

That stamp is only knowable inside the fold. Nothing later sees text and parts interleaved in stream order, which is the reason the image parts already carry `atChars` (`packages/inference/src/backends/v4/stream.ts`). The block arrival point therefore joins the per-block text record that already holds the block's text and thought signature.

The per-vendor narrowing happens at the fold, as `openRouterToolMeta` already does for `reasoning_details`: the fold reads the vendor bag, and no open bag crosses the contract.

### Field shape

The one shape, in `packages/contracts/src/chat/messages.ts`:

```ts
/** One source a turn cited, with its span in the reply. */
export interface ChatSource {
  readonly url: string;
  /** Absent when the wire named none. OpenRouter substitutes "" for a missing title; the fold maps that to absent. */
  readonly title?: string | undefined;
  /** Where the cited span starts, as an offset into ChatResult.reply. */
  readonly atChars: number;
  /** Where it ends, where the wire supplied a span. */
  readonly endChars?: number | undefined;
  /** The supporting passage, where the wire supplied one. */
  readonly citedText?: string | undefined;
}
```

A `sourceType: "document"` member is refused: no producer in this graph builds one. The OpenRouter provider emits `url` sources only, and Anthropic's document citations require a document content block this app never sends. A member no producer builds is a member to delete.

### The hops

- `StreamDrain.sources` is always present, like `textSignatures`, so no reader has to distinguish absent from empty inside the fold.
- `ChatResult.sources` is optional and absent when the turn cited nothing, the `textSignatures` and `reasoningParts` discipline: an unreported fact stays absent, never an empty array.
- `TurnEconomics.sources` carries it across the engine seam.
- The turn writes it into `message_variants.metadata` under one closed key, `sources`.
- `parseVariantMetadata` returns it to any consumer. `MessageView` does not project it, following `providerMetadata`: the sidecar is host-plane provenance and no UI is promised.

### Why a sidecar key and not a column

`message_variants.metadata` is typed JSON whose shape is `variantMetadataSchema`, and a key added to that schema is a key both the writer and the parse seam already carry. So the store step needs no DDL and no migration.

`reasoning_parts` earned its column from a per-turn reader: the assembly replays those blocks into the next request. Citations have no reader yet and no query. The sidecar is the home this codebase already uses for a parsed provenance blob nothing queries, `importResidue` being the standing case.

### One classification the type enforces

`packages/server/src/domain/chat/verbs/fork.ts` rebuilds a stripped sidecar and types it `satisfies Required<VariantMetadata>`, so a new key fails `tsc` until its author classifies it. A fork carries `sources`: they describe the copied reply's own text and hold no host material, like `usageLegs` and `providerMetadata` beside them.

## Rejected

- **The result contract alone, with no row.** The item's Done-when bar stops at the contract and the fold, and a `ChatResult` field the server drops dies with the request, so the retrieved URLs would still be lost one hop later. If the owner meant only the contract, delete the store steps and the fold and contract stand as written; the two are separable at `packages/inference/src/contract/chat.ts`.
- **A `message_variants.sources` column.** No reader exists to justify DDL, a `$type`, and a fourth site that must parse it. See above.
- **One field per arrival form, `sources` beside `citations`.** Both forms answer one question, and two fields would leave every reader to union them and reconcile two offset frames.
- **The wire's own `startIndex`/`endIndex` kept verbatim.** The two wires measure from different origins, so one verbatim field would store one name with two meanings.
- **Recording a document source as a wider member.** See the field shape.
- **A warning event when a source cannot be modelled.** No wire in this graph can produce one, so the warning would describe a case no user reaches.

## Coupled sites

- `packages/contracts/src/chat/messages.ts`: `chatSourceSchema` and `ChatSource` beside `textSignatureSchema`; the `sources` key on `variantMetadataSchema`; the sidecar comment that names the keys.
- `packages/contracts/src/chat/index.ts`: export the type from the door.
- `packages/inference/src/contract/v4.ts`: `StreamDrain.sources`.
- `packages/inference/src/backends/v4/stream.ts`: the accumulator list, the source branch in the content cascade, the citation branch beside the text-signature record, the arrival point on the per-block text record.
- `packages/inference/src/backends/v4/result.ts`: carry the list into the result, absent when empty.
- `packages/inference/src/contract/chat.ts`: `ChatResult.sources` with the offset frame and both arrival forms in its comment.
- `packages/server/src/domain/chat/contract/results.ts`: `TurnEconomics.sources`.
- `packages/server/src/domain/chat/engine/provider-bridge.ts`: copy the field into the final chunk. The same edit deletes the duplicate `reasoningParts` write this file carries twice, so one field has one writer.
- `packages/server/src/domain/chat/engine/engine.ts`: the sidecar key in `liveVariantMetadata`, with the builder's comment naming the new key.
- `packages/server/src/domain/chat/verbs/fork.ts`: classify the key in the stripped sidecar.
- `packages/db/src/schema/chat.ts`: the sidecar comment only. No column, no migration.

Placement is constrained by `AGENTS.md`: the shape is a stored-row blob, so its home is `@orb/contracts`; the vendor-bag read stays in `backends/**`, where per-provider shape knowledge lives; the server edits stay inside `domain/chat`, so no tier or package dependency changes.

## Test plan

| Case | File | The red it proves |
| - | - | - |
| An OpenRouter source part becomes one entry with its reply offset and its narrowed span | a new `stream-sources.test.ts` beside `tests/inference/backends/v4/stream-tool-input-guard.test.ts` | `drained.sources` is `undefined` before the fold records it |
| An Anthropic `text-end` citation is stored reply-absolute, after the prose that precedes the block | the same file | the block-relative index is not shifted before the fold computes it |
| A source part's missing title is absent, never the empty string OpenRouter substitutes | the same file | an absent title reads as `""` before the fold normalizes it |
| A turn that cited nothing reports no `sources` key on the result | the same file, through `toChatResult` | the result carries the key with an empty array before the spread-if-present rule |
| A document-typed source part adds no entry and does not fault the turn | the same file | the fold's content cascade ignores an unmodelled member |
| The final-chunk economics carry the list from a chat result | a new bridge test under `tests/server/domain/chat/engine/` | the economics object has no `sources` before the copy |
| The sidecar schema keeps `sources` and the parse seam returns it | `tests/contracts/chat/`, beside the existing variant-schema cases | `variantMetadataSchema` strips an unknown key, so the value is gone before the key is declared |
| A malformed stored `sources` blob degrades instead of failing a history read | the same directory | the parse seam throws before the entry schema accepts a per-entry degradation |
| A member fork keeps the key and the type is total | the fork suite under `tests/server/domain/chat/` | `tsc` fails the `satisfies Required<VariantMetadata>` object until the key is classified |

The engine-to-column hop is covered by the type binding and the sidecar cases, not by a live turn: the composed chat provider speaks the openai-compatible wire, which emits no source parts, so no composed turn can produce one today. `pnpm test tests/inference/backends/v4 tests/contracts/chat tests/server/domain/chat`, `pnpm typecheck`, `pnpm lint` and `pnpm unwired scan` are the suites to run.

## Open questions

- **The OpenRouter offset origin is read from the provider dist, not measured.** The installed provider builds the part from the response's annotation and puts `start_index`/`end_index` in `providerMetadata.openrouter`. Whether those indices count from the whole reply or from the current text block is undocumented where it is built. The lane records one response body that carries a `url_citation` annotation and pins it as a fixture; the frame is settled by that fixture, not by this plan.
- **A continue replaces the sidecar.** A continuation writes its own generation record, so its `sources` replace the parent's. Spans are reply offsets and the reply grows, so merging parent and continuation needs an offset shift; this change does not take that on and says so at the write site.
- **No reader today.** The stored key is deliberate and cites the ruling in `docs/law/ai-sdk-surface.md` (the OpenRouter and Anthropic source-part row) and the boarded item `../../work/3574-web-search-source-parts-store-do-not-drop.md`. `pnpm unwired fields` will report the new schema key; judge it against the slot it flows into, the metadata sidecar, rather than as dead surface.
