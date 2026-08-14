---
kind: design
status: proposed
updated: 2026-08-14
---

# Chat-creation draft mode → instant-create — cost inventory, research, design, migration

> **Charge (owner dogfood 2026-08-14, verbatim intent):** chat-creation draft mode "is driving me
> insane — we have to design around it so hard… it's so clunky and bad UX and we have so much work going
> into just making it semi-usable." **Risk pre-accepted up front:** "if it's just empty chats we never
> started or did something with, we're fine — we can clean up or something." That acceptance is the
> design latitude — the empty-husk cost is PRE-PAID and does not veto the simple architecture.
>
> Stickler design-slot occupant (third), overnight 2026-08-13→14. Every code claim below was read off
> THIS tree this session (whole-file reads unless noted; §8 lists regions not read).

## 0. Verdict in one screen

Draft mode is not one feature — it is a **parallel client-side chat runtime**: a second state plane, a
second set of surfaces, a second commit protocol, and a client-side MIRROR of server resolution logic,
all built so a room can be rich before it exists. The inventory (§2) counts **~1,200 LOC of pure
draft-only files + tests**, draft branches woven through **25+ shared files**, a **9-field kitchen-sink
carry** on `StartChatParams`, **7 dated shipped defects** whose root cause was the draft/committed
split, and **4 standing feature holes** that exist only because the room has no row.

The recommended replacement (§4): **CREATE-ON-START-CLICK.** The picker's explicit "Start chat with N" /
"Blank chat" click calls `chat.startChat` immediately; the room mounts committed-only from frame one.
Unclaimed rooms ("husks") are **hidden from `listChats` by a server-side lens** (the PD-65 `temporary`
twin, per the paged-list-lenses-go-SERVER-side law), **claimed** by the first real activity, and
**reaped** by best-effort nav-away GC plus a TTL sweep belt (the `reapTemporaryChats` pattern). The
entire draft plane — store, twins, mirror, carry — deletes.

The research (§3) sharpens WHY this is right rather than merely simpler: products with a **trivial**
pre-send surface (ChatGPT, Claude.ai) can afford create-on-first-message because there is nothing to
preview; products with a **rich** pre-create surface (Notion, Google Docs, Apple Notes) all chose
instant-create and differ only in husk handling. Orbweaver built the worst quadrant — a RICH pre-send
room (greeting transcript, cast bar, theme takeover, full config panel) over a FAKE object — and every
cost in §2 is the rent on that quadrant. The fix is to make the object real, not to thin the room.

## 1. Prior-law check (charge-mandated, done before designing)

- **`Core-0` §6 partitioning table:** no row governs chat-creation phase or draft state. Chat's domain
  row (constitution §6) makes `startChat` the ONE room-minting entry — preserved by this design.
- **D123 (theme doors, final clause): "Editor drafts mint NOTHING until the first real edit (owner
  overruled auto-delete: interception … a zero-edit Back means zero rows ever existed)."** The closest
  standing ruling, and it points the OTHER way — read carefully it does not conflict: D123 governs
  ENTITY-editor drafts, and its principle is that a zero-edit Back must cost nothing. Under this design
  the picker preserves exactly that: Back/dismiss from the new-chat picker mints NOTHING; the row is
  minted only by the explicit **Start click, which IS the first real edit** (a deliberate creation act
  naming a cast). The husk class this design accepts — start clicked, then abandoned — is precisely the
  class the owner's verbatim charge pre-accepted for chats. §5 F2 records the residual tension for the
  owner's eyes.
- **PD-65 / D107 ⑧ (temporary chats):** born-`temporary` rows are hidden from `listChats` ALWAYS
  (`persistence/queries.ts:312` — `eq(chats.temporary, false)` inside `listMemberChats`) and swept by
  the per-user `reapTemporaryChats` with a settings TTL (`chat.tempChatTtlHours`). This is the husk
  machinery's exact precedent, already ratified and on the tree.
- **Paged-list lenses go SERVER-side** (standing law, restated in the charge): the hidden-husk filter
  must be a WHERE arm in `listMemberChats`, never a client filter — the `temporary` arm at
  `queries.ts:312` is the shape to copy.
- **Staleness design (`docs/design/staleness-and-session-freshness.md`, THEME B axiom):** every server
  write fans a covering event. Husk create/claim/reap are writes → §4.5 gives each its emit. Note the
  deliberate PD-65 divergence: the temp reaper's "deliberately no bus event"
  (`verbs/chat-lifecycle.ts:11`) is safe only because a temporary room is list-invisible everywhere;
  a husk CAN be the open room on the creating device, so husk reap MUST emit `chatDeleted` (the client's
  `chatDeletedFromList` → `goToLanding` seam already handles it, `active-chat-store.ts:156-161`).
- **`[[entity-draft-store-dual-consumers]]` check (charge-mandated):** chat-creation drafts share NO
  machinery with entity drafts. `draft-config-store.ts:4` says so in its own header ("Uses
  createGatedStore (not createEntityDraftStore)"), and `createEntityDraftStore` has **zero live call
  sites** — ast-grep `createEntityDraftStore($$$A)` = 0 matches at scannedFileCount 429 (ts) + 503
  (tsx), literal grep corroborates (only comments, the barrel export, and the definition). Nothing this
  design deletes is shared.
- **D54/D118:** untouched — no new sockets, no query-pin changes; the husk lens is a server WHERE, the
  claim/reap ride the existing chat bus.

## 2. Part 1 — the cost inventory (what draft mode actually costs today, receipted)

### 2.1 The parallel state plane

| Artifact | Receipt | What it is |
| - | - | - |
| `ChatHandle` draft arm | `state/chat-handle.ts:7-16` | a 3-arm discriminated union (`committed \| draft \| landing`) threaded through every chat surface; the `draft` arm carries a client-minted `draftKey` with "no server row" |
| `DraftSeed` | `state/active-chat-store.ts:23-33` | founding roster + anchor + title + `temporary` intent, held in the active-chat store until commit |
| `draft-config-store` | `state/draft-config-store.ts` (153 LOC) | a WHOLE second config model — greetings, rosterOverrides, addedCharacterIds, groupConfig, roomOverrides, injections, startAsGame — keyed by draftKey, "mirrors the `startChat` carry-params one-for-one" (its own header) |
| `newChatPreset` + clear ceremony | `active-chat-store.ts:39-44,87-96` | a second staging slot so a creation-only intent (home temp tile) can pre-arm the picker without leaking into the next plain New chat |
| `sessionKey` / `commitDraft` no-remount dance | `active-chat-store.ts:8-10,116-122`; `chat-content.tsx:71-73` | the promotion must NOT remount the surface mid-first-turn (would tear down the live SSE + in-flight send), so a separate remount key exists purely to survive the draft→committed flip |
| `migrateComposerDraft` | `state/composer-draft-store.ts:68-79`; consumed `chat-room-surface.tsx:88-96` | a scope-key migration written solely to carry composer text across the draftKey→ChatId flip |
| stale-closure clear workaround | `components/composer.tsx:202-211` | a `useRef`-latest-onChange dance existing ONLY because the commit flips the scope key mid-send ("the 'first send doesn't clear' bug") |

### 2.2 The commit bridge and the server-logic mirror

- `lib/draft-commit.ts` (91 LOC): `DraftCarry`/`resolveDraftCommit` — one home needed because **two**
  commit paths must stay byte-identical (composer Send `use-send-message.ts:94-107`; wand
  `use-guided-actions.ts:227-245` `commitDraft` + `runDraftFlow` + the draft arms of `fireOpening` and
  `fireImpersonate` at `:257-263,417-432`).
- **`resolveDraftAnchorPersona` is a client-side MIRROR of the server's anchor seed chain**
  (`draft-commit.ts:74-91` mirroring `verbs/start-chat.ts:376-380`, 4 rungs: explicit > connected-solo >
  current > default) — kept in lockstep by comment only, fed by THREE extra queries the draft thread
  must issue (`message-list-surface.tsx:349-364`: `persona.list` + `settings.getUserSettings` +
  `persona.listConnectedToCharacter`), because "the draft has no chat row to read an anchor from."
  A drift here mis-addresses `{{user}}` in every greeting preview.
- `resolveDraftCharacterIds` — the ONE founding-cast union, homed in `#state` because THREE spellings
  drifted before: "a character present in BOTH halves rendered one row in the Members tab, two greeting
  rows, and would have been written to `startChat` twice — two participant rows for one character"
  (`draft-config-store.ts:135-153`, the file's own header). Live at 6 call sites
  (`active-chat-store.ts:185`, `chat-room-surface.tsx:107`, `message-list-surface.tsx:73`,
  `use-chat-context-state.ts:42`, `draft-commit.ts:45`, — sweep: ast-grep this session).

### 2.3 The twin surfaces (one committed arm + one draft arm, each)

| Committed arm | Draft twin | Receipt |
| - | - | - |
| `ChatThread` (canon + roster) | `DraftGreetingThread` + `synthGreetingRow` (fabricates a full 40-field `MessageView` with synthetic ids) | `message-list-surface.tsx:342-420`; `synth-greeting-row.ts` (72 LOC) |
| committed `SwipeStrip` (generates variants) | `GreetingSwipeStrip` (static card alternates → draft store) | `greeting-swipe-strip.tsx` (61 LOC) |
| `MessageActionsRow` | `GreetingActionsRow` (Edit/Copy/Studio; Fork/Delete/Hide suppressed) + the `greeting` handler-branch plumbed through `MessageRow` props | `greeting-actions-row.tsx` (107 LOC); `message-row.tsx:70-72,101-106,221,285,309` |
| `ChatCastBar` | `DraftCastBar` (seats from cards, not roster) | `chat-cast-bar.tsx:109-129` |
| `ChatHeaderSurface` | `DraftChatHeader` | `chat-header.tsx:257-295` |
| `AddMemberPopover` (roster verb) | `DraftAddMemberPopover` (draft store) | `add-member-popover.tsx:67-74` |
| `CommittedMembersTab` | `DraftMembersTabBody` + `DraftMembersRoster` | `draft-context-tabs.tsx:63-113` |
| `CommittedSettingsTab` | `DraftSettingsTab` + `DraftOverridesTabBody` + `DraftGroupConfigTabBody` + `DraftInjectionsTab` (incl. a WeakMap keying workaround for id-less draft injections) | `settings-context-tab.tsx:212-234`; `draft-context-tabs.tsx:34-61,118-154` |
| `deriveChatTitle` | `draftChatTitle` ("New chat") | `chat-summary-row.ts:18-36` |
| `membersTabJustified` | `draftMembersTabJustified` | `lib/roster.ts:88-90` |
| `ChatContextState` committed phase | a whole `draft` phase arm in the context-panel state union, branched in every tab body | `use-chat-context-state.ts:39-44`; `chats-section.tsx:57-97,145` |

Every draft twin exists because the committed verb/read needs a chat row. **Every committed arm already
exists** — the twins are pure duplication rent. Branch-site sweep (ast-grep, ts+tsx, this session):
`$H.kind === "draft"` = 13 sites, `isCommitted($$$)` = 20 sites across 15 files.

### 2.4 The dressing apparatus (making a rowless room look real)

- `useDraftCastCards` (`data/use-draft-cast-cards.ts`, 102 LOC) + the `peekMatchingQueryData` list-first
  peek — built to kill the "~2s placebo identity" (`? | ? | ? | New chat` topbar) because every draft
  surface cold-fetched N `character.get` reads for data the picker had one frame earlier (its own
  header, side-eye 2026-08-07 §④ P2).
- `useCarriedAppearanceCast` draft arm (`data/use-carried-appearance.ts:46-79`) — the room-theme/
  background takeover resolved from founding CARDS with an all-or-nothing gate, built because "a
  brand-new chat wore the viewer's default chrome and re-skinned itself the instant the first message
  created the row" (owner dogfood 2026-08-06, the file's own header).
- The DRAFT-TRUST render-policy seam (board item #6 since 08-03; resolved as ARM 1, lane #48,
  `docs/design/draft-trust-render-policy-seam.md`): `trustHtml` added to `/api/auth/config` +
  `useRenderPolicyFloor` + `usePreviewRenderPolicy` — a wire field and two hooks whose chat-side
  motivation was that a draft has no server-resolved roster verdict. And the residue is STILL censused
  as unfixed: "in a GROUP draft the per-speaker tints still differ from the committed room's. That
  divergence is unfixed and censused" (`message-list-surface.tsx:329-341`, the ⚠️ header).

### 2.5 The server-side carry

- `StartChatParams` carries **9 draft-flush fields** — `seedGreetings`, `rosterOverrides`,
  `groupConfig`, `roomOverrides`, `injections`, `temporary`, `guided`, `startAsGame`, `opening`
  (`contract/params.ts:64-87`; wire schema `routers/chat.ts:42-75`, whose own comment names it "THE
  DRAFT CARRY"). Group config and room overrides must be routed "through the same schemas the
  `setGroupConfig`/`setRoomOverrides` verbs use, so a draft-carried config is byte-identical to what
  those verbs would persist" (`start-chat.ts:102-105`) — i.e. the verb re-implements five existing
  verbs' write paths as creation params.
- **START-1** (`start-chat.ts:328-349`): the whole degraded-not-broken `openingFailure` apparatus exists
  because creation and the generated opening are FUSED into one call — "the caller saw 'couldn't start
  the chat', stayed on the draft UI, and retried — minting a SECOND room, while the first sat orphaned
  in the chat list." Unfuse creation from generation and this failure class is unreachable.

### 2.6 Feature holes that exist ONLY because the room has no row

1. **The #54 honest-refusal send gate is blind on drafts** — "A DRAFT (null chatId) … is NEVER refused …
   refusing before we know the verdict would break the happy path on every fresh chat"
   (`use-send-availability.ts:13-15`). The one surface where a user most needs "this connection cannot
   serve a turn" is the fresh chat, and it is structurally uncheckable there.
2. **Background is committed-only** — "Background has no draft store (no server row yet)"
   (`settings-context-tab.tsx:220-221`).
3. **No invites pre-send** — "An invite can only land once the chat row exists"
   (`use-carried-appearance.ts:29-30`); a multi-human room cannot be composed before its first message.
4. **No Preview tab, no message selection** on drafts (`chats-section.tsx:94`,
   `chat-room-surface.tsx:182`) — minor, but each is a `when`/ternary somebody had to write and test.

### 2.7 The shipped-defect ledger (dated, from the files' own headers — the strongest cost evidence)

| Date | Defect | Root cause class | Receipt |
| - | - | - | - |
| 2026-08-06 | room re-skinned itself at the first send (theme + background) | chrome gated on the committed roster | `use-carried-appearance.ts:4-11`; `chat-room-surface.tsx:99-103` |
| 2026-08-06 | group draft showed NO cast bar; second character discoverable only by scrolling | strip existed only for committed | `chat-cast-bar.tsx:6-10` (side-eye P2) |
| 2026-08-07 | ~2s placebo identity `? \| ? \| ? \| New chat` on every fresh draft | N cold `character.get` per draft surface | `use-draft-cast-cards.ts:3-15` |
| 2026-08-07 | mobile topbar titled a group draft by ONE member while desktop joined all | `draftChatTitle` existed twice, one copy wrong | `chat-summary-row.ts:24-29` (side-eye finding 1) |
| pre-hardening | one character in both seed and panel-add = TWO participant rows written at commit | three spellings of the founding-cast union | `draft-config-store.ts:143-147` |
| pre-hardening | first send didn't clear the composer (text re-populated the fresh chat) | commit flips scope key under a stale closure | `composer.tsx:202-207` |
| pre-START-1 | opening failure orphaned a REAL chat behind the draft UI; retry minted a second room | creation fused with generation | `start-chat.ts:330-334` |
| unfixed, censused | group-draft per-speaker tints differ from the committed room | draft rows have no participants plane | `message-list-surface.tsx:339-341` |
| unfixed (found this review) | **cross-session composer-text collision**: `draftKey` is a module-counter (`draft-N`, `active-chat-store.ts:49-55`) that RESETS on reload, while `composer-draft-store` PERSISTS non-empty text under that key (#38, owner pick 08-09). Type in a draft → don't send → reload → start a new draft (any cast): the first fresh draft re-mints `draft-2` and the PREVIOUS session's unsent text repopulates a different room's composer. Code-confirmed by construction (counter at `:49-55` + persistence at `composer-draft-store.ts:53-57`); not live-driven. | a non-durable key namespace feeding a durable store | as cited |

### 2.8 The budget line

Pure draft-only files + their tests: **~1,207 LOC** (wc, this session: draft-config-store 153 +
draft-commit 91 + synth-greeting-row 72 + draft-context-tabs 154 + greeting-swipe-strip 61 +
greeting-actions-row 107 + use-draft-cast-cards 102 + 5 test files 467). On top of that: the draft
branches in 25+ shared files (§2.1/2.3 tables), the 9-field server carry + its schemas + START-1, four
CT suites' draft stories, and THREE separate side-eye/dogfood remediation campaigns (08-06, 08-07 ×2)
whose findings were all one class. This inventory IS the justification budget the charge asked for.

### 2.9 What is explicitly NOT draft-mode cost (the conflation fence)

- **MESSAGE-text drafts** — `composer-draft-store` (unsent composer text per room, reload-surviving,
  #38) and `message-edit-draft` (in-progress edits). These are keyed by scope/message id, serve
  committed rooms equally, and are **KEPT** — instant-create IMPROVES them (the scope key becomes a
  durable ChatId from frame one, dissolving §2.7's collision and retiring `migrateComposerDraft`).
- **ENTITY drafts** — `createEntityDraftStore` (zero live call sites, §1) and the form factories'
  draft/autosave semantics. Unrelated machinery; untouched.
- The **new-chat PICKER ceremony** itself (`new-chat-picker-surface.tsx`) — kept as-is; it becomes the
  creation trigger instead of the seed-stager.

## 3. Part 2 — research: how the top products handle creation

> Method: SearXNG (self-hosted) discovery → trafilatura page text, per `~/.claude/rules/web-fetching.md`.
> Fetched text treated as data. Citations inline; fetched 2026-08-14.

- **ChatGPT — create-on-first-message over a TRIVIAL pre-send surface.** A new-chat screen is a bare
  composer + model picker; a conversation exists in the sidebar/history only once a normal chat actually
  happened, and "Temporary Chat … does not appear in your history" by design
  (https://www.llmnesia.com/blog/why-is-chatgpt-not-saving-conversations; Temporary also per
  https://help.openai.com/en/articles/8590148-memory-faq). Claude.ai behaves the same way. **The lesson
  is conditional, not absolute:** lazy creation is free exactly when there is nothing to preview — no
  cast, no greeting, no theme. Orbweaver's pre-send room is the OPPOSITE of trivial, so this pattern
  does not transfer; PD-65 already ports the one piece of it that does (Temporary).
- **Notion — instant-create with NO husk handling = the cautionary receipt.** "Once you hit + … and
  change your mind, there's no Cancel option and a page you don't want gets created"; users report
  hundreds of empty "Untitled" pages
  (https://www.reddit.com/r/Notion/comments/nlpg9w/find_all_empty_untitled_pages_and_batch_delete/).
  Instant-create without a lens or GC converts the pre-paid husk cost into permanent list pollution.
  This is the arm to reject, and the reason §4 hides-then-reaps.
- **Apple Notes — instant-create + auto-delete-empty-on-exit.** The note is real the moment you enter
  it; leave it empty and the system deletes it automatically (user account of exactly this mechanism:
  https://apple.stackexchange.com/questions/405792/accidentally-emptied-a-note-which-was-then-automatically-deleted).
  The polished nav-away GC arm — but it relies on a reliable "left the note" signal a web client does
  not have (tab kill, crash), so it can only be the best-effort arm, never the belt.
- **Discord — the object always exists; "close" is a LIST LENS, not a delete.** Closing a DM "means hide
  the conversation from your sidebar. It does not mean delete the messages … reopening the chat can
  bring it back" (https://unpost.app/en/blog/what-does-close-dm-mean-on-discord/; user-confirmed
  semantics https://www.reddit.com/r/discordapp/comments/1acotaz/). Real objects + a visibility
  projection is exactly the server-side-lens shape our own PD-65 arm already implements.
- **Linear-class drafts** are the entity-editor pattern (explicit "Save as draft" on issue creation —
  e.g. https://livedemo.ai/tutorials/how-to-create-issue-drafts-in-linear/), i.e. D123's territory, not
  chat's — cited to mark the boundary, not to import.

**Synthesis — the quadrant argument.** Plot pre-create surface richness × object reality:
trivial-surface/lazy-object (ChatGPT) works; rich-surface/real-object (Notion, Docs, Apple Notes) works
and differs only in husk hygiene; rich-surface/FAKE-object is orbweaver's quadrant, and §2 is its
itemized rent — every one of the seven dated defects is the fake object leaking through the veneer.
The hypothesis-to-beat (instant-create + husk GC) survives contact with the corpus, with one
sharpening: creation should fire at the **Start click** (the deliberate act that already exists in the
picker ceremony), not at surface-entry — which also keeps D123's interception principle intact.

## 4. Part 3 — the design

### 4.1 Creation: the Start click mints the row

`NewChatPicker.found()` (`new-chat-picker-surface.tsx:45-50` today writes client state) becomes: await
`chat.startChat` with the CREATION-INTENT params only — `characterIds`, `anchorPersonaId?`, `title?`,
`temporary?` — then `selectChat(result.chat.id)`. The modal shows its own pending state for the one
round-trip (local server, tens of ms). Back/dismiss still mints nothing (D123 interception preserved).
Every other launcher (home temp tile, character-page "Start chat", persona intents) rides the same
ceremony via `newChatPreset`, unchanged.

The opening policy resolves at creation exactly as it resolves at commit today
(`resolveOpeningPolicy`, `start-chat.ts:79-87`): greeting rows are REAL canon from frame one, rendered
by the ONE committed thread through the ONE roster plane. `opening:"generate"` stops being a creation
arm entirely (§4.4).

### 4.2 The husk: definition and column

**Husk = a chat that was created but never claimed.** Claim = the first of: a user-role message
committed · a generated turn run (opening included) · any explicit host chat-row or config write
(title, star, archive, group config, room overrides, injection write, roster change, invite,
rpg.startGame). The owner's words draw this line — "never started **or did something with**" — so
config effort claims; only pure navigation and unsent composer typing leave a husk unclaimed.

Mechanism: nullable **`chats.startedAt`** (null = husk), stamped by one internal `claimChat` chokepoint
the qualifying verbs call. Schema change SQUASHES into `0000_baseline.sql` (doctrine; no `0001` — the
db-structure gate does not catch this, per the standing blind-spot note). A column beats an
EXISTS-over-messages predicate: it is index-friendly for the list lens, and it lets host-edit claims
count without message inspection. Forks copy canon and imports write canon → both born claimed (stamp
`startedAt` at fork/import mint). `temporary` rooms are orthogonal (already lens-hidden; a temporary
husk reaps by whichever TTL fires first).

### 4.3 Visibility: a server-side lens, the PD-65 twin

`listMemberChats` gains `WHERE (chats.startedAt IS NOT NULL OR chats.hostUserId = viewer… )` — **no**:
simpler and stricter, mirroring `temporary` exactly: husks are hidden from the library list for
EVERYONE including the creator (`eq`-style arm beside `queries.ts:312`). The creating device holds the
room via the active handle, exactly as a draft is held today — but now it is a real, reloadable,
deep-linkable room (`getChat` by id still answers its members; nothing detail-level changes).
Consequences, each deliberate:

- **No "Untitled chat" husk rows churn the list** on picker bounces (the Notion failure mode, and the
  exact "Untitled-chat roster handling" cost class the #38 smalls touched).
- **Multi-device:** husks do not appear on other devices' lists. Cross-device pickup of an unstarted
  room is NOT a supported flow — strictly better than today, where a draft does not even survive a
  reload on the SAME device.
- Free rider: **bulk export enumerates via the list path → husks are automatically excluded** (and the
  chat-bundle "what does not travel" table's `temporary` argument — "a room its own TTL sweeper already
  decided to reap" — extends verbatim to husks). D28's snapshot plane is untouched (rosters reference
  live character rows by id, never copies — `start-chat.ts:6-7`; husk deletion cascades chat-side only).

### 4.4 Unfusing creation from generation (START-1 retired)

"Guide the opening" / "generate an opening" becomes an ordinary post-creation action against the real
room (the existing `chat.generate` fire path with the `opening` action kind). The
`opening:"generate"`+`guided` arms and the whole `openingFailure` degrade apparatus
(`start-chat.ts:263-349,472-481`) delete: a failed opening on an already-real room is just a failed
turn with the standard toast — the room is in the list-hidden husk state, retry is a plain retry, and
the double-mint class is unreachable by construction. Impersonate-on-draft's forced commit
(`use-guided-actions.ts:417-432`) likewise collapses to "the room already exists."

### 4.5 Lifecycle emits (staleness-design / THEME B compliance)

- **Create:** unchanged — `chatCreated` + `emitChatChanged` + per-greeting `messageCommitted`
  (`start-chat.ts:464-470`). The list refetch a hidden husk triggers is a no-op row-wise; harmless, and
  keeping the verb's emit total is the axiom.
- **Claim:** `claimChat` fans `chatsChanged` (the hidden→visible transition is a LIST change on every
  member device). The first send/turn already fans canon events; the explicit-edit claims already fan
  `chatUpdated` — the claim fan is the belt that makes the transition itself covered rather than
  incidental. Verification obligation for the build lane: assert a claimed husk appears on a second
  device's list without reload.
- **Reap:** each reaped husk emits `chatDeleted` (the delete-verb precedent), because the husk can be
  an OPEN room on the creating device — `chatDeletedFromList` then returns it to landing instead of
  leaving a room pointed at a dropped chat. This deliberately diverges from `reapTemporaryChats`'
  "deliberately no bus event" (`chat-lifecycle.ts:11`), and §1 records why the PD-65 argument does not
  transfer.

### 4.6 Reaping: best-effort nav-away + TTL belt

- **Nav-away (best-effort, the Apple Notes arm):** when the client deliberately leaves an unclaimed
  husk (`goToLanding` / `selectChat` to another room), it fires a `chat.reapHusk {chatId}` mutation
  (host-only, verb no-ops unless `startedAt IS NULL` — the server re-checks, never trusts the client's
  "it's a husk"). Skip when the room's composer holds non-empty text (the user may come back). Most
  husks die within seconds of abandonment.
- **TTL sweep (the belt, the PD-65 pattern):** `reapTemporaryChats` generalizes to also sweep
  `startedAt IS NULL AND createdAt < now - ttl AND` no non-host humans/invites (per-user, host-scoped,
  same FK-cascade bulk delete — embeddings/memory/stats rows ride the SAME cascade the existing delete
  verb already exercises, nothing new to invent). TTL: a fixed generous const first (proposed 24h;
  see fork F5) — long enough that "typed something, slept, came back" survives via the composer-text
  skip + the window.
- Crash/tab-kill husks are exactly what the belt exists for; no `beforeunload` heroics.

### 4.7 Stats timing

`pushCreationStatsDeltas` (`start-chat.ts:202-261` — `chatCreatedDelta`, per-character `newCharacter`
bumps, greeting `canonMessageDelta`s) MOVES from creation to CLAIM. Two reasons, both load-bearing:
(a) husk churn would inflate chat-created economics with rooms nobody started; (b) the
`firstChat` probe (`characterSeatedInAnotherChat`, `start-chat.ts:387`) is poisoned by husks — a husk
seating a character makes the next REAL chat read "not first," and the `newCharacter` bump is lost
forever even after the husk reaps. Moving the whole delta block to `claimChat` (which knows the seeded
greeting views) fixes both without reversal bookkeeping. The `firstChat` probe itself gains an
`AND startedAt IS NOT NULL` arm so husks never count as a character's seat for firstness.

### 4.8 The greeting window on real rows

Today's pre-send greeting affordances map onto the EXISTING malleability window — "a greeting is
malleable/swipeable until then [the first user turn]" (`start-chat.ts:22-23`;
`freezeGreetingVolatiles`, `verbs/turn.ts:1044`):

- **Edit**: the committed message-edit path already serves it (real row, real verb). The draft-specific
  save target (`setDraftGreeting`) deletes.
- **Alternate-stepping (the greeting swipe)**: the ONE genuinely new capability — a small host-gated
  verb (`chat.setSeededGreeting {chatId, messageId, text}` or an arm on the existing edit verb),
  refusing after freeze, that replaces a seeded greeting row's content with another card alternate.
  The client strip keeps its exact chrome, pointed at the verb instead of the draft store.
- **Greeting Studio**: already writes the CARD via `character.update` (`greeting-actions-row.tsx:11-15`)
  — unchanged, plus the same set-shown call every other alternate pick makes.
- **Add-member in the window**: fork F6 — recommended: `addMember` on an unfrozen chat also seeds that
  character's greeting row (preserves today's draft UX where a panel-added member greets); after
  freeze, today's no-greet join semantics.

### 4.9 What deletes, what shrinks, what survives

**Deletes outright** (post-migration): `draft-config-store.ts` · `draft-commit.ts` (all of it — carry,
bridge, anchor mirror) · `synth-greeting-row.ts` · `draft-context-tabs.tsx` · `greeting-swipe-strip`'s
store arm · `greeting-actions-row.tsx` (folds into the committed actions row) · `DraftCastBar` ·
`DraftChatHeader` · `DraftAddMemberPopover` · `DraftSettingsTab` · `useDraftCastCards` + the
carried-appearance draft arm (§4.10 caveat) · `draftChatTitle`/`NEW_CHAT_TITLE` ·
`draftMembersTabJustified` · the `draft` phase of `ChatContextState` · the `ChatHandle` `draft` arm
(union shrinks to `committed | landing`) · `DraftSeed`/`draftSeed`/`commitDraft`/`onChatStarted` ·
`migrateComposerDraft` · the composer's stale-closure clear ref dance · both client commit paths'
draft branches · the 5 draft-only test files + every draft story in the CT suites.

**Shrinks:** `StartChatParams` drops `seedGreetings`/`rosterOverrides`/`groupConfig`/`roomOverrides`/
`injections`/`guided` + the `generate` opening arm (the five config carries become what they already
are for committed rooms: the existing verbs, now reachable because the room exists) — keeping
`characterIds`/`anchorPersonaId`/`title`/`opening(none|first-message|greet-all)`/`temporary`.
`startAsGame` becomes a plain post-create `rpg.startGame` call from the toggle (the verb exists;
ordering-before-first-turn is preserved trivially because the first turn is now always later).
`sessionKey` reduces to the chat id.

**Survives untouched:** the picker ceremony + `newChatPreset` · PD-65 temporary chats ·
`composer-draft-store` (message text — now keyed by real ChatIds; §2.7's collision dissolves) ·
`message-edit-draft` · the greeting Studio · `deriveChatTitle`/`UNTITLED_CHAT_TITLE` (claimed blank
chats legitimately read "Untitled chat") · the DRAFT-TRUST floor machinery (it now serves ONLY its
character-editor purpose, which #48 built it for).

**Dissolved open items:** the composer nav-away-discard design pass (`composer-draft-store.ts:10-11`,
"still open on the board") folds into husk semantics; the DRAFT-TRUST chat-side residue (group-tint
divergence, untrusted-floor preview) becomes unreachable — the room renders through the roster plane
from frame one.

### 4.10 One honest cost the design pays

Instant-create trades the draft plane's complexity for **creation latency at the Start click** (one
`startChat` round-trip incl. the atomic batch — local-stack milliseconds; the picker shows pending) and
**husk existence** (pre-paid by the charge). The `useDraftCastCards` list-first lesson survives as a
lesson, not code: the room's first frame reads `getChat`, which `startChat`'s response already returns
(`StartChatResult.chat` is a full `ChatDetail` — seed the query cache from the mutation result, the
`echo` idiom, and the first frame is warm with ZERO extra reads — strictly better than today's peek).

### 4.11 Migration path (staged R-program; each stage lands green alone)

- **R0 — server substrate (one lane):** `chats.startedAt` (squash into `0000_baseline.sql`) ·
  `claimChat` chokepoint + claim calls in the qualifying verbs · stats-delta move (§4.7) + firstChat
  probe arm · the `listMemberChats` lens arm · `reapHusk` + the TTL sweep generalization + emits (§4.5)
  · int tests: husk hidden / claim reveals / reap fans `chatDeleted` / stats fire at claim / firstChat
  ignores husks. `startChat` still accepts the full carry (client unchanged — R0 is invisible).
- **R1 — client flip (one lane):** picker awaits `startChat` → `selectChat`; room mounts
  committed-only; cache-seed from `StartChatResult`; nav-away reap call; wand/impersonate lose their
  commit paths; `startAsGame` toggle → direct `rpg.startGame`; greeting Edit routes to the message
  verb. CT sweep obligation: every draft story in the four CT suites + `tests/**` grep for `draftKey`/
  `DraftSeed` literals (the shared-value-change battery law).
- **R2 — the deletion pass (one lane):** everything in §4.9 "deletes" + `StartChatParams`/wire-schema
  shrink (same pass — one client, no compat window) + knip/depcruise/api-surface floors (file removals).
- **R3 — greeting-window polish (small lane):** the alternate-stepping verb + strip repoint + F6's
  add-member-greets arm + `freezeGreetingVolatiles` refusal test.
- **Law landing (rides R0):** a D-ledger entry minting the model (draft clause: *"A chat row exists
  from the creation click; an unclaimed room is list-hidden by a server lens, claimed by its first
  activity, and reaped best-effort on nav-away with a TTL belt; creation-time stats fire at claim"*),
  board rows updated (this row → designed; the nav-away-discard open item → dissolved here).

## 5. Part 4 — owner forks (each with a recommendation)

| # | Fork | Arms | REC | Why |
| - | - | - | - | - |
| F1 | Creation moment | (a) Start-click mints the row · (b) surface-entry mints · (c) keep a thin draft for blank-chat only | **(a)** | (a) is the only arm that preserves D123's zero-cost-Back AND kills the whole twin plane; (b) mints husks on misclicks for nothing; (c) keeps the entire `ChatHandle` fork alive for one flow — the rent stays |
| F2 | Husk visibility | (a) server-lens hidden until claim · (b) visible with "New" treatment | **(a)** | (b) is the Notion receipt (§3) — list pollution + "Untitled chat" churn; (a) is the PD-65 twin and gets export exclusion free. D123's spirit also favors invisible-until-real |
| F3 | Reap semantics | (a) nav-away best-effort + TTL belt · (b) TTL only · (c) nav-away only | **(a)** | (c) alone leaks on crash/tab-kill (no reliable signal on the web — §3 Apple Notes caveat); (b) alone leaves same-session re-entry finding day-old husks via nothing (harmless but untidy); (a) is both, each trivially small |
| F4 | Claim predicate | (a) any canon row OR any explicit host write · (b) user message / generated turn only | **(a)** | the owner's own words — "or did something with"; (b) would reap a room the user spent effort configuring |
| F5 | Husk TTL | (a) fixed const 24h · (b) per-user knob (the `tempChatTtlHours` pattern) day one | **(a)** | a knob nobody asked for is D107 surface; the const can graduate to a knob the day it pinches (the reap TTL precedent shows the lift is cheap) |
| F6 | In-window greeting semantics | (a) alternate-step verb + addMember-greets-before-freeze · (b) accept committed semantics (no post-create greeting swipe; late adds don't greet) | **(a)** | (b) silently drops two live affordances the draft UI has today (`greeting-swipe-strip`, panel-add greeting rows) — a UX regression the owner would feel on day one; (a) is one small host-gated verb riding the existing freeze seam |
| F7 | Reload behavior on an unclaimed husk | (a) land on landing (today's draft-loss parity) · (b) persist last-active chat id (durable-local contract, staleness §4.2) and reload INTO the husk | **(a) now, (b) as a rider** | (b) is desirable but is a durable-local W6-class change owned by the staleness program's lanes — name the seam, don't fork that program from here |

## 6. Verification log (what this review checked and how)

- Whole-file reads: `chat-handle.ts`, `active-chat-store.ts`, `draft-config-store.ts`,
  `composer-draft-store.ts`, `draft-commit.ts`, `synth-greeting-row.ts`, `use-draft-cast-cards.ts`,
  `use-carried-appearance.ts`, `chat-room-surface.tsx`, `message-list-surface.tsx`,
  `use-send-message.ts`, `use-guided-actions.ts`, `use-chat-context-state.ts`, `chat-cast-bar.tsx`,
  `draft-context-tabs.tsx`, `chats-section.tsx`, `chats-topbar-header.tsx`, `chats-selection-title.ts`,
  `chat-summary-row.ts`, `chat-title.ts`, `chat-content.tsx`, `new-chat-picker-surface.tsx`,
  `greeting-swipe-strip.tsx` (partial 40), `greeting-actions-row.tsx` (partial 40),
  `verbs/start-chat.ts`, `draft-trust-render-policy-seam.md`, `staleness-and-session-freshness.md`.
- Targeted reads: `contract/params.ts` (StartChatParams), `routers/chat.ts` (startChat schema + router),
  `persistence/queries.ts` (temporary lens), `chat-lifecycle.ts` (reaper posture), `composer.tsx`,
  `message-row.tsx`, `use-send-availability.ts`, `chat-header.tsx`, `settings-context-tab.tsx`,
  `add-member-popover.tsx`, `lib/roster.ts` (draft twins).
- Sweeps (ast-grep, ts AND tsx, non-zero scan counts): `$H.kind === "draft"` (13) · `$H.kind !==
  "draft"` (2) · `isCommitted($$$)` (20) · `$H.kind === "committed"` (2) · `createEntityDraftStore($$$)`
  (0 at 429+503 scanned, literal-grep corroborated) — the absence claim carries two methods.
- Ledger/board: D-ledger grep for draft/startChat/temporary rulings (D123/PD-65/D107 hits detailed in
  §1); board rows 732-746 (the charge), 825-826 (#38 smalls), 84-95 (DRAFT-TRUST arc).
- Web: 5 SearXNG queries + 1 trafilatura fetch; all external claims carry URLs (§3).

## 7. Not run / not verified this session

No code was executed or mutated (research charge; read-only outside this doc). The §2.7 cross-session
collision is code-confirmed, not live-driven — a one-minute live repro is: type in a fresh draft, don't
send, reload, open a new draft, observe the composer. The claim-fan coverage assertion (§4.5) and the
delete-cascade inheritance for reap are named as build-lane verification obligations, not verified here.

## 8. Regions not read (scope honesty)

`verbs/turn.ts` beyond the `freezeGreetingVolatiles` locations (the freeze mechanics are taken from
`start-chat.ts`'s FLAG note + the grep receipt) · `verbs/roster.ts` bodies (addMember's exact shape —
R3's reading) · `persistence/roster.ts` / `canon-write.ts` internals · the rpg `startGame` verb body ·
`chat-list-surface.tsx` / landing surfaces (list rendering — the lens makes them husk-blind by
construction) · the export/chat-bundle code (the exclusion claim rides the D-ledger's "what does not
travel" table + the list-path enumeration argument, both cited) · `entry/compose/chat.ts` wiring beyond
what §2 cites. None of these can change the inventory's receipts; each is named where its lane must
read it.
