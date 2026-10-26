# Context header navigation

## Outcome

The context header shows a radio chooser when its measured tab strip overflows. The chooser uses the existing selection seam. The single manually activated tablist and horizontal scroll fallback remain.

The prepared production-backed CT failed against unchanged source because the chooser was absent. It passes with fine and coarse pointers after the fix.

## Native floor

- `CT_PORT=3165 pnpm test:ct tests/client/features/app-shell/surfaces/context-header-navigation.ct.tsx --reporter=list > reports/context-header-navigation-final.log 2>&1`: passed.
- `CT_PORT=3165 pnpm test:ct tests/client/features/auth/components/login-pending-join.ct.tsx tests/client/features/chat/anchors/join-invite-dialog.ct.tsx`: passed.
- `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json tsconfig.world-browser.json tsconfig.world-node.json`: passed.
- Scoped `pnpm lint:eslint` and `pnpm exec biome check --diagnostic-level=error` on the changed files: passed.
- Commit hooks: Biome and message contract passed.
- Main ran `scripts/corpus-fixture.ts e2e` for `smoke.spec.ts`, `corpus-home-launch.spec.ts` and `corpus-joiner.local.spec.ts` on desktop and phone flat projects: passed. The phone no-selection case is intentionally skipped.

## Artifacts

- Fine pointer: `reports/ct-results/client-features-app-shell--8a013-n-and-keeps-close-reachable-chromium/narrow-header.png` and `wide-header.png`.
- Coarse pointer: `reports/ct-results/client-features-app-shell--ab177-n-and-keeps-close-reachable-chromium/narrow-header.png` and `wide-header.png`.
- Open menu with the selected radio visible: `reports/ct-results/client-features-app-shell--ab177-n-and-keeps-close-reachable-chromium/open-narrow-menu.png`.
- Final native CT output: `reports/context-header-navigation-final.log`.
- Main-owned E2E output: `reports/context-header-required-e2e.log` and `reports/e2e-corpus-report.json`.

## Limits

The focused context tests use Chromium fine and coarse pointers. They do not establish WebKit, physical-device or full application qualification.
