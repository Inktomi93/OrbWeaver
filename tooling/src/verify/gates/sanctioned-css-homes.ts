// Gate: sanctioned-css-homes (client-architecture-lockdown.md §4 + §16 G14) — the paint law's path-closed backstop.
// Every repository-owned product stylesheet under packages/** must be one of the five authored/generated CSS homes;
// the DTCG token source completes the six-home set. Playwright's index.css is harness-owned and outside this product set.
// TWO-SIDED: an extra CSS path or a missing sanctioned home is RED; generated dist/node_modules trees are not authored homes.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract/gate.ts";
import { SANCTIONED_CSS_HOMES } from "../lib/sanctioned-css-homes.ts";

const SANCTIONED_PATHS = new Set<string>(SANCTIONED_CSS_HOMES);
const GENERATED_DIRS = new Set(["dist", "node_modules"]);
const GATE_SELF = "tooling/src/verify/gates/sanctioned-css-homes.ts";
const ANCHOR = "package.json";

function productCssPaths(root: string): string[] {
  const packagesRoot = join(root, "packages");
  if (!existsSync(packagesRoot)) {
    return [];
  }
  const paths: string[] = [];
  const visit = (dir: string, relDir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!GENERATED_DIRS.has(entry.name)) {
          visit(join(dir, entry.name), rel);
        }
        continue;
      }
      if (entry.name.endsWith(".css")) {
        paths.push(`packages/${rel}`);
      }
    }
  };
  visit(packagesRoot, "");
  return paths.sort((a, b) => a.localeCompare(b));
}

export const gate: GateDescriptor = {
  name: "sanctioned-css-homes",
  docRow: "client-architecture-lockdown.md §4 / §16 G14",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: "a repository-owned product stylesheet exists outside the path-closed six-home CSS doctrine (client-architecture-lockdown.md §4)",
  fix: "move the responsibility into its exact §4 home; do not create another product stylesheet",
  run: (ctx) => {
    for (const rel of productCssPaths(ctx.root)) {
      if (!SANCTIONED_PATHS.has(rel)) {
        ctx.report({ file: rel, line: 0, column: 0, message: gate.message });
      }
    }
    if (!existsSync(join(ctx.root, ANCHOR))) {
      return;
    }
    for (const rel of SANCTIONED_CSS_HOMES) {
      if (!(statSync(join(ctx.root, rel), { throwIfNoEntry: false })?.isFile() ?? false)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `sanctioned CSS home missing or not a regular file: "${rel}" — remove it only when the authority changes (client-architecture-lockdown.md §4)`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: { "packages/client/src/features/thing/thing.css": ".thing { color: red; }\n" },
      expect: { count: 1, messageIncludes: "outside the path-closed six-home" },
      why: "a feature-local stylesheet is an unsanctioned seventh product CSS home",
    },
    {
      files: { "packages/ui/src/styles/extra.css": ".extra { color: red; }\n" },
      expect: { count: 1, messageIncludes: "outside the path-closed six-home" },
      why: "an extra stylesheet beside an approved UI home is still outside the literal closed set",
    },
    {
      files: { "packages/ui/src/styles/.extra.css": ".extra { color: red; }\n" },
      expect: { count: 1, messageIncludes: "outside the path-closed six-home" },
      why: "a dotfile stylesheet cannot disappear from the closed-set inventory",
    },
    {
      files: { "packages/ui/src/.hidden/extra.css": ".extra { color: red; }\n" },
      expect: { count: 1, messageIncludes: "outside the path-closed six-home" },
      why: "a stylesheet under a dot-directory cannot disappear from the closed-set inventory",
    },
    {
      files: {
        "package.json": "{}\n",
        "packages/ui/src/tokens/tokens.json": "{}\n",
        "packages/ui/src/styles/theme.css/keep": "directory fixture\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell { display: grid; }\n",
      },
      expect: { count: 1, messageIncludes: "sanctioned CSS home missing" },
      why: "a directory at an exact required path is not the required regular file",
    },
    {
      files: { "package.json": "{}\n" },
      expect: { count: 6, messageIncludes: "sanctioned CSS home missing" },
      why: "THE STALE ARM: a real project with none of the six homes fails loudly instead of returning a vacuous clean",
    },
  ],
  mustPass: [
    {
      files: {
        "package.json": "{}\n",
        "packages/ui/src/tokens/tokens.json": "{}\n",
        "packages/ui/src/styles/theme.css": "@layer theme {}\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell { display: grid; }\n",
        "playwright/index.css": '@import "../packages/client/src/styles/globals.css";\n',
      },
      why: "all six exact product homes pass, while playwright/index.css remains a harness-owned import surface outside packages/** CSS discovery",
    },
    {
      files: { "packages/client/src/features/chat/thing.tsx": "export const thing = true;\n" },
      why: "THE ANCHOR GUARD: a partial synthetic tree cannot claim that the six whole-project homes vanished",
    },
    {
      files: {
        "packages/ui/dist/generated.css": ".generated { color: red; }\n",
        "packages/ui/node_modules/vendor/vendor.css": ".vendor { color: red; }\n",
      },
      why: "generated dist output and vendored node_modules CSS remain outside the repository-authored product inventory",
    },
  ],
};
