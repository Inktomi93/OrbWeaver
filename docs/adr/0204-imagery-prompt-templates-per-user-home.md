---
kind: adr
status: active
updated: 2026-09-23
---

# Imagery prompt templates home in per-user UserSettings, not preset cards

## Context

Split off [ADR 0107](0107-declared-knob-wired-or-cited-as-dormant.md), whose Phase B ⑩ imagery prompt-templates record pushed it over the 8 KiB ADR cap.

## Decision

**The imagery PROMPT-TEMPLATES lift WIRED (Phase B ⑫ — the manifest's design fork; commit `eb2ddf561`):** the imagery domain's hardcoded PROMPT_TEMPLATES (extraction-mode instructions) + CAPTION_INSTRUCTIONS (multimodal caption instructions) — authored content editable only in source — got the guided-actions treatment (catalog-as-data → editable cards → byte-identical defaults). **HOME RULING = per-user `UserSettings.imagery`, NOT preset cards** (the fork): the templates resolve inside `resolvePrompt`/`captionAvatar` keyed on `caller: Principal` + `mode` ONLY — `GeneratePictureParams` carries no `presetId`, and `/imagine` resolves with no preset in scope, so preset-scoping (the guidedActions precedent, which folds over `preset.params` at always-present-preset sites) would be DISHONEST; the templates are per-user authoring furniture (the databank/chat-prefs per-user tier). The shipped-default CATALOG (`DEFAULT_PROMPT_TEMPLATES`/`DEFAULT_CAPTION_INSTRUCTIONS` + the `EXTRACTION_MODES`/`MULTIMODAL_MODES` subset tuples) homes in `@orb/contracts/imagery` (the ONE imagery-vocabulary home; the server `substrate/templates.ts` now DERIVES its re-exports — `no-inline-union-redecl`, and `contract/params` derives its mode subsets from the tuples too). `UserSettings.imagery.{templates,captions}` (schema v6, additive lift) holds per-mode optional overrides; the resolver `resolveImageryTemplate`/`resolveImageryCaption` returns `override ?? shipped-default` (**default-identity: a virgin UserSettings resolves every mode byte-identical to the shipped catalog — pinned**). The verbs read via two new compose-wired `ImageryContext` ops (`resolvePromptTemplate`/`resolveCaptionInstruction`, off `loadUserSettings` — the FOREIGN-inputs seam); the override still flows through the ONE `@orb/kit/macro` `processMacros` engine (`{{char}}`/`{{user}}`, no second interpolator). The editor is a chat-owned settings-section contribution at the `chat-behavior` anchor (chat owns imagery consumption) — a MacroField card per mode ghosting the shipped default as its `placeholder` (the guided-actions card idiom); a blank field sends a leaf-`null` (reset-to-default). The gate is the home every registry cite resolves against (`d-citation-integrity` makes the cites physics). Enforcer: `knob-wire-coverage` (`tooling/src/verify/gates/knob-wire-coverage.ts`, six cases A/B/B2/C/E/F). Full design: commit `09cd25525`; audit: commit `09cd25525`.

## Consequences

The shipped-default catalog homes in `@orb/contracts/imagery`, the one imagery-vocabulary home; a virgin `UserSettings` resolves every mode byte-identical to the shipped catalog (pinned). The gate is `knob-wire-coverage` (`tooling/src/verify/gates/knob-wire-coverage.ts`).

## Alternatives rejected

Scope the templates to preset cards, the guidedActions precedent (rejected: `GeneratePictureParams` carries no `presetId` and `/imagine` resolves with no preset in scope, so preset-scoping would be dishonest).
