---
kind: work
status: open
updated: 2026-10-22
priority: P3
plan: test-foundation
---

# Adjudicate unused testkit support with replacement cases

## What

Classify unused testkit exports when selecting replacement cases. Keep production-derived support needed by the rebuild; delete copied adapters and obsolete aliases without maintained consumers.

## Why

Knip reports unused exports, not whether an unadopted helper is a legitimate rebuild foundation.

## Done when

Each selected export has a maintained consumer, a concrete replacement-case purpose, or a justified deletion. Do not add exports solely to keep external reference tests compiling.

## Evidence

`tests/support/browser/ct-data-providers.tsx` mounts production composition and has maintained CT consumers. It is not a legacy-only adapter. Evaluate factories and accessibility helpers by their actual implementation and intended cases.

## Selected chat support cases

The selected support purposes map to the maintained [composed-root suite](../../tests/server/domain/chat/composed-root.suite.int.test.ts). The suite constructs the production graph through `chat/composed.ts` and scripts physical provider responses.

| Selected purpose | Decision | Maintained home and assertion |
| - | - | - |
| Ordered replies for a multi-character room | Keep application coverage; drop the unused domain-output tape. | The composed-root list-policy case drives actual sends and checks assistant identities and ordered reply bodies. |
| Static prefix stability across turns | Keep the physical-wire case; drop `assertStaticPrefixStable`. | The composed-root prefix case compares nonempty system prefixes from actual provider requests after successful sends. |
| Token totals across turns | Keep persisted accounting coverage; drop `assertTokenTotalsConsistent`. | The same composed-root case checks the owner's persisted token totals against physical provider usage. |
| Provider server and rate-limit refusals | Keep physical refusal cases; drop unused error-producing tape methods. | Composed-root refusal cases drive raw server/rate-limit responses and inspect the actual failure and aborted lifecycle. |
| Durable lifecycle ordering | Keep `assertEventSequence` and its public testkit door. | The composed-root lifecycle case applies it to actual persisted chat events. |
| Quiet extraction floor, hidden-content strip, host card identity and outsider refusal | Rebuild through the production root; selected runtime qualified. | [Media and imagery authority](../../tests/server/domain/chat/verbs/media-and-imagery-authority.int.test.ts) drives actual imagery extraction, inspects physical requests and observes the real character operation. |
| Unselected macro and identity reference cases | Unreviewed. | This selection does not establish their restoration or qualify additional provider routes. |

The tape's testkit door and the chat door's `RunChatTurnOp`, `TurnEconomics`, `TurnRequest` and `TurnStreamChunk` forwards have no maintained consumer. Keep their canonical application definitions.

The selected composed-root and media-authority cases pass. An isolated summary-strip bypass exposes hidden content on the physical provider wire and fails the intended assertion. The production source is restored exactly. Affected compiler, lint and import checks pass. Unselected reference cases remain unreviewed.

## Selected relay and wire-facade support

| Selected purpose | Decision | Maintained home and assertion |
| - | - | - |
| Relay pin verification, cache reuse and restart | Keep native coverage; drop the unused fake relay helper and its unused type forwards. | [Share graph](../../tests/server/entry/compose/share-graph.int.test.ts) exercises the actual verifier, cache and child process, including a corrupt-download refusal. |
| Relay host admission, owner authority and link disclosure | Keep actual application coverage. | Share-graph cases and [auth metadata](../../tests/server/entry/http/auth-meta.int.test.ts) check real admission and authenticated link disclosure. |
| Relay shutdown and external execution lifetime | Keep native child and held-download settlement cases. | Share-graph cases observe joined release rather than a fabricated stopped flag. |
| Other relay lifecycle reference permutations | Unreviewed. | Compare meaningful uncovered cases individually; this helper retirement does not complete relay restoration. |
| Preset and inference wire-facade reference identity | Drop the identity-only test and unused compatibility forwards. | Canonical schemas and vocabulary remain in `@orb/contracts`. Maintained contract and production-root tests own validation and output behavior; the removed test asserted only that a forwarding export returned its source object. |

These decisions preserve canonical application definitions. No maintained app, tool, SDK or template consumer requires the selected compatibility aliases.
