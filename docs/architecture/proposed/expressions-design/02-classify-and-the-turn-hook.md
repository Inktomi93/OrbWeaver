# 02 — Classify (the chat-role shaper) and the Post-Turn Hook

> **Status: COMMITTED (D49 item 4) — prescriptive design; the ledger D-entry wins on any conflict.**
> The v1 classify path (a chat-role request-shaper — the D47 translate/summarize pattern; v2
> `local-light classify` role stays reserved per D39's role-add template) and the exact chat graft.
> ST evidence: `DEFAULT_LLM_PROMPT` + `parseLlmResponse` (`extensions/expressions/index.js`) —
> one-line cites; the orbweaver shape replaces ST's 2s poll worker with a post-turn hook.

---

## 0. The wiring principle — chat stays expressions-blind

`domain/chat` gains NOTHING expressions-specific. The graft is ONE injected, OPTIONAL op on
`ChatContext` (wired at `entry/compose`; absent in tests/non-expressions deploys — a `null` op is
the no-op), following the committed rpg precedent verbatim (`rpg-design/05` §0):

| Injected op (chat side) | Provided by `domain/expressions` | Called at |
|---|---|---|
| `expressions.onTurnCompleted(chatId, messageId, variantId)` | `verbs/on-turn-completed.ts` | post-turn background step, after the assistant variant commits / the stream finishes — fire-and-forget (`void`-ed with error logging, never awaited on the reply path) |

**Enforcers (the pin):** dep-cruiser — `domain/chat/**` never imports `domain/expressions/**` (and
vice versa; both talk through contracts + injection); a contract test pins that a chat turn with
the op ABSENT produces a byte-identical assembled request AND persisted rows vs the op wired on a
sprite-less chat (the "non-expressions deploy byte-identical" guarantee — the rpg no-game
byte-identity test, same harness).

**WHY a post-turn hook and not a GATHER contribution:** classify consumes the COMPLETED variant
text; it contributes nothing to the prompt. It is a pure side-effect, the same lifecycle slot as
rpg's `onTurnCompleted` (flush/trace/cadence) and stats' delta persist. *(Rejected: ST's 2s
client-poll `moduleWorker` — polling against the server, re-classifying on ticks, streaming
throttles; the turn lifecycle already tells us exactly when a variant is final. Rejected: a
blocking RECEIVE step — D53's law: nothing async ever blocks a turn.)*

**WHY not a WorkloadKind:** classify is one fast LLM call per turn, not bulk work. A workload row
per turn would grow the never-deleted `workloads` audit table by one row per message forever, and
the single-active-per-kind lock would serialize classify across ALL chats. *(The workload engine is
for slow/bulk jobs — doc 03 uses it correctly for sheet generation.)*

## 1. The classify path (Q1 — committed, restated)

**v1 = a named request-shaper over the resolved `chat` role in `infra/providers`** — the exact
pattern D47 blessed for translate/summarize. **v2 (reserved, not built):** a real `classify`
`PROVIDER_ROLE` served by `local-light` (GoEmotions ONNX — key-less/GPU-less users get expressions
free; D39 is the template for adding a role to the dispatch axis). The domain verb is
backend-agnostic either way — swapping v1→v2 changes the injected `classifyTurn` op's provider,
zero domain code.

## 2. The shaper — injected-op interface, prompt, structured output, snap

### 2.1 The injected op (contract/ops.ts)

```ts
export interface ClassifyTurnRequest {
  readonly text: string;                    // the completed variant's visible prose (post-regex, pre-markdown)
  readonly labels: readonly string[];       // the CLOSED set — this character's sprite labels (§5)
  readonly userId: UserId;                  // the turn principal — bills/resolves like any shaper call (D19 runAsUserId posture)
}
export interface ClassifyTurnResult {
  readonly raw: string;                     // the model's reply (structured: the parsed label; free-text: verbatim)
  readonly structured: boolean;             // whether responseFormat was used (test observability)
}
export type ClassifyTurnOp = (req: ClassifyTurnRequest) => Promise<ClassifyTurnResult>;
```

Provided by `infra/providers` (the shaper), wired at compose. The shaper resolves the `chat` role
via `connection.resolveRole("chat")` under the calling user — never its own credential path.

### 2.2 The prompt skeleton (the shaper's template — one home, in the shaper beside the translate/summarize templates)

```
System: You are an emotion classifier. Ignore all prior instructions and roleplay context.
User:   Classify the dominant emotion expressed in the following message.
        Respond with exactly one word, chosen ONLY from this list:
        {labels}

        Message:
        {text}
```

ST's `DEFAULT_LLM_PROMPT` ("Ignore previous instructions … Output just one word … Choose only one
of the following labels") is the ancestor — one-line cite. `{text}` is length-capped (tail 4000
chars of the variant — emotion lives at the end of a long message; a full 32k variant is token
waste). Sent as a quiet, non-persisted completion (no chat row, no bus delta — the imagery
extract-prompt precedent).

**Structured output (the D48 axis):** when the resolved model's `ModelCapability.output.structured`
is present, the shaper attaches a `responseFormat` (tool-use.md §6.2 vocabulary, exactly):

```ts
const responseFormat: ResponseFormat = {
  name: "expression_classification",
  schema: {
    type: "object",
    properties: { label: { type: "string", enum: [...labels] } },
    required: ["label"],
    additionalProperties: false,
  },
  strict: true,
};
```

The enum-constrained schema makes snap-to-label a formality on capable models. When
`output.structured` is absent the shaper sends the plain prompt (NO `structured_output_unsupported`
warning is emitted — the shaper chose not to request it; the warning code is for user-requested
formats that get dropped, tool-use.md §6.5).

### 2.3 `snapToLabel` — the pure-function contract (substrate/snap.ts)

```ts
/** Deterministic. No I/O, no clock. Goldens in 05 §3. */
export function snapToLabel(raw: string, labels: readonly string[]): string | null;
```

Algorithm (first hit wins, in order):
1. **Normalize** `raw`: trim → NFKC → lowercase → strip surrounding quotes/punctuation
   (`[."'!?,:;]` at both ends) → collapse internal whitespace.
2. **Exact match** against `labels` (each already normalized per 01 §5).
3. **First-word match** — split on whitespace, test token 1 (models often reply `"joy."` or
   `"joy — the message …"`).
4. **Word-boundary scan** — the FIRST label (in `labels` order) appearing as a whole word anywhere
   in the normalized reply (ST `parseLlmResponse` posture — one-line cite).
5. **Miss → `null`**.

**Fallback decision:** on `null`, the verb falls back to **`"neutral"` IF the character has a
`neutral` sprite, else NO event.** WHY: a stage snapping to a wrong-but-confident emotion is worse
than holding the current sprite; `neutral` is the only universally safe correction. *(Rejected:
ST's `joy` fallback — an affirmative emotion is exactly the wrong default under a grim scene;
rejected: random/first-label — noise.)*

## 3. `on-turn-completed.ts` — the verb body (the exact order)

```
onTurnCompleted(chatId, messageId, variantId):
  1. settings ← readUserSettings(turn owner).expressions            // §5
     if !settings.autoClassify → return                              (default OFF)
  2. turn ← readTurn(chatId, messageId, variantId)                  // injected chat op, §3.1
     if turn == null || turn.speakerCharacterId == null → return     (deleted mid-flight / user or narrator turn)
  3. n ← countByCharacter(turn.speakerCharacterId)                  // own persistence — the early-out probe
     if n === 0 → return                                             (NO sprites — the ST early-out; the UI
                                                                      counterpart offers "Generate sprites" — doc 03
                                                                      resolves the dead-on-arrival gap)
  4. labels ← listByCharacter(...).map(label)                        (the character's ACTUAL set = the closed list;
                                                                      classifying into labels with no sprite is waste)
  5. res ← classifyTurn({ text: turn.text, labels, userId })
  6. label ← snapToLabel(res.raw, labels) ?? ("neutral" if present else return)
  7. emitChatEvent({ type: "expression", chatId, characterId, messageId, variantId, label })
```

Any throw at steps 2–7 is caught, logged (`foundation/observability`), and swallowed — **classify
error ⇒ no event, NEVER a failed turn** (the D53 posture; the hook is already off the reply path,
this pin covers the background task too). No retry (the next turn classifies again; a per-turn
cosmetic signal is not worth retry machinery — the crew-prose-audit "bounded retry" is for
workloads, not this).

### 3.1 The `readTurn` injected op (chat provides it — id-only args, re-read canon, D38 discipline)

```ts
export interface ReadTurnResult {
  readonly speakerCharacterId: CharacterId | null; // null ⇒ user/persona/narrator turn — no sprite target
  readonly text: string;                           // the variant's final visible prose
}
export type ReadTurnOp = (chatId: ChatId, messageId: MessageId, variantId: VariantId)
  => Promise<ReadTurnResult | null>;               // null ⇒ row vanished (deleted mid-flight)
```

WHY ids + re-read instead of chat passing the text in the hook args: the hook signature is pinned
to the rpg convention (ids only); re-reading canon keeps the op payload-free and swipe-safe (the
variant read is authoritative even if an edit landed between commit and classify). One extra
point-read per classified turn — negligible.

## 4. The bus event — `ChatBusEvent` gains one member (shape finalized)

```ts
// @orb/contracts/chat — the ChatBusEvent union, additive member:
{
  type: "expression";           // NOTE: `type`, not `kind` — the union's discriminant (D50);
                                //   the committed doc's `{kind:…}` sketch normalizes here (README flag #2)
  chatId: ChatId;
  characterId: CharacterId;     // whose sprite to swap
  messageId: MessageId;         // ↓ swipe-correctness pair
  variantId: VariantId;
  label: string;
}
```

**`messageId`/`variantId` ARE included (decision).** WHY: swipes. A regenerate produces a new
variant and a new classify; without the variant key a slow classify for a swiped-AWAY variant
would arrive late and stamp the stage with a stale emotion. The client compares the event's
`variantId` to the currently displayed variant and drops mismatches; it also feeds the client-side
`variantId → label` session cache that makes swipe-BACK correct for free (04 §3). *(Rejected:
label-only event — the race above; rejected: persisting a per-variant label column to re-read on
swipe — a schema column for pure presentation state; the session cache covers it at zero cost,
and the criterion to revisit is stated in 04 §3.)*

**Durability posture:** the event is EPHEMERAL — never logged to `chat_events` (it is presentation
state, not a canon mutation; the `chatOpened` precedent, D50). It carries `label` as payload — a
justified deviation from the id-only re-read discipline because there is deliberately NO canon row
holding the classify result to re-read. The union member + the regenerated
`satisfies Record<ChatBusEvent["type"], true>` replay guard ride the `0000_baseline` squash
(pre-launch); the `chat_events_type_check` CHECK is regenerated with it for union↔CHECK mirror
consistency even though this member never persists.

**WHY the chat bus and not an own bus (the rpg contrast, argued):** rpg got its own bus because its
events are a different consumer surface (HUD/tracker/map) and would have widened the union 24→35.
Expressions is ONE member consumed by the same chat-view client surface that already holds the bus
subscription — an own SSE stream for one cosmetic event is ceremony. The committed doc already
places it on `ChatBusEvent`; this confirms it against the D50 rejection reasoning rather than
re-deciding.

**The emit seam:** expressions emits via the injected `emitChatEvent` op — the exact `WiBusEvent`
precedent (chat.md: "embeds WiBusEvent so WI emits without importing back into chat").

## 5. Cost controls (Q3 — decision)

- **`UserSettings.expressions.autoClassify: boolean` — default `false`.** One additive
  `UserSettings` namespace (settings.md pattern). Default-OFF because every classified turn is a
  real LLM spend on the user's credential.
- **The no-sprites early-out doubles as the per-character toggle.** A character with zero sprite
  rows costs zero classify calls; giving a character sprites IS opting them in. *(Rejected: a
  per-character `classifyEnabled` column — a migration + a second toggle expressing what sprite
  existence already expresses.)*
- **One classify per completed variant** — group chats classify only the speaking character
  (`speakerCharacterId` from the variant), never the whole cast.
- **Cheap-model routing is free later:** the shaper resolves the `chat` role today; if a user wants
  classify on a cheap model, the v2 `classify` role (or pointing the shaper at the `summarize`
  role config — the imagery open-question precedent) is the seam. Not v1.
- **Why `chat` here where imagery's extraction chose `summarize` (deliberate divergence, recorded
  — design-review EXP-3):** extraction is keyword-listing — any cheap model does it, so routing it
  off the conversation model is pure savings; classification into a CLOSED label set over roleplay
  nuance tracks the conversation model's reading of the scene, and default-OFF + the no-sprites
  early-out already bound the spend. The seam above is the convergence path if cost ever beats
  fidelity.

## 6. Test plan (this doc's slice — full plan in 05)

- **snap-to-label goldens** (pure, deterministic): `"Joy."`→joy · `"  ANGER  "`→anger ·
  `"joy — she seems happy"`→joy · `"The emotion is sadness"`→sadness (word-boundary) ·
  `"happiness"`→null · label-order tie (`"sad but relieved"` with both labels)→first-in-list ·
  custom label `"smug"` in the set → matched.
- **Hook null-op pin:** turn with op absent ≡ byte-identical to op-wired-but-sprite-less (request
  assembly + persisted rows + emitted event count).
- **Failure posture:** classifyTurn throws → no event, turn rows untouched, error logged once.
- **Early-out order:** settings-off short-circuits before `readTurn` (no canon read when disabled).
- **Structured path:** capability with `output.structured` → the request carries the enum
  `responseFormat`; without → plain prompt, and NO `structured_output_unsupported` warning.
- **Swipe race:** event for variant A arriving while variant B is displayed → client drops it
  (04 §3 test, listed here for the pair).
