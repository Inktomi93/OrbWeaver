// Warning successor for the one tracked open-JSON parity debt. The hard sibling owns all other subjects.
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { isOpenJsonDeferred } from "../lib/open-json-authority.ts";
import { openJsonParityFact } from "../lib/open-json-parity-fact.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";

const MESSAGE =
  "messageVariants.metadata has a named reasoning_duration reader but no proven live-turn writer; issue #184 owns the product decision and repair.";
const FIX = "resolve #184 by stamping reasoning_duration on live turns or sourcing the statistic from a typed first-class column.";

export const gate = defineGate({
  id: "open-json-column-key-parity-deferred",
  family: "open-json-column-key-parity",
  authority: "hard",
  severity: "warning",
  workItem: 184,
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
      expect: { count: 1, messageIncludes: "messageVariants.metadata" },
      why: "the live unresolved #184 seam remains visible as a warning with explicit issue authority",
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
      why: "an untracked parity violation belongs to the hard sibling and is not downgraded by this warning policy",
    },
  ],
});
