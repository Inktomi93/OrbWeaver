# Follow-up gap audit — flagged-but-uncaptured lane items (2026-08-08)

**Question answered:** which follow-ups / actions / durable lessons did a completed lane FLAG (in its
final report to the orchestrator) that never landed on the board, in memory, or in a committed
design/review doc — the "we relayed it but never boarded it" gap.

**Method.** Two passes over the session's agent transcripts
(`…/tasks/*.output`, 354 files): (1) marker-phrase grep on every final report; (2) per the coordinator's
method, extracted each AGENT transcript's LAST assistant message (its self-contained findings report)
and read it in full — 72 marker-matching reports + 60 non-marker reports, **132 agent reports read
whole**. The other **222 files were bash/monitor/command-output noise** (no assistant message, or a
final message < 400 chars) and were skipped. Each candidate was cross-checked against three homes:
`docs/retro-workboard.md` (2,179 lines), the auto-memory index + individual memory files, and
`docs/design/**` + `docs/reviews/**`.

**Headline:** coverage is very high. The board is unusually thorough — nearly every flagged item is
boarded, minted as a D-ledger entry, written into a design/review doc, banked as a memory note, OR was
already fixed by a later lane. Below are the **genuine omissions only**, each with the receipt that a
grep of all three homes came back empty.

---

## GAPS (flagged, absent from board + memory + design/review docs), ranked by consequence

| # | Item | Source lane | Type | Where it should go | Absence receipt |
|---|---|---|---|---|---|
| 1 | **Automation settings placeholder collapses to a 63px word-per-line ribbon** — DOG-POLISH's P3-15 fix wrapped `EmptyState` in `<Stack align="center">`; `EmptyState`'s root carries `@container` (`packages/ui/src/primitives/empty-state/variants.ts:15`), so under `align-items:center` it resolves to **width 0** and the description falls to min-content. The pane "looks *more* broken than before." Fix: drop `align="center"`, or `w-full` on the EmptyState root, or badge inside EmptyState. File: `packages/client/src/features/settings/components/settings-pane-placeholder.tsx`. | ad865d86 (dogfood re-verify) | ACTION (P1 UI regression, live) | Board row | grep board+memory+design+reviews for `settings-pane-placeholder\|EmptyState.*(w-full\|@container)\|automation.*ribbon\|63px` → **0 hits** |
| 2 | **The structural fence for #1's whole class** — "a fix that only re-parents a component can break it without any CT noticing, because our CTs assert content/roles, not measure." Recommended: give `EmptyState`'s root a `w-full` floor so it can't shrink-to-fit, OR a gate/CT asserting a rendered `EmptyState` description is wider than ~200px wherever it mounts. "One structural fence kills the whole class." | ad865d86 | ACTION (gate/CT to author) | Board row (gate-authoring) | same as #1 — **0 hits** |
| 3 | **Group-draft mobile topbar names only the first participant** while the desktop `DraftChatHeader` on the identical state names the full cast + seat chip — the exact bug commit `86a1736bc` fixed on desktop, reintroduced on the phone. `chats-selection-title.ts:37` does `cast[0]?.data?.name` while its own header (`:11-12`) asserts the mobile title and desktop cluster "resolve it the same way." Fix: route the draft arm through `deriveChatTitle`. | a95eadb72, aedac329 (mobile-leg re-verify) | ACTION (P1/P2 mobile) | Board row | grep for `chats-selection-title\|group.?draft.*(mobile\|topbar)` on board → **0 hits** (the desktop half is in `docs/reviews/side-eye/2026-08-07-days-merges-rendered.md:188`; the mobile reintroduction is not captured anywhere) |
| 4 | **Phone notification SHEET never marks anything read** — `notification-bell.tsx:155`'s comment claims "the same markAllRead the popover fires on open fires here on mount," but there is no `useEffect` and no mount-time call; `markAllRead.mutate` fires only in the popover `onOpenChange` path. A phone user's unread count can never clear. | aedac329 | ACTION (LOW) | Board row (rides beside the already-boarded phone unread-indicator item) | Board line 320 captures the phone unread **indicator** (showing), NOT this **clear** bug; grep for `markAllRead` on board → **0 hits** |
| 5 | **`ashen-spire.jsonl`'s 26 blank state-anchor marked lines are unexercised** — the new canon-identity seed int test reads only `second-opinion.jsonl`, so ashen-spire's marked lines (blank `mes` debris that never survives parse, so their `extra.type` is inert) get no coverage. Verifier called it "worth a board line, not a fix." | a5efc87 (CHUNK A verifier) | HEADS-UP (coverage) | Board line | grep board for `ashen.?spire.*(unexercised\|marked line)` → **0 hits** (board:236 mentions the room only as the mis-named narrator-drive room) |
| 6 | **`names.ts:2` header contradicts the code** — says the name-stamp is "Applied AFTER squash"; `shape.ts:213` (`runSquash(applyNamesBehavior(...))`) applies it *before*. A Documentation-Law §1 defect; STATLAS flagged it "Not fixed — outside this lane's floor." | a5c756cda (STATLAS) | ACTION (LOW, doc-truth) | Board row or in-commit truth-repair | grep board+docs for `names.ts.*squash\|Applied AFTER squash` → not found (verify before acting — a later assembly lane may have touched the header) |

---

## Notable NON-gaps (verified captured — so the owner doesn't re-review them)

These recurred as candidates but ARE captured; not omissions:

- **Narrator co-speaker cards never reach the model** / **primary-card `{{char}}`** / **empty-cast
  `members`** / **D16 vacuous belt** / **PROMPT_HISTORY vs AI_OUTPUT `{{char}}` divergence** — all
  boarded (board:93-117, 239-248) and the `{{char}}`/empty-cast/belt items were **built by lane
  NARRATOR-CAST** (`a7ceca7cb`). The remaining open co-speaker-cards row is boarded `[ ]`.
- **CANON-1 orphan `{{memory}}` digests** + **`rawContent` fork-strip landmine** — verifier findings
  (a65312a1), both **fixed** by CANON-1 leg 2 (`embeddings.pruneMemoryBlocks`, a86cbb4c) and FORKSTRIP
  (a69862c). D129/D133/D134 minted.
- **GATEFORGE gates' self-proofs RED on main** (message-kind-policy-coverage) + **gen-model-prose-baseline
  re-spells SEAM_PREFIXES** — verifier a5efc87 CHUNK B; both **fixed** by GATEFIX (ae12ce29).
- **`check:structure` cannot pass in any worktree — 49 monotonic-tests violations under
  `tests/goldens/sillytavern-runtime/node_modules/**`** — flagged by a641ef49 (CARDKEEP) and aaffee6e
  (UI17); **fixed** by the st-goldens lane (ab5aaf175 — pruned the 49 manifest rows + `searchGlobs`
  negated glob + `tsconfig` exclude).
- **freeze-provenance gate blind to `onConflictDoUpdate({set})` + aliased/const/builder receivers**
  (a5e2a858) — **fixed** by the follow-on gate lane (aef2eeb481; gate went 8/6 → 15/10 mustFlag/mustPass).
- **SUMMARIZE-SUB** (max-pro-sub offered but firewall-denied for everyone) — flagged a74116715,
  logged in `Core-Audits-and-Debt.md`, **resolved** by af296a5e (narrowed `SUMMARIZE_SOURCES`).
- **rpg tracker self-grant via `patchSheet`** (a3d64d2b) — **fixed** by sec-trackergate (a53318d/a8a585422).
- **"Clear time" destroys the day counter** (a32cd940) — **fixed** (day-preserving time clear, verified
  PASS by a95eadb72/aedac).
- **`admin.resetPassword` owner guard / atomic race clause / `cannot_modify_agent` / disabled-owner
  recovery / DEBUG_GATE header comment / probeDebug pid** — all boarded (board:151-183) and the
  resetPassword owner-takeover + disabled-owner heal were **built** by AUTHTAIL (abad209e).
- **`chats.userMacroValues` silently lost on fork** (a69862c) — captured in the security review doc
  `docs/reviews/security/2026-08-07-fork-host-plane-strip.md:135-137` ("wants a product decision").
- **Guided-prompt contract cap uncapped** (`guidedActions.prompt` = `z.string()` reaches DB + wire
  unbounded) — captured in `docs/design/parked-options-tag-contract.md` §2 (+ ac5d3f3534's "CONTRACT
  QUESTION" flag; geometry `maxRows` shipped, the schema cap left as a stated owner call).
- **rpg extraction seam (census rows 11-36)** / **row-27 `RPG_STATE_TRACKING_GUIDE`** / **prose-1-spec
  §9 stage-table over-claim** — captured in `docs/design/prose-1-rpg-extraction-followon.md` +
  board:239-248; extraction seam **built** by EXTRACTION (aeee9b9e).
- **Base UI missing anatomy** (Toolbar Group/Link/Input, Combobox grouping, Field.Item, Textarea
  hand-respell) — tracked via the BUGATES surface manifest + anatomy-completeness gate's ruled
  dispositions (a77c33ae) and the UI17 seal-alignment doc (`ui-package-design.md` §14-16).
- **Base UI surface-manifest D-ledger** — minted as **D128** (per ac798f159); **D129-D134** all minted.
- **process.kill(0,0) liveness**, **wire-capture-anonymous-not-missing**, **pagination-breaks-.find()**,
  **vendor-SDK-default-retry-surface**, **biconditional-is-a-claim-about-every-writer (the ts-morph
  provenance gate)** and most other durable lessons — present in the memory index.

---

## Coverage limits

- **Read whole:** the final assistant report of all **132 agent transcripts** (both marker and
  non-marker). **Skipped:** **222** bash/monitor/command-output `.output` files with no substantive
  final assistant message. If a follow-up was flagged *mid-transcript* (in a SendMessage the lane sent
  the orchestrator that was NOT restated in its final report), the grep pass would catch the marker
  phrase but the read pass keyed on final reports could miss it — I judged this low-risk since the
  orchestrator reads final reports, and the marker grep covered the whole transcript body too.
- Cross-check was grep-based against the three homes; a follow-up boarded under wording I didn't grep
  for could read as a false gap. Gaps #1-#4 are the highest-confidence (multiple spellings tried,
  all empty). #5-#6 are lower-value and worth a 30-second confirm before boarding.
- I did not re-verify any of the flagged defects against live code — this is a capture-gap audit, not
  a correctness audit.
