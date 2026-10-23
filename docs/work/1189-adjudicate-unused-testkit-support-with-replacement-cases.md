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

## Selected inference surface: partial adjudication

The inference selection covers production-mode export findings, test-anchored `@public` declarations and the named loader hook. A clean default unused-export result does not establish a maintained test purpose.

| Selected group | Decision | Scope and remaining work |
| - | - | - |
| Unused forwarding specifiers | Remove forwarding sites only. | Preserve canonical type homes, enclosing signatures and production implementations. The alias-aware source census found no maintained consumer requiring these forwarding sites. |
| `resolveClaudeExecutable`, `rerankBatches`, `fitPairToWindow` | Localize the exports. | Keep the actual executable-availability and rerank implementations and their production callers. |
| Production-local exports hidden by test-anchor directives | Localize and remove stale directives. | Keep credential isolation, SDK history projection, attribution, rate-limit parsing, cache placement and backend registry bodies unchanged. Historical test references do not grant an unused export permanent authority. |
| `inference-runtime.ts` and its coupled inference forwards | Rebuild and remove the alternate assembly. | Preserve useful binding assertions through the actual root. Search fallback, fingerprint and promotion comparisons remain partial. |
| `connection-cache-oracle.ts` and its coupled inference forwards | Replace with actual-root CT inputs. | Preserve the selected cache controls and prose assertions without constructing a pseudo resolved connection. |
| Default-model aliases and their test inputs | Move genuine inputs and remove production aliases. | Existing isomorphic testkit support derives the selected model from canonical seed data; composed conformance and runtime-authority cases remain. |
| `__loadTransformersForTest` | Remove the unused property and branch. | Maintained native kernel cases use the worker-owned `kernelModule` execution seam and actual cache, tokenizer and scoring path. |
| Retained runtime, physical-execution and tooling identities | Keep. | These include the real error-kind axis, dynamic model-cache worker entry, SDK and model-kernel contracts, and the maintained offline tooling cache interface. Their canonical bodies and real composed tests remain. |

This selection does not complete inference restoration or qualify every reference embedding, cache or component case. Canonical runtime implementations and supported execution APIs remain. Affected compiler, runtime, lint and import checks pass.

### Embedding runtime and genuine inputs

The selected reference is `server/entry/compose/embedding-connection.test.ts`. Its business purposes remain useful; its assembled runtime does not fit production-root testing.

| Selected purpose | Decision | Maintained destination and boundary |
| - | - | - |
| Implicit embedding resolution without a binding raises a typed refusal | Rebuild. | The runtime-authority case uses the actual root and binding service, with positive physical execution and unchanged requests and accounting after refusal. |
| Bound rows resolve explicitly and implicitly to the same connection | Rebuild with the refusal case. | Compare actual runtime results before clearing the binding. Construct no domain factory. |
| Owned unbound rows resolve by explicit id | Keep and strengthen. | Preserve named-connection execution. Check explicit success after clearing the binding while implicit resolution refuses. |
| Foreign and missing rows have the same refusal | Keep public-root coverage. | The runtime-funding suite's final foreign/missing case checks authority and unchanged purchases. Its separate manually constructed pinned-resolver cases remain outside this selection. |
| The private adapter returns null for a missing named generation connection | Drop the private-harness assertion; preserve the business remainder. | Public typed refusal and generation/search behavior are different boundaries. Search fallback, fingerprint and promotion comparisons remain partial. |

Remove `inference-runtime.ts`, its package key and its inference forwards with the qualified root replacement. Keep canonical embedding resolution and execution policy in production. This selection does not establish coverage for every case in the search and embedding support modules.

Derive the parsed seed-model test input in the existing isomorphic inference-identity helper from canonical seed rows. Keep the composed conformance and runtime-authority cases. Remove the production input aliases without changing seed data or admission.

The worker-owned `kernelModule` execution seam and maintained native kernel cases supply the supported loader control. Remove the unused in-process loader property and branch, not the real loader or its security checks.

The selected root and native kernel cases pass. An isolated resolver defect that lets a cleared binding override an explicit connection fails the intended assertion. The source is restored exactly; compiler and import checks pass. Unselected search and pinned-resolver cases remain restoration work.

### Connection cache editor inputs

The selected reference is `client/features/credentials/components/connection-editor.ct.tsx`. The [cache editor CT](../../tests/client/features/credentials/components/connection-prompt-cache.ct.tsx) rebuilds its selected presentation and interaction cases through saved connections and actual router outputs.

| Selected purpose | Decision | Maintained assertion |
| - | - | - |
| Provider-managed implicit caching without invented controls or price claims | Rebuild. | The populated tier explains provider ownership and omits unsupported controls and pricing. |
| Modern prefix minimum retention and implicit-disable control | Rebuild. | The tier shows the provider minimum, omits marker TTL choices and sends the complete settings patch. |
| Automatic placement excludes manual placement | Rebuild. | Manual controls become disabled while applicable retention remains available; the outgoing settings document is checked. |
| Earlier OpenAI retention choices | Rebuild. | The opened menu omits unsupported retention and saves a supported choice. |
| Header-requested complete-response replay | Rebuild. | The real saved transport produces replay wording distinct from prefix caching. |
| Cache prose typography and reading measure | Rebuild at the selected widths. | Paragraph font, leading, cap and rendered width use the canonical token measurement helper. |

The browser story mounts the public Connections contribution through production providers and opens the actual row editor. Local Node capture calls the real connection and capability operations. Finite update responses come from actual writes, not a copied patch reducer.

Remove `connection-cache-oracle.ts`, its package key and the unused `detectModelFamily`, `curatedRows` and `synthesizeCapability` root forwards. Keep their canonical implementations and internal callers. The selected native CTs pass, including target-section screenshots at the selected widths. Isolated defects in manual-control exclusion, retention options, replay wording and prose measure fail their intended assertions. Sources are restored exactly; compiler and import checks pass. Other editor reference cases remain unreviewed.

### Connection transport type ownership

Inference derives its readonly `ConnectionTransport` and `ResponseMap` views from canonical `ConnectionTransportDoc` in `@orb/contracts/inference`. The schema owns the document fields; affected compiler programs check the inference projection. Secret-bearing resolved connections and execution ports remain inference-owned.
