---
kind: design
status: active
updated: 2026-09-05
---

# The one-place Regex panel — the SYSTEMS lens (lane cb-regex-sys)

What the tree can serve today, what each control actually costs, and the exact seams. Every claim carries a
`path:line`. Read-only lane: no code, no suites, no gates. Load at start 38.71 / at finish 20.62.

## Verdict (three sentences)

**The read does not exist and the panel does — almost.** There is no server read anywhere that answers "what
regex applies to THIS chat, in run order, with provenance" (the union is computed inside the turn and thrown
away: `packages/server/src/domain/chat/substrate/assemble-gather.ts:406-407`, `verbs/edit.ts:247-248`), but
every ingredient is already injected on `ChatContext` and every client part — the picker with a full
**unmounted** `chat` arm, the reorder editor, the row anatomy — is already built and shipping to two other
surfaces.

**The switches split three ways and only two are cheap.** The per-row switch is free today (the library
`enabled` column through `regex.updateScript` / `regex.bulkSetEnabled`, both `busDriven`); a per-TIER allow is a
well-trodden ~9-file chat-metadata knob with no migration (the `setHostDisplayScripts` path verbatim); a
per-CHAT mute of an inherited script is a new table, a new resolver stage, a sweep classification and a
vocabulary collision — do not assume it.

**Two premises in `STUDY.md` §5 are refuted by the tree and the sibling IA lanes must not build on them:** the
room display-scripts opt-in is *not* a per-tier allow that can be "generalised to the prompt leg" (it reads
the host's WHOLE owned library filtered to `enabled ∩ DISPLAY` and ignores all four junctions —
`domain/regex/verbs/attachments/list-room-display-scripts.ts:28-29`), and the effective panel cannot be
member-visible (the union resolves under the host's frozen `runAsUserId`; showing it to a member names the
host's private library rows — `domain/chat/contract/regex.ts:8-11`, D19).

## The control table (Q8)

| Control | Exists today (verb / query) | New work (schema · verb · wire) | Size | Risk |
| - | - | - | - | - |
| **See every applying script in run order, with provenance** | nothing on the wire. The union is `resolveHostTierRegexScripts` (`chat/substrate/regex-tier.ts:22-33`) called only inside the turn | verb `chat.listEffectiveRegex` (host-gated) composing the already-injected `ctx.resolveRegexSources`; contracts view `EffectiveRegexRow` reusing `RegexAttachScope`; one router proc + sweep classification; **un-flatten** the character slice (`domain/regex/persistence/resolve-sources.ts:31` already computes the grouping and then `flatMap`s it away) | **M** | low — no new persistence, no new gate; the only churn is 4 tsc-forced sites on `ResolvedRegexSources.character` |
| **Per-row on/off (off everywhere)** | `regex.updateScript {enabled}` (`contracts/src/regex/index.ts:240`) and `regex.bulkSetEnabled` (`verbs/scripts/bulk-set-enabled.ts:14-34`); both emit `regexChanged`, client map path-invalidates the whole regex router (`client/src/data/invalidation.ts:212`) | **none** | **S** | low. Semantics = ST's (`STUDY.md` §5) — off in every chat, which the row copy must say |
| **Per-TIER allow ("stop this preset's scripts here")** | **nothing.** The room display toggle is a different concept (see below) | `ChatMetadata.regexTiers` sub-blob (`contracts/src/chat/metadata.ts:239-301`) + parse row (`domain/chat/contract/metadata.ts:29-50`) + `chat.setRegexTierAllow` on the `setHostDisplayScripts` path (`verbs/participants.ts:355-370`, router `chat.ts:585-587`, `ChatDetail` field, client hook) + `HostTierRegexSources.allow` and the drop **before** dedup in `regex-tier.ts` | **M** | low-medium. No migration (JSON sub-blob, `.catch(undefined)` fault isolation). Default must be ABSENT ⇒ allowed, or every existing room silently changes behavior |
| **Per-CHAT mute of an inherited script** | **nothing, and no cheap arm** | either `chat_regex_mutes` (new table ⇒ schema + migration + 2 verbs + 2 procs + sweep rows + a resolver stage + the read's `muted` field), or a `disabled` column on `chat_regex_scripts` — which **structurally cannot** mute a preset/character/global script (no junction row exists for it: `db/src/schema/regex.ts:143-158`) | **M-L** | medium. Two "off" concepts on one row; and "mute" is already spent on characters (`unmutedCharacters`, vocabulary-map.md:37) |
| **Reorder the CHAT tier from the room** | `regex.applyScopeOrder` chat arm, `requireChatHost` (`verbs/attachments/apply-scope-order.ts:77-85`) + the built `RegexScopeOrder` component (`client/src/components/regex-scope-order.tsx:44-95`) | wire the existing component to the chat scope | **S** | low |
| **Reorder global / preset / character from the room** | the verb *permits* it (global gate is script ownership, `apply-scope-order.ts:38-45`; preset/character gate the carrier) | — | **S** to build, **do not** | **high**: a room-local gesture silently re-orders every other chat on that preset/character. One home is the library |
| **Attach / detach at the chat tier from the room** | `regex.attachToChat` / `detachFromChat`, host-gated (`attach-to-chat.ts:14-27`, `detach-from-chat.ts:12-28`) + `RegexScriptPicker scope={{kind:"chat"}}` — **fully built, ZERO production call sites** (`pnpm ast jsx RegexScriptPicker`: 5 hits / 3 files, scanned=6958; the two prod sites are character + preset) | mount it | **S** | low. This is the single largest "already paid for" item on the board |
| **Move a script between tiers** | no transactional verb — detach + attach, two calls; attach appends at the tier end (`attach-to-chat.ts:23`) | a `moveScopeAttachment` batch verb if wanted | **S** | medium if built as two calls: a failed second call leaves the script attached nowhere |
| **Named enable-sets (ST "Regex Presets")** | nothing | new table `regex_script_sets` (ownerId, name, scriptIds) + apply/create/update/delete/list + router + client + a **vocabulary mint** | **L** | medium: new table (4-site landing), and "preset" is owner-loaded (generation config only, AGENTS §6) |
| **A member sees what the room applies** | `regex.listForChat` — member-gated, room-public, ordered (`verbs/attachments/list-for-chat.ts:11-16`) | read-only rack (the Lorebooks precedent) | **S** | low |
| **A member's rack repaints when the host attaches** | **broken today** — `regexChanged` is a per-USER channel (`contracts/src/user-bus/index.ts:45-46`) and `attachToChat` emits only `emitUserEvent(ownerId, …)` (`attach-to-chat.ts:26`) | add `"regex"` to `ROOM_ENTITY_KINDS` (`contracts/src/chat/bus.ts:372`) — three tsc-forced sites (the tuple, `entry/compose/room-reach.ts` `ROOM_REACH`, the client `BUS_FILTERS.roomEntityChanged` Record; the belts are named at `room-reach.ts:14-19`) + an injected fan op on `RegexContext` | **M** | low mechanically; it is a **live correctness bug** today, see Q7 |

## The answers

### Q1 — THE EFFECTIVE READ

**No such read exists.** The regex router is 24 procs and none of them is it (`transport/trpc/routers/regex.ts:45-168`
read in full: `listScripts`, `getScript`, CRUD, the bulk arm, the two portability doors, `listScriptUsage`,
`listGlobal`/`listForCharacter`/`listForPreset`/`listForChat`, `listRoomDisplayScripts`, `applyScopeOrder`).
The union exists only as an in-turn value: `resolveHostTierRegexScripts` (`chat/substrate/regex-tier.ts:22-33`)
is called from exactly two places — `assemble-gather.ts:406-407` and `verbs/edit.ts:247-248` — and lands on
`AssembleContext.hostTierRegexScripts` (`contracts/src/chat/assemble.ts:635`), which is an assembly-internal
field, not a trace the preview panel projects (`rg -n -i regex` over `assembly-preview-panel.tsx` +
`assembly-preview-diagnostics.tsx`: zero matches; the whole `features/chat` tree mentions regex only in the
display-leg render path and the host toggle, 10 files).

**Design.**

- **Home: `domain/chat`, not `domain/regex`.** The read needs the room's active preset id and its seated
  character ids; regex reads neither the roster nor chat metadata by design (`domain/regex/contract/service.ts:5-7`,
  the guards are injected). Chat already holds both and already has `ctx.resolveRegexSources` injected.
  `contract/resolve.ts:4-5` states the ownership verbatim: "Chat still owns the UNION … this op resolves, it
  never unions." So: **`chat.listEffectiveRegex`**.
- **Input:** `{ principal, chatId }`. The owner id is *not* a parameter — it is the room's host, resolved
  server-side exactly as the turn does (`runAsUserId`, D19). A member has no parameter on this surface and
  must not get one.
- **Gate: `requireChatHost`.** Not member. `listForChat` is member-readable because the room's own attachments
  are room-public prompt content (`list-for-chat.ts:1-5`), but the effective set additionally names the host's
  GLOBAL, PRESET and CHARACTER library rows — precisely the thing `listRoomDisplayScripts` is built to keep
  from a member ("a member can never learn what scripts the host owns while it is off",
  `list-room-display-scripts.ts:6-8`). The house precedent for a host-only room panel is the Preview context
  tab, which is `when: (s) => s.isHost` + `crown: true` (`client/src/features/chat/lib/chats-section.tsx:100-109`).
- **Output shape** (home: `@orb/contracts/regex`, beside the row and the scope union it reuses):

  ```
  EffectiveRegexRow {
    script: RegexScriptRow            // carries enabled + placement already (queries.ts:31-33)
    tiers: readonly { scope: RegexAttachScope; position: number }[]  // every tier it is attached at
    // `tiers[0]` IS the tier it runs at (earliest wins, regex-tier.ts:26-32)
  }
  EffectiveRegexView {
    rows: readonly EffectiveRegexRow[]   // RUN ORDER, deduped, one row per script
    allow: { preset: boolean; characters: boolean; chat: boolean }  // once Q2c lands; before that, omit
  }
  ```

  `RegexAttachScope` already exists and already carries the discriminating id
  (`contracts/src/regex/index.ts:277-282`) — re-spelling a tier union here would be a `no-inline-union-redecl`
  violation and a second home for the axis.
- **`position` is the RANK WITHIN THE SLICE, and that is exact, not an approximation.** Every `listFor*`
  query orders by the junction `position` (`domain/regex/persistence/queries.ts:162-190` and `domain/regex/persistence/queries.ts:230-237`) and
  `applyScopeOrder` writes positions back **by array index** (`apply-scope-order.ts:55-56`). Read-rank and
  write-index are the same number, so the panel can hand the reordered array straight back with no position
  arithmetic and no schema change.
- **What it composes:** `ctx.resolveRegexSources` (already on `ChatContext`; four ordered slices,
  `domain/regex/persistence/resolve-sources.ts:34-48`) and the dedup rule from `regex-tier.ts`. The verb must
  NOT re-implement the union — the honest shape is to extend `resolveHostTierRegexScripts` to optionally
  return provenance, or to add a sibling pure function in the same substrate file so the run order can never
  drift from the turn's.
- **The one persistence-shaped change: un-flatten the character slice.** Per-character sections ("Comes with
  <character>") need to know which seat contributed which row, and `ResolvedRegexSources.character` is a flat
  concatenation (`contract/resolve.ts:39`). `resolve-sources.ts:31` **already computes the per-character
  grouping** and then `flatMap`s it away, so the change is "stop flattening": `character: readonly { characterId,
  scripts }[]`, flattened at the resolver instead. Coupled sites, all tsc-forced: `domain/regex/contract/resolve.ts`,
  `persistence/resolve-sources.ts`, `domain/chat/contract/regex.ts:28`, `substrate/regex-tier.ts:23`, its two
  callers, `tests/server/domain/chat/substrate/regex-tier.test.ts`. **S.** If the IA lane decides one
  "Characters" section is enough, skip it entirely — cost 0.

### Q2 — THE SWITCHES

**(a) Per-row on/off = the library row's `enabled`.** Column: `db/src/schema/regex.ts:58` (promoted out of the
behavior blob precisely so a list toggles without parsing it, header lines 17-19). Verbs: `regex.updateScript`
with `{enabled}` (the update schema is a `.partial()` including `enabled`, `contracts/src/regex/index.ts:240`)
or `regex.bulkSetEnabled` for a selection (`verbs/scripts/bulk-set-enabled.ts:14-34`, one write + one audit +
one `regexChanged`). The executor's first gate is `script.enabled` (`packages/kit/src/regex/index.ts:341`), so
off is off on every leg in every chat. **Invalidation: yes, automatically** — both verbs emit `regexChanged`,
the client map path-invalidates `trpc.regex.pathFilter()` (`client/src/data/invalidation.ts:212`), and every
regex mutation hook is declared `busDriven` (`features/regex/hooks/use-regex-library.ts:15-103`). The one hole
is that a `chat.*`-homed effective read is NOT under that path filter — see Q7.

**(b) A per-CHAT mute does not exist. Precise cost of each arm:**

*Arm 1 — `chat_regex_mutes(chatId, scriptId)` junction.* New table = the four-site landing: the schema file
(`db/src/schema/regex.ts`, composite PK + both FKs CASCADE, matching the four siblings at lines 99-158), a
drizzle migration, the barrel/export, and the read seam. Then: a resolver stage (the mute applies to the
UNION, after the four slices are concatenated and — importantly — after dedup, since a muted script must be
muted wherever it would have run), two host-gated verbs + two procs, **two rows in the cross-tenant sweep's
classification** (the completeness guard fails on an unclassified proc,
`tests/server/transport/cross-tenant-sweep.suite.int.test.ts:10-12`), a `muted` field on the effective row,
and the panel's second switch. **M-L.**

*Arm 2 — a `disabled` column on `chat_regex_scripts`.* Cheaper (one column + migration + the read) but it
**cannot serve the use case**: a junction row only exists for scripts the host attached to THIS room, so it
can never mute the preset's or a character's or a global script — which is exactly what "my chat is being
weird, whose script is doing it" needs to switch off. Reject.

*What the sibling lanes should assume is CHEAP:* **the row switch (a) and the tier allow (c). Not the mute.**
Also flag: "mute" is already spent — `unmutedCharacters` / `castNotMuted` name the character axis
(`docs/design/vocabulary-map.md:37-38`). If a per-chat suppression is ever built, its word is a vocabulary-map
question, not a local choice (map header line 26: not in the table ⇒ that is a finding, do not mint).

**(c) Per-tier ALLOW. What exists is NOT one.**

`resolveRoomDisplayPolicy` is per-ROOM, DISPLAY-leg only, and it is a **broadcast**, not an allow: when the host
opts the room in, `listRoomDisplayScripts` returns `listOwnedScripts(host)` filtered to `enabled ∩ DISPLAY`
(`list-room-display-scripts.ts:28-29`) — the host's WHOLE library, ignoring all four junctions. The runtime is
`entry/compose/regex.ts:57-74` (reads `chatMetadata.hostDisplayScripts`, then the host seat). It answers
"whose display scripts do OTHER viewers render", which is a different question from "does this tier run".
`STUDY.md` §5's "the existing display-scripts opt-in gate generalised to the prompt leg — one gate, both legs"
is therefore **not available**: generalising it would change what it means and would push the host's whole
library onto the prompt leg. **Flag this to the IA lanes.**

*The cheapest honest allow* is a chat-metadata sub-blob, on the exact path `setHostDisplayScripts` already
walks — no migration, fault-isolated, and it fans to every member for free:

| Site | File:line | What lands |
| - | - | - |
| the shape | `contracts/src/chat/metadata.ts:239-301` | `regexTiers?: { preset?: boolean; characters?: boolean; chat?: boolean }` + a `resolveRegexTierAllow` helper beside `resolveOfferChoices` (lines 303-310) |
| the parse seam | `domain/chat/contract/metadata.ts:29-50` | one `.optional().catch(undefined)` row |
| the params / service type | `domain/chat/contract/params.ts`, `contract/service.ts` | `SetRegexTierAllowParams` + the verb signature |
| the verb | `domain/chat/verbs/participants.ts:355-370` | `createSetRegexTierAllow` — `requireHost` → `commitMetadataUpdate` (ONE key, #1450) → `emit({type:"chatUpdated"})` → audit; add to the `RosterVerbs` Pick (line 106-127) and the factory (line 166-189) |
| the read-back | `domain/chat/contract/views.ts` | `ChatDetail.regexTiers`, as `hostDisplayScripts` does |
| the proc | `transport/trpc/routers/chat.ts:585-587` | one mutation + its sweep classification |
| the client | `features/chat/hooks/use-context-panel-mutations.ts:21-27` | one `createEntityMutation`, `busDriven` (the verb's `chatUpdated` → `chatReads` covers `getChat`) |
| **the enforcement** | `domain/chat/contract/regex.ts:23-33` + `substrate/regex-tier.ts:22-33` | add `allow` to `HostTierRegexSources` and drop the disallowed slices **inside** the resolver — one home, and both call sites (`assemble-gather.ts:406`, `edit.ts:247`) fail tsc until they pass it |

**Dropping BEFORE dedup is load-bearing** and is the pin to write: a script attached at both preset and chat,
with the preset tier disallowed, must still run at the chat tier. Dropping the slice before the union gives
that; filtering after dedup would silently kill it.

**Default must be ABSENT ⇒ ALLOWED** (the inverse of ST, whose `preset_allowed_regex` / `character_allowed_regex`
default off — `STUDY.md` §1). ST defaults off because its preset/character scripts are foreign code shipped
inside a file; ours are rows the owner authored or imported into their own library and attached. Absent-means-
allowed makes every existing room byte-identical. **One caveat worth an owner word, not a lane decision:** the
character tier CAN receive foreign code without an explicit attach — a card import LIFTS the card's scripts
into the library and attaches them (`domain/regex/contract/dedup.ts:19-27`, the `CardLiftPlan`). If the owner
wants ST's "card regex never runs until I say so", that is a *characters-tier default-off* decision with a
migration-shaped consequence for existing rooms. Fork it, do not decide it.

**The smallest honest set that gives "turn off this tier here": the three-flag `regexTiers` blob above.** Not a
per-character-per-room allow (that is a `Record<CharacterId, boolean>` inside room metadata — same mechanism,
strictly more state and more empty-state cases, and no evidence anyone wants per-seat granularity yet). Not a
`presets.regexAllowed` column: a flag on the preset row would be global to every chat using that preset, which
is the opposite of the owner's "why is THIS chat weird".

### Q3 — ORDER

`position` is per junction (`db/src/schema/regex.ts:90, 110, 134, 154`; the header states "ORDER IS DATA" at
lines 20-22). The verb is **`regex.applyScopeOrder`**, one verb for all four scopes with per-scope authority:
global pre-gates script ownership, character/preset gate the carrier, **chat gates `requireChatHost`**
(`apply-scope-order.ts:49-89`), and the rewrite is one atomic `db.batch` (lines 96-117).

**The CONTEXT section can reuse it as-is.** The client half is already built and generic:
`client/src/components/regex-scope-order.tsx:44-95` takes `scope: RegexAttachScope`, the ordered rows, and a
`renderItem` callback — it owns order only and draws no row. It already has all three size arms (drag ≤
`COLLECTION_LARGE_GROUP`, explicit move buttons above it, plain list under 2 rows) and writes optimistically
(header lines 24-27). Pass `scope={{kind:"chat", chatId}}` and the panel's own row renderer.

**Can the panel reorder the GLOBAL tier from the room? Technically yes — and it should not.** The global arm's
gate is script ownership alone (`ensureGlobalScriptsOwned`, `apply-scope-order.ts:33-45`), so a host would pass
it. But global order is a property of the user's library that governs *every* chat they host; likewise a
preset/character reorder governs every chat on that preset/character. A room-local gesture with silent global
blast radius is exactly the class of affordance the house omits. **Recommendation: the room panel reorders the
CHAT tier only; every other tier's row offers "Open in library" and the ordering lives in its one home** (the
library details pane / the preset's Transforms deck, where `RegexScopeOrder` is already mounted through the
picker, `components/regex-script-picker.tsx:33`).

### Q4 — ATTACH / DETACH AT THE CHAT TIER

Verbs: `regex.attachToChat` and `regex.detachFromChat`, both `requireChatHost` + plain script ownership on the
script side (`attach-to-chat.ts:14-27`, `detach-from-chat.ts:12-28`), both idempotent, both emitting
`regexChanged`. Attach appends at the end of the tier (`position = (await listChatScripts(...)).length`,
`attach-to-chat.ts:23`).

**The client is already built and unmounted.** `RegexScriptPicker` dispatches an exhaustive scope switch
including `ChatScopePicker` (`components/regex-script-picker.tsx:63-97`), with `useAttachChat`/`useDetachChat`
factories at lines 379-388 — and it has **zero production call sites for the chat arm**:
`pnpm ast jsx RegexScriptPicker` → 5 hits in 3 files (`character-regex-scripts-field.tsx:46`,
`preset/regex-tab.tsx:67`, and three CT stories), scanned=6958, status=complete; corroborated by
`rg --files-with-matches`. Mounting it in the room is the largest already-paid-for item here.

**Move between tiers: no transactional verb.** It is detach + attach, two round trips, and a failed second
call leaves the script attached nowhere — a silent data-shaped failure. Either add a `moveScopeAttachment`
batch verb (S: one `db.batch` in the regex domain, both scopes' gates applied) or **do not offer Move in the
first commit** — the room's honest verbs are attach-here and detach-here, and "Open in library" covers the rest.

### Q5 — NAMED ENABLE-SETS (ST "Regex Presets")

Cost: a new table `regex_script_sets(id, ownerId, name, scriptIds JSON, createdAt, updatedAt)` — the four-site
landing (schema + migration + barrel + read seam) — plus `applyScriptSet` (one owner-scoped batch over
`enabled`, the `setScriptsEnabledBulk` shape at `persistence/queries.ts:69-84`), create/update/delete/list,
five router procs with sweep classification, and a client surface. **L**, and it is the only item on this board
that needs a migration.

**The vocabulary collision is real.** "Preset" is owner-loaded: the domain map assigns `preset` to *generation
config only* (AGENTS §6). The map's own precedent for "a saved, named, reusable set of X" is
`rosterPreset` in code with a *different* user-facing word ("Roster" / "Saved rosters",
`docs/design/vocabulary-map.md:46`). So the conforming proposal is **code `regexScriptSet`, user-facing
"Script sets"** — but the map is the one home and it says explicitly that a concept not in the table is a
finding, not a mint (`vocabulary-map.md:23-26`). **Route the word to the map with that row proposed; do not
name it in a lane.**

**Not worth the first commit.** The owner's stated pain is "go turn the various regex off or on … think of all
the places you have to go" — served completely by the effective read + the row switch + the tier allow.
Enable-sets are the power-user layer on top and can be a follow-up whose cost is unchanged by shipping the
panel first.

### Q6 — NON-HOST MEMBERS

**What a member sees in "This chat" today** (`features/chat/components/settings-context-tab.tsx:215-279`):
Field overrides (rendered, `save` undefined and every field `disabled={!isHost}` — `room-overrides-tab.tsx:29-38`,
`room-overrides-form.tsx:221-223`), Injections (rows rendered, every field disabled, no Add —
`injections-manager.tsx:98-99, 132, 153, 220-249`), Documents (the viewer-visible subset, no controls),
Lorebooks (rows, no attach/detach), Macro picks (member-settable). The entire **Host controls** band —
Background, Group behavior, Appearance (the display-scripts switch), Storytelling, Reactions, Tool use, and
every grafted section — is `isHost ? … : null` (line 276), so a member's tab simply ends after Macro picks.

**What the regex section should show a member: the CHAT tier only, read-only.** `regex.listForChat` is
`requireChatMember` and deliberately not owner-filtered (`list-for-chat.ts:1-5`) — a member is entitled to
know what transforms every one of their turns. The host-tier rows are not theirs to see: the union resolves
under the frozen `runAsUserId` and "a non-host member has no parameter on this surface, so the exclusion is
structural, not a runtime check" (`domain/chat/contract/regex.ts:8-11`, D19). Naming the host's global /
preset / character scripts to a member would recreate exactly the leak `listRoomDisplayScripts` was shaped to
avoid.

**Follow the Lorebooks rack, not the Injections form:** one component, no separate reduced mode, and the
member's arm **omits** the controls rather than disabling them — `chat-books-section.tsx:53-98` (the
member/host gloss fork at lines 64-68, the empty state at 70-77, `isHost ? <attach> : null` at 88-95) and its
row, which renders **no trailing cluster at all** for a member (lines 111-131, "a control a member cannot
operate is the affordance lie the sibling documents rack exists to correct"). A row switch a member cannot
throw is precisely that lie.

### Q7 — INVALIDATION + LIVE UPDATE

**Reads the section takes:** `chat.listEffectiveRegex` (host), `regex.listForChat` (member),
`regex.listScripts` (the picker's library deck, `regex-script-picker.tsx:63`), plus `chat.getChat` if the tier
allows land (the flag reads back off `ChatDetail`, the `hostDisplayScripts` twin).

**What a flip must invalidate.** Every regex mutation is `busDriven` and emits one `regexChanged`
(`domain/regex/contract/service.ts:68-71` — "ONE `regexChanged` user event carries every mutation"), and the
client map turns that into `trpc.regex.pathFilter()` (`client/src/data/invalidation.ts:212`). **Two gaps:**

1. **A `chat.*`-homed effective read is outside that path filter.** The `regexChanged` row must grow:
   `[trpc.regex.pathFilter(), trpc.chat.listEffectiveRegex.pathFilter(), ...promptPreviewReads(trpc)]`. The
   preview reads matter for the same reason they ride `presetsChanged` (`invalidation.ts:202-210`): a regex
   flip changes the assembled prompt, so the host's Preview tab is stale on the same gesture. One-line change,
   pinned by `tests/client/data/invalidation.test.ts`.
2. **A non-host member is never told.** `regexChanged` is a per-USER channel — "a subscriber only ever receives
   its OWN userId channel, derived server-side from the principal"
   (`contracts/src/user-bus/index.ts:44-46`) — and `attachToChat` emits exactly
   `ctx.emitUserEvent(ownerId, {type:"regexChanged", scriptId})` (`attach-to-chat.ts:26`). So when a host
   attaches or detaches a room script, **every other member's `listForChat` is stale until they reload**, and
   at `staleTime: Infinity` that is forever. This is member-visible room state on an actor-only channel — the
   exact defect `membership-fan-guard` exists for — and the gate **cannot see it**, because its `scanRoot` is
   `/packages/server/src/domain/chat/` only (`tooling/src/verify/gates/membership-fan-guard.ts:10, 23`) while
   the emit lives in `domain/regex`. **Worth filing as its own row: a live freshness bug plus a named gate
   blind spot.**

**Does the room bus already carry a regex event? No.** The chat bus has no regex member
(`contracts/src/chat/bus.ts:384-573`). The purpose-built seam is `roomEntityChanged` — "an OWNER-PLANE entity
edit moved something this room's MEMBER-VISIBLE projections read" (lines 563-572) — whose axis is
`ROOM_ENTITY_KINDS = ["character", "persona", "world-info"]` (line 372). Adding `"regex"` is **three
tsc-forced sites**, and the mechanism names them itself: the tuple, the composition root's `ROOM_REACH` table
(`satisfies Record<RoomEntityKind, …>`) and the client's `BUS_FILTERS.roomEntityChanged` Record
(`entry/compose/room-reach.ts:14-19`). The reach lookup for regex is trivial — the rooms are the
`chat_regex_scripts` rows for that script id. regex would emit its own id-only domain event and the engine
fans (the declared-and-dispatched posture, `room-reach.ts:7-12`); `domain/regex` may not import the chat bus.

**Cheaper interim:** the tier-allow verb (Q2c) lives in `domain/chat` and already emits `chatUpdated`
(`roster.ts:363`), which fans to the whole room. So tier flips are member-fresh from day one; only
attach/detach and library `enabled` flips are not.

## The first-commit set — "see everything that applies here in run order and switch it"

1. **`chat.listEffectiveRegex`** — host-gated, composing `ctx.resolveRegexSources` + the union in
   `substrate/regex-tier.ts`, returning `EffectiveRegexRow[]` in run order with per-tier provenance. Optional
   sub-step: un-flatten the character slice for per-character sections (S, the grouping already exists).
2. **`EffectiveRegexRow` in `@orb/contracts/regex`**, reusing `RegexAttachScope` — no new tier union.
3. **One "Regex" `DisclosureSection` in the This-chat tab** (`settings-context-tab.tsx`, closed by default
   like every data-driven section, `CLOSED_BY_DEFAULT` at line 149, with a `HeadingWithCount` chip):
   - *host arm*: the effective rows grouped by tier in run order; per-row switch → `regex.updateScript
     {enabled}`; the chat tier wrapped in the existing `RegexScopeOrder`; attach/detach through the
     already-built `RegexScriptPicker scope={{kind:"chat"}}` — **zero new server work for any of this**;
   - *member arm*: `regex.listForChat` rows, read-only, controls omitted (the Lorebooks shape).
4. **One invalidation row**: `regexChanged` → `+ chat.listEffectiveRegex` + the prompt-preview reads.

Server cost: one verb, one contracts view, one proc + sweep classification, one invalidation row. Everything
else on the client already exists and is being re-pointed.

**Commit 2 (the bisect lever ST has and we do not):** the `regexTiers` allow blob + the drop-before-dedup in
the resolver + the host's three switches. **Commit 3:** `ROOM_ENTITY_KINDS += "regex"` so a member's rack is
live, plus the `membership-fan-guard` blind-spot row. **Later or never:** enable-sets, per-chat mutes,
move-between-tiers.

## What I would NOT build

- **A per-chat mute table in the first commit.** It doubles the "off" vocabulary on one row, needs a new table
  + sweep rows + a resolver stage, and collides with a word already spent on characters. The row switch plus a
  tier allow covers the owner's stated debugging loop; revisit only if real use shows "off everywhere" is too
  blunt.
- **Generalising the display-broadcast gate to the prompt leg.** It reads the host's whole owned library, not
  the room's attachments (`list-room-display-scripts.ts:28-29`); reusing it as an allow would change what the
  existing toggle means and put un-attached scripts on the prompt leg.
- **Reordering the global / preset / character tiers from the room.** The verb permits it; the blast radius is
  every other chat. "Open in library" instead.
- **A "Move to tier" control at the chat tier**, until a transactional verb exists. Two calls that can half-fail
  is not a control, it is a data-loss shape.
- **A row switch in the Settings library that duplicates this one** — `STUDY.md` §7 already rules the Settings
  rows stay quiet, and the 2026-08-19 fork about the *attach* control is a different control; do not re-open it.
- **A new context TAB.** The tab strip is closed and this is per-chat configuration — it is a section in the
  existing "This chat" body, exactly where Lorebooks and Documents landed.

## For the orchestrator

The systems answer is that this panel is mostly a **read** the tree never exposed plus **client parts already
built and unmounted** — the chat arm of `RegexScriptPicker` and the whole `RegexScopeOrder` editor have zero
production call sites for the room (`pnpm ast jsx RegexScriptPicker`, scanned=6958). One new host-gated verb
(`chat.listEffectiveRegex`, composing ops already injected on `ChatContext`), one contracts view reusing the
existing `RegexAttachScope`, one proc, one invalidation row, and a section in `settings-context-tab.tsx` gets
the owner the whole of "see everything that applies here in run order and switch it". Two things the sibling IA
lanes must be told before they draw anything: the effective panel is **host-only** (the union resolves under
the host's `runAsUserId`; a member gets the chat tier only, read-only, in the Lorebooks shape), and
`STUDY.md` §5's plan to reuse the display-scripts opt-in as a per-tier prompt-leg allow is **refuted by the
code** — that verb broadcasts the host's whole enabled DISPLAY library and ignores the junctions, so the tier
allow has to be a new chat-metadata blob (no migration, the `setHostDisplayScripts` path verbatim, ~9 files).
Two findings are file-worthy independent of this feature: **(1)** a host attaching or detaching a room regex
script never reaches other members — `regexChanged` is a per-user channel and `attach-to-chat.ts:26` emits only
on it, so at `staleTime: Infinity` a member's `listForChat` is stale forever; **(2)** the `membership-fan-guard`
gate structurally cannot catch that class, because its `scanRoot` is `domain/chat/**` while the offending emit
is in `domain/regex` (`tooling/src/verify/gates/membership-fan-guard.ts:10, 23`) — an instrument that reports a
false clean on a real instance of the law it enforces.
