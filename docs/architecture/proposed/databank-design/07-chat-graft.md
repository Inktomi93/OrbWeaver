# 07 — The Chat Graft: `gatherRetrieval`, the `{{databank}}` Slot, the Byte-Identity Pin

> **Status: COMMITTED (D49 item 5) — prescriptive design.** How databank rides chat's ONE pipeline
> (RESOLVE→GATHER→BUILD→SHAPE, chat.md Part II) with zero chat-domain knowledge of databank.
> **This graft is the PRECEDENT rpg-design 05 §0 and chat-crew-design 04 cite** — the three designs
> deliberately speak one vocabulary: an optional injected GATHER op wired at `entry/compose`,
> `null` = a byte-identical non-feature turn, enforced by dep-cruiser + a contract test.

---

## 1. The wiring principle — chat stays databank-blind

`domain/chat` gains NOTHING databank-specific. The graft is ONE injected, OPTIONAL op on
`ChatContext` (absent in non-databank deploys/tests — an absent/`null` op is the no-op):

| Injected op (chat side) | Provided by `domain/databank` | Called at |
|---|---|---|
| `databank.gatherRetrieval(params) → DatabankGatherResult \| null` | `verbs/gather-retrieval.ts` | GATHER phase, alongside memory recall (after the WI pool — both feed the macro ctx before BUILD). `null` = nothing to inject ⇒ byte-identical non-databank turn |

No SEND/RECEIVE hooks, no tools, no bus: databank contributes prompt CONTEXT only (contrast rpg's
three ops — databank has no swipe-coupled state to commit and no post-turn work; one op is the
whole surface). REJECTED: a post-turn hook for usage stats (nothing to record that the existing
turn-economics path doesn't already see).

**Enforcers:** dep-cruiser — `domain/chat/**` never imports `domain/databank/**` and vice versa
(both talk through contracts + compose-time injection); the §5 byte-identity contract test.

---

## 2. The op contract (databank `contract/params.ts` / `results.ts`)

```ts
export const databankGatherParamsSchema = z.object({
  chatId: chatIdSchema,
  /** Built by chat's GATHER (§4) — databank never reads chat canon. */
  queryText: z.string(),
  /** The {{databank}} slot's share of the ONE budget pass, in tokens (§6). */
  tokenBudget: z.number().int().positive(),
});
export type DatabankGatherParams = z.infer<typeof databankGatherParamsSchema>;

export interface DatabankGatherResult {
  /** The {{databank}} MacroContext value: retrieved chunks joined per §3. Never empty —
   *  an empty retrieval returns null instead (the no-op contract). */
  text: string;
  /** Provenance for observability/debug trace (id-only refs — never re-rendered into the prompt). */
  hits: readonly { documentId: DocumentId; chunkIdx: number; score: number }[];
  /** Estimated tokens of `text` (the same estimator the budget pass uses). */
  tokensEstimated: number;
}
```

### The verb's internal sequence (`verbs/gather-retrieval.ts`)

```
1. settings = getDatabankSettings(hostId)            // k / minScore / rerank
2. hits = searchDocuments({ scope: { chatId }, queryText, k, minScore, rerank })   // injected op
3. if hits.length === 0 → return null                // covers the empty-bank case too
4. text = fit-and-join(hits, tokenBudget)            // §3 + §6
5. return { text, hits: idRefs, tokensEstimated }
```

Scope resolution happens ONCE, inside `search.documents` (via the injected resolver — doc 05
§3.2/§3.3 step 1), whose empty-allowlist short-circuit returns `[]` with ZERO embed calls — so a
chat with no attached documents does zero databank work per turn, forever (the trigger-discipline
mirror). REJECTED: a pre-check `resolveActiveDocumentIds` call here (a second resolution of the
same union per turn for no added laziness).

---

## 3. The `{{databank}}` slot semantics

- **A reserved macro slot in the DYNAMIC/CACHE-SAFE half, exactly parallel to `{{memory}}`.**
  Retrieval changes every turn, so the value must live where per-turn change is expected; placing
  it in the static half would bust the prompt cache every turn (the static/dynamic split exists
  precisely for this). The preset owns WHERE the slot renders (its section order — the rpg GM
  preset already plans `{{databank}}` in its continuity region, rpg-design 09(d)); databank
  supplies only the VALUE. REJECTED: a depth-positioned injection into the `Injection[]` list
  (ST injects at depth 4 SYSTEM — but orbweaver's preset-section model makes position a USER
  choice via the slot's section placement, which is strictly more tunable than a hardcoded depth;
  one-line cite `vectors/index.js:678` `injectDataBankChunks`).
- **Slot value format (the prompt text):** within a document, chunks joined with `\n`; documents
  separated by `\n\n`, each document block headed by `# {documentName}` (grounding the model on
  provenance). The wrapper prose ("Related information:" — ST `file_template_db`) belongs to the
  PRESET section template around the slot, not to databank. Order = the reading-order-restored
  output of `search.documents` (doc 05 §3.4), verbatim.
- **Absent-value rule:** op absent, `null` result, or macro not referenced by the preset ⇒ the slot
  resolves EMPTY — same rule as every reserved slot (`{{world_state}}` precedent), so presets that
  reference `{{databank}}` before the graft lands are legal no-ops.

---

## 4. Query-text construction (decided)

**Chat's GATHER builds `queryText` = the pending user text + the last 2 committed turns' content
(most-recent-first concatenation, capped at ~1000 chars), and passes it in.** ST evidence:
`getQueryText(chat, 'file')` uses the last 2 messages (one-line cite `vectors/index.js:576`);
orbweaver adds the PENDING user text explicitly because GATHER runs before the user row is part of
loaded history — the pending text is the strongest retrieval signal there is.

- WHY chat builds it (not databank): the haystack (pending text + recent turns) is data chat's
  GATHER already holds for WI keyword matching; databank reading `messages` via `@orb/db` would
  add a cross-domain canon read for data its caller already has in hand. This mirrors memory's
  division: the CALLER-side policy builds the query text, the engine scans. REJECTED:
  databank-owned query construction (a new messages read + chat-schema knowledge inside databank).
- WHY last-2 + pending (not more, not less): the pending message alone loses immediate context
  ("tell me more about that"); the whole window dilutes the query embedding toward the
  conversation's average. ST's last-2 is the field-tested middle; the cap keeps the embed input
  sane. REJECTED: last-user-message-only; REJECTED: a full-window query. LEAN: the count/cap stay
  code constants (not settings) until someone demonstrably needs the knob — criterion: retrieval
  complaints traceable to query construction.

---

## 5. The null-op contract (the byte-identity pin)

A non-databank turn is **byte-identical** with the op wired vs absent — the rpg `no-if(isGame)`
enforcement pattern, applied here first:

- op absent → GATHER skips the branch entirely;
- op wired, `gatherRetrieval` returns `null` (no active docs / no hits) → the `{{databank}}` macro
  value is the SAME empty resolution as op-absent; no injection list entry, no budget line, no
  section content — the assembled request byte-equals the ops-absent build.

**Contract test (chat integration layer):** assemble the same turn twice — databank op wired
(empty bank) vs absent — assert deep/byte equality of the full provider request. Plus the positive
control: attach a document, assert the request differs ONLY in the `{{databank}}` slot region.

---

## 6. Budget posture

The `{{databank}}` slot participates in chat's **ONE budget pass** like every other dynamic
contributor. Chat computes the slot's `tokenBudget` (from the preset's section allocation /
remaining window) BEFORE calling the op and passes it in; databank fits its text INSIDE the number
it was given:

- **whole chunks only** — fitting drops from the END of the reading-order list (the
  lowest-best-score document's tail first, then the document itself); a chunk is never truncated
  mid-text. WHY: a half chunk is incoherent context that still costs its tokens; dropping whole
  units preserves the reading-order property. REJECTED: mid-chunk truncation.
- the returned `tokensEstimated` uses the same `@orb/kit/tokens` estimator the budget pass uses, so
  chat's accounting and databank's fitting can't drift.
- WHY pre-pass budget (chat decides, databank obeys) rather than post-hoc trimming by chat:
  chat trimming databank's joined text would re-open mid-chunk truncation and break the
  document-block format; only databank knows the chunk boundaries. This is the same
  values-vs-budget split rpg's gather uses (rpg supplies VALUES; chat owns budgeting) — the op
  just receives its ceiling explicitly because its value is elastic where rpg's macros are not.

---

## 7. Group turns (the D16 mirror, restated for the graft)

`gatherRetrieval` resolves scope by CHAT, and the scope union is host-only v1 (doc 05 §3.2): every
speaker's turn in a group room retrieves from the HOST's attached documents only — a member's own
global bank never feeds a shared room, and no member receives another member's documents. The
gate-8 int test covers the graft path end-to-end: member B sends a turn in A's room → the assembled
prompt contains zero chunks from B's global documents and only A's-room-appropriate content.

---

## 8. Test plan (integration layer)

- **Byte-identity pin** (§5) — wired-empty vs absent; plus the positive control.
- **Budget fitting** — contrived hits exceeding the budget → whole-chunk drops from the tail,
  reading order preserved, `tokensEstimated <= tokenBudget`.
- **Query-text construction** — GATHER passes pending + last-2 (unit test on the chat side with a
  capturing fake op).
- **Group-scope leak** (§7) — the two-member int test through the real assemble path.
- **Slot formatting** — two docs, three chunks → `# name` headers, `\n` within, `\n\n` between,
  reading order.
- **Trigger discipline** — bankless chat across a full turn: `search.documents` returns `[]` via
  its empty-allowlist short-circuit and the counting fake EMBED client records ZERO calls.
