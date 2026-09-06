---
kind: review
status: active
updated: 2026-09-06
---

# Gate-system composed review

## Findings

### High — `tooling/src/verify/gates/nullable-column-inequality.ts:242`

The migrated nullable-inequality policy treats any `isNull`/`isNotNull` call on the same column anywhere in the enclosing statement as a guard, even when that call does not logically guard the inequality. The implementation indexes guards only by `(enclosing statement, schema column)` at lines 159–175 and then suppresses the inequality whenever that key exists at line 242. A source statement such as `choose(isNull(t.kind), ne(t.kind, "x"))` therefore reports no finding even though `choose` is not Drizzle's `or`/`and` combinator and may discard the null predicate; the executed SQL can still drop every NULL row while the gate reports clean.

Evidence produced in this session: a direct `runPolicyPass` probe against the current Lane A worktree created a nullable `t.kind` schema column and the exact `choose(isNull(t.kind), ne(t.kind, "x"))` source. The result was `effective: []`, `toolErrors: []`, `factErrors: []`, `authorityErrors: []`, and `withheld: []`. The existing proofs cover the intended `or(isNull(...), ne(...))` and `and(isNotNull(...), ne(...))` shapes and a same-statement guard on a different column, but never prove that an unrelated same-column sibling does not suppress the finding (`nullable-column-inequality.ts:310–353`). Remediation: associate the guard with the inequality through the resolved Drizzle boolean-combinator expression tree, or report unless the relationship is proved; add this unrelated-sibling case as a `mustFlag` control. This violates the fail-closed requirement in `GATE-AUTHORING.md` §5 and the destination design's rule that unsupported semantics return unresolved/tool-error rather than absence.

## Verified clean

- Re-ran the supplied computed-enum probe against the latest observed Lane A bytes. `const KINDS = getKinds(); enum: KINDS` now produces one effective `db-enum-from-tuple` finding anchored at `KINDS`, with no tool/fact/authority errors. The earlier false-clean was repaired while this review was running and is not a current finding.
- Inspected the current asset-reference comparator after its repair. Its focused `asset-refs-coverage.int.test.ts` run was started, but the orchestrator requested an immediate verdict before that long test completed, so it is not claimed green here.
- The Lane B `section-factory-contribution-bundle` duplicate-name probe fails closed: a second exported `ContributorRegistry` makes the policy emit a receipt error and withhold its verdict. That is deliberate, tested behavior rather than a silent pass, so it is not reported as a confirmed defect.
- The integration worktree `pnpm check` reached a `lint:biome` failure and continued into later stages; it was interrupted when the orchestrator requested the immediate verdict. This is a non-verdict, not a green gate receipt.

## Coverage limits

Lane B moved from the supplied `0d8b9b39` state to at least `b18a35dd` and continued changing `message-kind-policy-coverage` during review. The report therefore does not claim a stable full-file review of Lane B's final bytes. The integration range contains 149 touched implementation files and 40 touched test files; the immediate-verdict instruction ended the review before every one could be read in full. Reviewed areas include the central policy dispatcher/context, authority and waiver coordination, population/scope machinery, the schema gates implicated by the supplied probes, and the current section-factory policy. Unread or only partially read areas include several converted gate families, the full resource-host family, and large portions of the touched application/test fixtures.

## Unconfirmed, low priority

None. The moving-state and incomplete verification limits above are coverage limits, not suspicions.

## Issue summary

Composed gate-system review found 1 confirmed finding, severity ceiling High: `nullable-column-inequality` falsely treats an unrelated same-statement null predicate as a guard and can report clean while a nullable inequality still drops NULL rows. Lane B remained in motion and the requested immediate verdict prevented full-file/full-gate completion. Report: `docs/reviews/stickler/2026-09-06-gate-system-composed-review.md`.
