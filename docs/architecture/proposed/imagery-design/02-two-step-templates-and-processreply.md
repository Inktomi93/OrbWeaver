# 02 — The two-step: verb specs, templates, processReply

> **Status: COMMITTED (D49 item 1) — prescriptive design.** The exact orchestration order of every
> verb, the real template text (not placeholders), and the `processReply` pure-function contract.
> ST evidence one-line cites reference the archived `image-studio.md` audit (git `1d18f17`).

---

## 1. `generatePicture` — the orchestrator (exact order)

Every step names its failure. Steps 2–5 are skipped where noted; the ORDER itself is the contract —
a reimplementation that reorders (e.g. resolves the role before the reuse gate) silently re-bills
reused portraits or gates on a stale capability.

1. **Assert param invariants** (doc 01 §3.2) — programmer-error throws (the wire already zod-parsed).
2. **Reuse gate** (B2 — doc 03 §4.4). Only when `mode` is a portrait mode (`character`, `face`,
   `character_multimodal`, `face_multimodal`) AND `reuse !== "never"` AND `prompt` is absent:
   compute `identityHash` (doc 03 §4.3) via `getCard`, look up the newest matching
   `imagery_generations` row, and on a hit **return immediately** — `reused: true`,
   `costUsd: null`, blocks rebuilt from the stored rows, NO provider calls. A prompt override
   always bypasses (the user asked for something specific).
3. **Resolve the prompt** (`promptSource` discriminator):
   - `prompt` present or `mode === "free"` → `source: "user"`, the text used verbatim (no
     processReply — the user's literal words are not keyword soup to normalize; ST does the same).
   - multimodal modes → **captionAvatar** (§3) → `source: "captioned"`.
   - otherwise → **extractPrompt** (§2) → `source: "extracted"`.
   Empty/whitespace result after normalization → `PromptExtractionFailedError`.
4. **Compose the final prompt**: the mode's REQUIRED-PREFIX (already emitted by the template's
   "Begin with" instruction and re-asserted by `ensurePrefix` — a template-drift belt: if the LLM
   dropped the prefix, prepend it) + the resolved keywords. No per-character prompt-prefix store in
   v1 — LEAN: deferred; the card-appearance extraction already covers identity. Criterion to add: a
   real "stable style per character" ask → a `characters.imagePromptPrefix` column (character
   domain's home, flag there — not an imagery table).
5. **Compose negative + size**: `negative = [DEFAULT_NEGATIVE[mode-family], params.negative]`
   joined (§6); `size = SIZE_PRESETS[params.size ?? defaultSizeFor(mode)]` (§6).
6. **Resolve role + capability** — `resolveGenerateImage(caller)`; failure →
   `ImageryNotConfiguredError` (no `generateImage` role configured — the settings panel's deep-link
   error, D39 role).
7. **Avatar-reference gate** (B3 — doc 03 §3). If `useAvatarReference`: capability check →
   `edit` payload or drop-with-warning. Never on `background`/`scenario`/`free` (no subject).
8. **Generate** — ONE `generateImage(req)` call with `n` (the provider fans out; imagery never
   loops per-image — a loop would n-plicate cost accounting and rate pressure). Zero decodable
   images → `GenerationFailedError` (carrying the provider failure detail).
9. **Materialize bytes** — per returned image: `base64` → decode; `url` → fetch (provider-origin,
   §doc 04 §7 SSRF note) ; sniff mime from bytes (`assets` re-verifies at store with
   `enforceMagic` — two belts, one owner).
10. **Store + provenance, per image**: `storeAsset(caller, bytes, "generated", mime)` →
    `persistence.insertGeneration({assetId, chatId, mode, subjectCharacterId, identityHash,
    prompt, negativePrompt, model, costUsd, edited})` (doc 03 §4.1). Store-then-row order: a crash
    between leaves an unreferenced CAS blob (the assets GC's benign-orphan posture), never a
    provenance row pointing at nothing.
11. **Build blocks** — one D44 media block per image:
    `{kind:"media", media:"image", src:{kind:"asset", assetId}, alt: <prompt, truncated 300 chars>}`.
12. **Record economics** — `recordStats` with the summed delta (§8) — and return `GeneratedPicture`
    (`images[n]`, prompt, promptSource, mode, model, costUsd, reused:false, warnings).

**What it never does:** post a message (the caller's job — doc 04 §2), read chat history directly
(the shaper op owns that), emit bus events (the chat persist emits `messageCreated` naturally).

## 2. `extractPrompt` — the quiet call (step 1 standalone)

1. Look up `PROMPT_TEMPLATES[mode]` (multimodal modes are NOT extraction modes — they route to §3;
   `contract` forbids `free` at the type level, doc 01 §3.2).
2. `extractQuiet({caller, chatId, instruction: template, subjectCharacterId})` — chat's shaper:
   assembles its own bounded history window + resolves `{{char}}`/`{{user}}` macros against its
   MacroContext, calls the **summarize role** client, returns text + cost. Never persisted, never
   streamed, attributed to `caller` as `triggeredBy` (doc 04 §6 Q1/Q2 — the decisions).
3. `processReply(text)` (§7). Empty → `PromptExtractionFailedError`.
4. Return `{prompt, mode, source:"extracted", costUsd}`.

WHY imagery passes the template UNRESOLVED and chat resolves macros: one `MacroContext` home
(chat's — the engine is `kit/macro`, the data is chat's context; AGENTS-1 engine-vs-data). Rejected:
imagery building its own MacroContext from `getCard` (duplicates chat's context assembly — the
exact "second home" drift the partitioning rule exists to kill).

## 3. `captionAvatar` — the multimodal step (internal verb)

1. `getCard(caller, subjectCharacterId)` → `avatarAssetId`; absent → fall back to text extraction
   (§2) with a debug log — a character without an avatar can still be described from its card.
   WHY fallback not error: multimodal is a QUALITY upgrade to the same intent; failing the whole
   generation because an avatar is missing punishes the user for a cosmetic gap.
2. `readAsset(caller, avatarAssetId)` → bytes.
3. `captionImage({caller, bytes, mime, instruction: CAPTION_INSTRUCTIONS[mode]})` (§5.2) — the ONE
   vision op (D45/D47-6). Reuse, never a 2nd captioner (§9 reject).
4. `processReply` → `{prompt, mode, source:"captioned", costUsd}`.

## 4. `editImage` — explicit edit (the seam's owner-facing verb)

1. Resolve source bytes: `assetId` arm → `readAsset` (owner gate inside the op); `bytes` arm →
   use directly (an upload the transport already size-capped).
2. `resolveGenerateImage(caller)`; **capability gate**: `capability.input?.imageEdit !== true` →
   throw `ImageEditUnsupportedError` (the asymmetric posture, doc 01 §3.4).
3. Build `ImageGenerateRequest`: `prompt = instruction` (verbatim — an edit instruction is not
   keyword soup; no template, no extraction), `edit: {image: bytes, mask?}`, `n`, `size` if given
   (default: omit — let the backend preserve the source dimensions; forcing a preset onto an edit
   crops/distorts the subject).
4. Generate → materialize → store + provenance (`edited: true`, `mode` recorded as `"free"`,
   `identityHash: null` — edits are never reuse-gated: doc 03 §4.4) → blocks → stats → return.

## 5. The templates (`substrate/templates.ts`) — real text, not placeholders

`Record<PromptTemplateMode, string>` for the four extraction modes (exhaustiveness via a mapped
type over `Exclude<PromptTemplateMode, "free" | multimodal>` — a new extraction mode fails `tsc`).
Macro slots resolve in chat's shaper (§2). Modernized from ST's `promptTemplates`
(`index.js:174` — one-line cite; intent kept, "Ignore previous instructions" jailbreak-style
preamble REPLACED by an explicit task frame: we control the system prompt, ST didn't).

```ts
export const PROMPT_TEMPLATES = {
  character:
    "Pause the roleplay. Describe {{char}}'s complete physical appearance in the current moment " +
    "as a single comma-delimited list of concrete visual keywords for an image-generation model: " +
    "body type, hair, eyes, skin, facial features, clothing and its state, accessories, pose, " +
    "expression. Only visual terms — no names, no story, no prose sentences, no quotation marks. " +
    "Begin your reply with: full body portrait,",
  face:
    "Pause the roleplay. Describe {{char}}'s face in the current moment as a single " +
    "comma-delimited list of concrete visual keywords for an image-generation model: facial " +
    "features, expression, eye color and shape, hair framing the face, skin, any marks or " +
    "accessories on the head. Only visual terms — no names, no prose, no quotation marks. " +
    "Begin your reply with: close up facial portrait,",
  scenario:
    "Pause the roleplay. Summarize the current scene of the story as a single comma-delimited " +
    "list of concrete visual keywords for an image-generation model: the characters present and " +
    "their visible actions, the setting, time of day, mood, lighting, notable objects. Only " +
    "visual terms — no names beyond simple descriptors, no prose, no quotation marks. " +
    "Begin your reply with: scene,",
  background:
    "Pause the roleplay. Describe the current location of the story as a single comma-delimited " +
    "list of concrete visual keywords for an image-generation model: the place, architecture or " +
    "natural features, time of day, weather, lighting, atmosphere. Describe ONLY the environment " +
    "— no people, no characters, no figures. Begin your reply with: background,",
} as const;
```

### 5.2 Caption instructions (the multimodal variants)

```ts
export const CAPTION_INSTRUCTIONS = {
  character_multimodal:
    "Describe the person in this image as a single comma-delimited list of concrete visual " +
    "keywords for an image-generation model: body type, hair, eyes, skin, clothing, accessories, " +
    "pose. Only visual terms, no prose. Begin with: full body portrait,",
  face_multimodal:
    "Describe the face of the person in this image as a single comma-delimited list of concrete " +
    "visual keywords for an image-generation model: facial features, expression, eyes, hair, " +
    "skin, head accessories. Only visual terms, no prose. Begin with: close up facial portrait,",
} as const;
```

The "Begin your reply with" prefixes are load-bearing: `ensurePrefix` (§1 step 4) re-asserts them,
and the FACE→portrait / BACKGROUND→landscape size defaults (§6) assume the composition they set.

## 6. Size + negative defaults (`substrate/size.ts`, `templates.ts`)

```ts
export const SIZE_PRESETS = {
  square:    { width: 1024, height: 1024 },
  portrait:  { width: 1024, height: 1536 },
  landscape: { width: 1536, height: 1024 },
} as const satisfies Record<SizePreset, { width: number; height: number }>;

export function defaultSizeFor(mode: PromptTemplateMode): SizePreset {
  // face/character → portrait; background/scenario → landscape; free → square
}
```

WHY these exact dimensions: they are gpt-image-1's published size set — the most constrained
mainstream hosted editor gets exact passthrough; every other hosted model snaps arbitrary
dimensions to its own buckets anyway, so optimizing for the strictest wire wins. Rejected: SDXL
bucket dims (832×1216 etc. — a local-SD idiom; D39 killed the stack they serve); free WxH knobs on
the wire schema (already rejected by the committed §6.1 — semantic presets only).

```ts
/** One shared default (marinara's verified negative lists, deduped to the generic core —
 *  rpg-design/08 §2 carries the game-tuned variants verbatim; cite, don't fork). */
export const DEFAULT_NEGATIVE =
  "text, letters, captions, subtitles, UI, watermark, logo, signature, speech bubble, " +
  "split screen, panel, collage, grid, duplicated face, extra head, extra person, " +
  "bad anatomy, low quality";
```

User `negative` APPENDS to the default (comma-joined), never replaces — WHY: the default is
defect-suppression every generation wants; replacement would silently re-admit watermarks the
moment a user adds one term. Rejected: replace-semantics with an `appendDefault` flag (a knob
nobody asked for).

## 7. `processReply` — the pure-function contract (`substrate/process-reply.ts`)

```ts
export function processReply(raw: string): string;
```

Deterministic, zero-I/O, exact step order (each numbered step is a golden-test row — chunk I1):

1. Trim; strip ONE pair of wrapping quotes (`"…"`, `'…'`, `“…”`) if the whole string is wrapped.
2. Replace every newline run with `", "` (the LLM listed on lines → a comma list).
3. Unicode NFD-normalize, then strip combining marks (é → e — hosted image models tokenize ASCII
   keywords more reliably; ST does the same, `index.js:3018`).
4. Whitelist-filter characters to `a-z A-Z 0-9 space , . ' -`. Everything else (markdown bullets,
   parens, braces, colons) is dropped. NOTE the deliberate narrowing vs ST: ST preserves SD
   attention syntax `(){}[]|::` — that syntax is an SD-webui idiom with no hosted meaning (D39);
   carrying it would leak literal parens into DALL-E/Gemini prompts. REJECTED: an `allowSyntax`
   flag (dead branch on a hosted-only stack).
5. Collapse comma debris: `,\s*,+` → `,`; collapse whitespace runs; trim leading/trailing
   commas/spaces.
6. Length-cap at 2000 chars, cut at the last full comma-separated term before the cap (never
   mid-word — a truncated keyword is noise). (Marinara caps 1400/2200 per kind — one generic cap
   here; rpg keeps its own.)
7. Return; the CALLER decides if empty is an error (`PromptExtractionFailedError` in §1/§2).

Case is PRESERVED (proper nouns like "Victorian" carry signal; ST preserves it too).

## 8. Cost + provenance capture (the money trail)

- `costUsd` on `GeneratedPicture` = extraction/caption `costUsd` + generation
  `usage.costUsd` — null-propagating sum (any unknown component → the SUM stays null + the known
  parts still land in stats individually; a fabricated partial total is worse than an honest null).
- `recordStats` files one turn-economics delta attributed to `caller` as `triggeredBy` (D19):
  the quiet extraction is REAL spend on a REAL principal even though no message exists (doc 04 §6
  Q1). Automation-initiated calls additionally ride the D46 per-rule budget at the automation
  layer — imagery meters nothing itself (one budget home).
- The `imagery_generations` row (doc 03 §4.1) is the durable per-image provenance: prompt,
  negative, mode, model, cost, subject, identityHash. It is what "regenerate" reads (re-run with
  the stored prompt), what the gallery shows as provenance, and what the reuse gate scans.
