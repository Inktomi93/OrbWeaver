---
kind: review
status: active
updated: 2026-09-05
---

# External-review claim adjudication — fourteen claims, three in the reviewer's own highest-risk tier (#1514)

An external review's synthesis was largely accurate, but independent verification changed three entries
in the synthesis's own highest-risk tier plus roughly a dozen more across the body. This record exists so
nobody working from the external review's claim list re-chases a claim already adjudicated here. No claim
below was re-verified by this lane — it is the adjudication's own prior work, transcribed with its
receipts.

## Changed in the synthesis's own highest-risk tier

### 1. "Chat lag never heals canonical reads" (client-002) — REFUTED

`useChatBus` genuinely passes no `onSocketLive`, but chat healing rides the **replay**, not invalidation.
Every gap-causing path (shed, reconnect, reaped cell) restarts the room's server-side pump, which
re-emits `chatOpened` — invalidating `chat.getChat` — and redelivers durable events from the client's own
high-water `sinceSeq` thunk. The listed symptoms (missed edits, hides, deletes, turn state) are exactly
what the seq-guarded replay refills. Verified by tracing the redelivery path, not by trusting the comment.

Receipts: `client/src/data/bus/use-chat-bus.ts:44-56,116-123`; `use-orb-socket.ts:59-65`

### 2. "RPG portability can preserve source-chat references without remapping" (server-023) — REFUTED for every live path

The serialized bundle format is POSITION-based (`messageIndex`/`variantIdx`, built by `toPortableRpg`),
documented in the export header as "POSITIONS, NOT IDS … neither id survives a cross-box move". At
import, `remapRpg` resolves every position against this box's freshly-minted ids before calling
`importRpgGame`, and prunes rows whose position does not resolve; character sheets go through
`characterHandle`, a seat-map handle. The low-level `createImportRpgGame` does write ids verbatim — but
nothing ever feeds it raw exported ids.

Receipts: `domain/export/verbs/export-chat-bundle.ts`; `domain/import/verbs/import-chat-bundle.ts:181-246,268-269`

### 3. "Poison and unknown-kind in-flight rows can remain unreaped" (server-027) — NARROWED

`toView` returns `null` only for an unknown kind. For a **known** kind with unparseable params it returns
a real object with `poison: true`, so poison rows do survive the stale sweep. Only unknown-kind rows are
dropped. Boot reclaim is unaffected: `findInFlightForBootReclaim` reads raw columns with no `toView`.

Receipts: `domain/workloads/persistence/queries.ts:137-159,473-482,445-450`

## Refuted elsewhere in the review

- **Notification unread badges ignore a server total** — there is no `unreadCount` field in the server
  contract or verb. The value cited exists only in a CT test's ad-hoc mock. There is no aggregate to use.
- **Re-adding an uncharactered gallery asset is not idempotent** — already fixed, by our own #1375 from
  the db round. A partial unique index plus an `onConflictDoUpdate` arm handles it, with a passing
  regression test. The mirror snapshot predates the fix.
- **Notification sequence allocation races** — `seq` is computed by a correlated scalar subquery inside a
  single INSERT, and SQLite is single-writer. The window does not exist.
- **Scrape failures leak raw fetch causes** — the cause is attached server-side but nothing copies it to
  the wire; the tRPC error formatter forwards only `shape.data`.
- **Responses usage mapping dereferences optional detail objects** — those fields are **required** on the
  SDK's `Usage` type, and the optional chain short-circuits when usage is absent.
- **OpenRouter catalog cancellation is dropped** — the local interface is under-specified but the runtime
  object is the real SDK client, whose `list(request?, options?)` forwards the signal. Tighten the type;
  not a defect.
- **Rendered-text contrast includes script/style text** — UA stylesheets render those `display:none`, and
  the existing `isIntentionallyHidden` check already excludes them; `<template>` content never enters the
  walked tree at all.
- **Spoiler toggle announces the wrong state** — static `aria-label` plus `aria-pressed` is the correct
  ARIA toggle pattern. The suggested fix would reintroduce the anti-pattern the file header records as
  already fixed.
- **Two "setState during render" hazards** (`config-content-surface.tsx`, `use-inventory-diff.ts`) — both
  are React's documented adjust-state-on-prop-change pattern, guarded and idempotent, and both files say
  so.
- **A roster character named Player suppresses the human write target** — only the semantic `player`
  alias is withheld; the human's persona display name is still added by the normal roster loop and stays
  a valid target.
- **Late pump failure detaches the replacement connection** — the pump catch checks
  `control.signal.aborted` first, and `goLive` synchronously aborts the outgoing generator's pumps via
  `onEvicted → teardown`. Proven statically; concurrency tests not run.

## Narrowed rather than refuted

- **Preset import race** — real, but the stated mechanism is wrong. There is no unique index on
  `(ownerId, name)` for `presets` (only `roster_presets` has one), so concurrent same-name imports do not
  collide loudly; they silently create duplicate rows. Quieter failure, worse outcome.
- **Persona seed latch concurrency** — the ordering defect stands, but the pointer patch is computed from
  the freshest possible read immediately before the second write, not a stale pre-latch snapshot. The
  window is far narrower than described.
- **Boot marks itself booted early** — real in the function, but `boot()` has one call site, runs once,
  and exits the process on failure. No concurrent caller and no in-process retry exists to suffer it.

## The systematic bias, for calibration

The reviewer's false-positive mode is consistent and predictable: it reads a **stripped** mirror, so it
cannot see a mechanism documented in a comment, and it reads **one chunk at a time**, so it cannot see a
guard living one file away. That produces two error classes — a defect asserted where the mechanism
exists elsewhere (chat replay, RPG remap, the abort ordering), and a defect **under**-rated because its
reachability lives in another chunk (the rerank model name being an admin-settable DB field, not
env-only).

Its true-positive rate on structural claims within a single file is high. Treat cross-file reachability
claims in either direction as unverified until traced.

## Note on the synthesis pointer

No `REPO_SYNTHESIS.md` and no existing `docs/reviews/**adjudic**` sibling were found on this tree
(searched both by name and content at landing time); the brief that requested this record asked for a
pointer paragraph at the synthesis document's consumers "if such a pointer convention exists" — none does,
so none is added here. A future lane that locates or reintroduces the synthesis document should link back
to this record instead of re-deriving the fourteen claims.
