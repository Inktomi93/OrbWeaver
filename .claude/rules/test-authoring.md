---
paths:
  - "tests/**"
---

# Test authoring checklist

This rule loads for every file under `tests/`. It is the one home of the checklist. The longer contract is `tests/support/README.md`; read it before you add or change a test, story or helper.

Work through this list for every new or changed test. Each step links to the section that owns the detail. An orchestrator's test brief names the answers to steps 1, 2, 4 and 14.

1. Name the behavior and the defect the test must catch.
2. Pick the layer from the failure, using the [layer table](../../docs/law/Spine-Testing.md#10-choosing-the-test-layer). Use the cheapest layer that runs the real behavior.
3. For a reference case, read the [restoration register](../../docs/plans/restoration-register/design.md) and the plan's [standing case decisions](../../docs/plans/test-foundation/design.md#standing-case-decisions). Record keep, rebuild, move or drop in the work item.
4. Name the production entry the test runs. A server case uses the composed root from `@orb/testkit/node/composed`, or a pure production function through its own module's door ([the tree](../../docs/law/Spine-Testing.md#2-the-tree)).
5. Script only the external edge: provider transport, subprocess, network peer. Never fake an internal service and never call `vi.mock` ([mock doctrine](../../docs/law/Spine-Testing.md#3-determinism--mock-doctrine)).
6. Script replies with a [finite plan](../../tests/support/README.md#script-replies-with-a-finite-plan).
7. Set an env key through the harness, never through `process.env` ([env knobs](../../tests/support/README.md#turn-a-production-env-knob)).
8. Sign in [through the product](../../tests/support/README.md#sign-in-through-the-product).
9. Inject the clock and the ids. Use no wall clock, no randomness and no fake timers ([determinism](../../docs/law/Spine-Testing.md#3-determinism--mock-doctrine)).
10. Import every constant, label, error code, route, env key and type from its production home. When production has no exported home, add one there first ([tests run the product](../../docs/law/Spine-Testing.md#9-tests-run-the-product), [zero-import modules](../../tests/support/README.md#keep-user-facing-names-in-zero-import-modules)).
11. Seed and read through production verbs. Write or read a row directly only under `tests/db/` or a `persistence/` directory. A state the product cannot produce needs a [sanctioned home](../../tests/support/README.md#sanctioned-historic-states).
12. Give every refusal its reason and every absence a positive control in the same case ([what is enforced](../../tests/support/README.md#what-is-enforced)).
13. Own each database, root, reply plan and temp directory with `using`, in the order [the entry points](../../tests/support/README.md#use-the-maintained-entry-points) show.
14. Prove the test red against a real production defect, for the intended reason, before trusting its green. Prove each positive control red the same way.
15. Assert the outcome itself. Two production reads that agree prove nothing when both can be wrong together.
16. Make a case table over a closed union exhaustive by type, so a member with no case fails `tsc`.
17. Time a case that starts a real guest or a subprocess alone. Give it the `slow` tag from `tooling/src/floor/testing/test-tags.ts` when its runtime is proven; a case near its budget times out under load.
18. Add no production export, testkit door or harness option only to serve a test. Report the gap instead.
19. Report as [Run and report](../../tests/support/README.md#run-and-report) says.
