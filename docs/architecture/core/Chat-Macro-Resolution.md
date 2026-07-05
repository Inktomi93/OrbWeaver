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

- **Storage is RAW (D51).** Message content stores literal `{{macros}}`; it is NEVER mutated. All
  resolution happens at CONSUMPTION (read/render/assemble). Editing a message recovers its real tokens.
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

- `{{char}}` → `characterNamesById.get(row.characterId)?.name ?? ctx.speakerCharName ?? …` (the ROW's
  own speaker, never the current turn's speaker — a past line by Aria stays Aria even when Kai speaks now).
- `{{user}}` / `{{persona}}` → `personaNamesById.get(row.personaId)?.{name,description} ??
  ctx.activePersonaName ?? "User"` (the ROW's authoring persona; the active-persona fallback covers a
  null/legacy stamp only).
- Wraps `@orb/kit/macro` `processMacros`; a no-`{{` string is byte-identical passthrough. `<speaker>`
  tags are opaque to the macro parser (disjoint token set) — they pass through for the separate
  `speakerTagsToPlain` pass.

## 3. The five contexts (who resolves what)

| Context | Home | `{{user}}` subject | `{{char}}` subject |
| - | - | - | - |
| **DISPLAY** (viewer) | client `message-render` → the atom | row `personaId` via the producer | row `characterId` via the producer |
| **ASSEMBLE** (model) | server `toShapeCanon` → the atom | row `personaId` via the producer | row `characterId` via the producer |
| **SEND** | stores RAW; stamps `personaId` (PD-100) | — | — |
| CARD sections | server `assemble.ts` | `ctx.pinnedPersona` (anchor, FROZEN at open) | the section's character |
| prompt-config sections | server `assemble.ts` | `ctx.activePersona` (current) | the section's character |

DISPLAY and ASSEMBLE resolve history identically (same atom + same producer semantics) ⇒ **viewer ==
model by construction.** Card and prompt-config sections are NOT history — they keep the two-persona
doctrine (`context.ts:385-386`: `pinnedPersona = anchor ?? active`; `activePersona = active`), unchanged.

## 4. The three persona axes (do not conflate)

- **pinnedPersona** — the chat-open anchor (host-designated in multi-human), FROZEN. CARD `{{user}}` only.
- **activePersona** — the participant's CURRENT persona. Prompt-config-section `{{user}}`, and the
  null-stamp fallback for history.
- **row `personaId`** — the per-message author stamp. HISTORY/message `{{user}}`. Changed ONLY by
  reattribution — a live persona switch never silently relabels old lines.

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
