---
kind: work
status: open
updated: 2026-10-12
priority: P2
---

# TypeScript law holds: casts, ids and idioms

## What

compose/chat.ts has an as-any cast behind a Biome suppression (Spine-TS section 4). no-loose-id-cast misses single-step brand casts such as string as ChatId, including untrusted plugin strings in infra/plugin-host/bridge-rpc.ts and domain/plugin/substrate/bridge.ts; no-raw-id judges only names ending in Id, missing bare id and plural Ids fields in contracts (theme, automation, chat assemble). Hand-rolled getOrInsert and set algebra, a JSON deep clone in contracts/rpg/extraction.ts, a spread-sort the gate cannot type, a second ST role map in the import domain, a second versioned-config lift loop in contracts/preset, two-member unions re-spelled below the gates' floor, bare-string aliases in contracts/refinery, exported ReturnType aliases outside context.ts, and a json() catch wrapper in client/data/auth-bootstrap.ts that dodges the parse gate. Fix the sites and widen the gates that should have caught them.

## Why

Each is a written rule the gates claim but miss.

## Done when

The sites are fixed or derived; no-loose-id-cast judges single-step brand casts; no-raw-id judges bare and plural ids; each widened gate has planted controls.

## Evidence

Filled at landing: what ran and where its output is.
