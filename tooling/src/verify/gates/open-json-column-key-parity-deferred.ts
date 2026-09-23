// Warning successor for the tracked open-JSON parity debt. The reviewed-grant error sibling owns other subjects.
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { isOpenJsonDeferred } from "../lib/open-json-authority.ts";
import { openJsonParityFact } from "../lib/open-json-parity-fact.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";

const MESSAGE =
  "messageVariants.metadata has a named reasoning_duration reader but no proven live-turn writer; work item 64 owns the product decision and repair. (tooling/src/verify/gates/GATE-AUTHORING.md)";
const FIX = "resolve work item 64 by stamping reasoning_duration on live turns or sourcing the statistic from a typed first-class column.";

export const gate = defineGate({
  id: "open-json-column-key-parity-deferred",
  family: "open-json-column-key-parity",
  authority: "hard",
  severity: "warning",
  workItem: 64,
  population: { in: ["@db", "@server"], under: ["packages/db/src/schema/**", "packages/server/src/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [openJsonParityFact, drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const schema = ctx.fact(drizzleSchemaFact).schema();
      recordReadySchemaFact(ctx, schema);
      const analysis = ctx.fact(openJsonParityFact).analyze(schema.value);
      for (const { hit, token } of analysis.verdict.violations) {
        if (isOpenJsonDeferred(token)) {
          ctx.report.node(hit.node, { message: `${MESSAGE} Subject: ${token}.`, fix: FIX });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const messageVariants = sqliteTable("message_variants", { metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>() });\n',
        "packages/server/src/domain/chat/persistence/write.ts":
          "export async function write(db, metadata: Record<string, unknown>) { await db.insert(messageVariants).values({ metadata }); }\n",
        "packages/server/src/domain/stats/read.ts":
          "export async function read(db) { return db.all(sql`select json_extract(v.metadata, '$.reasoning_duration') from message_variants v`); }\n",
      },
      expect: { count: 1 },
      why: "the live unresolved reasoning-duration seam remains visible as a warning owned by work item 64",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/widget.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const widgets = sqliteTable("widgets", { residue: text("residue", { mode: "json" }).$type<Record<string, unknown>>() });\n',
        "packages/server/src/domain/widget/write.ts": "export async function write(db) { await db.insert(widgets).values({ residue: { model: 1 } }); }\n",
        "packages/server/src/domain/widget/read.ts":
          "export async function read(db) { return db.all(sql`select json_extract(w.residue, '$.missing') from widgets w`); }\n",
      },
      why: "an untracked parity violation belongs to the error sibling and is not downgraded by this warning policy",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/index.ts":
          'import { sqliteTable } from "drizzle-orm/sqlite-core";\nconst columns = makeColumns();\nexport const notes = sqliteTable("notes", columns);\n',
      },
      expect: { messageIncludes: "drizzle schema fact unresolved" },
      why: "THE SUPPLY REFUSAL (law §6.3), shared with the `-health` sibling: an unreadable canonical schema declaration refuses the drizzle-schema fact, so the #184 seam can never read as resolved over a schema nobody read",
    },
  ],
});
