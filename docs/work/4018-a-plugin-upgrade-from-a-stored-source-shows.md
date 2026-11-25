---
kind: work
status: doing
updated: 2026-11-25
priority: P3
area: plugin
lane: wt/agent-a71a211fcd2576220
---

# A plugin upgrade from a stored source shows what changes, and the showcase seeder never adopts a user's install

## What

An upgrade from a stored URL or Git source pins only to what checkForUpdates returned and swaps and reactivates a non-widening upgrade in one click with no view of the new manifest or code (routers/plugin.ts, verbs/upgrade.ts). The showcase seeder's isPristine (seeder/showcase.ts) is true when no seeded version is recorded, so it can adopt a user's URL or Git install of a shipped slug and reset its origin to upload. upgrade-from-stored-url.ts checks only that a source URL exists, not its origin, so a git row is fetched as a zip and rewritten as a URL row.

## Why

An owner cannot review what an upgrade installs, and a seeder rewriting a user's install contradicts the persistence comment that a user's URL install keeps its source.

## Done when

A stored-source upgrade shows the new version's manifest delta before it applies, the seeder adopts only rows it seeded, and a git row upgrades through its git source, each with a case.

## Evidence

Filled at landing: what ran and where its output is.
