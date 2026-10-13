---
kind: work
status: doing
updated: 2026-10-12
priority: P1
lane: codex/compose-chat-964
plan: test-foundation
---

# Compose holds wiring only: queries and rules move to their domains

## What

Closures inside packages/server/src/entry/compose run database queries and carry business rules: resolveUserPublics, resolveConnectedPersona and the present-host read in chat.ts, the large rpg.ts closures, automation-plugin.ts, search-discovery.ts, the seat writes in session-entries.ts, and query closures in co-participant-assets.ts, emit-chat-changed.ts, event-bus.ts, regex.ts, preset-usage.ts, visible-rooms.ts, roster-preset.ts and imagery.ts. Move each to its owning domain as an exported function, or as an injected op where it crosses domains, and add a gate that a compose module calls no drizzle query builder and holds no branching beyond wiring. Build the gate first, red against the current tree; its findings are the work set. When it lands, Core-0 sections 5 and 9 and Spine-Testing section 2 describe the testkit shape (with 958).

## Why

Tier-5 law says entry owns no business logic. Rules hidden in compose closures are what test harnesses copied, and the server test composition root (958) cannot test logic it cannot reach.

## Done when

The gate holds with planted controls; no compose module runs a query or carries a rule; each moved rule is exported from its domain and called by compose; item 958 starts from the cleaned compose.

## Evidence

Chat and search/discovery moves landed at `980a8e07bd` after review and the authenticated-Principal correction. Automation/plugin landed at `292d99464e`, including canonical contracts and domain-cycle corrections. Focused behavior, affected native programs and the server import graph pass. The budget file owns the remaining compose count; this item stays open.

`codex/compose-chat-964` owns services/runtime/embedding wiring and the coupled import builder. The administrative policy item owns the independent admin, update, refinery and recorder batch on `codex/compose-policy-995`. Services wiring stays with its current lane; the primary agent integrates required changes. Other adapters and boot remain open. Do not build the server harness before this boundary is clean.

The native server import graph confirms the lower-contract and injected-resolver corrections without rule relaxation. Preserve canonical lower-package shapes, consumer-owned narrow ports and sibling front doors in the remaining legs.

The gate is `compose-wiring-only` (`tooling/src/verify/gates/compose-wiring-only.ts`); its header defines a rule. `pnpm check:structure --check compose-wiring-only` reports one finding per handed-out function or helper, so the counts below are functions, not decisions.

- Work set on the gate's first run: the findings by file: rpg 51, chat 41, automation-plugin 25, search-discovery 19, services 18, room-reach 10, portability 9, assets-character 8, imagery 6, memory-embedding-ops 5, update-check 5, vector-sweep-ops 5, embedding-connection 4, portability-runner 4, session-entries 4, side-gen-params 4, materialize-background 3, admin 2, automation-watcher 2, co-participant-assets 2, databank 2, gallery-character-ops 2, inline-reply-image 2, plugin-chat-reads 2, preset-usage 2, refinery 2, resolve-image-ref 2, retrieval-degrade 2, seed-avatar-ops 2, visible-rooms 2, and 1 each in chat-tools, debug-inspectors, emit-chat-changed, event-bus, regex, roster-preset and share-seating.
- The subject includes every `entry/**` function compose reaches, including auth, boot and import drivers. Remaining sites carry `@orb-waive compose-wiring-only(...)` markers naming this item. The shrink-only row in `tooling/src/verify/lib/waiver-budget.ts` owns the current count; this item lands when it reaches zero.
