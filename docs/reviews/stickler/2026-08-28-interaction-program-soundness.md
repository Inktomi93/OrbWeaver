---
kind: review
status: active
updated: 2026-08-28
---

# Interaction-direction program soundness audit (spec ↔ main), 2026-08-28

**Charge:** frontier audit of the modernized INTERACTION-DIRECTION program against its one authority,
`docs/design/interaction-direction-spec.md` (kind:design, status:active, updated 2026-08-28): does what
is BUILT on `main` (audited at `ec8cc55ca`) match the spec, are the UI portions realized, and is the
juice there. Read-only; confirmed-findings-only. The known exemplar of the drift class hunted: #26
saved-rosters built against the stale July design, shipping "parties" instead of the spec's B10 "casts"
(that fix is tracked separately — see `2026-08-28-roster-preset-26-premerge.md` in this directory).

**Verdict up front: the program on `main` is SOUND.** The spec and the tree agree to a degree that is
unusual — every substrate seam (S1–S7), all 20 catalogue rows (22 preset defs), every Phase-B client
surface except the three named below, and all of Phase C through C7 are on the tree, wired at the
composition door, named in the de-cutesy'd vocabulary, and carrying the spec's juice requirements in
code with prior side-eye receipts baked into the comments. The confirmed divergences are FOUR doc-level
truth-repair items (the code is right; the spec's tense or column is stale) plus the one already-known
branch-side B10 drift, which has NOT leaked onto main. Zero cute-name residue exists in any user-facing
string on main.

---

## 1. Prioritized drift list (all CONFIRMED this session)

### D-1 · P2 — B10 "saved casts" (#26): the drifted build is branch-side only; main is clean; do not merge it as-is

- **Spec:** §7 B10 — "saved casts (#26)", riding `rosterMemberSpecSchema`/`seatKnobsSchema`
  (`contracts/chat/roster.ts:76-99` — verified pre-cut on main, exactly as the spec's receipt says) +
  enabled RULE-PRESET IDS + knob values re-minted on apply; merge-window (schema).
- **Tree:** the #26 build exists ONLY on the unmerged branch line `936501dfb` ("feat(roster-preset):
  saved parties — the D61 B6 domain, applyToChat, and the client party picker") → `d05242f16`
  (worktree `wt/agent-ae98e7893e22231db`). Verified `git merge-base --is-ancestor` → **NOT on main**
  for both endpoints. Main carries no saved-cast/parties table (`packages/db/src/schema/chat.ts` — no
  hit), no verbs (`domain/chat/verbs/` has only `roster.ts`/`resolve-rpg-roster.ts`), and a
  whole-package literal sweep for `\b(party|parties)\b` returns only rpg game vocabulary (tracker
  carrier class `party`, "party purse" — a different, legitimate domain axis) and "third-party"
  comments.
- **Consequence:** merging that branch un-reworked re-imports the exact drift this audit was
  commissioned to hunt. Everything else in this report is evidence the drift did NOT propagate: the
  branch is the sole carrier.
- **Evidence:** `git log --all --grep 'parties'`; `git merge-base --is-ancestor 936501dfb main` (exit
  1\); grep sweeps above.

### D-2 · P3 — spec §7-C7a.1 vs the built `run_tool`: the design line "every builtin AND plugin tool" is refuted by a deliberate, receipted narrowing the spec never folded

- **Spec:** §7-C7a.1 — "every builtin AND plugin tool becomes an automation action with ZERO further
  arm-surface growth."
- **Tree:** `packages/server/src/domain/automation/engine/arm-executors.ts:18-30` — a
  correction-of-record header: "`run_tool` (D146) IS DELIBERATELY NARROWER THAN ITS DESIGN … as built,
  the arm admits PLUGIN-sourced tools owned by the RULE AUTHOR and nothing else," with two receipts
  (rpg builtins are turn-scoped registrants that refuse off a turn — `domain/rpg/tools/index.ts`
  returns early on `exec.turnId === null`, so admitting them mints a guaranteed `arm_error` generator,
  the exact rot D146-d exists to prevent; imagery's builtin duplicates the `generate_image` arm — two
  homes for one act). The sanctioned widening door is named
  (`domain/tool-use/substrate/reachability.ts`).
- **Consequence:** the code is right and the reasoning is sound, but the spec's own preamble promises
  "Where an earlier revision of this spec conflicts with this one, THIS one folds the later-verified
  correction and says so in place" — this correction is folded at the CODE only. The next builder who
  reads §7-C7a.1 without reading the executor re-widens it through the front door.
- **Fix shape:** one-paragraph fold into §7-C7a.1 citing D146 + `arm-executors.ts:18`.

### D-3 · P4 — B4's knob column names `suggestOnRefusal`; no such per-rule knob exists (behavior is unconditionally ON for spend arms, opt-out recorded-unbuilt)

- **Spec:** §7 B4 Knobs — "confirmFirst; suggestOnRefusal (RULED F4 ON for spend)".
- **Tree:** `domain/automation/engine/dispatch.ts:208-212` — "Raised only for a rule carrying a SPEND
  arm (the ruling's default; **the per-rule opt-out is recorded-unbuilt** —
  `substrate/suggestions.ts::invitesOnRefusal`)". `grep suggestOnRefusal` across
  `dispatch.ts`/`contracts/automation`/`db/schema/automation.ts` → zero hits. The RULING (F4 ON for
  spend) is exactly realized; the host-facing lever the knob column implies is not built.
- **Consequence:** minor — the behavior matches the ruling's default; only the spec's knob column
  over-promises. One-line spec fold ("knob recorded-unbuilt; ON for spend unconditionally") or build
  the opt-out later.

### D-4 · P4 — build-state tense staleness, all in the benign direction (built > spec claims)

1. **§4 row 20 status** — "committed (C5's lane, in flight 2026-08-24)". C5 is LANDED whole on main:
   `livingLibrary` def with `scope: "global"` (`domain/automation/contract/presets.ts:1185-1211`,
   mode corrected to `character_multimodal` exactly as the row's C5 note requires); the automation
   settings pane flipped from `placeholder: true` to the owner-global rules surface
   (`features/automation/lib/automation-pane.tsx:3-4` — its own header records the flip); owner
   budget verbs (`verbs/get-owner-budgets.ts`/`set-owner-budgets.ts`) + `automation_owner_budgets`
   in `0000_baseline.sql:54`; the picker's scope filter
   (`components/rule-preset-picker.tsx:194`).
2. **§7-C7b build-state receipts** — "user-scoped plugin management IS LANDED BRANCH-SIDE pending
   merge … commit `8340b7f87` … the five seeded example plugins likewise — commit `79e89d255` …
   Neither is on local `main` as of this fold; re-derive before building against them." Both are NOW
   ancestors of main (verified `git merge-base --is-ancestor` → exit 0 for both). The spec
   self-flags with "re-derive", so no builder is misled — but the doc's `updated: 2026-08-28` stamp
   implies these rows were re-derived and they were not.

- **Fix shape:** two one-line tense edits at the next spec touch.

### D-5 · P5 (observation, not a defect) — §4 #6's plain name vs the built title

- Spec plain name: "dice chips after a beat". Built: id `diceChips`, title **"Offer chips after a
  beat"** (`presets.ts:572-574`), default chips "I press on." / "I hold back and watch." / "I try
  something reckless." — no dice anywhere in the arm (real dice are B8's `rollDice`). The built title
  is MORE honest than the spec's row name; the id preserves the catalogue key. Not a cute-name
  regression; recorded so nobody "fixes" the title back toward dice it does not roll.

---

## 2. Program-incompleteness inventory (NOT drifts — Phase-B rows carry no build-state column; these are the grafts whose client halves are absent, stated so the orchestrator knows what "done" still owes)

- **B7 (reactions MR3–MR5 + the first tool-attach): unbuilt.** No `react` tool exists in the ONE
  registry — `ast-grep -p 'name: "react"' -l ts packages/server/src` scanned **1420 files, zero
  matches** (positive control: the same sweep shape finds `run_tool` cases), corroborated by literal
  grep across `domain/chat`/`domain/tool-use`/`entry/compose`. Segment targeting absent by
  declaration: `contracts/chat/reactions.ts:19-20` — "carries no segment columns yet… any future
  segment anchor co-stores the captured speaker" (the spec's own §9.2 MR3 fixture-suite precondition,
  unstarted). The ATTACH SEAM ITSELF IS LIVE and waiting: `turn.ts:673` `attachedToolNames:
  teaching.toolNames`, with tool-use's contribution already publishing names
  (`domain/tool-use/teaching-contribution.ts:64`). B6 (MR0–MR2) is fully built (below).
- **B8 (checks): server half built, S1 ask + in-thread result renderer not wired.** `rollDice` verb
  exists and matches the spec's rides column exactly — member-gated, injected-CSPRNG bake-once,
  no seed input at all (`domain/rpg/verbs/roll-dice.ts:1-4`), on transport
  (`transport/trpc/routers/rpg.ts:93`); `domain/rpg/tools/dice.ts` exists. But
  `chatControlSources` carries only the two automation sources (`compose/authed-app.tsx:165`) — no
  game arm publishes a dice ask — and `toolRenderers` carries only `pluginToolRenderer` (`:201`), so
  no in-thread dice result card exists.
- **B10:** unbuilt on main (D-1 above; the branch build exists and is drifted).
- **R5/R6:** unbuilt-recorded, exactly as the spec states — `AUTOMATION_FIRE_OUTCOMES` has no
  suggestion terminal (`contracts/automation/index.ts:95-101` — `budget_refused` present, no
  `suggested`), matching "v1 writes no fire row at suggest time".

---

## 3. Verified clean — what my silence covers, with the receipts

### 3.1 Nomenclature (the highest-value axis, given the exemplar) — CLEAN on main

- **The rule-preset vocabulary ruling (#599, memory `rule-preset-vocabulary-split`) is honored and
  self-documenting:** `features/automation/lib/rule-copy.ts:8` — "VOCABULARY (owner ruling, #599):
  bare 'preset' means a GENERATION preset in this app, so nothing here \[uses it bare]". A regex sweep
  of quoted strings across `features/automation/` for bare `preset` found only `RulePreset*`
  identifiers and comments.
- **Zero cute-name residue in user-facing strings:** a sweep for `"…(Director|Keeper|Crew|Buddy|
  Party)…"` string literals across `features/automation`, `features/chat`, `features/imagery` →
  zero hits (after excluding first/third-party). The analysis presets speak in the de-cutesy'd
  diegetic register: "a quiet analyst" (storyPacing/spotlightBalance/theNeedle), "a quiet editor"
  (proseAudit) — never "Director"/"Keeper".
- **The Buddy home tile** (`features/home/lib/buddy-tile.tsx`, title "Buddy") is NOT this program's
  drift: it is the founding DORMANT doorway under home-section-spec owner decisions H7+H8, and the
  interaction spec's §5 disposition table itself records buddy as dead-scope-with-carried-patterns.
- **"party" in rpg** (`rpg-tracker-grants.tsx`, `rpg-inventory-tab.tsx` "Party purse",
  `RpgTrackerCarrierClass` `party`) is the rpg game-domain's own carrier-class axis, not roster
  naming.
- **The owner-global lane's user copy** is "Library-wide rules" (`owner-rules-surface.tsx:74,135`) —
  plain, not cute.
- **S4's noun is "suggestion" everywhere** (verbs `confirm-suggestion`/`dismiss-suggestion`, bus
  members, ids) — the buddy-era "proposal" did not resurface.

### 3.2 Build-state accuracy — the spec's BUILT/committed claims hold

- **The catalogue: 22/22 defs, exhaustive registry.** `domain/automation/contract/presets.ts:1337-1360`
  `RULE_PRESETS … satisfies Record<RulePresetId, ErasedRulePresetDef>` maps every §4 row: rows 1–14 +
  16–20 one-to-one, row 15 as `storyPacing`/`distillLore`/`proseAudit`, row 11 as `rumorMill`
  (sibling of `distillLore`). Read IN FULL (1361 lines). The three owner-optional rows the spec marks
  **BUILT** (#17 `illustrateOnLoreReveal`, #18 `reactToLoreActivation`, #19
  `autoSetSceneBackground`) are present with exactly the spec's knob shapes (min-COUNT entry filter;
  guided-text + cooldown; instruction bias + cooldown). The needle (#16) enforces its F6-exception
  boundary as described (routes `vars` ONLY, `presets.ts:898-976`); OFF-by-default is mechanical
  (rules born disabled).
- **Authoring laws 1–7 are mechanically obeyed in the defs** — `has()` guards on every maybe-unset
  read, `int()` coercions, diegetic/compose chip split (#8 compose, #10/#6 send), explicit
  `COUNTER_RULE_MAX_FIRES_PER_HOUR = 240` on every per-beat counter, conservative defaults,
  CEL built only through `celString`/`celInt` (injection-safe, keys never knobs).
- **S1:** the ONE above-composer mount + registry (`features/chat/lib/chat-controls-contribution.tsx`
  — `when`-filtered byte-identical zero state; `chat-controls-band.tsx` read IN FULL). Per-mode busy
  exactly as specified (send = turn-phase, compose = never, execute = own-mutation;
  `runControlAction` + `resolveControlAvailability`). The per-choice `mode` field is REQUIRED at the
  type (presets spell `mode: "send"|"compose"` on every chip arm; `presets.ts:596-598` cites the S1
  commit).
- **S2:** the teaching seam is live end-to-end — `domain/chat/substrate/teaching.ts`, collection in
  `buildTurnContext`, `turn.ts:673` `attachedToolNames: teaching.toolNames`; contributors registered
  at compose (`entry/compose/chat.ts:1281` chat's own + foreign; `entry/compose/services.ts:768-769`
  tool-use + automation); per-domain `teaching-contribution.ts` root files exist for
  automation/chat/tool-use; tests present (`tests/server/domain/chat/teaching-contribution.test.ts`,
  `tests/server/domain/automation/teaching-contribution.int.test.ts`).
- **S3:** presets-as-data with mint through `createRule` (`verbs/create-rule-from-preset.ts`), the
  scope axis born whole — `RulePresetDef.scope` defaulted at the ONE erasure boundary
  (`presets.ts:106-128`), C5's admission + nullable-chat engine seam + `chatRequiredRefusal` second
  belt (`arm-executors.ts:62-74`).
- **S4:** both suggestion classes (`verbs/confirm-suggestion`/`dismiss-suggestion`, in-RAM raise with
  TTL), F4 invitations raised on `budget_refused` for spend arms with rule-reference-only payload
  (`dispatch.ts:208-237`), `suggestionRaised` + the #700 `suggestionResolved` retirement twin
  (`contracts/automation/index.ts:796-844`), the client total map
  (`features/automation/lib/apply-automation-bus-event.ts:64` — mapped-type exhaustive), and the
  `SERVER_INTERNAL_REACH` exemption row for AutomationBusEvent is DELETED
  (`tooling/src/verify/gates/bus-definition-belts.ts:71-76` now lists only `DomainEvent`, with a
  two-sided stale-row arm).
- **S5:** `run_analysis` whole — `engine/analysis-arm.ts`, the `automation_rule_state` table
  (`0000_baseline.sql:61-67`, guidance CHECK ≤ 600), blank-refuses-overwrite literal at
  `persistence/rule-state.ts:30-32` (the spec §5's exact receipt), the S2 guidance contribution
  registered at compose, the vars read proc `chat.getRuntimeVariables` member-gated
  (`domain/chat/verbs/chat-lifecycle.ts:493-498`, `contract/params.ts:424` cites "S5 §4's vars read,
  priced with setVariable" — built by B9/#16 exactly per the whichever-lands-first clause).
- **S6:** `run_tool` arm + pause-not-rot (`PAUSED_ARM` spends no error budget,
  `arm-executors.ts:56-60,412-449`) — narrower than the design per D-2.
- **S7:** the truth-repair note in the spec is accurate on today's tree: the db CHECK carries all 16
  chat types incl. `reactionsChanged` and all 4 domain types (`0000_baseline.sql:94`);
  `LIVE_TRIGGERS` marks `reactionsChanged`, `persona.updated`, `world-info.updated` live with
  wired-with-B6/C5 comments (`contracts/automation/index.ts:193-220`).
- **Phase C:** C1–C6 all on main (above); C7's unblock is real — the plugin client train landed
  (recent main history: `67642da49`, `906cca256`, `569afb596`; §7-C7b's two cited commits now
  ancestors of main per D-4.2).
- **The DB squash law holds:** exactly ONE migration file, `0000_baseline.sql`, carrying every
  program table.
- **R-revamps:** R1/R2 live (S2 above); R3 done ("Offer choices" in the composer ✨ menu,
  un-game-gated — `composer-utility-menu.tsx:8,209`); R4 done — the misleading "(rendered at click
  time)" comment now reads "rendered at FIRE time in the rule author's env … never at click time"
  (`contracts/automation/index.ts:472-473`); R7 `runRuleNow` built (`verbs/run-rule-now.ts`, used by
  invitations + B2's Run-now + C3 on-demand).

### 3.3 UI portions — every specified surface except B7/B8/B10 exists at its specified HOME

Composition door read IN FULL (`compose/authed-app.tsx`, 343 lines):

- **B1** — per-chat toggle in the CONTEXT "This chat" chat-behavior surface
  (`offer-choices-control.tsx` reading `chat.offerChoices` with the per-user default fallback);
  per-user default in the settings chat-behavior pane
  (`contracts/settings/index.ts:686-691` + `chat-behavior-message-handling-model.ts:62`); composer
  wand one-shot. F2 chat-homed + `groupDefaults`-tier default = exactly the spec's knob column.
- **B2** — the Rules SECTION inside "This chat" via the #616-minted `ChatSettingsSectionContribution`
  seam (`features/automation/lib/rules-settings-section.tsx` — its header records the tab→section
  retirement WITH the owner ruling quote and the side-eye overflow measurement that motivated it;
  the spec's B2 HOME sentence matches the as-built section). Rule rows carry enable toggle, Test
  (free, primary), Run-now + Delete (demoted), per-rule fire log (`rule-row.tsx`,
  `rule-fire-log.tsx`); picker is inline with server-derived scope filtering
  (`rule-preset-picker.tsx:191-194`).
- **B3** — chips via `automationQuickReplySource` into the ONE band; the home automation tile is
  RETIRED exactly per its own contract ("stays until B3") — `compose/home-tiles.ts:16` and
  `features/home/index.ts:8-9` both record the retirement.
- **B4** — cards + invitations via `automationSuggestionSource`
  (`suggestion-card-mount.tsx`, read IN FULL): F1 in-RAM lifetime honored (state lives in the mount's
  own fiber; reconnect clears; client-side TTL timer mirrors the server sweep), confirm/dismiss with
  NOT_FOUND-collapse retirement, C3's rewrite detail as a collapsed `@orb/ui/diff` word-diff.
- **B5** — `/imagine` slash (`imagerySlashCommands`), the three content-triggered modals
  (`imagineModal`/`imageDetailModal`/`imageEditModal`, `authed-app.tsx:277-282` citing §7 B5),
  lightbox provenance strip + Edit + "Set as background"
  (`features/imagery/components/image-detail-body.tsx:2,108`; `provenance-strip.tsx`;
  `message-media-block.tsx:3` routes an own-origin image into the lightbox).
- **B6** — `chatMessageReactionsSurface` at `message-footer` (mounts only on committed rows —
  "reactions only exist on canon" made structural); pills one line + "+N" tail
  (`message-reactions.tsx:18,34`); picker's two doors are LITERALLY the spec sentence — "hover
  cluster at fine, INSIDE the ⋯ row menu at coarse. Both DOORS are built exactly that way"
  (`reaction-picker.tsx:5-8`).
- **B9** — `automationClockMeterSurface` + (#16) `automationNeedleMeterSurface` as `thread-flank`
  tenants reading the member-visible vars plane (`needle-meter.tsx:5` reads
  `chat.getRuntimeVariables`); the clock preset publishes fill AND threshold vars so the widget can
  render `filled/segments` honestly (`presets.ts:640-656`, `CLOCK_VAR_KEY`/`CLOCK_MAX_VAR_KEY` in
  contracts).
- **B11** — `automationActivityTab` as a CONTEXT-strip sibling of Members/"This chat"/Preview
  (`authed-app.tsx:118-124`; strip verified at `features/chat/lib/chats-section.tsx:60-95`);
  ONE-HOME read honored — `verbs/list-chat-activity.ts:1-6` reads the SAME `automation_fires` store
  as the per-rule log, host-gated with the leak-free NOT_FOUND collapse; cross-room stays the
  existing inbox with the bell badge + the mobile You-tab badge tell
  (`features/notifications/lib/notifications-chrome.tsx:50-55` — the #227 reachability class).

### 3.4 Juice / feel — realized in code, with prior rendered receipts cited in place

- **Law 5 (attention budget):** `CARD_DISPLAY_CAP = 1` + "+N pending"; `CHIP_DISPLAY_CAP = 4` with
  the remainder behind a real `aria-expanded` EXPANDER (not a dead count — #684 P2), row wraps at
  phone widths instead of clipping (side-eye 2026-08-24 P3) — `chat-controls-band.tsx:48-51,279-317`.
- **Mode legibility:** per-mode glyph AND word kicker (shape + text channels, #684 P1 — "never by
  colour alone" generalized), accessible name = word + label (WCAG 2.5.3 label-in-name),
  `title` always set with the mode's consequence, disabled reason via `aria-describedby` on a
  focusable-when-disabled button (`:149-228`).
- **Card dress:** hairline `border-primary/40` accent, neutral/outline buttons, explicit dismiss —
  the composer's Send stays the room's one primary (`:250-273`), exactly §3-S1's bullets.
- **Reading surface over carried art:** `BAND_READING_SURFACE` (`:53-96`) — the #674 over-art family
  remedy at the anchor, with the live 1.01–1.63:1 measurement that motivated it and the
  ink-pairs-with-surface defence (#684 P3).
- **Touch floor:** reaction pills ride `Toggle size="chip"` on the POINTER-CONDITIONAL
  `--spacing-touch-target` token (44px coarse / 28px fine) — `message-reactions.tsx:13-16`; the
  picker grid wraps because "ten cells at a ≥44px coarse floor cannot hold one line on a phone"
  (`reaction-picker.tsx:56`).
- **Empty states are byte-identical, everywhere the spec demands:** zero-source band `when`-filters
  out; registered-but-silent sources leave the `empty:hidden` wrapper collapsed; flank meters render
  null in rooms with no score/clock; the plugin sections render null with collapsed host `<Section>`.
- **Rule-row action hierarchy** (free Test primary; spending Run-now and irreversible Delete
  demoted) is itself a recorded juice pass (`rule-row.tsx:8-14`).
- **What code cannot prove — the residual side-eye slate (§4 below).**

### 3.5 Doctrine/law compliance spot-checks

- The class-1 wall: no message-write op on `AutomationOps` or the plugin membrane (spec §1) — not
  re-swept exhaustively this session; the two bounded riders verified live
  (`postNarratorMessage` one-seam image post at `contract/ops.ts:88` +
  `entry/compose/automation-plugin.ts:245-253`; `transform_draft` registers into the D50 pipeline and
  the dispatch engine refuses it — `engine/prompt-transforms.ts:2-6`).
- Authority: `holdsAuthority` two-scope split (chat host / enabled owner) one-homed in
  `substrate/authority` with the dispatch gate, S4 confirm re-check and handoff VOID sweep sharing it
  (`dispatch.ts:195-206`).
- The D137 cast producer (`domain/chat/persistence/cast.ts`) uses "cast" in the spec's sense; the
  presence strip (`chat-cast-bar.tsx`) is display-only. Neither is B10.

---

## 4. What needs a rendered pass (side-eye) — judgeable only live

1. The full first-fire loop feel: picker → mint → enable → fire → chip/card appears — timing, motion,
   and whether the band's arrival shifts layout (the code claims layout-neutral empties; the
   TRANSITION into non-empty is unmeasured).
2. The #700 two-tab retirement: confirm on tab A, watch the card leave tab B via
   `suggestionResolved` (structurally sound; never rendered-verified across two attached tabs).
3. The meters' rendered geometry at <512px (the thread-flank stacks-below law) and the mobile
   CONTEXT→sheet with Rules + Activity inside it at `pointer: coarse`.
4. The Rules section at its narrowest production mount (the repo's most common rendered-defect class:
   shrink-0 trailing clusters — rule rows carry a toggle + kebab + badges).
5. Band contrast over carried art post-#674 — re-receipt `snap --contrast` on a `data-has-bg-image`
   room to confirm the fix held through subsequent merges.

## 5. Coverage statement

- **Read IN FULL:** the spec (643 lines); `presets.ts` (1361); `authed-app.tsx` (343);
  `chat-controls-band.tsx` (360); `chat-controls-contribution.tsx`; `suggestion-card-mount.tsx`
  (193); `rules-settings-section.tsx`; `cast.ts` header block; the relevant memory topic files.
- **Read PARTIALLY (targeted regions + headers):** `arm-executors.ts` (1-100 + run_tool region),
  `dispatch.ts` (195-260), `chats-section.tsx` (40-95), `roll-dice.ts` (1-30),
  `list-chat-activity.ts` (1-20), `rule-state.ts` (25-35), `bus-definition-belts.ts` (60-100),
  contracts excerpts. Regions NOT read: `analysis-arm.ts` internals (variant-pin/hash mechanics —
  presence-verified only), the byte-pin/attach-matrix test BODIES (presence-verified only),
  `quick-reply-chip-mount.tsx`, the imagery modal bodies, the plugin UI plane (its own program doc),
  `tests/kit/cel/cel-goldens.json` content.
- **Swept whole-graph:** `party|parties` (4 packages), cute-name string literals (3 feature dirs),
  `ast-grep 'name: "react"'` (1420 files scanned, receipt printed), `suggestOnRefusal`,
  `saved_cast|savedCast`, `teaching`, `postNarratorMessage`, `SERVER_INTERNAL_REACH`,
  `getRuntimeVariables`, trigger tuples, baseline-SQL tables.
- **Sampled, not exhaustive:** preset-by-preset predicate audit (deep-read all 22 defs' shapes, but
  did not re-derive each CEL string against the goldens vector); the acceptance-matrix identity rows
  (§7) taken on the code comments + prior reviews, not re-proven per-arm this session.
- **NOT run:** whole-tree `pnpm check` / `pnpm test` — banned in a lane on this shared multi-lane
  tree (17+ live worktrees; owner ruling 2026-07-25), and this charge changed no code. Main's last
  train drove `verify --push` green (`e5f70f407`, `358ec9bfa` in recent history). Rendered
  instruments not used (no code change to verify; the rendered residue is §4's slate).

## 6. Unconfirmed suspicions (low priority)

- None held. Every suspicion raised during the audit either became a finding above or was refuted in
  session (e.g. "parties leaked onto main" — refuted; "the automation pane is still a placeholder" —
  refuted; "the S7 batch missed the domain members" — refuted at the baseline CHECK).

## 7. Proposed memory lessons (orchestrator owns the write)

- Index line: `- [interaction spec ↔ tree audit clean](interaction-program-spec-audit-clean.md) —
  2026-08-28 main matches the one-spec except run_tool narrowing (D146, deliberate) + B10 branch-side;
  don't re-widen run_tool, don't merge 936501dfb..d05242f16 un-reworked`
  Body: the audit above's D-1/D-2 in two sentences, citing `arm-executors.ts:18` and the branch line.

---

## Issue summary (paste-ready)

Stickler soundness audit of the interaction-direction program (spec `docs/design/interaction-direction-spec.md` ↔ main @ `ec8cc55ca`): **SOUND — zero cute-name drift on main, all substrate seams S1–S7 + all 20 catalogue rows + every Phase-B/C surface except B7 (react tool), B8's client half (S1 dice ask + renderer), and B10 (branch-side only) verified built, wired at the door, and carrying the spec's juice requirements in code.** 5 findings, severity ceiling P2: (D-1/P2) the #26 "parties" drift lives ONLY on branch `936501dfb..d05242f16` — main is clean; do not merge un-reworked. (D-2/P3) spec §7-C7a.1 "every builtin AND plugin tool" is refuted by the deliberate D146 narrowing (`arm-executors.ts:18-30`, plugin-tools-only with receipts) — fold the correction into the spec. (D-3/P4) B4's `suggestOnRefusal` knob does not exist (ON unconditionally for spend arms, opt-out recorded-unbuilt). (D-4/P4) two benign build-state tense stalenesses (§4 row 20 "in flight" — C5 landed; §7-C7b's two "branch-side" commits are on main). (D-5/P5) #6's built title "Offer chips after a beat" is honester than the spec's "dice chips" row name. Residual rendered-pass slate for side-eye: first-fire loop feel, two-tab card retirement (#700), flank meters <512px + CONTEXT sheet at coarse, Rules section at narrowest mount, band contrast over art post-#674. Report: `docs/reviews/stickler/2026-08-28-interaction-program-soundness.md`.
