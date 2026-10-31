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

Built by the 1494 lane, each behind its door with a test:

- `SHELL_MOUNT_PROCEDURES` beside `SECTION_PROCEDURES` in `tests/support/node/ct-shell-procedures.ts`, on the `@orb/testkit/ct` door; `tests/support/node/ct-shell-procedures.test.ts` holds the list invariants. Four suites use it.
- `channelName` in `tests/support/node/appearance-channel-name.ts`, on the `ct` door, reachable from the e2e world; `appearance-channel-name.test.ts` covers every manifest row. `tests/client/lib/appearance-channel-names.ts` stays as a one-line re-export for the UI tier until item 1495 repoints `tests/ui/styles/ramp-enforcement.ct.tsx`.
- `routeAuthConfig` in `tests/support/node/route-auth-config.ts`, on the `ct` door; the cases are in `tests/support/browser/route-trpc.ct.tsx`. Twenty client suites use it. Two suites keep a live per-request read of the root (`_surface-harness.ts`, `platform-admin-reset-names.suite.ct.tsx`) because they track root state.
- `abortProcedure` beside `isTrpcRequestFor` in `tests/support/node/route-trpc.ts`, on the `ct` and `node/helpers` doors; its case is in `route-trpc.ct.tsx`. The five e2e fault closures use it.
- `E2E_PORT_OFFSET_ENV` beside `e2eRunPorts` in `tooling/src/floor/host/ports.ts`; `modes.ts` and `process-env.ts` read it. The surface-walk project names are composed inside `playwright-surface.config.ts`, which a spec cannot import without running the config, so no name constant exists to export.
- `setRootFontScale` and `enlargeUntilVisible` in `tests/support/browser/root-property.ts`, on the `browser/spec` door.
- `EDGE_FALLBACK_SCOPE` and `TONE_FALLBACK_SCOPE` in `tests/support/iso/theme-fallback-cases.ts`, on the `iso` door.
- The e2e disclosure, details and scroll walkers in `tests/support/browser/disclosure-walk.ts`.

Not built: the seed-and-scope case table (waits on 1495), and the other builders the What names.
