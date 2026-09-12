---
kind: design
status: active
updated: 2026-09-12
---

# Gate-runtime orchestrator playbook — how a fresh session runs #1584

Steps, not history. The law and the contract are in [gate-runtime-standardization.md](gate-runtime-standardization.md).
**Read its §5 FIRST** — it states what the runtime already GIVES you, and reading it first is what stops a session
rebuilding something that shipped. Then §2 (tree state), §3 (contract), §4 (proof rules), §7 (what constrains any
order); §12 is what lanes read. This file is what YOU do, in order.

> **READ [`gate-runtime-read-first.md`](gate-runtime-read-first.md) BEFORE THIS FILE** if you are cold or
> compacted. It is the ordered read list with costs and STOP rules, and it carries the standing rulings.

## 0. Session start (every time, in this order)

0. **NOTHING GETS TO REFUSE TO CONVERT** (owner, 2026-09-12). Convert it or delete it; a missing capability is
   BUILD work. **And a LANE never refuses for that reason — it ASKS.** A lane missing a reader, a helper, a
   fixture shape or a ruling SendMessages you, states its DEFAULT, and keeps working; refuse-and-stop is only
   for work outside its fence or a design decision you have not made. **Brief that distinction explicitly every
   time** — it was briefed wrong for most of 2026-09-11 and cost at least one lane, and on 2026-09-12 I ruled a
   lane into parking a shared-reader gap that the owner reversed within the hour.

1. Prove the guard is bound: run `git stash` (bare) and expect the hook to DENY it. If it passes, relaunch from `main`
   before touching anything (hooks bind at launch).

2. **Pre-flight: DETECT THE PROCESS. Do not infer it from memory** (owner, 2026-09-13: *“we could also literally
   just detect the vllm process?”* — yes, and the tool already records everything needed to do it exactly).

   Earlier versions of this step read `Shmem` from `/proc/meminfo` and compared it to a threshold. **That was a
   PROXY for a question the tree answers directly**, and it conflated two different things: `Shmem` genuinely
   beats `ps` RSS for MEASURING a resident fleet's footprint (RSS undercounts shared memory), and it is the wrong
   instrument for asking whether the fleet EXISTS. The threshold was also set at ~1 GiB against a measured idle
   floor of **609 MiB** — 59% of the trip point — while a resident fleet is ~37 GiB, so it would have produced a
   false FLEET-UP on ordinary tmpfs drift long before it ever produced a false down.

   **The ordered detector, cheapest and most exact first — all three are read-only and none invokes the launcher:**

   ```bash
   cat .cache/stack/engines.pgid       # the tool's own JSON state record
   ls  .cache/stack/engines.stopped    # the deliberate-stop marker
   ss -ltnp | grep -E ':870[123]'      # are the ports actually listening
   ```

   `engines.pgid` is **not a pgid file** despite the name — it is a JSON record carrying, per engine, the `pid`,
   `pgid`, `port`, `executable`, base64 `cmdline`, `cwd`, a `launchMarker`, and **`startTicks`**. That last field
   is the anti-PID-REUSE check: a live pid matching the record is only the same process if its start time matches
   too. **So the exact question “is MY fleet resident” is answerable from the record alone**, which is strictly
   better than any process-name grep.

   **A DEAD PIDFILE WITH NO `engines.stopped` MARKER IS A REAL STATE AND IT IS NOT THE SAME AS “STOPPED”.**
   `engines-ctl.ts:218-226` writes the marker **only on a clean stop verdict** (`refused.size === 0`), because a
   refusal means the fleet's state is uncertain and claiming *stopped on purpose* would assert evidence nobody
   observed. So an absent marker beside dead pids means the fleet **died outside the tool's stop path**, and the
   prod supervisor's takeover decision honors the marker, not the pids. Measured 2026-09-13: exactly this state
   (three engines recorded, all pids dead, no marker), harmless only because no supervisor was running.

   **If you do grep for the process, do not self-match.** `pgrep -f` matches the shell issuing it, and bracketing
   the pattern (`[v]llm`) is NOT sufficient — it failed here because the literal string appeared in an `echo`
   earlier on the same command line. Exclude your own pid, or match the venv path
   (`.cache/vllm/venv/bin/vllm`) which cannot appear incidentally. Same family as the recorded `pkill -f` hazard.

3. `git -C <main> status --short` empty, `git log --oneline -3`, `git worktree list` (every worktree is a lane; resume,
   never respawn — a killed lane's worktree keeps its uncommitted work). **For each worktree run
   `git -C <wt> rev-list --count main..HEAD` and `git -C <wt> status --short`. A dead lane showing 0 commits and a large
   dirty set is one `worktree remove` from annihilation: CHECKPOINT it immediately** (`git -C <wt> add -u`, then
   `git -C <wt> -c core.hooksPath=/dev/null commit`) with a message that says explicitly it is a durability checkpoint
   and not a completion receipt. `add -u` stages tracked modifications only, so lane scratch files stay untracked.

4. `pnpm work:item overview`. The program row is #1584. Rows that matter: Verify (needs an Opus verifier), Ready (claim
   at dispatch), Needs owner (ask, do not build).

5. Re-derive the census: `pnpm gate:contract > <scratch>/census.log`; the total line and the distinct `gates/*.ts`
   in the descriptor-wrapper findings are the legacy roster. Never quote a number from a document — EVERY roster in
   `docs/reviews/gate-runtime/` is a frozen snapshot and they are all stale (the conversion census counts a 255-module
   corpus against 270 today). Run this AFTER lanes drain, never beside a live lane. **The sharper roster is
   `pnpm check:policy-conformance`** — it names every final policy and runs its rows, so it tells you what is
   CONVERTED AND PROVEN, which `gate:contract` (a shape check) cannot.

6. Read YOUR OWN inbox — `to-primary/` for primary, `to-b/` for claude-b — and ack SELF notes by `mv` into its
   `done/`. Write a SELF note ONLY when a context sentinel fires or you are handing the session off, **and write it
   into the inbox YOUR onboard hook reads, never the other account's** (paid 2026-09-12: claude-b filed its 96% map
   into `to-primary/`, which its own monitor and onboard hook never read; primary caught it and copied the map back
   as note 644 minutes before the compact). A SELF note is a POINTER, never a source: verify every state claim in it
   before acting (two of note 522's were false within the hour).

7. **THE DOC LAYER IS A BUDGET, NOT A READING LIST — read the tier, not the directory (measured 2026-09-12, by
   reading the whole thing and paying for it).** The owner asked for "the two docs and every doc they mention, in
   full." That set is **~1.3 MB** and it consumed 60% of an orchestrator's context window. It is the right
   instruction for the LAW tiers and the wrong one for the EVIDENCE tiers, and nobody had measured which was which.
   Here is the split, with what each tier actually bought:

   | Tier | Docs | Size | Read it? |
   | - | - | -: | - |
   | **LAW — you** | the THREE gate docs — `gate-runtime-read-first.md` + this file + `gate-runtime-standardization.md` | 222 KB | **ALWAYS, in full** (owner, amended 2026-09-13: *“it should be three docs — gate runbook, the gate plan doc, and then the gate read this first”*). They are the control. |
   | **LAW — you** | `resource-gate-access-patterns` · `uncovered-gate-conversion-census` · `exception-authority-census` · `ordinary-waiver-source-migration` | 155 KB | **ALWAYS.** These are the four the guide delegates to, and re-deriving one cost a full session on 2026-09-11, four separate times. **Skip `ordinary-waiver-source-migration`'s 1,600-line `path:line` appendix** — its own banner says every count in it is to re-derive, never to quote. |
   | **LAW — you** | `shared-semantic-readers` (M/O/G/V are COMPUTATION GROUPS — a lane must prove shared consumption before naming a `family`) · `checkpoint-2026-09-05` §"Resume order" + its per-wave lessons | 78 KB | **ALWAYS.** Mechanism law that reads like a receipt. |
   | **COUPLED SITE — you, once** | `Core-Enforcement-Active-Gates.md` | **281 KB** | **Once per program, then by ROW.** It is a coupled site you maintain and 270 dense rows; after one full pass, read only the row you are about to break. |
   | **EVIDENCE — you, selectively** | the 16 family conversion records (`*-family-1584.md`, `bus-pair`, `mixed-runtime-front-door`, `policy-soundness-family`, both `simple-visitors`) | ~300 KB | **Read the ONE whose family you are dispatching.** These carry §4.6 differentials, per-module blockers and declared limits that exist nowhere else — `schema-fact-family-1584.md`'s "Explicit blockers" section alone names five Phase-D modules' exact missing reader. |
   | **EVIDENCE — a LANE, not you** | `v-audit-wave*`, `v-exemplar-audit`, `v-gate-batch` | ~430 KB | **DO NOT READ THESE WHOLE.** Their conclusions are already distilled into §2b, and §4.1's decay rule forbids building from their cells without re-cutting. When you need one, dispatch it. |

   **The receipt that the audit tier decays, and it is TWO FOR TWO, not a guess.** Both audit waves read in full on
   2026-09-12 led with a defect that is **already closed on `main`**:

   - `v-audit-wave3`'s headline is a two-arm reproduction that a schema policy narrowing `fact.status` by hand and
     filing no receipt *"renders a CLEAN verdict over an EMPTY census and the runtime says nothing."* CLOSED —
     `policy-pass.ts:729` reds on `run.policy.facts.length > 0 && run.receipts.length === 0` (#1966, `178ee3a4c`),
     landed between that wave's baseline (167 policies) and today (171).
   - `v-audit-wave2`'s D1 — the #1972 `ctx.relativePath` escape firing in five of five registry modules — CLOSED.
     All five read their home through the shared `lib/declaration-home.ts`, and each carries a `mustPass` row whose
     `why` CITES that audit by path. The audit's own receipt is now the module's pin.

   Two waves, two headlines, both dead. **An audit wave is an UPPER BOUND with a timestamp; the two docs are the
   control.** What survives a wave is its METHOD (the four-bucket cut classification, the falsifier-in-both-arms
   rule, the sibling-arm transplant) — and that already lives in guide §4.1, which is where you read it.

   **Apply the guide's STALENESS RULE to every tier above**: the gate program predates the type-worlds program
   (#1351), so a 2026-09-05/06 document's "blocked", "required" or "missing" may have been satisfied or retired by
   \#1351 rather than by us. Re-derive against the tree before acting. Two carry superseded ATOMIC-premise banners —
   read the banner before citing the body, and brief a lane off the banner. Constitution §0.1 makes a lane follow a
   doc over your brief, so an unbannered stale premise misbriefs silently.

## 1. Standing rules for this program (owner, 2026-09-11)

- **Two accounts, one split (owner, 2026-09-12).** claude-b ORCHESTRATES: the verify lens (up to THREE verifier
  lanes at once), the board, rulings, memory. primary is the WORKER-orchestrator: expands briefs, runs FIVE lanes
  of work at once (idle warm legs are not lanes), merges ff-only with hooks nulled, reruns floors on `main`, and is
  the only account committing on main's checkout. `.claude/rules/orchestration.md` holds the base cap for other
  programs; while #1584 is the work the numbers above are the owner's word. Gate-heavy lanes run scoped floors
  only; whole-tree runs are serialized (below).
- **Blocks, not slivers.** No staggering. Every row is pre-filed and pre-claimed into chunks of 4–8 by area so the
  worker pulls the next chunk the moment a lane lands, without asking. One note per batch, ≤40 lines; briefs restate
  deltas only; a REFUTED cell goes back to the agent that built it as a warm leg, never a fresh lane.
- **Every verifier runs `check:structure` ONCE, in its own worktree, SERIALIZED box-wide** (one structure leg at a
  time, announced, the verifier HOLDS until "go"; three concurrent legs pushed a scaled suite on `main` into a
  timeout). Its report carries `## LEDGER ROWS (N rows)` in the ledger's exact format for every defect; the
  integrator appends the section before `## CLASS ROLLUP` in the commit that lands the report and asserts N.
- **No frontier roles (`forge`, `stickler`) unless the owner says so.**
- Lanes run in isolated worktrees off `main` (`isolation: "worktree"`); you merge by fast-forward with the hook path
  nulled after the lane rebases; you run its named floor again on `main` after the merge.
- Every commit and merge until the mixed `check:structure` is green on `main`: `git -c core.hooksPath=/dev/null …`,
  scoped floor named in the message. Whole-tree checks are red by construction; baseline them, never launder them.
- Roles: executor (Opus by definition) for conversions that add a reader or need judgment; Sonnet
  mech-executor for fully specified conversions on existing readers and for marker translation, briefed with the
  planted-break rule for any invented proof row; one Opus verifier per merged wave, read-only, probes announced by
  SendMessage and prefixed with its lane name. Never pass `model` on a named role. (The 13 mixed-hook splits that
  were forge work are all converted, 2026-09-12.)
- Conversions are program work: landing comments on #1584, no row per gate or batch. Only defects, prerequisites and
  decisions get rows. `done` only after the verifier CONFIRMED; `--evidence` under ~700 characters; `refute` returns a
  Verify row to Ready with the fix spec as its evidence.
- Conversion lanes translate their own legacy markers in the same commit (comment-only edits under `packages/**` and
  `tests/**` are inside that lane's fence). **The pre-existing backlog that was 315 `ONESHOT-OK` in CT files plus 55
  `@owner-scope*` under `packages/server` is CLOSED — both measure ZERO live markers (2026-09-11 evening); every
  remaining site is a gate self-quote, an engine fixture, or explanatory prose.** What is NOT closed is the rest of the
  taxonomy: guide §7's NINE KINDS table, and its dated per-grammar census. Three grammars still carry 12 live markers
  and all three owners are still legacy, so they are PARKED behind the owner-is-final fence and convert with their
  gates — they are not a lane.
- **ESCALATION: ASK-AND-CONTINUE is the default; REFUSE-AND-STOP is the exception.** A lane that needs something it
  does not have **SendMessages you, you rule, and it goes back to work** — it does not die with a receipt. Refusal is
  correct for exactly two cases: the work is genuinely outside its fence (a sibling lane owns the file, or it would
  write a shared table like `lib/reviewed-grants.ts`), or building the thing is a DESIGN DECISION you have not made.
  A missing shared reader, a missing helper, an unclear contract question, an arm that needs a new fixture — all
  ask-and-continue. **Brief the distinction explicitly**, and require a stated DEFAULT in the message so a slow ruling
  still moves. This was briefed wrong for most of 2026-09-11: "a correct refusal is a SUCCESS" went into every brief
  undifferentiated, which is right for out-of-fence and wrong for a missing prerequisite, and it cost at least one lane
  that could have kept going.
- No SELF dispatch maps at dispatch time; no rule edits mid-lane except to fix the source of a repeated correction.

## 2. Work order (dependency order; do not reorder to fill slots)

**Phase A — DONE, landed 2026-09-11 at `d21ece8d8`.** The mixed front door, the whole-corpus conformance stage
(#1941), both contracts read by `enforcement-registry-parity`/`gate-modernization`, and the `schema-fact-health`
retirement (#1948). What it gives you is guide §5; do not rebuild it.

**Phase B — DONE. All three slots closed; kept struck so the next reader does not re-open them.**

**Do not resume the worktrees named below — they are gone.** #1935 is **Done** and
`.claude/worktrees/agent-a2dae218300f26638` no longer exists; `agent-a588b7202b748d71e` is contained on `main`.
Verified 2026-09-12. The prose under items 1 and 2 is kept ONLY for the adjudication shapes it names, which recur
in every marker and proof lane.

1. ~~Marker backlog~~ **DONE — both vocabularies measure ZERO live markers (2026-09-11 evening), and worktree
   `agent-a588b7202b748d71e` is contained (`main..HEAD` = 0, clean), so its work is on `main`.** Verified by the
   marker-form predicate, not a mention count: every surviving `ONESHOT-OK` site is the gate's own grammar string
   (`ct-no-oneshot-live-read-assert.ts`), the legacy engine (`lib/gate-ignore.ts`) or one fixture suite; every
   surviving `@owner-scope*` site is explanatory prose, which the three gate headers state themselves
   (`owner-scoped-reads.ts:13,17`, `owner-scoped-writes.ts:32,36`, `owner-scoped-upserts.ts:13`). **Do not re-open
   this as "the marker backlog" — the remaining work is per-grammar and lives in guide §7's NINE KINDS table.**
   Original brief, kept for the adjudication shapes it names, which recur in every marker lane:
   resume `.claude/worktrees/agent-a588b7202b748d71e`, **checkpointed at `8f1b31897` (121 files) — the
   lane does NOT redo it, it rebases onto `main` first**. Both vocabularies are substantially translated: the
   `@owner-scope*` markers under `packages/server` AND ~110 CT files of `ONESHOT-OK`. mech-executor. The checkpoint
   contains **26 non-comment diff lines that must each be adjudicated** before merge, in two shapes: a trailing marker
   relocated across a ternary operand (`: db` split over a comment line — restructure so the marker sits above the
   whole statement, since formatting will move it), and trailing `ONESHOT-OK` markers DELETED with no `@orb-waive`
   replacement (each is either a dead marker, which guide §8.6 allows only if it is counted and listed, or a silent
   suppression loss). Also remove its two `p-marker-translate-scratch*.test.ts` files. Receipt: both families at 0
   blocking findings on the real tree and 0 unused markers (`policy.authority.alarms` and
   `policy.waiverCarrierRefusals` both empty).

   **DO NOT use `git diff -U0 | grep -vE '^[-+]\s*//'` as that receipt — it is broken and it was in this playbook.**
   The filter's predicate is "is this line a comment", and BOTH halves of a moved comment are comments, so it drops the
   `+` half and renders a RELOCATED marker as a silent deletion — precisely the defect such a filter is deployed to
   hunt. Paid 2026-09-11: all ten "deleted with no replacement" sites it reported were relocations. **Instead:**
   re-locate the guarded expression in the CURRENT tree and read the line above it, and cross-check a before/after
   count of the marker's CARRIER POSITION (`grep -E '\S.*//\s*MARKER'` counts trailing-position sites; that number
   going to 0 while the leading count rises by the same amount is a relocation, not a loss).

   **The routing answer for every custom grammar is already written** — `ordinary-waiver-source-migration.md`
   §"Closed 11-grammar disposition" gives a per-grammar verdict (CENTRALIZE · DELETE EMPTY · DELETE WITH THE GATE)
   with its parser receipt and candidate file set. Do not re-derive it per lane. Two traps it names: **`@swallowed-ok`
   has TWO consumers** — the verifier gate and a separate AST lens (`tooling/src/ast/ops/swallowed.ts`), which is
   explicitly *"not an alias"*, so translating the six shared source files can silently change the lens verdict; and
   **`@finding-overload-ok` (24 sites) is DELETED WITH ITS GATE, never translated** — but its node-vs-file provenance
   cases transplant into the final report-sink tests, because `gate-ignore-inventory` and `finding-overload-provenance`
   are *"retired policy modules, not discarded proof populations."* A file/resource finding at line 0 or 1 is
   unsuppressible by construction (no preceding source line).
2. ~~Proof rework~~ **DONE (#1935, Done; worktree gone).** Was: resume `.claude/worktrees/agent-a2dae218300f26638`, **checkpointed at `20550dc83` (3 files); rebase
   onto `main` first**. Item 1 was built under the SUPERSEDED scope (per-gate negative arms); correct it to guide
   §4.2 — positive same-position arm per tenancy policy, delete the vacuous negative arms — then item 2: the
   `test-no-stubs` cross-file fixture whose offsets must actually OVERLAP (the prior attempt's never did), plus its
   `@tests` header note. That fixture is an invented row for a new property, so it owes a planted break. This is
   \#1935's rework, already Running and claimed; `review` → `verify` → verifier → `done`.
3. ~~#1946 guard residuals~~ **DONE (playbook §2b DONE table).** Was: (Sonnet mech-executor; hook + its pin + `registry.test.ts`; both-direction pins; no-loosening
   A/B over the pin ROWS table).

**Phase B2 — make the CONVERTED corpus sound before converting more (owner, 2026-09-11: "I'd rather get our new
gates in a pristine place before converting old ones"). Precedes C and D.**

**DONE 2026-09-11:** the conformance bar itself. `pnpm check:policy-conformance` is **0 failures, exit 0** at
`097958302` (162 policies · 1,471 rows · ~10.7 s), down from 95 failures that morning. Both remaining failures were
one class, closed by #1953 (`registry-fact`, per subject) and #1955 (`bus-fact` + `bus-definition-fact`, per
provider): a provider receipting what it FOUND rather than what it MEASURED, which preempts its own `-health`
accuser. The rule is guide §12.3. Also done: the `mustFlag`/`expect` half (39 rows, `cf38cd6df`), #1954 in full
(`bus-on-data-no-store-write`'s unspellable paren token, plus the false "in className" claim in
`no-raw-container-widths` / `no-raw-typography-in-features` / `no-raw-spacing-in-features`).

**0 failures is the FLOOR B2 stands on, not B2's goal.** The owner's bar is guide §5b: every converted module must be
one you can point a conversion lane at and say *go look how they do it*. Conformance green only proves a module's
DECLARED rows execute — not that it declared the right rows, used the smallest complete contract, named its family
honestly, or told the truth in its `message`. What green bought is that the audit below is now CHEAP, because the
tree tells you the moment a fix breaks a row.

**Why this precedes D and is not optional polish:** the converted set is the transmission mechanism for the other
106\. A defect left in an exemplar gets copied, so B2 debt is the only debt in this program that multiplies.

1. **The §5b exemplar audit — the main event.** Seven criteria per module over 162 modules. `verifier`-class lanes at
   family granularity, one family per lane, a per-module verdict line required so a miss surfaces as a missing row
   rather than hiding inside "none found" (§5). Items 2, 3 and 5 of §5b are judgment about whether prose matches
   behavior and cannot be delegated to a script or a `scout`. Mechanically bounded so far: 2 ordinary policies carry
   no `fix` (`no-decorators`, `no-if-is-group`) and 4 have no header (those two plus `no-media-queries-in-features`,
   `testid-typed-only`).

   **THE BAR IS PLANE COVERAGE, NOT A MODULE COUNT — AMENDED 2026-09-12 by the owner, hours after I set it
   wrong.** I first ruled the sweep over at "112 of 167", which is a count with no relationship to what the
   audit is FOR. The owner's correction: *"isn't the audit to make sure the new gates we already have are
   actually properly set and exemplar pristine so future gates can copy off them?"* That is §5b's own stated
   purpose, and it makes the finish line **one CONFIRMED exemplar per evidence plane, named in guide §3** —
   which is small and finishable, where 167 is neither.

   **Measured against that bar the corpus was FAILING, and in the law doc.** Guide §3's plane→exemplar table
   named a REFUTED module for **six of seven planes** — a Phase-D lane sent there picked a refuted shape and
   copied it. §3 is rewritten with a verdict column; the audit's copy set is now the table a lane reads.

   ~~**ONE PLANE HAS NO CONFIRMED EXEMPLAR: closed RESOURCE.**~~ **CLOSED 2026-09-12 at `be4cdebcd`
   (`f-resource-exemplar`). The gate is LIFTED and every plane now has a confirmed exemplar** — verifier
   pending on this one, so a lane copying it is told that. #1979 is CLOSED (`2bacd5ef9`, 10 of 10 resource
   modules on `readyResourceValue`; the "six sites remain" row was stale). Both incumbents are confirmed to
   the §5b bar, and the lane wrote the durable answer the plane was missing:
   **[`resource-policy-contract.md`](resource-policy-contract.md)** — the seven things a resource policy owes,
   with six rejected alternatives and their receipts. **Point a resource conversion at that file, not at a
   module.** Kept struck rather than deleted because this row blocked Phase D for a day and the next reader
   must see that it is gone, not wonder whether it was skipped.

   **And my justification for stopping was too strong — the verifier refuted it the same day.** I argued
   \#1971 "mechanized the cheap half". Measured: its arm M judges **27 of 252** `messageIncludes` rows (167
   unjudged from unreadable modules, 58 from an UNDECLARED zero-hit branch) and carries a reproducible FALSE
   POSITIVE — a report sink passed as a function PARAMETER is invisible to its census, so an honest row reads
   as a tautology (live shape in `no-tailwind-dark-variant.ts:158`, `member-card-clamped.ts:46`). The enforcer
   is real and its four counts reproduce, but it does not replace a reading lane. Waves 1-10 audited
   **112 of 167**; the remaining ~55 are not swept for their own sake. The reason is #1971:
   the §5b soundness enforcer landed and MECHANIZED the four defect classes a script can catch (wave 1's
   D1, D3, D7, D10), and it reports its own worklist on the commit bar. Spending Opus verifier lanes on
   what a gate now catches every commit is paying twice. What the enforcer still cannot see is §5b.2 (is
   the `message` TRUE of what the code flags), §5b.5 (does the header record the decisions) and §4.1 (the
   narrowing CUT) — judgment and mutation — so an audit lane is still the only way to get those, and that
   is exactly what a copy-target dispatch needs. **~5 verifier lanes saved; the remaining spine is
   conversion.**

   **AUDIT STATE — the sweep is CLOSED and the bar is met. Do not re-open it.** Every evidence plane in guide §3
   now names a CONFIRMED exemplar, the resource plane included (`be4cdebcd`, verifier-checked, its one refuted
   cell fixed at `a4ed280d1`). From here an audit runs **per-dispatch, on the family being handed to a lane**,
   never as a corpus sweep — and the module count below is frozen history against a 167-module corpus that is now
   179\. Waves 1-10 audited 112 of that 167.

   **AUDIT STATE — 2026-09-12. Waves 1-10 complete, 112 of 167 modules audited** (wave 9 closed wave 8's open axes on the same 14 modules rather than adding new ones — hence +1, not +14) (wave 8's 25 = 24 fresh + 1 partial re-audit; `origin-server`'s §4.1 cuts and reachability probes are NOT covered and are wave 9's obvious start) (wave 5's 15 include ONE re-audit of `no-inline-types`, already covered by wave 1 — cross-check every wave's subjects against the prior audit docs before counting them fresh).

| wave | subjects | verdict | narrowings |
| - | - | - | - |
| 1 | the ten cited exemplars | **9 REFUTED**; only `user-bus-deferred-member` copyable | 12/30 by the NAIVE sweep (unsplit, overstates) |
| 2 | registry/completeness ×8 | **7 REFUTED**; the 8th was LEGACY, not a subject | naive 12/30 → **classified 5 genuinely unenforced (17%)** |
| 3 | drizzle-schema ×9 | all nine REFUTED | **best proof axes yet**: 1 of 53 rows count-less, 0 of 6 transplants tautologous |
| 4 | raw-CSS / token ×9 | **all nine REFUTED** | 31 cuts → 19 enforced / **10 unenforced (32%)** / 2 unfalsifiable / **0 mutually redundant (MEASURED)** |
| 5 | `ordinary-visitors` ×15 | **13 REFUTED / 2 confirmed** | 94 cuts → naive 56 clean → **33 UNENFORCED (35%)**; naive over-reports by 41% |
| 6 | `origin-client` ×12 | **all 12 REFUTED** | 59 cuts → naive 29 clean → **25 UNENFORCED (42%)**; 1 mutually redundant, 3 unfalsifiable |
| 10 | the BUS plane ×6 + `id-brand-flow` ×5 + 1 re-audit = **12** | **8 REFUTED / 3 CONFIRMED / 1 re-audit CONFIRMED** | 47 cuts → naive 51% → **30% open**, ~71% over-report. **34 of 34 rows carry `count` — a program first.** Third answer reached **0 of 12**. Two HIGH: `no-raw-id`'s private zod reader is blind to a one-hop re-export door (**#2009**), and the roster publishes the RETIRED `@foreign-id-ok` grammar, 3 dead vs 76 live (**#2010**) |
| 9 | `origin-server` ×14 (the axes wave 8 left open) | **14 REFUTED** | 107 cuts, each with its DIRECTION → naive 46% → **32% UNENFORCED**. **Third answer reached 11 of 14 — best in the program.** Headline is not a proof gap: **FIVE gates ACCUSE CORRECT CODE on unmodified source (#2006, P1)** |
| 8 | `home-server` 11 + `origin-server` 14 = **25** | **24 REFUTED / 1 partial re-audit** | 46 cuts → naive 19 clean (41%) → **11 UNENFORCED (24%)**, over-report 73%. **Best proof axes ever: 155 of 155 rows carry `count`, 14 of 14 identity arms discriminate, third answer REACHED in 7 of 8.** §5b.5 fails **25 of 25** (no FAMILY line, no POPULATION PORT, no legacy SHA) |
| 7 | `home-client` ×14 | **13 REFUTED / 1 confirmed-with-repairs** | 85 cuts → naive 29 clean (34%) → **17 UNENFORCED (20%)**, 8 mutually redundant, 4 unfalsifiable. **Naive over-reports by 71%** — the widest gap, caused by declared PERF PREFILTERS that cut clean by design. **71 of 71 rows carry `count`; zero tautologies** |

**AND A LATER WAVE SUPERSEDES AN EARLIER WAVE'S CUT TABLE.** Wave 1 recorded the tier-home-health population fence
as UNENFORCED; wave 4 read the same fence and did not list it as a narrowing at all, because no discriminating
fixture can EXIST (the keys are hardcoded under one package). A fix lane working the old cell would have invented a
row that discriminates nothing. **Re-cut every cell before building against it; when two waves disagree, prefer the
one whose reasoning names a mechanism.** Paid on #1993.

**EVERY WAVE'S NAIVE UNENFORCED FIGURE IS AN UPPER BOUND, and waves 4–6 were never corrected for the prefilter
shape wave 7 found.** Read 32% / 35% / 42% as naive; wave 7's own naive 34% classified down to 20%. Do not compare
a naive number against a classified one.

**Wave 4's zero mutually-redundant is a measurement, not an absence of effort** — it ran both cluster cuts and they
came back clean, which REFUTED redundancy and meant six separate `mustPass` rows were owed rather than a deletion.
Do not treat the cluster cut as a formality that always collapses.

**Wave 4 also found a defect no axis was looking for:** converting a gate left `gate-conformance.repo.int.test.ts:49`
RED and disconnected `gate-ignore-grammar.repo.int.test.ts` entirely, and a gate HEADER still cited that dead pin as
its receipt. The rule that catches it is now guide §8 + the path-scoped rule (`047dc1570`).

**Wave 2 beat wave 1 on every proof axis** — 0 of 45 rows missing `count` (wave 1: 2 of 33), **0 tautologies (all six
sibling-arm transplants FAILED)**, 7/7 identity arms alarm on a dead position, no loader-property limit anywhere.
So the corpus is NOT uniformly bad; the exemplar set was the bad part, which is the worst possible place for it.

**FOUR copyable modules now, and waves 5-6 found the first ORDINARY and reviewed-grant ones** — which matters more
than the count, because most of the remaining 104 are ordinary: **`no-mutating-register-api`** (ordinary; its
`mustPass[3]` `why` says *“this is the only row that dies without it”* and the audit cut the population and proved that
sentence TRUE; `fix` names the waiver spelling AND the position rule) and **`no-raw-interactive-intrinsics`** /
**`zustand-selector-stability`** (**ORDINARY** — `zustand-selector-stability.ts:110`; this row said reviewed-grant for a day and was WRONG about the tree, corrected 2026-09-12 by the lane it misbriefed; zero unenforced narrowings, 6/6 exact `count`+`token`). **ANTI-patterns,
never point a lane at these:** `no-raw-spacing-in-features`'s header, `no-manual-token-estimate`, `no-inline-types`,
`zod-modern-spellings`, `persistence-boundary`, `no-rejected-cors-proxy`. Prior two, still valid: (wave 4 named `spacing-tier-home-health` as a third candidate for a HARD tripwire only, and only after it lands one §4.5 pin; it also named an ANTI-pattern — never point a lane at `no-raw-spacing-in-features`'s header): `user-bus-deferred-member` (wave 1) and `section-registry-completeness` (wave 2 —
4/4 narrowings enforced, both fence rows state their own cut result and both are TRUE, header and roster row
accurate). **Naming the module a lane should COPY is the most actionable thing an audit produces — require it.**

**~131 modules remain (~104 once waves 5-6 land), ~13-16 verifier lanes at 8-15 per lane.** Run by FAMILY so one cold read covers the batch.

**MEASURED SCOPE (wave 1, 2026-09-12) — this is a 167-module sweep, not an item, and the rate is the reason it
precedes D.** Wave 1 audited the ten modules `exemplars-2026-09-11.md` cites as "copy these shapes" and **REFUTED
NINE**; only `user-bus-deferred-member` survives as copyable. Two of the three the doc marked **"Wart: none found"**
were refuted SEVERE. **12 of 30 narrowings came back UNENFORCED — 40%, double the corpus's prior ~1-in-5 rate.**
Receipts per module: [`v-exemplar-audit-2026-09-12.md`](../reviews/gate-runtime/v-exemplar-audit-2026-09-12.md).

**131 modules remain unaudited (36 of 167 done; waves 5-6 will take it to 63).** At ~8-10 modules per verifier lane that is ~16-18 lanes, and it is the honest
number to plan against rather than rediscover. Run them by FAMILY so one cold read covers the batch, and fold both
mandatory sweeps into each lane rather than as separate passes: the §4.1 narrowing cut test, and #1968's
expectation-row check.

**Every audit lane runs `pnpm check:structure` ONCE and reports two numbers** — `N tool error(s)` and `N withheld`.
Wave 1 did not, declared the gap honestly, and a defect landed exactly in it: a policy at 0 conformance failures,
fully withheld on the real tree (guide §5, #1972/#1973). Conformance runs on virtual projects with no
`node_modules` and is structurally blind to that class.

**Fix lanes split by MODULE, not by defect**, because the fences then cannot collide and one cold read serves every
defect in a module. Wave 1's nine refutations split cleanly into two fix lanes on that rule.
2\. ~~**#1952 — identity arms**~~ **CLOSED 2026-09-11: 0 of 86 outstanding.** The last 22 landed across three lanes,
every arm an in-module `mustPass` so no lane touched a shared test file; a fresh-context verifier flipped seven to
dead positions and got the §4.2 alarm on all seven. Kept here only so the next reader does not re-open it. Was:
batches of ~8 by family, self-checking
(guide §4.2), so cheap and parallelisable. Folds into the audit lanes rather than running as its own wave.
3\. **The narrowing sweep** (guide §4.1, found by #1954): deleting `inClassCarrier` from `no-raw-spacing-in-features`
and `no-raw-typography-in-features` left every pre-existing proof row GREEN. Two commands per module — delete the
fence in a `cp`-backed copy, run its rows, restore — so it goes inside the audit lane for each family.
4\. **Converted modules with no family test.** Their declared rows run via the conformance stage, but their §4.2/§4.5
pins have no home. Re-derive the list before dispatching; guide §2's row names the last measured set.

## 2b. THE OPEN WORK — where it lives, and the rules that survived the tables (rewritten 2026-09-12)

**This section used to carry every open row, its state and its wave table. Every one of those cells went
stale within a day — four board-state mirrors were found in this file on 2026-09-12 alone — so the tables are
gone.** Mutable state has exactly two homes and this file is neither:

- **The board.** `pnpm work:item overview` before every refill decision. The program row is #1584 (conversions
  land as its COMMENTS). Rows at **Verify** need a fresh-context Opus verifier; **Ready** rows are pre-filed and
  pre-claimed into chunks of 4–8 by area (the worker pulls them in order without asking); **Needs owner** rows
  are asked in chat once, never built around.
- **The refutation ledger** (`docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md`): one row per named
  defect with its state on today's tree. Read its OPEN rows; re-run its counting method (per-table print,
  `UNBINNED` reported) before quoting a number; the rollup is rebuilt only at a barrier.

**The rules extracted from those tables, which do not rot:**

- **Fix lanes split by MODULE, never by defect** — a defect-split follow-up leaves modules between the lanes
  (#1993). One cold read of an area serves every defect in it.
- **A fix row rides along with the lane already touching its family; a row earns its own lane only when it is
  a CLASS** (a defect present in N modules through a shared reader) **or when it BLOCKS a dispatch.**
- **A conversion can SPLIT** (one authority, one severity, one execution per policy), so price a chunk in
  POLICIES, never in modules; §12.6's thirteen mixed-hook modules became 32 policies and are all converted.
- **The remaining legacy modules are NOT "almost all `X`" — that letter was a census residual** (2026-09-12,
  `cb-v-authority-census`): the 2026-09-05 census lettered 27 of 60 and defaulted the rest. Measured per row:
  3 `O` · 8 `H` (no exemption artifact at all — zero authority work) · 4 `MI` · 6 `B` · the rest `X`, each `X`
  carrying a gate-local table, sanction, deferred row, stale arm or custom marker that needs a CENTRAL HOME before
  it converts. The spine is authority migration (#1922), priced from
  `docs/reviews/gate-runtime/v-authority-census-2026-09-12.md` §5 (chunks C0–C9, in that order — C1's four
  empty-table deletions mint no grant at all and were hidden by the residual) and read per ROW from
  `exception-authority-census.md` re-derived against the tree (its base is 2026-09-05 and it is keyed on table
  TYPE, so it cannot see a table inside a final module, one declared under another type, or a comment-justified
  bare path array). Verify a table is NON-EMPTY before designing a policy around it; two ruled arities were wrong
  for that reason.
- **A grant row minted for a subject that produces no finding is STALE ON ARRIVAL and reds.**
- **`ast-read.ts` and `symbol-reference.ts` are NOT the new fact boundary** (`shared-semantic-readers.md`); a
  module sitting on one owes a reader migration, and a brief calling them "readers that already exist" tells a
  lane to preserve what the program exists to delete.
- **The Phase-C capability fork is CLOSED**: 18 kinds, frozen (§12.4). A read no kind serves is BUILD work when
  it has two-plus consumers and a §12.4 fork with a stated default when it has one; never a recorded refusal.
- **The §5b audit sweep is CLOSED and its bar is met** (one confirmed exemplar per plane, guide §3). Audits now
  run per dispatch on the family being handed to a lane, and as standing verifier work over policies never
  audited — not as a corpus sweep. The copy set is guide §3's table; anti-patterns are named there.
- **#2000 (old-gate vs new-gate parity) does not gate Phase D**: §4.6 no longer lets a differential vanish
  (a committed test or a commit-message statement of what it found), so the backlog is closed, not growing.

**Owed to the orchestrator at a QUIET barrier — no lane may run these, and never beside a `check:structure`
(#2069: a planter and a reader on one tree is a NON-VERDICT):** `check-gates.repo.int.test.ts`,
`gate-ignore-grammar.repo.int.test.ts`, `gate-conformance.repo.int.test.ts`, `gate-spelling-twins.int.test.ts`
(all four plant `__g_` fixtures), then `check:structure` ONCE, then `ledgers:fresh`, then the doc-catalog
re-attest of every review doc a lane rewrote (a regeneration never attests a document nobody read), **then the
`tests/tooling/**` battery ONCE PER MERGE TRAIN** (ruled 2026-09-12 on #1983 part 2: not on `push` — #1842 stands —
and not nightly; the barrier is the only moment the box is quiet enough for the verdict to be about redness rather
than load, and it caps unobserved red at one train; a failure under battery load gets a SOLO re-run before it
counts), then the corpus `format:docs` LAST (frozen archaeology excluded — BOTH `docs/history/**` and
`docs/architecture/history/**`, ruled 2026-09-12; the exclusion is a named list in the formatter, never an accident
of which tree is nested where).

**THE PLANTER STEP IS A QUIET-BOX STEP (ruled 2026-09-12, #2206).** `check-gates.repo.int` runs a whole-tree
`check:structure` TWICE under `scaledBudget(300_000, 4)`; a solo pass costs ~257 s wall (17% headroom), the
session's cgroup fences it to 8 cores (`cpu-fence.sh`, `CPUQuota=800%`), and the load scaling engages only above
`loadavg == cores`, precisely missing the band where a pass slips past 300 s. So the step runs ONLY when no lane is
doing heavy work — not "serialized against structure legs" but with the box genuinely idle — and its budget is NEVER
widened (300 s is what surfaced the 257 s; a wider number hides the next regression) and its kill path is never
carved (its self-identifying text is the only reason a load kill and a real child exit 2 could be told apart tonight).
**And an in-place correction inside a LIVE-LAW review doc carries the form `**LANDED <date> (<sha>)**` beside the
original sentence, never a deletion** (ratified 2026-09-12 from `p-unaudited-fix-b`'s chunk-B leg, which invented it
because the brief falsely claimed the doc already had a correction idiom): the original stays as the dated claim,
the annotation names what landed and where, and a later reader can tell a corrected claim from a rewritten one.

**A row body's central claim carries the DATE and SHA it was measured at** (paid 2026-09-12: two of five rows in one
leg described a tree the same lane had already changed — "there is no helper", "the rules half is not written" —
neither wrong when filed, both costing a re-derivation). A lane reading a dated claim knows to re-derive before
building; an undated one reads as current.

## 3. Dispatching a lane (the brief, in this order)

1. Lane name, and "state it first in every SendMessage".
2. WHY (two sentences).
3. Read in full, in order: the guide (`gate-runtime-standardization.md`) §3, §4, §8, §12; the exemplars doc; the
   exemplar modules and tests for the lane's evidence plane; every assigned module and its legacy source via
   `git show <sha>:<path>`; any carry-forward row naming a module. GATE-AUTHORING.md is the LEGACY guide, not an input.
   **If any assigned module appears in guide §12.7, that row is a world-program (#1351) guarantee the conversion may
   not break:** the lane re-reads the CURRENT implementation on `main`, re-derives the delta against the anchor
   (`git diff 6c8424806 HEAD -- <the policy and its readers>`), and carries the row's named proof, including its
   do-not-restore prohibitions. Those rows are why a conversion can look green and still destroy an invariant.
   **A reading task is FULL READS, divvied across lanes, and the report names what it did not read** — *"I read 47
   of 57; here are the 10 I did not"*. "Grep-derived, spot-verified" is not an answer to a reading task (§5b's
   items 2, 3 and 5 are judgment about prose against behaviour, and a grep returns a false clean on exactly those);
   refuse it at landing and send the lane back to the files it skipped.
4. The exact module list with the pre-conversion SHA; the family hypothesis (a hypothesis until the lane names the
   reader); **the escalation model below — ASK vs REFUSE, and it is not one rule**; markers translated in-commit with the
   census recorded. **And every board row in the chunk as its TEXT, pasted from `pnpm -s work:item show <ids…>` (one
   call, a list) — lanes hold no `gh` and no `work:item`, so a bare row number is an instruction to go looking, and
   four lanes on 2026-09-12 spent real time proving a negative about a brief (row bodies are not in the ledger or the
   repo; they are on the board, which only the orchestrators can open). The number stays beside the text as the join to
   the ledger row and the receipt.**
5. The fence: files it owns; sibling lanes' files it must not touch; `packages/**`/`tests/**` only for comment lines.
6. Floors, exactly as the guide §8.8; never whole-tree; runs over ten minutes report and stop.
   6b. Fixtures: a proof row's `files` map is VIRTUAL (in-memory for source/types, an auto-cleaned tmpdir for resource) and
   its paths are population coordinates, not locations — see guide §4.8. A final policy never plants in the working
   tree and cannot. Probing a REAL file is the separate `cp`/`mv` rule; never `git stash`/`checkout`/`restore`.
7. Git: `git -C <wt>` always; `git add -A` fine in its own worktree; `git status --short` empty; `git show --stat` in
   the report; one commit; `git -c core.hooksPath=/dev/null commit`; Co-Authored-By trailer.
8. Hazards: `vitest list --json=/abs/path`; rg `-r` clusters; never `git stash`/`checkout`/`restore`; `pnpm ast` for
   code questions; a search that finds nothing owes a planted control; whole-tree red is baseline.
9. Report shape: commit + stat; per-module receipts; census before/after; family decisions; refusals with `file:line`;
   deviations with tree evidence; proposed lessons as text; never touches `work:item` or `gh`.

## 4. Landing a lane

1. Read the report; verify `git -C <wt> show --stat <sha>` and `git status --short` empty yourself.
2. `git -C <wt> rebase main` (repeat if `main` moved), then from `main`: `git -c core.hooksPath=/dev/null merge --ff-only <branch>`.
3. Run the lane's named floor on `main`; `pnpm gate:contract` for the delta; **`pnpm check:policy-conformance` whole
   after EVERY merge that touches a gate module** (it is the bar the bypassed hooks would have run: three arms plus
   the grant table, exit 2 = broken checker); regenerate `docs/test-baseline/manifest.json` on quiet `main` if a spec
   was added (`pnpm exec node tooling/src/verify/cli.ts baseline test-baseline-manifest`, commit it alone). The
   whole-tree `check:structure` stays a BARRIER run (serialized, never beside a planter), and its receipt is the
   PER-POLICY delta against the previous main slot, never the aggregate exit — #2106 sat red under the baseline red
   for a day; #2110 builds the delta tool.
4. Docs the lane added or rewrote: `pnpm format:docs` then `pnpm check:docs` (both exit 0), then `pnpm doc-catalog:write`
   for a rewritten doc or `pnpm doc-catalog:sync` to adopt a NEW one. Both exit 1 on the inherited ratchet rows (31
   pending debt paths plus stale `verifiedSha256` on three documents last touched 2026-09-05/06), so judge the run by
   `git diff docs/catalog/` and NOT by its exit code: keep it only if the diff touches the rows for documents you
   actually read. Never let a regeneration attest a document you have not read. Commit the catalog alone.
   **Two ledger rules paid for on 2026-09-12 evening:** (a) a verifier report's `## LEDGER ROWS` section is
   appended INSIDE the ledger's fence — above `## CLASS ROLLUP`, never after it; a section below the fence is
   invisible to the counter, the rollup and the `ledgers:fresh` reconciler while looking present to a grep
   (`6c983149e`, six rows). (b) **Any commit that changes a PRICED document owes a SIZE regeneration immediately
   after it** (`pnpm exec node tooling/src/verify/cli.ts baseline read-first-costs`, then `ledgers:fresh` real exit):
   the read-first table prices the ledger it lives beside, a ledger append is the commonest edit in this program, and
   one append reddened `ledgers:fresh` on the row that prices it; three cells were stale at the next regen, not the
   two a row had named. And land the report the section cites in the SAME commit — a section citing a file that
   exists only in a worktree sends every reader to nothing.
5. Post the receipt on #1584 (`gh issue comment --body-file`); rows: `review` + `verify --evidence` (< ~700 chars).
6. Dispatch one Opus verifier over the wave's merged commits (claims, exact fixtures to re-drive, census, the Sonnet
   assessment if a Sonnet lane is in the wave). On CONFIRMED: `done` with the identical evidence string. On REFUTED:
   `refute` with the spec; the fix goes back to a lane.
7. Fold the lane's lessons into the memory hub (`gate-migration-1584-lessons-hub.md`); if a correction had to be sent
   to a second lane, fix the FILE the lanes load, not the next brief.
8. **Tear down the worktree. This is YOUR job and it happens at EVERY landing, not at end of session** — nothing
   fires it automatically, and stale checkouts are not merely untidy: each one is a full copy of the tree, so every
   later repo-root `grep -r`/`find` returns one extra hit per worktree with a real-looking `path:line`. Eight live at
   once inflated a marker census 8x.
   Gate it on CONTAINMENT, measured, not remembered: `git rev-list --count main..wt/agent-<id>` = 0 AND
   `git -C <wt> status --short` empty means teardown loses zero bytes **OF COMMITTED WORK**.

   **CONTAINMENT IS NECESSARY AND NOT SUFFICIENT — A LIVE LANE BETWEEN COMMITS PASSES IT (measured 2026-09-13, and
   it nearly took out a working lane).** A census of 48 worktrees returned **28 as contained-and-clean, one of which
   was `f-mixed-hooks` actively building group 4**. It read contained only because the orchestrator had just
   fast-forwarded `main` to its tip, leaving it momentarily zero-ahead with a clean tree. The prose warning below
   (*never tear down a lane you might resume*) was already here, and it lost to the test — because the test computes
   a verdict and the prose does not. **So the gate is FOUR conditions, not one:**

   ```
   CONTAINED                      0 ahead, clean
   AND NOT LIVE                   no running agent owns it — check the harness task list, NEVER the tree
   AND NOT AWAITING A VERIFIER    keep contained-but-unverified until its verifier CONFIRMS
   AND NOT WANTED FOR A WARM LEG  an open row targets a module this lane owns
   ```

   The fourth is not merely tidiness: a warm leg to an already-merged lane costs ONE SendMessage, while a fresh lane
   re-pays the entire cold read of the area, which is the expensive part of a lane. Before sweeping, list the open
   rows against each candidate's modules and hold the ones that have any.
   **Then tear down through the SANCTIONED hook, never raw git:**
   `echo '{"worktree_path":"<abs worktree>","cwd":"<main checkout>"}' | .claude/hooks/worktree-remove.sh`.
   It refuses any path outside `.claude/worktrees/`, removes and prunes, and deletes only a `wt/`-prefixed branch.
   Critically it does one thing raw git cannot: if the worktree owns a live `snap --isolated` stage
   (`<main>/.cache/snap-stage/bands.json` records the owning checkout) it stops that ~7-process stack through snap's
   own door first. Remove the directory without that and the stage keeps running with a DELETED cwd, holding a band,
   a port pair and real CPU until the 60-minute idle keeper reaps it (#1848, two orphans observed 2026-09-06). If you
   ever do sweep by hand, check `bands.json` for rows whose `checkout` no longer exists and clear each with
   `pnpm snap --stage-down --stage-owner <dir> --force`.
   **The one thing containment does NOT cover:** deleting a merged lane's branch forfeits the warm leg, so a later
   REFUTED verdict costs a fresh cold lane instead of resuming that agent. So keep a contained-but-unverified lane's
   worktree until its verifier confirms, and sweep everything already verified immediately. A lane still holding
   uncommitted work or commits ahead of main is never swept — checkpoint it (§0.3) and leave it.

## 5. Lessons that bind (each paid for at least once; the incidents are in the memory hub)

### THE TRANSCRIPT AUDIT — five readers, eight compaction windows, 1.65 MB of owner/orchestrator turns (2026-09-12)

The owner ordered the whole session parsed because he believed a lot had been promised and dropped. Five
mech-executors read every line of all eight windows. **They found ONE failure, wearing six costumes**, and it is
worth more than any individual dropped item:

**I act on the SHAPE of a thing instead of reading the thing**, then report at a rung I never climbed.

| window | how it presented | times the owner had to say it |
| - | - | -: |
| 1-2 | the new contract's proof requirements misunderstood; a per-gate negative-arm demand invented | **4-5**, ending in the owner pasting a full external spec to force alignment |
| 3 | proposed a fact-receipt contract change the docs already forbade | **3** — *"i really want to stop havimg to repewt myself"* |
| 4 | *"the artifact exists and looks right"* treated as evidence it was built right | **3**, self-named at the time, then repeated |
| 6-7 | findings reported in chat and on GitHub, never landed in the doc | **6** — *"thst doesnt do me good if you dont put it in your doc"* |
| 6-7 | `contract/*.ts` headers never opened ALL SESSION while a 1.3 MB `docs/` reading plan was built | root cause of 3 same-day rediscoveries |
| 8 | invented a STOP rule this file does not contain, skipped tiers — then over-read 450 KB and hit 70% | **2**, in opposite directions |

**The rung ladder is already law** (`.claude/rules/` evidence standards: path exists < name matches < symbol declared
< exported < imported < called in a live path < a test asserts it). Every instance above is the same skip. The
program's own §5b bar was written against exactly this and I kept failing it at the orchestrator layer while
enforcing it on lanes.

**Two structural consequences, both now rules:**

1. **A finding is not landed until it is in the doc.** Chat is not a destination and a GitHub comment is not a
   destination. The measured cost of the alternative is six repetitions of one instruction.
2. **Dispatch BEFORE bookkeeping.** Lanes were allowed to drain to zero twice while merge-and-doc work ran
   serially — *"I let them all drain while doing merge-and-doc bookkeeping serially — dispatch should have come
   first."* Fill the slots, then do the paperwork.

**And the thing the audit proved that no single window could:** most items the readers flagged as "never filed"
WERE filed — the transcript just never showed it, because the filing happened in a later window. **The transcript
is evidence about what was SAID, never about what is true of the tree.** Re-derive every flagged item against the
board and the tree before acting on it; the audit's value is the PATTERN, not its individual verdicts. Acting on
its list without re-deriving would be this same failure one more time.

**Live receipt from that re-derivation:** #2005 was sitting at **Verify** while the copy set still failed it —
measured 3 of 9 modules §5b.5-complete, by SHA SHAPE with a positive control, because a word-match grep lies on
this field. Refuted back to Ready. A row at Verify that nothing re-checked is the same disease as a stale refusal
(#2013) and a one-sided roster (#2008), which makes it three instances in one week.

- **A GATE ROSTER IS NOT THE ENFORCEMENT SURFACE — absence from it is evidence of nothing** (owner
  correction, 2026-09-12, on my own filing). I read `Core-Enforcement-Deferred-Dropped.md`, found
  `asset-owner-gated` ("per-user CAS, never serves on bare row-existence, D21 no leaks ever") with its
  trigger fired and no gate of that name, read `blob.ts` far enough to confirm the BEHAVIOUR was correct,
  and filed it as a placement held by prose. The owner's answer was one line: *"we already have a similar
  new gate to that."* It is proven at the BEHAVIOURAL tier —
  `tests/server/transport/cross-tenant-sweep.suite.int.test.ts:1321` reasons about that exact route, and
  the sweep fails any procedure that is neither PROBED nor EXEMPT(reason). It is there BY DESIGN:
  `table-scoping-class`'s own roster row delegates to it (*"the membership rung is control-flow-dependent
  and the cross-tenant behavioral sweep stays that proof"*). Building the gate would have been a SECOND
  answer to a question one home already owns. **Constitution §2.2 makes enforcement a LADDER** —
  resolve-time (package deps) → compile-time (branded types, exhaustive unions) → lint-time
  (biome/dep-cruiser/gates) → test-time — and §2.3 requires a placement to name its enforcer at SOME tier,
  not at the gate tier. So before filing any "X is unenforced" row: **ask which TIER holds it**, and check
  the behavioural suites for a control-flow-dependent or per-request property, because that is where the
  doctrine PUTS those. This is the namesake trap one level out: there, a matching name was not a matching
  gate; here, a missing gate was not a missing guarantee.
- **READ THE CONTRACT HEADER BEFORE THE DESIGN DOC — the design docs state the PROGRAM, the headers state
  the MECHANISM, and a lane needs the mechanism** (owner, 2026-09-12: *"look up the resource thing in docs,
  guarantee you'll find what you need and surprise yourself"*). The constitution says it outright —
  ***"Per-domain law is the CODE + its file headers — the per-domain docs were gutted (the code is the
  doc)"*** — and I planned 1.3 MB of reading entirely out of `docs/` without opening one. Measured:
  `tooling/src/verify/contract/*.ts` is 214 KB of which **112 KB is COMMENT**, ten headers running 20-32
  lines before the first export. Highest law-per-byte surface in the program. **Three things this session
  derived the hard way were already written**: that a resource policy can never observe a non-ready resource
  (`lib/resource-declaration.ts`, above `readyResourceValue`), the refusal doctrine and its two-consumer
  reopening bar (`contract/resource-declaration.ts`), and the barrel-re-export reader gap
  (`checkpoint-2026-09-05.md:206`, **item 2 of that doc's own Resume order, open six days**). When the
  question is about a CONTRACT — what a declaration MEANS, what a status GUARANTEES, what a phase ORDERS —
  the header is the answer and the design doc is the summary.
- **AN AUDIT VERDICT IS A CLAIM ABOUT THE TREE ON ITS DATE, and citing one into a LAW doc propagates it.**
  I wrote guide §3's resource cell from wave 1's verdicts twelve hours after `0fab76771` repaired both
  modules and `2bacd5ef9` closed #1979 — into the table a conversion lane reads to pick its shape. Four
  instances in one day of building on a closed defect. **Before any audit cell reaches a brief or a doc,
  check the module.** The refutation ledger carries each defect's state; where it says UNADJUDICATED, that
  is an instruction.
- **A SYMBOL MOVE INTO `lib/` OWES THREE READS, all paid 2026-09-12 evening (the #2096 family migrations):**
  (1) **the gates/lib CONFIG ASYMMETRY** — `tooling/src/verify/gates/**` carries lint carve-outs `lib/**` does
  not (`useNamingConvention` off, which is the whole reason the tenancy-registry fork existed; TSDoc, which broke
  a moved JSDoc's code span), so before moving a symbol check what the DESTINATION enforces that the SOURCE did
  not — a property of the biome/eslint overrides, not of the code; (2) **a move must END a duplicate, not create
  one** — three provenance constants ended up declared in BOTH modules and tsc said nothing because both compile;
  read the post-move diff for surviving `const`s; (3) **a header citing another module as PRECEDENT is a
  dangling reference `dangling-refs` cannot see** — `serde-core-seal.ts:15` cited the spacing family's
  gate-to-gate arrangement as its precedent and the commit that moved that arrangement into `lib/` reversed the
  referent while correctly leaving the citing module fenced (#2177). Grep the gates tree for the moved symbol's
  NAME in comments, not only in code. And a renamed TRACKED spec is a TWO-SITE edit in the test-baseline
  manifest: `testFiles` is monotonic, so a rename with no `deletions[path].why` leaves a ghost that
  `ledgers:fresh` reports FRESH over (#2174's lane). `git diff --stat` after `git add -A` measures you against
  your own staging; the control is `git diff HEAD`.
- **A MERGE FENCE SAYS "NOTHING LANDS IN MAIN", NEVER "DO NOT MERGE / DO NOT REBASE"** (paid 2026-09-12, three
  briefs in one round). What a barrier protects is MAIN's checkout; a lane moving its OWN branch inside its worktree
  writes nothing into main and cannot change what the barrier reads. The literal wording forbade the one operation
  the lane needed, and a lane that obeys it works a stale corpus rather than ask. **And a warm leg dispatched against
  a measurement taken on main owes "ff to main's tip first" plus the tip's SHA:** a resumed lane's HEAD is wherever it
  stopped — one was 20 commits behind and a gate it was told had gone blind (`policy-binding-resolution.ts`) did not
  exist at its HEAD at all — so without the ff it measures a different corpus and calls it proven. **A tool error
  that surfaces as "N skipped" is an instrument lying by omission:** `check-gates.repo.int`'s `beforeAll` threw
  `child exit 2` with no reason because `execFileSync` without an explicit `stdio` sends the child's stderr to the
  PARENT's stream (#2197); capture it and print it in the thrown text. **And read the function, not the call site,
  before naming a cause** — the same night's "it must be a load kill" was retracted within the hour once
  `_load-budget.ts`'s four outcomes were read: the load kill has its own marker text and this message was not it.
  **A FINDING COUNT IS NOT A DIAGNOSIS** (paid twice the same night, both times attributing findings to the arm that
  had just changed): classify EVERY finding individually before pricing an arm — drive the module's own proof
  fixture through `runPass` over a synthetic root, the way the planter does, and read each finding's token and
  line. #2198's "8 findings from the re-key" was 4 liveness rows + 4 occurrence findings from placeholder selectors,
  and the arm ruled off the count alone would have closed half the row and called it done. **Its sibling: a DELTA
  read from a diff hunk is not a delta — read it from the artifact the hunk edits.** A `+` block inserting a new
  row and a `"namespace",],` line of shared context were read as "an existing row gained an arm"; the baseline JSON
  at the parent already carried that arm, and the post-fix diff showed it being REMOVED (the sanctioned shrink),
  which is only consistent with it having been there all along. Third instance in one night of a count or a delta
  read off a diff becoming a claim.
- **A TYPE FLOOR CLAIMS ONLY THE CONFIGS THAT CONTAIN YOUR FILE, and a config that ran and did not contain it reads
  exactly like green coverage** (paid three times 2026-09-12 evening). `tsconfig.tests-iso.json` resolves to TWO root
  files, so any `tests/tooling/**` PASS from it is vacuous; `tooling/tsconfig.json` (1175 roots) holds the verify
  ENGINE but not its spec, `tsconfig.json` (2297 roots) holds the SPEC but not the engine — an engine-plus-spec change
  owes BOTH programs. Before trusting a PASS, confirm the program's include list actually carries the file.
- **A cross-tool invariant needs a cross-tool pin in the PRODUCER's home** (#2175): a generator emitting bytes
  the formatter normalises away is a deadlock between two doors, and the pin that catches it lives in the
  generator's suite, run twice with the second byte-identical — otherwise the regression surfaces in a docs lane
  that has never heard of the generator, which is how `check:agents` sat red after class 1.
- Fix the source, not the lane: a correction issued twice means the rule file is wrong.
- **CLAIM AT DISPATCH. It bit TWICE on 2026-09-11 and the second time was after I had already named it.** A row
  dispatched without `claim` sits at **Ready with no Lane while an agent builds it** — invisible in-flight work, and
  `review` then refuses with *“must be Running”* when the lane lands. #1971 (a **P1**) sat that way while forge built
  it; #1974/#1975/#1969 repeated it an hour later. The composite `file --claim <lane>` exists precisely so this is one
  call. **Check the Lane field after every dispatch**, not when a transition fails.
- **NEVER WRAP A RUN IN YOUR OWN `timeout`.** A killed run is exit-124, which is the **exit-2 class — not a verdict**,
  and reading one as data is how a false green ships. Paid 2026-09-11: a `timeout 400` was wrapped around a
  `check:policy-conformance` that takes longer as the corpus grows. The harness backgrounds a long command and hands
  you an output file; read the file. Same rule as the pipe: `$?` after a pipe is the LAST stage's exit.
- **READ YOUR OWN TURNS, NOT A KEYWORD GREP OF THEM.** Reconstructing what is unfinished by grepping a transcript for
  a keyword returns what you already thought to ask for. Paid 2026-09-11: a grep for `exemplar` + open-ish words
  missed four unfiled promises that a straight read of the same extract surfaced immediately (#1993–#1996). The
  extractor is `.type == "assistant"` → `.message.content[] | select(.type=="text")`, which drops tool calls and
  results and reduces a 34 MB session to ~1 MB. **Then READ it.**
- **A FIX PASS SPLIT BY DEFECT LEAVES MODULES BETWEEN THE LANES.** Wave 1's follow-up ran three lanes by defect (the
  resource pair, matchmedia, the `ext` sweep). Four modules whose only findings were §4.1 narrowings belonged to none
  of them and sat untouched for a day (#1993). The rule *fix lanes split by MODULE* is already in §2 — **apply it to
  the audit's OWN follow-up, which is the place it was forgotten.**
- **BRIEFS RESTATE DELTAS ONLY, AND THIS ONE REGRESSED WITHIN THE HOUR.** Measured 2026-09-11: 590 KB of Agent briefs
  across 79 dispatches, 7.5 KB average, the second-largest context category — and most of it (the stash ban, `git -C`,
  rg hazards, pnpm-not-npx, floor spellings) is already in `.claude/rules/lane-standing-facts.md`, which **every lane
  auto-loads**. That file says so itself: *“lanes: these bind you, briefs restate only DELTAS.”* Three lean briefs were
  written, then the habit came straight back. **A brief carries the WHY, the fences, the module list, and the hazards
  specific to THIS work — nothing the rule file already delivers.**
- **A VERIFIER IS NOT OPTIONAL AND `land` SKIPS IT.** The composite `land` runs claim→review→verify→done in one call,
  which is correct for a defect row and WRONG for program work: §4.6 and runbook §8.7 both say program work stops at
  **Verify** until a fresh-context verifier CONFIRMS. Paid on #1966 — closed straight to Done, verified afterwards,
  and the verifier then found two surfaces the lane had never measured (the fixture populations, and scoped runs).
  The verdict was CONFIRMED; the ORDER was wrong.
- **Read the document that owns the question before ruling on it.** Every correction of 2026-09-11 — the Phase C
  capability set, biome's loader, `jsonc`'s consumer, a `JUDGMENT_DEFERRED` table's disposition — was already answered
  in the review layer, and each was caught by a lane or the owner instead of by me. Quoting §12.5 correctly is not a
  substitute for reading the census that already classified the row.
- **A BRIEF THAT SAYS "DELETE" NAMES THE FILE AND LINE YOU READ TO JUSTIFY IT. If you cannot cite a read, write
  "convert" or "investigate" instead** (2026-09-12, my own failure, caught by the lane). I told a lane to delete a
  resource-not-ready guard from two EXEMPLARS because an audit said it could not execute and guide §11 ruling 3 said
  the runtime throws one phase earlier. Two sources agreed, so I never opened `contract/resource.ts` — where four
  lines show `ResourceLoad<T>` is a DISCRIMINATED UNION whose `value` exists only on the `ready` arm. **The narrowing
  is a type requirement; it cannot be deleted, only written correctly.** Both sources were about runtime semantics and
  neither was about the call site's type obligation — I answered the question the docs were about instead of the one I
  was asking. **Two documents agreeing is not a read; it is the same unread question twice.**
  The asymmetry is what makes this a rule rather than a nit: being wrong about KEEPING something breaks nothing, and
  being wrong about DELETING it strips a requirement out of a module 104 conversions copy. One file read is the whole
  price. And the correct shape already existed — `depcruise-grant-liveness.ts:157-164`'s `readyValue<T>`, findable by
  one grep — so ruling on how resource policies should behave without reading a single other resource policy was the
  second miss inside the first.
- **NEVER DISPATCH A MARKER SWEEP LANE — THE RECONCILIATION IS THE CONVERTING LANE'S OWN FLOOR LINE** (owner
  correction, 2026-09-11, on my own dispatch). Guide §7 says *"do not plan marker lanes: plan the conversions, and the
  markers ride with them"*, and §8.6 makes translation in-commit work. When a verifier found that a merged conversion
  had DELETED one live marker instead of translating it, I dispatched a lane to sweep that gate's 335 files — which is
  the marker-backlog shape the doctrine forbids, wearing a defect-repair label. The repair itself was real and had to
  happen; the SHAPE was wrong, and the cost recurs once per conversion if the rule stays a repair instead of a gate.
  **The durable fix is guide §8.6's per-file count reconciliation, now a named floor line in §8.8**, so every future
  conversion proves it in its own commit and no sweep is ever owed. When a verifier finds a class defect, ask whether
  the fix belongs in the PROCEDURE before you spend a lane slot on the instance.
- **"THE MARKERS" IS NINE KINDS, AND A CENSUS OF ONE GRAMMAR IS EVIDENCE ABOUT NOTHING ELSE** (owner correction,
  2026-09-11 evening). The orchestrator measured `ONESHOT-OK` and `@owner-scope*`, found both at zero live markers,
  and reported "the marker backlog is CLOSED" in a #1584 comment. Two of thirteen-plus spellings. **Marker passes are
  each legacy gate's own responsibility** — its own regex, its own consumption map, its own stale sweep, each named by
  `file:line` in `ordinary-waiver-source-migration.md` §"Closed 11-grammar disposition" and again in
  `exception-authority-census.md` — which is precisely why the kinds multiply and why one grammar's zero proves
  nothing about the next. The full taxonomy is now guide §7 ("NINE KINDS OF IGNORE"); the per-gate classification is
  the conversion census's `O`/`X`/`MI`/`B` authority notation. Two traps that bit inside this one mistake: a
  `rg -c <opener>` counts MENTIONS, and every converted gate's header prose, `fix` string and proof fixtures name the
  retired spelling (so `@swallowed-ok` reads 56 mentions against 8 real markers); and a grammar at zero may be
  CENTRALIZED or merely PARKED behind the owner-is-final fence, which the count cannot distinguish. Same root as the
  lesson above it: I ruled before reading the document that owns the question.
- **A table's NAME is not evidence of its nature.** `no-floorless-control-in-wrap`'s `JUDGMENT_DEFERRED` holds two
  PERMANENT geometry rulings, so it is reviewed-grant work, not marker translation — `exception-authority-census.md`
  had read the rows and said so (`:113,142`). Read the rows and their reasons; that document classified 97 tables and
  319 rows this way and is the routing answer for all of them.
- **Fix the CLASS, not the instance.** A lane that removes one copy of a contract-hygiene defect has not closed it:
  `f52492f44` dropped the one inert `ext: ["ts","tsx"]` it was holding while 32 policies, 4 fact providers and the
  `TS-MORPH-CAPABILITIES.md` example that TEACHES the shape kept theirs. Sweep the corpus before crediting the fix, and
  fix the doc example first — it is what propagates.
- **A corrected message is not a verified message.** #1960 is a §5b criterion-2 defect on a message the exemplar wave
  had just rewritten FOR criterion 2: the new text said "untagged template" where the visitor means "no-substitution",
  which is wrong in both directions and hides a live interpolated-class-string escape. Probe the claim, do not re-read
  the prose.
- **The authoritative roster is `check:policy-conformance`, never a grep.** A bare `defineGate` search overcounts by
  three — two modules carry it inside proof-fixture STRINGS and one inside a refusal comment. The honest shape test is
  `^export const gate = defineGate(`, and the loader is better than both.
- A SCOPED suite red is never baseline. The posture's red-by-construction list is exhaustive and covers nothing
  adjacent; re-derive any scoped family-test red on a clean tree and date it against the commit that broke it.
- Grep the docs for the governing rule BEFORE recommending a contract change: guide §12.3 and
  `resource-gate-access-patterns.md:126` already rule the absence-versus-unresolved question, and a provider is atomic
  by §12.2, so per-subject failure means per-subject PROVIDERS.
- Counting proof coverage is a READING task a script can only bound: a grep for `@orb-waive <id>(` matches sibling
  negative arms, live product waivers and header prose. Escalate to `verifier`, never `scout`, and require a
  per-subject verdict line so a miss surfaces as a missing row instead of hiding inside "none found".
- Verify a subagent's MECHANISM claim against the code before writing it into law, and before a lane acts on it.
- Cheap read-only agents return false cleans on exhaustive enumeration, silently and inconsistently. Enumerate
  mechanically and verify every negative yourself; delegate READING only for qualitative classes.
- A wholesale doc rewrite can keep every section title and still strip the protection. Diff the OLD section row by row
  before committing a rewrite of a law or handoff document; "no superseded sections are kept" licenses dropping
  history, never compressing a protection list.
- Measure a lane's base with `git merge-base`; never read it from the lane's own prose.
- A document naming what to PROTECT is read in full even when a table in your own guide summarises it.
- The census is not a convertibility list; trace every read against the seven shipped resource kinds.
- Carry the legacy proof rows; identity is proven once by the positive arm; central negatives are central; a planted
  break is owed only for an invented row; a header claiming a proof it was never shown to catch is a defect.
- Never override a named role's model down; Sonnet only where the owner ruled it.
- A proof harness cites nothing if it imports no gate module; a gate's rows run only where a committed test (or, after
  phase A, the conformance stage) calls `verifyPolicyProofs` on it.
- `native-config` populations are the whole transaction by design; consumers must be demand-driven; only ordinary
  owners demand waiver carriers.
- A retirement note can encode a defect as law; re-derive the inference, not just the measurement.
- Real-tree receipts pass the FULL final roster as `knownPolicies`; a partial roster manufactures unknown-policy alarms.
- A `mustFlag`/`mustPass` row can never carry an expected authority alarm; the report-identity test drives
  `runPolicyPass`.
- Before writing visitor logic, `pnpm ast` the legacy module's core literal across converted gates: an earlier wave may
  own the rule with a stronger reader (merge with a successor proof).
- Harness: a worktree-isolated Bash refuses `pnpm`/`gh` calls with long punctuated quoted args or `$(…)`; use
  `--body-file` and plain sentences. `work:item --evidence` fails near 1000 chars (#1920); the `Lane` field is
  lifecycle-controlled; `claim` refuses a second lane on a Running row. `doc-catalog:write` exits 1 on inherited rows;
  a rewritten doc needs its receipt re-attested (sha, commit, date) and a new doc adopted via `doc-catalog:sync`.
  After a lockfile changes on `main`, `pnpm install --frozen-lockfile`. The verifier's probes on `main` are untracked
  and prefixed; stage by pathspec only.

## 6. Open owner decisions

The board's **Needs owner** column is the list; never mirror it here. As of 2026-09-12 evening it held the receipt
contract (#1982), template-literal waivability (#1984), the `contract-verb-presence` fork (#1995 — owes a tree
re-derive before it is even askable) and `hard` + `warning` on four policies (#2025). Ruled that day in chat and
recorded on their rows: #1988 (verdict types → `contract/`), #2001 (declared `countFrom` rows — a contract change with
every coupled site), #2002 (print the per-finding message when it differs), #2021 (NOT superseded — build the reader
exposure, then convert). A new fork goes to Needs owner with a stated default and deadline, never built around.
