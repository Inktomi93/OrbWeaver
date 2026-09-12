---
kind: design
status: active
updated: 2026-09-01
---

# work:item --dod — a Definition of Done that is RED at file time and blocks the close

> Design for #923 (owner brief 2026-08-30). The DoD makes a row's close **self-verifying**: the
> evidence becomes a command plus an expected exit, minted red-first, gated at `done`/`land`, escaped
> only by a loud recorded override. It rides the #870 verb surface as merged at `ac441d5e5` — the
> composites (`file`, `land`) gain the DoD without adding a single board call.

## The mechanism (one screen)

- **Mint (red-first):** `file … --dod '<cmd>'` runs the command ONCE, before ANY GitHub call. Exit 0
  → the row is REFUSED (exit 2) with the command and its output — a green reproduction means no bug
  or a wrong bar, both worth knowing before the row exists. Non-zero → the command is embedded in the
  issue body as a ` ```dod ` fenced block and a pairing stamp (`sha256:<16hex>` of the command)
  is written to the Project's `DoD` text field **inside the metadata write batch `file` already
  sends** (zero added calls). A command that cannot finish inside the timeout is refused at mint too
  — an unfinishable bar cannot gate anything.
- **Close (the gate):** `done` and `land` converge on the one `done()` verb; before the Status→Done
  write it re-derives the DoD from the issue body, checks the stamp, and RUNS the command. **`land`
  additionally PRE-FLIGHTS the bar before its FIRST board mutation** (owner amendment 2026-09-01): a
  red bar exits with the row exactly as it was — zero writes, one context read (a row-borne bar
  structurally cannot be known without it) — and a green pre-flight marks the row's in-process context
  so done's gate does not execute the bar twice; direct `done` invocations carry no memo and stay
  authoritative. *Rejected (the original shape, moved by the amendment): gating ONLY inside `done()` —
  `land` spent real claim/review/verify mutations before meeting the gate, leaving a red-barred row
  transitioned to Verify with Evidence written: board writes for a close that could never happen, and a
  status claiming more than the bar supports.* Red (or
  timeout, or stamp mismatch, or a half-present pair) → the close is refused (exit 2) printing what
  it RAN, the exit, and the output tail — a rotted bar reads as stale, never as mysterious. Green →
  close proceeds. A row already at Status Done skips the run (the only writer of Status=Done is
  `done()` itself, which already passed the gate — this keeps interrupted-close reruns convergent).
- **Override (loud, never absent):** `land`/`done` `--force-close --reason "<text>"` skips the run,
  posts `DoD override — <reason>` plus the overridden command as an issue comment (idempotent via
  the existing `postCommentOnce`), and closes. `--force-close` without `--reason` is misuse;
  `--force-close` on a row with no DoD is refused (there is nothing to override). #895 is the worked
  example this replaces.
- **Later edits are visible:** `dod <n…> --cmd '<cmd>'` re-mints (red-first again), rewrites the body
  block (GitHub keeps issue-body edit history — the trace), and re-stamps. `set <n> DoD …` is
  REFUSED (`DoD` joins `LIFECYCLE_FIELDS`): the stamp is only ever written by a path that just
  watched the command fail.
- **Refute closes the loop:** `refute … --dod '<cmd>'` lets a verifier mint the FAILING command as
  the row's bar in the same call that returns it to Ready — red-first is satisfied by the very
  failure being reported, and the next close must green that exact command (#902's class).
- **By class, suggested never mandated:** `--dod` on a `decision` or `program` row is refused at
  parse (they close on an owner ruling / on their children — not machine-checkable); a `bug` filed
  without one gets a one-line nudge in the success output; nothing is ever required.

## Storage — the chosen shape and the rejected alternatives

**Chosen: the command lives in the issue body (` ```dod ` fenced block); a `sha256:<16hex>`
stamp of the command lives in a Project text field `DoD`.** The body is where a bug's reproduction
belongs editorially, GitHub gives body edits a native history (build-note 2: later edits VISIBLE),
and the Project field rides existing batched writes (build-note 5: zero added calls — the stamp joins
`file`'s metadata batch at mint and arrives in `fetchIssueContext`'s field values at close).

- **Rejected: Project text field alone.** A field edit is silent — exactly the quiet-rewrite clause 4
  bans — and the 1024-char text cap would bound the command.
- **Rejected: issue body alone.** The trust surface (below): the tool would execute whatever the
  body says, and an issue AUTHOR — including an outside contributor on their own issue — can edit
  their body at will.
- **Rejected: a committed repo registry.** Perfect trace (git history) but the board owns mutable
  work state (D139/§0.1.9), and a per-row file forces a commit to main per filed row.
- **Rejected: an issue comment as the bar.** Weaker edit visibility, no prominence, and the context
  query would need author attribution the wire shape doesn't carry.

Both sides must agree before anything runs: block-without-stamp (planted by someone who cannot write
Project fields) never executes; stamp-without-block (bar deleted) refuses; a mismatch (bar edited
without re-minting) refuses and names the re-mint path. `--force-close` bypasses the pair check too —
it executes nothing, and the recorded comment quotes the body's text harmlessly.

## Trust surface (build-note 6 — stated resolution)

A DoD is arbitrary shell run by the tool. It is NOT privilege escalation: it executes as the operator
who invoked `work:item`, and the mint path (the only writer of the stamp) is the same principal class
that writes code here. The attack the pairing kills: an outsider files or edits an issue whose body
carries a ` ```dod ` block — only users with write access to Project 1 (the owner's tooling)
can mint the stamp, so an unstamped or mismatched block is refused BY NAME, never executed. The repo
being private today is not load-bearing. Execution discipline: the run rides `runNicedSync` (`nice
-n 19`, the one subprocess home), cwd = repo root, inherits the ambient env (so the workspace
NODE\_OPTIONS heap floor reaches node children), and a mint-time spelling guard refuses `npx` inside a
DoD (npx strips the heap floor and the nice — measured 2026-08-27; `pnpm exec` is the sanctioned
spelling). Commands containing a ` ``` ` line are refused at mint (they would break the fence).

## Timeout

One constant, `DOD_TIMEOUT_MS = 300_000` (5 min), per DoD run, at mint and at close — so a batched
`land` of N rows is bounded at N·timeout worst-case and a planted `sleep` provably dies. Env seam
`WORK_ITEM_DOD_TIMEOUT_MS` (the `WORK_ITEM_CACHE_DIR` precedent) exists for the test harness. A bar
that needs longer than 5 minutes is a tell it is a verification TIER, not a close gate — the refusal
message says so; `--force-close --reason` is the recorded escape. Timeout kill lands on the direct
child (`nice` execs in-process, so the pid is the command); a compound command's grandchildren can
survive the kill — accepted and documented at the runner.

## Normalization (the CRLF trap)

GitHub returns issue bodies with `\r\n`. The extractor normalizes `\r\n → \n` before parsing and the
stamp is computed over the trimmed command text — identical at mint and at read, or every close would
false-mismatch. Two ` ```dod ` blocks in one body is ambiguity → refuse loudly.

## Coupled-site inventory (enumerated before building)

| Site | Change |
| - | - |
| `contract/types.ts` | `FileCommand.dod`; `land` arm `override`; `done` split out with `override`; `refute` split out with `dod`; new `dod` arm; `Issue.body` + `RawIssueNode.body` |
| `lib/vocab.ts` | `DOD_FIELD`, `DOD_TIMEOUT_MS` (+env seam), `DOD_OUTPUT_TAIL`; `LIFECYCLE_FIELDS` += `dod` |
| `lib/parse.ts` | `--dod` on `file`; `dod` verb; `--force-close/--reason` on `land`/`done`; `--dod` on `refute`; DoD spelling guards; unknown-flag refusal on multi-option verbs (ride-along) |
| `lib/dod.ts` (new, pure) | fence build/extract/upsert, stamp, normalize, command validation |
| `ops/dod.ts` (new, I/O) | `runDod` (niced bash, timeout, output cap), `requireRedDodAtMint`, `enforceDodAtClose`, `writeDod` |
| `lib/queries.ts` | `CONTEXT_QUERY` gains `body` (same request — zero calls) |
| `ops/project.ts` | map `body` onto `Issue` |
| `ops/lifecycle.ts` | `done()` gate + override; `land` passes override; `dod`/`refute` arms; batched-refusal message names transitioned/not-attempted rows (ride-along) |
| `ops/report.ts` | `file` red-first + body compose + stamp write + bug nudge; `help` text |
| `ops/run.ts` | mint-time red-first for `dod` and `refute --dod` before any board call |
| `tests/tooling/workboard/cli.test.ts` | fake gh learns `body` (create/edit/context); the DoD behavioral pins |
| `tests/tooling/workboard/lib/dod.test.ts` (new) | pure mirror: fence/stamp/normalize/validate |
| `tests/tooling/workboard/contract/types.test-d.ts` | closed-kind list += `dod`; per-arm payload pins |
| Project 1 itself | **deployment step, orchestrator at merge: add a TEXT field named `DoD`** — until it exists, minting refuses loudly (`Project 1 has no field named DoD`) and rows without DoDs are unaffected |

New workboard test files auto-join the `pnpm test:ratchets` train-gate aggregate
(`tooling/src/verify/ops/ratchet-gate.ts` — every `tests/tooling/workboard/**` file); the added spawn
cost is kept lean (parse-level refusals asserted via `parseWorkCommand`, not spawns).

## Test plan (both directions everywhere)

Red-first mint: green DoD refuses with ZERO gh calls recorded / red DoD files with block + stamp.
Close gate: red DoD refuses printing cmd+exit+output, row stays open at Verify / green closes;
`done` and `land` both proven. Override: closes + records reason+command, with a planted witness file
proving the DoD did NOT run / missing `--reason` is misuse / no-DoD row refuses. Timeout: planted
`sleep` under the env-seam timeout refuses at close AND at mint. Pairing: mismatch, unminted block,
stamp-without-block — three named refusals. Visibility: `set DoD` refused; `dod` verb re-mints
(replaces the block, restamps) and refuses green. Convergence: an interrupted close (Status already
Done) reruns without re-executing the DoD (witness). Realistic sweep-shaped arm: an `rg`-based
DoD over a scratch file goes red with the needle planted, green after removal, and the close follows.
CRLF body round-trips. Class guards: `decision`/`program` refuse `--dod`; `bug` nudge present, `work`
nudge absent. Ride-alongs: unknown-flag refusal; batched `land` refusal names already-transitioned
and not-attempted rows.

## Ride-alongs built in this lane (survey findings small enough to ride)

1. **Unknown-flag refusal on multi-option verbs** (`file`/`land`/`dod`/`done`/`refute`): flagValue
   silently ignored a typo'd flag — `file … --prioirty High` filed a row missing its Priority, and a
   typo'd `--dod` would have silently minted no bar at all. Any `--token` outside the verb's set now
   refuses as misuse.
2. **Batched refusal names the remainder**: `land 8 11 12` stopping at #11 now says which rows
   already transitioned and which were not attempted (only when the list has >1 id — single-row
   messages stay byte-stable).
3. **`refute --dod`** (above) — the verifier's failing command becomes the row's bar in the call that
   files the refutation.
4. **`file` fails ATOMICALLY on a bad enum, and enum refusals name the valid options** (the #1043
   live specimen: an invalid `--review Design` created the issue, then aborted the metadata batch —
   a half-fielded row stranded on the board). `file` now encodes the operator's metadata against the
   cached, self-healing project context BEFORE the issue exists (fail-closed: a bad value creates
   NOTHING), and `encodeWrite`'s refusal appends the valid member list so the fix needs no probe
   call. Zero added calls on the warm-cache path.

## §Proposals — owner ruling 2026-09-01: P1/P2/P3/P5 APPROVED and built (second commit); P4 DEFERRED

The four approved proposals landed in this lane's second commit, on the shapes below with these
resolutions:

- **P1 built:** `set <n…> <field> <value> [<field> <value>…]` — pairs, one batched `writeFields`
  mutation per row; a lifecycle-controlled field anywhere in the list refuses the whole call.
- **P2 built:** the over-column transform is ONE pure function (`lib/evidence.ts` `evidenceText`)
  shared by every Evidence writer (verify/reverify/refute) AND by done's same-receipt match — the
  field gets a deterministic head + `[full receipt in issue comment <hash8>]` pointer, the full text
  posts once through `postCommentOnce`, and only a 60k hard cap (GitHub's comment limit) still
  refuses, at parse.
- **P3 built:** `--body-file -` reads stdin on `file` and `create` (composes with `--dod`).
- **P5 built:** `bug.yml`/`work-item.yml` gain an optional `render: dod` textarea, and bare
  `work:item dod <n…>` ADOPTS the body's unminted block — red-first per row, stamp-only (no body
  rewrite). A fence containing GitHub's `_No response_` empty-form marker reads as ABSENT everywhere
  (or every form-filed row with a blank DoD textarea would be unclosable), and `upsertDodBlock` keys
  on fence presence so a re-mint REPLACES such a fence instead of appending a second.
- Ride-along with the approvals: the DoD-field-missing refusal now appends the one-time deployment
  step (add a TEXT field named `DoD` to Project 1) — kept even though the live board's field was
  created 2026-09-01, for fresh clones of the pattern.

## §Proposals (remaining — deferred, owner picks)

- **P4 Done-archive sweep (DEFERRED 2026-09-01 pending this priced sketch).** Done rows accumulate
  forever; every `list`/`overview` pages through them (the \~250KB dump class). GitHub has
  `archiveProjectV2Item`. Sketch: `work:item archive [--done-before <date>]` — enumerate via the
  existing `listItems`, filter Status=Done (+ closed issue state) older than the cutoff, one archive
  mutation per item, printed as a named receipt (`archived #a #b #c`). Orchestrator-run at drains,
  never automatic at `done` (a just-closed row should stay visible through the train's verify
  window). Cost: one new verb + one mutation document + a fake-gh arm, small-medium; the real
  decision is board SEMANTICS — archived items leave the default Project views, so `overview`'s
  "Done (N)" count would stop counting all-time closes unless the verb also prints a running total.
  Reversible per item (`unarchiveProjectV2Item`).

## Memory lessons consulted (by filename)

`check-docs-explicit-args-cover-docs-design.md` (this doc is named explicitly in the floor),
`committed-ledger-freshness-is-a-static-stage.md` (manifest regen in-lane, `git add` first),
`test-presence-mirror-not-suite.md` (the pure lib gets its mirror test),
`shell-fronting-parser-owes-dispatch-tests.md` (refusals asserted through the spawned CLI, not only
the parser), `near-cap-file-traps-tuple-edits.md` (all touched files audited against the 450 cap —
max lands \~315), `write-tool-nul-byte-in-template-literal.md` (post-commit `git show --stat` byte
check), `single-arm-union-seam-shape.md` (`override`/`dod` as `string | null` on their arms, never a
bag of optionals).
