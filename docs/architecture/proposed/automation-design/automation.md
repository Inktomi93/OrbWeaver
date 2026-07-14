---
kind: spec
status: active
updated: 2026-07-03
---

# Orbweaver — `automation` domain + `plugin` domain (Scripting, Automation, Extensibility)

> **Status: COMMITTED (D46). Promoted from `proposed/scripting-automation-extensibility/`. Phase 8.**
> Authoritative expansion of D46. The ledger D-entry wins on any conflict with this doc.
> Source proposal: `proposed/scripting-automation-extensibility/scripting-automation-extensibility.md`.
> **Authoritative build design: [`README.md`](README.md) (Tier 1) + [`../plugin-design/`](../plugin-design/README.md) (Tier 2) — win on detail; this file remains the committed decision record.**

---

## 0. The headline

**Three tiers, in priority order:**

1. **Variables substrate** — two-plane model (ChoiceBlock config picks + runtime deltas folded along
   `selectedVariantId`). MUST be shaped into Phase-5 chat build or it's a migration. **DECIDED.**

2. **Tier 1 — `domain/automation`** — declarative event→predicate→action automation leaf. An additive
   post-Phase-5 graft.

3. **Tier 2 — `infra/plugin-host` + `domain/plugin`** — committed QuickJS-ng WASM sandbox with dual-mode
   (installed plugins + ad-hoc inline snippets). Sequenced after Phase-5 seams. **COMMITTED — not a maybe.**

---

## 1. Variables substrate (Phase-5 born-compliant — shape before chat is built)

### 1.1 Two planes

Neo conflates two different things into one `variableValues` bag. Orbweaver separates them:

**Config plane — ChoiceBlock picks.** Preset-author-declared typed variables; user picks per chat;
picks are chat config (set via the picker, not mutated by message macros). Stored on the chat and
**carried on fork** like `pinnedPersonaId`. Neo's ChoiceBlock model kept verbatim (including
raw-vs-merged read split and `randomPick` resolving before assembly — no macro leaks downstream).

**Runtime plane — script variables.** Values mutated by macros/regex/automation during a turn
(`{{setvar}}`/`{{incvar}}`/…). This is where swipe/fork correctness lives.

### 1.2 Runtime variables: per-variant deltas, folded — DECIDED 2026-06-28

**Problem with the mutable bag** (ST + neo both): a `{{setvar}}` inside a generated message mutates
shared state; swiping that message to an alternate generation does NOT rewind the variable, re-running
the setter clobbers/compounds it. ST ships this as a known bug (#3263); neo declared it out-of-scope.
Orbweaver must get it right the first time.

**The model (derive-don't-stamp applied to variables):**

- Each `message_variant` records the **variable delta it applied** (ordered list of var ops: `set/add/inc/dec/delete` with key+operand)
- The chat's **current runtime variable state = deterministic fold** of those deltas over the message chain, following each message's `selectedVariantId` (the swipe pointer — D26), in `seq` order
- A **materialized current-state cache** (a `variableValues`-shaped column/blob on the chat) gives O(1) reads; recomputed only on mutating events (new turn, swipe, edit, branch)

**Why this is the right call:**

- **Swipe correctness for free** — repointing `selectedVariantId` re-folds; ST #3263 cannot occur
- **Fork correctness for free** — a fork copies the message chain (D27); vars fold from it; no special-case bag-copy
- Same "derive the truth from canon, don't stamp a mirror" discipline as D20/D23

**The macro `env`-by-reference rule is KEPT** (neo): one object threaded through assembly + regex + guided within a turn, then flushed. "Flush" = append this turn's delta to the produced variant + recompute the cache. Do not re-split it.

**The mutable bag (neo's model) is recorded as the REJECTED alternative** — do not reintroduce it as a "simplification."

### 1.3 Scope, types, globals

- **Scope: per-chat shared bag (room state).** Variables are narrative/room state, not private data.
  A per-participant private overlay is reserved-additive (a `chatId+userId`-keyed store).
- **Types:** strings at persistence boundary; structured data is JSON-in-a-string; no deep-path/`getat`/
  `setat` ops in v1 (Tier-2/LALib territory).
- **Global variables: BUILD (committed).** A `fetchOwned` KV table (`ownerId`+key→value), surfaced via
  `{{getglobalvar}}`/`{{setglobalvar}}` macros + CEL. Puts orbweaver at-or-above ST's two-store model
  with ownership rigor (no cross-user reads via `fetchOwned`).

### 1.4 Macro engine DX — COMMITTED (additive to `kit/macro`)

orbweaver's existing `kit/macro` is ABOVE ST on correctness (injected clock + PRNG + DoS budget). Add ST's
new macro engine's DX layer to reach at-or-above parity:

1. **Macro registry metadata** — per-macro `description / category / typed arg defs / returnType / aliases`
2. **Arg arity + type validation** off that metadata (strict throws, else warns)
3. **Parse diagnostics with location spans** — carry offsets through the parser (line:col:len)
4. **An autocomplete / macro-browser query API** fed by (1), consumed by Phase-6 client

### 1.5 CEL — ADOPTED as the expression/predicate layer

`@marcbachmann/cel-js` — non-Turing-complete, linear-time, mutation-free. **Augments `kit/macro`, does not replace it:**

- `kit/macro` = the interpolation + mutation layer (`{{setvar}}`/`{{if}}`)
- CEL = the safe expression evaluator for rule conditions and computed values

One variable namespace, two composed roles. CEL surfaceable inside templates via an `{{expr::…}}`-style macro.

---

## 2. Tier 1 — `domain/automation` (declarative automation leaf)

### 2.1 The model

A rule is **`on <trigger> where <predicate> do <action>`**, all declarative:

- **Trigger** — member of a **closed event union**. Chat-lifecycle triggers come from the per-chat
  `ChatBusEvent` stream; cross-domain triggers from the closed domain-event bus (`@orb/contracts/events`, D38).
  Adding a trigger = a union member + a handler (code change in one home).

- **Predicate** — a boolean/typed expression in **CEL** evaluated against the same `MacroEnv` variable
  namespace macro uses. Non-Turing-complete, bounded, deterministic.

- **Action** — member of a **closed, capability-checked verb union**, dispatched through a domain front door
  injected at the composition root (`domain-no-cross-feature`):
  set a chat variable · run a macro template over the draft · insert a world-info entry · surface a
  quick-reply button · post a notification · **trigger a generation** (the gated one — hits the budget axis).

### 2.2 Homes

| Piece                                                    | Home                                    |
| -------------------------------------------------------- | --------------------------------------- |
| Rule schema + closed trigger union + closed action union | `@orb/contracts/automation`             |
| Rule store + lifecycle + dispatch                        | `domain/automation/` (8-slot leaf)      |
| Predicate engine                                         | `kit/macro` + CEL                       |
| Variable read/write actions                              | through the chat domain's variable seam |

### 2.3 Authority model

- **v1: owner/host-authored only** (D16/D20/D29 host-only-v1 conservatism).
- **Member-authored rules: reserved-additive.** A member rule writes to the per-participant overlay, never
  the shared room bag. Widening a member _write_ to shared room state is a security-model change — NOT a
  free dial.
- **Autonomous spend budget:** a per-rule + per-chat rate + token/$ ceiling on automation-initiated
  generations. Hosted-cred autonomous turns require owner-consent AND fall under the budget. An
  event→action→turn→event loop is otherwise a runaway-spend vector.

---

## 3. Tier 2 — `infra/plugin-host` + `domain/plugin` (the code sandbox — COMMITTED)

**Committed as a deliverable** (Nate's call). Sequenced after Phase-5 seams (it depends on the `can()`
capability axis, the chat event bus, the turn pipeline).

### 3.1 Dual-mode (COMMITTED)

**Installed plugins** — manifest-declared, capability-granted, persistent extensions.
**Inline snippets** — user types a script in the chat box and runs it now: same membrane, same author
principal, same `can()` gates, transient (no install, no manifest beyond caller's own authority).

One runtime, one capability model, one determinism seam. No third "lite scripting" tier.

### 3.2 Committed tech

**Runtime: QuickJS-ng via `quickjs-emscripten` (WASM), in-process.** The WASM boundary makes host/guest
memory aliasing physically impossible. Per-call interrupt + memory cap = enforceable DoS budget.

**Rejected (do NOT revisit):**

- `isolated-vm` — maintenance mode; V8 cannot unwind OOM (crashes the whole process on hostile code)
- SES/Compartments — `lockdown()` mutates global intrinsics process-wide
- WASM-component / Zed model — forces plugin authors to compile Rust/Zig (wrong ergonomics); copy its _manifest/capability shape_, not its runtime

**The membrane, not a god-object.** Host API = a single frozen, versioned, typed surface in
`@orb/contracts/plugin` (`PluginHostV1`): opaque handles + narrow factory + primitives across the boundary.
The antithesis of ST's `getContext()`. Plugin compiled against `V1` fails loudly on `V2`.

**Capability-scoped via manifest.** Declared capabilities checked against `can(principal, action, resource)`
(§3.4). Plugin runs as its installing principal, can never exceed that principal's authority. No ambient FS/network/DB.

**Determinism:** clock/PRNG/ids reach the guest ONLY via injected host functions bound to the same composition-root seam production uses (`test-determinism`).

### 3.3 Homes

| Piece                                           | Home                                                   |
| ----------------------------------------------- | ------------------------------------------------------ |
| QuickJS WASM runtime + membrane impl            | `infra/plugin-host/` (external-code adapter, injected) |
| Typed surface + manifest schema                 | `@orb/contracts/plugin`                                |
| Plugin registry / lifecycle / capability grants | `domain/plugin/` (8-slot leaf)                         |
| Inline snippet runner (ad-hoc, non-installed)   | `infra/plugin-host/` + chat transport                  |

Gate: `plugin-no-ambient` keeps the membrane honest.

### 3.4 The `can()` capability seam — HARD requirement for Tier 2

`can(principal, action, resource)` must be a **real capability seam** at Phase 5:

- `resource` = a discriminated union (`global | chat | character | …`)
- `action` = extensible vocabulary

Until it's built, "each capability checked against `can()`" is aspirational (`FLAG[PD-1]`). Since Tier 2 is
committed, the `can()` seam is a **hard requirement** of Phase 5, not an aspiration.

### 3.5 Footguns to own

- **Host-function reentrancy** — the QuickJS interrupt handler does NOT preempt a blocking host call
  (only guest bytecode); host functions must self-bound
- **Async/Promise bridging** across the membrane must be explicit and bounded
- WASM OOM is contained to the instance (good) but must be handled, not ignored

---

## 4. Complete home summary

| Concern                                                                   | Package / tier                        | State                               |
| ------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------- |
| Macro/regex predicate + transform engines                                 | `@orb/kit/macro`, `@orb/kit/regex`    | exists ✓                            |
| Macro-engine DX (metadata, arg validation, parse spans, autocomplete API) | `@orb/kit/macro` + client             | **committed** (additive)            |
| CEL expression/predicate layer                                            | `kit` + chat/automation eval path     | **committed**                       |
| Content import/export (cards/presets/WI/persona/regex/tag)                | existing/core domains                 | exists / core build-plan            |
| ChoiceBlock config-plane variables                                        | `@orb/contracts` + chat domain        | Phase-5 born-compliant              |
| Runtime-plane variable deltas + fold                                      | `message_variants` + chat domain      | Phase-5 born-compliant              |
| Automation rule schema + closed unions                                    | `@orb/contracts/automation`           | additive (post Phase-5)             |
| Automation rule store + dispatch                                          | `domain/automation/`                  | additive (post Phase-5)             |
| `can()` capability seam (resource union + actions)                        | domain guards + identity spine        | Phase-5 **HARD req**                |
| Plugin host runtime (QuickJS membrane)                                    | `infra/plugin-host/`                  | **committed** (after Phase-5 seams) |
| Plugin typed surface + manifest                                           | `@orb/contracts/plugin`               | **committed** (after Phase-5 seams) |
| Plugin registry/lifecycle + capability grants                             | `domain/plugin/`                      | **committed** (after Phase-5 seams) |
| Tier-2 inline snippet runner                                              | `infra/plugin-host/` + chat transport | **committed** (dual-mode)           |
| Per-user global vars                                                      | `fetchOwned` KV table + macro/CEL     | **committed**                       |
| Per-participant variable overlay                                          | `chatId+userId` store                 | reserved-additive                   |

---

## 5. Phase-5 born-compliant prerequisites (MUST honor, not optional)

1. **Variable model:** two-plane model (§1.1) — ChoiceBlock config picks + runtime deltas on `message_variants`
   folded along `selectedVariantId`, materialized cache. The fold is DECIDED — not the mutable bag.

2. **`can()` shape (HARD):** build the chat guard as `can(principal, action, resource)` with a real
   `ResourceRef` discriminated union and extensible action vocabulary. The committed Tier-2 plugin host gates
   every capability through this seam. NOT a hardcoded `requireHost` check (`FLAG[PD-1]`).

3. **Turn-initiation model:** the turn pipeline must accept a non-human initiator (`triggeredBy` can be a
   system/automation actor) and carry a per-turn budget axis for autonomous hosted-cred spend.

4. **Chat events:** emit chat-lifecycle events as a typed closed union with id-only payloads through the
   injected emit seam (D38 discipline), so an automation subscriber can be added later without re-architecting.

5. **Macro eval discipline:** force clock/PRNG injection on any rule/automation eval path; no ambient default.

---

## 6. Cross-refs

- **D46** — scripting/automation/extensibility COMMITTED; this doc is the authoritative expansion
- **D18/D20/D21/D23** — ownership model (single-owned + membership-scoped)
- **D16** — host-only-v1 conservatism; multi-human group correctness
- **D17** — owner-consent axis (the consent gate automation's budget axis works alongside)
- **D26/D27** — message slot/variant/swipe pointer; fork
- **D37** — `message_variants.toolCalls` reserved column (born-whole precedent for variable delta columns)
- **D38** — the event bus + the `can()` deferral
- `Core-0-Architecture-and-Structure.md` — 8-slot template + gates
- `core/Spine-Identity-and-Auth.md` — the `can()`/Principal seam
- `domains/chat.md` (gutted — the code is the doc; git history) — the Phase-5 turn pipeline, chat events, variable substrate
- `proposed/scripting-automation-extensibility/scripting-automation-extensibility.md` — the full evidence base
