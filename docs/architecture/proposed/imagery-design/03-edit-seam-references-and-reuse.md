# 03 — The edit seam, avatar references (B3), and the reuse gate (B2)

> **Status: COMMITTED (D49 item 1) — prescriptive design.** The hosted image-EDIT capability gate,
> the warning discipline, the two marinara fold-ins, and the `imagery_generations` table — the one
> delta from the committed doc's "no DB table," argued in full (§4.2, README Review flag 1).

---

## 1. The capability gate — `ModelCapability.input.imageEdit`

The axis is defined in doc 01 §5 (`input: { vision, imageEdit? }` — the D45 vision-gate pattern
extended by one sibling flag). The gate fires in TWO places with ONE meaning:

- **Domain gate (policy + fallback):** `generatePicture` step 7 and `editImage` step 2 read
  `capability.input?.imageEdit`. The domain gate exists because the DOMAIN owns the fallback
  decision (drop-and-continue vs throw — the asymmetric posture, doc 01 §3.4); a runner cannot
  know which caller intent it is serving.
- **Runner belt (defense in depth):** if an `edit` payload nonetheless reaches a runner whose
  model can't take it (a stale capability row, a future second caller that skips the domain), the
  runner strips `edit` and emits the providers `ResolvedWarning` — never a hard throw (the
  D41/D45/D48 drop-and-warn family).

Rejected: gate-in-runner-only (the domain couldn't implement B3's graceful fallback or editImage's
throw — it would learn about the drop after the fact); gate-in-domain-only (violates the sealed-
executor discipline that runners never trust upstream filtering — the same reason the firewall
`ROLE_SOURCE_POLICY` is a belt behind settings validation, D39).

## 2. The warning — `image_edit_dropped`

### 2.1 Code + homes

- `infra/providers/contract/resolve.ts` `WARNING_CODES` gains `"image_edit_dropped"` — WITH its
  real emit site (the openrouter image runner, §2.3), honoring the "no code without an emit site"
  law (D48 letter).
- The domain surfaces the same code through `ImageryWarning` on the RESULT (doc 01 §3.3). One code
  string, two tiers; the chat caller maps a result warning onto its `warning` ChatEvent so the
  user sees "generated without the avatar reference (model can't edit)".

### 2.2 Emit sites (both real, both tested — chunk I2/I1)

1. `domain/imagery/verbs/generate-picture.ts` step 7 — capability says no ⇒ push
   `{code:"image_edit_dropped", detail:"<model> lacks image-edit; generated without avatar reference"}`,
   proceed text→image.
2. `infra/providers/backends/openrouter/runners/image/runner.ts` — request carries `edit` but the
   resolved model profile lacks the capability ⇒ strip + `ResolvedWarning`.

### 2.3 Per-backend notes (one-liners — the runner's translation table)

- **gpt-image-1 (via OpenRouter/OpenAI images-edit):** native edit — `image` (+ optional `mask`,
  transparent = editable) + up to multiple input images; `references` join the input-image array;
  sizes = the exact `SIZE_PRESETS` set (doc 02 §6).
- **Gemini image editing ("nano-banana" family):** images ride as inline content parts on the
  generation turn — `edit.image` + `references` all become image parts before the text prompt; no
  mask wire → a `mask` is dropped WITH the same warning code (detail says "mask").
- **OpenRouter chat-completions image models generally:** the runner already builds a chat turn
  with `modalities:["image","text"]`; `edit`/`references` become `image_url` content parts — the
  exact shape the imageEmbed runner's `imageContent()` already produces (archived audit §6.2 cite).
- **negativePrompt:** no mainstream hosted wire has a native field → the runner folds it into the
  prompt text as a trailing `"\nDo not include: <negative>"` line. Universal, testable golden.
- **size:** passed where the wire supports it, silently omitted otherwise — the same "not all
  providers honor it" posture the built contract already gives `n` (no new warning; a size is a
  hint, not intent like an edit source).
- **references cap:** runners clamp to 4 (rpg-design/08 §2's committed consumer cap; more is
  provider-error territory).

## 3. B3 — avatar-reference conditioning (`useAvatarReference`)

The edit seam's first generic consumer (Marinara-Residue B2-row sibling B3; rpg-design/08 §2
adopted the same trick for game art — this is the non-game generic).

Flow inside `generatePicture` (step 7):

1. Applies only to subject modes (`character`, `face`, + their multimodal variants) — a
   `useAvatarReference` on `background`/`scenario`/`free` is ignored with a debug log (no subject
   to stay on-model FOR).
2. `getCard(caller, subjectCharacterId)` → `avatarAssetId`; absent → skip silently (nothing to
   reference — same posture as the caption fallback, doc 02 §3).
3. Capability gate (§1). Fail → `image_edit_dropped` warning, proceed without.
4. `readAsset(caller, avatarAssetId)` → `edit: { image: bytes }` on the request. The avatar is the
   INIT/reference image; the extracted prompt still drives content — the model re-poses/re-dresses
   the same face rather than inventing a new one.

WHY a boolean param and not automatic-when-avatar-exists: reference conditioning anchors
composition hard — a user generating "\{\{char\}\} as a child" or a stylized variant does NOT want the
current avatar steering it; opt-in keeps surprise at zero. Rejected: a per-character setting
(config sprawl for a per-call intent — the caller knows better per invocation; rpg made it a game
config because games have a standing art policy, chat doesn't).

## 4. B2 — the identity-hash reuse gate + `imagery_generations`

### 4.1 The table (DDL intent — rides the `0000_baseline` squash, the D58 precedent)

```sql
CREATE TABLE imagery_generations (
  id                    TEXT PRIMARY KEY,              -- typeid 'imagery_generation'
  asset_id              TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  chat_id               TEXT REFERENCES chats(id) ON DELETE SET NULL,      -- provenance outlives the chat
  mode                  TEXT NOT NULL,                 -- CHECK derives from PROMPT_TEMPLATE_MODES (D34)
  subject_character_id  TEXT REFERENCES characters(id) ON DELETE SET NULL,
  identity_hash         TEXT,                          -- null ⇒ never reuse-matched (scene/free/edit)
  prompt                TEXT NOT NULL,
  negative_prompt       TEXT,
  model                 TEXT NOT NULL,
  cost_usd              REAL,
  edited                INTEGER NOT NULL DEFAULT 0,    -- an edit/reference input was used
  created_at            INTEGER NOT NULL
);
CREATE INDEX imagery_generations_reuse_idx
  ON imagery_generations (subject_character_id, mode, identity_hash);
```

**No `ownerId` column — ownership derives via the owned asset** (`asset_id → assets.ownerId`),
the exact D20 pattern image embeddings use ("the vector row FKs the owned asset … no ownerId on
the row itself"). The reuse SELECT joins through `assets` on `ownerId` — O(the user's generations),
free at this scale. Rejected: stamping `ownerId` (the D20/D23 doubling the whole schema audit
exists to prevent).

`ON DELETE CASCADE` from `assets`: deleting the image (gallery) erases its provenance; the
provenance row is subordinate to the asset, never the reverse. `chat_id SET NULL`: the asset — and
its provenance — outlives a deleted chat (it's the user's image; the chat was just where it was
born).

### 4.2 The delta argued (README Review flag 1)

The committed doc says "no DB table" three times. Two forces flip it:

1. **B2 needs durable identity.** Pick-before-generate means answering "does a suitable image
   already exist?" — which requires knowing, durably, what each stored image IS (mode, subject,
   the card-state it depicted, the prompt). The CAS row deliberately knows none of that (bytes
   metadata only).
2. **GC safety (the load-bearing discovery).** Without ANY FK, a generated asset's only reference
   is JSON inside `message_variants` content blocks — invisible to the assets ref-registry that
   both GC paths iterate (`assets.md` Esoteric §6: "adding a new asset-bearing column without
   updating the registry makes its blobs silently GC-eligible" — a content-block reference isn't
   even a column). The mark-sweep would reap live in-chat images. `imagery_generations.asset_id`
   is a REAL FK column the registry can carry. **Obligation on `assets.md`:** the ref-registry
   gains `imagery_generations.asset_id`, and its schema-introspection coverage test picks it up.

Rejected alternatives:

- **Prompt-in-asset-meta** (a JSON `meta` column on `assets`): pollutes the CAS index with a
  producer's concern (the assets doc's central split — "the row is metadata about the BYTES");
  every future producer would stuff its own shape into one untyped blob; and it still leaves no
  indexed reuse lookup and no registry-visible reference distinct from the asset's own row.
- **Reusing `gallery_items`** (the deferred D49 item-2 v2 table): wrong semantics — curation
  (user-picked, display-ordered) vs provenance (machine-written, one per generation); conflating
  them makes "remove from gallery" delete provenance. Also it's deferred (PD-55) — imagery would
  be building another domain's table early.
- **In-memory / recompute-on-demand:** re-deriving "is there a suitable image" would mean
  re-running extraction to compare prompts — an LLM call to avoid an LLM call.

### 4.3 The identity hash (`substrate/identity-hash.ts`)

```ts
/** sha-256 hex of `${mode}:${characterId}:${card.contentHash}`. */
export function identityHashFor(mode: PromptTemplateMode, card: CharacterCard): string;
```

`characters.contentHash` is the card's semantic-fields hash (distinct from `importHash` — the
whole-file hash; `assets.md` §7.3). Editing the card's appearance-bearing fields changes
`contentHash` → the hash misses → regenerate. Unchanged card → hit → reuse.

**Vocabulary alignment (deliberate, one term):** this is the same **identity-hash reuse**
discipline rpg-design/08 §2 commits for NPC portraits — rpg hashes its own identity tuple
`(name, description, gender, pronouns)` into `rpg_npcs`-adjacent state because NPCs aren't card
characters; imagery hashes the card's `contentHash` because cards already maintain a semantic
hash. Same gate, two producers, each holding its own state — rpg is the game-side cousin, cite
`rpg-design/08 §2`, never merge the stores.

Rejected: hashing the RESOLVED prompt (requires the extraction call first — defeats the saving);
marinara's manifest.json tag catalog where the MODEL picks by tag (it existed to choose among
filesystem backgrounds/music, both dead here; a model-facing pick loop spends a completion to save
a generation, and a deterministic hash needs no model at all). The Feature-Slot-Map's
"asset-manifest pick-before-generate" enhancement idea is hereby REALIZED as this deterministic
gate — the tag-catalog FORM is rejected, the pick-before-generate INTENT ships.

### 4.4 Gate semantics (in `generatePicture` step 2)

- Scope: portrait modes only (`character`/`face`/`*_multimodal`). Scenario/background/free/edit
  are **moment art — never reused** (rpg's illustration rule, same WHY: the scene changed even if
  the card didn't).
- `reuse` param (doc 01 §3.2): default `"prefer"`; `"never"` = the regenerate affordance (the
  client's regenerate button and any user re-ask sends `"never"`). Autonomous callers (automation
  rules, the D48 tool) keep `"prefer"` — autonomous spend is exactly where the saving matters.
- A `prompt` override always bypasses the gate (specific intent beats cached identity).
- Hit path returns `reused: true`, rebuilds blocks from the stored `asset_id`s of the newest
  matching generation (all images of that generation — a 4-image row-set returns 4 blocks),
  `costUsd: null`, zero provider calls.
- Miss path proceeds; the new row stores the hash so the NEXT call hits.

LEAN — reuse freshness: v1 has no max-age; a 6-month-old portrait of an unchanged card is still
that card's portrait. Criterion to flip: user reports of "stale vibes" on unchanged cards →
add a `newerThan` bound to the lookup (one WHERE clause, no schema change).
