# DOM enforcement closeout

## Outcome

DOM lookup permissions bind to a named function path, receiver, method and normalized selector. New calls fail even inside an approved file or function. Duplicate permissions refuse rule initialization for their file; unused permissions report stale homes.

Ordinary owned nodes use refs: the gallery popup, message content column, Home grid, config content pane, connection-role picker, and FaceStrip faces and overflow trigger. FaceStrip removes keyed refs when nodes detach. Select retains its internal trigger ref and clears the caller ref when its trigger detaches.

The lookup rule covers every client source tier. Approved cross-pane, form-validation and development-observer operations remain explicit boundary sites. No file exclusion, violation baseline or suppressed production violation was added. Two narrow Biome directives cover verified literal-source interpolation false positives: its formatter reverts their escaped template form.

## Acceptance

| Item | State | Evidence |
| - | - | - |
| 1362 alias, class-write and initializer gaps | implemented | tooling/src/eslint/ui-dom.ts, motion.ts and ui-styles.ts; planted rule controls |
| 1362 skin-table static styles | enforcement implemented; production fixes coordinated with CSS lane | React CSSProperties objects are judged at their authored home; client lint exposes the owned art files |
| 1362 sealed selectors and prose | implemented | selector arguments and class-name lookups detect vendor internals; prose control passes |
| 1362 browser event floor | implemented | typed addEventListener receiver and BCD event keys; config-jump uses onscrollend capability detection and its existing scroll-event timer fallback |
| 1362 rendered behavior | verified | Select trigger ref, FaceStrip ref lifetime, config arrival, and row edit footprint CTs |
| 1324 motion rules | existing implementation retained | eslint-motion-gates.test.ts and configured production homes |
| 1324 transition-property controls | verified with production mutations | existing dialog, popover, toast and tabs CTs |
| 1317 and 1328 native titles | existing implementation retained | native.ts resolves React DOM title declarations, object authoring and forwarding; eslint-native-title.test.ts |
| 1319 container ownership | existing implementation retained | ui-policy.ts and ui-feature-policy.ts; eslint-container-ownership.test.ts |
| 1320 layout-context props | existing implementation retained | ui-feature-policy.ts; eslint-layout-context-props.test.ts |
| 1323 client architecture | existing implementation retained | client-data-policy.ts; eslint-client-data-gates.test.ts and native-client-form-boundary.test.ts |
| 1327 stale claims | reconciled | D54, D73, D78, D128, D179 and D220 name actual retained checks or explicit review limits; D333 remains authoritative |

## Boundary decisions

- Shell and config registry addressing remains in its actual shell or settings host adapter. Each sanctioned operation has its own permission.
- Labels and leaderboard focus adapters cross independently rendered shell panes, including virtualized rows. Their owning markers are the addressing contract permitted by the client path rule.
- The form-invalid adapter is the shared onSubmitInvalid path used by both editor factories. The form-scoped entry remains scoped to the supplied form.
- Development agent, appearance and motion readers inspect the document as their explicit subject. Their exact named operations are permitted, not their containing files.
- ConnectionRoleSlot and FaceStrip did not earn boundary exceptions. Their controls now provide refs instead.

## Rule limits

Local stable aliases and destructured members are followed. Dynamic property names and arbitrary cross-module dataflow are not certified. Render-time reads in useMemo, useState and useReducer initializers are checked; separately called helper bodies are not followed. Native lint remains a source check, not rendered or browser-platform proof.

## Installed optional-rule audit

The audit reads the installed plugins and calculates the actual flat config for the production message-row path. It does not infer availability from online documentation. Existing enabled rules remain unchanged.

- `eslint-plugin-react-x`: `5.28.4`.
- `eslint-plugin-jsx-a11y`: `6.10.2`.
- `@tanstack/eslint-plugin-query`: `5.104.5`.
- `@tanstack/eslint-plugin-router`: `1.162.0`.

Installed Biome explanations and real-file controls confirm raw aria-hidden and array-index-key coverage. Mapped Button is not covered by Biome. Installed react-hooks recommended-latest enables the compiler rules listed below.

| Optional installed rule | Decision |
| - | - |
| `react-x/error-boundaries` | Keep off: react-hooks recommended-latest owns the corresponding compiler rule; exhaustive-deps and unsupported-syntax are explicit errors. |
| `react-x/exhaustive-deps` | Keep off: react-hooks recommended-latest owns the corresponding compiler rule; exhaustive-deps and unsupported-syntax are explicit errors. |
| `react-x/globals` | Keep off: react-hooks recommended-latest owns the corresponding compiler rule; exhaustive-deps and unsupported-syntax are explicit errors. |
| `react-x/immutability` | Keep off: react-hooks recommended-latest owns the corresponding compiler rule; exhaustive-deps and unsupported-syntax are explicit errors. |
| `react-x/no-access-state-in-setstate` | Keep off: no-class-component closes ordinary class authoring. The existing QueryBoundary error boundary is a necessary React class; do not add a second class-policy campaign here. |
| `react-x/no-array-index-key` | Keep off: the Biome React domain and explicit useJsxKeyInIterable, noLeakedRender and noNestedComponentDefinitions own these findings. |
| `react-x/no-children-to-array` | Keep off: Children.toArray assigns keys when normalizing opaque children. The existing Children traversal bans do not establish that normalization is forbidden. |
| `react-x/no-component-will-mount` | Keep off: no-class-component closes ordinary class authoring. The existing QueryBoundary error boundary is a necessary React class; do not add a second class-policy campaign here. |
| `react-x/no-component-will-receive-props` | Keep off: no-class-component closes ordinary class authoring. The existing QueryBoundary error boundary is a necessary React class; do not add a second class-policy campaign here. |
| `react-x/no-component-will-update` | Keep off: no-class-component closes ordinary class authoring. The existing QueryBoundary error boundary is a necessary React class; do not add a second class-policy campaign here. |
| `react-x/no-direct-mutation-state` | Keep off: no-class-component closes ordinary class authoring. The existing QueryBoundary error boundary is a necessary React class; do not add a second class-policy campaign here. |
| `react-x/no-duplicate-key` | Keep off for this assignment: this adds a sibling-list key analysis unrelated to the reported DOM and motion gaps; no finding was grandfathered. |
| `react-x/no-implicit-children` | Keep off: spreading derived native part props is supported seal composition. A blanket spread ban would reject that contract. |
| `react-x/no-implicit-key` | Keep off: spreading derived native part props is supported seal composition. A blanket spread ban would reject that contract. |
| `react-x/no-implicit-ref` | Keep off: spreading derived native part props is supported seal composition. A blanket spread ban would reject that contract. |
| `react-x/no-leaked-conditional-rendering` | Keep off: the Biome React domain and explicit useJsxKeyInIterable, noLeakedRender and noNestedComponentDefinitions own these findings. |
| `react-x/no-missing-component-display-name` | Keep off: memo and forwardRef are already refused. A displayName convention for every context is not a DOM or accessibility guarantee. |
| `react-x/no-missing-context-display-name` | Keep off: memo and forwardRef are already refused. A displayName convention for every context is not a DOM or accessibility guarantee. |
| `react-x/no-missing-key` | Keep off: the Biome React domain and explicit useJsxKeyInIterable, noLeakedRender and noNestedComponentDefinitions own these findings. |
| `react-x/no-misused-capture-owner-stack` | Keep off: no captureOwnerStack product usage was part of this assignment; do not introduce a new diagnostics API policy. |
| `react-x/no-nested-component-definitions` | Keep off: the Biome React domain and explicit useJsxKeyInIterable, noLeakedRender and noNestedComponentDefinitions own these findings. |
| `react-x/no-nested-lazy-component-declarations` | Keep off: react-hooks static-components and Biome noNestedComponentDefinitions own render-time component identity. |
| `react-x/no-set-state-in-component-did-mount` | Keep off: no-class-component closes ordinary class authoring. The existing QueryBoundary error boundary is a necessary React class; do not add a second class-policy campaign here. |
| `react-x/no-set-state-in-component-did-update` | Keep off: no-class-component closes ordinary class authoring. The existing QueryBoundary error boundary is a necessary React class; do not add a second class-policy campaign here. |
| `react-x/no-set-state-in-component-will-update` | Keep off: no-class-component closes ordinary class authoring. The existing QueryBoundary error boundary is a necessary React class; do not add a second class-policy campaign here. |
| `react-x/no-unnecessary-use-prefix` | Keep off: hook factories and injected hook contracts can retain the use prefix without calling another hook locally. |
| `react-x/no-unsafe-component-will-mount` | Keep off: no-class-component closes ordinary class authoring. The existing QueryBoundary error boundary is a necessary React class; do not add a second class-policy campaign here. |
| `react-x/no-unsafe-component-will-receive-props` | Keep off: no-class-component closes ordinary class authoring. The existing QueryBoundary error boundary is a necessary React class; do not add a second class-policy campaign here. |
| `react-x/no-unsafe-component-will-update` | Keep off: no-class-component closes ordinary class authoring. The existing QueryBoundary error boundary is a necessary React class; do not add a second class-policy campaign here. |
| `react-x/no-unstable-context-value` | Keep off: React Compiler owns ordinary value stability. Manual memoization is refused; performance work is outside this assignment. |
| `react-x/no-unstable-default-props` | Keep off: React Compiler owns ordinary value stability. Manual memoization is refused; performance work is outside this assignment. |
| `react-x/no-unused-class-component-members` | Keep off: no-class-component closes ordinary class authoring. The existing QueryBoundary error boundary is a necessary React class; do not add a second class-policy campaign here. |
| `react-x/no-unused-props` | Keep off: unused surface analysis is separate from this DOM enforcement assignment. No finding was suppressed or accepted as a baseline. |
| `react-x/no-unused-state` | Keep off: unused surface analysis is separate from this DOM enforcement assignment. No finding was suppressed or accepted as a baseline. |
| `react-x/purity` | Keep off: react-hooks recommended-latest owns the corresponding compiler rule; exhaustive-deps and unsupported-syntax are explicit errors. |
| `react-x/refs` | Keep off: react-hooks recommended-latest owns the corresponding compiler rule; exhaustive-deps and unsupported-syntax are explicit errors. |
| `react-x/rules-of-hooks` | Keep off: react-hooks recommended-latest owns the corresponding compiler rule; exhaustive-deps and unsupported-syntax are explicit errors. |
| `react-x/set-state-in-effect` | Keep off: react-hooks recommended-latest owns the corresponding compiler rule; exhaustive-deps and unsupported-syntax are explicit errors. |
| `react-x/set-state-in-render` | Keep off: react-hooks recommended-latest owns the corresponding compiler rule; exhaustive-deps and unsupported-syntax are explicit errors. |
| `react-x/static-components` | Keep off: react-hooks recommended-latest owns the corresponding compiler rule; exhaustive-deps and unsupported-syntax are explicit errors. |
| `react-x/unsupported-syntax` | Keep off: react-hooks recommended-latest owns the corresponding compiler rule; exhaustive-deps and unsupported-syntax are explicit errors. |
| `react-x/use-memo` | Keep off: react-hooks recommended-latest owns the corresponding compiler rule; exhaustive-deps and unsupported-syntax are explicit errors. |
| `react-x/use-state` | Keep off: this combines naming and initializer-cost preferences; render-time layout initializer reads are enforced by the dedicated rule. |
| `jsx-a11y/accessible-emoji` | Keep off: deprecated by the installed plugin. |
| `jsx-a11y/anchor-ambiguous-text` | Keep off: this exact-text heuristic does not establish purpose in rendered context; changed flows receive accessible-name review. |
| `jsx-a11y/label-has-for` | Keep off: deprecated; label-has-associated-control is active. |
| `jsx-a11y/lang` | Keep off: both installed lang and Biome useValidLang target HTML language declarations; this is not inline-language certification. |
| `jsx-a11y/no-aria-hidden-on-focusable` | Keep off pending bounded qualification: Biome catches raw focusable elements, not mapped Button. The native optional rule catches mapped Button and passes Base UI-style tabIndex=-1 inputs, but falsely flags a plain type=hidden input without tabIndex. |
| `jsx-a11y/no-onchange` | Keep off: deprecated; native control keyboard behavior remains available. |
| `jsx-a11y/prefer-tag-over-role` | Keep off: polymorphic and headless primitives deliberately supply native roles; a blanket tag preference contradicts those contracts. |
| `@tanstack/query/no-rest-destructuring` | Keep off: this is tracked-query subscription performance advice, not a correctness defect; performance work is outside this assignment. |
| `@tanstack/router/route-param-names` | Keep off: the application has fixed / and /login routes with no route parameters; no new route-name campaign is needed. |

## Checks

- Old-source planted DOM and browser-event controls: 14 failed, 94 passed. Authored CSSProperties declaration control: 1 failed, 68 passed before implementation.
- Selector-semantic control: 1 failed, 81 passed before preserving CSS template whitespace. Corrected DOM suite: 82 passed, including every configured home file, copied calls, duplicate permissions and stale permissions.
- `pnpm test:tools` on native title, containment, layout-context, client-data, motion, DOM, browser-support and native-form-boundary suites: 305 passed. Later affected runs: DOM 82 passed and browser-support 45 passed; unchanged suites retain their completed result.
- `CT_PORT=5893 pnpm test:ct` on Select and the existing dialog, popover, toast and tabs cases with controlled production mutations: 5 intended failures, 1 pass. The failures observe computed `all` and the missing trigger focus. Exact original sources were restored.
- Restored affected CT batch: 25 passed, 2 failed. Home fixture omissions and initial LIST focus readiness were then corrected. The LIST family passed all cases, including the actual appearance-control focus and no-selection arrival. Corrected Home and gallery cases passed. Unchanged motion, Select, FaceStrip, row-edit, settings-jump and login/join results are retained.
- The Home CT uses the canonical ambient responders and real section caller. It asserts the actual host column count before checking coarse-pointer shelf behavior.
- The gallery CT uses a captured pictured room reread through the real caller, the canonical image-action name, real media decoding and viewport bounds.
- Final `pnpm typecheck tooling/tsconfig.json packages/client/tsconfig.json tsconfig.tests-dom.json`: passed, including the router dependency. The earlier affected UI program also passed.
- Scoped ESLint over every changed TypeScript file found only local rule-helper style findings. After correction, `pnpm lint:eslint tooling/src/eslint/browser-support.ts tooling/src/eslint/ui-dom.ts eslint.config.ts tests/tooling/eslint-client-dom-locks.test.ts` passed.
- First full client source lint exposed static artwork styles owned by the CSS lane. Main must integrate those fixes before the whole-client verdict; no violation was exempted.

## Ledger reconciliation

D54 names the configured Query rules rather than an absent strict preset. D73 distinguishes annotated constant identity from factory-count checks. D78 names the reset type assertion and native form seals. D128 follows its D333 supersession. D179 names the retained intrinsic-control rule. D220 no longer promises removed registry, citation, layout or union gates. Product architecture decisions and rejected proposals remain unchanged. Broader registration and containment identity limits belong to work items 1366 and 1367.

## Bounded follow-up

**Title:** Qualify native mapped-control aria-hidden enforcement.

**What:** Evaluate the installed `jsx-a11y/no-aria-hidden-on-focusable` rule with the production component mappings before enabling it.

**Why:** Biome catches the raw button control but not mapped Button. The installed native rule catches mapped Button and passes Base UI's tabIndex=-1 input shape. It also reports a valid type=hidden input without tabIndex.

**Done:** Preserve mapped Button and legitimate hidden-input controls, resolve the native false positive, inspect current production findings, fix actual violations, and enable the native rule without a blanket exclusion. No custom rule or production census was added here.

## Review scope

Read and changed the rule implementations, configured permissions, owned production call sites and their affected tests. This is not a line-by-line review of unrelated client files. Whole-application verification, merged CSS fixes and independent review belong to main.

## Independent review correction

The focused controls expose locally held apply arrays and untagged class-name templates before implementation: 6 failed and 86 passed. The corrected DOM suite passes 100 cases.

The argument reader follows stable local aliases and TypeScript wrappers, expands known static array spreads, and preserves holes and unresolved spread positions. Public attributes and inert-marker controls retain their permitted behavior. The sealed-selector rule uses the same method and argument reader, then resolves quoted, template and constant-interpolated class names at the call boundary. Direct, call, apply and bind controls distinguish private names from public names. Arbitrary dynamic flow is not certified.

This correction changes tooling and controls only. Product CT results remain applicable; no product CT was rerun. Scoped ESLint on the changed rules and controls passes. `pnpm typecheck tooling/tsconfig.json` passes, including its router dependency. Scoped Biome passes with --error-on-warnings.
