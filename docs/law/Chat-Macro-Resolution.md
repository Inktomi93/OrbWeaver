---
kind: law
status: active
updated: 2026-08-30
---

# Chat macro/persona resolution — the one home

> **Why this doc exists.** Macro resolution (`{{char}}`/`{{user}}`/`{{persona}}` in message content)
> happens in TWO places that MUST agree — server ASSEMBLE (what the model sees) and client DISPLAY
> (what the viewer sees). With no single spec, each re-decided the persona rule and drifted. This is
> the single source of truth: the rule, the producer, the one shared atom. A consumer that resolves a
> chat macro any other way is the review flag. (neo's analog: `chat-resolution-pipeline.md`.)

## 0. The one rule (memorize this)

- **Storage is RAW (D51), with ONE commit-time exception: VOLATILE macros FREEZE at COMMIT.**
  Message content stores literal `{{macros}}`; resolution happens at CONSUMPTION (read/render/assemble) —
  EXCEPT the nondeterministic (clock/PRNG) macros, which resolve ONCE at the moment content COMMITS and bake
  their value into the stored row (owner-ruled; the clock/PRNG at commit is otherwise unrecoverable).
  **Freeze set (nondeterministic ONLY):** `{{roll}}`/dice · `{{random}}` · `{{pick}}` · the clock family
  `{{time}}`/`{{date}}`/`{{weekday}}`/`{{isodate}}`/`{{isotime}}`/`{{datetimeformat}}`. **Everything else
  stays RAW/per-view:** the IDENTITY macros (`{{char}}`/`{{user}}`/`{{persona}}` + name aliases) are NEVER
  baked — they resolve per-view at READ (§2/§4) so multi-human `{{user}}` + the author-side-macro law hold;
  var-mutation (`{{setvar}}`/…) and conversation-context (`{{input}}`/`{{lastMessage}}`/…) macros stay raw +
  inert. **Commit points:** a **user message** freezes at SEND (composer text, macro-before-regex — the
  freeze runs, then the D53 USER_INPUT regex sees the baked value; both the WI haystack and the persisted row
  are the one post-transform text); a **greeting** freezes at the FIRST USER TURN (malleable/swipeable until
  then) — `freezeGreetingVolatiles` (`verbs/turn.ts`) bakes each pre-first-turn assistant row's SELECTED
  variant, idempotent → concurrent-retry-safe. **Known gap:** a POST-first-turn swipe to a different
  (unfrozen) greeting variant is not re-frozen, and the freeze is not re-emitted on the bus — a client sees
  the baked value on its next refetch. **Mechanism:** the freeze is the exact inverse of the §2 names-only
  pass — `createVolatileOnlyRegistry` (`@orb/kit/macro`) resolves ONLY volatiles + passes identity through;
  `createNamesOnlyRegistry` resolves ONLY identity + passes volatiles through; they share
  `registerVolatileMacros` so the freeze axis can never drift. Editing a message still recovers its real
  IDENTITY tokens (only the nondeterministic value was baked).
- **The per-message STAMPS are the source of truth** — the message row carries `characterId` (the
  speaker) and `personaId` (the author, stamped at send: PD-100 = the sender's active persona at send).
  These same stamps drive BOTH the attribution chrome AND the macro subject — one source, no divergence.
- **Producer, not hard-link.** The row carries only IDS. Names are DERIVED from a per-chat name
  **producer**, never denormalized onto the row (that is the neo hard-link we do not carry).

## 1. The producer (the membership-gated kind-polymorphic identity directory, D137)

> **Vocabulary (owner rulings, #901, 2026-08-30 — read this before you copy a word out of this doc).**
> The room's seated characters are **Characters**; the saved seats+knobs+rules template is a **Roster**.
> The word "cast" is retired for BOTH concepts. It survives here only as the *code* spelling of the D137
> producer (`ChatIdentity`, `loadChatIdentityProducer`, `ctx.cast`, `castKey`, `CHAT_IDENTITY_KIND_POLICY`) — issue #903
> (vocab C2) renames that seam to **`ChatIdentity`** with the drive axis **`characters`**, and it has NOT
> landed. So: code identifiers below are quoted as they are on the tree TODAY; the prose around them uses
> the ruled words. Do not "restore" cast prose, and do not write the #903 names as if they exist.

A chat read yields the identity-directory producer (`ChatIdentity[]`,
`@orb/contracts/chat/producers.ts`) — ONE
kind-discriminated entry per identity the chat references, **member-gated** (any member may read it),
loaded via `loadChatIdentityProducer` (`domain/chat/persistence/identity.ts`):

- `{ kind: "persona"; id; name; description; avatarHash }` — description backs `{{persona}}`
- `{ kind: "character"; id; name; avatarHash }` — deliberately NO description (a card's description is not
  member-consented; the member card surface is `ParticipantView`, D137(D))

TWO projections derive the consumer maps, and the split IS the names-only law's mechanism: the resolver
(§2) consumes `buildIdentityNameContext(cast)` → `personaNamesById`/`characterNamesById` — the KIT's
avatar-free entry types, so the macro engine is structurally unable to see chrome; the attribution chrome
consumes `buildIdentityAvatarMaps(cast)` (avatar precedence per `CHAT_IDENTITY_KIND_POLICY` — a live participant
outranks a character entry, `participant-first`; personas are `cast-only`). Coverage: every id the chat
references — its participants' personas/characters AND any `personaId`/`characterId` a stored message
carries (incl. since-switched personas and a REMOVED character whose rows remain: the transcript-integrity
portrait floor). **Names/description/hash only, not full entities** — so this is NOT the owner-scoped
persona/character read (`fetchOwned`), NOT a permission-spine change: a member already sees who authored
each line, so a co-participant's persona *name* is not a secret. The loader `LEFT JOIN`s each entity to its
`assets` hash, but its OUTPUT is this producer — rows stay id-only. Loaded once per read (client: the
`ChatDetail.cast` ∪ `MessagesPage.cast` merge, last-write-wins on `castKey`) / once per assemble (server,
engine-side, after canon history is known — the ids aren't knowable in turn PREP).

## 2. The shared resolver (`@orb/kit` — the one atom)

Both consumers call the SAME pure function, so they cannot diverge:

```ts
resolveRowMacros(
  content: string,
  stamps: { characterId: CharacterId | null; personaId: PersonaId | null },
  ctx: { characterNamesById; personaNamesById; speakerCharName?; cast?;
         fallbackPersonaName?; fallbackPersonaDescription?; },
): string
```

- `{{char}}` → for a VOICED row (`characterId` set): `characterNamesById.get(row.characterId)?.name ??
  ctx.speakerCharName ?? "Character"` (the ROW's own speaker, never the current turn's speaker — a past line
  by Aria stays Aria even when Kai speaks now). For a HUMAN-authored / narrator row (`characterId === null`):
  the room's **CHARACTERS** — the joined `ctx.cast` in a multi-character room (== `{{group}}`; ruling B),
  the one character in solo — so a human's own `{{char}}` addresses every seated character, resolved
  identically on both consumers.
- `{{user}}` / `{{persona}}` → `personaNamesById.get(row.personaId)?.{name,description}` (the ROW's authoring
  persona) — falling back for a null/legacy/greeting/AI stamp to the chat **ANCHOR**
  (`ctx.fallbackPersonaName`/`fallbackPersonaDescription` = `pinnedPersona`), NEVER the reader's own active
  persona, then the `"User"`/`""` kit floor. Since PD-129 mints an editable default persona at
  boot / first authed request, the anchor is normally a real persona name; the kit floor is only the
  genuinely-persona-less edge. Ruling A / the design principle: identity is the row's or the chat anchor's,
  never the viewer's — so a greeting/AI line addresses the SAME persona for the model and every human.
- Wraps `@orb/kit/macro` `processMacros`; a no-`{{` string is byte-identical passthrough. `<speaker>`
  tags are opaque to the macro parser (disjoint token set) — they pass through for the separate
  `speakerTagsToPlain` pass.

## 3. The five contexts (who resolves what)

| Context | Home | `{{user}}` subject | `{{char}}` subject |
| - | - | - | - |
| **DISPLAY** (viewer) | client `message-render` → the atom | row `personaId`; null-stamp → the ANCHOR | row `characterId`; null (human/narrator) → the CHARACTERS |
| **ASSEMBLE** (model) | server `toShapeCanon` → the atom | row `personaId`; null-stamp → the ANCHOR | row `characterId`; null (human/narrator) → the CHARACTERS |
| **SEND** | stores RAW; stamps `personaId` (PD-100) | — | — |
| CARD sections | server `assemble.ts` | `ctx.pinnedPersona` (anchor, FROZEN at open) | the section's character |
| prompt-config sections | server `assemble.ts` | `ctx.activePersona` = the TRIGGERING human's persona | the section's character |

DISPLAY and ASSEMBLE resolve history identically (same atom + same producer semantics) ⇒ **viewer ==
model by construction** — including the null-stamp fallback, which is the chat ANCHOR (a chat invariant,
never the per-viewer active persona; ruling A), so a greeting / AI line addresses one persona for the model
and every human. A human-authored row's `{{char}}` is the room's CHARACTERS (ruling B). Card and prompt-config sections
are NOT history — they keep the two-persona doctrine (`context.ts`: `pinnedPersona = anchor ?? active`;
`activePersona` = the triggerer's persona), the prompt-config `active` bound to whose turn it is (not
`personaIds[0]`).

## 4. The three persona axes (do not conflate)

- **pinnedPersona** — the chat-open anchor (host-designated in multi-human), FROZEN. CARD-section `{{user}}`
  AND the null-stamp fallback for history rows (a greeting / AI line / legacy row — ruling A: the anchor is a
  chat invariant, so the model and every human agree; never the per-viewer active persona).
- **activePersona** — the TRIGGERING human's persona (whose turn drives the assemble — see "Who drives a
  turn" below; never `personaIds[0]`). Prompt-config-section `{{user}}` only.
- **row `personaId`** — the per-message author stamp. HISTORY/message `{{user}}` when set. Changed ONLY by
  reattribution — a live persona switch never silently relabels old lines.

**`{{char}}` characters axis (ruling B):** a VOICED row's `{{char}}` is its own `characterId`; a HUMAN-authored /
narrator row's `{{char}}` (`characterId === null`) is the room's CHARACTERS — the joined names in a
multi-character room (== `{{group}}`), the one character in solo. Gated on the SIZE of that set
(`length > 1`), never an `isGroup` flag (D16).

## 4a. Who drives a turn

- `TurnTrigger` (`packages/server/src/domain/chat/contract/foreign.ts`) names the human who drives the turn. It is a discriminated union, never a nullable id.
- `{ kind: "human" }` carries the user and the persona on their seat, which may be null. `activePersona` is that persona, or the kit floor when the seat holds none. This case never falls back to the chat anchor.
- `{ kind: "none" }` means no human drives the turn: a deferred drain, an automation turn, a preview or a host read. `activePersona` is the chat anchor.
- Every caller states its case. Do not add an absent case. A fallback such as the first present human changes when someone joins, and a host read could show one member's persona to another.
- `activePersonaIdFor` (`packages/server/src/entry/compose/chat.ts`) is the one dispatch.

## 4b. The author name on a user history row

- The model sees an author name on each user row. It comes from the row's own `personaId` stamp through the chat identity producer, never from the current active persona.
- A row with no usable stamp takes this turn's `{{user}}` name only when its `authorUserId` equals the trigger's user. Every other unstamped row gets `DEFAULT_PERSONA_NAME`. An unknown author or a `none` trigger also gets it.
- Reason: the turn's `{{user}}` belongs to one human, so borrowing it for another member's row tells the model that human wrote the line.
- The client applies the same rule on screen. `resolveUserAttribution` (`packages/client/src/features/chat/lib/attribution.ts`) borrows the viewer's persona only for the viewer's own row. Name nobody rather than name the wrong person.
- Home: `userRowAuthorName` (`packages/server/src/domain/chat/assembly/shape.ts`).

## 5. Reattribution (the only writer of a stamp)

- `reattributeMessages` (host) — re-stamps a slot's `characterId` (the `{{char}}`/speaker axis). BUILT.
- **persona reattribution** (author-or-host; re-stamp user messages' `personaId`, per-row) — BUILT
  (`createReattributePersona`, `domain/chat/verbs/edit.ts`; `chat.reattributePersona` route; client
  `useReattributePersona` + `persona-this-chat-section.tsx`). Takes an explicit `messageIds` selection,
  belted per row (author-or-host + persona-ownership per author) — no server bulk restamp (the former
  `REATTRIBUTE_WINDOW` const is gone from the tree; truth-audit correction 2026-08-03). The deliberate lever to fix history attribution after a switch. Re-stamp → the
  producer re-resolves the name → BOTH consumers update; the content is never touched.

## 6. Parity is enforced, not hoped

Guaranteed by (1) the ONE shared atom (§2) and (2) the SAME producer semantics (§1) on both sides.
Pinned by the regression matrix (`tests/*`): one fixture — chat anchor = Nyx, active =
Zara, a user row stamped `personaId` = Mara, content `"{{user}} waves"` — resolves to **Mara** on BOTH
server-assemble and client-display, and to Zara/"User" only when the stamp is null. A card `{{user}}`
in the same fixture resolves to Nyx (pin). Storage of that row stays the literal `"{{user}} waves"`.
