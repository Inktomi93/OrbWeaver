---
kind: review
status: active
updated: 2026-09-08
---

# tRPC type boundary: supported alternatives and recommendation

## Recommendation

Keep the server-derived router type in the server for this application. Orbweaver is using tRPC's current documented architecture, and there is no first-party contract generator or high-level contract-first API in the installed/current release that removes this dependency for free. Tightening and accurately describing the existing type seam is worthwhile; moving its alias into `kit`, `contracts`, or a facade package does not improve its compiler boundary.

A genuinely independent, generated client-router declaration is technically possible. It is the right alternative if independent client builds, distribution to another repository, or measured type-check/editor cost becomes a requirement. It should be a dedicated generated API-type artifact, derived from the server's authoritative router, with no server source references. It should not enter `kit`, and it should not make the existing isomorphic contracts package acquire the server's type closure. Today it adds a generator, portability repairs, freshness/watch ordering, and a substantial equivalence proof to replace one intentional dependency. That is a worse trade for the stated one-app, source-consumed setup.

This recommendation is about package/type dependencies. It does not review or propose changes to authentication, session behavior, middleware policy, or the wire transport.

## Evidence boundary

Inspected checkout: `codex/world-gate-integration`, HEAD `1eb70fdc7da3628141dd0df60ffab6bf6ab7de16`. The worktree has concurrent forms/world/config work. The tRPC source modules and package manifests cited here were unchanged against HEAD when checked. All experiments wrote only under `/tmp/orb-trpc-walled-20260908`; this report is the only repository file written by this investigation. No board changes, commits, installs, or server requests were made.

Installed packages: `@trpc/server`, `@trpc/client`, and `@trpc/tanstack-react-query` are all **11.18.0**; classic TypeScript is **6.0.3**, the native compiler behind `scripts/ts7.cjs` is **7.0.2**, dependency-cruiser is **18.1.0**. GitHub's latest tRPC release is also [v11.18.0, published June 18, 2026](https://github.com/trpc/trpc/releases/tag/v11.18.0). Current documentation and upstream discussions were checked September 8, 2026.

The mixed legacy/`defineGate` loader migration is separate work. No whole-tree gate result was used to judge this architecture.

## What tRPC recommends, and what people actually do

| Evidence | What it establishes | Consequence here |
| - | - | - |
| Current official [router documentation](https://trpc.io/docs/server/routers) and [vanilla client setup](https://trpc.io/docs/client/vanilla/setup) | Export `type AppRouter = typeof appRouter` from the server and import it with `import type` in the client. | The present mechanism is the supported default. Runtime erasure is the promise; compiler independence is not. |
| Maintainer Julius Marminge's [reply on the exact independence request](https://github.com/trpc/trpc/issues/3798#issuecomment-1630693109) | Recommends putting the API package in client `devDependencies` when only its types are needed. | Orbweaver already follows that recommendation. |
| Creator Alex/KATT's [answer about separate applications](https://github.com/trpc/trpc/discussions/2496) | Backend types can be published as a package and consumed by clients. The surrounding discussion demonstrates declaration emission. | A generated/published type artifact is legitimate tRPC usage, but this is distribution guidance, not an automatic context-stripping API. |
| Upstream [request #3798](https://github.com/trpc/trpc/issues/3798), closed January 14, 2025 as not planned | The proposed `defineRouter`/`defineQueryProcedure` interface-first API was not adopted. KATT separately [demonstrated a procedure shape checked with `satisfies`](https://github.com/trpc/trpc/issues/3798#issuecomment-2072665476). | Do not invent the requested helpers. Low-level type construction is possible; a ready-made contract-first workflow is absent. |
| Current [create-t3-turbo API root](https://github.com/t3-oss/create-t3-turbo/blob/main/packages/api/src/root.ts) and [React client](https://github.com/t3-oss/create-t3-turbo/blob/main/apps/nextjs/src/trpc/react.tsx) | A real monorepo puts the router in `packages/api` and imports its derived type in a client application. | A separate API package is a common ownership arrangement. It still derives the type from the router implementation. |
| Community [discussion #6980](https://github.com/trpc/trpc/discussions/6980), including December 2025 and May 2026 replies | Recommends extracting `packages/api`, source exports, and client type-only imports/devDependencies. | Community agreement on package organization does not imply a compiler-closure cut. |

The maintainer answers above are distinguished from community examples deliberately. An old contributor's personal opinion is not a current team commitment. The current exported API and installed source are the stronger evidence about what can actually be used now.

## The actual Orbweaver seam

The type chain is:

```mermaid
flowchart LR
  C[client data/trpc.ts] -->|import type AppRouter| B[server src/index.ts]
  B -->|export type| R[transport/trpc/router.ts]
  R -->|typeof appRouter| P[27 domain routers and root procedures]
  P --> T[procedure ladder and Context]
  T --> S[Services and domain front doors]
  S --> D[domain implementation, DB and infra source]
```

- `packages/server/src/index.ts:4` exports only `AppRouter` as a type. It directly names `transport/trpc/router.ts`, avoiding the much broader transport barrel.
- `packages/server/src/transport/trpc/router.ts:43` constructs the authoritative router; `:99` derives `AppRouter` with `typeof`. Its source-adjacent `no-inline-types` waiver is at `:98`.
- `packages/server/src/transport/trpc/trpc.ts:42` creates the tRPC root over `Context`, including the custom error formatter. `context.ts:42` defines `Services` through domain service types; `context.ts:87` defines the per-request context. Those domain front doors re-export both their service contracts and implementations.
- `packages/client/src/data/trpc.ts:8` imports `AppRouter`; `:20` derives `Trpc`, `:32` derives `TrpcReadError`, `:34` creates the React context, `:69` creates the HTTP/SSE client, and `:94` creates its non-hook options proxy.
- `packages/client/src/compose/app-singletons.ts:12` imports that wiring; `:14`–`:19` construct the single query client, wire client, and options proxy. `packages/client/src/main.tsx` supplies them to the provider stack and, through its DEV dynamic import, to the agent bridge.
- Four other source modules import the same type directly: `agent-plugin/index.ts:10`, `agent-rpg/index.ts:6`, `agent-handles/index.ts:24`, and `agent-seed/index.ts:32`. They use `TRPCClient<AppRouter>` for the same wire client. Their bodies make real proxy calls; they do not call server code locally.
- At the other end, `packages/server/src/entry/app.ts:308` mounts the fetch handler, `:312` supplies the same `appRouter`, and `:313`–`:325` constructs its context from the composed services.

A representative end-to-end inference chain is `routers/tag.ts:10` → input schema from `@orb/contracts/tag` → `ctx.services.tag.createTag` → `TagService`'s `Promise<TagView>` at `domain/tag/contract/service.ts:49` → the inferred router → `features/tag/hooks/use-tag-settings-mutations.ts:10`. The client uses the official `inferInput`/`inferOutput` helpers over `Trpc["tag"]["createTag"]`. It does not restate the endpoint's input or output. A less trivial example is `features/refinery/lib/reason-copy.ts:12`, where a result's reason union drives an exhaustive `Record` used for UI copy. An alternative must preserve that narrowing too.

The structural source-import sweep scanned **625 TS and 694 TSX client files**, finding the five type-only imports above. A literal source search corroborated the result. The trace is not merely a declaration/export inventory: construction sites, provider consumers, wire calls, and the mounted server handler were followed.

## Compiler coupling and runtime coupling are different measurements

### Native compiler closure

The shared `readCompilerPrograms` reader supplied the actual client compiler options. A scratch config inherited the client config and rooted only `packages/server/src/index.ts` plus `reset.d.ts` and `platform.d.ts`. This isolates what loading the one-type server barrel brings into a consumer program.

Native TypeScript 7.0.2 `--listFilesOnly` reported **3,789 files**. Its authored package closure was:

| Package | Source files |
| - | -: |
| server | 1,332 |
| db | 42 |
| contracts | 103 |
| kit | 52 |

The server population includes **1,100 domain, 135 infra, 52 transport, 24 foundation, 20 server-kit files, and its root barrel**. There are **82 `@types/node` declaration files**. A classic TypeScript 6.0.3 program using the shared reader's same options independently produced the same authored package counts; its total was 3,793 because compiler-library files differ.

This is an honest source dependency. `import type` does not prevent TypeScript from loading the module's imports, checking source bodies, following re-export barrels, or learning Node globals from referenced declarations. The server's own `tsconfig` does not become an isolated subprogram simply because the module lives in a different package.

### Runtime graph

Native dependency-cruiser, rooted at the real `client/src/data/trpc.ts`, produced **1,741 modules / 9,374 edges / zero rule violations**. The `@orb/server` edge resolves to `packages/server/src/index.ts` and is classified `type-only`. Reachability from `trpc.ts` was **1,724 nodes with type edges**, versus **189 after removing type-only edges**; the latter contained **zero `packages/server` or `packages/db` nodes**.

That proves the present seam has no runtime path into Orbweaver backend modules in this resolved import graph. It is not a new full production-bundle certification. The npm library `@trpc/server` is a separate subject: tRPC's client implementation legitimately imports shared runtime helpers from it. A ban on the string `@trpc/server` in browser output would be the wrong test; the application package is `@orb/server`.

### Existing enforcement is broader than the intended seam

`.dependency-cruiser.cjs:142`–`:149` prohibits client/backend runtime edges but permits **every type-only server/DB target from every client source**. `tsPreCompilationDeps: true` at `:781` ensures those type edges exist in the graph. The current test deliberately permits a type imported from an arbitrary server foundation file (`tests/tooling/dependency-cruiser.int.test.ts:129`–`:131`, asserted at `:376`). It does not enforce an AppRouter-only exception.

The source comments in `client/src/data/trpc.ts:4`–`:5` and `server/src/index.ts:1`–`:3` overstate resolver protection. A client-local native `createRequire(...).resolve()` successfully resolved both `@orb/server` and the runtime-bearing `@orb/server/transport/trpc` subpath. Development dependencies are installed and resolvable during development/build; their declaration does not prohibit value imports. Type syntax, the type-only root export, and the import gate are the relevant protections.

## Would putting the types in kit break ISO?

**Moving the existing alias would.** A type-only re-export from `kit` to `server` still creates the forbidden `kit → server` edge and carries the measured backend closure. `contracts → server` has the same problem. A wrapper's name or location cannot change the dependency of `typeof appRouter`.

**A standalone tRPC shape is not intrinsically Node-bound.** This was checked with current public exports, without `any`, casts, path aliases, or server source:

```ts
import type {
  TRPCBuiltRouter,
  TRPCDefaultErrorShape,
  TRPCQueryProcedure,
} from "@trpc/server";

export type Example = TRPCBuiltRouter<
  { ctx: object; meta: object; errorShape: TRPCDefaultErrorShape; transformer: false },
  { greet: TRPCQueryProcedure<{ input: string; output: string; meta: object }> }
>;
```

With the current kit compiler configuration, this scratch example checked successfully and loaded **83 files, zero Node declarations, zero DOM libraries, and zero Orbweaver source files**. This is a feasibility proof for a neutral router contract, not a proposal to maintain endpoint types by hand.

Two limits matter:

1. Adding the actual client-library types `TRPCClient<Example>` and `TRPCOptionsProxy<Example>` raised the scratch closure to **236 files**, including **82 Node declarations and three React declaration files**, still without DOM libraries. The router-contract artifact and the client-library integration have different declaration dependencies. Keep React/query-client aliases out of an ISO contract package.
2. Rooting the **real router** under the current kit compiler options also returned **zero diagnostics**, despite loading the backend and Node declarations. `types: []` controls automatic ambient inclusion; it does not ban declarations pulled through imports. Thus a DOM-less green alone is insufficient proof of ISO closure. Dependency direction and actual declaration membership remain necessary evidence.

Even a correctly generated neutral application API type belongs with the application's wire contract or in its own API-type package. `kit` owns domain-independent primitives; the complete application procedure vocabulary is not one. A dedicated artifact avoids imposing tRPC machinery on every existing `@orb/contracts` consumer.

## Branding does not require broadly unwalled client and server packages

The current package wall already has the correct intentional connection: client and server share the canonical IDs through `@orb/kit/ids`, and the client derives the server's API through `AppRouter`. A wall against implementation imports does not require a second set of ID brands.

The brand is declared once at `packages/kit/src/ids/index.ts:11`: a private `unique symbol`. `Branded<B>` at `:17` intersects `string` with a property keyed by that symbol, and the entity aliases derive from it (`TagId` at `:168`). `@orb/contracts/tag` imports the canonical ID at `:7`, places it on `TagView.id` at `:62`, and the server service returns that same view. Neither side declares a separate client or server `TagId`.

A native TS7 probe through the **actual** `TRPCClient<AppRouter>` proved that `tag.updateTag`'s returned `id` is assignable to canonical `TagId`, and returning it as `CharacterId` fails with **TS2322**, specifically the shared `[brand]` property's incompatible `"tag"` and `"character"` values. This checks the composed inference and serialization type, rather than assuming all brands survive all serializers. The installed tRPC serializer preserves JSON-compatible types; the relevant implementation is `clientish/serialize.ts:36`.

At runtime the ID is still a string. `declare const brand` creates no runtime symbol; the phantom property is not sent in JSON or rehydrated in the browser. `castId` at `:272` changes only the compiler's view. `brandedId` at `:278` validates a nonempty string and advertises a branded output; `typeIdSchema` at `:314` additionally validates the actual TypeID shape/prefix. A compile-time brand is neither row existence nor authorization nor a runtime authentication claim. Runtime validation remains the server boundary's job.

Input and output typing must also be separated. tRPC derives a procedure's **pre-parse input** and **post-parse output**. The actual tag probe accepted a `CharacterId` as the `tagId` input, because that router uses `brandedId<TagId>()`, whose `z.ZodType<T>` declaration leaves the input generic as `unknown`. It still rejected treating the returned `TagId` as `CharacterId`. `typeIdSchema` explicitly types pre-parse input as `string`, also deliberately wider than its branded output. Accepting a differently branded string at an intentionally plain-string wire input is not by itself a defect. The distinction is independently documented by `tests/kit/ids/index.test-d.ts` and exercised at runtime in `tests/kit/ids/index.test.ts`.

**Separate confirmed input-typing concern:** the same native tag-client probe also accepted **`tagId: 42` and `tagId: { wrong: true }`**, while the actual `brandedId()` parser rejected both at runtime and accepted a nonempty string. Thus this helper's `z.ZodType<T>` annotation erases known string-input information, not only nominal branding. The adjacent `typeIdSchema` header at `ids/index.ts:299`–`:309` explicitly distinguishes precisely this `unknown`-versus-`string` problem from intentional brand erasure, and its type test pins `string`. The existing `brandedId` type test pins only its output. This is a bounded P2 static-contract concern for the orchestrator to track separately; it is not a runtime validation bypass, a reason to remove package walls, or permission to change validation in this investigation.

Generation introduces a real branding hazard if it copies the brand declaration. A fresh private `unique symbol` in an API artifact is a different type identity, even if named `brand` and paired with the same `"tag"` literal. The safe generated spelling refers to the canonical exported alias, such as `import("@orb/kit/ids").TagId`, with both source and generated consumers resolving the same canonical package identity. Do not inline a new symbol, widen the field to `string`, or add casts to bridge an incompatible copy. TypeScript explicitly ties each [unique symbol identity to its declaration](https://www.typescriptlang.org/docs/handbook/symbols.html#unique-symbol).

The real emitter's TS4023 refusal is useful evidence here: it encountered the private brand while trying to publish an inferred structural type. It is a portability problem to solve while preserving the canonical alias, not a reason to weaken the brand. A declaration generator must prove both same-brand compatibility and wrong-brand rejection across the source/artifact seam. Keeping the existing source-derived API avoids introducing that additional identity problem.

Therefore: retain the client→server **type contract**, shared `kit` ID ownership, and runtime/package implementation walls. Broadly allowing client imports of server services, DB code, or private types adds no branding consistency.

## Current APIs that look relevant

| API | Actual behavior in 11.18.0 | Does it remove this dependency? |
| - | - | - |
| `inferRouterInputs` / `inferRouterOutputs` | Project input/output maps from the supplied router. Outputs account for the transformer/serialization configuration. [Official inference docs](https://trpc.io/docs/client/vanilla/infer-types). | No. A source alias still names `AppRouter`; the helpers do not materialize an independent declaration. The maps alone also omit procedure kind and other client requirements. |
| `inferInput` / `inferOutput` | Project one decorated query/mutation's types. Already used throughout this client. [TanStack usage](https://trpc.io/docs/client/tanstack-react-query/usage#inferring-types). | No. They project from the already typed options proxy. They are useful consumer ergonomics, not a package boundary. |
| `inferTRPCClientTypes` | Public projection of the root `errorShape` and `transformer`, implemented by `clientish/inferrable.ts`. | No. It does not contain the procedure tree. |
| `TRPCClient`, `createTRPCClient` | Consume an `AnyRouter` and decorate its record with query/mutate/subscribe functions. | No. There is no URL-driven type discovery. Installed `client/src/createTRPCClient.ts:37` and `:160` still require the router type. |
| `createTRPCContext` / `createTRPCOptionsProxy` | Consume `AnyTRPCRouter`; the proxy supports a remote client or a server-local router/context. | No. The server-local option is another execution path, not a pure remote-contract extractor. Installed TanStack `createOptionsProxy.ts:283` and `:338`. |
| `TRPCBuiltRouter`, `TRPCQueryProcedure`, `TRPCMutationProcedure`, `TRPCSubscriptionProcedure` | Public exported building blocks that can express an independently authored/generated router shape. | **Technically yes, if the shape is independently supplied.** The missing work is its authoritative derivation and proof. These types are not a contract generator. |
| Router factories, polymorphic decorated procedures, `satisfies` | Reuse router behavior or accept a compatible subset in a component. The new TanStack integration's [upstream rationale](https://github.com/trpc/trpc/discussions/6240) addresses hook composition and React Compiler. | No automatic closure cut. A source-derived factory return type still loads the factory's dependencies. |
| `lazy` / merged routers | Defer runtime router construction or compose routers. | No compiler isolation: the return/router type still must be inferred from the referenced module. No benefit to this problem. |

The public exports were read from installed `packages/server/node_modules/@trpc/server/src/@trpc/server/index.ts`. The actual router representation was read in `unstable-core-do-not-import/router.ts:144`–`:178`; the client and TanStack decorators were read in full. Public aliases mean an implementation need not import private subpaths merely to spell a procedure type. They do not make a userland generator a first-party supported feature.

## Alternatives and their actual price

| Alternative | Removes server source from client compilation? | Maintenance / inference consequence | Judgment |
| - | - | - | - |
| Keep current `typeof appRouter`, enforce its narrow type seam | No | Immediate inference and no generated state; accept and report the compiler dependency honestly. | **Recommended now.** |
| Re-export it from `kit`, `contracts`, or a facade | No | Kit/contracts invert the package direction; a facade merely adds an edge. | Reject. |
| Extract existing tRPC code into `packages/api` | Usually no | Real ownership separation if several applications use it; its context/service imports still bring backend types. A package that depends on server while server imports its router creates a cycle. | Not useful solely to make this exception disappear. |
| Publish ordinary server declarations | Can remove implementation `.ts` files if the complete declaration dependency closure is packaged | Still carries context/service declarations unless explicitly reduced; needs a build and fresh package artifact. | Valid distribution approach; currently blocked by actual emission errors below. |
| Generate a self-contained neutral client-router shape | **Yes**, if no server/DB/source references remain | Preserve all 424 procedures, input/output correlations, procedure kinds, error shape, transformer and streaming semantics; generator/watch/freshness proof becomes load-bearing. | Best genuine isolation option if isolation is a requirement. Dedicated artifact preferred. |
| Contract-first router factory in a lower package | **Yes**, if its entire port/schema closure is lower and environment-neutral | Procedure definition becomes the authority; implementations are injected and checked. Must relocate authority, not add a second endpoint list. Existing `Services`, sockets, presence and error handling do not have this boundary today. | Meaningful architecture migration, not a tRPC option switch. Not justified by this seam alone. |
| Switch RPC framework / introduce OpenAPI code generation | Depends on replacement | Reworks query keys, errors, batching, subscriptions, tests and instruments across the application. | Far larger than the problem; no recommendation to do this. |

Explicit `.output(schema)` validators can strengthen a particular wire result or reduce inference complexity, but adding them everywhere is not a compiler boundary: the router module and context still participate. They also change runtime validation/serialization behavior. They should not be introduced as a cosmetic purity fix. [Official validator documentation](https://trpc.io/docs/server/validators).

### Ordinary declaration emission was tested, not assumed

The real router was emitted with both classic TypeScript and the native compiler. The native experiment inherited the actual client options, enabled `declaration`/`emitDeclarationOnly`, explicitly set the repository `rootDir`, and used an external scratch `outDir` with `noEmitOnError`.

It failed with eight declaration diagnostics:

- **TS2883:** `TrackedData` cannot be named portably, for `appRouter`, `createCaller`, `chatRouter`, and `streamRouter`.
- **TS4023:** the private `brand` from `packages/kit/src/ids/index.ts:11` cannot be named in `appRouter`, `createCaller`, `rpgRouter`, and `workloadsRouter`.

The classic emitter independently refused the root router with the same two classes. No declaration artifact was produced for use by a client. These errors do not make generation impossible; they make “just turn on declarations” an unproven migration, with real output-type/brand/subscription portability work first. No visibility change to the ID brand is recommended as a shortcut.

A separate tiny native emission control succeeded. Its generated router declaration retained `import type { Context } from './context.ts'` and `ctx: Context` inside `TRPCBuiltRouter`. This proves ordinary declaration emission is not automatic client-context minimization. Bundling declarations can remove physical source-file dependencies; it does not automatically erase semantic context references or external package dependencies.

### What an acceptable generated artifact would owe

1. Derive names and procedure types from the authoritative router through the shared compiler reader. No manually maintained endpoint dictionary, duplicate zod schema, runtime router boot, or textual regex serializer.
2. Emit a package-local router-shaped declaration whose imports are only approved public type dependencies. No `@orb/server`, `@orb/db`, server `#` imports, ancestor paths, or private hashed tRPC declaration paths. Prove it from a standalone consumer outside the repository ancestry; #1623 makes a worktree-local exports miss insufficient evidence.
3. Keep raw procedure outputs versus client-transformed outputs straight. `inferRouterOutputs` is already transformed; a generator must not accidentally run a second interpretation over that result. Preserve optional/void inputs, zod input/output differences, branded identities, discriminated results, custom `data.reason`, async iterable subscriptions and tracked-envelope behavior.
4. Prove the client-visible surface equivalent for **all** procedures, using mapped/exhaustive type checks derived from the real router, and planted additions/removals/type changes that invalidate a stale artifact. A toy `greet(string): string` is insufficient.
5. Make a missing, stale, or failed artifact stop the consumer check/build. A server-only edit must refresh it before the client claims green. Never publish the last successful declaration after a failed generation. Preserve source ownership in the world's report; a generated mirror is not a second authored truth.
6. Keep Knip and the existing procedure-consumer lens attached to the authoritative production sources. Do not mark every generated export or every server module as an entry to quiet dead-code reports.
7. Run the real query-key/invalidation, mutation, query-boundary, error, and SSE behavioral floors after any cutover, plus a production bundle graph proving no application-backend runtime import. If source routers change, the existing router/cross-tenant floor still applies through its proper owner.

This is manageable engineering when the isolation has a concrete payoff. It is more maintenance than the present intentional seam.

## Dead-code visibility and the small cleanup worth doing

`knip.ts:112`–`:116` relies on the server's package export map to find entry roots; that map is already broad (`packages/server/package.json:11`). Adding a broad `contracts/api` or generated `exports` facade would not prove procedures are used. A tRPC procedure is a property behind a proxy, not a named import in the browser.

Orbweaver already has the appropriate separate lens: `tooling/src/ast/ops/wiring.ts` enumerates server procedures and matches client property/indexed-type consumption. The current `pnpm ast unwired --json` run enumerated **424 procedures**, scanned **7,321 files**, and returned **15 candidates**, with `status=complete`. Those candidates were not adjudicated as defects here; the point is that the existing architecture retains visibility which a new generic registration/generation shape would need to preserve. The lens is syntactic at its procedure-consumption edge, not an execution proof, and dynamic/computed usage remains a limit.

The smaller improvement is to make the *direct* type dependency accurately bounded. Client wiring could own a single reusable `TRPCClient<AppRouter>` alias, so the four dev bridges consume that client-owned type rather than importing the server directly. An exact resolved AppRouter-only rule could then enforce that seam and prohibit unrelated server/DB type reaches. This improves ownership and stops expansion; it intentionally does **not** pretend to shrink the transitive compiler closure. The arbitrary-foundation type-only fixture would need to become a rejection fixture, while the actual root AppRouter import remains the positive control.

Correct the resolver-physics comments with that change. A type-only root subpath/export condition can provide another resolver distinction if there is a reason to introduce one, but the server's broad export map also serves tools/tests and internal package consumers; changing it belongs to a measured export-surface task, not to this recommendation by implication.

## Read set, proofs, and limits

Full source reads covered the client tRPC module, its data barrel and singleton composition, all four direct AppRouter-consuming dev bridges, the server root and transport barrels, router, procedure ladder, context, representative tag router/service/front door/views, the no-inline-types policy, Knip configuration, and the procedure-wiring lens. The shared compiler reader's program/config construction was also read. Tests read in full: `tests/server/transport/trpc/trpc.test.ts`, `tests/client/data/invalidation.test.ts`, `tests/tooling/dependency-cruiser.int.test.ts`, `tests/tooling/dependency-cruiser-worlds.int.test.ts`, and `tests/kit/ids/index.{test,test-d}.ts`. Governing reads included the constitution and ledger, package/type/transport law, client layering/communication rules, and documentation law. Large unrelated server domains were measured in the compiler graph, not substantively reviewed.

Executed proof: native/classic compiler closure, native DOM-less compatibility, neutral public-router-type compatibility, native/classic declaration emission refusal, successful declaration-retains-context control, canonical brand compatibility/wrong-brand rejection through the real client, real resolved dependency-cruiser graph, native package resolution, structural client-import census, and the existing procedure-consumer census. Existing behavioral suites were read for their contract and not rerun: no product behavior was changed. No full production build or live browser/server drive was performed.

Scratch receipts: `/tmp/orb-trpc-walled-20260908/{graph.json,summary.json,closure-files.json,native-files.txt,native-decl.log,iso-source.log,unwired.json,unwired.stderr}` and `neutral/` configs/source/declarations. The declaration and neutral controls can be reproduced with `pnpm exec node scripts/ts7.cjs -p <scratch-config>`; dependency evidence used `pnpm exec depcruise packages/client/src/data/trpc.ts --config .dependency-cruiser.cjs --output-type json`. Every Node command used pnpm's workspace heap settings.

Unproven: a complete portable declaration artifact for the actual 424-procedure router; full equality of a minimized contract across streaming/brand/error cases; editor-latency savings from such an artifact; whether that benefit exceeds the generator's ongoing cost. No claim that a generator is impossible, or that zero emitted runtime code means zero type coupling, is made.

Issue-summary paragraph: retain the current server-owned inferred router contract; do not move its source alias into kit/contracts. Current official guidance matches this architecture, and the independent-router feature request remains not planned. A pure generated router shape is feasible through public types but would be a new maintained derivation, presently preceded by concrete TS2883/TS4023 portability repairs. Optional follow-up is a narrowly enforced direct AppRouter seam and correction of the devDependency resolver claims. Separately, `brandedId<T>` widens known string input to `unknown`: native tRPC callers accept numbers/objects that its runtime parser rejects; track that bounded P2 typing concern without confusing it with a nominal-brand requirement. The 15 procedure-liveness results remain unadjudicated candidates.
