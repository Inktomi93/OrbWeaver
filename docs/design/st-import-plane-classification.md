---
kind: reference
status: active
updated: 2026-08-08
---

# SillyTavern import — the per-plane classification

> **What this is.** The closing record of the ST profile-import campaign: for every plane a real SillyTavern
> profile carries, where it lands in orb — or the reason it does not. It is a REFERENCE, not a plan; the code
> is the law (`packages/server/src/domain/import/`), and this file exists because the reasoning behind a
> "not imported" verdict is not recoverable from an absent code path.
>
> Derived from the real corpus at `/home/inktomi/inktomi-stack/development/neo-tavern/st-data` (two profile
> directories: `default-user`, `nate-work`) plus SillyTavern's own source
> (`/home/inktomi/inktomi-stack/SillyTavern/public/scripts/power-user.js`) as the authority on what a key
> MEANS. The `power_user` table below is COVERAGE-CHECKED against the corpus: 135 keys observed, 135
> classified, zero unclassified.

## 1. Top-level profile planes

| Plane | Home | Status |
| - | - | - |
| `characters/` | character | imported (card PNG → `characters` + CAS avatar) |
| `chats/` | chat | imported (per-character transcripts) |
| `groups/` + `group chats/` | chat | imported as multi-character rooms |
| `worlds/` | world-info | imported as unattached owner library books |
| `User Avatars/` | persona | imported (avatars CAS-stored) |
| `OpenAI Settings/` | preset | imported (chat-completion presets) |
| `themes/` | settings (themes) | **imported 2026-08-08** — converted through orb's own derivation-safety gate (§3) |
| `backgrounds/` | settings (`appearance.backgroundLibrary`) + assets CAS | **imported 2026-08-08** (§2) |
| `settings.json` | several — see §4 | partially imported, per key |
| `TextGen Settings/`, `NovelAI Settings/`, `KoboldAI Settings/` | none | owner ruling 2026-08-08 — orb has no text-completion mode |
| `context/`, `instruct/`, `sysprompt/`, `reasoning/` | none | prompt-format templates; need an ST→orb template mapper (separate epic) |
| `QuickReplies/` | none | quick-reply macros — not modeled |
| `assets/` | none | ST extension assets (expression sprites, audio) — no domain home |
| `extensions/` | none | third-party extension state — out of scope |
| `vectors/` | none | ST's own vector index — orb re-embeds locally, so a foreign index never travels |
| `movingUI/` | none | saved drag-layout state — orb's layout is not user-dragged |
| `user/files/`, `user/images/` | databank / gallery | **classified, NOT built** — see §5 |
| `user/workflows/` | none | ComfyUI workflow JSON — orb's imagery domain does not import foreign workflows |
| `secrets.json` | none | API keys — deliberately never imported (credentials are entered per-install) |
| `stats.json` | none | usage stats — recomputed locally |
| `image-metadata.json` | none | ST gallery image metadata — no import path |
| `content.log` | none | ST install log |

## 2. `backgrounds/` → the background library (owner ruling)

Owner, 2026-08-08: *"backgrounds is our gallery — a media store for characters and etc."*

Each file is CAS-stored as an owned asset of kind `background` (mime derived from the extension and then
MAGIC-VERIFIED against the bytes before the CAS write) and appended to `appearance.backgroundLibrary` — the
BG-D per-user list the app-background picker renders. That destination is the ruling's intent AND its two
hard requirements:

- **It renders.** The background picker reads `backgroundLibrary`. A `gallery_items` row with no
  `subjectCharacterId` was deliberately NOT written: the only gallery surface is character-scoped
  (`listGallery({ subjectCharacterId })`, `client/features/chat/anchors/character-gallery-dialog.tsx`), so
  such a row would be invisible data.
- **It survives GC.** `domain/assets/verbs/collect-garbage.ts` reclaims any unreferenced blob one hour after
  it is written. `backgroundLibrary` is a registered JSON live-source
  (`domain/assets/persistence/asset-refs.ts`), so a library entry roots its asset exactly like an FK would.

The owner's "media store for characters and etc" follows for free: an owned asset is offered by
`assets.listOwned`, which is the pool every character gallery curates from.

Idempotent: the CAS is content-addressed, so a re-import resolves the same asset ids and the library append
(deduped by `assetId`) adds nothing.

## 3. `themes/` → orb themes, through the D71 derivation

Owner, 2026-08-08: convert *"if we can do it safely"*.

ST's theme file is a PALETTE plus a pile of viewer ERGONOMICS toggles. orb splits those two deliberately
(D63/D71 + the card-embeddable partition), so the palette converts to a theme and the ergonomics import
separately from `power_user` (§4). Seven keys carry the palette:

| ST key | ST CSS variable | orb `ThemeOverride` |
| - | - | - |
| `main_text_color` | `--SmartThemeBodyColor` | `bodyColor` |
| `italics_text_color` | `--SmartThemeEmColor` | `narrationColor` |
| `quote_text_color` | `--SmartThemeQuoteColor` | `dialogueColor` |
| `blur_tint_color` | `--SmartThemeBlurTintColor` | `background` (the base surface) |
| `user_mes_blur_tint_color` | `--SmartThemeUserMesBlurTintColor` | `userBubble.bg` |
| `bot_mes_blur_tint_color` | `--SmartThemeBotMesBlurTintColor` | `aiBubble.bg` |
| `border_color` | `--SmartThemeBorderColor` | `borderColor` |

`chat_tint_color` is consumed but emits no token — it is the surface ST paints the message tints onto, so it
is the compositing backdrop.

**Two transforms, both required.** ST writes every colour as `rgba()` and treats them as TINTS layered over a
background photo.
1. **Flattening.** Each tint is composited onto the surface ST painted it on, and the base surface drops its
   alpha. orb's `background` is an opaque BASE that a neutral ramp derives from via relative colour syntax
   (which drops alpha), so a translucent base would give a see-through `--color-background` with opaque
   derived surfaces.
2. **OKLCH.** `@orb/ui` `content/theme-scope/clamp.ts` derives `color-scheme` — and therefore which arm every
   `light-dark()` intent token resolves to — from the base surface's OKLCH lightness, and returns `null` for
   any non-oklch form. An ST palette imported verbatim would give a LIGHT theme the dark intent arms.

**The safety gate.** orb never lets a foreground be PICKED; it DERIVES one. The importer predicts that
derivation in node through `@orb/kit/theme-derivation` — the same constants the clamp spells into CSS, one-homed
below both packages so the prediction cannot drift from the render. Three arms:

- the BASE surface must be derivable. The derived-foreground flip is a step function through `fgPivotL`, so a
  base near the pivot yields a mid-tone foreground and every chrome pairing is low-contrast. The refused band
  is **L ∈ [0.45, 0.63]**, measured (not assumed) by running the real pairings. A theme whose base lands there
  is REFUSED whole, with that reason.
- each BUBBLE tint is kept only if the foreground orb derives for it clears WCAG AA on it.
- each AUTHORED TEXT colour is kept only if it clears AA against the surface it will render on. This is the one
  place ST can hand orb an unsafe pair the derivation cannot fix, because ST painted that text over a
  background photo orb does not reproduce.

A dropped colour is reported with its MEASURED ratio and the base palette's own value shows through. Nothing
is forced through raw.

**Names are QUALIFIED** (`Azure (SillyTavern)`): the theme import op merges on `(ownerId, name)` and ST ships
themes called `Azure` and `Dark Lite`. Seed palettes are `ownerId IS NULL` and structurally unreachable by an
owned write, so orb's own defaults can never be overwritten.

**`custom_css` is NOT imported.** ST custom CSS targets ST's own DOM (`#chat`, `.mes`), which orb never
renders — it would be dead or hostile rules.

**Result on the real corpus:** all 5 shipped ST themes convert (all dark, L 0.20–0.26 — comfortably outside
the refused band), 0 refused, 0 individual colours dropped. The gate's three arms are therefore proven by
PLANTED positive controls in `tests/server/domain/import/substrate/theme.test.ts`, not by the corpus.

## 4. `settings.json` → `power_user`: the per-key classification

Owner correction, 2026-08-08: *"there's a bunch of different places it goes into, including some in the
presets menu."* Generation config is PRESET-owned in orb, viewer ergonomics are user-settings, the palette is
a theme — so this table carries a HOME per key and the wiring follows the column. Multiple writers, never one
mapper into one destination.

**Which preset carries the generation half:** the LIVE `OpenAI (active)` preset (the one built from
`settings.json`'s `oai_settings` blob), and only it. `power_user`'s generation knobs are ST's CURRENT global
tuning, and the live preset is by definition the author's current tuning — matching live-to-live. Stamping
them onto every SAVED preset file would rewrite presets their author tuned for something else.

**Status legend:** `IMPORTED` = wired and landing today · `no seat` = classified, deliberately not imported ·
`selection state` = which thing was selected, not the thing itself.

| `power_user` key | HOME | Status | Note |
| - | - | - | - |

| `allow_name1_display` | preset | no seat | as `always_force_name2` |
| `allow_name2_display` | preset | no seat | as `always_force_name2` |
| `always_force_name2` | preset | no seat | ST name-prefixing toggle; orb's `namesBehavior` imports from the PRESET file, which states it directly |
| `auto_continue` | preset | no seat | ST's auto-continue-until-length loop — no orb counterpart |
| `chat_template_hash` | preset | no seat | ST's cached model chat-template fingerprint — template-family state |
| `chat_truncation` | preset | no seat | ST's fixed keep-last-N history cut; orb budgets by tokens + compaction, not a row count |
| `collapse_newlines` | preset | IMPORTED | → `postProcess.collapseNewlines` (the ASSEMBLE lane) |
| `context` | preset | no seat | text-completion context template — needs an ST→orb template mapper (separate epic) |
| `context_derived` | preset | no seat | whether ST derived the context template from the model — template-family state |
| `context_size_derived` | preset | no seat | template-family state (see `context`) |
| `custom_stopping_strings` | preset | IMPORTED | → `params.stop` on the live `OpenAI (active)` preset (ST stores a JSON-array string) |
| `custom_stopping_strings_macro` | preset | no seat | macro substitution INSIDE stop strings — orb's stop list is literal (the strings themselves DO import) |
| `disable_group_trimming` | preset | no seat | an ST group-history trim knob — orb rooms do not trim by that rule |
| `encode_tags` | preset | no seat | an ST prompt-encoding toggle — no orb counterpart |
| `experimental_macro_engine` | preset | no seat | ST macro-engine switch; orb has ONE macro engine (kit), not a choice |
| `instruct` | preset | no seat | text-completion instruct template — separate epic |
| `instruct_derived` | preset | no seat | template-family state (see `instruct`) |
| `markdown_escape_strings` | preset | no seat | ST markdown-escape list — orb renders through its own markdown pipeline |
| `max_context_unlocked` | preset | no seat | an ST slider-range unlock, not a value |
| `model_templates_mappings` | preset | no seat | ST model→template map — template-family state |
| `pin_examples` | preset | no seat | ST example-dialogue pinning — orb has no example-pin knob |
| `prefer_character_jailbreak` | preset | no seat | as `prefer_character_prompt` |
| `prefer_character_prompt` | preset | no seat | ST card-override precedence; orb resolves card vs preset prompts by its own assembly law |
| `reasoning` | preset | IMPORTED | `auto_parse`/`prefix`/`suffix` → `reasoningParse`; only when ST had auto-parse ON (orb gates the parse on it) |
| `request_token_probabilities` | preset | no seat | logprobs request — orb has no logprob surface |
| `show_user_prompt_bias` | preset | no seat | the UI toggle for the above |
| `single_line` | preset | IMPORTED | → `postProcess.singleLine` |
| `strip_examples` | preset | no seat | as `pin_examples` |
| `sysprompt` | preset | no seat | system-prompt template — separate epic |
| `token_padding` | preset | no seat | ST reserves context headroom for its own tokenizer's inaccuracy; orb budgets from provider-reported usage |
| `tokenizer` | preset | no seat | the ST tokenizer zoo is reaffirmed OUT (D49) — orb counts through the provider |
| `trim_sentences` | preset | IMPORTED | → `postProcess.dropIncompleteSentence` |
| `trim_spaces` | preset | IMPORTED | → `postProcess.trimTrailingWhitespace` |
| `user_prompt_bias` | preset | no seat | ST's per-turn bias string — orb has no bias-injection slot |
| `auto_fix_generated_markdown` | user-settings.appearance | IMPORTED | → `autoFixMarkdown` |
| `auto_load_chat` | user-settings.appearance | no seat | ST startup behaviour — orb routes to a chat by URL |
| `auto_save_msg_edits` | user-settings.appearance | no seat | an ST edit-commit behaviour |
| `auto_scroll_chat_to_bottom` | user-settings.appearance | no seat | orb's transcript owns its own follow behaviour |
| `aux_field` | user-settings.appearance | no seat | which card field ST shows as the list subtitle |
| `avatar_style` | user-settings.appearance | IMPORTED | → `avatarShape`; ST RECTANGULAR also sets `avatarAspect: portrait` |
| `blur_strength` | user-settings.appearance | no seat | ST's single glass-blur strength; orb's glass is a per-SURFACE list (`blurSurfaces`), not a scalar |
| `bogus_folders` | user-settings.appearance | no seat | ST's tag-as-folder browsing mode — orb tags are labels, never a folder tree |
| `charListGrid` | user-settings.appearance | no seat | ST character-list grid toggle — orb's list surfaces own their layout |
| `chat_display` | user-settings.appearance | IMPORTED | → `chatStyle` (ST DEFAULT/BUBBLES/DOCUMENT = flat/bubble/document) |
| `chat_width` | user-settings.appearance | IMPORTED | → `chatWidthPct` |
| `click_to_edit` | user-settings.appearance | no seat | an ST message-edit gesture — no orb counterpart |
| `compact_input_area` | user-settings.appearance | no seat | an ST composer layout toggle — no orb counterpart |
| `confirm_message_delete` | user-settings.appearance | no seat | orb always confirms a destructive row action |
| `enable_auto_select_input` | user-settings.appearance | no seat | an ST composer focus behaviour |
| `enable_md_hotkeys` | user-settings.appearance | no seat | ST composer markdown hotkeys — no orb counterpart |
| `enableLabMode` | user-settings.appearance | no seat | an ST experimental-UI mode |
| `enableZenSliders` | user-settings.appearance | no seat | an ST sampler-UI mode |
| `expand_message_actions` | user-settings.appearance | IMPORTED | → `messageActions` (`expanded` / `hover`) |
| `fast_ui_mode` | user-settings.appearance | no seat | ST's global no-blur mode — orb has no global off switch (see `blurSurfaces`) |
| `font_scale` | user-settings.appearance | IMPORTED | → `fontScale` |
| `fuzzy_search` | user-settings.appearance | no seat | orb's library search owns its own matching |
| `gestures` | user-settings.appearance | no seat | ST swipe gestures — no orb counterpart |
| `hideChatAvatars_enabled` | user-settings.appearance | IMPORTED | → `showInChatAvatars` (INVERTED — ST states the negative) |
| `hotswap_enabled` | user-settings.appearance | no seat | ST's recent-character quick-swap bar |
| `image_overswipe` | user-settings.appearance | no seat | an ST image-swipe behaviour |
| `media_display` | user-settings.appearance | no seat | an ST inline-media layout toggle — no orb counterpart |
| `mesIDDisplay_enabled` | user-settings.appearance | IMPORTED | → `showMessageId` |
| `message_token_count_enabled` | user-settings.appearance | IMPORTED | → `showTokenCount` |
| `movingUI` | user-settings.appearance | no seat | ST's drag-to-rearrange UI mode — orb's layout is not user-dragged |
| `movingUIPreset` | user-settings.appearance | no seat | as `movingUI` |
| `movingUIState` | user-settings.appearance | no seat | as `movingUI` |
| `never_resize_avatars` | user-settings.appearance | no seat | an ST avatar-upload processing flag, not a display setting |
| `noShadows` | user-settings.appearance | IMPORTED | → `shadowEffects` (INVERTED) |
| `pin_styles` | user-settings.appearance | no seat | an ST style-panel pin toggle — no orb counterpart |
| `play_message_sound` | user-settings.appearance | no seat | orb has no message sound |
| `play_sound_unfocused` | user-settings.appearance | no seat | as `play_message_sound` |
| `quick_continue` | user-settings.appearance | no seat | an ST composer quick-action toggle |
| `quick_impersonate` | user-settings.appearance | no seat | an ST composer quick-action toggle |
| `reduced_motion` | user-settings.appearance | IMPORTED | → `reducedMotion` |
| `restore_user_input` | user-settings.appearance | no seat | an ST composer draft-restore behaviour |
| `send_on_enter` | user-settings.appearance | no seat | an ST composer submit binding |
| `show_card_avatar_urls` | user-settings.appearance | no seat | an ST debug affordance |
| `show_group_chat_queue` | user-settings.appearance | no seat | an ST group-queue readout |
| `show_swipe_num_all_messages` | user-settings.appearance | no seat | an ST swipe-counter toggle (the swipe DATA imports with each chat) |
| `show_tag_filters` | user-settings.appearance | no seat | an ST filter-bar visibility toggle |
| `smooth_streaming` | user-settings.appearance | no seat | ST's per-character stream animation — orb streams tokens as they arrive |
| `smooth_streaming_no_think` | user-settings.appearance | no seat | as `smooth_streaming` |
| `smooth_streaming_speed` | user-settings.appearance | no seat | as `smooth_streaming` |
| `sort_field` | user-settings.appearance | no seat | ST character-list sort state — a per-surface UI state in orb |
| `sort_order` | user-settings.appearance | no seat | as `sort_field` |
| `sort_rule` | user-settings.appearance | no seat | as `sort_field` |
| `stream_fade_in` | user-settings.appearance | no seat | as `smooth_streaming` |
| `streaming_fps` | user-settings.appearance | no seat | as `smooth_streaming` |
| `tag_import_setting` | user-settings.appearance | no seat | ST's on-import tag prompt; orb's import always attaches the card's tags as suggestions |
| `tag_sort_mode` | user-settings.appearance | no seat | ST tag-list sort state |
| `timer_enabled` | user-settings.appearance | IMPORTED | → `showGenerationTimer` |
| `timestamp_model_icon` | user-settings.appearance | IMPORTED | → `showModelIcon` |
| `timestamps_enabled` | user-settings.appearance | IMPORTED | → `showTimestamps` |
| `toastr_position` | user-settings.appearance | no seat | ST toast placement — orb toasts have one placement |
| `ui_mode` | user-settings.appearance | no seat | an ST simple/advanced UI mode — orb has ONE surface (no reduced modes) |
| `waifuMode` | user-settings.appearance | no seat | ST's full-screen visual-novel mode — no orb counterpart |
| `wi_key_input_plaintext` | user-settings.appearance | no seat | an ST world-info editor input mode |
| `world_import_dialog` | user-settings.appearance | no seat | an ST import-dialog preference |
| `zoomed_avatar_magnification` | user-settings.appearance | no seat | ST avatar-zoom behaviour — no orb counterpart |
| `blur_tint_color` | theme | IMPORTED (via `themes/`) | → `background` (the base surface) |
| `border_color` | theme | IMPORTED (via `themes/`) | → `borderColor` |
| `bot_mes_blur_tint_color` | theme | IMPORTED (via `themes/`) | → `aiBubble.bg` |
| `chat_tint_color` | theme | IMPORTED (via `themes/`) | consumed as the compositing backdrop; emits no token |
| `custom_css` | theme | no seat | ST custom CSS targets ST's own DOM (`#chat`, `.mes`) which orb never renders |
| `italics_text_color` | theme | IMPORTED (via `themes/`) | → `narrationColor` |
| `main_text_color` | theme | IMPORTED (via `themes/`) | the LIVE copy of the selected palette's `bodyColor` |
| `quote_text_color` | theme | IMPORTED (via `themes/`) | → `dialogueColor` |
| `shadow_color` | theme | no seat | text/panel shadow is `appearance.shadowEffects`, not a theme colour |
| `shadow_width` | theme | no seat | as `shadow_color` |
| `theme` | theme | selection state | which theme was SELECTED; the palettes themselves import from `themes/` |
| `underline_text_color` | theme | no seat | no underline-text token — orb colours body, dialogue and narration only |
| `user_mes_blur_tint_color` | theme | IMPORTED (via `themes/`) | → `userBubble.bg` |
| `default_persona` | persona | IMPORTED | marks the default persona |
| `persona_description` | persona | no seat | ST's single legacy description slot, superseded by `persona_descriptions` |
| `persona_description_depth` | persona | no seat | as `persona_description_position` |
| `persona_description_lorebook` | persona | no seat | an ST persona→lorebook link; orb attaches books to characters/chats |
| `persona_description_position` | persona | no seat | ST injection position for the legacy slot |
| `persona_description_role` | persona | no seat | as `persona_description_position` |
| `persona_descriptions` | persona | IMPORTED | per-persona description/position — read by `substrate/persona.ts` |
| `persona_show_notifications` | persona | no seat | an ST toast toggle |
| `persona_sort_order` | persona | no seat | ST persona-list sort state |
| `personas` | persona | IMPORTED | the persona roster — read by `substrate/persona.ts` |
| `auto_connect` | none | no seat | ST startup auto-connect — orb connections are configured per-install |
| `auto_swipe` | none | no seat | ST auto-reswipe loop — no orb counterpart |
| `auto_swipe_blacklist` | none | no seat | as `auto_swipe` |
| `auto_swipe_blacklist_threshold` | none | no seat | as `auto_swipe` |
| `auto_swipe_minimum_length` | none | no seat | as `auto_swipe` |
| `console_log_prompts` | none | no seat | an ST debug switch |
| `continue_on_send` | none | no seat | an ST send-behaviour toggle |
| `external_media_allowed_overrides` | none | no seat | per-character exceptions to a gate orb does not have |
| `external_media_forbidden_overrides` | none | no seat | as above |
| `forbid_external_media` | none | no seat | ST's external-media gate; orb's CSP forbids external media outright (`img-src` self/data/blob) |
| `relaxed_api_urls` | none | no seat | an ST URL-validation relaxation |
| `servers` | none | no seat | ST's remembered backend URLs — orb connections are configured per-install, never imported |
| `stscript` | none | no seat | ST's STscript parser/autocomplete state — orb automation is its own domain |

Totals: 135 keys — preset 34 · user-settings.appearance 65 · theme 13 · persona 10 · none 13. 31 rows are
`IMPORTED` today (17 of them newly wired in this pass: 6 preset, 14 appearance — minus the 3 persona and 8
theme rows that were already landing through their own planes).

### The multi-profile rule

A whole-folder import can carry SEVERAL ST profile directories, all merging into ONE orb owner. Scalar
`appearance` values therefore land **first-writer-wins**, measured against the schema DEFAULT: a key the user
has already chosen is never overwritten, and with several profile dirs the outcome cannot depend on the order
`readdir` returned them in. The background library MERGES instead (it is a list, deduped by `assetId`).

## 5. The two EMPTY planes — classified, deliberately not built

`user/files/` (databank attachments) and `user/images/` (the ST gallery) are **empty in both profile
directories of the real corpus**. They are classified here and NOT built, under the brief's own rule that an
unexercised import path does not land:

- **`user/files/` → databank.** orb's databank takes a source document's original bytes (`documents.sourceAssetId`,
  asset kind `document`), so the seat exists. What does not exist is any evidence of ST's on-disk layout for
  this directory — the corpus is empty, and a fixture invented from a reading of ST's source would be a path
  proven only against its own assumptions. Build it when a real profile carrying files exists.
- **`user/images/` → gallery.** Same shape: the seat exists (asset kind `gallery` + `gallery_items`), the
  ground truth does not. Note also that ST's user-images directory is per-CHARACTER-named subfolders, which
  would need the character wave's filename→id map — a real design decision that should be made against real
  bytes, not guessed.

Both report as unimported planes with these reasons, so a profile that DOES carry them is not silently
truncated.

### The 167 dropped message attachments (fidelity audit §5.3)

The audit's dropped attachments are `extra.image` / `extra.file` references inside chat transcript lines —
they point at files under `user/images/` and `user/files/`, the two directories above. So they are the SAME
gap, not a separate one: the references were dropped because the bytes they name have no import path yet, and
that path is blocked on the same missing ground truth. When either plane is built, the transcript-side re-link
is its second half (the reference is a filename, and the filename→assetId map is the wave's output — the same
shape the group wave's card-filename→characterId map already has).

## 6. Coupled sites (for the next change)

- The handled-plane set is `HANDLED_ENTRIES` / `HANDLED_SETTINGS` in
  `packages/server/src/domain/import/loader/collect.ts`. A plane that graduates must be added there AND have
  its row DELETED from `UNHANDLED_REASONS` in `packages/server/src/entry/import/import-report.ts` — a reason
  row for a handled plane is a lie the report tells forever.
- The theme derivation constants live in `packages/kit/src/theme-derivation/index.ts` and are re-exported as
  `THEME_DERIVATION` by `packages/ui/src/content/theme-scope/clamp.ts`. `tests/kit/theme-derivation/index.test.ts`
  pins the identity, so a re-declared copy in the clamp fails before it can reach a pixel or an import verdict.
