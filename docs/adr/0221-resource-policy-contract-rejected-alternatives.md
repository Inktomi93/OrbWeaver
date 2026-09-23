---
kind: adr
status: active
updated: 2026-09-23
---

# Resource-policy contract: alternatives rejected

## Context

`resource-policy-contract.md` states what a closed-`ResourceHost` policy owes. Designing it meant
weighing several shapes for how a policy narrows an acquired resource fact, and several open forks were
escalated and given a default rather than a build. Those alternatives and forks are not standing rules;
they are decisions this program made and should not re-litigate without new information.

## Decision

**Alternatives rejected, for the narrowing question (what a policy does with an acquired resource
fact):**

- **In-module `if (fact.status !== "ready") return;`** — rejected. Unreachable for a populated kind (the
  runtime already withholds the owner before `create`), and it teaches the next lane that a silent
  return is a legal answer to a broken resource. Proven dead by deleting a fixture's manifest: the run
  reports a population tool error, never a green zero.
- **In-module `throw` re-spelled per policy** — rejected. Same semantics as the shared
  `readyResourceValue` helper, but with one copy of the refusal per module; the first copy someone writes
  as `return` instead of `throw` reintroduces the defect. One home, beside the refusal it asserts.
- **Compile-time narrowing: type `ctx.resources` as a ready-only host (`ResourceFact<T>` → `T`), throw
  inside the binding** — rejected for this lane, recorded as an open fork (see below). This is the
  strongest ladder tier and makes a silent return unrepresentable, but it is a contract edit
  (`GatePolicyContext.resources`, a mapped host type, the binding, every resource-analysis module, the
  conformance runner's types) that the program ruled out mid-run against five lanes live. Default:
  keep the shared `readyResourceValue` helper; a `policy-soundness` lint arm reds a
  `ctx.resources.<door>(…)` result that is not the direct argument of `readyResourceValue`.
- **Declare `ui-source` instead of `packages` for `ui-exports-map-complete`** — rejected.
  `"./token-contract": "./token-contract.ts"` lives outside `src`, so the narrower id would false-red the
  real manifest. `packages` is the smallest closed id that keeps every arm honest.
- **A `mustFlag` proof row for a refusal** — rejected. A refusal is neither `mustFlag` nor `mustPass`; use
  the optional `mustRefuse` arm when the proof grammar can express the bad state, and keep `runPolicyPass`
  family pins for the runtime states it cannot.
- **Repair one incumbent module and declare the resource plane covered** — rejected. The deliverable is
  fixing every refuted module to the same bar, not filling one cell.

**Open fork, not closed by this lane:** whether `GatePolicyContext.resources` should become the
ready-only host described above (alt C), or whether the shared `readyResourceValue` helper plus the
`policy-soundness` E4 lint arm is the final tier. A lane that wants to resolve this fork should file a
`docs/work` decision item citing this ADR.

## Consequences

`resource-policy-contract.md` states the obligations these alternatives lost to, without re-arguing them.
A later lane proposing one of the rejected shapes should read this record first.

## Alternatives rejected

See the bulleted list above; each entry names why it lost.
