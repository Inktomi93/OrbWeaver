---
kind: review
status: active
updated: 2026-09-13
---

# #2319 continuation review — registry-definitions legacy replay

## Verdict on the reviewed commits

**REFUTED.** Commits `ade6f50ed`, `b9b51f43d`, and `808caf154` do preserve the complete frozen row counts for
the three tabled modules, assert the original-byte withholding receipts by named denominator, and distinguish final
finding arms through a closed label vocabulary. Three source-level defects prevent accepting the continuation as
written: the unclassified verdict is not asserted by exact name, the durable recipe still prescribes a prepend-only
twin that its own second table disproves, and the modal opener row promotes an unresolved-fixture artifact to a
`stronger-reader` differential despite its own completed fixture proving `0 -> 0`.

No tests were run in this review. The parent lane reserved the serial test run, and dependencies were absent when this
review began. This verdict is based on full source reads at `808caf154` and the frozen legacy sources named below; the
incoming run receipts were treated as claims, not reproduced evidence.

## Scope read

- Full committed test: `808caf154:tests/tooling/verify/gates/registry-definitions-legacy-replay.test.ts`.
- Full committed report: `808caf154:docs/reviews/gate-runtime/x-legacy-replay-2026-09-13.md`.
- Final owners: `modal-registry-completeness.ts` and `placeholder-copy-registry.ts` at `808caf154`.
- Frozen owners: both corresponding modules at `f5b222e10`, including all legacy examples.
- Required helpers: `registry-fact.ts` target/candidate resolution and `legacy-differential.ts` replay,
  classification, labeling, repair, and final-dispatch paths at `808caf154`.
- Governing law: `gate-runtime-read-first.md` in full, `gate-runtime-standardization.md` in full, and
  `gate-runtime-orchestrator-playbook.md` in full, plus the routed gate and verification-floor policy.
- The handoff at `/home/inktomi/.claude/bridge/to-primary/done/1103-FINAL-B-DRAIN-handoff.md` was read as a lead.

## Confirmed findings

### V-2319-C1 — the unclassified label is not asserted by name

The test and report claim that the anti-god-map replay refusal is asserted **BY NAME**. The row supplies
`UNCLASSIFIED-POPULATION-UNADMITTABLE` at
`808caf154:tests/tooling/verify/gates/registry-definitions-legacy-replay.test.ts:453-463`, but
`verdictViolations` at `:338-345` accepts any string matching `/^UNCLASSIFIED-[A-Z-]+$/`. Replacing the row's value
with `UNCLASSIFIED-WRONG` therefore leaves the verdict check clean. The report repeats the false exactness claim at
`808caf154:docs/reviews/gate-runtime/x-legacy-replay-2026-09-13.md:623-632`.

Expected: the run-row classification is bound to the exact closed reason
`UNCLASSIFIED-POPULATION-UNADMITTABLE`. Actual: only a broad spelling class is checked, so the declared reason can
drift without a failure.

### V-2319-C2 — the durable recipe contradicts the working twin

The recipe says to build the twin as `add + prepend` and says the module target forces the subject to prepend an
import (`x-legacy-replay-2026-09-13.md:483-490`). The implementation at
`registry-definitions-legacy-replay.test.ts:296-310` has two delivery modes: it repoints an existing unresolved
`#state` import, and prepends only when no such import exists. The report's later table correctly explains this at
`:556-563` and relies on repointing to preserve all placeholder row lines.

Expected: the reusable recipe tells successor lanes to inspect the legacy bytes and either repoint an existing import
or prepend a new one. Actual: its normative steps prescribe prepend-only delivery, which would duplicate the type
import in all eight placeholder fixtures and manufacture false line deltas.

### V-2319-C3 — unresolved opener import impersonates a stronger-reader differential

The frozen `modal-registry-completeness` `mustPass[2]` fixture imports `openModal` from `#state`
(`f5b222e10:tooling/src/verify/gates/modal-registry-completeness.ts:312-318`). The shared target twin does not repair
that dependency. The final reader requires `resolveCallableOrigin` to reach a module whose canonical export is
`openModal` (`808caf154:tooling/src/verify/gates/modal-registry-completeness.ts:95-110`), so the unresolved import is
ignored and the modal is reported unreachable. The row records that artifact as `stronger-reader` at
`registry-definitions-legacy-replay.test.ts:496-513`.

The committed constructed control supplies the missing module, repoints the import, and observes **zero findings**
(`:653-663`). That is the counterexample: once the intended opener dependency resolves, the same legacy example is
legacy `0` to final `0`. Gate-runtime law section 6.5 expressly requires fixture imports to resolve as intended and
forbids fail-closure on an unresolved import from impersonating an identity branch.

Expected: complete this row's twin with the canonical opener dependency, prove that completion is inert on the legacy
side, require final findings and tool errors both empty, and classify it `vacuous-both-zero`. Actual: the incomplete
twin's false accusation is recorded as changed behavior. The final policy's separate local-function `mustFlag` row
still correctly pins the real semantic upgrade and need not be weakened.

## Claims that held under source review

- The final test has 6 `modal-body-not-placeholder`, 13 `modal-registry-completeness`, and 8
  `placeholder-copy-registry` replay rows, matching each frozen descriptor's ordered `mustFlag + mustPass` corpus.
- Each driven table asserts legacy findings, legacy population, legacy tool errors, original-byte final withholding,
  legacy inertness, twin-alone behavior, final findings, final population, final tool errors, and a verdict.
- `armOf` uses a closed final-arm list and throws on an unknown arm. For the two reviewed final policies, the exact-case
  arm strings occur in the appended detail rather than colliding in the shared message prefix.
- The four deferred non-split owners retain exact original-fixture withholding checks. Their named lists describe the
  denominators missing from those particular first legacy examples: the chrome example already carries its zone tuple,
  and the no-parallel example already carries `SECTION_IDS`.
- The placeholder imported-definition retirement is supported by two discriminating source-level controls: adding one
  duplicate proves the resolved copy participates in the comparison, and replacing the resolved object with a builder
  proves genuinely unreadable definitions still fail closed.
- The anti-god-map legacy example cannot itself admit a modal member without changing the example. Its separate
  constructed successor supplies a member and asserts the god-map arm plus no tool errors. The remaining defect is the
  exact-name weakness in V-2319-C1, not the construction's predicate.

## Warm follow-up verdict

**CONFIRMED for the current repaired tree.** The three original findings remain valid findings against `808caf154`,
and all three are repaired in the current uncommitted continuation:

- V-2319-C1: `verdictViolations` now accepts only exact equality with
  `UNCLASSIFIED-POPULATION-UNADMITTABLE` (`registry-definitions-legacy-replay.test.ts:346-350`). The planted
  `UNCLASSIFIED-WRONG` receipt in `/tmp/codex-2319-expectations-red.log` fails the modal and home table rows at the
  verdict assertion, so the claimed reason can no longer drift behind the former regex.
- V-2319-C2: recipe step 4 now derives delivery from the legacy import, explicitly repoints an existing unresolved
  import, prepends only when no import exists, and requires other callable prerequisites before classification
  (`x-legacy-replay-2026-09-13.md:483-490`). The transient four-asterisk Markdown typo found during this follow-up was
  corrected before this verdict.
- V-2319-C3: the opener row now receives a canonical `openModal` export, repoints `#state`, checks completed-twin
  legacy inertness, requires no final finding or tool error, and declares `vacuous-both-zero`
  (`registry-definitions-legacy-replay.test.ts:365-406`, `:513-520`). The incomplete form remains a separate positive
  prerequisite control. `/tmp/codex-2319-denominator-opener-red.log` shows that reverting this completion restores the
  false unreachable-modal result and fails the table.

The chrome and home continuation also holds under full source comparison with the frozen descriptor modules:

- `CHROME_ROWS` follows all seven frozen `mustFlag` rows and eight `mustPass` rows in order. Its ordinary original
  fixtures name the missing `ChromeEntry` denominator; the renamed-tuple row names both `CHROME_ZONES` and
  `ChromeEntry` (`:778-785`); and the two assembler rows name only `ChromeEntry` (`:813-822`). The constructed member
  leaves only `CHROME_ZONES` unresolved on the rename row, while the same member reports `Missing mobile fate` beside
  each excluded assembler (`:847-867`). This binds the denominator and population boundary independently.
- `TILE_ROWS` follows all six frozen `mustFlag` rows and three `mustPass` rows in order. The three dormant rows assert
  the exact final details `declares an empty reason`, `declares no teaser`, and `declares an action`, including their
  authored backtick spelling (`:881-893`). The two assembly-only rows retain named
  `HomeTileContribution` withholding. Their separate successor control takes the canonical factory declarations from
  `registryAssemblyAtDoorOnly.mustFlag[0]`, imports that real declaration into frozen examples 5 and 8, proves the
  feature assembly reports, proves `main.tsx` is excluded, requires no tool errors, and checks legacy inertness
  (`:949-979`).
- `git diff --name-only b072f59fa` lists only the replay test and its report. The shared differential harness and gate
  implementations are unchanged.

## Checkpoint correction and C4 warm recheck

The source-only **CONFIRMED** verdict above was incomplete and is **superseded for checkpoint `7cad620a9`** by
R-2319-1 / #2338. `MODAL_ROWS[1]` observed only the common 46-character policy-message prefix and classified the
imported modal-body example as `anchor-move`. The frozen reader actually reports an unreadable imported initializer,
while the final reader resolves that initializer and reports the `Placeholder body` arm. The correct semantic
classification is `stronger-reader`; the shared prefix hid that arm change.

The current uncommitted C4 repair is **CONFIRMED in source**. Both modal-body final rows now use the closed
`armLabel` vocabulary. Row 0 remains an anchor move on the same placeholder catch; row 1 names `Placeholder body` and
declares a stronger-reader successor. A constructed wrong-arm control preserves the same file, line and token while
changing the initializer to an unresolved builder, proves that the former 46-character label aliases the two arms,
and proves that the exact successor rejects `Unreadable definition`. No runtime test was executed in this recheck;
the primary retains that floor.

## Precise limits

This reviewer did not independently run tests because the primary retained the serial verification floor. I read the
complete parent-produced 12/12 baseline and three planted-control logs, but treat those as corroboration rather than
independent execution evidence. This review therefore confirms the repaired source proof and its discriminating
assertions, not the primary's seven-policy, lint, typecheck, docs, or real-tree gate claims. It does not review
the shared replay-harness repair commits preceding `ade6f50ed`, the four
untabled non-split owners, either split owner, ledger states outside #2319, or any product behavior. It reviewed only
the three requested commits and the source needed to judge their replay claims.

## LEDGER ROWS (3 rows)

| id | class | module | finding | state |
| - | - | - | - | - |
| `V-2319-C1` | proof-blind | `registry-definitions-legacy-replay.test.ts` | Broad regex accepts any unclassified reason despite the exact-name claim. | **REPAIRED — source verified in warm follow-up** |
| `V-2319-C2` | stale-procedure | `x-legacy-replay-2026-09-13.md` | Recipe mandates prepend although the working family recipe also repoints existing imports. | **REPAIRED — source verified in warm follow-up** |
| `V-2319-C3` | fixture-artifact | modal opener replay | Unresolved `#state` import is classified as stronger-reader; the completed dependency proves `0 -> 0`. | **REPAIRED — source verified in warm follow-up** |

## Issue summaries

**V-2319-C1** — REFUTED. `verdictViolations` accepts every `/^UNCLASSIFIED-[A-Z-]+$/` label, so changing
`UNCLASSIFIED-POPULATION-UNADMITTABLE` to `UNCLASSIFIED-WRONG` does not fail. Bind the row to the exact closed reason;
the report's “asserted BY NAME” claim was false at `808caf154`. **REPAIRED:** the current helper compares the exact
closed reason.

**V-2319-C2** — REFUTED. Recipe steps prescribe `add + prepend`, but the placeholder twin must repoint its existing
`#state` type import to preserve line identity. Make delivery conditional on the legacy bytes: repoint an existing
import, otherwise prepend. **REPAIRED:** current recipe step 4 states that conditional delivery and prerequisite rule.

**V-2319-C3** — REFUTED. Modal `mustPass[2]` leaves its intended `#state` opener unresolved and calls the resulting
unreachable-modal finding `stronger-reader`. Its own completed dependency returns zero findings. Complete the twin,
prove legacy inertness, require zero errors, and classify the row `vacuous-both-zero`. **REPAIRED:** the current row
and its separate incomplete-fixture control establish both sides of that prerequisite boundary.
