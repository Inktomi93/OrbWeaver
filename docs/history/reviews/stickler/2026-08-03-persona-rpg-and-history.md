---
kind: history
status: archived
updated: 2026-08-08
---

# PERSONA × RPG + STORED HISTORY — design pass (the D122 follow-up commission)

```
kind: stickler design review (same actor-state form as 2026-08-03-persona-model.md — its sequel)
tree: main @ a996d74e-era + the PERSONA merge c736ae8a (R0–R4 BUILT; D122 minted 67a04383) — all
      receipts below are against the MERGED code, re-read this session.
charge (owner, via coordinator): (1) extend the D122 model into rpg-lite + pin the Ashen Spire
      frozen-identity defect class; (2) mid-session persona-change semantics for game state;
      (3) design the "resync persona" reattribution affordance; (4) audit what durable history
      actually stores across persona switches and judge the stored shape.
authority: FINAL-Persona PART A + Chat-Macro-Resolution.md remain the examples-law; D122 is ledger.
posture: review-and-propose only. ★ marks recommended fork arms.
```

---

## 0. WHAT CHANGED SINCE THE LAST REPORT (absorbed, receipted)

- **D122 read in full** (`Core-Path-Registry.md` §D122): consent-to-presentation-surface; the resolver
  is the widening point; `resolvePersonasForRoster` gated on the chat-supplied consent set; member
  descriptions unconditional; three-state `triggerPersonaId` (explicit null ⇒ ANCHOR; previews OMIT the
  key); the D62 first-run rider (`E2E_HARNESS=on || DEV_SEED=on` seeder arm).
- **The merged code verified live**: `chat/substrate/roster-humans.ts::presentHumanUserIdsOf` (the ONE
  consent-set home, deliberately NOT online-filtered — "the anchor's owner is routinely offline");
  `domain/persona/verbs/resolve-personas-for-roster.ts` (Principal-less compose factory over
  `loadPersonasForOwners`, dedup both sides); `entry/compose/chat.ts:146 activePersonaIdFor` + `:1014–1031`
  (the widened `resolveForeignInputs` — consent set on the op params); `turn.ts:233–234/:252/:1243/:1415/
  :1561/:2067` (every caller threads `room.presentHumanUserIds`); `turn.ts:521` steerIdentity now rides the
  live member identity (`foreign.personas.active?.name`); the multi-human suite exists
  (`tests/server/entry/compose/persona-multihuman.suite.int.test.ts`, +135 lines, per the merge stat).

---

## Q1 — THE SAME PERSONA RESOLUTION, FOR RPG

### 1.1 INVENTORY — where rpg reads player identity today (every site, receipted)

| Site | Read | Plane | Verdict | |
| - | - | - | - | - |
| **Actor key** | `{kind:"user", userId}` (`contracts/rpg/actor.ts` — actor-ref arms; snapshot keys `user:<id>`) | identity KEY | **stable across persona changes by design** — `entry/compose/rpg.ts:389–394`: "the snapshot keys on `user:<id>` (stable across persona changes — verified, never orphaned by a display-name toggle)" | |
| **Display name** | `resolveRpgRoster` → `resolveUserPublics(row.userId, row.activePersonaId)` → persona name ?? handle (`chat/verbs/resolve-rpg-roster.ts:36–42`) | persona plane, LIVE | correct — and note this read is scoped by the persona's OWN owner (`compose/chat.ts` `resolveUserPublics` selects `personas WHERE id AND ownerId = userId`), so this path NEVER had the host-keyhole defect; it was D122-compatible before D122 | |
| **Panel names** | tracker view roster arm forces `identity: null` and takes `name: r.name` from the live roster (`rpg/chat-ops/tracker-view.ts:184–196`) | LIVE | a stored `identity.name` can never shadow a roster actor's live persona name — projection-inert by construction | |
| **Delta lines** | `gather.ts:106–113` resolves `rosterNames` LIVE per gather; `substrate/delta.ts:89–95` uses stored `identity.name` only for CAST actors | LIVE (roster) / stored (cast — correct, cast have no live source) | correct | |
| **Extraction ref vocab** | `resolveExtractionRefs` re-reads the roster per call; `PLAYER_SEMANTIC_REF="player"` is the stable token; the prompt explains `player = currently shown as "<name>"` (`compose/rpg.ts:394/:454–455/:501/:518–521`) | LIVE + stable token | correct — the model is steered onto the persona-independent ref | |
| **Extraction transcript** | `chat/verbs/resolve-canon-window.ts:30–36` — canon rows resolve identity macros through the row-stamp producer (`loadChatMacroNameProducer` → `renderHistoryMacros`) | per-row stamps, LIVE resolution of RAW macros | correct — the extraction model sees each row under its OWN author's persona name, never `{{user}}` tokens, never the viewer | |
| **steerIdentity ({{user}} in the host steeringNote)** | `turn.ts:521` `foreign.personas.active?.name` → `gather.ts:119` (`?? "User"` floor) | D122-widened, LIVE | correct post-R1 — a non-host trigger's name now resolves (noted at build) | |
| **Sheets** | `rpg_sheets` rows keyed \`(gameId, characterId | userId)\` — className/level/attributes/flavor; NO name column | key-only | correct — sheet identity is the KEY, presentation is the roster's |

### 1.2 JUDGMENT — the live loop is ALREADY D122-coherent. No persona-plane wiring is missing.

The rpg identity architecture is exactly the D122 shape, arrived at independently by the actor-state
review's R2: **keys are userIds (stable), presentation live-resolves through the persona plane at every
read, and the one prompt-facing binding (`steerIdentity`) rides the D122-widened FOREIGN read.** This is
a coherent-as-is verdict with receipts — the owner's unease has a different root:

### 1.3 The Ashen Spire defect class — pinned. It is NOT a resolution defect; it is FROZEN-AT-GENERATION/EXPORT CONTENT.

- The demo transcripts are, by owner law, "GENERATED LIVE … exported through the real export verb —
  never authored by hand … Re-generate a transcript; never edit one"
  (`chat/seeder/demo-chats.ts:4–9`).
- The generating stack ran **pre-Traveler / persona-less**: the bundled export carries
  `"user_name":"You"` and every user row `"name":"You"`
  (`entry/boot/seed-assets/demo-chats/ashen-spire.jsonl` line 1 + the name-set sweep this session:
  `names: {'You', 'Sabine Veyra', 'Calamity…', 'Morgatha…', 'Group'}`). "You" is precisely the
  no-persona display fallback whose collision the Traveler rename was minted to kill
  (`seed-default-persona.ts:16–18`). (The coordinator's "'owner'" is this artifact — the generating
  user's identity, frozen as its display fallback.)
- What the freeze DID and DID NOT reach: the hand-authored **game state is identity-agnostic** — the
  player row is the `seat: {kind:"player"}` placeholder resolved to the receiving user at seed
  (`demo-chats.ts:121`), and none of its text names the player (sheet flavor/status/journal audited
  this session). Import re-seats stamps ("every example seats the receiving user's own persona",
  `demo-chats.ts:40`), and orb never denormalizes ST's `name:` labels into display (names derive from
  stamps — Chat-Macro-Resolution §0 "Producer, not hard-link"). **The only surviving residue is the
  assistant PROSE itself** — the model at generation time wrote to the identity it was shown, and that
  is baked into the transcript bytes forever.

**FORK Q1-A — the demo residue** (owner pick):

- **★ (a) Regenerate the six transcripts once, on a persona'd stack** (a real named persona, so prose
  vocatives read as a name, not "You") — the owner's own "re-generate, never edit" law is the only
  sanctioned fix, and the hand-authored board state needs zero changes (it was built identity-agnostic).
  Low priority: cosmetic class, no mechanism is wrong.
- (b) Accept as-is — the prose "You" mostly reads as second person; the ST-jsonl labels never surface.
  Defensible, but the flagship then permanently demos the exact vocative defect the Traveler clause
  exists to prevent.

**FORK Q1-B — rpg persona wiring:** none proposed — coherent-as-is (§1.2). Do not add a persona axis to
rpg keys; do not store display names on roster-backed actors. (Anything here would be un-building R2.)

---

## Q2 — A USER CHANGES PERSONA MID-RPG-SESSION

### 2.1 The semantics to mint (the design): **KEYS LIVE, PROSE FROZEN, PROJECTIONS DERIVED.**

What ALREADY happens on a mid-session switch, all verified live-resolving (receipts §1.1):
sheet/actor rows keep `user:<id>` keys (nothing orphans); the panel, delta lines, extraction ref
vocabulary, `player =` explainer, and steerIdentity all show the NEW name on the very next read/turn;
`{{user}}` in raw stored text resolves per-row-stamp (old rows keep the old name — history law);
attribution chrome follows the stamps.

What stays FROZEN, correctly: message `personaId` stamps (who-said-it, PD-100 — the canon-freeze suite
pins that persona verbs never rewrite them); model PROSE everywhere it accumulates — assistant rows,
and the extracted rpg planes (`journal`, `recentEvents` beats, cast `thoughts`, statuses, relationship
labels — all model-authored text that referenced the name shown at extraction time); snapshots
(append-only, FK'd to variants — the rpg state-anchor law: never delete, never rewrite).

**The one genuinely new semantic to rule — what does a switch MEAN to the story?**

**FORK Q2-A** (owner pick):

- **★ (a) Recast-is-story (no mechanism change).** The switch is a re-costuming of the same protagonist:
  keys hold, trackers/inventory/quests continue, the next extraction beat sees the new name in the
  transcript's new rows and the `player = "<new name>"` explainer, and the story absorbs it exactly like
  a character rename. Old journal/beat text keeps the old name AS HISTORY (it happened under that name).
  A host wanting a clean cut has two existing/proposed levers: the Q3 restamp (stamps) and
  `rpg.resyncFromStory` (rebuild the tracked planes — the rebuilt text picks up whatever the transcript
  now resolves). Zero new code beyond Q3.
- (b) Per-persona game state (each persona its own sheet/trackers) — **recommend against for lite**:
  this is model B of the STILL-PARKED rpg-linkage fork (owner: "starts getting messy"), it orphans
  progress on every costume change, and it contradicts the ratified R2 keying (`user:<id>`). If the
  owner ever wants it, it is the parked design pass, not a rider here.
- (c) Character = ANCHOR persona (model C, the arm the previous review recommended keeping open) —
  still PARKED by the owner's own word. Note only: D122's anchor binding + live anchor resolution in
  multi-human made C strictly cheaper to build later; nothing in Q2/Q3 below forecloses it.

**FORK Q2-B — should a persona switch mid-game emit a story-visible signal?** (a small, optional rider)

- **★ (a) No new signal** — the next beat's transcript + explainer already carry it; the model handles
  renames well, and a forced "X is now Y" injection is exactly the kind of feature-forced prompt content
  the gen-settings law resists.
- (b) A one-shot depth-0 note on the first post-switch turn ("the player's character is now presented
  as <new>") — only if live play shows models flip-flopping names. Build on evidence, not now.

---

## Q3 — THE "RESYNC PERSONA" REATTRIBUTION BUTTON

### 3.1 What exists (the parts bin, receipted)

- `reattributePersona` (`chat/verbs/edit.ts`; `chat.reattributePersona` route) — the ONE sanctioned
  stamp writer (Chat-Macro-Resolution §5): author-or-host, per-row, content untouched; re-stamp → the
  producer re-resolves → BOTH consumers update. Client-side it is windowed: the panel assembles ids
  from the last `REATTRIBUTE_WINDOW = 100` messages (`persona-this-chat-section.tsx`) — FINAL §A.7
  names this exact limitation and pre-authorizes the fix: "widen with a server-side 'restamp mine'
  mode if wanted."
- Rendering/assembly resolve LIVE off stamps + producer — so for display and the model prompt, stamps
  are the ONLY thing a persona repair ever needs to touch.
- `rpg.resyncFromStory` (D111-1) — the host's deep rebuild of the tracked planes from the transcript,
  on a fresh host-resolved connection (the ONE sanctioned non-inherited rpg call).

### 3.2 The design (★ recommended shape): a thin composite of existing idioms — NOT a new plane.

1. **Server-side bulk arm on the EXISTING verb** — `reattributePersona` gains a server-resolved scope
   (e.g. `{ mine: true, fromSeq?: number }` alongside the current `messageIds` arm): the server selects
   the caller's own `role='user'` slots (optionally since a seq), same author-or-host gate, same
   stamp-only UPDATE. This deletes the client 100-window hack and IS the "resync persona" core.
   Cheap (one scoped UPDATE), safe (content untouched; the canon-freeze suite's law is that this verb
   is the only writer — unchanged), honest (nothing else needs repair, because rendering resolves live).
2. **The rpg chain, host-only, opt-in**: on a game chat, the rpg resync dialog offers a checkbox
   ("restamp my messages to this persona first"), running arm 1 then `resyncFromStory` — so the
   re-extracted journal/cast text is rebuilt from a transcript whose restamped rows now RESOLVE the new
   name (`resolve-canon-window.ts` resolves per-stamp at read). Honest limit, stated in the UI copy:
   assistant PROSE keeps old-name vocatives — that is story history, not state.
3. **The never-touch list (the dangerous half, each with its law):** message CONTENT (D26 slot purity;
   identity macros already live); **snapshots** (append-only, variant-FK'd — rewriting falsifies swipe
   history; rpg state-anchor law); **digests/memory** (baked summarizer prose; the rebuild exists as a
   RESERVED host action per D55 — do NOT wire it to this button: expensive, destructive, and recall is
   character-keyed, not persona-keyed, so the persona payoff is near zero); **exports** (one-way; the
   next export reads the new stamps/anchor by itself — verified: per-row labels derive from stamps,
   `export/verbs/export-chat.ts:65–72`).

### 3.3 Does the D111 resync shape fit?

Half of it. The rpg PLANE half is exactly D111-shaped (deliberate host verb, deep rebuild, fresh
consent at the verb) — and it already exists; reuse it, don't twin it. The STAMP half is NOT
resync-shaped — it is the existing reattribution verb widened server-side, which FINAL §A.7 already
sanctioned. **FORK Q3-A (placement):** ★ (a) two affordances in their existing homes — "Restamp my
messages" (persona panel, server-widened, all-mine default with a since-seq advanced arm) + the rpg
resync checkbox chain; never one fused mega-button (fusing makes the stamp repair look game-scoped and
hides it from plain chats). (b) one fused "Resync persona" button on game chats only — rejected-by-me
for the same reason. **FORK Q3-B (scope default):** ★ all-my-rows (matches the owner's "wrong-persona
stretch" case; the stamp is chrome + macro subject, not spend/authority — low blast radius; per-row
undo exists via the same verb) vs keep a windowed default (safer-feeling, but re-imports the 100-window
confusion the server arm exists to kill).

---

## Q4 — MULTI-PERSONA, MULTI-HUMAN, STORED HISTORY: what the rows actually carry

### 4.1 The stored truth, verified site by site

- **Durable message rows carry IDS, never names, and content stays RAW.** `messages` = slot
  (`authorUserId` + `personaId` server-stamped at send — `turn.ts:1266–1268` explicit ?? active,
  PD-100); content is the composer text after the VOLATILE-ONLY freeze (`assembly/macros.ts:132–140`
  — `createVolatileOnlyRegistry` bakes clock/PRNG macros ONLY; identity macros pass through raw,
  D51 rider). **Persona names do NOT freeze into stored text at send.** Names are derived at every
  read through the member-gated producer (`persistence/macro-names.ts:62–79`, covering since-switched
  personas by stamp union) + the shared atom (`kit/macro/row-macros.ts` — row stamp wins; null stamp →
  the ANCHOR, never the viewer).
- **Across mid-chat switches** old rows keep old stamps and resolve to the persona they were authored
  as; new rows stamp the new persona — the §A.1 HISTORY context, working as designed, and since R1 the
  resolution is member-complete (D122). The wire's speaker labels (`namesBehavior` prefixing/`name`
  field) are assemble-time projections, never stored.
- **What DOES freeze, exhaustively:** (1) **assistant PROSE** — the model bakes the name it was shown;
  inherent to generation, repairable only by the human edit verbs; (2) **memory digests** — distilled
  prose bakes names; digest keys are chatId + `chat_digest_speakers` = CHARACTER ids (D28/D55) — the
  persona axis deliberately does not exist in digest keys, and recall is character/witnessing-scoped,
  so a persona switch has no mechanical effect on memory; rebuild is the reserved D55 host action;
  (3) **EXPORT** — format-lossy by ST's shape: header `user_name` = the anchor's name at export
  (`export-chat.ts:147–151`), per-row labels = each row's OWN stamped persona name
  (`export-chat.ts:50–72` `loadSpeakerNames`/`resolveSpeakerName` — per-row-stamp-faithful, better
  than I expected; the loss is only that ST has ONE header user), one-way by design; (4) **the demo
  transcripts** (the Q1 Ashen case — frozen at generation). **Forks/handoffs**: rows copy verbatim
  WITH stamps (`fork.ts`), the anchor pointer heals conditionally (HEAL), rpg re-keys actors — the
  persona plane survives both.

### 4.2 JUDGMENT — the stored shape is RIGHT. This is a coherent-as-is verdict with receipts.

Slot-stamps + raw content + producer-derived names is precisely the honest model for personas that
change over time: nothing stored ever lies, every renderable surface re-derives, and the frozen arms
are each frozen for a REASON — LLM prose (physics), ST export (format contract, and even there the
per-row labels are stamp-faithful), digests (rebuildable prose whose keys are deliberately
persona-free), demo assets (regenerate-only law). I looked for a missing persona axis and found
none worth minting: a `personaId` on digests would be a dead column (recall never keys on it), and
name-denormalization anywhere is the exact neo hard-link Chat-Macro-Resolution §0 bans. **No redesign
proposed.** The only Q4 deliverables are the ones already carried above: the Q3 server-side restamp
(the stamp-repair story for "wrong-persona stretch") and the Q1 demo regeneration (the one place
frozen content is OURS to re-mint).

---

## FINDINGS INDEX (this pass — none are code defects requiring immediate fix)

- **N1 (verdict, no defect):** the rpg live loop is already D122-coherent — keys `user:<id>`, all
  presentation live-resolved, steerIdentity D122-widened. Receipts §1.1.
- **N2 (root-caused):** the Ashen Spire frozen identity is transcript CONTENT baked at generation on a
  persona-less stack (`user_name/name = "You"` in `ashen-spire.jsonl`), not a resolution or game-state
  defect (the authored board is identity-agnostic via `seat:{kind:"player"}`). Fix = regenerate per the
  owner's own demo law (FORK Q1-A★).
- **N3 (pre-authorized gap, becomes Q3's core):** reattribution is client-windowed at 100
  (`persona-this-chat-section.tsx` REATTRIBUTE\_WINDOW; FINAL §A.7's named limitation) — the
  server-side "restamp mine" arm is the missing piece.
- **N4 (pleasant surprise, verified clean):** export per-row user labels ARE per-row-stamp-faithful
  (`export-chat.ts:65–72`); only the single header `user_name` is anchor-frozen, an ST-format
  constraint.

## VERIFIED CLEAN / READ SCOPE

Read this session (beyond the prior report's corpus): D122 + the D123 cursor note; the c736ae8a merge
stat + the six R-commits' log; `roster-humans.ts`, `resolve-personas-for-roster.ts` (whole),
`persona/contract/ops.ts` (via wiring grep), the widened `compose/chat.ts` resolveForeignInputs region

- `activePersonaIdFor` site, `foreign.ts` consent-set contract lines, all six turn.ts consent-set
  threading sites; `contracts/rpg/actor.ts` (header + slug + ref arms), `compose/rpg.ts:380–530`
  (refs/player token), `resolve-rpg-roster.ts` (whole), `tracker-view.ts:170–240`, `gather.ts:100–135`,
  `substrate/delta.ts` name sites, `resolve-canon-window.ts` producer lines; `demo-chats.ts` (header,
  authored state, actor rows, casting), `ashen-spire.jsonl` (header + name-set sweep across the file);
  `export-chat.ts:44–190`. NOT read: the rpg tools/apply full body (only its name sites), snapshot-edit /
  staging internals, the other five demo jsonls beyond the name sweep, memory digest build internals
  (judged from D55 + the digest schema facts already in the ledger). No gates/tests run (read-only pass;
  zero tree mutations).

## UNCONFIRMED / LOW PRIORITY

- Whether `setIdentityText` can target a roster (user/character) actor at the tool applier — irrelevant
  to display (tracker-view forces `identity:null` for roster actors) but if writable it stores dead
  bytes; a one-line applier refusal would be tidier. Not traced to the applier arm.
- Whether exported message BODIES resolve or keep raw `{{user}}` tokens (ST convention is raw; either
  is defensible; not chased).
- The five non-Ashen demo transcripts carry the same "You" class (same generation batch presumed from
  the name sweep of ashen only + `birdie-rust` etc. unswept beyond the literal-"owner" grep).
