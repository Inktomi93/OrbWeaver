# Proposed: `expression-stage` — character expressions/sprites + app background

> **STATUS: PROPOSAL, not law.** This is the evidence base for a yes/no, NOT a spec. Nothing here is
> committed until it graduates to a ledger D-entry and a real `docs/architecture/domains/<name>.md`. Do not
> build from this doc. Both features are currently **OUT by design** per **D47** ("Out … expressions/sprites,
> backgrounds/BGM"); this proposal exists to re-evaluate them now that **D44** (theming) and **D45** (vision)
> changed the substrate underneath them.
>
> **Headline finding:** the two features do **NOT** share a home, and they are wildly different in cost.
> - **Background** is already 90%-decided — it is a **token in D44's `ThemeOverride` set** (`client.md`
>   §12.1 literally lists *"background asset/allowlisted-URL"*). It is **not a new domain**; it is a
>   contracts field + a `<ThemeScope>` consumer + a shell slot. **Cheap, theming-flavored — the win Nate
>   wants.**
> - **Expressions** is genuinely **ARCHITECTURAL**: it needs a **classify role that does not exist**, a
>   **per-character sprite-set persistence model**, and a **per-turn Phase-5 chat-lifecycle hook**. Heavier;
>   propose as a real leaf domain (`expressions`), Phase-5-gated.
>
> The folder is named `expression-stage` only because the README paired them; the proposal **splits them**.

---

## Part 1 — BACKGROUND (the cheap one; → D44 theming, NOT a domain)

### 1.1 How SillyTavern actually does it (source-grounded)

Read in full: `SillyTavern/public/scripts/backgrounds.js` (1865 lines). It is **app/chat-chrome theming**, not
a VN scene compositor. The mechanism:

**Two scopes, an enum (`backgrounds.js:BG_SOURCES` = `{GLOBAL:0, CHAT:1}`):**
- **GLOBAL** = a **per-user setting**. The state object is `backgrounds.js:background_settings`
  (`{ name, url, fitting, animation, sortOrder, thumbnailColumns }`). It is loaded from `settings.background`
  in `backgrounds.js:loadBackgroundSettings(settings)` and persisted via `saveSettingsDebounced()` inside
  `backgrounds.js:setBackground(bg, url)`. **This is the whole "global background" feature: one field on the
  user's settings blob.**
- **CHAT (a per-chat lock/override)** = stored in **chat metadata**, not settings:
  `backgrounds.js:BG_METADATA_KEY = 'custom_background'` (the locked URL) and
  `LIST_METADATA_KEY = 'chat_backgrounds'` (the chat's own uploaded list). `onLockBackgroundClick` /
  `onUnlockBackgroundClick` write/delete the lock; `backgrounds.js:onChatChanged` reads it on every chat
  switch and a lock **overrides** the global (`$('#bg1').css('background-image', lockedUrl || background_settings.url)`).

**DOM application — a single CSS layer.** Every code path that "sets the background" does exactly
`$('#bg1').css('background-image', url)` (see `setBackground`, `onChatChanged`, `forceSetBackground`,
`onSelectBackgroundClick`). Fit is a class on the same element: `backgrounds.js:setFittingClass(fitting)`
toggles one of `cover|contain|stretch|center` on `#bg1`. **There is no scene graph, no compositor, no
per-character layering — one `<div id="bg1">` with a `background-image`.** That is the entire render model.

**Storage / files.** System backgrounds are server files under a `backgrounds/` folder, fetched via
`/api/backgrounds/all` (`getBackgrounds`), with `/upload`, `/delete`, `/rename`, `/folders` siblings;
thumbnails are generated (`createThumbnail`, server `image-metadata` for dominant-color placeholders). The
picker is a gallery drawer (`#bg_menu_content`) with folders, lazy-load (`IntersectionObserver`), sort, and
filter — all UI, none of it load-bearing for the model.

**Auto-pick (the "LLM picks a background" variant).** `backgrounds.js:autoBackgroundCommand` (slash command
`/autobg`, registered in `initBackgrounds`): it lists the background titles, sends
`backgrounds.js:autoBgPrompt` (*"Ignore previous instructions and choose a location ONLY from the provided
list … Do not output any other text:\n{0}"*) through `generateQuietPrompt`, then **fuzzy-matches the reply
against the title list with Fuse** and clicks the best match. It is a thin convenience over the existing chat
LLM — no special model, no new role.

**Hooks.** `backgrounds.js:initBackgrounds` wires only `eventSource.on(event_types.CHAT_CHANGED, onChatChanged)`
and `FORCE_SET_BACKGROUND`. No per-turn hook — background changes on chat-switch or explicit pick, never
per-message (that's the auto-pick slash command, user-invoked).

**Net ST model:** a per-user global string + an optional per-chat override string, applied as one CSS
`background-image`, with files in a server folder and an optional user-invoked LLM picker.

### 1.2 Proposed home: a D44 `ThemeOverride` token (already decided), NOT a new domain

**It is already homed.** `client.md` §12.1 enumerates the Tier-A token-override subset as *"accent · bubble
bg/fg · name color · quote color · font from an allowlist · **background asset/allowlisted-URL** · density"*.
The app background is **one of the seven curated `ThemeOverride` tokens** — it was decided in D44, before this
proposal. There is nothing to invent; there is a field to fill in and a shell slot to render it.

This is the right call, argued against the alternatives:
- **A new domain?** No. Per D21 there is **no global tier** and the two ownership categories are single-owned
  / membership-scoped. A background has no rows, no verbs, no lifecycle of its own — it is a *value*. A domain
  would be ceremony for a string. The README's own line agrees: *"background (theming-flavored, NOT the VN
  scene-compositor)"*.
- **A bare settings field?** Close, but D44 already routes appearance through `ThemeOverride` +
  `<ThemeScope>`, with the **Global(owner) + Per-character** scopes and `character > global > default`
  resolution **already built**. A standalone `UserSettings.background` would double the theming home and
  miss the per-character scope for free. So: **the token lives in `ThemeOverride` (contracts), and the
  *carrier* of a `ThemeOverride` is what already carries theming** — owner-global theme (a settings/profile
  field, §12.1 "Global owner CSS … a settings field") and the per-character theme override.
- **An asset ref, not raw CSS — and this is where ST conflicts with our threat model.** ST sets
  `background-image: url(<whatever>)` directly. D44 **rejects exactly that**: `<ThemeScope>` parses+clamps
  token values and **rejects `url()`/`expression()`** (§12.1, the no-injection rule). So the background token
  is **not** a free-form CSS string — it is an `AssetRef` (`{ kind:"asset", id: AssetId }`, the shape already
  in `@orb/contracts/chat`) for an owned upload, or an **allowlisted external URL** gated by the same D44/D21
  `forbidExternalMedia` + `allowedMediaPrefixes` machinery as `MessageMedia`. `<ThemeScope>` (or the shell)
  constructs the actual `url(asset://<id>)` from the validated ref — the raw `url()` never crosses the token
  boundary. **Flag:** any implementer copying ST's `$('#bg1').css('background-image', rawUrl)` violates
  `theme-override-only-via-scope` (§12.6) and the `url()` rejection — follow D44, not ST.

**Proposed `ThemeOverride` shape (the background slice only; the rest of the token set is D44's):**
```ts
// @orb/contracts  (extends the existing ThemeOverride token subset — D44 §12.1)
background?: {
  src: AssetRef | ExternalUrl | null;          // null = inherit/none; AssetRef = owned upload (D21 per-user CAS)
  fit?: "cover" | "contain" | "stretch" | "center";   // ST's setFittingClass set; default "cover"
  // animation/sortOrder/thumbnailColumns are ST gallery-UX, NOT model state — dropped (neo-jank, KISS)
}
```
- **TRUSTED** when it's the owner's own global theme / their own uploaded asset (self-inflicted risk only).
- **UNTRUSTED** when it rides in on an **imported character card's** per-character theme (D21) — then the
  external-URL path is `forbidExternalMedia`-gated and only an `AssetRef` to an asset the importer owns, or an
  allowlisted host, renders.

**Scope today: Global(owner) + Per-character** (D44's two scopes). ST's **per-chat** lock (`custom_background`
in chat_metadata) maps cleanly to D44's **deferred per-chat theme scope** — the resolution order
`character > global > default` was *"built to accept them later without rework"* (§12.1). So per-chat
background is a free future extension, not a v1 requirement.

**Shell slot.** One element under the app root (ST's `#bg1` equivalent) renders the resolved background as a
clamped, container-model background layer — the SHELL tier owns it (features never set it). This is the only
new client surface, and it's tiny.

### 1.3 Born-compliant bits (small; lands in the existing D44 passes)
- `ThemeOverride.background` field → `@orb/contracts` (the **contracts pass**, alongside the rest of the D44
  token subset). The Zod validator clamps `fit` to the enum and accepts only `AssetRef | ExternalUrl | null`
  for `src` (rejecting raw `url()`).
- `<ThemeScope>` learns the background token → resolves `AssetRef` to `asset://<id>` and emits a scoped
  custom prop (`--app-bg`); the shell slot reads it. (**`@orb/ui` pass.**)
- External-URL background obeys the existing `no-external-media-without-gate` + `forbidExternalMedia` gates
  (§12.6) — **no new gate needed**; it reuses D44's.
- Asset bytes ride the **`assets` domain (4c)** + **`infra/image` sharp thumbnails (4b)** that D44 already
  requires. No new persistence.

**There is no DB table, no domain, no verb for background.** It is a token value on existing theming carriers.

---

## Part 2 — EXPRESSIONS / SPRITES (the heavy one; → a new `expressions` leaf)

### 2.1 How SillyTavern actually does it (source-grounded)

Read in full: `SillyTavern/public/scripts/extensions/expressions/index.js` (2719 lines; `manifest.json`
declares an **optional** `classify` module). Three moving parts: a **classifier**, a **sprite-set
convention**, and a **per-message swap hook**.

**The label set.** `index.js:DEFAULT_EXPRESSIONS` — the 28 **GoEmotions** labels (`admiration`, `amusement`,
`anger`, … `surprise`, `neutral`). Fallback is `joy` (`DEFAULT_FALLBACK_EXPRESSION`).

**The classifier — four backends (`index.js:EXPRESSION_API` = `{local:0, extras:1, llm:2, webllm:3, none:99}`),
dispatched in `index.js:getExpressionLabel(text, api, …)`:**
- **`local`** — a server-side BERT GoEmotions pipeline: `POST /api/extra/classify`, returns
  `classification[0].label`. (A small in-process ML model — the natural map to our `local-light` tier.)
- **`extras`** — the same call against the external "Extras" server (`/api/classify`).
- **`llm`** — reuses the chat LLM: `index.js:DEFAULT_LLM_PROMPT` (*"Ignore previous instructions. Classify
  the emotion of the last message. Output just one word … Choose only one of the following labels:
  {{labels}}"*) via `generateRaw` (raw) or `generateQuietPrompt` (full), then `parseLlmResponse` snaps the
  reply to a label. Optionally JSON-schema-constrained when supported.
- **`webllm`** — same prompt, in-browser WebLLM.

So ST's classify is **either a tiny local emotion model OR a structured single-word prompt to the existing
chat model.** No bespoke cloud service.

**The sprite-set convention.** A **folder per character, a file per label.** `index.js:getSpriteFolderName` /
`getFolderNameByMessage` derive the folder from the character's avatar filename (`characters/<char>/`), and
each expression is a file named for its label (`joy.png`, `anger.png`, …). `extension_settings.expressionOverrides`
is a `name → path` remap. Custom (non-GoEmotions) labels are allowed. live2d / talkinghead / VRM are
**separate extensions** that swap the render target — **de-scoped here** (note them, don't build them).

**The swap hook — per-message, polled.** `index.js:moduleWorker` runs on `setInterval(UPDATE_INTERVAL=2000ms)`
(via `ModuleWorkerWrapper`) **plus** on `event_types.CHAT_CHANGED` (`index.js` init ~L2343). Each tick it
reads the last character message, bails if it hasn't changed, else classifies it (`getExpressionLabel`) and
calls `sendExpressionCall → setExpression → index.js:setImage`, which **crossfades** the new sprite into
`#expression-image` (clone-fade-in, fade-out-old). It is **throttled during streaming**
(`STREAMING_UPDATE_INTERVAL=10000ms`; for LLM-api it waits until the stream finishes). Group chats fan out to
`#visual-novel-wrapper` (only when `isVisualNovelMode()` = `power_user.waifuMode && groupId`).

**Render slot.** `#expression-holder` / `#expression-image` (draggable single-character holder), or the
`#visual-novel-wrapper` multi-sprite layer for groups. This is a **client render slot**, not a compositor.

### 2.2 The architectural cost — three things that don't exist yet

**(a) A classify role — DOES NOT EXIST.** The 7 `PROVIDER_ROLES` (`infra/providers/contract/backend.ts`) are
`chat · agent · embed · rerank · imageEmbed · summarize · generateImage`. **There is no `classify`.** Options,
cheapest first:
1. **Reuse the `chat` role with a structured single-label prompt** (ST's `llm` path). Zero new backend
   wiring — it's a request-shaper over `chat`, the exact pattern D47 blessed for **translate** ("a
   request-shaper over the `chat` role, like summarize") and **summarize** itself. **Recommended v1.** The
   label set is closed → constrain with the connection layer's JSON/structured-output capability where the
   model supports it; otherwise snap-to-nearest like ST's `parseLlmResponse`.
2. **Add a `classify` role served by `local-light`** (D39 — the in-process transformers.js/ONNX tier, today
   `embed`/`rerank`/`imageEmbed` only). A GoEmotions ONNX classifier is exactly ST's `local` BERT path and
   gives a GPU-less/key-less user expressions for free. This is a **real new role on the dispatch axis**
   (`PROVIDER_ROLES` + the firewall `ROLE_SOURCE_POLICY` + `@orb/contracts/settings` role subsets +
   `local-light` impl) — the D39 amendment is the template for how to add one. Heavier; propose as the v2
   upgrade, not the v1 gate.
3. **Vision-classify** (classify the *rendered scene* not the text) — uses the vision/caption path D45/D47
   already commit (the embeddings indexer runs a vision call; D47 (6) adds a standalone caption verb). Likely
   overkill for emotion; note as a future lens, don't build.

**Recommendation:** v1 = option 1 (chat-role shaper, no new role); reserve option 2 (`local-light classify`)
as the born-compliant role-add if local/offline expression is wanted. Either way the classify is a
**named role/shaper in `infra/providers`**, never a sideways call from a client extension.

**(b) A per-character sprite-set persistence model — DOES NOT EXIST.** A sprite set is *N labelled images
belonging to a character*. Born-compliant per the constitution:
- **Single-owned** (D18/D23): the set hangs off the character, owner reached by **one FK** (`characterId →
  characters.ownerId`) — so **derive owner, do NOT stamp `ownerId`** (D23).
- **Per-type FK, no polymorphism** (D24): a `character_sprites` row = `(characterId FK, label, assetId FK)`,
  `unique(characterId, label)`. The image bytes are **`assets` (D21 per-user CAS)** — the sprite row is just
  the label↔asset binding. Avatars/cards already prove this exact pattern.
- `label` is an open string (GoEmotions tuple as the seed/validation set, custom labels allowed — mirror
  ST), with the canonical tuple single-homed in `@orb/contracts` (derive-don't-respell).
- This is the genuine "new domain" surface: a small **`expressions` leaf** owning `character_sprites`
  (CRUD verbs: set/list/remove a sprite, `reapIfOrphan` on character delete like `assets`).

**(c) A per-turn Phase-5 chat-lifecycle hook — CANNOT LAND BEFORE CHAT.** ST polls every 2s; we don't poll —
we hook the turn lifecycle. The gap register §2 nails it: *"everything per-message … hooks the Phase-5 chat
turn lifecycle — none can land before chat exists."* The classify-on-assistant-turn step is a **post-turn
chat hook** (after the assistant message commits / stream finishes), emitting the chosen label so the client
swaps the sprite. This is the same per-turn-side-effect shape as image-gen-in-chat (D47 (1)) and is why
expressions is **Phase-5-gated**.

### 2.3 Proposed contract shapes (sketch)
```ts
// @orb/contracts/expressions
EXPRESSION_LABELS = [ "admiration", …, "neutral" ] as const;   // the GoEmotions seed tuple, one home
type ExpressionLabel = (typeof EXPRESSION_LABELS)[number] | (string & {});  // custom allowed (ST parity)

CharacterSpriteView = { characterId: CharacterId; label: string; asset: AssetRef };

// server domain `expressions` (a leaf): setSprite / listSprites / removeSprite (+ reapIfOrphan)
// classify: a chat-role request-shaper in infra/providers (v1) OR a `classify` ProviderRole (v2, local-light)
// per-turn: a Phase-5 chat hook → ChatEvent { kind:"expression", label } → client render slot
```
Client render slot = an `@orb/ui` single-sprite holder (the `#expression-holder` successor); the group
multi-sprite VN layer is **deferred** (it's the VN-compositor edge neo dropped — keep it out of v1).

---

## Part 3 — What neo kept / cut (both)

**Both features were CUT from neo-tavern.** Confirmed by search of `neo-tavern/src` (and `public`): zero
`background`-image feature, zero `expression`/`sprite`/`emotion`-classify code. (The grep "hits" were false
positives — `ln` lazy-net abbreviations and unrelated error-`classify` in the providers layer, e.g.
`providers/_shared/error-classify.ts`.) neo dropped the entire SillyTavern **visual-novel layer**;
expressions and backgrounds went with it. This proposal is a **ground-up re-introduction**, not a port — and
that's the opportunity: do it D44/D21-compliant instead of carrying ST's bypassable CSS posture.

---

## Part 4 — Difficulty, sequencing, open questions

### Background — CHEAP (theming)
- **Difficulty: LOW.** No domain, no table, no verb. One `ThemeOverride` field (contracts), one `<ThemeScope>`
  token (`@orb/ui`), one shell slot. Reuses D44's gates + the assets/infra-image path already in plan.
- **Sequencing:** lands in the **D44 contracts + `@orb/ui` passes** (before Phase 5), exactly like the rest of
  the theming tokens. Auto-pick (`/autobg`) is a trivial Phase-6 client convenience over the existing chat
  model — optional, post-v1.
- **Flag — gap register is STALE for this:** `reports/sillytavern-feature-gap.md` §2 marks Backgrounds
  *"PAINFUL — resurrects the VN scene layer + a new shell slot + per-chat persistence."* That assumed the VN
  scene compositor. **Nate's clarification (app-level background) + D44's existing token make it a CHEAP
  theming win** — recommend the gap register row be corrected.
- **Open questions:** (1) per-chat background scope — defer to D44's deferred per-chat theme scope, or pull it
  forward? (Lean: defer; the resolution order already accepts it.) (2) Is the owner-global background a field
  on the owner theme or on `profile`/`UserSettings`? (Lean: wherever the owner-global `ThemeOverride` already
  lives per §12.1 — don't add a second carrier.) (3) Animated backgrounds (mp4/webp) — out of v1; `infra/image`
  is still-image; revisit only if asked.

### Expressions — HEAVIER (ARCHITECTURAL)
- **Difficulty: MEDIUM-HIGH.** Three new things: a classify capability (a chat-role shaper at minimum, a new
  `classify` role at most), a `character_sprites` persistence leaf, and a per-turn Phase-5 hook + client
  render slot.
- **Sequencing:** **Phase-5-gated** (the per-turn hook can't exist before chat). Pre-Phase-5 you *can*
  land the cheap, decoupled pieces: the `EXPRESSION_LABELS` tuple + `character_sprites` schema/leaf + the
  sprite-management UI (it's just labelled asset uploads on a character). The classify + swap hook wait for
  chat.
- **Honest cost statement:** this is **not** a cheap parity item. It is the one in this folder that earns the
  "ARCHITECTURAL" tag (gap register §2 agrees). Recommend it as a **deliberate yes/no**, not an auto-greenlight
  — and if yes, v1 = chat-role-shaper classify + single-character sprite holder; defer the `classify` role,
  the group VN multi-sprite layer, and live2d/VRM/talkinghead.
- **Open questions:** (1) classify path — chat-role shaper (cheap, v1) vs a real `local-light classify` role
  (offline-capable, v2)? (2) sprite-set ownership when a character is shared in a group (D22 visibility) — does
  a member see the host's sprites? (Lean: yes, via the same membership avatar exception the D21 blob route
  already grants — sprites are the in-room public face.) (3) classify cost/latency per turn — gate behind a
  per-user/per-character on/off toggle (a `UserSettings`/character field), default OFF; never classify when the
  character has no sprite set (ST's own early-out). (4) custom (non-GoEmotions) labels — allow (ST parity) but
  validate the seed tuple; how strict?

---

## Part 5 — Cross-references
- **D44** (`DECISIONS-LEDGER.md`; authoritative `client.md` §12) — theming token-override API; **background is
  already a token here** (§12.1). `ThemeOverride` + `<ThemeScope>` + the resolution order + the gates
  (`theme-override-only-via-scope`, `no-external-media-without-gate`).
- **D21** — no global tier; assets/PNGs/images are **per-user single-owned**; `forbidExternalMedia`. Both a
  background image and a sprite image are **owned assets**, never a global/shared blob; external URLs gated.
- **D45 / D47(6)** — vision input + standalone caption (the vision call already runs in the embeddings
  indexer) — the substrate for a *future* vision-classify lens for expressions; not needed for v1 text-classify.
- **D39** — the `local-light` in-process transformers.js/ONNX backend (today embed/rerank/imageEmbed) — the
  natural host for a v2 `classify` role (ST's local GoEmotions BERT analogue); D39 is the template for adding
  a role to the dispatch axis.
- **D18 / D23 / D24** — single-owned, derive-don't-stamp, per-type-FK-no-polymorphism: the rules that shape
  `character_sprites` (`characterId` FK → owner derived; `assetId` FK to the per-user CAS).
- **D47** — both features are currently *"Out by design"*; this proposal is the re-evaluation note.
- **Related domains:** `settings.md` (additive-namespace `UserSettings`, the owner-global theme carrier),
  `character.md` (the per-character theme override + sprite-set parent), `assets.md` (per-user CAS, `AssetRef`,
  `reapIfOrphan`), `connection.md` (the classify request-shaper / `ModelCapability` for structured output),
  `tiers/providers.md` (`PROVIDER_ROLES`, `local-light`), `chat.md` (the Phase-5 per-turn hook + `ChatEvent`).
- **Gap register:** `reports/sillytavern-feature-gap.md` §2 — recommend correcting the **Backgrounds** row
  from PAINFUL/VN-scene to CHEAP/theming-token per this proposal + Nate's clarification.
