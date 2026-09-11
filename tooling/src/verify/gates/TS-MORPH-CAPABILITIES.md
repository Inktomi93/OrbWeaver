---
kind: reference
status: active
updated: 2026-09-11
---

# ts-morph capabilities for Orb gate authors

This is the API-selection companion to [GATE-AUTHORING.md](GATE-AUTHORING.md) and the destination runtime in [gate-runtime-standardization.md](../../../../docs/design/gate-runtime-standardization.md). Read it before writing a new AST reader or shared fact. Filesystem-backed tooling also reads [NODE-26-FILESYSTEM-CAPABILITIES.md](NODE-26-FILESYSTEM-CAPABILITIES.md). The installed authority is `ts-morph@28.0.0` over `typescript@6.0.3`; re-audit this reference when either version changes.

Upstream references: [AST navigation](https://ts-morph.com/navigation/), [types](https://ts-morph.com/details/types), [type checker](https://ts-morph.com/navigation/type-checker), [source files](https://ts-morph.com/details/source-files), [project population](https://ts-morph.com/setup/adding-source-files), and the installed declaration surface at `node_modules/ts-morph/lib/ts-morph.d.ts`. The declarations win when the website is incomplete.

## Choose the highest existing layer

Use this order. Dropping to a lower layer requires evidence that every higher one cannot express the needed identity.

1. Use a native Biome, ESLint, dependency-cruiser, TypeScript, or package-specific rule when it owns the complete behavior.
2. Use an existing Orb shared reader or fact provider.
3. Extend an existing shared reader when the new shape is the same semantic question.
4. Add a first-class `defineFact` provider when several entire-population policies need one derived model.
5. Use raw ts-morph only inside the shared reader/provider. Gate modules consume dispatcher nodes, `ctx.files`, declared resources, and `ctx.fact(provider)`.

A gate module never constructs or retrieves a `Project`, performs descendant traversal, resolves its own workspace scope, mutates a node, or keeps a module cache. A fact provider declares its own population and visitor kinds; the runner schedules it in the one physical walk and exposes its completed value after that walk.

## Capability map

| Need | ts-morph surface | Orb use | Main trap |
| - | - | - | - |
| classify a delivered node | `Node.isX`, `getKind`, `getParent`, `getFirstAncestor` | gate visitor or shared reader | one syntax kind rarely represents the whole semantic class |
| walk descendants | `forEachDescendant`, `getDescendants`, `getDescendantsOfKind` | dispatcher only | creates a second walk and often retains many wrappers |
| source identity | `SourceFile#getFilePath`, `isInNodeModules`, `isFromExternalLibrary` | `ctx.relativePath` for delivered sources | raw paths are absolute; policy populations are repo-relative |
| declarations | `getSymbol`, `Symbol#getDeclarations`, `getValueDeclaration` | shared reference reader | zero, one, and many declarations are different facts |
| import/re-export origin | `Symbol#getAliasedSymbol`, `ExportSpecifier`, `getModuleSpecifierSourceFile`, `SourceFile#getExportSymbols` | `reference-fact.ts` | local spelling and exported name are not canonical identity |
| local aliases and writes | identifier declarations, binding elements, assignment/reference nodes | `reference-fact*.ts` | an alias is safe only until write, cycle, dynamic, or ambiguity |
| authored literals/objects/tuples | literal nodes, property nodes, spread nodes | `static-authored-value.ts` | runtime `Type` values do not preserve authored order or source anchors |
| resolved type | `Node#getType`, `Type#getProperty`, `getUnionTypes`, `getIntersectionTypes`, `getLiteralValue` | typed shared fact | `getText()` is presentation, not identity — **and `Node#getType` reaches the Project's checker WITHOUT going through `ctx.checker()`, so it is not fenced by `analysis: "syntax"`** (see the checklist) |
| conditional/mapped type result | `Type#getProperty` plus `Symbol#getTypeAtLocation` | typed shared fact | `Type#getAliasSymbol()` may legitimately be absent after resolution |
| callable shape | `Type#getNonNullableType`, `getCallSignatures`, signature parameters | shared callable/fact reader | optional callable properties have no signatures until non-nullable |
| exact call target | `TypeChecker#getResolvedSignature`, callee symbol/declaration | shared callable reader | expensive across a broad unfiltered call population |
| assignability | `Type#isAssignableTo` | shared type reader when structural membership is the rule | structural compatibility does not prove repository ownership |
| references | `findReferences`, `findReferencesAsNodes` | shared indexed reader only after measurement | language-service searches can be much more expensive than one inverted walk index |
| compiler escape hatch | `compilerNode`, `compilerType`, `TypeChecker#compilerObject` | shared kernel only | compiler objects are invalidated by manipulation |
| mutation | `set*`, `replace*`, `remove`, `transform`, `organizeImports`, `save` | codemod layer only | mutation forgets nodes and invalidates semantic identity |

## Structural navigation

Prefer the most specific node API on a node already delivered by the dispatcher:

```ts
if (Node.isCallExpression(node)) {
  const callee = node.getExpression();
  const owner = node.getFirstAncestor(Node.isFunctionDeclaration);
}
```

`getParent`, `getAncestors`, and a bounded ancestor lookup navigate an already selected subject. They are not repository walks. `forEachDescendant`, `getDescendants*`, `Project#getSourceFiles`, and source-wide `get*` sweeps are population discovery and belong to the central dispatcher/provider lifecycle.

Never infer absence from a search that scanned zero files. Source facts owe an exact population receipt, and TS and TSX remain separate parser languages even though both enter the final source universe.

## Symbols, declarations, and modules

A symbol is evidence, not automatically a unique origin.

- `node.getSymbol()` may be absent.
- `symbol.getDeclarations()` may return zero, one, or several declarations. Treat several as ambiguity unless the reader explicitly composes overloads or merged declarations. The module-export axis DOES compose one shape: `reference-fact-module.ts#overloadHome` resolves a FUNCTION-overload set — every declaration the same kind, in the same source file, with at most one implementation body — to a single home (the implementation when there is one). The set's SIZE is deliberately not carried: no reader consumes it, and `canonical.declaration.getSymbol()?.getDeclarations()` still has it. An overloaded export is one identity with several declarations (React's `useState`, drizzle-orm's `inArray`, our own `defineBusChannel`: 557 live import specifiers on this tree), and refusing it as `ambiguous` cost three policy families their precise verdict. Everything else that yields several declarations — a value/type merge, a `function`+`namespace` merge, an `export *` fan-in, an overload set split across two files — has no unique home and stays `ambiguous`. A member resolved off a receiver's TYPE keeps asking every declaration (`type-member-origin.ts`): its question is set-membership, which an overload set already answers correctly.
- For imports and re-exports, follow `getAliasedSymbol()` and retain the declaration trace. Do not compare only `Identifier#getText()` or module-specifier text.
- Namespace access, destructuring, computed literal members, `call`/`apply`/`bind`, and immutable aliases require the shared reference/callable readers.
- `getModuleSpecifierSourceFile()` proves the resolved module inside the current Project. Reject declarations outside the fact population before converting them to `ctx.relativePath`.
- `SourceFile#getExportedDeclarations()` and reference searches can trigger broad semantic work. Use them only after measuring a closed candidate set; upstream has documented cases where exported-declaration resolution is orders of magnitude slower than structural navigation.

Use:

- `lib/reference-fact.ts` for stable expressions, members, module origins, and declaration traces;
- `lib/reference-fact-call.ts` and `lib/gate-contract-origin.ts` for callable origins and member aliases;
- `lib/reference-fact-writes.ts` for assignment, destructuring, and argument-effect invalidation.

## Types and signatures

Use `Type` structure rather than rendered text:

```ts
const type = checker.getTypeOfSymbolAtLocation(parameter, call);
const discriminator = type.getProperty("type");
const values = discriminator
  ?.getTypeAtLocation(call)
  .getUnionTypes()
  .map((part) => part.getLiteralValue());
```

Rules:

- `Type#getText()` is for diagnostics. It may contain absolute `import("…")` paths, aliases chosen for the current location, or truncated formatting.
- `getAliasSymbol()` is an optional fast path. `Extract<Union, …>` and other conditional/mapped types often resolve to anonymous object types with no alias symbol. Read their properties or signatures.
- Call `getNonNullableType()` before `getCallSignatures()` on an optional callback.
- Use `getUnionTypes()`/`getIntersectionTypes()` only after checking the matching type predicate; a non-union returns an empty list.
- Use `getLiteralValue()` for literal types. A missing literal is not an empty string.
- `getResolvedSignature()` proves overload selection and parameter types, but it is expensive. First reduce to a lossless structural or declaration-derived candidate set, then cache the result by call `compilerNode` for this invocation.
- Assignability answers shape compatibility. It cannot prove that a callable came from the canonical injected door or module; combine it with declaration origin.

The bus incident that established these rules is recorded in `docs/reviews/gate-runtime/bus-family-1584.md`: alias-only resolution lost `memoryRecall`, while resolving every server call took minutes and several GiB.

## Authored values are not types

When policy concerns source-authored data—tuple order, duplicate object keys, spreads, Zod chains, computed literal keys—use `lib/static-authored-value.ts`. It preserves nodes and authored order, follows supported immutable aliases/spreads, and returns explicit write/cycle/dynamic/ambiguous facts.

Do not replace it with `getType().getProperties()`: the type checker may normalize order, merge shapes, widen literals, or erase the source operation the finding must anchor to.

## First-class fact providers

Shared whole-population work uses one provider token:

```ts
export const exampleFact = defineFact({
  id: "example-fact",
  population: { in: ["@contracts", "@server"] },
  analysis: "types",
  resources: [],
  create: (ctx) => {
    const rows: Node[] = [];
    return {
      visitors: [{ kinds: [SyntaxKind.TypeAliasDeclaration], visit: (node) => rows.push(node) }],
      finish: () => {
        ctx.receipt({ kind: "population", source: "example-fact", members: rows.length });
        return Object.freeze({ rows });
      },
    };
  },
});
```

A consuming policy declares `facts: [exampleFact]` and reads `ctx.fact(exampleFact)` in `evaluate`. Runtime enforcement provides:

- one provider instance per selected command;
- provider-owned population and resources planned before execution;
- one physical walk shared with policy visitors and other providers;
- finish before policy evaluation;
- early/undeclared access refusal;
- duplicate provider-id refusal;
- unused policy dependency refusal;
- resource acquisition and receipt liveness;
- one provider failure withholding every dependent policy;
- separate provider timing and error rows.

Shared facts are entire-population machinery. A selected-files policy cannot declare one. Per-file reusable logic remains a pure reader called from that policy's visitor.

Current providers/readers:

Six `defineFact` providers ship today. **Check this table before building one** — two rows here said "provider
conversion pending" for months after the provider landed, and a lane that believes a stale "pending" builds what
already exists.

| Subject | Use |
| - | - |
| bus producers | `lib/bus-fact.ts` `busProducerFact` |
| bus definitions / belted rosters | `lib/bus-definition-fact.ts` `busDefinitionFact` — cross-checked against the producer roster; the two must AGREE or the run refuses |
| registry definitions | `lib/registry-fact.ts` `registryDefinitionFacts.<kind>` (one provider PER KIND — a single provider spanning six kinds summed its receipts and withheld five healthy consumers, #1953) |
| schema tables/columns/FKs/indexes/JSON | `lib/schema-fact.ts` `drizzleSchemaFact` |
| exported tuple vocabularies | `lib/tuple-vocabulary-fact.ts` `tupleVocabularyFact` |
| JSX/classes/composers | `lib/static-class-facts.ts` `staticClassFact` |
| CSS resources | ResourceHost `authoredCss` / `productCss` / `cssInventory` plus `lib/css-resource-facts.ts` — the corpus and its parse are already shared, so a CSS census fact would be a fifth home |
| package/config/tree/tracked resources | `ctx.resources` through declared ResourceHost requests |

**A provider's receipt states what it MEASURED, never what it FOUND.** `members` is the denominator it walked;
`unresolved` is syntax it could not read. Receipting the census instead preempts the provider's own `-health` accuser,
because the runtime refuses `members === 0` / `unresolved > 0` and withholds every consumer before `evaluate`. That was
both of the last two whole-corpus conformance failures (#1953, #1955). Emptiness and holes belong in the fact's
`status`/`unresolved` FIELDS, which consumers read and judge.

## Project and node lifecycle

There is one workspace constructor: `tooling/src/_shared/ts-workspace.ts#getWorkspace`. Gate modules and fact providers never call `new Project`, add files, resolve dependencies, or select globs.

Within one immutable pass, `node.compilerNode` is the stable identity used for deduplication and invocation caches. Do not retain it across commands or after any manipulation. Upstream documents that source refresh, organize-imports/fixes, and other manipulation forget child nodes; the underlying compiler checker object is also discarded after manipulation.

The conformance harness reuses a Project for speed but gives every example a unique virtual root. Never cache on Project identity: the same Project can hold a later example with different source.

## Performance rules

1. One Project, one physical descendant walk, one instance of each selected fact.
2. Subscribe only to required `SyntaxKind`s. Do not materialize `getDescendants()` arrays.
3. Store compact facts or required anchors, not every wrapped node in the workspace.
4. Structural prefilters may reduce work only when they are lossless. A prefilter can nominate candidates; it cannot decide the policy verdict.
5. Derive callable door declarations before resolving call signatures. Never call `getResolvedSignature()` over the whole call corpus without a measured reason.
6. Cache semantic reads by `compilerNode` only inside the current fact/pass.
7. Keep dynamic, missing, write, cycle, and ambiguity distinct. Do not turn an expensive unknown into absence.
8. Measure the real population with `/usr/bin/time -v`; retain wall time, provider/policy phase time, peak RSS, heap limit, swap, population, and finding/tool-error result.
9. Compare against the old implementation on the same checkout. A faster false verdict is not an optimization.

The workspace supplies `NODE_OPTIONS=--max-old-space-size=16384` to pnpm children. Verify the actual child environment and host/cgroup memory before attributing a slow run to the algorithm.

## AST and codemod boundaries

`pnpm ast` and the codemod kit contain useful ts-morph code, but they are not libraries to import wholesale.

- Extract read-only logic into the neutral shared reader/fact layer only when at least three real consumers need the same semantics and parity tests exist.
- Keep AST CLI scopes, heuristic lenses, output ledgers, and command rendering in `tooling/src/ast`.
- Keep every mutation, rename, import rewrite, save, and diagnostic-after-edit operation in `tooling/src/codemod`.
- Gates never import the mutation layer. A read-only verdict must not possess write capability.

## Author checklist

Before adding or widening a reader:

- identify the exact semantic identity and every legal spelling;
- search the shared reader/provider table first;
- confirm the installed API in `ts-morph.d.ts` rather than inventing a plausible method;
- decide syntax versus types before requesting the checker — and know that **`analysis` is NOT enforced against you**:
  the fence at `lib/policy-pass-context.ts:244` throws only from the `ctx.checker()` accessor, so a `node.getType()`
  or `node.getSymbol()` in your own module reads types under a declared-syntax policy and every gate stays green
  (proven 2026-09-11; #1958). What `analysis` DOES couple to is the proof `mode`, a load-time tool error on mismatch.
  Auditing your own declaration means sweeping the module body for type-resolving calls, not trusting the field;
- declare the provider population/resources exactly;
- plant alias, re-export, namespace, destructuring, computed, wrapper, shadow, write, cycle, dynamic, missing, empty, and ambiguity controls that apply;
- prove a candidate prefilter cannot exclude a valid subject;
- run old/new fixtures and current-population differentials;
- retain timing/RSS receipts;
- update this file when an API choice or measured trap changes.
