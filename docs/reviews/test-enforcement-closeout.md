# Test-authoring enforcement closeout

## Acceptance map

| Case | Maintained proof | Outcome |
| - | - | - |
| Fixed responder factory | `eslint-ct-responder.test.ts`: fixed factory refusal and request-aware factory admission | Native rule inspects locally declared factory returns. |
| Named function | Same suite: unused parameter refusal and input-reading function admission | Native rule inspects the declaration. |
| Comma expression | Same suite: discarded input refusal and retained input admission | Discarded operands do not count as reads. |
| Dead alias and composed initializer | Same suite: unused direct, array, unary, nested-object and binary initializer refusal; returned and helper-observed composition admission | Immediate value composition follows its binding to an observation. |
| Computed route key | Same suite: computed typed key refusal and input-reading admission | Shared static-key resolution identifies the procedure. |
| Typed wrapper | Same suite: untyped map refusal and request-aware map admission | Native call signatures identify route-map parameters. |
| Hoisted label | `eslint-test-authoring.test.ts`: local constant refusal and production import admission | Shared static-value resolution follows local bindings. |
| Accessible-name assertion | Same suite: copied name refusal and production constant admission | `toHaveAccessibleName` uses the label index. |
| Null and falsy absence | Same suite: `toBe(null)` and `toBeFalsy` refusal, positive and negated controls | These matchers do not establish a positive control. |
| Invite preview hold | `join-invite-dialog.ct.tsx` | Rebuild the held preview through a real issued invite and caller; preserve loading, focus, wording and no redemption. |
| Config holds | `config-content-surface.ct.tsx` | Rebuild reads through a private corpus root; preserve delayed anchors, supersession, remount and observer cleanup. |
| First-boot holds | `first-boot-boxes.ct.tsx` | Rebuild reads through the shared fresh root with native shipped-theme boot seeding; preserve desktop and phone geometry. |
| Notification hold | `notification-inbox.ct.tsx` | Produce unread notices through real invitations for the corpus reader; preserve held bell state and foreign-media refusal. |
| Refinery holds | `preview-result-lifetime.ct.tsx` | Script raw provider replies; retain native schema parsing, binding, preview persistence, controlled transport failure and replacement reset. |
| Plugin hold | `confirmation-identity.ct.tsx` | Install and enable the actual guest bundle; serve publications and held storage call through the real plugin host. Preserve destructive-confirmation identity and focus. |

These are maintained-case rebuilds, not additional legacy restorations. No selected assertion moves to another layer or is dropped.

## Checks

- `pnpm test` excludes tooling. Its named tooling invocation finds no files; use `pnpm test:tools`.
- New controls against unchanged enforcement fail for every enumerated syntax gap. Existing positive controls pass.
- `pnpm test:tools tests/tooling/eslint-ct-responder.test.ts tests/tooling/eslint-test-authoring.test.ts` passes with the updated rules.
- `pnpm typecheck tooling/tsconfig.json tsconfig.json` passes after fixing the rule implementation's AST types.
- `pnpm typecheck tsconfig.json tsconfig.tests-dom.json` passes with the shared fresh-root helper.
- Scoped Biome and ESLint pass for the changed rule and test files.
- `pnpm exec depcruise tests/support/node/composed.ts tests/support/node/corpus-first-boot.ts --config .dependency-cruiser.ts --output-type err-long` passes.

The initial CT run exposes setup defects behind the removed mock responses: missing multi-human capability, omitted shipped themes, an invalid plugin slug and unsupported schema metadata. Its native report is retained at `/tmp/test-closeout-first-ct-report.json`.

The corrected CT run qualifies first-boot geometry and retains unresolved caller, plugin-spawn and refinery-binding failures. Its native report is retained at `/tmp/test-closeout-second-ct-report.json`. The native working-tree guard also rejects comment edits during that run; that run is not clean acceptance.

Direct native caller controls establish the refinery correction: structured calls ride the summarize binding; a compatible raw reply passes the actual parser. The case changes only its private corpus root's binding.

## Completed rendered acceptance

The frozen-tree selections pass without retries, skipped cases or working-tree guard errors:

```sh
CT_PORT=5196 pnpm test:ct tests/client/features/chat/anchors/join-invite-dialog.ct.tsx tests/client/features/notifications/notification-inbox.ct.tsx tests/client/features/plugin/components/confirmation-identity.ct.tsx tests/client/features/refinery/components/preview-result-lifetime.ct.tsx
CT_PORT=5196 pnpm test:ct tests/client/features/config/surfaces/first-boot-boxes.ct.tsx tests/client/features/config/surfaces/config-content-surface.ct.tsx
```

The native reports are `/tmp/test-closeout-final-ct-report.json` and `/tmp/test-closeout-config-final-ct-report.json`. They supersede the failed runs for rendered acceptance. No result from the guard-invalidated run is reused as final acceptance.

`pnpm typecheck tsconfig.tests-dom.json` passes after the final caller, native spawn and structured-binding corrections. Scoped ESLint passes on those corrected specs.

The tooling suite passes its refusal and admission controls. The unchanged-source red run exposes every enumerated syntax gap; no baseline is added.

## Local value-use controls

The [native classification](../../tooling/src/eslint/test-routes.ts) owns the supported syntax. The responder suite qualifies each container with discarded-expression, unused-binding, returned-binding and helper-observed controls. Type assertion, generic instantiation and JSX cases qualify parser handling, not wire-valid product outputs.

| Syntax role | Disposition |
| - | - |
| Members, computed and optional access, TypeScript value wrappers, collections, properties, spreads, templates, binary expressions, await and JSX value containers | Follow the constructed value to its binding or outer observation. |
| Logical expressions and conditional result branches | Follow the result. A predicate also observes an immediate effect in its dependent branch. |
| Branch effect search | Inspect explicit calls, construction, import, yield and mutation. Exclude nested function and class bodies. |
| Sequence | Follow only the final value; earlier pure operands are discarded. |
| Unary value operation, `void`, `delete` | Follow value operations; discard `void` values; observe deletion. |
| Local destructuring and default values | Follow the declared variables through their existing references. |
| Return, throw, control tests, switch discriminants and iteration inputs | Observe the value within an observed function. |
| `for` initializer and update | Discard pure values; retain explicit effects or live declarations. Only the test is a control observation. |
| Local closure | The root responder is observed. A nested function must reach a supported local binding, name reference or observation. |
| Call, construction, tagged template, dynamic import, yield and mutation | Treat the value as syntactically observed; do not inspect arbitrary helper implementations. |
| Unsupported parent | Do not infer observation. The route receives the existing fixed-responder finding when no supported read exists. |

Native evidence:

- `/tmp/test-closeout-dead-read-red.log`: unused array, unary, nested-object and binary initializer controls fail the unchanged rule.
- `/tmp/test-closeout-value-surface-red.log`: the immediate-surface table exposes omitted logical, conditional, await, instantiation, JSX and loop-role cases.
- `/tmp/test-closeout-deferred-red.log`: unused arrow, function-expression, function-declaration and effectful-closure controls fail before root-aware propagation. Its positive controls pass.
- `/tmp/test-closeout-value-surface-green.log`: `pnpm test:tools tests/tooling/eslint-ct-responder.test.ts` passes the complete focused table and retained controls.
- `/tmp/test-closeout-value-surface-biome.log` and `/tmp/test-closeout-value-surface-eslint.log`: scoped native checks pass.
- `/tmp/test-closeout-value-surface-typecheck.log`: `pnpm typecheck tooling/tsconfig.json` passes for the final source.

Local reference tracking has a cycle guard. It does not establish that an imported helper executes a callback, that a call uses its arguments, or that every admitted read changes the response. Class execution and arbitrary higher-order or cross-module dataflow remain outside this syntactic rule.

Product and CT behavior are unchanged, so their completed rendered results remain applicable.

## Seed-theme label import

[Settings render truth](../../tests/e2e/live-settings-render-truth.spec.ts) reads `THEME_MOCHA_NAME` from its production owner instead of declaring the label. This Node-side Playwright spec uses an existing constant home; no production export or dependency exception is added. The selected label value and browser assertions are unchanged.

Scoped Biome, scoped ESLint, the named dependency check and native import smoke pass. Output is retained in `/tmp/test-closeout-theme-label-biome.log`, `/tmp/test-closeout-theme-label-eslint.log`, `/tmp/test-closeout-theme-label-depcruise.log` and `/tmp/test-closeout-theme-label-native.log`. No compiler or E2E run is required for this unchanged-value import correction.

## Limits

Whole-tree ESLint, integration checks and independent review belong to main. This report does not claim their completion. Static recognition follows bounded local bindings and native signatures, not arbitrary cross-module dataflow.

No baseline, grandfathered finding, waiver or blanket exception is added. Production behavior is unchanged.
