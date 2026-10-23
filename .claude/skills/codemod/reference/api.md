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
| `pattern: "import $NAME from $SRC"` | code with `$META` single captures and `$$$MULTI` spread captures |
| `kind: "import_statement"` | tree-sitter node kind; list them with `pnpm codemod ai node-types <language>` |
| `regex: "^foo$"` | matches the node text; use on leaves |
| `has: { field: "source", ... }` | a child, optionally in a named field; add `stopBy: "end"` for any descendant |
| `inside: { kind: ... }` | an ancestor; `stopBy: "end"` for any ancestor |
| `precedes`, `follows` | a sibling after or before |
| `any: [...]`, `all: [...]`, `not: {...}` | composition |
| `constraints: { NAME: { regex } }` | restrict a capture |

## SgRoot

`root.root()`, `root.filename()`, `root.relativeFilename()`, `root.rename(path)` once per file.

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

## Edit

```ts
interface Edit { startPos: number; endPos: number; insertedText: string }
```

Positions are UTF-8 byte offsets. An empty `insertedText` deletes. Build edits from `node.range()` or `node.replace()`, never from string searches over `text()`.

## Other modules

| Module | Use |
| - | - |
| `codemod:ast-grep` `parseAsync(language, text)` | parse an embedded language, for example CSS in a template literal |
| `codemod:ast-grep` `jssgTransform(fn, path, language)` | edit a second file from the current one; applied with the primary file |
| `codemod:workflow` `getState`, `setState`, `acquireLock` | shared state across files in one step; lock a read-modify-write |
| `codemod:metrics` | counters for a detection-only run |
| `codemod:runtime` | progress, warnings, explicit failure |

`@jssg/utils/javascript/imports` offers `getImport`, `addImport`, `removeImport`, `updateImport` and `renameReferences`. It is not installed; add it to the catalog when a codemod needs it.

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
