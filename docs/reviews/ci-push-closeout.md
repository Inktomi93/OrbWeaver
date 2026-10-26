# CI push closeout

## Node and Knip

The CI Node failure is an obsolete package-layout gate, not a bootstrap defect. The native report at `/tmp/orb-ci-40237938754-node/test-report.json` records the rejected `client/entry.ts`; `/tmp/orb-ci-40237938754-failed.log` preserves the failing CI command. These are main's downloaded artifacts, not a passing lane run.

D333 removes custom layout and presence enforcement. Remove the architecture-gate suite and its stale claim in `ui-package-design.md` section 2. Keep `packages/client/src/entry.ts` unchanged: its static polyfill import precedes the awaited app import. Add no bootstrap allowlist or substitute custom gate.

The production source inventory covers the `.ts` and `.tsx` files under `packages/`. Native ast-grep and literal search find `RECEDED_INK` only at its declaration, forwarding export and obsolete RowActionsMenu comments. The dedicated ESLint rule and its fixtures enforce only that dead symbol. Remove the dead declaration, forwarding, comments, rule implementation, registration, configuration and dedicated fixtures together. Keep the live `RECEDED` opacity recipe and its callers unchanged.

The coupled CSS plan no longer claims a retained receded-ink rule. There is no baseline, suppression, replacement test-only API or product behavior change.

### Verification

- Scoped Biome and ESLint pass on the changed source and configuration. Native output: `/tmp/ci-closeout-node-biome.log`, `/tmp/ci-closeout-node-eslint.log`.
- `pnpm test:tools tests/tooling/eslint-ui-style-values.test.ts tests/tooling/eslint-feature-classname.test.ts tests/tooling/eslint-text-voices.test.ts tests/tooling/eslint-client-dom-locks.test.ts` passes its retained positive and refusal controls. Native output: `/tmp/ci-closeout-node-tooling.log`.
- `pnpm typecheck tsconfig.json tooling/tsconfig.json packages/ui/tsconfig.json packages/client/tsconfig.json` passes, including the router prerequisite. Native output: `/tmp/ci-closeout-node-typecheck.log`.
- `pnpm knip` passes. Native output: `/tmp/ci-closeout-node-knip.log`.
- `pnpm knip:prod` passes with non-failing unused `@internal` tag hints in untouched `packages/server/src/transport/trpc/context.ts`. Native output: `/tmp/ci-closeout-node-knip-prod.log`.
- Documentation formatting and `git diff --check` pass.

The source stays frozen during this floor. No full Node application suite or rendered checks are rerun for this batch: it removes unsupported static enforcement and dead exports, not product behavior. See the [first-boot repair](ci-first-boot-closeout.md) for the browser changes and parent-owned application E2E. A new CI run still owns application-wide acceptance; no push is performed.

## Subsequent CI repair wave

The repair for run `40242985011` changes tests and reports only. Independent correctness review confirms the commits through `e01b7ed700`.

- [Egress GC controls](ci-egress-closeout.md) prove collection, retained Request ownership and release without changing production egress or its timeout.
- [Project-selection controls](ci-project-selection-closeout.md) bound and join native subprocess lifetimes. Their passing case evidence preserves the separate failed aggregate and retained fixture.
- [Motion and scroll controls](ci-motion-scroll-closeout.md) hold a nonzero native animation phase and use persisted messages with published socket events.

The original jump-pill CI cause remains unexplained. [Qualification item 1375](../work/1375-qualify-the-native-scrollend-jump-pill-ci-symptom.md) keeps that distinction visible; no production fix or flake classification is claimed.

The existing application E2E evidence at source `a29129661b` remains applicable. Production packages, build scripts, testkit, fixtures, Playwright configuration and executed E2E flow dependencies are unchanged.
The changed project-selection integration suite is outside the native E2E spec population. The earlier result is 27 passed and one declared phone exclusion; no fresh E2E result is claimed.

The changed-source checks and independent review are complete. A new full CI run remains required; no push is performed.
