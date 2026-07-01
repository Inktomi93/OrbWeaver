# Orbweaver — `expressions` domain

> **Status: COMMITTED (D49, full scope). Promoted from `proposed/expression-stage/`. Phase 7.**
> Authoritative expansion of D49 item (4). The ledger D-entry wins on any conflict with this doc.
> Source proposal: `proposed/expression-stage/expression-stage.md`.

---

## 0. What this domain is (and what it isn't)

**`domain/expressions`** owns:

- The **`character_sprites`** persistence leaf — per-character labelled image assets (CRUD)
- The **classify call** — a chat-role shaper that picks an expression label per turn
- The **per-turn Phase-5 chat hook** — post-assistant-turn classify → emit `ChatEvent { kind:"expression", label }` → client swaps sprite

**Background** (app-chrome background image) is **NOT** in this domain. It is a `ThemeOverride` token in the
D44 theming system — see §5 for details. No domain, no DB table, no verb.

**VN scene compositor, live2d, VRM, talkinghead** — permanently de-scoped. Not built.

---

## 1. How ST does it (source-grounded)

ST's `extensions/expressions/index.js` (2719 lines) has three moving parts:

### 1.1 The label set

`DEFAULT_EXPRESSIONS` — the 28 GoEmotions labels (`admiration`, `amusement`, `anger`, …, `surprise`,
`neutral`). Fallback: `joy`.

### 1.2 The classifier (four backends)

- **`local`** — server-side BERT GoEmotions: `POST /api/extra/classify` (a small in-process ML model — the
  `local-light` tier equivalent)
- **`extras`** — same call against an external "Extras" server
- **`llm`** — reuses the chat LLM: a closed-label prompt via `generateQuietPrompt`, then snap-to-label from
  the reply. Optionally JSON-schema-constrained when supported.
- **`webllm`** — same prompt, in-browser WebLLM

ST's classify is **either a tiny local emotion model OR a structured single-word prompt to the existing chat model.**

### 1.3 The sprite-set convention

A **folder per character, a file per label** (`characters/<char>/joy.png`, `anger.png`, …). Custom
(non-GoEmotions) labels are allowed. `expressionOverrides` is a `name → path` remap.

### 1.4 The swap hook — per-message

`moduleWorker` runs on `setInterval(2000ms)` + `CHAT_CHANGED`. Each tick reads the last character message,
bails if unchanged, else classifies and crossfades the new sprite into `#expression-image`. Throttled
during streaming (`10000ms`; for LLM-api waits until stream finishes).

---

## 2. What neo kept / cut

**Both expressions and backgrounds were CUT from neo-tavern.** This is a ground-up re-introduction, not a
port — and that's the opportunity: do it D44/D21-compliant.

---

## 3. The three architectural pieces

### 3.1 Classify — v1: chat-role shaper (no new backend)

**Recommended v1:** a request-shaper over the `chat` role (the exact pattern D47 blessed for translate and
summarize). The label set is closed → constrain with structured-output capability where supported; otherwise
snap-to-nearest like ST's `parseLlmResponse`.

**v2 upgrade (reserved):** a real `classify` role served by `local-light` (D39 — today `embed`/`rerank`/
`imageEmbed`). A GoEmotions ONNX classifier gives key-less/GPU-less users expressions for free. Heavier;
the D39 role-add is the template for how.

Either way the classify is a **named shaper in `infra/providers`**, never a sideways call from a client extension.

### 3.2 `character_sprites` persistence model

A sprite set = N labelled images belonging to a character. Born-compliant per the constitution:

- **Single-owned** (D18/D23): hangs off the character; owner reached by **one FK** (`characterId → characters.ownerId`) — **derive owner, do NOT stamp `ownerId`** (D23)
- **Per-type FK, no polymorphism** (D24): `character_sprites(characterId FK, label, assetId FK)`, `unique(characterId, label)`. Image bytes are `assets` (D21 per-user CAS) — the sprite row is just the label↔asset binding.
- `label` is an open string (GoEmotions tuple as the seed/validation set, custom labels allowed — ST parity), with the canonical tuple single-homed in `@orb/contracts`

### 3.3 Per-turn Phase-5 chat hook

Can't land before chat. The classify-on-assistant-turn step is a **post-turn chat hook** (after the
assistant message commits / stream finishes), emitting the chosen label so the client swaps the sprite.
Same per-turn-side-effect shape as image-gen-in-chat (D47 item 1) and `domain/imagery`.

---

## 4. Home in the cake

### `domain/expressions/` — 8-slot leaf

```
domain/expressions/
├── index.ts          FRONT DOOR — ExpressionsService interface + factory
├── service.ts        COMPOSITION ROOT — zero logic
├── context.ts        DI BUNDLE — { db, classifyTurn, resolveRole, clock }
├── contract/
│   ├── service.ts    ExpressionsService interface
│   ├── params.ts     SetSpriteParams, ListSpritesParams, ClassifyParams
│   ├── results.ts    SpriteView, ClassifyResult
│   └── errors.ts     SpriteNotFoundError, ClassifyFailedError
├── verbs/
│   ├── set-sprite.ts         setSprite(characterId, label, assetId) → upsert
│   ├── list-sprites.ts       listSprites(characterId) → SpriteView[]
│   ├── remove-sprite.ts      removeSprite(characterId, label)
│   ├── reap-if-orphan.ts     delete sprite records when character deleted (cascade hook)
│   └── classify-turn.ts     (PHASE-5) classify last message → ExpressionLabel (chat-role shaper, v1)
├── persistence/
│   └── queries.ts    CRUD for character_sprites
└── substrate/
    └── labels.ts     EXPRESSION_LABELS tuple (GoEmotions seed; custom labels open); snap-to-label logic
```

### Contracts — `@orb/contracts/expressions`

```ts
export const EXPRESSION_LABELS = [
  "admiration",
  "amusement",
  "anger",
  "annoyance",
  "approval",
  "caring",
  "confusion",
  "curiosity",
  "desire",
  "disappointment",
  "disapproval",
  "disgust",
  "embarrassment",
  "excitement",
  "fear",
  "gratitude",
  "grief",
  "joy",
  "love",
  "nervousness",
  "optimism",
  "pride",
  "realization",
  "relief",
  "remorse",
  "sadness",
  "surprise",
  "neutral",
] as const;
export type ExpressionLabel = (typeof EXPRESSION_LABELS)[number] | (string & {}); // custom allowed

export type CharacterSpriteView = {
  characterId: CharacterId;
  label: string;
  asset: AssetRef;
};
```

### DB schema — `@orb/db/schema/expressions.ts`

```ts
export const characterSprites = sqliteTable(
  "character_sprites",
  {
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    assetId: text("asset_id")
      .$type<AssetId>()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    // NO ownerId — D23: owner derives via characters.ownerId
  },
  (t) => [primaryKey({ columns: [t.characterId, t.label] })],
);
```

### Chat event emitted (Phase-5 hook)

```ts
// In @orb/contracts/chat ChatBusEvent union:
{
  kind: "expression";
  characterId: CharacterId;
  label: string;
}
// The client render slot handles this event and swaps the sprite
```

---

## 5. Background — NOT a domain, it's a D44 `ThemeOverride` token

**Background is already homed.** `UI-Architecture-and-Layout.md` §12.1 lists it as one of the seven curated
`ThemeOverride` tokens — it was decided in D44. There is nothing to invent here; there is a field to fill in
and a shell slot to render it.

**Proposed `ThemeOverride.background` shape:**

```ts
background?: {
  src: AssetRef | ExternalUrl | null;          // null = inherit/none
  fit?: "cover" | "contain" | "stretch" | "center";   // default "cover"
}
```

**Security:** `<ThemeScope>` parses + clamps token values and **rejects `url()`/`expression()`** (D44 §12.1
no-injection rule). Background token = an `AssetRef` to an owned upload, or an allowlisted external URL
gated by `forbidExternalMedia` + `allowedMediaPrefixes`. A raw `url()` string NEVER crosses the token boundary.

**Scope:** Global(owner) + Per-character (D44's two scopes). ST's per-chat lock maps cleanly to D44's
deferred per-chat theme scope — the resolution order `character > global > default` already accepts it.

**Implementation:**

- `ThemeOverride.background` → `@orb/contracts` (contracts pass, alongside rest of D44 token subset)
- `<ThemeScope>` learns the background token → resolves `AssetRef` to `asset://<id>` and emits `--app-bg`
- Shell slot renders the resolved background as a clamped container-model background layer
- No DB table, no domain, no verb for background

---

## 6. Open questions (resolve before build)

1. **Classify path:** chat-role shaper (v1, cheap) vs real `local-light classify` role (v2, offline-capable)?
2. **Sprite-set ownership when a character is shared in a group:** does a member see the host's sprites? (Lean: yes, via the same membership avatar exception D21 blob route already grants.)
3. **Classify cost/latency per turn:** gate behind a per-user/per-character on/off toggle, default OFF. Never classify when the character has no sprite set (ST's own early-out).
4. **Custom (non-GoEmotions) labels:** allow (ST parity), but validate against seed tuple; how strict?
5. **v1 client render slot:** single-character sprite holder only (no group VN multi-sprite layer in v1).

---

## 7. Sequencing

**Pre-Phase-5 (independent, decoupled):**

- `EXPRESSION_LABELS` tuple + `@orb/contracts/expressions`
- `character_sprites` schema + `domain/expressions` leaf (CRUD verbs only — set/list/remove)
- Sprite-management UI (it's just labelled asset uploads on a character)

**Phase-5-gated (can't land before chat):**

- `classify-turn.ts` verb (the per-turn hook, uses the chat turn lifecycle)
- Emitting the `ChatBusEvent { kind:"expression" }` after assistant turn commits

**Phase-6:**

- Client sprite render slot (`#expression-holder` successor)
- Phase-6 client for Background `ThemeOverride` token (tiny — one shell div)

---

## 8. Constitution-fighting things to REJECT

- **VN scene compositor** — permanently de-scoped. Not a separate render layer.
- **group multi-sprite VN mode** — the `#visual-novel-wrapper` multi-sprite layer is deferred v2 at best.
- **`url()` in background token** — D44 rejects raw CSS injection. Always use `AssetRef` or allowlisted URL through `<ThemeScope>`.
- **A separate background domain** — it is a D44 theming token, not a domain.
- **Browser-side classify call** — classify is a server-side shaper against the user's resolved credential.

---

## 9. Cross-refs

- **D44** — theming token-override API; background is already a token in §12.1; `ThemeOverride` + `<ThemeScope>`
- **D45/D47-6** — vision input + standalone caption — future vision-classify lens for expressions; not needed for v1 text-classify
- **D39** — `local-light` in-process ONNX backend (today embed/rerank/imageEmbed) — natural host for v2 `classify` role
- **D47** — both features previously "Out by design"; this is the re-evaluation, now committed
- **D49** — adjudication: expressions/sprites = deferred ARCHITECTURAL in the proposal, but user greenlit full scope
- **D18/D23/D24** — single-owned, derive-don't-stamp, per-type-FK: rules that shape `character_sprites`
- `domains/assets.md` — per-user CAS, `AssetRef`, `reapIfOrphan` pattern
- `domains/character.md` — per-character theme override + sprite-set parent
- `domains/connection.md` — classify request-shaper / `ModelCapability` for structured output gating
- `core/Tier-3b-Providers.md` — `PROVIDER_ROLES`, `local-light` (v2 classify role template)
- `domains/chat.md` — the Phase-5 per-turn hook + `ChatEvent`
- `proposed/expression-stage/expression-stage.md` — the full evidence base (ST source audit, neo findings)
