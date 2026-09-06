---
kind: review
status: active
updated: 2026-09-06
---

# External-review claim adjudication — seven claims (#1481)

A second external review's synthesis, blind cold-read of a comment-stripped mirror, one chunk at a time.
Seven of its claims changed under independent verification (refuted or already fixed). Recorded so a
later reader of that review does not re-chase a claim already adjudicated here — sibling record to
[`2026-09-05-external-review-claim-adjudication.md`](2026-09-05-external-review-claim-adjudication.md)
(#1514), same shape. Every receipt below was re-derived on the tree on 2026-09-06; none moved outcome,
though several line ranges shifted from the original filing.

### 1. "Late pump failure detaches the replacement connection" (rated HIGH) — REFUTED

The pump's catch checks `control.signal.aborted` first, and `goLive` synchronously invokes the outgoing
listener's `onEvicted` → `teardown()`, which aborts every pump the old generator owns.
`AbortController.abort()` sets `.aborted` synchronously, so a stale pump's late failure returns before
reaching `detach`. Proven statically; concurrency tests were not run.

Receipts (re-derived 2026-09-06, lines moved from the filed 297-322/108-117,209-220):
`transport/trpc/stream/socket-registry.ts:311-317` (`goLive` → `onEvicted`); `socket.ts:103-115`
(`pumpRoom`'s catch, abort-checked before failure handling), `socket.ts:209-215` (`teardown`).

### 2. "RPG portability exports ids and imports them without remapping" (rated HIGH) — REFUTED

The serialized bundle format is POSITION-based (`messageIndex`/`variantIdx`, built by `toPortableRpg`),
documented in the export header as "POSITIONS, NOT IDS … neither id survives a cross-box move". At
import, `remapRpg` resolves every position against this box's freshly-minted ids before calling
`importRpgGame`, and prunes rows whose position does not resolve. Character sheets go through
`characterHandle`, a seat-map handle. The low-level `createImportRpgGame` does write ids verbatim — but
nothing ever feeds it raw exported ids.

Receipts (re-derived 2026-09-06, unchanged in substance): `domain/export/verbs/export-chat-bundle.ts:15-16`
(the POSITIONS-NOT-IDS header); `domain/import/verbs/import-chat-bundle.ts:186-210` (`remapRpg`),
`:281` (the only call site feeding `importRpgGame`).

### 3. "Re-adding an uncharactered gallery asset is not idempotent" — ALREADY FIXED

Fixed by #1375 from the db review. A partial unique index (`gallery_items_asset_unsubjected_unique WHERE
subjectCharacterId IS NULL`) plus an `onConflictDoUpdate` arm now handles it, with a passing regression
test. The mirror snapshot predates the fix.

Receipts (re-derived 2026-09-06, lines moved from the filed 217-258):
`domain/assets/persistence/queries.ts:218-236`; `tests/server/domain/assets/verbs/add-to-gallery.int.test.ts`
(present on tree).

### 4. "Scrape failures leak raw fetch causes on a public error" — REFUTED

The `.cause` is attached server-side, but nothing copies it to a client-visible surface: `classifyDomainError`
(`transport/trpc/error-mapping.ts:25`) and the tRPC `errorFormatter` forward only `shape.data`, stripping
`stack` and adding a `reason` code. No `cause` references exist in `foundation/observability` either
(re-derived 2026-09-06: `classifyDomainError` confirmed present and unchanged in shape at that line).

### 5. "Notification sequence allocation races" — REFUTED

`buildInsertNotification` computes `seq` with a correlated scalar subquery **inside** the INSERT
statement. SQLite is single-writer, so two inserts for one recipient cannot interleave their MAX-read
with each other's write.

Receipt (re-derived 2026-09-06, unchanged): `domain/notifications/persistence/queries.ts:46-58`
(`buildInsertNotification`, the subquery at line 55).

### 6. "Responses usage mapping dereferences optional detail objects" — REFUTED

`inputTokensDetails`/`outputTokensDetails` are **required** on the SDK's `Usage` type, and the optional
chain on `u` short-circuits the whole expression when usage is absent.

Receipt (re-derived 2026-09-06): `infra/providers/backends/openrouter/runners/chat/responses.ts:326,330`
(`u?.inputTokensDetails.cachedTokens ?? 0` / `u?.outputTokensDetails.reasoningTokens ?? null` — no bare
dereference past the optional chain).

### 7. "OpenRouter catalog cancellation is dropped" — REFUTED at runtime

The local `OrClient` interface types `models.list` with no options, but the object bound to it is always
the real SDK client, whose `list(request?, options?)` does forward `signal`. The TS interface is
under-specified; cancellation works. Worth tightening the type, not a defect.

Receipt (re-derived 2026-09-06): `infra/providers/backends/openrouter/client.ts:30` (`OrClient` interface
declaration) — the wrapping seam this claim concerns.

## Narrowed rather than refuted

- **Persona-seed pointer patch** — computed from the freshest possible read immediately before the second
  write, not a stale pre-latch snapshot. The ordering defect stands; the concurrency half is much
  narrower.
- **Boot `booted` flag** — the defect is real but has no reachable consequence (single call site, runs
  once, exits the process on failure).

Source: blind cold read of the comment-stripped mirror. Every item above was verified on-tree by a scoped
full-file read at filing time, and re-derived again on 2026-09-06 for this record.
