---
kind: review
status: active
updated: 2026-09-12
---

# cb-v-ledger-wave — fresh-context verification of the 2026-09-12 refutation-ledger merges (#1584)

Lane `cb-v-ledger-wave`, read-only, isolated worktree
`.claude/worktrees/agent-a5b1b55b17a2423bc`. Every number below was produced in this session; nothing is
re-quoted from a lane's own report.

## WHICH TIP EACH MEASUREMENT WAS TAKEN AT

Two scope additions arrived mid-run and neither was in the worktree I was handed. Both were fast-forwarded
in (my HEAD was an ancestor of `main` in both cases, so the ff was clean and nothing already measured was
invalidated — all six original-scope commits are ancestors of every tip below).

| measurement | tip |
| - | - |
| the 18-suite scoped floor · `check:policy-conformance` (first) · the 16 §4.1 re-cuts · the 3 `#2057` cuts · the `no-raw-zustand-persist` ARM C probe | `277604d26` |
| the `static-authored-value` reader re-drive · the 4 shared-reader cuts · the length-clause probe · `check:policy-conformance` (second) · **`check:structure`** | `337c940d8` |
| the 2 `7bd650d30` cuts | `7bd650d30` |

`960e21cf9` (07:04:38) was **not** in the worktree at `277604d26` (06:53:09). The orchestrator's note said
my structure leg "already covers the real-tree half"; it did not — run unadjusted it would have reported the
pre-fix effective count and read as a refutation of the 914 → 253 claim. Fork raised by SendMessage with the
receipt, default (ff) stated, approved.

## METHOD

**The cut harness.** All cuts run the module's own proof rows through the production dispatcher
(`verifyPolicyProofs`), against a **sibling scratch module written into the same directory** and `rmSync`-ed
in a `finally` — never a `?query` re-import (cached) and never a mutation of the real file. Each cut
**asserts its anchor occurs EXACTLY ONCE in the file and refuses otherwise**, which is guide §4.1's
comment/`why`-quoting false clean. Every cut is reported with its DIRECTION (what the predicate was replaced
*with*), its control result, and the row that died. Where a cut lands in a shared `lib/` reader the harness
also rewrites the gate's import to the scratch lib, so the receipt **names the policy it was driven
against** (§4.1's split-family rule).

Cuts that could not be expressed that way — the `lib/reference-fact-writes.ts` pair, whose pin is a vitest
file rather than proof rows — used a `cp`-backed probe with a `trap`-based restore. `git status --short` was
empty after each; no `git stash` / `checkout` / `restore` was used anywhere.

Nothing outside this isolated worktree was touched. No scratch module survives
(`ls tooling/src/verify/{gates,lib}/ | grep cbvlw` → none).

## A. FLOORS, FROM THE ARTIFACT

**Scoped suites** (`pnpm test:scoped`, 18 files, at `277604d26`) — artifact
`reports/runs/test/agent-a5b1b55b17a2423bc-2704508-2026-09-12T13-02-09-091Z/test-report.json`:
**18/18 suites passed, 196/196 tests, `success: true`, 0 failed.** Per-file: `home-server-family` 41 (the
8 → 41 the lane claimed), `bus-payload-allowlist` 40, `ordinary-client-and-ct-wave` 19, `registry-family`
18, `home-client-family` 17, `enforcement-registry-parity.int` 12, `bus-fact-health` 9,
`singleton-ordinary-policies` 9, `bus-pair` 7, `schema-fact-wave-1` 5, `no-raw-color-in-css` 4,
`origin-client-family` 4, `drizzle-registry-conversion` 3, `message-kind-policy-coverage` 3,
`no-tailwind-dark-variant.int` 2, `id-brand-flow` 1, `ledger-banned-shapes` 1, `origin-server-family` 1.

**Reader re-drive** (at `337c940d8`), `static-authored-value` + `schema-fact` + `mixed-hook-singletons{,
-conversion}` + `union-axis-family` + `tooling-plumbing-family`: **6/6 suites, 51/51 tests, exit 0**, no
type errors.

**`pnpm -s check:policy-conformance`** — at `277604d26`: `237 final policies · 2680 proof rows · 0
failure(s) · 131 grant rows · 0 invalid`, exit 0. At `337c940d8`: `237 final policies · 2683 proof rows · 0
failure(s) · 131 grant rows · 0 invalid`, exit 0 — the +3 is `960e21cf9`'s, exactly as its message says.

## B. RE-CUTS — 18 cells, control-green then armed-red, each killing exactly the row it names

Every row below is **CONTROL 0 failures → CUT ≥1 failure**, and the failing row is the one the lane's `why`
predicts. `no-raw-id`'s cut kills TWO rows, which is what its own `why` claims (both bare-callee spellings
resolve through the same arm).

| lane | module | cut (direction: what the predicate became) | row that died |
| - | - | - | - |
| #2045 | `bus-channel-primitive` | refusal classifier → constant `true` (fail-closed with no acquittal) | `mustPass[2]` file-local class |
| #2045 | `bus-channel-primitive` | drop `target.canonical.exportedName === EMITTER_EXPORT &&` | `mustPass[4]` renamed-export barrel |
| #2045 | `sole-env-reader` | drop `PROCESS_DOORS.includes(…) &&` from the module branch | `mustPass[4]` `cfg.env` default-export bag |
| #2046 | `no-await-db-in-loop` | function-boundary stop → `if (false as boolean)` | `mustPass[2]` `Promise.all` fan-out |
| #2046 | `no-await-db-in-loop` | `QUERY_VERBS.has(m)` → `m.length > 0` | `mustPass[3]` non-verb method |
| #2046 | `lib/property-assignment-name` (driven against **`bounded-list-limit`**) | computed-key refusal → `nameNode.getExpression().getText()` | `mustPass[6]` computed-key |
| #2048 | `fk-columns-indexed` | drop `column.unique \|\|` | `mustPass[4]` |
| #2048 | `schema-banned-shapes` | `if (offset < 0)` → `if (false as boolean)` | `mustFlag[9]` — **as a PASS TOOL ERROR**, "token not anchored at its declared offset", which is the row's own stated mechanism |
| #2048 | `contract-banned-shapes` | re-collapse `missingHome`'s verdict phrase onto `missingSubject`'s | `mustFlag[7]` on `messageIncludes` — the two blindness arms are genuinely disjoint |
| #2047 | `bus-belt-total` | `foreign` filter → `[]` | `mustFlag[1]` (0 findings) |
| #2047 | `no-raw-id` | retire the `path.length === 1` half of `named` | `mustFlag[3]` **and** `mustFlag[4]` |
| #2047 | `no-mint-via-cast` | `classifyOriginRefusal(…)` → `"other"` (fail OPEN) | `mustFlag[3]` |
| #2050 | `no-raw-intl-time` | drop `memberPath.length === 1` | `mustPass[5]` |
| #2050 | `no-raw-intl-time` | drop `globalName === INTL` | `mustPass[4]` — **a different row**, so the two halves are disjointly pinned, which is the wave-7 "unfalsifiable" reading this lane refuted |
| #2050 | `no-raw-zustand-persist` | drop `declarations.every(… === sourceFile …)` | `mustPass[5]` barrel |
| #2050 | `no-color-literals` | palette step made optional (`-\d{2,3}` → `(?:-\d{2,3})?`) | `mustPass[2]` (0 → 2 findings) |
| #2057 | `vector-scope-derived` | restore the fail-OPEN write predicate (`kind === "sealed" ? "sealed" : null`) | `mustFlag[8]` — "expected at least one effective finding but got 0" |
| #2057 | `vector-scope-derived` | drop the `namesVectorTable` NAME PREFILTER | `mustPass[11]` `unreadable-other.ts` |
| #2057 | `vector-scope-derived` | decision relaxed to the raw verdict (`kind === "foreign"`) | `mustPass[12]` `local-table.ts` |
| #2065 | `class-token-splice` | attribute-NAME test → `true` (flags MORE) | `mustPass[9]` the `title={…}` twin |
| #2065 | `surface-in-a-container-health` | drop the trailing `/` from the prefix test (tripwire ACQUITS more) | `mustFlag[1]` goes GREEN — the reversed direction §4.1 requires of a blindness tripwire |

**Ledger rows sampled.** `bus-channel-primitive` w8 `:140` and `:253`, `no-await-db-in-loop` w9 `:364`,
`fk-columns-indexed` w3 `:246`, `sole-env-reader` w8 `:162`, `no-raw-intl-time` (w7): each row EXISTS, is
marked CLOSED, and names the cut I ran independently — including the exact "control 0 → armed 1" shape.
**One gap:** `bus-belt-total` has **zero** mentions anywhere in the ledger, so `#2047`'s FOREIGN-arm closure
is a real fix with no ledger row behind it.

## C. THE FOURTH-POLARITY HUNT, PER ARM

Read per ARM, never per module, and never by sweeping for `!== "foreign"`. Every `readSealedOrigin` consumer
in `tooling/src/verify/gates/` now routes through `sealedOriginReports` except `untrusted-regex-safe-exec:65`,
which is shape 3 (acquitting) and must not be "fixed" — correct, and its own `mustFlag[1]` pins it.

**FINDING 1 (new defect).** `no-raw-zustand-persist` **ARM C fails OPEN on an unreadable receiver, while
ARM A and ARM B of the same policy fail CLOSED.** `unblindfoldedReset` (`:204-217`) gates on an identity
ACQUITTAL — `origin.kind === "resolved" && declaredByFile(…)` — and hardcodes `unreadable: false` at `:216`,
where `:138` and `:150` both write `unreadable: verdict === "unreadable"`. The module ships an `UNREADABLE`
const for exactly this purpose. This is the shape `#2057` was minted for, one module over, and `#2050`
touched this file without asking the per-ARM question.

Receipt (both arms, byte-identical fixtures differing only in the receiver):

- **Probe:** the registry file plus `declare function opaque(): any; export function dropOpaque(): void {
  opaque().reset(); }` — an unblindfolded registered-store drop. Added as a `mustFlag` with
  `{ count: 1, token: RESET }` → **"expected at least one effective finding but got 0"**. Silent.
- **Positive control:** the same file with `declare const held: RegisteredStore;` / `held.reset();` →
  **flags, count 1, row passes.** So the fixture reaches the arm and only the opaqueness suppresses it.

Fix spec: give ARM C the same `unreadable` verdict its siblings carry (`resolveTypeMemberOrigin` refusal →
`classifyOriginRefusal` → `unreadable: true`), and — per `lib/origin-verdict.ts` — a NAME PREFILTER, which
ARM C already has for free: the reset site is only collected when the call's member name is `reset` AND the
file is the registry, so the candidate set is already narrow and fail-closure cannot widen it to the tree.
Pin it with a `messageIncludes` row, because the arm emits the same one finding under the same token.

**FINDING 2 (new defect, §5b.1).** `no-untyped-soft-ref` (touched by `#2050`) declares a distinct
`UNREADABLE` const and passes it to `reportReviewedGrantCandidates`, but `softReferences` (`:51-64`) builds
every candidate without an `unreadable` field, so no candidate can ever carry it — the text is unreachable
by construction. Same shape, out of this scope: `no-raw-interactive-intrinsics:99`, `zod-error-issues-home:121`
(both build their one `candidates.push` without the field). Distinguish these from
`no-untrusted-html-in-main-dom`, `theme-override-only-via-scope`, `tooling-port-registry` and
`tooling-root-config-import`, which pass `unreadableMessage: MESSAGE` — those declare no distinct third
answer at all and are honest.

**No other fail-open → fail-closed repair in the scope is missing its prefilter.** `#2057`'s is present and
enforced (cut 2 above reds `mustPass[11]`).

## D. THE §5b.5 HEADER CLAIMS — READ, NOT GREPPED

Census over the 46 modules the four claiming lanes touched, then the misses read in full.

- **#2045, "§5b.5 on all eleven": HOLDS.** 11/11 carry a FAMILY line, a POPULATION PORT line and a legacy
  SHA (`9808b93c0`, plus `bus-channel-primitive`'s 40-char form).
- **#2046, "all fourteen": HOLDS.** 14/14, SHAs `0d83d99f1` / `e5a7a8a8c` / `ef2251957` / `519242add`.
- **#2048, "9/9 FAMILY + 9/9 POPULATION PORT on wave 3's nine": HOLDS.** The one census miss,
  `nullable-column-inequality`, is a **false negative of my phrase match** — its header records the port in
  substance and delegates the derivation and measured delta to `NULLABLE_INEQUALITY_POPULATION:52-58`,
  which quotes the legacy `scanRoot` verbatim. Compliant.
- **#2047, "§5b.5 headers on all 9 touched modules: FAMILY + POPULATION PORT + legacy SHA": FALSE on 2 of 9.**
  - **`bus-belt-total` has NEITHER.** No FAMILY line (only an oblique "they share the family and its
    provider" in prose) and **no POPULATION PORT line at all**. The commit's diff for this file adds
    **only a `mustFlag` row** — it never touched the header, so the claim covers a module the lane did not
    edit in that respect.
  - **`bus-producer-coverage` has the POPULATION PORT** (added by this commit, a good 5→1 consolidation
    record) **but no FAMILY line.** It names the shared reader `busProducerFact` in prose, which satisfies
    §5b.5 item 5 in substance but not the labelled form the lane claimed for all nine.

## E. `check:structure`, ONCE, LAST, AT `337c940d8`

Run alone (I checked for a competing structure process first; only a sibling's transient `typecheck-plan`
was live). Artifact:
`reports/runs/structure/agent-a5b1b55b17a2423bc-2797867-2026-09-12T13-21-11-456Z/check-structure.json`.

- **`0 tool error(s)` · `0 withheld` · `0 alarm(s)`** (`scanAlarms 0`, `populationAlarms 0`, `factErrors 0`,
  `waiverCarrierRefusals 0`).
- `final policies: 237 ran · raw 1554 = waived 1177 + granted 131 + effective 246 (197 error, 49 warning)`.
- `single-pass: ran 297/297 active gate(s) (60/60 legacy · 237/237 final) — run COMPLETE`.
- `ok: false`, exit 1 — the #1584 baseline red, not a defect of this wave.

**Reconciling with `960e21cf9`'s claim.** That lane measured effective **253** pre-rebase in its own
worktree; I measure **246** at a tip carrying several further commits. The direction is right (nothing
regressed) and the delta is downward, but **the 914 → 253 pair is not reproducible from my run** — I have
one side only, because re-running the pre-fix side would need a second whole structure pass I was not
budgeted for. Recorded as PARTIAL rather than confirmed.

## F. THE LEDGER

- **CLASS ROLLUP untouched.** Cumulative diff `13080acc2~1..HEAD` over the ledger: five hunks, none of
  which changes a cell of the `| class | rows | CLOSED | OPEN | … |` table. The two edits near it are a
  markdown escape (`~1` → `\~1`) in the cross-cutting prose and a blank line. The table still reads
  `TOTAL 100 · 45 CLOSED · 48 OPEN` from the 2026-09-11 rebuild and is now stale by this wave's rows plus
  the 19 appended — which is what `42a38fbf5` and `274fe46c9` both say, so this is by ruling and not drift.
- **The two appended sections match their reports exactly.** `### cb-v-ledger-fixes` = **9 rows**, and
  `docs/reviews/gate-runtime/v-ledger-fixes-2026-09-12.md`'s own `## LEDGER ROWS` table = **9 rows**.
  `### cb-v-mixed-hooks-1-3` = **10 rows**, its report = **10 rows**. 9 + 10 = the 19 the commit claims,
  append-only, and the commit's own note that the handover's "6 and 11" were wrong is correct.

## LEDGER ROWS (4 rows)

| module | source | defect | class | state | receipt |
| - | - | - | - | - | - |
| `no-raw-zustand-persist` | `cb-v-ledger-wave` `tooling/src/verify/gates/no-raw-zustand-persist.ts:204-217` | **ARM C fails OPEN on an unreadable receiver** while ARM A (`:138`) and ARM B (`:150`) of the same policy fail CLOSED and the module ships an `UNREADABLE` const. `unblindfoldedReset` gates on the identity ACQUITTAL `origin.kind === "resolved" && declaredByFile(…)` and hardcodes `unreadable: false` at `:216`. The FOURTH polarity `#2057` was minted for, one module over; `#2050` touched this file and did not ask the per-ARM question | other (fail-open) · §4.1 | **OPEN** | red/green pair, byte-identical fixtures: `opaque().reset()` inside the registry file → *expected at least one effective finding but got 0*; the same fixture with `declare const held: RegisteredStore; held.reset()` → flags, count 1, passes. Driven through `verifyPolicyProofs` at `277604d26` |
| `lib/reference-fact-writes.ts` | `cb-v-ledger-wave` `tooling/src/verify/lib/reference-fact-writes.ts` (`isReadOnlyInvocation`) | **`members.length === 1` is an UNENFORCED §4.1 narrowing** in `960e21cf9`'s new shared reader. The shipped closed-list test's "deeper chain" case (`deeperChain.nested.join(",")`) is rejected by the NAME test on its FIRST member, so it never reaches the length clause — the clean cut measured the name test, exactly §4.1's "every existing row reached the fence through one fixture that structurally avoided the branch". The clause DOES discriminate, and its failure direction is fail-OPEN on a reader many policies consume | §4.1 narrowing | **OPEN** | `cp`-backed cuts on the real reader, restored by `trap`, `git status` empty after. Control 9/9. Cut `return false` → 1 red (read-only direction pinned ✔). Cut to any named member → 2 red (closed list pinned ✔). Cut admitting `push` → 2 red (mutator direction pinned ✔). **Cut `length >= 1` → 9/9 CLEAN.** Constructed discriminating fixture — `const readOnlyFirstHop = { filter: { push: (v: number) => v } }; void readOnlyFirstHop.filter.push(2);` — **passes at tip (10/10) and REDS under the cut**. The fix is that one row |
| `bus-belt-total` · `bus-producer-coverage` | `cb-v-ledger-wave`, against `ee6dab949`'s commit message | the commit claims *"§5b.5 headers on all 9 touched modules: FAMILY + POPULATION PORT + legacy SHA"*. **`bus-belt-total` has NEITHER a FAMILY line NOR a POPULATION PORT line** — its diff in that commit adds only a `mustFlag` row and never touches the header. `bus-producer-coverage` gained the POPULATION PORT but has no FAMILY line (it names `busProducerFact` in prose only) | §5b.5 header | **OPEN** | headers read in full at `337c940d8`; census over all 46 modules the four claiming lanes touched, misses read rather than grepped. #2045 11/11, #2046 14/14, #2048 9/9 (its one census miss is a false negative — the port is at `NULLABLE_INEQUALITY_POPULATION:52-58`) |
| `no-untyped-soft-ref` | `cb-v-ledger-wave` `tooling/src/verify/gates/no-untyped-soft-ref.ts:51-64,82` | declares a distinct `UNREADABLE` const and passes it as `unreadableMessage`, but `softReferences` builds every candidate WITHOUT an `unreadable` field, so no candidate can carry it — an advertised #944 third answer that is unreachable by construction (§5b.1: nothing declared that it does not use). Same shape outside this scope at `no-raw-interactive-intrinsics:99` and `zod-error-issues-home:121`. NOT the same as the four modules passing `unreadableMessage: MESSAGE`, which honestly declare no distinct third answer | §5b.1 | **OPEN** | read of every `candidates.push` in each module plus a sweep of all 28 `unreadableMessage` callers in `gates/`, partitioned by whether any candidate sets the field |

## WHAT I DID NOT COVER

- **No §4.6 differential of any kind.** No legacy replay, no population comparison, no tool-error
  comparison. Nothing here speaks to catch parity.
- **The pre-fix side of `960e21cf9`'s 914 → 253.** One structure pass only; the 253 (and the 246 I measured)
  have no measured control.
- `pnpm check` / `verify --push` / any behavioural product suite; the whole-tree checks are the standing
  \#1584 red and were not attempted.
- The **remaining \~30 unenforced §4.1 cells** the rollup still lists as OPEN. I re-cut 18 of the cells these
  merges CLOSED, not the ones they left open, so I cannot say the wave's open count is right.
- `tooling-instrument-proof`'s arm-F prefilter (`960e21cf9` D1, 654 → 0) was **not cut** — I verified its
  effect only through the whole-run structure numbers and conformance, which cannot separate it from the
  other two fixes in that commit.
- The per-ARM polarity hunt covered the **62 gate modules the six commits touched** plus every
  `readSealedOrigin` consumer repo-wide. Modules outside that set with a `resolveTypeMemberOrigin` /
  `resolveGlobalMemberOrigin` acquittal were not read.
- `#2045`'s `GRANT_CASES` table: I ran the 41 tests it produces and read the claim, but did not
  independently re-derive that the table's policy set EQUALS the family's reviewed-grant set.
