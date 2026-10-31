---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-enforcement
---

# Add the testkit helpers whose absence made copying easier

## What

Build in the right testkit world and door: ids.typeId(prefix) in iso so contract and kit tests seed typed ids; forEachNonEmpty(rows, name, body) that throws at collection time on an empty set; a plugin provider row builder on PLUGIN_PROVIDER_ID_PREFIX; a PortableChat builder; the in-range card-frame style slice; an actor-entry builder; the chat character, persona and room builders; the public peer address constant; refuseWrites extended or a plantTrigger helper for fault injection; the shell-mount read list beside SECTION_PROCEDURES; setRootFontScale and channelName reachable from the e2e world; one seed-and-scope case table with its story wrapper; the e2e disclosure, details and scroll walkers; routeAuthConfig; abortProcedure on isTrpcRequestFor; minting settings and appearance state through the root caller; the e2e project names and E2E_PORT_OFFSET exported beside e2eRunPorts; a home for fallback-cases.ts.

## Why

Lanes copied wherever the right way was missing or harder than a literal.

## Done when

Each helper exists behind its door with its own test, and every copy the audits named uses it.

## Evidence

Built, each behind its door with its own test:

| Helper | Home and door |
| - | - |
| `typeId(prefix)` on the seeded ids | `tests/support/iso/ids.ts`, test in `tests/support/node/seeded-ids.test.ts` |
| `forEachNonEmpty` | `tests/support/iso/non-empty.ts`, iso door |
| `makePluginProviderRow`, `pluginProviderId` | `tests/support/iso/provider-rows.ts`, iso door |
| `IN_RANGE_CARD_FRAME_STYLE` | `tests/support/iso/card-frame-style.ts`, iso door |
| `makeRpgActorEntry`, `makeRpgActorIdentity` | already in `tests/support/iso/rpg-state.ts`; published on the iso door |
| `PUBLIC_PEER_ADDRESS` | `tests/support/iso/network.ts`, iso door; used across `tests/support` |
| `plantTrigger` | `tests/support/node/db-faults.ts`, composed door; `refuseWrites` is built on it; used by `tests/support/node/surface-data.int.test.ts` |

Also built, each with its own test:

| Helper | Home and door |
| - | - |
| `makeProviderRow` (any namespace; `makePluginProviderRow` is built on it) | `tests/support/iso/provider-rows.ts`, iso door |
| `makePortableChat`, `makePortableGame`, `makePortableMessage`, `makePortableTurnSnapshot` | `tests/support/node/factories/portable-chat.ts`, helpers door |
| `storeAvatar`, `addCharacter`, `addPersona`, `startRoom` | `tests/support/node/chat/cast.ts`, composed door |
| `createMemoryBackfillRoom`, `summaryReply` | `tests/support/node/factories/`, composed door |

The `tests/server/domain` suites use the peer address, provider rows, seeded ids, the PortableChat builder and the cast builders. The other domains still spell them by hand.
