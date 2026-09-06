// Gate: ui-exports-map-complete (ui-package-design.md). The live @orb/ui module tree and package exports
// must agree in both directions. ResourceHost supplies both sources; the policy derives modules from the
// tree rather than maintaining a family list.

import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { ResourceTreeEntry } from "../contract/resource.ts";
import type { PackageStringMap } from "../contract/resource-config.ts";

const UI_PACKAGE = "packages/ui";
const UI_SOURCE = `${UI_PACKAGE}/src`;
const UI_MANIFEST = `${UI_PACKAGE}/package.json`;
const INDEX = "index.ts";
const MESSAGE =
  "the @orb/ui exports map does not match the module tree (core/ui-package-design.md) — every module needs its exact export, every family member needs index.ts, and every export target must exist.";

interface ModuleDir {
  readonly key: string;
  readonly target: string;
  readonly indexPath: string;
  readonly directoryPath: string;
  readonly hasIndex: boolean;
}

function childDirectories(entries: readonly ResourceTreeEntry[], parent: string): readonly string[] {
  const prefix = `${parent}/`;
  return entries
    .filter((entry) => entry.kind === "directory" && entry.path.startsWith(prefix))
    .map((entry) => entry.path.slice(prefix.length))
    .filter((path) => path.length > 0 && !path.includes("/"))
    .toSorted();
}

function modules(entries: readonly ResourceTreeEntry[]): readonly ModuleDir[] {
  const files = new Set(entries.filter((entry) => entry.kind === "file").map((entry) => entry.path));
  const out: ModuleDir[] = [];
  for (const top of childDirectories(entries, UI_SOURCE)) {
    const topDirectory = `${UI_SOURCE}/${top}`;
    const topIndex = `${topDirectory}/${INDEX}`;
    if (files.has(topIndex)) {
      out.push({ key: `./${top}`, target: `./src/${top}/${INDEX}`, indexPath: topIndex, directoryPath: topDirectory, hasIndex: true });
      continue;
    }
    for (const child of childDirectories(entries, topDirectory)) {
      const directoryPath = `${topDirectory}/${child}`;
      const indexPath = `${directoryPath}/${INDEX}`;
      out.push({ key: `./${child}`, target: `./src/${top}/${child}/${INDEX}`, indexPath, directoryPath, hasIndex: files.has(indexPath) });
    }
  }
  return out;
}

function targetPath(target: string): string | undefined {
  return target.startsWith("./") && target.length > 2 ? `${UI_PACKAGE}/${target.slice(2)}` : undefined;
}

function reportModuleProblems(ctx: GatePolicyContext, entries: readonly ResourceTreeEntry[], exports: PackageStringMap): void {
  for (const module of modules(entries)) {
    if (!module.hasIndex) {
      ctx.report.file(module.directoryPath, { line: 1, column: 1, message: `${module.directoryPath} has no ${INDEX}; it has no exportable front door.` });
      continue;
    }
    if (exports[module.key] !== module.target) {
      const spelled = exports[module.key];
      const detail = spelled === undefined ? "no entry at all" : `${JSON.stringify(spelled)}, not ${JSON.stringify(module.target)}`;
      ctx.report.file(module.indexPath, { line: 1, column: 1, message: `${UI_MANIFEST} exports has ${detail} for ${JSON.stringify(module.key)}.` });
    }
  }
}

function reportDeadTargets(ctx: GatePolicyContext, entries: readonly ResourceTreeEntry[], exports: PackageStringMap): void {
  const paths = new Set(entries.map((entry) => entry.path));
  for (const [key, target] of Object.entries(exports)) {
    const path = targetPath(target);
    if (path === undefined || !paths.has(path)) {
      ctx.report.file(UI_MANIFEST, {
        line: 1,
        column: 1,
        message: `exports entry ${JSON.stringify(key)} points at ${JSON.stringify(target)}, which does not exist.`,
      });
    }
  }
}

export const gate = defineGate({
  id: "ui-exports-map-complete",
  family: "ui-exports-map-complete",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the UI tree and package exports are closed ResourceHost facts" },
  analysis: "resource",
  execution: "entire-population",
  resources: [
    { kind: "authored-tree", id: "packages" },
    { kind: "package-metadata", id: "ui" },
  ],
  message: MESSAGE,
  fix: 'add the exact "./<name>": "./src/<family>/<name>/index.ts" export, add the missing index.ts, or delete the dead export.',
  create: (ctx) => ({
    evaluate: () => {
      const tree = ctx.resources.authoredTree("packages");
      const metadata = ctx.resources.packageMetadata("ui");
      if (tree.status !== "ready" || metadata.status !== "ready") {
        return;
      }
      reportModuleProblems(ctx, tree.value, metadata.value.exports);
      reportDeadTargets(ctx, tree.value, metadata.value.exports);
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/ui/package.json": '{"name":"@orb/ui","private":true,"exports":{"./button":"./src/primitives/button/index.ts"}}',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
        "packages/ui/src/primitives/hint-trigger/index.ts": "export const HintTrigger = 1;\n",
      },
      expect: { count: 1, messageIncludes: "no entry at all" },
      why: "a complete module absent from the exports map is unimportable",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/package.json":
          '{"name":"@orb/ui","private":true,"exports":{"./button":"./src/primitives/button/index.ts","./badge":"./src/primitives/button/index.ts"}}',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
        "packages/ui/src/primitives/badge/index.ts": "export const Badge = 1;\n",
      },
      expect: { count: 1, messageIncludes: "not" },
      why: "an export entry pointing at another module is present but wrong",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/package.json": '{"name":"@orb/ui","private":true,"exports":{"./button":"./src/primitives/button/index.ts"}}',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
        "packages/ui/src/charts/meter/meter.tsx": "export const Meter = 1;\n",
      },
      expect: { messageIncludes: "has no index.ts" },
      why: "a family member without an index has no exportable front door",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/package.json":
          '{"name":"@orb/ui","private":true,"exports":{"./button":"./src/primitives/button/index.ts","./ghost":"./src/primitives/ghost/index.ts"}}',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
      },
      expect: { count: 1, messageIncludes: "does not exist" },
      why: "an export target that vanished is stale",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/ui/package.json":
          '{"name":"@orb/ui","private":true,"exports":{"./button":"./src/primitives/button/index.ts","./meter":"./src/charts/meter/index.ts","./lib":"./src/lib/index.ts"}}',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
        "packages/ui/src/charts/meter/index.ts": "export const Meter = 1;\n",
        "packages/ui/src/lib/index.ts": "export const cn = 1;\n",
      },
      why: "family members and top-level modules each have the exact derived export",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/package.json":
          '{"name":"@orb/ui","private":true,"exports":{"./button":"./src/primitives/button/index.ts","./styles/globals.css":"./src/styles/globals.css"}}',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
        "packages/ui/src/styles/globals.css": ":root { --x: 1; }\n",
      },
      why: "a leaf CSS directory owns no module export while its explicit file export stays valid",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/package.json": '{"name":"@orb/ui","private":true,"exports":{"./tokens":"./src/tokens/index.ts"}}',
        "packages/ui/src/tokens/index.ts": "export const tokens = {};\n",
        "packages/ui/src/tokens/generated/palette.ts": "export const palette = {};\n",
      },
      why: "a top-level module may contain internal subdirectories without exporting each one",
    },
  ],
});
