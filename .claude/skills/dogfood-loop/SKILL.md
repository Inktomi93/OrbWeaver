---
name: dogfood-loop
description: "The drive→verify→file→fix loop for dogfooding Orbweaver — claim-FIRST work-item lifecycle discipline (the `pnpm work:item` verbs, the review→verify→done evidence byte-match, done posts + closes), the finding ladder (instrument signal → reproduce → root-cause → classify bug/decision/work/accept-as-designed-with-citation → file → fix inline vs dispatch a lane), the brief-the-outcome-not-the-seam rule, explicit retraction norms, PNG-verdict reading with the console-tracer known-fine list, and ruled-decision hygiene (immediate transitions, design docs retire with their program, parked deferrals with wake conditions). Use whenever a session dogfoods the live app, files or triages findings from a drive, decides whether something is a bug / an owner decision / work / as-designed, runs any work:item lifecycle transition, retracts an overturned finding, or converts a finding into an inline fix or a lane brief."
---

# The dogfood loop

Drive the live app, turn signals into filed work, fix with the lifecycle honest the whole way.
The loop: **drive → verify the signal → file → claim → fix → verify at the tier → review →
verify → done**, with the evidence receipt carried unchanged through the last three. Driving
craft is the `snap-driving` skill; this one is the control-plane half. Authoritative sources
that outrank this file: `.claude/rules/orchestration.md` (work control + lifecycle hygiene),
`scripts/github/work-item.ts` (the enforced transitions), `pnpm work:item --help`.

Project 1 owns MUTABLE lifecycle; durable results live in the repo and link the issue. Never
mirror status into prose. **Only the orchestrator/main session mutates Project — a dispatched
lane returns path/commit/test receipts and touches no `work:item`.**

## §1 Claim FIRST

The issue exists and is claimed BEFORE the fixing work starts — discovery → file → claim → fix,
even mid-dogfood when the fix is one obvious line. An issue minted after its own fixing commit is
retrospective paperwork, not tracking (measured 2026-08-16: #75 created 33s after its fix landed;
that ordering is the defect this rule exists to kill).

The lifecycle, as the code enforces it (`scripts/github/work-item.ts`):

- **Classes:** `work` (buildable outcome) · `bug` (reproducible contract violation) · `decision`
  (owner fork — enters Needs owner) · `program` (one committed future sprint) · `evidence`
  (re-derived finding routed onward). `pnpm work:item create <class> --title <t> --body-file <f>`
  — the matching `.github/ISSUE_TEMPLATE/*.yml` is the canonical body.
- **Statuses:** Triage → Ready → Running → Review → Verify → Done (plus Needs owner, Blocked,
  Parked).
- **Verbs:** `ready` (requires Kind, Priority, Area, Review ALL set — code-enforced; the CLI
  help's shorter list omits Kind, the code does not) → `claim <issue> --lane <lane>` (assigns,
  sets Running) → `review` → `verify <issue> --evidence <receipt>` → `done <issue> --evidence <same-receipt>`. Plus `needs-owner`, `block`/`unblock --by`, `park --wake <condition>`,
  `set`, `show`, `list --status`.
- **The evidence byte-match:** `done` refuses unless the issue's Evidence field equals
  `--evidence` exactly — carry ONE receipt string from verify to done, never re-word it. `done`
  then posts `Verification evidence: <receipt>` as a comment (idempotent) and closes the issue
  as completed.
- **Interrupted transitions are rerun-safe:** Status is written last, so an identical retry after
  an uncertain GitHub response is the recovery — rerun the operator command; never repair fields
  with raw `gh` calls.

## §2 The finding ladder

Every drive signal walks this ladder; skipping a rung ships noise into the Project.

1. **Instrument signal** — a red exit, a console class, a wrong pixel, a taste wince.
2. **Reproduce** — a second run or a minimal chain. A one-off that never recurs is a note, not a
   finding.
3. **Root-cause with receipts** — `path:line` for every load-bearing claim. A symptom without a
   located cause files as `evidence`, not as a confident `bug`.
4. **Classify:**
   - `bug` — reproducible contract violation (the contract being code, header law, or a D-entry).
   - `decision` — a genuine owner fork; state a default arm in the body.
   - `work` — a buildable improvement that violates nothing.
   - **accept-as-designed** — the behavior is a documented deliberate tradeoff (file-header law,
     D-entry, an owner ruling). CITE the source in your notes and file NOTHING. Filing a ruled
     tradeoff as a bug is itself a defect.
5. **File** — one issue, one class, template body, receipts inline.
6. **Fix — inline vs dispatch:**
   - **Inline** when small and fully in-context: you hold the root cause, the fix is local, and
     the tier's tests are runnable now. Claim first (§1), then fix.
   - **Dispatch a lane** when it is judgment work, spans an area you have not cold-read, or needs
     disjoint file fences from other live lanes.
   - **Brief the OUTCOME, not the seam.** A brief carries the outcome wanted + the law that
     governs it + the receipts you hold. Naming a mechanism/seam in a brief requires a
     `path:line` receipt that it IS the ruled home — a cited seam is a hypothesis, and lanes
     build wrong things from confidently-named wrong seams. When you cannot prove the home, hand
     the lane the symptom + receipts and let its own recon find the seam.

## §3 Retraction norms

- A finding overturned by a later receipt is **retracted explicitly**: name the wrong call, what
  it was based on, and the receipt that killed it. Refuted-then-fixed outranks confidently-wrong;
  a silent drop poisons every sibling finding's credibility.
- Before filing "X is wrong/missing", read the file header and the D-entry that govern X — the
  ruling a finding is about to violate routinely lives there, and an absence claim owes the scope
  the LAW puts the thing in, not the directory the feature's name suggests.

## §4 Reading verdicts: pixels and the console

- **Every visual claim needs the shot READ, not just captured.** A cited-but-unread PNG is a
  claim without a verdict. Read each screenshot you cite; say what you saw.
- **Taste notes are first-class findings.** File them BROKEN when they block or mislead, UGLY
  when they are taste — but file them; "instruments were green" does not close a taste question.
- **The app self-reports** (dev console, prefixed channels — the manual is
  `packages/client/src/lib/agent-tools.README.md`): `[bus]` `[trpc]` `[perf]` plus the motion
  flagger pack `[frame]` `[reflow]` `[input]` `[anim]` `[drop]` `[css]` `[space]` `[cls]`. Every
  console class that appears in a drive gets investigated — these channels dedupe per offender
  and name budgets, so one line is one real event.
- **The known-fine list (investigate everything else):**
  - `[cls]` entries tagged `virtualized: true` — sources are all rows inside a known virtualizer;
    retained in the ring, deliberately not warned, and (issue #109, 2026-08-16) excluded from the
    total the budget gates on. Read `nonVirtualizedCls` off `__orb.motion()`, not `cls`: a long
    thread's `cls` is dominated by message-list settling no app fix can move.
  - Nav-adjacent shifts within the 500ms window after an `__orb.nav` call — kept in
    `observedCls` without a false "unexpected" warning.
  - `sandbox-trace-noise` console errors — Playwright tracing injected into the app's
    script-dead sandboxed card frames; harness-induced, excluded from snap's verdict, counted in
    its RESULT line. Never an app finding.

## §5 Ruled-decision hygiene

- **A ruled decision transitions the moment it is ruled.** Owner ruling + any landed arm ⇒ out of
  Needs owner immediately (Running with a lane, or on through Review/Verify). A ruled-and-built
  issue still showing Needs owner is a lifecycle lie.
- **Design docs retire with their program.** A Done program's design doc flips
  `status: active` → archived in the same breath as the close.
- **Deferred work gets its own issue.** Any deferred-work section in a closing program gets a
  Project issue of its own — `park --wake <condition>` when not actionable now. Prose-only
  deferrals are the parallel backlog the Project exists to kill.
- **Receipts name LIVE issues.** A typed claim pointing at a CLOSED issue is semantically stale
  even when its hashes verify — re-receipt when the referenced issue closes.
