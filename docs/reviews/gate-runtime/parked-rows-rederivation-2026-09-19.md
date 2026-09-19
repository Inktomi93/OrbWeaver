---
kind: review
status: active
updated: 2026-09-19
---

# Parked gate rows, re-derived against the closed #1584 runtime (2026-09-19)

Lane `gate-park-U`, row #2451. Every Parked row whose wake condition named the gate-system revamp,
\#1584, the Codex ESLint hold, or a dead gate lane, re-derived against the tree at `main` `047320b97`.
Read-only: this lane wrote no code and touched no board row.

**Tree facts the dispositions stand on.** `tooling/src/verify/gates/*.ts` holds 339 modules and
`rg -c 'defineGate\(' tooling/src/verify/gates/*.ts` returns 339 lines — every module is a final
policy; no `GateDescriptor` survives in the gate corpus. `tests/tooling/check-gates.int.test.ts` and
`tests/tooling/check-gates.repo.int.test.ts` are both absent (deleted at `b1e5e3e30`, #2176 Phase F).
`pnpm verify --list` (exit 0, run 2026-09-19) places `structure:policy-conformance` in
`changed · static · push · full` and `tests:tooling` in `full` only.

**Census.** 31 rows were handed to this lane. A `work:item list --status Parked` sweep over all 96
Parked rows, widened past the handed predicate, found exactly one more with a gate-program wake:
**#2283**. It is included below. Totals: 16 SUPERSEDED · 15 RE-FILE · 1 KEEP PARKED.

**One hard coupled site the orchestrator must act on before closing anything.**
`tooling/src/verify/gates/query-freshness-coverage-debt.ts:17` declares `workItem: 1965`. The final
contract requires a `warning` policy's `workItem` to be a positive LIVE issue
(`lib/workitem-liveness.ts` + `lib/board-citations.ts` at the online barrier). **Closing #1965 reds
`pnpm check`.** A sweep of all 32 rows for `workItem: <n>` found no other such citation.

---

## A. SUPERSEDED — the outcome shipped, or the mechanism is gone

### #889 — stage-level parallelism for `pnpm check`

The row's own done-criterion admitted two arms: a concurrency-capped overlap proposal **or a
documented refusal**. The second arm landed. Its issue comment records the measurement
(`fd31bf645`, warm caches, method in `docs/reviews/research/2026-08-31-gate-pass-unified-walk.md` §7):
the lever is worth ~43 s, not ~100 s, and the **owner ruled on 2026-08-31 not to pursue it**. Nothing
in the runtime cutover changes that arithmetic — the sequential stage scheduler in `ops/run.ts` is
unchanged. Close as ruled-and-refused, not as abandoned.

### #970 — duplicate TsMorph workspace load in the gate anti-drift harness

The subject is deleted. `tests/tooling/check-gates.int.test.ts` (the suite that launched
`pnpm check:structure` in two child processes) and `tests/tooling/check-gates.repo.int.test.ts` no
longer exist; `b1e5e3e30` ("retire the `__g_` planter suites and every frozen-legacy-replay
differential", #2176/#1584) removed them on the owner's 2026-09-15 option-B ruling. Both died at
`lib/loader.ts`'s own empty-legacy-roster refusal once the corpus went all-final. The row's two
non-collapsible constraints were preserved by rehoming, not by deletion: the roster-accounting /
no-probe-sentinel / every-file-registers arm became a real-corpus arm in
`tests/tooling/verify/ops/structure.int.test.ts` (in process, planting nothing — see its
`THE REAL-CORPUS ROSTER` block), and the per-policy population denominator moved to
`tests/tooling/verify/lib/render.int.test.ts`. The "two whole workspace bootstraps" cost the row
existed to measure is structurally gone with the second process.

### #1648 — `tests/client/**/*.fixtures.tsx` invisible to ESLint

Landed. `eslint.config.js:148` declares `const CLIENT_FIXTURES = "tests/client/**/*.fixtures.tsx";`
and the adjacent comment at `:146` names the cause and the census: *"#1590: `*.fixtures.tsx` under
`tests/client/**` had no home (only `tests/ui/**/*.fixtures.tsx` did) — 12 files (11
`components/*.fixtures.tsx` + `state/config-row-annotation.fixtures.tsx`) were uncovered."* The row
predicted two members; the landing covered twelve.

### #1753 — `content-part-seam` blind to structural part handling in `entry/compose/chat.ts`

Note the row had an EMPTY body; it is judged on its title. Both halves are answered and neither is by
the route the title proposed.

1. The policy is final and its subject is now IDENTITY, not spelling:
   `tooling/src/verify/gates/content-part-seam.ts:7-14` states the subject is *"the reference whose
   CANONICAL DECLARATION lives in the contracts chat home, resolved through the shared sealed-origin
   reader"*, with the home's existence receipted so a moved declaration REFUSES rather than passing
   clean.
2. The compose site was RULED not to be the seam's subject, in place:
   `packages/server/src/entry/compose/chat.ts:135-139` — *"DERIVED from the domain message, never
   re-spelled and deliberately not the D51 seam symbol: compose does not PRODUCE content parts (the
   engine request seam does) and does not put them on a wire (the sealed runners do)."* Its
   exhaustiveness over the part union is held by the compiler, not by prose: `DROPPED_PART_TEXT`
   (`:141`) is a mapped `Record<Exclude<TurnContentPart, {type:"text"}>["type"], string>` and the
   comment records the planted control (`TS2741` at that site when a member is added).

GATE-AUTHORING §10 forbids mirroring an enforcement rung that already exists; a gate arm over this
site would mirror `tsc`. Adding `entry/compose` to the seam population would additionally contradict
the recorded ruling.

### #1831 — the `structure.int` planted-OOM arm reds on main (ENOENT at `runArtifact`)

The arm was rewritten to the mechanism that exists now — which is exactly the row's stated
alternative done-criterion ("or the arm is rewritten … never deleted"). `c8ff56723` (2026-09-08,
"isolate lifecycle files and prove abnormal-run failure causes", #1862 — commit body: *"readiness
before SIGKILL, and real V8 OOM evidence distinct from harness timeout … structure 8/8 passed"*)
lands both repairs the row's hypotheses called for. Today's arm is
`tests/tooling/verify/ops/structure.int.test.ts:366-397`: the planted policy writes a readiness
marker from inside `evaluate` before it allocates, which proves the loader completed and the slot
exists before exhaustion; the child's `NODE_OPTIONS` is replaced (not merged) so the workspace's
16 GB ceiling cannot defeat the plant — the row's hypothesis (a). `df2a54b09` rewrote the file again
for the all-final roster and the arm survived.

**Stated limit:** this lane did NOT execute the suite (three build lanes live; the arm spawns a
deliberately OOM-ing child). The receipt is the commit that repaired it plus its own claimed green,
not a run of mine. If the orchestrator wants a run receipt rather than a repair receipt, that is a
one-arm `pnpm test:scoped tests/tooling/verify/ops/structure.int.test.ts` at a quiet barrier.

### #1970 — `caught-failure-ownership` converted with no §4.6 differential

The instrument is gone, by owner ruling. `b1e5e3e30` (2026-09-14) deleted **every** frozen-legacy-replay
differential on the owner's 2026-09-15 option-B ruling, quoted in the commit body: *"Those suites test
the TRANSITION, not the code; law §6.1 required every legacy example to be carried into declared rows,
so the rows are the oracle now."* The legacy runtime itself went at `df2a54b09`, so `runPass`,
`loadGates`, `GateDescriptor` and `verify/index.ts`'s legacy re-exports no longer exist — the legacy
descriptor cannot be replayed at any SHA without resurrecting a deleted runtime.

**Say this plainly rather than letting it read as closure:** the row's substantive question — whether
the 23 findings the conversion lane called "pre-existing debt" were each also findings under the
legacy classifier — is now **permanently unmeasurable**, and one counter-example (a lost suppression
at `engines-ctl.ts`, verifier D1) was already found. That is a ruled, accepted loss of evidence, not
a resolved question.

### #2004 — `gate-modernization` ARM E walks the descriptor subtree

Fixed at #1958. `tooling/src/verify/gates/gate-modernization.ts:299-305` states the repair in its own
words — *"THE SUBTREE IS THE WHOLE MODULE, not the descriptor literal (#1958) … scanning only the
literal left the one-line extraction (`function isX(node) { return node.getType()… }`) as a free
evasion"* — and `armSyntaxAnalysis(obj, sf, ctx)` at `:304` tests `readsTypes(sf) || importHopReadsTypes(sf)`
over the SourceFile, with the one relative-import hop added as well. ARM A's legacy branch and ARM C
were retired at `#2367`. The row's second ask (correct the `fix` text, update #1971's recorded
refusal) is discharged by the arm now meeting its own claim.

### #2027 — `test-no-stubs` recognizes a literal four-member call set

Fixed, and the header cites this row by number.
`tooling/src/verify/gates/test-no-stubs.ts:24-32`: the recognizer is now the shared
`lib/test-call-shape.ts#isTestCallShape` — *"the bare `test`/`it` root or a chain whose member read
directly off the root is a Vitest modifier (`only`, `concurrent`, `each`, `for`, `runIf`, `skipIf`, …),
walked THROUGH call-returning factories (`test.each(table)(name, fn)`) and tagged-template tables"* —
and `audit-client-tests` reads through the SAME module, so the two now share a family rather than a
duplicated literal. The trap the row existed to prevent (retiring `audit-client-tests`' arm as
"redundant") is closed by the merge happening through the shared reader instead.

**Residual worth a row, found while re-deriving:** the same header records a live tool error one hop
away — for a call-returning stub, `audit-client-tests` *"reports the token `test.each([1])`, which the
waiver sink refuses, so that policy WITHHOLDS — a pre-existing tool error recorded outside this
module, measured 2026-09-13."* A withholding owner is not a verdict. I found no open issue naming it.

### #2063 — `no-blanket-suppression` split; `suppressions` grant-home

Both halves landed, and the blocker the SPLIT ruling was built around dissolved rather than being
worked around. `tooling/src/verify/gates/no-blanket-suppression.ts:369-377` is a single final policy
(`authority: "hard"`) declaring `resources: [{ kind: "tracked-files" }, { kind: "json", id: "biome" },
{ kind: "authored-text" }]` — arm C's staged-blob read got a declared ResourceHost kind, so no arm was
left legacy and no split was needed. `suppressions.ts:13-22` records the other half: *"WHAT WAS HELD
BEFORE: a committed BOTH-WAYS PER-FILE COUNT RATCHET (`suppressions.baseline.json`, 281 file rows) …
WHAT IS HELD NOW: `authority: "reviewed-grant"`, one finding per `(rule, scope)` class, one exact
grant row per ruled class in `lib/reviewed-grants.ts`. No baseline, no counts, no gate-owned table."*
`tooling/src/verify/gates/*.baseline.json` matches nothing. The burnable rows were burned
(`:42` — "FIVE were genuinely fixable and were FIXED IN THIS COMMIT, never granted").

### #2072 — three unpinned fences in `no-raw-zustand-persist`

All three are pinned, each row naming the row's own ledger id:
`no-raw-zustand-persist.ts:488` is L1 (ARM B's fail-closed third answer — *"hardcode `unreadable:
false` in `destructiveCandidate` and the same one finding carries the ordinary `MESSAGE` instead — a
bare `{ count: 1 }` stays green through that cut … so the `messageIncludes` is the pin"*), `:578` is
L2 (ARM C's acquittal half — *"cut that `=== \"other\" ? null :` acquittal and this call is reported
on the unreadable text"*), `:587` is L3 (the `declaredByFile` guard — *"cut that guard and this call
flags"*). Each states its cut direction, which is the row's requirement. The module carries 18 proof
rows.

### #2126 — rewrite `GATE-AUTHORING.md`; make `gate:new` scaffold `defineGate`

All three deliverables landed, and the coupled site the row's own comment flagged was honoured.

1. `tooling/src/verify/gates/GATE-AUTHORING.md` (`updated: 2026-09-13`) opens *"This is the
   mechanism-first guide for `defineGate`"* and is organised exactly as the row specified (§0 mechanism
   table, §1 contract and reporting, §3 population/analysis/resources, §4 the three authority doors,
   §5 proofs, §11 the enforcer-per-mechanism table).
2. The legacy content moved verbatim to `docs/history/gate-authoring-legacy-2026-09-13.md`, and the
   new guide names it at the top as conversion archaeology, never a template.
3. **The path was kept**, which is what the comment demanded: `eslint-grant-liveness` and
   `depcruise-grant-liveness` cite this file as reviewed `cite: GATE_FIXTURE_LAW` with a live
   dead-cite arm, so a move would have redded both.
4. `tooling/src/verify/ops/new-gate.ts:1,10,44,56,97` emits a `defineGate` final policy with explicit
   `facts`/`resources`, a `mustFlag`/`mustPass` pair, and a family decision forced at the command line
   (`--singleton-reason` XOR `--family-of … --dependency`), never interactively. The red-first pin is
   `tests/tooling/verify/ops/new-gate.test.ts`.

### #2170 — the tracked unapplied handover patch

Gone. `.claude/handover/` does not exist; the patch was removed at `ee165b3a7` ("reconcile gate proof
and tier authority", #2109/#2170/#2287), which is the same commit that landed #2109 — the row's own
preferred resolution ("delete … or rewrite it against the current tree in the same commit that lands
\#2109").

### #2179 — a hand-written prose COUNT of a set a ratchet already polices

Items 1 and 2 landed; item 3's enforcement rung landed as the rule rather than as a sweep.

- **Item 1 (the instance).** The census is deleted from the live header and replaced by the
  re-derivation command. `tooling/src/verify/lib/tenancy-scope.ts:30-40`: *"THE CENSUS IS NOT WRITTEN
  HERE, ON PURPOSE (#2179) … The two-sided ratchet polices the SET; nothing polices a hand-written
  count OF that set, so any number written here rots on the schedule of schema change. The
  authoritative answers are therefore the ones a machine computes, never a sentence"* — followed by a
  literal `node -e` one-liner that groups `TABLE_SCOPING_ROWS` by `scope`. The surviving "87"s at
  `:18` and `:31` are a deliberately quoted historical paragraph, labelled as such.
- **Item 2 (the class rule).** `GATE-AUTHORING.md:249-253`: *"A comment may quote a count of a set
  only when something derives that count at read time, or when the comment carries the command that
  re-derives it and the date it was taken … A two-sided ratchet polices the set, not a prose count of
  it (#2179). A dated one-time measurement is legitimate when it says it is a snapshot, with its date
  and method."*
- **Item 3 (the corpus sweep).** The scout's two other candidates re-check clean and are not the
  class: `persisted-store-registry.ts:382` and `ownerid-registry.ts:200` carry `count:` values inside
  **proof rows**, which conformance re-derives by failing — the sanctioned `count`/`countFrom`
  mechanism, not prose. **Residual:** no whole-corpus sweep of the other 337 headers is recorded. It
  is now prose-plus-review enforced by §7 rather than mechanically; if the orchestrator wants it
  mechanical that is a new row, not this one.

### #2181 — CSS train lane 1 (`css-length-tokens` · `css-family-ownership` · `css-var-defined`)

All three are final `defineGate` policies with `authority: "ordinary"`. The count ratchets the row was
minted to convert are gone with the legacy runtime; the conversion rode the Codex CSS lane named in
this row's own last comment ("Codex-primary is taking over the remaining #2181 work after Claude B's
final drain … the existing warm Codex CSS lane will handle these two modules as one coordinated
ownership area"). Nothing in the row's remaining text names an artifact that still exists.

### #2183 — CSS train lane 3 (`playwright-css-topology` · `sanctioned-css-homes`)

Both are final, both `authority: "hard"`. Three separable pieces of this row all landed:

- The **build-first prerequisite** from the §5b audit comment — `ParsedCss` could not answer "what
  does this sheet import" because statement at-rules produced no fact. `lib/css-rules.ts:52` now
  declares `readonly statements: readonly CssStatementAtRule[]`, populated at `:227-246` via
  `pushStatement`.
- The **gate-to-gate import** the row flagged as "out of #2096's reach only while both are legacy" is
  gone: `playwright-css-topology.ts:6` now references the sibling only in prose, as a family member.
- The **`SANCTIONED_HOMES` tables** are retired rather than ported as population subtraction, across
  the corpus — `raw-spacing-tier.ts:22` records that the shape *"was named `SANCTIONED_HOMES` until
  the Phase F cutover"*, and modules such as `bus-channel-primitive.ts:19,35` and
  `single-stream-transport.ts:32` state per-row whether their table became an exact grant or was
  deleted as a detector artifact.

### #2342 — refusal coverage loses aliased arrays and miscounts empty spreads

Landed at `bad5baab8` (2026-09-13, cherry-picked from `e46d015986`), whose body is the row's required
behaviour verbatim: *"Preserve absent, empty, nonempty and unreadable states through const/import/re-export
aliases and spreads; refuse unaccounted array effects. Known elements beside unknown spreads prove
presence without claiming an exact element list."* The module header now carries the same contract at
`policy-refusal-coverage.ts:71-80`, including the `#2342` note that *"presence needs a stronger use
query than binding identity"*. The row's own comment records the red-first production-dispatch run
(exit 1, 13 failed / 12 passed) taken before implementation.

---

## B. RE-FILE — still real against the final contract

Each block is a body a lane can be dispatched from as-is. Priorities and areas are proposals.

### #1089 — FLIP-inversion outside the §1.5 exception list · P3 · Tooling

**Still true.** The law is intact and unambiguous
(`docs/architecture/core/motion-and-animation-guide.md:200-221`: *"Two sites, and they are the whole
exception class … Anything else that reaches for JS to move pixels is a defect, not a third member"*),
and nothing enforces it. Repo-wide, `.style.transform =` occurs at exactly two lines, both the
sanctioned one: `packages/ui/src/primitives/tabs/tabs.tsx:96` (the write) and `:103` (the clear). No
gate module mentions `offsetWidth`, forced reflow or FLIP inversion.

Re-cut body:

> The §1.5 FLIP-inversion exception class is prose-only. Make it structural: a final `defineGate`
> policy flagging a `.style.transform =` write followed by a forced-reflow read
> (`offsetWidth`/`getBoundingClientRect`) in the same block, outside the one sanctioned declaration.
> `population`: `@ui` + `@client`. `analysis: "syntax"`. `execution: "selected-files"`.
> `facts: []`, `resources: []`. `family`: singleton with a stated reason — no sibling judges a
> transform write. **`authority: "reviewed-grant"`, not an allowlist**: the §1.5 list is a ruling, so a
> third genuine FLIP site is an exact `(subject, operation)` grant row in `lib/reviewed-grants.ts` with
> `why` + `endsWhen`, which also gives the rename tripwire the prose list cannot. Born green: the tree
> has exactly one matching site (`tabs.tsx:96`) and it is the grant. Proofs: `mustFlag` with `count` on
> a planted write+reflow pair outside the home; `mustPass` on `use-list-track-flip.ts`'s CSS-owned
> shape (it writes no transform and must never flag); `mustPass` on a transform write with no reflow
> read. Coupled sites: the §1.5 exception list is the ruling of record — amend it and the grant
> together, never one alone.

### #1196 — manual query-loading branches dodge `QueryBoundary` · P3 · Client

**Still true, and the existing policies are a different subject.**
`query-boundary-reservation` and its `-health` sibling judge a boundary that EXISTS — whether its
`SkeletonRows` fallback reserves a static count (`query-boundary-reservation.ts:1-3`). Nothing judges
a surface that never mounts a boundary at all, which is the #1188 refinery-flash shape. Sizing:
122 `.tsx` files under `packages/client/src/features` reference `isPending`/`isLoading`; 115 files
reference `QueryBoundary`. The two sets overlap heavily, so this is a census row before it is a gate
row — a raw hit is not a defect.

Re-cut body:

> Census first, then gate. (1) Census: under `packages/client/src/features/**`, classify every
> `isPending`/`isLoading`/`data === undefined` read that GUARDS a JSX return against one that feeds a
> prop (a disabled button, a spinner inside a settled box). Only the first class is the defect. Report
> the split with `path:line`; 122 candidate files is the denominator, not the finding count. (2) Only
> if the defect class is non-trivial, a final policy in the `query-boundary-reservation` family
> (shared reader `lib/query-boundary-vocabulary.ts`): `population: @client under features/**`,
> `analysis: "syntax"`, `execution: "selected-files"`, `authority: "ordinary"` (a genuinely
> boundary-free surface is waivable at the reported condition), `severity` per the census size — if the
> live count is large, the §5 transition shape (`ordinary` + `warning` + a live `workItem` over the
> WHOLE population, flipping to `error` at the last chunk), never a narrowed population. Proofs: a
> planted guard-return (flag), a planted prop-feeding read (pass), a `QueryBoundary`-wrapped surface
> whose child reads `isPending` for a nested concern (pass). **If the census finds the class is thin,
> the correct outcome is a refusal with the numbers, not a gate** — GATE-AUTHORING §10.

### #1257 — make the recession contract enforceable · P3 · Client/Tooling

**Still true.** `packages/ui/src/lib/receded-ink.ts:26` exports `RECEDED_INK = "text-muted-foreground"`
— the enumerable import the row's whole design depends on — with 10 consuming files across
`packages/`. No gate or lens judges it, and the three founding defects are still detectable only by a
colour-comparing CT that happens to exist.

Re-cut body:

> The `RECEDED_INK` constant (`packages/ui/src/lib/receded-ink.ts:26`, 10 consumers) makes "who asked
> to recede" enumerable, which is the precondition this row was parked for. Design a detector over it.
> Prefer the LENS tier first (`pnpm ast`), not a gate: the property being asserted is
> "a composite pairing a named-ink action with a transparent-intent trigger carrying no ink of its
> own", which is a design judgement with a measured false-positive risk — #969's ~283 legitimate sites
> are the negative control and a detector that reds them is wrong. Positive controls, all three known
> instances: `row-actions-menu`, the character-filter pair, `corpus-hit-rows` `RoomDoor`. Only promote
> to a final policy once the lens measures acceptable precision on those two populations; a
> name-keyed shape already measured 2.4 % precision on an adjacent problem (#1630), so state the
> measured precision before proposing the gate. If the lens cannot separate the classes, the honest
> outcome is a documented refusal plus the CT obligation ("a file whose prose declares a two-weight
> ruling owes a CT asserting the two inks differ") carried as review law.

### #1332 — name the cycle / declared-dependency authority in writing · P3 · Tooling (docs)

**Still true in all three sites.** `knip.ts:36` still reads *"dep-cruiser's recommended-strict
no-circular is the gate; knip's view is the report twin"* with `cycles: "warn"` at `:37`, and says
nothing about biome. `.dependency-cruiser.cjs` contains **no occurrence of "circular" at all** (the
rule comes from the `recommended-strict` preset), and its header mentions biome only for
`no-inline-types` (`:29`); the dependency-declaration half the row's own correction comment flagged is
already there at `:779` (*"biome noUndeclaredDependencies + review carry it"*). `biome.json` carries
no comment beside `noUndeclaredDependencies` (`:77`) or `noImportCycles` (`:270`).

Re-cut body is the original #1332 body unchanged, minus the refuted claim its own comment corrected:
dep-cruiser HAS already deferred on dependency declaration (`:779`); it has NOT on cycles. Three
comment edits, no severity change, NON-GOAL: turning any rule off or moving an exemption.
Hazard unchanged: `biome.json` is consumed with `json.parser.allowComments: true`, so confirm
`pnpm lint` and `pnpm format` both still parse it, and run scoped biome + `pnpm exec eslint` on the
touched root files.

### #1337 — root gate configs have no §0.3 reading-set entry · P3 · Docs

**Still true.** `docs/architecture/core/AGENTS.md` §0.3's rows cover server domains, identity,
providers, db, gates (`tooling/src/verify/gates/**`), tooling (`anything under tooling/`), client, ui
primitives, types, tests, ledger edits, doc edits and the concept-home lookup. A repo-root config
(`eslint.config.js`, `biome.json`, `.dependency-cruiser.cjs`, `knip.ts`, `lefthook.yml`, `jscpd.json`,
`vitest.config.ts`, `playwright*.config.ts`) matches none of them: it is not under `tooling/` and not
a gate module. Re-file the original body verbatim; its density table, its explicit NON-GOALs (no D141
gate, no repo-wide comment slimming — owner word) and its hazards (one table row only; the
constitution is auto-loaded into every dispatch) all still apply. Pairs naturally with #1332, which
edits three of the same files.

### #1625 — zustand selector double-report · css-rules brace scanner · P3 · Tooling

**Half (2) is SUPERSEDED; half (1) narrows to one decision plus one stale claim.** Re-file the
narrowed row.

- **The css-rules half is answered by a different, stronger route.** `lib/css-rules.ts:157-172`
  (`readDeclarations`) still has no quote tracking — but no sheet with a quoted delimiter ever reaches
  it. `ops/resource-tree.ts:35-41` (`quoteProblem`) refuses any stylesheet whose quoted value matches
  `PARSER_DELIMITER = /[{};]/u`, returning *"a quoted delimiter or escaped quote is outside the shared
  CSS parser's supported grammar"*, and the file's header (`:19-25`) states the posture: *"Reject
  constructs its scanner cannot preserve faithfully instead of returning a partial rule set."* A
  `content: "}"` is now a loud malformed-resource tool error that withholds its owner, not a silent
  corruption of `cssInventory`. That is the standing law's required shape; do not re-open it as
  "add quote tracking".
- **The zustand half.** Both policies are final and the double report is now a RECORDED decision:
  `zustand-selector-derived.ts:19-25` — *"THE OVERLAP IS DELIBERATE AND PRE-EXISTING … Narrowing
  either side to de-duplicate would delete a catch … THE MERGE CANDIDACY IS REAL AND IS NOT THIS
  MODULE'S TO TAKE (§8.3): one policy carrying the sibling's type subject AND this policy's
  output-set reader would subsume both, which means RETIRING a converted module with a successor
  proof — an orchestrator call, raised on #1584 at conversion time."* #1584 closed without taking it.
- **A stale guarantee claim found while re-deriving.** `zustand-selector-stability.ts:29` still reads
  *"`zustand-selector-derived` — the one policy that would share it — is still legacy."* It is not;
  it is final. That sentence is the module's stated reason for being a singleton.

Re-cut body:

> Two items, one lane, one commit. (1) **Take the merge call #1584 left open.** Either merge
> `zustand-selector-derived` and `zustand-selector-stability` into one policy carrying the sibling's
> type subject AND the output-set reader, retiring one module with a successor proof (§8.3 / §9 "final
> importer disappears"); or record a durable REFUSAL in both headers stating why the double report is
> permanent. Not a third option: neither module may narrow unilaterally — each sees a shape the other
> cannot (`derived` reads the body's full output set; `stability` resolves the store-hook TYPE). (2)
> **Fix the stale singleton justification** at `zustand-selector-stability.ts:29`, which claims the
> sibling "is still legacy". Per GATE-AUTHORING §7 a header that asserts a guarantee owes a control or
> a plain statement that nothing enforces it; a singleton reason that is factually false is the
> weakest form of that. If the merge lands, both headers are rewritten anyway.

### #1630 — fixture helper returning `unknown` or double-casting is RED · P3 · Tooling

**Still true.** `no-test-fabrication` exists and is final, but its subject is the cast expression in a
test body: `NON_FABRICATING_CAST_TARGETS` (`:21`) and its rows (`:101-103`,`:140`) all anchor on
`X as unknown as Y` / literal-`as` inside a `tests/**` module. The row's subject — a fixture HELPER
whose declared return type is `unknown`, so the cast never appears in the test at all — is exactly
what that policy cannot see, and the row says so. Nothing else in the corpus judges it.

Re-cut body:

> A test fixture helper that returns `unknown`, or double-casts its literal, defeats every downstream
> type obligation: the two rpg CT fixtures spelled `rpg.getGame` behind `: unknown` with 1-of-6
> `RpgStatProfile` fields and an unmintable `ruleset: "d20"`, and replacing them with a builder that
> parses through `rpgGameConfigSchema` turned three silent holes into `TS2741`/`TS2739`. Add a final
> policy — **not** an arm of `no-test-fabrication`, whose population and node subject differ:
> `population`: `@tests` under `support/**` plus `*.fixtures.ts`/`*.fixtures.tsx`/`fixtures.ts`.
> `analysis: "types"` (the claim is about a declared/inferred return type, not a spelling).
> `execution: "selected-files"`. `authority: "ordinary"` — a genuine parse-boundary helper is waivable
> at the reported return-type token with a reason, which replaces the row's original "gate's own escape
> marker" (final policies have no private markers). `family`: share `lib/test-call-shape.ts` or the
> shared origin readers with the test-harness family if a real production dependency exists, else a
> stated singleton. Proofs: a helper declaring `: unknown` (flag, exact count + token); the same helper
> returning `RpgGameView` through the schema (pass); an exported const annotated `unknown` (flag); an
> `as unknown as T` inside the helper body (flag — this is the case `no-test-fabrication` misses
> because the cast is not in the test); a parse-boundary helper carrying the waiver (pass, zero
> effective findings, zero authority alarms). **Do not overlap-and-forget:** state in the header, with
> `file:line`, exactly which shapes `no-test-fabrication` owns and which this one does. Census + the
> 2.4 %-precision measurement that killed the name-keyed alternative:
> `docs/reviews/misc/2026-09-05-derived-field-fixture-parity.md`.

### #1633 — jsx-a11y resolves `Switch` → `button` · P3 · Client lint

**Still true, and the row's own proposed fix is the half that is already there and inert.** The hold
is lifted (#1584 closed; `eslint.config.js` is editable). But:
`eslint.config.js:764-768` still maps `components: { … Switch: "button" … }`, and
`control-has-associated-label`'s `ignoreElements` (`:796-812`) lists `"Switch"` **and does not list
`"button"`**. Since the components map rewrites the element before the rule sees it, the `"Switch"`
entry cannot be what makes a `<Switch>` pass. The live consequence is documented in product code:
`packages/client/src/features/plugin/components/plugin-leaf-nodes.tsx:322-331` — *"`jsx-a11y` resolves
`Switch` to `button`, which its `ignoreElements` list does not carry, so removing it reds
`control-has-associated-label` … Kept as a LINT obligation, not as an accessible name."*

Re-cut body:

> The hold is lifted; the defect is not. `eslint.config.js:768` maps `Switch: "button"` for jsx-a11y
> and `control-has-associated-label.ignoreElements` (`:796`) carries `"Switch"` but not `"button"` —
> so the entry that looks like the fix is inert, and a measured-DEAD `aria-label` on a `<Switch>`
> inside a `<Field>` (Base UI's `aria-labelledby` outranks it; measured at
> `tests/client/a11y/field-control-name.suite.ct.tsx`) is load-bearing for lint only. **Step 0 is a
> MEASUREMENT, not an edit:** confirm by planting — remove one `aria-label` and run
> `pnpm exec eslint <that file>` — that the rule fires and that adding `"Switch"` to `ignoreElements`
> does nothing. Then take exactly one of: drop the `Switch: "button"` map entry (it exists to give
> jsx-a11y a role for OTHER rules — check what else it serves before cutting), or add `"button"` to
> this rule's `ignoreElements` with a comment naming the render-time `aria-labelledby` injection the
> rule is structurally blind to. In the SAME commit remove the now-unneeded attributes and the
> "lint obligation, not a name" comments. Floor: `tests/client/a11y/field-control-name.suite.ct.tsx`
> and `accessible-name-quality.suite.ct.tsx` (a CT, because the claim is about the rendered accessible
> name), plus `pnpm exec eslint` on every touched file. **Hazard:** `eslint.config.js` is
> hand-authored and liveness-gated by `eslint-grant-liveness` — a file-exact path or ignore entry that
> names nothing becomes a finding, so check that gate after the edit. Lesson for the header: run eslint
> AS WELL AS the accname measurement before removing a "dead" a11y attribute.

### #1656 — ban the `max-w-prose` utility · P3 · Tooling gate

**Still true, and the census in the row body is stale in the row's favour.**
`tooling/src/verify/gates/no-arbitrary-tw-values.ts` contains no `BANNED_UTILITIES` and no
`max-w-prose`. The class is no longer two transcript sites: repo-wide, the only **class application**
left is `packages/client/src/lib/message-bubble-class.ts:37` (`cn("w-fit max-w-prose rounded-card
px-block py-row", …)`), and that site carries its own refusal at `:25` — *"`max-w-prose` STAYS HERE,
AND IT IS THE ONE PLACE IT DOES (#1175, refused with a receipt)"*. Every other product hit
(`roster-member-surface.tsx:156`, `plugin-row-leaves.tsx:209`, `tag-member-surface.tsx:100`) is a
comment recording a re-point AWAY from it. The third literal the row's comment predicted is real and
is not a class application: `tests/ui/lib/class-merge.test.ts:80`, a tailwind-merge conflict-pair
fixture.

Re-cut body:

> Extend `no-arbitrary-tw-values` with `BANNED_UTILITIES: Record<string, string>` keyed by the literal
> class token, seeded with `"max-w-prose"`: *Tailwind's 65 CSS `ch` is 93–101 typographic characters in
> Geist and satisfies no house measure. Body/teaching prose takes
> `max-w-(--reading-measure-prose)` ON THE PARAGRAPH; an editor's content column takes
> `max-w-(--width-content-col)`.* **Re-census before writing the policy — the #1656 body's "two
> transcript sites" is stale.** Today: exactly ONE product application
> (`packages/client/src/lib/message-bubble-class.ts:37`, refused with a receipt at `:25` citing #1175)
> and one non-application literal in a tailwind-merge fixture
> (`tests/ui/lib/class-merge.test.ts:80`). So the population is `@client` + `@ui` **source**, which
> excludes the fixture by construction — do not build an exemption for it. The one live site becomes an
> exact reviewed grant (`authority: "reviewed-grant"`, `why` = the #1145 transcript-bubble refusal,
> `endsWhen` = a transcript bubble cap is ruled) rather than a gate-local allowlist, which no longer
> exists. Born green: one finding, one grant, consumed exactly once. Proofs: a planted `max-w-prose`
> at an unruled path (flag, exact token); the ruled site under its synthetic grant (the reviewed-grant
> witness rerun — one consumed, zero effective, zero alarms); a class token that merely CONTAINS the
> string (pass).

### #1711 — `integer-line-boxes` ARM T extends to the spacing family · P3 · Tooling gate

**Still true.** `integer-line-boxes.ts:3-6` declares four arms (T/P/C/B) and ARM T judges `leading.*`
only — every finding message at `:131-163` is spelled `leading.<name>`. The word `spacing` appears
nowhere in the module. `tokens-contract.ts` touches `spacing.tight` only as a fixture anchor
(`:114-122`) and a proof-row expectation (`:185`), never as a snapped-integer belt. The weaker
enforcer the row names is still the only one: `tests/ui/tokens/index.test.ts`.

Re-cut body:

> ARM T of `integer-line-boxes` judges `leading.*` only
> (`tooling/src/verify/gates/integer-line-boxes.ts:79-163`). Since #1640 the whole `spacing.*` family
> (27 tokens + 8 `orb.pointerFine` arms) rides the same snapped belt and is integer-px at the 16 px
> root — but nothing makes a FUTURE fractional-at-root-16 spacing token unshippable, and `round(up)`
> on a fractional author silently GROWS the box at the default scale, which is the one thing the belt
> promises not to do. Extend ARM T: every `spacing.*` token must be a dimension carrying
> `$extensions["orb.output"].kind === "snapped"` whose resolved px at the 16 px root is an integer, and
> every `orb.pointerFine` arm on a snapped token must satisfy the same. Born green on the tree
> (27/27 + 8/8) — **re-derive both counts before writing the row's `count`, and prefer `countFrom`
> naming the vault reader over a literal** (§5, and #2179's rule against prose counts). Same family and
> same `token-contract` resource as the leading arm; `authority` stays whatever ARM T carries (a
> fractional authored step is not waivable if leading's is not — if they differ, that is a `-health`
> sibling, not a second authority in one policy). Proofs: a fractional `spacing.*` at root 16 (flag,
> message naming the resolved px so the author need not redo the arithmetic); a `spacing.*` dimension
> missing `orb.output: snapped` (flag); a fractional `orb.pointerFine` arm on a snapped token (flag);
> the live 27+8 (pass). `tests/ui/tokens/index.test.ts` keeps its claim as the weaker twin.

### #1719 — `duplicate-action-doors` cites lockdown §13 for the IA class · P3 · Docs/Tooling

**Still true, and there is now a THIRD coupled site the row did not know about.**
`client-architecture-lockdown.md` §13 is *"The event/sync spine (multi-tab · multi-device ·
multi-human)"* — not the more-than-one-door IA class. The citation survived conversion untouched at
`tooling/src/verify/gates/duplicate-action-doors.ts:104` (*"the §13 more-than-one-home IA class). See
docs/architecture/core/client-architecture-lockdown.md §13."*), and the same wrong subject is now also
in the catalog row: `docs/architecture/core/Core-Enforcement-Active-Gates.md:293` opens
*"issue #252 — the §13 more-than-one-home IA class made structural"*. `dangling-doc-cite` cannot catch
it because the section exists; only its subject is wrong.

Re-cut body:

> The IA class "more than one door for one action" has no §-home, and three sites cite
> `client-architecture-lockdown.md` §13 for it — which is the event/sync spine.
> Sites: `tooling/src/verify/gates/duplicate-action-doors.ts:104` (the `MESSAGE` constant, so it is
> also the operator-facing finding text) and
> `docs/architecture/core/Core-Enforcement-Active-Gates.md:293` (the catalog row). Mint or find the one
> home per the §0.3 router — `UI-Architecture-and-Layout.md` or `UI-Primitives-and-Reuse.md` — and
> repoint both. **Prefer an existing §ered home to minting one**; the class already has a structural
> owner (the gate) and a founding issue (#252), so what is missing is prose, not a new law. Doc edit
> owes the frontmatter block and a scoped `pnpm check:docs`; a law-doc edit additionally owes a catalog
> re-attest at the merge sha (the orchestrator's half). Floor: the `action-doors` family test
> (`tests/tooling/verify/gates/action-doors-family.suite.test.ts`) — the `MESSAGE` string is asserted.
> `dangling-doc-cite` will not help here and must not be widened to "the section's subject matches" —
> that is unrepresentable.

### #1734 — `membership-fan-guard` scans `domain/chat` only · P3 · Server/Tooling

**The class is still true; the named instance was independently fixed.** The conversion
deliberately preserved the fence — `membership-fan-guard.ts:31` declares
`population: { in: ["@server"], under: ["packages/server/src/domain/chat/**"] }` and its header
(`:8-14`) records a MEASURED byte-identical port (legacy 133 admitted, final 133 admitted, both
differences empty). So a room mutation emitted from any other domain remains structurally invisible:
`emitUserEvent` appears in 137 files under `packages/server/src`, most of them outside `domain/chat`.
The founding instance is remediated — `packages/server/src/domain/regex/verbs/attachments/attach-to-chat.ts:26`
still calls `ctx.emitUserEvent(ownerId, { type: "regexChanged", … })` but now also calls
`ctx.emitRoomRegexChanged(chatId)` at `:29` with the `#1733` comment (*"the OTHER audience plane …
without this every other member of this room kept the pre-attach rack until they reloaded"*). So this
is class prevention with no live defect, which is the honest sizing.

Re-cut body:

> `membership-fan-guard` is scoped by WHERE the verb lives (`domain/chat/**`), not by WHAT it mutates
> — so the room-affecting emit that violates the law it enforces is outside its population whenever it
> is raised from another domain through an injected chat op. The founding instance
> (`domain/regex/verbs/attachments/attach-to-chat.ts`) was fixed at #1733, so this is class
> prevention, not a live red. Scope the fan law by the MUTATED SUBJECT: a verb that writes a
> chat-scoped junction (the `TABLE_SCOPING_CLASSES` `membership`/`junction` rows already name them —
> `lib/tenancy-scope.ts`) and emits through the per-person op instead of the member fan. That makes
> this a `types` policy consuming `drizzleSchemaFact`, not a path fence, and it likely belongs in the
> `tenancy-scope` family rather than as a singleton. **Verify the premise before building**: census
> every `emitUserEvent` call outside `domain/chat` whose verb also writes a chat-scoped table, and
> report the count — if it is zero after #1733, say so and price the gate against a zero live
> population before writing it. Coupled sites: the §16 G12 row in
> `client-architecture-lockdown.md` describes the old scope ("under `domain/chat/**`"), and the
> `Core-Enforcement-Active-Gates.md` row must move with the population.

### #1832 — `snap session-daemon.int` flaky on the daemon re-boot path · P3 · Tooling

**Unresolved and unmeasured.** Not a gate row at all; it was parked on a dead-lane wake. The subject
still exists: `tests/tooling/snap/ops/session-daemon.int.test.ts`, and the cited branch is intact at
`tooling/src/snap/ops/session-client.ts:174` (`const { limits, errors } = sessionLimitsFromEnv(opts.sessionTtlMin)`).
No commit since the filing touches either file for this reason. This row needs a quiet-box
reproduction before it needs a fix, and this lane could not take it (three build lanes live).

Re-cut body: the original #1832 body unchanged. Wake replaced by a dispatch condition: **a quiesced
box**. Method: sequential passes (never `--repeat-each` on a node suite — the preflight's `vitest list`
dies on `--repeatEach`, exit 2), `pnpm test:scoped tests/tooling/snap/ops/session-daemon.int.test.ts`
run N times back to back from the repo root. If it reproduces, pin the race deterministically with an
injected clock/env (the env snapshot the re-boot reads versus the TTL kill's teardown order). If it
does not, record the load receipts on the row and park it with a wake on the next red.

### #1965 — deferred gate work anchored to design-doc coordinates · P2 · Tooling

### DO NOT CLOSE — this issue number is a live `workItem`

**Six of the eight original rows are discharged; two remain, and the row has acquired a hard
structural reason to stay open.**

- `query-freshness-coverage-debt.ts:17` declares `workItem: 1965`. Closing this issue reds the
  warning-liveness check at `pnpm check`. This is the only such citation across all 32 rows swept.
- **knob-wire-coverage, 5 rows: DISCHARGED.** The module converted (`:71-72`,
  `authority: "reviewed-grant"`, `severity: "error"`) and the five DEFERRED rows became exact central
  grants — `lib/reviewed-grants-depcruise-to-egress.ts:178-224`, each with `why` + `endsWhen` and an
  explicit *"Tracker: #2283"*, and its own header says it *"cites #2283 rather than a design-doc
  coordinate (#1965)"*.
- **contract-verb-presence, 2 rows: DISCHARGED.**
  `lib/reviewed-grants-singlestreamtransport-soleenvreader.ts:6-20` carries
  `contract-verb-presence:chat-room-overrides` and `:discovery-themes` as exact grants with
  `endsWhen: "a domain test invokes … or the verb is removed."` The archived-punchlist coordinate
  survives only as fix ADVICE in the message (`contract-verb-presence.ts:21`), not as a suppressing row.
- **query-freshness-coverage, 1 row: tracked by this issue** (`QUERY_FRESHNESS_DEBT =
  "automation.listChatActivity"`, `query-freshness-coverage.ts:11,17` — *"warning debt owned by #1965"*).
- **The "no ordinary-plus-warning exemplar" gap: CLOSED.** Six warning policies now exist and two are
  `ordinary` + `warning`: `policy-family-readers.ts` (`workItem: 2187`) and
  `policy-refusal-coverage.ts` (`workItem: 2327`). The transitional shape has copies.
- **STILL OPEN: the two `domain-freshness-plane` rows.** `:169` and `:239` still read *"the named
  candidate `bridge` row … Ends when that row lands"* / *"Named candidate `bridge` row. Ends with that
  read."* No issue exists for either. This is the row's own "same disease in an already-CONVERTED
  policy" section, unchanged.

Re-cut body:

> **Keep this issue OPEN**: `tooling/src/verify/gates/query-freshness-coverage-debt.ts:17` declares
> `workItem: 1965`, and the final contract requires a warning's work item to be live
> (`lib/workitem-liveness.ts`, `lib/board-citations.ts`). It is the durable tracker for
> `automation.listChatActivity` — a new automation fire lands server-side with no client bus event to
> drive invalidation; it ends when the bus carries the fire-arrival signal and the invalidation row
> lands. Remaining work beyond that: `tooling/src/verify/gates/domain-freshness-plane.ts:169` and
> `:239` each defer a real behaviour question to a *"candidate `bridge` row"* that does not exist as an
> issue — (a) an owner RENAME of a databank document emits only `databankChanged` (editor-only), so
> co-members see the stale title until reload; (b) whether regex script CONTENT edits owe a room fan
> needs its own read of the display path (which tier re-renders, whether the member's transcript
> re-reads at all). File one issue per question with the owner ruling cited (bridge design §8 + fork
> F-E, 2026-08-14) and repoint both `why` strings; both are policy DATA, not exception rows, so no
> authority change is involved.

### #1967 — gate family tests run at `--full` only · P2 · Tooling

**Confirmed verbatim against `pnpm verify --list` today** (exit 0):
`structure:policy-conformance [structure] scopable` appears in `changed`, `static`, `push` and `full`;
`tests:tooling [tests] whole-only` appears in `full` ONLY. No `tests:instrument-affected` tier exists.
So every proof a policy carries that a declared row structurally cannot express — the §4.2
production-dispatched identity arm (`waivedFindings === 1`, `authorityAlarms === []`), the central
grant-table wrong-identity/duplicate/stale boundaries, the §4.5 refusal and receipt pins — runs at
`--full` and nowhere else, exactly as filed.

**One framing in the body is now stale and must not be re-filed as-is:** "167 final policies today,
104 legacy to convert … the exemplars are the transmission mechanism for the remaining corpus" is
dead — there are 339 final policies and zero legacy. The gap is no longer transitional risk; it is a
permanent property of the shipped runtime, which arguably raises its priority rather than lowering it.

Re-cut body:

> `pnpm verify --list` (re-derived 2026-09-19): `structure:policy-conformance` runs in
> changed/static/push/full; `tests:tooling` runs in `full` ONLY. A policy's declared `mustFlag`/
> `mustPass`/`mustRefuse` rows therefore bind at every tier, but everything a row cannot express —
> the §4.2 identity arm through `runPolicyPass`, the central grant-table identity/duplicate/stale
> controls, the §4.5 refusal and receipt pins — binds only at `--full`. Measured cost, twice, five days
> each: `tests/tooling/verify/gates/registry-family.test.ts` red from `ab675b23b` (95 refused proof
> rows across eight policies, #1953) and `tests/tooling/static-class-consumers.int.test.ts` red from
> `1416f2c98` (#1956). Both commits ran and passed their named scoped floor; neither touched a family
> test, which is why the per-conversion floor rule did not fire. **The `--full`-only placement of the
> instrument battery (#1842) was right for its own reason and is not being reverted.** Price these
> three shapes and take one: (1) **route by diff** — a commit touching `tooling/src/verify/**` runs the
> affected family tests in its floor, using the source-to-test mirror the repo already computes; (2) a
> **`tests:instrument-affected` tier** at static/push carrying only the family tests for changed gate
> modules and their `lib/` readers, leaving the rest of the battery at `--full`; (3) a **narrow
> cross-check** for the CSS instance (`css-family-proof-fixtures.ts:17-18` deliberately spells the
> production baseline as literals so a manifest bump cannot self-launder — a cross-check preserves that
> and removes the silence). Shape 1 or 2 closes the class; shape 3 closes one instance. Not exclusive.
> Note against the original body: the program is CLOSED, so "104 legacy to convert" and the exemplar
> transmission argument are retired — this is now a standing property of 339 final policies, not a
> migration risk.

---

## C. KEEP PARKED — a different, still-false wake condition exists

### #2283 — knob-wire-coverage's five DEFERRED rows need a tracker that outlives #1584

**Not on the handed list; found by the widened Parked sweep.** Its definition of done offered three
routes per row, and the middle one was taken: all five became exact reviewed grants with `why` and
`endsWhen` in `lib/reviewed-grants-depcruise-to-egress.ts:178-224`. The gate itself is
`reviewed-grant` + `severity: "error"` (`knob-wire-coverage.ts:71-72`), so no warning and no
`workItem: 2283` exists — closing this issue would not red `pnpm check`.

**But it is still a live tracker by citation**, which is precisely the #2070 class this row was minted
to prevent: five `endsWhen` strings end *"Tracker: #2283."* Closing it turns all five into references
to a closed issue.

**Restated wake condition:** *the five knob grants' `endsWhen` conditions come true (the wiring
lands and central liveness reports each row stale) or the five `endsWhen` strings are re-pointed at a
successor tracker.* Concretely, the five subjects: `A:importSkipCharacters` (`domain/import` consumes
`getEffectiveConfig().importSkipCharacters`), `A:allowNonOwnerLocalCompute`, `B:profile` (a user still
cannot set their own avatar — `profile.avatarAssetId` is live-read with zero writers),
`B:groupDefaults` (the section-patch WRITE path), `B2:importSkipCharacters` (no admin-surface write
field). Each is real product work, not bookkeeping.

---

## D. Findings raised by this re-derivation that own no row

Not dispositions; new defects found while re-deriving. Each owes its own issue if the orchestrator
agrees.

1. **Two conversion-suite headers promise a differential their code no longer contains.**
   `b1e5e3e30` removed the legacy-replay arms per TEST ARM rather than per file, and two headers kept
   the deleted promise. `tests/tooling/verify/gates/freeze-provenance-conversion.suite.test.ts:11`
   still lists *"3. §4.6 DIFFERENTIAL — every legacy example replayed through the frozen legacy
   descriptor and through the final family names the same NODES"*, and the file's only imports are
   `policy.ts`, the two gate modules, `policy-pass.ts` and `policy-conformance.ts` — no legacy runtime,
   and its three surviving `test(` blocks are proof-runtime, waiver-identity and withholding. Same
   shape at `mixed-hook-singletons-conversion.suite.test.ts:2`. GATE-AUTHORING §7: a comment asserting
   a guarantee owes a control that fails when the property is removed, or must say plainly that
   nothing enforces it. Cheap fix, two header edits.
2. **`audit-client-tests` withholds on a call-returning stub.** Recorded inside another module's
   header (`test-no-stubs.ts:31-32`): for a `test.each([1])(…)` stub it reports a token the waiver
   sink refuses, so the policy WITHHOLDS rather than reporting — measured 2026-09-13. A withheld owner
   is not a verdict, and I found no open issue naming it.
3. **`#1584`'s closure is load-bearing on one live citation.** Stated above under #1965 and repeated
   here so it is not missed: `query-freshness-coverage-debt.ts:17` is `workItem: 1965`.

## Method and limits

- Every issue was read via `gh issue view <n> --json title,body,comments` — BODY and comments, not
  title. Two rows would have been misdispositioned on title alone (#1753 has an EMPTY body; #889's
  answer is only in its comment).
- Code claims are `path:line` against `main` `047320b97`. Negative claims carry a second method:
  `rg --files-with-matches` plus a scanned-file count, never a bare zero.
- **Not run:** any behavioural suite. Three build lanes were live and the brief forbade whole-tree
  check/verify. The one row whose disposition would be strengthened by a run is #1831 (SUPERSEDED on a
  repair receipt, not a green receipt) — its re-run is one scoped file at a quiet barrier.
- This lane wrote no code, mutated no board row, and edited nothing but this file.

## #1196 — the manual query-loading-branch census, and why it does not become a gate (lane client-AE, 2026-09-19)

The re-cut above set the order — *"Census first, then gate… If the census finds the class is thin, the
correct outcome is a refusal with the numbers, not a gate"* — and pre-authorised exactly one escape. The
census was run. **The class is not thin; the SEPARATION is what fails**, and it fails against the re-cut's
own `mustPass` rows, so this is a refusal on a different and stronger ground than the one anticipated.

### The numbers, with their scope receipts

Population `packages/client/src/features/**`, tree `58dc84478`. `ast-grep` reported
`scannedFileCount=622, skippedFileCount=0` on every scan below, which is the non-zero receipt a negative
claim owes; `-l tsx` only, stated deliberately — a branch that *returns JSX* cannot live in a `.ts`.

| measure | count | method |
| - | -: | - |
| `.tsx` files under `features/**` | 622 | `find` + the ast-grep scanned-file count |
| …referencing `isPending` / `isLoading` | 122 | `grep -rl` (the re-cut's own denominator, re-derived: **122, matches**) |
| …referencing `QueryBoundary` | 107 | `grep -rl` (the re-cut said 115; **re-derived 107** — record the delta, the row's arithmetic does not depend on it) |
| reads in a file with NO in-file `QueryBoundary` | 86 | `comm -23` of the two lists |
| **sites where such a read GUARDS rendered output** | **25** in 19 files | two `ast-grep` rules: an `if_statement` whose condition names the read and whose consequence returns a `jsx_element`, and a `ternary_expression`/`binary_expression` carrying JSX |

25 of 622 is the candidate set a `population: @client under features/**`, `analysis: "syntax"`,
`execution: "selected-files"` policy would report. **Nine of them are provably not the defect.**

### The nine, by the discriminator the prescribed policy cannot reach

- **Four are MUTATIONS, not queries** — and the syntax is byte-identical to the query form
  (`{x.isPending ? <spinner/> : <idle/>}`). The discriminator is two module hops away behind a house
  factory: `credentials/components/endpoint-inspector-dialog.tsx:92` (`useInspectEndpoint`),
  `imagery/components/imagine-body.tsx:176` and `:187` (`useExtractPrompt`, `useGeneratePicture`),
  `notifications/components/notification-inbox-row.tsx:227` (`useAcceptInvite`/`useDeclineInvite`/
  `useDismissNotification`) — every one a `createEntityMutation` (`use-imagery-mutations.ts:18,27`,
  `use-connections-mutations.ts:64`, `use-invite-actions.ts:13`). A `useMutation().isPending` branch is a
  button spinner; `QueryBoundary` is not its shape and never was.
- **Five read `isPending` as a PROP** — the state is owned by a caller the analysed file cannot see:
  `character/components/character-library-body.tsx:83`, `chat/anchors/character-gallery-dialog.tsx:69`,
  `chat/components/add-chat-document-dialog.tsx:157`,
  `discovery/components/corpus-archetypes-tab.tsx:176`,
  `world-info/components/book-attachments.tsx:248` (each declares `readonly isPending: boolean`).

Three more (`auth/surfaces/login-surface.tsx:48` `useAuthConfig`,
`chat/components/chats-with-character-pane.tsx:66` `useChatListCollection`,
`discovery/components/corpus-browse-view.tsx:135` `useCorpusBrowseCollection`) are query-backed only
through a house composite hook — in class, but reachable by the same cross-module walk the mutation four
need, not by reading the file.

**Measured precision of the prescribed shape: 16/25 = 64 %**, and that is the OPTIMISTIC reading — it
counts every remaining query-backed guard as a defect, when several hand-render the very `SkeletonRows`
a boundary's fallback would supply (`world-info/components/book-attachments.tsx:145` is literally
`{personasQuery.isPending ? <SkeletonRows count={PICKER_SKELETON_ROWS} shape="line" /> : null}`). The
re-cut asked for the measured precision before the gate was proposed, citing #1630's 2.4 %; 64 % with a
36 % permanent-waiver tail is a gate that does not know its own subject, and "gates land on a fixed tree"
means those nine become nine permanent exemption rows on the day it ships.

### The second refutation, which does not depend on the precision number

The re-cut names three proof rows, and the third is *"a `QueryBoundary`-wrapped surface whose child reads
`isPending` for a nested concern (pass)"*. **A per-file policy structurally cannot express it.** Whether an
ancestor mounts a boundary is a render-tree fact; `execution: "selected-files"` sees one file, and
in-file absence of `QueryBoundary` — the only test available — is exactly what 86 of the 122 files show.
`analysis: "types"` (the vocabulary is `["syntax", "types", "resource"]`,
`contract/policy-primitives.ts:6`) would decide the mutation-vs-query half and nothing at all about this
one.

### The refusal, and what carries the property instead

No policy is authored for #1196. The property the row actually wants is not *"a loading branch must go
through `QueryBoundary`"* — it is *"the settled box must not shift under the reader"*, which is the #1188
flash and the #885 `reserveKey` concern. That property is RENDERED, and it already has two owners at the
tier that can see it: `query-boundary-reservation` / `-health` for a boundary that exists, and the
per-rAF box census in `tests/client/features/app-shell/surfaces/app-shell.ct.tsx` for the shape a static
reader cannot reach at all. A boundary-free surface that flashes is caught there or not at all.

**Carried forward as review law rather than as a gate:** a feature surface that hand-rolls a query
loading branch owes a reserved box — the same obligation `reserveKey` states — and the place to assert it
is a rendered pin, not a syntax policy. The 16 query-backed sites above are the population a future
rendered audit would sample; they are recorded here so that list does not have to be re-derived.
