// The PERMANENT PIN for the conformance harness's fs-backed SUBSTRATE (#779). The substrate used to
// re-DISCOVER the files it had just written with a recursive glob per example — measured 50.7ms against
// 0.7ms for the known-path door — and across 330 fs-backed examples that glob WAS the bite-proof's runtime
// (43s against its 45s budget). The resolve-once rewrite is only safe if the project it hands a gate is the
// SAME SET as before, so the two halves of that contract are pinned here rather than left to a one-shot
// measurement: every materialized `.ts`/`.tsx` reaches the gate's project, and every NON-TS file it writes
// stays on DISK and OUT of it (dangling-refs plants `.md`, over-art-plate-arm a stylesheet, a ratchet gate
// its baseline — each read through the gate's own `readFileSync`, and each a parse error if it were added).
// Driven through the REAL `verifyGateProofs`, with a synthetic descriptor that records what it was fed.
import type { GateDescriptor, GateRunCtx } from "../../../../tooling/src/verify/contract/gate.ts";
import { verifyGateProofs } from "../../../../tooling/src/verify/ops/conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** Every file an example materializes: TS sources the gate must SEE, and the sidecars it must not. */
const EXAMPLE_FILES: Readonly<Record<string, string>> = {
  "packages/server/src/domain/probe/substrate/logic.ts": "export const probe = (n: number): number => n + 1;\n",
  "packages/ui/src/probe/probe.tsx": "export const Probe = () => null;\n",
  "docs/architecture/core/Probe-Doc.md": "# a doc an fs-backed gate reads off disk\n",
  "packages/client/src/styles/probe.css": ".probe {\n  color: red;\n}\n",
  "tooling/src/verify/gates/probe.baseline.json": "{}\n",
};

const TS_MEMBERS: readonly string[] = ["packages/server/src/domain/probe/substrate/logic.ts", "packages/ui/src/probe/probe.tsx"];

/** A descriptor that exists only to REPORT its substrate: it records the project's file set (repo-relative)
 *  and flags nothing, so it must pass its own mustPass row. */
function recordingGate(seen: string[]): GateDescriptor {
  return {
    name: "probe-substrate-recorder",
    docRow: "GATE-AUTHORING.md §6",
    status: "active",
    scopeSafety: "whole-project",
    fsBacked: true,
    message: "unreachable — this descriptor never reports (tests/tooling/verify/ops/conformance.int.test.ts).",
    run: (ctx: GateRunCtx): void => {
      for (const sf of ctx.project.getSourceFiles()) {
        seen.push(sf.getFilePath().slice(ctx.root.length + 1));
      }
    },
    mustFlag: [],
    mustPass: [{ files: EXAMPLE_FILES, why: "the substrate probe: nothing to flag, so the recorder must pass its own proof" }],
  };
}

test("the fs-backed substrate feeds the gate EXACTLY the materialized TS sources — no glob, no sidecars", ({ repoRoot }) => {
  expect(repoRoot).toBeTruthy();
  const seen: string[] = [];

  const failures = verifyGateProofs([recordingGate(seen)]);

  // The recorder passing is the positive control: an empty project would ALSO report zero findings, so the
  // file-set assertion below is what distinguishes "fed correctly" from "fed nothing".
  expect(failures).toEqual([]);
  expect([...seen].sort()).toEqual([...TS_MEMBERS].sort());
});

test("a gate that DOES flag still bites in the fs-backed substrate — the resolve-once door loads real content", ({ repoRoot }) => {
  expect(repoRoot).toBeTruthy();
  const biting: GateDescriptor = {
    name: "probe-substrate-biter",
    docRow: "GATE-AUTHORING.md §6",
    status: "active",
    scopeSafety: "whole-project",
    fsBacked: true,
    message: "the probe source declares `probe` (tests/tooling/verify/ops/conformance.int.test.ts).",
    run: (ctx: GateRunCtx): void => {
      for (const sf of ctx.project.getSourceFiles()) {
        if (sf.getVariableDeclaration("probe") !== undefined) {
          ctx.report({ file: sf.getFilePath().slice(ctx.root.length + 1), line: 1, column: 0 });
        }
      }
    },
    // Content, not just presence: the declaration is read out of the file the substrate wrote.
    mustFlag: [{ files: EXAMPLE_FILES, expect: { count: 1 }, why: "the bite direction — a file loaded with no CONTENT would pass this vacuously" }],
    mustPass: [{ files: { "packages/server/src/domain/probe/substrate/other.ts": "export const other = 1;\n" }, why: "a source without the declaration" }],
  };

  expect(verifyGateProofs([biting])).toEqual([]);
});
