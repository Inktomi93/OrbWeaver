---
kind: spec
status: active
updated: 2026-07-03
---

# 04 — Integration seams: /imagine, chat wiring, workloads, consumers

> **Status: COMMITTED (D49 item 1) — prescriptive design.** Who calls imagery, through what, with
> which names — and the resolution of every `domains/imagery.md` (gutted — the code is the doc; git history) §8 open question. The names in §1
> are DICTATED vocabulary shared with the concurrently-hardened automation design
> (`proposed/automation-design/`) — do not drift.

---

## 1. The `/imagine` handoff — the `generate_image` action arm (D46 Tier-1)

**Dictated names (shared vocabulary, both design sets):** the automation Tier-1 action-union arm
is **`generate_image`**; it dispatches the injected op **`imagery.generatePicture`**. `/imagine`
IS this arm invoked from the client command surface — one path, no bespoke command engine (the
committed §9 reject).

- **Arg schema:** `generateImageActionArgsSchema` — defined in `@orb/contracts/imagery` (doc 01
  §6) and IMPORTED by `@orb/contracts/automation`'s action union, never re-spelled
  (`no-inline-union-redecl`). WHY contracts/imagery owns it: the args are imagery vocabulary
  (modes, size presets, reuse policy); automation owns the union membership + dispatch, not the
  arm's inner shape (the same split as workloads' `ParamsByKind` — the kind owner writes the
  params schema).
- **Arg → param mapping (the arm's executor, in `domain/automation`):**
  `{mode, prompt, negative, n, size, subjectCharacterId, useAvatarReference, reuse}` map 1:1 onto
  `GeneratePictureParams`; `caller` = the rule's authoring principal (v1: owner/host — the D46
  authority model); `chatId` = the triggering chat. `quiet` is consumed by the ARM (post or
  return — §2.3), never forwarded (imagery has no posting concept).
- **/imagine text parse (client, Phase 6):** `/imagine <trigger-or-free-text>` — first token
  matched against `MODE_TRIGGERS` (doc 01 §6: `you`→character, `face`→face, `scene`→scenario,
  `background`→background); no match ⇒ `mode:"free"`, the whole text as `prompt`. ST's
  `me`/`last`/`raw_last` triggers are DROPPED — they keyed USER/NOW/RAW_LAST modes the committed
  7-tuple deliberately excludes (persona-portrait and raw-message modes; foldable later as new
  tuple members, which fail `tsc` into the templates Record by design).
- **Budget/consent:** an automation-initiated generation is autonomous hosted-cred spend — it
  rides the D46 per-rule/per-chat rate + $ budget AND the D17 consent axis at the automation
  layer. Imagery meters nothing (one budget home; doc 02 §8).
- **The D48 tool projection:** the tool registry exposes a `generate_image` tool (SAME name —
  deliberately one vocabulary for "the model asks for an image" and "a rule asks for an image"),
  args = the same schema minus `quiet` (a tool result always returns to the loop; the recurse
  persists). Its executor is the same injected `imagery.generatePicture`. ST's `GenerateImage`
  function-tool (archived audit §1.3) maps here.

## 2. The chat-turn wiring (the D47 #1 caller)

### 2.1 The explicit surface — `chat.generateImage`

A CHAT verb (the Feature-Map "Image-generation IN CHAT — `domain/chat` verb" row), thin:

```ts
// domain/chat — the verb chat.md's injected-ops table gains: imagery.generatePicture
chat.generateImage(p: {
  caller: Principal; chatId: ChatId;
  request: GeneratePictureRequest;      // the committed wire schema (domains/imagery.md §6.1)
}): Promise<{ messageId: MessageId | null; picture: GeneratedPicture }>
```

Order: `requireParticipant(caller, chatId)` → map wire request → injected
`imagery.generatePicture` → unless `quiet`: persist ONE message whose variant body is a
**STRING containing n embedded asset refs** — `![<alt>](asset:<assetId>)` per image, one message
(Q5: n images, one message) — per **D51's law**: a message body is stored as a `string` (D26 one
content home); render blocks are PARSED from the string at render, never stored. The
`GeneratedPictureImage.block` field is a render-ready convenience for DIRECT consumers (the
composer preview, workload posters), never a persistence payload. → map `picture.warnings` onto
the chat `warning` event surface → return. `quiet: true` returns the picture with
`messageId: null` (the composer preview flow). *(Corrected per design-review IMG-1 — the earlier
"variant body = blocks" wording was the exact shape D51 rejected.)*

### 2.2 Message authorship — DECIDED: the initiating principal

The generated-image message is authored by the initiating user (`authorUserId` = the caller;
`triggeredBy` = the caller) — a user post that happens to contain media blocks. WHY:
attribution-truthful under D19 (the human spent the money and made the thing); zero interaction
with arbitration/roster (a character-authored message would need a speaking-turn story). ST posts
the image as the CHARACTER's message for immersion — REJECTED for v1: it fabricates authorship on
a canon that treats `authorUserId` as real. LEAN — an "as-character" post (the selfie immersion
play) is deferred; criterion: user demand after v1, and it lands as an explicit
`postAs: CharacterParticipantId` option resolved through the same attribution rules as any AI
turn, not a stamp forgery.

### 2.3 In-turn vs post-turn — both, by caller (no imagery knowledge of either)

- **In-turn (autonomous):** the model calls the `generate_image` TOOL mid-turn (D48 loop — agent-
  sdk or the domain-owned OpenAI-wire recurse); the tool result (a `ToolCallRecord` — D48's
  persistence) carries the asset ids; any image the model then shows rides the variant's body
  STRING as embedded `![…](asset:<id>)` refs (D51 — never stored blocks). Imagery is just the
  tool executor.
- **Post-turn/explicit:** `chat.generateImage` (§2.1) from the client button//imagine arm.
- Imagery itself is caller-blind — it returns blocks; whoever holds message-write authority posts
  them. WHY: imagery owns no table but `imagery_generations` and must never grow chat's membership
  gates (the leaf discipline that justified D49's "leaf, not chat sub-feature" call).

## 3. Render + gallery (free, cite-only)

Render is the built D44 pipeline: media blocks → `@orb/ui` `MessageMedia` (asset-src, lazy,
aspect-reserve, lightbox) — zero new render surface. Gallery v1 (`assets.listOwned`, D49 item 2)
surfaces `kind:"generated"` rows automatically; the provenance row supplies the gallery's
"prompt/model/cost" detail + the regenerate affordance (doc 03 §4). No imagery work in either.

## 4. The workload surface — DECIDED: sync verbs only, no imagery `WorkloadKind`

All three public verbs are synchronous service calls. Imagery registers NO `WorkloadKind` in v1.

WHY: a generation is one provider round-trip (seconds — the same envelope as a chat turn), `n` is
clamped to 4, and there is no batch semantics to checkpoint. The workloads engine's
**single-active-per-kind** slot (its correctness pin) would make a hypothetical `imagery-generate`
kind a global serializer: two users generating concurrently would queue behind one slot — a
regression against a plain concurrent verb call. Rejected: `imagery-generate` as a thin async
wrapper "for consistency" (consistency with a pattern built for bulk passes, bought with a
concurrency bottleneck).

Callers that DO need async wrap imagery in THEIR OWN kinds, named `<domain>-<task>` per the
crew/rpg convention — already committed elsewhere: **`rpg-illustration`** and **`rpg-npc-portrait`**
(rpg-design/08 §1–2 — rpg owns cadence, dryRun preview, and its identity-hash state; it consumes
`imagery.generatePicture` via injection), and expressions' sprite-sheet workload (§5). Criterion
for imagery ever owning a kind: a genuinely imagery-OWNED bulk pass (e.g. "regenerate every
portrait after a template change") — then `imagery-<task>` follows the five-edit recipe in
`workloads.md`.

## 5. Sprite sheets (B1) — EXPRESSIONS-owned, one consumer line

Sprite-sheet generation is owned by `domain/expressions` (`generateSpriteSheet` — designed in the
concurrent `proposed/expressions-design/` set): expressions compiles the grid prompt, calls
injected `imagery.generatePicture` (`mode:"free"`, its own prompt/size), slices and mattes the
result, and writes `character_sprites` rows. Imagery's obligation is exactly its front door —
nothing sprite-shaped lives here.

## 6. The §8 open questions — resolved (README Review flag 5)

1. **Quiet-extraction provenance — DECIDED: bill to the initiating principal; never a message.**
   The extraction is real spend → a stats delta attributed to `caller` as `triggeredBy` (D19), via
   `recordStats`. It is NOT persisted as a message (visible or hidden). Rejected: a hidden system
   message (canon is the render truth — D26's "messages are pure slots" leaves nowhere truthful to
   hide one; a hidden-but-real row would haunt export, memory digestion, and token counts).
2. **Extraction role — DECIDED: a shaper over the `summarize` role.** The `extractQuiet` op (doc
   01 §2) is chat's summarize-style shaper pointed at `resolveRole("summarize")` — users aim
   extraction at a cheap model independently of the conversation model (the translate/summarize
   precedent, D47 #5). Rejected: the main `chat` role (ST's behavior — ties keyword extraction to
   the expensive model); a NEW 8th `imageExtract` role (role proliferation for a call
   indistinguishable from summarize's shape; the connection owner gets no new axis to maintain).
3. **Image-edit gate — DESIGNED:** `input.imageEdit` + `image_edit_dropped`, two emit sites
   (doc 03 §1–2).
4. **BACKGROUND destination — DECIDED: a normal media block in chat.** Orbweaver's app background
   is a D49 item-3 THEME TOKEN (`ThemeOverride.background`), not a scene layer. A "set as
   background" affordance is a pure CLIENT action on the generated asset (writes the theme token
   with the `AssetRef`) — zero imagery/server involvement. Rejected: ST's `FORCE_SET_BACKGROUND`
   server routing (resurrects the VN layer D49 reaffirmed out).
5. **`n > 1` — DECIDED: n media blocks in ONE message** (the D44 block array carries them;
   `GeneratedPicture.images` is the plural result, doc 01 §3.3). Rejected: n swipe variants —
   variants mean ALTERNATIVE generations of one turn (pick one), which is the semantics of
   regenerate, not of "give me 4 options to keep"; and stuffing images into variants would make
   the swipe pointer delete-by-hiding the other three.

## 7. SSRF posture (one paragraph, no design)

Imagery is hosted-generate: every model call is provider-mediated, so external-fetch SSRF is out
of scope for the verbs as designed. The two byte-ingress paths: (a) provider-RETURNED image URLs
(`GeneratedImage.url`, step 9) — provider-origin, not user input; fetched then validated by sniff
+ `enforceMagic` at store; (b) `editImage` sources — owned assets or direct uploads ONLY, no URL
arm in v1 (doc 01 §3.2). If a user-supplied-URL source is ever added, it rides the staged
`infra/network` `safeFetch` egress seam (`docs/law/Tier-3-Infra.md` — SSRF/DNS-rebind allowlist) plus
remote-image content validation (the Marinara-Residue B5 `isAllowedImageBuffer` posture). Cited,
not designed here.

## 8. Consumer map (injection only — nobody imports internals)

| Consumer | Calls | Via |
|---|---|---|
| `domain/chat` | `generatePicture`, `extractPrompt` (composer preview), `editImage` | injected ops on `ChatContext` |
| `domain/automation` `generate_image` arm | `generatePicture` | injected op (§1) |
| `domain/tool-use` `generate_image` tool | `generatePicture` | the same injected op, tool projection (§1) |
| `domain/expressions` `generateSpriteSheet` | `generatePicture` | injected op (§5) |
| `domain/rpg` `rpg-illustration` / `rpg-npc-portrait` workloads | `generatePicture` | injected op (rpg-design/08) |
| Phase-6 client | the wire (`chat.generateImage` verb + /imagine) | transport |
