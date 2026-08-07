---
kind: history
status: archived
updated: 2026-08-07
---

# Retro workboard — the 2026-08-07 receipts trail (archived)

> **Archived from `docs/retro-workboard.md` on 2026-08-07**, per that board's own law: *"CURRENT-STATE
> ONLY, INITIATIVE-SHAPED. When a block goes stale, REWRITE it — never stack a new session layer on
> top."* These are the two STATE blocks (the 08-08-dawn campaign-close block and the 08-07-late Base UI
> block) plus every lane seal, merge sha, verifier verdict and ops lesson from the 2026-08-07 session —
> the day the canon-identity build landed. **Nothing was deleted; it moved.** The live board keeps only
> current state; the durable LAWS from this day live in `docs/architecture/core/` (D129-D132), the
> ORCHESTRATOR QUICK-ONBOARD section, and `.claude/agent-doctrine.md`.
>
> Reading order if you need the archeology: the compact snapshot at the top of the live board → this
> file → `git log --follow docs/retro-workboard.md`.

## ═══ STATE (2026-08-08 dawn — DOGFOOD CAMPAIGN CLOSED; the queue below is live) ═══

- **✅ THE DOGFOOD CAMPAIGN IS CLOSED — the full adjudication + halt-lift verdict live in
  `docs/history/dogfood-tracking-2026-08-08.md`'s header.** Nine merged work-streams, the side-eye pass + re-verify
  (20/20 dead, one fix-regression caught and killed same-night with its CT measure fence), and the
  closing battery on ONE tree: **10,224 vitest + 2,464 CT, 0 failed, 0 flaky.** Gates **190**.
  D-ledger through **D128** (D127 compiler-owns-memoization + D128 the surface-manifest law, minted
  on the owner's word 2026-08-08) — since extended to **D132** by the I-9 ceremony batch
  (D129 canon-message-identity · D130 hand-edit/turn-write rebase · D131 the handoff property offer
  \[AMENDS D64] · D132 templates-home-on-presets); **next free D133**. Owner ruling queue: EMPTY — all eight
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
- **⚑ CT-VITE-8 SPIKE: RED, ruled by the owner on the evidence (2026-08-07) — and the outcome is a
  PIN, not just a revert.** Vite 8 under `@playwright/experimental-ct-core` **mounts nothing**: 674
  tests produced results, **670 reached retry2**, failing from the very first spec, and the earliest
  failure's `test-failed-1.png` is a BLANK MOUNT — the harness-mounts-nothing signature, not
  timeouts or flakes. It retro-explains the two ~65-min runs (every test burning its full timeout
  three times). Owner ruled after ~4h: stop the A/B, revert, and **"lock ct to whatever version it
  uses."** So the override flips from an UPGRADE to an explicit PIN at the bundled version (measured
  6.4.3, re-verified after the revert install) carrying its reason + the re-test trigger (a
  playwright bump) — a version that was an accident of transitive resolution becomes a STATED
  decision. `build.rollupOptions` STAYS (correct for the bundled vite); the tsconfig note stays
  factually intact. **The prize is NOT claimed:** one-vite-in-the-tree would have killed
  \[\[worktree-ct-runner-resolution]]'s two-versions trap AND let ct-config join the type program —
  both stay OPEN. Verdict written durably to `docs/reviews/misc/` (a verdict that lives only in a
  report dies with the transcript — that lesson cost a ceremony lane today).
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
- **✅ PUSH 2 LANDED (`1fe76d08b..ab55c112e`) + THE FIVE-LANE TRAIN MERGED (consolidated check
  14/14 on the final tree):** battery = **10,364 vitest+CT, 0 failed** + e2e-smoke 5/5 on the
  drained box (the first smoke death was EMFILE — see OPS NOTE 2). Train, in order: **HAND-EDIT
  leg 3** (`e54ae2665` — the fold REBASES base/patch/head; NO applier emits a real delta, so
  carried data can never resurrect a removal; multiset semantics for flat arrays; its own unit
  test caught its own set-vs-multiset bug) · **STACK-MODES fix** (`c0a26c0e8` — the shell
  delegates EVERY classification to the one parser, exit 2 on unclassifiable; `restart --force
  prod` now REFUSES with the reason; wx spawn lock + pid-guarded unlink; empty env values =
  conflict; \[\[shell-fronting-parser-owes-dispatch-tests]] minted) · **RULED-BATCH fix**
  (`6d97766ed` — day/time nullability SPLIT: Clear-time keeps the calendar; the silent midnight
  assertion in sceneClock dead; 755 rpg tests green on the widening before any pin — evidence the
  midnight was never intentional) · **CANON-1** (`dde07f52c` — THE IDENTITY SPINE: messages.kind +
  MESSAGE_KIND_POLICY + variant rawContent/macroFreezes + ONE baseline; F-A red-first killed at
  the one canon load; personaIds[0] UNREPRESENTABLE; two tests re-pointed from plumbing to
  consequence; fan-out suite list + ~7 undispatched kind sites + F-C follow-on touch points in its
  report) · **MOBILE leg 2** (`08b83e990` resolve + merge — the topbar budget kills the P1, all
  six side-eye findings dead; TWO conflicts resolved lane-side, merged CT file 92/92).
  **⚠ THE DEV DB DROPS AT THE NEXT STACK BOOT** (CANON-1's baseline; owner-accepted; restart is
  the orchestrator's next act, announced).
- [ ] **STAGE-SPAWNED ENGINES fence** (S) — the overnight fleet was spawned FROM A SNAP-STAGE
  WORKTREE (embed's chat-template path was the tell), making it cwd-foreign: the next reconcile's
  orphan sweep correctly reaped the two HEALTHY engines mid-service (engines-start.log receipt:
  "reaped orphaned engine-family process(es): 345438, 348616"). The 08-03 fleet fix HELD (lock,
  merge, detach all behaved); the defect is upstream — a stage stack must be adopt-only,
  spawn-NEVER: hard-refuse engine spawn when cwd ≠ main repo root. Also recorded: `ensure` ends in
  `exec tail -F` (a forever log-follow — a lingering ensure shell is the TAIL, killing it is safe).
- [ ] **ST-MEDIA-IMPORT** (S–M, waits on the identity fan-out's media shape) — extend the bundle
  collector's scan to read referenced image bytes (ST `user/images/`) → CAS ingest via the
  avatar/card seam → content-image spans in the minted rows; `extra.files` → databank documents +
  chat attach; bare-jsonl no-bytes → span degrades to alt (content-class law). Export projects
  spans back to ST's extra.media. Parse-and-shove — nothing ST-shaped survives. Replaces the
  orchestrator's metadata-limbo media-keep (verifier-refuted); the serde doc truth-repairs ride
  this row too.
- [ ] **DRAFT-HEADER AT PHONE WIDTH** (owner eyeball, from MOBILE's merge) — DRAFT-POLISH's
  draft-header cluster work is invisible ≤480px content width BY DESIGN (the leg-2 container query
  swaps the section cluster for the plain screen title on phones). If that cluster was meant to
  show on a phone, it's a design conversation, not a merge defect. Both lanes' CTs pass together.
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
- [ ] **RAW INVENTORY, THE OTHER HALF: assistant rows' pre-regex model output** (M, from FANOUT-2's
  correct scope-out) — the freeze hops now record `rawContent`/`macroFreezes` for AUTHORED text, but
  an assistant row's raw model output (pre AI\_OUTPUT-regex / pre-postProcess) is the RECEIVE path,
  not a freeze hop. Stickler §3's raw inventory wants both halves; only one landed. Same storage
  (`message_variants.raw_content`, NULL ⇔ byte-identical), same host-plane classification, different
  producer. Evidence: lane scope statement, source-pinned.
- **✅ PHONE-COMP MERGED (`fe0c22b0e` + resolve `da033b9d3`, check 14/14).** The phone is now
  COMPOSED, not compressed: three shared constants in `components/row-reveal.ts`
  (`ROW_ACTION_INLINE` / `ROW_ACTION_OVERFLOW` / `ROW_REVEAL_SWAP_COARSE_KEEP`), CSS-ONLY by law
  (axis 3 is media-query-only; `no-raw-matchmedia` bars a JS branch), so exactly ONE arm is in
  layout AND in the a11y tree per pointer class. rpg HUD tabpanel **18px → >30% of the pane**;
  persona name lane 14% → >35%; roster titles +44px; group-draft title prints the whole cast from
  ONE `draftChatTitle` home; prose stops fading onto theme art (`mask-image:none` under
  `data-has-bg-image`, pinned by a FRAMEBUFFER assertion with its own planted control). **One
  refusal with a receipt:** the "146×88 monster CTA" was DEVICE px at DPR2 — 73×44 in CSS px, i.e.
  exactly the D62 P1 coarse floor. Not oversized; the actionable half (96px of per-row affordances)
  is fixed. **Flagged for side-eye, its one solo call:** dropping the band's vitals orbs at coarse
  (argued as de-duplication — every orb's number is a Status row — and it is what makes Status
  reachable at all; the alternative is a text summary, a second rendering that cannot be CSS-only).
  Lessons: \[\[touch-floor-is-an-unbudgeted-width-tax]] · \[\[mask-is-paint-invisible-to-computed-style]].
  **Merge-conflict post-mortem:** pure ADJACENCY — both lanes appended a file-local function at the
  SAME offset, each extracted because biome's complexity cap bit at 16-17. The intent-fence held and
  was irrelevant. The lane verified the real question rather than just resolving text (the coarse
  collapse does NOT move the accessible name — the select target is a stretched absolute button at
  every pointer class), and UPGRADED its own earlier re-ruling: the coarse row now carries a
  state-aware NAME too, which is the words-for-the-current-persona the 08-03 ruling wanted, in the
  one place a 320px row can afford them. **Its rule for the train: after a merge, re-run your WHOLE
  surface, not just the conflicted files** — otherwise you check only the half git told you about.
- **⚑ FRESH-LENS ROUND 3 (three chunks): RPGFORK ✅fix/❌one call · FANOUT-2 ✅+integrity gap ·
  SMALLS-3 ✅+one untested arm. Three fix legs dispatched.**
  **RPGFORK — a THIRD live leak, driven:** the lane classified `recentEvents` beyond
  `recentBeatsKeepLast` as safe on a CLASS argument ("the same distillation is served unbounded by
  `listJournal`"); the BYTES differ. With `keepLast:2` and 5 beats a member reads only the last two
  in the SOURCE (`tracker-view.ts:233` slices by it; the knob is host-only via `updateConfig`) — the
  fork carries ALL FIVE, the forker becomes HOST, widens the knob, and reads what was hidden. With
  **`keepLast:0` the member reads NOTHING and the entire log rides across.** Aggravator: the log is
  append-only across the WHOLE game, so beats distilled from turns below a D16-clamped member's
  floor travel too — the exact class `fork.ts` cites for making `promptSnapshot` host-plane. Both
  ratchets and the other two calls CONFIRMED (planted probes fired at BOTH granularities; the DROP
  arm proved non-vacuous against three planted silent losses).
  **FANOUT-2 — the invariant is true at its writer and FALSE in the DB:** `editMessage` writes the
  other half of the pair without passing the enforcer, so editing a message back to its raw text
  leaves `content === rawContent` with `raw_content` NON-NULL, and the new host-gated reader serves
  that beside a freeze record describing a bake no longer in the body. Same for the continue
  undo/revert statement. Cross-row contamination PROVEN prevented (3 greeting rows + a send draft,
  each record holding only its own occurrences); replay proven non-fabricating across 5 cases.
  **SMALLS-3 — CONFIRMED**, incl. the zero-query claim as a real NETWORK assertion and the
  "couldn't read" arm proven non-vacuous. The verifier settled the mark-read LOOP question by
  reading the installed react-query's source (`mutate` is `useCallback`-stable for the component's
  lifetime) rather than trusting a poll that passes on its first sample. Gap: the DISENGAGED
  (`engaged:false`) arm and the re-engage transition are source-verified only — test dispatched.
- [ ] **PROVENANCE-PAIR GATE** (S–M, gate-authoring; requested by BOTH fix legs independently) —
  `CLEARED_FREEZE_PROVENANCE` is a CONVENTION a new `.set()` can forget, and the same shape exists
  wherever one column describes another. Rule: every `.set()` touching `message_variants.content`
  must name the provenance pair. Founding evidence: three of nine writers were stale
  (\[\[biconditional-is-a-claim-about-every-writer]]). Pairs with the two host-plane allow-list
  ratchets — same "a convention is not an enforcer" family.
- [ ] **`getTrackerView` IS NOT D16-FLOOR-CLAMPED** (M, source-side member visibility — NOT a fork
  question) — a history-clamped member's beat window may quote turns BELOW their own floor. The
  fork now serves the member's own window, so fixing it at the fork alone would HIDE this; it lives
  in the D16 plane where every member still reads it. Evidence: RPGFORK leg 2, source-verified (no
  `resolveHistoryFloorSeq` anywhere in the rpg snapshot read path).
- [ ] **SIDE-EYE RULING OWED on two `JUDGMENT_DEFERRED` geometry sites** (from GATEFORGE's
  `no-floorless-control-in-wrap`) — `rpg-pack-rows.tsx:39` (mapped `glyph-lg` icon grid in a
  flex-wrap popover) and `rpg-actor-trackers.tsx:251` (per-condition `glyph-xs` ✕ inside mapped
  chips). Both are coarse-pointer 44px-pseudo overlaps on wrapped pitch; both are RENDERED-GEOMETRY
  judgments a gate lane cannot make, and both sit in PHONE-COMP's rpg context panel. Options: boxed
  `icon` size · a spacing floor · deliberate. The ledger row deletes with the ruling.
- **⚑ ORCHESTRATOR LESSON (mine, 2026-08-07, third instance of one principle in a day):
  A SIDE-EYE SYMPTOM IS GOLD; ITS MECHANISM PRESCRIPTION MUST BE CHECKED AGAINST RECORDED RULINGS
  BEFORE I RELAY IT.** I forwarded "drop both panel toggles from the mobile topbar" verbatim; the
  lane found it would REVERSE the owner-ruled 2026-08-03 mobile one-shell rule (stated verbatim in
  `panel-resolve.ts:55-57` AND `use-shell-layout.ts:145-147`) — `resolvePanelMode` pins list=docked
  on mobile for all seven list-bearing sections with nothing selected, so that toggle is the ONLY
  mobile door to a section's no-selection CONTENT; analytics' and corpus's dashboards would become
  unreachable. The lane ALSO killed the finding's stated mechanism using side-eye's OWN receipt
  (`t11-hidelist-320.png`: the lead control re-renders as "Show list panel" — one more tap returns
  the roster, so it is an ugly dead-end, not a trap). **Surviving symptom: the §14 half only** —
  "list panel"/"detail panel" is desktop geometry vocabulary with no phone referent. RULED: keep
  both toggles, RE-VOICE to name the DESTINATION. The registry-shaped replacement-door change
  (~10 section definitions) is an owner call, not improvised for a vocabulary defect a label fixes.
  Same principle as the two forks ruled earlier: **the symptom is the finding; the prescription is a
  proposal.**
- **✅ THE IDENTITY FAN-OUT'S F-C HALF LANDED (FANOUT-2, `c197ce01b`, check 14/14).** The volatile
  freeze keeps a record at BOTH hops and the record is PROVEN sufficient — the lane built the replay
  arm because "a record you cannot reproduce from is an untested claim", and its red-first named the
  bytes that used to vanish (`expected null to be "I roll {{roll::1d1}} then pick {{pick::north}}"`).
  It also ran a POSITIVE CONTROL on the tests that were green BEFORE (planted a NULL-convention
  violation, watched 2 arms red) — a green-before test that cannot bite is not a test.
  **My brief's shape was wrong and the receipt killed it:** `assembly/user-macros.ts:67` builds ONE
  per-turn freeze registry reused by BOTH hops, so a sink captured IN the registry would have pooled
  one row's macro draws onto another's — recording is a CONTEXT capability
  (\[\[per-turn-engine-per-call-sink-goes-on-context]]). Kit OWNS `MacroFreeze` (§0.2 — the engine
  emits the shape); the NULL convention is enforced at the ONE writer; the replay arm ships
  committed-not-wired citing D129-G with its divergence semantics stated (positional; a mismatch
  parks the cursor so everything after draws FRESH — mis-pairing would FABRICATE provenance).
  **First reader landed** on the host-gated `VariantWireView` per my ruling, with an addendum in the
  security doc recording that the host-plane classification's premise was CHECKED and HELD.
- **✅ SMALLS-3 LANDED (`b407a084a`)** — 4/4 with a copy deviation worth keeping: my brief said the
  built-in preset's error should say "duplicate it to attach any" and **Duplicate does not exist for
  system rows** (`preset-library-row.tsx:138` gives no actions, hence no kebab); the real path is
  copy-on-write, and the shipped copy says THAT. Naming a nonexistent command would have been the
  X-19 defect one screen over. Also: the gameless-chat 404 fixed at the CALLER after reading the
  verb's contract (`resolveMember`'s NOT_FOUND is a DELIBERATE leak-free collapse — a non-member and
  a no-game chat get the same error so a foreigner learns nothing); gating on the room's own pointer
  kills the retry too. Two accessible names now tell the truth (the current persona is named for its
  STATE, the sheet's inbox is a real heading). The sheet finally marks read — the `useEffect` its own
  comment had been describing for weeks. Lesson: \[\[recreating-a-deleted-test-path-is-a-coupled-site]].
  - [ ] **NO UNREAD INDICATOR ON THE PHONE outside the You sheet** (S–M, registry-shaped, owner call)
    — an invite is invisible until you open the overflow for an unrelated reason. `ChromeEntry`
    (`#state`) has NO badge axis, and the You tab belongs to app-shell's rail — features cannot
    import each other, so notifications cannot reach it. Needs a new badge/attention capability on
    `ChromeEntry` + a rail consumer. Evidence: lane census, source-pinned.
- **⚑ SECOND LIVE EXPOSURE, SAME CLASS, NEIGHBOURING SURFACE (lane RPGFORK, in build).** Sweeping
  the sibling's defect-generator into `rpg/chat-ops/fork-game.ts` found a REAL leak — and a new
  sub-class: **it lives INSIDE A JSON BLOB (`rpg_games.config`), where a table-level allow-list is
  structurally BLIND.** The four row planes are clean; the leak is (1) `config.userMacros[].body`
  /`.args` — the member-gated `getUserMacroPicks` DELIBERATELY projects game macros as
  name+description+inputs only ("the BODY and declared `args` are prompt content and are
  deliberately withheld", chat-lifecycle.ts:294), and the only caller-facing reader of the bodies is
  host-gated `getConfigView`; (2) `config.features.relationshipHints` + `journalTypeHints` —
  host-authored steering PROSE with no member-gated reader. Both LIVE (the GM console writes them).
  Exactly the class `steeringNote` is already stripped for; the strip list simply never re-swept
  when WAVE MU and the hint maps landed. LOW severity (abandoned/solo room; GM steering prose, not
  player data). **FIX = TWO RATCHETS:** five per-plane `Required<$inferInsert>` builders PLUS
  `stripConfigForForker` rebuilt as an exhaustive `RpgGameConfig`/`RpgGameFeatures` object literal
  (no spread) — the column ratchet cannot see a new config SUB-FIELD. Whole-value drop over
  field-nulling (a body-less macro expanding to `""` is worse than an absent one); scalars stay
  COPIED per the sibling's own carve-out (stripping them would silently re-tune the fork's game for
  zero secrecy gain). **THE LESSON, generalized:** an allow-list covers COLUMNS; a JSON column needs
  its OWN exhaustive literal.
  - [ ] **`rpg_turn_tool_calls` is uncopied by `forkGame`** (S, product call) — the file header
    claims it "clones its whole 6-table vertical" and it clones five. Not a leak (the rows are
    member-readable by explicit design, `listTurnToolCalls` is member-gated) — a data-loss + a
    doc-lie. Header truth-repaired in the lane's commit; whether the fork should KEEP the tool
    record is the product call. Evidence: lane sweep.
  - [ ] **§3.6 MEMBER-STRIP COVERAGE GAP: `listJournal` serves raw model-authored prose** (S–M;
    orchestrator-verified, read the mechanic first). **NOT a D129 question** (that governs DERIVED
    planes — a summary OF hidden text escaping a path that never checked). This is a coverage gap in
    §3.6's OWN trust boundary. THE MECHANIC (read it before touching this): `lie` is one of two
    `HIDDEN_TAGS` registrants (`lie`→"Deception", `ofilter`→"Unperceived"; fields
    character/type/truth/reason) — the player sees the deceptive SURFACE, the truth rides hidden,
    **the live wire keeps it verbatim so the character lies CONSISTENTLY**, the host reads unstripped
    for the reveal eye / standing-lie inventory, summaries strip it with the trade named out loud
    ("a digest is a durable, MEMBER-PEEKABLE artifact"), and an UNTERMINATED `<lie` deliberately
    stays visible (D51: a malformed tag is a visible model error, not a secret).
    **THE GAP:** §3.6 homes the byte-selection verdict ONCE (`viewerReadsHidden`,
    `chat/substrate/member-visibility.ts`) *precisely so surfaces cannot drift* — consumed by the
    page read (`read.ts:748`), the turn return, the bus replay, `resolve-viewer-visibility`. The
    JOURNAL is a FOURTH member-facing surface carrying model-authored prose and never adopted it:
    `rpg/verbs/read/list-journal.ts:16` is `resolveMember` + `content: r.content`, no projection.
    Reachability depends on whether the model emits hidden tags into `add_journal_entry` prose (a
    teach/grammar question — CHECK IT), but the fix is defense-in-depth either way.
    **Architectural note for whoever takes it:** the strip machinery lives in CHAT; rpg reaches it
    only via an injected op (one-directional flow) — do NOT re-derive `role === "host"` in rpg, the
    verdict has one home by design. Evidence: orchestrator-read, file:line above.
- **✅ HAND-EDIT GRADUATED — CONFIRMED on the 4th leg after THREE refutations (`cea8437c0`).** The
  verifier re-drove all three prior refutations clean, plus N=3-with-a-gap, the production applier
  shapes with a mid-flight dismiss+delete+lock, element-level locks, and a **400-turn randomized
  replay-fidelity property: 0 mismatches — with a CONTROL under the old seed-base convention at
  188/400.** The zero means something because the instrument discriminates. Pairing audit: one
  producer, one consumer, `readonly StagedPatch[]` so no path reaches the fold base-less; all 6
  stage sites verified; tool execution is sequential by construction so a captured base can't drift.
  Cancel/abort untouched.
  **Two accuracy caveats for the record (no code defect):** (a) the commit's "keyed planes were
  immune" is FALSE — keyed `quests` resurrected under the old convention too; (b) **under TODAY's
  wiring the multi-patch defect was reachable only through the TOOL-HANDLER seam, not the
  cheap/folded round** — `gather.ts:194` returns `tools: []` in every mode (registry tools are never
  attached; the fold rides `terminalTools`), so production stages exactly once per turn. The fix is
  correct and future-proofs the seam; scope it honestly when citing it.
  - [ ] **`stage` merges the UNCLONED patch into `bucket.state`** (S, pre-existing, not introduced) —
    a caller that mutated its patch object AFTER staging would contaminate the live state and the
    NEXT captured base (driven: `base1 === ["a","b","SNEAK"]`). No production caller retains its
    patch; the recorded `patch` and captured bases ARE cloned. Evidence: verifier probe.
- **✅ THE F-A ORPHAN IS DEAD (CANON-1 leg 2, `3d19fd66a`, check 14/14)** — `embeddings.pruneMemoryBlocks`
  (new verb on the `pruneDocumentChunks` idiom). **The upward cascade is CEILING ARITHMETIC, not new
  machinery**: a tier-(k+1) parent exists only over a COMPLETE fanOut group, so
  `ceiling[k+1] = floor(ceiling[k]/fanOut)` and the consolidation that folded a pruned block falls
  beyond its own tier's ceiling in the SAME delete — the owner's "cascading upwards arcs" question,
  one function. Two defended calls: the prune runs BEFORE the tier-0 build (store-then-prune
  launders the orphan into a fresh parent whose hash is legitimately CURRENT, which the self-heal
  then defends) and tier-0's ceiling is the PRE-filter block count (witnessing makes a scoped
  bucket's block set legitimately sparse). Segments get the same treatment. Proven at BOTH seams:
  pool-level, and `{{memory}}` recall itself returning the hidden text with the fix disabled.
  Entirely-hidden rows KEEP their block slot — decided on block-position stability (`blockIdx` IS
  the storage key). Swept two MORE tests asserting the retired persona fallback, unprompted.
  Lesson: \[\[content-hash-self-heal-blind-to-disappearance]] — **the green self-heal test WAS the
  camouflage** ("a second pass re-summarizes nothing" is exactly what the defect looks like).
- **✅ FORKSTRIP LANDED (`58b5d06a6`) — and it was a LIVE exposure, not just the dormant column.**
  Confirmed path: host leaves without handoff → the sole member forks (the solo arm sanctions it)
  → becomes HOST of the copy → `chat.getVariantWire` hands them the departed host's per-send knobs
  (`stop`, `logitBias`, `compaction.instructions` prose) + the macro draw record. LOW severity
  (needs an abandoned room, no narrative/GM secret); `params.advanced.claudeEnv` is
  REPRESENTABLE-NOT-OBSERVED. **Four columns newly stripped** (`params`, `macroDraws` — live;
  `rawContent`, `macroFreezes` — dormant). **The class is now unmakeable:** the deny-list-over-spread
  is gone, replaced by `Required<typeof X.$inferInsert>` allow-lists — a new column FAILS THE BUILD
  until classified (proven both arms with planted probe columns + a behavioral tripwire). The rule,
  stated once: **a column readable ONLY through a host-gated surface does not survive a member→host
  fork.** Durable artifact: `docs/reviews/security/2026-08-07-fork-host-plane-strip.md` (38-column
  table + verbatim exploit path + a ready-to-paste **D133** amending D110 §3.6 — NOT minted; batch it).
  **Declared gap:** the ratchet forces re-decision on a new COLUMN, never on a new READER for an
  existing one.
  - [ ] **RPG FORK-GAME has the identical shape** (S–M, from FORKSTRIP) — `rpg/chat-ops/fork-game.ts`
    spreads `...row` + hand-strips across FIVE planes (games/sheets/snapshots/journal/checkpoints).
    Same defect generator, no known live leak; same `Required<…$inferInsert>` inversion, one function
    per plane. Evidence: lane sweep.
  - [ ] **FORK LOSES `chats.userMacroValues`** (S, product call) — the `chats` insert names its fields
    and this newer column isn't among them, so a fork silently drops the room's per-chat macro picks.
    The data-loss failure mode of an allow-list. Evidence: lane sweep.
- **⚑ TWO FORKS RULED (orchestrator, 2026-08-07) — one principle: a prescription is satisfied when
  its underlying SYMPTOM is dead; do not reverse a recorded ruling to satisfy the prescription's
  LETTER after the symptom is gone.** MOBILE leg 4 refused both rather than silently reversing, and
  what it shipped IS the ruling: (1) **§B.1 PRESERVED** (the avatar stays a sibling of the content
  column, never nested in the name row) — side-eye wanted the speaker header stacked; the lane built
  it, broke 12 pins incl. that law, and backed out. Decided by its own measurement: **§2's 65-75ch
  is UNREACHABLE at 320 in ANY composition** (65ch ≈ 490px at 15px), so the fold buys ~9% of the
  viewport for an anatomy law — bad trade. The gutter step-down (76 → 30px) is the reachable win; at
  430 the bubble's own clamp binds instead. (2) **The 08-03 persona ruling PRESERVED** — the name
  lane gets 32%, not the prescribed "half", because the marker cluster reserves "PLAYING AS" in
  WORDS ("a colour is not a statement"). The actual defect (the 38px OVERLAP) is dead and CT-pinned
  and the kicker now truncates as its header always claimed; reclaiming the other 18% would trade a
  recorded law for a symptom that no longer exists. **Both are one-line reversals if the owner
  disagrees.** Owed (the lane's transcript was lost before it could): write the 65ch-unreachable
  measurement + the not-taken-half reasoning into the two component headers.
- **⚑ A GATE WAS EDITED, CORRECTLY (MOBILE leg 4)** — `chrome-registry-completeness` RED'd a
  `topbar.trail` widget declaring `mobile` on the premise "mobile curation is a rail-only axis —
  there is no mobile bar for it." The You sheet now projects `"sheet"`-curated trail widgets, so the
  premise DIED and the axis generalised: still REQUIRED on `rail.*`, now OPTIONAL on `topbar.*`.
  The whole coupled set moved with it (check · message · `fix` string · the retired mustFail
  replaced by a mustPass · `ChromeEntry.mobile`'s contract comment · conformance green). That is the
  standard for editing a gate: the premise died, the enforcer generalised, the proof moved.
- **⚑ THE HASH RULING IS CORRECTED — a recorded conclusion had a blind spot (spine verifier,
  2026-08-07).** The stickler's §hash answer ("NO new machinery needed — blockHash folds the right
  axes; consolidationHash cascades") and `memory/persistence/queries.ts:45-46`'s own comment
  ("hiding a row changes the block's content, so blockHash changes, so the block re-digests") are
  **true for blocks that still EXIST and false for blocks that VANISH.** F-A's filter SHRINKS the
  ingest set; digest blocks are sliced by POSITION and keyed `(tier, blockIdx)`; a shrink that
  removes a trailing block leaves that block's digest — summarized FROM the rows just hidden —
  **alive in the `{{memory}}` recall pool forever**, plus the tier-1 consolidation that folded it.
  DRIVEN: after hiding seq 3-4, pass 2 re-summarized ZERO blocks and `t0:b1` survived verbatim.
  No per-block pruning exists anywhere (only whole-table wipes in `embeddings/persistence/clear.ts`).
  Fix + comment truth-repair in CANON-1 leg 2: prune orphaned blocks AND cascade upward — the
  owner's original "cascading upwards segments/arcs" question, now proven load-bearing.
- **⚑ FORK'S STRIP LIST MISSED THE SPINE'S NEW COLUMN (dormant; lane FORKSTRIP →
  security-executor).** `verbs/fork.ts:96-106` hand-strips host-plane fields because a non-host
  forker BECOMES HOST of the copy (D110 §3.6) — `message_variants.raw_content` (schema header:
  "HOST-PLANE … serving pre-strip bytes to a member re-opens the D110 §3.6 class") is copied
  VERBATIM. Not exploitable today (no production writer sets it) and hot the moment the F-C
  freeze-site lane lands. The lane's real job is the CLASS: a hand-maintained deny-list beside a
  growing schema is the defect generator (second column to slip) — invert to an allow-list or gate
  an unclassified column, and sweep every other hand-listed copy/export path.
- **✅ SPINE VERIFIED GREEN ON EVERYTHING ELSE** (evidence produced, not trusted): the two CHECKs
  BITE with positive controls (narrator+user/system rejected; `aside`/`''`/`NARRATOR` rejected;
  updates rejected in BOTH directions) · NO CHECK aborts a SET-NULL cascade (driven by deleting the
  character, the author AND the persona) · `loadCanonThroughSeq` really is the ONE ingest site
  (two callers; recall reads only derived facets) · kind NEVER decides role (13 hits/6 files, no
  dispatch reads it) · `personaIds` really was dead and both re-points are STRICTLY STRONGER
  (wire-lore presence/absence, not arg observation) · live db migrated (schema read from a COPY:
  `kind` + both CHECKs + `raw_content` + `macro_freezes`; histogram `{standard: 243}`) · 470 tests
  / 22 files + 91 CT. Dormant residuals boarded: `MESSAGE_KIND_POLICY.prompt` has ZERO production
  consumers (the comment-authoring lane owes `assembly/shape.ts` AND compaction, not just the
  writer) · an ENTIRELY-hidden row ingests as an empty-content row rather than being dropped ·
  `read.int:1113` proves only the negative half of the persona retirement.
- **✅ SIDE-EYE'S COMBINED SWEEP ADJUDICATED (2026-08-07): SHIP WITH FIXES, all findings routed,
  two fix legs already merged + check 14/14.** Its own discipline first: it opened with FOUR
  RETRACTIONS of in-run findings (sub-44px targets measured at the wrong pointer type — it nearly
  filed a false P1; a "width-0" title matching a `display:none` sibling; a "dead" weather control
  that was its own `--eval` firing post-settle; a missing `aria-pressed` its filter never looked
  for). VERIFIED-GOOD and on the don't-touch list: the mobile back-button hit zone (25/25 samples,
  48×48, real coarse pointer), the day-preserving time clear driven end-to-end on a live game, the
  transforms readout's order truth, draft visuals on all four counts. **MERGED:** RULED-BATCH leg 3
  (`92dc7d331`) — the chips' hit areas were COLLIDING (aiming at `clear` committed `snow`; a
  destructive shared-state write, invisible to any boundingBox assertion — only `elementFromPoint`
  at offsets sees it); `inline` was the wrong semantic (display-at-rest, not a control) so they take
  a real control size; the readout stops laundering a permanent-and-correct 404 into a confident
  "off" · DRAFT-POLISH leg 2 (`86a1736bc`) — a group draft now uses the SAME title derivation, seat
  arithmetic and cast-strip home as the committed room, with the solo-draft control passing in BOTH
  red-first states as the discriminator. **STILL RUNNING:** MOBILE leg 4 (six findings incl. the P1
  mobile-draft title falling through to the section label).
  **The sweep's own root-cause framing, endorsed as the mobile program's north star: "stop treating
  a phone as a narrow desktop"** — six of nine findings share one cause (the mobile shell reuses the
  desktop composition and lets it compress) and collapse together when the mobile branch becomes its
  own composition.
  **PREMISE-KILLED (owner, from the shape alone):** the "fresh-db double-seed" was per-USER seeding
  across two accounts — receipt `{ownerA: 12, ownerB: 11}`, 12 distinct names, max 2 copies. The
  lopsided 12-vs-11 is `Aldric Vane`, the `orb-seed-hero` player card minted by side-eye's OWN d20
  seed under the seeding account. Nothing to fix; the row died before the lane spent a minute on it.
  **Instrument lesson:** `/api/_debug/db/*` counts are GLOBAL (no tenant) while every UI number
  beside them is viewer-scoped — never read the difference as dedup.
- **⚑ OPS NOTE 4 (lane-authored, self-reported after it damaged a sibling):
  A LANE MUST NEVER `pkill` BY PROCESS NAME ON A SHARED BOX.** A bare
  `pkill -f headless_shell` to stop one lane's own CT suite killed EVERY playwright browser on the
  machine, including a sibling's live scoped run (2026-08-07 ~14:13). Kill your OWN pgid, or scope
  the pattern to your own invocation (`pkill -f "playwright test -c playwright-ct.config.ts"` is
  still too broad when siblings run the same config). **The orchestrator's duty when it happens:
  warn every lane that could be mid-run so nobody diagnoses a phantom** — a mass CT failure with no
  cause is exactly what a real defect looks like. Self-reported immediately with the correct form
  named, which is why it cost minutes; that is the behaviour to keep.
- **⚑ OPS NOTE 3 (the reaper — encoded after it killed a run TWICE):** a tool-managed background
  task can be REAPED BY YOUR OWN POLLING — a foreground poll that hits its 600s timeout converts
  into a NEW background task and the manager evicts the OLDEST, which is the long run you were
  watching. VITE-MAX's cold-cache CT verdict died at 1181/1211 then 1126/1211 with
  `[ELIFECYCLE] Command failed` and no report — indistinguishable from a crash near the end, and
  neither load nor flakes. LAW: anything over \~10 min launches OUTSIDE the task manager
  (`setsid nohup … </dev/null & disown`) with its exit code landed in a `.exit` file; poll by
  READING the log, never by blocking on the task. Corollary: don't stack background tasks while a
  long one matters — each is eviction pressure. \[\[polling-reaps-your-own-background-task]].
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
  - [ ] **DAY-FABRICATION residual** (S, owner-taste) — `ambientPatch`'s `?? 1` fabricates day 1
    when a host picks a TIME on a never-dated game (`day` is required min(1); the model's
    `sceneClock` does the same). Now unreachable from a clear (the RULED-BATCH fix leg split
    day/time nullability). A host-editable day field dissolves it. Evidence: fix-leg census.
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
  - [ ] **`AvatarStack` DISCARDS a caller's `aria-label`** (S, sealed-`@orb/ui` change → owner/side-eye
    territory; found by DRAFT-POLISH leg 2's CT, deliberately NOT fixed in-lane) —
    `avatar-stack.tsx:48-49` spreads `{...rest}` and THEN sets its own `aria-label={"N people"}`, so
    a caller's label can never win. BOTH the committed header's `CastAvatars` and the draft's
    `DraftCastAvatars` pass `"N characters"` and it has never applied: a screen reader hears
    "2 people" in both phases. Fixing the primitive renames every avatar stack in the app — hence
    the seal. The CT now asserts the TRUTH with the reason beside it (a pin on reality, not on the
    wish). Evidence: driven in CT.
  - [ ] **SOLO-DRAFT ROSTER CHIP parity** (S–M, blocked) — a solo COMMITTED chat has a roster chip
    (opens `SoloRosterMenu`); a solo DRAFT has none, because a draft-shaped roster popover needs the
    viewer's own seat and the only viewer read available (`useViewer`) SUSPENDS — which that header
    is forbidden to do. The lane gated the chip on `draftMembersTabJustified` and SAID SO in the
    header rather than invent a second roster surface or ship a chip opening a hidden tab. Unblocks
    on a non-suspending viewer-seat read. Evidence: lane census, source-pinned.
  - [ ] **`size="inline"` HIT-AREA COLLISION SWEEP** (S, from RULED-BATCH leg 3) — the `inline`
    variant is the display-at-REST arm: it wears no control box and carries its touch floor in an
    OVERFLOWING `::after` (28px fine / 44px coarse). Safe for an isolated datum standing in for
    prose; a **collision generator in any wrapping grid of controls** — the pseudo is taller than
    the row pitch, so later-in-DOM wins and a click lands on the row BELOW (measured at 320px:
    aiming at `clear` hit `snow`; `storm` hit `indoors`). No `boundingBox` assertion can see it —
    only `elementFromPoint` at offsets from the centre. Sweep: `ast-grep` for `size="inline"` inside
    a `flex-wrap` container; each hit is a judgement call (datum → keep, control → `size="sm"`).
    Evidence: probed, not grepped — the ambient picker was the founding instance.
  - [ ] **SNAP --mobile SIZE/ORIENTATION PRESETS** (S, instrument; owner-ordered 2026-08-07) —
    extend `snap --mobile` to take device sizes and orientations (e.g. `--mobile 320`, `--mobile
    375x812`, `--mobile 430 --landscape`, sensible named presets), ALL arms carrying the full
    touch/coarse emulation — so side-eye drives one sanctioned flag instead of hand-rolling
    chrome-devtools emulate calls per frame. The point: `--viewport` renders a FINE-pointer layout
    no phone produces (\[\[mobile-verify-needs-coarse-pointer]]); every mobile geometry claim should
    ride the coarse arm by default. Pairs with the DESIGN-AUDIT --mobile row below.
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

