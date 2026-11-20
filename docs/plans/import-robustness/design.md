---
kind: plan
status: active
updated: 2026-11-20
rank: 7
---

# An import survives bad input and reports each failure

## Goal

One unreadable or oversized card, chat or file never fails a whole import, never leaves a half-made record, never blocks the event loop and always reaches the person with a reason they can act on.

## Shape

Work the open import findings: per-item failure handling, depth and size limits that refuse and do not overflow, lifecycle of cancelled and poisoned rows, and identity in the preview.

## Profile inventory

Every kind a SillyTavern profile holds, with its disposition here and the SillyTavern door that takes it back. The collector is `packages/server/src/domain/import/loader/collect.ts`; the waves that write each kind run in `packages/server/src/domain/import/loader/profile-directory.ts`. The SillyTavern cites are paths in the SillyTavern source tree. `tests/server/domain/import/persistence/import-preview-profiles.int.test.ts` proves, per preview kind, that a run writes the rows its preview names.

The folder layout is SillyTavern's `USER_DIRECTORY_TEMPLATE` (`src/constants.js:16`). Its folder door is the profile directory itself, read at server start.

| Kind | Profile path | Disposition | Import code | Proving test | SillyTavern door |
| - | - | - | - | - | - |
| Characters | `characters/*.png` | imported; a refused card is named with its reason | `packages/server/src/domain/import/loader/collect.ts:287` | `tests/server/domain/import/persistence/import-preview-profiles.int.test.ts` | `POST /api/characters/import` (`src/endpoints/characters.js:1600`), `importCharacter` (`public/script.js:10570`), drop target `processDroppedFiles` (`public/script.js:10501`) |
| Character tags and extra books | `settings.json` `tag_map`, `world_info.charLore` | imported onto the card | `packages/server/src/domain/import/loader/collect.ts:908`, `packages/server/src/domain/import/loader/collect.ts:718` | `tests/server/domain/import/persistence/import-profile-tags-and-books.int.test.ts` | the data folder only |
| Chats | `chats/<card>/*.jsonl` | imported under their card; a chat with no card makes a placeholder character | `packages/server/src/domain/import/loader/collect.ts:373` | `tests/server/domain/import/persistence/import-preview-profiles.int.test.ts` | `POST /api/chats/import` (`src/endpoints/chats.js:786`), `#chat_import_file` (`public/script.js:12116`) |
| Groups and group chats | `groups/*.json`, `group chats/*.jsonl` | imported as group rooms; members resolve by card filename | `packages/server/src/domain/import/loader/collect.ts:576` | `tests/server/domain/import/persistence/import-preview-profiles.int.test.ts`, `tests/server/domain/import/persistence/import-preview-ownership.int.test.ts` | `POST /api/chats/group/import` (`src/endpoints/chats.js:766`), `importGroupChat` (`public/scripts/group-chats.js:2319`); a group definition has no import door, only the data folder |
| Personas | `settings.json` `power_user.personas`, `User Avatars/` | imported; a namesake asks merge or keep | `packages/server/src/domain/import/loader/collect.ts:922` | `tests/server/domain/import/persistence/import-preview-profiles.int.test.ts`, `tests/server/domain/import/persistence/import-preview-persona-collisions.int.test.ts` | `onPersonasRestoreInput` (`public/scripts/personas.js:1755`), avatars `POST /api/avatars/upload` (`src/endpoints/avatars.js:41`) |
| World info | `worlds/*.json` | imported; an entry in a slot with no seat here (Author's Note or example-message edge, outlet) is placed before or after the character, keeps its slot for the SillyTavern export and is named in the report | `packages/server/src/domain/import/loader/collect.ts:406` | `tests/server/domain/import/persistence/import-preview-profiles.int.test.ts` | `POST /api/worldinfo/import` (`src/endpoints/worldinfo.js:99`), `importWorldInfo` (`public/scripts/world-info.js:5851`) |
| Chat-completion presets | `OpenAI Settings/*.json` | imported with their regex scripts; community presets keep their prompt order and scripts | `packages/server/src/domain/import/loader/collect.ts:428` | `tests/server/domain/import/persistence/import-preview-profiles.int.test.ts`, `tests/server/domain/import/persistence/preset-identity-scripts.int.test.ts`, `tests/server/domain/import/persistence/st-preset-report.int.test.ts` | `onImportPresetClick` (`public/scripts/openai.js:4791`) |
| Live chat-completion preset | `settings.json` `oai_settings` | imported as `OpenAI (active)` | `packages/server/src/domain/import/loader/collect.ts:499` | none: gap | the data folder only |
| Text-completion presets, instruct, context, system prompt and reasoning templates | `TextGen Settings/`, `NovelAI Settings/`, `KoboldAI Settings/`, `instruct/`, `context/`, `sysprompt/`, `reasoning/` | no home: Orbweaver does not use text completion; the report names each plane | `packages/server/src/domain/import/loader/collect.ts:622` | `tests/server/domain/import/persistence/import-preview.int.test.ts` | master import `#af_master_import_file` (`public/scripts/preset-manager.js:1224`), `POST /api/presets/save` (`src/endpoints/presets.js:42`) |
| Regex scripts, global | `settings.json` `extension_settings.regex` | imported as global scripts; a placement with no target is named | `packages/server/src/domain/import/loader/collect.ts:693` | report only, `tests/server/domain/import/persistence/regex-scripts-every-door.int.test.ts`; landing: gap | `onRegexImportFileChange` (`public/scripts/extensions/regex/index.js:1542`) |
| Regex scripts, card and preset | card `data.extensions.regex_scripts`, preset `extensions.regex_scripts` | imported with their card or preset | `packages/server/src/domain/import/substrate/card.ts` | `tests/server/domain/import/persistence/regex-scripts-every-door.int.test.ts` | inside the card or preset file |
| Regex presets and allowed-card lists | `extension_settings.regex_presets`, `character_allowed_regex` | no home: Orbweaver has no counterpart | none | none | the data folder only |
| Quick replies | `QuickReplies/` | no home: the buttons run SillyTavern scripts | `packages/server/src/domain/import/loader/collect.ts:622` | `tests/server/domain/import/persistence/import-preview.int.test.ts` | `importQrSet` (`public/scripts/extensions/quick-reply/src/ui/SettingsUi.js:427`), `POST /api/quick-replies/save` (`src/endpoints/quick-replies.js:10`) |
| Data Bank, global and card | `user/files/*.txt`, `settings.json` `extension_settings.attachments`, `character_attachments` | imported under each scope; a switched-off file lands with no scope and is named; an unlisted file, a listed file the profile lacks, a non-text file and a file over the Data Bank limit are skipped and named | `packages/server/src/domain/import/loader/collect.ts:778` | `tests/server/domain/import/persistence/import-databank-gallery.int.test.ts` | `uploadFileAttachment` (`public/scripts/chats.js:274`), `POST /api/files/upload` (`src/endpoints/files.js:28`) |
| Data Bank, chat | chat header `chat_metadata.attachments` | imported attached to the room the transcript landed on | `packages/server/src/domain/import/loader/collect.ts:778` | `tests/server/domain/import/persistence/import-databank-gallery.int.test.ts` | inside the chat file |
| Character galleries | `user/images/<folder>/`, `extension_settings.gallery.folders` | imported into the gallery of each card the folder belongs to; a folder no card owns and a loose file are skipped and named | `packages/server/src/domain/import/loader/collect.ts:862` | `tests/server/domain/import/persistence/import-databank-gallery.int.test.ts` | `POST /api/images/upload` (`src/endpoints/images.js:39`) |
| Backgrounds | `backgrounds/` | imported into the background library | `packages/server/src/domain/import/loader/collect.ts:476` | `tests/server/domain/import/persistence/import-preview-profiles.int.test.ts`, `tests/server/domain/import/persistence/st-background-types.int.test.ts` | `uploadBackground` (`public/scripts/backgrounds.js:1547`), `POST /api/backgrounds/upload` (`src/endpoints/backgrounds.js:135`) |
| Themes | `themes/*.json` | imported; a key with no seat here is named | `packages/server/src/domain/import/loader/collect.ts:451` | `tests/server/domain/import/persistence/import-preview-profiles.int.test.ts`, `tests/server/domain/import/persistence/st-theme-report.int.test.ts` | `importTheme` (`public/scripts/power-user.js:2457`), `POST /api/themes/save` (`src/endpoints/themes.js:10`) |
| User settings, appearance | `settings.json` `power_user` | imported where an appearance setting has a seat; the rest is named | `packages/server/src/domain/import/loader/collect.ts:646` | `tests/server/domain/import/persistence/st-power-user-appearance.int.test.ts` | `POST /api/settings/save` (`src/endpoints/settings.js:206`), the data folder only |
| User settings, other sections | `settings.json` | no home; the report names each section with its reason | `packages/contracts/src/import/index.ts` | `tests/server/domain/import/persistence/import-preview.int.test.ts` | the data folder only |
| Saved window layout | `movingUI/` | no home | `packages/server/src/domain/import/loader/collect.ts:622` | `tests/server/domain/import/persistence/import-preview.int.test.ts` | `POST /api/moving-ui/save` (`src/endpoints/moving-ui.js:8`) |
| Extensions, extension assets | `extensions/`, `assets/` | no home: code and its media, not user data | `packages/server/src/domain/import/loader/collect.ts:622` | `tests/server/domain/import/persistence/import-preview.int.test.ts` | `POST /api/extensions/install` (`src/endpoints/extensions.js:92`) |
| ComfyUI workflows | `user/workflows/` | no home: Orbweaver does not use ComfyUI | `packages/server/src/domain/import/loader/collect.ts:622` | `tests/server/domain/import/persistence/import-preview.int.test.ts` | the data folder only |
| Search index, backups, thumbnails, cache, stats, log | `vectors/`, `backups/`, `thumbnails/`, `_cache/`, `stats.json`, `content.log`, `image-metadata.json` | no home: derived or install state that Orbweaver rebuilds | `packages/server/src/domain/import/loader/collect.ts:622` | `tests/server/domain/import/persistence/import-preview.int.test.ts` | none: SillyTavern rebuilds them |
| API keys | `secrets.json` | never uploaded, staged or imported | `packages/contracts/src/import/index.ts` | `tests/server/domain/import/persistence/import-profile-zip.int.test.ts` | none |

The reasons the report shows for each no-home kind live in `ST_PROFILE_UNHANDLED_REASONS` and `ST_SETTINGS_UNHANDLED_REASONS` in `packages/contracts/src/import/index.ts`.

## Profile export

The library export door's `sillytavern` format writes the library as `data/default-user/` in the layout above. The plan is `packages/server/src/domain/export/verbs/export-st-profile.ts`. It returns the files and the report together, so the dry run, the zip's `orbweaver-export-report.json` and the client preview read one value.

- `ST_EXPORT_DOORS` in `packages/contracts/src/import/st-export.ts` names the SillyTavern door for each import preview kind, so a new kind fails `tsc` until the export names its door.
- `ST_EXPORT_LEFT_REASONS` in the same file names why a row stays here. The report lists every such row.
- A world entry exports in SillyTavern's numeric slot with its depth and role, including a slot it was imported from that has no seat here. `tests/server/domain/import/persistence/export-sillytavern-world-position.int.test.ts` places each entry through a port of SillyTavern's placement.
- A group room exports as `groups/<id>.json` with its transcript in `group chats/`. A persona carries its own avatar; a persona with no image stays here.
- `tests/server/domain/import/persistence/export-sillytavern.int.test.ts` checks each file against a port of its SillyTavern door's validation and imports the tree back. `tests/server/domain/import/persistence/st-power-user-appearance.int.test.ts` checks the appearance round trip.
- `scripts/st-export-boot.ts` boots a scratch copy of a SillyTavern checkout on an export. It is a local tool, outside CI.

## Rejected

A whole-batch failure for one bad item. A refusal that arrives only in the server log.

## Coupled sites

The card import copy home and the import result contract.

## Test plan

Each case runs through the production import door with a planted bad item beside good ones.
