---
kind: review
status: active
updated: 2026-09-13
---

# cb-x-typed-import-arm — ARM D: received typed containment of canonical exemption data

**Current author state: Q02-R2 repaired and scoped-verified; independent closing review is owed.**
`92e5c4fd8` remains independently **REFUTED**; this continuation does not retroactively clear it.
The aggregate transfer and both earlier repair attempts remain historical evidence. §12 records the
contradiction, root's uniform typed-data-containment ruling, reclassifications and current verification.
No earlier green run or cut is closing clearance. Independent review and root integration remain owed.

Lane `cb-x-typed-import-arm`, claude-b's executor for board row **#2320** only. Scope was ONE repair:
`policy-legacy-imports` went green when a gate-owned `ExemptionTable` merely RELOCATED one hop into `lib/`.
No part of the #1922/#2147 authority train was touched — no table migrated, no grant minted, no authority
flipped, no `EXEMPT` deleted, no `Core-Enforcement-Active-Gates.md` edit (its proposed row text is §7 here).

| | |
| - | - |
| worktree | `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-a321f493895bbe228` |
| base | `d7ceedfb1` (branch `wt/agent-a321f493895bbe228`), `git rev-list --left-right --count main...HEAD` = `0 0` at start |
| files | `tooling/src/verify/gates/policy-legacy-imports.ts` · `tests/tooling/verify/gates/policy-soundness-family.suite.repo.int.test.ts` · this report |

## 1. Historical initial receipt rule and boundary (current contract: §12)

The governing rule is broader than any one mechanical arm:

> A FINAL policy module may not RECEIVE, through any import door, a value whose declared type resolves to
> `tooling/src/verify/contract/gate.ts#ExemptionTable` or `#ExemptionRow`, wherever that value is declared.

ARM D implements this rule over the resolved tooling-source doors and authored annotation grammar
described below. It does not claim every TypeScript import or type expression is covered. The finding is
at the RECEIVING door, never at the declaration — §12.5's property is receipt (*"gate modules
receive neither grant tables nor marker parsers"*), and `lib/grant-liveness.ts` / `lib/sanctioned-home.ts`
type FUNCTION PARAMETERS with `ExemptionTable`, hold no rows, and are imported by the program's own converted
exemplars. An arm keyed on the declaration site — the wording #2320's fix text proposed — would red them.

**THE DECLARED LIMIT (in the module header and pinned by a `mustPass` row, not asserted only in prose):**
ARM D is a TYPE-IDENTITY arm. A module that declares its own row interface locally and keeps the same
per-subject table is invisible to it; the live example is `lib/injected-op-caller-param.ts#CallerFreeOpRow`,
RETYPED rather than relocated. Both alternative constructions were attempted and rejected with receipts (a
`Record<string, { why }>` shape arm reds `contract/tenancy-scope.ts#ScopingRow`; a use-provenance arm needs a
membership test to reach the ABSENCE of a `ctx.report.*` call — control flow — and would red this very
module's `FORBIDDEN_BASENAMES.has(...)` at `:102`). **The original claim that ARM D closed relocation
completely was REFUTED**, first by direct typed default exports (§9), then by local `ExemptionTable`
aliases and nested `ExemptionRow` aliases (§10). The untyped retype class remains a migration and review
obligation; this report does not certify #1922's completion.

## 2. The named finding sets, measured on the real tree

Both runs are `pnpm check:structure --check policy-legacy-imports` in this worktree.

**BEFORE** (`d7ceedfb1`, unmodified) — exit 1, `raw 5 = waived 0 + granted 0 + effective 5 (5 error)`,
`0 alarm(s) · 0 tool error(s) · 0 withheld`, population 309 source, slot
`agent-a321f493895bbe228-1052951-2026-09-13T09-04-14-625Z`:

| # | module | door |
| -: | - | - |
| 1 | `depcruise-grant-liveness:30:46` | `"../contract/gate.ts"` |
| 2 | `domain-freshness-plane:70:35` | `"../contract/gate.ts"` |
| 3 | `eslint-grant-liveness:10:37` | `"../contract/gate.ts"` |
| 4 | `lifecycle-portability:54:51` | `"../contract/gate.ts"` |
| 5 | `runner-config-path-liveness:78:46` | `"../contract/gate.ts"` |

**AFTER** (ARM D landed) — exit 1, `raw 11 = waived 0 + granted 0 + effective 11 (11 error)`,
`0 alarm(s) · 0 tool error(s) · 0 withheld`, population 309 source: the same five ARM A findings **plus six
ARM D findings**, no module in both arms:

| # | module | door | declaration named |
| -: | - | - | - |
| 6 | `contract-derives-not-respells:54:92` | `"../lib/contract-derives-not-respells.ts"` | `ALLOWLIST` · `ExemptionTable` |
| 7 | `contract-derives-not-respells-health:29:92` | `"../lib/contract-derives-not-respells.ts"` | `ALLOWLIST` · `ExemptionTable` |
| 8 | `no-raw-spacing-in-features:34:34` | `"../lib/raw-spacing-tier.ts"` | `SANCTIONED_HOMES` · `ExemptionTable` |
| 9 | `spacing-tier-home-health:32:34` | `"../lib/raw-spacing-tier.ts"` | `SANCTIONED_HOMES` · `ExemptionTable` |
| 10 | `no-raw-typography-in-features:51:34` | `"../lib/raw-typography-tier.ts"` | `SANCTIONED_HOMES` · `ExemptionTable` |
| 11 | `typography-tier-home-health:26:34` | `"../lib/raw-typography-tier.ts"` | `SANCTIONED_HOMES` · `ExemptionTable` |

**`5 + 6 = 11`, every one named.** Three relocated tables × two registering gate importers each = six doors,
which is the design's predicted Set D exactly, reproduced here by the production dispatcher rather than by a
prototype. `injected-op-caller-param-health` does NOT appear, by construction (§1's declared limit).
No zero-cost deletion was in scope, so the five ARM A findings all survive. Cost is unchanged: the policy's
`evaluate` was 6005 ms before and 5509 ms after on the same box.

## 3. Red-first receipts

Twelve controls driven through `runPolicyPass` against the **UNMODIFIED** module (harness:
`cbx-armd-controls.ts` in the lane scratchpad; it imports the gate and the dispatcher directly and plants a
virtual project per control).

**The harness's own positive control ran in the same invocation**: `C0`, ARM A's founding shape, returned
**1 finding** before and after, so every zero below is a measurement and not "I could not run the policy".

| control | before ARM D | after ARM D |
| - | -: | -: |
| C0 ARM A direct `contract/gate.ts` import (positive control) | **1** | 1 |
| C1 relocated table, one-hop named import — **the #2320 escape** | **0 (the false clean)** | 1 |
| C5 two-hop re-export chain `gate → lib/shim → lib/deeper → lib/table` | **0** | 1 |
| C6 aliased named import `{ X as Y }` | **0** | 1 |
| C7 default import | **0** | 1 |
| C8 namespace import + member access | **0** | 1 |
| C9 `ExemptionRow`-typed value (a row, not a table) | **0** | 1 |
| C2 shared reader with a table-typed PARAMETER | 0 | 0 |
| C3 local retype (`CallerFreeOpRow` shape) | 0 | 0 |
| C4 same-spelled `ExemptionTable` from another module | 0 | 0 |
| C10 migrated exemplar (function import, `ratified: {}`) | 0 | 0 |
| C11 binding the resolved target does not export | 0 (silent acquittal) | **REFUSES** — 1 tool error, policy withheld |

**The original cut receipt, before the direct-default revision (§4.1).** `cp` the module, cut ARM D's two dispatch lines (`grep -c` confirmed 2 anchors
before, 0 after), run `verifyPolicyProofs([gate])`, `mv` back (`git status --short` verified afterwards:
only the two intended files modified, no `.cbxbak`). Intact: **0 failing rows**. Cut: **exactly 8 failing
rows — the 7 ARM D `mustFlag` rows and the ARM D `mustRefuse` row, and nothing else.** No pre-existing row
died, so ARM D is not silently doing an origin arm's work; no `mustPass` row died, which is the correct
direction for an arm that only adds accusations. This is a historical eight-row receipt, not the final
stack's count. Independent review at `c4eda33bd` cut the revised stack and killed ten rows (nine findings
and one refusal), including the two direct-default additions. The continuation must derive and name its
own affected rows rather than reuse either count.

## 4. Import-form coverage — what "any import door" may and may not claim

| form | pinned? | row |
| - | - | - |
| named import `{ X }` | YES | `mustFlag` "ARM D THE FOUNDING SHAPE" |
| aliased named import `{ X as Y }` | YES | `mustFlag` "an ALIASED named import" |
| default import — target declares `const X: ExemptionTable` behind `export default X` | YES | `mustFlag` "a DEFAULT import whose target declares the table as a NAMED CONST" |
| default import — target is a DIRECT typed expression (`export default (… satisfies ExemptionTable)`) | YES (**§9, landed after review**) | `mustFlag` "a DIRECT typed default export" |
| default import — the `as ExemptionTable` twin of the direct typed default | YES (**§9, landed after review**) | `mustFlag` "the `as ExemptionTable` TWIN" |
| namespace import `* as ns` (+ member access) | YES | `mustFlag` "a NAMESPACE import reached by MEMBER ACCESS" |
| `export { X } from` re-export door | YES | `mustFlag` "an `export … from` RE-EXPORT DOOR" |
| one-hop re-export shim | YES | covered by the two-hop row (a superset) |
| multi-hop (two-hop) shim chain | YES | `mustFlag` "a TWO-HOP re-export chain" |
| `export * from` / `export * as ns from` | code path exists (whole export surface, same enumeration as a namespace import) — **NOT separately pinned** | — |
| a door resolving OUTSIDE `tooling/src/` (an installed package) | **NOT COVERED, by design** | the `tooling/src/` fence; no gate declares a table in a package, and asking a `.d.ts` export map costs a package walk |
| a door whose specifier does not resolve AND is not an ARM A/B candidate | **NOT COVERED, by design** | #2185: outside a candidate set unreadability is ordinary, and fail-closed there is a false-accusation engine |
| a RESOLVED target that does not export a named binding | REFUSES (never acquits) | `mustRefuse` "ARM D FAIL-CLOSED" |

Those rows exercise the named, aliased, default and namespace imports and the named re-export doors
listed above. The unpinned whole-surface variants are not proved merely because a code path exists.
This is not complete TypeScript annotation provenance, installed-package coverage, or retype detection.

> **THE ORIGINAL FORM OF THAT SENTENCE WAS FALSE FOR ONE SHAPE, and it is kept here beside the correction
> because the failure is the lesson.** As committed at `a9536a2cb` this section read *"default import |
> YES | `mustFlag` 'a DEFAULT import'"* and claimed coverage of *"every import form that carries a NAMED,
> DEFAULT or WHOLE-SURFACE binding"*. A direct typed default export — `export default (… satisfies
> ExemptionTable)` and its `as` twin — was NOT covered and was measured at 0 findings. **LANDED
> 2026-09-13, `ebdab0a62`**: the shape is covered, pinned by two `mustFlag` rows and a negative, and the
> direct-default claim is supported from that commit forward; the broader alias/relocation claim was
> subsequently refuted. §9 preserves the default repair record, and §10 records the later refutation.

## 5. Historical landing decisions, with receipts

These decisions describe `a9536a2cb`. The type-name prefilter and private annotation traversal in items
1–2 are superseded by the shared-reader correction in §10; their measured failure remains provenance.

1. **The design's "hand-rolled symbol walk" is NOT what shipped, and the first draft of it was caught by our
   own enforcers.** ARM D initially resolved the type name with `getSymbol()` / `getAliasedSymbol()` /
   `getDeclarations()`; `policy-binding-resolution` accused this module (#2097 bans exactly that chain) and
   `policy-soundness` E2 accused `getDescendants` as a direct walk (`policy-legacy-imports.ts:402:43`,
   measured). The shipped arm resolves through the SANCTIONED shared readers —
   `lib/reference-fact.ts#resolveModuleMemberOrigin` for the binding and the type name,
   `lib/origin-verdict.ts#classifyOriginRefusal` for the refusal split, `referenceNamesExport` for the
   candidate-name prefilter — and enumerates nested type references with a closed recursion over typed
   accessors instead of a descendant scan. The family test now passes 15/15 including "the closed classes are
   at zero".
2. **The type-name test is PREFILTERED on the name before it resolves.** Unprefiltered, the fail-closed
   refusal fired on the real tree for `ReadonlySet` (`ambiguous — the symbol has 3 declarations`: an ambient
   global with merged declarations) and for `const` (an `x as const` assertion parses as a type reference
   whose symbol has no declaration). Both are recorded in the code beside the lines that stop them. This is
   `lib/origin-verdict.ts#referenceNamesExport`'s own law — *prefilter on the name, resolve the identity,
   fail closed only inside the candidate set* — and the prefilter follows import aliases, so
   `import type { ExemptionTable as Table }` stays inside the set.
3. **The `fix` text's ARM B clause was narrowed, because it is what authorized the relocation.** It read
   *"debt data with one owner (a deferral list) moves to `contract/` or `lib/` the same way"*. It now says a
   ROW TYPE may move to `contract/` and a TABLE moves nowhere.
4. **The family test's second opinion gained ARM D's half** (`tests/…/policy-soundness-family.suite.repo.int.test.ts`):
   a `../lib/` binding whose target text declares it `export const <NAME>: ExemptionTable|ExemptionRow`. It is
   TEXT on both ends deliberately, and it is two-sided — a future relocation that lands unaccused fails there.
   A single-binding regex called `contract-derives-not-respells` clean while the arm accused it (the door
   carries the table beside four other names), so the binding LIST is read whole; the opinion's remaining
   limits (aliases, multi-hop, non-`lib/` homes) are stated in its comment and are the arm's rows' job.
5. **No `Core-Enforcement-Active-Gates.md` edit** (fence). Proposed text is §7. **No count-line change is
   owed** — ARM D adds no module to the roster.
6. **The design's "5 → 9 / 10" arithmetic does not apply here** because commit 1's two zero-cost deletions
   were outside this lane's fence. The measured barrier is **5 → 11**.

## 6. LEDGER ROWS (2 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `lib/reference-fact.ts` | cb-x-typed-import-arm L1 · `tooling/src/verify/lib/reference-fact.ts:399` (`resolveModuleMemberOrigin`) | **The sanctioned binding reader answers `unsupported` for two module-binding kinds and stops one hop short on a third, so every caller that must judge those forms is pushed into its own export-map read** — exactly the private-reader shape #2097 exists to prevent. Measured: a `NamespaceImport` returns `unsupported: NamespaceImport is not a supported module-member binding`; an `ExportSpecifier` (the `export { X } from "./y"` door) returns `unsupported: ExportSpecifier is not a supported module-member binding`; and for `export default <identifier>` the resolved `canonical.declaration` is the `ExportAssignment`, not the `VariableDeclaration` behind it (which `getExportedDeclarations().get("default")` returns directly) | instrument gap (a shared reader that does not answer a question its callers have) | **OPEN** | Probed 2026-09-13 in this lane's worktree on `d7ceedfb1` with a virtual project (`cbx-reader-probe2.ts`/`4`/`5`): `direct-plain → resolved project VariableDeclaration`, `shim-plain → resolved project VariableDeclaration` (chains ARE followed), `reader-fn → resolved FunctionDeclaration`, `namespace identifier → UNRESOLVED unsupported`, `export specifier name → UNRESOLVED unsupported`, `default import → resolved ExportAssignment` while `exported default → [VariableDeclaration]`. INTERIM in `policy-legacy-imports#enumeratedValues`, declared in its JSDoc · FIX: teach the reader the two binding kinds and the `ExportAssignment` hop, then delete the enumeration |
| `lib/reference-fact.ts` | cb-x-typed-import-arm L2 · `tooling/src/verify/lib/reference-fact.ts:399` | **Handed the EXPORTED-name node of an ALIASED import specifier, the reader resolves PAST the module member into the value and returns `dynamic`, instead of `unsupported`/`missing`.** A caller that reasonably passes `specifier.getNameNode()` (the correct node for a non-aliased specifier, where it resolves) gets a refusal that `classifyOriginRefusal` may read as an acquittal — a SILENT hole keyed on whether the author wrote `as`. The correct node is the LOCAL binding (`getAliasNode() ?? getNameNode()`), which is not stated anywhere; `lib/origin-verdict.ts`'s header states the analogous caller rule for member reads only | instrument trap (a wrong-node answer that reads like a verdict) | **OPEN** | `cbx-reader-probe3.ts` on `d7ceedfb1`, same aliased fixture, three nodes: `alias node → resolved VariableDeclaration name=SANCTIONED_HOMES`; `name node → UNRESOLVED dynamic: ObjectLiteralExpression has no stable module-member origin`; `use site → resolved VariableDeclaration`. ARM D passes the local binding node and says why at `resolvedBindings` · FIX: either resolve the alias's name node to the same origin, or refuse it as `unsupported` so a caller cannot mistake the answer for "not a module member" |

**ledger rows OWED: 2**

## 7. Historical catalog proposal (SUPERSEDED — do not apply)

The following proposed text was never applied by this lane and is superseded by §12. In particular,
references alone do not prove containment, and ordinary data members are now within the contract:

> **ARM D (#2320, 2026-09-13) — RECEIPT, not origin:** resolved tooling-source imports carrying a binding
> whose authored annotation references canonical `contract/gate.ts#ExemptionTable`/`#ExemptionRow` are
> findings at the receiving door. The shared reader follows declared aliases through reference arguments,
> arrays, operators, unions/intersections and tuples. Named, aliased, default and namespace imports, named
> re-exports and a two-hop shim are pinned; missing canonical type members and missing received bindings
> refuse. Same-spelled foreign types and functions taking tables as parameters remain distinct. Object
> members, callable, conditional and mapped type bodies, installed-package receivers and structural
> retypes are outside this arm. Migration and review still owe the broader receipt rule.

## 8. Floor executed

| check | result |
| - | - |
| `pnpm test:scoped tests/tooling/verify/gates/policy-soundness-family.suite.repo.int.test.ts` | **15 passed / 15** (includes `verifyPolicyProofs(FAMILY)`, the real-corpus arm, the second opinions, and the closed-classes-at-zero pin) |
| `pnpm check:structure --check policy-legacy-imports` before / after | 5 → 11, both `0 tool error(s) · 0 withheld`, sets named in §2 |
| `pnpm check:structure --check policy-soundness` | used as a diagnostic during §5.1; the family test's real-corpus arm is the standing verdict |
| `pnpm exec biome check <both files> --diagnostic-level=error` | exit 0 |
| `pnpm exec eslint <both files>` | exit 0 |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` | exit 0 — `PASS tooling/tsconfig.json`, `PASS tsconfig.json` |

NOT run (load fence, root's instruction): `pnpm check`, bare `check:structure`, `check:policy-conformance`,
`gate:contract`, CT, the planting suites. `verifyPolicyProofs` for THIS policy ran twice in-process (§3) and
whole-family through the family test.

## 9. POST-REVIEW REVISION — codex REFUTED the default-import claim, and the refutation is upheld

An independent Codex source review of `a9536a2cb` returned **REFUTED** on one bounded shape
(`/tmp/codex-typed-arm-review.md`). It is correct, and it was reproduced before anything was changed.

**The hole.** `exemptionTypeOf`'s `ExportAssignment` branch asked only the source file's
`getExportedDeclarations().get("default")`, FILTERED every `ExportAssignment` out of the result, and then
inspected whatever declaration remained. For `const X: ExemptionTable = …; export default X;` that lands on
the variable declaration. For a DIRECT typed expression —
`export default ({ … } satisfies ExemptionTable)` or its `as ExemptionTable` twin — the default export IS
the assignment, the filter removes it, nothing is left, and the receiving gate's `import HOMES from
"../lib/raw-spacing-tier.ts"` was acquitted although the received value carries the canonical identity.
**A table could therefore be relocated past ARM D without being retyped**, which is the exact boundary §1
claims to close.

**Red-first, before the repair** (same harness, same invocation as its own positive control): C12
`satisfies` = **0 findings**, C13 `as` = **0 findings**, while C0 (ARM A direct import) = 1 and C7
(identifier-behind-default) = 1. The false clean is measured, not argued.

**The repair, and why it is one mechanism rather than a special case.** A single
`assertedTypeNode(expression)` reads a value's OWN top-level `as`/`satisfies` — parentheses transparent,
`as const` guarded — and is now called from BOTH the variable-declaration path and the default-export path,
feeding the SAME `canonicalExemptionInAnnotation` → `canonicalExemptionName` identity resolver. No second
resolver, no structural/`Record<string, { why }>` heuristic, no descent into an initializer's interior (the
shared-reader parameter shape stays acquitted). The identifier hop survives as the fallback when the
default export carries no assertion, so the pre-existing row still holds.

**Proof of the repair:**

| arm | result |
| - | - |
| the 15 scratch controls | C12 and C13 now **1 finding** each; C14 (`export default (… satisfies StageTrigger)`, an unrelated `why`-bearing vocabulary) **0**; the original twelve unchanged, including the C11 refusal and the C3 retype limit |
| new committed rows | `mustFlag` direct `satisfies` · `mustFlag` direct `as` · `mustPass` unrelated-type direct default |
| `verifyPolicyProofs([policy])` | **0 failing rows** |
| **discriminating cut #2** (cp-backed, anchor asserted to occur exactly once, restored, `git status` verified) | cutting ONLY the new assertion read kills **exactly `mustFlag[24]` and `mustFlag[25]`** — the two new direct-default rows — while `mustFlag[23]` (identifier-behind-default) and every other row still pass |
| real tree, `--check policy-legacy-imports` | **11 findings, unchanged**, 0 tool errors, 0 withheld — no corpus module uses the direct typed default, so the repair is closure, not new findings |

**What the review upheld** (recorded because a review's confirmations are evidence too): the named/aliased
paths through the shared origin reader, the closed annotation traversal with its declared conditional/
mapped/function-type limit, the `mustRefuse` for a resolved-target unreadable binding, the pass rows that
keep ARM D from becoming a shape heuristic, the independence of the real-corpus second opinion for the six
current `../lib/` doors, and the two shared-reader ledger rows in §6 as gaps rather than laundered closure.

**Floor state for this revision:** biome, eslint and `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` all exit 0; `verifyPolicyProofs` and the bounded `--check` re-run as above.
**`pnpm test:scoped tests/tooling/verify/gates/policy-soundness-family.suite.repo.int.test.ts` — RUN on the
repaired tree at `ebdab0a62` once the coordinator freed the parser slot: exit 0, 15 passed / 15**,
including the real-corpus arm (no tool errors, nothing withheld, closed classes at zero) and the
conformance arm over every declared row. It was committed at `ebdab0a62` as OWED/PENDING-GO because
another lane held the slot; this line is the receipt that closes it.

## 10. Historical ce3413bfc continuation — annotation provenance, later REFUTED (#2320)

Independent review at `c4eda33bd` measured matched pairs: direct `ExemptionTable` annotation found,
`type Homes = ExemptionTable` missed; inline `ExemptionRow & { plane: string }` found, the same intersection
named `FreshnessRow` under `Readonly<Record<...>>` missed. The source reader followed imports and const
aliases but not type aliases. Widening only its candidate-name boolean would still send the outer local
alias to the value-origin reader, so it would not complete the identity query.

The correction adds `resolveTypeAnnotationReferences` to the existing shared type-origin reader.
It returns existing per-reference identity/refusal facts, follows alias RHS references through the
previous container grammar, and retains leaf nodes for the candidate/refusal split. The existing linear
`resolveTypeIdentityChain` and value readers are unchanged. No new contract file, alias-depth constant,
producer path list, policy roster or type-expression interpreter is added.

The policy consumes those canonical declarations instead of maintaining its own type-reference walk.
Unrelated declarations remain unrelated; an unreadable canonical imported leaf refuses; an unreadable
unrelated type is outside this policy's candidate set. Cyclic alias traversal terminates by declaration
identity. This does not prove arbitrary recursive types are valid TypeScript. Object members, callable,
conditional and mapped type bodies remain outside the declared annotation-reference grammar.

Controls include local table aliases, nested row aliases, namespace types, imported/re-exported
type aliases and aliases in direct default expressions; missing canonical members; local lookalikes and
unrelated unreadable types. The shared reader mirror additionally pins cycle termination, per-reference
refusal and callable/object-member exclusions. An independent paired family test drives the actual
policy pass against canonical and foreign type homes with fixed expected verdicts.

The historical `EXEMPTION_CONST_RE` is explicitly a **direct-annotation subset**, not an alias census.
It is not replaced with the production query. The live equality still fails if the policy finds a new
case outside that narrow measure, requiring source classification before a new corpus verdict is claimed.
The independently authored alias pair prevents the shared alias reader and a blind regex from agreeing
on a false-clean alias fixture.

### Historical claim and proof map — superseded by Q02-R1 and §11

| Claim | Real entry point and enforcer | Matched controls and discriminating cut | Limit |
| - | - | - | - |
| A local or imported alias cannot hide an authored canonical exemption reference in the supported grammar | `runPolicyPass` → `policy-legacy-imports` import visitor → `exemptionTypeOf` → `canonicalExemptionInAnnotation` → shared `resolveTypeAnnotationReferences` | Seven module `mustFlag` rows: local table alias, nested row alias, namespace alias, imported/re-exported alias, alias in direct default, named tuple and optional/rest tuple. The production family pair independently expects canonical=1 and foreign=0. Cutting alias-body expansion kills all seven rows plus the canonical-missing refusal and the production pair. | References/arguments, arrays, operators/parentheses, unions/intersections, tuples and declared alias RHS only. No arbitrary type computation or inferred initializer identity. |
| Nested containers do not interrupt alias provenance | The shared annotation traversal owns both alias bodies and reference arguments | Cutting type-argument traversal kills only the nested-row and imported-alias module rows, plus the production pair. | This is authored reference provenance, not generic substitution or proof that a type argument affects its containing type. |
| Same-spelled unrelated identities remain distinct | Policy compares the shared declaration facts to the existing canonical home and export-name policy | Existing foreign `ExemptionTable` and new local nested `ExemptionRow` pass rows; foreign half of the production pair. Removing the home predicate makes the foreign table, local nested row and local tuple pass rows plus the foreign pair fail. | Structural resemblance and local retypes do not establish canonical identity. |
| An unreadable canonical leaf cannot be silently acquitted behind a local alias | Shared per-reference refusal retains the imported leaf; existing candidate/origin classifier owns the policy's refusal split | New `mustRefuse` has all module specifiers present but a missing canonical exported member. Cutting only this refusal kills that row; the production pair remains green. Unreadable unrelated import stays a `mustPass`. | Unreadability outside the canonical candidate set is not compiler-validity certification. |
| Existing linear type identity behavior remains available | Existing `resolveTypeIdentityChain` and member/context/property APIs retain their exact function bytes | The 24-test mirror includes ten new annotation cases plus existing identity tests; six existing consumer suites pass 104/104. | This additive query does not repair or claim every module-value reader limitation in §6. |

### Executed verification

- **Pre-repair control:** `/tmp/codex-q02-red.log`, exit1. The transferred `b09e85ca5` predicate was restored around the new proof rows and the new family pair. Module conformance failed exactly `mustFlag[30–34]` and `mustRefuse[2]`; the independent production test also failed on canonical=0 instead of1. No existing row failed. The complete source bytes were restored in `finally`.

- **Repaired floor:** `/tmp/codex-q02-green.log` initially passed76/76; after completing the tuple wrappers, `/tmp/codex-q02-final-tests.log` passed **81/81 across two suites**: the complete `type-member-origin` mirror and `policy-soundness-family.repo.int`. This includes all module proof rows, real-corpus second opinions, absence of tool errors/withholding and all closed-family classes at zero. It does not claim the open migration classes are zero.

- **Tuple red-first:** `/tmp/codex-q02-tuple-red.log`, exit1. Bare tuple elements pass; named, optional, rest and combined named-wrapper cases fail in four mirror assertions, and the two tuple module rows fail. The repair follows the installed wrapper nodes' `getTypeNode()` accessors, without evaluating a new kind of type computation.

- **Five final mechanism cuts:** `/tmp/codex-q02-final-cuts.json` plus its named logs supersede the initial four-cut receipt. Alias expansion: seven finding rows, one refusal row and canonical production pair fail. Type arguments: two finding rows and canonical pair fail. Canonical home: three pass rows and foreign pair fail. Canonical refusal: only the missing-type refusal row fails. Tuple-wrapper cut: four mirror cases plus both tuple module rows fail; the plain tuple and independent production pair pass. Each process exits1 on assertions; each source is restored byte-for-byte. No harness error is counted as a cut result.

- **Unchanged-reader consumers:** `/tmp/codex-q02-cross-consumer.log`, exit0, **104/104 across six suites**: origin-client, ordinary-visitors, home-client, home-server, project-home-origin and bus-fact-relay. This includes the existing linear alias chain and type-member consumers.

- **Final scoped floor:** `/tmp/codex-q02-final-floor.json`, Biome5/ESLint5 and both selected native programs pass. `readCompilerPrograms` plus `resolvePolicyPathOwnership` select `tooling/tsconfig.json` and `tsconfig.json` from the actual five changed TypeScript paths, including the comment-only contract path, recorded in `/tmp/codex-q02-native-selection.json`; no maintained program roster. Restored controls pass12/12 after the cuts and formatting. The first source-formatting attempt reported excessive complexity; the query was split into grammar/alias helpers before the passing behavioral floor. A later tuple-test formatting diagnostic changed only layout before the final floor.

- **Production differential:** `/tmp/codex-q02-corpus-comparison.json` records the full violations and owner accounting from two actual selected CLI runs, before/after the annotation repair. Both exit1 for the same **11 hard/error findings**, with identical file/token/position/message values, complete successful owner, 309 declared/effective source paths, no resource population, no tool/fact/authority errors, no alarms, no withholding and no consumed waivers or grants. This is a selected-policy measurement, not whole-program green. Logs: `/tmp/codex-q02-corpus-baseline.log` and `/tmp/codex-q02-corpus-repaired.log`.

- The named unchanged set is `contract-derives-not-respells`, `contract-derives-not-respells-health`, `depcruise-grant-liveness`, `domain-freshness-plane`, `eslint-grant-liveness`, `lifecycle-portability`, `no-raw-spacing-in-features`, `no-raw-typography-in-features`, `runner-config-path-liveness`, `spacing-tier-home-health`, and `typography-tier-home-health`. The live alias-owning module still has its direct forbidden contract import; the new controls prove that relocating an alias-annotated value no longer removes the receipt finding. Existing migration debt remains.

- **Report formatting:** `pnpm check:docs docs/reviews/gate-runtime/x-typed-import-arm-2026-09-13.md`, exit0. The final scoped control run follows all source formatting; no semantic change follows the full81/81 floor. Cut and corpus probe sources were restored from exact saved bytes.

### Derivation audit and preservation

| Value | Canonical owner and consumers | Consistency and authored choice |
| - | - | - |
| Type declarations, imported/re-exported aliases and alias bodies | TypeScript symbols/declarations through the existing shared type-origin reader | No maintained alias or producer list. Resolved identities and explicit missing facts reuse `ReferenceFact`/`TypeIdentityOrigin`; no new result vocabulary or contract file. |
| Canonical forbidden type names/home | Existing `policy-legacy-imports` ARM D policy: `ExemptionTable`, `ExemptionRow`, `contract/gate.ts` | Preserved authored semantic boundary, not a census copied into a permission list. Both missing-canonical and unrelated-home controls enforce its distinction. |
| Traversal grammar | Shared `type-member-origin` query, derived from actual node kinds and alias declarations | The accepted syntax is a deliberate query contract. The old private gate traversal is removed. The visited set derives from compiler declaration identity, without a hop cap. |
| Corpus expectations | Existing independent source opinion plus separately authored canonical/foreign production fixtures | No copied live policy count or alias roster. The regex is explicitly limited to its direct-annotation subset. A stale factual “four tables” comment was removed; expected fixture counts remain independent test oracles. |
| Native floor membership | Shared compiler-program reader | Selected configs derive from the changed paths; duplicate program IDs deduplicate. |

The six-file continuation fence is the shared reader, its exact mirror, the receiving policy, ARM D-only
family controls/comments, this report, and a coordinator-approved **comment-only** clarification in
`contract/type-member-origin.ts`. That last diff changes only the `TypeIdentityOrigin`/`aliased` documentation;
all interfaces and fields are unchanged. The pre-existing linear readers are unchanged. Exact preservation assertions are recorded in `/tmp/codex-q02-preservation.json`. Q08 production
graph, proof-message grammar, #2342 refusal mechanisms, `reference-fact.ts`, Q06 fixture isolation and both
held conformance materializers are unchanged. The three-commit transfer used the authorized #1584 hook
exception while heavy slots were occupied; its single family-file conflict preserved #2342's deletion of
the retired refusal regexes and added ARM D's constants/opinion only. The final scoped commit retains the
same exception with the executed checks above; independent review, main integration and the combined
root barrier remain owed. No board, ledger, catalog or push operation is included.

### Capabilities audit and measured cost

`tooling/src/verify/gates/TS-MORPH-CAPABILITIES.md` was read in full (245-line blob `b8147309f`), then the
complete correction diff committed by root at `c74b451f8` was read before freezing. Its corrected source
analysis enforcement and separate provider/consumer receipt guidance does not change this types-declared
pure reader into a fact provider. Its highest-layer rule selects an extension of `type-member-origin`: the existing value/module
reader and linear `resolveTypeIdentityChain` do not answer branching authored annotation provenance.
No shared capability is rebuilt. The policy's private type traversal is removed; the new query reuses
existing fact/result construction and declaration-set contracts. Symbols and aliases come from the
installed ts-morph API; `NamedTupleMember`, `OptionalTypeNode` and `RestTypeNode` accessors were verified
in `node_modules/ts-morph/lib/ts-morph.d.ts` before use. No `getType().getText()`, source-text name verdict,
Project discovery, language-service reference search or module-level cache is added.

The missing aliases contradicted the guide's **lossless prefilter** rule: an outer local name had been
excluded before its declared type identity was read. The repair resolves the declared reference graph
first; only an unreadable leaf uses the established candidate/origin classification. Every declaration is
retained; home membership checks the full set rather than selecting its first element. The query's
visited set is local to one invocation and keyed by `compilerNode`; it is not a cross-example cache.
Cycle termination says reachable references have been visited, not that recursive TypeScript is valid.
The policy already declares `analysis: "types"`; the new proof rows retain `mode: "types"`.

The guide does not yet name the new annotation query. A concise documentation handoff is owed to its
owner: use `resolveTypeAnnotationReferences` for branching authored type references, keep
`resolveTypeIdentityChain` for resolved linear type identity, and do not reinstate an outer-name prefilter.
The closed annotation grammar remains narrower than all TypeScript types; object/callable/conditional/mapped bodies are examples of unsupported shapes, not a claim that every other kind is read. The broader receipt obligation remains open outside that grammar.

The final same-checkout comparison uses `/usr/bin/time -v pnpm check:structure --check policy-legacy-imports`
under nice19. `/tmp/codex-q02-timed-receipts.json`, the two `.time`/`.log` files and
`/tmp/codex-q02-timed-comparison.json` retain the invocation and complete outcomes:

| Measurement | Transferred predicate | Repaired predicate |
| - | -: | -: |
| process wall seconds | 13.02 | 12.94 |
| final-pass wall ms | 6075.873 | 6167.319 |
| policy evaluation ms | 5921.961 | 6017.213 |
| fact evaluation ms | 0 | 0 |
| maximum RSS KiB | 3128744 | 2907808 |
| swaps | 0 | 0 |
| effective source population | 309 | 309 |
| raw/effective hard findings | 11/11 | 11/11 |
| tool/fact/authority errors, alarms, withholding | 0 | 0 |

Full finding objects are identical; owner is successful/complete in both runs. Actual Node CLI children
were observed with `NODE_OPTIONS=--max-old-space-size=16384`; their cgroup memory/high/swap limits were
`max`. The host snapshot and exact child command/cgroup are retained in the receipt. These are two cost
observations while sibling lanes were active, not a speedup or asymptotic-cost claim.

## 11. Historical 92e5c4fd8 semantic repair after Q02-R1 — later REFUTED by Q02-R2

**The independent review of `ce3413bfc` was REFUTED.** The reviewer read the complete six-file change and
ran two actual production-pass counterexamples, each with one false ARM D finding, successful/complete
owner, no tool/fact/authority errors and no withholding:

```ts
export const KEY: keyof ExemptionTable = "subject";
type Phantom<T> = string;
export const LABEL: Phantom<ExemptionTable> = "subject";
```

The canonical type names occur in both annotations, but the received values are strings. The complete
independent report is `/tmp/codex-q02-independent-review.md`; its executed probes and output are
`/tmp/codex-q02-keyof-probe.{ts,log}` and `/tmp/codex-q02-phantom-probe.{ts,log}`. This is a defect in the
unintegrated author checkpoint, not a claim about a main regression. The earlier §10 tests and cuts were
real but did not prove the missing distinction. That section is preserved as historical evidence, not
current architecture guidance.

### Mechanism and exact states

`resolveTypeValueOrigins` replaces the sole-consumer `resolveTypeAnnotationReferences` API. The existing
member/context/property/linear type readers are unchanged. TypeScript supplies the actual value graph:
union/intersection constituents, tuple/array/index elements, and mapped property values. The checker also
supplies the results of generic/indexed/conditional computations; this query does not interpret utility
implementations or maintain utility names. A conditional substitution wrapper uses its installed public
`getApparentType()` API, without treating a generic parameter's constraint as the received type.

Authored reference/alias provenance retains names, such as `ExemptionTable`, that normalization otherwise
erases. It is positive evidence only when that reference's `compilerType` occurs in the actual value
graph. Each concrete transforming expression further bounds its own candidates; an unrelated unknown
tuple element cannot poison an erased `Phantom<Row>` sibling. Alias visitation is path-local because the
same alias can occur in an erased argument and an actual value position. All sets are invocation-local;
there is no arbitrary hop cap, project discovery, persistent cache or name-based identity fallback.

| Authored received value type | Production result | Evidence and limit |
| - | - | - |
| Direct/local/imported/namespace aliases of canonical table or row; nested row intersection; open Record; readonly array; named/optional/rest tuple | Finding | Original alias/tuple proof corpus retained; complete canonical declaration set and actual value position establish receipt. |
| `Identity<Row>`, `Table[string]`, `ReturnType<() => Row>`, a conditional selecting Row | Finding | Actual checker output reaches canonical Row; a callable taking/returning Row is a distinct passing control. |
| `Record<'first', Row>` | Finding | The compiler's mapped property VALUE is canonical Row. No finite-key census or Record-name special case. |
| `Readonly<Row>` | Refusal | Mapped member declarations retain canonical interface provenance, but the query does not establish the containing value as that named row. This is explicit unsupported-candidate handling, not a false clean or a claimed exemption finding. |
| `Row \| unknown`, `Row \| any`, invalid `Loop = Loop \| Row` | Refusal | The opaque value type cannot establish authored canonical identity. The cycle and missing-union mirror expectations were corrected from invented positives to explicit unsupported facts. A missing imported leaf remains a separate `missing` fact. |
| `keyof Table`, `Phantom<Table>` returning string, callable generic, `Row['why']`, a conditional selecting string | Pass | Canonical references used as operands, erased arguments, or callable input/output are not value identity. |
| Erased mapped argument; erased argument beside unknown sibling; foreign/local modifier map | Pass | Concrete transformation and known foreign declaration provenance do not become canonical unreadability. |
| Missing canonical imported type behind an alias, including either ordering beside an erased use of that alias | Refusal | The original import leaf remains the refusal subject; a previous visit through an erased path cannot consume its actual-value path. |

The policy distinguishes an unresolved fact with proven declaration provenance from a missing binding:
known foreign provenance acquits; canonical provenance remains unreadable. It preserves the existing
candidate/origin classifier for missing facts with no such declaration trace. The refusal diagnostic now
accurately names an unreadable binding **or candidate value type**, rather than asserting every refusal
means the target failed to export the binding.

This does not prove arbitrary TypeScript validity, structural retypes, inferred initializer identity, or
transport through arbitrary object properties. Modifier projections remain explicit refusals rather than
being quietly excluded. Broader runtime authority/retype migration obligations remain separately owned.
No severity, authority data, materializer, fixture isolation or runtime contract vocabulary changed.

### Executed controls and verification

- The permanent initial semantic controls failed on unchanged `ce3413bfc`: **11 failed / 4 passed**,
  `/tmp/codex-q02-value-red.log`. Besides both reviewer counterexamples, they expose a generic callable
  false accusation and indexed/ReturnType row false cleans. All eleven failing assertions remain in the
  regression corpus. An initial attempt used unavailable `python`; it made no source edit and the following
  old founding test passed. That is a preparation error, not red-first evidence; its log is separately
  `/tmp/codex-q02-value-control-preparation-noedit.log`.
- The expanded projection/opaque controls were **16 failed / 4 passed** on the old query,
  `/tmp/codex-q02-projection-red.log`. After the initial repair, the independently authored alias-path
  ordering pair found a new traversal defect: **2 failed / 1 passed**,
  `/tmp/codex-q02-alias-path-red.log`. Path-local visitation repaired it; neither ordering was deleted.
- Final complete behavior: **106/106 across the two full suites**,
  `/tmp/codex-q02-value-final-tests.log`. This includes module conformance, real-corpus family opinions,
  canonical/foreign production pairs and complete owner/error checks. It does not claim open migration
  warning classes are zero.
- Nine mechanism cuts are recorded in `/tmp/codex-q02-value-cuts.json`, on the 102-test corpus before the
  final conditional-output test additions. All return assertion failures (exit1), restore exact source
  bytes in `finally`, and retain passing controls. No implementation change followed those cuts; the later
  diagnostic clarification and stronger refusal message pins were checked after restoration.

| Cut | Discriminating failure, with passing twins |
| - | - |
| Actual-value eligibility plus local candidate filters | Fourteen assertions fail, including production keyof/Phantom/callable pass controls; genuine outputs still pass. The two filters serve related contexts, so this deliberately cuts both rather than claiming either alone is the entire barrier. |
| Actual Type value edges | Twelve assertions fail: nested/namespace/tuple/finite collection values and canonical production pair, plus missing array provenance. Direct typed table identity still holds. |
| Authored alias provenance | Six assertions fail, including exact table-alias name assertions and missing/cyclic candidate refusals. Resolved output identities still hold; the alias walk is not falsely claimed to be the sole mechanism catching every alias. |
| Canonical declaration home | Foreign table/local-row/local-tuple pass rows and foreign production pair fail. Canonical controls remain findings. |
| Canonical candidate refusal | Six module refusal rows fail while the independent positive/pass pairs remain green. |
| Mapped property values | Only finite-Record module/mirror controls fail; modifier refusal and ordinary collections still pass. |
| Mapped member provenance | Only Readonly<Row> module/mirror refusal controls fail; finite Record remains a finding. |
| Per-expression candidate scope | Only the erased-argument/unknown-sibling module and mirror pass controls fail. |
| Path-local alias visitation | One ordering's missing-canonical module/mirror controls fail; the other ordering passes. |

Two further cuts on the final 106-test corpus are in `/tmp/codex-q02-output-cuts.json`: conditional output
normalization kills exactly its mirror/module/production positive controls (**3 failures**); removing
resolved output symbols kills the indexed, ReturnType and conditional output controls (**7 failures**).
Primitive/callable negatives and genuine alias controls remain green. Both restore exact bytes.

- **Scoped floor:** `/tmp/codex-q02-value-floor.json` retains Biome5/ESLint5, restored **37/37**
  selected assertions, and **104/104 across six unchanged-reader consumer suites**. The first native
  run passed tooling but caught two test-only typing errors: an optional finding message and union
  narrowing after a compound filter. Those assertions were corrected without a production change;
  Biome5/ESLint5, the restored37, and both selected native programs then passed. Selection comes from
  `/tmp/codex-q02-value-native-selection.json`, not a maintained config list. Native logs retain both
  the failed attempt and the final `native-after-test-types` pass.
- **Same-checkout selected-policy comparison:** `/tmp/codex-q02-value-timed-comparison.json` and
  `/tmp/codex-q02-value-timed-receipts.json` retain full findings, timing, memory and actual child heap
  settings. The baseline restores `ce3413bfc`'s predicate/reader around the current proof declarations;
  the repaired run uses final source. Both report identical11 hard/error findings over309 source paths,
  successful/complete owner, no tool/fact/authority errors, alarms or withholding, and no grants/waivers.
  Exact source bytes are restored in `finally`.

| Measured cost | ce3413bfc predicate | Semantic repair |
| - | -: | -: |
| process wall seconds | 13.03 | 15.79 |
| final-pass ms | 5853.497 | 6352.648 |
| policy ms | 5698.406 | 6177.493 |
| maximum RSS KiB | 3123660 | 2948296 |
| swaps | 0 | 0 |

Both actual CLI children carried `NODE_OPTIONS=--max-old-space-size=16384`; cgroup memory/high/swap limits
were `max`. This is a measured cost increase in one pair of runs beside other lanes, not an isolated
benchmark or asymptotic claim. These corpus receipts describe the older author tree. In current main,
root separately observed the now-clean binding-resolution population invalidate that family's old
`unambiguous.length > 0` expectation. Q02 does not modify that block and does not claim to fix that
current-main assertion; root owns the other lane's non-vacuity repair and combined integration floor.

### Derivation, preservation and completion boundary

| Information | Canonical owner and consumers | Consistency |
| - | - | - |
| Type value positions, generic outputs, mapped identity and declaration provenance | Installed TypeScript/ts-morph public Type/symbol/declaration APIs, consumed by the existing shared type-origin reader | No copied utility names, shape keys, producer paths, module rosters or generic evaluator. `ObjectFlags.Mapped` and `TypeFlags.Substitution` are compiler-owned flags; the two explained bitfield operations use the existing governed Biome suppression mechanism. |
| Forbidden canonical vocabulary | Existing ARM D policy: the two exports and `contract/gate.ts` home | Preserved authored semantic choice; not a live census or derived permission list. Complete declaration sets and independent foreign-home controls remain mandatory. |
| Candidate result/refusal fields | Existing `ReferenceFact` and `TypeIdentityOrigin` contracts | No new fields or vocabulary. The contract file changes comments only, explaining when authored provenance is eligible. |
| Traversal termination | Invocation-local compilerType sets and path-local compilerNode alias sets | No hop limit; both repeated-alias orderings and cycle controls are retained. |
| Verification membership | Existing compiler-program/affected-path readers | Native configs derive from the changed paths; fixture expectations remain independent oracles. |
| ARM B explanation | Existing registration contract and synthetic fixtures | LOW-4's dated live count and dissolved final/legacy examples were removed from their three proof/comment sites and the coupled header. The registering final/legacy fixture arms remain intact. |

The exact six-file fence remains the shared reader, its mirror, the policy, ARM D family-test additions,
the comment-only type-origin contract and this report. `/tmp/codex-q02-value-preservation.json` confirms all pre-existing shared reader functions/home matchers,
the entire family test after subtracting this leg's one parameterized test, and all held/shared source
files remain byte-identical to `ce3413bfc`. The contract difference is comments only.
Independent closing review, root integration and the combined barrier are still owed. No main, board,
ledger, catalog, authority-data or held security/materializer edits and no push are part of this repair.

## 12. Uniform typed-data containment after Q02-R2

**Q02-R2 independently REFUTED `92e5c4fd8`; it remains refuted historical evidence.** The closing
report `/tmp/codex-q02-closing-review.md` and production probe
`/tmp/codex-q02-closing-probe.{ts,log}` showed that `Readonly<{ row: ExemptionRow }>`,
`Partial<{ row: ExemptionRow }>` and a readonly interface wrapper produced findings while the reader
explicitly excluded the equivalent unwrapped object. Those runs completed with zero tool errors and
therefore exposed a semantic contradiction, not missing fixture substrate.

The premise retracted is that a compiler mapped-type flag can distinguish a finite collection from an
ordinary data wrapper. `Record<'first', Row>` and `{ first: Row }` carry the same canonical property type;
readonly and optional modifiers do not establish exemption use. Root ruled **uniform typed data
containment**, retaining canonical declaration identity rather than structural assignability.

### Current contract and reclassifications

ARM D now says **“typed to carry canonical exemption data”**. It follows actual checker data types at the
root, union/intersection constituents, array/tuple/index elements and named properties. It does not claim
the received binding itself is a Row, that an optional/empty carrier presently contains a row, or that
its consumer uses the data to suppress findings. Callable parameter/result types, erased outputs,
`keyof` operands and foreign structural lookalikes establish no such containment.

| Case | Classification | Change from 92e |
| - | - | - |
| Finite Record, ordinary object, readonly/optional object, readonly interface and composed nested carriers with exact canonical Row | Finding | Ordinary/composed wrappers become visible; the former mapped-only distinction is removed. The three R2 counterexamples remain findings under the explicitly corrected containment contract, with a truthful diagnostic. |
| Finite `Box<Box<Row>>`, nested `Readonly` inputs, stable or mutually recursive objects with a canonical leaf | Finding | Their real data paths retain canonical identity; repeating a constructor name is not a recursion refusal. |
| Empty `Partial<{ row: Row }>` initializer | Finding | Declared containment, not nonempty/runtime-row evidence. |
| `Readonly<Row>` and nested identity-losing canonical projections; opaque canonical member types | Refusal | Member declarations or authored candidates establish the unresolved canonical provenance. A wrapper cannot hide the refusal. |
| Changing recursive generic instantiation through an active data definition | Refusal for a canonical candidate; foreign remains foreign | Compiler type identity alone does not terminate an expanding graph. See the bounded recurrence contract below. |
| Erased/callable/foreign shapes and recursive foreign graphs | Pass | Existing canonical-versus-foreign scope is retained. |

The original combined callable/object mirror is preserved with explicit reclassification: the callable
still passes, while its ordinary object twin now contains Row. An old blanket “no unresolved facts”
assertion for an erased argument beside an unknown tuple element becomes the stronger policy-relevant
pair: neither resolved nor unresolved **canonical** provenance may appear. Traversing ordinary object
members can now expose unrelated `Array` interface-projection facts; those facts remain foreign and do
not turn into policy refusals. No type name or utility whitelist suppresses them.

### Recursion boundary and its controls

The installed compiler produced twelve distinct types for successive `Nested<Row>` → `Nested<Row[]>`
steps in `type Nested<T> = { next: Nested<T[]> }`, with one shared target identity
(`/tmp/codex-q02-containment-recursion.{mjs,log}`). This bounded API probe did not run an unbounded
production query and is not a runtime verdict.

The query now tracks active data edges and their declaration provenance. A changed instantiation may
refuse only when the same compiler constructor is re-entered and an active generic declaration's data
definition names that target. Finite supplied-argument peeling is supported. Supplied generic arguments
are used for that termination distinction only; they never become evidence that a binding carries Row.
Ordinary identical-type cycles terminate through the existing invocation-local compilerType set. There
is no production hop, count or time cutoff and no global constructor blacklist.

The first recurrence implementation wrongly refused a finite nested `Readonly` input. Its permanent
reader/production pair failed **2/2**, `/tmp/codex-q02-containment-finite-modifier-red.log`; requiring the
reference to belong to an active generic declaration repaired it. This matters because input syntax can
repeat a constructor without that constructor recursively defining itself.

A test-only spy trips after 64 expansions of the fixture's authored `Nested` type so removing the
production refusal cannot exhaust the test worker. The old unguarded query failed the two mirror cases
and module conformance (**3 failures**, `/tmp/codex-q02-containment-recursive-red.log`). This is a
fail-fast test instrument, not an asserted production bound. The expected policy refusal text remains
independent; the tripwire's error is deliberately different and fails that assertion.

### Selected indexed-member provenance

`Holder["row"]` must refuse when its selected annotation is `Row | unknown`; the same holder's
`Holder["clean"]` must pass when that field is only `unknown`. The first source probe exposed a lost
canonical candidate at the indexed door. The permanent paired controls were **2 failed / 1 passed**
(`/tmp/codex-q02-containment-selected-index-red.log`), with the unrelated clean-field control already
passing. The repair reuses `resolveTypePropertyOrigin` for compiler-selected literal keys and reads only
the selected data member's annotation. It never walks the entire holder to obtain that provenance.
The primitive `Row["why"]` result remains noncanonical even beside an opaque tuple sibling. Nonliteral
index outputs continue to use actual checker output identities; no index-expression evaluator was added.

### Verification and scope

The initial containment controls failed on the unchanged 92e reader: **14 failed / 26 passed**.
The first fixture-preparation script misplaced new mustFlag rows inside a fixture string. That was
corrected before claiming module coverage; the complete actual descriptor rows were rerun against 92e
with exact reader restoration, again **14 failed / 26 passed**
(`/tmp/codex-q02-containment-row-red.log`). The earlier preparation run is not the module-row receipt.

- **Final restored behavior:** **144/144 across both complete suites** (mirror 64, family 80),
  `/tmp/codex-q02-containment-final-full.log`, artifact
  `reports/runs/test/agent-a6646bc6706ca2732-3845806-2026-09-13T18-01-33-559Z/test-report.json`.
  This includes module conformance, independent production wrapper pairs and the real-corpus family
  opinion with its complete-owner/error assertions. The earlier full 141 and selected 75 runs are retained
  as intermediate receipts; neither replaces this final full run.
- **Seven mechanism cuts:** the first five are in `/tmp/codex-q02-containment-cuts.json` on the 141-test
  corpus; the selected-index pair is in `/tmp/codex-q02-containment-selected-index-cuts.json` on the 144-test
  corpus. Each has exit1 assertion failures, passing controls and exact source restoration in `finally`.
  The final full 144 run followed all cuts and the production baseline substitution.

| Cut | Discriminating result | Passing boundary |
| - | - | - |
| Named data edges | 29 fail / 43 pass | Direct canonical identities and unrelated shapes still run. |
| Authored data provenance (joint type-literal/member/interface candidate paths) | 4 fail / 68 pass | Actual readable canonical data still resolves. |
| Member-projection provenance | 3 fail / 69 pass | Exact canonical identities remain findings. |
| Changing recursive-instantiation refusal | 3 fail / 69 pass | Finite nesting, stable cycles and nonrecursive controls remain green; test tripwire prevents unbounded expansion. |
| Recursive declaration ownership | 2 fail / 70 pass | Finite nested Readonly reader/production positives expose the overbroad refusal. |
| Selected-index provenance omitted | 2 fail / 73 pass | Canonical selected member falsely passes; its clean sibling and primitive outputs remain green. |
| Selected member replaced with the whole holder | 2 fail / 73 pass | Clean sibling is falsely refused; canonical selected member still refuses. |

- **Consumer/static floor:** six unchanged-reader consumer suites **104/104**,
  `/tmp/codex-q02-containment-cross-consumers.log`. Biome 5 and ESLint 5 pass. ESLint's first attempt
  found only an unescaped generic example in a TSDoc comment; the corrected example passes. Both native
  owning programs pass, selected through `readCompilerPrograms`/`resolvePolicyPathOwnership` from the
  five changed TypeScript paths: `/tmp/codex-q02-containment-native-selection.json` and
  `/tmp/codex-q02-containment-restored-floor.json`. No ignored/unowned input is counted as covered.
- **Preservation:** `/tmp/codex-q02-containment-preservation.json` compares against 92e and confirms
  existing linear reader functions and home matchers, the family file after the owned ARM D block, the
  policy fixture helpers and all named held/shared source files are byte-identical. The contract edit
  contains comments only. The initial prefix check included the intentionally changed import line;
  the corrected function-region comparison establishes the stated API preservation, not import parity.
- **Selected-policy production comparison:** `/tmp/codex-q02-containment-timed-comparison.json` retains
  complete findings and error arrays; `/tmp/codex-q02-containment-timed-receipts.json` retains actual child
  process, heap and memory receipts. Both runs use current policy/proof declarations, substituting only
  the 92e shared reader for the baseline and restoring exact bytes. Both produce identical 11 hard/error
  findings over 309 source paths, complete successful owner, no grants/waivers, errors, alarms or
  withholding. The six ARM D doors are the two importers of each existing `ALLOWLIST`, spacing and
  typography table; the other five findings are existing ARM A contract imports. This older author-tree
  measurement does not override root's separately owned current-main corpus/census changes.

| Measured cost | 92e reader | Uniform containment reader |
| - | -: | -: |
| process wall seconds | 12.63 | 17.15 |
| final-pass ms | 5849.250 | 10459.738 |
| policy ms | 5687.591 | 10290.297 |
| maximum RSS KiB | 3129644 | 3319544 |
| swaps | 0 | 0 |

Both actual CLI children carry `NODE_OPTIONS=--max-old-space-size=16384`; cgroup memory/high/swap limits
are `max`. The broader traversal measurably costs more in this pair. This is a single shared-host
comparison, not an isolated benchmark or an unchanged-cost claim. No production timeout, hop cap or
name-based shortcut was added to conceal the increase.

The scoped documentation-format check is recorded with the checkpoint. The coordinator-authorized
\#1584 hook exception is used for this six-file commit; the above scoped checks replace a duplicate
whole-project hook battery during the integration train. Independent closing review, root integration,
and the consolidated barrier remain owed. No broad or push-tier clearance is claimed.

### Derivation and limits

- Actual data members, outputs, constructor identity and declaration provenance derive from installed
  TypeScript/ts-morph APIs. `ObjectFlags.Mapped` and its suppression are removed. The existing
  `TypeFlags.Substitution` check still normalizes a compiler output, not a utility name.
- The policy's two canonical exports and canonical contract home remain its existing authored semantic
  choice. No live population, path/producer roster, copied field vocabulary or expected fixture count
  becomes permission data.
- Shared `ReferenceFact` and `TypeIdentityOrigin` fields remain unchanged; the contract edit is comments
  only. Existing linear member/property/context/type readers and held materializers remain unchanged.
- Five source/test paths plus this report are the exact fence. LOW-4's three ARM B source-prose fixes from
  92e are retained without deleting their valid synthetic final/legacy fixtures. Main's separately owned
  binding-resolution census assertion repair must be preserved during integration.
- Canonical identity is narrower than semantic exemption use. Structural retypes, inferred initializer
  identity, arbitrary compiler validity and the wider authority migration are not certified by this arm.
  Independent closing review, root integration and the combined barrier remain owed; no main, board,
  ledger, catalog, authority data or held security/materializer changes are included.

## 13. Expanding generic recurrence correction

Two independent reviews refuted section 12's original recursion boundary. First,
`type Nested<T> = { next: Nested<T[]> }; Nested<ExemptionRow>` was refused even though its canonical argument
never reaches data. The old declared `mustRefuse` fixture encoded that phantom. An intermediate finite-prefix
repair then falsely cleared parameter rotation such as
`type N<T, D> = { value: D; next: N<D, T[]> }; N<ExemptionRow, string>` even though a later `value` receives
the row. Both findings preserve section 12's uniform data-containment ruling and replace its recursion mechanism.

The reader now follows a generic recurrence to a finite fixpoint over two facts: which initial arguments each
current parameter retains, and which initial arguments the current data outputs retain. It follows stable cycles,
mutual recursion, swaps, longer rotations, conditionals and changing instantiations without a hop cap or utility
name roster. A repeated state stops expansion. Only an initial argument that reaches a non-recursive data slot is
retained as a recursive candidate; recursive transport, `keyof`, callables and erased arguments remain syntax-only.
Resolved data remains a finding. Identity-losing or opaque data remains a refusal with the specific recursive-data
reason. The declared refusal fixture now contains `value: Readonly<T>` and the erased shape moved to `mustPass`.

The paired reader and production tests cover direct data, one-hop swap, two-hop rotation, mutual swap,
conditional transport, stable swap, expanding `Readonly` and stable identity-losing `Readonly`. The tripwire
counts distinct instantiated generic targets instead of recognizing a fixture alias name. Red-first recurrence
tests on the intermediate repair produced **12 failures**. The final required command
`pnpm test:scoped tests/tooling/verify/lib/type-member-origin.test.ts tests/tooling/verify/gates/policy-soundness-family.suite.repo.int.test.ts`
passes **161/161** (72 reader + 89 production family), including declared conformance and the real corpus; report
`reports/runs/test/agent-a6646bc6706ca2732-4134949-2026-09-13T19-03-15-309Z/test-report.json`.

The independent 25-shape production matrix is clean for erased, nested-erased, mutual-phantom, `keyof` and
swap-phantom cases; it reports or refuses every direct, rotated, conditional, opaque and projected data case.
Its `Readonly`-after-expanding-swap shape resolves the reachable `ExemptionRow[]` and is therefore a finding;
the paired stable `Readonly<ExemptionRow>` rotation retains the required identity-losing refusal. Scoped Biome
and ESLint pass on all five touched TypeScript files. Native typecheck passes `tooling/tsconfig.json` and
`tsconfig.json`. No gate runtime, authority, population or timeout contract changed.

A second closing review found that the first fixpoint relation discarded named-property structure. Three- and
four-parameter rotations carrying a root through `{ k: T }`, including `Readonly<{ k: T }>`, repeated an
all-false property-blind signature before the root reached `value`. The transport relation now follows the same
semantic named-property and index-output edges as DATA CONTAINMENT. It does not follow generic argument syntax,
callable signatures or recurrence-target properties. This preserves arbitrary finite ordinary-object,
same-constructor and selected-index wrappers while the recurrence target still terminates structurally.

Paired red-first reader and production controls produced **6 failures** for the wrapped three-parameter,
four-parameter and `Readonly` rotations; the wrapped phantom controls already passed. The repaired focused
selection adds repeated `Box<Box<T>>` and indexed-output transport and passes **26/26 selected** with 147 existing
tests skipped. The compiler receipt independently accepts `N<ExemptionRow>["next"]["value"]` as
`ExemptionRow` for the conditional recurrence now reported as a finding. Opaque and identity-losing controls
remain refusals.

The first complete floor after this correction passed 171 and exposed two coupled stale expectations:
`Readonly<T>` in `Nested<T>` becomes `Readonly<ExemptionRow[]>` on the first `next`, whose numeric data output
is a canonical row, so both the reader and policy correctly report it. A compiler assignment now pins that
exact `value.next.value[0]` output. The declared refusal moved to the stable rotation
`Nested<T, D> = { value: Readonly<D>; next: Nested<D, T> }`, where the canonical row reaches only
`Readonly<ExemptionRow>` and specifically refuses because member provenance does not establish the containing
value's identity. The next floor passed 172 and exposed only the old expected diagnostic phrase; after matching
the specific observed refusal, the final owning floor passes **173/173** (78 reader + 95 production family):
`reports/runs/test/agent-a6646bc6706ca2732-105244-2026-09-13T19-32-21-744Z/test-report.json`.
Scoped Biome and ESLint pass on the five touched TypeScript files, and native typecheck passes both
`tooling/tsconfig.json` and `tsconfig.json`. Independent closing review remains required before integration.

## 14. Finite declaration transport correction

A third independent review refuted the property-aware recurrence state in section 13. A recursive constructor
wrapped by `Box` or `Readonly` could be stopped at the wrapper and clear a later canonical row. Intersection
aliases also decomposed each fresh instantiation indefinitely: the first supervised measurement exhausted the
16.4 GB Node heap twice, at about 50 seconds per worker, and produced no test verdict. Independent recursive
constructors, nested same-constructor wrappers and delayed conditional outputs supplied separate finiteness and
soundness controls; no hop cap, timeout or utility-name exception was accepted.

The reader now builds a finite summary keyed by canonical generic declaration identity. Each constructor owns
two monotone sets over its finite formal parameter indices: structurally proven data flow and possible flow
through a dependent operator. Closed possible output identities compose only through data-bearing constructor
applications. A least fixed point handles swaps, rotations, mutual recursion and nested wrappers without
manufacturing an unbounded series of compiler types. Constructor identity, declaration and supplied arguments
come from one descriptor; a zero-parameter alias follows its authored type reference. A finite constructor
call graph permits recurrence frames only for cycle participants, so `Box` and `Readonly` retain their concrete
property edges while `N` terminates. Concrete compiler outputs remain the only positive evidence. Possible
mapped or conditional flow retains candidate-specific refusal evidence, while condition operands, `keyof`,
callables and erased arguments remain excluded.

Permanent reader and production controls cover the Box and Readonly edge positives and Box phantom, recursive
intersection finding and phantom, independent recursive wrapper positive and property-order phantom twins,
nested `Box<Box<N<...>>>`, defaulted and non-generic alias roots, a delayed closed-output conditional through a
separate alias, and a condition-only negative. The test-only expansion tripwire now observes intersection
decomposition as well as property expansion. Refusal assertions pin policy id, phase, withholding and the
case-specific message, so the tripwire cannot impersonate a policy refusal.

The first corrected focused run selected the intended **34/34** tests and passed in 5.71 seconds:
`reports/runs/test/agent-a6646bc6706ca2732-178426-2026-09-13T20-54-24-115Z/test-report.json`.
The complete owning floor passes **199/199** (91 reader, 108 production family) in 72.26 seconds:
`reports/runs/test/agent-a6646bc6706ca2732-348585-2026-09-13T20-57-26-306Z/test-report.json`.
The intersection finding is 138 ms in the focused run, replacing the prior 43--53 second/OOM path; its paired
phantom also passes. Scoped Biome and ESLint pass. The first native typecheck correctly rejected a readonly
worklist used with `pop`/`push`; copying the discovered references into a mutable local array was the only
post-suite edit. The rerun passes both `tooling/tsconfig.json` and `tsconfig.json`, and post-edit Biome and
`git diff --check` pass. The coordinator-authorized #1584 scoped-commit exception still owes independent final
review, root integration and the consolidated barrier; no gate runtime, authority, population or timeout
contract changed.
