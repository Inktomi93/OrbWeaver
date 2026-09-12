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

## 0. Session start (every time, in this order)

1. Prove the guard is bound: run `git stash` (bare) and expect the hook to DENY it. If it passes, relaunch from `main`
   before touching anything (hooks bind at launch).
2. Pre-flight, cheapest probe FIRST: `free -g` and `grep Shmem /proc/meminfo`. A sleeping vLLM fleet parks \~37 GiB as
   `Shmem`; under \~1 GiB means engines are already down and you need no launcher call at all. Only if `Shmem` is high
   do you touch `pnpm engines status` / `pnpm stack status`, and then take prod down and stop engines from `main`'s
   checkout. The launcher family has no help guard — a bare `node scripts/dev/engines.ts --help` once REAPED three live
   pids — so never invoke it merely to look.
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
7. **Know the doc layer before you brief anyone — the guide's opening section is the routing table, read it.** Of the
   23 documents in `docs/reviews/gate-runtime/`, four are LIVE LAW the guide delegates to (which resource capability,
   what blocks this gate, where this exemption table goes, what a marker is) and roughly thirteen are completed-family
   evidence. **You will be tempted to re-derive an answer one of those four already holds. Do not** — that cost a full
   session on 2026-09-11, four separate times, each caught by a lane or the owner rather than by me. Also live:
   `shared-semantic-readers.md` (the M/O/G/V foundations, and its binding constraint that those are COMPUTATION GROUPS,
   so a lane must prove real shared consumption before naming a `family`) and `checkpoint-2026-09-05.md` (whose
   §"Resume order" and per-wave lessons list are dense with mechanism law that reads like a receipt).

   **Apply the guide's STALENESS RULE to every one of them**: the gate program predates the type-worlds program
   (#1351), so a 2026-09-05/06 document's "blocked", "required" or "missing" may have been satisfied or retired by
   \#1351 rather than by us. Re-derive against the tree before acting. Two carry superseded ATOMIC-premise banners —
   read the banner before citing the body, and brief a lane off the banner. Constitution §0.1 makes a lane follow a doc
   over your brief, so an unbannered stale premise misbriefs silently.

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

**Phase B — three slots, after A.**

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
2. Proof rework: resume `.claude/worktrees/agent-a2dae218300f26638`, **checkpointed at `20550dc83` (3 files); rebase
   onto `main` first**. Item 1 was built under the SUPERSEDED scope (per-gate negative arms); correct it to guide
   §4.2 — positive same-position arm per tenancy policy, delete the vacuous negative arms — then item 2: the
   `test-no-stubs` cross-file fixture whose offsets must actually OVERLAP (the prior attempt's never did), plus its
   `@tests` header note. That fixture is an invented row for a new property, so it owes a planted break. This is
   \#1935's rework, already Running and claimed; `review` → `verify` → verifier → `done`.
3. \#1946 guard residuals (Sonnet mech-executor; hook + its pin + `registry.test.ts`; both-direction pins; no-loosening
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

   **AUDIT STATE — 2026-09-11 evening. Waves 1-6 complete, 62 of 167 modules audited** (wave 5's 15 include ONE re-audit of `no-inline-types`, already covered by wave 1 — cross-check every wave's subjects against the prior audit docs before counting them fresh).

| wave | subjects | verdict | narrowings |
| - | - | - | - |
| 1 | the ten cited exemplars | **9 REFUTED**; only `user-bus-deferred-member` copyable | 12/30 by the NAIVE sweep (unsplit, overstates) |
| 2 | registry/completeness ×8 | **7 REFUTED**; the 8th was LEGACY, not a subject | naive 12/30 → **classified 5 genuinely unenforced (17%)** |
| 3 | drizzle-schema ×9 | all nine REFUTED | **best proof axes yet**: 1 of 53 rows count-less, 0 of 6 transplants tautologous |
| 4 | raw-CSS / token ×9 | **all nine REFUTED** | 31 cuts → 19 enforced / **10 unenforced (32%)** / 2 unfalsifiable / **0 mutually redundant (MEASURED)** |
| 5 | `ordinary-visitors` ×15 | **13 REFUTED / 2 confirmed** | 94 cuts → naive 56 clean → **33 UNENFORCED (35%)**; naive over-reports by 41% |
| 6 | `origin-client` ×12 | **all 12 REFUTED** | 59 cuts → naive 29 clean → **25 UNENFORCED (42% upper bound, broader cut set)**; 1 mutually redundant, 3 unfalsifiable, 0 wrong-direction |

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
**`zustand-selector-stability`** (reviewed-grant; zero unenforced narrowings, 6/6 exact `count`+`token`). **ANTI-patterns,
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
   `git -C <wt> status --short` empty means teardown loses zero bytes.
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

- Fix the source, not the lane: a correction issued twice means the rule file is wrong.
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
