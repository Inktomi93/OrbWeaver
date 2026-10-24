---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: server
---

# Boot-only cross-owner verbs live behind a boot door only entry/boot may import

## What

Boot steps call domain verbs that read or write across every owner: `listEnabledAcrossOwners` and `readInstalledPluginSlugs` in plugin, `backfillPluginProvenance`, `healLegacyBackgroundPins`, `ensureSeedThemes`, `ensureSystemDefaultPreset`, `migrateProseSlotVocab`, `reconcileOwnersMissingTimeline` in stats, `reclaimInFlightOnBoot` in workloads, and chat's `reclaimChatLocksOnBoot`, `migrateHandoffOfferVocab`, `migratePluginToolWireNames`. Since item 1272 they take a `DatabaseHandle`, so any entry file that holds a handle (for example a request route) could import one from the domain's front door and read every owner's rows, and no rule fails. dependency-cruiser cannot tell named exports of one barrel apart, so the barrel cannot carry the restriction.

## Why

A verb that crosses owners is a boot-time power; the cake should make it unreachable from a request path by construction, not by review.

## Done when

Each domain exports its boot-only verbs from a `boot` subpath of its door (`packages/server/src/domain/<name>/boot.ts` or the pattern the Core-0 template rules), the front door no longer exports them, `entry/boot/**` and `entry/lifecycle.ts` are the only allowed importers by a dependency-cruiser rule with a planted control (a request route importing the subpath fails), the seed tools and the testkit root import the subpath where they need it, and the boot suites pass with no assertion weakened.

## Evidence

Filled at landing: what ran and where its output is.
