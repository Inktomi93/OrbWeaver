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
- **Merges** `--no-ff --no-verify` on branch-side hook-green receipts — BUT any branch certified
  BEFORE sibling merges landed gets a consolidated `pnpm check` on the merged result (caught reds
  three separate nights). Merge → SEPARATE verify call → THEN teardown, never chained. `git -C <ABSOLUTE-main-path>` on every merge/verify command.
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

## ═══ STATE (2026-08-08 dawn — DOGFOOD CAMPAIGN CLOSED; the queue below is live) ═══

- **✅ THE DOGFOOD CAMPAIGN IS CLOSED — the full adjudication + halt-lift verdict live in
  `docs/history/dogfood-tracking-2026-08-08.md`'s header.** Nine merged work-streams, the side-eye pass + re-verify
  (20/20 dead, one fix-regression caught and killed same-night with its CT measure fence), and the
  closing battery on ONE tree: **10,224 vitest + 2,464 CT, 0 failed, 0 flaky.** Gates **190**.
  D-ledger through **D128** (D127 compiler-owns-memoization + D128 the surface-manifest law, minted
  on the owner's word 2026-08-08; next free D129). Owner ruling queue: EMPTY — all eight
  question-tool rulings executed and receipted.
- **Campaign smalls minted this dawn (join the smalls list):** the EmptyState structural fence
  (its `@container` root collapses to width-0 under any shrink-to-fit wrapper — a `w-full` floor on
  the primitive or a rendered-measure gate; the placeholder CT carries the site fence already) ·
  12× benign `ResizeObserver loop` notices in client.log on detail-panel open (a callback resizes
  what it observes — find it when nearby) · the Connections `Protocol` sub-row needs a hierarchy
  signal (it rides Chat's tracks perfectly and thereby reads as a seventh top-level role — a
  hairline or inset).
- **Small minted by REGX2's forks:** the `deriveRegexTierFlags` → `@orb/kit/regex` LIFT (beside
  `skipsScript`, whose masks it mirrors; two consumers; \[\[axis-home-follows-reachability]]/D54 says
  kit is likely its correct home) — the one-home move that unblocks bulk PLACEMENT editing, which
  REGX2 deferred rather than mint a second derivation home. Also on record from REGX2 fork 1: the
  lifecycle-portability `{ ruled }` cells for regex single-export/import are SUPERSEDED by the
  owner's 08-03 REGX2 ruling — flipped to real DoorSpecs in that lane, headers truth-repaired.
- **Owner idea boarded (08-08 morning): the assembly LINEAGE view** — "this canon row + this
  injection BECAME that wire row" as an explicit per-row mapping in the Diagnostics drawer, the
  step past the `merged` badge (the stages data already exists in ShapeTrace). The next debug
  increment when wanted.
- **✅ PUSHED TO ORIGIN 2026-08-07 (owner word given): `4ecb3110d..292f65e08`** — 76 commits. Receipt:
  full `verify --push` battery on `853ce611a` (10,281 tests, ONE red = the IDOR sweep's completeness
  guard catching REGX2's five unclassified procs — the guard working as designed), the classification
  fix via security-executor (4 PROBES + 1 EXEMPT, NO leak found, belt-break-proven flag asserts,
  `292f65e08`), suite 2/2 green post-fix, pre-commit static 14/14. Push was `--no-verify` on that
  composite receipt (owner word: don't re-sit the battery). Lane-brief lesson: REGX2's brief didn't
  name \[\[new-router-needs-sweep-classification]] — a lane adding tRPC procs must be briefed to
  classify them in the sweep, or the landing seam catches it at push time like tonight.
- **✅ REGX2 MERGED + CLOSED (`3f17dd8b4`, consolidated check green, torn down)** — all three
  builds complete: bulk edit (3 batch verbs + the `bulkSelect` contribution field), the pipeline
  debugger (member-editor section over a pure model), the per-script JSON door (byte-equal to the
  bundle arm, test-pinned; the superseded portability cells flipped, headers truth-repaired). Two
  rendered defects self-caught at the real 330px mount — the bulk bar shipped as 2 verbs + kebab
  with a standing geometry pin; **the narrowest-mount gate candidate gains its 5th/6th receipts.**
  I-4's REGX2 row: CLOSED. Deferred honestly: bulk placement (waits on the kit-lift small).
- **✅ THE CANON-IDENTITY STICKLER IS DONE — `docs/reviews/stickler/2026-08-08-canon-message-identity.md` (931 lines), read it IN FULL before acting on any of this.** Seed ADOPTED + 2 amendments (kind never
  decides canon role — wire mapping is a SHAPE dispatch; the D55 synthetic group char stays). Core:
  `MESSAGE_KINDS = standard|narrator|comment` + `MESSAGE_KIND_POLICY` + `messages.kind` + variant
  `rawContent`/`macroFreezes` (host-plane only), one baseline regen, \~7 tsc-total dispatch sites.
  **THREE CONFIRMED DEFECTS (fix regardless of the design):** **F-A** `loadCanonThroughSeq` has NO
  `excludedFromPrompt` filter + no hidden-span strip — hidden rows RE-ENTER the prompt via
  `{{memory}}` recall (compaction filters both; recall doesn't) · **F-B** narrator purpose rides
  SET-NULL-degradable attribution + config inference, three ad-hoc spellings — purpose evaporates
  on char delete/config flip · **F-C** the volatile freeze is record-less + byte-destructive
  (pre-freeze raw discarded) — the greeting-swipe gap is unfixable until R2 lands.
  **The hash question: NO new machinery needed** (blockHash folds the right axes;
  consolidationHash cascades; only caveat = post-turn self-heal latency, correct at prompt time).
  Provider-independent canon HOLDS today (verified both paths) — mint as law + the two-profile pin.
  Membership present-predicate re-spelled \~27× → one-home presence.ts. Persona model: already ONE
  model; NO D122 amendment; kill-the-`personaIds[0]`-fallback is an owner call.
  **✅ ALL SIX §18 OWNER CALLS RULED (question-tool, 2026-08-08):** (1) kind vocabulary = the
  THREE as recommended (standard | narrator | comment; aside stays a doorway). (2) F-A fix:
  `excludedFromPrompt` GATES MEMORY INGEST — hidden means hidden everywhere derived. (3)
  hidden-span digests: SWEEP FIRST then fix at the producers evidence shows. (4) the
  `personaIds[0]` fallback: RETIRED — absent trigger fails LOUD. (5) narrator-as-system door:
  SKIPPED — owner's actual want is the TAIL system slot (memory/WI riding a non-user/assistant
  role at the tail), which the EXISTING per-model toggle already covers; depth probing deferred,
  owner's words: "that can wait". (6) comment authoring: DEFERRED — storage + render land,
  agents/system write only; human chrome is a later wave. **The identity build is now fully
  specced + fully ruled — ready to become lanes whenever the owner calls it.**
  Declared limits in §19.
- **⚑ COMPACT-SAFETY SNAPSHOT (2026-08-08, \~93% context):** tree CLEAN at the REGX2 merge; repo
  `scratch/` holds the gitignored st-console-probe; ST runtime settings.json has
  `console_log_prompts: true` (deliberate debug aid). **IN-FLIGHT:** the CANON-IDENTITY STICKLER
  (14 sections + the hash/reindex-cascade rider; writes
  `docs/reviews/stickler/2026-08-08-canon-message-identity.md` FIRST — resume via SendMessage if
  orphaned) · lane MOBILE DISPATCHED + LIVE (worktree present — resume via SendMessage by name/board if orphaned; the 08-03 owner-ruled ONE-SHELL rule: on mobile a
  list-bearing section with no selection shows its LIST as the screen, selection pushes to CONTENT
  with a back row — config + databank are the deviations to remove; resolvePanelMode
  shell-store.ts:372 + per-section CTs at the mobile frame). Owner rulings all executed; push word
  still owed on \~50 commits.
- **✅ MOBILE MERGED (2026-08-07, merge on `f8bb4a9a9`, consolidated `pnpm check` 14/14; worktree
  HELD pending side-eye).** The one-shell rule is a SHELL rule keyed on a section's list declaration
  (`list` + `selection` are ONE union arm — tsc enforces no silent sit-outs). **PREMISE CORRECTED:**
  the board said config+databank were the only deviations; measured at 320px ALL SEVEN list-bearing
  sections landed on the welcome card with the roster at x=-320 — chats' mobile landing CHANGED
  (launcher → chat list, the rule's letter). **FORK RULED (lane default, accepted):** roster is the
  default screen; the topbar list toggle still drops to a section's own no-selection CONTENT
  (`openOverlayPanel:"none"`) so the corpus/analytics dashboards stay reachable and the toggle is
  never dead. **Side-eye OWED (dispatched), carrying the lane's two copy flags:** config's pushed
  frame reads "Configuration" (no topbar header slot for the member name); corpus/analytics
  "Back to the dashboard" buttons now land on the roster. Red-first: 7/92 failed against old source,
  all through user-visible affordances. Lesson minted: \[\[fixed-panel-auto-insets-desktop-fallback]].
- **QUEUE DISPATCHED (2026-08-07, owner word "4 open lanes", canon-identity stays parked absent his
  call):** ABORT-LEAK (structured abort-reason retry) · WIRE-SINK (tool-round captureWire) ·
  TEMPLATE-CENSUS (dual templating + note framings, census-first) · SMALLS-BATCH (the six one-liners).
  HAND-EDIT-VS-FLUSH waits for a freed slot; PRESET-SLIDER-VERIFY the orchestrator drives live.
- **✅ WIRE-SINK MERGED + TORN DOWN (`09d63d289`, check 14/14):** the tool round WAS captured — but
  ANONYMOUSLY (no `chatId`), so the `?chatId=` read filtered it (\[\[wire-capture-anonymous-not-missing]]).
  `ExtractCtx.chatId` now REQUIRED (tsc fences future arms); three `runChatTurn` sites stamped
  (dedicated round · `resyncViaToolRound` · `extractViaChat`). Landing test through the real ring,
  red-first. **Residual boarded below:** the `structured` role is chatless BY CONTRACT.
- **✅ ABORT-LEAK MERGED + TORN DOWN (`3fd54bb09`, check 14/14):** cancelled provider calls can never
  classify retryable, on ANY role — fix at `runRole`, the one seam all eight cross. The row's
  `retry.ts` mechanism was FALSE; the real vector was the vendor SDK's default retryConfig
  (\[\[vendor-sdk-default-retry-surface]]). Row struck below with the correction.
- **⚑ SIDE-EYE VERDICT ON MOBILE (2026-08-07): SHIP WITH FIXES — the one-shell rule HOLDS on all
  seven sections; core algebra on the don't-touch list.** ALL findings routed to the warm MOBILE
  lane (leg 2, dispatched; merges main into its branch first): [P1] ≤~345px the topbar trail takes
  277/320px, crushing the lead to 10.7px — the back button's CENTER opens ⌘K, and it is the ONLY
  exit from a chat (root-cause fix: a mobile topbar BUDGET — lead owns back+title, ⌘K/notifications
  fold into overflow) · [P2] pushed topbar names the SECTION not the member (all sections but
  chats) · [P2] two back doors with different destinations in corpus/analytics drills (one-door law)
  · [P2] characters search clipped at 320 · [P2] corpus has TWO search inputs narrowing one list
  (single-homing) · [P3] You-sheet persona row shreds · a11y: tab bar precedes topbar in DOM order.
  Instrument lesson minted: \[\[mobile-verify-needs-coarse-pointer]] (snap --viewport = FINE pointer;
  design-audit returned 0 P1 on a frame with a P1 — no coarse mode, no overlap rule).
  Side-eye re-verify owed after leg 2 merges.
- **✅ TEMPLATE-CENSUS MERGED (`269860bcf`, check 14/14; worktree HELD WARM — the (b) unification
  build is promised to this lane, never a sibling).** The three turn-wire framings are preset-homed
  editable templates: `chat.injection.systemNote` / `userNote` + `chat.assembly.continuationNudge`
  (was a const in shape.ts). `promptConfig.prose` minted (= the unification's M1, done); the preset
  tab's third form path proven on three live rows (M2's extension point); versioned defaults are
  byte-identical to today's wire. `composeProse` merges DISJOINT home-filtered sets — never a
  cascade; a stale user-tier key is inert. The decision-8 header carries BOTH rulings verbatim.
  Red-first 3/259 at a parse tier that compiles against HEAD; CTs 14/14 + 122/122; all three
  typecheck programs. **⚠ OWNER LOUD:** any override typed in Settings › Model-facing prose for the
  two note frames since 08-05 STOPS APPLYING — re-enter under Preset › Templates › Format
  ("System-note frame" / "User-note frame"). **Lane flag held for the owner:** `{{note}}` is a
  payload carrier but its absence in an edited template only WARNS (never blocks) — posture was
  ruled at ship; changing it is a policy call. M4 (the prose-coverage gate) remains the top
  unification residual. Lesson minted: \[\[worktree-ct-runner-resolution]].
- **⚑ RULED-BATCH re-verify (mid-run): two rulings were moot on the tree.** ZOD-STAGE-D was ALREADY
  LANDED IN FULL (`3dd7c82c3`/`c21d78937`/`ca4469770` — envBool at all seven knobs, z.hostname on
  plugin netHosts, strip-observability = strippedToolCallKeys; the ratchet gate REDs new
  `z.enum(["true","false"])`) — receipt only. IMPORT-SETTINGS-WRITE-GUARD: **REFUSED premise-false**
  — `routing` is fenced OUT of `PortableUserSettings` at the TYPE level (`SHARE_SAFE_SETTINGS_NAMESPACES`
  drops it at parse; a crafted key is not even typeable), and heal-at-read keeps NON-import producers
  BY DESIGN (model coherence undecidable at write). The lane lands a defense-in-depth pin instead
  (crafted `routing.roleDefaults` in a backup cannot reach stored config). Item 1's home was wrong
  too: the lying slot list is `preset/components/readout/transforms-readout.tsx`, and it carries
  THREE MORE lies (collapse-blank-lines printed on a lane that never runs it; the three receive
  switches printed in inverted order) — all four fixed by ONE derived declaration executor+readout
  share.
- **⚑ EIGHT OWNER RULINGS BANKED (question-tool, 2026-08-07, two batches):** regex-reasoning display
  fix · zod stage D in full · the §-refs carve-out · cast guides threaded · settings write-guard
  lift · tag cliff ACCEPTED · strict default KEPT · orphan-transcript import REJECT (owner override
  of the characterless rec). Rows annotated in place; buildables dispatched as lane RULED-BATCH.
- [ ] **STACK-MODES (owner order 2026-08-07: "no clean way to launch in debug or production mode"; lane
  dispatched).** The debug handoff doc's §1 IS the indictment: prod = a hand-rolled setsid/nohup
  incantation with two silent cwd traps, pid-hunting via ss, manual drain-watch; debug = hand-editing
  `.env` and stripping it after. Build: `pnpm stack` gains `dev|prod` modes + an orthogonal `--debug`
  flag (env OVERLAY at spawn, never .env mutation); stop/restart watches the bounded drain; instance-
  IDENTITY verification (\[\[health-check-validates-the-port-not-your-process]]); adopt-in-place;
  status never prints the token. Handoff doc §1-2 repointed in the same commit. Verified by argv/env
  snapshots + pure-logic units — the first real `stack up prod` is the owner's live check
  (\[\[never-run-engine-launcher-live]]).
- [x] ✅ **DRAFT-PHASE UX — FIX MERGED + CENSUS DELIVERED (lane DRAFT-POLISH, `3046f070a`; verifier
  owed).** THE FIX: both carried-look takeovers (BG-C background + D44 room theme) were spelled over
  `ParticipantView[]` — a shape only a COMMITTED chat can produce, so the parameter TYPE was the
  gate. Now a phase-independent `CarriedAppearanceCast` (contracts/chat/roster.ts) that both phases
  project into; one `#data` primitive `use-carried-appearance`. Red-first at the CT tier (2 positive
  arms fail on HEAD source, 4 discriminators pass both states); 146 CT green. Bonus one-home: the
  founding-cast union had SIX spellings (two silently dropped `addedCharacterIds`) — now one deduped
  home in `#state`; a mid-draft roster add shows in the topbar immediately. Header fork recorded:
  THEME half overturned, TRUST half stands. **THE CENSUS (the owner's design-pass input — ranked):**
  P1 **nav-away silently DISCARDS a composed draft** (greetings/injections/members unreachable —
  worse than the reload item and NOT the same item; S retain-and-offer-back / L drafts-list —
  OWNER) · P2 no assembly Preview pre-send while overrides are fully editable (M/L) · P3 no cast
  bar on a multi-character draft — the literal "avatars don't show" for groups (S) · P4 group-draft
  row tints are the id hash, re-tint at first send (M) · P5 skeleton flash on draft first paint
  (S/M) · P6 draft header lacks the member-count chip (S) · P7 send-availability never pre-checks
  on a draft (deliberate; OWNER taste) · P8 DRAFT-TRUST (standing 6) · P9 reload loss (standing
  14). **Structural ruling candidate:** the feature handles draft gaps TWO ways — honest
  disabled-with-reason (options menu, image gen — the §8 no-reduced-modes shape) vs silent absence
  (cast bar, Preview) — the doctrine picks the first; P2/P3 are the two wrong-road sites.
  Lesson minted: a rule's PARAMETER TYPE can be the gate ("only works after X exists" → check what
  the resolver's signature structurally demands before hunting conditionals).
  **Ops note:** the lane caught :5173 serving a STALE module graph (\[\[live-client-port-5173]]
  class) — stack restarted by the orchestrator, fresh watcher verified serving current disk.
- **⚑ FRESH-LENS RESULTS (the new graduation law's first pass, 2026-08-07):**
  **ABORT-LEAK: CONFIRMED** (defect reproduced end-to-end pre-fix against a real wedged server;
  all 8 roles proven routed; dispose leak-free over 1000 calls; no real transient misclassified —
  node's genuine timeout is `TimeoutError` via non-abort paths, all still retryable). Honest caveat:
  today's only live abort reason was already safe by luck — the fix is defense-in-depth, correctly.
  ROW GRADUATED. **TEMPLATE-CENSUS: REFUTED** — the framing drill-in trims on EVERY keystroke
  (controlled textarea + per-change `.trim()`): spaces/newlines swallowed while typing; the CT
  missed it because `fill()` is one event. + 4 secondaries (unguarded `{text:""}` resolves to empty
  wire bytes · no `{{note}}` warn on the new surface · a vacuous contract-test arm whose comment
  claims the other file's enforcement · stale injections.ts header). ALL routed to the warm lane
  (fix leg live); storage/wire half of the merge HELD under everything thrown at it. Verifier
  re-check owed after the fix leg. **Pending fresh lens:** HAND-EDIT-VS-FLUSH (merged, check
  backgrounded, verifier next) · WIRE-SINK + SMALLS-BATCH (queued).
- **✅ HAND-EDIT-VS-FLUSH MERGED (`5d9d5d10a`; consolidated check backgrounded; verifier owed).**
  Both victims dead: the in-place door now demands the ladder's TURN rung (arm B), and `writeFlush`
  folds its state into a shadowing hand row via `writeHandState(derive)` — merge inside the head
  resolve, auto-locks the arbiter, second-edit race closed by construction (arm A). 6 new pins incl.
  same-field→human-wins; red-first 3/3 through `getTrackerView`. **Owner-sighting verdict:**
  pre-first-turn STATE editing was never broken (now pinned); the sighting was arm A mid-generation,
  OR the F-C greeting-TEXT freeze (canon-identity's) if what was lost was message text.
  **Deferred follow-up boarded:** `resolveSnapshotForTurn`'s turn arm is a single-slot probe, not a
  walk — safe for the hand door now, degrade-to-fallback remains for other callers.
- [ ] **DIAGNOSTICS-DISPATCH UNFLATTENED** (S, from the ABORT-LEAK verifier) — `providers/diagnostics.ts:47-74`
  bypasses `runRole` (bare `requireRoleImpl`); catalog/credits callers DO pass signals, and the OR
  SDK's default retry fires on `name==="TimeoutError"`. Unreachable-by-abort today; one flatten call
  closes it. Evidence: verifier probe, BYPASS row demonstrated.
- **✅ FOUR MORE MERGES (2026-08-07 midday, consolidated checks green):** **RULED-BATCH**
  (`0efd3276d` — the pipeline order declared ONCE in contracts and consumed by executor + readout,
  four display lies dead red-first; cast guides reach CEL via `RPG_CAST_GUIDE_FIELDS`; ambient
  clear with NO vocab widening — the "Clear weather" control lives outside the closed-vocab group;
  2 refusals receipted: the write-guard premise was dead AND its pin already existed; zod stage D
  already landed) · **TEMPLATE fix leg** (`46101da6e` — drill-in typeable, trim at the save
  boundary, positive-control-proven; blank overrides heal at read; `proseFooterState` lifted to
  contracts so both editors warn off ONE derivation; the vacuous test arm now catches its planted
  control) · **STACK-MODES** (`3ecc6d05c` — `pnpm stack up|down|restart|status [dev|prod]
  [--debug] [--build]`: env OVERLAY never .env mutation, --debug REFUSES on .env conflict naming
  the line, instance identity beats the port (harness:true checked FIRST — e2e stacks un-adoptable,
  un-killable), prod refuses a missing dist with the build command, spawner census as doc §1c +
  `STACK_SPAWNERS` data. Premise kills: the 401-probe lie (`/api/_debug/info` is 200 unauthed on
  single-user — pid in the body is the BEST identity source) and **RPG_TRACE IS NOT DEAD** (old
  finding #7 stale; fully wired, doc repaired). OWNER ACTION OWED: delete the three debug lines +
  `.env.bak-predebug-*` from the live `.env`; first real `pnpm stack up prod` is the owner's live
  check) · **HAND-EDIT fix leg** (`6b37d67ea` — the fold replays the round's PATCHES (deep-cloned
  accumulator log), nothing unnamed can resurrect — the dismissed-actor regression dead; fold
  follows the head to ANY seq; total `TurnWriteFoldOutcome`, every losing arm fires
  `onFlushDropped`; refusal arm drivable through REAL verbs; red-first 4/4→11/11).
- **✅ ORCHESTRATOR serde fixes (`f99208480` + `ea847a671`, full hook both):** blank-`mes` swipe
  text PROMOTES (active else first, lone take to the primary — never an empty canon row, never
  dropped text); a text-empty row carrying MEDIA survives (all ST era spellings: media[]/files[]/
  legacy image/image_swipes/file — ST's own `migrateMediaToArray` is the receipt); the seeder's
  duplicate drop-filter dissolved (one home). Live send path untouched (all four parser consumers
  are import-side, owner asked + receipted).
- **⚑ VITE-MAX dispatched (owner word):** the gap list's safe slice — CT-vite spike + rolldownOptions
  together · esbuild-override re-derivation · `--configLoader native` · `future` warns ·
  license-JSON · three measure-then-adopt rows. HELD deliberately: lightningcss transformer ·
  chunkImportMap · devtools · Environment API (N/A).
- **✅ TEMPLATE-CENSUS: fresh-lens CONFIRMED on re-check (round 2) — ROW GRADUATED.** The typing
  counterexample is dead on the finding instrument (interior + trailing whitespace and newlines
  survive real keystrokes; trim proven on the production save path); blank overrides heal at read
  with correct scope (whitespace-only heals, untrimmed real text rides verbatim); the `{{note}}`
  warn renders on the drill-in warn-never-block; the once-vacuous contract arm now fails on THREE
  planted control classes both directions. Verifier disclosures: its keystroke probes forked the
  built-in preset — a `Default (edited)` row now exists in the dev db (harmless, owner-waved class);
  and one stale-module-graph crash self-healed on retry (the zombie-vite TELL — a `?t=<old>` module
  URL erroring on an export that `curl /@fs/` serves — recorded here as the diagnostic).
  **HAND-EDIT: round-2 REFUTED (narrow) — leg 3 live:** CE2 + refusal arms + deep clone CONFIRMED;
  CE1 survives in the PRODUCTION patch shape because `tools/apply.ts` authors presence planes
  WHOLESALE (touch presence → whole `presentCharacters`+`actorState` arrays from the round's base)
  — the fold must replay INTENT (`presentUpsert`/`presentRemove` re-run against the hand head), and
  leg 3 audits every other composed-from-base plane for the same shape. The regen-swallow silent
  loss got a DRIVEN receipt (probe5a) — the boarded row now cites it.
- **⚑ FOUR MORE OWNER RULINGS (question-tool, 2026-08-07 afternoon):** (1) **CANON-IDENTITY: GO** —
  the build starts (serial spine: contracts+db+baseline squash → F-A → F-B → F-C → dispatch sites →
  lock-in tests; dev-db drop accepted). (2) **PUSH: battery-then-push** (in progress; battery
  restarted after a verifier-probe collision, see ops note). (3) **DRAFT-MODE LAW: disabled-with-
  reason** — every committed affordance EXISTS in draft, disabled with the reason stated where
  inapplicable (\[\[no-separate-reduced-modes]] applied); P2 Preview + P3 cast bar build to this
  shape. (4) **P1: retain + offer back** — the draftKey is retained per seed; returning to the same
  character(s) offers Restore/Trash. Owner also asked (recorded as a law candidate):
- [ ] **CONSOLIDATION-LANDS-WITH-ITS-FENCE (law candidate + founding instance)** — semantic
  re-derivation (N textually-different spellings of one computation — the founding-cast union's six)
  is the duplication class NO generic gate can catch (`no-inline-types` = shapes, `cpd` = textual
  clones); the house answer is the PER-CONCEPT fence, but it's been ad-hoc. Candidate law: a lane
  that consolidates spellings into a one-home lands the ts-morph fence banning re-derivation (by
  structural signature) IN THE SAME COMMIT. Founding instance owed: the founding-cast fence (no
  `addedCharacterIds` read outside `draft-config-store`) — rides the DRAFT-2 lane. Evidence: owner
  question 2026-08-07; gate-authoring hub's carrier-fence doctrine.
- **⚑ OPS NOTE 2 (load, encoded after a battery died of it):** the round-2 battery's vitest+CT came
  back **10,364 / 0 failed** but `e2e-smoke` DIED ON BOOT — vite FSWatcher **EMFILE** (fd/inotify
  exhaustion) at load ~53 with 161 test processes: the battery shared the box with VITE-MAX's full
  CT run + two fix legs' CT floors + the live stack. LAW EXTENSION: **fix-leg floors and
  whole-CT-suite verdicts COUNT as gate-heavy lanes for the ~3 stagger cap, and the battery's
  behavioral phase gets the box** — no whole-CT lane dispatches while a battery runs. Recovery
  shape: the vitest/CT green STANDS as the receipt; rerun ONLY `pnpm e2e:smoke` on a drained box
  (load watcher armed), push on the composite.
- **⚑ OPS NOTE (collision class, encoded):** a RESUMED VERIFIER runs on MAIN's tree and may plant
  probe suites in `tests/` mid-attack — a whole-tree check/battery launched while one is live sweeps
  its probes up as reds (`zzverifier-probe*` tripped biome + 2 gates; battery killed + relaunched
  after drain). LAW: no whole-tree instrument runs while a verifier is active on main; check the
  roster first.
- **NEW ROWS (from the fix legs + DRAFT-POLISH interim):**
  - [ ] **REMOVAL-TOMBSTONE FORK** (owner-timed design, persona-pin family) — if the round's delta
    names the exact datum the human removed mid-flight (~2s window), the delta wins: dismissal
    CLEARS locks by design so the model may reintroduce later, and a cleared lock cannot express
    "removed just now". The honest arbiter is RECENCY; a tombstone needs a lifetime rule only the
    owner can set. Lane analysis on record; defensible as-is. Evidence: driven probes, fix leg.
  - [ ] **REGEN-VS-LATER-FLUSH classification** (S) — the fold's regen guard classifies "a later
    turn flushed while we were in flight" as a regen, silently; reachable only via lock-free
    `generate` concurrency (the flush barrier covers sequential sends); needs ladder state that
    doesn't exist today. Evidence: fix-leg self-flag.
  - [ ] **SNAP-STAGE PORT BAND contention** (S, instrument) — the isolated-stage pair (8888/5273)
    is a SINGLE shared band; two lanes wanting rendered stages collide (DRAFT-POLISH vs MOBILE's
    stage, live sighting). Per-lane offsets or a stale-stage reaper. Evidence: live refusal.
  - [ ] **WIRE-SINK fence scope** (S) — `ChatRequest.chatId` is still OPTIONAL and the two direct
    `runChatTurn` sites in rpg.ts build no ExtractCtx: a fourth arm added THERE compiles blind. The
    landed fence covers the ExtractCtx paths only (verifier receipt). Widen on want.
- **⚑ DRAFT-POLISH interim:** the owner's draft-visuals finding is root-caused + fix landing —
  the carried look (BG-C + D44 takeover) was spelled over `ParticipantView[]`, a committed-only
  shape; now a phase-independent `CarriedAppearanceCast` both phases project into. Red-first
  proven. Header fork ruled: THEME half overturned (visuals key on membership), TRUST half stands
  (DRAFT-TRUST remains the owner's architecture item).
- **NEW ROWS from the two lanes + side-eye (each independently landable):**
  - [ ] **STRUCTURED-ROLE CORRELATION FORK** (owner/design) — the `structured` role is chatless by
    contract (`RoleRequestCommon` has no chatId; `WireCapture.chatId` documents "absent on a chatless
    probe turn"), so non-agent-sdk rpg structured extraction is correlatable by backend+time only
    (22+66 anonymous `summarize|vllm` rows in the live spill are this class). Making it correlatable
    is a cross-role contract change — pose before building. Evidence: WIRE-SINK report, spill-scanned.
  - [ ] **CORPUS MOBILE IA** (M, design-y) — six filter controls + TWO search boxes + a wrapping
    five-tab row consume 55% of a 320px screen above ZERO results, and the empty message ("no
    characters match — loosen the filters") lies when no filters are applied. The dual-search half
    goes with MOBILE leg 2; the IA pass is its own row. Evidence: side-eye rendered receipts.
  - [ ] **ANALYTICS/PRESETS EMPTY VOIDS** (S–M) — both read as UNBUILT at mobile (four tabs + one
    gray sentence + ~600px black; one row + an unlabeled orange dot as the only active signal) —
    the \[\[empty-states-are-load-bearing]] class + a meaning-by-color-alone a11y miss. Evidence:
    side-eye rendered receipts.
  - [ ] **DESIGN-AUDIT --mobile** (S, instrument) — no coarse-pointer mode, no overlapping-hit-target
    rule; it scored 0 P1 on a frame carrying the topbar P1. Evidence: side-eye instrument note. 3 done (graduation
  prose-tail rule · editSnapshot `.ok` assert · ST blank-`mes` strip at parse), **3 REFUSED premise-
  false with receipts** (CONTRACTS-BARREL · SSE-SPEC-STATUS · PROMPT\_MACROS phantom — all three were
  grep-written rows; the evidence-method law earns its keep again). Rows struck in place below.
- **⚑ TEMPLATE-CENSUS census landed (mid-run):** crunch (a) was STALE — the note framings became
  PROSE-1 slots 08-05 (`chat.injection.systemNote`/`userNote`, edited in Settings › Model-facing
  prose). Phase 2 is therefore a RE-HOME to presets per the owner's one-home ruling: lane mints
  `promptConfig.prose` (the per-preset ProseOverrides storage the whole unification needs) + the
  preset-tab third form path, takes CONTINUATION_NUDGE (`shape.ts:107`, the clearest still-hardcoded
  framing) along, Settings stops offering the two migrated slots. Decision-8 header read accepted:
  the two frames are in-prompt wrappers, not side generations — the other 13 chat.* slots STAY.
  NO data migration (pre-launch NO-LEGACY): an override written in Settings since 08-05 stops
  applying — owner flag rides the lane report. The lane's M1-M4 report = the unification spec draft;
  the (b) build goes to THIS lane warm, never a sibling (shared `promptConfig.prose` storage).
- [ ] **PROSE-COVERAGE GATE (M4, from the census)** — PROSE-1 §7/S5 specified a gate and it was never
  built (`scripts/check/gates/` has only `macro-resolution-home.ts`); that absence is exactly how
  CONTINUATION_NUDGE sat un-slotted through the whole campaign, and the hiding-in-code arm regrows
  silently without it. Own lane after the unification. Evidence: census 2026-08-07, tree-verified.
- **NEXT (owner-authorized chain):** BOARD-THESE remainder → the lifted smalls. Owner-taste rows parked.

## ═══ STATE (2026-08-07 late — superseded; kept one cycle for the receipts trail) ═══

- **✅ THE BASE UI 1.7 PROGRAM IS CLOSED.** Six lanes dispatched, six merged, every consolidated
  check green, all worktrees torn down: CARDKEEP (`9b591f09`) · GOLDHOME (`a2370065e`) · UI17
  (`2b79689be`) · NAVFORM (`42cdd1b45`) · NAMECRAFT (`3a413f626`) · BUGATES (`8114fa43a`). Gates
  **183 → 189**. The crunch doc GRADUATED to `docs/history/design/baseui-crunch.md` (both inbound
  refs repointed) — every one of its 8 items adjudicated, its own wrong counts corrected in place.
- **Headline receipts:** three lying seals fixed red-first (Menu/Popover ignored
  `--available-height` — 1,918px popup in a 720px viewport; Progress read "150%"); the Chrome
  id/name program resolved STRUCTURALLY (Base UI Input IS Field.Control — real-Chrome CDP audit,
  0 issues on 4 surfaces with planted negative controls); accessible-name law minted (§13.10, 9
  rules, 13-test CT over nine surfaces); the SURFACE MANIFEST (39 components / 292 exports / 269
  parts with dispositions + handler arities) makes a Base UI bump UN-LANDABLE unadjudicated;
  `cardKeepLastX` absent≠zero reachable end-to-end; goldens rig re-homed with 8 of 9 carve-outs
  dissolved (+ a 10th, knip, found and fenced at landing with an import-carrying probe).
- **OWNER RULINGS 2026-08-07 (question-tool, all four recommended arms):** (1) §15 RATIFIED —
  `className` string-only seal law, `style` deliberately un-narrowed. (2) Type spelling: KEEP FLAT
  aliases, namespace form allowed where cleaner; no spelling gate. (3) Context-menu: KEEP THE SHIM
  (reduced enhancement; revisit on dogfood signal). (4) **EMPTYGEN-REASONING: arm 1 — RECOVER,
  don't discard** (prose-less completion with parsed tool calls ⇒ apply state writes + short
  continuation for narrative). That ruling is a dogfood-campaign input.
- **Smalls minted by the program:** the manifest/generator FORMAT ping-pong risk (biome reformatted
  the committed manifest at landing polish `62de12195`; the next `gen-baseui-surface` regen may
  re-emit generator-format — teach the generator to emit biome-format, one small) · BUGATES flagged
  a D-ledger entry for the manifest law (owner call, unminted) · `pnpm tsx` still named in
  `monotonic-tests.ts:20`'s error strings (tsx is shed — sweep `pnpm tsx` across scripts/) ·
  stale `SettingRow` prose at `structured-output-section.tsx:29`, `knob-row.tsx:200`,
  `tokens.json:585` ($description; forces tokens:build).
- **THE DOGFOOD CAMPAIGN (owner-ordered, LIVE overnight 08-07→08-08):** five lanes dispatched;
  **2 MERGED + torn down** as of the mid-night mark: **DOG-VERIFY** (`4ef249f8f` — every owed
  ✅-row test written: drain deadline, wire-outcomes asymmetry, emptygen warn, tooldrop names,
  the SCENE property test + declared failing-pin awaiting `indoors`, env isolation) ·
  **STATLAS** (`92808239b` + `81a29d75c` — the ST message-shaping atlas with MEASURED §2, plus
  SEVEN rig defects fixed sweep-proven: the wipe-by-design, the INVERTED names-behavior enum, a
  nonexistent settings key dead on both arms, the ORB arm reading ST-truncated chats — 44 files
  were ONE payload. Parity now real: 42 compared / 0 unpaired; tools fixtures differ only at
  rows \[0],\[1],\[24]). **Battery green pre-campaign: 10,165 vitest + 2,430 CT.** Stack UP
  (server :8788, vite :5173 via localhost), engines adopted.
  **LIVE: DOG-ENGINE** (EMPTYGEN — idle-timeout hypothesis FALSIFIED source-pinned, tool-only
  root cause stands, ruled RECOVER arm in build + `indoors` vocab + card tail) ·
  **DOG-PERSONA-SMALLS** (item 1 DONE red-first: `TurnTrigger` union + the server-side own-row
  guard — NULL-seat anchor contamination dead at both ends; items 2–10 + the parity fixture +
  STATLAS's two routed flags: the `{{user}}` dual-resolution probe (F1) and the names.ts header
  lie (F2)) · **DOG-DEBUG** (item 1 DONE: `ShapeTrace.rows` + the MERGED-arm pin that makes the
  INJECT class visible; item 2 ruled ARM A — rpg-owned call record, D112 mechanism preserved,
  builds after item 3's RPG\_TRACE port).
  Owed at campaign close: side-eye over all rendered changes (ALL findings fixed, standing law) ·
  final battery at quiesce · the halt-lift adjudication. THEN this board's queue (owner word:
  REGX2 → MOBILE → BOARD-THESE by value → smalls).

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

### I-2 · DATABANK — S1 + S2 shipped; S3 unstarted (lane DBFIX live on ingest concurrency)

**Landed:** DATABANK IS A LIVE RAIL SECTION (`b377ed8c` + merge `17f83015`) — the library, Add
upload/paste/link, phase chips, bounded ingest poll, owner-wide reindex in the band kebab, empty
states, auto-appears on Home via the registry; 199 CT + 110 unit; consolidated `pnpm check` 14/14 on
the merged result. D-1 `listGlobal` minted. Its rendered check caught a real defect and minted
`ListRow.subtitleLead`. **Owner CLOSED the section-vs-collection fork: Arm A (own rail section)
stands** — demotion stays a one-file edit if he ever wants it.

**OPEN — S2 (the live lane):** the per-chat rack (D-2 sources threaded — `scope.ts` already runs the
three junction queries and DISCARDS the answer) · the rack after Injections per D-4 · **the D85 host
visibility toggle — the original workboard item, still unbuilt** · the `listActiveForChat` freshness
row.
**Receipt of not-done:** `packages/server/src/domain/databank/verbs/` holds attach · create-from-text ·
gather-retrieval · get · list · list-active-for-chat · list-attachments · reindex · remove · rename ·
scrape · upload — and NO visibility/hidden setter, while `packages/contracts/src/databank/index.ts:96`
already specs the D85 override.
**OPEN — S3:** unbuilt. D-7's real home tile still owed. Spec: `docs/design/databank-surface-spec.md`.

### I-3 · CONFIG WORKSPACE — the rail is live; MOBILE is the ruled tail

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

### I-5 · BRAND BURN-DOWN — the gate is live, the debt is named

**Landed:** gate #176 `brand-in-name-position` (`35014699`) — positions DERIVED from `kit/ids`, zero
hardcoded paths, blindness tripwire, two-sided markers, position-NAMED escape
(`@foreign-id-ok(<position>): reason` — because one line can carry ours + theirs), the six-case
real-tree probe. 28 permanent foreign-wire markers planted at landing (agent-sdk `sessionId` name
collision · local-light HF `modelId` · plugin wire DTOs).
**OPEN:** the arm-A baseline ratchet is ACTIVE and shrink-only. **Receipt:
`scripts/check/gates/brand-in-name-position.baseline.json` = 169 files / 374 sites.** Terminal state is
`{}` + delete both the baseline and its generator. Burn it down in named lanes when the owner wants
them; `sessionId`→`sdkSessionId` is a dissolving candidate.

### I-6 · PORTABILITY — R0-R5 landed; R6 is the honest scope-out

**Landed:** PORT (`87b3c826`) — F1 CLOSED (databank travels, real bundle round-trip), the
`lifecycle-portability` gate #173 (it caught `globalDocuments` unclassified WHILE BEING WRITTEN), the
R3 serde spine (8 families, envelope/decode/version-gate/emit exist ONCE), world-info doors +
`?format=png|json`, persona chrome re-homed, the O-3 merge-in-place flip (theme + tag restore-wins,
USER-VISIBLE).
**OPEN — R6:** the orb-native chat-bundle arm alongside jsonl. It was scoped out HONESTLY and is
MACHINE-TRACKED: the ACCEPTED-LOSSY / DEFERRED rows each say "ends when R6 lands". O-6
characterless-import rides it, and so does the standing owner question below.
**⚑ OWNER ITEMS on this initiative:** ~~the absent-character transcript import policy~~ — **RULED
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

### I-9 · CEREMONY + DOC GRADUATION — 2 of 3 done; HCOPY's D-entry is the survivor

- ✅ **D125 MINTED** — the fifth regex leg (`PROMPT_HISTORY`, amends D121-E), from HISTLEG's report.
  Both range headers + the master enumeration updated (which was itself behind: D123/D124 had never
  been appended to `Core-Laws-and-Precedents.md:62` — backfilled in the same edit). **Next free: D126**
  (allocated to STRUCTOUT). HCOPY's handoff-copy D-entry (amends D64) is STILL unminted and rolls to
  the next ceremony batch alongside any REGPAR / R2WI deltas — that is the initiative's one survivor.
- ✅ **Graduation move DONE (08-03):** the 36/36-ACCOUNTED preset-execution crunch list graduated to
  `docs/history/reviews/misc/`; its three inbound refs repointed. (The board's "that dir is EMPTY"
  claim was stale — it already held six graduated reviews.)

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

- **Per-actor tracker grant/revoke EDITOR** — `sheet.trackerGrants` / `trackerRevokes` exist and gate
  NPC tracker applicability, but NO client editor exists. The owner's "keep explicit-list-only"
  NPC-grants ruling is a DEAD LETTER until hosts can edit the list. **Re-flagged by the archive tail
  audit (T-11), which trusted the doc's citation rather than re-grepping — a one-minute grep of
  `trackerGrants|trackerRevokes` in `packages/client/src` firms it before dispatch.**

- **`readout-parts.tsx` pending-flash** (`packages/client/src/features/preset/components/readout/`) —
  the same F-02 lying-pending-arm class SM4 fixed elsewhere; flagged, not fixed.

- **CapabilityGate's no-error arm is UNREACHABLE as a settled state** (capability required | error —
  undefined+null = PENDING), so every editor open FLASHES "connect a chat model" at users who have one.
  Owner ruling was "build it later": add a pending arm, then delete-or-reach the note.

- **`respell` derive-or-cite row:** search `DigestsParams` / `SegmentsParams` ≡ contracts
  `MemoryQueryOptions` (both still live in `domain/search/contract/params`). Its twin,
  `MemoryBackfillCounts`, is GONE — that half is closed.

- **`import-user-settings` bypasses the routing write-guard** (whole-blob verb) — imports heal+warn at
  read instead of refusing at write; lift the guard into the import path on want.

- ✅ **`connection.getCatalog` / `getAgentSdkCatalog` — ANSWERED, not dead** (archive tail audit): both are
  called at BOOT to warm caches (`entry/lifecycle.ts:181-191`), and `use-admin-mutations.ts:80` already
  carries the explanation in a comment. Deliberate boot-only readers. No action.

- **`field-reachability` suite ignores a `.ok`** (SM5's flag — non-vacuous, honest-fix-same-shape).

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

- **R5b(a) verify:** `refEnumerationLines` (the non-enforcing-backend prompt fallback) should enumerate
  active conditions post-R5a — confirm the R6 build carried it; \~2 lines if not.

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
  from source-pinned to measured — the doc is structured for that drop-in). **UPGRADED to STATLAS leg 2 (owner word 2026-08-07): rig+comparator fixes + the re-sweep are IN BUILD, capture step held until the battery lands.**

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
- [ ] **REGX2** (M) — an owner BUILD RULING that got archived: regex bulk edit + pipeline debugger +
  per-script JSON door (NOT regex presets). Ruled 08-03 dawn, queued, never dispatched.
- [x] ✅ **RPG-ROUND-SIGNAL — DONE** (merged `1b581127b`: the state round is cancelable with its own lifetime, and a cancelled round writes NOTHING).
- [ ] **HAND-EDIT-VS-FLUSH — REPRODUCED (lane live, fix ruled + building): ONE RACE, TWO VICTIMS.**
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
  + the same-field-conflict-resolves-to-human case.
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

- [ ] **SQUARE-GLYPH-BUTTON-SWEEP** (M) — `ui-size-via-variant`'s `DEBT_BASELINE` still carries the full
  **14-row `!size-N !p-0` icon-Button debt across 9 `rpg/*` files**, unpaid since it was surfaced.
  Confirmed live in the gate's current source. Needs a Button square-glyph size arm + a sweep with
  computed-geometry proof; returns that baseline to terminal `{}`.
- [ ] **ICON-SEAL-DOORWAYS** (M) — the OTHER four named-not-built follow-ups, all **zero-hit confirmed**:
  `LucideProvider` at the client composition root · vector-effect CSS stroke route · the `iconNode`
  door for brand glyphs · the `fillRule=evenodd` probe to grow the fillable set.
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
    Ledger + ranges + enumeration updated; next free D129.
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
- **Probe harnesses:** `scripts/probes/rpg-extraction/` (`run-coverage.mjs` env-driven ·
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
