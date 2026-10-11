---
kind: tooling
status: open
updated: 2026-10-11
priority: P2
area: tooling
plan: test-mirror
---

# A section 7.4 interface gate judges exported interfaces outside the section 7.4 homes

## What

no-inline-types judges only exported type aliases and zod consts (tooling/src/verify/gates/no-inline-types.ts:106) and no-inline-domain-interface only server domains, so an exported interface in server entry, infra or foundation or in inference is judged only by no-inline-wire-interface, and only when its name ends in a wire suffix. Owner ruling: client is a home for client-only views (the section 7.4 table), so client interfaces are out of its scope. Add a no-inline-types sibling over exported interfaces in server entry, infra, foundation and inference, baseline its hits as waivers naming a burn-down item, then narrow no-inline-wire-interface to shapes that cross a boundary and delete the hook-result and compose-bundle waivers it no longer needs (item 900 lane lists them).

## Why

Spine-TypeScript-and-Patterns section 7.4 bans exported interfaces outside the homes; the gates enforce it only for aliases and server domains, and the wire rule's name heuristic currently stands in for it with false positives.

## Done when

The sibling gate runs with a planted failing and passing control and a waiver budget row; no-inline-wire-interface no longer flags client hook results or entry/compose bundles; no exported interface outside a home is judged by nothing.

## Evidence

Filled at landing: what ran and where its output is.

Sites from the item 900 lane (no-inline-wire-interface waivers that are not wire): hook results packages/client/src/data/use-open-refinery.ts:79, data/use-start-chat.ts:54, features/chat/hooks/use-composer-utilities.ts:49, use-continue-turn.ts:46, use-generate-image.ts:29, use-guided-actions.ts:127, use-send-message.ts:43, use-stop-turn.ts:32, features/roster-preset/hooks/use-start-roster.ts:15; compose bundles packages/server/src/entry/compose/admin.ts:59, assets-character.ts:87, automation-plugin.ts:191, chat.ts:262, chat.ts:354, databank.ts:61, portability-runner.ts:105, regex.ts:88, rpg.ts:336, search-discovery.ts:117, services.ts:271, world-info.ts:61; local inputs client/src/features/chat/lib/composer-send-keys.ts:7, client/src/components/face-strip-fold.ts:20, server/src/infra/storage/cas.ts:33.
