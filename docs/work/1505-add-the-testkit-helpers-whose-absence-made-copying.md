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

Filled at landing: what ran and where its output is.
