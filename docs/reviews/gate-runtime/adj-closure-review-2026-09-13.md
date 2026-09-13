---
kind: review
status: active
updated: 2026-09-13
---

# Adversarial closure review — the Codex tooling-cohort reconciliation, thirteen rows (#1584)

Lane `cb-adj-closures` (claude-b, read-only). Subject: the thirteen closure proposals in
`/tmp/codex-tooling-cohort-reconciliation.md` for #2197 #2212 #2248 #2258 #2259 #2260 #2262 #2270 #2284
\#2285 #2286 #2288 #2289. Every verdict below rests on a run this lane produced in this session; no
proposal assertion is re-quoted as its own receipt.

## 1. Base and method

- **Worktree** `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-aea6ca061299fe887`,
  branch `wt/agent-aea6ca061299fe887`, **HEAD `aec0ffb55`**, `git status --short` empty at start and at end.
- **Every commit the proposal cites is an ancestor of this HEAD.** `git log --oneline HEAD --not
  ca2e0edf4 fc4e0fa03 badc14944 05b3619c8 ee7f2a1c9 6049dcded d1b9262a6 913ac535c 725fc340c` returns the
  five docs commits `aec0ffb55 2288ade25 a8c522ee3 7bf03e12f 4f5057914`, so the tree I measured is the
  proposal's tree plus five documentation landings. The proposal's own base (`913ac535c`, ledger snapshot
  `725fc340c`) is behind me.
- **Premise note, no fork:** the proposals file was REVISED during this session and `#2238` (the row root
  had already caught overclaiming) was removed from it. My assignment never contained #2238; the file now
  matches the assignment exactly. Nothing else in the file changed.
- **Method per row:** full `gh issue view` body + every comment; the ledger rows the proposal binds to the
  closure (`docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md`, read by line); the closing
  commit(s); the current tree's load-bearing code and test IN FULL; then a run, and where the
  production-path question was open, a planted break (cp-backed, one command per call, restored,
  `git status --short` empty verified after each).
- **Runs executed** (all `pnpm test:scoped` / bounded `pnpm check:structure --check <id>`, logs in the
  session scratchpad): `artifacts.int.test.ts` ×2 · `structure.int.test.ts` ×2 · `ledger-claims.int +
  ledger-claims` ×1 · `proc.int + proc` ×1 · `mirror-index-family.test.ts` ×1 · `artifact-naming.test.ts`
  ×1 · `eslint.int.test.ts` ×1 · `check:structure --check dangling-doc-cite` ×2.
- **Probes planted and restored (five, all in this isolated worktree, none on main):**
  `tooling/src/verify/ops/structure.ts` · `tooling/src/verify/ops/ledger-claims.ts` ·
  `tooling/src/_shared/proc.ts` · `.dependency-cruiser.cjs` · `tests/tooling/_shared/artifacts.int.test.ts`.
  Each `cp`-backed and restored in its own call; `git status --short` empty after every restore and at the
  end of the session.

## 2. Per-issue verdicts

| Issue | Proposal's claim | Latest refutation's demand | Verdict | Receipt |
| - | - | - | - | - |
| #2197 | REFUTED as filed; capture defect fixed at `ca2e0edf4` | ledger 772: the stderr-capture repair shipped with no committed pin | **ACCEPT WITH CORRECTION** | neutering `withCapturedStderr` reds 2 arms (`+0 to be 1`); closure omits the owner-approved ARM B, which IS landed |
| #2212 | FIXED by `fc4e0fa03` | ledger 714: the completion control cannot detect the truncation it is sold on | **REFUTE** | `eslint-discovery.ts:67` still emits `{count: files.length, files}`; my clip probe → 5×`SyntaxError`, never the named refusal |
| #2248 | FIXED by `05b3619c8` | ledger 846 (follower rides the 50 s failsafe every run) + 847 (three false comments) | **REFUTE** | measured 53031 ms at tip = 88 % of the 60 s base budget; `:49 :169 :178` still assert `~16s` and a deleted 1.5 s sleep |
| #2258 | FIXED by `ee7f2a1c9` | ledger 754: header claims a re-export that does not exist | **ACCEPT** | 0 occurrences of the four names in `artifacts.ts` (positive control: 20 `^export`); header now states the forced direct-import contract |
| #2259 | Evidence corrected on #2242 | ledger 755: correct the figures wherever cited | **ACCEPT WITH CORRECTION** | the #2242 correction comment exists (357/255/407); `#1584`'s 59 comments carry `331` 0× and `6cd7b488c` 0× (control: `gate` 173×) |
| #2260 | FIXED by `ee7f2a1c9` | ledger 756: rename + repair the header | **ACCEPT** | `artifact-naming.test.ts` exists, `artifacts.test.ts` gone, header honest about WHY no gate caught it; 7/7 green |
| #2262 | FIXED by `ee7f2a1c9` | ledger 757: name the side effect or skip the prune | **ACCEPT** | `closeRunSlot(slot)` → `finishSlot`, prune is publisher-only; close arm + positive publisher control both green |
| #2270 | FIXED by `6049dcded` | ledger 787 (name the +2, fold into #2142) + 905 (exact-set pin is a false red) | **ACCEPT WITH CORRECTION** | 23/23 green, class invariant with four discriminating overlay arms; the naming half is `v-wave-12b` §2's, not `6049dcded`'s, and #2142 still reads 51 |
| #2284 | FIXED by `d1b9262a6` | ledger 829: name the ceiling and pin it with a planted >1 MiB log | **REFUTE** | cutting `GIT_LOG_BUFFER_MIB` 256 → 1 KiB (the production default) leaves **16/16 green** — the default the production call site rides is unpinned |
| #2285 | FIXED by `d1b9262a6` | ledger 833: derive the artifact row's `ok` from the two-term verdict, with a pin | **ACCEPT** | reverting `ok: g.ok` → `ok: violations.length === 0` reds exactly 1 of 9 (`expected true to be false`) |
| #2286 | FIXED by `d1b9262a6` | ledger 842: the inverted header↔body contradiction | **ACCEPT** | one `dormant` hit left, at `:907`, inside the sentence recording what the line USED to say; `git ls-files packages/client/src/state` = 88 |
| #2288 | REFUTED — root `.cjs` is an Arm-B member | ledger 844: the 27 repaired cites can rot again unseen | **ACCEPT WITH CORRECTION** | membership proven (planted `docs/…` cite → flagged `:856:41`); bare-basename twin NOT flagged, and **63 of 64** `.md` cites in that file are bare — owned by open **#1334**, which the proposal never cites |
| #2289 | FIXED by `d1b9262a6` | ledger 848: 6 of 8 CLI-child cases had no scaled budget | **ACCEPT** | all 9 cases carry a budget; `KILL_CASE_BUDGET_MS = 2×READINESS + CLEANUP + CLI` is strictly above every nested wait; 9/9 green |

### #2197 — ACCEPT WITH CORRECTION

**Latest refutation** is the 2026-09-13T01:06Z comment (lane `p-verify-seam-fixes`), which refutes the row
as filed twice, plus ledger 772 (`cb-v-wave-8a` L10) demanding a committed pin for the stderr-capture
repair. **The proposal answers the capture half and I confirm it independently.**

- `withCapturedStderr` is at `tooling/src/_shared/proc.ts:149-161`, called from both sync doors
  (`execNicedSync:176`, `execNicedSyncBuffer:190`) — the production functions, not a test seam.
- **Planted break:** `if (false && error instanceof Error && …)` in `withCapturedStderr`, then
  `pnpm test:scoped tests/tooling/_shared/proc.int.test.ts tests/tooling/_shared/proc.test.ts` →
  **2 failed / 15 passed**, both `expected +0 to be 1`: `#2211 THE DEFECT PROOF — on an ENOBUFS kill the
  diagnosis reaches the MESSAGE` and `#2272 CONTROL — the de-duplication does NOT cost the ENOBUFS
  repair`. Restored; `git status --short` empty. The pin is real and it bites on the production path.
- The suite is also honest about its own weak arms: two are labelled `#2197 FENCE (not a defect proof)`
  in the test titles, which is the correct disclosure for an arm that passes against the deleted helper.

**CORRECTION 1 — the closure comment omits the row's actual root cause and its owner-approved fix.** The
19:22Z comment on #2197 recorded `ARM B APPROVED, in the POLICY`: the child's exit 2 was
`no-loose-id-cast` refusing to mint a finding whose token starts with `(`. That fix IS on the tree —
`tooling/src/verify/gates/no-loose-id-cast.ts:30-44` unwraps a `ParenthesizedExpression` operand and
declares its limit, and `:105` is the `mustFlag` row whose `why` names the `__g_vpcr` fixture and the
barrier exit 2. A closure comment that credits only the capture half loses the row's most load-bearing
outcome.

**CORRECTION 2 — ledger row 772's own receipt does not reproduce.** It states *"`/usr/bin/grep -arln
'runCommandWithBudget' tests/` returns nothing"*. At tip that grep returns three hits
(`tests/tooling/_load-budget.ts:125` the definition, `:167` and `:172` the two exported wrappers), and the
error path IS exercised: `tests/tooling/load-budget.int.test.ts:82-86` drives
`process.stderr.write('fatal'); process.exit(2)` through `runNodeWithBudget` and asserts
`FATAL_EXIT_RE = /exit 2.*fatal/su` (`:32`) against the thrown message. The row's premise was wrong when
it was written; the proposal reaches the right disposition without noticing why.

**Not covered by me:** whether `check-gates.repo.int` is now green on a quiet box — a planting suite,
orchestrator-only and outside this lane's load fence.

### #2212 — REFUTE

**Latest refutations are three, and the proposal answers two.** Ledger 658 (premise did not reproduce in a
worktree), ledger 713 (the file DID NOT PARSE at `0e03cee19` — zero tests collected), ledger 714 (the
completion control cannot detect truncation), and primary's 2026-09-12T23:02Z comment (the measurement arm
never returned, timing out at `MEASURE_BUDGET`).

**What I confirm as FIXED** — `pnpm test:scoped tests/tooling/verify/ops/eslint.int.test.ts` → **8 passed,
exit 0, 36.19 s**:

- the file parses and collects 8 tests (713 closed);
- the measurement arm **returns in 33097 ms** and prints `[#2212] discovery payload: 445815 bytes across
  7774 files (worktree checkout)` (primary's third finding closed, and the number is recorded, not
  asserted, exactly as 658 asked);
- the planted-ceiling arm is real: `readDiscoveredPopulation(root, 8)` asserts the refusal names the
  ceiling, the site `tooling/src/verify/ops/eslint.ts`, and `NO lint verdict exists for this run`, with a
  real-ceiling counterfactual beside it (condition 2 met);
- the hazard prose is re-homed as a single shared declaration on `CaptureCeilingOption`
  (`tooling/src/_shared/proc-contract.ts:29-45`) that both doors take, which is stronger than the
  re-pointing condition 3 asked for.

**THE GAP — condition 1, the load-bearing one, is still unmet on the production path, and its ledger row
is bound to this board row.** Ledger 714 reads `**OPEN** (board #2212)` and is unchanged at tip:

- `tooling/src/verify/ops/eslint-discovery.ts:67` — `const wire: EslintDiscoveryWire = { count: files.length, files };`
- `tooling/src/verify/ops/eslint.ts#parsedDiscovery` — `JSON.parse(text)` is its first statement, so a real
  transit clip throws before the `files.length !== count` branch is reached.

**My own probe** (`pnpm exec node` over a scratch `.ts` importing the real `parsedDiscovery`), clipping the
child's own wire format at five offsets, with the forged envelope as the positive control:

```
clip=10: SyntaxError: Expected ',' or '}' after property value in JSON at position 10
clip=20: SyntaxError: Unexpected end of JSON input
clip=30: SyntaxError: Unterminated string in JSON at position 30
clip=40: SyntaxError: Unterminated string in JSON at position 40
clip=55: SyntaxError: Expected ',' or ']' after array element in JSON at position 55
forged: Error: ESLint discovery delivered 3 filenames but the child enumerated 4 — th…
```

So the named refusal is reachable ONLY by an envelope the producer cannot emit. The row's own words are
the sentence this fails: *"the failure mode this must prevent is a SILENTLY TRUNCATED list"* — and both
headers (`eslint.ts:36-40`, `eslint-discovery.ts:56`) still state truncation detection as fact. The test's
first assertion (`delivered` set-equals `discoverEslintFiles(root)`) is a genuine independent enumeration,
but it lives in the TEST; production calls `parsedDiscovery` alone.

**Also wrong in the proposal's evidence, independent of the verdict:** `fc4e0fa03` is not the closing
commit for any of this. The state I measured is the product of five commits — `fc4e0fa03` → `eb51d4313` →
`6cd7b488c` → `37caa7980` → `30fd90298` — and the third finding was only resolved by `30fd90298`'s
`eslint.config.js` fences (#2281/#2282). The cited range `:85-170` also stops one line before the
measurement arm it needs (`:170-210`).

**Remaining work, bounded:** either give the child an INDEPENDENT count (a second channel, or a count the
child derives from its own walk rather than from `files.length` in the same literal), or rewrite both
headers to claim envelope-shape validation rather than truncation detection — ledger 714's own fix spec.

### #2248 — REFUTE

**Latest refutations are ledger 846 and 847** (`cb-v-wave-9a`, measured on `cce850dc1`, i.e. AFTER
`05b3619c8`), both reading `**OPEN** (board #2248)`, and both are what the proposal proposes to flip.

**What `05b3619c8` genuinely fixed, and I confirm it.** The filed defect was an assertion
(`runs.some(r => r.concurrent.length > 0)`) that no ordering enforced. It is now an exact leader/follower
census (`:209-212`) ordered by `leaderRunId` (`:120-166`). **Planted break:** cutting the fixture's
failsafe `MAX_SLICES` 2000 → 40 (a 1 s cap) reds exactly that case —
`AssertionError: expected '' to contain 'tree-1-567975-…'` at `:211`, 1 failed / 10 passed, 6.57 s. So the
LEADER half of the rendezvous is enforced. Restored; `git status --short` empty.

**THE GAP — ledger 846 is live and I measured it.** Baseline
`pnpm test:scoped tests/tooling/_shared/artifacts.int.test.ts` at tip, exit 0, 11 passed:

```
✓ two concurrent `check:structure` runs both keep their verdict … 53031ms
  (whole file 55662ms)
```

**53031 ms** against `scaledBudget(60_000)` — 88 % of the base budget on a quiet box, every run. The
arithmetic names the mechanism: `MAX_SLICES 2000 × SLICE_MS 25 = 50 000 ms` plus ~3 s of child boot. The
FOLLOWER child never satisfies `inflight(ctx.root) < 2` (the leader is released the moment the follower
opens its slot, and finishes and unlinks before the follower's own gate hook runs), so it exits on the
failsafe on every run. The fixture's own header at `:47-49` says the slice budget *"is a FAILSAFE against a
hang, never the mechanism"*. It is the mechanism. That is the exact `#1849`/`#1832` family the row was
filed under, one layer in, and the case is one contention bump from the timeout it was fixed for.

**THE SECOND GAP — ledger 847 is live, verbatim.** `grep -n '1\.5s\|1500\|~16s' tests/tooling/_shared/artifacts.int.test.ts`:

- `:49` — *"Measured cost of the whole case when it works: ~16s."* Measured by me: **53031 ms**, 3.3×.
- `:169` — *"each case spawns real CLI children and the planted gate SLEEPS 1.5s to force the overlap"*.
- `:178` — *"SLOW_GATE sleeps 1.5s inside `runPass` … so the leader is provably still in flight"*.

There is no `1500` anywhere in the file; the gate is `Atomics.wait(…, SLICE_MS = 25)`. `ee7f2a1c9` touched
this file after `05b3619c8` and did not repair them.

The proposal's closure comment disposes of both with *"The historical 52–54 second failure remains part of
the ledger evidence"* — but 52–54 s is not history, it is tip, and 847 is not mentioned at all.

**Wrong evidence, independent of the verdict:** the cited *"fixture protocol is at `:313-319`"* is the
`PRUNE_RACER` fixture belonging to a different case (the over-capacity ring prune race); the #2248
assertions are at `:209-212`, not `:171-212`.

**Remaining work, bounded:** (a) repair the three comments at `:49`, `:169`, `:178` to the measured tip
behaviour; (b) release the FOLLOWER from the rendezvous it cannot satisfy — it needs no wait at all once
`leaderRunId` orders the pair — so the case costs its real ~3 s and the 50 s failsafe goes back to being a
failsafe; (c) re-measure and correct the `~16s` figure against the result.

### #2258 — ACCEPT

Ledger 754 demanded *"delete or invert the paragraph — the sibling's version is the true one"*.
`tooling/src/_shared/artifact-naming.ts:7-14` now states the mechanism, names the biome
`lint/performance/noBarrelFile` reason, carries the planted receipt (`artifacts.ts:428:1`, one error), and
says every consumer imports this path.

Receipt: `grep -c 'routeSlug\|artifactFilePath\|isOutPath\|artifactKey' tooling/src/_shared/artifacts.ts`
→ **0**, with the positive control `grep -c '^export ' …` → **20** in the same file (a bare zero is not a
measurement). `grep -rln 'artifact-naming' tooling/src` → 14 modules naming the new path directly.

### #2259 — ACCEPT WITH CORRECTION

Ledger 755 demanded *"correct the figures wherever they are cited (the #1584 comment, the board evidence
field)"*. The #2242 correction comment exists (2026-09-13T00:29:46Z) and records `357 / 255 / 407` with a
per-file delta table and the reproducing command.

**CORRECTION 1 — one of the two named cite sites never carried the figures.** All 59 comments on #1584
dumped to a file (187,670 bytes): `331` → **0** hits, `6cd7b488c` → **0** hits, positive control `gate` →
**173** hits. Nothing to correct there; the row's fix spec was speculative about that site.

**CORRECTION 2 — attribution.** The proposal says the comment records *"the reproducible `authoredLineCount`
values"*. The comment's own receipt is `git show 6cd7b488c:<path> | wc -l`. Ledger 755 states the two agree
on this population, so the figures are right and only the method name is misattributed.

**Not covered by me:** #2242's Project-1 `evidence` field. This lane does not run `work:item` and could not
read the field through `gh api` under the worktree guard.

### #2260 — ACCEPT

Ledger 756 demanded rename-or-split plus a header repair. `tests/tooling/_shared/artifact-naming.test.ts`
exists (`ls tests/tooling/_shared/` shows no `artifacts.test.ts`), imports all four names from
`@orb/tooling/_shared/artifact-naming` at `:29`, and `pnpm test:scoped` → **7 passed**.

The header goes further than the row asked and is right to: it REFUTES the row's second half with the
tree. `test-layout` does cover this file — `tooling/src/verify/gates/test-layout.ts:25-28,149-176` builds
the `tooling-test` mirror question — and the gate was green on the old name because
`tooling/src/_shared/artifacts.ts` still exists. The durable gap it records (*a mirror gate proves the
test's NAME resolves, not that the file is its SUBJECT*) is the honest residue, and it is separately
recorded at `test-layout.ts:94-109` with a measured denominator (1460 of 2441 mirrored tests never name
their target).

### #2262 — ACCEPT

Ledger 757 offered two arms — *"say so in `closeRunSlot`'s header, or skip the prune when nothing was
published"*. Both were taken. `tooling/src/_shared/artifacts.ts:262-264` is now
`closeRunSlot(slot) { finishSlot(slot, []); }` (the `root` parameter went with the prune), `finishSlot`
holds the shared unlink + manifest, and `pruneRuns` runs only at `:309-311` inside `publishRunSlot` under
an explicit `THE PUBLISHER-ONLY HALF (#2262)` comment. The header at `:250-261` states the side effect and
why it was a defect.

The pins at `:530-579` are the shape the doctrine asks for: a close arm asserting the aged slot survives
AND `prunedRuns(...)` is empty, plus a **POSITIVE CONTROL** doing the same publish on the same ring and
asserting the aged slot IS retired and recorded — without which the close arm would pass on a ring that
prunes nothing ever. Both green in my run (3 ms / 2 ms). The subject is the exported production function;
its one production caller is `tooling/src/verify/ops/structure.ts:404`.

### #2270 — ACCEPT WITH CORRECTION

Two demands were live: ledger 787 (name the two sites that drifted 51 → 53, fold them into #2142's wake,
and give the parked count a two-sided pin) and ledger 905 (the exact-set pin is a false red by
construction).

**905 is closed, and well.** `tests/tooling/verify/gates/mirror-index-family.test.ts:314-406` replaces the
57-path roster with a two-conjunct class (`message` starts `mirror miss — no source for tooling/src/` AND
path under `tests/tooling/verify/gates/`) plus two named exceptions each carrying a `why` and a
`git log --diff-filter=A` justification. `realTreeMisses` drives the real `runPolicyPass` and asserts
`toolErrors: []` and `withheldPolicyIds: []` first, so no arm can be vacuously green on a refusal. Four
discriminating overlay arms judge the predicate against real gate output in both directions, and each
overlay carries the in-population ANCHOR set the population fence requires. The two-sided half is the
exception rows asserted live, so a fixed member goes stale and reds. `pnpm test:scoped` → **23 passed**.

**CORRECTION — the naming half of 787 is not `6049dcded`'s and #2142 was not folded.**

- The 51/53/57 reconciliation and the SIX named new members
  (`doc-catalog/ops/catalog-scope.test.ts`, `bus-payload-family`, `css-home-topology-family`,
  `real-corpus-liveness-family.repo.int`, `seed-theme-ink-family`, `token-contract-family`) live in
  `docs/reviews/gate-runtime/v-wave-12b-2026-09-13.md:57-61`, produced by `183e49714`/wave-12b. The test
  header cites that report rather than restating it — fine — but the proposal credits `6049dcded` alone.
- **#2142 is OPEN and its body still reads 51** while the tree reads 57. Its wake condition (*"the
  test-mirror revamp program is filed or the owner rules on the 51 sites"*) is unaffected, so this is a
  stale-number residue rather than a live defect — but ledger 787's *"file them or fold them into #2142's
  wake"* is not satisfied, and the corrected closure should say so in one line rather than claim the
  drift closed.
- One design note, not a defect: the class invariant deliberately does NOT red on a new in-class member
  (that was the whole point of 905), so *"the next drift reds"* is no longer true for the class and is
  true only for the two named exceptions. That is the right trade and the header argues it explicitly;
  the closure comment should not claim more.

### #2284 — REFUTE

Ledger 829's fix spec: *"pass an explicit maxBuffer sized for the range (or stream), **name the ceiling in
the refusal text**, and **pin it with a planted >1 MiB log**."*

**Two of three are met, and well.** `tooling/src/verify/ops/ledger-claims.ts:222-250` is `readClaimRange`
with the ceiling as a defaulted parameter; `runNicedSync` now carries `errorCode` so `status: null` no
longer means four things; the ENOBUFS arm names the ceiling IN FORCE (not the module constant), says
`git did not fail`, and is separated from the spawn-failure arm. `tests/tooling/verify/ops/ledger-claims.int.test.ts:56-89`
plants a real repository, asserts the tiny-ceiling refusal contains the number, `ENOBUFS` and
`git did not fail`, and carries an ample-ceiling positive control that must PARSE, plus an ENOENT arm.

**THE GAP — the value production actually uses is unpinned, and the row named exactly that pin.** The one
production call site is `ledger-claims.ts:290`, `readClaimRange(root, since, until)` — **no ceiling
argument**, so it rides `GIT_LOG_MAX_BUFFER_BYTES`. Every ceiling the suite exercises is a parameter the
production path never supplies; the planted log is ~240 KB, not the >1 MiB the row demanded.

**Planted break:** `const GIT_LOG_BUFFER_MIB = 256;` → `0.0009765625` (a 1 KiB default — the original
\#2284 defect, worse), then
`pnpm test:scoped tests/tooling/verify/ops/ledger-claims.int.test.ts tests/tooling/verify/ops/ledger-claims.test.ts`
→ **exit 0, 2 files, 16 passed**. Green under a defect that makes `pnpm check:ledger-claims` refuse every
real range. Restored; `git status --short` empty.

Corroboration that nothing else holds it: `grep -rn 'GIT_LOG_MAX_BUFFER\|GIT_LOG_BUFFER_MIB\|268435456'
tests tooling/src` returns only the four sites inside `ledger-claims.ts` itself.

**Remaining work, bounded:** one arm that calls `readClaimRange(root, since, until)` with **no ceiling
argument** over a planted range whose log exceeds node's 1 MiB `spawnSync` default (≈30 commits ×
40 KB bodies, the existing `plantRange` helper with `COMMITS`/`BODY_FILLER_BYTES` raised), asserting the
commits come back and PARSE. Red-first receipt: with `GIT_LOG_BUFFER_MIB` cut below the payload the new
arm must fail; restore and it must pass.

### #2285 — ACCEPT

Ledger 833 demanded *"derive the artifact row's `ok` from the same two-term verdict … with a pin that a
throwing legacy gate reads ok:false in the published JSON"*. `tooling/src/verify/ops/structure.ts:99-102`
is now `ok: g.ok`, with a header that keeps the superseded #2234 ruling verbatim as a correction and
records the `pnpm ast refs` re-derivation showing the exit path is untouched.

**Planted break (mine):** `ok: g.ok` → `ok: violations.length === 0`, then
`pnpm test:scoped tests/tooling/verify/ops/structure.int.test.ts` → **1 failed / 8 passed**,
`AssertionError: expected true to be false` in *"a gate that throws at RUN publishes an artifact whose row
reads ok:false, not a clean zero"*. Restored; baseline 9/9 both before and after.

This is a production-path pin in the strong sense: the case spawns a real `verify structure` child over a
planted tree, reads the PUBLISHED `check-structure.json`, and asserts the healthy sibling gate still reads
`ok: true` in the same artifact — so a runtime that reddened every row could not satisfy it.

### #2286 — ACCEPT

Ledger 842 demanded the inverted header↔body contradiction be repaired. At tip
`grep -n -i 'dormant' eslint.config.js` returns **one** hit, `:907`, and it is inside the sentence
recording what the line used to say (*"this line said 'Dormant until …' until #2286"*). The block at
`:901-914` now reads LIVE with the file count and the reason the block's own `ignores` names that
directory. `git ls-files packages/client/src/state | wc -l` → **88**, matching. The header's `:18` also
reads NOT dormant. Prose-only change, no enforcement delta, as claimed.

Line-cite drift only: the proposal says `:902-908`; the corrected comment spans `:902-909`.

### #2288 — ACCEPT WITH CORRECTION

**The membership claim is TRUE and I proved it myself.** Two-direction planted control on
`.dependency-cruiser.cjs` (cp-backed, restored, `git status --short` empty), one invocation, both probes
appended together:

```
PROBE A  // … docs/architecture/core/Cb-Adj-Probe-Nonexistent.md      → FLAGGED  .dependency-cruiser.cjs:856:41
PROBE B  // … Cb-Adj-Probe-Nonexistent-Bare.md                        → NOT flagged
baseline (no probe): raw 0 · planted: raw 1 = effective 1
```

So a root `.cjs` IS in a corpus, and the row's first clause is wrong.

**CORRECTION 1 — the row's CONSEQUENCE clause is TRUE at tip for 63 of 64 cites, and the proposal's
disposition buries that.** `dangling-doc-cite`'s grammar is
`DOC_TOKEN_RE = /(?<![\w./-])docs\/[A-Za-z0-9_./+-]*\.md/gu` (`dangling-doc-cite.ts:94`). Measured on the
file: **64** `.md` tokens total, of which **1** is `docs/`-prefixed
(`docs/architecture/core/Core-Tooling-Law.md` at `:660`). The other 63 are bare basenames across 14
distinct spellings (`Core-0-Architecture-and-Structure.md`, `Tier-1-DB.md`,
`client-architecture-lockdown.md`, …) — exactly the class #2237 repaired. The row's sentence *"its 27
repaired doc cites can rot again unseen"* therefore holds for almost all of them. The proposal's figure of
*"15 BARE-BASENAME cites"* counts distinct spellings, not cites.

**What makes the disposition defensible anyway:** the residue has a live owner. **#1334 is OPEN** —
*"dangling-doc-cite is anchored on a docs/ prefix and the house idiom is a bare filename — 137
unresolvable comment citations are invisible to it"* — and its re-derivation receipt names
`.dependency-cruiser.cjs` explicitly as one of only two root configs carrying dead bare cites. Its widened
resolver is precisely the regression guard #2288 was reaching for. **The closure comment must cite #1334**;
as written it reads as *nothing further is owed*, which is false.

**CORRECTION 2 — two of the three cited receipts are wrong.**

- `tooling/src/verify/gates/dangling-refs.ts:262` is `LAW_OUTSIDE_DOCS`, a literal two-entry list of `.md`
  files, and `dangling-refs`'s corpora genuinely do NOT include root `.cjs` — the row was right about that
  module. The Arm-B membership rule is in a DIFFERENT module: `dangling-doc-cite.ts:134-140`
  (`isArmBMember`) with `ROOT_EXTS` at `:103`.
- `tests/tooling/verify/gates/dangling-refs.test.ts` **does not exist** (`ls` → `No such file or
  directory`, exit 2). The only file there is `dangling-refs.repo.int.test.ts`, and its `:100-112`/`:185-195`
  are `dangling-refs`'s own planted-file and population-receipt arms — not controls on
  `dangling-doc-cite`'s arm-B membership.

### #2289 — ACCEPT

Ledger 848 demanded a load-scaled budget on the CLI-child cases, with the SIGKILL arm's outer budget above
its inner waits. `tests/tooling/verify/ops/structure.int.test.ts` has **9** `test(` sites and **all nine**
carry an explicit timeout; `CLI_CASE_BUDGET_MS = scaledBudget(30_000)` at `:55` documents why the base is
an order of magnitude over the measurement, and `KILL_CASE_BUDGET_MS = READINESS_BUDGET_MS * 2 +
SUBPROCESS_CLEANUP_BUDGET_MS + CLI_CASE_BUDGET_MS` at `:58` is strictly above the two `waitUntil` polls
nested inside the arm at `:295-329`, so a contention kill reports the legible inner message.

Baseline run: **9 passed, exit 0, 31.62 s**; the previously-unbudgeted kill arm at 2871 ms, the whole file
comfortably inside its budgets. No case now rides vitest's 5 s default.

## 3. Summary

**ACCEPT 6** — #2258 #2260 #2262 #2285 #2286 #2289.
**ACCEPT WITH CORRECTION 4** — #2197 #2259 #2270 #2288.
**REFUTE 3** — #2212 #2248 #2284.

The three REFUTED rows' remaining work, as bounded specs:

1. **#2212** — the truncation control is unreachable in production. Either give the discovery child an
   INDEPENDENT count (a second channel, or a count derived from its own walk rather than `files.length` in
   the same JSON literal at `eslint-discovery.ts:67`), or rewrite `eslint.ts:36-40` and
   `eslint-discovery.ts:56` to claim envelope-shape validation instead of truncation detection. Floor:
   `tests/tooling/verify/ops/eslint.int.test.ts` plus a clip-at-N-bytes arm on the child's own wire format
   that reaches the named refusal. Ledger row 714 stays OPEN until then.
2. **#2248** — (a) repair the three false comments at `artifacts.int.test.ts:49`, `:169`, `:178`; (b) drop
   the follower's rendezvous wait, which it can never satisfy and which costs 50 s of failsafe expiry on
   every run — `leaderRunId` already orders the pair, so only the LEADER needs to block; (c) re-measure and
   correct the `~16s` figure. Floor: the file, three sequential passes, each case's duration recorded.
   Ledger rows 846 and 847 stay OPEN until then.
3. **#2284** — one arm calling `readClaimRange(root, since, until)` with **no ceiling argument** over a
   planted range exceeding node's 1 MiB `spawnSync` default, asserting the commits parse; red-first against
   a cut `GIT_LOG_BUFFER_MIB`. Floor: `tests/tooling/verify/ops/ledger-claims.int.test.ts` +
   `ledger-claims.test.ts`. Ledger row 829 stays OPEN until then.

Two closure comments also need rewriting even where the disposition survives: **#2197** must credit the
ARM B policy fix (`no-loose-id-cast.ts:30-44,:105`), and **#2288** must cite **#1334** as the owner of the
bare-basename residue and drop its two wrong receipts.

## LEDGER ROWS (2 rows)

| module | wave·path:line | defect | class | state | receipt |
| - | - | - | - | - | - |
| `ledger-claims` | cb-adj-closures · `tooling/src/verify/ops/ledger-claims.ts:214` · `:226` · `:290` | the 256 MiB capture ceiling that IS the #2284 fix is a DEFAULT PARAMETER that the one production call site (`:290`, three arguments) rides and that no test supplies — every arm in `ledger-claims.int.test.ts` passes an explicit ceiling, so the value production depends on is unpinned. The row's own fix spec asked for the pin that would have caught this (*"pin it with a planted >1 MiB log"*) and it was not written | unpinned production default (the #2238 class: a test that supplies the driver's argument pins the callee and never the wiring) | **OPEN** (board #2284) | `GIT_LOG_BUFFER_MIB` 256 → `0.0009765625` (a 1 KiB default, i.e. worse than the original defect) → `pnpm test:scoped tests/tooling/verify/ops/ledger-claims.int.test.ts tests/tooling/verify/ops/ledger-claims.test.ts` = **exit 0, 2 files / 16 passed**. Restored, `git status --short` empty. Corroboration: `grep -rn 'GIT_LOG_MAX_BUFFER\|GIT_LOG_BUFFER_MIB\|268435456' tests tooling/src` → only the four sites inside the module |
| `tests/tooling/_load-budget.ts` (ledger row 772's receipt) | cb-adj-closures · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:772` | row 772's stated receipt does not reproduce and its finding is false: it claims *"Nothing under `tests/` exercises `runCommandWithBudget`'s error path"* and *"`/usr/bin/grep -arln 'runCommandWithBudget' tests/` returns nothing"*. The grep returns three hits and the error path IS exercised. A verifier receipt that reads as a measured absence, quoted forward into a fix brief, is the same class the ledger exists to catch | receipt accuracy (a negative claim whose command reproduces positive) | **OPEN** (board #2197) | `/usr/bin/grep -arn 'runCommandWithBudget' tests/` → `tests/tooling/_load-budget.ts:125` (definition), `:167` (`runNodeWithBudget`), `:172` (`runPnpmWithBudget`); positive control `/usr/bin/grep -arl 'scaledBudget' tests/ \| wc -l` → 142. The error path: `tests/tooling/load-budget.int.test.ts:82-86` drives `process.exit(2)` with stderr and asserts `FATAL_EXIT_RE = /exit 2.*fatal/su` (`:32`) against the thrown message |

`ledger rows OWED: 2`

## WHAT I DID NOT COVER

- **#2242's Project-1 `evidence` field** (the second cite site ledger 755 names for #2259). This lane does
  not call `work:item`, and a `gh api graphql` read was refused by the worktree guard. The #1584 half of
  that fix spec I did measure: the figures were never there.
- **`check-gates.repo.int` on a quiet box** — #2197's original subject and the condition its 19:22Z ruling
  set (*"Stays P1 until the planter is green"*). It is a fixture-planting suite, orchestrator-only, and
  outside this lane's load fence. The ARM B code fix it depended on IS on the tree; whether the planter is
  now green is unmeasured here.
- **`check:structure` whole-corpus, `pnpm check`, any CT** — load fence. The only structure runs I made
  were two bounded `--check dangling-doc-cite` invocations.
- **The proposal's ledger PATCH file** (`/tmp/codex-tooling-cohort-ledger.patch`) — I reviewed the
  dispositions, not the patch's byte-level fidelity to the ledger rows it edits.
- **#2270's ledger 787 attribution of the +2** — I confirmed the six names exist in
  `v-wave-12b-2026-09-13.md` §2 and that #2142 still reads 51; I did not independently re-drive the
  51/53/57 `git cat-file -e` reconciliation.
- **Rows 713, 714, 846, 847 as ledger BOOKKEEPING** — I measured their subjects at tip; I did not audit
  whether every other row the proposal's patch touches is correctly stated.

## Integration adjudication

The primary read this report in full on main `49a411337`. The six unqualified ACCEPT subjects are byte-identical to the audited `aec0ffb55` source and tests. Their six ledger rows are closed using this independent evidence. The four conditional corrections are not bulk-closed, and the three REFUTED outcomes remain open. The original proposal patch was not applied. Both newly reported rows are retained below the original ledger history for explicit reconciliation.
