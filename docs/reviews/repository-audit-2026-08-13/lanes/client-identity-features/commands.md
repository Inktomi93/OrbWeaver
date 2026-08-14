# Command receipts

Working-tree basis: `c93253a3f907fb7fd93d411c511a98ed378505db`; the 181 assigned paths were clean before the read barrier.

## Read and hash barrier

```text
assignment reconciliation (lines, bytes, SHA-256): 0 mismatches
assigned=181
assigned_lines=20745
assigned_bytes=1026417
initial_dirty_assigned=0
full_read_completed=181
```

`scripts/codemods/ast.ts` was read in full (4,099 lines; 223,111 bytes), then bare `pnpm ast` was run. It advertised the repository-native resolution-aware `refs`, `exports`, `orphans`, and related lenses.

## Structural receipts

```text
pnpm ast exports packages/client/src/features/character --files
RESULT: 130 exports in 53 files
pnpm ast exports packages/client/src/features/credentials --files
RESULT: 70 exports in 17 files
pnpm ast exports packages/client/src/features/persona --files
RESULT: 36 exports in 17 files
pnpm ast exports packages/client/src/features/user-admin --files
RESULT: 98 exports in 48 files
```

Resolution-aware live-path receipts:

```text
pnpm ast refs CharacterLibraryAnchor --in packages/client --max 30
definition + barrel + characters-section import/JSX: 5 hits in 3 files
pnpm ast refs makeCharactersSection --in packages/client --max 30
definition + barrel + packages/client/src/main.tsx composition: 4 hits in 3 files
pnpm ast refs connectionsPane --in packages/client --max 30
definition + barrel + packages/client/src/main.tsx registry: 4 hits in 3 files
pnpm ast refs ConnectionsSettingsSurface --in packages/client --max 30
definition + connections-pane surface render: 3 hits in 2 files
pnpm ast refs PersonaPanelSurface --in packages/client --max 30
persona chrome and persona-settings-surface consumers: 5 hits in 3 files
pnpm ast refs FirstRunPersonaDialog --in packages/client --max 30
definition + barrel + packages/client/src/routes/app-root.tsx JSX: 4 hits in 3 files
pnpm ast refs adminPane --in packages/client --max 30
definition + barrel + packages/client/src/main.tsx registry: 4 hits in 3 files
pnpm ast refs useCreateUser --in packages/client --max 30
admin-create-user-dialog import/call: 3 hits in 2 files
```

Assigned-language denominator: 63 `.ts` and 118 `.tsx` files (181 total); source is 139 files / 13,681 lines / 649,960 bytes and tests/support are 42 files / 7,064 lines / 376,457 bytes. These are the read-receipt denominator, not an AST engine scan count.

Attempted broad resolution lenses:

```text
pnpm ast orphans packages/client/src/features/{character,credentials,persona,user-admin} --files
```

Each job exceeded the terminal's 30-second foreground window without emitting a result. Attempts to detach them (including `nohup`) were terminated with their shell process; each scratch log remained empty. No zero/absence claim relies on these jobs. This is a terminal/invocation limitation, not a source finding.

## Behavioral receipts

```text
pnpm exec vitest run --project unit \
  tests/client/features/character/lib/character-card-form-model.test.ts \
  tests/client/features/character/lib/character-list-view.test.ts \
  tests/client/features/character/lib/character-theme-form-model.test.ts \
  tests/client/features/character/lib/example-messages.test.ts \
  tests/client/features/character/lib/filter-characters.test.ts \
  tests/client/features/credentials/lib/connections-model.test.ts \
  tests/client/features/credentials/lib/model-picker-model.test.ts \
  tests/client/features/persona/lib/persona-editor-model.test.ts

Test Files  8 passed (8)
Tests       101 passed (101)
Duration    2.00s
```

The original agent could not execute the component scope because its command boundary rejected the cache deletion. That limitation is superseded by the coordinator receipt below. The “34 component-test files” wording also conflated 29 executable `.ct.tsx` paths with five `_ct-stories.tsx` support modules.

## Literal cross-check

`rg -n --glob '*.{test,ct}.tsx' 'FirstRunPersonaDialog|firstRunPersona' tests/client` found the app-root CT coverage outside this lane at `tests/client/routes/app-root.ct.tsx:196`, `:206`, `:208`, and `:223`. It confirms this lane's first-run dialog has a cross-lane test consumer; it is not counted as this lane's current execution receipt.

## Coordinator exact-scope CT correction

- `pnpm test:ct <the 29 OWNED .ct.tsx paths from assignment.txt>` exited 0 with `243 passed · 0 failed · 0 flaky · 0 skipped`.
- Fresh `reports/ct-report.json` recorded `expected=243`, `unexpected=0`, `flaky=0`, `skipped=0`, duration 64.703s, and named exactly the 29 assigned character/credentials/persona/user-admin CT files.
- The sanctioned package command accepts paths directly; no extra `--` separator was used.
