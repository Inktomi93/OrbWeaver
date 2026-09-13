---
kind: review
status: active
updated: 2026-08-29
---

# Board re-derivation — E2 client-misc rows (scout pass, main @ e4d017fd8)

## #63 \[P2, Work] production comment contract / comment-density gate

- `tooling/src/verify/gates/commented-code.ts` exists but enforces a DIFFERENT thing (parked
  code statements in `//` comments), not a density/ratio cap.
- `docs/architecture/core/Core-Enforcement-Deferred-Dropped.md:42` still lists `comment-density`
  as "report-only … optional; revisit if a cap is agreed" — not promoted to active.
- D139 (documentation control plane) is minted (`Core-Path-Registry.md:11`) and
  `Documentation-Law.md:129` states the four-role model, so the doc-control-plane half of the
  wake condition is landed. But no gate/lane work exists: `git log --all --grep="comment-density"`
  and `--grep="comment contract"` both return zero commits.
- Evidence rung: gate = NOT DECLARED (deferred-dropped list only); no commit history for the lane.
- **Verdict: 🕓 PARKED (still).** Doc-control-plane premise partially true (D139 landed) but the
  gate itself remains undeclared/optional and no comment-truth re-derivation lane has run.
- **Recommendation: keep parked** — wake not fully met (gate not built, no e2e verification of
  the control plane driving comment truth).

## #69 \[Evidence] ast lens audit counts (33 unwired procs / 9 client-gap contracts)

- Re-ran `pnpm ast unwired`: **15 hits in 7 files** (415 procedures enumerated), not 33/11.
  Automation cluster still dominates but has shrunk (`reorderRules`, `createRule`, `updateRule`,
  `setBudgets`, `getBudgets` remain; `deleteRule`/`setRuleEnabled`/`testRule`/`listFires` no
  longer appear — presumably wired since 08-14).
- Re-ran `pnpm ast clientgap contracts`: **13 hits in 7 files**, not 9 — count went the other
  direction (grew), new entries include `PluginCharacterView`/`PluginWorldBookView`/
  `PluginWorldEntryView`/`PluginAssetView`/`RosterPresetMemberView`/`GlobalVariableView`/
  `OwnerBudgetView` alongside the original `BookView`/`AppSettingsView`/etc.
- Evidence rung: verb output directly from the ast tool (declared+exported+counted), not
  imported-elsewhere proof — this is the same census method #69 itself used.
- **Verdict: ⚠️ STALE-PREMISE.** Both cited counts are materially wrong today: unwired procs
  15 (was 33, ~2.2x lower), client-gap contracts 13 (was 9, higher). The underlying finding
  (automation client surface lags its transport; several \*View/\*Summary contracts are
  server-only) still holds directionally, but the row's numbers need re-derivation before any
  consuming program is scoped off them.
- **Recommendation: keep open but refresh counts** — do not close, but correct the census numbers
  in the issue body before using them to size a client-surface sprint.

## #587 \[P3, Decision] front-door trim (feature index.ts re-exports, vite dev tree)

- Issue is OPEN, empty body beyond title, zero comments — no owner-ruling comment recorded in
  this issue (the "owner ruled 2026-08-23" premise in the prompt is not evidenced in the GitHub
  issue itself; it may live in board/session history not checked here).
- No commits found touching feature `index.ts` re-export trimming.
- **Verdict: 🕓 OWNER-GATED / PARKED**, premise (owner ruled low-priority, defer until felt pain)
  plausible but NOT confirmed by the issue's own comment history — flagging as unverified via
  GitHub, only via out-of-band context.
- **Recommendation: keep parked; if closing/annotating, cite the actual ruling source (board
  comment or session transcript), since the issue thread itself carries none.**

## #604 \[P3, Decision] message-column below-bubble bands (#598 width-contribution class)

- Confirmed via `gh issue view 604`: OWNER RULED 2026-08-24 (comment present, OWNER author):
  "DEFER UNTIL REAL. Apply the zero-width track mechanism opportunistically when the
  metadata/footer bands are next touched; wrap-vs-truncate-vs-overhang gets ruled only when a
  real instance renders wrong. Parked accordingly."
- No commits since touching this class beyond the cited #598 lane (`a56087359`).
- **Verdict: 🕓 OWNER-GATED/PARKED — premise CONFIRMED** directly from the issue's own ruling
  comment.
- **Recommendation: keep parked**, wake condition (a real below-bubble chip renders wrong) is
  unmet; no evidence of a landed instance since ruling.

## #771 \[P3, Work] reactions-while-away digest

- Issue body's actual wake condition (per GitHub): "B6 reactions MR0-MR2 lands (the merge-window
  schema batch, spec section 7 wave 2)" — NOT literally "no per-member last-viewed cursor", but
  the task's stated hard-dep is consistent: no reactions plane exists yet to page a digest off.
- Verified the cursor claim independently: `packages/db/src/schema/chat.ts:547-586`
  (`chatParticipants` table) has only `joinedAt`, `joinSeq`, `leftSeq`, `role`,
  `activePersonaId`, `talkativeness`, `disabled` — **no per-member last-viewed/read-cursor
  column exists.** `leftSeq` is documented as "null = present" (lifecycle only, not a read
  cursor).
- Evidence rung: schema declared + read in full (`chat.ts` lines 538-586), confirms absence.
- **Verdict: 🕓 OWNER-GATED/PARKED — hard-dep premise CONFIRMED** (no durable per-member
  last-viewed cursor exists; B6 reactions plane not landed either, per issue body).
- **Recommendation: keep parked**, deferred 2026-08-29 per row description, blockers real on both
  counts (no cursor, no reactions plane).
