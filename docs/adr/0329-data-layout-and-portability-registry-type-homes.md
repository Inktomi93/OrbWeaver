---
kind: adr
status: active
updated: 2026-10-19
---

# Data-layout and portability registry shapes have exact homes

## Context

D324 sends a server factory shape that crosses tiers to a sanctioned home, and D327 sanctions only the env contract. The data-layout API crosses from foundation into entry. The portability registry value shapes type entry constants, not a function signature. The entry request env reaches its registrars only as a Hono generic, and the client imports the router type from transport.

## Decision

Four exact paths are type homes. `packages/server/src/foundation/data-layout/contract.ts` holds the data-layout declarations that cross into entry, `DataLayout` and `DataLayoutKeeperKey`, with their supporting tuples, input and legacy-entry shapes. `packages/server/src/entry/contract/portability.ts` holds the value shapes of the `packages/server/src/entry/compose/portability.ts` registries. `packages/server/src/entry/http/contract/request-env.ts` holds `PrincipalEnv`, the Hono request env every entry route registrar shares. `packages/server/src/transport/trpc/router.ts` holds `AppRouter`, the client's type-only tRPC bridge, beside the router value it reflects. All four are exact paths. They admit no other foundation API, generic contract folder or wire contract. Spine-TypeScript section 7.4 holds the rows, and native placement admits these four files by exact path only.

## Consequences

A sibling module in any of these folders stays a placement finding. The registrar and router modules lose their placement waivers. A new cross-tier foundation API or entry registry needs its own ruling. Supported type exports keep their type-only reexports.

## Alternatives rejected

Admit every contract folder in the server tiers: a home the table does not sanction. Keep the registry shapes in the registry module: D324 owns only signature shapes, and admitting the module would admit everything declared there.
