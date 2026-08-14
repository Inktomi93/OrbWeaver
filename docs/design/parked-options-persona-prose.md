---
kind: design
status: parked
updated: 2026-08-14
---

# Parked options — persona / prose cluster (I-8)

> **Status: DECISION INPUT, not a plan.** Investigate-only lane. No code touched. This is opinionated
> options grounded in the tree as of 2026-08-08, for the owner to rule on. Every load-bearing claim carries
> a `path:line` receipt. Where a thing is owner-sacred it is flagged in bold.
>
> **What I read (full):** `injections.ts`, `contracts/prose-slot/index.ts`, `contracts/chat/prose.ts`,
> `db/schema/persona.ts`, `db/schema/character.ts` (+ `character_personas` junction), `contracts/persona/index.ts`,
> `persona/verbs/create-from-character.ts`, `persona/contract/views.ts`, `persona/substrate/{metadata,macro-swap}.ts`,
> D122 (`Core-Path-Registry.md:353-436`), `FINAL-Persona…md` A.0/A.1/A.8, the I-8 workboard block,
> prose-1-spec §6.3, `contracts/preset/index.ts:709-730` (the carrier-token refusal), `template-drill-in.tsx`.
> **What I did NOT read (and why it may matter):** the full `assembly/context.ts`/`macros.ts` routing (I read
> FINAL-Persona's summary of it, A.1 lines 57-67, not the source line-by-line); the persona-resolution int-suite
> body (owner-sacred contract — I cite its existence, did not re-derive it); the full character card editor UI.

---

## Item 1 — `persona = character` (OWNER-SACRED, reopened for investigation)

**This is the one where "do it right once" matters most, and the one most constrained by owner law.** Two
separate owner-sacred fences sit on top of it — flag both before any build:

- **\[\[persona-is-owner-sacred]]** — the pin CONCEPT + mechanics (anchor/active/current/default precedence,
  `{{user}}` resolution) change only with Nate's sign-off. Validation-at-boundary is fine; behavior is his.
  The behavioral contract that must pass untouched: `tests/server/domain/chat/verbs/persona-resolution.suite.int.test.ts`.
- **Workboard I-8** (`docs/history/retro-workboard-2026-08-08.md:1473-1479`) parks a RELATED item ("mid-session persona-change
  linkage for rpg state") with a ruled flavor — pin semantics applied to keyed state. That is not this item, but
  it tells you the owner reasons about persona identity via the pin model, and any unify proposal collides with it.

### 1.1 What a persona IS vs what a character IS, in code

They are **separate producer-owned tables that already share \~80% of their content shape but diverge hard on
identity, history, and resolution role.**

| Axis | Persona (`db/schema/persona.ts`) | Character (`db/schema/character.ts`) |
| - | - | - |
| Row | `personas` (52 lines, flat) | `characters` (142 lines, flat — D28) |
| Owner | `ownerId` NOT NULL, cascade (`persona.ts:25-28`) | same (`character.ts:47-50`) |
| Content overlap | `name`, `title`, `description`, `starred`, `avatarAssetId` | `name`, `description`, `starred`, `avatarAssetId` — SAME columns |
| Content divergence | ONE description string. That is the whole prompt payload. | `personality`, `scenario`, `greetings[]`, `exampleMessages`, `systemPrompt`, `postHistoryInstructions`, `depthPrompt`, `nickname`, V3 card fields, regex-script junction (`character.ts:88-129`) |
| History | none | `character_snapshots` opaque log, nothing FKs it (`character.ts:149-169`) |
| Identity value | `handle` — none | `CharacterHandle` unique per owner, incl. synthetic `__group__<chatId>` (`character.ts:45,135`) |
| Prompt ROLE | resolves `{{user}}` / `{{persona}}` — the HUMAN side | resolves `{{char}}` — the BOT side |
| Metadata blob | `PersonaMetadata`: `descriptionPosition` + `inject` directive + `createFromCharacter` provenance (`contracts/persona/index.ts:18-27`) | typed columns + `extensions`/`residualData` |
| Junction | `character_personas` M:N already exists (`character.ts:175-193`) | same table |

**The already-built bridge:** `persona/verbs/create-from-character.ts` mints a persona FROM a character card —
copies `name`/`description`/`avatar`, optionally `{{char}}↔{{user}}` swaps the description (`macro-swap.ts:9-11`),
and stores `sourceCharacterId`+`swapMacros` provenance so the derivation is recoverable (`create-from-character.ts:33`).
So the codebase already models "a persona is a character projected onto the human axis, losing everything but
name+description+avatar." That is the current answer to "how are they the same": **a persona is a
one-description subset of a character, minted by a lossy one-way copy.**

### 1.2 Where they DIVERGE, and why the divergence is load-bearing (not accidental)

- **Resolution role is the deep divergence.** `{{user}}` resolves in THREE contexts (Card→Anchor, Prompt→Chat
  persona, History→row stamp — `FINAL-Persona…md:43-55`); personas are the SUBJECT of that whole machine and
  characters are not. `AssembleContext` carries `pinnedPersona` AND `activePersona` as distinct routed objects
  (`FINAL-Persona…md:59-61`). A character has ONE identity per card; a human has FOUR persona POINTERS
  (default/current/chat/anchor — `FINAL-Persona…md:33-38`) selecting WHICH persona applies WHERE. **The pointer
  layer is the persona system's actual complexity, and characters have no analog.**
- **Personas are owner-sacred and never copied across a room boundary** (D122; D131 "personas never copied";
  `Core-Path-Registry.md:436`). Characters ARE copied — the handoff property offer copies cast cards (D131),
  fork copies card content (D133). Unifying the types would drag persona rows into copy paths the owner has
  explicitly walled them out of.
- **History model differs by design** — characters have snapshots that gate nothing (D28); personas have none.
- **`{{persona}}` already pins the whole persona OBJECT** (name→`{{user}}`, description→`{{persona}}`,
  `FINAL-Persona…md:62-65`) — orb is ahead of ST here, deliberately.

### 1.3 What "persona = character" could MEAN architecturally — four readings

1. **Unify the TYPES** — one `entities` table with a `kind` discriminator (`character`|`persona`\[|`agent`]),
   character-only columns nullable on persona rows.
2. **Persona becomes a character-with-a-flag** — personas stored IN `characters` with `role:"human"`, the
   persona pointer layer keying on character ids.
3. **Shared SUBSTRATE, separate homes** — extract the common card shape (name/description/avatar/starred +
   card-content fields) into a `kit`/`contracts` "card substrate" both domains compose, tables stay separate.
4. **Leave split** — keep `createFromCharacter` as the only bridge; formalize nothing.

### 1.4 The options, with what breaks / unlocks

**Option A — Leave split (status quo).**

- Unlocks: nothing new; zero risk to the pin machine and the owner-sacred contract.
- Breaks: nothing. The `create-from-character` bridge already covers the one real user need ("make a persona
  that looks like this character"). Cost: the A.8 "cast-producer smell" (`FINAL-Persona…md:167-181`) stays —
  names come from per-kind producers (`characterNamesById`/`personaNamesById`), avatars split, a documented
  historical-fidelity asymmetry. This is a REAL papercut but it is orthogonal to type unification.

**Option B — Persona-as-character-with-a-flag (readings 1/2).**

- Unlocks: one cast producer, one editor, one history model, a natural `agent` third kind.
- Breaks: EVERYTHING the pin layer assumes. `{{user}}` vs `{{char}}` routing keys on the type boundary today
  (`assembly/context.ts` feeds card sections `pinnedPersona`, user sections `activePersona`). Personas would
  enter the `characters` copy paths D122/D131/D133 wall them out of — a **direct collision with owner law**,
  not a refactor. The four-pointer layer (`seeds.default/currentPersonaId`, `chat_participants.activePersonaId`,
  `chats.anchorPersonaId` — `FINAL-Persona…md:35-38`) would all need to key on character ids. This is the
  "simplify away the awkward case" arm and it is the WRONG arm here — it deletes the design the owner protects.

**Option C — Shared card substrate, separate homes (reading 3). ⟵ RECOMMENDED (see 1.5).**

**Option D — Kind-polymorphic CAST at the resolution layer only, tables untouched.**

- This is the answer FINAL-Persona already committed to (`:175-181`): a per-kind cast producer
  (`characterCastById`/`personaCastById` over active ∪ stamped ids) projecting name/description, built
  **KIND-READY** so the `agent` third axis (D60) is a one-arm add, not a rework. Decision recorded there: land
  it WITH agent-principal, because that lane reworks this exact surface — "unifying now = design for 2 kinds
  then rework for the 3rd."
- Unlocks: kills the A.8 smell, agent-ready, touches NO type or table.
- Breaks: nothing in the pin machine — it operates one layer up, on resolution/attribution, not on identity storage.

### 1.5 RECOMMENDATION — Option C (shared substrate) as the type answer, gated behind Option D as the *first* move

**The forward-thinking, do-it-right-once arm is a SHARED CARD SUBSTRATE (C) — but only the SHAPE, never the
identity/resolution/copy layers — and it should be preceded by the kind-polymorphic cast (D), which is already
the ruled next step and unblocks the real papercut without touching the sacred layer.**

Why C over B: the repo's own law (`AGENTS.md §0.2`, "a type/shape has exactly ONE home") already wants the
name+description+avatar+starred shape to have one home instead of being re-spelled in `persona.ts` and
`character.ts`. That shape is a pure isomorphic value → `kit`/`contracts`. Both domains compose it. Tables,
producers, ownership, and resolution role stay SEPARATE — which is exactly what D122/D131/persona-sacred
require. C gets the DRY-of-shape win the "one home" doctrine asks for **without** the identity collision that B
guarantees. It is more work than B looks, but B's apparent simplicity is a trap: it pays its cost later as a
pin-machine rewrite under owner veto.

Why D FIRST: the actual user-visible pain (the A.8 cast/name/avatar asymmetry) is a RESOLUTION-layer problem,
not a storage problem. D fixes it, is already ruled, and is agent-principal-ready. Do it and the pressure to
unify types mostly evaporates — which is itself evidence that B/reading-1 was solving the wrong problem.

**FLAG:** Every arm except D touches persona identity semantics → **owner sign-off required per
\[\[persona-is-owner-sacred]]**, and B specifically contradicts D122/D131. My recommendation to the owner: bless
D now (it's already yours), and treat C as a "shape hygiene" follow-on that a lane can spec but not land without
your explicit word that the substrate stays SHAPE-ONLY. Do not touch B.

---

## Item 2 — the three nudge default TEXTS (owner-veto)

All three are PROSE-1 slots in `contracts/chat/prose.ts`, `macros:"none"`, home `user`. Verbatim below.
The owner has veto on the wording; these ship LIVE today (defaults, so every unedited room gets these exact bytes).

### 2.1 `chat.group.speakerTags` v1 (`chat/prose.ts:245-250`)

> `[Wrap each character's spoken lines and actions in <speaker>Name</speaker> tags: put the character's exact
> name between the tags, then what they say and do. Open a new tag every time the speaker changes. Use the name
> exactly as it is spelled in the cast — never a nickname, a pronoun or a title. Leave narration, scene
> description and anything not attributable to one character OUTSIDE the tags. Never write lines for the user.]`

- Fires: every MULTI-member narrator round with "Label each speaker" on (default-on in narrator mode, `:255`).
- `requiredTokens: ["<speaker>", "</speaker>"]` — these are the RENDERER's parse contract; the split-and-tint
  producer keys on them (`:239-244`). No name token.
- **Reads well as a model instruction?** Yes — this is the strongest of the three. Concrete, enumerates the
  edge cases a weak local model gets wrong (nicknames, pronouns, narration-outside-tags), ends with the
  user-line fence. Ship-as-is.

### 2.2 `chat.group.narratorNudge` v1 (`chat/prose.ts:225-228`)

> `[Continue the scene, voicing the present characters ({{names}}) as the moment calls for. This is ONE reply
> covering the whole scene — voice as many or as few of them as it needs, in any order, with narration in
> between. Never write lines or actions for the user.]`

- Fires: every MULTI-member narrator round with the group nudge on (`:233`).
- Carries `{{names}}` = the comma-joined present non-muted member names, spliced by the caller
  (`round.ts:51`, `resolveProseText("chat.group.narratorNudge", prose, { names: memberNames.join(", ") })`).
  `requiredMacros: ["{{names}}"]` so the editor warns a host who drops it.
- **Reads well?** Yes. The "ONE reply covering the whole scene" clause is doing real work against models that
  default to one-character replies. Ship-as-is.

### 2.3 `chat.group.roundNudge` v2 (`chat/prose.ts:208-211`)

> `[Write the next reply only as {{name}}. Stay in {{name}}'s voice — their dialogue, actions and thoughts
> only. Do not write lines for the other characters or for the user, and do not open the reply with a name label.]`

- Fires: every speaker of a MULTI-speaker group round (`:216`); `{{name}}` = the speaker, spliced at `round.ts:76`.
- v2 (bumped from v1) deliberately spells out the two failure modes the RECEIVE side otherwise cleans up
  (`cleanPerSpeakerReply`): the echoed `Name:` self-label and drifting into another character's lines
  (`:204-207`). The header's rationale: "saying them here is cheaper than repairing them, and a small local
  model needs them said."
- **Reads well?** Yes. Ship-as-is.

### 2.4 The `{{names}}`-style token question

The workboard framing (`:1319-1320`): "`{{user}}` is deliberately absent (`macros:"none"` slots); a
`{{names}}`-style pre-sub token is small plumbing on his word." Ground truth of the CURRENT token wiring:

| Slot | token today | wired at |
| - | - | - |
| `narratorNudge` | `{{names}}` (plural, comma-join) | `round.ts:51` |
| `roundNudge` | `{{name}}` (single speaker) | `round.ts:76` |
| `speakerTags` | NONE | `round.ts:54` (resolved with no tokens) |

So the token mechanism already exists and is proven (`spliceProseTokens`, `prose-slot/index.ts:299-308` — a
plain string replace, NOT the macro engine, so it can't double-resolve already-macro'd text). The open plumbing
question is narrow: **should `speakerTags` gain a token** (e.g. `{{names}}` so the instruction can name the cast
it's tagging)? It reads fine WITHOUT one — the tag names come from the cast the model already has — so this is a
nice-to-have, not a gap.

### 2.5 RECOMMENDATION (item 2)

**Ship all three verbatim (option: ship-as-is), and do NOT add a token to `speakerTags`.** These are already
version-bumped, measured against weak local models per their headers, and they read as clean model instructions.
The forward-thinking arm here is restraint: they are owner-editable DATA now (PROSE-1 slots), so any host who
wants different words has the editor — there is no reason to pre-optimize the defaults or add plumbing the
default doesn't need. The one thing I'd surface for the owner's eye: `roundNudge` and `narratorNudge` use
`{{name}}` vs `{{names}}` respectively — that asymmetry is CORRECT (one speaker vs the whole cast) but is exactly
the kind of thing that reads like a typo; leave it, it's right. **All three remain his veto — this is a
recommendation to release, not a release.**

---

## Item 3 — `{{note}}` warn-vs-block posture

### 3.1 How `{{note}}` resolves today

`{{note}}` is the pre-substitution token on the two injection note frames. `frameInjection`
(`injections.ts:51-60`) demotes a system/user injection to a framed user row and calls:

```
resolveProseText(originalRole === "system" ? "chat.injection.systemNote" : "chat.injection.userNote",
                 prose, { note: trimmed })
```

The slots (`chat/prose.ts:257-282`):

- `chat.injection.systemNote` → `"[Note from system: {{note}}]"`, `requiredMacros: ["{{note}}"]`, home `preset`.
- `chat.injection.userNote` → `"[Note from user: {{note}}]"`, `requiredMacros: ["{{note}}"]`, home `preset`.

`{{note}}` = the injection's ENTIRE payload (`injections.ts:59`, `{ note: trimmed }`). The frame WRAPS the
payload; `{{note}}` is where the payload lands.

### 3.2 What "warn vs block" refers to

It is NOT about an empty note or a wrong role. It is about a HOST OVERRIDE of the frame text that **drops the
`{{note}}` token.** Because the token IS the payload slot, an override like `[System says something]` (no
`{{note}}`) renders `[System says something]` on the wire with **the actual instruction GONE** — a silent,
total payload loss, exactly the `wrapWiFormat`-skips-the-wrap failure the owner already ruled on for format
strings.

Current posture: **WARN, never block.** `{{note}}` sits in `requiredMacros`, and `requiredMacros` is
warn-never-block by ruling (`prose-slot/index.ts:38-39`; prose-1-spec §6.3 `:353`: "rendered as a WARN in the
editor footer — never a block, never a server-side rejection"; editor: `template-drill-in.tsx:191-193`, "It
stays a warning, not a refusal").

### 3.3 THE INCONSISTENCY that makes this a live question

**A structurally identical carrier token in a SIBLING preset slot is a BLOCK, not a warn.** `wiFormat` requires
`{{entry}}`, and dropping it is a WRITE REFUSAL: `FORMAT_STRING_CARRIER_TOKENS = [{key:"wiFormat",
token:"{{entry}}"}]` (`contracts/preset/index.ts:730`), owner ruling 2026-08-02 verbatim in the header
(`:716-729`): *"format strings must not silently break… A carrier format string WRAPS content, so a non-empty
value that drops its token renders the wrapper with the content GONE… That write is REFUSED with a message
naming the token."*

**`{{note}}` on the injection frames is the SAME SHAPE as `{{entry}}` on `wiFormat`** — a carrier token whose
absence deletes the payload — but it is classed warn-never-block. The editor code even names the split
explicitly (`template-drill-in.tsx:192-193`: warn "deliberately unlike `FORMAT_STRING_CARRIER_TOKENS`, whose
write-refusal is a separate owner ruling about format strings"). So the two note frames sit on the WRONG side of
a line the owner has already drawn for the identical failure mode. **This is the crux the owner needs to rule.**

### 3.4 The options

- **A — Leave warn-never-block.** Consistent with the general prose posture; a host who nukes `{{note}}` gets a
  footer warning and their injections silently ship empty. Cheapest; preserves the "prose is never refused" line.
- **B — Reclassify `{{note}}` as a CARRIER token → BLOCK at write.** Add both note-frame keys to the carrier
  refusal set (the note frames are `home:"preset"`, so they save through the preset-prose write boundary
  `normalizePresetProse` — named in `prose-slot/index.ts:199` — the same boundary the `wiFormat` carrier guard
  in `contracts/preset/index.ts:730` validates on; exact call-site wiring not traced this lane). One-row-per-key
  extension of an existing, ruled mechanism.
- **C — Middle: block only `{{note}}` (payload carriers), keep name/heading tokens (`{{name}}`/`{{names}}`) as
  warns.** Rationale: dropping `{{name}}` degrades quality (co-speaker headings read alike) but dropping
  `{{note}}` is TOTAL DATA LOSS. The severity differs, so the posture can differ.

### 3.5 RECOMMENDATION (item 3) — Option C (block the payload carriers, warn the rest)

**The do-it-right-once arm is to treat `{{note}}` (and `{{entry}}`, already done) as CARRIER tokens that BLOCK
at write, while leaving cosmetic tokens (`{{name}}`/`{{names}}`) as warns.** The owner has already ruled the
principle for `wiFormat` ("format strings must not silently break") and the note frames are indistinguishable in
failure mode — a dropped carrier deletes user content silently. Extending the existing
`FORMAT_STRING_CARRIER_TOKENS` set by two rows is the minimal, consistent, forward-looking move: it makes the
enforcement match the actual data-loss severity instead of the incidental "is it a format string vs a prose
frame" category the current split rests on.

Why not A: warn-never-block is the right DEFAULT for prose whose worst case is "reads a bit worse." It is the
wrong posture for a token whose absence is a silent total-payload loss — that is precisely the class the owner
carved OUT of warn-never-block for `wiFormat`. Keeping `{{note}}` in warn means the tree enforces the same
failure two contradictory ways.

**FLAG:** This reverses a recorded posture — `template-drill-in.tsx:191-193` and prose-1-spec §6.3 both state
`{{note}}`/`requiredMacros` are deliberately warn-never-block. So this is a FORK: the OLD ruling (prose is never
refused) vs the NEW finding (this specific token is a `wiFormat`-class carrier the owner already blocks
elsewhere). The reconciliation is the owner's: my read is that the `wiFormat` carrier ruling (2026-08-02) is
NEWER and more specific than the general prose warn-never-block, and that the note frames were simply not
reclassified when they re-homed to `preset` on 2026-08-07 (`chat/prose.ts:18-24`). But I did not build it — the
owner rules the fork.

---

## Cross-item note for the orchestrator

- Item 2 is the cheapest to close: it needs a yes/no from the owner, no design. Recommend releasing the three
  texts as-is.
- Item 3 is a clean, ruled-precedent-backed extension (two rows into an existing guard) once the owner blesses
  the fork in 3.5. It is the highest value-per-effort of the three.
- Item 1 is the heavy one and is doubly owner-gated. My strong recommendation is to decouple it: bless the
  already-ruled kind-polymorphic cast (D, `FINAL-Persona…md:175-181`) which fixes the real papercut and stays
  clear of the sacred layer, and treat type unification (C, shape-only) as a separate, explicitly-scoped
  follow-on — NOT as a single "persona = character" build. Reading B (persona-as-character-with-a-flag)
  contradicts D122/D131 and should be taken off the table.
