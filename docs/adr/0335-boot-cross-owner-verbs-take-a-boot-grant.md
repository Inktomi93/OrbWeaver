---
kind: adr
status: active
updated: 2026-10-24
---

# Cross-owner boot verbs take a boot grant only boot importers can mint

## Context

Boot steps call domain verbs that read or write rows of every owner once at boot. Each verb took the inert DatabaseHandle, so any entry file that holds a handle, such as a request route, could call one through the domain front door and no check failed. The per-feature template in Core-0 §4 allows one front door per domain, so a second boot door is not available, and dependency-cruiser cannot tell the named exports of one door apart.

## Decision

A verb that reads or writes rows of every owner at boot takes BootDatabaseHandle, a nominal subtype of DatabaseHandle, so a plain handle fails tsc. bootDatabaseHandle(handle) in packages/db/src/client/wiring-capabilities.ts is the one mint; it registers the same admitted connection under a new frozen identity. Callers reach it through the @orb/db/wiring-boot door, and the query-wiring-boot-admission dependency rule admits only the importers BOOT_GRANT_IMPORTERS names in .dependency-cruiser.ts, each with its reason: entry/lifecycle.ts mints once and passes the grant to the boot steps, the seed tools run those steps, and the testkit and server suites prove them. The boot steps declare db: BootDatabaseHandle, so the grant flows down from the lifecycle and no step mints. A boot-only verb that touches no owner's rows keeps the plain handle; ensureSystemDefaultPreset writes only the ownerless shared row. This extends the D321 pattern: dependency-cruiser owns who may hold a database capability, and the type carries it. Homes: packages/db/src/client/wiring-capabilities.ts (the type and the mint), packages/db/src/client/wiring-boot.ts (the door), .dependency-cruiser.ts (the rule), each domain door's note beside its boot verbs (the criterion). Checks: tests/server/entry/boot/cross-owner-boot-verbs.test-d.ts and tests/db/client/wiring-capabilities.int.test.ts.

## Consequences

A new cross-owner boot verb takes BootDatabaseHandle and is added to the type test. A request route that needs a cross-owner read cannot get the grant; that read belongs in a boot step or an owner-scoped verb. Domains import wiring-capabilities.ts as query owners and can reach the mint there; they already recover the raw connection, so the grant constrains entry and transport, not owners.

## Alternatives rejected

A boot.ts door per domain: the per-feature template in Core-0 §4 makes index.ts the only external import, and the #\* imports map resolves only directory front doors (D15). Minting inside each boot step: any entry file could then call the step with a plain handle. Restricting named exports by review: no check fails.
