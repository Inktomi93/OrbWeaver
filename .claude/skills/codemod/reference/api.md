# JSSG API used in this repository

Source: `pnpm codemod ai docs jssg-instructions` and `jssg-utils-instructions`. This page holds the subset a codemod here needs.

## Transform contract

```ts
import type { Codemod, Edit, GetSelector } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

export const getSelector: GetSelector<TS> = () => RULE;

const codemod: Codemod<TS> = async (root, options) => {
  // options.language, options.params, options.matches (selector hits), options.matrixValues, options.targetDir
  return null; // string = new source; null or undefined = unchanged
};
export default codemod;
```

Languages: `codemod:ast-grep/langs/typescript`, `tsx`, `javascript`, `css`, `json`, `yaml`, `toml`, `html`, `python`, `rust`, `go`, `java`.

## Rule object

| Key | Meaning |
| - | - |
| `pattern: "import $NAME from $SRC"` | code with `$META` single captures and `$$$MULTI` spread captures; `$NAME:kind` restricts a capture to one node kind |
| `kind: "import_statement"` | tree-sitter node kind; list them with `pnpm codemod ai node-types <language>` |
| `regex: "^foo$"` | matches the node text; use on leaves |
| `has: { field: "source", ... }` | a child, optionally in a named field; add `stopBy: "end"` for any descendant |
| `inside: { kind: ... }` | an ancestor; `stopBy: "end"` for any ancestor |
| `precedes`, `follows` | a sibling after or before |
| `any: [...]`, `all: [...]`, `not: {...}` | composition |
| `constraints: { NAME: { regex } }` | restrict a capture |

## SgRoot

`root.root()`, `root.filename()`, `root.relativeFilename()`, `root.rename(path)` once per file. On a root obtained from `definition()` or `references()`, `root.write(content)` saves that other file; it is a no-op under `jssg test`.

## SgNode

| Group | Methods |
| - | - |
| search | `find(rule)`, `findAll(rule)`, `matches(rule)`, `inside(rule)`, `has(rule)` |
| walk | `parent()`, `children()`, `child(i)`, `next()`, `prev()`, `nextAll()`, `prevAll()`, `ancestors()` |
| fields | `field(name)`, `fieldChildren(name)` |
| facts | `text()`, `kind()`, `is(kind)`, `range()`, `id()`, `isNamed()`, `isLeaf()` |
| captures | `getMatch("NAME")`, `getMultipleMatches("NAME")` |
| edit | `replace(text)` returns an `Edit`; `commitEdits(edits)` on the root node returns the new source |
| semantic | `definition()`, `references()`; JavaScript and TypeScript only; cross-file with `--semantic-workspace <root>` |

`range()` returns `{ start, end }` with `line`, `column` and `index`. `index` is a UTF-8 byte offset.

Semantic analysis gives bindings, not types. To prove which component a JSX name is:

1. Set `semantic_analysis: workspace` on the workflow step. Target the package root so the other package is indexed.
2. Call `importBindingOf(name)` for the imported name and its module.
3. To reach the source, call `definition()` on the name, then on the `import_specifier` it returns. The second call gives `kind: "external"` and the barrel in the other package. Each barrel costs one more hop.

Run `tsc` after the rewrite for anything that needs a type.

## Edit

```ts
interface Edit { startPos: number; endPos: number; insertedText: string }
```

Positions are UTF-8 byte offsets. An empty `insertedText` deletes. Build edits from `node.range()` or `node.replace()`, never from string searches over `text()`.

## Other modules

| Module | Use |
| - | - |
| `codemod:ast-grep` `parse(language, text)`, `parseAsync(language, text)` | parse an embedded language, for example CSS in a template literal |
| `codemod:ast-grep` `jssgTransform(fn, path, language)` | edit a second file from the current one; applied with the primary file |
| `codemod:workflow` `getState`, `setState`, `acquireLock` | shared state across files in one step; lock a read-modify-write |
| `codemod:metrics` | `useMetricAtom(name).increment(labels)`; counts print at the end of a run, so use it to count edits and skip reasons |
| `codemod:runtime` | `progress`, `warn`, `failFile`, `failStep`, `isCanceled`; prefer these to a thrown error, which logs less context |

`@jssg/utils` runs inside the sandbox. The catalog pins it and `tooling/package.json` declares it, because Biome and knip read the nearest package.

| Subpath | Use |
| - | - |
| `@jssg/utils/javascript/imports` | `getImport`, `getAllImports`, `addImport`, `removeImport`, `updateImport` |
| `@jssg/utils/javascript/bindings` | `importBindingOf(node)` gives `{ importedName, localName, source }`, or `null` for a local name; `resolveDefinition(node)` follows one import |

Use `importBindingOf` to prove what a name is. It handles an alias, and it returns `null` for a local name that shadows an import. Read `pnpm codemod ai docs jssg-utils-instructions` for the rest.

## Workflow steps

A workflow can run a whole migration: plan, rewrite, format and check. Order the nodes with `depends_on`.

| Field or step | Use |
| - | - |
| `run:` | a host shell step; it runs in the directory that called the CLI, and `$CODEMOD_PATH` is the codemod directory |
| `js-ast-grep:` | a JSSG step; add `semantic_analysis: workspace` for cross-file bindings |
| `ast-grep:` | a YAML rule step, for a rule that needs no code |
| `if:` | gate a step on `params.x`, `state.x` or `matrix.x` |
| `depends_on:` | run this node after the named nodes |
| `strategy:`, `shard:` | fan a node out; shards and commit checkpoints target Campaign runs, so a local run here does not need them |
| `ai:` | hand a step to a coding agent; do not use it, because a rewrite here stays deterministic |

`--dry-run` skips every `run:` step. Run the plan step by hand before a dry run that reads its output.

`jssg run --max-threads <n>` limits parallel files on a shared box. `--report` opens a web report of a run.

## Commands

| Command | Use |
| - | - |
| `pnpm codemod jssg test -l <lang> <codemod.ts> <tests dir>` | run fixtures; `-u` rewrites expected files; `--strictness ast` ignores formatting |
| `pnpm codemod jssg run <codemod.ts> --language <lang> -t <dir> --dry-run --no-interactive --allow-dirty --no-color` | preview the diff on a real tree |
| `pnpm codemod workflow validate -w <codemod dir>` | check `workflow.yaml` |
| `pnpm codemod workflow run -w <codemod dir> -t <dir>` | run every step |
| `echo '<code>' \| pnpm codemod ai dump-ast --language <lang>` | print the node tree |
| `pnpm codemod ai node-types <lang>` | list kinds and fields |
| `pnpm codemod ai docs <resource>` | read upstream docs offline |
