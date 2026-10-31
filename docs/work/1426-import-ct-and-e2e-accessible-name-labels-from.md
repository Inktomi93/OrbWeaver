---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: testing
plan: test-foundation
---

# Import CT and e2e accessible-name labels from production

## What

CT and e2e specs hand-type accessible names in getByRole, getByLabel and getByText that production does not export, across many files; the surface walkthrough drivers alone hold several hundred. Spine-Testing §9 requires labels to come from their production home. Hoist each feature's user-facing labels into a zero-import per-feature copy module (the existing \*-copy.ts pattern), have production render from it, and rewrite the spec sites to import it with a repo codemod (tooling/src/codemods/; load the codemod skill). orb/no-hand-copied-label already refuses a literal that a production module exports; once the labels are exported it covers these sites.

## Why

A hand-typed label is a second copy of production: a copy change breaks tests that never imported the source, and the walkthrough cannot follow a renamed control.

## Done when

Every accessible name a CT or e2e spec targets is imported from its production copy module or derived from a production registry; orb/no-hand-copied-label reports zero findings over tests/; the codemod ships with fixtures; affected suites pass.

## Evidence

Partial: the chat rename controls are hoisted, and the item stays open for the rest. The sweep is far larger than one lane: 2456 `name: "…"`, `getByLabel("…")` and `getByText("…")` literal sites across 266 CT and e2e files, with `tests/e2e/support/surface-sections.ts`, `surface-character.ts`, `surface-chat.ts` and `surface-config.ts` holding about 450 of them. Each feature needs a copy module that its production components render from, so the hoist is a production edit per label and not a mechanical rewrite.

Built:

- `packages/client/src/lib/chat-rename-names.ts`, a zero-import module: `RENAME_CHAT_NAME`, `CHAT_NAME_FIELD_NAME`, `CHAT_TITLE_FIELD_NAME`, `renameChatButtonIdentity` and `renameChatButtonName`. `chat-header-title.tsx` and `rename-chat-dialog.tsx` render from it.
- `tooling/src/codemods/literal-to-binding` now substitutes captured metavariables in a `pattern` rewrite's `expression` (`renameChatButtonIdentity($CAST, $TITLE)`), so a hand-built template label rewrites to a label-producing call. Its fixture in `tests/rewrites` covers the template rewrite and a similar template that must stay.
- Applied to `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx`, `tests/e2e/support/chat-room.ts` and `tests/e2e/support/surface-chat.ts`. The remaining specs of the sweep are not rewritten.

`orb/no-hand-copied-label` reported zero findings over `tests/client`, `tests/e2e` and `tests/ui` before and after (`pnpm exec eslint` on those trees, no rule hits). It judges only label-named constant exports, so it cannot see the 2456 sites; this is why zero findings is not the done line here. Extending it to label-producing functions is item 1509 and was not done: no site in this slice needed it to be found, and `renameChatButtonIdentity` stays unindexed until it is.

Ran, with `CT_PORT=3421`: `app-shell-topbar.ct.tsx` and `chat-header-title-name.ct.tsx`, 32 passed on Chromium. `pnpm codemod jssg test` on the codemod, 2 passed. `pnpm typecheck` on `packages/client/tsconfig.json`, `packages/ui/tsconfig.json`, `tsconfig.tests-dom.json`, `tsconfig.node.json` and `tooling/src/codemods/tsconfig.json` passed. `pnpm depcruise` and `pnpm knip:prod` passed.

## Extended-rule census

`orb/no-hand-copied-label` at scope `all` (item 1509) indexes label-producing functions, zero-import `*-copy.ts` and `*-names.ts` modules, error code objects, route objects and env key constants, beside the label-named exports. The repository config runs it at scope `named`, so no new finding fails lint. The census linted 2118 files under `tests/` with the rule at scope `all` and found 692 findings in 153 files. Reproduce it with the ESLint Node API: `new ESLint({ overrideConfig: { files: ["tests/**/*.{ts,tsx}"], rules: { "orb/no-hand-copied-label": ["warn", { scope: "all" }] } } })` over `tests`.

What the census sizes: the 2456 literal sites in this item are mostly names no production module exports, so the rule cannot find them. Only 12 of the 692 findings are accessible names from a function or a copy module; the rest are 547 env keys, 85 error codes and 48 routes. The label sweep still starts with the copy modules, one per feature, and the rule finds each site once its module exists.

Sampled for false positives: twelve of the 19 owner modules were read through their findings, and each finding is a test spelling a value that production exports. The sweep decides the sites where a test may pin a value on purpose; candidates are `tests/contracts/inference/warnings.contract.test.ts`, `tests/support/node/env-seams.ts` and `tests/tooling/container-security-config.int.test.ts`.

| Kind | Findings |
| - | - |
| env | 547 |
| code | 85 |
| route | 48 |
| name | 12 |

| Feature | Findings |
| - | - |
| server/entry | 186 |
| support/node | 154 |
| tooling/stack | 64 |
| server/domain/sessions | 42 |
| server/domain/chat | 33 |
| server/foundation | 27 |
| server/domain/admin | 21 |
| e2e/specs | 14 |
| e2e/support | 12 |
| inference/backends | 12 |
| server/domain/import | 12 |
| client/features/preset | 10 |
| inference/conformance | 10 |
| server/transport | 10 |
| tooling/floor | 10 |
| server/domain/assets | 9 |
| tooling/snap | 9 |
| server/domain/character | 8 |
| client/features/workloads | 7 |
| contracts/inference | 7 |
| tooling/container-security-config.int.test.ts | 6 |
| server/domain/imagery | 5 |
| client/features/auth | 4 |
| inference/funnel | 4 |
| server/domain/settings | 4 |
| client/data | 2 |
| client/features/notifications | 2 |
| inference/roles | 2 |
| tooling/seed | 2 |
| client/features/credentials | 1 |
| server/domain/connection | 1 |
| server/domain/credentials | 1 |
| tooling/dev | 1 |

| Owning production module | Findings |
| - | - |
| packages/contracts/src/identity/index.ts | 390 |
| packages/server/src/domain/sessions/contract/role-policy.ts | 76 |
| packages/contracts/src/portability/routes.ts | 48 |
| packages/contracts/src/inference/warnings.ts | 37 |
| packages/server/src/foundation/data-layout/contract.ts | 28 |
| packages/kit/src/env-file/index.ts | 22 |
| packages/server/src/foundation/env/record/index.ts | 20 |
| packages/server/src/domain/chat/contract/errors.ts | 17 |
| packages/server/src/domain/admin/contract/errors.ts | 16 |
| packages/client/src/forms/editor/autosave-status-names.ts | 10 |
| packages/server/src/foundation/data-layout/index.ts | 6 |
| packages/contracts/src/chat/bus.ts | 5 |
| packages/kit/src/allowed-hosts/index.ts | 5 |
| packages/contracts/src/chat/roster.ts | 4 |
| packages/server/src/domain/settings/contract/errors.ts | 4 |
| packages/client/src/lib/injection-copy.ts | 1 |
| packages/client/src/lib/registry-contracts.ts | 1 |
| packages/contracts/src/inference/connection.ts | 1 |
| packages/server/src/domain/credentials/contract/errors.ts | 1 |

By file, count then path:

```text
34 tests/support/node/env-seams.ts
32 tests/tooling/stack/lib/start-plan.test.ts
26 tests/server/entry/http/body-limit-ordering.int.test.ts
20 tests/server/entry/auth/seam-arms.int.test.ts
19 tests/server/entry/boot/disclaimer.test.ts
18 tests/support/node/corpus-publication.int.test.ts
16 tests/server/domain/sessions/role-policy-config.int.test.ts
13 tests/server/entry/http/bundle-body-limit.int.test.ts
12 tests/server/entry/compose/share-graph.int.test.ts
12 tests/support/node/corpus-private.int.test.ts
10 tests/server/domain/sessions/persistence/oidc-native-rows.int.test.ts
10 tests/support/node/corpus-auth.int.test.ts
10 tests/tooling/floor/process/process-env.test.ts
9 tests/server/entry/compose/env-record-root.int.test.ts
9 tests/server/entry/debug-gate-admission.int.test.ts
9 tests/server/foundation/env/env-file-load.int.test.ts
8 tests/client/features/preset/components/list-lifetimes.ct.tsx
8 tests/inference/conformance/unsupported-settings.suite.int.test.ts
8 tests/server/domain/import/loader/import-bundle.int.test.ts
8 tests/server/domain/sessions/persistence/users.int.test.ts
8 tests/server/entry/http/body-limit-population.int.test.ts
8 tests/server/foundation/data-layout/index.test.ts
8 tests/support/node/server-native.int.test.ts
8 tests/tooling/stack/lib/fixture-plan.test.ts
7 tests/contracts/inference/warnings.contract.test.ts
7 tests/server/domain/admin/verbs/create-user.int.test.ts
7 tests/server/domain/chat/verbs/role-authority.int.test.ts
7 tests/server/entry/auth/identity-placement.int.test.ts
7 tests/support/node/corpus.ts
7 tests/tooling/snap/lib/stage-plan.test.ts
7 tests/tooling/stack/lib/stack-plan.test.ts
6 tests/e2e/csrf-gates.local.spec.ts
6 tests/e2e/support/trpc.dom.test.ts
6 tests/inference/backends/openai-compat/body-shaping.int.test.ts
6 tests/server/entry/http/_body-limit-inputs.ts
6 tests/server/entry/http/session-cookie-transport.int.test.ts
6 tests/server/foundation/env/record/floor-defaults.test.ts
6 tests/support/node/corpus-seed.int.test.ts
6 tests/support/node/request-auth.int.test.ts
6 tests/tooling/container-security-config.int.test.ts
5 tests/client/features/workloads/components/platform-action-groups.suite.ct.tsx
5 tests/e2e/support/target-guard.test.ts
5 tests/inference/backends/anthropic-messages/chat-wire.int.test.ts
5 tests/server/domain/admin/persistence/owner-row-untouched.int.test.ts
5 tests/server/domain/chat/persistence/turn-target-refusals.suite.int.test.ts
5 tests/server/domain/imagery/verbs/generation-policy.int.test.ts
5 tests/server/entry/boot/persistence/migrate-data-layout.int.test.ts
5 tests/server/entry/http/production-debug-posture.int.test.ts
5 tests/support/node/env-seams.int.test.ts
4 tests/server/domain/admin/verbs/create-user.fixtures.ts
4 tests/server/domain/character/persistence/handle-copies-and-restores.int.test.ts
4 tests/server/domain/character/persistence/handle-legacy-rows.int.test.ts
4 tests/server/domain/import/loader/library-planes.int.test.ts
4 tests/server/entry/compose/share-acme.int.test.ts
4 tests/server/entry/http/export-library-paths.int.test.ts
4 tests/server/entry/http/import-identity.int.test.ts
4 tests/server/entry/http/import-tree-batches.int.test.ts
4 tests/server/entry/http/portability-routes.int.test.ts
4 tests/support/node/corpus-plugin-http.int.test.ts
4 tests/support/node/identity-output.int.test.ts
4 tests/support/node/surface-data.int.test.ts
4 tests/tooling/stack/ops/dev-down-processes.test.ts
4 tests/tooling/stack/ops/setup.test.ts
3 tests/e2e/sillytavern-folder-import.spec.ts
3 tests/inference/funnel/resolve-cache.test.ts
3 tests/server/domain/assets/verbs/import-owned.int.test.ts
3 tests/server/domain/sessions/persistence/owner-row-immutable.int.test.ts
3 tests/server/domain/sessions/role-policy-config.fixtures.ts
3 tests/server/domain/settings/persistence/tenant-kv.int.test.ts
3 tests/server/entry/compose/process-seams.int.test.ts
3 tests/support/node/corpus-image-variants.int.test.ts
3 tests/support/node/surface-data.ts
3 tests/tooling/stack/index.int.test.ts
2 tests/client/data/import-tree-plan.int.test.ts
2 tests/client/features/auth/components/pending-join-fixtures.ts
2 tests/client/features/auth/components/platform-invite-action-groups.suite.ct.tsx
2 tests/client/features/notifications/platform-inbox-action-groups.suite.ct.tsx
2 tests/client/features/workloads/components/failed-assets.ct.tsx
2 tests/e2e/corpus-settings.spec.ts
2 tests/e2e/csrf-gates.forward.spec.ts
2 tests/inference/conformance/runtime.fixtures.ts
2 tests/inference/roles/side-gen.int.test.ts
2 tests/server/domain/admin/verbs/identity-root.int.test.ts
2 tests/server/domain/admin/verbs/owner-boundary.int.test.ts
2 tests/server/domain/assets/gc-box.ts
2 tests/server/domain/assets/gc-import-overlap.int.test.ts
2 tests/server/domain/assets/persistence/materialization-boundaries.int.test.ts
2 tests/server/domain/chat/bus-golden.suite.int.test.ts
2 tests/server/domain/chat/engine/core-warnings.int.test.ts
2 tests/server/domain/chat/engine/turn-fault-outcome.suite.int.test.ts
2 tests/server/domain/chat/verbs/co-participant-render-floor.int.test.ts
2 tests/server/domain/chat/verbs/history-floor-reads-agree.int.test.ts
2 tests/server/domain/chat/verbs/media-and-imagery-authority.int.test.ts
2 tests/server/domain/chat/verbs/member-card-clamp.int.test.ts
2 tests/server/domain/chat/verbs/member-fan.int.test.ts
2 tests/server/domain/sessions/persistence/login-timing-floor.int.test.ts
2 tests/server/entry/auth/forward-jwks-execution.int.test.ts
2 tests/server/entry/compose/lifecycle-portability.int.test.ts
2 tests/server/entry/compose/membership-room-fan.suite.int.test.ts
2 tests/server/entry/compose/room-reach.fixtures.ts
2 tests/server/entry/http/auth-meta.int.test.ts
2 tests/server/entry/http/card-frame-style-tokens.int.test.ts
2 tests/server/entry/http/plugin-frame-style-tokens.int.test.ts
2 tests/server/entry/lifecycle.int.test.ts
2 tests/server/entry/trpc-batch-budget.int.test.ts
2 tests/server/foundation/observability/debug/persistence/settings-read.int.test.ts
2 tests/server/transport/jobs/scheduler-log-level.int.test.ts
2 tests/server/transport/trpc/routers/automation-response-loss.int.test.ts
2 tests/server/transport/trpc/routers/chat-reasoning-and-move.int.test.ts
2 tests/server/transport/trpc/routers/turn-lifetimes-clocks.int.test.ts
2 tests/server/transport/trpc/stream/recipient-isolation.int.test.ts
2 tests/support/node/auth-mode-options.ts
2 tests/support/node/corpus-boundary.test.ts
2 tests/support/node/corpus-chat-outputs.int.test.ts
2 tests/support/node/corpus-library-clone.int.test.ts
2 tests/support/node/corpus-library-views.int.test.ts
2 tests/support/node/corpus-notifications.int.test.ts
2 tests/support/node/corpus-oidc.int.test.ts
2 tests/support/node/corpus-recipe.ts
2 tests/support/node/corpus-search-publication.int.test.ts
2 tests/support/node/corpus-snap.int.test.ts
2 tests/support/node/factories/principal.int.test.ts
2 tests/support/node/factories/sessions.int.test.ts
2 tests/support/node/http-graph-teardown.int.test.ts
2 tests/support/node/server.ts
2 tests/tooling/seed/cli.int.test.ts
2 tests/tooling/stack/index.test.ts
2 tests/tooling/stack/lib/supervisor.test.ts
1 tests/client/features/credentials/components/connections-list-focus.ct.tsx
1 tests/client/features/preset/components/platform-staleness-action-groups.suite.ct.tsx
1 tests/client/features/preset/components/section-ids.ct.tsx
1 tests/e2e/card-import.spec.ts
1 tests/e2e/support/trpc.ts
1 tests/inference/backends/agent-sdk/private-diagnostics.fixtures.ts
1 tests/inference/funnel/normalized-reasoning.test.ts
1 tests/server/domain/admin/persistence/create-user-rows.int.test.ts
1 tests/server/domain/chat/engine/core-rpg.int.test.ts
1 tests/server/domain/chat/persistence/cross-chat-target-rows.suite.int.test.ts
1 tests/server/domain/chat/persistence/message-asset-links.suite.int.test.ts
1 tests/server/domain/chat/persistence/refusal-canon-untouched.int.test.ts
1 tests/server/domain/chat/verbs/turn-rpg-owner-scope.int.test.ts
1 tests/server/domain/connection/verbs/runtime-ownership.int.test.ts
1 tests/server/domain/credentials/verbs/storage-status.int.test.ts
1 tests/server/domain/settings/verbs/tenant-kv.int.test.ts
1 tests/server/foundation/data-layout/persistence/file-identity.int.test.ts
1 tests/server/foundation/env/host-env-allowlist.int.test.ts
1 tests/support/node/env-seams.test-d.ts
1 tests/support/node/filmstrip-auth-fixture.ts
1 tests/tooling/dev/ops/dev.int.test.ts
1 tests/tooling/snap/ops/arms/lighthouse.int.test.ts
1 tests/tooling/snap/ops/multi-target-modes.suite.int.test.ts
1 tests/tooling/stack/_dev-verbs.ts
1 tests/tooling/stack/lib/leader-record.test.ts
```

## Extended-rule sweep

The sweep rewrote the census sites with the `literal-to-binding` codemod and by hand where the site is a template or a query. The rule at scope `all` now reports 93 findings in 31 files; the repository config stays at scope `named` until they reach zero.

| Kind | Findings |
| - | - |
| route | 0 |
| name | 0 |
| code | 46 |
| env | 47 |

Done: every route reads `PORTABILITY_ROUTES`, `exportCharacterPath` or `exportChatPath`; every `*_OP_CODES` object member reads its code object; the autosave readout and the Add connection button read their copy module; `AUTH_MODE`, `AUTH_FALLBACK`, `AUTH_FALLBACK_TRUSTED_PEERS`, the role-policy keys, the sign-in keys, `ORB_ENV_NO_FILE`, `ORB_ENV_NO_OVERRIDE`, `ALLOWED_HOSTS` and `DATA_LAYOUT_SKIP` read a named key constant. The identity keys are new named constants in `packages/contracts/src/identity/index.ts`, and the arrays that held them (`CONTAINER_LOGIN_FALLBACK_ENV`, `SIGN_IN_MODE_KEYS`, `ROLE_POLICY_ENV_KEYS`) are built from them. The lighthouse fixture heading had matched `CHAT_PLUGINS_TAB_LABEL` by value only; the fixture now owns its heading.

Open, and each needs a ruling because production exports the value only as a member of an array:

| Owner | Findings | Default |
| - | - | - |
| `WARNING_CODES` | 37 | a `WARNING_CODE` object, with the tuple derived from it |
| `DATA_LAYOUT_SLOT_KEYS` | 28 | named slot key constants beside the array |
| `APP_SECRET_ENV_KEYS` | 16 | named key constants beside the array |
| `CHAT_WARNING_CODES` | 5 | a named `settings_adjusted` constant |
| `PENDING_JOIN_ERROR_CODES` | 3 | named code constants |
| `AUTH_FALLBACK_TRUSTED_PEERS_KEY`, `OIDC_CLIENT_SECRET_KEY` | 3 | keep: `tests/tooling/container-security-config.int.test.ts` reads the shipped env file |
| `SIGNUP_ERROR_CODES` | 1 | a named code constant |

Pins: `tests/tooling/container-security-config.int.test.ts` keeps its literals, because its subject is the key spelling in the shipped env files. `tests/contracts/inference/warnings.contract.test.ts` asserts membership of a wire value in two vocabularies, so it is a pin too. Both need a precise rule exception when the scope turns on. `tests/support/node/env-seams.ts` derives: a rename already fails `tsc` there, so it pins nothing.
