// Policy: tooling-front-door (docs/architecture/core/Core-Tooling-Law.md §4.2) — cross-tool imports enter through
// the sibling's index.ts only (`#<tool>` or `…/<tool>/index.ts`); `_shared/*` is per-MODULE by design (no
// barrel — a _shared index would chain-load playwright/ts-morph for every consumer); cli.ts consumes its
// own tool ONLY through ./index.ts (+ _shared) — the cli fronts the programmatic API, never ops/lib
// directly. The lane-speed AST arm; the .dependency-cruiser.cjs tooling stanzas are the whole-graph
// resolved-edge backstop. Comment posture: comment-SAFE (ImportDeclaration nodes only).
//
// THE SPLIT (docs/history/gate-runtime-worked-cases-2026-09.md §"Mixed-hook arity amendments", #1950): the legacy descriptor carried three arms under one authority plus a
// gate-owned `ROOT_CONFIG_IMPORTS` table with its own stale sweep. The two tooling-INTERNAL arms — a
// cross-tool deep import and a cli.ts reaching past its own index.ts — are per-file occurrences an author may
// waive with a reason, and they are this policy. The relative ESCAPE out of `tooling/src/` is NOT an arm
// here any more: its exceptions are recurring repository PERMISSIONS (a one-home root-config read), so it
// is `tooling-root-config-import` under reviewed-grant authority, and the legacy table's stale sweep is that
// policy's central grant liveness. One authority per policy.
//
// FAMILY `tooling-front-door` — the shared reader is `lib/tooling-import-door.ts` (`toolOf`, `isToolCli`,
// `resolveRelativeImport`), consumed identically by both siblings. SPELLING IS THE SUBJECT: an import
// boundary is a rule about the door the author WROTE; the resolver and the cruiser own the resolved graph.
//
// POPULATION PORT: byte-identical — the legacy `scanRoot: p.startsWith("tooling/src/")` is `@tooling`.
//
// THE REPORTED POSITION is the module-specifier STRING LITERAL, quotes included (the derived token of the
// specifier node), so a waiver names exactly what the author typed: `"../../bb/ops/y.ts"`. This is an
// ANCHOR MOVE from the legacy `token: spec, offset: 0` on the whole ImportDeclaration — a pair the final
// sink would refuse, since the unquoted specifier is not the text at offset 0 (`import …`). Zero live
// markers existed, so nothing re-binds.
//
// Legacy descriptor: `1f5e25c00` (`tooling/src/verify/gates/tooling-front-door.ts`). No private marker
// grammar; zero live `@orb-gate-ignore tooling-front-door` markers at conversion (rg over packages/, tests/,
// tooling/, scripts/), so no translation was owed.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `tooling-front-door` descriptor at f1bbc34e7e6961bb5cbb607c17470a642e44a1ca, the parent of the conversion
// `e2b183b80` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `1f5e25c00`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,445 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,105 and final `population` admits 1,105.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `tooling/src/_shared/__cbbhr_in_appearance-flags.ts`
// (virtual) admitted by both; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by
// both.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { isToolCli, resolveRelativeImport, TOOLING_PREFIX, toolOf } from "../lib/tooling-import-door.ts";

const MESSAGE =
  "a @orb/tooling import bypasses a front door — cross-tool enters through the sibling's index.ts; cli.ts consumes only its own index.ts (+ _shared) (docs/architecture/core/Core-Tooling-Law.md §4.2). A relative escape out of tooling/ is judged by tooling-root-config-import.";

const FIX =
  "import the sibling's index.ts (or #<tool>); re-export what the cli needs from the tool's index.ts. A deliberate " +
  'exception is waived with `// @orb-waive tooling-front-door("<specifier>"): <reason>` on the line above the ' +
  "import, where <specifier> is the module specifier exactly as written INCLUDING ITS QUOTES. One import is one finding.";

const deepImport = (spec: string, to: string): string => `a cross-tool deep import ("${spec}") — enter "${to}" through its index.ts front door.`;
const cliInternals = (spec: string): string => `cli.ts imports its own internals ("${spec}") — the cli consumes ./index.ts (the programmatic API) only.`;

/** The per-occurrence verdict, or null for a legal door. */
function verdict(rel: string, spec: string): string | null {
  const resolved = resolveRelativeImport(rel, spec);
  if (resolved === null || !resolved.startsWith(TOOLING_PREFIX)) {
    // A `#` map entry, a package specifier, or a relative ESCAPE — none of them this policy's arm.
    return null;
  }
  const from = toolOf(rel);
  const to = toolOf(resolved);
  if (to === from) {
    return isToolCli(rel) && resolved !== `${TOOLING_PREFIX}${from}/index.ts` ? cliInternals(spec) : null;
  }
  if (to === "_shared" || resolved === `${TOOLING_PREFIX}${to}/index.ts`) {
    return null; // per-module by design (see header) · the sibling's front door
  }
  return deepImport(spec, to);
}

export const gate = defineGate({
  id: "tooling-front-door",
  family: "tooling-front-door",
  authority: "ordinary",
  severity: "error",
  population: "@tooling",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.ImportDeclaration],
        visit: (node, sourceFile) => {
          if (!Node.isImportDeclaration(node)) {
            return;
          }
          const message = verdict(ctx.relativePath(sourceFile), node.getModuleSpecifierValue());
          if (message !== null) {
            ctx.report.node(node.getModuleSpecifier(), { message, fix: FIX });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "tooling/src/aa/ops/x.ts": 'import { y } from "../../bb/ops/y.ts";\nexport const x = y;\n',
        "tooling/src/bb/ops/y.ts": "export const y = 1;\n",
      },
      expect: { count: 1, token: '"../../bb/ops/y.ts"', messageIncludes: "cross-tool deep import" },
      why: "a cross-tool deep import — the founding shape the front-door law exists for; the position is the quoted specifier",
    },
    {
      mode: "source",
      files: {
        "tooling/src/aa/cli.ts": 'import { run } from "./ops/run.ts";\nexport const c = run;\n',
        "tooling/src/aa/ops/run.ts": "export const run = 1;\n",
      },
      expect: { count: 1, token: '"./ops/run.ts"', messageIncludes: "imports its own internals" },
      why: "a cli.ts reaching past its own index.ts into ops/ — the cli fronts the API, never internals; a distinct message, so the two arms are discriminable",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tooling/src/aa/ops/x.ts":
          'import { b } from "../../bb/index.ts";\nimport { warn } from "../../_shared/log.ts";\nimport { u } from "../lib/util.ts";\nexport const x = [b, warn, u];\n',
        "tooling/src/bb/index.ts": "export const b = 1;\n",
        "tooling/src/_shared/log.ts": "export const warn = 1;\n",
        "tooling/src/aa/lib/util.ts": "export const u = 1;\n",
      },
      why: "the three legal shapes: a sibling's front door, a _shared module, own-tool internals. Deleting the `_shared` allowance or the index.ts allowance reds this row",
    },
    {
      mode: "source",
      files: {
        "tooling/src/aa/cli.ts": 'import { api } from "./index.ts";\nexport const c = api;\n',
        "tooling/src/aa/index.ts": "export const api = 1;\n",
      },
      why: "cli.ts consuming its own index.ts — the sanctioned cli shape",
    },
    {
      mode: "source",
      files: {
        "tooling/src/aa/ops/x.ts":
          'import cfg from "../../../../knip.ts";\nimport { z } from "../../../../packages/kit/src/ids/index.ts";\nexport const x = [cfg, z];\n',
      },
      why: "THE SPLIT: a relative ESCAPE out of tooling/ — licensed (knip.ts) or not — is not this policy's arm; `tooling-root-config-import` reports both and the grant table decides. Widening this policy to report escapes reds this row",
    },
    {
      mode: "source",
      files: {
        "tooling/src/aa/ops/x.ts":
          'import { b } from "#bb";\nimport { posix } from "node:path";\nimport { kit } from "@orb/kit";\nexport const x = [b, posix, kit];\n',
      },
      why: "THE SPECIFIER FENCE from an ops module: a `#<tool>` imports-map entry is front-door by construction and a package / node: / @orb specifier belongs to the resolver and the cruiser — none is judged. (This row alone does not pin the fence — an unfenced non-relative specifier joins INSIDE the importing tool and reads as own internals, which an ops module may import; the cli.ts row below is the one that dies)",
    },
    {
      mode: "source",
      files: { "tooling/src/aa/cli.ts": 'import process from "node:process";\nimport { b } from "#bb";\nexport const c = [process, b];\n' },
      why: "THE SPECIFIER FENCE, pinned: every real cli.ts imports `node:process`, and a `#<tool>` door. Without the non-relative short-circuit in `resolveRelativeImport` both would posix-join INSIDE the tool and be reported as cli internals. Deleting that short-circuit reds this row",
    },
    {
      mode: "source",
      files: {
        "tooling/src/aa/ops/cli.ts": 'import { run } from "./run.ts";\nexport const c = run;\n',
        "tooling/src/aa/ops/run.ts": "export const run = 1;\n",
      },
      why: "THE CLI SHAPE IS FOUR SEGMENTS: a `cli.ts` nested under ops/ is an ordinary internal module, not the tool's front door, so its own-tool import is legal. Dropping the depth check from `isToolCli` reds this row",
    },
    {
      mode: "source",
      files: {
        "tooling/src/aa/ops/x.ts":
          '// @orb-waive tooling-front-door("../../bb/ops/y.ts"): the proof\'s stand-in reason and its end condition.\nimport { y } from "../../bb/ops/y.ts";\nexport const x = y;\n',
        "tooling/src/bb/ops/y.ts": "export const y = 1;\n",
      },
      why: "THE ORDINARY IDENTITY ARM (§4.2): the correct central marker at the reported position — the quoted specifier — suppresses the twin of mustFlag[0]. One finding, one marker, zero effective findings and zero authority alarms",
    },
  ],
});
