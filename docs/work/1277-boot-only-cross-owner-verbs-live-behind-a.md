---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: server
---

# Boot-only cross-owner verbs live behind a boot door only entry/boot may import

## What

Boot steps call domain verbs that read or write rows of every owner once at boot: `listEnabledAcrossOwners` and `readInstalledPluginSlugs` in plugin, `backfillPluginProvenance` in character, `healLegacyBackgroundPins` and `ensureSeedThemes` in settings, `ensureSystemDefaultPreset` and `migrateProseSlotVocab` in preset, `reconcileOwnersMissingTimeline` in stats, `reclaimInFlightOnBoot` in workloads, `reclaimChatLocksOnBoot`, `migrateHandoffOfferVocab`, `migratePluginToolWireNames`, `repairStaleJoinSeq` and `hasRedeemableInvite` in chat, `migratePluginToolWireNames` in automation. Each takes a `DatabaseHandle`, so any entry file that holds a handle (a request route) can import one from the domain's front door and read every owner's rows, and no rule fails. `Core-0-Architecture-and-Structure.md` §4 rules one front door per domain, so a second `boot` door is not available, and dependency-cruiser cannot tell named exports of one barrel apart.

## Why

A verb that crosses owners is a boot-time power; the cake closes an impossible case with a type, and a compile-time check outranks a dependency rule.

## Done when

- `@orb/db` mints a branded boot handle (a nominal type over `DatabaseHandle`, minted by one function beside `databaseHandle` in `packages/db/src/client/wiring-capabilities.ts`), and each verb above takes that brand instead of a plain `DatabaseHandle`; a verb whose only caller is `entry/boot` but which does not cross owners keeps the plain handle, with the criterion stated in each domain door's header.
- A dependency-cruiser rule lets only `entry/boot/**`, `entry/lifecycle.ts`, the seed tools under `tooling/src/seed/` and the testkit root import the mint, with the reason per allowed importer; a planted import of the mint from a request route under `entry/http/` fails (shown, removed).
- A planted call of a boot verb with a plain `DatabaseHandle` fails `tsc` (shown, removed).
- `tests/support/node/corpus.ts` mints the boot handle where it calls `listEnabledAcrossOwners`; no other test or tool path changes.
- One ledger row records the boot capability and names the mint and the rule.
- The boot suites and each touched domain's suites pass with no assertion weakened.

## Evidence

Filled at landing: what ran and where its output is.
