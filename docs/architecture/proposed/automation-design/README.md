---
kind: spec
status: active
updated: 2026-07-03
---

# Automation Design — the prescriptive plan for `domain/automation` (D46 Tier 1, doc-set index)

> **Status: COMMITTED (D46, 2026-06-28).** This doc set is the authoritative BUILD design for the
> Tier-1 declarative automation layer (`Core-Laws-and-Precedents.md` D46 is the decision record and
> wins on any conflict; `../automation.md` remains the committed decision digest). Everything
> here is prescriptive and self-contained: a builder with ONLY this doc set + the orbweaver law docs
> (AGENTS-1/2/3, the domain docs it cites) can build the whole Tier-1 system. Every decision carries
> its WHY + the rejected alternative. Tier 2 (the QuickJS plugin host) is the sibling set
> [`../plugin-design/`](../plugin-design/README.md); the two share the trigger taxonomy (01), the

> **Triage 2026-07-09 (dispatch board — `../README.md` §0):** READY-TO-BUILD. A1–A3 are dispatchable NOW (kit-early, zero deps; the `global_variables` schema already landed). A4+ waits on the D46 variables substrate; A5–A7 additionally need chat obligations #3–#6 (none landed).
> CEL/macro expression layer (02), and the `can()` capability model.

## The one-paragraph design

A rule is **`on <trigger> where <predicate> do <actions>`**, all data: the trigger is a member of a
CLOSED taxonomy drawn from the per-chat `ChatBusEvent` stream and the closed domain-event bus (D38);
the predicate is CEL (`@marcbachmann/cel-js` — non-Turing-complete, linear-time) over a
server-resolved **TriggerFact** plus the same variable namespace macros use; the actions are an
ordered list from a CLOSED, capability-checked union (snake_case ids), each dispatched through a
domain front-door op injected at `entry/compose` — never a sideways import. A domain-owned
**watcher** subsystem (the chat-crew scheduler / buddy-observer pattern) subscribes to both buses,
matches enabled rules, and fires them with per-rule error isolation, cooldowns, per-chat rate + $
ceilings, and a **cascade-depth guard** (automation-initiated turns do not re-trigger automation by
default). Rules are host-authored per chat in v1 (D16/D46 conservatism); spend-class actions
(`trigger_turn`, `generate_image`) ride the turn pipeline's budget axis and the D17 consent gates
unchanged. The crew (`enqueue_crew_workload`) and rpg (`rpg_verb`) action arms the D58/D59 sets
claim are RESERVED — enumerated and typed, not built in v1.

## Reading order

| Doc | What it locks |
|---|---|
| [`01-triggers.md`](01-triggers.md) | the closed trigger taxonomy (v1 vs reserved, payload shapes), the TriggerFact re-read rule, the watcher subsystem |
| [`02-expressions.md`](02-expressions.md) | the CEL binding surface + budgets + failure posture, the `{{expr::…}}` macro, the macro-DX registry metadata + diagnostics + autocomplete API, per-user global variables (DDL + verbs + macros) |
| [`03-actions.md`](03-actions.md) | the closed action union (every arg schema, injected op, capability), the reserved crew/rpg arms, the runaway-cascade guard, the budget + consent axes |
| [`04-domain-shape.md`](04-domain-shape.md) | `automation_rules` DDL, lifecycle verbs, the dispatch engine, the 8-slot layout, the automation bus, the D50 `PromptTransform` seam |
| [`05-build-plan.md`](05-build-plan.md) | A1–A8 shippable chunks with sizes, dependencies, checkpoints, per-chunk test plans, and the Tier-1 review flags |

## Context: the variables substrate (Phase-5 law — do NOT redesign here)

Tier 1 stands on the D46 variables substrate, which is **being built by the live Phase-5
implementation** and is fully specified in `../automation.md` §1 + the D46 ledger entry. The
five facts a Tier-1 builder consumes (and must not reshape):

1. **Two planes**: config = ChoiceBlock picks (chat config, carried on fork); runtime = script
   variables stored as **per-variant deltas folded** along `selectedVariantId` in `seq` order, with
   a materialized current-state cache on the chat. The mutable bag is the REJECTED alternative.
2. **Scope**: the runtime bag is per-chat shared room state; a per-participant private overlay is
   reserved-additive. Values are strings at the persistence boundary.
3. **The macro `env`-by-reference rule**: one `MacroEnv` object threads through a turn, then the
   turn's delta is appended to the produced variant + the cache recomputed.
4. **Per-user global variables are committed** — a `fetchOwned` KV plane with no chat/variant/fork
   semantics. This doc set specs their DDL/verbs/macros (02 §4) because Tier 1 is their first
   consumer; the *decision* is D46's.
5. **Determinism**: clock/PRNG are injected on every eval path (`test-determinism`); no ambient
   `Date.now()`/`Math.random` anywhere automation evaluates anything.

## Standing decisions a cold agent must not re-litigate

The delta-fold variable model, CEL adoption (augments `kit/macro`, never replaces), the closed
trigger/action unions, host-authored-only v1 rules, and the QuickJS-ng Tier-2 commitment are all
D46 law — expanded here, never re-decided · action ids are **snake_case** (matching the D58 rpg
tool vocabulary); the image arm is `generate_image` over injected `imagery.generatePicture`
(imagery.md's exact names) and is DISTINCT from `trigger_turn` · prompt mutation is NEVER a bus
subscription — the D50 `PromptTransform` seam (04 §6) is the only synchronous transform mechanism ·
automation never blocks a turn (the D53 posture: predicate/action failures are logged + surfaced,
the turn proceeds) · the crew's built-in cadences stay scheduler-owned forever (chat-crew-design/05
§a) — `enqueue_crew_workload` is an ADDITIVE power-user arm, never the crew's trigger system · a
second rule engine anywhere else in the codebase is forbidden (D46; crew + rpg both cite it).
