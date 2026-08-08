---
kind: review
status: active
updated: 2026-08-07
---

# Narrator mode — live drive (NARRLIVE), 2026-08-07

A dogfood-shaped drive of group **narrator** output against the live dev stack (vite `:5173`, server
`:8788`, vLLM engines `8701/8702/8703`), asking one question: **does narrator mode demonstrably work
end-to-end now that FANOUT-1 changed what the model sees for those rows?**

Nothing in this file is inferred from source alone. Every claim below carries a receipt from a round
actually fired on 2026-08-07 between 15:23 and 15:36 local.

## VERDICT

> **Narrator mode WORKS on the local arm, with two caveats — one cosmetic, one substantive.**
> The wire is correct, the model complies, the renderer splits and tints per character, and `kind`
> survives to delivery. The substantive caveat is that **the co-speaker cards never reach the model in
> narrator mode** (§4) — the round works *in spite of* the assembly, not because of it.
> **The hosted arm is NOT COVERED**; §6 states why, and that blocker is itself the most valuable
> finding of the drive.

| Plane | Local (vLLM Qwen3-VL-8B) | Hosted |
| - | - | - |
| THE WIRE — no `Group:`/`Aria:` prefix on a multi-voice row | ✅ PASS (§1) | not covered |
| THE MODEL — `<speaker>` marker compliance | ✅ PASS, 2/2 rounds (§2) | not covered |
| THE RENDER — split + per-character tint | ✅ PASS (§3) | not covered |
| THE TRACE — `kind` survives to delivery | ✅ PASS (§3.3) | not covered |
| THE PROMPT — co-speaker cards assembled | ❌ **FAIL** (§4) | n/a — assembly is backend-independent |
| Chrome — no markup leaks to a user-visible surface | ❌ minor FAIL (§5) | n/a |

## 0. What was driven, and where the brief's premises died

**The brief named the wrong chat.** "The Ashen Spire" is `output: "per-speaker"`, `cardScope: "merged"`,
`policy: "natural"` — the flagship rpg-lite room, not a narrator room. The pack's **only** narrator room
is **"Example — Second Opinion"** (`domain/chat/seeder/demo-chats.ts:657-678`: `output:"narrator"`,
`policy:"list"`, `speakerTags:true`, cast = Charlotte + JFC). That is what was driven.

**The brief's second premise also died:** the reseeded pack's narrator rows do **not** declare their kind.
Every seeded row in that room reports `kind=standard` in the shape trace (§3.3). Only the two rows this
drive produced carry `kind=narrator`. The demo seeder writes no `kind`, so it takes the
`DEFAULT_MESSAGE_KIND` floor. Worth a follow-up: the pack's own narrator room is the natural fixture for
that axis and currently misrepresents it.

Chat driven: `chat_01kzeme2gjfvhshd2k2vk0asa3` ("Example — Second Opinion", host = the browser session's
user). Four rows were added by driving the product itself, all identifiable by their `NARRLIVE-PROBE-`
prefix: seq 16/17 (`NARRLIVE-PROBE-HOSTED` — misnamed, it ran local; see §6) and seq 18/19
(`NARRLIVE-PROBE-LOCAL-2`).

Backend for both rounds, from the wire recorder: `vllm` / `Qwen/Qwen3-VL-8B-Instruct`, `chat-completions`,
`stream: true`, `presence_penalty: 1.5`, `max_tokens: 2048`.

## 1. THE WIRE — PASS. FANOUT-1 holds.

The question was whether a narrator row arrives at the model prefixed `Group: ` or `Aria: `, crediting one
cast member with the whole cast's narration. **It does not.**

Round 1 committed this canon row (seq 17, `characterId = character_01kzeme2gjfvhshd2reecphc8q` — the
synthetic group character, per D55, *not* Charlotte's or JFC's id):

```
<speaker>Charlotte</speaker> The tagging feature is not a feature — it's a constraint. …
<speaker>JFC</speaker> And if you ship search first, you'll be shipping a broken search. …
<speaker>Charlotte</speaker> Then make the tag assignment happen on save, not on display. …
```

Round 2's wire capture (`GET /api/_debug/wire/captures?chatId=…`, `at: 2026-08-07T15:35:10.718`) delivers
that same row back as history. **The actual `messages[]` entry, verbatim:**

```
{ "role": "assistant", "content":
  "Charlotte: The tagging feature is not a feature — it's a constraint. You're not building an app to
   tag things, you're building one to remember what you read. …\n\n
   JFC: And if you ship search first, you'll be shipping a broken search. …\n\n
   Charlotte: Then make the tag assignment happen on save, not on display. …" }
```

Three facts fall out of that one quote:

1. **No `Group: ` prefix. No `Aria: ` prefix. No outer name at all.** The row is not credited to any single
   cast member. The defect FANOUT-1 fixed is fixed on a live round.
2. `speakerTagsToPlain` (`packages/kit/src/speaker-label/index.ts:144`) fired as designed: the `<speaker>`
   XML became inline `Name: ` attribution, so the model reads who said what without being trained to parrot
   the markup back.
3. Attribution is preserved *per span*, not collapsed — the model can see that the previous narrator turn
   had two distinct voices in it.

The nudge tail is present and correct on both rounds (the round's trailing `user` row, 824 chars):

```
[Continue the scene, voicing the present characters (Charlotte, JFC) as the moment calls for. This is ONE
reply covering the whole scene — voice as many or as few of them as it needs, in any order, with narration
in between. Never write lines or actions for the user.] [Wrap each character's spoken lines and actions in
<speaker>Name</speaker> tags: put the character's exact name between the tags, then what they say and do.
Open a new tag every time the speaker changes. Use the name exactly as it is spelled in the cast — never a
nickname, a pronoun or a title. Leave narration, scene description and anything not attributable to one
character OUTSIDE the tags. Never write lines for the user.]
```

Both `chat.group.narratorNudge` and `chat.group.speakerTags` resolved and joined with a space, exactly as
`engine/round.ts:44-57` describes. `speakerTags` was on (room default for narrator mode).

## 2. THE MODEL — PASS. 2/2 rounds, on an 8B local model.

This was the drive's real risk: a nudge is an instruction, not a grammar, and the neighbouring lesson
(`xgrammar-enforced-schema-is-the-populate-lever`) says a small local model is exactly where an instruction
is dropped.

**Qwen3-VL-8B-Instruct complied on both rounds, with zero prompting from me about the format.**

- Round 1: three `<speaker>` markers, `Charlotte → JFC → Charlotte`.
- Round 2: three `<speaker>` markers, `Charlotte → JFC → Charlotte`.
- Names spelled exactly as the cast spells them, every time. No nicknames, no pronouns, no titles.
- Tags open at every speaker change, per the instruction.

Non-compliance would have been the most valuable possible finding. It did not happen. The instruction
survives an 8B model.

One honest quality note that is **not** a mechanism defect: round 2's third span has Charlotte parroting
JFC's argument almost verbatim. That is 8B coherence, and §4 makes it much more likely than it should be.

## 3. THE RENDER — PASS.

### 3.1 The split happened

`parseSpeakerSpans` consumed the markers (they do not appear as literal text in the bubble) and produced
three spans. Measured in the live DOM:

```
document.querySelectorAll('[data-slot=message-content-spans]')  → 2 containers (one per narrator row)
```

Each container holds three `[data-slot=theme-scope]` children. That is the `MessageContent` narrator path
(`features/chat/components/message-content.tsx:158-180`), not the single-span fallback.

### 3.2 Tints land PER CHARACTER

Computed `--color-dialogue` on each `ThemeScope`, round 2's row:

| span | speaker | resolved `--color-dialogue` |
| - | - | - |
| 0 | Charlotte | `oklch(0.85 0.08 72)` |
| 1 | JFC | `oklch(72% 0.16 48)` |
| 2 | Charlotte | `oklch(0.85 0.08 72)` |

Round 1's row measured identically. **The two non-adjacent Charlotte spans resolve to the same token and
JFC's differs** — that is per-character identity, not per-span alternation, which is the thing worth
proving. Round-1 and round-2 rows agree, so the mapping is stable across turns.

**Against the stated expectation:** the tint plane paints quoted speech and italics only; plain prose spans
are scope-no-color by design. That is exactly what the screenshot shows — `"tag:"`, `"Add Tag"` and the
italic `use`/`find` carry the span's color, the surrounding prose does not. **Reported as expected, not as
a defect.** Attribution chrome reads `Narrator` with the synthetic group avatar, which is correct for a
D55-authored row.

Screenshots: `reports/snaps/narrlive-hosted-round.png` (round 1), `reports/snaps/narrlive-final.png`
(round 2, both rows in frame).

### 3.3 THE TRACE — `kind` survives to delivery

`chat.getShapeTrace` on the driven room, last six delivered rows:

```
assistant | name=ABSENT | canon     | kind=standard | 1333
user      | name=Traveler | merged  | kind=standard | 503
assistant | name=ABSENT | canon     | kind=narrator | 1296     ← driven round 1
user      | name=Traveler | canon   | kind=standard | 125
assistant | name=ABSENT | canon     | kind=narrator | 600      ← driven round 2
user      | name=ABSENT | assembled | kind=ABSENT   | 28       ← the nudge (correctly kind-less)
```

Three things verified at once: `kind=narrator` reaches the delivered-row projection; the nudge is
`source=assembled` with **no** kind, exactly as `ShapeTraceRow.kind`'s contract states; and the narrator
rows carry `name=ABSENT` — the trace plane independently confirms §1's "no `Group:`/`Aria:` prefix".

Every seeded row reports `kind=standard` — see §0.

## 4. ❌ THE PROMPT — the co-speaker cards never reach the model in narrator mode

This is the one substantive defect the drive found, and it is invisible from the render.

**Measured.** The narrator round's `system` row (2716 chars, from the wire capture) opens:

> `You are Charlotte in an immersive, ongoing roleplay with Traveler. Stay in character; write Charlotte's
> perspective only. Address Traveler in the second person; …`

and then carries Charlotte's description, personality, first-message and `<START>` examples. Counted over
that string:

| probe | occurrences |
| - | - |
| `Charlotte` | 7 |
| `JFC` | **0** |
| `Also present` | **0** |

**JFC's card does not exist in the prompt.** The model is told, in the system row, to write *one*
character's perspective *only* — and is then told, in the trailing nudge, to voice the whole cast. It
complies with the nudge because the nudge names the cast; it has no idea who JFC is beyond what it can
reconstruct from transcript history.

**Mechanism (verified in source, not inferred from the symptom):**

- `engine/round.ts:135-152` (`roundSpeakers`) — a narrator round is ONE speaker, and that speaker's ref is
  the **synthetic group character** (`params.groupCharacterId`), with `name = castName`.
- `assembly/speaker-card.ts:18-35` (`shapeContextForSpeaker`) — it locates the speaker in `castMembers` and
  sets `coSpeakers: cardScope === "merged" ? others : []`. The synthetic group character is **not in
  `castMembers` by construction**, so `idx === -1` and the function takes its
  `return ctx; // the speaker isn't in the resolved cast (a wiring gap) — keep the primary, never crash`
  arm — leaving `ctx.character` as the primary member and `coSpeakers` untouched.
- `coSpeakers` has exactly **one writer in the whole server** — that line in `speaker-card.ts`. Verified by
  sweep: `assemble.ts:147`, `:185` and `:379` are the three readers, and there is no other assignment. So
  in narrator mode `coSpeakers` is *always* empty and `renderCoSpeakerBlocks` (`assemble.ts:183-190`)
  always returns `[]`.
- Corroborating tell: `AssembleContext.speaker`'s `{ kind: "cast"; members; active }` arm
  (`contracts/src/chat/assemble.ts:437`), whose own doc comment says *"`cast` (narrator, `{{char}}` = the
  whole cast)"*, has **zero producers** in `packages/server`. The narrator arm of that union was designed
  and never wired. `{{char}}` resolved to `Charlotte`, not to the joined cast name, which is the
  user-visible proof.

**Why it matters.** Narrator mode's entire selling point is one generation voicing the whole cast. Today
that generation sees one card and a "write only this character" instruction. It works on this room because
the transcript is long and JFC has a strong voice in it — a *fresh* narrator room, or one whose cast
member has not spoken yet, has nothing to go on. The `merged` breadth that `cardScope` promises (and that
the narrator arm makes mandatory by omitting `cardScope` from its schema) is not delivered.

**Not fixed here** — this is a drive, not a build lane, and the fix touches the round driver, the speaker-
card shaper and the dead `kind:"cast"` union arm together. Recommend a dispatched lane.

## 5. ❌ Minor — raw `<speaker>` markup leaks into the chat-list preview

Visible in `reports/snaps/narrlive-final.png`, sidebar row "Example — Second Opinion":

> `<speaker>Charlotte</speaker> The searc…`

Located precisely (two nodes, both the same surface):

```
span[slot=list-row-subtitle] < span[slot=list-row-content] < button[slot=list-row-body] < div[slot=list-row-root]
```

The transcript renderer consumes the markers; the list-row subtitle does not. Any room whose most recent
row is a narrator row shows XML in its preview. The fix is the existing `speakerTagsToPlain` (or the span
parse) at the preview projection — it is a one-line reuse, not new machinery.

## 6. The hosted arm — NOT COVERED, and why that is itself the biggest finding

**Two principals disagree about the same user, and the disagreement silently changes which model a room
talks to.**

### 6.1 The mechanism (source-pinned)

- `packages/server/src/entry/auth/seam.ts:113-122` — the `via: "fallback"` path calls
  `sessions.ensureUser(res.identity.handle)` and then stamps **`role: "owner"` unconditionally** on the
  request Principal, regardless of that user's DB row.
- `packages/server/src/entry/auth/seam.ts:147-157` (`createHostPrincipalResolver`) — the frozen-host bridge
  reads the DB row live (`sessions.loadUserById`) and takes `fields?.role ?? "user"`. Its own doc comment
  says a fabricated `role:"user"` "would fail-closed-deny the owner's own privileged turn" — which is
  precisely what happens here, because the DB row genuinely *is* `user`.
- `admin.listUsers`, run from the live session:

  ```
  { id: "01kzemdyvvfvhsh7brk0f3q6c4", handle: "inktomi93@gmail.com", role: "owner", enabled: true }
  { id: "01kzeme26tfvhshb0m5h6pcaw2", handle: "owner",               role: "user",  enabled: true }
  ```

  `sessions.me` for the driving session returns
  `{ userId: "01kzeme26tfvhshb0m5h6pcaw2", handle: "owner", globalRole: "owner" }` — an owner-shaped
  principal over a `role: "user"` row.

### 6.2 The consequence, measured

- `connection.resolveChatCapability` (runs on `ctx.auth`, so `isOwner === true`) reports
  **`api: "agent-sdk", source: "max-pro-sub", model: "claude-opus-4-8"`**.
- The actual turn (runs on the host-principal bridge, so `isOwner === false`) resolves
  **`backend: "vllm", model: "Qwen/Qwen3-VL-8B-Instruct"`** — `ROLE_SELECTORS.chat`'s
  `isOwner ? DEFAULT_AGENT_SOURCE : DEFAULT_LOCAL_SOURCE` (`domain/connection/verbs/resolve-role.ts:62-67`).
- **Two surfaces silently disagree about which model the room uses.** The Connections pane says Opus; the
  bytes go to a local 8B. Nothing warns. This is a dogfood-class defect and it was invisible without a live
  drive — every static instrument agrees with itself.
- Pinning `roleDefaults.chat = {api:"agent-sdk", source:"max-pro-sub", model:null}` to force the hosted arm
  makes the failure loud instead of silent: `chat.previewContextFit` returns **403 `requires owner
  privilege`** (`domain/admin/guard.ts:20-23` → `mintMaxProSub`'s `requireOwner`, `credentials/verbs/
  resolve.ts:72`), and the composer send button goes `aria-disabled="true"` with
  `title="This chat has no working connection — configure one to send."`

### 6.3 Is it new as of today's reseed?

**Pre-existing, not new — but today's reseed reproduced it.** `.env` documents the collision explicitly:
`AUTH_MODE=oidc`, `AUTH_FALLBACK=owner`, `OWNER_HANDLES=inktomi93@gmail.com`, with a comment dated
2026-08-03 recording that "an OIDC identity matching `OWNER_GROUP` provisions as plain `user` ('owner
policy matched but an owner already exists') — exactly what happened on the first live login, 2026-08-03."
D17's single-owner rule means the seeded `owner`-handle row cannot also be owner. So the split is
2026-08-03 vintage; the 2026-08-07 identity-baseline reseed simply recreated both rows in the same shape.

**Scope caveat, stated honestly:** the driving session arrived via **fallback** (a headless browser has no
OIDC cookie), so this is the automation path, not necessarily a human's. A human owner logging in through
authentik lands on `01kzemdyvv…` with a real `role: "owner"` and would resolve max-pro-sub normally. But
`pnpm snap`, the e2e suites, and every automated drive take the fallback path — so **every automated drive
of this stack is silently running on local vLLM while the capability surface claims Opus**, and any
owner-gated behavior is untestable from automation. That is worth a decision either way.

### 6.4 Why no hosted arm was fabricated

Two levers existed and both were refused rather than taken unilaterally:

- `admin.setRole(01kzeme26t…, "owner")` — an identity mutation on the owner's live stack, security-adjacent,
  and outside this drive's "read-only against the db except what the app writes by driving it".
- Adding an OpenRouter credential from `.env` — spends the owner's money and handles his key.
  (`credentials.list` is `[]` for this user and `resolveOpenRouter` has no env fallback:
  `credentials/verbs/resolve.ts:24-33` throws `DomainNoCredentialError`.)

The orchestrator refused both. A fabricated hosted arm would be worse than no arm.

## 7. State left behind

- `roleDefaults` **restored to `{}`**. Receipt: `settings.getUserSettings` →
  `{"roleDefaults":{}}` after the restore. It was set to `max-pro-sub` for ~4 minutes and reverted.
- Four rows added to `chat_01kzeme2gjfvhshd2k2vk0asa3` by driving the product: two user sends prefixed
  `NARRLIVE-PROBE-` and the two narrator rows they produced.
- **Nothing else mutated.** No stack restart, no engine posture change, no schema/db write outside the app,
  no source file touched. All probe artifacts live in the session scratchpad; the only in-tree writes are
  this file and `reports/snaps/narrlive-*.png`.

## 8. What was NOT covered

- **Any hosted backend.** No agent-sdk / max-pro-sub / OpenRouter round was fired — §6. Marker compliance
  on a frontier model is untested; §2's result is a local 8B only. (The prior is that a stronger model
  complies at least as well, but that is a prior, not a receipt.)
- **A fresh narrator room.** Only a room with 16 rows of existing transcript was driven, which is exactly
  the condition that masks §4. A cast-of-two room at turn 1 is the case that would show §4 as a
  user-visible failure, and it was not driven.
- **`speakerTags: false`.** Only the on-by-default arm was exercised; the plain-`Name:` tolerance path
  (`splitOnPlainLabels`) was observed on seeded rows but not driven live.
- **Cast > 2, and a muted member.** `narratorMemberNamesOf`'s mute exclusion and the cast-of-one
  no-nudge guard are untested here.
- **Streaming.** Only settled rows were asserted. `holdTornSpeaker`'s mid-stream torn-tag hold was not
  exercised.
- **Auto-mode chains** (`runChain`) in a narrator room.
