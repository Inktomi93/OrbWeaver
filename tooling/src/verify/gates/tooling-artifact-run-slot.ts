// Policy: tooling-artifact-run-slot (docs/architecture/core/Core-Tooling-Law.md §4.4, arm G of the retired
// `tooling-shared-plumbing`; UNIFIED-VERIFICATION-DESIGN.md §3.3b) — a tool that FILES an artifact
// (`artifactDir`/`artifactFile`, _shared/artifact-out.ts) anywhere under `tooling/src/<tool>/` opens a run
// slot (`withInstrumentRun`) in its `cli.ts`. An unslotted instrument writes into the shared
// `reports/<kind>/`, where a concurrent run of the same instrument destroys its artifacts — the #1164 clobber
// class (two side-eye lanes on one checkout both took the default `--out` name and produced a `root.png`
// neither could claim). Comment posture: comment-SAFE (node kinds only).
//
// ONE HARD POLICY (docs/history/gate-runtime-worked-cases-2026-09.md §"Mixed-hook arity amendments", #1950 group 4): a missing run slot is a DEFECT, not a permission anyone
// reviews, and the subject is a TOOL (cross-file), which is why it is not an arm of the reviewed
// `tooling-artifact-path-home` — one authority per policy. FAMILY `tooling-artifact` — the shared reader is
// `lib/artifact-filing.ts` (`classifyFilingCall` over the two located halves of the one home).
//
// IDENTITY, NOT SPELLING: the legacy compared callee TEXT (`artifactFile`, `withInstrumentRun`). Both doors
// are now judged by DECLARATION against the LOCATED `_shared/artifact-out.ts` home through
// `lib/project-home-origin.ts`, so an aliased import opens a slot (mustPass[1]) and a local function of the
// door's name does not (mustFlag[2], mustPass[2]). Fail-closure runs in BOTH directions: a filer the readers
// cannot place still FILES (its tool owes a slot, mustFlag[3]), and a slot opener the readers cannot place
// opens NOTHING. The home is located and RECEIPTED (one receipt per half — filers, run slot), so an absent
// home or a renamed export refuses the run at the receipt phase rather than reading green (pinned through
// `runPolicyPass` in tests/tooling/verify/gates/tooling-plumbing-family.test.ts).
//
// THE REPORTED POSITION is the tool's FIRST filing call: the legacy anchored on `<tool>/cli.ts` at line 0,
// which the final sink refuses and which need not exist for a tool that files; the filing site is always in
// the population and names the cli.ts in its message. `entire-population` because the verdict is a per-tool
// join of two files no per-file subset carries; a narrowed request DEFERS this policy. POPULATION PORT:
// byte-identical (`@tooling`).
//
// Legacy descriptor: `2c1a1d37c` (`tooling/src/verify/gates/tooling-shared-plumbing.ts`, arm G). No private
// marker grammar; zero live `@orb-gate-ignore tooling-shared-plumbing` markers at conversion.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `tooling-shared-plumbing` descriptor at daf3444358fc10c2b0a3bc3377c62abe23e82c63, the parent of the conversion
// `7b80f66a4`; this module did not exist there, so it is measured against the module it was carved from,
// `tooling-shared-plumbing` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The
// `2c1a1d37c` cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both
// citations resolve to this source. Over the SAME 7,464 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,617 and final `population` admits 1,120.
// legacy − final = 497 — `tests/tooling/**` (482) and `tests/e2e/support/**` (15): arm G fenced to `tooling/src`
// inside `visit`. final − legacy = ∅. Controls: inside `tooling/src/_shared/__cbbhr_in_appearance-flags.ts` (virtual)
// admitted by both; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.

import type { Node as MorphNode } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { ARTIFACT_FILERS, classifyFilingCall, RUN_SLOT_DOOR } from "../lib/artifact-filing.ts";
import { locateProjectHome } from "../lib/project-home-origin.ts";
import { isToolCli, TOOLING_PREFIX, toolOf } from "../lib/tooling-import-door.ts";

const FILERS_RECEIPT = "artifact home: filers";
const SLOT_RECEIPT = "artifact home: run slot";
/** The plumbing's own home dir is not a tool with a cli — it DEFINES the filing doors. */
const SHARED_DIR = "_shared";

const MESSAGE =
  "an instrument that files artifacts with no run slot — a tool calling `artifactDir`/`artifactFile` (_shared/artifact-out.ts) whose cli.ts never opens `withInstrumentRun` writes into the shared reports/<kind>/, where a concurrent run of the same instrument destroys its artifacts (#1164; docs/architecture/core/UNIFIED-VERIFICATION-DESIGN.md §3.3b).";
const FIX =
  "wrap the tool's main in `withInstrumentRun(\"<tool>\", …)` in its cli.ts (_shared/artifact-out.ts) so every artifact it files lands in that run's own slot and is published by pointer at the end.";

const unslotted = (tool: string, site: string): string =>
  `${site} files an artifact, so ${tool}'s cli.ts (${TOOLING_PREFIX}${tool}/cli.ts) must open its artifact run slot (withInstrumentRun, _shared/artifact-out.ts) — an unslotted instrument writes into the shared reports/<kind>/ where a concurrent run of the same instrument destroys its artifacts (#1164; docs/architecture/core/UNIFIED-VERIFICATION-DESIGN.md §3.3b).`;

export const gate = defineGate({
  id: "tooling-artifact-run-slot",
  family: "tooling-artifact",
  authority: "hard",
  severity: "error",
  population: "@tooling",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const filers = locateProjectHome(ctx.files, ctx.relativePath, ARTIFACT_FILERS);
    const slot = locateProjectHome(ctx.files, ctx.relativePath, RUN_SLOT_DOOR);
    /** tool → its first filing call and the file it sits in (walk order, so the anchor is stable). */
    const filing = new Map<string, { readonly node: MorphNode; readonly site: string }>();
    const slotted = new Set<string>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            if (!node.isKind(SyntaxKind.CallExpression)) {
              return;
            }
            const rel = ctx.relativePath(sourceFile);
            const tool = toolOf(rel);
            if (tool === SHARED_DIR) {
              return;
            }
            // A filer the readers cannot place still files: fail-closed, the tool owes a slot.
            if (classifyFilingCall(node, filers) !== "other" && !filing.has(tool)) {
              filing.set(tool, { node, site: rel });
            }
            // A slot opener the readers cannot place opens nothing: fail-closed the other way.
            if (isToolCli(rel) && classifyFilingCall(node, slot) === "home") {
              slotted.add(tool);
            }
          },
        },
      ],
      evaluate: () => {
        ctx.receipt({ kind: "population", source: FILERS_RECEIPT, members: filers.members, unresolved: filers.unresolved });
        ctx.receipt({ kind: "population", source: SLOT_RECEIPT, members: slot.members, unresolved: slot.unresolved });
        for (const [tool, { node, site }] of filing) {
          if (!slotted.has(tool)) {
            ctx.report.node(node, { message: unslotted(tool, site), fix: FIX });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "tooling/src/_shared/artifact-out.ts": ARTIFACT_OUT_STUB(),
        "tooling/src/unslotted/cli.ts": 'import { shoot } from "./ops/shoot.ts";\nexport const run = shoot;\n',
        "tooling/src/unslotted/ops/shoot.ts":
          'import { artifactFile } from "../../_shared/artifact-out.ts";\nexport async function shoot(): Promise<number> {\n  await artifactFile("snaps", "root", ".png");\n  return 0;\n}\n',
      },
      expect: { count: 1, token: "artifactFile" },
      why: "the founding shape (#1164): an instrument that files artifacts with no run slot — the shared-path clobber. The finding anchors on the FILING call, the one site that always exists, and names the cli.ts that owes the slot",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/artifact-out.ts": ARTIFACT_OUT_STUB(),
        "tooling/src/deep/cli.ts": 'import { shoot } from "./ops/shoot.ts";\nexport const run = shoot;\n',
        "tooling/src/deep/ops/shoot.ts":
          'import { artifactFile, withInstrumentRun } from "../../_shared/artifact-out.ts";\nexport async function shoot(): Promise<number> {\n  return await withInstrumentRun("deep", async () => {\n    await artifactFile("snaps", "root", ".png");\n    return 0;\n  });\n}\n',
      },
      expect: { count: 1, token: "artifactFile" },
      why: "the slot must be opened in the tool's cli.ts — the front door that owns the run — not in an ops module: a slot opened below the door can be bypassed by every other verb the cli dispatches",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/artifact-out.ts": ARTIFACT_OUT_STUB(),
        "tooling/src/local/cli.ts":
          'import { shoot } from "./ops/shoot.ts";\nasync function withInstrumentRun(i: string, m: () => Promise<number>): Promise<number> {\n  void i;\n  return await m();\n}\nexport const run = withInstrumentRun("local", shoot);\n',
        "tooling/src/local/ops/shoot.ts":
          'import { artifactFile } from "../../_shared/artifact-out.ts";\nexport async function shoot(): Promise<number> {\n  await artifactFile("snaps", "root", ".png");\n  return 0;\n}\n',
      },
      expect: { count: 1, token: "artifactFile" },
      why: "THE IDENTITY RED: a LOCAL function that merely shares the run-slot door's name opens no slot — its callee resolves to the cli's own declaration, not the home's export. The legacy text comparison called this tool slotted",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/artifact-out.ts": ARTIFACT_OUT_STUB(),
        "tooling/src/blind/cli.ts": 'import { shoot } from "./ops/shoot.ts";\nexport const run = shoot;\n',
        "tooling/src/blind/ops/shoot.ts":
          'import { artifactFile } from "./missing.ts";\nexport async function shoot(): Promise<number> {\n  await artifactFile("snaps", "root", ".png");\n  return 0;\n}\n',
      },
      expect: { count: 1, token: "artifactFile" },
      why: "FAIL-CLOSED on the filing side (#944): a filer whose import door does not resolve is not proven NOT to file, so its tool owes a slot — reported rather than silently admitted on the strength of a spelling",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "tooling/src/_shared/artifact-out.ts": ARTIFACT_OUT_STUB(),
        "tooling/src/slotted/cli.ts":
          'import { withInstrumentRun } from "../_shared/artifact-out.ts";\nimport { shoot } from "./ops/shoot.ts";\nexport const run = withInstrumentRun("slotted", shoot);\n',
        "tooling/src/slotted/ops/shoot.ts":
          'import { artifactFile } from "../../_shared/artifact-out.ts";\nexport async function shoot(): Promise<number> {\n  await artifactFile("snaps", "root", ".png");\n  return 0;\n}\n',
      },
      why: "the sanctioned instrument shape — files artifacts INSIDE a run slot its cli.ts opened (arm G's pass half)",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/artifact-out.ts": ARTIFACT_OUT_STUB(),
        "tooling/src/alias/cli.ts":
          'import { withInstrumentRun as slot } from "../_shared/artifact-out.ts";\nimport { shoot } from "./ops/shoot.ts";\nexport const run = slot("alias", shoot);\n',
        "tooling/src/alias/ops/shoot.ts":
          'import { artifactDir } from "../../_shared/artifact-out.ts";\nexport async function shoot(): Promise<number> {\n  await artifactDir("snaps");\n  return 0;\n}\n',
      },
      why: "AN IMPORT ALIAS opens the same slot — the callee resolves to the home's export whatever it was spelled as (and `artifactDir` is the second filing door). The legacy text comparison called this tool unslotted",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/artifact-out.ts": ARTIFACT_OUT_STUB(),
        "tooling/src/lookalike/cli.ts": 'import { shoot } from "./ops/shoot.ts";\nexport const run = shoot;\n',
        "tooling/src/lookalike/ops/shoot.ts":
          'function artifactFile(k: string, o: string, e: string): string {\n  return k + o + e;\n}\nexport function shoot(): number {\n  return artifactFile("snaps", "root", ".png").length;\n}\n',
      },
      why: "THE IDENTITY COUNTERFACTUAL on the filing side: a LOCAL function named `artifactFile` files nothing through the home — its callee resolves to the module's own declaration — so its tool owes no slot. The legacy text comparison red it",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/artifact-out.ts": ARTIFACT_OUT_STUB(),
        "tooling/src/_shared/artifact-index.ts":
          'import { artifactFile } from "./artifact-out.ts";\nexport const index = artifactFile("index", "root", ".json");\n',
      },
      why: "the plumbing's own `_shared` dir is not a tool with a cli — it DEFINES and composes the filing doors, and is skipped by derivation rather than by a row",
    },
  ],
});

/** The home's export surface, planted so a proof locates it: an absent home REFUSES the run by receipt. */
function ARTIFACT_OUT_STUB(): string {
  return [
    "export async function artifactDir(kind: string): Promise<string> {",
    "  return kind;",
    "}",
    "export async function artifactFile(kind: string, out: string, ext: string): Promise<string> {",
    "  return kind + out + ext;",
    "}",
    "export async function withInstrumentRun(instrument: string, main: () => Promise<number>): Promise<number> {",
    "  void instrument;",
    "  return await main();",
    "}",
    "",
  ].join("\n");
}
