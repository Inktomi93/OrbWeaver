# 1063-1065: worker lifetime follow-ons

Shared test fixture: `tests/tooling/floor/process/stop-fixture.ts`. A caller module starts a worker thread
that reads `/proc` and freezes (SIGSTOP) the first descendant whose script argument ends with the target,
the instant it has exec'd. It then prints the pid. The fixture SIGTERMs the caller, waits through the
whole TERM-then-KILL escalation by poll count (`settle`), and returns every descendant still alive.
A frozen child cannot honor TERM, so it is gone only if something escalates to KILL.

## 1063: native ESLint worker

`eslint-profile.ts` launches `scripts/eslint.ts` with `supervised: true`. The exit status path is
unchanged: the supervised launcher dies of its child's signal, so `eslintScheme` still sees a null
status (a tool error), and a numeric 0/1/2 passes through as before.

Test: `tests/tooling/verify/ops/eslint-stop.int.test.ts` runs the real `runScopedEslint` on the untyped
`stylelint.config.js`.

Red (source unmodified):

```
   × SIGTERM to a scoped ESLint run ends and joins its native worker 64676ms
AssertionError: every process the stopped ESLint run started: expected [ 766467 ] to deeply equal []
```

Green:

```
   ✓ SIGTERM to a scoped ESLint run ends and joins its native worker 44659ms
```

Related: `eslint-hard.int.test.ts` runs 15 tests, and 4 fail on Vitest's fixed 5 s default timeout at load
average 22. The run without the change fails 4 the same way (3 shared tests plus a 30 s CLI case). That is
host contention, not this change: those tests use a fixed timeout that is not load-scaled. The 11 that
finish, which cover exit codes 0, 1 and 2 through the real runner, pass with the launcher in place.

`pnpm typecheck --config tooling/tsconfig.json`: PASS. Biome on the 3 changed files: clean.
