// Policy: db-structure-producer-home — a schema module is named for the domain that produces its rows.
// Deliberate non-domain producers carry semantic permissions, represented as exact reviewed
// grants keyed on the schema module and producer-home operation. Authored resource trees provide both
// sides of the existence comparison; no filesystem or compiler-project walk is exposed to the policy.
import { defineGate } from "../contract/policy.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { reportReviewedGrantFileCandidates } from "../lib/reviewed-grant-findings.ts";

const SCHEMA_REL = "packages/db/src/schema";
const DOMAIN_REL = "packages/server/src/domain";
const RESERVED = new Set(["users", "audit", "custom-types", "relations"]);
const TS_EXTENSION_LENGTH = 3;
const OPERATION = "non-domain-schema-producer";
const MESSAGE = "a schema module has no same-named producer domain; non-domain producer ownership requires an exact reviewed grant. (tooling/src/verify/gates/GATE-AUTHORING.md)";
const FIX = "rename the schema module for its producer, add the producer domain, or take an exact reviewed grant for a deliberate non-domain producer.";

function topLevelSchema(path: string): string | undefined {
  if (!(path.startsWith(`${SCHEMA_REL}/`) && path.endsWith(".ts"))) {
    return;
  }
  const tail = path.slice(SCHEMA_REL.length + 1);
  return tail.includes("/") || tail === "index.ts" ? undefined : tail.slice(0, -TS_EXTENSION_LENGTH);
}

export const gate = defineGate({
  id: "db-structure-producer-home",
  family: "db-structure",
  authority: "reviewed-grant",
  severity: "error",
  population: { of: "none", why: "schema and server authored-tree resources are the complete producer-home evidence plane" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "authored-tree", id: "db-schema" },
    { kind: "authored-tree", id: "server" },
  ],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const schemas = readyResourceValue(ctx.resources.authoredTree("db-schema"));
      const server = readyResourceValue(ctx.resources.authoredTree("server"));
      const paths = new Set(server.map((entry) => entry.path));
      const candidates = schemas.flatMap((entry) => {
        const name = entry.kind === "file" ? topLevelSchema(entry.path) : undefined;
        if (name === undefined || RESERVED.has(name)) {
          return [];
        }
        const prefix = `${DOMAIN_REL}/${name}`;
        if ([...paths].some((path) => path === prefix || path.startsWith(`${prefix}/`))) {
          return [];
        }
        return [{ file: entry.path, line: 1, subject: entry.path, operation: OPERATION, note: name }];
      });
      reportReviewedGrantFileCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: MESSAGE });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      grant: { subject: "packages/db/src/schema/nowhere.ts", operation: OPERATION },
      files: {
        "packages/db/src/schema/index.ts": 'export * from "./nowhere.ts";\n',
        "packages/db/src/schema/nowhere.ts": "export const t = 1;\n",
        "packages/server/src/domain/other/index.ts": "export const x = 1;\n",
      },
      expect: { count: 1 },
      why: "a schema module with neither a same-named domain nor a reviewed non-domain producer ruling",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/db/src/schema/index.ts": 'export * from "./thing.ts";\n',
        "packages/db/src/schema/thing.ts": "export const t = 1;\n",
        "packages/server/src/domain/thing/index.ts": "export const x = 1;\n",
      },
      why: "the schema module has its same-named producer domain",
    },
  ],
});
