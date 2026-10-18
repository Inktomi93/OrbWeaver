// D328: direct owned-ID and shallow FK regressions, not runtime authorization or SQL containment.
// Helper, carrier and editable-builder questions are anchored UNKNOWN advisories, never inferred safe.
// Family tenancy-scope shares the schema class/FK registry; the complete @server population is unchanged.
import type { AsExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { DrizzleCallEvidence } from "../../floor/code-facts/drizzle-evidence-contract.ts";
import { drizzleExportOf } from "../../floor/code-facts/drizzle-table-ref.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import type { DirectOwnerReadInputs, DirectOwnerReadScope, ReadAnchor } from "../contract/tenancy.ts";
import { drizzleSchemaDataFact, drizzleSchemaIdentityFact } from "../lib/schema-fact.ts";
import {
  directOwnerRead,
  directOwnerReadAnchor,
  directOwnerReadInputs,
  hasEveryOwnerAuthority,
  hasUnauthorizedEveryOwnerMint,
} from "../lib/tenancy-direct-read.ts";
import { foreignKeyEdges, ownerScopedTableIdents, schemaTableIndex, scopeParentsOfDerivedTables } from "../lib/tenancy-scope.ts";
import { reportBlindWhenEmpty } from "../lib/tenancy-scope-blind.ts";
import { waivableCoordinate } from "../lib/waivable-coordinate.ts";

const MINT_MESSAGE = "every-owner authority may be minted only by the runner for a NULL-owner row or by its separately admitted count-only estimate door";

function directScope(ctx: GatePolicyContext, inputs: DirectOwnerReadInputs): DirectOwnerReadScope {
  const fact = ctx.fact(drizzleSchemaDataFact);
  recordReadySchemaFact(ctx, fact);
  const identity = ctx.fact(drizzleSchemaIdentityFact);
  if (identity.status !== "ready") {
    throw new Error("direct owner-read schema identities are " + identity.status);
  }
  const index = schemaTableIndex(fact.value);
  if (
    identity.value.tables.length !== index.idents.size ||
    identity.value.tables.some(
      (table) => !index.idents.has(table.identity.declarationName) || index.identBySqlName.get(table.sqlName) !== table.identity.declarationName,
    )
  ) {
    throw new Error("direct owner-read schema identity disagrees with its full schema");
  }
  const calls = inputs.calls.length === 0 ? new Map<Node, DrizzleCallEvidence>() : ctx.nativeTypes?.drizzleEvidence(inputs.calls, "called-member");
  const columns = inputs.columns.length === 0 ? new Map<Node, DrizzleCallEvidence>() : ctx.nativeTypes?.drizzleEvidence(inputs.columns, "column");
  if (calls === undefined || columns === undefined) {
    throw new Error("direct owner-read native facts are unavailable");
  }
  const ownerTables = ownerScopedTableIdents(fact.value);
  reportBlindWhenEmpty(ctx, fact, ownerTables, BLIND);
  return { calls, columns, index, ownerTables, fkEdges: foreignKeyEdges(fact.value), derivedParents: scopeParentsOfDerivedTables(fact.value) };
}

function reportAnchor(ctx: GatePolicyContext, anchor: ReadAnchor, scope: DirectOwnerReadScope): void {
  if (hasEveryOwnerAuthority(anchor.call)) {
    ctx.report.analysis(anchor.table, { kind: "supported" });
    return;
  }
  const result = directOwnerRead(anchor, scope);
  if (result.kind === "unknown") {
    ctx.report.analysis(anchor.table, result);
    return;
  }
  ctx.report.analysis(anchor.table, { kind: "supported" });
  if (result.finding !== undefined) {
    ctx.report.node(anchor.table, { token: waivableCoordinate(anchor.table.getText()) ?? anchor.table.getText(), offset: 0, message: result.finding });
  }
}
const MESSAGE = "a direct by-id READ of an ownerId-scoped table has no owner restriction in its visible local filter";
const FIX =
  "put the owner in the WHERE using fetchOwned or an explicit owner predicate; a legitimately authorized system/post-fetch read needs an exact @orb-waive owner-scoped-reads(table): reason naming its runtime authorization door";
const BLIND = "owner-scoped-reads derived ZERO ownerId-class tables from the schema; restore its canonical schema classification";
const PATH = "packages/server/src/domain/persona/persistence/queries.ts";
const SCHEMA = {
  "packages/db/src/schema/persona.ts":
    'import {sqliteTable,text} from "drizzle-orm/sqlite-core"; export const personas=sqliteTable("personas",{id:text("id").primaryKey(),ownerId:text("owner_id")}); export const chats=sqliteTable("chats",{id:text("id").primaryKey(),anchorPersonaId:text("anchor_persona_id").references(()=>personas.id)});',
};
function proof(body: string): Readonly<Record<string, string>> {
  return {
    ...SCHEMA,
    [PATH]:
      'import {eq,and,or,inArray,ne,isNull,sql} from "drizzle-orm"; import {personas,chats} from "@orb/db"; export async function read(db:Db,id:string,ownerId:string,flag:boolean){' +
      body +
      "}",
  };
}
function authorityProof(parameter: string, assertion = ""): Readonly<Record<string, string>> {
  return {
    ...SCHEMA,
    "packages/contracts/src/workloads/execution.ts":
      "declare const brand:unique symbol; export interface EveryOwnerRun{readonly[brand]:true} export interface EveryOwnerEstimate{readonly[brand]:true}",
    [PATH]:
      'import{eq}from"drizzle-orm";import{personas}from"@orb/db";import type{EveryOwnerRun,EveryOwnerEstimate}from"../../../../../contracts/src/workloads/execution.ts";' +
      assertion +
      "export async function read(db:Db,id:string," +
      parameter +
      "){return db.select().from(personas).where(eq(personas.id,id));}",
  };
}

export const gate = defineGate({
  id: "owner-scoped-reads",
  family: "tenancy-scope",
  authority: "ordinary",
  severity: "error",
  population: "@server",
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaDataFact, drizzleSchemaIdentityFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const anchors: ReadAnchor[] = [];
    const assertions: AsExpression[] = [];
    const rawSql: Node[] = [];
    let inputs: DirectOwnerReadInputs = { calls: [], columns: [] };
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression, SyntaxKind.AsExpression, SyntaxKind.TaggedTemplateExpression],
          visit: (node) => {
            if (Node.isAsExpression(node)) {
              assertions.push(node);
              return;
            }
            if (Node.isTaggedTemplateExpression(node)) {
              if (drizzleExportOf(node.getTag()) === "sql") {
                rawSql.push(node);
              }
              return;
            }
            if (!Node.isCallExpression(node)) {
              return;
            }
            const anchor = directOwnerReadAnchor(node);
            if (anchor !== undefined) {
              anchors.push(anchor);
            }
          },
        },
      ],
      prepare: () => {
        inputs = directOwnerReadInputs(anchors);
        if (inputs.calls.length + inputs.columns.length === 0) {
          return;
        }
        if (ctx.nativeTypes === undefined) {
          throw new Error("direct owner-read native context is unavailable");
        }
        if (inputs.calls.length > 0) {
          ctx.nativeTypes.request({ kind: "drizzle-identities", nodes: inputs.calls, mode: "called-member" });
        }
        if (inputs.columns.length > 0) {
          ctx.nativeTypes.request({ kind: "drizzle-identities", nodes: inputs.columns, mode: "column" });
        }
      },
      evaluate: () => {
        for (const assertion of assertions) {
          if (hasUnauthorizedEveryOwnerMint(assertion)) {
            ctx.report.node(assertion, { message: MINT_MESSAGE });
          }
        }
        const scope = directScope(ctx, inputs);
        for (const anchor of anchors) {
          reportAnchor(ctx, anchor, scope);
        }
        for (const sql of rawSql) {
          ctx.report.analysis(sql, { kind: "unknown", reason: "raw SQL is outside the direct owned-ID diagnostic" });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: authorityProof("run?:EveryOwnerRun"),
      expect: { count: 1, token: "personas" },
      why: "optional nominal parameters do not grant the static every-owner admission",
    },
    {
      mode: "types",
      files: authorityProof("run:EveryOwnerRun|null"),
      expect: { count: 1, token: "personas" },
      why: "nullable authority does not grant direct every-owner admission",
    },
    {
      mode: "types",
      files: authorityProof("run:EveryOwnerRun", "export const forged={} as EveryOwnerRun;"),
      expect: { count: 1, messageIncludes: MINT_MESSAGE },
      why: "a direct canonical authority assertion outside the runner/estimate mint is still rejected",
    },
    {
      mode: "types",
      files: proof("return db.select().from(personas).where(eq(personas.id,id));"),
      expect: { count: 1, token: "personas", messageIncludes: "direct by-id" },
      why: "removing the owner conjunct exposes the direct naked-ID regression",
    },
    {
      mode: "types",
      files: proof("return db.select().from(personas).where(inArray(personas.id,[id]));"),
      expect: { count: 1, token: "personas" },
      why: "direct ID arrays owe the same owner restriction",
    },
    {
      mode: "types",
      files: proof("return db.select().from(personas).where(and(eq(personas.id,id),ne(personas.ownerId,ownerId)));"),
      expect: { count: 1, token: "personas" },
      why: "inequality is not an owner restriction",
    },
    {
      mode: "types",
      files: proof("return db.select().from(personas).where(or(and(eq(personas.id,id),eq(personas.ownerId,ownerId)),eq(personas.id,id)));"),
      expect: { count: 1, token: "personas" },
      why: "every explicit OR alternative owes owner syntax",
    },
    {
      mode: "types",
      files: proof("return db.select().from(chats).innerJoin(personas,eq(chats.id,personas.id)).where(eq(chats.id,id));"),
      expect: { count: 1, token: "personas", messageIncludes: "declared FK" },
      why: "an explicit join equality with no declared pointing FK is not inherited scope",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: authorityProof("run:EveryOwnerRun"),
      why: "a required canonical run annotation retains its explicit static admission, not runtime provenance proof",
    },
    {
      mode: "types",
      files: authorityProof("estimate:EveryOwnerEstimate"),
      why: "the separately required canonical estimate annotation retains its static count admission",
    },
    {
      mode: "types",
      files: proof("return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,ownerId)));"),
      why: "a direct owner conjunct is observed without claiming the owner came from this caller",
    },
    {
      mode: "types",
      files: proof("return db.select().from(personas).where(eq(personas.ownerId,ownerId));"),
      why: "readable non-by-ID lists retain their explicit pre-existing limit",
    },
    {
      mode: "types",
      files: proof("const helper=()=>eq(personas.id,id); return db.select().from(personas).where(helper());"),
      why: "helper expansion is UNKNOWN rather than a positive semantic proof; importing tests assert its advisory row",
    },
    {
      mode: "types",
      files: proof("const query=db.select().from(personas).where(eq(personas.id,id)); return query;"),
      why: "an editable/split builder is UNKNOWN rather than interpreted through all consumers",
    },
  ],
});
