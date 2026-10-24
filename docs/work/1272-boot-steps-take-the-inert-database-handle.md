---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: server
---

# Boot steps take the inert database handle

## What

After item 0971, `ENTRY_DRIVERS` in `.dependency-cruiser.ts` still exempts the boot steps whose domain doors take a raw `Db` (settings, stats, preset, character, plugin, chat, automation and workloads boot ops, plus `boot-owner`) from `entry-wiring-no-query-capability`. Each such door is one more entry file holding query capability.

## Why

Tier-5 says a compose module runs no query; an exemption list that stays long is the rule not being met.

## Done when

Each listed door takes a `DatabaseHandle`; its row leaves `ENTRY_DRIVERS`; the list holds only the files that own the physical database (`index`, `lifecycle`, the boot barrel, `migrate`, `migrate-data-layout`), each with its reason; a planted `@orb/db` import in a former member fails the rule; the boot suites pass with no assertion weakened.

## Evidence

Filled at landing: what ran and where its output is.
