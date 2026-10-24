---
kind: adr
status: active
updated: 2026-10-24
---

# Cross-owner boot verbs take a boot grant only boot importers can mint

## Context

Boot steps call domain verbs that read or write rows of every owner once at boot. A request route also holds a database handle and reaches the same domain front doors. The per-feature template in Core-0 §4 allows one front door per domain, so a second boot door is not available, and dependency-cruiser cannot tell the named exports of one door apart.

## Decision

A verb that reads or writes rows of every owner at boot takes BootDatabaseHandle, a nominal subtype of DatabaseHandle, so a plain handle fails tsc. bootDatabaseHandle(handle) in packages/db/src/client/wiring-capabilities.ts is the one mint: it registers the same admitted connection under a new frozen identity and records that identity in a grant registry. Each such verb recovers its connection through bootDatabaseForOwner, which refuses any handle the registry does not hold, so a plain handle cast to the boot type throws before a query runs. The mint reaches callers only through the @orb/db/wiring-boot door. The query-wiring-boot-admission dependency rule admits only the importers BOOT_GRANT_IMPORTERS names in .dependency-cruiser.ts, each with its reason: entry/lifecycle.ts mints once and passes the grant to the boot steps, the seed tools run those steps, and the testkit runs them and hands suites the grant through bootGrantFor. The ESLint no-restricted-imports entry BOOT_GRANT_IMPORT in eslint.config.ts bans importing or re-exporting bootDatabaseHandle from @orb/db/wiring-owner everywhere, so no owner-conversion importer can hand the mint past the door. The boot steps declare db: BootDatabaseHandle, so the grant flows down from the lifecycle and no step mints. A boot-only verb that touches no owner's rows keeps the plain handle; ensureSystemDefaultPreset writes only the ownerless shared row. This extends the D321 pattern: dependency-cruiser owns who may hold a database capability, and the type and the registry carry it. Homes: packages/db/src/client/wiring-capabilities.ts (the type, the mint and the registry), packages/db/src/client/wiring-boot.ts (the door), .dependency-cruiser.ts (the importer rule), eslint.config.ts (the wiring-owner ban), tests/support/node/boot-grant.ts (the test-side mint), each domain door's note beside its boot verbs (the criterion). Checks: tests/server/entry/boot/cross-owner-boot-verbs.test-d.ts, tests/db/client/wiring-capabilities.int.test.ts and tests/server/domain/chat/persistence/repair-stale-join-seq.int.test.ts.

## Consequences

A new cross-owner boot verb takes BootDatabaseHandle, recovers through bootDatabaseForOwner, and is added to the type test. A request route that needs a cross-owner read cannot get the grant; that read belongs in a boot step or an owner-scoped verb. Every owner-conversion importer of wiring-capabilities.ts, the domains and the request-path owners in transport and observability alike, recovers raw connections but cannot import the mint, so the grant is confined to the importers the rule names.

## Alternatives rejected

A boot.ts door per domain: the per-feature template in Core-0 §4 makes index.ts the only external import, and the #\* imports map resolves only directory front doors (D15). Minting inside each boot step: any entry file could then call the step with a plain handle. A type-only brand: a cast passes every static check, so the registry refuses it at runtime. Restricting named exports by review: no check fails.
