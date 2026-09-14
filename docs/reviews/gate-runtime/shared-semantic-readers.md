---
kind: review
status: active
updated: 2026-09-05
---

# Shared semantic prerequisites for the first visitor wave

Parent program: [#1584](https://github.com/Inktomi93/orbweaver/issues/1584). Base: `80890046b4f93071d2e77cf242abad31eea31d28` on `codex/gate-tsmorph-standardization`; implementation branch: `codex/gate-shared-semantic-readers`.

## Evidence boundary

This map covers exactly the 17 A-M and 69 N-Z rows in [simple-visitors-a-m.md](simple-visitors-a-m.md) and [simple-visitors-n-z.md](simple-visitors-n-z.md). Both reports were read in full; their closed source review supplies the per-policy prerequisite inventory. This lane reread every reader/helper and representative gate used to design its implementation, rather than claiming a second full-source review of all 86 gates. A set comparison verifies 86 unique manifest rows, with no omissions or additions below. The map is migration evidence, never a runtime registry or progress board.

The repeated computations justify two foundations: reference origins and static authored values. The table distinguishes a supplied prerequisite from a converted or proven policy. No gate module, ResourceHost, population/authority contract, or policy runtime is changed by this lane. Policy subscriptions, population equivalence, authority splits, exact grants, and policy-specific proofs remain with conversion under [the design](../../design/gate-runtime-standardization.md).

## Reader families

- **M:** shared member normalization across dot, optional and computed static keys using `ReferenceFact`.
- **O:** stable binding, canonical module/member origin, and call/construction target facts. The authored import door is retained separately from `canonical`: a resolved project export carries its declaring source and export name; an unresolved package import is explicitly `external-door`, which proves authored spelling and never proves export existence. Missing relative imports refuse. Import identity does not prove a QueryClient/Drizzle/Zustand instance receiver or execute a factory.
- **G:** ambient global/member/call origin with lexical shadow controls. Globals absent from the loaded type program remain unresolved.
- **V:** static authored scalar/object/tuple values with refusal propagation and source anchors. Objects retain ordered entries, including duplicates; callers must decide whether their policy judges all authored entries or effective last-write precedence. These facts do not interpret Zod, SQL, CSS, JSX spreads, arbitrary builders, or control flow.
- **-:** no new fact from this lane is needed or enough to address that row's prerequisite.

Authored values describe source shape, not the value at an arbitrary execution point. Explicit composite writes and invoked member methods refuse; arbitrary free-function effects and escaped-reference mutation are not evaluated. Namespace/member and destructured value reads, interpolated templates, builders, accessors, holes, and prototype setters remain loud refusals. A converter needing an effective runtime value must prove that stronger subject contract rather than treating a resolved authored shape as it.

Call/apply/bind adapters are unresolved without Function-member identity proof. Default-import object paths are retained as `default` plus member path; they are not equated to named exports. Locally exported aliases to imported values refuse in module-origin analysis instead of claiming the intermediate declaration is the canonical target. Ambient identity is relative to the loaded, valid compiler program; invalid duplicate global declarations that the checker discards require the outer type-diagnostic refusal.

`resolveStableExpression` proves stable binding-to-source-expression identity, not unchanged object contents. Its binding-only reassignment facts preserve the existing census reader that locates mutation owners. Module/global origins and authored composite values separately apply the full member-write/effect facts; the paired regression proves that finding an initializer does not certify its current contents. Shorthand reads and assignments share one lexical value-symbol resolver.

These are computation groups, not final policy `family` identifiers. The converter must prove actual shared consumption before assigning a shared policy family.

The legacy `ast-read.ts` and `symbol-reference.ts` APIs still have capped/undefined-returning readers consumed by unconverted gates. They are not the new fact boundary, and remain only for the atomic migration's existing consumers; conversion and removal of those consumers are outside this reader lane. No new reader constructs a Project or caches on Project identity.

## Closed row map

| Manifest row | Foundation | Remaining AST/type work or integration boundary |
| - | - | - |
| `baseui-render-prop-composition` | - | Syntax-only rule; JSX spreads/inherited props remain declared limits or need a later reader. |
| `bound-field-via-hook` | O | Canonical import identity supplied; convert subjects/grants and broaden visitor subscriptions. |
| `bounded-list-limit` | O,V | Zod fluent-chain semantics and maximum-bound judgment remain. |
| `bus-channel-primitive` | O | Canonical constructor target supplied; convert exact home/grant identities. |
| `bus-onData-no-store-write` → `bus-on-data-no-store-write` | M | Computed member normalization supplied; retain spelling policy or add Zustand receiver proof. |
| `byte-check-cast` | O,V | Drizzle CHECK/tagged SQL composition and SQL semantics remain. |
| `chat-stream-writes-in-bus-only` | O | Canonical import identity supplied; grants, subscription coverage, and out-of-root fixtures remain. |
| `client-cache-surgery-only-in-data` | M,O | QueryClient instance/method provenance remains; method spelling is insufficient. |
| `content-part-seam` | O | Canonical import identity supplied; exact type-home/grant subjects remain. |
| `db-enum-from-tuple` | V | Tuple contents supplied; Drizzle config subject and contracts/kit derivation proof remain. |
| `discovery-no-stats-rollups` | O | Canonical import identity supplied; bind forbidden symbols to their actual declaring homes. |
| `empty-state-has-action` | O,V | JSX component/action/spread presence semantics remain. |
| `fetch-fn-in-features` | G | Ambient fetch/call provenance supplied; broaden subscriptions and bind permitted forms. |
| `infra-auth-no-userid` | - | Intentional Identifier spelling; no semantic prerequisite. |
| `member-card-clamped` | - | Declaration/type-home interpretation and three policy arms remain; no new repeated reader justified here. |
| `membership-enforcer` | M,O | Property/import normalization supplied; ownership-comparison subject semantics remain. |
| `membership-fan-guard` | - | Intentional Identifier spelling; no semantic prerequisite. |
| `no-arbitrary-tw-values` | V | Class carriers, interpolation and Tailwind tokens remain. |
| `no-array-literal-querykey` | - | Intentional inline shape; preserve local syntax/wrapper limits. |
| `no-await-db-in-loop` | M,O | Drizzle db/tx receiver proof remains; loop ancestry stays policy-local. |
| `no-caller-user-id` | - | Intentional Identifier spelling; no semantic prerequisite. |
| `no-chat-trpc-in-surface` | M,O | tRPC procedure receiver/path proof remains. |
| `no-color-literals` | V | Class versus prose/data carrier provenance and token semantics remain. |
| `no-context-provider` | M,O | React Context result/type and JSX member proof remain. |
| `no-context-returntype` | G | Global utility-type declaration facts supplied; type-only aliases remain explicit refusals where unsupported. |
| `no-decorators` | - | SyntaxKind is the complete subject; no semantic prerequisite. |
| `no-direct-reports-write` | M,V | Report-record receiver/subject proof remains. |
| `no-direct-useform` | O | Canonical useForm call target supplied; home/grant conversion remains. |
| `no-external-media-without-gate` | - | Intrinsic JSX tag spelling; no semantic prerequisite. |
| `no-fake-disabled-id` | O,V | Canonical castId call target and empty scalar supplied; bind its declaring home. |
| `no-forward-ref` | O | Import/call facts supplied, including default imports; imported-object member equivalence and occurrence policy remain. |
| `no-handwritten-wire-json-schema` | O,V | Object contents supplied; wire-schema subject and sanctioned projection-call semantics remain. |
| `no-hardcoded-side-gen-sampling` | V | Scalar/object values supplied; side-generation config subject proof remains. |
| `no-hover-display-swap` | V | Class carrier/composition/variant parsing remains. |
| `no-if-is-group` | - | Intentional Identifier spelling and condition shapes; no semantic prerequisite. |
| `no-inline-invalidate-outside-seam` | M,O | QueryClient receiver/method proof remains. |
| `no-inline-optimistic-in-surface` | M,O | QueryClient receiver/method proof remains. |
| `no-inline-types` | O | Canonical Zod call target supplied; exported type/home and Zod-result semantics remain. |
| `no-layout-context-props` | - | Intentional JSX attribute spelling; no semantic prerequisite. |
| `no-loose-id-cast` | - | Branded-id type identity and double-cast semantics remain. |
| `no-manual-autosave-flush` | M,O | Function-body call query stopping at nested functions and autosave receiver proof remain. |
| `no-manual-token-estimate` | O,V | Binding/number facts supplied; estimator algorithm and exported-symbol subject proof remain. |
| `no-media-queries-in-features` | V | Class/string carrier and media-query interpretation remain. |
| `no-mint-via-cast` | O,G | Canonical castId and generator targets supplied; bind permitted generator homes/member semantics. |
| `no-multiplexed-mutation-error` | M,O | Mutation-result receiver/subject proof remains. |
| `no-off-token-inline-style` | M,V | Static values supplied; JSX/style carrier, token semantics and dynamic carrier policy remain. |
| `no-off-token-radius-shadow` | V | Class carrier and radius/shadow token interpretation remain. |
| `no-raw-clock` | G | Canonical Date construction/Date.now target supplied; argument arity and grants stay policy-local. |
| `no-raw-container-widths` | V | Class tokens and exact operation grants remain. |
| `no-raw-egress` | G,V | Ambient fetch/scalar foundation supplied; proxy string composition and split grant/health arms remain. |
| `no-raw-interactive-intrinsics` | - | Intentional intrinsic tag spelling; grants and declared spread/render limits remain. |
| `no-raw-intl-time` | G,M | Intl target groundwork supplied; Date instance toLocale method provenance remains. |
| `no-raw-matchmedia` | G | Global window path facts are groundwork; DOM ambient-source/member proof may still refuse. |
| `no-raw-random` | G | Canonical Math.random target supplied; grants remain. |
| `no-raw-spacing-in-features` | V | Class carrier and spacing token interpretation remain. |
| `no-raw-typography-in-features` | V | Class carrier and typography token interpretation remain. |
| `no-static-staletime` | V | Static numeric/object values supplied; TanStack query-options subject proof remains. |
| `no-untrusted-html-in-main-dom` | - | Intentional direct JSX attribute; grants and spread limits remain. |
| `no-untyped-soft-ref` | - | Existing schema reader promotion, unresolved population and exact column subject remain. |
| `no-use-context` | O | Import/call facts supplied, including default imports; imported-object member equivalence and occurrence policy remain. |
| `owner-role-split` | M,O | Property normalization is groundwork; role/tenancy comparison semantics remain. |
| `ownerid-registry` | - | Existing schema reader promotion and exact table/owner-column population remain. |
| `persistence-boundary` | G,O,V | Storage global/member and module facts are groundwork; persist/store-definition and registry semantics remain. |
| `persistence-no-in-memory-state` | G | Canonical Map/Set constructor targets supplied; bind the collection vocabulary. |
| `plugin-dump-guard` | M,O | QuickJS receiver/handle and control-flow dominance remain. |
| `providers-runner-seal` | O | Canonical import identity supplied; bind forbidden symbols to their declaring homes. |
| `registry-assembly-at-door-only` | M,O | Registry factory/result/register subject proof remains. |
| `registry-context-via-mint` | O | Canonical createContext target supplied; context type/registry subject proof remains. |
| `scroll-container-positioned` | V | Class carrier and balanced variant/token parsing remain. |
| `settings-section-anchored` | - | Existing comment-aware syntax reader; preserve scope and declared tag limits. |
| `single-stream-transport` | M,O | Procedure/result and stream-operation provenance remain. |
| `sole-env-reader` | G,O,V | Process root/module groundwork supplied; `process.env` remains unresolved because module-scoped Node type members are not ambient-global proof. Environment-member/key subjects remain. |
| `test-factory-contract` | - | Intentional function declaration shape; no semantic prerequisite. |
| `test-fixture-imports` | O | Canonical import identity supplied; bind forbidden fixture exports and boundary subjects. |
| `test-mock-doctrine` | O,V | Canonical vi.mock target/static strings supplied; package classification and unresolved specifiers remain. |
| `testid-typed-only` | - | Intentional literal shape; preserve resolved-constant/spread limits. |
| `theme-override-only-via-scope` | V | Static object contents supplied; JSX style/spread and theme token interpretation remain. |
| `turn-identity` | O | Canonical import identity supplied; occurrence/dedup policy remains. |
| `two-class-role-authority` | M,O | Role/tenancy comparison and authority semantics remain. |
| `ui-accname-survives-spread` | - | Policy-local JSX ordering; no repeated reader prerequisite proven. |
| `ui-size-via-variant` | O,V | Import/value groundwork supplied; JSX component and class carrier/variant interpretation remain. |
| `ui-skin-fragment-purity` | V | Class carrier/interpolation/composer purity remain. |
| `untrusted-regex-safe-exec` | O,V | Config/value groundwork supplied; regex provenance, compose anchor and subject-health proof remain. |
| `vector-scope-derived` | M,O,V | Replace legacy reference/value reads; vector-scope derivation semantics remain. |
| `zod-modern-spellings` | O,V | Canonical calls and authored tuple/object/scalars supplied; Zod fluent/result/issue semantics remain. |
| `zustand-selector-stability` | O,V | Value/call groundwork supplied; store-result and selector-return provenance remain. |

## Integration obligations

The parent #1584 foundation train owns global test-baseline and documentation-catalog regeneration. This lane deliberately leaves those shared files untouched at the parent's request. The scoped reader proofs do not constitute whole-corpus gate conversion, population equivalence, a full structure pass, frozen-corpus differential, or a performance/RSS comparison; those acceptance receipts remain at the parent integration boundary.

## Verification receipts

The implementation homes are [reference-fact.ts](../../../tooling/src/_shared/reference-fact.ts), its module/global/call readers, the shared [write and invoked-member alias graph](../../../tooling/src/_shared/reference-fact-writes.ts), and [static-authored-value.ts](../../../tooling/src/verify/lib/static-authored-value.ts). No reader added or changed here constructs a Project, uses a hop budget, or retains a Project-keyed cache. The source-local caches live within individual fact reads.

The focused behavioral command is `pnpm test:scoped tests/tooling/verify/lib/gate-contract.test.ts tests/tooling/verify/lib/reference-fact.test.ts tests/tooling/verify/lib/reference-fact-module.test.ts tests/tooling/verify/lib/reference-fact-origin.suite.test.ts tests/tooling/verify/lib/static-authored-value.test.ts tests/tooling/verify/lib/policy-pass-readers.suite.test.ts --maxWorkers=2`. It passes 73 tests across six files (56 reader/integration controls and the unchanged 17-test gate-census compatibility suite), including 1,000/3,000-alias controls and real dispatcher/grant-reconciliation re-entry. The canonical export collision regression was observed red before its strict cross-source refusal was applied.

Strict TS7 checks use two explicit-root scratch configurations: eight production files extending `tooling/tsconfig.json`, and six test files extending `tsconfig.json`, preserving the production NodeNext and test bundler resolvers, strictness, and ambient declarations. Both pass through `pnpm exec nice -n 19 node scripts/ts7.cjs --checkers 2 --noEmit --pretty false -p <config>`. Scratch configurations and the final test log are retained under `/tmp/gate-shared-semantic-readers/` for the parent handoff; they are not new workspace type programs.

Scoped Biome and ESLint pass on the changed source/test files. The configured dependency-cruiser run, rooted at the eight reader/contract files, cruises nine modules and 27 dependencies with zero errors, warnings, or informational findings. Its complete JSON is `/tmp/gate-shared-semantic-readers/depcruise-final.json`. Every production file is within the tooling size cap; the module-origin reader is exactly 450 lines.

The independent [cold review](../stickler/2026-09-05-shared-semantic-readers.md) records the repaired missing-module doors, reverse alias writes, global-carrier write symmetry, canonical export collisions, and shared method-effect closure. It also records the declared limits; none of these receipts credits a gate conversion or closes #1584.
