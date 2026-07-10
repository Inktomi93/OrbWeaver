---
kind: law
status: active
updated: 2026-07-04
---

# Chat macro/persona resolution — the one home

> **Why this doc exists.** Macro resolution (`{{char}}`/`{{user}}`/`{{persona}}` in message content)
> happens in TWO places that MUST agree — server ASSEMBLE (what the model sees) and client DISPLAY
> (what the viewer sees). With no single spec, each re-decided the persona rule and drifted. This is
> the single source of truth: the rule, the producer, the one shared atom. A consumer that resolves a
> chat macro any other way is the review flag. (neo's analog: `chat-resolution-pipeline.md`.)

## 0. The one rule (memorize this)

- **Storage is RAW (D51), with ONE commit-time exception: VOLATILE macros FREEZE at COMMIT (Task #77).**
  Message content stores literal `{{macros}}` and all resolution happens at CONSUMPTION
  (read/render/assemble) — EXCEPT the nondeterministic (clock/PRNG) macros, which resolve ONCE at the
  moment content COMMITS to the conversation and bake their value into the stored row (owner-ruled; the
  clock/PRNG at commit is otherwise unrecoverable). **Freeze set (nondeterministic ONLY):** `{{roll}}`/dice
  · `{{random}}` · `{{pick}}` · the clock family `{{time}}`/`{{date}}`/`{{weekday}}`/`{{isodate}}`/
  `{{isotime}}`/`{{datetimeformat}}`. **Everything else stays RAW/per-view:** the IDENTITY macros
  (`{{char}}`/`{{user}}`/`{{persona}}` + name aliases) are NEVER baked — they resolve per-view at READ (§2/§4)
  so multi-human `{{user}}` + the author-side-macro law hold; var-mutation (`{{setvar}}`/…) and
  conversation-context (`{{input}}`/`{{lastMessage}}`/…) macros stay raw + inert. **Commit points:** a
  **user message** freezes at SEND (composer text, macro-before-regex — the freeze runs, then the D53
  USER\_INPUT regex sees the baked value; both the WI haystack and the persisted row are the one
  post-transform text); a **greeting** freezes at the FIRST USER TURN (malleable/swipeable until then) —
  **BUILT** (Task #79) for the SELECTED greeting variant (`freezeGreetingVolatiles`, `verbs/turn.ts` — the
  send detects the first user turn and bakes each pre-first-turn assistant row's selected variant; IDEMPOTENT
  → concurrent-retry-safe). STILL DEFERRED (owner-flagged edge): a POST-first-turn swipe to a different
  (unfrozen) greeting variant is not re-frozen, and the freeze is not re-emitted on the bus (a client sees the
  baked value on its next refetch). **Mechanism:** the
  freeze is the exact inverse of the §2 names-only pass — `createVolatileOnlyRegistry` (`@orb/kit/macro`)
  resolves ONLY volatiles + passes identity through; the names-only registry resolves ONLY identity + passes
  volatiles through; they share `registerVolatileMacros` so the freeze axis can never drift. Editing a
  message still recovers its real IDENTITY tokens (only the nondeterministic value was baked).
- **The per-message STAMPS are the source of truth** — the message row carries `characterId` (the
  speaker) and `personaId` (the author, stamped at send: PD-100 = the sender's active persona at send).
  These same stamps drive BOTH the attribution chrome AND the macro subject — one source, no divergence.
- **Producer, not hard-link.** The row carries only IDS. Names are DERIVED from a per-chat name
  **producer**, never denormalized onto the row (that is the neo hard-link we do not carry).

## 1. The producer (membership-gated name maps)

A chat read yields two derived maps, scoped to ONE chat, **member-gated** (any member may read them):

- `personaNamesById: ReadonlyMap<PersonaId, { name; description }>`
- `characterNamesById: ReadonlyMap<CharacterId, { name }>`

Coverage: every id the chat references — its participants' personas/characters AND any `personaId`/
`characterId` a stored message carries (incl. since-switched personas). **Names only, not full
entities** — so this is NOT the owner-scoped persona/character read (`fetchOwned`), NOT a permission-
spine change: a member already sees who authored each line, so a co-participant's persona *name* is not
a secret. The efficient loader is a `LEFT JOIN` (message ids → personas/characters), but its OUTPUT is
this map — rows stay id-only; the map is the producer. Loaded once per read (client) / once per
assemble (server, engine-side, after canon history is known — the ids aren't knowable in turn PREP).

## 2. The shared resolver (`@orb/kit` — the one atom)

Both consumers call the SAME pure function, so they cannot diverge:

```ts
resolveRowMacros(
  content: string,
  stamps: { characterId: CharacterId | null; personaId: PersonaId | null },
  ctx: { characterNamesById; personaNamesById; speakerCharName?; activePersonaName?; },
): string
```

- `{{char}}` → for a VOICED row (`characterId` set): `characterNamesById.get(row.characterId)?.name ??
  ctx.speakerCharName ?? "Character"` (the ROW's own speaker, never the current turn's speaker — a past line
  by Aria stays Aria even when Kai speaks now). For a HUMAN-authored / narrator row (`characterId === null`):
  the **CAST** — the joined `ctx.cast` in a multi-character room (== `{{group}}`; ruling B), the one character
  in solo — so a human's own `{{char}}` addresses the whole cast, resolved identically on both consumers.
- `{{user}}` / `{{persona}}` → `personaNamesById.get(row.personaId)?.{name,description}` (the ROW's authoring
  persona) — falling back for a null/legacy/greeting/AI stamp to the chat **ANCHOR**
  (`ctx.fallbackPersonaName`/`fallbackPersonaDescription` = `pinnedPersona`), NEVER the reader's own active
  persona, then `"User"`/`""`. Ruling A / the design principle: identity is the row's or the chat anchor's,
  never the viewer's — so a greeting/AI line addresses the SAME persona for the model and every human.
- Wraps `@orb/kit/macro` `processMacros`; a no-`{{` string is byte-identical passthrough. `<speaker>`
  tags are opaque to the macro parser (disjoint token set) — they pass through for the separate
  `speakerTagsToPlain` pass.

## 3. The five contexts (who resolves what)

| Context | Home | `{{user}}` subject | `{{char}}` subject |
| - | - | - | - |
| **DISPLAY** (viewer) | client `message-render` → the atom | row `personaId`; null-stamp → the ANCHOR | row `characterId`; null (human/narrator) → the CAST |
| **ASSEMBLE** (model) | server `toShapeCanon` → the atom | row `personaId`; null-stamp → the ANCHOR | row `characterId`; null (human/narrator) → the CAST |
| **SEND** | stores RAW; stamps `personaId` (PD-100) | — | — |
| CARD sections | server `assemble.ts` | `ctx.pinnedPersona` (anchor, FROZEN at open) | the section's character |
| prompt-config sections | server `assemble.ts` | `ctx.activePersona` = the TRIGGERING human's persona | the section's character |

DISPLAY and ASSEMBLE resolve history identically (same atom + same producer semantics) ⇒ **viewer ==
model by construction** — including the null-stamp fallback, which is the chat ANCHOR (a chat invariant,
never the per-viewer active persona; ruling A), so a greeting / AI line addresses one persona for the model
and every human. A human-authored row's `{{char}}` is the CAST (ruling B). Card and prompt-config sections
are NOT history — they keep the two-persona doctrine (`context.ts`: `pinnedPersona = anchor ?? active`;
`activePersona` = the triggerer's persona), the prompt-config `active` bound to whose turn it is (not
`personaIds[0]`).

## 4. The three persona axes (do not conflate)

- **pinnedPersona** — the chat-open anchor (host-designated in multi-human), FROZEN. CARD-section `{{user}}`
  AND the null-stamp fallback for history rows (a greeting / AI line / legacy row — ruling A: the anchor is a
  chat invariant, so the model and every human agree; never the per-viewer active persona).
- **activePersona** — the TRIGGERING human's persona (whose turn drives the assemble — bound via
  `triggerPersonaId`, not `personaIds[0]`). Prompt-config-section `{{user}}` only.
- **row `personaId`** — the per-message author stamp. HISTORY/message `{{user}}` when set. Changed ONLY by
  reattribution — a live persona switch never silently relabels old lines.

**`{{char}}` cast axis (ruling B):** a VOICED row's `{{char}}` is its own `characterId`; a HUMAN-authored /
narrator row's `{{char}}` (`characterId === null`) is the CAST — the joined cast in a multi-character room
(== `{{group}}`), the one character in solo. Gated on cast SIZE (`length > 1`), never an `isGroup` flag (D16).

## 5. Reattribution (the only writer of a stamp)

- `reattributeMessages` (host) — re-stamps a slot's `characterId` (the `{{char}}`/speaker axis). BUILT.
- **persona reattribution** (author-or-host; re-stamp user messages' `personaId`, bulk + per-message —
  neo `usePersonaReattribute` / ST `#persona_sync_name`). To build. The deliberate lever to fix history
  attribution after a switch. Re-stamp → the producer re-resolves the name → BOTH consumers update; the
  content is never touched.

## 6. Parity is enforced, not hoped

Guaranteed by (1) the ONE shared atom (§2) and (2) the SAME producer semantics (§1) on both sides.
Pinned by the regression matrix (`tests/*` per task #59): one fixture — chat anchor = Nyx, active =
Zara, a user row stamped `personaId` = Mara, content `"{{user}} waves"` — resolves to **Mara** on BOTH
server-assemble and client-display, and to Zara/"User" only when the stamp is null. A card `{{user}}`
in the same fixture resolves to Nyx (pin). Storage of that row stays the literal `"{{user}} waves"`.
