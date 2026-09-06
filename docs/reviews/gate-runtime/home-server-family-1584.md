---
kind: review
status: active
updated: 2026-09-06
---

# Sanctioned-home SERVER family conversion for #1584

Lane `cb-home-server`, based at `f6078a884`. Ten legacy gates whose exceptions were gate-local
`SANCTIONED_HOMES` / allowlist / ledger tables are now final `defineGate` policies with `reviewed-grant`
authority, and their forty exceptions are exact `(subject, operation)` rows in the ONE central table
(`tooling/src/verify/lib/reviewed-grants.ts`). One eleventh policy is new: `scrubber-factory-home`, the
`hard` sibling split off `scrubber-home` because a definition site's liveness is a completeness claim and
not a permission.

Every one of the ten stood on a SPELLING where its law is an IDENTITY, and every one carried its own
rename tripwire. Both halves are replaced: the subject is resolved through the shared origin readers, and
the tripwire is the central table's own zero-consumption alarm.

## Disposition

| Legacy id | Disposition | Authority / severity | Family | Execution | Identity now resolved through | Grant rows | Population |
| - | - | - | - | - | - | -: | - |
| `bus-channel-primitive` | converted | reviewed-grant / error | singleton | entire-population | the constructed class through the `node:events` door (`resolveCallableOrigin`) | 1 | exact (58) |
| `content-part-seam` | converted | reviewed-grant / error | singleton | entire-population | `ChatContentPart`'s canonical declaration in `contracts/src/chat/` (`readSealedOrigin`) | 9 | classified (3,368 → 3,367) |
| `no-direct-users-read` | converted | reviewed-grant / error | singleton | entire-population | the `users` export of `db/src/schema/` (`readSealedOrigin`) | 7 | exact (1,144) |
| `no-raw-clock` | converted | reviewed-grant / error | `ambient-determinism` | entire-population | the ambient `Date` bound from TypeScript's lib declarations | 2 | classified (3,374 → 3,367) |
| `no-raw-random` | converted | reviewed-grant / error | `ambient-determinism` | entire-population | the ambient `Math` bound from TypeScript's lib declarations | 1 | classified (4,384 → 4,377) |
| `owner-role-split` | converted | reviewed-grant / error | `role-vocabulary` | entire-population | `USER_ROLES` at its declaring module + the read's own TYPE | 5 | exact (1,488) |
| `scrubber-home` | converted | reviewed-grant / error | `scrubber-home` | entire-population | the factory's canonical declaration in `kit/src/content/` | 1 | classified (3,368 → 3,367) |
| `scrubber-factory-home` | **NEW sibling** | hard / error | `scrubber-home` | entire-population | the content home's own exported declaration | 0 | `@kit` (61) |
| `single-stream-transport` | converted | reviewed-grant / error | singleton | entire-population | the `subscription` method declared by `@trpc/server` (`resolveTypeMemberOrigin`) | 2 | exact (27) |
| `sole-env-reader` | converted | reviewed-grant / error | singleton | entire-population | the ambient `process` global OR the `node:process` default export | 9 | exact (1,488) |
| `two-class-role-authority` | converted | reviewed-grant / error | `role-vocabulary` | entire-population | `PARTICIPANT_ROLES` at its declaring module + the read's own TYPE | 3 | exact (1,144) |

**Every reviewed-grant policy is `entire-population`, and that is not decoration.** A reviewed-grant
policy's verdict includes GRANT LIVENESS, and liveness does not compose over an arbitrary subset: a
narrowed selection that does not carry a granted subject would report no finding there and stale its own
row. `entire-population` DEFERS the policy on such a selection instead. The two exemplars on the branch
(`config-anchor-in-registry`, `route-imports-no-feature`) already ruled the same way.

## Two shared readers, plus one function on an existing one

- **`lib/ambient-determinism.ts`** — `readAmbientInvocation(node, sources)`. `no-raw-clock` and
  `no-raw-random` asked the identical question of a callee — is this the ambient `Date`/`Math` the checker
  bound from TypeScript's own lib declarations — and answered it with `getText()` comparisons. The reader
  returns `ambient` / `other` / `unreadable`, routing its refusal through the shared
  `classifyOriginRefusal` so a proven local binding passes and an unreadable one is reported.
- **`lib/role-vocabulary.ts`** — `readRoleComparison`, `readIsOnAxis`, `vocabularyAtHome`,
  `vocabularyMembers`. `owner-role-split` and `two-class-role-authority` each hardcoded a literal set
  inside the gate and matched the operand's TEXT. Both halves are now facts: the literal set is READ from
  `USER_ROLES`/`PARTICIPANT_ROLES`' own declaration through the existing `tupleVocabularyFact` and BOUND to
  its declaring module, and the axis is proven by the read's own TYPE.
- **`lib/origin-verdict.ts::referenceNamesExport`** — see "The one defect this conversion caught in
  itself" below. It is homed beside `classifyOriginRefusal` because it is fail-closure's mandatory
  companion.

`lib/sealed-origin.ts` also gained `sealedOriginReports(verdict, anchor)`: the three sealed-origin
consumers here (`content-part-seam`, `no-direct-users-read`, `scrubber-home`) all need the same scoping —
`sealed` reports, `foreign` does not, and an `unresolved` verdict is classified, so an unreadable DECLARED
DOOR reports while a member read that provably binds a local object's key is simply not a subject.

## The one defect this conversion caught in itself

The first real-tree pass produced **59 raw findings against a legacy baseline of 0**. Nineteen of them were
the policies' own fault and are the durable lesson of this lane:

**A FAIL-CLOSED ARM WITHOUT A CANDIDATE PREFILTER CONVERTS EVERY UNREADABLE NODE INTO AN ACCUSATION.**
`bus-channel-primitive` resolved a callable origin on EVERY `NewExpression` in `transport/**` and reported
whatever it could not read: five `new TRPCError(…)` sites, whose origin refuses as `ambiguous`.
`no-raw-clock` did the same on every ZERO-ARGUMENT `new`: fourteen sites — `new AsyncLocalStorage()`,
`new Hono()`, `new EventEmitter()`, `new GameSeedFlights()`, a domain error — each accused of reading the
ambient clock. Neither had a name prefilter, because a name prefilter reads like the spelling the
conversion exists to delete. It is the opposite: the prefilter is what makes fail-closure honest, and the
identity resolution still runs on every candidate. `referenceNamesExport` is the shared companion
(a bare identifier, an import specifier's ORIGINAL exported name so an alias still names it, or a member
read), and both policies carry the prefilter's own `mustPass` control row. After the repair: 40 raw.

## Old/new finding differential

Legacy replay: the ten pre-conversion descriptors through the production legacy dispatcher
(`runPass` + `projectCtx`) over the real 7,198-file harness corpus — **11.4 s, zero tool errors, 0 findings
for all ten** (every live occurrence sat inside a `SANCTIONED_HOMES`/allowlist row, which is why the
legacy count is zero rather than the grant count).

| Policy | Legacy raw | Final raw | Granted | Effective | Classification |
| - | -: | -: | -: | -: | - |
| `bus-channel-primitive` | 0 | 1 | 1 | 0 | the mint's own construction, now REPORTED and licensed by a row instead of silently skipped |
| `content-part-seam` | 0 | 9 | 9 | 0 | the nine seam members, now one row each |
| `no-direct-users-read` | 0 | 7 | 7 | 0 | the seven identity-domain readers, now one row each |
| `no-raw-clock` | 0 | 2 | 2 | 0 | the kit time engine + the composition root |
| `no-raw-random` | 0 | 1 | 1 | 0 | the composition root's seed draw; two legacy homes were DEAD |
| `owner-role-split` | 0 | 5 | 5 | 0 | **+5 the legacy literal-text reader could not see** — see below |
| `scrubber-factory-home` | n/a | 0 | 0 | 0 | new policy; the home is healthy |
| `scrubber-home` | 0 | 1 | 1 | 0 | the producer stamp (its import + two calls dedupe to one) |
| `single-stream-transport` | 0 | 2 | 2 | 0 | the one-socket home + the permanent exemption, now keyed on the proc |
| `sole-env-reader` | 0 | 9 | 9 | 0 | the env home's four operations + role-policy's five keys |
| `two-class-role-authority` | 0 | 3 | 3 | 0 | **+1 the legacy hardcoded `host` literal could not see** — see below |

### Six real escapes, and how each was ruled

**`owner-role-split`, five sites in `domain/admin/verbs/**`.** `create-user.ts:55`,
`link-sso-identity.ts:76`, `reset-password.ts:49`, `set-enabled.ts:52`, `set-role.ts:32` all compare a
global role against the `OWNER_ROLE` CONST. The legacy reader required a quoted literal on one side
(`ROLE_LITERALS.has(rightText)`), so the whole class was invisible; the shared static-string reader follows
the alias. All five are **TARGET-VALIDITY checks on the owner ROW** — the owner cannot be minted, linked,
reset, disabled or demoted — and `can()` structurally cannot answer them: it decides whether a PRINCIPAL
may act, not whether the row being acted on is the immutable bootstrap owner. That is the same class the
legacy sibling policy already recognised with an allowlist row (its nominee check), so each is an exact
reviewed row whose `endsWhen` names the closable fix: an owner-immutability decision exposed by the admin
guard that the verbs call.

**`two-class-role-authority`, `chat/persistence/participant.ts:85`.** `assertForcedCharacterMember`
throws on `p.role !== "member"` — the runtime twin of the `chat_participants` CHECK constraint. Invisible
to the legacy reader because it hardcoded the `host` literal; visible now because the literal set is read
from `PARTICIPANT_ROLES`. It is a persisted-row SHAPE invariant rather than a caller gate, and is an exact
row whose `endsWhen` is the schema guaranteeing the shape at every write path.

**Both classes are recorded here rather than quietly waived.** A reviewed grant is not a waiver door: this
policy family has NO waiver door at all (reviewed-grant findings never reach the ordinary-waiver engine),
so every row above is a reviewed permission with a stated end condition, and the orchestrator's verifier
should read these six rulings first.

## Population equality, over one frozen 7,208-path candidate manifest

Each legacy `scanRoot` transcribed from `f6078a884` and each final `PopulationExpr` through
`compilePopulation`, run over the SAME byte set (the final loader's `searchGlobs` corpus) and diffed both
ways. **Seven exact; three classified; zero paths ADDED anywhere.**

- `packages/showcase-plugins/src/index.ts` drops from `content-part-seam`, `scrubber-home`, `no-raw-clock`
  and `no-raw-random`: `@packages` names the six cake packages and guest showcase code is not one of them —
  the same classified delta the schema-fact and canonical-origin lanes recorded. It admits nothing: its only
  `Date.now()` / `new Date(` occurrences are inside comments.
- `no-raw-clock` and `no-raw-random` drop six more — `packages/client/vite.config.ts`,
  `packages/db/drizzle.config.ts`, `packages/ui/{token-contract,tokens.build,tokens.near-duplicate}.ts`,
  `playwright/index.tsx`. **None was ever in the LEGACY corpus**: `searchGlobs` adds `packages/*/*.ts` and
  `playwright/**/*.tsx` on top of `harnessGlobs`, and the legacy pass ran on `harnessGlobs` (7,198 files).
  Their two admit-all-minus-exclusions predicates admit them only because both predicates were measured over
  the final candidate set. Corpus counts differ by METHOD, not by drift.

## Real-tree final pass

One `runPolicyPass` over `getWorkspace({root, types: true})`, with **all 89 `defineGate` modules on the tree
as `knownPolicies`** (a hand-picked roster manufactures \~100 unknown-policy waiver alarms), the eleven
selected, and `reviewedGrantsFor(policies)`:

```
knownPolicies=89 selected=11 loadedSources=7212
workspaceMs=4328 passMs=14852 wallMs=19180
factErrors=0 toolErrors=0 authorityToolErrors=0 alarms=0 withheld=[]
raw=40 waived=0 granted=40 effective=0
```

`/usr/bin/time -v`: **20.30 s wall, 4,019,828 KiB peak RSS**, 0 swaps, 0 major page faults (an earlier
identical-verdict run on a busier box measured 29.75 s / 3,833,236 KiB, so read the wall as a range). **All 40 grant
rows consumed EXACTLY once** — no stale row, no over-broad row. Per-policy cost is concentrated where the
population is: `content-part-seam` 2.9 s over 3,367 files, `scrubber-home` 1.1 s over 3,367,
`no-raw-clock` 0.6 s, `sole-env-reader` 0.6 s over 1,488; the other seven total under 1 s combined.

## Verification

| Check | Result |
| - | - |
| family conformance (`tests/tooling/verify/gates/home-server-family.test.ts`) | green — 11 policies, 8 tests: 92 policy proofs plus 7 runtime pins |
| the two new readers' own specs (`tests/tooling/verify/lib/{ambient-determinism,role-vocabulary}.test.ts`) | green — 11 tests, each ARMED (neutralising the identity comparison reds 3 of 6 and 2 of 5 rows respectively) |
| fixture-specifier resolution control | 53 relative specifiers across all 11 policies' proofs; **0 accidental unresolved**, 5 deliberate `./missing*.ts` fail-closed rows |
| receipt refusals, pinned through `runPolicyPass` | the D51 declaration home leaving `contracts/src/chat/`; the kit content home holding no source; the participant vocabulary absent AND relocated |
| grant liveness, pinned through `runPolicyPass` | consumed-exactly-once with TWO constructions in the granted carrier; STALE when the home stops constructing; STALE plus an effective finding when the grant names another subject |
| population equality over a frozen 7,208-path manifest | 7 exact, 3 classified, 0 added |
| legacy replay + final real-tree pass | above |

## Known limits, written down

- **A namespace TYPE reference is a `QualifiedName`, which no shared reader normalizes today.**
  `content-part-seam`'s subject is type-only, so `import * as chat; type T = chat.ChatContentPart` is
  outside its candidate set. The legacy import-keyed detector was blind to it as well, so this is a written
  baseline plus a runtime follow-up, not a regression. `no-direct-users-read`'s subject is a VALUE, so its
  namespace arm is a `PropertyAccessExpression` and is covered (both spellings carry `mustFlag` rows).
- **Every candidate PREFILTER is the sealed NAME**, so a barrel that re-exports a subject under a DIFFERENT
  name is out of subject for `bus-channel-primitive`, `content-part-seam`, `no-direct-users-read` and
  `scrubber-home`. Same limit the legacy name readers carried; closing it means resolving an origin on
  every identifier in a 3,367-file population, which does not finish.
- **`no-raw-clock` / `no-raw-random` see a MEMBER read or a zero-argument `new`.** A bare local alias of the
  method (`const now = Date.now; now()`) is outside the prefilter — widening it means resolving an origin on
  \~700 injected-clock call sites per pass. The legacy text comparison missed the shape too.
- **`no-raw-random`'s subject is the CALL.** `prng: Math.random` passes the ambient generator as an injected
  default (live at `entry/compose/automation-plugin.ts`, `infra/providers/backends/kit/retry.ts` and three
  `kit/macro` seams); widening onto those references is a burn-down with its own decision to make.
- **Both role policies keep the `role` NAME in the subject.** Dropping it widens onto every comparison of a
  role-typed value — `resolvedRole === "owner"` at `domain/sessions/verbs/provision-identity.ts:180,310` is
  the live shape — which is a burn-down and not a conversion. Each carries the limit as a `mustPass` row.
- **`two-class-role-authority`'s two other legacy blind spots are unchanged and still carry rows**: a
  comparison hoisted into a boolean const used later in a throwing `if`, and the guard-INVERSION spelling
  whose `throw` sits outside the `if`. Its transport-tier blind spot (`authority === "host"`) is retired BY
  CONSTRUCTION — that tier string is not the participant vocabulary.
- **`lib/sanctioned-home.ts` STAYS.** After this conversion it has **15 remaining importers**, all client- or
  class/style-shaped (nine belong to the sibling `cb-home-client` lane); the file retires when the last one
  converts.

## Runtime follow-ups this lane recorded

- `resolveModuleMemberOrigin` refuses an OVERLOADED / multiply-declared export as `ambiguous` —
  `@trpc/server`'s `TRPCError` is a third live instance beside React's `useState` and drizzle-orm's
  operators. One shared overload-aware origin reader closes all three; until then a fail-closed arm MUST be
  name-prefiltered, which is now enforced by a shared function rather than by care.
- No shared reader normalizes a `QualifiedName` (the namespace spelling of a TYPE reference). Any
  type-only sealed symbol is blind to its namespace door until one does.
