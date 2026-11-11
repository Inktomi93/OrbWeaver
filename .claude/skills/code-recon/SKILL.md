---
name: code-recon
description: How to hunt through a codebase and prove what you find — ast-grep run/outline/scan usage, pattern and YAML-rule gotchas, the TS/TSX split, property-read node kinds, scanned-file counts, tree and git ls-files inventory, rg flag hazards, and proving absence with two methods. Use when locating symbols, call sites, signatures, imports/exports, tracing a value across modules, claiming something is unused or missing, or mapping a repo before reading source.
---

# Code recon

The evidence standards (evidence ladder, no-matches is not absence, TS vs TSX, the three
property-read kinds, `tree -L`, partial reads, filtering with flags, `path:line` receipts) live in
`~/.claude/CLAUDE.md`, "Code recon — evidence standards". This file is the how-to for meeting
them. Written against ast-grep 0.45.0, ripgrep 14.1.0, tree 2.1.1; where it and `<tool> --help`
disagree, the CLI wins.

## Picking the tool

| Question | Tool |
|---|---|
| Shape of the repo | `tree -d --gitignore <path>` |
| Which files exist | `git ls-files <path>`; outside git, `find <path> -type f -not -path '*/.git/*'` |
| What's in a file or directory | `ast-grep outline` |
| Where is a code shape (call, signature, JSX, import) | `ast-grep run -p` |
| X inside Y, X without Z, one item in a list | `ast-grep scan --inline-rules` |
| Where is a literal (config key, message, CSS `@import`) | Grep tool / `rg` |
| What does it do | `Read` the whole file |

Invoke `ast-grep`, never `sg` (often `newgrp`). Check `command -v ast-grep` up front; if it is
missing, say so and label findings as Grep/Read-verified.

## Inventory: tree and ls-files

```bash
git ls-files <p> | awk -F/ '{print NF}' | sort -n | uniq -c   # depth histogram
tree -d --gitignore <p>                     # full-depth directory map (--gitignore is off by default)
tree --gitignore --filelimit 50 <p>         # full depth, skips huge dirs and marks the skip
tree -f -P '*.test.ts' --prune <p>          # glob match with full paths; -P without --prune keeps empty dirs
tree -I 'node_modules|dist' <p>             # excludes, |-separated;  -J for JSON
```

Take counts from `git ls-files`, never from a `tree` summary line.

## ast-grep outline

```bash
ast-grep outline <file>                     # default: --items structure --view digest
ast-grep outline <dir>                      # default: --items exports --view names
```

- `--items auto|structure|exports|imports|all`
- `--view names|signatures|digest|expanded` (least to most; `expanded` adds a line per member)
- `--type class,function` and `--match <regex>` filter top-level items only, never members.
  `--match` checks name, signature, and first line; Rust regex, `(?i)` works.
- Also: `--pub-members`, `-l` (required with `--stdin`), `--globs`, `--no-ignore`,
  `--json[=pretty|stream|compact]`, `--outline-rules <file>`, `--no-default-outline-rules`.

```bash
ast-grep outline src/parser.ts --match Parser --type class --view expanded
ast-grep outline src --items imports --match 'some-module' --view signatures   # importers
ast-grep outline $(git diff --name-only main...HEAD) --items exports --view signatures
ast-grep outline src --json=stream | jq -r '.items[] | select(.symbolType=="function") | .name'
```

JSON: one `{path, language, items[]}` per file; items have `name`, `symbolType`, `isImport`,
`isExported`, `signature`, zero-based `range`, optional `members[]`. Exit 0 includes an empty
outline, which can mean an uncovered syntax or a genuinely empty barrel; read the file. Outline
resolves no references, types, re-exports, or calls. It works beyond TS (C#, Rust, Go, ...).

## ast-grep run

`ast-grep run -p '<pattern>' -l <lang> [PATHS]` (default subcommand; paths default to `.`). A
pattern is parseable code; it ignores formatting and never matches inside strings or comments.

| Syntax | Meaning |
|---|---|
| `$VAR` | one named node; name must match `[A-Z_][A-Z0-9_]*` (`$foo`, `$1` match literally) |
| `$$$`, `$$$ARGS` | zero or more nodes |
| `$$VAR` | one unnamed node |
| `$_`, `$_X` | non-capturing |
| repeated `$A` | back-reference: `$A == $A` matches `a == a` only |

```
-k, --kind <KIND>            node kind; ESQuery selectors allowed ('call_expression > identifier')
--selector <KIND>            with -p: which sub-node of the pattern is the matcher
--strictness cst|smart|ast|relaxed|signature|template   (default smart)
-A/-B/-C <N>                 context lines
--files-with-matches         paths only
--json[=pretty|stream|compact]   value needs '='
--inspect summary            scannedFileCount/skippedFileCount on stderr
--debug-query[=pattern|ast|cst|sexp]
--globs '<glob>'             repeatable, '!' excludes, overrides ignore logic
--no-ignore <hidden|dot|exclude|global|parent|vcs>   one value per flag, repeat the flag
--stdin, --follow, -j/--threads
```

`--no-ignore hidden,vcs` is rejected; write `--no-ignore hidden --no-ignore vcs`. Default
traversal skips `.gitignore`d, hidden, and parent-ignored paths. Exit codes: 0 match, 1 no match
(also when zero files were scanned), 2 error.

### Languages

| `-l` | Extensions walked in a directory |
|---|---|
| `ts` | `.ts`, `.mts`, `.cts` (not `.tsx`) |
| `tsx` | `.tsx` only |
| `js` / `jsx` | one language: `.js`, `.jsx`, `.mjs`, `.cjs` |

```bash
for l in ts tsx; do ast-grep run -p '<pattern>' -l $l <paths> --inspect summary --json=stream; done
```

An explicit file path is parsed as the given `-l` regardless of extension. Check support first:
`ast-grep run -p '$A' -l <lang> /dev/null`. Unsupported is a hard error (`<lang> is not
supported!`); supported-but-no-files is a silent `scannedFileCount=0`. In a polyglot repo, name
the files you could not parse.

### Property reads

| Source | Node | Pattern |
|---|---|---|
| `x.foo` | `member_expression` | `$X.foo` |
| `x?.foo` | `member_expression` + `optional_chain` | `$X?.foo` |
| `x["foo"]` | `subscript_expression` | `$X["foo"]` |

Each pattern matches only its own form. Run all three.

### Lenses

```bash
ast-grep run -p 'someSymbol' -l ts <p>          # identifier uses, minus comments and strings
ast-grep run -p 'someFn($$$)' -l ts <p>         # calls; also '$OBJ.someFn($$$)' for methods
ast-grep run -p '<Comp $$$/>' -l tsx <p>        # JSX; also '<Comp $$$>$$$</Comp>'
ast-grep run -p '<pattern>' -l ts <p> -B 3      # see the comment above a hit before judging it
```

Capture import specifiers instead of hardcoding them (`"@scope/ui"` misses `@scope/ui/button`):

```bash
for l in ts tsx; do
  for pat in 'import { $$$N } from "$SRC"' 'import type { $$$N } from "$SRC"' \
             'import $D from "$SRC"' 'import * as $NS from "$SRC"' \
             'export { $$$E } from "$SRC"' 'export * from "$SRC"' 'export * as $NS from "$SRC"'; do
    ast-grep run -p "$pat" -l $l <p> --json=stream | jq -r '.metaVariables.single.SRC.text'
  done
done | sort | uniq -c | sort -rn
```

Single captures sit at `.metaVariables.single.<NAME>.text`, `$$$` captures under
`.metaVariables.multi.<NAME>`. Send `--inspect` to its own file (`2>inspect.txt`) when stdout
goes to jq.

### Strictness and context

`smart` skips unnamed target nodes, so `function $A() {}` also matches `async function a() {}`.
To audit `async`, modifiers, or punctuation, use `--strictness cst` or match kinds. `relaxed`
also ignores comments; `signature` compares kinds only; `template` compares text only.

Code that is ambiguous alone needs context plus a selector. `$FIELD = $INIT` parses as an
assignment and never matches a class field:

```bash
ast-grep run -p 'class A { $FIELD = $INIT }' --selector public_field_definition -l ts <p>
```

### When a pattern returns nothing

1. Wrong `-l`, or `scannedFileCount=0`.
2. Paths ignored: add `--no-ignore vcs --no-ignore hidden` or `--globs`.
3. Pattern parsed as something else: `ast-grep run -p '<pattern>' -l ts --debug-query=ast /dev/null`
   (the path is never read; `=cst` shows unnamed nodes). An `ERROR` node means invalid code.
4. Invalid metavariable name.
5. Positional pattern against a list (below).
6. Strictness.
7. `-k` with `-p` ANDs two rules; it does not change how the pattern parses. Use `--selector`.

To learn a grammar's kind names, write the target code and `--debug-query=ast` it.

## ast-grep scan: YAML rules

```bash
ast-grep scan --inline-rules 'id: t
language: typescript
rule:
  kind: import_specifier
  has: { field: alias, kind: identifier }' <paths> --json=stream
echo '<snippet>' | ast-grep scan --inline-rules '...' --stdin     # test on a snippet
```

- Single-quote the rule text so the shell leaves `$META` alone (or `\$META` inside double quotes).
- `---` separates several rules. `--inline-rules` conflicts with `-r/--rule <file>`.
- `language:` is per rule; TS needs a second run with `language: tsx`.
- `scan` exits 0 whether or not it matched. Count `--json=stream | wc -l` or use
  `--files-with-matches`. `--max-results <N>` stops early.
- Run a new rule on a snippet with one known positive and one known negative before trusting
  its zero.

### Positional patterns vs member rules

A pattern encodes siblings too. `import { $X as $Y } from "$S"` misses
`import { keep, Multi as M1 } from "./m2"`; `{ carrierField: $V }` misses an object with other
keys. For one member of a list (argument, key, specifier), target the member's kind:

```yaml
rule:
  any:
    - { kind: import_specifier, has: { field: alias, kind: identifier } }
    - { kind: export_specifier, has: { field: alias, kind: identifier } }
---
rule:                                    # object key anywhere in the literal
  kind: pair
  has: { field: key, regex: '^carrierField$' }
```

### Rule syntax

```yaml
pattern: console.log($ARG)             # or {context, selector, strictness}
kind: if_statement
regex: '(?i)^apple'                    # Rust regex on node text, no lookaround/backrefs; pair with kind
nthChild: 2                            # 1-based, named siblings; or {position, reverse, ofRule}
range: {start: {line: 0, column: 0}, end: {line: 1, column: 5}}   # 0-based, end-exclusive
```

- Relational `inside`/`has`/`follows`/`precedes`: `stopBy` defaults to `neighbor` (one level), so
  `has: {pattern: await $E}` on a function misses an `await` inside an `if`. Write
  `stopBy: end` unless you mean direct child. `field:` matches by role (`key` vs `value`).
- A relational rule needs a positive matcher: `has: { field: alias }` alone errors.
- `all`/`any` combine rules on one node. `has: { all: [{kind: number}, {kind: string}] }` asks for
  one child that is both; write `all: [ {has: {kind: number}}, {has: {kind: string}} ]`.
- Sibling keys are an implicit `all` with no order; use an explicit `all` when a rule needs an
  earlier capture.
- `matches: <id>` references a rule from `utils:` in the file or from `utilsDirs`.
- Comments are sibling nodes: `kind: export_statement` + `not: { follows: { kind: comment } }`
  finds undocumented exports. `export const x = 1` is an `export_statement`, not a
  `lexical_declaration`.

## Tracing a value across modules

Follow the carrier field (the property on the context, DTO, or state object); function names
change across the seam, the field name usually doesn't.

```bash
for l in ts tsx; do
  for p in '$X.carrierField' '$X?.carrierField' '$X["carrierField"]'; do
    ast-grep run -p "$p" -l $l <p> --json=stream
  done
done | jq -r '"\(.file):\(.range.start.line+1)"' | sort -u      # reads
```

Writes need the `kind: pair` rule, once per language. Then read producer and consumers in full.

## Reachability limits

ast-grep has no module resolution, binding, or types; its orphan and fan-in counts are
candidates. Prefer the repo's resolution-based lens (orbweaver: `pnpm ast`) or a checked-in
generated report, and cite which you used. Before calling a JS/TS module unimported, check:

- package specifiers with subpaths, and relative paths (resolve them yourself);
- `#` aliases: `jq -r '.imports // {} | keys[]' package.json`;
- barrels (`export *`, `export { x } from`); a re-export is pass-through, not use;
- dynamic `import()`, scripts invoked from `package.json`, CSS `@import` (literal search);
- consumers with no import: RPC proxies, DI, string-keyed registries, file-based routing.
  Enumerate provider keys and consumer accesses, then diff.

Other ecosystems wire differently (C# `.csproj` `<ProjectReference>` plus DI registration, Python
entry points and `importlib`, Spring annotations, Go build tags, Rust `cfg`); find the mechanism
before treating a missing reference as dead. Code under `#if`/build tags/`cfg` parses normally
but may not ship; say which configuration a finding applies to. Check what a manifest is for
before trusting it (a root `package.json` in a .NET repo may exist only for a linter).

For a layering claim, aggregate resolved `(importer, specifier)` edges, then search directly for
each edge you claim is absent.

## rg

```bash
rg -n 'literal' --type ts <p>               # --type ts covers .ts .tsx .mts .cts
rg -n -F 'a.b(c)' <p>                       # fixed string
rg -n -w 'name' <p>                         # word boundaries
rg --files-with-matches 'x' <p>             # or --count
rg -n -U 'foo\(\s*bar' <p>                  # multiline
rg -n --glob '!**/*.test.*' 'x' <p>
rg --no-ignore --hidden 'x' <p>             # same as -uu
rg --stats 'x' <p>                          # adds "N files searched"
rg --files --type ts <p>                    # the file set it would search
```

- `-r` is `--replace` and consumes the following text. `-rln` means "replace with `ln`" and
  prints rewritten lines instead of listing files. Spell flags out separately.
- Bare `grep` in Claude Code's Bash is a ugrep wrapper passing `-I` (skips binary-looking files);
  use `/usr/bin/grep -a` or `rg` when that matters.

## Proving absence

Two methods, each with a non-zero scan count reported beside the zero:

```bash
for l in ts tsx; do ast-grep run -p 'eval($$$)' -l $l . --no-ignore vcs --no-ignore hidden --inspect summary; done
rg --stats -n 'eval\(' --type ts --type js --no-ignore --hidden .
```

If neither method can see the relevant mechanism (DI, reflection, codegen, dynamic dispatch), say
which one was invisible instead of calling the thing absent.
