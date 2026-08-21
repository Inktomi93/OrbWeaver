// Gate: tooling-front-door (docs/design/tooling-package.md §4.2) — cross-tool imports enter through the
// sibling's index.ts only ( `#<tool>` or `…/<tool>/index.ts`); `_shared/*` is per-MODULE by design (no
// barrel — a _shared index would chain-load playwright/ts-morph for every consumer); cli.ts consumes its
// own tool ONLY through ./index.ts (+ _shared) — the cli fronts the programmatic API, never ops/lib
// directly. The lane-speed AST arm; the .dependency-cruiser.cjs tooling stanzas are the whole-graph
// resolved-edge backstop. Comment posture: comment-SAFE (ImportDeclaration nodes only).
import { posix } from "node:path";
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const TOOLING_PREFIX = "tooling/src/";

/** repo-relative posix path of `sf`, or null when outside tooling/src (conformance uses virtual /repo roots). */
function toolingRel(sf: SourceFile): string | null {
  const abs = sf.getFilePath().replace(/\\/gu, "/");
  const i = abs.indexOf(`/${TOOLING_PREFIX}`);
  return i === -1 ? null : abs.slice(i + 1);
}

/** The tooling dir (`snap`, `_shared`, …) a repo-relative tooling path belongs to. */
function toolOf(rel: string): string {
  return rel.slice(TOOLING_PREFIX.length).split("/")[0] ?? "";
}

function verdict(rel: string, spec: string): string | null {
  const from = toolOf(rel);
  if (spec.startsWith("#")) {
    // `#<tool>` maps to src/<tool>/index.ts by the imports map — front-door by construction; `#_shared`
    // resolves to nothing (no barrel), which node reports loudly. Either way not this gate's finding.
    return null;
  }
  if (!spec.startsWith(".")) {
    return null; // npm / node: / @orb — the resolver + cruiser own those edges
  }
  const resolved = posix.normalize(posix.join(posix.dirname(rel), spec));
  if (!resolved.startsWith(TOOLING_PREFIX)) {
    return `a tooling module imports outside the tree by relative path ("${spec}") — cross-package needs go through @orb/* package specifiers`;
  }
  const to = toolOf(resolved);
  if (to === from) {
    if (isCli(rel) && resolved !== `${TOOLING_PREFIX}${from}/index.ts`) {
      return `cli.ts imports its own internals ("${spec}") — the cli consumes ./index.ts (the programmatic API) only`;
    }
    return null;
  }
  if (to === "_shared") {
    return null; // per-module by design (see header)
  }
  if (resolved === `${TOOLING_PREFIX}${to}/index.ts`) {
    return null;
  }
  return `a cross-tool deep import ("${spec}") — enter "${to}" through its index.ts front door`;
}

// tooling/src/<tool>/cli.ts — exactly four path segments.
const CLI_DEPTH = 4;

function isCli(rel: string): boolean {
  return rel.endsWith("/cli.ts") && rel.split("/").length === CLI_DEPTH;
}

function checkImport(node: Node, sf: SourceFile): { readonly message: string; readonly spec: string } | null {
  if (!node.isKind(SyntaxKind.ImportDeclaration)) {
    return null;
  }
  const rel = toolingRel(sf);
  if (rel === null) {
    return null;
  }
  const spec = node.getModuleSpecifierValue();
  const message = verdict(rel, spec);
  return message === null ? null : { message, spec };
}

export const gate: GateDescriptor = {
  name: "tooling-front-door",
  docRow: "Core-Enforcement-Active-Gates.md (docs/design/tooling-package.md §4.2)",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "a @orb/tooling import bypasses a front door — cross-tool enters through the sibling's index.ts; cli.ts consumes only its own index.ts (+ _shared); relative escapes out of tooling/ are banned (docs/design/tooling-package.md §4.2).",
  fix: "import the sibling's index.ts (or #<tool>); re-export what the cli needs from the tool's index.ts; use @orb/* specifiers for anything outside tooling/.",
  scanRoot: (p) => p.startsWith(TOOLING_PREFIX),
  kinds: [SyntaxKind.ImportDeclaration],
  visit: (node, sf, ctx) => {
    const hit = checkImport(node, sf);
    if (hit !== null) {
      ctx.report(node, { token: hit.spec, offset: 0 });
    }
  },
  mustFlag: [
    {
      files: {
        "tooling/src/aa/ops/x.ts": 'import { y } from "../../bb/ops/y.ts";\nexport const x = y;\n',
        "tooling/src/bb/ops/y.ts": "export const y = 1;\n",
      },
      expect: { count: 1, token: "../../bb/ops/y.ts" },
      why: "a cross-tool deep import — the founding shape the front-door law exists for",
    },
    {
      files: {
        "tooling/src/aa/cli.ts": 'import { run } from "./ops/run.ts";\nexport const c = run;\n',
        "tooling/src/aa/ops/run.ts": "export const run = 1;\n",
      },
      expect: { count: 1, token: "./ops/run.ts" },
      why: "a cli.ts reaching past its own index.ts into ops/ — the cli fronts the API, never internals",
    },
    {
      files: 'import { z } from "../../../packages/kit/src/ids/index.ts";\nexport const x = z;\n',
      at: "tooling/src/aa/ops/x.ts",
      expect: { count: 1 },
      why: "a relative escape out of the tooling tree — cross-package is @orb/* specifiers only",
    },
  ],
  mustPass: [
    {
      files: {
        "tooling/src/aa/ops/x.ts":
          'import { b } from "../../bb/index.ts";\nimport { warn } from "../../_shared/log.ts";\nimport { u } from "../lib/util.ts";\nexport const x = [b, warn, u];\n',
        "tooling/src/bb/index.ts": "export const b = 1;\n",
        "tooling/src/_shared/log.ts": "export const warn = 1;\n",
        "tooling/src/aa/lib/util.ts": "export const u = 1;\n",
      },
      why: "the three legal shapes: a sibling's front door, a _shared module, own-tool internals",
    },
    {
      files: {
        "tooling/src/aa/cli.ts": 'import { api } from "./index.ts";\nexport const c = api;\n',
        "tooling/src/aa/index.ts": "export const api = 1;\n",
      },
      why: "cli.ts consuming its own index.ts — the sanctioned cli shape",
    },
  ],
};
