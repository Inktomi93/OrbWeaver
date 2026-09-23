---
paths:
  - "tooling/src/verify/**"
  - "tests/tooling/verify/**"
---

# Verify and gates

## Running verify

The command list and stage table live in `AGENTS.md`. This file covers gate authoring only.

## Authoring or changing a gate

1. Read `docs/design/gate-runtime-read-first.md` and `tooling/src/verify/gates/GATE-AUTHORING.md` first.
2. A new gate lands on a tree with its live violations already fixed. Use an allowlist entry only for a permanent, reasoned exemption.
3. Deleting an allowlist entry is a coupled edit with its conformance rows; `pnpm check` does not catch a missed one.
4. Prefer declarative `mustFlag`, `mustPass`, and `mustRefuse` rows. Write a family test only for what a row cannot express. Find a gate's family test by grepping its id.
5. A hard or error-tier policy has no waiver. Fix a red live finding in the landing commit, or state it as a fork to the orchestrator.
6. A whole-project stale or ratchet case must guard on `ctx.scope.kind === "project"`. A scoped run does not prove it saw the whole tree.
7. Retiring a gate touches the module, its allowlist entries, the resource-tree roster test, the enforcement-registry doc row and count, and a row in the deferred-dropped history.
8. The one waiver marker is `@orb-waive <policy-id>(<position>): <reason>`, honored only by an `ordinary` policy: `hard` rejects every suppression and `reviewed-grant` takes a central grant row. It binds to the authored carrier of the reported position (GATE-AUTHORING §4.3); `@orb-waive-file` binds that policy's findings anywhere in the file. `@orb-gate-ignore` is not a marker; `policy-soundness` reports a final policy that parses it.
9. Probe rules live in the `lane` skill; this file adds nothing beyond it.
10. When a gate matches one syntactic spelling of a defect, check the others too: named function, bound method, `.call`/`.apply`, re-export. Resolve to the declaration before judging.
11. A member-reading gate needs separate identity and field walkers. Teach a new type shape to both; they fail in opposite directions.
12. `ts-morph` `Type#getProperty` returns `undefined` on a union receiver, including one an optional chain produces. Unwrap with `getNonNullableType` and iterate constituents.
13. Key a gate's cache on the run pass, not on a `ts-morph` `Project` object. A reused `Project` can serve a stale snapshot from an earlier example.
14. A census or baseline generator walks the gate's own file set. Do not use `lib/harness.ts`'s `getProject`; it deliberately excludes `tooling/src`.
15. Flip a warning-tier gate to blocking in the commit that brings its count to zero. A held flip lets the count climb back.
16. A fix for a gate or instrument caught lying ships planted controls in both directions, a loud refusal in place of a clean zero, and a red-first regression test that separates the fixed false positive from any newly visible finding.
