---
kind: review
status: active
updated: 2026-09-12
---

# v-legs-wave — adversarial re-verification of four Verify rows (#2047, #2050, #1950/#2051)

Lane `cb-v-legs-wave`, fresh context, read-only worktree at main's tip (`72e453b8c`). Every verdict below
rests on output produced in this session; nothing is quoted from the commits' own floors. All probes were
`cp f f.bak … mv f.bak f` inside this ISOLATED worktree — no shared-tree mutation, `git status --short`
empty before and after every phase.

## Baseline

`pnpm test:scoped` over `bus-pair`, `bus-fact-health`, `bus-payload-allowlist`, `id-brand-flow`,
`home-client-family`, `static-authored-value`: **6 files, 83 passed, no type errors** (exit 0).
`pnpm test:scoped` over `schema-fact-wave-1`, `tooling-front-door-family`, `session-channel-family`,
`home-server-family`: **4 files, 64 passed, no type errors** (exit 0).
`pnpm -s check:policy-conformance`: **237 final policies · 2688 proof rows · 0 failures · 131 grant rows ·
0 invalid** (exit 0).

## #2047 — `8bf81b7e2`, the bus plane's §5b.5 headers — CONFIRMED

- The commit is header TEXT: `git show --numstat` is 49 insertions / 0 deletions over three modules, and
  all 49 inserted lines match `^+//`. No predicate, proof row, message or ledger row moved.
- Re-derived the field BY HAND over the HEADER SPAN (everything before the first `import`), not by
  whole-file grep, with a SHA recognizer that accepts the 7–40-hex `<sha>^` / `<sha>~N` forms (the naive
  40-hex `\b` recognizer under-reported five of the twelve — instrument corrected before the census was
  read). Twelve modules of the wave-10 plane — the seven bus modules plus `no-fake-disabled-id`,
  `no-mint-via-cast`, `no-loose-id-cast`, `brand-in-name-position`, `no-raw-id` — are **12/12 FAMILY +
  POPULATION PORT + legacy SHA in the header span**.
- Two planted controls in the same invocation: (A) all three fields planted in a BODY line after the first
  import scores `- - -` while the whole-file grep counts the plant (the over-report shape the commit names);
  (B) the same three lines stripped from a real header scores `- - -` where the unmodified copy scores
  `FAMILY PORT SHA`. Both directions fire.
- The header CLAIMS are true of the code, not just present: `bus-belt-total` and `bus-consumer-belt` both
  declare `family: "bus-definition"`, `facts: [busDefinitionFact]`, and the
  `population: { in: ["@contracts", "@client", "@server"] }` their new POPULATION PORT paragraph states;
  `bus-producer-coverage` declares `family: "bus-fact"` with `facts: [busProducerFact, busDefinitionFact]`
  and a genuinely DIFFERENT population (`["@contracts", "@server"]`), which is what makes its
  roster-agreement refusal a real cross-check rather than a self-comparison.

## #2050 — `da79208b3`, ARM C's #944 third answer — CONFIRMED (with three unpinned polarities, below)

- **Throw probe.** `throw new Error(...)` planted at the head of `if (origin.kind === "unresolved")` kills
  **exactly one** proof row — `no-raw-zustand-persist mustFlag[5]`, `PASS TOOL ERROR [evaluate]` — and 16 of
  17 tests stay green. The new branch is reached by that row and by no other.
- **Readability flip, accusing direction.** Making the accused call readable and declared-by-file
  (`declare const held: RegisteredStore; held.reset()`) reds mustFlag\[5] with
  `expected one effective finding matching messageIncludes="CANNOT be established" but no single finding
  matched`. The pin tracks the UNREADABLE verdict, not a count.
- **Readability flip, sanctioned-door direction.** Making the BLINDFOLDED door's own callee unreadable
  (`opaque().reset()` inside `resetWithoutPersisting`) keeps the whole family **17/17 green** — the
  commit's "the blindfold is asked FIRST, of every answer" ordering claim holds; the sanctioned door is not
  accused when its callee is opaque.
- **Message disjointness, re-measured from the source literals:** MESSAGE 522 chars, UNREADABLE 339,
  neither contains the other, `"CANNOT be established"` present in UNREADABLE and absent from MESSAGE —
  identical to the commit's numbers.
- Note (not a defect): `reportReviewedGrantCandidates` reports ONE finding per `(subject, operation)` and
  uses the UNREADABLE text only when EVERY candidate in the group is unreadable. A registry file that
  already carries a proven unblindfolded reset therefore reports the new unreadable one as an extra line
  number under MESSAGE. That is the documented reviewed-grant granularity rule, not a regression.

## #1950 + #2051 — `ef32c26d0`, the `members.length === 1` fence — CONFIRMED

- **The cut.** `members.length === 1` → `members.length >= 1` in
  `tooling/src/verify/lib/reference-fact-writes.ts:538` (probe on the real file, restored) reds
  **exactly one** test in `static-authored-value.test.ts`; 8 of 9 survive, including the sibling
  read-only-name row `a read-only member call beside the literal resolves, in both readers`. The failure
  diff shows the FOURTH element — `readOnlyFirstHop` — flipping from
  `{kind: "unresolved", reason: "dynamic"}` to `{kind: "resolved"}` while the mutator, unnamed-member and
  deeper-chain elements stay `dynamic`. It is a TRUE fail-open (`readOnlyFirstHop.filter.push(2)` mutates a
  real array), so the new row is discriminating and the earlier `why` really was measuring the NAME test.
- **The folded #2058 half, re-cut independently.** Restoring the member-read classification in
  `lib/process-member-origin.ts` reds exactly `tooling-argv-front-door mustPass[4]` (14 tests, 1 failed).
  Restoring it in `gates/sole-env-reader.ts#readsProcessEnv` reds exactly its `mustPass[1]` (41 tests,
  1 failed). NOTE for the record: my first attempt at the sole-env-reader cut did not apply (the pattern
  missed the trailing `=== "unreadable"`) and produced a GREEN that was a non-result; the verdict above is
  the re-run with the cut confirmed present in the file.
- `classifyProcessMemberRead`'s new `read.value.receiver` access is guarded — the `read.kind ===
  "unresolved"` arm returns `"other"` at the top of the function.

## LEDGER ROWS (3 rows)

| # | Module / site | Finding | Receipt produced this session | Class | Suggested priority |
| - | - | - | - | - | - |
| L1 | `tooling/src/verify/gates/no-raw-zustand-persist.ts` — ARM B `destructiveCandidate` | **The #944 third answer on ARM B is LIVE but PINNED BY NOTHING** — the same hole #2050 just closed on ARM C, one arm over. Hardcoding `unreadable: false` at the arm-B return leaves `home-client-family` **17/17 green**, so a future edit fails the arm OPEN silently. The answer is reachable and currently correct: an opaque-receiver destructive reset (`opaque().setState(opaque().getInitialState(), true)`) reports one finding whose message contains `CANNOT be established`. | armed cut → green; planted arm-B unreadable fixture → passes with `messageIncludes: "CANNOT be established"` | §4.1 unpinned narrowing | P2 |
| L2 | same file — ARM C's acquittal half | **The new `classifyOriginRefusal(...) === "other" ? null :` acquittal is REACHABLE but UNPINNED.** Deleting it (always report on an unresolved origin) leaves the family **17/17 green**. Reachability proved: a bare local `function reset(): void {}` called inside the registry file takes the `"other"` arm and yields **0 findings** (a row expecting one fails with `expected at least one effective finding but got 0`). Without a `mustPass` row, dropping the clause would accuse every local `reset()` helper in the registry file and nothing would red. | mutation → green; planted local-`reset` fixture → 0 findings | §4.1 unpinned narrowing | P2 |
| L3 | same file — ARM C's `declaredByFile` acquittal | **`if (!declaredByFile(origin.value.declarations, reset.source)) return null;` is UNPINNED**: deleting the guard leaves the family **17/17 green**. Every existing ARM C `mustPass` row is fenced OUT by the earlier `registryFiles.has(...)` or `blindfolds` returns, so no row exercises "inside the registry file, but the `reset` member is declared elsewhere". | mutation (`declaredByFile` occurrences 3 → 2) → green | §4.1 unpinned narrowing | P3 |

All three are unpinned-fence rows, not behaviour defects: the shipped code behaves correctly on every
polarity I could construct. The class is exactly the one #2050 was minted from — a fence nobody can red.

## What I did not cover

- The commits' REAL-TREE numbers: #2050's `4 -> 4, zero unreadable` differential over the live `@client`
  program, and #2058's `check:structure` `effective 246 -> 232` delta. Both need a whole-tree run; I ran
  the scoped suites and `check:policy-conformance` only.
- `pnpm check:structure` (held per the brief until the orchestrator's go), `pnpm check`, and any behavioural
  product suite.
- The other nine of `ef32c26d0`'s eleven touched files (the `-health` `messageIncludes` drops, the
  `diagnostic-legibility` pointer edits, `session-channel-boundary*`, `broadcast-channel-origin`) beyond the
  family suites that cover them.
- Whether the twelve-module plane roster I censused for #2047 is the same twelve the commit meant; I derived
  it from issue #2047's own scope line (bus plane + the id/brand modules of wave 10) and it comes to exactly
  twelve.
