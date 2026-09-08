---
kind: review
status: active
updated: 2026-09-08
---

# tRPC procedure liveness adjudication

## Verdict

The pre-cleanup `pnpm ast unwired --json` census reports 15 candidates from 424 registered procedures after scanning 7,326 files with zero skipped. None is a scanner false positive: no production client source reads any of the 15 through a static proxy chain or `Trpc[...][...]` type. Six are intentional supported surfaces with specific product or owner evidence. Nine are removable tRPC wrappers because their former client affordance was replaced or their output is already supplied by the live facade. Removing a wrapper does not automatically authorize deleting the domain verb behind it.

| disposition | procedures |
| - | - |
| intentional supported surface | `connection.getCatalog`, `connection.getAgentSdkCatalog`, `databank.attachToCharacter`, `databank.detachFromCharacter`, `discovery.swipeHotspots`, `discovery.similarChats` |
| confirmed removable tRPC wrapper | `automation.reorderRules`, `automation.createRule`, `automation.updateRule`, `automation.setBudgets`, `automation.getBudgets`, `discovery.themes`, `plugin.upgradeFromUrl`, `regex.getScript`, `tag.bulkAttachTag` |
| live scanner false positive | none |

This review itself made no source changes. The owner subsequently authorized the worthwhile cleanup; root approved the nine listed wrapper removals and their coupled tests/comments under #1891. The six intentional surfaces and independently consumed domain behavior remain preserved.

## Search boundary

`pnpm ast unwired --json` re-derived the same 15 names as the prior snapshot, with a fresher corpus count: `dts:3`, `mts:1`, `ts:5917`, `tsx:1405`, `scanned:7326`, `skipped:0`, `status:complete`. The lens reads production client files only and recognizes dot, optional-dot, string-indexed value access, and `Trpc["namespace"]["procedure"]`; its implementation and declared blind spot are at `tooling/src/ast/ops/wiring.ts:13-31`, `:153-217`, and `:243-277`. It deliberately does not count tests or computed keys whose value cannot be known statically.

The second method was an exact literal sweep across `packages`, `tests`, `tooling`, `scripts`, `playwright`, and `docs` for every fully qualified procedure name, followed by narrower per-domain searches for each bare member. This found the transport declarations, direct transport/domain tests, cross-tenant caller entries, component-test route maps, and historical/design mentions. It found no production client invocation for any candidate. Dynamic string-keyed test routes were inspected separately: `discovery.themes` appears in route maps at `tests/client/features/discovery/components/corpus-content.ct.tsx:93,392` and `tests/client/features/discovery/surfaces/corpus-home-surface.ct.tsx:96,898`, but the mounted production component reads themes from `discovery.home`, not that route (`packages/client/src/features/discovery/surfaces/corpus-home-surface.tsx:171-180,295-307`).

The production-negative claim is bounded to the checked-in TypeScript/TSX application and its checked-in tests/tools/docs. A remote client outside this repository or an untracked local script could call any registered tRPC procedure; Orbweaver has no published external-client compatibility contract in the inspected source. The lens's 409 non-candidates are the planted production-positive control for the same enumeration and client-consumption mechanism; the run would not have returned only these 15 if it had failed to see the ordinary client proxy shape.

## Candidate dispositions

### Automation: five removable wrappers

`automation.reorderRules`, `createRule`, `updateRule`, `setBudgets`, and `getBudgets` are remnants of the older manual rule-editor and per-chat budget-panel surface. Their declarations remain at `packages/server/src/transport/trpc/routers/automation.ts:48-92,185-209`, and the router header still claims those panels consume them. The current client contradicts that claim:

- The live chat surface defines itself as the rule list, preset picker, and recent fire log (`packages/client/src/features/automation/components/rules-section.tsx:1-22`), renders `listRules` plus `RulePresetPicker` (`:145-179`), and exposes no direct create, edit, reorder, or per-chat budget control.
- The current mutation module contains enable, refusal preference, delete, test, run-now, and preset-mint doors (`packages/client/src/features/automation/lib/rule-mutations.ts:53-112,149-162`); none of the five candidate procedures appears there.
- The later ruled interaction program fixes B2 as “rules list + preset picker” and says v1 knob editing is re-mint, while post-mint editing is an unbuilt flip shape (`docs/reviews/stickler/2026-08-24-final-interaction-specification-RULED.md:498-505`). This supersedes the older A8 manual-editor posture.
- Direct calls now exist only in transport tests and the cross-tenant sweep: create/set/get wire-through at `tests/server/transport/trpc/routers/automation.test.ts:57-158`; security callers at `tests/server/transport/cross-tenant-sweep.suite.int.test.ts:1198-1275,1303-1312`; setup/witness reads at `:1996-2020,2536-2541`.

Remove only the five tRPC properties first. The domain `createRule` remains live beneath `createRuleFromPreset` (`packages/server/src/transport/trpc/routers/automation.ts:118-134` and the domain preset verb); domain/schema pruning for update, reorder, and per-chat budget writes requires a separate import/backup/engine audit. The router's opening comment and the affected transport/cross-tenant fixtures are coupled cleanup.

### Connection: two intentional surfaces under an explicit ruling

`connection.getCatalog` and `connection.getAgentSdkCatalog` are declared at `packages/server/src/transport/trpc/routers/connection.ts:12-38`. Production client code does not call either. Refresh mutations instead invalidate the client-facing `getModelsForSource` and `resolveChatCapability` facades, and the current comment explicitly says `getCatalog` has no client consumer (`packages/client/src/features/user-admin/hooks/use-admin-mutations.ts:86-101`).

Client tests still spell `connection.getCatalog.queryKey()` in invalidation fixtures (`tests/client/data/invalidation.test.ts:446,512`), but constructing a query key sends no request and is not a product consumer. No test or source spelling of `connection.getAgentSdkCatalog` traverses the router.

An existing owner record nevertheless says: “ANSWERED, not dead … Deliberate boot-only readers. No action.” (`docs/history/retro-workboard-2026-08-08.md:1575-1577`). The boot path does call both service methods for their cache-warming side effects (`packages/server/src/entry/lifecycle.ts:437-448`). That evidence proves the **service reads** live, not the tRPC wrappers: boot calls `built.services.connection.*` directly and never invokes the router.

Disposition: keep both as intentional supported surfaces because the explicit owner ruling has not been replaced. This is a ruling-evidence fork for the orchestrator: if the ruling meant to preserve only boot warming, both tRPC wrappers are removable while the service methods stay; if it meant to preserve a browse API for future/manual clients, the wrappers stay and should remain visible as intentional candidates until a real client or an honest exemption policy is chosen. Do not add `@server-only`: `tooling/src/ast/ops/wiring.ts:219-241` defines that marker for a procedure serving server/ops callers, and no server/ops caller traverses these RPC properties.

### Databank: two intentional character-rack procedures

`databank.attachToCharacter` and `databank.detachFromCharacter` are declared at `packages/server/src/transport/trpc/routers/databank.ts:112-122`. They have no current production client caller, but they are not superseded behavior:

- The databank client design names the character rack as an explicit final, droppable S6 stage and the exact contribution anchor it will use (`docs/design/databank-surface-spec.md:251-259`). Its authority matrix separately pins both procedures as owner-of-document plus owner-of-character actions (`:294-303`).
- Character junctions already feed the active-chat retrieval union. The attach verb states that contract and enforces ownership of both ends before writing (`packages/server/src/domain/databank/verbs/attach/attach-to-character.ts:1-30`); the detach verb gates the character before its idempotent delete (`packages/server/src/domain/databank/verbs/attach/detach-from-character.ts:1-25`).
- Domain behavior is covered by `tests/server/domain/databank/verbs/attach/attach-to-character.int.test.ts:1-67` and `detach-from-character.int.test.ts:1-35`; the transport authority path is exercised at `tests/server/transport/cross-tenant-sweep.suite.int.test.ts:814-819,2097-2100,2292-2297`.

Disposition: intentional supported API for the unbuilt character rack. Deleting it would strand an explicitly designed and already retrieval-active scope rather than remove superseded residue.

### Discovery: two intentional chat drills, one removable duplicate read

`discovery.swipeHotspots` and `discovery.similarChats` are intentional per-chat analytics. Their routes and owner filters are at `packages/server/src/transport/trpc/routers/discovery.ts:120-124,172-193`; their domain behavior is covered by `tests/server/domain/discovery/verbs/swipes.int.test.ts:62-110` and `similar-chats.int.test.ts:58-121`; and the cross-tenant transport callers are at `tests/server/transport/cross-tenant-sweep.suite.int.test.ts:714-731`. The corpus consolidation review explicitly leaves both for a future chat-scoped inspector because forcing chat-specific reads into the owner-wide Corpus surface is wrong (`docs/reviews/stickler/2026-08-18-corpus-consolidation-proposal.md:198-203`). Disposition: intentional supported surface.

`discovery.themes` is different. Its tRPC property at `packages/server/src/transport/trpc/routers/discovery.ts:136-138` has no production caller. The current Corpus home obtains both theme lists from `discovery.home.sceneThemes/arcThemes` and renders those values (`packages/client/src/features/discovery/surfaces/corpus-home-surface.tsx:171-180,295-307`). The apparent dynamic callers are only unused component-test route-map entries. A source comment claiming that the browse view and context tabs consume `discovery.themes` is stale (`packages/client/src/features/discovery/surfaces/corpus-home-surface.tsx:52-55`).

Disposition: remove the tRPC wrapper and the stale route-map/comment fixtures. Keep the domain `themes` read: composed `home` and `themeDetail` views consume it internally through `ViewsDeps` (`packages/server/src/domain/discovery/service.ts:44-51`; `packages/server/src/domain/discovery/verbs/views.ts:38-39,66`). The existing deferred test-presence row for `discovery.themes` at `tooling/src/verify/gates/contract-verb-presence.ts:36` must be removed or retargeted with the procedure.

### Plugin: removable caller-supplied URL upgrade wrapper

`plugin.upgradeFromUrl` is declared at `packages/server/src/transport/trpc/routers/plugin.ts:108-140`. It is invoked only by the cross-tenant sweep (`tests/server/transport/cross-tenant-sweep.suite.int.test.ts:1331-1338`) and its domain tests (`tests/server/domain/plugin/verbs/upgrade-from-url.int.test.ts:25-77`). The live client uses `plugin.upgradeFromStoredUrl` and `plugin.upgradeFromShowcase` (`packages/client/src/features/plugin/lib/plugin-mutations.ts:103-145`). The stored-url verb is the true one-click update: it loads the owned row, uses its remembered URL, and applies the same re-consent wall (`packages/server/src/domain/plugin/verbs/upgrade-from-stored-url.ts:1-35`).

The earlier 33-procedure reconciliation classified the seven then-unwired plugin procedures as “closed-intentional-dormancy” and forbade bulk deletion (`docs/history/retro-workboard-2026-08-14.md:918-923`). This individual disposition does not reverse that family ruling silently: `upgradeFromStoredUrl` and its live client surface landed later, on 2026-08-28 (`d8c8b0aa5`, `95541ea70`), and now supersede this procedure's shipped update role. The other plugin procedures are outside this candidate set and remain untouched.

Disposition: remove the caller-supplied-URL tRPC wrapper. The newer stored/showcase paths cover the shipped update affordances without asking a user to re-paste or substitute a URL. Whether to delete the domain `upgradeFromUrl` verb as well is a separate security/API decision because it implements a distinct guarded arbitrary-URL operation and has direct domain coverage.

### Regex: removable detail wrapper, live domain ownership gate

`regex.getScript` is declared at `packages/server/src/transport/trpc/routers/regex.ts:45-48`. No production client calls it; the regex surfaces select full script rows from `regex.listScripts` (`packages/client/src/features/regex/hooks/use-regex-collection.ts:18-72`, `packages/client/src/features/regex/surfaces/regex-member-surface.tsx:43-55`). Its only router consumers are the cross-tenant probe and witness (`tests/server/transport/cross-tenant-sweep.suite.int.test.ts:1551,2336,2458`).

Disposition: remove the tRPC detail wrapper. Keep the domain `getScript`: it is an explicit owner gate and is reused as the security contract for reverse-roster behavior (`packages/server/src/domain/regex/verbs/scripts/get.ts:1-17`, `packages/server/src/domain/regex/verbs/attachments/list-script-usage.ts:1-12`), with domain coverage at `tests/server/domain/regex/verbs/scripts/get.int.test.ts:12-38`.

### Tag: removable bulk-accept wrapper

`tag.bulkAttachTag` is declared at `packages/server/src/transport/trpc/routers/tag.ts:98-116`. It originally drove an “Accept all” tag-suggestion affordance (`4b9d584db`, 2026-07-21), but the current surface exposes one accept and one dismiss action per suggestion and has no bulk door (`packages/client/src/features/character/components/character-tag-suggestions.tsx:43-89`). The only current tRPC caller is the cross-tenant probe at `tests/server/transport/cross-tenant-sweep.suite.int.test.ts:666-667`; domain atomicity/ownership behavior is covered at `tests/server/domain/tag/verbs/attach.int.test.ts:133-188`.

Disposition: remove the tRPC wrapper. The domain bulk verb can be pruned only after checking non-tRPC composition/import paths; the present literal sweep found no production call outside the router, but domain removal has a larger coupled contract/service/test surface than this procedure review authorizes.

## Cleanup order if approved

1. Remove the nine router properties and the stale comments that claim present consumers.
2. Update direct router tests, cross-tenant classification/call tables, component-test route maps, and `contract-verb-presence` rows in the same change; do not weaken the sweep's exhaustive-registration assertion.
3. Re-run `pnpm ast unwired --json`. The expected candidate set is the six intentional rows, unless the connection ruling is resolved toward wrapper removal.
4. Decide whether intentional rows should remain visible review candidates or receive a narrowly truthful marker. A future marker must describe an actual procedure consumer class; boot-time direct service use is not `@server-only` RPC consumption.
5. Audit domain-level pruning separately for automation update/reorder/chat budgets, plugin caller-supplied upgrade, and tag bulk attach. Preserve the internal domain methods proven live above.

No framework or generated registry is warranted. The existing lens correctly found the stale wrappers; the worthwhile work is deleting approved properties and repairing their coupled exhaustive tests.
