---
kind: law
status: active
updated: 2026-09-23
---

# The resource-policy contract — what a closed-ResourceHost policy OWES

**Given that the runtime refuses a non-ready populated-kind declaration before policy creation, while
demand-owned and installed-package declarations acquire through bound policy doors, what does a resource
policy owe?** The mechanism lives on the tree (`lib/resource-declaration.ts`, `lib/resource-policy.ts`,
`lib/policy-pass.ts`, [gate-runtime-standardization.md](gate-runtime-standardization.md) §3); this
document is the synthesis and the proof rules a conversion lane copies. It binds every
`analysis: "resource"` policy. Where it disagrees with a module, the module is wrong; where it disagrees
with [gate-runtime-standardization.md](gate-runtime-standardization.md) in full, the guide wins and this
document is stale — say so on the row. The alternatives this contract rejected are in
[ADR 0221](../adr/0221-resource-policy-contract-rejected-alternatives.md).

## 1. The answer in one paragraph

A resource policy owes **seven things**, and none permits domain logic to consume a non-ready value. It (1)
declares every resource it reads and reads every resource it declares; (2) narrows each acquired fact through
the ONE shared reader `readyResourceValue` — populated kinds are acquired before policy creation, while
demand-owned and installed-package kinds acquire at their bound door; (3) anchors every finding inside its
effective source/resource population; (4) declares the truthful resource-plane shape: `analysis: "resource"`,
a source-free or hybrid population, and an execution mode matching whether selected source members compose;
(5) carries `mode: "resource"` proof rows that satisfy every declaration used by the fixture, isolate ONE case,
name an exact `count`, and use only discriminators that survive the transplant test; (6) uses the optional
`mustRefuse` proof case when the proof grammar can express the bad state and retains `runPolicyPass` family pins
for runtime states it cannot; and (7) records in its header the family, the population port with the legacy
SHA, where each refusal lives, and every declared limit with the row that holds it.

A broken populated resource is a population tool error that withholds its owner before `create`. A broken
demand-owned or installed-package fact is receipted at its door and must be narrowed immediately, refusing in
the phase where it is read. Neither path may become a finding or a silent zero. A semantic health sibling may
judge a **ready but degenerate** resource value; if its own declared resource is non-ready, it is withheld too.

## 2. The runtime facts the contract rests on (evidence)

| Fact | Where |
| - | - |
| `ResourceLoad<T>` is a discriminated union: `value` exists only on `ready`; the other four cases carry `reason` | `tooling/src/verify/contract/resource.ts:2-5` |
| Population resolution pre-acquires every declared **populated-kind** resource and throws on any non-ready status, empty fact, or cross-root path; demand-owned and installed-package declarations are partitioned out | `tooling/src/verify/lib/resource-declaration.ts:190-211` |
| That throw is caught PER OWNER: the run is marked `incomplete` at phase `population`, the owner is withheld, every other policy in the invocation continues | `tooling/src/verify/lib/policy-pass.ts:405-421` (`resolveRuns`) |
| The binding boundary: an undeclared door read throws; populated paths must remain inside the effective resource population; demand and installed-package doors enforce their kind-specific inputs; each consumed populated/installed resource source produces one per-owner evidence record, including cache hits; demand acquisitions produce individually sequenced evidence records. Non-ready pre-create declaration resolution produces no policy evidence | `tooling/src/verify/lib/resource-policy.ts` (`accept`, `acceptDemand`, `fencedText`, `fencedExactFiles`) |
| An UNCONSUMED declaration is an evidence-phase refusal | `tooling/src/verify/lib/policy-pass.ts:736-743` |
| `readyResourceValue` — the one narrowing after acquisition; acquisition timing differs by kind | `tooling/src/verify/lib/resource-declaration.ts:21-35` |
| A finding anchored outside the resource population is an `[evaluate]` tool error (`finding file is outside the effective population`) | `tooling/src/verify/lib/policy-pass.ts` report sink |
| A resource policy may be hybrid: `resolvePopulation()` independently resolves source and resource populations and combines them; resource analysis does not imply `population: { of: "none" }` | `tooling/src/verify/lib/policy-pass.ts:307-341`; `lib/policy-validation.ts:320-335` |
| Demand kinds (`authored-path`, `authored-text`) and `installed-package` contribute no population path and acquire through their bound doors | `tooling/src/verify/lib/resource-declaration.ts:187-195` |

**Refusal wording, driven through `runPolicyPass`:**

```
tree missing      resource declaration authored-tree:server is missing: resource tree has no members: packages/server/src
tree empty        resource declaration authored-tree:server is empty: resource tree has no members: packages/server/src
manifest missing  resource declaration package-metadata:ui is missing: resource is absent from the invocation inventory: packages/ui/package.json
manifest malformed resource declaration package-metadata:ui is unresolved: malformed package metadata: Unexpected end of JSON input
exports non-string resource declaration package-metadata:ui is unresolved: package metadata does not match the closed ui package contract
```

Every one: `toolErrors: [{ phase: "population" }]`, owner `{ status: "incomplete", population: "incomplete" }`,
`withheldPolicyIds` names the policy, zero evidence records, zero findings. A complete run files exactly one
`kind: "resource"` evidence record per declaration — source `authored-tree:<id>` / `package:<id>` — with `unresolved: 0`.

**And one READY-but-degenerate case that is a VERDICT, not a refusal:** a `package.json` whose `exports` key is
ABSENT resolves to `exports: {}` (`ops/resource-config.ts:31-34`, `stringMap(undefined) → {}`), so
`ui-exports-map-complete` reports every derived module as "no entry at all". That is the honest successor of the
legacy A4 blindness case: the map names nothing, and the finding says so per module. A NON-string-map `exports`
(conditional exports, an array) is the other half — `unresolved`, a refusal.

**This normalization GENERALISES, so it is a contract note and not one module's row:** `stringMap(undefined)`
returns `{}` for every optional map key the package-metadata provider reads — `scripts`, `dependencies`,
`devDependencies`, `peerDependencies`, `optionalDependencies`, `exports` (`ops/resource-config.ts:31-52`). Every
`packageMetadata` consumer therefore inherits "an absent key reads as an authored empty map" and owes a pin for
what its case does with an empty map (`verify-registry-parity` reads `scripts` on the same terms;
`depcruise-grant-liveness` reads all four dependency maps). Only a key that is PRESENT and not a string map
refuses. A policy cannot tell the two apart and must not try — the distinction belongs to the provider.

## 3. The seven obligations, each with its enforcer

Constitution §2: a placement names its enforcer. Each obligation below names the tier that makes a violation
RED, and the one that is prose-only is called out as the gap.

1. **Declare what you read; read what you declare.** Enforcer: RUNTIME — an undeclared read throws at the
   binding (`resource-policy.ts:25-28`); an unconsumed declaration refuses at the evidence phase
   (`policy-pass.ts:736-743`). Consequence for a policy that reads a resource only for its PATH (an anchor):
   the read still happens, and the header says why (`server-layout`'s manifest).
2. **Narrow through `readyResourceValue`, never a branch.** Enforcer: TYPE for the narrowing itself (`.value`
   does not exist on the union) AND LINT — `policy-soundness` CASE E4 reds a `ctx.resources.<door>(…)`
   result that is not the direct argument of `readyResourceValue`, plus the alias escape (`ctx.resources`
   bound to a name), with the guard resolved by IMPORT ORIGIN so a local lookalike cannot acquit. **There
   is no hand-off exception**: a shared reader takes the narrowed value and the caller reads its own
   door — a shared reader that received the whole host and narrowed internally is out of E4's reach the
   instant it crosses into `lib/`, so the guard stops exactly where that escape would begin. For populated
   kinds a non-ready guard is unreachable after run resolution. Demand-owned and installed-package reads
   can receive a non-ready value and therefore narrow directly at the call site; returning from that
   reachable branch is a forbidden silent-clean path. In both cases the policy must use the shared helper
   rather than re-spell a `throw` per module. Every resource policy reads through the helper, and no
   resource policy carries an executable not-ready branch.

   **Re-derive that census, never quote it** — `ast-grep -p 'readyResourceValue($$$)'` for the sites, against
   the `analysis: "resource"` module list, with a planted negative control (`readyResourceValueNOPE` → 0) so a
   zero means *measured* rather than *could not search*. **A census-shaped sentence in a doc a lane copies
   names its derivation, not its result** — the count rots at every merge; the derivation does not.
3. **Anchor inside your effective source/resource population.** Enforcer: RUNTIME (`[evaluate]` tool error). This is why a
   missing-TIER finding reports at the server manifest (declared, read, inside the population) and not at the
   gate's own source file as the legacy descriptor did.
4. **Declare the truthful resource-plane shape.** `analysis: "resource"` is fixed. A source-free resource
   policy uses `population: { of: "none", why }`; a hybrid declares its actual source population as well as
   resources. `execution: "entire-population"` is required for an indivisible whole-population answer;
   `selected-files` is valid when selected source members compose. Enforcer: `lib/policy-validation.ts` for
   the legal shape and `gate:contract` for legacy fields. The resource ids remain the SMALLEST CLOSED ids that
   keep every case honest.

   **Selection keeps applicability separate from available inputs.** For a narrowed request, applicability is
   computed from the raw intersection with the owner's own declared source and populated-resource paths. A
   consumed fact's declared paths can touch the owner, but do not enter the entire-population completeness
   denominator because fact runs resolve their complete population independently. Thus `entire-population`
   deferral remains based on whether the request covers the owner's whole declared population; completing a
   running owner's inputs must not turn a partial request into a runnable whole-population verdict.

   Once an owner is runnable, every declared resource remains available. If the request touched a declared
   resource or consumed-fact path, every declared source subject is reselected; if it touched source paths
   only, a `selected-files` owner visits exactly that source subset. Resource and fact identities can therefore
   select what must be judged without becoming source visitor inputs. The planner filters deleted request
   identities through its current-path inventory; the dispatcher resolves declarations from its live Project
   and ResourceHost. Both call the same `resolveEffectivePopulation` calculation and the dispatcher refuses a
   supplied plan whose population disagrees. This preserves §3.4's whole-population deferral while preventing
   a resource-only change from producing a successful clean over zero source subjects.
5. **Proof rows satisfy EVERY declaration used by the fixture and isolate ONE case.** Enforcer: `structure:policy-conformance`
   for execution. Plant `count: 99` on a `mustFlag` row as the exactness control: every count is exact, so
   the plant fails with `but got 1` on a healthy row, and a row that stays green under the plant is not
   pinning what it claims to. A row missing a declared resource is a `[population]` tool error, not a
   finding (so `depcruise-grant-liveness` spreads `PACKAGE_FIXTURE_FILES` into every row). A
   `messageIncludes` is admissible only if the transplant test passes: moving it onto every sibling row
   must red that row. Two rows sharing one report call cannot be message-discriminated and must either be
   one row or split the message. When a cut proves two checks mutually redundant (one can never fire
   without the other already having fired), delete the redundant one and document why rather than keeping
   a row that cannot fail.
6. **Prove every reachable acquisition refusal at the narrowest truthful tier.** For EACH declared resource,
   derive the non-ready statuses its actual reader can emit and pin EACH reachable status; do not copy a
   generic status roster or infer coverage from another kind. Also pin the complete run's resource-evidence
   pairing with `unresolved: 0`. `mustRefuse` is the optional third proof case (`contract/policy.ts`;
   `policy-validation.ts`): use it when resource fixture data can express the bad acquisition state, where it
   asserts refusal text and forbids findings. Keep family `runPolicyPass` pins for planner/dispatcher selection,
   evidence pairing, filesystem states, or other conditions outside the proof grammar. The optional case changes
   the proof carrier, not the coverage owed.

   A `missing`, `empty`, `unresolved`, or other non-ready acquisition status is a refusal or population tool
   error, never a finding or silent zero. That does not classify domain-invalid content inside a **ready**
   resource: a policy may legitimately report such semantic invalidity as a finding when that is the verdict it
   owns. The provider/reader decides whether bytes are non-ready; the policy judges the ready value it receives.
7. **The [gate-runtime-standardization.md](gate-runtime-standardization.md) §7 item 5 header.** FAMILY (the shared `lib/` reader by module + function, or `singleton` with its reason)
   · POPULATION PORT (the legacy SHA, the read it replaced, byte-identical or each intentional delta) · WHERE
   THE REFUSAL LIVES (the runtime, with the pin that proves it) · DECLARED LIMITS, each naming the row that
   holds it · structurally unfalsifiable boundaries documented rather than faked ([gate-runtime-standardization.md](gate-runtime-standardization.md) §6.1).

## 4. Where the refusal lives — and what resource health may accuse

The fact-provider accuser pattern works because a provider's non-ready state is DELIVERED to its consumers: a
a provider must not certify its own census ([gate-runtime-standardization.md](gate-runtime-standardization.md) §3), so `bus-fact-health` receives `status !== "ready"` and
reports it as ONE finding instead of crashing every bus policy. That asymmetry is designed and is not touched
by this contract — `bus-fact-health` is `analysis: "types"`, `facts: [busProducerFact]`, `resources: []`; it is
not a resource policy, and its `status !== "ready"` branch is correct to leave alone.

The runtime separates readiness from semantic health. A non-ready **populated** declaration is recorded as a
population tool error and withholds each owner before `create`. A non-ready **demand-owned or
installed-package** value is delivered only by its bound acquisition door; the caller must immediately apply
`readyResourceValue`, which refuses before domain logic consumes it.

A **ready** resource may still be semantically degenerate. A resource `-health` sibling may validly flag that
state, provided it uses the same declaration/binding contract and anchors inside its effective population.
It cannot convert provider failure into a product finding: if its populated resource is non-ready, the runtime
withholds that sibling too; if a later-acquired value is non-ready, reader-side narrowing refuses. The health
policy owns semantic judgments over ready values, not a second provider-failure channel.
