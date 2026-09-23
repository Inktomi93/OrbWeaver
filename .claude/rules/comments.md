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

- A file header is 3 lines or fewer: what the file is and its non-obvious invariant. A file whose name and exports explain it gets none. A gate header in `tooling/src/verify/gates/` may take 5 lines, because it is the gate's contract.
- A reason is one line. A security or deliberate-surprise warning may be as long as it must be to stop a wrong fix.
- No history: no dates, no "was a bug", no audit or campaign notes, no comparison with SillyTavern or another project (D141).
- Cite only a stable anchor beside a self-contained statement: a `D<n>` id or a named law section. Never cite a doc line number, an issue or board number, or an inventory count (D141).
- Put a numeric constraint in a constant, a type or a test. Point at a growing list's tuple or registry instead of copying its members.
- Change the code, then fix or delete its comment in the same change.

## TSDoc

Exported API uses `/** */` TSDoc; a non-exported helper uses `//`. The `tsdoc/syntax` and `@typescript-eslint/no-deprecated` rules in `eslint.config.js` are hard errors. JSDoc type tags such as `@type`, `@typedef` and `@template` never appear.

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
| `@public` family: `@public twin: <Value>`, `@public future: <consumer>`, `@public <reason>` for a test-anchored export | only with the target or reason. `pnpm ast` (orphans, chains, apisurface), knip and the orphan-export ratchet read it; the spellings are in `tooling/src/ast/lib/public-markers.ts` |
| `@packageDocumentation` | at most one per package entry point |
| every other tag, for example `{@inheritDoc}`, `@alpha`, `@override`, `@privateRemarks` | forbidden: no tool here reads it |

## Markers and doc citations

- `FLAG[PD-<n>]` marks tracked debt. It needs a row in `docs/law/Core-Audits-and-Debt.md`; the `pd-citation-integrity` gate checks both sides.
- `FLAG[<name>]` marks a deliberate design. Do not remove it.
- A doc path in a comment must name a doc that exists; the `dangling-doc-cite` gate checks it. Move a doc and repoint its citers in the same commit.
