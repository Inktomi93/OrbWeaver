# Context-panel meta-tabs + model picker — fidelity findings (the "is it getting dirty" audit)

**Status:** findings, none fixed · **Date:** 2026-07-30 · **Scope:** chat context-panel meta tabs
(Members / This chat / Preview / Game) vs their mocks, + the Settings→Connections model-roles picker.
**Evidence:** static code recon (4 scout passes, receipts inline) + owner mock-vs-reality screenshots of
the Preview tab (2026-07-30). **Origin:** owner dogfood unease — "the app is getting dirty; menus feel
garbled; did the tabs land like their mocks?"

**Mocks of record:** `reports/design-refs/panel-redesign/all-tabs.html` (the full strip, 07-27) and
`reports/design-refs/panel-redesign/this-chat-overrides.html` (approved 07-29 — NEWER; where the two
conflict on Settings/Injections, this one wins because the CP-1 consolidation was built to it).

> **This doc is the verification target for the W-H / #1 side-eye lane.** Every finding below is
> code-derived or single-screenshot-derived and must be (re)confirmed LIVE before it's fixed or
> dismissed. Fix-all-findings discipline applies ([[side-eye-fix-all-findings]]).

---

## 0. Verification protocol — the first gate

**Run every check against vite `:5173`, never `:8788`.** The `:8788` client is a stale prebuilt and
predates the 07-29 This-chat consolidation. At least one owner sighting — "Settings mixes in this-chat
stuff, and Injections is still its own tab" — matches the PRE-consolidation client exactly and matches
the committed code not at all (receipts §2): strong stale-client suspect. First lane step: reproduce
each sighting on `:5173`; anything that vanishes there was the stale client, not a defect.

## 1. Strip-level truth (settled, not a defect)

The all-tabs mock draws a 5-slot meta strip: Members · Settings · Injections · Preview · Game.
The live strip is 3–4 slots: **Members · "This chat" · Preview(host) [· Game(rpg host)]**.

- "This chat" (internal id `settings` — legacy, type-level only) IS the deliberate merger of the old
  Appearance-overrides tab + the separate Injections meta-tab (commit `8e7a22b6`, per the approved
  this-chat mock; header comments in `chats-section.tsx:53-57` + `settings-context-tab.tsx:1-12`
  document it; Context-Panel-Program §1 CP-1). **The all-tabs mock's separate Settings/Injections tabs
  are superseded — do not "restore" them.**
- "Features (Parity Plus)" was never a tab in the mock either — it's cross-cutting design commentary
  (all-tabs l.4615). No gap.
- Every field on This-chat traces to a `chatId`-keyed mutation (setRoomOverrides / add·set·deleteChatInjection /
  setChatBackground / setGroupConfig / setToolRecurseLimit) — nothing global-scoped is homed there.
  The only "settings that aren't per-chat" surface is the app-Settings modal's Chat-behavior pane
  (user-level; zero shared code; a NAME collision, not a code overlap).
- Draft chats mirror the same sections against the draft store (`draft-context-tabs.tsx`) — no third copy.

**But the merge over-stuffed the tab:** built This-chat = 5 sections (Field overrides · Injections ·
Background · Group behavior · Tool use). The approved mock drew 3 (Field overrides · Injections ·
Background); Group behavior migrated in from the all-tabs Settings mock; **Tool use appears in no mock
at all.** One tab, five concerns is the structural root of "a whole menu got garbled together." → D-1.

## 2. Per-tab fidelity table

| Tab | Verdict | Gaps (mock → built) |
|---|---|---|
| **Preview** | **WORST — screenshot-confirmed.** Tab exists (`assembly-preview-panel.tsx`), design did not land. | Mock: stacked color-coded context-budget bar (e.g. 4,300/8,192 tok) · per-source rows with token counts + drill-in chevrons (System/GM charter · Cards · World info · Steering · Game state · History-N-turns-squashed) · monospace game-state excerpt card. Built: three plain "advisory" token rows (static/dynamic/total), one provenance line, raw system-prompt text dump. Missing: the budget-bar + source-row **UI primitives** (new primitives, D44 applies), per-source token accounting (may need server-side assembly-trace splitting — check what `assembly-preview` returns before assuming client-only), history accounting, excerpt card. |
| **This chat** | Merged per newer mock; deviations unreviewed. | (a) Injection rows: mock draws compact rows + on/off switch + kebab; built is full expanded form + Remove ("off = delete", `injections-manager.tsx` header). Keep-or-converge decision → D-2. (b) All-tabs Settings mock's "This game" group (dice-cues, beat-notifications toggles) built NOWHERE → D-3. (c) Mock Injections' "One channel" cross-link footer card absent (not fully verified). (d) 5-section overload → D-1. |
| **Members** | Built RICHER than mock (invite/kick/nominate/leave, force-turn, talkativeness). | Mock's "Veiled — host only" note relocated to the Status tab (`rpg-veiled-section.tsx` ← `rpg-status-tab.tsx`) — relocation, not loss. Verify live only. |
| **Game** | Present, host-gated, structurally matches GM-console concept. | NOT section-diffed in depth (Stat profile / Cast fields / Relationship hints / Steering note / Delivery model vs built `rpg-game-tab.tsx` + `GmConsoleScalars`) — lane must diff live. |
| **Game strip** (Status…Map) | Registered + gated correctly (7 tabs, `rpg-context-section.tsx:102-209`). | Fidelity vs each per-tab mock = the existing **W-H panel-beauty** punch list (dead space, tiny Waystone, asymmetric roster cards, duplicate orb numbers, header hierarchy, bar-color grammar) — `reports/design-refs/panel-redesign/DESIGN.md` §4.2. Owner screenshot header (no stat-ring row on a pool-less chat, thin header band) folds in here. |

No vestigial registrations found: every declared `ContextTabDef` traces to `main.tsx`'s registry; no
registered-but-dead or present-but-unregistered tab (both ends checked).

### 2a. "Crew" — dead scope leaking through comments (owner ruling 2026-07-30)

**Owner: "we are not doing crew."** There is ZERO crew code — verified: every `crew` hit in
`packages/**` is a COMMENT (`main.tsx:121,143-144`, `character-editor-surface.tsx:56,177`,
`characters-section.tsx:5-6`, `registry-contracts.ts:269-283`, several `domain/automation/**` files)
promising future crew integrations ("the crew feature grafts card-evolution review sections later,
crew 07-client-ui §4.2") or citing crew as a design "precedent." `07-client-ui §4.2` is a
`docs/architecture/proposed/chat-crew-design/` reference — marked FUTURE there, and **proposed/ is
rebuild reference, not the plan.** The contributor registries themselves are real and fine (rpg uses
them; `characterDetailContributors` ships empty). **Action:** treat crew-promising comments as
vocabulary drift — strip or reword to "contributor seam, no current second consumer" whenever their
files are next touched; never build toward them.

## 3. Model-roles picker (Settings → Connections)

One selector family only (`role-slot-row.tsx` → `model-picker.tsx` / `static-model-display.tsx`,
data via `connection.getModelsForSource`, 5-arm switch in `get-models-for-source.ts`).

- **vllm/local-light cannot garble:** no menu at all — read-only `StaticModelDisplay` of the
  server-configured engine model ("auto-fill contract", `role-slot-row.tsx:5-8`). A messy dropdown
  "on vllm" is not reproducible from committed code → stale-client / misattribution suspect (§0).
- **MP-1 — flat multi-vendor pile:** for `openrouter`/`max-pro-sub` the picker is ONE ungrouped
  `CommandGroup heading="All models"`, 50-render cap + "+N more — keep typing", only Vision/Tools
  chips. Hundreds of models, no provider grouping. Legit "garbled" reading; wants provider/vendor
  group headers (data already carries the prefix).
- **MP-2 — silent catalog-fallback swap:** `maxProSubArm` falls back to `curatedShortlistEntries()`
  when the agent-sdk catalog snapshot is cold — same flat heading, no visible marker. Menu contents
  silently differ run-to-run ([[or-catalog-cold-cache-degrades-capability]] class; D41-adjacent
  no-silent-degrade smell). Wants a "curated fallback" marker row or badge.
- Recent-models MRU group is fine. No duplicates / cross-source mixing / recent structural churn found.

## 4. Owner decisions this doc wants (D-*)

- **D-1** — This-chat depth: accept 5 sections in one tab, or split (e.g. host-ops — Background /
  Group / Tool use — behind a sub-grouping)? The mock's clean 1-concern-per-tab is gone either way;
  what's the intended IA end-state?
- **D-2** — Injection rows: keep built full-form shape (then re-draw the mock to match) or converge to
  mock's compact switch+kebab rows (then it's a build item)? "Off = delete" loses the disable-without-
  delete affordance the mock drew — that's the substantive difference, not the styling.
- **D-3** — "This game" settings group: **half-answered by owner ruling (2026-07-30): rpg-lite is a
  narrative steering device, NOT a dice roller, and takes no GM slot** — so the mock's dice-cues
  toggle is dead scope for lite. Residual question: beat-notifications only — build or drop? (It
  exists only in the all-tabs mock; nothing in code references either toggle.)
- **D-4** — Preview rebuild: greenlight the mock's budget-bar + per-source design (new ui primitives +
  possible server-side trace split)? This is the largest single gap and the one the owner
  screenshot-proved.
- (Hygiene, no decision needed: tab id `settings` vs label "This chat" — type-level rename whenever the
  registry is next touched; zero user impact.)

## 5. The lane (folds into W-H / #1)

1. `:5173` up → reproduce each §2/§3 sighting live; strike anything that was the stale client.
2. Side-eye pass per tab against its mock (side-eye carries the §12/§14 laws + this doc); **fix ALL
   findings** ([[side-eye-fix-all-findings]]), including the standing W-H §4.2 panel-beauty list.
3. D-1…D-4 go to the owner before the corresponding fixes; everything else proceeds.
4. Preview rebuild (D-4) is plausibly its own sized item (new primitives + maybe server trace work) —
   don't let it hide inside "polish."
