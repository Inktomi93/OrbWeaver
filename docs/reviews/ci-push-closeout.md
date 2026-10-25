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

The source stays frozen during this floor. No full Node application suite or rendered checks are rerun: the changes remove unsupported static enforcement and dead exports, not product behavior. The next CI run owns the application verdict; the rendered repair has a separate owner and report.
