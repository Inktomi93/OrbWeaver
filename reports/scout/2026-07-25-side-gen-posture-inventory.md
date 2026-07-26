# Side-generation posture inventory — hardcoded sampling vs connection resolution

> Scout survey 2026-07-25, prompted by the owner's gripe ("so much is hardcoded... it should use my
> global gen params and/or have overrides and my global connection"). Input to the side-gen
> sampling-ladder program (slotting pending owner).

## Verdict split

- **Connection resolution: SOUND.** Zero backend literals in any side-gen site (grepped
  vllm/custom-byo/openrouter — none). Every site rides a role lane (`summarize`) resolved
  PER-CALLER via `bindRoleClientsForUser`, or the chat's own resolved connection
  (quiet-generate/compaction via `runChatTurn`/`resolveConnection`). automation-plugin re-binds per
  content-AUTHOR live (`automation-plugin.ts:169`) — never a stashed boot-global.
- **Sampling posture: BROKEN as a class.** 9 sites, ~15 hardcoded constants, ZERO user-reachable
  overrides — except quiet-generate's `intent` fold, which only compaction exercises (partially,
  `{temperature: 0.3}`, maxTokens still floors).

## The sites

| Site | file:line | Constants | Lane / connection |
| - | - | - | - |
| smart arbitrate | domain/chat/engine/smart-arbitrate.ts:49-50 | 0.2 / 24 | summarize, per-user |
| quiet-generate | domain/chat/verbs/quiet-generate.ts:20-21 | 0.3 / 1024 (intent-foldable) | chat's own connection |
| extract-quiet | domain/chat/verbs/extract-quiet.ts:18-19 | 0.4 / 320 | summarize, per-owner |
| compaction intent | domain/chat/verbs/compaction.ts:85 | {temperature: 0.3} | chat's own connection |
| distill (discovery) | domain/discovery/verbs/distill.ts:88-89 | 0.2 / 512 | summarize, per-owner |
| analyze (discovery) | domain/discovery/verbs/analyze.ts:22-24 | 0.3 / 400·400 | summarize, per-owner |
| greeting studio | entry/compose/assets-character.ts:51-52 | 0.3 / 1024 | summarize, per-owner |
| automation autobg | entry/compose/automation-plugin.ts:50-51 | 0.2 / 32 | summarize, per-AUTHOR (live re-bind) |
| imagery captionImage | entry/compose/imagery.ts:117-118 | NONE (backend defaults) | summarize, per-owner |

## Existing data rungs for a resolution ladder

- `promptConfigSchema.params` = `userIntentSchema` (maxOutputTokens/temperature/topP,
  contracts/preset/index.ts:100-104) — EXISTS, wired ONLY into the chat-turn router today.
- `QUALITY_SAMPLING` tier map (preset:53-56) — chat-turn scoped.
- `guidedActionConfigSchema` = prompt + role ONLY (preset:221-227) — no sampling fields; the
  per-action rung needs schema growth (the defaulted stored-blob-predates-field precedent).
- Connection-level `sampling` ranges are VALIDATION bounds, not defaults
  (resolve-model-capability.ts:155,252).
- `customParameters` = BYOK-only passthrough per standing ruling — NOT a ladder rung.

## Proposed shape (pending slot ruling)

ONE resolver (kit or contracts+server op): per-action override (guidedActions config grows optional
sampling fields) → the caller's preset `params` (chat-scoped sites use the chat's active preset;
card/user-scoped sites use the caller's default preset — the greeting-template resolver already
resolves exactly that preset) → per-site floor default AS DATA (a `SIDE_GEN_POSTURES` catalog in
contracts — one home, documented, eventually settings-visible). Then the call-site sweep (9 sites)
and a gate: no numeric sampling literals outside the catalog module. Sized: ~1 executor lane +
schema/consumer ripples.
