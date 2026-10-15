# Native invoked-member consumer migration

## Outcome and ownership

Based on `b993986fe3`, after a clean source-only fast-forward of the existing
`codex/wire-chat-rpg-959` worktree. The owned changes are:

- `tooling/src/verify/gates/plugin-dump-guard.ts`: register membrane dump calls during
  dispatch and consume `ctx.nativeTypes.callMemberOrigins` in evaluation. Installed
  QuickJS package identity still requires every returned declaration. Guard ordering,
  context/handle equality, helper identity, report offsets and zero-site refusal stay
  unchanged.
- `tooling/src/verify/gates/membership-write-fan.ts`: register the document-fan member
  candidates and consume the same native family. Every declaration must remain the
  canonical property signature; the existing parenthesized-await judgment remains
  local. Population, schema provider, write discovery, emit classification, finding
  grain, anchors and exact grant identity are unchanged.
- `tests/tooling/verify/ops/native-member-consumers.int.test.ts`: bounded real command
  entrypoint controls, complete declared gate proofs, missing-service refusal,
  syntax-receiver Type rejection, exact grant authority and awaited mixed-union
  controls.

No schema/version, worker family, adapter or production changes. No dependency
installation, bootstrap, regenerator, global census, full structure run or push.
Stored facts still contain declaration facts, not gate judgments. Existing native
member lifecycle/store qualification is reused rather than recertified.

## Evidence

All pnpm commands used `--config.verify-deps-before-run=false`. All commands below
ran in the owned worktree via `env -C`.

### Red first

The new suite ran three times against unmodified gates. The first two attempts
exposed fixture omissions (a tenancy-family sibling and complete explicit program
membership), which were corrected before relying on the result.

The final pre-change run completed with three failed tests and one passed test:

```text
pnpm --config.verify-deps-before-run=false test:scoped tests/tooling/verify/ops/native-member-consumers.int.test.ts
```

Expected native command exits were `[0,0,1,1,1,1,0,0]`; the old gates returned
`[1,1,0,0,1,1,0,0]`. Native-source diagnostics were empty, and direct native origins
distinguished the installed QuickJS method and canonical DatabankOps member from
the same-spelled foreign declarations. Missing services did not refuse, and the
native Node membership finding was absent. Complete declared proofs already passed.
Artifact: `reports/runs/test/codex-wire-chat-rpg-959-3649726-2026-10-15T17-59-52-634Z/test-report.json`.

### Final owned floor

```text
pnpm --config.verify-deps-before-run=false test:scoped tests/tooling/verify/ops/native-member-consumers.int.test.ts tests/tooling/verify/gates/tenancy-scope-family.suite.test.ts tests/tooling/verify/gates/ordinary-visitors-family.suite.test.ts '--testNamePattern=native |both native|member consumer|plugin-dump-guard|membership-write-fan'
```

Exit 0. Three files, nine selected tests passed, 24 unrelated tests skipped. The
completed JSON report was read: success true, nine passed, zero failed. Artifact:
`reports/runs/test/codex-wire-chat-rpg-959-3669467-2026-10-15T18-03-16-385Z/test-report.json`.

The controls drive both `runStructure` and `runScopedCli`, using installed QuickJS
declarations and canonical/foreign DatabankOps declaration homes in native Node and
browser programs. Alias/re-export and intersection/union receivers retain their
identity, bracket emit findings keep their quoted authored anchor, a foreign union
arm and an unawaited canonical call cannot certify the fan, and missing native
services return exit 2. Patching syntax receiver `getType` to throw does not affect
the native policy pass. Exact grants consume the same finding; wrong operations do
not suppress it. Existing no-dump receipt refusal and membership grant-retirement
controls also passed.

```text
pnpm --config.verify-deps-before-run=false exec biome check tooling/src/verify/gates/plugin-dump-guard.ts tooling/src/verify/gates/membership-write-fan.ts tests/tooling/verify/ops/native-member-consumers.int.test.ts --diagnostic-level=error
pnpm --config.verify-deps-before-run=false lint:eslint-scoped tooling/src/verify/gates/plugin-dump-guard.ts tooling/src/verify/gates/membership-write-fan.ts tests/tooling/verify/ops/native-member-consumers.int.test.ts
pnpm --config.verify-deps-before-run=false typecheck --config tooling/tsconfig.json
git diff --check
```

All exit 0. Biome checked three files with no fixes; ESLint completed two tooling
files and one root-owned test; tooling types passed. An earlier scoped Biome
`--write` formatted the test and rejected the added nested callback complexity;
local invocation helpers removed that complexity, then the final exact check passed.
Automatic edit feedback used the main checkout to interpret nested-worktree paths
and refused them as unauthored, so it supplied no verdict; the explicit checks above
cover the edited files instead.

### Unrelated exploratory failure

An earlier unfiltered run of the same three test files completed with 30 passing
tests and one failing test: the unchanged `owner-scoped-reads` declared-proof sweep.
Its mustFlag indices 21, 22, 41, 42 and 60 produced additional findings; mustPass
indices 6, 7, 8, 9, 14, 15, 22, 29, 32, 33, 36, 40 and 45 did not pass. Both
membership grant-retirement cases and all 17 ordinary-visitors cases passed.

That exploratory run also detected same-worktree edits made while it was running,
so it is not a clean floor. The final owned run froze the tree and selected only
the relevant controls. No unrelated detector or assertion was changed. Artifact:
`reports/runs/test/codex-wire-chat-rpg-959-3653799-2026-10-15T18-00-39-989Z/test-report.json`.

## Assumptions and remaining dependency

This is checker delivery only; production authn, authz, tenancy and cryptography
are unchanged. Package and canonical-file predicates deliberately retain their
existing definitions, including the canonical DatabankOps file-suffix test. Native
declaration completeness, source epochs, ownership and worker release remain owned
by the existing member-origin family.

The plugin's separate guard-call axis is not migrated by invoked-member delivery.
`negatedGuardCall` still calls `resolveCallableDeclaration`, whose lexical binding
and reassignment normalization can request symbols/checker meaning on the syntax
carrier. `NativeTypeContext` has invoked-member origins but no callable-declaration
fact preserving that reader's aliases, stability, overload and refusal semantics.
Replacing it with a name or annotation check would weaken the guard. This batch
preserves it and reports the exact dependency rather than adding a new family or
schema. The two direct receiver-Type queries are migrated; this does not establish
complete plugin callable delivery or complete item 1027 acceptance.

Whole-tree/application checks, root-program types, native cost qualification and
independent integration review remain main-owned. The authorized final commit uses
`LEFTHOOK_EXCLUDE=check` to avoid duplicating the whole-tree/static hook while
retaining commit-message validation. No human security decision is required for
the unchanged production boundaries; the remaining callable delivery needs its
shared-owner design before it can be claimed complete.
