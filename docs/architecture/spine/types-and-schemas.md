# Orbweaver — types & schemas: one home, one direction, no inline

> **Status: planning (cross-cutting spine).** This is the §7.4 thread the per-domain fanout DEFERS to. A
> shape's "home" is ambiguous today — a row lives in `db`, gets re-declared in `_shared`, each domain has
> its own `contract/`, and the client needs some shapes for client-side validation — so shapes duplicate
> and inline `type`/`interface`/`z.object` sprout in `verbs/`, `persistence/`, `service.ts`, transport,
> and client components. This doc states the **one-home-per-shape rule**, defines the exact
> **`no-inline-types`** gate that enforces it, and carries the grounded census of leaks the gate must
> burn down. It generalizes `reports/shared-dissolution.md` (the per-symbol home map) and the §7.4
> sections every domain doc already carries. Pairs with §7.5 (string-union dispatch — the runtime
> complement to this static-shape rule) and §7.3 (`spine/serialization-core.md` — the duplicate-shape triangle
> is the serde core's concern). `_FANOUT-BRIEF.md` §7.4 + §8.2 are the authoritative inputs.

## 0. The principle — one home per shape, derived by who needs it, flows DOWN only

A shape has **exactly one home**, and that home is **derived mechanically from its widest consumer**, not
chosen by where it was first typed. Once placed, it flows **down the package cake**
(`kit ← contracts ← db ← server ← client`) and **down the server tier list**
(`entry → transport → domain → infra → foundation → kit`). A shape is never re-declared at a consumer; a
consumer **imports it down**. This is the type-level face of the one hard constraint (`_FANOUT-BRIEF.md`
§2): a placement that would require an **upward** import is automatically wrong.

> The rule reads in one direction: *who is the widest consumer?* DB only → the row lives in `db`. Server
> **and** client (or two domains) → `contracts`. One domain only → that domain's `contract/`. Client only
> → client. A pure primitive everyone leans on → `kit` (the bottom). There is no sixth answer, and there
> is **no `_shared` / catch-all `shared/`** to absorb the undecided — every shape resolves to one of the
> five rows below or it is a leak.

This is why `shared-dissolution.md` is the FIRST deliverable: it is this rule already applied, symbol by
symbol, to neo-tavern's drawers. This doc is the generalization the per-domain readers check their slice
against rather than re-deriving "where does `AssembleContext` go."

## 1. The home-per-shape-kind table (the canonical derivation)

| Shape kind | Home | Consumers (down only) |
|---|---|---|
| **DB row** | `@orb/db` (drizzle table → `$inferSelect` / `$inferInsert`) | server persistence |
| **cross-boundary wire** (server↔client, or domain↔domain) | `@orb/contracts` (zod + inferred TS, namespaced) | server, client, other domains |
| **domain-internal** (params / results / views / errors) | that domain's `contract/` | only that domain |
| **client-only view** | client | client |
| **pure primitive shape** | `@orb/kit` | anyone (it's the bottom) |

Two derivation sub-rules the domain docs lean on:

- **The kit↔contracts tuple rule** (`shared-dissolution.md` §7.5): a **const tuple** shared by a pure
  `kit` resolver AND a zod schema lives in `kit`; the `z.enum(TUPLE)` schema lives in `contracts` and
  **imports the tuple downward**. Applies to `ENTRY_SCOPE_MODES` / `ENTRY_INJECTION_ROLES` /
  `ENTRY_POSITIONS` (persona.md already does this for `PERSONA_DESCRIPTION_POSITIONS`). The inverse —
  kit importing the contracts schema — is illegal (`kit` has zero contracts deps); the executor stays
  generic via a kit-local structural input (`contracts/regex.RegexScript satisfies RegexScriptInput`).
- **The DB-row read-seam rule**: a row TYPE (`typeof characters.$inferSelect`) is derived in
  `persistence/` from the `db` schema and used there — that is **not** a leak (it is the schema's own
  inferred type, consumed at the layer that owns persistence). A *narrowed* read shape stays a local,
  non-exported alias in `persistence/queries.ts`. What is RED is re-spelling the row as a fresh
  `interface` somewhere up the stack instead of importing `db`'s inferred type down.

**kit-purity is LOCKED** (`shared-dissolution.md` §0, Nate-confirmed 2026-06-25): `@orb/kit` MAY depend on
isomorphic side-effect-free npm (zod, typeid-js, luxon, remend); it may NOT import `node:*`, `@orb/contracts`,
`@orb/db`, or any domain. So "pure primitive shape → kit" means *isomorphic-pure*; a server-only pure shape
(e.g. the `node:vm` regex guard's types) is `@orb/server/kit`, never `@orb/kit`.

## 2. The gate — `no-inline-types` (exact)

> **No exported `type` / `interface` / `z.object` (and no structural `as` cast) may be declared OUTSIDE
> one of the four sanctioned homes: a `@orb/db` schema file, `@orb/contracts/*`, a domain's `contract/`
> directory, or `@orb/kit` (incl. `@orb/server/kit`).**

A shape declared in `verbs/`, `persistence/`, `service.ts`, transport (tRPC routers / job workers), or a
client component is **RED**.

**Checked (RED):**
- Any `export type` / `export interface` / exported `z.object(...)` / exported `z.enum(...)` whose file is
  outside the four sanctioned homes.
- A `ReturnType<typeof create...>` or `Awaited<ReturnType<...>>` used as a **named, exported** type — it
  is an invisible structural type that couples the consumer to an implementation. Promote to an explicit
  `export interface` in the proper home. (e.g. connection's `CatalogModels =
  Awaited<ReturnType<typeof catalog.rawModels>>` → an explicit `CatalogModelEntry[]` in
  `@orb/contracts/connection/catalog.ts`.)
- A structural `as` cast that *invents* a shape at a read/wire seam instead of zod-parsing into a
  contract type (the `r.model as string` DB-read anti-pattern; the model is `parseProviderMetadata`-style
  parse-at-the-seam — §8.4).

**Exempt (GREEN):**
- A **truly-local, non-exported** alias inside one verb/function — e.g. search.md's
  `type Cand = CorpusHit & { hub, text, … }` in `verbs/corpus.ts`: it extends a contract type, is used in
  one verb, and is never exported. Local narrowing is fine; the moment it is exported or re-used across
  files it must move to `contract/`.
- A **DB-row `$inferSelect` / `$inferInsert`** type derived in `persistence/` from the `db` schema (it is
  the schema's own type, at the persistence layer — §1).
- `as const` literals, and the **single sanctioned `castId` brand cast** in `kit/ids` (biome
  `no-loose-id-cast` already governs branded ids).

**The `context.ts` rule (called out across nearly every domain doc — make it a clause of this gate):**
every domain's DI bundle is an **explicit `export interface <Feature>Context`**, declared at the top of
`context.ts` (or `contract/service.ts`), **never** `ReturnType<typeof create<Feature>Context>`. The
ReturnType form is the invisible-type anti-pattern: it makes the DI surface unreadable and silently
re-shapes every consumer when the factory changes. Verified present as a §7.4 line in connection,
credentials, character, search, embeddings, import, settings, and preset docs — this gate is the single
place it is defined once.

**Enforcement tier:** lint-time — **dependency-cruiser** (file-location rule: an `export` of a type/schema
node outside the four home globs is a violation) + **biome** (the `ReturnType`-as-named-export and the
structural-cast lints) + **compile-time** for the brand casts (TypeID branding is already biome-plugin
enforced via `no-raw-id` / `no-loose-id-cast`). This is the enforced form of `structure.md` §7's
`types-in-contract` gate, widened from "feature types live only in `contract/`" to the full five-home
rule. A prose-only boundary is not a placement (`_FANOUT-BRIEF.md` §2.3) — this gate is the enforcer.

## 3. The census of leaks (grounded — `_FANOUT-BRIEF.md` §8.2)

The type-census AST agent counted **1312 shape declarations** across neo-tavern's `server + shared + db`.
Three distinct workloads fall out, and they are NOT the same job:

### 3a. 57 cross-boundary leaks → `contracts` (a MOVE)

Exported shapes living outside a proper home that **two boundaries** consume. Top by reference count:
`RoleClients` (19 refs), `Cas` (12), `SecretBox` (11), `ChatBusEvent` (10), `MemoryConfig` (10). These are
wire shapes stranded in `_shared`, `providers/contract/*` loose files, or a service file — each → its
`@orb/contracts/*` namespace (`shared-dissolution.md` §4 carries the per-symbol destinations:
`RoleClients` → `contracts/role-clients` after the provider result contracts move first; `ChatBusEvent` /
`WiBusEvent` → `contracts/chat` / `contracts/world-info`; `MemoryConfig` → `contracts/settings`). **The
client hand-redeclares server zod** in three confirmed spots — custom-OpenAI metadata, asset result,
browse filter — these collapse to the single contract schema the client imports down (the
`AssetKind` / `StoredAsset` correction in `shared-dissolution.md` §5 is the worked example: one wire union
re-spelled inline across the db enum, the http route, the client, and the domain → one
`@orb/contracts/assets`).

### 3b. 181 over-exported locals → DOWN-SCOPE (a SEPARATE workload, NOT a move)

This is the count the gate must not confuse with the leaks. These are shapes that are **in the right
package** but **exported wider than any consumer needs** — a domain-internal type exported from the front
door that nothing outside imports, a `persistence/` helper type exported when one query uses it. The fix
is to **remove the `export`** (or drop it to a file-local), not to relocate the shape. It is a mechanical
down-scoping sweep run AFTER the moves, gated by the same `no-inline-types` file-location rule once the
shape is no longer exported. **Do not fold it into the 57-leak move list** — conflating "export too wide"
with "wrong home" is how a cleanup balloons. (181 is the over-export tax; 57 is the home-error tax.)

### 3c. 31 duplicate-shape clusters → COLLAPSE to the canonical contract shape

One concept typed independently in N places because parse / serialize / runtime never agreed on a contract.
The deepest is the **import↔export↔engine triangle** — the same shape re-declared because the three legs
never shared a contract:

| Concept | Re-declarations | Collapse to |
|---|---|---|
| world-info entry | **6×** | `@orb/contracts/world-info` (entry create/update + `entryMetadataSchema`) |
| chat message / variant | **5×** | `@orb/contracts` canonical `messageRole` + the chat message contract |
| character card | **4×** | `@orb/contracts/character` — the ONE fully-modeled card (§7.3 LOCKED) |

Collapsing the triangle is §7.3's concern (`spine/serialization-core.md`): import's tolerant `RawCard` reader
stays as an **input adapter that normalizes INTO the one canonical model**, not a parallel lossy shape;
the serde mappers (role bimap, WI-entry, card pair) are shared by import+export. This doc owns the *rule*
(one home, collapse the dupes); §7.3 owns the *card/serde execution*.

### 3d. Two grounded facts the gate inherits

- **Zero `enum`s anywhere** — every axis is a string-union (§8.2, confirmed). **Keep this** — it is the
  right call. Their runtime-dispatch discipline (one importable union + exhaustive `assertNever` /
  mapped-Record) is **§7.5's** job, not this doc's; §7.5 is the runtime-coupling complement to this
  static-shape rule.
- **Identity/principal DODGED the clustering** — `AuthContext` / `IdentityResolution` / `OwnerResolution`
  are the same concept under **different field names**, so the property-set clusterer missed them. They
  need a **manual reconcile** into the one `Principal` (§7.1), not a mechanical move — flagged so the gate
  doesn't false-green them.

## 4. Invariants (gate candidates)

1. **One home per shape, derived by widest consumer, flows down.** No shape declared at two homes; no
   consumer re-declares what it could import down. *(Enforcement: lint-time dep-cruiser file-location rule
   + resolve-time package deps — an upward import doesn't resolve.)*
2. **`no-inline-types`** — no exported `type`/`interface`/`z.object`/`z.enum` outside `@orb/db` schema /
   `@orb/contracts` / a domain `contract/` / `@orb/kit` (+`@orb/server/kit`). *(Enforcement: lint-time
   dep-cruiser + biome.)*
3. **No `ReturnType<>`/`Awaited<ReturnType<>>` as a named exported type** — promote to an explicit
   `export interface` in the proper home. *(Enforcement: lint-time biome.)*
4. **`context.ts` DI bundle is an explicit `export interface <Feature>Context`** — never
   `ReturnType<typeof create...>`. *(Enforcement: lint-time biome + the `feature-structure` gate's
   context.ts shape check.)*
5. **DB rows are `$inferSelect`/`$inferInsert` from `@orb/db`, consumed at `persistence/`** — never
   re-spelled as an `interface` up the stack; a narrowed read shape is a non-exported local.
   *(Enforcement: lint-time — an exported row interface outside `db` is a #2 violation; compile-time — the
   inferred type is the schema's truth.)*
6. **Read/wire seams parse into a contract type, they don't `as`-cast a shape into existence** — the
   `parseProviderMetadata` zod-at-the-seam pattern generalizes; `r.x as T` at a DB/wire read is RED.
   *(Enforcement: lint-time biome structural-cast lint + the existing brand lints.)*
7. **kit-purity LOCKED** — a "pure primitive shape" in `@orb/kit` imports no `node:*`, no contracts, no
   db, no domain (isomorphic-npm OK); server-only pure shapes are `@orb/server/kit`. *(Enforcement:
   resolve-time package deps + lint-time `kit-purity` dep-cruiser rule — no `node:*`/domain/contracts/db
   import, NOT no-npm.)*
8. **The 57 cross-boundary leaks land in `contracts`; the 181 over-exports down-scope in place** — two
   distinct workloads, never merged. *(Enforcement: the move set is gated by #2 reaching green; the
   down-scope set is gated by the same rule once the `export` is removed.)*

## 5. Open decisions

- **Exempt-glob precision for `no-inline-types`.** The dep-cruiser rule keys on file location; the exact
  globs for the four homes (esp. `@orb/server/kit` as a co-equal of `@orb/kit`, and whether a domain's
  `substrate/` may hold a non-exported helper type) need pinning at scaffold time so the rule doesn't
  false-positive a legitimate local alias.
- **`ReturnType` detection depth.** Banning the *named exported* `ReturnType` alias is clear; whether to
  also flag an *inline* `ReturnType<>` in a function signature (vs only named exports) is a strictness
  dial — start with named-exports-only, tighten if invisible types creep back.
- **The 181 down-scope sweep timing.** It is a separate workload — confirm it runs as a post-move codemod
  pass (`codemod-kit`'s `findImporters` to prove no external consumer before dropping each `export`)
  rather than hand-by-hand, and that it is NOT a scaffold-time blocker.
- **Identity/principal manual reconcile.** `AuthContext`/`IdentityResolution`/`OwnerResolution` →
  one `Principal` shape's home (`@orb/contracts/identity`) is owned by §7.1; confirm the seam so this
  gate's census doesn't re-flag the reconciled shape.
- **`jsonValueSchema` promotion.** Kept in `kit/json` as a generic primitive (`shared-dissolution.md`
  §10); promote to `contracts` only if it ever gates a wire input — a watch item, not a move.

## 6. Synthesis — where this sits in the spine

This is the **static-shape** half of the type discipline; **§7.5 is the runtime-dispatch half.** Together
they close the loop: §7.4 guarantees every union/shape has **one importable home** (no inline re-spelling);
§7.5 guarantees every string-union is **dispatched exhaustively** (a new member fails the build). The
`routing.source` pain is the worked pair — §7.4 says "one `ChatSource` union in `@orb/contracts/connection`"
(killing the 11 inline re-decls), §7.5 says "every switch over it is `assertNever`-gated." Neither alone
suffices: a single home with a non-exhaustive switch silently drops a variant; an exhaustive switch over a
re-spelled union still drifts.

**§7.3 (serde core) owns the *collapse* of the 31 duplicate clusters** — the import↔export↔engine triangle
is a serialization-contract failure, and §7.3 carries the card/mapper execution (the one canonical card,
the tolerant input adapter, the shared role/WI/card mappers). This doc owns the *rule* those collapses
obey (one home, flows down) and the *gate* that keeps them collapsed.

And the whole thing rests on the **one-directional cake**: the reason "widest consumer" is a *mechanical*
derivation and not a judgment call is that the cake forbids the alternative — a shape can't live at a home
that would force an upward import to reach it, so the widest consumer's tier IS the lowest legal home. The
gate is the backstop; the package physics is the floor.
