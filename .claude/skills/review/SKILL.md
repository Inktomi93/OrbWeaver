---
name: review
description: "Shared review discipline for code-reviewer, deep-reviewer and ux-reviewer. Use before reporting any code, logic or rendered-surface review as done."
---

# Review

## Independent review

Assume the claim is false. Try to refute it with evidence you produce yourself.

Read the implementer's completed test results. Run a test when it answers a specific unresolved correctness question. Read every touched file in full, header included. For an
oversized file, outline it and say which regions you did not read.

Check the change against the ledger and the law it touches. A change that departs from a D-row or a law rule without amending it in the same change is a finding.

Never fix anything. Report only confirmed findings. Put suspicions in a separate list. Zero
findings is a valid result. If later evidence overturns a finding, publish a retraction.

## Defect classes

When you confirm a defect, enumerate its class from the source of truth before you report. Name the shared cause when there is one. One fix round must be able to cover every instance.

## Test reality

- Check for deleted, skipped or loosened tests, expected values copied from output, and TODOs claimed as done.
- Mutate one critical line per claim, and confirm a test fails. A test that cannot fail is a finding.
- Read each test's setup: a test that never reaches the state it names proves nothing.

## Checks to run

Follow the `lane` skill's completion policy when selecting checks. Read completed native-check or CI results, checking their scope and revision. Start a whole-tree run only when the assignment requires it and the box is quiet.

Review the completed change, then batch confirmed findings. Limit follow-up review to those fixes and their affected behavior. Reopen broader review only for a concrete new risk.

If your own check disagrees with an active gate's green result, suspect your own check first.

Scoped-command spellings are in the `lane` skill, "Running tools". Never pass a partial file list
to a whole-repo verb.

## Security probing

For authn, authz, secrets, validation or egress changes, probe abuse cases and boundary bypasses,
not only functional edges. Report the abuse case without an exploit chain. Recommend
security-builder when the risk is unclear.

## Reporting

Finish every check you were asked for before you hand back, and write the report file first. A card that names unfinished checks is not a review.

Write the full review to the report path your role names. Your final message is a review card of 25 lines or fewer:

- The verdict: blocking or not.
- Each claim or acceptance item with its verdict, one line each.
- Each finding, one line, rated blocking or file, with its `file:line`.
- The report path.

Put repro steps and evidence in the report, never in the card. Do not write to any tracker yourself.

## Re-running a CT

Assert only on a settled rendered state. An assertion made while the page is still transitioning is
a flake, not a finding.

When to message the orchestrator mid-run: see the lane skill.
