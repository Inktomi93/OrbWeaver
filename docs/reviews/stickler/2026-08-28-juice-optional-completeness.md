---
kind: review
status: active
updated: 2026-08-28
---

# Juice + optional completeness audit — did ALL the fun land? (owner-commissioned)

> **Charge.** Completeness check against OUR OWN plan (distinct from the ST-parity audit): every JUICE
> idea the fun-review endorsed (`2026-08-24-plugin-automation-juice.md`) and every committed/optional
> row in the plan docs (`docs/design/plugin-ui-plane.md` in full; `docs/design/interaction-direction-spec.md`
> §4/§5/§7) — BUILT, UNBUILT, GRAVEYARDED-by-design, or #599-program-scope. All three source docs read
> IN FULL. Census baseline: main `6c1363175`; **the tip moved DURING this review** to `985e61ac2`
> (the U8 card-write train merged mid-census — see finding R2, reclassified live). Every verdict below
> carries a tree receipt; evidence ladder noted where it matters (declared < exported < live-path < tested).

## VERDICT IN ONE SCREEN

**The juice landed. Essentially all of it.** All 15 juice-doc survivors are BUILT (most with
create→fire int tests through the real engine). All 20 preset-catalogue rows — committed AND
owner-optional — are in the `RULE_PRESET_IDS` tuple with a complete defs Record and per-preset tests;
zero graveyarded shapes were accidentally built. All nine plugin-UI phases U0–U8 are landed on main,
including every row the full-parity ruling committed (frame hatch, display transforms, macros,
message-footer badges, pages/dialogs/toasts, ingest pair, URL-install verbs, palette rows) plus one
PURCHASED §5a row (the private plugin-event plane). The mid-census merge closed the D148 card-state
write API too. **The real residue is small: one half-built row (URL install/update has no client
surface), one tracked showcase gap (#774), one doc-marked-optional micro-item (`/vote` slash), and
two interaction-program rows (B7 react tool, B10 saved casts) that belong to #599, not the plugin
mandate.**

## §1 COMPLETENESS TABLE — the juice doc's 15 survivors

| # | Juice idea | Verdict | Receipt (evidence rung) |
| - | - | - | - |
| 1 | Welcome-back recap (confirm-first card) | **BUILT** | `welcomeBackRecap` in `RULE_PRESET_IDS` (`packages/contracts/src/automation/presets.ts:33`) + def `contract/presets.ts:343` (`confirmFirst: true`, counter rule carries `COUNTER_RULE_MAX_FIRES_PER_HOUR` :369 — law 4 held) + create→fire test `tests/server/domain/automation/verbs/create-rule-from-preset.int.test.ts:508` ("R1 stamps every beat; R2 ASKS on a stale open") — TESTED |
| 2 | Async table nudge | **BUILT** | `asyncTableNudge` (presets.ts:74) + the third recipient member `all_members_except_actor` (`packages/contracts/src/notifications/index.ts:53`) + the guest-vocabulary SUBSET as a TYPE (`PLUGIN_NOTIFICATION_RECIPIENTS`, :70 — the membrane silent-downgrade site the juice priced is closed structurally) + tests incl. actor-exclusion + quiet-hours (create-rule-from-preset.int.test.ts §4#2 block) — TESTED |
| 3 | The needle (score → meter + backdrop) | **BUILT, OFF by default per the ruling** | `theNeedle` (presets.ts:67, "RULED 2026-08-24 SHIPS, OFF BY DEFAULT" in the def comment) + `setVariable` in the closed analysis output union (`domain/automation/contract/analysis.ts:108`) + the vars READ proc `chat.getRuntimeVariables` (`transport/trpc/routers/chat.ts:603`, service `domain/chat/contract/service.ts:303`) + client meter `features/automation/lib/needle-meter-surface.tsx` + tests incl. the F6 wall ("a pass that emits guidance/lore alongside the score publishes ONLY the score") and score CLAMP — TESTED. The owner fork the juice doc posed was RULED (spec §8/§9: scores may cross; arcs/twists/guidance never) |
| 4 | Opener chips (compose mode) | **BUILT** | `openerChips` (presets.ts:45) + the per-choice `mode: "send"\|"compose"` field (`contracts/automation/index.ts:484` `z.enum(QUICK_REPLY_MODES).default("send")`; the bus event carries `mode` :822) + test "opening the room surfaces the deck in COMPOSE mode" — TESTED |
| 5 | Scene veil | **BUILT** | `sceneVeil` (presets.ts:47) + test :427 ("the veil marker in a member's own message redirects the next beat") — TESTED |
| 6 | Call a vote | **BUILT** (one optional sub-item unbuilt) | `callAVote` (presets.ts:49, "raised on demand (R7), never on its own") + send-mode chips + test :583. The catalogue's "**optional** `/vote` slash" is NOT built (zero hits in `contribution-contracts.ts`/automation client) — doc's own marker is "optional"; see actionable #4 |
| 7 | Rumor mill | **BUILT** | `rumorMill` (presets.ts:62) + test "its DISTINCT brief (rumours + consequences) rides the pass"; law 7 pinned ("the model's `{{setvar}}` is NEUTRALIZED") — TESTED |
| 8 | Callback rule | **BUILT** | `callback` (presets.ts:51) + both counter arms capped (law 4) + test :447 incl. case-insensitive match — TESTED |
| 9 | Cutaways | **BUILT** | `cutaways` (presets.ts:53) + test :492 — TESTED |
| 10 | Spotlight balance | **BUILT** | `spotlightBalance` (presets.ts:76) + test "narrator-only guidance lands verbatim" + active-game mint refusal — TESTED |
| 11 | Research familiar (plugin) | **BUILT + SEEDED** | `seed-assets/plugins/research-familiar/` (203-line main.js; calls `net.fetch`/`worldInfo.upsertEntry`/`events.on`, netHosts `en.wikipedia.org`); the egress rate floor the juice truth-repair confirmed is live (`domain/plugin/substrate/rate-floor.ts`) — LIVE-PATH (seeded, exercises the real membrane) |
| 12 | `run_tool` arm (the platform row) | **BUILT** | `run_tool` closes `AUTOMATION_ACTION_TYPES` (`contracts/automation/index.ts:268`) + **pause-not-rot** exactly as the juice specced: `dispatch.ts:70` `PAUSED` outcome + `pausingToolName` (:366) + the arm-level paused for mid-dispatch deactivation (`arm-executors.ts::runRunTool`) — TESTED (handle-event.int.test.ts "suggest-only and mid-dispatch pause terminals release their held reservation") |
| 13 | Living library (owner-global rules) | **BUILT** | `livingLibrary` (presets.ts:82 — "the only preset whose mint takes no chat") + the whole C5 lane: `RULE_PRESET_SCOPES` chat/global (presets.ts:105), `AUTOMATION_ARM_SCOPES` + exhaustive scope Record (index.ts:240,272), `automation_owner_budgets` (`db/schema/automation.ts:161`), owner verbs (`get/set-owner-budgets.ts`, `list-owner-rules.ts`), the settings-pane home (`features/automation/lib/automation-pane.tsx` + `components/owner-rules-surface.tsx` + CT `tests/client/features/automation/components/owner-rules-surface.ct.tsx`), `DOMAIN_TRIGGER_TYPES` = 4 incl. the S7 pair (index.ts:55-62) — TESTED |
| 14 | `llm.quiet` for plugins | **BUILT + widened past the juice spec** | capability member (`manifest.ts`) + host fn (`host-v1.ts:472`) + the U6 widenings the plan committed: structured `schema` (:61) + vision `imageAssetIds` (:83) — and both vitest exact pins live (`manifest.contract.test.ts:32` ordered `toEqual`; `index.contract.test.ts:28` `toHaveLength(33)`) — TESTED. Exercised by the seeded affinity-tracker |
| 15 | Oracle deck (plugin tools mid-turn) | **BUILT + SEEDED** | `seed-assets/plugins/oracle-deck/` (428-line main.js: `tools.register` + `ui.register` at `tool-card`, `page`, AND `dialog` anchors + `registerCommand`/`toast`/`openDialog`); the A2-F5 renderer gap CLOSED at U3 (`pluginToolRenderer` wired `compose/authed-app.tsx:235`, commits `03480da00`/`21ebaf174`); the per-turn attach seam it gates is live (`domain/tool-use/teaching-contribution.ts` — D145/D146, host-scoped, live-registry read) — LIVE-PATH + TESTED |

**15/15 BUILT.** The one sub-item not on the tree is #6's `/vote` slash, which the catalogue itself marks "optional".

## §2 The juice doc's §4 committed-plan findings (10) — all discharged

| # | Finding | Verdict | Receipt |
| - | - | - | - |
| 1 | Owner-global class engine-unready | **BUILT** (C5) | see table §1 row 13 |
| 2 | `setVariable` output op + vars READ surface | **BUILT** | `analysis.ts:108` + `chat.getRuntimeVariables` proc (routers/chat.ts:603) |
| 3 | `DOMAIN_TRIGGER_TYPES` lags bus by two | **BUILT** | 4 members incl. `persona.updated`/`world-info.updated` (index.ts:55-62); `reactionsChanged` rode B6's window (spec §S7 truth-repair, tree-confirmed) |
| 4 | Plugins cannot think | **BUILT** | `llm.quiet` + U6 schema/vision widenings |
| 5 | Plugin-tool per-turn attach unspecified | **BUILT** | `domain/tool-use/teaching-contribution.ts` (the D145 root slot's second occupant; attach set = the turn HOST's drivable tools, live-registry read so a disabled plugin simply vanishes rather than failing the turn) |
| 6 | Transform-deadline warning sentence | **PRESENT** (soft) | `host-v1.ts:284` "a sync read inside the 250 ms transform deadline (no host round-trip needed)" at the `transforms.register` teach site; the display-transform docs state their own deadlines. The exact "no fetching transform can exist" sentence is implied, not spelled — I did not treat this as a finding |
| 7 | Tag pending-status scope note | recorded S4 note; no build owed | spec §3-S4 carries it |
| 8 | Cascade-depth suppression | held (pre-existing) | dispatch depth tests (`hard-caps the cascade at depth 3`) |
| 9 | cel-goldens vector | **BUILT** | `tests/kit/cel/index.test.ts` imports `cel-goldens.json` and iterates it |
| 10 | mode field + S1 display cap + counter caps | **ALL BUILT** | mode: §1 row 4; the band cap is an EXPANDER not a count (`features/chat/components/chat-controls-band.tsx:279-292`, #684 P2 — better than the juice's "+N overflow" spec); `COUNTER_RULE_MAX_FIRES_PER_HOUR` applied at every counter def (presets.ts:369,473,648,719,1026,1105) |

## §3 The preset catalogue (interaction spec §4) — 20/20

`RULE_PRESET_IDS` (`packages/contracts/src/automation/presets.ts:31-93`) carries **all 22 ids
covering all 20 catalogue rows** (row 15 is three presets: `storyPacing`/`distillLore`/`proseAudit`;
row 11 adds `rumorMill`), each with a def in the exhaustive
`satisfies Record<RulePresetId, ErasedRulePresetDef>` (`domain/automation/contract/presets.ts:1360`)
and a create→fire int test through the real engine
(`tests/server/domain/automation/verbs/create-rule-from-preset.int.test.ts`, 1314 lines — every §4
row has a `describe` block by number; `livingLibrary` is covered in the C5 suites +
`owner-rules-surface.ct.tsx`). The three owner-OPTIONAL rows (#17 `illustrateOnLoreReveal`,
\#18 `reactToLoreActivation`, #19 `autoSetSceneBackground` — "owner 2026-08-24 'everything optional
gets included'") are all built and tested (cooldown/count-floor arms pinned).

**Graveyard check: CLEAN.** None of the 13 graveyarded shapes (auto-fire recap, genre decks, keyword
clocks, blind rotation, reaction-heat steering, tags queues, persona-switch turns, time-of-day,
swipe audit, campaign archive, translator transforms, dice-outcome clocks) appears in the tuple or
defs — nobody re-minted a killed idea.

## §4 The plugin UI plane (#679) — phases U0–U8 all LANDED

| Phase | Verdict | Receipt (commit + tree) |
| - | - | - |
| U0-U1 (contracts + Tier-S settings e2e) | **BUILT** | `ui.surface` in `PLUGIN_CAPABILITIES`; `@orb/contracts/plugin/ui.ts` (958 lines, 20 node kinds); `list-surfaces`/`get-surface-state`/`invoke-ui-action` verbs; `pluginSurfaceStateChanged` on the user bus with its invalidation row (`client/src/data/invalidation.ts:310`); affinity-tracker registers a `settings` surface (main.js:200-202) |
| U2 (chat anchors + shell) | **BUILT** | `plugin-anchored-surfaces.tsx`, `plugin-surface-shell.tsx`; CT pin commit `dd526594f` ("byte-identical rooms, the labelled shell, the silence law") |
| U3 (tool cards) | **BUILT** | `pluginToolRenderer` (`authed-app.tsx:235`), `plugin-tool-card.tsx`; commits `21ebaf174`/`03480da00` — closes juice A2-F5 |
| U4 (Tier C client guest + CSP) | **BUILT** | `features/plugin/lib/ui-guest/` (worker + realm + host), `get-ui-bundle.ts`, `ui-host-call.ts` + `UI_PROXYABLE_HOST_FUNCTIONS` (9 members, re-gated — host-v1.ts:510ff), `'wasm-unsafe-eval'` (`security-headers.ts:93,114`); commits `29f54f7dc`/`200bd6a4d`/`ec23d2ba1`/`46552e88a`/`11817ead4`/`a68d95fe2` (the containment fixes); affinity-tracker ships a REAL 114-line `ui.js` |
| U5 (commands/dialog/toast + ui.page/Extensions) | **BUILT** | `ui-outbox.ts` (the drain-on-round-trip channel), `ui.registerCommand`/`ui.toast`/`ui.openDialog` host fns, `extensions` as the SECTION_IDS member after `config` (`client/src/state/section-ids.ts:18`), `extensions-section.tsx` + both Extensions surfaces + `plugin-dialog-modal.tsx` + `plugin-slash-commands.ts` + `plugin-commands-chrome.tsx`; commits `89e541e87`/`668536e69`; oracle-deck exercises page + dialog + command + toast |
| U6 (parity tail) | **BUILT** | commit `2c08ac420`: `plugin-message-footer-surfaces.tsx` (badges; `message-footer` in the 7-member anchor tuple `ui.ts:43`), the display-transform seam (`transforms.registerDisplay` + `transform-for-display.ts` + `list-display-transforms.ts` + client `use-plugin-display-text.ts`), typed transform-abort (`contracts/chat/bus.ts:229-232`), `macros.register` (`plugin-macros.ts` — the §7a no-args mechanization), `llm.quiet` schema + vision |
| U7 (the `ui.frame` hatch) | **BUILT** | commit `9c3089789`: `ui.frame` capability + `ui.registerFrame` (the ONE fn claiming it, host-v1.ts:507), `get-frame-body.ts`, `contracts/plugin/frame.ts`, `plugin-frame.tsx`; the §7a `servesOwnPolicy` second-prefix repair + served-header pins landed with it |
| U8 (ecosystem) | **BUILT** (one client half missing — finding R1) | U8.1 `f34486694` (`databank.ingest` + `character.ingest`), U8.2a `f1488db8c` (URL install/upgrade through the egress guard — `install-from-url.ts`/`preview-from-url.ts`/`upgrade-from-url.ts`), U8.3 `6b68239c0` (the §5a plugin-event plane: `plugin_events` + `pubsub.emit/on` + `plugin-event-bus.ts`), U8.4 `b435a687a` (D148), U8.5 `6e9510750` (`plugin-command-palette-source.ts` — first-class palette rows), **and mid-this-review `34fcf9184`/`6585aa80f`** (`character.card_state` — see R2) |

### §4a The §5 parity register (35 rows) — residue only

Thirty rows verified at full declared fidelity (receipts above; the refusal rows 11/13/23/24/25 are
§5a's price sheet, standing as designed). The residue:

- **Row 27 (URL install + auto-update): SERVER-ONLY — finding R1 below.**
- **Row 20 (card extension fields): BUILT — mid-review.** At my census baseline this was the one
  §5-CMT row a plugin could not use (D148's own STATUS clause: portability live, write host-fn
  "COMMITTED — a security-executor-gated addition"). During this review the write landed:
  `character.card_state` capability + `host.character.setCardData/getCardData` + persistence +
  membrane + escape-suite/int tests (commit `34fcf9184`, merged `6585aa80f`, D148 re-attested
  STATUS→LIVE `985e61ac2`). Verified on the post-merge tree (`host-v1.ts:503-507`). NOT a gap.
- **Row 31 (TTS/STT): SUBSTRATE-BLOCKED by design** — the §10 residual owner ask (engine audio
  transport + speech role); correctly not a plugin-plane item.
- Row 22 (i18n): N/A per the doc.

### §4b The §5a enablement price sheet — purchases audited

| Row | State | Receipt |
| - | - | - |
| Custom events (§5.24) | **PURCHASED + BUILT** (U8.3) | `plugin_events` capability + `pubsub.emit`/`pubsub.on` (host-v1.ts:482-483) + `substrate/plugin-event-bus.ts`; installer-scoped, forgery wall intact per the commit message |
| Per-token streaming (§5.11) | refused-by-default, standing | zero `streamDigest` hits repo-wide — as recommended ("recommend AGAINST until a concrete plugin needs it") |
| Mutating chat history (§5.13) | refused-by-default, standing | no plugin edit op on the membrane — correct |
| Runtime code loading (§5.23) | resolved INTO U8 as recommended | the sheet said "fold into U8's update-check"; U8.2a's install-time URL semantics are exactly that fold |
| Host DOM (§5.25) | permanent refusal, intact | no DOM channel exists |

### §4c The seeded example plugins — juice-exercising, not stubs

All five are substantive (68–428 lines) and drive the real membrane. Host-fn census (grepped per
bundle): `ui.register`/`setState` (Tier S + a real Tier-C `ui.js`), `ui.registerCommand`/`toast`/
`openDialog`, anchors `settings`/`chat-flank`/`tool-card`/`page`/`dialog`, `tools.register`,
`transforms.register`, `llm.quiet`, `net.fetch`, `worldInfo.upsertEntry`, `surfaceQuickReply`,
`notifications.post`, storage/variables/events. **Not exercised by any seed:** `message-footer`
badges, `chat-settings-section`, the `frame` anchor, `pubsub.*`, `macros.register`,
`transforms.registerDisplay`, `databank.ingest`, `character.ingest`, `character.setCardData`,
`applyVariableOps`, `requestTurn`, `imagery.generatePicture` — which is precisely OPEN issue **#774**
("seeded example plugins: upgrade all five bundles to exercise the full UI plane"). Note #774's title
slightly undersells the present state: affinity + oracle already exercise five of the seven anchors.

## §5 #599-PROGRAM-SCOPE rows (interaction Phase A–C census; NOT plugin-mandate gaps)

Verified BUILT: A1–A4 whole (teaching seam + D145 ledger entry; S1 band; S3 substrate; S4 both
suggestion classes incl. `suggestionRaised`/`suggestionResolved` + F4 invitations
(`substrate/suggestions.ts:176-218`, `dispatch.ts:208`) + `SPEND_ARM_TYPES` (index.ts:431) + R7
`run-rule-now.ts`); B1 (`offerChoices`, `contracts/chat/metadata.ts:282` + user-settings default);
B2 (rules section + picker + fire log + Test/Run-now — `features/automation/components/*`); B3/B4
(chip mount + suggestion cards; the dormant home automation tile is gone — zero automation hits in
`features/home`); B5 (imagery client: `imagine-slash-mount.tsx` et al.); B6 (reactions plane +
`reactionsChanged`); B8 (`rpg/verbs/roll-dice.ts` + tools); B9 (`SegmentedClock` in `@orb/ui` +
`clock-meter-surface.tsx`); B11 (`activity-context-tab.tsx` + `room-activity-log.tsx` +
`list-chat-activity.ts`); C1–C7 whole (analysis arm + `automation_rule_state`-backed guidance +
distill/audit routes with `DiffView` cards + C5 global lane + C6 recipient member + C7 plugin
client). Two rows are genuinely UNBUILT, both squarely #599's:

- **B7 — the character `react` tool (MR3–MR5).** No `react` tool exists in the one registry (the
  only first-party tools are rpg's seven — `domain/rpg/tools/index.ts`); the attach SEAM it needed
  is built (D145's `toolNames` axis — its first non-empty contributor turned out to be plugin
  tools). #599 scope.
- **B10 — saved casts (#26).** The tree's own header says so: `contracts/chat/roster.ts:73,93`
  "Roster presets/founding casts are unbuilt… saved-rosters v2 — none built today". #599 scope.

Also recorded-unbuilt BY DESIGN (flip shapes, not gaps): R5 (fire-outcome suggestion terminal), R6
(`ChatInjection.audience`), the preset-provenance columns (`preset_id`+`knobs` on `automation_rules`
— though note `update-rule.ts` EXISTS, exceeding the spec's "v1 edit = re-mint"; see §7).

## §6 FINDINGS (ranked; every one CONFIRMED this session)

**R1 — MEDIUM · §5.27's client half is missing: URL install / update check has NO UI.**
`plugin.previewFromUrl` / `installFromUrl` / `upgradeFromUrl` are built, belted (egress-guarded,
SSRF-collapsed, security-review-merged — `1edb06946`) and tRPC-exposed
(`transport/trpc/routers/plugin.ts:111-119`), but **zero client consumers exist**: ast-grep over
`packages/client/src` (541 ts + 610 tsx files scanned, planted-positive-free sweeps) and a literal
grep for `FromUrl|from-url` both return nothing; the install card is file-dropzone-only
(`plugin-install-card.tsx:32,96` — `FileDropzone`, `onFile`). Consequence: the U8 owner's test
("install a plugin from a URL with the same consent screen") is not passable, and the update-check
flow `preview-from-url.ts` documents in its own header ("the client compares the previewed `version`
against the installed one") has no client to run it. Dead-wire class (server half alive, client half
absent). Shape: a URL arm beside the dropzone on the install card (same `PluginInstallCard` consent
step — `previewFromUrl` returns the same manifest the file path stages) + a "Check for updates" row
action using `previewFromUrl` version-compare + `upgradeFromUrl`. **Quick-to-medium win** — the
consent screen and mutation plumbing all exist.

**R2 — CLOSED MID-REVIEW (was: the D148 write host-fn unbuilt).** At baseline `6c1363175` the §5.20
ability was half-built per D148's own STATUS clause. Commits `34fcf9184` + `6585aa80f` +
`985e61ac2` (all landed while this review ran; SendMessage was sent to the orchestrator when the
file changed under the census) built `character.card_state` end-to-end with membrane/escape/int
tests. Verified post-merge. **No action.**

**R3 — LOW (tracked) · The U5–U8 juice has no seeded exerciser for a third of its surface.**
\#774 (OPEN) is the recorded vehicle; §4c above enumerates exactly which host fns and anchors no
bundle drives (message-footer badges, chat-settings-section, frame, pubsub, macros.register,
registerDisplay, the ingest pair, card_state, the three spend fns). The U8 hub-browser showcase
("search → results grid → preview → import" via `ui.page` + `character.ingest` — the plan's own
flourish, `plugin-ui-plane.md` §8-U8) is likewise unbuilt as a bundle; it is the natural #774
centerpiece. **Not a new dispatch — fold the §4c census into #774's brief.**

**R4 — TRIVIAL · the optional `/vote` slash (catalogue #10).** Doc-marked "optional `/vote` slash";
not on the tree (the vote preset works via the Rules section's Run-now). One
`SlashCommandContribution` row if the owner wants the diegetic spelling. Quick juice win, genuinely
optional.

## §7 Doc-vs-tree tense notes (no completeness LIES found — three stale tenses, one undersell)

1. `plugin-ui-plane.md` §8 marks only U5 "(BUILT)" while **all nine phases** are landed — the phase
   table's build-state tense is behind the tree it governs (the corpus's own earned rule:
   "build-state claims carry a dated receipt or do not exist"). One-line-per-row doc refresh.
2. `interaction-direction-spec.md` §7-C7b still says #675/D147 + the seeded plugins are
   "branch-side pending merge… re-derive before building against them" — both are long on main
   (D147 in the ledger; seeds under `entry/boot/seed-assets/plugins/`). Self-flagged, so not a lie;
   stale.
3. Spec B2/S3 say "v1 knob-edit path: re-mint from the picker" — the tree EXCEEDS this:
   `update-rule.ts` is a full post-mint editor (scope-immutable, re-validated). The recorded-unbuilt
   provenance flip (`preset_id`+`knobs` columns) remains unbuilt as recorded.
4. Undersold juice: the D147-d DISTRIBUTION system (install/uninstall-for-all-users +
   apply-distributed + the admin Distribute section) is fully live while §5.26 still reads
   "PT (in flight)"; and #774's title implies the seeds exercise none of the UI plane when two
   bundles already drive five of seven anchors + commands/dialog/toast.

## §8 Verified clean — what my silence covers

- **Read IN FULL:** the juice doc (282 lines), `plugin-ui-plane.md` (861), `interaction-direction-spec.md`
  (643), `contracts/automation/presets.ts` regions, `contracts/plugin/manifest.ts` +
  `host-v1.ts` capability/host-fn/proxy regions, D147+D148 ledger entries, the tool-use teaching
  contribution, preview-from-url, update-rule, resolve-stream-authority, seed manifests + the
  affinity `ui.js` + anchor census of all five main.js.
- **Sweeps:** ast-grep with `--inspect summary` receipts on every absence claim (client URL-install:
  541 ts + 610 tsx scanned; `streamDigest`: repo-wide zero; `react` tool: registry enumeration);
  literal-grep second method on each.
- **Tuple/Record censuses:** `RULE_PRESET_IDS` (22), `AUTOMATION_ACTION_TYPES` (10),
  `SPEND_ARM_TYPES` (4), `NOTIFICATION_RECIPIENTS` (3) + plugin subset (2), `DOMAIN_TRIGGER_TYPES`
  (4), `PLUGIN_CAPABILITIES` (19 post-merge), `HOST_FUNCTION_CAPABILITY` (33→35 post-merge, pinned),
  `PLUGIN_SURFACE_ANCHORS` (7), `PLUGIN_NODE_KINDS` (20), `SECTION_IDS` (10, `extensions` present),
  `UI_PROXYABLE_HOST_FUNCTIONS` (9).
- **Test-reality spot-checks:** the 1314-line per-preset create→fire suite enumerated by test name
  (every catalogue row present, real-engine fires, law 3/4/6/7 pinned by behavior not by comment);
  D148's landing carries escape-suite + membrane + persistence int tests (679 insertions).
- **NOT done, deliberately:** no `pnpm check`/suite run — this census reviews no diff (main clean at
  both baselines; both tips are merged trains whose gates are the orchestrator's post-train
  single-pass), and no gate output would change a BUILT/UNBUILT verdict. No rendered probes — no
  visual claim is made anywhere above; if the orchestrator wants "the Extensions empty state teaches"
  or "the needle meter paints" verified, that is a `side-eye` pass, not asserted here.
- **Regions not read:** the full bodies of `contract/presets.ts` defs (spot-checked 6 of 22),
  `membrane.ts` (targeted reads only), the five main.js bodies beyond their host-fn/anchor census,
  the U-phase client components' internals.

## §9 Unconfirmed / low priority

- Whether the "no fetching transform can exist" warning exists as an explicit sentence anywhere a
  transform is *taught to authors* (host-v1.ts:284 implies it; I did not sweep all teaching prose).
- Whether every U-phase CT floor named in the plan's seam list exists file-for-file (I verified the
  U2 pin commit and the contract pins; I did not enumerate all CTs).
- \#774's exact scope vs my §4c census (the issue body may already carry part of it).

## §10 Proposed memory lesson (orchestrator owns the write)

- Index line: `[server verb ≠ shipped feature](url-install-verbs-without-a-client.md) — U8 URL-install landed server-only; a "phase landed" claim owes a client-consumer sweep`
- Body: A phase-slotted feature that spans the wire can merge green with only its server half — U8.2a
  landed `installFromUrl`/`previewFromUrl`/`upgradeFromUrl` fully belted and tRPC-exposed, and the
  phase read as done while zero client consumers existed (the install card stayed file-only), making
  the phase's own owner-test unpassable. **Why:** the verb suites, sweep classifications and security
  review all live server-side, so every gate a lane runs is satisfied before any UI exists.
  **How to apply:** when auditing "phase X landed" for any client-reachable feature, sweep
  `packages/client/src` (both ts AND tsx) for the proc names before crediting the row; a router
  export with zero client callers is a dead wire, not a shipped ability.

---

## Issue summary (paste-ready)

Juice/optional completeness audit (owner-commissioned, docs/reviews/stickler/2026-08-28-juice-optional-completeness.md): **the juice landed** — 15/15 juice-doc survivors BUILT (tested), 20/20 preset-catalogue rows built incl. all owner-optionals, zero graveyarded shapes re-minted, plugin-UI phases U0–U8 all on main incl. the purchased §5a plugin-event plane; the D148 card-state write closed mid-review (34fcf9184). Findings: 4 total, severity ceiling MEDIUM. Actionable: **R1 (medium)** — URL install/update-check has server verbs + procs but ZERO client consumers (install card is file-only; U8's own owner-test unpassable) → build the URL arm + "check for updates" on the existing consent/mutation plumbing; **R3 (low, tracked)** — fold the §4c un-exercised-surface census (message-footer, frame, pubsub, macros, registerDisplay, ingest pair, card_state, spend fns + the hub-browser showcase) into #774's brief; **R4 (trivial, optional)** — the doc-marked-optional `/vote` slash. B7 react-tool + B10 saved-casts are unbuilt but #599-program-scope, not plugin gaps. Doc refreshes owed: plugin-ui-plane §8 phase tenses (only U5 marked BUILT), spec §7-C7b branch-side note, §5.26/§5.27 rows.
