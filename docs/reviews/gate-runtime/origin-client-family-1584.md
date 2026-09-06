---
kind: review
status: active
updated: 2026-09-06
---

# Canonical-origin client family (#1584)

Twelve client-side policies whose only missing primitive was canonical symbol/member origin. Parent program:
[#1584](https://github.com/Inktomi93/orbweaver/issues/1584); branch `codex/gate-tsmorph-standardization`, lane
base `519242add`. Every one of the twelve asserted its subject's identity by comparing TEXT — an export name,
a method name, a property name, a `use*Store` regex, a `trpc` root spelling — and every one carried the two
failure modes that follow: an alias, namespace, re-export, computed or const-chained spelling walked past it,
and a same-named local or third-party lookalike red as the real thing.

## Disposition

| Policy | Authority | Family | Execution | Identity now resolved through |
| - | - | - | - | - |
| `no-forward-ref` | ordinary | `react-origin` | selected-files | module origin: React's `forwardRef` export |
| `no-use-context` | ordinary | `react-origin` | selected-files | module origin: React's `useContext` export |
| `no-context-provider` | ordinary | `react-origin` | selected-files | the `Provider` property symbol's declaration home (React's `Context`) |
| `no-context-returntype` | ordinary | singleton | selected-files | ambient-global origin: TypeScript's `ReturnType` utility |
| `fetch-fn-in-features` | ordinary | singleton | selected-files | ambient-global origin: the `fetch` wire primitive |
| `no-manual-token-estimate` | ordinary | singleton | **entire-population** | the ambient `length` member, `readStaticNumber` on the divisor, and the canonical `estimateTokens` declaration |
| `no-inline-optimistic-in-surface` | ordinary | `tanstack-query-origin` | selected-files | `cancelQueries`/`setQueryData` declared by `@tanstack/query-core` |
| `no-static-staletime` | ordinary | `tanstack-query-origin` | selected-files | the CONTEXTUAL `staleTime` property + `readStaticString` on the value |
| `no-multiplexed-mutation-error` | ordinary | `tanstack-query-origin` | **entire-population** | `error` declared by `EntityMutationResult` or query-core |
| `no-chat-trpc-in-surface` | ordinary | `trpc-proxy-origin` | selected-files | `mutationOptions` + the `TRPCOptionsProxy` chain root, both from `@trpc/tanstack-react-query` |
| `zustand-selector-stability` | ordinary | singleton | **entire-population** | the callee type's declared ALIAS CHAIN, walked to `GatedStoreHook` / `UseBoundStore` |
| `no-manual-autosave-flush` | ordinary | singleton | selected-files | the form members declared by `@tanstack/form-core`'s `FormApi` |

All twelve are `ordinary` per the manifest and none needed a reviewed grant. **No `REVIEWED_GRANTS` rows were
added.**

### The estimator-home fork, and how it was ruled (2026-09-06)

`no-manual-token-estimate` is the one policy with a sanctioned HOME. It was first converted keeping the
legacy header's deliberate choice — "excluded structurally by the symbol it exports, never by a file-path
pin (path-keyed gates die on rename)" — as `getExportSymbols().some(s => s.getName() === "estimateTokens")`,
and the fork was raised rather than a grant row invented.

**The review ruled that intent RIGHT and the delivered condition WRONG, and it is repaired here.** A name
test with FILE scope is a self-exemption door: a planted
`packages/client/src/features/hack/self-exempt.ts` exporting its own `estimateTokens` silenced both
divisions in that file (reproduced at 0 findings, and 2 with the export renamed). The condition is now an
IDENTITY test — the file's exported symbol must RESOLVE, through any re-export, to the canonical declaration
in `packages/kit/src/tokens/index.ts`. That keeps the rename-proof intent (the home is still a SYMBOL, and a
re-export of the real estimator is still the home) and removes the door. The canonical file is located in
the effective population and receipted, so its rename REFUSES the run — which moves this policy to
`entire-population` as well. The self-exempt plant is committed as a `mustFlag` row; the canonical home and
a re-export of it are `mustPass` rows on both sides of the forwarding.

### `execution` re-derived away from the manifest

The manifest classified all twelve `selected-files`. **Three** are `entire-population`: their identity
ANCHOR is a project file (`packages/client/src/data/create-entity-mutation.ts`,
`packages/client/src/state/create-gated-store.ts`, `packages/kit/src/tokens/index.ts`), so a narrowed
selection that does not carry the anchor cannot render a verdict. `entire-population` DEFERS them loudly on
such a selection; `selected-files` would have passed every occurrence in the selection silently. The
whole-project run is unaffected.

### Fail-closed on an unreadable identity — the boundary, exactly

Ten policies routed an unreadable identity to a finding from the start; `no-multiplexed-mutation-error` and
`zustand-selector-stability` returned a bare `false` and so failed OPEN. Both are repaired, and the two
axes need DIFFERENT rules — which is the durable lesson here:

- **Member axis** (`no-multiplexed-mutation-error`): the shared `classifyOriginRefusal` is correct. Its leaf
  is the PROPERTY name node, so `declare const a: any; a.error ?? b.error` yields no property symbol at all
  and classifies as unreadable, while `a.error` on a project interface classifies as a proven other.
- **Type-identity axis** (`zustand-selector-stability`): the shared classifier is WRONG here and is
  deliberately not used. Its leaf is the callee's own binding, and a local binding proves nothing about a
  TYPE — `declare const useThingStore: any` is an ordinary local const. Reporting every callee whose type
  the checker could not NAME was equally wrong in the other direction: it produced nine real-tree false
  findings on `rows.map((row) => ({ … }))` callbacks in server, tooling and test files. Both store homes are
  declared type ALIASES, so an unnamed type PROVES a non-store; only `any`/`unknown` erasure is fail-closed.
  A semantic ARITY fence completes it — a zustand selector is `(state) => U` and takes exactly one
  parameter, so a two-parameter `.map((property, index) => ({ … }))` (the last two survivors, in a CT
  spec's in-browser closure that this DOM-less analysis program types as `any`) is provably not a selector.

Each of the four measured states above is a committed proof row.

The same policy's ADMITTING side needed one more step. `resolveTypeIdentityOrigin` reports the alias the
checker kept, so a store hook re-aliased once (`type MyHook = GatedStoreHook<S>`) reports as `MyHook`
declared in the CONSUMING file, and a home test against that one name missed a real store — the alias
positive twin, with zero real-tree exposure today (every store is minted through `createGatedStore`) but a
silent hole all the same. `resolveTypeIdentityChain` now walks the declared alias chain to its root,
following an import specifier on each step and terminating on a visited declaration; the policy admits a
store if ANY identity in the chain is one of the two homes. The one-hop and cross-module fixtures are
committed `mustFlag` rows. Note the checker COLLAPSES a bare `type LocalHook = UserHook` (no type
arguments) and reports `UserHook`, which is why the cross-module row is written against the exported alias
rather than a local re-alias — recorded in the reader's own control so the next author does not expect a
three-name chain from that shape.

## Shared readers added

Three new `lib/` readers, each a pure function over delivered nodes — no walk, no Project, no cache beyond an
invocation-local per-file index.

- **`lib/type-member-origin.ts`** (+ `contract/type-member-origin.ts`): `resolveTypeMemberOrigin`,
  `resolveContextualMemberOrigin`, `resolveTypeIdentityOrigin`, `resolveTypeIdentityChain`, and the `declaredByPackage` /
  `declaredByFile` / `declaredByAnyPackage` home matchers. This is the half `reference-fact.ts` cannot supply:
  every one of these policies has a receiver produced at runtime (`useTRPC()`, `useQueryClient()`, a store
  hook, a form api, a mutation result), which the value walk correctly refuses as a dynamic terminal. The
  identity available is the DECLARATION of the property symbol the checker resolved, and a package directory
  (`/node_modules/@tanstack/query-core/`) survives version bumps, pnpm's virtual store and the package's
  internal `dist/`/`build/` layout where a pinned file path does not.
- **`lib/origin-verdict.ts`**: the three-answer classifier. A shared reader's refusal conflates "provably a
  different binding" (a local function, parameter, method, property) with "could not be read" (an import door
  with no resolvable target). Only the second is a fail-closed finding; conflating them is how a text-keyed
  gate acquires permanent exemption markers or a silent green. `write`/`cycle`/`ambiguous` are unreadable
  unconditionally — `let fetch = globalThis.fetch` binds a local declaration AND still holds the banned identity.
- **`lib/react-origin.ts`**: the canonical React export matcher (per-file alias index + origin resolution)
  and `reactExportVisitors`, the two-door visitor pair `no-forward-ref` and `no-use-context` share so their
  arm coverage cannot drift.

Proof substrate: `gates/_proof/react.ts` and `gates/_proof/client-vendors.ts` create REAL resolvable package
doors in the in-memory proof workspace (`node_modules/@types/react/index.d.ts`, `@tanstack/query-core`,
`@tanstack/react-query`, `@tanstack/form-core`, `@trpc/tanstack-react-query`) plus a LOOKALIKE package
exporting every one of the same names. The lookalike is the counterfactual half of every identity claim.

## Proofs

120 policy proofs, plus 2 blindness-tripwire pins and 12 focused reader controls — all green
(`tests/tooling/verify/gates/origin-client-family.test.ts`, `tests/tooling/verify/lib/type-member-origin.test.ts`).

| Policy | mustFlag | mustPass | total |
| - | -: | -: | -: |
| `fetch-fn-in-features` | 4 | 6 | 10 |
| `no-chat-trpc-in-surface` | 4 | 4 | 8 |
| `no-context-provider` | 4 | 4 | 8 |
| `no-context-returntype` | 2 | 5 | 7 |
| `no-forward-ref` | 7 | 4 | 11 |
| `no-inline-optimistic-in-surface` | 4 | 3 | 7 |
| `no-manual-autosave-flush` | 4 | 6 | 10 |
| `no-manual-token-estimate` | 7 | 7 | 14 |
| `no-multiplexed-mutation-error` | 5 | 4 | 9 |
| `no-static-staletime` | 5 | 5 | 10 |
| `no-use-context` | 8 | 4 | 12 |
| `zustand-selector-stability` | 7 | 7 | 14 |

Every policy carries the identity matrix its subject can take: an import alias, a namespace member, a
computed-literal member, a re-export door, a const chain across modules, a local shadow, a parameter shadow,
a same-named project interface, and the same names from a DIFFERENT package. Fail-closed rows (`#944`) are
written where an unreadable identity must still be reported.

## Same-fixture old/new agreement

Every frozen legacy descriptor was replayed over the exact file map of every new proof
(method: extract the pre-conversion descriptors into a scratch tree, shim their `../contract/gate.ts` import,
and run each through the legacy `runPass` over an in-memory project built from the proof's own file map). Every delta is
deliberate and falls into two classes.

**Legacy 0 → new ≥1 (a spelling escape the text check could not see), 17 rows:**

| Policy | Escape the legacy check missed |
| - | - |
| `fetch-fn-in-features` | `globalThis.fetch`, `globalThis["fetch"]`, a const alias of the global |
| `no-chat-trpc-in-surface` | the proxy bound under any name but `trpc`; the fully computed-literal chain |
| `no-forward-ref` | a namespace member, a computed-literal member, and the CALL half of an aliased import |
| `no-use-context` | the same three |
| `no-inline-optimistic-in-surface` | the computed-literal method spelling |
| `no-manual-autosave-flush` | the computed-literal spelling of both calls |
| `no-manual-token-estimate` | an imported ratio, a const chain to the ratio, the bracket `t["length"]` spelling, and a file that self-exempted by exporting its own `estimateTokens` |
| `no-multiplexed-mutation-error` | the computed-literal spelling of both operands, and an `any`-typed receiver on both sides |
| `no-static-staletime` | a const alias of `"static"`, and the same alias one module away |
| `zustand-selector-stability` | a store hook not matching `/^use[A-Z].*Store$/`, an `as`-wrapped literal, an `any`-typed callee, and a store re-aliased one hop or through another module |

**Legacy ≥1 → new 0 (a lookalike the text check red), 16 rows:** a local `forwardRef`/`useContext` helper; a
context.ts declaring its OWN `ReturnType`; a project type named `ReturnType`; a parameter named `fetch`; an
imported `fetch` polyfill; Base UI's namespace `.Provider`; another package's `createContext`/`forwardRef`/
`useContext`; a project interface with a `setQueryData`/`pushFieldValue`/`handleSubmit`/`length`/`error`
member; a local `useUserStore` helper; mixed operands where only one side is a mutation result; and the
estimator home reached through a re-export.

## Population equality

Legacy `scanRoot` admitted sets vs the declared populations, over the same 7,181-file harness corpus
(method: record each legacy `scanRoot`'s admitted set over the loaded corpus, then apply the declared
expression through `compilePopulation` to the same path list and diff both directions):

- **Exact, zero delta (7):** `fetch-fn-in-features` (1,000), `no-chat-trpc-in-surface` (66),
  `no-context-returntype` (32), `no-inline-optimistic-in-surface` (66), `no-manual-autosave-flush` (1,000),
  `no-manual-token-estimate` (3,220), `no-multiplexed-mutation-error` (1,311).
- **One classified delta (5):** `no-context-provider`, `no-forward-ref`, `no-use-context` (7,181 → 7,180) and
  `no-static-staletime`, `zustand-selector-stability` (5,186 → 5,185) each drop exactly
  `packages/showcase-plugins/src/index.ts`. Those five had no `scanRoot` at all (admit-all over the loaded
  corpus); `@authored` names the six cake packages plus `tooling/src`, `tests/` and `scripts/`, and excludes
  `showcase-plugins` by design. This is the same classified delta the schema-fact lane recorded for
  `@packages`. No path is admitted that the legacy predicate rejected.

## Real-tree differential

Legacy descriptors over the current tree (the same frozen descriptors through `runPass` over
`getWorkspace({root})`): **3 findings**, all
`no-context-provider`, all Base UI namespace components —
`packages/ui/src/primitives/{drawer/drawer,toast/toast,tooltip/tooltip}.tsx`. Those three were previously
SUPPRESSED by three permanent legacy ignore markers, so the legacy EFFECTIVE count was 0.

Final policies over the current tree, one pass over the whole family
(`runPolicyPass` over `getWorkspace({root, types: true})`; `knownPolicies` = all 64 `defineGate` modules
discovered on the tree, `reviewedGrants: reviewedGrantsFor(policies)`):

```
knownPolicies=64 selected=12 loadedSources=7196
workspaceMs=6510 passMs=18534 wallMs=25044
factErrors=0 toolErrors=0 authorityToolErrors=0 alarms=0
withheld=[]
raw=0 waived=0 granted=0 effective=0
```

`/usr/bin/time -v`: 26.28 s wall, 5,557,844 KB peak RSS, 0 swaps, 0 major page faults. All 12 owners
`success/complete`. Per-policy cost is concentrated in `no-manual-autosave-flush` (5.1 s),
`zustand-selector-stability` (1.7 s) and `no-multiplexed-mutation-error` (1.3 s); the other nine total under
2 s combined. All three home receipts are healthy at members 1, unresolved 0: `EntityMutationResult`,
`GatedStoreHook`, `estimateTokens`.

The fail-closed repairs above were each measured against this pass rather than reasoned about: routing
`zustand-selector-stability`'s type refusal to a finding first produced **9** effective findings, narrowing
"unreadable" to type ERASURE cut it to **2**, and the semantic arity fence returned it to **0**. Every one of
the three states is a committed proof row.

**Classification of the −3 delta:** all three are legacy FALSE POSITIVES. Base UI's `Drawer.Provider`,
`Tooltip.Provider` and `Toast.Provider` are namespace COMPONENTS, and their `Provider` property is declared by
Base UI, not by React's `Context`. Three standing markers whose stated reason is "the gate is asking the wrong
question" are a detector defect, not an exemption vocabulary, so the markers are **DELETED with the
conversion, not translated** into the central occurrence-waiver grammar: a translated marker would consume nothing and become an
`ordinary-waiver` alarm. The Base UI shape is committed as a `no-context-provider` mustPass row.

**Waiver consumption:** zero live legacy ignore markers name any of the twelve policies after the three
deletions. The search's positive control, in the same invocation over `packages`, `tests`, `tooling` and
`scripts`: 770 markers across 407 files, so the zero is a measurement rather than an unreachable path.
Nothing to translate; `reviewedGrantConsumption` is empty and there are no authority alarms.

## Planted positive control

A real-tree zero is only evidence if the same run bites a plant. Nine virtual files were added to the loaded
typed workspace — plants against the REAL `@types/react`, `@tanstack/react-query`, `@tanstack/form-core`,
`zustand`, the app's own `data/trpc.ts`, `data/create-entity-mutation.ts` and `state/create-gated-store.ts`
(added with `project.createSourceFile`; nothing written to disk). Result: **13 findings across all 12 policies, every verdict
clean (not the fail-closed "unreadable" message), zero stray findings elsewhere in the corpus.**

Two plant iterations were themselves informative and are recorded so a future lane does not repeat them: a
plant naming a router verb that does not exist (`trpc.chat.createChat`) and a plant importing a type the
package does not export (`AnyFormApi`) both produce the fail-closed unreadable message, which reads exactly
like a policy defect. A plant must use a spelling the real tree already type-checks.

## Declared limits, written as mustPass rows

- `no-context-returntype`: reflection reached through ANOTHER module's alias (`type Reflected<F> = ReturnType<F>`
  elsewhere) is not reported — the `ReturnType` is authored outside this population.
- `fetch-fn-in-features`: a const alias of the global read TEXTUALLY ABOVE its own declaration is not indexed
  in time; the alias set is filled in document order and closing it would need a second whole-file pass.
- `no-static-staletime`: a SPREAD source (`const BASE = { staleTime: "static" }; useQuery({ ...BASE })`) is
  checked against nothing at its own site and has no contextual owner.
- `react-origin`'s import door: a re-export shim that RENAMES (`export { forwardRef as fr }`, then
  `import { fr }`) is not a candidate at its door; the call site still resolves it.

## Fixture hygiene rules this lane paid for

Two review findings were about the PROOFS rather than the policies, and both generalise:

- **A fixture that names a package must PLANT that package's door in its own file map.** The
  `fetch-fn-in-features` "same name, imported" row imported from `cross-fetch` with no `node_modules`
  entry, so the specifier did not resolve and the row passed because the binding was UNREADABLE — the
  opposite of the proven-foreign origin it claimed. The eight vendor-lookalike rows already did this; the
  odd one out now does too.
- **A `mustPass` row must contain the shape the policy could flag.** `no-manual-token-estimate`'s "the
  official estimator" row had no DIVISION in it at all, so no edit to the policy could ever have failed it.
  An inert `mustPass` is a row that reads like a baseline and asserts nothing.

## Known limits and runtime follow-ups (not worked around)

- ~~**`resolveModuleMemberOrigin` refuses an OVERLOADED export as `ambiguous`.**~~ **CLOSED 2026-09-06**
  by the shared overload-aware origin reader (`reference-fact-module.ts#overloadHome`): a set of declarations
  that is one FUNCTION-overload set — same kind, same source file, at most one implementation body — resolves
  to one home, with the count carried in `canonical.declarationCount`. Everything else that yields several
  declarations (a value/type merge, a `function`+`namespace` merge, an `export *` fan-in, an overload set
  split across two files) stays `ambiguous`. The limit is now a CAUGHT ROW in both React policies:
  `no-forward-ref` `mustFlag[1]` and `no-use-context` `mustFlag[1]` build React's door from
  `reactOverloadedProofModule()` (`forwardRef`/`useContext` declared TWICE) and assert the DEPRECATION
  message — which the fail-closed `unreadable` arm does not carry, so the row reds the moment the reader
  refuses an overload set again (red-first receipt: both rows fail against the unmodified reader with
  `expected one effective finding matching messageIncludes="React 19 deprecates" but no single finding
  matched`). On the real tree the arm resolves 557 client/server import specifiers that used to refuse —
  `useState` (206), `useQuery` (135), `useRef` (103), drizzle's `inArray` (53), and the project's own
  `createAutosaveEntityForm` (27) — while 88 genuinely merged symbols (drizzle's `sql`/`SQL`, `Component`)
  still refuse.
- The `#data` / `#forms` package-internal import aliases DO resolve in the `getWorkspace({types:true})`
  program, so a surface importing `useTRPC` from `#data` is judged with the precise verdict, not the
  fail-closed one (verified by the planted control).
