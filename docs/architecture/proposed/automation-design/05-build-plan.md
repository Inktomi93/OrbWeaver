---
kind: spec
status: active
updated: 2026-07-03
---

# 05 — Build Plan: Chunks, Dependencies, Checkpoints, Test Plans

> **Status: COMMITTED (D46) — prescriptive design; the ledger D-entry wins on any conflict.**
> Phase-8 sequencing per the Feature-Map §2e, EXCEPT A1–A3 (kit-only, no chat dependency — may land
> any time after Phase 4). Green-to-commit per AGENTS-1: `pnpm check` + `pnpm test` per chunk.

## Dependencies (what must exist first)

| Dependency | Source | Consumed by |
|---|---|---|
| `can()` chat resource axis (`host`) | Phase 5 (PD-1 RESOLVED — live in `@orb/contracts/identity`) | A4, A5 |
| `ChatBusEvent` subscription seam + replay ring | Phase 5 chat | A5 |
| turn pipeline non-human initiator + budget axis + `getTurnOrigin` read | Phase 5 chat (D46 prereq #3; the origin read is NEW — flagged, README) | A6 |
| variable seam (`applyVariableOps`, fold-cache read) | Phase 5 chat (D46 prereq #1) | A5, A6 |
| `worldInfo.upsertEntries` op | D58/D59-committed WI op | A6 |
| `imagery.generatePicture` + `generateImageActionArgsSchema` | Phase 7 `domain/imagery` (`proposed/imagery-design/` 01 §6 / 04 §1) | A6 (the `generate_image` arm ships dark until imagery lands) |
| `notifications.emit` + the additive `automation-notice` member | notifications domain | A6 |
| D48 `domain/tool-use` registry | Phase 7 | nothing in Tier 1 (Tier 2 only) |
| `PromptTransform` pipeline points | Phase 5 chat (built WITH chat — 04 §6) | A7 |

## Chunks

| # | Chunk | Size | Contents | Checkpoint (must demo) |
|---|---|---|---|---|
| A1 | Macro-DX layer | **M** | `MacroMetadata` + backfilled builtin metadata, arg validation (strict/lenient), parser spans + `MacroDiagnostic`, `queryMacros` (02 §5) | every builtin macro has metadata (a `satisfies`-complete test); a bad-arity call yields a spanned diagnostic; `queryMacros({prefix:"get"})` returns the getvar family |
| A2 | CEL + `{{expr}}` | **S** | `@orb/kit/cel` seam, the `{{expr::…}}` macro, the 2 KiB cap (02 §1–3) | golden CEL vector suite green; an expr parse error renders `""` + diagnostic |
| A3 | Global variables | **S** | `global_variables` DDL, the four verbs, `{{getglobalvar}}`/`{{setglobalvar}}`, CEL `global` map (02 §4) | cross-user read impossible (fetchOwned test); swipe does NOT rewind a global (pinned semantics test) |
| A4 | Contracts + store + lifecycle | **M** | `@orb/contracts/automation` (trigger tuples, action union, bus union, ops types), `automation_rules`/`automation_budgets`/`automation_fires` DDL, ID prefixes, verbs incl. `testRule` (04 §1–2) | createRule refuses reserved triggers/arms + unparseable CEL; testRule renders arm previews with zero op calls; reorder is total |
| A5 | Watcher + dispatch engine | **L** | the watcher subsystem, fact resolver, dispatch sequence, budget gates, error isolation, auto-disable, the automation bus (01 §3, 04 §3/§5) | a rule fires end-to-end off a real chat event; a throwing rule leaves siblings + the turn untouched; the chat-Set pre-check shows zero rule reads on rule-less chats |
| A6 | Action arms (non-transform) | **M** | `ARM_EXECUTORS` for arms 1.1, 1.3–1.7 + the cascade guard + spend accounting (03) | `trigger_turn` respects depth-cap + budgets + D17 consent; `generate_image` = the `/imagine` path over `imagery.generatePicture`; budget refusal logs `budget_refused` and fires nothing |
| A7 | `transform_draft` + the D50 seam | **M** | the `PromptTransform` contract + pipeline points (chat-side, coordinated with the chat builder), automation's registrar, the 250 ms skip rule (04 §6, 03 §1.2) | a transform rewrites user_input pre-regex; a hung transform is skipped + warned, turn completes; static half byte-identical with transforms present |
| A8 | Client surfaces | **M** | rule editor (CEL/macro diagnostics inline, strictArgs on), rule list + reorder, fire log, budget panel, quick-reply chips, `automation.stream` wiring | out of server scope — Phase-6/8 client chunk; listed for sequencing honesty |

Honest sizing note: A5 is the L — it integrates two buses, budgets, and error isolation, and its
failure modes are the product. Nothing here is an S dressed as an M except A2/A3, which are
genuinely small because `kit/macro` and `fetchOwned` already exist.

## Per-chunk test plans

- **A1:** metadata completeness (`satisfies Record<builtin, MacroMetadata>`); arity/type matrix
  (strict throws→""+error diag; lenient warns); span accuracy fixtures (multi-line templates,
  nested macros); autocomplete prefix/alias/category cases.
- **A2 (CEL goldens):** a committed vector file `cel-goldens.json` — {expr, env, expected} triples
  covering: string/number comparison, `has()` guards, list membership over
  `event.worldInfo.entryIds`, `now.hour` windows, type-error → skip, the 2 KiB refusal, non-boolean
  predicate → error. The suite is the determinism gate: run twice with the same injected clock —
  byte-identical outcomes (`test-determinism`).
- **A3:** fetchOwned isolation (user B's read of A's key → null); 64 KiB value CHECK; flush-at-commit
  (a preview render writes nothing); last-write-wins pinned.
- **A4:** every validation refusal typed + tested (reserved trigger, reserved arm, bad CEL, arm
  cap 8, unattached book, cooldown floor with notification arm); lazy-parse fault isolation (a
  corrupt actions blob disables ONE rule); the `LIVE_TRIGGERS` / `ARM_EXECUTORS` mapped-type
  Records compile-pin exhaustiveness.
- **A5:** end-to-end fire off a replayed ChatBusEvent fixture; ordering (two rules mutating one
  var — position order observable); isolation (rule 2 throws, rule 1 + 3 fire); auto-disable at
  20 + notification; budget gates (cooldown, per-rule/hour, per-chat/hour) against an injected
  clock; **byte-identity: a chat with zero rules assembles + streams identically with the watcher
  wired vs absent** (the rpg/crew no-op precedent).
- **A6 (budget-enforcement + cascade):** the loop test — rule A `trigger_turn` on
  `turnCompleted`: with `match_automation_events=false` the automation turn fires NO rules; with
  opt-in, depth 3 hard-stops regardless of flags; spend ceilings — the 11th spend action of the
  day logs `budget_refused`; $ ceiling accumulates from returned `costUsd` and UTC-rolls over on
  the injected clock; D17: a non-owner-authored hosted-cred turn refused with consent OFF
  (fail-closed).
- **A7:** transform order (automation 0-999 before plugin 1000+ — with a stub 1000-order
  transform); deadline skip + warning; user_input point ordering vs USER_INPUT regex (a regex
  matching the TRANSFORMED text proves the order); static-half byte-identity.

## Review flags (Tier-1 — argued here, decided by Nate/the owning builders)

1. **`chat.getTurnOrigin` + the `initiator`/`automationDepth` turn-record fields** are NEW
   chat-contract surface this design requires (03 §4). D46 prereq #3 already demands a non-human
   initiator on the pipeline; this makes it READABLE. The Phase-5 chat builder must land the
   fields; the read op can come with A5. Flag: confirm with the live chat implementation.
2. **`automation-notice` carries a rendered `message` string** (03 §1.5) — a deliberate exception
   to the notifications ids-only habit, argued there. Notifications owner should ratify.
3. **Naming drift: RESOLVED (2026-07-01)** — chat-crew-design/05 §a reconciled to
   `enqueue_crew_workload` (snake_case), and rpg-design/09 §b claims `rpg_verb` +
   the `RpgAutomationVerb` vocabulary. No open drift.
4. **`variantSelected` fires AFTER the variable re-fold** — an ordering requirement on chat's
   swipe path (01 §1) so predicates over `vars` see post-swipe truth. Cheap if known now, a
   heisenbug if discovered later. Flag to the chat builder.
5. **rpg's reserved arm is named `rpg_verb` here** with a `verb` enum owned by rpg-design; rpg-design/09b
   left it unnamed ("a `rpg-verb` action arm"). The rpg set should claim the verb vocabulary when
   it wires.
