# Retro Workboard — the live board

> **THIS IS THE WORKING DOC** (owner-stated 2026-07-25). Not law, not a deliverable — the durable
> state + work log an orchestrator resumes from cold. Authority for LAW = `docs/architecture/core/**`;
> `docs/architecture/proposed/**` is pre-rollback REBUILD REFERENCE (never cite its status as
> current). **Rewritten clean 2026-07-26 at owner direction** ("rewrite the whole doc") — the prior
> 2,300 lines of session layers live in this file's git history; their load-bearing content was
> promoted to commits, memories, law docs, and the sections below. Keep this file CURRENT-STATE ONLY:
> when a block goes stale, rewrite it — never stack a new layer on top.

## ═══ WHY RETRO EXISTS (read `shitsfucked` in the repo root — the post-mortem) ═══

Main's own ledger, verbatim: *"We are tired of hunting down invisible bugs. **Everything must be
proven.**"* Its two entries: (1) the SSE bus **dropped `turnCompleted`** so `MessageListSurface`
never refetched and the composer **locked forever** — caused by an RPG query storm making React
unmount/remount the SSE subscription; (2) the multi-speaker engine **threw the characters away** so
only the synthetic "Group" character spoke. **Both are the same disease: features that looked done
and silently weren't.** That class keeps being found (the knob-wire audit; the sortable "flake" that
was a real a11y defect) — "drive it live, then pin it" is the posture, not paranoia. Judge every
finding against that frame.

## ═══ ▶ NOW (2026-07-26) ═══

**Active program: LITE-RPG + GUIDED** (owner scope rulings, all final: built FRESH for this tree —
NO porting from legacy-main; NO full rpg mode, NO crew; but the shared spine is FULL-SHAPED so full
mode later only ever ADDS — the graft-map discipline).

**Build law: [`reports/lite-plus-guided-substrate-spec.md`](../reports/lite-plus-guided-substrate-spec.md)**
(committed, owner-RATIFIED; change-log at top). The ratification rulings folded into it:

1. **Total swipe-rewind** — everything the context panel renders is swipe-consistent. Quests live
   IN `rpg_snapshots`; journal is variant-aware (model entries variantId-stamped CASCADE, hand
   entries NULL = every-lineage, reads project the selected chain); a swipe writes NOTHING
   server-side (`variantSelected` → one refetch re-resolves the whole panel).
2. **Preset override is a wired KNOB from birth** (`rpg_games.gmPresetId` FK, NULL = augment the
   user's preset — the default). The spec's §4.11 posture sweep: 8 hardcoded postures found, 2 ship
   as knobs, 6 argued no-knob with recorded upgrade doorways.
3. **Wallet + inventory FIRST-CLASS stored** on every actor ("lite is a steering posture, NOT a
   reduced data model" — the surviving purge-era ruling; the CP money question is closed).
4. **Lite HAS quests + journal as DATA PLANES, not engines** ("just structured output that gets
   generated and can help steer the plot"). The engine set stays out: encounters, session-wrap,
   map (MA-3), d20 checks, GM seat. `rpg_sheets` NOT `rpg_party` (the no-party ruling made schema);
   `rpg_games` is a real table + `chats.metadata.rpg` is an opaque `{gameId}` sync pointer; 6 lite
   tables. D86 re-mints verbatim at land; the carve rulings mint D108+; the spec §5 records the
   CP-doc amendments to apply at land (lite's tab roster gains Quests + Journal).

**✅ W0 LANDED — committed in the same commit as this board update** (spec §6.1 in full:
`@orb/contracts/rpg` 11 concern files + barrel [bus.ts PARKED — see below] · `db/schema/rpg.ts` 6
tables born whole, D23-clean, all CASCADEs/CHECKs int-proven · the baseline regen [71→77,
verifier-diffed PURE INSERTION] · `chats.metadata.rpg` pointer + heal + ChatDetail projection ·
kit id brands · 78 tests). Verifier: CONFIRMED incl. a fresh-build honesty audit vs legacy-main
(no porting — deliberate divergences applied). Wave notes for W1:
· **bus.ts is PARKED until W1c** (G11 refused a bus contract without its belt set — the
  shitsfucked gate doing its job; the barrel carries the PARKED note; W1c re-lands the union WITH
  the coverage gate + stream-hook map).
· **Spec erratum for the D108 mint:** quest ids are `RpgQuestId` (prefix-less branded nanoid, no
  ID_PREFIX entry, stays in-blob) — the no-raw-id gate overruled the spec's "plain string".
· **seed:demo rpg content rides W1** (the seeder writes only through domain verbs — none exist
  until W1b).

**═══ SESSION HANDOFF (2026-07-26 — owner swapped accounts, weekly usage exhausted) ═══**
The closing commit rode SCOPED verification + the pre-commit full static check (the last FULL
battery — vitest 7428/0 · CT 1453/0 · zero flakes — predates only the three small W0 reconcile
fixes, themselves scoped-green). **The next session's first acts, in order:** ① one confirming
full battery (`pnpm check` + `pnpm test`, read the artifacts) ② dispatch **W1a**
(persistence + staging accumulator + locks merge per spec §6.1/§6.2 — the swipe-rewind machinery;
the ratification pin [total swipe-consistency] is ITS test matrix) ③ then W1b → W1c → W2 → W3 per
the NOW block above. Everything needed is: this board + the ratified spec + the memories — zero
context assumed.

**Wave sequence after W0:** W1a persistence+staging+locks → W1b verbs+gather+ChatRpgOps+
`setRpgPointer` → W1c tools+bus+compose (the composed-real int test is the proof) → W2 transport
(EVERY proc cross-tenant-sweep PROBED) → W3 the CP-4 lite takeover client — owned by the
Context-Panel program ([`docs/architecture/Context-Panel-Program.md`](architecture/Context-Panel-Program.md)),
mockup-first against `reports/design-refs/rpg-shell-mockup-v2.html` (owner: NO new mockup — a
state v2 lacks = a one-crop addendum, never a v3), side-eye AFTER convergence. Test obligations =
spec §6.2 (the swipe-consistency matrix is the ratification pin); ledger deltas ride the
COMPLETING wave.

**Already landed for this program:** the CP-3 tracker block kit — commit `afb3d383` — seven blocks
(`client/src/components/tracker-blocks/`, editable-in-place is the DEFAULT posture, read-only arm =
honest-arms), TrackBar/RingGauge in `charts/meter` (the OLD sealed Meter pair carries the OPPOSITE
role="meter" a11y model — co-homed so the tension stays visible; never mix), the D71
`--color-track-1..6` ramp, 28 CTs, committed mockup-convergence receipts (`reports/snaps/tracker-kit-*`).

## ═══ THE LOOP (standing law) ═══

Lane verifies SCOPED (its tests + per-package tsc + biome on its files; whole-tree gates are
BANNED in lanes) → the orchestrator runs `pnpm check` + `pnpm test` on the QUIESCED tree and READS
the artifacts (`reports/verify.json` · `test-report.json` · `ct-report.json` · `ct-flaky.json` —
exit codes lie) → a fresh-context `verifier` on any non-trivial diff (its brief MUST ban
check-gates.int / check:structure while the battery runs — the `__g_` fixture collision;
[shared-tree-contention-protocol] rule 10) → findings route back to the WARM lane → commit on
green → next wave. Commit messages end with the Co-Authored-By trailer. **Commit-only; NEVER push;
never ask about pushing.**

## ═══ STANDING FACTS & ENVIRONMENT ═══

- Stack UP: server :8788 · vite :5173, single-user auto-authed as the owner. vLLM engines LAZY by
  owner ruling (2026-07-26, "we don't need to turn the engine on if you don't need it") — no
  proactive warm-up; never hand-run engine launchers; supervised `bash scripts/dev/stack.sh
  restart` is the legal path.
- **The next stack restart RESETS `data/orbweaver.db` by design** (two baseline squashes on
  2026-07-26; pre-launch law in `entry/boot/migrate.ts`; boot backs up first + Backrest behind it).
  Contents are re-seedable fixtures.
- **Baseline-regen procedure** (proven 3×; owed by ANY change that moves a derived column DEFAULT —
  e.g. every USER_SETTINGS/APP_SETTINGS version bump with a column derivation): backup → rm
  `packages/db/src/migrations/0000_baseline.sql` + `meta/0000_snapshot.json` → `_journal.json` to
  empty entries → `cd packages/db && npx drizzle-kit generate --name baseline` → biome-format the
  two meta JSONs FROM REPO ROOT → scoped `npx vitest run tests/tooling/schema-baseline-parity.int.test.ts`.
  Quiesced tree only.
- Variant-cache keys were reshaped (`…-q<quality>.webp`): pre-existing cached image variants orphan
  once on demand — cosmetic regen churn, no action.
- `scripts/dev/multi-user-fixture.sh` SHARES the live ports — `snap --contexts` refuses with the
  up-remedy when it's down; the live stack itself is single-user with no login door.
- snap drives: `--goto settings:<cat>` / section ids / `modal:<slot>`; the settings nav is a
  scrolling `role=navigation` Stack — probe its innerText, never trust one viewport screenshot.

## ═══ LEDGERS ═══

### Flakes

- code-editor:192 — 1 strike, the CM6 internal-readiness class; remedy on 2nd strike: re-press
  poll (harmless re-Enter on an open tooltip).
- chart.ct:29 — NEW 1st-striker 2026-07-26 (retry-pass); watch.
- HELD after root-fix: swipe-strip:122 · file-dropzone:86 (both = the first-keypress-after-mount
  class, memory [native-file-input-first-enter-drop]) · sortable:79 (was a real PRODUCT a11y
  defect, fixed at the primitive — [sortable-keyboard-focus-monitor]) · message-list:309 · lightbox.

### Facelift (UGLY — accrues here; a dedicated pass ships it)

- Admin-pane density → bring up to the Chat-behavior craft bar (side-eye's "single biggest
  opportunity": description size + vertical rhythm).
- Section-level Save button needs a grouping spacer (reads as the last row's control).
- Autosave "Saved · Synced" status line floats between sections (orphaned placement).
- The tool-use description column is cramped in the narrow context panel (~180px, 6 lines).
- +/- steppers are 28px (sub-44 touch target; desktop-primary so low).
- Solo add-character double-popper stacking; Members-tab underfill (acknowledged until Trackers).
- @orb/ui Toggle pressed-state fill ΔL≈0.03 off its container (fix at the primitive) — pre-noted.

### Queued (after the rpg program, or at natural gaps)

- **Workloads junk-drawer exit, stages A–E — VERY LAST** (owner order stands). Design ACCEPTED:
  `reports/stickler/2026-07-25-workloads-junk-drawer-exit.md`; its two standalone product defects
  (global concurrency=1 head-blocking · silent poison-row drop) are PARKED WITH the program.
- BG-V live drive (video-background side-eye; needs a seeded video asset post-reset).
- Rebuild-gate verifications BEFORE buddy returns: capability cell-keying (source×api) ·
  AgentTurnRequest scalar-plucking · roles/agent.ts-vs-resolve-role tension · the generic
  tool-loop's home in chat.
- macro-before-scan audit chip: recall's `recent` feed may reach the keyword/semantic scanner with
  UNRESOLVED `{{…}}` macros (marinara scar class) — audit assemble-gather→recallMemory, pin
  resolved-before-scan.
- auto-mode native-compact characterization: auto turns succeed on vLLM but SDK-native compaction
  firing there was never positively confirmed (needs a compact_boundary log capture; cheap-probe
  moment).
- Greeting studio Phase-3 (committed-chat greeting surfaces) — only if pulled by demand.

### Sanctioned-NEVER + owner-sacred (no fresh ruling = don't touch)

- NEVER build: simpleSend · prompts.json machinery · profile hot-swap (guided-gen plan, sanctioned).
- Owner-sacred: persona pin mechanics (validation-only allowed) · security floors/rate limits ·
  pushing to origin · hand-launching engines · full-rpg/crew scope.
- The three gating classes are law: PHASE = disable-with-reason · PERMISSION = omit ·
  APPLICABILITY = omit + keep-the-doorway. One real surface, never reduced modes.

## ═══ COMPLETED PROGRAM RECORD (pointers; detail = git log + the cited reports) ═══

- **The knob-wire program (2026-07-25→26, COMPLETE):** ~440-file two-wave audit → gate 150
  (`knob-wire-coverage`, D107, six arms, self-cleaning registry) → Phase A (6 lanes: rateLimits
  enforced · chat six · dupThreshold · uploads catalog) → Phase B (7 stints on one warm lane:
  the settings-SECTION contribution seam · memory master switch · worldInfo · 3 admin panes +
  rateLimits.general DELETE / login ADD · databank wired [ownerId-blind stub killed] · workloads
  knobs · persona toggles · toolRecurseLimit · chat prefs w/ PD-146 ceilings · verbatimTail ·
  Advanced disclosure · pageSize · the admin tier ⑩ · imagery-templates lift ⑫) → side-eye
  SHIP-WITH-FIXES, zero BROKEN. Audit ledger: `reports/scout/2026-07-25-buried-knobs-audit-wip.md`.
- **Guided-generations program (COMPLETE through Phase 2):** parity audit
  (`reports/stickler/2026-07-25-guided-generations-parity-audit.md` — LAW-adjacent; §5/§10 = the
  convergence design the substrate spec builds on) · Phase 1 steering + CP-1/CP-2 · the greeting
  studio · the sampling ladder (gate 149).
- **Context-Panel program:** CP-1/CP-2 SHIPPED; CP-3 kit SHIPPED (`afb3d383`); CP-4 lite trim = W3
  of the active program; spec = `docs/architecture/Context-Panel-Program.md` (§4.4 amended by the
  quests/journal ruling — apply at land).
- **Contracts audit (F1–F5/G1–G3):** functionally closed 2026-07-25; `contracts/chat` 9-seam split;
  compose `services.ts` split (keystone + 8 seams).
- **Pain-point inventory triage:** all items nailed, purged, cured (settings god-feature → the
  contribution seam), or queued above; the localStorage brick-loop was already fixed (workboard-#11
  draft trust gate + save circuit breaker — this file's git history holds the old detail).

## ═══ COMMIT LOG (2026-07-25 → 26, one line each; full messages in git) ═══

`bb18ed73` review-fix wave (speaker-tag leak · avatars · slash combobox · shell brick · ARIA) →
`ba1eb63f` recovered design records → `b733a0b0` F6 transport schemas → `36d0b128` guided P1 +
CP-1/2 → `a659c48b` first e2e (4 @live legs) → `20627b64` guided P2 consolidation →
`2a450a8b` Stop-during-arbitration + worldInfoActivated + F3 → `80eca58e` contracts/chat 9-seam
split + chain-Stop → `712047b4` union-gate repair + snap --contexts + 2 flake root-fixes →
`c8c613fa` workboard-remainder close → `2ee1d0b2` services.ts split → `be1ba6b4` sampling ladder
(gate 149) → `d9525f02` knob-wire Phase A (gate 150/D107) → `9acbcf5b` B1 seam + memory switch →
`3c09113d` B2 admin surfaces + rulings → `201c2d74` B3 databank + deep-link race → `8876abaa`
B4+5 + sortable product fix + swipe-strip fix → `c4561fa8` B6 admin tier + reset trap →
`8195c660` side-eye close → `a5ace0fc` B⑫ imagery lift (PHASE B COMPLETE) → `afb3d383` the CP-3
tracker kit + ratified substrate spec.
