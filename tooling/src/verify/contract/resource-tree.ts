import type { CssAtRule, CssRule, CssStatementAtRule } from "../lib/css-rules.ts";

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
  // The two authored trees that are not source packages. `docs` admits the prose corpus the citation and
  // dangling-reference policies judge; `scripts` admits the root script tree. Both exist so those policies
  // can ADMIT the paths whose text they then demand through `authoredText` — a demand-driven text read is
  // parasitic on an acquiring declaration and has no population of its own (`resource-text.ts`).
  docs: "docs",
  scripts: "scripts",
  tooling: "tooling",
} as const;

export type AuthoredTreeId = keyof typeof AUTHORED_TREE_PATHS;

/** One exact authored stylesheet. The raw text stays available because some policies judge literals. */
export interface AuthoredCssFile {
  readonly path: string;
  readonly text: string;
  readonly rules: readonly CssRule[];
  readonly atRules: readonly CssAtRule[];
  /** BLOCKLESS at-rules — `@import`, `@source`, `@charset`, a `;`-terminated `@layer`. Carried beside the
   *  block at-rules because a sheet's IMPORT TOPOLOGY is not expressible in either of the other two fields,
   *  and every consumer that wanted it owned a private regex (`css-rules.ts#CssStatementAtRule`). */
  readonly statements: readonly CssStatementAtRule[];
}
