---
kind: design
status: active
updated: 2026-09-05
---

# One ts-morph runtime for every Orb gate

This replaces the cancelled custom-ESLint Orb-policy cutover and supersedes [gate-config-system.md](gate-config-system.md). Native Biome/ESLint/community rules continue to own generic ecosystem lint. Every Orb-specific policy uses one ts-morph runtime and one capability contract. The migration is built in an isolated branch and lands atomically; no production state supports old and new descriptors together.

## Why this program exists

Current `main` has 255 gates. The shared node dispatcher is real, but most of the fleet can bypass it:

- 189 gates define their own `scanRoot`; 72 are multi-clause predicates and absence means admit-all.
- 91 gates own free-form `run` hooks.
- gate/helper code contains 250 `getDescendantsOfKind` calls across 84 files and 78 `getSourceFiles` calls across 57 files.
- six verify modules still construct their own ts-morph `Project`.
- 23 gates carry top-level `let` state; many more mutate module-level Maps/Sets reset by `begin`.
- only seven gates consume the canonical `symbol-reference` reader.
- nine baseline JSON files encode current exceptions/debt.

The recurring failure is semantic identity implemented as source spelling. Aliases, namespaces, re-exports, destructuring, computed keys, wrappers, shadows, writes, cycles, or unresolved resources then become silent greens. A shared AST walk cannot fix a gate that selects its own corpus or reinvents identity after dispatch.

## Final contract

Every gate is declared through one `defineGate` function. Types and the loader require every field; there are no defaults that turn absence into policy.

```ts
defineGate({
  id,
  family,
  authority: "hard" | "ordinary" | "reviewed-grant",
  severity: "error" | "warning",
  population,
  analysis: "syntax" | "types" | "resource",
  message,
  fix,
  create(context) {
    return { visitors, visitFile, evaluate };
  },
  mustFlag,
  mustPass,
});
```

- `population` replaces `scopeSafety` plus `scanRoot`. It is declared data resolved once into a manifest. File, folder, package, project, changed, whole, check, and family selection all use the same manifest algebra.
- `create` runs once per invocation and closes over mutable state. `begin`, module-global accumulators, and re-entry cleanup disappear.
- `visitors` retain the current kind-indexed single walk. A gate module cannot call descendant/project traversal APIs.
- `evaluate` consumes the resolved population, shared query/index services, compiler/checker, or explicit resources. It cannot access a raw `Project` and start another repository walk.
- central post-processing owns inline waiver lookup, typed-grant consumption/liveness, severity, sorting, completeness, and reporting. Gate order cannot change suppression/grant reconciliation.
- `status: dormant` is removed; it has zero occupants. A policy is registered or absent.

## Standard capabilities

Every Orb gate gets the same behavior without implementing it itself:

- one sanctioned `pnpm` command with tier plus file/folder/package/project/changed/whole scope;
- explicit `--check`, `--family`, strict-scope refusal, list/explain, JSON report, and stable exit codes;
- requested and effective population manifests, including deleted/renamed semantic paths;
- compiler-derived program membership and one lazy checker per workspace;
- error/warning severity with opt-in warning promotion;
- hard unsuppressible policy, exact ordinary occurrence waivers, and exact reviewed subject/operation grants;
- missing/empty/unresolved population refusal and failed-owner reconciliation withholding;
- per-gate files/members/resources/timing receipts;
- the same fixture runtime for `mustFlag`/`mustPass`, with an explicit fixture mode instead of fake real-tree anchors.

## Shared query boundary

Gate modules may inspect the node delivered to a visitor, iterate their resolved `ctx.files`, request a canonical source file, request the shared checker, and call shared readers. They may not call `Project#getSourceFiles`, `SourceFile#getDescendants*`, `forEachDescendant`, `new Project`, or maintain their own workspace cache.

The shared reader layer owns:

- stable local binding resolution until write/cycle/dynamic ambiguity, with no hop cap;
- import/export/namespace/destructuring/computed-literal symbol origin;
- static string/number/object/tuple/Zod value resolution;
- class/JSX/DOM writer provenance;
- schema, finite-shape, bus, section, Base UI, tenancy, CSS, and resource facts;
- sanctioned-home and exact grant liveness.

A unique policy algorithm may live in `verify/lib`, but repository walking, binding identity, static-value unwrapping, and resource loading are shared primitives. Unsupported syntax returns an unresolved fact or tool error; it never returns absence.

## Population vocabulary

Use the parked dispatch-fence research as evidence, not verbatim policy. Run its off-tree equivalence diff against all 255 current predicates first. The owner has now supplied the previously missing second use: generic Orb policies must be intentionally applicable to `tooling/src` and `tests/tooling`, not excluded because a copied client/package predicate forgot them.

Named roots and conventions cover ordinary breadth. Sanctioned homes remain exact reviewed grants with rename/deletion liveness, not fence subtraction. Resource gates declare `@none` for TS dispatch and their explicit resource population. A complex predicate that cannot be represented without loss stays a named population resolver in the one population module; it does not remain an anonymous closure in a gate.

## Exceptions and debt

There is no gate-specific exemption grammar and no count ratchet.

- hard policy is unsuppressible;
- ordinary node/file occurrences use one rule-specific marker with reason, position, unused, and over-broad checks;
- recurring repository permissions use typed exact grants with `why` and `endsWhen` plus post-success liveness;
- unresolved debt is a warning tied to a work item;
- authoritative runtime data such as `tokens.json` and generated-output parity remain enforced;
- current-population declaration counts, every-file manifests, and `*.baseline.json` debt retire.

## Atomic migration

Development commits may build migration tools and converted gate modules on this branch. The production runtime never accepts both shapes.

1. Build an off-tree census/equivalence command for descriptors, populations, direct walks, mutable state, baseline use, and shared-reader adoption.
2. Finish the population vocabulary and prove every old `scanRoot` admitted set byte-for-byte or record an intentional correction.
3. Build the new contract/runtime/query/authority/report path with planted host controls.
4. Consolidate shared readers before their gate families migrate. Replace fixed hop caps with visited-binding/write/dynamic refusal.
5. Convert every gate. Move state into `create`; replace direct walks with visitors/shared facts; replace baselines with fixes, exact grants, or warnings.
6. Run old/new differential over the same frozen/current corpus. Classify every changed finding and every population delta.
7. In one cutover state, switch loader/runner/CLI to the new contract and delete the old descriptor fields, old harness paths, legacy markers/baselines, migration command, and obsolete self-policing gates.

No adapter survives the branch. No gate is credited because a similarly named module exists; the loader, command, tests, and real run must exercise it.

## Acceptance

- all 255 current policies have one live owner or explicit retirement;
- zero `scanRoot`, `scopeSafety`, `begin`, `finalize`, free-form `run`, direct project/descendant walk, gate-owned Project, or mutable module-state accumulator remains in gate modules;
- every registered policy supports all declared command/scope/severity/report/authority capabilities;
- all source/helper/tests/exemptions were read in full and every current-main delta re-attested;
- aliases, namespace/re-export/destructure/computed/wrapper/shadow/write/cycle/dynamic variants are planted wherever identity matters;
- no baseline JSON or parallel registry remains;
- full structure, focused behavior, differential, failure/re-entry, broad CPD, and performance/RSS artifacts are read before owner review.
