---
kind: review
status: delivered
updated: 2026-08-03
---

# Stickler design review — HOST HANDOFF × CHARACTER OWNERSHIP

Owner charge: "if someone transfers a chat room with characters of their OWN making — how does the new
host get the characters? Trace it all the way down, make it consistent, happy and sad paths, real-world
uses." Mid-review owner ruling: **"the name of the game is OPTIONS … if they transfer a room they can
CHOOSE to also give the person a POINT-IN-TIME COPY of their characters, worldbooks, the message
variants, etc."** Mid-review addendum: **"part of me wants the SIMPLEST route … I defer to the
stickler"** — the stickler is licensed to price the jank per arm and recommend the smallest thing that
doesn't betray the options philosophy.

Everything below is code-verified in THIS session (files read in full or to the named regions; receipts
inline). D-citations: D16/D18/D19/D21/D22/D23/D26/D27/D28/D29/D64/D106/D108/D111.

---

## 0. The one-paragraph answer

Under the built code the new host does **not** get the characters — and that is a LEDGER RULING, not an
accident: **D64** ("handoff … transfers the room + history but DROPS the prior host's character seats
… the new owner adds their own cast; there is NO `cast_not_owned` error"). `acceptHostHandoff`
(`packages/server/src/domain/chat/verbs/roster.ts:663-708`) resolves every present character seat's card
under the NOMINEE's ownership (`resolveDroppedCharacterSeatIds`, roster.ts:621-631 → `getCard` is
strictly owner-scoped, `domain/character/verbs/get-card.ts`) and `leftSeq`-stamps every null-resolving
seat **in the same atomic batch** as the role swap (roster.ts:675-695;
`persistence/participant.ts:166-181`). There is no cross-tenant card read anywhere in the chain — the
roster's `characterId` is not a license. The transcript survives (prose is the room's, D26/D28); the
seats die. The owner's ruling adds the missing option: an opt-in point-in-time copy. §5 specs it; §6
prices the arms and recommends the minimized shape.

---

## 1. THE SWAP ITSELF — what `acceptHostHandoff` changes and what it does not

Read in full: `roster.ts` (all 709 lines), `persistence/participant.ts` (all 182 lines).

**Changes, in ONE atomic batch** (`emitNotification(…, swap)` couples the statements with the
`handoff-accepted` notification insert when the old host is present; the else-arm runs
`db.batch(batchMany(swap))` — both arms atomic, roster.ts:683-695):
1. Demote: `role='member'` on the present `role='host'` row (role-keyed, not userId-keyed — a room whose
   host already left no-ops the demote and the swap still heals hostlessness; participant.ts:170-174).
2. Promote: `role='host'` on the nominee's present row (participant.ts:175-178).
3. Clear `chats.pendingHostUserId` (participant.ts:179).
4. Drop: `leftSeq = <canon head>` on every present character seat whose card does not resolve under the
   nominee (roster.ts:673-681) — D64 verbatim, and test-pinned
   (`tests/server/domain/chat/verbs/roster.int.test.ts:935-996`: foreign seat dropped, nominee-owned
   seat kept, humans never dropped).

**Does NOT touch** (each verified against the swap statements — the batch contains exactly the four
writes above):
- `chats.anchorPersonaId` — the D51 `{{user}}` anchor stays pointed at (typically) the OLD host's
  persona → **finding F2**.
- `chats.metadata` whole: `roomOverrides` (scenario/mainPrompt/postHistory), `group` config,
  `background`, `databankVisibility`, `toolRecurseLimit`, `variableValues`/`runtimeVariables` — all
  chat-scoped, all transfer with the room. Correct: host-authored room state is the ROOM's (§7).
- `chat_injections` rows (D116 — the one per-chat prose door): chat-FK'd, transfer with the room.
- `chat_participants.joinHistoryVisibility` (the D16 floors): per-participant rows survive untouched;
  the promoted host escapes their own floor by ROLE
  (`substrate/auth/clamp.ts:64-73` — `viewerHoldsHost ⇒ NO_HISTORY_FLOOR`, D106 "authority implies
  visibility"), and can rewrite every member's floor via the host-gated `setMemberHistoryVisibility`
  (roster.ts:575-600). Nothing strands.
- `chats.archived` — a host who `selfLeave`s after nominating archives the room (roster.ts:604-615);
  the accept succeeds on the archived room and does NOT unarchive it. The promoted host can heal via
  the host-gated `archive` verb (`chat-lifecycle.ts:128-133`). UX wrinkle only (§8 U2).
- `rpg_games` whole: `gmUserId` (always NULL in lite — fork-game.ts:196), `gmPresetId` → **finding
  F1**, `config.lite.steeringNote` → deliberately transfers readable (§3.4), `config` extraction knobs.
- The old host's synthetic group-memory bucket (`__group__<chatId>` character, owner-stamped) —
  naturally orphaned, D64 says expected, not migrated. Post-handoff group memory re-mints under the new
  host (`mintSyntheticGroupCharacter` is ownerId-keyed find-or-mint).
- `chat_books` junctions — the old host's chat-attached worldbooks keep firing → §3.5 (the built
  room-scoped license).

**Gate correctness verified:** nominate = `requireHost` + present-non-host nominee else leak-free
`ChatNotFoundError` (roster.ts:636-657); accept = `requireParticipant` + `principal.userId ===
pendingHostUserId` else `not_turn_owner` (roster.ts:664-669) — the un-spoofable self-action; tested
(roster.int.test.ts:861-933: non-nominee refused, no-pending refused).

## 2. POST-SWAP ASSEMBLY — whose authority resolves the cast (the core question)

Every downstream resolution is **by-role host lookup, then owner-scoped reads under that host** — no
join-order, no stamped owner:
- Engine/gather: `runAsUserId` = the resolved host; cast cards load via
  `getCard({ownerId: runAsUserId, …})` (`substrate/assemble-gather.ts:135-141,201,302-310,378`).
- Compose: `resolveChatHostUserId` = `role='host' AND leftSeq IS NULL` (`entry/compose/chat.ts:557+`,
  comment cites D19 + "every roster character is host-owned per PD-21").
- Read surface: `getMemberCard` loads under `hostUserId` found by role (`verbs/read.ts:637-651`).
- rpg: `resolveHost` by `role==="host"` (D108-3, minted precisely for post-handoff correctness).

`getCard` (`domain/character/verbs/get-card.ts`, read in full): `loadOwnedCharacterRow(db, ownerId,
characterId)` → null for not-owned/mid-delete, NEVER throws (contract invariant: "a null is skip, not
an error"). **Definitive answer:** under the new host's principal, the old host's cards resolve `null`.
There is no door — no cross-tenant read, no roster-as-license. The failure mode that WOULD occur if the
seats survived (blank names, dead gather contributions) is exactly why D64 drops them atomically; the
built code never lets the room enter that state. Code matches ledger, byte for byte.

The transcript is the one place foreign character identity legitimately persists: `messages.characterId`
stamps are slot-level (D26), and the NAME producer (`persistence/macro-names.ts`, read in full) reads
`characters.name` by id **deliberately unscoped** ("a member already sees who authored each line —
names only, never the full entity"). So a dropped character's prior lines keep rendering her live name
while the old host's row exists.

## 3. SAD PATHS, each traced (as-built, DROP arm)

**3.1 Old host EDITS the card post-swap.** The seat is already gone; the only live surface is the
unscoped NAME producer — a rename re-labels the room's history live. Names-are-not-secret is the
documented posture (macro-names.ts header); the room's prompt/behavior can no longer be mutated by the
old host through characters. By design; no hazard beyond a rename.

**3.2 Old host DELETES the card.** `chat_participants.characterId` = **CASCADE** ("a deleted character
leaves no roster ghost", `db/schema/chat.ts:429-436`) — even the left-era seat row vanishes;
`messages.characterId` = **SET NULL** (history preserved minus attribution, schema/chat.ts:226-230 +
the `messages_attribution_shape` CHECK deliberately tolerating all-NULL for exactly this cascade,
schema/chat.ts:195-203); transcript prose survives; names degrade to the fallback label
(`REMOVED_CHARACTER_LABEL` / export's header-name fallback). `chat_digest_speakers` cascades. Matches
the roster-vs-referenced-producers model: the transcript resolves from message stamps, not the roster.

**3.3 Old host LEAVES / account DELETED.** Leaving: resolution rides role-host lookups, never the old
host's membership — nothing breaks; their persona-anchor degrade is F2 regardless. Account deletion:
`users` cascade → their characters cascade → 3.2 applies wholesale; `chats.pendingHostUserId` SET NULL
kills any pending nomination they were the NOMINEE of (schema/chat.ts:116-118); if they were the
NOMINATOR their host row cascades and the room is hostless until an accept (which heals — §1 demote
no-ops).

**3.4 `steeringNote` and hidden content transfer READABLE to the promoted host.** Contrast: a non-host
FORK strips steeringNote, nulls foreign gmPresetId, strips hidden spans + reasoning
(`domain/rpg/chat-ops/fork-game.ts:15-60,188-239`; `verbs/fork.ts:79-103`). Handoff strips NOTHING.
Verified consistent, not a finding: D106 rules "a handoff-promoted host is not viewer-clamped"; the
distinction is CONSENT — nominate is the departing host's deliberate grant, a fork is not. The
asymmetry is the design.

**3.5 Worldbooks — the OPPOSITE posture from cards, already built.** Chat-attached books
(`chat_books`) read UNSCOPED at assembly ("a chat's attached books are room-public prompt content —
membership is the caller gate", `world-info/persistence/queries.ts:99-130`), so post-handoff the OLD
host's books KEEP FIRING into the new host's prompt; the old host retains edit (live mutation of the
room's prompt) and delete (junction CASCADE — silent evaporation). The new host can DETACH but not
read/edit/export: `detachFromChat` deliberately skips the book-ownership check — its header names this
exact case: *"the host can always clean the room, e.g. after a host handoff left a prior host's book
attached"* (`verbs/attachments/detach-from-chat.ts:1-6`). CHARACTER-scoped books, by contrast, are
owner-filtered at the pool (`listCharacterBooks` … `eq(worldBooks.ownerId, ownerId)`,
queries.ts:78-84) — consistent today only because post-D64 all live cast is host-owned. So the repo
currently ships BOTH ownership postures across one transfer: cards drop, chat books license. The
ruling's copy arm is what reconciles them.

**3.6 New host EXPORTS.** `exportChat` is host-gated (D29) and emits transcript + NAMES only
(`export/verbs/export-chat.ts:44-73` — name maps, never card bodies); `exportCharacter` stays
`fetchOwned` — the new host cannot export a foreign card, and post-copy they own the copies and can.
No leak either way.

**3.7 FORK by the new host.** `resolveOwnedCharacterSeats` (fork.ts:240-254) keeps only forker-owned
seats — post-handoff the whole live cast is theirs, so everything rides; canon copies whole (dropped
characters' lines survive, fork.ts:456); `forkGame` re-keys the rpg vertical through the id maps with
the strip battle-tested (fork-game.ts, read in full). Sound.

**3.8 rpg mid-handoff.** Game rows are chat-keyed — they transfer with the room, no re-key (the chat id
doesn't change; the fork's re-key exists because ids DO change there). Host resolution by role
(D108-3). A dropped character's `rpg_sheets` row persists "invisible-but-preserved; a re-invite finds
it waiting" (fork-game.ts:73-75 states the model). `gmUserId` NULL in lite. Only `gmPresetId` misfires
→ F1.

## 4. FINDINGS (confirmed; severity from consequence)

**F1 — MEDIUM. Handoff leaves a foreign `gmPresetId` the fork explicitly gates against; the GM voice
silently changes and the knob lies.**
`file:` `roster.ts:663-708` (no gmPresetId statement in the swap) vs `fork-game.ts:188-239`
(`resolveForkGmPreset`: "a FOREIGN preset … never rides — else `resolvePresetOverride` would feed the
source host's private preset into the forker's own turns, the [[injected-op-caller-gate]] class").
Failure scenario: old host set a GM-voice preset; handoff; next turn `resolvePresetOverride` returns
the foreign id, `resolvePromptConfigWithOverride` (compose/chat.ts:534-556) catches the owner-scoped
`preset.get` throw and silently degrades to the new host's default ("the lenient-id rule — never a
broken turn"). No cross-tenant read occurs (verified: `readablePreset` is owned-or-system), but (a) the
game's voice changes with zero surfacing, and (b) `getConfigView` keeps serving the unreadable foreign
id to the new host (`rpg/verbs/read/get-config-view.ts:22`) — a dead knob the host can't inspect.
Fix (either arm of §5/§6): null it in the swap batch (the fork gate's twin, one statement), or offer
the preset in the copy bundle (`preset.clonePackaged` is the existing clone-for-rpg op,
`preset/verbs/clone-packaged.ts`).

**F2 — MEDIUM. The anchor persona dies silently at handoff — and the anchor VERB permits what the
anchor RESOLVER cannot read.**
`file:` swap touches no `anchorPersonaId` (participant.ts:166-181); resolution is
`persona.get({principal: hostPrincipal(runAsUserId)})` → strictly owner-scoped
(`persona/verbs/get.ts:1-18`) → catch → `null` (compose/chat.ts:989-1010). Failure scenario: the anchor
is (in the default case) the room-creating host's persona; after handoff `runAsUserId` is the NEW host,
the anchor resolves null, and every card-authored `{{user}}`/`{{persona}}` falls off the pinned anchor —
the exact POV drift D51's anchor law exists to prevent ("a mid-chat persona switch never rewrites the
card's established `{{user}}`") — silently, on the very next turn. Deeper: `setChatAnchorPersona`
explicitly allows pinning ANY present human's persona (`chat-lifecycle.ts:135-137` "owned by a present
human participant"), which the host-scoped resolver can never read — the verb's permission surface is
wider than the resolution surface even without a handoff. Fork carries the same latent arm
(`fork.ts:515` copies `anchorPersonaId` verbatim; a non-owner fork's anchor is foreign → null).
Fix: at accept, heal the anchor in the swap batch (re-pin to the new host's active persona, or null +
surface); separately reconcile the verb/resolver mismatch (either the resolver learns
present-member-scoped anchor reads — a deliberate D18-style membership read like macro-names — or the
verb narrows to host-owned). Personas are owner-sacred (persona-is-owner-sacred); they are never in the
copy set — heal, don't copy.

**F3 — LOW/DESIGN. Property-posture asymmetry: cards DROP, chat-books LICENSE (§3.5).** Not a code
defect — both halves are deliberate and documented — but the transfer semantics ship two opposite
answers to "what happens to the old host's property in the room," and the license half leaves the room's
prompt mutable/evaporable by a departed user. The ruling's copy arm is the reconciliation; under
decline, the license posture persists and the built detach is the honest control.

**F4 — INFO. TOCTOU in `resolveDroppedCharacterSeatIds`** (roster.ts:621-631): cards are read before
the batch; a delete/transfer landing in the gap mis-classifies a seat (kept-but-null → blank-name seat
until manual removal; SQLite single-writer makes the window ms-wide). Not worth machinery; noted.

## 5. THE RULING'S ARM, spec'd — OPT-IN POINT-IN-TIME COPY

**What the room actually needs copied for function** (each plane verified):
1. **Character cards** — the present character seats the nominee cannot resolve. Mint machinery exists:
   `duplicate.ts` (verbatim content copy, `freeCopyHandle` uniquifier, policy fields carried) +
   `promote-actor`'s compose-op mint precedent (rpg owns neither table; an injected op mints via the
   character front door). Provenance: STAMP it (`importedFrom: "handoff:<chatId>:<sourceCharId>"` +
   `importHash` — the hub-import idiom), don't clear like `duplicate` does — the stamp is also the
   idempotency key for crash-safe re-accept.
2. **Their character-scoped worldbooks — the BOOKS, not just junctions.** `duplicate`'s
   reference-carry (PD-141) is the WRONG half here: the character-book pool is owner-filtered
   (queries.ts:83), so a copied card pointing at foreign books loses its lore SILENTLY. Copy book rows +
   `world_entries` + fresh `character_books` junctions (copy → copy). New but trivial machinery (rows,
   no engine).
3. **Host-owned chat-attached books** — copy + re-point `chat_books` (detach original, attach copy, one
   batch). Severs the §3.5 license. Books attached by OTHER members (attach gate is host-only today, so
   only prior hosts can have attached) follow the same rule keyed on ownership.
4. **Seat RE-POINT instead of drop**: `chat_participants.characterId` → the copy id, IN PLACE — keeps
   era (`joinSeq`), knobs (`talkativeness`/`disabled`), identity of the seat row. Declined seats take
   the built D64 drop.
5. **Canon re-stamp (the "message variants" item, resolved):** the variants themselves are chat rows —
   they transfer with the room BY CONSTRUCTION; nothing to copy. What makes the point-in-time copy own
   its history is re-stamping this room's `messages.characterId` (chat-scoped UPDATE old→copy) +
   `chat_digest_speakers` likewise, so 3.2's delete-degrade can never reach the transferred room. The
   attribution CHECK tolerates this (characterId ⇒ assistant unchanged).
6. **rpg actor re-key:** `rpg_sheets.characterId` UPDATE + `rekeyActor` (`substrate/actor-rekey.ts`,
   promote-actor's exact mechanism) moving `character:<old>` → `character:<new>` refs at the head, +
   tracker-value carrier rows. Chat-keyed planes need NO re-key (ids don't change — handoff ≠ fork).
7. **Optional: the GM preset** (when `gmPresetId` is set and foreign) via `clonePackaged`-style copy;
   otherwise the F1 null-heal applies.
8. **Never copied:** personas (owner-sacred — F2's heal instead), memory vectors (the old buckets
   orphan per D64; the new host's assembly rebuilds under their own bucket — accepted), credentials
   (D17 — never).

**Offer vocabulary:** ONE toggle at nominate — "also give <nominee> point-in-time copies of your
characters and worldbooks used in this room" (+ the preset checkbox when applicable). Per-CLASS
all-or-nothing, not per-item: the ruling's verbatim is class-level ("their characters, worldbooks, the
message variants, etc."), and per-item matrices are exactly the jank the addendum fears. The offer blob
persists beside the nomination (`chats.pendingHandoffOffer` JSON column co-located with
`pendingHostUserId`, cleared by the same swap statement; extensible to per-item later without schema
churn).

**Timing — copy-at-ACCEPT (recommended):** the nominate stores the OFFER; the accept executes it. The
point-in-time is the moment authority moves, so in-flight card edits between nominate and accept ride
into the copy (the "updates in-flight" fork resolves itself), and the nominee's acceptance is what
freezes — nobody receives property they didn't accept. Priced caveat: old-host account deletion inside
the window destroys the originals → the accept degrades to the drop arm (surface it in the
`handoff-accepted`/`-nominated` notifications); copy-at-nominate would escrow against that at the cost
of minting property into the nominee's library before they consent — worse.

**Crash-safety ordering (the promote-actor + fork postures, composed):**
1. Decide every refusal FIRST (promote-actor law): resolve ownership, uniquify handles, build the copy
   plan.
2. Mint library copies (cards, books, junctions) via domain doors BEFORE the swap — orphan-safe: a
   crash leaves stray library items and an un-swapped room; re-accept is idempotent via the provenance
   stamp (find-before-mint, the seeder latch idiom).
3. ONE atomic batch: role swap + pending/offer clear + seat re-points + canon/digest re-stamps +
   chat_books re-points + gmPresetId heal + anchor heal + declined-seat drops + the notification row
   (the existing `emitNotification` statement-coupling).
4. rpg re-key after, degraded-not-broken (`forkGameOntoFork` posture) — or folded into (3) since
   handoff re-keys are UPDATEs; prefer (3) if statement-composable.

**Sad paths under the ruling:** old host edits/deletes originals post-copy — irrelevant by
construction (the room references only copies; the ruling's elegance). Decline = the built, tested D64
drop — removal, not dead seats (a present null-resolving seat is the blank-name class D64 was minted to
kill) and not frozen ghosts (a card snapshot that gates rendering is a `character_versions` by another
name — D28-banned). D22's parked member-tier ceiling composes: when `maxMemberVisibility` lands, the
offer consults it (a card the owner ceilinged below `full` shouldn't full-copy silently) — flag for
D22's return, not now.

## 6. THE ARMS, PRICED (the addendum's ask)

| Arm | Serves the owner's named use? | Honest cost | Verdict |
| - | - | - | - |
| **(a) Status quo (D64 drop) + F1/F2 heals** | NO — "how does the new host get the characters": they don't | 2 statements in the existing batch | The floor, not the answer. The heals ship regardless. |
| **(b) Room-scoped license** (seats grant read through the roster) | Superficially | Inverts D18/D23 (roster junction becomes a cross-tenant read license), poisons stats attribution (roster.ts:382-384 "a roster character is always host-owned, keeping the stats rebuild's ownerId attribution consistent"), room hostage to old-host edits/deletes — §3.5's jank, generalized to cards | REJECT. It's the books' posture, and the books' posture is the pain. |
| **(c) Seat-freeze snapshot** | Frozen half-answer | A card blob that gates rendering = `character_versions` reborn — D28 bans it ("history … NOTHING FKs or gates on") | REJECT on ledger. |
| **(d) Refuse while foreign seats exist** | Hostile no | D64 explicitly superseded the fail-closed refuse; "no path throws `cast_not_owned`" | REJECT on ledger. |
| **(e) Transfer-as-fork** (new host forks; old room archives) | **NO — this is the false economy.** `resolveOwnedCharacterSeats` (fork.ts:240-254) drops foreign seats in forks EXACTLY like handoff does; fork copies the ROOM, never the CARDS. Pairing it with card copies re-buys all of §5's machinery PLUS new-chat-id lineage jank (dead links, member re-invites, parent SET NULL semantics) | REJECT. Fork's solved problem (re-key under new ids) is the one problem handoff doesn't have. |
| **(f) §5 minimized** — one nominate toggle, class-level bundle, copy-at-accept, decline = built drop | YES | The copy plan (§5 items 1-7): ~90% existing machinery (`duplicate` mint, `freeCopyHandle`, `rekeyActor`, provenance idiom, notification coupling); genuinely new = book-copy rows + the offer column + chat-scoped UPDATE re-stamps | **RECOMMEND.** |

**Verdict, plainly (the owner asked):** the simplest route that doesn't betray the options philosophy
is **(f)** — and it is a SMALLER thing than the ruling sketched. One toggle, not an offer matrix; no
variant copying (variants transfer with the room by construction — the only variant-anchored work is
the rpg ACTOR re-key, whose mechanism already exists); the decline path is the shipped, tested D64
behavior; the two heals (F1/F2) belong in the swap batch under EVERY arm including doing nothing else.
If even (f) is deferred, ship the heals alone — F1 and F2 are live silent-degrade defects of the
CURRENT arm, not properties of the proposal.

## 7. Room-state-transfers-with-the-room (verified, per the coordinator's fold-in)

Declining the copy strands NOTHING host-authored: `roomOverrides`/group config/background/tool
limits/variables ride `chats.metadata` (untouched by the swap — §1); `chat_injections` are chat-FK'd;
D16 floors are per-participant rows the promoted host escapes by role (clamp.ts:69) and rewrites via
the host verb; chat-attached books are detachable by the promoted host without ownership
(detach-from-chat.ts). Host-authored room state is the room's, in code, today.

## 8. Verified clean / minor notes

- Swap atomicity both arms (notification-coupled batch and plain batch) — roster.ts:683-695.
- Accept-gate spoof-resistance + leak-free nominate refusals — tested, roster.int.test.ts:861-933.
- Drop-vs-keep seat behavior — tested, roster.int.test.ts:935-996 (real db; `getCard` faked with an
  ownership-mirroring fake — acceptable, the real verb is a two-line owner-scoped read).
- Hostless-room heal on accept (role-keyed demote no-ops) — participant.ts:170-174.
- No `cast_not_owned` anywhere (D64): swept `cast_not_owned` across packages/ — zero hits.
- Export surfaces leak no foreign card bodies (§3.6).
- D106 floor-0 for promoted hosts — clamp.ts:69.
- **U1 (minor):** nominee leaves after nomination → accept fails at `requireParticipant`; the stale
  nomination persists until overwritten. Harmless (re-nominate overwrites; nominee re-join re-enables).
- **U2 (minor):** nominate → host selfLeave → room archived; accept succeeds, room stays archived until
  the new host unarchives (host-gated verb available). Consider clearing `archived` in the swap batch
  if the flow is meant to feel seamless.

## 9. Regions NOT read (scope honesty)

The memory subsystem's bucket internals (D64 declares the orphaning accepted; not re-derived), the
notifications delivery internals beyond the emit coupling, the client handoff UI
(`use-handoff-actions.ts` located, not read — the offer UI is future work), vLLM/provider tiers
(irrelevant to this seam), `start-chat.ts` beyond its role in seat birth. No `pnpm check`/test run was
performed — this is a design review with zero diff under review; all cited tests were READ, not
executed.

## 10. Unconfirmed / low priority

- Whether any OTHER member-owned persona path (beyond the anchor) hits the F2 verb/resolver mismatch —
  the active-persona path resolves per-participant and appeared owner-consistent, but I did not sweep
  every `loadPersona` caller.
- Whether the stats plane holds any row keyed to a dropped character that a handoff-copy re-stamp
  (§5.5) would need to touch (`owner_stats`/`model_stats` are owner-aggregates; a per-character stats
  row re-attribution sweep was not performed).
