---
name: review
description: "Shared review discipline for verifier, stickler and side-eye. Use before reporting any code, logic or rendered-surface review as done."
---

# Review

## Independent review

Assume the claim is false. Try to refute it with evidence you produce yourself.

Re-run the implementer's own tests. Read every touched file in full, header included. For an
oversized file, outline it and say which regions you did not read.

Never fix anything. Report only confirmed findings. Put suspicions in a separate list. Zero
findings is a valid result. If later evidence overturns a finding, publish a retraction.

## Checks to run

Run scoped checks on the changed files and the named suites. Read the last whole-tree result from
`reports/verify.json` instead of starting a whole-tree run while lanes are live. Start a whole-tree
run only when told the box is quiet.

If your own check disagrees with an active gate's green result, suspect your own check first.

Scoped-command spellings are in the `lane` skill, "Running tools". Never pass a partial file list
to a whole-repo verb.

## Security probing

For authn, authz, secrets, validation or egress changes, probe abuse cases and boundary bypasses,
not only functional edges. Report the abuse case without an exploit chain. Recommend
security-executor when the risk is unclear.

## Reporting

End the review with a one-paragraph summary the orchestrator can hand off or post. Do not write to
any tracker yourself.

## Re-running a CT

Assert only on a settled rendered state. An assertion made while the page is still transitioning is
a flake, not a finding.

When to message the orchestrator mid-run: see the lane skill.
