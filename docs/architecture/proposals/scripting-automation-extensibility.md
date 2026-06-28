# Orbweaver — proposal: variables · scripting · automation · extensibility

> **Status: PROPOSAL (not yet committed; not yet built).** This is a forward-looking design for the
> scripting / automation / extensibility surface and the variable substrate it stands on. It is written
> NOW — while `chat` (Phase 5) and `client` (Phase 6) are still unbuilt — for one reason: a few pieces
> here must be **shaped into the Phase-5 chat substrate before it is built whole**, or adding them later
> is a migration + a sweep instead of a born-compliant column. Everything else is genuinely additive and
> deferred. This doc is the single home for that plan; if it is accepted, its committed calls graduate to
> the ledger (`reports/DECISIONS-LEDGER.md`) as a D-entry and the build pieces graduate to `domains/` +
> `BUILD-PLAN.md`. **Until then, nothing here is law** — but the §"Born-compliant prerequisites" list is
> the part a Phase-5 agent MUST honor even if the rest is deferred.
>
> **DECISIONS LOCKED 2026-06-28 (the three §10 judgment calls — RESOLVED):** (1) the variable
> **delta-fold is ADOPTED** (not the mutable bag); (2) **Tier 2 (the code sandbox) is COMMITTED in-scope**
> — a real deliverable of this plan, not a reserved maybe; (3) **CEL is ADOPTED, augmenting `kit/macro`**
> as the expression/predicate layer over the shared variable namespace. **Also locked the same day:**
> (4) **BUILD per-user global variables** (committed scope — not reserved); (5) **BUILD the macro-engine DX
> layer** (registry metadata + arg validation + parse-span diagnostics + autocomplete — to reach
> at-or-above parity with ST's new experimental macro engine, which orbweaver's *existing* `kit/macro`
> already exceeds on determinism + DoS-bounding); (6) **Tier 2 is DUAL-MODE** — installed plugins AND ad-hoc inline snippets —
> closing the STscript medium-band/inline-execution gap. **Parity target: at-or-above BOTH ST's new macro
> engine AND STscript.** §10 records all six as decided.
>
> **Cold-read orientation (read this if you have no prior context):** orbweaver is a maximal-rigor remake
> of *neo-tavern*, itself a remake of *SillyTavern (ST)*. The constitution is `structure.md` (the package
> cake `kit ← contracts ← db ← server ← client`, imports flow DOWN and are RESOLVER-ENFORCED —
> "boundaries are physics"; "one home / derive-don't-stamp"; the 13 gates). Ownership is two total
> categories (`reports/DECISIONS-LEDGER.md` D18/D20/D21/D23): **single-owned** (`ownerId` + `fetchOwned`)
> and **membership-scoped** (`chatId` → `chat_participants`, authority via `requireParticipant`/
> `requireHost`). Chat is multi-human/group-native (D16). This doc assumes all of that.

---

## 0. The headline

Three things, in priority order:

1. **Variables need a born-compliant shape decided before Phase 5.** This is the only part with real
   retrofit cost. **Decided (2026-06-28):** a **two-plane** model — config picks (ChoiceBlock, kept from neo) +
   runtime script vars stored as **per-variant deltas folded over the selected message chain**
   (derive-don't-stamp), which makes swipe and fork correct-by-construction and kills ST's known
   swipe-clobber bug (Issue #3263).

2. **Scripting/automation is a three-tier ladder.** Tier 0 (content-as-data) rides existing/core domains —
   *no new scripting runtime*. Tier 1
   (declarative event→predicate→action automation) is a new additive leaf domain. Tier 2 (a real code
   sandbox) is **committed in-scope** (a deliverable of this plan, not a reserved maybe), sequenced after
   the Phase-5 seams it depends on. None of it can land before the Phase-5 chat authz seam exists — so the
   job NOW is to *shape the seams*, not yet build the features.

3. **"Producer-scoping = secure for free" is true at the schema layer, but the enforcement is unbuilt.**
   The schema makes every row's owner/scope FK-reachable; the *guards* that enforce it for chat-attached
   data (`requireParticipant`/`requireHost`) are a Phase-5 deliverable. Automation inherits the schema
   shape for free and the enforcement only once that seam lands.

---

## 1. Evidence base (what ST and neo actually do)

The design below is grounded in a source-level audit of both predecessors. The load-bearing findings:

### SillyTavern
- **Two variable stores, two lifetimes:** local (`chat_metadata.variables`, persisted in the chat's JSONL,
  dies with the chat) and global (`extension_settings.variables.global`, in `settings.json`, forever,
  app-wide).
- **Single mutable bag, last-write-wins.** No per-message/per-swipe variable state. **A swipe does NOT
  rewind variables** — macro setters re-fire on every render, so swiping can silently clobber/compound
  state (acknowledged sharp edge, ST Issue #3263; the third-party *MessageVariables* extension exists
  precisely because base ST lacks per-swipe vars).
- **Fork/branch shallow-copies the whole bag** at the fork point (`{...chat_metadata, ...}`), then
  diverges.
- **Group chat = one shared bag**, no per-speaker isolation.
- Strings with read-time number coercion; structured data is JSON-in-a-string; single-level `index=`/`as=`
  only (deep paths / `getat`/`setat` are the LALib extension, not base).
- **Scripting is STscript** — a real imperative interpreter (`/while`, `/times`, closures `{: :}`, pipes,
  `/run`), with ~289 slash-command registration sites across the tree. **Quick Reply is STscript-in-JSON**
  (a data wrapper around an executable program). Extensions get `getContext()` — a ~250-member ambient
  god-object exposing generation, the event bus, persisted settings, and the DB-of-record. This is the
  anti-pattern orbweaver must not reproduce.

### Neo-tavern (the direct lineage)
- **`chats.variableValues: Record<string,string>`** — one per-chat bag, nullable. Write-through per turn,
  dirty-checked (`shallowEqualMaps`), committed in the turn's batch.
- **ChoiceBlock** = a preset-author-declared typed variable (`{name, question, options, defaultValue,
  multiSelect, separator, randomPick}`); `variableValues` stores the user's per-chat picks against those
  declarations. Read path keeps a **raw vs merged** split (raw picks for the editor; picks∪defaults for
  macros) so editing a preset's defaults isn't baked in.
- **The macro `env` IS the persisted bag by reference** — one object threaded through assembly + regex +
  guided stages, so an in-prompt `{{setvar}}` and a later regex see each other within a turn, then it's
  flushed back. Splitting this reference caused a real historical bug; do not re-split it.
- **Swipe = last-write-wins, no per-variant snapshot** (explicitly out-of-scope, same stance as
  `promptSnapshot`). Only the `draft` intent clones the map for isolation.
- **Fork carries `variableValues`** (snapshot copy at fork time), then diverges.
- **No global variables** — deliberately dropped ("single-user, per-user-globals add no value").
- **Group = shared per-chat bag.**

**The orbweaver-relevant divergence:** neo's "shared bag is fine / no globals" rests on a *single-user*
assumption. Orbweaver is multi-human (D16). That doesn't break the shared-bag model (variables are room
state, not private data), but it does mean *write authority* in a group is a real question neo never had —
resolved in §5.

---

## 2. The content insight (why this is smaller than it looks)

By **artifact volume**, ~80–85% of what ST users actually share and install is pure **data** — character
cards, lorebooks/world-info, presets, personas, regex rules, instruct/context templates, themes. Orbweaver
already distributes all of those as typed, validated, FK-owned import/export. So the majority of
"extensibility" is **already delivered with zero new runtime** (Tier 0).

The honest caveat (do not oversell): among actual *code extensions* (vs content), arbitrary code is the
*dominant* form, not a 5% rump — and the popular power-user packs (Guided Generations, Stepped Thinking,
Tracker, LALib's 100+ imperative commands) are genuinely imperative. So **Tier 1 declarative automation
covers the trigger surface and the casual/few-action majority by volume, but the shared power-user
automations need Tier 2.** Tier 2 is therefore a *first-class expected path* and is **committed** as a
deliverable (built after the Phase-5 seams), not a rare escape hatch deferred until demand.

---

## 3. The variable + macro substrate (the part to shape before Phase 5)

### 3.1 Two planes

Neo conflates two different things into one `variableValues` bag. Orbweaver separates them:

- **Config plane — ChoiceBlock picks.** Preset-author-declared typed variables; the user picks per chat;
  picks are **chat config** (set via the picker, not mutated by message macros). Stored on the chat and
  **carried on fork** like `pinnedPersonaId`. This is neo's ChoiceBlock model, kept verbatim (including
  the raw-vs-merged read split and `randomPick` resolving *before* assembly so no macro leaks downstream).

- **Runtime plane — script variables.** Values mutated by macros / regex / automation during a turn
  (`{{setvar}}`/`{{incvar}}`/…). This is where the swipe/fork correctness question lives, and where the
  recommendation diverges from neo.

### 3.2 Runtime variables: per-variant deltas, folded (DECIDED 2026-06-28)

**The problem with the mutable bag** (ST + neo both): a `{{setvar}}` that ran inside a generated message
mutates shared state; swiping that message to an alternate generation does NOT rewind the variable, and
re-running the setter on the new swipe clobbers/compounds it. ST ships this as a known bug (#3263); neo
declared it out-of-scope. Orbweaver's mandate is "get it right the first time," and this is exactly the
kind of sharp edge that's painful to retrofit.

**The proposal (derive-don't-stamp applied to variables):**
- Each `message_variant` records the **variable delta it applied** (the ordered list of var ops that ran
  during that generation — `set/add/inc/dec/delete` with key+operand).
- The chat's **current runtime variable state is a deterministic fold** of those deltas over the message
  chain, following each message's `selectedVariantId` (the swipe pointer — D26), in `seq` order.
- A **materialized current-state cache** (a `variableValues`-shaped column/blob on the chat) gives O(1)
  reads; it is **recomputed** only on the rare mutating events: a new turn, a swipe (repoint
  `selectedVariantId` → re-fold), an edit, or a branch.

**Why this is the right call:**
- **Swipe correctness for free** — repointing `selectedVariantId` re-folds, so vars always reflect the
  *selected* timeline. #3263 cannot occur.
- **Fork correctness for free** — a fork copies the message chain (D27); the vars fold from it, so there
  is **no special-case bag-copy** (neo needs an explicit `variableValues: source.variableValues` in
  `fork.ts`; this eliminates it).
- It is the same "derive the truth from canon, don't stamp a mirror" discipline as D20/D23, applied to
  variable state. The delta log on the variant is intrinsic provenance (like `promptSnapshot`/`params`),
  not a denormalized mirror.

**The cost / the divergence (DECIDED — adopt the fold):** this is heavier than neo's mutable bag.
The fold needs an ordered chain walk (cheap — bounded message counts, and the materialized cache means you
fold only on mutation, not on every read). It is a genuine, deliberate divergence from *both* ST and neo,
which use a mutable bag — justified by orbweaver's correctness bar (it eliminates ST Issue #3263 by
construction) and the derive-don't-stamp discipline. The mutable bag (neo's `chats.variableValues`,
last-write-wins + explicit fork-copy, accepting the #3263 swipe edge) is recorded here ONLY as the
**rejected** alternative, so a future agent doesn't reintroduce it as a "simplification."

### 3.3 Scope, types, globals

- **Scope: per-chat shared bag (room state).** Variables are explicitly **narrative/room state, not
  private data** — so shared read/write across participants in a group is correct, not a leak. (Write
  *authority* is §5.) A **per-participant private overlay is reserved-additive** (a new
  `chatId+userId`-keyed store) if a private-scratch need ever appears — it does not reshape the room bag.
- **The macro `env`-by-reference rule is KEPT** (neo): one object threaded through assembly + regex +
  guided within a turn, then flushed. Do not re-split it. Under §3.2 the "flush" becomes "append this
  turn's delta to the produced variant + recompute the cache."
- **Types:** strings at the persistence boundary (the `MacroEnv` is wider — `unknown` — for `{{if}}`
  truthiness, narrowed to string on store, exactly as neo does); structured data is JSON-in-a-string;
  **no deep-path/`getat`/`setat` ops in v1** (that's Tier-2/LALib territory).
- **Global (cross-chat) variables: BUILD (committed scope — don't skip).** ST has local+global; neo dropped
  global. Orbweaver **will build per-user globals** — the only coherent "global" in a multi-user system is per-user
  (each user's own cross-chat namespace), which maps cleanly to the **single-owned** category: a
  `fetchOwned` KV table (`ownerId`+key→value), surfaced via `{{getglobalvar}}`/`{{setglobalvar}}` macros +
  CEL over the same namespace. This puts orbweaver **at-or-above** ST's two-store model (local room-bag +
  per-user global) *with* ownership rigor — a user can never read another user's globals (`fetchOwned`
  puts `ownerId` in the WHERE). Globals are single-owned, so they carry NO chat/variant/fork semantics
  (they're not message-derived) — they're the simple owned-KV plane alongside the two chat planes above.

---

### 3.4 Macro engine — at-or-above ST's new experimental macro engine (COMMITTED)

ST shipped a brand-new macro engine (`public/scripts/macros/engine/*` — a Chevrotain lexer→CST→walker with
a metadata registry, a doc browser, and diagnostics). Crucially it is **NOT a more powerful language** — it
is the same bounded-substitution class `kit/macro` already is (nested macros, `if/else`, var mutation; no
loops/closures/async). What their rewrite bought was a **developer-experience layer**. The parity picture:

- **Orbweaver is ABOVE ST on correctness — keep this.** `kit/macro` has an **injected clock + PRNG**
  (deterministic) and a real **depth + output DoS budget**. ST's new engine has **neither** (live
  `moment()`/entropy; no budget — it is bounded only because the grammar has no loops). A genuine orbweaver
  win; do not trade it away for tooling.
- **Orbweaver ADDS ST's DX layer to reach parity (COMMITTED — build now):**
  1. **Macro registry metadata** — per-macro `description / category / typed arg defs (name, type, optional,
     default) / returnType / aliases`. Extend `MacroRegisterOptions` + the registry (`kit/macro`).
  2. **Arg arity + type validation** off that metadata (ST `isArgsValid`/`validateArgTypes` analog; strict
     throws, else warns). In `kit/macro/evaluator.ts`.
  3. **Parse diagnostics with location spans** — carry offsets through the parser and surface a structured
     warning list (line:col:len), the way ST's `MacroDiagnostics` does. `kit/macro/parser.ts` has zero span
     info today.
  4. **An autocomplete / macro-browser query API** fed by (1), consumed by the Phase-6 client (the ST
     `MacroBrowser` analog).
- **Inline expressions / variable operators** (ST's `.var $var ++ += ?? == …`): covered by **CEL** (§5.1)
  over the same namespace — at-or-above ST.
- **Globals:** covered (§3.3) — BUILD (committed).

Net: with the four DX additions + CEL + globals, orbweaver is **at-or-above ST's new macro engine on every
axis** — equal in language class, ahead on determinism + DoS-bounding, matched on tooling, ahead on
expressions. These DX additions are **additive to `kit/macro`** (no chat-substrate dependency), so they can
land independently of Phase 5.

---

## 4. Tier 0 — content-as-data (no new runtime)

Everything ST distributes as installable files, orbweaver distributes as typed, zod-validated,
FK-owned `@orb/contracts` payloads through the existing domains (character / preset / world-info /
persona / regex / tag). A "share pack" is a signed export; an "install" is an import verb running the
same validation as any API write. **The `can()` gate on the import verb is the security boundary.** No new
runtime, no sandbox.

Two cold-read cautions (do not mis-file these as inert):
- **Regex is runtime-bearing content.** A regex rule is executable behavior with a ReDoS surface. The
  server engine guards it with a `node:vm` per-call timeout (`kit/regex`); the browser has no such
  watchdog. Shared/group regex execution MUST run through the timeout-guarded seam, never a raw client
  `replace`.
- **Automation rule-sets (the Tier-1 "Quick Reply" analog) are data+program hybrids, not pure content.**
  A shared rule-set carries executable predicates/actions. It is distributed as data (Tier 0 transport)
  but its *contents* are Tier-1 automation (§5), validated as such on import.

---

## 5. Tier 1 — declarative automation (the new leaf domain)

### 5.1 The model

A rule is **`on <trigger> where <predicate> do <action>`**, all declarative:
- **Trigger** — a member of a **closed event union**. Chat-lifecycle triggers (turn started/finished,
  message added, chat opened, member joined, …) come from the per-chat `ChatBusEvent` stream; cross-domain
  triggers (`character.updated`, `asset.created`) come from the closed domain-event bus (`@orb/contracts/
  events`, D38). Adding a trigger = a union member + a handler (a code change in one home — acceptable;
  the *taxonomy* is closed code, the *rules* are data).
- **Predicate** — a boolean/typed expression in **CEL** (`@marcbachmann/cel-js` — non-Turing-complete,
  linear-time, mutation-free), evaluated against the **same `MacroEnv` variable namespace** macro uses.
  **CEL is ADOPTED (DECIDED) as the expression layer that augments `kit/macro`, not replaces it:** macro
  stays the interpolation + mutation layer (`{{setvar}}`/`{{getvar}}`/`{{if}}`); CEL is the safe expression
  evaluator for rule conditions and computed values. One variable namespace, two composed roles. CEL may
  also be surfaced inside templates via an `{{expr::…}}`-style macro so a template can embed a real
  expression over the same env. (CEL's non-Turing-completeness is the point — predicates stay bounded and
  deterministic; loops/imperative flow remain Tier 2.)
- **Action** — a member of a **closed, capability-checked verb union**, each dispatched through a domain
  front door injected at the composition root (never a sideways import — `domain-no-cross-feature`):
  set a chat variable · run a macro template over the draft · insert a world-info entry · surface a
  quick-reply button · post a notification · **trigger a generation** (see §5.3, the gated one).

### 5.2 Honest coverage

Tier 1 covers **all triggers** and the **casual/few-action automation majority by volume** — "on chat
open, set POV"; "show a 🎲 button that rolls and injects"; "if turn>20, inject the summary entry";
conditional prompt assembly. It does **NOT** cover imperative loops / closures / pipes / state machines /
multi-step prompt-chaining — those are Tier 2. Do not market Tier 1 as a full STscript replacement; it
replaces the declarative subset, which is most rules by count but not the headline power-user packs.

### 5.3 Homes (the cake)

| Piece | Home | Note |
|---|---|---|
| Rule schema + closed trigger union + closed action union | `@orb/contracts/automation` | one-home unions (§7.5 exhaustive dispatch); a new action = a member + an arm |
| Rule store + lifecycle + dispatch | `domain/automation/` (8-slot leaf) | subscribes to events via the injected emit/handler seam; actions call domain front doors injected at `entry/compose` |
| Predicate engine | `kit/macro` (+ optional CEL) | already built; deterministic |
| Variable read/write actions | through the chat domain's variable seam | never touches the process-global macro registry (data eval only) |

---

## 6. Security model (the corrected framing)

### 6.1 Producer-scoping: free at the schema, enforced at the (Phase-5) guard

- **Single-owned data** (characters/personas/presets/world-books/tags/…): scoping is genuinely free —
  `fetchOwned` puts the owner predicate in the `WHERE`, so a rule re-reading by id *as its own principal*
  gets `undefined` for another user's row. An automation rule attached to a single-owned entity inherits
  this for free, today.
- **Membership-scoped data** (chat + all `chatId`-children): the schema is free (every child FKs
  `chats.id` CASCADE, no per-table `ownerId`), but the **enforcement** —
  `requireParticipant`/`requireHost` — is a **Phase-5 deliverable that does not exist yet**. Automation
  attached to a chat inherits the schema shape now and the enforcement only when that guard lands. State
  this honestly; do not claim it's enforced today.

### 6.2 The `can()` capability axis (build it real at Phase 5)

`can(principal, action, resource)` today is a global-role check (`action ∈ {admin,owner}`, `resource =
{kind:"global"}`, and it doesn't even read the resource arg — `FLAG[PD-1]`). The chat-phase build MUST
grow it into a **real capability seam**: `resource` a discriminated union (`global | chat | character |
…`), `action` an extensible vocabulary. This is the reservation that makes both Tier-1 action gating and
Tier-2 plugin-capability gating "add a member" instead of "redesign the seam." Until it's built, "each
capability checked against `can()`" is aspirational.

### 6.3 Authority: host-only in v1, member rules reserved-additive

- **v1: automation rules are owner/host-authored only** (the D16/D20/D29 host-only-v1 conservatism).
  A host rule may read/write the room variable bag and trigger generation (host has room authority).
- **Member-authored rules are reserved-additive.** The retrofit-safe path: a member rule writes to the
  **per-participant overlay** (§3.3), never the shared room bag, and runs under the member's own authority
  + budget. **Note the asymmetry the panel caught:** widening a *read* (like D29 export) is additive;
  widening a member *write* to shared room state is a security-model change, NOT a free dial. The overlay
  is what keeps the widening safe.

### 6.4 Autonomous spend (the budget the consent gate doesn't cover)

Owner-consent (D17, default-OFF for hosted `max-pro-sub`) is an **attribution** gate keyed on
`triggeredBy ≠ owner` — an owner-authored automation sets `triggeredBy = owner` and sails through it. So
automation needs an **independent budget**: a **per-rule + per-chat rate + token/$ ceiling** on
automation-initiated generations. Hosted-cred (real-money) autonomous turns still require owner-consent
*and* fall under the budget; local-compute autonomous turns fall under the existing count budgets. An
event→action→turn→event loop is otherwise a runaway-spend vector.

---

## 7. Tier 2 — the code sandbox (COMMITTED in-scope, DECIDED 2026-06-28)

**Committed as a deliverable of this plan** (Nate's call — build it, don't reserve it). It is the home for
imperative user scripting (loops, closures, state machines — prompt-chaining, stateful trackers, memory
pipelines) and third-party code, i.e. the power-user automation surface Tier 1's declarative model
deliberately can't express. It **physically depends on the Phase-5 seams** (the `can()` capability axis,
the chat event bus, the turn pipeline), so it is **sequenced to land after those exist** — "build it now"
means in-scope and designed-for from the start (its `@orb/contracts/plugin` surface, manifest, and
capability model are first-class, not retrofitted), not literally before its dependencies. Because Tier 2
is committed, the §9 prerequisites are **HARD requirements**, not nice-to-haves — most importantly the
`can()` capability axis the plugin host gates every capability through.

**Dual-mode (COMMITTED): installed plugins AND ad-hoc inline snippets.** The same QuickJS host serves two
authoring modes, so the "medium band" STscript covers natively — a user wanting a small loop/closure/pipe
that's too rich for Tier-1's predicate→action model but not worth packaging an installed plugin — is NOT
orphaned, and neither is STscript's "type a command and run it now":
- **Installed plugins** — a manifest-declared, capability-granted, persistent extension (the third-party
  code surface).
- **Inline snippets** — a user types a script in the chat box and runs it now: it executes in the **same
  membrane, as the author's own principal, under the same `can()` capability gates**, transient (no
  install, no manifest beyond the caller's own authority). This is STscript's casual-imperative band +
  inline execution, with isolation + determinism + capability-gating STscript never had.

Both modes share **one runtime, one capability model, one determinism seam** — there is deliberately NO
third "lite scripting" tier; the dual-mode host *is* the medium band.

**Committed tech (decided so a cold agent doesn't re-research):**
- **Runtime: QuickJS-ng via `quickjs-emscripten` (WASM), in-process.** The WASM boundary makes host/guest
  memory aliasing physically impossible (the property Figma migrated to QuickJS for). Per-call interrupt
  + memory cap = an enforceable DoS budget.
  - **Rejected: `isolated-vm`** — maintenance mode; V8 cannot unwind OOM, so hostile/buggy plugin code
    crashes the whole process (disqualifying for an in-process membrane on a self-hosted box). **SES/
    Compartments** — too invasive (`lockdown()` mutates global intrinsics process-wide). **WASM
    component / Zed model** — cleanest capability story but forces plugin authors to compile Rust/Zig
    (wrong ergonomics); **copy its manifest/capability shape, not its runtime.**
- **The membrane, not a god-object.** The host API is a **single frozen, versioned, typed surface** in
  `@orb/contracts/plugin` (`PluginHostV1`): opaque handles + a narrow factory, primitives across the
  boundary. The antithesis of ST's `getContext()`. A plugin compiled against `V1` fails loudly on `V2`.
- **Capability-scoped via manifest.** The plugin declares requested capabilities; at load each is checked
  against `can(principal, action, resource)` (§6.2). The plugin runs **as its installing principal** and
  can never exceed that principal's authority. No ambient FS/network/DB — any I/O a capability grants is a
  host function the host performs and gates.
- **Determinism:** clock/PRNG/ids reach the guest ONLY via injected host functions bound to the same
  composition-root seam production uses (`test-determinism`). Never `Date.now`/`Math.random` inside the
  guest.
- **Homes:** runtime in `infra/plugin-host/` (external-code adapter, injected); typed surface + manifest
  schema in `@orb/contracts/plugin`; registry/lifecycle/capability-grants in `domain/plugin/` (8-slot
  leaf). A candidate gate `plugin-no-ambient` keeps the membrane honest.

**Footguns to own (the membrane's "can't alias" is true for memory, not automatically for a sloppy host
surface):** host-function **reentrancy**; the QuickJS interrupt handler does NOT preempt a blocking *host*
call (only guest bytecode) — host functions must self-bound; **async/Promise bridging** across the
membrane must be explicit and bounded; WASM OOM is contained to the instance (good) but must be handled,
not ignored.

---

## 8. The cake — where everything homes (summary)

**State legend:** *exists* = real in code today (don't rebuild) · ***committed / BUILD*** = this plan must
build it, do NOT skip · *born-compliant* = must be shaped INTO the Phase-5 chat build · *additive* /
*reserved-additive* = buildable later with zero retrofit. **Nothing here is "done" except the *exists* rows.**

| Concern | Package / tier | Tier | State |
|---|---|---|---|
| Macro/regex predicate + transform engines | `@orb/kit/macro`, `@orb/kit/regex` | 0/1 | **exists** ✓ |
| Macro-engine DX (metadata, arg validation, parse spans, autocomplete API) | `@orb/kit/macro` + client | 0/1 | **committed** (macro parity w/ ST; additive) |
| CEL expression/predicate layer | `kit` + chat/automation eval path | 1 | **committed** |
| Content import/export (cards/presets/WI/persona/regex/tag) | existing/core domains | 0 | exists / core build-plan |
| ChoiceBlock config-plane variables | `@orb/contracts` + chat domain | — | Phase-5 (born-compliant) |
| Runtime-plane variable deltas + fold | `message_variants` + chat domain | — | Phase-5 (born-compliant) |
| Automation rule schema + closed unions | `@orb/contracts/automation` | 1 | additive (post Phase-5) |
| Automation rule store + dispatch | `domain/automation/` | 1 | additive (post Phase-5) |
| `can()` capability seam (resource union + actions) | `domain/*/guard` + identity spine | 1/2 | Phase-5 (shape now, `FLAG[PD-1]`) |
| Plugin host runtime (QuickJS membrane) | `infra/plugin-host/` | 2 | **committed** (after Phase-5 seams) |
| Plugin typed surface + manifest | `@orb/contracts/plugin` | 2 | **committed** (after Phase-5 seams) |
| Plugin registry/lifecycle + capability grants | `domain/plugin/` | 2 | **committed** (after Phase-5 seams) |
| Tier-2 inline snippet runner (ad-hoc, non-installed) | `infra/plugin-host/` + chat transport | 2 | **committed** (dual-mode) |
| Per-user global vars | `fetchOwned` KV table + macro/CEL | — | **committed** |
| Per-participant variable overlay | `chatId+userId` store | — | reserved-additive |

---

## 9. Born-compliant prerequisites (what a Phase-5 agent MUST honor)

Even if all of §5–§7 is deferred, these MUST be shaped into the Phase-5 chat build or they become a
migration later. **This is the operative part of this doc.**

1. **Variable model:** implement the two-plane model (§3) — ChoiceBlock config picks + runtime deltas on
   `message_variants` folded along `selectedVariantId`, with a materialized current-state cache (the fold
   is DECIDED — not the mutable bag; §3.2). Keep the macro `env`-by-reference rule.
2. **`can()` shape (HARD requirement — Tier 2 is committed):** build the chat guard as
   `can(principal, action, resource)` with a real `ResourceRef` discriminated union and an extensible
   action vocabulary — NOT a hardcoded `requireHost` check (`FLAG[PD-1]`). The committed Tier-2 plugin
   host gates every capability through this seam, so it must be a real capability engine, not a role check.
3. **Turn-initiation model:** the turn pipeline must accept a **non-human initiator** (`triggeredBy` can
   be a system/automation actor) and carry a **per-turn budget axis** for autonomous hosted-cred spend.
   Do not build the pipeline assuming every turn is human-initiated.
4. **Chat events:** emit chat-lifecycle events as a **typed closed union with id-only payloads** through
   the injected emit seam (the D38 discipline), so an automation subscriber can be added later without
   re-architecting the bus.
5. **Macro eval discipline:** force clock/PRNG injection on any rule/automation eval path (no ambient
   default); candidate gate now.

---

## 10. Resolved decisions (2026-06-28)

All three former open judgment calls are DECIDED:

1. **The variable fold (§3.2) — ADOPTED.** Runtime vars are per-variant deltas folded over the selected
   message chain (correct-by-construction, kills ST #3263). Neo's mutable bag is recorded as the rejected
   alternative, not a fallback.
2. **Tier 2 (the code sandbox) — COMMITTED in-scope (§7).** A real deliverable of this plan (imperative
   scripting + third-party code), sequenced after the Phase-5 seams it depends on. This makes the §9
   prerequisites hard requirements.
3. **CEL — ADOPTED, augmenting `kit/macro` (§5.1).** Macro = interpolation + mutation; CEL = the safe
   expression/predicate layer over the shared `MacroEnv`. Not a deferred maybe.
4. **Per-user global variables — BUILD / committed (§3.3).** A `fetchOwned` KV table + `{{getglobalvar}}`/CEL
   — at-or-above ST's local+global model, with ownership rigor (no cross-user reads). Not reserved.
5. **Macro-engine DX layer — BUILD / committed (§3.4).** Registry metadata + arg validation + parse-span
   diagnostics + an autocomplete API, to reach at-or-above parity with ST's new experimental macro engine
   (orbweaver's existing `kit/macro` already exceeds it on determinism + DoS-bounding). Additive to `kit/macro`.
6. **Tier-2 is dual-mode — COMMITTED (§7).** Installed plugins AND ad-hoc inline snippets in one membrane,
   closing the STscript "medium band" + inline-execution shape gap.

**Parity target, now met by design: at-or-above BOTH ST's new experimental macro engine AND STscript.**

---

## 11. Cross-references
- Ownership model: ledger **D18 / D20 / D21 / D23** (`reports/DECISIONS-LEDGER.md`).
- Multi-human/group chat: **D16**; host-only-v1 conservatism precedents: **D16 / D20 / D29**.
- Owner roles + hosted-cred consent: **D17**.
- Message slot / variant / swipe pointer: **D26**; fork: **D27**.
- Reserved column / born-whole precedent: **D37** (`message_variants.toolCalls`).
- The event bus + the `can()` deferral: **D38** + `FLAG[PD-1]`.
- Constitution: `structure.md`; the 8-slot template + gates; `spine/identity-auth-permission` (the
  `can()`/Principal seam).
