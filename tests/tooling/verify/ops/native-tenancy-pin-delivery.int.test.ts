// Generic native-service contracts remain independent of the D328 partial owner-read diagnostic.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ENTRY, nativeOwnerReadFixture as fixture, HELPER } from "@orb/testkit/node/native-owner-read-fixture.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { CallExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { beforeEach, describe, vi } from "vitest";
import { readPredicateArgument } from "../../../../tooling/src/floor/code-facts/drizzle-predicate-argument.ts";
import type { DrizzlePredicate } from "../../../../tooling/src/floor/code-facts/drizzle-predicate-contract.ts";
import { readAnchorOf } from "../../../../tooling/src/floor/code-facts/drizzle-query.ts";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { assertInvocationEvidence, invocationQueryKey } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inputVersion } from "../../../../tooling/src/floor/code-facts/semantic-inventory-inputs.ts";
import { hasInventoryInvocationCoverage, readInventoryInvocationEvidence } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { inventoryString } from "../../../../tooling/src/floor/code-facts/semantic-inventory-records.ts";
import { readInventoryRuntime } from "../../../../tooling/src/floor/code-facts/semantic-inventory-runtime-query.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import type { GatePolicy, GatePolicyHooks } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { NativeTypeRequest } from "../../../../tooling/src/verify/contract/project-context.ts";
import { recordReadySchemaFact } from "../../../../tooling/src/verify/contract/schema-fact.ts";
import type { ReadAnchor, TenancyPinPass } from "../../../../tooling/src/verify/contract/tenancy.ts";
import { gate } from "../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { nativeTenancyPins } from "../../../../tooling/src/verify/lib/native-tenancy-pin.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { drizzleSchemaDataFact } from "../../../../tooling/src/verify/lib/schema-fact.ts";
import { predicateHolds } from "../../../../tooling/src/verify/lib/tenancy-join.ts";
import { isPlainValue } from "../../../../tooling/src/verify/lib/tenancy-pin.ts";
import { schemaTableIndex } from "../../../../tooling/src/verify/lib/tenancy-scope.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";

// These adapter verdicts borrow a real child-produced pinned generation, not Vite execution authority.
beforeEach(async () => {
  const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  const producer = vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
  return (): void => {
    producer.mockRestore();
  };
});

function capturedOwnerRead(root: string): {
  readonly result: ReturnType<typeof runPolicyPass>;
  readonly predicates: ReadonlyMap<number, DrizzlePredicate>;
} {
  const context = projectCtx(root);
  const predicates = new Map<number, DrizzlePredicate>();
  let restore: (() => void) | undefined;
  try {
    const result = runPolicyPass({
      root,
      project: context.project,
      policies: [gate],
      knownPolicies: [gate],
      reviewedGrants: [],
      failOnWarnings: false,
      nativeTypeFacts: () => {
        const session = context.nativeTypeFacts?.();
        if (session === undefined) {
          throw new Error("native relational control has no importing context");
        }
        const read = session.invocationEvidence;
        const spy = vi.spyOn(session, "invocationEvidence").mockImplementation((owner, nodes, plan) => {
          const delivered = read(owner, nodes, plan);
          for (const fact of new Set(delivered.values())) {
            for (const [node, predicate] of fact.drizzleSql?.predicates ?? []) {
              if (node.getSourceFile().getFilePath() === join(root, ENTRY)) {
                predicates.set(node.getStartLineNumber(), predicate);
              }
            }
          }
          return delivered;
        });
        restore = () => spy.mockRestore();
        return session;
      },
    });
    return { result, predicates };
  } finally {
    restore?.();
  }
}

function nativeStorageControl(): GatePolicy {
  return defineGate({
    ...gate,
    id: "native-pin-storage-control",
    fix: "use the registered native pin service, or @orb-waive native-pin-storage-control(position): reason",
    create: (ctx): GatePolicyHooks => {
      const anchors: ReadAnchor[] = [];
      const calls: CallExpression[] = [];
      const references: Node[] = [];
      const pins = nativeTenancyPins(ctx, anchors, calls, references);
      return {
        visitors: [
          {
            kinds: [SyntaxKind.CallExpression, SyntaxKind.Identifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
            visit: (node) => {
              if (!Node.isCallExpression(node)) {
                references.push(node);
                return;
              }
              calls.push(node);
              const anchor = readAnchorOf(node);
              if (anchor !== undefined) {
                anchors.push(anchor);
              }
            },
          },
        ],
        prepare: pins.prepare,
        evaluate: () => {
          const schema = ctx.fact(drizzleSchemaDataFact);
          recordReadySchemaFact(ctx, schema);
          pins.assertSchema(schemaTableIndex(schema.value));
          const anchor = anchors[0];
          if (anchor === undefined) {
            throw new Error("native storage control has no anchor");
          }
          pins.sql.statement(anchor.call);
        },
      };
    },
  });
}

// Independent native predicate and pin service contracts.
test("native canonical predicate bindings retain the imported helper's actual caller operand", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const workspace = createSemanticWorkspace({ root: scratch });
  const source = workspace.primaryOwner(join(scratch, ENTRY))?.sourceFile(join(scratch, ENTRY));
  const where = source
    ?.getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText().endsWith(".where"))
    ?.getArguments()[0];
  if (where === undefined) {
    throw new Error("native predicate fixture has no WHERE root");
  }
  const values: Node[] = [];
  predicateHolds([where], (leaf, bindings) => {
    if (Node.isCallExpression(leaf) && leaf.getSourceFile().getFilePath().endsWith(HELPER)) {
      const actual = readPredicateArgument(leaf.getArguments()[1] ?? leaf, bindings);
      if (actual.kind === "resolved") {
        values.push(actual.value);
      }
    }
    return false;
  });
  expect(values.map((node) => ({ text: node.getText(), file: node.getSourceFile().getFilePath() }))).toEqual([
    { text: "principal.userId", file: join(scratch, ENTRY) },
  ]);
  expect(values.map((node) => isPlainValue(node, { idents: new Set(["personas"]), identBySqlName: new Map([["personas", "personas"]]) }))).toEqual([true]);
});

test(
  "native pin service preserves source rejection, plain Type semantics and lifecycle refusals",
  ({ scratch, repoRoot }) => {
    const expected = [
      ["plain", true],
      ["brand", true],
      ["template", true],
      ["stringChoice", true],
      ["mixed", false],
      ["nullable", false],
      ["untyped", false],
      ["opaque", false],
      ["bottom", false],
      ["ids", true],
      ["readonlyIds", true],
      ["readonlyBrands", true],
      ["nested", false],
      ["unionArray", false],
      ["personas.ownerId", false],
      ["db.select({id:personas.id}).from(personas)", false],
    ] as const;
    fixture(
      scratch,
      repoRoot,
      `
import type{BaseSQLiteDatabase}from"drizzle-orm/sqlite-core";
import{and,eq,inArray}from"drizzle-orm";
import{personas}from"../../../../../db/src/schema/persona.ts";
declare const db:BaseSQLiteDatabase<"async",void>;
export function load(plain:string,brand:string&{readonly brand:"id"},template:\`id_\${string}\`,stringChoice:"one"|"two",mixed:string|number,nullable:string|null,untyped:any,opaque:unknown,bottom:never,ids:string[],readonlyIds:readonly string[],readonlyBrands:readonly (string&{readonly brand:"id"})[],nested:string[][],unionArray:string[]|string){
return db.select().from(personas).where(and(${expected.map(([text]) => `${text === "ids" || text === "readonlyIds" || text === "readonlyBrands" || text === "nested" ? "inArray" : "eq"}(personas.id,${text})`).join(",")}));
}`,
    );
    const context = projectCtx(scratch);
    let held: TenancyPinPass | undefined;
    const operands: Node[] = [];
    const controlId = "native-pin-service-control";
    const control = defineGate({
      ...gate,
      id: controlId,
      fix: `repair the native pin control, or waive with @orb-waive ${controlId}(position): reason`,
      create: (ctx: Parameters<typeof gate.create>[0]): GatePolicyHooks => {
        const anchors: ReadAnchor[] = [];
        const calls: CallExpression[] = [];
        const references: Node[] = [];
        const pins = nativeTenancyPins(ctx, anchors, calls, references);
        held = pins;
        return {
          visitors: [
            {
              kinds: [SyntaxKind.CallExpression, SyntaxKind.Identifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
              visit: (node) => {
                if (!Node.isCallExpression(node)) {
                  references.push(node);
                  return;
                }
                calls.push(node);
                const anchor = readAnchorOf(node);
                if (anchor !== undefined) {
                  anchors.push(anchor);
                }
                if (node.getSourceFile().getFilePath() !== join(scratch, ENTRY)) {
                  return;
                }
                if (["eq", "inArray"].includes(node.getExpression().getText())) {
                  operands.push(...node.getArguments().slice(1, 2));
                }
              },
            },
          ],
          prepare: () => {
            const operand = operands[0];
            if (operand === undefined) {
              throw new Error("native pin control has no operand");
            }
            expect(() => pins.sourceEvidence(operand)).toThrow("not prepared");
            expect(() => pins.sql.statement(operand)).toThrow("not prepared");
            pins.prepare();
            expect(() => pins.sourceEvidence(operand)).toThrow("must be sealed");
            expect(() => pins.sql.statement(operand)).toThrow("must be sealed");
          },
          evaluate: () => {
            const schema = ctx.fact(drizzleSchemaDataFact);
            recordReadySchemaFact(ctx, schema);
            const index = schemaTableIndex(schema.value);
            pins.assertSchema(index);
            const anchor = anchors[0];
            if (anchor === undefined) {
              throw new Error("native SQL control has no read anchor");
            }
            const where = pins.sql.statement(anchor.call).wheres[0];
            if (where === undefined) {
              throw new Error("native SQL control has no WHERE predicate");
            }
            expect(pins.sql.predicate(where).kind).toBe("and");
            expect(operands.map((node) => [node.getText(), isPlainValue(node, index)])).toEqual(expected);
            const readType = Node.prototype.getType;
            const readSymbol = Node.prototype.getSymbol;
            const typePoison = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
              if (this.getProject() === context.project) {
                throw new Error("ordinary direct pin Type read");
              }
              return readType.call(this);
            });
            const symbolPoison = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
              if (this.getProject() === context.project) {
                throw new Error("ordinary direct pin Symbol read");
              }
              return readSymbol.call(this);
            });
            try {
              expect(operands.map((node) => [node.getText(), isPlainValue(node, index, pins)])).toEqual(expected);
              const source = ctx.sourceFile(ENTRY);
              const parameter = source.getFunctionOrThrow("load").getParameters()[0];
              if (parameter === undefined) {
                throw new Error("native pin control parameter is missing");
              }
              expect(() => pins.sourceEvidence(parameter.getNameNode())).toThrow("no unique registered importing context");
              expect(() => pins.sql.predicate(parameter.getNameNode())).toThrow("no unique registered importing context");
              expect(() => pins.prepare()).toThrow("registration is sealed");
              expect(() => pins.assertSchema({ idents: new Set(), identBySqlName: new Map() })).toThrow("disagree");
            } finally {
              symbolPoison.mockRestore();
              typePoison.mockRestore();
            }
          },
        };
      },
    });
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      policies: [control],
      knownPolicies: [control],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.withheldPolicyIds).toEqual([]);
    expect(operands).toHaveLength(expected.length);
    const value = operands[0];
    const service = held;
    if (service === undefined || value === undefined) {
      throw new Error("native pin service was not exercised");
    }
    expect(() => service.sourceEvidence(value)).toThrow("disposed");
    expect(() => service.sql.statement(value)).toThrow("disposed");
  },
  scaledBudget(60_000),
);

test(
  "native pin evidence binds the importing context and complete persisted schema basis",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const context = projectCtx(scratch);
    const control = nativeStorageControl();
    const requests: NativeTypeRequest[] = [];
    let restore: (() => void) | undefined;
    try {
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        policies: [control],
        knownPolicies: [control],
        reviewedGrants: [],
        failOnWarnings: false,
        nativeTypeFacts: () => {
          const session = context.nativeTypeFacts?.();
          if (session === undefined) {
            throw new Error("fixture has no native owner session");
          }
          const register = session.request;
          const spy = vi.spyOn(session, "request").mockImplementation((registeredOwner, registeredQuery) => {
            requests.push(registeredQuery);
            register(registeredOwner, registeredQuery);
          });
          restore = () => spy.mockRestore();
          return session;
        },
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.factErrors).toEqual([]);
      expect(result.authority.withheldPolicyIds).toEqual([]);
    } finally {
      restore?.();
    }
    const request = requests.find(
      (row) => row.kind === "invocation-evidence" && row.plan.typeObservations?.questions?.some((q) => q.kind === "drizzle-predicate-inputs") === true,
    );
    if (request?.kind !== "invocation-evidence") {
      throw new Error("real pin demand was not registered");
    }
    const source = request.nodes[0];
    if (source === undefined) {
      throw new Error("real pin importing source is missing");
    }
    const span = (node: Node): InventorySpan => ({
      file: node.getSourceFile().getFilePath(),
      start: node.getStart(),
      end: node.getEnd(),
      kind: node.getKind(),
    });
    const query = { ...request.plan, node: span(source) };
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const generation = latestInventoryGeneration(db);
    const partitions = readInventoryGeneration(db, generation);
    const partition = partitions.find((row) => row.program === "packages/server/tsconfig.json");
    if (partition === undefined) {
      throw new Error("native pin consumer partition is missing");
    }
    const wire = [...readInventoryInvocationEvidence(db, partition.id, query)][0];
    const basis = wire?.drizzleSourcesBasis;
    if (wire === undefined || basis === undefined || basis === null) {
      throw new Error("native pin lacks its independent complete catalog basis");
    }
    const sqlFacts = wire.drizzleSql;
    if (sqlFacts === undefined || sqlFacts.predicates.length === 0) {
      throw new Error("native SQL facts lack their complete registered predicate roots");
    }
    expect(() => assertInvocationEvidence({ ...wire, drizzleSql: undefined })).toThrow("native SQL facts are missing");
    expect(() => assertInvocationEvidence({ ...wire, drizzleSql: { ...sqlFacts, statements: sqlFacts.statements.slice(1) } })).toThrow(
      "native SQL seed or predicate coverage",
    );
    expect(() => assertInvocationEvidence({ ...wire, drizzleSql: { ...sqlFacts, predicates: sqlFacts.predicates.slice(1) } })).toThrow(
      "native SQL seed or predicate coverage",
    );
    expect(() =>
      assertInvocationEvidence({
        ...wire,
        drizzleSql: { ...sqlFacts, predicates: sqlFacts.predicates.map((row) => ({ ...row, root: sqlFacts.terms.length })) },
      }),
    ).toThrow("native SQL predicate term");
    expect(basis.program).toBe("packages/db/tsconfig.json");
    expect(partition.families).not.toContain("bindings");
    const sources = [...readInventoryRuntime(db, partition.id, "controller").sources, ...readInventoryRuntime(db, partition.id, "worker").sources];
    for (const implementation of ["drizzle-predicate-argument.ts", "drizzle-statement.ts", "drizzle-query.ts"]) {
      expect(
        sources.some((input) => input.path.endsWith("/code-facts/" + implementation) && input.version === inputVersion(input.path, "file")),
        implementation,
      ).toBe(true);
    }
    expect(hasInventoryInvocationCoverage(db, partition.id, [query], basis)).toBe(true);
    expect(hasInventoryInvocationCoverage(db, partition.id, [query], null)).toBe(false);
    expect(hasInventoryInvocationCoverage(db, partition.id, [query], { ...basis, partition: "foreign-catalog" })).toBe(false);
    expect(() => assertInvocationEvidence({ ...wire, drizzleSourcesBasis: undefined })).toThrow("schema basis is missing");
    const changed = {
      ...query,
      typeObservations:
        query.typeObservations === undefined
          ? undefined
          : {
              ...query.typeObservations,
              questions: query.typeObservations.questions?.map((q) =>
                q.predicateContext === undefined ? q : { ...q, predicateContext: { ...q.predicateContext, calls: q.predicateContext.calls.slice(1) } },
              ),
            },
    };
    expect(invocationQueryKey(changed)).not.toBe(invocationQueryKey(query));
    expect(() => assertInvocationEvidence({ ...wire, query: changed })).toThrow("missing or foreign");
    const owner = db
      .prepare("SELECT ordinal FROM inventory_invocation_evidence WHERE partition=? AND key=?")
      .get(partition.id, inventoryString(invocationQueryKey(query)))?.["ordinal"];
    if (typeof owner !== "number") {
      throw new Error("native pin stored query is missing");
    }
    const basisAtom = db
      .prepare(
        "SELECT child.ordinal,child.text FROM inventory_invocation_atom parent JOIN inventory_invocation_atom child ON child.partition=parent.partition AND child.owner=parent.owner AND child.parent=parent.ordinal WHERE parent.partition=? AND parent.owner=? AND parent.key=? AND child.key=?",
      )
      .get(partition.id, owner, inventoryString("drizzleSourcesBasis"), inventoryString("partition"));
    const ordinal = basisAtom?.["ordinal"];
    const original = basisAtom?.["text"];
    if (typeof ordinal !== "number" || typeof original !== "string") {
      throw new Error("native pin catalog identity atom is missing");
    }
    const foreign = inventoryString("foreign-catalog");
    const update = db.prepare("UPDATE inventory_invocation_atom SET text=? WHERE partition=? AND owner=? AND ordinal=? AND text=?");
    expect(update.run(foreign, partition.id, owner, ordinal, original).changes).toBe(1);
    try {
      using reader = inventoryReader(scratch, generation, partitions, { db, dispose: () => undefined });
      expect(() => reader.invocationEvidence(source, partition.program, request.plan)).toThrow("catalog basis is outside the pinned generation");
    } finally {
      expect(update.run(original, partition.id, owner, ordinal, foreign).changes).toBe(1);
    }
    expect(hasInventoryInvocationCoverage(db, partition.id, [query], basis)).toBe(true);
  },
  scaledBudget(60_000),
);

describe("canonical schema prerequisites remain hard failures", () => {
  test(
    "an ambiguous relational catalog withholds authority before publishing predicate bindings",
    ({ scratch, repoRoot }) => {
      fixture(
        scratch,
        repoRoot,
        `import type{LibSQLDatabase}from"drizzle-orm/libsql";import*as schema from"../../../../../db/src/schema/persona.ts";import{personas as otherPersonas}from"../../../../../db/src/schema/other.ts";void otherPersonas;
declare const db:LibSQLDatabase<typeof schema>;
export async function read(id:string,owner:string){return db.query.personas.findFirst({where:(p,{and,eq})=>and(eq(p.id,id),eq(p.ownerId,owner))});}
`,
      );
      writeFileSync(
        join(scratch, "packages/db/src/schema/other.ts"),
        'import{sqliteTable,text}from"drizzle-orm/sqlite-core";export const personas=sqliteTable("other_personas",{id:text("id").primaryKey(),ownerId:text("owner_id").notNull()});',
      );
      writeFileSync(
        join(scratch, "packages/db/tsconfig.json"),
        JSON.stringify({ extends: "../../tsconfig.json", files: ["src/schema/persona.ts", "src/schema/other.ts"] }),
      );
      const { result, predicates } = capturedOwnerRead(scratch);
      expect(result.toolErrors).toEqual([
        { policyId: gate.id, phase: "evaluate", message: "direct owner-read schema identity disagrees with its full schema" },
      ]);
      expect(result.factErrors).toEqual([]);
      expect(result.authority.withheldPolicyIds).toEqual([gate.id]);
      expect(result.authority.effectiveFindings).toEqual([]);
      expect(predicates.size).toBe(0);
    },
    scaledBudget(60_000),
  );

  test("a relational owner predicate without a native importing context withholds the policy", ({ scratch, repoRoot }) => {
    fixture(
      scratch,
      repoRoot,
      `import type{LibSQLDatabase}from"drizzle-orm/libsql";import*as schema from"../../../../../db/src/schema/persona.ts";
declare const db:LibSQLDatabase<typeof schema>;
export async function read(id:string,owner:string){return db.query.personas.findFirst({where:(p,{and,eq})=>and(eq(p.id,id),eq(p.ownerId,owner))});}
`,
    );
    const context = projectCtx(scratch);
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      policies: [gate],
      knownPolicies: [gate],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.factErrors).toEqual([
      { factId: "drizzle-schema-data", phase: "create", message: "native type fact context is unavailable" },
      { factId: "drizzle-schema-identities", phase: "create", message: "native type fact context is unavailable" },
    ]);
    expect(result.toolErrors).toEqual([
      { policyId: gate.id, phase: "evaluate", message: "declared fact failed: drizzle-schema-data: create: native type fact context is unavailable" },
    ]);
    expect(result.authority.withheldPolicyIds).toEqual([gate.id]);
    expect(result.authority.effectiveFindings).toEqual([]);
  });
});

describe("D328 unsupported owner-consumer flows are explicit UNKNOWN coverage", () => {
  test(
    "relational callbacks, local table aliases and raw OR remain explicit owner-consumer unknowns",
    ({ scratch, repoRoot }) => {
      fixture(
        scratch,
        repoRoot,
        `import type{LibSQLDatabase}from"drizzle-orm/libsql";
import{and,eq,sql}from"drizzle-orm";
import*as schema from"../../../../../db/src/schema/persona.ts";
const{personas}=schema;declare const db:LibSQLDatabase<typeof schema>;
export const safe=async(id:string,owner:string)=>{const owned=eq(personas.ownerId,owner);return db.select().from(personas).where(and(eq(personas.id,id),owned));};
export const unsafe=async(id:string,owner:string)=>db.select().from(personas).where(and(eq(personas.ownerId,owner),sql\`1 OR \${personas.id}=\${id}\`));
export async function scoped(id:string,owner:string){return db.query.personas.findFirst({where:(p,{and,eq})=>and(eq(p.id,id),eq(p.ownerId,owner))});}
export async function idOnly(id:string){return db.query.personas.findFirst({where:(p,{eq})=>eq(p.id,id)});}
`,
      );
      const { result, predicates } = capturedOwnerRead(scratch);
      expect(result.toolErrors).toEqual([]);
      expect(result.factErrors).toEqual([]);
      expect(result.authority.withheldPolicyIds).toEqual([]);
      expect(result.authority.effectiveFindings).toEqual([]);
      expect(result.policies[0]?.analysis?.unknown.map(({ line }) => line)).toEqual(expect.arrayContaining([5, 6, 7, 8]));
      expect(predicates.size).toBe(0);
    },
    scaledBudget(60_000),
  );

  test(
    "relational mutation, renamed operators and borrowed signatures are not certified by partial owner analysis",
    ({ scratch, repoRoot }) => {
      fixture(
        scratch,
        repoRoot,
        `import type{LibSQLDatabase}from"drizzle-orm/libsql";import{eq as nativeEq,type SQL}from"drizzle-orm";import*as schema from"../../../../../db/src/schema/persona.ts";
declare const db:LibSQLDatabase<typeof schema>;
declare function leak(operator:typeof nativeEq):SQL;
export async function renamed(id:string,owner:string){return db.query.personas.findFirst({where:(p,{and:both,eq:same})=>both(same(p.id,id),same(p.ownerId,owner))});}
export async function rowWrite(id:string,owner:string){return db.query.personas.findFirst({where:(p,{and,eq})=>(Object.assign(p.ownerId,{name:"id"}),and(eq(p.id,id),eq(p.ownerId,owner)))});}
export async function operatorWrite(id:string,owner:string){return db.query.personas.findFirst({where:(p,{and,eq})=>(eq=nativeEq,and(eq(p.id,id),eq(p.ownerId,owner)))});}
export async function renamedWrite(id:string,owner:string){return db.query.personas.findFirst({where:(p,{and,eq:op})=>(op=nativeEq,and(op(p.id,id),op(p.ownerId,owner)))});}
export async function escaped(id:string,owner:string){return db.query.personas.findFirst({where:(p,{and,eq:op})=>and(op(p.id,id),op(p.ownerId,owner),leak(op))});}
declare const foreign:{query:{personas:{findFirst:typeof db.query.personas.findFirst}}};
export async function borrowed(id:string,owner:string){return foreign.query.personas.findFirst({where:(p,{and,eq})=>and(eq(p.id,id),eq(p.ownerId,owner))});}
`,
      );
      const { result, predicates } = capturedOwnerRead(scratch);
      expect(result.toolErrors).toEqual([]);
      expect(result.factErrors).toEqual([]);
      expect(result.authority.withheldPolicyIds).toEqual([]);
      expect(result.authority.effectiveFindings).toEqual([]);
      expect(result.policies[0]?.analysis?.unknown.map(({ line }) => line)).toEqual(expect.arrayContaining([4, 5, 6, 7, 8, 10]));
      expect(predicates.size).toBe(0);
    },
    scaledBudget(60_000),
  );

  test(
    "an unsupported helper is unknown without consulting SQL containment or ordinary carrier semantics",
    ({ scratch, repoRoot }) => {
      fixture(scratch, repoRoot);
      const context = projectCtx(scratch);
      const readType = Node.prototype.getType;
      const readSymbol = Node.prototype.getSymbol;
      const previousLimit = Error.stackTraceLimit;
      Error.stackTraceLimit = 100;
      const sqlFrame = (): boolean => /\/drizzle-(?:sql[^/]*|predicate|statement)\.ts:/u.test(new Error("SQL frame").stack ?? "");
      const typePoison = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
        if (this.getProject() === context.project && sqlFrame()) {
          throw new Error("ordinary SQL containment Type read");
        }
        return readType.call(this);
      });
      const symbolPoison = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
        if (this.getProject() === context.project && sqlFrame()) {
          throw new Error("ordinary SQL containment Symbol read");
        }
        return readSymbol.call(this);
      });
      try {
        const result = runPolicyPass({
          root: scratch,
          project: context.project,
          ...nativeTypeFactOptions(context),
          policies: [gate],
          knownPolicies: [gate],
          reviewedGrants: [],
          failOnWarnings: false,
        });
        expect(result.toolErrors).toEqual([]);
        expect(result.factErrors).toEqual([]);
        expect(result.authority.withheldPolicyIds).toEqual([]);
        expect(result.authority.effectiveFindings).toEqual([]);
        expect(result.policies[0]?.analysis?.unknown.length).toBeGreaterThan(0);
      } finally {
        symbolPoison.mockRestore();
        typePoison.mockRestore();
        Error.stackTraceLimit = previousLimit;
      }
    },
    scaledBudget(60_000),
  );

  test(
    "unknown helpers do not request native SQL invocation facts",
    ({ scratch, repoRoot }) => {
      fixture(scratch, repoRoot);
      const context = projectCtx(scratch);
      let restore: (() => void) | undefined;
      try {
        const result = runPolicyPass({
          root: scratch,
          project: context.project,
          policies: [gate],
          knownPolicies: [gate],
          reviewedGrants: [],
          failOnWarnings: false,
          nativeTypeFacts: () => {
            const session = context.nativeTypeFacts?.();
            if (session === undefined) {
              throw new Error("fixture has no native owner session");
            }
            const read = session.invocationEvidence;
            const spy = vi
              .spyOn(session, "invocationEvidence")
              .mockImplementation(
                (owner, nodes, plan) => new Map([...read(owner, nodes, plan)].map(([node, fact]) => [node, { ...fact, drizzleSql: undefined }])),
              );
            restore = () => spy.mockRestore();
            return session;
          },
        });
        expect(result.factErrors).toEqual([]);
        expect(result.toolErrors).toEqual([]);
        expect(result.factErrors).toEqual([]);
        expect(result.authority.withheldPolicyIds).toEqual([]);
        expect(result.authority.effectiveFindings).toEqual([]);
        expect(result.policies[0]?.analysis?.unknown.length).toBeGreaterThan(0);
      } finally {
        restore?.();
      }
    },
    scaledBudget(60_000),
  );

  test(
    "helper alternatives, optional SQL, scalar aliases and mutable SQL carriers remain unknown",
    ({ scratch, repoRoot }) => {
      fixture(
        scratch,
        repoRoot,
        `
import type {BaseSQLiteDatabase} from "drizzle-orm/sqlite-core";
import {and, eq, sql, type SQL} from "drizzle-orm";
import {personas} from "../../../../../db/src/schema/persona.ts";
import {owned} from "./predicate.ts";
declare const db: BaseSQLiteDatabase<"async", void>;
function identity(value: SQL | undefined) { return value; }
export async function safe(id: string, owner: string) {
  return db.select().from(personas).where(and(eq(personas.id, id), owned(owner)));
}
export async function optional(id: string, owner: string, flag: boolean) {
  return db.select().from(personas).where(and(eq(personas.id, id), identity(flag ? eq(personas.ownerId, owner) : undefined)));
}
export async function aliased(id: string, owner: string) {
  const held = owner;
  return db.select().from(personas).where(and(eq(personas.id, id), owned(held)));
}
export async function opaque(id: string, owner: string, emitted: SQL) {
  return db.select().from(personas).where(and(eq(personas.id, id), eq(personas.ownerId, owner), emitted));
}
export async function mutated(id: string, owner: string) {
  const child = sql\`1\`;
  child.append(sql.raw(id));
  return db.select().from(personas).where(and(eq(personas.id, id), eq(personas.ownerId, owner), child));
}
`,
      );
      const context = projectCtx(scratch);
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        policies: [gate],
        knownPolicies: [gate],
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.factErrors).toEqual([]);
      expect(result.authority.withheldPolicyIds).toEqual([]);
      expect(result.authority.effectiveFindings).toEqual([]);
      expect(result.policies[0]?.analysis?.unknown.map(({ line }) => line)).toEqual(expect.arrayContaining([9, 12, 16, 19, 24]));
    },
    scaledBudget(60_000),
  );

  test(
    "unsupported helper parameters are unknown rather than classified through ordinary carrier Types",
    ({ scratch, repoRoot }) => {
      fixture(scratch, repoRoot);
      const context = projectCtx(scratch);
      const readType = Node.prototype.getType;
      const poison = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
        if (this.getProject() === context.project && this.getText() === "principal.userId") {
          throw new Error(`ordinary supplied tenancy-pin Type read\n${new Error("ordinary pin caller").stack ?? "stack unavailable"}`);
        }
        return readType.call(this);
      });
      try {
        const result = runPolicyPass({
          root: scratch,
          project: context.project,
          ...nativeTypeFactOptions(context),
          policies: [gate],
          knownPolicies: [gate],
          reviewedGrants: [],
          failOnWarnings: false,
        });
        expect(result.toolErrors).toEqual([]);
        expect(result.factErrors).toEqual([]);
        expect(result.authority.withheldPolicyIds).toEqual([]);
        expect(result.authority.effectiveFindings).toEqual([]);
        expect(result.policies[0]?.analysis?.unknown.length).toBeGreaterThan(0);
      } finally {
        poison.mockRestore();
      }
    },
    scaledBudget(60_000),
  );

  test(
    "the partial owner consumer does not enter generic pin classification for helper operands",
    async ({ scratch, repoRoot }) => {
      const tenancyPin = await import("../../../../tooling/src/verify/lib/tenancy-pin.ts");
      fixture(scratch, repoRoot);
      const context = projectCtx(scratch);
      const readType = Node.prototype.getType;
      const readSymbol = Node.prototype.getSymbol;
      const plain = vi.spyOn(tenancyPin, "isPlainValue");
      const previousLimit = Error.stackTraceLimit;
      Error.stackTraceLimit = 100;
      const pinFrame = (): boolean => new Error("pin frame").stack?.includes("/tooling/src/verify/lib/tenancy-pin.ts:") === true;
      const typePoison = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
        if (this.getProject() === context.project && pinFrame()) {
          throw new Error("ordinary pin-scoped Type read");
        }
        return readType.call(this);
      });
      const symbolPoison = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
        if (this.getProject() === context.project && pinFrame()) {
          throw new Error("ordinary pin-scoped Symbol read");
        }
        return readSymbol.call(this);
      });
      try {
        const result = runPolicyPass({
          root: scratch,
          project: context.project,
          ...nativeTypeFactOptions(context),
          policies: [gate],
          knownPolicies: [gate],
          reviewedGrants: [],
          failOnWarnings: false,
        });
        expect(result.toolErrors).toEqual([]);
        expect(result.factErrors).toEqual([]);
        expect(result.authority.withheldPolicyIds).toEqual([]);
        expect(result.authority.effectiveFindings).toEqual([]);
        expect(plain).not.toHaveBeenCalled();
        expect(result.policies[0]?.analysis?.unknown.length).toBeGreaterThan(0);
      } finally {
        symbolPoison.mockRestore();
        typePoison.mockRestore();
        plain.mockRestore();
        Error.stackTraceLimit = previousLimit;
      }
    },
    scaledBudget(60_000),
  );

  test(
    "unsupported helpers require no native value-source invocation evidence",
    ({ scratch, repoRoot }) => {
      fixture(scratch, repoRoot);
      const context = projectCtx(scratch);
      let restore: (() => void) | undefined;
      try {
        const result = runPolicyPass({
          root: scratch,
          project: context.project,
          policies: [gate],
          knownPolicies: [gate],
          reviewedGrants: [],
          failOnWarnings: false,
          nativeTypeFacts: () => {
            const session = context.nativeTypeFacts?.();
            if (session === undefined) {
              throw new Error("fixture has no native owner session");
            }
            const read = session.invocationEvidence;
            const spy = vi.spyOn(session, "invocationEvidence").mockImplementation((owner, nodes, plan) => {
              const delivered = read(owner, nodes, plan);
              const stripped = [...new Set(delivered.values())].map((fact) => {
                const { drizzleValueSources: _sources, ...rest } = fact;
                return [fact, rest] as const;
              });
              const replacements = new Map(stripped);
              return new Map(
                [...delivered].map(([node, fact]) => {
                  const replacement = replacements.get(fact);
                  if (replacement === undefined) {
                    throw new Error("fixture lost a delivered native fact");
                  }
                  return [node, replacement];
                }),
              );
            });
            restore = () => spy.mockRestore();
            return session;
          },
        });
        expect(result.factErrors).toEqual([]);
        expect(result.toolErrors).toEqual([]);
        expect(result.factErrors).toEqual([]);
        expect(result.authority.withheldPolicyIds).toEqual([]);
        expect(result.authority.effectiveFindings).toEqual([]);
        expect(result.policies[0]?.analysis?.unknown.length).toBeGreaterThan(0);
      } finally {
        restore?.();
      }
    },
    scaledBudget(60_000),
  );
});
