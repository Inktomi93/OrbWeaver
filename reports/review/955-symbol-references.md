# 955 symbol references and member reads

## Outcome

Literal member and bracket reads in `pnpm ast` reference verbs and in the duplicating gate readers now go through the floor member reader. Each fold kept the most correct recognition found among the old readers, per `.claude/rules/tooling.md` "Shared code facts and readers". No new floor API was added.

- Authored literal keys: `literalMemberAccess` in `tooling/src/floor/code-facts/reference-fact.ts`. Every moved literal reader passes `true`, so a no-substitution template key reads like its quoted twin.
- Injected key judgment: `staticMemberAccess(node, readComputedName)` in the same file.
- Transparent callee and receiver wrappers: `unwrapTarget` in `tooling/src/floor/code-facts/reference-fact-alias.ts`.

## Consumers moved

| File | Reader | Door |
| - | - | - |
| `tooling/src/ast/ops/symbols.ts` | `callerHit` (callers verb) | `literalMemberAccess(parent, true)`; callee through `unwrapTarget` |
| `tooling/src/ast/lib/fields.ts` | `producedNamesOf`, `consumedNamesOf` | `literalMemberAccess(…, true)` |
| `tooling/src/ast/ops/regkeys.ts` | `creditMemberReads` (replaces the property and element walkers) | `literalMemberAccess(access, true)` |
| `tooling/src/ast/ops/registry-candidates.ts` | `receiverRootAndPath` | `literalMemberAccess(current, true)`; numeric index kept local |
| `tooling/src/verify/gates/agent-bridge-lock.ts` | `isOrbAssignment` | `literalMemberAccess(left, true)`; receiver through `unwrapTarget` |
| `tooling/src/verify/gates/no-raw-egress.ts` | `fetchCandidate` | `literalMemberAccess(node, true)` |
| `tooling/src/verify/gates/persistence-boundary.ts` | `storageCandidateName` | `literalMemberAccess(node, true)` |
| `tooling/src/verify/lib/contract-verb-presence-fact.ts` | `calledName` | `literalMemberAccess(callee, true)`; callee through `unwrapTarget` |
| `tooling/src/verify/lib/knob-wire-corpora.ts` | `readShapedNames` | `literalMemberAccess(node, true)` |
| `tooling/src/verify/lib/static-class-external-terminals.ts` | lucide namespace factory member | `literalMemberAccess(callee, true)` |
| `tooling/src/verify/lib/css-family-source-provenance.ts` | `accessedPropertyName` | `staticMemberAccess` with the existing key reader injected |
| `tooling/src/verify/lib/css-selector-writers.ts` | `accessedName` | `staticMemberAccess` with the existing key reader injected |

## Reader version table

Each row compares the old reader, the floor door the reader now calls, and the version kept. "yes" means the reader recognizes the member; "no" means it does not; "n/a" means the shape cannot reach the reader.

Shapes: dot `x.k`; optional `x?.k`; string `x["k"]`; template ``x[`k`]``; numeric `x[0]`; paren key `x[("k")]`; identifier key `x[K]` with `const K = "k"`; wrapper `as`, `satisfies` or `!` at the named position; call result `f()["k"]`.

Marks: (a) correct as kept; (b) the stronger version is adopted with a red-first test, or owed with an item letter from "Owed"; (c) different on purpose, with the citation.

### callers (`symbols.ts` `callerHit`)

| Shape | Old | Floor | Kept | Mark |
| - | - | - | - | - |
| dot | yes | yes | floor | (a) |
| optional | yes | yes | floor | (a) |
| string | no | yes | floor | (b) adopted: `verbs.test.ts` "callers counts bracket and optional bracket method calls like the dotted spelling" |
| template | no | yes | floor | (b) adopted: same test |
| numeric | n/a | n/a | n/a | (a): a numeric key names no declaration the verb selects |
| paren key | no | no | floor | (b) owed A |
| identifier key | no | no | floor | (b) owed B: the reference set holds the key binding, not the member, so neither version sees the call; not separately tested |
| wrapper on the callee | no | yes | floor | (b) adopted: `verbs.test.ts` "callers sees through parenthesized, asserted and non-null callees" |
| call result | no | yes | floor | (b) adopted: the string case above, on any receiver |

### fields produced (`fields.ts` `producedNamesOf`, assignment target)

| Shape | Old | Floor | Kept | Mark |
| - | - | - | - | - |
| dot | yes | yes | floor | (a) |
| optional | n/a | n/a | n/a | (a): an optional chain is not an assignment target |
| string | yes | yes | floor | (a) |
| template | no | yes | floor | (b) adopted: `index.test.ts` "a no-substitution template key produces and consumes exactly like its quoted twin" |
| numeric | no | no | floor | (a): a numeric index names no contract field |
| paren key | no | no | floor | (b) owed A |
| identifier key | no | no | floor | (b) owed B |
| wrapper on the target | no | no | floor | (b) owed A |
| wrapper on the receiver | yes | yes | floor | (a) |
| call result | yes | yes | floor | (a) |

### fields consumed (`fields.ts` `consumedNamesOf`)

| Shape | Old | Floor | Kept | Mark |
| - | - | - | - | - |
| dot | yes | yes | floor | (a) |
| optional | yes | yes | floor | (a) |
| string | yes | yes | floor | (a) |
| template | no | yes | floor | (b) adopted: same twin test as produced |
| numeric | no | no | floor | (a): a numeric index names no contract field |
| paren key | no | no | floor | (b) owed A |
| identifier key | no | no | floor | (b) owed B |
| wrapper on the key | no | no | floor | (b) owed A |
| wrapper on the receiver | yes | yes | floor | (a) |
| call result | yes | yes | floor | (a) |

### regkeys (`regkeys.ts` `creditMemberReads`)

| Shape | Old | Floor | Kept | Mark |
| - | - | - | - | - |
| dot | yes | yes | floor | (a) |
| optional | yes | yes | floor | (a) |
| string | yes | yes | floor | (a) |
| template | no | yes | floor | (b) adopted: `index.test.ts` "credits a REGISTRY\[`key`] template read in the registry's own file like the quoted spelling" |
| numeric | no | no | floor | (a): registry rows are named keys |
| paren key | no | no | floor | (b) owed A |
| identifier key | no | no | floor | (c): `cmdRegKeys` TSDoc in `regkeys.ts` states the lens is informational and a computed key reads as dead |
| wrapper on the receiver | no | no | floor | (b) owed C |
| call result | n/a | n/a | n/a | (a): the receiver must be the registry identifier |

### registry-candidates (`registry-candidates.ts` `receiverRootAndPath`)

| Shape | Old | Floor | Kept | Mark |
| - | - | - | - | - |
| dot | yes | yes | floor | (a) |
| optional | yes | yes | floor | (a) |
| string | yes, but keyed `"b"` with quotes | yes, keyed `b` | floor | (b) adopted: `registry-candidates.test.ts` "shared namespace mutation keys a bracket member path like its dotted spelling" |
| template | no (path refused) | yes | floor | (b) adopted: same test |
| numeric | yes | no | old, local branch | (c): the floor door excludes numeric keys by its TSDoc at `reference-fact.ts` `literalMemberAccess` |
| paren key | no | no | floor | (b) owed A |
| identifier key | no | no | floor | (b) owed B |
| wrapper in the receiver chain | no | no | floor | (b) owed C |
| call result | no group | no group | floor | (a): a call result is a fresh value, not a shared namespace |

### agent-bridge-lock (`isOrbAssignment`)

| Shape | Old | Floor | Kept | Mark |
| - | - | - | - | - |
| dot | yes | yes | floor | (a) |
| optional | n/a | n/a | n/a | (a): not an assignment target |
| string | yes | yes | floor | (a) |
| template | no | yes | floor | (b) adopted: mustFlag row "the no-substitution template key is the same install door as the quoted key" |
| numeric | n/a | n/a | n/a | (a): the door is the named member `__orb` |
| paren key | no | no | floor | (b) owed A |
| identifier key | no | no | floor | (b) owed B: an install-door bypass |
| wrapper on the receiver | no | yes | floor with `unwrapTarget` | (b) adopted: mustFlag row "an asserted global receiver is still the global" |
| call result | n/a | n/a | n/a | (a): the receiver must be the global |

### no-raw-egress (`fetchCandidate`) and persistence-boundary (`storageCandidateName`)

The two readers made identical judgments before and after, so one table covers both.

| Shape | Old | Floor | Kept | Mark |
| - | - | - | - | - |
| dot | yes | yes | floor | (a) |
| optional | yes | yes | floor | (a) |
| string | yes | yes | floor | (a): the computed-literal mustFlag rows |
| template | yes | yes | floor | (a): the template mustFlag rows |
| numeric | n/a | n/a | n/a | (a): the subjects are named globals |
| paren key | no | no | floor | (b) owed A |
| identifier key | no | no | floor | (b) owed B: an egress or storage bypass |
| wrapper on the receiver | yes | yes | floor | (a): the candidate reads only the leaf; the egress cast-dodge mustFlag row holds the receiver |
| wrapper on the key | no | no | floor | (b) owed A |
| call result | yes | yes | floor | (a) |

### contract-verb-presence (`calledName`)

| Shape | Old | Floor | Kept | Mark |
| - | - | - | - | - |
| dot | yes | yes | floor | (a) |
| optional | yes | yes | floor | (a) |
| string | yes | yes | floor | (a): `contract-verb-presence.test.ts` "a quoted bracket service invocation is coverage like the dotted call" |
| template | no | yes | floor | (b) adopted: "a template bracket service invocation is coverage like the quoted call" |
| numeric | n/a | n/a | n/a | (a): verbs are named |
| paren key | no | no | floor | (b) owed A |
| identifier key | no | no | floor | (b) owed B: a false finding, the safe direction |
| wrapper on the callee | no | partial | `calledName` through `unwrapTarget` | Partial: `calledName` unwraps `()`, `as`, `satisfies` and `!`, but the two coverage checks do not. `isAssembledServiceCall` unwraps without `!`, and `isFactoryBoundVerb` does not unwrap. `service.coveredVerb!()` and `(coveredVerb as () => void)()` still report a false missing-contract-test. Only the `as` member case is proven, by "a parenthesized or asserted service callee is coverage like the bare call". Moot: item 1117 deletes this gate and its fact file. |
| call result | yes | yes | floor | (a) |

### knob-wire (`readShapedNames`)

| Shape | Old | Floor | Kept | Mark |
| - | - | - | - | - |
| dot | yes | yes | floor | (a) |
| optional | yes | yes | floor | (a) |
| string | yes | yes | floor | (a) |
| template | no | yes | floor | (b) adopted: knob-wire-coverage mustPass row "arm C: a no-substitution template key reads the leaf exactly like its quoted twin" |
| numeric | no | no | floor | (a): knobs are named |
| paren key | yes | yes | floor | (a): the bare string-literal arm of the same function reads the inner literal, because the fact visits every `StringLiteral` (`KNOB_WIRE_KINDS` in `knob-wire-fact.ts`) |
| identifier key | no | no | floor | (b) owed B |
| wrapper on the key | yes | yes | floor | (a): the bare string-literal arm reads the inner literal |
| call result | yes | yes | floor | (a) |

### lucide namespace factory (`static-class-external-terminals.ts`)

| Shape | Old | Floor | Kept | Mark |
| - | - | - | - | - |
| dot | yes | yes | floor | (a) |
| optional | yes | yes | floor | (a) |
| string, double or single quotes | yes | yes | floor | (a) |
| string that spells one letter with a Unicode escape sequence | no: compared raw text | yes: compares the cooked value | floor | (b) adopted: the cooked value is the runtime member; `static-class-expression.test.ts` "reads a lucide namespace factory member through its authored key, never an identifier key's spelling" |
| template | no | yes | floor | (b) adopted: same test |
| numeric | n/a | n/a | n/a | (a): the factory is a named export |
| paren key | no | no | floor | (b) owed A |
| identifier key | yes, by the identifier's spelling | no | floor | (a): the old reader matched `Lucide[createLucideIcon]` whatever the binding held; same test |
| wrapper on the receiver | yes | yes | floor | (a): the existing `unwrap` reads the receiver |
| call result | n/a | n/a | n/a | (a): the receiver must be the namespace import |

### css accessed names (`css-family-source-provenance.ts` `accessedPropertyName`, `css-selector-writers.ts` `accessedName`)

The old and new readers call the same key reader: `readStaticString`, or the native strings evidence. The verdicts are identical by construction.

| Shape | Old | Floor | Kept | Mark |
| - | - | - | - | - |
| dot | yes | yes | floor | (a) |
| optional | yes | yes | floor | (a) |
| string | yes | yes | floor | (a) |
| template | yes | yes | floor | (a) |
| numeric | no | no | floor | (a): class and attribute names are strings |
| paren key | yes | yes | floor | (a) |
| identifier key | yes | yes | floor | (a) |
| wrapper on the key | yes | yes | floor | (a) |
| call result | yes | yes | floor | (a) |

### Kept exclusions

| Reader | Its judgment against the floor literal door | Why it stays |
| - | - | - |
| `no-form-state-in-useeffect.ts` `nativeMemberName` | Strips parentheses around the key, so it is stronger on a paren key. It refuses const and `as`/`satisfies` keys. | (c): the gate header says native ESLint owns direct syntax, while constant aliases and wrapped computed keys remain semantic subjects. ESTree drops parentheses, so a paren key is direct syntax. The mustPass row "native syntax owns direct dependencies" and the const-key mustFlag row hold both sides. |
| `bus-coverage.ts` (three emitter readers) | Reads the key through paren, `as`, `satisfies` and `!` wrappers. That is stronger than the floor literal door. | Moving would drop the wrapped-key cases. It moves once owed item A gives the floor door wrapper reading. |
| `detached-work.ts` `literalMember` | Reads the key through `staticStringValue`: typed literal, parentheses, `+` concatenation and a same-file const. That is stronger than the floor literal door. | Moving would weaken it. Its twin is `caught-failure-core.ts` in the caught-failure family, so both twins fold together in that lane. |
| `open-json-reader-shapes.ts`, `open-json-parity-fact.ts` | String-literal key only, so a template key is missed. That is weaker. | (b) owed D: adopt `literalMemberAccess(…, true)`. These are JSON-column readers on item 953's row. |

## Owed

- A: let the floor literal door read the key through transparent paren, `as`, `satisfies` and `!` wrappers. The tenancy readers in item 953's area share `literalMemberAccess`, so add the reading behind a flag or a sibling door rather than changing their verdicts.
- B: resolve const keys in the moved readers through the binding resolver that `staticMemberAccess` already supplies. Its cost on the syntactic `pnpm ast` corpus and its availability inside native types-mode gates are unmeasured. The bypass rows in no-raw-egress, persistence-boundary and agent-bridge-lock are security-relevant.
- C: unwrap transparent receiver wrappers in the regkeys receiver text and the registry-candidates receiver chain.
- D: adopt template keys in the open-json readers (item 953).

## Corrections now visible in output

- `pnpm ast callers` counts bracket, optional bracket, template-keyed and wrapped callees.
- `fields` and `viewgap` credit template-keyed producers and reads.
- `regkeys` credits a template-keyed read in the registry's own file.
- `registry-candidates` keys `a["b"]` and ``a[`b`]`` like `a.b`.
- agent-bridge-lock flags a template-keyed or asserted-receiver `__orb` install.
- contract-verb-presence credits template-keyed service calls and an `as`-wrapped member callee. A `!` callee and a wrapped destructured verb are still missed; item 1117 deletes the gate.
- knob-wire-coverage reads template-keyed leaves.
- The lucide factory reader matches escaped and template keys and no longer matches an identifier key by its spelling.

## Survey

`ast-grep run -l ts -p '$E.getArgumentExpression()' tooling/src` returned 50 matches. `tooling/src` holds no `.tsx` files, so the `-l tsx` run scanned nothing.

## Open

- A before/after `pnpm ast` and gate diff on the real tree, run by primary.
- `tooling/src/verify/lib/symbol-reference.ts` still holds the syntactic import-binding readers. They belong to the import facts row (item 956).
