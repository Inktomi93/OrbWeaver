// Policy: assets-single-writer (D21) — every storeBlob use and every raw assets-table write is an
// explicit, reviewed site. The shared origin reader proves storeBlob's canonical declaration; the shared
// Drizzle call and schema readers prove the write method and table identity. One candidate per file keeps
// grant granularity exact. Central grant liveness replaces the legacy directory stale sweep.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readMemberReference } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import type { SchemaQuery } from "../contract/schema-fact.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { readDrizzleClientCall } from "../lib/drizzle-client-call.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";
import type { SealedHome } from "../lib/sealed-origin.ts";
import { readSealedOrigin, sealedOriginReports } from "../lib/sealed-origin.ts";

const STORE_BLOB_HOME: SealedHome = {
  pathInfix: "/packages/server/src/domain/assets/persistence/queries.ts",
  exportedNames: new Set(["storeBlob"]),
};
const OPERATION = "asset-write-site";
const WRITE_METHODS = new Set(["insert", "update", "delete"]);
const MESSAGE =
  "an assets-table write or storeBlob use exists outside the reviewed CAS-coherence sites; every asset write must remain explicit and singular (D21).";
const FIX = "route the write through the existing domain/assets storeBlob seam, then review the exact calling module if it is a legitimate CAS-coherence site.";

function storeBlobReference(node: MorphNode): MorphNode | undefined {
  if (Node.isImportSpecifier(node)) {
    return node.getName() === "storeBlob" && sealedOriginReports(readSealedOrigin(node, STORE_BLOB_HOME), node) ? node : undefined;
  }
  if (!Node.isCallExpression(node)) {
    return;
  }
  const callee = node.getExpression();
  const member = readMemberReference(callee);
  if (member.kind !== "resolved" || member.value.name !== "storeBlob") {
    return;
  }
  return sealedOriginReports(readSealedOrigin(callee, STORE_BLOB_HOME), callee) ? callee : undefined;
}

function assetWriteCandidate(node: import("ts-morph").CallExpression, schema: SchemaQuery): { readonly node: MorphNode; readonly token: string } | undefined {
  const call = readDrizzleClientCall(node);
  if (call.kind === "foreign" || call.method === null || !WRITE_METHODS.has(call.method)) {
    return;
  }
  const tableNode = node.getArguments()[0];
  if (tableNode === undefined) {
    return;
  }
  const table = schema.table(tableNode);
  return table.kind === "resolved" && table.value.sqlName === "assets" ? { node: call.nameNode ?? node, token: call.method } : undefined;
}

export const gate = defineGate({
  id: "assets-single-writer",
  family: "assets-single-writer",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@server", "@db"], under: ["packages/server/src/**", "packages/db/src/schema/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates = new Map<string, ReviewedGrantCandidate>();
    const calls: import("ts-morph").CallExpression[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            const path = ctx.relativePath(sourceFile);
            const storeBlob = storeBlobReference(node);
            if (storeBlob !== undefined) {
              if (!candidates.has(path)) {
                candidates.set(path, { node: storeBlob, subject: path, operation: OPERATION, token: "storeBlob", offset: 0 });
              }
              return;
            }
            if (Node.isCallExpression(node)) {
              calls.push(node);
            }
          },
        },
      ],
      evaluate: () => {
        const schema = ctx.fact(drizzleSchemaFact).schema();
        recordReadySchemaFact(ctx, schema);
        for (const node of calls) {
          const path = ctx.relativePath(node.getSourceFile());
          const candidate = assetWriteCandidate(node, ctx.fact(drizzleSchemaFact));
          if (candidate !== undefined && !candidates.has(path)) {
            candidates.set(path, { node: candidate.node, subject: path, operation: OPERATION, token: candidate.token, offset: 0 });
          }
        }
        reportReviewedGrantCandidates(ctx.report, [...candidates.values()], { message: MESSAGE, fix: FIX, unreadableMessage: MESSAGE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "packages/server/src/domain/hub/x.ts", operation: OPERATION },
      files: {
        "packages/server/src/domain/assets/persistence/queries.ts": "export async function storeBlob(): Promise<void> {}\n",
        "packages/server/src/domain/hub/x.ts": 'import { storeBlob } from "../assets/persistence/queries.ts";\nstoreBlob();\n',
        "packages/db/src/schema/assets.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const assets = sqliteTable("assets", { id: text("id") });\n',
      },
      expect: { count: 1, token: "storeBlob" },
      why: "a canonical storeBlob import and call in an unreviewed module bypasses the exact CAS site roster",
    },
    {
      mode: "types",
      grant: { subject: "packages/server/src/domain/hub/y.ts", operation: OPERATION },
      files: {
        "packages/db/src/schema/assets.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const assets = sqliteTable("assets", { id: text("id") });\n',
        "packages/server/src/domain/hub/y.ts":
          'import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";\nimport { assets } from "../../../../db/src/schema/assets.ts";\ndeclare const db: BaseSQLiteDatabase<"async", unknown>;\ndb.insert(assets);\n',
      },
      expect: { count: 1, token: "insert" },
      why: "a canonical Drizzle insert targeting the resolved assets table is a governed write even under an aliasable table import",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/assets.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const assets = sqliteTable("assets", { id: text("id") });\n',
        "packages/server/src/domain/character/read.ts": 'import { assets } from "../../../../db/src/schema/assets.ts";\nexport const table = assets;\n',
      },
      why: "an assets-table read is outside the write-only subject",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/other.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const other = sqliteTable("other", { id: text("id") });\n',
        "packages/server/src/domain/hub/y.ts":
          'import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";\nimport { other } from "../../../../db/src/schema/other.ts";\ndeclare const db: BaseSQLiteDatabase<"async", unknown>;\ndb.insert(other);\n',
      },
      why: "a Drizzle write to another resolved table is outside this policy's subject",
    },
  ],
});
