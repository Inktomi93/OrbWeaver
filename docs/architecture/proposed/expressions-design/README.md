# Expressions Design — the prescriptive plan for `domain/expressions` (doc-set index)

> **Status: COMMITTED (D49 item 4, full scope — Nate greenlit; 2026-06-28).** This doc set is the
> authoritative BUILD design for the expressions domain. The ledger D-entry
> (`Core-Laws-and-Precedents.md` D49) is the decision record and wins on any conflict; the committed
> decision record [`../../domains/expressions.md`](../../domains/expressions.md) is expanded here,
> never contradicted — where this set adds detail, this set wins on detail. Evidence base: the ST
> `extensions/expressions/index.js` source audit (the archived `proposed/expression-stage/` proposal,
> git history at `982fd99^`) + marinara `sprites.routes.ts` (sprite-sheet generation — the
> Marinara-Residue B1 fold-in, decided into this domain). Everything here is prescriptive and
> self-contained: a builder with ONLY this doc set + the orbweaver law docs (AGENTS-1/2/3, the domain
> docs it cites) can build the whole system. Every decision carries its WHY + the rejected
> alternative.

## The one-paragraph design

A character gets a **sprite set** — N labelled images bound by `character_sprites` rows
(`(characterId, label) → assetId`, bytes in the D21 per-user CAS) — managed by plain CRUD verbs,
**generated on demand** by an `expressions-sprite-sheet` WorkloadKind (the marinara B1 fold-in: one
sheet prompt → injected `imagery.generatePicture` → sharp grid-slice via an injected `infra/image`
op → matte (the local-light RMBG model op when that backend is configured; deterministic
corner-flood as the zero-setup fallback — 03 §4) → `assets.store` per cell → batch row write), and
**driven per turn** by a
post-turn chat hook (`expressions.onTurnCompleted(chatId, messageId, variantId)` — an optional
injected op on `ChatContext`, the exact rpg/databank precedent; chat stays expressions-blind). The
hook classifies the completed assistant variant with a **chat-role shaper** (closed-label prompt;
D48 `responseFormat` when the model supports structured output; pure snap-to-label otherwise),
emits one ephemeral `ChatBusEvent` `{type:"expression"}`, and the Phase-6 client stage crossfades
the matching sprite. Classify is default-OFF, early-outs when the speaker has no sprites (the
sprite-sheet generator is what keeps that early-out from making the feature dead-on-arrival for
non-artists), and NEVER blocks or fails a turn. Background stays a D44 `ThemeOverride` token — not
this domain (committed; unchanged here).

## Reading order

| Doc | What it locks |
|---|---|
| [`01-domain-shape-and-schema.md`](01-domain-shape-and-schema.md) | the 8-slot layout, all contracts inline (labels tuple, zod, views), the `character_sprites` DDL, the `"sprite"` AssetKind, CRUD verb signatures, the GC/reap seam, group visibility, custom-label validation |
| [`02-classify-and-the-turn-hook.md`](02-classify-and-the-turn-hook.md) | the classify shaper (prompt skeleton, structured-output usage, the snap-to-label pure-function contract), the injected post-turn op + its byte-identity pin, the bus event shape, cost controls, failure posture |
| [`03-sprite-sheet-generation.md`](03-sprite-sheet-generation.md) | the B1 headline: the sheet-prompt compiler, the injected imagery/image/assets ops (exact signatures), grid geometry, the two-arm matte design (local-light RMBG model + flood fallback), idempotency + partial-failure posture, the `expressions-sprite-sheet` WorkloadKind |
| [`04-client-stage.md`](04-client-stage.md) | the v1 single-sprite holder: event → swap data flow, what the client may/may not compute, the swipe-back cache, crossfade, blob resolution |
| [`05-build-plan.md`](05-build-plan.md) | E1–E5 chunks with sizes, dependencies (pre-Phase-5 vs Phase-5 vs Phase-6 vs the Phase-7 workload), checkpoints, per-chunk test plans |

## Resolutions of the committed doc's §6 open questions

| # | Question | Resolution (detail in the cited doc) |
|---|---|---|
| Q1 | classify path | **DECIDED (was already committed): v1 = chat-role shaper**; v2 `local-light classify` role stays reserved (D39 template). 02 §1. |
| Q2 | group sprite visibility | **DECIDED: member-visible** — the blob-route membership exception extends from "the avatar" to "avatar + sprites of a roster character". 01 §6. **Review flag: needs a one-line D21 ledger amendment** (D21 says "ONE narrow exception"). |
| Q3 | cost/latency gating | **DECIDED:** `UserSettings.expressions.autoClassify`, default **false**; plus the no-sprites early-out (which doubles as the per-character toggle — sprite existence IS the opt-in). 02 §5. |
| Q4 | custom-label strictness | **DECIDED:** normalize (trim → NFKC → lowercase), validate `^[a-z0-9_-]{1,32}$`; the GoEmotions tuple is seed/UI-suggestion only, never a whitelist. 01 §5. |
| Q5 | v1 render slot | **DECIDED (was already committed): single-sprite holder**; in groups it shows the most recent classified speaker. 04 §1. |

## Standing decisions a cold agent must not re-litigate

VN scene compositor / live2d / VRM / talkinghead — permanently out (D49) · group multi-sprite VN
layer — deferred v2 at best · background is a D44 `ThemeOverride` token, NOT a domain (committed
`domains/expressions.md` §5 — unchanged by this set; no body doc re-covers it) · classify is a
server-side shaper against the resolved credential, never a browser call · no raw `url()` across
the theme-token boundary · sprite-sheet generation is EXPRESSIONS-owned (domain-of-affect: it
writes `character_sprites` rows); `domain/imagery` is consumed by injection
(`imagery.generatePicture`) and owns zero sprite rows (the D58 seam posture, mirrored) · the
classify hook mirrors the rpg injected-op convention exactly (`onTurnCompleted(chatId, messageId,
variantId)`, null-op when unwired, byte-identical non-expressions deploy) · classify never blocks
or fails a turn (the D53 nothing-async-blocks-a-turn posture).

## Review flags (argued, not silently decided)

1. **D21 membership-exception wording.** Extending the blob-route exception to sprites (Q2) is the
   right call and the committed doc's own lean, but D21's text says "ONE narrow, sanctioned
   membership exception: the avatar". Record a one-line ledger amendment ("avatar + expression
   sprites of a roster character — the in-room public face set") when this builds. (01 §6.)
2. **Event discriminant normalization.** The committed doc sketches the bus event as
   `{kind:"expression"}`; the real `ChatBusEvent` union discriminant is `type` (D50's
   `satisfies Record<ChatBusEvent["type"], true>` guard). This set uses `type:"expression"` — a
   mechanical normalization under the doc's own "ledger wins on conflict" header, not a re-decision.
   (02 §4.)
3. **RESOLVED (Nate, 2026-07-01) — the matte is DESIGNED, two arms.** The original LEAN rested on
   a false premise ("no ML dependency"): `@huggingface/transformers`/ONNX is already in the stack
   (local-light rerank; 02's v2 classify rides the same backend). `matte:"model"` is a v1-OPTIONAL
   designed arm — `createLocalLightMatte(cache)` on the local-light backend (RMBG-1.4 weights,
   lazy model-cache download), preferred when local-light is configured; corner-flood remains the
   zero-setup fallback, prompt discipline serves both. (03 §4.)
4. **Workloads' single-active-per-kind lock serializes sprite-sheet jobs deployment-wide.**
   Accepted for v1 with a stated criterion to re-scope. (03 §7.)
