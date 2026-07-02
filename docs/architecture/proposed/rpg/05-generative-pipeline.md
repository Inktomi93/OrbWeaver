# 05 — The RPG Generative Pipeline (RPG-owned imagery)

> This is the layer the first pass under-covered. The generic `domain/imagery` /`domain/expressions`
> /`domain/gallery` docs own the *primitives* (raw `generateImage`, sprite storage, gallery). But
> marinara has a **thick RPG-specific orchestration layer on top** that composes prompts from game
> state and post-processes the output. That orchestration is RPG-owned logic and needs a home in the
> port — it does **not** belong in generic imagery.

---

## The stack (who owns what)

```
   domain/rpg (this)        game-asset-generation.ts (1012 LOC, 20 exports)   ← RPG orchestration
                            sprite.service.ts / asset-manifest.service.ts     ← game asset selection
        │ builds prompts from GameState / GameNpc / scene context, sizes, post-processes
        ▼
   domain/imagery (generic) ../image/generateImage, image-prompt-compiler, image-generation-settings
        │ raw provider call (SD / OpenAI / etc.)
        ▼
   provider
```

The RPG layer calls **down** into `../image/generateImage` (5 call-sites) — it never re-implements the
provider call. What it *adds* is the game-aware prompt construction, sizing, background removal, and
gallery/manifest integration.

---

## `game-asset-generation.ts` — three generators, verified

Exports 20 symbols across three generator families plus helpers:

### 1. NPC portraits
- `NpcPortraitRequest`, `buildNpcPortraitProviderPrompt`, `buildNpcPortraitImagePrompt`,
  `generateNpcPortrait(req) → string|null`.
- Composes a portrait prompt from the `GameNpc` (name/description/appearance) + the game's
  `artStylePrompt`; default size `DEFAULT_GAME_PORTRAIT_SIZE`.

### 2. Backgrounds (scene locations)
- `BackgroundGenRequest`, `ChatBackgroundGenRequest`, `buildBackgroundProviderPrompt`,
  `buildBackgroundImagePrompt`, `generateBackground(req)`, `generateChatBackground(req)`.
- Default size `DEFAULT_GAME_BACKGROUND_SIZE`; output resized via **`sharp`** (`fit:"cover",
  position:"centre"`) when available, format preserved otherwise. `sharp` is **lazy-loaded and
  optional** (server boots without it on platforms lacking native prebuilds — Android/Termux).

### 3. Scene illustrations (in-scene "moment" art)
- `SceneIllustrationGenRequest`, `buildSceneIllustrationProviderPrompt`,
  `buildSceneIllustrationImagePrompt`, `generateSceneIllustration(req)`.
- Composes from scene context + character appearance + optional avatar references
  (`gameImageUseAvatarReferences`, `gameImageIncludeCharacterAppearance` — the metadata image-config
  keys from [`01`](01-state-model.md)).

### Helpers
`readAvatarBase64`, `safeGeneratedAssetSlug`, `GENERATED_GAME_BACKGROUND_EXTS`, `CompiledGameImagePrompt`.

**Where it's driven from:** the `/scene-wrap` and `/generate-assets(/preview)` endpoints ([`02`](02-endpoint-flows.md)
Group 7). `/scene-wrap` decides *whether* a scene changed enough to warrant art, then fires these
generators inline and pushes results to the client + gallery out-of-band — the exact
out-of-band-image-in-the-UI pattern Orbweaver replaces with an in-chat `generateImage` tool + a
`MessageMedia` block (D47).

---

## `sprite.service.ts` + the sprite-sheet generator (`sprites.routes.ts`)

Two distinct things, both game-relevant:

- **`sprite.service.ts`** (189 LOC) — *selection/listing*, not generation:
  `listCharacterSprites`, `listPartySprites`, `readPreferredFullBodySpriteBase64`,
  `buildSpriteExpressionChoices`, `CharacterSpriteInfo`, `FullBodySpriteReference`. Feeds sprite
  references into party-turn + scene-illustration prompts.
- **`sprites.routes.ts`** (1,999 LOC, separate mega-route) — *generation*: `/generate-sheet` +
  `/generate-sheet/preview` compile an expression-sheet prompt (`compileSpritePrompt`), call
  `generateImage`, then use `sharp` to composite/slice/resize into a unified sheet and
  `tryRemoveBackgroundWithBackgroundRemover` to strip cell backgrounds. This is the God-route the
  committed [`domains/expressions.md`](../../domains/expressions.md) already claims — but note the
  **prompt-compilation-from-game-state part** overlaps RPG concerns; coordinate the seam.

---

## `asset-manifest.service.ts` — the pickable-asset index

- `GAME_ASSETS_DIR = <DATA_DIR>/game-assets`; `ensureAssetDirs`, `buildAssetManifest`,
  `getAssetManifest`, `buildAssetTagList`, `AssetEntry`, `AssetManifest`.
- Scans the game-assets directory into a manifest of background/music/ambient **tags** that the scene
  model chooses from (the model picks an existing asset by tag before anything is generated). This is
  how "use an existing background" vs "generate a new one" is decided.

`npc-avatar-utils.ts` — avatar URL sanitize + the built-in Mari fallback avatar
(`BUILT_IN_MARI_AVATAR`), `sanitizeGameNpcAvatarUrls`, `isInvalidBuiltInMariNpcAvatar`.

---

## Port implications

1. **`game-asset-generation.ts` is RPG-owned orchestration** — it must live in `domain/rpg` (or a
   sealed `rpg/imagery` subsystem), consuming an injected `imagery.generateImage` op. Do not fold its
   game-state-aware prompt building into generic `domain/imagery`.
2. **The manifest/tag "pick before generate" logic** is a nice cost-saver worth keeping — it's how the
   system avoids regenerating art it already has.
3. **`sharp` post-processing is optional-by-design** — preserve the lazy-load-or-skip pattern; don't
   make image resize a hard dependency.
4. **The `/scene-wrap` "did the scene change enough?" gate** is the decision that, in Orbweaver,
   becomes "the model calls `generateImage` when it wants art" — the trigger moves from a server-side
   heuristic to a model tool decision.
5. **Coordinate the sprite seam** with `domains/expressions.md`: expression-sheet *generation* is
   expressions-owned, but *prompt composition from character/game appearance* is shared — decide the
   boundary explicitly.
