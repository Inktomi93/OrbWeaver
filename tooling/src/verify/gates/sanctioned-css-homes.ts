// Gate: sanctioned-css-homes (client-architecture-lockdown.md §4 + §16 G14) — the paint law's path-closed backstop.
// Every repository-owned product stylesheet under packages/** must be one of the five authored/generated CSS homes;
// the DTCG token source completes the six-home set. Playwright's index.css is harness-owned and outside this product set.
// TWO-SIDED: an extra CSS path or a missing sanctioned home is RED; generated dist/node_modules trees are not authored homes.
import { existsSync, globSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract/gate.ts";

const SANCTIONED_CSS_HOMES = [
  "packages/ui/src/tokens/tokens.json",
  "packages/ui/src/styles/theme.css",
  "packages/ui/src/styles/globals.css",
  "packages/ui/src/styles/tiers.css",
  "packages/client/src/styles/globals.css",
  "packages/client/src/features/app-shell/surfaces/shell.css",
] as const;
const SANCTIONED_PATHS = new Set<string>(SANCTIONED_CSS_HOMES);
const PRODUCT_CSS_GLOB = "packages/**/*.css";
const GENERATED_TREES = ["packages/**/dist/**", "packages/**/node_modules/**"];
const GATE_SELF = "tooling/src/verify/gates/sanctioned-css-homes.ts";
const ANCHOR = "package.json";

export const gate: GateDescriptor = {
  name: "sanctioned-css-homes",
  docRow: "client-architecture-lockdown.md §4 / §16 G14",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: "a repository-owned product stylesheet exists outside the path-closed six-home CSS doctrine (client-architecture-lockdown.md §4)",
  fix: "move the responsibility into its exact §4 home; do not create another product stylesheet",
  run: (ctx) => {
    for (const rel of globSync(PRODUCT_CSS_GLOB, { cwd: ctx.root, exclude: GENERATED_TREES })) {
      const posix = rel.replaceAll("\\", "/");
      if (!SANCTIONED_PATHS.has(posix)) {
        ctx.report({ file: posix, line: 0, column: 0, message: gate.message });
      }
    }
    if (!existsSync(join(ctx.root, ANCHOR))) {
      return;
    }
    for (const rel of SANCTIONED_CSS_HOMES) {
      if (!existsSync(join(ctx.root, rel))) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `sanctioned CSS home missing: "${rel}" — remove it only when the authority changes (client-architecture-lockdown.md §4)`,
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
  ],
};
