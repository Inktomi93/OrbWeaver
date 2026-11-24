---
kind: plan
status: active
updated: 2026-11-06
rank: 11
---

# Find and judge every unwired and dead piece of code

## Goal

Every production symbol, member, field, parameter and union member is reached by production, deleted, or kept with a cited reason. One concept has one home.

## Shape

Ports derive from their owners so references follow the composition root. The unwired scans then report what no production path reaches, from whole exports down to fields, parameters and union members. Each finding is wired, deleted, or kept with a cited ledger reason.

### Order

Fix a server bug a scan exposes before judging fields. Judge fields in bulk after that.

| Step | Work | Items |
| - | - | - |
| 1 | Judge every member the member scan reports | the unwired-member items the 1439 report boards, 0501, and the possibly dead guards the restoration lanes found |
| 2 | Fix each scan's false-positive classes and judge its run | the [judgement items](#judgement-items) |
| 3 | Build the new scans on the key resolver and judge their first runs | 3806, 3807, 3808, 3809 |
| 4 | Adjudicate unused exports through the package doors | 0989 |
| 5 | Hold the domain template with dependency rules | - |
| 6 | Rebuild the unwired tool on the one reference graph (D357): close the graph's parity and judgement gaps, move each scan onto it with a row diff, then delete the old engines and the prototype | 3888-3895, 3906, 3907, then 3896-3903, then 3904, 3905 |

## Rejected

A CI gate on scan output, a baseline of accepted findings, and keeping code because it looks deliberate without a cited ruling.

## Coupled sites

docs/adr/0337-owner-built-statements-join-another-domains-batch.md; docs/law/Core-0-Architecture-and-Structure.md §4; tooling/src/unwired/; knip.

## Test plan

Each scan ships fixtures for a found case and a false-positive control. Each deletion keeps the affected suites green; each wiring adds a production-path test.

## Deleted keys

A deleted tRPC input key strips silently under `z.object`. A sweep of every landed deletion found no live sender of a deleted key. `pnpm unwired` removed-keys now fails a deletion branch when the key resolver places a client, plugin or e2e write on the shape the key was removed from, or finds the key in a loose object handed to one of our tRPC procedures or own routes. A destination is a resolved callee. It is a tRPC verb the tRPC packages declare, or a TanStack mutation built from a procedure's `mutationOptions()`. It is also a platform request that carries a body, `fetch` or `sendBeacon`, to a URL on our own origin; the URL folds through the graph's URL reader, `tooling/src/unwired/graph/urls.ts`. A same-named field of another shape passes, and a site the resolver cannot place, including a body sent outside the repo, is listed as unresolved. The key resolver runs on the graph session's merged program. A receiver file that program does not load is searched as text and listed as unresolved. The check runs only on a clean checkout of the head.

Scan tables are not committed, because `reports/` is gitignored. Each scan writes its report under `reports/unwired/`. `removed-keys` prints its table, and a landing saves it as `reports/unwired/removed-keys.txt`. An item that lands on a table names that path and the file's SHA-256 content hash in its Evidence.

## A namespace member is a value use

A component handed on through a dynamic import's namespace, as `lazy(() => import(...).then((m) => ({ default: m.X })))`, escapes: the graph reads a namespace member as a value use of the module's declaration.

## One engine

tooling/src/unwired/graph/ is the one core (D357). Every verb is a query over one graph build of the merged program, and the ports census is the one unwired module on TypeScript 6. The optional-pair inventory `pnpm brand-flow` reports is a graph query too (tooling/src/unwired/graph/optional-pairs.ts). Its fields are the graph's optional member declarations and its writes are the graph's role sites. Production there is product source plus the plugin author and SDK sources the author programs hold. The graph does not walk a bundle, so the query reads a bundle's constructions itself, and a bundle that sets both fields cancels a pair.

## One pass for the member scan

`pnpm unwired scan` is a query over the reference graph (D357): the graph's member rows whose member is callable, a method or a member whose type has a call signature, in tooling/src/unwired/graph/members.ts. A row is test-only when production never reads it and a site outside the product reads or calls it; a site outside the product that only writes it, such as a test fake, makes no row test-only. The graph is the only engine, so every verb refuses `--cross-check`.

The graph counts two uses no name shows:

- A parameter or variable typed `Owner["m"]` that holds the member's value, as a composition root hands a verb into its sibling: each value read of the binding reads `Owner.m`. The binding holds the member's value only when a call passes it, or its initializer is, an identifier the code also writes into `Owner.m`. The type annotation alone credits nothing. A call in a program apart from the binding's own stays unjoined, so judge such a member by hand.
- A value handed to a slot a library declares, as `mutate(input, settle)`: the library reads each member its slot names, so the hand-off reads the value's same-named members.

## Limits of the fields scan

The fields query links a hand-off through a generic constraint and a spread into a typed literal down its nested members. These forms stay reported as findings, so judge them by hand:

- A computed key built from runtime strings, such as a template of `prefix` and `suffix`, types as `string`. No name is known, so no field is read or written.
- A type-level registry entry reached only through `Registry[K]` in a type position. The scan counts a type position as no read, so the entry needs a value read by name.
- A read inside a string, such as a JSON scenario file or a user's CEL rule over the automation trigger facts.
- A value whose way to a sink passes more calls, returns and `const` reads than the send chase's depth bound, such as an evidence slice `sliceByWindow` builds into the bug report record. The stopped path is unclassified, so the row stays reported.
- A value the send chase does not follow: one pushed into a list, such as the extraction drops `salvageExtraction` collects for its caller to log, one a `let` holds, and one a function returns where the function is handed on as a value. The row stays reported with an unclassified send.
- A value a handler serializes into `new Response(...)`: the platform constructor names no destination, so the send is unclassified.
- A value posted through a `MessagePort`, such as the `InferenceLog` fill at packages/inference/src/backends/local-light/model-worker.ts:79, which posts each line to the parent thread. The graph follows no message door, so the port stays unresolved and the rows of `ProviderTurnLog`, `ProviderTurnUsage`, `ProviderCacheLog` and `ClampLog` stay reported.
- A value an in-tree serializer walks by `Object.keys` and a computed read, such as `stableStringify` in packages/kit/src/stable-stringify/index.ts. The walk's key is a wide string, so it names no member.
- A write through a dotted path a value holds, such as `writePath(root, row.path, value)` in packages/client/src/features/credentials/lib/connection-fact-model.ts. The path is a wide string, so no member is written.
- A schema key the model fills through structured output, such as the refinery schema forge's row keys. The parse of a provider reply writes it, and the scan counts no parse as a product write.
- A value posted to the debug route or downloaded as a bug bundle file. A person reads the file outside the tree, so the row stays reported with its `wire` or `file` send.
- A schema whose parsed value production types by another declaration through a parse return type or a refine predicate, with no `satisfies z.ZodType<T>` link. The reads land on the other declaration, so the schema keys report unreferenced.
- A `Registry[K]` type map keyed by a union, such as an id type per kind. The scan reads no member through the map.
- A schema that only validates a value production reads through another type, such as a dependency's message type or a payload handed on whole to a provider. Its keys report unreferenced.
- A local type for a value a library or the platform reads, such as a syntax-tree node or a canvas. Its members report never-read or unreferenced.
- A key written through a computed name, such as `[key]: value`, or a `z.literal` input key the parse checks and production never reads.

A key an `.extend({ key })` call re-declares is the base schema's key, so its reads and writes count for the base. A schema checked against a mapped re-keying, `{ [K in keyof T]?: T[K] }`, mirrors `T`.

## Member rows on the graph

The graph's member rows (tooling/src/unwired/graph/judge.ts) carry the `file:Home.member` key, so one judged list and one deliberate list serve both. `pnpm unwired fields` reports those rows (tooling/src/unwired/graph/fields.ts). This table holds the ruling for each class of row a reader could judge either way.

| Class | Graph | Ruling |
| - | - | - |
| A literal typed by a schema's inferred type (`z.infer`, `z.input`, a tRPC input) | writes the shape key: the mapped member's source is the key itself | A mapping from a shape key's schema to its parsed value is the field, not a table keyed by it (tooling/src/unwired/graph/slots.ts). |
| A schema key under object keys that declare nothing, such as a router's procedure key | homed through each of those keys: `router.procedure.key` | One spelling (tooling/src/unwired/graph/sites.ts `schemaKeyPath`). |
| Union options that name one member under one home | one row per option, numbered in source order, `Home.member#2` from the second on | One spelling (tooling/src/unwired/graph/judge.ts `declaredMembers`). |
| A local literal no slot types, handed on later as an argument or an array element | writes its own keys, and the slot it lands in takes the writes at every depth | The literal writes its keys (tooling/src/unwired/graph/slots.ts `ownKeyWrites`, tooling/src/unwired/graph/sites.ts `valueFlowSite`). |
| A member typed `?: never`, or a schema option key typed `z.never()` | judged by nothing | A union exclusion marker holds no data (tooling/src/unwired/graph/sites.ts `shapeOnlyOf`). |
| A member keyed by a `declare const` unique symbol | judged by nothing | A brand key exists only in the type (tooling/src/unwired/graph/sites.ts `isPhantomKey`). A member keyed by a real symbol is judged. |
| A schema key with a `satisfies` twin, union options included | judged at the twin type's member | The type member is the home (tooling/src/unwired/graph/build.ts `zodTwins`). |
| A member only a test or the testkit reads, such as `ReactivatePluginsReport.failed` in packages/server/src/entry/boot/reactivate-plugins.ts | `member-untouched` | A run edge reaches a member otherwise only from the product (tooling/src/unwired/graph/analyse.ts `dispatchedMembers`). A test's read is no such edge. |
| A read through a symbol-typed key, such as `built[Symbol.asyncDispose]()` | reads the member declared under that symbol | The key names one member, never the table whole (tooling/src/unwired/graph/keys.ts `symbolKey`). The members of `ServicesResult` in packages/server/src/entry/compose/services.ts that only tests read are test-only. |
| A member that fills a typed slot of ours, such as an out-param sink (`SendRegexSink` in packages/server/src/domain/chat/contract/gather.ts) or a generic constraint (`Carrier` in packages/client/src/features/chat/lib/chat-track.tsx) | no row | The slot requires the member, so it is judged at the slot (tooling/src/unwired/graph/analyse.ts `fills`). |
| A value handed to a library slot typed `unknown`, such as a React dependency list (`useEffect(..., [deps.rule])` in packages/client/src/features/automation/hooks/use-rule-autosave.ts) | taken by identity: no read, no escape | One rule (tooling/src/unwired/open-sends.ts `identitySlot`). The elements of a list it takes fill no slot either. |
| A value handed to a library type parameter an outer declaration binds, such as a state setter (`setTestResult({ result, rule })` in packages/client/src/features/automation/components/rule-row\.tsx) | pairs with the instantiation, so the value is read where the state is read | Only a type parameter the called signature declares is inferred from the value and escapes (tooling/src/unwired/graph/flows.ts `ownTypeParameter`). A function type in the slot's union takes no other value. |
| A whole-row select or `findMany` whose rows reach a slot typed by the table's row type, such as `rows.map(toView)` in packages/server/src/domain/automation/persistence/queries.ts | reads only the columns code reads off the row | The row type's members stand for their columns, so a row handed on reads none (tooling/src/unwired/graph/flows.ts `#memberPairs`). A projected select reads each column it projects. |
| A member a TanStack form field path names, such as `form.setFieldValue("params.banEos", value)` or `<form.Field name="title">` | a form write method writes each member on the path; any other path argument reads each; a field component's `name` binds the member's input, so it reads and writes each. A template path through an array index, ``<form.AppField name={`userMacros[${index}].description`}>``, resolves when the bracketed substitution is a number and each segment names a member of the form's value type; a path the type does not confirm names nothing | The editor that binds a field writes the member the user edits and reads it (tooling/src/unwired/key-resolver.ts `formPath`, called by tooling/src/unwired/graph/keys.ts `#formPaths`). |
| A member a `typeof a.b` type query names | a key use of `b`, as `T["b"]` is: a type reads no data | tooling/src/unwired/graph/roles.ts `typeQueryRoles`. |
| A member a library reads by a configured field name or its default, such as the `id` of a document handed to `MiniSearch` in packages/ui/src/primitives/macro-textarea/macro-textarea.tsx | `member-write-only`: the library is outside the tree and its option never names the member in a spelling the scan resolves | A library's option names and defaults are a table per library, and the scan teaches only the libraries it models (zod, tRPC, Drizzle). A document member the code copies for a library to read is declared in the option, `idField: "name"`, or it is a finding. |
| A member typed `?: undefined` that bans a key on a type built by intersection, such as `PluginSurfaceSpec.when` | judged by its own reads and sends: a same-named member of the intersected type credits it nothing, through a `z.ZodType` binding too | A schema binding pairs only declarations the output and the declared type do not share (tooling/src/unwired/graph/build.ts `#zodTwins`), so the shared member's reads stay on the shared declaration. |
| A schema key a later `.extend` overrides, such as `redeemInviteResultSchema.participant` in packages/contracts/src/chat/detail.ts | `member-validated` | Nothing in the product writes the key. A `T[K]` type names it without a data read. |
| A type registry entry reached only through `Registry[K]` | a key use, so no row | A key use names the member when `K` can be that entry's key, as a mapped type over the whole key tuple is; see "Limits of the fields scan". |
| A read of a discriminant through the union | reads the member of every option | Every option's member is read. |
| A member stored into a Drizzle column, copied by a key or carried by a whole value | flows into the column: read only where the product reads the column back; a read in a table definition reads nothing | One rule (tooling/src/unwired/boundaries.ts `storeWritesAt`, tooling/src/unwired/graph/build.ts `#stores`). A send of the column hands the library its definition and sends no stored value. |
| A read by snap or a value published to the dev bridge | a use | D357. A dev-bridge read is one through our own `declare global` global off `window`, `globalThis` or `self`, in code or in a script's text (tooling/src/unwired/graph/build.ts `#doorReads`). A test that imports the member's module reads it as a test does, as `AppearanceMatrixContract.executable` in packages/client/src/lib/appearance-carrier-manifest.ts is read. |
| A member that takes a read only through the carry: a flow, a zod twin, a column, a build script's closure or the dev-bridge door | no row | The `--why` record names each role the carry gives, with its link and the member or reading file it came from (tooling/src/unwired/graph/why.ts `carriedEntries`). |
| A read through a `keyof` mapped type, such as `Partial<Record<keyof Persisted, unknown>>` | reads the member the key names | The key names the member. |
| A destructuring assignment, `({ a } = value)` | the pattern's key reads the member | tooling/src/unwired/graph/roles.ts states the pattern invariant. |
| A member a library reads: a `declare module` augmentation of a library interface, or a type that fills a library slot | read by the library | A library slot names the field in its published declaration (tooling/src/unwired/graph/flows.ts). |
| A schema key nothing writes | `member-validated` | A key only a parse fills validates outside input. |
| A read by a package-root file such as a token build script | a use when every manifest's build, or a published package's prepare, runs the file or imports it through the pnpm-run closure (tooling/src/unwired/graph/roots.ts `shippedScripts`); a private package's prepare ships nothing | D357: a script whose output ships is the product's. |
| An optional member of a type a production parameter is annotated with | no `member-read-only` row: a caller may leave it unset | The graph resolves the annotation through import aliases (tooling/src/unwired/graph/build.ts `#parameterHomes`). |
| An interface member that redeclares a member of a type it extends | a read of either reads the other; a write carries neither way | A subtype value can reach a base-typed reader (tooling/src/unwired/graph/build.ts `#overrides`, carried in tooling/src/unwired/graph/analyse.ts `roleLinks`). |
| A value handed to `Object.entries`, `Object.values`, `Object.assign` or `structuredClone` | reads every member | The platform reads each member's value (tooling/src/unwired/graph/keys.ts `#reflectiveReads`). |
| A value handed to `Object.keys` or a `for…in` loop | a key use of every member, as an `in` test is: a member the product only writes stays `member-write-only`, and `Object.keys` still sends the value | The platform lists names and reads no value (tooling/src/unwired/graph/keys.ts `#reflectiveReads`). |
| A lookup keyed by a parameter no caller narrows | reads the members the key's own literal type names | The key type bounds the lookup (tooling/src/unwired/graph/keys.ts `finish`). |
| A schema bound under a `z.ZodType<T>` annotation, or returned by a `z.lazy` arrow | twins its keys with `T`'s members | The annotation checks the schema as `satisfies` does (tooling/src/unwired/graph/sites.ts `checkedSchema`, `zodWrappedSchemas`). |
| A plugin contract member the SDK publishes | listed as received, with the SDK line, and judged by nothing | Guests read it outside the tree (tooling/src/unwired/graph/analyse.ts `Analysis`). |
| A key beside a spread, `{ ...value, key }` | writes its member, but the copy builds no home: its home's optional members still report only when a build writes it | The value arrives with the copy (tooling/src/unwired/graph/state.ts `copyOnlyWrites`). |
| A binding or literal under `satisfies T`, such as `defs satisfies Record<Task, TaskFields>` | fills `T` as a slot, and a read of its members reads `T`'s, at any depth | The compiler holds each member to the checked one (tooling/src/unwired/graph/flows.ts `#checkedPairs`). A zod schema twins instead. |
| An array spread, `[...entries, ...offs]` | each spread list fills the array's element type, as a list argument does | tooling/src/unwired/graph/sites.ts `copyFlowSite`. |
| The input of a tRPC `infiniteQueryOptions(input, …)` call | writes the input's `cursor`, and no other member | TanStack Query fills the cursor from `getNextPageParam` on every page (tooling/src/unwired/graph/slots.ts `pagedWrites`). |
| A value a call's type argument is inferred from, such as `split(rows)` for `split<Room extends Candidate>(items: Room[])`, and a type parameter of ours handed to another generic | fills the callee's constraint as a flow: the body's reads through the constraint reach the value | tooling/src/unwired/graph/constraints.ts `inferredPairs`. An explicit type argument stays a key use. |
| Two instances of one generic, such as `Options<Input>` into `Options<NominateVars>` where `V` is only a mutation function's parameter | each type argument pairs by its parameter's variance: forward, backward, both, or forward when unused | The checker exposes no variance, so a polarity walk over the declaration measures where a value moves (tooling/src/unwired/graph/variance.ts). A method's parameter and a key position move no value. |
| The unread member of a one-key tRPC mutation output | listed as acknowledged, apart from the judged rows | The key is the procedure's whole answer (tooling/src/unwired/graph/judge.ts `acknowledgements`). |
| A literal checked by `satisfies T` and handed into an opaque slot, such as `render({ … } satisfies View)` | sends `T`'s members where the value goes | The checked shape is what leaves (tooling/src/unwired/graph/flows.ts `#checkedTypes`). |
| A value whose `JSON.stringify` string is compared, hashed by `node:crypto` or keyed in a standard-library `Map` or `Set`, directly, through a binding or through an in-tree helper's parameter, or a value handed to a dotted-path reader (`nestedValue(value, path)`) | reads every member, at any depth | The checker resolves each place the string reaches and the declaration decides, never a name (tooling/src/unwired/open-sends.ts `serializedBy`). A chase the depth bound stops is unclassified and counted. The dotted-path readers are `NESTED_READS` in tooling/src/unwired/boundaries.ts. |
| A value handed to an in-tree body that only tests, voids or drops it on every path, itself or through a helper it calls | no escape: nothing receives it | tooling/src/unwired/open-sends.ts `sendChase`. A body that returns, stores or passes the value on along any path keeps the escape. |
| An assertion: `tree as Chip` of a parameter a library typed, of a returned closure's `unknown` parameter, or a cast into an opaque type | the asserted type's members are sent to that library, or to the closure's unseen caller; a cast's operand is sent only where the chase names a receiver or a provider request | tooling/src/unwired/open-sends.ts `assertedDestination`, tooling/src/unwired/graph/flows.ts `#assertions`. A cast nothing follows is no send. |
| A member a Drizzle store copies by key or carries whole, such as `values({ body: input.body })`, with no other use | read only where the product reads the column back; the copy's own use reaches nothing, so a member nothing else uses reports `member-untouched` | tooling/src/unwired/graph/analyse.ts `stored`. A member that also fills one of our slots stays judged at that slot. |
| A property read off a receiver typed `any`, such as `untyped.stray` | credits no member; a lost read (`any-receiver`) by its name, so the member rows can list it beside a row of that name | tooling/src/unwired/graph/build.ts `#anyReceiverReads`. A write through `any` is not listed. |
| A literal key read through a string-indexed type a typed value was handed into in the same file, such as `line["done"]` on a `Record<string, unknown>` | reads the value's members of the key's name, at any depth | tooling/src/unwired/graph/keys.ts `#sinkReads`. It cannot tell two values handed into one type apart. |
| A value handed into a slot with a string index signature, such as an `Entry` into a `LogRecord` with `[field: string]: unknown` | pairs the members the slot names; each other member is sent, nested members too, where the value goes | tooling/src/unwired/graph/flows.ts `#indexedEscapes`. |
| A schema checked against `z.ZodType<T>` by `satisfies`, an annotated binding or a declared return, such as the transform annotation in `analysisPayloadEnvelopeSchema` in packages/server/src/domain/automation/contract/analysis.ts | each member its output declares pairs with the same-named member of `T` at the same path, at any depth: a twin when the declaration has one partner, else a check that passes only its own reads to each | The check holds the output to `T`, so a delete of either breaks it (tooling/src/unwired/graph/build.ts `#outputPairs`, `#settleTwins`). A twin through a shared declaration would carry one member's read to another, as a sub-schema reused under two keys or a union whose options share a key would; the shape-key twins take the same rule. |
| A `keyof T` list asserted to another type, such as `fields as string[]` in packages/ui/src/fuzzy-search/fuzzy-search.ts | a key use of the constraint's member when the constraint has one member | An empty key set compares with no list, so the delete breaks the assertion (tooling/src/unwired/graph/keys.ts `#keyofAssertions`). A plain keyof use keys nothing. |
| A generic alias whose body is a conditional that checks a parameter bare, such as `Needs<Shape>` for `Needs<T> = T extends { b: string } ? A : B` | a key use of each argument member the pattern names | The check is a constraint at the instantiation (tooling/src/unwired/graph/constraints.ts `checkedPatterns`), wrapped (`[T] extends [{ … }]`), over the argument's list elements or nested in a branch too. A key text checked against `keyof T` keys nothing. |
| A computed-key access, `x[k] = v`, a bump or a delete | takes the role its position gives on each member the key names | One rule with a named access (tooling/src/unwired/graph/roles.ts `accessRoles`). |
| A member typed `Owner["m"]`, such as a port member `viaIndex: Service["viaIndex"]` | a read of it reads `Owner.m` | The member holds the owner's value (tooling/src/unwired/graph/member-links.ts). |
| A parameter or variable typed `Owner["m"]` | a read of it reads `Owner.m` only when its initializer, or an argument some call passes it, is an identifier a literal also writes into `Owner.m` | A composition root hands a verb into its sibling this way; the annotation alone credits nothing (tooling/src/unwired/graph/member-links.ts). A call in a program apart from the binding's own is not joined. |
| An overload's parameter beside its implementation's, through a returned function type too | the overload's parameter type fills the implementation's as a flow | Callers write the overload's members and the implementation reads its own (tooling/src/unwired/graph/member-links.ts). |
| A class member that implements or overrides a member of a heritage type, or a static a class value fills a slot with | writes the member it fills | The class supplies the member as a literal's key does (tooling/src/unwired/graph/build.ts `#dispatch`). |
| A value under `satisfies Record<string, T>`, or handed into a slot whose string index signature's value type holds members | each entry pairs with the index value type, at any depth | The index signature types every entry (tooling/src/unwired/graph/flows.ts `indexValueTypes`). An index signature typed `unknown` or a primitive keeps the escape. |
| An object a call hands to a parameter the callee assigns a member through, such as the `settle` ledger in packages/server/src/domain/rpg/chat-ops/flush.ts | the argument's member at the assigned path flows back from the assigned member, so the caller's later read reads the callee's write | The callee writes the caller's own object (tooling/src/unwired/graph/flows.ts `#flowAssignedBack`). Only an assignment through that parameter, or a binding destructured from it, counts; an assignment through another binding of the same type flows nothing back. |
| A value handed to a slot that names a member the value's static type dropped on the way, such as a cost row typed `ShapedHistoryRow` handed to `historyTurnTokens`, which reads `extraTokens` | the value's trace fills the slot: back through a `const` initializer, a `for…of` binding, an array method's callback, a call's returns and each call's argument, to the first type that names the member | Only the value's own trace carries the member, so two values widened into one type stay apart (tooling/src/unwired/graph/values.ts). A parameter takes the argument of its own function's call on the walk's path back, so a closure inside the callee reads that call's argument, and a closure made by a call the walk never saw ends the walk. A branch the hop budget or the depth cap stops credits nothing; an origin proven before the stop keeps its credit. A rest parameter or a spread argument, as `fitHistory(...args)` forwards, ends the trace. |
| A value handed to a log line: a member of the platform `Console`, a call into a logging library's declaration, or an in-tree port such as `log.emit(...)` | `log` only where the checker resolves the target: the platform console, a package in `LOG_PACKAGES`, or a port whose key-written functions the chase follows and whose every whole fill is a logging library's value or the port handed on. A callee spelled like a logger resolves to nothing | tooling/src/unwired/open-sends.ts `libraryDestination`, `portChase`, `portFills`. A port filled through an alias, a heritage clause or a type argument stays unclassified. |
| A member the product never reads whose every send is a log line, a callee or receiver declared in packages/server/src/foundation/observability/, or a value published to our own `declare global` global | listed as observed, apart from the judged rows | The operator reads the observability home (Tier-2-Foundation, D75) and the dev bridge; the send's resolved target decides, never the value's or the member's name (tooling/src/unwired/open-sends.ts `observedTarget`, tooling/src/unwired/graph/judge.ts `onlyObserved`). A send from the home to the network or a file stays a finding. |
| An escape whose chase reaches several destinations | sends to each | tooling/src/unwired/graph/flows.ts `distinctSends`: a value one path logs and another leaves unseen stays reported, and a path the depth bound stops is unclassified beside the others. |
| A value handed to a framework member whose call returns the platform `Response`, such as the context's `json` | sent to `http`, whatever the context is named | tooling/src/unwired/open-sends.ts `frameworkResponse`. A framework member that answers no `Response`, such as `set`, stays `dependency`. |
| A value a function returns, or a `const` it initializes | goes where each caller hands the result, or each read of the binding takes it; a platform list method carries it to the method's result | The value trace's rules read forward (tooling/src/unwired/open-sends.ts `returnedTo`, `boundTo`; tooling/src/unwired/list-methods.ts `RESULTS`). A value that entered a callee through a parameter goes back to that call alone. A closure's return, a function handed on and a path past the depth bound are unclassified. A result every caller drops is dropped. |
| A push into a list through an optional member, `ctx.rows?.push(row)` | writes the list the caller handed in, as a push through a required member does | tooling/src/unwired/graph/flows.ts `#mutableList`. |
| A value inside the provider backends that no other destination takes | sent to `provider` only when the value at its site reaches a request the backends make, and received where a doc names the member; a value nested in a reaching literal takes the destination of the call the literal goes to | tooling/src/unwired/open-sends.ts `providerReach`; the graph chases each escape from the value at its site, at any depth of the flow walk (tooling/src/unwired/graph/flows.ts). |

Classes still open:

- A member of a `declare class`, such as a mint class that brands a type, has no run-time presence either. It reports `member-sent-only` or `member-untouched` today.
- A member of a type that exists only to name a type error, such as the members of `NamesEvery` in packages/kit/src/guards/index.ts, reports `member-untouched`.
- A computed key built from a runtime symbol (`{ [token]: true }`) writes nothing.

## Limits of the unions scan

`UNION_LIMITS` in `tooling/src/unwired/graph/unions.ts` is the one list. These classes stay reported, so judge them by hand:

- A tuple only a file outside every package world enumerates, such as `packages/ui/tokens.build.ts`. Adding those files to a world raises the run past the memory bar.
- A value typed by one tuple that production hands into another tuple's slot. The tuples are separate vocabularies.
- A member built only by a literal in an inline `as const` array that production maps.
- A member a conditional type's branch re-spells.
- A literal whose contextual type is a type parameter, such as an `Object.freeze` argument or a generic row helper.
- A read by name of a `Record<Tuple, …>` entry builds the member only for an `as const satisfies Record<…>` literal. A `Record` annotated with a type builds nothing.
- A switch label handed on builds the member only when production builds that label in the switched value's own vocabulary.
- A stale key in a key list, a key the selected type no longer has.

A tuple a lib key selection names is a key list: `Pick<T, K>`, `Omit<T, K>`, `Exclude<keyof T, K>` or `Extract<keyof T, K>`. The scan lists key lists apart and judges none of their members.

## Key resolver

A key resolver in `tooling/src/unwired/` is not yet built (3812). It will be the one place that maps a property read or a string key to the members it names. Every scan that asks "which member does this key reach" calls it, and none keeps its own name match.

It tries these steps in order, and a later step sees only what earlier steps left:

1. The checker's symbol, when it has declarations.
2. Find-references, for a string-literal key with no symbol: it follows a homomorphic mapped type and an element-access key.
3. The mapped-template walk, for a symbol with no declarations: a non-homomorphic mapped type creates its properties without declarations.
4. A contextual `keyof X` type, which names `X`.
5. A generic call: the target signature's `K extends keyof T` names the parameter whose argument type gives `T`.
6. A TanStack form path: the form's `state.values` type is the data type, read from the form's members so a project alias over the hook's return or an `Omit` of it resolves, and the dotted path walks it segment by segment. An object is a form only when it also has `setFieldValue` and `getFieldValue`; a store that holds `state.values` alone takes no path.

A key it cannot place is `unresolved` and reports in its own list. A key that lands in an index signature is `open`. An open object that flows into a tRPC procedure input or one of the server's HTTP routes is a loose sender, so removed-keys checks its keys. Only a body sent outside the repository is exempt.

## Procedures and routes no caller reaches

`pnpm unwired procedures` (3806) lists each tRPC procedure and each HTTP route with no production caller. It writes `reports/unwired/procedures.json`.

- The verb is a query over the graph session (D357). A caller is a call in production code or in snap: the client, a plugin through the host bridge, the server itself, or snap driving the app. The graph's origin walk follows the client's proxy path to the procedure, and the query reads the role sites the build keeps for the router files. A plugin guest reaches the server through the one typed `plugin.uiHostCall` relay, so its function names are data and credit no procedure.
- A cache key or a filter built from a procedure is no call. The verb counts only when a tRPC package declares it; a same-named method of our own is a call.
- A route is a Hono registration in `packages/server/src/entry/http/` or in the debug registrar under `packages/server/src/foundation/observability/debug/`. The debug routes serve only behind the debug gate, so tooling and tests are their callers, and a debug route nothing calls reports as uncalled.
- A route's caller is a request the platform sends: `fetch`, a navigation, a beacon, an event stream or a URL attribute the platform declares. A call to an in-tree function that returns one of our URLs counts where its value reaches a URL slot or a response the server sends. A URL slot is a request's URL, the URL constructor, an `href`, `src` or `action` write, or a router's `to`. A response is an argument of a Hono context member, such as `c.json` or `c.redirect`. The value is followed through templates, concatenations, branches and builders, and through variables, in-tree parameters, returns, members and props, by find-references. A product file outside snap whose own world loads no DOM library sends no request to our routes. Snap's requests are product calls, and a Node test's or a tool's requests are test calls. Paths and URLs fold through the checker, and a request matches a route by method and path.
- A procedure that only tests call reports as `test-only`, as the member scan does. A test seam is never kept for its tests alone.
- A route or procedure called from outside the repository sits in the outside-caller table, `OUTSIDE_CALLERS` in `tooling/src/unwired/graph/procedures.ts`, with one reason per row. The scan prints each row with the registrations it covers, and a row that matches no registration reports as stale. An OIDC callback and a health check are examples.
- The owner rules on the outside-caller table before the first report is judged.

## Columns nothing reads or writes

`pnpm unwired columns` (`tooling/src/unwired/graph/columns.ts`) queries the reference graph for each drizzle column in `packages/db/src/schema/`. It reports a column production never reads, never writes, or neither.

- A select with no column list reads every column only when production reads the row by member. A whole row handed to a declared shape carries its columns, so a read of that shape's member reads the column. The column's writes do not fill the shape. `tooling/src/unwired/drizzle-rows.ts` places a row member on its column, and a mapped type over a row, such as `Omit` or `Pick`, reaches the same column.
- Migrations, the baseline and the schema files are neither a read nor a write. The schema directory is the graph session's declaring home: a site in it gives a column it declares no role.
- A column picked by name into a log, a debug route or a bug bundle counts as read. A column that only rides a whole-row dump does not.
- An export that carries a column to a file counts as a read, a whole row serialized into a file included. The import that fills it counts as a write.
- A zod `parse` or `safeParse` of a row, whole or spread into an object literal, reads each column whose name the parsed output carries. A key the schema strips, or one a later property of the literal sets over the spread, is no read. A parse no zod schema answers reads nothing.
- A primary-key column, built with `.primaryKey()` or listed by `primaryKey({ columns })`, that production never reads is listed apart under `primaryKeys`, never as a finding: the key is the row's identity, which an upsert on a natural key never selects.
- A store of a whole value writes the columns of its required members. An optional column that the value's type only allows is a write only where the value's construction sets it. A store is a builder call drizzle-orm declares, never a same-named method.
- A row that carries a subset of its table's columns outside a mapped type over the row matches no table. A member of it named as a column is listed as unresolved.
- A column that only raw SQL writes is listed as deliberate with its reason.

## Error codes nothing throws or handles

`pnpm unwired codes` lists each error and refusal code from the closed code vocabularies in `packages/contracts` with its throw sites, its wire crossing and its client handlers. `CODE_LIMITS` in `tooling/src/unwired/graph/codes.ts` is the one list of what it cannot see.

- A vocabulary holds codes when production hands a member to the code parameter that `domainReason` in `packages/server/src/transport/trpc/error-mapping.ts` reads, or when a refusal field of a tRPC answer or an HTTP route's JSON body is typed by it.
- A member is thrown when the code parameter's value comes from it. A helper argument counts only when it names one parameter, so `tag(code, level)` makes neither a code.
- A coded refusal is an object with one vocabulary field, one required sentence and nothing else required.
- A refusal field is the code of a coded refusal on the `false` members of a union split by a boolean field. No `true` member may carry a vocabulary field, and no `false` member a field a `true` member carries.
- A refusal field is also the code of a coded refusal typed `O | null`, never an optional or `undefined` one.
- A refusal field is also the one vocabulary field at the top of a body sent with a 4xx or 5xx status.
- A member in an error's detail object, a success answer's field or a progress member is no code.
- A code with no throw site in production is dead vocabulary. In a returned vocabulary, a code is dead when no server production site builds it. A client or test construction builds nothing.
- A code that crosses the wire is handled only when the client branches on that code. A branch is a switch case, a comparison, a plain or computed key, or a `Set` or `Map` element whose binding a file tests with `has` or `get`. A lookup by the whole vocabulary into a table with a row for every member is a branch too. A generic error toast is not a handler.
- A code that only server-internal callers see needs no client handler. The scan marks where each code crosses the wire.
- The owner rules on the handled rule before the first report is judged.

## Code no run executes

`pnpm unwired coverage` (3809) merges V8 coverage from the Node, CT and e2e suites. It writes the production functions and branch paths that no run executed to `reports/unwired/coverage.json`.

- The Node suite runs `pnpm test:coverage` with the json reporter. Its istanbul map is the universe of functions and branches.
- CT and e2e pages record Chromium coverage through the fixtures in `tooling/src/floor/testing/coverage-collection.ts`. Those fixtures sit on the `@orb/testkit/ct-corpus` and e2e corpus and surface bases. A spec that takes `test` straight from `@playwright/test` records nothing, and the report lists it.
- The e2e servers write `NODE_V8_COVERAGE` dumps. A process that loaded first-party code outside `packages/*/src` is harness, and all of its hits are dropped.
- Browser and server coverage converts with ast-v8-to-istanbul, the converter `@vitest/coverage-v8` runs. A hit lands on the universe entry at the same start position. Failing that, a named function lands by name and line. An anonymous function lands where its declared point and the start of its whole range agree, or on the one key that finds a function; when the two keys find different functions, the hit stays unmatched. Last, an anonymous function or a branch lands at the same place among its line's anonymous functions or same-type branches, when both maps hold the same number there. Each transform moves columns its own way, but none reorders two functions on one line.
- The bundler renames a module-level function that another module of its chunk declares too, by appending `$<n>`. A hit tries its own name first. Then the name without that suffix lands only at the same declared point.
- The client build skips the React Compiler under the command. The compiler lowers source branches into other shapes and adds memo-cache branches, so no compiled branch maps soundly to a source branch. Behaviour only the compiler's memoisation produces does not run in a coverage build.
- A CT or e2e pass or failure under the command is not a test verdict. The compiled suites stay the verdict.
- The report gives each suite's matched and unmatched hits and the matched share of each kind. Read the share before you judge an unexecuted entry in a file that suite ran.
- Suites run one after another, never side by side. The report records the peak memory of each suite's process tree and of the merge.
- Each finished suite writes a run record beside its output. `--merge=<suites>` merges recorded suites without a new run, so the suites can run as separate commands.
- A suite's worker count sets its peak; separate commands do not lower it. Pass `--ct=--workers=<n>` or `--node=--maxWorkers=<n>` to lower a part's peak.
- Sizing a part assumes the `shared` profile's worker caps in `tooling/concurrency-profile.json`. `ORB_DEDICATED_BOX=1` raises them, and the sizing no longer holds.
- `--merge` refuses a record whose HEAD or working tree differs from the current tree. A list merged from two trees names code that one of them lacks. The tree leaves out the run folder and every report the command wrote.
- A suite that ends with a crash exit, a signal or timeout, or no coverage written is recorded incomplete. No command merges an incomplete record. A test failure is a verdict, and its coverage merges.
- A branch no run executes is judged like a finding: write a test that runs it through production, close it with a type, or delete it.
- The report is input to judgement and never a gate.

## Judging a finding

Each item step 2 lists gives every finding of one scan in one domain a class (wire, delete, deliberate with a cited ruling, or unknown) and a decision. A class marked `(read)` was judged from the cited code. The others follow these rules:

| Scan | Finding | Class | Decision |
| - | - | - | - |
| fields | `unreferenced` | delete | delete the field or key |
| fields | `never-read` | delete | delete the field and its writes |
| fields | `never-read` on a client `…Vars` type | wire | derive it from the router input |
| fields | `never-read` on every reported field of a home | unknown | find the slot the value flows into and derive it from this type |
| fields | `never-written` type member | delete | delete the field and the branch that reads its default |
| fields | `never-written` schema key | unknown | name the outside writer, or delete the key and its default branch |
| params | `unsupplied`, `unsupplied-prop` | delete | delete the parameter or prop and its default path |
| params | `same-literal` | delete | inline the literal and drop the parameter |
| unions | `unbuilt` | delete | delete the member and the branches, checks and keys that name it |
| unions | `parsed` | unknown | keep the member only while the parsed source can produce it |
| shapes | `restated`, both sides a verb's `…Params` or `…Result` | deliberate | `docs/law/Core-0-Architecture-and-Structure.md` §4 |
| shapes | `restated` | unknown | judge by concept; keep one home only when both name one concept |
| shapes | `reexport-chain` | delete | export from the home |
| shapes | `renamed-reexport` | delete | use the home name |
| shapes | `synonym` | delete; deliberate for a per-verb name or the observability `Logger` | the scan's synonym rows |

The port census and the `orb/derived-port-member` rule follow a value only through a member, a forwarding lambda, a spread and a destructured member. They do not follow a value through a local binding: a `let` is rebound, so no single member stands behind its name. A port member fed through a `let` hop is invisible to both, so judge it by hand and type the member by its owner. The case `a member a let hop carries to the port` in `tests/tooling/eslint-derived-port-member.test.ts` holds the limit.

Before you delete an input key, search for the key name with a literal `rg` across `packages`, `tests`, `tooling` and `scripts`, and read every writer of its procedure. `z.object` strips an unknown key without an error, and a writer through an `as const` object or a spread passes the compiler, so a clean typecheck proves nothing.

A finding in `packages/contracts/src/plugin/` or `packages/plugin-sdk/` sits under each item's Plugin API heading: guests reach that surface from outside the tree, so keep it unless no guest can reach it. A row that looks like a half-built feature sits under Owner calls.

### Judgement items

- fields: the items the fields review filed under this plan
- params, unions, shapes and ports: 3811
- judged rows and engine disagreements: 3837, 3838
- the scan's memory need: 3673
- the resolver and the removed-keys check: 3812, 3810
- new scans: 3806, 3807, 3808, 3809
