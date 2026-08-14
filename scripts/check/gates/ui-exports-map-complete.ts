// Gate: ui-exports-map-complete (core/ui-package-design.md) — @orb/ui is EXPORTS-MAP sealed: a module dir
// with no `"./<n>"` entry is UNIMPORTABLE, and nothing else on the tree says so (hint-trigger shipped that
// way for a day; only its CT's failed import found it). A1 a module dir with an index.ts and no entry; A2 a
// FAMILY subdir with no index.ts at all (no front door to export); A3 an entry whose target file is gone
// (two-sided — the map may not name what the tree does not have); A4 the reader learned nothing.
//
// THE SHAPE IS DERIVED, NOT LISTED (§10 — key off the live source of truth): a depth-1 dir UNDER src/ that
// has its own index.ts is a MODULE (`lib`, `markdown`, `stream`, `tokens`) and owns entry `./<dir>`; one
// WITHOUT an index.ts but with subdirs is a FAMILY (`primitives`, `charts`, `content`, `art`) and each of
// its subdirs owns entry `./<subdir>`. So a NEW family needs no gate edit, and no hard-coded family list
// can go stale (§3 — a path constant that dies on a rename is a silent green).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

const UI_PKG_REL = "packages/ui/package.json";
const UI_SRC_REL = "packages/ui/src";
/** Real-tree anchor (GATE-AUTHORING.md §4.5) for the A4 blindness arm — the primitive every real tree has
 *  and no example below builds (the examples invent `thing`-shaped dirs). */
const ANCHOR_REL = `${UI_SRC_REL}/primitives/button/index.ts`;
const INDEX = "index.ts";

const MESSAGE =
  "the @orb/ui exports map does not match the module tree (core/ui-package-design.md) — A1: a module dir " +
  'with an index.ts and no `"./<name>"` entry is UNIMPORTABLE (`import … from "@orb/ui/<name>"` fails to ' +
  "resolve, and the only thing that notices is the first consumer, usually a CT); A2: a family subdir with " +
  "no index.ts has no front door to export at all; A3: an entry pointing at a file that does not exist — " +
  "the map may not name what the tree lacks; A4: this gate read no exports map (see the finding).";
const FIX =
  'add `"./<name>": "./src/<family>/<name>/index.ts"` to packages/ui/package.json exports (the map is ' +
  "alphabetical), give the dir its index.ts front door, or delete the entry whose target is gone.";

interface ModuleDir {
  /** The exports KEY this dir owns (`./button`). */
  readonly key: string;
  /** Its target, exactly as the map spells it (`./src/primitives/button/index.ts`). */
  readonly target: string;
  /** Repo-relative path of the index.ts — the report anchor. */
  readonly indexRel: string;
  /** Repo-relative path of the dir itself — the A2 anchor (there is no file to point at). */
  readonly dirRel: string;
  readonly hasIndex: boolean;
}

function subdirs(abs: string): string[] {
  if (!existsSync(abs)) {
    return [];
  }
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Every dir the exports map is REQUIRED to name, derived from the tree's own two-level shape. */
function moduleDirs(root: string): ModuleDir[] {
  const srcAbs = join(root, UI_SRC_REL);
  const out: ModuleDir[] = [];
  for (const top of subdirs(srcAbs)) {
    const topHasIndex = existsSync(join(srcAbs, top, INDEX));
    if (topHasIndex) {
      out.push({
        key: `./${top}`,
        target: `./src/${top}/${INDEX}`,
        indexRel: `${UI_SRC_REL}/${top}/${INDEX}`,
        dirRel: `${UI_SRC_REL}/${top}/`,
        hasIndex: true,
      });
      continue;
    }
    // No index.ts of its own ⇒ a FAMILY. A leaf dir that is neither (styles/ — css only) owns no entry.
    for (const child of subdirs(join(srcAbs, top))) {
      out.push({
        key: `./${child}`,
        target: `./src/${top}/${child}/${INDEX}`,
        indexRel: `${UI_SRC_REL}/${top}/${child}/${INDEX}`,
        dirRel: `${UI_SRC_REL}/${top}/${child}/`,
        hasIndex: existsSync(join(srcAbs, top, child, INDEX)),
      });
    }
  }
  return out;
}

/** The `exports` block of packages/ui/package.json, or undefined when there is nothing to read. */
function exportsMap(root: string): Record<string, string> | undefined {
  const abs = join(root, UI_PKG_REL);
  if (!existsSync(abs)) {
    return;
  }
  const parsed: unknown = JSON.parse(readFileSync(abs, "utf-8"));
  const block = (parsed as { exports?: unknown }).exports;
  if (typeof block !== "object" || block === null) {
    return;
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(block as Record<string, unknown>)) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

function scanExportsMap(ctx: GateRunCtx): void {
  const map = exportsMap(ctx.root);
  const dirs = moduleDirs(ctx.root);
  if (map === undefined) {
    // A4 — no map to check. Only a claim on the real tree: a conformance mini-project without a
    // package.json is legitimately nothing to judge.
    if (existsSync(join(ctx.root, ANCHOR_REL))) {
      ctx.report({
        file: UI_PKG_REL,
        line: 0,
        column: 0,
        message: `A4 — no readable \`exports\` block in ${UI_PKG_REL} on a real tree: @orb/ui is exports-map sealed, so either the seal is gone or this gate is now blind (GATE-AUTHORING.md §4 rule 6).`,
      });
    }
    return;
  }
  ctx.scan({ unit: "module dir", scanned: dirs.length });
  for (const dir of dirs) {
    if (!dir.hasIndex) {
      ctx.report({
        file: dir.dirRel,
        line: 0,
        column: 0,
        message: `A2 — ${dir.dirRel} has no ${INDEX}: a family member's front door IS its export target, so this dir can never be reached through @orb/ui (core/ui-package-design.md).`,
      });
      continue;
    }
    if (map[dir.key] !== dir.target) {
      const spelled = map[dir.key];
      const detail = spelled === undefined ? "no entry at all" : `"${spelled}", not "${dir.target}"`;
      ctx.report({
        file: dir.indexRel,
        line: 0,
        column: 0,
        message: `A1 — ${UI_PKG_REL} exports has ${detail} for "${dir.key}": this module is UNIMPORTABLE (or importable under a target that is not its own index), and the first thing to notice will be a consumer that fails to resolve (core/ui-package-design.md).`,
      });
    }
  }
  // A3 — two-sided: an entry naming a file the tree does not have. Every exports value is judged, not just
  // the ones a dir claims, so a rename that leaves the map behind is RED from the map's side too.
  for (const [key, target] of Object.entries(map)) {
    if (!existsSync(join(ctx.root, "packages/ui", target))) {
      ctx.report({
        file: UI_PKG_REL,
        line: 0,
        column: 0,
        message: `A3 — exports entry "${key}" points at "${target}", which does not exist: a dead entry resolves to nothing at import time and silently re-attaches to whatever later takes that path (core/ui-package-design.md).`,
      });
    }
  }
}

export const gate: GateDescriptor = {
  name: "ui-exports-map-complete",
  docRow: "core/ui-package-design.md",
  status: "active",
  // The map is one file judged against the whole ui tree — never a per-file verdict.
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  // Reads package.json (never in the ts-morph project) and the real directory tree.
  fsBacked: true,
  run: scanExportsMap,
  mustFlag: [
    {
      files: {
        // A1 — THE FOUNDING SHAPE: hint-trigger, complete and correct, with no entry in the map. It was
        // unimportable for a full day and every gate, typecheck and lint on the tree stayed green.
        "packages/ui/package.json": '{\n  "name": "@orb/ui",\n  "exports": {\n    "./button": "./src/primitives/button/index.ts"\n  }\n}\n',
        "packages/ui/src/primitives/button/index.ts": 'export { Button } from "./button.tsx";\n',
        "packages/ui/src/primitives/hint-trigger/index.ts": 'export { HintTrigger } from "./hint-trigger.tsx";\n',
      },
      expect: { count: 1, messageIncludes: "no entry at all" },
      why: "the founding defect — a finished primitive the exports map never named, so `@orb/ui/hint-trigger` did not resolve",
    },
    {
      files: {
        // A1 again, the WRONG-TARGET spelling: an entry exists but points at another module's index (the
        // copy-paste slip an entry-presence-only check would call clean).
        "packages/ui/package.json":
          '{\n  "exports": {\n    "./button": "./src/primitives/button/index.ts",\n    "./badge": "./src/primitives/button/index.ts"\n  }\n}\n',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
        "packages/ui/src/primitives/badge/index.ts": "export const Badge = 1;\n",
      },
      expect: { count: 1, messageIncludes: "not " },
      why: "an entry that RESOLVES but to the wrong module — presence is not correctness, and the importer gets someone else's exports",
    },
    {
      files: {
        // A2 — a family subdir with no index.ts: nothing to export, and ui-primitive-structure's trio clause
        // only covers primitives/, so charts/content/art had no such check at all.
        "packages/ui/package.json": '{\n  "exports": {\n    "./button": "./src/primitives/button/index.ts"\n  }\n}\n',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
        "packages/ui/src/charts/meter/meter.tsx": "export const Meter = 1;\n",
      },
      expect: { messageIncludes: "has no index.ts" },
      why: "a CHARTS family member with no front door — the same unimportable-module class, in a family the primitive-structure gate does not scan",
    },
    {
      files: {
        // A3 — the map names a file the tree does not have (the other half of a rename).
        "packages/ui/package.json":
          '{\n  "exports": {\n    "./button": "./src/primitives/button/index.ts",\n    "./ghost": "./src/primitives/ghost/index.ts"\n  }\n}\n',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
      },
      expect: { count: 1, messageIncludes: "does not exist" },
      why: "TWO-SIDED (§4 rule 4): a dead entry is not merely useless — it re-attaches to whatever later takes that path",
    },
    {
      files: {
        // A4 — the real-tree anchor exists (a genuine ui tree) but the package manifest does not.
        [ANCHOR_REL]: "export const Button = 1;\n",
      },
      expect: { messageIncludes: "no readable" },
      why: "the §4.6 blindness tripwire: this gate reads ONE manifest by path, so its disappearance must be RED and not a silent ✓",
    },
  ],
  mustPass: [
    {
      files: {
        // The correct shape across both levels: a FAMILY member and a top-level MODULE, each named exactly.
        "packages/ui/package.json":
          '{\n  "exports": {\n    "./button": "./src/primitives/button/index.ts",\n    "./meter": "./src/charts/meter/index.ts",\n    "./lib": "./src/lib/index.ts"\n  }\n}\n',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
        "packages/ui/src/charts/meter/index.ts": "export const Meter = 1;\n",
        "packages/ui/src/lib/index.ts": "export const cn = 1;\n",
      },
      why: "the derivation written down: a dir WITH its own index.ts is a module (`lib`), one WITHOUT is a family whose children are the modules (`primitives`, `charts`) — no hard-coded family list to go stale",
    },
    {
      files: {
        // A dir that is neither a module nor a family — the `styles/` shape (css only, exported by FILE).
        "packages/ui/package.json":
          '{\n  "exports": {\n    "./button": "./src/primitives/button/index.ts",\n    "./styles/globals.css": "./src/styles/globals.css"\n  }\n}\n',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
        "packages/ui/src/styles/globals.css": ":root {\n  --x: 1;\n}\n",
      },
      why: "DECLARED LIMIT as a written baseline: a leaf dir with no index.ts and no subdirs owns no `./<name>` entry — `styles/` publishes a FILE, and demanding a front door there would be a false positive",
    },
    {
      files: {
        // A module dir with subdirs of its own (`tokens/`) is judged as a MODULE — its children are internal.
        "packages/ui/package.json": '{\n  "exports": {\n    "./tokens": "./src/tokens/index.ts"\n  }\n}\n',
        "packages/ui/src/tokens/index.ts": "export const tokens = {};\n",
        "packages/ui/src/tokens/generated/palette.ts": "export const palette = {};\n",
      },
      why: "having an index.ts is what makes a dir a MODULE — its subdirs are internals, not unexported modules (the false positive a depth-2 sweep would produce on `tokens/generated`)",
    },
  ],
};
