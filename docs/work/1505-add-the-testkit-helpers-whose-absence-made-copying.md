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

Each helper with logic exists behind its door with its own test, each constant has one home, and every copy the audits named uses it.

## Evidence

Built, each behind its door:

| Helper | Home and door |
| - | - |
| `typeId(prefix)` on the seeded ids | `tests/support/iso/ids.ts`, test in `tests/support/node/seeded-ids.test.ts` |
| `forEachNonEmpty` | `tests/support/iso/non-empty.ts`, iso door |
| `makePluginProviderRow`, `pluginProviderId` | `tests/support/iso/provider-rows.ts`, iso door |
| `IN_RANGE_CARD_FRAME_STYLE` | `tests/support/iso/card-frame-style.ts`, iso door |
| `makeRpgActorIdentity`, `makeRpgActorVolatile` | `tests/support/iso/rpg-state.ts`, iso door |
| `PUBLIC_PEER_ADDRESS` | `tests/support/iso/network.ts`, iso door; used across `tests/support` |
| `plantTrigger` | `tests/support/node/db-faults.ts`, composed door; `refuseWrites` is built on it; used by `tests/support/node/surface-data.int.test.ts` |

Also built:

| Helper | Home and door |
| - | - |
| `makeProviderRow` (any namespace; `makePluginProviderRow` is built on it) | `tests/support/iso/provider-rows.ts`, iso door |
| `makePortableChat`, `makePortableGame`, `makePortableMessage`, `makePortableTurnSnapshot` | `tests/support/node/factories/portable-chat.ts`, helpers door |
| `storeAvatar`, `addCharacter`, `addPersona`, `startRoom` | `tests/support/node/chat/cast.ts`, composed door |
| `createMemoryBackfillRoom`, `summaryReply` | `tests/support/node/factories/`, composed door |
| `signedInBox`, `exportLibrary`, `restoreBundle`, `imageProvider`, `SIGNED_IN_ROUTE`, `WORKLOAD_DEADLINE_MS` | `tests/support/node/portability-box.ts`, composed door |
| `warningCodes`, `createQuietTimers` | `tests/support/node/inference-warnings.ts` (helpers door), `tests/support/iso/timers.ts` (iso door) |
| `SECRET_BOX_TEST_KEY` | `tests/support/node/secret-box-key.ts`, helpers and composed doors |

Every test file changed since the 30th outside `tests/ui`, `tests/client` and `tests/e2e` uses these helpers; none spells a copy by hand. Helpers with logic have a test beside them; the constants (`PUBLIC_PEER_ADDRESS`, `SECRET_BOX_TEST_KEY`, `SIGNED_IN_ROUTE`, `WORKLOAD_DEADLINE_MS`) are values with no logic to test.
