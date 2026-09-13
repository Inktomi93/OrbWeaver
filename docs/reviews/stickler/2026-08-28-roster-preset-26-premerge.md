---
kind: review
status: active
updated: 2026-08-28
---

# Stickler pre-merge review — #26 saved rosters (`domain/roster-preset`, lane roster-26)

**Subject:** the three stacked commits `936501dfb` (feat) → `8ab3d67f4` (docs-catalog receipt) →
`ad25c977f` (structure-gate fixes) in worktree `.claude/worktrees/agent-ae98e7893e22231db/`, based on
`b281929cd`. New server domain + db schema (baseline squash) + contracts module + compose seam + tRPC
router + client party-picker slice + design record `docs/history/design/saved-rosters-build-record.md`.

**Verdict: MERGE-BLOCKED on one trivial gate red (F1). The security-sensitive `requireHost`-first
delta is GENUINE, correctly homed, correctly ordered, and pinned — verified clean.** Beyond F1, the
findings are one half-attached defense-in-depth belt with an overclaiming comment (F2), two
design-record/code accuracy gaps (F3, F4), one stale-law header set (F5), and one unrecorded UX
deviation from the program doc (F6). None of F2–F6 leaks data across tenants on any live path.

---

## Findings (ranked)

### F1 — `pnpm check` is RED on the lane's tree: `lint:biome` fails on `docs/catalog/receipts/design.json` (BLOCKS MERGE; trivial fix)

- **Where:** `docs/catalog/receipts/design.json:687-689` (worktree state); introduced by `8ab3d67f4`.
- **Defect:** the receipt edit re-wrapped the PRE-EXISTING one-line `evidence` array of the
  `interaction-substrate-spec.md` entry into multi-line; biome's formatter demands the one-line form.
  Base `b281929cd` and current `main` both carry the one-line (clean) form — verified by grepping all
  three copies; the multi-line form exists only in the lane's tree.
- **Failure scenario:** merge as-is → main's commit hook / the post-train single-pass reds at
  `lint:biome` (`× docs/catalog/receipts/design.json: format`).
- **Evidence (this session):** `pnpm check` in the worktree →
  `✗ lint:biome (71585ms)`, stage log `reports/verify/lint-biome.log` names exactly this file;
  `pnpm exec biome check docs/catalog/receipts/design.json --diagnostic-level=error` prints the
  join-the-array diff. Root-cause class: a receipt (re)emission that formats JSON differently from
  biome — same family as the `doc-catalog-receipts-are-the-authored-source` lesson.
- **Fix shape (for the fixing lane, not applied here):** scoped
  `biome check --write docs/catalog/receipts/design.json`, re-commit.

### F2 — the ad25c977f "cross-tenant write belt" on update is HALF a belt, and its comment overclaims (moderate; defense-in-depth only, no live-path leak)

- **Where:** `packages/server/src/domain/roster-preset/persistence/queries.ts:98-120`
  (`updatePresetWithMembers`).
- **Defect:** statement 1 (the `rosterPresets` UPDATE, lines 112-115) carries the owner predicate
  `and(eq(id), eq(ownerId))`; statements 2-3 — `DELETE FROM roster_preset_members WHERE preset_id = ?`
  (line 116) and the member re-INSERT (line 117) — ride the bare `presetId` with NO ownership scoping.
  The header comment claims "whatever the caller's id, only the owner's row can move" — false for the
  junction.
- **Failure scenario (the belt's own threat model — a future caller bypassing the verb gate):** call
  `updatePresetWithMembers(db, { ownerId: attacker, presetId: victimPreset, … })` → the row UPDATE
  silently no-ops (0 rows), then the victim preset's ENTIRE member list is wiped and replaced with the
  attacker's members — a cross-tenant write, with no error signaled (the batch succeeds). Today this
  is unreachable: the only caller is `verbs/update.ts`, which gates first
  (`loadOwnedPresetRow` → `RosterPresetNotFoundError`, update.ts:19-22), persistence functions are not
  exported past the domain, and the composed path is proven refusing (sweep + verb tests). But the
  belt was added in `ad25c977f` precisely to survive a gate bypass, and it does not survive one.
- **Also:** no test exercises the belt at all — every stranger-update test refuses at the VERB gate,
  before the write; a persistence-level test calling `updatePresetWithMembers` with a mismatched
  `ownerId` (asserting zero member churn) would both pin the belt and have caught this. Same note for
  `deletePresetRow` (that one IS fully scoped — line 124-126 — but equally unpinned).
- **Secondary race (context, not a separate finding):** preset deleted between the verb's gate read
  and the batch → statements 1-2 no-op, statement 3 INSERTs against a dead FK → raw
  `SQLITE_CONSTRAINT` surfaces as 500 instead of a typed NotFound. Microsecond window, self-owned
  data.
- **Doctrine:** the `correct-fix-on-one-side-masks-the-other` class; D23's stamp is the partition
  key — a write belt that names it must cover every statement that moves owned rows.

### F3 — the `skipped` arm's documented mechanism is NOT implemented: a mid-loop character delete ABORTS the apply, contradicting the design record and the contract comment (low; race-window only)

- **Where:** `packages/server/src/domain/roster-preset/verbs/apply-to-chat.ts:45-64` (no try/catch in
  the member loop) vs `docs/history/design/saved-rosters-build-record.md` §2.4 ("a `DomainNotFoundError` from
  `addCharacterToChat` is **collected, never rethrown**") vs
  `packages/contracts/src/roster-preset/index.ts:99-102` ("reported, **never thrown**").
- **Reality:** `skipped` is fed only by the pre-loop `verifyCharactersOwned` re-verify (lines 35-48).
  A character deleted AFTER that re-verify but BEFORE its `addCharacterToChat` call makes chat throw
  `DomainNotFoundError("character", …)` (`chat/verbs/roster.ts:586-589`), which nothing collects —
  the apply aborts mid-loop with NOT_FOUND, earlier seats already landed (partial apply; idempotent
  re-apply recovers; the character is the caller's own, so no leak).
- **Test reality:** NO test ever produces a non-empty `skipped`. The "vanished mid-apply" test
  (`tests/server/domain/roster-preset/verbs/apply-to-chat.int.test.ts:127-150`) deletes the character
  BEFORE the apply, the FK CASCADE removes the seat row, and the test's own comment concedes the
  member is "neither added nor skipped" — the skipped branch (apply-to-chat.ts:46-48) is entirely
  unpinned; a harness override of `verifyCharactersOwned` returning a subset would pin it in three
  lines.
- **Resolution fork (owner/orchestrator):** either implement the collect (make the record true — that
  also makes "never an abort" total) or truth-repair record §2.4 + the contract comment to name the
  pre-verify window as the only skipped source. The record is durable law; merging it stating a
  mechanism the code lacks is the D-ledger-drift class.

### F4 — design-record test-plan overclaim: "the all-present no-op probe returns nothing to a non-host (the §2.2 leak, pinned)" — no such fixture exists (low; the closure itself is real and pinned by other tests)

- **Where:** `docs/history/design/saved-rosters-build-record.md` §5 (apply semantics bullet).
- **Reality:** no test constructs all-preset-members-already-present + non-host. The harness
  refusing-arm test (`apply-to-chat.int.test.ts:88-112`) seeds ZERO present seats; the composed-real
  non-host test (`tests/server/entry/compose/roster-preset.int.test.ts:78-103`) probes with an ABSENT
  member; the sweep's scope-2 probe likewise. The oracle closure is nevertheless behaviorally pinned
  by subsumption (requireHost rejects before anything, member composition irrelevant) — but the named
  pin does not exist as described.
- **Sub-point:** the refusing-arm test's comment "even the classification pre-read sits behind the
  guard" is UNASSERTED — `listPresentCharacterSeats` is the one chat op the harness does NOT record
  (`_support.ts:137`), so a regression hoisting the pre-read above the gate stays green. (Not
  caller-visible data — the guard still throws — but the ordering claim as instrumented is
  untestable.) Cheap hardening: record the pre-read in the harness + one all-present fixture.

### F5 — stale law-in-headers: `packages/contracts/src/chat/roster.ts` D80 block now states falsehoods this very commit falsifies (low; doc-rot at the exact seam the next agent reads)

- **Where/what:** lines 60-61 ("the roster-preset seat-knobs projection (D80, **unbuilt**) … this
  schema has no consumer yet"), 66-67 ("a roster-preset domain, **if it returns**, would import from
  chat"), 73-74 ("Roster presets/founding casts are **unbuilt** (purged with the 2026-07-25
  rollback)"), 92-94 ("roster presets, founding casts, saved-rosters v2 — **none built today**").
- `936501dfb` builds exactly that consumer (`contracts/roster-preset/index.ts:18` imports
  `characterMemberSpecSchema`) and never touched this file. Per-domain law IS the code header
  (constitution) and the truth-repair-in-the-same-commit rule applies. Note for the repair: the
  `@public future` marker on `talkativenessSchema` (line 60) promised roster-preset as its consumer —
  the consumer arrived and still consumes `seatKnobsSchema`'s inline clamp instead, so that marker
  needs a decision (consume it or retire it), not just a tense fix.

### F6 — unrecorded deviation from the program doc: "Add to chat" renders for NON-hosts (low; UX dead-end, server-side safe)

- **Where:** `packages/client/src/features/roster-preset/components/party-picker.tsx:87-92` — the
  per-row "Add to chat" renders whenever ANY chat is open. The program doc's letter
  (`docs/architecture/proposed/saved-rosters-design.md` §6): "non-host apply (the action is
  **hidden** — capability-driven, the D16 precedent)". The build record §3 — which positions itself
  as the delta ledger — records only "visible when an active chat exists" and does not record this as
  a deviation (§L.8: deviations owe receipts). `active.isHost` is already computed and used one line
  up (line 211) for the Save-current gate, so the doc's letter was one conditional away.
- **Failure scenario:** a non-host member opens the modal in someone else's room, sees an enabled
  "Add X to this chat", clicks, gets "Couldn't apply the party to this chat." — a designed-against
  dead-end affordance. Server-side is safe (composed-real test 2 proves chat's leak-free NOT_FOUND
  and a byte-untouched room). Route to `side-eye`/owner: either gate the affordance on
  `active.isHost` (the doc's letter) or record the deviation in the build record with its reasoning
  (the code header's "capability-quiet rather than lying" line is an argument, not a receipt).

---

## Priority-focus verdicts (what the orchestrator asked, answered directly)

### 1. The `requireHost`-first security delta — VERIFIED CLEAN (all four sub-claims)

- **(a) Genuine leak in the doc's letter — CONFIRMED.** The program doc §4 mechanics ("for each
  member **not already on the roster** → `addCharacterToChat`; for each member **with knobs** → knob
  verbs; **if** config → `setGroupConfig`") fire ZERO host-gated ops when every member is present and
  the preset is knob/config-less, while §5's authority argument rests entirely on "the injected ops
  are host-gated" — so the result `{added: [], alreadyPresent: […]}` returns to a non-host. The
  intersection is non-trivially reachable: present character seats are host-owned cards
  (`addCharacterToChat` reads `getCard({ownerId: principal.userId})`, roster.ts:586), so after a
  host-handoff an EX-host member's own characters remain seated in a room they no longer host — their
  preset of those characters is the oracle probe. The classification pre-read
  (`listPresentCharacterSeats`) is an UNGATED compose-root read (compose/roster-preset.ts:68-74), so
  without the guard the intersection is computed from unfenced data (`injected-op-caller-gate`
  class).
- **(b) ONE authority home — CONFIRMED.** `chat/guard.ts:60` `requireHost` (= `requireParticipant` →
  `loadMemberChat` + injected `can()` → `assertHost`) is chat's chokepoint; it was ALREADY exported
  at `chat/index.ts:75` (not added by this lane). The compose wrapper
  (`entry/compose/roster-preset.ts:63-65`) delegates `requireHost({db, can}, principal, chatId)`
  verbatim — no re-implementation, no second decision path; the `role === 'host'` verdict stays in
  `can()`.
- **(c) No legit-host breakage — CONFIRMED by execution.** The composed-real test
  (`tests/server/entry/compose/roster-preset.int.test.ts` test 1) drives the REAL graph: startChat →
  create → applyToChat as host succeeds (adds in position order, knobs stamped through the real
  `setSeatKnobs`, config through the real `setGroupConfig`, re-apply mints nothing) — GREEN this
  session (29.4s).
- **(d) Pinned — CONFIRMED, with the F4 caveat.** The refusing-arm harness test (chat's own
  `ChatNotFoundError` surfaces THROUGH the injected op; zero adds/knobs/configs recorded), the
  composed-real non-host test (chat's leak-free NOT_FOUND, room byte-untouched), and the sweep's
  scope-2 probe (stranger's OWN valid preset onto A's chat → `requireNotFound`) all ran GREEN this
  session. In-verb ordering: own-preset owner-scoped read (own data, leak-free) → `requireHost` →
  first room-shaped read (apply-to-chat.ts:27-41). The record's specific "all-present" pin is the F4
  overclaim; the closure does not depend on it.

### 2. Ownership/tenancy — CLEAN on every live path (F2 is the belt caveat, not a leak)

- D23: `roster_presets` stamps `ownerId` (true producer — junctioned member list means no single
  derivable FK; matches D23's own DERIVE list naming `roster_preset_members`);
  `ownerid-registry.ts` + `table-scoping-class.ts` rows landed with reasons; the junction stamps
  nothing.
- Every read is WHERE-scoped (`loadOwnedPresetRow`/`listOwnedPresetRows` — queries.ts:25-38), never a
  post-filter; not-owned and not-found collapse into one `RosterPresetNotFoundError` everywhere
  (verb tests pin stranger-vs-dangling equivalence for get/update/remove).
- Producer belts: member characters via `verifyCharactersOwned` (owned-subset query),
  anchor persona via `verifyPersonaOwned` — both compose-wired reads, both throw leak-free typed
  NotFound at the verb BEFORE any write; pinned against a real db (create/update/substrate tests, and
  the sweep's create-with-A's-characterId probe).
- The sweep classification is complete and honest: 7 probes across all 6 procedures — get / update
  (double-marker posture) / remove (`requireNotFound` + post-sweep integrity re-read) / **list
  PROBED, not EXEMPT** (the WHERE-partition rule) / create-with-foreign-member / applyToChat scope 1
  (A's preset) / applyToChat scope 2 (stranger's own preset onto A's chat — the C5 second-scope
  rule). Post-sweep, A's party is re-read byte-intact (name + member list). Suite GREEN this session.
- `applyToChat` cannot materialize a foreign owner's members into a chat: preset resolution is
  owner-scoped (foreign presetId dies first, pinned with `hostChecks` length 0), members re-verify
  against the CALLER's ownership, and `addCharacterToChat` independently re-verifies host + card
  ownership inside chat. The principal on the injected ops is the real caller — no privilege
  laundering.

### 3. FK/CASCADE physics + the `skipped` arm

- Physics all pinned green against real libSQL with FK PRAGMA: character delete → seat CASCADEs,
  preset survives; persona delete → anchor SET NULL; preset delete → members CASCADE, siblings
  survive; owner delete → everything CASCADEs (`persistence/queries.int.test.ts`). Baseline squash is
  exactly the two new tables (no `0001`, journal regenerated inside the isolated worktree — legal),
  SQL matches the drizzle schema including both secondary indexes and the `(ownerId, name)` UNIQUE.
- The `skipped` arm: see F3 — implemented narrower than documented, and the branch itself is
  untested.

### 4. New-domain coupled sites — COMPLETE (all landed, all re-verified)

kit `ID_PREFIX.rosterPreset` + `RosterPresetId` · schema + barrel · baseline squash ·
`table-scoping-class` (both tables) · `ownerid-registry` · contracts module · user-bus member ×3
sites (union + TYPES + COARSE) · compose builder + `services.ts` key · `context.ts Services` +
`router.ts` mount + router · `services.test.ts` SERVICE_KEYS array · cross-tenant sweep · SERIAL_INT
row for the full-createServices test · test-presence mirrors (10 files) · modal slot + authed-app
registration + ct-data-providers REAL_MODALS mirror + agent-nav capabilities fixture ·
invalidation row + USER_BUS_FILTERS test map + tracked keys · chat CT ambient route
(`rosterPreset.list: []`) · `domain-freshness-plane` row · `lifecycle-portability` DEFERRED row
(with a real end-condition) · `dangling-refs` phantom row REMOVED (the gate's two-sided stale arm
demanded it) · suppressions baseline row (hand-edited single row, not a regen) · docs catalog +
receipt (the receipt being F1). The `db-structure` rider gate carries its own stale-arm, so a missed
rider removal would have redded my check run.

---

## Verification log (everything I ran/read this session)

- **Read IN FULL:** all 15 `packages/server/src/domain/roster-preset/**` files; the compose seam;
  the router; the db schema + baseline diff; the contracts module; the user-bus/kit/invalidation/
  modal diffs; all 10 roster-preset test files + `_support.ts` + the contract test + the composed-real
  int test + the sweep diff; the client slice (picker/hooks/modal/index) + both opener diffs + both
  CT files + the story module; the design record + the parked program doc; chat's `guard.ts` whole +
  `roster.ts` regions 555-680 (addCharacterToChat/removeCharacterFromChat) + 700-775
  (setSeatKnobs/kick) + 205-250 (setGroupConfig); `contracts/chat/roster.ts:60-120` (the D80 block);
  the four gate-file diffs; D18/D23/D61(B6) ledger text; the relevant shared-memory lessons
  (new-domain-coupled-sites, new-router-needs-sweep-classification,
  cross-tenant-sweep-no-id-is-not-exempt, stamped-id-write-boundary-gate, injected-op-caller-gate,
  serial-int-for-full-createservices-tests, new-db-table-four-site-landing).
  **Regions NOT read:** `docs/catalog/catalog.json` hunk (judged by the catalog gate);
  `chat/verbs/roster.ts` outside the cited regions; the untouched remainder of compose/services.ts.
- **Structural sweeps:** `ast-grep run -p 'chatParticipants' -l ts packages/server/src/domain/roster-preset/`
  → scannedFileCount=15, 0 matches, positive control fired on compose/roster-preset.ts (4 live
  sites) — the no-second-add-path law holds. Grep corroboration across packages+tests for
  `rosterPresetMemberSchema` (in-module-only consumer), `RosterPresetChatOps`/`MemberWrite`
  (front-door re-exports with in-module consumers — the house domain-front-door pattern),
  `EmitUserEvent` (void — the unawaited emits are correct), `viewerIsHost` (real field),
  `brandedId` (the house loose-id router idiom), D80-citation precedent in docs/.
- **Executed (worktree, capped per lane-standing-facts):**
  - `pnpm check` (whole-tree, background, ~40 min under two live sibling lanes): **FAIL, exactly 2
    stages** — `✗ lint:biome` (= F1, the lane's own) and `✗ structure:full`, whose single violation
    (`dangling-refs`: `Core-Enforcement-Active-Gates.md:268` backticked path
    `scripts/probes/st-goldens/sillytavern-runtime` resolves to nothing) is **ENVIRONMENTAL, not the
    lane's**: that path is a GITIGNORED directory present on main's checkout
    (`git check-ignore` → IGNORED; `ls` exists on main, absent in the worktree), and the lane never
    touched `Core-Enforcement-Active-Gates.md` — the exact
    `gitignored-paths-make-fs-gates-env-dependent` memory class; green on main, red in any fresh
    worktree. Everything else GREEN: all four type programs + tests-membership,
    `structure:db-baseline` + `structure:drizzle-kit` (the squash validated), `imports:depcruise`,
    **`deps:knip` GREEN** (settles the front-door-re-export orphan question), `docs:format`,
    `docs:catalog` (the receipt/catalog content is valid — only its FORMATTING is F1), and all 232
    structure gates except the environmental one — including every roster-touching gate
    (db-structure, table-scoping-class, ownerid-registry, domain-freshness-plane,
    lifecycle-portability, user-bus-coverage, query-freshness-coverage, modal/section/chrome
    registry completeness, test-presence, feature-structure, no-inline-types,
    injected-op-caller-param).
  - `pnpm test:scoped tests/client/agent-nav/index.test.ts tests/client/data/invalidation.test.ts
    tests/server/entry/compose/services.test.ts` → 3 files, 61 tests GREEN (this re-proved the
    agent-nav fixture fix, which the lane committed at 20:41 without a rerun — its own 20:30 battery
    log shows that file red).
  - `pnpm test:scoped tests/server/domain/roster-preset tests/contracts/roster-preset` → 10 files,
    37 tests GREEN.
  - `pnpm test:scoped tests/server/entry/compose/roster-preset.int.test.ts
    tests/server/transport/cross-tenant-sweep.suite.int.test.ts` → 4 tests GREEN (composed-real apply
    - non-host refusal; sweep completeness guard + marker sweep).
  - `pnpm ct:scoped tests/client/features/roster-preset/components/party-picker.ct.tsx
    tests/client/features/chat/surfaces/new-chat-picker-surface.ct.tsx --workers=2` → 19 passed, 0
    flaky (this covered the two NEW new-chat-picker tests the lane's own scoped CT run never
    executed).
- **Not run (orchestrator's tier):** the full node battery on the post-fix tree (the lane's own 605s
  battery at 20:30 ran a near-final tree: 1469 files green, the single red being the agent-nav
  fixture that ad25c977f then fixed and I re-proved) and the push-tier e2e/CT sweep. Two sibling
  lanes were live on the box during this review; all my runs used the capped niced scripts.
- **Second proposed memory line (small):** the worktree-side `structure:full` red on
  `dangling-refs`/`st-goldens` is a live re-sighting of `gitignored-paths-make-fs-gates-env-dependent`
  — a fresh worktree ALWAYS reds this gate until the cite or the gate is fixed; worth routing as its
  own instrument row so worktree lanes stop re-diagnosing it.

## Unconfirmed / out of scope

- Whether `deps:orphan-ratchet` (push tier) objects to the front-door re-exports
  (`RosterPresetChatOps`, `MemberWrite`) — the pattern matches every sibling domain, so I expect not;
  not run under multi-lane load.
- Rendered/UX quality of the picker (spacing, narrow-mount behavior, toast copy) — side-eye's lens;
  only F6's affordance-gating question is called out here.

## Proposed durable lesson (for the orchestrator's memory write)

- Index line: `[belt covers every statement](write-belt-covers-every-batch-statement.md) — an
  owner-predicate belt on a multi-statement batch must scope EVERY statement (junction swaps too);
  belt-without-a-persistence-level-test = unproven belt`
- Body: A "cross-tenant write belt" added at persistence (roster-preset `updatePresetWithMembers`,
  ad25c977f) scoped only the parent-row UPDATE; the junction DELETE+INSERT rode the bare id, so under
  the belt's own threat model (verb gate bypassed) a foreign preset's member list is replaceable
  while the belt "holds". **Why:** the belt's value is precisely the path the verb tests cannot
  exercise (they refuse at the gate first), so a belt ships with a direct persistence-level
  mismatched-owner test or it is decoration. **How to apply:** when reviewing/authoring any
  owner-predicate write, enumerate every statement in the batch and demand the pin that calls the
  query function directly with a foreign owner.

## Issue summary (paste into #26)

Stickler pre-merge review of the roster-26 stack (`936501dfb`+`8ab3d67f4`+`ad25c977f`):
**merge-blocked on exactly one trivial gate red** — `lint:biome` fails on
`docs/catalog/receipts/design.json` (the receipt commit re-wrapped a pre-existing one-line `evidence`
array; scoped `biome check --write` fixes it). Whole-tree `pnpm check` in the worktree: only that
plus a pre-existing ENVIRONMENTAL `structure:full`/`dangling-refs` red (gitignored
`scripts/probes/st-goldens/sillytavern-runtime` absent from any fresh worktree — not this lane's;
green on main); every other stage green including db-baseline/drizzle-kit, depcruise, knip, and all
roster-touching structure gates. **The off-spec `requireHost`-first security delta is
verified clean on all four counts:** the program doc's letter genuinely leaks a roster-intersection
oracle (zero host-gated ops fire on an all-present, knobless, configless apply — reachable post
host-handoff), the fix wires chat's ONE guard (`chat/guard.ts::requireHost`, already exported) at
compose with no re-implementation, runs before any room read, doesn't break hosts (composed-real
green), and is pinned (refusing-arm + composed-real non-host + sweep scope-2, all re-run green this
session). Tenancy is clean on every live path: 7 sweep probes incl. list-PROBED and the second-scope
apply, all owner belts real and tested, zero `chatParticipants` references in the domain (ast-grep,
positive control fired), baseline squash exact. Five non-blocking findings to route: **F2** the new
"cross-tenant write belt" in `updatePresetWithMembers` scopes only the preset-row UPDATE — the member
DELETE/INSERT ride the bare presetId (a gate-bypassing caller could replace a foreign preset's cast;
comment overclaims; belt untested), **F3** the design record §2.4 claims `applyToChat` collects
`DomainNotFoundError` from `addCharacterToChat` but no catch exists (mid-loop delete aborts the
apply; the `skipped` branch has zero tests), **F4** the record's "all-present no-op probe … pinned"
names a fixture that doesn't exist (closure is real via subsumption; harness doesn't record the
pre-read), **F5** `contracts/chat/roster.ts`'s D80 header still says roster presets are
unbuilt/no-consumer — falsified by this very commit, needs truth-repair, **F6** "Add to chat" renders
for non-hosts against the program doc's hidden-affordance letter, deviation unrecorded (`isHost` is
already in scope one line up). Full report:
`docs/reviews/stickler/2026-08-28-roster-preset-26-premerge.md`. Behavioral re-verification this
session: 61+37+4 vitest green, 19 CT green (incl. the two new-chat-picker CTs the lane never ran),
sweep green.
