---
paths:
  - "packages/**"
  - "tooling/**"
  - "tests/**"
  - "scripts/**"
---

# Code comments

The comment rules for code. Prose in docs and instruction files follows `.claude/rules/writing.md`.

## Before you write a comment

Take the first step that applies:

1. Refactor. If a rename, a smaller function or a stronger type removes the need, write no comment.
2. The comment says what the code plainly does: delete it.
3. A type can carry the fact: encode it in the type (table below) and delete the comment.
4. The code cannot show the reason: keep it. Examples: an invariant, a trap, a security guard, a deliberate surprise, a coupling the imports do not show.
5. The comment contradicts the code or describes removed behavior: delete it in the change you are making. A wrong comment is a defect, not a nit.

| Comment | Type instead |
| - | - |
| "must match shape X" | `satisfies` |
| "keep the literal types" | a `const` type parameter, or `as const` |
| "handle new variants here" | a discriminated union with an exhaustive `never` check |
| a unit, or "a user id, not an org id" | a branded type; a template-literal type for a string format |
| "do not mutate" | `readonly`, `Readonly<T>`, `readonly T[]` |
| "legal values are a, b, c" | a string-literal union; `enum` is banned |
| "the caller must release this" | `using` with `Symbol.dispose` |
| "narrows x to T" | a type predicate |
| "accepts either shape" | overload signatures |

## Budgets

- A file header states the file purpose in one line, then each ruling, invariant or trap the file holds. `AGENTS.md` makes the header the home of per-domain law, so a ruling stays there in full. Cut every line that is not one of those. Omit the header when the name and exports explain the file.
- A reason is one line. A security or deliberate-surprise warning may be as long as it must be to stop a wrong fix.
- No history: no dates, no "was a bug", no audit or campaign notes, no comparison with SillyTavern or another project (D141).
- Cite only a stable anchor beside a self-contained statement: a `D<n>` id or a named law section. Never cite a doc line number, an issue or board number, or an inventory count (D141).
- Put a numeric constraint in a constant, a type or a test. Point at a growing list's tuple or registry instead of copying its members.
- Change the code, then fix or delete its comment in the same change.

## TSDoc

Exported API uses `/** */` TSDoc; a non-exported helper uses `//`. The `tsdoc/syntax` and `@typescript-eslint/no-deprecated` rules in `eslint.config.ts` are hard errors. JSDoc type tags such as `@type`, `@typedef` and `@template` never appear.

| Tag | Use |
| - | - |
| `@deprecated` | required on a deprecated export, with the migration path |
| `{@link Symbol}` | required for a code symbol named in a doc comment |
| `@remarks` | the reason on an export, one block |
| `@param`, `@returns`, `@typeParam` | only for a constraint the type cannot show: a unit, a precondition, a throw before any write |
| `@throws` | only a throw the caller must handle |
| `@defaultValue` | only when the signature does not show the default |
| `@example` | only for non-obvious use; it must compile against the current API |
| `@internal`, `@see` | allowed |
| `@packageDocumentation` | at most one per package entry point |
| every other tag, for example `{@inheritDoc}`, `@alpha`, `@override`, `@privateRemarks` | forbidden: no tool here reads it |

## Markers and doc citations

- `FLAG[<name>]` marks a deliberate design. Do not remove it.
- Tracked debt is a `docs/work` item, not a comment marker. File it there and cite the item id or path.

## Cite grammar

This section is the one home of the cite grammar for comments, `AGENTS.md`, `.claude/rules` and `docs/law`. `tooling/src/eslint/cites.ts` implements it. `tests/tooling/doc/comment-path-citations.repo.int.test.ts` resolves every cite under `packages`, `tooling`, `tests` and `scripts` and in those law files. Move, rename or delete a cited target and repoint its citers in the same commit.

| Cite | Spelling | Resolves to |
| - | - | - |
| Repo path | a rooted path such as `packages/kit/src/ids/index.ts`, a path relative to the citing file, or a bare file name such as `Spine-Testing.md` | a tracked file |
| Directory | a rooted path with its trailing slash, `tests/server/infra/plugin-host/` | a directory that holds a tracked file |
| Decision | `D<n>` | an ADR file in `docs/adr`, or a number in the reserved window `docs/adr/README.md` states |
| Script | `` `pnpm <script>` `` in backticks | a `package.json` script or a pnpm built-in |
| Lint rule | `orb/<rule>`, `` `<plugin>/<rule>` `` or `` `lint/<group>/<rule>` `` | a rule the composed ESLint, stylelint or Biome configuration holds |
| Dependency rule | `` policy `<name>` `` | a dependency-cruiser rule, including the extended preset's |
| Checker name | a backticked kebab name or Biome `` `noX` `` inside an enforcement claim | a dependency-cruiser rule, a lint rule without its namespace, or a test file's stem |
| Symbol | `{@link Name}` or `{@link Name.member}` | a name a declaration in the program carries, or a global |

Quoted text is an example and cites nothing. A glob, a placeholder and a build output directory (`node_modules/`, `dist/`) cite nothing.

## Enforcement claims

A sentence that says a test, a CT, a suite, a lint rule, ESLint, Biome, stylelint, dependency-cruiser, knip or a ratchet holds, pins, refuses or catches a fact names that checker in the same sentence, by a cite above. `orb/enforcement-claim-cites-checker` refuses a claim that names none, and the cite test refuses a claim whose cite names no checker. When no checker exists, state the rule and claim none; never drop the rule because nothing checks it. An instruction such as "a test must pin this" is not a claim. A claim about the test or rule the comment sits in ("this test", "the case below") names its own file.
