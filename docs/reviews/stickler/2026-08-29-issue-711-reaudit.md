---
kind: review
status: active
updated: 2026-08-29
---

# Re-audit: #711 recon-remediation backlog + #765 marker debt — against main `035c3ecae`

Charge: settle every row of the #711 body (51 bullets across batches A–D; the title's "\~30" undercounts
and the "E: …" in the title has no matching section in the body) against current main, and rule on
whether the #751 caught-failure-ownership landing resolves #765. READ-ONLY; no source touched. Every
verdict below was re-derived from the tree THIS session (file read + mechanism check), with the fixing
commit cited where found; issue-comment claims were treated as claims, and three of them were refuted.

**Headline: 45 of 51 rows FIXED-ON-MAIN, 2 SUPERSEDED/N-A (refuted by reachability/inertness), 6
STILL-OPEN (4 narrow residuals + 2 whole rows). #765 is RESOLVED by the #751 landing. `pnpm check` run
by this audit: PASS, exit 0, 16/16 static stages green (full tail read).**

## Verdict table — Batch A (server data-integrity & TOCTOU)

| Row | Verdict | Receipt |
| - | - | - |
| A1 memory pre-join leak (recall.ts filterPool fail-open) | **FIXED-ON-MAIN** | `8c40ef6c8` — `recall.ts:249-250`: missing span + horizon present → `drop(d, "unwitnessed")` (fail-closed); horizon-free legacy stays recoverable; 75-line int pins in `recall.int.test.ts` |
| A2 embeddings non-atomic digest/speaker | **FIXED-ON-MAIN** | `fae02b26b` — `embeddings/persistence/queries.ts:305-361`: digest upsert + speaker-projection delete + inserts in ONE `db.batch`; `store.ts:151-167` passes `speakerCharacterIds` into the one call |
| A3 stats rebuild races delta | **FIXED-ON-MAIN** | `92639f677`+`401541d6b`+`fae02b26b` — `rebuild-from-canon.ts:306-316`: before/after `ownerCanonSnapshot` compare-and-retry around `computeOwner`; `apply-delta.ts:41-45` bumps `stats_canon_versions` in the same batch as every live delta; `writeOwner` is one atomic batch (`:834-852`) |
| A4 db backup omits WAL | **FIXED-ON-MAIN** | `8e952f5de` — `db/client/index.ts:178`: `VACUUM INTO` (consistent snapshot incl. WAL-resident commits) replaced `copyFileSync` |
| A5 delta seq ordering (straggler delta after terminal) | **FIXED-ON-MAIN** | `10875820f`/`4b727cf44` — `engine.ts:1408,1480-1482,1498`: ordered `deltaTail` chain, `await deltaTail` before commit/terminal; failure arm drains too (`:1651`); pins `24c55baa9` ("terminal success cannot overtake a held delta emit", "a rejected delta drain rejects the turn"). The second `onDelta` at `:1798` is `generateText` (non-persisting, bus-silent) — no seq surface |
| A6 persona zero-delete | **FIXED-ON-MAIN** | `b229ce09d` — `persona/verbs/remove.ts:24-38`: `EXISTS(other owned persona)` folded INTO the DELETE's WHERE — count check and delete are one statement; loser gets typed `LastPersonaError` |
| A7 preset COW fork race | **FIXED-ON-MAIN** | `b229ce09d` — `preset/persistence/queries.ts:50-78`: `INSERT..SELECT..WHERE NOT EXISTS` atomic admission; racing loser re-finds and patches the winner (`update.ts:143-158`); `{mode:"new"}` siblings stay deliberately legal |
| A8 refinery schema-name uniqueness | **FIXED-ON-MAIN** | `b229ce09d` — `refinery/persistence/queries.ts:307-335` (+ guarded UPDATE `:338+`): decision and insert are one SQLite statement over `lower(name)`. Mechanism differs from the row's asked-for unique index (verb-scoped atomic admission instead) but closes the race |
| A9 world-info multiple primary books (import path) | **SUPERSEDED/N-A** | Refuted by reachability: the only live caller of `bulkImportLorebook` is `import-character.ts:160-168`, which ALWAYS mints a fresh `characterId` in the same request ("a byte-new card is always a NEW character"; byte-identical re-import short-circuits at `findByImportHash` and never calls it) — no concurrent second writer on one characterId can exist. `attachOwnedBooksByName` likewise runs only against import-minted characters. The at-most-one-primary demote belt exists where the seat IS user-contested (`verbs/attachments/attach-to-character.ts`); no transport route reaches the import writes with an arbitrary characterId (router grep: 0 hits for importStandalone/bulkImport/attachBooks in `transport/`). Matches #711 comment-1's refutation. Latent seam noted below |
| A10 subject-linking TOCTOU | **FIXED-ON-MAIN** | `b1d179a52` — `sessions/verbs/link-external-id.ts`: `claimExternalIdIfUnbound` conditional claim; `users_external_id_unique` is the arbiter; `settleMissedClaim` converges the loser to typed `subject-taken`/`already-linked`/`target-bound` and RETHROWS an unexplained db error — no raw unique-error leak |
| A11 tag prune race | **FIXED-ON-MAIN** | `b229ce09d` — `tag/persistence/queries.ts:347-368`: the DELETE re-checks all FIVE junctions with `NOT EXISTS` inside the statement; attach-after-snapshot wins |

## Verdict table — Batch B (plugin host-DoS)

| Row | Verdict | Receipt |
| - | - | - |
| B1 no resident admission budget | **FIXED-ON-MAIN** | `00fa5203a` — `plugin-host/port.ts:141-158,222-230`: process-wide `PLUGIN_RESIDENT_RUNTIME_MAX`, reservation taken BEFORE the first await (no observe-spare-capacity race), typed refusal past the cap; release exactly-once |
| B2 timeout/dispose doesn't cancel host ops | **FIXED-ON-MAIN** | `00fa5203a` + `dc87ddf20` (+ `32c17a7b7` #782 settle-failure surfacing) — `membrane.ts:1686-1709`: per-call `AbortController`, aborted on deadline, `impl(args, controller.signal)`; non-cancellable writes stay OWNED (slot held) and teardown JOINS `settleHostOperations()` before releasing admission (`port.ts:163-174`) — the row's "commit fence" alternative |

## Verdict table — Batch C (server correctness/robustness)

| Row | Verdict | Receipt |
| - | - | - |
| C1 workloads starvation (QUEUE\_HEAD\_WINDOW=10) | **FIXED-ON-MAIN** | `ec1e3b30f` — `workloads/persistence/queries.ts:398-432`: fixed window gone; `scanRunnablePage` cursor-pages the lane's COMPLETE due queue past waiting/poison heads |
| C2 shutdown no-join | **FIXED-ON-MAIN** | `ec1e3b30f` — `entry/lifecycle.ts:105-108,629,645`: `drainWorkloadsWorker` (abort + `await worker.settled`) runs before `preCloseHousekeeping(db)` |
| C3 terminal events not emitted | **FIXED-ON-MAIN** | `ec1e3b30f` — queued-poison and dep-failed route `onFailure` → `emitWorkloadEvent({type:"failed"})` (`engine/next-runnable.ts:19-27`); queued-cancel emits `cancelled` (`verbs/cancel.ts:23`) |
| C4 null-owner uniqueness | **FIXED-ON-MAIN** | `3eec8ed59` — `db/schema/workloads.ts`: THREE disjoint partial unique indexes partitioned by mode + immutable `admission_system` arm (NULL-distinctness solved by the owner-free system key; FK SET NULL cannot migrate a row between partitions). Baseline hygiene clean: single `0000_baseline.sql`, carries `workloads_mode_active_singular_system`, journal has one entry |
| C5 refinery score-sweep unbounded | **FIXED-ON-MAIN** | `6af7ec514` — `score-sweep.ts:197-216`: submission chunked by `SWEEP_SUBMISSION_SIZE` with per-chunk containment + bounded per-card retry |
| C6 tag reorder validation | **FIXED-ON-MAIN** | `6af7ec514`/`5d551d869` — `tag/verbs/set-order.ts`: foreign → `TagNotFoundError` (leak-free collapse), dupes/subsets → `tag_order_not_permutation`; complete owned permutation required |
| C7 world-info duplicate titles | **FIXED-ON-MAIN** | `6af7ec514` — `assertUniqueEntryTitles` throws typed on BOTH import paths (`import-write.ts:156,277`) |
| C8 stats percentile off-by-one | **FIXED-ON-MAIN** | `6af7ec514` — `percentiles.ts:22`: nearest-rank `ceil(p·n)−1`, clamped; n=10 p90 → index 8 (the 9th element) |
| C9 stats latency rescan | **FIXED-ON-MAIN** | `6af7ec514` + #737 follow-ups — `latency.ts:16,56-64,93-102`: `LIMIT 100` with `ORDER BY rowid DESC`; model/provider qualification INSIDE the WHERE before the limit (the cold-verify-refuted LIMIT-before-filter residual was repaired) |
| C10 maxTier searchable | **FIXED-ON-MAIN** | `6af7ec514` — `recall.ts:74`: `digest.tier <= cfg.maxTier` filter on the raw pool BEFORE any mode/bridge dispatch, so bridge/scan never see higher-tier rows |
| C11 assets GC race | **FIXED-ON-MAIN** | `934fae273` → `b040c8d8b` — `deleteAssetRowIfUnreferenced` puts the FULL liveness predicate (FK refs + settings/card/chat JSON refs) in the SAME SQL statement as the delete (`asset-refs.ts:219+`); `purgeAsset` only touches bytes after the delete WINS. #737's three cold-verification rounds (JSON-writer resurrection family: whole-metadata writers now re-arbitrate carried background) ended CONFIRMED at `b040c8d8b` with 6 deterministic race schedules refused |
| C12 GIF/APNG mislabel on the variant path | **STILL-OPEN** | `entry/http/blob.ts:162`: `serveVariant` → `serveBytes(variant, WEBP_MIME)` UNCONDITIONALLY — when `resolveVariant` takes the animated passthrough (`resolve-variant.ts:37/62/94` returns the ORIGINAL gif/apng bytes), the response still says `Content-Type: image/webp` (+ nosniff). The int pin (`resolve-variant.int.test.ts:396-404`) covers the BYTES passthrough only; no pin asserts the served mime; the row's "gif → image/gif" PIN does not exist. Mitigations: the ORIGINAL path serves `meta.mime` correctly, and the client skips `?w=` for `animated` rows — but the mechanism the row named is unfixed and reachable by direct URL. #711 comment-1's "GIF/APNG source MIME … current-tree fixed" is REFUTED for this path. Severity: P3 (broken/odd rendering in strict contexts, wrong download type; no security consequence — passive media either way) |
| C13 databank cancel ignored | **FIXED-ON-MAIN** | `da05be376` — `databank/ingest/index.ts:102`: per-chunk `isAborted(signal)` before each embed; plus pre-prune and per-phase checks |
| C14 ZIP entry mismatch | **FIXED-ON-MAIN** | `da05be376` — `zip.ts:550-552`: `packZip` caps at `DEFAULT_MAX_ENTRIES` (50,000 — matches the reader) with typed `too-many-entries`; `writeU16` (`:440-443`) REFUSES any >0xFFFF value instead of wrapping, so the EOCD count can no longer alias; ZIP64-territory sizes/offsets throw typed `unsupported` |
| C15 direct-profile limits | **FIXED-ON-MAIN** | `da05be376` — `run-profile-dir-import.ts:150-186`: `withProfileReadLimits` wraps the fs port with per-file (stat-before-alloc + post-read growth-race check) AND run-wide aggregate byte caps on EVERY read (non-chat included); `collect.ts:122-124` sorts BEFORE truncating (`MAX_DIR_ENTRIES`) → deterministic first-N |
| C16 connection overflow not preflighted | **STILL-OPEN** | The asked-for typed refusal ("over-window minimal → typed refusal") does not exist anywhere in `domain/chat` (sweep: no ContextOverflow/preflight error class; `history-budget.ts:92-94` still SENDS the irreducible tail past the budget, and `tests/.../history-budget.test.ts:32` PINS "always keeps the newest turn even when it alone blows the budget" as deliberate). The row fell through the reconciliation: it appears in NO child issue's finding list (#737's body enumerates 7 findings — this is not one; `6af7ec514` touches neither `history-budget.ts` nor `pipeline.ts`), and comment-1 lists it neither as closed nor boarded. Pre-turn managed compaction (`runPreTurnCompaction`, landed `7ff2e4107` 2026-07-24 — BEFORE the recon confirmed this row) reduces incidence but cannot shrink a single over-window message. Needs a decision: fix (typed preflight refusal) or formally refute (accept send-and-let-the-provider-error, which the pin already treats as intended) |
| C17 vLLM capability wrong window | **SUPERSEDED/N-A** | Defect is INERT: `capabilityCaches` (`resolve-role.ts:334-344`) does still hand the GEN window to `resolveCapability` for every role, BUT (a) the per-engine window cache now exists and the resolve WARMS the role's own engine (`ROLE_ENGINE`/`warmVllmGenWindow` `:217-247`, `vllm-gen-window-cache.ts` keyed by engine), and (b) a repo-wide sweep found ZERO consumers of an embed/rerank capability window — the only `capability.context.window` reader among role clients is `summarize` (`compose/role-clients.ts:229`), which correctly rides the gen engine; embed/rerank clients never read it. Wrong value in an unread field. Revives only if a consumer appears — noted as a latent seam below |
| C18 custom-OpenAI decrypt→keyless | **FIXED-ON-MAIN** | `dc0cdb45e` — `credentials/substrate/decrypt.ts`: decrypt failure throws typed, secret-free `CredentialsDecryptError` (raw crypto error discarded); `resolve.ts:43-48`: only a SUCCESSFULLY-decrypted empty plaintext is the no-auth arm |
| C19 backchannel body cap | **FIXED-ON-MAIN** | `auth-routes.ts:718`: `bodyLimit({maxSize: OIDC_BACKCHANNEL_BODY_MAX_BYTES})` on the backchannel-logout route (constant introduced with the #712 gate family, `b4abe5069`) |

## Verdict table — Batch D (client robustness)

| Row | Verdict | Receipt | | |
| - | - | - | - | - |
| D1 optimistic-restore clobber | **FIXED-ON-MAIN** | `a781a77cc` — `create-entity-mutation.ts:124-150,173-201`: per-query mutation TOKEN ownership (claim/owns/release); an older failure's rollback that no longer owns the key is a no-op; cold-cache rollback removes the phantom entry | | |
| D2 agent-seed partial (dev-only) | **FIXED-ON-MAIN** | `2d16ef60c` + `29422a765` — `agent-seed/index.ts:345-433`: `GameSeedFlights.run` single-flights concurrent first-time calls (the #752 double-mint), `PendingGameSeed` resumes a partial attempt from its failed step with match-assertion | | |
| D3 card-frame unbounded cache | **STILL-OPEN** | `data/use-card-frame.ts:34`: the `minted` Map (keyed on the full serialized mint body — html+css+themeTokens) has NO eviction, cap, or LRU; it grows monotonically per distinct body for the tab's lifetime. Only the RESOLVED-handle staleness was fixed (`resolved.body === body` gate — a handle never outlives its bytes). Comment-1's "card-frame epoch … fixed" describes the epoch half only. Severity: P3/P4 per-tab memory growth in long sessions with many cards/theme flips | | |
| D4 endpoint redaction | **FIXED-ON-MAIN** | #718 (`c0f9b2edf` collision-safe redaction) — enforcement landed at the PRODUCER chokepoint, not the zod schema (a schema cannot know which values are secret): `custom-byo/inspect.ts:103` `redactHeaders(headers, secrets)`; `openai-compat/body.ts:159-203` masks by header-name signal, scrubs known secret LITERALS from response bodies + `Bearer …`/`sk-…` shapes, collision-driven over-redaction preferred; `error-classify.ts:187-207` scrubs error surfaces | | |
| D5 model-catalog empty-on-loading | **STILL-OPEN (residual)** | Custom arm IS fixed: `model-picker.tsx:138-145` renders `CommandLoading` skeletons while `customModelsPending`. But the CATALOG arm (openrouter/max-pro-sub) is not: `role-slot-row.tsx:290,326` threads `isLoading` into the picker, and the picker declares it (`:55`) but NEVER CONSUMES it — exactly 1 reference in the file (the declaration). While `useRoleSourceModels` is loading, `result` is undefined → pool `[]` → the list renders `CommandEmpty` "No models match." with no loading indication. The dead prop is the smoking gun of a half-landed fix | | |
| D6 credential-health retry lost | **FIXED-ON-MAIN** | `credential-key-row.tsx:41,64-65,96,166`: failure → `{kind:"error"}` → alert-toned "Test failed — try again" + button label flips to "Retry" | | |
| D7 notification dup-submit | **FIXED-ON-MAIN** | `e510bb098`/`fbbf542a6` — `notification-bell.tsx:190,198-211,264`: synchronous `actionOwned` ref admission + `disabled={isPending}` on the action buttons | | |
| D8 databank toggle conflict | **FIXED-ON-MAIN** | `databank-context-body.tsx:168,182`: `disabled={attach.isPending \|\| detach.isPending}` on the Everywhere switch + live status copy | | |
| D9 pasted-doc unhandled rejection | **FIXED-ON-MAIN** | `add-document-body.tsx:215-233`: `.mutate` with `onSuccess` (never an un-awaited `mutateAsync`); `canCreate` gates empty + pending; factory `errorToast` owns the failure | | |
| D10 admin owner-policy + per-target locks | **FIXED-ON-MAIN** | `2f52f24a2` — `admin-users-section.tsx:59-92`: per-target `Set<UserId>` pending admission (role + enabled independently); `admin-user-row.tsx:54-71`: role select owner-only (`viewerIsOwner`), owner row uncontrollable, self-disable blocked, disable confirm-gated | | |
| D11 character bulk clear-before-success | **FIXED-ON-MAIN** | `4846e4575` — `character-bulk-bar.tsx:39-51,58-74`: selection clears via `.then(() => onRemoveSubmitted(...))` AFTER success only; failure keeps the selection; all three actions `disabled={isPending}` | | |
| D12 portrait preview advance | **FIXED-ON-MAIN** | `avatar-upload-field.tsx:45-73`: `uploadEpoch` ref guards EVERY state advance (preview/success/error/loading) — only the latest upload's outcome lands; failure surfaces inline | | |
| D13 leaderboard error masked | **STILL-OPEN (residual)** | The fix landed (`QueryErrorState` + retry, `analytics-list-surface.tsx:135-137`) but the branch ORDER shadows it: `:132` returns the skeleton on `isPending \|\| page === undefined`, and on a FIRST-LOAD error (react-query: status "error", `isPending` false, data undefined — no previous page for `keepPreviousData` to keep) `page === undefined` wins → PERMANENT SKELETON; the error arm is reachable only for a refetch-error-after-success. The original defect (error masked) survives in the first-load case, now as an infinite skeleton. No CT pins the error arm (`analytics-list-surface.ct.tsx`: zero error/retry assertions). Fix is a one-line branch reorder + a CT | | |
| D14 tag drag partial order | **FIXED-ON-MAIN** | Server half (C6) rejects any non-complete-permutation submit, so a filtered-subset drag can no longer corrupt the order; the client failure is LOUD (`errorToast: "Couldn't reorder the tags."`, `use-tag-settings-mutations.ts:48`). Minor UX residual noted below (drag not disabled while a filter is active — it can only fail) | | |
| D15 duration rollover | **STILL-OPEN** | `analytics-view-model.ts:72-87` still rounds the remainder independently of the floor: REPRODUCED this session against the exact current source — `formatDurationMs(119700)` → **"1m 60s"**, `formatDurationMs(7170000)` → **"1h 60m"**, and the seconds arm has the same class: `formatDurationMs(59999)` → **"60.0s"**. The unit tests (`analytics-view-model.test.ts:35-54`) avoid every boundary value. Comment-1's "duration rollover … fixed" is REFUTED. Severity: P3 cosmetic-wrong figures on the analytics surface | | |
| D16 workload progress stale | **FIXED-ON-MAIN** | `workload-row.tsx:142-159`: live tail wins while connected; with no subscription the DURABLE `progress` column carries the position; neither → indeterminate. Row-local buffer, per-row subscription, state-change invalidation (`use-workload-stream.ts` header contract) | | |
| D17 bundle-import overwrite | **FIXED-ON-MAIN** | `944d1d10d` — `use-library-import.ts`: full `requestEpoch` discipline — every finish/fail/progress/state advance is epoch-guarded; `reset` bumps the epoch so no late completion can overwrite a newer run | | |
| D18 world-info N+1 picker | **FIXED-ON-MAIN** | `attachment-rows.tsx` header + body: the book-centric read is ONE `listAttachmentsForBook(bookId)` reverse index owned by the parent; rows are pure prop consumers (zero per-row queries in the file) | | |
| D19 attach-controls actionable-on-error | **FIXED-ON-MAIN** | `fbbf542a6` — `attachment-rows.tsx:45,53,99,106`: `attachmentKnown = !(queryPending \|\| queryError)` — controls render null while the attachment state is unknown/errored; disabled while a mutation is pending | | |

## #765 verdict — RESOLVED by the #751 landing

The issue's option 1 ("Land the gate under #751 → all markers become meaningful at once") is what
happened, plus the scanRoot widening its body warned must not precede the landing:

- **The gate is landed, registered, and ACTIVE.** `tooling/src/verify/gates/caught-failure-ownership.ts`
  exports a `GateDescriptor` with `status: "active"` (`:1454-1457`), scanning `packages/*/src` +
  `tooling/src`, `.ts` AND `.tsx`. It is documented in `Core-Enforcement-Active-Gates.md:172`, carries a
  planted live-tree bite-proof in `tests/tooling/check-gates.int.test.ts:683-684`, and has its own
  conformance suite (`tests/tooling/verify/gates/caught-failure-ownership.int.test.ts`).
- **Marker census on `035c3ecae`: 410 markers across 256 files** (packages/server 100 files ·
  packages/client 76 · tooling/src 64 · kit 9 · ui 5 · contracts 2) — method:
  `git ls-files '*.ts' '*.tsx' | xargs grep -c '@orb-gate-ignore caught-failure-ownership'`. The
  count-correction comment's "44, 100% tooling" is superseded: the #751 program merged and the markers
  now span the whole governed corpus. Every one names a REGISTERED gate, so the body's "unregistered
  gate" grammar violation no longer exists.
- **The scanRoot hiding-place is closed.** `gate-ignore-inventory.ts:109` (verified in CODE, not just
  the header): `p.startsWith("packages/") || p.startsWith("tests/") || p.startsWith("tooling/src/")` —
  widened 2026-08-27 (#751) from `tooling/src/verify/gates/` to ALL of `tooling/src/`, exactly because
  the 44 markers this issue tracked sat there with no stale arm. All 410 markers are now audited for
  malformed / unregistered / stale / over-exempt.
- **Strict-green receipt (this session, not hearsay):** `pnpm check` on `035c3ecae` → **PASS, exit 0,
  16/16 static stages green**, including `structure:full` (204.8s — the stage that executes both
  `caught-failure-ownership` and `gate-ignore-inventory`). Full tail read; zero reds, zero warnings in
  the verdict block. (First read of `reports/verify.json` mid-run surfaced a STALE artifact from a
  2026-08-28 23:07 run with 3 red stages — discarded after checking mtime; the receipt above is my
  run's own tail.)

**#765 can close.** Residue for the closer: #711 comment-6 noted #751's detector/marker WIP "141 sites
remain unproven" banked at `2c3d460e8` — whether #751 itself is fully drained is #751's business, not
\#765's; the specific debt #765 tracked (markers naming an unregistered gate, hidden by scanRoot) is
gone on both halves.

## What genuinely remains STILL-OPEN (for re-scope/dispatch)

1. **C12** — animated GIF/APNG served as `image/webp` on the `?w=` variant path
   (`entry/http/blob.ts:162`); pin "gif → image/gif" never written. Narrow fix: sniff-or-flag the
   animated passthrough and serve the real mime. P3.
2. **C16** — no typed preflight refusal when the irreducible minimal request alone exceeds the model
   window; the opposite behavior is test-pinned as deliberate and the row fell out of the child
   fan-out entirely (in no child issue's finding list). Needs an explicit fix-or-refute ruling, not
   silence. P3.
3. **D3** — `use-card-frame.ts:34` `minted` Map unbounded (no eviction). P3/P4.
4. **D5 residual** — catalog-arm model picker renders "No models match." while loading; `isLoading` is
   threaded (`role-slot-row.tsx:326`) but never consumed (1 reference in `model-picker.tsx`). P3.
5. **D13 residual** — leaderboard first-load error renders a permanent skeleton: `page === undefined`
   arm shadows the `isError` arm (`analytics-list-surface.tsx:132-137`); no error-arm CT. One-line
   branch reorder + CT. P3.
6. **D15** — duration rollover reproduced: "1m 60s" / "1h 60m" / "60.0s"
   (`analytics-view-model.ts:72-87`); boundary cases absent from the unit tests. P3.

## Refuted issue-thread claims (worth noting when closing)

\#711 comment-1 (2026-08-26 reconciliation) claimed three things this audit refutes on the tree:
"GIF/APNG source MIME … current-tree fixed" (C12 — variant path unfixed), "duration rollover …
fixed" (D15 — reproduced), and "model-catalog state … fixed" (D5 — half-landed, dead prop). It also
silently dropped C16 (neither closed nor boarded). Every other comment-1 claim I checked held.

## Unconfirmed / latent seams (NOT findings — no current consequence, logged for the record)

- A9 latent: `createAttachOwnedBooksByName`'s `primaryFree` read-then-insert
  (`import-write.ts:223,252-253`) would race IF a future caller ever passed a pre-existing
  characterId concurrently; today every caller runs against a same-request-minted character.
- C17 latent: the capability DESCRIPTOR still carries the gen window for embed/rerank resolves
  (`resolve-role.ts:342` → `resolve-model-capability.ts:425`); the per-engine cache
  (`getCachedVllmWindow`) has zero consumers outside the warm. Revives the day someone reads an
  embed/rerank `capability.context.window`.
- D14 UX residual: tag drag is offered while a name filter is active (`tag-collection-rows.tsx:95`
  ignores the filter in `draggable`), and such a drag can only fail (loudly). Cosmetic.
- Two concurrent imports of the SAME card bytes can still mint two characters (the `findByImportHash`
  read-then-create window, `import-character.ts:144-167`) — a duplicate-character annoyance, not the
  A9 multiple-primary defect, and dedup catches the third and later attempts. Not in #711's scope.

## Verified clean / method (what my silence covers)

- **Every one of the 51 #711 body bullets** was individually verified against `035c3cae`'s tree by
  reading the cited file's CURRENT mechanism (not the diff, not the issue thread) — files read in
  full where sized for it (recall.ts, store.ts, remove.ts, update.ts ×2 (preset/schema),
  import-write.ts, link-external-id.ts, set-order.ts, percentiles.ts, latency.ts, collect-garbage.ts,
  purge-asset.ts, resolve.ts (credentials), decrypt.ts, create-entity-mutation.ts, use-card-frame.ts,
  use-library-import.ts, attachment-rows.tsx, avatar-upload-field.tsx, character-bulk-bar.tsx,
  analytics-view-model.ts (region), vllm-gen-window-cache.ts, schema-library.ts, inspect-endpoint.ts),
  and by targeted region reads + mechanism greps on the large files (engine.ts 1926L: delta-tail +
  generateText regions; membrane.ts 1764L: attachAsync + liveness regions; rebuild-from-canon.ts,
  lifecycle.ts, zip.ts, pipeline.ts, resolve-role.ts, auth-routes.ts, workloads queries/schema,
  plugin-host port.ts). Regions NOT read: the bulk of engine.ts/membrane.ts/pipeline.ts outside the
  cited mechanisms; I did not re-review those files' other behavior.
- **Fix commits pinned with `git log -S`** on the exact mechanism token per row (receipts inline
  above). Where a -S hit attributed oddly (D6 → a smalls-batch commit; D18 → the review-mirror
  commit), the TREE mechanism is the verdict and the commit is corroboration only.
- **Sweeps:** ast-grep `-l ts` for the bulkImportLorebook caller sweep (scannedFileCount=1437, non-zero
  control); literal greps via the Grep tool / `/usr/bin/grep -a` for marker census, redaction
  consumers, per-engine window consumers (zero-consumer claim double-checked by two spellings), and
  transport-route absence for the world-info import writes.
- **D15 reproduced by direct computation** against a byte-faithful re-implementation of the current
  source (node one-liner; outputs above).
- **`pnpm check` run by this audit on `035c3ecae`: PASS exit 0, 16/16 stages** (biome, eslint, all
  five type programs, execution-membership, db-baseline, drizzle-kit, agent-config, structure:full,
  depcruise, knip, docs:format, docs:catalog). Behavioral suites (`pnpm test`/`--push`) were NOT run —
  this is a read-only re-audit; the child issues' own cold-verification records (e.g. #737's
  b040c8d8b CONFIRMED comment) cover the behavioral tier for the batch-A/C races.
- **Migration-squash blind spot checked** (C4 schema change): single `0000_baseline.sql`, journal with
  one entry, new indexes present in the baseline.
- This report file was written AFTER the `pnpm check` run completed, so the green receipt describes
  the tree without it; the doc-catalog attestation for this file rides the orchestrator's normal
  train (born-reviewed dance).

## Proposed memory lesson (orchestrator owns the write)

- Index line: `[umbrella "fixed" lists rot](umbrella-reconciliation-fixed-lists-rot.md) — diff the
  umbrella's rows against the UNION of child finding-lists before closing; comment claims ≠ tree`
- Body: A reconciliation comment on an umbrella issue (#711 comment-1, 2026-08-26) declared rows
  "current-tree fixed" that a later tree re-audit refuted (GIF/APNG variant mime, duration rollover —
  reproduced live — and model-catalog loading, half-landed with a dead prop), and one confirmed row
  (connection overflow preflight) fell out of the child fan-out entirely — present in NO child issue's
  finding list, so no lane ever owned it. **Why:** children are scoped from the reconciliation prose,
  not from the umbrella's rows, so a row the prose mislabels or omits silently exits the pipeline
  while the umbrella reads as draining. **How to apply:** before closing an umbrella, verify each body
  row against EITHER a tree receipt or an explicit child-issue finding that owns it; a comment's
  "fixed" without a file:line receipt is a lead, not a verdict.

## Issue summary (paste-ready for the orchestrator)

Re-audit of the #711 backlog against main `035c3ecae` (stickler, 2026-08-29, read-only): all 51 body
rows settled — **45 FIXED-ON-MAIN** (receipts per row: the 08-26 child-campaign commits #717-#741
family, each mechanism re-verified on today's tree), **2 SUPERSEDED/N-A** (A9 world-info primary-book
race unreachable at every live call site; C17 vLLM per-engine window inert — zero consumers), **6
STILL-OPEN**: C12 animated variant served as image/webp (`blob.ts:162`), C16 over-window preflight
refusal (fell out of the child fan-out — needs fix-or-refute), D3 unbounded card-frame mint cache,
D5 catalog-arm picker shows "No models match." while loading (dead `isLoading` prop), D13 leaderboard
first-load error renders a permanent skeleton (shadowed error branch), D15 duration rollover
(reproduced: "1m 60s"/"1h 60m"/"60.0s"). Severity ceiling of the open set: P3. Three of #711
comment-1's "fixed" claims are refuted on the tree (C12/D15/D5). **#765 is RESOLVED**: the #751 gate
is landed/registered/active, all 410 markers (256 files) name it, `gate-ignore-inventory`'s scanRoot
now covers `tooling/src` (code-verified), and this audit's own `pnpm check` on `035c3ecae` is PASS
16/16 including `structure:full` — close #765. Full report:
`docs/reviews/stickler/2026-08-29-issue-711-reaudit.md`.
