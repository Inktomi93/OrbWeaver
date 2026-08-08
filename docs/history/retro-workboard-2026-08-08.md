# Retro Workboard — the live board

> **THIS IS THE WORKING DOC** (owner-stated). Not law, not a deliverable — the durable state an
> orchestrator resumes from cold. Authority for LAW = `docs/architecture/core/**`; the D-ledger
> (`Core-Path-Registry.md` / `Core-Laws-and-Precedents.md`, current through **D128**) wins on ANY
> conflict. `docs/architecture/proposed/**` is pre-rollback REBUILD REFERENCE — never cite its status
> as current.
>
> **CURRENT-STATE ONLY, INITIATIVE-SHAPED.** When a block goes stale, REWRITE it — never stack a new
> session layer on top. Rewritten in full 2026-08-03 (the line-by-line audit close: every claim in the
> \~3,500-line accreted board was classified DONE-PROVEN / OPEN / STALE / UNKNOWABLE against the tree
> and git; only proven-done work was removed from the live board). **The audited archeology — every
> struck block, snapshot, lane seal and receipt from 2026-08-01 through 2026-08-03 — moved intact to
> [`docs/history/retro-workboard-2026-08-03.md`](history/retro-workboard-2026-08-03.md).** Nothing was
> deleted; things moved. Prior baselines: `git log docs/retro-workboard.md`.

## ═══ WHY RETRO EXISTS — the north star ═══

Read `shitsfucked` at the repo root (the post-mortem). Main's own ledger, verbatim: *"We are tired of
hunting down invisible bugs. **Everything must be proven.**"* The disease it names — **features that
looked done and silently weren't** — is the thing this rebuild exists to kill. The posture is **drive
it live, then pin it**. 2026-08-01 proved it: one owner dogfood day found \~20 real defects, every one
fixed at its ROOT the same day, five whole bug CLASSES made unmakeable. Judge every "done" against
that frame — a row that says "merged" is not a receipt; a sha, a symbol, a registered gate, a running
test is.

Global **KISS/YAGNI are SUSPENDED here** — build the maximal, most-provable version
(\[\[kiss-yagni-suspended-build-maximal]]). Package cake: kit ← contracts ← db ← server ← client +
sealed ui; one-directional flow (rpg ↔ chat only via injected ops). Read
`docs/architecture/core/AGENTS.md` IN FULL before any work.

## ═══ STANDING LAWS (the posture — all owner-set, all still in force) ═══

- **Cap FIVE concurrent lanes** (owner raised it from three, 2026-08-03, to burn the almost-done
  initiatives to CLOSED; the original three-cap came from "six ate our usage too fast" — five is the
  tested ceiling, six is not). **ONE COMMIT per lane**, terse
  message drafted in seconds; receipts go in the final report, never the commit message.
- **Worktrees carry the LATEST LOCAL commit (owner intent 2026-08-08 — CURRENCY, not merge-strategy):**
  origin is 156 behind (unpushed), so a stale-based worktree misses everything. TWO guarantees: (1)
  SPAWN — `.claude/settings.local.json` `worktree.baseRef: "head"` branches from local HEAD (not
  `fresh`=origin); raw `git worktree add -b` also uses HEAD. Both verified correct 2026-08-08 — keep
  `head`. (2) RUN-TIME DRIFT — before merging, REBASE the lane's single commit onto CURRENT main in its
  worktree (`git -C <wt> rebase main`, resolve conflict THERE), then `git -C <main> merge --ff-only`
  (rebase rewrites the SHA — track the new tip). The ff-only is just the clean result; currency is the
  point. Still: any branch certified before sibling merges gets a consolidated `pnpm check` on the
  result; verify → teardown, never chained; `git -C <ABSOLUTE-main>` on every command; prune dead
  worktrees (an unpushed session left 9 at 200-327 behind, all long-merged).
- **GRADUATION NEEDS THE FRESH LENS, not just the static check (owner catch 2026-08-07 — a whole
  session of merges shipped without it):** every non-trivial merged work-stream gets a fresh-context
  `verifier` pass (code lens) and/or `side-eye` (rendered lens) BEFORE its row is called done —
  at CHUNK granularity, one per work-stream. The lane's own receipts + `pnpm check` prove structure,
  never logic. Batch verifiers behind merges when load demands, but the row stays un-graduated
  until the lens reports CONFIRMED.
- **NEVER push to origin without a fresh per-push owner word.** Not overnight, not on a green battery,
  not "the word was banked yesterday".
- **Overnight full-auto**: proceed through the queue, escalation ladder (stickler → ast/code → docs →
  judgment) instead of blocking questions. Blocking only for destructive/irreversible, owner-sacred
  (persona pin), origin pushes, genuine scope pivots.
- **Every UI build gets its side-eye, and ALL side-eye findings get fixed** — never just the top ones
  (\[\[side-eye-fix-all-findings]]).
- **Gates land on a FIXED tree**: a new gate's live violations get FIXED in the same lane; allowlists
  are for permanent deliberate exemptions with a reason + stale arm, never debt parking.
- Board commits are `--no-verify` (owner word); code merges keep the hook. D-numbers are allocated at
  DISPATCH when two live lanes both mint.
- Lane floors MUST name their playwright CT files explicitly — **not because the push bar skips them**
  (it does NOT: `tests:node` runs `pnpm test`, which is the vitest projects `&&` `pnpm test:ct --retries=2` — ONE behavioral lane since 2026-07-17, stated in `scripts/verify/registry.ts:304`), but
  because a LANE is banned from running the whole battery. A CT nobody names is a CT that lane nobody ran.

## ═══ STATE (2026-08-07 — the identity build landed; the queue below is live) ═══

- **═══ ⚑ AUTHORITATIVE REMAINING WORK = `docs/retro-remaining-work-ledger.md` (2026-08-08, tree-reverified) ═══**
  The board below is layered/scattered and CONTRADICTS ITSELF in 4 places the ledger resolved — trust
  the LEDGER over any block below it: **AUTHFIX-2 is CLOSED (the "OPEN UNAUTHENTICATED HOLE" section
  further down is STALE — DEBUGGATE graduated it; only rotate DEBUG_TOKEN + set IP_ALLOWLIST remain)**;
  databank pagination is BUILT; I-2 databank is CLOSED (its `### I-2` header lies "S3 unbuilt");
  capability-gate wiring is genuinely open. The ledger is A(in-flight)/B(dispatchable)/C(owner-decision)/
  D(older-open)/E(verify)/F(struck-done, 14 groups).
- **⚑ COMPACT BOUNDARY SNAPSHOT (2026-08-08 late, main `94394e611`, 157 ahead of origin, tree clean):**
  - **⚑ CONSOLIDATED REMAINING-WORK LEDGER being built** (`a8eeb652ff8e38926`, read-only) →
    `docs/retro-remaining-work-ledger.md` — reads the WHOLE board + all options/design/audit docs,
    re-verifies each open item vs the tree, produces ONE ranked ledger (A in-flight · B dispatchable ·
    C owner-decision · D older-archaeology-still-open incl. AUTHFIX-2 · E verify/investigate · F
    struck-done). This is the authoritative "what's left" — the scattered board reconciled. smallbatch3
    MERGED green (`94394e611`, rebase-then-ff, check PASS; item 1 phone-markread was already fixed
    b407a084a, item 2 ashen-spire 26-anchor seed coverage added).
  - **LIVE lanes:** FORGE #4 Docker build (`a063356b2ad358a65`, worktree agent-forge-docker) · REFINERY
    R0 forge (`a91b702e2d9ae545c`, agent-refinery-r0) · **PRESET-FOLLOWUP** (`aa9a5c8df7d61786f`,
    executor, worktree) — B1 capability-gate→resolve-failure + B2 Prompt-view fork-eject + the P3
    snake_case row-desc + 2 verification CTs (readout skeleton-height + error-arm). smallbatch3 MERGED.
  - **✅ PRESET/CONFIG SIDE-EYE LANDED — SHIP across all three** (`a528c629d6a4aa017`, ref-pinned stage
    `be00cf36a`). FORGE#1 Actions IA "database dump is genuinely gone" (67 rows, 4 distinct delivery-truth
    channels, fork-eject picker praised) · POLISH cluster SHIP (color focus ring, readout skeleton settles,
    error arm wired) · PROSE-GEOMETRY SHIP (12-row cap + internal scroll + on-screen counter/refusal). This
    was the fresh rendered lens the FORGE#1/POLISH/PROSE train was waiting on → those rows GRADUATE.
    **Findings → PRESET-FOLLOWUP lane** (P3 snake_case desc; the 2 CTs it recommended). **OWNER intent Q
    (parked, non-blocking):** color picker has no preset-colour "voices" SWATCHES — popup is ColorWell+Hex+
    reset only; if "tag colour voices" meant swatches they're absent, if it meant unset→theme-default that's
    present+correct. **Shell heads-up (out of preset scope):** the rail shows 9 facet icons (Home·Chats·
    Characters·Corpus·Configuration·Databank·Presets·Refinery·Analytics) vs the §14 seven-ceiling — a
    separate shell concern to review, not a preset bug.
  - **DELIVERED, awaiting OWNER ruling (no build without his word):** persona/character design
    (`persona-character-kind-substrate.md`, 5 forks) · `{{note}}` block-vs-warn (intent found: inherited
    default, `note-token-intent-history.md`) · containerize SPEC done (`containerize-prod-image-spec.md`,
    2-profile; BUILD in flight via forge#4; the image BUILD+cage is owner's live step + security review)
    · batch-2 benched items un-posed (JSON-card=client-submenu-only · guided-cap=shared MAX const ·
    duplication=trim-landing-keep-newbook · nudge texts=ship-verbatim · tag calls · D62 deltas · refinery
    F-N forks) — all in `docs/design/parked-options-*.md` w/ recommendations.
  - **UNBLOCKED — folded into PRESET-FOLLOWUP** (`aa9a5c8df7d61786f`): capability-gate→resolve-failure.ts
    (B1) · Prompt-view section-drill fork-eject (B2, FORGE#1 flagged). The side-eye they were queued behind
    landed SHIP; surface is quiet. Lane graduates on a fresh lens: verifier on B1's failure-classification
    logic + a light drill re-check on B2.
  - **PUSH:** conditional word granted for THIS train — after preset side-eye + fix legs + a FRESH
    battery greens. Held tonight otherwise. E2E_LIVE owed on the push window.
  - **MERGE discipline:** rebase-onto-main-then-`--ff-only` (currency); read EVERY consolidated check
    exit (a slip let a lint error ride main tonight — caught by a `.exit` sweep). Board commits
    `git -c core.hooksPath=/dev/null`.
  - **Gap-audit (owner-ordered) DONE:** high coverage, 6 gaps — 2 "P1 regressions" were already fixed
    by later lanes; the real deliverable was the EmptyState w-full fence (merged). `read each agent
    transcript's LAST message` is the durable audit method (banked).

> The 08-08-dawn and 08-07-late STATE blocks, with every lane seal, merge sha and verifier verdict from
> this session, moved INTACT to [`docs/history/retro-workboard-2026-08-07.md`](history/retro-workboard-2026-08-07.md).
> Nothing was deleted; it moved. This block is current state only.

- **✅ THE CANON-IDENTITY BUILD IS COMPLETE AND FRESH-LENS VERIFIED.** Design:
  `docs/reviews/stickler/2026-08-08-canon-message-identity.md` (931 lines) — all six §18 owner calls
  ruled, all three confirmed defects fixed. Landed in four legs: the SPINE (`dde07f52c` — `MESSAGE_KINDS`
  - `MESSAGE_KIND_POLICY` + `messages.kind` + variant `rawContent`/`macroFreezes`, one baseline squash) ·
    the ORPHAN-DIGEST PRUNE (`3d19fd66a` — F-A's second half: hiding rows SHRINKS the ingest set and a
    position-keyed digest of vanished blocks survived; the cascade is ceiling arithmetic, not machinery) ·
    the DISPATCH FAN-OUT (`c9f33c9b4` — seven sites; **a real user-visible fix: narrator rows were reaching
    the wire prefixed `Group: ` / `Aria: `, crediting one cast member with the whole cast's narration**) ·
    the FREEZE RECORD + replay (`c197ce01b` + `16bb934a1` — and every content writer now clears the
    provenance pair, so the invariant is true in the DB, not just stated).
- **✅ THE DAY'S OTHER MERGES:** MOBILE legs 1-4 (the one-shell rule + the topbar budget) · PHONE-COMP
  (the phone is COMPOSED, not compressed — shared coarse-pointer constants) · DRAFT-POLISH legs 1-2
  (draft visuals + group-draft identity) · STACK-MODES legs 1-3 (`pnpm stack dev|prod` + `--debug`
  overlay + the spawn lock) · TEMPLATE-CENSUS + fix leg (framings preset-homed and typeable) ·
  RULED-BATCH legs 1-3 (pipeline order declared once; day/time nullability split) · WIRE-SINK ·
  ABORT-LEAK · SMALLS-BATCH · SMALLS-3 legs 1-2 · FORKSTRIP + RPGFORK (**two live host-plane
  exposures closed**) · GATEFORGE (four gates, **189 → 193**) · VITE-MAX (salvaged).
- **⚑ IN FLIGHT (2026-08-07 evening — FOUR lanes + the push battery).** The owner gave the push word
  and said "fill up the four slots". `pnpm verify --push` is running DETACHED on main (pid 719532, log
  `<scratchpad>/verify-push.log`, `.exit` file on completion) — **the push happens only if it is green**,
  and per standing law the battery OWNS THE BOX: every lane was briefed to hold its gate/test floor until
  the orchestrator messages it that the battery drained, and side-eye was told not to touch the browser
  or the dev stack until then.
  - **AUTHFIX** (`a8fdca35d02f673ff`, security-executor) — the two-principal divergence; the shape is
    ONE home for the role verdict, both principals consume it. Mints **D135** if it mints.
  - **NARRATOR-CAST** (`a7ceca7cb755472b2`, executor) — co-speaker cards never reach the model in
    narrator mode; the `{kind:"cast"}` arm's zero producers is the tell. Briefed NOT to regress FANOUT-1.
  - **DATABANK-S2** (`a6371e1852bf03245`, executor) — the D85 host visibility toggle, the original
    workboard item. Mints **D136** if it mints. Told to SendMessage before any schema squash.
  - **SIDE-EYE-DAY** (`adf8e74d1848e35ae`, side-eye) — the rendered lens on the day's merges
    (PHONE-COMP's vitals-orbs call · the two `JUDGMENT_DEFERRED` geometry sites · MOBILE 1-4 ·
    DRAFT-POLISH 1-2). Briefed with the prescription-vs-symptom law and the mobile one-shell ruling.
    All four were briefed: re-verify your premise first, a correct refusal is a success, ONE commit,
    durable text under `docs/` never `reports/`, back-channel mid-run. Scope-fenced off each other's dirs.
- **⚑ GRADUATION GATE — NOTHING BELOW IS "DONE" UNTIL ITS FRESH LENS REPORTS CONFIRMED (owner
  re-flagged 2026-08-07: "don't forget about verifier or the proper graduation process").** The lane's
  own floors + `pnpm check` prove STRUCTURE, never LOGIC. Sequence is: lane floors green → merge →
  fresh-context lens at CHUNK granularity → THEN the row graduates. Batching lenses behind merges is
  allowed when load demands; skipping them is not.

  ### ✅ GRADUATED (fresh lens reported; merges + consolidated `pnpm check` 14/14 PASS at `e73529d87`)

  - [x] **NARRATOR-CAST** — verifier **REFUTED 3 of 6**, incl. a LIVE REGRESSION the merge introduced
    (the PRIMARY member's own card had `{{char}}` bound to the joined cast). Fix leg `619a36ca5` closed
    all five as a CLASS: the rule was already in the file — *a `pinnedPersona` render is card-derived*
    (card text is written by an author ABOUT that character, so `{{char}}` means "me" whatever the turn
    voices) — applied to co-speakers but not the primary. All five `pinnedPersona` sites now route
    through `cardOwnerCtx`, which returns ctx **by reference** unless the arm is `cast`, so solo and
    per-speaker turns stay byte-identical. Also: empty-cast `members` floored; the D16 belt made
    non-vacuous (it tested no cast at all — 3/3 green verified nothing) with a `NARRATOR_OF_ONE`
    posture proven to bite; **the "free bonus fix" claim RETRACTED** (the client↔server `{{char}}`
    divergence is still open — `resolveRowMacros` consults `cast` only when `characterId === null`).
    **⚑ BOARD CORRECTION:** the `PROMPT_HISTORY` vs `AI_OUTPUT` `{{char}}` split was **PRE-EXISTING**,
    not new from this change — measured on a plain per-speaker round the change never touched. Resolved
    anyway: the two round-transforms now agree on the speaker; `USER_INPUT` legitimately differs (it
    runs at SEND before arbitration and feeds every speaker's prompt) and says so at the site.
  - [x] **PROVGATE** — verifier **CONFIRMED** both receipts, then found an undeclared reach hole
    (`onConflictDoUpdate({set})` — 20+ live call sites of that idiom). Leg 2 `e20795ada` closed all four
    named shapes **plus two the lane had already DECLARED**, because it probed its assumption instead of
    designing around it: the harness Project *does* resolve `@orb/db`, so table identity is now decided
    **by binding, not spelling**. Clear-only UPDATE ruled LEGAL (it cannot produce a stale pair).
    Conformance 8/6 → **15 mustFlag / 10 mustPass**; positive control planted PER SITE in the real
    4,524-file workspace; every reached shape increments `writeSites` so the tripwire stays honest.
    One limit remains and it is the real kind: `tests/**` outside `scanRoot`.
  - [x] **MY OWN TWO PUSH-RED FIXES** — verifier **CONFIRMED both**. `messageKindSchema` genuinely has
    production consumers (the ratchet's own predicate run against the live workspace says
    `prodConsumed=true`). The CT accname flip was verified in real chromium AND given a better
    justification than mine: the stack sits beside a chip reading **"Members — 3"**, so "2 people" was
    actively contradictory — "2 characters" disambiguates the AI cast from the human seat count.
  - [x] **SIDE-EYE-DAY** — report transcribed to `docs/reviews/side-eye/2026-08-07-days-merges-rendered.md`
    (the lane's tool-guard blocked its own writes; **a deliverable that lives only in a transcript dies
    with it**). Verdict SHIP WITH FIXES; P1/P2s dispatched as RENDERFIX. **Its U1 and U4 were both
    FALSE ALARMS, resolved in the doc** — U4's "N people" stacks are roster rows that pass no label
    (correct fallback); U1's vanishing chat was AUTHFIX landing mid-review (7→6 = twin→real owner).

  ### ✅ AUTHFIX + DEBUGGATE GRADUATED (fresh security lens, 9/11 CONFIRMED; both merges are sound)

  - [x] **AUTHFIX / ROLECLIENTS (D135)** — the role verdict IS single-homed (AST census: 9 Principal
    sites, zero stray `owner`/`admin` stamps; the 3 surviving `role:"user"` floor stamps verified
    floor-only by their consumer sets, not their comments). The pre-fix exploit (a non-owner rule author
    reaching `mintMaxProSub` via `summarize.source=max-pro-sub`) CONFIRMED real and CONFIRMED closed;
    containment stronger than stated (the minted credential carries no key + a second `ownerConsented`
    gate). The `enabled` parity holds.
  - [x] **DEBUGGATE (AUTHFIX-2)** — the un-credentialed bypass is gone in EVERY mode (the 43-red count
    re-derived independently: 15 single-user + 27 SSO-local-origin + 1 = 43). `via` provenance sound for
    cookie (256-bit CSPRNG, HMAC-peppered, hash-only, throws on unset pepper). No owner-inference reader
    of `via` exists (swept all 3 node kinds — every reader is a CSRF gate on `via==="cookie"`). The
    credential gate composes with the `enabled` gate with no gap.
  - ✅ **FOUR FOLLOW-UPS FIXED + MERGED — lane AUTHTAIL (`05f8a1b71`, merge green, consolidated `pnpm
    check` 14/14 at `123`-ahead). Owes a batchable security lens (small, red-first-proven; not yet run).**
    - [x] **`admin.resetPassword` owner-takeover CLOSED** — a **scoped** guard, not the siblings' blanket
      block: `target.role===OWNER_ROLE && principal.role!==OWNER_ROLE → cannotModifyOwner`. The fork the
      lane caught: `resetPassword` is the SOLE in-app `passwordHash` write path, so the owner rotates
      their OWN password through it — a blanket block would trade the takeover for an availability hole.
      Red-first proven (delegated-admin→owner FAILED pre-fix; owner self-rotation FENCE green both sides).
    - [x] `seedOwner` disabled-owner heal — **my spec edit would have been INERT** (the existing
      `WHERE ne(role,'owner')` excludes the exact owner row); the lane widened the predicate to
      `and(eq(id), or(ne(role,'owner'), eq(enabled,false)))` so the heal actually fires. Still 0-row on
      a healthy owner.
    - [x] `DEBUG_GATE_CREDENTIALED.header` comment corrected + standing note (safe by call-site omission,
      not its own logic; threading `peerIp` later is a security change).
    - [x] `probeDebug` split — `probeDebugPosture` stays credential-free (a token would 200 every armed
      stack and destroy the posture question); `probeDebugPid` presents the token via read-only
      `readDebugToken`.
  - **⚑ OWNER, operational (relayed from DEBUGGATE, standing):** rotate `DEBUG_TOKEN` (surface was open
    an unknown window) · `IP_ALLOWLIST` still unset with `WIRE_CAPTURE=on`.
  - ✅ **AUTHTAIL GRADUATED — fresh security lens, all 4 CONFIRMED (`a1eecb1d`).** Sole `passwordHash`
    write path confirmed by full census (reset-password + create-user insert + seed-owner backfill; NO
    self-service change-password verb, so the scoped guard is justified not gratuitous); principal role
    is row-derived every request (guard can't be spoofed); both red-first arms genuine; the seed-owner
    `or(ne(role,'owner'),eq(enabled,false))` predicate is correctly AND-scoped to the owner id (heals a
    disabled owner, 0-row on healthy, never touches a non-owner). **Two NON-BLOCKING hardening flags
    (safe today under the single-owner invariant D17), boarded for a batchable follow-up:** (1)
    `resetPassword`'s write lacks the atomic `WHERE ne(role,'owner')` race-clause its siblings carry —
    unexploitable (owner is boot-seeded, never runtime-minted) but an asymmetry worth an inline note or
    the clause; (2) `resetPassword` lacks the `cannot_modify_agent` guard its siblings have — harmless
    now (agents aren't form-loginable) but a sibling to sweep if agent hardening ever happens.
  - ✅ **TWO VERIFIERS CONFIRMED the 'mechanical' graduations (owner-offered spend) — no refutation.**
    `a74f2250` SMALLS-SERVER 4/4: the per-speaker byte-fence covers ALL cases (`GroupConfig.output` is a
    2-value union; only `.output` threads, `cardScope`/`scopedTargetId` stay pinned), group-load parity
    with the real turn is faithful (`metadata.group ?? DEFAULT_GROUP_CONFIG`, same `parseChatMetadata`),
    `PreviewInputs` is file-local single-constructor, red-first genuinely bites. `a07a6cd8` SUMDROP+
    TEMPLATE-UNIFY 6/6: the firewall pin (`firewall.test.ts:46-51`) covers summarize+max-pro-sub→forbidden
    so the deleted resolve-role test lost no coverage; `.catch(undefined)` self-heals stored values;
    structured untouched; compaction slot byte-IDENTICAL (both 314 chars, sha match); override path
    unchanged; no model-prose baseline debt.
  - **⚑ ONE PRE-EXISTING CAVEAT the SMALLS-SERVER verifier flagged (not a refutation, boarded):** the
    real turn coerces a single-target regen to per-speaker via `asPerSpeaker` (`turn.ts:1485/2336`); the
    PREVIEW accepts a `speakerCharacterId` but only reorders the cast and keeps `group.output` — so a
    narrator-room preview requested WITH a `speakerCharacterId` shows narrator framing while an actual
    single-speaker regen would render per-speaker. Pre-existing modeling choice (preview = next natural
    full-cast turn), harmless, worth a note if preview-fidelity is ever pushed further.
  - **⏳ `verify --push` BATTERY on main (`bd644dbd2`, detached, owner request).** **STATIC TIER ALL
    GREEN** (15/15: lint·all types·structure:full·deps·docs); behavioral phase (`tests:node`+CT,
    e2e-smoke, cpd, parity) still running. A `tests:node` flake here = contention (3 write lanes), not a
    real red — read `reports/verify.json`. **HOLD ALL MERGES until it lands** (banked law: merging
    mid-battery muddies what got certified).
  - ✅ **PTRGATE DONE, MERGE HELD FOR THE BATTERY (`cca9715`, `wt/agent-a989027e`).** Gate
    `no-pointer-variants-in-features` minted (**194→195**); all **8** feature-file `pointer-*` literals
    relocated byte-identically to `#components/pointer-variants.ts` (incl. the 8th at persona-panel-row);
    75 CTs green prove the coarse touch-floors + collapse SURVIVE the relocation; planted real-tree
    violation bit then removed; §4b codified (axis 3 binds utility variants, no D). **Its worktree
    `typecheck:graph` katex red (`ui/src/markdown/math.ts` CSS import, untouched) is a WORKTREE ARTIFACT
    — clean main's `types:graph` is GREEN in the running battery.** Merge + consolidated check after the
    battery; then the rpg-file chain unblocks: glyph sweep (#13), D132(G) prose gate, and RENDERFIX's
    deferred side-eye (#16, which also covers PTRGATE's rendered relocations).

  ### ✅ ALL DISPATCHED CHUNKS HAVE GRADUATED (2026-08-07 evening)

  Every lens has reported. NARRATOR-CAST, PROVGATE, the two push-red fixes and SIDE-EYE-DAY are above;
  AUTHFIX + DEBUGGATE graduated via the security lens (their four follow-ups are lane AUTHTAIL).
  DATABANK-S2 landed zero code — its sweep WAS the verification. The graduation gate is currently EMPTY.
- **Superseded IN-FLIGHT note (GATEFIX finished; merged `96d35ee80`, consolidated static check 14/14):** lane **GATEFIX** (`ae12ce29192c53e14`) was
  retargeting `message-kind-policy-coverage`'s conformance rows + the `__g_mkpc` fixture, which MY
  commit `5f2afa7fd` orphaned when it emptied the DEFERRED map (correctly) without updating the two
  coupled sites written against it. **`pnpm check` stayed GREEN through this** — the conformance suite
  is a VITEST test, not a structure gate, so the static/battery split hid it
  (\[\[check-is-static-battery-is-separate]] biting for real). **DISPATCH NEXT, none started:**
  AUTHFIX (the principal divergence, security-executor) · the narrator co-speaker-cards defect ·
  side-eye on the day's rendered merges (PHONE-COMP's vitals-orbs call + the two JUDGMENT\_DEFERRED
  geometry sites). Superseded note (both finished, verdicts boarded above): NARRATOR-LIVE + the 4-chunk verifier were lane **NARRATOR-LIVE** (`a04f9f8075274896e`) + a 4-chunk **VERIFIER** (`a5efc87558f12b959`) over the day's un-graduated merges (FANOUT-1's seven dispatch sites incl. the 33-line shipped-asset patch · GATEFORGE's four gates, false-positive hunt included · the RPGFORK + FANOUT-2 fix legs). Nothing else is running. Original NARRATOR-LIVE note: lane **NARRATOR-LIVE** — a dogfood-shaped LIVE drive of group narrator mode (hosted +
  local vLLM arms) answering "does it demonstrably work end-to-end now that the fan-out changed what the
  model sees?" Verdict → `docs/reviews/misc/2026-08-07-narrator-live-drive.md`.
- **✅ NARRATOR MODE: WORKS on the local arm (verdict `docs/reviews/misc/2026-08-07-narrator-live-drive.md`).**
  Two live vLLM rounds, Qwen3-VL-8B: the model honored the `<speaker>` nudge 2/2 with exact cast
  spelling; the wire came back `"Charlotte: … JFC: … Charlotte: …"` with **no `Group:`/`Aria:`/outer
  name** (FANOUT-1 holds, driven); the renderer made three theme spans with BOTH non-adjacent Charlotte
  spans resolving one tint and JFC's another (per-character, not per-span-alternation); the trace
  carries `kind=narrator`. **My brief named the wrong room** — Ashen Spire is `per-speaker × merged`;
  the pack's only narrator room is "Example — Second Opinion". And the pack's narrator rows do NOT
  declare their kind (every seeded row traces `standard`) — only driven rows carry it.
  - [ ] **CO-SPEAKER CARDS NEVER REACH THE MODEL IN NARRATOR MODE** (M, substantive, source-verified)
    — the system row counts `Charlotte`×7, `JFC`×**0**, `Also present`×**0**, and opens *"write
    Charlotte's perspective only"*. Mechanism: the narrator round's speaker is the SYNTHETIC group
    character, which by construction isn't in `castMembers`, so `shapeContextForSpeaker`
    (`assembly/speaker-card.ts:24-27`) takes its `idx === -1` early return — and that line is the ONLY
    writer of `coSpeakers` in the server. Corroborated: `AssembleContext.speaker`'s `{kind:"cast"}` arm
    (doc-commented "narrator, `{{char}}` = the whole cast") has ZERO producers. **The round works IN
    SPITE OF the assembly.** Most visible on a FRESH narrator room. Evidence: live drive + source.
  - [ ] **THE PRESET MAIN-PROMPT MARKER CONTRADICTS ITSELF IN NARRATOR MODE** (M, owner-veto text —
    found by lane NARRATOR-CAST, source-verified, deliberately NOT fixed by it). Once `{{char}}` binds
    to the joined cast (the `{kind:"cast"}` arm), the DEFAULT preset main-prompt marker
    (`contracts/src/preset/index.ts:995`) renders on a narrator turn as *"You are Charlotte, JFC … Stay
    in character; write Charlotte, JFC's perspective only."* **The single-perspective clause is now
    self-contradictory.** It is a PRESET-owned marker template (edited via a per-section `template`
    override), NOT a prose slot — so making it mode-aware is PRESET territory, and doing it from inside
    the assembler would be a second home for one authority. The lane correctly refused. **Owner call:**
    a mode-aware default marker, or a documented narrator-preset the host selects.
  - [ ] **NEW PROSE-1 SLOT SHIPPED — `chat.group.castMember`, default text OWNER-VETO MATERIAL** (lane
    NARRATOR-CAST). Verbatim default: **`[Cast — {{name}}]`** · `home:"user"` · `version:1` ·
    `macros:"none"` · `requiredMacros:["{{name}}"]` · title *"Narrator cast-member heading"*. **Why a
    NEW slot and not a re-version of `chat.group.alsoPresent`:** a version bump invalidates every host's
    existing merged override; selection by `ctx.speaker?.kind === "cast"` keeps per-speaker merged turns
    BYTE-IDENTICAL. The problem it fixes: `[Also present — {{name}}]` frames a character the model is
    being asked to VOICE as a bystander. **Joins the veto pile beside NARCOLOR's three nudge texts.**
  - [ ] **Raw `<speaker>` markup leaks into the chat-list preview** (S) — `span[slot=list-row-subtitle]`,
    screenshot in the review doc.
  - [ ] **The `.env` OpenRouter key is INERT** (S, and it blocked the hosted arm) — `credentials.list`
    is `[]` and `resolveOpenRouter` requires a STORED credential row; there is no env fallback. The
    owner keeps a key in `.env` for testing and it does nothing. Decide: an env fallback for the
    hosted testing arm, or document that the key must be entered in the UI once.
  - **Divergence scope caveat the drive added:** it is the FALLBACK auth path, so a human OIDC owner is
    fine — but EVERY automated drive (snap, e2e) silently runs local vLLM while the capability surface
    claims Opus. `.env` documents the D17 single-owner collision with a 2026-08-03 comment: PRE-EXISTING.
- **⚑ OWNER RULING (2026-08-07) ON THE PRINCIPAL DIVERGENCE: FIX IT PROPERLY, STOP HAND-PATCHING.**
  His words: it "has been doing it for a while, we just manually dealt with it before" — so this is
  PRE-EXISTING, not new from today's reseed, and the manual `setRole` workaround is retired. The want:
  when the fallback path admits you, **it goes through like normal** — you land as a REAL owner and the
  turn resolves the owner's model, instead of a second-class twin the capability surface lies about.
  **NOT YET DISPATCHED — the next orchestrator dispatches AUTHFIX to security-executor** (an earlier version of this line claimed it was dispatched; it was not. Correcting my own false claim.) The shape to build toward: **the role verdict has ONE
  home and both principals consume it** — the same discipline `viewerReadsHidden` follows (D110 homes
  the byte-selection verdict once so surfaces cannot drift). A seam that STAMPS a role while a resolver
  READS one is two homes for one verdict.
- **⚑ LIVE-DRIVE FINDING (NARRATOR-LIVE, mid-run): TWO PRINCIPALS DISAGREE ABOUT THE SAME USER, and
  the capability surface and the actual turn silently pick DIFFERENT MODELS.** The `via:"fallback"`
  auth seam (`entry/auth/seam.ts:113-122`, this dev stack's path) stamps `role:"owner"` on the REQUEST
  principal UNCONDITIONALLY; `createHostPrincipalResolver` (:147) reads the DB row and gets
  `role:"user"`. Measured consequence: `resolveChatCapability` reports `agent-sdk / max-pro-sub /
  claude-opus-4-8` while the TURN resolves `vllm / Qwen3-VL-8B` (`ROLE_SELECTORS.chat`'s
  `isOwner ? max-pro-sub : vllm`). Pinning `roleDefaults.chat` then DISABLES the composer ("no working
  connection") and `previewContextFit` 403s `requires owner privilege`. **Seeding half:** the reseed's
  `ensureUser("owner")` minted a SECOND user (handle `"owner"`, role `user`, `01kzeme26t…`) distinct
  from the real owner row (`01kzemdyvvfv…`, role `owner`) — and the dev db dropped + reseeded TODAY on
  the identity baseline regen, so whether this is new-as-of-that-reseed is an open question the lane
  answers. **Invisible without a live drive**; no test asserts the two principals agree. Owner call on
  the fix (identity-mutation adjacent → security-executor). Lane refused BOTH unblock paths
  (`admin.setRole` = identity mutation; adding an OpenRouter credential = spends the owner's money and
  handles his key) and ships the hosted arm as NOT COVERED with this as the stated reason.
- **⚑ NARRATOR MODE, LOCAL ARM: GREEN so far** — an 8B local model (Qwen3-VL) emitted
  `<speaker>Charlotte</speaker>` / `<speaker>JFC</speaker>` markers unprompted, the renderer split into
  three ThemeScope spans, both Charlotte spans share one tint and JFC's differs, and the trace carries
  `kind=narrator`. The nudge holds on a small local model — the compliance worry was the reason for the
  drive.
- **NOT PUSHED: 84 commits** ahead of `ab55c112e` (counted 2026-08-07 at `96d35ee80`; the board carried
  "\~72" from an earlier point in the same session). The push word is the owner's, fresh, per push.
- **LEDGER:** through **D132**. **D133 + D134 drafted-not-minted** in
  `docs/reviews/security/2026-08-07-{fork,rpg-fork}-host-plane-strip.md` — batch at the next ceremony.
  **D129(G) owes a wording amendment** (owner-ruled): it says the shape dispatch "replaces" the bare
  `role === "system"` drop; the tree needs BOTH gates (ST imports mint system-role canon rows that are
  `standard` kind; `CanonRow.role` is a two-arm union). Reasoning in-source at `entersPrompt`.
- **WORKTREES (re-listed 2026-08-07 at `96d35ee80`):** `agent-a62e9f121c7999904` (TEMPLATE) held warm
  DELIBERATELY — it holds the PROMISED (b) templating unification build, which goes to it and never a
  sibling (shared `promptConfig.prose` storage). **Four are merged and reapable:**
  `agent-a05506306bb96c8c5` (STACK-MODES) · `agent-a0936c26e2fec102d` (GATEFORGE, at `f954bbcf0`) ·
  `agent-a86cbb4c35dfb0279` (at `3d19fd66a`) · `agent-ae12ce29192c53e14` (GATEFIX, at `4b32485a8`,
  merged as `96d35ee80`). Teardown owes `status --short` + `git show --stat` receipts FIRST per the
  merge law. A stale `.cache/snap-stage/c3757975c90e` worktree entry wants pruning.
- **GATES 193.** Battery last green at 10,364 vitest+CT (`853ce611a`, morning) — a fresh `verify --push`
  is owed before the next push.
- **⚑ OWED BY THE OWNER (nothing is blocked on me):** the push word · the two `JUDGMENT_DEFERRED`
  geometry rulings for side-eye (`rpg-pack-rows.tsx:39`, `rpg-actor-trackers.tsx:251`) · PHONE-COMP's
  solo call (dropping the band's vitals orbs at coarse) wants a side-eye eye · the phone
  unread-indicator (registry-shaped) · `{{note}}` warn-vs-block posture · the draft-mode design pass
  (P1 nav-away discards a composed draft) · whether the templating (b) unification goes now.
- **THE DAY'S NUMBER:** 12 fresh-lens passes, **8 refutations** — every one already merged, gate-green
  and believed done. Six premise-kills by lanes, three against briefs the orchestrator wrote.

## ═══ ~~AUTHFIX-2 — OPEN HOLE~~ **STALE — CLOSED by DEBUGGATE (graduated); see the ledger. Only DEBUG_TOKEN rotation + IP_ALLOWLIST remain (owner ops).** ═══

**Severity HIGH on any box whose origin port is reachable. Found by lane AUTHFIX while fixing something
else; deliberately NOT fixed, with reasons. Full write-up + exploit path + two costed fix shapes:
`docs/architecture/core/Core-Audits-and-Debt.md`.**

The chain, four links, all verified as code:

1. `foundation/observability/debug/routes.ts:184-201` `createDebugAuthMiddleware` — the `adminAuth.isAdmin(headers)`
   arm calls `next()` **BEFORE** the `expectedToken` check. Its own doc says the arm is for "an admin
   session COOKIE".
2. `entry/app.ts:280` wires it in PRODUCTION with `adminAuth: { isAdmin: deps.seam.isAdmin }`.
3. `seam.isAdmin` → `resolvePrincipal`, which honours ALL THREE paths **including the owner fallback**.
4. `ownerFallbackAllowed` returns `true` UNCONDITIONALLY under `single-user` ⇒ **`/api/_debug/*` 200s to
   any un-credentialed request with no `DEBUG_TOKEN`.** Under `oidc` the gate is `isLocalOrigin`, which
   reads the **client-supplied `Host` header** — `curl -H 'Host: 127.0.0.1' …` satisfies it from any
   network position that can reach the port. `IP_ALLOWLIST` is NOT set in the live `.env`.

**What is behind it:** principal-BLIND whole-db reads — `/db/chats`, `/db/chat/:id`, `/config/user`,
`/wire/captures` — and `WIRE_CAPTURE=on` in the live `.env` means provider request BODIES.
`debug/inspect/config.ts:310-315` carries the marker stating the very assumption this violates.

**The AUTHFIX merge neither opens nor widens this** (lane's claim, independently re-checked by the
graduation security lens): the routes are principal-blind, so the gate consumes a BOOLEAN that was
already `true` — twin-role-owner before, real-owner after, identical reach.

**Why it was not fixed in-lane:** the one-line fix (`principal.via === "fallback" → false` in `isAdmin`)
was written and then REVERTED, because `tests/e2e/support/trpc.ts:251-252` documents the dependency
verbatim and **no e2e mode sets `DEBUG_TOKEN`** — closing the admin arm 404s the whole e2e debug-witness
surface, including `e2e-smoke` in `--push`. Shipping a known-red e2e or a guessed harness edit is worse
than a precise finding. **Correct call.**

**Two fix shapes, lane leans (i) and so do I:** (i) thread `DEBUG_TOKEN` into the three e2e mode envs +
a shared header helper in `tests/e2e/support/trpc.ts`, then flip the `via` check — the clean one; or
(ii) gate the flip on `expectedToken !== undefined` inside `createDebugAuthMiddleware` ("a configured
token may not be bypassed by an un-credentialed principal") — closes it on the live box, leaves
token-less e2e stacks working, but it is a conditional control with its own conformance suite to sweep.
**OWNER: this is the one live-posture item on the board that is a real hole rather than debt.**

## ═══ ⚑ OVERNIGHT FULL-AUTO ENGAGED (2026-08-07, owner word: "full auto, overnight protocol, implement everything in the retro doc in full, incl. the smaller bits — glyphs etc") ═══

**Posture:** work the queue via the escalation ladder (stickler → ast/code → docs → judgment), NO
blocking questions, every non-trivial merge gets a fresh lens before it graduates, security → security-
executor (never the main session, never Fable). Main session is on **Fable 5** (orchestration only).

**WILL NOT AUTO-BUILD — owner-gated, stay parked:** the 3 nudge default texts (owner veto) · presets-
into-rail (owner-timed) · JSON-card export · `{{note}}` warn-vs-block · the persona=character design
pass (OWNER-SACRED / parked — do NOT build) · RV-13 branch-and-save · AGENT-1 (owner-scoped, Max OAuth
expired). **No origin push** (needs a fresh per-push owner word + battery).

**Durable queue = TaskList (#11–#15+) + this ledger.** As lanes merge, dispatch the next; sequence
rpg-file items (glyph sweep, pointer-coarse gate) AFTER RENDERFIX to avoid collision. Re-verify EVERY
board row's premise before dispatch — this session has premise-killed \~5 believed-open rows (3 databank,

- others), the board's measured defect rate on grep-sourced rows is \~50%.

**⚑ MJS-PROBES → PROBES-TYPING handoff (the "green ≠ typechecked" reveal):** the mech lane renamed 17
`.mjs` probes → `.ts` (`77a9118b6`, branch `wt/agent-af1268fce19895923`), which dragged **\~686 latent
strict-mode errors** into the aggregator — real debt from `.mjs` escaping every typechecker for years,
NOT a rename regression. Excluding is OFF THE TABLE (tsconfig.json's own law: probes are "our code",
never excluded like the 3rd-party ST runtime). Handed to executor **PROBES-TYPING** (`a98737bcaa810909b`)
to type them PROPERLY — reusing the production wire types the probes already probe (`infra/providers`),
no `any`/`unknown` escape hatches. Merges the rename branch first; its branch supersedes the mech branch.

## ═══ ⚑ DISPATCH LEDGER (2026-08-07 evening) — what is RUNNING vs merely BOARDED ═══

> **Why this section exists:** the orchestrator wrote *"routed to its own lane"* THREE times about
> AUTHFIX-2 across three messages and never dispatched it — reporting an open unauthenticated hole as
> handled while it sat unassigned. **A status claim owes its evidence the same way a board row does.**
> Grep your own outbound text for "routed" / "boarded" / "queued" and verify each against the dispatch
> results before repeating it. Doctrine block minted the same day.

**⚑ ROSTER AT `123`-AHEAD (owner raised the cap back to 5, 2026-08-07 overnight) — FIVE LIVE:**
`RENDERFIX` (a8a2eab, client: side-eye P1/P2s + geometry + vitals) · `PROBES-TYPING` (a98737bc, the
17 probes' 686 latent type errors) · `PORT-R6` (acf450ce, chat-bundle arm — 3 forks ruled: one `chat`
kind extension-dispatched, automation deferred to its own family, rpg carry via injected
`RpgPortabilityPort`) · `SMALLS-SERVER` (a3fb5a08, narrator preview-fidelity + import-write-guard) ·
`TEMPLATE-UNIFY` (a10196440, D132 (b) unification — re-verify what TEMPLATE-CENSUS already landed FIRST).
Fences: RENDERFIX=client only · PROBES=scripts/probes · PORT-R6=portability/serde/server-rpg-persistence
· SMALLS-SERVER=chat verbs+settings · TEMPLATE-UNIFY=contracts/preset+injections+prose registry. Glyph
sweep (#13) + pointer-coarse gate (#14) WAIT for RENDERFIX (rpg client files). AUTHTAIL owes a batchable
security lens.

**PRIOR DISPATCH LEDGER (superseded by the roster above):**

- **DEBUGGATE** (`aa32294c5e699ca9e`, security-executor) — AUTHFIX-2, the unauthenticated `/api/_debug/*`
  hole. Briefed to fix shape (i) (thread `DEBUG_TOKEN` through the three e2e mode envs + a shared header
  helper, THEN remove the bypass) — **NOT shape (ii)**, which leaves a conditional control and is the
  partial. Also assessing whether the principal-blind whole-db reads get scoped now, per the route's own
  `@owner-scope-ok` marker.
- **ROLECLIENTS** (`a74116715bb5c2dea`, security-executor) — the second home for the role verdict.
- **NARRATOR-CAST fix leg** (`a7ceca7cb755472b2`) — the primary-card `{{char}}` regression + 3 more.
- **PROVGATE fix leg** (`aef2eeb481ade8589`) — closing all four reach shapes, not declaring them.
- **SIDE-EYE-DAY** (`adf8e74d1848e35ae`) — the rendered lens on the day's merges.

**⚑ OWNER RULINGS 2026-08-07 (question-tool batch) — routed:**

- [x] **SUMMARIZE-SUB → DROP `max-pro-sub` from `SUMMARIZE_SOURCES`.** The 2026-07-27 split STANDS —
  summarize and structured do NOT run on the metered Claude sub (batch roles don't spend the
  subscription). The owner's "it should support it" was reconsidered once shown it contradicts his own
  ruling; he ruled drop. Lane **SUMDROP** (`af296a5eaef3782f3`, mech) — one tuple edit + the comment
  (the two lists agree again) + close the SUMMARIZE-SUB ledger entry. `.catch(undefined)` self-heals
  stored values, no migration.
- [x] **VITALS-ORB → KEEP THE DROP, FIX THE HEADER.** Vitals live only on Status/Inventory at coarse;
  no new UI. Correct the rpg header's over-claim (the wallet is NOT a Status tracker row). Folded into
  **RENDERFIX** (owns the rpg files).
- [x] **BOTH `JUDGMENT_DEFERRED` GEOMETRY SITES → FIX BOTH to clear 44px, then DELETE the exemption
  rows.** Site B (`rpg-actor-trackers.tsx:251`, destructive ✕): `pointer-coarse:min-h-touch-target` on
  the Badge so the 44px hit area fits inside its own chip. Site A (`rpg-pack-rows.tsx:39`, icon picker):
  `pointer-coarse:gap-block` so pitch = 44. Folded into **RENDERFIX**. The gate lands on a fixed tree,
  so the two `no-floorless-control-in-wrap` exemption rows come OUT once the floor is cleared.
- [ ] **POINTER-COARSE-IN-FEATURES → MINT THE GATE (token/shell only).** Axis 3 binds utility variants,
  not just token sizing: `pointer-coarse:` literals are banned in feature files exactly as viewport
  `@media` already is. Mint the gate AND sweep the existing violations (2 rpg files + the chat-feature
  precedent `member-row.tsx`, `message-actions-reveal.ts`) into the token/shell layer.
  **⚑ QUEUED behind RENDERFIX's merge** — it edits the same rpg files (adding `min-h-touch-target` /
  `gap-block` `pointer-coarse:` utilities), so this lane sweeps a SETTLED tree and picks up RENDERFIX's
  new literals in the same relocation. Do NOT dispatch until RENDERFIX merges. `no-media-queries-in-
  features`'s `MEDIA_QUERY_RE` matches viewport widths only — this is a NEW gate, not an extension.

**⚑ ALL FIVE OVERNIGHT WRITE LANES MERGED (`148`-ahead, static 14/14 GREEN). No write lanes live.**

- ✅ PTRGATE (gate 194→195) · PORT-R6 (`6be6873d`, D136, I-6, round-trip proven) · PROBES-TYPING
  (`56ae7f493`, 686 strict errors → 0) — plus earlier TEMPLATE-UNIFY + SMALLS-SERVER. All static-green.
- ⚑ **The combined merge red'd on `types:graph` + `docs:format` — both fixed on main.** `types:graph`
  was the katex `*.css` import in `ui/src/markdown/math.ts`: the node aggregator pulls browser files
  transitively but excluded the per-package CSS ambients; PTRGATE's new transitive edge to math.ts hit
  it. Fixed with an aggregator-only `aggregator-assets.d.ts` (`f38831a09`). **LESSON: PTRGATE's cold
  worktree red was REAL — I dismissed it against a battery that predated the merge. A lane's cold check
  outranks a warm one.**
- ⚑ **SUMDROP regression caught by the earlier battery + fixed** (`7e7d9f72d`): a stale `max-pro-sub`
  summarize fixture in the routing-coherence int-test. `pnpm check` never runs `tests:node`; a dropped
  enum value owes a fixture sweep across ALL suites, not just production readers + the targeted verifier.
- [ ] **`run-coverage.ts` widgets/trackers bug** (PROBES-TYPING flagged, one-line fix): `seedState()`
  seeds `trackers:{}` but every path reads `state.widgets` → `renderReminder` throws turn 1. `run.ts` is
  correct; only run-coverage mismatches.
- ✅ **PORT-R6 GRADUATED — verifier CONFIRMED all 6** (`a181b333`, 24 targeted tests re-run incl. the
  round-trip): the id-remap "not-equal" proof is genuinely non-vacuous (fresh box mints real new ids);
  pruning pins match the actual db CHECK/CASCADE/RESTRICT arms; every DEFER plane is
  runtime/derived/cross-box-identity (parentChatId defer honest); the lying `_support.ts` double is
  fixed index-aligned; trust boundary sound (host-gated export, D30 per-tagger tag scope, char-required
  refusal writes nothing); envelope discriminates on `schemaKind` not extension. **Residual (hardening,
  not a defect):** no ≥2-turn cross-link fixture — "cannot cross-link two rpg-anchored turns" is verified
  by reading the positional-index logic, not a runtime counterexample. Boardable one-fixture add.
- ⚑ **SECOND BATTERY CATCH (`6616ddd44` run): ONE CT red** — `chat-list-surface.ct.tsx` asserted the
  OLD "Chat file (.jsonl)" label; PORT-R6 renamed it "Transcript (.jsonl)" + added "Whole room
  (.orb.json)" and reported "No CT" (there WAS one). Fixed to the 3-format menu (`95c552e2c`, 32/32 CT).
  **Two batteries, two stale coupled test-sites (SUMDROP enum fixture · this menu-label CT) — both
  invisible to static + the targeted verifier. \[\[shared-value-change-owes-a-battery-not-static]]:
  an enum/label/menu change owes a `tests:node`/CT run; the coupled site hides in an unrelated suite.**
- ✅ **PUSHED 2026-08-07: `ab55c112e..d34a6702c main → main` (152 commits).** Certification battery
  `95c552e2c` came back **PASS (exit 0) — all stages clean incl. `tests:node`** on the third run (no
  third coupled site). Owner word given ("push when ready with no verify"); `git push --no-verify` (the
  battery was the certification). **STANDING LAW RESETS: the NEXT push needs a FRESH word + a FRESH
  battery** — this word and this green are spent.
- ✅ **RENDERFIX + PTRGATE GRADUATED ON THE RENDERED LENS — SIDE-EYE-RPG: SHIP, NO DEFECTS**
  (`docs/reviews/side-eye/2026-08-07-rpg-graduation.md`). All 5 targets CONFIRMED at REAL coarse pointer
  (`matchMedia('(pointer:coarse)')` asserted true before every geometry read): persona crown+heart
  visible with accessible names (one-per-pointer-class arm-swap proven) · rail cells 66.5/56.9/**45.3px**
  clear the 44px floor at 430/375/320 with a solid 6-col frame · inset focus ring paints fully in the
  overflow box · new-draft identity is ATOMIC (rAF recorder: `"Chats"` → full cast, ZERO "New chat"/"?"
  frames). PTRGATE: RPG\_RAIL\_WRAP + HIDE\_AT\_COARSE rendered; CHIP\_TOUCH\_FLOOR/PICKER\_GAP/REVEAL/FINE\_INERT
  byte-identical+CT (live-render deferred, low-risk — no seed populates a removable condition/the picker's
  behind a popover). Self-retracted a false positive (the +condition button has an `::after` 44px expander).
- ✅ **`run-coverage.ts` widgets bug FIXED** (`20b883e3e`) — seed `widgets` (the field read), widgets made
  required, dead field + bug-preserving assertions/suppressions dropped, full check green.
- ✅ **GLYPHSWEEP done** — square-glyph debt already paid; icon-seal doorways BUILD-NONE (only
  fillRule=evenodd boarded). See its own board rows below.
- [ ] **\[P3 taste, pre-existing — NOT from the graduated fixes]** the Map cell's lock glyph dangles
  slightly outside the rail frame's top-right edge (SIDE-EYE-RPG stumble). Low-priority polish.
- **⏳ CLIENT-SMALLS in flight (`a7a28c621`).** Item 1 premise REFINED: the `<speaker>` leak is NOT
  client-derived — the chat-list subtitle passes through server-computed `chat.lastMessagePreview`, and
  the fix is in KIT (`projectBodyForPreview` reusing the existing `speakerTagsToPlain`), which ALSO fixes
  `filter-chats.ts` search (same field). Approved the kit fence-cross (single home; a client strip would
  leave search dirty). Item 2 (tracker grant/revoke editor) confirmed OPEN + client-only — `patchSheet`
  already accepts `trackerGrants`/`trackerRevokes`, no server verb needed; building in `RpgCharacterDetail`.
- **⚑ OWNER DECISION PENDING (near-compact, non-blocking):** probes escape BOTH biome + eslint
  (`scripts/probes/**` ignored) — our code typechecks but isn't linted (3 dead `biome-ignore`s sat there).
  Options: (a) un-ignore `scripts/probes` in biome/eslint (biome's native unused-suppression rule then
  catches dead markers for free) · (b) a small gate flagging suppressions in unlinted dirs · (c) leave as
  throwaway diagnostic scratch. Orchestrator recommended (a) or (c). **This was the ONLY gate-able lesson
  from the session** — the rest (cold-check>warm, scope-the-absence-receipt, shared-value-owes-a-battery,
  ratifying-gate-two-receipts) are DOCTRINE/memory, not gates: the existing gates + battery caught every
  real regression; the failures were judgment/process. \[\[shared-value-change-owes-a-battery-not-static]]
- **✅ TOOLING-INVESTIGATE merged `b850dbb54`** (docs-only): populate-round prose census
  (`docs/design/prose-1-populate-census.md` — 7 slot candidates, 3 host-toast excluded) + prod-CLS
  lead (`prod-build-cls-investigation.md` — prod launcher EXISTS but :8788 held by the live dev
  stack; blocked on a prod-build window, dev 0.134 stands). **gate-ignore scanRoot: RULED
  UN-EXTENDABLE** — probed live, extending to scripts/ yields 12 FALSE findings (gate doc-comments
  describing the marker grammar have no literal-span fence like strings do); closing the scripts/
  inventory gap needs NEW structural info in the marker grammar, a design fork not a scanRoot tune.
  **→ CLOSED 2026-08-08 (FORGE #2 `fed99940f`, merged): the discriminator is NOT scanRoot-inclusion
  (that hypothesis was REJECTED — no-inline-types + no-raw-intl-time scan the gates dir, so their own
  prose stays red). Shipped the MENTION FENCE: a marker IS a `//` comment whose text BEGINS with the
  vocabulary; quotations/JSDoc are mentions (`pass.ts`, the one home, both sides). Also closed a LIVE
  suppression bypass (unanchored parse let a prose quote suppress a real finding). Plant matrix all 6
  post-fix; packages/tests inventory byte-unchanged; 17/17+3/3+2/2. `docs/design/gate-ignore-mention-fence.md`.
  VERIFIER dispatched on the load-bearing pass.ts change.)**
- **⚑ NEW BOARDED ROW (POLISH-CLUSTER find): wire CapabilityGate to resolve-failure.ts.** The same
  wrong-confident-cause sentence ("routing problem, not a missing connection") is ALSO hardcoded at
  `capability-gate.tsx:66` over `resolveChatCapability`, which can fail PRECONDITION_FAILED
  (DomainNoCredentialError = literally a missing credential — the claim INVERTED), NOT_FOUND, 500.
  The shared classifier lib landed tonight already owns the discrimination; wiring the deck was
  deferred (preset-editor-surface contested by FORGE + PROSE-GEOMETRY). 3-line change, quiet-tree.
- **✅ POLISH-CLUSTER merged `66969d228`** (14 files, 9/9 new assertions positive-control-proven):
  color-picker focus ring · readout skeleton shape-match (144px collapse fixed) · the `resolve-failure.ts`
  shared classifier (error arm keeps the routing verdict VERBATIM on BAD_REQUEST, withholds on
  NOT_FOUND/transport — F-02 ruling preserved) + Retry · tag voices/#808080 seed · config band gutter ·
  empty-slot chrome. **Rendered re-verify BATCHES with the FORGE#1 + PROSE-GEOMETRY preset-surface
  lens** (one side-eye over the whole preset/config fix train). Freed slot HELD (barrel-amputation +
  capability-gate follow-up both want a quiet/uncontested tree).
- **✅ TREE GREEN at `698a76f32` (train4 check PASS all stages).** FORGE#2 (mention-fence, `49b6e3620`)
  + GAP-FIX (EmptyState w-full fence, `4a01d2854`) + the conditional-expect fix merged & certified.
  **⚠ ORCHESTRATOR DISCIPLINE SLIP (owned):** I fire-and-forgot consolidated checks — DBANK-HOME's
  `train3-check` was dispatched and NEVER READ, so a `noConditionalExpect` lint error rode main until
  `forge2-check` caught it (a `.exit`-sweep found it). The law I quote lanes ("a finished check that
  sits unread = skipping it") — I broke it. Fixed; going forward EVERY check exit gets read. All other
  historical red `.exit` codes were intermediate states superseded by a green re-check before the next
  merge (verified by train4 covering the current tree).
- **✅ FORGE #1 (Actions-tab IA) MERGED `dcaf87bc1`** — per-kind delivery-truth readout (derived from
  LIVE assembly: nudges ride appendUserTurn not the marker), 6 collapsed bands + tab filter over 41
  extract rows, fork-eject fixed (drill id → store axis), human row labels, chip off rows; red-first
  ×2 + perf measured 87ms→0 long tasks + rendered snaps. Its MAX_FORMAT_STRING_LENGTH page-error was
  STALE HMR (exported at preset/index.ts:44; dev vite lagged the PROSE-GEO merge). **Batched
  preset/config side-eye `a528c629d6a4aa017`** covers FORGE#1 + POLISH + PROSE-GEOMETRY (the deferred
  preset-surface lens). **2 forge findings boarded:** (a) snap-isolated can't boot post-D135 without
  OWNER_HANDLES+CREDENTIALS_KEY in its env — a snap-stage propagation gap (tooling row); (b) the Prompt
  view's section drill has the SAME fork-eject class (local drill state) — the store-axis fix applies,
  out-of-scope follow-up.
- **✅ FORGE #3 (persona/character design) DELIVERED** `docs/design/persona-character-kind-substrate.md`.
  Phase D = kind-poly CAST (`CAST_KINDS`+`CAST_KIND_POLICY`, mirrors the message-identity collapse but
  needs NO stored column — cast kind is the stamp id-space); Phase C = `@orb/contracts/card-face`
  4-field substrate (wire limits measured identical; reference-equality one-home test). Sacred contract
  proven untouched (frozen HistoryMacroNames types). 3 premise-kills, 5 owner forks w/ defaults,
  8 rejected alternatives incl. reading-B's D131/D133 collision. **OWNER: read + rule the 5 forks;
  build lane (w/ stickler+security review) follows.** Reading-B stays dead.
- **⚑ GAP-AUDIT DELIVERED (owner catch — real): `docs/reviews/misc/2026-08-08-followup-gap-audit.md`.**
  132 agent reports read whole (2-pass: marker-grep + full report-tail), 222 noise files skipped;
  board coverage HIGH (most flags boarded/minted/banked/fixed-by-a-later-lane, incl. a cluster of
  scary verifier refutations all since-fixed). **6 GENUINE GAPS found:**
  - **GAP-FIX lane `aa67f0c0d823dd667` (2 P1 UI regressions + the class fence + 1 doc):** [P1]
    automation empty-state collapsed to a 63px word-per-line ribbon (DOG-POLISH P3-15 wrapped
    `@container` EmptyState in a centering Stack → width 0) · [P1/P2] group-draft MOBILE topbar names
    only participant 1 (the `86a1736bc` desktop fix never reached the phone, `chats-selection-title.ts:37`
    contradicts its own header) · [FENCE, do-it-right-once] the CLASS — a re-parent silently narrows a
    component no CT width-asserts → an EmptyState w-full primitive floor + a rendered-width CT · [doc]
    `names.ts:2` header contradicts code.
  - **BOARDED (low, not in the fix lane):** [LOW] phone notification sheet never marks read
    (`notification-bell.tsx:155` mount-time markAllRead comment is FALSE — no useEffect; board captured
    the phone unread *indicator*, not this *clear* bug) · [HEADS-UP] `ashen-spire.jsonl`'s 26 marked
    lines are unexercised by the canon-identity seed test (a seed-coverage add).
  - Audit's stated residual risk: a follow-up flagged ONLY mid-transcript via SendMessage (not restated
    in the final report) — the one class the report-tail method can't catch.
- **⚡ REFINERY R0 DISPATCHED (forge `a91b702e2d9ae545c`) — SEQUENCING FIX.** Owner signed off on the
  refinery build; kickoff was wrongly gated behind the push. The push is origin-publish, NOT a build
  dependency — the only real precondition (the NL→schema design) landed (`299fdc2d5` + shell audit
  `8c6a16a72`). R0 = contracts+db foundation (F1 new domain/refinery · F3 fixed payloads · F4 stage
  enums · F5 card-fields v1; verify the pre-built scaffold, add only what's missing, DB baseline
  squash). Security-executor MANDATORY pre-R1 (untrusted-card→LLM→write-back). R1+ waits for R0's review.
- **⚑ CONTAINERIZE → BUILD (owner: "put a forge on it… after having it look at the most recent docker
  capabilities + best practices, fully modern and proper").** Pipeline (forge has no web tools):
  (1) WEB-RESEARCH lane `abeb1d71601a7c8d7` → `docs/design/docker-modern-practices-research.md`
  (current 2026 Docker/BuildKit/compose-v2 practice: cache+secret mounts, CUDA/node base, GPU device
  reservation syntax, healthcheck start_period, non-root, PID-1 reaping, SBOM/provenance — cited);
  (2) FORGE builds the real Dockerfile(s) + docker-compose + .dockerignore against the SPEC
  (`containerize-prod-image-spec.md`, 2-profile: all-in-one fleet default + slim) + the research, plus
  the profile-2 code changes (VLLM_ENGINE_HOST at engine-url.ts + egress.ts, GPU-detect-under-posture
  fix); (3) SECURITY-EXECUTOR reviews the §8 surface (secrets, auth-mode env, expose-only /
  AUTH_FALLBACK=deny, the AUTHFIX-2 Host-mint control) before done. LIMIT: a lane cannot `docker build`
  the GPU image in a worktree — image build+run is the owner's live-infra step (sequenced w/ the
  pentest cage), the lane proves the code changes + authors best-practice-correct Docker files.
- **⚑ FOLLOW-UP CAPTURE (owner caught it 2026-08-08: closed lanes had attached follow-ups I relayed
  but never BOARDED — the "looked handled" class). Dropped rows now boarded:**
  - **guided-prompt cap** — `guidedActionSchema.prompt` is uncapped `z.string()` reaching BOTH DB and the
    model WIRE (`preset/index.ts:333`, the lone authored-text field with no ceiling; siblings prose 4000
    / format 10000 / section 100000). PROSE-GEOMETRY gave it `maxRows` (geometry) but REFUSED to invent
    a schema cap (would refuse text the wire accepts). Recon rec: a shared `MAX_INJECTION_TEMPLATE_LENGTH`
    (=10000) referenced by formatStrings + guidedActions + the UI maxLength. Owner-decision row (in the
    tag-contract options doc; now a board row too).
  - **databank pagination live-drive** — DBANK-HOME proved reach+geometry via a keyset-contract stub, NOT
    a live SQL keyset under a real shell with a >100-doc bank. Cheap verification-completeness add.
  - **recordChatTurn spy widened** — EXTRACTION's `tests/server/entry/compose/rpg.int.test.ts` now
    captures `systemPrompt.static` on EVERY api (was agent-sdk only) — the cheap tool round's system
    prompt (the 2nd write surface) is now assertable; any sibling lane touching that spy inherits the
    extra entries. Heads-up, not an action.
  - **paged-list `.find(` sweep** — DBANK-HOME's lesson: a list surface that gains pagination silently
    breaks every sibling that resolved an entity by `.find()` over its list page (the context-body
    "not-in-list ⇒ deleted" bug it fixed in-lane). A tree-sweep for OTHER paged surfaces with the same
    shape is an un-run follow-up. Durable lesson banked to memory.
- **⚑ BENCHED-SET RE-POSE (owner: "investigate each in code+docs, options, mark the forward-thinking /
  do-it-right-once arm, then repose all"):** 4 read-only recon lanes writing options docs —
  INV persona/nudge/{{note}} (`a15d52ec2e1d40fb0`) · INV config-rail/dup/json-card (`acbfc1319e411ad29`) ·
  INV tag-calls/guided-cap (`a607a60a5ca796876`) · INV containerize/entry-exports/AGENT-1
  (`a303ee0f5e683eeb8`) → `docs/design/parked-options-*.md`. Already-investigated tonight (fold from
  source): refinery F-N forks (NL→schema doc) · 3 D62 deltas (shell audit §10) · home-tile promotion
  (dbank-home analysis). SYNTHESIS → one grounded owner decision-sitting, each option-set with the
  forward-thinking arm flagged Recommended.
- **⚑ SMALLS BATCHED OUT (2026-08-08, owner: "send the undeployed + small stuff in batches").** Two
  collision-free lanes dispatched (the load ceiling held at the live client-fix lanes — no 6th/7th
  gate-heavy lane stacked):
  - **DBANK-HOME** (`a2740c83073edd2ce`, executor): Row 1 databank pagination BUILDING (character.list
    keyset precedent + ruled client-filter search arm). Row 2 (home tile promotion) → ESCALATED TO
    OWNER as a design row, NOT built: the executor proved both naive arms are DEFECTS (CSS-order =
    WCAG 2.4.3 focus divergence; data-driven-after-read reopens the measured F14 CLS), so the only
    correct arm is a new store + orderHomeTiles signature change + demote-on-resolve UX — architecture
    with a live fork, and the tile's attention chips ALREADY landed tonight as in-place deep-link
    buttons. Analysis → `docs/design/home-tile-promotion.md`; owner rules WHETHER (build the store arm
    / drop it — the in-place chips may already cover it).
  - **TOOLING-INVESTIGATE** (`a867e56c60b9c0c21`, mech): BUILD the scripts/ gate-ignore inventory gap
    (extend scanRoot + the literal-span exclusion) · INVESTIGATE the populate-round prose census
    (→ docs/design/prose-1-populate-census.md, enumerate don't build) · INVESTIGATE the prod-build CLS
    lead (confirm/refute the 0.134 dev artifact against a prod build if cheap, else report blocked).
  - **HELD (not batched — need a quiet tree or an owner ruling):** the 135-name barrel amputation
    (per-symbol verdicts, contracts/rpg locked-shape data — a careful lane on a drained tree) ·
    `--include-entry-exports` (whole-repo posture, owner-visible noise/value tradeoff — a ruling, not
    a default).
- **⚑ GAP-CLOSURE LENS REPORTED: SHIP WITH FIXES — 3 P1 · 10 P2 · 7 P3** (the five previously-unlensed
  surfaces; 1 own-retraction — same-tick reads vs React commit). HELD SURFACE: the preset ACTIONS TAB
  ("a database dump wearing a UI" at 66 rows) — [P1] the readout states a FALSE DELIVERY PATH for all
  51 teach/extract rows · snake_case row titles · 40-row flat group · false teaching sentence ·
  fork-and-EJECT on editing the built-in Default · 131ms tab frame. PROSE editors: [P1] the over-cap
  refusal renders ~900px below the fold (uncapped field-sizing) · [P2] "Saved" while refusing · three
  cap regimes one signalled. [P1] colour-picker native input has no focus ring. TRANSWEEP verified
  clean live; the readout pending-arm lie confirmed dead; contrast uniformly strong; CONFIG-FINAL's
  claims held exactly. **THREE FIX LANES DISPATCHED: FORGE #1** (`ae00d9bbd323b47b2`, its maiden
  lane — the Actions-tab IA redesign, think-then-build) · PROSE-GEOMETRY (`ac5d3f3534e347fa9`) ·
  POLISH-CLUSTER (`adb081a0dc3e98a4c`). **The conditional push word now waits behind these + ROW-27
  → battery → push.**
- **✅ `forge` AGENT MINTED** (`7c4e4ab84`, owner-ordered): frontier thinker-then-builder, fable @
  MAX effort (xhigh-audit caveat recorded in-def; max is bet on design-before-edit, not review),
  doctrine + recon standards + the night's build laws baked. Routing: design-risk work only;
  security never.
- **✅ NL→SCHEMA DESIGN + SHELL AUDIT DELIVERED** (`299fdc2d5` + `8c6a16a72`): engine tier ALREADY
  BUILT both directions (liftJsonSchema ↔ projectJsonSchema, golden-proven); SF0-SF3 rides R0-R3;
  §10 shell-conformance — sessions = the LIST selection (one-shell rule joins), CONTEXT = the
  cross-run ledger (anti-echo tested), 3 D62 deltas NAMED FOR OWNER. Refinery kickoff after push.
- **⚑ OWNER RULINGS (2026-08-08 ~04:00, pre-sleep batch):**
  - **PUSH: conditional word GRANTED** — after the gap-closure side-eye lands (+ any fix legs) and a
    fresh battery greens, PUSH origin. The word is THIS sequence's; a red resets to ask-again.
  - **REFINERY: BUILD with the study's recommended forks** (F1 new domain/refinery · F2
    summarize-role v1 + `refine` escalation path · F3 fixed payloads w/ NL→schema as the
    extensibility arm · F4 stage-mode enums · F5 card-fields v1). R0 starts AFTER the NL→schema
    design lands (designed together); security-executor pass MANDATORY pre-R1. Sequence: gap-lens →
    battery → push → refinery kickoff.
  - **Duplication class (landing cards + New-book): DEFERRED** (owner sleepy) — stays parked.
  - **Row 27: WIRE IT** — RPG_STATE_TRACKING_GUIDE becomes a live prose slot on the write-surface
    prompts; lane dispatched.
- **═══ ⚑ NIGHT SEALED (2026-08-08 ~03:30) — CERTIFIED GREEN AT `6494c540e`, 107 AHEAD OF ORIGIN, NOT PUSHED (owner word) ═══**
  **The full `verify --push` battery: PASS, ALL stages clean** — incl. tests:node (whole vitest+CT),
  e2e-smoke, cpd, parity. First run had ONE red: the orphan ratchet catching 13 contracts/rpg
  orphans the barrel conversion made visible (tagged @public w/ surface-naming reasons, the ruled
  arm; delete verdicts stay with the amputation follow-up). ZERO stale coupled fixtures — the
  in-lane literal-sweep briefing held on every value-changing lane.
  **Buildable board: DRAINED.** Tonight's merged+graduated train (every one under a fresh lens):
  CLIENT-SMALLS · TRACKERGATE(+pins) · NODE26-GATE(+fix) · RE-HOME(+preview-fidelity) · PORTR6 ·
  EXTRACTION (PROSE-1 COMPLETE) · TOAST ×3 legs · CONFIG ×4 legs (closed) · W4-BURNDOWN ·
  SMALLS ×3 + GATE-IGNORE-CLOSE (the class ENFORCED, 197 gates) · DBANK S3+fix+micro (I-2 CLOSED) ·
  MEMBERS-CHIP · TAG-WANTS(premise-dead+coverage) · TRANSWEEP · PROSE-LIMIT · BARREL · ORPHAN-TAGS.
  Plus: ceremony (ledger through D136) · the card-refinery port study · 6+ stale rows struck · the
  dev stack restarted.
  **AWAITS THE OWNER (morning pile):** the push word (fresh battery green is banked at `6494c540e` but
  the next push wants its own word per standing law) · card-refinery forks F1-F7 + build go/no-go ·
  the landing-cards + "New book" duplication ruling (one combined question) · ctx-tab-strip
  tooltip-at-coarse · nudge texts · `{{note}}` posture · presets-into-rail · JSON-card export ·
  row-27 wire-or-delete · tag drag-cap (ruled leave-as-is; MoveControls note recorded) · AGENT-1 ·
  containerize (sequenced post-board).
  **New rows tonight's honesty minted (unbuilt, boarded):** databank pagination (the 100-doc
  ceiling) · home useOrder follow-up · the 136-name barrel amputation worklist
  (docs/barrel-star-reexport-residue.md) · --include-entry-exports posture lane · scripts/
  gate-ignore inventory gap · E2E_LIVE on the next push window · prod-build CLS confirmation lead.
- **⚑ ROSTER REFRESH (2026-08-08, later — 5 live after the full-board audit the owner ordered):**
  - ✅ **TRACKERGATE merged `a67cf44e9` + check PASS + verifier CONFIRMED** (own red-first on pre-fix
    source; COMPLETE writer sweep of the FIELD — all 6 sheet-blob writers accounted, bundle-restore is
    no-escalation since the importer hosts the fresh chat). Tiny PIN LEG in flight on the warm agent
    (2 probe-proven unpinned edges: member empty-array refusal + character-ref-with-grants). Graduates
    on that landing.
  - ✅ **NODE26 FIX LEG merged `5d45f8b3e`** (body-scoped reject test — the concise-body trap handled;
    globalThis + method-form blind spots closed; 3 mustFlag + 2 mustPass pins). Original refuting
    verifier re-dispatched to CLOSE ITS OWN FINDING (its exact receipt + the concise-body regression
    check). Check running.
  - ✅➡️ **RE-HOME merged `61c9ee6c4`** (30 files; check PASS) — config.prose spine DELETED total (incl.
    dead `PROSE_HOMES.game`, pinned), preset `promptConfig.prose` threaded (GatherTurnContextArgs),
    11 slots render under new `teach` TEMPLATE_KIND "Game teaches" (contract row per slot — the tab
    walks TEMPLATE_DEFS, not slot ids; ≤17-char label grammar; memory banked). **Verifier
    `a6838f0af87a22dc6`: CONFIRMED on deletion/re-thread/byte-identity/fork-security (copy-on-write of
    the system default closes the shared-preset arm — STRONGER than the old blank) — 1 REFUTED:
    PREVIEW FIDELITY regressed** — turn runs `resolvePresetOverride` (GM redirect, turn.ts:530),
    `resolvePreviewInputs` never does → host-authored teach shows the DEFAULT on previewAssembly while
    the turn ships the override (pre-merge one storage served both). Broader unfaithfulness
    (formatStrings/framings/sections on game-chat previews) is PRE-EXISTING. **FIX LEG in flight on the
    warm lane: the GENERAL fix** — explicit editor presetOverride keeps its meaning; absent it, preview
    runs the same GM redirect as the turn (fixes the whole class); pin at the REAL seam (the existing
    test stubs resolveForeignInputs and is blind), red-first. Also: lane's reported test counts didn't
    reproduce (all green, but counts weren't read off the runs — report-hygiene flag); the one-merge-
    window config.prose data drop is sanctioned NO-LEGACY, recorded.
  - ✅➡️ **INFRA-WARN-DEAF side-eye REPORTED: SHIP WITH FIXES** — plumbing held under attack (once-per-
    event ×3 layers · exhaustive code map w/ assertNever · emit-before-terminal ordering all praised);
    the RENDERED surface has 3 P1s: toast covers the Send button 94% at turn-terminal (click swallowed) ·
    close ✕ drawn over the copy (26px overlap, every toast in the app) · copy says "direct/BYOK" which
    exists NOWHERE in the UI (zero user-facing hits). +3 P2 (no warn identity · 5s dismiss for 3 lines ·
    aria-hidden+tabindex close, h2-outline) +2 P3. CORRECTION: the map carries TWO codes not one
    (custom_parameters_ignored + image_edit_dropped). Caveat banked: no client-side coalescing (server
    dedupes; same code ×3 would stack). Receipts `reports/snaps/` + `reports/scratch-ct/`.
    **TOAST-FIX lane DISPATCHED** (`ac60e5cd15326dfc0`, fix-ALL-findings): widen Notify to
    {title,description?,action?,type} (collapses 5 findings) + 2 primitive geometry fixes + real
    connection-label copy + warn identity + ARIA. Side-eye re-verify follows.
  - ⏳ **CEREMONY batch** (`a2bb3d2f493e20956`, mech, docs-only fence) — mint D133/D134 from the two
    security drafts + the D129(G) both-gates wording amendment + enumeration check through D134.
  - ⏳ **W4-BURNDOWN** (`a97343d5655d5a35c`) — W4.5 withResolvers ×7 + W4.2 toSorted (115 sites
    re-swept). RULED mid-run: convert all 4 rpg-named sites (no real collision with re-home — my
    directory fence was drawn from a stale map); SPREAD-SORT arm = option (a) syntactic-provable only
    (the pure-AST harness cannot type — recorded law), honest catch-rate report, fallback to
    deferred+truth-repaired header if decorative.
  - **Stale rows struck this audit:** REGX2 checkbox · preview-fidelity · tracker editor ·
    import-user-settings guard · HAND-EDIT-VS-FLUSH (graduated leg 4) · STATLAS leg 2 (landed) —
    each now says so at its row. Dogfood campaign: its doc says **CLOSED 2026-08-08 dawn**.
  - **Queue for open slots:** ceremony batch (D133/D134 + D129(G) amendment) · config/databank/regex
    320px side-eye sweep (I-3 tail) · smalls batch (fork.ts stale comment · no-test-fabrication
    baseline regen · readout-parts flash · CapabilityGate pending arm · field-reachability `.ok` ·
    R5b(a) verify) · extraction seam (behind re-home) · databank S3 · barrel root-fix (quiet tree) ·
    tag wants #1/#2. **Battery (no push — owner ruling) when the train drains.**
- **⚑ PRIOR ROSTER (2026-08-08 — 2 GRADUATED+torn down, 1 under lens, 1 in flight):**
  - ✅ **`CLIENT-SMALLS` FULLY GRADUATED, worktree torn down.** Main merge `25a551366` (kit
    `projectBodyForPreview` → `speakerTagsToPlain` flatten, red-first proven; new host-only tracker
    grant/revoke editor `rpg-tracker-grants.tsx`) + P3 fix leg `77ae00db6` (aria-describedby outcome
    wiring + `title` on truncating label, planted-positive-control proven). Receipts: consolidated
    check PASS ×2 · verifier `a3d64d2bb4af621c8` CONFIRMED both claims (cold re-runs 75/75, 109/109) ·
    side-eye `a035aaf9715d1cd7d` SHIP, then RE-VERIFY **both P3 findings CLOSED** (computed accessible
    description incl. the settle-flip; per-row id uniqueness stress-passed; long-label ellipsis+title
    proven at 320px). 480px badge-column decline RATIFIED by side-eye (tokens-only; reasoning in
    `docs/client-smalls-lane.md`). Lane notes there too.
    **⚠ VERIFIER FIND (pre-existing, NOT that diff — queued security row):** the host-only invariant on
    tracker exceptions is UI-ONLY. Server `mergeSheet` (`packages/server/src/domain/rpg/verbs/patch-sheet.ts:60-61`)
    applies `trackerGrants`/`trackerRevokes` from ANY patch, and `assertOwnUserRef` (`guard.ts:98-105`)
    lets a MEMBER write their own user-ref sheet → member can self-grant/self-revoke, bypassing "grants
    are the host's call". Game-integrity, not cross-tenant. **Fix = host-only gate on those two fields at
    the server write boundary → security-executor lane, QUEUED BEHIND RPG-PROSE (fence: domain/rpg).**
  - ✅➡️ **`NODE26-GATE` MERGED — under verifier lens.** Commit `041b41c9d` merged as **`5d65bd961`**:
    NEW gate `platform-spellings` (node-26 §8 ADOPT/AVOID), scoped `packages/**` per the
    zod-modern-spellings precedent + §4.1; arms SLEEP (client/ui browser carve-out, timeout-reject-race
    excluded) + ESCAPE-MINT (name-arm only — the char-class heuristic was built, measured at **27 false
    positives**, and dropped). Census 195→196 (`enforcement-registry-parity` reconciles);
    `__g_platspell` anti-drift fixture; gate-conformance 5/5 branch-side. **Two W4 sub-waves the program
    doc implied "merged" NEVER landed** — W4.5 withResolvers (7 live sites) + W4.2 toSorted (\~40 sites,
    type-judgment): arms DEFERRED pending-not-dropped, burn-down lane brief at
    `docs/design/node-26-w4-residual-burndown.md`. Consolidated train check (incl. this + RPG-PROSE +
    the `984a1ece6` docs:format fixup for its Active-Gates edit): **PASS all stages**.
    **Verifier `a1cb70df920e07585`: 4/5 CONFIRMED, 1 REFUTED** — reach probe fired both arms (+2
    unclaimed shapes), carve-out exactly client/ui, zero-FP + all ex-FP sites genuinely legit, census
    196 + anti-drift structurally forced, deferral docs honest w/ 4-of-7 W4.5 sites spot-verified. THE
    REFUTED: **the reject-race exclusion is degenerate** (`platform-spellings.ts:113-116` counts the
    param's own declaration node, so `(resolve, reject) => setTimeout(resolve, ms)` with UNUSED reject
    passes silently, contradicting the gate's own header). Live tree clean (all 5 two-param setTimeout
    sites are genuine races) — the RATCHET has the hole, not the tree. **FIX LEG IN FLIGHT on the warm
    lane agent**: body-scoped ident sweep + a mustFlag unused-second-param row; 2 lower-severity blind
    spots (globalThis.setTimeout, method-form escape-mint) fix-or-document. Gotcha banked: check-gates +
    gate-conformance live in `--project integration-serial`, NOT `integration`. Worktree stands.
    Durable lesson in memory `ratifying-gate-owes-two-receipts`.
  - ✅ **`RPG-PROSE` GRADUATED** — `fe9a16a0a` merged as **`fa8f944a0`** (24 files): reminder seam (rows
    1-10 + census-gap offstageHeader) → `contracts/src/rpg/prose.ts` (11 slots) + full `config.prose`
    storage spine; defaults are the old constants VERBATIM, reminder consts now derive from slots.
    **Verifier `aed1cca843965bc7d`: CONFIRMED all 5** — byte-identity proven by AST-diff against the
    real pre-migration git blobs (11/11 `===`, card example's leading `\n\n` intact); frozen-defaults
    cohort verified GENUINELY independently typed; keep-on-omit proven incl. the `.prefault({})` leak
    probe; macro split matches old consumers; 866 tests across the whole rpg+prose surface green + a
    literal sweep for coupled fixtures (none missed). EXTRACTION seam = follow-on
    (`docs/design/prose-1-rpg-extraction-followon.md`; row-27 owner-DEFERRED).
    **Verifier F1 (routed to the live security lane):** comment at `fork-game.ts:118-119` FALSELY claims
    `getConfigView` reads prose — NO read door exists anywhere; security lane told to reason from code +
    truth-repair the comment in its commit.
    **Verifier F2 (NEW ROW — prose read door):** `updateConfig.patch.prose` WRITES but nothing reads it
    back to a host (no getConfigView arm, no editor, zero client refs to rpg.\* slot ids) — "host-editable"
    is true at the verb tier only. Needs: host-gated `RpgConfigView.prose` read arm + the host editor
    surface (pairs naturally with the extraction follow-on's preview surface). NOT a defect in what
    shipped; the write door is safe (host-plane-stripped on fork, no member read path).
  - ✅ **`PORTR6-FIXTURE` GRADUATED, worktree torn down.** `f574ba39b` merged as `75250af9a`; verifier
    `a1f94d93f67dda984` CONFIRMED via MUTATION PROBE (swap-mutated the real remap
    `domain/import/verbs/import-chat-bundle.ts:186-189` in the lane worktree, restored — new test RED at
    the exact cross-link assertion, OLD single-turn test GREEN under both mutations). Re-check after the
    scratch-CT contamination cleared: PASS all stages.
- **⚑ OWNER RULING (2026-08-08, Nate live): "we are putting everything in presets" — RPG PROSE
  RE-HOMES to the preset `promptConfig.prose` plane.** The merged RPG-PROSE `config.prose` spine
  diverged from the standing per-PRESET ruling already recorded at
  `server/src/domain/chat/assembly/injections.ts:7-9` (prose is authored in the preset Templates tab).
  RE-HOME LANE (queued behind the security lane's domain/rpg commit): (1) DELETE the config.prose
  spine — rpg config schema field, `updateConfig.patch.prose` arm, fork strip arm, threading source;
  (2) thread the PRESET's `promptConfig.prose` into the rpg reminder/delta/macro-feed builders (same
  object assembly already resolves); (3) slots STAY in `contracts/rpg/prose.ts` → they surface in the
  preset Templates tab like every domain (lane must VERIFY the tab enumerates rpg slots); (4) F2
  (prose read door) DIES — the preset editor is the read door; (5) truth-repair the S3 spec section +
  `docs/design/prose-1-rpg-extraction-followon.md` to preset-home. Byte-identity guards (frozen
  cohort, field-reachability) must stay green — the re-home changes the OVERRIDE SOURCE, never the
  defaults. Security lane's Item 2 (strip review + fork-game comment repair) DROPPED as moot.
- **✅ W4-BURNDOWN GRADUATED, torn down.** Verifier `ad52e90d372a0b670` CONFIRMED all 4 claims:
  re-arm order A/B-executed identical across 4 scenarios; types/timing/error-paths preserved; zero
  resolver-captures remain (4 inline wrappers only); 94/115 toSorted exact w/ all 21 keeps inspected
  as genuine materializations; BOTH gate measurements independently reproduced (reach control fired
  8/8 DEFERRED on pre-W4 plants — confirming the 8th ref-capture site; recall control 14/21
  SPREAD-SORT, 0 FP); NODE26-FIX mechanics byte-identical (8 functions string-compared). 2 doc gaps
  (undeclared call-handed-resolver blind spot + a six-vs-eight prose drift) routed to the live SMALLS
  lane (same file). ~3,900 tests green across its runs.
- **✅ TOAST work-stream: ALL CLOSED — side-eye final verdict "It's finished."** Leg 2 merged
  `6c6d3f08f`, check PASS. Ring CLOSED (side-eye retracted its own near-false-negative — a same-tick
  read of the 220ms transition; settled values = ring token/2px/solid, elevation byte-intact; reduced-
  motion instant) · action 6.18:1 boundary + 7.06:1 label pixel-sampled · z 68>65 live single-frame
  receipt PAID (bell reproduced) · glyph grammar ratified incl. the deliberate glyph-less info ·
  mobile decline RATIFIED (tested for a better option, none exists) · viewport-F6 CLEARED on 4 grounds.
  Side-eye also retracted its phantom "§3 semantic scale" cite (it was a skill heuristic, not repo
  law — the doc truth-repair stands). FINAL MICRO-LEG in flight (2 one-liners: narrow transition-all
  so the ring is instant; delete the viewport outline-none landmine; + restate the residual comment
  structurally). Closes on that landing.
- **✅ EXTRACTION MERGED `5192c517b`** (21 files, +1893) — PROSE-1's rpg program is now COMPLETE minus
  row-27 (owner-deferred) + a populate-round follow-on census (post-dates e0b9816d, no rows yet;
  extraction-prompt.ts 30→3, compose/rpg.ts 16→8 residual baselines are THAT, not census misses).
  40 slots, token-splice (NO ProseSlotDef widening — §4.5's arm was resolveProseText's splice all
  along), precedence relocated #prose→#prose-slot (one home), `resolveChatPresetProse` op w/ the
  two-invocation-class law documented at the seam. **Verifier CONFIRMED all 6 — GRADUATED, torn
  down**: independent byte-identity repro (pre-tree materialized w/ its own node_modules, 14 combos,
  md5-IDENTICAL 145,116 bytes both sides + a live positive control) · one-home proven (2 hits, the
  2nd is the editor-footer question) · no cycle (depcruise 2813 clean) · class-law traced at all 5
  sites w/ LADDER EQUALITY (door and turn run the same resolvePromptConfigWithOverride, same
  principal by D19) · trust boundary sound (host-gated pre-model, owner-scoped read, lenient-id
  fall-through matches siblings) · token-drop warn-never-block pinned + independently reproduced.
  Its one red was CONFIG-FIX debris (shell.css format — fixed `2bdbed447`, whitespace-only, sync
  suite green). 4 non-blocking observations banked in its report; ONE boarded as a small:
  **PROSE_MAX_CHARS fail-open** — an over-4000-char override save heals to `{}` silently at the
  contract (designed self-heal), so the preset editor should surface the limit BEFORE save (a
  maxLength + counter on the Templates-tab field; small, client-only).
- **✅ CONFIG-FIX MERGED `5a7e2a060`** (34 files; 2049 CT · 870 unit · structure clean after fixing 7
  self-caught violations, none allowlisted). All 4 P1s + P2/P3 tail; TWO REFUSALS accepted as
  design-law-correct ("New book" ×2 is the DRAWN mock + a ratifying CT — parked beside the
  landing-cards OWNER item as one duplication ruling; X-7's destination preserved in EmptyState
  action). Mobile fix = a SIBLING reveal intent (revealContextPanelBesideContent), not a fold
  architecture. **Re-verify: SHIP — 15/16 CLOSED, both refusals RATIFIED** (side-eye withdrew its
  half of "New book"×2 after reading the mock+CT; "tapping Regex scripts now shows the regex
  scripts" = the phone win). FIX LEG in flight on the warm lane: 1 NEW P2 (the swatch sentence
  leaked into all 32 roster rows' aria-describedby + no separator — the documented subtitleLead
  seam trap) + 2 P3 (refinery's zero-children band wants the list-side :empty; Escape on the chat
  Details overlay). TASTE NOTE for owner: two CONTEXT arms now spend ~383px declining honestly —
  fine twice, worth noticing before a third joins.
  **⚑ DEV STACK RESTARTED (pre-authorized):** the running vite predated tonight's merges and
  white-screened on a stale HMR module graph. `pnpm stack restart dev` → up, healthz ok, client
  200. Lanes drove isolated stages throughout.
  3 lessons banked to memory (self-occluding reveals · dnd-kit frozen plugin closures ·
  ListRow.leading aria-hidden).
- **⏳ DATABANK S3 dispatched** (`afee5836975cedc36`) — the D-7 home tile per
  docs/design/databank-surface-spec.md; premise-re-verify first (3 prior databank premise-kills).
- **✅ DBANK-S3 MERGED `88508bb6e`** — the D-7 home tile (premise SURVIVED for once: no tile existed;
  spec row = "recent documents + an ingest-health line"). No new verb (rides databank.list's exact
  query key — free, shared invalidation, can't disagree on phase); health counts EMBEDDED passages;
  self-caught + fixed a real 12.5px chip overflow at 390px w/ planted control (and replaced a
  green-that-couldn't-fail fixture). **I-2 DATABANK: S1+S2+S3 all built.** Tile side-eye verdict:
  SHIP WITH FIXES — ARIA grammar "exemplary", deep-link/touch/focus praised; **FIX LEG on the warm
  lane**: 2 P1 (danger/soft Badge 4.28:1 — a SHARED-PRIMITIVE contrast defect every danger+soft
  badge inherits · "Add your first document" no-ops into a paraphrase of itself → the add-document
  dialog promotes to a shell MODAL SLOT) + 6 P2 (actionable aggregate chips · empty-state action
  dedup · two-homes-on-Home (jump row suppression when a tile exists) · the 100-cap census lie →
  "100+" · passages-vs-chunks units teach each other · conditional promotion above the jump grid when
  attention>0) + 3 P3. Side-eye killed its own CLS P1 with its own receipts (home-boot CLS 0.134 is
  a COLD DEV-MODULE artifact, NOT the tile — the F14 reservation is byte-exact; LEAD: confirm CLS
  against a prod build someday). Also: design-audit ran effectively clean and would have shipped
  all of this — it structurally cannot see state-dependent contrast.
- **✅ CONFIG-FIX-2 merged `6fddc5cca` + final side-eye pass: SHIP WITH FIXES → CONFIG-FINAL lane
  (`af99c962b2df8aeb1`).** Roster rows PASS (one id, one fact — "the shape other list panes should
  copy"). **ESCAPE FINDING CLEARED** — reproduced dismissing 3/3 both focus arms, raw store and
  resolved mode never diverged; the original read was the snap instrument's step-then-eval ordering
  (side-eye retracted its own near-finding). Remaining, ruled: [P2] the colour readout is ORPHAN text
  — wire via `Field description` so the CONTROL announces the value (+ copy trim kills the 430
  double-wrap) · [P3] the `:empty` band rule is DEAD CSS over an unreachable state w/ a fence the
  shell cannot produce — RULED arm (b): DROP it, record the measured truth, keep the working `:has()`
  chain · [layout] the World Info empty-state one-line box (both affordances stay — mock-ratified).
  Members-chip dead-control fix in flight separately (`a8b871a5f15e96f57`).
- **✅ I-2 DATABANK CLOSES — re-verify 7/7 Y under manufactured-state attack** (side-eye
  `afc03ded6ccd00510`; 3 own-retractions published incl. a pointer:none emulation trap that
  inflated touch geometry). Contrast held on 4 surfaces (4.64-5.71:1; margin 0.14 over floor —
  the badge CT pins it against theme drift). Suppression rule proven DISCRIMINATING (keyed on
  hidden count, not phase presence). Taste: "actually good." MICRO-LEG in flight
  (`a94fa02a65560a8a8`): chunks→passages at model:158 (the last user-facing "chunk") + the library
  header gets the same 100+ treatment + the sectionId/useVisible latent-incompat doc comment.
  **NEW BOARDED ROW — DATABANK PAGINATION:** no way to reach document 101 (list caps at 100, no
  cursor/load-more, search filters the same page client-side) — the "100+" honesty made a
  previously-invisible ceiling USER-VISIBLE; needs pagination or the link carrying the caveat.
  Its own lane, server+client.
- **✅ S3 TILE FIX-ALL applied `434790388`** (the lane amended its branch — SECOND amend tonight;
  recovered as the delta patch like RE-HOME. FUTURE LANE BRIEFS: stack commits, never amend — the
  original is already merged). All 11 findings: danger/soft tint /15→/8 = 4.66:1 measured (shared
  primitive, all six soft arms pinned by canvas-composite CTs — the palette suite can't see
  token-over-own-tint) · `addDocument` SHELL MODAL SLOT (ceremony started on Home finishes on the
  new document) · aggregates suppressed-when-visible + surviving chips are phase-filter deep-link
  BUTTONS (new databank-filter-store, D-5 non-reopening stated) · jump-row claim seam
  (`HomeTileContribution.sectionId`, H10 move to state/, only databank claims — nav-vs-data) ·
  "100+" limit honesty · N-of-M passages · Empty→warning · timestamps · aria group. P2-f refused
  w/ receipts (static order — home-owned useOrder follow-up boarded). 51 targeted CTs green on the
  applied delta; check + fresh side-eye re-verify in flight (`afc03ded6ccd00510`).
- **✅ PROSE-LIMIT merged `acb48dce6`** — over-cap prose no longer fails open: BOTH editors (class
  fix), MacroTextarea gains maxLength, house 0.8 counter, refuse-not-truncate w/ the refusal-lifts
  pin; red-first proved real over-cap WRITES on both surfaces. MEMBERS-CHIP merged `f8f572dad`
  (dead control below 64rem — red-first CT). CONFIG work-stream CLOSED at `fe8b798f3`.
- **⏳ TRANSITION-SWEEP in flight** (`a57b64b7243ee3439`) — transition-all on focusables, classify
  convert/leave/ambiguous, mechanism pins. **BARREL FIX next on the quiet tree, then the BATTERY
  (no push — owner word).**
- **✅ GATE-IGNORE CLASS CLOSED FOR REAL — ENFORCED, NOT SWEPT** (`00628ab03`, commit `f3d786862`).
  The 4 refuted gates converted (incl. no-inline-union-redecl's finalize→run move — a node report in
  finalize lands AFTER the inventory sweep) + 2 tripwire-found extras (query-freshness-coverage,
  density-tier's bogus column). NEW GATE `finding-overload-provenance` (196→**197**): matches the
  finding literal by SHAPE wherever built (why 3 call-site sweeps each missed members), 3 arms
  strongest-wins, two-sided `@finding-overload-ok` sanction grammar. First-run census EXHAUSTIVE:
  60 sites = 6 converted · 8 permanently sanctioned (incl. baseui ARM A + schema-banned-shapes —
  RATIFIED: converting would silently repeal recorded no-exemption rulings) · 52 in a shrink-only
  baseline w/ committed generator. Six-case probe incl. bare-marker double-fire + both baseline
  modes; GATE-AUTHORING §1 names its enforcer. **Boarded follow-up:** `@orb-gate-ignore` under
  `scripts/` is UNINVENTORIED (gate-ignore-inventory scanRoot is packages+tests by deliberate
  design; extending needs the literal-span exclusion extended to scripts/ — its own lane).
  **(CLOSED 2026-08-08 — the mention fence; see the TOOLING-INVESTIGATE row's closure note +
  docs/design/gate-ignore-mention-fence.md.)**
- **⚑ PRIOR GATE-IGNORE ARC (for the record):** "FULLY CLOSED" REFUTED — a 4th leg is in flight.** Verifier
  `a8fed8ee2276a7c1e` CONFIRMED the 14 converted gates (3 spot-checks incl. the over-exempt property
  at same-line granularity; kept-arms correctly §1-sanctioned; expect.token discriminates) but
  REFUTED the closure: **4 more gates** the closing sweep's regex missed (`no-vanity-alias` — proven
  behaviorally: a CORRECT marker double-reds · `chat-viewer-plane-canon-reads` ·
  `ui-skin-fragment-purity` · `no-inline-union-redecl`), found via a stronger tell (column DERIVED
  from a node). Two hand-sweeps have each missed members → the fix lane
  (`aa3ff1114d475654b`) converts the 4 AND builds a STRUCTURAL TRIPWIRE (self-test AST scan of gate
  sources w/ sanctioned-escape grammar) whose first run IS the exhaustive census of the ~171-call
  tail. The class closes when it's unmakeable, not re-swept.
- **✅ TAG-WANTS: PREMISE-DEAD, correctly refused** (merge `d759eb354`, tests-only) — ALL THREE
  ranked wants from the TAGDIG audit shipped 5 days ago in `fb3cf32af` (sort mode w/ used-default ·
  the inline autocomplete picker · three-state exclusion) + TAGUX hardening; the audit doc's status
  is STALE. Two brief clauses were ruled the other way pre-dispatch with measured receipts
  (exact-match ENDS suggesting; the popup was deleted for a P0). The lane closed the one real gap:
  the coarse OPTION-ROW touch floor had no proof (the suite's non-coverage note excused the
  component, true of the FIELD, false of the ROW) — class-level fix + positive control. Lesson: a
  non-coverage row must name the ELEMENT it excuses, not the component.
- **✅ SMALLS-1 MERGED `208abac21`** (10 files): gate-ignore now LIVE on platform-spellings (node
  overload + arm tokens + the `expect.token` conformance widening — probe matrix incl. SKIPPED-on-
  marker, dead-position still-RED, malformed still-RED; caught its own module-cache instrument lie) ·
  readout pending arm + CT · fabrication baseline regen 81→70 shrink-only-proven · fork.ts comment
  LIVE w/ both SHAs · field-reachability 4×.ok honest · R5b(a) verified-carried · CapabilityGate
  SKIPPED (already shipped `8ea171268`). **LEG 2 in flight (same worktree): zod-modern-spellings twin
  fix + a ONE-gate probe of the Finding-overload class (13 gates / 18 node-anchored sites — a LEAD;
  full burn-down decided on the probe's data).** Queued smalls: the `transition-all`-on-focusables
  repo sweep (toast micro-leg lesson — outline-* interpolates, rings fade in).
- **⚑ CONFIG-SWEEP (I-3 tail) REPORTED: SHIP WITH FIXES — 4 P1 · 9 P2 · 5 P3** (side-eye
  `a745bb9c0eab275f4`; receipts `reports/snaps/sweep-*.png`; SEEDED FIXTURE left in dev DB: 35 regex
  scripts / 32 tags / 6 databank docs, reusable). Root cause on most: a CONTEXT arm with nothing
  unique to say (duplicated headings desktop, full-screen occlusion mobile — the committed mock rules
  fold-into-CONTENT). P1s: list-row title aria-hidden unconditionally (non-clickable rows have NO
  accessible name — ui primitive, latent everywhere) · mobile field-drill overlay hides the thing just
  opened · picker unfiltered at 35→~400 rows · regex facet prints its name 4× (X-7 regression).
  WHAT HELD: keyboard reorder end-to-end (persisted, focus kept) · the 320px eye-column CT true live
  both pointer classes · touch floor CLEAN at coarse (0 real misses) · contrast clean everywhere
  measured · the >30 tag fork now honest. 3 self-retractions published (incl. its own truncated-string
  instrument). **CONFIG-FIX lane dispatched** (`a8d38549399606f89`, fix-ALL minus owner-gated).
  **SMALLS batch dispatched** (`a59b723b1575337e0`: fork.ts comment · baseline regen · readout-parts ·
  CapabilityGate pending arm · field-reachability .ok · R5b(a) verify · gate-ignore Finding-overload).
  **NEW OWNER ITEMS (parked to the pile):** (1) the Configuration LANDING duplicates the list verbatim
  once populated — collides with the 2026-08-03 "genuinely good teaching state" verdict; side-eye now
  disagrees at 32/35 counts; your call. (2) ctx-tab-strip icon-only at coarse: the recorded ruling's
  stated fallback is "icon + tooltip" but title-tooltips don't exist at coarse — the label is
  unreachable by any sighted means on the one width where the panel is the whole screen.
  (3) Tag-cap refinement note: the sweep found regex's MoveControls mechanism working above 30 in the
  SAME section — the cap ruling stands per tonight's word ("leave as-is"); recorded that the reuse-
  MoveControls question is narrower than the original 30-of-400 framing if ever revisited.
- ✅ W4-BURNDOWN consolidated check on merged main: **PASS all stages** (verifier lens still running).
- **✅ CARD-REFINERY PORT STUDY DELIVERED** → `docs/reviews/stickler/2026-08-08-card-refinery-port-study.md`.
  HEADLINE: orb PRE-BUILT the scaffold with zero producers — `refinerySignalsSchema` + `characters.refinery`
  column + 2 shipped null-guarded readouts + sealed-unused `DiffView`/`CompareBlocks` + the PLANNED
  refinery section (D70 founding member). The 18k ST extension → **~3.5-5k orb-native LOC**; ~10k of
  accidental ST-sandbox machinery dies on orb's rails (JSON-schema subsystem → projectJsonSchema+
  runStructuredTurn 0 lines; generation plumbing → providers 0; PNG writer → kit 0; IndexedDB → SQLite).
  5 PORT rows (P1 engine ~500-700 · P2 sessions · P3 field selection · P4 per-field apply ~75 ·
  P5 surface 1.5-2.5k) + 4 IMPROVE (incl. an orb-native batch score sweep the extension never had) +
  9 ALREADY-EXCEEDED + 7 SKIP. Sequencing R0-R4. **OWNER FORKS F1-F7 flagged w/ recs** (F1 new
  domain/refinery rec'd · F2 summarize-role v1 w/ `refine`-role escalation path · F3 fixed typed
  payloads · F4 stage-mode enums · F5 card-fields-only v1). **Security-executor pass MANDATORY pre-R1**
  (untrusted card → LLM → write-back). Prior law honored: refinery is design-first-when-scheduled
  (BUILD-QUEUE:414), D62 rules the surface anatomy. BUILD AWAITS THE OWNER'S WORD — parked to the pile
  as the study's output. (+2 observations: "Distill it in the Refinery" copy error
  `corpus-dossier-surface.tsx:69`; transient sibling probe debris, gone.)
- ✅ **W4-BURNDOWN MERGED `92fbdbca6`** (79 files: withResolvers ×8 incl. the ref-capture the brief
  missed · toSorted 94/115 type-checker-decided · DEFERRED + SPREAD-SORT arms LIVE, spread-sort
  syntactic w/ measured 14/21 recall + 100% precision, misses = mustPass declared limits). Conflict
  vs NODE26-FIX resolved by reset-to-main + re-apply-arms (fix mechanics byte-preserved, receipts
  re-run on merged tree: 9 plants fired / silents silent, 1223 node + conformance green). **Verifier
  IN FLIGHT** (behavioral preservation of the 4 riskiest barriers + arm-order in turn.ts + gate
  plants). Its flagged follow-up queued: platform-spellings uses the Finding overload → gate-ignore
  inert on all arms (smalls batch).
- **⚑ OWNER RULINGS, ROUND 2 (2026-08-08 night, pre-overnight):**
  - **Extraction-seam fork → RULED BY CRITERIA (owner: "cleanest, most forward-thinking, extensible,
    defensible, matches repo procedure" → orchestrator pick): ARM (a) — capture composed prose onto
    `RpgTurnContext` at turn time.** Rationale: matches the established connection/consent
    frozen-view precedent on that context; ONE resolution moment (turn resolves the GM preset once —
    reminder, extraction round, and preview all read the same frozen view; arm (b)'s live re-resolve
    is a second answer to one question, the divergence class this repo kills); preview fidelity falls
    out naturally (the fix-leg's inherited rule); no new injected op crossing the rpg↔chat seam;
    future per-turn preset-derived data rides the same capture. The extraction lane builds this.
  - **Member-visible bytes on `getActivePresetConfig` → ACCEPT, no strip** ("templates are
    shared-table stakes"): the GM preset's PromptConfig incl. prose is member-readable via the
    member-tier verb; the sacred steering NOTE stays host-plane. Matrix classification stands.
  - **Barrel root-fix (56 `export *`) → IN SCOPE TONIGHT**, as the last lane on the quiet tree
    before the battery.
  - **Tag ≤30 drag-cap at ~400 tags → LEAVE AS-IS** (deliberate cliff stands; I-4's flag closed).
- **✅ RE-HOME FULLY GRADUATED** — merge `61c9ee6c4` + preview-fidelity fix leg landed as patch
  `d808287ef` (the lane amended its branch; delta extracted `3e1cdb20e..ca188abe0`, applied, 99/99 on
  the pinned suite incl. the red-first-proven GM-redirect pin at the REAL seam; explicit editor
  override outranks redirect). ALL SEVEN preview surfaces now faithful (previewAssembly, peekPrompt,
  getShapeTrace, previewContextFit, previewSection, previewActionTemplates, getActivePresetConfig).
  Worktree torn down. Task #18 closed. The extraction follow-on doc carries the inherited rule:
  whatever seam extraction picks, the PREVIEW of that round resolves it the same way.
- **⚑ TOAST-FIX round 2 in flight** (warm `ac60e5cd15326dfc0`): re-verify closed 8/9 ("looks good
  now, genuinely") — P3-1 REGRESSED (shadow-overlay clobbers the ring's box-shadow layers +
  outline-none killed the UA fallback → real Tab paints NOTHING; fix = outline-based ring or
  ::before elevation, verify by REAL Tab + untruncated boxShadow — the side-eye's own truncated
  string nearly reported it green) · NEW P2 action button 1.03:1 invisible-as-control · NEW P3
  z-inversion (popover 65 over toast 60; §3 wants toast above) · residual filed: error/success
  glyphs via the warningIcon slot · assess: mobile toast over message-row reveals (fix-or-decline).
- **⚑ OWNER RULINGS (2026-08-08, Nate live):**
  - **PUSHES HELD tonight** — even on a green battery. The train-drain `verify --push` battery still
    RUNS for verification; origin stays un-pushed until a fresh word on a later day.
  - ~~**Row 27: DEFER**~~ **SUPERSEDED — owner ruled WIRE 2026-08-08, and it LANDED** (`bbb6364a2`:
    the guide is the `rpg.extract.stateTrackingGuide` slot on both write surfaces, ~160 tok/round
    measured; A/B quality measurement remains open). Original: leave dead-but-present; the extraction
    follow-on lane migrates around it and flags it again.
  - **Probe-lint: RESOLVED — leave `scripts/probes/**` as lint-free scratch** (bugs there are caught by
    running probes, not gates). Removed from the parked pile.
- **Owner-gated pile parked:** nudge texts · presets-into-rail · JSON-card export · `{{note}}` posture ·
  persona=character · AGENT-1 · templating fork (rows 53-73) · SUMMARIZE-SUB capability · fillRule probe.
- ✅ **TEMPLATE-UNIFY merged** (`6d7867401`, check 14/14) — row 49 slotted; (b) unification COMPLETE.
- ✅ **SMALLS-SERVER merged** (`58b1f9ce7`, check 14/14) — narrator room previews its CAST shape now
  (GroupConfig threaded into PreviewInputs, per-speaker byte-unchanged, red-first: narrator RED on old
  tree). Item 2 (import-guard) premise-dead. `prose-1-spec.md` §2.6 row-49 override-✗ truth-repaired.

**⚑ OVERNIGHT PROGRESS (2026-08-07, `128`-ahead) — merges + premise-kills:**

- ✅ **RENDERFIX MERGED** (`6807f5eb4`, consolidated check 14/14 after a post-merge biome fixup on a new
  CT-stories file). 5 side-eye findings fixed red-first + 314 CT; both geometry sites cleared
  GEOMETRICALLY. **It REFUSED my "delete the exemption rows" instruction correctly** — the gate's arm is
  STRUCTURAL (floorless-Button-in-wrap), the fix is GEOMETRIC, so the arm still fires; deleting would
  force the sizing remedy the owner declined. Rows kept as permanent; `Core-Enforcement-Active-Gates.md`
  gate row truth-repaired. **OWES a deferred side-eye graduation** (task #16 — run on the SETTLED rpg
  state after PTRGATE relocates its literals, not mid-churn).
- ✅ **IMPORT-SETTINGS-WRITE-GUARD → PREMISE-DEAD (not a gap).** The ruling assumed the import path
  skipped a write-guard the normal path runs. But `coherentRoutingPatch` only runs for
  `section==="routing"`, and routing is FENCED OUT of `SHARE_SAFE_SETTINGS_NAMESPACES` — no import can
  carry a routing value, the guard is unbuildable, and the read-side heal recovers undecidable-at-write
  source classes (not deletable). SMALLS-SERVER built only Item 1 (narrator preview).
- ✅ **TEMPLATING (b) UNIFICATION → ALREADY DONE (premise-kill of a board-inflated item).** The PROSE-1
  program (`269860bcf`) already unified it: registry mechanism, injection framings
  (`chat.injection.systemNote`/`.userNote`), continuation cue, the §3.2/§3.3 settings split. Contract
  suite 34/34. TEMPLATE-UNIFY builds ONLY the residual preset row 49 (`DEFAULT_COMPACT_INSTRUCTIONS`
  adapted slot). **Two pieces routed OUT (task #17):** the REWRITE\_TOGGLES/GREETING\_TRANSFORMS fragment
  bytes (rows 53-73 — client-composed via kit, a design FORK) and the rpg per-game teaches + extraction
  templates (rows 1-36/11-26 — no `rpg/prose.ts` yet, needs a dedicated rpg-server lane).
- ⚑ **PTRGATE dispatched** (`a989027e`) — the owner-ruled pointer-coarse-in-features gate + sweep of the
  literals RENDERFIX added, into the token/shell layer, behavior-preserving. **Glyph sweep (#13) waits
  behind it** (same rpg files).

**⚑ OVERNIGHT RECONCILIATION (2026-08-07) — ruled items verified against the tree, several already DONE:**

- [x] **DOCLAW-RPG-REFS → ALREADY DONE.** The carve-out is `Documentation-Law.md:114` (amended
  2026-08-07: "A comment STATES its constraint; a citation may accompany it, never replace it" — the
  \~4,066 §/D-refs sanctioned, bare pointers still a defect). The board row asking the orchestrator to
  "write the paragraph" was stale — it was already written. (Nearly wrote a duplicate; re-verify caught it.)
- [x] **ZOD-STAGE-D → DONE.** `z.hostname()` at `contracts/plugin/manifest.ts:62` (replaced the charset
  regex 2026-08-02); strip-observability referenced at `contracts/rpg/extraction.ts:558`. All three legs
  landed.
- [x] **MACRO-CAST-GUIDES → DONE.** `rpg/chat-ops/macro-view.ts:144-150` — the three RV-11 standing
  guides (appearance/outfit/thoughts) are CEL leaves DERIVED from `RPG_CAST_GUIDE_FIELDS`, reaching
  `{{expr::rpg.cast…}}` and the Scene tab's `CastGuides`. A fourth guide joins by tuple membership.
- **⏳ scout `aa56b683a841d3bd5` is reconciling the remaining smalls** (import-settings-write-guard ·
  readout-parts pending-flash · CapabilityGate flash · field-reachability `.ok` · respell dup ·
  per-actor tracker grant/revoke editor · countByBook twins · staging.ensure residual) — dispatch real
  lanes only for the ones it confirms OPEN.

**STILL BOARDED, NOT DISPATCHED:**

- [x] ~~The preview fidelity gap~~ — **STALE ROW: SMALLS-SERVER landed it** (`58b1f9ce7`, GroupConfig threaded into PreviewInputs, red-first). Struck 2026-08-08.
- [ ] `no-test-fabrication.baseline.json` is stale by \~15 rows tree-wide (deleted files, absorbed
  shrinks). A regen is a legitimate one-line cleanup but belongs to whoever owns the tree, not a lane.
- [ ] `fork.ts:154-155` stale comment — "no production writer yet" for the host-plane strip; `c197ce01b`
  landed the writers. Comment only; the strip itself is correct and PROVGATE's gate passes it.

## ═══ INITIATIVES ═══

### I-1 · STRUCTURED OUTPUT — ✅ the four projector defects are CLOSED; one owner item remains

**Landed under it:** RESYNC-OR (`d432ed51` — the structured role sends ONE FORCED TOOL CALL, the D112
vehicle; both rpg write paths now speak one dialect; probe matrix receipted) · STRICTFMT + CUSTOMBYO
(`35014699` — the kit stops INVENTING `strict`; it rides only when the caller sets it; vLLM pins it at
its own call site, the xgrammar lever) · the vendor-docs research (`docs/reviews/misc/2026-08-03-
structured-output-docs.md`).

✅ **CLOSED by SCHEMA (`c92b7aeb`):** all four unsupported keyword classes now stripped per-wire-subset
by one `scrubWireSchema` engine (four modes); `parallel_tool_calls:false` + a loud extra-call warn;
**refusals READ on both roles** (a refusal used to log `ok:true`). Absorbing three drifted hand-rolled
walkers found a live bug on the way: vLLM's wasn't position-aware, so a field NAMED `title`/`default`
was being deleted from the guided wire.
**Still true, deliberately:** `WireTool` (`infra/providers/contract/chat.ts`) has no `strict` field, so
the forced-tool vehicle carries no grammar-level enforcement — the D112 vehicle is a SHAPE contract,
not a compiled grammar. Say it that way; do not claim otherwise.
**Rides it:** `engine/chat-completion.ts` holds a SECOND `response_format` builder that never emitted
strict (SM7 flagged, deliberately not touched).
✅ **OWNER FORK CLOSED + SHIPPED (D126, lane STRUCTOUT `ffd3b4b4`).** Owner: *"i kinda wanted it to be
somethign we could swap to if we wanted or like a config thing etc. I dont want it to be seen as dead."*
The nullable-union arm is now **Settings › Admin › Structured output → "JSON-Schema shape"**, an
AppSettings-tier knob (DB override wins) reaching `scrubWireSchema` on the real request. **Default
unchanged.** Full receipts in the RECONCILIATION block at the foot of this file.
✅ **I-1's LAST ITEM RULED 2026-08-07 (question-tool): KEEP THE CURRENT DEFAULT** — the owner flips
the knob when he's felt it (vLLM already pins strict at its own call site regardless). I-1 has NO
open items. Blanket-vs-capability already ruled: KEEP BLANKET.

### I-2 · DATABANK — S1 shipped; S2's tail + S3 are the open work (no live lane)

**Landed:** DATABANK IS A LIVE RAIL SECTION (`b377ed8c` + merge `17f83015`) — the library, Add
upload/paste/link, phase chips, bounded ingest poll, owner-wide reindex in the band kebab, empty
states, auto-appears on Home via the registry; 199 CT + 110 unit; consolidated `pnpm check` 14/14 on
the merged result. D-1 `listGlobal` minted. Its rendered check caught a real defect and minted
`ListRow.subtitleLead`. **Owner CLOSED the section-vs-collection fork: Arm A (own rail section)
stands** — demotion stays a one-file edit if he ever wants it.

✅ **S2 IS FULLY SHIPPED — closed 2026-08-07 after a THIRD stale-databank-row premise-kill this
session.** All three "open S2" items landed in `2b4c2d24d` (Aug 3, "DBANK S2 — the per-chat documents
rack + the D85 visibility toggle"), verified full-file by lane DBANK-RACK (zero commits, correct
refusal): the per-chat rack + D-2 sources (`resolveChatDocumentSources` KEEPS provenance → source chips
in `chat-documents-section.tsx`), D-4 ordering (`ChatDocumentsSection` mounts after Injections in
`settings-context-tab.tsx`), and the freshness row (`listActiveForChat` on the `chatUpdated`
invalidation arm — spec §7's invalidation-map row, NOT an ingest-staleness indicator). D85 honored
end-to-end (member payload filters hidden rows). **The board carried all three as OPEN for 4 days** —
same disease as the D85 row: a "receipt of not-done" written from a grep, never re-checked against the
shipped commit. THREE databank rows premise-killed in one session (D85, the rack tail, and this).

✅ **THE D85 HOST VISIBILITY TOGGLE IS BUILT, END TO END — the row that called it "still unbuilt" was
WRONG and cost lane DATABANK-S2 its opening (premise-killed 2026-08-07, corroborated on main before
acceptance).** D85 homes the override in **CHAT, not databank**: verbatim, *"the chat's config owns it
(the fault-isolated `chats.metadata` sub-blob precedent, like `roomOverrides`)"*, and D91's close-out
already recorded it BUILT. Live receipts: write verb `chat/verbs/roster.ts:241`
`createSetChatDocumentVisibility` (`requireHost()` gate · strict `chatDocumentVisibilitySchema` parse ·
metadata-merge write · `chatUpdated` emit · audit logs `hiddenCount` ONLY, never doc ids — deliberate
anti-oracle) · enforcement `databank/persistence/scope.ts:76` `resolveChatHiddenDocumentIds` + `:152`
subtracting hidden from the union · contract `contracts/src/databank/index.ts:97-115` +
`contracts/src/chat/metadata.ts:200` · client `use-chat-document-mutations.ts:53` →
`chat-documents-section.tsx:53`. Orchestrator-verified: `pnpm ast refs
createSetChatDocumentVisibility` = ONE declaration.

**⚑ THE LESSON — AN ABSENCE RECEIPT MUST BE SCOPED TO WHERE THE LAW PUTS THE THING.** The row's
"receipt of not-done" enumerated `databank/verbs/` and found no visibility setter. **That absence was
REAL and proved NOTHING**, because D85 never put the setter there. An exhaustive listing of the wrong
directory reads exactly like proof. This is the evidence-method law's sharpest edge yet: a row citing
an absence owes not just its method but its SCOPE — and the scope is decided by the law, not by the
domain whose name is in the feature's title. **The lane was briefed to re-verify first and refused
correctly.**

✅ **AND THE RESIDUAL SWEEP CAME BACK CLEAN — D85's ENFORCEMENT AND ITS TRUST BOUNDARY ARE BOTH SOUND
(lane DATABANK-S2, zero commits, receipt-only — a successful lane).** No `docs/` deliverable; the
receipts are here.

- **D110 drift sweep: no leaking plane.** The vector (a plane reading the raw `chats.metadata`
  sub-blob instead of `resolveChatHiddenDocumentIds`) **does not exist** — `$X.databankVisibility` 0
  matches / ts scanned=3365, `$X["…"]` exactly 1 (the resolver itself), `$X?.…` 3 (all tests), tsx
  swept non-zero, positive control `$X.hidden` returned 9 real hits, corroborated by literal ripgrep
  agreeing on the same closed set. `resolveChatHiddenDocumentIds` has ONE declaration and two
  consumers (retrieval `scope.ts:152`, panel `list-active-for-chat.ts:30`).
- **All 11 document-table readers enumerated and classified:** retrieval honors it (single home) ·
  the panel shows the host the union with flags but **OMITS hidden rows from a member's payload**, so
  a name never leaks · unified `search()` hardcodes `{ownerId}` from the resolved principal ·
  `get`/`list`/`listAttachments` are owner-scoped `fetchOwned` and correctly INERT to `hidden` (the
  override is a per-chat RETRIEVAL switch, never an ownership hide) · portability export is
  `ownerId`-keyed.
- **Second auth layer found beyond the verb's `requireHost()`:** `chat/substrate/auth/matrix.ts:132`.
- **Trust boundary already pinned — nothing to add without duplicating:** non-host refusal
  (`roster.int.test.ts:190`) · malformed-id default-deny (`:196`) · set-semantics + sibling-blob
  survival (`:148`,`:176`) · override-changes-what-a-reader-sees, four directions
  (`scope.int.test.ts:37`) · corrupt-blob heals **fail-OPEN** (`:84`) · name-privacy asymmetry
  (`list-active-for-chat.int.test.ts:43`) · 10 client CTs asserting the MUTATION INPUT incl. a 320px
  eye-column geometry test.
- **Architectural note so no future lane files it as missing:** the S1 library rail correctly has NO
  visibility toggle — `hidden` is keyed by CHAT metadata and the rail is chat-less/owner-scoped, so
  there is nothing there to toggle.
- **Not covered (stated):** no floor run (zero diff; battery held the box) · no browser drive of the
  affordance (a side-eye question, not a leak question; already CT-locked at 320px) ·
  `tests/server/transport/cross-tenant-sweep.suite.int.test.ts`'s databank rows not audited in depth.
- **Tool lesson banked to memory** (\[\[ast-grep-property-read-has-three-shapes]]): `$X.foo`,
  `$X?.foo` and `$X["foo"]` are THREE different node kinds — a dot-only sweep reports a clean zero
  with a legitimate scanned count while optional-chained readers sit in the tree.
  **OPEN — S3:** unbuilt. D-7's real home tile still owed. Spec: `docs/design/databank-surface-spec.md`.

### I-3 · CONFIG WORKSPACE — ✅ the rail + the MOBILE tail are DONE; presets-into-rail is owner-timed

**Landed:** R1 the Configuration workspace + the `CollectionContribution` seam, tags + regex OFF
settings (`3769d4f9`, gate #175 collection-registry-completeness) · R2 world-info into the workspace,
rail back to 8 (`e7a86df1`) · CR0 gate #174 `section-factory-contribution-bundle` (makeChatsSection
refactored 4→1 in the gate's own landing commit) · NIGHTFIX, the combined side-eye's fix-all (`48f47f09`):
the CONTENT region's padding (the "looks unfinished" verdict killed at the region), the double
empty-state lie ×3, `actionsReserved` boolean→NUMBER (a row reserves what its LIST declares), narrator
rows say "Narrator", dialogue-hue de-collision, Prune confirm, `placement:[]` made legible ×3,
Find-pattern affordance, FACEFILT `aria-pressed`, theme cluster values + one vocabulary,
Settings›Personas contains personas, the 4-affordance ceiling.

**OPEN — the live SWEEP lane:** the side-eye's NOT-REACHED tail (tag context arm · the regex picker's
order split with drag + keyboard + >30 arm · the mobile & rail mock diffs) PLUS a fresh-eyes
hunt-and-FIX over config / databank / regex at 320px + mobile. Owner: "any bugs found can be fixed."
**⚑ OWNER-TIMED:** **presets stay OUT of the config rail until he feels it** (one array member,
forever, whenever he wants it). "Still not set on presets being their own thing" stands.

### I-4 · REGEX — the reshape is complete; the extras and one premise question are not

**Landed:** R1-R6 (`12cf0a8a` + `ff2aa8b4`) — first-class script library (owner-stamped + 4 FK
junctions, 19 verbs, tRPC all-PROBED), 3 embed carriers DEAD on one baseline regen, `regex` at
`PORTABLE_IMPORT_ORDER[5]`, lift/re-embed at the card seam, **DISPLAY tier ALIVE** (viewer-only default

- the HOST per-room broadcast toggle, viewer-last precedence), ORDER pins, 2211 node + 314 CT · REGPAR
  the paneside tester + ST disabled-POLARITY fix (`1a9687bf`) · REGORDER all four scope-order arms
  authorable (`e2d4087f`) · REGROSTER the attached-by rosters + `resolveVisibleRooms` (`6df02b16`) +
  its rename-freshness gap fixed direct-on-main (`930955e4`).
  **Receipt the portability cross-link held:** `PORTABLE_KINDS` in
  `packages/contracts/src/portability/index.ts` carries `"regex"` — REGEX did NOT become the next PORT-F1.

✅ **REGX2 LANDED (2026-08-07)** — bulk edit · the pipeline debugger · the per-script JSON door. **NOT regex
presets** (owner: "we made regex part of presets kinda" — the preset carrier already IS the named-set
mechanism); no preset arm was built.
· **BULK EDIT** — 3 batch verbs (`bulkSetScriptsEnabled` / `bulkSetScriptsGlobal` / `bulkRemoveScripts`),
each ONE owner-scoped statement with ONE audit + ONE `regexChanged`; foreign ids DROPPED, never thrown on
(the count is the same for "not yours" and "already gone", so a batch cannot probe ownership). Mode entry is
a new `CollectionContribution.bulkSelect` DATA field the config band renders (C-4: band chrome is the host's,
the bar and checkboxes are the owner's) — generalizes to tag/world-info, documented in the contract.
· **PIPELINE DEBUGGER** — a second section in the member editor ("In the pipeline"), NOT a new pane: the
workspace has three slots and no library-level tool slot, and minting one is a second chrome grammar. Sample

- leg in, the global tier's ordered run out with per-stage before/after, the subject marked in place, and the
  executor's own skip reason named per script. It DOES honour the run gates — the tester one section up
  deliberately does not, and both headers say so, because unifying them destroys whichever question loses.
  · **JSON DOOR** — `regex.exportScript` / `regex.importScriptFile`, both THIN ARMS over the bundle
  descriptor's own verbs (export shares its file projection; import IS `createImportRegexScript`).
  **⚑ SUPERSEDED RULING, recorded:** `lifecycle-portability.ts`'s regex cells said "O-2 class… no evidenced
  demand for sharing one script standalone" and `collection-contracts.ts` cited them; the owner's REGX2 ruling
  IS that demand, so both flipped to real `DoorSpec`s + `chrome:"band+kebab"` and both headers were
  truth-repaired in the same commit.
  **DEFERRED with a reason — bulk PLACEMENT add/remove.** `withDerivedTierFlags` (the owner-ratified X-1/X-2
  finding) derives the tier flags + `historyDepth` from a placement set at ONE **client** write boundary, so a
  server bulk placement verb would be a second derivation home. It unblocks when `deriveRegexTierFlags` lifts
  into `@orb/kit/regex` beside the masks it mirrors — boarded separately.
  **Rendered receipt (done ≠ rendered):** the bulk bar was verified BROKEN twice at the real 330px roster
  column before it shipped — five inline verbs clipped "Run everywhere" mid-word and pushed two verbs AND the
  clear button off-screen; three verbs + a kebab still ran clear 22px past the edge. Shipped shape is two
  inline verbs + one kebab (global pair + Delete), with a standing geometry pin asserting every control's box
  inside the bar's.
  ✅ **TAGSORT AUDITED + RULED (2026-08-03) — KEEP BUT NARROW. The owner's premise targeted a surface
  that never read the column.** He challenged manual tag order with *"this is an overall global tag manager
  across our entire lib"* — and the evidence says the surface he meant, the character-library folder-grouping
  sidebar (`features/character/lib/character-list-view.ts:52-74` `groupByTag`), **does not read `sortOrder`
  at all**: `RowTag` does not even carry the field, and groups sort by `name.localeCompare`. Same for pending
  tag suggestions (`character/persistence/queries.ts:270`, name only). So the objection is resolved by
  evidence, not by deleting anything.
  **Every reader (AST-confirmed, both languages scanned non-zero, grep-corroborated, zero disagreement):**
  `tag/persistence/queries.ts:39` `listOwnedTags` (`ORDER BY sortOrder IS NULL, sortOrder, name`) →
  `tag.listTagsWithUsage` · `character/persistence/queries.ts:387` `canonicalTagsFor` → every character
  summary's `tags` array · `tag/verbs/export.ts:17` (round-trip only, not a distinct decision). **No `.tsx`
  reads it** except the write hook.
  **Surfaces that can actually SEE it:** ONE primary — the tag-management collection rows
  (`features/tag/components/tag-collection-rows.tsx:75-81`, drag → `useSetTagOrder`), and ONE passive echo —
  tag-CHIP order on character cards (`character-card.tsx:75` + dossier + quick-picks), which render the
  server's array order with no client re-sort.
  **RULED:** keep `sortOrder`, its write verb and the sortable rows as-is — a real, bounded, actively-used
  affordance. **Do NOT extend it anywhere else** (not into `groupByTag`, not into suggestions); those already
  made the better call. Removal would cost only alphabetical-instead-of-curated on those two surfaces —
  survivable, but a real regression on a purpose-built UI, for no gain.
  **⚑ THE ONE THING THAT NEEDS THE OWNER'S EYES — the 30-of-400 ratio.** The drag arm is capped at ≤30 items
  (`COLLECTION_LARGE_GROUP`, `collection-contracts.ts:39`); above that the same order renders in a read-only
  `VirtualList` with NO drag affordance. At his stated \~400-tag scale that means **manual ordering is
  unreachable for \~92% of the library, while still silently deciding chip order on every character card.**
  That is not a bug and the cliff was a deliberate owner-flagged fork — but it is worth his explicit ruling
  now that the numbers are on the table.
  **Audit limits (stated):** packages outside server/client not exhaustively enumerated (none found);
  non-TS consumers (raw SQL/seed outside `db/src/schema`) not searched.
  ✅ **TAGDIG — the full tag-experience audit vs ST + neo (2026-08-03).** Report:
  `docs/reviews/misc/2026-08-03-tag-experience-audit.md` (gap register by theme, every `-l ts`/`-l tsx`
  sweep run in PAIRS with scanned-file counts; neo read via `git archive legacy-main` into scratchpad,
  never checked out; a false-negative self-corrected mid-audit — a bare-identifier pattern returned 0/0
  and looked like absence until `$X.folderType` found the real site).
  **Sort-by-most-used CONFIRMED CHEAP (S, zero server cost):** `listOwnedTagsWithUsage`
  (`domain/tag/persistence/queries.ts:288`) already returns `usage.total` in every payload the client
  renders — it is a client comparator + a mode `Select`, mirroring ST's `tag_sort_mode`.
  **RANKED WANTS:** (1) sort mode Alphabetical/Most-Used, default Most-Used — S · (2) **autocomplete on
  the tag-attach input** (`components/tag-picker-dialog.tsx` is a bare `Input` with NO suggestion list on
  BOTH neo and main) — S–M, the highest value-per-effort row: at \~400 tags it is what prevents
  duplicate-tag rot, and the data is already cached client-side · (3) tag EXCLUSION / three-state filter
  (ST has `toggleTagThreeState`/`FILTER_STATES.EXCLUDED`; **neither lineage ever built it**) — M, needs a
  new axis threaded through `LibraryFilters`/`filterByChips`. Past #3 is L and changes the browsing MODEL
  — separate owner decision, not a queued build.
  **WE ARE AHEAD OF ST in one place:** the pending-suggestion Accept/Reject review queue
  (`character-tag-suggestions.tsx` + `tag/verbs/list-pending-suggestions.ts`) plus the LLM auto-distill
  producer (`discovery/verbs/distill.ts`) — ST has no equivalent.
  **DELIBERATELY NOT COPIED (with reasons):** ST's DUAL tag lists (local organizing tags vs a separately
  authored "tags to embed" export field — a known confusion source in ST itself; our WYSIWYG
  accepted-tags-are-what-exports model is better) · a user-facing AND/OR toggle (ST hardcodes
  `const TAG_LOGIC_AND = true; // switch to false…` — config-via-source-edit; AND is the right default and
  per-tag exclusion covers the real "not this one" need).
  **⚑ OWNER TASTE CALLS:** standalone tag-only backup/restore button (REC skip) · import-time
  Ask/All/Existing/None vs our always-queue model (REC keep ours, it is strictly more capable — record as a
  deliberate divergence) · **whether Manual/`sortOrder` retires once Alphabetical/Most-Used ship**, given the
  ≤30 cap already makes it near-unreachable at \~400 tags · folder OPEN (collapsible, cheap) vs CLOSED
  drilldown (navigation-model change) — REC build OPEN, defer CLOSED.
  **Not covered (stated):** anti-troll import cap, non-English locale completeness, mobile/touch behaviour.
  **OPEN smalls:** "Untitled chat" in the regex rosters (REGROSTER's naming question) · X-16 edited-ago
  needs a `RegexScriptRow` timestamp (contracts + db — verified absent) · REGPAR's F6 residual (REASONING
  prints slot 4 but executes post-postProcess — unobservable; strict-fidelity is an owner nit).
  **⚑ OWNER-RULED CLOSED (record):** prompt-EPHEMERALITY — min/max DEPTH is a PROMPT-leg concern; DISPLAY
  needs none of it because we own the viewport. The D121-E depth drop stays dead for display; the depth
  knobs come back only WITH the prompt-build history leg, if that is ever built. REC (a)
  ACCEPT-AND-RENAME stands.

### I-5 · BRAND BURN-DOWN — ✅ CLOSED 2026-08-03 (verified against the tree 2026-08-07)

**Landed:** gate #176 `brand-in-name-position` (`35014699`) — positions DERIVED from `kit/ids`, zero
hardcoded paths, blindness tripwire, two-sided markers, position-NAMED escape
(`@foreign-id-ok(<position>): reason`), the six-case real-tree probe. 28 permanent foreign-wire markers
planted at landing (agent-sdk `sessionId` name collision · local-light HF `modelId` · plugin wire DTOs).

**✅ THE TRANSITION IS COMPLETE.** The gate's own header states it: the landing baseline (169 files /
374 sites) was **burned to `{}` on 2026-08-03** and the baseline + its generator were DELETED per the
declared terminal state. `scripts/check/gates/brand-in-name-position.baseline.json` does not exist; the
gate is a pure ratchet. **The board carried this as a live L-sized initiative for four days** — a row
written from the LANDING receipt and never re-checked against the tree, quoted as remaining work on
2026-08-07 before the owner challenged it. The evidence-method law, earning its keep again: a row that
cites a count owes a re-read before anyone plans around it.

**Residual, small and real:** `sessionId`→`sdkSessionId` remains a dissolving candidate among the 28
markers — a rename, not a burn-down.

### I-6 · PORTABILITY — ✅ CLOSED (R6 landed 2026-08-07, lane PORT-R6)

**Landed:** PORT (`87b3c826`) — F1 CLOSED (databank travels, real bundle round-trip), the
`lifecycle-portability` gate #173 (it caught `globalDocuments` unclassified WHILE BEING WRITTEN), the
R3 serde spine (8 families, envelope/decode/version-gate/emit exist ONCE), world-info doors +
`?format=png|json`, persona chrome re-homed, the O-3 merge-in-place flip (theme + tag restore-wins,
USER-VISIBLE).
**R6 LANDED (PORT-R6, D136):** the orb-native chat BUNDLE is now what an account backup carries
(`kit/serde/chat-bundle`, born on the R3 spine; the ST jsonl arm stays the SHARE/ST-import door and the
descriptor's import half accepts BOTH, routing on the file's own ENVELOPE). The planes that were
unportable by construction now travel: `chat_injections` · the `chat_tags` overlay · the room blob
(group config / room overrides / opening policy) · the per-chat variable + user-macro picks ·
star/archive/compaction · the per-swipe `tokensIn`/`variableDelta` · **the whole rpg campaign** (games ·
sheets · snapshots · journal · turn-tool-calls · checkpoints), re-anchored through a POSITIONAL remap
(`messages[i].variants[j]`) because no id survives a cross-box move. Proof: the P-8 fresh-box round trip
now seeds and asserts every one of them, including that each variant-keyed rpg plane comes back pointing
at the RIGHT restored variant. **`chat_tags`'s ACCEPTED-LOSSY row is DELETED** (the table moved into the
`chat` kind's carried set). **O-6 is DEAD, as ruled** — the import refuses a bundle naming no character
this account holds, names the handles it looked for, and writes nothing.
**STILL DEFERRED, with corrected end conditions (they were misfiled at R6):** `automation_rules` +
`global_variables` need their OWN portable family — a 12th kind with its own serde/verbs/descriptor/
import-order slot/doors — which the chat bundle structurally could not deliver. `plugins`/`plugin_kv`
stay RULED-OUT (installed code is not user data). Fork lineage (`parentChatId`) does not travel: it needs
a chat-level remap the delivery core (one `importFile` per file, no cross-file state) cannot express.
**⚑ OWNER ITEMS on this initiative:** ~~the absent-character transcript import policy~~ — **BUILT
2026-08-07 (D136(F)). RULED
2026-08-07 (question-tool, owner OVERRODE the characterless-chat rec): REJECT — "you shouldn't be
able to import a transcript without having a character selected." A character must be selected at
import; the characterless arm is dead, O-6's premise with it. R6 builds against this policy.** ·
the JSON-card export format (PORT's recommended home: `?format=png|json` on the existing character door) · F9's design fork
for the chat-anchored planes that are unportable by construction (rpg campaigns · injections · room
overrides · re-links; plus automation\_rules / global\_variables / plugins, which have no arm at all).

### I-7 · OBSERVABILITY — ✅ CLOSED (2026-08-03, lane OBSCLOSE)

**Landed:** OBS (`93e40fb1`) `addSpanEvent` wired across cache / retry / wake with trace-ring landing
proofs; the ratchet baseline is EMPTY. SM4 (`f46122ad`) the rpg round TRACED (`withRequestSpan` needs
`root: true` — a parented span never seals the ring), `provider.*` spans at `runRole` (all 9 role
dispatchers, so `providerDurationMs` finally lands), structured-retry `onRetry` injected.
**CLOSED by OBSCLOSE (`521b8343`):** all three named holes — `fireExpressionClassify`,
`fireRpgTurnAborted`, the post-turn memory pass — plus a FOURTH found in the same sweep
(`fireManagedCompaction`, identical fire-and-forget shape) now open their own DETACHED root
(`withRequestSpan(…, root:true)`, SM4's template). The rest of the file was swept: no other
outlives-the-request siblings (`markRpgDiceEligible` is sync; the bus fans don't outlive their
request). **The correctness find that mattered more than the spans:** memory + compaction `catch`
blocks SWALLOWED their error after warn+emit, so the new spans would have sealed `"ok"` on every
failure — an observability hole wearing observability's clothes. Both now rethrow (the outer
`.catch(() => undefined)` still absorbs). 7 landing proofs through the real trace ring
(`recentTraces`, driven from inside an outer request root, asserting rootName + requestId prefix +
status + `requestId !== OUTER`); 167 tests green across the three engine suites. Consolidated
`pnpm check` on the merged result: 14/14.

### I-8 · PROSE / NUDGE / PERSONA — built machinery waiting on the owner's voice

**Landed:** NARCOLOR (`136139fc`) — narrator coloring works for the first time ever (the render half
existed; the PRODUCE instruction never did). `narratorNudge` + `speakerTags` are PROSE-1 slots
(owner-editable data), `roundNudge` v1→v2, one tint producer, the tolerant line-start `Name:` parse
gated to narrator assistant rows. PERSONA R0-R4 (`c736ae8a` + D122) — the multi-human keyhole is
CLOSED. HCOPY (`d4aa40f9`) — the handoff copy arm end-to-end.
**⚑ OWNER VETO OWED — THE THREE NUDGE DEFAULT TEXTS, VERBATIM** in NARCOLOR's report (speakerTags v1 ·
narratorNudge v1 · roundNudge v2). `{{user}}` is deliberately absent (`macros:"none"` slots); a
`{{names}}`-style pre-sub token is small plumbing on his word.
**⚑ PARKED WITH ITS RULED DESIGN FLAVOR (owner-sacred, do not build):** mid-session persona-change
linkage for rpg state. Owner's reasoning verbatim: *"if you form relations with NPCs with persona A and
then swap to persona B, all those keyed things will now point to persona B even though they haven't
done anything — the same debacle as persona pin and why we made it."* The ruled answer whenever it
unparks: **PERSONA-PIN SEMANTICS applied to rpg-lite state tracking** — relations / keyed state PIN to
the persona they were formed under; a swap opens new/parallel context, never a silent re-point.
Recast-is-story is NOT the answer; the design derives from the pin concept.
**Recorded, not scheduled:** the tint plane paints quoted speech + italics only — plain prose spans get
scope-no-color (pre-existing; the likely next "still not colored" report). `GhostMessageRow` has NO
identity chrome for ANY row kind.

### I-9 · CEREMONY + DOC GRADUATION — CLOSED, then RE-OPENED by the day's law (D133/D134 drafted; D129(G) owes an amendment)

- ✅ **D129–D132 MINTED (ceremony batch, 2026-08-07)** — the four laws the last two weeks earned:
  **D129** canon message identity (kind is DECLARED · kind never decides the canon role · hidden means
  hidden in every DERIVED plane · the absent trigger is unrepresentable · the fan-out is COMMITTED,
  not yet built) · **D130** the hand-edit/turn-write REBASE reconciliation (locks arbitrate, carried
  data can never resurrect a removal, both losing arms loud) with the tombstone + regen-vs-later-flush
  residuals recorded AS DECLARED LIMITS · **D131** the handoff PROPERTY OFFER (AMENDS D64 — the drop
  is the default and the decline path; copy-then-swap crash contract; idempotent by provenance;
  avatars re-owned; personas never copied) · **D132** templates have ONE home and it is PRESETS (the
  prose slot registry; turn-wire prose → preset, no-preset-in-scope prose stays per-user, which
  PRESERVES D107's imagery ruling; a source `const` is not a home). Both range headers + the master
  enumeration updated; `check:docs` clean, `check:structure` 190/190 incl. `d-citation-integrity`.
- ✅ **REFUSED, with reasons (a refusal is an outcome):** the BUGATES surface-manifest flag — **already
  minted as D128**, same founding instance and same counts (39/292/269), so the board's "owner call,
  unminted" line at the 08-07-late STATE block is stale, not a gap. And
  **CONSOLIDATION-LANDS-WITH-ITS-FENCE** stays a board row, not a D-entry: its founding instance (the
  founding-cast fence) is OWED, and the house rule is that a law waits for its enforcer
  (D41's no-code-without-an-emit-site, D72's mint-migrate-SEAL).
- ✅ **D125 MINTED** — the fifth regex leg (`PROMPT_HISTORY`, amends D121-E), from HISTLEG's report.
  Both range headers + the master enumeration updated (which was itself behind: D123/D124 had never
  been appended to `Core-Laws-and-Precedents.md:62` — backfilled in the same edit).
  **HCOPY's D-entry, the initiative's long-running survivor, is D131** — its lane report did not
  survive as a file (`reports/` holds only its README), so the entry was re-derived from the built
  tree (`substrate/handoff-copy.ts` + `character/contract/handoff-copy.ts` + the swap batch).
- ✅ **Graduation move DONE (08-03):** the 36/36-ACCOUNTED preset-execution crunch list graduated to
  `docs/history/reviews/misc/`; its three inbound refs repointed. (The board's "that dir is EMPTY"
  claim was stale — it already held six graduated reviews.)

### I-11 · CONTAINERIZE-THEN-TEST — owner-sequenced AFTER this board drains

**Owner intent (2026-08-07):** the Dockerfile gets modernized once the workboard is done, and only
then does the live-safety testing happen. Sequencing is deliberate and correct: **the container IS
the mitigation**, so testing the current posture measures something about to be replaced.

**The fact that frames it:** orbweaver is NOT containerized — Caddy runs in Docker and
reverse-proxies `orbweaver.inktomi.tech` → `host.docker.internal:8788`, but the app is bare node on
the HOST as the owner's user. Reach of any file-write/traversal bug = the whole home directory
(repo, `.env`, backups, `~/.ssh`, the vLLM fleet). Containerizing turns that into a scratch volume.

**Design already ruled (do not re-derive):** test a prod-shaped CLONE on an offset port with a db
copy (the STACK-MODES prod launcher makes this cheap), never live prod — so destructive findings
can be CONFIRMED · the agent gets its own bridge network with a firewall egress allowlist to exactly
the target ip:port, no DNS (pinned `/etc/hosts`), no repo mount, time-bounded, kill-switched · **the
cage needs POSITIVE CONTROLS BOTH WAYS before any result is trusted** — prove it cannot reach the
LAN/vLLM ports/docker socket AND that it CAN reach the target, else "no findings, stayed in bounds"
is unfalsifiable (the four-lying-instruments law applied to the fence) · ALL of it routes to
`security-executor`, never the main session, never Fable.

**Known debt to burn BEFORE hunting (so findings are news, not debt):** the un-containerized app ·
`DEBUG_TOKEN`/`WIRE_CAPTURE` armed in the live `.env` (standing owner action) · the debug gate's
admin arm PRECEDES the token check — 200 unauthenticated under single-user; whether OIDC changes
that must be PROVEN, not assumed · secrets readable at repo root · the 1GB Caddy request body as an
upload surface · the origin IP is public (A records unproxied — Cloudflare DNS-only) · the h3/UDP-443
launch item. Cheapest first step when the time comes: a read-only perimeter inventory (what listens,
what Caddy exposes, real response headers, whether `/api/_debug` answers from outside, TLS/h3 state).

### I-10 · LAUNCH-DAY — three things that only matter on the day

- **REGIME-2 LANDMINE:** `structure:db-baseline` is regime-1-SHAPED (it generates from `{}` vs `0000`
  alone). It MUST be re-pointed at the applied chain on launch day or it reds every legitimate
  incremental. Documented in `Tier-1-DB.md`, deliberately not fixed.
- **The TWO-SWITCH flip** in Tier-1-DB's migration-lifecycle section (pre-launch squash regime →
  incremental regime).
- **h3/QUIC checklist (five minutes, deployment-level):** verify Caddy h3 enabled (default since 2.6) +
  **UDP 443 open** (the classic silent miss — browsers fall back to h2 via Alt-Svc and never tell you).
  The 15s SSE ping already keeps QUIC NAT bindings alive; 0-RTT stays off non-idempotent; add no
  TCP-era tricks. Dev stays h1.1 deliberately (a stricter transport test).

## ═══ SMALLS / TAIL (each independently landable) ═══

- ✅ **Square-glyph Button sweep — DONE** (merged `d0a9443b6`/`3ce7e3dfe`: square-glyph size ramp + TrackBar width variant; `ui-size-via-variant` baseline reached terminal `{}` — the 14 rows PAID).

- ~~**Per-actor tracker grant/revoke EDITOR**~~ — **DONE 2026-08-08**: CLIENT-SMALLS built `rpg-tracker-grants.tsx` (graduated, dual lens) and TRACKERGATE closed the server-side member-self-grant hole (verifier-confirmed). Struck.

- ~~**`readout-parts.tsx` pending-flash**~~ — **DONE (SMALLS-1, `208abac21`)**: EffectiveProfile gained the SM4 three-arm shape + 5-test CT; also truth-repaired its formatCount prose. Struck.

- ~~**CapabilityGate's no-error arm**~~ — **STALE ROW: already shipped** in `8ea171268` (real PENDING arm + three-state CT at preset-editor-surface.ct.tsx:204+). SMALLS-1 premise check caught it. Struck.

- **`respell` derive-or-cite row:** search `DigestsParams` / `SegmentsParams` ≡ contracts
  `MemoryQueryOptions` (both still live in `domain/search/contract/params`). Its twin,
  `MemoryBackfillCounts`, is GONE — that half is closed.

- ~~**`import-user-settings` bypasses the routing write-guard**~~ — **PREMISE-DEAD** (see IMPORT-SETTINGS-WRITE-GUARD kill above: routing is fenced out of SHARE\_SAFE\_SETTINGS\_NAMESPACES, no import can carry it). Struck 2026-08-08.

- ✅ **`connection.getCatalog` / `getAgentSdkCatalog` — ANSWERED, not dead** (archive tail audit): both are
  called at BOOT to warm caches (`entry/lifecycle.ts:181-191`), and `use-admin-mutations.ts:80` already
  carries the explanation in a comment. Deliberate boot-only readers. No action.

- ~~**`field-reachability` suite ignores a `.ok`**~~ — **DONE (SMALLS-1)**: FOUR discarded HandDoorResults moved to the resolves.toEqual({ok:true}) grammar; planted control proves the reason sentence surfaces. Struck.

- **L8-inbound:** foreign ST `mes:""` rows at import — declined-by-scope in ANCHOR, a one-liner if
  wanted.

- **The seeder drop-patch STAYS** until the next fixture regen (the committed flagship fixture carries
  durable pre-D124 `mes:""` rows). ANCHOR's "matched nothing" premise was corrected.

- **CPD's 3 opportunistic dup rows** (invites verb+persistence pair · embed-store per-store reads ·
  rebuild-from-canon) — consolidate when next IN the file, no dedicated lane (DRY-not-gospel).

- **TYPO class-A: 27 as-const tuples** stay untagged manual-lens candidates.

- **`staging.ensure` residual** — first-write-wins seeded from HEAD; dormant unless rpg tools ever mount
  as REGISTRY tools again. **Re-verified 08-03:** `chat-ops/gather.ts:194` is still `tools: []`, so the
  dormancy condition holds — a correctly-cited doorway, not forgotten debt.

- ~~**R5b(a) verify**~~ — **VERIFIED CARRIED (SMALLS-1)**: emitted at entry/compose/rpg.ts:629-631 from a live derivation, both vehicles, asserted at rpg.int.test.ts:961. Closed.

- **WAKE-STATUS:** the 3s engine wake is silent (spec accepted the wait); revisit if it feels laggy.

- **`lockdown` §16 G-table deliberately not grown** (CR0's flag — it defers to the live count).

- ✅ **F4-CACHE-VOLATILITY — BUILT, close it** (archive tail audit): `buildFoldedTurnBuilder` calls
  `cacheStableExtractionRefs(refs, config.trackers)` before `buildToolRoundWireTools`
  (`entry/compose/rpg.ts:991-1008`), with a header naming it *"F4 — CACHE-STABLE REFS ON THIS VEHICLE
  ONLY … option (b)"*. Option (b) was picked and shipped. No action.

- **`E2E_LIVE=1 pnpm e2e`** is owed on a push window (never re-confirmed since the era's start).

- **Lifted from the archived 08-03 blocks (still live, re-homed here 2026-08-07):**
  the **17 `.mjs` probes → `.ts`** conversion (they escape every type program; bare-node runnability
  died with tsx) · the **node-26 §8 ADOPT/AVOID gate** (LAST leg of that program; W1–W5 all merged) ·
  `.claude/hooks/biome-check.sh` lints the guard file `biome.json` says to skip (own small) ·
  the **CT-on-our-vite spike** (pnpm override `@playwright/experimental-ct-core>vite: ^8.1.2`; green =
  one vite + ct-config joins the type program; red = revert) · the **surface-manifest FORMAT ping-pong**
  (teach `gen-baseui-surface.ts` to emit biome-format so a regen can't fight `62de12195`) · the
  **tool-round wire blindness** (DOG-ENGINE receipt find: `/api/_debug/wire/captures` cannot see the
  tool-round arm AT ALL — that provider call has no `captureWire` sink, so `update_scene` traffic
  never reaches the ring; one sink at the tool-round call site closes it) · the
  **per-chat connection PHANTOM** (ENGINE, three-way confirmed: `resolve-chat.ts:9-13` declares
  `providerRouting` DORMANT/RESERVED — no writer verb, no UI, and the overlay is doubly dead
  (compose builds providerRouting-only; resolveChat forwards only api/source/model). Reads as a
  capability, is unreachable end-to-end. Deferred-by-intent per its own comment — a feature row,
  not a defect; recorded so no lane re-derives it. The ONLY live lever is the shared
  `routing.roleDefaults` settings row. Also: ENGINE's receipt probe left spec-owned debris —
  `chat_01kzdrdy92exvvmcvx39gefvgc` + character `dogeng-warden-*` — delete at will) · the
  **trust-gated card images doorway** (owner musing 08-08, mechanism pinned: srcdoc iframes INHERIT
  the parent CSP, so per-character trust alone cannot unlock `data:` images today — the door is an
  `src=`-routed card-frame document carrying its OWN CSP headers (per-trust `img-src`), which also
  subsumes the app-blobs-only arm. Costs: a server route serving model HTML (own security
  treatment) + the theme-injection plumbing moves off the srcdoc computed-style mechanism
  (\[\[theme-fidelity-null-origin-surfaces]]). Design fork, owner-timed; the teach truth-repair
  stands correct for today's tree either way) · the
  **narrowest-mount row gate** (side-eye 08-08, the class that produced both P1s + half the P2s:
  a `Row` with a `shrink-0` trailing cluster sized in a wide context and never re-measured at its
  production width — persona row 358px, theme band 256px, model-roles hint, menu gutter. The
  candidate rule: any such row owes a CT at its narrowest real mount asserting the leading text
  block ≥50%. Gate-shaped; report-then-decide per ASTLENS precedent) · the
  **st-goldens re-sweep** (STATLAS found the rig's `rm -rf output` wipes the PRIOR sweep's arm by
  design — only 10 ST captures survive, the 16-combo ST arm was destroyed by the tools sweep; fix
  accumulation (per-sweep dirs or drop the rm), then a full two-arm re-sweep upgrades the atlas §2
  from source-pinned to measured — the doc is structured for that drop-in). **STATLAS leg 2 LANDED** (`56af5ea2e`: measured §2 atlas + 7 rig defects fixed, sweep-proven). Row closed 2026-08-08.

- **CRUNCH (owner-recalled 08-08, recorded so they stop being forgotten):**
  **(a) The injection note-framings are HARDCODED prose** — `[Note from system: …]` / the demote
  wrapper vocabulary in `assembly/injections.ts` is not exposed anywhere an owner can edit (not in
  the preset template tab). PROSE-1 class (\[\[prose-is-user-editable]]): these become host-editable
  data with versioned defaults. **(b) TWO TEMPLATING SYSTEMS — DIRECTION RULED (owner, 2026-08-07):
  templates have ONE home and it is PRESETS** ("not scattered between that and settings or hiding
  in code"). And templates ≠ macros (owner correction, same day): a template is authorable prompt
  TEXT — section templates, framings, wrappers — some of which may pass through substitution, but
  the macro engine is not what's being unified and not the census's subject. The
  census still decides the migration shape + what in the settings arm is genuinely NOT a template
  (per-user knobs that only look template-ish stay, with reasons); lane TEMPLATE-CENSUS's report is
  the unification spec draft, relayed to the lane mid-run. Evidence method: owner sighting,
  unverified counts — the census is the lane's first job. **(c) LEAD, not a row** — cards may stub differently when adjacent to/inside `[ ]`
  bracket framing (the demote-wrapper class); possibly already dead with the CARD-KEEP fixes.
  Repro before believing: drive a card inside a bracket-framed injection through the tokenizer.

## ═══ ARCHIVE-RESCUED FOLLOW-UPS (owner ruling 2026-08-03: a named follow-up goes ON THE BOARD) ═══

> **Why this section exists.** Lanes ended seal blocks with follow-ups they named but did not build; those
> blocks then moved to `docs/history/` with the archeology. **A follow-up that lives only in the archive is
> forgotten.** Owner: *"if it needs follow up it goes on the board, otherwise it gets forgotten."*
> My first pass used a GREP for one exact phrase and the owner correctly called it fragile — lane ARCHIVE
> then READ all 25 docs archived since 2026-07-23 line by line and verified \~45 candidates against the tree.
> Full report + per-document tables: **`docs/reviews/misc/2026-08-03-archive-rescue-audit.md`**.
> **22 of 25 documents yielded ZERO still-open rows** — recorded there so nobody re-reads them.

**⚠ THREE OF MY FIVE GREP-RESCUED ROWS WERE WRONG. Corrected:**

- ~~S6 SEAL not done~~ — **DONE.** Both `SETTINGS_SECTION_ANCHORS` hits are comments DOCUMENTING the
  retirement (`shell-store.ts:79`: *"the old … subset tuple retired with stage 0"*). Zero declarations,
  zero consumers. My existence-check counted prose as code — the exact failure the audit was ordered to
  avoid.
- ~~Icon fill-axis has zero consumers~~ — **STALE.** `FillableIcon` has TWO live consumers:
  `preset-library-row.tsx` (the O-1 active dot) and `components/row-toggle-action.tsx`. Demoted from debt
  to taste; the named adoption targets (F-06 bolt · tracker orbs · meter glyphs · `weight=` emphasis) and
  the unbuilt `iconNode` door for `weave-glyph.tsx` stand as OPPORTUNITIES, not rot.
- ~~MAC macro-union PREMISE-DIED~~ — right outcome, **wrong label: DONE SINCE**, built by lane MACU
  (`95f4c00b`); `withUserMacros` has 7 consuming modules.
- **HELD:** the `PROMPT_MACROS` phantom, and the barrel sweep (measured **56** `export *`, not 60).

> **⚑ MEASURED ROW-ROT: of the 7 smalls dispatched 2026-08-03, FOUR were premise-wrong** (already fixed,
> misdescribed, or — for EMBER — actively harmful to act on). Add the two the same day from other lanes
> (CP-DROPPED-WARN grepped a symbol that never existed; the coverage-gap note contradicted the section
> above it) and **six board rows misdirected six lanes in one evening.** Every one was written from a
> GREP or from a document's own citation rather than a resolution-based check.
> **THE RULE THIS BUYS: a board row states its EVIDENCE METHOD, or it is a lead, not a row.** A row
> sourced from grep says so. A row sourced from `pnpm ast`/ast-grep says so, with the lens. A row copied
> from another document's claim says THAT, and is treated as unverified until someone checks the tree.
> **And every lane's first job is to re-verify its row** — a correct refusal is a successful lane, and
> tonight it was the majority outcome.

### ⚑ LIVE DOGFOOD BUGS — see [`docs/history/dogfood-tracking-2026-08-08.md`](history/dogfood-tracking-2026-08-08.md)

> **CAMPAIGN LIVE (2026-08-07, owner-ordered priority):** that doc is being worked and verified IN
> FULL — every open row fixed or adjudicated, every fixed row's owed test written, verifier + side-eye
> passes to close. Rulings + overnight defaults are recorded IN the dogfood doc; it is the authority
> for its own rows. THEN this board resumes.
>
> **Multi-user/persona:** PERSONA-SEAT-NULL-BINDS-ANCHOR (M) · PERSONA-SEAT-BORN-NULL (S 🟡) · MEMBER-PERSONA-SWITCH (S–M)
> **RPG:** RPG-STAT-ENTRY-REVERTS (M) · CARD-KEEP-ZERO (M) · CARD-TEACH-RECENCY (M) · CARD-TRUST-INVERTED (M) ·
> CARD-EXTERNAL-MEDIA (M) · EXTRACT-BUDGET-DEAD (M) · RUNTIME-VARS-DEAD (M) · CARD-FENCE-LENIENT (S) ·
> RPG-TRACE-DEAD (S) · RPG-NO-PROMPT-DEBUG (L)
> **Assets/UI:** BARE-HASH ASSET 404s (S) · DRAFT-PHASE ROW AVATAR (S) · D44 GRAIN TEXTURE (S) · CREDENTIAL STORAGE SILENT FAIL (S)
> **Mobile:** MOBILE-THEME-SELECTOR (S)

### BOARD THESE — still-open, ranked by value-per-effort (paste-ready from the audit)

- [ ] **PRESET-SLIDER-VERIFY** (S) — the preset program CLOSED without the re-verification its own crunch
  list demanded: *"Re-verify the slider deck on a vLLM/OR connection before closing the program"*
  (sonnet-5 exposes no sampling knobs, so the deck was never seen rendered).
- [x] ~~**CP-DROPPED-WARN**~~ — **PREMISE WAS WRONG; the row grepped a symbol that never existed.** The code
  is `custom_parameters_ignored`, not `custom_parameters_dropped`: declared at
  `infra/providers/contract/resolve.ts:27`, emitted by `withCustomParametersDrop`
  (`openrouter/runners/chat/shared.ts:343-357`), folded by BOTH OR chat runners
  (`chat-completions.ts:288`, `responses.ts:476`), asserted by two tests. **It could not have been
  missing at any point since the `warning-code-coverage` gate landed** — that gate REDs any
  `WARNING_CODES` member with no emit site and an empty `deferred` map, so a zero-hit member is
  structurally impossible on a green tree. Nobody need hand-verify this row again. It cost a lane its
  opening. **Superseded by INFRA-WARN-DEAF, which is what it was actually pointing at.**
- [x] ✅ **INFRA-WARN-DEAF — DONE** (merged `0f39aa62b`, reader `1dbad4ca0`: infra runner warnings reach the user, ONE passenger as ruled; the residual NINE codes stay owner-gated on copy). Original: **`ChatResult.events` has ZERO production readers, so all TEN
  infra `WARNING_CODES` reach the logs and never a human.** `createRunChatTurnBridge`
  (`entry/compose/chat.ts`) awaits the result and reads only reply/reasoning/usage/…, never `.events`;
  `TurnStreamChunk` (`domain/chat/contract/results.ts:197`) is `text | reasoning | final` with no
  warning arm; `ChatRequest.onEvent?` has zero wiring outside the backends. Receipt: `ast-grep '$X.events'`,
  scannedFileCount **1994**, every hit a runner BUILDING the array or a test — no reader.
  **D41's no-silent-degrade is satisfied in the type system and violated in the product.**
  The surface itself WORKS and the IMAGE role proves it (`entry/compose/imagery.ts:43` guards the infra
  code down, `chat/verbs/generate-image.ts:26` re-maps to a `ChatWarningCode`, rides the bus to
  `apply-chat-bus-event.ts:47` → toast) — only the CHAT role's infra→domain hop is missing.
  **`warning-code-coverage` is blind to this BY CONSTRUCTION: it ratchets the EMIT, never the READ** —
  that limit belongs in the gate's header, and a reader-side arm is its own lane.
  **Ruled:** build the pipe now with ONE passenger (the customParameters drop); **the residual NINE codes
  are OWNER-GATED on copy** — each needs user-facing text, and several (`sampling_knob_dropped`,
  `dynamic_context_demoted`) are arguably too noisy to toast every turn. That is a product call, not a
  lane's. Side-eye owed after merge (new toast).
- [x] ✅ **STRUCTURED-ABORT-REASON-LEAK — DONE** (ABORT-LEAK merged 2026-08-07, `3fd54bb09`,
  consolidated check 14/14). Fix home = `roles/dispatch.ts::runRole` (the one seam all EIGHT roles
  cross): `flattenAbortSignal` (`backends/kit/abort-flatten.ts`, the one-home of the re-abort-your-
  own-controller law) + `classifyTransportName` tests the abort NAME before the transient regex.
  `idle-timeout.ts` now composes the shared primitive. RPG-SIGNAL stays (it is the round's own
  cancellation scope; its header's "covers both arms" claim truth-repaired). **MECHANISM CORRECTION
  (the row below was wrong in the middle):** `retry.ts` never re-ran structured calls (chat-runner
  callers only; nothing reads `ProviderError.retryable`) — the REAL re-run vector was
  `@openrouter/sdk`'s DEFAULT `retryConfig` (\[\[vendor-sdk-default-retry-surface]]). Red-first 3/3
  through the real dispatcher. Original row for the record: **a cancelled `structured` call can be RE-RUN as a retry.**
  `classifyTransportName` (`backends/kit/error-classify.ts:92-101`) regexes `/timeout|connection|network|overload/i`
  over an error's name+message → `{kind:"server", retryable:true}`, and `retry.ts` re-runs on that. The
  chat runners are protected — `turnAbortSignal` (`backends/kit/idle-timeout.ts:53-67`) deliberately
  re-aborts its own controller instead of `AbortSignal.any`, with a comment naming this exact bug. **The
  structured role is NOT:** `backends/openrouter/index.ts:279` passes `req.signal` straight to
  `client.chat.send` with no flattening — and that is the arm rpg extraction rides. RPG-SIGNAL is
  flattening at rpg's own seam, which covers rpg only; every other structured caller stays exposed.
  **The general law worth pinning: `AbortSignal.any` propagates the source signal's `reason`, and a
  reason that reaches `fetch` becomes the error your transport classifier sees.**
- [x] ~~**REGX2**~~ — **STALE ROW: landed 2026-08-07** (see I-4 "REGX2 LANDED" above — bulk edit + pipeline debugger + JSON door all shipped). Struck 2026-08-08 full-board audit.
- [x] ✅ **RPG-ROUND-SIGNAL — DONE** (merged `1b581127b`: the state round is cancelable with its own lifetime, and a cancelled round writes NOTHING).
- [x] ✅ **HAND-EDIT-VS-FLUSH — DONE, GRADUATED on leg 4** (`01300b330` merge + `f473abbc6` board seal: 400-turn property test, 188/400 control; two accuracy caveats recorded in that seal). Original row for the record: **REPRODUCED: ONE RACE, TWO VICTIMS.**
  Deterministic repro on the real flush gate. The row's suspicion was HALF right: **Arm B**
  (back-to-back assistant turns) — the hand edit IS clobbered: `resolveHead`'s in-place door fires
  on a `latestSnapshot` FALLBACK row from an older slot (contract violation of its own "this turn's
  own draft" doc). **Arm A** (single speaker, the common case) — INVERTED: the hand edit survives
  and the TURN'S own write is silently lost forever (hand rung outranks the turn row at the same
  seq, D124 by design; flush wrote from a base snapshotted at flush START). **RULED (orchestrator,
  from recorded law):** (1) the in-place door only for true turn-rung rows; (2) field-level merge at
  the flush's write boundary — post-`writeFlush` re-resolve, `applyLockedPatch(turnState, handState)`
  honoring the hand row's auto-locks: manual-edit-wins on touched fields, the turn's writes survive
  everywhere else. Last-write-wins was refused (contradicts the recorded manual-edit-wins law);
  refuse-during-flight was refused (blocks the host mid-steer). Red-first pins owed on BOTH victims
  - the same-field-conflict-resolves-to-human case.
- [x] ~~**CONTRACTS-BARREL**~~ — **REFUSED, premise false (SMALLS-BATCH 2026-08-07):** the file is one
  line and already says "placeholder; unused — every consumer imports contracts modules directly". No
  such sentence exists; grep zero-hit.
- [x] ~~**CODEMOD-DOCS**~~ — **PREMISE WRONG (re-verified 08-03).** `package.json:19` already carries
  `"codemod": "node scripts/codemods/codemod.ts"`, and that CLI exists and works (help/list/recipes/
  recipe/search, wired to `codemod-kit.ts`). Somebody added it and the row was never updated.
- [x] ~~**CODEMOD-PATHMAP**~~ — **PREMISE WRONG (re-verified 08-03).** All three of
  `moveFiles`/`deleteFiles`/`copyFile` (`codemod-kit.ts:801-939`) validate via
  `ctx.project.getSourceFile(absPath)` — a LIVE ts-morph lookup, not a stale cache — and `assert()`
  loudly with actionable messages before touching anything. The cache-lie shape is not in current code.
- [x] ✅ **EDITSNAP-OK residual — DONE** (SMALLS-BATCH, `be28928f9`): the `handEdit` fixture now asserts
  `HandDoorResult.ok`; suite 64/64.
- [x] ~~**SSE-SPEC-STATUS**~~ — **REFUSED, premise false (SMALLS-BATCH):** lines 3-4 read cleanly
  ("Status: CLOSED — BUILT S0-S5, D118"), byte-checked with `cat -A`. No corruption on the tree.
- [x] ✅ **L8-INBOUND — DONE** (SMALLS-BATCH, `be28928f9`): blank-`mes`/no-surviving-swipe ST rows are
  STRIPPED at `parseMessageLine` (silent tolerant-strip matches the parser's own corrupt-line posture;
  the module is zero-I/O so no warn is possible), D124-consistent. Test pins it; flagship fixture
  round-trip unregressed (not regenerated).
- [ ] **REGEX-REASONING-FIDELITY — RULED 2026-08-07 (question-tool): fix the DISPLAY** — the
  tester/debugger prints REASONING where it truly runs (post-postProcess); execution untouched
  (instruments must not lie). Dispatched in the RULED-BATCH lane.
- [ ] **FLAKE-WATCH** (S) — `code-editor.ct` CM6 75ms window + `drawer.ct:162` focus-trap (pre-existing at
  HEAD) have no durable home beyond a watch list.
- [x] ✅ **HISTORY-GRADUATION RULE — DONE** (SMALLS-BATCH, `be28928f9`): the "check the paragraphs, not
  just the tables" line is in `docs/history/README.md`.
- [x] ~~**PROMPT\_MACROS phantom**~~ — **REFUSED, premise false (SMALLS-BATCH):** the cited spec line
  (and whole file) never names the symbol; the symbol itself IS dead (two-method absence: `pnpm ast
  refs` no-declaration + one historical comment hit at `client/src/lib/prompt-macros.ts:14`, which is a
  record, not a reference). Nothing to annotate.
- [ ] **BARREL ROOT-FIX** (M) — 56 `export * from` remain across `packages/*/src`.
- [x] ✅ **TSX-SHEDDING MIGRATION — DONE 2026-08-03, all four stages** (receipts in STATE above; the row
  is kept for its rationale). Original text: (`docs/design/tsx-shedding-migration-spec.md`, adopted from the memoban
  session, probe-verified preconditions). **Owner has particular interest.** `tsx` is a RUNTIME dep in
  production — `start` runs `tsx …/entry/index.ts`, so the server's real module resolver is tsx's and
  any divergence from node is an invisible bug class. The whole migration is one hazard: **6,359
  extensionless relative imports** (+ directory imports), fixed by Biome `useImportExtensions --write`
  SCOPED to paths (never bare `--write .`), which then stays on as the permanent enforcer.
  **⚑ THIS ONE RUNS IN A SINGLE SITTING, ALONE — owner-ruled, and SPECIFIC TO THIS MIGRATION, not a
  general orchestration rule.** All four stages start-to-finish from the main session with no sibling
  lanes and no concurrent session: Stage 1's \~6,359-file rewrite conflicts with any other writer, and
  **stages 1–3 without 4 leave a state where GREEN ≠ BOOTABLE** — under bundler+extensions the checker
  still accepts extensionless, so a missed extension typechecks green and crashes at boot with only the
  biome rule in between; `nodenext` (stage 4) makes it a compile error. Verify by BATTERY, not by
  reading 6,359 hunks. **Step zero: inventory what still needs `tsx`** (scripts/dev/\*.sh, package.json,
  probes, codemods, seeds — spec expects zero) and put the list to the owner before flipping anything.
- [ ] **OWNER-OWABLES** — the archived "MORNING OWABLES" list, re-surfaced: the 3 nudge default texts ·
  REGPAR F3/F4/F5 menu · v3-transcripts-reach-new-installs-only · `countByBook` twins · "Untitled chat"
  in the regex rosters.

### BOARD THESE — the TAIL pass (ARCHIVE2, lines 2130–3515, 100% covered)

Report: **`docs/reviews/misc/2026-08-03-archive-rescue-audit-tail.md`**. It **independently re-confirmed
all three of the sibling's corrections to me** (the S6 seal block at :3060 confirms the anchors tuple was
deleted; the icon-seal block at :2469 confirms two real client consumers) — so those corrections stand
twice over, not once.

- [x] ✅ **SQUARE-GLYPH-BUTTON-SWEEP — ALREADY PAID (premise-killed 2026-08-07, lane GLYPHSWEEP,
  corroborated on main).** This row was STALE and the board CONTRADICTED ITSELF: the SMALLS head already
  had `✅ DONE (d0a9443b6/3ce7e3dfe)`; this TAIL-pass row was an ARCHIVE2 audit snapshot from before the
  payment. Current tree: Button has the `glyph-xs/sm/md/lg` ramp (`button/variants.ts`), 15 rpg sites
  consume `size="glyph-*"`, **ZERO `!size-N !p-0` in `features/rpg`**, and the gate is at TRUE terminal
  zero ("terminal zero on a FIXED tree, not a parked one" — baseline removed 2026-08-03, §4.8). Geometry
  CT already pins each step square (`button.ct.tsx:250-276`). The `!w-avatar-*` `<TrackerValue>` sites
  are a `#components` local, the gate's documented LIMIT-1 substituted-template family — separate matter.
  **GLYPHSWEEP now assessing the icon-seal doorways only (opportunities, not debt — bias to board).**
- [x] ✅ **ICON-SEAL-DOORWAYS — ASSESSED BUILD-NONE (GLYPHSWEEP, 2026-08-07).** Full assessment:
  `docs/reviews/misc/2026-08-07-icon-seal-doorways-assessment.md`. The load-bearing fact: every icon
  renders through the `Icon` wrapper which passes size/stroke props explicitly, so any defaults mechanism
  is DEAD. **`LucideProvider`** — redundant (the wrapper IS the defaults home; a provider is a competing
  second source of truth — a durable design lesson) · **vector-effect** — no consumer (only matters for
  CSS-transform-scaled icons; none exist; `absoluteStrokeWidth` covers the size-prop path) · **`iconNode`
  door** — fights §13.9's hand-authored weave-glyph brand ruling + adds surface. All three SKIP. **Only
  `fillRule=evenodd` survives as a boarded candidate** — cheap to probe but UNCERTAIN value (an
  evidence-based gallery verdict), no named consumer; needs a side-eye look before it's worth building.
  Recipe in the assessment doc.
- [ ] **fillRule=evenodd fillable-set probe** (S, boarded from the above) — the one live icon-seal
  candidate: probe whether `evenodd` grows the fillable icon set usefully; needs a side-eye gallery
  verdict. Owner-optional; not debt.
- [ ] **AGENT-1-PROGRAM** (L, owner-scoped) — agent-sdk first-class for rpg-lite, 5 named arms explicitly
  scoped-and-not-dispatched, ruled order 2→3→1→4.
- [ ] **ZOD-STAGE-D — RULED 2026-08-07 (question-tool): LAND IN FULL** (stringbool / hostname /
  strip-observability), premise re-verified first per \[\[audit-lists-are-snapshots]]. Dispatched in
  the RULED-BATCH lane.
- [ ] **AMBIENT-NONE-AFFORDANCE** (S) — `ambient-strip.tsx`'s weather/timeOfDay CLOSED vocabs carry no
  "none"/unset member (`RPG_WEATHER_TYPES` / `TIME_OF_DAY`), so they cannot be cleared; location/date
  are free text and can. This is the UI gap behind the unreachable compact arm.
- [ ] **DOCLAW-RPG-REFS — RULED 2026-08-07 (question-tool): MINT THE CARVE-OUT** — comments citing
  law by §/D-number are sanctioned house style; one paragraph in Documentation-Law, no sweep
  (\~4,066 refs / 1,151 files of churn avoided). Orchestrator writes the law paragraph.
- [ ] **MACRO-CAST-GUIDES — RULED 2026-08-07 (question-tool): THREAD THEM** — the cast projection
  gains appearance/outfit/thoughts via the existing celBindings channel. Dispatched in the
  RULED-BATCH lane.
- [x] ~~**EMBER-VOCAB-SWEEP**~~ — **PREMISE WRONG, and acting on it would have DONE HARM.** "ember" is the
  deliberate house nickname for `--color-primary`/accent: a REAL token name in
  `packages/ui/src/tokens/tokens.json:166` (`sky-ember`, `sky-ember-deep`) plus `chart-1`'s
  `$description: "ember"`, used consistently across dozens of CTs. Sweeping it would have touched 20+
  files AGAINST the codebase's own convention. The lane reported instead of guessing — correct call.
- [x] ~~**WORKLOADS-LABEL-RENAME**~~ — **PREMISE WRONG (re-verified 08-03).** Zero hits for the retired
  label across `packages/**`; all three cited files already say **"lockdown §12"**
  (`chat-options-menu.tsx:37`, `rpg-choice-echo.tsx:7`, `use-rpg-mutations.ts:223`). It survives only
  in history/audit docs — those are RECORDS of the finding, not the thing to fix.
- [ ] **IMPORT-SETTINGS-WRITE-GUARD — RULED 2026-08-07 (question-tool): LIFT INTO IMPORT** — the
  import verb runs the same write-boundary validation as every settings writer; refuse loudly at
  write; the heal-at-read arm becomes deletable. Dispatched in the RULED-BATCH lane.

**⚑ ARCHIVE2's own UNVERIFIED tail** (flagged, not asserted — each is one targeted grep from a verdict):
the six named UNREACHED side-eye items (waystone-compact · impersonate+1 · scene-lightbox · Status
max-edit · F9-F10 · stats-Recompute) — it did not run a fresh side-eye pass to see whether a later round
absorbed them · `refEnumerationLines` active-conditions coverage · and the two contradictory `#16 engine
wake` mentions inside the same range (one says still-open, a later one says 6/6 arms PASS live).

**⚑ TWO ROWS THE AUDIT REFUSED TO GUESS ON (UNVERIFIABLE, each names what would settle it):**
`SSE-STARVATION-PIN` (the spec §12 live-socket regression pin — could not find it, and it did NOT run a
two-method absence check, so it will not say "not found") · `SM7-STRICT-RESIDUE` (the "second
`response_format` builder" at a path that no longer exists — `backends/vllm/` was restructured away;
re-locate and re-check).

**⚑ ~~COVERAGE GAP~~ — CLOSED, and this note was STALE AND SELF-CONTRADICTORY (corrected 2026-08-03).**
It said the audit read only **lines 1–2130 of 3515 (\~61%)** with 39% owed — but the TAIL section directly
above it states ARCHIVE2 covered **exactly 2130–3515, 100% line-by-line**. Together that is the whole file.
The bullet was describing the FIRST lane's coverage and was never updated when ARCHIVE2 filled it.
**It cost a dispatch:** lane ARCHIVE-GAP was sent to read a range already read, caught the contradiction
itself, and re-scoped to the more valuable job — a FINAL VERIFYING pass that re-checks ARCHIVE2's 10 rows
against today's tree (several were asserted from the document's own citation rather than a fresh grep —
T-11 says so explicitly), settles ARCHIVE2's flagged-unverified tail, and re-attempts the two REFUSED rows
with two-method absence discipline. **The lesson: a board note that describes coverage must be rewritten
when coverage changes, not left to be contradicted by the section above it.**

- **⚠ LIVE SHELL-TIER CLS FINDING (do NOT re-board the old PERF P1 — it resurfaced):** the archive tail
  audit traced the archived "CLS 0.24, profile lane owed" row forward and found the defect is ALREADY
  tracked live as **F-14 — *"CLS is 2–4× the budget on EVERY section — shell-tier, not preset-specific"***
  (measured **0.26**), in `docs/reviews/side-eye/2026-08-03-preset-shell-reverify.md:249`. A separate
  side-eye pass today independently measured 0.2542 on the config pane and attributed it to
  collection-group expansion, pre-existing. **One shell-wide defect, three sightings, no owner yet.**

- **⚠ MANUAL MEMO WAS HIDING CT FAILURES (owner report, 2026-08-03, second session).** The
  React-modernization program's memo burn-down deleted the manual `useMemo`/`useCallback` cache sites —
  and the CT suite **exploded**. Being fixed in that session.
  **The load-bearing reading: those failures are LATENT ON MAIN TODAY.** Deleting the memo did not create
  them; it stopped SUPPRESSING the re-render that reveals them. Same disease shape as the swallowed catch
  inside a root span (SPANGATE/OBSCLOSE) — green because the reporting mechanism was disabled, not because
  the behaviour was right.
  **The question that decides whether this blocks a push:** are the exposed reds (a) FIXTURE artifacts (a
  test that leaned on a memo boundary to hold a stale value — only the test was wrong) or (b) REAL product
  defects memo was masking at runtime as well? Any (b) ships today regardless of the burn-down. Ask the
  second session for the split before the push word is given.
  **It also vindicates the direction** — \[\[react-compiler-no-manual-memo]] treats manual memo as
  against-convention here; this is the first evidence it was actively concealing breakage, not merely
  redundant. Worth a D-entry clause if the split shows real defects.

- ✅ **ENGINES FLEET FIX — MERGED (`a386a4fae`, merge `2b1332159`; consolidated `pnpm check` 14/14).** Root-caused the
  long-standing "esbuild and something else running at the same time" annoyance: it is the **engines fleet
  launcher**, not the dep-optimizer / CT cache / gate fixtures (all three tested and RULED OUT). Every
  `pnpm engines adopt` left an immortal `tsx engines.ts --detach` + node-loader + esbuild cluster, because
  the `--detach` path says "and EXITS" but never `unref()`'d its child handles — so the launcher's event
  loop was held for the fleet's entire life (two were alive \~8h). **A DUPLICATE FLEET existed for \~8h
  holding \~17 GiB serving nothing:** a second adopter 6 min into the first's cold boot passed the VRAM
  headroom gate (mid-boot VRAM is ambiguous by construction) and `waitHealthy` reported success **because
  it polls the PORT — it validated the FIRST fleet's engines** (\[\[health-check-validates-the-port-not-your-process]]).
  Bonus defect: a no-op adopt overwrites the pidfile UNCONDITIONALLY, which can blank the live fleet's rows
  and orphan `engines:stop`.
  **Fix (4 arms, in that worktree):** an atomic boot lock for the adopt window · **adopt-in-place** (a
  healthy port is adopted, never re-spawned — the dupe class becomes unrepresentable) · pidfile MERGE ·
  `unref()` + fd-close in detach. **Honestly flagged by its author: not live-tested against a real fleet**
  per \[\[never-run-engine-launcher-live]] — the next real adopt IS the verification.
  **Box state 2026-08-03 (verified by the orchestrator, read-only first):** the owner had already reaped the
  dupes and stale launchers — all six cited pids gone, no detached launchers resident, **3 engines healthy
  one per port, \~40 GiB free across both cards.** Nothing left to clean.
  **✅ THE "DO NOT ADOPT" HOLD IS LIFTED** — the fix is on main. **But the verification is still owed:**
  per \[\[never-run-engine-launcher-live]] this was NOT live-tested against a real fleet, so **the next real
  `engines adopt` IS the test** — watch for exactly one launcher exiting promptly, no duplicate spawn on an
  already-healthy port, and a pidfile that merges rather than clobbers.
  Also corrected in passing: the workspace comment blaming ancient `esbuild@0.18.20` on tsx — it is a
  **drizzle-kit transitive** (`pnpm why` receipt in the commit).

- ✅ **`@orb-gate-ignore` NOW REQUIRES A REASON (`d55350d07`)** — the marker honoured by `pass.ts` for all
  183 gates accepted a bare `// @orb-gate-ignore <gate>` and suppressed the finding, contradicting
  GATE-AUTHORING §4.3 (*"a bare-marker-exempts rule is a rubber stamp"*). Grammar is now
  `// @orb-gate-ignore <gate>[(<position>)]: <reason>` — `parseGateIgnoreMarker`/`judgeGateIgnore`,
  `malformed` when the reason OR the position is empty, and a malformed marker **suppresses nothing**.
  **The subtle right call:** RECOGNITION stays permissive so a malformed marker is still SEEN and can be
  red-flagged by `gate-ignore-inventory` — a stricter parser would have made broken markers INVISIBLE to
  the gate that exists to catch them. 24 files swept to the colon grammar; `report.ts` single-pass clean;
  `pnpm check` 14/14; gate suites 16/16.
  **✅ THE OWED PROBE WAS RUN (merge `65e85e09a`, gate work `130dcf33b`):** the six-case probe is
  now PERMANENT, and it found §4.3a was prose-only — the position-named marker law gained an enforcer.
  **Lesson banked:** where biome and tsc CONTRADICT each other (biome called a trailing `return;`
  unnecessary; tsc's `noImplicitReturns` demanded it), the fix is a SINGLE-RETURN accumulator shape that
  satisfies both — not a suppression of one to appease the other. One cited suppression survives, where
  biome's type lens wrongly believes `exec()` is non-nullable.

- **📄 NODE 21→26 MAXIMAL-ADOPTION PROGRAM boarded** (`docs/design/node-26-adoption-program.md`, 336
  lines, probe-verified + implementor-grade, from the same session). Pairs naturally with the
  **tsx-shedding migration** — both are "make the platform the runtime" work, and tsx-shedding's stage 4
  (`nodenext`) is the seam where they meet. Read them together before scheduling either.

- Also landed with it: `drizzle.config.ts` joins the db type program (the **no-program hole** class — the
  same defect the memoban session closed for the four root configs), and the ignored esbuild `target` is
  dropped from `vitest.config.ts`, killing the per-lane esbuild/oxc warning.

## ═══ WATCH LIST (flakes + pre-existing reds; none blocking) ═══

- `code-editor.ct` completion flake under contention (documented CM6 75ms window).
- `drawer.ct:162` focus-trap failure — PRE-EXISTING at HEAD (D8R's flag).
- `preset-editor-surface.ct:140` parallel-load flake — A/B-proven pre-existing.
- `seed-demo-chats` cold-import contention — STRUCTURALLY fixed by routing to `SERIAL_INT`
  (`aef89ecb`); watch that it stays quiet.
- A hand `editSnapshot` during an in-flight turn can be clobbered by the flush (seen once, unchased).
- `rpg-scene-tab.tsx` sits near the 450-line cap.

## ═══ STANDING OWNER ITEMS (his word, nobody else's) ═══

1. ✅ **THE PUSH WORD — GIVEN + EXECUTED 2026-08-07** (`4ecb3110d..292f65e08`, receipt in STATE). The
   law stands for the NEXT push: fresh word, fresh battery.
2. **The three nudge default texts** (I-8) — his veto, verbatim in NARCOLOR's report.
3. **Structured-output nullable-union reshape** (I-1) — the A/B call.
4. **Presets into the config rail** (I-3) — owner-timed, one array member forever.
5. ✅ **`tags.sortOrder`** — AUDITED + RULED KEEP-BUT-NARROW (I-4). **The cliff question RULED
   2026-08-07 (question-tool): ACCEPT the ≤30 drag cap** — manual curation is a small-set affordance;
   the retire-manual question folds into the Alphabetical/Most-Used sort-modes build when it lands.
   Item CLOSED.
6. **DRAFT-TRUST** — drafts run the untrusted floor (strip `<i>`/`<b>`), committed `trustHtml` renders
   them; needs a "what render policy would this card get" server seam. Architecture call.
7. **AGENT-1** — agent-sdk FIRST-CLASS for rpg-lite. Plumbing is \~complete (terminal tools · stateful
   tools · session resume · compaction envs · firewall · catalog). Remaining arms in ruled order 2→3→1→4:
   (2) REASONING visibility parity — the model reasons at native depth on BOTH arms; max-pro-sub
   delivers ENCRYPTED deltas (hidden by provider), the OR skin delivers them readable, so the OR arm
   captures into our reasoning channel and the sub arm handles encrypted deltas HONESTLY (never an
   empty/broken pane) · (3) usage/context accounting parity (per-turn DELTA semantics) · (1) knob
   HONESTY (the SDK wire ignores most sampling knobs) · (4) the live rpg-lite loop scored on the SDK
   wire. FYI standing: Claude Max OAuth expired — the agent-sdk backend is dead until he re-auths.
8. **JSON-card export format** + **absent-character transcript import policy** (I-6).
9. **Doc-Law §-refs-in-comments ruling** — `rpg.ts` carries 33; sweep or carve out.
10. **Macro-feed cast-guides** — `chat-ops/macro-view.ts`'s cast projection does NOT carry the RV-11
    guide fields (appearance/outfit/thoughts). Should user macros bind cast guides via `celBindings`?
    Thread them, or note the asymmetry in the file.
11. **VRAM-refusal drill** — needs his word for a real GPU hog (unit-covered; the live arm is open).
12. **v3 transcripts reach NEW installs only** — the pack heal carries dressing, never transcripts
    (deliberate; his stack is fresh, so this is fine). A transcript-heal arm is his call if other
    installs ever matter.
13. **RV-13 second half — branch-and-save game modes**: the ruling (freeform demoted, d20-in-lite is the
    direction) is doctrine; the BUILD was deliberately sequenced AFTER the hardcoded-constants-become-
    user-slots work (PROSE-1 + knob editors + tracker-def editors — now largely landed, so this is
    ready to spec when he wants it).
14. **Unsent-draft reload persistence** — nav round-trips keep everything; only a PAGE RELOAD loses an
    unsent draft, deliberately. Persistence-design fork, not a bug.
15. **The held-back rail merge** — characters + chats into ONE glyph. He considered it, went with A+B,
    and A+B CONVERGES toward it, so it stays a cheap rail-level edit whenever he feels it.
16. ✅ **The tool-guard hard floor — RULED 2026-08-08 (question-tool): LEAVE AS-IS.** The owner accepts
    the classifier bypass; the floor is his own attention on an overnight-full-auto box. Recorded so
    nobody re-poses it.
17. ✅ **D127 + D128 MINTED 2026-08-08** (question-tool, "mint both"): compiler-owns-memoization +
    the uncompiled CT lane; the third-party surface-manifest law (founding instance @base-ui/react).
    Ledger + ranges + enumeration updated. (Superseded by the I-9 ceremony batch: D129–D132 minted,
    next free **D133**.)
18. Taste tail: Meteocons artwork fork (\~8 icons, MIT) · grimstone theme (parked) · chat-options
    placement (D111 clause OPEN, breaks nothing) · persona=character design pass
    (\[\[persona-pin-prompt-resolution]]).

## ═══ UNKNOWABLE — flagged for the owner, kept on the board ═══

Items this audit could not prove either way from the tree. **None were dropped.**

- **The three live lanes' outcomes** (SCHEMA · DBANK2 · SWEEP). Their scope above is what was
  dispatched, not what landed; reconcile at their merges.
- **"the two `countByBook` twins"** (REGROSTER's flag, 2-instance dup). Today the symbol exists in
  exactly ONE home — `packages/server/src/domain/world-info/persistence/queries.ts:81`, called five
  times. Either the twin already dissolved or it lives under a different spelling; needs a look before
  anyone acts on the flag.
- The 08-01/08-02-era probe residue that was never re-driven: the `#16` engine auto-sleep/wake LIVE
  pass beyond the 6/6 arms already proven, and the VRAM drill it depends on.
- Whether every one of NIGHTFIX's three ARGUED refusals (row-pitch parity · scent scope ·
  `listScriptUsage` ×3) is settled with the owner, or only with the reviewer.

## ═══ ORCHESTRATOR QUICK-ONBOARD (load-bearing — keep) ═══

**Dispatch + lanes**

- `Agent {isolation:"worktree"}` — the WorktreeCreate hook owns creation (local HEAD + auto-install).
  POST-DISPATCH verify bases (`git -C <wt> rev-parse HEAD` = main HEAD). Briefs ALWAYS include: the
  back-channel line (lanes SendMessage you MID-RUN — the owner wants this), scope boundaries vs sibling
  lanes, `git -C` discipline, lane-unique scratchpad names, and **the explicit playwright CT files the
  lane's floor must run**.
- Message live lanes by AGENT ID, not role name. **TaskStop an agent once its report merges** — a
  lingering resumed instance in a torn-down worktree correctly refuses to act but sits in the owner's
  UI as running. NEVER resume an agent whose worktree you removed.
- **ALLOCATE D-NUMBERS AT DISPATCH** when two live lanes both mint (D123/D124 needed a mid-run
  renumber).
- Lanes cite their own defaults mid-run (the default-and-deadline law) — rule fast, they don't stall.
- Sticklers are the design-question vehicle (five ran in one day, every one changed the plan) —
  dispatch with the actor-state-review form + "write the file first".
- Scout dormancy censuses (LIVE / DOORWAY / DEAD-WIRE / ABSENT per verb) answer "is this domain real"
  cheaply — wired-or-cited applies at domain scale.
- **Every scout PRESENCE claim needs AST, not grep** (three instrument-error retractions in one day).

**Merges**

- A FAST-FORWARD merge SKIPS the pre-merge-commit hook — run `pnpm check` on main after any FF (or
  `merge --no-ff`). NEVER DEFER that check when the branch's gate list missed any stage.
- **NEVER CHAIN TEARDOWN BEHIND A MERGE IN ONE COMMAND** (burned twice: a `| tail` swallowed a hook
  failure and teardown ran on a failed merge; a red hook left staged-no-commit and the chained `rm -rf`
  deleted a lane worktree that then needed resurrection). merge → SEPARATE verify call → THEN teardown.
  A staged-failed merge is `git merge --abort`, never `reset --hard` with uncommitted work.
- **NEVER `cd` INTO A WORKTREE AT ALL — not even as a throwaway prefix.** The Bash tool's cwd PERSISTS
  across calls, so one `cd <wt> 2>/dev/null; git -C <wt> status` silently relocates every LATER command:
  a board edit + `git add -A docs` + commit then landed a main-only doc commit on a LANE'S BRANCH, on top
  of that lane's checkpoint, while it was mid-sweep (2026-08-03, BRAND-F). `git -C <ABSOLUTE-path>` is
  sufficient for every worktree read — the `cd` buys nothing and costs this.
  **The repair, when it happens:** cherry-pick the commit to main FIRST (bank the work), then in the lane
  `reset --soft HEAD~1`, rewrite the stray file from `git show HEAD:<path>`, and `git reset -- <path>` to
  unstage. NEVER `git restore`/`checkout <path>` in a lane's tree — it carries live uncommitted work.
  Verify the lane's modified-file count is unchanged afterward and TELL the lane.
- **HOLD merges while a `verify --push` runs** (merging mid-battery muddies what got certified).
- Merge-hook format-drift reds: fix IN the staged merge (scoped biome on the named files, inspect the
  diff, `git add`, `commit --no-edit`).
- Teardown: `status --short` (untracked survivors) + `git show --stat` receipts FIRST; never tear down
  a resumable lane. Recovery: the branch always survives —
  `git worktree add <same-path> <branch>` re-installs via the post-checkout hook.

**Verification instruments**

- `pnpm check` = STATIC only (\~90-220s, in the pre-commit hook). `pnpm test` = the battery (\~10 min,
  vitest \~9,800 + CT). `pnpm verify --push` = the 14 static stages + `deps:orphan-ratchet` + `tests:node` + `e2e-smoke`,
  and **`tests:node` carries the CTs** (`pnpm test` = the 4 vitest runtime projects && `pnpm test:ct --retries=2`; receipt: `scripts/verify/registry.ts:304`). NOT at push: the full `e2e` + `quality:mutation-gate` (those are `--full`); `quality:cpd` +
  `tests:parity` were PROMOTED INTO the push tier 2026-08-03 (sub-2s each — lefthook.yml's own
  comment is the receipt; this line previously said otherwise and was stale). And `types:testd` rides the STATIC bar,
  not the battery. \~16-17 min; BACKGROUND it, never foreground with a timeout. READ
  `reports/` instead of re-running.
- **⚑ STATIC IS NOT GRADUATION — THE BATTERY IS NOT OPTIONAL (2026-08-07, the hard lesson of the night;
  it cost three re-runs).** `pnpm check` (the per-merge consolidated check) is STATIC — it NEVER runs
  `tests:node`. TWO `tests:node` regressions rode through every per-merge static check and were caught
  ONLY by `verify --push`: a dropped `SUMMARIZE_SOURCES` enum member left a stale fixture in the
  routing-coherence int-suite (healed to `undefined` by `.catch`), and a renamed row-kebab menu item left
  a CT asserting the old label.
  - **A value/UI-changing merge is NOT graduated on `pnpm check` alone.** Its lane must RUN the
    CT/integration suites that assert the changed value + repo-wide-grep the literal across `tests/`;
    brief lanes to do this and to treat "No CT" as a claim owing a grep, not a default.
  - **Run ONE `verify --push` when the merge train drains, and ALWAYS before a push — never push on a
    static receipt.** Budget for it to find \~1 stale coupled site per value-changing lane; that is
    EXPECTED, not a surprise — fix it and re-certify. Background it (setsid + `.exit`), read the file,
    NEVER stack a background watcher while it matters (\[\[polling-reaps-your-own-background-task]]) — but
    DO actively read the `.exit`; a finished battery that sits unread is the same skip.
  - **A lane's COLD-worktree red OUTRANKS your warm read.** PTRGATE's cold `types:graph` red was REAL;
    dismissing it as a "worktree artifact" against a battery that PREDATED the merge cost a red main.
    Reproduce a dismissed red on a CLEAN tree before calling it an artifact — the fresh worktree compiled
    the truth. (\[\[shared-value-change-owes-a-battery-not-static]])
- snap is STUDIED IN FULL in `side-eye.md`: `--eval` takes a BARE arrow (an arrow-IIFE double-invokes);
  `--jsclick` for list rows; `--isolated`/`--dirty` beat dev-stack HMR; `--goto`/`__orb.nav` for SPA
  reach; `--file` renders committed HTML mocks; `--contexts` now works ALONGSIDE the dev stack (the
  fixture is an offset-pair sidecar since `73f78c81`). **The hover-loop class is REAL-POINTER-ONLY** —
  synthetic/CT/CDP-discrete are all blind; assert the structural invariant instead.
- `pnpm ast refs/jsx/orphans/unwired/chains` (resolution-based, beats grep) to verify a lane's deletion
  and sweep claims. Probes: snap + design-audit + perf-meter + motion-audit + `pnpm record`.
- Chrome MCP (claude-in-chrome) for live pairing with the owner: CDP hover survives screenshots, zoom
  regions, in-page counter probes — the tool for "I see it but can't shoot it".

**⚑ WHAT THE 2026-08-03 EVENING TAUGHT THE ORCHESTRATOR (read this before dispatching anything)**

- **A LANE'S COLD CHECK OUTRANKS YOUR WARM ONE.** Main is the only tree that accumulates state across
  dozens of edits; a fresh worktree always compiles cold. When a lane reports a red your own check calls
  green, **believe the lane and go looking.** Two did exactly that tonight and were right both times.
  (`incremental` is now OFF, which kills this specific instance — the asymmetry of trust remains.)
- **A BOARD ROW STATES ITS EVIDENCE METHOD OR IT IS A LEAD, NOT A ROW.** Measured: **six rows misdirected
  six lanes in one evening**, and a re-verification pass found a **\~50% defect rate TWICE** — once on the
  original grep pass, and again on the section the board presented as *"100% covered, verified."* Rows
  written from a grep, or copied from another document's citation, are unverified by construction. Say
  which they are.
- **BRIEF EVERY LANE TO RE-VERIFY ITS PREMISE FIRST, AND SAY THAT A CORRECT REFUSAL IS A SUCCESS.**
  Tonight refusal was the MAJORITY outcome and the highest-value one: 4 of 7 smalls refused; one lane
  refused its row and found a defect ten times bigger; one refused the brief's mechanism and found the
  obvious fix would have been a no-op that looked correct; one refused to accept a law that was prose.
- **TWO AGENTS AGREEING IS NOT CORROBORATION** when both read the same artifact from the same place —
  their agreement is correlated, not independent. Two lanes agreed "biome is broken in worktrees"; the
  owner challenged it, and a two-second probe showed the config was simply malformed.
- **A ✅ WITH A PROSE TAIL OVERSTATES COMPLETION.** The `@orb-gate-ignore` debt sat as a prose bullet
  under a ✅ LANDED item with no checkbox — so the board's own visual state said done while a real debt
  remained. Same shape the HISTORY-GRADUATION rule names (four graduated docs, every survivor a prose
  tail). **A remainder belongs in a checkbox, never in a paragraph.** An audit of the other ✅ items for
  this shape is OWED and has never been run.
- **MIS-SCOPED ROWS LET A LANE REPORT DONE TRUTHFULLY AT 1%.** `DOCLAW-RPG-REFS` scoped a tree-wide
  problem (4,066 refs / 1,151 files) to one file that is \~1% of it. Check a row's true blast radius
  before dispatching, or the tick is a lie nobody told.
- **PUT THE HAZARD IN THE BRIEF, NOT JUST THE TASK.** Every lane that avoided a trap tonight avoided one
  the brief named (the `AbortSignal.any` reason-propagation bug, the narrowest-real-host rule, the
  three typecheck programs). Every trap that bit was one no brief mentioned.
- **Mechanics:** backticks inside a `git commit -m "..."` are COMMAND-SUBSTITUTED by bash and silently
  eat the word — always use a single-quoted heredoc (`-m "$(cat <<'EOF' … EOF)"`). And a `PreToolUse`
  hook returning `defer` KILLS subagents (they have nobody to prompt); pass-through must be `allow`.

**⚑ WHAT 2026-08-07→08 TAUGHT THE ORCHESTRATOR (the Base UI + dogfood double campaign)**

- **Verify the agent-id↔lane mapping against the DISPATCH RESULTS before every SendMessage.** Two
  misroutes in one night (both bounced correctly by the receiving lane — the briefing discipline
  held, but the routing was mine). Keep the live roster in the compact snapshot.
- **The no-chain law extends to VERIFY: never `merge && pnpm check` in one command.** A conflicted
  merge under `&&` silently skips the check and the notification reads like a verify failure.
  merge → separate verify → teardown, three calls, always.
- **Warm-agent LEGS beat fresh spawns** (owner preference, cache economics): STATLAS's rig-fix
  leg, DOG-DEBUG's arm-A leg, DOG-ENGINE's live-receipt leg — SendMessage resumes with full
  context. Don't tear down a worktree whose lane might get a next leg.
- **Board python edits: anchors DRIFT under format-md rewrap.** Grep the CURRENT text or use
  line-ranges; never assert on remembered text — one format-only commit shipped under a
  content-claiming message and needed a corrective.
- **A fence/instrument claim needs a planted POSITIVE control before its zero is trusted** — four
  lying instruments in one night (knip's dependency lens vs a bare probe file, globSync's
  string-not-Dirent exclude, ast-grep's bare-identifier vs property\_identifier, a depth-capped
  type reader). The probe that would have caught each was one planted file.
- **A lane refusing the brief was the highest-value outcome again** — five premise-kills in one
  session (idle-timeout, Menu.ScrollUpArrow, per-chat connection, field-control-33, RUNTIME-VARS).
  Keep briefing the refusal right explicitly; keep marking which brief claims are VERIFIED vs
  RELAYED.

**⚑ WHAT 2026-08-07 TAUGHT THE ORCHESTRATOR (the identity-spine + fork-security + phone day)**

- **A SIDE-EYE SYMPTOM IS GOLD; ITS MECHANISM PRESCRIPTION IS A PROPOSAL.** Check any structural
  prescription against the D-ledger AND the touched files' headers BEFORE relaying it. I forwarded
  "drop both panel toggles from the phone" verbatim; the lane found it would reverse an owner-ruled
  law stated in two headers, and killed the finding's stated mechanism with the reviewer's OWN
  screenshot. Three forks this day turned on one principle: **a prescription is satisfied when its
  SYMPTOM is dead — do not reverse a recorded ruling to satisfy the letter afterward.**
- **WHEN A RULING'S PREMISE DIES, RE-RULE — DO NOT DEFEND IT.** I preserved a row's 32% name lane
  because a cluster "reserves the words"; at `pointer: coarse` those words are `display:none`, so
  the premise was false on the surface in question. A ruling holds where its premise holds.
- **BATCH THE FRESH LENS BY CHUNK, AND BRIEF IT TO ATTACK THE CLAIM, NOT RE-RUN THE SUITE.** Three
  multi-chunk verifiers this day; the refutations came from driving PRODUCTION shapes and from
  attacking the lane's own flagged judgement calls. **Nine passes, six refutations — every one a
  defect that was already merged, gate-green and believed done.**
- **ANY GATE RESULT TAKEN DURING A MERGE WINDOW IS VOID** (verifier-authored, after my conflicted
  merge fooled its whole-tree check): it read `exit 2` / 4 red stages, traced every one to conflict
  markers in a file whose `git show HEAD:` copy was clean, watched HEAD advance under it, and
  re-ran on the settled tree — all green. **A verifier or lane that sees an impossible red should
  check whether main is mid-merge BEFORE diagnosing.** Corollary for me: a merge window is a
  quiet-hours window for every whole-tree instrument on the box.
- **NEVER PIPE `git merge` — I DID IT AND IT COST A CHECK.** `git merge … | tail -1` SWALLOWED a
  conflict, `pnpm check` then ran against a tree full of conflict markers, and the verdict came back
  **exit 2 (TOOL-ERROR)** with tsc reporting `TS1185: Merge conflict marker encountered` — a red
  that looks like a code defect and isn't. The board already carried the no-chain law from two
  earlier burns; the pipe is the same law's other half. **Merge BARE, read the whole output,
  THEN check.** Recovery when it happens: `git merge --abort` (never `reset --hard` with
  uncommitted work), then send the LANE to merge main into its branch and resolve.
- **A FENCE THAT HOLDS IN INTENT STILL COLLIDES IN LINES.** I fenced two lanes onto the same file
  by RESPONSIBILITY (one owns the layout, one owns an aria-label string) and they still conflicted,
  because adjacent edits in one file are a git problem, not an ownership problem. When two lanes
  must touch one file, either sequence them or expect the resolve — and give the second lane the
  first's exact change in the resolve brief.
- **LOAD + INSTRUMENT COLLISIONS ARE ORCHESTRATION BUGS, not bad luck:** fix-leg floors count as
  gate-heavy lanes for the stagger cap · the battery's behavioral phase gets the box (an EMFILE
  killed one at 5 vite instances / 161 test processes) · NO whole-tree instrument runs while a
  verifier is live on main (its in-tree probes red-flag your battery) · never pipe the harness
  (`| tail` cost a run) · never merge while a check is mid-flight — it then measures a tree that no
  longer exists.
- **WHEN A LANE DAMAGES A SIBLING, THE ORCHESTRATOR'S JOB IS TO WARN EVERY MID-RUN LANE** — a mass
  failure with no cause is indistinguishable from a real defect, and the phantom costs more than the
  accident did.
- **BRIEF EVERY LANE THAT A CORRECT REFUSAL IS A SUCCESS — it produced SIX premise-kills, THREE of
  them against briefs I wrote.** The lanes that beat their briefs did it by reading a contract the
  brief never mentioned (a leak-free NOT\_FOUND; a shared per-turn registry; a nonexistent Duplicate
  command). Put the WHY in the brief and they can tell you when the why is wrong.
- **Lane deliverables that are TEXT go in `docs/…`, not in a report** — `reports/` is ephemera and a
  D-entry that lived only there had to be re-derived from the tree weeks later.

**Owner cadence**

- He answers question-tool batches fast and almost always takes the mantra-marked arm — pose ALL
  pending forks, batch of \~4, recommendations marked; text-list the minor defaults you're taking under
  proceed-in-full.
- **When he says "read the reports in full" — do it.** The summaries drop load-bearing items (proven
  twice).
- **He challenges PREMISES, correctly and often** (tag reorder, display ephemerality, databank
  section). When a queued item's premise dies, say so and re-rule — don't build the boarded letter.
- Publish mocks as artifacts for his eyeball (four config-rail mocks ruled two forks in minutes).

**Compact ritual**

- Any OWED DELIVERABLE (unanswered owner question, undelivered report) gets written INTO this board
  before compact — never trust the summary to carry a whole deliverable across the boundary.
- The context-sentinel can fire a STALE \~99%-full warning on the first post-compact turn — ignore it.
- MEMORY is SYMLINKED across both accounts (one store, either login).
- **Resume read order:** this board (whole file) → `git log --oneline -40` → `MEMORY.md` (auto-loads) →
  `docs/architecture/core/AGENTS.md` for architecture work → the history archive only if you need the
  archeology of a specific landed program.
- AGENT-DEF REFINEMENT LOOP: at lane completion, occasionally ask the agent for onboarding friction and
  fold the good answers into `.claude/agents/*.md` / `.claude/agent-doctrine.md`.

## ═══ STANDING FACTS + POSTURE ═══

- **⚑ THE NEO-PARITY ORACLE IS A FLOOR WE'VE PASSED, NOT A GOLDEN (owner, 2026-08-07).** `pnpm
  test:parity` (`parity-runner.ts` + `pipeline-breakpoint.parity.test.ts`) diffs orbweaver's SHAPE-phase
  history + §8 cache breakpoint against `fixtures/parity/neo-reference.json`. **We have EXCEEDED neo —
  where our shape diverges, ORBWEAVER is correct.** A red parity diff = confirm it's one of our
  improvements, then RE-CAPTURE/ANNOTATE the reference; **NEVER** change `assembly/shape.ts` to match neo.
  Same for the ST-parity suites (`tests/kit/macro/st-parity*`). \[\[neo-parity-oracle-is-a-floor-not-a-golden]]

- **Stack:** `pnpm stack restart` defaults `ENGINES_POSTURE=adopt-only`; `--force` is the ONE
  fleet-killer. Engines: `pnpm engines:{wake,sleep,status}`; truth = `GET /is_sleeping` (`/health` AND
  `/v1/models` both LIE while asleep); the hold marker refuses auto-wake. Wake-on-demand is built into
  the server's vllm request seam (single-flight, fail-loud). No stack restart mid-battery.

- **⚠️ BASELINE SQUASHED 2026-08-03 (DBFIX, `e9e76f35`)** — `workloads.source` → `admission_key` + the
  two index keys + the dropped CHECK. **The dev db DROPS on next boot**; back it up first if anything
  in it matters, then let the latch re-migrate + reseed. The owner's hand-entered regex scripts are the
  usual casualty (\[\[backrest-recovery-and-cited-reports]]).

- **DB:** pre-launch, schema changes SQUASH into `0000_baseline.sql` — a baseline regen DROPS the dev db
  on next boot (backup + re-migrate, reseeds via the latch). Announce it when squashing. **NEVER bare
  `sqlite3` on the live db** — probe COPIES or `/api/_debug/*`. Wire capture:
  `GET /api/_debug/wire/captures?chatId=…` (`x-debug-token: dbg`).

- **Worktree lanes:** the auto-hook creates `wt/<name>` from local HEAD + `pnpm install` (2s/48MiB);
  NEVER `enableGlobalVirtualStore`. ONE committer on main; lanes commit with PATHSPEC and must
  `git add` new files first; lane cwd RESETS across notification boundaries. Semantic conflicts on a
  lane's own files → abort and send the LANE to merge main into its branch.

- **Probe harnesses:** `scripts/probes/rpg-extraction/` (`run-coverage.ts` env-driven ·
  `steer-probe-real.ts` · `local-8b-vehicles.ts` with resumable `SPIKE_ARMS` · `card-teach-probe.ts`).
  Score against OPPORTUNITIES and through the PRODUCTION tokenizer (emitted ≠ rendered).

- **The extraction-mode map is EMPIRICAL** (spike §4f-§4h — read it before ANY mode work): hosted strong
  × folded = the proven default · agent-sdk wire = no terminal channel → LOUD fallback round · local
  vLLM × folded = prose-silenced → the `local-engine-fold-guard` runs the cheap round · **cheap is the
  local champion** (grammar-bound via `tool_choice:"required"`). `reliable` was CONTRADICTED by
  measurement and DELETED 2026-08-01.

- **Orchestration:** delegate volume, keep judgment; a fresh-context verifier/side-eye before any
  non-trivial "done"; diff an executor's self-flagged "deliberate deviation" against the SPEC TEXT
  before minting law (\[\[spec-completeness-no-improvisation]]).

## ═══ THE RECEIPT TRAIL ═══

Everything this board used to carry inline — the 2026-08-01→08-03 snapshots, every lane seal with its
merge sha, every superseded ruling, the whole burn-down archeology — lives at
[`docs/history/retro-workboard-2026-08-03.md`](history/retro-workboard-2026-08-03.md), audited and
intact. `git log --follow docs/retro-workboard.md` is the other half.

---

# APPENDIX — the absorbed remaining-work ledger (verbatim, absorbed into the board 2026-08-08)

---
kind: ledger
status: authoritative "what's left" — reconciled against the tree 2026-08-08
supersedes-for-status: the scattered OPEN rows in docs/retro-workboard.md
updated: 2026-08-08
---

# Retro — remaining-work ledger (the single "what's left")

**What this is.** One deduped, ranked, re-verified list of everything that still reads as open across
`docs/retro-workboard.md` (2,272 lines), the four `docs/design/parked-options-*.md` decision docs, the
gap-audit, and the standing owner items — with each item's board/doc SOURCE and a LIVE or STALE receipt.
The board's measured stale rate on grep-sourced rows is ~50%, so **every item below was re-checked against
the current tree** (`main` @ `16ef01478`); I did not trust a row's own status.

**The headline reconciliations this pass produced** (read these first — the scattered board contradicts
itself on all four):

1. **AUTHFIX-2 is CLOSED, not open.** The board's big "AN OPEN UNAUTHENTICATED HOLE" section
   (`retro-workboard.md:355-392`) is STALE — superseded by DEBUGGATE, which graduated (`:173-185`).
   Verified live: `foundation/observability/debug/routes.ts:142-149` now carries an AUTHFIX-2 marker and
   the middleware gates on `DEBUG_GATE_CREDENTIALED[principal.via]` (`entry/auth/seam.ts:264,325`);
   `via:"fallback"` maps to `false`, so `/api/_debug/*` no longer 200s to an un-credentialed caller in any
   mode. Only the two OWNER OPS remain (rotate `DEBUG_TOKEN`, set `IP_ALLOWLIST`). **See F1.**
2. **Databank pagination is BUILT** (server + client), not the open ceiling the board's "new boarded row"
   (`:934-937`, `:721-722`) describes. Verified: keyset cursor in `databank/verbs/list.ts:25-36` +
   `contract/params.ts:75-78` + `results.ts:26-32`; client infinite-query `getNextPageParam:
   lastPage.nextCursor` at `databank-library-surface.tsx:82`, "100+" honesty at `databank-model.ts:243`.
   Only a **live-drive >100-doc verification** is owed. **See E5 + F2.**
3. **I-2 DATABANK is CLOSED** (S1+S2+S3 all merged, `88508bb6e` + fixes). The `### I-2` header still says
   "S3 unbuilt" (`:1239`) — STALE. **See F3.**
4. **capability-gate wiring is genuinely OPEN.** Verified: `features/preset/components/capability-gate.tsx`
   still hardcodes "This is a routing problem, not a missing connection" (~:66) and does NOT import the
   shared classifier; `resolve-failure.ts` exists and owns the discrimination. **See B1.**

Ranking is by consequence within each category. Coverage limits are stated at the foot.

---

## A. IN-FLIGHT (lanes running now — reconcile at their merges)

Confirmed live: worktrees `agent-forge-docker` and `agent-refinery-r0` present in `git worktree list`;
neither deliverable has landed on the tree yet.

- **A1 · REFINERY R0** (forge, worktree `agent-refinery-r0`). Contracts+db foundation: F1 new
  `domain/refinery` · F3 fixed payloads · F4 stage-mode enums · F5 card-fields v1; verify the pre-built
  scaffold, add only what's missing, DB baseline squash. **Receipt it's real:** no `packages/server/src/
  domain/refinery/` and no `packages/contracts/src/refinery/` dir exist yet. **Security-executor pass is
  MANDATORY pre-R1** (untrusted card → LLM → write-back); R1+ waits on R0's review. Design:
  `docs/reviews/stickler/2026-08-08-card-refinery-port-study.md` + `-nl-schema-design.md`. Owner already
  RULED the build with F1-F5 (`:694-698`).
- **A2 · FORGE #4 — containerize BUILD** (forge, worktree `agent-forge-docker`, on top of the landed
  research `a7c550e3e`). Prod Dockerfile(s) + docker-compose + `.dockerignore` against
  `docs/design/containerize-prod-image-spec.md` (2-profile) + the research, PLUS the profile-2 code changes
  (`VLLM_ENGINE_HOST` at engine-url.ts + egress.ts, GPU-detect-under-posture). **Receipt:** only
  `.devcontainer/Dockerfile` exists on the tree. **Then:** security-executor reviews §8 (secrets, auth-mode
  env, `AUTH_FALLBACK=deny`, the Host-mint control) before done; the image build+cage is the OWNER's live
  step (a lane cannot `docker build` the GPU image in a worktree). Board: `:614-625`.
- **A3 · Preset/config batched side-eye** (`a528c629d6a4aa017`). The deferred rendered lens over FORGE#1
  (Actions-tab IA) + POLISH-CLUSTER + PROSE-GEOMETRY preset/config surfaces. Board: `:71-92`, `:563-583`.
  **This gates B1/B2 (queued behind it to avoid surface collision) AND the conditional push word.**

---

## B. DISPATCHABLE NOW (buildable, no owner ruling needed)

- **B1 · Wire CapabilityGate → `resolve-failure.ts`** (board `:553-558`). **LIVE-VERIFIED OPEN:**
  `capability-gate.tsx:~66` hardcodes "This is a routing problem, not a missing connection", but
  `resolveChatCapability` can fail `PRECONDITION_FAILED` (`DomainNoCredentialError` = literally a missing
  credential — the claim INVERTED), `NOT_FOUND`, or 500. The shared classifier
  (`features/preset/lib/resolve-failure.ts`) already owns the discrimination and is consumed by
  `readout-parts.tsx`. ~3-line change. **Queued behind A3** (same preset surface).
- **B2 · Prompt-view section-drill fork-eject** (FORGE#1 finding (b), board `:582-583`). The Prompt view's
  section drill has the SAME local-drill-state fork-eject class the Actions-tab store-axis fix already
  solved; apply the store-axis fix. **Queued behind A3.**
- **B3 · Populate-round prose migration** (`docs/design/prose-1-populate-census.md`). 7 model-facing slot
  candidates (`POPULATE_SYSTEM_HEADER`, the inline identity clause, `POPULATE_DOCTRINE`, 4 `populateUserPrompt`
  labels) still hardcoded; all follow the existing `rpgProse(...)`/`spliceProseTokens` convention — new
  `RPG_PROSE_SLOTS` rows + call-site swaps, no new machinery. PROSE-1 class already ruled
  (`prose-is-user-editable`). Rows 8-10 (host toasts) correctly excluded.
- **B4 · `respell` derive-or-cite** (SMALLS, board `:1536`). `DigestsParams`/`SegmentsParams` ≡ contracts
  `MemoryQueryOptions` — a cite-or-derive cleanup (its `MemoryBackfillCounts` twin is already gone). Tiny.
- **B5 · `no-test-fabrication.baseline.json` regen** (board `:1132`). Stale ~15 rows (deleted files,
  absorbed shrinks). One-line shrink-only cleanup; belongs to whoever owns the tree.
- **B6 · `fork.ts:154-155` stale comment** (board `:1134`). "no production writer yet" is false since
  `c197ce01b` landed the host-plane-strip writers. Comment-only truth-repair; the strip itself is correct
  and PROVGATE passes it.

---

## C. OWNER-DECISION (needs his ruling — recommended arm from the options doc)

### Persona / prose cluster
- **C1 · persona = character** — OWNER-SACRED. Design: `docs/design/persona-character-kind-substrate.md`
  (5 forks in §10). **Rec: Phase D now** (kind-polymorphic cast producer — `CAST_KINDS`+`CAST_KIND_POLICY`,
  no table, no pin-layer moves), **then Phase C** (4-field card-face substrate `@orb/contracts/card-face`,
  shape-only). Reading B (persona-as-character-with-a-flag) is OFF THE TABLE (collides with D122/D131).
  Fork-by-fork recs: (1) Phase C after D, before agent-principal; (2) home = contracts; (3) 4-field
  overlap only, not full-card; (4) NO character-arm description in the cast entry; (5) build lane mints
  D137. Behavioral gate: `persona-resolution.suite.int.test.ts` byte-untouched. Parked-options
  `parked-options-persona-prose.md` §1.
- **C2 · `{{note}}` warn-vs-block** — `docs/design/note-token-intent-history.md` +
  `parked-options-persona-prose.md` §3. **Rec: Option C** — reclassify `{{note}}` as a CARRIER token that
  BLOCKS at write (join `FORMAT_STRING_CARRIER_TOKENS`), keeping cosmetic `{{name}}`/`{{names}}` as warns.
  Intent archaeology: warn-never-block was a mechanical inheritance, never a decision about `{{note}}`
  specifically; the `{{entry}}` carrier-block ruling (2026-08-02) drew its line while the note frames were
  still prose slots. **LIVE-VERIFIED still warn:** `FORMAT_STRING_CARRIER_TOKENS` (`preset/index.ts:734`)
  is still only `wiFormat`/`{{entry}}`; the note frames carry `caps:[{kind:"tokens",tokens:["{{note}}"]}]`
  (`:935`). Reverses a recorded posture — owner rules the fork.
- **C3 · The 3 nudge default TEXTS** (owner veto; `parked-options-persona-prose.md` §2, board `:1443`,
  standing #2). **Rec: ship all three verbatim** (`speakerTags` v1 · `narratorNudge` v1 · `roundNudge` v2),
  and do NOT add a token to `speakerTags`. They are already version-bumped and read as clean model
  instructions. LIVE (defaults, so every unedited room ships these bytes today).

### Config-rail / portability cluster (`parked-options-config-port.md`)
- **C4 · Presets into the config rail** (owner-timed; §1, standing #4, board `:1256`). **Rec: arm 4** —
  leave presets standalone, KILL the false "one array member" premise (verified: presets is already its
  own top-level rail section, not a config collection; folding needs 3 seam extensions), migrate properly
  as a scoped seam job when the owner feels it.
- **C5 · JSON-card export affordance** (§3, standing #8, I-6). **Rec: arm 1** — the server arm shipped
  (`?format=png|json`, verified `export.ts` + `export-character.ts`); add a PNG/JSON submenu to the
  character kebab mirroring the chat kebab. ~10 lines. Pure "surface a built capability."
- **C6 · Landing-cards + "New book" duplication** (§2, board `:699` owner DEFERRED). **Rec: arm 2 (split
  the class)** — fix the landing at the child level (each `CollectionLauncher` drops count+create once
  populated, keeps the blurb), KEEP the New-book double affordance (mock-ratified + CT-pinned + owner-drawn).

### Tag taste-calls + contract cap (`parked-options-tag-contract.md`)
- **C7 · guided-prompt contract cap** (§2, board `:628-633`). **Rec: Option 2** — introduce shared
  `MAX_INJECTION_TEMPLATE_LENGTH` (=10000) referenced by BOTH `formatStrings` and `guidedActions.*.prompt`,
  plus wire the UI `maxLength`. **LIVE-VERIFIED still open:** `guidedActionConfigSchema.prompt` is
  `z.string()` uncapped (`preset/index.ts:337`), reaches DB + model wire unbounded; no
  `MAX_INJECTION_TEMPLATE_LENGTH` constant exists. The lone uncapped authored-text field in the contract.
- **C8 · Four tag taste-calls** (§1). Recs: **1a** tag-only backup button → **SKIP** (bundle already
  carries `tags.json`); **1b** import Ask/All/Existing/None → **KEEP ours** (durable queue is strictly more
  capable); **1c** retire manual/`sortOrder` → **KEEP** (owner-ruled `tag-sort.ts:9-10`; reversible middle
  = drop the mode, keep the column); **1d** folder OPEN vs CLOSED → **build OPEN, defer CLOSED** (else drop
  the write-only `folderType`).

### Ops / posture cluster (`parked-options-ops-posture.md`)
- **C9 · AGENT-1** (standing #7, board `:1824`). **Rec: SPLIT.** The credential is an OWNER ACTION
  (re-auth Claude Max OAuth on the host — the refresh code is correct and fails safe; `host-token.ts:85-87`).
  Arms 1-3 (knob honesty, reasoning-visibility parity, usage/context parity) are a **buildable lane that
  does NOT need the credential** (unit/CT against recorded wire shapes + the OpenRouter arm). Only arm 4
  (live rpg-lite loop on the SDK wire) is credential-blocked. Surface to owner: "three of these don't wait
  on your OAuth."
- **C10 · `--include-entry-exports`** (knip whole-repo posture; §2 + `barrel-star-reexport-residue.md`).
  **Rec: arm (c)** — enable AFTER the barrel amputation lands (else it buries the 85 Tier-A findings under
  every legitimate entry export). Keep the 2 sanctioned db-schema stars via `/** @public */`.
- **C11 · Barrel amputation worklist** (the 135-name follow-up; `barrel-star-reexport-residue.md` §4,
  board `:668`, `:1775`). The root-fix conversion LANDED (57→28 stars); what's HELD for a quiet tree is the
  per-symbol amputation: **Tier A 85** (dead once the barrel line drops — each needs delete / `@public` /
  header-cite; several are RPG_* shape-data protected by module law) + **Tier B 50** (surplus barrel line
  only, zero-risk drop). Owner-timed / needs a drained tree.

### Refinery / containerize residual forks
- **C12 · Refinery F6/F7** (port-study §6). F1-F5 already ruled. **F6 auto-stamp** rec: every analyze
  refreshes `characters.refinery`, `applyFields` auto-snapshots first, prose baselines owner-signed.
  **F7 retention** rec: no caps v1. Low-stakes — fold into R0/R1 unless owner objects.
- **C13 · Containerize deploy decisions** (spec §7 forks + §8). Mostly folded into A2, but the deploy-time
  posture is owner's: `AUTH_FALLBACK=deny` default for public multi-user, `OWNER_HANDLES`/`OWNER_GROUP`
  provisioning, and the live image-build + pentest-cage sequencing.

### Standing owner items still genuinely open (his word only)
- **C14** DRAFT-TRUST server render-policy seam (standing #6, architecture call) · **VRAM-refusal drill**
  live arm (#11) · **v3-transcripts-reach-new-installs-only** heal (#12) · **RV-13 branch-and-save game
  modes** — ready to spec now that PROSE-1 landed (#13) · **unsent-draft reload persistence** fork (#14) ·
  **chars+chats one-glyph rail merge** — owner-timed (#15) · **trust-gated card images doorway** — design
  fork, owner-timed (board `:1594-1599`) · **mid-session persona↔rpg-state linkage** — OWNER-SACRED,
  ruled-flavor recorded, DO NOT BUILD (I-8, `:1446-1452`) · Meteocons/grimstone/chat-options-placement
  taste tail (#18).

---

## D. OLDER OPEN (archaeology / forgotten — re-verify CONFIRMED still real)

- **D1 · AMBIENT-NONE-AFFORDANCE** (S; board `:1829`). `RPG_WEATHER_TYPES`/`TIME_OF_DAY` are closed vocabs
  with no "none"/unset member, so weather+timeOfDay can't be cleared (location/date are free text and can).
  The UI gap behind the unreachable compact ambient arm. Still real per the board's own description; small.
- **D2 · Tool-round wire-capture blindness** (DOG-ENGINE find; board `:1584-1585`). The tool-round provider
  call has no `captureWire` sink, so `update_scene` traffic never reaches `/api/_debug/wire/captures`. One
  sink at the tool-round call site closes it. (Verify against the tree before building — see E7.)
- **D3 · CPD opportunistic dup rows** (board `:1555`) · **TYPO class-A 27 as-const tuples** (`:1557`) —
  consolidate only when next IN the file; no dedicated lane (DRY-not-gospel). Low.
- **D4 · WAKE-STATUS** (`:1565`) — the 3s engine wake is silent; revisit only if it feels laggy. Watch.
- **D5 · LAUNCH-DAY (I-10, `:1514-1524`)** — three day-of items, none actionable until launch:
  the **REGIME-2 db-baseline landmine** (`structure:db-baseline` must be re-pointed at the applied chain or
  it reds every incremental) · the **two-switch migration-regime flip** · the **h3/QUIC checklist**
  (Caddy h3 + UDP 443 open). Keep parked to the day.
- **D6 · Surface-manifest FORMAT ping-pong** (board `:1583`) — teach `gen-baseui-surface.ts` to emit
  biome-format so a regen can't fight the formatter. Small tooling. (Not re-verified live — see limits.)
- **D7 · `.claude/hooks/biome-check.sh`** lints the guard file `biome.json` says to skip (board `:1580`).
  Own small. (Not re-verified live.)

Note: the ARCHIVE-RESCUED "BOARD THESE" list is mostly struck (see F). The survivors that are genuine
open work — PRESET-SLIDER-VERIFY, fillRule-evenodd probe, narrowest-mount gate, E2E_LIVE — are
verification/report-then-decide items and live in **E**, not here.

---

## E. VERIFY / INVESTIGATE (report-then-decide, not a build)

- **E1 · prod-build CLS window** (`docs/design/prod-build-cls-investigation.md`). Dev home-boot CLS 0.134
  (>0.1) stands; the prod launcher EXISTS but :8788 is held by the live dev stack. Cold-dev-module-graph
  is the leading unconfirmed suspect. Run `pnpm stack up prod` (staged client build, non-8788 PORT) and
  re-measure when a window opens.
- **E2 · PRESET-SLIDER-VERIFY** (S; board `:1677`). The preset program closed without re-verifying the
  slider deck on a vLLM/OR connection (sonnet-5 exposes no sampling knobs, so the deck was never seen
  rendered). Its own crunch list demanded it.
- **E3 · E2E_LIVE=1 pnpm e2e** owed on a push window (board `:1574`) — never re-confirmed since the era's
  start. Also flagged on every push window in the compact snapshot.
- **E4 · narrowest-mount row gate candidate** (side-eye 08-08; board `:1600-1604`). The class behind both
  gap-audit P1s: a `Row` with a `shrink-0` trailing cluster sized wide and never re-measured at its
  production width (persona row 358px, theme band 256px, ...). Candidate rule: such a row owes a CT at its
  narrowest real mount asserting the leading text block ≥50%. Gate-shaped; report-then-decide (ASTLENS
  precedent).
- **E5 · Databank pagination live-drive** (board `:634-636`). Pagination is BUILT (F2); DBANK-HOME proved
  reach+geometry via a keyset-contract STUB, not a live SQL keyset under a real shell with a >100-doc bank.
  Cheap verification-completeness add.
- **E6 · fillRule=evenodd fillable-set probe** (S; board `:1821`). The one live icon-seal candidate —
  probe whether `evenodd` usefully grows the fillable icon set; needs a side-eye gallery verdict.
  Owner-optional, not debt.
- **E7 · `countByBook` twins** (UNKNOWABLE; board `:2011-2014`). REGROSTER flagged a 2-instance dup; today
  the symbol has exactly one home (`world-info/persistence/queries.ts:81`). Either already dissolved or
  under a different spelling — needs a look before anyone acts.
- **E8 · `names.ts:2` header vs code** (gap-audit #6). Header says the name-stamp is "Applied AFTER
  squash"; `shape.ts:213` applies it before. A Documentation-Law §1 doc-truth defect — verify a later
  assembly lane didn't touch the header, then repair in-commit. Low.

---

## F. STRUCK AS DONE / STALE (re-verify found these already closed — do NOT re-chase)

- **F1 · AUTHFIX-2 (the "open unauthenticated hole")** — CLOSED. `retro-workboard.md:355-392` is superseded
  by DEBUGGATE's graduation (`:173-185`). Live receipt: `debug/routes.ts:142-149` + `seam.ts:264,325`
  gate on `DEBUG_GATE_CREDENTIALED[principal.via]`, `via:"fallback"` = false. **Residual = OWNER OPS only:**
  rotate `DEBUG_TOKEN`, set `IP_ALLOWLIST` (still unset with `WIRE_CAPTURE=on`).
- **F2 · Databank pagination (the 100-doc ceiling BUILD)** — BUILT server+client (keyset cursor +
  infinite-query + "100+" honesty; receipts in the headline). Only the live-drive verify (E5) remains.
- **F3 · I-2 DATABANK S3 / "S3 unbuilt"** (`:1239` header) — CLOSED. S1+S2+S3 merged (`88508bb6e` + fixes);
  board itself says "I-2 CLOSED" at `:711`, `:906`.
- **F4 · pointer-coarse-in-features gate** (`:466-473`) — MINTED as `no-pointer-variants-in-features` by
  PTRGATE (194→195, `:235`, `:477`).
- **F5 · run-coverage.ts widgets bug** (`:489`) — FIXED (`20b883e3e`, `:519`).
- **F6 · DOCLAW-RPG-REFS** (`:1832`) — the carve-out is already in `Documentation-Law.md:114` (`:1114`).
- **F7 · MACRO-CAST-GUIDES** (`:1835`) — already threaded at `rpg/chat-ops/macro-view.ts:144-150` (`:1121`).
- **F8 · ZOD-STAGE-D** (`:1826`) — all three legs landed (`:1118`).
- **F9 · IMPORT-SETTINGS-WRITE-GUARD** (`:1847`) — PREMISE-DEAD (routing fenced out of
  `SHARE_SAFE_SETTINGS_NAMESPACES`; no import can carry it) (`:1096`, `:1540`).
- **F10 · tsx-shedding migration** (`:1776`) — DONE 2026-08-03, all four stages.
- **F11 · CRUNCH (a) hardcoded injection note-framings + (b) two templating systems** (`:1610-1621`) —
  (a) the note frames are now PROSE-1 slots (`chat.injection.systemNote`/`userNote`); (b) the (b)
  unification is COMPLETE (`:1082`, `:1101`).
- **F12 · st-goldens re-sweep / STATLAS leg 2** (`:1608`) — LANDED (`56af5ea2e`).
- **F13 · The 17 `.mjs` probes → `.ts`** + **node-26 §8 gate** (`:1578`) — DONE (PROBES-TYPING `56ae7f493`;
  NODE26-GATE `5d65bd961`).
- **F14 · Already-struck on the board (recorded so nobody reopens):** REGX2 (`:1724`) · square-glyph Button
  sweep (`:1528`, `:1802`) · icon-seal doorways (BUILD-NONE, `:1811`) · SUMMARIZE-SUB drop (`:452`) · I-5
  brand burn-down (`:1366`) · I-6 portability R6 (`:1384`) · I-7 observability (`:1417`) · per-actor
  tracker grant/revoke editor (`:1530`) · readout-parts pending-flash (`:1532`) · CapabilityGate PENDING
  arm (`:1534`, distinct from B1's wrong-cause copy) · field-reachability `.ok` (`:1546`) · R5b(a) verify
  (`:1563`) · CONTRACTS-BARREL / CODEMOD-DOCS / CODEMOD-PATHMAP / SSE-SPEC-STATUS / PROMPT_MACROS phantom /
  EMBER-VOCAB / WORKLOADS-LABEL (all premise-false, `:1739-1846`) · L8-INBOUND (`:1753`) · HAND-EDIT-VS-FLUSH
  (`:1726`) · STRUCTURED-ABORT-REASON-LEAK (`:1705`) · RPG-ROUND-SIGNAL (`:1725`) · INFRA-WARN-DEAF
  (`:1689`) · I-1 structured-output last item (RULED keep-default, `:1162`).

---

## Coverage limits (what I did and did NOT fully re-verify)

- **Live-verified against the tree (highest confidence):** AUTHFIX-2/debug gate, databank pagination
  (server+client), capability-gate wrong-cause copy + `resolve-failure.ts`, guided-prompt cap, `{{note}}`
  carrier set, refinery/containerize in-flight status, the two live worktrees, recent git log.
- **Classified from the board's own strike-throughs + a spot read, NOT independently re-run:** most of F6-F14.
  The board struck these with commit receipts; I confirmed the receipts exist in the log where cheap but did
  not re-derive each. If any is load-bearing, re-grep before acting.
- **NOT re-verified live (accepted at board-face, flagged in-line):** D6, D7, the exact current state of
  several one-line SMALLS, and REGEX-REASONING-FIDELITY / RULED-BATCH landings (board says dispatched; I did
  not confirm the merge). These are low-consequence.
- **The gap-audit's own residual** stands: a follow-up flagged ONLY mid-transcript via SendMessage (never
  restated in a final report) is the one class neither the audit nor this ledger would catch.
- I did **not** re-drive any live UI, run any battery, or read every one of the ~2,272 board lines
  word-for-word — I read the STATE blocks, all initiatives (I-1..I-11), SMALLS/TAIL, ARCHIVE-RESCUED,
  BOARD-THESE (both passes), standing owner items, and the four decision docs in full, and sampled the
  history-archive pointers. A row not surfaced here is either struck on the board, or fell in a section I
  read but judged closed; the four decision docs + this ledger are now the precise "what's left."
