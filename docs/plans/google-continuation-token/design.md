---
kind: plan
status: active
updated: 2026-11-18
rank: 19
---

# A Google reply that hits the output cap continues in the same turn, and the record says so

Board item: [3575](../../work/3575-google-continuationtoken-fully-wire-the-round-trip.md). Ruling it
implements: [`ai-sdk-surface.md`](../../law/ai-sdk-surface.md), "Rulings on the open questions" item 3.

## Goal

A native Google reply that stops on the output cap is continued by the provider's own continuation token
until it finishes or the turn's continuation policy is spent, and the committed message states that the reply
ran past the requested cap. Every leg is one model call inside one chat turn, so a truncated reply no longer
reads as a finished one.

## Shape

### What the installed provider does, and what we ignore

Pinned against the installed `@ai-sdk/google` 4.0.102; line numbers are `dist/index.js` unless the citation
says otherwise. Re-measure on every SDK bump: these are pins, not laws of nature.

- The SDK already continues one case by itself. `continueGoogleStream` (`:198-248`) appends the events of a
  follow-up request when a chunk's candidate finishes `CONTINUATION` (`:1909-1913`), and `doStream` wires it
  unconditionally (`:1907-1918`). `CONTINUATION` means the per-request cap was reached while budget remains,
  so that case already works under our `model.doStream` call
  (`packages/inference/src/backends/google/chat.ts:78`), and the SDK sums its usage
  (`addGoogleUsageMetadata`, `:279-295`).
- The case we do not handle is the one the item is about: a candidate that finishes `MAX_TOKENS`. The token
  rides the finish part only when the raw word is `MAX_TOKENS` or `CONTINUATION` (`:2324`); it is captured
  from chunks at `:2037` and typed on `GoogleProviderMetadata.continuationToken`
  (`dist/index.d.ts:254-260`).
- Sending it back is a provider option, not a prompt trick: `providerOptions.google.continuationToken`
  becomes the `continuationToken` body field (`:1647`), and the option's own schema states the contract —
  "Pass the `continuationToken` from the previous response's provider metadata together with the original
  prompt and a higher `maxOutputTokens` (the budget is cumulative across requests). Requests that reach the
  per-request cap while budget remains (`CONTINUATION`) are continued automatically." (`:967-976`).
- A continued request re-sends the prompt plus all output so far as input, so the provider's
  `promptTokenCount` is the sum across requests. The SDK exposes `initialPromptTokenCount` for the figure
  that must not be summed: "Use this value instead of the summed input tokens for context window checks and
  compaction" (`dist/index.d.ts:261-269`, emitted at `:2325`).
- `MAX_TOKENS` and `CONTINUATION` both normalize to `length` (`:1454-1458`), so a continued-past-cap reply
  and a truncated one are indistinguishable by finish reason alone.

What we read today: `runGoogleChat` builds the plan once
(`packages/inference/src/backends/google/chat.ts:52`), streams one attempt (`:68-110`), folds one drain
(`:117-134`), and writes the turn's log lines (`:148`). `googleOptions` sends no continuation field
(`packages/inference/src/backends/google/options.ts:99-108`), and `googleTokenUsageOf` reads the raw usage
block only (`packages/inference/src/backends/google/usage.ts:28-49`) — it never sees
`initialPromptTokenCount`, which the SDK puts in provider metadata rather than in usage.

### The cap law this must honor

Four statements govern output length, quoted because the change cannot be judged without them.

1. One number, two readers. `packages/contracts/src/preset/index.ts:389-394`: the default is "the ONE
   fallback both the budget reserve (fitBudget) and every runner's wire `max_tokens` read, so the two can
   never diverge: a reserve larger than the runner's real `max_tokens` starves history (amnesia); smaller
   overflows the model (vLLM 400s)."
2. The clamp has one home. `docs/law/Tier-3b-Providers.md:206`: `resolve-chat.ts` "owns reasoning gating, the
   effort clamp, the adaptive/budget guard, sampling capability-gating, the output clamp, the dynamic-context
   channel and the reply-images decision — never re-derived per backend."
3. Several capped calls in one turn is already sanctioned, if counted.
   `packages/server/src/domain/chat/contract/results.ts:288-297`: `modelCalls` exists so that "`tokensOut` is
   the SUM across those calls while `maxOutputTokens` is the PER-CALL ceiling, so without the denominator a
   multi-call turn looks like a backend ignoring the output cap."
4. Exceeding the cap is legal when the record says it happened.
   `packages/contracts/src/chat/messages.ts:212-214`: `outputCapReached` means "A model call stopped on the
   output cap and the runtime continued the reply, so `tokens_out` can exceed the requested cap; the reply is
   also truncated when the finish reason is `length`." The message row states it to the user
   (`packages/client/src/features/chat/components/message-metadata-row.tsx:79-88`: "Essential provenance, not
   an appearance preference").

**Verdict: honored, not amended.** The ledger already permits a backend to make several capped calls inside
one chat turn and to exceed the cap in aggregate, provided the call count and the past-cap fact reach the
record. What it forbids is a backend inventing its own cap, and that constraint decides the placement: the
per-leg budget is resolved in the funnel and handed to the runner, never derived in `backends/google`.

Two follow-on readings the law does not settle, and this plan does:

- The reserve (`packages/server/src/domain/chat/assembly/history-budget.ts:152-153`, materialized at
  `packages/server/src/domain/chat/engine/pipeline.ts:692-700`) keeps reserving one cap for the next turn's
  fit. That is correct and unchanged: the reserve answers "does the prompt fit", not "how long may the reply
  be".
- A new ledger row records the reading, because today it is spread across a type comment, one paragraph of a
  tier doc and a client comment. The lane mints it with `pnpm doc new adr` as D355, quoting the four
  statements above as its Context, and rule 8 of `Tier-3b-Providers.md` gains the pointer to it. The row's
  text is in the next subsection.

### The proposed D355 row

Title: a turn's output cap is a per-request ceiling and the turn reports how many requests it took.

```markdown
---
kind: adr
status: active
updated: 2026-11-17
---

# A turn's output cap is a per-request ceiling

## Context

A truncated native Google reply carries a continuation token, and using it means a second provider request
inside the same chat turn. Four statements already govern output length and none of them says whether that
is allowed: the default cap is one value read by both the prompt-fit reserve and every runner's wire
`max_tokens` (`packages/contracts/src/preset/index.ts`); the output clamp is resolved only in the funnel
(`docs/law/Tier-3b-Providers.md` rule 8); `modelCalls` exists so a sum of output tokens across several calls
stays readable beside a per-call ceiling (`packages/server/src/domain/chat/contract/results.ts`); and a
reply that was continued past its cap carries `outputCapReached` on the variant
(`packages/contracts/src/chat/messages.ts`). A lane that reads one statement alone reaches the opposite
conclusion from a lane that reads another, and the same question returns for every wire that grows a
continuation mechanism.

## Decision

The output cap is a PER-REQUEST ceiling. One chat turn may contain several capped provider requests when the
wire's own continuation mechanism asks for them. Such a turn reports its request count as `modelCalls` and,
when the reply ran past the requested cap, the past-cap fact as `outputCapReached`. The budget for every
request in the turn is resolved by the funnel and handed to the runner; no backend computes, raises or
re-derives it. The next turn's fit reserve still reserves one cap, because the reserve answers whether the
prompt fits, not how long a reply may be. The number of extra requests in one turn is a contracts constant,
never a settings knob.

## Consequences

A backend may loop capped requests inside one `ChatResult`, so one chat turn still means one canon row, one
economics fold and one turn terminal. Aggregate `tokensOut` may exceed the requested cap and stays readable
beside `modelCalls`. A backend that sizes its own budget fails the funnel-ownership rule rather than a review
argument. The fit reserve is unchanged, so a long reply never squeezes the next turn's history.

## Alternatives rejected

A per-turn budget that the fit reserve also reserves: the reserve would have to answer for a reply length it
cannot know, and history would be squeezed by a cap the turn may never reach. Raising the cap to the model
ceiling on continuation requests: that is a backend deciding the clamp. Reporting nothing and letting the
token count speak: a reply over the cap with no stated reason reads as a backend ignoring its instructions.
Making the extra-request count a user setting: an unbounded loop is an unbounded bill.
```

### Placement: a leg loop inside the Google backend, not a second send

The chat domain already owns a continuation mechanism, and the plan must say why it is the sibling this work
must not reuse.

- The domain's `continue` is a turn intent: `packages/contracts/src/chat/bus.ts:315`
  (`TURN_INTENTS = ["send", "swipe", "continue", "generate", "impersonate"]`) and
  `packages/contracts/src/chat/rpg-ops.ts:14` (`TURN_KINDS`). It is implemented as an auxiliary turn,
  `createContinueTurn` at `packages/server/src/domain/chat/verbs/turn.ts:2452-2503`, which re-sends the canon
  THROUGH the extended slot and appends what the model writes, adding a continue nudge only where the wire
  cannot continue the model's own trailing row (`turn.ts:2494-2498`). The host can automate it
  (`turn.ts:1659-1679`, gated on `finishReason === "length"`). Its wire vocabulary is the vendor continue
  row: a trailing assistant row plus a prefix flag, or `continue_final_message`, as the DeepSeek surface doc
  records at `docs/law/deepseek-api-surface.md:72-111`, with its negative cases — a web-tool reply cannot be
  continued (`:103`), `/responses` cannot continue a reply at all (`:105-107`).

Google's token is not that mechanism, and the difference is the whole placement argument:

| Axis | Domain `continue` (bus.ts:315) | Google `continuationToken` |
| - | - | - |
| What it is | a turn intent the host or a person asks for | opaque server-side decode state |
| Body it needs | canon re-sent through the slot, plus a continue nudge or a trailing assistant row | the original prompt, byte-identical, plus a higher cumulative budget (`@ai-sdk/google` 4.0.102 `dist/index.js:967-976`) |
| What it costs | a second chat turn: new accepted turn, new slot life, new turn events | one provider request inside the turn already running |
| What it produces | a new assistant row, or an appended variant of the existing one | more text in the same generation |
| Who may start it | a participant or the host, gated by settings | the backend, when the provider says it truncated |
| Its record | `hasContinuation`, undo and revert snapshots | `modelCalls` plus the past-cap fact |

So a body rebuilt from canon plus a nudge is not the body the token belongs to. Three placements were
weighed.

**(a) A leg loop inside the Google backend — chosen.** `runGoogleChat` loops the legs inside its existing
pre-commit attempt: `plan.prompt` is already built once
(`packages/inference/src/backends/google/chat.ts:52`), the provider is already built once (`:77`), the delta
callbacks already stream straight to the bus (`:86-95`), and the fold happens once at the end (`:117-134`).
The reasons are structural:

- The token can only travel as `providerOptions.google.continuationToken`. The domain speaks `ChatRequest`
  and gets a `ChatResult` back (`packages/inference/src/contract/chat.ts:335-385`), never wire options; a
  domain-side carrier for a provider option is the inversion `Tier-3b-Providers.md` forbids.
- The body must be byte-identical to the first leg's, and only the backend holds that plan.
- One turn stays one `ChatResult`: one canon row, one economics fold, one turn terminal on the bus, and
  `numTurns` = legs is the existing denominator (`results.ts:288-297`, renamed to `modelCalls` at
  `packages/server/src/domain/chat/engine/provider-bridge.ts:125-128`). No domain change at all.
- The SDK's own `CONTINUATION` handling is already a leg loop in this exact position (`:198-248`,
  `:1907-1918`); this adds the branch the SDK leaves to the caller.

**(b) A domain second send reusing the continue plumbing without the auxiliary-turn semantics — rejected.**
It cannot carry the token (first bullet above), it would have to be a new turn to reach a runner anyway, and
dropping the ghost-slot bookkeeping would leave the extended message without a turn slot, since the client's
slot lifecycle keys on `turnStarted`/`turnCompleted` naming the extended message
(`packages/contracts/src/chat/bus.ts:566-606`). Half the mechanism without its bookkeeping is worse than the
mechanism.

**(c) Routing the auto-resume through the real `continue` intent — rejected, and named as wrong.** It doubles
the turn in history (a second accepted turn, a second slot life, a second set of turn events for one provider
reply), it bills the user for a provider-side truncation the provider would have stitched for free, it is off
by default (`UserSettings.chat.autoContinue`, `packages/contracts/src/settings/index.ts:489`), and the token
would be invalid because the continue body is not the original prompt. The domain's `continue` stays what it
is: a person or the host asking the model to write more. This work adds no second continuation path in
`domain/chat`; a later "keep going past the policy" feature uses `continueTurn`, unchanged.

Which mechanism each layer uses, in one line: the chat domain uses nothing new (a send is still a send);
`@orb/inference`'s Google backend uses the provider's token, several times, inside one call; the record uses
the existing past-cap fact plus the existing call counter.

### Files, per layer

| Layer | Files | What changes |
| - | - | - |
| Contracts, capability | `packages/contracts/src/inference/capability/generation.ts` | one turn cell, `turns.serverContinuation: boolean`, in the tuple, in the floor default (`:280,:317,:430`) |
| Contracts, capability | `packages/contracts/src/inference/capability/reads.ts` | the one predicate, beside `acceptsAssistantPrefill` (`:110`) |
| Contracts, data | `packages/inference/src/capability/sources/curated/google.ts` | the curated rows that carry the cell, dist pin as the cite (`:7-36`) |
| Contracts, chat | `packages/contracts/src/chat/messages.ts` | the `provider: "google"` sidecar member (`:184-233`) |
| Inference, contract | `packages/inference/src/contract/resolve.ts` | the continuation policy on `ResolvedChatKnobs` (`:69-89`) |
| Inference, funnel | `packages/inference/src/funnel/resolve-chat.ts` | resolves the policy beside `sentOutputCap`; the loud drop (`:418-436`) |
| Inference, backend | `packages/inference/src/backends/google/chat.ts` | the leg loop, one attempt, one fold (`:68-134`) |
| Inference, backend | `packages/inference/src/backends/google/options.ts` | the token and the per-leg cumulative budget (`:99-108`) |
| Inference, backend | `packages/inference/src/backends/google/usage.ts` | `initialPromptTokenCount` beside the summed counts (`:28-49`) |
| Inference, fold | `packages/inference/src/backends/v4/result.ts` | the drain fold; `toChatResult` still runs once (`:321-365`) |
| Inference, provenance | `packages/inference/src/backends/wire/provider-metadata.ts` | the Google member's producer (`:131-143`) |
| Server, persistence | `packages/server/src/domain/chat/persistence/queries.ts` | the one past-cap predicate, read side (`:222`, and the projection note at `:205-206`) |
| Server, persistence | `packages/server/src/domain/chat/persistence/canon-write.ts` | the same predicate, commit side (`:936`) |
| Law and ledger | `docs/law/ai-sdk-surface.md`, `docs/law/Tier-3b-Providers.md`, `docs/adr/` | item 3 amended to wired; rule 8 points at D355; the row itself, plus `docs/adr/README.md` through `pnpm doc index` |
| Tests | `tests/support/node/google-stream.ts*`, `tests/inference/backends/google/continuation-wire.int.test.ts*`, `tests/server/domain/chat/persistence/` | the SSE fixture, the wire cases, the record cases |

The policy itself, in four statements: the cell says whether the wire may continue server-side; the funnel
resolves a leg count and the cumulative budget for a leg, `min(cap × leg, modelMax)`; the backend sends that
number and never derives one; the record carries the leg count and the past-cap fact. Cumulative, because the
provider's budget counts up across requests and a same-cap retry would buy nothing (`:967-976`). The leg
count is a contracts constant rather than a settings knob, for the same reason the auto-continue rounds are
bounded (`packages/contracts/src/settings/index.ts:395-397`): an unbounded leg loop is an unbounded bill.

The fold is one helper in `backends/v4` over a list of drains: text, reasoning parts, text signatures,
images, tool calls and usage summed; `ttftMs` from the first leg; `durationApiMs` summed; `numTurns` = the
leg count; `finish` and `providerMetadata` from the last leg. Running `toChatResult` once after it means
there is exactly one finish part, so the synthesized-finish guard
(`packages/inference/src/backends/v4/stream.ts:277-307`) sees one finish. Folding at the drain, never at
`ChatResult`, is what keeps this from becoming a second copy of `toChatResult`'s economics fold.

### Usage, cost, and what the record says across legs

`tokensIn` sums per leg, because the provider bills every request and re-sends the prompt plus the output so
far as input (`addGoogleUsageMetadata`, `@ai-sdk/google` 4.0.102 `dist/index.js:279-295`). That sum is a
billing truth and a lie about context occupancy, so the record carries both:

- `tokensIn` stays the billing sum. `costOf` prices it once, with the summed `tokensOut`
  (`packages/inference/src/backends/v4/result.ts:277-315`).
- `initialPromptTokenCount` lands beside it as its own member of the Google usage slice — never a
  redefinition of `tokensIn`, and absent when the reply spanned one request.
- `numTurns` = the leg count, which reaches the observation as `modelCalls`
  (`packages/server/src/domain/chat/engine/provider-bridge.ts:125-128`,
  `packages/inference/src/backends/agent-sdk/runner.ts` reports the same figure for its own loop). That is
  the denominator that makes an aggregate over the cap readable (`results.ts:288-297`).
- `tokenDetails` sums per modality, the same way `addGoogleUsageMetadata` already sums
  `candidatesTokensDetails`.
- The turn's log lines and span events are written once, after the fold (`chat.ts:148-167`), with the summed
  figures and the leg count — not once per leg, which would double the sampling line for one turn.

### The record

A `provider: "google"` member joins the sidecar union (`packages/contracts/src/chat/messages.ts:184-233`),
carrying `outputCapReached: z.literal(true).optional()` and `continuationLegs: z.number().optional()`, written
through the single narrowing seam (`packages/inference/src/backends/wire/provider-metadata.ts:131-143`). The
projection that today spells the same condition twice
(`packages/server/src/domain/chat/persistence/queries.ts:222` and
`packages/server/src/domain/chat/persistence/canon-write.ts:936`) collapses to one predicate keyed on the
member, and that predicate serves both providers. Two copies of a condition about to grow a second provider
is the defect to remove before adding the second provider.

### Cancellation, and what a failed second leg does to the first leg's text

- **Cancellation.** One `turnAbortSignal` covers every leg (`chat.ts:70`,
  `packages/inference/src/backends/http/idle-timeout.ts:52`) and its window resets on each part, so a cancel
  between legs reaches the next request's signal before that request leaves. No new path is needed, and the
  abort classification is unchanged.
- **The second leg fails.** The first leg's deltas have already fanned live, and `runWithPreCommitRetry`
  commits on the first delta (`packages/inference/src/backends/http/retry.ts:1-5`), so the second leg is
  never retried and its failure is the turn's failure. Nothing reaches canon on a failed turn, so the first
  leg's text streams and is then discarded with the turn's slot — the same outcome as today's mid-stream
  provider failure. That is deliberate: the provider's remaining budget is unknown at that point, so
  committing half a reply would record a length-capped message with no continuation left. A person who wants
  the text extended after a failure has `continueTurn`, unchanged.
- **The policy is spent while the provider still truncates.** The turn ends `length` and the token is
  discarded, with a warning that names the spent policy. `finishReason` stays the truthful word for what the
  reply is.

## Rejected

- Raising `maxOutputTokens` to the model ceiling on every leg from inside the backend: re-derives the clamp
  in the wrong layer (`Tier-3b-Providers.md:206`) and makes the bill unbounded.
- Committing the first leg when the second fails: records a truncated reply as a finished one.
- A `continue`-kind turn for the resume: doubles the turn in history, bills for a stitch, invalidates the
  token.
- Persisting the token in the variant sidecar: decode state with no reader after the turn, and a stored token
  invites a replay against a budget that no longer exists.
- Gating on a Gemini-4 model-name list or on the raw finish word: model-id sniffing where a capability cell
  already exists.
- Continuing the already-automatic `CONTINUATION` case ourselves: the SDK's wrapper owns it
  (`@ai-sdk/google` 4.0.102 `dist/index.js:1907-1918`) and a second implementation would consume the token
  twice.
- A per-turn output budget that the fit reserve also reserves: see the D355 row's rejected list.

## Coupled sites

- `packages/contracts/src/inference/capability/generation.ts` — the new turn cell, its tuple membership, its floor default.
- `packages/contracts/src/inference/capability/reads.ts` — the one predicate for the cell.
- `packages/inference/src/capability/sources/curated/google.ts` — the rows that carry it, with the dist pin as the cite.
- `packages/inference/src/contract/resolve.ts` — the continuation policy on the resolved knobs.
- `packages/inference/src/funnel/resolve-chat.ts` — resolves the policy beside the clamp; the loud drop.
- `packages/inference/src/backends/google/chat.ts` — the leg loop, one attempt, one fold.
- `packages/inference/src/backends/google/options.ts` — the token and the per-leg cumulative budget.
- `packages/inference/src/backends/google/usage.ts` — `initialPromptTokenCount` beside the summed counts.
- `packages/inference/src/backends/v4/result.ts` — the drain fold.
- `packages/inference/src/backends/wire/provider-metadata.ts` — the Google member's producer.
- `packages/contracts/src/chat/messages.ts` — the Google sidecar member.
- `packages/server/src/domain/chat/persistence/queries.ts` — the one past-cap predicate, read side.
- `packages/server/src/domain/chat/persistence/canon-write.ts` — the same predicate, commit side.
- `docs/law/ai-sdk-surface.md` — item 3 becomes wired; the unused-capability bullet stops saying we ignore it.
- `docs/law/Tier-3b-Providers.md` — rule 8 points at the new row.
- `docs/adr/` — the new row (D355) plus `docs/adr/README.md` through `pnpm doc index`.
- `docs/work/3575-google-continuationtoken-fully-wire-the-round-trip.md` — Evidence filled at landing.
- `tests/support/node/google-stream.ts*` — the Google SSE fixture, new, mirroring `tests/support/node/anthropic-stream.ts`.
- `tests/inference/backends/google/continuation-wire.int.test.ts*` — the new wire suite.
- `tests/server/domain/chat/persistence/` — the record cases beside the existing text-cap suite.

## Test plan

New wire test home: `tests/inference/backends/google/continuation-wire.int.test.ts*` (a `*` path is a file
this plan creates at landing, so it cites as a pattern until it exists), driven like
`tests/inference/backends/anthropic-messages/chat-wire.int.test.ts:1-80` (runtime root, wired connection, a
recorded request per call, a captured response body per call). Each case is red without the change.

| Case | Red it proves |
| - | - |
| The round trip: first response ends `MAX_TOKENS` with a token, the second ends `STOP` with the rest of the text | one request, `finishReason` `length`, half the reply |
| Planted control: a `MAX_TOKENS` reply with no token makes one request and keeps `length` | the loop is token-driven, not finish-driven |
| Planted control: a model row without `turns.serverContinuation` never sends a token | the gate reads the cell, not the reply |
| The bound: a third `MAX_TOKENS` plus token reply produces no third request and a policy-spent warning | an unbounded loop issues a further request |
| The cap is the funnel's: the model ceiling below the requested cumulative budget sends the ceiling plus one clamp warning | a backend-computed budget fails this case |
| The record: a multi-leg turn reports `outputCapReached` and `modelCalls: 2`; a single-leg turn reports neither | the projection reads only the subscription's provider id |
| Usage: `initialPromptTokenCount` present keeps `tokensIn` summed and exposes the first-request prompt count separately | the reader has no member for it and the figure is lost |
| Cost: two legs price the summed figures once, not twice | the cost fold runs per leg |
| Cancellation between legs: abort after the first finish, before the second request | a second request leaves after the cancel |
| Leg-two failure: the second response is a 500, the turn fails, no canon row, no replay of the first leg's deltas | a retry replays committed text |

The first case also asserts the second body's `contents` is byte-equal to the first body's,
`continuationToken` equal to the emitted value, and `maxOutputTokens` equal to the funnel's cumulative figure.

The record cases go in `tests/server/domain/chat/persistence/`, beside
`tests/server/domain/chat/persistence/message-text-cap.suite.int.test.ts:84`, which is where the freshly
committed view's absent cap fact is already asserted. Suites at landing:
`pnpm test tests/inference/backends/google tests/server/domain/chat/persistence`, `pnpm typecheck` for the
affected programs, and `pnpm lint`. The wire case double-checks a recorded body against the dist pins above,
so an SDK bump that moves `:2324` fails here rather than in production.

## Rulings and file headers this could break

- `packages/inference/src/backends/google/model.ts:1-10` — `name:` is FORBIDDEN on `createGoogle`; the loop
  reuses the one factory built at `chat.ts:77`, never a second with a name.
- `packages/inference/src/backends/google/usage.ts:1-2` — usage is parsed before the SDK's absent-field to
  zero conversion; `initialPromptTokenCount` may sit beside the totals and may never substitute for them.
- `docs/law/Tier-3b-Providers.md:206` (rule 8) — the clamp stays in the funnel; a per-leg budget computed in
  the backend breaks it.
- `packages/contracts/src/preset/index.ts:389-408` — one cap value for the reserve and the wire. This plan
  adds a cumulative budget for extra legs inside the resolved policy; it does not change what the first leg
  sends.
- `packages/contracts/src/chat/messages.ts:182-183` — every member of the sidecar union must have a live
  producer, so the Google member is written by this change or not added.
- `packages/server/src/domain/chat/persistence/queries.ts:205-206` — the sidecar is reduced to the one
  member-visible fact; a member no member-facing read uses does not belong in it.
- `packages/inference/src/backends/http/retry.ts:1-5` — the leg loop lives inside one attempt; a retry after
  a committed delta would replay text.
- `packages/inference/src/backends/v4/stream.ts:277-307` — the synthesized-finish guard needs exactly one
  finish part, so the fold presents the last leg's and nothing else.
- `packages/contracts/src/inference/finish-reasons.ts:1-10` — `length` stays the only cap word; no new
  normalized member for a continuation.
- `docs/law/deepseek-api-surface.md:72-111` — the continue row stays the domain's continuation vocabulary; no
  Google-specific row semantics leak into `domain/chat`.
- `docs/law/ai-sdk-surface.md:157-158` — item 3 is amended to wired in the same commit as the code, or the
  ruled sentence and the tree disagree.
- `docs/adr/0069-turn-shaping-capability-axis.md:17` — a new capability axis is a cell plus a predicate, not
  a model-name test and not a per-backend sniff.
- `packages/server/src/domain/chat/contract/results.ts:288-297` — a multi-leg turn that forgets `modelCalls`
  reads as a backend ignoring the cap, which is the defect that comment was written against.

## Open questions

- **Whether the provider bills the re-sent prompt in full on a continuation.** The SDK doc says prompt plus
  output so far is re-sent as input and the budget is cumulative, which reads as a full prompt charge. One
  recorded two-call exchange settles it; if the owner judges the second charge unacceptable for a
  provider-side truncation, the honest alternative is the domain `continue`, and this plan shrinks to the
  record half.
- **Whether a continuation request accepts `cachedContent`, tools and a structured response format.** The SDK
  re-sends the first body verbatim for the case it handles itself (`...args`), so mirroring is the default,
  but one probe per combination is owed before the loop sends a token beside those fields.
- **Which curated row carries the cell.** The generic Google row matches every `gemini-*` id, so a narrow row
  for the long-decode models is the honest cut; the pattern and its evidence cite are the lane's to propose,
  and the row must not be written from a model name guessed out of the dist's prose.
- **Whether a `CONTINUATION` chunk ever reaches us outside the SDK's wrapper.** Today its own loop hides it.
  If a future SDK exposes it, the fold keeps only the last finish, so that case needs its own decision.
