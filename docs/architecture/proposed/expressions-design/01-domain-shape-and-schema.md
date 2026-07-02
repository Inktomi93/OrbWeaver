# 01 — Domain Shape, Contracts, Schema, CRUD

> **Status: COMMITTED (D49 item 4) — prescriptive design; the ledger D-entry wins on any conflict.**
> The persistence leaf: what `domain/expressions` owns, every contract shape inline, the
> `character_sprites` DDL, and the CRUD surface. ST evidence: folder-per-character/file-per-label
> sprite convention (`extensions/expressions/index.js` `getSpriteFolderName`) — one-line cite; the
> orbweaver shape replaces files with `assets` CAS rows + a binding table.

---

## 0. What the domain owns (unchanged from the committed doc, restated for cold reads)

- The **`character_sprites`** table — per-character labelled image bindings (CRUD + reap)
- The **classify verb** — the chat-role shaper that picks a label per turn (doc 02)
- The **post-turn hook** — the injected op chat calls after a variant commits (doc 02)
- The **sprite-sheet generation pass** — the `expressions-sprite-sheet` workload body (doc 03)

NOT owned: image bytes (`assets`/`infra/storage`), generation (`domain/imagery`, injected), the
app background (a D44 theme token — committed `domains/expressions.md` §5), any VN compositor
(permanently out).

## 1. The 8-slot layout

```
domain/expressions/
├── index.ts            FRONT DOOR — ExpressionsService + createExpressionsService + runSpriteSheetJob
│                         (the workload-pass export the runner-env consumes — the embeddings/discovery
│                         precedent: the bulk pass lives in its owning feature, workloads.md)
├── service.ts          COMPOSITION ROOT — spreads the verb factories over one context. Zero logic.
├── context.ts          DI BUNDLE — explicit `export interface ExpressionsContext` (never ReturnType<>):
│                         { db, clock,
│                           classifyTurn,        // infra/providers shaper (02 §2)
│                           readTurn,            // domain/chat variant read (02 §3)
│                           emitChatEvent,       // chat-bus emit (02 §4 — the WiBusEvent precedent)
│                           readUserSettings,    // domain/settings (02 §5)
│                           workloadsStart?,     // domain/workloads.start (03 §2)
│                           imagery?,            // { generatePicture } (03 §3)
│                           image?,              // { sliceGrid, matteFlood } infra/image (03 §3)
│                           assets?,             // { store, readBytes } (03 §3)
│                           getCard? }           // domain/character (03 §3)
│                         The sheet-generation ops are OPTIONAL (a deploy without imagery still gets
│                         CRUD + classify; generateSpriteSheet throws ExpressionsNotConfiguredError).
├── contract/
│   ├── service.ts      interface ExpressionsService (§7 — the authoritative verb listing)
│   ├── params.ts       SetSpriteParams · ListSpritesParams · RemoveSpriteParams ·
│   │                     GenerateSpriteSheetParams · ClassifyTurnParams
│   ├── results.ts      SpriteSheetJobResult · ClassifyOutcome
│   ├── views.ts        (thin — CharacterSpriteView is @orb/contracts/expressions, re-exported)
│   ├── errors.ts       SpriteNotFoundError · ExpressionsNotConfiguredError · SheetGenerationError
│   └── ops.ts          the injected-op interfaces (ClassifyTurnOp, ReadTurnOp, EmitChatEventOp,
│                         ImageOps, ImageryOp, AssetOps) — declared here, wired at entry/compose
├── verbs/
│   ├── set-sprite.ts             upsert one (characterId, label) → assetId binding
│   ├── list-sprites.ts           all bindings for a character (management UI + stage prefetch)
│   ├── remove-sprite.ts          delete one binding (asset untouched — GC reclaims if orphaned)
│   ├── reap-if-orphan.ts         character-delete hook: delete rows, return assetIds (§8)
│   ├── generate-sprite-sheet.ts  enqueue the workload; returns { workloadId } (03 §2)
│   ├── run-sprite-sheet-job.ts   the bulk pass the workload runner wraps (03 §3)
│   └── on-turn-completed.ts      the post-turn hook body: early-outs → classify → emit (02 §3)
├── persistence/
│   └── queries.ts      ALL character_sprites SQL: upsertSprite · listByCharacter ·
│                         deleteSprite · deleteAllForCharacter (returning assetIds) ·
│                         countByCharacter (the early-out probe) · batchUpsert (the sheet write)
└── substrate/
    ├── labels.ts       normalizeLabel + label validation (pure; schema re-exported from contracts)
    ├── snap.ts         snapToLabel — the pure classify-reply → label function (02 §2.3)
    └── sheet-prompt.ts compileSheetPrompt + gridFor — pure sheet-prompt/geometry (03 §3.2)
```

WHY `run-sprite-sheet-job` is a verb here and not workload-runner code: workloads.md is explicit —
runners are THIN and "the bulk-pass implementations live in their owning feature," reached through
`ctx.env.<feature>.<op>`. Domain-of-affect: the pass writes `character_sprites` rows. *(Rejected:
orchestrating in the workload runner — it would need imagery/image/assets/character ops injected
into workloads' runner-env for one kind AND would put expressions row-writes outside the domain;
also rejected: an imagery-owned verb — imagery owns no tables by committed design and D58 already
pins "rpg owns no sprite rows … expressions does" — same seam here.)*

## 2. Contracts — `@orb/contracts/expressions` (the wire home)

```ts
import { z } from "zod";

/** The GoEmotions 28 — the SEED set (UI suggestions + sheet-generation defaults), never a whitelist. */
export const EXPRESSION_LABELS = [
  "admiration", "amusement", "anger", "annoyance", "approval", "caring",
  "confusion", "curiosity", "desire", "disappointment", "disapproval", "disgust",
  "embarrassment", "excitement", "fear", "gratitude", "grief", "joy",
  "love", "nervousness", "optimism", "pride", "realization", "relief",
  "remorse", "sadness", "surprise", "neutral",
] as const;
export type ExpressionLabel = (typeof EXPRESSION_LABELS)[number] | (string & {}); // custom allowed (ST parity)

/** Custom labels: normalized then validated. §5 for the rules + WHY. */
export const expressionLabelSchema = z
  .string()
  .transform((s) => s.trim().normalize("NFKC").toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9_-]{1,32}$/));

export const setSpriteSchema = z.object({
  characterId: typeIdSchema(ID_PREFIX.character),
  label: expressionLabelSchema,
  assetId: typeIdSchema(ID_PREFIX.asset),
});
export const listSpritesSchema = z.object({ characterId: typeIdSchema(ID_PREFIX.character) });
export const removeSpriteSchema = z.object({
  characterId: typeIdSchema(ID_PREFIX.character),
  label: expressionLabelSchema,
});

export const generateSpriteSheetSchema = z.object({
  characterId: typeIdSchema(ID_PREFIX.character),
  labels: z.array(expressionLabelSchema).min(1).max(8), // MAX 8 per sheet — marinara MAX_INDIVIDUAL_SPRITE_EXPRESSIONS=8 (sprites.routes.ts)
  stylePrompt: z.string().max(600).optional(),          // appended art-direction; capped (prompt-budget discipline)
  matte: z.enum(["flood", "none"]).default("flood"),    // 03 §4
});

export type CharacterSpriteView = {
  characterId: CharacterId;
  label: string;
  asset: AssetRef; // {kind:"asset", id: AssetId} — the client builds blobUrl from it (assets.md)
};
```

Consumed by: the tRPC router (wire validation), the client (management UI + stage), the domain
(re-parse defense-in-depth, the workloads-start pattern). Home is `contracts` per the §7.4 rule —
server AND client need these shapes.

## 3. The `"sprite"` AssetKind — a NEW member (decision)

```ts
// @orb/contracts/assets — ASSET_KINDS grows by one (illustrative append; the CONSOLIDATED
// member roster across all design sets lives in proposed/gallery-design.md §0):
export const ASSET_KINDS = [..., "sprite"] as const;
```

**WHY a new kind instead of reusing `"avatar"` or `"generated"`:** (a) the D21 blob-route
membership exception is scoped by MEANING — "avatar" grants members the roster public face; sprites
need their own grant (§6) and overloading `"avatar"` would silently widen the existing exception;
(b) `"generated"` is imagery's in-chat illustration kind — GC posture differs (an illustration is
referenced from a message block; a sprite from `character_sprites`) and gallery/list filtering
wants the distinction; (c) the sheet workload stores N cells and needs an honest kind for
`rebuildFromTree`/fsck reporting. *(Rejected: reuse — saves one tuple member, costs two conflated
security/GC semantics.)*

**Born-compliant note:** `ASSET_KINDS` derives the `assets.kind` DB CHECK (assets.md invariant 8 —
one canonical declaration). Adding `"sprite"` is a contracts-pass tuple edit that regenerates the
CHECK into the `0000_baseline` squash (pre-launch, the D58 rpg-tables precedent); post-launch it
would be an additive CHECK-widening migration. Land it in E1 (05 §1) so the table is born with it.

## 4. DDL — `@orb/db/schema/expressions.ts`

```ts
export const characterSprites = sqliteTable(
  "character_sprites",
  {
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    label: text("label").notNull(), // normalized (§5) before write — persistence re-asserts via zod parse
    assetId: text("asset_id")
      .$type<AssetId>()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(), // injected clock (test-determinism law)
    // NO ownerId — D23: owner derives via characters.ownerId (one FK to an owned entity)
  },
  (t) => [primaryKey({ columns: [t.characterId, t.label] })],
);
```

Additive expansion over the committed sketch: `createdAt` (management-UI sort + sheet-job
forensics; stamped from the injected clock, never `Date.now()`). Everything else is the committed
shape verbatim: composite PK = the upsert key; both FKs CASCADE (character delete wipes bindings;
an asset hard-delete cannot strand a dangling binding). Rides the `0000_baseline` squash.

**The GC seam (load-bearing — assets.md esoteric #6):** `character_sprites.assetId` is a NEW
asset-bearing FK column. It MUST be added to the assets **avatar-ref registry**
(`domain/assets/persistence/avatar-refs.ts`) or `collectGarbage`'s mark-sweep treats every sprite
blob as unreferenced and silently sweeps it. The registry's schema-introspection coverage test is
the enforcer — extend its predicate from "columns named `avatarAssetId`" to "columns whose type
brand is `AssetId` and FK target is `assets.id`" so THIS class of miss can never recur (the test
change ships in E2, 05 §2). This is the doc's one cross-domain schema obligation.

## 5. Custom-label validation (Q4 — decision)

**Normalize then validate:** `trim → NFKC → lowercase`, then `^[a-z0-9_-]{1,32}$`. The GoEmotions
tuple is the SEED — pre-populated suggestions in the management UI and the sheet-generation default
subset — never a server-side whitelist (ST parity: custom labels are first-class).

**WHY this strictness:** the label is (a) a composite-PK component (case/width variants of "Joy"
must collide, not coexist), (b) interpolated into the classify prompt's closed list (control
characters/whitespace would corrupt the instruction), and (c) a client CSS-safe render token. NFKC
kills width/compat spoofing; the charset ban on spaces keeps snap-to-label word-boundary matching
(02 §2.3) unambiguous. *(Rejected: free-form strings — PK dupes under case variance + prompt
injection surface via the closed-list interpolation; also rejected: whitelist-to-seed — kills the
ST custom-label parity the committed doc requires.)*

## 6. Group-chat sprite visibility (Q2 — decision)

**Members of a chat may fetch the sprites of a roster character, exactly like the avatar.** The
D21 blob-route membership exception extends from "the avatar" to "the avatar + the sprite set of a
character in a chat the caller belongs to". Enforcement is at the blob route's exception predicate:
member ∧ (asset is referenced by `characters.avatarAssetId` OR by a `character_sprites` row) for a
roster character of a shared chat.

**WHY:** the sprite IS the in-room public face — the stage renders on every member's client per bus
event; owner-only sprites means every non-host member gets a broken stage in exactly the group
scenario the feature is showiest in. The committed doc's own §6 Q2 lean says this. *(Rejected:
owner-only — feature-breaking for members; rejected: copy sprites per member — violates single-owned
assets + storage blow-up.)* **Review flag (README #1):** D21's "ONE narrow exception" wording needs
a one-line ledger amendment; the security posture is unchanged (still never the card, never
arbitrary blobs — an enumerated public-face set).

## 7. The service interface (contract/service.ts)

```ts
export interface ExpressionsService {
  // CRUD (pre-Phase-5 — E2)
  setSprite(caller: Principal, p: SetSpriteParams): Promise<CharacterSpriteView>;   // owner-only (fetchOwned on the character)
  listSprites(caller: Principal, p: ListSpritesParams): Promise<readonly CharacterSpriteView[]>; // owner OR chat-member (§6)
  removeSprite(caller: Principal, p: RemoveSpriteParams): Promise<void>;            // owner-only; SpriteNotFoundError if absent
  reapIfOrphan(characterId: CharacterId): Promise<readonly AssetId[]>;              // internal — character.remove hook (§8)

  // Generation (Phase-7 — E4; throws ExpressionsNotConfiguredError when ops unwired)
  generateSpriteSheet(caller: Principal, p: GenerateSpriteSheetParams): Promise<{ workloadId: WorkloadId }>;
  runSpriteSheetJob(p: GenerateSpriteSheetParams & { ownerId: UserId },
    report: (p: WorkloadProgress) => void, signal: AbortSignal): Promise<SpriteSheetJobResult>; // runner-env only

  // The turn hook (Phase-5 — E3; chat calls this through the injected op, never this interface directly)
  onTurnCompleted(chatId: ChatId, messageId: MessageId, variantId: VariantId): Promise<void>;
}
```

`setSprite` upserts (the composite PK is the conflict target) — "replace the joy sprite" is the
same call as "add the joy sprite". `removeSprite` deletes the binding only; the asset row/bytes are
untouched (the user may rebind it; an unreferenced sprite blob is reclaimed by the next
`assets:gc` mark-sweep once the registry entry from §4 makes reference-tracking correct).

## 8. `reapIfOrphan` — the character-delete hook (semantics pinned)

Called by `character.remove` (injected, the exact `assets.reapIfOrphan` wiring precedent in
assets.md) BEFORE the character row delete: explicitly `DELETE FROM character_sprites WHERE
character_id = ?` **returning the assetIds**, which character.remove folds into the id set it hands
`assets.reapIfOrphan`. Explicit-delete-then-return rather than trusting the FK cascade's timing —
the caller needs the assetIds and the cascade doesn't surface them. Idempotent (a second call
returns `[]`). Optional dep at the composition root: tests/scripts that omit it still cascade
correctly; the blobs are reclaimed by the next mark-sweep instead of the targeted reap.

## 9. Test plan (this doc's slice — full plan in 05)

- **DDL/FK:** character delete cascades bindings; asset delete cascades the binding (never a
  dangling row); composite-PK upsert replaces, never duplicates; `ownerId` absent (D23 pin).
- **Registry coverage:** the assets schema-introspection test fails if `character_sprites.assetId`
  is missing from the avatar-ref registry (the silent-GC gap, closed).
- **Label normalization goldens:** `" Joy "` → `joy`; NFKC width-variant collides with ASCII;
  `"my label"` (space) rejected; 33 chars rejected.
- **Visibility:** non-owner non-member sprite fetch → 404; chat member fetch of roster character's
  sprite → 200; member fetch of a NON-roster character's sprite → 404 (the exception is scoped).
- **reapIfOrphan:** returns the exact assetId set; second call `[]`.
