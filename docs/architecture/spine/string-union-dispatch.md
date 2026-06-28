# Orbweaver — §7.5 string-union dispatch discipline (the union-axis spine)

> **Status: planning (authoritative — the cross-cutting spine).** This is the §7.5 thread, peer of
> `domains/chat.md`/`domains/connection.md`. It defines the ONE discipline every string-union "kind" axis in the
> codebase obeys, and the two gates that enforce it. The coupling here is the kind an **import graph
> cannot see**: runtime branching on string-union keys. `no-inline-types` (§7.4) keeps a type in one
> home; it cannot see a `switch (kind)` re-spelling `"system" | "user" | "assistant"` inline, nor a
> dispatch missing an arm. §7.5 is §7.4's runtime-coupling complement: §7.4 governs the *static shape*
> (one home, one direction), §7.5 governs the *runtime fan-out* over that shape (one importable axis,
> one exhaustive dispatch). Grounded by the AST dispatch scout (`reports/dispatch-scout.json`,
> neo-tavern), the union homes by `reports/shared-dissolution.md`, and the gold standard by
> `domains/workloads.md`. Authoritative upstream: `_FANOUT-BRIEF.md` §7.5 (the quantified pain) + §8.6
> (the principal axis), `structure.md` §7 (the gate ladder), `domains/workloads.md` (the `RUNNERS`
> Record exemplar), `domains/connection.md` §7.5 (the user's MEASURED `ChatSource` pain).

---

## 1. The principle — every kind-axis has both halves

Orbweaver keeps the **string-union** choice over `enum` (good: structural, serializable, zero runtime
construct, tree-shakeable, the zod `z.enum(TUPLE)` wire schema derives from the same tuple). `enum` is
banned — zero of them. But a string union without discipline rots two ways, and the scout measured
both. The rule:

**Every string-union "kind" axis has BOTH:**

- **(a) ONE importable canonical union/tuple** — declared once, imported everywhere, re-spelled
  *nowhere*. The shared shape is a `const TUPLE = [...] as const satisfies readonly T[]` plus the
  `type T = (typeof TUPLE)[number]` inferred from it (and, where it crosses the wire, the
  `z.enum(TUPLE)` schema that imports the tuple downward). No inline `"a" | "b" | "c"` anywhere else.
  *Gate: `no-inline-union-redecl`.*
- **(b) a mapped-type Record OR an exhaustive `assertNever` dispatch** — every runtime fan-out over
  the axis is total, so **adding a member fails the build** until every dispatch grows its arm. Prefer
  the mapped-type `Record<K, …>` (the compiler enumerates the arms for you); fall back to a
  `switch` + `default: assertNever(x)` / `satisfies never` where the dispatch returns heterogeneous
  values that a Record can't type uniformly. *Gate: `exhaustive-dispatch`.*

Half (a) without (b) gives you a clean type that silently no-ops a new member at runtime. Half (b)
without (a) gives you exhaustive switches that each re-spell the union, so the canonical set drifts
(the `messageRole` disease: 3 competing const-arrays). You need both, on every axis.

**Homing follows the cake** (`structure.md` §6 — `kit → contracts → db → server → client`):

| axis crosses… | home | example |
|---|---|---|
| a boundary (server ↔ client ↔ db wire) | `@orb/contracts/<ns>` | `ChatApi`/`ChatSource`, `CredentialProvider`, `AssetKind`, `TagTargetType`, `WorldBookRole`, `GuidedActionKind` |
| only a pure engine (isomorphic, no I/O) | `@orb/kit/<engine>` | `RegexPlacement` (`kit/regex`), `EntryScopeMode`/`EntryPosition` (`kit/world-info`); `MessageRole` + the `{depth,role}` inject shape (`kit/message-role` + `kit/injection`, D32) |
| only one domain, NO db column (engine-internal to a feature) | `domain/<feature>/contract/` | the embeddings-internal `SourceKind`/`VectorTable` + the broad text-lens `SourceLens` (its image subset is a db column → next row) |
| a db enum column | tuple in `kit`/`contracts`, `db` schema **derives** its enum from it (`@orb/db` cannot import a `domain/*/contract`) | `AssetKind`, `TagSource`; **`WORKLOAD_KINDS`/`WORKLOAD_STATUSES` → `@orb/contracts/workloads`**, **`IMAGE_LENSES` → `@orb/contracts/embeddings`** (D34) |

One-directional cake; kit-purity LOCKED (a kit tuple may carry no zod, no contracts import — the
`z.enum(TUPLE)` lives in `contracts` and imports the tuple *down*; `contracts/regex.RegexScript
satisfies` a kit-local structural input rather than kit reaching up).

---

## 2. The measured axes (dispatch scout — `reports/dispatch-scout.json`)

The scout quantified the "touch N spots to add one variant" pain across neo-tavern. These are the
load-bearing axes; the count is the blast radius of adding one member today.

| axis | members | touch-count | shape of the rot | target home |
|---|---|---|---|---|
| `messageRole` | `system` / `user` / `assistant` | **132** | 3 competing canonical const-arrays + 116 inline re-spellings; **no importable union at all** | `@orb/contracts` (chat / preset) |
| `users.role` | `admin` / `user` *(NEO-SOURCE measurement; orbweaver widens to the 3-member `owner\|admin\|user`, D17)* | 35 | no exported `UserRole` → 33 inline `"admin"\|"user"` re-decls | `@orb/contracts/identity` (§7.1 overlap) |
| `guidedAction` | 6 actions | 23 | 14 redecls + **4 UNTYPED `Record`s** (no exhaustiveness backstop) | `@orb/contracts/preset/guided.ts` |
| `routing.source` (`ChatSource` = `CredentialSource`, D31) | `max-pro-sub` / `openrouter` / `vllm` / `custom_openai` | **18** | 11 inline re-decls — **the user's lived pain, MEASURED**; dispatch IS already `assertNever`-gated, the cost is pure re-declaration | `@orb/contracts/credentials` (canonical); `contracts/connection` re-exports as `ChatSource` |
| `routing.api` (`ChatApi`) | `agent-sdk` / `chat-completions` / `responses` | 12 | 9 inline re-decls; dispatch fully `assertNever`-gated | `@orb/contracts/connection` |

`messageRole` is the worst axis in the codebase: 132 touches, three different const-arrays each
claiming to be canonical, and 116 sites that just type the literal union inline. `routing.source` is
the axis the user *felt* — 11 re-spellings of a four-member union, even though the runtime dispatch is
already exhaustive. Both halves of the discipline must land: the dispatch was fine, the re-declaration
was the tax.

**The other gated axes** (already single-homed by `reports/shared-dissolution.md`, called out so they
don't regress): `CredentialProvider`/`CRED_PROVIDERS` + `CredentialSource` → `contracts/credentials`;
`RegexPlacement`/`REGEX_PLACEMENTS` → `kit/regex`; `AssetKind` (db enum + http route + client + domain
re-spell it inline — CORRECTED to cross-boundary) → `contracts/assets`; the embeddings-internal
`SourceKind`/`VectorTable` + the broad `SourceLens` → `domain/embeddings/contract`, but **`IMAGE_LENSES`
(the db-column image subset) → `@orb/contracts/embeddings` (D34)**; **`WORKLOAD_KINDS`/`WORKLOAD_STATUSES`/
`ACTIVE_WORKLOAD_STATUSES` → `@orb/contracts/workloads` (D34 — the `workloads.kind/status` db columns + the
partial-index predicate derive them; NOT `domain/workloads/contract`, which `@orb/db` can't import)**; `TagTargetType`/`TagSource`/`TagFolderType` → `contracts/tag`;
`WorldBookRole`/`EntryScopeMode`/`EntryPosition` → `contracts/world-info` + `kit/world-info`. **The
at-depth injection ROLE is NOT a world-info type (D32):** `ENTRY_INJECTION_ROLES` collapses into the
canonical `MessageRole` (the same `system|user|assistant` axis as `messageRole`) homed in the neutral
`kit/message-role`; world-info, persona, the card depth-prompt, author's note, memory, and guided all
import it from there. The `{depth,role}` inject SHAPE lives in `kit/injection`.

---

## 3. The gold standard (copy this shape)

`workloads.kind` is the reference implementation; **every other axis is being reshaped toward it**
(`domains/workloads.md` — "preserve verbatim"). The mapped-type Record makes the compiler the
checklist:

```typescript
// @orb/contracts/workloads/kind.ts — ONE canonical union + the runtime tuple (db derives it; D34 — NOT
//   domain/workloads/contract, which @orb/db cannot import). The dispatch RUNNERS map below stays domain.
export type WorkloadKind =
  | "embed-corpus" | "embed-assets" | "distill-characters" | /* … */ | "refresh-model-catalog";
export const WORKLOAD_KINDS = [ /* … */ ] as const satisfies readonly WorkloadKind[];

// engine/dispatch.ts — the exhaustiveness pin. A missing kind is a `tsc` error HERE.
export const RUNNERS: { [K in WorkloadKind]: Runner<K> } = { /* kind → runner */ };
```

A missing kind is a hard `tsc` error at `RUNNERS` (and at `ParamsByKind`/`ResultByKind`) — the
mapped type `{ [K in WorkloadKind]: … }` cannot be satisfied with a gap. Adding a kind is five
mechanical edits and the compiler red-flags any you forget. The one sanctioned escape — the
`dispatchAndRun` two-cast bridge where an index-through-the-union can't narrow — is encapsulated in
one engine seam; it does not spread.

**Three companion shapes the codebase has confirmed in this mould:**

- `connection`'s `RoutingRoleKey` → `ROLE_RESOLVERS: { [K in RoutingRoleKey]: Resolver<K> }`
  (`domains/connection.md` §7.5) — NEW axis; the 7 roles become a typed Record, not 5 hard-pinned
  functions.
- `tag`'s `TagTargetType` → `junctions: { [K in TagTargetType]: JunctionEntry<K> }`
  (`domains/tag.md` §7.5) — adding a 6th target extends the Record or `tsc` goes red.
- `embeddings`'s `SourceKind`/`SourceLens` → `assertNever` exhaustive dispatch inside `store.ts`
  (`domains/embeddings.md` §7.5) — the `assertNever` variant, where a uniform Record doesn't fit.

**The leaky axes to CONVERT to this shape:** the `messageRole` switches (→ a `Record` or `assertNever`
over an importable `MessageRole`); the `guidedAction` 4 untyped `Record`s (→
`GUIDED_ACTION_IMPLS: { [K in GuidedActionKind]: Impl<K> }`, `domains/preset.md` §7.5); the
`authMode`/`runner` if-chains (→ typed-return dispatch over the canonical union).

---

## 4. The two gates (defined exactly)

These are NEW gates, added to the `structure.md` §7 ladder. Each names its enforcement tier
(`structure.md` §5 — agents respect only what fails early; push up the ladder).

### Gate A — `no-inline-union-redecl`  *(tier 3, lint-time)*

> An AST / dependency-cruiser rule that, for each registered canonical axis, counts the
> **declaration sites** of that union's member set. The count MUST be exactly 1 (the canonical home).
> A second `type X = "a" | "b" | "c"`, a second `z.enum(["a","b","c"])`, or a second
> `const ARR = ["a","b","c"]` with the same member set as a registered axis is RED.

- **Mechanism:** ts-morph over the codebase (reuse `scripts/codemods/codemod-kit.ts`, the scout
  toolkit — never hand-roll the bootstrap). For each axis in a registry (the canonical home + its
  member set), find every type-alias / `z.enum` / `as const` array whose literal member set equals
  the axis's, and assert exactly one lives at the canonical path.
- **Why lint-time, not compile-time:** TypeScript *accepts* a re-spelled identical union as a valid
  (structurally equal) type — `tsc` cannot tell "re-declared the canonical axis" from "coincidentally
  the same literals." Detecting re-declaration is an AST-shape question, so it lives in the `check`
  gate (tier 3). Weakest of the structural tiers — but the redeclaration tax is a legibility cost,
  not a correctness one, so lint is the right home.
- **Seeds:** the existing tuples are the canonical seeds — promote `CHAT_SOURCES`/`CHAT_APIS` to
  `contracts/connection` and delete `shared/providers/chat-routing.ts`; the 11 + 9 re-decl sites turn
  into import sites or go RED.

### Gate B — `exhaustive-dispatch`  *(tier 2, compile-time)*

> A dispatch over a canonical axis MUST be total: a `tsc` error when an arm is missing. Achieved by
> the **mapped-type Record** (`{ [K in Axis]: Handler<K> }` — the compiler enumerates the arms) OR by
> an **exhaustive `switch`** whose `default` branch passes the narrowed value to `assertNever(x: never)`
> / a `satisfies never` assertion. Adding a member to the union without growing the dispatch fails the
> build.

- **Mechanism:** pure type-system. The mapped-type Record is preferred — a new union member makes the
  object literal fail to satisfy `{ [K in Axis]: … }`. Where the dispatch returns heterogeneous shapes
  the Record can't type, `assertNever` in the `default` arm is the sanctioned alternative (the
  unreachable `never` becomes reachable — and a `tsc` error — when a member is unhandled).
- **Why compile-time:** this is correctness — a silently-missing arm is a runtime no-op / wrong
  branch. It belongs at the strongest enforceable tier below "physics." It is `tsc`-checked on every
  build, agent-proof in the way lint rules (which must be *run*) are not.

**The relationship to §7.4:** `no-inline-types` (§7.4) keeps a type's *declaration* in one home; it is
blind to a `switch` that re-spells the union inline (that's a value-position literal, not an exported
type) and to a dispatch missing an arm (the import graph sees no edge for a branch that isn't taken).
§7.5 is the runtime-coupling complement: Gate A is "one home" extended to value-position re-spellings,
Gate B is the dispatch-completeness §7.4 structurally cannot express. Together they make the axis the
single source of truth for *both* its shape and its fan-out.

---

## 5. Per-axis target (the conversions)

| axis | (a) ONE home | (b) dispatch shape | gate that catches a new member |
|---|---|---|---|
| `messageRole` | **tuple `MESSAGE_ROLES` + `MessageRole` → `kit/message-role` (D32, neutral); schema `messageRoleSchema = z.enum(MESSAGE_ROLES)` → `contracts/chat`** (tuple-in-kit §5). Collapses all 4 const-arrays (`messageRole`/`ENTRY_INJECTION_ROLES`/`GUIDED_INJECTION_ROLES`/`PRESET_GUIDED_INJECTION_ROLES`). | `Record`/`assertNever` over `MessageRole` at every switch (today 116 inline sites) | both: redecl RED at lint, missing arm RED at `tsc` |
| `users.role` (`UserRole`) | `UserRole` + `USER_ROLES` (`owner\|admin\|user`, D17) → `contracts/identity` (§7.1) | role checks dispatch through the canonical union; no inline `"admin"\|"user"` | both |
| `guidedAction` (`GuidedActionKind`) | `GuidedActionKind` + schema → `contracts/preset/guided.ts` | `GUIDED_ACTION_IMPLS: { [K in GuidedActionKind]: Impl<K> }` — the 4 untyped `Record`s become typed | both (the untyped Records gain exhaustiveness) |
| `ChatSource` | **= `CredentialSource` (D31): canonical in `contracts/credentials`; `contracts/connection` re-exports it as `ChatSource`** (same 4-member axis; no second tuple) | already `assertNever`-gated — KEEP; kill the 11 re-decls | Gate A (dispatch already total) |
| `ChatApi` | `ChatApi`/`CHAT_APIS` → `contracts/connection` | already `assertNever`-gated — KEEP; kill the 9 re-decls | Gate A |
| `RoutingRoleKey` | NEW union → `contracts/connection` | `ROLE_RESOLVERS: { [K in RoutingRoleKey]: Resolver<K> }` | Gate B (mapped Record) |
| `WorkloadKind`/`WorkloadStatus` | tuples → `@orb/contracts/workloads` (D34 — db columns derive); the `RUNNERS` map stays `domain/workloads/engine` | `RUNNERS: { [K in WorkloadKind]: Runner<K> }` | Gate B — preserve the SHAPE verbatim |
| `SourceKind`/`SourceLens`/`VectorTable` | `domain/embeddings/contract/params.ts` (broad/text); **`IMAGE_LENSES` (db-column image subset) → `@orb/contracts/embeddings`, D34** | `assertNever` in `store.ts`/`clearTable` | both |
| `TagTargetType`/`TagSource`/`TagFolderType` | `contracts/tag` | `junctions: { [K in TagTargetType]: JunctionEntry<K> }` | both |
| `CredentialProvider`/`CredentialSource` | `contracts/credentials` (**`CredentialSource` is THE provider-source axis — `ChatSource` aliases it, D31**) | role dispatchers `switch (credential.source)` exhaustively | both |
| `AssetKind` | `contracts/assets` (db enum derives) | exhaustive over `AssetKind` | both |
| `RegexPlacement` | `kit/regex` (`REGEX_PLACEMENTS`) | `assertNever` in the placement walk | both |
| `WorldBookRole`/`EntryScopeMode`/`EntryPosition` | `contracts/world-info` + `kit/world-info` (the entry-injection ROLE is `MessageRole` → `kit/message-role`, D32 — NOT a world-info type) | resolvers + bimaps total over each axis | both |

---

## 6. Spine-thread overlaps

### §7.4 (types & schemas — one home, one direction)

§7.5 is the runtime-coupling complement of §7.4, not a duplicate. §7.4's `no-inline-types` gate homes
the *type/schema declaration*; §7.5 adds (A) the value-position re-spelling that `no-inline-types`
can't see (a `switch` literal, an `as const` array, a bare `z.enum([...])` in a router) and (B) the
dispatch-completeness an import graph structurally cannot express. The canonical tuple lives where
§7.4 puts it (cross-boundary → contracts, engine-pure → kit, domain-internal → domain `contract/`);
§7.5 ensures it is the *only* spelling and that every branch over it is total.

### §7.1 (identity / auth / permission)

`users.role` (neo-source `admin`/`user`, widened to `owner`/`admin`/`user` per D17) is BOTH a §7.5 axis (35 touch, 33 re-decls → `contracts/identity`) and a
§7.1 concern (it gates `credentials.resolve`'s `max-pro-sub` arm via `requireOwner` (D17), plus `adminProcedure`/`requireAdmin`).
Single-homing `UserRole` is §7.5; *what the roles authorize* is §7.1. The deeper §8.6 finding sharpens
this: `chat_participants.kind` is **overloaded** (identity-table AND human-vs-AI at once), so its
`parseParticipant` `never`-exhaustiveness guard already enumerates the work — splitting in an `agent`
arm (or a distinct `principalKind`/`isAi` axis) is a §7.5 union extension whose `assertNever` tripwire
makes every unhandled site RED. The agent-principal axis is a string-union extension governed by Gate
B; the *credential inheritance* question it raises is a §7.1 decision, parked there.

---

## 7. Invariants (gate candidates — each names its enforcement tier)

1. **Every canonical kind-axis is declared exactly once.** No second type-alias, `z.enum`, or
   `as const` array with a registered axis's member set.
   *Enforcement: lint-time — `no-inline-union-redecl` (AST/dep-cruiser count == 1). Tier 3.*

2. **Every dispatch over a canonical axis is total.** A new union member fails the build at every
   fan-out — via a mapped-type `Record<K,…>` or a `switch` + `assertNever`/`satisfies never` default.
   *Enforcement: compile-time — `exhaustive-dispatch`. Tier 2 (the strongest enforceable tier).*

3. **Prefer the mapped-type Record over `assertNever`.** Use `assertNever` only where the dispatch
   returns heterogeneous values a uniform `Record` can't type.
   *Enforcement: lint-time (a `check` preferring `{ [K in Axis]: … }` where return types are
   uniform) + review. Tier 3.*

4. **Zero `enum`s; the string-union choice is kept.** The axis is a `const TUPLE … as const satisfies
   readonly T[]` + inferred `type`; the wire `z.enum(TUPLE)` imports the tuple downward.
   *Enforcement: lint-time — a biome/dep-cruiser rule banning the `enum` keyword. Tier 3.*

5. **The tuple homes by the cake; kit stays pure.** Cross-boundary → `contracts`; engine-pure →
   `kit` (no zod, no contracts import — the `z.enum` lives in contracts and imports the tuple up);
   domain-internal → the domain's `contract/`.
   *Enforcement: resolve-time — package deps (a kit tuple importing contracts won't resolve) +
   `kit-purity` lint backstop. Tier 1 + 3.*

6. **A db enum column derives from the canonical tuple, never re-spells it.** `AssetKind`/`TagSource`
   etc.: the Drizzle enum is built from (or test-mirrored against) the one tuple.
   *Enforcement: compile-time where the schema imports the tuple; test-time mirror assertion
   otherwise. Tier 2 / Tier 4.*

7. **The `messageRole` axis collapses to one tuple.** The 3 competing const-arrays become one
   `MESSAGE_ROLES`; the 116 inline sites become imports.
   *Enforcement: lint-time — `no-inline-union-redecl` (count == 1). Tier 3.*

---

## 8. Open decisions

- **`messageRole` home — RESOLVED (D32).** The TUPLE `MESSAGE_ROLES` + `MessageRole` + the ST bimap live
  in the neutral **`kit/message-role`** (kit needs them: the ST serde bimap + the injection resolvers; kit
  can't import contracts — §5 tuple-in-kit); the wire schema `messageRoleSchema = z.enum(MESSAGE_ROLES)`
  lives in `contracts/chat` and imports the tuple down. Chat assembly, preset/guided injection-role
  mapping, persona/world-info/depth-prompt/author-note/memory injection, and the provider wire all import
  the ONE union. *(Open watch: a future `tool`/`developer` role would widen the tuple in the one place and
  every `assertNever` dispatch grows an arm — exactly Gate B's point.)*
- **The axis registry format for Gate A.** `no-inline-union-redecl` needs a machine-readable list of
  `{ canonicalPath, memberSet }` to count against. Decide whether that registry is a hand-maintained
  manifest, or inferred from "every exported `as const satisfies readonly T[]` tuple under
  `contracts`/`kit`/`*/contract`" (self-registering — preferred, no drift).
- **`assertNever` vs Record where returns are heterogeneous.** Some dispatches (the `derive*Profile`
  funnels, the role dispatchers) return per-arm shapes a single `Record<K, V>` can't type without a
  per-K generic. Confirm the `{ [K in Axis]: Handler<K> }` generic-Record pattern (as `Runner<K>`
  does) covers them, or where `assertNever` is the honest fallback.
- **db-enum coupling strength.** Whether the Drizzle enum *imports* the tuple (compile-time, tier 2)
  or *mirrors* it with a test (tier 4) — driver is whether `@orb/db` may depend on `@orb/contracts`
  for the value (it may; db's deps are `kit, contracts`), so import-and-derive is achievable for most
  axes. Confirm per axis.
- **Adding the two gates to the `structure.md` §7 gate table — RESOLVED.** `no-inline-union-redecl` +
  `exhaustive-dispatch` both land in the canonical §7 table, which now lists the **13** legibility gates.
  "Where does this go?" stays a one-answer derivation.
