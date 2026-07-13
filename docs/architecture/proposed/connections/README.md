---
kind: spec
status: draft
updated: 2026-07-10
---

# Capability-complete turn & wire shaping — D66 · D67 · D68 (doc-set index)

> **Status: unified, ratification-ready (draft-pending-owner-sign).** ONE design program over ONE
> mechanism — the EXISTING `(UserIntent × ModelCapability) → wire knobs` funnel
> (`infra/providers/resolve-chat.ts` + `ModelCapability`) — carrying three ledger entries ratified
> together: **D66** (a `turns` capability axis + the role-merge prefix-cache fix + a user role-handling
> knob), **D67** (the `anth-direct` direct-Anthropic-Messages backend + the `cli`/`direct` transport
> axis), **D68** (sampling completeness — `minP` end-to-end, `verbosity` live, per-model direct-transport
> Claude sampling). Honor matrix + the OR-key SDK path wire-tested 2026-07-10 (fresh OR key, direct HTTP
> to both OR endpoints, Anthropic's errors proxied verbatim). This set ABSORBS the former
> `anth-direct-backend/README.md` (deleted; tracker row collapsed).

Two owner-demanded cross-cutting additions run through the whole set: a NAMED **cache-correctness
acceptance gate** (unit resolved-flag assertions + a hand-run live-probe receipt — cache-rot becomes a
red test AND a demanded receipt, part 04 §1a) and a first-class **observability layer** (per-turn
`provider.*` cache/channel/capability/sampling events — the signal that surfaces the \~12.7k-token cache
rot, part 05). The waves are reorganized into THREE dependency-ordered phases, cache-foundation FIRST
(part 04 §1).

The parts (read in order; each is one topic, cross-refs are internal):

| part | topic |
| - | - |
| [`01-capability-model.md`](01-capability-model.md) | the `ModelCapability.turns` axis · the wire-shape key + **how the resolver is threaded with `api`** (the load-bearing fix, §1 Finding-1) · per-flag derivation · the transport axis (`cli`/`direct`) · the funnel→apply flow · the role-merge prefix-cache fix · the user role-handling knob |
| [`02-anth-direct.md`](02-anth-direct.md) | the sealed direct-Anthropic-Messages backend: contract arms · credentials + routing + THE SUB-EXCLUSION · the `@anthropic-ai/sdk` client + the extended security belt · the request builder + the R1 breakpoint PAIR · streaming/errors · verification |
| [`03-sampling-completeness.md`](03-sampling-completeness.md) | D68: `minP` end-to-end · `verbosity` live on the responses wire · the direct-transport per-model Claude sampling facts |
| [`04-migration-and-ledger.md`](04-migration-and-ledger.md) | the THREE-PHASE dependency-ordered wave plan (cache front-loaded) · the cache-correctness acceptance gate + the observability gate (§1a/§1b) · the D-ledger (D66/D67/D68) · resolved decisions + non-goals |
| [`05-observability.md`](05-observability.md) | the per-turn structured-event layer (owner-demanded): the `provider.*` cache/channel/capability/sampling receipts · the decoupled emitter rule · the correlation/turn id · redaction + the AppSettings `logLevel` toggle |

## The bar (anti-SillyTavern) — the rule every part obeys

Model knowledge lives in ONE place — the capability resolver
(`packages/server/src/domain/connection/catalog/resolve-model-capability.ts` + `chat-models.ts` +
`model-family.ts`). Every consumer reads a DECLARATIVE capability flag, never a model id or family
string. Any `if (model === …)` / `if (family === "anthropic")` outside the resolver fails this
proposal. That covers the NEW facts too: the per-model prefill matrix, the per-model min-cache floor,
and the per-model "post-Opus-4.6 rejects temperature/top\_p/top\_k" sampling fact (part 03) are all
resolver-derived — a runner only ever reads the resolved knob.

**A USER PREFERENCE knob is NOT the anti-pattern.** The bar forbids scattered model-id branches, not
user settings. A `roleHandling`/`squashSystemMessages` preference (part 01) — and the new
`minP`/`verbosity` intent fields (part 03) — are user settings exactly like `namesBehavior` (a
`NAMES_BEHAVIOR` union + a preset field, `contracts/src/preset/index.ts:351-353,506`) and the D63
`appearance` user-settings namespace. The MODEL capability is the hard floor; the user knob refines
within/above it. The sealed `isAnthropicModel` inside `infra/providers/backends/kit`
(Tier-3b invariant 3 · Esoteric §7) gates the wire DIALECT and is untouched.

## The one rule (the mechanism every part instances)

**CAPABILITY declares (resolver, one home) → the FUNNEL or the ENGINE consumes the declaration at the
stage where the consequence lands → a thin mechanical apply realizes it → a user knob may refine
strictness within the capability floor.** Prefill and role-merge have their consequence at SHAPE (the
engine reads the flag — the D45 vision / D48 tools precedent); the dynamic-context channel, sampling,
verbosity, and cache placement have their consequence at the provider wire (the funnel resolves, the
runner applies). anth-direct is "a thin mechanical apply realizes it" made literal — a new apply-site,
ZERO new derivation homes. `resolve-chat` stays what Tier-3b invariant 9 says: it READS the injected
descriptor, never authors it.

**Observability obeys the same one rule (part 05).** The per-turn `provider.*` events are pure DOWNSTREAM
READERS of the resolved facts — one decoupled emitter per event, the event carrying the resolved
cache/channel/capability/sampling facts as FIELDS, never re-deriving and never branching on a model id or
wire at the emit site. Same bar: model knowledge stays in the resolver; the log line just reports what
was decided.
