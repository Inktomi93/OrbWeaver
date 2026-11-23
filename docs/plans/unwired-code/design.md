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

## Engine disagreements

Engine one judges, and find-references audits one way: a disagreement means engine two found a production site in a role engine one lacks. Every row is decidable inside one program, so the cause is not a gap between tsconfig worlds. 3838 traced the rows.

- Find-references on a member also returns the sites of every member that shares its base: the base's own and each sibling override's, as `<p className>` beside a props type that redeclares `className`. Engine two tags those sites `relative`. A tagged write builds the base's or the sibling's value, so the fields audit never counts it as a write. A tagged read still counts, since a subtype value can reach a base-typed reader. The member's own sites and those of the members that inherit it stay untagged.
- A component handed on through a dynamic import's namespace, as `lazy(() => import(...).then((m) => ({ default: m.X })))`, escapes: engine one's value index and the params graph query both read a namespace member as a value use of the module's declaration.

## One pass for the member scan

`pnpm unwired scan` builds each world's program once and judges every member with engine one. Engine two and the TypeScript 6 flow pass found no use engine one lacks, in the fixtures and on the real tree, so engine two runs only under `--cross-check`, through the TypeScript 6 language service, and a member it finds used is a disagreement to fix in engine one. The fields and unions scans keep both engines while the fields disagreement stands. The params scan is a query over the reference graph (D357) and has no engine two.

Engine one counts two uses no name shows:

- A parameter or variable typed `Owner["m"]` that holds the member's value, as a composition root hands a verb into its sibling: each value read of the binding reads `Owner.m`. The binding holds the member's value only when a call passes it, or its initializer is, an identifier the code also writes into `Owner.m`. The type annotation alone credits nothing. The write must sit in a file the same world homes as the call, so a member wired across worlds this way stays reported; judge it by hand.
- A value handed to a slot a library declares, as `mutate(input, settle)`: the library reads each member its slot names, so the hand-off reads the value's same-named members.

## Limits of the fields scan

Engine one links a hand-off through a generic constraint, a spread into a typed literal down its nested members, an `in` check and a key typed by a type parameter. These forms stay reported as findings, so judge them by hand:

- A computed key built from runtime strings, such as a template of `prefix` and `suffix`, types as `string`. No name is known, so no field is read or written.
- A type-level registry entry reached only through `Registry[K]` in a type position. The scan counts a type position as no read, so the entry needs a value read by name.
- A read inside a string, such as a JSON scenario file.
- A schema whose parsed value production types by another declaration through a parse return type or a refine predicate, with no `satisfies z.ZodType<T>` link. The reads land on the other declaration, so the schema keys report unreferenced.
- A `Registry[K]` type map keyed by a union, such as an id type per kind. The scan reads no member through the map.
- A schema that only validates a value production reads through another type, such as a dependency's message type or a payload handed on whole to a provider. Its keys report unreferenced.
- A local type for a value a library or the platform reads, such as a syntax-tree node or a canvas. Its members report never-read or unreferenced.
- A key written through a computed name, such as `[key]: value`, or a `z.literal` input key the parse checks and production never reads.

A key an `.extend({ key })` call re-declares is the base schema's key, so its reads and writes count for the base. A schema checked against a mapped re-keying, `{ [K in keyof T]?: T[K] }`, mirrors `T`.

## Member rows on the graph against the fields scan

The graph's member rows (tooling/src/unwired/graph/judge.ts) carry the fields scan's `file:Home.member` key, so one judged list and one deliberate list serve both. Where a row differs from the fields row of the same key, this table holds the reason. The graph's answer is the target unless the row says otherwise.

| Class | Graph | Fields scan | Ruling |
| - | - | - | - |
| A literal typed by a schema's inferred type (`z.infer`, `z.input`, a tRPC input) | writes the shape key: the mapped member's source is the key itself | writes the key | Both credit the write. A mapping from a shape key's schema to its parsed value is the field, not a table keyed by it (tooling/src/unwired/graph/slots.ts). |
| A schema key under object keys that declare nothing, such as a router's procedure key | homed through each of those keys: `router.procedure.key` | the same path | One spelling (tooling/src/unwired/graph/sites.ts `schemaKeyPath`). |
| Union options that name one member under one home | one row per option, numbered in source order, `Home.member#2` from the second on | the same numbering | One spelling (tooling/src/unwired/graph/judge.ts `declaredMembers`). |
| A local literal no slot types, handed on later as an argument or an array element | writes its own keys, and the slot it lands in takes the writes at every depth | credits the write | Both credit the write (tooling/src/unwired/graph/slots.ts `ownKeyWrites`, tooling/src/unwired/graph/sites.ts `valueFlowSite`). |
| A member typed `?: never`, or a schema option key typed `z.never()` | judged by nothing | judged as a field | A union exclusion marker holds no data (tooling/src/unwired/graph/sites.ts `shapeOnlyOf`). |
| A member keyed by a `declare const` unique symbol | judged by nothing | not in its population | A brand key exists only in the type (tooling/src/unwired/graph/sites.ts `isPhantomKey`). A member keyed by a real symbol is judged. |
| A schema key with a `satisfies` twin, union options included | judged at the twin type's member | judged at the schema key when it finds no mirror for a union option | The type member is the home (tooling/src/unwired/graph/build.ts `zodTwins`). |
| A member only a test or the testkit reads, such as `ReactivatePluginsReport.failed` in packages/server/src/entry/boot/reactivate-plugins.ts | `member-untouched` | a test-only read | A run edge reaches a member otherwise only from the product (tooling/src/unwired/graph/analyse.ts `dispatchedMembers`). A test's read is no such edge. |
| A read through a symbol-typed key, such as `built[Symbol.asyncDispose]()` | reads the member declared under that symbol | not in its population | The key names one member, never the table whole (tooling/src/unwired/graph/keys.ts `symbolKey`). The members of `ServicesResult` in packages/server/src/entry/compose/services.ts that only tests read are test-only. |
| A member that fills a typed slot of ours, such as an out-param sink (`SendRegexSink` in packages/server/src/domain/chat/contract/gather.ts) or a generic constraint (`Carrier` in packages/client/src/features/chat/lib/chat-track.tsx) | no row | `unreferenced` | The slot requires the member, so it is judged at the slot (tooling/src/unwired/graph/analyse.ts `fills`). |
| A value handed to a library slot typed `unknown`, such as a React dependency list (`useEffect(..., [deps.rule])` in packages/client/src/features/automation/hooks/use-rule-autosave.ts) | taken by identity: no read, no escape | sends nothing | One rule (tooling/src/unwired/open-sends.ts `identitySlot`). The elements of a list it takes fill no slot either. |
| A value handed to a library type parameter an outer declaration binds, such as a state setter (`setTestResult({ result, rule })` in packages/client/src/features/automation/components/rule-row\.tsx) | pairs with the instantiation, so the value is read where the state is read | follows the value | Only a type parameter the called signature declares is inferred from the value and escapes (tooling/src/unwired/graph/flows.ts `ownTypeParameter`). A function type in the slot's union takes no other value. |
| A whole-row select or `findMany` whose rows reach a slot typed by the table's row type, such as `rows.map(toView)` in packages/server/src/domain/automation/persistence/queries.ts | reads only the columns code reads off the row | reads only those columns | The row type's members stand for their columns, so a row handed on reads none (tooling/src/unwired/graph/flows.ts `#memberPairs`). A projected select reads each column it projects. |
| A schema key a TanStack form path writes, such as `form.setFieldValue("params.banEos", value)` | no row when the product reads the key and the schema's own literal writes it | reports the key | The form path credits no write. The key's other product roles decide the row. |
| A schema key a later `.extend` overrides, such as `redeemInviteResultSchema.participant` in packages/contracts/src/chat/detail.ts | `member-validated` | a fields-to-lists row | Nothing in the product writes the key. A `T[K]` type names it without a data read. |
| A type registry entry reached only through `Registry[K]` | a key use, so no row | `unreferenced` | A key use names the member when `K` can be that entry's key, as a mapped type over the whole key tuple is; see "Limits of the fields scan". |
| A read of a discriminant through the union | reads the member of every option | can report an option's member `never-read` | Every option's member is read. |
| A member stored into a Drizzle column, copied by a key or carried by a whole value | flows into the column: read only where the product reads the column back; a read in a table definition reads nothing | the same | One rule (tooling/src/unwired/boundaries.ts `storeWritesAt`, tooling/src/unwired/graph/build.ts `#stores`). A send of the column hands the library its definition and sends no stored value. |
| A read by snap or a value published to the dev bridge | a use | not a use: its population is production files | D357. A dev-bridge read is one through our own `declare global` global off `window`, `globalThis` or `self`, in code or in a script's text (tooling/src/unwired/graph/build.ts `#doorReads`). A test that imports the member's module reads it as a test does, as `AppearanceMatrixContract.executable` in packages/client/src/lib/appearance-carrier-manifest.ts is read. |
| A member that takes a read only through the carry: a flow, a zod twin, a column, a build script's closure or the dev-bridge door | no row | reports the member | The `--why` record names each role the carry gives, with its link and the member or reading file it came from (tooling/src/unwired/graph/why.ts `carriedEntries`). |
| A read through a `keyof` mapped type, such as `Partial<Record<keyof Persisted, unknown>>` | reads the member the key names | no read | The key names the member. |
| A destructuring assignment, `({ a } = value)` | the pattern's key reads the member | no read | tooling/src/unwired/graph/roles.ts states the pattern invariant. |
| A member a library reads: a `declare module` augmentation of a library interface, or a type that fills a library slot | read by the library | `unreferenced` | A library slot names the field in its published declaration (tooling/src/unwired/graph/flows.ts). |
| A schema key nothing writes | `member-validated` | `never-written` when the key is optional and its home is written | A key only a parse fills validates outside input. |
| A read by a package-root file such as a token build script | a use when every manifest's build, or a published package's prepare, runs the file or imports it through the pnpm-run closure (tooling/src/unwired/graph/roots.ts `shippedScripts`); a private package's prepare ships nothing | a use: its production pattern takes `packages/<package>/*.ts` | D357: a script whose output ships is the product's. |
| An optional member of a type a production parameter is annotated with | no `member-read-only` row: a caller may leave it unset | the same rule, but some aliased homes are missed | The graph resolves the annotation through import aliases (tooling/src/unwired/graph/build.ts `#parameterHomes`). |
| An interface member that redeclares a member of a type it extends | a read of either reads the other; a write carries neither way | the same | A subtype value can reach a base-typed reader (tooling/src/unwired/graph/build.ts `#overrides`, carried in tooling/src/unwired/graph/analyse.ts `roleLinks`). |
| A value handed to `Object.entries`, `Object.values`, `Object.assign` or `structuredClone` | reads every member | the same | The platform reads each member's value (tooling/src/unwired/graph/keys.ts `#reflectiveReads`). |
| A value handed to `Object.keys` or a `for…in` loop | a key use of every member, as an `in` test is: a member the product only writes stays `member-write-only`, and `Object.keys` still sends the value | reads every member | The platform lists names and reads no value (tooling/src/unwired/graph/keys.ts `#reflectiveReads`). |
| A lookup keyed by a parameter no caller narrows | reads the members the key's own literal type names | the same | The key type bounds the lookup (tooling/src/unwired/graph/keys.ts `finish`). |
| A schema bound under a `z.ZodType<T>` annotation, or returned by a `z.lazy` arrow | twins its keys with `T`'s members | the same | The annotation checks the schema as `satisfies` does (tooling/src/unwired/graph/sites.ts `checkedSchema`, `zodWrappedSchemas`). |
| A plugin contract member the SDK publishes | listed as received, with the SDK line, and judged by nothing | the same | Guests read it outside the tree (tooling/src/unwired/graph/analyse.ts `Analysis`). |
| A key beside a spread, `{ ...value, key }` | writes its member, but the copy builds no home: its home's optional members still report only when a build writes it | the same | The value arrives with the copy (tooling/src/unwired/graph/state.ts `copyOnlyWrites`). |
| A binding or literal under `satisfies T`, such as `defs satisfies Record<Task, TaskFields>` | fills `T` as a slot, and a read of its members reads `T`'s, at any depth | the same | The compiler holds each member to the checked one (tooling/src/unwired/graph/flows.ts `#checkedPairs`). A zod schema twins instead. |
| An array spread, `[...entries, ...offs]` | each spread list fills the array's element type, as a list argument does | the same | tooling/src/unwired/graph/sites.ts `copyFlowSite`. |
| The input of a tRPC `infiniteQueryOptions(input, …)` call | writes the input's `cursor`, and no other member | the same | TanStack Query fills the cursor from `getNextPageParam` on every page (tooling/src/unwired/graph/slots.ts `pagedWrites`). |
| A value a call's type argument is inferred from, such as `split(rows)` for `split<Room extends Candidate>(items: Room[])`, and a type parameter of ours handed to another generic | fills the callee's constraint as a flow: the body's reads through the constraint reach the value | links the value to the constraint | tooling/src/unwired/graph/constraints.ts `inferredPairs`. An explicit type argument stays a key use. |
| Two instances of one generic, such as `Options<Input>` into `Options<NominateVars>` where `V` is only a mutation function's parameter | each type argument pairs by its parameter's variance: forward, backward, both, or forward when unused | pairs the vars twin with the router input | The checker exposes no variance, so a polarity walk over the declaration measures where a value moves (tooling/src/unwired/graph/variance.ts). A method's parameter and a key position move no value. |
| The unread member of a one-key tRPC mutation output | listed as acknowledged, apart from the judged rows | the same | The key is the procedure's whole answer (tooling/src/unwired/graph/judge.ts `acknowledgements`). |
| A literal checked by `satisfies T` and handed into an opaque slot, such as `render({ … } satisfies View)` | sends `T`'s members where the value goes | the same | The checked shape is what leaves (tooling/src/unwired/graph/flows.ts `#checkedTypes`). |
| A value handed to an in-tree body that only tests, voids or drops it on every path, itself or through a helper it calls | no escape: nothing receives it | sends nothing | tooling/src/unwired/open-sends.ts `sendChase`. A body that returns, stores or passes the value on along any path keeps the escape. |
| A value handed into a slot with a string index signature, such as an `Entry` into a `LogRecord` with `[field: string]: unknown` | pairs the members the slot names; each other member is sent, nested members too, where the value goes | the same | tooling/src/unwired/graph/flows.ts `#indexedEscapes`. |
| A value inside the provider backends that no other destination takes | sent to `provider` only when the value at its site reaches a request the backends make, and received where a doc names the member; a value nested in a reaching literal takes the destination of the call the literal goes to | the same | tooling/src/unwired/open-sends.ts `providerReach`; the graph chases each escape from the value at its site, at any depth of the flow walk (tooling/src/unwired/graph/flows.ts). |

Classes still open:

- A member of a `declare class`, such as a mint class that brands a type, has no run-time presence either. It reports `member-sent-only` or `member-untouched` today.
- A member of a type that exists only to name a type error, such as the members of `NamesEvery` in packages/kit/src/guards/index.ts, reports `member-untouched`.
- A computed key built from a runtime symbol (`{ [token]: true }`) writes nothing, as in the fields scan.

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
6. A TanStack form path: the form type's first alias type argument is the data type, and the dotted path walks it segment by segment.

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
- The client build skips the React Compiler under the command. The compiler lowers source branches into other shapes and adds memo-cache branches, so no compiled branch maps soundly to a source branch. Behaviour only the compiler's memoisation produces does not run in a coverage build.
- A CT or e2e pass or failure under the command is not a test verdict. The compiled suites stay the verdict.
- The report gives each suite's matched and unmatched hits and the matched share of each kind. Read the share before you judge an unexecuted entry in a file that suite ran.
- Suites run one after another, never side by side. The report records the peak memory of each suite's process tree and of the merge.
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
