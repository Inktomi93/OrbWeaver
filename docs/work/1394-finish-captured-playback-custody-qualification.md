---
kind: work
status: open
updated: 2026-10-27
priority: P2
area: testing
plan: cross-surface-consistency
---

# Finish captured playback custody qualification

## What

Qualify and integrate the frozen capture-admission and explicit-viewer migration. Preserve raw publication formats, immutable private bindings and actual-root caller selection.

## Why

Structural response records allow copied inputs, outputs or viewer metadata to masquerade as genuine captures.

## Done when

Pass the admitted-capture controls, coupled loader and publication suites, affected compiler programs and rendered consumers. Resolve bounded review findings. Integrate with the private importer rules without weakening identity checks.

## Evidence

Implementation is frozen and uncommitted in `/home/inktomi/.codex/worktrees/identity-action-qualification/orbweaver` at `a313bf25cb6f12eb21592c6a18d81c38169b92a3`.

Final recovery snapshot: `0c57c6177718b7c02930ae5b6ea35ba500416de6`. The working copy is restored. The earlier snapshot `c4852602f079fdcd0a0590733bacfeb9ea77cb2d` is not the final source.

The final Node, DOM and ISO compiler programs pass, including the router prerequisite. Scoped lint passes. Runtime qualification of the corrected implementation remains pending.

Read `reports/stickler/capture-playback-boundary.md`. The final bounded key-correlation and search-publication corrections need delta review. Keep first-boot captures separate from the populated corpus viewer; use the actual scenario root rather than relabeling records.

The source list and safe logs are under `reports/surface-consistency-private/resume/`. Keep the capture and private-import batches together for integration.

Run the focused custody suite first:

```bash
pnpm test tests/support/node/corpus-read-responder.int.test.ts
```

Then run coupled publication and loader coverage:

```bash
pnpm test tests/support/node/corpus-publication.int.test.ts tests/support/node/corpus-library-views.int.test.ts tests/support/node/corpus-search-publication.int.test.ts tests/support/node/factories/library-relations.int.test.ts tests/support/node/corpus-fixture-schema.test.ts tests/support/node/corpus-fixture-lifetime.int.test.ts tests/support/node/corpus-boundary.test.ts
```

Run rendered consumers and the census integration:

```bash
pnpm test:ct tests/support/browser/ct-shell-reads.ct.tsx tests/client/features/config/surfaces/theme-css-editor.ct.tsx tests/client/components/entry-list-consent.ct.tsx tests/client/features/notifications/notification-inbox.ct.tsx tests/client/features/plugin/native-guest-protocol.ct.tsx tests/client/features/app-shell/surface-census.suite.ct.tsx tests/client/features/app-shell/accessible-name-quality.suite.ct.tsx tests/client/features/app-shell/form-identity.suite.ct.tsx
```

The full integrated browser population remains owned by the verification item. Do not infer authentication proof from fixture viewer selection.
