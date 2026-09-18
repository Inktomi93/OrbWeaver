---
kind: review
status: active
updated: 2026-09-13
---

# Q08 production consumption: independent review and method-root repair

This preserves the independent source review of `df5b0c51b..fd2970553` and the subsequent author repair for [#2337](https://github.com/Inktomi93/orbweaver/issues/2337). The initial **REFUTED** verdict is historical evidence about that unintegrated checkpoint; it does not claim that #2337 was a regression on main. The initial review prose below is preserved with headings nested one level. Its one finding is represented by the canonical row at the end.

## Independent Q08 review — `df5b0c51b..fd2970553`

### Verdict

**REFUTED.** The new dependency graph loses every production dependency when a valid final descriptor spells `create` as an object-literal method. That creates false `policy-family-readers` findings for a contract form the existing gate-contract reader explicitly accepts.

This is a source-review verdict. Per the coordinator's active-static constraint, I ran no tests, native typechecks, policy passes, or cuts.

### Confirmed defect

#### Method-form `create()` is treated as an absent production root

At `fd2970553`, `policyProductionDependencies` obtains the root with `descriptorValue(descriptor, "create")` (`tooling/src/verify/lib/policy-descriptor-read.ts:273-279`). `descriptorValue` returns only a `PropertyAssignment` initializer or a `ShorthandPropertyAssignment` name (`:142-149`); a `MethodDeclaration` returns `undefined`. The caller converts that directly to an empty dependency set.

Method-form `create() { ... }` is valid in this repository's final descriptor grammar:

- `tooling/src/verify/lib/gate-contract.ts:131-155` recognizes `MethodDeclaration` descriptor fields.
- `tests/tooling/verify/lib/gate-contract.test.ts:40-55` explicitly accepts a canonical `defineGate({ ..., create() { ... } })` descriptor with no findings.
- Runtime validation only requires `typeof descriptor.create === "function"` (`tooling/src/verify/lib/policy-validation.ts:526-527`), which an object method satisfies.
- `callableProductionNodes` already supports `MethodDeclaration` (`policy-descriptor-read.ts:177-181`), so the omission is solely at root extraction.

Concrete discriminating control:

1. Plant a shared `tooling/src/verify/lib/shared-probe.ts` exporting `readShared`.
2. Plant two final same-family gate modules, both importing `readShared`, with method-form roots:

```ts
export const gate = defineGate({
  id: "twin-a",
  family: "twin",
  create() {
    return { evaluate: () => readShared(1) };
  },
});
```

and the equivalent `twin-b`.

Expected: zero `policy-family-readers` findings because both production hooks consume the same canonical lib declaration.

Actual from the source path: `descriptorValue(..., "create")` is `undefined` for both, both dependency sets are empty, and `isolatedIn` reports both `family` properties (`policy-family-readers.ts:83-89,124-145`).

A permanent reader control should assert that the method node is the root and reaches `readShared`; a policy proof should pin the two-member zero-finding outcome. The implementation should extract a method-form `create` without broadening ordinary `descriptorValue` semantics for fields whose method/accessor forms are not values.

### Other reviewed claims

The remaining changed graph is source-consistent with its stated boundary:

- traversal starts at `create`, excludes module proof data and erased type nodes, and ignores uncalled local function/arrow declarations;
- callable declarations, local wrappers, stable values, module aliases, namespace/re-export aliases, and canonical compiler-node identity are followed without a numeric hop cap;
- sharedness is keyed by declaration identity under `tooling/src/verify/lib/`, not by import text or containing file;
- caches are local to one `policyProductionDependencies` invocation, while the existing reference-fact write caches remain bounded by `runPolicyPass`'s begin/end pass;
- the real-project control uses `loadMixedGateCorpus(root).final` rather than a copied known-policy roster and adds/removes only ts-morph `SourceFile` objects in `finally`.

Those observations do not cure the legal root-form false positive above. The graph proves source reach/identity only; semantic fitness and actual callback/branch execution remain outside its mechanical verdict, as the changed headers state.

### Receipt inspection and integration compatibility

- The immutable range changes exactly the four assigned files, 463 insertions and 209 deletions.
- Frozen author report SHA-256 matches `509d4b901f076aad6f491d615c4d337c54b1a667dc50ffc2fc9274499f0401e6`.
- I read the author artifacts for reader 24/24, family 15/15, derived family proofs 210 over 10 policies, six cuts, and the live-root cut. Their recorded contents match the author's summary, but they are author receipts rather than independent runs.
- Main `d760233c1` has byte-identical versions of all four base blobs from `df5b0c51b`; the commits are not directly ancestral, but the Q08 patch has no pre-existing same-file main delta at this snapshot.
- The author worktree HEAD is `fd2970553`; its four assigned files are currently dirty after the pinned commit. I reviewed commit objects via `git show`, not those later working-tree bytes.

### Files read

Full pinned changed files:

- `tooling/src/verify/lib/policy-descriptor-read.ts`
- `tooling/src/verify/gates/policy-family-readers.ts`
- `tests/tooling/verify/lib/policy-descriptor-read.test.ts`
- `tests/tooling/verify/gates/policy-soundness-family.suite.repo.int.test.ts`

Load-bearing unchanged readers/call paths read in full:

- `tooling/src/verify/lib/reference-fact.ts`
- `tooling/src/verify/lib/reference-fact-call.ts`
- `tooling/src/verify/lib/gate-contract-origin.ts`
- `tooling/src/verify/lib/loader.ts`

Relevant contract acceptance and validation sections were read in `contract/policy.ts`, `lib/policy-validation.ts`, `lib/gate-contract.ts`, and `lib/gate-contract.test.ts`. Q06/#2333 materializer/security work was not inspected or included.

## Author repair and verification

The root extraction now selects the descriptor's `MethodDeclaration` when `create` uses method syntax; assignment and shorthand roots continue through `descriptorValue`. Ordinary data-field grammar is unchanged. The existing callable traversal already handles method bodies and parameter defaults.

The committed control has two same-family canonical final modules calling the same imported `readShared` from method-form `create` hooks. It runs through `verifyPolicyProofs` and `runPolicyPass`, so a helper's existence cannot acquit the pair. A separate reader control checks the canonical target declaration and preserves the absence of an ordinary method initializer.

| Measurement | Receipt |
| - | - |
| Red before repair: actual policy proof | `/tmp/codex-q08-method-create-red.json`: exactly `policy-family-readers:mustPass[0]` fails, expected zero findings but got two; all 19 prior rows pass |
| Red before repair: reader control | `pnpm test:scoped tests/tooling/verify/lib/policy-descriptor-read.test.ts -t 'method-form create roots'`, exit 1, one failure and 24 skipped; `/tmp/codex-q08-method-reader-red.log` |
| Repaired actual policy proofs | `nice -n 19 pnpm exec node /tmp/codex-q08-family-proof-run.mjs /tmp/codex-q08-method-create-green.json`: 20 rows, zero failures |
| Reader and family suites | `pnpm test:scoped tests/tooling/verify/lib/policy-descriptor-read.test.ts tests/tooling/verify/gates/policy-soundness-family.suite.repo.int.test.ts`, exit 0, 40 tests passed across two suites; `/tmp/codex-q08-method-tests.log` |
| Discriminating method-root cut | Replace only the method-root branch with `descriptorValue(descriptor, "create")`; actual policy conformance fails exactly `mustPass[0]` with two findings. `/tmp/codex-q08-method-cut.json` records restoration=true and restored reader SHA-256 `47c4703f3272ebd33d27ffec9df8a769983cee7c62566befe4e9bd2f7ca3bfed` |
| Scoped lint | Biome and ESLint over the three changed TypeScript files, exit 0; `/tmp/codex-q08-method-biome.log` and `/tmp/codex-q08-method-eslint.log` |
| Native TypeScript | `nice -n 19 pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json`, both selected programs pass, exit 0; `/tmp/codex-q08-method-types.log` |

The proof counts above are dated measurements, not maintained policy constants. The repair introduces no authored list or cardinality. Its only field name is the contract's existing `create` root, and method recognition uses ts-morph's node predicate already used by the contract reader. The fixture's expected two members is an independent oracle for its two authored modules.

This repair does not expand the graph's guarantee beyond possible source reach and canonical identity. Semantic fitness, branch execution, the existing warning debt, and compiler/proof-message grammar work remain separate obligations. Q06/#2333 held materializer boundaries were not changed. Whole-root checks and catalog/ledger reconciliation remain the coordinator's integration floor.

## Independent closing review

### Independent closing review — `241fa7030`

**CONFIRMED.** Independent review at `241fa70301d74c7d812b498ad2d4c2f80f00a38f` found the #2337 repair correctly scoped. `policyProductionDependencies` roots a method-form `create` at its `MethodDeclaration`, while `descriptorValue` still accepts only property assignments and shorthand assignments. The reader control pins both sides of that boundary, and the new `policy-family-readers` `mustPass[0]` sends two same-family method-form descriptors through the production policy path; both consume the same canonical imported reader declaration.

Independent command: `pnpm test:scoped tests/tooling/verify/lib/policy-descriptor-read.test.ts tests/tooling/verify/gates/policy-soundness-family.suite.repo.int.test.ts`, exit 0, 40/40 tests passed (25 reader, 15 family), report `reports/runs/test/agent-a6646bc6706ca2732-2508587-2026-09-13T13-15-41-532Z/test-report.json`. The author cut was also inspected: removing only the method-root branch fails exactly `policy-family-readers:mustPass[0]` with two findings and restores the source SHA. This closes `Q08-METHOD-ROOT` at the author checkpoint; integration verification remains coordinator-owned. The graph's stated limit remains source reach and canonical identity, not semantic fitness or branch execution. Q06/#2333 is outside this review.

## LEDGER ROWS (1 row)

| id | module | wave · path | defect | class | state | receipt |
| - | - | - | - | - | - | - |
| Q08-METHOD-ROOT | `policy-descriptor-read` / `policy-family-readers` | Q08 independent review · `policy-descriptor-read.ts:142-149,273-280` | At `fd2970553`, valid method-form `create() { ... }` starts from no production node and falsely reports both members of an otherwise shared-reader family | other (false positive / legal descriptor form) | **CONFIRMED — #2337 author checkpoint 241fa7030; root integration still owed** | Initial source refutation above; actual two-member policy red/green and discriminating cut, reader control and 40-test floor; no claim of main integration |
