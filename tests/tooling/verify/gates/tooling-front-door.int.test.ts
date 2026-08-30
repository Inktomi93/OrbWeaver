// The PERMANENT PIN for `tooling-front-door`'s ROOT_CONFIG_IMPORTS stale sweep — the two-sided arm that
// REDs a row nothing imports any more.
//
// Red-first receipt (NOT an @instrument-proof marker — `verify` is the harness, not an INSTRUMENT_TOOLS member): MEASURED 2026-08-30. `pnpm exec node tooling/src/verify/cli.ts scoped --scope
// "tooling/src/_shared/**"` reported the LIVE `knip.ts` row as stale ("no tooling module imports it any
// more — delete the row") while the whole-tree `pnpm check` was green on the same commit (structure
// 233/233), and `tooling/src/ast/ops/prodonly.ts:7` demonstrably carries
// `import knipConfig from "../../../../knip.ts"`. The sweep's evidence is collected by `visit`, so it can
// only ever name consumers INSIDE the run's fileset: on any scoped run whose scope excludes the consumer,
// a live row reports as dead. That is a lying instrument in the worst direction — it tells a lane to
// DELETE the exemption holding a one-home rule up, and deleting it would let `ast/ops/prodonly` re-spell
// knip's entry globs unchallenged.
//
// Both directions are pinned here, plus the real-tree fact the row rests on, because the fix (guarding the
// sweep on `scope.kind === "project"`) could just as easily have been "delete the arm" — which would have
// thrown the stale-row protection away instead of repairing it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { describe } from "vitest";
import type { Finding, GateRunCtx, Scope } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/tooling-front-door.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";
/** The file every REAL run loads and no conformance mini-project does — the gate's own real-tree anchor. */
const ANCHOR_REL = "tooling/src/_shared/exit-contract.ts";
/** The one live root-config row and the module that justifies it. Restated rather than imported: this test
 *  is the SECOND opinion on the row, not a re-read of the gate's own map. */
const ROW_TARGET = "knip.ts";
const CONSUMER_REL = "tooling/src/ast/ops/prodonly.ts";
const CONSUMER_IMPORT = 'import knipConfig from "../../../../knip.ts";';

interface Run {
  readonly findings: readonly Finding[];
}

interface RunOptions {
  /** The whole experiment: a run whose SCOPE excludes the consumer never visits it, so the sweep's
   *  evidence is empty for a reason that says nothing about the row. */
  readonly visitConsumer: boolean;
  /** Drop the real-tree anchor from the fileset — the conformance-mini-project shape. */
  readonly loadAnchor?: boolean;
}

/** Drive the REAL descriptor: build a mini tree, walk its imports through `gate.visit` (which is what
 *  populates the sweep's evidence), then call `gate.run`. */
function runGate(scope: Scope, options: RunOptions): Run {
  const project = new Project({ useInMemoryFileSystem: true });
  const anchor = project.createSourceFile(`${ROOT}/${ANCHOR_REL}`, "export const EXIT = { clean: 0 } as const;\n");
  const consumer = project.createSourceFile(`${ROOT}/${CONSUMER_REL}`, `${CONSUMER_IMPORT}\nexport const globs = knipConfig;\n`);
  const findings: Finding[] = [];
  const files: SourceFile[] = options.loadAnchor === false ? [consumer] : [anchor, consumer];
  const ctx: GateRunCtx = {
    root: ROOT,
    project,
    scope,
    files,
    checker: () => project.getTypeChecker(),
    report: (arg: Node | Finding): void => {
      if ("file" in arg) {
        findings.push(arg);
      }
    },
    scan: () => undefined,
  };
  gate.begin?.(ctx);
  if (options.visitConsumer) {
    for (const node of consumer.getDescendantsOfKind(SyntaxKind.ImportDeclaration)) {
      gate.visit?.(node, consumer, ctx);
    }
  }
  gate.run?.(ctx);
  return { findings };
}

/** `Finding.message` is an OPTIONAL per-occurrence override — file-level findings like this sweep's carry
 *  one, node-anchored ones inherit the gate's group prose. Filtering on it is therefore a `?? ""` read, not
 *  an assertion that every finding has one. */
function staleRows(run: Run): readonly Finding[] {
  return run.findings.filter((f) => (f.message ?? "").includes("stale ROOT_CONFIG_IMPORTS row"));
}

describe("tooling-front-door — the ROOT_CONFIG_IMPORTS stale sweep", () => {
  test("a SCOPED run that never visits the consumer does NOT call the row stale", () => {
    // Any of the three non-project scopes reproduces the false red: the scoped fileset can carry the
    // anchor (it lives in `_shared`) while excluding `ast/ops/prodonly.ts`.
    const scopes: readonly Scope[] = [
      { kind: "folder", glob: "tooling/src/_shared/**" },
      { kind: "package", name: "tooling" },
      { kind: "changed", paths: [] },
    ];
    for (const scope of scopes) {
      expect(staleRows(runGate(scope, { visitConsumer: false })), `scope ${scope.kind} must not adjudicate a whole-tree row`).toEqual([]);
    }
  });

  test("a WHOLE run whose walk never saw the consumer still REDs the row — the protection survived the fix", () => {
    const rows = staleRows(runGate({ kind: "project" }, { visitConsumer: false }));
    expect(rows, "a genuinely dead row is the reason this arm exists").toHaveLength(1);
    expect(rows[0]?.file).toBe(ROW_TARGET);
    expect(rows[0]?.message, "the refusal must name the row's own justification, or nobody can judge the deletion").toContain(
      "re-spelling the globs is the one-home violation",
    );
  });

  test("a WHOLE run that DID see the consumer is silent — the row is live vocabulary", () => {
    expect(staleRows(runGate({ kind: "project" }, { visitConsumer: true })), "the live consumer clears the row").toEqual([]);
  });

  test("the real-tree anchor still gates the arm — a conformance-shaped project proves nothing about the row", () => {
    // `scope.kind === "project"` is TRUE inside conformance mini-projects (GATE-AUTHORING §4.5), whose
    // handful of files would otherwise "prove" every row dead. Both guards, not either.
    expect(staleRows(runGate({ kind: "project" }, { visitConsumer: false, loadAnchor: false }))).toEqual([]);
  });

  test("the row is LIVE on today's tree: ast/ops/prodonly imports the knip config by relative path", ({ repoRoot }) => {
    // The second, independent method (the gate is the first): read the consumer off disk. If this ever
    // fails, the row genuinely IS dead — and the first thing to check is whether prodonly re-spelled
    // knip's entry globs locally, which is the one-home regression the row exists to prevent.
    const consumer = join(repoRoot, CONSUMER_REL);
    expect(existsSync(consumer), `${CONSUMER_REL} is the row's only justification`).toBe(true);
    const source = readFileSync(consumer, "utf8");
    expect(source, "the root-config import IS the row").toContain(CONSUMER_IMPORT);
    expect(source, "…and it must still be CONSUMED, not merely imported").toContain("knipConfig as");
  });
});
