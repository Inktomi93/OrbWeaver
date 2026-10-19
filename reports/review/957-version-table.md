# 957 per-case version table

Each row compares the codemod's HEAD reader with the floor reader it now calls. "Kept" names the behavior after this change and why. Fixture cases are in `tests/tooling/codemod/lib/id-casts.int.test.ts` and `tests/tooling/codemod/ops/deep-imports.int.test.ts`; "red-first" rows failed on HEAD source and pass now.

## Drizzle write table (`castIdInObjectLiterals`, `tableScopedIdProps`)

| Case | HEAD codemod | Floor `readDrizzleWriteTable` | Kept | Evidence |
| - | - | - | - | - |
| `db.insert(t).values({ id })` | cast | cast | same | parity fixture |
| `.values([{ id }])` multi-row | cast | cast (codemod climbs the array, floor reads the receiver) | same | parity fixture |
| `db.update(t).set({ id }).where(…)` | cast | cast | same | parity fixture |
| other table | no cast | no cast | same | parity fixture |
| hoisted builder `const q = db.insert(t); q.values({ id })` | no cast (needs a direct call receiver) | cast | floor: the builder is the same write | red-first |
| `insert` not declared by drizzle-orm (`store.insert(t).values(…)`) | cast (spelling) | no cast | floor: write-ness is the verb's declaration | red-first |
| factory/wrapper receivers (`make(db).set`, `run(db.update(t))`) | no cast | cast when the factory returns or wraps the builder | floor | covered by `tests/tooling/floor/code-facts/drizzle-write-chain.test.ts` |
| table argument wrapped in parens/`as`/`!` | text includes the wrapper, so no match | unwrapped by `unwrapTarget` | floor | floor reader tests |
| file in no native world (legacy tests, D320; excluded config) | cast (syntax only) | no answer | no cast: a typed question with no typed world answers nothing | red-first |
| worlds disagree | n/a (one syntax answer) | per-world | no cast | `agreedInEveryWorld` |
| two `tableScopedIdProps` rows for one prop | only the first row was tested | n/a | every row for the prop is tested | option contract |

## Drizzle comparison operator (`castIdInComparisons`)

| Case | HEAD codemod | Floor `callsDrizzleOperator` | Kept | Evidence |
| - | - | - | - | - |
| `import { eq, inArray } from "drizzle-orm"` direct calls | cast | cast | same | parity fixture |
| `inArray` element array | cast each element | n/a (operand rule is the codemod's) | same | parity fixture |
| non-matching column | no cast | n/a | same | parity fixture |
| aliased import `eq as equals` | no cast (spelling `equals`) | cast | floor: identity by import | red-first |
| local function named `eq` | cast (spelling) | no cast | floor | red-first |
| namespace `d.eq(…)` | no cast (not an identifier) | cast | floor | floor reader |
| relational `where: (t, { eq }) => eq(…)` | cast (spelling) | cast by operator parameter | floor | floor reader |
| file in no native world | cast | no answer | no cast | red-first |
| custom `ops` naming a non-drizzle helper | cast by spelling | no cast | floor; `ops` now names drizzle-orm exports (`contract/types.ts`) | no in-repo caller passes `ops` |

## String-variable arm (`includeStringVars`)

| Case | HEAD | Now | Kept |
| - | - | - | - |
| every world says plain `string` | cast | cast | same |
| a world cannot locate the node | that world ignored | counts as disagreement, no cast | stricter; the overlay text is identical in every world, so this does not occur on authored files |

## Exact import spelling (`imports.ts`, `import-routing.ts`)

| Case | HEAD | Floor `exact-import-spelling` | Kept |
| - | - | - | - |
| every site | `getModuleSpecifierValue() === spec` on `getImportDeclarations()` | the identical filter, in source order | same; one home. Existing `imports.int.test.ts` and `reexport-selection.int.test.ts` cases pass unchanged |

## Deep-import module positions (`deep-imports` codemod vs `package-deep-import` gate)

| Case | HEAD codemod | Floor `modulePositionSpecifier` (gate) | Kept | Evidence |
| - | - | - | - | - |
| import/export declarations | read | read | same, declarations first so note order is unchanged | five existing fixtures pass |
| same-module `import("../../…")` | ignored (gate still flags it) | read | respelled to `#src/…` | red-first |
| same-module `import("../../…").T` type | ignored | read | respelled | red-first |
| cross-module `require("../../…")` | ignored | read | refused with a note: a call names no binding to route through a door | red-first |
| template literal `` `../../x` `` | ignored | not a string literal for the gate | ignored | red-first fixture keeps it |
| `vi.mock` family | ignored | read | same handling as other calls | floor admission |

## Package source path (`packageSourceOf`, `test-subpaths`)

| Case | HEAD | Floor `packageFileOf` | Kept |
| - | - | - | - |
| `packages/<pkg>/src/<path>` | three private regex copies | the floor regex `relativeClimb` already used | same answers; `PackageSource` now extends the floor `PackageFileReach` (`relative` renamed `path`) |
