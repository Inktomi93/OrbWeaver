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
   instrument for asking whether the fleet EXISTS. The threshold was also set at \~1 GiB against a measured idle
   floor of **609 MiB** — 59% of the trip point — while a resident fleet is \~37 GiB, so it would have produced a
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

6. Read `~/.claude/bridge/to-primary/` (ack SELF notes by `mv` into `done/`). Write a SELF note ONLY when a context
   sentinel fires or you are handing the session off. A SELF note is a POINTER, never a source: verify every state
   claim in it before acting (two of note 522's were false within the hour).

7. **THE DOC LAYER IS A BUDGET, NOT A READING LIST — read the tier, not the directory (measured 2026-09-12, by
   reading the whole thing and paying for it).** The owner asked for "the two docs and every doc they mention, in
   full." That set is **\~1.3 MB** and it consumed 60% of an orchestrator's context window. It is the right
   instruction for the LAW tiers and the wrong one for the EVIDENCE tiers, and nobody had measured which was which.
   Here is the split, with what each tier actually bought:

   | Tier | Docs | Size | Read it? |
   | - | - | -: | - |
   | **LAW — you** | the THREE gate docs — `gate-runtime-read-first.md` + this file + `gate-runtime-standardization.md` | 222 KB | **ALWAYS, in full** (owner, amended 2026-09-13: *“it should be three docs — gate runbook, the gate plan doc, and then the gate read this first”*). They are the control. |
   | **LAW — you** | `resource-gate-access-patterns` · `uncovered-gate-conversion-census` · `exception-authority-census` · `ordinary-waiver-source-migration` | 155 KB | **ALWAYS.** These are the four the guide delegates to, and re-deriving one cost a full session on 2026-09-11, four separate times. **Skip `ordinary-waiver-source-migration`'s 1,600-line `path:line` appendix** — its own banner says every count in it is to re-derive, never to quote. |
   | **LAW — you** | `shared-semantic-readers` (M/O/G/V are COMPUTATION GROUPS — a lane must prove shared consumption before naming a `family`) · `checkpoint-2026-09-05` §"Resume order" + its per-wave lessons | 78 KB | **ALWAYS.** Mechanism law that reads like a receipt. |
   | **COUPLED SITE — you, once** | `Core-Enforcement-Active-Gates.md` | **281 KB** | **Once per program, then by ROW.** It is a coupled site you maintain and 270 dense rows; after one full pass, read only the row you are about to break. |
   | **EVIDENCE — you, selectively** | the 16 family conversion records (`*-family-1584.md`, `bus-pair`, `mixed-runtime-front-door`, `policy-soundness-family`, both `simple-visitors`) | \~300 KB | **Read the ONE whose family you are dispatching.** These carry §4.6 differentials, per-module blockers and declared limits that exist nowhere else — `schema-fact-family-1584.md`'s "Explicit blockers" section alone names five Phase-D modules' exact missing reader. |
   | **EVIDENCE — a LANE, not you** | `v-audit-wave*`, `v-exemplar-audit`, `v-gate-batch` | \~430 KB | **DO NOT READ THESE WHOLE.** Their conclusions are already distilled into §2b, and §4.1's decay rule forbids building from their cells without re-cutting. When you need one, dispatch it. |

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

- **Cap 5 while this program is the work; 3 otherwise.** The base cap returned to 3 at `faed86039` (2026-09-11
  09:19); the owner raised it again later the SAME day, conditioned on this program, and the later word wins. Reverts
  to 3 when #1584 closes. `.claude/rules/orchestration.md` is the cap's one home — do not re-litigate it from the 09:19
  line. Gate-heavy lanes stay ≤3 within that cap. (Phase A ran alone and is landed; no current work needs solo.)
- Lanes run in isolated worktrees off `main` (`isolation: "worktree"`); you merge by fast-forward with the hook path
  nulled after the lane rebases; you run its named floor again on `main` after the merge.
- Every commit and merge until the mixed `check:structure` is green on `main`: `git -c core.hooksPath=/dev/null …`,
  scoped floor named in the message. Whole-tree checks are red by construction; baseline them, never launder them.
- Roles: forge for runtime/architecture and the 13 mixed-hook splits; executor (Opus by definition) for conversions
  that add a reader or need judgment; Sonnet executor / mech-executor for fully specified conversions on existing
  readers and for marker translation, briefed with the planted-break rule for any invented proof row; one Opus
  verifier per merged wave, read-only, probes announced by SendMessage and prefixed with its lane name. Never pass
  `model` on a named role except the Sonnet test lanes.
- Conversions are program work: landing comments on #1584, no row per gate or batch. Only defects, prerequisites and
  decisions get rows. `done` only after the verifier CONFIRMED; `--evidence` under \~700 characters; `refute` returns a
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
   `@owner-scope*` markers under `packages/server` AND \~110 CT files of `ONESHOT-OK`. mech-executor. The checkpoint
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
`097958302` (162 policies · 1,471 rows · \~10.7 s), down from 95 failures that morning. Both remaining failures were
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
   **112 of 167**; the remaining \~55 are not swept for their own sake. The reason is #1971:
   the §5b soundness enforcer landed and MECHANIZED the four defect classes a script can catch (wave 1's
   D1, D3, D7, D10), and it reports its own worklist on the commit bar. Spending Opus verifier lanes on
   what a gate now catches every commit is paying twice. What the enforcer still cannot see is §5b.2 (is
   the `message` TRUE of what the code flags), §5b.5 (does the header record the decisions) and §4.1 (the
   narrowing CUT) — judgment and mutation — so an audit lane is still the only way to get those, and that
   is exactly what a copy-target dispatch needs. **\~5 verifier lanes saved; the remaining spine is
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
| 10 | the BUS plane ×6 + `id-brand-flow` ×5 + 1 re-audit = **12** | **8 REFUTED / 3 CONFIRMED / 1 re-audit CONFIRMED** | 47 cuts → naive 51% → **30% open**, \~71% over-report. **34 of 34 rows carry `count` — a program first.** Third answer reached **0 of 12**. Two HIGH: `no-raw-id`'s private zod reader is blind to a one-hop re-export door (**#2009**), and the roster publishes the RETIRED `@foreign-id-ok` grammar, 3 dead vs 76 live (**#2010**) |
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

**\~131 modules remain (\~104 once waves 5-6 land), \~13-16 verifier lanes at 8-15 per lane.** Run by FAMILY so one cold read covers the batch.

**MEASURED SCOPE (wave 1, 2026-09-12) — this is a 167-module sweep, not an item, and the rate is the reason it
precedes D.** Wave 1 audited the ten modules `exemplars-2026-09-11.md` cites as "copy these shapes" and **REFUTED
NINE**; only `user-bus-deferred-member` survives as copyable. Two of the three the doc marked **"Wart: none found"**
were refuted SEVERE. **12 of 30 narrowings came back UNENFORCED — 40%, double the corpus's prior \~1-in-5 rate.**
Receipts per module: [`v-exemplar-audit-2026-09-12.md`](../reviews/gate-runtime/v-exemplar-audit-2026-09-12.md).

**131 modules remain unaudited (36 of 167 done; waves 5-6 will take it to 63).** At \~8-10 modules per verifier lane that is \~16-18 lanes, and it is the honest
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
batches of \~8 by family, self-checking
(guide §4.2), so cheap and parallelisable. Folds into the audit lanes rather than running as its own wave.
3\. **The narrowing sweep** (guide §4.1, found by #1954): deleting `inClassCarrier` from `no-raw-spacing-in-features`
and `no-raw-typography-in-features` left every pre-existing proof row GREEN. Two commands per module — delete the
fence in a `cp`-backed copy, run its rows, restore — so it goes inside the audit lane for each family.
4\. **Converted modules with no family test.** Their declared rows run via the conformance stage, but their §4.2/§4.5
pins have no home. Re-derive the list before dispatching; guide §2's row names the last measured set.

## 2b. THE OPEN WORK — every row, measured 2026-09-11 evening, not remembered

**This section exists so a cold reader never has to reconstruct state from a transcript again.** Re-derive with
`pnpm work:item overview` before acting; the STATUSES rot, the GROUPING and the reasoning do not. A row's presence
here is not permission to dispatch it — check the Phase D gate below first.

### DONE — do not re-open, do not re-derive

| what | receipt |
| - | - |
| Phase A mixed runtime | `d21ece8d8` |
| The capability FREEZE — 18 kinds, per-member provenance (#1930) | `02382639e`, guide §12.4 |
| **#1971 the §5b soundness enforcer** — four final meta-policies over the gate corpus | `e4250ae50` |
| #1966 fail-open receipt arm — **verifier CONFIRMED** | `178ee3a4c` |
| #1972 `ctx.relativePath` shared reader | `d1c87fb56` |
| #1952 identity arms (0 of 86) · #1953 · #1954 · #1955 · #1941 · #1946 · #1959 | see guide §2 |
| Marker backlog — both central grammars measure ZERO live markers | guide §7 |
| Wave-1 exemplar audit D1–D6, D10 · **D9 roster rows (all four)** | `be1202579`, `b157bb9be`, `1f83d676a`, `9017baf60` |
| #1968 expectation rows — **78 → 11**, the 11 a measured registry-cardinality exemption (#2001), NOT debt | `8aa9867c3` |
| #1989 live escapes · #1990 dead third-answer arms (9 modules) | `a54394df6` — at **Verify** |
| #1993 wave-1 residual · #1987 cors-proxy · the four worst ordinary-visitors modules | `eff4b5756`, `8ad418868` |
| #1991 message split · #1994 eight family tests | `e64c274ef` |
| **§4.6's evidence may no longer vanish** — a conversion lands the differential as a committed test OR states in its message what it found; §8.8's floor names it | `2084c403e` (#2000) |

### THE THREE THAT GATE PHASE D

1. **#1971 — LANDED**, at Verify pending its wave verifier.
2. ~~**The audit reaches a bar the owner picks.**~~ **RULED 2026-09-12 — the bar is 112 of 167 and the sweep
   is CLOSED.** From here an audit runs per-dispatch, on the family being handed to a lane, never as a
   corpus sweep. See the AUDIT STATE block in §2 for the reasoning. **This gate is no longer blocking.**
3. **#1968 + #1966 + #1972 close.** #1966 and #1972 are DONE; **#1968 is the survivor** — and it is now
   MEASURED AND ENFORCED by `policy-proof-expectations`, which reports its own worklist.

**— and #2000 does NOT gate Phase D, deliberately. Read why before deciding otherwise.** 74% of the corpus has no
parity evidence, which sounds like a blocker and is not: **deliverable 3 landed, so Phase D's own 104 conversions
cannot ADD to that backlog.** The 126 is closed, not growing. What #2000 DOES gate is narrower and sharper:
**do not point a Phase D lane at a SPLIT family as an exemplar until Tier 1 is done.** A `-health` split is precisely
the shape whose behaviour is reproduced by two policies together with nothing checking the union, and copying that
shape 104 times before verifying one of them is the defect-multiplication this program exists to prevent.

### THE FIX BACKLOG RIDES ALONG — RULED 2026-09-12, and it collapses \~28 rows into ZERO dispatches

The Ready pile is \~28 gate rows and almost all of it is per-module polish: a message split, a header line,
a roster row, a missing §4.5 pin, an unenforced narrowing. **None of that gets its own lane any more.** A
fix row is carried by the lane that is already touching its family — the cold read of the area is the
expensive part, and paying it twice for a one-line header fix is how a repair loop becomes infinite.

Three consequences, all of them shrinks:

- **A conversion brief now carries its family's open fix rows** as named work, not as a separate dispatch.
- **`fix lanes split by MODULE` still holds** (§5) — it is about how to split work that IS dispatched, and
  it does not license dispatching a lane per defect.
- **A row only earns its own lane when it is a CLASS** (a defect present in N modules through a shared
  reader) or when it BLOCKS a dispatch. #2009 earned one on the first test; #2010 did not and waits.

### CURRENT STATE AND THE OPEN ROWS — re-derived 2026-09-12 evening, not remembered

**`186 final / 92 legacy / 278 modules` · conformance `186 · 2,021 rows · 0 failures` · `gate:contract` 691 across
278 · roster count line 278.** Fifteen conversions landed 2026-09-12 (`runner-config-path-liveness`, the five
ordinary client/CT gates which became SEVEN policies via two authority splits). **Re-derive before dispatching;
every number in this file rots.**

| row | what | state |
| -: | - | - |
| **#2015** | shared origin readers normalize no `QualifiedName` type reference — #2009's defect in TYPE space | Ready. **Warm leg for #2009's lane, not a fresh spawn** |
| **#2016** | `no-effect-on-shared-selection` fails OPEN on the accusing axis while its own effect axis fails closed | Running |
| **#2017** | a conversion refusal is free-text prose, so nothing reds when its blocker ships. Make it DATA + a meta-policy; **population is exactly TWO modules** | Ready |
| **#2018** | `reference-fact-module.ts` is 566 against `tooling-size`'s hard 450 — it was *exactly 450* on 2026-09-05. Same question as #1988, same directory | Ready, P3 |
| **#2019** | no `policy-soundness` arm reads `ctx.resources` — the throw-vs-return law is prose-enforced inside the family that mechanizes such laws | Ready |
| ~~#2009~~ ~~#2011~~ ~~#2013~~ ~~#2014~~ ~~#2016~~ | | **DONE**, verifier CONFIRMED |
| **#2005** | the §5b.5 header gap. **REFUTED back to Ready 2026-09-12 — it was sitting at Verify while the copy set still failed it.** Measured by SHA SHAPE with a positive control (a word-match grep LIES on this field): **3 of 9 copy targets complete**, and the three that pass are exactly the two planes worked that day | Running (`p-pristine-copyset`, all SEVEN §5b criteria) |
| **#2020** | the bracket-aware Tailwind class-token reader is hand-rolled in FOUR gates — two-plus consumers, so §12.4 makes it BUILD work. Must not run concurrently with lanes owning those four | Ready, P3 |
| **#2021** | `tsconfig-entry-liveness` needs a READER decision from **#1351**, not a capability — which is why every pass treating it as a #1930 row found nothing to build. `jsonc` is ruled out and does not reopen | Needs owner |
| **#2022** | `persisted-store-registry` fails OPEN on an unreadable factory door — the #2016 class on the device-local belt. **Not a mechanical flip: two doors feed an ATTRIBUTION, not a boolean** | Running (`p-persisted-fail-open`) |
| **#2023** | `chrome-registry-completeness` is one `.includes()` from withholding on every real run — and it is IN THE COPY SET, so the shape is armed in a teaching example. Fails LOUD (exit 2), which is why P2 not P1 | Ready, P2 |
| **#2008** · **#2010** | deferred-roster one-sidedness · roster publishes a RETIRED marker grammar | Ready, ride along |

### THE REFUTATION LEDGER IS GOING STALE — and that is the disease it was built to cure

`refutation-ledger-2026-09-12.md` last moved **2026-09-11**. Its rollup still reads 25 CLOSED / 15 OPEN / 3
SUPERSEDED / 48 UNADJUDICATED, and it still calls #2006, #2009, the ten `home-client` third answers and five
\#1978 rows OPEN — **eight-plus closures it does not know about.** Its ranked top five is now: **1 and 2 CLOSED, 3
in flight (#2016), 4 and 5 open** — and #1922 is **TEN** final modules carrying an `ExemptionTable`, not the nine
it records (`runner-config-path-liveness` became the tenth at its own conversion).

**Third instance this week of a list nobody re-derives** (#2008's deferred roster, #2013's stale refusal, this).
The fix is not a manual refresh — it is **#2017's shape: make the claim DATA so something reds when it rots.**

### PHASE D ORDERING — two traps that each produce a WRONG BRIEF, measured 2026-09-12

- **`ast-read.ts` and `symbol-reference.ts` are NOT the new fact boundary** (`shared-semantic-readers.md:33`):
  capped/undefined-returning legacy readers, 26 and 5 gate importers. A module sitting on one is **not**
  "convertible today" — it owes a reader migration. A brief that calls them "readers that already exist" tells a
  lane to preserve exactly what the program exists to delete.
- **Grep the CENSUS ROW, not the module, for exemption tables.** `firehose-import-allowlist` carries three
  **`ALLOWED`** regex zones needing reviewed-grant migration; a scan for `ALLOWLIST`/`EXEMPT` returns ZERO for it.
  `exception-authority-census.md` already classified all 97 tables and 319 rows — read the row.

### THE ROWS FILED EARLIER, and what each is waiting on

| row | what | state |
| -: | - | - |
| **#2008** | the DEFERRED roster half is one-sided — 5 rows silently stale. **Carries the full 28-row re-triage.** The "\~10 fired triggers" bucket is a READING task against the enforcement ladder, not a build queue — expected yield near zero | Ready |
| **#2009** | `no-raw-id`'s private zod reader is blind to a one-hop re-export door; one `export { z } from "zod"` barrel turns the brand gate off, undeclared. Proven by differential against its own family sibling | Running (`p-rawid-door`) |
| **#2010** | the roster publishes the RETIRED `@foreign-id-ok` grammar (3 dead vs 76 live). THIRD instance of rows whose CONTENT nothing holds | Ready — rides along |

### HOW BIG IS THE CORPUS, ACTUALLY — the arithmetic nobody had done (2026-09-12)

Asked by the owner ("didn't we have 300-something gates before this started"), and the answer is **yes, and
the number is in the docs** — it is just split across the roster PAIR, which is why every count in this
program has quoted the smaller half.

| Roster | Rows | |
| - | -: | - |
| Layer-3 **ACTIVE** (`Core-Enforcement-Active-Gates.md`) | **275** | held two-sided by `enforcement-registry-parity` |
| DORMANT | 0 | — |
| **DEFERRED** backlog (`Core-Enforcement-Deferred-Dropped.md`) | 28 | **8 of these have LANDED — see #2008** |
| PREBUILT orphan seals | 2 | one already landed |
| DROPPED (do not port) | 3 | must never exist |
| **rows across the pair** | **308** | |

**So the honest figures are 275 live · 22 genuinely still deferred · 3 dropped**, not 30 deferred. The
deferred doc was last touched 2026-08-22 and \~54 gates have landed since; nothing is two-sided on that half,
so it is wrong by 27% (**#2008**).

**AND THE REMAINING LEGACY COUNT UNDERSTATES ITS OWN WORK, because a conversion can SPLIT.** The contract
gives one authority, one severity and one execution per policy, so a legacy module whose arms differ on any
axis becomes two or more. Measured against this program's own history: **232 modules on 2026-08-25 → 275
today**, of which \~28 of the additions are program-attributable and **\~23 of those are authority splits**
(`-health` siblings, `no-rejected-cors-proxy`, `persisted-store-registry`, `contract-banned-shapes`, the bus
family). The split multiplier is not a surprise to be absorbed per lane — it is the contract working, and it
is already RULED for the hardest cases: §12.6's 13 mixed-hook modules are ruled to become **\~32** policies
(`tooling-shared-plumbing` alone → \~7, `no-inline-union-redecl` → 3, `tooling-argv-front-door` → 3).

```
171 final today
+  91 remaining legacy converting ~1:1 (some will split)
+  32 from the 13 ruled mixed-hook splits
≈ 294 converted corpus
+  22 genuinely deferred, as their triggers fire
≈ 316 policies at rest
```

**Price lanes against \~123 policies from the 104 legacy modules, not 104.** Every estimate built on the
module count is low by roughly a fifth, and the error is concentrated in exactly the 13 modules that are
already the most expensive.

### THE PHASE-D BLOCKER LIST NOBODY HAS READ — it is in the family records, not here (2026-09-12)

**`schema-fact-family-1584.md` §"Explicit blockers" names SIX modules and, for each, the exact reader that does
not exist yet.** That is Phase-D ordering data, it exists in no other document, and it was written 2026-09-06 so
every claim owes a re-derive — but the SHAPE of each blocker is engineering, not a count, and engineering does not
rot the way a roster does:

| Module | What it is actually blocked on |
| - | - |
| `own-tables-only` | canonical table import/write provenance · exact central grants · invocation-local state · a THREE-way split (reviewed-read / hard-write / hard-health) |
| `table-scoping-class` | its registry/helper surface has 13 importers plus four semantic duplicators; ONE canonical scoping fact and an authority ruling must land first |
| `json-column-write-parity` | shared writer-taint, helper-hop, SQL-write and dominance facts; reviewed-grant and hard-health arms must split |
| `open-json-column-key-parity` | shared reader/writer/key provenance; a permanent reviewed grant, #184 warning debt and hard health must split |
| `lifecycle-portability` | shared carrier/door facts and policy splits; only `rosterPresets` has a valid issue number (#26), the other deferred rows have no work-item identity |
| `no-untyped-soft-ref` | **CONVERTED since** — its six semantic permissions found their grant home. Left in the table as the shape of a blocker that CLEARED |

**The general rule this is an instance of:** when you are about to order a Phase-D family, read that family's own
`*-family-1584.md` record before the census. The census gives you a blocker CLASS (`reader`, `grant`, `state`);
the family record gives you the NAMED reader and the split. `uncovered-gate-conversion-census.md` is the ordering
source; the family record is why a row is where it is.

### THE CHECKPOINT'S RESUME ORDER, SWEPT — item 1 and item 2b were open for six days (2026-09-12)

`checkpoint-2026-09-05.md` §"Resume order" is a five-item work list written 2026-09-06, and the read list
ranks it tier 5 for exactly this reason: **it is a live queue, not a receipt.** Item 2a
(the barrel-re-export refusal) was rediscovered from the other end by a lane on 2026-09-12 after being
skipped through 41 conversions. So the whole list was swept, per item, against the tree. **Re-derive a
state cell before acting; the SHAPES below are engineering and do not rot.**

| # | Item | State on 2026-09-12 |
| - | - | - |
| 1a | move the 15 exported reader verdict types from `verify/lib/**` into `verify/contract/` | **OPEN — #1988**, and the row sits at **Needs owner while this document already picked the arm** (the code edit, not a population edit), twice. The count ratcheting 15 → 18 → 19 is an unexecuted item, not an undecided one. What is genuinely owner scope is only *now vs at the Phase F cutover* |
| 1b | give `origin-verdict.test.ts`'s Project-building rows the house `scaledBudget` | **OPEN — folded into #1985** as a second instance. Measured: **3** Projects built, **zero** budget lines, on vitest's bare 5000 ms default, while **11** specs in the same directory already use `scaledBudget`. A missed site in an established idiom |
| 2a | the barrel-re-exported-import refusal, as a NARROWER condition | **IN FLIGHT — #2009**, lane `p-rawid-door`, arm A |
| 2b | the `QualifiedName` normalizer | **OPEN — #2015 (filed by this sweep).** Measured: the only `Node.isQualifiedName` under `verify/lib/` is `browser-contract-reader.ts:435`, a single-consumer DOM-world reader; no origin reader handles the shape. It is **#2009's defect one syntactic space over** — value-space door vs type-space reference — so it is the WARM LEG for that lane, never a fresh spawn |
| 2c | the DOM-global receiver precision | **UNADJUDICATED, and the STALENESS RULE bites hardest here.** The claim ("the DOM-less program leaves `window`/`self`/bare DOM globals fail-closed rather than precise") predates #1351's browser-world work. Two tree facts pull against it: `lib/reference-fact-global.ts:19` names `globalThis`/`self`/`window` explicitly, and guide §4.1 records a MEASURED case where a bare `localStorage` resolves as the ambient global with an empty member path and takes the **PRECISE** message. **Owes a probe, not an assertion** |
| 2d | remeasure the composed pass idle as the cutover cost row | Phase F work; the guide's §7 retirement list already carries it |
| 3 | static-class parity, then the class/style family | LARGELY LANDED — the raw-CSS family, ui-token-surface (3) and both tier-home twins converted; guide §6 carries the receipts |
| 4 | the conversion bulk, 12–15 per lane | **IS Phase D.** This is the spine |
| 5 | the atomic loader/CLI/report/scaffold cutover | **IS Phase F**, and its own framing is superseded — mixed runtime replaced atomic cutover (guide §1) |

**The rule this sweep is an instance of:** a resume order, a deferred roster and a recorded refusal are the
same shape — a list written against a tree that then moved, with nothing two-sided holding it. Each has now
cost this program a rediscovery (item 2a here, 5 silently-stale rows in #2008, `runner-config-path-liveness`
in #2013). **When you inherit a list, sweep it per row before you work from it.**

### ~~#2006 — five gates accuse correct code~~ **CLOSED `ae2e935d3`, and the PRICE was wrong, not the finding**

**Re-priced P1 → P2 by the one measurement nobody had taken: the real-tree instance count is ZERO on all six.**
Read as RAW (`violations + waived + granted` off each policy record in `reports/check-structure.json`) — NOT as
`violations.length`, which is post-waiver and reads as a clean zero over a fully waived population. Raw 0 is
decisive: an unresolved-not-a-subject hit in those populations *would be* a finding, so there are none. It was a
latent COPY-SHAPED trap, not live accusations — which is still worth fixing before the shape is copied 104 times,
and is not worth outranking a backlog. **The lesson is the ordering: measure the instance count BEFORE you price
the row.** Fix landed as one line per module plus a local-object `mustPass` each; all five roster rows rewritten
as mechanisms (they named COORDINATES — "no `Principal` import" — which each module's own home-counterfactual
falsifies). The two extras were checked and correctly left alone: `untrusted-regex-safe-exec` is the ACQUITTING
polarity (guide §4.6 shape 3) and `empty-state-has-action` already calls the decision.

The mechanism below is now guide §4.6 law (the three shapes of sealed-origin reading). Kept here for the receipt.

Five modules compare `readSealedOrigin(…).kind !== "foreign"` instead of calling `sealedOriginReports(verdict,
anchor)`, which **skips `classifyOriginRefusal`**, so a purely local object whose KEY is spelled like the sealed
export is REPORTED. On **unmodified source**, no cut applied:

```ts
const bag = { ownerStats: 1 };
export const n = bag.ownerStats;   // accused
```

`discovery-no-stats-rollups` · `membership-enforcer` · `providers-runner-seal` · `turn-identity` · `vector-scope-derived`.

**Why it outranks the backlog:** every other open row is a gate that FAILS TO CATCH, or a claim that is unproven.
**This is a gate accusing valid code**, which is the failure that kills a gate fastest — the author waives it, and a
waived gate is dead.

**WHAT TO DO, in this order:**

1. **Measure the real-tree instance count FIRST.** The audit floor proves nothing is withheld, **not** that the false
   positive has live instances. That number decides urgent-vs-merely-wrong and nobody has it.
2. **Check `untrusted-regex-safe-exec`** — wave 9 flagged the same shape and left it unmeasured. Its roster row
   (`Core-Enforcement-Active-Gates.md:78`) is one of the two that STATE the correct semantics, so if it has the bug
   its row is a documented false claim about a security-adjacent gate.
3. **Check `empty-state-has-action`** (`:157`, same claim, not in wave 9's set) — either a sixth instance or a second
   reference shape.
4. **Fix is one line** and proven: `sealedOriginReports(…)` took `discovery` 1 failure → 0 **while its unreadable-door
   `mustFlag[4]` still flags**. Each fixed module also gets the local-object `mustPass` row that currently reds.
5. **Re-check each fixed module's ROSTER ROW** — they are false for any affected module.

**THE CONTRACT WAS NEVER UNCLEAR, which is the lesson.** `lib/sealed-origin.ts:41-52` ships the decision function
beside the verdict function *and documents the difference*; two roster rows state the intended semantics verbatim
(*"a same-named local helper is not"*). **Nothing enforces calling the decision rather than the verdict**, and the
wrong shape READS correct. Only a local-object counterfactual reveals it, and no module carried one until wave 9
built it. The correct shape already existed in a sibling — `test-fixture-imports`, carrying the receipt *"89
confident false positives, nearly all `RegExp.prototype.test`."*

**Reference shapes to copy:** `test-fixture-imports` (proven), plus `turn-identity` once fixed — wave 9 names it the
COPY candidate after this one-line repair.

### #2000 — OLD-GATE vs NEW-GATE PARITY. P1, census DONE, and it is a different question from everything else here

**Every other check asks whether a converted gate is internally SOUND. This asks whether conversion silently changed
what it CATCHES** — a narrowed population, a retired arm with no successor, a stronger reader that no longer matches
an old shape. Such a module passes every other check. **The conformance stage is structurally blind to it**, because
a proof row rewritten after conversion only proves the new code agrees with itself. Already happened at the worst
scale: `caught-failure-ownership`, 336 files, shipped with no differential (#1970).

**CENSUS COMPLETE, all 171 final policies** (script `<scratchpad>/parity-census.sh`, lists in `parity-A/B/C.txt`):

| bucket | count | |
| - | -: | - |
| **A** committed differential test | **15** | evidence |
| **B** commit message claims one | **30** | an ASSERTION, not a receipt — names no result, nothing re-runs it |
| **C** nothing | **126** | **74% of the corpus** |

**RE-SCOPED 2026-09-12 BY A FULL READ OF THE SEVEN RECORDS: \~13 modules genuinely need a built differential, not
126 and not 46.** Method grading decided it — only 2 of 7 records used the fixture-level method that can reach catch
parity; 57 of the 90 named policies had an informative comparison, 33 were vacuous.

**RULED — 31 modules DOWNGRADE by one recorded ruling rather than 31 lanes:** *a conversion whose legacy side was
zero because every live site sat inside a `scanRoot` SUBTRACTION has proven outcome parity and real-tree liveness,
and cannot prove catch parity from the corpus.* Writing that down is cheaper than 31 replays, and it is the same
argument already accepted for the one-to-one ports.

**REMOVE entirely (26 + 2):** all 14 `mechanical-gates` and all 12 `origin-client` modules carry §4.6-compliant
fixture-level evidence · `no-raw-zustand-persist` (bucket A via `simple-visitors-wave-4.test.ts`) ·
`asset-refs-fk-coverage` (retired, and carries the best differential on the tree).

**THE GENUINELY EMPTY, re-ranked — this is the work:**

- **TIER 2a — 4 SPLIT ARMS, do first.** `no-rejected-cors-proxy` · `persisted-store-registry` ·
  `no-mutating-register-api` · `no-inline-domain-interface`. Same shape as the eight `-health` siblings already
  closed: split in two, corpus replay 0/0, **no per-example coverage statement anywhere on the tree** (verified, not
  assumed). **`no-rejected-cors-proxy` is also #1987 — route them together.** Successor proofs must be CONSTRUCTED
  from each arm's own triggers.
- **TIER 2b — 2 schema-fact narrowings, the exact class §4.6 exists for.** `contract-banned-shapes` (a deliberate
  **7,138 → 105** population narrowing receipted by an ast-grep uniqueness argument, NOT a finding replay) and
  `nullable-column-inequality` (semantics deliberately strengthened, **live verdict changed**, no old/new numbers).
- **TIER 2c — schema-fact's remaining 7.** One lane covers all of them: they share `drizzleSchemaFact` and four are
  relational-integrity policies over a 30-file population, so the replays are cheap.
- **TIER 3 — 17 one-to-one ports at 0/0, close BY RULE with the ports.** **Two exceptions that must NOT be closed:**
  `turn-identity` (wave 9's copy candidate, *after* a repair) and `plugin-dump-guard` (#1986, two unpinned arms in a
  HARD security-adjacent policy).

**DO NOT WORK 126. It is ranked, and the order is the whole point:**

- **TIER 1 — eight split arms, ONE LANE, do this first:** `bus-fact-health` · `contract-derives-not-respells-health` ·
  `ct-poll-schedule-and-paint-health` · `external-id-single-writer-health` · `injected-op-caller-param-health` ·
  `serde-core-seal-health` · `spacing-tier-home-health` · `typography-tier-home-health`.
  **A `-health` sibling exists BECAUSE one legacy module was split into two policies** with different authority or
  execution, so the legacy gate's behaviour must now be reproduced by **two policies together and nothing checks the
  union.** §4.6 requires a successor proof for a retired or merged arm; none of the eight has one.
- **TIER 2 — 54** whose conversion commit says split/retire/merge/narrow: the whole `bus-*` family, the four
  `owner-scoped-*`/`ownerid-registry` tenancy modules, both raw-CSS pairs, `serde-core-seal`,
  `contract-banned-shapes`, `schema-banned-shapes`, and `caught-failure-ownership` itself.
- **TIER 3 — \~64** one-to-one ports of pure-syntax visitors. Near-zero risk. **This tier may reasonably be closed BY
  RULE rather than by work** — a recorded judgement that a one-to-one port of a pure-syntax visitor needs no replay.
  That is defensible and nobody has written it down; writing it down is cheaper than 64 replays.

**DELIVERABLE 3 IS LANDED (`2084c403e`).** §4.6 no longer permits the evidence to vanish: a conversion either lands
the differential as a committed test **or** states in its commit message that it ran and WHAT IT FOUND, and §8.8's
floor names it. **Silence is not compliance.** So the 126 is a closed backlog, not a growing one — Phase D's 104
cannot add to it.

### DEFECT CLASSES THAT PROPAGATE — each looks green and is not; each multiplies by \~104

| row | class |
| -: | - |
| **#1968** | 64 of 825 expectation rows carry no `count`; tautological `messageIncludes`. **The enforcer now lists them.** |
| **#1990** | a fail-closed `unreadable` arm with no `messageIncludes` is invisible to count-only rows — **9 of 12 modules shipped it dead** |
| **#1979** | silent not-ready resource return — 6 sites remain; a broken resource reads as a clean green |
| **#1978** | 51 of 88 ordinary policies' `fix` names no waiver spelling, so the author it fires on cannot waive it |
| **#1976** | nothing checks a provider's population is a SUBSET of its consumers' |
| **#1982** | nothing distinguishes an honest constant receipt `members` from a lazy one (**Needs owner**) |
| **#1984** | a finding inside a multi-line template literal is UNWAIVABLE by any line-adjacent grammar (**Needs owner**) |

### AUDIT FIX BACKLOG — by wave, with the falsifiers already built

**Split fix lanes by MODULE, never by defect.** Wave 1's own follow-up was split by DEFECT and four modules fell
between the lanes — that is #1993, and it went unnoticed for a day.

| row | what |
| -: | - |
| **#1993** | wave 1's unfinished fix pass: `schema-branding`, both tier-health twins, `no-array-literal-querykey` |
| **#1989** | wave 6's three LIVE escapes — subjects UNREACHED, not merely unproven |
| **#1987** | `no-rejected-cors-proxy`: 0 of 2 narrowings enforced |
| **#1986** | `plugin-dump-guard`: two unpinned arms in a HARD, security-adjacent policy |
| **#1991** | `no-color-literals` one message for three disjoint patterns — **RULED arm A, split it** |
| **#1994** | nine converted modules have NO family test, so §4.2/4.3/4.5/4.6 pins have nowhere to live |

### THE REMAINING FIX BACKLOG — what is left, and what each one needs

| row | what to do |
| -: | - |
| ~~#1979~~ | **CLOSED `2bacd5ef9`** — five sites converted; **10 of 10 `analysis: "resource"` modules now read through `readyResourceValue`** (16 call sites, ast-grep over 171 final modules). The only surviving `status !== "ready"` in `gates/` is `bus-fact-health.ts:25`, the FACT-family accuser — not a resource policy, not a #1979 site, and it must not be "fixed". Left struck rather than deleted because this row read "six sites remain" for a day after it closed. Original text: **Re-derive the lines first** — main moved a lot. Shared reader is `readyResourceValue`; `server-layout` is the worked example including the header paragraph explaining why it owns no not-ready branch |
| ~~#1999~~ | **CLOSED** `153561cef` — 15 rows (not 25; see the decay rule). Two shared `lib/react-origin.ts` fences pinned ONCE with a header note that the proof covers `no-use-context` too. `no-context-returntype`'s two remaining cuts DOCUMENTED as mutually-redundant/unfalsifiable rather than faked |
| ~~#1999-residual~~ | Two things the lane declined to invent, recorded rather than dropped: a third `no-multiplexed-mutation-error` narrowing, and a second independently-discriminating cut inside `fetch-fn-in-features`' `fetchCandidate`. **Both are “not worth faking” calls, not gaps** |
| ~~#1999-old~~ | origin-client's 25 narrowings. **Wave 6's figure PREDATES three of §4.1's four rules — re-classify before building; some cells will dissolve.** Start with the two shared `lib/react-origin.ts` fences (one cost a measured 439 false findings per policy and is pinned by nothing but a comment) |
| **#2003** | `content-part-seam`'s member arm is STRUCTURALLY dead — it visits value-position nodes for an `export type`. Match the visitor kinds to the subject's space **or** remove the arm. **Do NOT fake a fixture that makes a type look like a value.** Its two siblings carry the identical tuple and theirs IS live |
| **#1998** | `no-raw-matchmedia`'s header and roster row say "all four" grants; there are **five**, and the fifth refutes the header's stated reason. **Blocks the reviewed-grant copy candidate** |
| **#1978** | 48 of 88 ordinary `fix` strings name no waiver spelling. **Fix by naming the actual id and position shape, never by loosening the predicate** — a literal `<id>` placeholder is correctly flagged |
| **#1986** | `plugin-dump-guard`: two unpinned arms in a HARD, security-adjacent policy. Falsifiers already built |
| **#2005** | the header gap. **Census corrected: the real target is the legacy SHA (9/171), not the whole header.** All nine carriers are registry/completeness modules — copy their shape |
| **#1994** | nine modules had no family test; eight landed at `e64c274ef`. **Re-derive what remains** |

### INSTRUMENT AND OBSERVATION GAPS — why defects survive

| row | what |
| -: | - |
| **#1983** | a `tests/tooling` suite can sit red for days unseen. **FOUR instances in one five-day window.** The predicate is *any assertion whose expected value derives from the legacy roster* — not just membership |
| **#1967 / #1973 / #1964** | `tests/tooling` is `--full`-only and nothing runs `--full` on a cadence; the §8.8 real-tree floor costs 4 min / 6.5 GB so no lane runs it. **These are the ROOT CAUSE of #1983, not peers of it** |
| **#1992** | `policy-soundness` is 57.7 s of `check:structure` — re-priced as a **#1964 dependency**, NOT a commit-bar regression (the conformance stage did not move: 12341ms → 12283ms) |
| **#1985** | `grant-liveness-family.test.ts` runs within \~300 ms of its own 5000 ms timeout; fails on cache temperature |
| **#1980** | `@authored` is a hand-typed literal with no liveness gate |
| **#2005** | the §5b.5 header gap — **CENSUS CORRECTED by 171 full reads**: FAMILY \~61/171, POPULATION PORT **59/171**, **legacy SHA 9/171**. Waves 8 and 9 reported “fails 25 of 25” / “0 of 14” because they counted the PHRASE; most headers state the port in PROSE. **The legacy-SHA number is the load-bearing one and it survived all three methods** |
| **#1988** | `no-inline-types` reds 19 sites, 18 of them the shared readers this program MANDATES — 15→18→19, unowned (**Needs owner**) |

### THE METHOD CHANGED FOUR TIMES TODAY — an audit doc older than these rules is an UPPER BOUND, not a verdict

Every rule below is in guide §4.1 and each was paid for by a wrong number. **Re-cut any cell before building a row
from it.**

| rule | what it invalidates |
| - | - |
| **Cut DIRECTION** | a cut must make the policy flag MORE; substituting a different wrong value is a different policy. Wave 5 made this error; a fix lane caught it |
| **Declared PERF PREFILTER** | a candidate-name prefilter in front of an identity reader cuts clean BY DESIGN — cut the discriminating half. **71% of wave 7's over-report** |
| **A LATER WAVE SUPERSEDES** an earlier cut table | two waves disagreed; the later was right because no discriminating fixture could EXIST. Paid on #1993 |
| **A REVIEW'S COUNT DECAYS when ANOTHER LANE LANDS** | wave 6 reported 25; a lane closing #1989/#1990 had already fixed D1 (9 modules), D2 and all of D5 — **15 were genuinely open**. The tree changed, not the classification. **Never dispatch with a review's row count as scope without calling it an upper bound.** Paid on #1999 |
| **Reusable UNREADABLE falsifier** | `declare function opaque(): any; opaque().<member>` drives every origin resolver into the fail-closed arm — stop reverse-engineering one per module. Exception: a TYPE-space symbol needs a VALUE-position reference |
| **A split's differential owes a COVERAGE statement** | 4 of 8 split arms had ZERO legacy coverage, so replay proves nothing there. State it PER EXAMPLE, construct the successor proof from the arm's own triggers |

**Consequence for the numbers:** waves 4–6 reported 32% / 35% / 42% NAIVE and were never corrected. Waves 7–9
classified: 20% / 24% / 32%. **Never compare a naive figure to a classified one.**

### AND THE MEASUREMENT LESSON, because it cost three wrong numbers in one day

**A grep LOCATES a candidate; reading DECIDES it.** Measured on this corpus: a `fix`-spelling census by grep would
call **45 of 48** non-compliant modules compliant; a §5b.5 census by grep undercounted POPULATION PORT by **269%**;
and a hash grep overstates legacy-SHA carriers by **78%** (six distinct lookalikes: incident commits, ruling
cross-cites, sweep commits, and the CONVERSION commit itself).

**AND THE MIRROR-IMAGE FAILURE — a naive SHA-SHAPE instrument UNDER-reports by eating the rev-spec (measured 2026-09-13).** A §5b.5 sweep flagged `section-registry-completeness` as carrying no legacy SHA. It carries one, spelled `(dd862e988^)` — and `dd862e988^` really is the legacy `GateDescriptor` holding the claimed predicate. The regex ate the caret. **So a legacy-SHA census owes BOTH halves stated: the shape is `[0-9a-f]{7,40}` optionally followed by `^`, `^N` or `~N`, and the result still owes a planted positive control.** Word-match OVER-reports this field by 78%; bare shape-match UNDER-reports it by dropping rev-specs. **Neither method is safe alone, which is exactly why this is the field the rule above says to narrow BY HAND** — and why the lane that hit it reported an instrument defect rather than filing a module defect that did not exist.

**The tell:** in the same report, the one number narrowed BY HAND was exactly right and both derived by pattern were
wrong. **Do not accept "grep-derived, spot-verified" as an answer** — divvy the files across lanes and require full
reads, with "I read 47 of 57, here are the 10 I did not" as the honest form.

### DECISIONS IN NEEDS OWNER — ask, never build around

**#1982** receipt contract · **#1984** template-literal unwaivability · **#1988** the `no-inline-types` ratchet ·
**#1995** `contract-verb-presence`'s fork, whose stated default held BY SILENCE while the gate sits on the Phase D list.

### LOWER PRIORITY, RECORDED SO IT IS NOT RE-DISCOVERED

**#1957** unwaivable finding classes · **#1970** the largest conversion shipped with no §4.6 differential ·
**#1977** conformance has no “must refuse” arm · **#1981** a roster row declares an arm A4 that does not exist ·
**#1965** deferred work anchored to doc coordinates, not `workItem`s · **#1922** sanctioned-home → grants (**its census
base is 2026-09-05; every conversion since can have carried a table it never saw — re-derive, never work the 97/319**) ·
**#1996** no doc-catalog re-attest helper, so every re-attest is hand-edited JSON across nine receipt files.

### THE COPY SET — the most actionable output the audit produces

**Point a Phase D lane at these and at nothing else — BUT read the §5b.5 column first (census 2026-09-11, #2005).**
**Four of the six carry an INCOMPLETE header**, so a lane told to copy one copies a header that fails the bar. Where
the column says NO, tell the lane to copy the module's PROOF shape and take its header from
`section-registry-completeness`, which is complete.

**Point a Phase D lane at these and at nothing else:**

| module | plane | caveat |
| - | - | - |
| `user-bus-deferred-member` | warning debt | wave 1's sole survivor — **but §5b.5: FAILS ALL THREE** (no FAMILY line, no POPULATION PORT, no legacy SHA). The longest-standing copy candidate has the weakest header in the set |
| `section-registry-completeness` | registry | 4/4 narrowings enforced · **§5b.5 COMPLETE — the header to copy** (FAMILY + byte-identical POPULATION PORT citing `dd862e988^` + legacy SHA) |
| **`no-mutating-register-api`** | **ORDINARY** | its `mustPass[3]` `why` says *“the only row that dies without it”* and the audit proved that sentence TRUE · §5b.5: has a POPULATION PORT (intentional correction, stated), **no FAMILY line, no legacy SHA** |
| `no-raw-interactive-intrinsics` (reviewed-grant) · `zustand-selector-stability` (**ORDINARY**, `:110` — this cell labelled BOTH reviewed-grant and was wrong about the second; guide §3's reviewed-grant exemplar is `no-raw-matchmedia`, not either of these) | mixed | fix `zustand`'s J4/J5 first · §5b.5: `no-raw-interactive-intrinsics` **fails all three**; `zustand` has a real singleton rationale but **no POPULATION PORT and no legacy SHA** |
| **`no-raw-matchmedia`** | **reviewed-grant** | wave 1 refuted it SEVERE, it was repaired (`b157bb9be`), and wave 7 re-audited and **confirmed the repair HELD**. The only module in 26 audited (waves 6–7) whose #944 third answer is actually REACHED. **Fix #1998 first** — its header and roster row both say “all four” grants and there are five |
| `spacing-tier-home-health` | HARD tripwire only | owes one §4.5 pin |

**Wave 10 adds one of each.** COPY: **`bus-definition-belts`** (bus plane; the bus headers are among the
corpus's best). ANTI-pattern: **`no-raw-id`** — a private zod reader sitting BESIDE the shared one its own
family sibling uses, blind to a one-hop re-export door (#2009).

**ANTI-PATTERNS — never point a lane at these:** `no-raw-id` (#2009) · `no-raw-spacing-in-features`'s HEADER · `no-manual-token-estimate` ·
`no-inline-types` · `zod-modern-spellings` · `persistence-boundary` · `no-rejected-cors-proxy` (**these four were REPAIRED at `8ad418868` — re-derive before trusting this line**) · `no-effect-on-shared-selection` (it writes `=== "home"` against a THREE-answer reader, converting the third answer back into silence, unpinned in both directions).

### OWED TO THE ORCHESTRATOR AT A QUIET BARRIER — no lane may run these

`gate-ignore-grammar.repo.int.test.ts` and `gate-conformance.repo.int.test.ts` (both plant `__g_` fixtures, not
concurrency-safe with themselves) · **`check-gates.repo.int.test.ts`** (same reason — baseline-red and not
concurrency-safe with itself; the `p-stale-refusals` lane edited its `UNFIXTURABLE_GATES` row at `8d8c06881` and
declared the run OWED rather than skipping it silently, which is the honest form) · the `check:structure` AFTER
census · the `ledgers:fresh` regen for two `caught-failure-ownership` rows · `gate-spelling-twins.int.test.ts`
(54 of 79 ledger rows orphaned) · the `docs/reviews/gate-runtime/` doc-catalog pass (\~10 wave docs un-attested;
`doc-catalog:sync` was deliberately reverted on 2026-09-12 — it would have attested documents nobody read).

**Phase C — settle the capability set before spending it. Forge. A design pass, not an executor lane.**

**MEASURED 2026-09-11, and it shrinks this phase a lot: C gates only the RESOURCE-BACKED families, not the corpus.**
Structural census over all 105 legacy modules (does the module import `node:fs`, reference `node_modules`, or import
one of the 21 `lib/` readers that touch fs — the one-hop trace guide §8.2 requires):

| Legacy modules | Count | What they need from #1930 |
| - | -: | - |
| no filesystem at all — pure AST, no fs, no fs-touching `lib/` hop | **59** | **NOTHING. Convertible today against the shipped contract.** |
| reach fs through exactly TWO shared readers | 7 | `baseui-read` (6: the `baseui-*` set plus `surface-a11y-focus`, `surface-in-a-container`) and the css-family census (`css-family-ownership`). Candidates for `defineFact` PROVIDERS over existing kinds, not new kinds |
| direct fs read in the module | 36 | unknown — see the warning below |
| reference `node_modules` | 11 | the one genuinely open capability question (traversal declarable at all?) |

**So the 59 are blocked on lane time, nothing else.** Guide §7's dependency law says only that no gate converts on a
resource kind *before that kind lands*; a module needing no kind has no such dependency, and Phase D's own first
bucket is exactly this set. Run them in PARALLEL with the C design pass rather than behind it.

**The 36 need a READING lane, not a script.** Three mechanical attempts to classify their read targets each returned a
false clean: extensions matched in header comments, then again inside `message`/`fix` STRING LITERALS (nearly every
gate cites a `.md` law doc in its message, so `.md` scored 36/36 three times running). What a module READS is only
visible by reading the call, which is why `gate:contract`'s simple tier was never the oracle. Do not quote a
read-target census that a grep produced.

### Step 1 COMPLETE — all 36 read in full, 2026-09-11. #1930 is wrong in BOTH directions.

Three scouts read all 36 in full plus their one `lib/` hop; every claim below was re-verified against the contract by
the orchestrator, because one scout asserted a false clean at high confidence (`ui-variant-axes-stamped` "has no
filesystem read" — it imports `existsSync` at :22 and calls it at :109). **Verify every scouted negative.**

| Bucket | Modules | Verdict |
| - | -: | - |
| servable by an authored-tree id that ALREADY EXISTS | 6+ | `tooling-slot-template`, `ui-primitive-structure`, `tooling-instrument-proof`, `test-layout`, `gate-ignore-inventory`, `db-structure`. Zero new capability — unconverted, not blocked |
| DATA entries in existing enums | 3 | `docs` and `scripts` ids absent from `AUTHORED_TREE_PATHS` (12 ids, `resource-tree.ts:4-17`); `biome` and `typescript` absent from `CONFIG_SNAPSHOT_RUNNERS` |
| ONE new declarable kind — arbitrary tracked-file TEXT | \~10 | **Already built and private.** `ResourceHost.ordinaryWaiverCarriers(paths)` (`contract/resource-host.ts:30-33`) is exactly it: comment-aware, demand-driven text snapshots of exact demanded paths, sourced from declared doors. No shipped kind returns text for an arbitrary path — `ResourceTreeEntry` is metadata only (`resource.ts:24-31`), `TrackedResourceIndex` is `{ repoPaths }` (`:51-53`), `STATIC_CONFIG_RESOURCE_PATHS` is closed at five (`resource-config.ts:19-25`). Exposing this one door covers the ledgers, the docs corpus, the test mirrors and the manifests |
| a shared `defineFact`, NOT a kind | 4 | `integer-line-boxes`, `motion-token-purity`, `rest-transform-grid`, `over-art-plate-arm` each re-implement the SAME recursive `.css` walk over `packages/{ui,client}/src`. One census fact over `authored-css` absorbs all four |
| **genuinely open — and it is THREE shapes, not one** | 3 | `baseui-surface-manifest` wants a parsed `.d.ts` AST tree of one named dependency at unbounded depth (`packages/ui/node_modules/@base-ui/react`); `devtools-frontend-assets` wants installed-package METADATA FIELDS from two others (`@playwright/test`, `playwright-core/browsers.json`); `no-manual-memo` wants a raw SUBSTRING search in one bundled dist file (`babel-plugin-react-compiler/dist/index.js`). Different return shapes — **do not collapse them into one `node_modules` kind** |
| genuine outliers | 2 | `devtools-frontend-assets`'s hash-pinned binary/license asset closure resembles no shipped kind; `tooling-shared-plumbing` wants pattern-based root discovery (`playwright*.config.ts`) plus raw AST from a config whose kinds expose only selectors and key/value rows |

**Two corrections to #1930 that follow directly.** It claims config/compiler liveness is blocked: `eslint-grant-liveness`,
`depcruise-grant-liveness` and `runner-config-path-liveness` converted without it, and `biome-grant-liveness` +
`tsconfig-entry-liveness` want the same proven shape — a `native-config` RUNNER evaluating through the tool's own
loader, not a new kind and not the hand-parsed JSON those two do today. The symlink blocker IS in the contract:
`ResourceFileSnapshot`'s `symlink` variant is internal and never reaches a policy, which
`runner-config-path-liveness.ts:23-39` states from a measured refusal. That module is a legacy `GateDescriptor`
(`:306`) that refused conversion citing #1930 — NOT a converted precedent; do not cite it as one.

**So step 2's decision is much smaller than #1930 frames it:** three enum entries, one door to expose, one census fact,
and one real design question — how to declare a read into an installed dependency when three consumers want three
different return shapes. That last one is the only place a genuinely new capability is owed.

Standing principle this serves (owner, 2026-09-11, general — not a mandate for any particular structure): *do not take
the easy or short way just because the right way is more work.* The analysis below is the orchestrator's, and the
implementation shape is open; what is NOT open is deriving the requirement from whoever happened to trip over it.

**Why #1930 as written is not the shape.** It names seven capabilities derived from ELEVEN gates that three lanes
happened to trip over, against a legacy set of over a hundred. Implement those seven and the next gate trips over an
eighth, and every capability added costs a mandatory pass over the policing surfaces — `policy-conformance.ts`'s
fixture runner, `gate-modernization`, and `policy-validation.ts`.

**IT IS FOUR, and the owner said four all along (2026-09-11 evening, corrected TWICE).** The original text said four.
An orchestrator "corrected" it to THREE by refuting `enforcement-registry-parity` (rightly — it has zero `resource`
references and reads only the roster), then "corrected" it to FIVE from `git show --name-only` FILE LISTS. **A file
appearing in a capability commit is not evidence that its hunk was capability work.** The `p-capability-freeze` lane
read the hunks and refuted it: `gates/gate-modernization.ts` contains ZERO references to "resource", and its hunk in
the json/`installed-package` commit was ARM E — the `analysis`-token honesty arm (#1958) — plus a `Registration` type
change, unrelated to the resource vocabulary. Independently corroborated by `contract/resource-installed.ts`'s own
header, which says "the four policing surfaces".

**The measured cost of one new kind:**

| Surface | When |
| - | - |
| `contract/resource-declaration.ts` | always |
| `contract/resource-host.ts` | always |
| `lib/resource-policy.ts` | always |
| `lib/policy-validation.ts` | always |
| two NEW files (`contract/` + `ops/resource-<family>.ts`) | always |
| `ops/policy-conformance.ts` | ONLY when the fixture substrate cannot express the subject (`authored-path` needed `symlinkSync`) |

**The number matters because
it is the whole cost argument for settling the set before building it** — at four mandatory surfaces plus two new files per capability, adding kinds
one at a time is five edits each, and the §5b soundness enforcer (#1971) cannot target a vocabulary that is still
moving. Freeze first, then enforce. The churn is real either way:
`gate-modernization`'s arm A had to be widened the day 163 modules became `defineGate` calls, because the policer broke
when the thing it polices moved.

**And "leave them legacy" is not the answer either.** Mixed runtime makes a legacy module tolerable INDEFINITELY, but
legacy means a private reader, a gate-owned exemption table and a direct walk — the exact rot the closed contract
exists to eliminate. Tolerating it forever is the skimp that produced this program.

**What that rules out, and what it leaves open.** Ruled out: deriving the capability set from the eleven gates three
lanes tripped over, and adding kinds one gate at a time. Left open, deliberately: whether the implementation lands as
one pass or as batches. Batching is fine if the SET is settled first — what costs is an unsettled set, not a staged
build. Steps 1 and 2 are the part that must happen before any code:

1. **Derive the capability requirement across ALL remaining legacy modules**, not the eleven already tripped over.
   Inputs: the 53-row resource manifest in `resource-gate-access-patterns.md`, the per-gate blocker tables in
   `uncovered-gate-conversion-census.md` (counts stale, engineering durable), and a fresh read of every legacy
   module's actual reads. `gate:contract`'s simple tier is BLIND here by construction — it shape-matches the
   descriptor literal and cannot see what a gate READS, so "simple by gate:contract" is never "convertible."
2. **Rule the final closed set in one decision**, answering #1930's three open questions for the whole population:
   resource kind versus `defineFact` provider per capability; whether `node_modules` traversal becomes declarable at
   all; whether the population algebra gains one reviewed directory-tier operator (which would shrink path-liveness
   and #1922 together). A capability serving ONE gate is that gate's private reader wearing a contract's clothes —
   either it generalises or that gate's shape is wrong.
3. **Build against the settled set**, batched or in one pass as the design decides, including the fixture-runtime work
   the kinds need — `runResourceExample` only writes files and cannot express a symlink, which path-liveness proofs
   require. Batch the policing-layer update with it rather than per capability.
4. **Then the contract is FROZEN** and conversions proceed against a set that no longer moves.

Sequencing note: two of the five gates path-liveness was supposed to unblock (`depcruise-grant-liveness`,
`eslint-grant-liveness`) are ALREADY converted without it, so the row's own blocked-count needs re-deriving as part
of step 1 rather than trusted.

**PHASE D's SHAPE CHANGED ON 2026-09-12 AND THE NEXT SESSION SHOULD NOT PLAN IT AS CONVERSION THROUGHPUT.**
Twenty-four modules converted that night, taking the corpus from **190 final / 88 legacy to 237 / 60**, and
**all thirteen §12.6 mixed-hook modules are done** (`tooling-shared-plumbing` became ten policies). What is
left is a different kind of work:

**Of the 60 remaining legacy modules, only TWO are `O`** — `appearance-carrier-contract` and
`firehose-import-allowlist`. **The other 58 are `X`**: each carries a gate-local table, sanction, deferred
row, stale arm or custom marker that needs a CENTRAL HOME before it can convert. So the spine is no longer
"pick a family and convert it" — **it is AUTHORITY MIGRATION (#1922), read per row from
`exception-authority-census.md`**, which has already classified 97 tables, 319 rows, 25 sanctioned-home
tables, 9 baselines and 11 duplicate grammars. Point a lane at the CENSUS ROW, never at a family.

**Two measured warnings for whoever plans that work.** A grant row minted for a subject that produces no
finding is **stale on arrival and reds** — that killed one row mid-flight on 2026-09-12 (`surface-in-a-container`,
where a sibling rule acquitted before the exemption was ever consulted). And **a ruled disposition is a claim
about the tree**: two of §12.6's own arities were wrong when finally checked, both because an exemption table
had drained to `{}` since the ruling. **Verify the table is non-empty before designing a policy around it.**

**Phase D — conversions, cap 3 minus the running prerequisite lane.** Pick families from the legacy roster (re-derived
in §0.5) in this order: direct-walking visitors and file hooks whose reader already exists → run-only evaluators on an
existing provider → resource families as their kind lands. One family per lane (4–8 modules), family named by its
`lib/` reader or declared singleton, markers translated in-commit, guide §8 procedure, guide §4 proofs. Merge, floor
on `main`, `#1584` comment, one Opus verifier per wave, refute or confirm.

**Phase E — after the bulk converts.** The 13 mixed-hook splits (forge, one lane); #1922 gate-owned tables → central
grants; the nine baseline ledgers → fixes, exact grants or `workItem` warnings; decisions #1939 and #1921 need owner
words before their gates convert.

**Phase F — legacy deletion** when `gate:contract` shows zero legacy modules: the checklist in
`docs/reviews/gate-runtime/ordinary-waiver-source-migration.md` §"Atomic cutover checklist" is the deletion list;
rewrite `GATE-AUTHORING.md`, `gate:new`, `gate-modernization` against `defineGate`; re-enable the lefthook hooks;
idle composed-pass remeasurement; catalog re-attest.

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
4. The exact module list with the pre-conversion SHA; the family hypothesis (a hypothesis until the lane names the
   reader); **the escalation model below — ASK vs REFUSE, and it is not one rule**; markers translated in-commit with the
   census recorded.
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
3. Run the lane's named floor on `main`; `pnpm gate:contract` for the delta; regenerate `docs/test-baseline/manifest.json`
   on quiet `main` if a spec was added (`pnpm exec node tooling/src/verify/cli.ts baseline test-baseline-manifest`,
   commit it alone).
4. Docs the lane added or rewrote: `pnpm format:docs` then `pnpm check:docs` (both exit 0), then `pnpm doc-catalog:write`
   for a rewritten doc or `pnpm doc-catalog:sync` to adopt a NEW one. Both exit 1 on the inherited ratchet rows (31
   pending debt paths plus stale `verifiedSha256` on three documents last touched 2026-09-05/06), so judge the run by
   `git diff docs/catalog/` and NOT by its exit code: keep it only if the diff touches the rows for documents you
   actually read. Never let a regeneration attest a document you have not read. Commit the catalog alone.
5. Post the receipt on #1584 (`gh issue comment --body-file`); rows: `review` + `verify --evidence` (< \~700 chars).
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
   (`<main>/.cache/snap-stage/bands.json` records the owning checkout) it stops that \~7-process stack through snap's
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
  results and reduces a 34 MB session to \~1 MB. **Then READ it.**
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

None. Every decision this program needed has a dated ruling in the guide §11; #1939 and #1921 were ruled on 2026-09-11
(hard cardinality policy plus exact grants; no third receipt kind). A new fork goes to Needs owner with a stated
default and deadline, never built around.
