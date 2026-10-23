---
name: codemod
description: Author, test and run a repeatable multi-file rewrite with the pinned `codemod` CLI (JSSG, ast-grep in a sandbox). Use for import rewrites, export retirements, union or type-home moves, and any edit that applies one rule across many files.
---

# Codemod

A codemod is a TypeScript transform over the tree-sitter AST, with fixtures that prove it, run through `pnpm codemod`. Use one when a change applies the same rule to more than a handful of files. Hand-edit when the files differ in judgment, not in shape.

## Layout

Each codemod is one directory under `tooling/src/codemods/`:

| Path | Role |
| - | - |
| `scripts/codemod.ts` | the transform; default export plus an exported `getSelector` |
| `tests/<case>/input.ts` and `expected.ts` | one fixture per case; a `tests/<case>/input/` and `expected/` pair when files are created or deleted |
| `codemod.yaml` | name, description, target languages |
| `workflow.yaml` | one `js-ast-grep` step per language with explicit `include` globs |

`tooling/src/codemods/tsconfig.json` typechecks every `scripts/` file against `@codemod.com/jssg-types`. Fixtures are data: Biome, ESLint, dependency-cruiser and knip skip them.

Copy `tooling/src/codemods/remove-composed-real-warm/` to start a new codemod. Do not run `codemod init`; its scaffold does not typecheck here.

## Author

1. Read `reference/api.md` for the rule keys, node methods and edit contract.
2. Print the AST of a representative input: `echo '<code>' | pnpm codemod ai dump-ast --language typescript`.
3. Write the fixtures first: the positive case, a no-op case with similar code that must stay unchanged, and every shape the tree uses. Grep the tree for the shapes before you guess.
4. Write the rule with `kind` and `has`, `inside` or `pattern`. Use `regex` only on a leaf node's text.
5. Export `getSelector` returning the same rule so unmatched files are skipped.
6. Build every edit from `node.range()` and commit once with `root.root().commitEdits(edits)`. Return `null` when nothing matched.

## Verify

Run from the repository root.

1. `pnpm codemod jssg test -l typescript tooling/src/codemods/<name>/scripts/codemod.ts tooling/src/codemods/<name>/tests`
2. `pnpm typecheck tooling/src/codemods/tsconfig.json`
3. `pnpm codemod workflow validate -w tooling/src/codemods/<name>`
4. Dry-run against the real target and keep the event stream: `pnpm codemod workflow run -w tooling/src/codemods/<name> -t <dir> --dry-run --no-interactive --allow-dirty --format jsonl > <scratch>/dry.jsonl`. The workflow's `include` globs scope each language step. The text format prints no per-file result for a workflow dry run.
5. List the files: `grep -o 'Would modify file (dry run): [^"]*' <scratch>/dry.jsonl`. Compare that set against an independent `rg` of the same shape. Accept only when both differences are empty.
6. Read the diff for the hunk shapes: `pnpm codemod jssg run tooling/src/codemods/<name>/scripts/codemod.ts --language typescript -t <dir> --dry-run --no-interactive --allow-dirty --no-color`. Zero unexpected `+` lines.

`jssg run` takes one language and no `include` globs. Use it for the diff, and for applying only on a single-extension target.

## Apply

1. Run the dry-run command without `--dry-run`.
2. Format the touched files: `pnpm biome format --write <files>`.
3. Run the affected tests and the lint for the touched paths. The commit hook checks staged files.
4. Keep the codemod directory. A rewrite that may recur, or whose fixtures document a shape, stays; delete a one-shot codemod in the same commit that applies it.

## Gotchas

| Fact | Consequence |
| - | - |
| `range().index` and `Edit` positions are UTF-8 byte offsets | Never index `root.text()` by them. Use `new TextEncoder().encode(text)` for byte lookups. |
| `Codemod<T>` must return a `Promise` | Return `Promise.resolve(...)`; Biome refuses an `async` function with no `await`. |
| `--language typescript` skips `.tsx`; `--language tsx` also visits `.ts` and parses it with the TSX grammar | Give a mixed target one workflow step per language with `include` globs. |
| tree-sitter parses `await using x = ...` as `await (using = ...)` | No `ERROR` node appears. Do not target explicit resource management declarations. |
| The fixture argument is the parent `tests/` directory | Use `--filter <case>` to run one case. |
| The transform is the module's default export | `biome.json` turns `noDefaultExport` off for `tooling/src/codemods/*/scripts/*.ts`. |
| Fixtures run in test mode | `jssgTransform` to secondary files is a no-op there; cover multi-file edits with a directory fixture. |
| The sandbox denies `fetch`, `child_process` and disk outside the target | Declare a capability in `codemod.yaml` only when the transform needs it. No codemod here does. |
| `validate_codemod_package` wants a `package.json` and `README.md` | It checks registry packages. Use `codemod workflow validate` here. |

## Reference

- `reference/api.md`: the JSSG API and rule syntax used here.
- `pnpm codemod ai docs <name>`: the upstream docs offline, for example `jssg-instructions`, `jssg-utils-instructions`, `jssg-runtime-capabilities-instructions`.
- `pnpm codemod ai node-types typescript`: the node kinds and fields of a language.
