// The PERMANENT PIN for the `test-presence` gate's two DEMAND-BY-DEFAULT arms — DOMAIN (#767) and the
// `entry/` + `transport/` TIERS (#773) — in tooling/src/verify/gates/test-presence.ts.
// The gate was not lying where it looked — 519/519 slotted surfaces carried their test — but its demand set
// was the OLD slot vocabulary, so 127 domain files with runtime logic (54 of them in `substrate/`, the
// second-largest slot in the tree) were invisible to it: no violation, no exemption record, no signal (#767).
// Conformance proves the matcher on synthetic mini-projects; THIS proves the widened arm and its RATCHET
// against the REAL tree and against planted controls in BOTH directions, so the blindness cannot come back:
// the real committed ledger IS the residual population, an untested substrate file REDs, a tested one is
// silent, each SHAPE exemption is silent for the right reason, a stale row REDs (both staleness modes), and a
// tree the derivation cannot see REFUSES LOUDLY instead of printing a clean zero — once per arm, since each
// tripwire returns early and would otherwise mask the other's corpus. The tier arm repeats the same shape
// over its own exemptions: a pass-through / router shell / declaration file is silent, a one-expression
// body that DECIDES is not.
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
/** Planted (with its mirror) by every scratch tree so the DOMAIN blindness tripwire stays disarmed. */
const DOMAIN_PRESENT = "packages/server/src/domain/tag/substrate/normalize.ts";
const DOMAIN_PRESENT_TEST = "tests/server/domain/tag/substrate/normalize.test.ts";
/** The #773 TIER arm's fixtures. `TIER_PRESENT` is planted (with its mirror) by every scratch tree so the
 *  tier blindness tripwire stays disarmed; the rest are the arm's own planted controls. */
const TIER_PRESENT = "packages/server/src/transport/trpc/error-mapping.ts";
const TIER_PRESENT_TEST = "tests/server/transport/trpc/error-mapping.test.ts";
const TIER_UNTESTED = "packages/server/src/entry/http/frame-store.ts";
const TIER_UNTESTED_TEST = "tests/server/entry/http/frame-store.test.ts";
/** Real logic in an entry file: a branch, so no pass-through exemption can reach it. */
const TIER_LOGIC =
  "export function take(id: string, owner: string): string | undefined {\n  const hit = STORE.get(id);\n  if (hit === undefined || hit.owner !== owner) {\n    return undefined;\n  }\n  return hit.doc;\n}\n";

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

/** Load a scratch root as a project, exactly as a live run sees it. */
function projectOf(root: string): Project {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths([`${root}/packages/**/*.ts`]);
  return project;
}

/** A scratch tree: the planted files, the real-tree ANCHOR (so the stale arms are live), and ONE ALREADY-
 *  TESTED file per demand-by-default arm so NEITHER blindness tripwire fires. Both tripwires return EARLY,
 *  so a tree missing a whole arm's corpus would silently skip the stale sweep and every later assertion —
 *  each tripwire therefore gets its own hand-built control instead of riding this helper. */
function treeOf(root: string, files: Readonly<Record<string, string>>): Project {
  plant(root, ANCHOR, "export const schema = 1;\n");
  plant(root, DOMAIN_PRESENT, LOGIC);
  plant(root, DOMAIN_PRESENT_TEST, "export const t = 1;\n");
  plant(root, TIER_PRESENT, LOGIC);
  plant(root, TIER_PRESENT_TEST, "export const t = 1;\n");
  for (const [rel, content] of Object.entries(files)) {
    plant(root, rel, content);
  }
  return projectOf(root);
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

  test("every ledger row is a DEBT row from a demand-by-default arm — a ratified row here would be a permanent exemption wearing a ratchet", ({ repoRoot }) => {
    // The ledger's admissible subjects ARE the budgeted arms and nothing else: `domain/` (#767) and the
    // two tiers (#773). A row from any other arm would be a slotted surface buying itself a pass.
    const budgeted = ["packages/server/src/domain/", "packages/server/src/entry/", "packages/server/src/transport/"];
    const rows = JSON.parse(readFileSync(join(repoRoot, BASELINE_REL), "utf8")) as Record<string, unknown>;
    for (const [subject, value] of Object.entries(rows)) {
      expect(
        budgeted.some((prefix) => subject.startsWith(prefix)),
        `${subject} is not a domain/entry/transport file`,
      ).toBe(true);
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
    // Hand-built (not `treeOf`, which disarms both tripwires): the anchor plus a tier corpus and NO
    // domain file at all — the shape a domain-tree move would produce.
    plant(scratch, ANCHOR, "export const schema = 1;\n");
    plant(scratch, TIER_PRESENT, LOGIC);
    plant(scratch, TIER_PRESENT_TEST, "export const t = 1;\n");

    expect(messages(runGate(scratch, projectOf(scratch)))).toContain("the domain scan matched ZERO files");
  });
});

describe("test-presence — the #773 entry/transport arm, planted controls on a throwaway tree", () => {
  test("an untested entry file with real logic REDs — the founding #773 shape (an unpinned security primitive)", ({ scratch }) => {
    const run = runGate(scratch, treeOf(scratch, { [TIER_UNTESTED]: TIER_LOGIC }));
    expect(messages(run)).toContain("entry/transport file with runtime logic has no test");
    expect(run.findings.map((f) => f.file)).toContain(TIER_UNTESTED);
  });

  test("the SAME file with its mirror test is silent — 65 of the tier's 94 logic files were already tested", ({ scratch }) => {
    plant(scratch, TIER_UNTESTED_TEST, "export const t = 1;\n");
    expect(runGate(scratch, treeOf(scratch, { [TIER_UNTESTED]: TIER_LOGIC })).findings).toEqual([]);
  });

  test("the PASS-THROUGH shapes are silent, and each for its own recorded reason", ({ scratch }) => {
    const project = treeOf(scratch, {
      // one delegating call over its own deps (a boot step)
      "packages/server/src/entry/boot/seed-themes.ts":
        "export async function seedThemes(deps: SeedThemesDeps): Promise<void> {\n  await ensureSeedThemes(deps.db, deps.now);\n}\n",
      // a DI-bundle literal that returns its own arguments (the transport context)
      "packages/server/src/transport/trpc/context.ts":
        "export function createContext(parts: Parts): Context {\n  return { auth: parts.auth, services: parts.services };\n}\n",
      // a curried factory whose closure is one delegating call
      "packages/server/src/entry/compose/minter.ts": "export function minter(prefix: string): () => string {\n  return (): string => mintTypeId(prefix);\n}\n",
      // a router shell — a `router({…})` binding is no callable export at all
      "packages/server/src/transport/trpc/routers/tag.ts":
        "export const tagRouter = router({\n  list: authedProcedure.query(({ ctx }) => ctx.services.tag.list()),\n});\n",
      // a declaration file emits no runtime
      "packages/showcase-plugins/bundles/host-v1.d.ts": "export declare function hostV1(): void;\n",
      // barrels, as everywhere else
      "packages/server/src/entry/http/index.ts": "export const front = 1;\n",
    });
    expect(runGate(scratch, project).findings).toEqual([]);
  });

  test("a one-expression body that DECIDES is not a pass-through — the permissive direction stays demanded", ({ scratch }) => {
    const project = treeOf(scratch, {
      "packages/server/src/entry/compose/gate.ts":
        "export const decide = (deps: Deps, req: Req): Verdict => (req.anonymous ? deps.publicBucket(req.ip) : deps.authedBucket(req.userId));\n",
      "packages/server/src/transport/jobs/tick.ts":
        "export function startTick(deps: Deps): () => void {\n  const safe = (): void => {\n    tick(deps).catch(() => undefined);\n  };\n  safe();\n  return deps.scheduleInterval(safe, deps.ms);\n}\n",
    });
    const flagged = runGate(scratch, project).findings.map((f) => f.file);
    expect(flagged).toContain("packages/server/src/entry/compose/gate.ts");
    expect(flagged).toContain("packages/server/src/transport/jobs/tick.ts");
  });

  test("a tree with the anchor and a domain file but ZERO entry/transport files REFUSES LOUDLY", ({ scratch }) => {
    // The tier anchor `treeOf` normally plants is what disarms this — remove it by building the project
    // WITHOUT it, which is exactly the shape a tier rename would produce.
    plant(scratch, ANCHOR, "export const schema = 1;\n");
    plant(scratch, DOMAIN_PRESENT, LOGIC);
    plant(scratch, DOMAIN_PRESENT_TEST, "export const t = 1;\n");

    expect(messages(runGate(scratch, projectOf(scratch)))).toContain("the entry/transport scan matched ZERO files");
  });
});
