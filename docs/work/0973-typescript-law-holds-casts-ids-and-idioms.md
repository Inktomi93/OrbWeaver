---
kind: work
status: open
updated: 2026-10-12
priority: P2
---

# TypeScript law holds: casts, ids and idioms

## What

compose/chat.ts has an as-any cast behind a Biome suppression (Spine-TS section 4). no-loose-id-cast misses single-step brand casts such as string as ChatId, including untrusted plugin strings in infra/plugin-host/bridge-rpc.ts and domain/plugin/substrate/bridge.ts; no-raw-id judges only names ending in Id, missing bare id and plural Ids fields in contracts (theme, automation, chat assemble). Hand-rolled getOrInsert and set algebra, a JSON deep clone in contracts/rpg/extraction.ts, a spread-sort the gate cannot type, a second ST role map in the import domain, a second versioned-config lift loop in contracts/preset, two-member unions re-spelled below the gates' floor, bare-string aliases in contracts/refinery, exported ReturnType aliases outside context.ts, and a json() catch wrapper in client/data/auth-bootstrap.ts that dodges the parse gate. Fix the sites and widen the gates that should have caught them. Also: pass-through aliases in audited modules; WireRole declared three times in chat assembly (shape, injections, names); re-spelled kit time-unit constants; provider-rows re-declaring the ProviderRowOrigin union that db connection-bindings owns.

## Why

Each is a written rule the gates claim but miss.

## Done when

The source sites are fixed or derived; plugin inputs use canonical ID parsing; gate extension acceptance cases are recorded for the owning lane.

## Evidence

Source standardization only, by owner direction. Gate extensions belong to the gate rebuild.

- `no-loose-id-cast`: the plugin broker's `chatAt` cast guest input to ChatId without parsing.
- `no-raw-id`: `themeSchema.id` and `assembleTraceSchema.worldInfoActivated[].id` accepted unvalidated strings.
- `no-raw-id` negative case: `TriggerFact.worldInfo.entryIds` crosses the plugin sandbox as unbranded predicate data, as its contract requires.

Chat tool sets carry typed closures over the concrete registry result. Plugin chat and book inputs pass through canonical ID parsers.

The shared config lift walker preserves strict file rejection and permissive stored-config degradation. Extraction uses native structuredClone. Maps, sets, role projections and time units use their canonical homes.

`worldInfoDropped.id` remains a string because the budget includes synthetic injection keys such as `user:0`.
`AppFormInstance` mirrors TanStack's third-party function, which the TypeScript law permits.

Package typechecks passed for client, contracts, db, inference, kit, server and ui. The node and browser test-program typechecks passed.
Focused contract, auth, plugin, import, stats and tool-turn tests passed. The commit report names their scopes.

Integration preserves the strict dialog CT mirror while existing tests remain under the legacy folder.
The rebuilt directory is collected by CT, composite sweeps, ESLint and import-population.
Strict dialog CTs, the selected legacy CTs, the conflicted image/tool ordering suite and affected typecheck programs passed.
