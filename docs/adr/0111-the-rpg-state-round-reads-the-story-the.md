---
kind: adr
status: active
updated: 2026-09-23
---

# The rpg state round READS THE STORY; the tracker tracks SURFACE reality; the composer wand is the ST-style control map; a fork CLONES the game

## Context

Not recorded in the ledger row.

## Decision

Spec home: `docs/history/design/mocks/crunchy-cluster-redesign/DESIGN.md` (§1/§2/§3 carry the full designs; §6 the ratified owner decisions). Four rulings, one program: **(1) EXTRACTION-RIDES-THE-TRANSCRIPT (W-B — extends D108/D109's delivery model; the exchange/consent/barrier/flush tail unchanged):** `RpgTurnContext` threads the character turn's canon transcript to the state round; `extractionContext ∈ {beat|window|full}` (ratified default `window` @ `extractionWindowTokens` 4096) + `reconcileEveryBeats` (ratified 10) are game config; **`rpg.resyncFromStory`** is the host's deep rebuild on a FRESH host-resolved connection — the ONE sanctioned non-inherited rpg model call, because the consenting human initiates it at the verb (the D109-2 inheritance rule holds everywhere else); plane teaching composes from `EXTRACTION_PLANE_PROMPTS` — a new plane = a row, ratchet-tested (joins the D110-2 coupled-site list). D106 compliance: the transcript is a ROOM-plane, model-facing read — deliberately unclamped, hidden spans stay IN (D110 §3.6 model-always). **(2) RULING A — DECEPTION→TRACKER (adopted):** the tracker records the PLAYERS' SURFACE reality only; on a deception-active game the extraction prompt carries the standing clause forbidding any tracked plane (journal, beats, cast thoughts, relationship) from holding a character's secret truth, hidden motive, or a lie's real answer — the hidden layer lives ONLY in the reasoning channel + the host reveal-eye (P3). Prevention over redaction: the panel/fork leak vector evaporates because the truth never enters the tracked planes. **(3) THE WAND (W-D/W-E — extends D110-4's P5 re-home; D33/D56/D57/D107 obeyed):** the composer control map is ST-style — ☰ relocation RULED 2026-08-09 (owner, taste sitting round 3: "chat-options D111 placement BUILD") — the drawn map wins: the ⋯ menu mounts in the COMPOSER's left gutter (`composer-chat-options.tsx`) and the topbar trail widget was REMOVED in the same commit, one home, pure relocation (the menu's items and `ChatOptionsMenu` are byte-untouched). Supersedes the 2026-08-01 park ("neither location is law until ruled") · ✨ utility menu (Recover input = the fired-steer ring · Corrections · Undo · Revert continuation · Clear input · **Simple send = `chat.commitMessage`, the commit-without-generate verb D56 pre-named** — omit-doctrine drops ST items with no backing verb) · four ALWAYS-VISIBLE dual-mode guided icons (impersonate·swipe·response·continue), phase-gated with legible disabled-reasons, never hidden/swapped; one-shot steers CONSUME + restore-on-fail, Swipe KEEPS the steer for rerolls; **empty-Response generates** (`generateOnEmptySend` ratified ON, homed on the Response icon — Send stays send-my-message; `responseNudge` joins the D33 `formatStrings` home). **(4) FORK-CLONES-THE-GAME (W-F/W-G — extends D27's copy discipline to the feature that owns the data; D18/D23 FK-chain authority):** `ChatRpgOps.forkGame` re-keys the rpg vertical through the fork's id maps (ALL sheets copied, ratified), **strips host-secret config (`steeringNote`/`gmPresetId`) for a non-host forker** (extends the D110 §3.6 member→host laundering rule to game data), and writes the fork's pointer LAST; a failed clone ships a plain fork, never a broken one. Fork itself is **host-or-sole-human** (the member→host fork-laundering hole closed at source, `05b76fbb`). Dangling pointers (pre-fix forks, any future desync) render the typed gone-state and heal via host-gated `rpg.detachDanglingPointer` — the heal verb gates on PARENT (chat) membership since the gone entity can't authorize (W-G, `c6d3eadb`). Sibling W-A ruling: rpg state-anchor slots render SILENTLY by construction (no blank "Group" bubbles, `9905cbf1`). Landed commits: W-B `6a0cb7cf` · W-C reconcile cadence + `resyncFromStory` `101c4647` · wand v2 `efbe533d`+`fb787636` · W-D/W-E `ed9c1020` · W-F `b5faacd9` · host-only fork gate `05b76fbb` · W-G `c6d3eadb` · W-A `9905cbf1`; whole-tree green at push `adec7490`.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
