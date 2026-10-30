---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: plugins
plan: test-foundation
---

# Rebuild the open plugin provider contribution cases

## What

From legacy provider-contributions.suite.int.test.ts: crash-window reconciliation for an errored plugin, relay model listing and generation through scripted egress, the no-egress assertion for a refused stranger, and capabilities, resolve, probe and role-client refusal on a retained connection.

## Why

They keep the provider-contributions register row Partial.

## Done when

Each case is covered through the production root with a planted-defect red, and the register row is Accounted for.

## Evidence

- `tests/server/domain/plugin/activation/provider-contributions.suite.int.test.ts` adds the relay listing and generation case through scripted egress, the stranger no-egress case with the installer as the recording control, and the retained-connection refusal for `capabilities`, `resolve`, `probe` and the summarize role client with a success control before the uninstall.
- `tests/server/domain/plugin/persistence/provider-crash-window.int.test.ts` drives three `reportUiCrash` strikes with a storage refusal on the claim unlink, then boots a second root that unlinks the claim and keeps the owner's definition.
- Planted-defect reds, each restored: claim unlink removed, plugin label dropped, registry served across owners, `dropPlugin` not refreshing.
- The restoration register row is Accounted for in `docs/plans/restoration-register/design.md`; the case map in `docs/plans/test-foundation/design.md` is updated.
- Typecheck of `tsconfig.node.json`, whole-tree depcruise and `pnpm knip:prod` pass.
