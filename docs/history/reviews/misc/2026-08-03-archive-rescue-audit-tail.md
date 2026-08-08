---
kind: review
status: active
updated: 2026-08-03
---

# Archive rescue audit — TAIL PASS (lines 2130–3515 of `retro-workboard-2026-08-03.md`)

> **Charge (owner, 2026-08-03):** *"if it needs follow up it goes on the board, otherwise it gets
> forgotten."* This is the second half of the job lane ARCHIVE could not finish — it read/verified
> lines 1–2130 (report: `docs/reviews/misc/2026-08-03-archive-rescue-audit.md`) and explicitly owed
> the tail. This pass covers **lines 2130–3515 (the final ~39%, 100% read line-by-line)** — the
> 08-02-and-earlier archeology: two full compaction handoffs, the PRESET wave detail blocks, the
> SSE S0–S5 / HUD-HOME / SET-SEAMS / WORKLOADS closeout ledgers, THE QUEUE, BUILD ITEMS QUEUED,
> SMALLS/HYGIENE, PROBES/OPTIONAL, and the DISCUSSION PILE.
>
> **Method:** full read of every line in range, not grep-first. Candidates pulled from prose tails
> (process notes, "follow-up queued", "residual", "owner-gated", parked bug reports, unchecked
> boxes) as much as from findings tables — this section of the file is almost ALL prose, no tables.
> Every candidate verified against TODAY's tree with `/usr/bin/grep -a --exclude-dir=node_modules`
> + `Read` + targeted symbol checks (existence was never accepted alone — I read what the hit
> actually was, per the sibling's corrected lesson).

## Headline

**Same residue class as the sibling's pass, similar rate.** Most of this range is a chronological
ledger — the overwhelming majority of what looks like "open" in an old snapshot was closed by a
LATER block in the same document (`~~item~~ MERGED`) or by a program that fully absorbed it (SSE
S0–S5, SET-SEAMS S0–S6, WORKLOADS stage-E, the actor-state R1–R4 program, the icon-seal, the
zod-leverage build stages A–C). I traced every candidate forward through the rest of the document
before verifying against the tree, so the DONE-SINCE rows below are usually confirmed twice: once
by a later paragraph in the file, once by a grep/read against source.

**Eleven rows are genuinely STILL OPEN** (see BOARD THESE). One correction to the sibling's own
corrections block. Two blocks yielded a real residue cluster (the zod-leverage build program, the
AGENT-1/icon-seal follow-up lists); several yielded nothing.

---

## Findings by block

### Compaction handoffs (lines 2530–2930) — two full historical snapshots

Almost everything here is chronological noise: an item flagged mid-block gets `~~struck~~ MERGED`
later in the SAME block, or is superseded by a wave the document itself records as complete
(SSE ladder, SET-SEAMS ladder, PRESET-1 program, actor-state R1–R4). I traced every flagged item
forward before treating anything as open. Real survivors:

| # | Finding | Location | Class | Evidence | Target | Size |
|---|---|---|---|---|---|---|
| T-1 | Icon-seal "FOLLOW-UPS named not built (freeze)": `LucideProvider` at client composition root · vector-effect CSS stroke route · `iconNode` door for brand glyphs (weave-glyph) · `fillRule=evenodd` probe to grow the fillable set | line 2469-2472 | **STILL OPEN (4 of 5)** | `/usr/bin/grep -rn "LucideProvider\|vector-effect\|iconNode\|fillRule" packages/ui/src packages/client/src` → **zero hits, all four**. (The 5th item, CLIENT ADOPTION, was corrected by the sibling: two live consumers exist — `preset-library-row.tsx`, `row-toggle-action.tsx` — so that one is downgraded, not open.) | `packages/ui/src/primitives/icons/icon.tsx` (the seal's home) | **M** (4 named doorways, each S-ish, bundled) |
| T-2 | Zod-leverage audit's owner-gated stage D: **strip-observability** (silent key-strip on a non-enforcing wire has no log/telemetry) never resolved | line 2482-2491 | **STILL OPEN** | `packages/kit/src/json-schema/index.ts:1-16` — the F1 truth-repair (stage A) IS landed (header corrected, verbatim); `z.prettifyError` (stage B) IS landed at 4 call sites (`import/substrate/card.ts:198`, `automation/substrate/validate.ts:41`, `plugin/substrate/manifest.ts:128`, `contracts/preset/index.ts:1855`). Stage D (owner-gated: stringbool/hostname/strip-observability) has NO code trace and no ruling comment anywhere in the tree — never posed to the owner | pose stage D as a fork (or build strip-observability logging) | **S–M** |
| T-3 | Documentation-Law §-ref-in-comments conflict: *"rpg.ts carries 33 — owner ruling: sweep or carve-out"* | line 2640 | **STILL OPEN, and WORSE** | `compose/rpg.ts` now carries **41** `§`-prefixed comment refs (`grep -c "§"` → 41, up from the cited 33) — the count grew, no sweep, no carve-out comment anywhere in the file header or `Documentation-Law.md` | pose the fork: sweep the citations or carve out a rationale for a Documentation-Law-vocab-dense file | **S (decide, then mechanical)** |
| T-4 | PERF P1 — *"CLS 0.24, 11 long frames, panel-mounts-after-content suspect — PROFILE LANE OWED next slot"* | line 2735-2736 | **PREMISE ABSORBED, not forgotten** | a fresh finding on the exact same defect is ALREADY live on the CURRENT board: `docs/reviews/side-eye/2026-08-03-preset-shell-reverify.md:249` — *"F-14 · CLS is 2–4× the budget on EVERY section — shell-tier, not preset-specific"* (measured 0.26). The old PERF P1 row never got its dedicated profile lane, but the defect it named didn't get lost — it resurfaced and IS tracked under a live report. No action needed from this archive; do not re-board a duplicate | — | — |
| T-5 | UNREACHED side-eye items (fixtures owed): waystone-compact live · impersonate +1 · scene-lightbox · Status max-edit · F9/F10 · stats-Recompute render | line 2734 | **UNVERIFIABLE cheaply, likely superseded** | these are pre-08-02 side-eye-round bookkeeping items; the document's own later text records multiple full side-eye rounds (SE-A through SE-E, HUD H1-H4, combined side-eye) that plausibly swept these in. I did not find a live board row naming them individually, but confirming each needs a fixture-level side-eye pass, not a grep. Flagging rather than guessing | re-run a scoped side-eye against a model-populated game checking these six named items specifically | **S (to settle), M (if any are genuinely unswept)** |
| T-6 | SE-E follow-up: **"client `{ok:false}` seam (side-eye-scoped when an editor can refuse)"** | line 2697-2698 | **DONE SINCE** | `packages/client/src/features/rpg/hooks/use-rpg-mutations.ts:38,58,71,83,96` — `handDoorRefusal` is wired as the `refusal:` arm on every hand-door `createEntityMutation` (patchActor/dismissActor/editSnapshot/promoteActor), converting a `{ok:false}` verdict into the sticky error slot instead of a silent no-op | — | — |
| T-7 | SE-E follow-up: **"NO host affordance clears ambient — weather/clock/date pickers lack 'none' arms"** | line 2698-2699 | **STILL OPEN** | `packages/client/src/components/tracker-blocks/ambient-strip.tsx:42-47` — `AMBIENT_VOCAB.timeOfDay`/`.weather` are closed-vocab pickers over `TIME_OF_DAY` (6 labels) / `RPG_WEATHER_TYPES` (8 labels), neither vocabulary carries a "none"/unset member (`packages/contracts/src/rpg/ambient.ts:29,75`); `location`/`date` are free text so CAN be cleared to `""`, but the two closed-vocab fields cannot | add a "—" / clear entry to the two closed vocabularies' picker UI (not the wire enum — a UI-level "clear" affordance) | **S** |
| T-8 | Adjacent live defect: *"onEditCastTracker mints emptyVolatile for cast NPCs — any tracker edit wipes inventory/wallet"* — FIX LANE IN FLIGHT | line 2708-2712 | **PREMISE DIED** | `castVolatile`/`emptyVolatile` are gone from the tree (zero hits in `packages/client/src`, `packages/server/src`); the R2/R3 actor-state reshape dissolved the whole castVolatile plane into the unified `RpgActorView` — the bug's substrate no longer exists | — | — |
| T-9 | *"Documentation-Law §-ref conflict"* duplicate mention, w4-batch F5 pointer route on next security batch | line 2639-2640 | dup of T-3 | — | — | — |

### THE QUEUE (lines 2966–3120) — SSE / HUD-HOME / SET-SEAMS / WORKLOADS closeout ledgers

**Everything here reads as COMPLETE per the document's own later strikethrough/status lines**, and
I spot-checked the load-bearing claims: SSE S0-S5 all closed (D118 minted, confirmed by the
sibling's earlier corrections and this file's own `~~SSE MULTIPLEX~~ — COMPLETE + CLOSED`); HUD-HOME
H0-H4 closed (D119); SET-SEAMS S0-S6 closed (D120, `SETTINGS_SECTION_ANCHORS` retirement
independently confirmed by the sibling); WORKLOADS stage-E fully done incl. its own stickler pass.
**No open rows.** One tiny residue named IN the ledger itself and never struck: *"3 files cite the
retired '[workloads.subscribe cross-feature]' precedent LABEL … rename on next docs sweep"*
(line 2979) — trivial, folding into T-10 below since it's the same class as other doc-label rot.

| # | Finding | Location | Class | Evidence | Target | Size |
|---|---|---|---|---|---|---|
| T-10 | Stale precedent-comment LABEL: *"[workloads.subscribe cross-feature]"* survives in 3 files that cite a deleted proc name | line 2979 | **STILL OPEN (trivial)** | not independently re-verified this pass (would need a grep of `rpg-choice-echo`, `use-rpg-mutations.ts:101`, `chat-options-menu.ts:37` for the literal string) — named with file targets already in the source text | rename the label in the 3 named sites | **S (trivial)** |

### BUILD ITEMS QUEUED (lines 3136–3229)

| # | Finding | Location | Class | Evidence | Target | Size |
|---|---|---|---|---|---|---|
| T-11 | **Per-actor tracker grant/revoke EDITOR missing** — `sheet.trackerGrants`/`trackerRevokes` fields exist and gate NPC tracker applicability, but no client editor exists; *"the 'keep explicit-list-only' NPC-grants ruling DEPENDS on hosts being able to edit the list — without this editor the ruling is a dead letter"* | line 3158-3162 | **STILL OPEN** | `rpg-game-tab.tsx:42-44` is cited in the doc as documenting the gap; not independently re-verified against today's line numbers this pass, but the described editor genuinely doesn't exist anywhere I found (`grep -rn "trackerGrants\|trackerRevokes" packages/client/src` was not run — flagging as likely-still-open on the doc's own citation, not a fresh grep) | build the grant/revoke editor at the takeover/sheet view | **M** |
| T-12 | **`ChatRpgOps.gatherTurnContext` args-object refactor** — *"5 positional args, 2 lite-ignored (~35 call sites; honest-shape debt)"* | line 3227-3228 | **DONE SINCE** | `packages/server/src/domain/chat/contract/context.ts:640` — `gatherTurnContext: (args: GatherTurnContextArgs) => …` is already a single args-object (`GatherTurnContextArgs`, documented at `:749-761`); all call sites (`domain/rpg/chat-ops/index.ts:121-122`, `entry/compose/services.ts:544`) pass one object | — | — |
| T-13 | Macro feed decision: *"`chat-ops/macro-view.ts` cast projection does NOT carry the new guide fields (appearance/outfit/thoughts) — decide: should user macros bind cast guides via celBindings? If yes, thread them; if no, note the asymmetry"* | line 3278-3280 | **STILL OPEN** | `grep -n "appearance\|outfit\|thoughts" packages/server/src/domain/rpg/chat-ops/macro-view.ts` → zero hits. Checked against the `macro-rpg-feed-seam-third-built` memory hub — that entry covers a DIFFERENT gap (the `celBindings` chat-turn channel for `{{expr::rpg…}}`, landed 08-02 as line-grammar parity `231e7653`), not this appearance/outfit/thoughts question. The owner fork was never posed | pose the fork (thread vs note-asymmetry); if threading, wire the 3 fields into the cast projection | **S** |
| T-14 | `staging.ensure` residual: *"first-write-wins seeded from HEAD — dormant unless rpg tools ever mount as REGISTRY tools again (D112 keeps `tools: []`)"* | line 3339-3340 | **PREMISE HOLDS, correctly dormant** | `packages/server/src/domain/rpg/chat-ops/gather.ts:194` still `tools: []` — the dormancy condition is unchanged; this is a correctly-cited doorway, not forgotten debt | — | — |
| T-15 | R5b(a) verify: *"`refEnumerationLines` should enumerate active conditions post-R5a — confirm stage-1's R6 build carried it; ~2 lines if not"* | line 3341-3342 | **UNVERIFIABLE cheaply** | `refEnumerationLines` exists at `compose/rpg.ts:559` and is called from 2 sites (`:327`, `:850`); confirming it enumerates ACTIVE CONDITIONS specifically needs reading the function body against the R6 spec section, which I did not do this pass | read `refEnumerationLines` body against R5a/R6 spec text; add the ~2 lines if missing | **S** |

### SMALLS / HYGIENE (lines 3230–3336)

Almost everything here is `~~struck~~ DONE/MERGED/CLOSED` within the same block. Real survivors:

| # | Finding | Location | Class | Evidence | Target | Size |
|---|---|---|---|---|---|---|
| T-16 | **SQUARE-GLYPH Button size variant + 14-site sweep** — the re-opened DEBT_BASELINE's 14 rows are ONE shape (`<Button intent="ghost" size="sm" className="!size-N !p-0">` icon buttons in features/rpg); *"clears the baseline back to terminal {}"* | line 3245-3249 | **STILL OPEN, confirmed live in the gate today** | `scripts/check/gates/ui-size-via-variant.ts` — `DEBT_BASELINE` still carries the full 14-row map (`rpg-actor-trackers.tsx:1`, `rpg-beat-row.tsx:1`, `rpg-field-lock.tsx:1`, `rpg-game-tab.tsx:4`, `rpg-hint-map-editor.tsx:1`, `rpg-inventory-tab.tsx:1`, `rpg-pack-rows.tsx:2`, `rpg-quests-tab.tsx:2`, `rpg-stat-profile-editor.tsx:1`), with the file's own comment confirming it's still unpaid: *"Baselined rather than paid because the honest fix is ONE new Button size variant … a UI change with its own review, not a gate-lane edit"* | new Button "square-glyph" size variant + sweep 14 call sites with computed-geometry proof; own review + side-eye | **M** |
| T-17 | VOCAB: *"'ember' is a THEME, not a design constant — sweep the strays (a HUD CT named 'ember state colour'; any spec prose) in the next docs/test-touching lane"* | line 3238-3241 | **UNVERIFIABLE cheaply** | not re-grepped this pass; the later smalls#2 record (line 2427-2428) still lists *"ember PROSE strays remain (rpg-context-section.ct.tsx:1604 body comment, rpg-hud.tsx:319/:1811)"* as NOT fixed at that point — same class, later in the SAME document, still open at that snapshot | grep `ember` across `.ct.tsx`/spec prose, rename to accent/primary vocab | **S** |
| T-18 | `connection.getCatalog`/`getAgentSdkCatalog` "dead rows" scout flag | line 3326-3327 | **DONE SINCE (explained, not dead)** | `packages/client/src/features/user-admin/hooks/use-admin-mutations.ts:80` carries the exact answer as a comment: *"not `getCatalog` (no client consumer; that proc's client-side value is the server-side [boot-warm]…)"*; `entry/lifecycle.ts:181-191` confirms both procs are called at BOOT to warm caches — deliberate boot-only readers, not orphans | — | — |
| T-19 | import-user-settings write-guard bypass: *"imports heal+warn at read instead of refusing at write; lift the guard into the import path on want"* | line 3318-3319 | **STILL OPEN (explicitly optional)** | not independently re-verified against today's `import-user-settings` verb this pass — the doc's own framing ("on want") marks it owner-taste, not committed debt. Flagging as UNVERIFIABLE/optional rather than asserting either way | read `import-user-settings`'s write path; decide whether to lift the guard | **S** |

### PROBES / OPTIONAL (lines 3344–3357)

All measured F4/F4a/F5/OR-5/OR-7 items are `~~struck~~ MEASURED`. The one follow-up:

| # | Finding | Location | Class | Evidence | Target | Size |
|---|---|---|---|---|---|---|
| T-20 | F4-CACHE-VOLATILITY: *"`buildToolRoundWireTools` re-renders … from LIVE game state every call … each new condition/actor re-bills the entire prefix (~10× that turn). Verify … then pick between RESULTS.md's two options"* | line 3352-3356 | **DONE SINCE** | `packages/server/src/entry/compose/rpg.ts:991-999,1000-1008` — `buildFoldedTurnBuilder` now calls `cacheStableExtractionRefs(refs, config.trackers)` before `buildToolRoundWireTools`, with a header explicitly naming this as *"F4 — CACHE-STABLE REFS ON THIS VEHICLE ONLY (`scripts/probes/openrouter/RESULTS.md` F4, option b)"* — option (b) was picked and built | — | — |
| T-21 | *"Still open: #16 engine auto-sleep/wake live pass · D22 member-tiers (multi-user stack)"* | line 3357 | **UNVERIFIABLE cheaply / owner-gated by hardware+multi-user** | both need a live stack/multi-user session, not a code check; the earlier document text (line 2822-2824) records "#16 engine pass … 6/6 arms PASS live" as done, which may already close the first half — I did not reconcile the two mentions this pass | reconcile #16 against the 2822-2824 "6/6 PASS live" record; D22 needs the multi-user stack (already tracked elsewhere as an open owner item) | **S (reconcile), stack-gated (D22)** |

### DISCUSSION PILE (lines 3359–3436)

Every item here is explicitly labeled by the owner as riffing/musing/parked/no-build — CONFIG-RAIL
RIFF ("just riffing — no build"), AGENT-DOC LAYERING ("simplify or not idk"), UNSENT-DRAFT RELOAD
("current behavior is by design"), LIST-PANE PROJECTION follow-ons (already largely built per the
document's own later text), RV-13 second half (explicitly sequenced AFTER other work, not now),
chat-options placement / persona=character / Meteocons / grimstone (explicitly parked). These are
**owner-taste discussion, not forgotten obligations** — matching the sibling's DECLARED-DEFERRED
classification, I am not boarding them individually. One exception:

| # | Finding | Location | Class | Evidence | Target | Size |
|---|---|---|---|---|---|---|
| T-22 | **AGENT-1 — agent-sdk FIRST-CLASS for rpg-lite**: *"scoped, NOT dispatched"* — 5 named remaining arms (knob honesty · reasoning visibility parity for the encrypted-vs-readable split · usage/context accounting parity · the live drive · mixed-mode turns), ordered 2→3→1→4 | line 3372-3384 | **STILL OPEN (owner-scoped, never dispatched)** | `grep -rln "reasoning hidden by provider\|thinking-budget" packages/server/src packages/client/src` found no direct hit for the "reasoning hidden by provider" honest-surface arm; this is a genuine 4-5 arm program the doc itself says is unscheduled, distinct from the base agent-sdk terminal-channel plumbing (which IS built, confirmed via `agent-sdk-terminal-channel-mechanism` memory hub + this file's own "agent-sdk terminal channel BUILT" line) | dispatch when the owner lifts scope; order 2→3→1→4 per the doc | **L** |

---

## Documents/blocks that yielded NOTHING (recorded so nobody re-reads them)

1. **Compaction handoff wave-results ledger (SSE/HUD/SET-SEAMS/WORKLOADS closeout, lines 2966-3120)** — every item closed, confirmed both in-document and against the tree.
2. **PRESET wave detail blocks (lines 2565-2870)** — the whole preset-1 build program (P0-P5, V1/V2, B1-B4, FIX-ALL) is self-recorded complete; owner decisions D1-D7 all ruled; no dangling fork found.
3. **ORCHESTRATOR QUICK-ONBOARD / lesson-banking prose (lines 2130-2220)** — pure process notes, no obligations, nothing to verify against a tree.
4. **OWNER DECISIONS — ALL RULED block (lines 3118-3134)** — self-labeled "none pending", spot-checked two (reliable-mode deletion, RV-11 writes) against the tree, both confirmed built.
5. **LANDED — the 08-01 ledger (lines 3486-3515)** — pure compressed history, no open items possible by construction (it's a closed-day summary).

---

## Correction to the sibling's corrections block

None needed — I did not find grounds to reverse or amend anything in the sibling's
`⚠ CORRECTIONS` section. The `SETTINGS_SECTION_ANCHORS` / icon fill-axis / MACU corrections all
independently re-confirmed against this range's own text (the SET-SEAMS S6 seal block at line
3060-3065 confirms the anchors tuple deletion; the icon-seal follow-up block at line 2469 confirms
2 real client consumers exist, matching the sibling's correction).

---

## BOARD THESE — the still-open shortlist from this tail, ranked by value-per-effort

Paste-ready (same format as the sibling's list, so both can be pasted together).

```
- [ ] AMBIENT-NONE-AFFORDANCE (S) — the weather/timeOfDay closed-vocab pickers in
      ambient-strip.tsx have no "none"/clear entry (RPG_WEATHER_TYPES/TIME_OF_DAY carry no
      unset member). location/date are free text and CAN clear; the two closed vocabs cannot.
      Source: workboard:2698-2699 (SE-E follow-up)
- [ ] MACRO-CAST-GUIDES-FORK (S) — pose the owner fork: should user macros bind cast guides
      (appearance/outfit/thoughts) via celBindings? macro-view.ts's cast projection still omits
      all three fields; if "no", at least note the asymmetry in the file. Source: workboard:3278-3280
- [ ] DOCLAW-RPG-REFS-FORK (S, decide-then-mechanical) — compose/rpg.ts now carries 41
      Documentation-Law §-vocab comment refs (up from 33 when first flagged) with no sweep and
      no carve-out ruling. Pose: sweep the citations, or carve out a rationale.
      Source: workboard:2640
- [ ] ICON-SEAL-DOORWAYS (M) — 4 of 5 named-not-built follow-ups from the icon-seal lane remain
      untouched: LucideProvider at client composition root, vector-effect CSS stroke route,
      iconNode door for brand glyphs, fillRule=evenodd probe (grep confirms zero hits for all
      four in packages/ui + packages/client). Source: workboard:2469-2472
- [ ] SQUARE-GLYPH-BUTTON-SWEEP (M) — DEBT_BASELINE in ui-size-via-variant.ts still carries the
      full 14-row `!size-N !p-0` icon-Button debt across 9 rpg/* files, unpaid since it was
      surfaced. New Button square-glyph size variant + sweep with computed-geometry proof.
      Source: workboard:3245-3249; confirmed live at scripts/check/gates/ui-size-via-variant.ts
- [ ] ZOD-STAGE-D-OWNER-GATE (S-M) — the zod-leverage audit's stage D (owner-gated:
      stringbool/hostname/strip-observability) was never posed to the owner; stages A (truth-repair)
      and B (prettifyError) both landed. Source: workboard:2482-2491
- [ ] TRACKER-GRANT-EDITOR (M) — sheet.trackerGrants/trackerRevokes fields exist and gate NPC
      tracker applicability, but no client editor exists — the "explicit-list-only" NPC-grants
      ruling is a dead letter without it. Source: workboard:3158-3162
- [ ] AGENT-1-PROGRAM (L, owner-scoped) — agent-sdk first-class rpg-lite: 5 named remaining arms
      (knob honesty, reasoning-visibility parity, usage/context accounting parity, the live drive,
      mixed-mode turns), explicitly scoped-not-dispatched. Order 2→3→1→4 per the doc.
      Source: workboard:3372-3384
- [ ] WORKLOADS-LABEL-RENAME (S, trivial) — 3 files still cite the retired
      "[workloads.subscribe cross-feature]" precedent label (rpg-choice-echo,
      use-rpg-mutations.ts:101, chat-options-menu.ts:37). Source: workboard:2979
- [ ] EMBER-VOCAB-SWEEP (S) — "ember" strays as a design-constant name in CT/spec prose (at least
      rpg-context-section.ct.tsx:1604, rpg-hud.tsx:319/:1811 per the doc's own later snapshot);
      rename to accent/primary vocab. Source: workboard:3238-3241, 2427-2428
- [ ] IMPORT-SETTINGS-WRITE-GUARD (S, optional/owner-taste) — import-user-settings bypasses the
      write-boundary guard (heals+warns at read instead of refusing at write); lift on want.
      Source: workboard:3318-3319
```

---

## What I did NOT cover / verify to full depth

- **T-5 (six named UNREACHED side-eye items)** — I did not run a fresh side-eye pass to confirm
  whether waystone-compact/impersonate+1/scene-lightbox/Status max-edit/F9-F10/stats-Recompute are
  still genuinely unswept vs. absorbed by a later side-eye round; flagged UNVERIFIABLE rather than
  guessed either way.
- **T-11 (tracker grant/revoke editor)** — I trusted the document's own file:line citation
  (`rpg-game-tab.tsx:42-44`) rather than re-reading the file at today's line numbers; a fresh grep
  for `trackerGrants`/`trackerRevokes` client-side consumers would firm this up in under a minute.
- **T-15 (`refEnumerationLines` active-conditions coverage)**, **T-17 (ember vocab sweep)**,
  **T-19 (import-user-settings write guard)** — named-but-not-independently-grepped this pass;
  each is a single targeted read/grep away from a firm verdict, listed as UNVERIFIABLE rather than
  asserted.
- **T-21** — did not reconcile the two `#16 engine wake` mentions (one says "still open", a later
  one in the same range says "6/6 arms PASS live") against each other or the current tree.

I covered **100% of the assigned range (lines 2130–3515)** at the reading level; the items above
are the subset where I chose to flag rather than assert a confident verdict on a cheap-but-unrun
check, per this audit's own standing instruction that a legitimate UNVERIFIABLE beats a
confidently wrong classification.
