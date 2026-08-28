// The PERMANENT PIN for `dangling-refs`'s ABSENT-BY-DESIGN arm (issue #775). The defect it fixes is a LYING
// INSTRUMENT, not a bad doc: `scripts/probes/st-goldens/sillytavern-runtime` is a GITIGNORED captured
// SillyTavern install, so it exists on a full working checkout and never on a fresh worktree — and arm 3
// resolved it with `existsSync`. The identical commit was therefore GREEN on main and RED in every worktree,
// for the same doc line. A verdict that depends on WHERE it ran is wrong in one of the two places, and the
// fresh-worktree red is the one lanes actually pay for.
//
// The PASS half is un-provable in conformance: the exemption arms are guarded on the real-tree anchor, and
// planting that anchor in a mini-project turns on every OTHER stale arm at once. So the honoured case lives
// here, against the real tree, with planted controls in BOTH directions.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { gate as danglingRefs } from "../../../../tooling/src/verify/gates/dangling-refs.ts";
import type { Finding } from "../../../../tooling/src/verify/index.ts";
import { projectCtx, runPass } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const GATE = "dangling-refs";
const ABSENT_PATH = "scripts/probes/st-goldens/sillytavern-runtime";
const CITE = "scripts/probes/st-goldens/README.md";

/** The gate's own justification, re-derived independently: the path must be named by a LITERAL `.gitignore`
 *  rule. Spelled out here rather than imported — a pin that calls the subject's own reader proves only that
 *  the reader agrees with itself. */
function gitignoreNames(repoRoot: string, path: string): boolean {
  return readFileSync(join(repoRoot, ".gitignore"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .some((line) => line === path || line === `${path}/` || line === `/${path}` || line === `/${path}/`);
}

describe("dangling-refs — gitignored paths are absent by design, not phantoms", () => {
  test("the exemption's justification holds on the real tree, and the control does not", ({ repoRoot }) => {
    expect(gitignoreNames(repoRoot, ABSENT_PATH), `${ABSENT_PATH} must be gitignored — that IS the exemption`).toBe(true);
    // PLANTED NEGATIVE CONTROL: a reader that answers "yes" to anything would make the arm unfailable.
    expect(gitignoreNames(repoRoot, "scripts/probes/st-goldens/__not-ignored-control"), "the reader must be able to say no").toBe(false);
    expect(existsSync(join(repoRoot, CITE)), "the cite that justifies the row must resolve").toBe(true);
  });

  test("the real-tree run reports no phantom for the gitignored path, in a checkout that lacks it", ({ repoRoot }) => {
    // This gate is SELF-CONTAINED (it reads docs off disk and needs no sibling's verdict), so it runs alone
    // — a whole-corpus pass here would cost minutes to prove one gate's arm.
    const result = runPass([danglingRefs], projectCtx(repoRoot));
    expect(result.toolErrors).toEqual([]);
    const findings: readonly Finding[] = result.gates.find((g) => g.name === GATE)?.findings ?? [];
    // The point of the arm: this must hold whether or not the gitignored subtree is present on THIS checkout.
    expect(findings.filter((f) => (f.message ?? "").includes(ABSENT_PATH))).toEqual([]);
    // And the row must not have gone silent by accident — the whole gate is still clean, so a NEW phantom
    // anywhere in the core docs still reds. (A green here that came from a broken scan is caught by the
    // gate's own zero-scan alarm at report scope.)
    expect(findings).toEqual([]);
  }, 600_000);
});
