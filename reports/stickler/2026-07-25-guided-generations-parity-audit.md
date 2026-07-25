# Guided Generations fidelity/parity audit — 2026-07-25 (stickler, owner-ordered)

Sources triangulated this session:
1. **The ST Guided Generations extension** (`/home/inktomi/inktomi-stack/development/neo-tavern/references/guided-generations/`, v1.7.8) — every content file read (97-file mandate; see §8 for the skim list).
2. **Our side** — `@orb/kit/guided` + `@orb/kit/injection` + their tests, the chat-domain steer routing (context/macros/assemble/injections/turn/start-chat/quiet-generate), `@orb/contracts/{chat,preset}`, the client wand/impersonate/injections surfaces, the CT/int/e2e tests, and ALL DB tables (`packages/db/src/schema/**` — inventory swept; chat/character/preset/persona/settings read in full).
3. **The convergence dossier** (coordinator scope additions): `rpg-design/13-lite-mode.md` (D86/D101), legacy-main lite code (`mode.ts`, `reminder.ts` incl. `buildLiteReminder`, `gather.ts`), and the ST **rpg-companion** extension (`references/rpg-companion-sillytavern/` — README, core/persistence, integration/sillytavern injection sites).
4. **The sanctioned-drop ledger**: `Core-Path-Registry.md` D26/D32/D33/D56/D57/D58/D59, `proposed/chat-crew-design/06-persistent-guides.md` (D59's guided-gen disposition catalog), `history/Core-Debt-Cleared-Ledger.md` PD-63, `history/prompt-manager.md` §6. `Core-SillyTavern-Feature-Map.md` / `Core-ST-Feature-Gap-Register.md` contain NO guided rows (swept — the extension is dispositioned in the D-ledger + 06 doc instead).

`pnpm check`: **PASS, all 12 stages clean** (full output read; log at scratchpad `check-full.log`).

License posture: extension **code** is GPL-3 → adapt-the-concept only. Extension **prompt TEXT** is explicitly sanctioned for verbatim copy by the 06 doc header ("verbatim template copying is sanctioned"); recommendations below rely on that only for template prose.

---

## 1. Concept-by-concept verdict table (the spine)

Verdicts: **CAME-THROUGH** · **MEANING-DRIFTED** · **DROPPED-SANCTIONED** · **DROPPED-UNSANCTIONED** · **ORBWEAVER-AHEAD** · **NEW-SINCE-DISSECTION** (post-dates the 2026-07-03 dissection; no ledger row exists — needs an owner disposition).

### A. The ephemeral steering half (adopted per PD-63/D33)

| # | Source concept (file:line) | Our home | Verdict |
|---|---|---|---|
| A1 | **Guided Response** — inject `instruct` ephemeral + trigger, input consumed then restored (`scripts/guidedResponse.js:54-61,74-81`) | wand → `chat.generate` + `GuidedSteer{action:"response"}` (`use-guided-actions.ts:146-152`); draft → `chat.startChat opening:"generate"` (`:121-141`); resolved once in BUILD (`assembly/context.ts:415-451`) | **CAME-THROUGH** (3 drifts: F3 input-restore, F4 WI-scan, F5 group picker) |
| A2 | Guided Response **group flow** — mandatory member picker (`guidedResponse.js:41-47`, `utils/groupSelection.js`) | arbitration picks; `chat.generate` accepts BOTH `speakerCharacterId` + `guided` but no client surface combines them (`speak-as-select.tsx` ignores the draft; wand omits speaker) | **MEANING-DRIFTED** (loss; seam exists — F5) |
| A3 | **Guided Swipe** — inject, navigate to last swipe, generate new swipe; plain swipe on empty input; DOM surgery + 5×150 ms verify loop + flush-in-finally (`guidedSwipe.js:43-145,152-276`) | `chat.swipe` on the tail assistant slot, `append-variant`, steer through the same BUILD (`verbs/turn.ts:1129-1172`); plain reroll = swipe-strip / Regenerate (`chat-options-menu.tsx:176`) | **ORBWEAVER-AHEAD** (variants are rows; no injection-verify race, no sleeps, no cleanup hazard) |
| A4 | **Guided Continue** — `/continue` with template; tracks `lastGuidedAddition` (`guidedContinue.js:51-108`) | `chat.continueTurn` + steer + `CONTINUE_NUDGE`; `preContinue*`/`lastContinuation*` snapshots (D26) on `message_variants` (`schema/chat.ts:329-333`) | **CAME-THROUGH** (server better: snapshot columns vs `.extra` string math) |
| A5 | Continue **Undo Last Addition / Revert to Original** (`guidedContinue.js:111-184`, buttons `index.js:1032-1058,1421-1431`) | `undoContinue`/`revertContinue` BUILT + int-tested in the domain (`turn.ts:1317-1326`, `tests/.../turn.int.test.ts:1477-1506`) but **absent from the tRPC router and every client surface** | **DROPPED-UNSANCTIONED** (dead-ended pair — F2) |
| A6 | **Impersonate 1st/2nd/3rd** — expand outline INTO the composer for review; re-press restores the outline (`guidedImpersonate.js:14-79`, 2nd/3rd identical mod keys) | `chat.impersonate` + `person` (`{{person}}` splice, `kit/guided:54`); persists a `role:"user"` canon slot directly (`turn.ts:1215-1252`); submenu 1st/2nd/3rd (`impersonate-submenu.tsx`) | **MEANING-DRIFTED** — review-in-composer became commit-to-canon (edit affordance is the recovery); re-press-restore N/A. Multi-user-coherent, but the ST "draft first" ergonomics are gone; note in F3/F7 |
| A7 | Impersonate person **templates** (`prompts.json:10-12`) | `IMPERSONATE_DEFAULT_PROMPT` (`contracts/preset:195-196`) — stronger (anti-scene-narration clauses) | **ORBWEAVER-AHEAD** |
| A8 | **Prompt templates + overrides** — prompts.json + settings overrides + "Use prompts.json" checkboxes + Default buttons (`promptManager.js`, `settingsPanel.js`, `index.js:300-328`) | `PromptConfig.guidedActions` on the preset (D33, one home), editor cards with ghost defaults + `{{input}}` lint + marker cross-link (`guided-actions-section.tsx`) | **ORBWEAVER-AHEAD** (no file fetch, no dual-source checkbox machinery) — one wrinkle F6 |
| A9 | **Per-action depth knobs** (`depthPromptGuidedResponse/Swipe`, `index.js:294-295`) | fixed: system-marker OR depth-0 injection (PD-63 "exactly ONE placement") | **DROPPED-SANCTIONED-BY-DESIGN** (PD-63 pins depth-0; the marker slot covers system-half placement; config keeps `role` only) |
| A10 | **injectionEndRole** global role toggle (`index.js:203`) | per-ACTION `role` (`guidedActionConfigSchema.role`) + per-injection role on `chat_injections.role` (D32 axis) + `frameInjection` role semantics + prefill guard (`kit/injection.isAssistantPrefill`) | **ORBWEAVER-AHEAD** |
| A11 | `scan=true` — the injected steer participates in **world-info scanning** (`guidedResponse.js:54`, `guidedSwipe.js:191`) | WI haystack = `recentMessages + pendingUserText` only (`assembly/world-info/pool.ts:216`); `resolveGuidedSteer` runs AFTER `convertWorldInfo` (`context.ts:677-694`) — the steer never activates lore | **MEANING-DRIFTED** (unsanctioned loss — F4) |
| A12 | **Input save/restore discipline** — finally-restore + Input Recovery tool + 10-deep cycling history (`guideExports.js:30-68`, `inputRecovery.js`) | D57 rules it client state; **nothing exists** — the wand clears the draft unconditionally at fire time, incl. on mutation failure (`composer-wand.tsx:56-59`; client-wide sweep for recovery state: zero hits) | **DROPPED-UNSANCTIONED** in effect (home sanctioned, capability absent — F3) |
| A13 | **Clear Input** tool (`tools/clearInput.js`) | the composer is a normal controlled textarea | N/A (ST-chrome) |
| A14 | **Simple Send** (`simpleSend.js`) | none | **DROPPED-SANCTIONED** (D56; future name `commitMessage`/`injectMessage`) |
| A15 | Untrusted steering text — ST resolves user-typed `{{macros}}` in the steer (implicit; `/inject` content is macro-eval'd) | ZWSP neutralization: user `{{char}}` in the steer is delivered literal, never evaluated (`kit/guided:29-32`, tests pin the codepoint) | **MEANING-DRIFTED, deliberate + net win** (injection-hardening; small UX loss for ST users who steer with `{{char}}` — see F7) |

### B. The persistent-guides half (the extension's other hemisphere)

| # | Source concept | Disposition | Verdict |
|---|---|---|---|
| B1 | Situational/Thinking/Clothes/State/Rules guides (gen + labeled persistent injection, per-guide depth/raw, move/flush of the previous injection) (`persistentGuides/*.js`, `runGuide.js`) | D59 + `06-persistent-guides.md`: `crew_guides` definitions + content one-homed in `chat_injections` (branded FK), packaged verbatim templates, `refreshGuide` verb on the sealed agentTurn, auto-refresh post-turn. Committed Phase-7+, parked in `proposed/` (crew purged in the retro; design set = rebuild reference) | **DROPPED-SANCTIONED (parked)** |
| B2 | Custom guide + Custom Auto guide (`customGuide.js`, `customAutoGuide.js`) | same doc §1 — unlimited custom template rows over the one mechanism | **DROPPED-SANCTIONED (parked)** |
| B3 | Auto-triggers on normal sends (+ the instruct save/restore dance, `send_if_empty` compat, `index.js:1747-1924`) | `autoRefresh` on `crew_guides`, fire-and-forget post-turn (06 §3); the instruct-preservation dance is unnecessary in our model (the steer is a per-turn candidate, not shared mutable metadata) | **DROPPED-SANCTIONED (parked)** — the dance itself: obsolete-by-architecture |
| B4 | Edit/Show/Flush guides + counter badge (`editGuides*.js`, `showGuides.js`, `flushGuides.js`, `index.js:1979-2012`) | 06 §4 verbs (`editGuideContent`/`flushGuide`/`listGuides`); TODAY the Injections context tab already gives raw CRUD over persisted injections (`injections-manager.tsx` + `chat_injections`) — e2e-covered (`injection-roundtrip.spec.ts`) | **PARTIAL-THROUGH** (generic substrate live; guide-flavored UX parked) |
| B5 | `persistentGuidesInChatlog` — collapsible HTML `<details>` notes appended to canon (`runGuide.js:126-198`) | REJECTED pattern (06 §6: "writes presentation HTML into canon; orbweaver renders guides in the panel, canon stays prose") | **DROPPED-SANCTIONED (rejected)** |
| B6 | Stat Tracker (two-call determine/update, per-chat config, sync-from-note) (`trackerGuide.js`, `trackerLogic.js`) | SUPERSEDED by rpg (D58/D86 lite mode — structurally the same loop, db-backed, tool-writes; see §5) | **DROPPED-SANCTIONED (superseded)** |

### C. Tools

| # | Source concept | Disposition | Verdict |
|---|---|---|---|
| C1 | **Corrections** — rewrite the last AI message per instructions, applied as a swipe (`tools/corrections.js`) | the `rewrite` guided action: config + preset card SHIPPED (`contracts/preset:197-198`, `guided-actions-section.tsx:33`), delivery seam exists (`chat.swipe`+steer)… and **zero fire surfaces repo-wide** (ast-grep: `steerFor` = 4 call sites response/swipe/continue/impersonate + the opening literal; compose maps automation→"response") | **DROPPED-UNSANCTIONED** (half-shipped — F1) |
| C2 | Corrections **selection-scoped rewrite** + message/swipe navigator + include-history toggle (`corrections.js:66-570`, `prompts.json corrections.*`) | nothing; no ledger row (the popup postdates the dissection) | **NEW-SINCE-DISSECTION** (fold into the F1 rewrite surface — §6 item 1) |
| C3 | **Separated Thinking** — manual + auto post-generation full-chat-context correction swipe (`tools/separatedThinking.js`, auto arm `index.js:1878-1924`) | nothing; no ledger row (postdates dissection). Family: D59 crew **prose-audit** (post-turn async, proposals) is the committed sibling for the AUTO arm; the MANUAL arm ≡ a rewrite-steered swipe with a packaged instruction | **NEW-SINCE-DISSECTION** (disposition row needed; no new machinery — §6 item 7) |
| C4 | **Spellchecker** (injection-hardened input polish, `tools/spellchecker.js`, `prompts.json:9`) | 06 §6: Phase-6 composer affordance (one cheap completion on the agent role, replace the draft) | **DROPPED-SANCTIONED (deferred)** |
| C5 | **Edit Intros** — perspective/tense/style/gender catalog + custom; Edit-existing vs Make-new; applied as swipe on message 0 (`tools/editIntros*.js`, `prompts.json editIntros.*`) | 06 §6: "guided-action-style rewrite over `characters.greetings` in the character editor", deferred to the character-editor pass. Owner now pulls it forward — full design in §3 | **DROPPED-SANCTIONED (deferred)** → owner-reprioritized |
| C6 | **Update Character** (`persistentGuides/updateCharacter.js`) | the SOURCE is a placeholder (`/return test|` — never implemented, `updateCharacter.js:15`); concept superseded by crew card-evolution (D59) | non-finding |
| C7 | **Fun prompts** (catalog file + CustomFunPrompt.txt + swipe mode + group picker, `tools/funPopup.js`, `funPrompts.txt`) | 06 §6: packaged-template candidate later. Convergence home: the packaged one-shot steer library (§5/§6 item 6) | **DROPPED-SANCTIONED (deferred)** |
| C8 | Fun-prompt **swipe mode** + custom prompts FILE (`funPopup.js:19-85,324-444`) | part of C7 when built (delivery = the same guided swipe/generate verbs; no file — a data home, §6 item 6) | NEW-SINCE-DISSECTION detail of C7 |

### D. Infrastructure / chrome

| # | Source concept | Disposition | Verdict |
|---|---|---|---|
| D1 | Per-tool profile/preset routing + **GG Internal Helper Preset** (+max tokens/context, identity-stripping) (`utils/llmClient.js`, ~930 lines of hot-swap machinery) | Architecture-divergent, superseded: guided steers ride the SAME turn (correct — they steer *this* generation); side generations ride the connection-role system (`resolveRole('agent')`, buddy/crew precedent) with `quiet-generate`'s bounded floor (temp 0.3 / 1024 tokens) as the helper-preset analogue | **ORBWEAVER-AHEAD** (no client-side connection surgery, no `service.TYPE` mutation hacks) |
| D2 | Settings panel: per-button visibility toggles (`settings.html`) | anti-pattern here — memory ledger "no separate reduced modes": ONE surface, disabled affordances with named unlock reasons (`injection-copy.ts`, wand CT pins the titles) | **ORBWEAVER-AHEAD** |
| D3 | Debug mode + captured-log copy/download (`index.js:56-176`) | foundation/observability + `/api/_debug/*` | superseded, N/A |
| D4 | QR-bar integration, version popup, wiki Help item, GRS cross-extension picker contract | ST-chrome | N/A |

---

## 2. CONFIRMED findings (ranked by consequence)

Everything below was evidenced THIS session (file:line + the sweep/command that produced it). `pnpm check` is green throughout — none of these are gate-visible; that is exactly why they are stickler findings.

### F1 — `rewrite` is a dead-ended pair: preset UI ships the config, NOTHING can fire it
- **Where:** `packages/contracts/src/preset/index.ts:182,197-198` (kind + template) · `packages/client/src/features/preset/components/guided-actions-section.tsx:33` (the editable card: "You rewrite the last reply out of character") · fire sites: **none**.
- **Evidence:** `ast-grep -p 'steerFor($$$A)'` → exactly 4 sites (`use-guided-actions.ts:150,157,164,171` = response/swipe/continue/impersonate); the only other steer constructions are `{action:"opening"}` (`use-guided-actions.ts:130`) and compose's automation mapping to `"response"` (`entry/compose/services.ts:1119,1286`). Literal sweeps of client+server for `"rewrite"` confirm no other producer. Chat-side menus read: `message-actions-row.tsx` (Edit/Fork/Hide/Copy/Delete only), `chat-options-menu.tsx:173-179` (Continue/Regenerate/Impersonate — all non-rewrite).
- **Consequence:** the preset editor advertises and lets users customize a template that can never run; the ST Corrections capability (the #1 "fix that reply" tool) is absent while its config half ships. This is the exact "dead wire vs dead-ended pair" defect class in the memory ledger. No doc/workboard row tracks it (docs sweep: `rewrite` appears only in the preset card + history docs).
- **Fix shape:** §6 item 1 (client-only; the delivery seam `chat.swipe + guided{action:"rewrite"}` already exists and appends a variant — ST-parity "correction as swipe" for free).

### F2 — `undoContinue`/`revertContinue`: domain-built + int-tested, absent from transport and client
- **Where:** built `domain/chat/verbs/turn.ts:1317-1326` (+`contract/service.ts:186-188`; snapshot columns `db/schema/chat.ts:329-333`); tested `tests/server/domain/chat/verbs/turn.int.test.ts:1477-1506,1701-1724`; router: `grep -c undoContinue transport/trpc/routers/chat.ts` → **0**; client: repo-wide grep → **0** consumers.
- **Consequence:** the source's "Undo Last Addition"/"Revert to Original" user affordance (guidedContinue.js:111-184) did NOT come through end-to-end; a guided continue that lands badly is only recoverable by hand-editing. Untracked anywhere (docs sweep: zero mentions outside the D26 comment).
- **Fix shape:** §6 item 2 (transport passthrough + two ⋯ menu items; zero schema work — the data half already exists).

### F3 — the steering draft is destroyed on failure; D57's input-recovery client state was never built
- **Where:** `composer-wand.tsx:56-59` — `fireAndClear` runs the mutation then `onChange("")` unconditionally; all five fire paths are fire-and-forget (`use-guided-actions.ts` `.mutate(...)` / `run().catch(() => undefined)`). Error path = toast only. Client-wide sweeps for any recovery/history state (`recover`, `steeringHistory`, `inputHistory`, `draftHistory`…) → zero hits.
- **Source contrast:** every guided script restores the input in `finally` even on error (`guidedResponse.js:74-81`, `guidedSwipe.js:261-271`), plus a 10-deep cycling recovery history (`guideExports.js:30-68`).
- **Consequence:** a failed guided mutation (provider down, budget refusal, abort) eats the user's typed steering text. D57 sanctions the HOME ("strictly client state — Zustand + TanStack Form"), not the absence.
- **Fix shape:** §6 item 3. Minimum: restore the draft on mutation error. Right-once: a small consumed-steer ring (client Zustand, session-scoped — D57 forbids any backend home, so NO schema).

### F4 — the steer never participates in world-info scanning (source `scan=true` on every guided injection)
- **Where:** `assembly/world-info/pool.ts:216` — haystack = `recentMessages + pendingUserText` only; `assembly/context.ts:677-694` — `convertWorldInfo(...)` completes BEFORE `resolveGuidedSteer(...)`, and no field of `GuidedSteer` reaches the pool.
- **Source contrast:** `guidedResponse.js:54` / `guidedSwipe.js:191` inject with `scan=true` — steering "have the dragon attack" activates the dragon lorebook entry for that turn.
- **Consequence:** steer keywords never wake matching WI entries; on `generate`/`swipe`/`continue` turns (no pendingUserText) the steer contributes nothing to lore selection at all. PD-63 pins placement, not scan behavior — no ruling sanctions this drop.
- **Fix shape:** §6 item 5 — thread `input.guided?.input` into the WI convert args as an extra haystack member (raw steer text is available before the convert call; no ordering change, no schema).

### F5 — group chats: steer and speaker-choice cannot be combined (ST's flow always could)
- **Where:** the wand fires `chat.generate` with no `speakerCharacterId` (`use-guided-actions.ts:146-152`); `speak-as-select.tsx` summons a speaker but ignores the composer draft (its own header note: `SpeakAsGenerateVars` has no `guided`). The VERB accepts both (`GenerateParams`, `contract/params.ts:182-186`).
- **Source contrast:** guided response in a group always runs the member picker then triggers that member with the injected steer (`guidedResponse.js:41-56`).
- **Consequence:** in a room, "make ALICE respond to this steer" takes two uncombinable actions; arbitration may voice the wrong member for a targeted nudge.
- **Fix shape:** §6 item 4 — client-only (speak-as consumes a non-empty draft as steer, or the wand's Guided response grows a speaker submenu in multi-rooms).

### F6 — transport hole: `guided` (and `intent`) ride the wire as `z.any()`; a garbage steer 500s the turn verbs
- **Where:** `transport/trpc/routers/chat.ts:87,115,122,137,144(+generate)` — `guided: z.any().optional()` with the comment "no dedicated GuidedSteer wire schema exists yet — the domain type is the validated shape server-side". The domain does NOT runtime-validate: `assembly/context.ts:422` indexes `DEFAULT_GUIDED_ACTIONS[steer.action]` (unknown action → `undefined`), then `assembly/macros.ts:198-199` dereferences `config.prompt` → TypeError; a non-string `input` on a scaffold action hits `args.input.trim()` (`macros.ts:195`) → TypeError; an arbitrary `placement.role` string flows unchecked into `ChatInjection.role` and onto the wire.
- **Evidence:** direct code trace (no live repro run); the crash path is mechanical (undefined-index → member access), reachable by any authenticated participant of the chat.
- **Consequence:** malformed client input turns into unhandled 500s instead of typed BAD_REQUEST; junk roles can reach the provider request. Robustness, not cross-tenant (the caller only breaks their own request) — report kept defensive per policy.
- **Fix shape:** a `guidedSteerSchema` in `@orb/contracts/chat` derived from the existing tuples (`guidedActionKindSchema` + `GUIDED_IMPERSONATE_PERSONS` + `messageRoleSchema`) used by all six router sites; regression test = each turn proc rejects `{action:"nope"}`/non-string input with a zod error. `intent: z.any()` has the same shape (userIntentSchema exists and is `.strict()`) — same one-line fix class. Recommend a quick `security-executor` pass on the router's remaining `z.any()`s (`blocks` too) since input validation is its lane.

### F7 — two deliberate drifts to surface to the owner (documented, not defects)
- **Impersonate commits straight to canon** (`turn.ts:1243-1249` persists `role:"user"`) instead of ST's review-in-composer. Multi-human-coherent and edit-recoverable, but the ST ergonomics (iterate the outline before it becomes canon) are gone; combined with F3 there is no path to retrieve the outline. If review-first is wanted later it is a client mode (generate → composer draft), not a verb change.
- **ZWSP macro neutralization** (`kit/guided:29-32`): a user steering with `{{char}} kisses {{user}}` gets LITERAL braces in the prompt (invisible ZWSP between them), where ST resolved names. Security posture is correct and heavily test-pinned; if the UX matters, resolve a trusted allowlist (`{{char}}/{{user}}` display names only) client-side before submit — never weaken the server seam.

### F8 — preset guided card: empty template ≠ the ghosted default, and the empty-case lint copy is wrong
- **Where:** `guided-actions-section.tsx:144` ghosts `factoryDefault` as placeholder, but a SAVED empty prompt resolves to bare neutralized input, not the default (`kit/guided/index.ts:55-57`; the `?? DEFAULT_GUIDED_ACTIONS[...]` fallback at `macros.ts:198` fires only when the whole `guidedActions` object is absent — `guidedActionsSchema` materializes all six kinds once present). And `CardFooter`'s lint (`:166-169`) renders "No `{{input}}` — your steering text won't land anywhere" for an empty template — false: bare input is exactly what lands.
- **Consequence:** a user who deletes a template believing the ghost default will apply silently changes runtime behavior; the lint then actively misinforms. Low severity, confirmable copy/semantics mismatch.
- **Fix shape:** either treat empty-as-default at resolve (matches every other ghosted MacroField) or change the ghost/copy; plus a separate empty-template lint string.

---

## 3. Q2 — "Create opening" deep-dive (the owner's "kinda lame" complaint) + the right-once design

### What the source does (`tools/editIntrosPopup.js` + `prompts.json editIntros.*`)
- A popup with a **17-option transform catalog** across 4 axes — perspective (6 first-person variants + 2nd + 3rd), tense (past/present), style (novella/internet-RP/literary/script), gender (he/she/they) — multi-selectable, joined `". "`, plus a persistent custom-instruction box.
- Two verbs: **Edit Intro** (`editIntros.editExisting` — rewrite THIS greeting with keep-close rules: "Keep the greeting content, structure, formatting, links, and length as close as possible… Return ONLY the revised greeting") and **Make New Intro** (`editIntros.makeNew` — fresh greeting from the instructions).
- Delivery: the result is appended as a **SWIPE on message 0** (`applyIntroUpdate` → `appendSwipeToMessage`) — the original is preserved and flippable.

### What ours does today
- **Draft:** static `greetings[]` alternates strip (`greeting-swipe-strip.tsx` — no generation, deliberately: no chat exists to bill) + hand-edit (`greeting-actions-row.tsx`) + the wand's "Guided response" → `startChat opening:"generate"` with the `opening` template + steer (`start-chat.ts:240-294`). The generated opening replaces the greeting path entirely — it is from-scratch, context-only.
- **Committed:** the greeting is a canon assistant row; while it is the tail, plain swipe + guided swipe work on it. Nothing feeds the CURRENT greeting text as a rewrite base; nothing offers transform presets; nothing writes back to the card.

### The gap, precisely
1. **No rewrite-this-greeting mode** — ours regenerates from context; the source minimally transforms a base text. Different capability, and the one the owner is missing.
2. **No transform catalog** — one-click perspective/tense/style/gender is the source's entire ergonomic win (steering without prose-writing).
3. **Nothing persists to the card** — a fixed greeting should fix every future chat, not one room. (The source doesn't do this either; our ledgered plan — 06 §6: "a guided-action-style rewrite over `characters.greetings` in the character editor" — is strictly stronger. Build THAT.)

### The orbweaver-shaped design (maximal, right-once, on existing rails)

**Concept:** a "greeting studio" = the guided-action template machinery pointed at a BASE TEXT, homed on the card, surfaced wherever a greeting renders.

- **contracts/preset** — grow `GUIDED_ACTION_KINDS` with `greeting_rewrite` and `greeting_new`, both `guidedActionConfigSchema.default(...)`'d exactly like `opening`/`continue` were (the stored-blob-predates-kind precedent, `preset/index.ts:217-224`). Templates: adapt the source's keep-close prose (verbatim prompt text sanctioned). `greeting_rewrite` needs the base text — mirror the `{{person}}` pattern (`kit/guided:54`, a guided-only pre-substitution, NOT a macro-registry change): a `{{base}}` token substituted before `processMacros`, base text ZWSP-neutralized like `{{input}}` (it is other-author content). One new optional arg on `resolveGuidedInstruction`'s `opts` — additive, kit stays pure.
- **contracts (as-const data)** — `GREETING_TRANSFORMS`: the 4-axis catalog as a tuple + `Record<TransformKey, string>` instruction map (adapted prose). Registry-as-data; the client renders chips from it blind; selected keys join `". "` exactly like the source. (Per "substrate not a type home", contracts owns the shape+data both sides need.)
- **server** — `character.rewriteGreeting` / `character.generateGreeting`: owner-gated character-domain verbs awaiting ONE bounded completion (the buddy-`ask`/06 §3 refreshGuide precedent — a user-facing verb that awaits the turn; connection via the caller's `agent`-role resolve; `quiet-generate`'s floor constants are the temperature/token posture to mirror, though that factory itself is chat-scoped). Returns text; **never writes** — the client appends on accept.
- **Data home (schema answer): NO new table, NO new column.** `characters.greetings` is ALREADY the durable swipe-set for openings — always-a-list JSON with `groupOnly` flags (`db/schema/character.ts:greetings`). Accepted results append a `Greeting` entry (original preserved = the source's swipe semantics, but durable and cross-chat). Card history is already covered by `character_snapshots` (append-only log). Draft chats need nothing (the draft strip derives from `greetings[]`, so a new alternate appears immediately); committed chats need nothing (greeting canon stays a message row; a rewrite there is the F1 rewrite surface on the tail, or re-seeded next chat from the card).
- **client** — one `GreetingStudio` component (catalog chips + custom instruction + Rewrite/Make-new + accept/discard preview), mounted in: the character editor's greetings section (primary home, per 06 §6), and the draft greeting row's action cluster (the moment the owner feels the lameness). The committed-chat tail greeting gets the F1 rewrite surface for free.
- **rpg-lite convergence note:** none needed — greetings are authoring-time card data, outside the turn-steering seam. (Do NOT route this through crew/persistent guides; it has an owner, a base text, and no per-turn lifecycle.)

Why this shape and not the source's: the source mutates chat message 0 only (fix evaporates next chat) and drives generation through a temp-message + hidden-flag + instruct-injection contraption (`editIntrosPopup.js:566-637`) because ST has no side-generation seam. We have the seam; the card is the durable home; the preset carries the editable templates under the same vocabulary users already learned in the guided-actions section.

---

## 4. Q3 — blunt verdict on the port's builder

**Mostly on base, with three real misses; no invented behavior found.**

- **Right seams, ledger-faithful:** templates one-homed on the preset (D33), pure resolver in kit with a genuinely good injection defense (ZWSP placement is subtle and test-pinned to the codepoint), ONE placement model (PD-63) riding the same ChatInjection list as every other injector (D32), ephemeral-by-construction (never a `chat_injections` row), membership-gated verbs, draft/committed as ONE menu with named unlock reasons. Server-side test reality is solid: the steer routing has real int tests (system vs inject vs empty vs impersonate-unsteered, `context.int.test.ts:694-784`), previewAssembly parity is pinned (`read.int.test.ts:598-614`), the opening template reaching the turn prompt is pinned (`start-chat.int.test.ts:279-305`), and the wand CT drives the production `<Composer>` against routed tRPC, not a hand stub.
- **Genuine improvements over the source:** swipes as variant rows vs DOM surgery + retry loops; per-action roles vs one global; per-action templates with lint/ghost vs the prompts.json/settings dual-source checkbox maze; no preset/profile hot-swapping (the source's 930-line `llmClient.js` exists to fight ST's architecture; ours doesn't need it).
- **The misses:** (1) shipping the `rewrite` CONFIG without any trigger — half a feature, the classic dead-ended pair (F1); (2) leaving `undoContinue`/`revertContinue` off the router after building and testing them (F2) — the same missing-API shape the router comment itself documents for the previous wave; (3) dropping the source's input-restore guarantee, which the extension treats as sacred (every script restores in `finally`), with D57's sanctioned replacement never built (F3). Plus the `z.any()` wire comment asserting a validation the domain doesn't perform (F6).
- **Not the builder's fault:** the persistent half, spellchecker, edit-intros, fun prompts, simpleSend are all properly ledgered drops/deferrals; Separated Thinking and the corrections-popup upgrades postdate the dissection.

---

## 5. The unified steering system (first-class convergence deliverable)

### 5.1 The family tree, from the three sources

All three ST-era systems answer "steer the next turn" and were forced into the same two channels ST offers (ephemeral `instruct` injections + `script_injects`/`setExtensionPrompt` extension prompts):

| Capability | guided-gen ext | rpg-companion ext | legacy-main lite mode |
|---|---|---|---|
| one-shot steer | `/inject id=instruct ephemeral` + trigger | "plot progression" button (packaged random-event steer) | (n/a — full-mode `[To the GM]` address is the cousin) |
| standing state block injected per turn | persistent guides (PROSE: thinking/clothes/state/situational/rules) | tracker panels (STRUCTURED: stats/info box/present chars/thoughts) | `buildLiteReminder` `<trackers>` block (STRUCTURED, db-backed) |
| the "make it act" line | guide label frames (`[Characters are currently thinking: …]`) | context-summary injection | `STEERING_LICENSE` ("values visibly shape behavior… never recite the numbers") |
| always-wins user note | customAutoGuidePrompt | (settings prompts editor) | `config.lite.steeringNote` |
| state write-back | side `/gen` call re-generates the block | Together (inline-extract from the reply) or Separate (second call) | D48 tools in the SAME turn (`update_party`/`set_widget_value`/…) |
| per-swipe correctness | none (guides are chat-global) | per-swipe tracker payloads in `swipe_info` | swipe-keyed snapshots FK'd to `message_variants` (the Marinara lesson pin) |
| collision handling | — | a SETTING to skip its injections when guided-gen's `instruct` is detected (README "Compatibility with Guided Generations") | impossible-by-construction (one injection list) |

That last row is the argument in one line: **two steering systems that don't share a channel end up shipping compat toggles to detect each other.** Orbweaver already has the one channel — keep everything on it.

### 5.2 Same concept wearing two names (the convergence map)

1. **The injection channel is ALREADY ONE.** gg's `/inject` ≡ rpg-companion's `setExtensionPrompt(IN_CHAT, depth 0/1)` ≡ lite's `RpgGatherResult.injections` depth-0 reminder ≡ our guided steer candidate — all are `ChatInjection{position:"in_chat", depth, role}` entering the ONE budgeted list (`assembly/context.ts:707-711`) and the ONE splice (`assembly/injections.ts`). **Standing invariant to assert in any bring-over: a new steering feature emits ChatInjection candidates (or fills a marker), never a new channel.** This is the rail; it is already laid.
2. **Persistent guide ≡ tracker block — one lifecycle, two content arms.** Both are: a DEFINITION (what to maintain: a prose template / a stat vocabulary with hints) + VOLATILE CONTENT (current text / current values) + a REFRESH mechanism + a per-turn RENDERED BLOCK + a panel UI with hand-edit. The genuine differences (do NOT falsely unify):
   - **Write path:** structured state → D48 tools in-turn (lite; prose-parse deliberately killed, 13 §4); prose guides → side generation (D59; crew members are pure structured output, "an actor is not a proposer"). Two write grammars, each banned in the other's lane — consistent, keep both.
   - **Rewind semantics:** stats are SWIPE-KEYED (every swipe carries its own values — snapshots FK `message_variants`); prose guides are ROOM state (deliberately not per-swipe). Different truth planes; forcing either onto the other is wrong.
   - What SHOULD be shared when crew guides are rebuilt: (a) the injection channel (already — D59 writes through `setChatInjection`); (b) the **steering-prose kit** — the license line, the label-as-mini-prompt convention (`Corruption (0–100, how morally compromised): 70`), and the always-last user note slot are ONE vocabulary. Home: a small `@orb/kit` (or contracts as-const) `steering-prose` module both `buildLiteReminder`'s successor and the guide label-framer import — today those strings live only in legacy-main rpg code; port them as shared constants so the rebuild and crew guides can't drift; (c) the **panel vocabulary** — one "Trackers" context-tab family rendering prose guides and stat blocks as siblings (the rpg-companion UI proves users read them as one surface); (d) the **post-turn refresh trigger** — crew's `onTurnCompleted` auto-refresh and lite's per-turn gather are one scheduling seam ("steering refresh after commit"), worth naming once in the engine's post-commit hook rather than two bespoke hooks.
3. **Ephemeral steer ≡ GM nudge ≡ fun prompt ≡ plot progression: ONE `GuidedSteer`, differing only in where the `input` comes from** (typed / packaged / automation-rendered — the last already lands as `action:"response"`, `compose/services.ts:1119`). The packaged-steer library (§6 item 6) is therefore pure data over the existing verb surface — and it is the concept BOTH our halves currently lack while both ST ancestors ship it (fun prompts; plot progression).
4. **The per-chat "always-wins steering sentence"** (lite `steeringNote` ≡ gg custom-auto prose ≡ rpg-companion prompt tweaks): orbweaver already has TWO adjacent homes — `roomOverrides.authorsNote` (depth-injected, host-owned) and persisted `chat_injections` rows. Rule for the rpg rebuild: lite's `steeringNote` stays inside `rpg_games.config` (game-scoped, per D58's "the owning feature carries the association"); it must NOT grow a chats-side column. No action now; recorded so the rebuild doesn't re-litigate.

### 5.3 Gaps NEITHER half picked up (the both-missed list)

- **WI-scan of steering text** (F4) — gg had it (`scan=true`); rpg-companion scans nothing; lite's reminder doesn't feed the haystack either. Fixing it at the ONE seam (steer text + optionally the rendered reminder into the WI haystack args) fixes it for every future steering producer at once.
- **Packaged one-shot steers** (5.2 #3) — both ancestors ship a library; neither orbweaver half does.
- **Steer + chosen speaker in one action** (F5) — gg's group picker; lite is solo-posture; ours has the verb but no combined UI.
- **"Together-mode" inline extraction** — deliberately NOT a gap: both orbweaver halves rejected model-owned prose grammars (13 §4's rejection of the Marinara round-trip; D59's no-tools members). The sanctioned path to model-agnostic write-back is the Tier-3b textual-tool-call polyfill, at the right layer. Do not resurrect prose-parsing under guided-gen's flag.

---

## 6. Ranked bring-over list — each item: concept → seam → data home → rpg-lite convergence

**NOW (defect-class; all small):**
1. **Rewrite/Corrections fire surface** (F1, C1/C2) → client: message ⋯ menu "Rewrite…" (tail assistant; modal = instruction box + optional selection-scope over the variant text + the C2 pattern) firing `chat.swipe + guided{action:"rewrite"}` → **data: NONE new** — the result is a `message_variants` row (provenance already carried: `params`, and the open `metadata` JSON sidecar if steer-provenance is ever wanted; the steer itself stays never-persisted per the contract) → convergence: the same modal is the future manual "fix this reply" for lite chats (a lite game's narrative correction is exactly a rewrite-steered swipe; nothing rpg-specific to build).
2. **Expose `undoContinue`/`revertContinue`** (F2) → transport passthrough + ⋯ items gated on a continuation snapshot → **data: NONE** (`preContinue*` columns exist) → convergence: n/a (variant-plane, mode-blind).
3. **D57 input-recovery + restore-on-error** (F3) → client Zustand ring of consumed steers (+ restore the draft on mutation error in `useGuidedActions`) → **data: NONE — D57 forbids a backend home; deliberately not in `user_settings`** → convergence: the same ring should capture lite-chat steers (same wand), free.
4. **Steer + speaker in one flow** (F5) → client: speak-as consumes a non-empty draft as `guided`, or a wand speaker submenu in multi-rooms (`chat.generate` already takes both) → **data: NONE** → convergence: this IS the "nudge a specific NPC" affordance a lite room will want; building it now = zero rpg work later.
5. **WI-scan of the steer** (F4) → server: add the raw steer input to `convertWorldInfo`'s haystack args (`context.ts:677-694`) → **data: NONE** → convergence: do it as a general "steering text joins the scan haystack" arg so the rpg rebuild's reminder can opt its user-facing text in through the same parameter.

**NEXT (capability):**
6. **Greeting studio** (Q2, C5) → seams per §3 (preset `guided actions` kinds + contracts transform catalog + character verbs + one client component) → **data: `characters.greetings` (existing JSON list) + `presets.config.guidedActions` (existing blob, defaulted kinds) — zero migrations** → convergence: n/a (authoring-time, outside the turn seam — deliberately).
7. **Packaged one-shot steer library** (C7/C8 + rpg-companion plot-progression) → a wand "Prompts…" submenu over a packaged as-const catalog (adapt the fun-prompts concept; each entry = a canned `GuidedSteer.input` for response/swipe) → **data v1: contracts as-const only. If/when user-authored entries are asked for: an owner-scoped table on the presets/themes two-row-kind pattern (NULL-owner packaged rows + owned rows) — named here so it isn't improvised later; do NOT stuff user libraries into `user_settings.config`** → convergence: THE shared "nudge library" — rpg flavor packs (twists, encounters-as-prose) are just more rows; one surface, two vocabularies.
8. **Separated Thinking disposition** (C3) → mint the ledger row: manual arm = item 1 with a packaged instruction (the source's `promptSeparatedThinking` adapts into the packaged-steer catalog); auto arm = crew prose-audit (D59) when crew lands — explicitly NOT a new auto-trigger system → **data: NONE now** → convergence: prose-audit is already the one post-turn audit seam; keep it there.
9. **Transport `guidedSteerSchema`** (F6) → contracts/chat schema derived from existing tuples; swap the six `z.any()`s (and `intent` → `userIntentSchema`) → **data: NONE** → convergence: automation/plugin `requestTurn` producers inherit the validation.

**LATER (already parked; keep their ledgered homes):**
10. **Persistent guides** — D59 `crew_guides` (definitions) + content one-homed in `chat_injections` via branded FK; when rebuilt, adopt §5.2's shared steering-prose kit + the sibling Trackers panel → convergence: this is the prose arm of the one tracker model; the lite rebuild is the structured arm; both ride `ChatInjection`.
11. **Spellchecker** — Phase-6 composer affordance (06 §6); agent-role completion; no persistence.
12. **Edit-intros full catalog** — folds into item 6 (already its design).

**NEVER (with the source-anchored reason):**
- simpleSend (D56 — byte-identical to a solo send; future `commitMessage` is a different concept), tracker chatlog HTML notes (rejected pattern — canon stays prose), prompts.json file machinery + "Use prompts.json" checkboxes (preset editor supersedes), profile/preset hot-swap + Internal-Helper-Preset machinery (connection roles supersede; D1), per-button visibility settings (no-reduced-modes ruling), QR-bar/version-popup/debug-capture chrome, `updateCharacter.js` (a placeholder in the source; crew card-evolution owns the concept), Together-mode prose extraction (architecture ruling; polyfill is the sanctioned path).

---

## 7. Verified clean (what my silence covers)

- `pnpm check` full PASS (12/12 stages; complete log read).
- Steer routing end-to-end: wand → verbs → GATHER → BUILD → marker/injection → splice, against the source's semantics (files read in full: `kit/guided`, `kit/injection`, `assembly/{context,macros,assemble,injections}.ts`, `verbs/{turn,start-chat,quiet-generate}.ts` (turn: guided-relevant regions), `contract/params.ts`, both kit test files, `context.int.test.ts` guided describe, wand CT, injections e2e).
- ZWSP neutralization: probed the regex mentally for bypasses (`{{{`, pre-existing ZWSP) — none; tests pin codepoint + position.
- Ephemerality: the guided candidate never reaches `chat_injections` (entryId `"guided"`, candidates-only path) — matches the contract's "NEVER persisted".
- Splice semantics (depth clamp, order, prefill floor, prefix re-frame, squash) read in full — no defect found in the ranges exercised; equal-depth ordering and the boundary re-frame have dedicated tests (`shape.test.ts`, `role-squash.test.ts` presence noted, not fully read).
- The four fired actions carry correct per-action kinds + the empty-steer omission rule on both sides (client `steerFor`, server scaffold-only map — exhaustive Record over `GuidedActionKind`, so a new kind fails tsc).
- Sanctioned-drop cross-check: every "missing" source concept was run against D56/D57/D58/D59/D33/PD-63 + 06 §6 before being called a finding; the findings list contains only unledgered gaps.

## 8. Regions NOT read (scope honesty)

- Reference: `style.css` (848 lines, presentation), `html/test-*.html` (dev scratch), `Media/*`, `LICENSE` body, `.git` internals, `.windsurfrules`/`.cursor` (glanced); `guidedImpersonate3rd.js` verified by diff against 2nd, not line-read; `settingsPanel.js`/`presetUtils.js`/`llmClient.js` read in full, `editIntrosPopup.html` read (unused duplicate of the JS-built popup).
- Ours: `engine/{pipeline,engine}.ts` only in guided-relevant slices; `turn.ts` outside the guided/continue/impersonate/swipe regions; `message-row.tsx`, `chat-options-menu.tsx` header+guided regions only; `tests/server/domain/chat/assembly/shape.test.ts`/`role-squash.test.ts` not read line-by-line; rpg-companion `src/` beyond README/persistence/integration greps; legacy-main rpg beyond `mode.ts`/`reminder.ts`/`gather.ts` (params/service/create-game/client-lite not read — the doc + reminder/gather sufficed for the convergence claims made); DB schema files outside chat/character/preset/persona/settings read as table-inventory only.

## 9. Unconfirmed suspicions (explicitly NOT findings)

- `chat-options-menu.tsx` constructs a synthetic draft handle (`draftChat("chat-options-draft")`) when `chatId` is undefined — looked odd but the guided fires early-return on null chatId; not traced further.
- Whether a guided swipe on the greeting-as-tail interacts with seeded-greeting `messageCommitted` ordering — not exercised.
- `intent: z.any()` beyond the guided lane (other routers may share the pattern) — flagged for a security-executor sweep rather than confirmed here.

---

## 10. RECONCILIATION ADDENDUM (coordinator-requested, same session) — the recovered design records vs §5

Read in full: `reports/rpg-lite-and-full-cohesion-game-plan.md` (D86 record, RATIFIED), `reports/rpg-lite-and-full-cohesion-brief.md`, `reports/research/marinara-st-extension-lite-mode.md`.

**Verdict: the game plan CONFIRMS §5's three pillars and refines two edges; no contradiction.** (1) One-channel: plan §4.4 delivers lite steering as ONE depth-0 injection on the built `RpgGatherResult.injections` → `ChatInjection` channel and explicitly rejects a preset-based delivery — my "everything rides ChatInjection" invariant is its ratified shape, not just my inference. (2) Two content arms, unshared write paths: plan §4.1 rejects the dual-arm design ("tools + a lite-only prose parser — two update grammars forever") and §4.5 splits volatile-model-written vs identity-human-owned — consistent with my "structured→tools, prose→side-gen, never cross" rule. (3) Rewind semantics: §4.5's rejection of model-writable attributes ("per-swipe attribute mutation would force identity into the snapshot plane") is the same swipe-keyed-volatile vs room/identity-state split I drew between lite trackers and prose guides.

**Alternatives it weighed that my §5 had not named:**
- **Macro slots in the user's preset** as the steering delivery — rejected because it "requires every user to hand-edit their preset before trackers work" (§4.4). Relevant beyond rpg: this is the exact failure mode of a preset MISSING the `guided_instruction` marker (my F8-adjacent chip case). The plan's remedy (always-injection, zero preset surgery) suggests a friendlier fallback for guided system-placement steers when the marker is absent/disabled — fall back to a depth-0 injection instead of rendering nothing behind a warning chip. PD-63 chose marker-first; I flag the fallback as a refinement candidate, not a relitigation.
- **A chat-level sheet with no `rpg_games` row** — rejected (§3.1: loses snapshots/staging, forks the state model, "a second game-ish gather in chat"). This is the guardrail for my "one Trackers panel showing prose guides + stat blocks as siblings" recommendation: sibling PRESENTATION, never a shared chat-side data home — guides stay crew/chat-injection rows, stats stay `rpg_*` rows.
- **A separate profile table now** — rejected until a real library exists (§2.2). Directly refines my ranked row 7 (packaged steer library): same discipline — as-const/blob first, a table only when cross-referencing demand is real. Row 7's data-home note now cites this precedent instead of standing alone.
- **Cards as schema owners** (values-not-schema, §5.2) — parallels and confirms my §3 greeting-studio split (card owns greeting VALUES, preset owns the templates/vocabulary).

**Where the plan and my §5 differ, and who's right:** one soft spot only. The plan homes the steering-license prose as versioned constants inside `substrate/reminder.ts` (domain-internal); my §5.2(b) recommends a shared "steering-prose kit" home. Both are right at different times: the plan never weighed cross-family sharing (crew guides were out of its scope), and domain-internal is correct while rpg is the only consumer. The refinement stands with an explicit trigger: WHEN the D59 crew-guides rebuild lands a second consumer of the license-line/label-as-mini-prompt convention, lift the prose to a neutral one-home (the D32 pattern — shared shape, per-consumer defaults); until then, do not move it. Also noted: the RESEARCH report (§7.2) recommended defaulting to Marinara's "together" prose round-trip — the ratified plan §4.1 overrode that with tools-only + the read-only soft arm; my §5.3 "Together-mode is deliberately not a gap" matches the PLAN, and the research's §7.2(b) line must not be cited as current.

**Ranked bring-over deltas:** none removed, none reordered. Row 7 gains the §2.2 no-table-until-library precedent; row 10 gains the shared-prose-kit trigger condition above; and a new low-priority refinement candidate rides with F8's fix: marker-absent system-placement steers fall back to injection (per the plan's macro-slots rejection rationale).
