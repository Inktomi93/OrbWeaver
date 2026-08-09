---
kind: review
status: active
updated: 2026-08-08
---

# Import fidelity audit — what the ST importer drops or misattributes (2026-08-08)

Owner report: **times/dates and tokens-in/out "come out wrong" on import.** This is the per-boundary
field-fidelity diff behind that report, driven against the **real corpus**
(`/home/inktomi/inktomi-stack/development/neo-tavern/st-data`, both profile dirs): **1,097 chat `.jsonl`
files · 24,824 ST message lines · 313 character card PNGs · 8 lorebooks · 1 group**.

Method — the four hops. **(1)** ST file bytes → **(2)** `parseChatJsonl` (`packages/server/src/kit/serde/chat/index.ts`)
→ **(3)** `buildBulkImportChatInput` (`packages/server/src/domain/import/substrate/chat-input.ts`) → **(4)**
the `chats`/`messages`/`message_variants` rows (`packages/server/src/domain/chat/persistence/import-write.ts`)
→ **(5)** the read-back. **Hops 1→3 were DRIVEN over the whole corpus** with orbweaver's own parse + mapping
code (harness in the lane scratchpad; it imports the real modules, not a re-implementation). **Hops 3→4→5
were read from source**, because `import-write.ts` inserts hop-3's fields verbatim — every claim below about
a column names its `path:line`. Where a column's value is *computed* at hop 4 (`seq`, attribution,
`selectedVariantId`) that is called out. No live db was touched.

---

## 0. THE HEADLINE — the distribution check

The owner's acceptance criterion: the corpus is ~3 years of chats, so the imported distribution must span
~3 years and must **not** cluster at import time.

**It does not cluster.** Message timestamps are the ST `send_date`, not the import clock
(`chat-input.ts:112` — `m.sendDate ?? created`), and the corpus-wide histograms agree:

**MESSAGE timestamps, by calendar year (24,807 mapped message slots; 17 debris rows dropped at parse)**

| source | 2023 | 2024 | 2025 | 2026 | span |
| - | - | - | - | - | - |
| ST bytes, decoded as a LOCAL wall clock (ground truth) | 0 | 0 | 13,885 | 10,939 | 2025-02 … 2026-06 |
| orb, BEFORE this lane's fix | 0 | 0 | 13,880 | 10,927 | 2025-02 … 2026-06 |
| orb, AFTER | 0 | 0 | 13,880 | 10,927 | 2025-02 … 2026-06 |

**CHAT `createdAt`, by calendar year (1,097 chats)**

| source | 2023 | 2024 | 2025 | 2026 | 2027 (future!) |
| - | - | - | - | - | - |
| ST filename `@`-date (strict reference decode) | 2 | 12 | 608 | 398 | 0 |
| orb, BEFORE | 8 | 21 | 670 | 398 | **3** |
| orb, AFTER | 8 | 19 | 671 | 399 | 0 |

So the defect is **not** a collapse to `now()` — it is (a) a **uniform 6–7 h backward shift on 49.6 % of
messages**, and (b) a small set of chats that fell back to the import clock and landed in the **future**.
Both are fixed in this lane. The year totals barely move because a 7-hour shift rarely crosses a year
boundary — which is exactly why this survived to production: it is invisible in a histogram and obvious on a
message row, which is where the owner saw it.

**How wrong, per raw ST date format** (messages whose instant changed between the two readings):

| raw `send_date` format | count | share | moved? |
| - | - | - | - |
| `"November 3, 2025 6:43am"` (human/meridiem) | 12,305 | **49.6 %** | **YES — by the writer's UTC offset (6 h MDT / 7 h MST)** |
| `"2025-11-30T18:47:20.993Z"` (ISO) | 12,477 | 50.3 % | no — absolute, always correct |
| `1753388387185` (epoch ms) | 25 | 0.1 % | no — absolute, always correct |

Plus **1,096 of 1,097 chat `createdAt`** values moved (the filename `@`-date is the same wall-clock class),
and **513 header `create_date`** values.

---

## 1. DEFECT A — ST's zone-less dates were read as UTC; they are a LOCAL wall clock

**Severity: the owner-reported one. 49.6 % of all imported messages + ~100 % of chats.**

### The evidence

ST writes two zone-less date forms, and both are built from the **local** `Date` of the machine ST ran on.
SOURCE-PINNED, not inferred:

- `SillyTavern/public/scripts/RossAscends-mods.js:169` `humanizedDateTime()` — builds
  `YYYY-MM-DD@HHhMMmSSsMSms` from `date.getFullYear()/getMonth()/getDate()/getHours()/…`, i.e. **local**.
  This is the chat FILENAME and the header `create_date`.
- `SillyTavern/public/scripts/utils.js:1119-1123` `convertFromMeridiemBased` — ST's own READER turns
  `"June 19, 2023 2:20pm"` into `"2023-06-19T14:20:00"` with **no `Z`**, which `moment()` resolves
  **locally**. So the meridiem form is local on both write and read.

Orb read both as UTC (`Date.UTC(...)` in the old `parseAtDate`/`parseMonthWithTime`, and a `formatStDate`
built on `getUTC*`), under a file-header rule that said *"ALL formats interpreted as UTC — one canonical
instant, no server-tz drift."*

**Empirical confirmation from the corpus** (548 files whose FIRST message is already ISO, so the absolute
instant is known): `ISO(first message) − filenameDateReadAsUTC` clusters at exactly

```
delta = +7h → 231 files      delta = +6h → 110 files      (+ a tail of files whose first
                                                            message came minutes after creation)
```

`+7 h` = MST and `+6 h` = MDT — **America/Denver, both DST arms.** A single fixed offset cannot express
that pair; the zone must be resolved per instant.

**Same-file receipt** (`/nate-work/chats/Ruby/Ruby - 2025-12-28@12h55m04s.jsonl`): the filename says
`12h55m04s` and message 0's `send_date` says `"December 28, 2025 12:55pm"` — the two wall-clock spellings
of the identical instant, proving they share one clock.

**Worst single value seen:**
`/default-user/chats/Abigail1/Abigail - 2025-11-30@11h47m20s989ms.jsonl` — true creation
`2025-11-30T18:47:20.993Z`; orb wrote `chats.createdAt = 2025-11-30T11:47:20.000Z`, **7 hours early**, i.e.
the chat header rendered as having been created before its own first message.

### The RULING FORK (the header said the old behavior was deliberate)

`packages/kit/src/time/index.ts` header, verbatim:

> *"All provider + import boundaries normalize to epoch-ms HERE — Luxon parses everything as UTC — so no
> seconds-vs-ms or local-vs-UTC drift can leak downstream."*

`packages/server/src/kit/serde/chat/index.ts` header esoterica, verbatim:

> *"dates emit in the legacy human form (UTC, minute precision); parseStDate reads it back."*

and `parseStDate`'s own doc: *"ALL formats interpreted as UTC … one canonical instant, no server-tz drift."*

**What was done:** the NEW SYMPTOM is satisfied and the OLD MECHANISM is preserved, because the old rule is
right about the class it was actually written for and wrong about one it swept in.

- The mechanism the rule defends is *"a parse must not silently depend on ambient state."* That is kept: the
  codec takes an **explicit `wallClockZone` argument** and **defaults to `"UTC"`**, so it remains a pure
  function of its inputs and every orb-authored fixture (the demo-chat seeder, the round-trip drift guard)
  is byte-identical.
- The rule is correct for **absolute** encodings — a numeric epoch and a naive ISO string still resolve
  exactly as before, and `wallClockZone` cannot move them (pinned by a test).
- It is **false for a zone-less wall clock**, which is not an instant at all until a zone is named. Those
  now resolve in the declared zone, and the ST-interchange DOORS declare it.

The headers of both files were truth-repaired in the same commit rather than left contradicting the code.

### The fix

- `@orb/kit/time` gains `hostTimeZone()` (the single sanctioned ambient-zone read — this module is already
  the declared `no-raw-intl-time` exemption zone) plus the inverse pair `wallClockToMs` / `msToWallClock`,
  which are DST-aware **per instant** via Luxon.
- `parseStDate(v, zone = "UTC")`, `formatStDate(ms, zone = "UTC")`,
  `parseChatJsonl(text, { …, wallClockZone? })`, `buildChatJsonl(chat, { wallClockZone? })`.
- The ST-interchange doors pass `hostTimeZone()`: the profile-dir collector
  (`entry/import/run-profile-dir-import.ts` → `domain/import/loader/collect.ts`), the single-file import
  verb (`domain/import/verbs/import-chat-file.ts`, via the new injected
  `ImportProfileDeps.stWallClockZone`), the upload composition root (`entry/compose/portability.ts`).
- **`domain/export/verbs/export-chat.ts` passes the SAME zone.** This is not scope creep, it is the other
  half of the same defect: ST's reader is naive/local, so an orb export emitting UTC renders shifted **in
  ST**, and an export→import round trip on one box would otherwise drift by the offset. One value, both
  directions.

**Why the host zone is the right default:** a corpus's writing zone is not recorded anywhere in the format.
The importing box is the honest guess and is *exact* for the ordinary case (a user importing their own ST
data on the machine ST ran on). It is INJECTED, not read down in the parser, so a future "the export came
from another machine" setting has one place to land — see FIX-STATUS.

---

## 2. DEFECT B — 76 chat files' creation date was thrown away (3 landed in the FUTURE)

**Severity: high — silent, and it produces visibly impossible dates.**

Orb's filename/`@`-date regexes demanded two-digit month/day/time and no interior spaces:

```
ST_AT_DATE    = /(\d{4})-(\d{2})-(\d{2})\s*@\s*(\d{2})h\s*(\d{2})m\s*(\d{2})s/
FILENAME_DATE = /\d{4}-\d{2}-\d{2}\s*@\s*\d{2}h\d{2}m\d{2}s/     ← stricter than its own sibling
```

ST's own reader (`utils.js:1128-1137`) accepts `\d{1,2}` and a spaced variant. **76 of 1,097 corpus files
(6.9 %) carry a spelling orb rejected**, e.g.

```
Emily Singleton - 2025-5-7 @22h 52m 11s 856ms.jsonl
Block Of Cheese - 2025-12-24 @16h 15m 35s 14ms.jsonl
Borealis - 2024-3-3@14h33m22s.jsonl
Seraphina - 2023-5-12 @21h 32m 29s 224ms.jsonl
```

A filename miss degrades `ParsedChat.createDate` to `null`, and `chat-input.ts:96` then falls back to the
first message's `send_date` and **finally to `deps.now()` — the import clock.** With a driver clock of
2027-01-15, **3 chats landed at 2027-01-15** (a future date, from files named `2025-12-22` and `2025-5-7`):

```
2027-01-15T08:00:00Z  /default-user/chats/Bengal/2025-12-22 @22h 21m 47s 432ms.jsonl
2027-01-15T08:00:00Z  /default-user/chats/Emily Singleton/Emily Singleton - 2025-5-7 @22h 52m 11s 856ms.jsonl
2027-01-15T08:00:00Z  /default-user/chats/Lucas Singleton/Lucas Singleton - 2025-5-7 @22h 52m 20s 516ms.jsonl
```

**This is the "stamped at import time" bug the owner's criterion was aimed at — it exists, but for 3 chats,
not for the corpus.** The other 73 silently took a later message's date as the creation date.

**Fixed:** both regexes now mirror ST's own patterns (`\d{1,2}`, space-tolerant), and are documented as
having to stay in lockstep (`FILENAME_DATE` feeds its whole match back through `parseStDate`). Post-fix the
future rows are gone and 6 more 2023 chats + 7 more 2024 chats recover their true creation date.

---

## 3. DEFECT C — a user's typed tokens were booked as model OUTPUT

**Severity: the owner's second report. 1,267,076 tokens of the corpus mis-axed.**

ST has exactly ONE token field and no in/out axis. SOURCE-PINNED (`SillyTavern/public/script.js:5863`, the
user-send path):

```js
message.extra.token_count = await getTokenCountAsync(message.mes, 0);
```

— it is **the token count of that row's own text**, not an API usage figure. Orb routed it to
`tokensOut` for every role.

| role | rows with `token_count` | tokens | pre-fix landing | correct axis |
| - | - | - | - | - |
| assistant | 3,512 | 2,306,791 | `tokens_out` | `tokens_out` ✓ |
| **user** | **3,431** | **1,247,278** | **`tokens_out`** ✗ | `tokens_in` |
| **system** | **6** | **19,798** | **`tokens_out`** ✗ | `tokens_in` |

The consequence is not cosmetic. `domain/stats/write/rebuild-from-canon.ts:314` sums
`v.tokens_out` for **every** message regardless of role into `ownerStats.tokensOut` / `dailyStats.tokensOut`
(`messages-economics.ts:45` and `rollups.ts:266` do the same). Against this corpus the owner's "tokens out"
figure was inflated by **35 %** by text the user typed, while **`tokens_in` was `0` for the entire imported
library** — a suspiciously round number that reads exactly like "we don't track that", which is what makes
it look like a display bug rather than a routing bug.

**Fixed:** `tokenColumns(tokenCount, role)` in the serde routes by ST's own `is_user`/`is_system` flags;
`ParsedChatMessage`/`ParsedVariant` gain `tokensIn`; `chat-input.ts` carries both onto
`BulkImportVariantInput`; `import-write.ts:238` already wrote `v.tokensIn ?? null`, so hop 4 needed no
change. The build half un-routes (`token_count: m.tokensOut ?? m.tokensIn`) so the interchange round trip is
byte-identical. The `BulkImportVariantInput.tokensIn` contract doc — which claimed *"ST carries no inbound
count, so the jsonl arm leaves this absent"* — was truth-repaired: that was a claim about ST's field NAMES,
not about what the value means.

---

## 4. The full hop table

`✓` = lands correctly. `DROP@n` = present at hop n, gone at n+1. `MISATTR` = lands in the wrong place.
`DELIB` = deliberate, with the code receipt.

### 4.1 Solo chat — message fields

| ST field | hop 2 | hop 3 | hop 4 column | verdict |
| - | - | - | - | - |
| `mes` | `content` | selected variant `content` | `message_variants.content` | ✓ |
| `is_user`/`is_system` | `role` | `role` | `messages.role` | ✓ |
| `send_date` | `sendDate` | `createdAt` | `messages.created_at` + `message_variants.created_at` | **FIXED (Defect A)** — was UTC-read |
| `extra.token_count` | `tokensIn`/`tokensOut` | both | `tokens_in`/`tokens_out` | **FIXED (Defect C)** — was all `tokens_out` |
| `extra.model` | `model` | `model` | `message_variants.model` | ✓ |
| `extra.api` | `provider` | `provider` | `message_variants.provider` | ✓ |
| `extra.reasoning` | `reasoning` | `reasoning` | `message_variants.reasoning` | ✓ (24,424 rows) |
| `extra.time_to_first_token` | `ttftMs` | `ttftMs` (**selected variant only**, `chat-input.ts:38`) | `ttft_ms` | ✓ — ST records one per message, so per-variant would be fabrication |
| `extra.type: "narrator"` | `kind` | `kind` | `messages.kind` | ✓ (D129) |
| `gen_started` / `gen_finished` | `genStarted`/`genFinished` | `genStartedAt`/`genFinishedAt` | same | ✓ (ISO in this corpus — absolute) |
| `extra.*` residue (`bias` 11,426 · `reasoning_duration` 12,371 · `reasoning_signature` 6,057 · `isSmallSys` · `gen_id` · `memory`) | `metadata` | `metadata` | `message_variants.metadata` | ✓ **for single-take rows** · **DROP@3 for swipe-bearing rows** — see 5.1 |
| `name` (per-turn speaker) | `speakerName` | used by the GROUP arm as the fallback speaker match | `messages.character_id` | ✓ since lane #25 — see 5.2. Still unused on the SOLO arm, correctly: a solo transcript has one voice |
| `original_avatar` (per-turn speaker IDENTITY) | `originalAvatar` | `characterId` via `speakerByFile` | `messages.character_id` | ✓ since lane #25 — see 5.2 |
| `swipes[]` / `swipe_id` | `variants[]` / `activeVariantIdx` | full pool | one `message_variants` row each | ✓ — **all** swipes retained, not first-only; empty slots dropped and the active index remapped |
| `swipe_info[i].extra.*` | `variants[i].model/provider/tokens/reasoning` + `metadata` | same | same | ✓ |
| `swipe_info[i].send_date` (78,407) | inside `variants[i].metadata` | same | `message_variants.metadata` | ✓ lossless, but not promoted to a column — see 5.4 |
| `extra.media` / `files` / `image` / `file` (167 rows) | keeps the row alive (`carriesMedia`) | — | — | **DROP@2 (the bytes)** — see 5.3 |
| `agent_author` | `agentAuthor` | — | — | **DELIB** — `serde/chat` header, PD-17: a foreign install has no matching agent principal |

### 4.2 Solo chat — chat-level fields

| ST field | hop 2 | hop 3 | hop 4 column | verdict |
| - | - | - | - | - |
| filename `@`-date | `createDate` (wins over header) | `createdAt` | `chats.created_at` | **FIXED (Defects A + B)** |
| header `create_date` (513 files) | `createDate` fallback | ” | ” | **FIXED (Defect A)** |
| — (derived) | — | `updatedAt = max(send_dates)` | `chats.updated_at` | ✓ **not** `now()` — `chat-input.ts:98` |
| `character_name` | `characterName` | (re-link key) | — | ✓ |
| `user_name` | `userName` | → `anchorPersonaId` via `personaByUserName` | `chats.anchor_persona_id` | ✓ |
| filename | `importedFrom` | `title` (ext stripped) + `importedFrom` | `chats.title`/`imported_from` | ✓ |
| file bytes | — | `importHash` (sha256) | `chats.import_hash` | ✓ dedup oracle |
| `chat_metadata.main_chat` (216) | `parentRef` | `parentRef` | `chats.parent_chat_id` + `forked_at` | ✓ resolved character-wide |
| `chat_metadata.note_prompt` (1,070) | `notePrompt` | `authorsNote` | a `chat_injections` row | ✓ landed, **but at a hardcoded placement** — see 5.5 |
| `chat_metadata.note_depth/position/role/interval` (1,070) | in `sourceMetadata` | — | — | **DROP@3** — see 5.5 |
| `chat_metadata.variables` (494) | in `sourceMetadata` | — | — | **DROP@3** — see 5.6 |
| `chat_metadata.pinnedPersona` (71) · `scenario`/`mes_example`/`system_prompt` (5) · `timedWorldInfo` · `chat_id_hash` · `lastInContextMessageId` · `script_injects` (581) · `tainted` · `integrity` | `sourceMetadata` | — | — | **DROP@3** — see 5.7 |
| (classifier) | `bucket` | `isRealConversation` | — | ✓ gates the PD-78 backfill |

### 4.3 Character card

| ST field | hop 2 | hop 4 column | verdict |
| - | - | - | - |
| every V2/V3 content field | `CharacterCard` | typed columns | ✓ |
| `data.creation_date` / `modification_date` | `creationDate`/`modificationDate` | `characters.creation_date/modification_date` (**unix SECONDS**, by the column's own header) | ✓ carried — **but ABSENT from all 307 parseable corpus cards** (positive-controlled: 307/307 yielded `name`/`description`/…, 0 yielded `creation_date`) |
| — | — | `characters.created_at = ctx.now()` (`domain/character/verbs/create.ts:86,100`) | **import clock, by design** — the row's birth, not the card's authorship. With `creation_date` absent everywhere, the corpus carries **no** character authorship date at all; the file mtime is the only on-disk signal and is not read. See FIX-STATUS. |
| `data.tags` | `tags` | `tags` + junction | ✓ |
| `data.character_book` (85 cards) | `book` | lorebook rows | ✓ |
| `data.extensions` residue | `extensions`/`residualData` | same | ✓ |

### 4.4 Honest negatives — things that import perfectly

Worth stating, because the report would otherwise read as if nothing works:

- **The full swipe pool travels.** 12,718 swipe-bearing messages / 79,594 slots — every non-empty take
  becomes a `message_variants` row with its own model/provider/tokens/reasoning/timings, and `swipe_id` is
  remapped onto the surviving pool. Not first-only.
- **`updatedAt` is the ST last-activity**, computed as `max(send_dates)`. This is the field a naive importer
  gets wrong (`now()`); orb got it right.
- **ISO and epoch `send_date`s (12,502 messages, 50.4 %) were always exactly correct** — the date defect is
  format-specific, which is why it looked intermittent.
- **`reasoning` traces** land on 24,424 rows.
- **Branch lineage**: `main_chat` (216 files) resolves to a real `parent_chat_id`, with a filename-derived
  fallback for `"… - Branch #N.jsonl"`.
- **Dedup is real**: a re-import of byte-identical files writes zero rows (`chats.importHash`).
- **Debris is not minted as empty rows**: 17 of 24,824 lines were text-less and media-less and were skipped.

---

## 5. Findings reported, NOT fixed in this lane

### 5.1 A swipe-bearing message loses its message-level `extra` blob — and `reasoning_duration` with it

`chat-input.ts:20-41`: when a message has a real swipe pool, each variant's `metadata` is
`swipe_info[i]` and the message's own `extra` object is never carried. Two consequences:

1. `message_variants.metadata` holds **two different shapes** depending on the path: ST `extra` (flat) for a
   single-take row, ST `swipe_info[i]` (which NESTS `extra`) for a swipe row.
2. `rebuild-from-canon.ts:426` and `:525` read `json_extract(v.metadata, '$.reasoning_duration')`. That path
   only exists in the flat shape, so **reasoning time reads NULL for every swipe-bearing imported message**
   (12,718 of 24,824 rows). `extra.reasoning_duration` is present on 12,371 rows corpus-wide.

Not fixed here: the correct answer is a normalized variant-metadata shape, which is a decision about a
column two domains read, not an import-local fix.

### 5.2 Group-chat speaker attribution — RESOLVED by lane #25, do NOT re-open

This audit was written against `9e792f097`, where `loader/collect.ts` walked `<profile>/chats/<charDir>/`
only (ST's `group chats/` + `groups/` were reported as `unhandled`) and `chat-input.ts` never set
`BulkImportMessageInput.characterId`, so every assistant slot took the run's primary character. **Both were
built by lane #25 (`33ffe9fc3`, merged `5d05d0101`) while this lane was in flight.** Receipts on today's
tree: `loader/collect.ts:68-69` collects `GROUP_CHATS_DIR`/`GROUPS_DIR`, and
`chat-input.ts:128-138` `groupSpeakerFor` resolves the per-slot speaker by ST's `original_avatar` card
FILENAME through `deps.speakerByFile` (the identity match, handle-suffix-safe), falling back to a
roster-scoped `speakerByName` match and finally to the write op's documented "absent ⇒ primary";
`buildGroupChatInput:146-155` attaches that plus the room's `roster`. Nothing here is open.

### 5.3 Message attachments are dropped

167 corpus rows carry `extra.media` / `files` / `inline_image` / `image` / `file`. `carriesMedia`
(`serde/chat`) uses them only to decide the row is not debris; the attachment itself is not resolved to an
`assets` row. Correct for the current shape — the bytes live outside the `.jsonl`, in the ST profile's
`user/images/` tree, which the collector does not walk — but it is a real content drop and should be named
as such rather than discovered later.

### 5.4 `swipe_info[i].send_date` is not promoted to a column

Present on 78,407 swipe entries; survives inside `message_variants.metadata`, so nothing is lost, but a
per-swipe timestamp has no column and no reader. Low value; listed for completeness.

### 5.5 The imported author's note ignores ST's recorded placement

`import-write.ts:320,354` lands `note_prompt` at a hardcoded `depth: 4`, `position: "in_chat"`,
`role: "system"`. ST records `note_depth`, `note_position`, `note_role`, `note_interval` alongside it on
**1,070 of 1,097** chats, and `chat_injections` has columns for depth/position/role. This is a
**misattribution of placement**, not a drop of the text. Deliberate today (the header calls depth 4 "the
house author's-note register") — but it is a ruling about *orb-authored* notes being applied to *imported*
ones, and the imported value is available. Recommend: honor ST's recorded placement, clamped to orb's
allowed positions, falling back to the house register.

### 5.6 `chat_metadata.variables` is dropped although orb has the column

494 chats carry ST's `{{getvar}}`/`{{setvar}}` store. `chats.variableValues` exists and
`BulkImportChatInput.variableValues` is already on the canonical input — the ST arm just never fills it.
Cheap, high-value follow-up. Needs a shape check (ST's values are not all strings).

### 5.7 The rest of `chat_metadata` is dropped

`pinnedPersona` (71 — orb has `chats.anchorPersonaId` and could resolve it by name),
`scenario`/`mes_example`/`system_prompt` per-chat overrides (5), `script_injects` (581), `timedWorldInfo`,
`lastInContextMessageId`, `chat_id_hash`, `tainted`, `integrity`. All survive in `ParsedChat.sourceMetadata`
at hop 2 and are discarded at hop 3; `chats` has no lossless sidecar column for them. Note `sourceMetadata`
is *parsed and then thrown away* — that is the cheapest thing to change if a sidecar is ever wanted.

### 5.8 Character authorship dates do not exist in this corpus

Not an orb defect, but it answers "character create dates come out wrong": there is nothing to import. All
307 parseable cards omit `data.creation_date`, so `characters.createdAt` (the import clock) is the only date
a character row has. If the library should sort by "when I got this card", the file **mtime** is the only
available signal and the collector does not read it.

---

## FIX-STATUS

**Fixed in this lane** (one commit, red-first, with the pre-fix failures captured against `HEAD` source):

| # | Defect | Files |
| - | - | - |
| A | ST wall-clock dates read as UTC → 6–7 h shift on 49.6 % of messages + ~all chats | `packages/kit/src/time/index.ts` · `packages/server/src/kit/serde/chat/index.ts` · `domain/import/{contract/service,loader/collect,verbs/import-chat-file}.ts` · `entry/import/run-profile-dir-import.ts` · `entry/compose/portability.ts` · `domain/export/verbs/export-chat.ts` |
| B | 76 filenames' date rejected → 3 chats stamped at the import clock, in the future | `packages/server/src/kit/serde/chat/index.ts` |
| C | user/system `token_count` booked as `tokens_out` (1,267,076 tokens) | `packages/server/src/kit/serde/chat/index.ts` · `domain/import/substrate/chat-input.ts` · `packages/contracts/src/chat/bulk-import.ts` (doc) · `domain/export/verbs/export-chat.ts` |

**No schema change was needed** — `message_variants.tokens_in` already existed. Nothing here invented a
column for data orb has no concept for.

**Next lane's spec, in priority order:**

1. **§5.1 variant-metadata normalization** — decide ONE shape for `message_variants.metadata` on the import
   path and repoint `rebuild-from-canon.ts`'s two `json_extract` reads. Recovers reasoning-time for 12,718
   rows. Cross-domain (chat + stats), so it needs a ruling, not just an edit.
2. **§5.6 `chat_metadata.variables` → `chats.variableValues`** — smallest fix, 494 chats, column and
   contract field already exist.
3. **§5.5 author's-note placement** — honor `note_depth`/`note_position`/`note_role`. Overturns a recorded
   ruling about the house register, so it is an owner call; see §5.5 for both texts.
4. ~~**§5.2 + group chats**~~ — **STRUCK: shipped by lane #25 (`33ffe9fc3`) during this lane.** Group
   collection and per-slot `characterId`/`roster` attribution both exist; see §5.2 for the receipts. Do not
   dispatch this.
5. **§5.3 message attachments** — walk the ST profile's image tree and CAS the 167 referenced files.
6. **A stated import zone.** `hostTimeZone()` is exact for a same-box import and a good guess otherwise.
   When cross-box import becomes a real case, the setting lands on `ImportProfileDeps.stWallClockZone`,
   which is already injected end-to-end — no further plumbing.
7. **§5.8** — decide whether "character acquired at" should read the card file's mtime.

## Verification

- Red-first: the 6 new specs were run against `git show HEAD:` copies of the four touched source files —
  **6 failed / 31 passed**, each failure the defect itself (`tokensOut: 409` where `tokensIn: 409` was
  expected; `1764503240000` vs `1764528440000` = exactly 7 h; `createDate` null for the spaced filename).
  Sources restored, `git status` clean.
- Green: `tests/server/kit/serde/chat` · `tests/server/domain/import` · `tests/server/entry/import` →
  **141 passed**. Coupled sweep: `tests/kit/time` · `tests/server/domain/export` ·
  `chat/persistence/import-write.int` · the **export→import bundle round trip** ·
  `entry/boot/seed-demo-chats.int` · `tests/server/domain/stats` → **162 passed**.
- Corpus re-drive after the fix: 0 future-dated chats (was 3), 12,305 message instants corrected,
  1,096/1,097 chat creation dates corrected.
