# 1041 shard s3-bus-registry-1 (tool: type-registry)

Gates: bus-belt-total, bus-consumer-belt, bus-definition-belts.

## Verdicts

| Gate | Verdict | Successor |
| - | - | - |
| bus-belt-total | done | `BeltMismatch` / `BeltMismatchOf` in `packages/contracts/src/bus-registry/index.ts`, held at `never` by `tests/contracts/bus-registry/bus-registry.test-d.ts` (node program) and `bus-registry.dom.test-d.ts` (browser program); unregistered belts refused by `orb/bus-union-registered` |
| bus-definition-belts | done | `orb/bus-union-registered` plus one `orb/bus-home-<bus>` restriction per `BUSES` / `BUS_SUBUNIONS` row (`eslint.config.js`, `BUS_REGISTRY_RESTRICTIONS`), `SubUnionEscape`, `BusBelts` indexing |
| bus-consumer-belt | escalate | gate kept; no native successor can express the server exhaustive-dispatch arm |

## Registry shape

`BUSES` in `packages/contracts/src/bus-registry/index.ts` names, per bus, the union alias, its `*_EVENT_TYPES` belt and the one file that declares them. `BUS_SUBUNIONS` does the same for the spliced sub-union. Both are `satisfies`-total over the bus names, and `eslint.config.js` reads them, so the lint list cannot drift from the registry. `BusUnions` / `BusBelts` map each bus name to its union and `typeof <belt>`; `BeltMismatch` is a mapped type over every `BusName` (discriminators a belt omits plus members it invents).

Identity is the pair (name, home file): a registered name declared in any other contracts file is refused by `bus-home-<bus>`; an alias spelled `*BusEvent` / `DomainEvent` that is not registered and not an `Extract`/`Exclude` carve-out of a root is refused by `bus-union-registered`; a `*_EVENT_TYPES` const shaped `satisfies Record<X["type"], ...>` or `readonly X["type"][]` that is not a registered belt is refused by the same rule.

The tuple belts (`DOMAIN_EVENT_TYPES`, `RPG_BUS_EVENT_TYPES`) stay tuples: converting them touches `z.enum(RPG_BUS_EVENT_TYPES)`, `DomainEventType` and legacy tests for no extra claim. Totality comes from `BeltMismatch`.

## bus-belt-total

- Descriptor read: whole file, 140 lines, 2 mustFlag (omitted member, foreign member) and 3 mustPass (total tuple, total object, derived sub-union carrying no belt).
- parity: 2 mustFlag / 3 mustPass ported, 0 lost.
  - omitted member: `BeltMismatchOf<Rpg, readonly ["sheetChanged"]>` is `"rollResolved"`.
  - foreign member: `BeltMismatchOf<Rpg, [..., "ghost"]>` is `"ghost"`; short-and-foreign reports both halves.
  - total tuple and total object: `never`. Derived sub-union with no belt: no `BusBelts` entry, admitted by `orb/bus-union-registered` (Extract/Exclude carve-out test in `native-bus-registry.test.ts`).
- Real-door plants (this redo):
  - Drop `"world-info.updated"` from `DOMAIN_EVENT_TYPES`: `pnpm test:types tests/contracts/bus-registry/bus-registry.test-d.ts tests/contracts/bus-registry/bus-registry.dom.test-d.ts` exit 1, both programs fail "every registered belt carries exactly its union's discriminators" at `:10:32 Expected 1 arguments, but got 0`. Restored; clean re-run 14 of 14.
  - Refuter's shadow belt, `packages/contracts/src/zz-vplant/d.ts` = `export type UserBusEvent = {type:"a"}|{type:"b"}; export const SHADOW_BUS_EVENT_TYPES = ["a"] as const satisfies readonly UserBusEvent["type"][];` and `LOOSE_EVENT_TYPES = { a: true } satisfies Record<FooEvent["type"], true>`: `pnpm exec eslint` with the repo config exits 1, `2:73` and `3:63` `orb/bus-union-registered` (belt not in the registry), `1:8` `orb/bus-home-user`. Plant deleted.
- Red first: with the `_EVENT_TYPES` belt selector disabled and the `bus-home` spread filtered to nothing, `native-bus-registry.test.ts` fails 3 of 7 (shadow belt not refused, registered alias admitted in a stranger file, respelled alias count 1 not 2). Restored; 7 of 7 pass.
- Node vs browser: the type test now runs in both `types-node` and `types-browser` (the `.dom.test-d.ts` twin), so a belt gap that appears in one world only is caught.
- Lost claim, precisely:
  - A belt whose union is reached through an indirection the selector does not see (`type T = XBusEvent["type"]; ... satisfies readonly T[]`, or no `satisfies`) is not refused. The old fact resolved the union with the type checker; the successor reads the spelling `Union["type"]`. Every live belt uses the direct spelling.
  - The old fact's `ambiguous` refusal (two belts over one union) is expressed only through names: a second belt under another name is an unregistered belt, the same name elsewhere is refused by `bus-home`.
  - The old fact's `missing` refusal (a `*_EVENT_TYPES` belt resolving to no discovered union, e.g. over `FooEvent`) is expressed as an unregistered belt (`FOO_EVENT_TYPES` test in `native-bus-registry.test.ts`).

## bus-definition-belts

- Descriptor read: whole file, 138 lines, 3 mustFlag and 3 mustPass rows.
- parity: 3 mustFlag / 3 mustPass ported, 1 mustPass (a client map keyed on a union outside the population, a crash control of the deleted fact reader) has no native analogue.
  - beltless union: `export type ProbeBusEvent = ...` refused (1 finding).
  - `DomainEvent` by name: a root, so a beltless one fails `BeltMismatch`; the lint regex still matches the name.
  - `WiBusEvent` spliced into nothing: `SubUnionEscape` goes non-never (test "every sub-union is contained by the belted root it names").
  - belted root, spliced sub-union, Extract/Exclude pair: admitted (lint tests "a registered alias or belt keeps its identity only in its registered file" and "carve-outs of a registered root are admitted without an entry").
- Real-door plants (this redo), `packages/contracts/src/zz-vplant/b.ts` = `export type ChatBusEvent = { type: "archived" }; export type WiBusEvent = { type: "wiGhost" };`: `pnpm exec eslint` exit 1, `1:8 orb/bus-home-chat` and `2:8 orb/bus-home-wi`. The refuter's grown carve-out `GrownBusEvent = Exclude<ChatBusEvent, ...> | { type: "archived" }` is refused by `orb/bus-union-registered` (test case in `native-bus-registry.test.ts`). The nine live contracts bus files lint clean (exit 0). Plants deleted.
- Lost claim: the old gate judged unions by resolved declaration; the successor judges by spelling. An alias with a registered name is refused outside its home; an alias with an unregistered name is refused unless it is literally `Extract`/`Exclude` of a registered root. A union built any other way under a name that does not end `BusEvent` / is not `DomainEvent` is not seen (the old gate also keyed on those names). Stricter than the gate in two directions: a non-exported alias is judged too, and a sub-union that is neither listed nor an Extract/Exclude carve-out now needs a registry entry.

## bus-consumer-belt (escalate)

Kept in place. The client arm (a mapped-type total map keyed by the union) is expressible with exports of the four filter maps plus a type test over `BusName`. The server arm is not: the gate accepts a `never`-parameter guard whose argument flow type is `never` (mustFlag row 2 rejects a partial dispatch, mustPass row 3 accepts the exhaustive one). The only `DomainEvent` consumers are two `switch` + `assertNeverEvent` functions (`packages/server/src/domain/chat/verbs/room-refresh.ts:53`, `packages/server/src/domain/embeddings/indexer/subscription.ts:5`); a native successor needs them restructured into a `Record<DomainEvent["type"], handler>` map or a typed-lint `switch-exhaustiveness-check` per server program. That is a production design change, so it is left for the owner. With its siblings deleted, `family: "bus-definition"` became a singleton and `policyFamilyNames` refuses it (`lib/policy-module.ts:79`), so the gate's family is now `bus-consumer-belt`. Parity: 0 ported (gate kept).

## Scaffolding removed

- `tooling/src/verify/gates/bus-belt-total.ts`, `bus-definition-belts.ts` deleted.
- `_liveness/multi-root-a.ts`: imports and two arms removed.
- `bus-pair.suite.test.ts` became `bus-consumer-belt.suite.test.ts`.
- `native-bus-delivery.int.test.ts`: the two gates dropped from `POLICIES`; the shared-carrier test reads `busDefinitionFact` through a local probe policy.
- Citations repointed: `policy-refusal-coverage.ts`, `bus-fact-relay.suite.test.ts`, `bus-definition-fact.ts` (comments only), `bus-consumer-belt.ts`, `bus-on-data-no-store-write.ts`, `policy-fixture-substrate.ts`, contracts and client comments, `docs/law/client-architecture-state-and-gates.md` G11.
- Producers kept: `busDefinitionFact` (read by `bus-consumer-belt` and the KEEP gate `bus-producer-coverage`). The rewire of `bus-producer-coverage` to the registry is not done here.
- Waivers and grants: `rg` for `@orb-waive bus-*`, `policyId: "bus-*"`, waiver-budget and spelling-twin rows returns no hits for the three ids. Nothing to rejudge. No new waiver, disable, cast or suppression.

## Checks run

- `pnpm test:types` on both `bus-registry` type tests: clean 14 of 14; planted run exit 1 (above).
- `pnpm test:scoped`: `native-bus-registry.test.ts` 7 passed (3 failed with the rules mutated), `bus-consumer-belt.suite.test.ts` 3, `bus-producer-coverage.test.ts` 7, `bus-fact-relay.suite.test.ts` 15, `native-bus-delivery.int.test.ts` 9, all passed.
- `pnpm exec eslint` on the nine live contracts bus files: exit 0. On the two plants: exit 1, five findings, all intended.
- Biome on the 22 changed files: clean after one format fix.
- `pnpm typecheck --config tsconfig.json` under the heavy lock: see the commit message.

## Owed

- `pnpm lint:eslint-scoped` after the `eslint.config.js` edit.
- `pnpm check:ledgers-fresh` regeneration of `docs/law/Core-Enforcement-Active-Gates.md` (two rows removed, `bus-consumer-belt` family column changes).
- Real-corpus liveness suite (`_liveness/multi-root-a.ts` consumers) and focused `check:structure --check bus-consumer-belt` / `bus-producer-coverage` on the merged tree.
- Knip and `pnpm ast` on the new `bus-registry` exports.
