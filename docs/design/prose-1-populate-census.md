# PROSE-1 — the populate round's own prose (post-census enumeration)

**Status:** INVESTIGATION — enumeration only, no build. Input to a future migration lane, not the
migration itself.

**Why this exists:** the `docs/design/prose-1-spec.md` census (`e0b9816d`) covers `packages/{server,
contracts,kit}/src` and predates the born-state POPULATE round's own prose. `EXTRACTION_PLANE_PROMPTS`'
per-plane fragments and most of `composePlaneTeaching`/`composePopulateTeaching`'s cross-plane doctrine
lines are ALREADY migrated to `RPG_PROSE_SLOTS` (`packages/contracts/src/rpg/prose.ts`, `rpg.extract.*`)
— see `packages/contracts/src/rpg/extraction-prompt.ts:22-27` ("CENSUS 27 IS WIRED" / "THE BYTES ARE
DATA"). What survives hardcoded is specific to the POPULATE round: its system header, its own inline
identity clause, its invent-nothing doctrine, its user-turn assembly, and its host-facing refusal
sentences. Enumerated here at HEAD (this worktree, `wt/agent-tooling`, based on `main`).

## Enumeration

| # | constant / site | file:line | model-facing? | genuine slot candidate? | notes |
|---|---|---|---|---|---|
| 1 | `POPULATE_SYSTEM_HEADER` | `packages/server/src/entry/compose/rpg.ts:1396-1399` | yes — system prompt prefix | **yes** | Names the round's framing ("reading a CARD and OPENING scene... ONE JSON object"). Composed with `composePopulateTeaching` at line 1485. Sibling of the already-slotted extraction/tool headers; no slot row exists for it. |
| 2 | inline IDENTITY clause in `composePopulateTeaching` | `packages/contracts/src/rpg/extraction-prompt.ts:261-265` | yes — pushed into the populate teaching block | **yes** | Hardcoded string literal (not a `rpgProse(...)` call) sitting inside a function that otherwise composes entirely from slots via `EXTRACTION_PLANE_PROMPTS` + `POPULATE_DOCTRINE`. The one un-slotted line in an otherwise-slotted composer — the clearest single-line migration target. |
| 3 | `POPULATE_DOCTRINE` | `packages/contracts/src/rpg/extraction-prompt.ts:245-249` | yes — appended to every populate teaching block | **yes** | The "invent-nothing" doctrine, the populate counterpart to the extraction round's already-slotted `rpg.extract.reconcileDoctrine`. Already homed in `extraction-prompt.ts` beside the slot-consuming registry, so wiring it as `rpg.populate.doctrine` (or similar) is same-shape work to the sibling slot. |
| 4 | `populateUserPrompt` — card-block label | `packages/server/src/entry/compose/rpg.ts:1405` | yes — `` `CHARACTER CARD — ${corpus.name}:\n...` `` | **yes** | Model-facing label prefixing the card body. |
| 5 | `populateUserPrompt` — empty-card fallback | `packages/server/src/entry/compose/rpg.ts:1405` | yes — `"(the card carries no written description)"` | **yes** | Small but model-facing; the model reads it when the card is blank. |
| 6 | `populateUserPrompt` — opening-scene label | `packages/server/src/entry/compose/rpg.ts:1407` | yes — `` `OPENING SCENE (how the story begins):\n...` `` | **yes** | Same shape as #4. |
| 7 | `populateUserPrompt` — target-write instruction | `packages/server/src/entry/compose/rpg.ts:1409` | yes — `` `Write everything for targetRef "${targetRef}" — this round fills exactly this one character.` `` | **yes** | Model-facing instruction with an interpolated token (`targetRef`), same substitution shape the existing slots already use via `spliceProseTokens`. |
| 8 | `POPULATE_UNRESOLVABLE_REASON` | `packages/server/src/entry/compose/rpg.ts:1417` | **no** — host toast (`PopulateResult.reason`) | no | Host-facing UX copy read from a click result, never sent to the model. Out of scope for a MODEL-facing prose slot; a future HOST-copy slot system (if one is ever built) would be the home, not `RPG_PROSE_SLOTS`. |
| 9 | `POPULATE_READONLY_REASON` | `packages/server/src/entry/compose/rpg.ts:1418` | **no** — host toast | no | Same as #8. |
| 10 | `POPULATE_FAILED_REASON` | `packages/server/src/entry/compose/rpg.ts:1419` | **no** — host toast (prefix; provider's own error message rides after it) | no | Same as #8. |

## Rough migration size

- **7 genuine model-facing slot candidates** (rows 1-7), all small (one paragraph or one line each), all
  already following the existing `rpgProse(ctx, id, tokens?)` / `spliceProseTokens` calling convention used
  throughout `extraction-prompt.ts` — no new machinery needed, only new `RPG_PROSE_SLOTS` rows + call-site
  swaps.
- Rows 1-3 are consumed via `composePopulateTeaching` (already an `ExtractionPromptContext`-aware
  function, already resolves `ctx.prose`) — wiring them is a drop-in `rpgProse(ctx, ...)` swap, same
  pattern as every already-migrated plane fragment in the same file.
- Rows 4-7 live in `populateUserPrompt` (`packages/server/src/entry/compose/rpg.ts`), which currently
  takes `(corpus, targetRef)` with NO `ExtractionPromptContext`/prose access — wiring them requires
  threading `ctx.prose` (or an equivalent resolved-prose value) into `populateUserPrompt`'s call site
  (`buildRunPopulateExtraction`, line ~1486), which already has `prose` in scope one line above
  (`deps.rpgChatOps.resolveChatPresetProse(chatId)`, line 1479) — cheap plumbing, not a design change.
- Rows 8-10 are **excluded** from the migration: they never reach the model, so they are not a
  `RPG_PROSE_SLOTS` candidate under the doctrine's own "model-facing" scope test (`prose-1-spec.md`
  §Scope: "every piece of MODEL-FACING prose").
- No contract-test coverage gap analysis was done here (out of scope for a census) — a build lane should
  check whether `tests/contracts/rpg/extraction-prompt.contract.test.ts`'s per-slot byte-identity
  assertion needs new rows for whichever of #1-7 land.

## Method

`grep -n` for `populate|Populate|POPULATE` across `packages/contracts/src/rpg/extraction-prompt.ts` and
`packages/server/src/entry/compose/rpg.ts` (the two files `POPULATE_SYSTEM_HEADER`/`POPULATE_DOCTRINE`/
`populateUserPrompt` live in, per the task brief), followed by a full read of both hit regions
(`extraction-prompt.ts:1-358`, `rpg.ts:1380-1510`) to hand-classify each hardcoded string as model-facing
or not, and cross-checked against `packages/contracts/src/rpg/prose.ts`'s slot-id list (`grep -n
'^  "rpg\.'`, 52 existing `rpg.*` slots, none named `populate` or `identity`) to confirm none of rows 1-7
already have a slot.
