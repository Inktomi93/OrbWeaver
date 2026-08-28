// The PERMANENT PIN for the `test-presence` gate's DOMAIN arm (tooling/src/verify/gates/test-presence.ts).
// The gate was not lying where it looked — 519/519 slotted surfaces carried their test — but its demand set
// was the OLD slot vocabulary, so 127 domain files with runtime logic (54 of them in `substrate/`, the
// second-largest slot in the tree) were invisible to it: no violation, no exemption record, no signal (#767).
// Conformance proves the matcher on synthetic mini-projects; THIS proves the widened arm and its RATCHET
// against the REAL tree and against planted controls in BOTH directions, so the blindness cannot come back:
// the real committed ledger IS the residual population, an untested substrate file REDs, a tested one is
// silent, each SHAPE exemption is silent for the right reason, a stale row REDs (both staleness modes), and a
// tree the derivation cannot see REFUSES LOUDLY instead of printing a clean zero.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Node, SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { Finding, GateRunCtx, GateScanDeclaration } from "../../../../tooling/src/verify/contract/gate.ts";
import { BASELINE_REL, gate } from "../../../../tooling/src/verify/gates/test-presence.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** The gate's own real-tree anchor — every stale/blindness arm is guarded on it (GATE-AUTHORING.md §4.5). */
const ANCHOR = "packages/db/src/schema/index.ts";
const SUBSTRATE = "packages/server/src/domain/discovery/substrate/pca.ts";
const SUBSTRATE_TEST = "tests/server/domain/discovery/substrate/pca.test.ts";
const LOGIC = "export const projectPca = (rows: number[][]) => rows.length;\n";

interface Run {
  readonly findings: readonly Finding[];
  readonly declarations: readonly GateScanDeclaration[];
}

/** Drive the gate's OWN `run` over a root — the real descriptor, never a re-implementation. `files` is the
 *  RUN'S FILESET (what `fileLoaded` reads), so a planted anchor arms the stale arms exactly as a live run. */
function runGate(root: string, project: Project): Run {
  const findings: Finding[] = [];
  const declarations: GateScanDeclaration[] = [];
  const files: SourceFile[] = project.getSourceFiles();
  const ctx: GateRunCtx = {
    root,
    project,
    scope: { kind: "project" },
    files,
    checker: () => project.getTypeChecker(),
    report: (arg: Node | Finding): void => {
      if ("file" in arg) {
        findings.push(arg);
      }
    },
    scan: (counts) => {
      declarations.push(counts);
    },
  };
  gate.run?.(ctx);
  return { findings, declarations };
}

function plant(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** A scratch tree: the planted files plus the real-tree ANCHOR (so the stale/blindness arms are live). */
function treeOf(root: string, files: Readonly<Record<string, string>>): Project {
  plant(root, ANCHOR, "export const schema = 1;\n");
  for (const [rel, content] of Object.entries(files)) {
    plant(root, rel, content);
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths([`${root}/packages/**/*.ts`]);
  return project;
}

const messages = (run: Run): string => run.findings.map((f) => f.message ?? "").join("\n");
const admitted = (run: Run): number => run.declarations.reduce((sum, d) => sum + (d.admitted ?? 0), 0);

describe("test-presence — the real tree, both directions", () => {
  test("the committed ledger IS the live residual population: the gate lands GREEN and admits every row", ({ repoRoot }) => {
    const rows = JSON.parse(readFileSync(join(repoRoot, BASELINE_REL), "utf8")) as Record<string, number>;
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    project.addSourceFilesAtPaths([`${repoRoot}/packages/server/src/**/*.ts`, `${repoRoot}/packages/contracts/src/**/*.ts`]);
    const run = runGate(repoRoot, project);

    // No finding survives the ratchet, and the admitted count IS the ledger — a row that stopped matching
    // would be reported by the stale arm instead of silently padding the number.
    expect(messages(run)).toBe("");
    expect(admitted(run)).toBe(Object.keys(rows).length);
    expect(Object.keys(rows).length).toBeGreaterThan(0);
  });

  test("every ledger row is a DEBT row that names a real domain file — a ratified row here would be a permanent exemption wearing a ratchet", ({
    repoRoot,
  }) => {
    const rows = JSON.parse(readFileSync(join(repoRoot, BASELINE_REL), "utf8")) as Record<string, unknown>;
    for (const [subject, value] of Object.entries(rows)) {
      expect(subject.startsWith("packages/server/src/domain/"), `${subject} is not a domain file`).toBe(true);
      expect(value, `${subject} must be a bare count (class DEBT) — a permanent exemption belongs in the gate's SHAPE rules`).toBe(1);
    }
  });
});

describe("test-presence — planted controls on a throwaway tree", () => {
  test("an untested substrate file REDs — the founding #767 shape", ({ scratch }) => {
    const run = runGate(scratch, treeOf(scratch, { [SUBSTRATE]: LOGIC }));
    expect(messages(run)).toContain("domain file with runtime logic has no test");
    expect(run.findings[0]?.file).toBe(SUBSTRATE);
  });

  test("the SAME file with its mirror test is silent — the other direction (91 substrate files were already tested)", ({ scratch }) => {
    plant(scratch, SUBSTRATE_TEST, "export const t = 1;\n");
    expect(runGate(scratch, treeOf(scratch, { [SUBSTRATE]: LOGIC })).findings).toEqual([]);
  });

  test("the SHAPE exemptions are silent, and each for its own recorded reason", ({ scratch }) => {
    const project = treeOf(scratch, {
      "packages/server/src/domain/tag/service.ts": "export function createTagService(ctx: { db: number }) {\n  return { db: ctx.db };\n}\n",
      "packages/server/src/domain/tag/context.ts": "export function createTagContext(db: number) {\n  return { db };\n}\n",
      "packages/server/src/domain/tag/contract/errors.ts": "export class TagNotFoundError extends DomainNotFoundError {}\n",
      "packages/server/src/domain/tag/index.ts": "export const front = 1;\n",
    });
    expect(runGate(scratch, project).findings).toEqual([]);
  });

  test("a NON-root service.ts and a contract file with real logic are NOT exempt — the exemptions are narrow by shape", ({ scratch }) => {
    const project = treeOf(scratch, {
      "packages/server/src/domain/rpg/contract/service.ts": "export function snapshotRowToState(row: { id: string }) {\n  return row.id;\n}\n",
      "packages/server/src/domain/chat/memory/service.ts": "export function createMemory(ctx: { db: number }) {\n  return ctx.db;\n}\n",
    });
    const flagged = runGate(scratch, project).findings.map((f) => f.file);
    expect(flagged).toContain("packages/server/src/domain/rpg/contract/service.ts");
    expect(flagged).toContain("packages/server/src/domain/chat/memory/service.ts");
  });

  test("a FIXED file whose ledger row survives REDs — the ratchet only goes down (§4.8)", ({ scratch }) => {
    plant(scratch, SUBSTRATE_TEST, "export const t = 1;\n");
    plant(scratch, BASELINE_REL, `${JSON.stringify({ [SUBSTRATE]: 1 }, null, 2)}\n`);
    expect(messages(runGate(scratch, treeOf(scratch, { [SUBSTRATE]: LOGIC })))).toContain("stale test-presence baseline row");
  });

  test("a ledger row whose FILE is gone REDs too — §4.4a's mode (B), the row nobody ever visits", ({ scratch }) => {
    plant(scratch, BASELINE_REL, `${JSON.stringify({ "packages/server/src/domain/gone/substrate/deleted.ts": 1 }, null, 2)}\n`);
    const messagesOut = messages(runGate(scratch, treeOf(scratch, { [SUBSTRATE]: LOGIC })));
    expect(messagesOut).toContain("packages/server/src/domain/gone/substrate/deleted.ts");
    expect(messagesOut).toContain("stale test-presence baseline row");
  });

  test("a tree with the anchor but ZERO domain files REFUSES LOUDLY — it does not print a clean zero", ({ scratch }) => {
    expect(messages(runGate(scratch, treeOf(scratch, {})))).toContain("BLINDNESS TRIPWIRE");
  });
});
