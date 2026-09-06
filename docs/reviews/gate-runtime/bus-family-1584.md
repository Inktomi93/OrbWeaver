---
kind: review
status: active
updated: 2026-09-06
---

# Bus producer family conversion for #1584

## Final shared fact

The legacy producer helper accepts a raw `Project`, performs its own source walks, identifies emitter doors through central name/path tables, and resolves only narrow local aliases. The replacement at `90905786b` is visitor-fed and receives no `Project`, filesystem, grant table, or private walker.

The object-keyed `ctx.sharedFact` prototype at `bb6c76fde` was measured, then removed. Commit `3d8abaf5b` makes `busProducerFact` a first-class `defineFact` provider. It owns the exact contracts/server population, analysis tier, collector hooks, finish result, receipt, timing, and errors. All five policies declare the same provider token and read it through `ctx.fact(busProducerFact)` after finish. The planner records the provider population before execution; the dispatcher instantiates and walks it once; one failure withholds every consumer. Duplicate ids, early/undeclared reads, selected-file consumers, unused dependencies, and resource/receipt drift refuse centrally.

The fact is deliberately limited to producer coverage: exported bus unions, shaped `*_EVENT_TYPES` belts, declared members, proven emitters, and unresolved identities. The earlier WIP also collected client consumer maps and coverage-policy descriptors. Those unused future fields were deleted after they caused false `LIVE_ONLY_CHAT_EVENT_TYPES` refusals and added work to every producer run. `bus-definition-belts` will consume a separate definition fact instead of making producer checks pay for speculative data.

Emitter identity has two required halves. The callable must resolve to an injected function/property or the canonical `defineBusChannel(...).publish` receiver, and its source must lie under server domain/transport; only `ChatBusEvent` additionally admits `entry/compose`, matching the legacy reach ruling. Calls on local same-typed functions, unrelated receivers, and automation composition wiring remain non-producers. Wrapper relays start only at one of those proven sinks and propagate through exact function declarations.

The type reader uses the installed ts-morph v28 `Type` API rather than requiring `Type#getAliasSymbol()`. Conditional types such as `Extract<ChatBusEvent, {type:"memoryRecall"}>` resolve to anonymous object types and legitimately have no alias symbol. Parent-bus selection therefore reads the resolved parameter type's `type` property and literal union through `Symbol#getTypeAtLocation`; a canonical alias declaration is only an exact fast path. This repaired the real `emitRecallPhase?.({type:"memoryRecall", ...})` producer without text parsing.

Dynamic emitter arguments are not fact-health failures. They contribute no producer proof; a member with no statically provable producer remains an ordinary missing-emitter finding. Static undeclared discriminators, malformed belts, missing unions, ambiguous belts, and empty member sets remain fail-closed unresolved identities.

## Conversion manifest

| Legacy id | Final disposition | Authority/severity | Final population |
| - | - | - | - |
| `automation-bus-coverage` | converted; shared missing-emitter policy | ordinary/error | contracts + server TS/TSX, entire population |
| `bus-coverage` | converted; shared missing-emitter policy | ordinary/error | contracts + server TS/TSX, entire population |
| `domain-events-coverage` | converted; shared missing-emitter policy | ordinary/error | contracts + server TS/TSX, entire population |
| `rpg-bus-coverage` | converted; shared missing-emitter policy | ordinary/error | contracts + server TS/TSX, entire population |
| `user-bus-coverage` | CONVERTED 2026-09-06; split into the ordinary coverage policy plus the `user-bus-deferred-member` warning-debt sibling (#1822). Evidence: [bus-pair-1584.md](bus-pair-1584.md) | ordinary/error + hard/warning | contracts + server TS/TSX, entire population |
| `bus-definition-belts` | CONVERTED 2026-09-06; split into `bus-definition-belts` + `bus-belt-total` + `bus-consumer-belt` + `bus-coverage-owner` on a second `busDefinitionFact` provider, with all three name tables derived. Evidence: [bus-pair-1584.md](bus-pair-1584.md) | hard/error | contracts + client + server TS/TSX, entire population |

`bus-fact-health` is a new hard/error support policy in family `bus-fact`. It shares the same collector and reports missing/empty/unresolved producer facts on the first delivered contracts/server source. Each ordinary producer policy also calls `recordReadyBusFact`, so selecting one without the health policy still withholds an incomplete fact.

The legacy harness physically loaded all 7,048 current authored TS/TSX files for each producer policy, but its semantic predicates read only the contracts union/belt home and server domain/transport/allowed-compose emitters. The final population intentionally declares that real subject: 1,570 contracts/server TS/TSX files. This is a classified raw-scan reduction, not a semantic omission. `.mts/.cts/.mjs/.cjs` remain outside both old gate execution and final policy source population.

## Verification

The four converted policies have 15 final proof rows. The final conformance runtime passes all 15, and an off-tree legacy replay over the same fixture maps agrees on every flag/pass arm. Added controls cover local same-typed functions, unrelated receivers, automation compose-only wiring, arbitrary typed yield relays, wrong-channel yields, literal chat synthesis, optional injected callbacks, and conditional bus-arm types. The separate health policy adds two passing missing/nonempty fact controls.

The current typed workspace differential after merging local `main` at `f4fd77dbf` is:

- full loaded project: 7,128 TS/TSX files;
- effective provider/policy population: 1,585 contracts/server files;
- shared fact: 66 declared members, zero unresolved identities;
- legacy findings for the four producer policies: 0/0/0/0;
- final findings for the four producer policies: 0/0/0/0;
- final tool/authority errors: zero.

Performance was measured with `/usr/bin/time -v` under the workspace-provided `NODE_OPTIONS=--max-old-space-size=16384`. The host had about 90 GiB available and the measured child used no swap, so these are algorithm/checker costs rather than heap starvation.

| Implementation | Semantic/tool time | Process wall | Peak RSS | Result |
| - | -: | -: | -: | - |
| legacy four-policy reconciler | 4.24 s | 9.37 s | 1.67 GB | clean |
| rejected broad per-policy WIP | 185.60 s for one policy | 212.58 s | 6.09 GB | incomplete |
| shared broad fact after correctness repair | 17.45 s policy | 33.91 s | 5.13 GB | clean |
| final narrowed shared producer fact | 13.27 s policy; 15.64 s pass | 22.32 s | 3.01 GB | clean |
| first-class `busProducerFact` | 10.78 s fact; 12.78 s pass | 19.43 s | 3.02 GB | clean |
| provider after local-main merge | 17.23 s fact; 19.30 s pass | 35.31 s | 3.22 GB | clean |

A proposed argument-first prefilter was discarded after it remained live beyond 3:51: resolving static/reference expressions for every call argument cost more than checking callee provenance. The retained optimization derives candidate injected door names from callable declarations, admits direct authored `{type: ...}` arguments, validates every candidate semantically, and makes `.publish` prove the canonical bus-channel origin.

The provider remains slower than legacy in isolation, and the merged-tree run shows material timing variance under the larger corpus/current host load. The final runtime shares its typed Project, checker, physical source walk, and providers with the rest of the gate fleet; the atomic cutover performance/RSS battery must measure repeated composed commands before acceptance. No compatibility adapter or second workspace loader was added.

A no-grant generic-producer probe was blocked here: it correctly found the intentional
`UserBusEvent.connectionsChanged` debt but also missed the live `chatsChanged` relay through a conditional
local event, `publishUserEvent`, and `defineBusChannel.publish`. **That blocker is closed** (2026-09-06,
[bus-pair-1584.md](bus-pair-1584.md) §1): the door was ONE fact, not three — `defineBusChannel` is an
OVERLOADED export, so `resolveModuleMemberOrigin` refused its minting call as `ambiguous` and every real
`bus.publish(...)` fell through as a non-door, which in turn made the parameter forward above it
unreachable. The door is now the `publish` METHOD's declaration home, and the argument ladder is
authored syntax -> parameter relay -> republish relay -> checker flow type -> refusal. The four policy
modules are still not consolidated: they differ only in their `UNION` constant, so the consolidation is
now a live follow-up rather than a blocked one.

## The conditional publisher (2026-09-06)

The producer fact proves three shapes it could not see before, and refuses one it must never harvest:

- an argument bound to a `const` whose initializer is a `ConditionalExpression` of authored literals (the
  syntax reader always handled this; it was never REACHED, because the sink below it was not a door);
- a wrapper that forwards its own parameter to `defineBusChannel.publish`, propagated to its callers;
- `TABLE[<projection of the relayed parameter>]` — the coarse per-user republish — carried as a relay
  whose translation is READ from the table, never assumed to be the identity;
- an argument whose flow type is the WHOLE declared union is a FORWARD: no emission, and no fact-health
  failure. Harvesting it is the measured false green the `UserBusEvent` header records, and it is also the
  shape of an honest subscriber forward (`entry/compose/automation-watcher.ts:136`). The family's standing
  ruling that an unprovable emitter argument is an ordinary missing-emitter finding therefore SURVIVES,
  with its condition restated in checker terms; a refusal is now reserved for an argument the checker
  cannot read at all (`any`/`unknown`/no literal discriminator).

Real-tree differential on the same checkout, `f6078a884` vs the model: 66 declared members and zero
unresolved identities in both; proven emitters 269 -> 271, as an anchor-set difference of exactly two —
`chatsChanged @ transport/trpc/user-events-bus.ts:43` (the conditional publisher) and
`variantSelected @ domain/chat/verbs/edit.ts:516` (`const emit = deps.emit`, an injected door held one
binding later, which `emitterSink` used to drop at its Identifier early return). `connectionsChanged`
remains the only unproduced member on the tree, and all five producer policies stay 0/0.

The producer FENCE is symmetric: a relayed emission is credited only where a direct call would be, so a
wrapper reached from `entry/` earns nothing (this family's own "a compose-only publisher is wiring, not a
producer" ruling), while the relay still propagates to a domain/transport caller further out.

## Remaining bus work

1. Convert `bus-definition-belts` with derived root/sub-union classification, shaped belt equality, and either client total-map or server exhaustive-consumer proof. Retire its `BELT_EXEMPT`, `SERVER_INTERNAL_REACH`, and coverage-file naming tables rather than porting them.
2. Resolve `user-bus-coverage` as a shared producer consumer. The `connectionsChanged` absence must receive a real warning work item or one exact reviewed grant with liveness; no invented issue number or local deferred map is allowed.
3. Run the bus family through the final loaded roster/command front door after that pair converts, then remeasure composed performance/RSS and obtain cold review before cutover.
