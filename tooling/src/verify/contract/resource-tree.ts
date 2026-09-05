import type { CssAtRule, CssRule } from "../lib/css-rules.ts";

/** Closed authored roots used by high-fanout resource policies. */
export const AUTHORED_TREE_PATHS = {
  "server-domain": "packages/server/src/domain",
  "client-feature": "packages/client/src/features",
  "ui-primitive": "packages/ui/src/primitives",
  "tooling-slot": "tooling/src",
  "db-schema": "packages/db/src/schema",
  "db-migration": "packages/db/src/migrations",
  server: "packages/server/src",
  packages: "packages",
  tests: "tests",
  "client-source": "packages/client/src",
  "ui-source": "packages/ui/src",
  gate: "tooling/src/verify/gates",
} as const;

export type AuthoredTreeId = keyof typeof AUTHORED_TREE_PATHS;

/** One exact authored stylesheet. The raw text stays available because some policies judge literals. */
export interface AuthoredCssFile {
  readonly path: string;
  readonly text: string;
  readonly rules: readonly CssRule[];
  readonly atRules: readonly CssAtRule[];
}
