---
kind: history
status: archived
updated: 2026-08-01
---

# Imagery-templates design lift (Phase B ⑫)

Applies the guided-actions treatment (catalog-as-data → editable cards → byte-identical defaults → override
composition) to the imagery domain's hardcoded prompt-building content: `PROMPT_TEMPLATES` (the extraction-mode
instructions) and `CAPTION_INSTRUCTIONS` (the multimodal vision-caption instructions), both in
`packages/server/src/domain/imagery/substrate/templates.ts`. Today the only way to tune how image prompts get
built is editing source.

## The home question — argued (the fork)

**Ruling: a per-user `UserSettings.imagery` section, NOT preset cards.** The guided-actions precedent lives in
the PRESET blob because there is ALWAYS a resolved preset at every guided-action site (chat turns, greeting
studio) and the per-action `sampling` folds over `preset.params` — the ladder is preset-relative. The imagery
templates' consumption path makes preset-scoping DISHONEST:

- **Reuse-seam check, READ end.** Templates resolve inside `resolvePrompt` → `extractText`
  (`extract-prompt.ts:27`, `PROMPT_TEMPLATES[mode]`) and `captionAvatar` (`caption-avatar.ts:24`,
  `CAPTION_INSTRUCTIONS[mode]`). The resolution inputs are `caller: Principal` + `mode` ONLY.
  `GeneratePictureParams` / `ExtractPromptParams` carry **no `presetId`** (`contract/params.ts` — every param
  block is `caller: Principal`, never a preset ref). The `/imagine` orchestrator (`generate-picture.ts`) and
  the automation `generate_image` arm resolve by mode; there is no preset in scope. Scoping the templates to a
  preset would force `/imagine` to load "the caller's default preset" purely to read a template — inventing a
  preset dependency the generation path deliberately doesn't have (imagery gen config is `generateImage` role +
  size preset, NOT a chat preset).
- **The templates are per-USER app furniture, not per-generation-config.** They're mode-scoped
  ("how do I want CHARACTER extraction phrased") — a stable authoring preference across every chat, the same
  nature as `UserSettings.databank.retrieval` (per-user tuning that rides the caller, resolved server-side).
  That is exactly the `UserSettings` per-user tier (Spine-Config §7.2 — per-user namespaced sections).
- **Not AppSettings (admin) either.** These are an individual author's phrasing preference, not a
  deployment-wide governance floor. Per-user is the honest tier (the databank/chat-prefs precedent, D107).

**Catalog home:** the shipped-default catalog (as-const) homes in `@orb/contracts/imagery` — the ONE home for
imagery wire vocabulary, which "grows ADDITIVELY" per its header. The server `substrate/templates.ts` DERIVES
its `PROMPT_TEMPLATES`/`CAPTION_INSTRUCTIONS` from the contracts catalog (never a re-spelled literal that could
drift — the `no-inline-union-redecl` discipline the modes tuple already follows).

## Override composition (the default-identity discipline)

- Contracts: `DEFAULT_PROMPT_TEMPLATES: Record<ExtractionMode, string>` +
  `DEFAULT_CAPTION_INSTRUCTIONS: Record<MultimodalMode, string>` — the current strings, verbatim, as-const, one
  home. `substrate/templates.ts` re-exports them AS `PROMPT_TEMPLATES`/`CAPTION_INSTRUCTIONS` (byte-identical;
  every existing consumer keeps its import path — the D15 front-door move).
- `UserSettings.imagery.templates`: a `Partial<Record<ExtractionMode, string>>` +
  `imagery.captions: Partial<Record<MultimodalMode, string>>` — per-mode overrides, each optional. **Unset ⇒
  the shipped default, byte-identical to today** (the sampling-ladder default-identity discipline; pinned by a
  test: a virgin `UserSettings` resolves each mode to `DEFAULT_*[mode]` character-for-character).
- Resolution: two new `ImageryContext` ops — `resolvePromptTemplate(caller, mode)` and
  `resolveCaptionInstruction(caller, mode)` — read the caller's `UserSettings.imagery`, returning
  `override ?? DEFAULT_*[mode]`. Wired at compose off `settings.loadUserSettings` (the FOREIGN-inputs seam
  precedent — imagery delegates the settings read). The verbs call the resolved instruction; the raw
  `PROMPT_TEMPLATES[mode]` reads at the two call sites are replaced by the resolved op. Everything downstream is
  unchanged: the instruction still flows through `extractQuiet`/`captionImage` → the ONE `@orb/kit/macro`
  `processMacros` engine (`{{char}}`/`{{user}}` — NO second interpolator; user overrides ride the same engine).
  `ensurePrefix` / `REQUIRED_PREFIXES` / `composeNegative` are UNCHANGED (the prefix belt is a size-default
  contract, not authored content — out of scope; a note on the card tells the author their opening line still
  gets the belt).

## The editing surface (guided-actions card idiom, no new geography)

A `UserSettings.imagery`-anchored settings section (the databank/chat-behavior contribution precedent) — a card
grid over the extraction + caption modes, each card: a `MacroField` (template textarea, ghosting the shipped
default via `placeholder`) + a Default/Customized footer, mirroring `guided-actions-section.tsx`. Landed as a
settings-section contribution at an imagery-owned anchor (or the appearance/behavior anchor if that's the honest
pane — decided at build from the existing anchor set); zero god-feature growth.

## Laws honored

- **Version stamp:** `UserSettings` gains the additive `imagery` section → `USER_SETTINGS_SCHEMA_VERSION` bump +
  an additive lift (the databank v4→v5 precedent; absent section reads back as the shipped defaults).
- **ONE macro engine:** overrides ride the existing `@orb/kit/macro` `processMacros` in `extract-quiet.ts` — no
  second interpolator (the `{{placeholders}}` law).
- **Kind-widening:** none — the mode tuples (`ExtractionMode`/`MultimodalMode`) are unchanged; only per-mode
  string overrides are added, so no exhaustive-consumer fan-out.
- **No tool-schema transform:** nothing rides tool JSON here.
- **assert-the-mutation-fired** CT on the editor; default-identity + override-resolution tests on the resolver.
