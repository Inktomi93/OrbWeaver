---
kind: review
status: active
updated: 2026-09-08
---

# Independent review — stale tRPC wrapper cleanup (#1891)

Review target: the uncommitted #1891 cleanup in
`.claude/worktrees/codex-world-gate-integration` at baseline
`f4e57d085a81d2a2f853c8e3bddd9a260e9bf3b4`. The review covered only the five changed tRPC routers,
the cross-tenant sweep, the automation router test, the Corpus home source, and the three changed client
component tests named in the review brief. Concurrent registry-adoption and freshness work was excluded.
No source, board, staging, commit, or generator state was changed by this review; this report is its only
tree write.

## Findings

None.

## Wrapper and domain boundary

The delta removes exactly these nine tRPC properties:
`automation.reorderRules`, `automation.createRule`, `automation.updateRule`, `automation.setBudgets`,
`automation.getBudgets`, `discovery.themes`, `plugin.upgradeFromUrl`, `regex.getScript`, and
`tag.bulkAttachTag`. The surrounding router edits remove only schemas/imports and comments made dead by
those properties. The surviving procedures keep their previous ladder rung, input validation, principal
source, and domain delegation. In particular, the plugin URL preview/install and stored-URL update doors
remain mutations, so their egress remains behind the mutation/CSRF posture described by the transport law.

The domain front doors and their behavior remain intact and unchanged. `AutomationService` still exposes
and composes `createRule`, `updateRule`, `reorderRules`, `setBudgets`, and `getBudgets` in
`packages/server/src/domain/automation/{contract/service,service}.ts`. The discovery service still exposes
`themes`, wires it to `readThemes`, and injects it into both `home` and `themeDetail` in
`packages/server/src/domain/discovery/{service,verbs/views}.ts`. The plugin caller-supplied-URL upgrade,
regex owner-gated detail read, and tag bulk attach remain composed in their domain services. A diff over
the five domain trees and their domain-test trees was empty.

The `discovery.themes` contract-coverage debt is therefore still real rather than stale:
`tooling/src/verify/gates/contract-verb-presence.ts:36` retains the `discovery.themes` DEFERRED row because
the service method survives and no domain test invokes that exact service member. Removing only the tRPC
wrapper does not satisfy or obsolete that obligation.

## Cross-tenant and surviving coverage

The cross-tenant fixture now seeds its two automation rows through the composed `AutomationService` with
an explicit test principal for `OWNER_USER_ID`. This is setup only: no production transport property was
reintroduced, the real `createRule` host gate still executes for the chat-scoped row, and the global row
still derives its owner from the principal. Every surviving wire probe continues through `AppCaller` and
the real tRPC middleware/router graph as the stranger.

The removal of the five obsolete automation probes also removes only their own post-write witnesses. The
surviving chat and owner-global rule checks still cover `createRuleFromPreset`, `setRuleEnabled`,
`setRuleSuggestOnRefusal`, `deleteRule`, `testRule`, `runRuleNow`, `listFires`, `listRules`,
`listChatActivity`, and the owner-global partition. The owner-budget two-principal/two-number witness is
unchanged.

The deleted `regex.getScript` transport read was not the sole integrity witness. The sweep now reads the
same owned full-row projection through surviving `regex.listScripts`, selects the seeded id, asserts the
row exists, and keeps the name, enabled, placement, attachment, and ordering checks. The domain
`getScript` test still proves the owner/stranger collapse used by `listScriptUsage`.

The exhaustive guard remained live: the independently run cross-tenant suite enumerated the actual
`appRouter` procedures, and `PROBES union EXEMPT` had neither uncovered procedures nor stale entries. Its
full stranger drive and post-sweep integrity rereads also passed.

## Client fixtures

The Corpus production surface already reads story-theme rows from `discovery.home.sceneThemes` and
`arcThemes`; it never reads `discovery.themes`. The two discovery component-test files now remove only the
unused `discovery.themes` route responders. Their rendered theme controls continue to use the populated
`discovery.home` payload. The automation component test removes only a recorder assertion that the deleted
`automation.updateRule` property was not called; its positive assertion on the surviving
`automation.setRuleSuggestOnRefusal` request and exact payload remains.

The three component tests were not rerun in this review because the brief required coordination before
starting Playwright CT. Their checked-in route shapes and the removed RPC types were independently checked
by `typecheck:tests-dom`. The builder supplied a green receipt for 106 exact CTs; that is recorded as
supporting evidence and was not repeated or presented as an independent run.

## Independent verification receipts

- `pnpm ast unwired --json` — 415 procedures enumerated; exactly six candidates remain:
  `connection.getCatalog`, `connection.getAgentSdkCatalog`, `databank.attachToCharacter`,
  `databank.detachFromCharacter`, `discovery.swipeHotspots`, and `discovery.similarChats`. Corpus:
  7,326 TypeScript/TSX/declaration files scanned, zero skipped, status complete.
- `pnpm test:scoped` over the changed cross-tenant and automation-router tests plus the retained automation,
  discovery intentional-candidate, plugin URL-upgrade, regex detail-read, and tag bulk-attach domain suites
  — 12 files, 70 tests passed, no type errors. Artifact:
  `reports/runs/test/codex-world-gate-integration-3318077-2026-09-08T14-46-44-544Z/test-report.json`.
- `pnpm test:scoped tests/server/domain/discovery/verbs/views.int.test.ts tests/server/domain/discovery/themes/retrieve.int.test.ts`
  — 2 files, 11 tests passed, no type errors. Artifact:
  `reports/runs/test/codex-world-gate-integration-3333997-2026-09-08T14-50-53-327Z/test-report.json`.
- `pnpm typecheck:graph` and `pnpm typecheck:tests-dom` — both exited 0 with no diagnostics.
- Supplied builder receipt: 106 exact Playwright CTs passed. This review did not rerun CT.
- Scoped Biome over all 11 review files — clean, no fixes applied. `git diff --check` — clean.

The known global `baseui-render-prop-composition.defineGate` loader incompatibility and existing Knip
unused-export/type population were outside this review and were not used to qualify these results.

No additional human security review is required for this cleanup. The security boundary becomes smaller:
the removed arbitrary-URL plugin upgrade RPC can no longer be invoked over the wire, while its separately
tested domain operation and the live stored/showcase update paths remain.
