// Policy: assets-single-writer (D21) — every storeBlob use and every raw assets-table write is an
// explicit, reviewed site. The shared origin reader proves storeBlob's canonical declaration; the shared
// Drizzle call and schema readers prove the write method and table identity. One candidate per file keeps
// grant granularity exact. Central grant liveness replaces the legacy directory stale sweep.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { DrizzleCallEvidence } from "../../floor/code-facts/drizzle-evidence-contract.ts";
import { readMemberReferenceWithName, referenceResolutionServices } from "../../floor/code-facts/reference-fact.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { classifyDrizzleClientCall } from "../lib/drizzle-client-call.ts";
import { requiredInvocationFact } from "../lib/native-invocation.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { drizzleSchemaIdentityFact } from "../lib/schema-fact.ts";
import type { SealedHome } from "../lib/sealed-origin.ts";
import {
  possibleSealedReference,
  prepareSealedReference,
  readSealedOrigin,
  sealedOriginReports,
  sealedReferenceAnchor,
  sealedReferenceServices,
} from "../lib/sealed-origin.ts";

const STORE_BLOB_HOME: SealedHome = {
  pathInfix: "/packages/server/src/domain/assets/persistence/queries.ts",
  exportedNames: new Set(["storeBlob"]),
};
const OPERATION = "asset-write-site";
const WRITE_METHODS = new Set(["insert", "update", "delete"]);
const MESSAGE =
  "an assets-table write or storeBlob use exists outside the reviewed CAS-coherence sites; every asset write must remain explicit and singular (D21). (tooling/src/verify/gates/GATE-AUTHORING.md)";
const FIX = "route the write through the existing domain/assets storeBlob seam, then review the exact calling module if it is a legitimate CAS-coherence site.";

function storeBlobReference(ctx: GatePolicyContext, node: MorphNode): MorphNode | undefined {
  const services = sealedReferenceServices(ctx, node);
  if (Node.isImportSpecifier(node)) {
    return node.getName() === "storeBlob" && sealedOriginReports(readSealedOrigin(node, STORE_BLOB_HOME, services.moduleOrigin), node, services.declarations)
      ? node
      : undefined;
  }
  const member = readMemberReferenceWithName(node, services.readComputedName);
  if (member.kind !== "resolved" || member.value.name !== "storeBlob") {
    return;
  }
  return sealedOriginReports(readSealedOrigin(node, STORE_BLOB_HOME, services.moduleOrigin), node, services.declarations) ? node : undefined;
}

function assetWriteCandidate(
  node: import("ts-morph").CallExpression,
  evidence: DrizzleCallEvidence,
): { readonly node: MorphNode; readonly token: string } | undefined {
  if (evidence.mode !== "called-member") {
    throw new Error("assets-single-writer received a foreign native projection");
  }
  const call = classifyDrizzleClientCall(evidence.member);
  if (call.kind === "foreign" || call.method === null || !WRITE_METHODS.has(call.method)) {
    return;
  }
  return evidence.table?.kind === "resolved" && evidence.table.value.sqlName === "assets" ? { node: node.getExpression(), token: call.method } : undefined;
}

export const gate = defineGate({
  id: "assets-single-writer",
  family: "assets-single-writer",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@server", "@db"], under: ["packages/server/src/**", "packages/db/src/schema/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaIdentityFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates = new Map<string, ReviewedGrantCandidate>();
    const calls: import("ts-morph").CallExpression[] = [];
    const stores: MorphNode[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.CallExpression],
          visit: (node) => {
            const reference = Node.isCallExpression(node) ? referenceResolutionServices.unwrapExpression(node.getExpression()) : node;
            if (possibleSealedReference(reference, STORE_BLOB_HOME.exportedNames)) {
              stores.push(reference);
              prepareSealedReference(ctx, reference);
            }
            if (Node.isCallExpression(node) && possibleSealedReference(reference, WRITE_METHODS)) {
              if (ctx.nativeTypes === undefined) {
                throw new Error("native asset-write context is unavailable");
              }
              calls.push(node);
              ctx.nativeTypes.request({ kind: "drizzle-identities", nodes: [node], mode: "called-member" });
            }
          },
        },
      ],
      evaluate: () => {
        const schema = ctx.fact(drizzleSchemaIdentityFact);
        recordReadySchemaFact(ctx, schema);
        for (const node of stores) {
          const storeBlob = storeBlobReference(ctx, node);
          const path = ctx.relativePath(node.getSourceFile());
          if (storeBlob !== undefined && !candidates.has(path)) {
            candidates.set(path, { ...sealedReferenceAnchor(storeBlob, "storeBlob"), subject: path, operation: OPERATION });
          }
        }
        if (ctx.nativeTypes === undefined) {
          throw new Error("native asset-write context is unavailable");
        }
        const facts = ctx.nativeTypes.drizzleEvidence(calls, "called-member");
        for (const node of calls) {
          const path = ctx.relativePath(node.getSourceFile());
          const candidate = assetWriteCandidate(node, requiredInvocationFact(facts, node));
          if (candidate !== undefined && !candidates.has(path)) {
            candidates.set(path, { ...sealedReferenceAnchor(candidate.node, candidate.token), subject: path, operation: OPERATION });
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
