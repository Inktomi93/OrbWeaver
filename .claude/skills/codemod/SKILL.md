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
| `tests/<case>/input.ts` and `expected.ts` | one fixture per case; a `tests/<case>/input/` and `expected/` pair when files are created or deleted, or when the codemod reads a config file from the target |
| `tests-crossfile/<case>/input/` and `expected/` | a case that needs cross-file semantic resolution; verify it through `jssg run`, not `jssg test` |
| `scripts/<second>.ts` with `tests-<second>/` | a second transform in the same codemod; its fixtures prove that script, not `scripts/codemod.ts` (`tooling/src/codemods/plugin-node-sources/scripts/node-schemas.ts`) |
| `codemod.yaml` | name, description, target languages |
| `workflow.yaml` | one `js-ast-grep` step per language with explicit `include` globs |

`tooling/src/codemods/tsconfig.json` typechecks every `scripts/` file against `@codemod.com/jssg-types`. Fixtures are data: Biome, ESLint, dependency-cruiser and knip skip them.

Copy the closest existing codemod to start a new one. Do not run `codemod init`; its scaffold does not typecheck here.

| Codemod | Shape it shows |
| - | - |
| `remove-composed-real-warm` | delete a matched statement with its line |
| `string-union-to-tuple` | insert a declaration and rewrite a node, comments preserved |
| `rewrite-import-specifiers` | config read from the target directory, workflow `params` |
| `rename-identifier` | semantic `references()` with cross-file `root.write()` |

## Author

1. Find the root type or source first. Fixing one `any` source often clears every site. An identity wrapper that only quiets a rule is not a fix.
2. Read `reference/api.md` for the rule keys, node methods and edit contract.
3. Print the AST of a representative input: `echo '<code>' | pnpm codemod ai dump-ast --language typescript`.
4. Write the fixtures first: the positive case, a no-op case with similar code that must stay unchanged, and every shape the tree uses. Grep the tree for the shapes before you guess.
5. Write the rule with `kind` and `has`, `inside` or `pattern`. Use `regex` only on a leaf node's text.
6. Export `getSelector` returning the same rule so unmatched files are skipped. A workflow run uses it; `jssg run` does not load the workflow's filters.
7. Build every edit from `node.range()` and commit once with `root.root().commitEdits(edits)`. Return `null` when nothing matched.
8. Match only the pre-change shape, so a rerun changes nothing.
9. When a rule keys on a component or function name, prove the name with `importBindingOf`, never by its text. See `reference/api.md`.
10. Count each edit and each skip reason with `codemod:metrics`, so a run reconciles against its plan.
11. When the rewrite claims type equivalence, add an assert mode that proves each site first. See "Assert mode".
12. When the rewrite adds a call to a helper, skip the helper's own file. Cover it with a fixture.
13. When the rewrite adds a value import, never merge it into an `import type` line. Cover it with a fixture; `tooling/src/codemods/trpc-error-code/scripts/codemod.ts` shows the check.
14. Skip callbacks that run in another realm and cover them with a no-op fixture. See "Gotchas".
15. Ship a one-off ast-grep rewrite over more than a handful of files as a codemod with fixtures. The codemod engine is ast-grep, so a script loses only the fixtures, the dry-run diff and the kept transform.
16. Write a codemod instead of running `eslint --fix` over the tree. A bulk fixer can write unparseable code, weaken assertions and change truthiness. Read a rule's fixer before you run it.

## Assert mode

A rewrite that changes a type proves the new type is not wider. A wider type compiles at every call site, so a green typecheck proves nothing. `tooling/src/codemods/vars-to-infer-input/scripts/codemod.ts` shows the shape.

1. Run the codemod with a `mode` param set to `assert`. It appends one `[New] extends [Old]` check per planned site. Use this relation, not identity: identity also fails on `readonly`, which pushes a run to skip the check. Fail `any` first with `0 extends 1 & New`, because `any` passes the relation.
2. Run `pnpm typecheck` on the target. The type checker proves each site.
3. Mark each passing site as proved in the plan, keyed to the site and never to its type text alone. Remove every failing site and list it with a reason under `skip`.
4. Run the rewrite. It rewrites only proved sites, prints a reason for any other, and deletes the appended check lines in the same pass.

## Verify

Run from the repository root.

1. `pnpm codemod jssg test -l typescript tooling/src/codemods/<name>/scripts/codemod.ts tooling/src/codemods/<name>/tests`. `pnpm test:tools tests/tooling/codemods/fixtures.suite.repo.int.test.ts` runs every codemod's fixtures.
2. `pnpm typecheck tooling/src/codemods/tsconfig.json`
3. `pnpm codemod workflow validate -w tooling/src/codemods/<name>`
4. Dry-run against the real target and keep the event stream: `pnpm codemod workflow run -w tooling/src/codemods/<name> -t <dir> --dry-run --no-interactive --allow-dirty --format jsonl > <scratch>/dry.jsonl`. The workflow's `include` globs scope each language step. The text format prints no per-file result for a workflow dry run.
5. List the files: `grep -o 'Would modify file (dry run): [^"]*' <scratch>/dry.jsonl`. Compare that set against an independent `rg` of the same shape. Explain each difference in either direction, so you prove what the transform skipped. Accept only when no difference stays unexplained.
6. Check edit and skip counts against the plan. Time a no-op on the same target when a run feels slow: the codemod should sit near it.
7. Read the diff for the hunk shapes: `pnpm codemod jssg run tooling/src/codemods/<name>/scripts/codemod.ts --language typescript -t <dir> --dry-run --no-interactive --allow-dirty --no-color`. Zero unexpected `+` lines.

`jssg run` takes one language and no `include` globs. Use it for the diff, and for applying only on a single-extension target.

## Apply

1. Run the dry-run command without `--dry-run`.
2. Rerun the dry run. It must report zero changes.
3. Run `pnpm typecheck` and `pnpm lint:eslint` on the touched paths, then Biome: `pnpm biome format --write <files>`. Typecheck alone misses lint findings.
4. Remove unused imports the rewrite left, with a scoped removal over the touched files.
5. Run the affected tests. The commit hook checks staged files.
6. Keep the codemod directory. A rewrite that may recur, or whose fixtures document a shape, stays; delete a one-shot codemod in the same commit that applies it.

## Mass migration

Run a rewrite that a census can list as one workflow. The census is the plan and the proof.

1. Add the missing owner by hand first: the recipe value, token or primitive. A codemod moves a site only to an owner that exists.
2. Plan: a `run:` step writes the map into the target directory from the census output. Keep the map out of the commit.
3. Rewrite: one `js-ast-grep` step per language, with `semantic_analysis: workspace` when a rule keys on a component.
4. Format: a `run:` step formats the touched files with Biome.
5. Prove: a `run:` step reruns the census. The owner's count reaches zero, or each remaining site has a skip reason.
6. Check: a `run:` step typechecks the touched programs. Run the affected tests.
7. Close: turn on a lint rule at zero, so the shape cannot return.

- Treat a site as mechanical only when the owner writes exactly what it replaces. Send any other site to review.
- Gate the apply steps with `if: params.apply == "yes"`.
- Run the plan step before a dry run, because `--dry-run` skips every `run:` step.
- Stop a run with `failStep` when the plan and the tree disagree. Report a skipped site with `warn`.
- Migrate a `component.axis` recipe owner with `pnpm migrate-owner <owner>`: a dry run that plans and previews. Add `--apply` to rewrite, format, prove and typecheck. The workflow is `tooling/src/codemods/class-token-to-prop/workflow.yaml`.
- The workflow refuses `apply=yes` without the marker `pnpm migrate-owner` passes. A workflow has no step that runs after a failure, so the command owns the transaction: its dry run stops a plan that disagrees with the tree before any write, the real recipes judge each changed element before the apply is accepted, and a failed or interrupted apply restores every planned file.
- Prove a move before you plan it. `tooling/src/ui-facts/move-proof.ts` states the rule: nothing that renders after the axis's slot conflicts with the class, and the variant value the prop selects does exactly what the class did.

## Gotchas

| Fact | Consequence |
| - | - |
| `range().index` and `Edit` positions are UTF-8 byte offsets | Never index `root.text()` by them. Use `new TextEncoder().encode(text)` for byte lookups. |
| Each file runs in a fresh QuickJS runtime | A module-level cache dies between files. Share through `codemod:workflow` state under `acquireLock`, in small per-file pieces. |
| Semantic analysis gives bindings, not types | Run `tsc` after a rewrite that depends on a type. Under `jssg run`, pass `--semantic-workspace <root>`. |
| `Codemod<T>` must return a `Promise` | Return `Promise.resolve(...)`; Biome refuses an `async` function with no `await`. |
| `--language typescript` skips `.tsx`; `--language tsx` also visits `.ts` and parses it with the TSX grammar | Give a mixed target one workflow step per language with `include` globs. |
| tree-sitter parses `await using x = ...` as `await (using = ...)` | No `ERROR` node appears. Do not target explicit resource management declarations. |
| The fixture argument is the parent `tests/` directory | Use `--filter <case>` to run one case. |
| The transform is the module's default export | `biome.json` turns `noDefaultExport` off for `tooling/src/codemods/*/scripts/*.ts`. |
| Fixtures run in test mode | `jssgTransform` to secondary files is a no-op there; cover multi-file edits with a directory fixture. |
| The sandbox denies `fetch`, `child_process` and disk outside the target | Declare a capability in `codemod.yaml` only when the transform needs it. No codemod here does. |
| `validate_codemod_package` wants a `package.json` and `README.md` | It checks registry packages. Use `codemod workflow validate` here. |
| `jssg test --semantic-workspace` resolves bindings within one fixture file only | Keep a cross-file case under `tests-crossfile/` and prove it with `jssg run --semantic-workspace <copy>` against its `expected/`. |
| Cross-file edits order-dependent through `definition()` | Edit from the declaring file: `declaration.references()` then `fileRoot.write(...)`; `jssgTransform` and `write` are no-ops under `jssg test`. |
| jssg-types declares `fs` and `path`, not `node:fs` and `node:path` | Import the bare names in a codemod; `biome.json` turns `useNodejsImportProtocol` off for codemod scripts. |
| `page.evaluate`, `evaluateAll`, `evaluateHandle`, `waitForFunction`, `addInitScript`, `$eval` and `$$eval` serialize their callback to the browser | An imported helper does not exist there. Skip these callbacks; typecheck passes, so only ESLint's error-typed argument shows the break. |
| A bare pattern such as `case $S:` matches nothing in ast-grep | Write the whole node, for example `switch ($X) { case $S: $$$B }`. |
| A metavariable cannot match inside a string literal | Match the string node and test its text. |
| ast-grep exits 1 on no match, and on a wrong language or path | Count such shapes from another source. A zero count proves nothing. |

## Reference

- `reference/api.md`: the JSSG API and rule syntax used here.
- `pnpm codemod ai docs <name>`: the upstream docs offline, for example `jssg-instructions`, `jssg-utils-instructions`, `jssg-runtime-capabilities-instructions`.
- `pnpm codemod ai node-types typescript`: the node kinds and fields of a language.
