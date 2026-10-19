# 955 symbol references and member reads

## Outcome

Literal member and bracket reads in `pnpm ast` reference verbs and in the duplicating gate readers now go through the floor member reader. No new floor API was added.

- Authored literal keys: `literalMemberAccess` in `tooling/src/floor/code-facts/reference-fact.ts`.
- Injected key judgment: `staticMemberAccess(node, readComputedName)` in the same file.

## Consumers moved

| File | Reader | Door |
| - | - | - |
| `tooling/src/ast/ops/symbols.ts` | `callerHit` (callers verb) | `literalMemberAccess(parent, true)` |
| `tooling/src/ast/lib/fields.ts` | `producedNamesOf`, `consumedNamesOf` | `literalMemberAccess` |
| `tooling/src/ast/ops/regkeys.ts` | `creditMemberReads` (replaces the property and element walkers) | `literalMemberAccess` |
| `tooling/src/ast/ops/registry-candidates.ts` | `receiverRootAndPath` | `literalMemberAccess`; numeric index kept local |
| `tooling/src/verify/gates/agent-bridge-lock.ts` | `isOrbAssignment` | `literalMemberAccess` |
| `tooling/src/verify/gates/no-raw-egress.ts` | `fetchCandidate` | `literalMemberAccess(node, true)` |
| `tooling/src/verify/gates/persistence-boundary.ts` | `storageCandidateName` | `literalMemberAccess(node, true)` |
| `tooling/src/verify/lib/contract-verb-presence-fact.ts` | `calledName` | `literalMemberAccess` |
| `tooling/src/verify/lib/knob-wire-corpora.ts` | `readShapedNames` | `literalMemberAccess` |
| `tooling/src/verify/lib/static-class-external-terminals.ts` | lucide namespace factory member | `literalMemberAccess(callee, true)` |
| `tooling/src/verify/lib/css-family-source-provenance.ts` | `accessedPropertyName` | `staticMemberAccess` with the existing key reader injected |
| `tooling/src/verify/lib/css-selector-writers.ts` | `accessedName` | `staticMemberAccess` with the existing key reader injected |

## Corrections

- `pnpm ast callers` counts `x["fn"]()` and `x?.["fn"]()`. The old reader matched only a dotted callee.
- `registry-candidates` keys a bracket path segment `a["b"]` as `b`. The old reader kept the quotes, so it split one receiver into two groups.
- The lucide namespace factory no longer matches an identifier key by its spelling (`Lucide[createLucideIcon]`). It now matches a no-substitution template key.

Every other move keeps the old key judgment exactly: string literal only, or string and template where the old reader accepted both.

## Kept, with reason

- `tooling/src/verify/gates/no-form-state-in-useeffect.ts` `nativeMemberName`: it is the literal judgment aligned with ESLint and strips parentheses around the key. The floor literal door does not strip key wrappers.
- `tooling/src/verify/lib/bus-coverage.ts`: it reads the key through `as`, `satisfies` and parenthesis wrappers. No floor door makes that judgment.
- `tooling/src/verify/lib/detached-work.ts`: a twin of `caught-failure-core.ts`. The caught-failure family belongs to another lane.
- `tooling/src/verify/lib/open-json-reader-shapes.ts`, `open-json-parity-fact.ts`: these are JSON-column readers on the Drizzle facts row (item 953).
- Computed-key analysis, value evaluation and disposal keys (`compose-wiring-only`, `audit-client-tests`, `warning-code-coverage`, `static-class-value` and others) do not read member names.

## Survey

`ast-grep run -l ts -p '$E.getArgumentExpression()' tooling/src` returned 50 matches. `tooling/src` holds no `.tsx` files, so the `-l tsx` run scanned nothing.

## Open

- A before/after `pnpm ast` and gate diff on the real tree, run by primary.
- `tooling/src/verify/lib/symbol-reference.ts` still holds the syntactic import-binding readers. They belong to the import facts row (item 956).
